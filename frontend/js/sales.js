const currentUser = requireAuth();

const salesForm         = document.getElementById("salesForm");
const salesMessage      = document.getElementById("salesMessage");
const salesContainer    = document.getElementById("salesContainer");
const mySalesContainer  = document.getElementById("mySalesContainer");
const mySalesMiniContainer = document.getElementById("mySalesMiniContainer");

const salesSearchInput   = document.getElementById("salesSearchInput");
const salesCategoryFilter = document.getElementById("salesCategoryFilter");
const salesPriceFilter    = document.getElementById("salesPriceFilter");
const salesSortSelect     = document.getElementById("salesSortSelect");

let cachedSalesItems  = [];
let selectedSection   = "All";

const salesCreateOverlay    = document.getElementById("salesCreateOverlay");
const salesCreateModal      = document.getElementById("salesCreateModal");
const openSalesModalButton  = document.getElementById("openSalesModalButton");
const heroSellItemButton    = document.getElementById("heroSellItemButton");
const closeSalesModalButton = document.getElementById("closeSalesModalButton");

const salesStep1        = document.getElementById("salesStep1");
const salesStep2        = document.getElementById("salesStep2");
const salesStep3        = document.getElementById("salesStep3");
const salesStepText     = document.getElementById("salesStepText");
const salesProgressFill = document.getElementById("salesProgressFill");
const salesPreview      = document.getElementById("salesPreview");
const sDot1 = document.getElementById("sDot1");
const sDot2 = document.getElementById("sDot2");
const sDot3 = document.getElementById("sDot3");

function showSalesStep(n) {
  salesStep1.style.display = n === 1 ? "block" : "none";
  salesStep2.style.display = n === 2 ? "block" : "none";
  salesStep3.style.display = n === 3 ? "block" : "none";
  salesStepText.textContent = `Step ${n} of 3`;
  salesProgressFill.style.width = n === 1 ? "33%" : n === 2 ? "66%" : "100%";
  [sDot1, sDot2, sDot3].forEach((dot, i) => {
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (i + 1 < n)  dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });
}

function updateSalesPreview() {
  const title     = document.getElementById("salesTitle").value.trim();
  const category  = document.getElementById("salesCategory").value.trim();
  const section   = document.getElementById("salesSection").value;
  const desc      = document.getElementById("salesDescription").value.trim();
  const condition = document.getElementById("salesCondition").value;
  const location  = document.getElementById("salesLocation").value.trim();
  const price     = document.getElementById("salesPrice").value.trim();

  salesPreview.innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${title || "Item title"}</h3>
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">${desc || "Item description will appear here."}</p>
    <div class="market-tags">
      ${sectionBadge(section)}
      <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${category || "Category"}</div>
      ${conditionBadge(condition)}
      <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${location || "Location"}</div>
    </div>
    <div style="margin-top:14px;font-size:13px;color:var(--muted);">
      Price: <strong style="color:var(--ump-green);font-size:16px;">R${price || "0"}</strong>
    </div>`;
}

function validateSalesStep1() {
  if (!document.getElementById("salesTitle").value.trim() || !document.getElementById("salesCategory").value.trim()) {
    showToast("Please complete the item title and category.", "error");
    return false;
  }
  return true;
}

function validateSalesStep2() {
  if (!document.getElementById("salesDescription").value.trim() || !document.getElementById("salesLocation").value.trim()) {
    showToast("Please complete the description and location.", "error");
    return false;
  }
  return true;
}

document.getElementById("nextSalesStep2")?.addEventListener("click", () => { if (validateSalesStep1()) showSalesStep(2); });
document.getElementById("nextSalesStep3")?.addEventListener("click", () => { if (validateSalesStep2()) { updateSalesPreview(); showSalesStep(3); } });
document.getElementById("backSalesStep1")?.addEventListener("click", () => showSalesStep(1));
document.getElementById("backSalesStep2")?.addEventListener("click", () => showSalesStep(2));
document.getElementById("salesPrice")?.addEventListener("input", updateSalesPreview);

function openSalesCreateModal() {
  salesForm?.reset();
  salesMessage.textContent = "";
  showSalesStep(1);
  if (salesUploader) salesUploader.reset();
  salesCreateOverlay?.classList.add("open");
  salesCreateModal?.classList.add("open");
}

function closeSalesCreateModal() {
  salesCreateOverlay?.classList.remove("open");
  salesCreateModal?.classList.remove("open");
}

openSalesModalButton?.addEventListener("click", openSalesCreateModal);
heroSellItemButton?.addEventListener("click", openSalesCreateModal);
closeSalesModalButton?.addEventListener("click", closeSalesCreateModal);
salesCreateOverlay?.addEventListener("click", closeSalesCreateModal);

document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderSalesItems();
  });
});

salesSearchInput?.addEventListener("input", renderSalesItems);
salesCategoryFilter?.addEventListener("change", renderSalesItems);
salesPriceFilter?.addEventListener("change", renderSalesItems);
salesSortSelect?.addEventListener("change", renderSalesItems);

function populateCategoryFilter(items) {
  const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  salesCategoryFilter.innerHTML = `<option value="All">All Categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

/* ── Client-side-only "saved" heart toggle ── local per browser only;
   there is no saved-listings table/endpoint in the backend yet. */
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedSales") || "[]"); }
  catch { return []; }
}
function toggleSavedId(id) {
  const saved = getSavedIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedSales", JSON.stringify(saved));
  return saved.includes(id);
}
function attachSaveHeartEvents() {
  document.querySelectorAll(".save-heart-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.saveId);
      const nowSaved = toggleSavedId(id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
    });
  });
}

