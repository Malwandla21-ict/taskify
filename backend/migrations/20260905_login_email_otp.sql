-- Login-time email-OTP fallback for 2FA: lets someone without their
-- authenticator app (and without a saved backup code) sign in via a
-- short-lived 6-digit code emailed to their own account address, from the
-- existing two-factor screen.
--
-- This file documents the change; the actual idempotent migration is
-- backend/scripts/repair-login-email-otp-schema.js — run that against your
-- database (node scripts/repair-login-email-otp-schema.js), it's safe to
-- run more than once.

ALTER TABLE users
  ADD COLUMN login_email_otp_hash VARCHAR(255) NULL,
  ADD COLUMN login_email_otp_expires TIMESTAMP NULL,
  ADD COLUMN login_email_otp_requested_at TIMESTAMP NULL;

-- Notes:
-- - login_email_otp_hash stores a SHA-256 hash of the 6-digit code (via
--   utils/crypto.js's hashToken), never the raw code — same treatment as
--   password_reset_token_hash / email_verification_token_hash.
-- - login_email_otp_requested_at is a resend cooldown timestamp
--   (LOGIN_EMAIL_OTP_RESEND_COOLDOWN_SECONDS, default 45s), separate from
--   login_email_otp_expires (LOGIN_EMAIL_OTP_EXPIRY_MINUTES, default 10min)
--   so a resend doesn't need to wait for the previous code to fully expire.
-- - No new table: this reuses the existing 2fa_pending tempToken from
--   POST /auth/login, so requesting a code still requires the correct
--   password first.
