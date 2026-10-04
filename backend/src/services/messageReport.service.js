const pool = require("../config/db");
const conversationService = require("./conversation.service");
const notificationService = require("./notification.service");
const reportService = require("./report.service");

/* Flagging a chat message creates a report keyed by message_id (not by a
   context type/id) with the 'harassment' category — a flagged message is
   always an "abusive or inappropriate message" problem. It then shows up
   in the admin Reports table like any other report. */
async function flagMessage({ messageId, reporterId, reason }) {
  const [msgRows] = await pool.execute(
    `SELECT id, conversation_id, sender_id, body FROM messages WHERE id = ? LIMIT 1`,
    [messageId]
  );
  if (msgRows.length === 0) {
    const error = new Error("Message not found."); error.statusCode = 404; throw error;
  }
  const message = msgRows[0];

  await conversationService.assertParticipant(message.conversation_id, reporterId);

  if (Number(message.sender_id) === Number(reporterId)) {
    const error = new Error("You cannot flag your own message."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE messages SET is_flagged = 1 WHERE id = ?`, [messageId]);

  const reportId = await reportService.recordReport({
    reporterId,
    reportedUserId: message.sender_id,
    messageId,
    reason,
    category: "harassment"
  });

  /* recordReport doesn't notify, so tell admins here — otherwise a
     flagged message never surfaces anywhere for a human to review. */
  const [reporterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [reporterId]);
  const reporterName = reporterRows[0]?.full_name || "A student";
  const body = String(message.body || "");
  const preview = body.length > 100 ? `${body.slice(0, 100)}…` : body;

  await notificationService.notifyAllAdmins({
    title: "Message Flagged",
    message: `${reporterName} flagged a message for review: "${preview}"`
  });

  const [rows] = await pool.execute(`SELECT * FROM reports WHERE id = ? LIMIT 1`, [reportId]);
  return rows[0];
}

module.exports = { flagMessage };
