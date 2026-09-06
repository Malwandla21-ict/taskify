-- Email-based 2FA enrollment: lets an account turn 2FA on using just their
-- (already-verified) email address instead of an authenticator app.
--
-- This file documents the change; the actual idempotent migration is
-- backend/scripts/repair-two-factor-method-schema.js — run that against
-- your database (node scripts/repair-two-factor-method-schema.js), it's
-- safe to run more than once.

ALTER TABLE users
  ADD COLUMN totp_method VARCHAR(10) NULL;

-- Existing 2FA-enabled accounts only ever had the authenticator-app method
-- available, so backfill them explicitly rather than leaving totp_method
-- NULL while totp_enabled = 1:
UPDATE users SET totp_method = 'totp' WHERE totp_enabled = 1 AND totp_method IS NULL;

-- Notes:
-- - totp_method is NULL whenever totp_enabled = 0; set to 'totp' or 'email'
--   when 2FA is turned on, cleared back to NULL on disable.
-- - No new table for the email method: it reuses the existing
--   login_email_otp_hash / login_email_otp_expires / login_email_otp_requested_at
--   columns (added for the login-time email-OTP fallback) both to confirm
--   setup and, at login, as the account's actual verification code.
-- - Backup codes (totp_backup_codes) are generated for both methods, same
--   as today — an email-method account still gets a fully independent
--   recovery path.
