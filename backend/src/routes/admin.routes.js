const express = require("express");
const { body, param, query } = require("express-validator");
const adminController = require("../controllers/admin.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

const router = express.Router();

/* Every route below requires a logged-in admin. */
router.use(authenticate, authorize("admin"));

router.get("/stats", adminController.getDashboardStats);

router.get(
  "/users",
  [
    query("limit").optional().isInt({ min: 1, max: 500 }).withMessage("limit must be between 1 and 500."),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be 0 or greater.")
  ],
  adminController.listUsers
);

router.patch(
  "/users/:userId/promote",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.promoteUser
);

/* Reverses a promotion. Blocked server-side if the target is the only
   admin left — see demoteAdminToUser in admin.service.js. */
router.patch(
  "/users/:userId/demote",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.demoteAdmin
);

router.patch(
  "/users/:userId/unsuspend",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.unsuspendUser
);

router.patch(
  "/users/:userId/ban",
  [
    param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer."),
    body("reason").optional().trim().isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters.")
  ],
  adminController.banUser
);

router.patch(
  "/users/:userId/unban",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.unbanUser
);

router.patch(
  "/tasks/:taskId/refund",
  [
    param("taskId").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    body("reason").optional().trim().isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters.")
  ],
  adminController.refundPayment
);

router.get(
  "/audit-logs",
  [
    query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit must be between 1 and 200."),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be 0 or greater.")
  ],
  adminController.getAuditLogs
);

module.exports = router;