const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for Campus Marketplace (the area that used to be
  "Events"): adds events.listing_authority — who authorised an
  institutional listing (farm produce, surplus, lost property,
  departmental). See config/marketplace.js and event.service.js.
  Safe to run any number of times. Existing events are not changed.

  Run this BEFORE deploying the backend code that uses this column.

  Usage: node scripts/repair-marketplace-authority-schema.js
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
       WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'listing_authority'`
    );
    if (rows.length) {
      console.log("events.listing_authority already present — skipping.");
    } else {
      await pool.execute(`ALTER TABLE events ADD COLUMN listing_authority VARCHAR(300) NULL DEFAULT NULL`);
      console.log("Added events.listing_authority");
    }
    console.log("Marketplace authority schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
