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

## 0. One gap to close first: no single file has the full current schema

`backend/schema.sql` exists but is an early snapshot (last touched mid-
August) — it only covers `users`, `tasks`, `payments`, `reviews`,
`reports`, `equipment`, `equipment_bookings`, `notifications`, `events`,
`event_rsvps`, `admin_audit_logs`, and `admin_allowlist`. Everything added
since then is missing from it: the `sales`, `conversations`, and
`messages` tables (created ad hoc, never captured in a SQL file), plus
every column the `backend/migrations/*.sql` + `backend/scripts/repair-*.js`
pairs added on top for auth security, content moderation, 2FA, trusted
devices, and the review generalization work — those scripts only `ALTER`
an existing table, they don't create one from scratch. So no combination
of committed files fully describes your database as it exists today — only
your actual local MySQL database does. A fresh Aiven database starts
completely empty, so you need to export your local structure directly.

**Do this once, before anything else below:**

```bash
# Structure only — no rows. Recommended: keeps whatever local test/demo
# data you have off the public database, and keeps this quick.
mysqldump -u root -p --no-data --routines --triggers taskify > taskify-schema.sql
```

(If you'd rather bring your existing users/tasks/etc. along too, drop
`--no-data` — but think about whether any of that data is real student
information before putting it on a publicly reachable database. For a demo
deployment, starting empty and having a teammate or yourself sign up fresh
is the safer default.)

Keep `taskify-schema.sql` handy — you'll import it into Aiven in step 2.

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
3. Import your schema (one line — see the "Where to run" note above):

   ```bash
   mysql --host=<aiven-host> --port=<aiven-port> --user=<aiven-user> --password=<aiven-password> --ssl-mode=REQUIRED <aiven-database-name> < taskify-schema.sql
   ```

4. Bring the schema fully up to date by running every repair script against
   Aiven, **in this order** (they're all idempotent, so re-running any of
   them is harmless if you're not sure which ones your dump already had):

   Temporarily point `backend/.env` at Aiven — edit `DB_HOST`, `DB_PORT`,
   `DB_USER`, `DB_PASSWORD`, `DB_NAME` to the Aiven values from step 2, and
   set `DB_SSL=true`. Then, from the `backend/` folder:

   ```bash
   node scripts/repair-schema.js
   node scripts/repair-auth-security-schema.js
   node scripts/repair-content-moderation-schema.js
   node scripts/repair-login-email-otp-schema.js
   node scripts/repair-two-factor-method-schema.js
   node scripts/repair-trusted-devices-schema.js
   node scripts/repair-review-generalization-schema.js
   ```

   Afterward, **revert `backend/.env`** back to your local MySQL values so
   local development keeps working against your local database.

5. Create your first admin account directly on Aiven while `backend/.env`
   is still pointed at it (or re-point it briefly again):

   ```bash
   node scripts/create-admin.js create "Your Name" you@ump.ac.za "a-strong-password"
   ```

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
   | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | leave blank to run in dev mode (emails log to Render's console instead of sending) unless you already have SMTP creds set up |
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

## About the payment step

There's no real payment gateway wired up (Stripe, PayFast, etc. all need a
registered business/merchant account, which the project doesn't have yet).
So "Accept Task" now shows a clearly labeled **demo payment simulation**
step instead of silently marking payment as held — it tells the user
plainly that no real money moves, then proceeds with the existing
held/released escrow-status logic in the database. This is a placeholder
for a real integration once/if the university registers and funds the
project — swapping in a real gateway later means replacing the contents of
`openPaymentSimulationModal()` in `frontend/js/task-details.js` with an
actual checkout flow, without needing to change the accept/confirm-
completion backend logic it currently calls.

---

## Known limitations of this free setup

- **Render free web services sleep after 15 minutes of no traffic.** The
  first request after that takes 30–60 seconds to wake back up — normal
  and expected, not a bug. There's no free way around this; Render's paid
  tier ($7/mo) removes it if that's ever worth paying for.
- **Aiven's free MySQL tier caps out at 1GB storage and 76 connections** —
  plenty for coursework/demo traffic, not for real production load.
- **No custom domain is required** for Google indexing or public access —
  the `*.onrender.com` URLs work fine for both — but a custom domain (e.g.
  from a university or a cheap registrar) can be added later in Render's
  dashboard under each service's "Custom Domains" tab if wanted.
- **Emails run in dev mode** (logged, not sent) until real SMTP
  credentials are added — registration/verification/password-reset emails
  won't actually arrive in anyone's inbox until then. See
  `EMAIL_SETUP.md`.
