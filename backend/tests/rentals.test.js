const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeEquipment, day, concurrently, ACKS } = require("./helpers");
const RENTAL_POLICY = require("../src/config/rentalPolicy");
const rentalPolicy = require("../src/services/rentalPolicy.service");
const { sendRentalReminders } = require("../src/jobs/scheduler");
const { RENTAL_PROTECTION_FUND, RENTALS } = require("../src/config/paymentSettings");
const protectionFund = require("../src/services/protectionFund.service");

let owner, renter, outsider, admin;

before(async () => {
  await start();
  owner = await createUser();
  renter = await createUser();
  outsider = await createUser();
  admin = await createUser({ role: "admin", totp: true });
  /* The practice database keeps fund rows between runs; a big opening
     balance means payouts in these tests are never limited by the balance
     unless a test sets it on purpose. */
  RENTAL_PROTECTION_FUND.openingBalance = 1000000;
});
after(stop);

const book = (who, equipmentId, startDate = day(1), endDate = day(2)) =>
  api(who, "POST", `/equipment/${equipmentId}/book`, { startDate, endDate, acknowledgements: ACKS });
const approve = (who, bookingId) => api(who, "PATCH", `/equipment/bookings/${bookingId}/confirm`);
const pay = (who, bookingId, version = RENTAL_POLICY.version) =>
  api(who, "POST", `/equipment/bookings/${bookingId}/pay`, { acceptedPolicyVersion: version });
const photos = { photoUrls: ["https://example.com/condition.jpg"], pickupCondition: "Functional" };
const handBack = (booking, who = renter) => api(who, "PATCH", `/equipment/bookings/${booking.id}/return`, photos);
const confirmBack = (booking) => api(owner, "PATCH", `/equipment/bookings/${booking.id}/return`, {});
const fundRows = async (bookingId) => query(`SELECT kind, amount, reason FROM protection_fund_entries WHERE booking_id = ? ORDER BY kind`, [bookingId]);
const bookingRow = async (id) => (await query(
  `SELECT status, payment_status, deposit_status, deposit_amount, rental_amount, protection_fee, cancel_reason,
          DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, return_due_at, return_minutes_late, policy_version, terms_snapshot,
          condition_status, damage_outcome, return_attempted_at, return_reported_at, return_disputed_at, not_returned_at
   FROM equipment_bookings WHERE id = ?`, [id]))[0];
const notices = async (userId, title, contextId) => Number((await query(
  `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = ? AND context_id = ?`, [userId, title, contextId]))[0].n);

/* Request → approve → pay: a confirmed, paid booking. */
async function confirmedBooking(item, who = renter, startDate = day(1), endDate = day(2)) {
  const requested = await book(who, item.id, startDate, endDate);
  assert.equal(requested.status, 201, requested.message);
  assert.equal((await approve(owner, requested.data.id)).status, 200);
  const paid = await pay(who, requested.data.id);
  assert.equal(paid.status, 200, paid.message);
  return paid.data;
}

async function onRent(item, who = renter, startDate = day(0), endDate = day(2)) {
  const booking = await confirmedBooking(item, who, startDate, endDate);
  assert.equal((await api(who, "PATCH", `/equipment/bookings/${booking.id}/pickup`, photos)).status, 200);
  return booking;
}

/* ── Dates and basic checks ── */

test("an owner can't book their own equipment", async () => {
  const item = await makeEquipment(owner);
  assert.equal((await book(owner, item.id)).status, 400);
});

test("a booking can't start in the past, or end before it starts", async () => {
  const item = await makeEquipment(owner);
  assert.equal((await book(renter, item.id, day(-3), day(-1))).status, 400);
  assert.ok((await book(renter, item.id, day(3), day(2))).status >= 400);
});

/* ── Request → approve → pay ── */

test("a request takes no money, and new bookings have no deposit (deposit policy not approved)", async () => {
  const item = await makeEquipment(owner, { itemValue: 1000 });
  const r = await api(renter, "POST", `/equipment/${item.id}/book`, { startDate: day(1), endDate: day(2), depositAmount: 500, acknowledgements: ACKS });
  assert.equal(r.status, 201, r.message);
  const row = await bookingRow(r.data.id);
  assert.equal(row.status, "Pending");
  assert.equal(row.payment_status, "Unpaid", "nothing is held at request time");
  assert.equal(Number(row.deposit_amount), 0, "a new renter (20% level) still pays no deposit, and the body's deposit is ignored");
  assert.equal(row.deposit_status, "None");
  assert.equal(row.policy_version, RENTAL_POLICY.version);
  assert.ok(JSON.parse(row.terms_snapshot).lateReturn, "the terms shown are saved on the booking");
});

test("the quote shows rent, fee, no deposit and the terms — with every money rule marked not in effect", async () => {
  const item = await makeEquipment(owner, { dailyPrice: 50, itemValue: 1000 });
  const q = (await api(renter, "GET", `/equipment/${item.id}/rental-quote?startDate=${day(1)}&endDate=${day(3)}`)).data;
  assert.equal(q.days, 3);
  assert.equal(q.rentalAmount, 150);
  assert.equal(q.depositAmount, 0);
  assert.equal(q.depositsEnabled, false);
  for (const rule of ["deposit", "earlyReturn", "lateReturn"]) {
    assert.equal(q.terms[rule].inEffect, false, `${rule} is not in effect`);
    assert.match(q.terms[rule].statusLabel, /not in effect/i);
  }
  assert.equal(q.terms.returnTime, "18:00");
  assert.equal(q.terms.policyVersion, RENTAL_POLICY.version);
});

