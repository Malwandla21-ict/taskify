const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* backend/.env — same reasoning as repair-moderation-review-schema.js:
   the running app is started from inside backend/, so that's the .env
   holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for the DEMO payment simulation (2026-09-23):
  rental trust ladder + deposits + condition photos, and Taskify
  Protection (escrow + handover code) for sales. Safe to run any number
  of times — every step checks first and skips what's already there.

  1. equipment.item_value            — what the owner says the item is worth
                                       (drives the deposit and trust cap)
  2. equipment_bookings money/photo columns
  3. sales_items.status gains 'Reserved'
  4. new sale_orders table

  Usage (from inside the backend folder):
    node scripts/repair-payment-simulation-schema.js
*/

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0].count) > 0;
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
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
    /* 1. Equipment value */
    await addColumnIfMissing(pool, "equipment", "item_value", "DECIMAL(10,2) NULL AFTER daily_price");

    /* 2. Booking money + condition-photo columns (all NULL for bookings
          made before this feature — the code treats those as "legacy") */
    const bookingColumns = [
      ["rental_days",      "INT NULL"],
      ["rental_amount",    "DECIMAL(10,2) NULL"],
      ["protection_fee",   "DECIMAL(10,2) NULL"],
      ["deposit_amount",   "DECIMAL(10,2) NULL"],
      ["trust_level",      "VARCHAR(20) NULL"],
      ["payment_status",   "ENUM('Held','Released','Refunded') NULL"],
      ["deposit_status",   "ENUM('None','Held','Refunded','Disputed') NULL"],
      ["condition_status", "ENUM('Pending','OK','Damaged') NULL"],
      ["pickup_photos",    "LONGTEXT NULL"],
      ["picked_up_at",     "TIMESTAMP NULL DEFAULT NULL"],
      ["return_photos",    "LONGTEXT NULL"],
      ["returned_at",      "TIMESTAMP NULL DEFAULT NULL"],
      ["damage_note",      "TEXT NULL"]
    ];
    for (const [column, definition] of bookingColumns) {
      await addColumnIfMissing(pool, "equipment_bookings", column, definition);
    }

    /* 3. 'Reserved' sales status */
    const [statusRows] = await pool.execute(
      `SELECT COLUMN_TYPE AS column_type FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'sales_items' AND column_name = 'status'`
    );
    const statusType = String(statusRows[0]?.column_type || "");
    if (!statusType.includes("'Reserved'")) {
      await pool.execute(
        `ALTER TABLE sales_items
         MODIFY COLUMN status ENUM('Available','Reserved','Sold') NOT NULL DEFAULT 'Available'`
      );
      console.log("Added 'Reserved' to sales_items.status");
    } else {
      console.log("sales_items.status already has 'Reserved' — skipping.");
    }

    /* 4. Sale orders (Taskify Protection) */
    if (!(await tableExists(pool, "sale_orders"))) {
      await pool.execute(`
        CREATE TABLE sale_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sales_item_id INT NOT NULL,
          buyer_id INT NOT NULL,
          seller_id INT NOT NULL,
          item_price DECIMAL(10,2) NOT NULL,
          protection_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
          total_amount DECIMAL(10,2) NOT NULL,
          handover_code CHAR(4) NOT NULL,
          code_attempts INT NOT NULL DEFAULT 0,
          status ENUM('Held','Released','Refunded') NOT NULL DEFAULT 'Held',
          cancelled_by ENUM('buyer','seller') NULL,
          released_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_sale_orders_item (sales_item_id),
          INDEX idx_sale_orders_buyer (buyer_id),
          INDEX idx_sale_orders_seller (seller_id),
          CONSTRAINT fk_sale_orders_item FOREIGN KEY (sales_item_id) REFERENCES sales_items(id) ON DELETE CASCADE,
          CONSTRAINT fk_sale_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_sale_orders_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created sale_orders table");
    } else {
      console.log("sale_orders table already present — skipping.");
    }

    console.log("Payment simulation schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Payment simulation schema repair failed:", error.message);
  process.exit(1);
});
