/* Guests (no account) can browse this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   anything that actually needs an account is guarded individually below. */
const currentUser = getCurrentUser();

const equipmentContainer        = document.getElementById("equipmentContainer");
const equipmentHistoryContainer = document.getElementById("equipmentHistoryContainer");
const equipmentHistoryMiniContainer = document.getElementById("equipmentHistoryMiniContainer");
const equipmentForm             = document.getElementById("equipmentForm");
const equipmentMessage          = document.getElementById("equipmentMessage");
const equipmentStep1            = document.getElementById("equipmentStep1");
const equipmentStep2            = document.getElementById("equipmentStep2");
const equipmentStep3            = document.getElementById("equipmentStep3");
const equipmentStepText         = document.getElementById("equipmentStepText");
const equipmentProgressFill     = document.getElementById("equipmentProgressFill");
const equipmentPreview          = document.getElementById("equipmentPreview");
const eDot1                     = document.getElementById("eDot1");
const eDot2                     = document.getElementById("eDot2");
const eDot3                     = document.getElementById("eDot3");

const equipmentSearchInput   = document.getElementById("equipmentSearchInput");
const equipmentCategoryFilter = document.getElementById("equipmentCategoryFilter");
const equipmentPriceFilter    = document.getElementById("equipmentPriceFilter");
const equipmentSortSelect     = document.getElementById("equipmentSortSelect");

let cachedEquipment  = [];
let selectedSection  = "All";

const equipmentCreateOverlay     = document.getElementById("equipmentCreateOverlay");
const equipmentCreateModal       = document.getElementById("equipmentCreateModal");
const openEquipmentModalButton   = document.getElementById("openEquipmentModalButton");
const heroListEquipmentButton    = document.getElementById("heroListEquipmentButton");
const closeEquipmentModalButton  = document.getElementById("closeEquipmentModalButton");

const reviewModal            = document.getElementById("reviewModal");
const reviewModalTitle       = document.getElementById("reviewModalTitle");
const reviewForm             = document.getElementById("reviewForm");
const reviewBookingIdInput   = document.getElementById("reviewBookingId");
const reviewIdInput          = document.getElementById("reviewId");
const ratingInput            = document.getElementById("rating");
const commentInput           = document.getElementById("comment");
const closeReviewModalButton = document.getElementById("closeReviewModal");
const reviewMessage          = document.getElementById("reviewMessage");

closeReviewModalButton?.addEventListener("click", () => closeModal(reviewModal, reviewForm, reviewMessage));
document.getElementById("overlay")?.addEventListener("click", () => {
  closeModal(reviewModal, reviewForm, reviewMessage);
  closeRentalPhotoModal();
  closeModal(damageModal, damageForm, damageMessage);
});

/* ── Payment simulation (DEMO) — condition photos + damage report ──
   Pickup = renter's "before" photos, Return = "after" photos. Both are
   uploaded through the normal /upload endpoint first, then the URLs are
   saved on the booking. */
const rentalPhotoModal        = document.getElementById("rentalPhotoModal");
const rentalPhotoTitle        = document.getElementById("rentalPhotoTitle");
const rentalPhotoIntro        = document.getElementById("rentalPhotoIntro");
const rentalPhotoBookingId    = document.getElementById("rentalPhotoBookingId");
const rentalPhotoMode         = document.getElementById("rentalPhotoMode");
const rentalPhotoMessage      = document.getElementById("rentalPhotoMessage");
const submitRentalPhotosBtn   = document.getElementById("submitRentalPhotos");
const submitRentalPhotosLabel = document.getElementById("submitRentalPhotosLabel");
const rentalPhotoUploader     = initImageUploader("rentalPhotoUploadArea", "rentalPhotoPreviewGrid");

const pickupConditionGroup = document.getElementById("pickupConditionGroup");
const pickupConditionInput = document.getElementById("pickupCondition");
const pickupConditionHint  = document.getElementById("pickupConditionHint");

const damageModal   = document.getElementById("damageModal");
const damageForm    = document.getElementById("damageForm");
const damageMessage = document.getElementById("damageMessage");

/* listedCondition: what the owner's listing says, so the renter can
   simply confirm it (or change it if the item isn't as described). */
function openRentalPhotoModal(bookingId, mode, listedCondition = "", byOwner = false) {
  rentalPhotoBookingId.value = bookingId;
  rentalPhotoMode.value = mode;
  rentalPhotoMessage.textContent = "";
  if (rentalPhotoUploader) rentalPhotoUploader.reset();
  if (pickupConditionGroup) pickupConditionGroup.hidden = mode !== "pickup";
  if (pickupConditionInput) pickupConditionInput.value = mode === "pickup" ? (listedCondition || "") : "";
  if (pickupConditionHint) {
    pickupConditionHint.textContent = listedCondition
      ? `The listing says "${listedCondition}". Change it if that's not what you received. The owner will be told.`
      : "The owner didn't state a condition, so yours will be the first on record.";
  }
  if (mode === "pickup") {
    rentalPhotoTitle.innerHTML = `<i class="ti ti-camera" aria-hidden="true"></i> Confirm Pickup`;
    rentalPhotoIntro.textContent = "Take photos of the item right now, before you use it — front, back and any scratches it already has. These are your proof of the condition you received it in.";
    submitRentalPhotosLabel.textContent = "Confirm Pickup";
  } else {
    rentalPhotoTitle.innerHTML = `<i class="ti ti-package-export" aria-hidden="true"></i> Return Equipment`;
    rentalPhotoIntro.textContent = byOwner
      ? "Record the return once the item is back with you. Take photos of it as you received it — they're compared with the pickup photos."
      : "Take photos of the item as it's handed back. The owner compares these with the pickup photos before the deposit is released.";
    submitRentalPhotosLabel.textContent = "Confirm Return";
  }
  openModal(rentalPhotoModal);
}

function closeRentalPhotoModal() {
  closeModal(rentalPhotoModal, null, rentalPhotoMessage);
  if (rentalPhotoUploader) rentalPhotoUploader.reset();
}

document.getElementById("closeRentalPhotoModal")?.addEventListener("click", closeRentalPhotoModal);
document.getElementById("closeDamageModal")?.addEventListener("click", () => closeModal(damageModal, damageForm, damageMessage));

