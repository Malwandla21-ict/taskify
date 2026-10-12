/* Guests (no account) can browse this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   anything that actually needs an account is guarded individually below. */
const currentUser = getCurrentUser();

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
  salesStepText.textContent = `${editingSalesId ? "Editing · " : ""}Step ${n} of 3`;
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
  const section   = categorySection("sales", category) || "General";
  const desc      = document.getElementById("salesDescription").value.trim();
  const condition = document.getElementById("salesCondition").value;
  const location  = document.getElementById("salesLocation").value.trim();
  const price     = document.getElementById("salesPrice").value.trim();
  const quantity  = selectedQuantity();

  salesPreview.innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${escapeHtml(title || "Item title")}</h3>
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">${escapeHtml(desc || "Item description will appear here.")}</p>
    <div class="market-tags">
      ${sectionBadge(section)}
      <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(category || "Category")}</div>
      ${conditionBadge(condition)}
      <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(location || "Location")}</div>
    </div>
    <div style="margin-top:14px;font-size:13px;color:var(--muted);">
      Price: <strong style="color:var(--ump-green);font-size:16px;">R${escapeHtml(price || "0")}</strong>${quantity > 1 ? ` each · <strong>${quantity}</strong> available` : ""}
    </div>`;
}

/* ── One item or several of the same ──
   The seller has to choose. A single item comes down by itself once it
   sells; with several, the listing stays up until the last one has gone
   (backend: sales.service.js quantity). */
const salesQuantityChoice = document.getElementById("salesQuantityChoice");
const salesQuantityGroup  = document.getElementById("salesQuantityGroup");
const salesQuantityInput  = document.getElementById("salesQuantity");

function quantityMode() {
  return salesForm?.querySelector("input[name='salesQuantityMode']:checked")?.value || "";
}

function selectedQuantity() {
  if (quantityMode() !== "multiple") return 1;
  const n = Number(salesQuantityInput?.value);
  return Number.isInteger(n) && n >= 2 ? n : 1;
}

function syncQuantityUI() {
  const mode = quantityMode();
  if (salesQuantityGroup) salesQuantityGroup.hidden = mode !== "multiple";
  const hint = document.getElementById("salesQuantityHint");
  if (hint) hint.querySelector("span").textContent = mode === "multiple"
    ? "Your listing stays up until the last one sells. Buyers see how many are left."
    : mode === "single"
      ? "Your listing comes down by itself once it sells."
      : "Choose one, so we know when to take the listing down.";
  const priceLabel = document.getElementById("salesPriceLabel");
  if (priceLabel) priceLabel.innerHTML = `<i class="ti ti-currency-dollar" aria-hidden="true"></i> ${mode === "multiple" ? "Price each (R)" : "Price (R)"}`;
  updateSalesPreview();
}

salesQuantityChoice?.addEventListener("change", () => {
  clearFieldError(salesQuantityChoice);
  syncQuantityUI();
  if (quantityMode() === "multiple") salesQuantityInput?.focus();
});
salesQuantityInput?.addEventListener("input", updateSalesPreview);
salesForm?.addEventListener("reset", () => setTimeout(syncQuantityUI, 0));

function validateSalesStep3() {
  let ok = true;
  const mode = quantityMode();
  if (!mode) {
    setFieldError(salesQuantityChoice, "Choose whether you're selling just this one or several of the same.");
    ok = false;
  } else if (mode === "multiple") {
    const n = Number(salesQuantityInput.value);
    if (!Number.isInteger(n) || n < 2 || n > 100) {
      setFieldError(salesQuantityInput, "Enter how many you have — a whole number from 2 to 100.");
      ok = false;
    }
  }
  const priceInput = document.getElementById("salesPrice");
  if (!priceInput.value.trim() || Number(priceInput.value) < 0) {
    setFieldError(priceInput, "Enter a price.");
    ok = false;
  }
  if (!ok) focusFirstInvalid(document.getElementById("salesStep3"));
  return ok;
}

/* "3 left" for buyers; "2 of 5 sold" for the seller. */
function quantityTag(item, { owner = false } = {}) {
  const quantity = Number(item.quantity || 1);
  if (quantity <= 1) return "";
  const sold = Number(item.quantity_sold || 0);
  const held = Number(item.quantity_on_hold || 0);
  const left = Math.max(0, quantity - sold - held);
  return owner
    ? `<div class="market-tag quantity-tag"><i class="ti ti-stack-2" aria-hidden="true"></i> ${sold} of ${quantity} sold${held ? ` · ${held} waiting for handover` : ""}</div>`
    : `<div class="market-tag quantity-tag"><i class="ti ti-stack-2" aria-hidden="true"></i> ${left} left</div>`;
}

/* The cash "sold" button: a single item is "Mark as Sold"; with several
   left it records one sale at a time. */
function markSoldLabel(item) {
  const left = Number(item.quantity || 1) - Number(item.quantity_sold || 0) - Number(item.quantity_on_hold || 0);
  return Number(item.quantity || 1) > 1 && left > 1
    ? `<i class="ti ti-circle-check" aria-hidden="true"></i> Sold one`
    : `<i class="ti ti-circle-check" aria-hidden="true"></i> Mark as Sold`;
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

/* Edit mode: the same form edits an existing listing when the page is
   opened as sales.html?edit=<id> (the Edit button on the item's detail page). */
let editingSalesId = null;
const SALES_SUBMIT_HTML = {
  create: `<i class="ti ti-send" aria-hidden="true"></i> Publish Item`,
  edit:   `<i class="ti ti-device-floppy" aria-hidden="true"></i> Save Changes`
};

function setSalesSubmitLabel() {
  const submitBtn = salesForm?.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.innerHTML = editingSalesId ? SALES_SUBMIT_HTML.edit : SALES_SUBMIT_HTML.create;
}

function openSalesCreateModal() {
  if (!requireAuthAction("Sign in to sell an item.")) return;
  editingSalesId = null;
  salesForm?.reset();
  salesMessage.textContent = "";
  setSalesSubmitLabel();
  showSalesStep(1);
  if (salesUploader) salesUploader.reset();
  syncQuantityUI();
  salesCreateOverlay?.classList.add("open");
  salesCreateModal?.classList.add("open");
}

function openSalesEditModal(item) {
  editingSalesId = item.id;
  salesForm?.reset();
  salesMessage.textContent = "";
  document.getElementById("salesTitle").value       = item.title || "";
  fillCategorySelect(document.getElementById("salesCategory"), "sales", item.category || "", document.getElementById("salesCategoryHint"));
  document.getElementById("salesDescription").value = item.description || "";
  document.getElementById("salesCondition").value   = item.condition_status || "Good";
  document.getElementById("salesLocation").value    = item.location || "";
  document.getElementById("salesPrice").value       = item.price ?? "";
  const multiple = Number(item.quantity || 1) > 1;
  const modeInput = salesForm.querySelector(`input[name='salesQuantityMode'][value='${multiple ? "multiple" : "single"}']`);
  if (modeInput) modeInput.checked = true;
  if (salesQuantityInput) salesQuantityInput.value = multiple ? item.quantity : "";
  syncQuantityUI();
  if (salesUploader) salesUploader.setExisting(item.image_urls || []);
  updateSalesPreview();
  setSalesSubmitLabel();
  showSalesStep(1);
  salesCreateOverlay?.classList.add("open");
  salesCreateModal?.classList.add("open");
}

async function openSalesEditFromUrl() {
  const editId = getEditIdFromUrl();
  if (!editId || !currentUser) return;
  clearEditParam();
  try {
    const res = await apiRequest(`/sales/${editId}`);
    const item = res.data;
    if (Number(item.seller_id) !== Number(currentUser.id)) { showToast("You can only edit your own listings.", "error"); return; }
    if (item.status !== "Available") { showToast("This item can't be edited once a buyer has paid or it's sold.", "error"); return; }
    openSalesEditModal(item);
  } catch (err) {
    showToast(err.message, "error");
  }
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

/* Fixed list (not built from whatever has been posted) so every
   category shows up, even before anyone has used it. */
function populateCategoryFilter() {
  fillCategoryFilter(salesCategoryFilter, "sales");
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
  const isOwn = !!currentUser && Number(item.seller_id) === Number(currentUser.id);
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  const isSaved = getSavedIds().includes(item.id);

  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" class="lightbox-img" data-gallery="sale-${item.id}" data-full="${escapeHtml(imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
        ${lecturerPostedCornerBadge(item.seller_member_type, item.seller_lecturer_verified)}
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${item.id}" aria-label="Save item">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar" style="background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name, item.seller_profile_photo)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.seller_id}" style="cursor:pointer;">${escapeHtml(posterName(item.seller_name, item.seller_lecturer_title))}</div>
              <div class="market-user-meta"><i class="ti ti-shopping-bag" aria-hidden="true"></i> Student Seller</div>
            </div>
          </div>
          ${sectionBadge(item.section)}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(item.category)}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(item.location)}</div>
          ${quantityTag(item, { owner: isOwn })}
          ${endorsementBadge(item)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${escapeHtml(item.price)}${Number(item.quantity) > 1 ? ` <span>each</span>` : ""}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <a href="./sale-details.html?id=${item.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
            ${isOwn ? `
              <div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your Item</div>
              <button class="market-action-btn outline mark-sold-btn" data-item-id="${item.id}" data-multi="${Number(item.quantity) > 1 ? 1 : ""}">
                ${markSoldLabel(item)}
              </button>
              <button class="market-action-btn outline delete-sale-btn" data-item-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete
              </button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

