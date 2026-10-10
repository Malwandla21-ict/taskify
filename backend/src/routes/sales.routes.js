const express = require("express");
const { body, param } = require("express-validator");
const salesController = require("../controllers/sales.controller");
const { authenticate, optionalAuthenticate } = require("../middleware/auth.middleware");
const { categoriesFor, applyCategorySection } = require("../config/categories");
const { SALE_DISPUTE_CATEGORIES } = require("../services/sales.service");

const router = express.Router();

router.get("/",            salesController.getAllAvailableSalesItems);
router.get("/my-listings", authenticate, salesController.getMySalesItems);

/* Same field rules for listing an item and editing one. */
const salesFieldRules = [
  body("title").trim().notEmpty().withMessage("Title is required.")
    .isLength({ min: 2, max: 150 }).withMessage("Title must be between 2 and 150 characters."),
  body("description").trim().notEmpty().withMessage("Description is required.")
    .isLength({ min: 5 }).withMessage("Description must be at least 5 characters."),
  body("category").trim().notEmpty().withMessage("Please choose a category.").bail()
    .isIn(categoriesFor("sales")).withMessage("Please choose a category from the list."),
  /* section is worked out from the category (applyCategorySection below) */
  body("price").notEmpty().withMessage("Price is required.")
    .isFloat({ min: 0 }).withMessage("Price must be a valid positive number."),
  body("conditionStatus").optional()
    .isIn(["New", "Excellent", "Good", "Fair", "Used"]).withMessage("Invalid condition status."),
  body("location").trim().notEmpty().withMessage("Location is required.")
    .isLength({ min: 2, max: 150 }).withMessage("Location must be between 2 and 150 characters."),
  applyCategorySection("sales")
];

router.post("/", authenticate, salesFieldRules, salesController.createSalesItem);

/* Edit — only the seller, only while it's still for sale ("Available"). */
router.put(
  "/:id",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Sales item ID must be a valid positive integer."),
    ...salesFieldRules,
    body("imageUrls").optional().isArray({ max: 5 }).withMessage("A listing can have up to 5 images.")
  ],
  salesController.updateSalesItem
);

router.patch(
  "/:id/sold",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Sales item ID must be a valid positive integer.") ],
  salesController.markSalesItemAsSold
);

/* DELETE — only seller, only if Available (not sold) */
router.delete(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Sales item ID must be a valid positive integer.") ],
  salesController.deleteSalesItem
);

/* ── Taskify Protection (DEMO escrow + handover code) ── */
router.post(
  "/:id/buy",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Sales item ID must be a valid positive integer.") ],
  salesController.buySalesItem
);

router.post(
  "/orders/:orderId/release",
  authenticate,
  [
    param("orderId").isInt({ min: 1 }).withMessage("Order ID must be a valid positive integer."),
    body("code").trim().matches(/^\d{4}$/).withMessage("The handover code is 4 digits.")
  ],
  salesController.releaseSaleOrder
);

router.patch(
  "/orders/:orderId/cancel",
  authenticate,
  [ param("orderId").isInt({ min: 1 }).withMessage("Order ID must be a valid positive integer.") ],
  salesController.cancelSaleOrder
);

/* Buyer or seller: the meetup failed or the handover went wrong. The order
   becomes 'Disputed' — money stays held — until it's sorted out or an
   admin decides (see sales.service.js disputeSaleOrder). */
router.post(
  "/orders/:orderId/dispute",
  authenticate,
  [
    param("orderId").isInt({ min: 1 }).withMessage("Order ID must be a valid positive integer."),
    body("category").isIn(Object.keys(SALE_DISPUTE_CATEGORIES)).withMessage("Please choose what went wrong from the list."),
    body("reason").trim().notEmpty().withMessage("Please describe what happened.")
      .isLength({ min: 10, max: 500 }).withMessage("Please describe what happened in 10 to 500 characters.")
  ],
  salesController.disputeSaleOrder
);

/*
  GET /:id — single-item lookup, unfiltered by status. Placed after the
  literal "/my-listings" route (Express only conflicts on same method +
  overlapping pattern, and PATCH/DELETE above use different methods, so
  ordering relative to them doesn't matter — this just needs to come after
  "/my-listings" since that's also a GET). This lets sale-details.js load
  an item once it's sold, since GET / only returns Available items.

  optionalAuthenticate (not authenticate) — guests can view an item's full
  details page without an account; only messaging the seller actually
  requires login.
*/
router.get(
  "/:id",
  optionalAuthenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Sales item ID must be a valid positive integer.") ],
  salesController.getSalesItemById
);

module.exports = router;