submitRentalPhotosBtn?.addEventListener("click", async () => {
  if (!rentalPhotoUploader || !rentalPhotoUploader.getFiles().length) {
    rentalPhotoMessage.textContent = "Please add at least one photo.";
    rentalPhotoMessage.style.color = "red";
    return;
  }
  const mode = rentalPhotoMode.value;
  if (mode === "pickup" && !pickupConditionInput?.value) {
    rentalPhotoMessage.textContent = "Please confirm what condition the item is in.";
    rentalPhotoMessage.style.color = "red";
    return;
  }
  const originalHtml = submitRentalPhotosBtn.innerHTML;
  submitRentalPhotosBtn.disabled = true;
  submitRentalPhotosBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Saving…`;
  try {
    const photoUrls = await rentalPhotoUploader.upload("equipment");
    const body = mode === "pickup" ? { photoUrls, pickupCondition: pickupConditionInput.value } : { photoUrls };
    const res = await apiRequest(`/equipment/bookings/${rentalPhotoBookingId.value}/${mode === "pickup" ? "pickup" : "return"}`, "PATCH", body);
    /* The owner's rent is released on return (not pickup), so only a
       return plays the "released" pop-up. The deposit stays held until
       the owner checks the item's condition. */
    const booking = res?.data || {};
    if (mode === "return" && booking.payment_status === "Released") {
      const isRenter = !!currentUser && Number(booking.renter_id) === Number(currentUser.id);
      showPaymentMoment("released", isRenter
        ? `Equipment returned. ${formatRand(booking.rental_amount)} sent to the owner, who will now check its condition.`
        : `Equipment returned. ${formatRand(booking.rental_amount)} released to you. Please check its condition.`);
    } else {
      showToast(mode === "pickup" ? "Pickup confirmed. Enjoy the rental!" : "Equipment returned. The owner will check its condition.");
    }
    closeRentalPhotoModal();
    await loadEquipment();
    await loadEquipmentHistory();
  } catch (err) {
    rentalPhotoMessage.textContent = err.message;
    rentalPhotoMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitRentalPhotosBtn.disabled = false;
    submitRentalPhotosBtn.innerHTML = originalHtml;
  }
});

damageForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = damageForm.querySelector("button[type='submit']");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Reporting…`;
  try {
    await apiRequest(`/equipment/bookings/${document.getElementById("damageBookingId").value}/report-damage`, "PATCH", {
      note: document.getElementById("damageNote").value.trim()
    });
    showToast("Damage reported. An admin will review the photos.");
    closeModal(damageModal, damageForm, damageMessage);
    await loadEquipmentHistory();
  } catch (err) {
    damageMessage.textContent = err.message;
    damageMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

/* Edit mode: the same form edits an existing listing when the page is
   opened as equipment.html?edit=<id> (the Edit button on its detail page). */
let editingEquipmentId = null;
const EQUIPMENT_SUBMIT_HTML = {
  create: `<i class="ti ti-send" aria-hidden="true"></i> Publish Listing`,
  edit:   `<i class="ti ti-device-floppy" aria-hidden="true"></i> Save Changes`
};

function setEquipmentSubmitLabel() {
  const submitBtn = equipmentForm?.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.innerHTML = editingEquipmentId ? EQUIPMENT_SUBMIT_HTML.edit : EQUIPMENT_SUBMIT_HTML.create;
}

function openEquipmentCreateModal() {
  if (!requireAuthAction("Sign in to list equipment.")) return;
  editingEquipmentId = null;
  equipmentForm?.reset();
  equipmentMessage.textContent = "";
  setEquipmentSubmitLabel();
  showEquipmentStep(1);
  if (equipmentUploader) equipmentUploader.reset();
  /* "Before you rent this out" must be ticked to list (not when editing). */
  const equipmentAckBox = document.getElementById("equipmentAckBox");
  if (equipmentAckBox) { equipmentAckBox.hidden = false; equipmentAckBox.innerHTML = ""; renderAcknowledgementBox(equipmentAckBox, "rental_owner"); }
  const equipmentNudge = document.getElementById("equipmentPhotoNudge");
  if (equipmentNudge) equipmentNudge.innerHTML = profilePhotoNudgeHtml("Renters can recognise you at pickup and return.");
  equipmentCreateOverlay?.classList.add("open");
  equipmentCreateModal?.classList.add("open");
}

function openEquipmentEditModal(item) {
  const editAckBox = document.getElementById("equipmentAckBox");
  if (editAckBox) { editAckBox.hidden = true; editAckBox.innerHTML = ""; }
  editingEquipmentId = item.id;
  equipmentForm?.reset();
  equipmentMessage.textContent = "";
  document.getElementById("equipmentName").value        = item.name || "";
  fillCategorySelect(document.getElementById("equipmentCategory"), "equipment", item.category || "", document.getElementById("equipmentCategoryHint"));
  document.getElementById("equipmentDescription").value = item.description || "";
  document.getElementById("equipmentCondition").value   = item.condition_status || "";
  document.getElementById("equipmentDailyPrice").value  = item.daily_price ?? "";
  document.getElementById("equipmentItemValue").value   = item.item_value ?? "";
  if (equipmentUploader) equipmentUploader.setExisting(item.image_urls || []);
  updateEquipmentPreview();
  setEquipmentSubmitLabel();
  showEquipmentStep(1);
  equipmentCreateOverlay?.classList.add("open");
  equipmentCreateModal?.classList.add("open");
}

async function openEquipmentEditFromUrl() {
  const editId = getEditIdFromUrl();
  if (!editId || !currentUser) return;
  clearEditParam();
  try {
    const res = await apiRequest(`/equipment/${editId}`);
    const item = res.data;
    if (Number(item.owner_id) !== Number(currentUser.id)) { showToast("You can only edit your own listings.", "error"); return; }
    openEquipmentEditModal(item);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function closeEquipmentCreateModal() {
  equipmentCreateOverlay?.classList.remove("open");
  equipmentCreateModal?.classList.remove("open");
}

openEquipmentModalButton?.addEventListener("click", openEquipmentCreateModal);
heroListEquipmentButton?.addEventListener("click", openEquipmentCreateModal);
closeEquipmentModalButton?.addEventListener("click", closeEquipmentCreateModal);
equipmentCreateOverlay?.addEventListener("click", closeEquipmentCreateModal);

function showEquipmentStep(n) {
  equipmentStep1.style.display = n === 1 ? "block" : "none";
  equipmentStep2.style.display = n === 2 ? "block" : "none";
  equipmentStep3.style.display = n === 3 ? "block" : "none";
  equipmentStepText.textContent   = `${editingEquipmentId ? "Editing · " : ""}Step ${n} of 3`;
  equipmentProgressFill.style.width = n === 1 ? "33%" : n === 2 ? "66%" : "100%";
  [eDot1, eDot2, eDot3].forEach((dot, i) => {
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (i + 1 < n)  dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });
}

function updateEquipmentPreview() {
  const name       = document.getElementById("equipmentName").value.trim();
  const category   = document.getElementById("equipmentCategory").value.trim();
  const section    = categorySection("equipment", category) || "General";
  const desc       = document.getElementById("equipmentDescription").value.trim();
  const condition  = document.getElementById("equipmentCondition").value;
  const dailyPrice = document.getElementById("equipmentDailyPrice").value.trim();

  equipmentPreview.innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${escapeHtml(name || "Equipment name")}</h3>
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">${escapeHtml(desc || "Equipment description will appear here.")}</p>
    <div class="market-tags">
      ${sectionBadge(section)}
      <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(category || "Category")}</div>
      ${conditionBadge(condition)}
    </div>
    <div style="margin-top:14px;font-size:13px;color:var(--muted);">
      Daily rate: <strong style="color:var(--ump-green);font-size:16px;">R${escapeHtml(dailyPrice || "0")}/day</strong>
    </div>`;
}

function validateEquipmentStep1() {
  if (!document.getElementById("equipmentName").value.trim() ||
      !document.getElementById("equipmentCategory").value.trim()) {
    showToast("Please complete the equipment basics.", "error"); return false;
  }
  return true;
}

function validateEquipmentStep2() {
  if (!document.getElementById("equipmentDescription").value.trim()) {
    showToast("Please add an equipment description.", "error"); return false;
  }
  if (!document.getElementById("equipmentCondition").value) {
    showToast("Please choose the item's condition.", "error"); return false;
  }
  return true;
}

document.getElementById("nextEquipmentStep2")?.addEventListener("click", () => { if (validateEquipmentStep1()) showEquipmentStep(2); });
document.getElementById("nextEquipmentStep3")?.addEventListener("click", () => { if (validateEquipmentStep2()) { updateEquipmentPreview(); showEquipmentStep(3); } });
document.getElementById("backEquipmentStep1")?.addEventListener("click", () => showEquipmentStep(1));
document.getElementById("backEquipmentStep2")?.addEventListener("click", () => showEquipmentStep(2));
document.getElementById("equipmentDailyPrice")?.addEventListener("input", updateEquipmentPreview);

document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderEquipment();
  });
});

equipmentSearchInput?.addEventListener("input", renderEquipment);
equipmentCategoryFilter?.addEventListener("change", renderEquipment);
equipmentPriceFilter?.addEventListener("change", renderEquipment);
equipmentSortSelect?.addEventListener("change", renderEquipment);

/* Fixed list (not built from whatever has been posted) so every
   category shows up, even before anyone has used it. */
function populateCategoryFilter() {
  fillCategoryFilter(equipmentCategoryFilter, "equipment");
}

/* ── Client-side-only "saved" heart toggle ── local per browser only;
   there is no saved-listings table/endpoint in the backend yet. */
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedEquipment") || "[]"); }
  catch { return []; }
}
function toggleSavedId(id) {
  const saved = getSavedIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedEquipment", JSON.stringify(saved));
  return saved.includes(id);
}
function attachSaveHeartEvents() {
  document.querySelectorAll(".save-heart-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.saveId);
      const nowSaved = toggleSavedId(id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
    });
  });
}

function equipmentCard(item) {
  const isOwn = !!currentUser && Number(item.owner_id) === Number(currentUser.id);
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  const isSaved = getSavedIds().includes(item.id);

  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" class="lightbox-img" data-gallery="equip-${item.id}" data-full="${escapeHtml(imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light blue"><i class="ti ti-package" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
        ${lecturerPostedCornerBadge(item.owner_member_type, item.owner_lecturer_verified)}
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${item.id}" aria-label="Save equipment">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${avatarHtml(item.owner_name, item.owner_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.owner_id}" style="cursor:pointer;">${escapeHtml(posterName(item.owner_name, item.owner_lecturer_title))}</div>
              <div class="market-user-meta"><i class="ti ti-package" aria-hidden="true"></i> Equipment Owner</div>
            </div>
          </div>
          ${sectionBadge(item.section || "General")}
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(item.category)}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
          ${endorsementBadge(item)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${escapeHtml(item.daily_price)} <span>/day</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a href="./equipment-details.html?id=${item.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
            ${isOwn ? `
              <div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Yours</div>
              ${pendingReviewBadge(item.moderation_status)}
              <button class="market-action-btn outline delete-equipment-btn" data-equipment-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete
              </button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

function safeMap(items, builder, label) {
  return items.map(item => {
    try {
      return builder(item);
    } catch (err) {
      console.error(`${label} card failed to render for item:`, item, err);
      return "";
    }
  }).join("");
}

function getFilteredSortedEquipment() {
  const q = equipmentSearchInput?.value.trim().toLowerCase() || "";
  const category = equipmentCategoryFilter?.value || "All";
  const priceBucket = equipmentPriceFilter?.value || "All";

  let filtered = cachedEquipment.filter(i => {
    const matchesSection  = selectedSection === "All" || i.section === selectedSection;
    const matchesCategory = category === "All" || i.category === category;
    const matchesSearch   = !q || [i.name, i.description, i.category].some(f => f?.toLowerCase().includes(q));
    const price = Number(i.daily_price);
    const matchesPrice =
      priceBucket === "All" ? true :
      priceBucket === "under50" ? price < 50 :
      priceBucket === "50to150" ? price >= 50 && price <= 150 :
      price > 150;
    return matchesSection && matchesCategory && matchesSearch && matchesPrice;
  });

  const sort = equipmentSortSelect?.value || "newest";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "price_asc")  return Number(a.daily_price) - Number(b.daily_price);
    if (sort === "price_desc") return Number(b.daily_price) - Number(a.daily_price);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return filtered;
}

function renderEquipment() {
  const filtered = getFilteredSortedEquipment();
  equipmentContainer.innerHTML = filtered.length
    ? safeMap(filtered, equipmentCard, "equipment")
    : emptyState("ti-package", "No equipment found", "Try a different filter or list your own.");
  attachDeleteEquipmentEvents();
  attachProfileLinkEvents();
  attachSaveHeartEvents();
}

/* DEMO money + condition summary for a booking made with the payment
   simulation. Legacy bookings (made before it) have no payment_status and
   show nothing extra. */
function bookingMoneyLine(booking, isOwner) {
  if (!booking.payment_status) return "";
  const depositText = {
    None:     "no deposit",
    Held:     "held by Taskify",
    Refunded: "released back to renter",
    Disputed: "on hold — damage reported"
  }[booking.deposit_status] || "";
  const paymentText = {
    Unpaid:   "not paid yet",
    Held:     "held by Taskify",
    Released: isOwner ? "released to you" : "released to owner",
    Refunded: "refunded"
  }[booking.payment_status] || "";
  const conditionText = {
    Pending: isOwner ? "Check the item and confirm its condition." : "Waiting for the owner to check the item.",
    OK:      booking.damage_outcome === "renter_not_at_fault"
      ? "An admin found the renter wasn't at fault for the reported damage."
      : "Owner confirmed it came back in the same condition.",
    Damaged: booking.damage_outcome === "damage_confirmed"
      ? "Damage confirmed by an admin. Nothing was charged."
      : "Damage reported — an admin will review."
  }[booking.condition_status] || "";

  return `
    <div class="booking-money-line">
      <div><i class="ti ti-receipt" aria-hidden="true"></i> Rent <strong>${formatRand(booking.rental_amount)}</strong> (${paymentText}) · Fee <strong>${formatRand(booking.protection_fee)}</strong></div>
      ${Number(booking.deposit_amount) > 0
        ? `<div><i class="ti ti-shield-lock" aria-hidden="true"></i> Deposit <strong>${formatRand(booking.deposit_amount)}</strong> — ${depositText} <span style="opacity:.7;">(demo)</span></div>`
        : `<div><i class="ti ti-shield-lock" aria-hidden="true"></i> No deposit</div>`}
      ${booking.pickup_condition ? `<div><i class="ti ti-clipboard-check" aria-hidden="true"></i> Condition at pickup: <strong>${escapeHtml(booking.pickup_condition)}</strong> (confirmed by renter)</div>` : ""}
      ${conditionText ? `<div><i class="ti ti-clipboard-check" aria-hidden="true"></i> ${conditionText}</div>` : ""}
      ${booking.damage_note ? `<div style="color:var(--ump-red);"><i class="ti ti-alert-triangle" aria-hidden="true"></i> "${escapeReportText(booking.damage_note)}"</div>` : ""}
      ${booking.pickup_photos?.length ? `<div style="margin-top:6px;">Pickup photos</div>${conditionPhotoStrip(booking.pickup_photos, `pickup-${booking.id}`)}` : ""}
      ${booking.return_photos?.length ? `<div style="margin-top:6px;">Return photos</div>${conditionPhotoStrip(booking.return_photos, `return-${booking.id}`)}` : ""}
    </div>`;
}

const CANCEL_REASON_TEXT = {
  declined: "The owner declined this request.",
  renter_cancelled: "Cancelled by the renter.",
  item_not_returned: "Cancelled by the renter because the item wasn't back from the previous rental.",
  owner_cancelled: "Cancelled by the owner.",
  request_expired: "The request expired without an answer.",
  payment_expired: "Not paid in time, so the approval lapsed.",
  dates_taken: "Those dates were booked by someone else.",
  defective_at_pickup: "The renter refused the item at pickup."
};

/* What stage a booking is at, in plain words. */
function rentalStage(b) {
  if (b.status === "Pending") return { label: "Requested", tone: "gold" };
  if (b.status === "Awaiting Payment") return { label: "Awaiting payment", tone: "gold" };
  if (b.status === "Confirmed" && !b.out_on_rent) return b.waiting_for_return
    ? { label: "Waiting for item", tone: "red" }
    : { label: "Ready for collection", tone: "blue" };
  if (b.status === "Confirmed") return b.is_overdue ? { label: "Overdue", tone: "red" } : { label: "Out on rent", tone: "blue" };
  if (b.status === "Returned" && b.condition_status === "Pending") return { label: "Return check", tone: "gold" };
  if (b.status === "Returned" && b.condition_status === "Damaged" && !b.damage_outcome) return { label: "Damage reported", tone: "red" };
  if (b.status === "Returned") return { label: "Completed", tone: "" };
  return { label: "Cancelled", tone: "red" };
}

function lateLabel(minutes) {
  if (!minutes) return "on time";
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} late`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} late`;
  return `${minutes} min late`;
}

/* Deadlines, extension progress, problem reports and the NON-BINDING
   early/late estimates for one booking. */
function rentalTimeline(b, isOwner) {
  const lines = [];
  const line = (icon, html, cls = "") => lines.push(`<div class="rental-line ${cls}"><i class="ti ${icon}" aria-hidden="true"></i> <span>${html}</span></div>`);

  if (b.status === "Awaiting Payment" && b.payment_due_at) {
    line("ti-credit-card", `${isOwner ? "Renter must pay" : "Pay"} by <strong>${rentalDeadline(b.payment_due_at)}</strong> or the dates are released.`);
  }
  if (["Confirmed", "Awaiting Payment", "Pending"].includes(b.status) && b.return_due_at) {
    line("ti-clock", `Due back by <strong>${rentalDeadline(b.return_due_at)}</strong>`, b.is_overdue ? "overdue" : "");
  }
  if (b.status === "Returned" && b.return_minutes_late != null) {
    line("ti-clock-check", `Returned ${lateLabel(b.return_minutes_late)}${b.return_minutes_late > 0 ? " — no late fee is charged (not in effect)" : ""}.`);
  }
  if (b.waiting_for_return) {
    line("ti-hourglass", `The previous rental of this item is overdue (it was due back by <strong>${rentalDeadline(b.waiting_for_return.due_at)}</strong>). ${isOwner
      ? "Record its return as soon as it's back. If you can't hand it over in time, use \"Can't hand it over\" — the renter is refunded in full (demo)."
      : "The owner has been told, and you'll be notified when it's back. If you'd rather not wait, cancel for a full refund (demo)."}`, "overdue");
  }
  if (b.status === "Cancelled") {
    line("ti-circle-x", `${CANCEL_REASON_TEXT[b.cancel_reason] || "Cancelled."}${b.cancel_note ? ` "${escapeReportText(b.cancel_note)}"` : ""}`);
  }

  const x = b.extension;
  if (x && b.status === "Confirmed") {
    const extra = formatRand(Number(x.extra_amount) + Number(x.extra_fee || 0));
    if (x.status === "Requested") line("ti-calendar-plus", `Extension to <strong>${rentalDate(x.new_end_date)}</strong> requested (${extra}). ${isOwner ? "Waiting for your answer." : "Waiting for the owner."}`);
    if (x.status === "Awaiting Payment") line("ti-calendar-plus", `Extension to <strong>${rentalDate(x.new_end_date)}</strong> approved — ${isOwner ? "waiting for the renter to pay" : `pay ${extra} by ${rentalDeadline(x.payment_due_at)}`}. Until then the current deadline applies.`);
    if (x.status === "Declined") line("ti-calendar-x", `Extension to ${rentalDate(x.new_end_date)} was declined.`);
    if (x.status === "Expired") line("ti-calendar-x", `Extension to ${rentalDate(x.new_end_date)} expired.`);
  }

  if (b.problem_reported_at) {
    line("ti-alert-triangle", `${b.problem_reported_by === (isOwner ? "owner" : "renter") ? "You" : (isOwner ? "The renter" : "The owner")} reported: ${escapeReportText(b.problem_label || "a problem")}${b.problem_note ? ` — "${escapeReportText(b.problem_note)}"` : ""}. An admin is looking at it.`, "problem");
  }

  const est = b.estimates;
  if (est && b.status === "Confirmed") {
    if (est.lateReturn.minutesLate > 0) {
      line("ti-calendar-exclamation", `Late by ${lateLabel(est.lateReturn.minutesLate).replace(" late", "")}. Under the proposed late-fee rule this would be about <strong>${formatRand(est.lateReturn.amount)}</strong> — <em>an estimate only: late fees are not in effect and nothing will be charged.</em>`, "estimate");
    } else if (!isOwner && est.earlyReturn.unusedDays > 0) {
      line("ti-calendar-minus", `Returning today leaves ${est.earlyReturn.unusedDays} unused day${est.earlyReturn.unusedDays === 1 ? "" : "s"}. A refund of about <strong>${formatRand(est.earlyReturn.amount)}</strong> is being proposed — <em>an estimate only: it's not in effect, so no refund is made automatically.</em>`, "estimate");
    }
  }
  return lines.length ? `<div class="rental-timeline">${lines.join("")}</div>` : "";
}

const rentalBtn = (action, id, icon, label, variant = "") =>
  `<button type="button" class="market-action-btn rental-action-btn ${variant}" data-action="${action}" data-booking-id="${id}">
     <i class="ti ${icon}" aria-hidden="true"></i> ${label}
   </button>`;

/* The buttons for this person at this stage. */
function rentalActions(b, isOwner, isRenter) {
  const id = b.id;
  const buttons = [];
  const x = b.extension && ["Requested", "Awaiting Payment"].includes(b.extension.status) ? b.extension : null;
  const legacy = !b.payment_status;

  if (b.status === "Pending") {
    if (isOwner) buttons.push(rentalBtn("approve", id, "ti-check", "Approve"), rentalBtn("decline", id, "ti-x", "Decline", "outline danger"));
    if (isRenter) buttons.push(rentalBtn("cancel", id, "ti-x", "Cancel request", "outline danger"));
  } else if (b.status === "Awaiting Payment") {
    if (isRenter) buttons.push(rentalBtn("pay", id, "ti-credit-card", "Review terms & pay"), rentalBtn("cancel", id, "ti-x", "Cancel", "outline danger"));
    if (isOwner) buttons.push(rentalBtn("owner-cancel", id, "ti-ban", "Can't go ahead", "outline danger"));
  } else if (b.status === "Confirmed" && !b.out_on_rent) {
    if (isRenter && b.waiting_for_return) buttons.push(rentalBtn("cancel", id, "ti-x", "Cancel (full refund)", "outline danger"));
    else if (isRenter) buttons.push(
      `<button type="button" class="market-action-btn pickup-equipment-btn" data-booking-id="${id}" data-listed-condition="${escapeHtml(b.equipment_condition || "")}"><i class="ti ti-camera" aria-hidden="true"></i> Confirm pickup (add photos)</button>`,
      rentalBtn("refuse", id, "ti-alert-triangle", "Item faulty? Don't take it", "outline danger"),
      rentalBtn("cancel", id, "ti-x", "Cancel (full refund)", "outline danger")
    );
    if (isOwner) buttons.push(rentalBtn("owner-cancel", id, "ti-ban", "Can't hand it over", "outline danger"));
  } else if (b.status === "Confirmed") {
    if (isRenter) {
      buttons.push(`<button type="button" class="market-action-btn return-equipment-btn" data-booking-id="${id}" data-new-flow="${legacy ? "" : "1"}"><i class="ti ti-package-export" aria-hidden="true"></i> Return item${legacy ? "" : " (add photos)"}</button>`);
      if (!legacy && !x && !b.is_overdue) buttons.push(rentalBtn("extend", id, "ti-calendar-plus", "Ask for more days", "outline"));
      if (x?.status === "Awaiting Payment") buttons.push(rentalBtn("pay-extension", id, "ti-credit-card", "Pay for extension"));
      if (x) buttons.push(rentalBtn("withdraw-extension", id, "ti-arrow-back-up", "Withdraw extension", "outline"));
    }
    if (isOwner) {
      if (x?.status === "Requested") buttons.push(rentalBtn("approve-extension", id, "ti-check", "Approve extension"), rentalBtn("decline-extension", id, "ti-x", "Decline extension", "outline danger"));
      buttons.push(legacy
        ? `<button type="button" class="market-action-btn return-equipment-btn" data-booking-id="${id}" data-new-flow=""><i class="ti ti-package-export" aria-hidden="true"></i> Mark returned</button>`
        : `<button type="button" class="market-action-btn ${b.is_overdue ? "" : "outline"} return-equipment-btn" data-booking-id="${id}" data-new-flow="1" data-by-owner="1"><i class="ti ti-package-import" aria-hidden="true"></i> It's back: record return</button>`);
    }
    if (!legacy) buttons.push(rentalBtn("problem", id, "ti-alert-triangle", "Report a problem", "outline"));
  } else if (b.status === "Returned" && b.condition_status === "Pending" && isOwner && !legacy) {
    buttons.push(
      `<button type="button" class="market-action-btn condition-ok-btn" data-booking-id="${id}"><i class="ti ti-circle-check" aria-hidden="true"></i> Condition OK</button>`,
      `<button type="button" class="market-action-btn outline danger report-damage-btn" data-booking-id="${id}"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Report damage</button>`
    );
  } else if (b.status === "Returned" && (isOwner || isRenter)) {
    buttons.push(b.my_review_id
      ? `<button class="market-action-btn outline edit-review-btn" data-review-id="${b.my_review_id}" data-rating="${b.my_review_rating ?? ""}" data-comment="${escapeReportText(b.my_review_comment ?? "")}"><i class="ti ti-edit" aria-hidden="true"></i> Edit review</button>
         <button class="market-action-btn outline danger delete-review-btn" data-review-id="${b.my_review_id}" aria-label="Delete review"><i class="ti ti-trash" aria-hidden="true"></i></button>`
      : `<button class="market-action-btn review-booking-btn" data-booking-id="${id}"><i class="ti ti-star" aria-hidden="true"></i> Leave review</button>`);
  }

  if (!buttons.length) {
    buttons.push(`<a href="./equipment-details.html?id=${b.equipment_id}" class="market-action-btn outline"><i class="ti ti-eye" aria-hidden="true"></i> View equipment</a>`);
  }
  return `<div class="rental-actions">${buttons.join("")}</div>`;
}

function historyCard(booking) {
  const isOwner  = !!currentUser && Number(booking.owner_id)  === Number(currentUser.id);
  const isRenter = !!currentUser && Number(booking.renter_id) === Number(currentUser.id);
  const roleLabel = isOwner ? `You own this · ${escapeReportText(booking.renter_name || "renter")} is renting` : `You're renting from ${escapeReportText(booking.owner_name || "the owner")}`;
  const imageUrl  = Array.isArray(booking.image_urls) && booking.image_urls.length ? booking.image_urls[0] : null;
  const stage = rentalStage(booking);

  return `
    <div class="market-card history-row" id="booking-${booking.id}">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeReportText(booking.equipment_name)}" class="lightbox-img" data-gallery="equip-history-${booking.id}" data-full="${escapeHtml(imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light blue"><i class="ti ti-package" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(booking.section || "General")}
          <div class="badge ${stage.tone}">${stage.label}</div>
        </div>
        <h3>${escapeReportText(booking.equipment_name)}</h3>
        <div class="market-tags" style="margin:10px 0;">
          <div class="market-tag"><i class="ti ti-user" aria-hidden="true"></i> ${roleLabel}</div>
          <div class="market-tag"><i class="ti ti-currency-dollar" aria-hidden="true"></i> R${escapeHtml(booking.daily_price)}/day</div>
        </div>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-calendar" aria-hidden="true"></i> ${rentalDate(booking.start_date)} → ${rentalDate(booking.end_date)}</div>
        </div>
        ${rentalTimeline(booking, isOwner)}
        ${bookingMoneyLine(booking, isOwner)}
        ${rentalActions(booking, isOwner, isRenter)}
      </div>
    </div>`;
}

function historyMiniCard(booking) {
  const isOwner = !!currentUser && Number(booking.owner_id) === Number(currentUser.id);
  return `
    <a href="./equipment-details.html?id=${booking.equipment_id}" class="mini-history-item">
      <div class="mini-history-thumb">${Array.isArray(booking.image_urls) && booking.image_urls.length
        ? `<img src="${escapeHtml(booking.image_urls[0])}" alt="${escapeHtml(booking.equipment_name)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div class="media-placeholder light blue"><i class="ti ti-package" aria-hidden="true"></i></div>`}</div>
      <div class="mini-history-info">
        <div class="mini-history-top">
          ${sectionBadge(booking.section || "General")}
          <div class="badge ${rentalStage(booking).tone}">${rentalStage(booking).label}</div>
        </div>
        <div class="mini-history-title">${escapeReportText(booking.equipment_name)}</div>
        <div class="mini-history-meta">${isOwner ? "You own this" : "You rented this"} &middot; R${escapeHtml(booking.daily_price)}/day</div>
      </div>
    </a>`;
}

function attachDeleteEquipmentEvents() {
  document.querySelectorAll(".delete-equipment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this equipment listing?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/${btn.dataset.equipmentId}`, "DELETE");
        showToast("Equipment listing deleted.");
        await loadEquipment();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });
}

