const pool = require("../config/db");
const notificationService = require("./notification.service");
const { messagingAccess } = require("./conversation.service");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const contentModerationService = require("./contentModeration.service");
const { moderateListingEdit, notifyEditFlagged } = require("./listingEdit.service");
const trustService = require("./trust.service");
const reportService = require("./report.service");
const { RENTALS } = require("../config/paymentSettings");
const rentalPolicy = require("./rentalPolicy.service");
const rentalExtensionService = require("./rentalExtension.service");
const auditLogService = require("./auditlog.service");

const {
  todayInTaskifyTimezone, returnDueSql, endOfDaySql, findClash, clashError,
  cancelBookingRow, prettyDate, prettyDeadline
} = require("./rentalCore.service");

function assertBookingDates(startDate, endDate) {
  const start = String(startDate || "").slice(0, 10);
  const end = String(endDate || "").slice(0, 10);
  if (start < todayInTaskifyTimezone()) {
    const error = new Error("A booking can't start in the past."); error.statusCode = 400; throw error;
  }
  if (end < start) {
    const error = new Error("End date cannot be before start date."); error.statusCode = 400; throw error;
  }
}

/*
  Lapsed requests and approvals, run lazily whenever equipment is listed,
  viewed or booked, and by the background job (jobs/scheduler.js):
    - a request the owner didn't answer within RENTALS.requestExpiryHours,
      or whose start date has passed → cancelled (refunded if it was an
      old-style request that was paid up front);
    - an approval the renter didn't pay for by payment_due_at → cancelled,
      and the dates are free again;
    - extension requests that ran out of time (rentalExtension.service.js).
  Each one is cancelled with a conditional UPDATE, so it happens once.
  Pass an equipmentId to check one item, or nothing to check them all.
*/
async function expireStaleBookingRequests(equipmentId = null) {
  const today = todayInTaskifyTimezone();
  const filter = equipmentId ? "AND eb.equipment_id = ?" : "";
  const withItem = (...params) => (equipmentId ? [...params, equipmentId] : params);

  const [requests] = await pool.execute(
    `SELECT eb.id, eb.renter_id, eb.payment_status, e.owner_id, e.name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON e.id = eb.equipment_id
     WHERE eb.status = 'Pending'
       AND (eb.created_at < NOW() - INTERVAL ? HOUR OR eb.start_date < ?)
       ${filter}`,
    withItem(RENTALS.requestExpiryHours, today)
  );
  for (const booking of requests) {
    if (!(await cancelBookingRow(pool, booking.id, ["Pending"], "request_expired"))) continue;
    const wasPaid = booking.payment_status === "Held";
    await notificationService.createNotification({
      userId: booking.renter_id,
      title: "Booking Request Expired",
      message: `The owner didn't respond to your request for "${booking.name}" in time, so it has expired${wasPaid ? " and your payment was refunded (demo)" : ""}. You can request it again or look for something similar.`,
      contextType: "equipment_booking",
      contextId: booking.id
    });
    await notificationService.createNotification({
      userId: booking.owner_id,
      title: "Booking Request Expired",
      message: `A booking request for "${booking.name}" expired because it wasn't approved or declined in time${wasPaid ? ". The renter was refunded (demo)" : ""}.`,
      contextType: "equipment_booking",
      contextId: booking.id
    });
  }

  const [unpaid] = await pool.execute(
    `SELECT eb.id, eb.renter_id, e.owner_id, e.name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON e.id = eb.equipment_id
     WHERE eb.status = 'Awaiting Payment' AND eb.payment_due_at < NOW() ${filter}`,
    withItem()
  );
  for (const booking of unpaid) {
    if (!(await cancelBookingRow(pool, booking.id, ["Awaiting Payment"], "payment_expired"))) continue;
    await notificationService.createNotification({
      userId: booking.renter_id,
      title: "Booking Approval Lapsed",
      message: `You didn't pay for "${booking.name}" in time, so the owner's approval has lapsed and the dates are free again. Nothing was charged. You can request it again.`,
      contextType: "equipment_booking",
      contextId: booking.id
    });
    await notificationService.createNotification({
      userId: booking.owner_id,
      title: "Booking Approval Lapsed",
      message: `The renter didn't pay for "${booking.name}" in time, so the booking lapsed and those dates are free again.`,
      contextType: "equipment_booking",
      contextId: booking.id
    });
  }

  await rentalExtensionService.expireStaleExtensions(equipmentId);
}

/* Equipment condition (panel feedback, 2026-10-04). Keep in sync with
   EQUIPMENT_CONDITIONS in frontend/js/helpers.js and the ENUM in
   scripts/repair-equipment-condition-schema.js. */
const EQUIPMENT_CONDITIONS = ["Excellent", "Functional", "Damaged"];

/* Records who last confirmed an item's condition, and when. Called by the
   owner (listing, edit, return check) and the renter (pickup). */
async function setEquipmentCondition(equipmentId, condition, checkedBy) {
  await pool.execute(
    `UPDATE equipment
     SET condition_status = ?, condition_checked_by = ?, condition_checked_at = NOW()
     WHERE id = ?`,
    [condition, checkedBy, equipmentId]
  );
}

/* Before/after condition photos are stored as JSON arrays of image URLs
   (uploaded through the normal /api/upload endpoint first). */
function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

function parseBookingPhotos(row) {
  if (!row) return row;
  row.pickup_photos = parseJsonArray(row.pickup_photos);
  row.return_photos = parseJsonArray(row.return_photos);
  return row;
}

