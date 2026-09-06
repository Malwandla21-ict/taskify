const currentUser = requireAuth();

if (currentUser && currentUser.role !== "admin") {
  window.location.href = "./dashboard.html";
}

/* Stage 4 lockdown: an admin who hasn't enabled 2FA yet no longer gets a
   half-working panel where every section quietly 403s (the old behavior —
   see requireTwoFactor in auth.middleware.js, which still enforces this
   server-side regardless of what happens here). They're bounced straight
   to their own profile page, where profile.js/lecturer-profile.js detects
   the same condition and forces the setup flow open immediately. */
if (currentUser && currentUser.role === "admin" && !currentUser.totp_enabled) {
  window.location.href = myProfileUrl(currentUser);
}

/* ── Sidebar / quick-action navigation ── */
document.querySelectorAll("[data-section], [data-goto-section]").forEach(el => {
  const key = el.dataset.section || el.dataset.gotoSection;
  if (!key) return;
  el.addEventListener("click", () => switchSection(key));
});

function switchSection(sectionKey) {
  document.querySelectorAll(".admin-sidebar-link[data-section]").forEach(l => l.classList.remove("active"));
  document.querySelector(`.admin-sidebar-link[data-section="${sectionKey}"]`)?.classList.add("active");
  document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
  document.getElementById(`${sectionKey}Section`)?.classList.add("active");

  /* Lazy-load section data the first time it's opened, so the initial
     page load doesn't have to fetch everything up front. */
  if (sectionKey === "allowlist" && !allowlistLoaded) loadAllowlist();

  /* On mobile the sidebar is a slide-in panel — picking a section should
     close it, same as any mobile nav drawer. No-op on desktop since it's
     never open there. */
  closeAdminSidebar();
}

/* ── Mobile admin sidebar (off-canvas below 900px, see admin.css) ──
   Separate from the site's own hamburger/drawer: that one opens the
   generic site nav, this one opens the admin-only section list, so they
   use their own toggle button and body class rather than sharing state. */
const adminSidebarToggle = document.getElementById("adminSidebarToggle");
const adminSidebarScrim  = document.getElementById("adminSidebarScrim");

function openAdminSidebar() {
  document.body.classList.add("admin-sidebar-open");
  adminSidebarToggle?.setAttribute("aria-expanded", "true");
}

function closeAdminSidebar() {
  document.body.classList.remove("admin-sidebar-open");
  adminSidebarToggle?.setAttribute("aria-expanded", "false");
}

adminSidebarToggle?.addEventListener("click", openAdminSidebar);
adminSidebarScrim?.addEventListener("click", closeAdminSidebar);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAdminSidebar();
});

/* ── Shared modal elements ── */
const adminOverlay       = document.getElementById("adminOverlay");
const actionModal        = document.getElementById("adminActionModal");
const actionModalTitle   = document.getElementById("adminActionModalTitle");
const actionModalReason  = document.getElementById("adminActionModalReason");
const actionModalConfirm = document.getElementById("adminActionModalConfirm");
const actionModalCancel  = document.getElementById("adminActionModalCancel");

const userDetailModal    = document.getElementById("adminUserDetailModal");
const userDetailBody     = document.getElementById("adminUserDetailBody");
const closeUserDetailBtn = document.getElementById("closeUserDetailModal");

const messageThreadModal            = document.getElementById("adminMessageThreadModal");
const messageThreadContext          = document.getElementById("adminMessageThreadContext");
const messageThreadContainer        = document.getElementById("adminMessageThreadContainer");
const closeMessageThreadModalButton = document.getElementById("closeAdminMessageThreadModal");

let pendingAction    = null;
let cachedUsers       = [];
let cachedReports     = [];
let cachedAudit       = [];
let cachedConversations = [];
let cachedModeration  = [];
let allowlistLoaded   = false;

let usersPage      = 1;
let reportsPage    = 1;
let auditPage      = 1;
let moderationPage = 1;
const PAGE_SIZE = 8;

let userRoleFilterValue       = "All";
let reportTabValue            = "All";
let moderationTypeFilterValue = "All";

/* Mirrors CONTENT_TABLES/CONTENT_LABELS in admin.service.js — every
   content type the AI moderation pipeline can flag and this panel can
   clear/remove. */
const CONTENT_TYPE_LABELS = {
  task: "Task",
  sales_item: "Sales Listing",
  equipment: "Equipment",
  event: "Event"
};

function moderationDetailUrl(contentType, id) {
  const map = {
    task: `./task-details.html?id=${id}`,
    sales_item: `./sale-details.html?id=${id}`,
    equipment: `./equipment-details.html?id=${id}`,
    event: `./event-details.html?id=${id}`
  };
  return map[contentType] || null;
}

/* ── Modal open/close plumbing ── */
function closeAllAdminModals() {
  actionModal.style.display = "none";
  userDetailModal.style.display = "none";
  messageThreadModal.style.display = "none";
  adminOverlay.style.display = "none";
  pendingAction = null;
}

adminOverlay.addEventListener("click", closeAllAdminModals);
actionModalCancel.addEventListener("click", closeAllAdminModals);
closeUserDetailBtn.addEventListener("click", closeAllAdminModals);
closeMessageThreadModalButton?.addEventListener("click", closeAllAdminModals);

