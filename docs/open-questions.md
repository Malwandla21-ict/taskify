# Policy-sensitive features and open questions

Taskify is a student project for the University of Mpumalanga (UMP) community. The university has not yet set policies for it, and no lawyer or payment provider has reviewed it. This document lists:

1. the parts of Taskify that depend on decisions nobody has made yet, and how each one is kept safe for now;
2. the questions to take to **legal advice**, the **university**, and a **payment provider**.

None of the answers below are assumed. Where a question names a law, that's because the law *may* apply. The list isn't complete, and a qualified person should decide what actually applies.

---

## 1. Policy-sensitive features and their safe defaults

| Feature | Where | Why it needs a decision | What happens today |
|---|---|---|---|
| Holding and releasing payments | `paymentSettings.js` `DEMO_MODE` | Holding someone's money until a handover may be a regulated activity. | **Demo only.** No money moves; every screen says "Demo". |
| Protection fees (3% on protected sales, 5% on rentals) | `paymentSettings.js` | A fee charged by the platform needs clear disclosure and a lawful basis. | Shown before paying; demo only. |
| Security deposits | `rentalPolicy.js` `deposit`, `RENTALS.depositsEnabled` | Holding, keeping or deducting a deposit needs agreed terms and a provider that can hold money. | **Off.** Status `proposed`; fails safe. |
| Refunds for unused rental days | `rentalPolicy.js` `earlyReturnRefund` | Must not deny a refund the law requires, and must not promise one that isn't approved. | Early return is always allowed; a labelled estimate only; nothing refunded automatically. |
| Late fees | `rentalPolicy.js` `lateFee` | Penalties need disclosure, consent, a cap and a dispute route. | **Not charged.** Lateness is recorded; reminders are sent; an estimate is shown labelled "not in effect". |
| Damage decisions | admin `resolve-damage` | Deciding fault affects a student's record and what they can rent. | An admin decides; **nothing is charged**; "renter not at fault" removes the mark. |
| Trust levels | `RENTAL_TRUST_LEVELS` | Limiting what someone may rent based on their history is a kind of profiling. | Limits the item value a renter can book; based on finished rentals, ratings and damage. |
| Lecturer accounts | admin `verify-lecturer` | Who counts as a lecturer, and what a badge implies. | A name.surname UMP email **and** admin verification are needed. The badge shows only for verified lecturers. No extra admin powers. |
| Lecturer endorsements | `features.js` `endorsements` | Lecturers "recommending" students on a marketplace may conflict with staff rules. | **Off.** The server refuses it; existing rows are kept but hidden. |
| Campus Marketplace listings | `marketplace.js` | Who may publish campus-wide sales and market days, and on whose authority. Selling university property (farm produce, surplus, lost property) needs the university's authority. | Only Taskify admins can post (`adminsOnlyPosting`). Institutional ones still need a note of who authorised them. They're labelled "Reviewed institutional listing", never "official". There's a switch to turn them off. |
| Cash sales that are never marked sold | `sales.service.js` `markSalesItemAsSold` | Items under R300 are paid in cash, so Taskify never learns that they sold. A forgotten listing stays up and buyers waste time on it. Options: remind the seller after a few weeks, then hide it ("Is this still for sale?"). | A single item comes down as soon as the seller presses **Mark as Sold** (several: **Sold one** / **Sold the rest**). Nothing happens on its own yet. |
| Institutional or departmental accounts | — | Who may speak for a department. | **Not built.** Only individual accounts exist. |
| Feedback, consultation and testing | `features.js` `feedback` | Staff taking part in product work. | On. Sending feedback never grants permissions. |
| Handovers in person on campus | sales and rentals | Safety, and which campus places may be used. | Not decided by Taskify; users arrange meetups. |
| Personal information | profiles, chat, photos, logs | POPIA duties: purpose, retention, access, deletion. | Email, phone and student number are shown only to the account owner and admins. Contact details in chat are hidden until a payment is held. Admin CSV exports leave out emails and phones, and each one is audit-logged. |
| Automatic content screening | `contentModeration.service.js` | Text and images are sent to an outside service (Azure). | If the service is down or not set up, content **publishes unchecked**; admins can still remove it. |
| Admin powers | admin console | Suspensions, bans, refunds and dispute decisions need a fair, written process. | The admin console needs two-factor sign-in, and admin decisions are written to the audit log. |

---

## 2. Questions for legal advice

*Laws that may be relevant include the Consumer Protection Act 68 of 2008, the Electronic Communications and Transactions Act 25 of 2002, and the Protection of Personal Information Act 4 of 2013. This list is not exhaustive.*

