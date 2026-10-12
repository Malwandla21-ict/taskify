# Taskify state machines

This guide explains how a **task**, a **protected sale** and a **rental** move from one step to the next: who can move them, what has to be true first, and what happens to the (demo) payment. The pictures are in [`diagrams/`](diagrams/): `state-task.svg`, `state-sale.svg` and `state-rental.svg`. This guide and the diagrams describe the same rules; if one changes, change the other in the same commit.

State names are the exact values stored in the database. Every move listed here is checked **on the server**: hiding a button in the browser is never the only protection. Each move also runs **once**, even if someone double-clicks or two people act at the same moment. The server locks the row (`SELECT … FOR UPDATE`) or uses a conditional `UPDATE … WHERE status = …` and checks that exactly one row changed.

> **Payments are a demo.** No real money moves. "Held", "Released" and "Refunded" are only status values in our own database, and the screens label them "Demo". See [money-rules.md](money-rules.md).

---

## 1. Task (`tasks.status`, with `payments.status`)

| State | Meaning | Payment |
|---|---|---|
| `Posted` | Open for applications. The only state where the poster can edit it. | none |
| `Accepted` | Poster and worker agreed; the worker has been chosen. | `Held` |
| `In Progress` | The worker is doing the job. | `Held` |
| `Awaiting Confirmation` | The worker says it's done; the poster checks it. | `Held` |
| `Disputed` | The poster reported a problem; an admin decides. | `Held` |
| `Completed` | Finished. | `Released` to the worker |
| `Cancelled` | Stopped before completion. | `Cancelled` or `Refunded` |

### Moves

| From → To | Who | Conditions | Endpoint |
|---|---|---|---|
| (new) → `Posted` | poster | valid fields, category from the list | `POST /api/tasks` |
| `Posted` → `Accepted` | poster accepts an application, or the worker accepts the poster's counter-offer | the task is still `Posted`; the amount is within the allowed range. A worker **can't** take a task directly. | `POST /api/offers`, `PATCH /api/offers/:id/accept` |
| `Accepted` → `Posted` | worker withdraws | only before starting | `PATCH /api/tasks/:id/withdraw` |
| `Accepted` → `In Progress` | the assigned worker | status is `Accepted` | `PATCH /api/tasks/:id/status` |
| `In Progress` → `Awaiting Confirmation` | the assigned worker | status is `In Progress` | `PATCH /api/tasks/:id/status` |
| `Awaiting Confirmation` → `Completed` | poster confirms | | `PATCH /api/tasks/:id/confirm-completion` |
| `Awaiting Confirmation` → `Disputed` | poster reports a problem | reason and category given | `POST /api/tasks/:id/dispute` |
| `Disputed` → `Completed` | poster confirms after all, or admin chooses **release** | | `confirm-completion`, or `PATCH /api/admin/tasks/:taskId/resolve-dispute` |
| `Disputed` → `In Progress` | admin chooses **rework** | the payment stays held | `PATCH /api/admin/tasks/:taskId/resolve-dispute` |
| `Disputed` → `Cancelled` | admin chooses **refund** | payment `Refunded` | `PATCH /api/admin/tasks/:taskId/resolve-dispute` |
| `Posted` or `Accepted` → `Cancelled` | poster | not once work has started | `PATCH /api/tasks/:id/cancel` |
| any state where the payment is still `Held` → `Cancelled` | admin refund | payment `Refunded` | `PATCH /api/admin/tasks/:taskId/refund` |

**Time rules (no state change):** 48 hours after the worker marks the task done, the poster is reminded once. After 168 hours, admins are asked to follow up once. The payment is **never released automatically**: it needs the poster's confirmation or an admin's decision. (`TASKS` in `backend/src/config/paymentSettings.js`; sent by `backend/src/jobs/scheduler.js`.)

---

## 2. Protected sale (`sale_orders.status`) and the item (`sales_items.status`)

Items priced at **R300 or more**, or sold at a price agreed through an in-app offer, go through Taskify Protection. The money is held (demo) and the buyer gets a 4-digit **handover code**. The code is shown **only to the buyer**; the seller never receives it from the server. Items under R300 with no agreed offer are paid in cash in person: no order is created, and the seller marks the item sold.

| Order state | Meaning | Item state |
|---|---|---|
| `Held` | Buyer paid (demo); the code is with the buyer. | `Reserved` |
| `Disputed` | Buyer or seller reported a problem; the money stays held. | `Reserved` |
| `Released` | The seller entered the right code, or an admin released the payment. | `Sold` |
| `Refunded` | Cancelled before handover, the seller refunded the buyer, or an admin refunded the buyer. | `Available` |

