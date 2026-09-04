/*
  Fail-fast startup checks. Import this before anything else touches
  process.env (server.js does, first line after dotenv.config()).

  Without this, a missing/placeholder JWT_SECRET or missing DB creds would
  surface as a confusing runtime error on the first request (or, worse,
  jsonwebtoken silently signing with `undefined`) instead of a clear
  message the moment the process starts.
*/

const REQUIRED_VARS = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_NAME"];

const KNOWN_PLACEHOLDER_SECRETS = [
  "super_secure_taskify_secret_change_this",
  "changeme",
  "secret",
  "your_jwt_secret_here"
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key] || !String(process.env[key]).trim());

  if (missing.length) {
    console.error(
      `\nFATAL: missing required environment variable(s): ${missing.join(", ")}.\n` +
      `Check backend/.env against .env.example and try again.\n`
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.error(
      "\nFATAL: JWT_SECRET is too short (< 32 characters). " +
      "Generate a strong one, e.g.:\n  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n"
    );
    process.exit(1);
  }

  if (KNOWN_PLACEHOLDER_SECRETS.includes(process.env.JWT_SECRET.toLowerCase())) {
    console.error("\nFATAL: JWT_SECRET is still a placeholder value. Replace it with a real random secret.\n");
    process.exit(1);
  }

  if (process.env.TOTP_ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(process.env.TOTP_ENCRYPTION_KEY)) {
    console.error(
      "\nFATAL: TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes), e.g.:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n"
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && (!process.env.CLIENT_URL || process.env.CLIENT_URL === "*")) {
    console.warn(
      "\nWARNING: CLIENT_URL is unset or '*' in production — CORS will accept requests from any " +
      "origin. Set CLIENT_URL to your real frontend URL before going live.\n"
    );
  }

  if (!process.env.SMTP_HOST) {
    console.warn(
      "\nWARNING: SMTP_HOST is not set — verification/reset emails will be logged to the console " +
      "instead of sent. Fine for local dev, not for real users. See EMAIL_SETUP.md.\n"
    );
  }
}

module.exports = { validateEnv };