function attachReturnEquipmentButtonEvents(scope = document) {
  scope.querySelectorAll(".pickup-equipment-btn").forEach(btn => {
    btn.addEventListener("click", () => openRentalPhotoModal(btn.dataset.bookingId, "pickup", btn.dataset.listedCondition || ""));
  });

  scope.querySelectorAll(".condition-ok-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirm the item came back in the same condition it went out in? This releases the renter's deposit (demo).")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Saving…`;
      try {
        const res = await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/condition-ok`, "PATCH");
        /* The server marks a held deposit as "Refunded" here. If there
           was no deposit ("None"), there's no money moment to show. */
        const booking = res?.data || {};
        if (booking.deposit_status === "Refunded" && Number(booking.deposit_amount) > 0) {
          showPaymentMoment("released", `Condition confirmed. ${formatRand(booking.deposit_amount)} deposit returned to the renter.`, { title: "Deposit returned" });
        } else {
          showToast("Condition confirmed.");
        }
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Condition OK`;
      }
    });
  });

  scope.querySelectorAll(".report-damage-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      damageForm.reset();
      damageMessage.textContent = "";
      document.getElementById("damageBookingId").value = btn.dataset.bookingId;
      openModal(damageModal);
    });
  });

  scope.querySelectorAll(".return-equipment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      /* New (payment simulation) bookings need "after" photos. */
      if (btn.dataset.newFlow) {
        openRentalPhotoModal(btn.dataset.bookingId, "return", "", !!btn.dataset.byOwner);
        return;
      }
      if (!confirm("Confirm equipment return?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Returning…`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/return`, "PATCH");
        showToast("Equipment returned successfully.");
        await loadEquipment();
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-package-export" aria-hidden="true"></i> Return Equipment`;
      }
    });
  });
}

