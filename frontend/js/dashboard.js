const currentUser = requireAuth();

const heroWelcomeEl          = document.getElementById("heroWelcome");
const featuredTasksContainer = document.getElementById("featuredTasksContainer");
const spotlightEventsContainer = document.getElementById("spotlightEventsContainer");
const recentActivityContainer  = document.getElementById("recentActivityContainer");

const statActiveTasks = document.getElementById("statActiveTasks");
const statServices    = document.getElementById("statServices");
const statReviews     = document.getElementById("statReviews");
const statRating      = document.getElementById("statRating");

const exploreAcademicCount = document.getElementById("exploreAcademicCount");
const exploreGeneralCount  = document.getElementById("exploreGeneralCount");
const exploreRentalsCount  = document.getElementById("exploreRentalsCount");
const exploreSalesCount    = document.getElementById("exploreSalesCount");

if (heroWelcomeEl && currentUser) {
  const first = currentUser.full_name?.split(" ")[0] || "Student";
  heroWelcomeEl.textContent = `Welcome back, ${first}! 👋`;
}

/* ── Client-side-only "saved" heart toggle ──
   There's no saved/favorited-listings table in the backend yet, so this
   is intentionally local-only (per browser) rather than pretending to
   sync anywhere. Swap for a real API call if a "Saved" feature ships. */
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedTasks") || "[]"); }
  catch { return []; }
}
function toggleSavedId(id) {
  const saved = getSavedIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedTasks", JSON.stringify(saved));
  return saved.includes(id);
}
function attachSaveHeartEvents(container) {
  container.querySelectorAll(".save-heart-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.saveId);
      const nowSaved = toggleSavedId(id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
      showToast(nowSaved ? "Saved to your list." : "Removed from your list.");
    });
  });
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function activityIconFor(type) {
  const map = {
    task_posted: "ti-clipboard-plus", task_completed: "ti-circle-check",
    review_received: "ti-star", equipment_booked: "ti-package",
    item_listed: "ti-tag", endorsement_given: "ti-certificate"
  };
  return map[type] || "ti-activity";
}

const PLACEHOLDER_COLORS = ["blue", "gold", "red", "navy", "purple"];
function placeholderColorFor(seed = "") {
  const sum = String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return PLACEHOLDER_COLORS[sum % PLACEHOLDER_COLORS.length];
}

function featureTaskCard(task) {
  const isSaved = getSavedIds().includes(task.id);
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light ${placeholderColorFor(task.category)}"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
        ${task.urgent ? `<div class="urgent-badge"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${endorsementCornerBadge(task, { shiftDown: task.urgent })}
        ${lecturerPostedCornerBadge(task.created_by_member_type)}
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${task.id}" aria-label="Save task">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${avatarHtml(task.created_by_name, task.created_by_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${task.created_by}" style="cursor:pointer;">${posterName(task.created_by_name, task.created_by_lecturer_title)}</div>
              <div class="market-user-meta"><i class="ti ti-shield-check" aria-hidden="true"></i> ${task.created_by_member_type === "Lecturer" ? "Verified Lecturer" : "Verified Student"}</div>
            </div>
          </div>
          ${sectionBadge(task.section || "General")}
        </div>
        <h3>${task.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${endorsementBadge(task)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${task.price} <span>/task</span></div>
          <a href="./task-details.html?id=${task.id}" class="market-action-btn"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
        </div>
      </div>
    </div>`;
}

function spotlightItem(ev) {
  const d = new Date(ev.event_date);
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `
    <a href="./event-details.html?id=${ev.id}" class="spotlight-item">
      <div class="spotlight-thumb">
        <div class="media-placeholder light navy"><i class="ti ti-calendar-event" aria-hidden="true"></i></div>
        <div class="spotlight-date-badge"><span>${month}</span><strong>${day}</strong></div>
      </div>
      <div class="spotlight-info">
        <div class="spotlight-title">${ev.title}</div>
        <div class="spotlight-meta">${time} &middot; ${ev.location}</div>
      </div>
    </a>`;
}

function activityRow(item) {
  return `
    <div class="profile-activity-item">
      <div class="profile-activity-icon"><i class="ti ${activityIconFor(item.type)}" aria-hidden="true"></i></div>
      <div class="profile-activity-body">
        <div class="profile-activity-title">${item.title}</div>
        ${item.subtitle ? `<div class="profile-activity-sub">${item.subtitle}</div>` : ""}
      </div>
      <div class="profile-activity-time">${timeAgo(item.created_at)}</div>
    </div>`;
}

async function loadDashboard() {
  try {
    const [profileRes, tasksRes, equipmentRes, salesRes, eventsRes] = await Promise.all([
      apiRequest(`/users/${currentUser.id}/profile`),
      apiRequest("/tasks"),
      apiRequest("/equipment"),
      apiRequest("/sales"),
      apiRequest("/events")
    ]);

    const profile   = profileRes.data;
    const tasks     = tasksRes.data;
    const equipment = equipmentRes.data;
    const sales     = salesRes.data;
    const events    = eventsRes.data;

    statActiveTasks.textContent = profile.stats.tasks_in_progress ?? 0;
    statServices.textContent    = profile.stats.total_rentals ?? 0;
    statReviews.textContent     = profile.total_reviews ?? 0;
    statRating.textContent      = Number(profile.rating_average || 0).toFixed(1);

    const academicCount = tasks.filter(t => t.section === "Academic").length;
    const generalCount  = tasks.filter(t => t.section === "General").length;
    exploreAcademicCount.textContent = `${academicCount} task${academicCount === 1 ? "" : "s"}`;
    exploreGeneralCount.textContent  = `${generalCount} task${generalCount === 1 ? "" : "s"}`;
    exploreRentalsCount.textContent  = `${equipment.length} item${equipment.length === 1 ? "" : "s"}`;
    exploreSalesCount.textContent    = `${sales.length} item${sales.length === 1 ? "" : "s"}`;

    featuredTasksContainer.innerHTML = tasks.length
      ? tasks.slice(0, 4).map(featureTaskCard).join("")
      : emptyState("ti-clipboard-list", "No tasks yet", "Be the first to post one!");
    attachProfileLinkEvents();
    attachSaveHeartEvents(featuredTasksContainer);

    const upcoming = events.slice(0, 3);
    spotlightEventsContainer.innerHTML = upcoming.length
      ? upcoming.map(spotlightItem).join("")
      : `<p class="rail-loading">No upcoming events yet.</p>`;

    const activity = (profile.recent_activity || []).slice(0, 4);
    recentActivityContainer.innerHTML = activity.length
      ? activity.map(activityRow).join("")
      : `<p class="rail-loading">No recent activity yet.</p>`;
  } catch (err) {
    featuredTasksContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadDashboard();