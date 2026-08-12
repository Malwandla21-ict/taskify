const currentUser = requireAuth();

const salesForm      = document.getElementById("salesForm");
const salesMessage   = document.getElementById("salesMessage");
const salesContainer = document.getElementById("salesContainer");
const mySalesContainer = document.getElementById("mySalesContainer");
const salesSearch    = document.getElementById("salesSearch");
const salesSearchButton = document.getElementById("salesSearchButton");
const categoryFilter = document.getElementById("categoryFilter");

let cachedSalesItems  = [];
let selectedSection   = "All";
let selectedCategory  = "All";

/* ── Filters ── */
document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderSalesItems(cachedSalesItems);
  });
});

categoryFilter?.addEventListener("change", () => { selectedCategory = categoryFilter.value; renderSalesItems(cachedSalesItems); });
salesSearch?.addEventListener("input", () => renderSalesItems(cachedSalesItems));
salesSearchButton?.addEventListener("click", () => renderSalesItems(cachedSalesItems));

/* ── Card builder ── */
function saleCard(item) {
  const isOwn     = Number(item.seller_id) === Number(currentUser.id);

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
            <div class="market-avatar" style="background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_profile_photo, item.seller_name)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${item.seller_id}" data-user-name="${item.seller_name}" style="cursor:pointer;">${item.seller_name}</div>
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
          ${isOwn
            ? `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your Item</div>`
            : `<a href="./sale-details.html?id=${item.id}" class="market-action-btn">
                 <i class="ti ti-eye" aria-hidden="true"></i> View
               </a>`}
        </div>
      </div>
    </div>`;
}

/* ── My listing card ── */
function myListingCard(item) {
  const isSold = item.status !== "Available";
  return `
    <div class="market-card">
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

/* ── Render ── */
function renderSalesItems(items) {
  const q = salesSearch?.value.trim().toLowerCase() || "";
  const filtered = items.filter(item =>
    (selectedSection === "All" || item.section === selectedSection) &&
    (selectedCategory === "All" || item.category === selectedCategory) &&
    [item.title, item.description, item.category, item.location, item.condition_status]
      .some(f => f?.toLowerCase().includes(q))
  );
  salesContainer.innerHTML = filtered.length
    ? filtered.map(saleCard).join("")
    : emptyState("ti-shopping-bag", "No items found", "Try a different filter or list your own.");
  attachProfileLinkEvents(salesContainer);
}

function renderMySalesItems(items) {
  mySalesContainer.innerHTML = items.length
    ? items.map(myListingCard).join("")
    : emptyState("ti-tag", "No listings yet", "Items you list for sale appear here.");
  attachMarkSoldEvents();
  attachDeleteSaleEvents();
}

function populateCategoryFilter(items) {
  const cats = [...new Set(items.map(i => i.category))];
  if (!categoryFilter) return;
  categoryFilter.innerHTML = `<option value="All">All Categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");
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

/* ── Loaders ── */
async function loadSalesItems() {
  try {
    const res = await apiRequest("/sales");
    cachedSalesItems = res.data;
    populateCategoryFilter(cachedSalesItems);
    renderSalesItems(cachedSalesItems);
  } catch (err) {
    salesContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadMySalesItems() {
  try {
    const res = await apiRequest("/sales/my-listings");
    renderMySalesItems(res.data);
  } catch (err) {
    mySalesContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ── Form submit ── */
salesForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = salesForm.querySelector("button[type='submit']");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Publishing…`;

  try {
    let imageUrls = [];
    if (salesUploader && salesUploader.getFiles().length) {
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
    await loadSalesItems();
    await loadMySalesItems();
  } catch (err) {
    salesMessage.textContent = err.message;
    salesMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
  }
});

loadSalesItems();
loadMySalesItems();

/* ── Image uploader init ── */
const salesUploader = initImageUploader("salesUploadArea", "salesPreviewGrid");