const { validationResult } = require("express-validator");
const equipmentService = require("../services/equipment.service");
const trustService = require("../services/trust.service");
const rentalExtensionService = require("../services/rentalExtension.service");

async function createEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const equipment = await equipmentService.createEquipment({
      ownerId: req.user.id, name: req.body.name,
      description: req.body.description, category: req.body.category,
      section: req.body.section, condition: req.body.condition,
      dailyPrice: req.body.dailyPrice, itemValue: req.body.itemValue,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Equipment listed successfully.", data: equipment });
  } catch (error) { next(error); }
}

async function updateEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const equipment = await equipmentService.updateEquipment(Number(req.params.id), req.user.id, {
      name: req.body.name, description: req.body.description,
      category: req.body.category, section: req.body.section,
      condition: req.body.condition,
      dailyPrice: req.body.dailyPrice, itemValue: req.body.itemValue,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(200).json({ success: true, message: "Listing updated successfully.", data: equipment });
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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.bookEquipment({
      equipmentId: Number(req.params.id), renterId: req.user.id,
      startDate: req.body.startDate, endDate: req.body.endDate
    });

    return res.status(201).json({ success: true, message: "Booking request sent. Nothing is paid until the owner approves.", data: booking });
  } catch (error) { next(error); }
}

async function confirmBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.confirmBooking(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: booking.status === "Confirmed" ? "Booking confirmed." : "Booking approved. The renter has been asked to pay.", data: booking });
  } catch (error) { next(error); }
}

async function declineBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.declineBooking(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Booking declined.", data: booking });
  } catch (error) { next(error); }
}

async function cancelBooking(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.cancelBookingByRenter(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Booking cancelled.", data: booking });
  } catch (error) { next(error); }
}

async function returnEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.returnEquipment(Number(req.params.bookingId), req.user.id, req.body?.photoUrls);
    return res.status(200).json({ success: true, message: "Equipment returned successfully.", data: booking });
  } catch (error) { next(error); }
}

async function confirmPickup(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.confirmPickup(Number(req.params.bookingId), req.user.id, req.body.photoUrls, req.body.pickupCondition);
    return res.status(200).json({ success: true, message: "Pickup confirmed.", data: booking });
  } catch (error) { next(error); }
}

async function confirmCondition(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const booking = await equipmentService.confirmCondition(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Condition confirmed. Deposit released (demo).", data: booking });
  } catch (error) { next(error); }
}

async function reportDamage(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    await equipmentService.deleteEquipment(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Equipment listing deleted successfully." });
  } catch (error) { next(error); }
}

/* The newer rental actions (pay, cancel, problems, extensions) all have
   the same shape: validate, call the service, answer 200. */
function bookingAction(serviceCall, message) {
  return async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
      const data = await serviceCall(req);
      return res.status(200).json({ success: true, message, data });
    } catch (error) { next(error); }
  };
}

const bookingId = (req) => Number(req.params.bookingId);

const payBooking = bookingAction(
  (req) => equipmentService.payBooking(bookingId(req), req.user.id, { acceptedPolicyVersion: req.body.acceptedPolicyVersion }),
  "Payment held (demo). Your booking is confirmed."
);
const ownerCancelBooking = bookingAction(
  (req) => equipmentService.ownerCancelBooking(bookingId(req), req.user.id, req.body.note),
  "Booking cancelled. The renter has been refunded (demo)."
);
const refusePickup = bookingAction(
  (req) => equipmentService.refusePickup(bookingId(req), req.user.id, req.body.note),
  "Booking cancelled and refunded (demo). The owner and admins have been told."
);
const reportRentalProblem = bookingAction(
  (req) => equipmentService.reportRentalProblem(bookingId(req), req.user.id, { category: req.body.category, note: req.body.note }),
  "Problem reported. A Taskify admin will look at it."
);
const requestExtension = bookingAction(
  (req) => rentalExtensionService.requestExtension(bookingId(req), req.user.id, req.body.newEndDate),
  "Extension requested. The owner has been asked."
);
const approveExtension = bookingAction(
  (req) => rentalExtensionService.respondToExtension(bookingId(req), req.user.id, true),
  "Extension approved. The renter has been asked to pay."
);
const declineExtension = bookingAction(
  (req) => rentalExtensionService.respondToExtension(bookingId(req), req.user.id, false),
  "Extension declined."
);
const cancelExtension = bookingAction(
  (req) => rentalExtensionService.cancelExtension(bookingId(req), req.user.id),
  "Extension request withdrawn."
);
const payExtension = bookingAction(
  (req) => rentalExtensionService.payExtension(bookingId(req), req.user.id),
  "Extension paid (demo). Your new return deadline is confirmed."
);

module.exports = {
  payBooking,
  ownerCancelBooking,
  refusePickup,
  reportRentalProblem,
  requestExtension,
  approveExtension,
  declineExtension,
  cancelExtension,
  payExtension,
  createEquipment,
  updateEquipment,
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