const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* backend/.env — the running app is started from inside backend/, so
   that's the .env holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for report categories (2026-10-03, panel
  feedback): every report now says WHAT it's about (a task, an equipment
  listing or rental, a sale, an event, a chat message) and WHAT KIND of
  problem it is (money, broken item, no-show, scam…), so admins can
  filter the Reports table. Reports stay separate from reviews — reviews
  are star ratings in their own table; reports are problems sent to admins.

  1. reports.category          — the kind of problem (defaults to 'other')
  2. reports.context_type      — gains 'equipment' (report a listing
                                 directly, not only a rental booking)
  3. Backfill: flagged messages become 'harassment'
  4. Backfill: rentals the owner already marked Damaged get a matching
     report row, so they show up in the admin Reports table too

  Safe to run any number of times.

  Usage (from inside the backend folder):
    node scripts/repair-report-categories-schema.js
*/

const CATEGORY_ENUM =
  "ENUM('payment','damaged_item','not_as_described','no_show','scam','harassment','inappropriate','other')";

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
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
    /* 1. Category column */
    if (await columnExists(pool, "reports", "category")) {
      console.log("reports.category already present — skipping.");
    } else {
      await pool.execute(
        `ALTER TABLE reports ADD COLUMN category ${CATEGORY_ENUM} NOT NULL DEFAULT 'other' AFTER reason`
      );
      console.log("Added reports.category");
    }

    /* 2. Allow reporting an equipment listing directly */
    await pool.execute(
      `ALTER TABLE reports
       MODIFY COLUMN context_type ENUM('task','equipment','equipment_booking','sales_item','event') NULL`
    );
    console.log("reports.context_type now includes 'equipment'.");

    /* 3. Flagged chat messages were always about abusive messages */
    if (await columnExists(pool, "reports", "message_id")) {
      const [msgResult] = await pool.execute(
        `UPDATE reports SET category = 'harassment'
         WHERE message_id IS NOT NULL AND category = 'other'`
      );
      console.log(`Tagged ${msgResult.affectedRows} flagged-message report(s) as 'harassment'.`);
    }

    /* 4. Existing damage reports on rentals → report rows */
    if (await columnExists(pool, "equipment_bookings", "condition_status")) {
      const [damageResult] = await pool.execute(
        `INSERT INTO reports (reporter_id, reported_user_id, context_type, context_id, reason, category, status)
         SELECT e.owner_id, eb.renter_id, 'equipment_booking', eb.id,
                COALESCE(NULLIF(eb.damage_note, ''), 'Item came back damaged.'),
                'damaged_item', 'Pending'
         FROM equipment_bookings eb
         INNER JOIN equipment e ON eb.equipment_id = e.id
         WHERE eb.condition_status = 'Damaged'
           AND NOT EXISTS (
             SELECT 1 FROM reports r
             WHERE r.context_type = 'equipment_booking'
               AND r.context_id = eb.id
               AND r.category = 'damaged_item'
           )`
      );
      console.log(`Created ${damageResult.affectedRows} report(s) for rentals already marked damaged.`);
    }

    console.log("Report categories schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Report categories schema repair failed:", error.message);
  process.exit(1);
});
