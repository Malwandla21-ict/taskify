const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for Stage 3 of the 2FA rollout: "remember this
  device" for 30 days (student/lecturer optional 2FA only — never admin,
  whose 2FA stays mandatory on every login regardless of device history).

  Creates the trusted_devices table. See migrations/20260906_trusted_devices.sql
  for the documented schema this mirrors.

  Usage: node scripts/repair-trusted-devices-schema.js
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
    if (!(await tableExists(pool, "trusted_devices"))) {
      await pool.execute(`
        CREATE TABLE trusted_devices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          token_hash VARCHAR(64) NOT NULL,
          device_label VARCHAR(150) NULL,
          ip_address VARCHAR(45) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          last_used_at TIMESTAMP NULL,
          UNIQUE KEY uniq_trusted_device_token (token_hash),
          KEY idx_trusted_devices_user (user_id),
          CONSTRAINT fk_trusted_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created trusted_devices table");
    } else {
      console.log("trusted_devices table already present — skipping.");
    }

    console.log("Trusted-devices schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
