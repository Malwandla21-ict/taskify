const { validationResult } = require("express-validator");
const equipmentService = require("../services/equipment.service");
const trustService = require("../services/trust.service");

async function createEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const equipment = await equipmentService.createEquipment({
      ownerId: req.user.id, name: req.body.name,
      description: req.body.description, category: req.body.category,
      section: req.body.section, dailyPrice: req.body.dailyPrice,
      itemValue: req.body.itemValue,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Equipment listed successfully.", data: equipment });
  } catch (error) { next(error); }
}

async function getAllAvailableEquipment(req, res, next) {
  try {
    /* req.user may be null here — this route allows guest viewing (see
       equipment.routes.js's optionalAuthenticate). Passing the viewer's id
       lets a logged-in owner still see their own pending-review listing in
       this list (see getAllAvailableEquipment's comment) — a guest's
       undefined id simply never matches an owner_id. */
    const equipment = await equipmentService.getAllAvailableEquipment(req.user?.id);
    return res.status(200).json({ success: true, message: "Available equipment fetched successfully.", data: equipment });
  } catch (error) { next(error); }
}

async function getEquipmentById(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    /* req.user may be null here — this route allows guest viewing (see
       equipment.routes.js's optionalAuthenticate). getEquipmentByIdForViewing
       compares owner/renter IDs against userId, which safely resolves to
       "not a match" for an undefined guest ID rather than crashing, and
       404s a pending/removed item for anyone but the owner or an admin. */
    const item = await equipmentService.getEquipmentByIdForViewing(Number(req.params.id), req.user?.id, req.user?.role);
    return res.status(200).json({ success: true, message: "Equipment fetched successfully.", data: item });
  } catch (error) { next(error); }
}

/* DEMO payment quote — see config/paymentSettings.js */
async function getRentalQuote(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const quote = await equipmentService.getRentalQuote({
      equipmentId: Number(req.params.id), renterId: req.user.id,
      startDate: req.query.startDate, endDate: req.query.endDate
    });
    return res.status(200).json({ success: true, message: "Rental quote calculated.", data: quote });
  } catch (error) { next(error); }
}

async function getMyTrust(req, res, next) {
  try {
    const trust = await trustService.getRenterTrust(req.user.id);
    return res.status(200).json({ success: true, message: "Trust level fetched.", data: trust });
  } catch (error) { next(error); }
}

async function bookEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.bookEquipment({
      equipmentId: Number(req.params.id), renterId: req.user.id,
      startDate: req.body.startDate, endDate: req.body.endDate
    });

    return res.status(201).json({ success: true, message: "Booking request sent.", data: booking });
  } catch (error) { next(error); }
}

async function confirmBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.confirmBooking(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Booking confirmed successfully.", data: booking });
  } catch (error) { next(error); }
}

async function declineBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.declineBooking(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Booking declined.", data: booking });
  } catch (error) { next(error); }
}

async function cancelBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.cancelBookingByRenter(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Booking request cancelled.", data: booking });
  } catch (error) { next(error); }
}

async function returnEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.returnEquipment(Number(req.params.bookingId), req.user.id, req.body?.photoUrls);
    return res.status(200).json({ success: true, message: "Equipment returned successfully.", data: booking });
  } catch (error) { next(error); }
}

async function confirmPickup(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.confirmPickup(Number(req.params.bookingId), req.user.id, req.body.photoUrls);
    return res.status(200).json({ success: true, message: "Pickup confirmed.", data: booking });
  } catch (error) { next(error); }
}

async function confirmCondition(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.confirmCondition(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Condition confirmed. Deposit released (demo).", data: booking });
  } catch (error) { next(error); }
}

async function reportDamage(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.reportDamage(Number(req.params.bookingId), req.user.id, req.body.note);
    return res.status(200).json({ success: true, message: "Damage reported. An admin will review it.", data: booking });
  } catch (error) { next(error); }
}

async function getEquipmentHistory(req, res, next) {
  try {
    const history = await equipmentService.getEquipmentHistory(req.user.id);
    return res.status(200).json({ success: true, message: "Equipment history fetched successfully.", data: history });
  } catch (error) { next(error); }
}

async function getMyEquipment(req, res, next) {
  try {
    const equipment = await equipmentService.getMyEquipment(req.user.id);
    return res.status(200).json({ success: true, message: "My equipment fetched successfully.", data: equipment });
  } catch (error) { next(error); }
}

async function deleteEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    await equipmentService.deleteEquipment(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Equipment listing deleted successfully." });
  } catch (error) { next(error); }
}

module.exports = {
  createEquipment,
  getAllAvailableEquipment,
  getEquipmentById,
  getRentalQuote,
  getMyTrust,
  bookEquipment,
  confirmBooking,
  declineBooking,
  cancelBooking,
  returnEquipment,
  confirmPickup,
  confirmCondition,
  reportDamage,
  getEquipmentHistory,
  getMyEquipment,
  deleteEquipment
};