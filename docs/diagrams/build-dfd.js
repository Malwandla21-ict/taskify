/*
  Builds the Taskify data flow diagrams (Gane & Sarson notation) from ONE
  list of flows, so the context diagram (Level 0) and the Level 1 diagram
  always balance: every flow between an outside entity and the system on
  Level 0 is exactly the set of entity flows on Level 1.

  Usage (from the project root):  node docs/diagrams/build-dfd.js
  Writes: docs/diagrams/dfd-level-0.svg and docs/diagrams/dfd-level-1.svg

  Keep this in step with the code: process = a group of backend services
  and routes; data store = a group of MySQL tables (listed in the legend).
*/
const fs = require("fs");
const path = require("path");

/* ── The model ─────────────────────────────────────────────────────── */

const ENTITIES = {
  user:       { name: "User", sub: "student, lecturer or staff", side: "left" },
  admin:      { name: "Administrator", sub: "signed in with 2FA", side: "left" },
  azure:      { name: "Azure AI Content Safety", sub: "text and image checks", side: "right" },
  cloudinary: { name: "Cloudinary", sub: "image storage", side: "right" },
  email:      { name: "Email service", sub: "Brevo or SMTP", side: "right" },
  push:       { name: "Web push service", sub: "browser push", side: "right" }
};

const STORES = {
  D1: { name: "Users & security", tables: "users, trusted_devices, security_events, admin_allowlist" },
  D2: { name: "Listings, offers & transactions", tables: "tasks, sales_items, equipment, events, event_rsvps, offers, offer_history, payments, sale_orders, equipment_bookings, booking_extensions" },
  D3: { name: "Conversations & messages", tables: "conversations, messages" },
  D4: { name: "Notifications", tables: "notifications, push_subscriptions" },
  D5: { name: "Reviews & endorsements", tables: "reviews, lecturer_endorsements" },
  D6: { name: "Reports & moderation", tables: "reports, blocked_content_attempts, flagged_uploads" },
  D7: { name: "Admin audit log", tables: "admin_audit_logs" },
  D8: { name: "Feedback", tables: "feedback" }
};

const PROCESSES = {
  "1": { name: "Manage accounts and security", code: "auth, user, twoFactor, securityLog" },
  "2": { name: "Check and store images", code: "upload controller, contentModeration" },
  "3": { name: "Manage listings", code: "task, sales, equipment, event, listingEdit" },
  "4": { name: "Process offers and transactions", code: "offer, task, sales, equipment, rentalExtension" },
  "5": { name: "Exchange messages", code: "conversation" },
  "6": { name: "Deliver notifications and reminders", code: "notification, push, mailer, jobs/scheduler" },
  "7": { name: "Manage reviews and endorsements", code: "review, lecturer" },
  "8": { name: "Moderate and resolve", code: "report, moderation, admin, messageReport" },
  "9": { name: "Produce analytics and reports", code: "analytics, reportExport, auditlog" },
  "10": { name: "Collect feedback", code: "feedback" }
};

