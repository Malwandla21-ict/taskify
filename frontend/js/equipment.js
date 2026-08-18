const currentUser = requireAuth();

const equipmentContainer        = document.getElementById("equipmentContainer");
const equipmentHistoryContainer = document.getElementById("equipmentHistoryContainer");
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

/* ── Creation modal ── */
const equipmentCreateOverlay = document.getElementById("equipmentCreateOverlay");
const equipmentCreateModal   = document.getElementById("equipmentCreateModal");

function openEquipmentCreateModal() {
  equipmentCreateModal.classList.add("open");
  equipmentCreateOverlay.classList.add("open");
}
function closeEquipmentCreateModal() {
  equipmentCreateModal.classList.remove("open");
  equipmentCreateOverlay.classList.remove("open");
}
document.getElementById("openEquipmentModalButton")?.addEventListener("click", openEquipmentCreateModal);
document.getElementById("closeEquipmentModalButton")?.addEventListener("click", closeEquipmentCreateModal);
equipmentCreateOverlay?.addEventListener("click", closeEquipmentCreateModal);

let cachedEquipment  = [];
let selectedSection  = "All";

function showEquipmentStep(n) {
  equipmentStep1.style.display = n === 1 ? "block" : "none";
  equipmentStep2.style.display = n === 2 ? "block" : "none";
  equipmentStep3.style.display = n === 3 ? "block" : "none";
  equipmentStepText.textContent   = `Step ${n} of 3`;
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
  const section    = document.getElementById("equipmentSection").value;
  const desc       = document.getElementById("equipmentDescription").value.trim();
  const condition  = document.getElementById("equipmentCondition").value;
  const dailyPrice = document.getElementById("equipmentDailyPrice").value.trim();

  equipmentPreview.innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${name || "Equipment name"}</h3>
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">${desc || "Equipment description will appear here."}</p>
    <div class="market-tags">
      ${sectionBadge(section)}
      <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${category || "Category"}</div>
      ${conditionBadge(condition)}
    </div>
    <div style="margin-top:14px;font-size:13px;color:var(--muted);">
      Daily rate: <strong style="color:var(--ump-green);font-size:16px;">R${dailyPrice || "0"}/day</strong>
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
    renderEquipment(cachedEquipment);
  });
});

