requireAuth();

const pageSection = document.body.dataset.section || "Academic";

/* Support both ID naming conventions:
   academic.html uses sectionXxxContainer
   general.html  uses generalXxxContainer */
const sectionSearch          = document.getElementById("sectionSearch")   || document.getElementById("generalSearch");
const sectionSearchButton    = document.getElementById("sectionSearchButton") || document.getElementById("generalSearchButton");
const sectionTasksContainer  = document.getElementById("sectionTasksContainer")  || document.getElementById("generalTasksContainer");
const sectionEquipmentContainer = document.getElementById("sectionEquipmentContainer") || document.getElementById("generalEquipmentContainer");
const sectionSalesContainer  = document.getElementById("sectionSalesContainer")  || document.getElementById("generalSalesContainer");

let cachedTasks     = [];
let cachedEquipment = [];
let cachedSales     = [];

sectionSearch?.addEventListener("input", renderAll);
sectionSearchButton?.addEventListener("click", renderAll);

function renderAll() {
  renderSectionTasks();
  renderSectionEquipment();
  renderSectionSales();
}

function getSearch() { return sectionSearch?.value.trim().toLowerCase() || ""; }

async function loadSectionData() {
  try {
    const [tr, er, sr] = await Promise.all([
      apiRequest("/tasks"),
      apiRequest("/equipment"),
      apiRequest("/sales")
    ]);
    cachedTasks     = tr.data.filter(i => i.section === pageSection);
    cachedEquipment = er.data.filter(i => i.section === pageSection);
    cachedSales     = sr.data.filter(i => i.section === pageSection);
    renderAll();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderSectionTasks() {
  if (!sectionTasksContainer) return;
  const q        = getSearch();
  const filtered = cachedTasks.filter(t =>
    [t.title, t.description, t.category, t.location].some(f => f?.toLowerCase().includes(q))
  ).slice(0, 6);

  if (!filtered.length) {
    sectionTasksContainer.innerHTML = emptyState("ti-clipboard-list", `No ${pageSection.toLowerCase()} tasks`, "Check back soon or post one yourself.");
    return;
  }

  sectionTasksContainer.innerHTML = filtered.map(task => {
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
            ${sectionBadge(task.section)}
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
  }).join("");
}

function renderSectionEquipment() {
  if (!sectionEquipmentContainer) return;
  const q        = getSearch();
  const filtered = cachedEquipment.filter(i =>
    [i.name, i.description, i.category].some(f => f?.toLowerCase().includes(q))
  ).slice(0, 6);

  if (!filtered.length) {
    sectionEquipmentContainer.innerHTML = emptyState("ti-package", `No ${pageSection.toLowerCase()} rentals`, "Check back soon or list your equipment.");
    return;
  }

  sectionEquipmentContainer.innerHTML = filtered.map(item => {
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
            ${sectionBadge(item.section)}
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
  }).join("");
}

function renderSectionSales() {
  if (!sectionSalesContainer) return;
  const q        = getSearch();
  const filtered = cachedSales.filter(i =>
    [i.title, i.description, i.category, i.location].some(f => f?.toLowerCase().includes(q))
  ).slice(0, 6);

  if (!filtered.length) {
    sectionSalesContainer.innerHTML = emptyState("ti-shopping-bag", `No ${pageSection.toLowerCase()} items`, "Check back soon or list your own.");
    return;
  }

  sectionSalesContainer.innerHTML = filtered.map(item => {
    const initials = avatarInitials(item.seller_name);
    return `
      <div class="market-card">
        <div class="market-image" style="background:linear-gradient(135deg,#FAEEDA,#FAC775);">
          ${item.image_urls?.length
            ? `<img src="${item.image_urls[0]}" alt="${item.title}" style="width:100%;height:100%;object-fit:cover;" />`
            : `<div class="market-image-placeholder" style="color:#c99200;"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}
        </div>
        <div class="market-content">
          <div class="market-top">
            <div class="market-user">
              <div class="market-avatar" style="background:rgba(245,180,0,0.14);color:#b38900;">${initials}</div>
              <div>
                <div class="market-user-name">${item.seller_name}</div>
                <div class="market-user-meta"><i class="ti ti-shopping-bag" aria-hidden="true"></i> Student Seller</div>
              </div>
            </div>
            ${sectionBadge(item.section)}
          </div>
          <h3>${item.title}</h3>
          <div class="market-tags">
            <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
            ${conditionBadge(item.condition_status)}
            <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
          </div>
          <div class="market-footer">
            <div class="market-price">R${item.price}</div>
            <a href="./sale-details.html?id=${item.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
          </div>
        </div>
      </div>`;
  }).join("");
}

loadSectionData();