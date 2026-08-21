const pool = require("../config/db");

async function getUserProfile(userId) {
  const [userRows] = await pool.execute(
    `
      SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        role, rating_average, total_reviews, created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
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
    `
      SELECT
        (SELECT COUNT(*) FROM equipment WHERE owner_id = ?) +
        (SELECT COUNT(*) FROM sales_items WHERE seller_id = ?) AS total_listings
    `,
    [userId, userId]
  );

  const [reviews] = await pool.execute(
    `
      SELECT
        r.id, r.rating, r.comment, r.created_at,
        reviewer.full_name AS reviewer_name,
        reviewer.profile_photo_url AS reviewer_profile_photo
      FROM reviews r
      INNER JOIN users reviewer ON r.reviewer_id = reviewer.id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
      LIMIT 5
    `,
    [userId]
  );

  return {
    id: user.id,
    full_name: user.full_name,
    student_number: user.student_number,
    member_type: user.member_type,
    email: user.email,
    phone_number: user.phone_number,
    faculty: user.faculty,
    academic_year: user.academic_year,
    profilePhoto: user.profilePhoto,
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
  await pool.execute(`UPDATE users SET profile_photo_url = ? WHERE id = ?`, [profilePhotoUrl, userId]);
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, phone_number, profile_photo_url AS profilePhoto
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

module.exports = { getUserProfile, updateProfilePhoto };