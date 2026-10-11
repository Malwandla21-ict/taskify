-- Waiting for an overdue item (2026-10-11)
-- Doc copy of what backend/scripts/repair-rental-wait-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- When the renter of an upcoming booking was warned that the item is still
-- overdue with the previous renter (sent once by jobs/scheduler.js). Also
-- marks who should be told when the item comes back.
ALTER TABLE equipment_bookings ADD COLUMN return_wait_notified_at TIMESTAMP NULL DEFAULT NULL;
