const { validationResult } = require("express-validator");
const eventService = require("../services/event.service");

async function createEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const event = await eventService.createEvent({
      organizerId: req.user.id, title: req.body.title,
      description: req.body.description, category: req.body.category,
      section: req.body.section, location: req.body.location,
      eventDate: req.body.eventDate, capacity: req.body.capacity,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Event created successfully.", data: event });
  } catch (error) { next(error); }
}

async function getAllUpcomingEvents(req, res, next) {
  try {
    const events = await eventService.getAllUpcomingEvents();
    return res.status(200).json({ success: true, message: "Events fetched successfully.", data: events });
  } catch (error) { next(error); }
}

async function getPastEvents(req, res, next) {
  try {
    const events = await eventService.getPastEvents();
    return res.status(200).json({ success: true, message: "Past events fetched successfully.", data: events });
  } catch (error) { next(error); }
}

async function getMyRsvpStatus(req, res, next) {
  try {
    const ids = await eventService.getMyRsvpEventIds(req.user.id);
    return res.status(200).json({ success: true, message: "RSVP status fetched.", data: ids });
  } catch (error) { next(error); }
}

async function getMyEvents(req, res, next) {
  try {
    const events = await eventService.getMyEvents(req.user.id);
    return res.status(200).json({ success: true, message: "My events fetched successfully.", data: events });
  } catch (error) { next(error); }
}

async function getEventById(req, res, next) {
  try {
    const event = await eventService.getEventByIdForViewing(Number(req.params.id));
    return res.status(200).json({ success: true, message: "Event fetched successfully.", data: event });
  } catch (error) { next(error); }
}

async function rsvpToEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const event = await eventService.rsvpToEvent(Number(req.params.id), req.user.id);
    return res.status(201).json({ success: true, message: "RSVP confirmed.", data: event });
  } catch (error) { next(error); }
}

async function cancelRsvp(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const event = await eventService.cancelRsvp(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "RSVP cancelled.", data: event });
  } catch (error) { next(error); }
}

async function deleteEvent(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    await eventService.deleteEvent(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Event deleted successfully." });
  } catch (error) { next(error); }
}

module.exports = {
  createEvent,
  getAllUpcomingEvents,
  getPastEvents,
  getMyRsvpStatus,
  getMyEvents,
  getEventById,
  rsvpToEvent,
  cancelRsvp,
  deleteEvent
};