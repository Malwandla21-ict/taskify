const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  Idempotent schema repair for task disputes and review reminders (see
  task.service.js disputeTask / resolveTaskDispute and jobs/scheduler.js).
  Safe to run any number of times — every change is guarded first.
  Existing tasks keep their status; the new 'Disputed' value is only added.

  Run this BEFORE deploying the backend code that uses these columns.

  Usage: node scripts/repair-task-disputes-schema.js
*/

const TASK_STATUSES = "'Posted','Accepted','In Progress','Awaiting Confirmation','Disputed','Completed','Cancelled'";

const COLUMNS = [
  ["awaiting_confirmation_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["review_reminder_sent_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["review_escalated_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["disputed_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["dispute_reason", "VARCHAR(500) NULL DEFAULT NULL"],
  ["dispute_outcome", "ENUM('released','refunded','rework','poster_confirmed') NULL DEFAULT NULL"],
  ["dispute_resolved_at", "TIMESTAMP NULL DEFAULT NULL"]
];

async function columnInfo(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT column_type AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0] || null;
}

async function main() {
  console.log(`Target database: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

  /* Same opt-in TLS as src/config/db.js — hosted MySQL (Aiven) needs it. */
  const ssl = process.env.DB_SSL === "true"
    ? { rejectUnauthorized: !!process.env.DB_SSL_CA, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) }
    : undefined;

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(ssl ? { ssl } : {})
  });

  try {
    const status = await columnInfo(pool, "tasks", "status");
    if (status && !status.type.includes("'Disputed'")) {
      await pool.execute(`ALTER TABLE tasks MODIFY COLUMN status ENUM(${TASK_STATUSES}) NOT NULL DEFAULT 'Posted'`);
      console.log("tasks.status now includes 'Disputed'.");
    } else {
      console.log("tasks.status already includes 'Disputed' — skipping.");
    }

    let addedAwaiting = false;
    for (const [column, definition] of COLUMNS) {
      if (!(await columnInfo(pool, "tasks", column))) {
        await pool.execute(`ALTER TABLE tasks ADD COLUMN ${column} ${definition}`);
        console.log(`Added tasks.${column}`);
        if (column === "awaiting_confirmation_at") addedAwaiting = true;
      } else {
        console.log(`tasks.${column} already present — skipping.`);
      }
    }

    if (addedAwaiting) {
      /* Tasks already waiting for confirmation start their review clock from
         their last update, so reminders don't fire for them straight away
         with no warning. */
      const [result] = await pool.execute(
        `UPDATE tasks SET awaiting_confirmation_at = updated_at
         WHERE status = 'Awaiting Confirmation' AND awaiting_confirmation_at IS NULL`
      );
      console.log(`Started the review clock for ${result.affectedRows} task(s) already awaiting confirmation.`);
    }

    console.log("Task disputes schema repair complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
