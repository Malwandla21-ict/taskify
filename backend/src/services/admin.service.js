const pool = require("../config/db");
const auditLogService = require("./auditLog.service");
const notificationService = require("./notification.service");

async function getAllUsersForAdmin({ limit = 100, offset = 0 } = {}) {
  const safeLimit  = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role, profile_photo_url,
            suspension_reason, suspended_at, ban_reason, banned_at,
            rating_average, total_reviews, created_at
     FROM users
     ORDER BY created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`
  );
  return rows;
}

async function promoteUserToAdmin(userId, actingAdminId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1`, [userId]
  );

  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }

  const user = rows[0];

  if (user.role === "admin") {
    const error = new Error("This user is already an admin."); error.statusCode = 400; throw error;
  }
  if (["suspended", "banned"].includes(user.role)) {
    const error = new Error("A suspended or banned user cannot be promoted to admin."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE users SET role = 'admin' WHERE id = ?`, [userId]);

  await auditLogService.createAuditLog({
    adminId: actingAdminId,
    action: "user.promote",
    targetType: "user",
    targetId: userId,
    reason: `Promoted ${user.full_name} (${user.email}) to admin.`
  });

  const [updatedRows] = await pool.execute(
    `SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  return updatedRows[0];
}

async function demoteAdminToUser(userId, actingAdminId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1`, [userId]
  );

  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }

  const user = rows[0];

  if (user.role !== "admin") {
    const error = new Error("This user is not currently an admin."); error.statusCode = 400; throw error;
  }

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`);
  if (Number(countRows[0].count) <= 1) {
    const error = new Error("Cannot demote the last remaining admin.");
    error.statusCode = 400;
    throw error;
  }

  await pool.execute(`UPDATE users SET role = 'user' WHERE id = ?`, [userId]);

  await auditLogService.createAuditLog({
    adminId: actingAdminId,
    action: "user.demote",
    targetType: "user",
    targetId: userId,
    reason: `Demoted ${user.full_name} (${user.email}) from admin.`
  });

  await notificationService.createNotification({
    userId,
    title: "Admin Access Removed",
    message: "Your admin access has been removed by another administrator."
  });

  const [updatedRows] = await pool.execute(
    `SELECT id, full_name, email, role FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  return updatedRows[0];
}

async function getDashboardStats() {
  const [userRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_users,
       SUM(role = 'user') AS active_users,
       SUM(role = 'admin') AS admin_users,
       SUM(role = 'suspended') AS suspended_users,
       SUM(role = 'banned') AS banned_users
     FROM users`
  );

  const [taskRows] = await pool.execute(
    `SELECT status, COUNT(*) AS count FROM tasks GROUP BY status`
  );

  const [bookingRows] = await pool.execute(
    `SELECT status, COUNT(*) AS count FROM equipment_bookings GROUP BY status`
  );

  const [paymentRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status = 'Held' THEN amount ELSE 0 END) AS held_total,
       SUM(CASE WHEN status = 'Released' THEN amount ELSE 0 END) AS released_total,
       SUM(CASE WHEN status = 'Refunded' THEN amount ELSE 0 END) AS refunded_total
     FROM payments`
  );

  const [reportRows] = await pool.execute(
    `SELECT
       SUM(status = 'Pending') AS pending_reports,
       SUM(status = 'Resolved') AS resolved_reports
     FROM reports`
  );

  /* Added for the dashboard overhaul — real counts, not placeholders,
     so "Total Equipment" and "Total Earnings" on the admin dashboard
     reflect actual platform data rather than fabricated figures. */
  const [equipmentRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM equipment`
  );

  const [salesRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM sales_items`
  );

  const taskStatusCounts = {};
  taskRows.forEach(r => { taskStatusCounts[r.status] = Number(r.count); });

  const bookingStatusCounts = {};
  bookingRows.forEach(r => { bookingStatusCounts[r.status] = Number(r.count); });

  return {
    users: {
      total: Number(userRows[0].total_users) || 0,
      active: Number(userRows[0].active_users) || 0,
      admins: Number(userRows[0].admin_users) || 0,
      suspended: Number(userRows[0].suspended_users) || 0,
      banned: Number(userRows[0].banned_users) || 0
    },
    tasks: taskStatusCounts,
    equipmentBookings: bookingStatusCounts,
    equipment: {
      total: Number(equipmentRows[0].total) || 0
    },
    sales: {
      total: Number(salesRows[0].total) || 0
    },
    payments: {
      held: Number(paymentRows[0].held_total) || 0,
      released: Number(paymentRows[0].released_total) || 0,
      refunded: Number(paymentRows[0].refunded_total) || 0
    },
    reports: {
      pending: Number(reportRows[0].pending_reports) || 0,
      resolved: Number(reportRows[0].resolved_reports) || 0
    }
  };
}

module.exports = {
  getAllUsersForAdmin,
  promoteUserToAdmin,
  demoteAdminToUser,
  getDashboardStats
};