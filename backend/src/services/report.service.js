const pool = require("../config/db");
const auditLogService = require("./auditLog.service");
const notificationService = require("./notification.service");

const VALID_CONTEXT_TYPES = ["task", "equipment_booking", "sales_item"];

/* Looks up a human-readable label and the id needed to link back to the
   right detail page for a given report context. Equipment bookings need
   translating to their equipment_id since equipment-details.html is keyed
   by equipment, not by booking. */
async function resolveContext(contextType, contextId) {
  if (contextType === "task") {
    const [rows] = await pool.execute(`SELECT id, title FROM tasks WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) { const e = new Error("Task not found."); e.statusCode = 404; throw e; }
    return { title: rows[0].title, linkId: rows[0].id };
  }
  if (contextType === "equipment_booking") {
    const [rows] = await pool.execute(
      `SELECT eb.id, eb.equipment_id, e.name
       FROM equipment_bookings eb
       INNER JOIN equipment e ON eb.equipment_id = e.id
       WHERE eb.id = ? LIMIT 1`,
      [contextId]
    );
    if (!rows.length) { const e = new Error("Equipment booking not found."); e.statusCode = 404; throw e; }
    return { title: rows[0].name, linkId: rows[0].equipment_id };
  }
  if (contextType === "sales_item") {
    const [rows] = await pool.execute(`SELECT id, title FROM sales_items WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) { const e = new Error("Sales item not found."); e.statusCode = 404; throw e; }
    return { title: rows[0].title, linkId: rows[0].id };
  }
  const error = new Error("Invalid report context type.");
  error.statusCode = 400;
  throw error;
}

async function createReport({ reporterId, reportedUserId, contextType, contextId, reason }) {
  if (Number(reporterId) === Number(reportedUserId)) {
    const error = new Error("You cannot report yourself.");
    error.statusCode = 400;
    throw error;
  }

  const [reportedUserRows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? LIMIT 1`,
    [reportedUserId]
  );

  if (reportedUserRows.length === 0) {
    const error = new Error("Reported user not found.");
    error.statusCode = 404;
    throw error;
  }

  const hasContextType = contextType !== undefined && contextType !== null && contextType !== "";
  const hasContextId   = contextId !== undefined && contextId !== null && contextId !== "";

  let context = null;
  if (hasContextType || hasContextId) {
    if (!hasContextType || !hasContextId) {
      const error = new Error("Both a context type and context ID are required together.");
      error.statusCode = 400;
      throw error;
    }
    if (!VALID_CONTEXT_TYPES.includes(contextType)) {
      const error = new Error("Invalid report context type.");
      error.statusCode = 400;
      throw error;
    }
    context = await resolveContext(contextType, Number(contextId));
  }

  const [result] = await pool.execute(
    `INSERT INTO reports (reporter_id, reported_user_id, context_type, context_id, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [reporterId, reportedUserId, context ? contextType : null, context ? Number(contextId) : null, reason.trim()]
  );

  const [rows] = await pool.execute(
    `SELECT id, reporter_id, reported_user_id, context_type, context_id, reason, status, created_at
     FROM reports WHERE id = ? LIMIT 1`,
    [result.insertId]
  );

  const report = rows[0];

  const [reporterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [reporterId]);
  const reporterName  = reporterRows[0]?.full_name || "A student";
  const reportedName  = reportedUserRows[0].full_name;
  const reasonPreview = reason.trim().length > 120 ? `${reason.trim().slice(0, 120)}…` : reason.trim();
  const contextNote   = context ? ` (${context.title})` : "";

  await notificationService.notifyAllAdmins({
    title: "New Report Filed",
    message: `${reporterName} reported ${reportedName}${contextNote}. Reason: ${reasonPreview}`
  });

  return { ...report, context_title: context?.title || null, context_link_id: context?.linkId || null };
}

async function getAllReports() {
  const [rows] = await pool.execute(
    `SELECT
       r.id, r.reporter_id, r.reported_user_id, r.context_type, r.context_id,
       r.reason, r.status, r.created_at,
       reporter.full_name AS reporter_name,
       reported.full_name AS reported_user_name
     FROM reports r
     INNER JOIN users reporter ON r.reporter_id = reporter.id
     INNER JOIN users reported ON r.reported_user_id = reported.id
     ORDER BY r.created_at DESC`
  );

  return enrichReportsWithContext(rows);
}

/* Batches context lookups by type instead of querying per row, so the
   report list stays at (1 + number of distinct context types present)
   queries rather than N+1. */
async function enrichReportsWithContext(rows) {
  const taskIds     = rows.filter(r => r.context_type === "task").map(r => r.context_id);
  const bookingIds   = rows.filter(r => r.context_type === "equipment_booking").map(r => r.context_id);
  const salesItemIds = rows.filter(r => r.context_type === "sales_item").map(r => r.context_id);

  const taskMap = new Map();
  if (taskIds.length) {
    const [taskRows] = await pool.query(`SELECT id, title FROM tasks WHERE id IN (?)`, [taskIds]);
    taskRows.forEach(t => taskMap.set(t.id, { title: t.title, linkId: t.id }));
  }

  const bookingMap = new Map();
  if (bookingIds.length) {
    const [bookingRows] = await pool.query(
      `SELECT eb.id, eb.equipment_id, e.name
       FROM equipment_bookings eb
       INNER JOIN equipment e ON eb.equipment_id = e.id
       WHERE eb.id IN (?)`,
      [bookingIds]
    );
    bookingRows.forEach(b => bookingMap.set(b.id, { title: b.name, linkId: b.equipment_id }));
  }

  const salesMap = new Map();
  if (salesItemIds.length) {
    const [salesRows] = await pool.query(`SELECT id, title FROM sales_items WHERE id IN (?)`, [salesItemIds]);
    salesRows.forEach(s => salesMap.set(s.id, { title: s.title, linkId: s.id }));
  }

  return rows.map(row => {
    let context = null;
    if (row.context_type === "task") context = taskMap.get(row.context_id);
    if (row.context_type === "equipment_booking") context = bookingMap.get(row.context_id);
    if (row.context_type === "sales_item") context = salesMap.get(row.context_id);

    return {
      ...row,
      context_title: context ? context.title : null,
      context_link_id: context ? context.linkId : null
    };
  });
}

async function resolveReport(reportId, adminId) {
  const [reportRows] = await pool.execute(
    `SELECT id, status, reported_user_id FROM reports WHERE id = ? LIMIT 1`,
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

  await pool.execute(`UPDATE reports SET status = 'Resolved' WHERE id = ?`, [reportId]);

  await auditLogService.createAuditLog({
    adminId,
    action: "report.resolve",
    targetType: "report",
    targetId: reportId,
    metadata: { reportedUserId: report.reported_user_id }
  });

  const [rows] = await pool.execute(
    `SELECT id, reporter_id, reported_user_id, context_type, context_id, reason, status, created_at
     FROM reports WHERE id = ? LIMIT 1`,
    [reportId]
  );

  const [enriched] = await enrichReportsWithContext(rows);
  return enriched;
}

module.exports = {
  createReport,
  getAllReports,
  resolveReport
};