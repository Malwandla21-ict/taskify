async function loadNavbar() {
  const navbarContainer = document.getElementById("navbarContainer");
  if (!navbarContainer) return;

  try {
    const response = await fetch("./components/navbar.html");
    const navbarHtml = await response.text();
    navbarContainer.innerHTML = navbarHtml;

    highlightActiveLink();
    populateAvatar();
    applyAdminVisibility();
    loadNotificationCount();
    startNotificationPolling();
    setupLogout();
    initActivityTracker();

  } catch (error) {
    console.error("Navbar failed to load:", error);
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

    const name = user.full_name || user.name || "";
    avatarEl.innerHTML = avatarHtml(user.profilePhoto, name);
  } catch (e) {
    console.warn("Could not parse taskifyUser:", e);
  }
}

function applyAdminVisibility() {
  const adminLink = document.getElementById("adminNavLink");
  if (!adminLink) return;

  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;
    if (user && user.role === "admin") {
      adminLink.style.display = "flex";
    }
  } catch (_) { /* leave hidden */ }
}

async function loadNotificationCount() {
  const badgeEl = document.getElementById("navNotifCount");
  if (!badgeEl) return;

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
      badgeEl.textContent    = count > 99 ? "99+" : count;
      badgeEl.style.display  = "flex";
    } else {
      badgeEl.style.display  = "none";
    }

  } catch (e) {
    /* Silently fail — badge stays hidden */
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

function setupLogout() {
  const logoutButton = document.getElementById("logoutButton");
  if (!logoutButton) return;

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("taskifyToken");
    localStorage.removeItem("taskifyUser");
    window.location.href = "./login.html";
  });
}

/* ─────────────────────────────────────────
   ACTIVITY TRACKER — floating "what's in progress" widget.
   Items that need a decision now render inline Confirm/Decline (bookings)
   or Confirm Completion (tasks) buttons, so acting doesn't require
   leaving the current page — this is the second place (besides
   notifications) the owner can act from, per the request.
───────────────────────────────────────── */
function initActivityTracker() {
  if (!localStorage.getItem("taskifyToken")) return;
  if (document.getElementById("activityTrackerFab")) return;

  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "activityTrackerFab";
  fab.className = "activity-tracker-fab";
  fab.setAttribute("aria-label", "Track my active tasks and rentals");
  fab.innerHTML = `
    <i class="ti ti-list-check" aria-hidden="true"></i>
    <span class="activity-tracker-badge" id="activityTrackerBadge" style="display:none;">0</span>`;

  const panel = document.createElement("div");
  panel.id = "activityTrackerPanel";
  panel.className = "activity-tracker-panel";
  panel.innerHTML = `
    <div class="activity-tracker-header">
      <span><i class="ti ti-bolt" aria-hidden="true"></i> In Progress</span>
      <button type="button" id="activityTrackerClose" aria-label="Close">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
    <div class="activity-tracker-body" id="activityTrackerBody">
      <p class="activity-tracker-empty">Loading…</p>
    </div>`;

  document.body.appendChild(panel);
  document.body.appendChild(fab);

  fab.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) loadActivityTracker();
  });

  panel.querySelector("#activityTrackerClose").addEventListener("click", () => {
    panel.classList.remove("open");
  });

  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target) && !fab.contains(event.target)) {
      panel.classList.remove("open");
    }
  });

  loadActivityTracker();
  window.setInterval(loadActivityTracker, 30000);
}

function activityTaskLabel(task, userId) {
  const isOwn    = Number(task.created_by)  === Number(userId);
  const isWorker = Number(task.accepted_by) === Number(userId);

  if (task.status === "Accepted") {
    return isWorker ? "You accepted this — start when ready" : "Waiting for the worker to start";
  }
  if (task.status === "In Progress") {
    return isWorker ? "You're working on this" : "Worker is in progress";
  }
  if (task.status === "Awaiting Confirmation") {
    return isOwn ? "Confirm to release payment" : "Waiting for owner to confirm";
  }
  return task.status;
}

function activityBookingLabel(booking, userId) {
  const isOwner  = Number(booking.owner_id)  === Number(userId);
  const isRenter = Number(booking.renter_id) === Number(userId);

  if (booking.status === "Pending") {
    return isOwner ? "Confirm or decline this request" : "Waiting for owner to confirm";
  }
  if (booking.status === "Confirmed") {
    return isOwner ? "Rented out — confirm return when it comes back" : "You're renting this — return when done";
  }
  return booking.status;
}