function openActionModal({ title, confirmLabel = "Confirm", onConfirm }) {
  actionModalTitle.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${title}`;
  actionModalReason.value = "";
  actionModalConfirm.textContent = confirmLabel;
  pendingAction = onConfirm;
  actionModal.style.display = "block";
  adminOverlay.style.display = "block";
}

actionModalConfirm.addEventListener("click", async () => {
  if (!pendingAction) return;
  const reason = actionModalReason.value.trim();
  const originalLabel = actionModalConfirm.innerHTML;
  actionModalConfirm.disabled = true;
  actionModalConfirm.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
  try {
    await pendingAction(reason);
    closeAllAdminModals();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    actionModalConfirm.disabled = false;
    actionModalConfirm.innerHTML = originalLabel;
  }
});

/* ── Time-ago helper for feed panels ── */
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

/* ═══════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════ */
function statCardV2(icon, colorClass, value, label) {
  return `
    <div class="admin-stat-card-v2 ${colorClass}">
      <div class="stat-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

let latestStats = null;

async function loadStats() {
  try {
    const res = await apiRequest("/admin/stats");
    latestStats = res.data;
    const s = latestStats;

    const totalTasks = Object.values(s.tasks).reduce((sum, n) => sum + n, 0);

    document.getElementById("adminStatCardsRow").innerHTML = [
      statCardV2("ti-users", "c-navy", s.users.total, "Total Users"),
      statCardV2("ti-clipboard-list", "c-blue", totalTasks, "Total Tasks"),
      statCardV2("ti-package", "c-green", s.equipment.total, "Total Equipment"),
      statCardV2("ti-currency-dollar", "c-gold", `R${Number(s.payments.released).toFixed(2)}`, "Total Earnings (Released)"),
      statCardV2("ti-flag", "c-red", s.reports.pending, "Pending Reports"),
      statCardV2("ti-shield-exclamation", "c-gold", s.moderation?.pendingReview ?? 0, "Flagged Content"),
      statCardV2("ti-user-x", "c-navy", `${s.users.suspended} / ${s.users.banned}`, "Suspended / Banned")
    ].join("");

    const pendingBadge = document.getElementById("sidebarPendingReportsCount");
    if (s.reports.pending > 0) {
      pendingBadge.textContent = s.reports.pending > 99 ? "99+" : s.reports.pending;
      pendingBadge.style.display = "flex";
    } else {
      pendingBadge.style.display = "none";
    }

    const moderationBadge = document.getElementById("sidebarModerationCount");
    const pendingModeration = s.moderation?.pendingReview ?? 0;
    if (moderationBadge) {
      if (pendingModeration > 0) {
        moderationBadge.textContent = pendingModeration > 99 ? "99+" : pendingModeration;
        moderationBadge.style.display = "flex";
      } else {
        moderationBadge.style.display = "none";
      }
    }

    const quickActionSub = document.getElementById("quickActionReportsSub");
    if (quickActionSub) {
      quickActionSub.textContent = s.reports.pending > 0
        ? `${s.reports.pending} pending report${s.reports.pending === 1 ? "" : "s"}`
        : "All caught up";
    }

    const quickActionModerationSub = document.getElementById("quickActionModerationSub");
    if (quickActionModerationSub) {
      quickActionModerationSub.textContent = pendingModeration > 0
        ? `${pendingModeration} flagged item${pendingModeration === 1 ? "" : "s"}`
        : "Nothing flagged";
    }

    renderTaskDonut(s.tasks, totalTasks);
    updateLastRefreshedLabel();
  } catch (err) {
    document.getElementById("adminStatCardsRow").innerHTML = errorState(err.message);
  }
}

function updateLastRefreshedLabel() {
  const el = document.getElementById("dashboardLastUpdated");
  if (el) el.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

document.getElementById("dashboardRefreshBtn")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.classList.add("spinning");
  btn.disabled = true;
  await Promise.all([loadStats(), loadPendingReportsPreview(), loadRecentActivityPreview(), loadModerationQueue()]);
  btn.classList.remove("spinning");
  btn.disabled = false;
  showToast("Dashboard refreshed.");
});

function renderTaskDonut(taskStatusCounts, total) {
  const container = document.getElementById("taskDonutContainer");

  const pending    = taskStatusCounts["Posted"] || 0;
  const inProgress = (taskStatusCounts["Accepted"] || 0) + (taskStatusCounts["In Progress"] || 0) + (taskStatusCounts["Awaiting Confirmation"] || 0);
  const completed  = taskStatusCounts["Completed"] || 0;
  const cancelled  = taskStatusCounts["Cancelled"] || 0;

  if (!total) {
    container.innerHTML = emptyState("ti-clipboard-list", "No tasks yet", "Task status breakdown will appear here.");
    return;
  }

  const segments = [
    { label: "Pending", value: pending, color: "var(--ump-gold)" },
    { label: "In Progress", value: inProgress, color: "var(--ump-blue)" },
    { label: "Completed", value: completed, color: "var(--ump-green)" },
    { label: "Cancelled", value: cancelled, color: "var(--ump-red)" }
  ];

  let cumulative = 0;
  const gradientStops = segments.map(seg => {
    const start = (cumulative / total) * 360;
    cumulative += seg.value;
    const end = (cumulative / total) * 360;
    return `${seg.color} ${start}deg ${end}deg`;
  }).join(", ");

  container.innerHTML = `
    <div class="admin-donut" style="background:conic-gradient(${gradientStops});">
      <div class="admin-donut-hole">
        <div class="admin-donut-total">${total}</div>
        <div class="admin-donut-total-label">Total</div>
      </div>
    </div>
    <div class="admin-donut-legend">
      ${segments.map(seg => `
        <div class="admin-donut-legend-row">
          <span class="admin-donut-dot" style="background:${seg.color};"></span>
          <span class="admin-donut-legend-label">${seg.label}</span>
          <span class="admin-donut-legend-value">${seg.value} (${total ? Math.round((seg.value / total) * 100) : 0}%)</span>
        </div>`).join("")}
    </div>`;
}

/* Pending reports preview now ships with inline quick actions
   (Resolve / Suspend / Ban) so common triage doesn't require leaving
   the dashboard at all. */
