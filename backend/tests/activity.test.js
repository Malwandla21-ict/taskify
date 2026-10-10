const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, createUser, makeTask, makeSale, makeEquipment, assignTask, day } = require("./helpers");

before(start);
after(stop);

const activity = async (user) => {
  const r = await api(user, "GET", "/activity");
  assert.equal(r.status, 200, r.message);
  return r.data;
};
const find = (list, key) => list.find((i) => i.key === key);

test("signed-out visitors can't see an action centre", async () => {
  assert.equal((await api(null, "GET", "/activity")).status, 401);
});

test("a task shows the right next step to each person at every stage", async () => {
  const poster = await createUser();
  const worker = await createUser();
  const outsider = await createUser();
  const task = await makeTask(poster);
  const key = `task-${task.id}`;

  await assignTask(poster, worker, task);
  let w = await activity(worker), p = await activity(poster);
  assert.equal(find(w.needsYou, key).action.label, "Start task");
  assert.ok(find(p.waitingOnOthers, key), "poster waits for the worker to start");
  assert.equal(find(p.needsYou, key), undefined);

  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  w = await activity(worker);
  assert.equal(find(w.needsYou, key).action.label, "Mark as done");

  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  w = await activity(worker); p = await activity(poster);
  const posterItem = find(p.needsYou, key);
  assert.equal(posterItem.action.endpoint, `/tasks/${task.id}/confirm-completion`);
  assert.equal(posterItem.status, "Awaiting your confirmation");
  assert.ok(find(w.waitingOnOthers, key), "worker waits for the poster to confirm");
  assert.equal(find(w.needsYou, key), undefined, "the worker is never offered the poster's confirm step");

  const o = await activity(outsider);
  assert.equal(find([...o.needsYou, ...o.waitingOnOthers], key), undefined, "strangers see nothing");

  await api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`);
  p = await activity(poster); w = await activity(worker);
  assert.equal(find([...p.needsYou, ...p.waitingOnOthers], key), undefined, "finished tasks drop off");
  assert.equal(find([...w.needsYou, ...w.waitingOnOthers], key), undefined);
});

test("a protected sale asks both sides to meet, and never exposes the handover code", async () => {
  const seller = await createUser();
  const buyer = await createUser();
  const item = await makeSale(seller, { price: 400 });
  await api(buyer, "POST", `/sales/${item.id}/buy`);
  const code = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order.handover_code;

  const s = await activity(seller), b = await activity(buyer);
  const sellerItem = s.needsYou.find((i) => i.kind === "sale" && i.title === item.title && i.href.includes(`id=${item.id}`));
  const buyerItem = b.needsYou.find((i) => i.kind === "sale" && i.href.includes(`id=${item.id}`));
  assert.equal(sellerItem.action.label, "Enter handover code");
  assert.equal(buyerItem.action.label, "View handover code");
  for (const [who, data] of [["seller", s], ["buyer", b]]) {
    const json = JSON.stringify(data);
    assert.ok(!/handover_code|handoverCode/.test(json), `no handover-code field in the ${who}'s action centre`);
    assert.ok(!json.includes(`"${code}"`) && !json.includes(`:${code},`) && !json.includes(`:${code}}`),
      `the code itself never appears in the ${who}'s action centre (it's only on the item page, for the buyer)`);
  }
});

test("a booking request is the owner's to approve, and then the renter's to collect", async () => {
  const owner = await createUser();
  const renter = await createUser();
  const item = await makeEquipment(owner);
  const booking = (await api(renter, "POST", `/equipment/${item.id}/book`, { startDate: day(1), endDate: day(2) })).data;
  const key = `rental-${booking.id}`;

  let o = await activity(owner), r = await activity(renter);
  const request = find(o.needsYou, key);
  assert.equal(request.action.endpoint, `/equipment/bookings/${booking.id}/confirm`);
  assert.equal(request.secondaryAction.label, "Decline");
  assert.ok(request.deadline, "the owner sees when the request expires");
  assert.ok(find(r.waitingOnOthers, key));

  /* The renter can't use the owner's inline Approve action. */
  assert.equal((await api(renter, "PATCH", request.action.endpoint)).status, 403);

  assert.equal((await api(owner, "PATCH", request.action.endpoint)).status, 200);
  r = await activity(renter);
  assert.equal(find(r.needsYou, key).action.label, "Confirm pickup");
});

test("an offer is shown as the responder's turn", async () => {
  const poster = await createUser();
  const offerer = await createUser();
  const task = await makeTask(poster);
  const offer = (await api(offerer, "POST", "/offers", { contextType: "task", contextId: task.id, amount: 120 })).data;
  const key = `offer-${offer.id}`;

  const p = await activity(poster), f = await activity(offerer);
  assert.equal(find(p.needsYou, key).action.label, "Respond to offer");
  assert.ok(find(f.waitingOnOthers, key));
});
