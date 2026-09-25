const pool = require("../config/db");
const notificationService = require("./notification.service");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const contentModerationService = require("./contentModeration.service");
const trustService = require("./trust.service");

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
  eb.damage_note
`;

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
  u.full_name AS owner_name,
  u.profile_photo_url AS owner_profile_photo,
  u.member_type AS owner_member_type,
  u.lecturer_title AS owner_lecturer_title
`;

async function createEquipment({
  ownerId, name, description, category, section, dailyPrice, itemValue, imageUrls = []
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
       section, daily_price, item_value, is_available, image_urls,
       moderation_status, moderation_flags
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      ownerId, name.trim(), description.trim(), category.trim(),
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
   booking path shares. */
async function loadBookableEquipment(equipmentId, renterId) {
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

/* GET /equipment/:id/rental-quote — the money breakdown shown in the
   booking modal before the renter presses "Simulate Payment". */
async function getRentalQuote({ equipmentId, renterId, startDate, endDate }) {
  const equipment = await loadBookableEquipment(equipmentId, renterId);
  return trustService.buildRentalQuote({ renterId, equipment, startDate, endDate });
}

async function bookEquipment({ equipmentId, renterId, startDate, endDate }) {
  const equipment = await loadBookableEquipment(equipmentId, renterId);

  if (new Date(endDate) < new Date(startDate)) {
    const error = new Error("End date cannot be before start date."); error.statusCode = 400; throw error;
  }

  /* The quote is always recalculated here on the server — the numbers the
     browser showed are never trusted as-is. */
  const quote = await trustService.buildRentalQuote({ renterId, equipment, startDate, endDate });
  if (!quote.allowed) {
    const error = new Error(quote.reason || "You can't rent this item yet."); error.statusCode = 403; throw error;
  }

  /* DEMO: "payment held" is only a status. The rental amount + protection
     fee + deposit are recorded as held; nothing is actually charged. */
  const [result] = await pool.execute(
    `INSERT INTO equipment_bookings (
       equipment_id, renter_id, start_date, end_date, status,
       rental_days, rental_amount, protection_fee, deposit_amount, trust_level,
       payment_status, deposit_status
     ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 'Held', ?)`,
    [
      equipmentId, renterId, startDate, endDate,
      quote.days, quote.rentalAmount, quote.protectionFee, quote.depositAmount, quote.trust.level,
      quote.depositAmount > 0 ? "Held" : "None"
    ]
  );

  await pool.execute(`UPDATE equipment SET is_available = 0 WHERE id = ?`, [equipmentId]);

  const [renterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [renterId]);
  const renterName = renterRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: equipment.owner_id,
    title: "Booking Request",
    message: `${renterName} requested to book "${equipment.name}" for ${quote.days} day${quote.days === 1 ? "" : "s"}. Their payment of R${quote.rentalAmount.toFixed(2)} is held by Taskify (demo). Please confirm or decline.`,
    contextType: "equipment_booking",
    contextId: result.insertId
  });

  return getBookingById(result.insertId);
}

async function confirmBooking(bookingId, ownerId) {
  const booking = await getBookingWithOwner(bookingId);

  if (Number(booking.owner_id) !== Number(ownerId)) {
    const error = new Error("Only the equipment owner can confirm this booking."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Pending") {
    const error = new Error("Only pending bookings can be confirmed."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE equipment_bookings SET status = 'Confirmed' WHERE id = ?`, [bookingId]);

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Booking Confirmed",
    message: `Your booking for "${booking.equipment_name}" has been confirmed.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

/* Cancelling a booking hands back anything that was held (demo refund). */
async function cancelAndRefund(bookingId, equipmentId) {
  await pool.execute(
    `UPDATE equipment_bookings
     SET status = 'Cancelled',
         payment_status = IF(payment_status = 'Held', 'Refunded', payment_status),
         deposit_status = IF(deposit_status = 'Held', 'Refunded', deposit_status)
     WHERE id = ?`,
    [bookingId]
  );
  await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [equipmentId]);
}

async function declineBooking(bookingId, ownerId) {
  const booking = await getBookingWithOwner(bookingId);

  if (Number(booking.owner_id) !== Number(ownerId)) {
    const error = new Error("Only the equipment owner can decline this booking."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Pending") {
    const error = new Error("Only pending bookings can be declined."); error.statusCode = 400; throw error;
  }

  await cancelAndRefund(bookingId, booking.equipment_id);

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Booking Declined",
    message: `Your booking request for "${booking.equipment_name}" was declined.${booking.payment_status ? " Your held payment has been refunded (demo)." : ""}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

async function cancelBookingByRenter(bookingId, renterId) {
  const booking = await getBookingWithOwner(bookingId);

  if (Number(booking.renter_id) !== Number(renterId)) {
    const error = new Error("Only the renter can cancel this booking request."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Pending") {
    const error = new Error("Only pending booking requests can be cancelled."); error.statusCode = 400; throw error;
  }

  await cancelAndRefund(bookingId, booking.equipment_id);

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Booking Request Cancelled",
    message: `The request to book "${booking.equipment_name}" was cancelled by the renter.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

/* Renter, when they collect the item: uploads "before" photos. This is
   the evidence of the item's condition at handover. */
async function confirmPickup(bookingId, renterId, photoUrls) {
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

  const urls = cleanPhotoUrls(photoUrls);

  await pool.execute(
    `UPDATE equipment_bookings SET pickup_photos = ?, picked_up_at = NOW() WHERE id = ?`,
    [JSON.stringify(urls), bookingId]
  );

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Equipment Picked Up",
    message: `"${booking.equipment_name}" was collected. The renter added ${urls.length} condition photo${urls.length === 1 ? "" : "s"} — you can view them in your rental history.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
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
    await pool.execute(`UPDATE equipment_bookings SET status = 'Returned' WHERE id = ?`, [bookingId]);
    await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [booking.equipment_id]);

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
     (if any) stays held until the owner checks the item's condition. */
  await pool.execute(
    `UPDATE equipment_bookings
     SET status = 'Returned', return_photos = ?, returned_at = NOW(),
         payment_status = 'Released', condition_status = 'Pending'
     WHERE id = ?`,
    [JSON.stringify(urls), bookingId]
  );
  await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [booking.equipment_id]);

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Equipment Returned",
    message: `"${booking.equipment_name}" was returned with ${urls.length} condition photo${urls.length === 1 ? "" : "s"}. R${Number(booking.rental_amount).toFixed(2)} has been released to you (demo). Please check the item and confirm its condition${depositHeld ? " so the renter's deposit can be released" : ""}.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Rental Closed",
    message: `Your rental of "${booking.equipment_name}" has been completed.${depositHeld ? ` Your R${Number(booking.deposit_amount).toFixed(2)} deposit will be released once the owner confirms the item's condition.` : ""}`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
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

  await pool.execute(
    `UPDATE equipment_bookings
     SET condition_status = 'OK',
         deposit_status = IF(deposit_status = 'Held', 'Refunded', deposit_status)
     WHERE id = ?`,
    [bookingId]
  );

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Item Condition Confirmed",
    message: `The owner confirmed "${booking.equipment_name}" came back in good condition.${booking.deposit_status === "Held" ? ` Your R${Number(booking.deposit_amount).toFixed(2)} deposit has been released (demo).` : ""} This counts towards your renter trust level.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

/* Owner: item came back damaged — deposit stays held as "Disputed" and
   admins are told. The report also blocks the renter from the higher
   trust levels (see trust.service.js). Resolving the dispute is an admin
   job outside this simulation. */
async function reportDamage(bookingId, ownerId, note) {
  const booking = await getBookingWithOwner(bookingId);
  assertOwnerCanCheckCondition(booking, ownerId);

  const cleanNote = String(note || "").trim();
  if (cleanNote.length < 10) {
    const error = new Error("Please describe the damage (at least 10 characters)."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE equipment_bookings
     SET condition_status = 'Damaged', damage_note = ?,
         deposit_status = IF(deposit_status = 'Held', 'Disputed', deposit_status)
     WHERE id = ?`,
    [cleanNote.slice(0, 1000), bookingId]
  );

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Damage Reported",
    message: `The owner reported damage on "${booking.equipment_name}": "${cleanNote.slice(0, 200)}".${booking.deposit_status === "Held" ? " Your deposit is on hold while an admin reviews the before and after photos (demo)." : " An admin will review the before and after photos."}`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
  });
  await notificationService.notifyAllAdmins({
    title: "Rental Damage Reported",
    message: `Damage was reported on booking #${bookingId} ("${booking.equipment_name}"): "${cleanNote.slice(0, 200)}". Compare the pickup and return photos to resolve it.`,
    contextType: "equipment_booking",
    contextId: bookingId,
    email: true
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
  const [rows] = await pool.execute(
    `SELECT
       eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
       eb.end_date, eb.status, eb.created_at,
       ${BOOKING_PAYMENT_FIELDS},
       e.name AS equipment_name, e.category, e.section,
       e.daily_price, e.item_value, e.owner_id, e.image_urls,
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
  return rows.map(row => parseBookingPhotos(parseImageUrls(row)));
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
    `SELECT eb.id, eb.renter_id, eb.start_date, eb.end_date, eb.status, eb.payment_status,
            renter.full_name AS renter_name,
            renter.profile_photo_url AS renter_profile_photo,
            IF(eb.payment_status IN ('Held','Released'), renter.phone_number, NULL) AS renter_phone_number
     FROM equipment_bookings eb
     INNER JOIN users renter ON eb.renter_id = renter.id
     WHERE eb.equipment_id = ? AND eb.status IN ('Pending', 'Confirmed')
     ORDER BY eb.created_at DESC`,
    [equipmentId]
  );

  const isOwner = Number(item.owner_id) === Number(userId);
  item.active_bookings = isOwner
    ? bookingRows
    : bookingRows.filter(b => Number(b.renter_id) === Number(userId));

  /* The owner's phone number is never in public listing data — a renter
     only sees it once their (demo) rental payment is held. */
  const renterHasHeldPayment = !isOwner && item.active_bookings
    .some(b => ["Held", "Released"].includes(b.payment_status));
  if (renterHasHeldPayment) {
    const [ownerRows] = await pool.execute(`SELECT phone_number FROM users WHERE id = ? LIMIT 1`, [item.owner_id]);
    item.owner_phone_number = ownerRows[0]?.phone_number || null;
  }

  return item;
}

async function getBookingWithOwner(bookingId) {
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status,
            ${BOOKING_PAYMENT_FIELDS},
            e.owner_id, e.name AS equipment_name
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
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
            eb.end_date, eb.status, ${BOOKING_PAYMENT_FIELDS},
            e.name AS equipment_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );
  return parseBookingPhotos(rows[0]);
}

async function deleteEquipment(equipmentId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, owner_id, is_available FROM equipment WHERE id = ? LIMIT 1`, [equipmentId]
  );

  if (rows.length === 0) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const item = rows[0];

  if (Number(item.owner_id) !== Number(userId)) {
    const error = new Error("Only the owner can delete this listing."); error.statusCode = 403; throw error;
  }

  if (!item.is_available) {
    const error = new Error("Cannot delete equipment that is currently booked."); error.statusCode = 400; throw error;
  }

  await pool.execute(`DELETE FROM equipment WHERE id = ?`, [equipmentId]);
}

module.exports = {
  createEquipment,
  getAllAvailableEquipment,
  getRentalQuote,
  bookEquipment,
  confirmBooking,
  declineBooking,
  cancelBookingByRenter,
  confirmPickup,
  returnEquipment,
  confirmCondition,
  reportDamage,
  getEquipmentHistory,
  getMyEquipment,
  getEquipmentByIdForViewing,
  deleteEquipment
};