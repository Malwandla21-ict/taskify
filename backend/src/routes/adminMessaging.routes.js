const express = require("express");
const { param } = require("express-validator");
const controller = require("../controllers/adminMessaging.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(authenticate, authorize("admin"));

router.get("/", controller.getAllConversations);
router.get(
  "/:id/messages",
  [ param("id").isInt({ min: 1 }).withMessage("Conversation ID must be a valid positive integer.") ],
  controller.getConversationMessages
);

module.exports = router;