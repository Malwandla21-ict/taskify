const express = require("express");
const { body, param, query } = require("express-validator");
const adminController = require("../controllers/admin.controller");
const { authenticate, authorize, requireTwoFactor } = require("../middleware/auth.middleware");
const { REPORT_TYPES } = require("../services/reportExport.service");

const router = express.Router();

/* Every route below requires a logged-in admin with two-factor authentication
   enabled — admin actions (ban, suspend, refund, promote) are the highest-value
   target in the app, so a stolen password alone must not be enough to use them.
   An admin without 2FA yet can still log in and enable it from their profile;
   see requireTwoFactor in auth.middleware.js. */
router.use(authenticate, authorize("admin"), requireTwoFactor);

router.get("/stats", adminController.getDashboardStats);

/* What a user ticked "I understand" to, and when (config/acknowledgements.js)
   — the evidence when a dispute or report comes in. */
router.get(
  "/users/:userId/acknowledgements",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  async (req, res, next) => {
    try {
      const { getAcknowledgementsForUser } = require("../services/acknowledgement.service");
      const data = await getAcknowledgementsForUser(Number(req.params.userId));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }
);

/* Analytics & Reports — numbers for a date range (?from=YYYY-MM-DD&to=…),
   and downloadable CSV reports. Every download is audit-logged. */
const rangeRules = [
  query("from").optional().isISO8601({ strict: true }).withMessage("from must be a date like 2026-10-01."),
  query("to").optional().isISO8601({ strict: true }).withMessage("to must be a date like 2026-10-31.")
];
router.get("/analytics", rangeRules, adminController.getAnalytics);
router.get(
  "/exports/:type",
  [param("type").isIn(REPORT_TYPES).withMessage(`Report must be one of: ${REPORT_TYPES.join(", ")}.`), ...rangeRules],
  adminController.downloadExport
);

router.get(
  "/users",
  [
    query("limit").optional().isInt({ min: 1, max: 500 }).withMessage("limit must be between 1 and 500."),
    query("offset").optional().isInt({ min: 0 }).withMessage("offset must be 0 or greater.")
  ],
  adminController.listUsers
);

router.patch(
  "/users/:userId/verify-lecturer",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.verifyLecturer
);

router.patch(
  "/users/:userId/unverify-lecturer",
  [ param("userId").isInt({ min: 1 }).withMessage("User ID must be a valid positive integer.") ],
  adminController.unverifyLecturer
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

/* Settle a disputed task: release to the worker, refund the poster, or
   send it back for more work. */
router.patch(
  "/tasks/:taskId/resolve-dispute",
  [
    param("taskId").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    body("outcome").isIn(["release", "refund", "rework"]).withMessage("Outcome must be release, refund or rework."),
    body("note").optional().trim().isLength({ max: 500 }).withMessage("Note must not exceed 500 characters.")
  ],
  adminController.resolveTaskDispute
);

/* Settle a reported sale: pay the seller, refund the buyer, or send them
   back to try the handover again with a new code. */
router.patch(
  "/sale-orders/:orderId/resolve-dispute",
  [
    param("orderId").isInt({ min: 1 }).withMessage("Order ID must be a valid positive integer."),
    body("outcome").isIn(["release", "refund", "retry"]).withMessage("Outcome must be release, refund or retry."),
    body("note").optional().trim().isLength({ max: 500 }).withMessage("Note must not exceed 500 characters.")
  ],
  adminController.resolveSaleDispute
);

const compensationRule = body("compensation").optional({ values: "falsy" })
  .isFloat({ min: 0, max: 1000000 }).withMessage("Compensation must be an amount in Rand.");

/* Settle a rental damage report from the owner's condition check. The
   renter is never charged; on damage_confirmed the owner can be paid
   `compensation` from the Taskify Protection Fund. */
router.patch(
  "/rental-bookings/:bookingId/resolve-damage",
  [
    param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer."),
    body("outcome").isIn(["renter_not_at_fault", "damage_confirmed"]).withMessage("Outcome must be renter_not_at_fault or damage_confirmed."),
    body("note").optional().trim().isLength({ max: 500 }).withMessage("Note must not exceed 500 characters."),
    compensationRule
  ],
  adminController.resolveRentalDamage
);

/* Settle a rental whose return is in doubt: confirm it was handed back,
   or close it as not returned (owner keeps the rent, optional payout
   from the Taskify Protection Fund, listing taken down). */
router.patch(
  "/rental-bookings/:bookingId/resolve-return",
  [
    param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer."),
    body("outcome").isIn(["returned", "not_returned"]).withMessage("Outcome must be returned or not_returned."),
    body("note").optional().trim().isLength({ max: 500 }).withMessage("Note must not exceed 500 characters."),
    compensationRule
  ],
  adminController.resolveRentalReturn
);

/* Where the Taskify Protection Fund stands (demo). */
router.get("/protection-fund", adminController.getProtectionFund);

router.patch(
  "/tasks/:taskId/refund",
  [
    param("taskId").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    body("reason").optional().trim().isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters.")
  ],
  adminController.refundPayment
);

/* AI-flagged content (tasks, sales listings, equipment listings, events)
   waiting on a human decision — see contentModeration.service.js for what
   gets flagged automatically, and moderation.service.js (a separate file)
   for user-level suspend/ban actions. */
router.get("/moderation", adminController.getModerationQueue);

router.patch(
  "/moderation/:contentType/:contentId/clear",
  [
    param("contentType").isIn(["task", "sales_item", "equipment", "event"]).withMessage("Invalid content type."),
    param("contentId").isInt({ min: 1 }).withMessage("Content ID must be a valid positive integer.")
  ],
  adminController.clearModerationFlag
);

/* Also the endpoint to act on a user report tied to a task/sales
   item/equipment listing/event — resolveReport (report.routes.js) only
   marks the report itself resolved; this is the step that actually takes
   the listing down. */
router.patch(
  "/moderation/:contentType/:contentId/remove",
  [
    param("contentType").isIn(["task", "sales_item", "equipment", "event"]).withMessage("Invalid content type."),
    param("contentId").isInt({ min: 1 }).withMessage("Content ID must be a valid positive integer."),
    body("reason").optional().trim().isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters.")
  ],
  adminController.removeContent
);

/* "Help shape Taskify" feedback: list it, and mark items reviewed. */
router.get(
  "/feedback",
  [ query("status").optional().isIn(["New", "Reviewed"]).withMessage("Status must be New or Reviewed.") ],
  adminController.listFeedback
);
router.patch(
  "/feedback/:feedbackId/reviewed",
  [ param("feedbackId").isInt({ min: 1 }).withMessage("Feedback ID must be a valid positive integer.") ],
  adminController.markFeedbackReviewed
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
