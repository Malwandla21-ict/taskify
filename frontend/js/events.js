const currentUser = requireAuth();

const eventForm         = document.getElementById("eventForm");
const eventMessage      = document.getElementById("eventMessage");
const eventsContainer   = document.getElementById("eventsContainer");
const myEventsContainer = document.getElementById("myEventsContainer");
const eventSearch       = document.getElementById("eventSearch");
const eventSearchButton = document.getElementById("eventSearchButton");

const bookingModal          = document.getElementById("bookingModal"); /* repurposed as the event-creation modal */
const openCreateEventButton = document.getElementById("openCreateEventButton");
const closeEventModalButton = document.getElementById("closeEventModal");

const eventStep1    = document.getElementById("eventStep1");
const eventStep2    = document.getElementById("eventStep2");
const eventStep3    = document.getElementById("eventStep3");
const eventStepText = document.getElementById("eventStepText");
const eventProgressFill = document.getElementById("eventProgressFill");
const eDot1 = document.getElementById("eDot1");
const eDot2 = document.getElementById("eDot2");
const eDot3 = document.getElementById("eDot3");

let cachedEvents    = [];
let myRsvpIds       = [];
let selectedSection = "All";

/* ── Modal open/close ── */
openCreateEventButton?.addEventListener("click", () => {
  eventForm.reset();
  eventMessage.textContent = "";
  showEventStep(1);
  if (eventUploader) eventUploader.reset();
  openModal(bookingModal);
});
closeEventModalButton?.addEventListener("click", () => closeModal(bookingModal, null, null));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(bookingModal, null, null));

/* ── Step navigation ── */
function showEventStep(n) {
  eventStep1.style.display = n === 1 ? "block" : "none";
  eventStep2.style.display = n === 2 ? "block" : "none";
  eventStep3.style.display = n === 3 ? "block" : "none";
  eventStepText.textContent = `Step ${n} of 3`;
  eventProgressFill.style.width = n === 1 ? "33%" : n === 2 ? "66%" : "100%";
  [eDot1, eDot2, eDot3].forEach((dot, i) => {
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (i + 1 < n)  dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });
}

function validateEventStep1() {
  if (!document.getElementById("eventTitle").value.trim() || !document.getElementById("eventCategory").value.trim()) {
    showToast("Please complete the event title and category.", "error");
    return false;
  }
  return true;
}

function validateEventStep2() {
  if (!document.getElementById("eventDescription").value.trim() || !document.getElementById("eventLocation").value.trim()) {
    showToast("Please complete the description and location.", "error");
    return false;
  }
  return true;
}

document.getElementById("nextEventStep2")?.addEventListener("click", () => { if (validateEventStep1()) showEventStep(2); });
document.getElementById("nextEventStep3")?.addEventListener("click", () => { if (validateEventStep2()) showEventStep(3); });
document.getElementById("backEventStep1")?.addEventListener("click", () => showEventStep(1));
document.getElementById("backEventStep2")?.addEventListener("click", () => showEventStep(2));

/* ── Filters / search ── */
document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderEvents(cachedEvents);
  });
});
eventSearch?.addEventListener("input", () => renderEvents(cachedEvents));
eventSearchButton?.addEventListener("click", () => renderEvents(cachedEvents));

function formatEventDate(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit"
  });
}

