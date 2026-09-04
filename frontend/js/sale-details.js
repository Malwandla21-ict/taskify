const currentUser          = requireAuth();
const saleDetailsContainer = document.getElementById("saleDetailsContainer");

const params = new URLSearchParams(window.location.search);
const saleId = params.get("id");

document.getElementById("backButton")?.addEventListener("click", () => goBack("./sales.html"));

async function loadSaleDetails() {
  try {
    const res = await apiRequest(`/sales/${saleId}`);
    renderSaleDetails(res.data);
  } catch (err) {
    saleDetailsContainer.innerHTML = errorState(err.message || "This item is no longer available.");
    showToast(err.message, "error");
  }
}

function renderSaleDetails(item) {
  const isOwn = Number(item.seller_id) === Number(currentUser.id);

  const actionArea = isOwn
    ? `<div class="badge navy"><i class="ti ti-user" aria-hidden="true"></i> Your item</div>`
    : item.status !== "Available"
      ? `<div class="badge gold"><i class="ti ti-lock" aria-hidden="true"></i> Already sold</div>`
      : `<button class="primary-button" id="messageSellerButton">
           <i class="ti ti-message-circle" aria-hidden="true"></i> Message Seller
         </button>`;

  saleDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        <div style="position:relative;">
          ${renderImageGallery(item.image_urls, "ti-shopping-bag")}
          ${endorsementCornerBadge(item)}
          ${lecturerPostedCornerBadge(item.seller_member_type)}
        </div>
        ${sectionBadge(item.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${item.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${item.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${item.category}</div>
          ${conditionBadge(item.condition_status)}
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}</div>
          ${statusBadge(item.status)}
        </div>
        ${endorsementDetailBlock(item)}
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Item Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;background:rgba(245,180,0,0.14);color:#b38900;">${avatarHtml(item.seller_name, item.seller_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${item.seller_id}" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(item.seller_name, item.seller_lecturer_title)}</div>
            <div style="font-size:11px;color:var(--muted);">Student Seller</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Condition</div>
          ${conditionBadge(item.condition_status)}
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Location</div>
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-map-pin" aria-hidden="true"></i> ${item.location}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Price</div>
          <div class="market-price">R${item.price}</div>
        </div>
        ${actionArea}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Sales
        </button>
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./sales.html"));

  attachProfileLinkEvents();

  document.getElementById("messageSellerButton")?.addEventListener("click", (e) => {
    startConversationAndRedirect("sale", saleId, e.currentTarget);
  });
}

loadSaleDetails();