const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { mapLegacyCategory, sectionFor } = require("../src/config/categories");

/* backend/.env — the running app is started from inside backend/, so
   that's the .env holding the real DB_* values. */
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/*
  One-off clean-up for the fixed category lists (2026-10-04, panel
  feedback). Categories used to be typed in freely, so old listings have
  things like "Safety Boots", "Uniform", "pro curricular"…

  For every task, equipment listing, sales item and event whose category
  isn't on the new list (src/config/categories.js), this picks the
  closest new category from its old category + title, and sets the
  section to match. Anything it can't place goes to "Other academic" or
  "Other", depending on the section it was already in.

  No columns are added — only values change. Every change is printed so
  you can see exactly what moved. Safe to run again: listings already on
  the new list are skipped.

  Usage (from inside the backend folder):
    node scripts/repair-listing-categories-schema.js
*/

const TABLES = [
  { type: "task",      table: "tasks",       titleColumn: "title" },
  { type: "equipment", table: "equipment",   titleColumn: "name"  },
  { type: "sales",     table: "sales_items", titleColumn: "title" },
  { type: "event",     table: "events",      titleColumn: "title" }
];

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(process.env.DB_SSL === "true"
      ? { ssl: { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) } }
      : {})
  });

  try {
    for (const { type, table, titleColumn } of TABLES) {
      const [rows] = await pool.query(
        `SELECT id, category, section, ${titleColumn} AS title FROM ${table}`
      );

      let changed = 0;
      for (const row of rows) {
        const newCategory = mapLegacyCategory(type, row);
        const newSection = sectionFor(type, newCategory);
        if (newCategory === row.category && newSection === row.section) continue;

        await pool.execute(
          `UPDATE ${table} SET category = ?, section = ? WHERE id = ?`,
          [newCategory, newSection, row.id]
        );
        changed += 1;
        console.log(
          `  ${table} #${row.id} "${row.title}": "${row.category}" (${row.section}) → "${newCategory}" (${newSection})`
        );
      }
      console.log(`${table}: ${changed} of ${rows.length} listing(s) moved to the new categories.`);
    }

    console.log("Listing categories clean-up complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Listing categories clean-up failed:", error.message);
  process.exit(1);
});
