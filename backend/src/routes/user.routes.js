const express = require("express");
const { param } = require("express-validator");
const userController = require("../controllers/user.controller");
const { authenticate } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

router.patch(
  "/me/profile-photo",
  authenticate,
  upload.single("profilePhoto"),
  userController.updateMyProfilePhoto
);

router.get(
  "/:id/profile",
  [
    param("id")
      .isInt({ min: 1 })
      .withMessage("User ID must be a valid positive integer.")
  ],
  userController.getUserProfile
);

module.exports = router;
