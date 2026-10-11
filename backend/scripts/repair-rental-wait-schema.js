const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for "waiting for the item": adds
  equipment_bookings.return_wait_notified_at — when the renter of a
  booking was warned that the item is still overdue with the PREVIOUS
  renter (jobs/scheduler.js), so the warning goes out once, and so they
  can be told when it's back. Safe to run any number of times. Existing
  bookings are not changed.

  Run this BEFORE deploying the backend code that uses this column.

  Usage: node scripts/repair-rental-wait-schema.js
*/

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
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'equipment_bookings' AND column_name = 'return_wait_notified_at'`
    );
    if (rows.length) {
      console.log("equipment_bookings.return_wait_notified_at already present — skipping.");
    } else {
      await pool.execute(`ALTER TABLE equipment_bookings ADD COLUMN return_wait_notified_at TIMESTAMP NULL DEFAULT NULL`);
      console.log("Added equipment_bookings.return_wait_notified_at");
    }
    console.log("Rental wait schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
