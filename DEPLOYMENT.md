# Deploying Taskify (free, public, Google-indexable)

This walks through putting Taskify on the public internet on Render's free
tier, with a free hosted MySQL database on Aiven — enough for it to have a
real URL, show up on Google, and be usable by real UMP students for a
coursework/demo deployment. It is **not** a production launch: there's no
real payment gateway (see "About the payment step" below), and the free
tiers used here have real limits (see "Known limitations").

Total cost: **R0**. Time: roughly 30–45 minutes.

**Where to run the commands in this doc:** any terminal open **inside your
project folder** (`...\Project\Taskify`) works — Command Prompt,
PowerShell, or the terminal panel in VS Code all run `git`, `node`, and
`mysql`/`mysqldump` commands identically, since those are just Windows
programs, not shell scripts. The one thing to watch for: every command
below is written as a single line specifically so it pastes correctly into
any of those three — if you ever see a command in the wild split across
multiple lines with a trailing `\`, that's bash line-continuation syntax
and won't work as-is in Command Prompt or PowerShell (collapse it to one
line, or use Git Bash instead — installed alongside Git for Windows, and
the one shell that runs it unmodified). To open a terminal already inside
the right folder: open the `Taskify` folder in File Explorer, then either
right-click and choose "Open in Terminal", or click the address bar, type
`cmd` (or `powershell`), and press Enter.

If `mysqldump`/`mysql` isn't recognized as a command, MySQL's `bin` folder
(typically `C:\Program Files\MySQL\MySQL Server 8.0\bin`) isn't on your
PATH — either add it, or `cd` into that folder first and run the commands
from there.

---

## 0. The database structure: two files, two jobs

| File | Use it for |
|---|---|
| `taskify-schema.sql` (project root) | Setting up an **empty** database. It holds every table, column, key and index (no rows), exported from the live database. Each statement is `CREATE TABLE IF NOT EXISTS`, so it never drops or changes an existing table. |
| `backend/scripts/repair-all.js` | Bringing an **existing, older** database up to date. It runs all the `repair-*.js` scripts in the order the features were added. Each one only adds what's missing and never removes rows, so running it on an up-to-date database changes nothing. It stops at the first script that fails. |

`backend/schema.sql` is no longer used; it now only points to these two.

When a new repair script is added, add it to the **end** of the list in `repair-all.js`. After running it, export `taskify-schema.sql` again so the two stay in step (from `backend/`; it only reads the database named in the root `.env`):

```bash
node scripts/export-schema.js
```

(Starting with an empty database is the safer choice for a public demo. Don't copy real student data onto a publicly reachable database.)

---

## 1. Push this repo to GitHub

Render deploys from a GitHub repo. If this project isn't already on GitHub:

```bash
git init                     # if not already a git repo
git add .
git commit -m "Prepare for deployment"
git branch -M main
git remote add origin https://github.com/<your-username>/taskify.git
git push -u origin main
```

(`backend/.env` is already git-ignored — double-check with `git status`
that no `.env` file is about to be committed before you push.)

---

## 2. Create the free MySQL database (Aiven)

1. Go to **aiven.io**, sign up for a free account, and create a new
   **MySQL** service on the **Free** plan.
2. Once it's provisioned (a minute or two), open the service and copy its
   connection details: **Host**, **Port**, **User**, **Password**,
   **Database name** (Aiven names the default database `defaultdb`).

3. **Which `.env` file to edit.** This project actually has two `.env`
   files: one directly in the `Taskify` folder (project root), and one
   inside `backend/`. The app itself (`npm start`) reads the one inside
   `backend/` — leave that one alone, pointed at your local database, so
   local development keeps working unaffected by everything below. The
   scripts in this section (`import-schema.js`, `repair-all.js` and
   `create-admin.js`) read the **root** one instead. (Run the repair
   scripts through `repair-all.js` rather than one by one: a few older
   ones look for `backend/.env` when run on their own.) So: open the
   `.env` file directly inside `Taskify` (not `Taskify\backend\.env`) and
   set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` to your
   Aiven values from step 2, and set `DB_SSL=true`.

4. **Import your schema.** Don't use the `mysql` command-line client for
   this — the older client bundled with tools like XAMPP often can't
   speak MySQL 8's `caching_sha2_password` authentication that Aiven (and
   most modern hosted MySQL) uses, and fails with a
   `Plugin caching_sha2_password could not be loaded` error. Use the
   included Node script instead, which reuses the same database driver
   this project's backend already depends on and doesn't have that
   problem. From the `backend/` folder:

   ```bash
   node scripts/import-schema.js
   ```

   (With no path it uses `taskify-schema.sql` from the project root.)
   You should see `Success — executed ~N statement(s) against defaultdb.`

5. Run every repair script once, to be sure nothing is missing. It
   prints which database it's about to change, so check that line says
   `defaultdb` on your Aiven host. From the `backend/` folder:

   ```bash
   node scripts/repair-all.js
   ```

   On a database freshly made from `taskify-schema.sql` every script
   just reports that there's nothing to add. The runner loads the root `.env`
   before any script runs, so all 28 scripts aim at the same database,
   including the few that look for `backend/.env` themselves.

6. Create your first admin account directly on Aiven, still with the root
   `.env` pointed at it:

   ```bash
   node scripts/create-admin.js create "Your Name" you@ump.ac.za "a-strong-password"
   ```

7. You're done needing Aiven credentials in a file for now. Since the app
   itself reads `backend/.env` (untouched, still local) rather than the
   root one, there's no urgency — but it's tidy to set the root `.env`'s
   `DB_*` values back to your local ones once you're finished with this
   section, so a future `node scripts/repair-all.js` run doesn't
   accidentally target Aiven again by surprise.

---

