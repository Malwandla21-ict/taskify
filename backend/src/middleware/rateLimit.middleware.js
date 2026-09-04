const rateLimit = require("express-rate-limit");

/*
  IP-based rate limiting. This is defense-in-depth alongside the
  per-account lockout in auth.service.js (lockout stops someone hammering
  ONE account; this stops someone hammering the endpoint itself — e.g.
  spraying many different emails/passwords, or spamming the mailer).

  standardHeaders/legacyHeaders left on so well-behaved clients can see
  RateLimit-* headers; message is JSON to match the rest of the API's
  { success, message } shape instead of express-rate-limit's default text.
*/

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, message });
    }
  });
}

/* Login: generous enough for a real typo or two, tight enough to make
   credential-stuffing sweeps expensive. */
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts from this device. Please wait 15 minutes and try again."
});

/* Registration abuse (bulk fake-account creation) is slower to matter but
   still worth capping. */
const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Too many accounts created from this device recently. Please try again later."
});

/* Forgot-password / resend-verification: both send email, so this also
   protects the mailer (and a stranger's inbox) from being spammed by
   someone hammering the endpoint with an email address that isn't theirs. */
const emailActionLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many requests. Please wait a few minutes and try again."
});

/* 2FA code verification (login step + enable/disable): a 6-digit TOTP code
   has 1,000,000 possibilities — without a limiter here that's brute-forceable
   within the 30s validity window at high enough request rates. */
const twoFactorLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: "Too many verification attempts. Please wait a few minutes and try again."
});

/* Loose, app-wide safety net against generic abuse/scraping — the specific
   limiters above are the ones that actually matter for auth security. */
const apiLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: "Too many requests from this device. Please slow down and try again shortly."
});

module.exports = { loginLimiter, registerLimiter, emailActionLimiter, twoFactorLimiter, apiLimiter };
