const pool = require("../config/db");
const notificationService = require("./notification.service");

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

const ENDORSEMENT_JOIN = `
  LEFT JOIN lecturer_endorsements le
    ON le.context_type = 'equipment' AND le.context_id = e.id
    AND le.id = (
      SELECT id FROM lecturer_endorsements le2
      WHERE le2.context_type = 'equipment' AND le2.context_id = e.id
      ORDER BY le2.created_at DESC LIMIT 1
    )
  LEFT JOIN users lecturer ON le.lecturer_id = lecturer.id
`;

async function createEquipment({
  ownerId, name, description, category, section, dailyPrice, imageUrls = []
}) {
  const [result] = await pool.execute(
    `INSERT INTO equipment (
       owner_id, name, description, category,
       section, daily_price, is_available, image_urls
     ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      ownerId, name.trim(), description.trim(), category.trim(),
      section || "General", Number(dailyPrice),
      imageUrls.length ? JSON.stringify(imageUrls) : null
    ]
  );
  return getEquipmentById(result.insertId);
}

async function getAllAvailableEquipment() {
  const [rows] = await pool.execute(
    `SELECT
       e.id, e.owner_id, e.name, e.description, e.category,
       e.section, e.daily_price, e.is_available, e.created_at,
       e.image_urls,
       u.full_name AS owner_name,
       u.profile_photo_url AS owner_profile_photo,
       le.endorsement_type AS endorsement_type,
       lecturer.full_name AS endorsed_by_lecturer_name,
       lecturer.lecturer_title AS endorsed_by_lecturer_title
     FROM equipment e
     INNER JOIN users u ON e.owner_id = u.id
     ${ENDORSEMENT_JOIN}
     WHERE e.is_available = 1
     ORDER BY e.created_at DESC`
  );
  return rows.map(parseImageUrls);
}

async function bookEquipment({ equipmentId, renterId, startDate, endDate }) {
  const [equipmentRows] = await pool.execute(
    `SELECT id, owner_id, name, is_available FROM equipment WHERE id = ? LIMIT 1`,
    [equipmentId]
  );

  if (equipmentRows.length === 0) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const equipment = equipmentRows[0];

  if (Number(equipment.owner_id) === Number(renterId)) {
    const error = new Error("You cannot book your own equipment."); error.statusCode = 400; throw error;
  }
  if (!equipment.is_available) {
    const error = new Error("This equipment is not currently available."); error.statusCode = 400; throw error;
  }
  if (new Date(endDate) < new Date(startDate)) {
    const error = new Error("End date cannot be before start date."); error.statusCode = 400; throw error;
  }

  const [result] = await pool.execute(
    `INSERT INTO equipment_bookings (equipment_id, renter_id, start_date, end_date, status)
     VALUES (?, ?, ?, ?, 'Pending')`,
    [equipmentId, renterId, startDate, endDate]
  );

  await pool.execute(`UPDATE equipment SET is_available = 0 WHERE id = ?`, [equipmentId]);

  const [renterRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [renterId]);
  const renterName = renterRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: equipment.owner_id,
    title: "Booking Request",
    message: `${renterName} requested to book "${equipment.name}". Please confirm or decline.`,
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

async function declineBooking(bookingId, ownerId) {
  const booking = await getBookingWithOwner(bookingId);

  if (Number(booking.owner_id) !== Number(ownerId)) {
    const error = new Error("Only the equipment owner can decline this booking."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Pending") {
    const error = new Error("Only pending bookings can be declined."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE equipment_bookings SET status = 'Cancelled' WHERE id = ?`, [bookingId]);
  await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [booking.equipment_id]);

  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Booking Declined",
    message: `Your booking request for "${booking.equipment_name}" was declined.`,
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

  await pool.execute(`UPDATE equipment_bookings SET status = 'Cancelled' WHERE id = ?`, [bookingId]);
  await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [booking.equipment_id]);

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Booking Request Cancelled",
    message: `The request to book "${booking.equipment_name}" was cancelled by the renter.`,
    contextType: "equipment_booking",
    contextId: bookingId
  });

  return getBookingById(bookingId);
}

async function returnEquipment(bookingId, userId) {
  const booking = await getBookingWithOwner(bookingId);
  const isOwner  = Number(booking.owner_id)  === Number(userId);
  const isRenter = Number(booking.renter_id) === Number(userId);

  if (!isOwner && !isRenter) {
    const error = new Error("You are not allowed to return this equipment."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Confirmed") {
    const error = new Error("Only confirmed bookings can be returned."); error.statusCode = 400; throw error;
  }

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

async function getEquipmentHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT
       eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
       eb.end_date, eb.status, eb.created_at,
       e.name AS equipment_name, e.category, e.section,
       e.daily_price, e.owner_id, e.image_urls,
       owner.full_name AS owner_name,
       owner.profile_photo_url AS owner_profile_photo,
       owner.phone_number AS owner_phone_number,
       renter.full_name AS renter_name,
       renter.profile_photo_url AS renter_profile_photo,
       renter.phone_number AS renter_phone_number
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     INNER JOIN users owner ON e.owner_id = owner.id
     INNER JOIN users renter ON eb.renter_id = renter.id
     WHERE e.owner_id = ? OR eb.renter_id = ?
     ORDER BY eb.created_at DESC`,
    [userId, userId]
  );
  return rows.map(parseImageUrls);
}

async function getEquipmentById(equipmentId) {
  const [rows] = await pool.execute(
    `SELECT
       e.id, e.owner_id, e.name, e.description, e.category,
       e.section, e.daily_price, e.is_available, e.created_at,
       e.image_urls,
       u.full_name AS owner_name,
       u.profile_photo_url AS owner_profile_photo,
       u.phone_number AS owner_phone_number,
       le.endorsement_type AS endorsement_type,
       lecturer.full_name AS endorsed_by_lecturer_name,
       lecturer.lecturer_title AS endorsed_by_lecturer_title
     FROM equipment e
     INNER JOIN users u ON e.owner_id = u.id
     ${ENDORSEMENT_JOIN}
     WHERE e.id = ? LIMIT 1`,
    [equipmentId]
  );
  return parseImageUrls(rows[0]);
}

async function getEquipmentByIdForViewing(equipmentId, userId) {
  const item = await getEquipmentById(equipmentId);
  if (!item) {
    const error = new Error("Equipment not found."); error.statusCode = 404; throw error;
  }

  const [bookingRows] = await pool.execute(
    `SELECT eb.id, eb.renter_id, eb.start_date, eb.end_date, eb.status,
            renter.full_name AS renter_name,
            renter.profile_photo_url AS renter_profile_photo,
            renter.phone_number AS renter_phone_number
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

  return item;
}

async function getBookingWithOwner(bookingId) {
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status,
            e.owner_id, e.name AS equipment_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );

  if (rows.length === 0) {
    const error = new Error("Booking not found."); error.statusCode = 404; throw error;
  }

  return rows[0];
}

async function getBookingById(bookingId) {
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
            eb.end_date, eb.status, e.name AS equipment_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );
  return rows[0];
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
  bookEquipment,
  confirmBooking,
  declineBooking,
  cancelBookingByRenter,
  returnEquipment,
  getEquipmentHistory,
  getEquipmentByIdForViewing,
  deleteEquipment
};