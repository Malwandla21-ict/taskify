-- Generalizes reviews beyond Tasks to also cover completed Equipment
-- rentals (a returned equipment_booking), and adds author edit/delete.
--
-- Previously `reviews.task_id` was NOT NULL, so a review could only ever
-- be attached to a task. This adds a nullable `booking_id` alongside it —
-- a review now references exactly one of task_id / booking_id (enforced
-- in review.service.js, not by a DB-level CHECK, for portability across
-- MySQL/MariaDB versions with inconsistent CHECK support). `updated_at`
-- is added so an edited review is distinguishable from a fresh one.

ALTER TABLE reviews
  MODIFY COLUMN task_id INT NULL;

ALTER TABLE reviews
  ADD COLUMN booking_id INT NULL AFTER task_id;

ALTER TABLE reviews
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE reviews
  ADD CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE CASCADE;

ALTER TABLE reviews
  ADD CONSTRAINT uq_booking_reviewer UNIQUE (booking_id, reviewer_id);

-- Applied via backend/scripts/repair-review-generalization-schema.js
-- (idempotent, guarded by information_schema checks) — this file is
-- documentation only and is never executed automatically.
--
-- The existing `uq_task_reviewer UNIQUE (task_id, reviewer_id)` constraint
-- is left as-is: MySQL/MariaDB unique indexes treat NULL as distinct from
-- every other NULL, so booking-only reviews (task_id NULL) don't collide
-- with each other or with task reviews under that constraint.
