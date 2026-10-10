const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, query, createUser, makeTask, concurrently } = require("./helpers");
const { sendTaskReviewReminders } = require("../src/jobs/scheduler");

let admin, poster, worker, outsider;

before(async () => {
  await start();
  admin = await createUser({ role: "admin", totp: true });
  poster = await createUser();
  worker = await createUser();
  outsider = await createUser();
});
after(stop);

const reason = "The boxes were left outside, not moved into the room.";
const taskRow = async (id) => (await query(`SELECT status, dispute_outcome FROM tasks WHERE id = ?`, [id]))[0];
const paymentFor = async (id) => (await query(`SELECT status FROM payments WHERE task_id = ?`, [id]))[0]?.status;
const countNotices = async (userId, taskId, title) => Number((await query(
  `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND context_type = 'task' AND context_id = ? AND title = ?`,
  [userId, taskId, title]))[0].n);

/* A task the worker has finished and the poster now has to review. */
async function doneTask() {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  return task;
}
const dispute = (who, id, body = { reason }) => api(who, "POST", `/tasks/${id}/dispute`, body);

test("only the poster can report a problem, and only once the work is marked done", async () => {
  const task = await makeTask(poster);
  await api(worker, "PATCH", `/tasks/${task.id}/accept`);
  assert.equal((await dispute(poster, task.id)).status, 400, "too early: the worker hasn't finished");

  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "In Progress" });
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  for (const who of [worker, outsider]) assert.equal((await dispute(who, task.id)).status, 403);
  assert.equal((await dispute(poster, task.id, { reason: "bad" })).status, 400, "a reason is required");
  assert.equal((await dispute(poster, task.id)).status, 200);
  assert.equal((await dispute(poster, task.id)).status, 400, "can't report the same task twice");
});

test("reporting a problem keeps the payment held, tells the worker, and files a report for admins", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.equal((await taskRow(task.id)).status, "Disputed");
  assert.equal(await paymentFor(task.id), "Held");
  assert.equal(await countNotices(worker.id, task.id, "Problem Reported"), 1);
  const reports = await query(`SELECT status, reported_user_id FROM reports WHERE context_type = 'task' AND context_id = ?`, [task.id]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "Pending");
  assert.equal(Number(reports[0].reported_user_id), worker.id);
});

test("while disputed, the worker can't confirm and nobody can cancel it", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.ok((await api(worker, "PATCH", `/tasks/${task.id}/confirm-completion`)).status >= 400);
  assert.ok((await api(poster, "PATCH", `/tasks/${task.id}/cancel`)).status >= 400);
  assert.equal(await paymentFor(task.id), "Held");
});

test("what went wrong is only visible to the poster, the worker and admins", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  for (const who of [poster, worker, admin]) {
    assert.equal((await api(who, "GET", `/tasks/${task.id}`)).data.dispute_reason, reason);
  }
  for (const who of [outsider, null]) {
    assert.equal((await api(who, "GET", `/tasks/${task.id}`)).data.dispute_reason, null);
  }
});

test("only admins can settle a dispute", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  for (const who of [poster, worker, outsider]) {
    assert.equal((await api(who, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "release" })).status, 403);
  }
  assert.equal((await taskRow(task.id)).status, "Disputed");
});

test("admin outcome: release pays the worker and closes the report", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.equal((await api(admin, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "release", note: "Photos show it was done." })).status, 200);
  assert.deepEqual(await taskRow(task.id), { status: "Completed", dispute_outcome: "released" });
  assert.equal(await paymentFor(task.id), "Released");
  const open = await query(`SELECT COUNT(*) AS n FROM reports WHERE context_type = 'task' AND context_id = ? AND status = 'Pending'`, [task.id]);
  assert.equal(Number(open[0].n), 0);
});

test("admin outcome: refund returns the money to the poster and cancels the task", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.equal((await api(admin, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "refund" })).status, 200);
  assert.deepEqual(await taskRow(task.id), { status: "Cancelled", dispute_outcome: "refunded" });
  assert.equal(await paymentFor(task.id), "Refunded");
});

test("admin outcome: rework sends it back to the worker, who can finish and resubmit", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.equal((await api(admin, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "rework" })).status, 200);
  assert.equal((await taskRow(task.id)).status, "In Progress");
  assert.equal(await paymentFor(task.id), "Held");
  assert.equal((await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" })).status, 200);
});

test("a dispute can only be settled once, even if two admins click at the same moment", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  const results = await concurrently(4, () => api(admin, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "release" }));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test("the poster can still confirm after reporting a problem", async () => {
  const task = await doneTask();
  await dispute(poster, task.id);
  assert.equal((await api(poster, "PATCH", `/tasks/${task.id}/confirm-completion`)).status, 200);
  assert.deepEqual(await taskRow(task.id), { status: "Completed", dispute_outcome: "poster_confirmed" });
  assert.equal(await paymentFor(task.id), "Released");
});

test("an overdue review reminds the poster once, escalates to admins once, and never pays out", async () => {
  const task = await doneTask();

  await query(`UPDATE tasks SET awaiting_confirmation_at = NOW() - INTERVAL 49 HOUR WHERE id = ?`, [task.id]);
  await sendTaskReviewReminders();
  await sendTaskReviewReminders();
  assert.equal(await countNotices(poster.id, task.id, "Please Review Your Task"), 1, "reminded exactly once");
  assert.equal(await countNotices(admin.id, task.id, "Task Waiting Too Long for Review"), 0, "too early to escalate");

  await query(`UPDATE tasks SET awaiting_confirmation_at = NOW() - INTERVAL 8 DAY WHERE id = ?`, [task.id]);
  await Promise.all([sendTaskReviewReminders(), sendTaskReviewReminders()]);
  assert.equal(await countNotices(admin.id, task.id, "Task Waiting Too Long for Review"), 1, "escalated exactly once");
  assert.equal(await countNotices(worker.id, task.id, "We're Following Up"), 1);

  assert.equal((await taskRow(task.id)).status, "Awaiting Confirmation", "still waiting for a person to decide");
  assert.equal(await paymentFor(task.id), "Held", "no automatic payout");
});

test("marking it done again after rework restarts the review clock", async () => {
  const task = await doneTask();
  await query(`UPDATE tasks SET awaiting_confirmation_at = NOW() - INTERVAL 49 HOUR WHERE id = ?`, [task.id]);
  await sendTaskReviewReminders();
  await dispute(poster, task.id);
  await api(admin, "PATCH", `/admin/tasks/${task.id}/resolve-dispute`, { outcome: "rework" });
  await api(worker, "PATCH", `/tasks/${task.id}/status`, { status: "Awaiting Confirmation" });
  const row = (await query(`SELECT review_reminder_sent_at, awaiting_confirmation_at > NOW() - INTERVAL 1 MINUTE AS fresh FROM tasks WHERE id = ?`, [task.id]))[0];
  assert.equal(row.review_reminder_sent_at, null);
  assert.equal(Number(row.fresh), 1);
});
