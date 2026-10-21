/* Records the login test-case video against the LOCAL practice copy.

     npm run voice    (once, or after changing the narration in script.mjs)
     npm run record   → output/taskify-login-test-cases.mp4 (+ .srt)

   What it does:
   1. Puts the test student account back to a clean state (setup-account.mjs).
   2. Starts the practice backend (backend/scripts/start-test-server.js, port
      5000, local database, emails printed instead of sent) and serves the
      frontend on http://localhost:5501 — the origin .env.test allows.
   3. Opens stage/stage.html in headless Chrome. The real app runs in its
      iframe and is driven with real clicks and key presses; each actual
      result is read back from the page and checked against the expected one.
   4. Captures the screen as it plays (Chrome's screencast), then builds a
      30 fps MP4 with each narration line placed where its step started.

   Nothing here touches the live site or the live database. */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { ROOT, setupAccount } from "./setup-account.mjs";
import { TITLE, CASES, NARRATION } from "../script.mjs";

const REPO = path.resolve(ROOT, "..");
const FRONTEND = path.join(REPO, "frontend");
const STAGE = path.join(ROOT, "stage");
const OUT_DIR = path.join(ROOT, "output");
const FRAMES = path.join(OUT_DIR, "frames");
const VO = path.join(ROOT, "audio", "vo");
const OUT = path.join(OUT_DIR, "taskify-login-test-cases.mp4");
const ORIGIN = "http://localhost:5501";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const durations = JSON.parse(fs.readFileSync(path.join(VO, "durations.json"), "utf8"));
const lineById = Object.fromEntries(NARRATION.map((n) => [n.id, n]));

function findBrowser() {
  const hit = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean).find((p) => fs.existsSync(p));
  if (!hit) throw new Error("Chrome or Edge not found. Set CHROME_PATH.");
  return hit;
}

function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true))).listen(port);
  });
}

/* ── Local servers ── */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp", ".mp4": "video/mp4", ".woff2": "font/woff2" };

function startStatic() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    const [base, rel] = url.startsWith("/__stage/") ? [STAGE, url.slice(9)] : [FRONTEND, url.slice(1) || "index.html"];
    const file = path.resolve(base, rel);
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(5501, () => r(server)));
}

const serverLog = [];
function startBackend() {
  const child = spawn(process.execPath, ["backend/scripts/start-test-server.js"], { cwd: REPO, env: { ...process.env } });
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      for (const line of d.toString().split(/\r?\n/)) {
        serverLog.push(line);
        if (line.includes("Server running on")) resolve(child);
        if (line.includes("Database connection failed")) reject(new Error(line));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`practice backend exited (${code}):\n${serverLog.join("\n")}`)));
    setTimeout(() => reject(new Error("practice backend didn't start in 40s")), 40000);
  });
}

/* ── Main ── */
for (const [port, what] of [[5000, "the practice backend"], [5501, "the local frontend"]]) {
  if (!(await portFree(port))) throw new Error(`Port ${port} is in use — stop whatever is running there first (it's needed for ${what}).`);
}
const account = await setupAccount();
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const staticServer = await startStatic();
const backend = await startBackend();
console.log("Practice backend and frontend are up.");

const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  args: ["--lang=en-ZA", "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"]
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("  page error:", e.message));
let loginRequests = 0;
page.on("request", (r) => { if (r.url().includes("/auth/login")) loginRequests++; });

await page.goto(`${ORIGIN}/__stage/stage.html`, { waitUntil: "networkidle0" });
const today = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
await page.evaluate((cfg) => window.stage.init(cfg), {
  title: TITLE,
  meta: ["Local practice copy · localhost:5501", `Student: ${account.fullName} · ${account.email} · ${today}`],
  cases: CASES
});
/* Same origin as the app: this browser has already said "Not now" to the
   push-notification prompt, like a returning student's would have. */
await page.evaluate(() => localStorage.setItem("taskifyPushDismissed", "1"));
await page.evaluate(() => window.stage.load("/login.html"));
await page.evaluate(() => document.fonts.ready);
await sleep(800);

