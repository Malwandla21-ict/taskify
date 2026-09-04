const currentUser = requireAuth();

const notificationsListContainer = document.getElementById("notificationsListContainer");
const loadOlderButton = document.getElementById("loadOlderButton");

const PAGE_SIZE = 8;
let cachedNotifications = [];
let activeFilter = "all";
let visibleCount = PAGE_SIZE;

/* ── Categorization ──
   The backend doesn't tag every notification with a context_type (e.g.
   "New Message" and "New Review Received" are created without one), so
   we fall back to matching on the title for those. This mirrors exactly
   what the notification services actually create — see task.service.js,
   equipment.service.js, sales.service.js, conversation.service.js and
   review.service.js. */
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

const CATEGORY_META = {
  tasks:    { icon: "ti-clipboard-list",  color: "green" },
  rentals:  { icon: "ti-package",         color: "blue" },
  sales:    { icon: "ti-shopping-bag",    color: "red" },
  reviews:  { icon: "ti-star",            color: "gold" },
  messages: { icon: "ti-message-circle",  color: "purple" },
  system:   { icon: "ti-shield-check",    color: "navy" }
};

/* ── Local-only notification preferences ──
   There is no backend endpoint for notification preferences, so this is
   saved to this browser only. It controls whether a pop-up toast fires
   for new notifications in navbar.js — it does not hide anything from
   this page or change what's stored on the account. */
const PREFS_KEY = "taskifyNotificationPrefs";
function getNotificationPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return { tasks: true, rentals: true, sales: true, messages: true, reviews: true, system: true, ...stored };
  } catch {
    return { tasks: true, rentals: true, sales: true, messages: true, reviews: true, system: true };
  }
}
function saveNotificationPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function initPreferenceToggles() {
  const prefs = getNotificationPrefs();
  const map = {
    prefTasks: "tasks", prefRentals: "rentals", prefSales: "sales",
    prefMessages: "messages", prefReviews: "reviews", prefSystem: "system"
  };
  Object.entries(map).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.checked = prefs[key] !== false;
    el.addEventListener("change", () => {
      const current = getNotificationPrefs();
      current[key] = el.checked;
      saveNotificationPrefs(current);
      showToast(el.checked ? "Pop-up alerts enabled for this category." : "Pop-up alerts muted for this category.");
    });
  });
}

