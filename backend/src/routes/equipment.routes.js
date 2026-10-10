const express = require("express");
const { body, param, query } = require("express-validator");
const equipmentController = require("../controllers/equipment.controller");
const { EQUIPMENT_CONDITIONS, RENTAL_PROBLEM_CATEGORIES } = require("../services/equipment.service");
const { categoriesFor, applyCategorySection } = require("../config/categories");
const { authenticate, optionalAuthenticate } = require("../middleware/auth.middleware");

const router = express.Router();

/* optionalAuthenticate (not authenticate, and not left bare) — guests still
   see the full public list, but a logged-in owner needs req.user populated
   so their own pending-review listing can still show up here (equipment has
   no separate "my listings" page — see getAllAvailableEquipment). */
router.get("/", optionalAuthenticate, equipmentController.getAllAvailableEquipment);
router.get("/history", authenticate, equipmentController.getEquipmentHistory);
router.get("/my-listings", authenticate, equipmentController.getMyEquipment);

/* DEMO payment simulation — the logged-in user's renter trust level */
router.get("/my-trust", authenticate, equipmentController.getMyTrust);

const photoUrlsValidator = body("photoUrls")
  .isArray({ min: 1, max: 5 }).withMessage("Add between 1 and 5 condition photos.");

/* Same field rules for listing equipment and editing a listing. */
const equipmentFieldRules = [
  body("name").trim().notEmpty().withMessage("Name is required.")
    .isLength({ min: 2, max: 150 }).withMessage("Name must be between 2 and 150 characters."),
  body("description").trim().notEmpty().withMessage("Description is required.")
    .isLength({ min: 5 }).withMessage("Description must be at least 5 characters."),
  body("category").trim().notEmpty().withMessage("Please choose a category.").bail()
    .isIn(categoriesFor("equipment")).withMessage("Please choose a category from the list."),
  /* section is worked out from the category (applyCategorySection below) */
  body("condition").notEmpty().withMessage("Please choose the item's condition.").bail()
    .isIn(EQUIPMENT_CONDITIONS).withMessage("Condition must be Excellent, Functional or Damaged."),
  body("dailyPrice").notEmpty().withMessage("Daily price is required.")
    .isFloat({ min: 0 }).withMessage("Daily price must be a valid positive number."),
  body("itemValue").notEmpty().withMessage("Item value is required.").bail()
    .isFloat({ min: 1, max: 1000000 }).withMessage("Item value must be a valid amount in Rand."),
  applyCategorySection("equipment")
];

router.post("/", authenticate, equipmentFieldRules, equipmentController.createEquipment);

/* Edit — only the owner. Allowed any time: every booking saved its own
   rent/fee/deposit when it was made, so existing bookings don't change. */
router.put(
  "/:id",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer."),
    ...equipmentFieldRules,
    body("imageUrls").optional().isArray({ max: 5 }).withMessage("A listing can have up to 5 images.")
  ],
  equipmentController.updateEquipment
);

/* DEMO: money breakdown (rental + protection fee + trust-based deposit)
   shown before the renter confirms a booking. */
router.get(
  "/:id/rental-quote",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer."),
    query("startDate").notEmpty().withMessage("Start date is required.").isISO8601().withMessage("Start date must be valid."),
    query("endDate").notEmpty().withMessage("End date is required.").isISO8601().withMessage("End date must be valid.")
  ],
  equipmentController.getRentalQuote
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

/* Renter: back out before collecting the item (request, unpaid approval,
   or a paid booking not yet collected — full refund, demo) */
router.patch(
  "/bookings/:bookingId/cancel",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.cancelBooking
);

const bookingIdRule = param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.");

/* Renter: pay (demo) for a booking the owner approved. The terms version
   they were shown must match the current one. */
router.post(
  "/bookings/:bookingId/pay",
  authenticate,
  [ bookingIdRule, body("acceptedPolicyVersion").isString().notEmpty().withMessage("Please review and accept the rental terms.") ],
  equipmentController.payBooking
);

/* Owner: can't go ahead after approving — the renter is refunded in full */
router.patch(
  "/bookings/:bookingId/owner-cancel",
  authenticate,
  [ bookingIdRule, body("note").trim().isLength({ min: 5, max: 500 }).withMessage("Please tell the renter why (5 to 500 characters).") ],
  equipmentController.ownerCancelBooking
);

/* Renter: the item is faulty at collection, so they don't take it */
router.patch(
  "/bookings/:bookingId/refuse-pickup",
  authenticate,
  [ bookingIdRule, body("note").trim().isLength({ min: 10, max: 500 }).withMessage("Please say what's wrong with the item (10 to 500 characters).") ],
  equipmentController.refusePickup
);

/* Either side: report a problem during the rental (goes to admins) */
router.post(
  "/bookings/:bookingId/problem",
  authenticate,
  [
    bookingIdRule,
    body("category").isIn(Object.keys(RENTAL_PROBLEM_CATEGORIES)).withMessage("Please choose what went wrong from the list."),
    body("note").trim().isLength({ min: 10, max: 500 }).withMessage("Please describe what happened in 10 to 500 characters.")
  ],
  equipmentController.reportRentalProblem
);

/* Extensions: renter asks → owner approves/declines → renter pays (demo) */
router.post(
  "/bookings/:bookingId/extension",
  authenticate,
  [ bookingIdRule, body("newEndDate").isISO8601({ strict: true }).withMessage("Choose a valid new return date.") ],
  equipmentController.requestExtension
);
router.patch("/bookings/:bookingId/extension/approve", authenticate, [bookingIdRule], equipmentController.approveExtension);
router.patch("/bookings/:bookingId/extension/decline", authenticate, [bookingIdRule], equipmentController.declineExtension);
router.patch("/bookings/:bookingId/extension/cancel", authenticate, [bookingIdRule], equipmentController.cancelExtension);
router.post("/bookings/:bookingId/extension/pay", authenticate, [bookingIdRule], equipmentController.payExtension);

/* Renter: collected the item — "before" condition photos, plus the
   renter confirming what condition it's in */
router.patch(
  "/bookings/:bookingId/pickup",
  authenticate,
  [
    param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer."),
    photoUrlsValidator,
    body("pickupCondition").notEmpty().withMessage("Please confirm what condition the item is in.").bail()
      .isIn(EQUIPMENT_CONDITIONS).withMessage("Condition must be Excellent, Functional or Damaged.")
  ],
  equipmentController.confirmPickup
);

/* Renter or owner: item handed back — "after" condition photos (required
   for new bookings; legacy bookings from before the payment simulation
   can still be returned without them, so photoUrls is optional here and
   the service decides). */
router.patch(
  "/bookings/:bookingId/return",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.returnEquipment
);

/* Owner: after return, either confirm the condition (deposit released)
   or report damage (deposit held for an admin to review). */
router.patch(
  "/bookings/:bookingId/condition-ok",
  authenticate,
  [ param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer.") ],
  equipmentController.confirmCondition
);

router.patch(
  "/bookings/:bookingId/report-damage",
  authenticate,
  [
    param("bookingId").isInt({ min: 1 }).withMessage("Booking ID must be a valid positive integer."),
    body("note").trim().isLength({ min: 10, max: 1000 }).withMessage("Describe the damage in 10 to 1000 characters.")
  ],
  equipmentController.reportDamage
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

  optionalAuthenticate (not authenticate) — guests can view an item's full
  details page without an account; only booking/messaging actually
  requires login.
*/
router.get(
  "/:id",
  optionalAuthenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Equipment ID must be a valid positive integer.") ],
  equipmentController.getEquipmentById
);

module.exports = router;