test("several renters can request the same dates; the owner can only approve one of them", async () => {
  const item = await makeEquipment(owner);
  const renters = await Promise.all(Array.from({ length: 5 }, () => createUser()));
  const requests = await Promise.all(renters.map((u) => book(u, item.id)));
  assert.ok(requests.every((r) => r.status === 201), "requests don't hold dates");

  const results = await concurrently(1, async () => Promise.all(requests.map((r) => approve(owner, r.data.id))));
  const statuses = results[0].map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 200).length, 1, `only one approval wins: ${statuses}`);
  const held = await query(`SELECT COUNT(*) AS n FROM equipment_bookings WHERE equipment_id = ? AND status = 'Awaiting Payment'`, [item.id]);
  assert.equal(Number(held[0].n), 1);
});

test("other dates on the same item stay bookable (availability is by date)", async () => {
  const item = await makeEquipment(owner);
  await confirmedBooking(item, renter, day(1), day(2));
  const later = await book(outsider, item.id, day(4), day(5));
  assert.equal(later.status, 201, later.message);
  const clash = await book(outsider, item.id, day(2), day(3));
  assert.equal(clash.status, 409, "overlapping a confirmed booking is refused");
  const details = (await api(outsider, "GET", `/equipment/${item.id}`)).data;
  assert.deepEqual(details.booked_ranges.map((r) => [r.start, r.end]), [[day(1), day(2)]], "the item page shows the taken dates");
});

test("an overdue rental that was collected holds the item; one never collected doesn't", async () => {
  const collectedItem = await makeEquipment(owner);
  const collected = await onRent(collectedItem, renter, day(0), day(1));
  await query(`UPDATE equipment_bookings SET start_date = ?, end_date = ? WHERE id = ?`, [day(-3), day(-1), collected.id]);
  assert.equal((await book(outsider, collectedItem.id, day(0), day(1))).status, 409, "still out on rent, so not free yet");

  const uncollectedItem = await makeEquipment(owner);
  const uncollected = await confirmedBooking(uncollectedItem, renter, day(1), day(2));
  await query(`UPDATE equipment_bookings SET start_date = ?, end_date = ? WHERE id = ?`, [day(-3), day(-1), uncollected.id]);
  assert.equal((await book(outsider, uncollectedItem.id, day(0), day(1))).status, 201, "a booking whose dates passed without pickup doesn't block forever");
});

