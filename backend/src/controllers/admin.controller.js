const { validationResult } = require("express-validator");
const adminService = require("../services/admin.service");
const auditLogService = require("../services/auditLog.service");
const moderationService = require("../services/moderation.service");

async function getDashboardStats(req, res, next) {
  try {
    const stats = await adminService.getDashboardStats();
    return res.status(200).json({ success: true, message: "Dashboard stats fetched successfully.", data: stats });
  } catch (error) { next(error); }
}

async function listUsers(req, res, next) {
  try {
    const users = await adminService.getAllUsersForAdmin({
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.status(200).json({ success: true, message: "Users fetched successfully.", data: users });
  } catch (error) { next(error); }
}

async function promoteUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const user = await adminService.promoteUserToAdmin(Number(req.params.userId), req.user.id);
    return res.status(200).json({ success: true, message: "User promoted to admin.", data: user });
  } catch (error) { next(error); }
}

async function demoteAdmin(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const user = await adminService.demoteAdminToUser(Number(req.params.userId), req.user.id);
    return res.status(200).json({ success: true, message: "Admin demoted successfully.", data: user });
  } catch (error) { next(error); }
}

async function unsuspendUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const user = await moderationService.unsuspendUser(Number(req.params.userId), req.user.id);
    return res.status(200).json({ success: true, message: "User unsuspended successfully.", data: user });
  } catch (error) { next(error); }
}

async function banUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const user = await moderationService.banUser(Number(req.params.userId), req.user.id, req.body.reason);
    return res.status(200).json({ success: true, message: "User banned successfully.", data: user });
  } catch (error) { next(error); }
}

async function unbanUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const user = await moderationService.unbanUser(Number(req.params.userId), req.user.id);
    return res.status(200).json({ success: true, message: "User unbanned successfully.", data: user });
  } catch (error) { next(error); }
}

async function refundPayment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const result = await moderationService.refundPayment(Number(req.params.taskId), req.user.id, req.body.reason);
    return res.status(200).json({ success: true, message: "Payment refunded successfully.", data: result });
  } catch (error) { next(error); }
}

async function getAuditLogs(req, res, next) {
  try {
    const logs = await auditLogService.getAuditLogs({
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.status(200).json({ success: true, message: "Audit logs fetched successfully.", data: logs });
  } catch (error) { next(error); }
}

module.exports = {
  getDashboardStats,
  listUsers,
  promoteUser,
  demoteAdmin,
  unsuspendUser,
  banUser,
  unbanUser,
  refundPayment,
  getAuditLogs
};