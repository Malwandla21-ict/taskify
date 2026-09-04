const express = require("express");
const { body, param } = require("express-validator");
const eventController = require("../controllers/event.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/",            eventController.getAllUpcomingEvents);
router.get("/past",        eventController.getPastEvents);
router.get("/my",          authenticate, eventController.getMyEvents);
router.get("/rsvp-status", authenticate, eventController.getMyRsvpStatus);

router.post(
  "/",
  authenticate,
  [
    body("title").trim().notEmpty().withMessage("Title is required.")
      .isLength({ min: 3, max: 150 }).withMessage("Title must be between 3 and 150 characters."),
    body("description").trim().notEmpty().withMessage("Description is required.")
      .isLength({ min: 10 }).withMessage("Description must be at least 10 characters."),
    body("category").trim().notEmpty().withMessage("Category is required."),
    body("section").optional().isIn(["Academic", "General"]).withMessage("Section must be Academic or General."),
    body("location").trim().notEmpty().withMessage("Location is required."),
    body("eventDate").notEmpty().withMessage("Event date is required.")
      .isISO8601().withMessage("Event date must be a valid date/time.")
      .custom(value => {
        if (new Date(value) <= new Date()) throw new Error("Event date must be in the future.");
        return true;
      }),
    body("capacity").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Capacity must be a positive number.")
  ],
  eventController.createEvent
);

router.post(
  "/:id/rsvp",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Event ID must be a valid positive integer.") ],
  eventController.rsvpToEvent
);

router.delete(
  "/:id/rsvp",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Event ID must be a valid positive integer.") ],
  eventController.cancelRsvp
);

router.delete(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Event ID must be a valid positive integer.") ],
  eventController.deleteEvent
);

/*
  GET /:id — single-event lookup, unfiltered by status/date. Placed after
  the literal "/my", "/rsvp-status" and "/past" routes so it never
  swallows them (Express matches literal path segments before the ":id"
  wildcard only if ordered correctly). This is what lets event-details.js
  load an event once it has passed or been cancelled — GET / only returns
  upcoming ones.
*/
router.get(
  "/:id",
  authenticate,
  [ param("id").isInt({ min: 1 }).withMessage("Event ID must be a valid positive integer.") ],
  eventController.getEventById
);

module.exports = router;