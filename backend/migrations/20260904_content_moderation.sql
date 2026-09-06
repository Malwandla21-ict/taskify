-- backend/migrations/20260904_content_moderation.sql
-- Documentation copy of the changes applied by
-- scripts/repair-content-moderation-schema.js (that script is what
-- actually runs — this file is a readable record of what it does).
--
-- Adds AI-assisted content moderation (via OpenAI's Moderation endpoint,
-- see CONTENT_MODERATION_SETUP.md) for tasks, sales items, equipment
-- listings, and events, plus their images.

ALTER TABLE tasks
  ADD COLUMN moderation_status ENUM('clean','pending_review','removed') NOT NULL DEFAULT 'clean',
  ADD COLUMN moderation_flags JSON NULL;

ALTER TABLE sales_items
  ADD COLUMN moderation_status ENUM('clean','pending_review','removed') NOT NULL DEFAULT 'clean',
  ADD COLUMN moderation_flags JSON NULL;

ALTER TABLE equipment
  ADD COLUMN moderation_status ENUM('clean','pending_review','removed') NOT NULL DEFAULT 'clean',
  ADD COLUMN moderation_flags JSON NULL;

ALTER TABLE events
  ADD COLUMN moderation_status ENUM('clean','pending_review','removed') NOT NULL DEFAULT 'clean',
  ADD COLUMN moderation_flags JSON NULL;

-- Reports and notifications could previously only be tagged against a
-- task, equipment booking, or sales item — events had no way to be
-- reported, or referenced by a notification's context.
ALTER TABLE reports
  MODIFY COLUMN context_type ENUM('task','equipment_booking','sales_item','event') NULL;

ALTER TABLE notifications
  MODIFY COLUMN context_type ENUM('task','equipment_booking','sales_item','event') NULL;

-- Images are moderated at upload time, before they're attached to any
-- listing — a soft-flagged image still gets uploaded (so the create flow
-- doesn't break), but its URL is recorded here so that whichever listing
-- ends up using it can be marked pending_review too, without moderating
-- the same image twice.
CREATE TABLE IF NOT EXISTS flagged_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_url VARCHAR(500) NOT NULL,
    flagged_categories JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_flagged_uploads_url (image_url(255))
);
