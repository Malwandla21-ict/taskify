const pool = require("../config/db");

async function getUserProfile(userId) {
  const [userRows] = await pool.execute(
    `SELECT
       id, full_name, student_number, email, phone_number,
       profile_photo_url AS profilePhoto, member_type, faculty, academic_year,
       role, rating_average, total_reviews, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (userRows.length === 0) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const user = userRows[0];

  const [completedRows] = await pool.execute(
    `SELECT COUNT(*) AS completed_tasks FROM tasks WHERE accepted_by = ? AND status = 'Completed'`,
    [userId]
  );

  const [rentalRows] = await pool.execute(
    `SELECT COUNT(*) AS total_rentals FROM equipment_bookings WHERE renter_id = ?`,
    [userId]
  );

  const [listingRows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM equipment WHERE owner_id = ?) +
       (SELECT COUNT(*) FROM sales_items WHERE seller_id = ?) AS total_listings`,
    [userId, userId]
  );

  const [reviews] = await pool.execute(
    `SELECT
       r.id, r.rating, r.comment, r.created_at,
       reviewer.full_name AS reviewer_name,
       reviewer.profile_photo_url AS reviewer_profile_photo
     FROM reviews r
     INNER JOIN users reviewer ON r.reviewer_id = reviewer.id
     WHERE r.reviewee_id = ?
     ORDER BY r.created_at DESC
     LIMIT 5`,
    [userId]
  );

  return {
    id: user.id,
    full_name: user.full_name,
    student_number: user.student_number,
    email: user.email,
    phone_number: user.phone_number,
    profilePhoto: user.profilePhoto,
    member_type: user.member_type,
    faculty: user.faculty,
    academic_year: user.academic_year,
    role: user.role,
    rating_average: user.rating_average,
    total_reviews: user.total_reviews,
    completed_tasks: completedRows[0].completed_tasks,
    total_rentals: rentalRows[0].total_rentals,
    total_listings: listingRows[0].total_listings,
    recent_reviews: reviews,
    created_at: user.created_at
  };
}

async function updateProfilePhoto(userId, profilePhotoUrl) {
  await pool.execute(
    `UPDATE users SET profile_photo_url = ? WHERE id = ?`,
    [profilePhotoUrl, userId]
  );

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, phone_number, profile_photo_url AS profilePhoto
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

/* Lets a user fill in / correct the details register.html collects but
   that aren't password-sensitive: faculty, academic year, phone number.
   Only updates fields that were actually sent — omitting a field leaves
   it untouched rather than nulling it out. */
async function updateProfileDetails(userId, { faculty, academicYear, phoneNumber } = {}) {
  const updates = [];
  const values  = [];

  if (faculty !== undefined) {
    updates.push("faculty = ?");
    values.push(faculty || null);
  }
  if (academicYear !== undefined) {
    updates.push("academic_year = ?");
    values.push(academicYear || null);
  }
  if (phoneNumber !== undefined) {
    updates.push("phone_number = ?");
    values.push(phoneNumber || null);
  }

  if (!updates.length) {
    const error = new Error("No profile fields provided to update.");
    error.statusCode = 400;
    throw error;
  }

  values.push(userId);
  await pool.execute(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

  return getUserProfile(userId);
}

module.exports = {
  getUserProfile,
  updateProfilePhoto,
  updateProfileDetails
};