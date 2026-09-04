async function loadNavbar() {
  const navbarContainer = document.getElementById("navbarContainer");
  if (!navbarContainer) return;

  try {
    const response = await fetch("./components/navbar.html");
    const navbarHtml = await response.text();
    navbarContainer.innerHTML = navbarHtml;

    ensureProfileModal();
    highlightActiveLink();
    populateAvatar();
    toggleAdminLink();
    setupSidebarToggle();
    setupUserMenuToggle();
    setupTopbarSearch();
    startNotificationPolling();
    startMessagesBadgePolling();
    setupLogout();
    attachProfileLinkEvents();
  } catch (error) {
    console.error("Navbar failed to load:", error);
  }
}

function ensureProfileModal() {
  if (!document.getElementById("overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "overlay";
    document.body.appendChild(overlay);
  }

  if (!document.getElementById("profileModal")) {
    const modal = document.createElement("div");
    modal.id = "profileModal";
    modal.innerHTML = `
      <h2><i class="ti ti-user" aria-hidden="true"></i> User Trust Profile</h2>
      <div id="profileContent"><p>Loading profile...</p></div>
      <button type="button" id="closeProfileModal" class="secondary-button" style="margin-top:14px;">
        <i class="ti ti-x" aria-hidden="true"></i> Close
      </button>`;
    document.body.appendChild(modal);
  }
}

/* Only matches links in the primary sidebar nav — the "Quick Actions"
   shortcuts below them intentionally use a different class (qa-link) so
   they never get double-highlighted when they happen to point at the
   page the person is already on. */
function highlightActiveLink() {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === `./${currentPage}` || href === currentPage) {
      link.classList.add("active");
    }
  });
}

/* Every avatar slot (topbar + sidebar footer) shares the same markup via
   the .nav-avatar-target class, so both stay in sync from one update. */
function populateAvatar() {
  const raw  = localStorage.getItem("taskifyUser");
  const user = raw ? JSON.parse(raw) : null;
  if (!user) return;

  try {
    const html = avatarHtml(user.full_name || user.name || "", user.profilePhoto, { lightbox: false });

    document.querySelectorAll(".nav-avatar-target").forEach(el => {
      el.innerHTML = html;
      if (el.tagName === "A") el.setAttribute("href", myProfileUrl(user));
    });

    const profileLink = document.getElementById("sidebarProfileLink");
    if (profileLink) profileLink.setAttribute("href", myProfileUrl(user));

    const nameEl = document.getElementById("sidebarUserName");
    const roleEl = document.getElementById("sidebarUserRole");
    if (nameEl) nameEl.textContent = user.full_name || user.name || "Student";
    if (roleEl) {
      roleEl.textContent = user.role === "admin"
        ? "Admin"
        : (user.member_type === "Lecturer" ? "Lecturer" : "Student");
    }
  } catch (e) {
    console.warn("Could not parse taskifyUser:", e);
  }
}

function toggleAdminLink() {
  const adminLink = document.getElementById("navAdminLink");
  if (!adminLink) return;
  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;
    adminLink.style.display = user?.role === "admin" ? "flex" : "none";
  } catch (e) {
    adminLink.style.display = "none";
  }
}

/* ── Sidebar open/close on mobile (< 1080px, see layout-v2.css) ── */
function setupSidebarToggle() {
  const toggleBtn = document.getElementById("sidebarToggle");
  const overlay   = document.getElementById("sidebarOverlay");

  const close = () => document.body.classList.remove("sidebar-open");
  toggleBtn?.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  overlay?.addEventListener("click", close);

  document.querySelectorAll(".app-sidebar .nav-link, .app-sidebar .qa-link").forEach(link => {
    link.addEventListener("click", close);
  });
}

/* ── Sidebar footer account dropdown (Profile / Notifications / Logout) ── */
function setupUserMenuToggle() {
  const footer = document.getElementById("sidebarFooter");
  const toggle = document.getElementById("sidebarUserToggle");
  if (!footer || !toggle) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    footer.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!footer.contains(e.target)) footer.classList.remove("open");
  });
}

/* ── Topbar search — same behaviour as the old dashboard hero search:
   sends the person to the task list pre-filtered by their query. ── */
function setupTopbarSearch() {
  const input = document.getElementById("topbarSearchInput");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      window.location.href = `./tasks.html?search=${encodeURIComponent(input.value.trim())}`;
    }
  });
}

function notificationPriority(notification) {
  return notification.title === "Task Accepted" ? "high" : "normal";
}

function notificationSeenKey(notification) {
  return `taskify-notification-seen:${notification.id}`;
}

/* ── Category-aware muting ──
   Mirrors the categorization logic in notifications.js so a notification
   that's muted in Notification Preferences (saved locally on the
   Notifications page) doesn't pop up a toast or modal here either. There
   is no backend preferences endpoint — this is a local, per-browser
   setting only, and it never hides anything from the Notifications page
   itself, only these live pop-ups. */
function categorizeNotification(n) {
  if (n.context_type === "task") return "tasks";
  if (n.context_type === "equipment_booking") return "rentals";
  if (n.context_type === "sales_item") return "sales";

  const title = n.title || "";
  if (title === "New Review Received") return "reviews";
  if (title === "New Message") return "messages";
  if (/task/i.test(title)) return "tasks";
  if (/booking|rental|equipment/i.test(title)) return "rentals";
  if (/sold|sale|item/i.test(title)) return "sales";
  return "system";
}

function getNotificationPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem("taskifyNotificationPrefs") || "{}");
    return { tasks: true, rentals: true, sales: true, messages: true, reviews: true, system: true, ...stored };
  } catch {
    return { tasks: true, rentals: true, sales: true, messages: true, reviews: true, system: true };
  }
}

function isNotificationAllowed(n) {
  const prefs = getNotificationPrefs();
  const category = categorizeNotification(n);
  return prefs[category] !== false;
}

/* ── Category detection + local preference check ──
   Mirrors the same categorization used on notifications.html so a
   notification muted there doesn't still pop a toast/modal here. This
   reads a local-only preference set (no backend endpoint exists for
   notification preferences); everyone gets alerts by default. */
function categorizeNotification(n) {
  if (n.context_type === "task") return "tasks";
  if (n.context_type === "equipment_booking") return "rentals";
  if (n.context_type === "sales_item") return "sales";

  const title = n.title || "";
  if (title === "New Review Received") return "reviews";
  if (title === "New Message") return "messages";
  if (/task/i.test(title)) return "tasks";
  if (/booking|rental|equipment/i.test(title)) return "rentals";
  if (/sold|sale|item/i.test(title)) return "sales";
  return "system";
}

function isNotificationCategoryMuted(n) {
  try {
    const prefs = JSON.parse(localStorage.getItem("taskifyNotificationPrefs") || "{}");
    const category = categorizeNotification(n);
    return prefs[category] === false;
  } catch (_) {
    return false;
  }
}

function showNotificationModal(notification) {
  if (document.getElementById("priorityNotificationModal")) return;
  const overlay = document.createElement("div");
  overlay.id = "priorityNotificationModal";
  overlay.className = "priority-notification-modal";
  overlay.innerHTML = `
    <section class="priority-notification-dialog" role="alertdialog" aria-modal="true" aria-labelledby="priorityNotificationTitle">
      <div class="priority-notification-icon"><i class="ti ti-bell-ringing" aria-hidden="true"></i></div>
      <div>
        <p class="priority-notification-label">Action required</p>
        <h2 id="priorityNotificationTitle">${notification.title}</h2>
        <p>${notification.message}</p>
      </div>
      <div class="priority-notification-actions">
        <a class="primary-button" href="./notifications.html">View notification</a>
        <button type="button" class="secondary-button" data-dismiss-notification>Not now</button>
      </div>
    </section>`;
  const dismiss = () => overlay.remove();
  overlay.querySelector("[data-dismiss-notification]").addEventListener("click", dismiss);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });
  document.body.appendChild(overlay);
  overlay.querySelector("[data-dismiss-notification]").focus();
}

function updateNotificationBadge(notifications) {
  const badgeEl = document.getElementById("navNotifCount");
  if (!badgeEl) return;

  const unread = notifications.filter(n => !n.is_read);
  if (!unread.length) {
    badgeEl.style.display = "none";
    return;
  }

  const hasImportant = unread.some(n => notificationPriority(n) === "high");
  const displayCount = unread.length > 9 ? "9+" : String(unread.length);

  badgeEl.textContent = displayCount;
  badgeEl.style.display = "flex";
  badgeEl.style.background = hasImportant ? "var(--ump-red)" : "var(--ump-green)";
}

async function refreshNotifications() {
  const token = localStorage.getItem("taskifyToken");
  if (!token) return;
  try {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;
    const payload = await response.json();
    const notifications = payload.data || [];

    updateNotificationBadge(notifications);

    const unread = notifications.filter(n => !n.is_read);
    const newNotifications = unread.filter(n => !sessionStorage.getItem(notificationSeenKey(n)));
    newNotifications.forEach(n => sessionStorage.setItem(notificationSeenKey(n), "1"));
    if (!newNotifications.length) return;

    const allowedNew = newNotifications.filter(isNotificationAllowed);
    if (!allowedNew.length) return;

    const highPriority = allowedNew.find(n => notificationPriority(n) === "high");
    if (highPriority) showNotificationModal(highPriority);

    allowedNew
      .filter(n => notificationPriority(n) === "normal")
      .slice(0, 3)
      .forEach(n => showToast(n.message, "warning"));
  } catch (_) { /* progressive enhancement */ }
}

function startNotificationPolling() {
  refreshNotifications();
  window.setInterval(refreshNotifications, 30000);
}

/* ── Messages badge (sidebar link + topbar icon) ──
   There's no "unread message" flag in the schema yet, so this shows the
   total number of active conversations rather than an unread count. */
async function refreshMessagesBadge() {
  const token = localStorage.getItem("taskifyToken");
  if (!token) return;
  try {
    const res = await apiRequest("/conversations/my");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    const displayCount = count > 9 ? "9+" : String(count);

    const sideBadge = document.getElementById("navMessagesCount");
    const topBadge  = document.getElementById("navMessagesTopCount");
    [sideBadge, topBadge].forEach(el => {
      if (!el) return;
      if (count > 0) {
        el.textContent = displayCount;
        el.style.display = "flex";
      } else {
        el.style.display = "none";
      }
    });
  } catch (_) { /* non-critical */ }
}

function startMessagesBadgePolling() {
  refreshMessagesBadge();
  window.setInterval(refreshMessagesBadge, 30000);
}

function setupLogout() {
  const logoutButton = document.getElementById("logoutButton");
  if (!logoutButton) return;
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("taskifyToken");
    localStorage.removeItem("taskifyUser");
    window.location.href = "./login.html";
  });
}

loadNavbar();