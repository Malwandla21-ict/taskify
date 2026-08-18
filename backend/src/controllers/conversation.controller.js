const { validationResult } = require("express-validator");
const conversationService = require("../services/conversation.service");
const messageReportService = require("../services/messageReport.service");

async function startConversation(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const conversation = await conversationService.startConversation({
      contextType: req.body.contextType,
      contextId: Number(req.body.contextId),
      initiatorId: req.user.id
    });
    return res.status(201).json({ success: true, message: "Conversation ready.", data: conversation });
  } catch (error) { next(error); }
}

async function getMyConversations(req, res, next) {
  try {
    const conversations = await conversationService.getMyConversations(req.user.id);
    return res.status(200).json({ success: true, message: "Conversations fetched successfully.", data: conversations });
  } catch (error) { next(error); }
}

async function getMessages(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const messages = await conversationService.getMessages(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Messages fetched successfully.", data: messages });
  } catch (error) { next(error); }
}

async function sendMessage(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const message = await conversationService.sendMessage(Number(req.params.id), req.user.id, req.body.body);
    return res.status(201).json({ success: true, message: "Message sent.", data: message });
  } catch (error) { next(error); }
}

async function flagMessage(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const report = await messageReportService.flagMessage({
      messageId: Number(req.params.messageId),
      reporterId: req.user.id,
      reason: req.body.reason
    });
    return res.status(201).json({ success: true, message: "Message flagged for review.", data: report });
  } catch (error) { next(error); }
}

module.exports = { startConversation, getMyConversations, getMessages, sendMessage, flagMessage };