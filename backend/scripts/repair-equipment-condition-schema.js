const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* backend/.env — the running app is started from inside backend/, so
   that's the .env holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for equipment condition (2026-10-04, panel
  feedback): every equipment listing records its condition — Excellent,
  Functional or Damaged — and WHO last checked it, with no extra staff:

    - the owner sets it when listing or editing the item
    - the renter confirms it when collecting the item (with the pickup photos)
    - the owner confirms it again when the item comes back
      ("Condition OK" keeps it, "Report Damage" sets it to Damaged)

  1. equipment.condition_status      — Excellent / Functional / Damaged.
                                       NULL for listings made before this
                                       (shown as "Condition not stated"
                                       rather than guessing one).
  2. equipment.condition_checked_by  — the user who last confirmed it
  3. equipment.condition_checked_at  — when they confirmed it
  4. equipment_bookings.pickup_condition — what the renter confirmed at pickup

  Safe to run any number of times.

  Usage (from inside the backend folder):
    node scripts/repair-equipment-condition-schema.js
*/

const CONDITION_ENUM = "ENUM('Excellent','Functional','Damaged')";

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function constraintExists(pool, table, name) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.table_constraints
     WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
    [table, name]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(pool, table, column, definition) {
  if (await columnExists(pool, table, column)) {
    console.log(`${table}.${column} already present — skipping.`);
    return;
  }
  await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Added ${table}.${column}`);
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
    await addColumnIfMissing(pool, "equipment", "condition_status", `${CONDITION_ENUM} NULL AFTER description`);
    await addColumnIfMissing(pool, "equipment", "condition_checked_by", "INT NULL AFTER condition_status");
    await addColumnIfMissing(pool, "equipment", "condition_checked_at", "TIMESTAMP NULL DEFAULT NULL AFTER condition_checked_by");

    if (await constraintExists(pool, "equipment", "fk_equipment_condition_checked_by")) {
      console.log("fk_equipment_condition_checked_by already present — skipping.");
    } else {
      await pool.execute(
        `ALTER TABLE equipment
         ADD CONSTRAINT fk_equipment_condition_checked_by
         FOREIGN KEY (condition_checked_by) REFERENCES users(id) ON DELETE SET NULL`
      );
      console.log("Added fk_equipment_condition_checked_by");
    }

    await addColumnIfMissing(pool, "equipment_bookings", "pickup_condition", `${CONDITION_ENUM} NULL`);

    console.log("Equipment condition schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Equipment condition schema repair failed:", error.message);
  process.exit(1);
});
