const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair — safe to run any number of times. Fixes two
  classes of drift that raw ALTER TABLE migrations are prone to if applied
  out of order or partially:

  1. reports table: drops the legacy `task_id` column (replaced by
     context_type/context_id) if it's still present, and adds
     context_type/context_id if they're missing. This is almost certainly
     the cause of "Unknown column 'task_id'" errors on report submission.
  2. notifications table: creates it if missing, and adds
     context_type/context_id if the table exists but predates them.

  Usage: node scripts/repair-schema.js
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

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    /* ── reports table ── */
    if (await columnExists(pool, "reports", "task_id")) {
      console.log("Found legacy reports.task_id — dropping it...");
      try {
        await pool.execute(`ALTER TABLE reports DROP FOREIGN KEY fk_reports_task`);
      } catch (e) {
        console.log("  (no fk_reports_task constraint to drop, continuing)");
      }
      await pool.execute(`ALTER TABLE reports DROP COLUMN task_id`);
      console.log("  Dropped reports.task_id");
    } else {
      console.log("reports.task_id not present — good.");
    }

    if (!(await columnExists(pool, "reports", "context_type"))) {
      await pool.execute(
        `ALTER TABLE reports ADD COLUMN context_type ENUM('task','equipment_booking','sales_item') NULL AFTER reported_user_id`
      );
      console.log("Added reports.context_type");
    }
    if (!(await columnExists(pool, "reports", "context_id"))) {
      await pool.execute(`ALTER TABLE reports ADD COLUMN context_id INT NULL AFTER context_type`);
      console.log("Added reports.context_id");
    }

    /* ── notifications table ── */
    if (!(await tableExists(pool, "notifications"))) {
      await pool.execute(`
        CREATE TABLE notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          title VARCHAR(150) NOT NULL,
          message TEXT NOT NULL,
          context_type ENUM('task','equipment_booking','sales_item') NULL,
          context_id INT NULL,
          is_read TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created notifications table");
    } else {
      if (!(await columnExists(pool, "notifications", "context_type"))) {
        await pool.execute(`ALTER TABLE notifications ADD COLUMN context_type ENUM('task','equipment_booking','sales_item') NULL AFTER message`);
        console.log("Added notifications.context_type");
      }
      if (!(await columnExists(pool, "notifications", "context_id"))) {
        await pool.execute(`ALTER TABLE notifications ADD COLUMN context_id INT NULL AFTER context_type`);
        console.log("Added notifications.context_id");
      }
    }

    console.log("Schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});