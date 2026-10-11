/* Guests (no account) can browse this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   anything that actually needs an account is guarded individually below. */
const currentUser = getCurrentUser();

const eventForm           = document.getElementById("eventForm");
const eventMessage        = document.getElementById("eventMessage");
const eventsContainer     = document.getElementById("eventsContainer");
const pastEventsContainer = document.getElementById("pastEventsContainer");
const myEventsMiniContainer = document.getElementById("myEventsMiniContainer");
const myEventsCountBadge  = document.getElementById("myEventsCountBadge");
const popularCategoriesContainer = document.getElementById("popularCategoriesContainer");
const eventSearch         = document.getElementById("eventSearch");
const eventSortSelect     = document.getElementById("eventSortSelect");

const bookingModal          = document.getElementById("bookingModal");
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

const CHIP_COLORS = ["green", "blue", "gold", "red", "navy", "purple"];

let cachedEvents    = [];
let myEvents        = [];
let myRsvpIds       = [];
let selectedSection = "All";

/* Edit mode: the same form edits an existing event — from the Edit button
   on an event card here, or when the page is opened as events.html?edit=<id>
   (the Edit button on the event's detail page). */
let editingEventId = null;
const eventModalTitle = document.getElementById("eventModalTitle");
const EVENT_TEXT = {
  create: { title: `<i class="ti ti-building-store" aria-hidden="true"></i> Post to Campus Marketplace`,
            submit: `<i class="ti ti-send" aria-hidden="true"></i> Post Listing` },
  edit:   { title: `<i class="ti ti-edit" aria-hidden="true"></i> Edit Listing`,
            submit: `<i class="ti ti-device-floppy" aria-hidden="true"></i> Save Changes` }
};

function setEventModalText() {
  const text = editingEventId ? EVENT_TEXT.edit : EVENT_TEXT.create;
  if (eventModalTitle) eventModalTitle.innerHTML = text.title;
  const submitBtn = eventForm?.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.innerHTML = text.submit;
}

/* datetime-local inputs want the viewer's local time as "YYYY-MM-DDTHH:MM". */
function toLocalDateTimeInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/* Institutional categories (farm produce, surplus, lost property,
   departmental) ask who authorised the listing. */
const eventCategorySelect = document.getElementById("eventCategory");
const eventAuthorityGroup = document.getElementById("eventAuthorityGroup");
const eventAuthorityInput = document.getElementById("eventAuthority");

function isInstitutionalCategory(category) {
  return INSTITUTIONAL_EVENT_CATEGORIES.includes(category);
}

function syncAuthorityField() {
  if (!eventAuthorityGroup) return;
  eventAuthorityGroup.hidden = !isInstitutionalCategory(eventCategorySelect?.value);
}
eventCategorySelect?.addEventListener("change", syncAuthorityField);
eventForm?.addEventListener("reset", () => setTimeout(syncAuthorityField, 0));

/* Who may post or edit listings: only admins while the server's
   marketplace switch says so (it refuses anyone else either way). */
let canPostToMarketplace = false;
async function loadMarketplacePosting() {
  const features = await loadFeatures();
  canPostToMarketplace = !features.marketplaceAdminsOnly || currentUser?.role === "admin";
  const postCard = document.getElementById("marketplacePostCard");
  const adminNote = document.getElementById("marketplaceAdminNote");
  if (postCard) postCard.hidden = !canPostToMarketplace;
  if (adminNote) adminNote.hidden = canPostToMarketplace;
  return canPostToMarketplace;
}
const marketplacePostingReady = loadMarketplacePosting();

openCreateEventButton?.addEventListener("click", () => {
  if (!requireAuthAction("Sign in to post to the marketplace.")) return;
  if (!canPostToMarketplace) { showToast("Campus Marketplace listings are posted by Taskify admins.", "error"); return; }
  editingEventId = null;
  eventForm.reset();
  eventMessage.textContent = "";
  setEventModalText();
  showEventStep(1);
  if (eventUploader) eventUploader.reset();
  openModal(bookingModal);
});