function cleanPhotoUrls(photoUrls) {
  const urls = Array.isArray(photoUrls)
    ? photoUrls.filter(u => typeof u === "string" && /^https:\/\//i.test(u.trim())).map(u => u.trim())
    : [];
  if (!urls.length) {
    const error = new Error("Please add at least one photo of the item's condition."); error.statusCode = 400; throw error;
  }
  if (urls.length > 5) {
    const error = new Error("You can add up to 5 condition photos."); error.statusCode = 400; throw error;
  }
  return urls;
}

/* Money columns shared by every booking query (all DEMO — nothing real
   is charged; see config/paymentSettings.js). Bookings made before the
   payment simulation existed have NULL in all of these, and the code
   treats them as "legacy" bookings that keep the old simple flow. */
const BOOKING_PAYMENT_FIELDS = `
  eb.rental_days, eb.rental_amount, eb.protection_fee, eb.deposit_amount,
  eb.trust_level, eb.payment_status, eb.deposit_status, eb.condition_status,
  eb.pickup_photos, eb.picked_up_at, eb.return_photos, eb.returned_at,
  eb.damage_note, eb.pickup_condition
`;

/* Lifecycle columns every booking view needs. Dates come back as plain
   "YYYY-MM-DD" text (not JS dates, which shift a day in some timezones
   and showed up as raw ISO strings on the history cards). */
const BOOKING_LIFECYCLE_FIELDS = `
  DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_date,
  eb.created_at AS requested_at, eb.approved_at, eb.payment_due_at, eb.paid_at,
  eb.return_due_at, eb.return_minutes_late, eb.cancelled_at, eb.cancel_reason, eb.cancel_note,
  eb.policy_version, eb.terms_snapshot,
  eb.problem_reported_at, eb.problem_reported_by, eb.problem_category, eb.problem_note, eb.return_attempted_at,
  eb.damage_outcome, eb.damage_resolved_at
`;

/* Adds what the screens show on top of the raw row: parsed terms, overdue
   flag, the open extension request, the problem label, and NON-BINDING
   early/late estimates (never charged — see rentalPolicy.service.js). */
function describeBooking(row, extension = null, now = new Date()) {
  if (!row) return row;
  parseBookingPhotos(row);
  row.terms = rentalPolicy.parseTerms(row.terms_snapshot);
  delete row.terms_snapshot;
  row.problem_label = RENTAL_PROBLEM_CATEGORIES[row.problem_category]?.label || null;
  row.extension = extension;

  const outOnRent = row.status === "Confirmed" && (row.picked_up_at || !row.payment_status);
  row.out_on_rent = !!outOnRent;
  row.is_overdue = !!outOnRent && row.return_due_at != null && new Date(row.return_due_at) < now;
  row.estimates = null;
  if (outOnRent && row.return_due_at) {
    const dailyPrice = row.terms?.dailyPrice ?? row.daily_price;
    const itemValue = row.terms?.itemValue ?? row.item_value ?? null;
    row.estimates = {
      lateReturn: rentalPolicy.estimateLateFee({ returnDueAt: row.return_due_at, dailyPrice, itemValue, at: now }),
      earlyReturn: rentalPolicy.estimateEarlyReturnRefund({ endDate: row.end_date, dailyPrice, rentalAmount: row.rental_amount, at: now })
    };
  }
  return row;
}

/* Date ranges already held on an item (approved/paid bookings, an overdue
   rental until it comes back, and approved-but-unpaid extensions) — shown
   on the item page so renters pick free dates. No names or ids. */
async function getBookedRanges(equipmentId) {
  const today = todayInTaskifyTimezone();
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start,
            DATE_FORMAT(CASE WHEN status = 'Confirmed' AND (picked_up_at IS NOT NULL OR payment_status IS NULL) AND end_date < DATE(?) THEN DATE(?) ELSE end_date END, '%Y-%m-%d') AS end
     FROM equipment_bookings
     WHERE equipment_id = ? AND status IN ('Awaiting Payment', 'Confirmed')
       AND (end_date >= DATE(?) OR (status = 'Confirmed' AND (picked_up_at IS NOT NULL OR payment_status IS NULL)))
     UNION ALL
     SELECT DATE_FORMAT(DATE_ADD(x.old_end_date, INTERVAL 1 DAY), '%Y-%m-%d'), DATE_FORMAT(x.new_end_date, '%Y-%m-%d')
     FROM booking_extensions x INNER JOIN equipment_bookings eb ON eb.id = x.booking_id
     WHERE eb.equipment_id = ? AND eb.status = 'Confirmed' AND x.status = 'Awaiting Payment' AND x.new_end_date >= DATE(?)
     ORDER BY start`,
    [today, today, equipmentId, today, equipmentId, today]
  );
  return rows;
}

function parseImageUrls(row) {
  if (!row) return row;
  if (Array.isArray(row.image_urls)) return row;
  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

const EQUIPMENT_SELECT_FIELDS = `
  e.id, e.owner_id, e.name, e.description, e.category,
  e.section, e.daily_price, e.is_available, e.created_at,
  e.image_urls, e.moderation_status, e.item_value,
  e.condition_status, e.condition_checked_by, e.condition_checked_at,
  (SELECT cu.full_name FROM users cu WHERE cu.id = e.condition_checked_by) AS condition_checked_by_name,
  u.full_name AS owner_name,
  u.profile_photo_url AS owner_profile_photo,
  u.member_type AS owner_member_type,
  IF(u.lecturer_verified = 1, u.lecturer_title, NULL) AS owner_lecturer_title,
  u.lecturer_verified AS owner_lecturer_verified
`;

async function createEquipment({
  ownerId, name, description, category, section, condition, dailyPrice, itemValue, imageUrls = []
}) {
  const moderation = await contentModerationService.evaluateListingContent({ title: name, description, imageUrls });

  if (moderation.severe) {
    await contentModerationService.recordBlockedAttempt({
      contentType: "equipment", userId: ownerId, title: name, description,
      flaggedCategories: moderation.flaggedCategories
    });
    await notificationService.notifyAllAdmins({
      title: "Content Blocked",
      message: `An equipment listing titled "${(name || "").trim()}" was blocked at creation for violating content policy (${moderation.flaggedCategories.join(", ")}).`,
      email: true
    });

    const error = new Error("This content violates our content policy and cannot be posted.");
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.execute(
    `INSERT INTO equipment (
       owner_id, name, description, category,
       condition_status, condition_checked_by, condition_checked_at,
       section, daily_price, item_value, is_available, image_urls,
       moderation_status, moderation_flags
     ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 1, ?, ?, ?)`,
    [
      ownerId, name.trim(), description.trim(), category.trim(),
      condition, ownerId,
      section || "General", Number(dailyPrice),
      itemValue === undefined || itemValue === null || itemValue === "" ? null : Number(itemValue),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.flagged ? "pending_review" : "clean",
      moderation.flagged ? JSON.stringify(moderation.flaggedCategories) : null
    ]
  );

  if (moderation.flagged) {
    /* No dedicated "equipment listing" notification context exists (only
       "equipment_booking", which points at a booking row, not a listing) —
       left untyped rather than mislabeling it, same as event.service.js
       does for RSVP notifications. */
    await notificationService.notifyAllAdmins({
      title: "Content Flagged for Review",
      message: `A new equipment listing, "${name.trim()}", was flagged for review (${moderation.flaggedCategories.join(", ")}).`,
      email: true
    });
    await notificationService.createNotification({
      userId: ownerId,
      title: "Listing Held for Review",
      message: `Your equipment listing "${name.trim()}" was flagged by our moderation system and is held from public view until an admin reviews it. We'll let you know as soon as it's approved.`,
      email: true
    });
  }

  return getEquipmentById(result.insertId);
}

/* Only the owner. Allowed at any time — each booking saved its own rent,
   fee and deposit when it was made, so changing the price or item value
   here only affects new bookings. */
async function updateEquipment(equipmentId, userId, {
  name, description, category, section, condition, dailyPrice, itemValue, imageUrls = []
}) {
  const [rows] = await pool.execute(
    `SELECT id, owner_id, moderation_status, moderation_flags FROM equipment WHERE id = ? LIMIT 1`, [equipmentId]
  );

  if (rows.length === 0) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const item = rows[0];

  if (Number(item.owner_id) !== Number(userId)) {
    const error = new Error("Only the owner can edit this listing."); error.statusCode = 403; throw error;
  }

  const moderation = await moderateListingEdit({
    contentType: "equipment", userId, title: name, description, imageUrls, current: item
  });

  await pool.execute(
    /* "Last checked by" only moves to the owner if they actually changed
       the condition — editing the price shouldn't wipe out a renter's
       pickup confirmation. MySQL applies SET left to right, so the two
       IF()s read the OLD condition_status before it's overwritten. */
    `UPDATE equipment
     SET name = ?, description = ?, category = ?, section = ?,
         condition_checked_by = IF(condition_status <=> ?, condition_checked_by, ?),
         condition_checked_at = IF(condition_status <=> ?, condition_checked_at, NOW()),
         condition_status = ?,
         daily_price = ?, item_value = ?, image_urls = ?,
         moderation_status = ?, moderation_flags = ?
     WHERE id = ?`,
    [
      name.trim(), description.trim(), category.trim(),
      section || "General",
      condition, userId,
      condition,
      condition,
      Number(dailyPrice), Number(itemValue),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.moderationStatus, moderation.moderationFlags,
      equipmentId
    ]
  );

  if (moderation.newlyFlagged) {
    await notifyEditFlagged({
      contentType: "equipment", contextId: equipmentId, userId, title: name,
      flaggedCategories: moderation.flaggedCategories
    });
  }

  return getEquipmentById(equipmentId);
}

/* Equipment has no dedicated "my listings" page in the frontend today —
   an owner sees their own items in this same public list, distinguished
   only by the "Yours" badge equipment.js adds client-side. So a
   pending-review item still needs to show up here for its own owner (with
   a "Pending Review" badge instead of "Yours"), even though it's hidden
   from everyone else — unlike tasks/sales/events, which each have a
   separate "my X" view unaffected by this filter. viewerId is optional
   (undefined for a guest, who never matches owner_id anyway). Removed
   items stay hidden from everyone, including the owner, same as before. */
async function getAllAvailableEquipment(viewerId = null) {
  await expireStaleBookingRequests();
  const [rows] = await pool.execute(
    `SELECT ${EQUIPMENT_SELECT_FIELDS}
     FROM equipment e
     LEFT JOIN users u ON e.owner_id = u.id
     WHERE e.is_available = 1
       AND (e.moderation_status = 'clean'
            OR (e.moderation_status = 'pending_review' AND e.owner_id = ?))
     ORDER BY e.created_at DESC`,
    [viewerId]
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "equipment");
}

/* Loads the fields a quote/booking needs and runs the checks every
   booking path shares. is_available is the owner's "listing on" switch —
   bookings themselves no longer switch it off; dates are checked instead. */
async function loadBookableEquipment(equipmentId, renterId) {
  await expireStaleBookingRequests(equipmentId);
  const [equipmentRows] = await pool.execute(
    `SELECT id, owner_id, name, is_available, daily_price, item_value, moderation_status
     FROM equipment WHERE id = ? LIMIT 1`,
    [equipmentId]
  );

  if (equipmentRows.length === 0 || equipmentRows[0].moderation_status !== "clean") {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const equipment = equipmentRows[0];

  if (Number(equipment.owner_id) === Number(renterId)) {
    const error = new Error("You cannot book your own equipment."); error.statusCode = 400; throw error;
  }
  if (!equipment.is_available) {
    const error = new Error("This equipment is not currently available."); error.statusCode = 400; throw error;
  }

  return equipment;
}

/* GET /equipment/:id/rental-quote — the money breakdown and terms shown
   before the renter sends a request. Also says whether the dates are free. */
async function getRentalQuote({ equipmentId, renterId, startDate, endDate }) {
  const equipment = await loadBookableEquipment(equipmentId, renterId);
  assertBookingDates(startDate, endDate);
  const quote = await trustService.buildRentalQuote({ renterId, equipment, startDate, endDate });
  const clash = await findClash(pool, equipmentId, startDate, endDate);
  if (clash && quote.allowed) {
    quote.allowed = false;
    quote.reason = clashError(clash).message;
  }
  return { ...quote, terms: rentalPolicy.currentTerms({ dailyPrice: equipment.daily_price, itemValue: equipment.item_value }) };
}

/*
  Step 1 — the renter REQUESTS dates. Nothing is paid yet: the owner
  approves first (confirmBooking), then the renter pays (payBooking).
  The request records the price, the return deadline, and the terms shown
  (policy version + snapshot) so later changes can't rewrite them.
*/
async function bookEquipment({ equipmentId, renterId, startDate, endDate }) {
  const equipment = await loadBookableEquipment(equipmentId, renterId);
  assertBookingDates(startDate, endDate);

  /* The quote is always recalculated here on the server — the numbers the
     browser showed are never trusted as-is. */
  const quote = await trustService.buildRentalQuote({ renterId, equipment, startDate, endDate });
  if (!quote.allowed) {
    const error = new Error(quote.reason || "You can't rent this item yet."); error.statusCode = 403; throw error;
  }
  const terms = rentalPolicy.currentTerms({ dailyPrice: equipment.daily_price, itemValue: equipment.item_value });

  /* The equipment row is locked so this check and the approvals/payments
     that hold dates happen one at a time. */
  const connection = await pool.getConnection();
  let result;
  try {
    await connection.beginTransaction();
    await connection.execute(`SELECT id FROM equipment WHERE id = ? FOR UPDATE`, [equipmentId]);

    const clash = await findClash(connection, equipmentId, startDate, endDate);
    if (clash) throw clashError(clash);

    const [mine] = await connection.execute(
      `SELECT id FROM equipment_bookings
       WHERE equipment_id = ? AND renter_id = ? AND status IN ('Pending', 'Awaiting Payment') LIMIT 1`,
      [equipmentId, renterId]
    );
    if (mine.length) {
      const error = new Error("You already have an open request for this item. Cancel it first if you want different dates.");
      error.statusCode = 400; throw error;
    }

    [result] = await connection.execute(
      `INSERT INTO equipment_bookings (
         equipment_id, renter_id, start_date, end_date, status,
         rental_days, rental_amount, protection_fee, deposit_amount, trust_level,
         payment_status, deposit_status, return_due_at, policy_version, terms_snapshot
       ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 'Unpaid', ?, ${returnDueSql()}, ?, ?)`,
      [
        equipmentId, renterId, startDate, endDate,
        quote.days, quote.rentalAmount, quote.protectionFee, quote.depositAmount, quote.trust.level,
        quote.depositAmount > 0 ? "Held" : "None",
        endDate, terms.policyVersion, JSON.stringify(terms)
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [renterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [renterId]);
  const renterName = renterRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: equipment.owner_id,
    title: "Booking Request",
    message: `${renterName} would like to rent "${equipment.name}" from ${prettyDate(startDate)} to ${prettyDate(endDate)} (${quote.days} day${quote.days === 1 ? "" : "s"}, R${quote.rentalAmount.toFixed(2)}). Nothing has been paid yet — if you approve, they'll have up to ${RENTALS.paymentWindowHours} hours to pay (demo). The request expires if you don't answer within ${RENTALS.requestExpiryHours} hours.`,
    contextType: "equipment_booking",
    contextId: result.insertId
  });

  return getBookingById(result.insertId);
}

/* Locks the item, then the booking (always in that order, so two
   transactions can't deadlock), and returns the locked booking. */
async function lockBooking(connection, bookingId) {
  /* Looked up OUTSIDE the transaction on purpose: the first plain read in
     a transaction fixes its snapshot, and the clash check must see any
     booking another request approved while this one waited for the lock. */
  const [peek] = await pool.execute(`SELECT equipment_id FROM equipment_bookings WHERE id = ?`, [bookingId]);
  if (!peek.length) {
    const error = new Error("Booking not found."); error.statusCode = 404; throw error;
  }
  await connection.execute(`SELECT id FROM equipment WHERE id = ? FOR UPDATE`, [peek[0].equipment_id]);
  const [rows] = await connection.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status, eb.payment_status, eb.picked_up_at,
            DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_text, DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_text,
            eb.payment_due_at, eb.return_due_at, eb.rental_amount, eb.protection_fee, eb.deposit_amount,
            e.owner_id, e.name AS equipment_name, e.daily_price, e.item_value
     FROM equipment_bookings eb INNER JOIN equipment e ON e.id = eb.equipment_id
     WHERE eb.id = ? FOR UPDATE`,
    [bookingId]
  );
  return rows[0];
}

