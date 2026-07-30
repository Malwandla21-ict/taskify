const { validationResult } = require("express-validator");
const reportService = require("../services/report.service");

async function createReport(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const reporterId = req.user.id;
    const { reportedUserId, taskId, reason } = req.body;

    const report = await reportService.createReport({
      reporterId,
      reportedUserId,
      taskId,
      reason
    });

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully.",
      data: report
    });
  } catch (error) {
    next(error);
  }
}

async function getAllReports(req, res, next) {
  try {
    const reports = await reportService.getAllReports();

    return res.status(200).json({
      success: true,
      message: "Reports fetched successfully.",
      data: reports
    });
  } catch (error) {
    next(error);
  }
}

async function resolveReport(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const reportId = Number(req.params.id);

    const report = await reportService.resolveReport(reportId);

    return res.status(200).json({
      success: true,
      message: "Report resolved successfully.",
      data: report
    });
  } catch (error) {
    next(error);
  }
}

async function suspendUser(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const userId = Number(req.params.userId);

    const user = await reportService.suspendUser(userId);

    return res.status(200).json({
      success: true,
      message: "User suspended successfully.",
      data: user
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReport,
  getAllReports,
  resolveReport,
  suspendUser
};