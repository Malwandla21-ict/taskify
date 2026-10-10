const express = require("express");
const { body, validationResult } = require("express-validator");
const { authenticate } = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/feature.middleware");
const feedbackService = require("../services/feedback.service");

const router = express.Router();

/* "Help shape Taskify": any signed-in user can send feedback. Kinds are
   listed for the form; sending never grants any permission. */
router.get("/kinds", requireFeature("feedback"), (req, res) => {
  res.json({ success: true, data: feedbackService.FEEDBACK_KINDS });
});

router.post(
  "/",
  authenticate,
  requireFeature("feedback"),
  [
    body("kind").isIn(Object.keys(feedbackService.FEEDBACK_KINDS)).withMessage("Please choose what kind of feedback this is."),
    body("message").trim().isLength({ min: 10, max: 2000 }).withMessage("Please write between 10 and 2000 characters.")
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
      const saved = await feedbackService.createFeedback(req.user.id, { kind: req.body.kind, message: req.body.message });
      return res.status(201).json({ success: true, message: "Thank you — your feedback has been sent to the Taskify team.", data: saved });
    } catch (error) { next(error); }
  }
);

module.exports = router;