function equipmentCard(item) {
  const isOwn = Number(item.owner_id) === Number(currentUser.id);
  return `
    <div class="market-card">
      <div class="market-image" style="background:linear-gradient(135deg,#E6F1FB,#B5D4F4);">
        ${item.image_urls?.length
          ? `<img src="${item.image_urls[0]}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="market-image-placeholder" style="color:var(--ump-blue);"><i class="ti ti-package" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${avatarHtml(item.owner_profile_photo, item.owner_name)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.owner_id}" data-user-name="${item.owner_name}" style="cursor:pointer;">${item.owner_name}</div>
              <div class="market-user-meta"><i class="ti ti-package" aria-hidden="true"></i> Equipment Owner</div>
            </div>
          </div>
          ${sectionBadge(item.section || "General")}
        </div>
        <h3>${item.name}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a href="./equipment-details.html?id=${item.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
            ${isOwn ? `
              <div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Yours</div>
              <button class="market-action-btn outline delete-equipment-btn" data-equipment-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete
              </button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

function renderEquipment(items) {
  const filtered = items.filter(i => selectedSection === "All" || i.section === selectedSection);
  equipmentContainer.innerHTML = filtered.length
    ? filtered.map(equipmentCard).join("")
    : emptyState("ti-package", "No equipment found", "Try a different filter or list your own.");
  attachDeleteEquipmentEvents();
  attachProfileLinkEvents(equipmentContainer);
}

/* ── Detailed history card ── */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function rentalDays(start, end) {
  const diff = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return Math.max(diff, 1);
}

function whatsappBtn(phone, title) {
  if (!phone) return "";
  return `<a href="${createWhatsAppLink(phone, title)}" target="_blank" class="market-action-btn outline" style="color:var(--ump-green);border-color:rgba(0,155,114,0.30);">
             <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Message
           </a>`;
}

function historyCard(booking) {
  const isOwner  = Number(booking.owner_id)  === Number(currentUser.id);
  const isRenter = Number(booking.renter_id) === Number(currentUser.id);
  const days     = rentalDays(booking.start_date, booking.end_date);
  const total    = (Number(booking.daily_price) * days).toFixed(2);

  let actionArea = "";
  if (booking.status === "Pending" && isOwner) {
    actionArea = `
      <button class="market-action-btn confirm-booking-btn" data-booking-id="${booking.id}" style="background:var(--ump-green);">
        <i class="ti ti-check" aria-hidden="true"></i> Confirm
      </button>
      <button class="market-action-btn outline decline-booking-btn" data-booking-id="${booking.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
        <i class="ti ti-x" aria-hidden="true"></i> Decline
      </button>
      ${whatsappBtn(booking.renter_phone_number, booking.equipment_name)}`;
  } else if (booking.status === "Pending" && isRenter) {
    actionArea = `
      <div class="badge gold"><i class="ti ti-hourglass" aria-hidden="true"></i> Waiting for owner</div>
      <button class="market-action-btn outline cancel-booking-btn" data-booking-id="${booking.id}">
        <i class="ti ti-x" aria-hidden="true"></i> Cancel Request
      </button>
      ${whatsappBtn(booking.owner_phone_number, booking.equipment_name)}`;
  } else if (booking.status === "Confirmed" && (isOwner || isRenter)) {
    const label       = isOwner ? "Confirm Return" : "Return Equipment";
    const confirmText = isOwner
      ? "Confirm that this equipment has been returned to you?"
      : "Confirm you are returning this equipment?";
    const contactPhone = isOwner ? booking.renter_phone_number : booking.owner_phone_number;
    actionArea = `
      <button class="market-action-btn return-equipment-btn" data-booking-id="${booking.id}" data-confirm-text="${confirmText}">
        <i class="ti ti-package-export" aria-hidden="true"></i> ${label}
      </button>
      ${whatsappBtn(contactPhone, booking.equipment_name)}`;
  }

  const counterpartId   = isOwner ? booking.renter_id : booking.owner_id;
  const counterpartName = isOwner ? booking.renter_name : booking.owner_name;

  const reportButton = `
    <button class="market-action-btn outline report-booking-btn" data-booking-id="${booking.id}" data-equipment-name="${booking.equipment_name}" data-user-id="${counterpartId}" data-user-name="${counterpartName}" style="color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
      <i class="ti ti-flag" aria-hidden="true"></i> Report
    </button>`;

  return `
    <div class="history-card">
      <div class="history-card-image">
        ${booking.image_urls?.length
          ? `<img src="${booking.image_urls[0]}" alt="${booking.equipment_name}" />`
          : `<div class="market-image-placeholder" style="color:var(--ump-blue);"><i class="ti ti-package" aria-hidden="true"></i></div>`}
      </div>
      <div class="history-card-body">
        <div class="history-card-top">
          <div>
            <div class="history-card-title">${booking.equipment_name}</div>
            <div class="market-tags" style="margin-bottom:0;">
              ${sectionBadge(booking.section || "General")}
              <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${booking.category}</div>
            </div>
          </div>
          ${statusBadge(booking.status)}
        </div>
        <div class="history-card-meta-grid">
          <div class="history-meta-item">
            <i class="ti ti-currency-dollar" aria-hidden="true"></i>
            <div><div class="history-meta-label">Daily Rate</div><div class="history-meta-value">R${booking.daily_price}/day</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-calendar-time" aria-hidden="true"></i>
            <div><div class="history-meta-label">Duration</div><div class="history-meta-value">${days} day${days === 1 ? "" : "s"}</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-receipt" aria-hidden="true"></i>
            <div><div class="history-meta-label">Total Cost</div><div class="history-meta-value">R${total}</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-calendar" aria-hidden="true"></i>
            <div><div class="history-meta-label">Rental Period</div><div class="history-meta-value">${formatDate(booking.start_date)} → ${formatDate(booking.end_date)}</div></div>
          </div>
        </div>
        <div class="history-card-people">
          <div class="history-person">
            <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(booking.owner_profile_photo, booking.owner_name)}</div>
            <div>
              <div class="history-person-role">Owner</div>
              <div class="history-person-name profile-link" data-user-id="${booking.owner_id}" data-user-name="${booking.owner_name}">${isOwner ? "You" : booking.owner_name}</div>
            </div>
          </div>
          <div class="history-person">
            <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(booking.renter_profile_photo, booking.renter_name)}</div>
            <div>
              <div class="history-person-role">Renter</div>
              <div class="history-person-name profile-link" data-user-id="${booking.renter_id}" data-user-name="${booking.renter_name}">${isRenter ? "You" : booking.renter_name}</div>
            </div>
          </div>
        </div>
        <div class="history-card-actions">
          ${actionArea}
          ${reportButton}
        </div>
      </div>
    </div>`;
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

function attachConfirmBookingEvents() {
  document.querySelectorAll(".confirm-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/confirm`, "PATCH");
        showToast("Booking confirmed!");
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Confirm`;
      }
    });
  });
}

function attachDeclineBookingEvents() {
  document.querySelectorAll(".decline-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/decline`, "PATCH");
        showToast("Booking declined.");
        await loadEquipment();
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Decline`;
      }
    });
  });
}

function attachCancelBookingEvents() {
  document.querySelectorAll(".cancel-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Cancelling…`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/cancel`, "PATCH");
        showToast("Booking request cancelled.");
        await loadEquipment();
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Cancel Request`;
      }
    });
  });
}