/*
  Step 2 — the OWNER approves. The dates are checked again (another
  booking may have been approved meanwhile) and then held for the renter,
  who has until payment_due_at to pay. Old-style requests that were paid
  up front (before this flow) go straight to Confirmed.
*/
async function confirmBooking(bookingId, ownerId) {
  const existing = await getBookingWithOwner(bookingId);
  if (Number(existing.owner_id) !== Number(ownerId)) {
    const error = new Error("Only the equipment owner can approve this booking."); error.statusCode = 403; throw error;
  }

  /* A request past its expiry window is expired first, so it can't be
     approved after the renter has already been told it lapsed. */
  await expireStaleBookingRequests(existing.equipment_id);

  const connection = await pool.getConnection();
  let booking;
  let paidUpFront;
  try {
    await connection.beginTransaction();
    booking = await lockBooking(connection, bookingId);

    if (booking.status !== "Pending") {
      const error = new Error(booking.status === "Cancelled"
        ? "This request has expired or was cancelled, so it can't be approved."
        : "This request has already been answered.");
      error.statusCode = booking.status === "Cancelled" ? 400 : 409;
      throw error;
    }
    if (booking.start_text < todayInTaskifyTimezone()) {
      const error = new Error("This request's start date has passed. Decline it — the renter can ask again for new dates.");
      error.statusCode = 400; throw error;
    }
    const clash = await findClash(connection, booking.equipment_id, booking.start_text, booking.end_text, bookingId);
    if (clash) {
      const error = new Error(`You've already approved another booking for some of these dates (${prettyDate(clash.start_text)} to ${prettyDate(clash.end_text)}). Decline this request instead.`);
      error.statusCode = 409; throw error;
    }

    paidUpFront = booking.payment_status === "Held";
    if (paidUpFront) {
      await connection.execute(
        `UPDATE equipment_bookings SET status = 'Confirmed', approved_at = NOW(), paid_at = COALESCE(paid_at, created_at)
         WHERE id = ? AND status = 'Pending'`, [bookingId]
      );
    } else {
      await connection.execute(
        `UPDATE equipment_bookings
         SET status = 'Awaiting Payment', approved_at = NOW(),
             payment_due_at = LEAST(NOW() + INTERVAL ? HOUR, ${endOfDaySql("start_date")})
         WHERE id = ? AND status = 'Pending'`,
        [RENTALS.paymentWindowHours, bookingId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const updated = await getBookingById(bookingId);
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: paidUpFront ? "Booking Confirmed" : "Booking Approved — Please Pay",
    message: paidUpFront
      ? `Your booking for "${booking.equipment_name}" has been confirmed. It's due back by ${prettyDeadline(updated.return_due_at)}.`
      : `The owner approved your request for "${booking.equipment_name}" (${prettyDate(booking.start_text)} to ${prettyDate(booking.end_text)}). Pay (demo) by ${prettyDeadline(updated.payment_due_at)} to confirm it — after that the dates are released.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });

  return updated;
}

/*
  Step 3 — the RENTER pays (demo). The booking becomes Confirmed only now,
  after the dates are checked once more and the renter has accepted the
  current terms (acceptedPolicyVersion must match, so they can't pay under
  terms they never saw). Other requests for the same dates are declined.
*/
async function payBooking(bookingId, renterId, { acceptedPolicyVersion } = {}) {
  await expireStaleBookingRequests();
  const connection = await pool.getConnection();
  let booking;
  let declined = [];
  try {
    await connection.beginTransaction();
    booking = await lockBooking(connection, bookingId);

    if (Number(booking.renter_id) !== Number(renterId)) {
      const error = new Error("Only the renter can pay for this booking."); error.statusCode = 403; throw error;
    }
    if (booking.status !== "Awaiting Payment") {
      const error = new Error(booking.status === "Confirmed"
        ? "This booking is already paid and confirmed."
        : booking.status === "Pending"
          ? "The owner hasn't approved this request yet."
          : "This booking can't be paid for any more.");
      error.statusCode = 400; throw error;
    }
    if (booking.start_text < todayInTaskifyTimezone()) {
      const error = new Error("The start date has passed. Please request new dates."); error.statusCode = 400; throw error;
    }
    if (acceptedPolicyVersion !== rentalPolicy.RENTAL_POLICY.version) {
      const error = new Error("The rental terms have changed since you opened this. Please review them again before paying.");
      error.statusCode = 409; error.code = "TERMS_CHANGED"; throw error;
    }
    const clash = await findClash(connection, booking.equipment_id, booking.start_text, booking.end_text, bookingId);
    if (clash) throw clashError(clash);

    const terms = rentalPolicy.currentTerms({ dailyPrice: booking.daily_price, itemValue: booking.item_value });
    const [paid] = await connection.execute(
      `UPDATE equipment_bookings
       SET status = 'Confirmed', payment_status = 'Held', paid_at = NOW(), policy_version = ?, terms_snapshot = ?
       WHERE id = ? AND status = 'Awaiting Payment' AND payment_due_at >= NOW()`,
      [terms.policyVersion, JSON.stringify(terms), bookingId]
    );
    if (paid.affectedRows !== 1) {
      const error = new Error("The time to pay for this booking has run out, so the dates were released. Please request it again.");
      error.statusCode = 400; throw error;
    }

    /* These dates are now taken: other requests that overlap them can't go ahead. */
    const [overlapping] = await connection.execute(
      `SELECT id, renter_id FROM equipment_bookings
       WHERE equipment_id = ? AND id <> ? AND status = 'Pending' AND start_date <= ? AND end_date >= ?`,
      [booking.equipment_id, bookingId, booking.end_text, booking.start_text]
    );
    for (const other of overlapping) {
      if (await cancelBookingRow(connection, other.id, ["Pending"], "dates_taken")) declined.push(other);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const updated = await getBookingById(bookingId);
  const total = Number(booking.rental_amount) + Number(booking.protection_fee || 0) + Number(booking.deposit_amount || 0);
  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Booking Paid & Confirmed",
    message: `The renter paid R${total.toFixed(2)} (demo) for "${booking.equipment_name}". It's confirmed for ${prettyDate(booking.start_text)} to ${prettyDate(booking.end_text)} and due back by ${prettyDeadline(updated.return_due_at)}. Arrange the handover — they'll confirm pickup with photos.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Booking Confirmed",
    message: `You're booked: "${booking.equipment_name}" from ${prettyDate(booking.start_text)} to ${prettyDate(booking.end_text)}. Collect it from the owner, confirm pickup with photos, and return it by ${prettyDeadline(updated.return_due_at)}.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  for (const other of declined) {
    await notificationService.createNotification({
      userId: other.renter_id,
      title: "Booking Request Declined",
      message: `Your request for "${booking.equipment_name}" couldn't go ahead because those dates were booked by someone else. Nothing was charged.`,
      contextType: "equipment_booking",
      contextId: other.id
    });
  }

  return updated;
}

/* Shared by the cancel paths below: locks, checks who and when, cancels
   once, and returns the booking as it was before. */
async function cancelWithChecks(bookingId, { allowedStatuses, check, reason, note = null }) {
  const connection = await pool.getConnection();
  let booking;
  try {
    await connection.beginTransaction();
    booking = await lockBooking(connection, bookingId);
    check(booking);
    if (!allowedStatuses.includes(booking.status)) {
      const error = new Error("This booking can't be cancelled at this stage."); error.statusCode = 400; throw error;
    }
    if (!(await cancelBookingRow(connection, bookingId, allowedStatuses, reason, note))) {
      const error = new Error("This booking has already been updated. Refresh to see its current status."); error.statusCode = 409; throw error;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return booking;
}

async function declineBooking(bookingId, ownerId) {
  const booking = await cancelWithChecks(bookingId, {
    allowedStatuses: ["Pending"],
    reason: "declined",
    check: (b) => {
      if (Number(b.owner_id) !== Number(ownerId)) {
        const error = new Error("Only the equipment owner can decline this booking."); error.statusCode = 403; throw error;
      }
      if (b.status !== "Pending") {
        const error = new Error("Only booking requests can be declined."); error.statusCode = 400; throw error;
      }
    }
  });

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Booking Declined",
    message: `Your booking request for "${booking.equipment_name}" was declined.${booking.payment_status === "Held" ? " Your held payment has been refunded (demo)." : " Nothing was charged."}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

/* Renter backs out before collecting the item: a request, an approval
   they haven't paid for, or a paid booking they haven't collected yet
   (full refund, demo — see config/rentalPolicy.js cancellation). */
async function cancelBookingByRenter(bookingId, renterId) {
  const booking = await cancelWithChecks(bookingId, {
    allowedStatuses: ["Pending", "Awaiting Payment", "Confirmed"],
    reason: "renter_cancelled",
    check: (b) => {
      if (Number(b.renter_id) !== Number(renterId)) {
        const error = new Error("Only the renter can cancel this booking."); error.statusCode = 403; throw error;
      }
      if (b.status === "Confirmed" && b.picked_up_at) {
        const error = new Error("You've already collected this item — return it instead of cancelling."); error.statusCode = 400; throw error;
      }
    }
  });

  const refunded = booking.payment_status === "Held";
  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Booking Cancelled",
    message: `The renter cancelled their booking for "${booking.equipment_name}" (${prettyDate(booking.start_text)} to ${prettyDate(booking.end_text)}). Those dates are free again.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  if (refunded) {
    await notificationService.createNotification({
      userId: booking.renter_id,
      title: "Refund Complete",
      message: `You cancelled your booking for "${booking.equipment_name}" before collecting it. Your payment has been refunded in full (demo).`,
      contextType: "equipment_booking",
      contextId: bookingId
    });
  }

  return getBookingById(bookingId);
}

/* Owner can't go ahead after approving (item unavailable, broken, etc.):
   the renter is refunded in full (demo). Only before collection. */
async function ownerCancelBooking(bookingId, ownerId, note) {
  const cleanNote = String(note || "").trim().slice(0, 500);
  const booking = await cancelWithChecks(bookingId, {
    allowedStatuses: ["Awaiting Payment", "Confirmed"],
    reason: "owner_cancelled",
    note: cleanNote,
    check: (b) => {
      if (Number(b.owner_id) !== Number(ownerId)) {
        const error = new Error("Only the equipment owner can do this."); error.statusCode = 403; throw error;
      }
      if (b.status === "Confirmed" && b.picked_up_at) {
        const error = new Error("The renter already has the item, so the booking can't be cancelled now."); error.statusCode = 400; throw error;
      }
    }
  });

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Owner Cancelled Your Booking",
    message: `The owner can't go ahead with your booking for "${booking.equipment_name}"${cleanNote ? `: "${cleanNote.slice(0, 160)}"` : "."}${booking.payment_status === "Held" ? " Your payment has been refunded in full (demo)." : " Nothing was charged."}`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });

  return getBookingById(bookingId);
}

/* Renter, at collection: the item is faulty or not as described, so they
   don't take it. Full refund (demo), the owner is told, and admins get a
   report so a pattern can be spotted. */
async function refusePickup(bookingId, renterId, note) {
  const cleanNote = String(note || "").trim().slice(0, 500);
  if (cleanNote.length < 10) {
    const error = new Error("Please say what's wrong with the item (at least 10 characters)."); error.statusCode = 400; throw error;
  }
  const booking = await cancelWithChecks(bookingId, {
    allowedStatuses: ["Confirmed"],
    reason: "defective_at_pickup",
    note: cleanNote,
    check: (b) => {
      if (Number(b.renter_id) !== Number(renterId)) {
        const error = new Error("Only the renter can do this."); error.statusCode = 403; throw error;
      }
      if (b.picked_up_at) {
        const error = new Error("You've already confirmed pickup. Use \"Report a problem\" instead."); error.statusCode = 400; throw error;
      }
    }
  });

  try {
    await reportService.createReport({
      reporterId: renterId, reportedUserId: booking.owner_id,
      contextType: "equipment_booking", contextId: Number(bookingId),
      reason: `Refused at pickup: ${cleanNote}`, category: "not_as_described"
    });
  } catch (error) {
    if (error.statusCode !== 409) throw error;
  }
  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Item Refused at Pickup",
    message: `The renter didn't take "${booking.equipment_name}": "${cleanNote.slice(0, 160)}". The booking is cancelled and they were refunded (demo). Please check the item before renting it out again.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });

  return getBookingById(bookingId);
}

/* Renter, when they collect the item: uploads "before" photos AND says
   what condition it's in. That confirmation becomes the listing's
   "last checked by" (the renter), and the owner is told if it doesn't
   match what the listing said. */
async function confirmPickup(bookingId, renterId, photoUrls, pickupCondition) {
  const booking = await getBookingWithOwner(bookingId);

  if (Number(booking.renter_id) !== Number(renterId)) {
    const error = new Error("Only the renter can confirm pickup."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Confirmed") {
    const error = new Error("Pickup can only be confirmed on a confirmed booking."); error.statusCode = 400; throw error;
  }
  if (booking.picked_up_at) {
    const error = new Error("Pickup has already been confirmed for this booking."); error.statusCode = 400; throw error;
  }

  if (!EQUIPMENT_CONDITIONS.includes(pickupCondition)) {
    const error = new Error("Please confirm what condition the item is in."); error.statusCode = 400; throw error;
  }

  const urls = cleanPhotoUrls(photoUrls);

  const [picked] = await pool.execute(
    `UPDATE equipment_bookings SET pickup_photos = ?, pickup_condition = ?, picked_up_at = NOW()
     WHERE id = ? AND status = 'Confirmed' AND picked_up_at IS NULL`,
    [JSON.stringify(urls), pickupCondition, bookingId]
  );
  if (!picked.affectedRows) {
    const error = new Error("Pickup has already been confirmed for this booking."); error.statusCode = 400; throw error;
  }
  await setEquipmentCondition(booking.equipment_id, pickupCondition, renterId);

  const listedCondition = booking.equipment_condition;
  const mismatch = listedCondition && listedCondition !== pickupCondition
    ? ` Note: the renter says it's "${pickupCondition}", but your listing said "${listedCondition}". The listing now shows "${pickupCondition}".`
    : "";

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: mismatch ? "Picked Up: Condition Differs" : "Equipment Picked Up",
    message: `"${booking.equipment_name}" was collected. The renter confirmed it's in ${pickupCondition} condition and added ${urls.length} photo${urls.length === 1 ? "" : "s"}. It's due back by ${prettyDeadline(booking.return_due_at)}.${mismatch}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

function lateText(minutesLate) {
  if (!minutesLate) return "on time";
  const hours = Math.floor(minutesLate / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}${hours % 24 ? ` ${hours % 24} hour${hours % 24 === 1 ? "" : "s"}` : ""} late`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} late`;
  return `${minutesLate} minute${minutesLate === 1 ? "" : "s"} late`;
}

async function returnEquipment(bookingId, userId, photoUrls) {
  const booking = await getBookingWithOwner(bookingId);
  const isOwner  = Number(booking.owner_id)  === Number(userId);
  const isRenter = Number(booking.renter_id) === Number(userId);

  if (!isOwner && !isRenter) {
    const error = new Error("You are not allowed to return this equipment."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Confirmed") {
    const error = new Error("Only confirmed bookings can be returned."); error.statusCode = 400; throw error;
  }

  /* Legacy booking (made before the payment simulation) — keep the old
     simple return with no photos or money steps. */
  if (!booking.payment_status) {
    await pool.execute(
      `UPDATE equipment_bookings
       SET status = 'Returned', returned_at = NOW(),
           return_minutes_late = GREATEST(0, TIMESTAMPDIFF(MINUTE, return_due_at, NOW()))
       WHERE id = ? AND status = 'Confirmed'`, [bookingId]
    );

    await notificationService.createNotification({
      userId: booking.owner_id,
      title: "Equipment Returned",
      message: `"${booking.equipment_name}" was returned.`,
      contextType: "equipment_booking",
      contextId: bookingId
    });
    await notificationService.createNotification({
      userId: booking.renter_id,
      title: "Rental Closed",
      message: `Your rental of "${booking.equipment_name}" has been completed.`,
      contextType: "equipment_booking",
      contextId: bookingId
    });
    return getBookingById(bookingId);
  }

  if (!booking.picked_up_at) {
    const error = new Error("Pickup must be confirmed (with photos) before the item can be returned."); error.statusCode = 400; throw error;
  }

  const urls = cleanPhotoUrls(photoUrls);
  const depositHeld = booking.deposit_status === "Held";

  /* DEMO: the owner's rental payment is released on return. The deposit
     (if any) stays held until the owner checks the item's condition. The
     actual return time is recorded against the agreed deadline — no late
     fee is charged (config/rentalPolicy.js lateFee isn't in effect). */
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [returned] = await connection.execute(
      `UPDATE equipment_bookings
       SET status = 'Returned', return_photos = ?, returned_at = NOW(),
           return_minutes_late = GREATEST(0, TIMESTAMPDIFF(MINUTE, return_due_at, NOW())),
           payment_status = 'Released', condition_status = 'Pending'
       WHERE id = ? AND status = 'Confirmed'`,
      [JSON.stringify(urls), bookingId]
    );
    if (!returned.affectedRows) {
      const error = new Error("This rental has already been returned."); error.statusCode = 400; throw error;
    }
    await connection.execute(
      `UPDATE booking_extensions SET status = 'Cancelled', responded_at = COALESCE(responded_at, NOW())
       WHERE booking_id = ? AND status IN ('Requested', 'Awaiting Payment')`, [bookingId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const after = await getBookingById(bookingId);
  const timing = lateText(Number(after.return_minutes_late || 0));
  const lateNote = after.return_minutes_late > 0 ? " Late fees are not in effect, so nothing extra is charged." : "";

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Equipment Returned",
    message: `"${booking.equipment_name}" was returned (${timing}) with ${urls.length} condition photo${urls.length === 1 ? "" : "s"}. R${Number(booking.rental_amount).toFixed(2)} has been released to you (demo). Please check the item and confirm its condition${depositHeld ? " so the renter's deposit can be released" : ""}.${lateNote}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Rental Closed",
    message: `Your rental of "${booking.equipment_name}" has been completed (returned ${timing}).${depositHeld ? ` Your R${Number(booking.deposit_amount).toFixed(2)} deposit will be released once the owner confirms the item's condition.` : ""}${lateNote}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return after;
}