## 3. Deploy to Render with the included blueprint

This repo includes a `render.yaml` at its root, which describes both
services Render needs to create:

- **taskify-backend** — the Node/Express API
- **taskify-frontend** — the static HTML/CSS/JS frontend

Steps:

1. Go to **render.com**, sign up (GitHub sign-in is easiest), and click
   **New +** → **Blueprint**.
2. Connect your GitHub account and select the `taskify` repo.
3. Render reads `render.yaml` and shows both services it's about to
   create. Before clicking deploy, it will ask you to fill in every
   environment variable marked `sync: false` for `taskify-backend`. Have
   these ready:

   | Variable | Value |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from Aiven (step 2) |
   | `DB_SSL_CA` | optional — Aiven's CA cert (from its console); safe to leave blank |
   | `JWT_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `TOTP_ENCRYPTION_KEY` | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from your existing Cloudinary account |
   | `CLIENT_URL`, `APP_URL` | leave blank for now — see step 4 |
   | `BREVO_API_KEY` | get one free from Brevo (Settings → SMTP & API → API Keys) — leave blank to run in dev mode (emails log to Render's console instead of sending). **Use this, not `SMTP_*`** — Render's free tier blocks outbound SMTP ports entirely, so plain SMTP can never work here regardless of credentials. See `backend/EMAIL_SETUP.md`. |
   | `AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY` | leave blank to run without content moderation, or fill in if you have them |

4. Click **Apply**. Render builds and deploys both services — this takes a
   few minutes. When it's done, you'll have two URLs, e.g.:
   - `https://taskify-backend.onrender.com`
   - `https://taskify-frontend.onrender.com`

5. **Go back and fill in `CLIENT_URL` and `APP_URL`** on the
   `taskify-backend` service (Dashboard → taskify-backend → Environment) —
   set both to your actual `taskify-frontend` URL from step 4, then save
   (this triggers a redeploy of the backend).

6. **Update the frontend's API URL.** Open `frontend/js/api.js` in this
   repo and replace the placeholder on this line with your real backend
   URL from step 4:

   ```js
   const PRODUCTION_API_URL = "https://taskify-backend.onrender.com/api";
   ```

   Commit and push that change — Render auto-deploys on every push to
   `main` by default.

7. Visit your frontend URL. You should land on the login page and be able
   to register (with a `ump.ac.za` / `student.ump.ac.za` email) and use the
   app end to end.

---

## 4. Get it appearing on Google

This repo already includes `frontend/robots.txt` and `frontend/sitemap.xml`
for this. Since nearly every page requires login, they're set up to let
Google index only the genuinely public pages (the home redirect, login,
register, forgot-password) rather than crawl pages that just redirect to
login anyway.

1. In both files, replace the placeholder domain
   (`https://taskify-frontend.onrender.com`) with your actual frontend URL
   if it's different, and commit/push.
2. Go to **Google Search Console** (search.google.com/search-console),
   add your frontend URL as a property, and verify ownership (the
   HTML-file or meta-tag method both work for a static site like this).
3. Under **Sitemaps**, submit `sitemap.xml`.
4. Use **URL Inspection** → **Request Indexing** on your home page URL to
   speed up the first crawl.

Indexing isn't instant — expect it to take anywhere from a few days to a
couple of weeks for Google to actually show the pages in search results.

---

## About payments, money rules and feature switches

There's no real payment gateway wired up (Stripe, PayFast, etc. all need a
registered business/merchant account, which the project doesn't have yet).
Every payment, hold, release and refund in Taskify is a **demo**: a status
value in the database, labelled "Demo" on screen. No money moves.

- **Rentals** work as request → owner approves → renter pays (demo).
  Security deposits, refunds for unused days and late fees are written
  down as proposals in `backend/src/config/rentalPolicy.js` and are **not
  in effect**. One check (`isEnforceable` in `rentalPolicy.service.js`)
  keeps them off until each is approved, dated, in effect and supported
  by a real payment provider.
- **Feature switches** for things the university hasn't decided yet
  (lecturer endorsements: off; institutional marketplace listings: on,
  with an admin check) are in `backend/src/config/features.js` and
  `backend/src/config/marketplace.js`. The server enforces them, so
  changing one needs a redeploy.

All the numbers (fees, time limits) are in
`backend/src/config/paymentSettings.js`. The full explanation, including
where a real provider would plug in, is in `docs/money-rules.md`. The
questions to settle with legal, the university and a payment provider
first are in `docs/open-questions.md`.

---

## Known limitations of this free setup

- **Render free web services sleep after 15 minutes of no traffic.** The
  first request after that takes 30–60 seconds to wake back up — normal
  and expected, not a bug. There's no free way around this; Render's paid
  tier ($7/mo) removes it if that's ever worth paying for. Reminders
  (return deadlines, unconfirmed tasks) are checked every 15 minutes
  while the server is awake, so after a sleep they go out late rather
  than not at all.
- **Aiven's free MySQL tier caps out at 1GB storage and 76 connections** —
  plenty for coursework/demo traffic, not for real production load.
- **No custom domain is required** for Google indexing or public access —
  the `*.onrender.com` URLs work fine for both — but a custom domain (e.g.
  from a university or a cheap registrar) can be added later in Render's
  dashboard under each service's "Custom Domains" tab if wanted.
- **Emails run in dev mode** (logged, not sent) until `BREVO_API_KEY` is
  added — registration/verification/password-reset emails won't actually
  arrive in anyone's inbox until then. Note this is `BREVO_API_KEY`, not
  `SMTP_*` — Render's free tier blocks outbound SMTP ports entirely, so
  plain SMTP credentials will hang and time out here no matter how correct
  they are. See `backend/EMAIL_SETUP.md`.