function attachReturnEquipmentButtonEvents() {
  document.querySelectorAll(".return-equipment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(btn.dataset.confirmText || "Confirm equipment return?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/return`, "PATCH");
        showToast("Equipment marked as returned.");
        await loadEquipment();
        await loadEquipmentHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-package-export" aria-hidden="true"></i> Return`;
      }
    });
  });
}

function attachReportBookingEvents() {
  document.querySelectorAll(".report-booking-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openReportModal({
        reportedUserId: btn.dataset.userId,
        reportedUserName: btn.dataset.userName,
        contextType: "equipment_booking",
        contextId: btn.dataset.bookingId,
        contextLabel: btn.dataset.equipmentName
      });
    });
  });
}

async function loadEquipment() {
  try {
    const res = await apiRequest("/equipment");
    cachedEquipment = res.data;
    renderEquipment(cachedEquipment);
  } catch (err) {
    equipmentContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadEquipmentHistory() {
  try {
    const res   = await apiRequest("/equipment/history");
    const items = res.data;
    equipmentHistoryContainer.innerHTML = items.length
      ? items.map(historyCard).join("")
      : emptyState("ti-clock", "No history yet", "Your bookings and listings appear here.");
    attachConfirmBookingEvents();
    attachDeclineBookingEvents();
    attachCancelBookingEvents();
    attachReturnEquipmentButtonEvents();
    attachReportBookingEvents();
    attachProfileLinkEvents(equipmentHistoryContainer);
  } catch (err) {
    equipmentHistoryContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

equipmentForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const price = document.getElementById("equipmentDailyPrice").value.trim();
  if (!price) { showToast("Please enter a rental price.", "error"); return; }

  const submitBtn = equipmentForm.querySelector("button[type='submit']");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Publishing…`;

  try {
    let imageUrls = [];
    if (equipmentUploader && equipmentUploader.getFiles().length) {
      imageUrls = await equipmentUploader.upload("equipment");
    }

    await apiRequest("/equipment", "POST", {
      name:        document.getElementById("equipmentName").value.trim(),
      description: document.getElementById("equipmentDescription").value.trim(),
      category:    document.getElementById("equipmentCategory").value.trim(),
      section:     document.getElementById("equipmentSection").value,
      condition:   document.getElementById("equipmentCondition").value,
      dailyPrice:  Number(price),
      imageUrls
    });
    showToast("Equipment listed successfully!");
    equipmentForm.reset();
    if (equipmentUploader) equipmentUploader.reset();
    showEquipmentStep(1);
    closeEquipmentCreateModal();
    await loadEquipment();
  } catch (err) {
    equipmentMessage.textContent = err.message;
    equipmentMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
  }
});

loadEquipment();
loadEquipmentHistory();

const equipmentUploader = initImageUploader("equipmentUploadArea", "equipmentPreviewGrid");