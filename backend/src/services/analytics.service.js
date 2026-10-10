const pool = require("../config/db");

/*
  Admin Analytics — read-only numbers for a chosen date range, plus the
  same numbers for the period just before it (for "up 18%" comparisons).

  Dates are South African days (UTC+2, no daylight saving). The database
  may run in another timezone (the practice database uses SAST, Aiven uses
  UTC), so every filter and day-grouping converts through the session's
  own timezone with CONVERT_TZ — the same SQL gives the same answer on both.

  Money is all DEMO (see config/paymentSettings.js): these are the amounts
  the payment simulation recorded, not real money.
*/

const SAST = "+02:00";
const MAX_RANGE_DAYS = 366;
const DAY_MS = 86400000;

function httpError(message, statusCode = 400) {
  const error = new Error(message); error.statusCode = statusCode; return error;
}

function todaySast() {
  return new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
}

const addDays = (dateText, n) => new Date(Date.parse(`${dateText}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/* Validates "YYYY-MM-DD" from/to (inclusive). Defaults to the last 30 days. */
function parseRange({ from, to } = {}) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const end = to || todaySast();
  const start = from || addDays(end, -29);
  if (!isDate(start) || !isDate(end)) throw httpError("Dates must look like 2026-10-31.");
  if (start > end) throw httpError("The start date must be on or before the end date.");
  const days = daysBetween(start, end) + 1;
  if (days > MAX_RANGE_DAYS) throw httpError(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);

  const prevTo = addDays(start, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return {
    from: start, to: end, days, prevFrom, prevTo,
    /* Half-open bounds in SAST wall-clock time, converted in SQL. */
    startAt: `${start} 00:00:00`, endAt: `${addDays(end, 1)} 00:00:00`,
    prevStartAt: `${prevFrom} 00:00:00`, prevEndAt: `${start} 00:00:00`
  };
}

/* SQL for "column falls inside [start, end)" plus its two parameters. */
function within(column) {
  return `${column} >= CONVERT_TZ(?, '${SAST}', @@session.time_zone) AND ${column} < CONVERT_TZ(?, '${SAST}', @@session.time_zone)`;
}
const sastDay = (column) => `DATE_FORMAT(CONVERT_TZ(${column}, @@session.time_zone, '${SAST}'), '%Y-%m-%d')`;

async function one(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows[0] || {};
}
async function many(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
const num = (v) => (v == null ? 0 : Number(v));
const round1 = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);

/* Daily counts → a full, gap-free series, bucketed by day, week or month
   depending on how long the range is (so a year doesn't draw 366 bars). */
function bucketSize(days) { return days <= 31 ? "day" : days <= 120 ? "week" : "month"; }
function bucketKey(dateText, size, from) {
  if (size === "day") return dateText;
  if (size === "month") return dateText.slice(0, 7);
  return addDays(from, Math.floor(daysBetween(from, dateText) / 7) * 7); // weeks starting on the range's first day
}
function series(rows, range, valueField = "n") {
  const size = bucketSize(range.days);
  const buckets = new Map();
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) buckets.set(bucketKey(d, size, range.from), 0);
  for (const row of rows) {
    const key = bucketKey(row.day, size, range.from);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + num(row[valueField]));
  }
  return { bucket: size, labels: [...buckets.keys()], values: [...buckets.values()].map((v) => Math.round(v * 100) / 100) };
}

async function dailyCounts(table, column, range, extraWhere = "") {
  return many(
    `SELECT ${sastDay(column)} AS day, COUNT(*) AS n FROM ${table}
     WHERE ${within(column)} ${extraWhere} GROUP BY day`,
    [range.startAt, range.endAt]
  );
}

async function growth(range) {
  const signupRows = await dailyCounts("users", "created_at", range);
  const byType = await many(
    `SELECT member_type, COUNT(*) AS n FROM users WHERE ${within("created_at")} GROUP BY member_type`,
    [range.startAt, range.endAt]
  );
  const prevSignups = await one(`SELECT COUNT(*) AS n FROM users WHERE ${within("created_at")}`, [range.prevStartAt, range.prevEndAt]);

  /* Active = signed in, or did something (posted, applied/offered, bought,
     booked) in the period. */
  const activeSql = `
    SELECT COUNT(DISTINCT user_id) AS n FROM (
      SELECT user_id FROM security_events WHERE event IN ('login_success', 'login_trusted_device') AND user_id IS NOT NULL AND ${within("created_at")}
      UNION SELECT created_by FROM tasks WHERE ${within("created_at")}
      UNION SELECT seller_id FROM sales_items WHERE ${within("created_at")}
      UNION SELECT owner_id FROM equipment WHERE ${within("created_at")}
      UNION SELECT offerer_id FROM offers WHERE ${within("created_at")}
      UNION SELECT buyer_id FROM sale_orders WHERE ${within("created_at")}
      UNION SELECT renter_id FROM equipment_bookings WHERE ${within("created_at")}
    ) active`;
  const sevenTimes = (a, b) => Array(7).fill([a, b]).flat();
  const active = await one(activeSql, sevenTimes(range.startAt, range.endAt));
  const prevActive = await one(activeSql, sevenTimes(range.prevStartAt, range.prevEndAt));

  return {
    signups: { total: signupRows.reduce((s, r) => s + num(r.n), 0), previous: num(prevSignups.n), series: series(signupRows, range) },
    signupsByType: Object.fromEntries(byType.map((r) => [r.member_type || "Student", num(r.n)])),
    activeUsers: { total: num(active.n), previous: num(prevActive.n) }
  };
}

async function listings(range) {
  const types = { tasks: ["tasks", "created_at"], sales: ["sales_items", "created_at"], rentals: ["equipment", "created_at"], events: ["events", "created_at"] };
  const out = { byType: {}, previous: {} };
  for (const [key, [table, column]] of Object.entries(types)) {
    const rows = await dailyCounts(table, column, range);
    const prev = await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${within(column)}`, [range.prevStartAt, range.prevEndAt]);
    out.byType[key] = { total: rows.reduce((s, r) => s + num(r.n), 0), series: series(rows, range) };
    out.previous[key] = num(prev.n);
  }

  const p = [range.startAt, range.endAt];
  out.topCategories = await many(
    `SELECT kind, category, COUNT(*) AS n FROM (
       SELECT 'Task' AS kind, category FROM tasks WHERE ${within("created_at")}
       UNION ALL SELECT 'Sale', category FROM sales_items WHERE ${within("created_at")}
       UNION ALL SELECT 'Rental', category FROM equipment WHERE ${within("created_at")}
       UNION ALL SELECT 'Event', category FROM events WHERE ${within("created_at")}
     ) c GROUP BY kind, category ORDER BY n DESC LIMIT 8`,
    [...p, ...p, ...p, ...p]
  );
  out.topCategories = out.topCategories.map((r) => ({ kind: r.kind, category: r.category, count: num(r.n) }));

  const sections = await one(
    `SELECT SUM(section = 'Academic') AS academic, SUM(section = 'General') AS general FROM (
       SELECT section FROM tasks WHERE ${within("created_at")}
       UNION ALL SELECT section FROM sales_items WHERE ${within("created_at")}
       UNION ALL SELECT section FROM equipment WHERE ${within("created_at")}
       UNION ALL SELECT section FROM events WHERE ${within("created_at")}
     ) s`,
    [...p, ...p, ...p, ...p]
  );
  out.sections = { academic: num(sections.academic), general: num(sections.general) };
  return out;
}

