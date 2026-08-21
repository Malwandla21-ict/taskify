const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const adminAllowlistService = require("./adminAllowlist.service");

function normalizePhoneNumber(phoneNumber) {
  let phone = String(phoneNumber || "").replace(/\s+/g, "").replace(/-/g, "");
  if (phone.startsWith("+")) phone = phone.substring(1);
  if (phone.startsWith("0")) phone = "27" + phone.substring(1);
  return phone;
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

async function registerUser({
  fullName, email, phoneNumber, password, profilePhotoUrl = null,
  studentNumber = null, memberType = "Student", faculty = null, academicYear = null
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!normalizedEmail.endsWith("@ump.ac.za")) {
    const error = new Error("Only UMP student emails are allowed.");
    error.statusCode = 400;
    throw error;
  }

  const [existingRows] = await pool.execute(
    `SELECT id FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );
  if (existingRows.length > 0) {
    const error = new Error("Email is already registered.");
    error.statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const isAdminEligible = await adminAllowlistService.isEmailAllowlisted(normalizedEmail);
  const assignedRole = isAdminEligible ? "admin" : "user";

  const [result] = await pool.execute(
    `
      INSERT INTO users (
        full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, password_hash, profile_photo_url, role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fullName.trim(),
      studentNumber ? studentNumber.trim() : null,
      memberType === "Staff" ? "Staff" : "Student",
      normalizedEmail,
      normalizedPhone,
      faculty ? faculty.trim() : null,
      academicYear ? academicYear.trim() : null,
      hashedPassword,
      profilePhotoUrl,
      assignedRole
    ]
  );

  const [userRows] = await pool.execute(
    `
      SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        role, rating_average, total_reviews
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId]
  );

  const user = userRows[0];
  const token = generateToken(user);
  return { token, user };
}

async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const [rows] = await pool.execute(
    `
      SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        password_hash, role, rating_average, total_reviews,
        suspension_reason, ban_reason
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const user = rows[0];

  if (user.role === "suspended") {
    const error = new Error(user.suspension_reason || "Your account has been suspended.");
    error.statusCode = 403;
    throw error;
  }

  if (user.role === "banned") {
    const error = new Error(user.ban_reason || "Your account has been banned.");
    error.statusCode = 403;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  delete user.password_hash;
  delete user.suspension_reason;
  delete user.ban_reason;

  const token = generateToken(user);
  return { token, user };
}

module.exports = { registerUser, loginUser };