-- "Help shape Taskify" feedback (2026-10-11)
-- Doc copy of what backend/scripts/repair-feedback-schema.js applies.
-- Run the script instead of this file directly — it's idempotent.

CREATE TABLE feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  kind ENUM('idea','problem','consultation','testing') NOT NULL,
  message VARCHAR(2000) NOT NULL,
  status ENUM('New','Reviewed') NOT NULL DEFAULT 'New',
  reviewed_by INT NULL DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feedback_status (status, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