### Moves

| From → To | Who | Conditions | Endpoint |
|---|---|---|---|
| (new) → `Held` | buyer pays (demo), or buyer and seller agree on an offer | the item is `Available` and not the buyer's own | `POST /api/sales/:id/buy`, or an accepted offer |
| `Held` → `Released` | seller enters the buyer's code at the meetup | correct code; fewer than 5 wrong tries (5 wrong tries locks the order) | `POST /api/sales/orders/:orderId/release` |
| `Held` → `Refunded` | buyer or seller cancels | before handover | `PATCH /api/sales/orders/:orderId/cancel` |
| `Held` → `Disputed` | buyer or seller reports a problem (for example, the meetup failed) | reason and category given | `POST /api/sales/orders/:orderId/dispute` |
| `Disputed` → `Released` | seller enters the code, or admin chooses **release** | | `release`, or `PATCH /api/admin/sale-orders/:orderId/resolve-dispute` |
| `Disputed` → `Refunded` | the seller refunds the buyer, or admin chooses **refund** | while it's `Disputed` the buyer can't cancel for an instant refund | `cancel` (seller), or admin `resolve-dispute` |
| `Disputed` → `Held` | admin chooses **retry** | a **new** code is made and the tries reset | admin `resolve-dispute` |

A `Reserved` item can't be edited, deleted or marked sold.

### One item or several (`sales_items.quantity`, `quantity_sold`)

When listing, the seller must say whether it's **just this one** or **several of the same** (2–100). The item state is never set directly; it's worked out from three numbers every time one of them changes (`refreshSaleItemStatus` in `sales.service.js`, inside the same transaction):

`left = quantity − quantity_sold − orders still Held or Disputed`

| Item state | When |
|---|---|
| `Available` | `left` > 0: someone can still buy one. It stays on the Sales page. |
| `Reserved` | `left` = 0 but some units are waiting for handover. It leaves the Sales page; a cancelled or refunded order brings it back. |
| `Sold` | `quantity_sold` = `quantity`. It's gone for good. |

So a **single item** (quantity 1) leaves the marketplace as soon as it's bought or marked sold — exactly as before. A listing with **several** stays up until the last one has gone.

| Move | Effect |
|---|---|
| Buyer pays (or an offer is accepted) | Holds one unit. The item row is locked while units are counted, so buyers paying at the same moment can never hold more than the seller has. One open order per buyer per listing. Other people's offers stay open while units are left; they're closed when none are. |
| Seller enters a buyer's code / admin chooses **release** | `quantity_sold` + 1 |
| Order cancelled / refunded | Frees that unit |
| Cash sale: "Sold one" / "Mark as Sold" | `quantity_sold` + 1 (`PATCH /api/sales/:id/sold`) |
| Cash sale: "Sold the rest" | Every free unit sold (`{ "all": true }`). Units waiting for handover are never touched. |
| Seller edits the quantity | Must stay above what's already sold or held. |

The seller sees every buyer waiting for handover on the item page, each with their own code box (`open_orders`); they never see anyone's code.

---

## 3. Rental booking (`equipment_bookings.status`)

**Request first, pay later.** Nothing is paid until the owner approves. Three columns describe the inner steps: `picked_up_at`, `condition_status` and `payment_status`. Security deposits, refunds for unused days and late fees are **not in effect** (see [money-rules.md](money-rules.md)).

| Diagram name | Stored as | Meaning |
|---|---|---|
| Requested | `Pending`, payment `Unpaid` | The renter asked for dates; the owner hasn't answered. |
| Awaiting Payment | `Awaiting Payment` | The owner approved; the dates are held until the pay-by time. |
| Confirmed · Awaiting Collection | `Confirmed`, `picked_up_at` empty | Paid (demo), payment `Held`; the item hasn't been collected. |
| Confirmed · Out on Rent | `Confirmed`, `picked_up_at` set | Collected; the return deadline applies. |
| Return Check | `Returned`, condition `Pending` | Back with the owner, who checks its condition. |
| Completed | `Returned`, condition `OK` | Finished. |
| Damage Reported / Confirmed | `Returned`, condition `Damaged` | An admin decides (`damage_outcome`). |
| Cancelled | `Cancelled` (+ `cancel_reason`) | Anything paid is refunded (demo). |

### Moves

