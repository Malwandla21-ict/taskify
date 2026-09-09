-- Real browser push notifications (Web Push API): a message that reaches
-- the user even with the Taskify tab, or the whole browser, closed. This
-- sits alongside (not instead of) the existing in-app notifications
-- (page-open only) and the email shortlist in mailer.service.js.
--
-- One row per browser/device a user has granted notification permission
-- on — a person using Taskify on their phone and laptop gets two rows and
-- a push to both. endpoint is the full push-service URL the browser gave
-- us (can be long and provider-specific, hence TEXT rather than VARCHAR);
-- endpoint_hash is a SHA-256 of it, used for the uniqueness check and
-- lookups instead of indexing the raw TEXT column.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint TEXT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL,     -- sha256(endpoint), see utils/crypto.js hashToken
    p256dh VARCHAR(255) NOT NULL,        -- subscription.keys.p256dh
    auth VARCHAR(255) NOT NULL,          -- subscription.keys.auth
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_push_endpoint_hash (endpoint_hash),
    KEY idx_push_subscriptions_user (user_id),
    CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Applied via backend/scripts/repair-push-subscriptions-schema.js
-- (idempotent, guarded by an information_schema check) — this file is
-- documentation only and is never executed automatically.
--
-- Also requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT env
-- vars (see push.service.js) — without them, sendPushToUser() is a no-op
-- and this table just stays empty rather than erroring.