**The platform's role**
1. When Taskify holds a buyer's money until the handover code is entered, what is it legally? Does that need a licence, registration, or a regulated partner (a bank, escrow or payment company)?
2. Is Taskify a party to the sales, rentals and tasks, or only the platform that connects people? Does charging a protection fee change that?
3. Who is responsible if an item sold or rented between students is faulty, unsafe or not as described?

**Consumer protection (CPA)**
4. Do peer-to-peer sales and rentals between students fall under the CPA? Does it matter whether the seller sells often?
5. What must be shown before a person commits: the price, fees, cancellation rules, deposit and late-fee terms? Is the current "terms shown, version saved, accept before paying" approach enough?
6. Which refunds are required by law, for example for a defective item or an owner who can't hand it over, whatever Taskify's own policy says?
7. Are the proposed late fee (one day's rent per started 24 hours, capped at the item's value) and deposit percentages allowed? What limits apply to penalties?

**Electronic transactions (ECT Act)**
8. What information must the website show about who runs Taskify, how to contact them, and how to complain?
9. Is ticking "I accept the current terms" and saving a copy of those terms with the booking (`terms_snapshot`) a valid electronic agreement and record?
10. Do the cancellation and cooling-off rules for online transactions apply to any of these flows?

**Personal information (POPIA)**
11. Who is the responsible party, and who is the information officer?
12. How long may Taskify keep chat messages, handover and return photos, login records (IP address and browser), trusted-device records, reports and admin audit logs?
13. Data is stored or processed by Aiven, Render, Cloudinary, Brevo and Microsoft Azure, possibly outside South Africa. What is needed for that?
14. Is recording damage outcomes and using them for trust levels allowed? Must users be told, and how can they object?
15. The terms and privacy page (`frontend/terms.html`, last updated 22 September 2026) doesn't yet mention rental terms snapshots, handover photos, login records, admin exports or the feedback form. What must be added?

---

## 3. Questions for the university

1. Does UMP allow students to sell, rent and offer paid services to each other through a student-run platform? Are any items or services not allowed?
2. May lecturers and other staff take part? In what roles (feedback, usability testing, pilot programmes, posting departmental opportunities)? Which office approves this?
3. Should lecturers be allowed to **endorse** students or their listings? Endorsements are switched off until there is an answer.
4. Who decides which staff are verified lecturers? Is admin checking of a name.surname email enough, or is there an official staff list to check against?
5. May departments have their own accounts? Who may post for a department, and who approves it?
6. **Institutional listings:** may farm produce, surplus property or lost property be sold through Taskify? Who authorises each sale, and what proof should the admin record?
7. Which campus places are suitable and safe for handovers and meetups? Can facilities or security staff be involved?
8. When a dispute can't be settled by a Taskify admin (no-show, damage, fraud), where should it be escalated: Student Affairs, campus security, or a disciplinary process?
9. May Taskify use the UMP name and logo? How must "Built for students of UMP" be worded so it doesn't suggest official endorsement?
10. Is there a university policy on students handling money for each other, or on fees charged to students?

---

## 4. Questions for a payment provider

1. Can you **verify** a payment and tell our server (for example by a signed webhook) before we mark a booking `Confirmed` or an order `Held`?
2. Can money be **held** and released later only when a condition is met (handover code entered, task confirmed)? For how long?
3. Can you do **full and partial refunds** (unused rental days, cancelled bookings), and how long do they take?
4. Can you hold a **security deposit** separately from the rent and release it in full or in part after the return?
5. Can payouts to sellers and owners be **delayed** until a handover or return is confirmed?
6. Can you **split** a payment (seller's share, platform fee)?
7. How do **failed, reversed or charged-back** payments reach us, and what happens to the order?
8. What do you provide for **reconciliation**: reports and IDs we can match to our records?
9. How is the customer's **consent** recorded for an extra charge after the original payment, such as an extension or an approved late fee? Can we charge a saved card at all?
10. What business registration and checks (KYC) do you need from us and from people who receive payouts?
11. What fees do you charge, and is there a test mode we can build against?

---

## 5. Business rules still to decide

1. Are the numbers right? R300 for protection, a 3% sales fee, a 5% rental fee (R5–R50), 48 hours to answer a request, 24 hours to pay, an 18:00 return time.
2. Should an unanswered task confirmation ever settle itself, or must an admin always decide? Today nothing is released automatically.
3. Should the buyer be able to cancel a protected sale at any time before the seller enters the code? Today they can, unless a problem has already been reported.
4. When a rental is overdue, should the next renter's booking be moved automatically, or should they get back part of the rent for days lost while waiting? Today they're warned, can't collect until the return is recorded, and can cancel for a full refund (demo); nothing is moved, and there's no partial refund.
5. How many damage confirmations should lower a renter's trust level, and for how long?
