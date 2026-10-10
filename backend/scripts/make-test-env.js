const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

/*
  Creates the settings the automated tests use (backend/.env.test) and a
  matching MySQL setup file (backend/.env.test-setup.sql), so the tests
  run against a PRACTICE database on your own PC — never the live one.

  Both files are git-ignored (they hold a generated local password).
  Every setting found in backend/.env is written out, with every external
  service (email, Cloudinary, Azure, push) left blank, because dotenv
  never overrides a value that is already set — so nothing from the live
  .env can leak into a test run.

  Usage (from backend/):
    node scripts/make-test-env.js
  then, in Command Prompt, run the printed mysql command and type your
  MySQL root password when asked.
*/

const backendDir = path.resolve(__dirname, "..");
const liveEnvPath = path.join(backendDir, ".env");
const live = fs.existsSync(liveEnvPath) ? dotenv.parse(fs.readFileSync(liveEnvPath)) : {};

const dbPassword = crypto.randomBytes(18).toString("base64url");
const local = {
  NODE_ENV: "test",
  PORT: "5000",
  CLIENT_URL: "http://localhost:5501",
  APP_URL: "http://localhost:5501",
  DB_HOST: "127.0.0.1",
  DB_PORT: "3306",
  DB_USER: "taskify_test",
  DB_PASSWORD: dbPassword,
  DB_NAME: "taskify_local",
  DB_SSL: "false",
  DB_SSL_CA: "",
  JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  JWT_EXPIRES_IN: "1d",
  UNIVERSITY_EMAIL_DOMAIN: "ump.ac.za",
  TOTP_ISSUER: "Taskify (local test)",
  TOTP_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
  SKIP_EMAIL_VERIFICATION: "",
  TZ: "UTC"
};

const lines = ["# LOCAL TESTING ONLY — practice database on this PC. Not the live site."];
for (const key of new Set([...Object.keys(local), ...Object.keys(live)])) {
  lines.push(`${key}=${key in local ? local[key] : ""}`); // external services left blank
}
fs.writeFileSync(path.join(backendDir, ".env.test"), lines.join("\n") + "\n");

const setupSql = path.join(backendDir, ".env.test-setup.sql");
fs.writeFileSync(setupSql, [
  "CREATE DATABASE IF NOT EXISTS taskify_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
  `CREATE USER IF NOT EXISTS 'taskify_test'@'localhost' IDENTIFIED BY '${dbPassword}';`,
  `CREATE USER IF NOT EXISTS 'taskify_test'@'127.0.0.1' IDENTIFIED BY '${dbPassword}';`,
  `ALTER USER 'taskify_test'@'localhost' IDENTIFIED BY '${dbPassword}';`,
  `ALTER USER 'taskify_test'@'127.0.0.1' IDENTIFIED BY '${dbPassword}';`,
  "GRANT ALL PRIVILEGES ON taskify_local.* TO 'taskify_test'@'localhost';",
  "GRANT ALL PRIVILEGES ON taskify_local.* TO 'taskify_test'@'127.0.0.1';",
  "FLUSH PRIVILEGES;",
  "SELECT 'Practice database ready' AS result;"
].join("\n") + "\n");

console.log("Wrote backend/.env.test and backend/.env.test-setup.sql (both git-ignored).");
console.log("Now run this in Command Prompt and type your MySQL root password:");
console.log(`"C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe" -u root -p -e "source ${setupSql.replace(/\\/g, "/")}"`);
