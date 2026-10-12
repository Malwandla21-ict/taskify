/*
  The University of Mpumalanga's faculties and their schools (ump.ac.za,
  "Faculties and Schools", checked 2026-10-12), plus the support
  departments staff can belong to. Students choose a faculty; lecturers
  and staff may choose either.

  Keep in sync with UMP_FACULTIES in frontend/js/helpers.js.
*/

const FACULTIES = {
  "Faculty of Agriculture and Natural Sciences": [
    "School of Agricultural Sciences",
    "School of Biology and Environmental Sciences",
    "School of Computing and Mathematical Sciences"
  ],
  "Faculty of Economics, Development and Business Sciences": [
    "School of Development Studies",
    "School of Hospitality and Tourism Management",
    "School of Social Sciences"
  ],
  "Faculty of Education": [
    "School of Early Childhood Education"
  ]
};

const SUPPORT_DEPARTMENTS = [
  "Administration", "Finance", "ICT Services", "Library", "Student Affairs", "Other"
];

const FACULTY_NAMES = Object.keys(FACULTIES);
const ALL_FACULTY_OPTIONS = [...FACULTY_NAMES, ...SUPPORT_DEPARTMENTS];

/* Old registration choices → the real faculty. Used once by
   scripts/repair-ump-faculties.js. "ICT" was picked by Computing students
   and by ICT staff, so it depends on the account type. */
const LEGACY_FACULTY_MAP = {
  "Agriculture & Environmental Sciences": "Faculty of Agriculture and Natural Sciences",
  "Economics, Development & Business Sciences": "Faculty of Economics, Development and Business Sciences",
  "Hospitality & Tourism": "Faculty of Economics, Development and Business Sciences",
  "Education": "Faculty of Education"
};

module.exports = { FACULTIES, FACULTY_NAMES, SUPPORT_DEPARTMENTS, ALL_FACULTY_OPTIONS, LEGACY_FACULTY_MAP };
