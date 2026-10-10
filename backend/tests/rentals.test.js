const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeEquipment, day } = require("./helpers");

let owner, renter, outsider;

before(async () => {
  await start();
  owner = await createUser();
  renter = await createUser();
  outsider = await createUser();
});
after(stop);

const book = (who, equipmentId, startDate = day(1), endDate = day(2)) =>
  api(who, "POST", `/equipment/${equipmentId}/book`, { startDate, endDate });
const bookingRow = async (id) => (await query(`SELECT status, payment_status, deposit_status FROM equipment_bookings WHERE id = ?`, [id]))[0];

test("an owner can't book their own equipment", async () => {
  const item = await makeEquipment(owner);
  const r = await book(owner, item.id);
  assert.equal(r.status, 400);
});

test("a booking can't start in the past", async () => {
  const item = await makeEquipment(owner);
  const r = await book(renter, item.id, day(-3), day(-1));
  assert.equal(r.status, 400, r.message);
});

test("the end date can't be before the start date", async () => {
  const item = await makeEquipment(owner);
  const r = await book(renter, item.id, day(3), day(2));
  assert.ok(r.status >= 400);
});

test("several renters booking at the same moment: only one booking goes through", async () => {
  const item = await makeEquipment(owner);
  const renters = await Promise.all(Array.from({ length: 5 }, () => createUser()));
  const results = await Promise.all(renters.map((u) => book(u, item.id)));
  assert.equal(results.filter((r) => r.status === 201).length, 1, `statuses: ${results.map((r) => r.status)}`);
  const active = await query(
    `SELECT COUNT(*) AS n FROM equipment_bookings WHERE equipment_id = ? AND status IN ('Pending', 'Confirmed')`, [item.id]
  );
  assert.equal(Number(active[0].n), 1);
});

test("each step can only be done by the right person, in the right order", async () => {
  const item = await makeEquipment(owner);
  const booking = (await book(renter, item.id)).data;

  for (const who of [renter, outsider]) {
    assert.ok((await api(who, "PATCH", `/equipment/bookings/${booking.id}/confirm`)).status >= 400, "only the owner confirms");
  }
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/confirm`)).status, 200);

  const photos = { photoUrls: ["https://example.com/condition.jpg"], pickupCondition: "Functional" };
  assert.ok((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/return`, photos)).status >= 400, "can't return before pickup");
  for (const who of [owner, outsider]) {
    assert.ok((await api(who, "PATCH", `/equipment/bookings/${booking.id}/pickup`, photos)).status >= 400, "only the renter confirms pickup");
  }
  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/pickup`, photos)).status, 200);
  assert.equal((await bookingRow(booking.id)).payment_status, "Held", "pickup alone pays nobody");

  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/return`, photos)).status, 200);
  for (const who of [renter, outsider]) {
    assert.ok((await api(who, "PATCH", `/equipment/bookings/${booking.id}/condition-ok`)).status >= 400, "only the owner inspects");
  }
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/condition-ok`)).status, 200);
});

test("a request the owner never answers expires, is refunded, and frees the item", async () => {
  const item = await makeEquipment(owner);
  const stale = (await book(renter, item.id)).data;
  assert.equal(stale.status, "Pending");

  /* Pretend the request was made long ago (well past the expiry window). */
  await query(`UPDATE equipment_bookings SET created_at = NOW() - INTERVAL 30 DAY WHERE id = ?`, [stale.id]);

  const second = await book(outsider, item.id);
  assert.equal(second.status, 201, `a new renter can book once the old request has expired: ${second.message}`);

  const row = await bookingRow(stale.id);
  assert.equal(row.status, "Cancelled");
  assert.equal(row.payment_status, "Refunded", "the expired request's (demo) payment is refunded");

  const notice = await query(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND context_type = 'equipment_booking' AND context_id = ? AND title = 'Booking Request Expired'`,
    [renter.id, stale.id]
  );
  assert.equal(Number(notice[0].n), 1, "the renter is told their request expired");
});

test("a fresh pending request still blocks other renters", async () => {
  const item = await makeEquipment(owner);
  assert.equal((await book(renter, item.id)).status, 201);
  const second = await book(outsider, item.id);
  assert.equal(second.status, 400);
});
