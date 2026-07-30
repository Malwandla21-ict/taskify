const currentUser = requireAuth();

const heroNameEl               = document.getElementById("heroName");
const featuredTasksContainer   = document.getElementById("featuredTasksContainer");
const featuredEquipmentContainer = document.getElementById("featuredEquipmentContainer");
const heroSearch               = document.getElementById("heroSearch");
const heroSearchButton         = document.getElementById("heroSearchButton");

const statTasks   = document.getElementById("statTasks");
const statRentals = document.getElementById("statRentals");
const statSales   = document.getElementById("statSales");
const statRating  = document.getElementById("statRating");

/* ── Welcome ── */
if (heroNameEl && currentUser) {
  const first = currentUser.full_name?.split(" ")[0] || "Student";
  heroNameEl.textContent = first;
}

/* ── Hero search ── */
if (heroSearchButton) {
  heroSearchButton.addEventListener("click", () => {
    const q = heroSearch?.value.trim();
    if (q) window.location.href = `./tasks.html?search=${encodeURIComponent(q)}`;
  });
}

if (heroSearch) {
  heroSearch.addEventListener("keydown", e => {
    if (e.key === "Enter") heroSearchButton.click();
  });
}

/* ── Stats bar ── */
async function loadStats() {
  try {
    const [tasks, equipment, sales, profile] = await Promise.all([
      apiRequest("/tasks"),
      apiRequest("/equipment"),
      apiRequest("/sales"),
      apiRequest(`/users/${currentUser.id}/profile`)
    ]);

    if (statTasks)   statTasks.textContent   = tasks.data.length;
    if (statRentals) statRentals.textContent  = equipment.data.length;
    if (statSales)   statSales.textContent    = sales.data.length;
    if (statRating)  statRating.textContent   = profile.data.rating_average
                                                  ? Number(profile.data.rating_average).toFixed(1)
                                                  : "—";
  } catch (_) { /* stats are non-critical */ }
}

/* ── Task card ── */
function taskCard(task) {
  const initials = avatarInitials(task.created_by_name);
  return `
    <div class="market-card">
      <div class="market-image">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="market-image-placeholder"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
        ${task.urgent ? `<div class="urgent-badge"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${initials}</div>
            <div>
              <div class="market-user-name">${task.created_by_name}</div>
              <div class="market-user-meta"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</div>
            </div>
          </div>
          ${sectionBadge(task.section || "General")}
        </div>
        <h3>${task.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
        </div>
        <div class="market-footer">
          <div class="market-price">R${task.price} <span>/task</span></div>
          <a href="./task-details.html?id=${task.id}" class="market-action-btn">
            <i class="ti ti-eye" aria-hidden="true"></i> View
          </a>
        </div>
      </div>
    </div>`;
}

/* ── Equipment card ── */
function equipmentCard(item) {
  const initials = avatarInitials(item.owner_name);
  return `
    <div class="market-card">
      <div class="market-image" style="background:linear-gradient(135deg,#E6F1FB,#B5D4F4);">
        ${item.image_urls?.length
          ? `<img src="${item.image_urls[0]}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="market-image-placeholder" style="color:var(--ump-blue);"><i class="ti ti-package" aria-hidden="true"></i></div>`}
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${initials}</div>
            <div>
              <div class="market-user-name">${item.owner_name}</div>
              <div class="market-user-meta"><i class="ti ti-package" aria-hidden="true"></i> Equipment Owner</div>
            </div>
          </div>
          ${sectionBadge(item.section || "General")}
        </div>
        <h3>${item.name}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          <div class="market-tag green"><i class="ti ti-circle-check" aria-hidden="true"></i> Available</div>
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
          <a href="./equipment-details.html?id=${item.id}" class="market-action-btn">
            <i class="ti ti-eye" aria-hidden="true"></i> View
          </a>
        </div>
      </div>
    </div>`;
}

/* ── Loaders ── */
async function loadFeaturedTasks() {
  try {
    const res   = await apiRequest("/tasks");
    const tasks = res.data.slice(0, 3);

    featuredTasksContainer.innerHTML = tasks.length
      ? tasks.map(taskCard).join("")
      : emptyState("ti-clipboard-list", "No tasks yet", "Be the first to post one!");
  } catch (err) {
    featuredTasksContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadFeaturedEquipment() {
  try {
    const res   = await apiRequest("/equipment");
    const items = res.data.slice(0, 3);

    featuredEquipmentContainer.innerHTML = items.length
      ? items.map(equipmentCard).join("")
      : emptyState("ti-package", "No rentals yet", "List your equipment to get started!");
  } catch (err) {
    featuredEquipmentContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadStats();
loadFeaturedTasks();
loadFeaturedEquipment();