document.getElementById("openPrefsButton")?.addEventListener("click", () => {
  document.getElementById("notifPrefsCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

function timeLabel(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabelFor(dateStr) {
  const d = new Date(dateStr);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  if (dayStart.getTime() === today.getTime()) return "Today";
  if (dayStart.getTime() === yesterday.getTime()) return "Yesterday";
  return dayStart.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

/* ── Quick actions per notification ──
   Confirm/Decline and Confirm Completion trigger real API calls (same
   as the original page). The rest are honest navigation links: "View
   Messages" and "View Profile" go to the closest real destination since
   the backend doesn't store enough detail to deep-link to the exact
   conversation or review. */
function notificationQuickActions(n) {
  if (n.context_type === "equipment_booking" && n.title === "Booking Request") {
    return `
      <div class="notif-quick-actions">
        <button class="notif-quick-action-link confirm-notif-booking-btn" data-booking-id="${n.context_id}" data-notif-id="${n.id}">
          <i class="ti ti-check" aria-hidden="true"></i> Confirm
        </button>
        <button class="notif-quick-action-link red decline-notif-booking-btn" data-booking-id="${n.context_id}" data-notif-id="${n.id}">
          <i class="ti ti-x" aria-hidden="true"></i> Decline
        </button>
      </div>`;
  }
  if (n.context_type === "task" && n.title === "Task Marked as Done") {
    return `
      <div class="notif-quick-actions">
        <button class="notif-quick-action-link confirm-notif-task-btn" data-task-id="${n.context_id}" data-notif-id="${n.id}">
          <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion
        </button>
      </div>`;
  }
  if (n.context_type === "task") {
    return `<div class="notif-quick-actions"><a class="notif-quick-action-link" href="./task-details.html?id=${n.context_id}"><i class="ti ti-eye" aria-hidden="true"></i> View Task</a></div>`;
  }
  if (n.context_type === "sales_item") {
    return `<div class="notif-quick-actions"><a class="notif-quick-action-link red" href="./sale-details.html?id=${n.context_id}"><i class="ti ti-eye" aria-hidden="true"></i> View Item</a></div>`;
  }
  if (n.title === "New Message") {
    return `<div class="notif-quick-actions"><a class="notif-quick-action-link purple" href="./messages.html"><i class="ti ti-message-circle" aria-hidden="true"></i> View Messages</a></div>`;
  }
  if (n.title === "New Review Received") {
    return `<div class="notif-quick-actions"><a class="notif-quick-action-link gold" href="./profile.html"><i class="ti ti-user" aria-hidden="true"></i> View Profile</a></div>`;
  }
  return "";
}

function notificationItem(n) {
  const category = categorizeNotification(n);
  const meta = CATEGORY_META[category];

  return `
    <div class="notif-list-item ${n.is_read ? "" : "unread"}" data-notif-id="${n.id}">
      <div class="notif-icon-circle ${meta.color}"><i class="ti ${meta.icon}" aria-hidden="true"></i></div>
      <div class="notif-body">
        <div class="notif-top-row">
          <div>
            <div class="notif-title">${n.title}</div>
            <div class="notif-message">${n.message}</div>
          </div>
          <div class="notif-time">
            <span class="notif-time-dot ${n.is_read ? "gray" : ""}"></span>
            ${timeLabel(n.created_at)}
          </div>
        </div>
        ${notificationQuickActions(n)}
        ${!n.is_read ? `
          <div class="notif-quick-actions">
            <button class="notif-quick-action-link mark-read-btn" data-id="${n.id}" style="background:var(--background);color:var(--muted);">
              <i class="ti ti-check" aria-hidden="true"></i> Mark as Read
            </button>
          </div>` : ""}
      </div>
    </div>`;
}

function getFilteredNotifications() {
  if (activeFilter === "all") return cachedNotifications;
  if (activeFilter === "unread") return cachedNotifications.filter(n => !n.is_read);
  return cachedNotifications.filter(n => categorizeNotification(n) === activeFilter);
}

function renderCounts() {
  document.getElementById("countAll").textContent = cachedNotifications.length;
  document.getElementById("countUnread").textContent = cachedNotifications.filter(n => !n.is_read).length;
}

function renderSummary() {
  document.getElementById("summaryTotal").textContent = cachedNotifications.length;
  document.getElementById("summaryUnread").textContent = cachedNotifications.filter(n => !n.is_read).length;
  document.getElementById("summaryMessages").textContent = cachedNotifications.filter(n => categorizeNotification(n) === "messages").length;
  document.getElementById("summaryReviews").textContent = cachedNotifications.filter(n => categorizeNotification(n) === "reviews").length;
}

function renderNotifications() {
  const filtered = getFilteredNotifications();

  if (!filtered.length) {
    notificationsListContainer.innerHTML = emptyState("ti-bell", "No notifications here", "You're all caught up in this category.");
    loadOlderButton.style.display = "none";
    return;
  }

  const visible = filtered.slice(0, visibleCount);
  const groups = new Map();
  visible.forEach(n => {
    const label = dayLabelFor(n.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(n);
  });

  let html = "";
  for (const [label, items] of groups) {
    html += `<div class="notif-day-label">${label}</div>`;
    html += items.map(notificationItem).join("");
  }
  notificationsListContainer.innerHTML = html;

  loadOlderButton.style.display = filtered.length > visibleCount ? "inline-flex" : "none";

  attachNotificationEvents();
}

function attachNotificationEvents() {
  document.querySelectorAll(".mark-read-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/notifications/${btn.dataset.id}/read`, "PATCH");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Mark as Read`;
      }
    });
  });

  document.querySelectorAll(".confirm-notif-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/confirm`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Booking confirmed!");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Confirm`;
      }
    });
  });

  document.querySelectorAll(".decline-notif-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/decline`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Booking declined.");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Decline`;
      }
    });
  });

  document.querySelectorAll(".confirm-notif-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirm this task is complete? This will release payment to the worker.")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/confirm-completion`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Task completed and payment released!");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion`;
      }
    });
  });
}

document.querySelectorAll("#notifTabsRow .filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#notifTabsRow .filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    visibleCount = PAGE_SIZE;
    renderNotifications();
  });
});

loadOlderButton?.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderNotifications();
});

/* "Mark all as read" — there's no bulk endpoint, so this fires the same
   PATCH the single mark-as-read button uses, once per unread item. */
document.getElementById("markAllReadButton")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const unread = cachedNotifications.filter(n => !n.is_read);
  if (!unread.length) { showToast("Nothing to mark — you're all caught up."); return; }

  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Marking…`;
  try {
    await Promise.all(unread.map(n => apiRequest(`/notifications/${n.id}/read`, "PATCH")));
    showToast("All notifications marked as read.");
    await loadNotifications();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

async function loadNotifications() {
  try {
    const res = await apiRequest("/notifications");
    cachedNotifications = res.data;
    renderCounts();
    renderSummary();
    renderNotifications();
  } catch (err) {
    notificationsListContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

initPreferenceToggles();
loadNotifications();