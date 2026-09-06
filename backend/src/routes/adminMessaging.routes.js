const express = require("express");
const { param } = require("express-validator");
const controller = require("../controllers/adminMessaging.controller");
const { authenticate, authorize, requireTwoFactor } = require("../middleware/auth.middleware");

const router = express.Router();

/* requireTwoFactor added in Stage 4 of the 2FA rollout — this previously
   let an admin without 2FA read other users' private conversations, even
   though admin.routes.js already required it for every other admin
   action. Reading someone else's messages is at least as sensitive as
   anything gated there, so it gets the same requirement. */
router.use(authenticate, authorize("admin"), requireTwoFactor);

router.get("/", controller.getAllConversations);
router.get(
  "/:id/messages",
  [ param("id").isInt({ min: 1 }).withMessage("Conversation ID must be a valid positive integer.") ],
  controller.getConversationMessages
);

module.exports = router;