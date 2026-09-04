const bcrypt = require("bcrypt");
const pool = require("../config/db");
const adminAllowlistService = require("./adminAllowlist.service");
const mailerService = require("./mailer.service");
const securityLogService = require("./securityLog.service");
const twoFactorService = require("./twoFactor.service");
const { generateRawToken, hashToken } = require("../utils/crypto");
const { signAccessToken, signPurposeToken, verifyPurposeToken } = require("../utils/jwt");

const SAFE_USER_FIELDS = `
  id, full_name, student_number, member_type, email, phone_number,
  faculty, academic_year, profile_photo_url AS profilePhoto,
  role, rating_average, total_reviews,
  lecturer_title, years_experience, office_location, consultation_mode,
  is_verified, totp_enabled
`;

function normalizePhoneNumber(phoneNumber) {
  let phone = String(phoneNumber || "").replace(/\s+/g, "").replace(/-/g, "");
  if (phone.startsWith("+")) phone = phone.substring(1);
  if (phone.startsWith("0")) phone = "27" + phone.substring(1);
  return phone;
}

function allowedEmailDomains() {
  const configured = (process.env.UNIVERSITY_EMAIL_DOMAIN || "ump.ac.za")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : ["ump.ac.za"];
}

function isAllowedEmailDomain(normalizedEmail) {
  return allowedEmailDomains().some((domain) => normalizedEmail.endsWith(`@${domain}`));
}

/* This codebase's mysql2 setup returns JSON columns as raw strings rather
   than auto-parsed values (see the same pattern in user.service.js's
   parseJsonArray and auditlog.service.js) — never assume totp_backup_codes
   is already an array without this. */
function parseBackupCodes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function throwError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function verificationUrl(rawToken) {
  const base = process.env.APP_URL || process.env.CLIENT_URL || "http://127.0.0.1:5500";
  return `${base.replace(/\/$/, "")}/verify-email.html?token=${rawToken}`;
}

function resetUrl(rawToken) {
  const base = process.env.APP_URL || process.env.CLIENT_URL || "http://127.0.0.1:5500";
  return `${base.replace(/\/$/, "")}/reset-password.html?token=${rawToken}`;
}

/* ───────────────────────── registration ───────────────────────── */

