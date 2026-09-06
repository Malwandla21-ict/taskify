const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair generalizing reviews beyond Tasks to also cover
  completed Equipment rentals, and adding an updated_at column for author
  edits. See migrations/20260906_review_generalization.sql for the
  documented schema this mirrors.

  Usage: node scripts/repair-review-generalization-schema.js
*/

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function isColumnNullable(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT IS_NULLABLE FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0]?.IS_NULLABLE === "YES";
}

async function constraintExists(pool, table, constraintName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(pool, table, column, definition) {
  if (!(await columnExists(pool, table, column))) {
    await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added ${table}.${column}`);
  } else {
    console.log(`${table}.${column} already present — skipping.`);
  }
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
    if (!(await isColumnNullable(pool, "reviews", "task_id"))) {
      await pool.execute(`ALTER TABLE reviews MODIFY COLUMN task_id INT NULL`);
      console.log("Made reviews.task_id nullable");
    } else {
      console.log("reviews.task_id already nullable — skipping.");
    }

    await addColumnIfMissing(pool, "reviews", "booking_id", "INT NULL AFTER task_id");
    await addColumnIfMissing(
      pool, "reviews", "updated_at",
      "TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at"
    );

    if (!(await constraintExists(pool, "reviews", "fk_reviews_booking"))) {
      await pool.execute(
        `ALTER TABLE reviews
         ADD CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES equipment_bookings(id) ON DELETE CASCADE`
      );
      console.log("Added fk_reviews_booking");
    } else {
      console.log("fk_reviews_booking already present — skipping.");
    }

    if (!(await constraintExists(pool, "reviews", "uq_booking_reviewer"))) {
      await pool.execute(
        `ALTER TABLE reviews ADD CONSTRAINT uq_booking_reviewer UNIQUE (booking_id, reviewer_id)`
      );
      console.log("Added uq_booking_reviewer");
    } else {
      console.log("uq_booking_reviewer already present — skipping.");
    }

    console.log("Review-generalization schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