function attachReviewButtonEvents(scope = document) {
  scope.querySelectorAll(".review-booking-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      reviewForm.reset();
      reviewBookingIdInput.value = btn.dataset.bookingId;
      reviewIdInput.value = "";
      if (reviewModalTitle) reviewModalTitle.innerHTML = `<i class="ti ti-star" aria-hidden="true"></i> Leave a Review`;
      reviewMessage.textContent = "";
      openModal(reviewModal);
    });
  });

  scope.querySelectorAll(".edit-review-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      reviewForm.reset();
      reviewBookingIdInput.value = "";
      reviewIdInput.value = btn.dataset.reviewId;
      ratingInput.value = btn.dataset.rating || "";
      commentInput.value = btn.dataset.comment || "";
      if (reviewModalTitle) reviewModalTitle.innerHTML = `<i class="ti ti-edit" aria-hidden="true"></i> Edit Review`;
      reviewMessage.textContent = "";
      openModal(reviewModal);
    });
  });

  scope.querySelectorAll(".delete-review-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this review?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/reviews/${btn.dataset.reviewId}`, "DELETE");
        showToast("Review deleted.");
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i>`;
      }
    });
  });
}

reviewForm?.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    if (reviewIdInput.value) {
      await apiRequest(`/reviews/${reviewIdInput.value}`, "PATCH", {
        rating: Number(ratingInput.value),
        comment: commentInput.value.trim()
      });
      showToast("Review updated!");
    } else {
      await apiRequest(`/reviews/bookings/${reviewBookingIdInput.value}`, "POST", {
        rating: Number(ratingInput.value),
        comment: commentInput.value.trim()
      });
      showToast("Review submitted!");
    }
    closeModal(reviewModal, reviewForm, reviewMessage);
    await loadEquipmentHistory();
  } catch (err) {
    reviewMessage.textContent = err.message;
    reviewMessage.style.color = "red";
    showToast(err.message, "error");
  }
});

/* ── Rental actions (history cards) ──
   One pop-up (#rentalActionModal) for the steps that need input or a
   careful look first: paying, asking for more days, reporting a problem,
   cancelling as the owner, refusing a faulty item. One-click steps use a
   plain confirm. Every step is checked again on the server. */
let cachedHistory = [];
const rentalActionModal   = document.getElementById("rentalActionModal");
const rentalActionForm    = document.getElementById("rentalActionForm");
const rentalActionTitle   = document.getElementById("rentalActionTitle");
const rentalActionBody    = document.getElementById("rentalActionBody");
const rentalActionMessage = document.getElementById("rentalActionMessage");
const submitRentalAction  = document.getElementById("submitRentalAction");
let rentalActionSubmit = null;

function openRentalAction({ title, icon, body, submitLabel, danger = false, onSubmit }) {
  rentalActionTitle.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${title}`;
  rentalActionBody.innerHTML = body;
  rentalActionMessage.textContent = "";
  submitRentalAction.innerHTML = submitLabel;
  submitRentalAction.style.background = danger ? "var(--ump-red)" : "";
  submitRentalAction.disabled = false;
  rentalActionSubmit = onSubmit;
  openModal(rentalActionModal);
}

