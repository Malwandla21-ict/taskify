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
    startNotificationPolling();
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

function highlightActiveLink() {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === `./${currentPage}` || href === currentPage) {
      link.classList.add("active");
    }
  });
}

function populateAvatar() {
  const avatarEl = document.getElementById("navAvatar");
  if (!avatarEl) return;
  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return;
    avatarEl.innerHTML = avatarHtml(user.full_name || user.name || "", user.profilePhoto, { lightbox: false });
    /* Route the avatar to the right "my profile" page for this account's
       identity — students/staff go to profile.html, lecturers go to
       lecturer-profile.html. */
    avatarEl.setAttribute("href", myProfileUrl(user));
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

function notificationPriority(notification) {
  return notification.title === "Task Accepted" ? "high" : "normal";
}

function notificationSeenKey(notification) {
  return `taskify-notification-seen:${notification.id}`;
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
  badgeEl.style.fontSize = displayCount.length > 1 ? "8px" : "9px";
  badgeEl.style.minWidth = "17px";
  badgeEl.style.width = "auto";
  badgeEl.style.padding = "0 3px";
  badgeEl.title = hasImportant ? "You have important unread notifications" : "You have unread notifications";
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

    const highPriority = newNotifications.find(n => notificationPriority(n) === "high");
    if (highPriority) showNotificationModal(highPriority);

    newNotifications
      .filter(n => notificationPriority(n) === "normal")
      .slice(0, 3)
      .forEach(n => showToast(n.message, "warning"));
  } catch (_) { /* progressive enhancement */ }
}

function startNotificationPolling() {
  refreshNotifications();
  window.setInterval(refreshNotifications, 30000);
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