const { validationResult } = require("express-validator");
const reviewService = require("../services/review.service");

async function createReview(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const taskId = Number(req.params.taskId);
    const reviewerId = req.user.id;
    const { rating, comment } = req.body;

    const review = await reviewService.createReview({
      taskId,
      reviewerId,
      rating,
      comment
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
      data: review
    });
  } catch (error) {
    next(error);
  }
}

async function createEquipmentReview(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const bookingId = Number(req.params.bookingId);
    const reviewerId = req.user.id;
    const { rating, comment } = req.body;

    const review = await reviewService.createEquipmentReview({
      bookingId,
      reviewerId,
      rating,
      comment
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
      data: review
    });
  } catch (error) {
    next(error);
  }
}

async function updateReview(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const reviewId = Number(req.params.reviewId);
    const userId = req.user.id;
    const { rating, comment } = req.body;

    const review = await reviewService.updateReview({
      reviewId,
      userId,
      rating,
      comment
    });

    return res.status(200).json({
      success: true,
      message: "Review updated successfully.",
      data: review
    });
  } catch (error) {
    next(error);
  }
}

async function deleteReview(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const reviewId = Number(req.params.reviewId);
    const userId = req.user.id;

    await reviewService.deleteReview({ reviewId, userId });

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReview,
  createEquipmentReview,
  updateReview,
  deleteReview
};