function closeRentalAction() {
  closeModal(rentalActionModal);
  rentalActionSubmit = null;
}

document.getElementById("closeRentalActionModal")?.addEventListener("click", closeRentalAction);
document.getElementById("overlay")?.addEventListener("click", closeRentalAction);

rentalActionForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!rentalActionSubmit) return;
  const originalHtml = submitRentalAction.innerHTML;
  submitRentalAction.disabled = true;
  submitRentalAction.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
  try {
    const done = await rentalActionSubmit();
    closeRentalAction();
    if (done) done();
    await loadEquipmentHistory();
  } catch (err) {
    rentalActionMessage.textContent = err.message;
    showToast(err.message, "error");
    submitRentalAction.disabled = false;
    submitRentalAction.innerHTML = originalHtml;
  }
});

const RENTAL_PROBLEM_OPTIONS = {
  renter: [
    ["owner_unavailable", "The owner isn't available to take it back"],
    ["item_faulty", "The item stopped working or is faulty"],
    ["other", "Something else"]
  ],
  owner: [
    ["renter_unreachable", "The renter isn't responding about the return"],
    ["other", "Something else"]
  ]
};

const noteField = (id, label, placeholder, min) => `
  <div class="form-group">
    <label for="${id}">${label}</label>
    <textarea id="${id}" rows="3" minlength="${min}" maxlength="500" required placeholder="${placeholder}"></textarea>
  </div>`;