/* ── Card builder ── */
function eventCard(event) {
  const isOwn     = Number(event.organizer_id) === Number(currentUser.id);
  const hasRsvped = myRsvpIds.includes(event.id);
  const isFull    = event.capacity && event.rsvp_count >= event.capacity;

  let actionArea;
  if (isOwn) {
    actionArea = `
      <div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Organizing</div>
      <button class="market-action-btn outline delete-event-btn" data-event-id="${event.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete
      </button>`;
  } else if (hasRsvped) {
    actionArea = `<button class="market-action-btn outline cancel-rsvp-btn" data-event-id="${event.id}"><i class="ti ti-x" aria-hidden="true"></i> Cancel RSVP</button>`;
  } else if (isFull) {
    actionArea = `<div class="badge red"><i class="ti ti-users" aria-hidden="true"></i> Full</div>`;
  } else {
    actionArea = `<button class="market-action-btn rsvp-btn" data-event-id="${event.id}"><i class="ti ti-calendar-plus" aria-hidden="true"></i> RSVP</button>`;
  }

  return `
    <div class="market-card">
      <div class="market-image" style="background:linear-gradient(135deg,#EAF6EF,#B9E4CB);">
        ${event.image_urls?.length
          ? `<img src="${event.image_urls[0]}" alt="${event.title}" class="lightbox-img" data-gallery="event-${event.id}" data-full="${event.image_urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="market-image-placeholder" style="color:var(--ump-green);"><i class="ti ti-calendar-event" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${avatarHtml(event.organizer_name, event.organizer_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${event.organizer_id}" style="cursor:pointer;">${event.organizer_name}</div>
              <div class="market-user-meta"><i class="ti ti-calendar-event" aria-hidden="true"></i> Organizer</div>
            </div>
          </div>
          ${sectionBadge(event.section || "General")}
        </div>
        <h3>${event.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${event.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${event.location}</div>
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
        </div>
        <div class="market-footer">
          <div style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px;">
            <i class="ti ti-users" aria-hidden="true"></i> ${event.rsvp_count}${event.capacity ? `/${event.capacity}` : ""} going
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="./event-details.html?id=${event.id}" class="market-action-btn outline"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
            ${actionArea}
          </div>
        </div>
      </div>
    </div>`;
}

function myEventCard(event) {
  const isOwn = Number(event.organizer_id) === Number(currentUser.id);
  return `
    <div class="market-card">
      <div class="market-image" style="background:linear-gradient(135deg,#EAF6EF,#B9E4CB);">
        ${event.image_urls?.length
          ? `<img src="${event.image_urls[0]}" alt="${event.title}" class="lightbox-img" data-gallery="myevent-${event.id}" data-full="${event.image_urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="market-image-placeholder" style="color:var(--ump-green);"><i class="ti ti-calendar-event" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(event.section || "General")}
          <div class="badge ${isOwn ? "navy" : ""}">${isOwn ? "Organizing" : "Attending"}</div>
        </div>
        <h3>${event.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${event.location}</div>
        </div>
        <a href="./event-details.html?id=${event.id}" class="market-action-btn outline" style="margin-top:10px;width:100%;justify-content:center;">
          <i class="ti ti-eye" aria-hidden="true"></i> View Details
        </a>
      </div>
    </div>`;
}

/* ── Render ── */
function renderEvents(events) {
  const q = eventSearch?.value.trim().toLowerCase() || "";
  const filtered = events.filter(e =>
    (selectedSection === "All" || e.section === selectedSection) &&
    [e.title, e.description, e.category, e.location].some(f => f?.toLowerCase().includes(q))
  );
  eventsContainer.innerHTML = filtered.length
    ? filtered.map(eventCard).join("")
    : emptyState("ti-calendar-event", "No events found", "Try a different filter or post one yourself.");
  attachEventButtonEvents();
  attachProfileLinkEvents();
}

function attachEventButtonEvents() {
  document.querySelectorAll(".rsvp-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/events/${btn.dataset.eventId}/rsvp`, "POST");
        showToast("RSVP confirmed!");
        await Promise.all([loadEvents(), loadMyEvents()]);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-calendar-plus" aria-hidden="true"></i> RSVP`;
      }
    });
  });

  document.querySelectorAll(".cancel-rsvp-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/events/${btn.dataset.eventId}/rsvp`, "DELETE");
        showToast("RSVP cancelled.");
        await Promise.all([loadEvents(), loadMyEvents()]);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Cancel RSVP`;
      }
    });
  });

  document.querySelectorAll(".delete-event-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this event?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/events/${btn.dataset.eventId}`, "DELETE");
        showToast("Event deleted.");
        await Promise.all([loadEvents(), loadMyEvents()]);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });
}

/* ── Loaders ── */
async function loadEvents() {
  try {
    const [eventsRes, rsvpRes] = await Promise.all([
      apiRequest("/events"),
      apiRequest("/events/rsvp-status")
    ]);
    cachedEvents = eventsRes.data;
    myRsvpIds    = rsvpRes.data;
    renderEvents(cachedEvents);
  } catch (err) {
    console.error("loadEvents failed:", err);
    eventsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadMyEvents() {
  try {
    const res = await apiRequest("/events/my");
    myEventsContainer.innerHTML = res.data.length
      ? res.data.map(myEventCard).join("")
      : emptyState("ti-clock", "No events yet", "Events you organize or RSVP to appear here.");
  } catch (err) {
    console.error("loadMyEvents failed:", err);
    myEventsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ── Form submit ── */
eventForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = eventForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Posting…`;

  try {
    let imageUrls = [];
    if (eventUploader && eventUploader.getFiles().length) {
      showToast("Uploading images…", "warning");
      imageUrls = await eventUploader.upload("events");
    }

    const capacityValue = document.getElementById("eventCapacity").value.trim();

    await apiRequest("/events", "POST", {
      title:       document.getElementById("eventTitle").value.trim(),
      description: document.getElementById("eventDescription").value.trim(),
      category:    document.getElementById("eventCategory").value.trim(),
      section:     document.getElementById("eventSection").value,
      location:    document.getElementById("eventLocation").value.trim(),
      eventDate:   new Date(document.getElementById("eventDate").value).toISOString(),
      capacity:    capacityValue ? Number(capacityValue) : null,
      imageUrls
    });

    showToast("Event posted successfully!");
    closeModal(bookingModal, eventForm, eventMessage);
    if (eventUploader) eventUploader.reset();
    await Promise.all([loadEvents(), loadMyEvents()]);
  } catch (err) {
    eventMessage.textContent = err.message;
    eventMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="ti ti-send" aria-hidden="true"></i> Post Event`;
  }
});

loadEvents();
loadMyEvents();

const eventUploader = initImageUploader("eventUploadArea", "eventPreviewGrid");