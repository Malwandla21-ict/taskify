// backend/scripts/repair-marketplace-schema.js
// Idempotent repair for schema drift found across tasks/equipment/sales:
// - tasks is missing `section` and `image_urls`
// - equipment is missing `image_urls`
// - sales_items table doesn't exist at all
// Safe to run repeatedly.

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
    /* ── tasks ── */
    if (!(await columnExists(pool, "tasks", "section"))) {
      await pool.execute(
        `ALTER TABLE tasks ADD COLUMN section ENUM('Academic','General') NOT NULL DEFAULT 'General' AFTER category`
      );
      console.log("Added tasks.section");
    } else {
      console.log("tasks.section already exists — skipped.");
    }

    if (!(await columnExists(pool, "tasks", "image_urls"))) {
      await pool.execute(`ALTER TABLE tasks ADD COLUMN image_urls JSON NULL AFTER urgent`);
      console.log("Added tasks.image_urls");
    } else {
      console.log("tasks.image_urls already exists — skipped.");
    }

    /* ── equipment ── */
    if (!(await columnExists(pool, "equipment", "image_urls"))) {
      await pool.execute(`ALTER TABLE equipment ADD COLUMN image_urls JSON NULL AFTER is_available`);
      console.log("Added equipment.image_urls");
    } else {
      console.log("equipment.image_urls already exists — skipped.");
    }

    /* ── sales_items (missing entirely) ── */
    if (!(await tableExists(pool, "sales_items"))) {
      await pool.execute(`
        CREATE TABLE sales_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          seller_id INT NOT NULL,
          title VARCHAR(150) NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(100) NOT NULL,
          section ENUM('Academic','General') NOT NULL DEFAULT 'Academic',
          price DECIMAL(10,2) NOT NULL,
          condition_status ENUM('New','Excellent','Good','Fair','Used') NOT NULL DEFAULT 'Good',
          location VARCHAR(150) NOT NULL,
          status ENUM('Available','Sold') NOT NULL DEFAULT 'Available',
          image_urls JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_sales_items_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created sales_items table");
    } else {
      console.log("sales_items table already exists — skipped.");
    }

    console.log("Marketplace schema repair complete.");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});