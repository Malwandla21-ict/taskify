const express = require("express");
const { body, param } = require("express-validator");
const taskController = require("../controllers/task.controller");
const { authenticate, optionalAuthenticate } = require("../middleware/auth.middleware");
const { TASK_DISPUTE_CATEGORIES } = require("../services/task.service");
const { categoriesFor, applyCategorySection } = require("../config/categories");
const { requireAcknowledgements } = require("../middleware/acknowledgement.middleware");

const router = express.Router();

router.get("/",        taskController.getAllTasks);
router.get("/history", authenticate, taskController.getUserTaskHistory);

/* Same field rules for posting a task and editing one. */
const taskFieldRules = [
  body("title").trim().notEmpty().withMessage("Title is required.")
    .isLength({ min: 3, max: 150 }).withMessage("Title must be between 3 and 150 characters."),
  body("description").trim().notEmpty().withMessage("Description is required.")
    .isLength({ min: 10 }).withMessage("Description must be at least 10 characters."),
  body("category").trim().notEmpty().withMessage("Please choose a category.").bail()
    .isIn(categoriesFor("task")).withMessage("Please choose a category from the list."),
  /* section is worked out from the category (applyCategorySection below) */
  body("price").notEmpty().withMessage("Price is required.")
    .isFloat({ min: 0 }).withMessage("Price must be a valid positive number."),
  body("location").trim().notEmpty().withMessage("Location is required.")
    .isLength({ min: 2, max: 100 }).withMessage("Location must be between 2 and 100 characters."),
  body("urgent").optional().isBoolean().withMessage("Urgent must be true or false."),
  applyCategorySection("task")
];

/* Academic tasks need the academic-honesty tick (config/acknowledgements.js). */
router.post("/", authenticate, taskFieldRules,
  requireAcknowledgements(req => (req.body.section === "Academic" ? ["academic_integrity"] : [])),
  taskController.createTask);

router.patch(
  "/:id/accept",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.acceptTask
);

router.patch(
  "/:id/status",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    body("status").trim().notEmpty().withMessage("Status is required.")
      .isIn(["In Progress", "Awaiting Confirmation"]).withMessage("Status must be 'In Progress' or 'Awaiting Confirmation'.")
  ],
  taskController.updateTaskStatus
);

/* Owner-only: closes the loop and releases the held payment */
router.patch(
  "/:id/confirm-completion",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.confirmTaskCompletion
);

/* Poster-only, instead of confirming: report a problem with the work. The
   task becomes 'Disputed' and the payment stays held until an admin decides. */
router.post(
  "/:id/dispute",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    body("reason").trim().notEmpty().withMessage("Please describe what went wrong.")
      .isLength({ min: 10, max: 500 }).withMessage("Please describe what went wrong in 10 to 500 characters."),
    body("category").optional().isIn(TASK_DISPUTE_CATEGORIES).withMessage("Please choose what kind of problem this is.")
  ],
  taskController.disputeTask
);

/* Worker-only: back out before starting work */
router.patch(
  "/:id/withdraw",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.withdrawFromTask
);

router.patch(
  "/:id/cancel",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.cancelTask
);

/* DELETE — only owner, only if Posted or Cancelled */
router.delete(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.deleteTask
);

/* Edit — only the creator, only while nobody has accepted it ("Posted"). */
router.put(
  "/:id",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer."),
    ...taskFieldRules,
    body("imageUrls").optional().isArray({ max: 5 }).withMessage("A task can have up to 5 images.")
  ],
  taskController.updateTask
);

/*
  GET /:id — single-task lookup, unfiltered by status. Placed after the
  literal "/history" route (and after all the more-specific PATCH/DELETE
  routes above, which Express matches independently since they're a
  different HTTP method) so "/history" is never swallowed by this
  wildcard. This is what lets task-details.js load a task once it has
  moved past "Posted" — the public GET / list intentionally excludes those.

  optionalAuthenticate (not authenticate) — guests can view a task's full
  details page without an account; only the actions below it (accept,
  message, etc.) actually require login.
*/
router.get(
  "/:id",
  optionalAuthenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.getTaskById
);

module.exports = router;