test("only the renter pays, only after approval, and only with the current terms", async () => {
  const item = await makeEquipment(owner);
  const booking = (await book(renter, item.id)).data;
  assert.equal((await pay(renter, booking.id)).status, 400, "not approved yet");
  assert.equal((await approve(owner, booking.id)).status, 200);
  for (const who of [owner, outsider]) assert.equal((await pay(who, booking.id)).status, 403);
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/pay`, {})).status, 400, "must accept the terms");
  assert.equal((await pay(renter, booking.id, "some-old-version")).status, 409, "terms changed → review again");

  const paid = await pay(renter, booking.id);
  assert.equal(paid.status, 200, paid.message);
  const row = await bookingRow(booking.id);
  assert.equal(row.status, "Confirmed");
  assert.equal(row.payment_status, "Held");
  assert.equal((await pay(renter, booking.id)).status, 400, "can't pay twice");
});

test("double-clicking Pay confirms once", async () => {
  const item = await makeEquipment(owner);
  const booking = (await book(renter, item.id)).data;
  await approve(owner, booking.id);
  const results = await concurrently(3, () => pay(renter, booking.id));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(await notices(owner.id, "Booking Paid & Confirmed", booking.id), 1);
});

test("paying declines the other requests for those dates", async () => {
  const item = await makeEquipment(owner);
  const other = (await book(outsider, item.id)).data;
  await confirmedBooking(item, renter);
  const row = await bookingRow(other.id);
  assert.equal(row.status, "Cancelled");
  assert.equal(row.cancel_reason, "dates_taken");
  assert.equal(row.payment_status, "Unpaid", "nothing was charged, so nothing to refund");
  assert.equal(await notices(outsider.id, "Booking Request Declined", other.id), 1);
});

test("an approval that isn't paid in time lapses and frees the dates", async () => {
  const item = await makeEquipment(owner);
  const first = (await book(renter, item.id)).data;
  const second = (await book(outsider, item.id)).data;
  await approve(owner, first.id);
  assert.equal((await approve(owner, second.id)).status, 409, "dates are held for the first renter");

  await query(`UPDATE equipment_bookings SET payment_due_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?`, [first.id]);
  assert.equal((await pay(renter, first.id)).status, 400, "too late to pay");
  const row = await bookingRow(first.id);
  assert.equal(row.status, "Cancelled");
  assert.equal(row.cancel_reason, "payment_expired");
  assert.equal(await notices(renter.id, "Booking Approval Lapsed", first.id), 1);
  assert.equal((await approve(owner, second.id)).status, 200, "the dates are free again");
});

test("a request the owner never answers expires (old paid-up-front requests are refunded)", async () => {
  const item = await makeEquipment(owner);
  const stale = (await book(renter, item.id)).data;
  await query(`UPDATE equipment_bookings SET created_at = NOW() - INTERVAL 30 DAY, payment_status = 'Held' WHERE id = ?`, [stale.id]);
  await api(outsider, "GET", `/equipment/${item.id}`); // any view runs the lazy expiry
  const row = await bookingRow(stale.id);
  assert.equal(row.status, "Cancelled");
  assert.equal(row.cancel_reason, "request_expired");
  assert.equal(row.payment_status, "Refunded");
  assert.equal(await notices(renter.id, "Booking Request Expired", stale.id), 1);
});

/* ── Collection, return, deadline ── */

test("each step can only be done by the right person, in the right order", async () => {
  const item = await makeEquipment(owner);
  const booking = (await book(renter, item.id, day(0), day(2))).data;
  for (const who of [renter, outsider]) assert.ok((await approve(who, booking.id)).status >= 400, "only the owner approves");
  await approve(owner, booking.id);
  await pay(renter, booking.id);

  assert.ok((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/return`, photos)).status >= 400, "can't return before pickup");
  for (const who of [owner, outsider]) {
    assert.ok((await api(who, "PATCH", `/equipment/bookings/${booking.id}/pickup`, photos)).status >= 400, "only the renter confirms pickup");
  }
  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/pickup`, photos)).status, 200);
  assert.equal((await bookingRow(booking.id)).payment_status, "Held", "pickup alone pays nobody");

  assert.equal((await handBack(booking)).status, 200);
  assert.equal((await bookingRow(booking.id)).payment_status, "Held", "the renter's hand-back alone pays nobody");
  assert.ok((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/condition-ok`)).status >= 400, "no condition check before the owner confirms it's back");
  assert.ok((await api(outsider, "PATCH", `/equipment/bookings/${booking.id}/return`, photos)).status >= 400, "outsiders can't record a return");
  assert.equal((await confirmBack(booking)).status, 200);
  for (const who of [renter, outsider]) {
    assert.ok((await api(who, "PATCH", `/equipment/bookings/${booking.id}/condition-ok`)).status >= 400, "only the owner inspects");
  }
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/condition-ok`)).status, 200);
});

test("the return deadline is 18:00 South African time on the last day, and history dates are plain dates", async () => {
  const item = await makeEquipment(owner);
  const booking = await confirmedBooking(item, renter, day(1), day(3));
  const due = new Date((await bookingRow(booking.id)).return_due_at);
  const sast = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(due);
  assert.equal(sast, `${day(3)}, 18:00`);

  const history = (await api(renter, "GET", "/equipment/history")).data;
  const card = history.find((b) => b.id === booking.id);
  assert.equal(card.start_date, day(1));
  assert.equal(card.end_date, day(3));
});

test("a late return is recorded, but no late fee is charged", async () => {
  const item = await makeEquipment(owner, { dailyPrice: 40 });
  const booking = await onRent(item);
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 5 HOUR WHERE id = ?`, [booking.id]);

  const view = (await api(renter, "GET", "/equipment/history")).data.find((b) => b.id === booking.id);
  assert.equal(view.is_overdue, true);
  assert.equal(view.estimates.lateReturn.binding, false);
  assert.equal(view.estimates.lateReturn.amount, 40, "the non-binding estimate: one started day after the 2-hour grace");

  const before = await bookingRow(booking.id);
  assert.equal((await handBack(booking)).status, 200);
  assert.equal((await confirmBack(booking)).status, 200);
  const row = await bookingRow(booking.id);
  assert.ok(row.return_minutes_late >= 299 && row.return_minutes_late <= 301, `about 5 hours late: ${row.return_minutes_late}`);
  assert.equal(Number(row.rental_amount), Number(before.rental_amount), "no fee added");
  assert.equal(Number(row.protection_fee), Number(before.protection_fee));
  const msg = await query(`SELECT message FROM notifications WHERE user_id = ? AND title = 'Rental Closed' AND context_id = ?`, [renter.id, booking.id]);
  assert.match(msg[0].message, /not in effect/);
});

test("the renter can cancel for a full refund before collecting, but not after", async () => {
  const item = await makeEquipment(owner);
  const booking = await confirmedBooking(item);
  assert.equal((await api(outsider, "PATCH", `/equipment/bookings/${booking.id}/cancel`)).status, 403);
  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/cancel`)).status, 200);
  const row = await bookingRow(booking.id);
  assert.equal(row.payment_status, "Refunded");
  assert.equal(row.cancel_reason, "renter_cancelled");

  const collected = await onRent(await makeEquipment(owner));
  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${collected.id}/cancel`)).status, 400);
});