const stage = (fn, ...args) => page.evaluate((f, a) => window.stage[f](...a), fn, args);
const appUrl = () => page.evaluate(() => document.getElementById("app").contentWindow.location.href);
const appFrame = async () => (await page.$("#app")).contentFrame();
const appText = async (sel) => (await appFrame()).$eval(sel, (el) => el.textContent.trim()).catch(() => "");

async function waitFor(check, what, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what} (app at ${await appUrl()})`);
}
const waitForPage = (name) => waitFor(async () => (await appUrl()).includes(name) &&
  (await page.evaluate(() => document.getElementById("app").contentDocument.readyState)) === "complete", name);

/* ── Screen capture ── */
const frames = [];
const cdp = await page.createCDPSession();
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = path.join(FRAMES, `${String(frames.length).padStart(5, "0")}.jpg`);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, ts: metadata.timestamp || Date.now() / 1000 });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await waitFor(async () => frames.length > 0, "the first frame");
const T0 = frames[0].ts;

/* ── Narration, cursor, typing ── */
const marks = [];
function say(id) {
  const line = lineById[id];
  marks.push({ id, t: Date.now() / 1000 - T0, dur: durations[id], text: line.caption || line.say });
  stage("caption", line.caption || line.say);
  return sleep(durations[id] * 1000 + 300);
}

let cursor = { x: 690, y: 700 };
await stage("cursorTo", cursor.x, cursor.y, 0);
async function moveTo(x, y) {
  const dist = Math.hypot(x - cursor.x, y - cursor.y);
  const ms = Math.round(Math.min(1100, 350 + dist * 0.6));
  await stage("cursorTo", x, y, ms);
  await sleep(ms + 60);
  // Keep the real mouse with the drawn one, so wheel scrolls land under it.
  await page.mouse.move(x, y);
  cursor = { x, y };
}
async function centerOf(selector) {
  const frame = await appFrame();
  await frame.waitForSelector(selector, { visible: true, timeout: 10000 });
  const box = await (await frame.$(selector)).boundingBox();
  return { x: Math.round(box.x + Math.min(box.width / 2, 160)), y: Math.round(box.y + box.height / 2) };
}
async function click(selector) {
  const { x, y } = await centerOf(selector);
  await moveTo(x, y);
  await stage("ripple", x, y);
  await page.mouse.click(x, y);
  await sleep(250);
}
async function type(selector, text) {
  await click(selector);
  await page.keyboard.type(text, { delay: 75 });
  await sleep(300);
}
const pause = (ms = 500) => sleep(ms);

const results = [];
function verdict(i, ok, actual) {
  results[i] = { ok, actual };
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${i + 1}. ${CASES[i].name} — ${actual}`);
  return stage("setCase", i, ok ? "pass" : "fail", actual);
}

async function freshLogin() {
  await stage("load", "/login.html");
  await waitForPage("login.html");
  await pause(400);
}

async function logout() {
  try {
    /* The account menu sits at the foot of the sidebar, below the fold at
       this window height: scroll the sidebar down first, as a person would. */
    const side = await centerOf("#appSidebar");
    await moveTo(side.x - 60, side.y + 120);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel({ deltaY: 250 }); await sleep(120); }
    await pause(500);
    await click("#sidebarUserToggle");
    await pause(400);
    await click("#logoutButton");
    await waitForPage("login.html");
  } catch {
    // Narrow layouts hide the sidebar menu; fall back to clearing the session.
    await page.evaluate(() => document.getElementById("app").contentWindow.localStorage.clear());
    await freshLogin();
  }
  await pause(500);
}

