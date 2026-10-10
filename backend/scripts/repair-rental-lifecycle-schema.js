const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for the rental lifecycle (request → owner
  approves → renter pays (demo) → collect → return), return deadlines and
  reminders, extensions, rental problem reports and damage outcomes — see
  equipment.service.js, rentalExtension.service.js and jobs/scheduler.js.
  Safe to run any number of times — every change is guarded first.
  Existing bookings keep their status and money fields; new values and
  columns are only added, and existing bookings get a return deadline.

  Run this BEFORE deploying the backend code that uses these columns.

  Usage: node scripts/repair-rental-lifecycle-schema.js
*/

const BOOKING_STATUSES = "'Pending','Awaiting Payment','Confirmed','Returned','Cancelled'";
const PAYMENT_STATUSES = "'Unpaid','Held','Released','Refunded'";
const RETURN_TIME = "18:00:00";   // keep in sync with RENTALS.returnTime
const UTC_OFFSET = "+02:00";      // keep in sync with RENTALS.utcOffset

const COLUMNS = [
  ["approved_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["payment_due_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["paid_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["return_due_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["return_minutes_late", "INT NULL DEFAULT NULL"],
  ["cancelled_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["cancel_reason", "VARCHAR(30) NULL DEFAULT NULL"],
  ["cancel_note", "VARCHAR(500) NULL DEFAULT NULL"],
  ["policy_version", "VARCHAR(40) NULL DEFAULT NULL"],
  ["terms_snapshot", "TEXT NULL"],
  ["return_reminder_sent_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["overdue_notified_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["overdue_escalated_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["problem_reported_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["problem_reported_by", "ENUM('renter','owner') NULL DEFAULT NULL"],
  ["problem_category", "VARCHAR(40) NULL DEFAULT NULL"],
  ["problem_note", "VARCHAR(500) NULL DEFAULT NULL"],
  ["return_attempted_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["damage_outcome", "ENUM('renter_not_at_fault','damage_confirmed') NULL DEFAULT NULL"],
  ["damage_resolved_at", "TIMESTAMP NULL DEFAULT NULL"]
];

async function columnInfo(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT column_type AS type, is_nullable AS nullable FROM information_schema.columns
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
      await pool.execute(`ALTER TABLE equipment_bookings MODIFY COLUMN status ENUM(${BOOKING_STATUSES}) NOT NULL DEFAULT 'Pending'`);
      console.log("equipment_bookings.status now includes 'Awaiting Payment'.");
    } else {
      console.log("equipment_bookings.status already includes 'Awaiting Payment' — skipping.");
    }

    const payment = await columnInfo(pool, "equipment_bookings", "payment_status");
    if (!payment) throw new Error("equipment_bookings.payment_status not found — run repair-payment-simulation-schema.js first.");
    if (!payment.type.includes("'Unpaid'")) {
      /* Stays nullable: NULL still means a legacy booking from before the
         payment simulation. */
      await pool.execute(`ALTER TABLE equipment_bookings MODIFY COLUMN payment_status ENUM(${PAYMENT_STATUSES}) NULL DEFAULT NULL`);
      console.log("equipment_bookings.payment_status now includes 'Unpaid'.");
    } else {
      console.log("equipment_bookings.payment_status already includes 'Unpaid' — skipping.");
    }

    let addedDueAt = false;
    let addedPolicy = false;
    for (const [column, definition] of COLUMNS) {
      if (!(await columnInfo(pool, "equipment_bookings", column))) {
        await pool.execute(`ALTER TABLE equipment_bookings ADD COLUMN ${column} ${definition}`);
        console.log(`Added equipment_bookings.${column}`);
        if (column === "return_due_at") addedDueAt = true;
        if (column === "policy_version") addedPolicy = true;
      } else {
        console.log(`equipment_bookings.${column} already present — skipping.`);
      }
    }

    if (addedDueAt) {
      /* Existing bookings get the standard deadline: 18:00 SAST on their
         last day. Reminders only start from now on. */
      const [result] = await pool.execute(
        `UPDATE equipment_bookings
         SET return_due_at = CONVERT_TZ(CONCAT(end_date, ' ', ?), ?, @@session.time_zone)
         WHERE return_due_at IS NULL`,
        [RETURN_TIME, UTC_OFFSET]
      );
      console.log(`Set the return deadline on ${result.affectedRows} existing booking(s).`);
      const [old] = await pool.execute(
        `UPDATE equipment_bookings
         SET return_reminder_sent_at = NOW(), overdue_notified_at = NOW(), overdue_escalated_at = NOW()
         WHERE status IN ('Returned', 'Cancelled')`
      );
      console.log(`Marked reminders as not needed on ${old.affectedRows} finished booking(s).`);
    }

    if (addedPolicy) {
      const [result] = await pool.execute(
        `UPDATE equipment_bookings SET policy_version = 'before-2026-10' WHERE policy_version IS NULL`
      );
      console.log(`Labelled ${result.affectedRows} existing booking(s) with policy version 'before-2026-10'.`);
    }

    /* Availability now goes by dates (overlapping bookings are checked on
       the server), so a booking no longer switches the whole listing off.
       is_available stays for a future "pause my listing" switch. */
    const [freed] = await pool.execute(`UPDATE equipment SET is_available = 1 WHERE is_available = 0`);
    console.log(`Listings switched back on (availability is now by date): ${freed.affectedRows}.`);

    if (!(await tableExists(pool, "booking_extensions"))) {
      await pool.execute(`
        CREATE TABLE booking_extensions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          booking_id INT NOT NULL,
          old_end_date DATE NOT NULL,
          new_end_date DATE NOT NULL,
          extra_days INT NOT NULL,
          extra_amount DECIMAL(10,2) NOT NULL,
          extra_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
          status ENUM('Requested','Awaiting Payment','Paid','Declined','Cancelled','Expired') NOT NULL DEFAULT 'Requested',
          payment_due_at TIMESTAMP NULL DEFAULT NULL,
          responded_at TIMESTAMP NULL DEFAULT NULL,
          paid_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_booking_extensions_booking (booking_id),
          CONSTRAINT fk_booking_extensions_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE CASCADE
        )
      `);
      console.log("Created booking_extensions table.");
    } else {
      console.log("booking_extensions table already present — skipping.");
    }

    console.log("Rental lifecycle schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
