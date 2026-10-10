const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, rawFetch, query, createUser, makeTask, makeSale, assignTask } = require("./helpers");
const { csvCell } = require("../src/services/reportExport.service");

let admin, student;
const today = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);

before(async () => {
  await start();
  admin = await createUser({ role: "admin", totp: true });
  student = await createUser();
});
after(stop);

/* Downloads need the raw response (CSV text), not the JSON helper. */
async function download(user, type, params = "") {
  const r = await rawFetch(user, `/admin/exports/${type}${params}`);
  return { status: r.status, type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition"), exposed: r.headers.get("access-control-expose-headers"), text: await r.text() };
}

test("only admins can see analytics or download reports", async () => {
  assert.equal((await api(student, "GET", "/admin/analytics")).status, 403);
  assert.equal((await api(null, "GET", "/admin/analytics")).status, 401);
  assert.equal((await download(student, "users")).status, 403);
  assert.equal((await download(null, "users")).status, 401);
});

test("an admin without 2FA can't use them either", async () => {
  const no2fa = await createUser({ role: "admin", totp: false });
  assert.equal((await api(no2fa, "GET", "/admin/analytics")).status, 403);
});

test("date ranges are checked", async () => {
  assert.equal((await api(admin, "GET", "/admin/analytics?from=2026-10-31&to=2026-10-01")).status, 400, "start after end");
  assert.equal((await api(admin, "GET", "/admin/analytics?from=2024-01-01&to=2026-01-01")).status, 400, "more than a year");
  assert.equal((await api(admin, "GET", "/admin/analytics?from=not-a-date")).status, 400);
  assert.equal((await api(admin, "GET", "/admin/exports/passwords")).status, 400, "unknown report type");
});

test("analytics default to the last 30 days with a previous period to compare", async () => {
  const r = await api(admin, "GET", "/admin/analytics");
  assert.equal(r.status, 200);
  assert.equal(r.data.range.days, 30);
  assert.equal(r.data.range.to, today());
  assert.equal(r.data.growth.signups.series.labels.length, 30, "one bucket per day for a 30-day range");
  assert.equal(r.data.transactions.demo, true, "money is labelled as demo");
});

test("long ranges are grouped by week or month instead of 366 daily bars", async () => {
  const r = await api(admin, "GET", "/admin/analytics?from=2025-10-11&to=2026-10-10");
  assert.equal(r.data.range.bucket, "month");
  assert.ok(r.data.growth.signups.series.labels.length <= 13);
});

test("new activity today shows up in today's numbers", async () => {
  const url = `/admin/analytics?from=${today()}&to=${today()}`;
  const before = (await api(admin, "GET", url)).data;

  const poster = await createUser();
  const worker = await createUser();
  const task = await makeTask(poster);
  await assignTask(poster, worker, task);
  await makeSale(poster, { price: 120 });

  const afterData = (await api(admin, "GET", url)).data;
  assert.equal(afterData.growth.signups.total, before.growth.signups.total + 2);
  assert.equal(afterData.listings.byType.tasks.total, before.listings.byType.tasks.total + 1);
  assert.equal(afterData.listings.byType.sales.total, before.listings.byType.sales.total + 1);
  assert.equal(afterData.funnels.tasks.assigned, before.funnels.tasks.assigned + 1);
  assert.ok(afterData.growth.activeUsers.total >= before.growth.activeUsers.total + 2);
});

test("CSV cells that look like spreadsheet formulas are neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://evil\")"), "\"'=HYPERLINK(\"\"http://evil\"\")\"");
  assert.equal(csvCell("+27 71 000 0000"), "'+27 71 000 0000");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("Normal, with comma"), "\"Normal, with comma\"");
});

test("a transactions report downloads as CSV, escapes formula titles, and is audit-logged", async () => {
  const poster = await createUser();
  await makeTask(poster, { title: "=HYPERLINK(\"http://evil.example\",\"click\")" });

  const file = await download(admin, "transactions", `?from=${today()}&to=${today()}`);
  assert.equal(file.status, 200);
  assert.match(file.type, /text\/csv/);
  assert.match(file.disposition, new RegExp(`taskify-transactions-${today()}-to-${today()}\\.csv`));
  assert.match(file.exposed || "", /Content-Disposition/, "the page (on another domain) is allowed to read the filename");
  const lines = file.text.replace(/^﻿/, "").split("\r\n");
  assert.match(lines[0], /^Type,ID,Item,Created \(SAST\),Status/);
  assert.ok(file.text.includes("'=HYPERLINK"), "the formula title is prefixed so it can't run");
  assert.ok(!/(^|,)=HYPERLINK/m.test(file.text), "no cell starts with a raw formula");

  const logged = await query(
    `SELECT COUNT(*) AS n FROM admin_audit_logs WHERE admin_id = ? AND action = 'export.transactions'`, [admin.id]
  );
  assert.ok(Number(logged[0].n) >= 1, "the download is in the audit log");
});

test("no report contains emails, phone numbers or handover codes", async () => {
  const seller = await createUser();
  const buyer = await createUser();
  const item = await makeSale(seller, { price: 400 });
  await api(buyer, "POST", `/sales/${item.id}/buy`);
  const code = (await api(buyer, "GET", `/sales/${item.id}`)).data.my_order.handover_code;

  for (const type of ["transactions", "users", "reports", "moderation", "audit"]) {
    const file = await download(admin, type, `?from=${today()}&to=${today()}`);
    assert.equal(file.status, 200, type);
    assert.ok(!/@ump\.ac\.za/i.test(file.text), `${type}: no email addresses`);
    assert.ok(!/0710000000/.test(file.text), `${type}: no phone numbers`);
    assert.ok(!/handover/i.test(file.text.split("\r\n")[0]), `${type}: no handover-code column`);
    if (type === "transactions") assert.ok(!file.text.includes(`,${code},`), "the handover code never appears");
  }
});
