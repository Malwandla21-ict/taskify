const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeTask, apply, assignTask, concurrently } = require("./helpers");

let poster, worker, outsider;

before(async () => {
  await start();
  poster = await createUser();
  worker = await createUser();
  outsider = await createUser();
});
after(stop);

const paymentFor = async (taskId) => (await query(`SELECT status FROM payments WHERE task_id = ?`, [taskId]))[0]?.status;

test("a student can't take a task directly: the poster chooses", async () => {
  const task = await makeTask(poster);
  const r = await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  assert.equal(r.status, 400);
  assert.match(r.message, /poster chooses/i);
  assert.equal((await query(`SELECT status, accepted_by FROM tasks WHERE id = ?`, [task.id]))[0].status, "Posted");
});

test("the poster can't apply for their own task", async () => {
  const task = await makeTask(poster);
  const r = await api(poster, "POST", "/offers", { contextType: "task", contextId: task.id, amount: Number(task.price) });
  assert.ok(r.status >= 400, `expected a rejection, got ${r.status}`);
});

test("applying again while your application is open is refused", async () => {
  const task = await makeTask(poster);
  await apply(worker, task);
  const again = await api(worker, "POST", "/offers", { contextType: "task", contextId: task.id, amount: Number(task.price) });
  assert.equal(again.status, 409);
});

test("only the poster can choose from the applicants", async () => {
  const task = await makeTask(poster);
  const application = await apply(worker, task);
  for (const who of [worker, outsider]) {
    const r = await api(who, "PATCH", `/offers/${application.id}/accept`, { expectedAmount: Number(task.price) });
    assert.ok(r.status >= 400, "an applicant can't pick themselves, and strangers can't pick anyone");
  }
  assert.equal((await query(`SELECT status FROM tasks WHERE id = ?`, [task.id]))[0].status, "Posted");
});

test("choosing one applicant assigns the task to them, holds the payment, and closes the other applications", async () => {
  const task = await makeTask(poster);
  const other = await createUser();
  const chosen = await apply(worker, task);
  const notChosen = await apply(other, task);
  assert.equal((await api(poster, "PATCH", `/offers/${chosen.id}/accept`, { expectedAmount: Number(task.price) })).status, 200);

  const row = (await query(`SELECT status, accepted_by FROM tasks WHERE id = ?`, [task.id]))[0];
  assert.equal(row.status, "Accepted");
  assert.equal(Number(row.accepted_by), worker.id);
  assert.equal(await paymentFor(task.id), "Held");
  assert.notEqual((await query(`SELECT status FROM offers WHERE id = ?`, [notChosen.id]))[0].status, "Pending");
});

test("only the assigned worker can start and finish; only the poster can confirm", async () => {
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
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
  await assignTask(poster, worker, task);
  const early = await api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`);
  assert.ok(early.status >= 400);
  assert.equal(await paymentFor(task.id), "Held");
});

test("steps can't be skipped or done out of order", async () => {
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
  const skip = await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  assert.ok(skip.status >= 400, "can't mark done before starting");
});

test("accepting several applicants at the same moment: only one gets the task", async () => {
  const task = await makeTask(poster);
  const applicants = [worker, ...(await Promise.all([createUser(), createUser(), createUser()]))];
  const applications = [];
  for (const u of applicants) applications.push(await apply(u, task));
  const results = await Promise.all(applications.map((a) =>
    api(poster, "PATCH", `/offers/${a.id}/accept`, { expectedAmount: Number(task.price) })));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
});

test("double-clicking Start only starts the task once", async () => {
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
  const results = await concurrently(5, () => api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
});

test("double-clicking Mark done only marks it once", async () => {
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  const results = await concurrently(5, () => api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" }));
  assert.equal(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
});

test("double-clicking Confirm releases payment once and notifies the worker once", async () => {
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
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
