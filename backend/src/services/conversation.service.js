const pool = require("../config/db");
const notificationService = require("./notification.service");

const CONTEXT_TABLES = {
  task:      { table: "tasks",       titleCol: "title", ownerCol: "created_by" },
  equipment: { table: "equipment",   titleCol: "name",  ownerCol: "owner_id" },
  sale:      { table: "sales_items", titleCol: "title", ownerCol: "seller_id" }
};

async function getContextListing(contextType, contextId) {
  const config = CONTEXT_TABLES[contextType];
  if (!config) {
    const error = new Error("Invalid context type."); error.statusCode = 400; throw error;
  }
  const [rows] = await pool.execute(
    `SELECT id, ${config.titleCol} AS title, ${config.ownerCol} AS owner_id FROM ${config.table} WHERE id = ? LIMIT 1`,
    [contextId]
  );
  if (rows.length === 0) {
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }
  return rows[0];
}

async function startConversation({ contextType, contextId, initiatorId }) {
  const listing = await getContextListing(contextType, contextId);
  const recipientId = listing.owner_id;

  if (Number(recipientId) === Number(initiatorId)) {
    const error = new Error("You cannot message yourself about your own listing."); error.statusCode = 400; throw error;
  }

  const userA = Math.min(initiatorId, recipientId);
  const userB = Math.max(initiatorId, recipientId);

  const [existing] = await pool.execute(
    `SELECT id FROM conversations WHERE context_type = ? AND context_id = ? AND user_a_id = ? AND user_b_id = ? LIMIT 1`,
    [contextType, contextId, userA, userB]
  );

  if (existing.length > 0) return getConversationById(existing[0].id, initiatorId);

  const [result] = await pool.execute(
    `INSERT INTO conversations (context_type, context_id, user_a_id, user_b_id) VALUES (?, ?, ?, ?)`,
    [contextType, contextId, userA, userB]
  );

  return getConversationById(result.insertId, initiatorId);
}

async function assertParticipant(conversationId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, user_a_id, user_b_id, context_type, context_id FROM conversations WHERE id = ? LIMIT 1`,
    [conversationId]
  );
  if (rows.length === 0) {
    const error = new Error("Conversation not found."); error.statusCode = 404; throw error;
  }
  const conv = rows[0];
  if (Number(conv.user_a_id) !== Number(userId) && Number(conv.user_b_id) !== Number(userId)) {
    const error = new Error("You are not part of this conversation."); error.statusCode = 403; throw error;
  }
  return conv;
}

async function getMyConversations(userId) {
  const [rows] = await pool.execute(
    `SELECT
       c.id, c.context_type, c.context_id, c.user_a_id, c.user_b_id, c.updated_at,
       other.id AS other_user_id, other.full_name AS other_user_name,
       other.profile_photo_url AS other_user_photo,
       (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
     FROM conversations c
     INNER JOIN users other ON other.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     WHERE c.user_a_id = ? OR c.user_b_id = ?
     ORDER BY c.updated_at DESC`,
    [userId, userId, userId]
  );

  for (const row of rows) {
    try {
      const listing = await getContextListing(row.context_type, row.context_id);
      row.context_title = listing.title;
    } catch {
      row.context_title = "Listing no longer available";
    }
  }

  return rows;
}

async function getConversationById(conversationId, requestingUserId) {
  await assertParticipant(conversationId, requestingUserId);
  const [rows] = await pool.execute(
    `SELECT
       c.id, c.context_type, c.context_id, c.user_a_id, c.user_b_id,
       other.id AS other_user_id, other.full_name AS other_user_name,
       other.profile_photo_url AS other_user_photo
     FROM conversations c
     INNER JOIN users other ON other.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     WHERE c.id = ? LIMIT 1`,
    [requestingUserId, conversationId]
  );
  const conv = rows[0];
  const listing = await getContextListing(conv.context_type, conv.context_id);
  conv.context_title = listing.title;
  return conv;
}

async function getMessages(conversationId, requestingUserId) {
  await assertParticipant(conversationId, requestingUserId);
  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.is_flagged, m.created_at,
            u.full_name AS sender_name
     FROM messages m
     INNER JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC`,
    [conversationId]
  );
  return rows;
}

async function sendMessage(conversationId, senderId, body) {
  const conv = await assertParticipant(conversationId, senderId);
  const recipientId = Number(conv.user_a_id) === Number(senderId) ? conv.user_b_id : conv.user_a_id;

  const [result] = await pool.execute(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`,
    [conversationId, senderId, body.trim()]
  );

  await pool.execute(`UPDATE conversations SET updated_at = NOW() WHERE id = ?`, [conversationId]);

  const [senderRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [senderId]);
  await notificationService.createNotification({
    userId: recipientId,
    title: "New Message",
    message: `${senderRows[0]?.full_name || "A student"} sent you a message.`
  });

  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.is_flagged, m.created_at,
            u.full_name AS sender_name
     FROM messages m INNER JOIN users u ON m.sender_id = u.id
     WHERE m.id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

async function getAllConversationsForAdmin() {
  const [rows] = await pool.execute(
    `SELECT
       c.id, c.context_type, c.context_id, c.updated_at,
       ua.full_name AS user_a_name, ub.full_name AS user_b_name,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_flagged = 1) AS flagged_count
     FROM conversations c
     INNER JOIN users ua ON c.user_a_id = ua.id
     INNER JOIN users ub ON c.user_b_id = ub.id
     ORDER BY c.updated_at DESC`
  );
  return rows;
}

async function getMessagesForAdmin(conversationId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.is_flagged, m.created_at,
            u.full_name AS sender_name
     FROM messages m
     INNER JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC`,
    [conversationId]
  );
  return rows;
}

module.exports = {
  startConversation,
  getMyConversations,
  getConversationById,
  getMessages,
  sendMessage,
  assertParticipant,
  getAllConversationsForAdmin,
  getMessagesForAdmin
};