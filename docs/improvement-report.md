# Taskify improvement report

This report covers the work done for the brief "TASKIFY — Product, UX and Transaction Workflow Improvement" and its "Rental Policy and Payment Rules Addendum", in October 2026. It follows the brief's list of deliverables.

| Topic | Where |
|---|---|
| 1. Architecture and findings | below |
| 2–4. Changes, files, migrations and API changes | below |
| 5. Task, sale and rental state machines | [state-machines.md](state-machines.md) and [diagrams/](diagrams/) |
| Money rules, approval gate, feature switches | [money-rules.md](money-rules.md) |
| 6. Unresolved policy and business decisions | [open-questions.md](open-questions.md) |
| 7. Tests | below |
| 8. Limitations, security and provider dependencies | below |
| 9. Recommended next steps | below |

Decisions the project owner made at the start ("go with your recommendations"):
- keep the labelled **demo** payments, with no new money rules executing;
- switch **deposits off**;
- rentals become **request → owner approves → renter pays**;
- lecturers need **admin verification**;
- Events becomes the **Campus Marketplace**;
- **endorsements** go behind a switch that is off by default.

---

## 1. Existing architecture and important findings

**How Taskify is built**
- **Frontend:** plain HTML, CSS and JavaScript pages (`frontend/`), with no build step. Every page talks to the API through `frontend/js/api.js`.
- **Backend:** Node.js and Express (`backend/src/`), organised as routes → controllers → services. Login uses JWT; input is checked with express-validator; there's helmet and rate limiting.
- **Database:** MySQL. Live is Aiven `defaultdb` (UTC); practice is a local `taskify_local`. There are 26 tables and 39 foreign keys (see `docs/diagrams/erd.svg`).
- **Hosting:** Render, free tier. A background job (`backend/src/jobs/scheduler.js`) runs every 15 minutes while the server is awake.
- **Outside services:** Cloudinary (images), Brevo (email), Azure AI Content Safety (screening), web push.
- **Payments:** a labelled demo. Status values only; no provider.

**Findings from the audit, and what was done about each**

| Finding | Risk | Fixed in |
|---|---|---|
| Two clicks, or two people at once, could run a task step, handover or booking twice. | Double payments or double bookings. | Step 0 |
| Anyone could register as a "lecturer". | False authority. | Step 0 |
| No automated tests. | Regressions go unnoticed. | Step 0 (now 106 tests) |
| Pending actions were scattered across pages. | Users miss what they need to do next. | Step 1 (Action Centre) |
| A worker could take a task without the poster choosing them. | The poster loses control. | Step 2 |
| A poster had no way to report a bad job; payment waited forever. | Stuck money, no recovery path. | Step 2 |
| A failed sale meetup had no recovery path. | Stuck money. | Step 3 |
| Rentals were paid before the owner approved; deposits were taken under unapproved rules; history showed raw ISO dates. | Charging before agreement; unapproved money rules. | Step 4 |
| A confirmed but never-collected booking could block an item forever. | Items wrongly unavailable. | Step 4 |
| "Events" had drifted into a general social calendar. | Off-purpose content. | Step 5 |
| `GET /api/users/:id/profile` returned email, phone and student number to anyone, without signing in. | Privacy leak. | Step 6 |
| Unverified lecturers still showed a lecturer badge; the admin Users list showed "Student" for everyone. | Misleading authority. | Step 6 |
| No single file held the current database structure; `backend/schema.sql` was out of date and partly broken. | A new database couldn't be set up reliably. | Step 7 |
| Repair scripts fought each other: one dropped `reports.task_id` and another added it back. Two scripts wrote fixed lists of allowed values that would shrink a list a later script had grown. | An older script run after a newer one could reject or blank existing rows. | Step 7 |

---

## 2–4. Changes, main files, database and API changes

Each step is one commit on `main`. Database changes are made by an **idempotent repair script** (`backend/scripts/repair-*.js`: it only adds what's missing, so it's safe to re-run) and described in a matching `backend/migrations/*.sql` file. Every live change was made only after a read-only comparison of live and practice, and no existing rows were removed.

### Step 0: safety fixes, lecturer verification, tests (`589c2f6`, `59b691e`, `a22221a`)
- **Why:** stop duplicate money and booking operations; stop self-declared lecturers; make changes testable.
- **Files:** `task.service.js`, `sales.service.js`, `equipment.service.js` (row locks and conditional updates); `auth.middleware.js`; `admin.routes.js`; `backend/tests/`.
- **Database:** `users.lecturer_verified` (`repair-lecturer-verification-schema.js`). Existing name.surname lecturers were kept as verified.
- **API:** `PATCH /api/admin/users/:userId/verify-lecturer`, `…/unverify-lecturer`.

### Step 1: Action Centre (`a7a5357`)
- **Why:** every pending transaction should show its next action in one place.
- **Files:** `activity.service.js`, `frontend/js/action-centre.js`, `dashboard.html`, `navbar.js` (badge count).
- **API:** `GET /api/activity`.

