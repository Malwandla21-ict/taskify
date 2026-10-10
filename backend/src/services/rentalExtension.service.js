const pool = require("../config/db");
const notificationService = require("./notification.service");
const { RENTALS } = require("../config/paymentSettings");
const { countRentalDays, roundMoney, calculateProtectionFee } = require("./trust.service");
const {
  returnDueSql, findClash, clashError, prettyDate, prettyDeadline
} = require("./rentalCore.service");

/*
  Rental extensions — the renter asks for more days BEFORE the return
  deadline; nothing changes until all of these have happened:
    1. Taskify checks the extra days are free for this item;
    2. the owner approves (the extra days are then held for the renter);
    3. the renter sees the extra cost and pays it (demo).
  Only then does the booking's end date and return deadline move, and both
  people are told. The agreed date is never changed silently.

  Statuses: Requested → Awaiting Payment → Paid
            Requested → Declined / Cancelled / Expired
            Awaiting Payment → Cancelled / Expired
*/

const OPEN = ["Requested", "Awaiting Payment"];

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/* The newest extension request per booking (for the history cards). */
async function getLatestExtensions(bookingIds) {
  const map = new Map();
  if (!bookingIds.length) return map;
  const [rows] = await pool.query(
    `SELECT x.id, x.booking_id, x.status, x.extra_days, x.extra_amount, x.extra_fee,
            DATE_FORMAT(x.old_end_date, '%Y-%m-%d') AS old_end_date,
            DATE_FORMAT(x.new_end_date, '%Y-%m-%d') AS new_end_date,
            x.payment_due_at, x.created_at, x.responded_at, x.paid_at
     FROM booking_extensions x
     WHERE x.booking_id IN (?)
     ORDER BY x.id DESC`,
    [bookingIds]
  );
  for (const row of rows) if (!map.has(row.booking_id)) map.set(row.booking_id, row);
  return map;
}

/* Locks the item, the booking and its open extension (same order as
   equipment.service.js lockBooking, so nothing deadlocks). */
async function lockForExtension(connection, bookingId) {
  /* Outside the transaction on purpose — see equipment.service.js lockBooking. */
  const [peek] = await pool.execute(`SELECT equipment_id FROM equipment_bookings WHERE id = ?`, [bookingId]);
  if (!peek.length) throw httpError("Booking not found.", 404);
  await connection.execute(`SELECT id FROM equipment WHERE id = ? FOR UPDATE`, [peek[0].equipment_id]);
  const [rows] = await connection.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status, eb.payment_status, eb.picked_up_at,
            DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_text, eb.return_due_at,
            e.owner_id, e.name AS equipment_name, e.daily_price
     FROM equipment_bookings eb INNER JOIN equipment e ON e.id = eb.equipment_id
     WHERE eb.id = ? FOR UPDATE`,
    [bookingId]
  );
  const [ext] = await connection.execute(
    `SELECT id, status, extra_days, extra_amount, extra_fee, payment_due_at,
            DATE_FORMAT(old_end_date, '%Y-%m-%d') AS old_end_date, DATE_FORMAT(new_end_date, '%Y-%m-%d') AS new_end_date
     FROM booking_extensions WHERE booking_id = ? AND status IN ('Requested', 'Awaiting Payment')
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [bookingId]
  );
  return { booking: rows[0], extension: ext[0] || null };
}

