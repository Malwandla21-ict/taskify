// backend/scripts/repair-endorsement-context-types.js
// Widens lecturer_endorsements.context_type to also cover tasks and events.
// Idempotent — only adds missing values, never removes any.
// Usage: node scripts/repair-endorsement-context-types.js

const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { widenEnum } = require("./lib/widen-enum");

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
    await widenEnum(pool, "lecturer_endorsements", "context_type", ["sales_item", "equipment", "task", "event"], "NULL");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});