const currentUser = requireAuth();
const pageSection = document.body.dataset.section; // "Academic" or "General"

const sectionTasksContainer     = document.getElementById("sectionTasksContainer");
const sectionEquipmentContainer = document.getElementById("sectionEquipmentContainer");
const sectionSalesContainer     = document.getElementById("sectionSalesContainer");

const sectionTasksBlock     = document.getElementById("sectionTasksBlock");
const sectionEquipmentBlock = document.getElementById("sectionEquipmentBlock");
const sectionSalesBlock     = document.getElementById("sectionSalesBlock");

const sectionSearchInput = document.getElementById("sectionSearchInput");

let cachedTasks     = [];
let cachedEquipment = [];
let cachedSales     = [];
let activeType       = "All";

function safeMap(items, builder, label) {
  return items.map(item => {
    try { return builder(item); }
    catch (err) {
      console.error(`${label} card failed to render for item:`, item, err);
      return "";
    }
  }).join("");
}

/* ── Save-heart toggles reuse the SAME localStorage keys as the
   dedicated Tasks/Equipment/Sales pages, so a "saved" state set there
   (or here) stays in sync everywhere it's shown. ── */
function getSavedIds(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function toggleSavedId(key, id) {
  const saved = getSavedIds(key);
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem(key, JSON.stringify(saved));
  return saved.includes(id);
}
function attachSaveHeartEvents(container, storageKey) {
  container.querySelectorAll(".save-heart-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.saveId);
      const nowSaved = toggleSavedId(storageKey, id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
    });
  });
}

function taskCard(task) {
  const isSaved = getSavedIds("taskifySavedTasks").includes(task.id);
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
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
          ${statusBadge(task.status)}
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

function equipmentCard(item) {
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  const isSaved = getSavedIds("taskifySavedEquipment").includes(item.id);
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light blue"><i class="ti ti-package" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
        ${lecturerPostedCornerBadge(item.owner_member_type)}
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${item.id}" aria-label="Save equipment">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(0,114,206,0.12);color:var(--ump-blue);">${avatarHtml(item.owner_name, item.owner_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.owner_id}" style="cursor:pointer;">${posterName(item.owner_name, item.owner_lecturer_title)}</div>
              <div class="market-user-meta"><i class="ti ti-package" aria-hidden="true"></i> Equipment Owner</div>
            </div>
          </div>
        </div>
        <h3>${item.name}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${endorsementBadge(item)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.daily_price} <span>/day</span></div>
          <a href="./equipment-details.html?id=${item.id}" class="market-action-btn"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
        </div>
      </div>
    </div>`;
}

function saleCard(item) {
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  const isSaved = getSavedIds("taskifySavedSales").includes(item.id);
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
        ${lecturerPostedCornerBadge(item.seller_member_type)}
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${item.id}" aria-label="Save item">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name, item.seller_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.seller_id}" style="cursor:pointer;">${posterName(item.seller_name, item.seller_lecturer_title)}</div>
              <div class="market-user-meta"><i class="ti ti-shopping-bag" aria-hidden="true"></i> Student Seller</div>
            </div>
          </div>
        </div>
        <h3>${item.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          ${endorsementBadge(item)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.price}</div>
          <a href="./sale-details.html?id=${item.id}" class="market-action-btn"><i class="ti ti-eye" aria-hidden="true"></i> View</a>
        </div>
      </div>
    </div>`;
}

function matchesSearch(fields, q) {
  if (!q) return true;
  return fields.some(f => f?.toLowerCase().includes(q));
}

function renderAll() {
  const q = sectionSearchInput?.value.trim().toLowerCase() || "";

  const filteredTasks = cachedTasks.filter(t => matchesSearch([t.title, t.description, t.category, t.location], q));
  const filteredEquipment = cachedEquipment.filter(i => matchesSearch([i.name, i.description, i.category], q));
  const filteredSales = cachedSales.filter(i => matchesSearch([i.title, i.description, i.category], q));

  sectionTasksContainer.innerHTML = filteredTasks.length
    ? safeMap(filteredTasks, taskCard, "task")
    : emptyState("ti-clipboard-list", "No tasks found", `No ${pageSection.toLowerCase()} tasks match right now.`);

  sectionEquipmentContainer.innerHTML = filteredEquipment.length
    ? safeMap(filteredEquipment, equipmentCard, "equipment")
    : emptyState("ti-package", "No rentals found", `No ${pageSection.toLowerCase()} rentals match right now.`);

  sectionSalesContainer.innerHTML = filteredSales.length
    ? safeMap(filteredSales, saleCard, "sale")
    : emptyState("ti-shopping-bag", "No items found", `No ${pageSection.toLowerCase()} items match right now.`);

  attachProfileLinkEvents();
  attachSaveHeartEvents(sectionTasksContainer, "taskifySavedTasks");
  attachSaveHeartEvents(sectionEquipmentContainer, "taskifySavedEquipment");
  attachSaveHeartEvents(sectionSalesContainer, "taskifySavedSales");

  applyTypeVisibility();
}

function applyTypeVisibility() {
  sectionTasksBlock.style.display     = (activeType === "All" || activeType === "Tasks")    ? "" : "none";
  sectionEquipmentBlock.style.display = (activeType === "All" || activeType === "Rentals")  ? "" : "none";
  sectionSalesBlock.style.display     = (activeType === "All" || activeType === "Sales")    ? "" : "none";
}

document.querySelectorAll(".filters-row .filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filters-row .filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeType = btn.dataset.type;
    applyTypeVisibility();
  });
});

sectionSearchInput?.addEventListener("input", renderAll);

/* Category shortcut cards double as quick search filters — clicking one
   fills the search box with that category name and jumps to results. */
document.querySelectorAll("#categoryShortcuts .category-card").forEach(card => {
  card.style.cursor = "pointer";
  card.addEventListener("click", () => {
    if (sectionSearchInput) {
      sectionSearchInput.value = card.dataset.category;
      renderAll();
    }
    sectionTasksBlock?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

async function loadSectionData() {
  try {
    const [tasksRes, equipmentRes, salesRes] = await Promise.all([
      apiRequest("/tasks"),
      apiRequest("/equipment"),
      apiRequest("/sales")
    ]);

    cachedTasks     = (tasksRes.data || []).filter(t => t.section === pageSection);
    cachedEquipment = (equipmentRes.data || []).filter(i => i.section === pageSection);
    cachedSales     = (salesRes.data || []).filter(i => i.section === pageSection);

    renderAll();
  } catch (err) {
    console.error("loadSectionData failed:", err);
    sectionTasksContainer.innerHTML = errorState(err.message);
    sectionEquipmentContainer.innerHTML = "";
    sectionSalesContainer.innerHTML = "";
    showToast(err.message, "error");
  }
}

loadSectionData();