const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, day } = require("./helpers");
const MARKETPLACE = require("../src/config/marketplace");

let organiser, student, admin;

before(async () => {
  await start();
  organiser = await createUser({ memberType: "Staff" });
  student = await createUser();
  admin = await createUser({ role: "admin", totp: true });
});
after(stop);

const listing = (overrides = {}) => ({
  title: "Campus market day at the student centre",
  description: "Stalls selling second-hand books, clothes and snacks.",
  category: "Campus market day",
  location: "Student Centre",
  eventDate: `${day(5)}T10:00:00.000Z`,
  ...overrides
});
const post = (who, overrides) => api(who, "POST", "/events", listing(overrides));
const row = async (id) => (await query(`SELECT category, moderation_status, moderation_flags, listing_authority FROM events WHERE id = ?`, [id]))[0];

test("a marketplace listing is published straight away", async () => {
  const r = await post(student);
  assert.equal(r.status, 201, r.message);
  assert.equal((await row(r.data.id)).moderation_status, "clean");
  assert.equal(r.data.is_institutional, false);
  const list = (await api(null, "GET", "/events")).data;
  assert.ok(list.some((e) => e.id === r.data.id), "it shows on the public page");
});

test("lectures, parties, sports and club meetings can't be posted any more", async () => {
  for (const category of ["Guest Lecture / Seminar", "Social & Entertainment", "Sports & Fitness", "Society & Club Meeting"]) {
    const r = await post(student, { category });
    assert.equal(r.status, 400, category);
    assert.match(r.message, /marketplace categories/);
  }
  assert.equal((await post(student, { category: "Made-up category" })).status, 400);
});

test("an institutional listing needs a note of who authorised it", async () => {
  const r = await post(organiser, { category: "University farm-produce sale" });
  assert.equal(r.status, 400);
  assert.match(r.message, /who authorised/);
});

test("an institutional listing is held for an admin check, then shown once approved", async () => {
  const r = await post(organiser, { category: "University farm-produce sale", listingAuthority: "Farm manager, Faculty of Agriculture" });
  assert.equal(r.status, 201, r.message);
  const saved = await row(r.data.id);
  assert.equal(saved.moderation_status, "pending_review");
  assert.deepEqual(JSON.parse(saved.moderation_flags), ["institutional_listing"]);
  assert.equal(saved.listing_authority, "Farm manager, Faculty of Agriculture");

  assert.ok(!(await api(null, "GET", "/events")).data.some((e) => e.id === r.data.id), "hidden until checked");
  assert.equal((await api(student, "GET", `/events/${r.data.id}`)).status, 404);
  const admins = await query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Institutional Listing to Check' AND context_id = ?`, [admin.id, r.data.id]);
  assert.equal(Number(admins[0].n), 1, "admins are asked to check it");

  assert.equal((await api(admin, "PATCH", `/admin/moderation/event/${r.data.id}/clear`)).status, 200);
  const shown = (await api(student, "GET", `/events/${r.data.id}`)).data;
  assert.equal(shown.is_institutional, true);
  assert.equal(shown.listing_authority, "Farm manager, Faculty of Agriculture");
});

test("editing an approved institutional listing sends it back for a check", async () => {
  const r = await post(organiser, { category: "Institutional surplus sale", listingAuthority: "Procurement office, asset disposal" });
  await api(admin, "PATCH", `/admin/moderation/event/${r.data.id}/clear`);
  assert.equal((await row(r.data.id)).moderation_status, "clean");

  const edit = await api(organiser, "PUT", `/events/${r.data.id}`, listing({
    title: "Surplus office chairs sale", category: "Institutional surplus sale", listingAuthority: "Procurement office, asset disposal"
  }));
  assert.equal(edit.status, 200, edit.message);
  assert.equal((await row(r.data.id)).moderation_status, "pending_review");
});

test("old events keep their old category when edited, but can't switch to another old one", async () => {
  const created = await post(student);
  await query(`UPDATE events SET category = 'Society & Club Meeting' WHERE id = ?`, [created.data.id]);

  const keep = await api(student, "PUT", `/events/${created.data.id}`, listing({ category: "Society & Club Meeting", title: "Chess club stall" }));
  assert.equal(keep.status, 200, keep.message);
  const swap = await api(student, "PUT", `/events/${created.data.id}`, listing({ category: "Sports & Fitness" }));
  assert.equal(swap.status, 400);
  const move = await api(student, "PUT", `/events/${created.data.id}`, listing({ category: "Swap & exchange" }));
  assert.equal(move.status, 200, "moving onto a marketplace category is fine");
});

test("institutional listings can be switched off completely", async () => {
  MARKETPLACE.institutionalListingsEnabled = false;
  try {
    const r = await post(organiser, { category: "Lost-property sale or auction", listingAuthority: "Campus security, lost property office" });
    assert.equal(r.status, 403);
    assert.equal((await post(student, { category: "Swap & exchange" })).status, 201, "student listings still work");
  } finally {
    MARKETPLACE.institutionalListingsEnabled = true;
  }
});
