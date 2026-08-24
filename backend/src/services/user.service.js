const pool = require("../config/db");
const lecturerService = require("./lecturer.service");

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatMemberSince(createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return "Just joined";
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (remMonths > 0) parts.push(`${remMonths} month${remMonths === 1 ? "" : "s"}`);
  return parts.join(", ");
}

async function getUserStats(userId) {
  const [[tasksPostedRow], [tasksInProgressRow], [tasksCancelledRow], [positiveReviewsRow], [totalEarnedRow], [rentalRow], [listingRow]] = await Promise.all([
    pool.execute(`SELECT COUNT(*) AS c FROM tasks WHERE created_by = ?`, [userId]),
    pool.execute(
      `SELECT COUNT(*) AS c FROM tasks
       WHERE (created_by = ? OR accepted_by = ?) AND status IN ('Accepted','In Progress','Awaiting Confirmation')`,
      [userId, userId]
    ),
    pool.execute(`SELECT COUNT(*) AS c FROM tasks WHERE created_by = ? AND status = 'Cancelled'`, [userId]),
    pool.execute(`SELECT COUNT(*) AS c FROM reviews WHERE reviewee_id = ? AND rating >= 4`, [userId]),
    pool.execute(
      `SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p
       INNER JOIN tasks t ON p.task_id = t.id
       WHERE t.accepted_by = ? AND p.status = 'Released'`,
      [userId]
    ),
    pool.execute(`SELECT COUNT(*) AS c FROM equipment_bookings WHERE renter_id = ?`, [userId]),
    pool.execute(
      `SELECT (SELECT COUNT(*) FROM equipment WHERE owner_id = ?) + (SELECT COUNT(*) FROM sales_items WHERE seller_id = ?) AS c`,
      [userId, userId]
    )
  ]);

  return {
    tasks_posted: Number(tasksPostedRow[0].c) || 0,
    tasks_in_progress: Number(tasksInProgressRow[0].c) || 0,
    tasks_cancelled: Number(tasksCancelledRow[0].c) || 0,
    positive_reviews: Number(positiveReviewsRow[0].c) || 0,
    total_earned: Number(totalEarnedRow[0].total) || 0,
    total_rentals: Number(rentalRow[0].c) || 0,
    total_listings: Number(listingRow[0].c) || 0
  };
}

/* Merges several real, small activity sources into one timeline. Nothing
   here is fabricated — each entry maps to an actual row somewhere. */
async function getRecentActivity(userId, memberType) {
  const [tasksPosted] = await pool.execute(
    `SELECT id, title, created_at FROM tasks WHERE created_by = ? ORDER BY created_at DESC LIMIT 5`,
    [userId]
  );
  const [tasksCompleted] = await pool.execute(
    `SELECT id, title, updated_at FROM tasks WHERE accepted_by = ? AND status = 'Completed' ORDER BY updated_at DESC LIMIT 5`,
    [userId]
  );
  const [reviewsReceived] = await pool.execute(
    `SELECT id, rating, created_at FROM reviews WHERE reviewee_id = ? ORDER BY created_at DESC LIMIT 5`,
    [userId]
  );
  const [equipmentBooked] = await pool.execute(
    `SELECT eb.id, e.name, eb.created_at FROM equipment_bookings eb
     INNER JOIN equipment e ON eb.equipment_id = e.id
     WHERE eb.renter_id = ? ORDER BY eb.created_at DESC LIMIT 5`,
    [userId]
  );
  const [itemsListed] = await pool.execute(
    `SELECT id, title, created_at FROM sales_items WHERE seller_id = ? ORDER BY created_at DESC LIMIT 5`,
    [userId]
  );

  const activity = [
    ...tasksPosted.map(t => ({ type: "task_posted", title: "New task posted", subtitle: t.title, created_at: t.created_at })),
    ...tasksCompleted.map(t => ({ type: "task_completed", title: "Completed task", subtitle: t.title, created_at: t.updated_at })),
    ...reviewsReceived.map(r => ({ type: "review_received", title: "Received a review", subtitle: `Rated ${r.rating} star${r.rating === 1 ? "" : "s"}`, created_at: r.created_at })),
    ...equipmentBooked.map(b => ({ type: "equipment_booked", title: "Equipment booked", subtitle: b.name, created_at: b.created_at })),
    ...itemsListed.map(i => ({ type: "item_listed", title: "Listed an item for sale", subtitle: i.title, created_at: i.created_at }))
  ];

  if (memberType === "Lecturer") {
    const endorsementsGiven = await lecturerService.getEndorsementsGiven(userId);
    activity.push(
      ...endorsementsGiven.slice(0, 5).map(e => ({
        type: "endorsement_given",
        title: `Endorsed ${e.endorsed_user_name} for ${e.endorsement_type}`,
        subtitle: e.message || "",
        created_at: e.created_at
      }))
    );
  }

  return activity
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);
}

