const { validationResult } = require("express-validator");
const offerService = require("../services/offer.service");

/* In-app offers — see services/offer.service.js. DEMO payments only. */

function validationFailed(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  return true;
}

async function listOffers(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const data = await offerService.listOffersForListing({
      contextType: req.query.contextType,
      contextId: Number(req.query.contextId),
      viewerId: req.user.id
    });
    return res.status(200).json({ success: true, message: "Offers fetched successfully.", data });
  } catch (error) { next(error); }
}

async function createOffer(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const offer = await offerService.createOffer({
      contextType: req.body.contextType,
      contextId: Number(req.body.contextId),
      offererId: req.user.id,
      amount: req.body.amount,
      message: req.body.message
    });
    return res.status(201).json({ success: true, message: "Offer sent.", data: offer });
  } catch (error) { next(error); }
}

async function counterOffer(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const offer = await offerService.counterOffer({
      offerId: Number(req.params.id),
      userId: req.user.id,
      amount: req.body.amount,
      message: req.body.message
    });
    return res.status(200).json({ success: true, message: "Counter-offer sent.", data: offer });
  } catch (error) { next(error); }
}

async function acceptOffer(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const result = await offerService.acceptOffer({
      offerId: Number(req.params.id),
      userId: req.user.id,
      expectedAmount: req.body.expectedAmount
    });
    return res.status(200).json({ success: true, message: "Offer accepted. Payment held (demo).", data: result });
  } catch (error) { next(error); }
}

async function declineOffer(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const offer = await offerService.declineOffer({ offerId: Number(req.params.id), userId: req.user.id });
    return res.status(200).json({ success: true, message: "Offer declined.", data: offer });
  } catch (error) { next(error); }
}

async function withdrawOffer(req, res, next) {
  try {
    if (validationFailed(req, res)) return;
    const offer = await offerService.withdrawOffer({ offerId: Number(req.params.id), userId: req.user.id });
    return res.status(200).json({ success: true, message: "Offer withdrawn.", data: offer });
  } catch (error) { next(error); }
}

module.exports = { listOffers, createOffer, counterOffer, acceptOffer, declineOffer, withdrawOffer };
