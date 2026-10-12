const pool = require("../config/db");
const notificationService = require("./notification.service");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const contentModerationService = require("./contentModeration.service");
const { moderateListingEdit, notifyEditFlagged } = require("./listingEdit.service");
const { categoriesFor, legacyCategoriesFor, INSTITUTIONAL_EVENT_CATEGORIES } = require("../config/categories");
const MARKETPLACE = require("../config/marketplace");

/*
  Campus Marketplace (this table used to hold general "Events"). New
  listings must use a marketplace category; old events keep their old
  category until they end. Institutional categories (farm produce,
  surplus, lost property, departmental) need a note of who authorised
  them and are held for an admin check (moderation flag
  "institutional_listing") — on every create AND edit, so an approved
  listing can't be quietly changed into something else. When an admin
  posts it (the only people who can, while config/marketplace.js
  adminsOnlyPosting is on), they ARE that check: the authorisation note
  is still required and saved, but the listing isn't held.
*/
const INSTITUTIONAL_FLAG = "institutional_listing";

function checkMarketplaceCategory({ category, listingAuthority, currentCategory = null }) {
  const cat = String(category || "").trim();
  const isMarketplace = categoriesFor("event").includes(cat);
  const keepsOldCategory = currentCategory != null && cat === currentCategory && legacyCategoriesFor("event").includes(cat);
  if (!isMarketplace && !keepsOldCategory) {
    const error = new Error("Campus Marketplace is for buying, selling and swapping on campus. Please choose one of the marketplace categories — lectures, parties, sports and club meetings don't belong here.");
    error.statusCode = 400;
    throw error;
  }
  const institutional = INSTITUTIONAL_EVENT_CATEGORIES.includes(cat);
  if (institutional && !MARKETPLACE.institutionalListingsEnabled) {
    const error = new Error("Institutional listings aren't being accepted right now.");
    error.statusCode = 403;
    throw error;
  }
  const authority = String(listingAuthority || "").trim().slice(0, 300);
  if (institutional && authority.length < 5) {
    const error = new Error("Please say who authorised this — for example the department or office, and the person's role.");
    error.statusCode = 400;
    throw error;
  }
  return { institutional, authority: institutional ? authority : null };
}

/* Adds the institutional flag to a content-moderation result. */
function withInstitutionalReview(flaggedCategories, institutional) {
  const flags = [...(flaggedCategories || [])];
  if (institutional && !flags.includes(INSTITUTIONAL_FLAG)) flags.push(INSTITUTIONAL_FLAG);
  return flags;
}

async function notifyInstitutionalReview({ eventId, organizerId, title, authority, edited = false }) {
  await notificationService.notifyAllAdmins({
    title: "Institutional Listing to Check",
    message: `${edited ? "An edited" : "A new"} institutional Campus Marketplace listing, "${title.trim()}", needs an authorisation check before it's shown. Authorised by (as stated): "${authority}".`,
    contextType: "event",
    contextId: eventId,
    email: true
  });
  await notificationService.createNotification({
    userId: organizerId,
    title: "Listing Held for an Authorisation Check",
    message: `"${title.trim()}" is an institutional listing, so a Taskify admin checks the authorisation before it's shown. We'll let you know once it's approved.`,
    contextType: "event",
    contextId: eventId,
    email: true
  });
}

