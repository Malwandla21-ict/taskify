/*
  Builds the Taskify entity-relationship diagram (crow's foot notation)
  from erd-schema.json — a structure-only snapshot of the live database
  (tables, columns, keys, foreign keys; no data). Every table, column and
  foreign key in the snapshot is drawn, and the script stops if any is
  missing from the layout, so the picture can't silently drift from the
  database.

  Usage (from the project root):  node docs/diagrams/build-erd.js
  Writes: docs/diagrams/erd.svg
*/
const fs = require("fs");
const path = require("path");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "erd-schema.json"), "utf8"));

/* Columns of tables, top to bottom. users sits across the top because
   almost every table refers to it. */
const LAYOUT = [
  ["tasks", "payments", "offers", "offer_history", "reviews"],
  ["equipment", "equipment_bookings", "booking_extensions"],
  ["sales_items", "sale_orders", "events", "event_rsvps"],
  ["conversations", "messages", "reports", "notifications", "lecturer_endorsements"],
  ["push_subscriptions", "trusted_devices", "security_events", "admin_allowlist", "admin_audit_logs", "blocked_content_attempts", "flagged_uploads"]
];
const GROUP_LABELS = ["Tasks, offers & reviews", "Rentals", "Sales & Campus Marketplace", "Messages, reports & notifications", "Security, admin & moderation"];

/* References enforced in code rather than by a foreign key (a type column
   says which table the id belongs to, or there's simply no constraint). */
const LOGICAL_REFS = [
  ["offers", "context_type + context_id", "tasks or sales_items"],
  ["conversations", "context_type + context_id", "tasks, equipment or sales_items ('sale')"],
  ["notifications", "context_type + context_id", "tasks, equipment_bookings, sales_items or events"],
  ["reports", "context_type + context_id", "tasks, equipment, equipment_bookings, sales_items or events"],
  ["lecturer_endorsements", "context_type + context_id", "sales_items, equipment, tasks or events"],
  ["admin_audit_logs", "target_type + target_id", "the user, task, report, sale order, booking … the action was about"],
  ["blocked_content_attempts", "user_id", "users (no foreign key; the blocked post itself is never saved, so there is nothing else to link to)"],
  ["flagged_uploads", "image_url", "matched against the image_urls lists in tasks, sales_items, equipment and events when a listing is posted"],
  ["security_events", "email", "the email typed at sign-in (may not be a user)"]
];

/* ── checks ── */
const placed = LAYOUT.flat().concat("users");
const missing = Object.keys(schema.tables).filter((t) => !placed.includes(t));
const unknown = placed.filter((t) => !schema.tables[t]);
if (missing.length || unknown.length) throw new Error(`Layout out of date. Missing: ${missing.join(", ")}; unknown: ${unknown.join(", ")}`);

/* ── geometry ── */
const ROW = 16, HEAD = 30, PAD = 6, TW = 290, USERS_COLS = 3;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tableH = (t) => HEAD + schema.tables[t].columns.length * ROW + PAD;
const shortType = (type) => type.startsWith("enum(") ? "enum" : type.replace("tinyint(1)", "boolean").replace(" unsigned", "");

const fkByCol = new Map(schema.foreignKeys.map((f) => [`${f.table}.${f.column}`, f]));
const isUniqueCol = (t, c) => schema.tables[t].unique.some((u) => u.length === 1 && u[0] === c);

/* Which column each table is in, and the relationship kinds. */
const colOf = {};
LAYOUT.forEach((list, i) => list.forEach((t) => { colOf[t] = i; }));
const rels = schema.foreignKeys.map((f) => {
  if (f.refTable === "users") return { ...f, kind: "users", col: colOf[f.table] };
  if (colOf[f.table] === colOf[f.refTable]) return { ...f, kind: "intra", col: colOf[f.table] };
  return { ...f, kind: "cross", col: colOf[f.table] };
});