async function registerUser({
  fullName, email, phoneNumber, password, profilePhotoUrl = null,
  studentNumber = null, memberType = "Student", faculty = null, academicYear = null,
  lecturerTitle = null, yearsExperience = null, officeLocation = null, consultationMode = null
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isAllowedEmailDomain(normalizedEmail)) {
    throwError("Only UMP student/staff emails are allowed.", 400);
  }

  const [existingRows] = await pool.execute(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
  if (existingRows.length > 0) {
    throwError("Email is already registered.", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const isAdminEligible = await adminAllowlistService.isEmailAllowlisted(normalizedEmail);
  const assignedRole = isAdminEligible ? "admin" : "user";

  const normalizedMemberType = ["Student", "Lecturer", "Staff"].includes(memberType) ? memberType : "Student";
  const isLecturer = normalizedMemberType === "Lecturer";

  const rawVerificationToken = generateRawToken();
  const verificationExpiryHours = Number(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS) || 24;

  const [result] = await pool.execute(
    `
      INSERT INTO users (
        full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, password_hash, profile_photo_url, role,
        lecturer_title, years_experience, office_location, consultation_mode,
        is_verified, email_verification_token_hash, email_verification_expires
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
    `,
    [
      fullName.trim(),
      studentNumber ? studentNumber.trim() : null,
      normalizedMemberType,
      normalizedEmail,
      normalizedPhone,
      faculty ? faculty.trim() : null,
      normalizedMemberType === "Student" ? (academicYear ? academicYear.trim() : null) : null,
      hashedPassword,
      profilePhotoUrl,
      assignedRole,
      isLecturer ? (lecturerTitle || null) : null,
      isLecturer && yearsExperience ? Number(yearsExperience) : null,
      isLecturer ? (officeLocation ? officeLocation.trim() : null) : null,
      isLecturer ? (consultationMode ? consultationMode.trim() : null) : null,
      hashToken(rawVerificationToken),
      verificationExpiryHours
    ]
  );

  try {
    await mailerService.sendVerificationEmail(normalizedEmail, fullName.trim(), verificationUrl(rawVerificationToken));
  } catch (error) {
    /* Don't fail registration just because the email couldn't be sent —
       the user can request a resend. Do log it loudly though. */
    console.error("Failed to send verification email:", error.message);
  }

  await securityLogService.logSecurityEvent({
    userId: result.insertId,
    email: normalizedEmail,
    event: "register"
  });

  return {
    email: normalizedEmail,
    message: "Account created. Please check your email to verify your account before logging in."
  };
}

/* ───────────────────────── email verification ───────────────────────── */

async function verifyEmailToken(rawToken) {
  if (!rawToken) throwError("Verification token is required.", 400);
  const hashed = hashToken(rawToken);

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role, token_version FROM users
     WHERE email_verification_token_hash = ? AND email_verification_expires > NOW() LIMIT 1`,
    [hashed]
  );

  if (rows.length === 0) {
    throwError("This verification link is invalid or has expired. Please request a new one.", 400);
  }

  const user = rows[0];

  await pool.execute(
    `UPDATE users SET is_verified = 1, email_verification_token_hash = NULL, email_verification_expires = NULL WHERE id = ?`,
    [user.id]
  );

  await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "email_verified" });

  const token = signAccessToken(user);
  const [userRows] = await pool.execute(`SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = ? LIMIT 1`, [user.id]);

  return { token, user: userRows[0] };
}

async function resendVerificationEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const genericMessage = "If that email is registered and not yet verified, a new verification link has been sent.";

  const [rows] = await pool.execute(
    `SELECT id, full_name, is_verified FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  if (rows.length === 0 || rows[0].is_verified) {
    /* Same response either way — don't leak which emails are registered. */
    return { message: genericMessage };
  }

  const user = rows[0];
  const rawVerificationToken = generateRawToken();
  const verificationExpiryHours = Number(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS) || 24;

  await pool.execute(
    `UPDATE users SET email_verification_token_hash = ?, email_verification_expires = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?`,
    [hashToken(rawVerificationToken), verificationExpiryHours, user.id]
  );

  try {
    await mailerService.sendVerificationEmail(normalizedEmail, user.full_name, verificationUrl(rawVerificationToken));
  } catch (error) {
    console.error("Failed to resend verification email:", error.message);
  }

  return { message: genericMessage };
}

/* ───────────────────────── login ───────────────────────── */

async function loginUser({ email, password, ip = null, userAgent = null }) {
  const normalizedEmail = email.trim().toLowerCase();
  const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
  const lockoutMinutes = Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15;

  const [rows] = await pool.execute(
    `
      SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        password_hash, role, rating_average, total_reviews,
        suspension_reason, ban_reason,
        lecturer_title, years_experience, office_location, consultation_mode,
        is_verified, totp_enabled, token_version, failed_login_attempts, lockout_until
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    await securityLogService.logSecurityEvent({ email: normalizedEmail, event: "login_failed_unknown_email", ip, userAgent });
    throwError("Invalid email or password.", 401);
  }

  const user = rows[0];

  if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
    await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_blocked_lockout", ip, userAgent });
    throwError(`Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`, 403);
  }

  if (user.role === "suspended") {
    throwError(user.suspension_reason || "Your account has been suspended.", 403);
  }
  if (user.role === "banned") {
    throwError(user.ban_reason || "Your account has been banned.", 403);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    const lockNow = attempts >= maxAttempts;

    await pool.execute(
      `UPDATE users SET failed_login_attempts = ?, lockout_until = ? WHERE id = ?`,
      [lockNow ? 0 : attempts, lockNow ? new Date(Date.now() + lockoutMinutes * 60000) : null, user.id]
    );

    await securityLogService.logSecurityEvent({
      userId: user.id, email: normalizedEmail, event: lockNow ? "login_lockout_triggered" : "login_failed_bad_password", ip, userAgent
    });

    if (lockNow) {
      throwError(`Too many failed attempts. Your account is locked for ${lockoutMinutes} minutes.`, 403);
    }
    throwError("Invalid email or password.", 401);
  }

  if (user.failed_login_attempts > 0 || user.lockout_until) {
    await pool.execute(`UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?`, [user.id]);
  }

  if (!user.is_verified) {
    await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_blocked_unverified", ip, userAgent });
    throwError("Please verify your email before logging in. Check your inbox, or request a new verification link.", 403);
  }

  if (user.totp_enabled) {
    const tempToken = signPurposeToken(
      "2fa_pending",
      { id: user.id },
      `${Number(process.env.TWOFA_PENDING_EXPIRY_MINUTES) || 5}m`
    );
    await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_password_ok_awaiting_2fa", ip, userAgent });
    return { requires2FA: true, tempToken };
  }

  await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_success", ip, userAgent });

  const token = signAccessToken(user);
  delete user.password_hash;
  delete user.suspension_reason;
  delete user.ban_reason;
  delete user.failed_login_attempts;
  delete user.lockout_until;
  delete user.token_version;

  return { token, user };
}

/* ───────────────────────── password reset ───────────────────────── */

async function forgotPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const genericMessage = "If that email is registered, a password reset link has been sent.";

  const [rows] = await pool.execute(`SELECT id, full_name FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
  if (rows.length === 0) {
    return { message: genericMessage };
  }

  const user = rows[0];
  const rawToken = generateRawToken();
  const expiryMinutes = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 30;

  await pool.execute(
    `UPDATE users SET password_reset_token_hash = ?, password_reset_expires = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
    [hashToken(rawToken), expiryMinutes, user.id]
  );

  try {
    await mailerService.sendPasswordResetEmail(normalizedEmail, user.full_name, resetUrl(rawToken));
  } catch (error) {
    console.error("Failed to send password reset email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "password_reset_requested" });

  return { message: genericMessage };
}

async function resetPassword(rawToken, newPassword) {
  if (!rawToken) throwError("Reset token is required.", 400);
  const hashed = hashToken(rawToken);

  const [rows] = await pool.execute(
    `SELECT id, full_name, email FROM users
     WHERE password_reset_token_hash = ? AND password_reset_expires > NOW() LIMIT 1`,
    [hashed]
  );

  if (rows.length === 0) {
    throwError("This reset link is invalid or has expired. Please request a new one.", 400);
  }

  const user = rows[0];
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.execute(
    `UPDATE users SET
       password_hash = ?, password_reset_token_hash = NULL, password_reset_expires = NULL,
       token_version = token_version + 1, failed_login_attempts = 0, lockout_until = NULL
     WHERE id = ?`,
    [hashedPassword, user.id]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Your Taskify password was just reset.");
  } catch (error) {
    console.error("Failed to send password-reset notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "password_reset_completed" });

  return { message: "Your password has been reset. Please log in with your new password." };
}

async function changePassword(userId, currentPassword, newPassword) {
  const [rows] = await pool.execute(`SELECT password_hash, email, full_name FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (rows.length === 0) throwError("Account not found.", 404);

  const user = rows[0];
  const currentMatches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!currentMatches) throwError("Current password is incorrect.", 401);

  const sameAsOld = await bcrypt.compare(newPassword, user.password_hash);
  if (sameAsOld) throwError("New password must be different from your current password.", 400);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await pool.execute(
    `UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`,
    [hashedPassword, userId]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Your Taskify password was just changed.");
  } catch (error) {
    console.error("Failed to send password-change notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "password_changed" });

  return { message: "Password changed. Please log in again on your other devices." };
}

/* ───────────────────────── two-factor authentication ───────────────────────── */

async function getTwoFactorStatus(userId) {
  const [rows] = await pool.execute(`SELECT totp_enabled FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (rows.length === 0) throwError("Account not found.", 404);
  return { enabled: !!rows[0].totp_enabled };
}

async function setupTwoFactor(userId) {
  const [rows] = await pool.execute(`SELECT email, totp_enabled FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (rows.length === 0) throwError("Account not found.", 404);
  if (rows[0].totp_enabled) throwError("Two-factor authentication is already enabled. Disable it first to re-enroll.", 400);

  const { secret, otpauthUrl } = twoFactorService.generateEnrollmentSecret(rows[0].email);
  const qrCodeDataUrl = await twoFactorService.generateQrCodeDataUrl(otpauthUrl);
  const encrypted = twoFactorService.encryptSecretForStorage(secret);

  await pool.execute(`UPDATE users SET totp_secret_encrypted = ? WHERE id = ?`, [encrypted, userId]);

  return { qrCodeDataUrl, manualEntryKey: secret };
}

async function enableTwoFactor(userId, code) {
  const [rows] = await pool.execute(`SELECT email, full_name, totp_secret_encrypted, totp_enabled FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (user.totp_enabled) throwError("Two-factor authentication is already enabled.", 400);
  if (!user.totp_secret_encrypted) throwError("Start two-factor setup first.", 400);

  const isValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code);
  if (!isValid) throwError("Invalid code. Check your authenticator app and try again.", 400);

  const { plainCodes, hashed } = await twoFactorService.generateHashedBackupCodes();

  await pool.execute(
    `UPDATE users SET totp_enabled = 1, totp_backup_codes = ? WHERE id = ?`,
    [JSON.stringify(hashed), userId]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Two-factor authentication was just enabled on your account.");
  } catch (error) {
    console.error("Failed to send 2FA-enabled notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "twofa_enabled" });

  return { backupCodes: plainCodes };
}

async function disableTwoFactor(userId, password, code) {
  const [rows] = await pool.execute(
    `SELECT email, full_name, password_hash, totp_secret_encrypted, totp_backup_codes, totp_enabled FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled.", 400);

  const passwordMatches = await bcrypt.compare(password || "", user.password_hash);
  if (!passwordMatches) throwError("Incorrect password.", 401);

  const codeValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code)
    || Boolean(await twoFactorService.consumeBackupCode(parseBackupCodes(user.totp_backup_codes), code));

  if (!codeValid) throwError("Invalid authentication code.", 400);

  await pool.execute(
    `UPDATE users SET totp_enabled = 0, totp_secret_encrypted = NULL, totp_backup_codes = NULL WHERE id = ?`,
    [userId]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Two-factor authentication was just disabled on your account.");
  } catch (error) {
    console.error("Failed to send 2FA-disabled notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "twofa_disabled" });

  return { message: "Two-factor authentication has been disabled." };
}

async function verifyTwoFactorLogin(tempToken, code, { ip = null, userAgent = null } = {}) {
  let decoded;
  try {
    decoded = verifyPurposeToken(tempToken, "2fa_pending");
  } catch {
    throwError("Your session has expired. Please log in again.", 401);
  }

  const [rows] = await pool.execute(
    `SELECT
        id, full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, profile_photo_url AS profilePhoto,
        role, rating_average, total_reviews, suspension_reason, ban_reason,
        lecturer_title, years_experience, office_location, consultation_mode,
        is_verified, totp_enabled, totp_secret_encrypted, totp_backup_codes, token_version
     FROM users WHERE id = ? LIMIT 1`,
    [decoded.id]
  );

  if (rows.length === 0) throwError("Account no longer exists.", 401);
  const user = rows[0];

  if (user.role === "suspended") throwError(user.suspension_reason || "Your account has been suspended.", 403);
  if (user.role === "banned") throwError(user.ban_reason || "Your account has been banned.", 403);
  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled on this account.", 400);

  let usedBackupCode = false;
  let isValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code);

  if (!isValid) {
    const updatedCodes = await twoFactorService.consumeBackupCode(parseBackupCodes(user.totp_backup_codes), code);
    if (updatedCodes) {
      isValid = true;
      usedBackupCode = true;
      await pool.execute(`UPDATE users SET totp_backup_codes = ? WHERE id = ?`, [JSON.stringify(updatedCodes), user.id]);
    }
  }

  if (!isValid) {
    await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "twofa_login_failed", ip, userAgent });
    throwError("Invalid authentication code.", 401);
  }

  await securityLogService.logSecurityEvent({
    userId: user.id, email: user.email, event: usedBackupCode ? "twofa_login_success_backup_code" : "twofa_login_success", ip, userAgent
  });

  const token = signAccessToken(user);
  delete user.suspension_reason;
  delete user.ban_reason;
  delete user.totp_secret_encrypted;
  delete user.totp_backup_codes;
  delete user.token_version;

  return { token, user, usedBackupCode };
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmailToken,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getTwoFactorStatus,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  verifyTwoFactorLogin
};
