const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeTask, concurrently } = require("./helpers");

let poster, worker, outsider;

before(async () => {
  await start();
  poster = await createUser();
  worker = await createUser();
  outsider = await createUser();
});
after(stop);

const paymentFor = async (taskId) => (await query(`SELECT status FROM payments WHERE task_id = ?`, [taskId]))[0]?.status;

test("the poster cannot accept their own task", async () => {
  const task = await makeTask(poster);
  const r = await api(poster, "PATCH", `/tasks/${task.id}/accept`);
  assert.ok(r.status >= 400, `expected a rejection, got ${r.status}`);
});

test("only the assigned worker can start and finish; only the poster can confirm", async () => {
  const task = await makeTask(poster);
  assert.equal((await api(worker, "PATCH", `/tasks/${task.id}/accept`)).status, 200);
  assert.equal(await paymentFor(task.id), "Held");

  for (const who of [poster, outsider]) {
    const r = await api(who, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
    assert.ok(r.status >= 400, "only the worker can start");
  }
  assert.equal((await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" })).status, 200);

  for (const who of [poster, outsider]) {
    const r = await api(who, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
    assert.ok(r.status >= 400, "only the worker can mark it done");
  }
  assert.equal((await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" })).status, 200);

  for (const who of [worker, outsider]) {
    const r = await api(who, "PATCH", `/tasks/${task.id}/confirm-completion`);
    assert.ok(r.status >= 400, "the worker cannot confirm on the poster's behalf");
  }
  assert.equal(await paymentFor(task.id), "Held", "payment is still held until the poster confirms");

  assert.equal((await api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`)).status, 200);
  assert.equal(await paymentFor(task.id), "Released");
});

test("payment can't be released before the worker has finished", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  const early = await api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`);
  assert.ok(early.status >= 400);
  assert.equal(await paymentFor(task.id), "Held");
});

test("steps can't be skipped or done out of order", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  const skip = await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  assert.ok(skip.status >= 400, "can't mark done before starting");
});

test("two people accepting at the same moment: only one gets the task", async () => {
  const task = await makeTask(poster);
  const others = await Promise.all([createUser(), createUser(), createUser()]);
  const results = await Promise.all([worker, ...others].map((u) => api(u, "PATCH", `/tasks/${task.id}/accept`)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test("double-clicking Start only starts the task once", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  const results = await concurrently(5, () => api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
});

test("double-clicking Mark done only marks it once", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  const results = await concurrently(5, () => api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
});

test("double-clicking Confirm releases payment once and notifies the worker once", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });

  const results = await concurrently(5, () => api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const released = await query(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND context_type = 'task' AND context_id = ? AND title = 'Payment Released'`,
    [worker.id, task.id]
  );
  assert.equal(Number(released[0].n), 1);
});
