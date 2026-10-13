/*
  TEMPORARY presentation data: ~45 fictional UMP people with tasks, sales,
  rentals, Campus Marketplace listings, applications, reviews and chats
  spread over the last couple of months, so Taskify looks lived-in.

  Every demo account's email ends in DEMO_DOMAIN (a reserved ".invalid"
  domain — mail to it can never reach a real person), and --remove deletes
  exactly those accounts and everything attached to them, including
  anything real users did on demo listings during the presentation.

  The data is written straight to the database (no emails, push or admin
  notifications), with every background-job reminder already marked as
  sent, so the live server's scheduler never emails or pings anyone about
  it. Dates are relative to the moment you run it — re-seed shortly before
  presenting (--remove, then seed again).

  Usage (from backend/):
    node scripts/seed-demo-data.js                     # seed the LOCAL practice database (.env.test)
    node scripts/seed-demo-data.js --remove            # remove it from the local database
    node scripts/seed-demo-data.js --live              # seed the LIVE database (root .env)
    node scripts/seed-demo-data.js --live --remove     # remove it from live
    node scripts/seed-demo-data.js [--live] --images   # re-apply content.js photos to what's there

  The shared sign-in password for the demo accounts is written to
  scripts/demo-data/logins.txt (git-ignored). Pass --password=... to choose it.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

const LIVE = process.argv.includes("--live");
const REMOVE = process.argv.includes("--remove");
const DEMO_DOMAIN = "taskify-demo.invalid";

const envFile = LIVE ? path.join(__dirname, "..", "..", ".env") : path.join(__dirname, "..", ".env.test");
if (!fs.existsSync(envFile)) throw new Error(`${envFile} not found.`);
Object.assign(process.env, dotenv.parse(fs.readFileSync(envFile)));
if (!LIVE && (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST) || !/_(local|test)$/.test(process.env.DB_NAME || ""))) {
  throw new Error(`Refusing: ${process.env.DB_NAME} on ${process.env.DB_HOST} isn't a local practice database. Use --live on purpose.`);
}

const bcrypt = require("bcrypt");
const pool = require("../src/config/db");
const { ACKNOWLEDGEMENTS } = require("../src/config/acknowledgements");
const { currentTerms } = require("../src/services/rentalPolicy.service");
const { RENTAL_PROTECTION_FEE, SALES, NEGOTIATION } = require("../src/config/paymentSettings");
const C = require("./demo-data/content");

/* ───────────────────────── helpers ───────────────────────── */

/* Seeded random numbers, so every run produces the same story. */
let seed = 20261012;
function rand() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const money = (v) => Math.round(Number(v) * 100) / 100;

