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

  /* Small fee on every rental that goes into the shared (simulated)
     protection pot, instead of asking for a big deposit. */
  RENTAL_PROTECTION_FEE: { percent: 5, min: 5, max: 50 },

  SALES: {
    /* At or above this price, a sale must go through Taskify Protection
       (money held + 4-digit handover code). Below it, cash in person. */
    escrowThreshold: 300,
    /* Buyer-paid protection fee on protected sales — Taskify's (simulated)
       revenue. The seller receives the full item price. */
    protectionFeePercent: 3,
    /* Wrong handover-code guesses allowed before the order locks. */
    maxCodeAttempts: 5
  }
};
