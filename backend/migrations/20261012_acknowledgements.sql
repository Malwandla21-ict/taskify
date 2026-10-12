-- "Read and tick" confirmations (2026-10-12)
-- Doc copy of what backend/scripts/repair-acknowledgements-schema.js applies.
-- Run the script instead of this file directly — it's idempotent.

-- One row each time someone ticks a box from config/acknowledgements.js
-- (academic honesty, selling rules, rental owner / renter responsibilities):
-- which text, which version, when, and for which listing or booking.
CREATE TABLE user_acknowledgements (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  kind VARCHAR(60) NOT NULL,
  version VARCHAR(20) NOT NULL,
  context_type VARCHAR(40) NULL DEFAULT NULL,
  context_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ack_user (user_id, created_at),
  KEY idx_ack_context (context_type, context_id),
  CONSTRAINT fk_ack_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
