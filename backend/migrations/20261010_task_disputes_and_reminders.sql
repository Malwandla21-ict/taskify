-- Task disputes and review reminders (2026-10-10)
-- Doc copy of what backend/scripts/repair-task-disputes-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- A poster who doesn't agree the work is done can report a problem instead
-- of confirming: the task becomes 'Disputed' (payment stays held) until an
-- admin releases it to the worker, refunds the poster, or sends it back.
ALTER TABLE tasks
  MODIFY COLUMN status ENUM('Posted','Accepted','In Progress','Awaiting Confirmation','Disputed','Completed','Cancelled')
    NOT NULL DEFAULT 'Posted';

ALTER TABLE tasks
  ADD COLUMN awaiting_confirmation_at TIMESTAMP NULL DEFAULT NULL,  -- when the worker marked it done
  ADD COLUMN review_reminder_sent_at  TIMESTAMP NULL DEFAULT NULL,  -- poster reminded to review (once)
  ADD COLUMN review_escalated_at      TIMESTAMP NULL DEFAULT NULL,  -- admins asked to follow up (once)
  ADD COLUMN disputed_at              TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN dispute_reason           VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN dispute_outcome          ENUM('released','refunded','rework','poster_confirmed') NULL DEFAULT NULL,
  ADD COLUMN dispute_resolved_at      TIMESTAMP NULL DEFAULT NULL;

-- Tasks already waiting for confirmation start their review clock now.
UPDATE tasks SET awaiting_confirmation_at = updated_at
WHERE status = 'Awaiting Confirmation' AND awaiting_confirmation_at IS NULL;
