const pool = require("../config/db");
const notificationService = require("./notification.service");

function parseImageUrls(row) {
  if (!row) return row;
  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

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
       u.full_name AS owner_name
     FROM equipment e
     INNER JOIN users u ON e.owner_id = u.id
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
     VALUES (?, ?, ?, ?, 'Booked')`,
    [equipmentId, renterId, startDate, endDate]
  );

  await pool.execute(`UPDATE equipment SET is_available = 0 WHERE id = ?`, [equipmentId]);

  const [renterRows] = await pool.execute(
    `SELECT full_name FROM users WHERE id = ? LIMIT 1`, [renterId]
  );
  const renterName = renterRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: equipment.owner_id,
    title: "Equipment Booked",
    message: `${renterName} booked "${equipment.name}".`
  });

  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
            eb.end_date, eb.status, e.name AS equipment_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

async function returnEquipment(bookingId, userId) {
  const [bookingRows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status,
            e.owner_id, e.name AS equipment_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.id = ? LIMIT 1`,
    [bookingId]
  );

  if (bookingRows.length === 0) {
    const error = new Error("Booking not found."); error.statusCode = 404; throw error;
  }

  const booking = bookingRows[0];
  const isOwner  = Number(booking.owner_id)  === Number(userId);
  const isRenter = Number(booking.renter_id) === Number(userId);

  if (!isOwner && !isRenter) {
    const error = new Error("You are not allowed to return this equipment."); error.statusCode = 403; throw error;
  }
  if (booking.status !== "Booked") {
    const error = new Error("Only booked equipment can be returned."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE equipment_bookings SET status = 'Returned' WHERE id = ?`, [bookingId]);
  await pool.execute(`UPDATE equipment SET is_available = 1 WHERE id = ?`, [booking.equipment_id]);

  await notificationService.createNotification({
    userId: booking.owner_id,
    title: "Equipment Returned",
    message: `"${booking.equipment_name}" was returned.`
  });
  await notificationService.createNotification({
    userId: booking.renter_id,
    title: "Rental Closed",
    message: `Your rental of "${booking.equipment_name}" has been completed.`
  });

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

async function getEquipmentHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT
       eb.id, eb.equipment_id, eb.renter_id, eb.start_date,
       eb.end_date, eb.status, eb.created_at,
       e.name AS equipment_name, e.category, e.section,
       e.daily_price, e.owner_id, e.image_urls,
       owner.full_name AS owner_name,
       renter.full_name AS renter_name
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
       u.full_name AS owner_name
     FROM equipment e
     INNER JOIN users u ON e.owner_id = u.id
     WHERE e.id = ? LIMIT 1`,
    [equipmentId]
  );
  return parseImageUrls(rows[0]);
}

module.exports = {
  createEquipment,
  getAllAvailableEquipment,
  bookEquipment,
  returnEquipment,
  getEquipmentHistory
};