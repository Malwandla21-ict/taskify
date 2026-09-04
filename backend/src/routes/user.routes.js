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
      .matches(/^(\+27|27|0)[0-9]{9}$/).withMessage("Please enter a valid South African phone number."),
    body("bio").optional({ checkFalsy: true }).isLength({ max: 1000 }).withMessage("Bio must be under 1000 characters."),
    body("skills").optional({ nullable: true }).isArray({ max: 12 }).withMessage("Skills must be a list."),
    body("services").optional({ nullable: true }).isArray({ max: 12 }).withMessage("Services must be a list."),
    body("lecturerTitle").optional({ checkFalsy: true }).isIn(["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."]),
    body("yearsExperience").optional({ nullable: true }).isInt({ min: 0, max: 60 }),
    body("officeLocation").optional({ checkFalsy: true }).isLength({ max: 150 }),
    body("consultationMode").optional({ checkFalsy: true }).isLength({ max: 150 }),
    body("availabilityNote").optional({ checkFalsy: true }).isLength({ max: 500 })
  ],
  userController.updateMyProfileDetails
);

router.patch(
  "/me/password",
  authenticate,
  [
    body("currentPassword").notEmpty().withMessage("Your current password is required."),
    body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters long.")
      .matches(/[A-Za-z]/).withMessage("New password must contain at least one letter.")
      .matches(/[0-9]/).withMessage("New password must contain at least one number.")
  ],
  userController.changeMyPassword
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
