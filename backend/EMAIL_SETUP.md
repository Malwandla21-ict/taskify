# Email setup

Taskify sends real emails (registration codes, password resets, 2FA codes,
security notices) through [Brevo](https://www.brevo.com) — free for up to
300 emails/day, no card required. If nothing below is configured, emails
are printed to the console instead of sent, so every flow is still fully
testable without setting anything up first.

There are two ways Taskify can send through Brevo, and **which one you
need depends on where the backend is running**:

| Where it runs | Use | Why |
|---|---|---|
| Your own machine (local dev) | `SMTP_HOST` + friends, **or** `BREVO_API_KEY` | Either works — your home network doesn't block SMTP ports. |
| Render free web service | `BREVO_API_KEY` **only** | Render blocks outbound traffic on SMTP ports 25/465/587 for every free-tier web service (as of September 2025, to prevent spam abuse). Plain SMTP will hang and then time out no matter how correct `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` are — it's blocked at the network level, not a configuration problem. See [Render's changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports). |
| A paid Render plan, or most other hosts | Either | Only Render's *free* tier has this restriction. |

`backend/src/services/mailer.service.js` checks `BREVO_API_KEY` first; if
it's set, everything goes through Brevo's HTTPS API instead of SMTP. Set
`BREVO_API_KEY` and you can leave the `SMTP_*` variables blank — they're
simply unused whenever the API key is present.

## One-time Brevo account setup

1. Sign up free at [brevo.com](https://www.brevo.com) (no card needed).
2. Go to **Settings** (bottom-left) → **SMTP & API**.
3. You'll see two separate tabs/sections here — this is the part people
   usually mix up:
   - **SMTP** tab: gives you `SMTP_HOST` (`smtp-relay.brevo.com`),
     `SMTP_USER`, and an SMTP key for `SMTP_PASS`. Use this set for local
     dev if you'd rather use SMTP there.
   - **API Keys** tab: click **Generate a new API key**, name it anything
     (e.g. "Taskify"), copy the value shown. This is `BREVO_API_KEY` — a
     completely different credential from the SMTP one above, even though
     they come from the same account.
4. (Optional but recommended) Under **Senders, Domains & Dedicated IPs** →
   **Senders**, add and verify the address you'll use as `EMAIL_FROM`
   (e.g. `no-reply@yourdomain.com`) so it isn't flagged as an unverified
   sender. If you don't have a custom domain, Brevo's default sender
   address still works for testing.

## Configuring it

**Local dev** (`backend/.env`): set either `BREVO_API_KEY`, or the
`SMTP_*` block — see `.env.example` for the full variable list and format.

**Render**: set `BREVO_API_KEY` as an environment variable on the
`taskify-backend` service (Dashboard → Environment → Add Environment
Variable). Leave `SMTP_*` blank there — they won't be used and won't work
anyway on the free tier.

## Verifying it works

Trigger any of the emailed flows (register a new account, request a
password reset, or request an email-based 2FA code) and check the inbox
of the address you used. If nothing arrives:

- Check the backend's logs (Render: the **Logs** tab; local: your
  terminal) for a line like `Failed to send verification email: ...` or
  `Brevo API responded 401: ...` — the error text says exactly what went
  wrong (bad key, unverified sender, etc.).
- A `Connection timeout` error when `SMTP_HOST` is set and running on
  Render specifically means you're hitting the port block above — switch
  to `BREVO_API_KEY`, not a sign your credentials are wrong.
