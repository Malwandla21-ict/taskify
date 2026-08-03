const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  try {
    const [rows] = await pool.execute(
      "SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY status"
    );
    console.table(rows);
    const [table] = await pool.execute("SHOW CREATE TABLE tasks");
    console.log(table[0]["Create Table"]);
  } finally {
    await pool.end();
  }
}

inspect().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