async function getUserProfile(userId) {
  const [userRows] = await pool.execute(
    `
      SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        role, rating_average, total_reviews, created_at,
        bio, skills, services, lecturer_title, years_experience,
        office_location, consultation_mode, availability_note, is_verified
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const user = userRows[0];

  const [reviews] = await pool.execute(
    `
      SELECT
        r.id, r.rating, r.comment, r.created_at,
        reviewer.id AS reviewer_id,
        reviewer.full_name AS reviewer_name,
        reviewer.profile_photo_url AS reviewer_profile_photo
      FROM reviews r
      INNER JOIN users reviewer ON r.reviewer_id = reviewer.id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `,
    [userId]
  );

  const stats = await getUserStats(userId);
  const recentActivity = await getRecentActivity(userId, user.member_type);

  const isLecturer = user.member_type === "Lecturer";

  const lecturerStats = isLecturer ? await lecturerService.getLecturerStats(userId) : null;
  const endorsementsReceived = !isLecturer ? await lecturerService.getEndorsementsReceived(userId) : [];

  return {
    id: user.id,
    full_name: user.full_name,
    student_number: user.student_number,
    member_type: user.member_type,
    email: user.email,
    phone_number: user.phone_number,
    faculty: user.faculty,
    academic_year: user.academic_year,
    profilePhoto: user.profilePhoto,
    role: user.role,
    rating_average: user.rating_average,
    total_reviews: user.total_reviews,
    completed_tasks: stats.tasks_posted, // kept for backward compatibility with older callers
    total_rentals: stats.total_rentals,
    total_listings: stats.total_listings,
    recent_reviews: reviews,
    created_at: user.created_at,
    is_verified: !!user.is_verified,

    bio: user.bio,
    skills: parseJsonArray(user.skills),
    services: parseJsonArray(user.services),
    availability_note: user.availability_note,

    lecturer_title: user.lecturer_title,
    years_experience: user.years_experience,
    office_location: user.office_location,
    consultation_mode: user.consultation_mode,

    stats,
    member_since_label: formatMemberSince(user.created_at),
    recent_activity: recentActivity,

    ...(isLecturer ? { lecturer_stats: lecturerStats } : { endorsements_received: endorsementsReceived })
  };
}

async function updateProfilePhoto(userId, profilePhotoUrl) {
  await pool.execute(`UPDATE users SET profile_photo_url = ? WHERE id = ?`, [profilePhotoUrl, userId]);
  const [rows] = await pool.execute(
    `SELECT id, full_name, email, phone_number, profile_photo_url AS profilePhoto
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

async function updateProfileDetails(userId, {
  faculty, academicYear, phoneNumber, bio, skills, services,
  lecturerTitle, yearsExperience, officeLocation, consultationMode, availabilityNote
}) {
  const fields = [];
  const values = [];

  if (faculty !== undefined)           { fields.push("faculty = ?");            values.push(faculty || null); }
  if (academicYear !== undefined)      { fields.push("academic_year = ?");      values.push(academicYear || null); }
  if (phoneNumber !== undefined)       { fields.push("phone_number = ?");       values.push(phoneNumber || null); }
  if (bio !== undefined)               { fields.push("bio = ?");                values.push(bio || null); }
  if (skills !== undefined)            { fields.push("skills = ?");             values.push(Array.isArray(skills) ? JSON.stringify(skills) : null); }
  if (services !== undefined)          { fields.push("services = ?");           values.push(Array.isArray(services) ? JSON.stringify(services) : null); }
  if (lecturerTitle !== undefined)     { fields.push("lecturer_title = ?");     values.push(lecturerTitle || null); }
  if (yearsExperience !== undefined)   { fields.push("years_experience = ?");   values.push(yearsExperience === "" || yearsExperience === null ? null : Number(yearsExperience)); }
  if (officeLocation !== undefined)    { fields.push("office_location = ?");    values.push(officeLocation || null); }
  if (consultationMode !== undefined)  { fields.push("consultation_mode = ?");  values.push(consultationMode || null); }
  if (availabilityNote !== undefined)  { fields.push("availability_note = ?");  values.push(availabilityNote || null); }

  if (fields.length) {
    values.push(userId);
    await pool.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  return getUserProfile(userId);
}

module.exports = { getUserProfile, updateProfilePhoto, updateProfileDetails };