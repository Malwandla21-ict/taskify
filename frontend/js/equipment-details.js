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

/* ── Booking request + quote ──
   Sending a request takes no money: the owner approves first, then the
   renter pays (demo) from their rental history. Every number and term
   comes from the backend (config/paymentSettings.js, config/rentalPolicy.js). */
let quoteRequestId = 0;

function renderQuotePlaceholder() {
  bookingQuote.innerHTML = `<p class="pay-note"><i class="ti ti-calendar-search" aria-hidden="true"></i> Pick your dates to see the price and the rental terms.</p>`;
  bookingSubmitButton.disabled = true;
}

function renderQuote(q) {
  bookingQuote.innerHTML = `
    ${demoPaymentBanner("Sending a request is free. You'll only be asked to pay (demo) once the owner approves.")}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      ${trustChip(q.trust.level, q.trust.label)}
      <span style="font-size:12px;color:var(--muted);">${q.trust.goodRentals} good rental${q.trust.goodRentals === 1 ? "" : "s"}</span>
    </div>
    ${q.allowed ? `
      <div class="money-breakdown">
        ${moneyRow(`Rent (${q.days} day${q.days === 1 ? "" : "s"} × ${formatRand(q.dailyPrice)})`, q.rentalAmount, { hint: "goes to the owner once you return the item" })}
        ${moneyRow("Protection fee", q.protectionFee, { hint: "small fee for the shared damage pot, not refunded" })}
        ${moneyRow("Deposit", q.depositAmount, { hint: q.depositsEnabled ? "returned after a good return" : "none — deposits are switched off while the deposit policy is reviewed" })}
        ${moneyRow("Total to pay once approved", q.totalToHold, { strong: true })}
      </div>
      <p class="pay-note"><i class="ti ti-clock" aria-hidden="true"></i> Due back by <strong>${rentalDate(bookingEndDateInput.value)}, ${escapeReportText(q.terms.returnTime)}</strong> (South African time).</p>
      <details class="rental-terms-box" open>
        <summary>Rental terms</summary>
        ${rentalTermsHtml(q.terms)}
      </details>` : `
      <p class="pay-note blocked"><i class="ti ti-lock" aria-hidden="true"></i> ${escapeReportText(q.reason)}</p>`}`;
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

/* Dates already taken on this item (no names) so renters pick free dates. */
function bookedRangesHtml(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) {
    return `<p class="pay-note" style="margin-top:14px;"><i class="ti ti-calendar-check" aria-hidden="true"></i> No upcoming bookings — any dates are free.</p>`;
  }
  return `
    <div class="booked-ranges">
      <div class="booked-ranges-title"><i class="ti ti-calendar-off" aria-hidden="true"></i> Already booked</div>
      ${ranges.map((r) => `<span class="booked-range">${rentalDate(r.start)}${r.end !== r.start ? ` – ${rentalDate(r.end)}` : ""}</span>`).join("")}
    </div>`;
}

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

  /* Anyone signed in, except the owner, can report this listing. */
  const reportTarget = currentUser && !isOwn
    ? { contextType: "equipment", contextId: item.id, itemTitle: item.name, reportedUserId: item.owner_id, reportedUserName: item.owner_name }
    : null;

  /* Messaging the owner opens once you've requested a booking. The server
     decides (item.can_message, see conversation.service.js messagingAccess). */
  const messageOwnerButton = item.can_message
    ? `<button class="secondary-button" id="messageOwnerButton" style="margin-top:10px;">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Owner
       </button>`
    : "";

  let actionArea;
  if (isOwn) {
    actionArea = `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your listing</div>
                  <a href="./equipment.html?edit=${item.id}" class="secondary-button" style="margin-top:10px;">
                    <i class="ti ti-edit" aria-hidden="true"></i> Edit Listing
                  </a>
                  <button class="secondary-button delete-equipment-btn" data-equipment-id="${item.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
                    <i class="ti ti-trash" aria-hidden="true"></i> Delete Listing
                  </button>`;
  } else if (!item.is_available) {
    actionArea = `<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Not taking bookings right now</div>
                  ${messageOwnerButton}`;
  } else {
    actionArea = `<button class="primary-button" id="openBookingButton" data-equipment-id="${item.id}">
                    <i class="ti ti-calendar-plus" aria-hidden="true"></i> Request Booking
                  </button>
                  ${messageOwnerButton}`;
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
          ${conditionBadge(item.condition_status)}
          ${item.is_available
            ? `<div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Taking bookings</div>`
            : `<div class="market-tag gold"><i class="ti ti-lock" aria-hidden="true"></i> Paused</div>`}
        </div>
        ${endorsementDetailBlock(item)}
        ${bookedRangesHtml(item.booked_ranges)}
        <details class="rental-terms-box" style="margin-top:18px;">
          <summary>Rental terms</summary>
          ${rentalTermsHtml(item.terms)}
        </details>
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
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">No deposit is taken while the deposit policy is reviewed. Your trust level decides how valuable an item you can rent.</div>
        </div>` : ""}
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Condition</div>
          ${item.condition_status
            ? conditionBadge(item.condition_status)
            : `<div class="badge navy">Not stated</div>`}
          <div class="condition-checked-note">
            <i class="ti ti-user-check" aria-hidden="true"></i> ${equipmentConditionCheckedText(item)}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Return time</div>
          <div style="font-size:13px;font-weight:600;"><i class="ti ti-clock" aria-hidden="true"></i> ${escapeReportText(item.terms?.returnTime || "18:00")} on the last day (South African time)</div>
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Rentals
        </button>
        ${reportTarget ? reportProblemButtonHtml() : ""}
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./equipment.html"));

  attachProfileLinkEvents();

  /* Report a problem about THIS item (goes to admins, not a review) */
  document.getElementById("reportProblemButton")?.addEventListener("click", () => openReportModal(reportTarget));

  document.getElementById("openBookingButton")?.addEventListener("click", () => {
    if (!requireAuthAction("Sign in to book this equipment.")) return;
    bookingForm.reset();
    bookingEquipmentIdInput.value = item.id;
    bookingMessage.textContent = "";
    const today = todayInSast();
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
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Sending request…`;
  try {
    await apiRequest(`/equipment/${bookingEquipmentIdInput.value}/book`, "POST", {
      startDate: bookingStartDateInput.value,
      endDate:   bookingEndDateInput.value
    });
    showToast("Request sent. You'll be asked to pay only once the owner approves.");
    closeModal(bookingModal, bookingForm, bookingMessage);
    setTimeout(() => window.location.href = "./equipment.html#history", 1200);
  } catch (err) {
    bookingMessage.textContent = err.message;
    bookingMessage.style.color = "red";
    showToast(err.message, "error");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

loadEquipmentDetails();