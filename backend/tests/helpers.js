/*
  Shared setup for the backend tests (run with `npm test` from backend/).

  The tests run the real Express app in this process against a PRACTICE
  database on your own PC, described by backend/.env.test (make it with
  `node scripts/make-test-env.js`). They refuse to start if those
  settings point anywhere other than a local *_local / *_test database,
  or if email sending is switched on — so a test run can never touch the
  live site or email real people.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

const envFile = process.env.TEST_ENV_FILE || path.join(__dirname, "..", ".env.test");
if (!fs.existsSync(envFile)) {
  throw new Error(`Test settings not found (${envFile}). Run: node scripts/make-test-env.js`);
}
Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile)));

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST) || !/_(local|test)$/.test(process.env.DB_NAME || "")) {
  throw new Error(`Refusing to run tests against ${process.env.DB_NAME} on ${process.env.DB_HOST} — tests only run on a local practice database.`);
}
if (process.env.SMTP_HOST) {
  throw new Error("Refusing to run tests with SMTP_HOST set — tests must never send real email.");
}

const app = require("../src/app");
const pool = require("../src/config/db");
const { signAccessToken } = require("../src/utils/jwt");
const { ACKNOWLEDGEMENTS } = require("../src/config/acknowledgements");

/* Every "read and tick" box, ticked at its current version — what the
   real forms send (config/acknowledgements.js). */
const ACKS = Object.fromEntries(Object.entries(ACKNOWLEDGEMENTS).map(([kind, a]) => [kind, a.version]));

let server = null;
let baseUrl = null;

async function start() {
  if (server) return;
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  await pool.end();
}

const unique = () => `${Date.now()}${crypto.randomInt(1000, 9999)}`;

/* Creates a verified test user directly in the practice database and
   signs them in. Students get a 10-digit student-number email, everyone
   else a name.surname one — the same formats UMP uses. */
async function createUser({ memberType = "Student", role = "user", totp = false, lecturerVerified = null } = {}) {
  const id = unique();
  const email = memberType === "Student"
    ? `${id.slice(-10).padStart(10, "2")}@ump.ac.za`
    : `test.${memberType.toLowerCase()}${id}@ump.ac.za`;
  const columns = ["full_name", "email", "password_hash", "role", "is_verified", "member_type", "account_role",
    "phone_number", "has_seen_onboarding", "token_version", "totp_enabled"];
  const values = [`Test ${memberType} ${id}`, email, "x", role, 1, memberType, memberType === "Student" ? "Student" : "Staff",
    "0710000000", 1, 0, totp ? 1 : 0];
  if (lecturerVerified !== null) { columns.push("lecturer_verified"); values.push(lecturerVerified ? 1 : 0); }

  const [result] = await pool.execute(
    `INSERT INTO users (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values
  );
  const user = { id: result.insertId, email, role, member_type: memberType, token_version: 0 };
  return { ...user, token: signAccessToken(user) };
}

/* Calls the API as `user` (or signed out when user is null). */
async function api(user, method, url, body) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, data: json.data, message: json.message, errors: json.errors };
}

const query = async (sql, params = []) => (await pool.query(sql, params))[0];

/* "YYYY-MM-DD" n days from today (UTC, same as the server). */
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function makeTask(owner, overrides = {}) {
  const r = await api(owner, "POST", "/tasks", {
    title: "Test task", description: "A task created by the automated tests.", category: "Other",
    section: "General", price: 150, location: "Library", urgent: false, acknowledgements: ACKS, ...overrides
  });
  if (r.status !== 201) throw new Error(`makeTask failed: ${r.status} ${r.message}`);
  return r.data;
}

async function makeSale(seller, overrides = {}) {
  const r = await api(seller, "POST", "/sales", {
    title: "Test item", description: "An item listed by the automated tests.", category: "Other",
    section: "General", price: 400, conditionStatus: "Good", location: "Library", acknowledgements: ACKS, ...overrides
  });
  if (r.status !== 201) throw new Error(`makeSale failed: ${r.status} ${r.message}`);
  return r.data;
}

async function makeEquipment(owner, overrides = {}) {
  const r = await api(owner, "POST", "/equipment", {
    name: "Test tripod", description: "Equipment listed by the automated tests.", category: "Other",
    section: "General", condition: "Functional", dailyPrice: 50, itemValue: 1000, acknowledgements: ACKS, ...overrides
  });
  if (r.status !== 201) throw new Error(`makeEquipment failed: ${r.status} ${r.message}`);
  return r.data;
}

/* The poster chooses who does each task: the worker applies (an offer at
   the listed price) and the poster accepts that application. */
async function apply(worker, task) {
  const r = await api(worker, "POST", "/offers", { contextType: "task", contextId: task.id, amount: Number(task.price) });
  if (r.status !== 201) throw new Error(`apply failed: ${r.status} ${r.message}`);
  return r.data;
}

async function assignTask(poster, worker, task) {
  const application = await apply(worker, task);
  const r = await api(poster, "PATCH", `/offers/${application.id}/accept`, { expectedAmount: Number(task.price) });
  if (r.status !== 200) throw new Error(`assignTask failed: ${r.status} ${r.message}`);
  return r;
}

/* Fires the same request `times` times at once and returns the statuses —
   used to prove that double clicks / simultaneous requests can't both win. */
async function concurrently(times, fn) {
  return Promise.all(Array.from({ length: times }, () => fn()));
}

/* Raw request (for non-JSON responses such as CSV downloads). */
async function rawFetch(user, url) {
  return fetch(baseUrl + url, { headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
}

module.exports = { start, stop, api, rawFetch, query, createUser, makeTask, makeSale, makeEquipment, apply, assignTask, concurrently, day, pool, ACKS };
