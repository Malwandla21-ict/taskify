const currentUser = requireAuth();

const equipmentDetailsContainer = document.getElementById("equipmentDetailsContainer");
const bookingModal            = document.getElementById("bookingModal");
const bookingForm             = document.getElementById("bookingForm");
const bookingEquipmentIdInput = document.getElementById("bookingEquipmentId");
const bookingStartDateInput   = document.getElementById("bookingStartDate");
const bookingEndDateInput     = document.getElementById("bookingEndDate");
const closeBookingModalButton = document.getElementById("closeBookingModal");
const bookingMessage          = document.getElementById("bookingMessage");
const overlay                 = document.getElementById("overlay");

const params      = new URLSearchParams(window.location.search);
const equipmentId = params.get("id");

function openModal(modal)            { modal.style.display = "block"; overlay.style.display = "block"; }
function closeModal(modal, form, msg){ modal.style.display = "none";  overlay.style.display = "none"; if (form) form.reset(); if (msg) msg.textContent = ""; }

closeBookingModalButton?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));
overlay?.addEventListener("click", () => closeModal(bookingModal, bookingForm, bookingMessage));

async function loadEquipmentDetails() {
  try {
    const res  = await apiRequest(`/equipment/${equipmentId}`);
    const item = res.data;

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

function whatsappBtn(phone, label, title) {
  if (!phone) return "";
  return `<a href="${createWhatsAppLink(phone, title)}" target="_blank" class="market-action-btn" style="background:var(--ump-green);flex:1;justify-content:center;">
             <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> ${label}
           </a>`;
}

function buildActionArea(item) {
  const isOwn = Number(item.owner_id) === Number(currentUser.id);
  const activeBookings = item.active_bookings || [];

  if (isOwn) {
    if (!activeBookings.length) {
      return `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your listing — no active bookings</div>`;
    }
    return activeBookings.map(b => {
      if (b.status === "Pending") {
        return `
          <div class="booking-inline-card">
            <div class="booking-inline-header">
              <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(b.renter_profile_photo, b.renter_name)}</div>
              <div>
                <div style="font-size:13px;font-weight:600;">${b.renter_name}</div>
                <div style="font-size:11px;color:var(--muted);">${b.start_date} → ${b.end_date}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="market-action-btn confirm-booking-btn" data-booking-id="${b.id}" style="flex:1;background:var(--ump-green);">
                <i class="ti ti-check" aria-hidden="true"></i> Confirm
              </button>
              <button class="market-action-btn outline decline-booking-btn" data-booking-id="${b.id}" style="flex:1;background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                <i class="ti ti-x" aria-hidden="true"></i> Decline
              </button>
            </div>
          </div>`;
      }
      return `
        <div class="booking-inline-card">
          <div class="booking-inline-header">
            <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(b.renter_profile_photo, b.renter_name)}</div>
            <div>
              <div style="font-size:13px;font-weight:600;">${b.renter_name}</div>
              <div style="font-size:11px;color:var(--muted);">${b.start_date} → ${b.end_date} · Confirmed</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="market-action-btn return-equipment-btn" data-booking-id="${b.id}" data-confirm-text="Confirm that this equipment has been returned to you?" style="flex:1;">
              <i class="ti ti-package-export" aria-hidden="true"></i> Confirm Return
            </button>
            ${whatsappBtn(b.renter_phone_number, "Message", item.name)}
          </div>
        </div>`;
    }).join("");
  }

  const myBooking = activeBookings.find(b => Number(b.renter_id) === Number(currentUser.id));

  if (myBooking && myBooking.status === "Pending") {
    return `
      <div class="badge gold" style="display:inline-flex;margin-bottom:10px;"><i class="ti ti-hourglass" aria-hidden="true"></i> Waiting for owner to confirm</div>
      <div style="display:flex;gap:8px;">
        <button class="market-action-btn outline cancel-booking-btn" data-booking-id="${myBooking.id}" style="flex:1;">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel Request
        </button>
        ${whatsappBtn(item.owner_phone_number, "Message", item.name)}
      </div>`;
  }

  if (myBooking && myBooking.status === "Confirmed") {
    return `
      <div class="badge" style="display:inline-flex;margin-bottom:10px;"><i class="ti ti-circle-check" aria-hidden="true"></i> You're renting this</div>
      <div style="display:flex;gap:8px;">
        <button class="market-action-btn return-equipment-btn" data-booking-id="${myBooking.id}" data-confirm-text="Confirm you are returning this equipment?" style="flex:1;">
          <i class="ti ti-package-export" aria-hidden="true"></i> Return Equipment
        </button>
        ${whatsappBtn(item.owner_phone_number, "Message", item.name)}
      </div>`;
  }

  return `<button class="primary-button" id="openBookingButton" data-equipment-id="${item.id}">
             <i class="ti ti-calendar-plus" aria-hidden="true"></i> Request Booking
           </button>`;
}

function renderEquipmentDetails(item) {
  const isOwn = Number(item.owner_id) === Number(currentUser.id);

  const reportButton = !isOwn
    ? `<button type="button" class="secondary-button" id="reportEquipmentButton" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.30);">
         <i class="ti ti-flag" aria-hidden="true"></i> Report an Issue
       </button>`
    : "";

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
          <div class="market-tag ${item.is_available ? "green" : "gold"}"><i class="ti ${item.is_available ? "ti-circle-check" : "ti-lock"}" aria-hidden="true"></i> ${item.is_available ? "Available" : "Currently booked"}</div>
        </div>
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Rental Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(item.owner_profile_photo, item.owner_name)}</div>
          <div>
            <div class="profile-link" data-user-id="${item.owner_id}" data-user-name="${item.owner_name}" style="font-weight:600;font-size:13px;cursor:pointer;">${item.owner_name}</div>
            <div style="font-size:11px;color:var(--muted);">Equipment Owner</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Daily rate</div>
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
        </div>
        <div style="margin-bottom:20px;">${buildActionArea(item)}</div>
        <a href="./equipment.html" class="secondary-button" style="margin-top:4px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Rentals
        </a>
        ${reportButton}
      </div>
    </div>`;

  attachProfileLinkEvents(equipmentDetailsContainer);
  attachBookingActionEvents();

  document.getElementById("openBookingButton")?.addEventListener("click", () => {
    bookingForm.reset();
    bookingEquipmentIdInput.value = item.id;
    bookingMessage.textContent = "";
    openModal(bookingModal);
  });

  document.getElementById("reportEquipmentButton")?.addEventListener("click", () => {
    openReportModal({ reportedUserId: item.owner_id, reportedUserName: item.owner_name, contextLabel: item.name });
  });
}

function attachBookingActionEvents() {
  document.querySelectorAll(".confirm-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/confirm`, "PATCH");
        showToast("Booking confirmed!");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        await loadEquipmentDetails();
      }
    });
  });

  document.querySelectorAll(".decline-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/decline`, "PATCH");
        showToast("Booking declined.");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        await loadEquipmentDetails();
      }
    });
  });

  document.querySelectorAll(".cancel-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/cancel`, "PATCH");
        showToast("Booking request cancelled.");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        await loadEquipmentDetails();
      }
    });
  });

  document.querySelectorAll(".return-equipment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(btn.dataset.confirmText || "Confirm equipment return?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/return`, "PATCH");
        showToast("Equipment marked as returned.");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        await loadEquipmentDetails();
      }
    });
  });
}

bookingForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector("button[type='submit']");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Sending…`;
  try {
    await apiRequest(`/equipment/${bookingEquipmentIdInput.value}/book`, "POST", {
      startDate: bookingStartDateInput.value,
      endDate:   bookingEndDateInput.value
    });
    showToast("Booking request sent! The owner needs to confirm it.");
    closeModal(bookingModal, bookingForm, bookingMessage);
    await loadEquipmentDetails();
  } catch (err) {
    bookingMessage.textContent = err.message;
    bookingMessage.style.color = "red";
    showToast(err.message, "error");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
  }
});

loadEquipmentDetails();