/* Corridors: corridor k is left of column k (k = 0..n), corridor n is
   right of the last column. Lanes: [intra lanes of column k-1] [cross
   lanes from column k-1] [users lanes of column k]. */
const n = LAYOUT.length;
const LANE = 11, EDGE = 34;
const corridor = Array.from({ length: n + 1 }, () => ({ intra: [], cross: [], users: [] }));
for (const r of rels) {
  if (r.kind === "users") corridor[r.col].users.push(r);
  else if (r.kind === "intra") corridor[r.col + 1].intra.push(r);
  else corridor[r.col + 1].cross.push(r);
}
const corridorW = corridor.map((c) => {
  const lanes = c.intra.length + c.cross.length + c.users.length;
  return lanes ? EDGE * 2 + (lanes - 1) * LANE : 40;
});

/* x positions */
const MARGIN = 40;
const colX = [];
let x = MARGIN;
for (let k = 0; k < n; k++) { x += corridorW[k]; colX.push(x); x += TW; }
const W = x + corridorW[n] + MARGIN;

/* users box across the top */
const usersCols = schema.tables.users.columns;
const perCol = Math.ceil(usersCols.length / USERS_COLS);
const usersW = USERS_COLS * 250;
const users = { x: (W - usersW) / 2, y: 150, w: usersW, h: HEAD + perCol * ROW + PAD };

/* channels between users and the tables */
const userRels = rels.filter((r) => r.kind === "users");
const usersCenter = users.x + users.w / 2;

/* table y positions (computed after we know the channel height) */
const CH_GAP = 9;
function layoutTables(top) {
  const pos = {};
  LAYOUT.forEach((list, k) => {
    let y = top;
    for (const t of list) { pos[t] = { x: colX[k], y, w: TW, h: tableH(t) }; y += tableH(t) + 46; }
  });
  pos.users = users;
  return pos;
}
const rowY = (pos, t, c) => pos[t].y + HEAD + schema.tables[t].columns.findIndex((col) => col.name === c) * ROW + ROW / 2 - 1;

/* Assign lanes. Users lanes: deeper child row → further left. Intra lanes:
   shorter span → closer to the table. Cross lanes in between. */
function assignLanes(pos) {
  for (let k = 0; k <= n; k++) {
    const c = corridor[k];
    const left = k === 0 ? MARGIN : colX[k - 1] + TW;
    let lx = left + EDGE;
    const span = (r) => Math.abs(rowY(pos, r.table, r.column) - pos[r.refTable].y);
    c.intra.sort((a, b) => span(a) - span(b)).forEach((r) => { r.laneX = lx; lx += LANE; });
    c.cross.forEach((r) => { r.laneX = lx; lx += LANE; });
    c.users.sort((a, b) => rowY(pos, b.table, b.column) - rowY(pos, a.table, a.column)).forEach((r) => { r.laneX = lx; lx += LANE; });
  }
}

/* parent attach points on the parent's edge, spread over its rows */
function assignParentAttach(pos) {
  const byParent = {};
  for (const r of rels.filter((q) => q.kind !== "users")) (byParent[`${r.refTable}:${r.kind === "intra" ? "right" : "left"}`] ||= []).push(r);
  for (const [key, list] of Object.entries(byParent)) {
    const [t, side] = key.split(":");
    const p = pos[t];
    /* Attach low on the parent (its bottom rows), so the line can't cross
       the parent's own lanes above it; when several lines arrive on one
       side, the one whose lane is nearest the table takes the lowest row. */
    const edgeX = side === "left" ? p.x : p.x + p.w;
    list.sort((a, b) => Math.abs(a.laneX - edgeX) - Math.abs(b.laneX - edgeX));
    list.forEach((r, i) => {
      const rowIndex = schema.tables[t].columns.length - 1 - i;
      r.parentY = p.y + HEAD + rowIndex * ROW + ROW / 2 - 1;
      r.parentX = side === "left" ? p.x : p.x + p.w;
      r.parentSide = side;
    });
  }
}