function openEventEditModal(event) {
  editingEventId = event.id;
  eventForm.reset();
  eventMessage.textContent = "";
  document.getElementById("eventTitle").value           = event.title || "";
  fillCategorySelect(document.getElementById("eventCategory"), "event", event.category || "", document.getElementById("eventCategoryHint"));
  /* An older event keeps its old category (no longer offered for new listings). */
  if (LEGACY_EVENT_CATEGORIES.includes(event.category)) {
    eventCategorySelect.insertAdjacentHTML("beforeend", `<optgroup label="Current (no longer offered)"><option value="${escapeHtml(event.category)}">${escapeHtml(event.category)}</option></optgroup>`);
    eventCategorySelect.value = event.category;
  }
  if (eventAuthorityInput) eventAuthorityInput.value = event.listing_authority || "";
  syncAuthorityField();
  document.getElementById("eventDescription").value     = event.description || "";
  document.getElementById("eventLocation").value        = event.location || "";
  document.getElementById("eventDate").value            = toLocalDateTimeInput(event.event_date);
  document.getElementById("eventCapacity").value        = event.capacity ?? "";
  document.getElementById("eventHasFood").checked         = !!Number(event.has_food);
  document.getElementById("eventHasRefreshments").checked = !!Number(event.has_refreshments);
  if (eventUploader) eventUploader.setExisting(event.image_urls || []);
  setEventModalText();
  showEventStep(1);
  openModal(bookingModal);
}

async function openEventEditById(eventId) {
  if (!currentUser) return;
  if (!(await marketplacePostingReady)) { showToast("Campus Marketplace listings can only be edited by Taskify admins.", "error"); return; }
  try {
    const res = await apiRequest(`/events/${eventId}`);
    const event = res.data;
    if (Number(event.organizer_id) !== Number(currentUser.id)) { showToast("You can only edit your own events.", "error"); return; }
    if (event.status !== "Upcoming" || new Date(event.event_date) < new Date()) { showToast("Only upcoming events can be edited.", "error"); return; }
    openEventEditModal(event);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openEventEditFromUrl() {
  const editId = getEditIdFromUrl();
  if (!editId) return;
  clearEditParam();
  openEventEditById(editId);
}
closeEventModalButton?.addEventListener("click", () => closeModal(bookingModal, null, null));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(bookingModal, null, null));

function showEventStep(n) {
  eventStep1.style.display = n === 1 ? "block" : "none";
  eventStep2.style.display = n === 2 ? "block" : "none";
  eventStep3.style.display = n === 3 ? "block" : "none";
  eventStepText.textContent = `${editingEventId ? "Editing · " : ""}Step ${n} of 3`;
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
    showToast("Please complete the title and category.", "error");
    return false;
  }
  if (isInstitutionalCategory(eventCategorySelect.value) && (eventAuthorityInput?.value.trim().length || 0) < 5) {
    showToast("Please say who authorised this listing.", "error");
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

document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderEvents();
  });
});
eventSearch?.addEventListener("input", renderEvents);
eventSortSelect?.addEventListener("change", renderEvents);
document.getElementById("eventCategoryFilter")?.addEventListener("change", renderEvents);

function formatEventDate(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit"
  });
}

