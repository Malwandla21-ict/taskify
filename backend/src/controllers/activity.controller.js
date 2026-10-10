const activityService = require("../services/activity.service");

async function getMyActivity(req, res, next) {
  try {
    const activity = await activityService.getMyActivity(req.user.id);
    return res.status(200).json({ success: true, message: "Activity fetched successfully.", data: activity });
  } catch (error) { next(error); }
}

module.exports = { getMyActivity };
