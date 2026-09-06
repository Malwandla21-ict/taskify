# Setting up AI content moderation

Without this, Taskify still works locally — tasks, sales listings, equipment
listings, events, and their images all publish unchecked, and the backend
console logs `[moderation] AZURE_CONTENT_SAFETY_ENDPOINT/KEY not set —
content moderation is disabled` once at startup as a reminder. Fill in
`AZURE_CONTENT_SAFETY_ENDPOINT` and `AZURE_CONTENT_SAFETY_KEY` in
`backend/.env` before real students use the app, so obviously inappropriate
posts and images get caught automatically instead of relying purely on
other students reporting them after the fact.

This uses **Azure AI Content Safety** rather than OpenAI's Moderation API.
OpenAI's endpoint is technically free per-call too, but OpenAI gates *all*
API access — even free endpoints — behind having a payment method on file
for the org, which is a real blocker if you don't want to hand over a card.
Azure's free (F0) tier for Content Safety needs no card at all under an
Azure for Students subscription.

## Getting an endpoint + key (no credit card)

1. Go to **azure.microsoft.com/free/students** and sign up with your
   university email. This gives $100 of Azure credit for 12 months and, as
   the page states outright, requires no credit card — verification is via
   your school email.
2. In the Azure Portal, click **Create a resource** and search for
   **Content Safety** (sometimes listed as part of "Azure AI services").
   Create it with:
   - **Pricing tier: F0 (Free)** — 5 requests/second, no charge. Confirm
     the exact free monthly allowance shown on the resource's pricing tab
     when you create it, since it can vary by region/offer.
   - Any region that lists Content Safety as available.
3. Once created, open the resource's **Keys and Endpoint** page. You need:
   - The **Endpoint** (e.g. `https://your-resource-name.cognitiveservices.azure.com`)
   - **Key 1** (or Key 2 — either works)
4. Set in `backend/.env`:
   ```
   AZURE_CONTENT_SAFETY_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com
   AZURE_CONTENT_SAFETY_KEY=your-key-here
   ```
5. Restart the backend — env vars are only read at process startup, so
   editing `.env` while the server is already running does nothing until
   you stop and start it again.

## How it works

- **Text** — every new task, sales listing, equipment listing, and event
  has its title + description checked against Azure's `text:analyze`
  endpoint before it's saved.
- **Images** — every image goes through `image:analyze` as part of the
  upload step, before it ever reaches Cloudinary.
- Azure scores each of four categories — **Hate**, **SelfHarm**, **Sexual**,
  **Violence** — on a severity scale of 0 (safe), 2 (low), 4 (medium), or
  6 (high), rather than OpenAI's yes/no flags. Per-category thresholds in
  `SEVERE_THRESHOLDS` (top of `backend/src/services/contentModeration.service.js`)
  decide what hard-blocks outright (content never created, image never
  uploaded) vs. what just gets queued: SelfHarm/Sexual/Violence block at
  Medium (4) and above, Hate blocks only at High (6). Anything scoring
  Low (2) or above without crossing its block threshold still publishes,
  but is marked `pending_review` and every admin gets a notification.
  Admins can clear the flag or remove the content from the moderation
  queue (`GET /api/admin/moderation`).
- **Known coverage gap vs. OpenAI**: Azure's four categories don't include
  a dedicated "sexual content involving minors" flag, general harassment/
  insults (as opposed to Hate specifically), or "illicit activity advice."
  If bullying/harassment-style reports keep slipping through, that's why.
- **Local keyword backstop** (also in `contentModeration.service.js`) —
  added after testing showed Azure's Violence category doesn't reliably
  catch a plain first-person statement like "I need someone to kill
  someone" (scored 0 across every category — verified against Microsoft's
  own documented example to rule out a config problem). Runs entirely
  offline, before any AI call, and normalizes basic obfuscation (leetspeak
  digits, masked vowels like `k.ll`). Two tiers: `HARD_BLOCK_PHRASES`
  (unambiguous phrases like "commit suicide," "hire a hitman" — reject
  outright) and `SOFT_FLAG_PHRASES` (ambiguous bare words like "kill,"
  "murder" — queued for admin review rather than blocked outright, since
  words like "kill" have real idiomatic uses — "kill time," "kill the
  lights" — that a hard block would wrongly reject). Text-only; there's no
  equivalent for images since there's no text to match against.

## Verifying it works

Restart the backend, then create a test task/listing/event with obviously
policy-violating text, or try uploading an obviously policy-violating
image. It should be rejected with a 400 (text) or 422 (image) error
instead of going through. A borderline case should still go through but
show up under `GET /api/admin/moderation` and generate an admin
notification. If nothing is being checked at all, check the backend
console for the "AZURE_CONTENT_SAFETY_ENDPOINT/KEY not set" warning, and
double-check the endpoint/key in `.env` (and that you restarted) if the
warning isn't there but checks still aren't happening.

`backend/scripts/test-moderation-live.js` and
`backend/scripts/test-moderation-raw.js` are diagnostic scripts written
for the OpenAI integration and are no longer accurate for this Azure
setup — safe to ignore or delete. Use these instead:
- `test-azure-moderation.js` — runs a few text phrases through
  `evaluateText()` (the same function task/sales/equipment/event creation
  uses) and prints the parsed result.
- `test-azure-moderation-raw.js` — bypasses the app's code entirely and
  dumps the raw HTTP response from Azure for one phrase, useful when the
  parsed results look wrong and you need to rule out a parsing bug.
- `test-azure-moderation-image.js` — same idea as the first script, but
  for `evaluateImage()` (the code path every uploaded photo goes through),
  using a harmless generated test image just to confirm the plumbing
  works end-to-end.