async function loadPendingReportsPreview() {
  const el = document.getElementById("pendingReportsPreview");
  try {
    const res = await apiRequest("/reports");
    const pending = res.data.filter(r => r.status === "Pending").slice(0, 4);
    el.innerHTML = pending.length
      ? pending.map(r => `
          <div class="admin-feed-item">
            <div class="admin-feed-icon red"><i class="ti ti-flag" aria-hidden="true"></i></div>
            <div class="admin-feed-body">
              <div class="admin-feed-title">${r.reason.length > 42 ? r.reason.slice(0, 42) + "…" : r.reason}</div>
              <div class="admin-feed-sub">Reported user: ${r.reported_user_name}</div>
            </div>
            <div class="admin-feed-item-right">
              <div class="admin-feed-time">${timeAgo(r.created_at)}</div>
              <div class="admin-feed-actions">
                <button type="button" class="table-icon-btn success qa-resolve-btn" data-report-id="${r.id}" title="Resolve">
                  <i class="ti ti-circle-check" aria-hidden="true"></i>
                </button>
                <button type="button" class="table-icon-btn danger qa-suspend-btn" data-user-id="${r.reported_user_id}" data-user-name="${r.reported_user_name}" title="Suspend user">
                  <i class="ti ti-player-pause" aria-hidden="true"></i>
                </button>
                <button type="button" class="table-icon-btn danger qa-ban-btn" data-user-id="${r.reported_user_id}" data-user-name="${r.reported_user_name}" title="Ban user">
                  <i class="ti ti-ban" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>`).join("")
      : `<p style="color:var(--muted);font-size:13px;">No pending reports. Nice and quiet.</p>`;
    attachPendingReportsQuickActions();
  } catch (err) {
    el.innerHTML = errorState(err.message);
  }
}

function attachPendingReportsQuickActions() {
  document.querySelectorAll(".qa-resolve-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Mark this report as resolved?")) return;
      try {
        await apiRequest(`/reports/${btn.dataset.reportId}/resolve`, "PATCH");
        showToast("Report resolved.");
        await Promise.all([loadPendingReportsPreview(), loadStats(), loadReports()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".qa-suspend-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Suspend ${btn.dataset.userName}?`,
        confirmLabel: "Suspend",
        onConfirm: async (reason) => {
          await apiRequest(`/reports/users/${btn.dataset.userId}/suspend`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been suspended.`);
          await Promise.all([loadPendingReportsPreview(), loadUsers(), loadStats(), loadReports()]);
        }
      });
    });
  });

  document.querySelectorAll(".qa-ban-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Ban ${btn.dataset.userName}?`,
        confirmLabel: "Ban",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/users/${btn.dataset.userId}/ban`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been banned.`);
          await Promise.all([loadPendingReportsPreview(), loadUsers(), loadStats(), loadReports()]);
        }
      });
    });
  });
}

function auditIconFor(action) {
  if (action.includes("ban")) return { icon: "ti-ban", cls: "red" };
  if (action.includes("suspend")) return { icon: "ti-player-pause", cls: "gold" };
  if (action.includes("refund")) return { icon: "ti-receipt-refund", cls: "gold" };
  if (action === "content.remove") return { icon: "ti-trash", cls: "red" };
  if (action === "content.clear_flag") return { icon: "ti-shield-check", cls: "" };
  if (action.includes("resolve")) return { icon: "ti-circle-check", cls: "" };
  return { icon: "ti-shield-lock", cls: "" };
}

async function loadRecentActivityPreview() {
  const el = document.getElementById("recentActivityPreview");
  try {
    const res = await apiRequest("/admin/audit-logs?limit=5");
    const logs = res.data;
    el.innerHTML = logs.length
      ? logs.map(log => {
          const { icon, cls } = auditIconFor(log.action);
          return `
            <div class="admin-feed-item">
              <div class="admin-feed-icon ${cls}"><i class="ti ${icon}" aria-hidden="true"></i></div>
              <div class="admin-feed-body">
                <div class="admin-feed-title">${log.admin_name} — ${log.action}</div>
                <div class="admin-feed-sub">${log.target_type} #${log.target_id ?? "—"}${log.reason ? ` · ${log.reason}` : ""}</div>
              </div>
              <div class="admin-feed-time">${timeAgo(log.created_at)}</div>
            </div>`;
        }).join("")
      : `<p style="color:var(--muted);font-size:13px;">No admin actions yet.</p>`;
  } catch (err) {
    el.innerHTML = errorState(err.message);
  }
}

/* ═══════════════════════════════════════════
   USERS
═══════════════════════════════════════════ */
function roleBadge(role) {
  const map = { user: badge("Student", ""), admin: badge("Admin", "navy"), suspended: badge("Suspended", "gold"), banned: badge("Banned", "red") };
  return map[role] || badge(role, "");
}

/* Compliance visibility (Stage 4) — an admin without 2FA reads as an
   urgent red "Off" (they're the highest-value target and it's supposed to
   be mandatory for them); a student/lecturer without it is just gold
   "Off" since it's opt-in for those accounts. */
function twoFactorBadge(user) {
  if (user.totp_enabled) {
    return badge(user.totp_method === "email" ? "On · Email" : "On · App", "");
  }
  return badge("Off", user.role === "admin" ? "red" : "gold");
}

async function loadUsers() {
  try {
    const res = await apiRequest("/admin/users?limit=200");
    cachedUsers = res.data;
    usersPage = 1;
    renderUsersTable();
  } catch (err) {
    document.getElementById("usersTableBody").innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
  }
}

function getFilteredUsers() {
  const q = document.getElementById("userSearchInput").value.trim().toLowerCase();
  return cachedUsers.filter(u => {
    const matchesRole = userRoleFilterValue === "All" || u.role === userRoleFilterValue;
    const matchesSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });
}

/* Quick-action icons next to the eye icon, tailored to the user's current
   role, so common moderation (suspend/ban/unsuspend/unban) is one click
   from the table without opening the detail modal. */
