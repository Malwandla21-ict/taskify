/* Guests (no account) can view this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   booking or messaging the owner is guarded individually below. */
const currentUser = getCurrentUser();

const equipmentDetailsContainer = document.getElementById("equipmentDetailsContainer");
const bookingModal              = document.getElementById("bookingModal");
const bookingForm               = document.getElementById("bookingForm");
const bookingEquipmentIdInput   = document.getElementById("bookingEquipmentId");
const bookingStartDateInput     = document.getElementById("bookingStartDate");
const bookingEndDateInput       = document.getElementById("bookingEndDate");
const closeBookingModalButton   = document.getElementById("closeBookingModal");
const bookingMessage            = document.getElementById("bookingMessage");
const bookingQuote              = document.getElementById("bookingQuote");
const bookingSubmitButton       = document.getElementById("bookingSubmitButton");

/* ── DEMO payment quote ──
   Every number (rent, protection fee, trust-based deposit, whether this
   renter may book this item at all) comes from the backend — see
   backend/src/config/paymentSettings.js. Nothing is charged for real. */
let quoteRequestId = 0;

function renderQuotePlaceholder() {
  bookingQuote.innerHTML = `<p class="pay-note"><i class="ti ti-calendar-search" aria-hidden="true"></i> Pick your dates to see the price breakdown.</p>`;
  bookingSubmitButton.disabled = true;
}

function renderQuote(q) {
  const depositHint = q.itemValueMissing
    ? "this older listing has no item value, so no deposit"
    : q.trust.depositPercent > 0
      ? `${q.trust.depositPercent}% of the item's ${formatRand(q.itemValue)} value — you get it back after a good return`
      : "none — you're a Top renter";

  bookingQuote.innerHTML = `
    ${demoPaymentBanner("No real payment gateway is connected. This simulates your money being held by Taskify until the rental is finished.")}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      ${trustChip(q.trust.level, q.trust.label)}
      <span style="font-size:12px;color:var(--muted);">${q.trust.goodRentals} good rental${q.trust.goodRentals === 1 ? "" : "s"}</span>
    </div>
    ${q.allowed && q.trust.next?.hint ? `<p class="pay-note" style="margin-bottom:8px;">${q.trust.next.hint}</p>` : ""}
    ${q.allowed ? `
      <div class="money-breakdown">
        ${moneyRow(`Rent (${q.days} day${q.days === 1 ? "" : "s"} × ${formatRand(q.dailyPrice)})`, q.rentalAmount, { hint: "goes to the owner once you return the item" })}
        ${moneyRow("Protection fee", q.protectionFee, { hint: "small fee for the shared damage pot, not refunded" })}
        ${moneyRow("Deposit", q.depositAmount, { hint: depositHint })}
        ${moneyRow("Total to hold", q.totalToHold, { strong: true })}
      </div>` : `
      <p class="pay-note blocked"><i class="ti ti-lock" aria-hidden="true"></i> ${q.reason}</p>`}`;
  bookingSubmitButton.disabled = !q.allowed;
}

