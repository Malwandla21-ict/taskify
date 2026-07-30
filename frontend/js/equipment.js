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

let cachedEquipment  = [];
let selectedSection  = "All";

/* ── Step navigation ── */
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

/* ── Preview ── */
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

/* ── Validators ── */
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

/* ── Filters ── */
document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderEquipment(cachedEquipment);
  });
});

/* ── Card builder ── */
function equipmentCard(item) {
  const initials = avatarInitials(item.owner_name);
  const isOwn    = Number(item.owner_id) === Number(currentUser.id);
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
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${initials}</div>
            <div>
              <div class="market-user-name">${item.owner_name}</div>
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
          <div style="display:flex;gap:8px;align-items:center;">
            <a href="./equipment-details.html?id=${item.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
            ${isOwn ? `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Yours</div>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Render ── */
function renderEquipment(items) {
  const filtered = items.filter(i => selectedSection === "All" || i.section === selectedSection);
  equipmentContainer.innerHTML = filtered.length
    ? filtered.map(equipmentCard).join("")
    : emptyState("ti-package", "No equipment found", "Try a different filter or list your own.");
}

/* ── History card ── */
function historyCard(booking) {
  const isOwner  = Number(booking.owner_id)  === Number(currentUser.id);
  const isRenter = Number(booking.renter_id) === Number(currentUser.id);
  const canReturn = booking.status === "Booked" && (isOwner || isRenter);

  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(booking.section || "General")}
          ${statusBadge(booking.status)}
        </div>
        <h3>${booking.equipment_name}</h3>
        <div class="market-tags" style="margin:10px 0;">
          <div class="market-tag"><i class="ti ti-user" aria-hidden="true"></i> Owner: ${booking.owner_name}</div>
          <div class="market-tag"><i class="ti ti-user-check" aria-hidden="true"></i> Renter: ${booking.renter_name}</div>
        </div>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-calendar" aria-hidden="true"></i> ${booking.start_date}</div>
          <div class="market-tag"><i class="ti ti-calendar-off" aria-hidden="true"></i> ${booking.end_date}</div>
        </div>
        ${canReturn ? `
          <button class="market-action-btn return-equipment-btn" data-booking-id="${booking.id}" style="margin-top:14px;width:100%;">
            <i class="ti ti-package-export" aria-hidden="true"></i> Return Equipment
          </button>` : ""}
      </div>
    </div>`;
}

function attachReturnEquipmentButtonEvents() {
  document.querySelectorAll(".return-equipment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
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

/* ── Loaders ── */
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
    attachReturnEquipmentButtonEvents();
  } catch (err) {
    equipmentHistoryContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ── Form submit ── */
equipmentForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const price = document.getElementById("equipmentDailyPrice").value.trim();
  if (!price) { showToast("Please enter a rental price.", "error"); return; }

  const submitBtn = equipmentForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Publishing…`;

  try {
    let imageUrls = [];
    if (equipmentUploader && equipmentUploader.getFiles().length) {
      showToast("Uploading images…", "warning");
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
    await loadEquipment();
  } catch (err) {
    equipmentMessage.textContent = err.message;
    equipmentMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="ti ti-send" aria-hidden="true"></i> Publish Listing`;
  }
});

loadEquipment();
loadEquipmentHistory();

/* ── Image uploader init ── */
const equipmentUploader = initImageUploader("equipmentUploadArea", "equipmentPreviewGrid");