async function openPayModal(b) {
  /* The terms shown are the CURRENT ones; the server refuses payment if
     they change before the renter presses Pay. */
  const item = (await apiRequest(`/equipment/${b.equipment_id}`)).data;
  const terms = item.terms;
  const total = Number(b.rental_amount) + Number(b.protection_fee || 0) + Number(b.deposit_amount || 0);
  openRentalAction({
    title: "Review & pay",
    icon: "ti-credit-card",
    submitLabel: `<i class="ti ti-shield-check" aria-hidden="true"></i> Pay ${formatRand(total)} (demo)`,
    body: `
      ${demoPaymentBanner("No real payment gateway is connected. This simulates Taskify holding your payment until you return the item.")}
      <p class="pay-note"><strong>${escapeReportText(b.equipment_name)}</strong> from ${rentalDate(b.start_date)} to ${rentalDate(b.end_date)}.
        Due back by <strong>${rentalDeadline(b.return_due_at)}</strong>.</p>
      <div class="money-breakdown">
        ${moneyRow(`Rent (${b.rental_days} day${b.rental_days === 1 ? "" : "s"})`, b.rental_amount)}
        ${moneyRow("Protection fee", b.protection_fee)}
        ${moneyRow("Deposit", b.deposit_amount, { hint: Number(b.deposit_amount) > 0 ? "" : "none" })}
        ${moneyRow("Total", total, { strong: true })}
      </div>
      <details class="rental-terms-box" open><summary>Rental terms</summary>${rentalTermsHtml(terms)}</details>
      <label class="rental-accept"><input type="checkbox" id="acceptRentalTerms" required /> I've read these terms and agree to them.</label>
      <p class="pay-note">Pay by ${rentalDeadline(b.payment_due_at)}, or the owner's approval lapses.</p>`,
    onSubmit: async () => {
      if (!document.getElementById("acceptRentalTerms").checked) throw new Error("Please tick the box to accept the terms.");
      await apiRequest(`/equipment/bookings/${b.id}/pay`, "POST", { acceptedPolicyVersion: terms.policyVersion });
      return () => showPaymentMoment("held", `${formatRand(total)} is held until you return the item. Your booking is confirmed.`);
    }
  });
}

