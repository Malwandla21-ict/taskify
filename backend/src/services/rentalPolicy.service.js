const RENTAL_POLICY = require("../config/rentalPolicy");
const { RENTALS } = require("../config/paymentSettings");
/* Same rounding as trust.service.js (kept local so trust.service can use this file). */
const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const STATUS_LABELS = {
  proposed: "Proposed — not in effect",
  pending_review: "Being reviewed — not in effect",
  approved: "Approved",
  suspended: "Suspended — not in effect"
};

/*
  The ONE gate every money rule must pass before it may collect, deduct
  or refund anything. Fails safe: anything missing or unclear → false.
  Today every rule is "proposed" and there's no real payment provider, so
  this is false for all of them.
*/
function isEnforceable(ruleKey, now = new Date()) {
  const rule = RENTAL_POLICY[ruleKey];
  if (!rule || typeof rule !== "object") return false;
  if (rule.status !== "approved") return false;
  if (!rule.approvedBy || !rule.approvedAt || !rule.effectiveFrom) return false;
  const effective = new Date(rule.effectiveFrom);
  if (Number.isNaN(effective.getTime()) || effective > now) return false;
  return rule.providerSupported === true;
}

/* Throws if code ever tries to run a money rule that isn't enforceable.
   Nothing calls a charge/refund under these rules today; this exists so
   any future code path has to go through it. */
function assertEnforceable(ruleKey) {
  if (!isEnforceable(ruleKey)) {
    const error = new Error("This rental policy hasn't been approved, so Taskify can't charge, deduct or refund money under it.");
    error.statusCode = 403;
    throw error;
  }
}

function ruleView(ruleKey) {
  const rule = RENTAL_POLICY[ruleKey];
  return {
    status: rule.status,
    statusLabel: STATUS_LABELS[rule.status] || STATUS_LABELS.proposed,
    inEffect: isEnforceable(ruleKey),
    summary: rule.summary
  };
}

/* The terms a renter sees before requesting and before paying. Saved on
   the booking (terms_snapshot) so later policy changes never rewrite it. */
function currentTerms({ dailyPrice = null, itemValue = null } = {}) {
  return {
    policyVersion: RENTAL_POLICY.version,
    returnTime: RENTALS.returnTime,
    timeZone: RENTALS.timeZone,
    paymentWindowHours: RENTALS.paymentWindowHours,
    dailyPrice: dailyPrice == null ? null : Number(dailyPrice),
    itemValue: itemValue == null ? null : Number(itemValue),
    deposit: { ...ruleView("deposit"), enabled: RENTALS.depositsEnabled && isEnforceable("deposit") },
    earlyReturn: ruleView("earlyReturnRefund"),
    lateReturn: { ...ruleView("lateFee"), graceHours: RENTAL_POLICY.lateFee.graceHours },
    cancellation: { summary: RENTAL_POLICY.cancellation.summary }
  };
}

function parseTerms(snapshot) {
  if (!snapshot) return null;
  if (typeof snapshot === "object") return snapshot;
  try { return JSON.parse(snapshot); } catch { return null; }
}

/* "YYYY-MM-DD" for a moment, in Taskify's timezone. */
function dateInTaskifyTimezone(when) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RENTALS.timeZone }).format(when);
}

function daysBetween(fromDate, toDate) {
  const toUtc = (v) => { const [y, m, d] = String(v).slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86400000);
}

/*
  NON-BINDING estimate of the proposed late fee, for display only. Inputs
  and the policy version are returned too, so the calculation can be
  checked. Never used to charge anyone.
*/
function estimateLateFee({ returnDueAt, dailyPrice, itemValue = null, at = new Date() }) {
  const rule = RENTAL_POLICY.lateFee;
  const due = new Date(returnDueAt);
  const base = {
    binding: false, inEffect: isEnforceable("lateFee"), policyVersion: RENTAL_POLICY.version,
    status: rule.status, graceHours: rule.graceHours, method: rule.method
  };
  if (Number.isNaN(due.getTime())) return { ...base, minutesLate: 0, periods: 0, amount: 0 };

  const minutesLate = Math.max(0, Math.floor((at - due) / 60000));
  const minutesPastGrace = minutesLate - rule.graceHours * 60;
  const periods = minutesPastGrace > 0 ? Math.ceil(minutesPastGrace / 1440) : 0;
  let amount = roundMoney(periods * Number(dailyPrice || 0));
  if (rule.capAtItemValue && itemValue != null) amount = Math.min(amount, roundMoney(Number(itemValue)));
  return { ...base, minutesLate, periods, amount };
}

/*
  NON-BINDING estimate of the proposed early-return refund, for display
  only: whole days after the return day, at the daily rate, never more
  than the rent paid. Never used to refund anyone.
*/
function estimateEarlyReturnRefund({ endDate, dailyPrice, rentalAmount, at = new Date() }) {
  const rule = RENTAL_POLICY.earlyReturnRefund;
  const returnDay = dateInTaskifyTimezone(at);
  const unusedDays = Math.max(0, daysBetween(returnDay, endDate));
  const amount = Math.min(roundMoney(unusedDays * Number(dailyPrice || 0)), roundMoney(Number(rentalAmount || 0)));
  return {
    binding: false, inEffect: isEnforceable("earlyReturnRefund"), policyVersion: RENTAL_POLICY.version,
    status: rule.status, method: rule.method, returnDay, unusedDays, amount
  };
}

module.exports = {
  RENTAL_POLICY,
  isEnforceable,
  assertEnforceable,
  currentTerms,
  parseTerms,
  estimateLateFee,
  estimateEarlyReturnRefund,
  dateInTaskifyTimezone,
  daysBetween
};
