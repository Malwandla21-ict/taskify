const pool = require("../config/db");
const auditLogService = require("./auditLog.service");
const notificationService = require("./notification.service");

/* ── Suspend / Unsuspend ──
   Suspend is temporary and always reversible by an admin. Combined with
   the role re-check now in auth.middleware.js, it takes effect immediately
   — the user's existing token stops working on their very next request. */
async function suspendUser(userId, adminId, reason) {
  const [rows] = await pool.execute(
    `SELECT id, role, full_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }
  const user = rows[0];

  if (user.role === "admin") {
    const error = new Error("Admin users cannot be suspended."); error.statusCode = 400; throw error;
  }
  if (user.role === "banned") {
    const error = new Error("This user is banned, not suspended. Unban them first if you want to reinstate access.");
    error.statusCode = 400; throw error;
  }
  if (user.role === "suspended") {
    const error = new Error("User is already suspended."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE users SET role = 'suspended', suspension_reason = ?, suspended_at = NOW() WHERE id = ?`,
    [reason || null, userId]
  );

  await auditLogService.createAuditLog({
    adminId, action: "user.suspend", targetType: "user", targetId: userId,
    reason: reason || null, metadata: { email: user.email }
  });

  await notificationService.createNotification({
    userId,
    title: "Account Suspended",
    message: reason
      ? `Your account has been suspended. Reason: ${reason}`
      : "Your account has been suspended by an administrator."
  });

  return getUserSummary(userId);
}

async function unsuspendUser(userId, adminId) {
  const [rows] = await pool.execute(
    `SELECT id, role, full_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }
  const user = rows[0];

  if (user.role !== "suspended") {
    const error = new Error("This user is not currently suspended."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE users SET role = 'user', suspension_reason = NULL, suspended_at = NULL WHERE id = ?`,
    [userId]
  );

  await auditLogService.createAuditLog({
    adminId, action: "user.unsuspend", targetType: "user", targetId: userId,
    metadata: { email: user.email }
  });

  await notificationService.createNotification({
    userId,
    title: "Account Reinstated",
    message: "Your suspension has been lifted. Welcome back to Taskify."
  });

  return getUserSummary(userId);
}

/* ── Ban / Unban ──
   Ban is for serious or repeat violations. It's treated as permanent in
   normal operation — there's no auto-expiry — but an unban path still
   exists for admin error correction, and every step here is logged. */
async function banUser(userId, adminId, reason) {
  const [rows] = await pool.execute(
    `SELECT id, role, full_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }
  const user = rows[0];

  if (user.role === "admin") {
    const error = new Error("Admin users cannot be banned."); error.statusCode = 400; throw error;
  }
  if (user.role === "banned") {
    const error = new Error("User is already banned."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE users
     SET role = 'banned', ban_reason = ?, banned_at = NOW(),
         suspension_reason = NULL, suspended_at = NULL
     WHERE id = ?`,
    [reason || null, userId]
  );

  await auditLogService.createAuditLog({
    adminId, action: "user.ban", targetType: "user", targetId: userId,
    reason: reason || null, metadata: { email: user.email }
  });

  await notificationService.createNotification({
    userId,
    title: "Account Banned",
    message: reason
      ? `Your account has been banned. Reason: ${reason}`
      : "Your account has been banned by an administrator."
  });

  return getUserSummary(userId);
}

async function unbanUser(userId, adminId) {
  const [rows] = await pool.execute(
    `SELECT id, role, full_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  if (rows.length === 0) {
    const error = new Error("User not found."); error.statusCode = 404; throw error;
  }
  const user = rows[0];

  if (user.role !== "banned") {
    const error = new Error("This user is not currently banned."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE users SET role = 'user', ban_reason = NULL, banned_at = NULL WHERE id = ?`,
    [userId]
  );

  await auditLogService.createAuditLog({
    adminId, action: "user.unban", targetType: "user", targetId: userId,
    metadata: { email: user.email }
  });

  await notificationService.createNotification({
    userId,
    title: "Account Reinstated",
    message: "Your ban has been lifted. Welcome back to Taskify."
  });

  return getUserSummary(userId);
}

async function getUserSummary(userId) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role, suspension_reason, suspended_at, ban_reason, banned_at
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

/* ── Refund ──
   Admin override for a held payment, used to resolve disputes (e.g. work
   was never delivered). Only a payment still in 'Held' can be refunded —
   money already 'Released' has left the held pool, and 'Cancelled' /
   'Refunded' payments have nothing left to move. Refunding also closes
   the task out if it isn't already resolved, so a live task never sits
   attached to reversed money. */
async function refundPayment(taskId, adminId, reason) {
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

    const [paymentRows] = await connection.execute(
      `SELECT id, amount, status FROM payments WHERE task_id = ? LIMIT 1 FOR UPDATE`,
      [taskId]
    );
    if (paymentRows.length === 0) {
      const error = new Error("No payment found for this task."); error.statusCode = 404; throw error;
    }
    const payment = paymentRows[0];

    if (payment.status !== "Held") {
      const error = new Error(`Only held payments can be refunded. This payment is currently '${payment.status}'.`);
      error.statusCode = 400;
      throw error;
    }

    await connection.execute(`UPDATE payments SET status = 'Refunded' WHERE id = ?`, [payment.id]);

    const taskAlreadyClosed = ["Completed", "Cancelled"].includes(task.status);
    if (!taskAlreadyClosed) {
      await connection.execute(`UPDATE tasks SET status = 'Cancelled' WHERE id = ?`, [taskId]);
    }

    await connection.commit();

    await auditLogService.createAuditLog({
      adminId, action: "payment.refund", targetType: "payment", targetId: payment.id,
      reason: reason || null,
      metadata: { taskId, amount: payment.amount }
    });

    await notificationService.createNotification({
      userId: task.created_by,
      title: "Payment Refunded",
      message: reason
        ? `Your payment for "${task.title}" was refunded by an administrator. Reason: ${reason}`
        : `Your payment for "${task.title}" was refunded by an administrator.`
    });

    if (task.accepted_by) {
      await notificationService.createNotification({
        userId: task.accepted_by,
        title: "Task Closed by Admin",
        message: `"${task.title}" was closed and the payment refunded by an administrator.`
      });
    }

    return { taskId, paymentId: payment.id, amount: payment.amount, status: "Refunded" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  suspendUser,
  unsuspendUser,
  banUser,
  unbanUser,
  refundPayment
};