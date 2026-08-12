const pool = require("../config/db");

/*
  Every admin action that changes state (suspend, resolve, promote, refund,
  etc.) should call this. Kept deliberately dumb — no business logic here,
  just "write this record" — so every calling service stays responsible for
  its own authorization checks and only logs after a successful mutation.
*/
async function createAuditLog({ adminId, action, targetType, targetId = null, reason = null, metadata = null }) {
  await pool.execute(
    `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, reason, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      adminId,
      action,
      targetType,
      targetId,
      reason || null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

async function getAuditLogs({ limit = 50, offset = 0 } = {}) {
  /* limit/offset are validated as integers by the route layer before
     reaching here, so it's safe to inline them — mysql2's prepared
     statements don't reliably accept placeholders for LIMIT/OFFSET
     across versions. */
  const safeLimit  = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rows] = await pool.execute(
    `SELECT
       al.id, al.admin_id, al.action, al.target_type, al.target_id,
       al.reason, al.metadata, al.created_at,
       u.full_name AS admin_name
     FROM admin_audit_logs al
     INNER JOIN users u ON al.admin_id = u.id
     ORDER BY al.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`
  );

  return rows.map(row => {
    if (row.metadata && typeof row.metadata === "string") {
      try { row.metadata = JSON.parse(row.metadata); } catch { row.metadata = null; }
    }
    return row;
  });
}

module.exports = { createAuditLog, getAuditLogs };