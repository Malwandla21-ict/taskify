const express = require("express");
const { param } = require("express-validator");
const userController = require("../controllers/user.controller");

const router = express.Router();

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