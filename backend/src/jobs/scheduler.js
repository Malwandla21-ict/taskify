const pool = require("../config/db");
const notificationService = require("../services/notification.service");
const { TASKS, JOBS } = require("../config/paymentSettings");

/*
  Background reminders, checked every JOBS.intervalMinutes while the
  server runs (Render's free plan has no cron jobs, but the GitHub
  "keep backend awake" workflow keeps the server running). Every job is
  safe to run any number of times: each reminder is claimed with a
  conditional UPDATE before it's sent, so it goes out once even if two
  checks overlap.

  No job here ever moves money — reminders and escalations only notify.
*/

/* Poster hasn't reviewed work the worker marked as done:
   - after TASKS.reviewReminderHours: remind the poster (once);
   - after TASKS.reviewEscalationHours: ask the admins to follow up (once).
   The payment stays held throughout; only the poster or an admin releases it. */
async function sendTaskReviewReminders() {
  const [dueReminders] = await pool.execute(
    `SELECT id, title, created_by FROM tasks
     WHERE status = 'Awaiting Confirmation' AND review_reminder_sent_at IS NULL
       AND awaiting_confirmation_at <= NOW() - INTERVAL ? HOUR`,
    [TASKS.reviewReminderHours]
  );
  for (const task of dueReminders) {
    const [claimed] = await pool.execute(
      `UPDATE tasks SET review_reminder_sent_at = NOW() WHERE id = ? AND review_reminder_sent_at IS NULL`, [task.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.createNotification({
      userId: task.created_by,
      title: "Please Review Your Task",
      message: `The worker marked "${task.title}" as done ${TASKS.reviewReminderHours} hours ago. Please check the work, then confirm to release the payment or report a problem. The payment stays held until you do.`,
      contextType: "task",
      contextId: task.id,
      email: true
    });
  }

  const [dueEscalations] = await pool.execute(
    `SELECT t.id, t.title, t.accepted_by, u.full_name AS poster_name
     FROM tasks t LEFT JOIN users u ON u.id = t.created_by
     WHERE t.status = 'Awaiting Confirmation' AND t.review_escalated_at IS NULL
       AND t.awaiting_confirmation_at <= NOW() - INTERVAL ? HOUR`,
    [TASKS.reviewEscalationHours]
  );
  for (const task of dueEscalations) {
    const [claimed] = await pool.execute(
      `UPDATE tasks SET review_escalated_at = NOW() WHERE id = ? AND review_escalated_at IS NULL`, [task.id]
    );
    if (!claimed.affectedRows) continue;
    const days = Math.round(TASKS.reviewEscalationHours / 24);
    await notificationService.notifyAllAdmins({
      title: "Task Waiting Too Long for Review",
      message: `"${task.title}" was marked as done ${days} days ago and ${task.poster_name || "the poster"} still hasn't confirmed it or reported a problem. The payment is still held. Please follow up with both people.`,
      contextType: "task",
      contextId: task.id
    });
    await notificationService.createNotification({
      userId: task.accepted_by,
      title: "We're Following Up",
      message: `The poster hasn't reviewed "${task.title}" yet, so we've asked a Taskify admin to follow up. Your payment is still held.`,
      contextType: "task",
      contextId: task.id
    });
  }

  return { reminders: dueReminders.length, escalations: dueEscalations.length };
}

async function runScheduledJobs() {
  try {
    await sendTaskReviewReminders();
  } catch (error) {
    console.error("[jobs] Scheduled reminders failed, will retry next run:", error.message);
  }
}

let timer = null;
function startScheduler() {
  if (timer) return;
  timer = setInterval(runScheduledJobs, JOBS.intervalMinutes * 60 * 1000);
  setTimeout(runScheduledJobs, 30 * 1000); // first check shortly after start-up
}

module.exports = { startScheduler, runScheduledJobs, sendTaskReviewReminders };