try {
  /* Intro: title card with the test-case table, then the stage. */
  await stage("card", `<h1>${TITLE.replace("·", "—")}</h1>
    <div class="sub">Five test cases, run on a local practice copy of Taskify with a registered UMP student account.</div>
    ${await page.evaluate(() => window.stage.cardTable(false))}`);
  const intro = say("intro");
  await sleep(Math.max(4000, durations.intro * 1000 - 3500));
  await stage("card", null);
  await intro;
  await pause(400);

  /* 1. Valid login */
  await stage("setCase", 0, "running");
  let line = say("tc1");
  await pause(900);
  await type("#email", account.email);
  await type("#password", account.password);
  await line;
  await click("button[type='submit']");
  await waitFor(async () => (await appText("#loginMessage")).startsWith("Login successful"), "the login success message");
  const msg1 = await appText("#loginMessage");
  await waitForPage("dashboard.html");
  await pause(1600);
  const token = await page.evaluate(() => document.getElementById("app").contentWindow.localStorage.getItem("taskifyToken"));
  await verdict(0, !!token && (await appUrl()).includes("dashboard.html"), `"${msg1}" → dashboard opened`);
  await say("tc1r");
  await logout();

  /* 2. Wrong password */
  await stage("setCase", 1, "running");
  line = say("tc2");
  await pause(700);
  await type("#email", account.email);
  await type("#password", account.wrongPassword);
  await line;
  await click("button[type='submit']");
  await waitFor(async () => (await appText("#loginMessage")).includes("Invalid"), "the wrong-password error");
  const msg2 = await appText("#loginMessage");
  await pause(600);
  await verdict(1, msg2 === "Invalid email or password." && (await appUrl()).includes("login.html"), `Error shown: "${msg2}"`);
  await say("tc2r");
  await freshLogin();

  /* 3. Empty fields */
  await stage("setCase", 2, "running");
  line = say("tc3");
  await pause(Math.max(0, durations.tc3 * 1000 - 2200));
  const before3 = loginRequests;
  await click("button[type='submit']");
  await line;
  const errors3 = await (await appFrame()).$$eval(".field-error", (els) => els.map((e) => e.textContent.trim()));
  await verdict(2, errors3.length === 2 && loginRequests === before3, errors3.map((e) => `"${e}"`).join(" + "));
  await say("tc3r");
  await freshLogin();

  /* 4. Invalid email */
  await stage("setCase", 3, "running");
  line = say("tc4");
  await pause(1200);
  await type("#email", "abc123");
  await type("#password", account.password);
  await line;
  const before4 = loginRequests;
  await click("button[type='submit']");
  await pause(700);
  const errors4 = await (await appFrame()).$$eval(".field-error", (els) => els.map((e) => e.textContent.trim()));
  await verdict(3, errors4.length === 1 && /^Invalid email/.test(errors4[0]) && loginRequests === before4, `"${errors4.join(" ")}"`);
  await say("tc4r");
  await freshLogin();

  /* 5. Forgot password → reset → log in with the new password */
  await stage("setCase", 4, "running");
  line = say("tc5");
  await pause(2200);
  await click("a[href='./forgot-password.html']");
  await waitForPage("forgot-password.html");
  await pause(500);
  await type("#email", account.email);
  await line;
  const logMark = serverLog.length;
  await click("#submitButton");
  await waitFor(async () => (await appText("#formMessage")).startsWith("If that email"), "the reset-link confirmation");
  await waitFor(async () => serverLog.slice(logMark).some((l) => l.includes("reset-password.html?token=")), "the reset email in the server log");
  await pause(500);

  line = say("tc5a");
  await pause(Math.min(4500, durations.tc5a * 1000 * 0.45));
  const startup = serverLog.slice(0, logMark).filter((l) => /\[practice\]|Database connected|Server running/.test(l));
  const mailStart = serverLog.findIndex((l, i) => i >= logMark && l.includes("[mailer] (dev mode)"));
  const mail = serverLog.slice(mailStart).filter((l) => l.trim()).slice(0, 4);
  const linkLine = mail.find((l) => l.includes("reset-password.html?token="));
  const resetLink = linkLine.match(/https?:\/\/\S+token=[A-Za-z0-9]+/)[0];
  const [before, after] = linkLine.split(resetLink);
  await stage("terminal", true, [
    { text: "PS C:\\…\\Taskify> node backend/scripts/start-test-server.js", cls: "prompt" },
    ...startup.map((text) => ({ text, cls: "dim" })),
    { text: "", cls: "dim" },
    ...mail.filter((l) => l !== linkLine).map((text) => ({ text, cls: "mail" })),
    { before, link: resetLink, after, cls: "mail" }
  ]);
  await pause(1200);
  const lb = await stage("linkBox");
  await moveTo(Math.round(lb.x + Math.min(lb.width / 2, 300)), Math.round(lb.y + lb.height / 2));
  await stage("ripple", cursor.x, cursor.y);
  await stage("highlightLink", true);
  await line;
  const ab = await stage("addressBox");
  await moveTo(Math.round(ab.x + 260), Math.round(ab.y + ab.height / 2));
  await stage("ripple", cursor.x, cursor.y);
  await stage("terminal", false);
  await stage("pasteUrl", resetLink.replace(/^https?:\/\/[^/]+/, ORIGIN));
  await waitForPage("reset-password.html");
  await pause(600);

  line = say("tc5b");
  await pause(1500);
  await type("#newPassword", account.newPassword);
  await type("#confirmPassword", account.newPassword);
  await click("#submitButton");
  await waitFor(async () => /reset/i.test(await appText("#formMessage")) && !/Resetting/.test(await appText("#formMessage")), "the password-reset confirmation");
  const msg5 = await appText("#formMessage");
  await line;
  await waitForPage("login.html");
  await pause(700);

  line = say("tc5c");
  await pause(900);
  await type("#email", account.email);
  await type("#password", account.newPassword);
  await click("button[type='submit']");
  await waitForPage("dashboard.html");
  await pause(1200);
  const token5 = await page.evaluate(() => document.getElementById("app").contentWindow.localStorage.getItem("taskifyToken"));
  await verdict(4, !!token5 && /reset/i.test(msg5), "Reset link sent → new password set → logged in with it");
  await line;
  await pause(800);

  /* Outro: results table */
  const passed = results.filter((r) => r.ok).length;
  await stage("card", `<h1>Test results</h1>
    <div class="sub">Taskify login module · local practice copy · ${today}</div>
    ${await page.evaluate(() => window.stage.cardTable(true))}
    <div class="total">${passed} of ${CASES.length} test cases passed</div>`);
  await pause(600);
  await say("outro");
  await pause(1800);
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
}
const END = Date.now() / 1000 - T0;
await browser.close();
backend.kill();
staticServer.close();

