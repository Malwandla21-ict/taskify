const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeTask } = require("./helpers");
const FEATURES = require("../src/config/features");

let student, other, admin, verifiedLecturer, unverifiedLecturer;

before(async () => {
  await start();
  student = await createUser();
  other = await createUser();
  admin = await createUser({ role: "admin", totp: true });
  verifiedLecturer = await createUser({ memberType: "Lecturer", lecturerVerified: true });
  unverifiedLecturer = await createUser({ memberType: "Lecturer", lecturerVerified: false });
  await query(`UPDATE users SET lecturer_title = 'Dr' WHERE id IN (?, ?)`, [verifiedLecturer.id, unverifiedLecturer.id]);
});
after(stop);

/* ── Privacy of contact details ── */

test("a profile's email, phone and student number are only shown to that person and admins", async () => {
  const url = `/users/${student.id}/profile`;
  for (const who of [null, other, verifiedLecturer]) {
    const r = await api(who, "GET", url);
    assert.equal(r.status, 200);
    for (const field of ["email", "phone_number", "student_number"]) {
      assert.equal(field in r.data, false, `${field} hidden from ${who ? "another user" : "a signed-out visitor"}`);
    }
  }
  for (const who of [student, admin]) {
    const r = await api(who, "GET", url);
    assert.equal(r.data.email, student.email, "visible to the person themselves and to admins");
    assert.equal(r.data.phone_number, "0710000000");
  }
});

/* ── Verified lecturer badge and title ── */

test("the lecturer title and badge only show for verified lecturers", async () => {
  const unverifiedTask = await makeTask(unverifiedLecturer);
  const verifiedTask = await makeTask(verifiedLecturer);

  const u = (await api(null, "GET", `/tasks/${unverifiedTask.id}`)).data;
  assert.equal(Number(u.created_by_lecturer_verified), 0);
  assert.equal(u.created_by_lecturer_title, null, "an unverified lecturer's self-chosen title isn't shown");

  const v = (await api(null, "GET", `/tasks/${verifiedTask.id}`)).data;
  assert.equal(Number(v.created_by_lecturer_verified), 1);
  assert.equal(v.created_by_lecturer_title, "Dr");

  const profile = (await api(other, "GET", `/users/${unverifiedLecturer.id}/profile`)).data;
  assert.equal(profile.lecturer_verified, false);
  assert.equal(profile.lecturer_title, null);
  const own = (await api(unverifiedLecturer, "GET", `/users/${unverifiedLecturer.id}/profile`)).data;
  assert.equal(own.lecturer_title, "Dr", "they still see their own title");
});

/* ── Endorsements switch (off by default) ── */

test("endorsements are off by default, and the server refuses them even when called directly", async () => {
  assert.equal(FEATURES.endorsements, false);
  const features = await api(null, "GET", "/features");
  assert.equal(features.data.endorsements, false);
  assert.equal(features.data.feedback, true);

  const task = await makeTask(student);
  const give = await api(verifiedLecturer, "POST", "/lecturer/endorsements", {
    endorsedUserId: student.id, endorsementType: "General", contextType: "task", contextId: task.id, message: "Great work."
  });
  assert.equal(give.status, 403);
  assert.match(give.message, /switched off/);
  assert.equal((await api(student, "GET", "/lecturer/endorsed-students")).status, 403);
});

test("turning endorsements off hides existing ones everywhere", async () => {
  const task = await makeTask(student);
  FEATURES.endorsements = true;
  try {
    const give = await api(verifiedLecturer, "POST", "/lecturer/endorsements", {
      endorsedUserId: student.id, endorsementType: "General", contextType: "task", contextId: task.id, message: "Great work."
    });
    assert.equal(give.status, 201, give.message);
    const shown = (await api(null, "GET", `/tasks/${task.id}`)).data;
    assert.ok(shown.endorsed_by_lecturer_name, "visible while the switch is on");
  } finally {
    FEATURES.endorsements = false;
  }
  const hidden = (await api(null, "GET", `/tasks/${task.id}`)).data;
  assert.equal(hidden.endorsed_by_lecturer_name, undefined, "hidden once switched off");
  assert.deepEqual((await api(other, "GET", `/users/${student.id}/profile`)).data.endorsements_received, []);
});

/* ── Help shape Taskify (feedback) ── */

test("signed-in users can send feedback; it's checked and limited", async () => {
  assert.equal((await api(null, "POST", "/feedback", { kind: "idea", message: "Please add dark mode to the app." })).status, 401);
  assert.equal((await api(student, "POST", "/feedback", { kind: "spam", message: "Please add dark mode to the app." })).status, 400);
  assert.equal((await api(student, "POST", "/feedback", { kind: "idea", message: "short" })).status, 400);

  const sent = await api(verifiedLecturer, "POST", "/feedback", { kind: "testing", message: "Happy to help test the rentals flow with my class." });
  assert.equal(sent.status, 201, sent.message);
  const told = await query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'New Feedback'`, [admin.id]);
  assert.ok(Number(told[0].n) >= 1, "admins are told");

  const sender = await createUser();
  for (let i = 0; i < 5; i++) {
    assert.equal((await api(sender, "POST", "/feedback", { kind: "idea", message: `Idea number ${i} for Taskify.` })).status, 201);
  }
  assert.equal((await api(sender, "POST", "/feedback", { kind: "idea", message: "One idea too many today." })).status, 429);
});

test("only admins see feedback, and marking it reviewed happens once and is audit-logged", async () => {
  const sent = await api(student, "POST", "/feedback", { kind: "problem", message: "The rental dates picker is confusing." });
  for (const who of [student, verifiedLecturer]) assert.equal((await api(who, "GET", "/admin/feedback")).status, 403);

  const list = (await api(admin, "GET", "/admin/feedback?status=New")).data;
  const mine = list.find((f) => f.id === sent.data.id);
  assert.ok(mine);
  assert.equal(mine.kind_label, "Something isn't working");
  assert.equal("email" in mine, false, "the list shows names, not email addresses");

  assert.equal((await api(admin, "PATCH", `/admin/feedback/${sent.data.id}/reviewed`)).status, 200);
  assert.equal((await api(admin, "PATCH", `/admin/feedback/${sent.data.id}/reviewed`)).status, 400);
  const logged = await query(`SELECT COUNT(*) AS n FROM admin_audit_logs WHERE action = 'feedback.reviewed' AND target_id = ?`, [sent.data.id]);
  assert.equal(Number(logged[0].n), 1);
});

test("sending feedback gives no extra permissions", async () => {
  const sender = await createUser();
  await api(sender, "POST", "/feedback", { kind: "consultation", message: "I'd like to help decide the late-fee policy." });
  assert.equal((await api(sender, "GET", "/admin/feedback")).status, 403);
  assert.equal((await api(sender, "GET", "/lecturer/stats")).status, 403);
});
