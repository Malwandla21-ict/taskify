const pool = require("../config/db");
const auditLogService = require("./auditlog.service");
const notificationService = require("./notification.service");

/* Every content type that AI moderation (contentModeration.service.js) can
   flag, and that an admin can clear or remove from here. Keyed by the same
   contentType strings used in the moderation_flags notifications and the
   reports.context_type column, so a flagged item and a reported item speak
   the same language. */
const CONTENT_TABLES = {
  task:        { table: "tasks",       ownerColumn: "created_by",   titleColumn: "title" },
  sales_item:  { table: "sales_items", ownerColumn: "seller_id",    titleColumn: "title" },
  equipment:   { table: "equipment",   ownerColumn: "owner_id",     titleColumn: "name" },
  event:       { table: "events",      ownerColumn: "organizer_id", titleColumn: "title" }
};

const CONTENT_LABELS = {
  task: "task",
  sales_item: "sales listing",
  equipment: "equipment listing",
  event: "event"
};

function parseModerationFlags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

/* Everything currently sitting in pending_review across all four content
   tables, newest first — the admin queue for AI-flagged (but not yet
   removed) content. */
async function getModerationQueue() {
  const perTable = await Promise.all(
    Object.entries(CONTENT_TABLES).map(async ([contentType, { table, ownerColumn, titleColumn }]) => {
      const [rows] = await pool.execute(
        `SELECT t.id, t.${titleColumn} AS title, t.${ownerColumn} AS owner_id,
                t.moderation_flags, t.created_at, u.full_name AS owner_name
         FROM ${table} t
         LEFT JOIN users u ON t.${ownerColumn} = u.id
         WHERE t.moderation_status = 'pending_review'
         ORDER BY t.created_at DESC`
      );
      return rows.map(row => ({
        contentType,
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        flaggedCategories: parseModerationFlags(row.moderation_flags),
        createdAt: row.created_at
      }));
    })
  );

  return perTable.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* Dismisses a flag with no action taken — the content stays published,
   just no longer marked pending_review. Only valid from pending_review,
   so this can't be used to un-remove something (use a direct DB fix for
   that, same as everywhere else in this app that treats removal/ban as
   normally-permanent). */
async function clearModerationFlag(contentType, contentId, adminId) {
  const config = CONTENT_TABLES[contentType];
  if (!config) { const error = new Error("Invalid content type."); error.statusCode = 400; throw error; }

  const [rows] = await pool.execute(
    `SELECT id, moderation_status FROM ${config.table} WHERE id = ? LIMIT 1`, [contentId]
  );
  if (!rows.length) { const error = new Error("Content not found."); error.statusCode = 404; throw error; }
  if (rows[0].moderation_status !== "pending_review") {
    const error = new Error("Only content pending review can be cleared."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE ${config.table} SET moderation_status = 'clean' WHERE id = ?`, [contentId]);

  await auditLogService.createAuditLog({
    adminId, action: "content.clear_flag", targetType: contentType, targetId: contentId
  });

  return { contentType, id: contentId, moderationStatus: "clean" };
}

/* Takes a task/sales listing/equipment listing/event down — whether it
   arrived here via the AI flag queue or a user report. Removed content is
   excluded from the public browse/list queries but not deleted outright,
   same spirit as suspend vs. delete elsewhere in this app: reversible by a
   direct DB fix, but not meant to be casually undone from the UI. */
async function removeContent(contentType, contentId, adminId, reason) {
  const config = CONTENT_TABLES[contentType];
  if (!config) { const error = new Error("Invalid content type."); error.statusCode = 400; throw error; }

  const [rows] = await pool.execute(
    `SELECT id, ${config.titleColumn} AS title, ${config.ownerColumn} AS owner_id, moderation_status
     FROM ${config.table} WHERE id = ? LIMIT 1`,
    [contentId]
  );
  if (!rows.length) { const error = new Error("Content not found."); error.statusCode = 404; throw error; }
  const content = rows[0];

  if (content.moderation_status === "removed") {
    const error = new Error("This content has already been removed."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE ${config.table} SET moderation_status = 'removed' WHERE id = ?`, [contentId]);

  await auditLogService.createAuditLog({
    adminId, action: "content.remove", targetType: contentType, targetId: contentId,
    reason: reason || null, metadata: { title: content.title }
  });

  if (content.owner_id) {
    await notificationService.createNotification({
      userId: content.owner_id,
      title: "Listing Removed",
      message: reason
        ? `Your ${CONTENT_LABELS[contentType]} "${content.title}" was removed by an administrator. Reason: ${reason}`
        : `Your ${CONTENT_LABELS[contentType]} "${content.title}" was removed by an administrator.`,
      email: true
    });
  }

  return { contentType, id: contentId, moderationStatus: "removed" };
}

async function getAllUsersForAdmin({ limit = 100, offset = 0 } = {}) {
  const safeLimit  = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role, profile_photo_url,
            suspension_reason, suspended_at, ban_reason, banned_at,
            rating_average, total_reviews, created_at,
            totp_enabled, totp_method
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

  /* Moderation visibility: how much AI-flagged content is waiting on an
     admin, and how much has already been taken down — summed across all
     four moderated tables so this doesn't need one card per content type. */
  const moderationCounts = await Promise.all(
    Object.values(CONTENT_TABLES).map(({ table }) =>
      pool.execute(
        `SELECT
           SUM(moderation_status = 'pending_review') AS pending,
           SUM(moderation_status = 'removed') AS removed
         FROM ${table}`
      )
    )
  );
  const moderationTotals = moderationCounts.reduce(
    (acc, [rows]) => {
      acc.pendingReview += Number(rows[0].pending) || 0;
      acc.removed += Number(rows[0].removed) || 0;
      return acc;
    },
    { pendingReview: 0, removed: 0 }
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
    },
    moderation: moderationTotals
  };
}

module.exports = {
  getAllUsersForAdmin,
  promoteUserToAdmin,
  demoteAdminToUser,
  getDashboardStats,
  getModerationQueue,
  clearModerationFlag,
  removeContent
};