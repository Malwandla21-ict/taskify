const express = require("express");
const { body, param } = require("express-validator");
const taskController = require("../controllers/task.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/",        taskController.getAllTasks);
router.get("/history", authenticate, taskController.getUserTaskHistory);

router.post(
  "/",
  authenticate,
  [
    body("title").trim().notEmpty().withMessage("Title is required.")
      .isLength({ min: 3, max: 150 }).withMessage("Title must be between 3 and 150 characters."),
    body("description").trim().notEmpty().withMessage("Description is required.")
      .isLength({ min: 10 }).withMessage("Description must be at least 10 characters."),
    body("category").trim().notEmpty().withMessage("Category is required.")
      .isLength({ min: 2, max: 50 }).withMessage("Category must be between 2 and 50 characters."),
    body("section").optional().isIn(["Academic", "General"])
      .withMessage("Section must be either Academic or General."),
    body("price").notEmpty().withMessage("Price is required.")
      .isFloat({ min: 0 }).withMessage("Price must be a valid positive number."),
    body("location").trim().notEmpty().withMessage("Location is required.")
      .isLength({ min: 2, max: 100 }).withMessage("Location must be between 2 and 100 characters."),
    body("urgent").optional().isBoolean().withMessage("Urgent must be true or false.")
  ],
  taskController.createTask
);

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

/*
  GET /:id — single-task lookup, unfiltered by status. Placed after the
  literal "/history" route (and after all the more-specific PATCH/DELETE
  routes above, which Express matches independently since they're a
  different HTTP method) so "/history" is never swallowed by this
  wildcard. This is what lets task-details.js load a task once it has
  moved past "Posted" — the public GET / list intentionally excludes those.
*/
router.get(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Task ID must be a valid positive integer.") ],
  taskController.getTaskById
);

module.exports = router;