/* ============================================================
   App layer of the Taskify explainer.

   Builds the Tasks, Sales and Rentals screens with the real Taskify
   markup (app-data.js) and the real stylesheets, then draws any moment
   of the film as a pure function of time:  FilmApp.render(t).

   Nothing here runs on its own clock — the player (film.js) or the MP4
   exporter calls render(t), so playback, scrubbing and export always
   show the same frame for the same t.
============================================================ */
(function () {
  "use strict";

  const C = window.FILM_CUES;
  const T = C.T;
  const D = window.FilmData;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ── Time helpers ── */

  // cubic-bezier easing (same curves as --ease-out / --ease-in-out in main.css)
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const err = sx(u) - x;
        if (Math.abs(err) < 1e-5) break;
        const d = dx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= err / d;
      }
      return sy(Math.min(1, Math.max(0, u)));
    };
  }
  const E = {
    out: bezier(0.23, 1, 0.32, 1),
    inOut: bezier(0.77, 0, 0.175, 1),
    soft: bezier(0.45, 0, 0.25, 1),
    linear: (p) => p
  };
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, start, dur) => (dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));
  const val = (v) => (typeof v === "function" ? v() : v);

  /* frames: [[time, value], …]; values may be functions (measured lazily). */
  function keys(t, frames, ease = E.soft) {
    if (t <= frames[0][0]) return val(frames[0][1]);
    for (let i = 1; i < frames.length; i++) {
      if (t < frames[i][0]) {
        const [t0, v0] = frames[i - 1];
        const [t1, v1] = frames[i];
        return lerp(val(v0), val(v1), ease((t - t0) / (t1 - t0)));
      }
    }
    return val(frames[frames.length - 1][1]);
  }
  const within = (t, a, b) => t >= a && t < b;

  /* ── Build the pages ── */

  const task = D.TASKS[0];
  const sale = D.SALES[0];
  const equip = D.EQUIPMENT[0];

  function spotlight(type, tag, image, title, meta) {
    return `
      <a class="spotlight-card ${type} has-image" style="background-image:url('${image}')">
        <div class="spotlight-card-top">
          <span class="spotlight-card-pill ${type}">${tag}</span>
          <span class="spotlight-card-icon"><i class="ti ${type === "rental" ? "ti-camera" : type === "sale" ? "ti-shopping-cart" : "ti-clipboard-check"}" aria-hidden="true"></i></span>
        </div>
        <div>
          <div class="spotlight-card-title">${title}</div>
          <div class="spotlight-card-meta">${meta}</div>
        </div>
      </a>`;
  }

  function activityRow(icon, title, sub, time) {
    return `
      <div class="profile-activity-item">
        <div class="profile-activity-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
        <div class="profile-activity-body">
          <div class="profile-activity-title">${title}</div>
          <div class="profile-activity-sub">${sub}</div>
        </div>
        <div class="profile-activity-time">${time}</div>
      </div>`;
  }

  function railCard(icon, title, sub, artColor, artIcon, button, extra = "") {
    return `
      <div class="rail-card">
        <div class="rail-card-header"><h3><i class="ti ${icon}" aria-hidden="true"></i> ${title}</h3></div>
        <p class="rail-card-sub">${sub}</p>
        <div class="rail-art${button ? "" : " small"}"><div class="media-placeholder light ${artColor}"><i class="ti ${artIcon}" aria-hidden="true"></i></div></div>
        ${button ? `<button type="button" class="primary-button" style="margin-top:14px;"><i class="ti ti-plus" aria-hidden="true"></i> ${button}</button>` : ""}
        ${extra}
      </div>`;
  }

  function railLinks(a, b) {
    return `<div class="rail-tag-links" style="margin-top:14px;">
      <a class="rail-tag-link green"><i class="ti ti-school" aria-hidden="true"></i> ${a}</a>
      <a class="rail-tag-link gold"><i class="ti ti-building-store" aria-hidden="true"></i> ${b}</a></div>`;
  }

  function hero(title, text, button, image) {
    return `
      <section class="hero-section-v2">
        <div class="hero-v2-text">
          <h1>${title}</h1>
          <p>${text}</p>
          <div class="hero-v2-actions"><button type="button" class="hero-btn-primary"><i class="ti ti-plus" aria-hidden="true"></i> ${button}</button></div>
        </div>
        <div class="hero-v2-media"><div class="media-placeholder"><img src="../frontend/assets/images/${image}" alt="UMP Campus" /></div></div>
      </section>`;
  }

  function toolbar(id, placeholder, prices, categories) {
    return `
      <div class="tasks-toolbar">
        <div class="toolbar-search-box" data-search-box="${id}">
          <i class="ti ti-search" aria-hidden="true"></i>
          <input type="text" id="${id}" placeholder="${placeholder}" tabindex="-1" />
        </div>
        <select class="toolbar-select" tabindex="-1"><option>All Categories</option>${categories.map((c) => `<option>${c}</option>`).join("")}</select>
        <select class="toolbar-select" tabindex="-1"><option>Any Price</option>${prices.map((p) => `<option>${p}</option>`).join("")}</select>
        <select class="toolbar-select" tabindex="-1"><option>Newest</option><option>Price: Low to High</option><option>Price: High to Low</option></select>
      </div>
      <div class="filters-row">
        <button class="filter-pill active"><i class="ti ti-layout-grid" aria-hidden="true"></i> All</button>
        <button class="filter-pill"><i class="ti ti-school" aria-hidden="true"></i> Academic</button>
        <button class="filter-pill"><i class="ti ti-building-store" aria-hidden="true"></i> General</button>
      </div>`;
  }

  function listSection(icon, title, sub, toolbarHtml, cards) {
    return `
      <section class="section-block" data-role="list">
        <div class="section-header"><div><h2><i class="ti ${icon}" aria-hidden="true"></i> ${title}</h2><p>${sub}</p></div></div>
        ${toolbarHtml}
        <div class="marketplace-grid" data-role="grid">${cards}</div>
      </section>`;
  }

  function detailShell(back, icon, title, sub, inner) {
    return `
      <section class="section">
        <button type="button" class="back-link"><i class="ti ti-arrow-left" aria-hidden="true"></i> ${back}</button>
        <div class="section-header"><div><h2><i class="ti ${icon}" aria-hidden="true"></i> ${title}</h2><p>${sub}</p></div></div>
        <div class="form-panel detail-shell">${inner}</div>
      </section>`;
  }

  const PAGES = {
    dash: `
      <section class="hero-spotlight" aria-label="What's happening on Taskify">
        <div class="hero-spotlight-top">
          <p class="hero-spotlight-eyebrow">Welcome back, ${D.VIEWER.name.split(" ")[0]}</p>
          <span class="hero-spotlight-uni">University of Mpumalanga</span>
        </div>
        <p class="hero-v2-tagline">Everything campus life needs, in one place.</p>
        <div class="hero-spotlight-row" data-role="spotlight">
          ${spotlight("task", "Task", task.image_urls[0], task.title, `R${task.price} · ${task.location}`)}
          ${spotlight("rental", "Rental", equip.image_urls[0], equip.name, `R${equip.daily_price}/day · ${equip.category}`)}
          ${spotlight("sale", "For Sale", sale.image_urls[0], sale.title, `R${sale.price} · ${sale.location}`)}
        </div>
        <div class="carousel-dots"><button type="button" class="carousel-dot active"></button><button type="button" class="carousel-dot"></button><button type="button" class="carousel-dot"></button></div>
      </section>
      <div class="dashboard-grid">
        <div class="dashboard-main">
          <section class="section-block" id="activity">
            <div class="section-header"><div>
              <h2><i class="ti ti-bolt" aria-hidden="true"></i> Waiting for you</h2>
              <p>Your next steps across tasks, offers, sales and rentals</p>
            </div></div>
            <div class="action-list">${emptyState("ti-circle-check", "You're all caught up", "Nothing needs you right now. New requests, offers and handovers will show up here.")}</div>
          </section>
          <section class="section-block">
            <div class="section-header">
              <div><h2><i class="ti ti-layout-grid" aria-hidden="true"></i> Explore Marketplace</h2><p>Popular categories on campus</p></div>
              <a class="view-all-link">View all <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
            </div>
            <div class="explore-tiles" data-role="tiles">
              <a class="explore-tile green"><div class="explore-tile-icon"><i class="ti ti-school" aria-hidden="true"></i></div><h3>Academic</h3><p>Tutoring, assignments, research &amp; more</p><div class="explore-tile-footer"><span>2 tasks</span><i class="ti ti-arrow-right" aria-hidden="true"></i></div></a>
              <a class="explore-tile blue"><div class="explore-tile-icon"><i class="ti ti-map-pin" aria-hidden="true"></i></div><h3>General</h3><p>Errands, cleaning, deliveries &amp; more</p><div class="explore-tile-footer"><span>2 tasks</span><i class="ti ti-arrow-right" aria-hidden="true"></i></div></a>
              <a class="explore-tile gold" data-tile="rentals"><div class="explore-tile-icon"><i class="ti ti-package" aria-hidden="true"></i></div><h3>Rentals</h3><p>Equipment, electronics and more</p><div class="explore-tile-footer"><span>4 items</span><i class="ti ti-arrow-right" aria-hidden="true"></i></div></a>
              <a class="explore-tile red" data-tile="sales"><div class="explore-tile-icon"><i class="ti ti-shopping-cart" aria-hidden="true"></i></div><h3>Sales</h3><p>Buy and sell items within campus</p><div class="explore-tile-footer"><span>4 items</span><i class="ti ti-arrow-right" aria-hidden="true"></i></div></a>
            </div>
          </section>
          <section class="section-block">
            <div class="section-header">
              <div><h2><i class="ti ti-clipboard-list" aria-hidden="true"></i> Featured Tasks</h2><p>Tasks students are working on</p></div>
              <a class="view-all-link">View all <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
            </div>
            <div class="marketplace-grid">${D.TASKS.slice(0, 2).map(D.taskCard).join("")}</div>
          </section>
        </div>
        <aside class="dashboard-rail">
          <div class="rail-card">
            <div class="rail-card-header"><h3><i class="ti ti-activity" aria-hidden="true"></i> Recent Activity</h3></div>
            <div class="profile-activity-list">
              ${activityRow("ti-circle-check", "Task completed", "Set up a printer in res · 5★ review", "2h ago")}
              ${activityRow("ti-tag", "Item listed", "Lab coat (size M)", "Yesterday")}
              ${activityRow("ti-package", "Equipment booked", "Ring light with phone tripod", "3d ago")}
              ${activityRow("ti-star", "Review received", "5★ from Sipho Nkosi", "5d ago")}
            </div>
            <a class="view-all-link small" style="margin-top:12px;display:inline-flex;">View all activity</a>
          </div>
        </aside>
      </div>`,

    tasks: `
      ${hero("Need help with something?", "Post a task and connect with verified UMP students ready to help.", "Create Task", "UMP-Buildings-4.jpg")}
      <div class="dashboard-grid">
        <div class="dashboard-main">
          ${listSection("ti-list-search", "Available Tasks", "Browse tasks posted by students",
            toolbar("taskSearchInput", "Search tasks...", ["Under R100", "R100 – R300", "Over R300"], ["Tutoring & Study Help", "Programming & Tech Help"]),
            D.TASKS.map(D.taskCard).join(""))}
        </div>
        <aside class="dashboard-rail">
          ${railCard("ti-clipboard-plus", "Post a Task", "Create a task in a few guided steps", "green", "ti-clipboard-plus", "Create Task")}
          ${railCard("ti-building-store", "Task Marketplace", "Post or accept student tasks. Create tasks step-by-step and connect with verified UMP students.", "blue", "ti-users-group", null, railLinks("Academic Tasks", "General Tasks"))}
        </aside>
      </div>`,

    taskDetail: detailShell("Back to Tasks", "ti-clipboard-list", "Task Details", "Review task information before accepting", D.taskDetail(task)),

    sales: `
      ${hero("Got something to sell?", "List textbooks, uniforms, toolkits or anything else students need.", "Sell an Item", "UMP-Buildings-20.jpg")}
      <div class="dashboard-grid">
        <div class="dashboard-main">
          ${listSection("ti-list-search", "Available Items", "Browse items students are selling",
            toolbar("salesSearchInput", "Search textbooks, uniforms, toolkits...", ["Under R100", "R100 – R300", "Over R300"], ["Textbooks", "Calculators"]),
            D.SALES.map(D.saleCard).join(""))}
        </div>
        <aside class="dashboard-rail">
          ${railCard("ti-shopping-bag", "Sell an Item", "Create a listing in a few guided steps", "gold", "ti-tag", "Sell an Item")}
          ${railCard("ti-building-store", "Sales Marketplace", "Buy and sell textbooks, uniforms, toolkits, calculators and other student essentials.", "blue", "ti-users-group", null, railLinks("Academic Items", "General Items"))}
        </aside>
      </div>`,

    saleDetail: detailShell("Back to Sales", "ti-shopping-bag", "Sale Item Details", "Review the item before contacting the seller", D.saleDetail(sale)),

    rentals: `
      ${hero("Rent or list student equipment", "List laptops, calculators, toolkits, cameras and more using the guided setup flow.", "List Equipment", "UMP-Buildings-62.jpg")}
      <div class="dashboard-grid">
        <div class="dashboard-main">
          ${listSection("ti-list-search", "Available Equipment", "Browse campus rentals",
            toolbar("equipmentSearchInput", "Search laptops, calculators, toolkits...", ["Under R50/day", "R50 – R150/day", "Over R150/day"], ["Cameras & Audio", "Calculators"]),
            D.EQUIPMENT.map(D.equipmentCard).join(""))}
        </div>
        <aside class="dashboard-rail">
          ${railCard("ti-package", "List Equipment", "Got equipment to rent out? List it and start earning.", "blue", "ti-package", "List Equipment")}
          ${railCard("ti-building-store", "Equipment Marketplace", "Rent laptops, calculators, toolkits, cameras and more from fellow students.", "navy", "ti-camera", null, railLinks("Academic Rentals", "General Rentals"))}
        </aside>
      </div>`,

    rentalDetail: detailShell("Back to Rentals", "ti-package", "Equipment Details", "Review rental information before booking", D.equipmentDetail(equip))
  };

  const URLS = {
    dash: "dashboard.html", tasks: "tasks.html", taskDetail: `task-details.html?id=${task.id}`,
    sales: "sales.html", saleDetail: `sale-details.html?id=${sale.id}`,
    rentals: "equipment.html", rentalDetail: `equipment-details.html?id=${equip.id}`
  };
  const NAV_FOR = { dash: "dash", tasks: "tasks", taskDetail: "tasks", sales: "sales", saleDetail: "sales", rentals: "rentals", rentalDetail: "rentals" };

  $("#screens").innerHTML = Object.entries(PAGES).map(([id, html]) =>
    `<section class="film-screen" id="scr-${id}" data-screen="${id}"><div class="film-scroll"><div class="dashboard-container">${html}</div></div></section>`).join("");

  $("#sidebarUserName").textContent = D.VIEWER.name;
  $$(".nav-avatar-target").forEach((el) => { el.textContent = avatarInitials(D.VIEWER.name); });

  // Modals and the offers panel get their real content up front.
  $("#offerModalIntro").innerHTML = D.applyIntro(task);
  $("#buyModalBody").innerHTML = D.buyModalBody(sale);
  $("#offersSection").innerHTML = D.applicationPanel(task);
  $("#offersSection").style.display = "none";

  const moment = $("#filmMoment");
  moment.innerHTML = TaskifyMotion.symbolSVG("Payment held") +
    `<div><strong data-held-line>Payment held<em>Demo</em></strong><span data-held-line>${formatRand(D.SALE_RULES.total)} is held until you have the item. Your handover code is ready.</span></div>`;
  [".tk-t", ".tk-ring"].forEach((s) => { const el = moment.querySelector(s); el.style.transformBox = "fill-box"; el.style.transformOrigin = "center"; });

  const scr = {};
  $$(".film-screen").forEach((el) => {
    scr[el.dataset.screen] = { el, scroll: el.querySelector(".film-scroll"), rail: el.querySelector(".dashboard-rail") };
  });

  /* ── Layout measurement ── */

  // Offset of `el` inside its screen's scrolling content (ignores transforms).
  function offsetIn(el) {
    let y = 0, x = 0, n = el;
    const screen = el.closest(".film-screen");
    while (n && n !== screen) { y += n.offsetTop; x += n.offsetLeft; n = n.offsetParent; }
    return { x, y };
  }
  const offsetY = (sel, screenId) => () => { const el = $(sel, scr[screenId].el); return el ? offsetIn(el).y : 0; };

  /* ── Which page is on screen ── */

  // [screen, time it arrives, how it arrives]
  const VISITS = [
    ["dash", -10, "none"],
    ["tasks", T.tasksPage, "module"],
    ["taskDetail", T.taskDetail, "detail"],
    ["sales", T.salesPage, "module"],
    ["saleDetail", T.saleDetail, "detail"],
    ["sales", T.salesBack, "back"],
    ["rentals", T.rentalsPage, "module"],
    ["rentalDetail", T.rentalDetail, "detail"],
    ["dash", T.dashBack, "module"]
  ];
  const TRANSITION = 0.5;

  function visitIndex(t) {
    let i = 0;
    while (i + 1 < VISITS.length && t >= VISITS[i + 1][1]) i++;
    return i;
  }

  function screenStyles(t) {
    const i = visitIndex(t);
    const [cur, at, how] = VISITS[i];
    const p = prog(t, at, TRANSITION);
    const out = {};
    for (const id of Object.keys(scr)) out[id] = null;
    const e = E.out(p);
    if (how === "module") out[cur] = { x: (1 - e) * 90, y: 0, s: 1, o: e };
    else if (how === "detail") out[cur] = { x: 0, y: (1 - e) * 30, s: 0.985 + 0.015 * e, o: e };
    else if (how === "back") out[cur] = { x: (1 - e) * -70, y: 0, s: 1, o: e };
    else out[cur] = { x: 0, y: 0, s: 1, o: 1 };
    if (i > 0 && p < 1) {
      const prev = VISITS[i - 1][0];
      const q = E.out(clamp01(p * 2.2));   // the old page clears quickly so the cross-fade stays clean
      if (prev !== cur) {
        if (how === "module") out[prev] = { x: -60 * q, y: 0, s: 1, o: 1 - q };
        else if (how === "detail") out[prev] = { x: 0, y: 0, s: 1 - 0.01 * q, o: 1 - q };
        else out[prev] = { x: 0, y: 24 * q, s: 1, o: 1 - q };
      }
    }
    return { styles: out, current: cur };
  }

  /* ── Scrolling (simulated, so it is exact on every frame) ── */

  const SCROLL = {
    dash: (t) => (t < T.dashBack ? keys(t, [[5.2, 0], [8.6, offsetY("[data-role=tiles]", "dash")() - 300]]) : keys(t, [[T.dashBack, 0]])),
    tasks: (t) => keys(t, [[T.tasksScroll, 0], [T.tasksScroll + 1.3, offsetY("[data-role=list]", "tasks")]]),
    // Image → title, description and the summary's Apply button together → the new application.
    taskDetail: (t) => keys(t, [
      [T.taskReadPan, 0], [T.taskReadPan + 1.4, () => offsetY(".detail-title", "taskDetail")() - 330],
      [T.applySent + 0.25, () => offsetY(".detail-title", "taskDetail")() - 330], [T.applySent + 1.35, () => offsetY("#offersSection", "taskDetail")() - 360]
    ]),
    sales: (t) => (t < T.salesBack
      ? keys(t, [[T.salesScroll, 0], [T.salesScroll + 1.3, offsetY("[data-role=list]", "sales")]])
      : offsetY("[data-role=list]", "sales")()),
    saleDetail: (t) => keys(t, [
      [T.saleDetail + 0.6, 0], [T.saleSummaryPan + 1.2, 260],
      [T.handoverPanel + 0.2, 260], [T.handoverPanel + 1.1, 330]
    ]),
    // Arrives at the same place the Sales cards were, so cards hand over to cards.
    rentals: () => offsetY("[data-role=list]", "rentals")(),
    rentalDetail: (t) => keys(t, [[T.rentalSummaryPan, 0], [T.rentalSummaryPan + 1.3, 330]])
  };

  // The booking modal is taller than the screen once the quote shows; it scrolls itself.
  const bookingModal = $("#bookingModal");
  // Pause on the price breakdown, then reveal "Send Request".
  const bookingScroll = (t) => keys(t, [
    [T.quoteIn + 0.2, 0], [T.quoteIn + 0.8, 170], [T.quoteIn + 1.5, 170],
    [T.quoteIn + 2.1, () => bookingModal.scrollHeight - bookingModal.clientHeight]
  ]);
  const offerModal = $("#offerModal");
  const buyModal = $("#buyModal");

  /* ── Pointer path ── */

  // Each stop: when the pointer arrives, where, how long the move takes, and whether it clicks.
  const CURSOR = [
    { t: 4.3, at: [860, 560], dur: 0 },
    { t: T.chipTasks, at: "[data-nav=tasks]", dur: 0.55, off: [-40, 0] },
    { t: T.chipSales, at: "[data-nav=sales]", dur: 0.45, off: [-40, 0] },
    { t: T.chipRentals, at: "[data-nav=rentals]", dur: 0.45, off: [-40, 0] },
    { t: T.navTasksClick, at: "[data-nav=tasks]", dur: 0.55, off: [-30, 0], click: true },
    { t: 12.2, at: "#taskSearchInput", dur: 0.9, off: [60, 0] },
    { t: T.tasksHover, at: "#scr-tasks [data-card='task-41'] .market-image", dur: 0.8, off: [40, 10] },
    { t: T.tasksViewClick, at: "#scr-tasks [data-view='task-41']", dur: 0.6, click: true },
    { t: T.applyClick, at: "#applyForTaskButton", dur: 0.9, click: true },
    { t: T.applyModal + 0.6, at: "#offerMessageInput", dur: 0.5, off: [-60, 0], click: true },
    { t: T.applySendClick, at: "#submitOfferButton", dur: 0.45, click: true },
    { t: T.navSalesClick, at: "[data-nav=sales]", dur: 1.0, off: [-30, 0], click: true },
    { t: T.salesSearchFocus, at: "#salesSearchInput", dur: 0.9, off: [-80, 0], click: true },
    { t: T.salesFiltered + 0.6, at: "[data-card='sale-72'] .market-image", dur: 0.55, off: [30, 0] },
    { t: T.salesViewClick, at: "[data-view='sale-72']", dur: 0.5, click: true },
    { t: T.buyClick, at: "#buyProtectedButton", dur: 1.0, click: true },
    { t: T.simulateClick, at: "#simulateBuyButton", dur: 0.8, click: true },
    { t: T.salesBackClick, at: "#scr-saleDetail .back-link", dur: 0.7, click: true },
    { t: T.navRentalsClick, at: "[data-nav=rentals]", dur: 0.7, off: [-30, 0], click: true },
    { t: T.rentalsHover, at: "[data-card='equip-25'] .market-image", dur: 0.9, off: [30, 0] },
    { t: T.rentalsViewClick, at: "[data-view='equip-25']", dur: 0.6, click: true },
    { t: T.requestClick, at: "#openBookingButton", dur: 1.0, click: true },
    { t: T.startDatePick, at: "#bookingStartDate", dur: 0.45, click: true },
    { t: T.endDatePick, at: "#bookingEndDate", dur: 0.4, click: true },
    { t: T.sendRequestClick, at: "#bookingSubmitButton", dur: 0.7, click: true },
    { t: T.navDashClick, at: "[data-nav=dash]", dur: 0.8, off: [-30, 0], click: true }
  ];
  const CURSOR_SHOW = 4.3, CURSOR_HIDE = T.pullBack + 0.2;

  const ANIM_ROOTS = ".film-screen, .film-scroll, .dashboard-rail, .market-card, #offerModal, #buyModal, #bookingModal";

  /* Where `sel` will be at time `at`, in app-viewport pixels. Transforms
     the film adds are ignored, and the page/modal scroll is the one at `at`. */
  function locate(sel, at) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return null;
    const saved = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches(ANIM_ROOTS)) {
        saved.push([n, n.style.transform]);
        n.style.transform = /Modal$/.test(n.id) ? "translateX(-50%)" : "none";
      }
    }
    const r = el.getBoundingClientRect();
    saved.forEach(([n, tr]) => { n.style.transform = tr; });
    let y = r.top;
    const screen = el.closest(".film-screen");
    if (screen) y -= SCROLL[screen.dataset.screen](at);
    if (el.closest("#bookingModal")) y += bookingModal.scrollTop - bookingScroll(at);
    return { x: r.left, y, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: y + r.height / 2 };
  }

  /* A stop's target can be hidden later (a dialog that closed); then the
     pointer keeps the last place it was measured. */
  function stopPoint(stop) {
    if (Array.isArray(stop.at)) return { x: stop.at[0], y: stop.at[1] };
    const r = locate(stop.at, stop.t);
    if (!r || (r.w === 0 && r.h === 0)) return stop._last || { x: 720, y: 450 };
    const off = stop.off || [0, 0];
    stop._last = { x: r.cx + off[0], y: r.cy + off[1] };
    return stop._last;
  }

  function cursorAt(t) {
    let i = 0;
    while (i + 1 < CURSOR.length && t >= CURSOR[i + 1].t - CURSOR[i + 1].dur) i++;
    const stop = CURSOR[i];
    const next = CURSOR[i + 1];
    if (next && t >= next.t - next.dur) {
      const a = stopPoint(stop), b = stopPoint(next);
      const p = E.inOut(prog(t, next.t - next.dur, next.dur));
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const arc = Math.sin(Math.PI * p) * Math.min(50, dist * 0.1);
      const nx = dist ? -(b.y - a.y) / dist : 0, ny = dist ? (b.x - a.x) / dist : 0;
      return { x: lerp(a.x, b.x, p) + nx * arc, y: lerp(a.y, b.y, p) + ny * arc };
    }
    return stopPoint(stop);
  }

  /* ── Small render helpers ── */

  function setStyle(el, css) {
    if (!el) return;
    for (const k in css) if (el.style[k] !== css[k]) el.style[k] = css[k];
  }
  function show(el, on, display = "") { if (el) setStyle(el, { display: on ? display : "none" }); }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }

  // Fade + rise for things that appear (cards, panels, toasts).
  function appear(el, t, start, dur = 0.5, rise = 22, slide = 0) {
    const p = E.out(prog(t, start, dur));
    setStyle(el, { opacity: String(p), transform: p >= 1 ? "" : `translate(${(1 - p) * slide}px, ${(1 - p) * rise}px)` });
  }

  function modalState(el, t, open, close) {
    const pin = E.out(prog(t, open, 0.35));
    const pout = prog(t, close, 0.2);
    const visible = t >= open && pout < 1;
    show(el, visible, "block");
    if (!visible) return 0;
    const o = pin * (1 - pout);
    setStyle(el, { opacity: String(o), transform: `translateX(-50%) translateY(${(1 - pin) * 18 + pout * 10}px) scale(${0.98 + 0.02 * pin})` });
    return o;
  }

  function pressed(t, tc) { return within(t, tc - 0.02, tc + 0.16); }

  const toastEl = document.createElement("div");
  $("#toastContainer").appendChild(toastEl);
  const TOASTS = [
    [T.applySent, "Application sent. The poster will choose who does it."],
    [T.requestSent, "Request sent. You'll be asked to pay only once the owner approves."]
  ];

  /* ── The frame ── */

  /* Pages: placed and scrolled AFTER their content is updated, because
     scroll targets are measured from the page as it looks at time t. */
  function placePages(t, styles, current) {
    for (const [id, s] of Object.entries(styles)) {
      const { el, scroll, rail } = scr[id];
      if (!s) { setStyle(el, { visibility: "hidden", opacity: "0" }); continue; }
      setStyle(el, {
        visibility: "visible", opacity: String(s.o), zIndex: id === current ? "2" : "1",
        transform: `translate(${s.x}px, ${s.y}px) scale(${s.s})`
      });
      const y = SCROLL[id](t);
      setStyle(scroll, { transform: `translateY(${-y}px)` });
      if (rail) {
        // .dashboard-rail is position:sticky in the real app.
        const top = offsetIn(rail).y;
        const max = rail.parentElement.offsetHeight - rail.offsetHeight;
        setStyle(rail, { transform: `translateY(${Math.max(0, Math.min(max, y - top + 16))}px)` });
      }
    }
  }

  function render(t) {
    const { styles, current } = screenStyles(t);

    // Sidebar
    const nav = NAV_FOR[current];
    const navClick = [["tasks", T.navTasksClick], ["sales", T.navSalesClick], ["rentals", T.navRentalsClick], ["dash", T.navDashClick]];
    let activeNav = nav;
    for (const [n, tc] of navClick) if (within(t, tc, tc + 0.3)) activeNav = n;
    $$("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === activeNav);
      const hover =
        (a.dataset.nav === "tasks" && within(t, T.chipTasks - 0.1, T.chipSales - 0.4)) ||
        (a.dataset.nav === "sales" && within(t, T.chipSales - 0.1, T.chipRentals - 0.4)) ||
        (a.dataset.nav === "rentals" && within(t, T.chipRentals - 0.1, T.navTasksClick - 0.5));
      a.classList.toggle("film-hover", hover);
    });

    // Dashboard: spotlight cards and tiles come in once the browser has landed.
    $$("[data-role=spotlight] .spotlight-card", scr.dash.el).forEach((c, i) => appear(c, t < T.dashBack ? t : 99, T.frameIn + 0.5 + i * 0.12, 0.6, 18));
    $$("[data-role=tiles] .explore-tile", scr.dash.el).forEach((c, i) => appear(c, t < T.dashBack ? t : 99, T.frameIn + 0.9 + i * 0.08, 0.5, 14));

    // Lists: cards rise in one after another on the first visit.
    const stagger = (screenId, start, rise = 26, slide = 0) => $$("[data-role=grid] .market-card", scr[screenId].el).forEach((c, i) => {
      if (c.style.display === "none") return;
      appear(c, t, start + i * 0.09, 0.6, rise, slide);
    });
    stagger("tasks", T.tasksCards);
    stagger("rentals", T.rentalsPage + 0.05, 0, 120);
    if (t < T.salesBack) stagger("sales", T.salesCards);

    // Hover lift on the card the pointer rests on.
    const hoverCard = (sel, a, b) => { const c = $(sel); if (c) c.classList.toggle("film-hover", within(t, a, b)); };
    hoverCard("#scr-tasks [data-card='task-41']", T.tasksHover - 0.15, T.taskDetail);
    hoverCard("[data-card='sale-72']", T.salesFiltered + 0.5, T.saleDetail);
    hoverCard("[data-card='equip-25']", T.rentalsHover - 0.15, T.rentalDetail);

    // Tasks search box gets a hover glance while browsing.
    const taskSearch = $("[data-search-box=taskSearchInput]");
    taskSearch.classList.toggle("film-focus", within(t, 12.1, T.tasksHover - 0.6));

    // Sales: type "textbook" into the search, then the list filters.
    const salesBox = $("[data-search-box=salesSearchInput]");
    const salesInput = $("#salesSearchInput");
    const query = "textbook";
    const typing = t >= T.salesTypeStart && t < T.salesBack;
    const n = typing ? Math.min(query.length, Math.floor(prog(t, T.salesTypeStart, T.salesTypeEnd - T.salesTypeStart) * query.length + 0.999)) : 0;
    if (salesInput.value !== query.slice(0, n)) salesInput.value = query.slice(0, n);
    salesBox.classList.toggle("film-focus", within(t, T.salesSearchFocus, T.saleDetail));
    const filtering = t >= T.salesFiltered && t < T.salesBack;
    $$("[data-role=grid] .market-card", scr.sales.el).forEach((c) => {
      const match = c.dataset.search.includes(query);
      if (!filtering || match) {
        show(c, true);
        if (filtering) appear(c, t, T.salesFiltered + 0.18, 0.35, 10);
        else if (t >= T.salesBack) setStyle(c, { opacity: "1", transform: "" });
        return;
      }
      const p = prog(t, T.salesFiltered, 0.18);
      show(c, p < 1);
      setStyle(c, { opacity: String(1 - p), transform: `scale(${1 - 0.04 * p})` });
    });

    // Task details: apply → note → send → "Your application"
    const applied = t >= T.applySent;
    const applyBtn = $("#applyForTaskButton");
    show(applyBtn, !applied, "flex");
    setStyle(applyBtn, { transform: pressed(t, T.applyClick) ? "scale(0.97)" : "" });
    setHTML($("#makeOfferButton"), applied
      ? `<i class="ti ti-tag" aria-hidden="true"></i> View your application`
      : `<i class="ti ti-tag" aria-hidden="true"></i> Offer a different price`);
    const offers = $("#offersSection");
    show(offers, applied, "block");
    if (applied) appear(offers, t, T.applySent + 0.15, 0.5, 16);

    const note = "I got 82% for INF 2B and can help on Wednesday afternoon.";
    const typedNote = note.slice(0, Math.floor(prog(t, T.applyModal + 0.7, 0.85) * note.length));
    const noteInput = $("#offerMessageInput");
    if (noteInput.value !== typedNote) noteInput.value = typedNote;
    setText($("#offerMessageCount"), String(typedNote.length));
    noteInput.classList.toggle("film-focus", t >= T.applyModal + 0.6);
    setStyle($("#submitOfferButton"), { transform: pressed(t, T.applySendClick) ? "scale(0.97)" : "" });

    // Sale details: buy → simulate payment → money held + handover code
    setStyle($("#buyProtectedButton"), { transform: pressed(t, T.buyClick) ? "scale(0.97)" : "" });
    const simBtn = $("#simulateBuyButton");
    setHTML(simBtn, within(t, T.simulateClick + 0.05, T.paymentHeld)
      ? `<i class="ti ti-loader" aria-hidden="true"></i> Holding payment…`
      : `<i class="ti ti-shield-check" aria-hidden="true"></i> Simulate Payment`);
    setStyle(simBtn, { transform: pressed(t, T.simulateClick) ? "scale(0.97)" : "" });
    const bought = t >= T.handoverPanel;
    show($("[data-role=sale-actions-before]"), !bought, "block");
    const after = $("[data-role=sale-actions-after]");
    show(after, bought, "block");
    if (bought) appear(after, t, T.handoverPanel, 0.5, 14);
    setHTML($("[data-role=sale-status]"), statusBadge(bought ? "Reserved" : "Available"));

    // Payment moment (taskify-motion.js playHeld, frame by frame)
    const mVisible = within(t, T.paymentHeld, T.momentOut + 0.2);
    show(moment, mVisible, "grid");
    if (mVisible) {
      const pin = E.out(prog(t, T.paymentHeld, 0.3));
      const pout = E.out(prog(t, T.momentOut, 0.2));
      setStyle(moment, {
        opacity: String(pin * (1 - pout)),
        transform: `translate(-50%, ${(1 - pin) * 14 + pout * 14}px) scale(${0.97 + 0.03 * pin})`
      });
      const ms = (t - T.paymentHeld) * 1000;
      const tp = clamp01(ms / 460);
      const ty = tp < 0.4 ? lerp(-18, -6, E.out(tp / 0.4)) : tp < 0.75 ? lerp(-6, 1, E.out((tp - 0.4) / 0.35)) : lerp(1, 0, E.out((tp - 0.75) / 0.25));
      setStyle(moment.querySelector(".tk-t"), { transform: `translateY(${ty}px)`, opacity: String(clamp01(tp / 0.4)) });
      const rp = E.inOut(prog(ms, 280, 700));
      setStyle(moment.querySelector(".tk-ring"), { strokeDashoffset: String(1 - rp), transform: "rotate(-90deg)" });
      $$("[data-held-line]", moment).forEach((el, i) => appear(el, ms, 560 + i * 60, 320, 6));
    }

    // Rental details: request → dates → quote → send
    setStyle($("#openBookingButton"), { transform: pressed(t, T.requestClick) ? "scale(0.97)" : "" });
    const startIn = $("#bookingStartDate"), endIn = $("#bookingEndDate");
    const startVal = t >= T.startDatePick + 0.15 ? D.BOOKING.start : "";
    const endVal = t >= T.endDatePick + 0.15 ? D.BOOKING.end : "";
    if (startIn.value !== startVal) startIn.value = startVal;
    if (endIn.value !== endVal) endIn.value = endVal;
    startIn.classList.toggle("film-focus", within(t, T.startDatePick, T.endDatePick));
    endIn.classList.toggle("film-focus", within(t, T.endDatePick, T.quoteIn + 0.4));
    const quote = $("#bookingQuote");
    if (t < T.endDatePick + 0.15) setHTML(quote, `<p class="pay-note"><i class="ti ti-calendar-search" aria-hidden="true"></i> Pick your dates to see the price and the rental terms.</p>`);
    else if (t < T.quoteIn) setHTML(quote, `<p class="pay-note"><i class="ti ti-loader" aria-hidden="true"></i> Working out your price…</p>`);
    else setHTML(quote, D.bookingQuote());
    const submit = $("#bookingSubmitButton");
    submit.disabled = t < T.quoteIn;
    setHTML(submit, within(t, T.sendRequestClick + 0.05, T.requestSent + 0.3)
      ? `<i class="ti ti-loader" aria-hidden="true"></i> Sending request…`
      : `<i class="ti ti-send" aria-hidden="true"></i> Send Request`);
    setStyle(submit, { transform: pressed(t, T.sendRequestClick) ? "scale(0.97)" : "" });

    // Modals + overlay
    const o1 = modalState(offerModal, t, T.applyModal, T.applySent);
    const o2 = modalState(buyModal, t, T.buyModal, T.paymentHeld - 0.15);
    const o3 = modalState(bookingModal, t, T.bookingModal, T.requestSent);
    if (o3) bookingModal.scrollTop = bookingScroll(t);
    const ov = Math.max(o1, o2, o3);
    show($("#overlay"), ov > 0, "block");
    setStyle($("#overlay"), { opacity: String(ov) });

    // Toasts (helpers.js showToast look; 3.5 s then out)
    let toast = null;
    for (const [at, msg] of TOASTS) if (within(t, at, at + 3.7)) toast = [at, msg];
    show(toastEl, !!toast, "flex");
    if (toast) {
      toastEl.className = "toast success";
      setHTML(toastEl, `<i class="ti ti-circle-check" aria-hidden="true"></i> ${toast[1]}`);
      const pin = E.out(prog(t, toast[0], 0.3)), pout = prog(t, toast[0] + 3.5, 0.2);
      setStyle(toastEl, { opacity: String(pin * (1 - pout)), transform: `translateX(${(1 - pin) * 30 + pout * 20}px)` });
    }

    placePages(t, styles, current);

    // Pointer + click ripple
    const cursor = $("#filmCursor"), ripple = $("#filmRipple");
    const cOpacity = prog(t, CURSOR_SHOW, 0.25) * (1 - prog(t, CURSOR_HIDE, 0.3));
    let clickAt = null;
    for (const s of CURSOR) if (s.click && within(t, s.t, s.t + 0.5)) clickAt = s;
    if (cOpacity > 0) {
      const p = cursorAt(t);
      const press = clickAt ? 1 - 0.14 * Math.sin(Math.PI * prog(t, clickAt.t, 0.18)) : 1;
      setStyle(cursor, { opacity: String(cOpacity), transform: `translate(${p.x - 5}px, ${p.y - 3}px) scale(${press})` });
      if (clickAt) {
        const rp = prog(t, clickAt.t, 0.5);
        const at = stopPoint(clickAt);
        setStyle(ripple, { opacity: String((1 - rp) * 0.9 * cOpacity), transform: `translate(${at.x}px, ${at.y}px) scale(${0.3 + 1.2 * E.out(rp)})` });
      } else setStyle(ripple, { opacity: "0" });
    } else {
      setStyle(cursor, { opacity: "0" });
      setStyle(ripple, { opacity: "0" });
    }

    return { screen: current, url: URLS[current] };
  }

  /* ── Ready: fonts and every image decoded, so frame 1 is complete ── */
  const ready = (async () => {
    await document.fonts.ready;
    try { await document.fonts.load("600 15px Poppins"); await document.fonts.load("16px tabler-icons"); } catch (e) { /* fonts optional */ }
    await Promise.all($$("img").map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))));
    // Background images (spotlight cards) — load them before the first frame.
    await Promise.all($$(".spotlight-card").map((el) => new Promise((res) => {
      const m = /url\(['"]?([^'")]+)/.exec(el.style.backgroundImage);
      if (!m) return res();
      const im = new Image(); im.onload = im.onerror = res; im.src = m[1];
    })));
    render(0);
  })();

  window.FilmApp = { render, locate, ready, URLS };
})();