function quickActionButtonsFor(user) {
  const isSelf = Number(user.id) === Number(currentUser.id);
  if (isSelf) return "";

  if (user.role === "user") {
    return `
      <button type="button" class="table-icon-btn danger qa-table-suspend-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" title="Suspend">
        <i class="ti ti-player-pause" aria-hidden="true"></i>
      </button>
      <button type="button" class="table-icon-btn danger qa-table-ban-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" title="Ban">
        <i class="ti ti-ban" aria-hidden="true"></i>
      </button>`;
  }
  if (user.role === "suspended") {
    return `
      <button type="button" class="table-icon-btn success qa-table-unsuspend-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" title="Unsuspend">
        <i class="ti ti-player-play" aria-hidden="true"></i>
      </button>`;
  }
  if (user.role === "banned") {
    return `
      <button type="button" class="table-icon-btn success qa-table-unban-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" title="Unban">
        <i class="ti ti-player-play" aria-hidden="true"></i>
      </button>`;
  }
  return "";
}

function renderUsersTable() {
  const filtered = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  usersPage = Math.min(usersPage, totalPages);
  const pageItems = filtered.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);

  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = pageItems.length
    ? pageItems.map(u => `
        <tr>
          <td>
            <div class="admin-table-user-cell">
              <div class="market-avatar">${avatarHtml(u.full_name, u.profile_photo_url)}</div>
              <span class="admin-table-name profile-link" data-user-id="${u.id}">${u.full_name}${Number(u.id) === Number(currentUser.id) ? " (you)" : ""}</span>
            </div>
          </td>
          <td class="admin-table-muted">${u.email}</td>
          <td>${roleBadge(u.role)}</td>
          <td>${twoFactorBadge(u)}</td>
          <td class="admin-table-muted">${new Date(u.created_at).toLocaleDateString()}</td>
          <td>
            <div class="admin-table-actions">
              <button type="button" class="table-icon-btn view-user-detail-btn" data-user-id="${u.id}" title="View details">
                <i class="ti ti-eye" aria-hidden="true"></i>
              </button>
              ${quickActionButtonsFor(u)}
            </div>
          </td>
        </tr>`).join("")
    : `<tr><td colspan="6">${emptyState("ti-users", "No users found")}</td></tr>`;

  document.getElementById("usersTableCount").textContent =
    filtered.length ? `Showing ${(usersPage - 1) * PAGE_SIZE + 1} to ${Math.min(usersPage * PAGE_SIZE, filtered.length)} of ${filtered.length} users` : "";

  renderPagination("usersPagination", usersPage, totalPages, (p) => { usersPage = p; renderUsersTable(); });

  attachProfileLinkEvents();
  document.querySelectorAll(".view-user-detail-btn").forEach(btn => {
    btn.addEventListener("click", () => openUserDetailModal(btn.dataset.userId));
  });
  attachUsersTableQuickActions();
}