function eventCard(event) {
  const isOwn     = !!currentUser && Number(event.organizer_id) === Number(currentUser.id);
  const hasRsvped = myRsvpIds.includes(event.id);
  const isFull    = event.capacity && event.rsvp_count >= event.capacity;

  let actionArea;
  if (isOwn) {
    actionArea = `
      <div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Organizing</div>
      ${canPostToMarketplace ? `<button class="market-action-btn outline edit-event-btn" data-event-id="${event.id}">
        <i class="ti ti-edit" aria-hidden="true"></i> Edit
      </button>` : ""}
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
      <div class="market-image" style="position:relative;">
        ${event.image_urls?.length
          ? `<img src="${escapeHtml(event.image_urls[0])}" alt="${escapeHtml(event.title)}" class="lightbox-img" data-gallery="event-${event.id}" data-full="${escapeHtml(event.image_urls[0])}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light green"><i class="ti ti-building-store" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(event)}
        ${lecturerPostedCornerBadge(event.organizer_member_type, event.organizer_lecturer_verified)}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${avatarHtml(event.organizer_name, event.organizer_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${event.organizer_id}" style="cursor:pointer;">${escapeHtml(posterName(event.organizer_name, event.organizer_lecturer_title))}</div>
              <div class="market-user-meta"><i class="ti ti-building-store" aria-hidden="true"></i> Posted by</div>
            </div>
          </div>
          ${sectionBadge(event.section || "General")}
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <div class="market-tags">
          ${institutionalBadge(event)}
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(event.category)}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(event.location)}</div>
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
          ${eventFoodTags(event)}
          ${endorsementBadge(event)}
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

/* ── Past Events ──
   There's no "browse everyone's past events" endpoint (GET /events only
   returns upcoming ones), so this section is scoped honestly to events
   the current person organized or attended, filtered client-side by date. */
function pastEventCard(event) {
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${event.image_urls?.length
          ? `<img src="${escapeHtml(event.image_urls[0])}" alt="${escapeHtml(event.title)}" style="width:100%;height:100%;object-fit:cover;filter:grayscale(35%);opacity:0.85;" />`
          : `<div class="media-placeholder light navy"><i class="ti ti-calendar-off" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(event.section || "General")}
          <div class="badge">Ended</div>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(event.location)}</div>
          <div class="market-tag"><i class="ti ti-users" aria-hidden="true"></i> ${event.rsvp_count} went</div>
        </div>
      </div>
    </div>`;
}

function myEventMiniCard(event) {
  const isOwn = !!currentUser && Number(event.organizer_id) === Number(currentUser.id);
  return `
    <div class="mini-history-item">
      <div class="mini-history-thumb">${event.image_urls?.length
        ? `<img src="${escapeHtml(event.image_urls[0])}" alt="${escapeHtml(event.title)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div class="media-placeholder light green"><i class="ti ti-calendar-event" aria-hidden="true"></i></div>`}</div>
      <div class="mini-history-info">
        <div class="mini-history-top">
          ${sectionBadge(event.section || "General")}
          <div class="badge ${isOwn ? "navy" : ""}">${isOwn ? "Organizing" : "Attending"}</div>
          ${pendingReviewBadge(event.moderation_status)}
        </div>
        <a href="./event-details.html?id=${event.id}" class="mini-history-title">${escapeHtml(event.title)}</a>
        <div class="mini-history-meta">${formatEventDate(event.event_date)}</div>
      </div>
      ${isOwn ? `<button class="table-icon-btn danger delete-event-btn" data-event-id="${event.id}" title="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ""}
    </div>`;
}

function renderEvents() {
  const q = eventSearch?.value.trim().toLowerCase() || "";
  const category = document.getElementById("eventCategoryFilter")?.value || "All";
  let filtered = cachedEvents.filter(e =>
    (selectedSection === "All" || e.section === selectedSection) &&
    (category === "All" || e.category === category) &&
    [e.title, e.description, e.category, e.location].some(f => f?.toLowerCase().includes(q))
  );

  const sort = eventSortSelect?.value || "upcoming";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "popular") return (b.rsvp_count || 0) - (a.rsvp_count || 0);
    return new Date(a.event_date) - new Date(b.event_date);
  });

  eventsContainer.innerHTML = filtered.length
    ? filtered.map(eventCard).join("")
    : emptyState("ti-building-store", "Nothing here yet", canPostToMarketplace
        ? "Try a different filter, or post a market day, stall or swap."
        : "Try a different filter. New market days and campus sales are posted by Taskify admins.");
  attachEventButtonEvents(eventsContainer);
  attachProfileLinkEvents();
}

function renderPastEvents() {
  const now = new Date();
  const past = myEvents.filter(e => new Date(e.event_date) < now).slice(0, 8);
  pastEventsContainer.innerHTML = past.length
    ? past.map(pastEventCard).join("")
    : emptyState("ti-calendar-off", "No past events yet", "Events you organized or attended will show here once they end.");
}

function renderMyEventsRail() {
  const now = new Date();
  const upcomingMine = myEvents.filter(e => new Date(e.event_date) >= now).slice(0, 4);
  myEventsCountBadge.textContent = myEvents.length ? `${myEvents.length} total` : "";
  myEventsMiniContainer.innerHTML = upcomingMine.length
    ? upcomingMine.map(myEventMiniCard).join("")
    : `<p class="rail-loading">No upcoming events yet.</p>`;
  attachEventButtonEvents(myEventsMiniContainer);
}

