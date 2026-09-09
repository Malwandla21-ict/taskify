-- Onboarding flag (2026-09-09)
-- Doc copy of what backend/scripts/repair-onboarding-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

ALTER TABLE users
  ADD COLUMN has_seen_onboarding TINYINT(1) NOT NULL DEFAULT 0;