| From → To | Who | Conditions | Endpoint |
|---|---|---|---|
| (new) → Requested | renter | valid dates (not in the past); dates free; within their trust level. The terms and policy version are saved with the booking. | `POST /api/equipment/:id/book` |
| Requested → Awaiting Payment | owner approves | the dates are checked again; a pay-by time is set (24 h, or the end of the start day if sooner) | `PATCH /api/equipment/bookings/:bookingId/confirm` |
| Awaiting Payment → Confirmed | renter pays (demo) | before the pay-by time; accepts the **current** policy version; dates still free. Overlapping requests are declined. | `POST /api/equipment/bookings/:bookingId/pay` |
| Requested → Cancelled | owner declines · renter cancels · no answer in 48 h · start date passed · someone else paid for those dates | | `decline`, `cancel`, or the expiry check |
| Awaiting Payment → Cancelled | the pay-by time passes · renter cancels · owner can't go ahead | nothing to refund | expiry check, `cancel`, `owner-cancel` |
| Awaiting Collection → Cancelled | renter cancels · owner can't hand it over · renter refuses a faulty item (admins get a report) | full refund (demo). If the item was still overdue with the previous renter, the reason is recorded as `item_not_returned`, not the renter's doing. | `cancel`, `owner-cancel`, `refuse-pickup` |
| Awaiting Collection → Out on Rent | renter confirms pickup | photos and the condition at pickup; **the previous rental of the item has been returned**. An item can't be out with two renters at once. | `PATCH /api/equipment/bookings/:bookingId/pickup` |
| Out on Rent → Return Check | renter or owner records the return | photos. The rent is released to the owner (demo); minutes late are recorded, but **no late fee**. | `PATCH /api/equipment/bookings/:bookingId/return` |
| Return Check → Completed | owner confirms the condition | | `PATCH /api/equipment/bookings/:bookingId/condition-ok` |
| Return Check → Damage Reported | owner reports damage | a note; a report is filed for admins | `PATCH /api/equipment/bookings/:bookingId/report-damage` |
| Damage Reported → outcome | admin: **renter not at fault** (the damage mark is removed) or **damage confirmed** (kept on the renter's record) | **nothing is charged** either way | `PATCH /api/admin/rental-bookings/:bookingId/resolve-damage` |

**Report a problem (no state change):** while a booking is `Confirmed`, either side can report a problem: `POST /api/equipment/bookings/:bookingId/problem`. "The owner isn't available to take it back" also records **when** the renter tried to return it, which protects them against a late-return claim.

**Time rules while Out on Rent (no state change, each sent once):**
- 24 h before the deadline, the renter is reminded.
- When the deadline passes, both are told it's overdue.
- 72 h after the deadline, admins are asked to follow up.

Nothing is ever charged. (`RENTALS` in `paymentSettings.js`; sent by `jobs/scheduler.js`.)

**Waiting for the item (no state change):** if a rental is overdue and the *next* booking on the same item starts today or tomorrow (approved or paid, not collected), the next renter and the owner are each told once (`return_wait_notified_at`). The next renter sees **Waiting for item**, never who has it, and can:
- **wait:** they're told when the return is recorded;
- **cancel:** full refund (demo).

The owner can record the return as soon as the item is back, or use "Can't hand it over" (full refund to the next renter). Admins' 72-hour follow-up says how many later bookings are waiting. The next booking's dates are **not** moved automatically.

**Availability:** a booking blocks its dates from `Awaiting Payment` onwards. A rental that is collected and overdue keeps blocking the item until it's returned. A `Confirmed` booking that was never collected does not block it past its end date.

### Extension request (`booking_extensions.status`)

Allowed only on a `Confirmed`, paid booking. Until the extension is `Paid`, the original return deadline applies.

| From → To | Who | Conditions | Endpoint |
|---|---|---|---|
| (new) → `Requested` | renter | before the deadline; one open request at a time; the extra days are free. The extra rent and fee are shown. | `POST /api/equipment/bookings/:bookingId/extension` |
| `Requested` → `Awaiting Payment` | owner approves | a pay-by time is set | `PATCH …/extension/approve` |
| `Requested` → `Declined` | owner declines | | `PATCH …/extension/decline` |
| `Awaiting Payment` → `Paid` | renter pays (demo) | in time; the days are still free. The booking's end date and deadline move. | `POST …/extension/pay` |
| `Requested` / `Awaiting Payment` → `Cancelled` | renter withdraws, or the rental ends | | `PATCH …/extension/cancel` |
| `Requested` / `Awaiting Payment` → `Expired` | nobody acted in time | | the expiry check |

---

## Older records

Bookings made before October 2026 were paid up front. Approving one of those goes straight to `Confirmed`, and if one expires unanswered it is refunded (demo). Bookings from before the payment simulation (no `payment_status`) keep the old, simple return with no photos or money steps.