### Step 2: tasks (`2ab76a9`, `b90ddae`)
- **Why:** the poster must confirm, or a defined dispute process applies; the poster chooses the worker.
- **Files:** `task.service.js` (`disputeTask`, `resolveTaskDispute`), `jobs/scheduler.js` (review reminders), `offer.service.js` (applications), `task-details.js`, `admin.js`.
- **Database:** `tasks.status` gains `Disputed`; dispute fields and reminder timestamps (`repair-task-disputes-schema.js`).
- **API:** `POST /api/tasks/:id/dispute`, `PATCH /api/admin/tasks/:taskId/resolve-dispute`. `PATCH /api/tasks/:id/accept` now refuses ("the poster chooses"); workers apply through `/api/offers`.

### Admin Analytics & Reports (`601be50`), a separate request
- **Files:** `analytics.service.js`, `reportExport.service.js`, `frontend/js/admin-analytics.js`.
- **API:** `GET /api/admin/analytics`, `GET /api/admin/exports/:type` (CSV with no emails or phones; every export is audit-logged).

### Step 3: sales (`16429b3`)
- **Why:** a failed meetup or handover needs a recovery path that never shows the buyer's code to the seller.
- **Files:** `sales.service.js` (`disputeSaleOrder`, `resolveSaleDispute`), `sale-details.js`, `admin.js`.
- **Database:** `sale_orders.status` gains `Disputed`, plus dispute fields (`repair-sale-disputes-schema.js`).
- **API:** `POST /api/sales/orders/:orderId/dispute`, `PATCH /api/admin/sale-orders/:orderId/resolve-dispute` (release, refund, or retry with a new code).

### Step 4: rentals (`5553ff2`)
- **Why:** the addendum. Request → approve → pay; deadlines, reminders and extensions; money rules that can't run until they're approved.
- **Files:** `equipment.service.js`, `rentalCore.service.js`, `rentalExtension.service.js`, `rentalPolicy.service.js`, `config/rentalPolicy.js`, `config/paymentSettings.js` (`RENTALS`), `jobs/scheduler.js`, `frontend/js/equipment.js`, `equipment-details.js`.
- **Database:**
  - `equipment_bookings` gains `Awaiting Payment`, payment `Unpaid`, `payment_due_at`, `return_due_at`, `policy_version`, `terms_snapshot`, cancel and problem fields;
  - new table `booking_extensions` (`repair-rental-lifecycle-schema.js`).
- **API:**
  - `POST /api/equipment/bookings/:bookingId/pay`, `…/owner-cancel`, `…/refuse-pickup`, `…/problem`;
  - the extension routes `…/extension`, `…/extension/approve|decline|cancel|pay`;
  - `PATCH /api/admin/rental-bookings/:bookingId/resolve-damage`;
  - `…/confirm` now means "approve" (payment comes after).

### Step 5: Campus Marketplace (`a86d2a1`)
- **Why:** keep this area about goods, services and exchanges, not a general calendar.
- **Files:** `config/categories.js` (marketplace and institutional categories; old categories still readable), `event.service.js`, `config/marketplace.js`, the events pages renamed in the UI.
- **Database:** `events.listing_authority` (`repair-marketplace-authority-schema.js`).
- **Behaviour:** institutional listings need the name of who authorised them, and go to the admin Moderation queue before anyone sees them.

### Diagrams (`b32c481`)
- State machines, DFD Level 0 and 1, and the ERD, in `docs/diagrams/`.

### Step 6: lecturers and participation (`e890592`)
- **Why:** meaningful participation without unapproved authority; fix a privacy leak.
- **Files:** `config/features.js`, `middleware/feature.middleware.js`, `user.service.js` (contact details only to the owner or an admin), `lecturer.routes.js`, `feedback.service.js`, `feedback.html`, `admin.js` (account-type filters, feedback list), `helpers.js` (badge for verified lecturers only).
- **Database:** new table `feedback` (`repair-feedback-schema.js`).
- **API:**
  - new: `GET /api/features`, `POST /api/feedback`, `GET /api/feedback/kinds`, `GET /api/admin/feedback`, `PATCH /api/admin/feedback/:feedbackId/reviewed`;
  - the endorsement routes return an error while the switch is off;
  - `GET /api/users/:id/profile` now reads who is asking.

### Step 7: documents and database setup (this commit)
- **New `backend/scripts/repair-all.js`:** runs all 28 repair scripts in order and stops at the first failure. Run twice on practice, the second run changed nothing.
- **New `backend/scripts/lib/widen-enum.js`:** adds allowed values to a column without removing any. It's now used by the four scripts that used to write fixed lists.
- **`repair-messaging-schema.js`:** no longer re-adds the retired `reports.task_id`.
- **New `backend/scripts/export-schema.js`:** writes the structure of the database to `taskify-schema.sql`. It's read-only.
- **`taskify-schema.sql`:** regenerated from live (structure only, UTF-8, tables in foreign-key order, `CREATE TABLE IF NOT EXISTS`). It was checked by building it into temporary tables and comparing with live: 325 columns, 39 foreign keys and 76 indexes, all identical.
- **`backend/schema.sql`:** replaced with a pointer. Its old `ALTER` statements would have removed `Disputed` from `tasks.status`.
- **Docs:** `DEPLOYMENT.md` updated; `docs/state-machines.md`, `docs/money-rules.md`, `docs/open-questions.md` and this report added.

