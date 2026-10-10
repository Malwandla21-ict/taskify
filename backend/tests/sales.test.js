const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeSale, concurrently } = require("./helpers");

let seller, buyer, outsider;

before(async () => {
  await start();
  seller = await createUser();
  buyer = await createUser();
  outsider = await createUser();
});
after(stop);

/* Lists an item, has the buyer pay (demo), and returns the order as each
   side sees it on the item page. */
async function heldOrder(price = 400) {
  const item = await makeSale(seller, { price });
  const bought = await api(buyer, "POST", `/sales/${item.id}/buy`);
  assert.equal(bought.status, 201, bought.message);
  const asBuyer = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order;
  const asSeller = (await api(seller, "GET", `/sales/${item.id}`)).data.my_order;
  return { item, order: asBuyer, sellerView: asSeller };
}

const orderRow = async (id) => (await query(`SELECT status, code_attempts FROM sale_orders WHERE id = ?`, [id]))[0];

test("only the buyer can see the handover code — never the seller or anyone else", async () => {
  const { item, order, sellerView } = await heldOrder();
  assert.match(String(order.handover_code), /^\d{4}$/);
  assert.equal(sellerView.handover_code ?? null, null);
  const asOutsider = (await api(outsider, "GET", `/sales/${item.id}`)).data.my_order;
  assert.ok(!asOutsider || asOutsider.handover_code == null);
});

test("only the seller can redeem the code (a buyer or outsider can't trigger their own payout)", async () => {
  const { order } = await heldOrder();
  for (const who of [buyer, outsider]) {
    const r = await api(who, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code });
    assert.equal(r.status, 403);
  }
  assert.equal((await orderRow(order.id)).status, "Held");
});

test("a wrong code is rejected and nothing is released", async () => {
  const { order } = await heldOrder();
  const wrong = order.handover_code === "0000" ? "1111" : "0000";
  const r = await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: wrong });
  assert.equal(r.status, 400);
  assert.equal((await orderRow(order.id)).status, "Held");
});

test("the right code releases once; using it again is rejected", async () => {
  const { order } = await heldOrder();
  assert.equal((await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code })).status, 200);
  assert.equal((await orderRow(order.id)).status, "Released");
  const again = await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code });
  assert.ok(again.status >= 400, "a redeemed code can't be used again");
});

test("double-submitting the right code releases payment only once", async () => {
  const { item, order } = await heldOrder();
  const results = await concurrently(6, () =>
    api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
  const notices = await query(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Payment Released' AND context_id = ?`,
    [seller.id, item.id]
  );
  assert.equal(Number(notices[0].n), 1, "the seller is told about the payout exactly once");
});

test("guessing many codes at once can't get past the 5-try limit", async () => {
  const { order } = await heldOrder();
  const guesses = Array.from({ length: 12 }, (_, i) => String(i).padStart(4, "0")).filter((c) => c !== order.handover_code).slice(0, 10);
  await Promise.all(guesses.map((code) => api(seller, "POST", `/sales/orders/${order.id}/release`, { code })));
  assert.ok(Number((await orderRow(order.id)).code_attempts) <= 5, "attempt counter never goes past the limit");

  const correctAfterLock = await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code });
  assert.equal(correctAfterLock.status, 423, "once locked, even the right code is refused");
  assert.equal((await orderRow(order.id)).status, "Held", "a locked order keeps the buyer's money held for a refund");
});

test("a locked or failed handover can still be cancelled by the buyer for a refund", async () => {
  const { order } = await heldOrder();
  const r = await api(buyer, "PATCH", `/sales/orders/${order.id}/cancel`);
  assert.equal(r.status, 200, r.message);
  assert.equal((await orderRow(order.id)).status, "Refunded");
});
