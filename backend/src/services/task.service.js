const pool = require("../config/db");
const notificationService = require("./notification.service");

async function createTask({
  title, description, category, section,
  price, location, urgent, createdBy, imageUrls = []
}) {
  const [result] = await pool.execute(
    `INSERT INTO tasks (
       title, description, category, section,
       price, location, urgent, created_by, image_urls
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title.trim(), description.trim(), category.trim(),
      section || "General", Number(price), location.trim(),
      urgent ? 1 : 0, createdBy,
      imageUrls.length ? JSON.stringify(imageUrls) : null
    ]
  );
  return getTaskById(result.insertId);
}

async function getAllTasks() {
  /* The marketplace is for work that can still be accepted.  Completed and
     cancelled tasks belong in the owner's history, not the public feed. */
  const [rows] = await pool.execute(
    `SELECT
       t.id, t.title, t.description, t.category, t.section,
       t.price, t.location, t.status, t.urgent,
       t.created_by, t.accepted_by, t.created_at,
       t.image_urls,
       u.full_name AS created_by_name,
       u.profile_photo_url AS created_by_profile_photo,
       p.status AS payment_status
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN payments p ON t.id = p.task_id
     WHERE t.status = 'Posted'
     ORDER BY t.urgent DESC, t.created_at DESC`
  );

  return rows.map(parseImageUrls);
}

async function acceptTask(taskId, userId) {
  const [taskRows] = await pool.execute(
    `SELECT id, created_by, accepted_by, status, price, title
     FROM tasks WHERE id = ? LIMIT 1`,
    [taskId]
  );

  if (taskRows.length === 0) {
    const error = new Error("Task not found."); error.statusCode = 404; throw error;
  }

  const task = taskRows[0];

  if (Number(task.created_by) === Number(userId)) {
    const error = new Error("You cannot accept your own task."); error.statusCode = 400; throw error;
  }
  if (task.accepted_by) {
    const error = new Error("This task has already been accepted."); error.statusCode = 400; throw error;
  }
  if (task.status !== "Posted") {
    const error = new Error("Only posted tasks can be accepted."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE tasks SET accepted_by = ?, status = 'Accepted' WHERE id = ?`,
    [userId, taskId]
  );

  await pool.execute(
    `INSERT INTO payments (task_id, amount, status) VALUES (?, ?, 'Held')`,
    [taskId, task.price]
  );

  const [userRows] = await pool.execute(
    `SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  const accepterName = userRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: task.created_by,
    title: "Task Accepted",
    message: `${accepterName} accepted your task "${task.title}".`
  });

  return getTaskById(taskId);
}

async function updateTaskStatus(taskId, userId, newStatus) {
  const allowed = ["In Progress", "Completed"];
  if (!allowed.includes(newStatus)) {
    const error = new Error("Invalid status update."); error.statusCode = 400; throw error;
  }

  const [taskRows] = await pool.execute(
    `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE id = ? LIMIT 1`,
    [taskId]
  );

  if (taskRows.length === 0) {
    const error = new Error("Task not found."); error.statusCode = 404; throw error;
  }

  const task = taskRows[0];

  if (!task.accepted_by) {
    const error = new Error("Task must be accepted before status can be updated."); error.statusCode = 400; throw error;
  }
  if (Number(task.accepted_by) !== Number(userId)) {
    const error = new Error("Only the assigned user can update this task."); error.statusCode = 403; throw error;
  }
  if (newStatus === "In Progress" && task.status !== "Accepted") {
    const error = new Error("Only accepted tasks can move to In Progress."); error.statusCode = 400; throw error;
  }
  if (newStatus === "Completed" && task.status !== "In Progress") {
    const error = new Error("Only tasks in progress can be completed."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE tasks SET status = ? WHERE id = ?`, [newStatus, taskId]);

  if (newStatus === "In Progress") {
    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Started",
      message: `Work has started on your task "${task.title}".`
    });
  }

  if (newStatus === "Completed") {
    await pool.execute(
      `UPDATE payments SET status = 'Released' WHERE task_id = ?`, [taskId]
    );
    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Completed",
      message: `Your task "${task.title}" has been completed.`
    });
    await notificationService.createNotification({
      userId: task.accepted_by,
      title: "Task Completed",
      message: `You completed "${task.title}".`
    });
  }

  return getTaskById(taskId);
}

