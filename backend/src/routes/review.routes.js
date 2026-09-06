const express = require("express");
const { body, param } = require("express-validator");
const reviewController = require("../controllers/review.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.post(
  "/tasks/:taskId",
  authenticate,
  [
    param("taskId")
      .isInt({ min: 1 })
      .withMessage("Task ID must be a valid positive integer."),
    body("rating")
      .notEmpty()
      .withMessage("Rating is required.")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be an integer between 1 and 5."),
    body("comment")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Comment must not exceed 1000 characters.")
  ],
  reviewController.createReview
);

router.post(
  "/bookings/:bookingId",
  authenticate,
  [
    param("bookingId")
      .isInt({ min: 1 })
      .withMessage("Booking ID must be a valid positive integer."),
    body("rating")
      .notEmpty()
      .withMessage("Rating is required.")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be an integer between 1 and 5."),
    body("comment")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Comment must not exceed 1000 characters.")
  ],
  reviewController.createEquipmentReview
);

/* Edit/delete — author only, enforced in the service layer. */
router.patch(
  "/:reviewId",
  authenticate,
  [
    param("reviewId")
      .isInt({ min: 1 })
      .withMessage("Review ID must be a valid positive integer."),
    body("rating")
      .notEmpty()
      .withMessage("Rating is required.")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be an integer between 1 and 5."),
    body("comment")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Comment must not exceed 1000 characters.")
  ],
  reviewController.updateReview
);

router.delete(
  "/:reviewId",
  authenticate,
  [
    param("reviewId")
      .isInt({ min: 1 })
      .withMessage("Review ID must be a valid positive integer.")
  ],
  reviewController.deleteReview
);

module.exports = router;