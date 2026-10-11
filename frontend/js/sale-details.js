/* Guests (no account) can view this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   messaging the seller is guarded individually below. */
const currentUser          = getCurrentUser();
const saleDetailsContainer = document.getElementById("saleDetailsContainer");

const params = new URLSearchParams(window.location.search);
const saleId = params.get("id");

document.getElementById("backButton")?.addEventListener("click", () => goBack("./sales.html"));

/* ── Taskify Protection (DEMO — no real money moves) ──
   Items at/above the threshold (backend: config/paymentSettings.js) are
   paid through Taskify: the money is "held", the buyer gets a 4-digit
   handover code, and the seller only gets paid when they type that code
   in after handing the item over. Cheaper items stay cash-in-person. */
const buyModal          = document.getElementById("buyModal");
const buyModalBody      = document.getElementById("buyModalBody");
const simulateBuyButton = document.getElementById("simulateBuyButton");

document.getElementById("closeBuyModal")?.addEventListener("click", () => closeModal(buyModal));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(buyModal));

function safetyTipsPanel(rules) {
  return `
    <div class="pay-panel">
      <h4><i class="ti ti-cash" aria-hidden="true"></i> Cash in person</h4>
      <ul>
        <li>Items under R${rules.escrowThreshold} are paid in cash when you meet.</li>
        <li>Meet somewhere busy on campus — the library, the student centre or near security.</li>
        <li>Check the item properly before you hand over any money.</li>
        <li>Never pay upfront, and never accept a screenshot as "proof of payment".</li>
      </ul>
    </div>`;
}