function addDays(dateText, n) {
  const [y, m, d] = dateText.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* Renter: ask to keep the item until newEndDate. */
async function requestExtension(bookingId, renterId, newEndDate) {
  const newEnd = String(newEndDate || "").slice(0, 10);
  const { booking, extension } = await withTransaction(async (connection) => {
    const { booking, extension: open } = await lockForExtension(connection, bookingId);
    if (Number(booking.renter_id) !== Number(renterId)) throw httpError("Only the renter can ask for an extension.", 403);
    if (booking.status !== "Confirmed" || !booking.payment_status || booking.payment_status === "Unpaid") {
      throw httpError("You can ask for an extension on a confirmed, paid booking.", 400);
    }
    if (new Date(booking.return_due_at) <= new Date()) {
      throw httpError("The return deadline has passed, so it's too late to ask for an extension. Please return the item and message the owner.", 400);
    }
    if (open) throw httpError("You already have an extension request open for this rental.", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd) || newEnd <= booking.end_text) {
      throw httpError("Choose a new return date after the current one.", 400);
    }

    const firstExtraDay = addDays(booking.end_text, 1);
    const clash = await findClash(connection, booking.equipment_id, firstExtraDay, newEnd, bookingId);
    if (clash) throw clashError(clash);

    const extraDays = countRentalDays(firstExtraDay, newEnd);
    const extraAmount = roundMoney(Number(booking.daily_price) * extraDays);
    const extraFee = calculateProtectionFee(extraAmount);
    const [result] = await connection.execute(
      `INSERT INTO booking_extensions (booking_id, old_end_date, new_end_date, extra_days, extra_amount, extra_fee, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Requested')`,
      [bookingId, booking.end_text, newEnd, extraDays, extraAmount, extraFee]
    );
    return { booking, extension: { id: result.insertId, extraDays, extraAmount, extraFee } };
  });

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Extension Requested",
    message: `The renter of "${booking.equipment_name}" would like to keep it until ${prettyDate(newEnd)} (${extension.extraDays} more day${extension.extraDays === 1 ? "" : "s"}, R${extension.extraAmount.toFixed(2)}). Approve or decline before the current deadline, ${prettyDeadline(booking.return_due_at)}.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  return extension;
}

/* Owner: approve (renter then pays) or decline. */
async function respondToExtension(bookingId, ownerId, approve) {
  const { booking, extension } = await withTransaction(async (connection) => {
    const { booking, extension } = await lockForExtension(connection, bookingId);
    if (Number(booking.owner_id) !== Number(ownerId)) throw httpError("Only the equipment owner can answer an extension request.", 403);
    if (!extension || extension.status !== "Requested") throw httpError("There's no extension request waiting for you on this rental.", 400);
    if (new Date(booking.return_due_at) <= new Date()) throw httpError("The return deadline has already passed.", 400);

    if (approve) {
      const clash = await findClash(connection, booking.equipment_id, addDays(extension.old_end_date, 1), extension.new_end_date, bookingId);
      if (clash) throw clashError(clash);
      /* The renter must pay before the current deadline (or within the
         usual payment window, whichever is sooner). */
      await connection.execute(
        `UPDATE booking_extensions
         SET status = 'Awaiting Payment', responded_at = NOW(),
             payment_due_at = LEAST(NOW() + INTERVAL ? HOUR, (SELECT return_due_at FROM equipment_bookings WHERE id = ?))
         WHERE id = ? AND status = 'Requested'`,
        [RENTALS.paymentWindowHours, bookingId, extension.id]
      );
    } else {
      await connection.execute(
        `UPDATE booking_extensions SET status = 'Declined', responded_at = NOW() WHERE id = ? AND status = 'Requested'`,
        [extension.id]
      );
    }
    return { booking, extension };
  });

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: approve ? "Extension Approved — Please Pay" : "Extension Declined",
    message: approve
      ? `The owner agreed you can keep "${booking.equipment_name}" until ${prettyDate(extension.new_end_date)}. Pay the extra R${(Number(extension.extra_amount) + Number(extension.extra_fee)).toFixed(2)} (demo) to confirm it — until you do, it's still due back by ${prettyDeadline(booking.return_due_at)}.`
      : `The owner declined your extension for "${booking.equipment_name}". Please return it by ${prettyDeadline(booking.return_due_at)}.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  return { status: approve ? "Awaiting Payment" : "Declined" };
}

/* Renter: withdraw an open extension request. */
async function cancelExtension(bookingId, renterId) {
  const { booking } = await withTransaction(async (connection) => {
    const { booking, extension } = await lockForExtension(connection, bookingId);
    if (Number(booking.renter_id) !== Number(renterId)) throw httpError("Only the renter can cancel this extension request.", 403);
    if (!extension) throw httpError("There's no open extension request on this rental.", 400);
    await connection.execute(
      `UPDATE booking_extensions SET status = 'Cancelled', responded_at = COALESCE(responded_at, NOW()) WHERE id = ? AND status IN ('Requested', 'Awaiting Payment')`,
      [extension.id]
    );
    return { booking };
  });
  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Extension Request Withdrawn",
    message: `The renter withdrew their extension request for "${booking.equipment_name}". It's still due back by ${prettyDeadline(booking.return_due_at)}.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  return { status: "Cancelled" };
}