const NOW = Date.now();
const HOUR = 3600000;
const DAY = 24 * HOUR;
/* A moment `days` ago at a daytime hour (08:00–19:59 SAST), never in the future. */
function ago(days, { minHour = 8, maxHour = 19 } = {}) {
  const d = new Date(NOW - days * DAY);
  d.setUTCHours(between(minHour, maxHour) - 2, between(0, 59), between(0, 59), 0);
  return d.getTime() > NOW ? new Date(NOW - between(10, 90) * 60000) : d;
}
const after = (date, hours) => new Date(Math.min(NOW, date.getTime() + hours * HOUR));
/* "YYYY-MM-DD" in South African time, `offset` days from today. */
function sastDay(offset) {
  return new Date(NOW + 2 * HOUR + offset * DAY).toISOString().slice(0, 10);
}
/* A moment on a SAST calendar day at hh:mm SAST. */
const sastAt = (day, hh, mm = 0) => new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+02:00`);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY) + 1;

const photos = (title) => JSON.stringify(C.IMAGES[title] ? [C.IMAGES[title]] : []);
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

async function insert(conn, table, row) {
  const cols = Object.keys(row);
  const [result] = await conn.query(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((c) => row[c])
  );
  return result.insertId;
}

/* ───────────────────────── remove ───────────────────────── */

async function removeDemoData() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query(`SELECT id FROM users WHERE email LIKE ?`, [`%@${DEMO_DOMAIN}`]);
    const ids = users.map((u) => u.id);
    if (!ids.length) { console.log("No demo data found — nothing to remove."); await conn.rollback(); return; }

    const list = (rows) => rows.map((r) => r.id);
    const tasks = list((await conn.query(`SELECT id FROM tasks WHERE created_by IN (?)`, [ids]))[0]);
    const items = list((await conn.query(`SELECT id FROM sales_items WHERE seller_id IN (?)`, [ids]))[0]);
    const equipment = list((await conn.query(`SELECT id FROM equipment WHERE owner_id IN (?)`, [ids]))[0]);
    const events = list((await conn.query(`SELECT id FROM events WHERE organizer_id IN (?)`, [ids]))[0]);
    const bookings = list((await conn.query(
      `SELECT id FROM equipment_bookings WHERE renter_id IN (?) OR equipment_id IN (?)`, [ids, equipment.length ? equipment : [0]]
    ))[0]);
    const none = (a) => (a.length ? a : [0]);

    /* Real people whose rating includes a demo review — recalculated after. */
    const [touched] = await conn.query(
      `SELECT DISTINCT reviewee_id AS id FROM reviews
       WHERE reviewee_id NOT IN (?) AND (reviewer_id IN (?) OR task_id IN (?) OR booking_id IN (?))`,
      [ids, ids, none(tasks), none(bookings)]
    );

    const del = async (sql, params) => (await conn.query(sql, params))[0].affectedRows;
    const counts = {};
    /* Fund fees from demo rentals would otherwise stay in the fund's balance. */
    counts.fundEntries = await del(`DELETE FROM protection_fund_entries WHERE booking_id IN (?) OR owner_id IN (?)`, [none(bookings), ids]);
    counts.notifications = await del(
      `DELETE FROM notifications WHERE user_id IN (?)
         OR (context_type = 'task' AND context_id IN (?)) OR (context_type = 'sales_item' AND context_id IN (?))
         OR (context_type = 'equipment_booking' AND context_id IN (?)) OR (context_type = 'event' AND context_id IN (?))`,
      [ids, none(tasks), none(items), none(bookings), none(events)]
    );
    counts.offers = await del(
      `DELETE FROM offers WHERE offerer_id IN (?) OR owner_id IN (?)
         OR (context_type = 'task' AND context_id IN (?)) OR (context_type = 'sales_item' AND context_id IN (?))`,
      [ids, ids, none(tasks), none(items)]
    );
    counts.conversations = await del(
      `DELETE FROM conversations WHERE user_a_id IN (?) OR user_b_id IN (?)
         OR (context_type = 'task' AND context_id IN (?)) OR (context_type = 'sale' AND context_id IN (?))
         OR (context_type = 'equipment' AND context_id IN (?))`,
      [ids, ids, none(tasks), none(items), none(equipment)]
    );
    counts.reports = await del(
      `DELETE FROM reports WHERE reporter_id IN (?) OR reported_user_id IN (?)
         OR (context_type = 'task' AND context_id IN (?)) OR (context_type = 'sales_item' AND context_id IN (?))
         OR (context_type = 'equipment' AND context_id IN (?)) OR (context_type = 'equipment_booking' AND context_id IN (?))
         OR (context_type = 'event' AND context_id IN (?))`,
      [ids, ids, none(tasks), none(items), none(equipment), none(bookings), none(events)]
    );
    counts.acknowledgements = await del(
      `DELETE FROM user_acknowledgements WHERE user_id IN (?)
         OR (context_type = 'task' AND context_id IN (?)) OR (context_type = 'sales_item' AND context_id IN (?))
         OR (context_type = 'equipment' AND context_id IN (?)) OR (context_type = 'equipment_booking' AND context_id IN (?))`,
      [ids, none(tasks), none(items), none(equipment), none(bookings)]
    );
    /* Bookings, sale orders, payments, reviews, RSVPs, endorsements and the
       rest go with their listing or person (ON DELETE CASCADE). */
    counts.bookings = await del(`DELETE FROM equipment_bookings WHERE id IN (?)`, [none(bookings)]);
    counts.salesItems = await del(`DELETE FROM sales_items WHERE id IN (?)`, [none(items)]);
    counts.tasks = await del(`DELETE FROM tasks WHERE id IN (?)`, [none(tasks)]);
    counts.equipment = await del(`DELETE FROM equipment WHERE id IN (?)`, [none(equipment)]);
    counts.events = await del(`DELETE FROM events WHERE id IN (?)`, [none(events)]);
    counts.securityEvents = await del(`DELETE FROM security_events WHERE user_id IN (?) OR email LIKE ?`, [ids, `%@${DEMO_DOMAIN}`]);
    /* A real task a demo person was doing goes back to open. */
    await conn.query(
      `UPDATE payments SET status = 'Cancelled' WHERE status = 'Held' AND task_id IN
         (SELECT id FROM tasks WHERE accepted_by IN (?) AND status IN ('Accepted', 'In Progress'))`, [ids]
    );
    counts.reopenedRealTasks = await del(
      `UPDATE tasks SET accepted_by = NULL, status = 'Posted' WHERE accepted_by IN (?) AND status IN ('Accepted', 'In Progress')`, [ids]
    );
    counts.users = await del(`DELETE FROM users WHERE id IN (?)`, [ids]);

    for (const { id } of touched) {
      await conn.query(
        `UPDATE users u SET
           rating_average = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE reviewee_id = u.id),
           total_reviews = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id)
         WHERE u.id = ?`, [id]
      );
    }
    await conn.commit();
    console.log(`Removed the demo data from ${process.env.DB_NAME}:`, counts);
    if (touched.length) console.log(`Recalculated the rating of ${touched.length} real account(s).`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/* ───────────────────────── seed ───────────────────────── */

async function seedDemoData() {
  const [existing] = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE email LIKE ?`, [`%@${DEMO_DOMAIN}`]);
  if (existing[0].n > 0) {
    throw new Error(`Demo data is already in ${process.env.DB_NAME}. Remove it first: node scripts/seed-demo-data.js${LIVE ? " --live" : ""} --remove`);
  }

  const passwordArg = process.argv.find((a) => a.startsWith("--password="));
  const password = passwordArg ? passwordArg.slice(11) : `Demo-${crypto.randomBytes(4).toString("hex")}!`;
  const passwordHash = await bcrypt.hash(password, 10);

  const conn = await pool.getConnection();
  const people = {};          // handle -> { id, name, member_type }
  const stats = {};
  const bump = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; };
  const ackRows = [];
  const ack = (userId, kind, contextType, contextId, at) =>
    ackRows.push({ user_id: userId, kind, version: ACKNOWLEDGEMENTS[kind].version, context_type: contextType, context_id: contextId, created_at: at });

  try {
    await conn.beginTransaction();

    /* ── People ── */
    const usedNumbers = new Set();
    for (const [handle, name, faculty, year, bio, skills] of C.STUDENTS) {
      let studentNumber;
      do { studentNumber = `${pick(["22", "23", "24", "25"])}${between(1000000, 9999999)}`; } while (usedNumbers.has(studentNumber));
      usedNumbers.add(studentNumber);
      const joined = ago(handle === "thandeka" ? 70 : between(45, 85));
      const id = await insert(conn, "users", {
        full_name: name, email: `${slug(name)}@${DEMO_DOMAIN}`, phone_number: `0${pick(["6", "7", "8"])}${between(10000000, 99999999)}`,
        password_hash: passwordHash, role: "user", is_verified: 1, member_type: "Student", account_role: "Student",
        student_number: studentNumber, faculty, academic_year: year, bio, skills: JSON.stringify(skills),
        has_seen_onboarding: 1, created_at: joined, updated_at: joined
      });
      people[handle] = { id, name, member_type: "Student" };
    }
    for (const l of C.LECTURERS) {
      const joined = ago(between(60, 90));
      const id = await insert(conn, "users", {
        full_name: l.name, email: `${slug(l.name)}@${DEMO_DOMAIN}`, phone_number: `013${between(1000000, 9999999)}`,
        password_hash: passwordHash, role: "user", is_verified: 1, member_type: "Lecturer", account_role: "Staff",
        faculty: l.faculty, bio: l.bio, lecturer_title: l.title, years_experience: l.years, office_location: l.office,
        consultation_mode: l.mode, availability_note: l.availability, lecturer_verified: 1,
        has_seen_onboarding: 1, created_at: joined, updated_at: joined
      });
      people[l.handle] = { id, name: l.name, member_type: "Lecturer" };
    }
    for (const s of C.STAFF) {
      const joined = ago(between(60, 90));
      const id = await insert(conn, "users", {
        full_name: s.name, email: `${slug(s.name)}@${DEMO_DOMAIN}`, phone_number: `013${between(1000000, 9999999)}`,
        password_hash: passwordHash, role: "user", is_verified: 1, member_type: "Staff", account_role: "Staff",
        faculty: s.faculty, bio: s.bio, has_seen_onboarding: 1, created_at: joined, updated_at: joined
      });
      people[s.handle] = { id, name: s.name, member_type: "Staff" };
    }
    bump("users", Object.keys(people).length);
    const students = C.STUDENTS.map(([h]) => h);
    const studentOtherThan = (...not) => { let h; do { h = pick(students); } while (not.includes(h)); return h; };
    const idOf = (h) => people[h].id;

    /* Conversations + messages, at most one per listing per pair. */
    const convoKeys = new Set();
    async function chat(contextType, contextId, opener, other, lines, startAt, { lastUnread = false } = {}) {
      const a = Math.min(idOf(opener), idOf(other)), b = Math.max(idOf(opener), idOf(other));
      const key = `${contextType}:${contextId}:${a}:${b}`;
      if (convoKeys.has(key)) return;
      convoKeys.add(key);
      let at = new Date(Math.min(startAt.getTime(), NOW - lines.length * 10 * 60000));
      const convoId = await insert(conn, "conversations", { context_type: contextType, context_id: contextId, user_a_id: a, user_b_id: b, created_at: at, updated_at: at });
      for (let i = 0; i < lines.length; i++) {
        const sender = i % 2 === 0 ? opener : other;
        const unread = lastUnread && i === lines.length - 1;
        await insert(conn, "messages", {
          conversation_id: convoId, sender_id: idOf(sender), body: lines[i], created_at: at,
          read_at: unread ? null : new Date(Math.min(NOW, at.getTime() + between(1, 40) * 60000))
        });
        at = new Date(Math.min(NOW - (lines.length - i - 1) * 60000, at.getTime() + between(2, 50) * 60000));
      }
      await conn.query(`UPDATE conversations SET updated_at = ? WHERE id = ?`, [at, convoId]);
      bump("conversations");
      bump("messages", lines.length);
    }

    async function review(fields, at) {
      await insert(conn, "reviews", { ...fields, created_at: at, updated_at: null });
      bump("reviews");
    }

    /* ── Tasks ── */
    const WORKERS = {
      "Tutoring & Study Help": ["thandeka", "bongani", "nokuthula", "priya", "naledi", "hlulani", "keamogetswe", "johan", "lindiwe"],
      "Programming & Tech Help": ["thandeka", "bongani", "themba", "priya", "siyabonga"],
      "Printing & Typing": ["zanele", "nandi", "precious"],
      "Other academic": ["lwazi", "precious", "lindiwe", "tshepo"],
      "Errands & Deliveries": ["lerato", "nandi", "kagiso", "tiyani"],
      "Cleaning & Laundry": ["refilwe", "lerato", "zanele"],
      "Moving & Lifting": ["kagiso", "tiyani", "siyabonga", "ruan"],
      "Repairs & Fixes": ["themba", "katlego", "tumelo"],
      "Hair & Beauty": ["nomvula", "ntombi"],
      "Photography & Design": ["sipho", "kabelo"],
      "Other": ["kagiso", "andile", "karabo", "gugu", "tiyani"]
    };
    /* Fixed outcomes for the featured account's own tasks; the rest is random. */
    const FORCED_STATUS = {
      "Print and bind 3 copies of my research poster": "Posted",
      "Pick up my laptop from the repair shop in town": "Completed",
      "Python tutoring — loops and functions": "Completed",
      "Explain SQL joins before my practical": "In Progress",
      "Help me understand hypothesis testing (STA101)": "Posted"
    };
    const FORCED_WORKER = {
      "Python tutoring — loops and functions": "thandeka",
      "Explain SQL joins before my practical": "thandeka",
      "Set up Excel for my budget practical": "thandeka",
      "Help configuring Git and GitHub": "thandeka"
    };

    for (const [posterHandle, title, description, category, section, price, place, urgent] of C.TASKS) {
      const poster = posterHandle || pick(students);
      let status = FORCED_STATUS[title];
      if (!status) {
        const r = rand();
        status = r < 0.40 ? "Posted" : r < 0.47 ? "Accepted" : r < 0.53 ? "In Progress" : r < 0.57 ? "Awaiting Confirmation" : r < 0.94 ? "Completed" : "Cancelled";
      }
      const pool_ = (WORKERS[category] || students).filter((h) => h !== poster);
      const worker = FORCED_WORKER[title] && FORCED_WORKER[title] !== poster ? FORCED_WORKER[title] : pick(pool_.length ? pool_ : students.filter((h) => h !== poster));

      const created = status === "Posted" ? ago(between(0, 9))
        : status === "Completed" ? ago(between(10, 45))
        : status === "Cancelled" ? ago(between(6, 30))
        : ago(between(2, 6));
      const acceptedAt = after(created, between(6, 40));
      const assigned = !["Posted", "Cancelled"].includes(status);

      const row = {
        title, description, category, section, price, location: C.PLACES[place] || place,
        status, urgent: urgent ? 1 : 0, created_by: idOf(poster), accepted_by: assigned ? idOf(worker) : null,
        image_urls: photos(title), moderation_status: "clean", created_at: created, updated_at: assigned ? acceptedAt : created
      };
      if (status === "Awaiting Confirmation") {
        const doneAt = new Date(NOW - between(2, 20) * HOUR);
        /* Reminder and escalation already "sent", so the scheduler leaves it alone. */
        Object.assign(row, { awaiting_confirmation_at: doneAt, review_reminder_sent_at: doneAt, review_escalated_at: doneAt, updated_at: doneAt });
      }
      const taskId = await insert(conn, "tasks", row);
      bump("tasks");
      if (section === "Academic") ack(idOf(poster), "academic_integrity", "task", taskId, created);

      /* Applications (offers at the listed price). */
      const applicants = new Set();
      if (status === "Posted") {
        const n = poster === "thandeka" ? 3 : between(0, 4);
        for (let i = 0; i < n; i++) applicants.add(pick(pool_.length ? pool_ : students.filter((h) => h !== poster)));
      } else if (status !== "Cancelled") {
        applicants.add(worker);
        if (chance(0.5)) applicants.add(studentOtherThan(poster, worker));
      }
      for (const applicant of applicants) {
        if (applicant === poster) continue;
        const won = assigned && applicant === worker;
        /* Open applications are recent so they're still live (48h expiry). */
        const at = status === "Posted"
          ? new Date(Math.max(created.getTime() + 30 * 60000, NOW - between(1, 30) * HOUR))
          : after(created, between(1, 5));
        const offerId = await insert(conn, "offers", {
          context_type: "task", context_id: taskId, offerer_id: idOf(applicant), owner_id: idOf(poster), amount: price,
          message: pick(C.APPLICATION_NOTES), last_proposed_by: "offerer", counter_rounds: 0,
          status: status === "Posted" ? "Pending" : won ? "Accepted" : "Declined",
          expires_at: new Date(at.getTime() + NEGOTIATION.offerExpiryHours * HOUR), created_at: at, updated_at: status === "Posted" ? at : acceptedAt
        });
        await insert(conn, "offer_history", { offer_id: offerId, amount: price, proposed_by: "offerer", message: null, created_at: at });
        bump("applications");
      }

      if (assigned) {
        await insert(conn, "payments", {
          task_id: taskId, amount: price, status: status === "Completed" ? "Released" : "Held",
          created_at: acceptedAt, updated_at: status === "Completed" ? after(acceptedAt, between(24, 96)) : acceptedAt
        });
        bump("payments");
        if (chance(0.75) || poster === "thandeka" || worker === "thandeka") {
          await chat("task", taskId, poster, worker, pick(C.TASK_CHATS), after(acceptedAt, 0.2),
            { lastUnread: worker === "thandeka" && status !== "Completed" });
        }
      }
      if (status === "Completed") {
        const doneAt = after(acceptedAt, between(20, 90));
        await conn.query(`UPDATE tasks SET updated_at = ? WHERE id = ?`, [doneAt, taskId]);
        const [r1, c1] = worker === "thandeka" ? [5, pick(C.TASK_REVIEWS_FOR_WORKER.filter(([r]) => r === 5))[1]] : pick(C.TASK_REVIEWS_FOR_WORKER);
        await review({ task_id: taskId, reviewer_id: idOf(poster), reviewee_id: idOf(worker), rating: r1, comment: c1 }, after(doneAt, between(1, 20)));
        if (chance(0.55)) {
          const [r2, c2] = pick(C.TASK_REVIEWS_FOR_POSTER);
          await review({ task_id: taskId, reviewer_id: idOf(worker), reviewee_id: idOf(poster), rating: r2, comment: c2 }, after(doneAt, between(2, 30)));
        }
      }
    }

    /* ── Sales ── */
    const saleItems = [];
    for (const [sellerHandle, title, description, category, section, price, condition, place, quantity] of C.SALES) {
      const seller = sellerHandle || pick(students);
      const created = ago(between(1, 40));
      const protectedSale = price >= SALES.escrowThreshold;
      let sold = 0, held = 0;
      const r = rand();
      if (quantity === 1) {
        if (r < 0.62) { /* available */ }
        else if (r < 0.78 && protectedSale) held = 1;
        else if (r >= 0.78) sold = 1;
      } else {
        sold = between(0, Math.max(0, quantity - 2));
      }
      const status = sold >= quantity ? "Sold" : quantity - sold - held <= 0 ? "Reserved" : "Available";
      const itemId = await insert(conn, "sales_items", {
        seller_id: idOf(seller), title, description, category, section, price, condition_status: condition,
        location: C.PLACES[place] || place, status, created_at: created, image_urls: photos(title), moderation_status: "clean",
        quantity, quantity_sold: sold
      });
      bump("salesItems");
      ack(idOf(seller), "selling_rules", "sales_item", itemId, created);
      saleItems.push({ itemId, seller, title, price, status });

      const fee = protectedSale ? money(price * SALES.protectionFeePercent / 100) : 0;
      /* Orders: protected sales go through Taskify (held, then released by
         the handover code); cheaper ones were paid in cash, so no order. */
      const orderCount = protectedSale ? sold + held : 0;
      for (let i = 0; i < orderCount; i++) {
        const buyer = seller === "thandeka" ? studentOtherThan(seller) : (i === 0 && chance(0.25) ? "thandeka" : studentOtherThan(seller));
        const isHeld = i >= sold;
        const at = after(created, between(10, 24 * Math.max(1, Math.floor((NOW - created.getTime()) / DAY) - 1)));
        await insert(conn, "sale_orders", {
          sales_item_id: itemId, buyer_id: idOf(buyer), seller_id: idOf(seller), item_price: price, protection_fee: fee,
          total_amount: money(price + fee), handover_code: String(between(0, 9999)).padStart(4, "0"),
          status: isHeld ? "Held" : "Released", released_at: isHeld ? null : after(at, between(4, 48)),
          created_at: at, updated_at: isHeld ? at : after(at, between(4, 48))
        });
        bump("saleOrders");
        await chat("sale", itemId, buyer, seller, pick(C.SALE_CHATS), new Date(at.getTime() - between(1, 6) * HOUR));
      }
      /* Someone asking about / offering on items still for sale. */
      if (status === "Available" && chance(0.45)) {
        const buyer = studentOtherThan(seller);
        await chat("sale", itemId, buyer, seller, pick(C.SALE_CHATS), ago(between(0, 3)), { lastUnread: seller === "thandeka" });
        if (protectedSale && chance(0.6)) {
          const amount = money(Math.round(price * pick([0.8, 0.85, 0.9]) / 10) * 10);
          const at = new Date(NOW - between(1, 30) * HOUR);
          const offerId = await insert(conn, "offers", {
            context_type: "sales_item", context_id: itemId, offerer_id: idOf(buyer), owner_id: idOf(seller), amount,
            message: pick(["Would you take this? I can collect today.", "Student budget 🙏 — can pay through Taskify straight away.", "Is this price okay? Can meet at the library."]),
            last_proposed_by: "offerer", counter_rounds: 0, status: "Pending",
            expires_at: new Date(at.getTime() + NEGOTIATION.offerExpiryHours * HOUR), created_at: at, updated_at: at
          });
          await insert(conn, "offer_history", { offer_id: offerId, amount, proposed_by: "offerer", message: null, created_at: at });
          bump("saleOffers");
        }
      }
    }

    /* ── Rentals ── */
    const rentalCount = {};   // renter handle -> returned rentals so far
    const feeFor = (amount) => money(Math.min(RENTAL_PROTECTION_FEE.max, Math.max(RENTAL_PROTECTION_FEE.min, amount * RENTAL_PROTECTION_FEE.percent / 100)));

    for (const [ownerHandle, name, description, category, section, daily, value, condition] of C.EQUIPMENT) {
      const owner = ownerHandle || pick(students);
      const created = ago(between(25, 60));
      const equipmentId = await insert(conn, "equipment", {
        owner_id: idOf(owner), name, description, condition_status: condition, category, section,
        daily_price: daily, item_value: value, is_available: 1, image_urls: photos(name), moderation_status: "clean",
        created_at: created, updated_at: created
      });
      bump("equipment");
      ack(idOf(owner), "rental_owner", "equipment", equipmentId, created);
      const terms = JSON.stringify(currentTerms({ dailyPrice: daily, itemValue: value }));
      const policyVersion = JSON.parse(terms).policyVersion;
      const short = /Calculators|Textbooks/.test(category) ? [1, 3] : [1, 4];
      const featuredItem = owner === "thandeka" || name.startsWith("Canon EOS");

      async function book({ renter, start, end, status, createdAt, extra = {} }) {
        const days = daysBetween(start, end);
        const amount = money(daily * days);
        const fee = feeFor(amount);
        const trust = (rentalCount[renter] || 0) >= 3 ? "trusted" : "new";
        const bookingId = await insert(conn, "equipment_bookings", {
          equipment_id: equipmentId, renter_id: idOf(renter), start_date: start, end_date: end, status,
          rental_days: days, rental_amount: amount, protection_fee: fee, deposit_amount: 0, trust_level: trust,
          payment_status: "Unpaid", deposit_status: "None", return_due_at: sastAt(end, 18),
          policy_version: policyVersion, terms_snapshot: terms, created_at: createdAt, updated_at: createdAt, ...extra
        });
        ack(idOf(renter), "rental_renter", "equipment_booking", bookingId, createdAt);
        bump(`bookings${status.replace(/\s/g, "")}`);
        return { bookingId, amount, fee };
      }

      /* Past rentals, walking back from a few days ago. */
      let cursor = -between(1, 4);
      const pastCount = featuredItem ? 3 : between(0, 4);
      const past = [];
      for (let i = 0; i < pastCount; i++) {
        const length = between(...short);
        const endOffset = cursor - between(0, 5);
        const startOffset = endOffset - length + 1;
        if (new Date(sastDay(startOffset)) <= new Date(created.getTime() + 2 * DAY)) break;
        past.push([startOffset, endOffset]);
        cursor = startOffset - 1;
      }
      for (const [startOffset, endOffset] of past.reverse()) {
        const renter = studentOtherThan(owner);
        const start = sastDay(startOffset), end = sastDay(endOffset);
        const requested = sastAt(sastDay(startOffset - between(1, 3)), between(8, 20));
        if (chance(0.12)) {
          await book({ renter, start, end, status: "Cancelled", createdAt: requested, extra: {
            cancelled_at: after(requested, between(2, 30)), cancel_reason: pick(["declined", "renter_cancelled", "request_expired"]), updated_at: after(requested, 30)
          } });
          continue;
        }
        const approved = after(requested, between(1, 10));
        const paid = after(approved, between(1, 8));
        const pickedUp = sastAt(start, between(8, 12), between(0, 59));
        const late = chance(0.15) ? between(10, 95) : 0;
        const returned = new Date(sastAt(end, 18).getTime() + (late ? late : -between(30, 300)) * 60000);
        const { bookingId, amount, fee } = await book({ renter, start, end, status: "Returned", createdAt: requested, extra: {
          approved_at: approved, payment_due_at: after(approved, 24), paid_at: paid, payment_status: "Released",
          condition_status: "OK", pickup_condition: condition, pickup_photos: "[]", picked_up_at: pickedUp,
          return_photos: "[]", returned_at: returned, return_minutes_late: late,
          return_reminder_sent_at: new Date(returned.getTime() - DAY), updated_at: returned
        } });
        rentalCount[renter] = (rentalCount[renter] || 0) + 1;
        await insert(conn, "protection_fund_entries", { kind: "fee", amount: fee, booking_id: bookingId, created_at: returned });
        if (chance(0.6)) {
          const [r, c] = pick(C.RENTAL_REVIEWS_FOR_OWNER);
          await review({ booking_id: bookingId, reviewer_id: idOf(renter), reviewee_id: idOf(owner), rating: r, comment: c }, after(returned, between(1, 30)));
        }
        if (chance(0.35)) {
          const [r, c] = late ? C.RENTAL_REVIEWS_FOR_RENTER[2] : pick(C.RENTAL_REVIEWS_FOR_RENTER.slice(0, 2));
          await review({ booking_id: bookingId, reviewer_id: idOf(owner), reviewee_id: idOf(renter), rating: r, comment: c }, after(returned, between(1, 30)));
        }
        if (chance(0.4)) await chat("equipment", equipmentId, renter, owner, pick(C.RENTAL_CHATS), new Date(paid.getTime() + 20 * 60000));
      }

      /* Out on rent right now (collected, due back in a few days). Every
         reminder is pre-marked as sent so the scheduler never acts on it. */
      let nextFree = 1;
      const camera = name.startsWith("Canon EOS");
      if (camera || chance(0.3)) {
        const renter = camera ? "thandeka" : studentOtherThan(owner);
        const startOffset = -between(0, 2), endOffset = between(2, 6);
        const start = sastDay(startOffset), end = sastDay(endOffset);
        const requested = sastAt(sastDay(startOffset - 2), between(8, 20));
        const approved = after(requested, between(1, 6)), paid = after(approved, between(1, 5));
        const pickedUp = new Date(Math.min(NOW - HOUR, sastAt(start, between(8, 11)).getTime()));
        const stamp = { return_reminder_sent_at: pickedUp, overdue_notified_at: pickedUp, overdue_escalated_at: pickedUp };
        await book({ renter, start, end, status: "Confirmed", createdAt: requested, extra: {
          approved_at: approved, payment_due_at: after(approved, 24), paid_at: paid, payment_status: "Held",
          pickup_condition: condition, pickup_photos: "[]", picked_up_at: pickedUp, updated_at: pickedUp, ...stamp
        } });
        await chat("equipment", equipmentId, renter, owner, C.RENTAL_CHATS[0], new Date(paid.getTime() + 10 * 60000), { lastUnread: owner === "thandeka" });
        nextFree = endOffset + 1;
      }

      /* Paid and waiting for pickup. */
      if (chance(0.22)) {
        const renter = studentOtherThan(owner);
        const startOffset = nextFree + between(1, 5), endOffset = startOffset + between(...short) - 1;
        const requested = new Date(NOW - between(20, 60) * HOUR);
        const approved = after(requested, between(1, 6)), paid = after(approved, between(1, 5));
        await book({ renter, start: sastDay(startOffset), end: sastDay(endOffset), status: "Confirmed", createdAt: requested, extra: {
          approved_at: approved, payment_due_at: after(approved, 24), paid_at: paid, payment_status: "Held",
          return_wait_notified_at: paid, updated_at: paid
        } });
        nextFree = endOffset + 1;
      }

      /* A fresh request waiting for the owner's answer. */
      if (owner === "thandeka" || chance(0.2)) {
        const renter = studentOtherThan(owner);
        const startOffset = nextFree + between(1, 4), endOffset = startOffset + between(...short) - 1;
        const requested = new Date(NOW - between(1, 14) * HOUR);
        await book({ renter, start: sastDay(startOffset), end: sastDay(endOffset), status: "Pending", createdAt: requested });
        await chat("equipment", equipmentId, renter, owner, C.RENTAL_CHATS[2], new Date(requested.getTime() - 30 * 60000), { lastUnread: owner === "thandeka" });
      }
    }

    /* ── Campus Marketplace ── */
    for (const [organizer, title, description, category, section, place, daysAhead, hour, capacity, food, drinks, authority] of C.EVENTS) {
      const created = ago(daysAhead < 0 ? between(30, 40) : between(3, 12));
      const eventDate = sastAt(sastDay(daysAhead), hour);
      const eventId = await insert(conn, "events", {
        organizer_id: idOf(organizer), title, description, category, section, location: C.PLACES[place] || place,
        event_date: eventDate, capacity, image_urls: photos(title), status: daysAhead < 0 ? "Completed" : "Upcoming",
        moderation_status: "clean", has_food: food, has_refreshments: drinks, listing_authority: authority,
        created_at: created, updated_at: created
      });
      bump("marketplaceListings");
      const going = new Set();
      const n = Math.min(capacity || 40, between(6, 26));
      for (let i = 0; i < n; i++) going.add(pick(students));
      if (daysAhead >= 0 && chance(0.7)) going.add("thandeka");
      for (const h of going) {
        await insert(conn, "event_rsvps", { event_id: eventId, user_id: idOf(h), created_at: after(created, between(1, 24 * 3)) });
        bump("rsvps");
      }
    }

    /* ── Lecturer endorsements ── */
    const ENDORSEMENTS = [
      ["mavuso", "thandeka", "Tutoring", "Thandeka tutored in my first-year programming module and explains concepts clearly and honestly."],
      ["mavuso", "bongani", "Tutoring", "Strong database and web development skills; reliable lab assistant."],
      ["mavuso", "priya", "Tutoring", "Excellent statistics student, patient with others."],
      ["steyn", "sifiso", "Toolkit", "Sifiso's soil kit is well maintained and correctly calibrated for practicals."],
      ["steyn", "tiyani", "General", "Hard-working and dependable on the teaching farm."],
      ["shongwe", "precious", "Tutoring", "Very good grasp of research methods and referencing."]
    ];
    for (const [lecturer, student, type, message] of ENDORSEMENTS) {
      await insert(conn, "lecturer_endorsements", {
        lecturer_id: idOf(lecturer), endorsed_user_id: idOf(student), endorsement_type: type, message, created_at: ago(between(3, 30))
      });
      bump("endorsements");
    }

    /* ── A few reports and feedback for the admin screens ── */
    const someItem = saleItems.find((s) => s.status === "Sold") || saleItems[0];
    const reporter = studentOtherThan(someItem.seller);
    await insert(conn, "reports", {
      reporter_id: idOf(reporter), reported_user_id: idOf(someItem.seller), context_type: "sales_item", context_id: someItem.itemId,
      reason: "We agreed to meet at the library at 12 but the seller didn't arrive and didn't reply to messages. They came the next day and it was sorted.",
      category: "no_show", status: "Resolved", created_at: ago(between(8, 15))
    });
    const available = saleItems.filter((s) => s.status === "Available");
    const odd = available[Math.floor(available.length / 2)];
    await insert(conn, "reports", {
      reporter_id: idOf(studentOtherThan(odd.seller)), reported_user_id: idOf(odd.seller), context_type: "sales_item", context_id: odd.itemId,
      reason: "The photos and description don't match what I saw when I went to look at it — it's a different model.",
      category: "not_as_described", status: "Pending", created_at: ago(1)
    });
    bump("reports", 2);
    const FEEDBACK = [
      ["idea", "It would be great to filter tasks by campus (Mbombela or Siyabuswa)."],
      ["idea", "Could we get a 'save for later' button on sales items?"],
      ["problem", "When I upload pickup photos on slow Wi-Fi it takes a while — maybe show a progress bar? (It did work in the end.)"]
    ];
    for (const [kind, message] of FEEDBACK) {
      await insert(conn, "feedback", { user_id: idOf(studentOtherThan("thandeka")), kind, message, status: "New", created_at: ago(between(1, 10)) });
      bump("feedback");
    }

    /* ── Notifications for the featured account, so the bell isn't empty ── */
    const t = idOf("thandeka");
    const NOTES = [
      ["New Review Received", "You received a 5/5 review for \"Python tutoring — loops and functions\".", 2, true],
      ["New application", "Someone applied to do \"Print and bind 3 copies of my research poster\". Compare the applications and choose who does it.", 0.2, false],
      ["Booking Request", "Someone would like to rent your \"Graphing calculator (Casio fx-CG50)\". Nothing has been paid yet — approve or decline within 48 hours.", 0.3, false],
      ["Payment Released", "R90.00 for \"Pick up my laptop from the repair shop in town\" has been released to the worker (demo).", 12, true],
      ["Endorsement received", "Dr. Nonhlanhla Mavuso endorsed you for Tutoring.", 9, true],
      ["Rental Confirmed", "Your rental of \"Canon EOS 2000D camera with 18–55mm lens\" is paid and confirmed (demo). Take the pickup photos when you collect it.", 3, true]
    ];
    for (const [title, message, daysAgo, read] of NOTES) {
      await insert(conn, "notifications", { user_id: t, title, message, is_read: read ? 1 : 0, created_at: new Date(NOW - daysAgo * DAY) });
      bump("notifications");
    }

    /* ── Acknowledgements and ratings ── */
    for (const row of ackRows) await insert(conn, "user_acknowledgements", row);
    bump("acknowledgements", ackRows.length);
    await conn.query(
      `UPDATE users u SET
         rating_average = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE reviewee_id = u.id),
         total_reviews = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id)
       WHERE u.email LIKE ?`, [`%@${DEMO_DOMAIN}`]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const loginsFile = path.join(__dirname, "demo-data", "logins.txt");
  const featured = ["thandeka", "sipho", "mavuso", "mkhonto"].map((h) => `  ${people[h].name.padEnd(22)} ${slug(people[h].name)}@${DEMO_DOMAIN}`);
  fs.writeFileSync(loginsFile, [
    `Taskify demo accounts (${LIVE ? "LIVE" : "local practice"} database ${process.env.DB_NAME}, seeded ${new Date().toISOString()})`,
    `Every demo account uses the same password: ${password}`,
    "",
    "Good ones to present with:",
    ...featured,
    "",
    "Any other demo person: firstname.lastname@" + DEMO_DOMAIN,
    "Remove everything: node scripts/seed-demo-data.js" + (LIVE ? " --live" : "") + " --remove",
    ""
  ].join("\n"));

  console.log(`Seeded demo data into ${process.env.DB_NAME}:`, stats);
  console.log(`Sign-in details: ${path.relative(process.cwd(), loginsFile)}`);
}

/* Re-applies the photos in content.js to demo rows already in the
   database, without re-seeding (logins and dates stay as they are). */
async function refreshPhotos() {
  const targets = [
    ["tasks", "title", "created_by"], ["sales_items", "title", "seller_id"],
    ["equipment", "name", "owner_id"], ["events", "title", "organizer_id"]
  ];
  let updated = 0;
  for (const [table, titleCol, ownerCol] of targets) {
    const [rows] = await pool.query(
      `SELECT t.id, t.${titleCol} AS title FROM ${table} t JOIN users u ON u.id = t.${ownerCol} WHERE u.email LIKE ?`,
      [`%@${DEMO_DOMAIN}`]
    );
    for (const row of rows) {
      const [result] = await pool.query(`UPDATE ${table} SET image_urls = ? WHERE id = ?`, [photos(row.title), row.id]);
      updated += result.affectedRows;
    }
  }
  console.log(`Updated the photos on ${updated} demo listing(s) in ${process.env.DB_NAME}.`);
}

(REMOVE ? removeDemoData() : process.argv.includes("--images") ? refreshPhotos() : seedDemoData())
  .catch((error) => { console.error("Failed, nothing was changed:", error.message); process.exitCode = 1; })
  .finally(() => pool.end());