async function transactions(range) {
  const p = [range.startAt, range.endAt];

  const taskMoney = await one(
    `SELECT SUM(status = 'Released') AS completed, SUM(CASE WHEN status = 'Released' THEN amount ELSE 0 END) AS released,
            SUM(status = 'Refunded') AS refunded_count, SUM(CASE WHEN status = 'Refunded' THEN amount ELSE 0 END) AS refunded
     FROM payments WHERE ${within("updated_at")} AND status IN ('Released', 'Refunded')`, p
  );
  const saleMoney = await one(
    `SELECT COUNT(*) AS completed, SUM(item_price) AS released, SUM(protection_fee) AS fees
     FROM sale_orders WHERE status = 'Released' AND ${within("released_at")}`, p
  );
  const saleRefunds = await one(
    `SELECT COUNT(*) AS n, SUM(total_amount) AS refunded FROM sale_orders WHERE status = 'Refunded' AND ${within("updated_at")}`, p
  );
  const rentalMoney = await one(
    `SELECT COUNT(*) AS completed, SUM(rental_amount) AS released, SUM(protection_fee) AS fees
     FROM equipment_bookings WHERE payment_status = 'Released' AND ${within("returned_at")}`, p
  );
  const rentalCancelled = await one(
    `SELECT COUNT(*) AS n FROM equipment_bookings WHERE status = 'Cancelled' AND ${within("updated_at")}`, p
  );
  /* What's held right now (not range-bound): the simulation's open balance. */
  const heldNow = await one(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'Held')
     + (SELECT COALESCE(SUM(total_amount), 0) FROM sale_orders WHERE status IN ('Held', 'Disputed'))
     + (SELECT COALESCE(SUM(COALESCE(rental_amount,0) + COALESCE(protection_fee,0)), 0) FROM equipment_bookings WHERE payment_status = 'Held')
     + (SELECT COALESCE(SUM(deposit_amount), 0) FROM equipment_bookings WHERE deposit_status = 'Held') AS held`
  );

  const releasedRows = await many(
    `SELECT day, SUM(amount) AS n FROM (
       SELECT ${sastDay("updated_at")} AS day, amount FROM payments WHERE status = 'Released' AND ${within("updated_at")}
       UNION ALL SELECT ${sastDay("released_at")}, item_price FROM sale_orders WHERE status = 'Released' AND ${within("released_at")}
       UNION ALL SELECT ${sastDay("returned_at")}, rental_amount FROM equipment_bookings WHERE payment_status = 'Released' AND ${within("returned_at")}
     ) r GROUP BY day`,
    [...p, ...p, ...p]
  );

  const released = num(taskMoney.released) + num(saleMoney.released) + num(rentalMoney.released);
  return {
    demo: true,
    completed: { tasks: num(taskMoney.completed), sales: num(saleMoney.completed), rentals: num(rentalMoney.completed) },
    refundsOrCancellations: { tasks: num(taskMoney.refunded_count), sales: num(saleRefunds.n), rentals: num(rentalCancelled.n) },
    money: {
      released: Math.round(released * 100) / 100,
      refunded: Math.round((num(taskMoney.refunded) + num(saleRefunds.refunded)) * 100) / 100,
      protectionFees: Math.round((num(saleMoney.fees) + num(rentalMoney.fees)) * 100) / 100,
      heldNow: Math.round(num(heldNow.held) * 100) / 100
    },
    releasedSeries: series(releasedRows, range)
  };
}

async function speed(range) {
  const p = [range.startAt, range.endAt];
  const firstApplicant = await one(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, t.created_at, f.first_at)) / 60 AS hours FROM tasks t
     INNER JOIN (SELECT context_id, MIN(created_at) AS first_at FROM offers WHERE context_type = 'task' GROUP BY context_id) f
       ON f.context_id = t.id
     WHERE ${within("t.created_at")}`, p
  );
  const assigned = await one(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, t.created_at, pay.created_at)) / 60 AS hours FROM tasks t
     INNER JOIN payments pay ON pay.task_id = t.id WHERE ${within("t.created_at")}`, p
  );
  const review = await one(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, t.awaiting_confirmation_at, pay.updated_at)) / 60 AS hours FROM tasks t
     INNER JOIN payments pay ON pay.task_id = t.id
     WHERE pay.status = 'Released' AND t.awaiting_confirmation_at IS NOT NULL AND ${within("pay.updated_at")}`, p
  );
  const bookings = await one(
    `SELECT COUNT(*) AS requested,
            SUM(approved_at IS NOT NULL OR status IN ('Confirmed', 'Returned')) AS approved
     FROM equipment_bookings WHERE ${within("created_at")}`, p
  );
  const expired = await one(
    `SELECT COUNT(DISTINCT context_id) AS n FROM notifications
     WHERE title = 'Booking Request Expired' AND context_type = 'equipment_booking' AND ${within("created_at")}`, p
  );
  return {
    hoursToFirstApplicant: round1(firstApplicant.hours),
    hoursToAssign: round1(assigned.hours),
    hoursToConfirmCompletion: round1(review.hours),
    bookingRequests: { requested: num(bookings.requested), approved: num(bookings.approved), expired: num(expired.n) }
  };
}

