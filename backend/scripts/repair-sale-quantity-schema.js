const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for selling more than one of the same item:
  adds sales_items.quantity (how many the seller has, 1 = a single item)
  and sales_items.quantity_sold (how many have gone). A single item leaves
  the marketplace as soon as it sells; a listing with several stays up
  until the last one sells. Safe to run any number of times. Existing
  listings become quantity 1 — and a listing already marked Sold gets
  quantity_sold 1 so it stays sold.

  Run this BEFORE deploying the backend code that uses these columns.

  Usage: node scripts/repair-sale-quantity-schema.js
*/

async function columnExists(pool, column) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'sales_items' AND column_name = ?`,
    [column]
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
    if (await columnExists(pool, "quantity")) {
      console.log("sales_items.quantity already present — skipping.");
    } else {
      await pool.execute(`ALTER TABLE sales_items ADD COLUMN quantity INT NOT NULL DEFAULT 1`);
      console.log("Added sales_items.quantity");
    }

    if (await columnExists(pool, "quantity_sold")) {
      console.log("sales_items.quantity_sold already present — skipping.");
    } else {
      await pool.execute(`ALTER TABLE sales_items ADD COLUMN quantity_sold INT NOT NULL DEFAULT 0`);
      await pool.execute(`UPDATE sales_items SET quantity_sold = quantity WHERE status = 'Sold'`);
      console.log("Added sales_items.quantity_sold (listings already sold count as sold out)");
    }
    console.log("Sale quantity schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
