const currentUser = requireAuth();

const equipmentDetailsContainer = document.getElementById("equipmentDetailsContainer");
const bookingModal              = document.getElementById("bookingModal");
const bookingForm               = document.getElementById("bookingForm");
const bookingEquipmentIdInput   = document.getElementById("bookingEquipmentId");
const bookingStartDateInput     = document.getElementById("bookingStartDate");
const bookingEndDateInput       = document.getElementById("bookingEndDate");
const closeBookingModalButton   = document.getElementById("closeBookingModal");
const bookingMessage            = document.getElementById("bookingMessage");
const overlay                   = document.getElementById("overlay");

const params      = new URLSearchParams(window.location.search);
const equipmentId = params.get("id");

function openModal(modal)            { modal.style.display = "block"; overlay.style.display = "block"; }
function closeModal(modal, form, msg){ modal.style.display = "none";  overlay.style.display = "none"; if (form) form.reset(); if (msg) msg.textContent = ""; }

closeBookingModalButton?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));
overlay?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));

async function loadEquipmentDetails() {
  try {
    const res   = await apiRequest("/equipment");
    const item  = res.data.find(e => Number(e.id) === Number(equipmentId));

    if (!item) {
      equipmentDetailsContainer.innerHTML = emptyState("ti-package-off", "Not found", "This equipment is no longer available.");
      return;
    }
    renderEquipmentDetails(item);
  } catch (err) {
    equipmentDetailsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

function renderEquipmentDetails(item) {
  const isOwn    = Number(item.owner_id) === Number(currentUser.id);
  const initials = avatarInitials(item.owner_name);

  const actionArea = isOwn
    ? `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your listing</div>`
    : `<button class="primary-button" id="openBookingButton" data-equipment-id="${item.id}">
         <i class="ti ti-calendar-plus" aria-hidden="true"></i> Request Booking
       </button>`;

  equipmentDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        ${renderImageGallery(item.image_urls, "ti-package")}
        ${sectionBadge(item.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${item.name}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status || "Good")}
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
        </div>
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Rental Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:13px;">${item.owner_name}</div>
            <div style="font-size:11px;color:var(--muted);">Equipment Owner</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Daily rate</div>
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Status</div>
          <div class="badge"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
        </div>
        ${actionArea}
        <a href="./equipment.html" class="secondary-button" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Rentals
        </a>
      </div>
    </div>`;

  document.getElementById("openBookingButton")?.addEventListener("click", () => {
    bookingForm.reset();
    bookingEquipmentIdInput.value = item.id;
    bookingMessage.textContent = "";
    openModal(bookingModal);
  });
}

bookingForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  try {
    await apiRequest(`/equipment/${bookingEquipmentIdInput.value}/book`, "POST", {
      startDate: bookingStartDateInput.value,
      endDate:   bookingEndDateInput.value
    });
    showToast("Equipment booked successfully!");
    closeModal(bookingModal, bookingForm, bookingMessage);
    setTimeout(() => window.location.href = "./equipment.html", 800);
  } catch (err) {
    bookingMessage.textContent = err.message;
    bookingMessage.style.color = "red";
    showToast(err.message, "error");
    submitBtn.disabled = false;
  }
});

loadEquipmentDetails();