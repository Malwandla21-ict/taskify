-- Stage 3 of the 2FA rollout: "remember this device" for 30 days, offered
-- only to student/lecturer accounts (role = 'user') with optional 2FA —
-- never to admins, whose 2FA stays mandatory on every login.
--
-- A trusted device is proven only by a long random token, hashed at rest
-- the same way every other credential in this app is (see crypto.js's
-- hashToken) — the raw token itself lives only in the browser's
-- localStorage, scoped per account email, and is never logged.

CREATE TABLE IF NOT EXISTS trusted_devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    device_label VARCHAR(150) NULL,      -- best-effort "Chrome on Windows" from the User-Agent, display only
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_used_at TIMESTAMP NULL,
    UNIQUE KEY uniq_trusted_device_token (token_hash),
    KEY idx_trusted_devices_user (user_id),
    CONSTRAINT fk_trusted_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Applied via backend/scripts/repair-trusted-devices-schema.js (idempotent,
-- guarded by an information_schema check) — this file is documentation
-- only and is never executed automatically.
--
-- expires_at is DATETIME rather than TIMESTAMP: a NOT NULL TIMESTAMP column
-- with no explicit DEFAULT triggers MySQL/MariaDB's legacy "first TIMESTAMP
-- column gets an automatic default" behavior for every TIMESTAMP column
-- after it, which falls back to '0000-00-00 00:00:00' and is rejected
-- outright under strict/NO_ZERO_DATE sql_mode ("Invalid default value for
-- 'expires_at'"). DATETIME has no such implicit-default machinery, and the
-- app always sets expires_at explicitly on INSERT (auth.service.js's
-- trustDevice), so nothing else changes.
