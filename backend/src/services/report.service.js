const pool = require("../config/db");
const auditLogService = require("./auditlog.service");
const notificationService = require("./notification.service");
const protectionFund = require("./protectionFund.service");
const { returnDecisionsFor } = require("./rentalCore.service");
const { RENTAL_PROTECTION_FUND } = require("../config/paymentSettings");

/* What a report can be about. 'equipment' is the listing itself (reported
   from equipment-details.html); 'equipment_booking' is one specific rental
   (used by the owner's "Report Damage" flow). Flagged chat messages don't
   use a context — they're keyed by reports.message_id instead. */
const VALID_CONTEXT_TYPES = ["task", "equipment", "equipment_booking", "sales_item", "event"];

/* What KIND of problem it is — lets admins filter the Reports table.
   Keep in sync with REPORT_CATEGORIES in frontend/js/helpers.js and the
   ENUM in scripts/repair-report-categories-schema.js. */
const VALID_CATEGORIES = [
  "payment",
  "damaged_item",
  "not_as_described",
  "no_show",
  "scam",
  "harassment",
  "inappropriate",
  "other"
];

const CATEGORY_LABELS = {
  payment: "Money / payment problem",
  damaged_item: "Broken or damaged item",
  not_as_described: "Not as described",
  no_show: "Didn't show up / didn't do the work",
  scam: "Scam or fraud",
  harassment: "Harassment or abusive messages",
  inappropriate: "Inappropriate or not-allowed content",
  other: "Something else"
};