test("an owner who can't hand it over cancels and the renter is refunded in full", async () => {
  const item = await makeEquipment(owner);
  const booking = await confirmedBooking(item);
  const note = { note: "The tripod head broke this morning." };
  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/owner-cancel`, note)).status, 403);
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/owner-cancel`, note)).status, 200);
  const row = await bookingRow(booking.id);
  assert.equal(row.cancel_reason, "owner_cancelled");
  assert.equal(row.payment_status, "Refunded");
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/owner-cancel`, note)).status, 400, "only once");
});

test("a renter can refuse a faulty item at pickup: refunded, owner told, admins get a report", async () => {
  const item = await makeEquipment(owner);
  const booking = await confirmedBooking(item);
  const r = await api(renter, "PATCH", `/equipment/bookings/${booking.id}/refuse-pickup`, { note: "The lens is cracked right across." });
  assert.equal(r.status, 200, r.message);
  const row = await bookingRow(booking.id);
  assert.equal(row.cancel_reason, "defective_at_pickup");
  assert.equal(row.payment_status, "Refunded");
  const reports = await query(`SELECT COUNT(*) AS n FROM reports WHERE context_type = 'equipment_booking' AND context_id = ?`, [booking.id]);
  assert.equal(Number(reports[0].n), 1);
});

/* ── Extensions ── */

test("an extension: renter asks, owner approves, renter pays — only then does the deadline move", async () => {
  const item = await makeEquipment(owner, { dailyPrice: 30 });
  const booking = await onRent(item, renter, day(0), day(2));
  const before = await bookingRow(booking.id);

  assert.equal((await api(outsider, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(4) })).status, 403);
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(1) })).status, 400, "must be later");
  const asked = await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(4) });
  assert.equal(asked.status, 200, asked.message);
  assert.equal(asked.data.extraAmount, 60, "2 more days × R30");
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(5) })).status, 400, "one at a time");

  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/extension/approve`)).status, 403, "renter can't approve");
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/extension/approve`)).status, 200);
  assert.equal((await bookingRow(booking.id)).end_date, day(2), "approved but unpaid: deadline unchanged");

  const results = await concurrently(2, () => api(renter, "POST", `/equipment/bookings/${booking.id}/extension/pay`));
  assert.equal(results.filter((r) => r.status === 200).length, 1, "paid once");
  const row = await bookingRow(booking.id);
  assert.equal(row.end_date, day(4));
  assert.ok(new Date(row.return_due_at) > new Date(before.return_due_at));
  assert.equal(Number(row.rental_amount), Number(before.rental_amount) + 60);
});

test("an extension can't overlap another booking, or be asked for after the deadline", async () => {
  const item = await makeEquipment(owner);
  const booking = await onRent(item, renter, day(0), day(1));
  await confirmedBooking(item, outsider, day(3), day(4));
  const clash = await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(3) });
  assert.equal(clash.status, 409, clash.message);

  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?`, [booking.id]);
  const late = await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(2) });
  assert.equal(late.status, 400);
});

test("an owner can decline an extension, and the renter keeps the original deadline", async () => {
  const item = await makeEquipment(owner);
  const booking = await onRent(item);
  await api(renter, "POST", `/equipment/bookings/${booking.id}/extension`, { newEndDate: day(5) });
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/extension/decline`)).status, 200);
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/extension/pay`)).status, 400);
  assert.equal((await bookingRow(booking.id)).end_date, day(2));
});

/* ── Reminders ── */

