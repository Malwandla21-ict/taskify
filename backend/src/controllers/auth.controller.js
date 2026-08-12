const { validationResult } = require("express-validator");
const authService = require("../services/auth.service");
const { uploadProfilePhoto } = require("./upload.controller");

async function register(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

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
      academicYear: req.body.academicYear
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors.array()
      });
    }

    const result = await authService.loginUser({
      email: req.body.email,
      password: req.body.password
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login
};