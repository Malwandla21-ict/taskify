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

/* GET /api/notifications/push/public-key — no auth needed, the VAPID
   public key isn't secret; the frontend needs it before a user even has
   a token if we ever want to offer this pre-login (not done yet, but
   costs nothing to leave open). */
router.get("/push/public-key", notificationController.getPushPublicKey);

/* POST /api/notifications/push/subscribe — body: { subscription } (the
   raw PushSubscription object from the browser's pushManager.subscribe). */
router.post("/push/subscribe", authenticate, notificationController.subscribeToPush);

/* POST /api/notifications/push/unsubscribe — body: { endpoint } */
router.post("/push/unsubscribe", authenticate, notificationController.unsubscribeFromPush);

module.exports = router;