function attachUsersTableQuickActions() {
  document.querySelectorAll(".qa-table-suspend-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Suspend ${btn.dataset.userName}?`,
        confirmLabel: "Suspend",
        onConfirm: async (reason) => {
          await apiRequest(`/reports/users/${btn.dataset.userId}/suspend`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been suspended.`);
          await Promise.all([loadUsers(), loadStats()]);
        }
      });
    });
  });

  document.querySelectorAll(".qa-table-ban-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Ban ${btn.dataset.userName}?`,
        confirmLabel: "Ban",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/users/${btn.dataset.userId}/ban`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been banned.`);
          await Promise.all([loadUsers(), loadStats()]);
        }
      });
    });
  });

  document.querySelectorAll(".qa-table-unsuspend-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Unsuspend ${btn.dataset.userName}?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/unsuspend`, "PATCH");
        showToast(`${btn.dataset.userName} has been unsuspended.`);
        await Promise.all([loadUsers(), loadStats()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".qa-table-unban-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Unban ${btn.dataset.userName}?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/unban`, "PATCH");
        showToast(`${btn.dataset.userName} has been unbanned.`);
        await Promise.all([loadUsers(), loadStats()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });
}

document.getElementById("userSearchInput")?.addEventListener("input", () => { usersPage = 1; renderUsersTable(); });
document.getElementById("userRoleFilter")?.addEventListener("change", (e) => {
  userRoleFilterValue = e.target.value;
  usersPage = 1;
  renderUsersTable();
});

/* ── User moderation detail modal ── */
async function openUserDetailModal(userId) {
  userDetailBody.innerHTML = `<p style="color:var(--muted);font-size:13px;"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p>`;
  userDetailModal.style.display = "block";
  adminOverlay.style.display = "block";

  try {
    const profileRes = await apiRequest(`/users/${userId}/profile`);
    const profile = profileRes.data;
    const listUser = cachedUsers.find(u => Number(u.id) === Number(userId)) || {};

    const actions = [];
    if (listUser.role === "user") {
      actions.push({ label: "Suspend", icon: "ti-player-pause", cls: "secondary-button", handler: () => suspendFromModal(userId, listUser.full_name) });
      actions.push({ label: "Ban", icon: "ti-ban", cls: "primary-button", style: "background:var(--ump-red);", handler: () => banFromModal(userId, listUser.full_name) });
    } else if (listUser.role === "suspended") {
      actions.push({ label: "Unsuspend", icon: "ti-player-play", cls: "primary-button", handler: () => unsuspendFromModal(userId, listUser.full_name) });
      actions.push({ label: "Ban", icon: "ti-ban", cls: "secondary-button", style: "color:var(--ump-red);border-color:rgba(224,58,62,0.3);", handler: () => banFromModal(userId, listUser.full_name) });
    } else if (listUser.role === "banned") {
      actions.push({ label: "Unban", icon: "ti-player-play", cls: "primary-button", handler: () => unbanFromModal(userId, listUser.full_name) });
    } else if (listUser.role === "admin" && Number(userId) !== Number(currentUser.id)) {
      actions.push({ label: "Demote Admin", icon: "ti-shield-minus", cls: "secondary-button", style: "color:#b38900;", handler: () => demoteFromModal(userId, listUser.full_name) });
    }

    userDetailBody.innerHTML = `
      <div class="admin-user-detail-identity">
        <div class="market-avatar">${avatarHtml(profile.full_name, profile.profilePhoto)}</div>
        <div>
          <h3>${profile.full_name}</h3>
          <p>${profile.email}</p>
        </div>
      </div>
      <div class="admin-user-detail-rows">
        <div class="admin-user-detail-row"><span>User ID</span><span>USR-${String(profile.id).padStart(4, "0")}</span></div>
        <div class="admin-user-detail-row"><span>Phone</span><span>${profile.phone_number || "Not provided"}</span></div>
        <div class="admin-user-detail-row"><span>Role</span><span>${listUser.role === "user" ? "Student" : (listUser.role || "—")}</span></div>
        <div class="admin-user-detail-row"><span>Two-Factor Auth</span><span>${twoFactorBadge(listUser)}</span></div>
        <div class="admin-user-detail-row"><span>Joined On</span><span>${new Date(profile.created_at).toLocaleDateString()}</span></div>
        <div class="admin-user-detail-row"><span>Total Tasks Completed</span><span>${profile.completed_tasks}</span></div>
        <div class="admin-user-detail-row"><span>Total Listings</span><span>${profile.total_listings}</span></div>
        <div class="admin-user-detail-row"><span>Average Rating</span><span>${Number(profile.rating_average || 0).toFixed(1)} / 5</span></div>
        <div class="admin-user-detail-row"><span>Status</span><span>${listUser.role === "user" ? "Active" : (listUser.role || "—")}</span></div>
      </div>
      ${actions.length ? `<div class="admin-user-detail-actions" id="userDetailActionButtons"></div>` : ""}
    `;

    if (actions.length) {
      const actionsRow = document.getElementById("userDetailActionButtons");
      actions.forEach(a => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = a.cls;
        if (a.style) btn.setAttribute("style", a.style);
        btn.innerHTML = `<i class="ti ${a.icon}" aria-hidden="true"></i> ${a.label}`;
        btn.addEventListener("click", a.handler);
        actionsRow.appendChild(btn);
      });
    }
  } catch (err) {
    userDetailBody.innerHTML = errorState(err.message);
  }
}

function suspendFromModal(userId, name) {
  openActionModal({
    title: `Suspend ${name}?`,
    confirmLabel: "Suspend",
    onConfirm: async (reason) => {
      await apiRequest(`/reports/users/${userId}/suspend`, "PATCH", { reason });
      showToast(`${name} has been suspended.`);
      await Promise.all([loadUsers(), loadStats()]);
    }
  });
}

function banFromModal(userId, name) {
  openActionModal({
    title: `Ban ${name}?`,
    confirmLabel: "Ban",
    onConfirm: async (reason) => {
      await apiRequest(`/admin/users/${userId}/ban`, "PATCH", { reason });
      showToast(`${name} has been banned.`);
      await Promise.all([loadUsers(), loadStats()]);
    }
  });
}

async function unsuspendFromModal(userId, name) {
  if (!confirm(`Unsuspend ${name}?`)) return;
  try {
    await apiRequest(`/admin/users/${userId}/unsuspend`, "PATCH");
    showToast(`${name} has been unsuspended.`);
    closeAllAdminModals();
    await Promise.all([loadUsers(), loadStats()]);
  } catch (err) { showToast(err.message, "error"); }
}

async function unbanFromModal(userId, name) {
  if (!confirm(`Unban ${name}?`)) return;
  try {
    await apiRequest(`/admin/users/${userId}/unban`, "PATCH");
    showToast(`${name} has been unbanned.`);
    closeAllAdminModals();
    await Promise.all([loadUsers(), loadStats()]);
  } catch (err) { showToast(err.message, "error"); }
}

async function demoteFromModal(userId, name) {
  if (!confirm(`Remove admin access from ${name}?`)) return;
  try {
    await apiRequest(`/admin/users/${userId}/demote`, "PATCH");
    showToast(`${name} is no longer an admin.`);
    closeAllAdminModals();
    await Promise.all([loadUsers(), loadStats()]);
  } catch (err) { showToast(err.message, "error"); }
}

/* ═══════════════════════════════════════════
   REPORTS
═══════════════════════════════════════════ */
document.querySelectorAll(".admin-table-tab[data-report-tab]").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-table-tab[data-report-tab]").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    reportTabValue = tab.dataset.reportTab;
    reportsPage = 1;
    renderReportsTable();
  });
});

document.getElementById("reportSearchInput")?.addEventListener("input", () => { reportsPage = 1; renderReportsTable(); });

function contextDetailUrl(report) {
  if (!report.context_type || !report.context_link_id) return null;
  const map = {
    task: `./task-details.html?id=${report.context_link_id}`,
    equipment_booking: `./equipment-details.html?id=${report.context_link_id}`,
    sales_item: `./sale-details.html?id=${report.context_link_id}`,
    event: `./event-details.html?id=${report.context_link_id}`
  };
  return map[report.context_type] || null;
}

async function loadReports() {
  try {
    const res = await apiRequest("/reports");
    cachedReports = res.data;
    reportsPage = 1;
    renderReportsTable();
  } catch (err) {
    document.getElementById("reportsTableBody").innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
  }
}

function getFilteredReports() {
  const q = document.getElementById("reportSearchInput").value.trim().toLowerCase();
  return cachedReports.filter(r => {
    const matchesTab = reportTabValue === "All" || r.status === reportTabValue;
    const matchesSearch = !q ||
      r.reported_user_name.toLowerCase().includes(q) ||
      r.reporter_name.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });
}

