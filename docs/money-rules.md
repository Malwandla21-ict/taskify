# Money rules and how they get approved

## 1. Payments are a demo

Taskify has **no payment provider**. No card details are stored, no money is held in any account, and nothing is paid out. Every "payment", "hold", "release" and "refund" is a status value in our own database (`payments`, `sale_orders`, `equipment_bookings.payment_status`, `booking_extensions`). The screens label all of these as **Demo**.

This is switched by `DEMO_MODE: true` in `backend/src/config/paymentSettings.js`. Every number the payment flows use is in that file, and the website reads them back from the API instead of hard-coding them.

| Setting | Value today | What it does |
|---|---|---|
| `SALES.escrowThreshold` | R300 | Sales at or above this go through Taskify Protection (held money + handover code). |
| `SALES.protectionFeePercent` | 3% | A fee the buyer pays on protected sales. The seller gets the full price. |
| `SALES.maxCodeAttempts` | 5 | Wrong handover-code tries before the order locks. |
| `RENTAL_PROTECTION_FEE` | 5%, min R5, max R50 | A fee on every rental, added to the rent. |
| `RENTALS.paymentWindowHours` | 24 | Time to pay after the owner approves (or until the end of the start day, if sooner). |
| `RENTALS.requestExpiryHours` | 48 | An unanswered request expires. |
| `RENTALS.returnTime` | 18:00 (SAST) | When an item is due back on the last day. |
| `RENTALS.returnReminderHours` | 24 | The renter is reminded this long before the deadline. |
| `RENTALS.overdueEscalationHours` | 72 | Admins are asked to follow up this long after the deadline. |
| `RENTALS.depositsEnabled` | `false` | Security deposits are off for new bookings. |
| `TASKS.reviewReminderHours` / `reviewEscalationHours` | 48 / 168 | Reminders to a poster who hasn't confirmed a finished task. |
| `NEGOTIATION` | 3 counters, 48 h | Limits on in-app offers. |

Nothing is ever released, refunded or charged automatically because a deadline passed. Releasing a task payment needs the poster's confirmation or an admin's decision. A sale is released only by the buyer's code or an admin. Rent is released when the return is recorded.

**To connect a real provider later:** each demo status change is in one service function: `acceptTask`/`confirmTaskCompletion` (tasks), `buySalesItem`/`releaseSaleOrder`/`cancelSaleOrder` (sales), and `payBooking`/`returnEquipment` (rentals). Those are the places to call the provider. A real payment must be **verified by the provider** before a booking becomes `Confirmed`; it must not be assumed. This needs the legal and provider answers in [open-questions.md](open-questions.md) first.

---

## 2. Rental money rules waiting for approval

These three rules are written down in `backend/src/config/rentalPolicy.js`. **None of them is in effect.**

| Rule | Proposal (placeholder for review) | Status |
|---|---|---|
| `deposit` | A security deposit, as a % of the item's value by trust level (`RENTAL_TRUST_LEVELS.depositPercent`: 20% / 10% / 0%) | `proposed` |
| `earlyReturnRefund` | Refund whole unused days at the daily rate, never more than the rent paid | `proposed` |
| `lateFee` | After a 2-hour grace period, one day's rent per started 24 hours late, capped at the item's value | `proposed` |

What the app does **today**:
- **No deposit is taken** on new bookings. Bookings made before keep the deposit status they already had.
- **Returning early is always allowed.** The app shows a non-binding *estimate* of unused days but refunds nothing automatically.
- **Late returns are recorded** (`return_minutes_late`) and reminders are sent, but **nothing is charged**. The app shows what the proposed fee *would* be, labelled "an estimate only: late fees are not in effect", and points the renter to "ask for an extension".
- **Cancelling before collection** gives a full refund (demo). So does an owner who can't hand the item over, or a renter who refuses a faulty item.

### The approval gate

Every rule has these fields:

```js
status: "proposed",        // proposed | pending_review | approved | suspended
approvedBy: null,          // who approved it (name / office)
approvedAt: null,          // when
effectiveFrom: null,       // from when it applies
providerSupported: false   // a real payment provider can actually do it
```

One function, `isEnforceable(rule)` in `backend/src/services/rentalPolicy.service.js`, decides whether a rule may touch money. It returns **true only if all of these hold**:

1. `status` is `"approved"`;
2. `approvedBy`, `approvedAt` and `effectiveFrom` are all filled in;
3. `effectiveFrom` is a real date that has arrived;
4. `providerSupported` is `true`.

If anything is missing, unclear or misspelled, the answer is **false**: the rule fails safe, and no money is collected, deducted or refunded. `assertEnforceable(rule)` throws an error, so any future code that tries to charge under an unapproved rule is stopped. Deposits need **both** `RENTALS.depositsEnabled` and `isEnforceable("deposit")`.

### Every booking keeps its own terms

When a renter requests and when they pay, the server saves:
- `equipment_bookings.policy_version`: the `version` from `rentalPolicy.js` (today `2026-10-proposed-1`);
- `equipment_bookings.terms_snapshot`: a copy of the terms they were shown (return time, payment window, prices, and each rule's status and wording).

To pay, the renter must accept the **current** version. If the policy changed after they were shown it, the server asks them to look again. Changing the file therefore **never rewrites an existing agreement**.

### How to switch a rule on (once it is approved)

1. Get written approval from the people listed in [open-questions.md](open-questions.md) (legal, the university office, and the payment provider).
2. Connect a real payment provider that can do the operation (hold a deposit, partial refund, extra charge with consent).
3. In `rentalPolicy.js`, fill in `approvedBy`, `approvedAt` and `effectiveFrom`, set `providerSupported: true` and `status: "approved"`, update the `summary` wording renters see, and **change `version`**.
4. For deposits, also set `RENTALS.depositsEnabled: true`.
5. Write the code that actually charges or refunds, calling `assertEnforceable()` first, plus tests.
6. To stop a rule later, set `status: "suspended"`. It stops at once, and bookings keep the terms they were made under.

Today steps 2 and 5 don't exist, so even a rule marked `approved` would still not collect anything, because `providerSupported` is `false`.

---

## 3. Feature switches

| Switch | File | Today | What it controls |
|---|---|---|---|
| `endorsements` | `backend/src/config/features.js` | **off** | Lecturers endorsing students and their listings. When off, the server refuses the endorsement routes (`requireFeature`), strips endorsement fields from listings and profiles, and the website hides the links. Existing endorsements stay in the database. |
| `feedback` | `backend/src/config/features.js` | on | The "Help shape Taskify" form. Sending feedback never gives anyone extra permissions. |
| `institutionalListingsEnabled` | `backend/src/config/marketplace.js` | on | Institutional Campus Marketplace categories (farm produce, surplus, lost property, departmental). Each one needs an admin check and a note of who authorised it, and is labelled "Reviewed institutional listing", never "official". |
| `depositsEnabled` | `paymentSettings.js` → `RENTALS` | **off** | Security deposits (see above). |

The website reads the switches from `GET /api/features`, but the **server** is what enforces them. Changing a switch needs a redeploy.