async function trust(range) {
  const p = [range.startAt, range.endAt];
  const reports = await many(
    `SELECT category, status, COUNT(*) AS n FROM reports WHERE ${within("created_at")} GROUP BY category, status`, p
  );
  const byCategory = {};
  let pending = 0, resolved = 0;
  for (const r of reports) {
    byCategory[r.category || "other"] = (byCategory[r.category || "other"] || 0) + num(r.n);
    if (r.status === "Pending") pending += num(r.n); else resolved += num(r.n);
  }
  /* "Report a problem" on tasks (poster) and on sales (buyer or seller). */
  const taskDisputes = await one(`SELECT COUNT(*) AS n FROM tasks WHERE ${within("disputed_at")}`, p);
  const saleDisputes = await one(`SELECT COUNT(*) AS n FROM sale_orders WHERE ${within("disputed_at")}`, p);
  /* Outcomes from both tables (the two ENUM columns can't share one UNION
     because of differing collations, so they're added up here). */
  const outcomeQuery = (table) => many(
    `SELECT dispute_outcome AS outcome, COUNT(*) AS n, AVG(TIMESTAMPDIFF(MINUTE, disputed_at, dispute_resolved_at)) / 60 AS hours
     FROM ${table} WHERE dispute_outcome IS NOT NULL AND ${within("dispute_resolved_at")} GROUP BY dispute_outcome`, p
  );
  const disputeOutcomes = [...await outcomeQuery("tasks"), ...await outcomeQuery("sale_orders")];
  const resolvedTotal = disputeOutcomes.reduce((s, r) => s + num(r.n), 0);
  const avgResolve = resolvedTotal
    ? disputeOutcomes.reduce((s, r) => s + num(r.hours) * num(r.n), 0) / resolvedTotal : null;

  const blocked = await one(`SELECT COUNT(*) AS n FROM blocked_content_attempts WHERE ${within("created_at")}`, p);
  const flagged = await one(
    `SELECT COUNT(*) AS n FROM (
       SELECT id FROM tasks WHERE moderation_flags IS NOT NULL AND ${within("created_at")}
       UNION ALL SELECT id FROM sales_items WHERE moderation_flags IS NOT NULL AND ${within("created_at")}
       UNION ALL SELECT id FROM equipment WHERE moderation_flags IS NOT NULL AND ${within("created_at")}
       UNION ALL SELECT id FROM events WHERE moderation_flags IS NOT NULL AND ${within("created_at")}
     ) f`, [...p, ...p, ...p, ...p]
  );
  const suspensions = await one(`SELECT COUNT(*) AS n FROM users WHERE ${within("suspended_at")}`, p);
  const bans = await one(`SELECT COUNT(*) AS n FROM users WHERE ${within("banned_at")}`, p);

  return {
    reports: { total: pending + resolved, pending, resolved, byCategory },
    disputes: {
      opened: num(taskDisputes.n) + num(saleDisputes.n),
      openedByType: { tasks: num(taskDisputes.n), sales: num(saleDisputes.n) },
      resolved: resolvedTotal,
      outcomes: disputeOutcomes.reduce((o, r) => ({ ...o, [r.outcome]: (o[r.outcome] || 0) + num(r.n) }), {}),
      averageHoursToResolve: round1(avgResolve)
    },
    moderation: { flagged: num(flagged.n), blocked: num(blocked.n) },
    accounts: { suspended: num(suspensions.n), banned: num(bans.n) }
  };
}

