const currentUser = requireAuth();

if (currentUser && currentUser.role !== "admin") {
  window.location.href = "./dashboard.html";
}

const adminStatsGrid       = document.getElementById("adminStatsGrid");
const reportsListContainer = document.getElementById("reportsListContainer");
const usersListContainer   = document.getElementById("usersListContainer");
const auditListContainer   = document.getElementById("auditListContainer");
const userSearchInput      = document.getElementById("userSearchInput");

const adminOverlay           = document.getElementById("adminOverlay");
const actionModal            = document.getElementById("adminActionModal");
const actionModalTitle       = document.getElementById("adminActionModalTitle");
const actionModalReason      = document.getElementById("adminActionModalReason");
const actionModalConfirm     = document.getElementById("adminActionModalConfirm");
const actionModalCancel      = document.getElementById("adminActionModalCancel");

let cachedUsers = [];
let pendingAction = null;

/* ── Tabs ── */
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".admin-tab-panel").forEach(p => p.style.display = "none");
    document.getElementById(`${tab.dataset.tab}Tab`).style.display = "block";
  });
});

/* ── Generic reason-confirmation modal ── */
function openActionModal({ title, confirmLabel = "Confirm", onConfirm }) {
  actionModalTitle.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ${title}`;
  actionModalReason.value = "";
  actionModalConfirm.textContent = confirmLabel;
  pendingAction = onConfirm;
  actionModal.style.display = "block";
  adminOverlay.style.display = "block";
}

function closeActionModal() {
  actionModal.style.display = "none";
  adminOverlay.style.display = "none";
  pendingAction = null;
}

actionModalCancel.addEventListener("click", closeActionModal);
adminOverlay.addEventListener("click", closeActionModal);

actionModalConfirm.addEventListener("click", async () => {
  if (!pendingAction) return;
  const reason = actionModalReason.value.trim();
  const originalLabel = actionModalConfirm.innerHTML;
  actionModalConfirm.disabled = true;
  actionModalConfirm.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
  try {
    await pendingAction(reason);
    closeActionModal();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    actionModalConfirm.disabled = false;
    actionModalConfirm.innerHTML = originalLabel;
  }
});

/* ── Stats ── */
function statCard(icon, label, value, colorClass = "") {
  return `
    <div class="admin-stat-card ${colorClass}">
      <div class="admin-stat-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
      <div>
        <div class="admin-stat-value">${value}</div>
        <div class="admin-stat-label">${label}</div>
      </div>
    </div>`;
}

async function loadStats() {
  try {
    const res = await apiRequest("/admin/stats");
    const s = res.data;

    const activeTasks = (s.tasks["Accepted"] || 0) + (s.tasks["In Progress"] || 0) + (s.tasks["Awaiting Confirmation"] || 0);

    adminStatsGrid.innerHTML = [
      statCard("ti-users", "Total Users", s.users.total),
      statCard("ti-flag", "Pending Reports", s.reports.pending, s.reports.pending > 0 ? "warn" : ""),
      statCard("ti-clipboard-list", "Active Tasks", activeTasks),
      statCard("ti-lock", "Payments Held", `R${Number(s.payments.held).toFixed(2)}`),
      statCard("ti-user-x", "Suspended / Banned", `${s.users.suspended} / ${s.users.banned}`)
    ].join("");
  } catch (err) {
    adminStatsGrid.innerHTML = errorState(err.message);
  }
}

/* ── Reports tab ── */
function reportStatusBadge(status) {
  return status === "Pending" ? badge("Pending", "gold") : badge("Resolved", "");
}

function contextDetailUrl(report) {
  if (!report.context_type || !report.context_link_id) return null;
  const map = {
    task: `./task-details.html?id=${report.context_link_id}`,
    equipment_booking: `./equipment-details.html?id=${report.context_link_id}`,
    sales_item: `./sale-details.html?id=${report.context_link_id}`
  };
  return map[report.context_type] || null;
}

function contextIcon(contextType) {
  return { task: "ti-clipboard-list", equipment_booking: "ti-package", sales_item: "ti-shopping-bag" }[contextType] || "ti-link";
}

function reportCard(report) {
  const isPending = report.status === "Pending";
  const detailUrl = contextDetailUrl(report);
  const canRefund = report.context_type === "task";

  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          ${reportStatusBadge(report.status)}
          <span style="font-size:11px;color:var(--muted);">${new Date(report.created_at).toLocaleString()}</span>
        </div>
        <h3 style="font-size:15px;">${report.reporter_name} reported ${report.reported_user_name}</h3>
        <p style="color:var(--muted);font-size:13px;margin:8px 0 12px;">${report.reason}</p>
        ${report.context_title ? `
          <a href="${detailUrl || "#"}" ${detailUrl ? "" : "tabindex='-1'"} class="market-tag" style="margin-bottom:12px;text-decoration:none;">
            <i class="ti ${contextIcon(report.context_type)}" aria-hidden="true"></i> ${report.context_title}
          </a>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="market-action-btn outline view-profile-btn" data-user-id="${report.reported_user_id}" data-user-name="${report.reported_user_name}">
            <i class="ti ti-user" aria-hidden="true"></i> View Profile
          </button>
          ${isPending ? `
            <button class="market-action-btn resolve-report-btn" data-report-id="${report.id}">
              <i class="ti ti-circle-check" aria-hidden="true"></i> Resolve
            </button>
            <button class="market-action-btn outline suspend-user-btn" data-user-id="${report.reported_user_id}" data-user-name="${report.reported_user_name}">
              <i class="ti ti-player-pause" aria-hidden="true"></i> Suspend
            </button>
            <button class="market-action-btn outline ban-user-btn" data-user-id="${report.reported_user_id}" data-user-name="${report.reported_user_name}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
              <i class="ti ti-ban" aria-hidden="true"></i> Ban
            </button>
            ${canRefund ? `
              <button class="market-action-btn outline refund-task-btn" data-task-id="${report.context_id}">
                <i class="ti ti-receipt-refund" aria-hidden="true"></i> Refund
              </button>` : ""}` : ""}
        </div>
      </div>
    </div>`;
}

async function loadReports() {
  try {
    const res = await apiRequest("/reports");
    const reports = res.data;
    reportsListContainer.innerHTML = reports.length
      ? reports.map(reportCard).join("")
      : emptyState("ti-flag", "No reports", "Reports filed by students will appear here.");
    attachReportActionEvents();
  } catch (err) {
    reportsListContainer.innerHTML = errorState(err.message);
  }
}

function attachReportActionEvents() {
  document.querySelectorAll(".view-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => openUserProfileModal(btn.dataset.userId, btn.dataset.userName));
  });

  document.querySelectorAll(".resolve-report-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Mark this report as resolved?")) return;
      try {
        await apiRequest(`/reports/${btn.dataset.reportId}/resolve`, "PATCH");
        showToast("Report resolved.");
        await loadReports();
        await loadStats();
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".suspend-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Suspend ${btn.dataset.userName}?`,
        confirmLabel: "Suspend",
        onConfirm: async (reason) => {
          await apiRequest(`/reports/users/${btn.dataset.userId}/suspend`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been suspended.`);
          await loadReports();
          await loadUsers();
          await loadStats();
        }
      });
    });
  });

  document.querySelectorAll(".ban-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Ban ${btn.dataset.userName}?`,
        confirmLabel: "Ban",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/users/${btn.dataset.userId}/ban`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been banned.`);
          await loadReports();
          await loadUsers();
          await loadStats();
        }
      });
    });
  });

  document.querySelectorAll(".refund-task-btn").forEach(btn => {
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

/* ── Users tab ── */
function roleBadge(role) {
  const map = { user: badge("User", ""), admin: badge("Admin", "navy"), suspended: badge("Suspended", "gold"), banned: badge("Banned", "red") };
  return map[role] || badge(role, "");
}

function userCard(user) {
  const buttons = [];
  const isSelf = Number(user.id) === Number(currentUser.id);

  if (user.role === "user") {
    buttons.push(`<button class="market-action-btn outline promote-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}"><i class="ti ti-shield-plus" aria-hidden="true"></i> Promote</button>`);
    buttons.push(`<button class="market-action-btn outline suspend-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}"><i class="ti ti-player-pause" aria-hidden="true"></i> Suspend</button>`);
    buttons.push(`<button class="market-action-btn outline ban-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);"><i class="ti ti-ban" aria-hidden="true"></i> Ban</button>`);
  } else if (user.role === "suspended") {
    buttons.push(`<button class="market-action-btn unsuspend-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}"><i class="ti ti-player-play" aria-hidden="true"></i> Unsuspend</button>`);
    buttons.push(`<button class="market-action-btn outline ban-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);"><i class="ti ti-ban" aria-hidden="true"></i> Ban</button>`);
  } else if (user.role === "banned") {
    buttons.push(`<button class="market-action-btn unban-user-btn" data-user-id="${user.id}" data-user-name="${user.full_name}"><i class="ti ti-player-play" aria-hidden="true"></i> Unban</button>`);
  } else if (user.role === "admin" && !isSelf) {
    buttons.push(`<button class="market-action-btn outline demote-admin-btn" data-user-id="${user.id}" data-user-name="${user.full_name}" style="background:rgba(245,180,0,0.10);color:#b38900;border-color:rgba(245,180,0,0.30);"><i class="ti ti-shield-minus" aria-hidden="true"></i> Demote</button>`);
  }

  buttons.unshift(`<button class="market-action-btn outline view-profile-btn" data-user-id="${user.id}" data-user-name="${user.full_name}"><i class="ti ti-user" aria-hidden="true"></i> Profile</button>`);

  const reasonLine = user.role === "suspended" && user.suspension_reason
    ? `<p style="font-size:12px;color:var(--muted);margin-top:6px;">Reason: ${user.suspension_reason}</p>`
    : user.role === "banned" && user.ban_reason
      ? `<p style="font-size:12px;color:var(--muted);margin-top:6px;">Reason: ${user.ban_reason}</p>`
      : "";

  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          ${roleBadge(user.role)}
          <span style="font-size:11px;color:var(--muted);">Joined ${new Date(user.created_at).toLocaleDateString()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="market-avatar" style="width:36px;height:36px;flex-shrink:0;">${avatarHtml(user.profile_photo_url, user.full_name)}</div>
          <div>
            <h3 style="font-size:15px;margin:0;">${user.full_name}${isSelf ? " (you)" : ""}</h3>
            <p style="color:var(--muted);font-size:12px;margin:0;">${user.email}</p>
          </div>
        </div>
        ${reasonLine}
        ${buttons.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">${buttons.join("")}</div>` : ""}
      </div>
    </div>`;
}

function renderUsers(users) {
  usersListContainer.innerHTML = users.length
    ? users.map(userCard).join("")
    : emptyState("ti-users", "No users found");
  attachUserActionEvents();
}

userSearchInput?.addEventListener("input", () => {
  const q = userSearchInput.value.trim().toLowerCase();
  const filtered = cachedUsers.filter(u =>
    u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  renderUsers(filtered);
});

async function loadUsers() {
  try {
    const res = await apiRequest("/admin/users?limit=200");
    cachedUsers = res.data;
    renderUsers(cachedUsers);
  } catch (err) {
    usersListContainer.innerHTML = errorState(err.message);
  }
}

function attachUserActionEvents() {
  document.querySelectorAll(".view-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => openUserProfileModal(btn.dataset.userId, btn.dataset.userName));
  });

  document.querySelectorAll(".promote-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Promote ${btn.dataset.userName} to admin?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/promote`, "PATCH");
        showToast(`${btn.dataset.userName} is now an admin.`);
        await loadUsers();
        await loadStats();
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".demote-admin-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Remove admin access from ${btn.dataset.userName}?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/demote`, "PATCH");
        showToast(`${btn.dataset.userName} is no longer an admin.`);
        await loadUsers();
        await loadStats();
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".suspend-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Suspend ${btn.dataset.userName}?`,
        confirmLabel: "Suspend",
        onConfirm: async (reason) => {
          await apiRequest(`/reports/users/${btn.dataset.userId}/suspend`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been suspended.`);
          await loadUsers();
          await loadStats();
        }
      });
    });
  });

  document.querySelectorAll(".unsuspend-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Unsuspend ${btn.dataset.userName}?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/unsuspend`, "PATCH");
        showToast(`${btn.dataset.userName} has been unsuspended.`);
        await loadUsers();
        await loadStats();
      } catch (err) { showToast(err.message, "error"); }
    });
  });

  document.querySelectorAll(".ban-user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openActionModal({
        title: `Ban ${btn.dataset.userName}?`,
        confirmLabel: "Ban",
        onConfirm: async (reason) => {
          await apiRequest(`/admin/users/${btn.dataset.userId}/ban`, "PATCH", { reason });
          showToast(`${btn.dataset.userName} has been banned.`);
          await loadUsers();
          await loadStats();
        }
      });
    });
  });

  document.querySelectorAll(".unban-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Unban ${btn.dataset.userName}?`)) return;
      try {
        await apiRequest(`/admin/users/${btn.dataset.userId}/unban`, "PATCH");
        showToast(`${btn.dataset.userName} has been unbanned.`);
        await loadUsers();
        await loadStats();
      } catch (err) { showToast(err.message, "error"); }
    });
  });
}

/* ── Audit log tab ── */
function auditCard(log) {
  return `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          <div class="badge navy"><i class="ti ti-shield-lock" aria-hidden="true"></i> ${log.action}</div>
          <span style="font-size:11px;color:var(--muted);">${new Date(log.created_at).toLocaleString()}</span>
        </div>
        <h3 style="font-size:14px;">${log.admin_name} → ${log.target_type} #${log.target_id ?? "—"}</h3>
        ${log.reason ? `<p style="color:var(--muted);font-size:13px;margin-top:6px;">${log.reason}</p>` : ""}
      </div>
    </div>`;
}

async function loadAuditLogs() {
  try {
    const res = await apiRequest("/admin/audit-logs?limit=100");
    const logs = res.data;
    auditListContainer.innerHTML = logs.length
      ? logs.map(auditCard).join("")
      : emptyState("ti-history", "No admin actions yet");
  } catch (err) {
    auditListContainer.innerHTML = errorState(err.message);
  }
}

/* ── Init ── */
loadStats();
loadReports();
loadUsers();
loadAuditLogs();