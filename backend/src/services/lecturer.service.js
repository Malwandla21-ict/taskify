const pool = require("../config/db");

/* ── Search students (for the "Give Endorsement" picker) ── */
async function searchStudents(query) {
  const q = `%${query.trim()}%`;
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, profile_photo_url
     FROM users
     WHERE member_type = 'Student' AND role NOT IN ('banned')
       AND (full_name LIKE ? OR email LIKE ?)
     ORDER BY full_name ASC
     LIMIT 10`,
    [q, q]
  );
  return rows;
}

/* ── A student's listings, so a lecturer can optionally attach an
   endorsement to a specific sales item or equipment listing ── */
async function getStudentListings(userId) {
  const [sales] = await pool.execute(
    `SELECT id, title, status FROM sales_items WHERE seller_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  const [equipment] = await pool.execute(
    `SELECT id, name FROM equipment WHERE owner_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return { sales, equipment };
}

/* ── Endorsements ── */
async function createEndorsement({ lecturerId, endorsedUserId, endorsementType, contextType, contextId, message }) {
  if (Number(lecturerId) === Number(endorsedUserId)) {
    const error = new Error("You cannot endorse yourself."); error.statusCode = 400; throw error;
  }

  const [studentRows] = await pool.execute(
    `SELECT id, full_name, role FROM users WHERE id = ? LIMIT 1`, [endorsedUserId]
  );
  if (studentRows.length === 0) {
    const error = new Error("That user does not exist."); error.statusCode = 404; throw error;
  }
  if (["banned"].includes(studentRows[0].role)) {
    const error = new Error("You cannot endorse a banned user."); error.statusCode = 400; throw error;
  }

  const hasContext = contextType && contextId;

  const [result] = await pool.execute(
    `INSERT INTO lecturer_endorsements (lecturer_id, endorsed_user_id, endorsement_type, context_type, context_id, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      lecturerId, endorsedUserId, endorsementType || "General",
      hasContext ? contextType : null, hasContext ? Number(contextId) : null,
      message ? message.trim() : null
    ]
  );

  return getEndorsementById(result.insertId);
}

async function getEndorsementById(id) {
  const [rows] = await pool.execute(
    `SELECT
       le.id, le.lecturer_id, le.endorsed_user_id, le.endorsement_type,
       le.context_type, le.context_id, le.message, le.created_at,
       lecturer.full_name AS lecturer_name, lecturer.lecturer_title,
       lecturer.profile_photo_url AS lecturer_photo,
       student.full_name AS endorsed_user_name,
       student.profile_photo_url AS endorsed_user_photo
     FROM lecturer_endorsements le
     INNER JOIN users lecturer ON le.lecturer_id = lecturer.id
     INNER JOIN users student ON le.endorsed_user_id = student.id
     WHERE le.id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
}

async function revokeEndorsement(endorsementId, lecturerId) {
  const [rows] = await pool.execute(
    `SELECT id, lecturer_id FROM lecturer_endorsements WHERE id = ? LIMIT 1`,
    [endorsementId]
  );
  if (rows.length === 0) {
    const error = new Error("Endorsement not found."); error.statusCode = 404; throw error;
  }
  if (Number(rows[0].lecturer_id) !== Number(lecturerId)) {
    const error = new Error("You can only revoke your own endorsements."); error.statusCode = 403; throw error;
  }
  await pool.execute(`DELETE FROM lecturer_endorsements WHERE id = ?`, [endorsementId]);
}

async function getEndorsementsGiven(lecturerId) {
  const [rows] = await pool.execute(
    `SELECT
       le.id, le.endorsement_type, le.context_type, le.context_id, le.message, le.created_at,
       student.id AS endorsed_user_id, student.full_name AS endorsed_user_name,
       student.profile_photo_url AS endorsed_user_photo
     FROM lecturer_endorsements le
     INNER JOIN users student ON le.endorsed_user_id = student.id
     WHERE le.lecturer_id = ?
     ORDER BY le.created_at DESC`,
    [lecturerId]
  );
  return rows;
}

async function getEndorsementsReceived(userId) {
  const [rows] = await pool.execute(
    `SELECT
       le.id, le.endorsement_type, le.context_type, le.context_id, le.message, le.created_at,
       lecturer.id AS lecturer_id, lecturer.full_name AS lecturer_name,
       lecturer.lecturer_title, lecturer.profile_photo_url AS lecturer_photo
     FROM lecturer_endorsements le
     INNER JOIN users lecturer ON le.lecturer_id = lecturer.id
     WHERE le.endorsed_user_id = ?
     ORDER BY le.created_at DESC`,
    [userId]
  );
  return rows;
}

async function getLecturerStats(lecturerId) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS endorsements_given,
       COUNT(DISTINCT endorsed_user_id) AS students_endorsed
     FROM lecturer_endorsements
     WHERE lecturer_id = ?`,
    [lecturerId]
  );
  return {
    endorsementsGiven: Number(rows[0].endorsements_given) || 0,
    studentsEndorsed: Number(rows[0].students_endorsed) || 0
  };
}

/* ── Verified Tutors directory: any student with at least one Tutoring
   endorsement, grouped with the lecturers who vouched for them. ── */
async function getVerifiedTutors() {
  const [rows] = await pool.execute(
    `SELECT
       le.id, le.message, le.created_at,
       student.id AS student_id, student.full_name AS student_name,
       student.profile_photo_url AS student_photo, student.faculty,
       student.rating_average, student.total_reviews,
       lecturer.full_name AS lecturer_name, lecturer.lecturer_title
     FROM lecturer_endorsements le
     INNER JOIN users student ON le.endorsed_user_id = student.id
     INNER JOIN users lecturer ON le.lecturer_id = lecturer.id
     WHERE le.endorsement_type = 'Tutoring'
     ORDER BY le.created_at DESC`
  );

  const byStudent = new Map();
  for (const row of rows) {
    if (!byStudent.has(row.student_id)) {
      byStudent.set(row.student_id, {
        student_id: row.student_id,
        student_name: row.student_name,
        student_photo: row.student_photo,
        faculty: row.faculty,
        rating_average: row.rating_average,
        total_reviews: row.total_reviews,
        endorsements: []
      });
    }
    byStudent.get(row.student_id).endorsements.push({
      id: row.id,
      message: row.message,
      created_at: row.created_at,
      lecturer_name: row.lecturer_name,
      lecturer_title: row.lecturer_title
    });
  }

  return Array.from(byStudent.values());
}

module.exports = {
  searchStudents,
  getStudentListings,
  createEndorsement,
  revokeEndorsement,
  getEndorsementsGiven,
  getEndorsementsReceived,
  getLecturerStats,
  getVerifiedTutors
};