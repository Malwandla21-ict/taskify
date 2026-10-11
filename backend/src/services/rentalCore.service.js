const { RENTALS } = require("../config/paymentSettings");

/*
  Small building blocks shared by equipment.service.js (bookings) and
  rentalExtension.service.js (extensions), kept here so neither has to
  require the other.
*/

/* Today's date as "YYYY-MM-DD" in Taskify's timezone. */
function todayInTaskifyTimezone() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RENTALS.timeZone }).format(new Date());
}

/* SQL for the agreed return deadline of a DATE expression: RENTALS.returnTime
   (SAST) on that day, converted to the database session's timezone so it
   works on the SAST practice database and the UTC live one alike. Values
   come from config only, never from users. */
function returnDueSql(dateExpression = "?") {
  return `CONVERT_TZ(CONCAT(${dateExpression}, ' ${RENTALS.returnTime}:00'), '${RENTALS.utcOffset}', @@session.time_zone)`;
}

/* End of a day (23:59:59 SAST) in the session's timezone. */
function endOfDaySql(dateExpression = "?") {
  return `CONVERT_TZ(CONCAT(${dateExpression}, ' 23:59:59'), '${RENTALS.utcOffset}', @@session.time_zone)`;
}

/*
  Is anything already holding these dates for this item? Holding means:
    - a booking the owner approved (awaiting payment) or that's confirmed —
      and a COLLECTED rental that's overdue keeps holding the item until
      it actually comes back;
    - extra days from an extension the owner approved that's waiting for
      payment.
  Plain requests ('Pending') don't hold dates — the owner chooses between
  them. Run inside a transaction that has locked the equipment row, so two
  approvals or payments can't both pass this check.
*/
async function findClash(connection, equipmentId, startDate, endDate, excludeBookingId = 0) {
  const today = todayInTaskifyTimezone();
  const [rows] = await connection.execute(
    `SELECT DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_text, DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_text
     FROM equipment_bookings eb
     WHERE eb.equipment_id = ? AND eb.id <> ?
       AND eb.status IN ('Awaiting Payment', 'Confirmed')
       AND eb.start_date <= ?
       AND (CASE WHEN eb.status = 'Confirmed' AND (eb.picked_up_at IS NOT NULL OR eb.payment_status IS NULL) AND eb.end_date < DATE(?) THEN DATE(?) ELSE eb.end_date END) >= ?
     UNION ALL
     SELECT DATE_FORMAT(DATE_ADD(x.old_end_date, INTERVAL 1 DAY), '%Y-%m-%d'), DATE_FORMAT(x.new_end_date, '%Y-%m-%d')
     FROM booking_extensions x
     INNER JOIN equipment_bookings eb ON eb.id = x.booking_id
     WHERE eb.equipment_id = ? AND eb.id <> ?
       AND eb.status = 'Confirmed' AND x.status = 'Awaiting Payment'
       AND DATE_ADD(x.old_end_date, INTERVAL 1 DAY) <= ? AND x.new_end_date >= ?
     LIMIT 1`,
    [equipmentId, excludeBookingId, endDate, today, today, startDate, equipmentId, excludeBookingId, endDate, startDate]
  );
  return rows[0] || null;
}

/*
  For each of these items: the rental that is OVERDUE and still out with
  someone (collected, or a legacy booking, past its return deadline and
  not returned). Returns Map(equipmentId → { bookingId, returnDueAt }),
  the earliest one per item. Used to warn the NEXT renter that the item
  may not be back in time — never to reveal who has it.
*/
async function overdueRentalsByItem(connection, equipmentIds) {
  const ids = [...new Set(equipmentIds.map(Number).filter(Boolean))];
  const result = new Map();
  if (!ids.length) return result;
  const [rows] = await connection.query(
    `SELECT id, equipment_id, return_due_at FROM equipment_bookings
     WHERE equipment_id IN (?) AND status = 'Confirmed'
       AND (picked_up_at IS NOT NULL OR payment_status IS NULL)
       AND return_due_at <= NOW()
     ORDER BY return_due_at`,
    [ids]
  );
  for (const row of rows) {
    const key = Number(row.equipment_id);
    if (!result.has(key)) result.set(key, { bookingId: Number(row.id), returnDueAt: row.return_due_at });
  }
  return result;
}

function clashError(clash) {
  const error = new Error(`Those dates clash with another booking (${prettyDate(clash.start_text)} to ${prettyDate(clash.end_text)}). Please pick different dates.`);
  error.statusCode = 409;
  return error;
}

/*
  Cancels a booking that's still in one of `fromStatuses`, refunding
  anything held (demo), closing open extension requests and switching off
  its reminders. The conditional UPDATE means only one caller can ever win
  — a double click or two people at once can't refund twice. Returns true
  if this call did the cancelling.
*/
async function cancelBookingRow(connection, bookingId, fromStatuses, reason, note = null) {
  const [result] = await connection.execute(
    `UPDATE equipment_bookings
     SET status = 'Cancelled', cancelled_at = NOW(), cancel_reason = ?, cancel_note = ?,
         payment_status = CASE WHEN payment_status = 'Held' THEN 'Refunded' ELSE payment_status END,
         deposit_status = CASE WHEN deposit_status = 'Held' THEN 'Refunded' ELSE deposit_status END,
         return_reminder_sent_at = COALESCE(return_reminder_sent_at, NOW()),
         overdue_notified_at = COALESCE(overdue_notified_at, NOW()),
         overdue_escalated_at = COALESCE(overdue_escalated_at, NOW())
     WHERE id = ? AND status IN (${fromStatuses.map(() => "?").join(", ")})`,
    [reason, note, bookingId, ...fromStatuses]
  );
  if (result.affectedRows !== 1) return false;
  await connection.execute(
    `UPDATE booking_extensions SET status = 'Cancelled', responded_at = COALESCE(responded_at, NOW())
     WHERE booking_id = ? AND status IN ('Requested', 'Awaiting Payment')`,
    [bookingId]
  );
  return true;
}

/* "Sat 11 Oct" for a "YYYY-MM-DD" date. */
function prettyDate(dateText) {
  const [y, m, d] = String(dateText).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/* "Sat 11 Oct, 18:00" for a moment, in Taskify's timezone. */
function prettyDeadline(when) {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: RENTALS.timeZone });
  const time = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: RENTALS.timeZone });
  return `${date}, ${time}`;
}

module.exports = {
  todayInTaskifyTimezone,
  returnDueSql,
  endOfDaySql,
  findClash,
  overdueRentalsByItem,
  clashError,
  cancelBookingRow,
  prettyDate,
  prettyDeadline
};
