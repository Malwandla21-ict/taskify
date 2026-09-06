const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for email-based 2FA enrollment (an alternative
  to the authenticator-app/TOTP method — see auth.service.js's
  requestEmailTwoFactorSetupCode / enableEmailTwoFactor).

  Adds a single column recording which method is behind totp_enabled for a
  given account. NULL when 2FA is off; 'totp' or 'email' once it's on.
  No new table — reuses the existing totp_secret_encrypted /
  totp_backup_codes / login_email_otp_* columns depending on method.

  Usage: node scripts/repair-two-factor-method-schema.js
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
    await addColumnIfMissing(pool, "users", "totp_method", "VARCHAR(10) NULL");

    /* Backfill: anyone who already has 2FA on today only ever had the
       authenticator-app method available, so they're unambiguously 'totp'. */
    await pool.execute(`UPDATE users SET totp_method = 'totp' WHERE totp_enabled = 1 AND totp_method IS NULL`);

    console.log("Two-factor method schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