function reportStatusBadge(status) {
  return status === "Pending" ? badge("Pending", "gold") : badge("Resolved", "");
}

function renderReportsTable() {
  const filtered = getFilteredReports();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  reportsPage = Math.min(reportsPage, totalPages);
  const pageItems = filtered.slice((reportsPage - 1) * PAGE_SIZE, reportsPage * PAGE_SIZE);

  const tbody = document.getElementById("reportsTableBody");
  tbody.innerHTML = pageItems.length
    ? pageItems.map(r => {
        const detailUrl = contextDetailUrl(r);
        const canRefund = r.context_type === "task" && r.status === "Pending";
        return `
        <tr>
          <td><span class="admin-table-name profile-link" data-user-id="${r.reported_user_id}">${r.reported_user_name}</span></td>
          <td class="admin-table-muted" style="max-width:220px;">${r.reason.length > 60 ? r.reason.slice(0, 60) + "…" : r.reason}</td>
          <td>${reportStatusBadge(r.status)}</td>
          <td><span class="admin-table-name profile-link" data-user-id="${r.reporter_id}">${r.reporter_name}</span></td>
          <td class="admin-table-muted">${new Date(r.created_at).toLocaleDateString()}</td>
          <td>
            <div class="admin-table-actions">
              ${detailUrl ? `<a href="${detailUrl}" class="table-icon-btn" title="View listing"><i class="ti ti-external-link" aria-hidden="true"></i></a>` : ""}
              ${r.status === "Pending" ? `
                <button type="button" class="table-icon-btn success resolve-report-btn" data-report-id="${r.id}" title="Resolve">
                  <i class="ti ti-circle-check" aria-hidden="true"></i>
                </button>
                <button type="button" class="table-icon-btn danger suspend-report-user-btn" data-user-id="${r.reported_user_id}" data-user-name="${r.reported_user_name}" title="Suspend user">
                  <i class="ti ti-player-pause" aria-hidden="true"></i>
                </button>
                <button type="button" class="table-icon-btn danger ban-report-user-btn" data-user-id="${r.reported_user_id}" data-user-name="${r.reported_user_name}" title="Ban user">
                  <i class="ti ti-ban" aria-hidden="true"></i>
                </button>
                ${canRefund ? `
                  <button type="button" class="table-icon-btn refund-report-task-btn" data-task-id="${r.context_id}" title="Refund task payment">
                    <i class="ti ti-receipt-refund" aria-hidden="true"></i>
                  </button>` : ""}` : ""}
            </div>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6">${emptyState("ti-flag", "No reports", "Reports filed by students will appear here.")}</td></tr>`;

  document.getElementById("reportsTableCount").textContent =
    filtered.length ? `Showing ${(reportsPage - 1) * PAGE_SIZE + 1} to ${Math.min(reportsPage * PAGE_SIZE, filtered.length)} of ${filtered.length} reports` : "";

  renderPagination("reportsPagination", reportsPage, totalPages, (p) => { reportsPage = p; renderReportsTable(); });

  attachProfileLinkEvents();
  attachReportRowEvents();
}

function attachReportRowEvents() {
  document.querySelectorAll(".resolve-report-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Mark this report as resolved?")) return;
      try {
        await apiRequest(`/reports/${btn.dataset.reportId}/resolve`, "PATCH");
        showToast("Report resolved.");
        await Promise.all([loadReports(), loadStats(), loadPendingReportsPreview()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".suspend-report-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Suspend ${btn.dataset.userName}?`,
        confirmLabel: "Suspend",
        onConfirm: async (reason) => {
          await apiRequest(`/reports/users/${btn.dataset.userId}/suspend`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been suspended.`);
          await Promise.all([loadReports(), loadUsers(), loadStats()]);
        }
      });
    });
  });

  document.querySelectorAll(".ban-report-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Ban ${btn.dataset.userName}?`,
        confirmLabel: "Ban",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/users/${btn.dataset.userId}/ban`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been banned.`);
          await Promise.all([loadReports(), loadUsers(), loadStats()]);
        }
      });
    });
  });

  document.querySelectorAll(".refund-report-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Refund payment for task #${btn.dataset.taskId}?`,
        confirmLabel: "Refund",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/tasks/${btn.dataset.taskId}/refund`, "PATCH", { reason });
          showToast("Payment refunded.");
          await loadStats();
        }
      });
    });
  });
}

/* ═══════════════════════════════════════════
   MODERATION (AI-flagged tasks/sales/equipment/events)
═══════════════════════════════════════════ */
document.getElementById("moderationSearchInput")?.addEventListener("input", () => { moderationPage = 1; renderModerationTable(); });
document.getElementById("moderationTypeFilter")?.addEventListener("change", (e) => {
  moderationTypeFilterValue = e.target.value;
  moderationPage = 1;
  renderModerationTable();
});

async function loadModerationQueue() {
  try {
    const res = await apiRequest("/admin/moderation");
    cachedModeration = res.data;
    moderationPage = 1;
    renderModerationTable();
  } catch (err) {
    document.getElementById("moderationTableBody").innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
  }
}

function getFilteredModeration() {
  const q = document.getElementById("moderationSearchInput").value.trim().toLowerCase();
  return cachedModeration.filter(item => {
    const matchesType = moderationTypeFilterValue === "All" || item.contentType === moderationTypeFilterValue;
    const matchesSearch = !q ||
      (item.title || "").toLowerCase().includes(q) ||
      (item.ownerName || "").toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });
}

function flaggedCategoriesCell(categories) {
  if (!categories || !categories.length) return `<span class="admin-table-muted">—</span>`;
  const shown = categories.slice(0, 3).map(c => `<div class="badge gold" style="margin:0 4px 4px 0;">${c}</div>`).join("");
  const rest = categories.length > 3 ? `<span class="admin-table-muted">+${categories.length - 3} more</span>` : "";
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;">${shown}${rest}</div>`;
}

