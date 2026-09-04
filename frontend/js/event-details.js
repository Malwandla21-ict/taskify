const currentUser = requireAuth();

const eventDetailsContainer = document.getElementById("eventDetailsContainer");

const params  = new URLSearchParams(window.location.search);
const eventId = params.get("id");

document.getElementById("backButton")?.addEventListener("click", () => goBack("./events.html"));

function formatEventDate(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit"
  });
}

async function loadEventDetails() {
  try {
    const [eventRes, rsvpRes] = await Promise.all([
      apiRequest(`/events/${eventId}`),
      apiRequest("/events/rsvp-status")
    ]);
    renderEventDetails(eventRes.data, rsvpRes.data.includes(eventRes.data.id));
  } catch (err) {
    eventDetailsContainer.innerHTML = errorState(err.message || "This event is no longer available.");
    showToast(err.message, "error");
  }
}

function renderEventDetails(event, hasRsvped) {
  const isOwn  = Number(event.organizer_id) === Number(currentUser.id);
  const isFull = event.capacity && event.rsvp_count >= event.capacity;

  let actionArea;
  if (isOwn) {
    actionArea = `
      <div class="badge navy" style="margin-bottom:10px;"><i class="ti ti-user" aria-hidden="true"></i> Organizing</div>
      <button class="secondary-button" id="deleteEventButton" style="color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete Event
      </button>`;
  } else if (hasRsvped) {
    actionArea = `<button class="primary-button" id="cancelRsvpButton" style="background:var(--ump-red);">
                     <i class="ti ti-x" aria-hidden="true"></i> Cancel RSVP
                   </button>`;
  } else if (isFull) {
    actionArea = `<div class="badge red"><i class="ti ti-users" aria-hidden="true"></i> This event is full</div>`;
  } else if (event.status !== "Upcoming") {
    actionArea = statusBadge(event.status);
  } else {
    actionArea = `<button class="primary-button" id="rsvpButton">
                     <i class="ti ti-calendar-plus" aria-hidden="true"></i> RSVP
                   </button>`;
  }

  eventDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        <div style="position:relative;">
          ${renderImageGallery(event.image_urls, "ti-calendar-event")}
          ${endorsementCornerBadge(event)}
          ${lecturerPostedCornerBadge(event.organizer_member_type)}
        </div>
        ${sectionBadge(event.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${event.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${event.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${event.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${event.location}</div>
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
          ${statusBadge(event.status)}
        </div>
        ${endorsementDetailBlock(event)}
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Event Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(event.organizer_name, event.organizer_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${event.organizer_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(event.organizer_name, event.organizer_lecturer_title)}</div>
            <div style="font-size:11px;color:var(--muted);">Organizer</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Date &amp; Time</div>
          <div style="font-size:13px;font-weight:700;">${formatEventDate(event.event_date)}</div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Attendance</div>
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-users" aria-hidden="true"></i> ${event.rsvp_count}${event.capacity ? `/${event.capacity}` : ""} going
          </div>
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Events
        </button>
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./events.html"));

  attachProfileLinkEvents();

  document.getElementById("rsvpButton")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
    try {
      await apiRequest(`/events/${eventId}/rsvp`, "POST");
      showToast("RSVP confirmed!");
      await loadEventDetails();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-calendar-plus" aria-hidden="true"></i> RSVP`;
    }
  });

  document.getElementById("cancelRsvpButton")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
    try {
      await apiRequest(`/events/${eventId}/rsvp`, "DELETE");
      showToast("RSVP cancelled.");
      await loadEventDetails();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Cancel RSVP`;
    }
  });

  document.getElementById("deleteEventButton")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete this event?")) return;
    try {
      await apiRequest(`/events/${eventId}`, "DELETE");
      showToast("Event deleted.");
      setTimeout(() => window.location.href = "./events.html", 800);
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

loadEventDetails();