const currentUser = requireAuth();

if (currentUser.role !== "admin") {
  window.location.href = "./dashboard.html";
}

const allowlistContainer = document.getElementById("allowlistContainer");

function entryCard(entry) {
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

function renderAllowlist(entries) {
  allowlistContainer.innerHTML = entries.length
    ? entries.map(entryCard).join("")
    : emptyState("ti-shield-lock", "No entries yet", "Allow-list entries are added via the server-side management script.");
}

async function loadAllowlist() {
  try {
    const res = await apiRequest("/admin/allowlist");
    renderAllowlist(res.data);
  } catch (err) {
    allowlistContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadAllowlist();