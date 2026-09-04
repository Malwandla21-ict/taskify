const pool = require("../config/db");

/*
  Lightweight, append-only log of security-relevant events tied to a user's
  own account (login success/failure, lockouts, password changes, 2FA
  enable/disable, verification). Deliberately separate from
  admin_audit_logs, which requires a NOT NULL admin_id and is scoped to
  admin actions on *other* accounts — this table is scoped to a user's own
  account and doesn't require an admin to exist.
*/
async function logSecurityEvent({ userId = null, email = null, event, ip = null, userAgent = null, metadata = null }) {
  try {
    await pool.execute(
      `INSERT INTO security_events (user_id, email, event, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, email, event, ip, userAgent ? String(userAgent).slice(0, 255) : null, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (error) {
    /* Logging must never break the auth flow it's observing. */
    console.error("Failed to write security event:", error.message);
  }
}

function requestContext(req) {
  return {
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null
  };
}

module.exports = { logSecurityEvent, requestContext };
