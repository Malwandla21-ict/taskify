const { validationResult } = require("express-validator");
const lecturerService = require("../services/lecturer.service");

async function searchStudents(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(200).json({ success: true, message: "Search students.", data: [] });
    }
    const students = await lecturerService.searchStudents(q);
    return res.status(200).json({ success: true, message: "Students fetched.", data: students });
  } catch (error) { next(error); }
}

async function getStudentListings(req, res, next) {
  try {
    const listings = await lecturerService.getStudentListings(Number(req.params.userId));
    return res.status(200).json({ success: true, message: "Listings fetched.", data: listings });
  } catch (error) { next(error); }
}

async function createEndorsement(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const endorsement = await lecturerService.createEndorsement({
      lecturerId: req.user.id,
      endorsedUserId: Number(req.body.endorsedUserId),
      endorsementType: req.body.endorsementType,
      contextType: req.body.contextType || null,
      contextId: req.body.contextId || null,
      message: req.body.message
    });

    return res.status(201).json({ success: true, message: "Endorsement given.", data: endorsement });
  } catch (error) { next(error); }
}

async function revokeEndorsement(req, res, next) {
  try {
    await lecturerService.revokeEndorsement(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Endorsement revoked." });
  } catch (error) { next(error); }
}

async function getEndorsementsGiven(req, res, next) {
  try {
    const data = await lecturerService.getEndorsementsGiven(req.user.id);
    return res.status(200).json({ success: true, message: "Endorsements given fetched.", data });
  } catch (error) { next(error); }
}

async function getEndorsementsReceived(req, res, next) {
  try {
    const data = await lecturerService.getEndorsementsReceived(Number(req.params.userId));
    return res.status(200).json({ success: true, message: "Endorsements received fetched.", data });
  } catch (error) { next(error); }
}

async function getStats(req, res, next) {
  try {
    const data = await lecturerService.getLecturerStats(req.user.id);
    return res.status(200).json({ success: true, message: "Lecturer stats fetched.", data });
  } catch (error) { next(error); }
}

async function getVerifiedTutors(req, res, next) {
  try {
    const data = await lecturerService.getVerifiedTutors();
    return res.status(200).json({ success: true, message: "Verified tutors fetched.", data });
  } catch (error) { next(error); }
}

module.exports = {
  searchStudents,
  getStudentListings,
  createEndorsement,
  revokeEndorsement,
  getEndorsementsGiven,
  getEndorsementsReceived,
  getStats,
  getVerifiedTutors
};