function badRequest(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/* Looks up a human-readable label and the id needed to link back to the
   right detail page for a given report context. Equipment bookings need
   translating to their equipment_id since equipment-details.html is keyed
   by equipment, not by booking. */
async function resolveContext(contextType, contextId) {
  if (contextType === "task") {
    const [rows] = await pool.execute(`SELECT id, title FROM tasks WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) throw badRequest("Task not found.", 404);
    return { title: rows[0].title, linkId: rows[0].id };
  }
  if (contextType === "equipment") {
    const [rows] = await pool.execute(`SELECT id, name FROM equipment WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) throw badRequest("Equipment not found.", 404);
    return { title: rows[0].name, linkId: rows[0].id };
  }
  if (contextType === "equipment_booking") {
    const [rows] = await pool.execute(
      `SELECT eb.id, eb.equipment_id, e.name
       FROM equipment_bookings eb
       INNER JOIN equipment e ON eb.equipment_id = e.id
       WHERE eb.id = ? LIMIT 1`,
      [contextId]
    );
    if (!rows.length) throw badRequest("Equipment booking not found.", 404);
    return { title: rows[0].name, linkId: rows[0].equipment_id };
  }
  if (contextType === "sales_item") {
    const [rows] = await pool.execute(`SELECT id, title FROM sales_items WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) throw badRequest("Sales item not found.", 404);
    return { title: rows[0].title, linkId: rows[0].id };
  }
  if (contextType === "event") {
    const [rows] = await pool.execute(`SELECT id, title FROM events WHERE id = ? LIMIT 1`, [contextId]);
    if (!rows.length) throw badRequest("Event not found.", 404);
    return { title: rows[0].title, linkId: rows[0].id };
  }
  throw badRequest("Invalid report context type.");
}

/* Writes the report row only — no notifications. Used by createReport
   below and by flows that already notify admins themselves (e.g. the
   rental "Report Damage" flow in equipment.service.js). */
async function recordReport({ reporterId, reportedUserId, contextType = null, contextId = null, messageId = null, reason, category = "other" }) {
  const cleanCategory = VALID_CATEGORIES.includes(category) ? category : "other";
  const [result] = await pool.execute(
    `INSERT INTO reports (reporter_id, reported_user_id, context_type, context_id, message_id, reason, category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reporterId, reportedUserId, contextType, contextId, messageId, String(reason).trim().slice(0, 2000), cleanCategory]
  );
  return result.insertId;
}

async function createReport({ reporterId, reportedUserId, contextType, contextId, reason, category }) {
  if (Number(reporterId) === Number(reportedUserId)) {
    throw badRequest("You cannot report yourself.");
  }

  if (!VALID_CATEGORIES.includes(category)) {
    throw badRequest("Please choose what kind of problem this is.");
  }

  const [reportedUserRows] = await pool.execute(
    `SELECT id, full_name FROM users WHERE id = ? LIMIT 1`,
    [reportedUserId]
  );

  if (reportedUserRows.length === 0) {
    throw badRequest("Reported user not found.", 404);
  }

  const hasContextType = contextType !== undefined && contextType !== null && contextType !== "";
  const hasContextId   = contextId !== undefined && contextId !== null && contextId !== "";

  let context = null;
  if (hasContextType || hasContextId) {
    if (!hasContextType || !hasContextId) {
      throw badRequest("Both a context type and context ID are required together.");
    }
    if (!VALID_CONTEXT_TYPES.includes(contextType)) {
      throw badRequest("Invalid report context type.");
    }
    context = await resolveContext(contextType, Number(contextId));

    /* Stop the same person filing the same complaint about the same item
       over and over while an admin is still looking at the first one. */
    const [dupes] = await pool.execute(
      `SELECT id FROM reports
       WHERE reporter_id = ? AND context_type = ? AND context_id = ? AND category = ? AND status = 'Pending'
       LIMIT 1`,
      [reporterId, contextType, Number(contextId), category]
    );
    if (dupes.length) {
      throw badRequest("You've already reported this problem. An admin is looking at it.", 409);
    }
  }

  const reportId = await recordReport({
    reporterId,
    reportedUserId,
    contextType: context ? contextType : null,
    contextId: context ? Number(contextId) : null,
    reason,
    category
  });

  const [rows] = await pool.execute(
    `SELECT id, reporter_id, reported_user_id, context_type, context_id, message_id, reason, category, status, created_at
     FROM reports WHERE id = ? LIMIT 1`,
    [reportId]
  );

  const report = rows[0];

  const [reporterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [reporterId]);
  const reporterName  = reporterRows[0]?.full_name || "A student";
  const reportedName  = reportedUserRows[0].full_name;
  const cleanReason   = String(reason).trim();
  const reasonPreview = cleanReason.length > 120 ? `${cleanReason.slice(0, 120)}…` : cleanReason;
  const contextNote   = context ? ` about "${context.title}"` : "";

  await notificationService.notifyAllAdmins({
    title: `New Report: ${CATEGORY_LABELS[category]}`,
    message: `${reporterName} reported ${reportedName}${contextNote}. Details: ${reasonPreview}`,
    email: true
  });

  return { ...report, context_title: context?.title || null, context_link_id: context?.linkId || null };
}

async function getAllReports() {
  const [rows] = await pool.execute(
    `SELECT
       r.id, r.reporter_id, r.reported_user_id, r.context_type, r.context_id, r.message_id,
       r.reason, r.category, r.status, r.created_at,
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
  const idsOf = (type) => rows.filter(r => r.context_type === type).map(r => r.context_id);
  const taskIds      = idsOf("task");
  const equipmentIds = idsOf("equipment");
  const bookingIds   = idsOf("equipment_booking");
  const salesItemIds = idsOf("sales_item");
  const eventIds     = idsOf("event");
  const messageIds   = rows.filter(r => r.message_id).map(r => r.message_id);

  const taskMap = new Map();
  if (taskIds.length) {
    const [taskRows] = await pool.query(`SELECT id, title, status FROM tasks WHERE id IN (?)`, [taskIds]);
    taskRows.forEach(t => taskMap.set(t.id, { title: t.title, linkId: t.id, status: t.status }));
  }

  const equipmentMap = new Map();
  if (equipmentIds.length) {
    const [equipmentRows] = await pool.query(`SELECT id, name FROM equipment WHERE id IN (?)`, [equipmentIds]);
    equipmentRows.forEach(e => equipmentMap.set(e.id, { title: e.name, linkId: e.id }));
  }

  const bookingMap = new Map();
  if (bookingIds.length) {
    /* A rental with an open damage report (owner's condition check) gets
       the damage outcomes in the admin Reports table; one whose return is
       in doubt (hand-back not confirmed or disputed, or overdue) gets the
       return outcomes. `rental` carries what the admin needs to decide,
       including the most the Taskify Protection Fund can pay for it. */
    const [bookingRows] = await pool.query(
      `SELECT eb.id, eb.equipment_id, e.name, e.item_value, eb.status, eb.condition_status, eb.damage_outcome,
              eb.payment_status, eb.picked_up_at, eb.return_due_at, eb.return_reported_at, eb.return_disputed_at,
              eb.rental_amount
       FROM equipment_bookings eb
       INNER JOIN equipment e ON eb.equipment_id = e.id
       WHERE eb.id IN (?)`,
      [bookingIds]
    );
    const fundBalance = bookingRows.length ? await protectionFund.getBalance() : 0;
    bookingRows.forEach(b => {
      const damageOpen = b.condition_status === "Damaged" && !b.damage_outcome;
      const { canConfirm, canCloseMissing } = returnDecisionsFor(b);
      bookingMap.set(b.id, {
        title: b.name, linkId: b.equipment_id,
        status: damageOpen ? "DamageReported" : (canConfirm || canCloseMissing) ? "ReturnOpen" : null,
        rental: {
          canConfirm, canCloseMissing,
          returnReportedAt: b.return_reported_at, returnDisputed: !!b.return_disputed_at,
          returnDueAt: b.return_due_at,
          itemValue: b.item_value == null ? null : Number(b.item_value),
          rent: b.rental_amount == null ? null : Number(b.rental_amount),
          payoutLimit: protectionFund.payoutLimit({ itemValue: b.item_value, balance: fundBalance }),
          fundBalance,
          maxPayoutPerClaim: RENTAL_PROTECTION_FUND.maxPayoutPerClaim
        }
      });
    });
  }

  const salesMap = new Map();
  if (salesItemIds.length) {
    /* A reported sale (buyer or seller pressed "Report a problem") has an
       order in 'Disputed' — the admin table offers the outcomes for it. */
    const [salesRows] = await pool.query(
      `SELECT si.id, si.title,
              (SELECT so.id FROM sale_orders so
               WHERE so.sales_item_id = si.id AND so.status = 'Disputed'
               ORDER BY so.id DESC LIMIT 1) AS disputed_order_id
       FROM sales_items si WHERE si.id IN (?)`,
      [salesItemIds]
    );
    salesRows.forEach(s => salesMap.set(s.id, {
      title: s.title, linkId: s.id,
      status: s.disputed_order_id ? "Disputed" : null,
      orderId: s.disputed_order_id || null
    }));
  }

  const eventMap = new Map();
  if (eventIds.length) {
    const [eventRows] = await pool.query(`SELECT id, title FROM events WHERE id IN (?)`, [eventIds]);
    eventRows.forEach(ev => eventMap.set(ev.id, { title: ev.title, linkId: ev.id }));
  }

  /* Flagged messages: show a short preview of the message itself so the
     admin sees exactly what was reported. */
  const messageMap = new Map();
  if (messageIds.length) {
    const [messageRows] = await pool.query(`SELECT id, body FROM messages WHERE id IN (?)`, [messageIds]);
    messageRows.forEach(m => {
      const body = String(m.body || "");
      messageMap.set(m.id, { title: `"${body.length > 60 ? body.slice(0, 60) + "…" : body}"`, linkId: null });
    });
  }

  const maps = {
    task: taskMap,
    equipment: equipmentMap,
    equipment_booking: bookingMap,
    sales_item: salesMap,
    event: eventMap
  };

  return rows.map(row => {
    let context = null;
    if (row.message_id) context = messageMap.get(row.message_id) || { title: "(message deleted)", linkId: null };
    else if (row.context_type && maps[row.context_type]) context = maps[row.context_type].get(row.context_id) || null;

    return {
      ...row,
      category: row.category || "other",
      category_label: CATEGORY_LABELS[row.category] || CATEGORY_LABELS.other,
      context_title: context ? context.title : null,
      context_link_id: context ? context.linkId : null,
      /* Tasks and sales: lets the admin Reports table offer dispute outcomes. */
      context_status: context && context.status ? context.status : null,
      context_order_id: context && context.orderId ? context.orderId : null,
      /* Rentals: what the damage / return outcomes need. */
      context_rental: context && context.rental ? context.rental : null
    };
  });
}

async function resolveReport(reportId, adminId) {
  const [reportRows] = await pool.execute(
    `SELECT id, status, reported_user_id FROM reports WHERE id = ? LIMIT 1`,
    [reportId]
  );

  if (reportRows.length === 0) {
    throw badRequest("Report not found.", 404);
  }

  const report = reportRows[0];

  if (report.status === "Resolved") {
    throw badRequest("Report is already resolved.");
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
    `SELECT r.id, r.reporter_id, r.reported_user_id, r.context_type, r.context_id, r.message_id,
            r.reason, r.category, r.status, r.created_at,
            reporter.full_name AS reporter_name,
            reported.full_name AS reported_user_name
     FROM reports r
     INNER JOIN users reporter ON r.reporter_id = reporter.id
     INNER JOIN users reported ON r.reported_user_id = reported.id
     WHERE r.id = ? LIMIT 1`,
    [reportId]
  );

  const [enriched] = await enrichReportsWithContext(rows);
  return enriched;
}

module.exports = {
  VALID_CONTEXT_TYPES,
  VALID_CATEGORIES,
  CATEGORY_LABELS,
  createReport,
  recordReport,
  getAllReports,
  resolveReport
};
