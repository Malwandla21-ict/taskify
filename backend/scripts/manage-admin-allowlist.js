const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const COMMAND = process.argv[2];
const EMAIL   = process.argv[3];
const NOTE    = process.argv.slice(4).join(" ") || null;

function usage() {
  console.log(`
Admin Allow-list Management
This is the ONLY way to grant or revoke admin eligibility.
There is no in-app or API path for this — by design, per panel
feedback: admin status must come from an institutional signal,
not from another user's discretion.

Usage:
  node manage-admin-allowlist.js list
  node manage-admin-allowlist.js add someone@ump.ac.za "Student Affairs"
  node manage-admin-allowlist.js remove someone@ump.ac.za
`);
}

async function run() {
  if (!COMMAND || !["list", "add", "remove"].includes(COMMAND)) {
    usage();
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    if (COMMAND === "list") {
      const [rows] = await pool.execute(
        `SELECT a.id, a.email, a.note, a.created_at, u.full_name AS added_by_name
         FROM admin_allowlist a
         LEFT JOIN users u ON a.added_by = u.id
         ORDER BY a.created_at DESC`
      );
      console.table(rows);
      return;
    }

    if (!EMAIL) {
      usage();
      process.exit(1);
    }
    const normalized = EMAIL.trim().toLowerCase();

    if (COMMAND === "add") {
      if (!normalized.endsWith("@ump.ac.za")) {
        console.error("Only UMP institutional emails can be added.");
        process.exit(1);
      }

      const [existing] = await pool.execute(
        `SELECT id FROM admin_allowlist WHERE email = ? LIMIT 1`,
        [normalized]
      );
      if (existing.length > 0) {
        console.log(`${normalized} is already on the allow-list.`);
        return;
      }

      await pool.execute(
        `INSERT INTO admin_allowlist (email, note) VALUES (?, ?)`,
        [normalized, NOTE]
      );

      const [result] = await pool.execute(
        `UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'`,
        [normalized]
      );

      console.log(`Added ${normalized} to allow-list.`);
      console.log(
        result.affectedRows > 0
          ? `Existing user promoted to admin immediately.`
          : `No matching registered user yet — they'll be admin automatically on registration.`
      );
      return;
    }

    if (COMMAND === "remove") {
      const [rows] = await pool.execute(
        `SELECT id FROM admin_allowlist WHERE email = ? LIMIT 1`,
        [normalized]
      );
      if (rows.length === 0) {
        console.log(`${normalized} is not on the allow-list.`);
        return;
      }

      const [adminCountRows] = await pool.execute(
        `SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`
      );
      if (Number(adminCountRows[0].count) <= 1) {
        console.error("Refusing to remove: this would leave zero admins.");
        process.exit(1);
      }

      await pool.execute(`DELETE FROM admin_allowlist WHERE email = ?`, [normalized]);
      const [demoted] = await pool.execute(
        `UPDATE users SET role = 'user' WHERE email = ? AND role = 'admin'`,
        [normalized]
      );

      console.log(`Removed ${normalized} from allow-list.`);
      if (demoted.affectedRows > 0) console.log(`Matching user demoted to 'user' role.`);
      return;
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});