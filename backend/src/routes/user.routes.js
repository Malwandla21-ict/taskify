const express = require("express");
const { body, param } = require("express-validator");
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

router.patch(
  "/me",
  authenticate,
  [
    body("faculty").optional({ checkFalsy: true }).trim().isLength({ max: 150 }).withMessage("Faculty/department is too long."),
    body("academicYear").optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage("Academic year is too long."),
    body("phoneNumber").optional({ checkFalsy: true }).trim()
      .matches(/^(\+27|27|0)[0-9]{9}$/).withMessage("Please enter a valid South African phone number.")
  ],
  userController.updateMyProfileDetails
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