# In-app offers (negotiation) + hidden contact details — 2026-09-25

**Goal:** make agreeing on a price inside Taskify easier than haggling in chat and paying outside the app. When both sides agree, the (demo) payment is held straight away. Contact details stay hidden in chat until money is held.

Everything is **DEMO MODE**. No real money moves. A "hold", "release" or "refund" is only a status change in our database, and the UI labels it "Demo".

## What was built

### 1. Offers on tasks
- A student who isn't the poster can **Make an offer** on a `Posted` task: an amount and an optional note (max 300 characters).
- Whoever's turn it is can **Accept** or **Counter**. The poster can **Decline** and the offerer can **Withdraw** at any time while the offer is open.
- **Accepting runs the existing `acceptTask()` code**, in one transaction with a `FOR UPDATE` lock:
  - `tasks.price` is set to the agreed amount
  - `accepted_by` is set to the offerer
  - a `payments` row is created with status `Held`
- The poster pays, so the payment is held when the poster accepts, or when the offerer accepts the poster's counter. Both sides see a demo payment confirmation first.
- When a task is taken (by an offer **or** the normal Accept Task button), every other open offer on it is closed and those people are notified. If the winner had their own open offer, it becomes `Withdrawn`, not `Declined`.
- Cancelling or deleting a task also closes its offers.

### 2. Offers on sales (items priced at or above `SALES.escrowThreshold`, R300)
- The same flow on `Available` items.
- **Accepting runs the existing `buySalesItem()` code** with the agreed price: the item is reserved, a `sale_orders` row is created as `Held` with a handover code, and the protection fee is recalculated on the agreed price.
- Protection applies **even if the agreed price is below R300**, because the deal was made in the app.
- From there the normal Taskify Protection flow takes over (handover code → release, or cancel → refund).
- Other open offers are closed when the item is reserved, marked sold, or deleted.

### 3. Contact details hidden in chat
- `sendMessage()` swaps these for `[contact hidden]` before saving:
  - SA phone numbers (`0821234567`, `082 123 4567`, `082-123-4567`, `(082) 123 4567`, `+27 82 123 4567`, `27821234567`)
  - email addresses
  - `wa.me` and `api.whatsapp.com` / `chat.whatsapp.com` links
  - the words "whatsapp" / "whats app", and "call me on"
- Only the masked text is stored.
- Masking is skipped when the two people have a held or released payment for that listing: task payments, `sale_orders`, and rental bookings.
- The API returns `contact_masked: true`, and both chat screens show: *"Contact details unlock once payment is held through Taskify. Deals outside Taskify aren't protected."*
- Offer notes are masked the same way.
- **Phone numbers were removed from public listing data** (tasks, sales, equipment: lists and detail pages). The two people only get each other's number once a payment is held between them.
  - Tasks also leaked `created_by_phone_number` / `accepted_by_phone_number`, which wasn't in the brief, so that was fixed too.

### Rules (all numbers in `backend/src/config/paymentSettings.js` → `NEGOTIATION`)
| Rule | Value |
|---|---|
| Counter-offers per negotiation (both sides together) | 3 |
| Time to reply to each new amount | 48 hours (the timer resets on every counter) |
| Task offer range | 50%–300% of the listed price |
| Sale offer range | 50%–100% of the listed price |
| Note length | 300 characters |

- Expiry is **lazy**: an offer is marked `Expired` the next time anyone reads or acts on it. There's no cron job.
- One open negotiation per person per listing. Enforced by locking the listing row while creating an offer.
- The server checks every rule. The browser only shows the limits it gets back from the API.
- Only the two people involved can see a negotiation. Strangers get a 404, as if it doesn't exist. The listing owner sees every negotiation on their listing.
- Every action notifies the other person. Offer notifications reuse the `task` / `sales_item` notification context types; the enum is unchanged.
- **Safety check on Accept:** the browser sends the amount it showed (`expectedAmount`). If the other side countered in the meantime, the accept is refused rather than agreeing to a number the person never saw.