function assertOwnerCanCheckCondition(booking, ownerId) {
  if (Number(booking.owner_id) !== Number(ownerId)) {
    const error = new Error("Only the equipment owner can check the item's condition."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Returned" || booking.condition_status !== "Pending") {
    const error = new Error("This rental isn't waiting for a condition check."); error.statusCode = 400; throw error;
  }
}

/* Owner: item came back fine — release the renter's deposit (demo). */
async function confirmCondition(bookingId, ownerId) {
  const booking = await getBookingWithOwner(bookingId);
  assertOwnerCanCheckCondition(booking, ownerId);

  const [checked] = await pool.execute(
    `UPDATE equipment_bookings
     SET condition_status = 'OK',
         deposit_status = IF(deposit_status = 'Held', 'Refunded', deposit_status)
     WHERE id = ? AND condition_status = 'Pending'`,
    [bookingId]
  );
  if (!checked.affectedRows) {
    const error = new Error("This rental isn't waiting for a condition check."); error.statusCode = 400; throw error;
  }

  /* The owner has now checked it: the condition the renter confirmed
     at pickup still stands, with the owner as the latest checker. */
  const keptCondition = booking.pickup_condition || booking.equipment_condition;
  if (keptCondition) await setEquipmentCondition(booking.equipment_id, keptCondition, ownerId);

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Item Condition Confirmed",
    message: `The owner confirmed "${booking.equipment_name}" came back in the same condition it went out in.${booking.deposit_status === "Held" ? ` Your R${Number(booking.deposit_amount).toFixed(2)} deposit has been released (demo).` : ""} This counts towards your renter trust level.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

/* Owner: item came back damaged — deposit stays held as "Disputed" and
   admins are told. The report also blocks the renter from the higher
   trust levels (see trust.service.js). It's also written to the reports
   table (category 'damaged_item', tied to this exact rental) so it shows
   up in the admin Reports table next to every other problem, where an
   admin settles it (resolveRentalDamage). Nothing is ever deducted. */
async function reportDamage(bookingId, ownerId, note) {
  const booking = await getBookingWithOwner(bookingId);
  assertOwnerCanCheckCondition(booking, ownerId);

  const cleanNote = String(note || "").trim();
  if (cleanNote.length < 10) {
    const error = new Error("Please describe the damage (at least 10 characters)."); error.statusCode = 400; throw error;
  }

  const [reported] = await pool.execute(
    `UPDATE equipment_bookings
     SET condition_status = 'Damaged', damage_note = ?,
         deposit_status = IF(deposit_status = 'Held', 'Disputed', deposit_status)
     WHERE id = ? AND condition_status = 'Pending'`,
    [cleanNote.slice(0, 1000), bookingId]
  );
  if (!reported.affectedRows) {
    const error = new Error("This rental isn't waiting for a condition check."); error.statusCode = 400; throw error;
  }

  await setEquipmentCondition(booking.equipment_id, "Damaged", ownerId);

  await reportService.recordReport({
    reporterId: ownerId,
    reportedUserId: booking.renter_id,
    contextType: "equipment_booking",
    contextId: Number(bookingId),
    reason: cleanNote.slice(0, 1000),
    category: "damaged_item"
  });

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Damage Reported",
    message: `The owner reported damage on "${booking.equipment_name}": "${cleanNote.slice(0, 200)}".${booking.deposit_status === "Held" ? " Your deposit is on hold while an admin reviews the before and after photos (demo)." : " An admin will review the before and after photos."} Nothing will be charged or deducted automatically.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  await notificationService.notifyAllAdmins({
    title: "Rental Damage Reported",
    message: `Damage was reported on booking #${bookingId} ("${booking.equipment_name}"): "${cleanNote.slice(0, 200)}". Compare the pickup and return photos, then settle it from the Reports page.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });

  return getBookingById(bookingId);
}

/* "Report a problem" during a rental. `who` is which side may pick it;
   `report` is the matching admin Reports category. */
const RENTAL_PROBLEM_CATEGORIES = {
  owner_unavailable:  { label: "The owner isn't available to take it back", who: ["renter"], report: "no_show" },
  item_faulty:        { label: "The item stopped working or is faulty", who: ["renter"], report: "damaged_item" },
  renter_unreachable: { label: "The renter isn't responding about the return", who: ["owner"], report: "no_show" },
  other:              { label: "Something else", who: ["renter", "owner"], report: "other" }
};

/* Either side, while the booking is confirmed (before or after pickup).
   Records the problem on the booking — "owner isn't available" also
   records WHEN the renter tried to return it, which protects them from a
   late-return claim — and files a report for admins. */
async function reportRentalProblem(bookingId, userId, { category, note }) {
  const booking = await getBookingWithOwner(bookingId);
  const role = Number(booking.renter_id) === Number(userId) ? "renter"
    : Number(booking.owner_id) === Number(userId) ? "owner" : null;
  if (!role) {
    const error = new Error("You are not part of this rental."); error.statusCode = 403; throw error;
  }
  const kind = RENTAL_PROBLEM_CATEGORIES[category];
  if (!kind || !kind.who.includes(role)) {
    const error = new Error("Please choose what went wrong from the list."); error.statusCode = 400; throw error;
  }
  if (booking.status !== "Confirmed") {
    const error = new Error("You can report a problem while the booking is active. For damage found after the return, use the condition check."); error.statusCode = 400; throw error;
  }
  const cleanNote = String(note || "").trim().slice(0, 500);

  await pool.execute(
    `UPDATE equipment_bookings
     SET problem_reported_at = NOW(), problem_reported_by = ?, problem_category = ?, problem_note = ?,
         return_attempted_at = IF(? = 'owner_unavailable', COALESCE(return_attempted_at, NOW()), return_attempted_at)
     WHERE id = ?`,
    [role, category, cleanNote, category, bookingId]
  );

  const otherId = role === "renter" ? booking.owner_id : booking.renter_id;
  try {
    await reportService.createReport({
      reporterId: userId, reportedUserId: otherId,
      contextType: "equipment_booking", contextId: Number(bookingId),
      reason: `${kind.label}: ${cleanNote}`, category: kind.report
    });
  } catch (error) {
    if (error.statusCode !== 409) throw error;
  }

  await notificationService.createNotification({
    userId: otherId,
    title: "Rental Problem Reported",
    message: `The ${role} reported a problem with the rental of "${booking.equipment_name}": ${kind.label.toLowerCase()}. A Taskify admin will look at it. Please message each other to sort it out.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });

  return getBookingById(bookingId);
}

/* Admin settles a damage report from the condition check. No money is
   deducted under either outcome (deposit deductions aren't an approved
   policy), and any held deposit is released:
     renter_not_at_fault — the damage mark comes off the renter's record;
     damage_confirmed    — the damage stays on the renter's record. */
async function resolveRentalDamage(bookingId, adminId, outcome, note = "") {
  if (!["renter_not_at_fault", "damage_confirmed"].includes(outcome)) {
    const error = new Error("Choose renter_not_at_fault or damage_confirmed."); error.statusCode = 400; throw error;
  }
  const booking = await getBookingWithOwner(bookingId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [settled] = await connection.execute(
      `UPDATE equipment_bookings
       SET damage_outcome = ?, damage_resolved_at = NOW(),
           condition_status = IF(? = 'renter_not_at_fault', 'OK', condition_status),
           deposit_status = IF(deposit_status IN ('Held', 'Disputed'), 'Refunded', deposit_status)
       WHERE id = ? AND condition_status = 'Damaged' AND damage_outcome IS NULL`,
      [outcome, outcome, bookingId]
    );
    if (!settled.affectedRows) {
      const error = new Error("This rental has no open damage report (it may already have been settled)."); error.statusCode = 400; throw error;
    }
    await connection.execute(
      `UPDATE reports SET status = 'Resolved'
       WHERE context_type = 'equipment_booking' AND context_id = ? AND status = 'Pending'`, [bookingId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await auditLogService.createAuditLog({
    adminId,
    action: `rental.damage_${outcome}`,
    targetType: "equipment_booking",
    targetId: Number(bookingId),
    reason: String(note || "").trim().slice(0, 500) || null
  });

  const deposit = booking.deposit_status === "Held" || booking.deposit_status === "Disputed"
    ? ` The R${Number(booking.deposit_amount).toFixed(2)} deposit has been released to the renter (demo) — deductions aren't an approved policy.` : "";
  const texts = outcome === "renter_not_at_fault"
    ? [`An admin reviewed the damage report on "${booking.equipment_name}" and found you weren't at fault. It's been removed from your renter record.${deposit}`,
       `An admin reviewed your damage report on "${booking.equipment_name}" and found the renter wasn't at fault.${deposit}`]
    : [`An admin reviewed the damage report on "${booking.equipment_name}" and confirmed the damage. It stays on your renter record. Nothing has been charged.${deposit}`,
       `An admin reviewed your damage report on "${booking.equipment_name}" and confirmed the damage. It's recorded on the renter's record. Taskify can't charge for damage yet — please talk to the renter directly.${deposit}`];
  await notificationService.createNotification({
    userId: booking.renter_id, title: "Damage Report Settled", message: texts[0],
    contextType: "equipment_booking", contextId: bookingId, email: true
  });
  await notificationService.createNotification({
    userId: booking.owner_id, title: "Damage Report Settled", message: texts[1],
    contextType: "equipment_booking", contextId: bookingId, email: true
  });

  return getBookingById(bookingId);
}

async function getMyEquipment(ownerId) {
  const [rows] = await pool.execute(
    `SELECT ${EQUIPMENT_SELECT_FIELDS}
     FROM equipment e
     LEFT JOIN users u ON e.owner_id = u.id
     WHERE e.owner_id = ?
     ORDER BY e.created_at DESC`,
    [ownerId]
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "equipment");
}

async function getEquipmentHistory(userId) {
  await expireStaleBookingRequests();
  const [rows] = await pool.execute(
    `SELECT
       eb.id, eb.equipment_id, eb.renter_id, eb.status, eb.created_at,
       ${BOOKING_PAYMENT_FIELDS},
       ${BOOKING_LIFECYCLE_FIELDS},
       e.name AS equipment_name, e.category, e.section,
       e.daily_price, e.item_value, e.owner_id, e.image_urls,
       e.condition_status AS equipment_condition,
       owner.full_name AS owner_name,
       owner.profile_photo_url AS owner_profile_photo,
       IF(eb.payment_status IN ('Held','Released'), owner.phone_number, NULL) AS owner_phone_number,
       renter.full_name AS renter_name,
       renter.profile_photo_url AS renter_profile_photo,
       IF(eb.payment_status IN ('Held','Released'), renter.phone_number, NULL) AS renter_phone_number,
       my_review.id AS my_review_id,
       my_review.rating AS my_review_rating,
       my_review.comment AS my_review_comment
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     INNER JOIN users owner ON e.owner_id = owner.id
     INNER JOIN users renter ON eb.renter_id = renter.id
     LEFT JOIN reviews my_review ON my_review.booking_id = eb.id AND my_review.reviewer_id = ?
     WHERE e.owner_id = ? OR eb.renter_id = ?
     ORDER BY eb.created_at DESC`,
    [userId, userId, userId]
  );
  const extensions = await rentalExtensionService.getLatestExtensions(rows.map((r) => r.id));
  return rows.map((row) => describeBooking(parseImageUrls(row), extensions.get(row.id) || null));
}

async function getEquipmentById(equipmentId) {
  const [rows] = await pool.execute(
    `SELECT ${EQUIPMENT_SELECT_FIELDS}
     FROM equipment e
     LEFT JOIN users u ON e.owner_id = u.id
     WHERE e.id = ? LIMIT 1`,
    [equipmentId]
  );
  const parsed = parseImageUrls(rows[0]);
  return attachLatestEndorsement(parsed, "equipment");
}

async function getEquipmentByIdForViewing(equipmentId, userId, viewerRole = null) {
  await expireStaleBookingRequests(equipmentId);
  const item = await getEquipmentById(equipmentId);
  if (!item) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  /* A listing that isn't 'clean' (pending_review or removed) is invisible
     to everyone except its own owner and admins — a 404, same as a
     genuinely missing item, so a direct link never reveals that something
     was flagged. See equipment.controller.js's getEquipmentById. */
  const isOwnerForModeration = userId != null && Number(item.owner_id) === Number(userId);
  const isAdmin = viewerRole === "admin";
  if (item.moderation_status !== "clean" && !isOwnerForModeration && !isAdmin) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const [bookingRows] = await pool.execute(
    `SELECT eb.id, eb.renter_id, eb.status, eb.payment_status, eb.picked_up_at,
            DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_date,
            eb.payment_due_at, eb.return_due_at,
            renter.full_name AS renter_name,
            renter.profile_photo_url AS renter_profile_photo,
            IF(eb.payment_status IN ('Held','Released'), renter.phone_number, NULL) AS renter_phone_number
     FROM equipment_bookings eb
     INNER JOIN users renter ON eb.renter_id = renter.id
     WHERE eb.equipment_id = ? AND eb.status IN ('Pending', 'Awaiting Payment', 'Confirmed')
     ORDER BY eb.start_date, eb.created_at`,
    [equipmentId]
  );

  const isOwner = Number(item.owner_id) === Number(userId);
  item.active_bookings = isOwner
    ? bookingRows
    : bookingRows.filter(b => Number(b.renter_id) === Number(userId));

  /* Dates already taken (no names) and the terms a renter agrees to. */
  item.booked_ranges = await getBookedRanges(equipmentId);
  item.terms = rentalPolicy.currentTerms({ dailyPrice: item.daily_price, itemValue: item.item_value });

  /* The owner's phone number is never in public listing data — a renter
     only sees it once their (demo) rental payment is held. */
  const renterHasHeldPayment = !isOwner && item.active_bookings
    .some(b => ["Held", "Released"].includes(b.payment_status));
  if (renterHasHeldPayment) {
    const [ownerRows] = await pool.execute(`SELECT phone_number FROM users WHERE id = ? LIMIT 1`, [item.owner_id]);
    item.owner_phone_number = ownerRows[0]?.phone_number || null;
  }

  /* Whether this viewer may open a chat about it — the same rule
     conversation.service's startConversation enforces. */
  item.can_message = (await messagingAccess("equipment", item.id, userId ?? null)).allowed;

  return item;
}

async function getBookingWithOwner(bookingId) {
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status,
            ${BOOKING_PAYMENT_FIELDS},
            ${BOOKING_LIFECYCLE_FIELDS},
            e.owner_id, e.name AS equipment_name, e.condition_status AS equipment_condition,
            e.daily_price, e.item_value
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );

  if (rows.length === 0) {
    const error = new Error("Booking not found."); error.statusCode = 404; throw error;
  }

  return parseBookingPhotos(rows[0]);
}

async function getBookingById(bookingId) {
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status,
            ${BOOKING_PAYMENT_FIELDS},
            ${BOOKING_LIFECYCLE_FIELDS},
            e.name AS equipment_name, e.owner_id, e.daily_price, e.item_value
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) return null;
  const extensions = await rentalExtensionService.getLatestExtensions([rows[0].id]);
  return describeBooking(rows[0], extensions.get(rows[0].id) || null);
}

async function deleteEquipment(equipmentId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, owner_id FROM equipment WHERE id = ? LIMIT 1`, [equipmentId]
  );

  if (rows.length === 0) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const item = rows[0];

  if (Number(item.owner_id) !== Number(userId)) {
    const error = new Error("Only the owner can delete this listing."); error.statusCode = 403; throw error;
  }

  /* Bookings no longer switch the listing off, so check them directly. */
  const [open] = await pool.execute(
    `SELECT COUNT(*) AS n FROM equipment_bookings
     WHERE equipment_id = ? AND (status IN ('Pending', 'Awaiting Payment', 'Confirmed')
       OR (status = 'Returned' AND condition_status = 'Pending'))`,
    [equipmentId]
  );
  if (Number(open[0].n) > 0) {
    const error = new Error("This item has open requests or bookings. Decline the requests and finish current rentals before deleting it.");
    error.statusCode = 400; throw error;
  }

  await pool.execute(`DELETE FROM equipment WHERE id = ?`, [equipmentId]);
}

module.exports = {
  EQUIPMENT_CONDITIONS,
  RENTAL_PROBLEM_CATEGORIES,
  expireStaleBookingRequests,
  todayInTaskifyTimezone,
  assertBookingDates,
  createEquipment,
  updateEquipment,
  getAllAvailableEquipment,
  getRentalQuote,
  bookEquipment,
  confirmBooking,
  payBooking,
  declineBooking,
  cancelBookingByRenter,
  ownerCancelBooking,
  refusePickup,
  confirmPickup,
  returnEquipment,
  confirmCondition,
  reportDamage,
  reportRentalProblem,
  resolveRentalDamage,
  getEquipmentHistory,
  getMyEquipment,
  getEquipmentByIdForViewing,
  getBookingById,
  getBookedRanges,
  deleteEquipment
};
