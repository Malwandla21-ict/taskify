const pool = require("../config/db");
const notificationService = require("./notification.service");

/* Derived-table pattern (subquery in FROM, not in ON) for "latest
   endorsement per context" — safe and fast, unlike a correlated subquery
   inside a JOIN's ON clause which can be catastrophically slow or hang
   depending on the engine/index setup. */
const TASK_ENDORSEMENT_JOIN = `
  LEFT JOIN (
    SELECT le1.context_id, le1.endorsement_type, le1.message, le1.lecturer_id
    FROM lecturer_endorsements le1
    INNER JOIN (
      SELECT context_id, MAX(created_at) AS max_created
      FROM lecturer_endorsements WHERE context_type = 'task' GROUP BY context_id
    ) latest ON le1.context_id = latest.context_id AND le1.created_at = latest.max_created
    WHERE le1.context_type = 'task'
  ) tle ON tle.context_id = t.id
  LEFT JOIN users endlect ON tle.lecturer_id = endlect.id
`;

const TASK_SELECT_FIELDS = `
  t.id, t.title, t.description, t.category, t.section,
  t.price, t.location, t.status, t.urgent,
  t.created_by, t.accepted_by, t.created_at,
  t.image_urls,
  u.full_name AS created_by_name,
  u.profile_photo_url AS created_by_profile_photo,
  u.phone_number AS created_by_phone_number,
  u.member_type AS created_by_member_type,
  u.lecturer_title AS created_by_lecturer_title,
  w.full_name AS accepted_by_name,
  w.profile_photo_url AS accepted_by_profile_photo,
  w.phone_number AS accepted_by_phone_number,
  w.member_type AS accepted_by_member_type,
  w.lecturer_title AS accepted_by_lecturer_title,
  p.status AS payment_status,
  tle.endorsement_type,
  tle.message AS endorsement_message,
  endlect.id AS endorsed_by_lecturer_id,
  endlect.full_name AS endorsed_by_lecturer_name,
  endlect.lecturer_title AS endorsed_by_lecturer_title,
  endlect.profile_photo_url AS endorsed_by_lecturer_photo
`;

function parseImageUrls(row) {
  if (!row) return row;
  if (Array.isArray(row.image_urls)) return row;
  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

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
  const [rows] = await pool.execute(
    `SELECT ${TASK_SELECT_FIELDS}
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN users w ON t.accepted_by = w.id
     LEFT JOIN payments p ON t.id = p.task_id
     ${TASK_ENDORSEMENT_JOIN}
     WHERE t.status = 'Posted'
     ORDER BY t.urgent DESC, t.created_at DESC`
  );

  return rows.map(parseImageUrls);
}

async function acceptTask(taskId, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [taskRows] = await connection.execute(
      `SELECT id, created_by, accepted_by, status, price, title
       FROM tasks WHERE id = ? LIMIT 1 FOR UPDATE`,
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

    await connection.execute(
      `UPDATE tasks SET accepted_by = ?, status = 'Accepted' WHERE id = ?`,
      [userId, taskId]
    );

    await connection.execute(
      `INSERT INTO payments (task_id, amount, status)
       VALUES (?, ?, 'Held')
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = 'Held'`,
      [taskId, task.price]
    );

    await connection.commit();

    const [userRows] = await pool.execute(
      `SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]
    );
    const accepterName = userRows[0]?.full_name || "A student";

    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Accepted",
      message: `${accepterName} accepted your task "${task.title}".`,
      contextType: "task",
      contextId: taskId
    });

    return getTaskById(taskId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateTaskStatus(taskId, userId, newStatus) {
  const allowed = ["In Progress", "Awaiting Confirmation"];
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
  if (newStatus === "Awaiting Confirmation" && task.status !== "In Progress") {
    const error = new Error("Only tasks in progress can be marked as done."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE tasks SET status = ? WHERE id = ?`, [newStatus, taskId]);

  if (newStatus === "In Progress") {
    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Started",
      message: `Work has started on your task "${task.title}".`,
      contextType: "task",
      contextId: taskId
    });
  }

  if (newStatus === "Awaiting Confirmation") {
    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Marked as Done",
      message: `The work on "${task.title}" has been marked as done. Please confirm completion to release payment.`,
      contextType: "task",
      contextId: taskId
    });
  }

  return getTaskById(taskId);
}