/* from → to, or both ways ("<>": the process reads AND writes the store). */
const FLOWS = [
  ["user", "1", "registration, sign-in, two-factor & profile details"],
  ["1", "user", "session, profile & account status"],
  ["1", "<>", "D1", "user & security records"],
  ["1", "D4", "notifications (lecturer to verify)"],
  ["1", "email", "verification, sign-in & password-reset codes"],

  ["user", "2", "photos (listings, rental condition, profile)"],
  ["2", "user", "image URLs or rejection"],
  ["2", "azure", "images to check"],
  ["azure", "2", "image check results"],
  ["2", "cloudinary", "accepted images"],
  ["cloudinary", "2", "image URLs"],
  ["2", "D6", "flagged uploads"],

  ["user", "3", "listings & edits (with image URLs)"],
  ["3", "user", "listings, search results, booked dates & terms"],
  ["3", "<>", "D2", "listing records"],
  ["3", "azure", "listing text & images to check"],
  ["azure", "3", "listing check results"],
  ["3", "D6", "blocked attempts"],
  ["3", "D4", "notifications (held for review)"],

  ["user", "4", "applications, offers, bookings, demo payments, handover codes & problem reports"],
  ["4", "user", "transaction status, terms, deadlines & handover code (buyer only)"],
  ["4", "<>", "D2", "offer, order, booking & payment records"],
  ["D1", "4", "trust levels & contact details"],
  ["4", "D6", "problem reports"],
  ["4", "D4", "notifications (transaction updates)"],

  ["user", "5", "messages"],
  ["5", "user", "conversations"],
  ["5", "<>", "D3", "conversations & messages"],
  ["D2", "5", "transaction links (who may chat)"],
  ["5", "D4", "notifications (new message)"],

  ["user", "6", "push subscription & read status"],
  ["6", "user", "notifications & reminders"],
  ["6", "admin", "admin alerts"],
  ["6", "<>", "D4", "notifications & push subscriptions"],
  ["D1", "6", "email addresses"],
  ["6", "<>", "D2", "due deadlines & reminder flags"],
  ["6", "email", "notification emails"],
  ["6", "push", "push notifications"],

  ["user", "7", "reviews & endorsements"],
  ["7", "user", "ratings & endorsements"],
  ["7", "<>", "D5", "review & endorsement records"],
  ["D2", "7", "completed tasks & returned rentals"],
  ["7", "D1", "rating averages"],
  ["7", "D4", "notifications (new review)"],

  ["user", "8", "reports (users, listings, messages)"],
  ["admin", "8", "moderation, account, dispute, damage & refund decisions"],
  ["8", "admin", "reports, flagged content & conversations"],
  ["8", "<>", "D6", "report & moderation records"],
  ["8", "<>", "D1", "account status & admin allow-list"],
  ["8", "<>", "D2", "listing visibility, dispute outcomes & refunds"],
  ["8", "<>", "D3", "messages & message flags"],
  ["8", "D7", "audit entries"],
  ["8", "D4", "notifications (decisions)"],

  ["admin", "9", "report requests (date range, report type)"],
  ["9", "admin", "analytics, CSV reports & audit log"],
  ["D1", "9", "user & sign-in records"],
  ["D2", "9", "listing & transaction records"],
  ["D4", "9", "notification records"],
  ["D6", "9", "report & moderation records"],
  ["9", "<>", "D7", "audit log & export entries"],

  ["user", "10", "feedback (ideas, problems, consultation, testing)"],
  ["10", "user", "confirmation"],
  ["admin", "10", "feedback marked reviewed"],
  ["10", "admin", "feedback list"],
  ["10", "<>", "D8", "feedback records"],
  ["D1", "10", "names & account types"],
  ["10", "D4", "notifications (new feedback)"],
  ["10", "D7", "audit entries (reviewed)"]
].map((f) => (f.length === 4
  ? { from: f[0], to: f[2], both: true, label: f[3] }
  : { from: f[0], to: f[1], both: false, label: f[2] }));

/* ── Checks: the rules a DFD must follow ───────────────────────────── */
function validate() {
  const problems = [];
  const isP = (x) => x in PROCESSES, isE = (x) => x in ENTITIES, isS = (x) => x in STORES;
  for (const f of FLOWS) {
    for (const end of [f.from, f.to]) if (!isP(end) && !isE(end) && !isS(end)) problems.push(`unknown node ${end}`);
    if (!isP(f.from) && !isP(f.to)) problems.push(`flow "${f.label}" doesn't touch a process (${f.from} → ${f.to})`);
    if (f.both && !(isP(f.from) && isS(f.to))) problems.push(`two-way flow "${f.label}" must be process <> store`);
  }
  for (const id of Object.keys(PROCESSES)) {
    const ins = FLOWS.filter((f) => f.to === id || (f.both && f.from === id));
    const outs = FLOWS.filter((f) => f.from === id);
    if (!ins.length) problems.push(`process ${id} has no input (miracle)`);
    if (!outs.length) problems.push(`process ${id} has no output (black hole)`);
  }
  for (const id of Object.keys(STORES)) {
    const writes = FLOWS.filter((f) => f.to === id);
    const reads = FLOWS.filter((f) => f.from === id || (f.both && f.to === id));
    if (!writes.length) problems.push(`store ${id} is never written`);
    if (!reads.length) problems.push(`store ${id} is never read`);
  }
  for (const id of Object.keys(ENTITIES)) {
    if (!FLOWS.some((f) => f.from === id || f.to === id)) problems.push(`entity ${id} has no flows`);
  }
  if (problems.length) throw new Error("DFD model problems:\n" + problems.join("\n"));
}

