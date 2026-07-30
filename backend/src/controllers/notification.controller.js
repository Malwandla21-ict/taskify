const { validationResult } = require("express-validator");
const notificationService = require("../services/notification.service");

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

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead
};