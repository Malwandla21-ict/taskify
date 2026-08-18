const pool = require("../config/db");
const conversationService = require("./conversation.service");

async function flagMessage({ messageId, reporterId, reason }) {
  const [msgRows] = await pool.execute(
    `SELECT id, conversation_id, sender_id FROM messages WHERE id = ? LIMIT 1`,
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

  const [result] = await pool.execute(
    `INSERT INTO reports (reporter_id, reported_user_id, message_id, reason) VALUES (?, ?, ?, ?)`,
    [reporterId, message.sender_id, messageId, reason.trim()]
  );

  const [rows] = await pool.execute(`SELECT * FROM reports WHERE id = ? LIMIT 1`, [result.insertId]);
  return rows[0];
}

module.exports = { flagMessage };