const pool = require("../config/db");

async function createNotification({ userId, title, message, contextType = null, contextId = null }) {
  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, title, message, context_type, context_id) VALUES (?, ?, ?, ?, ?)`,
    [userId, title.trim(), message.trim(), contextType, contextId]
  );
  return getNotificationById(result.insertId);
}

async function notifyAllAdmins({ title, message, contextType = null, contextId = null }) {
  const [admins] = await pool.execute(`SELECT id FROM users WHERE role = 'admin'`);
  await Promise.all(
    admins.map(admin => createNotification({ userId: admin.id, title, message, contextType, contextId }))
  );
}

async function getUserNotifications(userId) {
  const [rows] = await pool.execute(
    `SELECT id, user_id, title, message, context_type, context_id, is_read, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getUnreadCount(userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return Number(rows[0].count);
}

async function markNotificationAsRead(notificationId, userId) {
  const [rows] = await pool.execute(`SELECT id, user_id FROM notifications WHERE id = ? LIMIT 1`, [notificationId]);

  if (rows.length === 0) {
    const error = new Error("Notification not found.");
    error.statusCode = 404;
    throw error;
  }

  if (Number(rows[0].user_id) !== Number(userId)) {
    const error = new Error("You cannot update this notification.");
    error.statusCode = 403;
    throw error;
  }

  await pool.execute(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [notificationId]);
  return getNotificationById(notificationId);
}

async function getNotificationById(notificationId) {
  const [rows] = await pool.execute(
    `SELECT id, user_id, title, message, context_type, context_id, is_read, created_at
     FROM notifications WHERE id = ? LIMIT 1`,
    [notificationId]
  );
  return rows[0];
}

module.exports = {
  createNotification,
  notifyAllAdmins,
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead
};