function openExtendModal(b) {
  const next = new Date(`${b.end_date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const minDate = next.toISOString().slice(0, 10);
  openRentalAction({
    title: "Ask for more days",
    icon: "ti-calendar-plus",
    submitLabel: `<i class="ti ti-send" aria-hidden="true"></i> Send request`,
    body: `
      <p class="pay-note">It's due back by <strong>${rentalDeadline(b.return_due_at)}</strong>. Ask before then. The owner has to approve, then you pay the extra (demo) — only then does the deadline change.</p>
      <div class="form-group">
        <label for="extensionEndDate">Keep it until</label>
        <input type="date" id="extensionEndDate" min="${minDate}" value="${minDate}" required />
      </div>
      <p class="pay-note" id="extensionPreview"></p>`,
    onSubmit: async () => {
      const newEndDate = document.getElementById("extensionEndDate").value;
      await apiRequest(`/equipment/bookings/${b.id}/extension`, "POST", { newEndDate });
      return () => showToast("Extension requested. The owner has been asked.");
    }
  });
  const input = document.getElementById("extensionEndDate");
  const preview = () => {
    const days = Math.round((new Date(`${input.value}T12:00:00Z`) - new Date(`${b.end_date}T12:00:00Z`)) / 86400000);
    document.getElementById("extensionPreview").innerHTML = days > 0
      ? `${days} more day${days === 1 ? "" : "s"} × R${b.daily_price} = about <strong>${formatRand(days * Number(b.daily_price))}</strong> plus a small protection fee. Taskify works out the exact amount.`
      : "";
  };
  input.addEventListener("change", preview);
  preview();
}

function openProblemModal(b, isOwner) {
  const options = RENTAL_PROBLEM_OPTIONS[isOwner ? "owner" : "renter"];
  openRentalAction({
    title: "Report a problem",
    icon: "ti-alert-triangle",
    danger: true,
    submitLabel: `<i class="ti ti-send" aria-hidden="true"></i> Report problem`,
    body: `
      <p class="pay-note">The ${isOwner ? "renter" : "owner"} is told and a Taskify admin will look at it. Nothing is charged or refunded automatically.</p>
      <div class="form-group">
        <label for="rentalProblemCategory">What's wrong?</label>
        <select id="rentalProblemCategory">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      </div>
      ${noteField("rentalProblemNote", "Describe what happened", "e.g. I waited at the library at 17:30 but they didn't come.", 10)}`,
    onSubmit: async () => {
      await apiRequest(`/equipment/bookings/${b.id}/problem`, "POST", {
        category: document.getElementById("rentalProblemCategory").value,
        note: document.getElementById("rentalProblemNote").value.trim()
      });
      return () => showToast("Problem reported. An admin will look at it.");
    }
  });
}

function openOwnerCancelModal(b) {
  openRentalAction({
    title: "Can't go ahead",
    icon: "ti-ban",
    danger: true,
    submitLabel: `<i class="ti ti-ban" aria-hidden="true"></i> Cancel booking`,
    body: `
      <p class="pay-note">The booking is cancelled and the renter is refunded in full (demo). Please tell them why.</p>
      ${noteField("ownerCancelNote", "Reason", "e.g. The tripod head broke this morning.", 5)}`,
    onSubmit: async () => {
      await apiRequest(`/equipment/bookings/${b.id}/owner-cancel`, "PATCH", { note: document.getElementById("ownerCancelNote").value.trim() });
      return () => showToast("Booking cancelled. The renter has been refunded (demo).");
    }
  });
}

function openRefuseModal(b) {
  openRentalAction({
    title: "Don't take a faulty item",
    icon: "ti-alert-triangle",
    danger: true,
    submitLabel: `<i class="ti ti-ban" aria-hidden="true"></i> Refuse & get refund`,
    body: `
      <p class="pay-note">If the item is broken or isn't what was listed, don't take it. The booking is cancelled, you're refunded in full (demo), and the owner and admins are told.</p>
      ${noteField("refuseNote", "What's wrong with it?", "e.g. The lens is cracked right across.", 10)}`,
    onSubmit: async () => {
      await apiRequest(`/equipment/bookings/${b.id}/refuse-pickup`, "PATCH", { note: document.getElementById("refuseNote").value.trim() });
      return () => showToast("Booking cancelled and refunded (demo).");
    }
  });
}

/* One-click steps: [confirm text or null, method, path, success text, payment moment?] */
const SIMPLE_RENTAL_ACTIONS = {
  approve: [null, "PATCH", "confirm", "Approved. The renter has been asked to pay."],
  decline: ["Decline this booking request?", "PATCH", "decline", "Request declined."],
  cancel: ["Cancel this booking? Anything you've paid is refunded in full (demo).", "PATCH", "cancel", "Booking cancelled."],
  "approve-extension": [null, "PATCH", "extension/approve", "Extension approved. The renter has been asked to pay."],
  "decline-extension": ["Decline this extension? The current deadline stays.", "PATCH", "extension/decline", "Extension declined."],
  "withdraw-extension": ["Withdraw your extension request? The current deadline stays.", "PATCH", "extension/cancel", "Extension request withdrawn."],
  "pay-extension": ["Pay for the extension now (demo)? Your return deadline moves once it's paid.", "POST", "extension/pay", null]
};

equipmentHistoryContainer?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".rental-action-btn");
  if (!btn) return;
  const b = cachedHistory.find((row) => String(row.id) === btn.dataset.bookingId);
  if (!b) return;
  const isOwner = !!currentUser && Number(b.owner_id) === Number(currentUser.id);
  const action = btn.dataset.action;

  try {
    if (action === "pay") return await openPayModal(b);
    if (action === "extend") return openExtendModal(b);
    if (action === "problem") return openProblemModal(b, isOwner);
    if (action === "owner-cancel") return openOwnerCancelModal(b);
    if (action === "refuse") return openRefuseModal(b);

    const simple = SIMPLE_RENTAL_ACTIONS[action];
    if (!simple) return;
    const [question, method, path, success] = simple;
    if (question && !confirm(question)) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
    try {
      const res = await apiRequest(`/equipment/bookings/${b.id}/${path}`, method);
      if (action === "pay-extension") {
        showPaymentMoment("held", `Extension paid. It's now due back by ${rentalDeadline(res.data?.return_due_at)}.`);
      } else if (action === "approve" && res.data?.status === "Confirmed") {
        showToast("Booking confirmed.");
      } else {
        showToast(success);
      }
      await loadEquipmentHistory();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  } catch (err) {
    showToast(err.message, "error");
  }
});