function toMysqlDatetime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Please choose a valid date and time for the listing.");
    error.statusCode = 400;
    throw error;
  }
  // MySQL DATETIME wants "YYYY-MM-DD HH:MM:SS" — JS's toISOString() gives
  // "YYYY-MM-DDTHH:MM:SS.sssZ", which strict-mode MySQL rejects outright
  // (ER_TRUNCATED_WRONG_VALUE) rather than truncating.
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseImageUrls(row) {
  if (!row) return row;
  row.is_institutional = INSTITUTIONAL_EVENT_CATEGORIES.includes(row.category);
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
  e.created_at, e.image_urls, e.moderation_status,
  e.has_food, e.has_refreshments, e.listing_authority,
  u.full_name AS organizer_name,
  u.profile_photo_url AS organizer_profile_photo,
  u.member_type AS organizer_member_type,
  IF(u.lecturer_verified = 1, u.lecturer_title, NULL) AS organizer_lecturer_title,
  u.lecturer_verified AS organizer_lecturer_verified,
  (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id) AS rsvp_count
`;

/* Food / refreshments tick boxes arrive as true/false (or "true"/"false"). */
function toFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
}

async function createEvent({
  organizerId, title, description, category, section,
  location, eventDate, capacity, hasFood, hasRefreshments, imageUrls = [], listingAuthority = null, byAdmin = false
}) {
  const { institutional: isInstitutional, authority } = checkMarketplaceCategory({ category, listingAuthority });
  const institutional = isInstitutional && !byAdmin; // needs the admin check
  const moderation = await contentModerationService.evaluateListingContent({ title, description, imageUrls });

  if (moderation.severe) {
    await contentModerationService.recordBlockedAttempt({
      contentType: "event", userId: organizerId, title, description,
      flaggedCategories: moderation.flaggedCategories
    });
    await notificationService.notifyAllAdmins({
      title: "Content Blocked",
      message: `A Campus Marketplace listing titled "${(title || "").trim()}" was blocked at creation for violating content policy (${moderation.flaggedCategories.join(", ")}).`,
      email: true
    });

    const error = new Error("This content violates our content policy and cannot be posted.");
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.execute(
    `INSERT INTO events (
       organizer_id, title, description, category, section,
       location, event_date, capacity, has_food, has_refreshments, image_urls,
       moderation_status, moderation_flags, listing_authority
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizerId, title.trim(), description.trim(), category.trim(),
      section || "General", location.trim(), toMysqlDatetime(eventDate),
      capacity ? Number(capacity) : null,
      toFlag(hasFood), toFlag(hasRefreshments),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.flagged || institutional ? "pending_review" : "clean",
      moderation.flagged || institutional ? JSON.stringify(withInstitutionalReview(moderation.flaggedCategories, institutional)) : null,
      authority
    ]
  );

  if (institutional && !moderation.flagged) {
    await notifyInstitutionalReview({ eventId: result.insertId, organizerId, title, authority });
  }

  if (moderation.flagged) {
    await notificationService.notifyAllAdmins({
      title: "Content Flagged for Review",
      message: `A new Campus Marketplace listing, "${title.trim()}", was flagged for review (${moderation.flaggedCategories.join(", ")}).`,
      contextType: "event",
      contextId: result.insertId,
      email: true
    });
    await notificationService.createNotification({
      userId: organizerId,
      title: "Listing Held for Review",
      message: `Your Campus Marketplace listing "${title.trim()}" was flagged by our moderation system and is held from public view until an admin reviews it. We'll let you know as soon as it's approved.`,
      contextType: "event",
      contextId: result.insertId,
      email: true
    });
  }

  return getEventById(result.insertId);
}