function myListingCard(item) {
  const isSold = item.status !== "Available";
  const imageUrl = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls[0] : null;
  return `
    <div class="market-card history-row">
      <div class="market-image" style="position:relative;">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" class="lightbox-img" data-gallery="mylisting-${item.id}" data-full="${escapeHtml(imageUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(item)}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(item.section)}
          ${statusBadge(item.status)}
          ${pendingReviewBadge(item.moderation_status)}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="history-desc">${escapeHtml(item.description)}</p>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(item.category)}</div>
          ${conditionBadge(item.condition_status)}
          ${quantityTag(item, { owner: true })}
          ${endorsementBadge(item)}
          <div class="market-price" style="font-size:16px;">R${escapeHtml(item.price)}${Number(item.quantity) > 1 ? " each" : ""}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          ${Number(item.quantity_on_hold) > 0 ? `
            <a href="./sale-details.html?id=${item.id}" class="market-action-btn" style="flex:1;justify-content:center;">
              <i class="ti ti-lock-open" aria-hidden="true"></i> ${Number(item.quantity_on_hold) > 1 ? `${item.quantity_on_hold} buyers paid — enter codes` : "Buyer paid — enter code"}
            </a>` : ""}
          ${!isSold ? `
            <button class="market-action-btn mark-sold-btn" data-item-id="${item.id}" data-multi="${Number(item.quantity) > 1 ? 1 : ""}" style="flex:1;">
              ${markSoldLabel(item)}
            </button>` : ""}
          ${Number(item.quantity_on_hold) > 0 ? "" : `<button class="market-action-btn outline delete-sale-btn" data-item-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
            <i class="ti ti-trash" aria-hidden="true"></i> Delete
          </button>`}
        </div>
      </div>
    </div>`;
}

