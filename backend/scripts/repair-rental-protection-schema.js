const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for the Taskify Protection Fund and the
  confirmed-return flow (equipment.service.js, protectionFund.service.js):

    - equipment_bookings.status gains 'Not Returned' (an admin closed a
      rental whose item never came back);
    - return_reported_at: when the renter said "I've handed it back" (the
      rental only completes once the owner, or an admin, confirms it);
    - return_report_escalated_at: when admins were asked to step in because
      the owner hadn't confirmed that hand-back;
    - return_disputed_at: when the owner said "I don't have it" after the
      renter reported a hand-back (an admin decides);
    - not_returned_at: when an admin closed the rental as not returned;
    - protection_fund_entries: every movement in or out of the fund — the
      fee from each completed rental in, each admin payout to an owner out.

  Existing completed rentals (payment released) have their protection fee
  added to the fund once, so the balance reflects fees already collected.

  Safe to run any number of times — every change is guarded first.
  Run this BEFORE deploying the backend code that uses these columns.

  Usage: node scripts/repair-rental-protection-schema.js
*/

const BOOKING_STATUSES = "'Pending','Awaiting Payment','Confirmed','Returned','Not Returned','Cancelled'";

const COLUMNS = [
  ["return_reported_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["return_report_escalated_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["return_disputed_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["not_returned_at", "TIMESTAMP NULL DEFAULT NULL"]
];

async function columnInfo(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT column_type AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0] || null;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`, [table]
  );
  return rows.length > 0;
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
    const status = await columnInfo(pool, "equipment_bookings", "status");
    if (!status) throw new Error("equipment_bookings table not found.");
    if (!status.type.includes("'Awaiting Payment'")) {
      throw new Error("Run repair-rental-lifecycle-schema.js first.");
    }
    if (!status.type.includes("'Not Returned'")) {
      await pool.execute(`ALTER TABLE equipment_bookings MODIFY COLUMN status ENUM(${BOOKING_STATUSES}) NOT NULL DEFAULT 'Pending'`);
      console.log("equipment_bookings.status now includes 'Not Returned'.");
    } else {
      console.log("equipment_bookings.status already includes 'Not Returned' — skipping.");
    }

    for (const [column, definition] of COLUMNS) {
      if (!(await columnInfo(pool, "equipment_bookings", column))) {
        await pool.execute(`ALTER TABLE equipment_bookings ADD COLUMN ${column} ${definition}`);
        console.log(`Added equipment_bookings.${column}`);
      } else {
        console.log(`equipment_bookings.${column} already present — skipping.`);
      }
    }

    if (!(await tableExists(pool, "protection_fund_entries"))) {
      /* booking_id is SET NULL (not CASCADE) when a listing and its
         bookings are deleted, so the fund's history and balance never
         change after the fact. One fee and at most one payout per booking
         (the UNIQUE key), so a double click can't pay twice. */
      await pool.execute(`
        CREATE TABLE protection_fund_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          kind ENUM('fee','payout') NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          booking_id INT NULL DEFAULT NULL,
          owner_id INT NULL DEFAULT NULL,
          admin_id INT NULL DEFAULT NULL,
          reason ENUM('damage','not_returned') NULL DEFAULT NULL,
          note VARCHAR(500) NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_fund_booking_kind (booking_id, kind),
          INDEX idx_fund_kind (kind),
          CONSTRAINT fk_fund_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE SET NULL,
          CONSTRAINT fk_fund_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT fk_fund_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      console.log("Created protection_fund_entries table.");
    } else {
      console.log("protection_fund_entries table already present — skipping.");
    }

    /* Fees already collected on completed rentals go into the fund once
       (INSERT IGNORE + the UNIQUE key make this safe to re-run). */
    const [backfill] = await pool.execute(
      `INSERT IGNORE INTO protection_fund_entries (kind, amount, booking_id, created_at)
       SELECT 'fee', protection_fee, id, COALESCE(returned_at, updated_at)
       FROM equipment_bookings
       WHERE payment_status = 'Released' AND protection_fee > 0`
    );
    console.log(`Fees from completed rentals added to the fund: ${backfill.affectedRows}.`);

    console.log("Rental protection schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
