const express = require("express");
const { authenticate }  = require("../middleware/auth.middleware");
const upload            = require("../middleware/upload.middleware");
const { uploadImages }  = require("../controllers/upload.controller");

const router = express.Router();

/*
  POST /api/upload?folder=tasks
  POST /api/upload?folder=sales
  POST /api/upload?folder=equipment

  Body: multipart/form-data
  Field name: "images" (up to 5 files)
*/
router.post(
  "/",
  authenticate,
  upload.array("images", 5),
  uploadImages
);

module.exports = router;