test("return reminders, overdue notices and admin follow-up each go out once — and never charge", async () => {
  const item = await makeEquipment(owner);
  const booking = await onRent(item);
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() + INTERVAL 2 HOUR WHERE id = ?`, [booking.id]);
  await sendRentalReminders();
  await sendRentalReminders();
  assert.equal(await notices(renter.id, "Return Due Soon", booking.id), 1);

  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?`, [booking.id]);
  await sendRentalReminders();
  await sendRentalReminders();
  assert.equal(await notices(renter.id, "Rental Overdue", booking.id), 1);
  assert.equal(await notices(owner.id, "Rental Overdue", booking.id), 1);

  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 80 HOUR WHERE id = ?`, [booking.id]);
  await sendRentalReminders();
  await sendRentalReminders();
  assert.equal(await notices(admin.id, "Rental Still Not Returned", booking.id), 1);

  const row = await bookingRow(booking.id);
  assert.equal(row.payment_status, "Held", "reminders never move money");
});

/* ── An overdue rental and the next renter ── */

/* `late` is out on rent and overdue; `next` (outsider) is paid and due to be collected today. */
async function overdueWithNextBooking() {
  const item = await makeEquipment(owner);
  const late = await onRent(item, renter, day(0), day(1));
  const next = await confirmedBooking(item, outsider, day(3), day(4));
  await query(`UPDATE equipment_bookings SET start_date = ?, end_date = ?, return_due_at = NOW() - INTERVAL 2 HOUR WHERE id = ?`, [day(-3), day(-1), late.id]);
  await query(`UPDATE equipment_bookings SET start_date = ?, end_date = ? WHERE id = ?`, [day(0), day(1), next.id]);
  return { item, late, next };
}
const actionCard = async (user, bookingId) => {
  const data = (await api(user, "GET", "/activity")).data;
  return [...data.needsYou, ...data.waitingOnOthers].find((i) => i.key === `rental-${bookingId}`);
};

test("when the item isn't back in time, the next renter and the owner are warned once — without saying who has it", async () => {
  const { late, next } = await overdueWithNextBooking();
  const later = await confirmedBooking(await makeEquipment(owner), outsider, day(5), day(6));
  await sendRentalReminders();
  await sendRentalReminders();
  assert.equal(await notices(outsider.id, "Item Not Back Yet", next.id), 1);
  assert.equal(await notices(owner.id, "Next Renter Waiting", next.id), 1);
  assert.equal(await notices(outsider.id, "Item Not Back Yet", later.id), 0, "a booking whose item isn't overdue isn't warned");

  const card = (await api(outsider, "GET", "/equipment/history")).data.find((b) => b.id === next.id);
  assert.deepEqual(Object.keys(card.waiting_for_return), ["due_at"], "only when it was due — never who has it");
  assert.equal((await api(outsider, "GET", "/equipment/history")).data.find((b) => b.id === late.id), undefined);

  assert.equal((await actionCard(outsider, next.id)).status, "Waiting for the item");
  assert.equal((await actionCard(owner, next.id)).status, "Waiting for return");
  assert.equal((await bookingRow(late.id)).payment_status, "Held", "warnings never move money");
});

test("the next renter can't confirm pickup while the item is still out, but can cancel for a full refund", async () => {
  const { next } = await overdueWithNextBooking();
  assert.equal((await api(outsider, "PATCH", `/equipment/bookings/${next.id}/pickup`, photos)).status, 409);
  assert.equal((await api(outsider, "PATCH", `/equipment/bookings/${next.id}/cancel`)).status, 200);
  const row = await bookingRow(next.id);
  assert.equal(row.status, "Cancelled");
  assert.equal(row.payment_status, "Refunded");
  assert.equal(row.cancel_reason, "item_not_returned", "recorded as not the renter's doing");
});

test("when the owner records the return, the waiting renter is told and can collect it", async () => {
  const { late, next } = await overdueWithNextBooking();
  await sendRentalReminders();
  const back = await api(owner, "PATCH", `/equipment/bookings/${late.id}/return`, photos);
  assert.equal(back.status, 200, back.message);
  assert.ok((await bookingRow(late.id)).return_minutes_late > 0, "the lateness is on record (no fee)");
  assert.equal(await notices(outsider.id, "Item Is Back", next.id), 1);
  assert.equal((await api(outsider, "GET", "/equipment/history")).data.find((b) => b.id === next.id).waiting_for_return, null);
  assert.equal((await api(outsider, "PATCH", `/equipment/bookings/${next.id}/pickup`, photos)).status, 200);
});

/* ── Problems and damage ── */

test("a renter can report the owner isn't available to take it back — the attempt is recorded", async () => {
  const item = await makeEquipment(owner);
  const booking = await onRent(item);
  const body = { category: "owner_unavailable", note: "I waited at the library for 40 minutes." };
  assert.equal((await api(outsider, "POST", `/equipment/bookings/${booking.id}/problem`, body)).status, 403);
  assert.equal((await api(owner, "POST", `/equipment/bookings/${booking.id}/problem`, body)).status, 400, "that one is the renter's");
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/problem`, body)).status, 200);
  assert.ok((await bookingRow(booking.id)).return_attempted_at, "when they tried to return it is on record");
  const reports = await query(`SELECT COUNT(*) AS n FROM reports WHERE context_type = 'equipment_booking' AND context_id = ?`, [booking.id]);
  assert.equal(Number(reports[0].n), 1);
});

test("admins settle damage reports without deducting anything", async () => {
  const item = await makeEquipment(owner);
  const booking = await onRent(item);
  await handBack(booking);
  await confirmBack(booking);
  await api(owner, "PATCH", `/equipment/bookings/${booking.id}/report-damage`, { note: "The leg clamp is snapped off." });

  const url = `/admin/rental-bookings/${booking.id}/resolve-damage`;
  for (const who of [owner, renter]) assert.equal((await api(who, "PATCH", url, { outcome: "damage_confirmed" })).status, 403);
  const reports = (await api(admin, "GET", "/reports")).data;
  assert.equal(reports.find((r) => r.context_type === "equipment_booking" && r.context_id === booking.id).context_status, "DamageReported");

  assert.equal((await api(admin, "PATCH", url, { outcome: "renter_not_at_fault", note: "Photos show it was already cracked." })).status, 200);
  const row = await bookingRow(booking.id);
  assert.equal(row.damage_outcome, "renter_not_at_fault");
  assert.equal(row.condition_status, "OK", "the damage mark comes off the renter's record");
  assert.equal((await api(admin, "PATCH", url, { outcome: "damage_confirmed" })).status, 400, "settled once");
});

/* ── Money-rule approval gate ── */

