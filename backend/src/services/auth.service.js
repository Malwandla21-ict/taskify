const bcrypt = require("bcrypt");
const pool = require("../config/db");
const adminAllowlistService = require("./adminAllowlist.service");
const mailerService = require("./mailer.service");
const securityLogService = require("./securityLog.service");
const twoFactorService = require("./twoFactor.service");
const { generateRawToken, hashToken, generateNumericCode } = require("../utils/crypto");
const { signAccessToken, signPurposeToken, verifyPurposeToken } = require("../utils/jwt");

/* TEMPORARY: email delivery is unreliable right now (EMAIL_FROM is on an
   unauthenticated free-provider address — see the mailer/domain thread).
   Set SKIP_EMAIL_VERIFICATION=true on Render to let people register and log
   in without ever needing a code to arrive. Flip it back to false/unset
   once EMAIL_FROM points at a properly verified domain — no code change
   needed either way, just the env var. */
const SKIP_EMAIL_VERIFICATION = process.env.SKIP_EMAIL_VERIFICATION === "true";

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

/* Best-effort, display-only "Chrome on Windows" style label for a trusted
   device — never used for any security decision (the token hash is what
   actually proves the device), just so someone managing their trusted
   devices can tell them apart. */
function deviceLabelFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown device";

  let browser = "Unknown browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}

/* ───────────────────────── trusted devices (Stage 3) ─────────────────────────
   "Remember this device" for student/lecturer optional 2FA only — admin
   accounts always go through the full 2FA challenge regardless of device
   history, enforced here (not just in the UI) via the role check at each
   call site. Proven the same way every other credential in this app is:
   a long random token, only its hash stored, raw value handed to the
   client once and never logged. */

const TRUSTED_DEVICE_DAYS = Number(process.env.TRUSTED_DEVICE_DAYS) || 30;

async function isDeviceTrusted(userId, deviceToken) {
  if (!deviceToken) return false;
  const tokenHash = hashToken(String(deviceToken).trim());
  const [rows] = await pool.execute(
    `SELECT id FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > NOW() LIMIT 1`,
    [userId, tokenHash]
  );
  if (rows.length === 0) return false;
  await pool.execute(`UPDATE trusted_devices SET last_used_at = NOW() WHERE id = ?`, [rows[0].id]);
  return true;
}

