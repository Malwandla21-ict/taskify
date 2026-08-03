const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [columns] = await pool.execute(
      "SHOW COLUMNS FROM users LIKE 'profile_photo_url'"
    );
    if (!columns.length) {
      await pool.execute(
        "ALTER TABLE users ADD COLUMN profile_photo_url VARCHAR(500) NULL AFTER phone_number"
      );
      console.log("profile_photo_url added");
    } else {
      console.log("profile_photo_url already exists");
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
