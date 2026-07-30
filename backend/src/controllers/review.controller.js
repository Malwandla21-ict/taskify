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

module.exports = {
  createReview
};