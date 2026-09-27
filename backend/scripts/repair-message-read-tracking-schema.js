const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* backend/.env — same reasoning as repair-payment-simulation-schema.js:
   the running app is started from inside backend/, so that's the .env
   holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for unread-message tracking (2026-09-27).
  Safe to run any number of times.

  1. messages.read_at — when the recipient first opened the chat after the
     message arrived (NULL = not read yet). The Messages badge counts chats
     with unread messages from the other person, so starting a chat or
     sending messages yourself never bumps it.
  2. Index for the unread lookups.

  When the column is FIRST added, every message that already exists is
  marked as read (read_at = created_at) so nobody suddenly sees a big
  unread count for old chats. That only happens on the run that adds the
  column — running this again never marks new, genuinely unread messages
  as read.

  Usage (from inside the backend folder):
    node scripts/repair-message-read-tracking-schema.js
*/

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function indexExists(pool, table, index) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, index]
  );
  return Number(rows[0].count) > 0;
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(process.env.DB_SSL === "true"
      ? { ssl: { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) } }
      : {})
  });

  try {
    /* 1. read_at (+ one-time backfill) */
    if (!(await columnExists(pool, "messages", "read_at"))) {
      await pool.execute(`ALTER TABLE messages ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER created_at`);
      const [result] = await pool.execute(`UPDATE messages SET read_at = created_at WHERE read_at IS NULL`);
      console.log(`Added messages.read_at and marked ${result.affectedRows} existing message(s) as read`);
    } else {
      console.log("messages.read_at already present — skipping.");
    }

    /* 2. Index for unread counts */
    if (!(await indexExists(pool, "messages", "idx_messages_unread"))) {
      await pool.execute(`CREATE INDEX idx_messages_unread ON messages (conversation_id, read_at, sender_id)`);
      console.log("Added idx_messages_unread");
    } else {
      console.log("idx_messages_unread already present — skipping.");
    }

    console.log("Message read-tracking schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Message read-tracking schema repair failed:", error.message);
  process.exit(1);
});
