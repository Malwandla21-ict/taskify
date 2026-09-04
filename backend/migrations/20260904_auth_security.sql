-- Pre-launch auth/security hardening: email verification, password reset,
-- TOTP two-factor auth, login lockout, JWT invalidation (token_version),
-- and a security event log.
--
-- This file documents the change; the actual idempotent migration is
-- backend/scripts/repair-auth-security-schema.js — run that against your
-- database (node scripts/repair-auth-security-schema.js), it's safe to
-- run more than once.

ALTER TABLE users
  ADD COLUMN email_verification_token_hash VARCHAR(255) NULL,
  ADD COLUMN email_verification_expires TIMESTAMP NULL,
  ADD COLUMN password_reset_token_hash VARCHAR(255) NULL,
  ADD COLUMN password_reset_expires TIMESTAMP NULL,
  ADD COLUMN totp_secret_encrypted VARCHAR(500) NULL,
  ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN totp_backup_codes JSON NULL,
  ADD COLUMN token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN lockout_until TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS security_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(120) NULL,
    event VARCHAR(60) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Note on is_verified: existing rows are left untouched (they stay
-- verified, so nobody currently registered gets locked out). New
-- registrations are explicitly inserted with is_verified = 0 by
-- auth.service.js — the column's own DEFAULT 1 is intentionally left
-- alone so scripts/create-admin.js (which never sets is_verified) keeps
-- creating already-verified admin accounts.
