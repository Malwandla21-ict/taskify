-- Taskify Protection Fund and confirmed returns (2026-10-12)
-- Doc copy of what backend/scripts/repair-rental-protection-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- 'Not Returned': an admin closed a rental whose item never came back.
ALTER TABLE equipment_bookings
  MODIFY COLUMN status ENUM('Pending','Awaiting Payment','Confirmed','Returned','Not Returned','Cancelled') NOT NULL DEFAULT 'Pending';

ALTER TABLE equipment_bookings
  ADD COLUMN return_reported_at         TIMESTAMP NULL DEFAULT NULL,  -- renter: "I've handed it back" (owner must confirm)
  ADD COLUMN return_report_escalated_at TIMESTAMP NULL DEFAULT NULL,  -- owner didn't confirm in time: admins asked
  ADD COLUMN not_returned_at            TIMESTAMP NULL DEFAULT NULL;  -- admin closed it as not returned

-- Every movement in or out of the fund: each completed rental's fee in,
-- each admin payout to an owner out (amount is negative for payouts).
CREATE TABLE protection_fund_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('fee','payout') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  booking_id INT NULL DEFAULT NULL,
  owner_id INT NULL DEFAULT NULL,
  admin_id INT NULL DEFAULT NULL,
  reason ENUM('damage','not_returned') NULL DEFAULT NULL,
  note VARCHAR(500) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fund_booking_kind (booking_id, kind),
  INDEX idx_fund_kind (kind),
  CONSTRAINT fk_fund_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_fund_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fund_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Fees already collected on completed rentals.
INSERT IGNORE INTO protection_fund_entries (kind, amount, booking_id, created_at)
SELECT 'fee', protection_fee, id, COALESCE(returned_at, updated_at)
FROM equipment_bookings
WHERE payment_status = 'Released' AND protection_fee > 0;