/* users: attach x along users' bottom, channel y below it */
function assignUserChannels() {
  const left = userRels.filter((r) => r.laneX < usersCenter).sort((a, b) => a.laneX - b.laneX);
  const right = userRels.filter((r) => r.laneX >= usersCenter).sort((a, b) => b.laneX - a.laneX);
  const span = users.w / 2 - 30;
  const step = Math.min(24, span / Math.max(left.length, right.length, 1));
  left.forEach((r, i) => { r.attachX = users.x + 24 + i * step; r.channelY = users.y + users.h + 22 + i * CH_GAP; });
  right.forEach((r, i) => { r.attachX = users.x + users.w - 24 - i * step; r.channelY = users.y + users.h + 22 + i * CH_GAP; });
  return Math.max(left.length, right.length) * CH_GAP + 60;
}

/* Lanes only depend on the ORDER of rows, so a first layout at any height
   gives the lanes; then the channel height is known and the real layout
   is made below it. */
assignLanes(layoutTables(0));
const channelH = assignUserChannels();
const tablesTop = users.y + users.h + channelH;
const pos = layoutTables(tablesTop);
assignLanes(pos);
assignUserChannels();
assignParentAttach(pos);

/* ── drawing ── */
const out = [];
const C = { navy: "#0C1D4A", line: "#0C1D4A", grid: "#E5E7EB", pk: "#B38900", fk: "#0072CE", muted: "#6B7280" };

function drawTable(t, p, { columnsPerSide = 1 } = {}) {
  const cols = schema.tables[t].columns;
  const g = [];
  g.push(`<rect x="${p.x + 4}" y="${p.y + 4}" width="${p.w}" height="${p.h}" rx="8" fill="#0C1D4A" opacity="0.08"/>`);
  g.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="#FFFFFF" stroke="${C.navy}" stroke-width="1.5" class="tbl"/>`);
  g.push(`<path d="M${p.x},${p.y + HEAD} L${p.x},${p.y + 8} Q${p.x},${p.y} ${p.x + 8},${p.y} L${p.x + p.w - 8},${p.y} Q${p.x + p.w},${p.y} ${p.x + p.w},${p.y + 8} L${p.x + p.w},${p.y + HEAD} Z" fill="${C.navy}"/>`);
  g.push(`<text x="${p.x + p.w / 2}" y="${p.y + 20}" class="tname">${esc(t)}</text>`);
  const per = Math.ceil(cols.length / columnsPerSide);
  const subW = p.w / columnsPerSide;
  cols.forEach((col, i) => {
    const sub = Math.floor(i / per), r = i % per;
    const cx = p.x + sub * subW, cy = p.y + HEAD + r * ROW;
    if (r % 2 === 1) g.push(`<rect x="${cx + 1}" y="${cy}" width="${subW - 2}" height="${ROW}" fill="#F7F8FB"/>`);
    const fk = fkByCol.get(`${t}.${col.name}`);
    const keys = [col.pk ? "PK" : "", fk ? "FK" : "", !col.pk && isUniqueCol(t, col.name) ? "UQ" : ""].filter(Boolean).join(",");
    const keyColor = col.pk ? C.pk : fk ? C.fk : C.muted;
    g.push(`<text x="${cx + 8}" y="${cy + 12}" class="key" fill="${keyColor}">${keys}</text>`);
    g.push(`<text x="${cx + 40}" y="${cy + 12}" class="${col.pk ? "cname pk" : fk ? "cname fk" : "cname"}">${esc(col.name)}</text>`);
    g.push(`<text x="${cx + subW - 8}" y="${cy + 12}" class="ctype">${esc(shortType(col.type))}${col.nullable ? " ?" : ""}</text>`);
  });
  if (columnsPerSide > 1) for (let s = 1; s < columnsPerSide; s++) g.push(`<line x1="${p.x + s * subW}" y1="${p.y + HEAD}" x2="${p.x + s * subW}" y2="${p.y + p.h}" stroke="${C.grid}"/>`);
  return g.join("\n  ");
}

/* crow's foot end markers. (x, y) is on the box edge; (dx, dy) points
   from the line INTO the box. */
function endMarker(x, y, dx, dy, kind) {
  const px = -dy, py = dx; // perpendicular
  const at = (d) => [x - dx * d, y - dy * d];
  const bar = (d) => { const [bx, by] = at(d); return `<line x1="${bx + px * 6}" y1="${by + py * 6}" x2="${bx - px * 6}" y2="${by - py * 6}" stroke="${C.line}" stroke-width="1.4"/>`; };
  const circle = (d) => { const [cx, cy] = at(d); return `<circle cx="${cx}" cy="${cy}" r="4" fill="#FFFFFF" stroke="${C.line}" stroke-width="1.4"/>`; };
  const crow = () => { const [tx, ty] = at(12); return `<path d="M${tx},${ty} L${x + px * 7},${y + py * 7} M${tx},${ty} L${x},${y} M${tx},${ty} L${x - px * 7},${y - py * 7}" stroke="${C.line}" stroke-width="1.4" fill="none"/>`; };
  if (kind === "one") return bar(6) + bar(11);                 // one and only one
  if (kind === "zeroOne") return bar(7) + circle(17);          // zero or one
  if (kind === "many") return crow() + circle(19);             // zero or many
  return "";
}

function relLine(points, r) {
  return `<path class="rel" data-fk="${r.table}.${r.column}" d="${points.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ")}"/>`;
}

