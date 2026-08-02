const { validationResult } = require("express-validator");
const equipmentService = require("../services/equipment.service");

async function createEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const equipment = await equipmentService.createEquipment({
      ownerId: req.user.id, name: req.body.name,
      description: req.body.description, category: req.body.category,
      section: req.body.section, dailyPrice: req.body.dailyPrice,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Equipment listed successfully.", data: equipment });
  } catch (error) { next(error); }
}

async function getAllAvailableEquipment(req, res, next) {
  try {
    const equipment = await equipmentService.getAllAvailableEquipment();
    return res.status(200).json({ success: true, message: "Available equipment fetched successfully.", data: equipment });
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

    return res.status(201).json({ success: true, message: "Equipment booked successfully.", data: booking });
  } catch (error) { next(error); }
}

async function returnEquipment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const booking = await equipmentService.returnEquipment(Number(req.params.bookingId), req.user.id);
    return res.status(200).json({ success: true, message: "Equipment returned successfully.", data: booking });
  } catch (error) { next(error); }
}

async function getEquipmentHistory(req, res, next) {
  try {
    const history = await equipmentService.getEquipmentHistory(req.user.id);
    return res.status(200).json({ success: true, message: "Equipment history fetched successfully.", data: history });
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

module.exports = { createEquipment, getAllAvailableEquipment, bookEquipment, returnEquipment, getEquipmentHistory, deleteEquipment };