const pool = require("../config/db");

async function createReport({ reporterId, reportedUserId, taskId, reason }) {
  if (Number(reporterId) === Number(reportedUserId)) {
    const error = new Error("You cannot report yourself.");
    error.statusCode = 400;
    throw error;
  }

  const [reportedUserRows] = await pool.execute(
    `
      SELECT id
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [reportedUserId]
  );

  if (reportedUserRows.length === 0) {
    const error = new Error("Reported user not found.");
    error.statusCode = 404;
    throw error;
  }

  if (taskId) {
    const [taskRows] = await pool.execute(
      `
        SELECT id
        FROM tasks
        WHERE id = ?
        LIMIT 1
      `,
      [taskId]
    );

    if (taskRows.length === 0) {
      const error = new Error("Task not found.");
      error.statusCode = 404;
      throw error;
    }
  }

  const [result] = await pool.execute(
    `
      INSERT INTO reports (reporter_id, reported_user_id, task_id, reason)
      VALUES (?, ?, ?, ?)
    `,
    [reporterId, reportedUserId, taskId || null, reason.trim()]
  );

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reporter_id,
        reported_user_id,
        task_id,
        reason,
        status,
        created_at
      FROM reports
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId]
  );

  return rows[0];
}

async function getAllReports() {
  const [rows] = await pool.execute(
    `
      SELECT
        r.id,
        r.reporter_id,
        r.reported_user_id,
        r.task_id,
        r.reason,
        r.status,
        r.created_at,
        reporter.full_name AS reporter_name,
        reported.full_name AS reported_user_name
      FROM reports r
      INNER JOIN users reporter ON r.reporter_id = reporter.id
      INNER JOIN users reported ON r.reported_user_id = reported.id
      ORDER BY r.created_at DESC
    `
  );

  return rows;
}

async function resolveReport(reportId) {
  const [reportRows] = await pool.execute(
    `
      SELECT id, status
      FROM reports
      WHERE id = ?
      LIMIT 1
    `,
    [reportId]
  );

  if (reportRows.length === 0) {
    const error = new Error("Report not found.");
    error.statusCode = 404;
    throw error;
  }

  const report = reportRows[0];

  if (report.status === "Resolved") {
    const error = new Error("Report is already resolved.");
    error.statusCode = 400;
    throw error;
  }

  await pool.execute(
    `
      UPDATE reports
      SET status = 'Resolved'
      WHERE id = ?
    `,
    [reportId]
  );

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        reporter_id,
        reported_user_id,
        task_id,
        reason,
        status,
        created_at
      FROM reports
      WHERE id = ?
      LIMIT 1
    `,
    [reportId]
  );

  return rows[0];
}

async function suspendUser(userId) {
  const [userRows] = await pool.execute(
    `
      SELECT id, role
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const user = userRows[0];

  if (user.role === "admin") {
    const error = new Error("Admin users cannot be suspended.");
    error.statusCode = 400;
    throw error;
  }

  if (user.role === "suspended") {
    const error = new Error("User is already suspended.");
    error.statusCode = 400;
    throw error;
  }

  await pool.execute(
    `
      UPDATE users
      SET role = 'suspended'
      WHERE id = ?
    `,
    [userId]
  );

  const [rows] = await pool.execute(
    `
      SELECT id, full_name, email, role
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0];
}

module.exports = {
  createReport,
  getAllReports,
  resolveReport,
  suspendUser
};