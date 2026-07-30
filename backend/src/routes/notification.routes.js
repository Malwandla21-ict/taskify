const express = require("express");
const { param } = require("express-validator");
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

/* GET /api/notifications — all notifications for logged-in user */
router.get("/", authenticate, notificationController.getUserNotifications);

/* GET /api/notifications/unread-count — for the navbar badge */
router.get("/unread-count", authenticate, notificationController.getUnreadCount);

/* PATCH /api/notifications/:id/read */
router.patch(
  "/:id/read",
  authenticate,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Notification ID must be a valid positive integer.")
  ],
  notificationController.markNotificationAsRead
);

module.exports = router;