async function loadActivityTracker() {
  const body    = document.getElementById("activityTrackerBody");
  const badgeEl = document.getElementById("activityTrackerBadge");
  if (!body) return;

  const token = localStorage.getItem("taskifyToken");
  if (!token) return;

  try {
    const raw  = localStorage.getItem("taskifyUser");
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return;

    const authHeaders = { Authorization: `Bearer ${token}` };

    const [taskRes, equipRes] = await Promise.all([
      fetch(`${API_BASE_URL}/tasks/history`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${API_BASE_URL}/equipment/history`, { headers: authHeaders }).then(r => r.json())
    ]);

    const activeTasks = (taskRes.data || []).filter(t =>
      ["Accepted", "In Progress", "Awaiting Confirmation"].includes(t.status)
    );
    const activeBookings = (equipRes.data || []).filter(b =>
      ["Pending", "Confirmed"].includes(b.status)
    );

    const total = activeTasks.length + activeBookings.length;

    if (badgeEl) {
      if (total > 0) {
        badgeEl.textContent   = total > 9 ? "9+" : total;
        badgeEl.style.display = "flex";
      } else {
        badgeEl.style.display = "none";
      }
    }

    if (!total) {
      body.innerHTML = `<p class="activity-tracker-empty">Nothing in progress right now.</p>`;
      return;
    }

    const taskItems = activeTasks.map(t => {
      const isOwn = Number(t.created_by) === Number(user.id);
      const inlineAction = (isOwn && t.status === "Awaiting Confirmation")
        ? `<button class="market-action-btn confirm-tracker-task-btn" data-task-id="${t.id}" style="margin-top:6px;width:100%;background:var(--ump-green);">
             <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion
           </button>`
        : "";
      return `
        <div class="activity-tracker-item-wrapper">
          <a class="activity-tracker-item" href="./task-details.html?id=${t.id}">
            <div class="activity-tracker-item-icon"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>
            <div class="activity-tracker-item-body">
              <div class="activity-tracker-item-title">${t.title}</div>
              <div class="activity-tracker-item-sub">${activityTaskLabel(t, user.id)}</div>
            </div>
            ${typeof statusBadge === "function" ? statusBadge(t.status) : ""}
          </a>
          ${inlineAction}
        </div>`;
    }).join("");

    const bookingItems = activeBookings.map(b => {
      const isOwner = Number(b.owner_id) === Number(user.id);
      const inlineAction = (isOwner && b.status === "Pending")
        ? `<div style="display:flex;gap:6px;margin-top:6px;">
             <button class="market-action-btn confirm-tracker-booking-btn" data-booking-id="${b.id}" style="flex:1;background:var(--ump-green);">
               <i class="ti ti-check" aria-hidden="true"></i> Confirm
             </button>
             <button class="market-action-btn outline decline-tracker-booking-btn" data-booking-id="${b.id}" style="flex:1;background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
               <i class="ti ti-x" aria-hidden="true"></i> Decline
             </button>
           </div>`
        : "";
      return `
        <div class="activity-tracker-item-wrapper">
          <a class="activity-tracker-item" href="./equipment-details.html?id=${b.equipment_id}">
            <div class="activity-tracker-item-icon"><i class="ti ti-package" aria-hidden="true"></i></div>
            <div class="activity-tracker-item-body">
              <div class="activity-tracker-item-title">${b.equipment_name}</div>
              <div class="activity-tracker-item-sub">${activityBookingLabel(b, user.id)}</div>
            </div>
            ${typeof statusBadge === "function" ? statusBadge(b.status) : ""}
          </a>
          ${inlineAction}
        </div>`;
    }).join("");

    body.innerHTML = taskItems + bookingItems;
    attachActivityTrackerActionEvents();
  } catch (_) {
    /* Non-critical widget; fail silently. */
  }
}

function attachActivityTrackerActionEvents() {
  document.querySelectorAll(".confirm-tracker-task-btn").forEach(btn => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!confirm("Confirm this task is complete? This will release payment to the worker.")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/confirm-completion`, "PATCH");
        showToast("Task completed and payment released!");
        await loadActivityTracker();
      } catch (err) {
        showToast(err.message, "error");
        await loadActivityTracker();
      }
    });
  });

  document.querySelectorAll(".confirm-tracker-booking-btn").forEach(btn => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/confirm`, "PATCH");
        showToast("Booking confirmed!");
        await loadActivityTracker();
      } catch (err) {
        showToast(err.message, "error");
        await loadActivityTracker();
      }
    });
  });

  document.querySelectorAll(".decline-tracker-booking-btn").forEach(btn => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/decline`, "PATCH");
        showToast("Booking declined.");
        await loadActivityTracker();
      } catch (err) {
        showToast(err.message, "error");
        await loadActivityTracker();
      }
    });
  });
}

loadNavbar();