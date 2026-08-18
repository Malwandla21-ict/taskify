const pool = require("../config/db");

async function isEmailAllowlisted(email) {
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT id FROM admin_allowlist WHERE email = ? LIMIT 1`,
    [normalized]
  );
  return rows.length > 0;
}

async function addToAllowlist(email, addedByUserId, note = null) {
  const normalized = email.trim().toLowerCase();

  const [existing] = await pool.execute(
    `SELECT id FROM admin_allowlist WHERE email = ? LIMIT 1`,
    [normalized]
  );
  if (existing.length > 0) {
    const error = new Error("This email is already on the admin allow-list.");
    error.statusCode = 400;
    throw error;
  }

  await pool.execute(
    `INSERT INTO admin_allowlist (email, added_by, note) VALUES (?, ?, ?)`,
    [normalized, addedByUserId, note]
  );

  const [userRows] = await pool.execute(
    `SELECT id, role FROM users WHERE email = ? LIMIT 1`,
    [normalized]
  );
  if (userRows.length > 0 && userRows[0].role === "user") {
    await pool.execute(`UPDATE users SET role = 'admin' WHERE id = ?`, [userRows[0].id]);
  }

  return getAllowlist();
}

async function removeFromAllowlist(entryId) {
  const [rows] = await pool.execute(
    `SELECT id, email FROM admin_allowlist WHERE id = ? LIMIT 1`,
    [entryId]
  );
  if (rows.length === 0) {
    const error = new Error("Allow-list entry not found.");
    error.statusCode = 404;
    throw error;
  }

  await pool.execute(`DELETE FROM admin_allowlist WHERE id = ?`, [entryId]);

  await pool.execute(
    `UPDATE users SET role = 'user' WHERE email = ? AND role = 'admin'`,
    [rows[0].email]
  );

  return getAllowlist();
}

async function getAllowlist() {
  const [rows] = await pool.execute(
    `SELECT
       a.id, a.email, a.note, a.created_at,
       u.full_name AS added_by_name
     FROM admin_allowlist a
     LEFT JOIN users u ON a.added_by = u.id
     ORDER BY a.created_at DESC`
  );
  return rows;
}

async function countAdmins() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`
  );
  return Number(rows[0].count);
}

module.exports = {
  isEmailAllowlisted,
  addToAllowlist,
  removeFromAllowlist,
  getAllowlist,
  countAdmins
};