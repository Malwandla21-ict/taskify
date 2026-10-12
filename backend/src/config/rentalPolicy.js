/*
  Rental money rules — security deposits, early-return refunds and late
  fees. These are PROPOSALS waiting for legal, university and
  payment-provider review. Nothing here charges, deducts or refunds
  anything: the app only shows clearly labelled, non-binding estimates.

  Each rule has a status:
    proposed        — written down, not yet sent for review
    pending_review  — with the people who need to approve it
    approved        — approved AND in effect (see the checks below)
    suspended       — was approved, now switched off

  A rule only becomes enforceable (rentalPolicy.service.js isEnforceable)
  when ALL of these are true: status is "approved", approvedBy and
  approvedAt are filled in, effectiveFrom has arrived, and
  providerSupported is true (a real payment provider that can do it —
  there isn't one yet; payments are a demo). If anything is missing,
  the rule fails safe: no money is collected, deducted or refunded.

  Every booking records the policy version it was made under, plus a copy
  of the terms shown (equipment_bookings.policy_version / terms_snapshot),
  so changing this file never rewrites an existing agreement. Bump
  `version` whenever any rule or wording here changes.

  The numbers below are PLACEHOLDERS for review, not decisions.
*/

module.exports = {
  version: "2026-10-proposed-2",

  deposit: {
    status: "proposed",
    approvedBy: null,
    approvedAt: null,
    effectiveFrom: null,
    providerSupported: false,
    summary: "No security deposit is taken. A deposit policy is being reviewed and is not in effect."
  },

  earlyReturnRefund: {
    status: "proposed",
    approvedBy: null,
    approvedAt: null,
    effectiveFrom: null,
    providerSupported: false,
    /* Proposal: whole days after the day the item comes back are refunded
       at the daily rate (never more than the rent paid). */
    method: "unused_full_days",
    summary: "Returning early is always allowed. A refund for unused days is being reviewed and is not in effect, so no refund is made automatically."
  },

  lateFee: {
    status: "proposed",
    approvedBy: null,
    approvedAt: null,
    effectiveFrom: null,
    providerSupported: false,
    /* Proposal: after a grace period, one day's rent for each started
       24 hours late, capped at the item's value. */
    graceHours: 2,
    method: "per_started_24_hours",
    feePerPeriod: "one_day_rent",
    capAtItemValue: true,
    summary: "Late fees are being reviewed and are not in effect, so nothing is charged. Please return items on time or ask for an extension."
  },

  /* Not a fee: what happens when a booking is cancelled before the item
     is collected. Paid (demo) amounts are refunded in full. */
  cancellation: {
    summary: "Before you collect the item you can cancel for a full refund (demo). If the owner can't hand it over, you're refunded in full."
  },

  /* Not a fee: how a rental ends. */
  returning: {
    summary: "When you hand the item back, say so on the rental with photos. The rental ends when the owner confirms they have it. If they don't confirm, or say they don't have it, a Taskify admin compares the photos and decides."
  }
};
