const express = require("express");
const { body, param } = require("express-validator");
const reportController = require("../controllers/report.controller");
const { authenticate, authorize, requireTwoFactor } = require("../middleware/auth.middleware");

const router = express.Router();

/* Any logged-in user can file a report. contextType/contextId are optional,
   but if either is present, both must be — a report can't be "about" a
   context type with no id or vice versa. */
router.post(
  "/",
  authenticate,
  [
    body("reportedUserId")
      .notEmpty().withMessage("Reported user ID is required.")
      .isInt({ min: 1 }).withMessage("Invalid user ID."),
    body("reason")
      .trim()
      .notEmpty().withMessage("Reason is required.")
      .isLength({ min: 10 }).withMessage("Reason must be at least 10 characters."),
    body("contextType")
      .optional({ nullable: true })
      .isIn(["task", "equipment_booking", "sales_item", "event"]).withMessage("Invalid context type."),
    body("contextId")
      .optional({ nullable: true })
      .isInt({ min: 1 }).withMessage("Invalid context ID."),
    body().custom((value) => {
      const hasType = value.contextType !== undefined && value.contextType !== null && value.contextType !== "";
      const hasId   = value.contextId !== undefined && value.contextId !== null && value.contextId !== "";
      if (hasType !== hasId) {
        throw new Error("Both contextType and contextId must be provided together.");
      }
      return true;
    })
  ],
  reportController.createReport
);

/* Admin only. requireTwoFactor added in Stage 4 of the 2FA rollout —
   these three were reachable by an admin without 2FA even though
   admin.routes.js already required it for equivalent actions (ban is
   gated there; suspend, here, was not) — closing that inconsistency. */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  requireTwoFactor,
  reportController.getAllReports
);

router.patch(
  "/:id/resolve",
  authenticate,
  authorize("admin"),
  requireTwoFactor,
  [
    param("id")
      .isInt({ min: 1 }).withMessage("Report ID must be a valid integer.")
  ],
  reportController.resolveReport
);

router.patch(
  "/users/:userId/suspend",
  authenticate,
  authorize("admin"),
  requireTwoFactor,
  [
    param("userId")
      .isInt({ min: 1 }).withMessage("User ID must be a valid integer."),
    body("reason")
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage("Reason must not exceed 500 characters.")
  ],
  reportController.suspendUser
);

module.exports = router;