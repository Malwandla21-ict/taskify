const express = require("express");
const { body, param } = require("express-validator");
const controller = require("../controllers/conversation.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(authenticate);

router.post(
  "/start",
  [
    body("contextType").isIn(["task", "equipment", "sale"]).withMessage("Invalid context type."),
    body("contextId").isInt({ min: 1 }).withMessage("Context ID must be a valid positive integer.")
  ],
  controller.startConversation
);

router.get("/my", controller.getMyConversations);

router.get(
  "/:id/messages",
  [ param("id").isInt({ min: 1 }).withMessage("Conversation ID must be a valid positive integer.") ],
  controller.getMessages
);

router.post(
  "/:id/messages",
  [
    param("id").isInt({ min: 1 }).withMessage("Conversation ID must be a valid positive integer."),
    body("body").trim().notEmpty().withMessage("Message cannot be empty.")
      .isLength({ max: 2000 }).withMessage("Message must be under 2000 characters.")
  ],
  controller.sendMessage
);

router.post(
  "/messages/:messageId/flag",
  [
    param("messageId").isInt({ min: 1 }).withMessage("Message ID must be a valid positive integer."),
    body("reason").trim().notEmpty().withMessage("Reason is required.")
      .isLength({ min: 5, max: 500 }).withMessage("Reason must be between 5 and 500 characters.")
  ],
  controller.flagMessage
);

module.exports = router;