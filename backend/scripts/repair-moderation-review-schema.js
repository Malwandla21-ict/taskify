const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* Deliberately backend/.env (one level up from backend/scripts/), not the
   project-root .env two levels up. The other repair-*.js scripts in this
   folder point at the root .env instead, but that's not actually where the
   running app's credentials live: db.js calls plain dotenv.config() with no
   path, which resolves relative to process.cwd() — and the app is started
   from inside backend/, so it's always backend/.env that's authoritative.
   Pointing here directly avoids depending on the root .env staying in sync
   with it (it apparently didn't — see the 2026-09-23 mtime drift between
   the two files that caused this script to first fail against a stale
   root .env with no DB_* vars set). */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for the "pending content must not be posted until
  an admin approves it" moderation policy change (2026-09-23). Safe to run
  any number of times.

  Adds one new table:
    blocked_content_attempts — a durable record of a hard-blocked (severe)
    creation attempt. Severe content is never inserted into tasks/
    sales_items/equipment/events at all (that's the point of a hard block),
    so without this table a severe attempt left no trace beyond a one-off
    admin email/notification — no way to spot a repeat offender later.

  This does NOT touch moderation_status/moderation_flags — those already
  exist from repair-content-moderation-schema.js. This script only adds the
  new blocked-attempts table.

  Usage: node scripts/repair-moderation-review-schema.js
*/

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0].count) > 0;
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
    if (!(await tableExists(pool, "blocked_content_attempts"))) {
      await pool.execute(`
        CREATE TABLE blocked_content_attempts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          content_type ENUM('task','sales_item','equipment','event') NOT NULL,
          user_id INT NULL,
          title VARCHAR(255) NULL,
          description_snippet VARCHAR(300) NULL,
          flagged_categories JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_blocked_content_attempts_user (user_id),
          INDEX idx_blocked_content_attempts_created (created_at)
        )
      `);
      console.log("Created blocked_content_attempts table");
    } else {
      console.log("blocked_content_attempts table already present — skipping.");
    }

    console.log("Moderation-review schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
