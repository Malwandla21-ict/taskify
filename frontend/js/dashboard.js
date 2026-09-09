const currentUser = requireAuth();

const heroWelcomeEl          = document.getElementById("heroWelcome");
const featuredTasksContainer = document.getElementById("featuredTasksContainer");
const spotlightEventsContainer = document.getElementById("spotlightEventsContainer");
const recentActivityContainer  = document.getElementById("recentActivityContainer");

const onboardingOverlay        = document.getElementById("onboardingModalOverlay");
const onboardingSkipBtn        = document.getElementById("onboardingSkipBtn");
const onboardingGetStartedBtn  = document.getElementById("onboardingGetStartedBtn");
const carouselTrack            = document.getElementById("carouselTrack");
const carouselDots             = document.getElementById("carouselDots");

/* ── First-login onboarding modal ──
   has_seen_onboarding is persisted server-side (SAFE_USER_FIELDS /
   markOnboardingSeen), not in localStorage — so it never reappears for
   this account regardless of device/browser, unlike a per-browser flag. */
async function dismissOnboarding() {
  onboardingOverlay.hidden = true;
  try {
    await apiRequest("/users/me/onboarding-seen", "PATCH");
    currentUser.has_seen_onboarding = 1;
    localStorage.setItem("taskifyUser", JSON.stringify(currentUser));
  } catch (err) {
    /* Non-critical — worst case the modal just shows again next login. */
    console.error("Failed to mark onboarding as seen:", err.message);
  }
}

if (onboardingOverlay && currentUser && !currentUser.has_seen_onboarding) {
  onboardingOverlay.hidden = false;
  onboardingSkipBtn?.addEventListener("click", dismissOnboarding);
  onboardingGetStartedBtn?.addEventListener("click", dismissOnboarding);
}

/* ── Hero spotlight: compact cards (3 per page) mixing events/tasks/rentals ──
   Reuses the tasks/equipment/events already fetched by loadDashboard()
   below rather than firing extra requests just for this. Pages of 3 cards
   at a time, auto-advancing through pages when there's more than one. */
let carouselTimer = null;

function spotlightIconFor(type) {
  if (type === "event") return "ti-calendar-event";
  if (type === "rental") return "ti-camera";
  if (type === "sale") return "ti-shopping-cart";
  return "ti-clipboard-check";
}

/* Fisher-Yates shuffle — used so the spotlight doesn't always show the
   exact same handful of listings (whatever the API happens to return
   first) on every single visit; a fresh shuffle each time loadDashboard()
   runs surfaces a different mix from the wider pool below. */
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function carouselSlideHtml({ type, tag, image, title, meta, href }) {
  const isRental = type === "rental";
  const bgAttr = isRental && image ? ` style="background-image:url('${image}')"` : "";
  return `
    <a href="${href}" class="spotlight-card ${type}"${bgAttr}>
      <div class="spotlight-card-top">
        <span class="spotlight-card-pill ${type}">${tag}</span>
        <span class="spotlight-card-icon"><i class="ti ${spotlightIconFor(type)}" aria-hidden="true"></i></span>
      </div>
      <div>
        <div class="spotlight-card-title">${title}</div>
        <div class="spotlight-card-meta">${meta}</div>
      </div>
    </a>`;
}

function initCarousel(items) {
  if (!carouselTrack) return;
  clearInterval(carouselTimer);

  if (!items.length) {
    carouselTrack.innerHTML = `<div class="carousel-slide-loading">Nothing to show yet — check back soon.</div>`;
    carouselDots.innerHTML = "";
    return;
  }

  const pages = [];
  for (let i = 0; i < items.length; i += 3) pages.push(items.slice(i, i + 3));

  let current = 0;

  function render() {
    carouselTrack.innerHTML = pages[current].map(carouselSlideHtml).join("");
  }

  function renderDots() {
    carouselDots.innerHTML = pages.length > 1
      ? pages.map((_, i) => `<button type="button" class="carousel-dot ${i === current ? "active" : ""}" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join("")
      : "";
    carouselDots.querySelectorAll(".carousel-dot").forEach(dot => {
      dot.addEventListener("click", () => { goTo(Number(dot.dataset.page)); resetTimer(); });
    });
  }

  function goTo(index) {
    current = (index + pages.length) % pages.length;
    render();
    renderDots();
  }

  function resetTimer() {
    clearInterval(carouselTimer);
    if (pages.length > 1) carouselTimer = setInterval(() => goTo(current + 1), 5000);
  }

  goTo(0);
  resetTimer();
}

const exploreAcademicCount = document.getElementById("exploreAcademicCount");
const exploreGeneralCount  = document.getElementById("exploreGeneralCount");
const exploreRentalsCount  = document.getElementById("exploreRentalsCount");
const exploreSalesCount    = document.getElementById("exploreSalesCount");

if (heroWelcomeEl && currentUser) {
  const first = currentUser.full_name?.split(" ")[0] || "Student";
  heroWelcomeEl.textContent = `Welcome back, ${first}`;
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
        ${ev.image_urls?.length
          ? `<img src="${ev.image_urls[0]}" alt="${ev.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light navy"><i class="ti ti-calendar-event" aria-hidden="true"></i></div>`}
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

    /* Shuffled + widened pool per category (was a flat .slice(0, 4) off
       whatever order the API returned — always the same first few items,
       every visit, forever). Sales listings were also fetched but never
       actually made it into the carousel at all — added as a fourth
       category below. */
    const eventItems = shuffleArray(events).slice(0, 6).map(ev => ({
      type: "event",
      tag: "Event",
      image: ev.image_urls?.[0] || null,
      title: ev.title,
      meta: `${new Date(ev.event_date).toLocaleDateString([], { month: "short", day: "numeric" })} · ${ev.location}`,
      href: `./event-details.html?id=${ev.id}`
    }));
    const taskItems = shuffleArray(tasks).slice(0, 6).map(t => ({
      type: "task",
      tag: "Task",
      image: t.image_urls?.[0] || null,
      title: t.title,
      meta: `R${t.price} · ${t.location}`,
      href: `./task-details.html?id=${t.id}`
    }));
    const rentalItems = shuffleArray(equipment).slice(0, 6).map(eq => ({
      type: "rental",
      tag: "Rental",
      image: eq.image_urls?.[0] || null,
      title: eq.name,
      meta: `R${eq.daily_price}/day · ${eq.category}`,
      href: `./equipment-details.html?id=${eq.id}`
    }));
    const saleItems = shuffleArray(sales).slice(0, 6).map(s => ({
      type: "sale",
      tag: "For Sale",
      image: s.image_urls?.[0] || null,
      title: s.title,
      meta: `R${s.price} · ${s.location}`,
      href: `./sale-details.html?id=${s.id}`
    }));

    /* Interleave round-robin (event, task, rental, sale, event, task…) so
       each page of 3 mixes categories instead of one page being all
       events followed by a page that's all rentals. */
    const carouselItems = [];
    const maxLen = Math.max(eventItems.length, taskItems.length, rentalItems.length, saleItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (eventItems[i]) carouselItems.push(eventItems[i]);
      if (taskItems[i]) carouselItems.push(taskItems[i]);
      if (rentalItems[i]) carouselItems.push(rentalItems[i]);
      if (saleItems[i]) carouselItems.push(saleItems[i]);
    }
    initCarousel(carouselItems);

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