test("no money rule is enforceable until approved, in effect, and supported by a real provider", () => {
  for (const rule of ["deposit", "earlyReturnRefund", "lateFee"]) {
    assert.equal(rentalPolicy.isEnforceable(rule), false, `${rule} is off today`);
    assert.throws(() => rentalPolicy.assertEnforceable(rule), /hasn't been approved/);
  }
  const saved = { ...RENTAL_POLICY.lateFee };
  try {
    Object.assign(RENTAL_POLICY.lateFee, { status: "approved" });
    assert.equal(rentalPolicy.isEnforceable("lateFee"), false, "approved but no approver recorded");
    Object.assign(RENTAL_POLICY.lateFee, { approvedBy: "Legal", approvedAt: "2026-10-01", effectiveFrom: "2099-01-01" });
    assert.equal(rentalPolicy.isEnforceable("lateFee"), false, "not effective yet");
    Object.assign(RENTAL_POLICY.lateFee, { effectiveFrom: "2026-10-02" });
    assert.equal(rentalPolicy.isEnforceable("lateFee"), false, "no payment provider supports it");
    Object.assign(RENTAL_POLICY.lateFee, { providerSupported: true });
    assert.equal(rentalPolicy.isEnforceable("lateFee"), true, "only with everything in place");
    Object.assign(RENTAL_POLICY.lateFee, { status: "suspended" });
    assert.equal(rentalPolicy.isEnforceable("lateFee"), false, "suspended switches it off again");
  } finally {
    Object.keys(RENTAL_POLICY.lateFee).forEach((k) => delete RENTAL_POLICY.lateFee[k]);
    Object.assign(RENTAL_POLICY.lateFee, saved);
  }
});

test("late-fee and early-return estimates: grace period, started days, cap, rounding", () => {
  const due = new Date("2026-10-10T16:00:00Z"); // 18:00 SAST
  const at = (hours) => new Date(due.getTime() + hours * 3600000);
  const late = (hours, extra = {}) => rentalPolicy.estimateLateFee({ returnDueAt: due, dailyPrice: 33.33, at: at(hours), ...extra });
  assert.equal(late(-1).amount, 0, "on time");
  assert.equal(late(1.99).amount, 0, "inside the grace period");
  assert.equal(late(2.5).amount, 33.33, "first started day");
  assert.equal(late(26.5).amount, 66.66, "second started day");
  assert.equal(late(24 * 10, { itemValue: 100 }).amount, 100, "capped at the item's value");
  assert.equal(late(3).binding, false);

  const early = (returnDay, extra = {}) => rentalPolicy.estimateEarlyReturnRefund({
    endDate: "2026-10-15", dailyPrice: 33.33, rentalAmount: 199.98, at: new Date(`${returnDay}T10:00:00+02:00`), ...extra
  });
  assert.equal(early("2026-10-12").unusedDays, 3);
  assert.equal(early("2026-10-12").amount, 99.99, "3 × 33.33, rounded to cents");
  assert.equal(early("2026-10-15").amount, 0, "returned on the last day");
  assert.equal(early("2026-10-01", { rentalAmount: 50 }).amount, 50, "never more than the rent paid");
});

test("a booking keeps the terms it was agreed under when the policy changes", async () => {
  const item = await makeEquipment(owner);
  const booking = await confirmedBooking(item);
  const original = RENTAL_POLICY.version;
  try {
    RENTAL_POLICY.version = "2027-01-changed";
    const row = await bookingRow(booking.id);
    assert.equal(row.policy_version, original, "the confirmed booking still records the old version");

    const next = (await book(outsider, item.id, day(5), day(6))).data;
    await approve(owner, next.id);
    assert.equal((await pay(outsider, next.id, original)).status, 409, "paying under terms you weren't shown is refused");
    assert.equal((await pay(outsider, next.id, "2027-01-changed")).status, 200);
  } finally {
    RENTAL_POLICY.version = original;
  }
});

/* ── Returns the owner confirms ── */

test("the renter's hand-back waits for the owner; lateness counts to the hand-back, and the fee goes into the fund once", async () => {
  const item = await makeEquipment(owner, { dailyPrice: 40 });
  const booking = await onRent(item);
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 3 HOUR WHERE id = ?`, [booking.id]);

  assert.equal((await api(renter, "PATCH", `/equipment/bookings/${booking.id}/return`, { photoUrls: [] })).status, 400, "the renter needs photos");
  assert.equal((await handBack(booking)).status, 200);
  assert.equal((await handBack(booking)).status, 400, "only once");
  assert.equal(await notices(owner.id, "Confirm the Return", booking.id), 1);
  let row = await bookingRow(booking.id);
  assert.equal(row.status, "Confirmed");
  assert.equal(row.payment_status, "Held");
  assert.ok(row.return_reported_at);
  assert.deepEqual(await fundRows(booking.id), [], "nothing goes into the fund until the rental completes");

  const view = (await api(renter, "GET", "/equipment/history")).data.find((b) => b.id === booking.id);
  assert.equal(view.handed_back, true);
  assert.equal(view.is_overdue, false, "handed back, so no longer overdue");

  /* The owner is slow: confirms two hours after the hand-back. */
  await query(`UPDATE equipment_bookings SET return_reported_at = return_reported_at - INTERVAL 2 HOUR, return_due_at = return_due_at - INTERVAL 2 HOUR WHERE id = ?`, [booking.id]);
  assert.equal((await confirmBack(booking)).status, 200, "the owner can confirm without new photos");
  row = await bookingRow(booking.id);
  assert.equal(row.status, "Returned");
  assert.equal(row.payment_status, "Released");
  assert.ok(row.return_minutes_late >= 179 && row.return_minutes_late <= 181, `3 hours late at hand-back, not 5: ${row.return_minutes_late}`);
  const fee = await fundRows(booking.id);
  assert.equal(fee.length, 1);
  assert.equal(fee[0].kind, "fee");
  assert.equal(Number(fee[0].amount), Number(row.protection_fee));
  assert.equal((await confirmBack(booking)).status, 400, "already returned");
});

test("the owner still needs photos to record a return the renter hasn't reported", async () => {
  const booking = await onRent(await makeEquipment(owner));
  assert.equal((await confirmBack(booking)).status, 400);
  assert.equal((await api(owner, "PATCH", `/equipment/bookings/${booking.id}/return`, photos)).status, 200);
});

test("after a hand-back the renter gets no more deadline reminders; an unconfirmed one goes to admins once", async () => {
  const booking = await onRent(await makeEquipment(owner));
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?`, [booking.id]);
  await handBack(booking);
  await sendRentalReminders();
  assert.equal(await notices(renter.id, "Rental Overdue", booking.id), 0, "they've done their part");

  await query(`UPDATE equipment_bookings SET return_reported_at = NOW() - INTERVAL ? HOUR WHERE id = ?`, [RENTALS.handbackConfirmHours + 1, booking.id]);
  await sendRentalReminders();
  await sendRentalReminders();
  assert.equal(await notices(owner.id, "Please Confirm the Return", booking.id), 1);
  assert.equal(await notices(admin.id, "Return Not Confirmed", booking.id), 1);
  const reports = (await api(admin, "GET", "/reports")).data.filter((r) => r.context_type === "equipment_booking" && r.context_id === booking.id);
  assert.equal(reports.length, 1, "filed once, so it shows in the Reports table");
  assert.equal(reports[0].context_status, "ReturnOpen");
  assert.equal(reports[0].context_rental.canConfirm, true);
  assert.equal((await bookingRow(booking.id)).payment_status, "Held", "reminders never move money");
});