function myListingMiniCard(item) {
  return `
    <a href="./sale-details.html?id=${item.id}" class="mini-history-item">
      <div class="mini-history-thumb">${Array.isArray(item.image_urls) && item.image_urls.length
        ? `<img src="${escapeHtml(item.image_urls[0])}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div class="media-placeholder light gold"><i class="ti ti-shopping-bag" aria-hidden="true"></i></div>`}</div>
      <div class="mini-history-info">
        <div class="mini-history-top">
          ${sectionBadge(item.section)}
          ${statusBadge(item.status)}
          ${pendingReviewBadge(item.moderation_status)}
        </div>
        <div class="mini-history-title">${escapeHtml(item.title)}</div>
        <div class="mini-history-meta">R${escapeHtml(item.price)} &middot; ${escapeHtml(item.condition_status)}</div>
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
  attachMarkSoldEvents();
  attachDeleteSaleEvents();
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
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
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
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Updating…`;
      try {
        const res = await apiRequest(`/sales/${btn.dataset.itemId}/sold`, "PATCH");
        showToast(res.message || "Item marked as sold!");
        await loadSalesItems();
        await loadMySalesItems();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  });
}

async function loadSalesItems() {
  try {
    const res = await apiRequest("/sales");
    cachedSalesItems = Array.isArray(res.data) ? res.data : [];
    populateCategoryFilter(cachedSalesItems);

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam && salesSearchInput) salesSearchInput.value = searchParam;

    renderSalesItems();
  } catch (err) {
    console.error("loadSalesItems failed:", err);
    salesContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadMySalesItems() {
  if (!currentUser) {
    mySalesContainer.innerHTML = emptyState("ti-lock", "Sign in to see your listings", "Create an account or log in to list and manage your own items.");
    mySalesMiniContainer.innerHTML = `<p class="rail-loading">Sign in to see your listings.</p>`;
    return;
  }
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
  if (!validateSalesStep3()) return;
  const submitBtn = salesForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `${taskifyMarkLoader()} ${editingSalesId ? "Saving…" : "Publishing…"}`;

  try {
    /* In edit mode, keep the saved photos the seller didn't remove. */
    let imageUrls = salesUploader ? salesUploader.getExisting() : [];
    if (salesUploader && salesUploader.getFiles().length) {
      imageUrls = [...imageUrls, ...await salesUploader.upload("sales")];
    }

    const payload = {
      title:           document.getElementById("salesTitle").value.trim(),
      description:     document.getElementById("salesDescription").value.trim(),
      category:        document.getElementById("salesCategory").value.trim(),
      section:         categorySection("sales", document.getElementById("salesCategory").value),
      price:           Number(document.getElementById("salesPrice").value.trim()),
      conditionStatus: document.getElementById("salesCondition").value,
      location:        document.getElementById("salesLocation").value.trim(),
      quantity:        selectedQuantity(),
      imageUrls
    };

    if (editingSalesId) {
      await apiRequest(`/sales/${editingSalesId}`, "PUT", payload);
      showToast("Listing updated!");
      window.location.href = `./sale-details.html?id=${editingSalesId}`;
      return;
    }

    await apiRequest("/sales", "POST", payload);
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
    setSalesSubmitLabel();
  }
});

const salesPolicyNoticeEl = document.getElementById("salesPolicyNotice");
if (salesPolicyNoticeEl) salesPolicyNoticeEl.innerHTML = contentPolicyNotice();

fillCategorySelect(document.getElementById("salesCategory"), "sales", "", document.getElementById("salesCategoryHint"));
populateCategoryFilter();
loadSalesItems();
loadMySalesItems();

const salesUploader = initImageUploader("salesUploadArea", "salesPreviewGrid");

openSalesEditFromUrl();