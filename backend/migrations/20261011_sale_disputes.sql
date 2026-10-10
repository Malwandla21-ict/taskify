-- Sale disputes (2026-10-11)
-- Doc copy of what backend/scripts/repair-sale-disputes-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- Either side of a Taskify Protection order can report a problem before the
-- handover (no-show, item not as described, "I handed it over but got no
-- code", code not working). The order becomes 'Disputed' — the money stays
-- held and the item stays reserved — until the seller enters the code after
-- all, the seller refunds the buyer, or an admin pays the seller, refunds the
-- buyer, or sends them back to try the handover again.
ALTER TABLE sale_orders
  MODIFY COLUMN status ENUM('Held','Disputed','Released','Refunded') NOT NULL DEFAULT 'Held';

ALTER TABLE sale_orders
  ADD COLUMN disputed_at         TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN disputed_by         ENUM('buyer','seller') NULL DEFAULT NULL,
  ADD COLUMN dispute_category    VARCHAR(40) NULL DEFAULT NULL,
  ADD COLUMN dispute_reason      VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN dispute_outcome     ENUM('released','refunded','retry','handed_over','seller_refunded') NULL DEFAULT NULL,
  ADD COLUMN dispute_resolved_at TIMESTAMP NULL DEFAULT NULL;