## New API endpoints (all require login)
| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/offers?contextType=task\|sales_item&contextId=ID` | anyone logged in | owner: every negotiation on the listing; others: only their own. Also returns `rules` (allowed range, whether you can offer and why not) |
| POST | `/api/offers` | not the owner | `{ contextType, contextId, amount, message? }` |
| POST | `/api/offers/:id/counter` | whoever's turn it is | `{ amount, message? }` |
| PATCH | `/api/offers/:id/accept` | whoever's turn it is | `{ expectedAmount }` → assigns the task / reserves the item and holds the payment |
| PATCH | `/api/offers/:id/decline` | owner | |
| PATCH | `/api/offers/:id/withdraw` | offerer | |

## Database
New script: `backend/scripts/repair-negotiation-schema.js`. It is idempotent: run it as many times as you like.
- `offers`: one row per negotiation (listing, offerer, owner, current amount, whose turn, counter count, status, `expires_at`).
- `offer_history`: one row per proposed amount (amount, who proposed it, note, time). This powers the "R150 → R190 → R170" trail.
  - I used a child table instead of a JSON column because each step also records who proposed it and when. A table is easier to query and can't get out of shape.
- `context_id` can't have a foreign key, because it points at tasks **or** sales items. The app deletes a listing's offers itself when the listing is deleted.
- `expires_at` is `TIMESTAMP NULL`. On MariaDB 10.4, a `TIMESTAMP NOT NULL` column with no default can silently turn into "update to now on every change", which would keep resetting the expiry.
- **Deploy safety:** if the new code goes live before the script is run, accepting tasks and buying items keeps working. The offer clean-up step skips quietly when the tables don't exist yet.

## Files
**New:**
- `backend/src/services/offer.service.js`: all the negotiation rules
- `backend/src/services/offerClosure.service.js`: closes other offers when a listing is taken. It's a separate file so task, sales and offer services can share it without requiring each other in a circle.
- `backend/src/controllers/offer.controller.js`, `backend/src/routes/offer.routes.js`
- `backend/src/utils/contactMask.js`: the contact-detail detector
- `backend/scripts/repair-negotiation-schema.js`
- `frontend/js/offers.js`: the shared Offers panel and modals, used by both detail pages

**Changed:**
- `backend/src/config/paymentSettings.js`
- `backend/src/app.js`
- `task.service.js`, `sales.service.js`, `equipment.service.js`, `conversation.service.js`, `conversation.controller.js`
- `frontend/js/task-details.js`, `sale-details.js`, `messages.js`, `conversation.js`, `helpers.js` (new statuses in `statusBadge`)
- `frontend/css/main.css` (new modal IDs added to the modal selector list, plus Offers panel and chat note styles)
- `task-details.html`, `sale-details.html`, `messages.html`, `conversation.html`

## How it was tested
Everything ran against a **throwaway local MariaDB 10.4**, loaded from `taskify-schema.sql` and brought up to date with the existing repair scripts. The live Aiven database was never touched: the test server ran from a folder with no `.env`, with email, moderation and push switched off.
- **Migration:** ran twice. The first run created both tables; the second skipped both.
- **End-to-end API test (104 checks, all passing, repeated 4 times):**
  - offer → counter → accept for tasks and sales
  - bounds, the 3-round limit, expiry, self-offers, guests and strangers blocked, turn order, stale-amount accept refused
  - auto-decline of other offers and the notifications for it
  - the normal Accept Task / Buy buttons still work and close offers
  - chat masking on and off
  - phone numbers absent from public data
- **Race tests:** 30 extra three-way races, all correct. Each race had two offers accepted at the same moment plus a normal Accept Task / Buy. Every time: exactly one winner, one payment or order row, no offers left open, no deadlocks, no server errors.
- **Screenshots:** headless Chrome at 1280px and 390px, in `claude/negotiation-offers-screenshots/`. No JavaScript errors and no sideways overflow at 390px. A real click-through (counter through the form, accept through the modal) ended with a handover code and the seller's phone unlocked.

## What's left / ideas
- **Run the migration on the live DB:** `cd backend` then `node scripts/repair-negotiation-schema.js`.
- **Existing XSS risk (not from this change):** chat messages, listing titles and descriptions are put into the page without HTML-escaping. The new offers UI escapes everything it shows, but the older pages should too.
- **Public profile** (`GET /users/:id`) still returns `phone_number` and `email` to anyone logged in. Not changed, because your own profile edit form depends on that response. It needs a "public vs own profile" split.
- Masking is a speed bump, not a wall. Someone can still write "zero eight two…". Telegram / Instagram handles aren't caught.
- Expired offers aren't announced with a notification (expiry is lazy). A small scheduled job could add "Your offer expired" messages later.
- Admin chat review now only sees the masked text (as requested), so moderators can't see what number was shared.
- On a sale, the "Price" line in the summary still shows the listed price after a lower offer is accepted. The payment panel shows the agreed amount. Tasks do update `tasks.price`.
- Local preview tip: the `serve` static server strips `?id=` when it redirects `task-details.html?id=5` to `/task-details`. Use `/task-details?id=5` locally. This doesn't affect the live site.
