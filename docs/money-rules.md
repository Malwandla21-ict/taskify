# Money rules and how they get approved

## 1. Payments are a demo

Taskify has **no payment provider**. No card details are stored, no money is held in any account, and nothing is paid out. Every "payment", "hold", "release" and "refund" is a status value in our own database (`payments`, `sale_orders`, `equipment_bookings.payment_status`, `booking_extensions`). The screens label all of these as **Demo**.

This is switched by `DEMO_MODE: true` in `backend/src/config/paymentSettings.js`. Every number the payment flows use is in that file, and the website reads them back from the API instead of hard-coding them.

| Setting | Value today | What it does |
|---|---|---|
| `SALES.escrowThreshold` | R300 | Sales at or above this go through Taskify Protection (held money + handover code). |
| `SALES.protectionFeePercent` | 3% | A fee the buyer pays on protected sales. The seller gets the full price. |
| `SALES.maxCodeAttempts` | 5 | Wrong handover-code tries before the order locks. |
| `RENTAL_PROTECTION_FEE` | 5%, min R5, max R50 | A fee on every rental, added to the rent. It goes into the Taskify Protection Fund (below), not to Taskify. |
| `RENTAL_PROTECTION_FUND.openingBalance` | R2,000 | Taskify's own starting contribution to the fund, so early claims can be paid. A placeholder for review. |
| `RENTAL_PROTECTION_FUND.maxPayoutPerClaim` | R1,500 | The most one claim can pay an owner. Also never more than the item's value or what's in the fund. |
| `RENTALS.handbackConfirmHours` | 24 | After the renter says "I've handed it back", the owner has this long to confirm or dispute it before admins are asked. |
| `RENTALS.paymentWindowHours` | 24 | Time to pay after the owner approves (or until the end of the start day, if sooner). |
| `RENTALS.requestExpiryHours` | 48 | An unanswered request expires. |
| `RENTALS.returnTime` | 18:00 (SAST) | When an item is due back on the last day. |
| `RENTALS.returnReminderHours` | 24 | The renter is reminded this long before the deadline. |
| `RENTALS.overdueEscalationHours` | 72 | Admins are asked to follow up this long after the deadline. |
| `RENTALS.depositsEnabled` | `false` | Security deposits are off for new bookings. |
| `TASKS.reviewReminderHours` / `reviewEscalationHours` | 48 / 168 | Reminders to a poster who hasn't confirmed a finished task. |
| `NEGOTIATION` | 3 counters, 48 h | Limits on in-app offers. |

Nothing is ever released, refunded or charged automatically because a deadline passed. Releasing a task payment needs the poster's confirmation or an admin's decision. A sale is released only by the buyer's code or an admin. Rent is released when the **owner** confirms the item is back, or an admin does.

### Returns the owner confirms

- The renter presses **"I've handed it back"** and adds photos. The rent stays held, and their deadline reminders stop.
- The owner presses **"Yes, it's back"** to complete the rental and get the rent, or **"I don't have it"** to dispute it.
- Lateness is measured to the renter's hand-back, so a slow owner doesn't make the renter look late. After a dispute, it's measured to when the return is finally recorded.
- If the owner doesn't answer within `handbackConfirmHours`, or disputes it, a report appears in the admin Reports table. The admin either confirms it was returned or closes it as not returned.

### Items that never come back

Once a rental is past its deadline, an admin can **close it as not returned** from the Reports table. Rentals 72 hours overdue are filed there automatically. Closing it:
- releases the rent to the owner, who can also be paid from the fund;
- takes the listing down, and cancels and refunds anyone else booked on that item;
- puts it on the renter's record. A renter with a rental closed as not returned **can't rent again**, and their other uncollected bookings are cancelled and refunded.

The renter is never charged.

### The Taskify Protection Fund

Renters pay a small protection fee instead of a deposit. When a rental completes, its fee goes into the fund. When an admin **confirms damage**, or **closes a rental as not returned**, they can pay the owner from the fund. The renter is never charged for it.

- Each payout is capped at the smallest of `maxPayoutPerClaim`, the item's listed value, and the fund balance. A larger amount is refused, not quietly reduced.
- Every movement is a row in `protection_fund_entries`: fees are positive, payouts negative. The balance is `openingBalance` plus all rows. A rental adds its fee once and is paid out at most once (a unique key). Payouts run under a database lock, so two admins can't spend the same money.
- Deleting a listing never changes the fund's history: entries keep their amount, and the booking link becomes empty.
- Admin analytics shows fees in, payouts out and the balance separately from sale protection fees, which are Taskify's revenue.

It is **not insurance**. Owners are told this when they list (`rental_owner` acknowledgement) and renters see it in the rental terms. Like everything else here it's a demo: a real launch needs a provider that can hold the pooled money and pay owners, plus the legal review in [open-questions.md](open-questions.md).

**To connect a real provider later:** each demo status change is in one service function: `acceptTask`/`confirmTaskCompletion` (tasks), `buySalesItem`/`releaseSaleOrder`/`cancelSaleOrder` (sales), `payBooking`/`completeReturn`/`resolveReturn` (rentals), and `payOwner` (protection fund payouts). Those are the places to call the provider. A real payment must be **verified by the provider** before a booking becomes `Confirmed`; it must not be assumed. This needs the legal and provider answers in [open-questions.md](open-questions.md) first.

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
| `adminsOnlyPosting` | `backend/src/config/marketplace.js` | **on** | Only admins (with two-factor sign-in) can post or edit Campus Marketplace listings. Everyone can still browse and say they're going. Older listings by others stay until they end, and their organisers can still delete them. |
| `institutionalListingsEnabled` | `backend/src/config/marketplace.js` | on | Institutional Campus Marketplace categories (farm produce, surplus, lost property, departmental). Each one needs an admin check and a note of who authorised it, and is labelled "Reviewed institutional listing", never "official". |
| `depositsEnabled` | `paymentSettings.js` → `RENTALS` | **off** | Security deposits (see above). |

The website reads the switches from `GET /api/features`, but the **server** is what enforces them. Changing a switch needs a redeploy.
