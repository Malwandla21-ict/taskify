const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/*
  One-off cleanup: permanently removes a specific, explicit list of test
  accounts and everything they created, so the database can be repopulated
  with real users. This is NOT a general-purpose "delete account" feature —
  Taskify deliberately has no such thing (see admin.service.js's comment on
  suspend vs. delete) — this script exists only to undo mock/test data from
  development, one time.

  SAFETY MODEL:
  - Only ever touches the exact emails listed in TEST_ACCOUNT_EMAILS below.
    No pattern matching, no heuristics. Add/remove emails there directly.
  - Runs as a DRY RUN by default: it performs every query and every write
    inside a transaction, prints a full report of what would happen —
    including anything that touches a REAL (non-listed) user — and then
    ROLLS BACK. Nothing is committed.
  - Only commits when you re-run it with --confirm, after reading the
    dry-run report.
  - Where a test account's action is entangled with a real user (e.g. a
    real user's task was accepted by a mock account, or a real student was
    endorsed by a mock lecturer), the report is marked with a ⚠ so it's
    impossible to miss. Real users' own data is reset/preserved wherever
    that's possible (e.g. a real user's task is reopened, not deleted) —
    only test accounts' own rows are ever deleted outright.

  Usage:
    node scripts/delete-test-accounts.js              # dry run, prints report, changes nothing
    node scripts/delete-test-accounts.js --confirm     # applies the changes for real
*/

const TEST_ACCOUNT_EMAILS = [
  "test@student.ump.ac.za",
  "admin@ump.ac.za",
  "test3@student.ump.ac.za",
  "test2@student.ump.ac.za"
];

const CONFIRM = process.argv.includes("--confirm");

function log(line = "") {
  console.log(line);
}

