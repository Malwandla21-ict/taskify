// backend/scripts/repair-academic-fields.js
const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].count > 0;
}

async function addColumnIfMissing(pool, table, column, definition) {
  if (await columnExists(pool, table, column)) {
    console.log(`'${table}.${column}' already exists — skipped.`);
    return;
  }
  await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Added '${table}.${column}'.`);
}

async function repair() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await addColumnIfMissing(pool, "users", "student_number", "VARCHAR(30) NULL");
    await addColumnIfMissing(pool, "users", "account_role", "ENUM('Student','Staff') NOT NULL DEFAULT 'Student'");
    await addColumnIfMissing(pool, "users", "faculty", "VARCHAR(150) NULL");
    await addColumnIfMissing(pool, "users", "academic_year", "VARCHAR(30) NULL");
    console.log("Academic fields repair complete.");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});