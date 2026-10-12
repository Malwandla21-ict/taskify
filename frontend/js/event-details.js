/* Guests (no account) can view this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   RSVPing is guarded individually below. */
const currentUser = getCurrentUser();

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
    /* /events/rsvp-status requires an account — fetched separately (and
       only when logged in) so a guest can still view the event even
       though they have no RSVP status to fetch. A Promise.all here would
       fail the whole page for a guest the moment the auth-only call 401s. */
    const eventRes = await apiRequest(`/events/${eventId}`);
    let hasRsvped = false;
    if (currentUser) {
      try {
        const rsvpRes = await apiRequest("/events/rsvp-status");
        hasRsvped = rsvpRes.data.includes(eventRes.data.id);
      } catch (err) {
        console.error("Failed to load RSVP status:", err);
      }
    }
    renderEventDetails(eventRes.data, hasRsvped);
  } catch (err) {
    eventDetailsContainer.innerHTML = errorState(err.message || "This listing is no longer available.");
    showToast(err.message, "error");
  }
}

async function renderEventDetails(event, hasRsvped) {
  const isOwn  = !!currentUser && Number(event.organizer_id) === Number(currentUser.id);

  /* Anyone signed in, except the organiser, can report this event. */
  const reportTarget = currentUser && !isOwn
    ? { contextType: "event", contextId: event.id, itemTitle: event.title, reportedUserId: event.organizer_id, reportedUserName: event.organizer_name }
    : null;
  const isFull = event.capacity && event.rsvp_count >= event.capacity;

  let actionArea;
  if (isOwn) {
    /* Editable only while upcoming — same rule as the server. */
    const features = await loadFeatures();
    const canEdit = event.status === "Upcoming" && new Date(event.event_date) >= new Date()
      && (!features.marketplaceAdminsOnly || currentUser?.role === "admin");
    actionArea = `
      <div class="badge navy" style="margin-bottom:10px;"><i class="ti ti-user" aria-hidden="true"></i> Organizing</div>
      ${canEdit ? `
      <a href="./events.html?edit=${event.id}" class="secondary-button" style="margin-bottom:10px;">
        <i class="ti ti-edit" aria-hidden="true"></i> Edit Listing
      </a>` : ""}
      <button class="secondary-button" id="deleteEventButton" style="color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete Listing
      </button>`;
  } else if (hasRsvped) {
    actionArea = `<button class="primary-button" id="cancelRsvpButton" style="background:var(--ump-red);">
                     <i class="ti ti-x" aria-hidden="true"></i> Not going
                   </button>`;
  } else if (isFull) {
    actionArea = `<div class="badge red"><i class="ti ti-users" aria-hidden="true"></i> This is full</div>`;
  } else if (event.status !== "Upcoming") {
    actionArea = statusBadge(event.status);
  } else {
    actionArea = `<button class="primary-button" id="rsvpButton">
                     <i class="ti ti-check" aria-hidden="true"></i> I'm going
                   </button>`;
  }

  eventDetailsContainer.innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">
          ${renderImageGallery(event.image_urls, "ti-building-store")}
          ${endorsementCornerBadge(event)}
          ${lecturerPostedCornerBadge(event.organizer_member_type, event.organizer_lecturer_verified)}
        </div>
        ${sectionBadge(event.section || "General")}
        <h1 class="detail-title">${escapeHtml(event.title)}</h1>
        <p class="detail-description">${escapeHtml(event.description)}</p>
        <div class="market-tags" style="margin-top:18px;">
          ${institutionalBadge(event)}
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(event.category)}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(event.location)}</div>
          <div class="market-tag"><i class="ti ti-clock" aria-hidden="true"></i> ${formatEventDate(event.event_date)}</div>
          ${eventFoodTags(event)}
          ${statusBadge(event.status)}
        </div>
        ${!isOwn ? noticeHtml(Number(event.has_food) || Number(event.has_refreshments) ? "marketFood" : "market") : ""}
        ${event.is_institutional && event.listing_authority ? `<p class="pay-note institutional-note"><i class="ti ti-building-bank" aria-hidden="true"></i> Authorised by (as stated by the poster): <strong>${escapeReportText(event.listing_authority)}</strong>. A Taskify admin checked this before it was shown — it is not an official university announcement.</p>` : ""}
        ${endorsementDetailBlock(event)}
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(event.organizer_name, event.organizer_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${event.organizer_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${escapeHtml(posterName(event.organizer_name, event.organizer_lecturer_title))}</div>
            <div style="font-size:11px;color:var(--muted);">Posted by</div>
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
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Campus Marketplace
        </button>
        ${reportTarget ? reportProblemButtonHtml() : ""}
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./events.html"));

  attachProfileLinkEvents();

  /* Report a problem about THIS item (goes to admins, not a review) */
  document.getElementById("reportProblemButton")?.addEventListener("click", () => openReportModal(reportTarget));

  document.getElementById("rsvpButton")?.addEventListener("click", async (e) => {
    if (!requireAuthAction("Sign in to say you're going.")) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
    try {
      await apiRequest(`/events/${eventId}/rsvp`, "POST");
      showToast("You're going! We'll let you know if anything changes.");
      await loadEventDetails();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> I'm going`;
    }
  });

  document.getElementById("cancelRsvpButton")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
    try {
      await apiRequest(`/events/${eventId}/rsvp`, "DELETE");
      showToast("Okay, you're no longer going.");
      await loadEventDetails();
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Not going`;
    }
  });

  document.getElementById("deleteEventButton")?.addEventListener("click", async () => {
    if (!confirm("Permanently delete this listing?")) return;
    try {
      await apiRequest(`/events/${eventId}`, "DELETE");
      showToast("Listing deleted.");
      setTimeout(() => window.location.href = "./events.html", 800);
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

loadEventDetails();