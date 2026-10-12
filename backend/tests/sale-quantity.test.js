const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeSale, concurrently } = require("./helpers");

/*
  Selling one item vs several of the same item (sales_items.quantity).
  A single item leaves the marketplace as soon as it sells; a listing with
  several stays up until the last one has gone.
*/

let seller, buyers;

before(async () => {
  await start();
  seller = await createUser();
  buyers = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
});
after(stop);

const itemRow = async (id) => (await query(`SELECT status, quantity, quantity_sold FROM sales_items WHERE id = ?`, [id]))[0];
const isListed = async (id) => ((await api(null, "GET", "/sales")).data || []).some(i => Number(i.id) === Number(id));

async function buyAndHandOver(itemId, buyer) {
  const bought = await api(buyer, "POST", `/sales/${itemId}/buy`);
  assert.equal(bought.status, 201, bought.message);
  const order = (await api(buyer, "GET", `/sales/${itemId}`)).data.my_order;
  const released = await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code });
  assert.equal(released.status, 200, released.message);
  return order;
}

test("a listing defaults to a single item, and it leaves the marketplace once it's sold", async () => {
  const item = await makeSale(seller);
  assert.equal(Number(item.quantity), 1);
  assert.ok(await isListed(item.id));

  await buyAndHandOver(item.id, buyers[0]);
  assert.deepEqual(await itemRow(item.id), { status: "Sold", quantity: 1, quantity_sold: 1 });
  assert.equal(await isListed(item.id), false);
});

test("with several, the listing stays up after each sale until the last one goes", async () => {
  const item = await makeSale(seller, { quantity: 3 });

  await buyAndHandOver(item.id, buyers[0]);
  assert.equal((await itemRow(item.id)).status, "Available");
  assert.ok(await isListed(item.id));

  await buyAndHandOver(item.id, buyers[1]);
  assert.equal((await itemRow(item.id)).status, "Available");

  await buyAndHandOver(item.id, buyers[2]);
  assert.deepEqual(await itemRow(item.id), { status: "Sold", quantity: 3, quantity_sold: 3 });
  assert.equal(await isListed(item.id), false);
});

test("units held for handover count: once they're all held the listing is reserved, and a cancel frees one", async () => {
  const item = await makeSale(seller, { quantity: 2 });
  assert.equal((await api(buyers[0], "POST", `/sales/${item.id}/buy`)).status, 201);
  assert.equal((await itemRow(item.id)).status, "Available");
  assert.equal((await api(buyers[1], "POST", `/sales/${item.id}/buy`)).status, 201);
  assert.equal((await itemRow(item.id)).status, "Reserved");

  const third = await api(buyers[2], "POST", `/sales/${item.id}/buy`);
  assert.ok(third.status >= 400, "no units left to buy");

  const order = (await api(buyers[0], "GET", `/sales/${item.id}`)).data.my_order;
  assert.equal((await api(buyers[0], "PATCH", `/sales/orders/${order.id}/cancel`)).status, 200);
  assert.equal((await itemRow(item.id)).status, "Available");
});

test("people buying at the same moment can't hold more than the seller has", async () => {
  const item = await makeSale(seller, { quantity: 2 });
  const statuses = (await Promise.all(buyers.map(b => api(b, "POST", `/sales/${item.id}/buy`)))).map(r => r.status);
  assert.equal(statuses.filter(s => s === 201).length, 2, `statuses: ${statuses}`);
  const [{ n }] = await query(`SELECT COUNT(*) AS n FROM sale_orders WHERE sales_item_id = ? AND status = 'Held'`, [item.id]);
  assert.equal(Number(n), 2);
});

test("one buyer can't hold two units of the same listing at once", async () => {
  const item = await makeSale(seller, { quantity: 3 });
  assert.equal((await api(buyers[0], "POST", `/sales/${item.id}/buy`)).status, 201);
  assert.equal((await api(buyers[0], "POST", `/sales/${item.id}/buy`)).status, 400);
});

test("the seller sees every buyer waiting for handover, without anyone's code", async () => {
  const item = await makeSale(seller, { quantity: 3 });
  await api(buyers[0], "POST", `/sales/${item.id}/buy`);
  await api(buyers[1], "POST", `/sales/${item.id}/buy`);
  const view = (await api(seller, "GET", `/sales/${item.id}`)).data;
  assert.equal(view.open_orders.length, 2);
  assert.ok(view.open_orders.every(o => o.handover_code == null && o.role === "seller"));
  assert.equal(Number(view.quantity_on_hold), 2);
  assert.equal((await api(buyers[2], "GET", `/sales/${item.id}`)).data.open_orders, undefined);
});

test("cash sales: 'sold one' counts down, 'sold the rest' finishes it, double clicks only count once", async () => {
  const item = await makeSale(seller, { quantity: 4, price: 50 });

  const once = await concurrently(1, () => api(seller, "PATCH", `/sales/${item.id}/sold`));
  assert.equal(once[0].status, 200);
  assert.deepEqual(await itemRow(item.id), { status: "Available", quantity: 4, quantity_sold: 1 });

  const rest = await api(seller, "PATCH", `/sales/${item.id}/sold`, { all: true });
  assert.equal(rest.status, 200);
  assert.deepEqual(await itemRow(item.id), { status: "Sold", quantity: 4, quantity_sold: 4 });

  assert.equal((await api(seller, "PATCH", `/sales/${item.id}/sold`)).status, 400);
});

test("a single cash item marked sold leaves the marketplace", async () => {
  const item = await makeSale(seller, { price: 50 });
  assert.equal((await api(seller, "PATCH", `/sales/${item.id}/sold`)).status, 200);
  assert.equal((await itemRow(item.id)).status, "Sold");
  assert.equal(await isListed(item.id), false);
});

test("'sold the rest' never touches units a buyer has already paid for", async () => {
  const item = await makeSale(seller, { quantity: 3 });
  await api(buyers[0], "POST", `/sales/${item.id}/buy`);
  assert.equal((await api(seller, "PATCH", `/sales/${item.id}/sold`, { all: true })).status, 200);
  assert.deepEqual(await itemRow(item.id), { status: "Reserved", quantity: 3, quantity_sold: 2 });

  const order = (await api(buyers[0], "GET", `/sales/${item.id}`)).data.my_order;
  assert.equal((await api(seller, "POST", `/sales/orders/${order.id}/release`, { code: order.handover_code })).status, 200);
  assert.equal((await itemRow(item.id)).status, "Sold");
});

test("the quantity can't be edited below what's already sold or held", async () => {
  const item = await makeSale(seller, { quantity: 3 });
  await buyAndHandOver(item.id, buyers[0]);
  await api(buyers[1], "POST", `/sales/${item.id}/buy`);

  const edit = (quantity) => api(seller, "PUT", `/sales/${item.id}`, {
    title: "Test item", description: "An item listed by the automated tests.", category: "Other",
    price: 400, conditionStatus: "Good", location: "Library", quantity
  });
  assert.equal((await edit(2)).status, 400);
  const raised = await edit(5);
  assert.equal(raised.status, 200, raised.message);
  assert.deepEqual(await itemRow(item.id), { status: "Available", quantity: 5, quantity_sold: 1 });
});

test("quantity must be a whole number from 1 to 100", async () => {
  for (const quantity of [0, -2, 1.5, 101, "lots"]) {
    const r = await api(seller, "POST", "/sales", {
      title: "Test item", description: "An item listed by the automated tests.", category: "Other",
      price: 400, conditionStatus: "Good", location: "Library", quantity
    });
    assert.equal(r.status, 400, `quantity ${quantity} should be rejected`);
  }
});
