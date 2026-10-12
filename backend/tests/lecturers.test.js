const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { start, stop, api, query, createUser } = require("./helpers");

let admin, student;

before(async () => {
  await start();
  admin = await createUser({ role: "admin", totp: true });
  student = await createUser();
});
after(stop);

const register = (email, memberType) => api(null, "POST", "/auth/register", {
  fullName: "Test Person", email, phoneNumber: "0710000000", password: "TestPass123",
  studentNumber: memberType === "Student" ? email.split("@")[0] : "12345", memberType
});

test("a student-number email can't sign up as a lecturer or staff member", async () => {
  for (const memberType of ["Lecturer", "Staff"]) {
    const r = await register(`20${crypto.randomInt(10000000, 99999999)}@ump.ac.za`, memberType);
    assert.equal(r.status, 400, `${memberType}: ${r.message}`);
  }
});

test("a name.surname email can sign up as a lecturer, but starts unverified", async () => {
  const email = `new.lecturer${crypto.randomInt(1e6, 9e6)}@ump.ac.za`;
  const r = await register(email, "Lecturer");
  assert.equal(r.status, 201, r.message);
  const row = (await query(`SELECT member_type, lecturer_verified FROM users WHERE email = ?`, [email]))[0];
  assert.equal(row.member_type, "Lecturer");
  assert.equal(Number(row.lecturer_verified), 0);
});

test("an unverified lecturer can't use lecturer-only features", async () => {
  const lecturer = await createUser({ memberType: "Lecturer", lecturerVerified: false });
  const r = await api(lecturer, "GET", "/lecturer/stats");
  assert.equal(r.status, 403);
  assert.match(r.message, /verif/i);
});

test("only an admin can verify a lecturer, and verifying unlocks lecturer features", async () => {
  const lecturer = await createUser({ memberType: "Lecturer", lecturerVerified: false });

  for (const who of [student, lecturer]) {
    const r = await api(who, "PATCH", `/admin/users/${lecturer.id}/verify-lecturer`);
    assert.equal(r.status, 403, "non-admins can't verify anyone (including themselves)");
  }

  const verified = await api(admin, "PATCH", `/admin/users/${lecturer.id}/verify-lecturer`);
  assert.equal(verified.status, 200, verified.message);
  assert.equal((await api(lecturer, "GET", "/lecturer/stats")).status, 200);

  const revoked = await api(admin, "PATCH", `/admin/users/${lecturer.id}/unverify-lecturer`);
  assert.equal(revoked.status, 200, revoked.message);
  assert.equal((await api(lecturer, "GET", "/lecturer/stats")).status, 403);
});

test("an admin can't verify someone who isn't a lecturer", async () => {
  const r = await api(admin, "PATCH", `/admin/users/${student.id}/verify-lecturer`);
  assert.equal(r.status, 400);
});

test("students still can't use lecturer features", async () => {
  assert.equal((await api(student, "GET", "/lecturer/stats")).status, 403);
});