function safeMap(items, builder, label) {
  return items.map(item => {
    try {
      return builder(item);
    } catch (err) {
      console.error(`${label} card failed to render for item:`, item, err);
      return "";
    }
  }).join("");
}

function saleCard(item) {
  const isOwn = Number(item.seller_id) === Number(currentUser.id);
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  const isSaved = getSavedIds().includes(item.id);

  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${item.title}" class="lightbox-img" data-gallery="sale-${item.id}" data-full="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" />`
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
          ${sectionBadge(item.section)}
        </div>
        <h3>${item.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
          ${endorsementBadge(item)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${item.price}</div>
          ${isOwn
            ? `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your Item</div>`
            : `<a href="./sale-details.html?id=${item.id}" class="market-action-btn">
                 <i class="ti ti-eye" aria-hidden="true"></i> View
               </a>`}
        </div>
      </div>
    </div>`;
}

function myListingCard(item) {
  const isSold = item.status !== "Available";
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${item.title}" class="lightbox-img" data-gallery="mylisting-${item.id}" data-full="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(item.section)}
          ${statusBadge(item.status)}
        </div>
        <h3>${item.title}</h3>
        <p style="color:var(--muted);font-size:13px;margin:8px 0 12px;">${item.description}</p>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          ${endorsementBadge(item)}
          <div class="market-price" style="font-size:16px;">R${item.price}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          ${!isSold ? `
            <button class="market-action-btn mark-sold-btn" data-item-id="${item.id}" style="flex:1;">
              <i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold
            </button>` : ""}
          <button class="market-action-btn outline delete-sale-btn" data-item-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
            <i class="ti ti-trash" aria-hidden="true"></i> Delete
          </button>
        </div>
      </div>
    </div>`;
}

function myListingMiniCard(item) {
  return `
    <a href="./sale-details.html?id=${item.id}" class="mini-history-item">
      <div class="mini-history-thumb"><div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div></div>
      <div class="mini-history-info">
        <div class="mini-history-top">
          ${sectionBadge(item.section)}
          ${statusBadge(item.status)}
        </div>
        <div class="mini-history-title">${item.title}</div>
        <div class="mini-history-meta">R${item.price} &middot; ${item.condition_status}</div>
      </div>
    </a>`;
}

function getFilteredSortedItems() {
  const q = salesSearchInput?.value.trim().toLowerCase() || "";
  const category = salesCategoryFilter?.value || "All";
  const priceBucket = salesPriceFilter?.value || "All";

  let filtered = cachedSalesItems.filter(item => {
    const matchesSection  = selectedSection === "All" || item.section === selectedSection;
    const matchesCategory = category === "All" || item.category === category;
    const matchesSearch = !q || [item.title, item.description, item.category, item.location, item.condition_status]
      .some(f => f?.toLowerCase().includes(q));
    const price = Number(item.price);
    const matchesPrice =
      priceBucket === "All" ? true :
      priceBucket === "under100" ? price < 100 :
      priceBucket === "100to300" ? price >= 100 && price <= 300 :
      price > 300;
    return matchesSection && matchesCategory && matchesSearch && matchesPrice;
  });

  const sort = salesSortSelect?.value || "newest";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "price_asc")  return Number(a.price) - Number(b.price);
    if (sort === "price_desc") return Number(b.price) - Number(a.price);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return filtered;
}

function renderSalesItems() {
  const filtered = getFilteredSortedItems();
  salesContainer.innerHTML = filtered.length
    ? safeMap(filtered, saleCard, "sale")
    : emptyState("ti-shopping-bag", "No items found", "Try a different filter or list your own.");
  attachProfileLinkEvents();
  attachSaveHeartEvents();
}

function renderMySalesItems(items) {
  mySalesContainer.innerHTML = items.length
    ? safeMap(items, myListingCard, "my listing")
    : emptyState("ti-tag", "No listings yet", "Items you list for sale appear here.");
  attachMarkSoldEvents();
  attachDeleteSaleEvents();

  mySalesMiniContainer.innerHTML = items.length
    ? items.slice(0, 4).map(myListingMiniCard).join("")
    : `<p class="rail-loading">No listings yet.</p>`;
}

function attachDeleteSaleEvents() {
  document.querySelectorAll(".delete-sale-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this listing?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/sales/${btn.dataset.itemId}`, "DELETE");
        showToast("Listing deleted.");
        await loadSalesItems();
        await loadMySalesItems();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });
}

