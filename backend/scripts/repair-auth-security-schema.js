const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for the auth-security pass (email verification,
  password reset, 2FA, login lockout, JWT invalidation, security event log).
  Safe to run any number of times — every change is guarded by an
  information_schema check first.

  Usage: node scripts/repair-auth-security-schema.js
*/

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
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
    /* ── email verification ── */
    await addColumnIfMissing(pool, "users", "email_verification_token_hash", "VARCHAR(255) NULL");
    await addColumnIfMissing(pool, "users", "email_verification_expires", "TIMESTAMP NULL");

    /* ── password reset ── */
    await addColumnIfMissing(pool, "users", "password_reset_token_hash", "VARCHAR(255) NULL");
    await addColumnIfMissing(pool, "users", "password_reset_expires", "TIMESTAMP NULL");

    /* ── two-factor authentication ── */
    await addColumnIfMissing(pool, "users", "totp_secret_encrypted", "VARCHAR(500) NULL");
    await addColumnIfMissing(pool, "users", "totp_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfMissing(pool, "users", "totp_backup_codes", "JSON NULL");

    /* ── JWT invalidation ── */
    await addColumnIfMissing(pool, "users", "token_version", "INT NOT NULL DEFAULT 0");

    /* ── login lockout ── */
    await addColumnIfMissing(pool, "users", "failed_login_attempts", "INT NOT NULL DEFAULT 0");
    await addColumnIfMissing(pool, "users", "lockout_until", "TIMESTAMP NULL");

    /* ── security event log ── */
    if (!(await tableExists(pool, "security_events"))) {
      await pool.execute(`
        CREATE TABLE security_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          email VARCHAR(120) NULL,
          event VARCHAR(60) NOT NULL,
          ip_address VARCHAR(45) NULL,
          user_agent VARCHAR(255) NULL,
          metadata JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_security_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      console.log("Created security_events table");
    } else {
      console.log("security_events table already present — skipping.");
    }

    console.log("Auth-security schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
