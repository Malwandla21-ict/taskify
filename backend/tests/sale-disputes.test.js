const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeSale, concurrently } = require("./helpers");

let seller, buyer, outsider, admin;

before(async () => {
  await start();
  seller = await createUser();
  buyer = await createUser();
  outsider = await createUser();
  admin = await createUser({ role: "admin", totp: true });
});
after(stop);

async function heldOrder(price = 400) {
  const item = await makeSale(seller, { price });
  const bought = await api(buyer, "POST", `/sales/${item.id}/buy`);
  assert.equal(bought.status, 201, bought.message);
  const order = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order;
  return { item, order };
}

async function disputedOrder(by = buyer, category = "no_show") {
  const { item, order } = await heldOrder();
  const r = await api(by, "POST", `/sales/orders/${order.id}/dispute`, { category, reason: "We agreed to meet at the library at 2pm." });
  assert.equal(r.status, 200, r.message);
  return { item, order };
}

const orderRow = async (id) =>
  (await query(`SELECT status, code_attempts, handover_code, disputed_by, dispute_outcome FROM sale_orders WHERE id = ?`, [id]))[0];
const itemStatus = async (id) => (await query(`SELECT status FROM sales_items WHERE id = ?`, [id]))[0].status;
const pendingReports = async (itemId) =>
  Number((await query(`SELECT COUNT(*) AS n FROM reports WHERE context_type = 'sales_item' AND context_id = ? AND status = 'Pending'`, [itemId]))[0].n);

test("only the buyer or seller can report a problem, with a reason and a category that fits their side", async () => {
  const { order } = await heldOrder();
  const reason = "They never turned up at the library.";
  assert.equal((await api(outsider, "POST", `/sales/orders/${order.id}/dispute`, { category: "no_show", reason })).status, 403);
  assert.equal((await api(buyer, "POST", `/sales/orders/${order.id}/dispute`, { category: "no_show", reason: "short" })).status, 400);
  assert.equal((await api(buyer, "POST", `/sales/orders/${order.id}/dispute`, { category: "made_up", reason })).status, 400);
  assert.equal((await api(buyer, "POST", `/sales/orders/${order.id}/dispute`, { category: "handed_over_no_code", reason })).status, 400,
    "only the seller can say they handed it over without getting the code");
  assert.equal((await api(seller, "POST", `/sales/orders/${order.id}/dispute`, { category: "not_as_described", reason })).status, 400,
    "only the buyer can say the item isn't as described");
  assert.equal((await orderRow(order.id)).status, "Held");
});

test("reporting keeps the money held and the item reserved, tells the other side, and files a report for admins", async () => {
  const { item, order } = await disputedOrder(seller, "handed_over_no_code");
  const row = await orderRow(order.id);
  assert.equal(row.status, "Disputed");
  assert.equal(row.disputed_by, "seller");
  assert.equal(await itemStatus(item.id), "Reserved");
  assert.equal(await pendingReports(item.id), 1);

  const told = await query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Problem Reported' AND context_id = ?`, [buyer.id, item.id]);
  assert.equal(Number(told[0].n), 1);

  const again = await api(seller, "POST", `/sales/orders/${order.id}/dispute`, { category: "other", reason: "Reporting the same thing again." });
  assert.equal(again.status, 400, "can't report twice");
});

test("the buyer keeps their code while it's reported, and the seller still never sees it", async () => {
  const { item, order } = await disputedOrder();
  const asBuyer = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order;
  const asSeller = (await api(seller, "GET", `/sales/${item.id}`)).data.my_order;
  assert.equal(asBuyer.handover_code, order.handover_code);
  assert.equal(asSeller.handover_code ?? null, null);
  assert.equal(asSeller.disputed_by, "buyer");
  const asOutsider = (await api(outsider, "GET", `/sales/${item.id}`)).data.my_order;
  assert.ok(!asOutsider, "outsiders see nothing about the order");
});

test("while reported, the buyer can't cancel for an instant refund, but the seller can refund them", async () => {
  const { item, order } = await disputedOrder(seller, "handed_over_no_code");
  assert.equal((await api(buyer, "PATCH", `/sales/orders/${order.id}/cancel`)).status, 400);
  assert.equal((await orderRow(order.id)).status, "Disputed");

  assert.equal((await api(seller, "PATCH", `/sales/orders/${order.id}/cancel`)).status, 200);
  const row = await orderRow(order.id);
  assert.equal(row.status, "Refunded");
  assert.equal(row.dispute_outcome, "seller_refunded");
  assert.equal(await itemStatus(item.id), "Available");
  assert.equal(await pendingReports(item.id), 0, "the report leaves the admin queue");
});

