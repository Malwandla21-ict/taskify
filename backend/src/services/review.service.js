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

  const [rows] = await pool.execute(
    `
      SELECT
        r.id,
        r.task_id,
        r.reviewer_id,
        r.reviewee_id,
        r.rating,
        r.comment,
        r.created_at
      FROM reviews r
      WHERE r.id = ?
      LIMIT 1
    `,
    [result.insertId]
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
  createReview
};