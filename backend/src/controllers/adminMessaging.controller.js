const conversationService = require("../services/conversation.service");

async function getAllConversations(req, res, next) {
  try {
    const conversations = await conversationService.getAllConversationsForAdmin();
    return res.status(200).json({ success: true, message: "Conversations fetched successfully.", data: conversations });
  } catch (error) { next(error); }
}

async function getConversationMessages(req, res, next) {
  try {
    const messages = await conversationService.getMessagesForAdmin(Number(req.params.id));
    return res.status(200).json({ success: true, message: "Messages fetched successfully.", data: messages });
  } catch (error) { next(error); }
}

module.exports = { getAllConversations, getConversationMessages };