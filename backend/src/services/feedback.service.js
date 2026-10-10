const pool = require("../config/db");
const notificationService = require("./notification.service");
const auditLogService = require("./auditlog.service");

/*
  "Help shape Taskify" — ideas, problems, consultation requests and offers
  to help test new features (usability testing, pilots). Lecturers were
  especially asked to take part. Sending feedback is participation in
  improving the product only: it never gives anyone extra permissions, and
  nothing sent here is published.
*/
const FEEDBACK_KINDS = {
  idea: "An idea or improvement",
  problem: "Something isn't working",
  consultation: "I'd like to be consulted on a feature or policy",
  testing: "I'd like to help test new features"
};

const DAILY_LIMIT = 5;

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function createFeedback(userId, { kind, message }) {
  if (!FEEDBACK_KINDS[kind]) throw httpError("Please choose what kind of feedback this is.", 400);
  const clean = String(message || "").trim().slice(0, 2000);
  if (clean.length < 10) throw httpError("Please write at least a sentence (10 characters or more).", 400);

  const [recent] = await pool.execute(
    `SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 DAY`, [userId]
  );
  if (Number(recent[0].n) >= DAILY_LIMIT) {
    throw httpError(`You've sent ${DAILY_LIMIT} pieces of feedback today — thank you! Please send more tomorrow.`, 429);
  }

  const [result] = await pool.execute(
    `INSERT INTO feedback (user_id, kind, message) VALUES (?, ?, ?)`, [userId, kind, clean]
  );
  const [userRows] = await pool.execute(`SELECT full_name, member_type FROM users WHERE id = ?`, [userId]);
  const who = userRows[0] ? `${userRows[0].full_name} (${userRows[0].member_type})` : "A user";
  await notificationService.notifyAllAdmins({
    title: "New Feedback",
    message: `${who}: ${FEEDBACK_KINDS[kind].toLowerCase()} — "${clean.slice(0, 140)}${clean.length > 140 ? "…" : ""}" See Admin → Feedback.`
  });
  return { id: result.insertId, kind, status: "New" };
}

async function listFeedback({ status = null } = {}) {
  const [rows] = await pool.query(
    `SELECT f.id, f.kind, f.message, f.status, f.created_at, f.reviewed_at,
            u.id AS user_id, u.full_name AS user_name, u.member_type, u.lecturer_verified,
            r.full_name AS reviewed_by_name
     FROM feedback f
     INNER JOIN users u ON u.id = f.user_id
     LEFT JOIN users r ON r.id = f.reviewed_by
     ${status ? "WHERE f.status = ?" : ""}
     ORDER BY (f.status = 'New') DESC, f.created_at DESC
     LIMIT 300`,
    status ? [status] : []
  );
  return rows.map((row) => ({ ...row, kind_label: FEEDBACK_KINDS[row.kind] }));
}

async function markReviewed(feedbackId, adminId) {
  const [result] = await pool.execute(
    `UPDATE feedback SET status = 'Reviewed', reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND status = 'New'`,
    [adminId, feedbackId]
  );
  if (!result.affectedRows) throw httpError("This feedback was not found or is already reviewed.", 400);
  await auditLogService.createAuditLog({ adminId, action: "feedback.reviewed", targetType: "feedback", targetId: feedbackId });
  return { id: feedbackId, status: "Reviewed" };
}

module.exports = { FEEDBACK_KINDS, createFeedback, listFeedback, markReviewed };
