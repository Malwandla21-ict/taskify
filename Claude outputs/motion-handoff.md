# Taskify: add the brand animations to the website

**For:** Claude Code, working in the Taskify project folder
**Files that come with this note:** `taskify-motion.js`

## What this is

The Taskify logo was redesigned, and three animations were built from it:

1. **Logo reveal:** for the landing page.
2. **Payment held:** a small pop-up at the bottom of the screen when money is held (demo).
3. **Payment released:** the same pop-up when money is released (demo).

`taskify-motion.js` is finished and tested. It contains the logo artwork and every animation, and it respects "Reduce motion". **Your job is only to wire it in:** load the file on the right pages and call it at the right moments.

Don't use the MP4 videos on the website. They're for social media and video editing. The website uses the JavaScript version.

## Ground rules

1. **Show the plan first and wait for Malwandla's OK** before changing any file.
2. **Work one page at a time**, in the order below. Finish and test a page before moving on.
3. **Give full file contents** for every JS and HTML file you change, not snippets.
4. **After each change, give the git commands** to commit and push. Malwandla runs them; don't push yourself.
5. **Don't edit `taskify-motion.js`** except to fix a real bug, and explain the fix if you do.
6. **Don't touch the backend.** This is frontend only.
7. **Only play an animation after the API call has succeeded.** Put the call on the line after the `await apiRequest(...)` that does the action, never before it and never in the `catch`. Error toasts stay exactly as they are.
8. **One pop-up at a time.** For the actions below, the animation *replaces* the success `showToast(...)`. Don't show both.
9. **Use the existing helpers** (`apiRequest`, `showToast`, `openModal`, `closeModal`, and the rest) and the existing CSS tokens (`--ease-out`, `--ease-in-out`, `--ump-*`).

## Colour decision

- The **logo keeps its own green `#12A66E`**. It's built into `taskify-motion.js`; don't change it.
- The **website keeps `--ump-green: #009B72`**. White text is easier to read on it (contrast 3.54 vs 3.13), so buttons stay as they are. Don't change `main.css` colours.

## How to call it

```js
// Logo reveal: puts the logo inside an element and plays it once
TaskifyMotion.mountReveal(element, { color: "#FFFFFF" });  // white lettering for dark backgrounds

// Payment pop-ups: call only after the API call succeeded
TaskifyMotion.moment("held",     { message: "R360.50 is held until you meet the seller." });
TaskifyMotion.moment("released", { message: "R350.00 sent to the seller." });

// Optional: a different heading than "Payment held" / "Payment released"
TaskifyMotion.moment("released", { title: "Deposit returned", message: "..." });
```

- `message` is shown as plain text, so it's safe to include names or amounts from the API.
- The pop-up disappears after about 3 seconds, or when clicked.
- Where an amount is already available on the page (the task price, `total_amount` from the order), use it in the message. If it isn't, use a message without an amount. **Don't invent numbers.**

## Step 0: Put the file in place

- Copy `taskify-motion.js` to `frontend/js/taskify-motion.js`.
- Add `<script src="./js/taskify-motion.js"></script>` **after `helpers.js` and before the page's own script** on these pages:
  - `index.html` (before `landing.js`)
  - `sale-details.html`
  - `task-details.html`
  - `equipment-details.html`
  - `equipment.html`
  - `notifications.html`
- `sw.js` only handles push notifications and caches nothing, so there's no cache version to bump.

## Step 1: Landing page logo reveal

**File:** `index.html` and `landing.js`

- In `.landing-hero-inner`, add an empty `<div class="landing-hero-logo"></div>` **above** the `<h1>`.
- Style it in `landing.css`: `width: min(420px, 80vw); margin: 0 auto 20px;`. Match the hero's own alignment.
- In `landing.js`: `TaskifyMotion.mountReveal(document.querySelector(".landing-hero-logo"), { color: "#FFFFFF" });`
- The hero has a dark photo overlay, so the lettering is white.
- Leave the small logo in the top navigation alone for now. Swapping the old logo images for the new marks is a separate job.

## Step 2: "Payment held" moments

Line numbers are from the 27 Sep 2026 code and are approximate, so **search for the API path**.

| Page script | Search for | When it succeeds, call |
|---|---|---|
| `sale-details.js` (~line 271) | `` `/sales/${saleId}/buy` `` | `moment("held", …)`: the item price + 3% fee is held until handover |
| `task-details.js` (~line 209) | `` `/tasks/${acceptBtn.dataset.taskId}/accept` `` inside `openPaymentSimulationModal` | `moment("held", …)`: the task price is held until the poster confirms the work |
| `offers.js` (~line 361) | `` `/offers/${offer.id}/accept` `` | `moment("held", …)`: agreeing a price holds the payment straight away |
| `equipment-details.js` (~line 226) | `` `/equipment/${…}/book` `` | `moment("held", …)`: the rental payment (and deposit, if any) is held |

**Careful with `task-details.js`:** `updateTask(...)` is shared by several buttons (accept, status changes, cancel). Only the **accept** call should play "held". Pass an option or a success callback into `updateTask` rather than making every task action play it.

## Step 3: "Payment released" moments

| Page script | Search for | When it succeeds, call |
|---|---|---|
| `sale-details.js` (~line 297) | `` `/sales/orders/${…}/release` `` | `moment("released", …)`: the seller gets the item price |
| `notifications.js` (~line 271) | `` `/tasks/${…}/confirm-completion` `` | `moment("released", …)`: the worker gets paid |
| `equipment.js` (~line 107) | `` `/equipment/bookings/${…}/${mode === "pickup" ? "pickup" : "return"}` `` | **Only when `mode === "pickup"`**: `moment("released", …)`: the owner gets the rental payment |
| `equipment.js` (~line 533) | `` `/equipment/bookings/${…}/condition-ok` `` | `moment("released", { title: "Deposit returned", … })`, but **only if a deposit was held**. If the page can't tell, use a message that doesn't mention a deposit. |

**Never play either animation on:** cancel, decline, refund, withdraw, report damage, return (without pickup), or any error.

## Test checklist (do this for every page before moving on)

- [ ] The animation plays **once**, after the success. Nothing plays when the API returns an error.
- [ ] No success toast and pop-up on screen at the same time.
- [ ] With the backend stopped, clicking the button shows the normal error toast and **no** animation.
- [ ] Turn on "Reduce motion" (Windows: Settings → Accessibility → Visual effects → Animation effects **off**). The pop-up should fade in without moving.
- [ ] On a phone-width window (about 400px) the pop-up fits, with space on both sides.
- [ ] The browser console shows no errors.
- [ ] Landing page: the logo reveal plays once on load, and the lettering is white and readable on the hero photo.

## When you're done

Summarise which files changed and give the final git commands, for example:

```
git add frontend/js/taskify-motion.js frontend/index.html frontend/css/landing.css frontend/js/landing.js ...
git commit -m "Add brand animations: landing logo reveal, payment held/released pop-ups"
git push
```
