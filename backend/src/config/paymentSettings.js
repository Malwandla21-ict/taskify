/*
  Payment simulation settings — ONE place for every number the rental and
  sales payment flows use. Change a number here and both the backend rules
  and what the frontend shows update together (the frontend never
  hard-codes these; it reads them back from the API's quote/rules fields).

  DEMO MODE: none of this moves real money. There is no payment gateway,
  no stored card details and no real escrow account — every "payment",
  "hold", "release" and "refund" is just a status change in our own
  database, clearly labelled "Demo" in the UI. A real launch would swap
  these status changes for calls to a licensed provider (e.g. an escrow
  service or a gateway with split payments) and needs legal review first.
*/

module.exports = {
  DEMO_MODE: true,

  /* Rental trust ladder — checked from the top down; a renter gets the
     first level whose requirements they meet.
       minGoodRentals: finished rentals (Returned) with no damage reported
       minRating:      only checked once the renter has at least 1 review
       requireNoDamage: any damage report on their record blocks this level
       maxItemValue:   the most an item may be worth for this level to rent
                       it (null = no limit)
       depositPercent: deposit held, as a % of the item's value */
  RENTAL_TRUST_LEVELS: [
    { key: "top",     label: "Top renter", minGoodRentals: 10, minRating: 4.0, requireNoDamage: true,  maxItemValue: null, depositPercent: 0  },
    { key: "trusted", label: "Trusted",    minGoodRentals: 3,  minRating: 3.5, requireNoDamage: true,  maxItemValue: 6000, depositPercent: 10 },
    { key: "new",     label: "New",        minGoodRentals: 0,  minRating: 0,   requireNoDamage: false, maxItemValue: 1500, depositPercent: 20 }
  ],

  /* Small fee on every rental, paid into the Taskify Protection Fund
     instead of asking for a big deposit. */
  RENTAL_PROTECTION_FEE: { percent: 5, min: 5, max: 50 },

  /* The Taskify Protection Fund (simulated): every completed rental's
     protection fee goes in; an admin pays an owner out of it when they
     confirm damage, or that an item was never returned. The renter is
     never charged for that — the fund is what the fee buys.
     Each payout is capped at the smallest of: maxPayoutPerClaim, the
     item's listed value, and what's in the fund. Every movement is a row
     in protection_fund_entries (protectionFund.service.js). */
  RENTAL_PROTECTION_FUND: {
    /* Taskify's own starting contribution, so the first claims can be
       paid before many fees have come in. A placeholder for review. */
    openingBalance: 2000,
    /* The same as the "New" renter level's maxItemValue, so a new
       renter's whole item can be covered. */
    maxPayoutPerClaim: 1500
  },

  TASKS: {
    /* After the worker marks a task done, the poster is reminded (once) to
       review it after this many hours... */
    reviewReminderHours: 48,
    /* ...and after this many hours admins are asked to follow up (once).
       Nothing is ever paid out automatically — releasing the payment always
       needs the poster's confirmation or an admin's decision. */
    reviewEscalationHours: 168
  },

  /* How often the server checks for reminders that are due (jobs/scheduler.js). */
  JOBS: { intervalMinutes: 15 },

  RENTALS: {
    /* A booking request the owner hasn't approved or declined within this
       many hours expires and the dates are free again. Nothing has been
       paid at that point (the renter pays only after approval); an old
       booking that was paid up front is refunded (demo). Checked whenever
       equipment is listed, viewed or booked, and by jobs/scheduler.js. */
    requestExpiryHours: 48,
    /* Booking dates are checked against today's date in this timezone. */
    timeZone: "Africa/Johannesburg",
    /* The same timezone as a fixed offset, for MySQL's CONVERT_TZ (South
       Africa has no daylight saving, so this never changes). */
    utcOffset: "+02:00",
    /* Once the owner approves a request, the renter has this long to pay
       (demo) — or until the end of the start day, whichever is sooner.
       After that the approval lapses and the dates are freed. */
    paymentWindowHours: 24,
    /* The item is due back at this time (SAST) on the last rental day. */
    returnTime: "18:00",
    /* The renter is reminded this many hours before the return deadline. */
    returnReminderHours: 24,
    /* Still not returned this many hours after the deadline: admins are
       asked to follow up. */
    overdueEscalationHours: 72,
    /* The renter said "I've handed it back", but the owner hasn't
       confirmed (or disputed) it after this many hours: the owner is
       reminded and admins are asked to decide. The rent stays held. */
    handbackConfirmHours: 24,
    /* Security deposits are OFF for new bookings until the deposit policy
       is approved (see config/rentalPolicy.js). Bookings made before keep
       whatever deposit they already had. */
    depositsEnabled: false
  },

  SALES: {
    /* At or above this price, a sale must go through Taskify Protection
       (money held + 4-digit handover code). Below it, cash in person. */
    escrowThreshold: 300,
    /* Buyer-paid protection fee on protected sales — Taskify's (simulated)
       revenue. The seller receives the full item price. */
    protectionFeePercent: 3,
    /* Wrong handover-code guesses allowed before the order locks. */
    maxCodeAttempts: 5
  },

  /* In-app offers ("Make an offer") on tasks and on sales items at or
     above SALES.escrowThreshold. Agreeing on a price inside Taskify holds
     the (demo) payment straight away, so there's no reason to take the
     deal outside the app. */
  NEGOTIATION: {
    /* Counter-offers allowed per negotiation (both sides together). Once
       used up, the other side can only accept or decline. */
    maxCounterRounds: 3,
    /* Each new amount gives the other side this long to respond. Checked
       lazily whenever an offer is read or acted on (no cron job). */
    offerExpiryHours: 48,
    /* Allowed offer amounts, as a % of the listed price. */
    taskAmountPercent: { min: 50, max: 300 },
    saleAmountPercent: { min: 50, max: 100 },
    /* Optional note sent with an offer or counter-offer. */
    messageMaxLength: 300
  },

  /* Chat: phone numbers, emails and WhatsApp links are replaced with
     this until a payment is held between the two people. */
  CONTACT_MASK_TEXT: "[contact hidden]"
};