function renderModerationTable() {
  const filtered = getFilteredModeration();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  moderationPage = Math.min(moderationPage, totalPages);
  const pageItems = filtered.slice((moderationPage - 1) * PAGE_SIZE, moderationPage * PAGE_SIZE);

  const tbody = document.getElementById("moderationTableBody");
  tbody.innerHTML = pageItems.length
    ? pageItems.map(item => {
        const detailUrl = moderationDetailUrl(item.contentType, item.id);
        const title = item.title || "Untitled";
        return `
        <tr>
          <td class="admin-table-name" style="max-width:220px;">${title}</td>
          <td><div class="badge blue">${CONTENT_TYPE_LABELS[item.contentType] || item.contentType}</div></td>
          <td>${item.ownerId
              ? `<span class="admin-table-name profile-link" data-user-id="${item.ownerId}">${item.ownerName || "Unknown"}</span>`
              : `<span class="admin-table-muted">—</span>`}</td>
          <td>${flaggedCategoriesCell(item.flaggedCategories)}</td>
          <td class="admin-table-muted">${new Date(item.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="admin-table-actions">
              ${detailUrl ? `<a href="${detailUrl}" class="table-icon-btn" title="View listing" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i></a>` : ""}
              <button type="button" class="table-icon-btn success clear-moderation-btn" data-content-type="${item.contentType}" data-content-id="${item.id}" data-title="${title}" title="Clear flag — keep published">
                <i class="ti ti-circle-check" aria-hidden="true"></i>
              </button>
              <button type="button" class="table-icon-btn danger remove-moderation-btn" data-content-type="${item.contentType}" data-content-id="${item.id}" data-title="${title}" title="Remove content">
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6">${emptyState("ti-shield-check", "Nothing flagged", "AI-flagged tasks, sales listings, equipment and events will appear here for review.")}</td></tr>`;

  document.getElementById("moderationTableCount").textContent =
    filtered.length ? `Showing ${(moderationPage - 1) * PAGE_SIZE + 1} to ${Math.min(moderationPage * PAGE_SIZE, filtered.length)} of ${filtered.length} flagged item${filtered.length === 1 ? "" : "s"}` : "";

  renderPagination("moderationPagination", moderationPage, totalPages, (p) => { moderationPage = p; renderModerationTable(); });

  attachProfileLinkEvents();
  attachModerationRowEvents();
}

function attachModerationRowEvents() {
  document.querySelectorAll(".clear-moderation-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Clear the AI flag on "${btn.dataset.title}"? It stays published as-is.`)) return;
      try {
        await apiRequest(`/admin/moderation/${btn.dataset.contentType}/${btn.dataset.contentId}/clear`, "PATCH");
        showToast("Flag cleared.");
        await Promise.all([loadModerationQueue(), loadStats(), loadAuditLogs()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".remove-moderation-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Remove "${btn.dataset.title}"?`,
        confirmLabel: "Remove",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/moderation/${btn.dataset.contentType}/${btn.dataset.contentId}/remove`, "PATCH", { reason });
          showToast("Content removed.");
          await Promise.all([loadModerationQueue(), loadStats(), loadAuditLogs()]);
        }
      });
    });
  });
}

/* ═══════════════════════════════════════════
   MESSAGES (conversation monitoring)
═══════════════════════════════════════════ */
const messagesListContainer = document.getElementById("adminConversationsListContainer");

function conversationCard(conv) {
  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          <div class="badge navy"><i class="ti ti-messages" aria-hidden="true"></i> ${conv.context_type}</div>
          <span style="font-size:11px;color:var(--muted);">${new Date(conv.updated_at).toLocaleString()}</span>
        </div>
        <h3 style="font-size:14px;">${conv.user_a_name} &amp; ${conv.user_b_name}</h3>
        <div class="market-tags" style="margin:8px 0 12px;">
          <div class="market-tag"><i class="ti ti-message" aria-hidden="true"></i> ${conv.message_count} message${conv.message_count === 1 ? "" : "s"}</div>
          ${conv.flagged_count > 0 ? `<div class="market-tag" style="background:rgba(224,58,62,0.10);color:var(--ump-red);"><i class="ti ti-flag" aria-hidden="true"></i> ${conv.flagged_count} flagged</div>` : ""}
        </div>
        <button class="market-action-btn outline view-thread-btn" data-conversation-id="${conv.id}">
          <i class="ti ti-eye" aria-hidden="true"></i> View Messages
        </button>
      </div>
    </div>`;
}

async function loadAdminConversations() {
  if (!messagesListContainer) return;
  try {
    const res = await apiRequest("/admin/messages");
    cachedConversations = res.data;

    const totalFlagged = cachedConversations.reduce((sum, c) => sum + (c.flagged_count || 0), 0);
    const flaggedBadge = document.getElementById("sidebarFlaggedMessagesCount");
    if (totalFlagged > 0) {
      flaggedBadge.textContent = totalFlagged > 99 ? "99+" : totalFlagged;
      flaggedBadge.style.display = "flex";
    } else {
      flaggedBadge.style.display = "none";
    }

    messagesListContainer.innerHTML = cachedConversations.length
      ? `<div class="admin-list">${cachedConversations.map(conversationCard).join("")}</div>`
      : emptyState("ti-messages", "No conversations yet", "Conversations between students will appear here.");
    attachThreadButtonEvents();
  } catch (err) {
    messagesListContainer.innerHTML = errorState(err.message);
  }
}

function messageBubble(msg) {
  return `
    <div style="border-bottom:1px solid var(--border);padding-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span class="profile-link" data-user-id="${msg.sender_id}" style="font-size:12px;font-weight:700;cursor:pointer;">${msg.sender_name}</span>
        <span style="font-size:10px;color:var(--muted);">${new Date(msg.created_at).toLocaleString()}</span>
      </div>
      <p style="font-size:13px;color:var(--text);">${msg.body}</p>
      ${msg.is_flagged ? `<div class="badge red" style="margin-top:5px;"><i class="ti ti-flag" aria-hidden="true"></i> Flagged</div>` : ""}
    </div>`;
}

function attachThreadButtonEvents() {
  document.querySelectorAll(".view-thread-btn").forEach(btn => {
    btn.addEventListener("click", () => openMessageThread(btn.dataset.conversationId));
  });
}

async function openMessageThread(conversationId) {
  messageThreadContainer.innerHTML = `<p style="color:var(--muted);font-size:13px;"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p>`;
  messageThreadContext.textContent = "";
  messageThreadModal.style.display = "block";
  adminOverlay.style.display = "block";
  try {
    const res = await apiRequest(`/admin/messages/${conversationId}/messages`);
    const messages = res.data;
    messageThreadContext.textContent = `${messages.length} message${messages.length === 1 ? "" : "s"} in this conversation`;
    messageThreadContainer.innerHTML = messages.length
      ? messages.map(messageBubble).join("")
      : `<p style="color:var(--muted);font-size:13px;">No messages in this conversation yet.</p>`;
    attachProfileLinkEvents();
  } catch (err) {
    messageThreadContainer.innerHTML = errorState(err.message);
  }
}

/* ═══════════════════════════════════════════
   AUDIT LOG
═══════════════════════════════════════════ */
async function loadAuditLogs() {
  try {
    const res = await apiRequest("/admin/audit-logs?limit=100");
    cachedAudit = res.data;
    auditPage = 1;
    renderAuditTable();
  } catch (err) {
    document.getElementById("auditTableBody").innerHTML = `<tr><td colspan="5">${errorState(err.message)}</td></tr>`;
  }
}

function renderAuditTable() {
  const totalPages = Math.max(1, Math.ceil(cachedAudit.length / PAGE_SIZE));
  auditPage = Math.min(auditPage, totalPages);
  const pageItems = cachedAudit.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  const tbody = document.getElementById("auditTableBody");
  tbody.innerHTML = pageItems.length
    ? pageItems.map(log => `
        <tr>
          <td><span class="admin-table-name profile-link" data-user-id="${log.admin_id}">${log.admin_name}</span></td>
          <td><div class="badge navy">${log.action}</div></td>
          <td class="admin-table-muted">${log.target_type} #${log.target_id ?? "—"}</td>
          <td class="admin-table-muted">${log.reason || "—"}</td>
          <td class="admin-table-muted">${new Date(log.created_at).toLocaleString()}</td>
        </tr>`).join("")
    : `<tr><td colspan="5">${emptyState("ti-history", "No admin actions yet")}</td></tr>`;

  document.getElementById("auditTableCount").textContent =
    cachedAudit.length ? `Showing ${(auditPage - 1) * PAGE_SIZE + 1} to ${Math.min(auditPage * PAGE_SIZE, cachedAudit.length)} of ${cachedAudit.length} entries` : "";

  renderPagination("auditPagination", auditPage, totalPages, (p) => { auditPage = p; renderAuditTable(); });
  attachProfileLinkEvents();
}

/* ═══════════════════════════════════════════
   ADMIN ALLOW-LIST (now inline — no page navigation)
═══════════════════════════════════════════ */
function allowlistEntryCard(entry) {
  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          <div class="badge blue"><i class="ti ti-mail" aria-hidden="true"></i> ${entry.email}</div>
        </div>
        <p style="color:var(--muted);font-size:13px;margin:8px 0 4px;">${entry.note || "No note provided."}</p>
        <div class="market-tags" style="margin-top:10px;">
          <div class="market-tag"><i class="ti ti-terminal" aria-hidden="true"></i> Added via server script</div>
          <div class="market-tag"><i class="ti ti-calendar" aria-hidden="true"></i> ${new Date(entry.created_at).toLocaleDateString()}</div>
        </div>
      </div>
    </div>`;
}

async function loadAllowlist() {
  const container = document.getElementById("allowlistContainer");
  try {
    const res = await apiRequest("/admin/allowlist");
    allowlistLoaded = true;
    container.innerHTML = res.data.length
      ? res.data.map(allowlistEntryCard).join("")
      : emptyState("ti-shield-lock", "No entries yet", "Allow-list entries are added via the server-side management script.");
  } catch (err) {
    container.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ═══════════════════════════════════════════
   SHARED PAGINATION RENDERER
═══════════════════════════════════════════ */
function renderPagination(containerId, current, totalPages, onPage) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (totalPages <= 1) { el.innerHTML = ""; return; }

  const buttons = [];
  buttons.push(`<button type="button" class="admin-page-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>`);

  const maxShown = 5;
  let start = Math.max(1, current - Math.floor(maxShown / 2));
  let end = Math.min(totalPages, start + maxShown - 1);
  start = Math.max(1, end - maxShown + 1);

  for (let p = start; p <= end; p++) {
    buttons.push(`<button type="button" class="admin-page-btn ${p === current ? "active" : ""}" data-page="${p}">${p}</button>`);
  }

  buttons.push(`<button type="button" class="admin-page-btn" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>`);

  el.innerHTML = buttons.join("");
  el.querySelectorAll(".admin-page-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = Number(btn.dataset.page);
      if (page >= 1 && page <= totalPages) onPage(page);
    });
  });
}

/* ── Init ── */
loadStats();
loadPendingReportsPreview();
loadRecentActivityPreview();
loadUsers();
loadReports();
loadModerationQueue();
loadAdminConversations();
loadAuditLogs();