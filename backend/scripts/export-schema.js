const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Writes the database's STRUCTURE (tables, columns, keys, indexes — no
  rows) to taskify-schema.sql in the project root, so a new empty database
  can be set up with scripts/import-schema.js.

  READ-ONLY: it only runs SHOW / SELECT queries. The one SET it runs
  changes this connection's own sql_mode, so names come out in normal
  `backtick` quotes even on servers (like Aiven) set to ANSI quoting.

  Tables are written parents-first (a table comes after every table it
  points to), so the file loads cleanly with foreign-key checks on.

  Run it after adding a repair script, against the database you just
  repaired (the root .env decides which one):

    node scripts/export-schema.js
*/

async function main() {
  console.log(`Reading structure of ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

  const ssl = process.env.DB_SSL === "true"
    ? { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) }
    : undefined;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(ssl ? { ssl } : {})
  });

  try {
    const [tables] = await connection.query(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`
    );
    const [links] = await connection.query(
      `SELECT DISTINCT table_name AS t, referenced_table_name AS rt FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL`
    );
    const [[{ version }]] = await connection.query("SELECT VERSION() AS version");
    await connection.query("SET SESSION sql_mode = ''");

    /* Parents before children. */
    const names = tables.map((row) => row.t);
    const parents = Object.fromEntries(names.map((name) => [name, new Set()]));
    for (const link of links) if (link.t !== link.rt) parents[link.t].add(link.rt);
    const ordered = [];
    const done = new Set();
    const visit = (name, path = new Set()) => {
      if (done.has(name)) return;
      if (path.has(name)) throw new Error(`Foreign keys go round in a circle at ${name}.`);
      path.add(name);
      [...parents[name]].sort().forEach((parent) => visit(parent, path));
      path.delete(name);
      done.add(name);
      ordered.push(name);
    };
    names.forEach((name) => visit(name));

    const blocks = [];
    for (const name of ordered) {
      const [[row]] = await connection.query(`SHOW CREATE TABLE \`${name}\``);
      const sql = row["Create Table"]
        .replace(/^CREATE TABLE/, "CREATE TABLE IF NOT EXISTS")
        .replace(/ AUTO_INCREMENT=\d+/, "");
      blocks.push(`-- ${name}\n${sql};`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const header = `-- Taskify database structure (tables only, no data)
--
-- Exported on ${today} (MySQL ${version}) by backend/scripts/export-schema.js.
-- ${ordered.length} tables, in an order where every table comes after the
-- tables it points to, so foreign keys can be created as it goes.
--
-- Load it into an EMPTY database with:
--   cd backend
--   node scripts/import-schema.js
--
-- Every statement is CREATE TABLE IF NOT EXISTS, so running it against a
-- database that already has these tables skips them instead of failing.
-- It never drops or changes an existing table. To bring an OLDER database
-- up to date, use the repair scripts instead:
--   node scripts/repair-all.js

SET NAMES utf8mb4;
`;
    const outPath = path.resolve(__dirname, "../../taskify-schema.sql");
    fs.writeFileSync(outPath, `${header}\n${blocks.join("\n\n")}\n`, "utf8");
    console.log(`Wrote ${ordered.length} tables to ${outPath}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