/* ── Build the MP4 ── */
console.log(`Captured ${frames.length} frames over ${END.toFixed(1)}s. Encoding…`);
const list = ["ffconcat version 1.0"];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].ts - T0 : END;
  list.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - (f.ts - T0)).toFixed(4)}`);
});
list.push(`file '${frames.at(-1).file.replace(/\\/g, "/")}'`);
const listFile = path.join(FRAMES, "list.ffconcat");
fs.writeFileSync(listFile, list.join("\n"));

const audioInputs = marks.flatMap((m) => ["-i", path.join(VO, `${m.id}.wav`)]);
const filter = marks.map((m, i) => `[${i + 1}:a]adelay=${Math.round(m.t * 1000)}:all=1[a${i}]`).join(";") +
  `;${marks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${marks.length}:normalize=0:dropout_transition=0,apad[aout]`;
const ff = spawnSync(ffmpegPath, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", listFile, ...audioInputs,
  "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
  "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
  "-c:a", "aac", "-b:a", "192k", "-t", END.toFixed(3), "-movflags", "+faststart", OUT
], { stdio: "inherit" });
if (ff.status !== 0) throw new Error("ffmpeg failed");

const srtTime = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",");
fs.writeFileSync(OUT.replace(/\.mp4$/, ".srt"), marks.map((m, i) => `${i + 1}\n${srtTime(m.t)} --> ${srtTime(m.t + m.dur)}\n${m.text}\n`).join("\n"));
fs.rmSync(FRAMES, { recursive: true, force: true });

const passed = results.filter((r) => r.ok).length;
console.log(`\nSaved ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${END.toFixed(0)}s). ${passed}/${CASES.length} passed.`);