/* ── SVG helpers ───────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CHAR_W = 6.1; // ~ width of an 11px character
function wrap(text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length * CHAR_W > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const STYLE = `
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#0C1D4A"/>
    </marker>
    <style>
      .title { font-size: 22px; font-weight: 700; fill: #0C1D4A; }
      .subtitle { font-size: 12.5px; fill: #4B5563; }
      .flow { fill: none; stroke: #0C1D4A; stroke-width: 1.4; marker-end: url(#arrow); }
      .flow2 { fill: none; stroke: #0C1D4A; stroke-width: 1.4; marker-end: url(#arrow); marker-start: url(#arrow); }
      .flabel { font-size: 11px; fill: #111827; }
      .proc { fill: #EEF4FF; stroke: #0C1D4A; stroke-width: 1.6; }
      .proc-id { font-size: 12px; font-weight: 700; fill: #0072CE; }
      .proc-name { font-size: 13.5px; font-weight: 700; fill: #0C1D4A; }
      .proc-code { font-size: 9.5px; fill: #687280; font-style: italic; }
      .ent { fill: #F3F4F6; stroke: #0C1D4A; stroke-width: 1.6; }
      .ent-shadow { fill: #0C1D4A; opacity: 0.18; }
      .ent-name { font-size: 13px; font-weight: 700; fill: #0C1D4A; }
      .ent-sub { font-size: 10px; fill: #4B5563; }
      .store-line { fill: none; stroke: #009B72; stroke-width: 1.6; }
      .store-fill { fill: #E6F6F0; }
      .store-id { font-size: 12px; font-weight: 700; fill: #007A5A; }
      .store-name { font-size: 12px; font-weight: 600; fill: #0C1D4A; }
      .legend { font-size: 11px; fill: #374151; }
      .legend-b { font-size: 11px; font-weight: 700; fill: #0C1D4A; }
    </style>
  </defs>`;

function entityBox(x, y, w, h, id, { duplicate = false } = {}) {
  const e = ENTITIES[id];
  return `
  <rect class="ent-shadow" x="${x + 5}" y="${y + 5}" width="${w}" height="${h}"/>
  <rect class="ent" x="${x}" y="${y}" width="${w}" height="${h}"/>
  <text class="ent-name" x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle">${esc(e.name)}</text>
  <text class="ent-sub" x="${x + w / 2}" y="${y + h / 2 + 13}" text-anchor="middle">${esc(e.sub)}</text>${duplicate
    ? `\n  <line x1="${x + w - 14}" y1="${y + h}" x2="${x + w}" y2="${y + h - 14}" stroke="#0C1D4A" stroke-width="1.6"/>` : ""}`;
}

function storeBox(x, y, w, h, id, { duplicate = false } = {}) {
  const s = STORES[id];
  const idW = 44;
  return `
  <rect class="store-fill" x="${x}" y="${y}" width="${w}" height="${h}"/>
  <path class="store-line" d="M${x + w},${y} L${x},${y} L${x},${y + h} L${x + w},${y + h} M${x + idW},${y} L${x + idW},${y + h}"/>${duplicate
    ? `\n  <path class="store-line" d="M${x + 7},${y} L${x + 7},${y + h}"/>` : ""}
  <text class="store-id" x="${x + idW / 2 + (duplicate ? 3 : 0)}" y="${y + h / 2 + 4}" text-anchor="middle">${id}</text>
  <text class="store-name" x="${x + idW + 10}" y="${y + h / 2 + 4}">${esc(s.name)}</text>`;
}

function processBox(x, y, w, h, id, name = PROCESSES[id]?.name, code = PROCESSES[id]?.code) {
  const lines = wrap(name, w - 24);
  const mid = y + 22 + (h - 22) / 2;
  const startY = mid - ((lines.length - 1) * 16) / 2 - (code ? 6 : 0);
  return `
  <rect class="proc" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>
  <line x1="${x}" y1="${y + 26}" x2="${x + w}" y2="${y + 26}" stroke="#0C1D4A" stroke-width="1.2"/>
  <text class="proc-id" x="${x + w / 2}" y="${y + 18}" text-anchor="middle">${esc(id === "0" ? "0" : `${id}.0`)}</text>
  ${lines.map((l, i) => `<text class="proc-name" x="${x + w / 2}" y="${startY + i * 16}" text-anchor="middle">${esc(l)}</text>`).join("\n  ")}${code
    ? `\n  <text class="proc-code" x="${x + w / 2}" y="${startY + lines.length * 16 + 4}" text-anchor="middle">${esc(code)}</text>` : ""}`;
}

function labelAbove(xCenter, yLine, lines) {
  return lines.map((l, i) => `<text class="flabel" x="${xCenter}" y="${yLine - 6 - (lines.length - 1 - i) * 15}" text-anchor="middle">${esc(l)}</text>`).join("\n  ");
}

/* ── Level 1 ───────────────────────────────────────────────────────── */
function buildLevel1() {
  const W = 1440;
  const X = { ent: 40, entW: 200, proc: 520, procW: 260, tgt: 1080, tgtW: 300 };
  const leftLabelW = X.proc - (X.ent + X.entW) - 24;
  const rightLabelW = X.tgt - (X.proc + X.procW) - 24;
  const seenEnt = new Set(), seenStore = new Set();
  let y = 120;
  const out = [];

  for (const pid of Object.keys(PROCESSES)) {
    const touches = FLOWS.filter((f) => f.from === pid || f.to === pid);
    const other = (f) => (f.from === pid ? f.to : f.from);
    const left = touches.filter((f) => ENTITIES[other(f)]?.side === "left");
    const right = touches.filter((f) => !(ENTITIES[other(f)]?.side === "left"));
    const order = (a, b) => {
      const rank = (n) => (STORES[n] ? 0 : 1) * 100 + (Object.keys(STORES).indexOf(n) + Object.keys(ENTITIES).indexOf(n));
      return rank(other(a)) - rank(other(b));
    };
    left.sort((a, b) => Object.keys(ENTITIES).indexOf(other(a)) - Object.keys(ENTITIES).indexOf(other(b)));
    right.sort(order);

    const slot = (f, width) => ({ f, lines: wrap(f.label, width) });
    const L = left.map((f) => slot(f, leftLabelW));
    const R = right.map((f) => slot(f, rightLabelW));
    const slotH = (s) => s.lines.length * 15 + 18;
    const hL = L.reduce((a, s) => a + slotH(s), 0) + (new Set(left.map(other)).size - 1) * 14;
    const hR = R.reduce((a, s) => a + slotH(s), 0) + (new Set(right.map(other)).size - 1) * 10;
    const rowH = Math.max(hL, hR, 120) + 20;
    const procY = y, procH = rowH - 20;

    out.push(processBox(X.proc, procY, X.procW, procH, pid));

    /* left side: entities */
    const placeSide = (slots, gap, drawTarget, lineFor) => {
      const total = slots.reduce((a, s) => a + slotH(s), 0) + (new Set(slots.map((s) => other(s.f))).size - 1) * gap;
      let cy = procY + (procH - total) / 2;
      let i = 0;
      while (i < slots.length) {
        const target = other(slots[i].f);
        const group = [];
        while (i < slots.length && other(slots[i].f) === target) { group.push(slots[i]); i += 1; }
        const top = cy;
        for (const s of group) {
          const lineY = cy + s.lines.length * 15 + 8;
          out.push(lineFor(s, lineY));
          cy += slotH(s);
        }
        drawTarget(target, top + 4, cy - top - 8);
        cy += gap;
      }
    };

    placeSide(L, 14, (id, ty, th) => {
      out.push(entityBox(X.ent, ty, X.entW, Math.max(th, 44), id, { duplicate: seenEnt.has(id) }));
      seenEnt.add(id);
    }, (s, ly) => {
      const toProc = s.f.to === pid;
      const x1 = toProc ? X.ent + X.entW : X.proc, x2 = toProc ? X.proc - 2 : X.ent + X.entW + 2;
      return `<path class="flow" d="M${x1},${ly} L${x2},${ly}"/>\n  ${labelAbove((X.ent + X.entW + X.proc) / 2, ly, s.lines)}`;
    });

    placeSide(R, 10, (id, ty, th) => {
      if (STORES[id]) {
        out.push(storeBox(X.tgt, ty, X.tgtW, Math.max(th, 34), id, { duplicate: seenStore.has(id) }));
        seenStore.add(id);
      } else {
        out.push(entityBox(X.tgt, ty, X.tgtW, Math.max(th, 44), id, { duplicate: seenEnt.has(id) }));
        seenEnt.add(id);
      }
    }, (s, ly) => {
      const procEdge = X.proc + X.procW, tgtEdge = X.tgt;
      if (s.f.both) return `<path class="flow2" d="M${procEdge + 2},${ly} L${tgtEdge - 2},${ly}"/>\n  ${labelAbove((procEdge + tgtEdge) / 2, ly, s.lines)}`;
      const fromProc = s.f.from === pid;
      const x1 = fromProc ? procEdge : tgtEdge, x2 = fromProc ? tgtEdge - 2 : procEdge + 2;
      return `<path class="flow" d="M${x1},${ly} L${x2},${ly}"/>\n  ${labelAbove((procEdge + tgtEdge) / 2, ly, s.lines)}`;
    });

    y += rowH + 22;
    out.push(`<line x1="40" y1="${y - 12}" x2="${W - 40}" y2="${y - 12}" stroke="#EEF0F3" stroke-width="1"/>`);
  }

  /* legend + data dictionary */
  const leg = [];
  let ly = y + 14;
  leg.push(`<text class="legend-b" x="40" y="${ly}">Notation (Gane &amp; Sarson)</text>`);
  ly += 18;
  leg.push(entityBox(40, ly, 120, 40, "user").replace(/User<\/text>[\s\S]*?<\/text>/, "External entity</text>"));
  leg.push(processBox(200, ly - 6, 150, 56, "n", "Process", null).replace(">n.0<", ">n.0<"));
  leg.push(`<rect class="store-fill" x="390" y="${ly + 4}" width="160" height="32"/><path class="store-line" d="M550,${ly + 4} L390,${ly + 4} L390,${ly + 36} L550,${ly + 36} M434,${ly + 4} L434,${ly + 36}"/><text class="store-id" x="412" y="${ly + 24}" text-anchor="middle">Dn</text><text class="store-name" x="444" y="${ly + 24}">Data store</text>`);
  leg.push(`<path class="flow legend-flow" d="M590,${ly + 12} L660,${ly + 12}"/><text class="legend" x="668" y="${ly + 16}">data flow</text>`);
  leg.push(`<path class="flow2 legend-flow" d="M590,${ly + 32} L660,${ly + 32}"/><text class="legend" x="668" y="${ly + 36}">read and write (two flows drawn as one line)</text>`);
  leg.push(`<text class="legend" x="960" y="${ly + 16}">A store with an extra stripe, or an entity with a</text><text class="legend" x="960" y="${ly + 30}">corner mark, is a repeat of one drawn above.</text>`);
  ly += 70;
  leg.push(`<text class="legend-b" x="40" y="${ly}">Data stores (MySQL tables)</text>`);
  ly += 4;
  for (const [id, s] of Object.entries(STORES)) {
    const lines = wrap(`${id} ${s.name}: ${s.tables}`, W - 120);
    for (const line of lines) { ly += 15; leg.push(`<text class="legend" x="40" y="${ly}">${esc(line)}</text>`); }
  }
  ly += 22;
  for (const line of [
    "Payments are a demo: \"payment\" flows record statuses (held, released, refunded) — no money moves and no payment provider is connected.",
    "Process 4 also expires lapsed booking requests and approvals; it runs whenever rentals are viewed and from the same 15-minute timed job that triggers process 6's reminders.",
    "Process names list the backend services that implement them (backend/src/services). Generated by docs/diagrams/build-dfd.js from the same flow list as the Level 0 diagram."
  ]) { leg.push(`<text class="legend" x="40" y="${ly}">${esc(line)}</text>`); ly += 15; }

  const H = ly + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Segoe UI', Arial, sans-serif">${STYLE}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
  <text class="title" x="40" y="44">Taskify — Data flow diagram, Level 1</text>
  <text class="subtitle" x="40" y="66">The Taskify system (process 0 on the context diagram) broken into its main processes. Each row is one process with everything it exchanges data with.</text>
  <text class="subtitle" x="40" y="84">Outside entities are on the left (people) and right (services); data stores are on the right.</text>
  ${out.join("\n  ")}
  ${leg.join("\n  ")}
</svg>
`;
}

/* ── Level 0 (context) ─────────────────────────────────────────────── */
function buildLevel0() {
  /* Every entity ↔ process flow becomes entity ↔ system 0, grouped by direction. */
  const groups = {};
  for (const f of FLOWS) {
    const fromE = ENTITIES[f.from], toE = ENTITIES[f.to];
    if (!fromE && !toE) continue;
    const ent = fromE ? f.from : f.to;
    const dir = fromE ? "in" : "out";
    const key = `${ent}:${dir}`;
    (groups[key] ||= []);
    if (!groups[key].includes(f.label)) groups[key].push(f.label);
  }

  const W = 1500;
  const P = { x: 620, w: 280 };
  const out = [];
  const bullets = (labels, width) => labels.flatMap((l) => wrap(l, width).map((line, i) => (i === 0 ? `• ${line}` : `   ${line}`)));

  /* right-hand services, stacked */
  const services = ["azure", "cloudinary", "email", "push"];
  let ry = 130;
  const rightRows = [];
  for (const id of services) {
    const flows = ["out", "in"].flatMap((dir) => (groups[`${id}:${dir}`] || []).map((label) => ({ dir, label })));
    const rows = flows.map((f) => ({ ...f, lines: bullets([f.label], 250).map((l) => l.replace(/^• /, "")) }));
    const top = ry;
    for (const r of rows) { r.y = ry + r.lines.length * 15 + 10; ry += r.lines.length * 15 + 26; }
    rightRows.push({ id, top, bottom: ry - 8, rows });
    ry += 26;
  }
  const procTop = 130, procBottom = Math.max(ry - 26, 560);

  out.push(processBox(P.x, procTop, P.w, procBottom - procTop, "0", "Taskify system", "web pages + Node/Express API + MySQL database"));

  for (const g of rightRows) {
    out.push(entityBox(1180, g.top + 2, 280, Math.max(g.bottom - g.top - 4, 50), g.id));
    for (const r of g.rows) {
      const x1 = r.dir === "out" ? P.x + P.w : 1180, x2 = r.dir === "out" ? 1178 : P.x + P.w + 2;
      out.push(`<path class="flow" d="M${x1},${r.y} L${x2},${r.y}"/>`);
      out.push(labelAbove((P.x + P.w + 1180) / 2, r.y, r.lines));
    }
  }

  /* user on the left: one flow in (labels above), one flow out (labels below) */
  const userIn = bullets(groups["user:in"], 330);
  const userOut = bullets(groups["user:out"], 330);
  const midY = (procTop + procBottom) / 2;
  const inY = midY - 18, outY = midY + 18;
  out.push(entityBox(40, midY - 50, 200, 100, "user"));
  out.push(`<path class="flow" d="M240,${inY} L${P.x - 2},${inY}"/>`);
  out.push(`<path class="flow" d="M${P.x},${outY} L242,${outY}"/>`);
  /* continuation lines of a wrapped bullet are indented under its text */
  const bulletText = (l, x, y, anchor = "start") => {
    const cont = l.startsWith("   ");
    const dx = cont && anchor === "start" ? 10 : 0;
    return `<text class="flabel" x="${x + dx}" y="${y}"${anchor === "end" ? " text-anchor=\"end\"" : ""}>${esc(l.trim())}</text>`;
  };
  userIn.forEach((l, i) => out.push(bulletText(l, 256, inY - 8 - (userIn.length - 1 - i) * 14)));
  userOut.forEach((l, i) => out.push(bulletText(l, 256, outY + 18 + i * 14)));

  /* administrator below */
  const adminIn = bullets(groups["admin:in"], 300);
  const adminOut = bullets(groups["admin:out"], 300);
  const aTop = procBottom + 130;
  out.push(entityBox(P.x + 40, aTop, 200, 70, "admin"));
  const xDown = P.x + 90, xUp = P.x + 190;
  out.push(`<path class="flow" d="M${xDown},${procBottom} L${xDown},${aTop - 2}"/>`);
  out.push(`<path class="flow" d="M${xUp},${aTop} L${xUp},${procBottom + 2}"/>`);
  adminOut.forEach((l, i) => out.push(bulletText(l, xDown - 10, procBottom + 30 + i * 14, "end")));
  adminIn.forEach((l, i) => out.push(bulletText(l, xUp + 10, procBottom + 30 + i * 14)));

  let ly = aTop + 120;
  const leg = [
    `<text class="legend-b" x="40" y="${ly}">Notation (Gane &amp; Sarson):</text>`,
    `<text class="legend" x="230" y="${ly}">shaded rectangle = external entity · rounded rectangle = process (0 = the whole system) · arrow = data flow.</text>`,
    `<text class="legend" x="40" y="${ly + 18}">Each label lists the data flows that cross the system boundary; the Level 1 diagram shows the same flows, by process. Payments are a demo — no payment provider is connected.</text>`,
    `<text class="legend" x="40" y="${ly + 36}">Generated by docs/diagrams/build-dfd.js from the same flow list as Level 1, so the two levels always balance.</text>`
  ];
  const H = ly + 56;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Segoe UI', Arial, sans-serif">${STYLE}
  <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
  <text class="title" x="40" y="44">Taskify — Data flow diagram, Level 0 (context diagram)</text>
  <text class="subtitle" x="40" y="66">The whole system as one process, with every outside entity and the data that flows between them.</text>
  ${out.join("\n  ")}
  ${leg.join("\n  ")}
</svg>
`;
}

validate();
fs.writeFileSync(path.join(__dirname, "dfd-level-0.svg"), buildLevel0());
fs.writeFileSync(path.join(__dirname, "dfd-level-1.svg"), buildLevel1());
console.log(`OK — ${FLOWS.length} flows, ${Object.keys(PROCESSES).length} processes, ${Object.keys(STORES).length} stores, ${Object.keys(ENTITIES).length} entities. Wrote dfd-level-0.svg and dfd-level-1.svg`);
