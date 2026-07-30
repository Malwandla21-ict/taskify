const pool = require("../config/db");

async function getUserProfile(userId) {
  const [userRows] = await pool.execute(
    `
      SELECT
        id,
        full_name,
        email,
        phone_number,
        role,
        rating_average,
        total_reviews,
        created_at
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
    `
      SELECT COUNT(*) AS completed_tasks
      FROM tasks
      WHERE accepted_by = ? AND status = 'Completed'
    `,
    [userId]
  );

  const [reviews] = await pool.execute(
    `
      SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        reviewer.full_name AS reviewer_name
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
    email: user.email,
    phone_number: user.phone_number,
    role: user.role,
    rating_average: user.rating_average,
    total_reviews: user.total_reviews,
    completed_tasks: completedRows[0].completed_tasks,
    recent_reviews: reviews,
    created_at: user.created_at
  };
}

module.exports = {
  getUserProfile
};