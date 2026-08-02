const { validationResult } = require("express-validator");
const userService = require("../services/user.service");
const { uploadProfilePhoto } = require("./upload.controller");

async function getUserProfile(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const userId = Number(req.params.id);
    const profile = await userService.getUserProfile(userId);

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully.",
      data: profile
    });
  } catch (error) {
    next(error);
  }
}

async function updateMyProfilePhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please choose an image to upload." });
    }

    const profilePhotoUrl = await uploadProfilePhoto(req.file);
    const user = await userService.updateProfilePhoto(req.user.id, profilePhotoUrl);

    return res.status(200).json({
      success: true,
      message: "Profile photo updated successfully.",
      data: user
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUserProfile,
  updateMyProfilePhoto
};
