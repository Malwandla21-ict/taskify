-- Lecturer verification (2026-10-10)
-- Doc copy of what backend/scripts/repair-lecturer-verification-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

ALTER TABLE users
  ADD COLUMN lecturer_verified TINYINT(1) NOT NULL DEFAULT 0;

-- Only when the column is first added: existing lecturer accounts with a
-- name.surname email (not a student-number email) keep working as verified.
UPDATE users
SET lecturer_verified = 1
WHERE member_type = 'Lecturer' AND email NOT REGEXP '^[0-9]+@';
