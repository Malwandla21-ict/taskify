/* Creates (or puts back) the test student account the video logs in with,
   on the LOCAL practice database only (backend/.env.test). Run before every
   recording: the forgot-password test changes the password, and the
   wrong-password test bumps the failed-attempt counter, so each take starts
   from the same clean state.

     npm run account

   The passwords are made once and kept in test-account.json (git-ignored),
   so they never appear in the repo. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.resolve(ROOT, "..", "backend");
const backendRequire = createRequire(path.join(BACKEND, "package.json"));
const dotenv = backendRequire("dotenv");
const mysql = backendRequire("mysql2/promise");
const bcrypt = backendRequire("bcrypt");

const ACCOUNT_FILE = path.join(ROOT, "test-account.json");

function makePassword() {
  // Letters + digits, so it always meets the "a letter and a number" rule.
  return `Tsk${crypto.randomBytes(4).toString("hex")}7`;
}

export function loadAccount() {
  if (fs.existsSync(ACCOUNT_FILE)) return JSON.parse(fs.readFileSync(ACCOUNT_FILE, "utf8"));
  const account = {
    fullName: "Sipho Mahlangu",
    studentNumber: "202314587",
    email: "202314587@ump.ac.za",
    password: makePassword(),
    newPassword: makePassword(),
    wrongPassword: "WrongPass123"
  };
  fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2));
  return account;
}

export async function setupAccount() {
  const env = dotenv.parse(fs.readFileSync(path.join(BACKEND, ".env.test")));
  if (!["127.0.0.1", "localhost"].includes(env.DB_HOST) || !/_(local|test)$/.test(env.DB_NAME || "")) {
    throw new Error(`Refusing: ${env.DB_NAME} on ${env.DB_HOST} isn't a local practice database.`);
  }
  const account = loadAccount();
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME
  });
  try {
    const hash = await bcrypt.hash(account.password, 10);
    const [rows] = await conn.query(`SELECT id FROM users WHERE email = ?`, [account.email]);
    const clean = {
      full_name: account.fullName, password_hash: hash, role: "user", is_verified: 1,
      member_type: "Student", account_role: "Student", student_number: account.studentNumber,
      faculty: "Faculty of Agriculture and Natural Sciences", academic_year: "3rd Year",
      has_seen_onboarding: 1, totp_enabled: 0, failed_login_attempts: 0, lockout_until: null,
      password_reset_token_hash: null, password_reset_expires: null
    };
    if (rows.length) {
      const cols = Object.keys(clean);
      await conn.query(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => clean[c]), rows[0].id]);
      console.log(`Reset test account ${account.email} (id ${rows[0].id}).`);
    } else {
      const row = { email: account.email, ...clean };
      const cols = Object.keys(row);
      const [r] = await conn.query(`INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => row[c]));
      console.log(`Created test account ${account.email} (id ${r.insertId}).`);
    }
  } finally {
    await conn.end();
  }
  return account;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await setupAccount();
  console.log(`Logins are in ${path.relative(process.cwd(), ACCOUNT_FILE)}`);
}
