const express = require("express");
const { body, query } = require("express-validator");
const authController = require("../controllers/auth.controller");
const twoFactorController = require("../controllers/twoFactor.controller");
const upload = require("../middleware/upload.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { loginLimiter, registerLimiter, emailActionLimiter, twoFactorLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.post(
  "/register",
  registerLimiter,
  upload.single("profilePhoto"),
  [
    body("fullName").trim().notEmpty().withMessage("Full name is required.")
      .isLength({ min: 2, max: 100 }).withMessage("Full name must be between 2 and 100 characters."),

    body("email").trim().notEmpty().withMessage("Email is required.")
      .isEmail().withMessage("Email must be valid.")
      .custom((value) => {
        const allowedDomains = (process.env.UNIVERSITY_EMAIL_DOMAIN || "ump.ac.za")
          .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
        const normalized = value.toLowerCase();
        if (!allowedDomains.some((domain) => normalized.endsWith(`@${domain}`))) {
          throw new Error("Only UMP student/staff emails are allowed.");
        }
        return true;
      }),

    body("phoneNumber").trim().notEmpty().withMessage("Phone number is required.")
      .matches(/^(\+27|27|0)[0-9]{9}$/).withMessage("Phone number must be a valid South African number."),

    body("password").notEmpty().withMessage("Password is required.")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters long.")
      .matches(/[A-Za-z]/).withMessage("Password must contain at least one letter.")
      .matches(/[0-9]/).withMessage("Password must contain at least one number."),

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
  loginLimiter,
  [
    body("email").trim().notEmpty().withMessage("Email is required.")
      .isEmail().withMessage("Email must be valid."),
    body("password").notEmpty().withMessage("Password is required.")
  ],
  authController.login
);

router.get(
  "/verify-email",
  [ query("token").trim().notEmpty().withMessage("Verification token is required.") ],
  authController.verifyEmail
);

router.post(
  "/resend-verification",
  emailActionLimiter,
  [ body("email").trim().notEmpty().isEmail().withMessage("A valid email is required.") ],
  authController.resendVerification
);

router.post(
  "/forgot-password",
  emailActionLimiter,
  [ body("email").trim().notEmpty().isEmail().withMessage("A valid email is required.") ],
  authController.forgotPassword
);

router.post(
  "/reset-password",
  emailActionLimiter,
  [
    body("token").trim().notEmpty().withMessage("Reset token is required."),
    body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters long.")
      .matches(/[A-Za-z]/).withMessage("Password must contain at least one letter.")
      .matches(/[0-9]/).withMessage("Password must contain at least one number.")
  ],
  authController.resetPassword
);

router.post(
  "/2fa/verify-login",
  twoFactorLimiter,
  [
    body("tempToken").trim().notEmpty().withMessage("Missing session token."),
    body("code").trim().notEmpty().withMessage("Enter your 6-digit code or a backup code.")
  ],
  authController.verifyTwoFactorLogin
);

/* ── 2FA management (authenticated) ── */
router.get("/2fa/status", authenticate, twoFactorController.status);
router.post("/2fa/setup", authenticate, twoFactorLimiter, twoFactorController.setup);
router.post(
  "/2fa/enable",
  authenticate,
  twoFactorLimiter,
  [ body("code").trim().matches(/^\d{6}$/).withMessage("Enter the 6-digit code from your authenticator app.") ],
  twoFactorController.enable
);
router.post(
  "/2fa/disable",
  authenticate,
  twoFactorLimiter,
  [
    body("password").notEmpty().withMessage("Password is required."),
    body("code").trim().notEmpty().withMessage("Enter a 6-digit code or a backup code.")
  ],
  twoFactorController.disable
);

module.exports = router;
