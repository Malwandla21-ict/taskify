/* ============================================================
   Demo listings + markup builders for the film's app layer.

   The builders are copies of the production ones, trimmed to the
   "student browsing someone else's listing" view the film shows:
     taskCard        ← frontend/js/tasks.js        taskCard()
     saleCard        ← frontend/js/sales.js        saleCard()
     equipmentCard   ← frontend/js/equipment.js    equipmentCard()
     taskDetail      ← frontend/js/task-details.js renderTaskDetails()
     saleDetail      ← frontend/js/sale-details.js renderSaleDetails()
     equipmentDetail ← frontend/js/equipment-details.js renderEquipmentDetails()
   They call the REAL helpers from frontend/js/helpers.js (statusBadge,
   sectionBadge, conditionBadge, avatarHtml, moneyRow, rentalTermsHtml…),
   so badges, avatars and money rows look exactly like the live app.

   Prices and fees follow backend/src/config/paymentSettings.js:
   protected sales from R300 (3% fee), rentals 5% protection fee
   (min R5, max R50), deposits switched off, rental days counted
   inclusive (trust.service.js countRentalDays).
============================================================ */
(function (global) {
  "use strict";

  // Absolute URLs: main.css uses some of them in custom properties
  // (--detail-img), which would otherwise resolve against frontend/css/.
  const M = new URL("./media/", document.baseURI).href;
  const IMG = new URL("../frontend/assets/images/", document.baseURI).href;

  const VIEWER = { name: "Ayanda Zulu", role: "Student" };

  const TASKS = [
    { id: 41, title: "Java tutor for my INF 2B bank-account assignment", category: "Programming & Tech Help", section: "Academic",
      location: "Library, Mbombela Campus", price: 250, status: "Posted", urgent: true,
      created_by_name: "Lerato Mokoena", created_by_member_type: "Student", image_urls: [M + "task-java.svg"],
      description: "I'm stuck on exception handling and unit tests for a Java BankAccount class. Looking for someone to go through it with me in a 2-hour session this week. I want to understand it, not just get it done. I'll book a library study room." },
    { id: 38, title: "Help moving boxes to my new res room", category: "Moving & Lifting", section: "General",
      location: "Residence Courtyard", price: 180, status: "Posted", urgent: false,
      created_by_name: "Sipho Nkosi", created_by_member_type: "Student", image_urls: [IMG + "UMP_GAPP_09_Tristan_McLaren_-_Student_Residence_Courtyard.jpg"] },
    { id: 36, title: "Print and bind my research report (3 copies)", category: "Printing & Typing", section: "Academic",
      location: "Building 5, Mbombela Campus", price: 90, status: "Posted", urgent: false,
      created_by_name: "Thandi Dlamini", created_by_member_type: "Student", image_urls: [] },
    { id: 33, title: "Photos for our society's open day stall", category: "Photography & Design", section: "General",
      location: "Student Centre", price: 400, status: "Posted", urgent: false,
      created_by_name: "Kagiso Molefe", created_by_member_type: "Student", image_urls: [] }
  ];

  const SALES = [
    { id: 72, title: "Engineering Mathematics textbook (5th ed.)", category: "Textbooks", section: "Academic",
      condition_status: "Good", location: "Library, Mbombela Campus", price: 350, status: "Available",
      seller_name: "Tshepo Maseko", image_urls: [M + "textbook-maths.svg"],
      description: "Stroud's Engineering Mathematics, 5th edition: the prescribed book for MATH 1A and 1B. A few pencil notes in chapter 3, otherwise in good shape. Happy to meet at the library." },
    { id: 70, title: "Casio fx-991ZA PLUS scientific calculator", category: "Calculators", section: "Academic",
      condition_status: "Excellent", location: "Student Centre", price: 220, status: "Available",
      seller_name: "Nomsa Khumalo", image_urls: [M + "calculator.svg"] },
    { id: 69, title: "Principles of Financial Accounting textbook", category: "Textbooks", section: "Academic",
      condition_status: "Fair", location: "Building 7, Mbombela Campus", price: 280, status: "Available",
      seller_name: "Zanele Ndlovu", image_urls: [M + "textbook-accounting.svg"] },
    { id: 66, title: "Lenovo IdeaPad 3 laptop (8 GB RAM)", category: "Laptops & Tablets", section: "Academic",
      condition_status: "Good", location: "Mbombela Campus", price: 4200, status: "Available",
      seller_name: "Kagiso Molefe", image_urls: [M + "laptop.svg"] }
  ];

  const EQUIPMENT = [
    { id: 25, name: "Canon EOS 250D camera kit", category: "Cameras & Audio", section: "General",
      condition_status: "Excellent", daily_price: 120, item_value: 5500, owner_name: "Sipho Nkosi",
      image_urls: [M + "camera.svg"], is_available: true,
      condition_checked_by_name: "Sipho Nkosi", condition_checked_date: "3 Oct 2026",
      booked_ranges: [{ start: "2026-10-21", end: "2026-10-22" }],
      description: "24 MP DSLR with an 18–55 mm lens, two batteries, a 64 GB card and a padded bag. Great for society events, film projects and portfolio shoots." },
    { id: 23, name: "Mini HD projector + HDMI cable", category: "Electronics & Gadgets", section: "General",
      condition_status: "Functional", daily_price: 90, owner_name: "Zanele Ndlovu", image_urls: [M + "projector.svg"], is_available: true },
    { id: 21, name: "Casio fx-9860GII graphing calculator", category: "Calculators", section: "Academic",
      condition_status: "Functional", daily_price: 25, owner_name: "Tshepo Maseko", image_urls: [M + "graphing-calculator.svg"], is_available: true },
    { id: 19, name: "Ring light with phone tripod", category: "Cameras & Audio", section: "General",
      condition_status: "Functional", daily_price: 40, owner_name: "Nomsa Khumalo", image_urls: [M + "ring-light.svg"], is_available: true }
  ];

  /* Same shape as the API's `terms` (backend rentalPolicy.service.js). */
  const RENTAL_TERMS = {
    returnTime: "18:00",
    paymentWindowHours: 24,
    policyVersion: "2026-10-proposed-1",
    cancellation: { summary: "Before you collect the item you can cancel for a full refund (demo). If the owner can't hand it over, you're refunded in full." },
    deposit:     { statusLabel: "Proposed — not in effect", inEffect: false, summary: "No security deposit is taken. A deposit policy is being reviewed and is not in effect." },
    earlyReturn: { statusLabel: "Proposed — not in effect", inEffect: false, summary: "Returning early is always allowed. A refund for unused days is being reviewed and is not in effect, so no refund is made automatically." },
    lateReturn:  { statusLabel: "Proposed — not in effect", inEffect: false, summary: "Late fees are being reviewed and are not in effect, so nothing is charged. Please return items on time or ask for an extension." }
  };

  /* Booking shown in the film: Thu 15 → Fri 16 Oct = 2 days (inclusive). */
  const BOOKING = { start: "2026-10-15", end: "2026-10-16", days: 2 };
  const QUOTE = (function () {
    const daily = 120, rent = daily * BOOKING.days;
    const fee = Math.min(50, Math.max(5, rent * 0.05));
    return { days: BOOKING.days, dailyPrice: daily, rentalAmount: rent, protectionFee: fee, depositAmount: 0,
             totalToHold: rent + fee, trust: { level: "trusted", label: "Trusted", goodRentals: 4 } };
  })();

  /* Protected sale (price ≥ R300): 3% buyer fee. */
  const SALE_RULES = (function () {
    const price = 350, fee = Math.round(price * 3) / 100;
    return { itemPrice: price, protectionFeePercent: 3, protectionFee: fee, total: price + fee, escrowThreshold: 300 };
  })();
  const HANDOVER_CODE = "4817";

  /* ── Cards ── */

  function heart(id) {
    return `<button type="button" class="save-heart-btn" data-save-id="${id}" aria-label="Save"><i class="ti ti-heart" aria-hidden="true"></i></button>`;
  }

  function taskCard(task) {
    return `
    <div class="market-card" data-card="task-${task.id}">
      <div class="market-image" style="position:relative;">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
        ${task.urgent ? `<div class="urgent-badge"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${heart(task.id)}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${avatarHtml(task.created_by_name)}</div>
            <div>
              <div class="market-user-name">${posterName(task.created_by_name)}</div>
              <div class="market-user-meta"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</div>
            </div>
          </div>
          ${sectionBadge(task.section || "General")}
        </div>
        <h3>${task.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${statusBadge(task.status)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${task.price} <span>/task</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a class="market-action-btn" data-view="task-${task.id}"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
          </div>
        </div>
      </div>
    </div>`;
  }

  function saleCard(item) {
    return `
    <div class="market-card" data-card="sale-${item.id}" data-search="${(item.title + " " + item.category).toLowerCase()}">
      <div class="market-image" style="position:relative;">
        <img src="${item.image_urls[0]}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" />
        ${heart(item.id)}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name)}</div>
            <div>
              <div class="market-user-name">${posterName(item.seller_name)}</div>
              <div class="market-user-meta"><i class="ti ti-shopping-bag" aria-hidden="true"></i> Student Seller</div>
            </div>
          </div>
          ${sectionBadge(item.section)}
        </div>
        <h3>${item.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.price}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a class="market-action-btn" data-view="sale-${item.id}"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
          </div>
        </div>
      </div>
    </div>`;
  }

  function equipmentCard(item) {
    return `
    <div class="market-card" data-card="equip-${item.id}">
      <div class="market-image" style="position:relative;">
        <img src="${item.image_urls[0]}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;" />
        ${heart(item.id)}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${avatarHtml(item.owner_name)}</div>
            <div>
              <div class="market-user-name">${posterName(item.owner_name)}</div>
              <div class="market-user-meta"><i class="ti ti-package" aria-hidden="true"></i> Equipment Owner</div>
            </div>
          </div>
          ${sectionBadge(item.section || "General")}
        </div>
        <h3>${item.name}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a class="market-action-btn" data-view="equip-${item.id}"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ── Detail pages ── */

  function detailImage(url) {
    return `<div class="detail-image-single" style="--detail-img:url('${url}')"><img src="${url}" alt="Listing image" /></div>`;
  }

  function summaryPerson(name, subtitle, avatarStyle = "") {
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
        <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;${avatarStyle}">${avatarHtml(name)}</div>
        <div>
          <div class="profile-link" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(name)}</div>
          <div style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:3px;">${subtitle}</div>
        </div>
      </div>`;
  }

  function field(label, html, mb = 12) {
    return `<div style="margin-bottom:${mb}px;"><div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${label}</div>${html}</div>`;
  }

  function reportButton() {
    return `<button type="button" class="secondary-button" style="margin-top:10px;color:var(--muted);"><i class="ti ti-flag" aria-hidden="true"></i> Report a problem</button>`;
  }

  function taskDetail(task) {
    return `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">${detailImage(task.image_urls[0])}</div>
        ${task.urgent ? `<div class="urgent-badge" style="display:inline-flex;margin-bottom:12px;"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${sectionBadge(task.section)}
        <h1 class="detail-title">${task.title}</h1>
        <p class="detail-description">${task.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          <span data-role="task-status-tag">${statusBadge(task.status)}</span>
        </div>
        <div id="offersSection"></div>
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Task Summary
        </h3>
        ${summaryPerson(task.created_by_name, `<i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student`)}
        ${field("Status", statusBadge(task.status))}
        ${field("Budget", `<div class="market-price">R${task.price} <span>/task</span></div>`, 20)}
        <button class="primary-button" id="applyForTaskButton"><i class="ti ti-hand-finger" aria-hidden="true"></i> Apply for this Task</button>
        <button class="secondary-button" id="makeOfferButton" style="margin-top:10px;"><i class="ti ti-tag" aria-hidden="true"></i> Offer a different price</button>
        <button type="button" class="secondary-button" style="margin-top:10px;display:flex;"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Tasks</button>
        ${reportButton()}
      </div>
    </div>`;
  }

  /* offers.js offerCard(): the student's own application at the listed price. */
  function applicationPanel(task) {
    return `
      <section class="offers-panel" aria-labelledby="offersPanelTitle">
        <div class="offers-panel-head">
          <h3 id="offersPanelTitle"><i class="ti ti-tag" aria-hidden="true"></i> Your application</h3>
          <span class="badge gold offers-demo-chip">Demo</span>
        </div>
        <p class="pay-note">Only you and the poster can see this.</p>
        <div class="offers-list">
          <article class="offer-card open">
            <header class="offer-card-head">
              <div class="offer-card-who">
                <strong>Your application</strong>
                <span>10 Oct · applied at the listed price</span>
              </div>
              <span class="badge blue">Application</span>
              ${statusBadge("Pending")}
            </header>
            <div class="offer-trail" aria-label="Amounts proposed so far">
              <span class="offer-chip current mine">${formatRand(task.price)}<small>you</small></span>
            </div>
            <p class="offer-note"><i class="ti ti-message-2" aria-hidden="true"></i> <span><strong>You:</strong> I got 82% for INF 2B and can help on Wednesday afternoon.</span></p>
            <p class="offer-meta">Waiting for the poster · 47h left · 3 counters left</p>
            <div class="offer-actions">
              <button type="button" class="secondary-button offer-btn danger"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Withdraw</button>
            </div>
          </article>
        </div>
      </section>`;
  }

  function protectionExplainerPanel() {
    return `
    <div class="pay-panel">
      <h4><i class="ti ti-shield-lock" aria-hidden="true"></i> Protected by Taskify <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
      <ol>
        <li>You pay in the app. Taskify <strong>holds</strong> the money — the seller doesn't get it yet.</li>
        <li>Meet on campus and check the item.</li>
        <li>Happy? Show the seller your <strong>4-digit handover code</strong>. They type it in and get paid.</li>
        <li>Not happy, or they don't show up? Keep your code and cancel for a refund.</li>
      </ol>
    </div>`;
  }

  /* sale-details.js orderPanel(), buyer view while the money is held. */
  function buyerOrderPanel() {
    return `
      <div class="pay-panel" style="border-color:var(--ump-green);">
        <h4><i class="ti ti-shield-check" aria-hidden="true"></i> Your payment is held <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
        <p class="pay-note" style="margin-bottom:4px;">Your handover code:</p>
        <div class="handover-code">${HANDOVER_CODE}</div>
        <p class="pay-note"><strong>Only show this code once you have the item and you're happy with it.</strong> The seller can't get paid without it. Nobody from Taskify will ever ask you for it.</p>
        <div class="money-breakdown">
          ${moneyRow("Item price", SALE_RULES.itemPrice)}
          ${moneyRow("Protection fee", SALE_RULES.protectionFee)}
          ${moneyRow("Held", SALE_RULES.total, { strong: true })}
        </div>
      </div>`;
  }

  function saleDetail(item) {
    return `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">${detailImage(item.image_urls[0])}</div>
        ${sectionBadge(item.section)}
        <h1 class="detail-title">${item.title}</h1>
        <p class="detail-description">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
          <span data-role="sale-status">${statusBadge(item.status)}</span>
        </div>
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Item Summary
        </h3>
        ${summaryPerson(item.seller_name, "Student Seller", "background:rgba(245,180,0,0.14);color:#b38900;")}
        ${field("Condition", conditionBadge(item.condition_status))}
        ${field("Location", `<div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>`)}
        ${field("Price", `<div class="market-price">R${item.price}</div>`, 20)}
        <div data-role="sale-actions-before">
          ${protectionExplainerPanel()}
          <button class="primary-button" id="buyProtectedButton"><i class="ti ti-shield-lock" aria-hidden="true"></i> Buy with Taskify Protection</button>
          <button class="secondary-button" style="margin-top:10px;"><i class="ti ti-tag" aria-hidden="true"></i> Make an offer</button>
        </div>
        <div data-role="sale-actions-after" style="display:none;">
          ${buyerOrderPanel()}
          <button class="secondary-button" style="margin-top:10px;"><i class="ti ti-message-circle" aria-hidden="true"></i> Message Seller</button>
        </div>
        <button type="button" class="secondary-button" style="margin-top:10px;display:flex;"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Sales</button>
      </div>
    </div>`;
  }

  function equipmentDetail(item) {
    return `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">${detailImage(item.image_urls[0])}</div>
        ${sectionBadge(item.section)}
        <h1 class="detail-title">${item.name}</h1>
        <p class="detail-description">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Taking bookings</div>
        </div>
        <div class="booked-ranges">
          <div class="booked-ranges-title"><i class="ti ti-calendar-off" aria-hidden="true"></i> Already booked</div>
          ${item.booked_ranges.map(r => `<span class="booked-range">${rentalDate(r.start)}${r.end !== r.start ? ` – ${rentalDate(r.end)}` : ""}</span>`).join("")}
        </div>
        <details class="rental-terms-box" style="margin-top:18px;">
          <summary>Rental terms</summary>
          ${rentalTermsHtml(RENTAL_TERMS)}
        </details>
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Rental Summary
        </h3>
        ${summaryPerson(item.owner_name, "Equipment Owner")}
        ${field("Daily rate", `<div class="market-price">R${item.daily_price} <span>/day</span></div>`)}
        ${field("Item value", `<div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;"><i class="ti ti-shield-check" aria-hidden="true"></i> ${formatRand(item.item_value)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">No deposit is taken while the deposit policy is reviewed. Your trust level decides how valuable an item you can rent.</div>`)}
        ${field("Condition", `${conditionBadge(item.condition_status)}
          <div class="condition-checked-note"><i class="ti ti-user-check" aria-hidden="true"></i> Last checked by ${item.condition_checked_by_name} (owner) on ${item.condition_checked_date}</div>`)}
        ${field("Return time", `<div style="font-size:13px;font-weight:600;"><i class="ti ti-clock" aria-hidden="true"></i> ${RENTAL_TERMS.returnTime} on the last day (South African time)</div>`, 20)}
        <button class="primary-button" id="openBookingButton"><i class="ti ti-calendar-plus" aria-hidden="true"></i> Request Booking</button>
        <button type="button" class="secondary-button" style="margin-top:10px;display:flex;"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Rentals</button>
        ${reportButton()}
      </div>
    </div>`;
  }

  /* equipment-details.js renderQuote() */
  function bookingQuote() {
    const q = QUOTE;
    return `
    ${demoPaymentBanner("Sending a request is free. You'll only be asked to pay (demo) once the owner approves.")}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      ${trustChip(q.trust.level, q.trust.label)}
      <span style="font-size:12px;color:var(--muted);">${q.trust.goodRentals} good rentals</span>
    </div>
    <div class="money-breakdown">
      ${moneyRow(`Rent (${q.days} days × ${formatRand(q.dailyPrice)})`, q.rentalAmount, { hint: "goes to the owner once you return the item" })}
      ${moneyRow("Protection fee", q.protectionFee, { hint: "small fee for the shared damage pot, not refunded" })}
      ${moneyRow("Deposit", q.depositAmount, { hint: "none — deposits are switched off while the deposit policy is reviewed" })}
      ${moneyRow("Total to pay once approved", q.totalToHold, { strong: true })}
    </div>
    <p class="pay-note"><i class="ti ti-clock" aria-hidden="true"></i> Due back by <strong>${rentalDate(BOOKING.end)}, ${RENTAL_TERMS.returnTime}</strong> (South African time).</p>
    <details class="rental-terms-box" open>
      <summary>Rental terms</summary>
      ${rentalTermsHtml(RENTAL_TERMS)}
    </details>`;
  }

  /* sale-details.js buy modal body */
  function buyModalBody(item) {
    const r = SALE_RULES;
    return `
      ${demoPaymentBanner("No real payment gateway is connected. This simulates Taskify holding your money until you receive the item.")}
      <p class="pay-note">You're buying <strong>${item.title}</strong> from ${item.seller_name}.</p>
      <div class="money-breakdown">
        ${moneyRow("Item price", r.itemPrice, { hint: "goes to the seller after handover" })}
        ${moneyRow(`Protection fee (${r.protectionFeePercent}%)`, r.protectionFee, { hint: "keeps your money safe until you have the item" })}
        ${moneyRow("Total to hold", r.total, { strong: true })}
      </div>
      <p class="pay-note">After paying you'll get a <strong>4-digit handover code</strong>. Only show it to the seller once you have the item.</p>`;
  }

  /* offers.js openOfferForm({ mode: "apply" }) intro */
  function applyIntro(task) {
    return `<p class="pay-note">You're applying to do this task at the listed price of <strong>${formatRand(task.price)}</strong>. The poster chooses who does it from everyone who applies. If they choose you, the task is yours and their payment is held by Taskify (demo). Want a different price? Cancel and use <strong>Offer a different price</strong> instead.</p>`;
  }

  global.FilmData = {
    VIEWER, TASKS, SALES, EQUIPMENT, RENTAL_TERMS, BOOKING, QUOTE, SALE_RULES, HANDOVER_CODE,
    taskCard, saleCard, equipmentCard, taskDetail, applicationPanel, saleDetail, equipmentDetail,
    bookingQuote, buyModalBody, applyIntro
  };
})(window);