---

## 7. Tests

Run from `backend/` with `npm test`. Tests use the local practice database only: `tests/helpers.js` refuses to run against any non-local database.

| File | Tests | Covers |
|---|---|---|
| `tasks.test.js` | 12 | Only the right user can act at each step; double-clicks release payment once; the poster chooses. |
| `task-disputes.test.js` | 12 | Report a problem, admin outcomes, review reminders, privacy of dispute details. |
| `sales.test.js` | 7 | Handover code: right code, wrong code, lockout, released once; the seller never receives the code. |
| `sale-disputes.test.js` | 14 | Failed meetup, admin release, refund or retry (new code), the buyer can't cancel while disputed. |
| `rentals.test.js` | 27 | Dates and costs, clashes including simultaneous requests, approve → pay, unpaid approvals lapse, extensions, return deadline, reminders, no charges under unapproved rules, policy-version check. |
| `marketplace.test.js` | 7 | Marketplace categories, institutional listings need authority and review. |
| `lecturers.test.js` | 6 | Lecturer verification. |
| `participation.test.js` | 7 | Feature switches enforced by the server, profile privacy, feedback. |
| `activity.test.js` | 5 | Action Centre shows the next action for each side. |
| `analytics.test.js` | 9 | Admin-only access, date ranges, CSV escaping, no personal contact details in exports. |

**Result (10 October 2026): 106 tests, 106 passed, 0 failed.**

Also checked:
- `repair-all.js` runs cleanly on practice;
- `taskify-schema.sql` rebuilds the live structure exactly;
- each UI step was checked in a browser against the practice servers while it was built.

**Not covered by automated tests:** the frontend (there's no browser test runner), email and push delivery, and the live Render deployment.

---

## 8. Limitations, security notes and provider dependencies

**Payments**
- All payments are a demo. Nothing in Taskify can collect, hold or pay out real money until a provider is connected and the questions in [open-questions.md](open-questions.md) are answered. Deposits, unused-day refunds and late fees stay off until approved (see [money-rules.md](money-rules.md)).

**Workflow gaps**
- **Sales:** a buyer can cancel a protected order (instant demo refund) at any time before the seller enters the code, unless a problem was already reported. A seller who travelled to a meetup can report a problem, but only if they do it before the buyer cancels.
- **Overdue rentals:** an overdue rental keeps the item blocked for new requests. A *later* booking that was already confirmed isn't moved or cancelled automatically; admins are asked to follow up after 72 hours.
- **Institutional accounts:** departmental accounts are not built. Only individual accounts exist.
- **Endorsements switch:** if it's switched back on, the lecturer "search students" screen shows students' email addresses (`lecturer.service.js`). Review that before switching it on.

**Hosting**
- On Render's free tier the server sleeps after 15 minutes without traffic, and reminders run only while it's awake. A missed reminder is sent on the next check after it wakes. Nothing is lost, but it can be late.

**Content screening**
- Screening "fails open": if Azure isn't configured or is down, posts publish unchecked.

**Legal text**
- The terms and privacy page (`frontend/terms.html`) predates the rental and feedback changes and needs updating after legal review.

**Security in place**
- Permissions and state checks run on the server.
- Admin actions need two-factor sign-in and are audit-logged.
- The handover code is only ever sent to the buyer.
- Contact details are hidden in chat until a payment is held, and on profiles from everyone except the owner and admins.
- Secrets live only in `.env` files (git-ignored) and Render's settings.
- CSV exports are protected against formula injection.

---

## 9. Recommended next steps

Ordered by user impact, then implementation risk.

1. **Get answers to the university questions** (no code). This unblocks lecturers, endorsements and institutional listings safely.
2. **Update the terms and privacy page** with legal input: rental terms, photos, login records, exports, feedback. Low technical risk, high trust impact.
3. **Decide the sale-cancellation rule** (business rule 3 in [open-questions.md](open-questions.md)), for example a short window after a reported meetup time. Small change, removes a fairness gap.
4. **Tell the next renter when an item is overdue**, and give them a cancel-with-refund option. Medium change; it touches rental scheduling.
5. **Talk to a payment provider** using the provider questions. Nothing changes in the code until there's a provider that can verify payments.
6. **Connect the real provider** in the service functions named in [money-rules.md](money-rules.md), starting with tasks (simplest). High risk: it needs webhooks, reconciliation and new tests.
7. **Switch on approved money rules one at a time** through the approval gate, each with its own tests.
8. **Browser tests** for the main flows (for example with Playwright), so frontend changes are checked automatically too.
