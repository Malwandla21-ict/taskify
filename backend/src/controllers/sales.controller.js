const { validationResult } = require("express-validator");
const salesService = require("../services/sales.service");

async function createSalesItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const item = await salesService.createSalesItem({
      sellerId: req.user.id, title: req.body.title,
      description: req.body.description, category: req.body.category,
      section: req.body.section, price: req.body.price,
      conditionStatus: req.body.conditionStatus, location: req.body.location,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Sales item listed successfully.", data: item });
  } catch (error) { next(error); }
}

async function getAllAvailableSalesItems(req, res, next) {
  try {
    const items = await salesService.getAllAvailableSalesItems();
    return res.status(200).json({ success: true, message: "Sales items fetched successfully.", data: items });
  } catch (error) { next(error); }
}

async function getMySalesItems(req, res, next) {
  try {
    const items = await salesService.getMySalesItems(req.user.id);
    return res.status(200).json({ success: true, message: "My sales items fetched successfully.", data: items });
  } catch (error) { next(error); }
}

async function getSalesItemById(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const item = await salesService.getSalesItemById(Number(req.params.id));
    if (!item) {
      return res.status(404).json({ success: false, message: "Sales item not found." });
    }
    return res.status(200).json({ success: true, message: "Sales item fetched successfully.", data: item });
  } catch (error) { next(error); }
}

async function markSalesItemAsSold(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const item = await salesService.markSalesItemAsSold(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Sales item marked as sold.", data: item });
  } catch (error) { next(error); }
}

async function deleteSalesItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    await salesService.deleteSalesItem(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Sales item deleted successfully." });
  } catch (error) { next(error); }
}

module.exports = {
  createSalesItem,
  getAllAvailableSalesItems,
  getMySalesItems,
  getSalesItemById,
  markSalesItemAsSold,
  deleteSalesItem
};