async function refreshQuote() {
  const startDate = bookingStartDateInput.value;
  const endDate   = bookingEndDateInput.value;
  if (!startDate || !endDate) { renderQuotePlaceholder(); return; }
  if (endDate < startDate) {
    bookingQuote.innerHTML = `<p class="pay-note blocked">End date cannot be before start date.</p>`;
    bookingSubmitButton.disabled = true;
    return;
  }

  const requestId = ++quoteRequestId;
  bookingSubmitButton.disabled = true;
  bookingQuote.innerHTML = `<p class="pay-note"><i class="ti ti-loader" aria-hidden="true"></i> Working out your price…</p>`;
  try {
    const res = await apiRequest(`/equipment/${bookingEquipmentIdInput.value}/rental-quote?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
    if (requestId !== quoteRequestId) return; // a newer date change already replaced this one
    renderQuote(res.data);
  } catch (err) {
    if (requestId !== quoteRequestId) return;
    bookingQuote.innerHTML = `<p class="pay-note blocked">${err.message}</p>`;
    bookingSubmitButton.disabled = true;
  }
}

bookingStartDateInput?.addEventListener("change", refreshQuote);
bookingEndDateInput?.addEventListener("change", refreshQuote);

const params      = new URLSearchParams(window.location.search);
const equipmentId = params.get("id");

document.getElementById("backButton")?.addEventListener("click", () => goBack("./equipment.html"));

closeBookingModalButton?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));

async function loadEquipmentDetails() {
  try {
    const res = await apiRequest(`/equipment/${equipmentId}`);
    renderEquipmentDetails(res.data);
  } catch (err) {
    equipmentDetailsContainer.innerHTML = errorState(err.message || "This equipment is no longer available.");
    showToast(err.message, "error");
  }
}

function renderEquipmentDetails(item) {
  const isOwn = !!currentUser && Number(item.owner_id) === Number(currentUser.id);

  let actionArea;
  if (isOwn) {
    actionArea = `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your listing</div>
                  <button class="secondary-button delete-equipment-btn" data-equipment-id="${item.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
                    <i class="ti ti-trash" aria-hidden="true"></i> Delete Listing
                  </button>`;
  } else if (!item.is_available) {
    actionArea = `<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Currently booked</div>
                  <button class="secondary-button" id="messageOwnerButton" style="margin-top:10px;">
                    <i class="ti ti-message-circle" aria-hidden="true"></i> Message Owner
                  </button>`;
  } else {
    actionArea = `<button class="primary-button" id="openBookingButton" data-equipment-id="${item.id}">
                    <i class="ti ti-calendar-plus" aria-hidden="true"></i> Request Booking
                  </button>
                  <button class="secondary-button" id="messageOwnerButton" style="margin-top:10px;">
                    <i class="ti ti-message-circle" aria-hidden="true"></i> Message Owner
                  </button>`;
  }

  equipmentDetailsContainer.innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">
          ${renderImageGallery(item.image_urls, "ti-package")}
          ${endorsementCornerBadge(item)}
          ${lecturerPostedCornerBadge(item.owner_member_type)}
        </div>
        ${sectionBadge(item.section || "General")}
        <h1 class="detail-title">${item.name}</h1>
        <p class="detail-description">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status || "Good")}
          ${item.is_available
            ? `<div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>`
            : `<div class="market-tag gold"><i class="ti ti-lock" aria-hidden="true"></i> Booked</div>`}
        </div>
        ${endorsementDetailBlock(item)}
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Rental Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(item.owner_name, item.owner_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${item.owner_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(item.owner_name, item.owner_lecturer_title)}</div>
            <div style="font-size:11px;color:var(--muted);">Equipment Owner</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Daily rate</div>
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
        </div>
        ${item.item_value != null ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Item value</div>
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-shield-check" aria-hidden="true"></i> ${formatRand(item.item_value)}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">Your deposit depends on your renter trust level.</div>
        </div>` : ""}
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Status</div>
          ${item.is_available
            ? `<div class="badge"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>`
            : `<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Booked</div>`}
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Rentals
        </button>
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./equipment.html"));

  attachProfileLinkEvents();

  document.getElementById("openBookingButton")?.addEventListener("click", () => {
    if (!requireAuthAction("Sign in to book this equipment.")) return;
    bookingForm.reset();
    bookingEquipmentIdInput.value = item.id;
    bookingMessage.textContent = "";
    const today = new Date().toISOString().slice(0, 10);
    bookingStartDateInput.min = today;
    bookingEndDateInput.min = today;
    renderQuotePlaceholder();
    openModal(bookingModal);
  });

  document.getElementById("messageOwnerButton")?.addEventListener("click", (e) => {
    if (!requireAuthAction("Sign in to message the owner.")) return;
    startConversationAndRedirect("equipment", equipmentId, e.currentTarget);
  });

  document.querySelector(".delete-equipment-btn")?.addEventListener("click", async (e) => {
    if (!confirm("Permanently delete this equipment listing?")) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Deleting…`;
    try {
      await apiRequest(`/equipment/${equipmentId}`, "DELETE");
      showToast("Equipment listing deleted.");
      setTimeout(() => window.location.href = "./equipment.html", 800);
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete Listing`;
    }
  });
}

bookingForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector("button[type='submit']");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Holding payment…`;
  try {
    await apiRequest(`/equipment/${bookingEquipmentIdInput.value}/book`, "POST", {
      startDate: bookingStartDateInput.value,
      endDate:   bookingEndDateInput.value
    });
    showToast("Booking requested! Your payment is held by Taskify (demo) until the owner responds.");
    closeModal(bookingModal, bookingForm, bookingMessage);
    setTimeout(() => window.location.href = "./equipment.html", 800);
  } catch (err) {
    bookingMessage.textContent = err.message;
    bookingMessage.style.color = "red";
    showToast(err.message, "error");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

loadEquipmentDetails();