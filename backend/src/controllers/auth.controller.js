const { validationResult } = require("express-validator");
const authService = require("../services/auth.service");
const { uploadProfilePhoto } = require("./upload.controller");
const { requestContext } = require("../services/securityLog.service");

function validationFailure(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });
    return true;
  }
  return false;
}

async function register(req, res, next) {
  try {
    if (validationFailure(req, res)) return;

    const profilePhotoUrl = await uploadProfilePhoto(req.file);

    const result = await authService.registerUser({
      fullName: req.body.fullName,
      email: req.body.email,
      phoneNumber: req.body.phoneNumber,
      password: req.body.password,
      profilePhotoUrl,
      studentNumber: req.body.studentNumber,
      memberType: req.body.memberType,
      faculty: req.body.faculty,
      academicYear: req.body.academicYear,
      lecturerTitle: req.body.lecturerTitle,
      yearsExperience: req.body.yearsExperience,
      officeLocation: req.body.officeLocation,
      consultationMode: req.body.consultationMode
    });

    return res.status(201).json({ success: true, message: result.message, data: { email: result.email } });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    if (validationFailure(req, res)) return;

    const { ip, userAgent } = requestContext(req);
    const result = await authService.loginUser({
      email: req.body.email,
      password: req.body.password,
      ip,
      userAgent
    });

    if (result.requires2FA) {
      return res.status(200).json({
        success: true,
        message: "Password verified. Enter your two-factor authentication code to finish signing in.",
        data: { requires2FA: true, tempToken: result.tempToken }
      });
    }

    return res.status(200).json({ success: true, message: "Login successful.", data: result });
  } catch (error) {
    next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const result = await authService.verifyEmailToken(req.query.token);
    return res.status(200).json({ success: true, message: "Email verified. You're now logged in.", data: result });
  } catch (error) {
    next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const result = await authService.resendVerificationEmail(req.body.email);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const result = await authService.forgotPassword(req.body.email);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const result = await authService.resetPassword(req.body.token, req.body.newPassword);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

async function verifyTwoFactorLogin(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const { ip, userAgent } = requestContext(req);
    const result = await authService.verifyTwoFactorLogin(req.body.tempToken, req.body.code, { ip, userAgent });
    return res.status(200).json({ success: true, message: "Login successful.", data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  verifyTwoFactorLogin
};
