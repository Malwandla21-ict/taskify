async function loadNavbar() {
  const navbarContainer = document.getElementById("navbarContainer");
  if (!navbarContainer) return;

  try {
    const response = await fetch("./components/navbar.html");
    const navbarHtml = await response.text();
    navbarContainer.innerHTML = navbarHtml;

    highlightActiveLink();
    populateAvatar();
    loadNotificationCount();
    startNotificationPolling();
    setupLogout();

  } catch (error) {
    console.error("Navbar failed to load:", error);
  }
}

/* ── Active link highlight ── */
function highlightActiveLink() {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";

  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === `./${currentPage}` || href === currentPage) {
      link.classList.add("active");
    }
  });
}

/* ── Avatar initials from stored user ── */
function populateAvatar() {
  const avatarEl    = document.getElementById("navAvatar");
  const initialsEl  = document.getElementById("navAvatarInitials");
  if (!avatarEl || !initialsEl) return;

  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;

    if (!user) return;

    /* If user has a profile photo, show it */
    if (user.profilePhoto) {
      initialsEl.style.display = "none";
      const img = document.createElement("img");
      img.src = user.profilePhoto;
      img.alt = "Profile photo";
      avatarEl.appendChild(img);
      return;
    }

    /* Otherwise build initials from firstName + lastName or name */
    const nameParts = (user.full_name || user.name || "").trim().split(/\s+/);
    const first = user.firstName || nameParts[0] || "";
    const last  = user.lastName  || nameParts[1] || "";
    const initials = (first[0] || "") + (last[0] || "");
    initialsEl.textContent = initials.toUpperCase() || "?";

  } catch (e) {
    console.warn("Could not parse taskifyUser:", e);
  }
}

/* ── Notification badge ── */
async function loadNotificationCount() {
  const badge = document.getElementById("navNotifCount");
  if (!badge) return;

  try {
    const token = localStorage.getItem("taskifyToken");
    if (!token) return;

    const res  = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const data  = await res.json();
    const count = data.count ?? data.unreadCount ?? 0;

    if (count > 0) {
      badge.textContent    = count > 99 ? "99+" : count;
      badge.style.display  = "flex";
    } else {
      badge.style.display  = "none";
    }

  } catch (e) {
    /* Silently fail — badge stays hidden */
  }
}

function notificationPriority(notification) {
  /* Task acceptance needs a decision/response and is therefore interruptive.
     Other lifecycle updates are informative and should not block the user. */
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
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });
  document.body.appendChild(overlay);
  overlay.querySelector("[data-dismiss-notification]").focus();
}

async function checkForNewNotifications() {
  const token = localStorage.getItem("taskifyToken");
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return;

    const payload = await response.json();
    const unread = (payload.data || []).filter((notification) => !notification.is_read);
    const newNotifications = unread.filter((notification) => !sessionStorage.getItem(notificationSeenKey(notification)));

    newNotifications.forEach((notification) => sessionStorage.setItem(notificationSeenKey(notification), "1"));
    if (!newNotifications.length) return;

    const highPriority = newNotifications.find((notification) => notificationPriority(notification) === "high");
    if (highPriority) showNotificationModal(highPriority);

    newNotifications
      .filter((notification) => notificationPriority(notification) === "normal")
      .slice(0, 3)
      .forEach((notification) => showToast(notification.message, "warning"));
  } catch (_) {
    /* Polling is progressive enhancement; the notification centre still works. */
  }
}

function startNotificationPolling() {
  checkForNewNotifications();
  window.setInterval(() => {
    checkForNewNotifications();
    loadNotificationCount();
  }, 30000);
}

/* ── Logout ── */
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
