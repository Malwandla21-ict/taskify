const express = require("express");
const controller = require("../controllers/adminAllowlist.controller");
const { authenticate, authorize, requireTwoFactor } = require("../middleware/auth.middleware");

const router = express.Router();

/*
  Read-only endpoint. There is no POST/DELETE route here by design — admin
  eligibility can only be changed via the server-side CLI script, never
  through the API or UI. See adminAllowlist.controller.js for details.

  requireTwoFactor added in Stage 4 of the 2FA rollout — this was
  previously reachable by an admin without 2FA even though admin.routes.js
  already gated everything else; closing that gap so 2FA enforcement is
  consistent across every admin-only surface, not just admin.routes.js.
*/
router.get("/", authenticate, authorize("admin"), requireTwoFactor, controller.getAllowlist);

module.exports = router;