async function confirmTaskCompletion(taskId, ownerId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [taskRows] = await connection.execute(
      `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE id = ? LIMIT 1 FOR UPDATE`,
      [taskId]
    );

    if (taskRows.length === 0) {
      const error = new Error("Task not found."); error.statusCode = 404; throw error;
    }

    const task = taskRows[0];

    if (Number(task.created_by) !== Number(ownerId)) {
      const error = new Error("Only the task owner can confirm completion."); error.statusCode = 403; throw error;
    }
    if (task.status !== "Awaiting Confirmation") {
      const error = new Error("This task is not awaiting confirmation."); error.statusCode = 400; throw error;
    }

    await connection.execute(`UPDATE tasks SET status = 'Completed' WHERE id = ?`, [taskId]);
    await connection.execute(`UPDATE payments SET status = 'Released' WHERE task_id = ?`, [taskId]);

    await connection.commit();

    await notificationService.createNotification({
      userId: task.created_by,
      title: "Task Completed",
      message: `Your task "${task.title}" has been completed and payment released.`,
      contextType: "task",
      contextId: taskId
    });
    await notificationService.createNotification({
      userId: task.accepted_by,
      title: "Payment Released",
      message: `You completed "${task.title}" and payment has been released.`,
      contextType: "task",
      contextId: taskId
    });

    return getTaskById(taskId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function withdrawFromTask(taskId, workerId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [taskRows] = await connection.execute(
      `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE id = ? LIMIT 1 FOR UPDATE`,
      [taskId]
    );

    if (taskRows.length === 0) {
      const error = new Error("Task not found."); error.statusCode = 404; throw error;
    }

    const task = taskRows[0];

    if (Number(task.accepted_by) !== Number(workerId)) {
      const error = new Error("Only the assigned user can withdraw from this task."); error.statusCode = 403; throw error;
    }
    if (task.status !== "Accepted") {
      const error = new Error("You can only withdraw before starting the task."); error.statusCode = 400; throw error;
    }

    await connection.execute(`UPDATE tasks SET status = 'Posted', accepted_by = NULL WHERE id = ?`, [taskId]);
    await connection.execute(`UPDATE payments SET status = 'Cancelled' WHERE task_id = ?`, [taskId]);

    await connection.commit();

    await notificationService.createNotification({
      userId: task.created_by,
      title: "Worker Withdrew",
      message: `The student who accepted "${task.title}" has withdrawn. Your task is posted again.`,
      contextType: "task",
      contextId: taskId
    });

    return getTaskById(taskId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancelTask(taskId, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [taskRows] = await connection.execute(
      `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE id = ? LIMIT 1 FOR UPDATE`, [taskId]
    );

    if (taskRows.length === 0) {
      const error = new Error("Task not found."); error.statusCode = 404; throw error;
    }

    const task = taskRows[0];

    if (Number(task.created_by) !== Number(userId)) {
      const error = new Error("Only the task creator can cancel this task."); error.statusCode = 403; throw error;
    }
    if (["In Progress", "Awaiting Confirmation"].includes(task.status)) {
      const error = new Error("Tasks that are already underway cannot be cancelled."); error.statusCode = 400; throw error;
    }
    if (task.status === "Completed") {
      const error = new Error("Completed tasks cannot be cancelled."); error.statusCode = 400; throw error;
    }
    if (task.status === "Cancelled") {
      const error = new Error("This task is already cancelled."); error.statusCode = 400; throw error;
    }

    await connection.execute(`UPDATE tasks SET status = 'Cancelled' WHERE id = ?`, [taskId]);

    if (task.accepted_by) {
      await connection.execute(`UPDATE payments SET status = 'Cancelled' WHERE task_id = ?`, [taskId]);
    }

    await connection.commit();

    if (task.accepted_by) {
      await notificationService.createNotification({
        userId: task.accepted_by,
        title: "Task Cancelled",
        message: `The task "${task.title}" was cancelled by its creator.`,
        contextType: "task",
        contextId: taskId
      });
    }

    return getTaskById(taskId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getUserTaskHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT ${TASK_SELECT_FIELDS}
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN users w ON t.accepted_by = w.id
     LEFT JOIN payments p ON t.id = p.task_id
     ${TASK_ENDORSEMENT_JOIN}
     WHERE t.created_by = ? OR t.accepted_by = ?
     ORDER BY t.created_at DESC`,
    [userId, userId]
  );
  return rows.map(parseImageUrls);
}

async function getTaskByIdForViewing(taskId) {
  const task = await getTaskById(taskId);
  if (!task) {
    const error = new Error("Task not found."); error.statusCode = 404; throw error;
  }
  return task;
}

async function getTaskById(taskId) {
  const [rows] = await pool.execute(
    `SELECT ${TASK_SELECT_FIELDS}
     FROM tasks t
     INNER JOIN users u ON t.created_by = u.id
     LEFT JOIN users w ON t.accepted_by = w.id
     LEFT JOIN payments p ON t.id = p.task_id
     ${TASK_ENDORSEMENT_JOIN}
     WHERE t.id = ? LIMIT 1`,
    [taskId]
  );
  return parseImageUrls(rows[0]);
}

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
  if (!["Posted", "Cancelled"].includes(task.status)) {
    const error = new Error("Only posted or cancelled tasks can be deleted."); error.statusCode = 400; throw error;
  }

  await pool.execute(`DELETE FROM tasks WHERE id = ?`, [taskId]);

  if (task.accepted_by) {
    await notificationService.createNotification({
      userId: task.accepted_by,
      title: "Task Withdrawn",
      message: `The task "${task.title}" was deleted by its creator.`,
      contextType: "task",
      contextId: taskId
    });
  }
}

module.exports = {
  createTask,
  getAllTasks,
  acceptTask,
  updateTaskStatus,
  confirmTaskCompletion,
  withdrawFromTask,
  cancelTask,
  getUserTaskHistory,
  getTaskByIdForViewing,
  deleteTask
};