const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for AI-assisted content moderation (tasks, sales
  items, equipment listings, events, and their images) via OpenAI's
  Moderation endpoint. Safe to run any number of times — every change is
  guarded by an information_schema check first.

  Usage: node scripts/repair-content-moderation-schema.js
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

const MODERATED_TABLES = ["tasks", "sales_items", "equipment", "events"];

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    for (const table of MODERATED_TABLES) {
      await addColumnIfMissing(
        pool, table, "moderation_status",
        "ENUM('clean','pending_review','removed') NOT NULL DEFAULT 'clean'"
      );
      await addColumnIfMissing(pool, table, "moderation_flags", "JSON NULL");
    }

    /* Reports and notifications could previously only be tagged against a
       task, equipment booking, or sales item — events had no way to be
       reported, or referenced by a notification's context. */
    await pool.execute(
      `ALTER TABLE reports
       MODIFY COLUMN context_type ENUM('task','equipment_booking','sales_item','event') NULL`
    );
    console.log("Widened reports.context_type to include 'event'.");

    await pool.execute(
      `ALTER TABLE notifications
       MODIFY COLUMN context_type ENUM('task','equipment_booking','sales_item','event') NULL`
    );
    console.log("Widened notifications.context_type to include 'event'.");

    /* Images are moderated at upload time, before they're attached to any
       listing — a soft-flagged image still gets uploaded (so the create
       flow doesn't break), but its URL is recorded here so that whichever
       task/sales item/equipment listing/event ends up using it can be
       marked pending_review too, without moderating the same image twice. */
    if (!(await tableExists(pool, "flagged_uploads"))) {
      await pool.execute(`
        CREATE TABLE flagged_uploads (
          id INT AUTO_INCREMENT PRIMARY KEY,
          image_url VARCHAR(500) NOT NULL,
          flagged_categories JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_flagged_uploads_url (image_url(255))
        )
      `);
      console.log("Created flagged_uploads table");
    } else {
      console.log("flagged_uploads table already present — skipping.");
    }

    console.log("Content-moderation schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
