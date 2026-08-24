const express = require("express");
const { body, param } = require("express-validator");
const lecturerController = require("../controllers/lecturer.controller");
const { authenticate, requireLecturer } = require("../middleware/auth.middleware");

const router = express.Router();

/* Public-ish (any authenticated user) — needed so a student viewing their
   own or someone else's profile can see endorsements, and so the tutor
   directory works for everyone, not just lecturers. */
router.get("/tutors", authenticate, lecturerController.getVerifiedTutors);
router.get(
  "/endorsements/received/:userId",
  authenticate,
  [ param("userId").isInt({ min: 1 }) ],
  lecturerController.getEndorsementsReceived
);

/* Lecturer-only */
router.get("/search-students", authenticate, requireLecturer, lecturerController.searchStudents);
router.get(
  "/students/:userId/listings",
  authenticate, requireLecturer,
  [ param("userId").isInt({ min: 1 }) ],
  lecturerController.getStudentListings
);
router.get("/endorsements/given", authenticate, requireLecturer, lecturerController.getEndorsementsGiven);
router.get("/stats", authenticate, requireLecturer, lecturerController.getStats);

router.post(
  "/endorsements",
  authenticate, requireLecturer,
  [
    body("endorsedUserId").isInt({ min: 1 }).withMessage("A student must be selected."),
    body("endorsementType").isIn(["Tutoring", "Toolkit", "General"]).withMessage("Invalid endorsement type."),
    body("contextType").optional({ nullable: true }).isIn(["sales_item", "equipment"]),
    body("contextId").optional({ nullable: true }).isInt({ min: 1 }),
    body("message").optional({ checkFalsy: true }).isLength({ max: 500 }).withMessage("Message must be under 500 characters.")
  ],
  lecturerController.createEndorsement
);

router.delete(
  "/endorsements/:id",
  authenticate, requireLecturer,
  [ param("id").isInt({ min: 1 }) ],
  lecturerController.revokeEndorsement
);

module.exports = router;