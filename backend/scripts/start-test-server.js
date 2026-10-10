/*
  Starts the backend against the PRACTICE database described by
  backend/.env.test (made by scripts/make-test-env.js) — for trying changes
  in the browser without touching the live site. Emails, push and the
  Azure content check stay off because those settings are blank there.

  Usage (from backend/): node scripts/start-test-server.js
*/
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envFile = path.join(__dirname, "..", ".env.test");
if (!fs.existsSync(envFile)) throw new Error("backend/.env.test not found. Run: node scripts/make-test-env.js");
Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile)));

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST) || !/_(local|test)$/.test(process.env.DB_NAME || "")) {
  throw new Error(`Refusing to start: ${process.env.DB_NAME} on ${process.env.DB_HOST} isn't a local practice database.`);
}

console.log(`[practice] ${process.env.DB_NAME} on ${process.env.DB_HOST} — emails, push and content checks off`);
process.chdir(path.join(__dirname, ".."));
require("../src/server");
