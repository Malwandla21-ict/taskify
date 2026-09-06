const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for the login-time email-OTP 2FA fallback
  (see auth.service.js's requestLoginEmailOtp / verifyTwoFactorLogin).
  Safe to run any number of times — every change is guarded by an
  information_schema check first. Follows the same pattern as
  repair-auth-security-schema.js.

  Usage: node scripts/repair-login-email-otp-schema.js
*/

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(pool, table, column, definition) {
  if (!(await columnExists(pool, table, column))) {
    await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added ${table}.${column}`);
  } else {
    console.log(`${table}.${column} already present — skipping.`);
  }
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    /* ── login-time email-OTP 2FA fallback ── */
    await addColumnIfMissing(pool, "users", "login_email_otp_hash", "VARCHAR(255) NULL");
    await addColumnIfMissing(pool, "users", "login_email_otp_expires", "TIMESTAMP NULL");
    await addColumnIfMissing(pool, "users", "login_email_otp_requested_at", "TIMESTAMP NULL");

    console.log("Login email-OTP schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
