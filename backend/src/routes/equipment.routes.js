const express = require("express");
const { body, param } = require("express-validator");
const equipmentController = require("../controllers/equipment.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/",       equipmentController.getAllAvailableEquipment);
router.get("/history", authenticate, equipmentController.getEquipmentHistory);

router.post(
  "/",
  authenticate,
  [
    body("name").trim().notEmpty().withMessage("Name is required.")
      .isLength({ min: 2, max: 150 }).withMessage("Name must be between 2 and 150 characters."),
    body("description").trim().notEmpty().withMessage("Description is required.")
      .isLength({ min: 5 }).withMessage("Description must be at least 5 characters."),
    body("category").trim().notEmpty().withMessage("Category is required.")
      .isLength({ min: 2, max: 100 }).withMessage("Category must be between 2 and 100 characters."),
    body("section").optional().isIn(["Academic", "General"])
      .withMessage("Section must be either Academic or General."),
    body("dailyPrice").notEmpty().withMessage("Daily price is required.")
      .isFloat({ min: 0 }).withMessage("Daily price must be a valid positive number.")
  ],
  equipmentController.createEquipment
);

router.post(
  "/:id/book",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer."),
    body("startDate").notEmpty().withMessage("Start date is required.").isISO8601().withMessage("Start date must be valid."),
    body("endDate").notEmpty().withMessage("End date is required.").isISO8601().withMessage("End date must be valid.")
  ],
  equipmentController.bookEquipment
);

/* Owner: approve or reject a booking request */
router.patch(
  "/bookings/:bookingId/confirm",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.confirmBooking
);

router.patch(
  "/bookings/:bookingId/decline",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.declineBooking
);

/* Renter: back out of a request that hasn't been confirmed yet */
router.patch(
  "/bookings/:bookingId/cancel",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.cancelBooking
);

router.patch(
  "/bookings/:bookingId/return",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.returnEquipment
);

/* DELETE — only owner, only if currently available (not booked) */
router.delete(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer.") ],
  equipmentController.deleteEquipment
);

/*
  GET /:id — single-item lookup, unfiltered by is_available. Placed last
  so it never swallows the more specific routes above (Express matches
  by exact path + method, so "/history", "/:id/book", and the
  "/bookings/..." routes are unaffected regardless of order — this
  ordering is just for readability). This is what equipment-details.js
  needs to load an item once it's booked, since GET / only returns
  available equipment.
*/
router.get(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer.") ],
  equipmentController.getEquipmentById
);

module.exports = router;