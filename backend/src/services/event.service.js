const pool = require("../config/db");
const notificationService = require("./notification.service");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");

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

const SELECT_FIELDS = `
  e.id, e.organizer_id, e.title, e.description, e.category,
  e.section, e.location, e.event_date, e.capacity, e.status,
  e.created_at, e.image_urls,
  u.full_name AS organizer_name,
  u.profile_photo_url AS organizer_profile_photo,
  u.member_type AS organizer_member_type,
  u.lecturer_title AS organizer_lecturer_title,
  (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id) AS rsvp_count
`;

async function createEvent({
  organizerId, title, description, category, section,
  location, eventDate, capacity, imageUrls = []
}) {
  const [result] = await pool.execute(
    `INSERT INTO events (
       organizer_id, title, description, category, section,
       location, event_date, capacity, image_urls
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizerId, title.trim(), description.trim(), category.trim(),
      section || "General", location.trim(), eventDate,
      capacity ? Number(capacity) : null,
      imageUrls.length ? JSON.stringify(imageUrls) : null
    ]
  );
  return getEventById(result.insertId);
}

async function getAllUpcomingEvents() {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM events e
     INNER JOIN users u ON e.organizer_id = u.id
     WHERE e.status = 'Upcoming' AND e.event_date >= NOW()
     ORDER BY e.event_date ASC`
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "event");
}

async function getMyRsvpEventIds(userId) {
  const [rows] = await pool.execute(
    `SELECT event_id FROM event_rsvps WHERE user_id = ?`,
    [userId]
  );
  return rows.map(r => r.event_id);
}

async function getMyEvents(userId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM events e
     INNER JOIN users u ON e.organizer_id = u.id
     LEFT JOIN event_rsvps er ON er.event_id = e.id AND er.user_id = ?
     WHERE e.organizer_id = ? OR er.user_id = ?
     ORDER BY e.event_date DESC`,
    [userId, userId, userId]
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "event");
}

async function rsvpToEvent(eventId, userId) {
  const [eventRows] = await pool.execute(
    `SELECT id, organizer_id, title, capacity, status
     FROM events WHERE id = ? LIMIT 1`,
    [eventId]
  );
  if (eventRows.length === 0) {
    const error = new Error("Event not found."); error.statusCode = 404; throw error;
  }
  const event = eventRows[0];

  if (event.status !== "Upcoming") {
    const error = new Error("This event is no longer accepting RSVPs."); error.statusCode = 400; throw error;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM event_rsvps WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, userId]
  );
  if (existing.length > 0) {
    const error = new Error("You have already RSVP'd to this event."); error.statusCode = 400; throw error;
  }

  if (event.capacity) {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS count FROM event_rsvps WHERE event_id = ?`,
      [eventId]
    );
    if (countRows[0].count >= event.capacity) {
      const error = new Error("This event is fully booked."); error.statusCode = 400; throw error;
    }
  }

  await pool.execute(
    `INSERT INTO event_rsvps (event_id, user_id) VALUES (?, ?)`,
    [eventId, userId]
  );

  const [userRows] = await pool.execute(
    `SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]
  );
  await notificationService.createNotification({
    userId: event.organizer_id,
    title: "New RSVP",
    message: `${userRows[0]?.full_name || "A student"} RSVP'd to "${event.title}".`
  });

  return getEventById(eventId);
}

async function cancelRsvp(eventId, userId) {
  const [rows] = await pool.execute(
    `SELECT id FROM event_rsvps WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, userId]
  );
  if (rows.length === 0) {
    const error = new Error("You have not RSVP'd to this event."); error.statusCode = 400; throw error;
  }
  await pool.execute(
    `DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?`,
    [eventId, userId]
  );
  return getEventById(eventId);
}

async function deleteEvent(eventId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, organizer_id FROM events WHERE id = ? LIMIT 1`, [eventId]
  );
  if (rows.length === 0) {
    const error = new Error("Event not found."); error.statusCode = 404; throw error;
  }
  if (Number(rows[0].organizer_id) !== Number(userId)) {
    const error = new Error("Only the organizer can delete this event."); error.statusCode = 403; throw error;
  }
  await pool.execute(`DELETE FROM events WHERE id = ?`, [eventId]);
}

async function getEventById(eventId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM events e
     INNER JOIN users u ON e.organizer_id = u.id
     WHERE e.id = ? LIMIT 1`,
    [eventId]
  );
  const parsed = parseImageUrls(rows[0]);
  return attachLatestEndorsement(parsed, "event");
}

async function getEventByIdForViewing(eventId) {
  const event = await getEventById(eventId);
  if (!event) {
    const error = new Error("Event not found."); error.statusCode = 404; throw error;
  }
  return event;
}

module.exports = {
  createEvent,
  getAllUpcomingEvents,
  getMyRsvpEventIds,
  getMyEvents,
  rsvpToEvent,
  cancelRsvp,
  deleteEvent,
  getEventByIdForViewing
};