test("an owner who doesn't have it disputes the hand-back; an admin who believes the renter completes it", async () => {
  const booking = await onRent(await makeEquipment(owner));
  const dispute = { category: "not_handed_back", note: "I was at the lab all day, nobody gave it to me." };
  assert.equal((await api(owner, "POST", `/equipment/bookings/${booking.id}/problem`, dispute)).status, 400, "nothing to dispute yet");
  await handBack(booking);
  assert.equal((await api(renter, "POST", `/equipment/bookings/${booking.id}/problem`, dispute)).status, 400, "that one is the owner's");
  assert.equal((await api(owner, "POST", `/equipment/bookings/${booking.id}/problem`, dispute)).status, 200);
  assert.equal((await api(owner, "POST", `/equipment/bookings/${booking.id}/problem`, dispute)).status, 409, "once");
  assert.ok((await bookingRow(booking.id)).return_disputed_at);

  const url = `/admin/rental-bookings/${booking.id}/resolve-return`;
  for (const who of [owner, renter]) assert.equal((await api(who, "PATCH", url, { outcome: "returned" })).status, 403);
  assert.equal((await api(admin, "PATCH", url, { outcome: "returned", compensation: 100 })).status, 400, "no payout for a returned item");
  const r = await api(admin, "PATCH", url, { outcome: "returned", note: "The return photos show the owner's desk." });
  assert.equal(r.status, 200, r.message);
  const row = await bookingRow(booking.id);
  assert.equal(row.status, "Returned");
  assert.equal(row.payment_status, "Released");
  assert.equal(await notices(renter.id, "Rental Closed", booking.id), 1);
  const open = await query(`SELECT COUNT(*) AS n FROM reports WHERE context_type = 'equipment_booking' AND context_id = ? AND status = 'Pending'`, [booking.id]);
  assert.equal(Number(open[0].n), 0, "the reports about it are resolved");
});

/* ── Items that never come back ── */

