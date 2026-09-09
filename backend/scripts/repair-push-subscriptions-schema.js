const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for real browser push notifications (Web Push
  API) — the "reaches you even with the tab/browser closed" channel, on
  top of the existing in-app notifications and the email shortlist.

  Creates the push_subscriptions table: one row per browser/device a user
  has granted notification permission on. See
  migrations/20260909_push_subscriptions.sql for the documented schema
  this mirrors.

  Usage: node scripts/repair-push-subscriptions-schema.js
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
    database: process.env.DB_NAME
  });

  try {
    if (!(await tableExists(pool, "push_subscriptions"))) {
      await pool.execute(`
        CREATE TABLE push_subscriptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          endpoint TEXT NOT NULL,
          endpoint_hash CHAR(64) NOT NULL,
          p256dh VARCHAR(255) NOT NULL,
          auth VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_push_endpoint_hash (endpoint_hash),
          KEY idx_push_subscriptions_user (user_id),
          CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created push_subscriptions table");
    } else {
      console.log("push_subscriptions table already present — skipping.");
    }

    console.log("Push-subscriptions schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
