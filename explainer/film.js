/* ============================================================
   Taskify explainer — the film.

   Draws the stage around the real app (app.html in the iframe): the
   camera, scene titles, callouts, status journeys, the brand intro and
   end card, captions, and the player. Everything is a pure function of
   the film time t, via render(t).

     index.html              → player (play/pause, scrub, captions, voice)
     index.html?render=1     → export mode, driven by tools/export-mp4.mjs
     index.html?t=33         → open paused at 33 s (handy while editing)
============================================================ */
(function () {
  "use strict";

  const C = window.FILM_CUES;
  const T = C.T;
  const DUR = C.DURATION;
  const params = new URLSearchParams(location.search);
  const RENDER = params.has("render");
  const $ = (s, r = document) => r.querySelector(s);

  /* ── Time helpers (same curves as the app's --ease-out / --ease-in-out) ── */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) { const e = sx(u) - x; if (Math.abs(e) < 1e-5) break; const d = dx(u); if (Math.abs(d) < 1e-6) break; u -= e / d; }
      return sy(Math.min(1, Math.max(0, u)));
    };
  }
  const E = { out: bezier(0.23, 1, 0.32, 1), inOut: bezier(0.77, 0, 0.175, 1), soft: bezier(0.45, 0, 0.25, 1), back: bezier(0.34, 1.4, 0.64, 1) };
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp01((t - a) / d));
  const within = (t, a, b) => t >= a && t < b;
  /* In over `inD`, out over `outD`: 0→1→0 envelope for things shown from a to b. */
  const env = (t, a, b, inD = 0.4, outD = 0.3) => E.out(prog(t, a, inD)) * (1 - prog(t, b - outD, outD));

  function setStyle(el, css) { for (const k in css) if (el.style[k] !== css[k]) el.style[k] = css[k]; }

  /* ── Stage ── */
  const stage = $("#stage"), world = $("#world"), browser = $("#browser"), frameEl = $("#app");
  const FRAME = { x: 240, y: 67 + 46 };   // where the app's (0,0) sits on the stage at camera rest
  const APP_CENTER = [720, 450];

  function fit() {
    const s = RENDER ? 1 : Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
  }
  addEventListener("resize", fit);
  fit();
  if (RENDER) document.body.classList.add("render");

  let App = null;     // FilmApp inside the iframe

  /* ── Camera ──
     Each key: time, zoom, what to look at (an app selector or app x/y),
     and where on the stage that point should sit (default: centre). */
  const MID = [960, 540], LEFT_ROOM = [1110, 540];
  const CAM = [
    { t: 0, z: 0.9, f: APP_CENTER },
    { t: T.frameSettled, z: 0.9, f: APP_CENTER },
    // Lean into the real sidebar while the three modules are named
    { t: T.chipTasks + 0.2, z: 1.65, f: [300, 290], a: [640, 500] },
    { t: T.navTasksClick - 0.2, z: 1.65, f: [300, 290], a: [640, 500] },
    { t: T.navTasksClick + 0.3, z: 1.0, f: APP_CENTER },
    // Tasks
    { t: T.tasksPage + 0.5, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: 12.3, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: 13.4, z: 1.75, f: "#scr-tasks [data-card='task-41']" },
    { t: T.tasksViewClick + 0.15, z: 1.75, f: "#scr-tasks [data-card='task-41']" },
    { t: T.taskDetail + 0.6, z: 1.1, f: APP_CENTER },
    { t: T.taskReadPan + 0.3, z: 1.1, f: APP_CENTER },
    { t: 17.0, z: 1.6, f: "#scr-taskDetail .detail-description", a: [900, 560] },
    { t: T.taskSummaryPan, z: 1.6, f: "#scr-taskDetail .detail-description", a: [900, 560] },
    { t: 19.1, z: 1.95, f: "#applyForTaskButton", a: [960, 520] },
    { t: T.applyModal + 0.1, z: 1.95, f: "#applyForTaskButton", a: [960, 520] },
    { t: T.applyModal + 0.7, z: 1.75, f: "#offerModal" },
    { t: T.applySent + 0.2, z: 1.75, f: "#offerModal" },
    { t: T.applySent + 1.3, z: 1.55, f: "#offersSection", a: [960, 600] },
    { t: T.taskJourney, z: 1.55, f: "#offersSection", a: [960, 600] },
    { t: T.taskJourney + 0.7, z: 0.92, f: APP_CENTER },
    { t: T.navSalesClick - 0.2, z: 1.0, f: APP_CENTER },
    // Sales
    { t: T.salesPage + 0.5, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: 30.0, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: T.salesSearchFocus + 0.3, z: 1.55, f: "#salesSearchInput", a: [900, 330] },
    { t: T.salesFiltered + 0.2, z: 1.55, f: "#salesSearchInput", a: [900, 330] },
    { t: T.salesViewClick, z: 1.5, f: "#scr-sales [data-role=grid]", a: [960, 500] },
    { t: T.saleDetail + 0.6, z: 1.1, f: APP_CENTER },
    { t: T.saleSummaryPan + 0.2, z: 1.1, f: APP_CENTER },
    { t: 35.8, z: 1.75, f: "#scr-saleDetail [data-role=sale-actions-before] .pay-panel", a: [880, 560] },
    { t: T.buyClick - 0.3, z: 1.75, f: "#buyProtectedButton", a: [880, 420] },
    { t: T.buyModal + 0.6, z: 1.7, f: "#buyModal" },
    { t: T.simulateClick + 0.2, z: 1.7, f: "#buyModal" },
    { t: T.paymentHeld + 0.8, z: 1.35, f: [930, 590] },
    { t: T.salesBackClick - 0.1, z: 1.35, f: [930, 590] },
    { t: T.salesBack + 0.3, z: 1.0, f: APP_CENTER },
    { t: T.navRentalsClick + 0.1, z: 1.0, f: APP_CENTER },
    // Rentals
    { t: T.rentalsPage + 0.5, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: 46.0, z: 0.8, f: APP_CENTER, a: LEFT_ROOM },
    { t: T.rentalsHover + 0.4, z: 1.75, f: "#scr-rentals [data-card='equip-25']" },
    { t: T.rentalsViewClick + 0.15, z: 1.75, f: "#scr-rentals [data-card='equip-25']" },
    { t: T.rentalDetail + 0.6, z: 1.1, f: APP_CENTER },
    { t: T.rentalSummaryPan + 0.2, z: 1.1, f: APP_CENTER },
    { t: 49.9, z: 1.75, f: "#scr-rentalDetail .detail-summary", a: [960, 470] },
    { t: T.bookingModal, z: 1.75, f: "#scr-rentalDetail .detail-summary", a: [960, 470] },
    { t: T.bookingModal + 0.6, z: 1.55, f: "#bookingModal", a: [960, 560] },
    { t: T.quoteIn + 0.2, z: 1.55, f: "#bookingModal", a: [960, 560] },
    { t: T.quoteIn + 0.9, z: 1.85, f: "#bookingQuote .money-breakdown", a: [960, 520] },
    { t: T.quoteIn + 1.5, z: 1.85, f: "#bookingQuote .money-breakdown", a: [960, 520] },
    { t: T.sendRequestClick - 0.2, z: 1.6, f: "#bookingSubmitButton", a: [960, 640] },
    { t: T.requestSent + 0.2, z: 1.6, f: "#bookingSubmitButton", a: [960, 640] },
    { t: T.rentalJourney + 0.5, z: 0.92, f: APP_CENTER },
    { t: T.navDashClick - 0.2, z: 1.0, f: APP_CENTER },
    // Bigger picture
    { t: T.pullBack, z: 1.0, f: APP_CENTER },
    { t: T.pullBack + 1.4, z: 0.66, f: APP_CENTER, a: [960, 372] },
    { t: DUR, z: 0.62, f: APP_CENTER, a: [960, 372] }
  ];

  function camPoint(key, t) {
    if (Array.isArray(key.f)) return { x: key.f[0], y: key.f[1] };
    const r = App.locate(key.f, key.t);
    if (!r || (!r.w && !r.h)) return key._last || { x: APP_CENTER[0], y: APP_CENTER[1] };
    key._last = { x: r.cx, y: r.cy };
    return key._last;
  }

  function cameraAt(t) {
    let i = 0;
    while (i + 1 < CAM.length && t >= CAM[i + 1].t) i++;
    const a = CAM[i], b = CAM[i + 1] || a;
    const p = b === a ? 0 : E.soft(prog(t, a.t, b.t - a.t));
    const fa = camPoint(a, t), fb = camPoint(b, t);
    const aa = a.a || MID, ab = b.a || MID;
    // Zoom moves in log space so zooming in and out feel equally even.
    const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), p));
    return { z, fx: lerp(fa.x, fb.x, p), fy: lerp(fa.y, fb.y, p), ax: lerp(aa[0], ab[0], p), ay: lerp(aa[1], ab[1], p) };
  }

  // App px → stage px under the camera.
  const toStage = (cam, x, y) => ({ x: cam.ax + cam.z * (x - cam.fx), y: cam.ay + cam.z * (y - cam.fy) });

  /* ── Brand logo (taskify-motion.js geometry, played frame by frame) ── */
  function mountLogo(el, marketColor) {
    const svg = TaskifyMotion.mountReveal(el, { color: "#FFFFFF", marketColor, autoplay: false });
    svg.querySelectorAll(".tk-circle, .tk-wheel, .tk-t").forEach((n) => { n.style.transformBox = "fill-box"; n.style.transformOrigin = "center"; });
    return svg;
  }
  const introSvg = mountLogo($("#introLogo"), "#3FD3A6");
  const endSvg = mountLogo($("#endLogo"), "#3FD3A6");

  /* playReveal() from taskify-motion.js as a function of milliseconds. */
  function revealAt(svg, ms) {
    const q = (s) => svg.querySelector(s);
    const pc = E.out(prog(ms, 0, 520));
    setStyle(q(".tk-circle"), { transform: `scale(${0.82 + 0.18 * pc})`, opacity: String(pc) });
    const cart = E.inOut(prog(ms, 260, 760));
    setStyle(q(".tk-cart"), { strokeDasharray: "1", strokeDashoffset: String(1 - cart) });
    svg.querySelectorAll(".tk-wheel").forEach((w, i) => {
      const p = E.out(prog(ms, 860 + i * 70, 380));
      const s = p < 0.6 ? lerp(0.6, 1.12, p / 0.6) : lerp(1.12, 1, (p - 0.6) / 0.4);
      setStyle(w, { transform: `scale(${s})`, opacity: String(clamp01(p / 0.6)) });
    });
    const tp = prog(ms, 1080, 620);
    let ty, sy = 1;
    if (tp < 0.35) ty = lerp(-22, -8, E.inOut(tp / 0.35));
    else if (tp < 0.68) { const k = (tp - 0.35) / 0.33; ty = lerp(-8, 1.2, k * k * k); sy = lerp(1, 0.95, k); }
    else { const k = E.out((tp - 0.68) / 0.32); ty = lerp(1.2, 0, k); sy = lerp(0.95, 1, k); }
    setStyle(q(".tk-t"), { transform: `translateY(${ty}px) scaleY(${sy})`, opacity: String(clamp01(tp / 0.35)) });
    const mv = E.inOut(prog(ms, 1760, 700));
    setStyle(q(".tk-icon-move"), { transform: `translateX(${103.85 * (1 - mv)}px)` });
    const wp = E.out(prog(ms, 1960, 720));
    setStyle(q(".tk-word"), { transform: `translateX(${-26 * (1 - wp)}px)`, opacity: String(wp), clipPath: `inset(0 ${100 * (1 - wp)}% 0 0)` });
    const mp = E.out(prog(ms, 2380, 520));
    setStyle(q(".tk-market"), { transform: `translateY(${5 * (1 - mp)}px)`, opacity: String(mp) });
  }

  /* ── Scene titles ── */
  const KICKERS = [
    { a: T.tasksPage + 0.15, b: 12.9, num: "01", title: "Tasks", line: "Find help. Offer your skills.", icon: "ti-clipboard-list", c: "var(--green)" },
    { a: T.salesPage + 0.15, b: 30.5, num: "02", title: "Sales", line: "Buy and sell on campus.", icon: "ti-shopping-cart", c: "var(--blue)" },
    { a: T.rentalsPage + 0.15, b: 46.4, num: "03", title: "Rentals", line: "Use it when you need it.", icon: "ti-package", c: "var(--gold)" }
  ];
  const kicker = $("#kicker");

  /* ── Callouts: a label + ring attached to a real element ── */
  const CALLOUTS = [
    // Scene 1: the three modules in the real sidebar
    { a: T.chipTasks, b: T.chipsOut, sel: "[data-nav=tasks]", text: "Tasks", sub: "Get help or earn with your skills", icon: "ti-clipboard-list", c: "var(--green)", side: "right", ring: false, inline: true },
    { a: T.chipSales, b: T.chipsOut, sel: "[data-nav=sales]", text: "Sales", sub: "Buy and sell within campus", icon: "ti-shopping-cart", c: "var(--blue)", side: "right", ring: false, inline: true },
    { a: T.chipRentals, b: T.chipsOut, sel: "[data-nav=rentals]", text: "Rentals", sub: "Borrow equipment when you need it", icon: "ti-package", c: "var(--gold)", side: "right", ring: false, inline: true },
    // Tasks
    { a: 16.9, b: T.taskSummaryPan + 0.2, sel: "#scr-taskDetail .detail-description", text: "What needs doing, where and when", icon: "ti-align-left", c: "var(--green)", side: "top", ring: true },
    { a: 18.9, b: T.applyClick, sel: "#scr-taskDetail .detail-summary .market-price", text: "Budget shown up front", icon: "ti-coin", c: "var(--green)", side: "left", ring: true },
    { a: T.applySent + 1.2, b: T.taskJourney + 0.1, sel: "#offersSection .offer-card", text: "The poster chooses who does it", icon: "ti-users", c: "var(--green)", side: "top", ring: true },
    // Sales
    { a: T.salesTypeEnd - 0.2, b: T.salesViewClick - 0.2, sel: "#scr-sales [data-role=grid]", text: "Textbooks from students on campus", icon: "ti-books", c: "var(--blue)", side: "right", ring: false },
    { a: 35.9, b: T.buyClick - 0.2, sel: "#scr-saleDetail [data-role=sale-actions-before] .pay-panel", text: "Money is held until handover", icon: "ti-shield-lock", c: "var(--blue)", side: "left", ring: true, demo: true },
    { a: T.buyModal + 0.8, b: T.simulateClick, sel: "#buyModal .money-breakdown", text: "R350 item + 3% protection fee", icon: "ti-receipt", c: "var(--blue)", side: "left", ring: true, demo: true },
    { a: T.paymentHeld + 0.9, b: T.salesBackClick, sel: "#scr-saleDetail .handover-code", text: "Show this code once you have the item", icon: "ti-key", c: "var(--blue)", side: "left", ring: true },
    // Rentals
    { a: 49.9, b: T.requestClick, sel: "#scr-rentalDetail .detail-summary .market-price", text: "Priced per day", icon: "ti-calendar-dollar", c: "var(--gold)", side: "left", ring: true },
    { a: T.quoteIn + 0.9, b: T.quoteIn + 1.5, sel: "#bookingQuote .money-breakdown", text: "2 days · R240 rent + R12 fee", icon: "ti-receipt", c: "var(--gold)", side: "left", ring: true },
    { a: T.sendRequestClick - 0.3, b: T.requestSent + 0.1, sel: "#bookingSubmitButton", text: "Free to request. Pay only once approved.", icon: "ti-circle-check", c: "var(--gold)", side: "left", ring: false, demo: true }
  ];
  const callLayer = $("#callouts"), ringLayer = $("#highlights");
  CALLOUTS.forEach((c) => {
    c.el = document.createElement("div");
    c.el.className = "callout" + (c.inline ? " inline" : "");
    c.el.style.setProperty("--c", c.c);
    const sub = c.sub ? (c.inline ? ` <span class="inl">${c.sub}</span>` : `<small>${c.sub}</small>`) : "";
    c.el.innerHTML = `<span class="ci"><i class="ti ${c.icon}"></i></span><span>${c.text}${sub}</span>${c.demo ? `<span class="demo">Demo</span>` : ""}`;
    c.el.style.opacity = "0";
    callLayer.appendChild(c.el);
    if (c.ring) {
      c.ringEl = document.createElement("div");
      c.ringEl.className = "hl";
      c.ringEl.style.setProperty("--c", c.c);
      c.ringEl.style.opacity = "0";
      ringLayer.appendChild(c.ringEl);
    }
  });

  function drawCallouts(t, cam) {
    for (const c of CALLOUTS) {
      const o = env(t, c.a, c.b, 0.35, 0.25);
      if (o <= 0) { c.el.style.opacity = "0"; if (c.ringEl) c.ringEl.style.opacity = "0"; continue; }
      const r = App.locate(c.sel, t);
      if (!r || !r.w) { c.el.style.opacity = "0"; continue; }
      const p0 = toStage(cam, r.x, r.y), p1 = toStage(cam, r.x + r.w, r.y + r.h);
      const w = c.el.offsetWidth, h = c.el.offsetHeight, gap = 22;
      let x, y;
      if (c.side === "right") { x = p1.x + gap; y = (p0.y + p1.y) / 2 - h / 2; }
      else if (c.side === "left") { x = p0.x - gap - w; y = (p0.y + p1.y) / 2 - h / 2; }
      else if (c.side === "top") { x = (p0.x + p1.x) / 2 - w / 2; y = p0.y - gap - h; }
      else { x = (p0.x + p1.x) / 2 - w / 2; y = p1.y + gap; }
      x = Math.max(30, Math.min(1890 - w, x));
      y = Math.max(30, Math.min(1050 - h, y));
      const nudge = (1 - E.out(prog(t, c.a, 0.35))) * 14;
      const dx = c.side === "right" ? -nudge : c.side === "left" ? nudge : 0;
      const dy = c.side === "top" ? nudge : c.side === "bottom" ? -nudge : 0;
      setStyle(c.el, { opacity: String(o), transform: `translate(${x + dx}px, ${y + dy}px)` });
      if (c.ringEl) {
        const pad = 8;
        setStyle(c.ringEl, {
          opacity: String(o), left: `${p0.x - pad}px`, top: `${p0.y - pad}px`,
          width: `${p1.x - p0.x + pad * 2}px`, height: `${p1.y - p0.y + pad * 2}px`
        });
      }
    }
  }

  /* ── Status journeys (real statuses from the app) ── */
  const JOURNEYS = [
    { a: T.taskJourney, b: T.taskJourneyOut, chip: "Tasks", title: "How a task moves", c: "var(--green)",
      note: "Payments in this version are simulated (demo mode), so no real money moves.",
      steps: [
        ["ti-clipboard-plus", "Posted", "blue", "A student posts the task"],
        ["ti-user-check", "Accepted", "gold", "The poster chooses who does it"],
        ["ti-player-play", "In Progress", "gold", "The work gets started"],
        ["ti-hourglass", "Awaiting Confirmation", "gold", "Marked as done"],
        ["ti-circle-check", "Completed", "green", "The poster confirms it"]
      ] },
    { a: T.rentalJourney, b: T.rentalJourneyOut, chip: "Rentals", title: "How a rental moves", c: "var(--gold)",
      note: "Payments in this version are simulated (demo mode), so no real money moves.",
      steps: [
        ["ti-send", "Requested", "gold", "You pick dates and ask"],
        ["ti-credit-card", "Awaiting payment", "gold", "The owner approves, then you pay"],
        ["ti-package", "Ready for collection", "blue", "Meet up and collect it"],
        ["ti-clock", "Out on rent", "blue", "Use it, return by 18:00"],
        ["ti-circle-check", "Completed", "green", "Returned and condition checked"]
      ] }
  ];
  const journeyEl = $("#journey");
  let journeyBuilt = null;
  function buildJourney(j) {
    if (journeyBuilt === j) return;
    journeyBuilt = j;
    journeyEl.style.setProperty("--c", j.c);
    $("#journeyChip").textContent = j.chip;
    $("#journeyTitle").textContent = j.title;
    $("#journeyNote").innerHTML = `<i class="ti ti-info-circle"></i>${j.note}`;
    $("#journeyTrack").innerHTML = `<div class="journey-line"><div class="journey-line-fill"></div></div>` +
      j.steps.map(([icon, label, tone, cap]) => `
        <div class="jstep"><div class="jnode"><i class="ti ${icon}"></i></div>
          <span class="jbadge" data-tone="${tone}">${label}</span><span class="jcap">${cap}</span></div>`).join("");
  }
  function drawJourney(t) {
    const j = JOURNEYS.find((x) => within(t, x.a - 0.1, x.b + 0.4));
    if (!j) { journeyEl.style.opacity = "0"; return 0; }
    buildJourney(j);
    const o = env(t, j.a, j.b, 0.45, 0.35);
    setStyle(journeyEl, { opacity: String(o), transform: `translate(-50%, calc(-50% + ${(1 - E.out(prog(t, j.a, 0.45))) * 30}px)) scale(${0.97 + 0.03 * E.out(prog(t, j.a, 0.45))})` });
    const steps = journeyEl.querySelectorAll(".jstep");
    let lit = 0;
    steps.forEach((s, i) => {
      const on = t >= j.a + 0.3 + i * 0.62;
      if (on) lit = i;
      s.classList.toggle("on", on);
      const b = s.querySelector(".jbadge");
      b.className = "jbadge" + (on ? " " + b.dataset.tone : "");
      const pop = E.back(prog(t, j.a + 0.3 + i * 0.62, 0.35));
      s.querySelector(".jnode").style.transform = on ? `scale(${0.85 + 0.15 * pop})` : "scale(0.85)";
    });
    const fillP = clamp01((t - j.a - 0.3) / (0.62 * (steps.length - 1)));
    journeyEl.querySelector(".journey-line-fill").style.width = `${E.soft(fillP) * 100}%`;
    return o;
  }

  /* ── The bigger picture: three modules ── */
  const MODULES = [
    { at: T.moduleTasks, title: "Tasks", line: "Find help or earn with your skills", icon: "ti-clipboard-list", c: "#009B72" },
    { at: T.moduleSales, title: "Sales", line: "Discover your next purchase", icon: "ti-shopping-cart", c: "#0072CE" },
    { at: T.moduleRentals, title: "Rentals", line: "Rent what you need, when you need it", icon: "ti-package", c: "#F5B400" }
  ];
  const modLayer = $("#modules");
  MODULES.forEach((m, i) => {
    m.el = document.createElement("div");
    m.el.className = "module";
    m.el.style.setProperty("--c", m.c);
    m.el.style.left = `${170 + i * 540}px`;
    m.el.innerHTML = `<div class="module-glow"></div><div class="module-icon"><i class="ti ${m.icon}"></i></div><h3>${m.title}</h3><p>${m.line}</p>`;
    modLayer.appendChild(m.el);
  });

  /* ── Captions (from cues.js; real line lengths from audio/timing.json when built) ── */
  let lineDurations = {};
  function captionChunks() {
    const out = [];
    for (const n of C.NARRATION) {
      const dur = lineDurations[n.id] || Math.min(n.end - n.start, n.text.length * 0.066);
      const parts = n.text.match(/[^,.?—]+[,.?—]?/g).map((s) => s.trim()).filter(Boolean);
      // Join short pieces so each caption is a comfortable length.
      const chunks = [];
      for (const p of parts) {
        if (chunks.length && (chunks[chunks.length - 1].length + p.length < 58)) chunks[chunks.length - 1] += " " + p;
        else chunks.push(p);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      let t = n.start;
      for (const c of chunks) { const d = dur * (c.length / total); out.push({ a: t, b: t + d, text: c.replace(/[,—]$/, "").trim() }); t += d; }
    }
    return out;
  }
  let CAPTIONS = captionChunks();
  let captionsOn = params.get("captions") === "1";
  const captionText = $("#captionText");

  /* ── One frame ── */
  let lastUrl = "";
  function render(t) {
    t = Math.max(0, Math.min(DUR, t));
    const appState = App.render(t);
    const cam = cameraAt(t);

    // Browser entrance (scene 1) and exit (end card)
    const rise = E.out(prog(t, T.frameIn, T.frameSettled - T.frameIn));
    const exit = E.inOut(prog(t, T.endCard - 0.2, 0.9));
    const tilt = within(t, T.pullBack, DUR) ? E.soft(prog(t, T.pullBack, 1.4)) * 10 : 0;
    const bOpacity = rise * (1 - exit);
    setStyle(browser, {
      opacity: String(bOpacity),
      visibility: bOpacity > 0 ? "visible" : "hidden",
      transform: `translateY(${(1 - rise) * 760 + exit * -40}px) perspective(2600px) rotateX(${(1 - rise) * 30 + tilt}deg) scale(${(0.86 + 0.14 * rise) * (1 - 0.06 * exit)})`
    });
    const px = FRAME.x + cam.fx, py = FRAME.y + cam.fy;
    setStyle(world, { transform: `translate(${cam.ax}px, ${cam.ay}px) scale(${cam.z}) translate(${-px}px, ${-py}px)` });

    if (appState.url !== lastUrl) { $("#urlText").textContent = "taskify-marketplace.co.za/" + appState.url; lastUrl = appState.url; }

    // Intro logo
    const introO = 1 - E.inOut(prog(t, T.logoOut, 0.7));
    setStyle($("#intro"), { opacity: String(introO), transform: `translateY(${-E.inOut(prog(t, T.logoOut, 0.8)) * 260}px) scale(${1 - 0.25 * E.inOut(prog(t, T.logoOut, 0.8))})`, visibility: introO > 0 ? "visible" : "hidden" });
    if (introO > 0) revealAt(introSvg, (t - T.logoIn) * 1000 * 1.15);
    const tg = E.out(prog(t, T.taglineIn, 0.6));
    setStyle($("#introTagline"), { opacity: String(tg), transform: `translateY(${(1 - tg) * 18}px)` });

    // Background accent follows the module on screen
    const accent = within(t, T.tasksPage, T.salesPage) ? 0 : within(t, T.salesPage, T.rentalsPage) ? 1 : within(t, T.rentalsPage, T.dashBack) ? 2 : -1;
    const g1 = document.querySelector(".bg-glow.g1"), g2 = document.querySelector(".bg-glow.g2"), g3 = document.querySelector(".bg-glow.g3");
    setStyle(g1, { opacity: String(accent === 0 ? 0.5 : 0.32), transform: `translate(${Math.sin(t * 0.21) * 40}px, ${Math.cos(t * 0.17) * 30}px)` });
    setStyle(g2, { opacity: String(accent === 1 ? 0.5 : 0.3), transform: `translate(${Math.cos(t * 0.19) * 40}px, ${Math.sin(t * 0.23) * 30}px)` });
    setStyle(g3, { opacity: String(accent === 2 ? 0.2 : 0) });

    // Scene titles
    const k = KICKERS.find((x) => within(t, x.a, x.b + 0.1));
    if (k) {
      if (kicker.dataset.num !== k.num) {
        kicker.dataset.num = k.num;
        $("#kickerNum").textContent = k.num;
        $("#kickerTitle").textContent = k.title;
        $("#kickerLine").textContent = k.line;
        $("#kickerIcon").innerHTML = `<i class="ti ${k.icon}"></i>`;
        kicker.style.setProperty("--c", k.c);
      }
      const ko = env(t, k.a, k.b, 0.5, 0.4);
      setStyle(kicker, { opacity: String(ko), transform: `translateX(${(1 - E.out(prog(t, k.a, 0.6))) * -50}px)` });
    } else kicker.style.opacity = "0";

    drawCallouts(t, cam);
    const jo = drawJourney(t);
    setStyle($("#browserDim"), { opacity: String(jo * 0.55) });

    // Three modules
    const modsOut = E.inOut(prog(t, T.endCard - 0.2, 0.7));
    MODULES.forEach((m, i) => {
      const p = E.out(prog(t, m.at, 0.6));
      const lit = t >= m.at && (i === MODULES.length - 1 || t < MODULES[i + 1].at);
      setStyle(m.el, { opacity: String(p * (1 - modsOut)), transform: `translateY(${(1 - p) * 60 + modsOut * 30}px) scale(${lit ? 1.03 : 1})` });
      setStyle(m.el.querySelector(".module-glow"), { opacity: lit ? "1" : "0" });
    });

    // End card
    const endO = E.out(prog(t, T.endCard, 0.6));
    setStyle($("#endcard"), { opacity: String(endO), visibility: endO > 0 ? "visible" : "hidden" });
    if (endO > 0) revealAt(endSvg, (t - T.endCard) * 1000);
    document.querySelectorAll(".end-word").forEach((w, i) => {
      const p = E.out(prog(t, T.endLines + i * 0.32, 0.5));
      setStyle(w, { opacity: String(p), transform: `translateY(${(1 - p) * 16}px)` });
    });
    const tl = E.out(prog(t, T.endTagline, 0.6));
    setStyle($("#endTagline"), { opacity: String(tl), transform: `translateY(${(1 - tl) * 14}px)` });
    setStyle($("#endLogo"), { transform: `scale(${1 + 0.02 * prog(t, T.endCard + 3, DUR - T.endCard - 3)})` });
    setStyle($("#fade"), { opacity: String(E.inOut(prog(t, T.fadeOut, DUR - T.fadeOut))) });

    // Captions
    const cap = captionsOn ? CAPTIONS.find((c) => within(t, c.a, c.b + 0.15)) : null;
    if (captionText.textContent !== (cap ? cap.text : "")) captionText.textContent = cap ? cap.text : "";
    captionText.style.opacity = cap ? "1" : "0";
  }

  /* ── Startup: wait for the app layer, fonts and timing ── */
  const ready = (async () => {
    // The iframe may finish loading before or after this runs, so poll.
    while (!frameEl.contentWindow || !frameEl.contentWindow.FilmApp) await new Promise((r) => setTimeout(r, 25));
    App = frameEl.contentWindow.FilmApp;
    await App.ready;
    await document.fonts.ready;
    try { await document.fonts.load("800 40px Poppins"); await document.fonts.load("20px tabler-icons"); } catch (e) { /* optional */ }
    try {
      const res = await fetch("./audio/timing.json", { cache: "no-store" });
      if (res.ok) { lineDurations = (await res.json()).lines || {}; CAPTIONS = captionChunks(); }
    } catch (e) { /* no audio built yet: captions use estimates */ }
  })();

  if (RENDER) {
    window.__film = { ready, duration: DUR, fps: C.FPS, seek: (t) => { render(t); return t; } };
    ready.then(() => render(Number(params.get("t")) || 0));
    return;
  }

  /* ============================================================
     Player
  ============================================================ */
  const audio = $("#track");
  const playBtn = $("#playBtn"), scrub = $("#scrub"), timeText = $("#timeText"), controls = $("#controls"), poster = $("#poster");
  let playing = false, baseT = Number(params.get("t")) || 0, basePerf = 0, audioOK = false, voiceMode = "track", lastT = 0;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  scrub.max = String(DUR);
  $("#sceneMarks").innerHTML = C.SCENES.slice(1).map((s) => `<span style="left:${(s.start / DUR) * 100}%">${s.label}</span>`).join("");

  function setTrack(mode) {
    voiceMode = mode;
    const src = mode === "track" ? "./audio/soundtrack.wav" : "./audio/music-sfx.wav";
    const keep = now();
    audioOK = false;
    audio.src = src;
    audio.addEventListener("canplay", () => { audioOK = true; audio.currentTime = keep; if (playing) audio.play().catch(() => { audioOK = false; }); }, { once: true });
    audio.addEventListener("error", () => { audioOK = false; }, { once: true });
    audio.load();
    if (mode !== "live") window.speechSynthesis?.cancel();
  }

  function now() {
    if (!playing) return baseT;
    if (audioOK && !audio.paused && !audio.ended) return audio.currentTime;
    return baseT + (performance.now() - basePerf) / 1000;
  }

  function play() {
    if (now() >= DUR - 0.05) seek(0);
    playing = true;
    basePerf = performance.now();
    poster.hidden = true;
    playBtn.innerHTML = `<i class="ti ti-player-pause-filled"></i>`;
    playBtn.setAttribute("aria-label", "Pause");
    if (audioOK) { audio.currentTime = baseT; audio.play().catch(() => { audioOK = false; }); }
    requestAnimationFrame(tick);
  }
  function pause() {
    baseT = now();
    playing = false;
    audio.pause();
    window.speechSynthesis?.cancel();
    playBtn.innerHTML = `<i class="ti ti-player-play-filled"></i>`;
    playBtn.setAttribute("aria-label", "Play");
    controls.classList.remove("idle");
  }
  function seek(t) {
    baseT = Math.max(0, Math.min(DUR, t));
    basePerf = performance.now();
    lastT = baseT;
    if (audioOK) audio.currentTime = baseT;
    window.speechSynthesis?.cancel();
    draw(baseT);
  }

  function draw(t) {
    render(t);
    scrub.value = String(t);
    timeText.textContent = `${fmt(t)} / ${fmt(DUR)}`;
  }

  /* Natural browser voice (Edge has warm Microsoft "Natural" voices, including en-ZA). */
  let liveVoice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    const score = (v) => (/natural/i.test(v.name) ? 10 : 0) + (/^en-ZA/i.test(v.lang) ? 4 : /^en-GB/i.test(v.lang) ? 3 : /^en/i.test(v.lang) ? 2 : -20) + (/google/i.test(v.name) ? 1 : 0);
    liveVoice = vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speakLines(prev, t) {
    if (voiceMode !== "live" || !("speechSynthesis" in window)) return;
    for (const n of C.NARRATION) {
      if (prev < n.start && t >= n.start && t - n.start < 0.5) {
        const u = new SpeechSynthesisUtterance(n.text);
        if (liveVoice) { u.voice = liveVoice; u.lang = liveVoice.lang; }
        u.rate = 1.04;
        speechSynthesis.speak(u);
      }
    }
  }

  function tick() {
    if (!playing) return;
    let t = now();
    if (t >= DUR) { t = DUR; draw(t); pause(); baseT = DUR; poster.hidden = false; return; }
    speakLines(lastT, t);
    lastT = t;
    draw(t);
    requestAnimationFrame(tick);
  }

  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  $("#bigPlay").addEventListener("click", play);
  $("#replayBtn").addEventListener("click", () => { seek(0); if (!playing) play(); });
  scrub.addEventListener("input", () => { const was = playing; if (was) pause(); seek(Number(scrub.value)); });
  $("#ccBtn").addEventListener("click", (e) => { captionsOn = !captionsOn; e.currentTarget.setAttribute("aria-pressed", String(captionsOn)); draw(now()); });
  $("#muteBtn").addEventListener("click", (e) => {
    audio.muted = !audio.muted;
    e.currentTarget.innerHTML = `<i class="ti ${audio.muted ? "ti-volume-off" : "ti-volume"}"></i>`;
  });
  $("#voiceMode").addEventListener("change", (e) => setTrack(e.target.value));
  $("#fsBtn").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()));

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.code === "Space" || e.key === "k") { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === "ArrowRight") seek(now() + 5);
    else if (e.key === "ArrowLeft") seek(now() - 5);
    else if (e.key === "r") { seek(0); if (!playing) play(); }
    else if (e.key === "c") $("#ccBtn").click();
    else if (e.key === "m") $("#muteBtn").click();
    else if (e.key === "f") $("#fsBtn").click();
  });

  let idleTimer = null;
  addEventListener("pointermove", () => {
    controls.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (playing) controls.classList.add("idle"); }, 2500);
  });

  ready.then(() => {
    setTrack("track");
    controls.hidden = false;
    poster.hidden = baseT > 0;
    draw(baseT);
  });
})();
