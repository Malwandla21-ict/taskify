const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Bootstrapping tool for the very first admin account — deliberately a CLI
  script, not an API endpoint, since there's no admin yet to gate that
  endpoint behind. Run this once on a machine with DB access; after that,
  the first admin can promote further admins through PATCH
  /api/admin/users/:userId/promote, which is properly authenticated and
  audit-logged.

  Usage:
    node scripts/create-admin.js promote <email>
    node scripts/create-admin.js create <fullName> <email> <password> [phoneNumber]
*/

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || !["promote", "create"].includes(command)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    if (command === "promote") {
      const [email] = args;
      if (!email) { printUsage(); process.exitCode = 1; return; }
      await promoteExistingUser(pool, email);
    } else {
      const [fullName, email, password, phoneNumber] = args;
      if (!fullName || !email || !password) { printUsage(); process.exitCode = 1; return; }
      await createNewAdmin(pool, fullName, email, password, phoneNumber || null);
    }
  } finally {
    await pool.end();
  }
}

function printUsage() {
  console.log(`
Usage:
  node scripts/create-admin.js promote <email>
  node scripts/create-admin.js create <fullName> <email> <password> [phoneNumber]

Examples:
  node scripts/create-admin.js promote s202312345@ump.ac.za
  node scripts/create-admin.js create "Site Admin" admin@ump.ac.za StrongPass123 0821234567
`);
}

async function promoteExistingUser(pool, email) {
  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT id, full_name, role FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  if (!rows.length) {
    console.error(`No user found with email ${normalizedEmail}.`);
    process.exitCode = 1;
    return;
  }

  const user = rows[0];

  if (user.role === "admin") {
    console.log(`${user.full_name} (${normalizedEmail}) is already an admin.`);
    return;
  }

  await pool.execute(`UPDATE users SET role = 'admin' WHERE id = ?`, [user.id]);
  console.log(`${user.full_name} (${normalizedEmail}) is now an admin.`);
  console.log("Note: admin routes now require two-factor authentication. Log in and enable it under Profile > Security before using admin actions.");
}

async function createNewAdmin(pool, fullName, email, password, phoneNumber) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail.includes("@")) {
    console.error("Please provide a valid email address.");
    process.exitCode = 1;
    return;
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters long.");
    process.exitCode = 1;
    return;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]
  );
  if (existing.length) {
    console.error(`A user with email ${normalizedEmail} already exists. Use "promote" instead.`);
    process.exitCode = 1;
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [fullName.trim(), normalizedEmail, phoneNumber, hashedPassword]
    );
    console.log(`Admin account created: ${fullName} (${normalizedEmail}), id ${result.insertId}.`);
    console.log("Note: admin routes now require two-factor authentication. Log in and enable it under Profile > Security before using admin actions.");
  } catch (error) {
    if (error.code === "ER_NO_DEFAULT_FOR_FIELD" || error.code === "ER_BAD_NULL_ERROR") {
      console.error(
        "Your users table requires a phone number. Re-run with a phone number as the 4th argument, e.g.:\n" +
        `  node scripts/create-admin.js create "${fullName}" ${normalizedEmail} <password> 0821234567`
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});