function protectionExplainerPanel(rules) {
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

/* Phone numbers only come back from the API once the (demo) payment is
   held between the buyer and seller — see sales.service.js. */
function contactLine(label, phone) {
  if (!phone) return "";
  return `<p class="pay-note" style="display:flex;align-items:center;gap:6px;"><i class="ti ti-phone" aria-hidden="true"></i> ${label}: <strong>${escapeHtml(phone)}</strong></p>`;
}

/* Text people typed (the problem description) goes into the page as text,
   never as HTML. */
function escapeSaleText(value) {
  return escapeHtml(value);
}

const reportSaleProblemButton = (order) => `
  <button class="secondary-button" id="reportSaleProblemButton" data-order-id="${order.id}" style="margin-top:6px;">
    <i class="ti ti-alert-triangle" aria-hidden="true"></i> Meetup failed? Report a problem
  </button>`;

/* While a problem is being looked at — same for both sides, plus who
   reported it and what they said (only the buyer and seller see this). */
function disputeNotice(order) {
  const reportedByMe = order.disputed_by === order.role;
  const who = reportedByMe ? "You" : (order.role === "buyer" ? "The seller" : "The buyer");
  return `
    <div class="sale-dispute-note">
      <strong><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${who} reported a problem</strong>
      <p>${escapeSaleText(order.dispute_category_label || "Something went wrong")}${order.dispute_reason ? `: "${escapeSaleText(order.dispute_reason)}"` : ""}</p>
      <p>The money stays held and the item stays reserved while a Taskify admin looks at it. They can pay the seller, refund the buyer, or ask you both to try the handover again.</p>
    </div>`;
}

/* The buyer's or seller's view of an order still in progress / finished. */
function orderPanel(item, order) {
  if (!order) return "";
  const waiting = order.status === "Held" || order.status === "Disputed";
  const disputed = order.status === "Disputed";

  if (waiting && order.role === "buyer") {
    return `
      <div class="pay-panel" style="border-color:${disputed ? "var(--ump-red)" : "var(--ump-green)"};">
        <h4><i class="ti ti-shield-check" aria-hidden="true"></i> Your payment is held <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
        ${disputed ? disputeNotice(order) : ""}
        <p class="pay-note" style="margin-bottom:4px;">Your handover code:</p>
        <div class="handover-code">${escapeHtml(order.handover_code)}</div>
        <p class="pay-note"><strong>Only show this code once you have the item and you're happy with it.</strong> The seller can't get paid without it. Nobody from Taskify will ever ask you for it.</p>
        ${contactLine("Seller", item.seller_phone_number)}
        ${order.locked ? `<p class="pay-note blocked">Too many wrong codes were entered, so this order is locked.${disputed ? "" : " If you didn't get the item, cancel for a refund."}</p>` : ""}
        <div class="money-breakdown">
          ${moneyRow("Item price", order.item_price)}
          ${moneyRow("Protection fee", order.protection_fee)}
          ${moneyRow("Held", order.total_amount, { strong: true })}
        </div>
        ${disputed ? "" : `
          <button class="secondary-button" id="cancelOrderButton" data-order-id="${order.id}" style="color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
            <i class="ti ti-arrow-back-up" aria-hidden="true"></i> Cancel &amp; get refund
          </button>
          <p class="pay-note" style="margin-top:6px;">Seller didn't turn up or the item isn't right? Cancelling refunds you straight away. Report a problem if you need an admin to step in.</p>
          ${reportSaleProblemButton(order)}`}
      </div>`;
  }

  if (waiting && order.role === "seller") {
    return `
      <div class="pay-panel" style="border-color:${disputed ? "var(--ump-red)" : "var(--ump-green)"};">
        <h4><i class="ti ti-shield-check" aria-hidden="true"></i> ${escapeSaleText(order.buyer_name || "The buyer")} has paid <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
        ${disputed ? disputeNotice(order) : ""}
        <p class="pay-note">${formatRand(order.item_price)} is held by Taskify. Meet on campus, let them check the item, then ask for their 4-digit handover code and type it here to get paid.
          <strong>Keep hold of the item until the code is accepted.</strong></p>
        ${contactLine("Buyer", order.buyer_phone_number)}
        ${order.locked
          ? `<p class="pay-note blocked">Too many wrong codes were entered, so this order is locked.${disputed ? " An admin is looking at it." : " The buyer can cancel it for a refund, or you can report a problem."}</p>`
          : `<input type="text" id="handoverCodeInput" class="handover-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" aria-label="Buyer's 4-digit handover code" />
             <button class="primary-button" id="releaseOrderButton" data-order-id="${order.id}" style="width:100%;">
               <i class="ti ti-lock-open" aria-hidden="true"></i> Confirm handover &amp; get paid
             </button>
             <p class="pay-note" style="margin-top:8px;">${order.attempts_left} attempt${order.attempts_left === 1 ? "" : "s"} left.</p>`}
        <button class="secondary-button" id="cancelOrderButton" data-order-id="${order.id}" style="margin-top:6px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel sale (refund buyer)
        </button>
        ${disputed ? "" : reportSaleProblemButton(order)}
      </div>`;
  }

  if (order.status === "Released") {
    return `
      <div class="pay-panel">
        <h4><i class="ti ti-circle-check" aria-hidden="true" style="color:var(--ump-green);"></i> Sale complete</h4>
        <p class="pay-note" style="margin-bottom:0;">${order.role === "seller"
          ? `${formatRand(order.item_price)} was released to you (demo).`
          : `You confirmed the handover. Your payment was released to the seller (demo).`}${order.dispute_outcome === "released" ? " An admin settled the problem that was reported." : ""}</p>
      </div>`;
  }

  if (order.status === "Refunded" && item.status === "Available") {
    const byAdmin = order.dispute_outcome === "refunded";
    return `<p class="pay-note">Your last order on this item was ${byAdmin ? "refunded by an admin after a problem was reported" : "cancelled"}${order.role === "buyer" ? " and refunded (demo)" : ""}.</p>`;
  }
  return "";
}

/* ── Report a problem (buyer or seller, before the handover) ── */
const SALE_PROBLEM_OPTIONS = {
  buyer: [
    ["no_show", "The seller didn't turn up"],
    ["not_as_described", "The item isn't what was advertised"],
    ["damaged_item", "The item is broken or damaged"],
    ["code_problem", "The handover code isn't working"],
    ["other", "Something else"]
  ],
  seller: [
    ["no_show", "The buyer didn't turn up"],
    ["handed_over_no_code", "I handed the item over but didn't get the code"],
    ["code_problem", "The handover code isn't working"],
    ["other", "Something else"]
  ]
};

const saleProblemModal   = document.getElementById("saleProblemModal");
const saleProblemForm    = document.getElementById("saleProblemForm");
const saleProblemMessage = document.getElementById("saleProblemMessage");
let saleProblemOrderId = null;

function openSaleProblemModal(order) {
  saleProblemOrderId = order.id;
  saleProblemForm?.reset();
  saleProblemMessage.textContent = "";
  document.getElementById("saleProblemCategory").innerHTML = SALE_PROBLEM_OPTIONS[order.role]
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  document.getElementById("saleProblemIntro").textContent = order.role === "buyer"
    ? "Your money stays held and nothing is released. The seller is told, and a Taskify admin will look at it. You won't be able to cancel for an instant refund while they do."
    : "The money stays held and the item stays reserved. The buyer is told, and a Taskify admin will look at it. If you meet and sort it out, you can still enter the code as normal.";
  openModal(saleProblemModal);
  document.getElementById("saleProblemReason")?.focus();
}

document.getElementById("cancelSaleProblem")?.addEventListener("click", () => closeModal(saleProblemModal));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(saleProblemModal));

saleProblemForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const reason = document.getElementById("saleProblemReason").value.trim();
  if (reason.length < 10) {
    saleProblemMessage.textContent = "Please describe what happened in at least 10 characters.";
    return;
  }
  const submitBtn = document.getElementById("submitSaleProblem");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Reporting…`;
  try {
    await apiRequest(`/sales/orders/${saleProblemOrderId}/dispute`, "POST", {
      reason, category: document.getElementById("saleProblemCategory").value
    });
    closeModal(saleProblemModal);
    showToast("Problem reported. The money stays held while an admin looks at it.");
    await loadSaleDetails();
  } catch (err) {
    saleProblemMessage.textContent = err.message;
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

async function loadSaleDetails() {
  try {
    const res = await apiRequest(`/sales/${saleId}`);
    renderSaleDetails(res.data);
  } catch (err) {
    saleDetailsContainer.innerHTML = errorState(err.message || "This item is no longer available.");
    showToast(err.message, "error");
  }
}

function renderSaleDetails(item) {
  const isOwn = !!currentUser && Number(item.seller_id) === Number(currentUser.id);

  /* Anyone signed in, except the seller, can report this item. */
  const reportTarget = currentUser && !isOwn
    ? { contextType: "sales_item", contextId: item.id, itemTitle: item.title, reportedUserId: item.seller_id, reportedUserName: item.seller_name }
    : null;

  const rules = item.payment_rules || { requiresProtection: false, escrowThreshold: 300 };
  const order = item.my_order;
  const activeOrder = order && ["Held", "Disputed"].includes(order.status) ? order : null;

  /* Messaging the seller opens once you've bought through Taskify
     Protection — or straight away on cheap cash items, where messaging is
     how you arrange the sale. The server decides (item.can_message, see
     conversation.service.js messagingAccess). */
  const messageSellerButton = (primary = false) => item.can_message
    ? `<button class="${primary ? "primary-button" : "secondary-button"}" id="messageSellerButton"${primary ? "" : ' style="margin-top:10px;"'}>
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Seller
       </button>`
    : "";

  let actionArea;
  if (activeOrder) {
    actionArea = `${orderPanel(item, activeOrder)}${activeOrder.role === "buyer" ? messageSellerButton() : ""}`;
  } else if (isOwn) {
    actionArea = `${orderPanel(item, order)}<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your item</div>
       ${item.status === "Available" ? `
         <a href="./sales.html?edit=${item.id}" class="secondary-button" style="margin-top:10px;">
           <i class="ti ti-edit" aria-hidden="true"></i> Edit Listing
         </a>
         <button class="secondary-button mark-sold-btn" data-item-id="${item.id}" style="margin-top:10px;">
           <i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold
         </button>` : ""}
       <button class="secondary-button delete-sale-btn" data-item-id="${item.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
         <i class="ti ti-trash" aria-hidden="true"></i> Delete Listing
       </button>`;
  } else if (item.status === "Reserved") {
    actionArea = `<div class="badge gold"><i class="ti ti-clock" aria-hidden="true"></i> Reserved — another student is buying this</div>`;
  } else if (item.status !== "Available") {
    actionArea = `${orderPanel(item, order)}<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Already sold</div>${messageSellerButton()}`;
  } else if (rules.requiresProtection) {
    /* In-app offers (js/offers.js) are only on protected items. Starts
       hidden for signed-in users until offers.js knows they can offer. */
    actionArea = `${orderPanel(item, order)}${protectionExplainerPanel(rules)}
       <button class="primary-button" id="buyProtectedButton">
         <i class="ti ti-shield-lock" aria-hidden="true"></i> Buy with Taskify Protection
       </button>
       <button class="secondary-button" id="makeOfferButton" style="margin-top:10px;"${currentUser ? " hidden" : ""}>
         <i class="ti ti-tag" aria-hidden="true"></i> Make an offer
       </button>
       ${messageSellerButton()}`;
  } else {
    actionArea = `${safetyTipsPanel(rules)}${messageSellerButton(true)}`;
  }

  saleDetailsContainer.innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">
          ${renderImageGallery(item.image_urls, "ti-shopping-bag")}
          ${endorsementCornerBadge(item)}
          ${lecturerPostedCornerBadge(item.seller_member_type, item.seller_lecturer_verified)}
        </div>
        ${sectionBadge(item.section || "General")}
        <h1 class="detail-title">${escapeHtml(item.title)}</h1>
        <p class="detail-description">${escapeHtml(item.description)}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(item.category)}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(item.location)}</div>
          ${statusBadge(item.status)}
        </div>
        ${endorsementDetailBlock(item)}
        <div id="offersSection"></div>
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Item Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name, item.seller_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${item.seller_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${escapeHtml(posterName(item.seller_name, item.seller_lecturer_title))}</div>
            <div style="font-size:11px;color:var(--muted);">Student Seller</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Condition</div>
          ${conditionBadge(item.condition_status)}
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Location</div>
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(item.location)}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Price</div>
          <div class="market-price">R${escapeHtml(item.price)}</div>
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Sales
        </button>
        ${reportTarget ? reportProblemButtonHtml() : ""}
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./sales.html"));

  attachProfileLinkEvents();

  /* Report a problem about THIS item (goes to admins, not a review) */
  document.getElementById("reportProblemButton")?.addEventListener("click", () => openReportModal(reportTarget));

  /* Owners get the Offers panel on protected items (their negotiations,
     even after the item is reserved); buyers only while it's available. */
  const canOffer = !isOwn && item.status === "Available" && rules.requiresProtection;
  if ((isOwn && rules.requiresProtection) || canOffer) {
    initOffers({
      contextType: "sales_item",
      contextId: saleId,
      listing: item,
      isOwner: isOwn,
      sectionEl: document.getElementById("offersSection"),
      makeOfferButton: document.getElementById("makeOfferButton"),
      onListingChanged: loadSaleDetails
    });
  }

  document.getElementById("messageSellerButton")?.addEventListener("click", (e) => {
    if (!requireAuthAction("Sign in to message the seller.")) return;
    startConversationAndRedirect("sale", saleId, e.currentTarget);
  });

  document.getElementById("buyProtectedButton")?.addEventListener("click", () => {
    if (!requireAuthAction("Sign in to buy this item.")) return;
    buyModalBody.innerHTML = `
      ${demoPaymentBanner("No real payment gateway is connected. This simulates Taskify holding your money until you receive the item.")}
      <p class="pay-note">You're buying <strong>${escapeHtml(item.title)}</strong> from ${escapeHtml(posterName(item.seller_name, item.seller_lecturer_title))}.</p>
      <div class="money-breakdown">
        ${moneyRow("Item price", rules.itemPrice, { hint: "goes to the seller after handover" })}
        ${moneyRow(`Protection fee (${rules.protectionFeePercent}%)`, rules.protectionFee, { hint: "keeps your money safe until you have the item" })}
        ${moneyRow("Total to hold", rules.total, { strong: true })}
      </div>
      <p class="pay-note">After paying you'll get a <strong>4-digit handover code</strong>. Only show it to the seller once you have the item.</p>`;
    simulateBuyButton.disabled = false;
    openModal(buyModal);
  });

  if (simulateBuyButton) {
    simulateBuyButton.onclick = async () => {
      const originalHtml = simulateBuyButton.innerHTML;
      simulateBuyButton.disabled = true;
      simulateBuyButton.innerHTML = `<i class="ti ti-shield-lock busy-icon busy-guard" aria-hidden="true"></i> Holding payment…`;
      try {
        await apiRequest(`/sales/${saleId}/buy`, "POST");
        closeModal(buyModal);
        showPaymentMoment("held", `${formatRand(rules.total)} is held until you have the item. Your handover code is ready.`);
        await loadSaleDetails();
      } catch (err) {
        showToast(err.message, "error");
        closeModal(buyModal);
        await loadSaleDetails();
      } finally {
        simulateBuyButton.disabled = false;
        simulateBuyButton.innerHTML = originalHtml;
      }
    };
  }

  document.getElementById("reportSaleProblemButton")?.addEventListener("click", () => openSaleProblemModal(order));

  document.getElementById("handoverCodeInput")?.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
  });

  document.getElementById("releaseOrderButton")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const code = document.getElementById("handoverCodeInput").value.trim();
    if (!/^\d{4}$/.test(code)) { showToast("Enter the buyer's 4-digit code.", "error"); return; }
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Checking…`;
    try {
      await apiRequest(`/sales/orders/${btn.dataset.orderId}/release`, "POST", { code });
      showPaymentMoment("released", `Code accepted. ${formatRand(order.item_price)} released to you.`);
    } catch (err) {
      showToast(err.message, "error");
    }
    await loadSaleDetails();
  });

  document.getElementById("cancelOrderButton")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const isBuyer = order?.role === "buyer";
    if (!confirm(isBuyer
      ? "Cancel this order? Your money will be refunded (demo) and the item goes back on sale."
      : "Cancel this sale? The buyer will be refunded (demo) and your item goes back on sale.")) return;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Cancelling…`;
    try {
      await apiRequest(`/sales/orders/${btn.dataset.orderId}/cancel`, "PATCH");
      showToast(isBuyer ? "Order cancelled. Refunded (demo)." : "Sale cancelled. Buyer refunded (demo).");
    } catch (err) {
      showToast(err.message, "error");
    }
    await loadSaleDetails();
  });

  document.querySelector(".mark-sold-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Updating…`;
    try {
      await apiRequest(`/sales/${saleId}/sold`, "PATCH");
      showToast("Item marked as sold!");
      await loadSaleDetails();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold`;
    }
  });

  document.querySelector(".delete-sale-btn")?.addEventListener("click", async (e) => {
    if (!confirm("Permanently delete this listing?")) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Deleting…`;
    try {
      await apiRequest(`/sales/${saleId}`, "DELETE");
      showToast("Listing deleted.");
      setTimeout(() => window.location.href = "./sales.html", 800);
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete Listing`;
    }
  });
}

loadSaleDetails();