for (const r of rels) {
  const child = pos[r.table];
  const childCol = schema.tables[r.table].columns.find((c) => c.name === r.column);
  const cy = rowY(pos, r.table, r.column);
  const childEnd = isUniqueCol(r.table, r.column) ? "zeroOne" : "many";
  const parentEnd = childCol.nullable ? "zeroOne" : "one";

  if (r.kind === "users") {
    const pts = [[child.x, cy], [r.laneX, cy], [r.laneX, r.channelY], [r.attachX, r.channelY], [r.attachX, users.y + users.h]];
    out.push(relLine(pts, r));
    out.push(endMarker(child.x, cy, 1, 0, childEnd));
    out.push(endMarker(r.attachX, users.y + users.h, 0, -1, parentEnd));
  } else if (r.kind === "intra") {
    const ex = child.x + child.w;
    const pts = [[ex, cy], [r.laneX, cy], [r.laneX, r.parentY], [r.parentX, r.parentY]];
    out.push(relLine(pts, r));
    out.push(endMarker(ex, cy, -1, 0, childEnd));
    out.push(endMarker(r.parentX, r.parentY, -1, 0, parentEnd));
  } else {
    const ex = child.x + child.w;
    const pts = [[ex, cy], [r.laneX, cy], [r.laneX, r.parentY], [r.parentX, r.parentY]];
    out.push(relLine(pts, r));
    out.push(endMarker(ex, cy, -1, 0, childEnd));
    out.push(endMarker(r.parentX, r.parentY, 1, 0, parentEnd));
  }
}

/* tables on top of the lines' ends */
const tablesSvg = [drawTable("users", users, { columnsPerSide: USERS_COLS })];
for (const list of LAYOUT) for (const t of list) tablesSvg.push(drawTable(t, pos[t]));

/* group captions */
const captions = LAYOUT.map((list, k) => `<text x="${colX[k] + TW / 2}" y="${tablesTop - 14}" class="group">${esc(GROUP_LABELS[k])}</text>`);

