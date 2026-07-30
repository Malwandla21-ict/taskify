const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.post(
  "/register",
  [
    body("fullName")
      .trim()
      .notEmpty()
      .withMessage("Full name is required.")
      .isLength({ min: 2, max: 100 })
      .withMessage("Full name must be between 2 and 100 characters."),

    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required.")
      .isEmail()
      .withMessage("Email must be valid.")
      .custom((value) => {
        if (!value.toLowerCase().endsWith("@ump.ac.za")) {
          throw new Error("Only UMP student emails are allowed.");
        }

        return true;
      }),

    body("phoneNumber")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required.")
      .matches(/^(\+27|27|0)[0-9]{9}$/)
      .withMessage("Phone number must be a valid South African number."),

    body("password")
      .notEmpty()
      .withMessage("Password is required.")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long.")
  ],
  authController.register
);

router.post(
  "/login",
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required.")
      .isEmail()
      .withMessage("Email must be valid."),

    body("password")
      .notEmpty()
      .withMessage("Password is required.")
  ],
  authController.login
);

module.exports = router;