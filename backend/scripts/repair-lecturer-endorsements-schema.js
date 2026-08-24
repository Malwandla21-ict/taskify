// backend/scripts/repair-lecturer-endorsements-schema.js
// Idempotent — adds Lecturer as a member_type, adds profile fields used by
// the new student/lecturer profile pages, and creates lecturer_endorsements.
// Usage: node scripts/repair-lecturer-endorsements-schema.js

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
  return Number(rows[0].count) > 0;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0].count) > 0;
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
    /* member_type: widen enum to include Lecturer. Safe to re-run — MODIFY
       COLUMN with the same target definition is a no-op on repeat runs. */
    await pool.execute(
      `ALTER TABLE users MODIFY COLUMN member_type ENUM('Student','Lecturer','Staff') NOT NULL DEFAULT 'Student'`
    );
    console.log("users.member_type now includes 'Lecturer'");

    const newUserColumns = [
      ["bio", "TEXT NULL"],
      ["skills", "JSON NULL"],
      ["services", "JSON NULL"],
      ["lecturer_title", "VARCHAR(20) NULL"],
      ["years_experience", "INT NULL"],
      ["office_location", "VARCHAR(150) NULL"],
      ["consultation_mode", "VARCHAR(150) NULL"],
      ["availability_note", "TEXT NULL"]
    ];

    for (const [col, def] of newUserColumns) {
      if (!(await columnExists(pool, "users", col))) {
        await pool.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
        console.log(`Added users.${col}`);
      } else {
        console.log(`users.${col} already exists — skipped.`);
      }
    }

    if (!(await tableExists(pool, "lecturer_endorsements"))) {
      await pool.execute(`
        CREATE TABLE lecturer_endorsements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          lecturer_id INT NOT NULL,
          endorsed_user_id INT NOT NULL,
          endorsement_type ENUM('Tutoring','Toolkit','General') NOT NULL DEFAULT 'General',
          context_type ENUM('sales_item','equipment') NULL,
          context_id INT NULL,
          message TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_endorsement_lecturer FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_endorsement_student FOREIGN KEY (endorsed_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created lecturer_endorsements table");
    } else {
      console.log("lecturer_endorsements table already exists — skipped.");
    }

    console.log("Lecturer/endorsements schema repair complete.");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});