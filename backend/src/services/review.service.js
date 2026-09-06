const pool = require("../config/db");
const notificationService = require("./notification.service");

async function createReview({
  taskId,
  reviewerId,
  rating,
  comment
}) {
  const [taskRows] = await pool.execute(
    `
      SELECT
        id,
        title,
        created_by,
        accepted_by,
        status
      FROM tasks
      WHERE id = ?
      LIMIT 1
    `,
    [taskId]
  );

  if (taskRows.length === 0) {
    const error = new Error("Task not found.");
    error.statusCode = 404;
    throw error;
  }

  const task = taskRows[0];

  if (task.status !== "Completed") {
    const error = new Error(
      "Reviews can only be submitted for completed tasks."
    );
    error.statusCode = 400;
    throw error;
  }

  const isCreator =
    Number(task.created_by) === Number(reviewerId);

  const isAcceptedUser =
    Number(task.accepted_by) === Number(reviewerId);

  if (!isCreator && !isAcceptedUser) {
    const error = new Error(
      "You are not allowed to review this task."
    );
    error.statusCode = 403;
    throw error;
  }

  const revieweeId =
    isCreator
      ? task.accepted_by
      : task.created_by;

  if (!revieweeId) {
    const error = new Error(
      "This task does not have a valid review target."
    );
    error.statusCode = 400;
    throw error;
  }

  const [existingReviewRows] = await pool.execute(
    `
      SELECT id
      FROM reviews
      WHERE task_id = ?
      AND reviewer_id = ?
      LIMIT 1
    `,
    [taskId, reviewerId]
  );

  if (existingReviewRows.length > 0) {
    const error = new Error(
      "You have already reviewed this task."
    );
    error.statusCode = 409;
    throw error;
  }

  const normalizedComment =
    comment ? comment.trim() : null;

  const [result] = await pool.execute(
    `
      INSERT INTO reviews (
        task_id,
        reviewer_id,
        reviewee_id,
        rating,
        comment
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      taskId,
      reviewerId,
      revieweeId,
      Number(rating),
      normalizedComment
    ]
  );

  await updateUserRatingStats(revieweeId);

  await notificationService.createNotification({
    userId: revieweeId,
    title: "New Review Received",
    message: `You received a ${rating}/5 review for "${task.title}".`
  });

  return getReviewById(result.insertId);
}

async function createEquipmentReview({
  bookingId,
  reviewerId,
  rating,
  comment
}) {
  const [bookingRows] = await pool.execute(
    `
      SELECT
        eb.id,
        eb.status,
        eb.renter_id,
        e.owner_id,
        e.name AS equipment_name
      FROM equipment_bookings eb
      INNER JOIN equipment e ON eb.equipment_id = e.id
      WHERE eb.id = ?
      LIMIT 1
    `,
    [bookingId]
  );

  if (bookingRows.length === 0) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  const booking = bookingRows[0];

  if (booking.status !== "Returned") {
    const error = new Error(
      "Reviews can only be submitted once the equipment has been returned."
    );
    error.statusCode = 400;
    throw error;
  }

  const isRenter = Number(booking.renter_id) === Number(reviewerId);
  const isOwner = Number(booking.owner_id) === Number(reviewerId);

  if (!isRenter && !isOwner) {
    const error = new Error(
      "You are not allowed to review this booking."
    );
    error.statusCode = 403;
    throw error;
  }

  const revieweeId = isRenter ? booking.owner_id : booking.renter_id;

  const [existingReviewRows] = await pool.execute(
    `
      SELECT id
      FROM reviews
      WHERE booking_id = ?
      AND reviewer_id = ?
      LIMIT 1
    `,
    [bookingId, reviewerId]
  );

  if (existingReviewRows.length > 0) {
    const error = new Error(
      "You have already reviewed this booking."
    );
    error.statusCode = 409;
    throw error;
  }

  const normalizedComment =
    comment ? comment.trim() : null;

  const [result] = await pool.execute(
    `
      INSERT INTO reviews (
        booking_id,
        reviewer_id,
        reviewee_id,
        rating,
        comment
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      bookingId,
      reviewerId,
      revieweeId,
      Number(rating),
      normalizedComment
    ]
  );

  await updateUserRatingStats(revieweeId);

  await notificationService.createNotification({
    userId: revieweeId,
    title: "New Review Received",
    message: `You received a ${rating}/5 review for "${booking.equipment_name}".`
  });

  return getReviewById(result.insertId);
}

async function updateReview({
  reviewId,
  userId,
  rating,
  comment
}) {
  const review = await getReviewById(reviewId);

  if (!review) {
    const error = new Error("Review not found.");
    error.statusCode = 404;
    throw error;
  }

  if (Number(review.reviewer_id) !== Number(userId)) {
    const error = new Error("You can only edit your own review.");
    error.statusCode = 403;
    throw error;
  }

  const normalizedComment =
    comment ? comment.trim() : null;

  await pool.execute(
    `UPDATE reviews SET rating = ?, comment = ? WHERE id = ?`,
    [Number(rating), normalizedComment, reviewId]
  );

  await updateUserRatingStats(review.reviewee_id);

  return getReviewById(reviewId);
}

async function deleteReview({ reviewId, userId }) {
  const review = await getReviewById(reviewId);

  if (!review) {
    const error = new Error("Review not found.");
    error.statusCode = 404;
    throw error;
  }

  if (Number(review.reviewer_id) !== Number(userId)) {
    const error = new Error("You can only delete your own review.");
    error.statusCode = 403;
    throw error;
  }

  await pool.execute(`DELETE FROM reviews WHERE id = ?`, [reviewId]);

  await updateUserRatingStats(review.reviewee_id);
}

async function getReviewById(reviewId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        task_id,
        booking_id,
        reviewer_id,
        reviewee_id,
        rating,
        comment,
        created_at,
        updated_at
      FROM reviews
      WHERE id = ?
      LIMIT 1
    `,
    [reviewId]
  );
  return rows[0];
}

async function updateUserRatingStats(userId) {
  const [rows] = await pool.execute(
    `
      SELECT
        COALESCE(AVG(rating), 0) AS rating_average,
        COUNT(*) AS total_reviews
      FROM reviews
      WHERE reviewee_id = ?
    `,
    [userId]
  );

  const stats = rows[0];

  await pool.execute(
    `
      UPDATE users
      SET rating_average = ?, total_reviews = ?
      WHERE id = ?
    `,
    [Number(stats.rating_average), Number(stats.total_reviews), userId]
  );
}

module.exports = {
  createReview,
  createEquipmentReview,
  updateReview,
  deleteReview
};