async function getAllUpcomingEvents() {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM events e
     INNER JOIN users u ON e.organizer_id = u.id
     WHERE e.status = 'Upcoming' AND e.event_date >= NOW() AND e.moderation_status = 'clean'
     ORDER BY e.event_date ASC`
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "event");
}

/*
  Events whose date/time has already passed — surfaced as their own
  section on events.html so a poster whose event just ended (or a
  student who missed something the same day) can still see it instead
  of it silently vanishing from the "Upcoming" list the moment the
  clock ticks past event_date. Capped at 20, most recent first.
*/
async function getPastEvents() {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM events e
     INNER JOIN users u ON e.organizer_id = u.id
     WHERE e.event_date < NOW() AND e.moderation_status = 'clean'
     ORDER BY e.event_date DESC
     LIMIT 20`
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
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }
  const event = eventRows[0];

  if (event.status !== "Upcoming") {
    const error = new Error("This listing has ended or been closed, so you can't say you're going."); error.statusCode = 400; throw error;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM event_rsvps WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, userId]
  );
  if (existing.length > 0) {
    const error = new Error("You've already said you're going."); error.statusCode = 400; throw error;
  }

  if (event.capacity) {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS count FROM event_rsvps WHERE event_id = ?`,
      [eventId]
    );
    if (countRows[0].count >= event.capacity) {
      const error = new Error("This listing is full — no more places."); error.statusCode = 400; throw error;
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
    title: "Someone's Going",
    message: `${userRows[0]?.full_name || "A student"} is going to "${event.title}".`
  });

  return getEventById(eventId);
}

async function cancelRsvp(eventId, userId) {
  const [rows] = await pool.execute(
    `SELECT id FROM event_rsvps WHERE event_id = ? AND user_id = ? LIMIT 1`,
    [eventId, userId]
  );
  if (rows.length === 0) {
    const error = new Error("You haven't said you're going to this listing."); error.statusCode = 400; throw error;
  }
  await pool.execute(
    `DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?`,
    [eventId, userId]
  );
  return getEventById(eventId);
}

/* Only the organizer, only while the event is upcoming (not cancelled,
   not already past). Capacity can't drop below the people already going.
   Everyone going is told if the date/time or place changes. */
async function updateEvent(eventId, userId, {
  title, description, category, section, location, eventDate, capacity,
  hasFood, hasRefreshments, imageUrls = [], listingAuthority = null, byAdmin = false
}) {
  const [rows] = await pool.execute(
    `SELECT e.id, e.organizer_id, e.title, e.status, e.location, e.moderation_status, e.moderation_flags, e.category,
            DATE_FORMAT(e.event_date, '%Y-%m-%d %H:%i:%s') AS event_date_text,
            e.event_date < NOW() AS has_passed,
            (SELECT COUNT(*) FROM event_rsvps er WHERE er.event_id = e.id) AS rsvp_count
     FROM events e WHERE e.id = ? LIMIT 1`,
    [eventId]
  );

  if (rows.length === 0) {
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }

  const event = rows[0];

  if (Number(event.organizer_id) !== Number(userId)) {
    const error = new Error("Only the person who posted this listing can edit it."); error.statusCode = 403; throw error;
  }
  if (event.status !== "Upcoming" || Number(event.has_passed)) {
    const error = new Error("Only upcoming listings can be edited."); error.statusCode = 400; throw error;
  }

  const going = Number(event.rsvp_count);
  if (capacity && Number(capacity) < going) {
    const error = new Error(`${going} people are already going, so capacity can't be set lower than ${going}.`);
    error.statusCode = 400;
    throw error;
  }

  const { institutional: isInstitutional, authority } = checkMarketplaceCategory({ category, listingAuthority, currentCategory: event.category });
  const institutional = isInstitutional && !byAdmin; // needs the admin check
  const moderation = await moderateListingEdit({
    contentType: "event", userId, title, description, imageUrls, current: event
  });
  /* Institutional listings go back for an authorisation check on every edit. */
  const needsInstitutionalReview = institutional && event.moderation_status !== "pending_review";
  if (institutional) {
    let existing = [];
    try { existing = JSON.parse(moderation.moderationFlags || "[]"); } catch { existing = []; }
    moderation.moderationStatus = "pending_review";
    moderation.moderationFlags = JSON.stringify(withInstitutionalReview(existing, true));
  }

  const newDate = toMysqlDatetime(eventDate);
  await pool.execute(
    `UPDATE events
     SET title = ?, description = ?, category = ?, section = ?,
         location = ?, event_date = ?, capacity = ?,
         has_food = ?, has_refreshments = ?, image_urls = ?,
         moderation_status = ?, moderation_flags = ?, listing_authority = ?
     WHERE id = ?`,
    [
      title.trim(), description.trim(), category.trim(),
      section || "General", location.trim(), newDate,
      capacity ? Number(capacity) : null,
      toFlag(hasFood), toFlag(hasRefreshments),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.moderationStatus, moderation.moderationFlags, authority,
      eventId
    ]
  );

  if (needsInstitutionalReview && !moderation.newlyFlagged) {
    await notifyInstitutionalReview({ eventId, organizerId: userId, title, authority, edited: true });
  }

  if (moderation.newlyFlagged) {
    await notifyEditFlagged({
      contentType: "event", contextId: eventId, userId, title,
      flaggedCategories: moderation.flaggedCategories
    });
  }

  const dateChanged = newDate !== event.event_date_text;
  const placeChanged = location.trim() !== event.location;
  if ((dateChanged || placeChanged) && going > 0) {
    const what = dateChanged && placeChanged ? "date/time and location"
      : dateChanged ? "date/time" : "location";
    const [attendees] = await pool.execute(
      `SELECT user_id FROM event_rsvps WHERE event_id = ? AND user_id <> ?`, [eventId, userId]
    );
    await Promise.all(attendees.map(a => notificationService.createNotification({
      userId: a.user_id,
      title: "Listing Updated",
      message: `The ${what} of "${title.trim()}", a Campus Marketplace listing you're going to, has changed. Check the listing for the new details.`,
      contextType: "event",
      contextId: eventId
    })));
  }

  return getEventById(eventId);
}

async function deleteEvent(eventId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, organizer_id FROM events WHERE id = ? LIMIT 1`, [eventId]
  );
  if (rows.length === 0) {
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }
  if (Number(rows[0].organizer_id) !== Number(userId)) {
    const error = new Error("Only the person who posted this listing can delete it."); error.statusCode = 403; throw error;
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

/* viewerId/viewerRole are optional (a guest passes neither). An event that
   isn't 'clean' (pending_review or removed) is invisible to everyone
   except its own organizer and admins — a 404, same as a genuinely missing
   event, so a direct link never reveals that something was flagged. See
   event.controller.js's getEventById. */
async function getEventByIdForViewing(eventId, viewerId = null, viewerRole = null) {
  const event = await getEventById(eventId);
  if (!event) {
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }

  const isOwner = viewerId != null && Number(event.organizer_id) === Number(viewerId);
  const isAdmin = viewerRole === "admin";
  if (event.moderation_status !== "clean" && !isOwner && !isAdmin) {
    const error = new Error("Listing not found."); error.statusCode = 404; throw error;
  }

  return event;
}

module.exports = {
  INSTITUTIONAL_FLAG,
  createEvent,
  updateEvent,
  getAllUpcomingEvents,
  getPastEvents,
  getMyRsvpEventIds,
  getMyEvents,
  rsvpToEvent,
  cancelRsvp,
  deleteEvent,
  getEventByIdForViewing
};