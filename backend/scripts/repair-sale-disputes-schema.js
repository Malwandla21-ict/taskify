const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for sale disputes ("Report a problem" on a
  Taskify Protection order — see sales.service.js disputeSaleOrder /
  resolveSaleDispute). Safe to run any number of times — every change is
  guarded first. Existing orders keep their status; the new 'Disputed'
  value is only added.

  Run this BEFORE deploying the backend code that uses these columns.

  Usage: node scripts/repair-sale-disputes-schema.js
*/

const ORDER_STATUSES = "'Held','Disputed','Released','Refunded'";

const COLUMNS = [
  ["disputed_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["disputed_by", "ENUM('buyer','seller') NULL DEFAULT NULL"],
  ["dispute_category", "VARCHAR(40) NULL DEFAULT NULL"],
  ["dispute_reason", "VARCHAR(500) NULL DEFAULT NULL"],
  ["dispute_outcome", "ENUM('released','refunded','retry','handed_over','seller_refunded') NULL DEFAULT NULL"],
  ["dispute_resolved_at", "TIMESTAMP NULL DEFAULT NULL"]
];

async function columnInfo(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT column_type AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0] || null;
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
    const status = await columnInfo(pool, "sale_orders", "status");
    if (!status) throw new Error("sale_orders table not found — run repair-payment-simulation-schema.js first.");
    if (!status.type.includes("'Disputed'")) {
      await pool.execute(`ALTER TABLE sale_orders MODIFY COLUMN status ENUM(${ORDER_STATUSES}) NOT NULL DEFAULT 'Held'`);
      console.log("sale_orders.status now includes 'Disputed'.");
    } else {
      console.log("sale_orders.status already includes 'Disputed' — skipping.");
    }

    for (const [column, definition] of COLUMNS) {
      if (!(await columnInfo(pool, "sale_orders", column))) {
        await pool.execute(`ALTER TABLE sale_orders ADD COLUMN ${column} ${definition}`);
        console.log(`Added sale_orders.${column}`);
      } else {
        console.log(`sale_orders.${column} already present — skipping.`);
      }
    }

    console.log("Sale disputes schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