async function cancelTask(taskId, userId) {
  const [taskRows] = await pool.execute(
    `SELECT id, created_by, status FROM tasks WHERE id = ? LIMIT 1`, [taskId]
  );

  if (taskRows.length === 0) {
    const error = new Error("Task not found."); error.statusCode = 404; throw error;
  }

  const task = taskRows[0];

  if (Number(task.created_by) !== Number(userId)) {
    const error = new Error("Only the task creator can cancel this task."); error.statusCode = 403; throw error;
  }
  if (task.status === "In Progress") {
    const error = new Error("Tasks in progress cannot be cancelled."); error.statusCode = 400; throw error;
  }
  if (task.status === "Completed") {
    const error = new Error("Completed tasks cannot be cancelled."); error.statusCode = 400; throw error;
  }
  if (task.status === "Cancelled") {
    const error = new Error("This task is already cancelled."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE tasks SET status = 'Cancelled' WHERE id = ?`, [taskId]);
  return getTaskById(taskId);
}

async function getUserTaskHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT
       t.id, t.title, t.description, t.category, t.section,
       t.price, t.location, t.status, t.urgent,
       t.created_by, t.accepted_by, t.created_at,
       t.image_urls,
       u.full_name AS created_by_name,
       u.profile_photo_url AS created_by_profile_photo,
       p.status AS payment_status
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN payments p ON t.id = p.task_id
     WHERE t.created_by = ? OR t.accepted_by = ?
     ORDER BY t.created_at DESC`,
    [userId, userId]
  );
  return rows.map(parseImageUrls);
}

async function getTaskById(taskId) {
  const [rows] = await pool.execute(
    `SELECT
       t.id, t.title, t.description, t.category, t.section,
       t.price, t.location, t.status, t.urgent,
       t.created_by, t.accepted_by, t.created_at,
       t.image_urls,
       u.full_name AS created_by_name,
       u.profile_photo_url AS created_by_profile_photo,
       p.status AS payment_status
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN payments p ON t.id = p.task_id
     WHERE t.id = ? LIMIT 1`,
    [taskId]
  );
  return parseImageUrls(rows[0]);
}

/*
  Parse image_urls into a plain JS array, regardless of how the DB driver
  handed it back to us.

  - If the `image_urls` column is a MySQL JSON type, mysql2 auto-parses it
    into a real array before we ever see it — in that case we must NOT
    call JSON.parse() on it again (that would stringify the array via
    toString(), then fail to parse, and silently get swallowed by the
    catch block, wiping out the images).
  - If the column is TEXT/VARCHAR, it comes back as a JSON string and
    needs JSON.parse() as before.
*/
function parseImageUrls(row) {
  if (!row) return row;

  if (Array.isArray(row.image_urls)) {
    return row; // already parsed by the driver (JSON column)
  }

  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

module.exports = {
  deleteTask,
  createTask,
  getAllTasks,
  acceptTask,
  updateTaskStatus,
  cancelTask,
  getUserTaskHistory
};

async function deleteTask(taskId, userId) {
  const [taskRows] = await pool.execute(
    `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE id = ? LIMIT 1`, [taskId]
  );

  if (taskRows.length === 0) {
    const error = new Error("Task not found."); error.statusCode = 404; throw error;
  }

  const task = taskRows[0];

  if (Number(task.created_by) !== Number(userId)) {
    const error = new Error("Only the task creator can delete this task."); error.statusCode = 403; throw error;
  }

  await pool.execute(`DELETE FROM tasks WHERE id = ?`, [taskId]);

  if (task.accepted_by) {
    await notificationService.createNotification({
      userId: task.accepted_by,
      title: "Task Withdrawn",
      message: `The task "${task.title}" was deleted by its creator.`
    });
  }
}