test("if they sort it out, the buyer's code still completes the sale", async () => {
  const { item, order } = await disputedOrder();
  const r = await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code });
  assert.equal(r.status, 200, r.message);
  const row = await orderRow(order.id);
  assert.equal(row.status, "Released");
  assert.equal(row.dispute_outcome, "handed_over");
  assert.equal(await itemStatus(item.id), "Sold");
  assert.equal(await pendingReports(item.id), 0);
});

test("a locked order (too many wrong codes) can be reported by the seller", async () => {
  const { order } = await heldOrder();
  await query(`UPDATE sale_orders SET code_attempts = 5 WHERE id = ?`, [order.id]);
  const r = await api(seller, "POST", `/sales/orders/${order.id}/dispute`, { category: "code_problem", reason: "The buyer kept giving me the wrong code." });
  assert.equal(r.status, 200, r.message);
  assert.equal((await orderRow(order.id)).status, "Disputed");
});

test("only admins (with 2FA) can settle a reported sale, and only a disputed one", async () => {
  const { order } = await disputedOrder();
  for (const who of [buyer, seller, outsider]) {
    assert.equal((await api(who, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "release" })).status, 403);
  }
  const { order: heldOnly } = await heldOrder();
  assert.equal((await api(admin, "PATCH", `/admin/sale-orders/${heldOnly.id}/resolve-dispute`, { outcome: "release" })).status, 400);
  assert.equal((await api(admin, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "keep" })).status, 400);
});

test("admin outcome: release pays the seller, marks it sold, closes the report and is audit-logged", async () => {
  const { item, order } = await disputedOrder(seller, "handed_over_no_code");
  const r = await api(admin, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "release", note: "Chat shows the handover happened." });
  assert.equal(r.status, 200, r.message);
  assert.equal((await orderRow(order.id)).status, "Released");
  assert.equal(await itemStatus(item.id), "Sold");
  assert.equal(await pendingReports(item.id), 0);
  const logged = await query(`SELECT COUNT(*) AS n FROM admin_audit_logs WHERE action = 'sale.dispute_released' AND target_id = ?`, [order.id]);
  assert.equal(Number(logged[0].n), 1);
});

test("admin outcome: refund returns the buyer's money and lists the item again", async () => {
  const { item, order } = await disputedOrder(buyer, "not_as_described");
  assert.equal((await api(admin, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "refund" })).status, 200);
  const row = await orderRow(order.id);
  assert.equal(row.status, "Refunded");
  assert.equal(row.dispute_outcome, "refunded");
  assert.equal(await itemStatus(item.id), "Available");
});

test("admin outcome: retry puts the order back to 'meet again' with a NEW code and fresh attempts", async () => {
  const { item, order } = await disputedOrder();
  await query(`UPDATE sale_orders SET code_attempts = 3 WHERE id = ?`, [order.id]);
  assert.equal((await api(admin, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "retry" })).status, 200);

  const row = await orderRow(order.id);
  assert.equal(row.status, "Held");
  assert.equal(Number(row.code_attempts), 0);
  const fresh = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order.handover_code;
  assert.match(String(fresh), /^\d{4}$/);
  assert.equal(fresh, row.handover_code, "the buyer sees the new code");
  assert.equal(await itemStatus(item.id), "Reserved");

  assert.equal((await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: fresh })).status, 200);
});

test("a reported sale can only be settled once, even if two admins click at the same moment", async () => {
  const { order } = await disputedOrder();
  const results = await concurrently(2, () => api(admin, "PATCH", `/admin/sale-orders/${order.id}/resolve-dispute`, { outcome: "refund" }));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test("double-clicking cancel refunds only once", async () => {
  const { order } = await heldOrder();
  const results = await concurrently(3, () => api(buyer, "PATCH", `/sales/orders/${order.id}/cancel`));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const refunds = await query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Refund Complete' AND context_id = (SELECT sales_item_id FROM sale_orders WHERE id = ?)`, [buyer.id, order.id]);
  assert.equal(Number(refunds[0].n), 1);
});

test("the admin Reports list shows which order is disputed so it can be settled there", async () => {
  const { item, order } = await disputedOrder();
  const reports = (await api(admin, "GET", "/reports")).data;
  const mine = reports.find((r) => r.context_type === "sales_item" && Number(r.context_id) === Number(item.id));
  assert.ok(mine, "the report is in the admin list");
  assert.equal(mine.context_status, "Disputed");
  assert.equal(Number(mine.context_order_id), Number(order.id));
});

test("the Action Centre shows a reported sale to both sides", async () => {
  const { item } = await disputedOrder(seller, "no_show");
  for (const who of [buyer, seller]) {
    const { needsYou, waitingOnOthers } = (await api(who, "GET", "/activity")).data;
    const items = [...needsYou, ...waitingOnOthers];
    const card = items.find((c) => c.kind === "sale" && c.href.includes(`id=${item.id}`));
    assert.ok(card, "card present");
    assert.equal(card.status, "Problem reported");
  }
});
