const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { LEGACY_FACULTY_MAP } = require("../src/config/faculties");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent data repair: moves users from the old, made-up faculty names
  ("Agriculture & Environmental Sciences", "Hospitality & Tourism", ...)
  onto the University of Mpumalanga's real faculties (config/faculties.js).
  "ICT" becomes the Faculty of Agriculture and Natural Sciences for
  students (that's where the School of Computing is) and "ICT Services"
  for lecturers and staff. Anything else is left alone. Running it again
  finds nothing left to change.

  Usage: node scripts/repair-ump-faculties.js
*/

async function main() {
  console.log(`Target database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

  const ssl = process.env.DB_SSL === "true"
    ? { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) }
    : undefined;

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(ssl ? { ssl } : {})
  });

  try {
    let changed = 0;
    for (const [oldName, newName] of Object.entries(LEGACY_FACULTY_MAP)) {
      const [result] = await pool.execute(`UPDATE users SET faculty = ? WHERE faculty = ?`, [newName, oldName]);
      changed += result.affectedRows;
    }
    const [students] = await pool.execute(
      `UPDATE users SET faculty = 'Faculty of Agriculture and Natural Sciences' WHERE faculty = 'ICT' AND member_type = 'Student'`
    );
    const [staff] = await pool.execute(`UPDATE users SET faculty = 'ICT Services' WHERE faculty = 'ICT'`);
    changed += students.affectedRows + staff.affectedRows;

    console.log(changed ? `Moved ${changed} account(s) onto the UMP faculty names.` : "No old faculty names left — nothing to do.");
    console.log("UMP faculties repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
