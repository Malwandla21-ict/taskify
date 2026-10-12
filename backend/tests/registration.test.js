const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { start, stop, api, query } = require("./helpers");

/*
  Sign-up rules: UMP student numbers are 9 digits and staff/lecturer
  numbers 5; a student's email is their student number; the faculty comes
  from UMP's real list. (Registration is rate-limited to 8 per hour per
  device, so this file stays at 8 sign-up calls.)
*/

before(start);
after(stop);

const nine = () => String(crypto.randomInt(200000000, 299999999));
const register = (fields) => api(null, "POST", "/auth/register", {
  fullName: "Test Person", phoneNumber: "0710000000", password: "TestPass123",
  faculty: "Faculty of Education", memberType: "Student", ...fields
});

test("a student signs up with a 9-digit student number that matches their email", async () => {
  const number = nine();
  const r = await register({ email: `${number}@ump.ac.za`, studentNumber: number });
  assert.equal(r.status, 201, r.message);
  const row = (await query(`SELECT student_number, faculty FROM users WHERE email = ?`, [`${number}@ump.ac.za`]))[0];
  assert.deepEqual(row, { student_number: number, faculty: "Faculty of Education" });
});

test("student numbers that aren't exactly 9 digits are rejected", async () => {
  for (const studentNumber of ["12345678", "1234567890"]) {
    const r = await register({ email: `${studentNumber}@ump.ac.za`, studentNumber });
    assert.equal(r.status, 400);
    assert.match(r.message, /9 digits/);
  }
});

test("a student email that doesn't match the student number is caught", async () => {
  const r = await register({ email: `${nine()}@ump.ac.za`, studentNumber: nine() });
  assert.equal(r.status, 400);
  assert.match(r.message, /match/);
});

test("lecturers and staff use a 5-digit staff number", async () => {
  const email = `reg.lecturer${crypto.randomInt(1e6, 9e6)}@ump.ac.za`;
  const wrong = await register({ email, studentNumber: nine(), memberType: "Lecturer", lecturerTitle: "Dr." });
  assert.equal(wrong.status, 400);
  assert.match(wrong.message, /5 digits/);

  const ok = await register({ email, studentNumber: "54321", memberType: "Lecturer", lecturerTitle: "Dr.", faculty: "ICT Services" });
  assert.equal(ok.status, 201, ok.message);
});

test("a student must pick one of UMP's faculties, not a made-up or staff one", async () => {
  const number = nine();
  const r = await register({ email: `${number}@ump.ac.za`, studentNumber: number, faculty: "Hospitality & Tourism" });
  assert.equal(r.status, 400);
  assert.match(r.message, /faculty/i);
});