function attachMarkSoldEvents() {
  document.querySelectorAll(".mark-sold-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Updating…`;
      try {
        await apiRequest(`/sales/${btn.dataset.itemId}/sold`, "PATCH");
        showToast("Item marked as sold!");
        await loadSalesItems();
        await loadMySalesItems();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold`;
      }
    });
  });
}

async function loadSalesItems() {
  try {
    const res = await apiRequest("/sales");
    cachedSalesItems = Array.isArray(res.data) ? res.data : [];
    populateCategoryFilter(cachedSalesItems);
    renderSalesItems();
  } catch (err) {
    console.error("loadSalesItems failed:", err);
    salesContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadMySalesItems() {
  try {
    const res = await apiRequest("/sales/my-listings");
    renderMySalesItems(Array.isArray(res.data) ? res.data : []);
  } catch (err) {
    console.error("loadMySalesItems failed:", err);
    mySalesContainer.innerHTML = errorState(err.message);
    mySalesMiniContainer.innerHTML = `<p class="rail-loading">Couldn't load listings.</p>`;
  }
}

document.getElementById("viewAllListingsLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  const section = document.getElementById("fullListingsSection");
  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth", block: "start" });
});

salesForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = salesForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Publishing…`;

  try {
    let imageUrls = [];
    if (salesUploader && salesUploader.getFiles().length) {
      showToast("Uploading images…", "warning");
      imageUrls = await salesUploader.upload("sales");
    }

    await apiRequest("/sales", "POST", {
      title:           document.getElementById("salesTitle").value.trim(),
      description:     document.getElementById("salesDescription").value.trim(),
      category:        document.getElementById("salesCategory").value.trim(),
      section:         document.getElementById("salesSection").value,
      price:           Number(document.getElementById("salesPrice").value.trim()),
      conditionStatus: document.getElementById("salesCondition").value,
      location:        document.getElementById("salesLocation").value.trim(),
      imageUrls
    });
    showToast("Item listed successfully!");
    salesForm.reset();
    if (salesUploader) salesUploader.reset();
    showSalesStep(1);
    closeSalesCreateModal();
    await loadSalesItems();
    await loadMySalesItems();
  } catch (err) {
    salesMessage.textContent = err.message;
    salesMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="ti ti-send" aria-hidden="true"></i> Publish Item`;
  }
});

loadSalesItems();
loadMySalesItems();

const salesUploader = initImageUploader("salesUploadArea", "salesPreviewGrid");