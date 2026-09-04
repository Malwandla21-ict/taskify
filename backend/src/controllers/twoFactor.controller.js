const { validationResult } = require("express-validator");
const authService = require("../services/auth.service");

function validationFailure(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });
    return true;
  }
  return false;
}

async function status(req, res, next) {
  try {
    const result = await authService.getTwoFactorStatus(req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function setup(req, res, next) {
  try {
    const result = await authService.setupTwoFactor(req.user.id);
    return res.status(200).json({ success: true, message: "Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.", data: result });
  } catch (error) {
    next(error);
  }
}

async function enable(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const result = await authService.enableTwoFactor(req.user.id, req.body.code);
    return res.status(200).json({
      success: true,
      message: "Two-factor authentication is now enabled. Save these backup codes somewhere safe — each can be used once if you lose access to your authenticator app.",
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function disable(req, res, next) {
  try {
    if (validationFailure(req, res)) return;
    const result = await authService.disableTwoFactor(req.user.id, req.body.password, req.body.code);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

module.exports = { status, setup, enable, disable };
