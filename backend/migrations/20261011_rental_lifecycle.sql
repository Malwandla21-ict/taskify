-- Rental lifecycle (2026-10-11)
-- Doc copy of what backend/scripts/repair-rental-lifecycle-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- New flow: request (no payment) → owner approves ('Awaiting Payment') →
-- renter pays (demo) ('Confirmed') → collect → return. 'Unpaid' marks a
-- new-style request that hasn't been paid yet (NULL still = legacy booking).
ALTER TABLE equipment_bookings
  MODIFY COLUMN status ENUM('Pending','Awaiting Payment','Confirmed','Returned','Cancelled') NOT NULL DEFAULT 'Pending',
  MODIFY COLUMN payment_status ENUM('Unpaid','Held','Released','Refunded') NULL DEFAULT NULL;

ALTER TABLE equipment_bookings
  ADD COLUMN approved_at             TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN payment_due_at          TIMESTAMP NULL DEFAULT NULL,  -- approval lapses after this
  ADD COLUMN paid_at                 TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN return_due_at           TIMESTAMP NULL DEFAULT NULL,  -- agreed deadline: last day 18:00 SAST
  ADD COLUMN return_minutes_late     INT NULL DEFAULT NULL,        -- recorded at return (no fee charged)
  ADD COLUMN cancelled_at            TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN cancel_reason           VARCHAR(30) NULL DEFAULT NULL,
  ADD COLUMN cancel_note             VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN policy_version          VARCHAR(40) NULL DEFAULT NULL, -- config/rentalPolicy.js version agreed to
  ADD COLUMN terms_snapshot          TEXT NULL,                     -- the terms shown when requested / paid
  ADD COLUMN return_reminder_sent_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN overdue_notified_at     TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN overdue_escalated_at    TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN problem_reported_at     TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN problem_reported_by     ENUM('renter','owner') NULL DEFAULT NULL,
  ADD COLUMN problem_category        VARCHAR(40) NULL DEFAULT NULL,
  ADD COLUMN problem_note            VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN return_attempted_at     TIMESTAMP NULL DEFAULT NULL,  -- renter tried to return, owner unavailable
  ADD COLUMN damage_outcome          ENUM('renter_not_at_fault','damage_confirmed') NULL DEFAULT NULL,
  ADD COLUMN damage_resolved_at      TIMESTAMP NULL DEFAULT NULL;

-- Existing bookings: standard deadline, and a policy label.
UPDATE equipment_bookings
SET return_due_at = CONVERT_TZ(CONCAT(end_date, ' 18:00:00'), '+02:00', @@session.time_zone)
WHERE return_due_at IS NULL;
UPDATE equipment_bookings
SET return_reminder_sent_at = NOW(), overdue_notified_at = NOW(), overdue_escalated_at = NOW()
WHERE status IN ('Returned', 'Cancelled');
UPDATE equipment_bookings SET policy_version = 'before-2026-10' WHERE policy_version IS NULL;

-- Availability is now checked by date, so bookings no longer switch a listing off.
UPDATE equipment SET is_available = 1 WHERE is_available = 0;

-- Extension requests: renter asks → owner approves → renter pays the extra (demo).
CREATE TABLE booking_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  old_end_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  extra_days INT NOT NULL,
  extra_amount DECIMAL(10,2) NOT NULL,
  extra_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('Requested','Awaiting Payment','Paid','Declined','Cancelled','Expired') NOT NULL DEFAULT 'Requested',
  payment_due_at TIMESTAMP NULL DEFAULT NULL,
  responded_at TIMESTAMP NULL DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking_extensions_booking (booking_id),
  CONSTRAINT fk_booking_extensions_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE CASCADE
);
