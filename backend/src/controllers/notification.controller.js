const { validationResult } = require("express-validator");
const notificationService = require("../services/notification.service");
const pushService = require("../services/push.service");

async function getUserNotifications(req, res, next) {
  try {
    const notifications = await notificationService.getUserNotifications(req.user.id);
    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully.",
      data: notifications
    });
  } catch (error) {
    next(error);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    return res.status(200).json({
      success: true,
      message: "Unread count fetched.",
      data: { count }
    });
  } catch (error) {
    next(error);
  }
}

async function markNotificationAsRead(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const notification = await notificationService.markNotificationAsRead(
      Number(req.params.id),
      req.user.id
    );
    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      data: notification
    });
  } catch (error) {
    next(error);
  }
}

/* GET /api/notifications/push/public-key — not secret, just tells the
   browser which VAPID key pair it's subscribing against. */
async function getPushPublicKey(req, res, next) {
  try {
    const publicKey = pushService.getPublicKey();
    return res.status(200).json({
      success: true,
      message: "Push public key fetched.",
      data: { publicKey }
    });
  } catch (error) {
    next(error);
  }
}

async function subscribeToPush(req, res, next) {
  try {
    await pushService.saveSubscription(req.user.id, req.body.subscription);
    return res.status(200).json({
      success: true,
      message: "Subscribed to push notifications."
    });
  } catch (error) {
    next(error);
  }
}

async function unsubscribeFromPush(req, res, next) {
  try {
    await pushService.removeSubscription(req.user.id, req.body.endpoint);
    return res.status(200).json({
      success: true,
      message: "Unsubscribed from push notifications."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  getPushPublicKey,
  subscribeToPush,
  unsubscribeFromPush
};