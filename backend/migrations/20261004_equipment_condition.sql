-- Equipment condition (2026-10-04, panel feedback)
-- Doc copy of what backend/scripts/repair-equipment-condition-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.
--
-- Who sets/confirms the condition (no extra staff):
--   owner  — when listing or editing the item
--   renter — when collecting it (alongside the pickup photos)
--   owner  — when it comes back ("Condition OK" keeps it, "Report Damage" → Damaged)

ALTER TABLE equipment
  ADD COLUMN condition_status ENUM('Excellent','Functional','Damaged') NULL AFTER description,
  ADD COLUMN condition_checked_by INT NULL AFTER condition_status,
  ADD COLUMN condition_checked_at TIMESTAMP NULL DEFAULT NULL AFTER condition_checked_by;

ALTER TABLE equipment
  ADD CONSTRAINT fk_equipment_condition_checked_by
  FOREIGN KEY (condition_checked_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE equipment_bookings
  ADD COLUMN pickup_condition ENUM('Excellent','Functional','Damaged') NULL;

-- Listings made before this keep condition_status = NULL and show
-- "Condition not stated" until the owner edits them.