/* Of the tasks / sales listings / booking requests created in the range,
   how far each got. */
async function funnels(range) {
  const p = [range.startAt, range.endAt];
  const tasks = await one(
    `SELECT COUNT(*) AS posted, SUM(accepted_by IS NOT NULL) AS assigned, SUM(status = 'Completed') AS completed,
            SUM(status = 'Cancelled') AS cancelled, SUM(disputed_at IS NOT NULL) AS disputed
     FROM tasks WHERE ${within("created_at")}`, p
  );
  const sales = await one(
    `SELECT COUNT(*) AS listed, SUM(status = 'Reserved') AS reserved, SUM(status = 'Sold') AS sold
     FROM sales_items WHERE ${within("created_at")}`, p
  );
  const rentals = await one(
    `SELECT COUNT(*) AS requested, SUM(approved_at IS NOT NULL OR status IN ('Confirmed', 'Returned')) AS approved,
            SUM(status = 'Returned') AS completed, SUM(status = 'Cancelled') AS cancelled
     FROM equipment_bookings WHERE ${within("created_at")}`, p
  );
  const toNums = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, num(v)]));
  return { tasks: toNums(tasks), sales: toNums(sales), rentals: toNums(rentals) };
}

async function getAnalytics(query) {
  const range = parseRange(query);
  const [growthData, listingData, transactionData, speedData, trustData, funnelData] = await Promise.all([
    growth(range), listings(range), transactions(range), speed(range), trust(range), funnels(range)
  ]);
  return {
    range: { from: range.from, to: range.to, days: range.days, previousFrom: range.prevFrom, previousTo: range.prevTo, bucket: bucketSize(range.days) },
    generatedAt: new Date().toISOString(),
    growth: growthData,
    listings: listingData,
    transactions: transactionData,
    speed: speedData,
    trust: trustData,
    funnels: funnelData
  };
}

module.exports = { getAnalytics, parseRange, within, sastDay, SAST };
