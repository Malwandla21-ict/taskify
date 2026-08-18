const express = require("express");
const controller = require("../controllers/adminAllowlist.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");

const router = express.Router();

/*
  Read-only endpoint. There is no POST/DELETE route here by design — admin
  eligibility can only be changed via the server-side CLI script, never
  through the API or UI. See adminAllowlist.controller.js for details.
*/
router.get("/", authenticate, authorize("admin"), controller.getAllowlist);

module.exports = router;