const express = require("express");
const { body, param } = require("express-validator");
const salesController = require("../controllers/sales.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", salesController.getAllAvailableSalesItems);

router.get("/my-listings", authenticate, salesController.getMySalesItems);

router.post(
  "/",
  authenticate,
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required.")
      .isLength({ min: 2, max: 150 })
      .withMessage("Title must be between 2 and 150 characters."),

    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required.")
      .isLength({ min: 5 })
      .withMessage("Description must be at least 5 characters long."),

    body("category")
      .trim()
      .notEmpty()
      .withMessage("Category is required.")
      .isLength({ min: 2, max: 100 })
      .withMessage("Category must be between 2 and 100 characters."),

    body("section")
      .optional()
      .isIn(["Academic", "General"])
      .withMessage("Section must be either Academic or General."),

    body("price")
      .notEmpty()
      .withMessage("Price is required.")
      .isFloat({ min: 0 })
      .withMessage("Price must be a valid positive number."),

    body("conditionStatus")
      .optional()
      .isIn(["New", "Excellent", "Good", "Fair", "Used"])
      .withMessage("Invalid condition status."),

    body("location")
      .trim()
      .notEmpty()
      .withMessage("Location is required.")
      .isLength({ min: 2, max: 150 })
      .withMessage("Location must be between 2 and 150 characters.")
  ],
  salesController.createSalesItem
);

router.patch(
  "/:id/sold",
  authenticate,
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("Sales item ID must be a valid positive integer.")
  ],
  salesController.markSalesItemAsSold
);

module.exports = router;