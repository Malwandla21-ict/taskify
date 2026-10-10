const express = require("express");
const activityController = require("../controllers/activity.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

/* GET /api/activity — the signed-in user's Action Centre: open tasks,
   offers, sales and rentals, split into "needs you" and "waiting on
   others". Read-only; see activity.service.js. */
router.get("/", authenticate, activityController.getMyActivity);

module.exports = router;