function renderPopularCategories() {
  const counts = {};
  cachedEvents.forEach(e => {
    if (!e.category) return;
    counts[e.category] = (counts[e.category] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  popularCategoriesContainer.innerHTML = top.length
    ? top.map(([cat, count], i) => `
        <div class="popular-category-chip ${CHIP_COLORS[i % CHIP_COLORS.length]}" data-category="${escapeHtml(cat)}" role="button" tabindex="0" title="Show ${escapeHtml(cat)} events" style="cursor:pointer;">
          <i class="ti ti-tag" aria-hidden="true"></i>
          <div>
            <strong>${escapeHtml(cat)}</strong>
            <span>${count} listing${count === 1 ? "" : "s"}</span>
          </div>
        </div>`).join("")
    : `<p class="rail-loading">No categories yet.</p>`;

  /* Tapping a popular category filters the list to it. */
  popularCategoriesContainer.querySelectorAll(".popular-category-chip[data-category]").forEach(chip => {
    const pick = () => {
      const filter = document.getElementById("eventCategoryFilter");
      if (!filter) return;
      filter.value = chip.dataset.category;
      if (filter.value !== chip.dataset.category) return; // not on the list
      renderEvents();
      eventsContainer?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    chip.addEventListener("click", pick);
    chip.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
}

function attachEventButtonEvents(scope = document) {
  scope.querySelectorAll(".rsvp-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!requireAuthAction("Sign in to RSVP to this event.")) return;
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

  scope.querySelectorAll(".cancel-rsvp-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
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

  scope.querySelectorAll(".edit-event-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => openEventEditById(btn.dataset.eventId));
  });

  scope.querySelectorAll(".delete-event-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this listing?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/events/${btn.dataset.eventId}`, "DELETE");
        showToast("Event deleted.");
        await Promise.all([loadEvents(), loadMyEvents()]);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i>`;
      }
    });
  });
}

async function loadEvents() {
  await marketplacePostingReady;
  try {
    /* /events/rsvp-status requires an account — fetched separately (and
       only when logged in) so a guest still gets the event list even
       though they have no RSVP status to fetch. A Promise.all here would
       fail the whole page for a guest the moment the auth-only call 401s. */
    const eventsRes = await apiRequest("/events");
    cachedEvents = eventsRes.data;

    if (currentUser) {
      try {
        const rsvpRes = await apiRequest("/events/rsvp-status");
        myRsvpIds = rsvpRes.data;
      } catch (err) {
        console.error("Failed to load RSVP status:", err);
        myRsvpIds = [];
      }
    } else {
      myRsvpIds = [];
    }

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam && eventSearch) eventSearch.value = searchParam;

    renderEvents();
    renderPopularCategories();
  } catch (err) {
    console.error("loadEvents failed:", err);
    eventsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadMyEvents() {
  await marketplacePostingReady;
  if (!currentUser) {
    myEventsMiniContainer.innerHTML = `<p class="rail-loading">Sign in to see events you're organizing or attending.</p>`;
    pastEventsContainer.innerHTML = emptyState("ti-lock", "Sign in to see past events", "Create an account or log in to track events you've organized or attended.");
    if (myEventsCountBadge) myEventsCountBadge.textContent = "";
    return;
  }
  try {
    const res = await apiRequest("/events/my");
    myEvents = res.data;
    renderMyEventsRail();
    renderPastEvents();
  } catch (err) {
    console.error("loadMyEvents failed:", err);
    myEventsMiniContainer.innerHTML = errorState(err.message);
  }
}

eventForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = eventForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `${taskifyMarkLoader()} ${editingEventId ? "Saving…" : "Posting…"}`;

  try {
    /* In edit mode, keep the saved photos the organizer didn't remove. */
    let imageUrls = eventUploader ? eventUploader.getExisting() : [];
    if (eventUploader && eventUploader.getFiles().length) {
      imageUrls = [...imageUrls, ...await eventUploader.upload("events")];
    }

    const capacityValue = document.getElementById("eventCapacity").value.trim();

    const payload = {
      title:           document.getElementById("eventTitle").value.trim(),
      description:     document.getElementById("eventDescription").value.trim(),
      category:        document.getElementById("eventCategory").value.trim(),
      section:         categorySection("event", document.getElementById("eventCategory").value),
      location:        document.getElementById("eventLocation").value.trim(),
      eventDate:       new Date(document.getElementById("eventDate").value).toISOString(),
      capacity:        capacityValue ? Number(capacityValue) : null,
      hasFood:         document.getElementById("eventHasFood").checked,
      hasRefreshments: document.getElementById("eventHasRefreshments").checked,
      imageUrls,
      listingAuthority: isInstitutionalCategory(document.getElementById("eventCategory").value)
        ? eventAuthorityInput.value.trim() : null
    };
    const heldForCheck = isInstitutionalCategory(payload.category);

    if (editingEventId) {
      await apiRequest(`/events/${editingEventId}`, "PUT", payload);
      showToast(heldForCheck ? "Saved. An admin will check the authorisation before it's shown again." : "Listing updated!");
      window.location.href = `./event-details.html?id=${editingEventId}`;
      return;
    }

    const created = await apiRequest("/events", "POST", payload);

    showToast(created?.data?.moderation_status === "pending_review"
      ? "Sent for a check. Your listing appears once a Taskify admin approves it."
      : "Listing posted!");
    closeModal(bookingModal, eventForm, eventMessage);
    if (eventUploader) eventUploader.reset();
    await Promise.all([loadEvents(), loadMyEvents()]);
  } catch (err) {
    eventMessage.textContent = err.message;
    eventMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    setEventModalText();
  }
});

const eventPolicyNoticeEl = document.getElementById("eventPolicyNotice");
if (eventPolicyNoticeEl) eventPolicyNoticeEl.innerHTML = contentPolicyNotice();

fillCategorySelect(document.getElementById("eventCategory"), "event", "", document.getElementById("eventCategoryHint"));
fillCategoryFilter(document.getElementById("eventCategoryFilter"), "event");
loadEvents();
loadMyEvents();

const eventUploader = initImageUploader("eventUploadArea", "eventPreviewGrid");

openEventEditFromUrl();