/* legend */
const bottom = Math.max(...LAYOUT.flat().map((t) => pos[t].y + pos[t].h));
let ly = bottom + 50;
const leg = [];
leg.push(`<text x="40" y="${ly}" class="lh">How to read it (crow's foot notation)</text>`);
ly += 26;
const sample = (x0, y0, kindEnd, text) => {
  leg.push(`<line x1="${x0}" y1="${y0}" x2="${x0 + 70}" y2="${y0}" stroke="${C.line}" stroke-width="1.4"/>`);
  leg.push(`<line x1="${x0 + 70}" y1="${y0 - 10}" x2="${x0 + 70}" y2="${y0 + 10}" stroke="${C.navy}" stroke-width="2"/>`);
  leg.push(endMarker(x0 + 70, y0, 1, 0, kindEnd));
  leg.push(`<text x="${x0 + 84}" y="${y0 + 4}" class="lt">${esc(text)}</text>`);
};
sample(40, ly, "one", "exactly one (the foreign key is required)");
sample(460, ly, "zeroOne", "zero or one (optional foreign key, or a unique one)");
sample(900, ly, "many", "zero or many");
ly += 28;
leg.push(`<text x="40" y="${ly}" class="lt"><tspan fill="${C.pk}" font-weight="700">PK</tspan> primary key · <tspan fill="${C.fk}" font-weight="700">FK</tspan> foreign key (a line to the table it refers to) · <tspan fill="${C.muted}" font-weight="700">UQ</tspan> unique · "?" after a type = can be empty (NULL) · enum = one value from a fixed list · boolean = tinyint(1)</text>`);
ly += 34;
leg.push(`<text x="40" y="${ly}" class="lh">References kept by the application, not by a foreign key (no line drawn)</text>`);
for (const [t, cols, target] of LOGICAL_REFS) {
  ly += 17;
  leg.push(`<text x="40" y="${ly}" class="lt"><tspan font-weight="700">${esc(t)}</tspan>.${esc(cols)} → ${esc(target)}</text>`);
}
ly += 30;
leg.push(`<text x="40" y="${ly}" class="lt">Drawn from the live database structure on ${esc(schema.takenAt)}: ${Object.keys(schema.tables).length} tables, ${Object.values(schema.tables).reduce((a, t) => a + t.columns.length, 0)} columns, ${schema.foreignKeys.length} foreign keys. Regenerate with: node docs/diagrams/build-erd.js</text>`);
const H = ly + 30;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Poppins, 'Segoe UI', Arial, sans-serif">
  <style>
    .title { font-size: 26px; font-weight: 700; fill: #0C1D4A; }
    .subtitle { font-size: 13px; fill: #4B5563; }
    .tname { font-size: 13.5px; font-weight: 700; fill: #FFFFFF; text-anchor: middle; }
    .key { font-size: 9px; font-weight: 700; }
    .cname { font-size: 10.5px; fill: #111827; }
    .cname.pk { font-weight: 700; fill: #0C1D4A; }
    .cname.fk { fill: #0072CE; font-weight: 600; }
    .ctype { font-size: 9.5px; fill: #6B7280; text-anchor: end; }
    .rel { fill: none; stroke: #0C1D4A; stroke-width: 1.2; opacity: 0.85; }
    .group { font-size: 13px; font-weight: 700; fill: #0072CE; text-anchor: middle; }
    .lh { font-size: 14px; font-weight: 700; fill: #0C1D4A; }
    .lt { font-size: 11.5px; fill: #374151; }
  </style>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
  <text x="40" y="52" class="title">Taskify — Entity-relationship diagram</text>
  <text x="40" y="76" class="subtitle">Every table, column and foreign key in the live MySQL database. Lines are foreign keys; most tables refer to users, which sits across the top.</text>
  <text x="40" y="96" class="subtitle">Payments are a demo: payments, sale_orders and equipment_bookings record statuses only — no money moves.</text>
  ${out.join("\n  ")}
  ${tablesSvg.join("\n  ")}
  ${captions.join("\n  ")}
  ${leg.join("\n  ")}
</svg>
`;

/* every foreign key drawn exactly once */
if (rels.length !== schema.foreignKeys.length) throw new Error("not every foreign key was drawn");
fs.writeFileSync(path.join(__dirname, "erd.svg"), svg);
console.log(`OK — ${Object.keys(schema.tables).length} tables, ${schema.foreignKeys.length} relationships. Wrote erd.svg (${Math.round(W)} × ${Math.round(H)})`);
