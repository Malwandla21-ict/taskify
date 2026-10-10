const express = require("express");
const { body, param } = require("express-validator");
const lecturerController = require("../controllers/lecturer.controller");
const { authenticate, requireLecturer } = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/feature.middleware");

/* Everything to do with endorsements is behind the endorsements switch
   (config/features.js, off by default). */
const endorsementsOn = requireFeature("endorsements");

const router = express.Router();

router.get("/endorsed-students", authenticate, endorsementsOn, lecturerController.getEndorsedStudents);
router.get(
  "/endorsements/received/:userId",
  authenticate, endorsementsOn,
  [ param("userId").isInt({ min: 1 }) ],
  lecturerController.getEndorsementsReceived
);

router.get("/search-students", authenticate, endorsementsOn, requireLecturer, lecturerController.searchStudents);
router.get(
  "/students/:userId/listings",
  authenticate, endorsementsOn, requireLecturer,
  [ param("userId").isInt({ min: 1 }) ],
  lecturerController.getStudentListings
);
router.get("/endorsements/given", authenticate, endorsementsOn, requireLecturer, lecturerController.getEndorsementsGiven);
router.get("/stats", authenticate, requireLecturer, lecturerController.getStats);

router.post(
  "/endorsements",
  authenticate, endorsementsOn, requireLecturer,
  [
    body("endorsedUserId").isInt({ min: 1 }).withMessage("A student must be selected."),
    body("endorsementType").isIn(["Tutoring", "Toolkit", "General"]).withMessage("Invalid endorsement type."),
    body("contextType").optional({ nullable: true }).isIn(["sales_item", "equipment", "task", "event"]),
    body("contextId").optional({ nullable: true }).isInt({ min: 1 }),
    body("message").optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage("Message must be under 500 characters.")
  ],
  lecturerController.createEndorsement
);

router.delete(
  "/endorsements/:id",
  authenticate, endorsementsOn, requireLecturer,
  [ param("id").isInt({ min: 1 }) ],
  lecturerController.revokeEndorsement
);

module.exports = router;