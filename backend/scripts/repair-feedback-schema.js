const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for "Help shape Taskify" feedback (see
  feedback.service.js): ideas, problems, consultation requests and offers
  to help test new features. Safe to run any number of times.

  Run this BEFORE deploying the backend code that uses this table.

  Usage: node scripts/repair-feedback-schema.js
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
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'feedback' LIMIT 1`
    );
    if (rows.length) {
      console.log("feedback table already present — skipping.");
    } else {
      await pool.execute(`
        CREATE TABLE feedback (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          kind ENUM('idea','problem','consultation','testing') NOT NULL,
          message VARCHAR(2000) NOT NULL,
          status ENUM('New','Reviewed') NOT NULL DEFAULT 'New',
          reviewed_by INT NULL DEFAULT NULL,
          reviewed_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_feedback_status (status, created_at),
          CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_feedback_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      console.log("Created feedback table.");
    }
    console.log("Feedback schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
