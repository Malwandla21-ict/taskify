-- Event food / refreshments (2026-09-27)
-- Doc copy of what backend/scripts/repair-event-food-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

ALTER TABLE events
  ADD COLUMN has_food TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN has_refreshments TINYINT(1) NOT NULL DEFAULT 0;