function section(title) {
  log("");
  log(`── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const normalizedEmails = TEST_ACCOUNT_EMAILS.map(e => e.trim().toLowerCase());
  const connection = await pool.getConnection();
  const report = [];
  let hadRealUserImpact = false;

  try {
    await connection.beginTransaction();

    // ── 1. Resolve + validate the explicit list ──────────────────────────
    const [testUsers] = await connection.query(
      `SELECT id, email, full_name, role, member_type FROM users WHERE LOWER(email) IN (?)`,
      [normalizedEmails]
    );

    const foundEmails = new Set(testUsers.map(u => u.email.toLowerCase()));
    const missing = normalizedEmails.filter(e => !foundEmails.has(e));
    if (missing.length > 0) {
      throw new Error(
        `These emails were not found in the database (check for typos before proceeding): ${missing.join(", ")}`
      );
    }

    const testIds = testUsers.map(u => u.id);

    section("Accounts targeted for deletion");
    for (const u of testUsers) {
      log(`  #${u.id}  ${u.email}  (role: ${u.role}, member_type: ${u.member_type || "n/a"})  — ${u.full_name}`);
    }

    // ── 2. Tasks created by test accounts ─────────────────────────────────
    const [testCreatedTasks] = await connection.query(
      `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE created_by IN (?)`,
      [testIds]
    );
    const testCreatedTaskIds = testCreatedTasks.map(t => t.id);

    // ── 3. Tasks accepted by a test account, but created by a real user ──
    const [acceptedByTestRealCreator] = await connection.query(
      `SELECT id, title, created_by, accepted_by, status FROM tasks WHERE accepted_by IN (?) AND created_by NOT IN (?)`,
      [testIds, testIds]
    );
    const acceptedByTestRealCreatorIds = acceptedByTestRealCreator.map(t => t.id);

    section("Tasks");
    for (const t of testCreatedTasks) {
      const acceptedByReal = t.accepted_by && !testIds.includes(t.accepted_by);
      log(`  DELETE task #${t.id} "${t.title}" (created by test account, status: ${t.status})`);
      if (acceptedByReal) {
        hadRealUserImpact = true;
        log(`    ⚠ REAL USER AFFECTED: this task was accepted by real user #${t.accepted_by} — their acceptance record will be gone.`);
      }
    }
    for (const t of acceptedByTestRealCreator) {
      hadRealUserImpact = true;
      log(`  RESET task #${t.id} "${t.title}" — created by real user #${t.created_by}, accepted by a test account.`);
      log(`    ⚠ REAL USER AFFECTED: will be reopened (accepted_by cleared, status back to 'Posted'), matching the existing withdraw-from-task behavior.`);
    }

    // ── 4. Reviews touching test accounts, or attached to a test-created task ─
    const [reviewsToDelete] = await connection.query(
      `SELECT id, task_id, reviewer_id, reviewee_id, rating FROM reviews
       WHERE reviewer_id IN (?) OR reviewee_id IN (?) OR task_id IN (?)`,
      [testIds, testIds, testCreatedTaskIds.length ? testCreatedTaskIds : [0]]
    );
    const realRevieweesToRecompute = new Set();
    section("Reviews");
    if (reviewsToDelete.length === 0) log("  (none)");
    for (const r of reviewsToDelete) {
      log(`  DELETE review #${r.id} (task #${r.task_id}, reviewer #${r.reviewer_id} -> reviewee #${r.reviewee_id}, rating ${r.rating})`);
      if (!testIds.includes(r.reviewee_id)) {
        hadRealUserImpact = true;
        realRevieweesToRecompute.add(r.reviewee_id);
        log(`    ⚠ REAL USER AFFECTED: real user #${r.reviewee_id}'s rating average will be recalculated without this review.`);
      }
    }

    // ── 5. Equipment owned by test accounts ───────────────────────────────
    const [testEquipment] = await connection.query(
      `SELECT id, name, owner_id FROM equipment WHERE owner_id IN (?)`,
      [testIds]
    );
    const testEquipmentIds = testEquipment.map(e => e.id);

    // Bookings by a test renter on equipment owned by a REAL user
    const [testRenterOnRealEquipment] = await connection.query(
      `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status, e.owner_id, e.name
       FROM equipment_bookings eb INNER JOIN equipment e ON eb.equipment_id = e.id
       WHERE eb.renter_id IN (?) AND e.owner_id NOT IN (?)`,
      [testIds, testIds]
    );
    // Any booking (by anyone) on equipment owned by a test account — goes away with the equipment
    const [bookingsOnTestEquipment] = testEquipmentIds.length
      ? await connection.query(`SELECT id, equipment_id, renter_id, status FROM equipment_bookings WHERE equipment_id IN (?)`, [testEquipmentIds])
      : [[]];

    section("Equipment & bookings");
    if (testEquipment.length === 0 && testRenterOnRealEquipment.length === 0) log("  (none)");
    for (const e of testEquipment) {
      log(`  DELETE equipment #${e.id} "${e.name}" (owned by test account)`);
    }
    for (const b of bookingsOnTestEquipment) {
      const renterIsReal = !testIds.includes(b.renter_id);
      log(`  DELETE booking #${b.id} on test-owned equipment #${b.equipment_id} (status: ${b.status})`);
      if (renterIsReal) {
        hadRealUserImpact = true;
        log(`    ⚠ REAL USER AFFECTED: real user #${b.renter_id} had a ${b.status} booking on this equipment.`);
      }
    }
    for (const b of testRenterOnRealEquipment) {
      hadRealUserImpact = true;
      log(`  DELETE booking #${b.id} — test account rented real user #${b.owner_id}'s "${b.name}" (status: ${b.status})`);
      if (["Pending", "Confirmed"].includes(b.status)) {
        log(`    ⚠ REAL USER AFFECTED: equipment #${b.equipment_id} will be marked available again.`);
      }
    }

    // ── 6. Events organized by test accounts ──────────────────────────────
    const [testEvents] = await connection.query(
      `SELECT id, title, organizer_id FROM events WHERE organizer_id IN (?)`,
      [testIds]
    );
    const testEventIds = testEvents.map(e => e.id);

    const [testUserOnRealEventRsvps] = await connection.query(
      `SELECT er.event_id, er.user_id, e.organizer_id, e.title
       FROM event_rsvps er INNER JOIN events e ON er.event_id = e.id
       WHERE er.user_id IN (?) AND e.organizer_id NOT IN (?)`,
      [testIds, testIds]
    );

    section("Events & RSVPs");
    if (testEvents.length === 0 && testUserOnRealEventRsvps.length === 0) log("  (none)");
    for (const e of testEvents) {
      log(`  DELETE event #${e.id} "${e.title}" (organized by test account)`);
    }
    for (const r of testUserOnRealEventRsvps) {
      log(`  DELETE RSVP — test account RSVP'd to real user #${r.organizer_id}'s event "${r.title}"`);
    }

    // ── 7. Sales items ─────────────────────────────────────────────────────
    const [testSalesItems] = await connection.query(
      `SELECT id, title, seller_id FROM sales_items WHERE seller_id IN (?)`,
      [testIds]
    );
    section("Sales items");
    if (testSalesItems.length === 0) log("  (none)");
    for (const s of testSalesItems) {
      log(`  DELETE sales item #${s.id} "${s.title}" (listed by test account)`);
    }

    // ── 8. Conversations / messages / reports ─────────────────────────────
    const [testConversations] = await connection.query(
      `SELECT id, user_a_id, user_b_id FROM conversations WHERE user_a_id IN (?) OR user_b_id IN (?)`,
      [testIds, testIds]
    );
    const testConversationIds = testConversations.map(c => c.id);
    const [messagesInThoseConvos] = testConversationIds.length
      ? await connection.query(`SELECT id, conversation_id FROM messages WHERE conversation_id IN (?)`, [testConversationIds])
      : [[]];
    const doomedMessageIds = messagesInThoseConvos.map(m => m.id);

    const [reportsToDelete] = await connection.query(
      `SELECT id, reporter_id, reported_user_id, message_id FROM reports
       WHERE reporter_id IN (?) OR reported_user_id IN (?) OR message_id IN (?)`,
      [testIds, testIds, doomedMessageIds.length ? doomedMessageIds : [0]]
    );

    section("Conversations, messages & reports");
    if (testConversations.length === 0 && reportsToDelete.length === 0) log("  (none)");
    for (const c of testConversations) {
      const otherId = testIds.includes(c.user_a_id) ? c.user_b_id : c.user_a_id;
      const otherIsReal = !testIds.includes(otherId);
      const msgCount = messagesInThoseConvos.filter(m => m.conversation_id === c.id).length;
      log(`  DELETE conversation #${c.id} (${msgCount} message${msgCount === 1 ? "" : "s"})`);
      if (otherIsReal) {
        hadRealUserImpact = true;
        log(`    ⚠ REAL USER AFFECTED: real user #${otherId}'s side of this conversation will be gone too.`);
      }
    }
    for (const r of reportsToDelete) {
      const reporterReal = !testIds.includes(r.reporter_id);
      const reportedReal = !testIds.includes(r.reported_user_id);
      log(`  DELETE report #${r.id} (reporter #${r.reporter_id}, reported #${r.reported_user_id})`);
      if (reporterReal || reportedReal) {
        hadRealUserImpact = true;
        log(`    ⚠ REAL USER AFFECTED: this report involved a real account.`);
      }
    }

    // ── 9. Lecturer endorsements ───────────────────────────────────────────
    const [endorsementsToDelete] = await connection.query(
      `SELECT id, lecturer_id, endorsed_user_id, endorsement_type FROM lecturer_endorsements
       WHERE lecturer_id IN (?) OR endorsed_user_id IN (?)`,
      [testIds, testIds]
    );
    section("Lecturer endorsements");
    if (endorsementsToDelete.length === 0) log("  (none)");
    for (const e of endorsementsToDelete) {
      log(`  DELETE endorsement #${e.id} (${e.endorsement_type}) — lecturer #${e.lecturer_id} -> student #${e.endorsed_user_id}`);
      const lecturerIsTest = testIds.includes(e.lecturer_id);
      const studentIsReal = !testIds.includes(e.endorsed_user_id);
      if (lecturerIsTest && studentIsReal) {
        hadRealUserImpact = true;
        log(`    ⚠ REAL USER AFFECTED: this removes a mock lecturer's endorsement currently showing on real student #${e.endorsed_user_id}'s profile.`);
      }
    }

    // ── 10. Admin allowlist ────────────────────────────────────────────────
    const [allowlistByEmail] = await connection.query(
      `SELECT id, email FROM admin_allowlist WHERE LOWER(email) IN (?)`,
      [normalizedEmails]
    );
    const [allowlistAddedByTest] = await connection.query(
      `SELECT id, email FROM admin_allowlist WHERE added_by IN (?)`,
      [testIds]
    );
    section("Admin allowlist");
    if (allowlistByEmail.length === 0 && allowlistAddedByTest.length === 0) log("  (none)");
    for (const a of allowlistByEmail) {
      log(`  DELETE allowlist entry #${a.id} (${a.email}) — removes admin eligibility for this email`);
    }
    for (const a of allowlistAddedByTest) {
      log(`  CLEAR added_by on allowlist entry #${a.id} (${a.email}) — was added by a test admin account`);
    }

    // ── 11. Notifications ───────────────────────────────────────────────────
    const [notificationCountRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id IN (?)`,
      [testIds]
    );
    section("Notifications");
    log(`  DELETE ${notificationCountRows[0].count} notification(s) belonging to test accounts`);

    // ═══════════════════════════════════════════════════════════════════════
    // Apply the changes (still inside the transaction — rolled back below
    // unless --confirm was passed)
    // ═══════════════════════════════════════════════════════════════════════

    if (testCreatedTaskIds.length) {
      await connection.query(`DELETE FROM payments WHERE task_id IN (?)`, [testCreatedTaskIds]);
    }
    if (acceptedByTestRealCreatorIds.length) {
      await connection.query(`UPDATE payments SET status = 'Cancelled' WHERE task_id IN (?)`, [acceptedByTestRealCreatorIds]);
    }

    if (reviewsToDelete.length) {
      await connection.query(`DELETE FROM reviews WHERE id IN (?)`, [reviewsToDelete.map(r => r.id)]);
    }

    const allBookingIdsToDelete = [
      ...testRenterOnRealEquipment.map(b => b.id),
      ...bookingsOnTestEquipment.map(b => b.id)
    ];
    if (allBookingIdsToDelete.length) {
      await connection.query(`DELETE FROM equipment_bookings WHERE id IN (?)`, [allBookingIdsToDelete]);
    }
    const equipmentToReopen = testRenterOnRealEquipment
      .filter(b => ["Pending", "Confirmed"].includes(b.status))
      .map(b => b.equipment_id);
    if (equipmentToReopen.length) {
      await connection.query(`UPDATE equipment SET is_available = 1 WHERE id IN (?)`, [equipmentToReopen]);
    }
    if (testEquipmentIds.length) {
      await connection.query(`DELETE FROM equipment WHERE id IN (?)`, [testEquipmentIds]);
    }

    const rsvpDeletePairs = testUserOnRealEventRsvps.map(r => r.event_id);
    if (rsvpDeletePairs.length) {
      await connection.query(`DELETE FROM event_rsvps WHERE user_id IN (?) AND event_id IN (?)`, [testIds, rsvpDeletePairs]);
    }
    if (testEventIds.length) {
      await connection.query(`DELETE FROM event_rsvps WHERE event_id IN (?)`, [testEventIds]);
      await connection.query(`DELETE FROM events WHERE id IN (?)`, [testEventIds]);
    }
    // A test user's own RSVPs on any remaining (real) event not already covered above
    await connection.query(`DELETE FROM event_rsvps WHERE user_id IN (?)`, [testIds]);

    if (testSalesItems.length) {
      await connection.query(`DELETE FROM sales_items WHERE id IN (?)`, [testSalesItems.map(s => s.id)]);
    }

    if (reportsToDelete.length) {
      await connection.query(`DELETE FROM reports WHERE id IN (?)`, [reportsToDelete.map(r => r.id)]);
    }
    if (doomedMessageIds.length) {
      await connection.query(`DELETE FROM messages WHERE id IN (?)`, [doomedMessageIds]);
    }
    if (testConversationIds.length) {
      await connection.query(`DELETE FROM conversations WHERE id IN (?)`, [testConversationIds]);
    }

    if (endorsementsToDelete.length) {
      await connection.query(`DELETE FROM lecturer_endorsements WHERE id IN (?)`, [endorsementsToDelete.map(e => e.id)]);
    }

    await connection.query(`DELETE FROM notifications WHERE user_id IN (?)`, [testIds]);

    if (allowlistByEmail.length) {
      await connection.query(`DELETE FROM admin_allowlist WHERE LOWER(email) IN (?)`, [normalizedEmails]);
    }
    await connection.query(`UPDATE admin_allowlist SET added_by = NULL WHERE added_by IN (?)`, [testIds]);

    if (testCreatedTaskIds.length) {
      await connection.query(`DELETE FROM tasks WHERE id IN (?)`, [testCreatedTaskIds]);
    }
    if (acceptedByTestRealCreatorIds.length) {
      await connection.query(
        `UPDATE tasks SET accepted_by = NULL, status = 'Posted' WHERE id IN (?)`,
        [acceptedByTestRealCreatorIds]
      );
    }

    section("Rating recalculation");
    if (realRevieweesToRecompute.size === 0) log("  (none)");
    for (const userId of realRevieweesToRecompute) {
      const [statsRows] = await connection.query(
        `SELECT COALESCE(AVG(rating), 0) AS rating_average, COUNT(*) AS total_reviews FROM reviews WHERE reviewee_id = ?`,
        [userId]
      );
      const stats = statsRows[0];
      await connection.query(
        `UPDATE users SET rating_average = ?, total_reviews = ? WHERE id = ?`,
        [Number(stats.rating_average), Number(stats.total_reviews), userId]
      );
      log(`  Recomputed real user #${userId}: rating_average=${Number(stats.rating_average).toFixed(2)}, total_reviews=${stats.total_reviews}`);
    }

    // ── Finally, the accounts themselves ────────────────────────────────
    // security_events.user_id -> SET NULL, trusted_devices.user_id -> CASCADE,
    // admin_audit_logs.admin_id -> CASCADE are all handled by the DB itself.
    await connection.query(`DELETE FROM users WHERE id IN (?)`, [testIds]);

    section("Summary");
    log(`  ${testUsers.length} account(s) removed: ${testUsers.map(u => u.email).join(", ")}`);
    if (hadRealUserImpact) {
      log(`  ⚠ One or more real accounts were affected as noted above (reset, not deleted, wherever possible).`);
    } else {
      log(`  No real accounts were touched — everything removed belonged solely to the test accounts.`);
    }

    if (CONFIRM) {
      await connection.commit();
      log("");
      log("✅ Changes committed.");
    } else {
      await connection.rollback();
      log("");
      log("🔎 DRY RUN — no changes were committed. Review the report above, then re-run with --confirm to apply it for real:");
      log("     node scripts/delete-test-accounts.js --confirm");
    }
  } catch (error) {
    await connection.rollback();
    console.error("");
    console.error("❌ Aborted, nothing was changed:", error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
