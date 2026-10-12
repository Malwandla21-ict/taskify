const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/auth.controller");
const twoFactorController = require("../controllers/twoFactor.controller");
const upload = require("../middleware/upload.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { loginLimiter, registerLimiter, emailActionLimiter, twoFactorLimiter } = require("../middleware/rateLimit.middleware");
const { ALL_FACULTY_OPTIONS, FACULTY_NAMES } = require("../config/faculties");

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

    /* UMP student numbers are 9 digits; staff and lecturer numbers are 5.
       A student's email is their student number, so the two must match. */
    body("studentNumber").trim().notEmpty().withMessage("Your student or staff number is required.").bail()
      .custom((value, { req }) => {
        const isStudent = !req.body.memberType || req.body.memberType === "Student";
        if (isStudent && !/^\d{9}$/.test(value)) throw new Error("Your student number must be exactly 9 digits.");
        if (!isStudent && !/^\d{5}$/.test(value)) throw new Error("Your staff number must be exactly 5 digits.");
        const local = String(req.body.email || "").trim().toLowerCase().split("@")[0];
        if (isStudent && /^\d+$/.test(local) && local !== value) {
          throw new Error("Your student email should be your student number — check that both match.");
        }
        return true;
      }),

    body("memberType").optional({ checkFalsy: true })
      .isIn(["Student", "Lecturer", "Staff"]).withMessage("Account type must be Student, Lecturer or Staff."),

    body("faculty").optional({ checkFalsy: true }).trim()
      .isIn(ALL_FACULTY_OPTIONS).withMessage("Please choose your faculty or department from the list.")
      .custom((value, { req }) => {
        if ((!req.body.memberType || req.body.memberType === "Student") && !FACULTY_NAMES.includes(value)) {
          throw new Error("Students need to choose one of the three UMP faculties.");
        }
        return true;
      }),

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
    body("password").notEmpty().withMessage("Password is required."),
    /* Optional "remember this device" proof from a prior 2FA login (see
       /2fa/verify-login below) — never required, ignored entirely for
       admin accounts server-side regardless of what's sent here. */
    body("deviceToken").optional({ checkFalsy: true }).trim().isLength({ max: 128 }).withMessage("Invalid device token.")
  ],
  authController.login
);

/* OTP-based, not a link click — twoFactorLimiter (not emailActionLimiter)
   because this is the "guess a 6-digit code" endpoint, same abuse shape as
   2FA verification, not the "send an email" endpoint (that's below). */
router.post(
  "/verify-email",
  twoFactorLimiter,
  [
    body("email").trim().notEmpty().withMessage("Email is required.")
      .isEmail().withMessage("Email must be valid."),
    body("code").trim().notEmpty().withMessage("Enter the 6-digit code from your email.")
  ],
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
    body("code").trim().notEmpty().withMessage("Enter your 6-digit code or a backup code."),
    /* Only honored for student/lecturer accounts — ignored for admin
       server-side even if somehow sent as true (see loginUser/
       verifyTwoFactorLogin's canRememberDevice/role checks). */
    body("rememberDevice").optional().isBoolean().withMessage("Invalid value.")
  ],
  authController.verifyTwoFactorLogin
);

/* Sends the email-OTP fallback (see auth.service.js's requestLoginEmailOtp).
   Rate-limited with emailActionLimiter, same as forgot-password/resend-
   verification, since this also sends mail — twoFactorLimiter is for
   guessing codes, not requesting them. */
router.post(
  "/2fa/verify-login/email-otp",
  emailActionLimiter,
  [ body("tempToken").trim().notEmpty().withMessage("Missing session token.") ],
  authController.requestTwoFactorEmailOtp
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

/* Replaces the set of backup codes without a full disable/re-enroll —
   same password + code proof as disable, so it can't be used to strand
   someone else's account with fresh codes they never see. */
router.post(
  "/2fa/backup-codes/regenerate",
  authenticate,
  twoFactorLimiter,
  [
    body("password").notEmpty().withMessage("Password is required."),
    body("code").trim().notEmpty().withMessage("Enter a 6-digit code or a backup code.")
  ],
  twoFactorController.regenerateBackupCodes
);

/* Email-based 2FA enrollment — alternative to the QR-code/authenticator
   path above. setup-email sends mail (emailActionLimiter); enable-email
   is a code guess (twoFactorLimiter), same split as the login-time
   equivalents further up this file. */
router.post("/2fa/setup-email", authenticate, emailActionLimiter, twoFactorController.setupEmail);
router.post(
  "/2fa/enable-email",
  authenticate,
  twoFactorLimiter,
  [ body("code").trim().matches(/^\d{6}$/).withMessage("Enter the 6-digit code from your email.") ],
  twoFactorController.enableEmail
);

/* Trusted-device management (Stage 3 of the 2FA rollout) — view and revoke
   the devices that currently skip 2FA on login. Plain authenticate is
   enough here: these are read/manage-your-own-account actions, not a
   credential-guessing surface, same tier as /2fa/status above. */
router.get("/2fa/trusted-devices", authenticate, twoFactorController.listTrustedDevices);
router.delete("/2fa/trusted-devices/:id", authenticate, twoFactorController.revokeTrustedDevice);
router.post("/2fa/trusted-devices/revoke-all", authenticate, twoFactorController.revokeAllTrustedDevices);

module.exports = router;
