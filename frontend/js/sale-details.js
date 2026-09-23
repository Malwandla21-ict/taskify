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

/* The buyer's or seller's view of an order still in progress / finished. */
function orderPanel(item, order) {
  if (!order) return "";

  if (order.status === "Held" && order.role === "buyer") {
    return `
      <div class="pay-panel" style="border-color:var(--ump-green);">
        <h4><i class="ti ti-shield-check" aria-hidden="true"></i> Your payment is held <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
        <p class="pay-note" style="margin-bottom:4px;">Your handover code:</p>
        <div class="handover-code">${order.handover_code}</div>
        <p class="pay-note"><strong>Only show this code once you have the item and you're happy with it.</strong> The seller can't get paid without it. Nobody from Taskify will ever ask you for it.</p>
        ${order.locked ? `<p class="pay-note blocked">Too many wrong codes were entered, so this order is locked. If you didn't get the item, cancel for a refund.</p>` : ""}
        <div class="money-breakdown">
          ${moneyRow("Item price", order.item_price)}
          ${moneyRow("Protection fee", order.protection_fee)}
          ${moneyRow("Held", order.total_amount, { strong: true })}
        </div>
        <button class="secondary-button" id="cancelOrderButton" data-order-id="${order.id}" style="color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
          <i class="ti ti-arrow-back-up" aria-hidden="true"></i> Cancel &amp; get refund
        </button>
      </div>`;
  }

  if (order.status === "Held" && order.role === "seller") {
    return `
      <div class="pay-panel" style="border-color:var(--ump-green);">
        <h4><i class="ti ti-shield-check" aria-hidden="true"></i> ${order.buyer_name || "The buyer"} has paid <span class="badge gold" style="margin-left:auto;">Demo</span></h4>
        <p class="pay-note">${formatRand(order.item_price)} is held by Taskify. Meet on campus, let them check the item, then ask for their 4-digit handover code and type it here to get paid.</p>
        ${order.locked
          ? `<p class="pay-note blocked">Too many wrong codes were entered, so this order is locked. The buyer can cancel it for a refund.</p>`
          : `<input type="text" id="handoverCodeInput" class="handover-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" aria-label="Buyer's 4-digit handover code" />
             <button class="primary-button" id="releaseOrderButton" data-order-id="${order.id}" style="width:100%;">
               <i class="ti ti-lock-open" aria-hidden="true"></i> Confirm handover &amp; get paid
             </button>
             <p class="pay-note" style="margin-top:8px;">${order.attempts_left} attempt${order.attempts_left === 1 ? "" : "s"} left.</p>`}
        <button class="secondary-button" id="cancelOrderButton" data-order-id="${order.id}" style="margin-top:6px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel sale (refund buyer)
        </button>
      </div>`;
  }

  if (order.status === "Released") {
    return `
      <div class="pay-panel">
        <h4><i class="ti ti-circle-check" aria-hidden="true" style="color:var(--ump-green);"></i> Sale complete</h4>
        <p class="pay-note" style="margin-bottom:0;">${order.role === "seller"
          ? `${formatRand(order.item_price)} was released to you (demo).`
          : `You confirmed the handover. Your payment was released to the seller (demo).`}</p>
      </div>`;
  }

  if (order.status === "Refunded" && item.status === "Available") {
    return `<p class="pay-note">Your last order on this item was cancelled${order.role === "buyer" ? " and refunded (demo)" : ""}.</p>`;
  }
  return "";
}

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

  const rules = item.payment_rules || { requiresProtection: false, escrowThreshold: 300 };
  const order = item.my_order;
  const activeOrder = order && order.status === "Held" ? order : null;

  let actionArea;
  if (activeOrder) {
    actionArea = orderPanel(item, activeOrder);
  } else if (isOwn) {
    actionArea = `${orderPanel(item, order)}<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your item</div>
       ${item.status === "Available" ? `
         <button class="secondary-button mark-sold-btn" data-item-id="${item.id}" style="margin-top:10px;">
           <i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold
         </button>` : ""}
       <button class="secondary-button delete-sale-btn" data-item-id="${item.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
         <i class="ti ti-trash" aria-hidden="true"></i> Delete Listing
       </button>`;
  } else if (item.status === "Reserved") {
    actionArea = `<div class="badge gold"><i class="ti ti-clock" aria-hidden="true"></i> Reserved — another student is buying this</div>`;
  } else if (item.status !== "Available") {
    actionArea = `${orderPanel(item, order)}<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Already sold</div>`;
  } else if (rules.requiresProtection) {
    actionArea = `${orderPanel(item, order)}${protectionExplainerPanel(rules)}
       <button class="primary-button" id="buyProtectedButton">
         <i class="ti ti-shield-lock" aria-hidden="true"></i> Buy with Taskify Protection
       </button>
       <button class="secondary-button" id="messageSellerButton" style="margin-top:10px;">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Seller
       </button>`;
  } else {
    actionArea = `${safetyTipsPanel(rules)}
       <button class="primary-button" id="messageSellerButton">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Seller
       </button>`;
  }

  saleDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        <div style="position:relative;">
          ${renderImageGallery(item.image_urls, "ti-shopping-bag")}
          ${endorsementCornerBadge(item)}
          ${lecturerPostedCornerBadge(item.seller_member_type)}
        </div>
        ${sectionBadge(item.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${item.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
          ${statusBadge(item.status)}
        </div>
        ${endorsementDetailBlock(item)}
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Item Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name, item.seller_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${item.seller_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(item.seller_name, item.seller_lecturer_title)}</div>
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
            <i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Price</div>
          <div class="market-price">R${item.price}</div>
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Sales
        </button>
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./sales.html"));

  attachProfileLinkEvents();

  document.getElementById("messageSellerButton")?.addEventListener("click", (e) => {
    if (!requireAuthAction("Sign in to message the seller.")) return;
    startConversationAndRedirect("sale", saleId, e.currentTarget);
  });

  document.getElementById("buyProtectedButton")?.addEventListener("click", () => {
    if (!requireAuthAction("Sign in to buy this item.")) return;
    buyModalBody.innerHTML = `
      ${demoPaymentBanner("No real payment gateway is connected. This simulates Taskify holding your money until you receive the item.")}
      <p class="pay-note">You're buying <strong>${item.title}</strong> from ${posterName(item.seller_name, item.seller_lecturer_title)}.</p>
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
      simulateBuyButton.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Holding payment…`;
      try {
        await apiRequest(`/sales/${saleId}/buy`, "POST");
        closeModal(buyModal);
        showToast("Payment held (demo). Your handover code is ready.");
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
      showToast("Code accepted! Payment released to you (demo).");
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