async function trustDevice(userId, userAgent, ip) {
  const rawToken = generateRawToken(32);
  await pool.execute(
    `INSERT INTO trusted_devices (user_id, token_hash, device_label, ip_address, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [userId, hashToken(rawToken), deviceLabelFromUserAgent(userAgent), ip, TRUSTED_DEVICE_DAYS]
  );
  return rawToken;
}

async function listTrustedDevices(userId) {
  const [rows] = await pool.execute(
    `SELECT id, device_label, ip_address, created_at, expires_at, last_used_at
     FROM trusted_devices WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function revokeTrustedDevice(userId, deviceId) {
  const [result] = await pool.execute(
    `DELETE FROM trusted_devices WHERE id = ? AND user_id = ?`,
    [deviceId, userId]
  );
  if (result.affectedRows === 0) throwError("Device not found.", 404);
  return { message: "Device forgotten. It will need to verify with 2FA again next time." };
}

async function revokeAllTrustedDevices(userId) {
  await pool.execute(`DELETE FROM trusted_devices WHERE user_id = ?`, [userId]);
  return { message: "All remembered devices have been forgotten." };
}

function resetUrl(rawToken) {
  const base = process.env.APP_URL || process.env.CLIENT_URL || "http://127.0.0.1:5500";
  return `${base.replace(/\/$/, "")}/reset-password.html?token=${rawToken}`;
}

/* Shows enough of the email for the user to recognize it's theirs on the
   two-factor screen (which never otherwise sees the email — the pending-2FA
   token only carries the user id) without printing the full address. */
function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
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

  const verificationCode = generateNumericCode(6);
  const verificationExpiryMinutes = Number(process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES) || 15;

  const [result] = await pool.execute(
    `
      INSERT INTO users (
        full_name, student_number, member_type, email, phone_number,
        faculty, academic_year, password_hash, profile_photo_url, role,
        lecturer_title, years_experience, office_location, consultation_mode,
        is_verified, email_verification_token_hash, email_verification_expires
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
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
      SKIP_EMAIL_VERIFICATION ? 1 : 0,
      hashToken(verificationCode),
      verificationExpiryMinutes
    ]
  );

  if (!SKIP_EMAIL_VERIFICATION) {
    try {
      await mailerService.sendVerificationEmail(normalizedEmail, fullName.trim(), verificationCode);
    } catch (error) {
      /* Don't fail registration just because the email couldn't be sent —
         the user can request a resend. Do log it loudly though. */
      console.error("Failed to send verification email:", error.message);
    }
  }

  await securityLogService.logSecurityEvent({
    userId: result.insertId,
    email: normalizedEmail,
    event: "register"
  });

  return {
    email: normalizedEmail,
    verified: SKIP_EMAIL_VERIFICATION,
    message: SKIP_EMAIL_VERIFICATION
      ? "Account created. You can log in now."
      : "Account created. Please check your email for a 6-digit code to verify your account before logging in."
  };
}

/* ───────────────────────── email verification ─────────────────────────
   OTP-based (not a clickable link): a 6-digit code, scoped to the email
   it was sent to (unlike the password-reset/backup-code tokens, which are
   long enough to be looked up on their own, a 6-digit code needs the email
   alongside it to mean anything). Same hashToken-at-rest treatment as
   every other credential in this file. */

async function verifyEmailOtp(email, code) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !code) throwError("Email and code are required.", 400);

  const [rows] = await pool.execute(
    `SELECT id, full_name, email, role, token_version, is_verified,
            email_verification_token_hash, email_verification_expires
     FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    throwError("This code is invalid or has expired. Please request a new one.", 400);
  }

  const user = rows[0];

  if (user.is_verified) {
    throwError("This account is already verified. Please log in.", 400);
  }

  const codeMatches = user.email_verification_token_hash
    && user.email_verification_expires
    && new Date(user.email_verification_expires) > new Date()
    && hashToken(String(code).trim()) === user.email_verification_token_hash;

  if (!codeMatches) {
    throwError("This code is invalid or has expired. Please request a new one.", 400);
  }

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
  const genericMessage = "If that email is registered and not yet verified, a new verification code has been sent.";

  const [rows] = await pool.execute(
    `SELECT id, full_name, is_verified FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  if (rows.length === 0 || rows[0].is_verified) {
    /* Same response either way — don't leak which emails are registered. */
    return { message: genericMessage };
  }

  const user = rows[0];
  const verificationCode = generateNumericCode(6);
  const verificationExpiryMinutes = Number(process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES) || 15;

  await pool.execute(
    `UPDATE users SET email_verification_token_hash = ?, email_verification_expires = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
    [hashToken(verificationCode), verificationExpiryMinutes, user.id]
  );

  try {
    await mailerService.sendVerificationEmail(normalizedEmail, user.full_name, verificationCode);
  } catch (error) {
    console.error("Failed to resend verification email:", error.message);
  }

  return { message: genericMessage };
}

/* ───────────────────────── login ───────────────────────── */

async function loginUser({ email, password, deviceToken = null, ip = null, userAgent = null }) {
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
        is_verified, totp_enabled, totp_method, token_version, failed_login_attempts, lockout_until
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

  if (!SKIP_EMAIL_VERIFICATION && !user.is_verified) {
    await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_blocked_unverified", ip, userAgent });
    throwError("Please verify your email before logging in. Check your inbox, or request a new verification code.", 403);
  }

  /* Admin accounts never skip 2FA, regardless of what device token they
     send — that's enforced here, not just by the frontend never offering
     the "remember this device" checkbox to them in the first place. */
  const canRememberDevice = user.role !== "admin";

  if (user.totp_enabled) {
    if (canRememberDevice && (await isDeviceTrusted(user.id, deviceToken))) {
      await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_trusted_device", ip, userAgent });

      const token = signAccessToken(user);
      delete user.password_hash;
      delete user.suspension_reason;
      delete user.ban_reason;
      delete user.failed_login_attempts;
      delete user.lockout_until;
      delete user.token_version;
      delete user.totp_method;

      return { token, user };
    }

    const tempToken = signPurposeToken(
      "2fa_pending",
      { id: user.id },
      `${Number(process.env.TWOFA_PENDING_EXPIRY_MINUTES) || 5}m`
    );
    await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_password_ok_awaiting_2fa", ip, userAgent });
    /* method lets the two-factor screen pick a sensible default: an
       email-method account has no authenticator app at all, so that
       screen should start in "email" mode (and auto-request a code)
       instead of showing a TOTP input nobody can fill in. canRememberDevice
       tells it whether to offer the "remember this device" checkbox at all —
       never shown to admins. */
    return { requires2FA: true, tempToken, method: user.totp_method || "totp", canRememberDevice };
  }

  await securityLogService.logSecurityEvent({ userId: user.id, email: normalizedEmail, event: "login_success", ip, userAgent });

  const token = signAccessToken(user);
  delete user.password_hash;
  delete user.suspension_reason;
  delete user.ban_reason;
  delete user.failed_login_attempts;
  delete user.lockout_until;
  delete user.token_version;
  delete user.totp_method;

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
  const [rows] = await pool.execute(`SELECT totp_enabled, totp_method, totp_backup_codes FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (rows.length === 0) throwError("Account not found.", 404);
  const enabled = !!rows[0].totp_enabled;
  const backupCodesRemaining = enabled
    ? parseBackupCodes(rows[0].totp_backup_codes).filter((entry) => !entry.used).length
    : null;
  return { enabled, method: enabled ? rows[0].totp_method || "totp" : null, backupCodesRemaining };
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
    `UPDATE users SET totp_enabled = 1, totp_method = 'totp', totp_backup_codes = ? WHERE id = ?`,
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

/* Authenticated equivalent of setupTwoFactor, for the email method: there's
   no secret/QR code to generate, just proof the account controls its own
   (already-verified) email — same "prove it before we call it enabled"
   requirement the TOTP path gets from the QR-scan + app code. Reuses the
   login_email_otp_* columns and cooldown that back the login-time email
   fallback; nothing enrollment-specific needed there. */
async function requestEmailTwoFactorSetupCode(userId) {
  const [rows] = await pool.execute(
    `SELECT email, full_name, totp_enabled, login_email_otp_requested_at FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (user.totp_enabled) throwError("Two-factor authentication is already enabled. Disable it first to re-enroll.", 400);

  const cooldownSeconds = Number(process.env.LOGIN_EMAIL_OTP_RESEND_COOLDOWN_SECONDS) || 45;
  if (user.login_email_otp_requested_at) {
    const secondsSinceLast = (Date.now() - new Date(user.login_email_otp_requested_at).getTime()) / 1000;
    if (secondsSinceLast < cooldownSeconds) {
      throwError(`Please wait ${Math.ceil(cooldownSeconds - secondsSinceLast)}s before requesting another code.`, 429);
    }
  }

  const code = generateNumericCode(6);
  const expiryMinutes = Number(process.env.LOGIN_EMAIL_OTP_EXPIRY_MINUTES) || 10;

  /*
    Send before persisting: if the email fails to go out, we don't want to
    have already burned this attempt's cooldown window (login_email_otp_
    requested_at) — that would lock the user out of ever getting a working
    code for `cooldownSeconds` at a time, purely because sending is broken,
    with no way to retry sooner. Only record the attempt once we know the
    email actually went out.
  */
  try {
    await mailerService.sendTwoFactorSetupOtpEmail(user.email, user.full_name, code);
  } catch (error) {
    console.error("Failed to send 2FA email-setup code:", error.message);
    throwError("Couldn't send the email right now. Please try again shortly.", 502);
  }

  await pool.execute(
    `UPDATE users SET login_email_otp_hash = ?, login_email_otp_expires = DATE_ADD(NOW(), INTERVAL ? MINUTE), login_email_otp_requested_at = NOW() WHERE id = ?`,
    [hashToken(code), expiryMinutes, userId]
  );

  return { message: `We've sent a 6-digit code to ${maskEmail(user.email)}. It expires in ${expiryMinutes} minutes.` };
}

async function enableEmailTwoFactor(userId, code) {
  const [rows] = await pool.execute(
    `SELECT email, full_name, totp_enabled, login_email_otp_hash, login_email_otp_expires FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (user.totp_enabled) throwError("Two-factor authentication is already enabled.", 400);

  const codeMatches = user.login_email_otp_hash
    && user.login_email_otp_expires
    && new Date(user.login_email_otp_expires) > new Date()
    && hashToken(String(code || "").trim()) === user.login_email_otp_hash;

  if (!codeMatches) throwError("Invalid or expired code. Request a new one and try again.", 400);

  const { plainCodes, hashed } = await twoFactorService.generateHashedBackupCodes();

  await pool.execute(
    `UPDATE users SET totp_enabled = 1, totp_method = 'email', totp_backup_codes = ?,
                       login_email_otp_hash = NULL, login_email_otp_expires = NULL
     WHERE id = ?`,
    [JSON.stringify(hashed), userId]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Two-factor authentication (via email) was just enabled on your account.");
  } catch (error) {
    console.error("Failed to send 2FA-enabled notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "twofa_enabled_email" });

  return { backupCodes: plainCodes };
}

async function disableTwoFactor(userId, password, code) {
  const [rows] = await pool.execute(
    `SELECT email, full_name, password_hash, totp_secret_encrypted, totp_backup_codes, totp_enabled,
            login_email_otp_hash, login_email_otp_expires
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled.", 400);

  const passwordMatches = await bcrypt.compare(password || "", user.password_hash);
  if (!passwordMatches) throwError("Incorrect password.", 401);

  let codeValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code)
    || Boolean(await twoFactorService.consumeBackupCode(parseBackupCodes(user.totp_backup_codes), code));

  /* An email-method account has no authenticator app to check against —
     the code above will only ever be a backup code for them. This is the
     third option, same check verifyTwoFactorLogin uses for the login-time
     fallback: request a code via 2fa/setup-email, then supply it here. */
  if (!codeValid && user.login_email_otp_hash && user.login_email_otp_expires && new Date(user.login_email_otp_expires) > new Date()) {
    codeValid = hashToken(String(code || "").trim()) === user.login_email_otp_hash;
  }

  if (!codeValid) throwError("Invalid authentication code.", 400);

  await pool.execute(
    `UPDATE users SET totp_enabled = 0, totp_method = NULL, totp_secret_encrypted = NULL, totp_backup_codes = NULL,
                       login_email_otp_hash = NULL, login_email_otp_expires = NULL
     WHERE id = ?`,
    [userId]
  );

  /* Any device remembered under the old enrollment shouldn't silently skip
     2FA again if it's re-enabled later — re-enrolling should mean every
     device proves itself at least once more. */
  await pool.execute(`DELETE FROM trusted_devices WHERE user_id = ?`, [userId]);

  try {
    await mailerService.sendSecurityNoticeEmail(user.email, user.full_name, "Two-factor authentication was just disabled on your account.");
  } catch (error) {
    console.error("Failed to send 2FA-disabled notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "twofa_disabled" });

  return { message: "Two-factor authentication has been disabled." };
}

/* Lets someone who still has a working authenticator/email code replace a
   dwindling set of backup codes without going through disable+re-enroll
   (which would also mean re-scanning a QR code for TOTP accounts). Uses
   the exact same three-way code check as disableTwoFactor: TOTP, an
   unused backup code, or (email-method accounts only) a fresh email OTP. */
async function regenerateBackupCodes(userId, password, code) {
  const [rows] = await pool.execute(
    `SELECT email, full_name, password_hash, totp_secret_encrypted, totp_backup_codes, totp_enabled,
            login_email_otp_hash, login_email_otp_expires
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) throwError("Account not found.", 404);
  const user = rows[0];

  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled.", 400);

  const passwordMatches = await bcrypt.compare(password || "", user.password_hash);
  if (!passwordMatches) throwError("Incorrect password.", 401);

  let codeValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code)
    || Boolean(await twoFactorService.consumeBackupCode(parseBackupCodes(user.totp_backup_codes), code));

  if (!codeValid && user.login_email_otp_hash && user.login_email_otp_expires && new Date(user.login_email_otp_expires) > new Date()) {
    codeValid = hashToken(String(code || "").trim()) === user.login_email_otp_hash;
  }

  if (!codeValid) throwError("Invalid authentication code.", 400);

  const { plainCodes, hashed } = await twoFactorService.generateHashedBackupCodes();

  await pool.execute(
    `UPDATE users SET totp_backup_codes = ?, login_email_otp_hash = NULL, login_email_otp_expires = NULL WHERE id = ?`,
    [JSON.stringify(hashed), userId]
  );

  try {
    await mailerService.sendSecurityNoticeEmail(
      user.email,
      user.full_name,
      "Your Taskify backup codes were just regenerated. Your old backup codes no longer work."
    );
  } catch (error) {
    console.error("Failed to send backup-codes-regenerated notice email:", error.message);
  }

  await securityLogService.logSecurityEvent({ userId, email: user.email, event: "twofa_backup_codes_regenerated" });

  return { backupCodes: plainCodes };
}

/* Login-time fallback for someone who can't produce a TOTP code or a
   backup code right now — emails a short-lived numeric code to the
   account's own (already-verified) address, the same way the login
   screen itself never asks for anything but what's already on file.
   Deliberately reuses the existing 2fa_pending tempToken rather than a
   separate endpoint/token type, so it can't be used to probe arbitrary
   accounts — you already had to get the password right first. */
async function requestLoginEmailOtp(tempToken) {
  let decoded;
  try {
    decoded = verifyPurposeToken(tempToken, "2fa_pending");
  } catch {
    throwError("Your session has expired. Please log in again.", 401);
  }

  const [rows] = await pool.execute(
    `SELECT id, email, full_name, role, suspension_reason, ban_reason, totp_enabled, login_email_otp_requested_at
     FROM users WHERE id = ? LIMIT 1`,
    [decoded.id]
  );
  if (rows.length === 0) throwError("Account no longer exists.", 401);
  const user = rows[0];

  if (user.role === "suspended") throwError(user.suspension_reason || "Your account has been suspended.", 403);
  if (user.role === "banned") throwError(user.ban_reason || "Your account has been banned.", 403);
  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled on this account.", 400);

  const cooldownSeconds = Number(process.env.LOGIN_EMAIL_OTP_RESEND_COOLDOWN_SECONDS) || 45;
  if (user.login_email_otp_requested_at) {
    const secondsSinceLast = (Date.now() - new Date(user.login_email_otp_requested_at).getTime()) / 1000;
    if (secondsSinceLast < cooldownSeconds) {
      throwError(`Please wait ${Math.ceil(cooldownSeconds - secondsSinceLast)}s before requesting another code.`, 429);
    }
  }

  const code = generateNumericCode(6);
  const expiryMinutes = Number(process.env.LOGIN_EMAIL_OTP_EXPIRY_MINUTES) || 10;

  // Send before persisting — see the matching comment in
  // requestEmailTwoFactorSetupCode for why: a failed send must not burn
  // this attempt's cooldown window.
  try {
    await mailerService.sendLoginOtpEmail(user.email, user.full_name, code);
  } catch (error) {
    console.error("Failed to send login email-OTP:", error.message);
    throwError("Couldn't send the email right now. Please try again shortly.", 502);
  }

  await pool.execute(
    `UPDATE users SET login_email_otp_hash = ?, login_email_otp_expires = DATE_ADD(NOW(), INTERVAL ? MINUTE), login_email_otp_requested_at = NOW() WHERE id = ?`,
    [hashToken(code), expiryMinutes, user.id]
  );

  await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "twofa_email_otp_requested" });

  return { message: `We've sent a 6-digit code to ${maskEmail(user.email)}. It expires in ${expiryMinutes} minutes.`, emailHint: maskEmail(user.email) };
}

async function verifyTwoFactorLogin(tempToken, code, { rememberDevice = false, ip = null, userAgent = null } = {}) {
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
        is_verified, totp_enabled, totp_method, totp_secret_encrypted, totp_backup_codes, token_version,
        login_email_otp_hash, login_email_otp_expires
     FROM users WHERE id = ? LIMIT 1`,
    [decoded.id]
  );

  if (rows.length === 0) throwError("Account no longer exists.", 401);
  const user = rows[0];

  if (user.role === "suspended") throwError(user.suspension_reason || "Your account has been suspended.", 403);
  if (user.role === "banned") throwError(user.ban_reason || "Your account has been banned.", 403);
  if (!user.totp_enabled) throwError("Two-factor authentication is not enabled on this account.", 400);

  let usedBackupCode = false;
  let usedEmailOtp = false;
  let isValid = twoFactorService.verifyCode(user.totp_secret_encrypted, code);

  if (!isValid) {
    const updatedCodes = await twoFactorService.consumeBackupCode(parseBackupCodes(user.totp_backup_codes), code);
    if (updatedCodes) {
      isValid = true;
      usedBackupCode = true;
      await pool.execute(`UPDATE users SET totp_backup_codes = ? WHERE id = ?`, [JSON.stringify(updatedCodes), user.id]);
    }
  }

  if (!isValid && user.login_email_otp_hash && user.login_email_otp_expires && new Date(user.login_email_otp_expires) > new Date()) {
    const suppliedHash = hashToken(String(code || "").trim());
    if (suppliedHash === user.login_email_otp_hash) {
      isValid = true;
      usedEmailOtp = true;
      await pool.execute(`UPDATE users SET login_email_otp_hash = NULL, login_email_otp_expires = NULL WHERE id = ?`, [user.id]);
    }
  }

  if (!isValid) {
    await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "twofa_login_failed", ip, userAgent });
    throwError("Invalid authentication code.", 401);
  }

  await securityLogService.logSecurityEvent({
    userId: user.id,
    email: user.email,
    event: usedBackupCode ? "twofa_login_success_backup_code" : usedEmailOtp ? "twofa_login_success_email_otp" : "twofa_login_success",
    ip,
    userAgent
  });

  /* Email-method accounts use the emailed code as their normal, primary way
     to sign in — no notice needed there. It's only noteworthy when a TOTP
     (authenticator app) account falls back to the emailed code, since that
     usually means their phone/app is unavailable and is worth flagging in
     case it wasn't the account owner. */
  if (usedEmailOtp && user.totp_method !== "email") {
    try {
      await mailerService.sendSecurityNoticeEmail(
        user.email,
        user.full_name,
        "You just signed in using a one-time code emailed to you, as a fallback for your authenticator app. If this wasn't you, secure your account immediately."
      );
    } catch (error) {
      console.error("Failed to send email-fallback-login notice:", error.message);
    }
  }

  /* Admin accounts never get a trusted device — enforced here regardless
     of what the client sends, same as the login-time bypass check. */
  let deviceToken = null;
  if (rememberDevice && user.role !== "admin") {
    deviceToken = await trustDevice(user.id, userAgent, ip);
    await securityLogService.logSecurityEvent({ userId: user.id, email: user.email, event: "trusted_device_added", ip, userAgent });
  }

  const token = signAccessToken(user);
  delete user.suspension_reason;
  delete user.ban_reason;
  delete user.totp_method;
  delete user.totp_secret_encrypted;
  delete user.totp_backup_codes;
  delete user.login_email_otp_hash;
  delete user.login_email_otp_expires;
  delete user.token_version;

  return { token, user, usedBackupCode, usedEmailOtp, deviceToken };
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmailOtp,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getTwoFactorStatus,
  setupTwoFactor,
  enableTwoFactor,
  requestEmailTwoFactorSetupCode,
  enableEmailTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  requestLoginEmailOtp,
  verifyTwoFactorLogin,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices
};
