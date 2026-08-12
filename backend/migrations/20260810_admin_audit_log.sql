-- Permanent, append-only record of every admin action. This must exist
-- before any ban/suspend/refund power is exposed, so that destructive
-- actions are always traceable to a specific admin, target, and reason.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,        -- e.g. 'user.suspend', 'report.resolve', 'user.promote'
    target_type VARCHAR(50) NOT NULL,    -- e.g. 'user', 'report', 'task', 'payment'
    target_id INT NULL,
    reason TEXT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);