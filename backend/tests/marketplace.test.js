const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, day } = require("./helpers");
const MARKETPLACE = require("../src/config/marketplace");

let organiser, student, admin, adminWithout2fa;

before(async () => {
  await start();
  organiser = await createUser({ memberType: "Staff" });
  student = await createUser();
  admin = await createUser({ role: "admin", totp: true });
  adminWithout2fa = await createUser({ role: "admin" });
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

/* The older rule, where anyone could post (config/marketplace.js adminsOnlyPosting off). */
async function withOpenPosting(work) {
  MARKETPLACE.adminsOnlyPosting = false;
  try { return await work(); } finally { MARKETPLACE.adminsOnlyPosting = true; }
}

/* ── Who can post ── */

test("only admins (with two-factor sign-in) can post — enforced by the server", async () => {
  for (const who of [student, organiser, adminWithout2fa]) {
    const r = await post(who);
    assert.equal(r.status, 403, `${who.role}/${who.member_type} must not post`);
  }
  assert.match((await post(student)).message, /posted by Taskify admins/);
  const r = await post(admin);
  assert.equal(r.status, 201, r.message);
  assert.equal((await api(null, "GET", "/features")).data.marketplaceAdminsOnly, true, "the website is told, so it hides the buttons");
});

test("students can still browse and say they're going", async () => {
  const r = await post(admin);
  assert.ok((await api(null, "GET", "/events")).data.some((e) => e.id === r.data.id));
  assert.equal((await api(student, "POST", `/events/${r.data.id}/rsvp`)).status < 300, true);
});

test("someone who posted before the change can delete their listing, but not edit it", async () => {
  const old = await withOpenPosting(() => post(student));
  assert.equal(old.status, 201, old.message);
  assert.equal((await api(student, "PUT", `/events/${old.data.id}`, listing({ title: "Changed" }))).status, 403);
  assert.equal((await api(student, "DELETE", `/events/${old.data.id}`)).status, 200);
});

/* ── What can be posted ── */

test("a marketplace listing is published straight away", async () => {
  const r = await post(admin);
  assert.equal(r.status, 201, r.message);
  assert.equal((await row(r.data.id)).moderation_status, "clean");
  assert.equal(r.data.is_institutional, false);
  const list = (await api(null, "GET", "/events")).data;
  assert.ok(list.some((e) => e.id === r.data.id), "it shows on the public page");
});

test("lectures, parties, sports and club meetings can't be posted any more", async () => {
  for (const category of ["Guest Lecture / Seminar", "Social & Entertainment", "Sports & Fitness", "Society & Club Meeting"]) {
    const r = await post(admin, { category });
    assert.equal(r.status, 400, category);
    assert.match(r.message, /marketplace categories/);
  }
  assert.equal((await post(admin, { category: "Made-up category" })).status, 400);
});

test("an institutional listing needs a note of who authorised it", async () => {
  const r = await post(admin, { category: "University farm-produce sale" });
  assert.equal(r.status, 400);
  assert.match(r.message, /who authorised/);
});

test("an admin's institutional listing is shown straight away, with who authorised it on record", async () => {
  const r = await post(admin, { category: "University farm-produce sale", listingAuthority: "Farm manager, Faculty of Agriculture" });
  assert.equal(r.status, 201, r.message);
  const saved = await row(r.data.id);
  assert.equal(saved.moderation_status, "clean", "the admin posting it is the check");
  assert.equal(saved.listing_authority, "Farm manager, Faculty of Agriculture");
  const shown = (await api(student, "GET", `/events/${r.data.id}`)).data;
  assert.equal(shown.is_institutional, true);
  assert.equal(shown.listing_authority, "Farm manager, Faculty of Agriculture");
});

test("if posting is opened up again, someone else's institutional listing is held for an admin check", async () => {
  await withOpenPosting(async () => {
    const r = await post(organiser, { category: "University farm-produce sale", listingAuthority: "Farm manager, Faculty of Agriculture" });
    assert.equal(r.status, 201, r.message);
    const saved = await row(r.data.id);
    assert.equal(saved.moderation_status, "pending_review");
    assert.deepEqual(JSON.parse(saved.moderation_flags), ["institutional_listing"]);

    assert.ok(!(await api(null, "GET", "/events")).data.some((e) => e.id === r.data.id), "hidden until checked");
    assert.equal((await api(student, "GET", `/events/${r.data.id}`)).status, 404);
    const admins = await query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Institutional Listing to Check' AND context_id = ?`, [admin.id, r.data.id]);
    assert.equal(Number(admins[0].n), 1, "admins are asked to check it");

    assert.equal((await api(admin, "PATCH", `/admin/moderation/event/${r.data.id}/clear`)).status, 200);
    const edit = await api(organiser, "PUT", `/events/${r.data.id}`, listing({
      title: "Farm veggie boxes", category: "University farm-produce sale", listingAuthority: "Farm manager, Faculty of Agriculture"
    }));
    assert.equal(edit.status, 200, edit.message);
    assert.equal((await row(r.data.id)).moderation_status, "pending_review", "an edit goes back for a check");
  });
});

test("old events keep their old category when edited, but can't switch to another old one", async () => {
  const created = await post(admin);
  await query(`UPDATE events SET category = 'Society & Club Meeting' WHERE id = ?`, [created.data.id]);

  const keep = await api(admin, "PUT", `/events/${created.data.id}`, listing({ category: "Society & Club Meeting", title: "Chess club stall" }));
  assert.equal(keep.status, 200, keep.message);
  const swap = await api(admin, "PUT", `/events/${created.data.id}`, listing({ category: "Sports & Fitness" }));
  assert.equal(swap.status, 400);
  const move = await api(admin, "PUT", `/events/${created.data.id}`, listing({ category: "Swap & exchange" }));
  assert.equal(move.status, 200, "moving onto a marketplace category is fine");
});

test("institutional listings can be switched off completely", async () => {
  MARKETPLACE.institutionalListingsEnabled = false;
  try {
    const r = await post(admin, { category: "Lost-property sale or auction", listingAuthority: "Campus security, lost property office" });
    assert.equal(r.status, 403);
    assert.equal((await post(admin, { category: "Swap & exchange" })).status, 201, "other listings still work");
  } finally {
    MARKETPLACE.institutionalListingsEnabled = true;
  }
});
