const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for "read and tick" confirmations: creates
  user_acknowledgements, one row each time someone ticks a box from
  config/acknowledgements.js (academic honesty, selling rules, rental
  owner and renter responsibilities) — which text, which version, when,
  and for which listing or booking. Safe to run any number of times.

  Usage: node scripts/repair-acknowledgements-schema.js
*/

async function main() {
  console.log(`Target database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

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
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'user_acknowledgements'`
    );
    if (rows.length) {
      console.log("user_acknowledgements already present — skipping.");
    } else {
      await pool.execute(`
        CREATE TABLE user_acknowledgements (
          id INT NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          kind VARCHAR(60) NOT NULL,
          version VARCHAR(20) NOT NULL,
          context_type VARCHAR(40) NULL DEFAULT NULL,
          context_id INT NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_ack_user (user_id, created_at),
          KEY idx_ack_context (context_type, context_id),
          CONSTRAINT fk_ack_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
      console.log("Created user_acknowledgements");
    }
    console.log("Acknowledgements schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