test("an admin can close an overdue rental as not returned: rent released, owner paid from the fund, listing down, later bookings refunded", async () => {
  const item = await makeEquipment(owner, { itemValue: 800 });
  const keeper = await createUser(); // closing it as not returned blocks this renter
  const booking = await onRent(item, keeper, day(0), day(1));
  const later = await confirmedBooking(item, outsider, day(4), day(5));
  const url = `/admin/rental-bookings/${booking.id}/resolve-return`;

  assert.equal((await api(admin, "PATCH", url, { outcome: "not_returned" })).status, 400, "not before the deadline");
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 80 HOUR WHERE id = ?`, [booking.id]);
  await sendRentalReminders();
  const reports = (await api(admin, "GET", "/reports")).data.filter((r) => r.context_type === "equipment_booking" && r.context_id === booking.id);
  assert.equal(reports.length, 1, "the overdue escalation files a report");
  assert.equal(reports[0].context_rental.canCloseMissing, true);
  assert.equal(reports[0].context_rental.payoutLimit, 800, "capped at the item's value");

  assert.equal((await api(admin, "PATCH", url, { outcome: "returned" })).status, 400, "the renter never said it's back");
  assert.equal((await api(admin, "PATCH", url, { outcome: "not_returned", compensation: 900 })).status, 400, "more than the item is worth");
  assert.equal((await bookingRow(booking.id)).status, "Confirmed", "a refused payout changes nothing");

  const results = await concurrently(2, () => api(admin, "PATCH", url, { outcome: "not_returned", compensation: 800, note: "No reply for 4 days." }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, "settled once");
  const row = await bookingRow(booking.id);
  assert.equal(row.status, "Not Returned");
  assert.ok(row.not_returned_at);
  assert.equal(row.payment_status, "Released", "the owner keeps the rent");
  const fund = await fundRows(booking.id);
  assert.deepEqual(fund.map((f) => [f.kind, Number(f.amount), f.reason]), [["fee", Number(row.protection_fee), null], ["payout", -800, "not_returned"]]);

  const laterRow = await bookingRow(later.id);
  assert.equal(laterRow.status, "Cancelled");
  assert.equal(laterRow.cancel_reason, "item_lost");
  assert.equal(laterRow.payment_status, "Refunded");
  assert.equal((await query(`SELECT is_available FROM equipment WHERE id = ?`, [item.id]))[0].is_available, 0, "listing taken down");
  assert.equal(await notices(owner.id, "Rental Closed: Not Returned", booking.id), 1);

  const history = (await api(owner, "GET", "/equipment/history")).data.find((b) => b.id === booking.id);
  assert.equal(Number(history.fund_payout), 800, "the owner sees what the fund paid");
  assert.equal(history.status, "Not Returned");
});

test("a renter with a rental closed as not returned can't rent, and their other bookings are cancelled", async () => {
  const keeper = await createUser();
  const lost = await onRent(await makeEquipment(owner), keeper, day(0), day(1));
  const other = await confirmedBooking(await makeEquipment(owner), keeper, day(5), day(6));
  await query(`UPDATE equipment_bookings SET return_due_at = NOW() - INTERVAL 1 HOUR WHERE id = ?`, [lost.id]);
  assert.equal((await api(admin, "PATCH", `/admin/rental-bookings/${lost.id}/resolve-return`, { outcome: "not_returned" })).status, 200);

  const otherRow = await bookingRow(other.id);
  assert.equal(otherRow.cancel_reason, "renter_blocked");
  assert.equal(otherRow.payment_status, "Refunded");

  const item = await makeEquipment(owner);
  const q = (await api(keeper, "GET", `/equipment/${item.id}/rental-quote?startDate=${day(1)}&endDate=${day(2)}`)).data;
  assert.equal(q.allowed, false);
  assert.match(q.reason, /not returned/);
  assert.equal((await book(keeper, item.id)).status, 403);
});

/* ── The protection fund ── */

test("confirmed damage can be paid from the fund, capped per claim and by the balance; the renter is never charged", async () => {
  const saved = RENTAL_PROTECTION_FUND.openingBalance;
  try {
    const item = await makeEquipment(owner, { itemValue: 5000 });
    const booking = await onRent(item);
    await handBack(booking);
    await confirmBack(booking);
    await api(owner, "PATCH", `/equipment/bookings/${booking.id}/report-damage`, { note: "The screen is cracked across." });
    const url = `/admin/rental-bookings/${booking.id}/resolve-damage`;

    assert.equal((await api(admin, "PATCH", url, { outcome: "renter_not_at_fault", compensation: 50 })).status, 400, "only confirmed damage pays out");
    const over = await api(admin, "PATCH", url, { outcome: "damage_confirmed", compensation: RENTAL_PROTECTION_FUND.maxPayoutPerClaim + 1 });
    assert.equal(over.status, 400, "over the per-claim cap");

    /* Leave exactly R100 in the fund. */
    RENTAL_PROTECTION_FUND.openingBalance = 0;
    const balance = await protectionFund.getBalance();
    RENTAL_PROTECTION_FUND.openingBalance = Math.round((100 - balance) * 100) / 100;
    assert.equal(await protectionFund.getBalance(), 100);
    assert.equal((await api(admin, "PATCH", url, { outcome: "damage_confirmed", compensation: 150 })).status, 400, "more than the fund holds");

    const before = await bookingRow(booking.id);
    const r = await api(admin, "PATCH", url, { outcome: "damage_confirmed", compensation: 100, note: "Repair quote R100." });
    assert.equal(r.status, 200, r.message);
    assert.equal(await protectionFund.getBalance(), 0);
    const after = await bookingRow(booking.id);
    assert.equal(Number(after.rental_amount), Number(before.rental_amount), "nothing added to the renter");
    const msg = await query(`SELECT message FROM notifications WHERE user_id = ? AND title = 'Damage Report Settled' AND context_id = ?`, [owner.id, booking.id]);
    assert.match(msg[0].message, /R100\.00 has been paid to you from the Taskify Protection Fund/);

    const summary = (await api(admin, "GET", "/admin/protection-fund")).data;
    assert.equal(summary.balance, 0);
    assert.equal((await api(owner, "GET", "/admin/protection-fund")).status, 403);
  } finally {
    RENTAL_PROTECTION_FUND.openingBalance = saved;
  }
});

test("the quote and terms explain what the protection fee pays for", async () => {
  const item = await makeEquipment(owner);
  const q = (await api(renter, "GET", `/equipment/${item.id}/rental-quote?startDate=${day(1)}&endDate=${day(2)}`)).data;
  assert.equal(q.terms.protectionFund.maxPayoutPerClaim, RENTAL_PROTECTION_FUND.maxPayoutPerClaim);
  assert.match(q.terms.protectionFund.summary, /Taskify Protection Fund/);
  assert.match(q.terms.returning.summary, /owner confirms/);
});