async function loadEquipment() {
  try {
    const res = await apiRequest("/equipment");
    cachedEquipment = Array.isArray(res.data) ? res.data : [];
    populateCategoryFilter(cachedEquipment);

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam && equipmentSearchInput) equipmentSearchInput.value = searchParam;

    renderEquipment();
  } catch (err) {
    console.error("loadEquipment failed:", err);
    equipmentContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
  historyJumpLoadDone();
}

async function loadEquipmentHistory() {
  if (!currentUser) {
    equipmentHistoryContainer.innerHTML = emptyState("ti-lock", "Sign in to see your rental history", "Create an account or log in to track equipment you've listed or booked.");
    equipmentHistoryMiniContainer.innerHTML = `<p class="rail-loading">Sign in to see your history.</p>`;
    return;
  }
  try {
    const res   = await apiRequest("/equipment/history");
    const items = Array.isArray(res.data) ? res.data : [];
    cachedHistory = items;

    equipmentHistoryContainer.innerHTML = items.length
      ? safeMap(items, historyCard, "equipment history")
      : emptyState("ti-clock", "No history yet", "Your bookings and listings appear here.");
    attachReturnEquipmentButtonEvents(equipmentHistoryContainer);
    attachReviewButtonEvents(equipmentHistoryContainer);

    equipmentHistoryMiniContainer.innerHTML = items.length
      ? items.slice(0, 4).map(historyMiniCard).join("")
      : `<p class="rail-loading">No history yet.</p>`;

    historyJumpLoadDone();
  } catch (err) {
    console.error("loadEquipmentHistory failed:", err);
    equipmentHistoryContainer.innerHTML = errorState(err.message);
    equipmentHistoryMiniContainer.innerHTML = `<p class="rail-loading">Couldn't load history.</p>`;
    showToast(err.message, "error");
  }
}

function showFullEquipmentHistory(behavior = "smooth") {
  const section = document.getElementById("fullEquipmentHistorySection");
  if (!section) return;
  section.style.display = "block";
  section.scrollIntoView({ behavior, block: "start" });
}

/* Arriving from the dashboard's "Waiting for you" list (equipment.html#history):
   jump to the history once BOTH the listings and the history have loaded
   for the first time — otherwise the listings finishing later push it
   back down the page. Then drop the #history so later reloads of the
   lists don't jump again. */
let historyJumpPending = window.location.hash === "#history" ? 2 : 0;
function historyJumpLoadDone() {
  if (historyJumpPending <= 0) return;
  historyJumpPending -= 1;
  if (historyJumpPending === 0) {
    showFullEquipmentHistory("auto");
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

document.getElementById("viewAllEquipmentHistoryLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  showFullEquipmentHistory();
});

/* equipment.html#history (used by the dashboard's "Waiting for you" list)
   opens the history straight away, since that's where the pickup, return
   and condition-check buttons live. */
if (window.location.hash === "#history") showFullEquipmentHistory();

equipmentForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const price = document.getElementById("equipmentDailyPrice").value.trim();
  if (!price) { showToast("Please enter a rental price.", "error"); return; }
  const itemValue = document.getElementById("equipmentItemValue").value.trim();
  if (!itemValue || Number(itemValue) <= 0) { showToast("Please enter roughly what the item is worth.", "error"); return; }
  if (!editingEquipmentId && !checkAcknowledgementBoxes(equipmentForm)) return;

  const submitBtn = equipmentForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `${taskifyMarkLoader()} ${editingEquipmentId ? "Saving…" : "Publishing…"}`;

  try {
    /* In edit mode, keep the saved photos the owner didn't remove. */
    let imageUrls = equipmentUploader ? equipmentUploader.getExisting() : [];
    if (equipmentUploader && equipmentUploader.getFiles().length) {
      imageUrls = [...imageUrls, ...await equipmentUploader.upload("equipment")];
    }

    const payload = {
      name:        document.getElementById("equipmentName").value.trim(),
      description: document.getElementById("equipmentDescription").value.trim(),
      category:    document.getElementById("equipmentCategory").value.trim(),
      section:     categorySection("equipment", document.getElementById("equipmentCategory").value),
      condition:   document.getElementById("equipmentCondition").value,
      dailyPrice:  Number(price),
      itemValue:   Number(itemValue),
      imageUrls,
      ...(editingEquipmentId ? {} : { acknowledgements: readAcknowledgements(equipmentForm) })
    };

    if (editingEquipmentId) {
      await apiRequest(`/equipment/${editingEquipmentId}`, "PUT", payload);
      showToast("Listing updated!");
      window.location.href = `./equipment-details.html?id=${editingEquipmentId}`;
      return;
    }

    await apiRequest("/equipment", "POST", payload);
    showToast("Equipment listed successfully!");
    equipmentForm.reset();
    if (equipmentUploader) equipmentUploader.reset();
    showEquipmentStep(1);
    closeEquipmentCreateModal();
    await loadEquipment();
    await loadEquipmentHistory();
  } catch (err) {
    await handleAcknowledgementError(equipmentForm, err);
    equipmentMessage.textContent = err.message;
    equipmentMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    setEquipmentSubmitLabel();
  }
});

const equipmentPolicyNoticeEl = document.getElementById("equipmentPolicyNotice");
if (equipmentPolicyNoticeEl) equipmentPolicyNoticeEl.innerHTML = contentPolicyNotice();

fillCategorySelect(document.getElementById("equipmentCategory"), "equipment", "", document.getElementById("equipmentCategoryHint"));
populateCategoryFilter();
loadEquipment();
loadEquipmentHistory();

const equipmentUploader = initImageUploader("equipmentUploadArea", "equipmentPreviewGrid");

openEquipmentEditFromUrl();