const pool = require("../config/db");
const notificationService = require("../services/notification.service");
const reportService = require("../services/report.service");
const { TASKS, JOBS, RENTALS } = require("../config/paymentSettings");
const { expireStaleBookingRequests } = require("../services/equipment.service");
const { prettyDate, prettyDeadline } = require("../services/rentalCore.service");

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

/* Rentals out on rent (collected, or legacy bookings from before pickup
   photos) — around the agreed return deadline (return_due_at):
   - RENTALS.returnReminderHours before it: remind the renter (once);
   - once it has passed: tell the renter and the owner (once);
   - RENTALS.overdueEscalationHours after it: ask admins to follow up (once).
   And for the NEXT booking on an overdue item that starts today or
   tomorrow (approved or paid, not collected yet): warn its renter and the
   owner (once). The renter can wait, or cancel for a full refund (demo).
   Once the renter has said "I've handed it back", their reminders stop;
   if the owner doesn't confirm (or dispute) that within
   RENTALS.handbackConfirmHours, the owner is reminded and admins are
   asked to decide (once).
   Each admin escalation also files a report, so it shows up in the admin
   Reports table with the buttons to settle it.
   No late fee is ever charged — config/rentalPolicy.js lateFee isn't in effect. */
async function sendRentalReminders() {
  const outOnRent = `eb.status = 'Confirmed' AND (eb.picked_up_at IS NOT NULL OR eb.payment_status IS NULL) AND eb.return_reported_at IS NULL`;
  const select = `SELECT eb.id, eb.renter_id, eb.return_due_at, e.owner_id, e.name, renter.full_name AS renter_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON e.id = eb.equipment_id
     LEFT JOIN users renter ON renter.id = eb.renter_id`;

  const [dueSoon] = await pool.execute(
    `${select} WHERE ${outOnRent} AND eb.return_reminder_sent_at IS NULL
       AND eb.return_due_at > NOW() AND eb.return_due_at <= NOW() + INTERVAL ? HOUR`,
    [RENTALS.returnReminderHours]
  );
  for (const b of dueSoon) {
    const [claimed] = await pool.execute(
      `UPDATE equipment_bookings SET return_reminder_sent_at = NOW() WHERE id = ? AND return_reminder_sent_at IS NULL`, [b.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.createNotification({
      userId: b.renter_id,
      title: "Return Due Soon",
      message: `"${b.name}" is due back by ${prettyDeadline(b.return_due_at)}. Arrange the return with the owner, or ask for an extension before then if you need it longer.`,
      contextType: "equipment_booking",
      contextId: b.id,
      email: true
    });
  }

  const [overdue] = await pool.execute(
    `${select} WHERE ${outOnRent} AND eb.overdue_notified_at IS NULL AND eb.return_due_at <= NOW()`
  );
  for (const b of overdue) {
    const [claimed] = await pool.execute(
      `UPDATE equipment_bookings SET overdue_notified_at = NOW(), return_reminder_sent_at = COALESCE(return_reminder_sent_at, NOW())
       WHERE id = ? AND overdue_notified_at IS NULL`, [b.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.createNotification({
      userId: b.renter_id,
      title: "Rental Overdue",
      message: `"${b.name}" was due back by ${prettyDeadline(b.return_due_at)}. Please return it to the owner as soon as possible. If the owner isn't available, use "Report a problem" on the rental so it's on record.`,
      contextType: "equipment_booking",
      contextId: b.id,
      email: true
    });
    await notificationService.createNotification({
      userId: b.owner_id,
      title: "Rental Overdue",
      message: `${b.renter_name || "The renter"} hasn't returned "${b.name}" yet — it was due by ${prettyDeadline(b.return_due_at)}. We've reminded them. Message them to arrange the return, or report a problem if they don't respond.`,
      contextType: "equipment_booking",
      contextId: b.id
    });
  }

  /* Bookings waiting on an item that's still overdue elsewhere. */
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: RENTALS.timeZone });
  const [waiting] = await pool.execute(
    `SELECT nb.id, nb.renter_id, DATE_FORMAT(nb.start_date, '%Y-%m-%d') AS start_text,
            e.owner_id, e.name, renter.full_name AS renter_name, MIN(ob.return_due_at) AS overdue_since
     FROM equipment_bookings nb
     INNER JOIN equipment e ON e.id = nb.equipment_id
     INNER JOIN equipment_bookings ob ON ob.equipment_id = nb.equipment_id AND ob.id <> nb.id
       AND ob.status = 'Confirmed' AND (ob.picked_up_at IS NOT NULL OR ob.payment_status IS NULL)
       AND ob.return_due_at <= NOW()
     LEFT JOIN users renter ON renter.id = nb.renter_id
     WHERE nb.return_wait_notified_at IS NULL AND nb.start_date <= ?
       AND (nb.status = 'Awaiting Payment'
            OR (nb.status = 'Confirmed' AND nb.picked_up_at IS NULL AND nb.payment_status IS NOT NULL))
     GROUP BY nb.id, nb.renter_id, nb.start_date, e.owner_id, e.name, renter.full_name`,
    [tomorrow]
  );
  for (const b of waiting) {
    const [claimed] = await pool.execute(
      `UPDATE equipment_bookings SET return_wait_notified_at = NOW() WHERE id = ? AND return_wait_notified_at IS NULL`, [b.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.createNotification({
      userId: b.renter_id,
      title: "Item Not Back Yet",
      message: `The previous rental of "${b.name}" is overdue — it was due back by ${prettyDeadline(b.overdue_since)} — so it may not be ready for your booking from ${prettyDate(b.start_text)}. The owner has been told. You can wait (we'll tell you when it's back), or cancel for a full refund (demo) from your rental history.`,
      contextType: "equipment_booking",
      contextId: b.id,
      email: true
    });
    await notificationService.createNotification({
      userId: b.owner_id,
      title: "Next Renter Waiting",
      message: `${b.renter_name || "A renter"} is booked to collect "${b.name}" from ${prettyDate(b.start_text)}, but it hasn't come back from the previous rental. Record its return as soon as you have it. If you can't hand it over in time, use "Can't hand it over" on their booking — they'll be refunded in full (demo).`,
      contextType: "equipment_booking",
      contextId: b.id
    });
  }

  const [escalate] = await pool.execute(
    `${select.replace("SELECT eb.id,", `SELECT (SELECT COUNT(*) FROM equipment_bookings nb
         WHERE nb.equipment_id = eb.equipment_id AND nb.id <> eb.id AND nb.picked_up_at IS NULL
           AND nb.status IN ('Awaiting Payment', 'Confirmed') AND nb.payment_status IS NOT NULL) AS waiting_bookings, eb.id,`)}
     WHERE ${outOnRent} AND eb.overdue_escalated_at IS NULL AND eb.return_due_at <= NOW() - INTERVAL ? HOUR`,
    [RENTALS.overdueEscalationHours]
  );
  for (const b of escalate) {
    const [claimed] = await pool.execute(
      `UPDATE equipment_bookings SET overdue_escalated_at = NOW() WHERE id = ? AND overdue_escalated_at IS NULL`, [b.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.notifyAllAdmins({
      title: "Rental Still Not Returned",
      message: `"${b.name}" (booking #${b.id}) was due back by ${prettyDeadline(b.return_due_at)} and still hasn't been returned by ${b.renter_name || "the renter"}.${Number(b.waiting_bookings) ? ` ${b.waiting_bookings} later booking${Number(b.waiting_bookings) === 1 ? " is" : "s are"} waiting for it.` : ""} Please follow up with both people. If it isn't coming back, close it as not returned from the Reports page.`,
      contextType: "equipment_booking",
      contextId: b.id
    });
    await reportService.recordReport({
      reporterId: b.owner_id,
      reportedUserId: b.renter_id,
      contextType: "equipment_booking",
      contextId: b.id,
      reason: `Not returned: "${b.name}" was due back by ${prettyDeadline(b.return_due_at)} and is now more than ${RENTALS.overdueEscalationHours} hours overdue. (Filed automatically.)`,
      category: "no_show"
    });
  }

  /* The renter said they handed it back; the owner hasn't confirmed or
     disputed it in time. The rent stays held — only the owner or an admin
     can complete the rental. */
  const [unconfirmed] = await pool.execute(
    `SELECT eb.id, eb.renter_id, eb.return_reported_at, e.owner_id, e.name, renter.full_name AS renter_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON e.id = eb.equipment_id
     LEFT JOIN users renter ON renter.id = eb.renter_id
     WHERE eb.status = 'Confirmed' AND eb.return_reported_at IS NOT NULL AND eb.return_report_escalated_at IS NULL
       AND eb.return_reported_at <= NOW() - INTERVAL ? HOUR`,
    [RENTALS.handbackConfirmHours]
  );
  for (const b of unconfirmed) {
    const [claimed] = await pool.execute(
      `UPDATE equipment_bookings SET return_report_escalated_at = NOW() WHERE id = ? AND return_report_escalated_at IS NULL`, [b.id]
    );
    if (!claimed.affectedRows) continue;
    await notificationService.createNotification({
      userId: b.owner_id,
      title: "Please Confirm the Return",
      message: `${b.renter_name || "The renter"} said they handed back "${b.name}" on ${prettyDeadline(b.return_reported_at)}, and you haven't confirmed it yet. Press "Yes, it's back" on the rental to get your rent, or "I don't have it" if you don't. A Taskify admin has been asked to follow up.`,
      contextType: "equipment_booking",
      contextId: b.id,
      email: true
    });
    await notificationService.notifyAllAdmins({
      title: "Return Not Confirmed",
      message: `${b.renter_name || "The renter"} said they handed back "${b.name}" (booking #${b.id}) on ${prettyDeadline(b.return_reported_at)}, but the owner hasn't confirmed it in ${RENTALS.handbackConfirmHours} hours. Check the return photos, then settle it from the Reports page.`,
      contextType: "equipment_booking",
      contextId: b.id
    });
    await reportService.recordReport({
      reporterId: b.renter_id,
      reportedUserId: b.owner_id,
      contextType: "equipment_booking",
      contextId: b.id,
      reason: `Return not confirmed: the renter said they handed back "${b.name}" on ${prettyDeadline(b.return_reported_at)}, and the owner hasn't confirmed it in ${RENTALS.handbackConfirmHours} hours. (Filed automatically.)`,
      category: "other"
    });
  }

  return { reminders: dueSoon.length, overdue: overdue.length, waiting: waiting.length, escalations: escalate.length, unconfirmed: unconfirmed.length };
}

async function runScheduledJobs() {
  for (const [name, job] of [
    ["task reviews", sendTaskReviewReminders],
    ["rental expiry", () => expireStaleBookingRequests()],
    ["rental reminders", sendRentalReminders]
  ]) {
    try {
      await job();
    } catch (error) {
      console.error(`[jobs] ${name} failed, will retry next run:`, error.message);
    }
  }
}

let timer = null;
function startScheduler() {
  if (timer) return;
  timer = setInterval(runScheduledJobs, JOBS.intervalMinutes * 60 * 1000);
  setTimeout(runScheduledJobs, 30 * 1000); // first check shortly after start-up
}

module.exports = { startScheduler, runScheduledJobs, sendTaskReviewReminders, sendRentalReminders };
