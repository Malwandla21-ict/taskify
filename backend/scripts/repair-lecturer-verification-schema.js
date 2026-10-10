const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for lecturer verification (see requireLecturer
  in auth.middleware.js and setLecturerVerified in admin.service.js).
  Safe to run any number of times — the column is only added once.

  When the column is first added, existing lecturer accounts whose email
  is name.surname@… (not a student-number email) are marked verified so
  real lecturers keep working. Lecturer accounts on a student-number email
  stay unverified until an admin checks them. Re-running never re-verifies
  anyone an admin has since un-verified.

  Run this BEFORE deploying the backend code that reads the column.

  Usage: node scripts/repair-lecturer-verification-schema.js
*/

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function main() {
  console.log(`Target database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

  /* Same opt-in TLS as src/config/db.js — hosted MySQL (Aiven) needs it. */
  const ssl = process.env.DB_SSL === "true"
    ? { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) }
    : undefined;

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(ssl ? { ssl } : {})
  });

  try {
    if (!(await columnExists(pool, "users", "lecturer_verified"))) {
      await pool.execute(`ALTER TABLE users ADD COLUMN lecturer_verified TINYINT(1) NOT NULL DEFAULT 0`);
      console.log("Added users.lecturer_verified");

      const [result] = await pool.execute(
        `UPDATE users SET lecturer_verified = 1
         WHERE member_type = 'Lecturer' AND email NOT REGEXP '^[0-9]+@'`
      );
      console.log(`Marked ${result.affectedRows} existing lecturer account(s) with a name.surname email as verified.`);

      const [unverified] = await pool.execute(
        `SELECT COUNT(*) AS count FROM users WHERE member_type = 'Lecturer' AND lecturer_verified = 0`
      );
      console.log(`${unverified[0].count} lecturer account(s) left unverified for an admin to check.`);
    } else {
      console.log("users.lecturer_verified already present — skipping.");
    }

    console.log("Lecturer verification schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
