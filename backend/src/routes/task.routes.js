const express = require("express");
const { body, param } = require("express-validator");
const taskController = require("../controllers/task.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", taskController.getAllTasks);

router.get("/history", authenticate, taskController.getUserTaskHistory);

router.post(
  "/",
  authenticate,
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required.")
      .isLength({ min: 3, max: 150 })
      .withMessage("Title must be between 3 and 150 characters."),
    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required.")
      .isLength({ min: 10 })
      .withMessage("Description must be at least 10 characters long."),
    body("category")
      .trim()
      .notEmpty()
      .withMessage("Category is required.")
      .isLength({ min: 2, max: 50 })
      .withMessage("Category must be between 2 and 50 characters."),
    body("section")
      .optional()
      .isIn(["Academic", "General"])
      .withMessage("Section must be either Academic or General."),
    body("price")
      .notEmpty()
      .withMessage("Price is required.")
      .isFloat({ min: 0 })
      .withMessage("Price must be a valid positive number."),
    body("location")
      .trim()
      .notEmpty()
      .withMessage("Location is required.")
      .isLength({ min: 2, max: 100 })
      .withMessage("Location must be between 2 and 100 characters."),
    body("urgent")
      .optional()
      .isBoolean()
      .withMessage("Urgent must be true or false.")
  ],
  taskController.createTask
);

router.patch(
  "/:id/accept",
  authenticate,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Task ID must be a valid positive integer.")
  ],
  taskController.acceptTask
);

router.patch(
  "/:id/status",
  authenticate,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Task ID must be a valid positive integer."),
    body("status")
      .trim()
      .notEmpty()
      .withMessage("Status is required.")
      .isIn(["In Progress", "Completed"])
      .withMessage("Status must be either 'In Progress' or 'Completed'.")
  ],
  taskController.updateTaskStatus
);

router.patch(
  "/:id/cancel",
  authenticate,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Task ID must be a valid positive integer.")
  ],
  taskController.cancelTask
);

module.exports = router;