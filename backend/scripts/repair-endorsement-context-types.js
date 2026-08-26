// backend/scripts/repair-endorsement-context-types.js
// Widens lecturer_endorsements.context_type to also cover tasks and events.
// Idempotent — MODIFY COLUMN is safe to re-run.
// Usage: node scripts/repair-endorsement-context-types.js

const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function repair() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await pool.execute(
      `ALTER TABLE lecturer_endorsements MODIFY COLUMN context_type ENUM('sales_item','equipment','task','event') NULL`
    );
    console.log("lecturer_endorsements.context_type now includes 'task' and 'event'.");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});