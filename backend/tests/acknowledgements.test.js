const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeTask, makeSale, makeEquipment, day, ACKS } = require("./helpers");

/*
  "Read and tick" confirmations (config/acknowledgements.js): the server
  refuses the action without the tick at the current version, and records
  who ticked what, so nobody can later say they weren't told.
*/

let student, owner, admin;

before(async () => {
  await start();
  student = await createUser();
  owner = await createUser();
  admin = await createUser({ role: "admin", totp: true });
});
after(stop);

const acksFor = async (userId) => query(
  `SELECT kind, version, context_type, context_id FROM user_acknowledgements WHERE user_id = ? ORDER BY id`, [userId]
);

test("the texts and their versions are public, so the page shows exactly what gets recorded", async () => {
  const r = await api(null, "GET", "/acknowledgements");
  assert.equal(r.status, 200);
  for (const kind of ["academic_integrity", "selling_rules", "rental_owner", "rental_renter"]) {
    assert.ok(r.data[kind].points.length > 0, kind);
    assert.equal(r.data[kind].version, ACKS[kind]);
  }
});

test("an academic task can't be posted without the academic-honesty tick; a general one doesn't need it", async () => {
  const academic = { category: "Tutoring & Study Help" };
  const refused = await api(student, "POST", "/tasks", {
    title: "Help with calculus", description: "Explain limits before my test.", price: 100, location: "Library", ...academic
  });
  assert.equal(refused.status, 400);
  assert.match(refused.message, /Academic honesty/);

  const task = await makeTask(student, academic);
  const rows = await acksFor(student.id);
  assert.ok(rows.some(r => r.kind === "academic_integrity" && r.context_type === "task" && Number(r.context_id) === Number(task.id)));

  const general = await makeTask(student, { category: "Errands & Deliveries", acknowledgements: undefined });
  assert.ok(general.id, "a general task posts without any tick");
});

test("an out-of-date tick is refused, so people re-read changed rules", async () => {
  const r = await api(student, "POST", "/sales", {
    title: "Old textbook", description: "Second-hand, some notes inside.", category: "Textbooks",
    price: 120, conditionStatus: "Good", location: "Library", acknowledgements: { selling_rules: "2000-01-01" }
  });
  assert.equal(r.status, 400);
  assert.match(r.message, /updated/);
});

test("selling, listing a rental and requesting a rental each need their tick, and each is recorded", async () => {
  const noTick = await api(owner, "POST", "/sales", {
    title: "Desk lamp", description: "Works fine, LED bulb.", category: "Other",
    price: 80, conditionStatus: "Good", location: "Residence"
  });
  assert.equal(noTick.status, 400);

  const item = await makeSale(owner);
  const equipment = await makeEquipment(owner);

  const bookNoTick = await api(student, "POST", `/equipment/${equipment.id}/book`, { startDate: day(1), endDate: day(2) });
  assert.equal(bookNoTick.status, 400);
  const booked = await api(student, "POST", `/equipment/${equipment.id}/book`, { startDate: day(1), endDate: day(2), acknowledgements: ACKS });
  assert.equal(booked.status, 201, booked.message);

  const ownerRows = await acksFor(owner.id);
  assert.ok(ownerRows.some(r => r.kind === "selling_rules" && Number(r.context_id) === Number(item.id)));
  assert.ok(ownerRows.some(r => r.kind === "rental_owner" && Number(r.context_id) === Number(equipment.id)));
  const renterRows = await acksFor(student.id);
  assert.ok(renterRows.some(r => r.kind === "rental_renter" && r.context_type === "equipment_booking"));
});

test("a missing field is reported before a missing tick", async () => {
  const r = await api(owner, "POST", "/sales", { description: "No title here.", category: "Other", price: 50, location: "Library" });
  assert.equal(r.status, 400);
  assert.match(r.message, /Title/);
});

test("only admins can see what someone agreed to", async () => {
  assert.equal((await api(student, "GET", `/admin/users/${owner.id}/acknowledgements`)).status, 403);
  const r = await api(admin, "GET", `/admin/users/${owner.id}/acknowledgements`);
  assert.equal(r.status, 200);
  assert.ok(r.data.some(a => a.kind === "selling_rules" && a.title === "Before you sell"));
});
