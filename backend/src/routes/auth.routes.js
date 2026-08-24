const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/auth.controller");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

router.post(
  "/register",
  upload.single("profilePhoto"),
  [
    body("fullName").trim().notEmpty().withMessage("Full name is required.")
      .isLength({ min: 2, max: 100 }).withMessage("Full name must be between 2 and 100 characters."),

    body("email").trim().notEmpty().withMessage("Email is required.")
      .isEmail().withMessage("Email must be valid.")
      .custom((value) => {
        if (!value.toLowerCase().endsWith("@ump.ac.za")) {
          throw new Error("Only UMP student emails are allowed.");
        }
        return true;
      }),

    body("phoneNumber").trim().notEmpty().withMessage("Phone number is required.")
      .matches(/^(\+27|27|0)[0-9]{9}$/).withMessage("Phone number must be a valid South African number."),

    body("password").notEmpty().withMessage("Password is required.")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long."),

    body("studentNumber").optional({ checkFalsy: true }).trim()
      .isLength({ max: 50 }).withMessage("Student/staff number must be under 50 characters."),

    body("memberType").optional({ checkFalsy: true })
      .isIn(["Student", "Lecturer", "Staff"]).withMessage("Account type must be Student, Lecturer or Staff."),

    body("faculty").optional({ checkFalsy: true }).trim()
      .isLength({ max: 150 }).withMessage("Faculty must be under 150 characters."),

    body("academicYear").optional({ checkFalsy: true }).trim()
      .isLength({ max: 50 }).withMessage("Academic year must be under 50 characters."),

    body("lecturerTitle").optional({ checkFalsy: true })
      .isIn(["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."]).withMessage("Please select a valid title."),

    body("yearsExperience").optional({ checkFalsy: true })
      .isInt({ min: 0, max: 60 }).withMessage("Years of experience must be a reasonable number."),

    body("officeLocation").optional({ checkFalsy: true }).trim()
      .isLength({ max: 150 }).withMessage("Office location must be under 150 characters."),

    body("consultationMode").optional({ checkFalsy: true }).trim()
      .isLength({ max: 150 }).withMessage("Consultation mode must be under 150 characters.")
  ],
  authController.register
);

router.post(
  "/login",
  [
    body("email").trim().notEmpty().withMessage("Email is required.")
      .isEmail().withMessage("Email must be valid."),
    body("password").notEmpty().withMessage("Password is required.")
  ],
  authController.login
);

module.exports = router;