/* Renter: pay the extra (demo). Only now does the return deadline move. */
async function payExtension(bookingId, renterId) {
  const { booking, extension } = await withTransaction(async (connection) => {
    const { booking, extension } = await lockForExtension(connection, bookingId);
    if (Number(booking.renter_id) !== Number(renterId)) throw httpError("Only the renter can pay for this extension.", 403);
    if (!extension || extension.status !== "Awaiting Payment") throw httpError("There's no approved extension waiting for payment.", 400);
    if (new Date(extension.payment_due_at) < new Date()) throw httpError("The time to pay for this extension has run out.", 400);

    const clash = await findClash(connection, booking.equipment_id, addDays(extension.old_end_date, 1), extension.new_end_date, bookingId);
    if (clash) throw clashError(clash);

    const [paid] = await connection.execute(
      `UPDATE booking_extensions SET status = 'Paid', paid_at = NOW() WHERE id = ? AND status = 'Awaiting Payment'`, [extension.id]
    );
    if (paid.affectedRows !== 1) throw httpError("This extension has already been paid.", 409);
    /* The extra rent and fee join the booking's held (demo) payment; the
       reminders start again for the new deadline. */
    await connection.execute(
      `UPDATE equipment_bookings
       SET end_date = ?, return_due_at = ${returnDueSql()},
           rental_days = rental_days + ?, rental_amount = rental_amount + ?, protection_fee = protection_fee + ?,
           return_reminder_sent_at = NULL, overdue_notified_at = NULL, overdue_escalated_at = NULL
       WHERE id = ? AND status = 'Confirmed'`,
      [extension.new_end_date, extension.new_end_date, extension.extra_days, extension.extra_amount, extension.extra_fee, bookingId]
    );
    return { booking, extension };
  });

  const [after] = await pool.execute(`SELECT return_due_at FROM equipment_bookings WHERE id = ?`, [bookingId]);
  const newDeadline = prettyDeadline(after[0].return_due_at);
  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Extension Confirmed",
    message: `The renter paid for the extension (demo). "${booking.equipment_name}" is now due back by ${newDeadline}.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Extension Confirmed",
    message: `Your extension is confirmed. "${booking.equipment_name}" is now due back by ${newDeadline}.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  return { status: "Paid", return_due_at: after[0].return_due_at };
}

/* Extension requests that ran out of time: not answered before the return
   deadline, or approved but not paid in time. Run lazily and by the job. */
async function expireStaleExtensions(equipmentId = null) {
  const filter = equipmentId ? "AND eb.equipment_id = ?" : "";
  const [stale] = await pool.execute(
    `SELECT x.id, x.status, eb.id AS booking_id, eb.renter_id, e.owner_id, e.name, eb.return_due_at
     FROM booking_extensions x
     INNER JOIN equipment_bookings eb ON eb.id = x.booking_id
     INNER JOIN equipment e ON e.id = eb.equipment_id
     WHERE ((x.status = 'Requested' AND eb.return_due_at <= NOW())
         OR (x.status = 'Awaiting Payment' AND x.payment_due_at < NOW()))
       ${filter}`,
    equipmentId ? [equipmentId] : []
  );
  for (const ext of stale) {
    const [result] = await pool.execute(
      `UPDATE booking_extensions SET status = 'Expired', responded_at = COALESCE(responded_at, NOW()) WHERE id = ? AND status = ?`,
      [ext.id, ext.status]
    );
    if (!result.affectedRows) continue;
    await notificationService.createNotification({
      userId: ext.renter_id,
      title: "Extension Expired",
      message: ext.status === "Requested"
        ? `The owner didn't answer your extension request for "${ext.name}" in time, so it has expired. The original return deadline still applies.`
        : `You didn't pay for the extension on "${ext.name}" in time, so it has expired. The original return deadline still applies.`,
      contextType: "equipment_booking",
      contextId: ext.booking_id
    });
  }
}

module.exports = {
  OPEN,
  getLatestExtensions,
  requestExtension,
  respondToExtension,
  cancelExtension,
  payExtension,
  expireStaleExtensions
};
