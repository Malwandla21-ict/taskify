const path = require("path");
const dotenv = require("dotenv");
const { spawnSync } = require("child_process");

/* The project-root .env — the one import-schema.js and create-admin.js
   read, and the one DEPLOYMENT.md says to point at the database you're
   setting up. Loading it here, before any script runs, means all of them
   aim at the same database, even the few that look for backend/.env. */
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Runs every repair-*.js script, one after another, in the order the
  features were added. Each script is idempotent ("safe to run any number
  of times"): it checks what's already there and only adds what's missing,
  so running this against an up-to-date database changes nothing.

  Use it to bring a fresh or older database up to date in one go:

    node scripts/repair-all.js

  It stops at the first script that fails, so a later script never runs
  against a half-repaired database. Fix the problem, then run it again —
  the scripts that already finished will just report "nothing to do".

  The database comes from the project-root .env. To aim at a different database
  (for example the practice one), set DB_* in the environment first;
  dotenv never overrides variables that are already set.

  When you add a new repair script, add it to the END of this list.
*/

const SCRIPTS = [
  "repair-schema.js",
  "repair-messaging-schema.js",
  "repair-academic-fields.js",
  "repair-marketplace-schema.js",
  "repair-lecturer-endorsements-schema.js",
  "repair-endorsement-context-types.js",
  "repair-auth-security-schema.js",
  "repair-content-moderation-schema.js",
  "repair-login-email-otp-schema.js",
  "repair-trusted-devices-schema.js",
  "repair-two-factor-method-schema.js",
  "repair-review-generalization-schema.js",
  "repair-onboarding-schema.js",
  "repair-push-subscriptions-schema.js",
  "repair-moderation-review-schema.js",
  "repair-payment-simulation-schema.js",
  "repair-negotiation-schema.js",
  "repair-message-read-tracking-schema.js",
  "repair-event-food-schema.js",
  "repair-report-categories-schema.js",
  "repair-equipment-condition-schema.js",
  "repair-listing-categories-schema.js",
  "repair-lecturer-verification-schema.js",
  "repair-task-disputes-schema.js",
  "repair-sale-disputes-schema.js",
  "repair-rental-lifecycle-schema.js",
  "repair-marketplace-authority-schema.js",
  "repair-feedback-schema.js",
  "repair-rental-wait-schema.js",
  "repair-sale-quantity-schema.js",
  "repair-ump-faculties.js",
  "repair-acknowledgements-schema.js",
  "repair-rental-protection-schema.js"
];

function main() {
  console.log(`Target database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);
  console.log(`Running ${SCRIPTS.length} repair scripts in order.\n`);
  for (const [i, name] of SCRIPTS.entries()) {
    console.log(`── ${i + 1}/${SCRIPTS.length}  ${name}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, name)], {
      stdio: "inherit",
      env: process.env
    });
    if (result.status !== 0) {
      console.error(`\nStopped: ${name} failed (exit code ${result.status}). Nothing after it was run.`);
      process.exitCode = 1;
      return;
    }
    console.log("");
  }
  console.log("All repair scripts finished. The database schema is up to date.");
}

main();
