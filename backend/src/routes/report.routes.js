const express = require("express");
const { body, param } = require("express-validator");
const reportController = require("../controllers/report.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

const router = express.Router();

/* Any logged-in user can file a report */
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
      .isLength({ min: 10 }).withMessage("Reason must be at least 10 characters.")
  ],
  reportController.createReport
);

/* Admin only */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  reportController.getAllReports
);

router.patch(
  "/:id/resolve",
  authenticate,
  authorize("admin"),
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
  [
    param("userId")
      .isInt({ min: 1 }).withMessage("User ID must be a valid integer.")
  ],
  reportController.suspendUser
);

module.exports = router;