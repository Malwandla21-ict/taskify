const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Runs a raw .sql file (e.g. a `mysqldump --no-data` structure export)
  against whatever database backend/.env currently points at.

  This exists because the native `mysql`/`mysqldump` command-line clients
  bundled with tools like XAMPP are often too old to speak MySQL 8's
  default caching_sha2_password authentication — which is exactly what
  Aiven (and most modern hosted MySQL) uses, producing an error like:

    ERROR 1045 (28000): Plugin caching_sha2_password could not be loaded

  The mysql2 driver this project already depends on implements that auth
  method in pure JavaScript, so it has no such problem — this script just
  reuses it instead of fighting with the native client.

  Usage:
    node scripts/import-schema.js [path-to-schema.sql]

  If no path is given, it looks for taskify-schema.sql in the project
  root and in backend/, in that order.
*/

function resolveSchemaPath() {
  const arg = process.argv[2];
  if (arg) return path.resolve(process.cwd(), arg);

  const candidates = [
    path.resolve(__dirname, "../../taskify-schema.sql"), // project root
    path.resolve(__dirname, "../taskify-schema.sql"),    // backend/
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) return found;

  console.error(
    "Couldn't find taskify-schema.sql automatically. Run this instead:\n" +
    "  node scripts/import-schema.js \"C:\\full\\path\\to\\taskify-schema.sql\""
  );
  process.exit(1);
}

/*
  Windows PowerShell's `>` redirection (e.g. `mysqldump ... > file.sql`)
  writes UTF-16LE by default, not UTF-8 — invisible in a text editor, but
  it turns every character into two bytes, which would send garbled SQL to
  the database if read as plain UTF-8. Detect that by its byte-order-mark
  and decode accordingly instead of assuming UTF-8.
*/
function readSqlFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const isUtf16LE = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
  const text = buf.toString(isUtf16LE ? "utf16le" : "utf8");
  return { text: text.replace(/^﻿/, ""), isUtf16LE };
}

async function main() {
  const schemaPath = resolveSchemaPath();
  const { text: fileText, isUtf16LE } = readSqlFile(schemaPath);
  let sql = fileText;
  if (isUtf16LE) console.log("Note: file was UTF-16 encoded (typical of PowerShell's `>` redirect) — decoded correctly.");

  /*
    Some export tools (phpMyAdmin, `mysqldump --databases`) bake
    `CREATE DATABASE ...` / `USE ...` statements into the dump itself,
    naming whatever the database was called wherever it was exported from
    (e.g. a local "taskify"). If left in, those statements silently
    switch the connection over to that name mid-import — ignoring the
    DB_NAME this script connected with — and the import then fails (or
    worse, half-succeeds into the wrong database) once it hits a table
    the current user has no access to under that other name. Since this
    script always wants everything to land in whatever backend/.env's
    DB_NAME currently points at, those statements are stripped rather
    than executed.
  */
  const beforeStrip = sql;
  sql = sql.replace(/^\s*CREATE DATABASE.*?;\s*$/gim, "");
  sql = sql.replace(/^\s*USE\s+\S+\s*;\s*$/gim, "");
  if (sql !== beforeStrip) {
    console.log("Note: stripped CREATE DATABASE/USE statement(s) from the dump — importing into DB_NAME from .env instead.");
  }

  const statementCount = sql.split(";").map(s => s.trim()).filter(Boolean).length;
  console.log(`Read ${schemaPath}`);
  console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT} / ${process.env.DB_NAME} ...`);

  const sslConfig = process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: !!process.env.DB_SSL_CA,
        ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {})
      }
    : undefined;

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ...(sslConfig ? { ssl: sslConfig } : {})
  });

  try {
    await connection.query(sql);
    console.log(`Success — executed ~${statementCount} statement(s) against ${process.env.DB_NAME}.`);
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
