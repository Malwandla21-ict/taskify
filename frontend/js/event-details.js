const currentUser = requireAuth();
const eventDetailsContainer = document.getElementById("eventDetailsContainer");

const params  = new URLSearchParams(window.location.search);
const eventId = params.get("id");

function formatEventDate(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

async function loadEventDetails() {
  try {
    const [eventsRes, rsvpRes] = await Promise.all([
      apiRequest("/events"),
      apiRequest("/events/rsvp-status")
    ]);
    const event = eventsRes.data.find(e => Number(e.id) === Number(eventId));
    if (!event) {
      eventDetailsContainer.innerHTML = emptyState("ti-calendar-off", "Event not found", "This event may have passed or been removed.");
      return;
    }
    renderEventDetails(event, rsvpRes.data.includes(event.id));
  } catch (err) {
    eventDetailsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

function renderEventDetails(event, hasRsvped) {
  const isOwn = Number(event.organizer_id) === Number(currentUser.id);
  const isFull = event.capacity && event.rsvp_count >= event.capacity;

  let actionArea;
  if (isOwn) {
    actionArea = `
      <div class="badge navy" style="margin-bottom:10px;"><i class="ti ti-user" aria-hidden="true"></i> You're organizing this event</div>
      <button class="secondary-button" id="deleteEventButton" style="color:var(--ump-red);border-color:rgba(224,58,62,0.30);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete Event
      </button>`;
  } else if (hasRsvped) {
    actionArea = `<button class="secondary-button" id="cancelRsvpButton"><i class="ti ti-x" aria-hidden="true"></i> Cancel RSVP</button>`;
  } else if (isFull) {
    actionArea = `<div class="badge red"><i class="ti ti-users" aria-hidden="true"></i> This event is fully booked</div>`;
  } else {
    actionArea = `<button class="primary-button" id="rsvpButton"><i class="ti ti-calendar-plus" aria-hidden="true"></i> RSVP</button>`;
  }

  eventDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        ${renderImageGallery(event.image_urls, "ti-calendar-event")}
        ${sectionBadge(event.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${event.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${event.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${event.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${event.location}</div>
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
        </div>
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Event Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(event.organizer_name, event.organizer_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${event.organizer_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${event.organizer_name}</div>
            <div style="font-size:11px;color:var(--muted);">Organizer</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Attendance</div>
          <div style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-users" aria-hidden="true"></i> ${event.rsvp_count}${event.capacity ? ` / ${event.capacity}` : ""} going
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Status</div>
          ${statusBadge(event.status)}
        </div>
        ${actionArea}
        <a href="./events.html" class="secondary-button" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Events
        </a>
      </div>
    </div>`;

  attachProfileLinkEvents();

  document.getElementById("rsvpButton")?.addEventListener("click", async () => {
    try {
      await apiRequest(`/events/${event.id}/rsvp`, "POST");
      showToast("RSVP confirmed!");
      await loadEventDetails();
    } catch (err) { showToast(err.message, "error"); }
  });

  document.getElementById("cancelRsvpButton")?.addEventListener("click", async () => {
    try {
      await apiRequest(`/events/${event.id}/rsvp`, "DELETE");
      showToast("RSVP cancelled.");
      await loadEventDetails();
    } catch (err) { showToast(err.message, "error"); }
  });

  document.getElementById("deleteEventButton")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete this event?")) return;
    try {
      await apiRequest(`/events/${event.id}`, "DELETE");
      showToast("Event deleted.");
      setTimeout(() => window.location.href = "./events.html", 800);
    } catch (err) { showToast(err.message, "error"); }
  });
}

loadEventDetails();