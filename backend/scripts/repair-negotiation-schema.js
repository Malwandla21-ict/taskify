const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

/* backend/.env — same reasoning as repair-payment-simulation-schema.js:
   the running app is started from inside backend/, so that's the .env
   holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  Idempotent schema repair for in-app offers / negotiation (2026-09-25).
  Safe to run any number of times — every step checks first and skips
  what's already there.

  1. offers        — one row per negotiation (who, which listing, the
                     current amount, whose turn, status, expiry)
  2. offer_history — one row per amount proposed, so the page can show
                     "R100 → R150 → R130" and who proposed each

  Why a separate history table instead of a JSON column: each step also
  records who proposed it, an optional note and when, and a plain table
  is easier to query and can't get out of shape. Deleting an offer
  deletes its history too (ON DELETE CASCADE).

  context_id points at tasks.id or sales_items.id depending on
  context_type, so it can't have a database foreign key (one column can
  only reference one table). The app deletes a listing's offers itself
  when the listing is deleted — see services/offerClosure.service.js.

  expires_at is TIMESTAMP NULL (not NOT NULL): on MariaDB 10.4 a
  TIMESTAMP NOT NULL column with no default can silently become
  "update to now on every change", which would keep resetting expiry.

  Usage (from inside the backend folder):
    node scripts/repair-negotiation-schema.js
*/

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
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
    /* 1. Offers */
    if (!(await tableExists(pool, "offers"))) {
      await pool.execute(`
        CREATE TABLE offers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          context_type ENUM('task','sales_item') NOT NULL,
          context_id INT NOT NULL,
          offerer_id INT NOT NULL,
          owner_id INT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          message VARCHAR(300) NULL,
          last_proposed_by ENUM('offerer','owner') NOT NULL DEFAULT 'offerer',
          counter_rounds INT NOT NULL DEFAULT 0,
          status ENUM('Pending','Accepted','Declined','Withdrawn','Expired') NOT NULL DEFAULT 'Pending',
          expires_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_offers_listing (context_type, context_id, status),
          INDEX idx_offers_offerer (offerer_id, status),
          INDEX idx_offers_owner (owner_id, status),
          CONSTRAINT fk_offers_offerer FOREIGN KEY (offerer_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_offers_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created offers table");
    } else {
      console.log("offers table already present — skipping.");
    }

    /* 2. Offer history */
    if (!(await tableExists(pool, "offer_history"))) {
      await pool.execute(`
        CREATE TABLE offer_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          offer_id INT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          proposed_by ENUM('offerer','owner') NOT NULL,
          message VARCHAR(300) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_offer_history_offer (offer_id),
          CONSTRAINT fk_offer_history_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
        )
      `);
      console.log("Created offer_history table");
    } else {
      console.log("offer_history table already present — skipping.");
    }

    console.log("Negotiation schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Negotiation schema repair failed:", error.message);
  process.exit(1);
});
