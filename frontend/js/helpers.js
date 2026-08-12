/* ── helpers.js — shared UI utilities ── */

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const iconMap = { success: "ti-circle-check", error: "ti-circle-x", warning: "ti-alert-triangle" };
  const icon = iconMap[type] || "ti-info-circle";
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function emptyState(icon, title, subtitle = "") {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
      <h3>${title}</h3>
      ${subtitle ? `<p>${subtitle}</p>` : ""}
    </div>`;
}

function errorState(message) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="ti ti-alert-circle" aria-hidden="true"></i></div>
      <h3>Something went wrong</h3>
      <p>${message}</p>
    </div>`;
}

function avatarInitials(name = "") {
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function avatarHtml(photoUrl, name) {
  return photoUrl
    ? `<img src="${photoUrl}" alt="${name || "User"}" />`
    : avatarInitials(name);
}

function createWhatsAppLink(phoneNumber, itemTitle) {
  if (!phoneNumber) return "#";
  const clean = String(phoneNumber).replace(/[\s\-+]/g, "");
  const msg   = encodeURIComponent(`Hi, I saw your item "${itemTitle}" on Taskify and I am interested.`);
  return `https://wa.me/${clean}?text=${msg}`;
}

function requireAuth() {
  if (!localStorage.getItem("taskifyToken") || !localStorage.getItem("taskifyUser")) {
    window.location.href = "./login.html";
    return null;
  }
  return JSON.parse(localStorage.getItem("taskifyUser"));
}

function badge(label, variant = "") {
  return `<div class="badge ${variant}">${label}</div>`;
}

function sectionBadge(section) {
  const cls = section === "Academic" ? "" : "blue";
  return `<div class="badge ${cls}">${section}</div>`;
}

function conditionBadge(condition) {
  const map = { New: "", Excellent: "", Good: "blue", Fair: "gold", Used: "gold" };
  return `<div class="badge ${map[condition] ?? ""}">${condition}</div>`;
}

function statusBadge(status) {
  const map = {
    Posted: "blue", Accepted: "gold", "In Progress": "gold", "Awaiting Confirmation": "gold",
    Completed: "", Cancelled: "red", Available: "",
    Pending: "gold", Confirmed: "blue", Booked: "gold", Returned: ""
  };
  return `<div class="badge ${map[status] ?? ""}">${status}</div>`;
}

/* ─────────────────────────────────────────
   IMAGE UPLOADER
───────────────────────────────────────── */
function initImageUploader(uploadAreaId, previewGridId) {
  const uploadArea  = document.getElementById(uploadAreaId);
  const previewGrid = document.getElementById(previewGridId);
  if (!uploadArea || !previewGrid) return null;

  let selectedFiles = [];

  const fileInput = document.createElement("input");
  fileInput.type     = "file";
  fileInput.accept   = "image/jpeg,image/png,image/webp";
  fileInput.multiple = true;
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  uploadArea.addEventListener("click", () => fileInput.click());

  uploadArea.addEventListener("dragover", e => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", e => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener("change", () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });

  function handleFiles(newFiles) {
    const imageFiles = newFiles.filter(f =>
      ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type)
    );

    if (!imageFiles.length) {
      showToast("Only JPEG, PNG or WebP images are allowed.", "error");
      return;
    }

    const remaining = 5 - selectedFiles.length;

    if (remaining <= 0) {
      showToast("Maximum 5 images allowed.", "warning");
      return;
    }

    const toAdd = imageFiles.slice(0, remaining);

    if (imageFiles.length > remaining) {
      showToast(`Only ${remaining} more image(s) can be added.`, "warning");
    }

    selectedFiles = [...selectedFiles, ...toAdd];
    renderPreviews();
  }

  function renderPreviews() {
    previewGrid.innerHTML = "";

    selectedFiles.forEach((file, index) => {
      const reader = new FileReader();

      reader.onload = e => {
        const item = document.createElement("div");
        item.className = "upload-preview-item";
        item.innerHTML = `
          <img src="${e.target.result}" alt="Preview ${index + 1}" />
          <button type="button" class="upload-remove-btn" data-index="${index}" aria-label="Remove image">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>`;

        item.querySelector(".upload-remove-btn").addEventListener("click", () => {
          selectedFiles.splice(index, 1);
          renderPreviews();
        });

        previewGrid.appendChild(item);
      };

      reader.readAsDataURL(file);
    });

    uploadArea.classList.toggle("has-files", selectedFiles.length > 0);
    const counter = uploadArea.querySelector(".upload-counter");
    if (counter) counter.textContent = `${selectedFiles.length}/5 images`;
  }

  async function upload(folder = "general") {
    if (!selectedFiles.length) return [];

    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "upload-area-loading-overlay";
    loadingOverlay.innerHTML = `
      <i class="ti ti-loader" aria-hidden="true"></i>
      <span>Uploading ${selectedFiles.length} image${selectedFiles.length > 1 ? "s" : ""}…</span>`;
    uploadArea.appendChild(loadingOverlay);
    uploadArea.classList.add("uploading");

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append("images", file));

      const token = localStorage.getItem("taskifyToken");

      const response = await fetch(
        `${API_BASE_URL}/upload?folder=${folder}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Image upload failed.");
      }

      return data.data.urls;
    } finally {
      loadingOverlay.remove();
      uploadArea.classList.remove("uploading");
    }
  }

  function reset() {
    selectedFiles = [];
    previewGrid.innerHTML = "";
    uploadArea.classList.remove("has-files");
  }

  function getFiles() { return selectedFiles; }

  return { upload, reset, getFiles };
}

/* Render image gallery for detail pages. Unchanged — the lightbox hooks
   into this via the global click delegation at the bottom of this file,
   using #galleryMain and .image-gallery-thumb, so no markup changes were
   needed here. */
function renderImageGallery(imageUrls = [], fallbackIcon = "ti-image") {
  if (!imageUrls || !imageUrls.length) {
    return `
      <div class="market-image">
        <div class="market-image-placeholder">
          <i class="ti ${fallbackIcon}" aria-hidden="true"></i>
        </div>
      </div>`;
  }

  if (imageUrls.length === 1) {
    return `
      <div class="detail-image-single">
        <img src="${imageUrls[0]}" alt="Listing image" />
      </div>`;
  }

  return `
    <div class="image-gallery">
      <div class="image-gallery-main">
        <img src="${imageUrls[0]}" alt="Main image" id="galleryMain" />
      </div>
      <div class="image-gallery-thumbs">
        ${imageUrls.map((url, i) => `
          <div class="image-gallery-thumb ${i === 0 ? "active" : ""}"
               onclick="switchGalleryImage('${url}', this)">
            <img src="${url}" alt="Image ${i + 1}" />
          </div>`).join("")}
      </div>
    </div>`;
}

function switchGalleryImage(url, thumbEl) {
  const main = document.getElementById("galleryMain");
  if (main) main.src = url;
  document.querySelectorAll(".image-gallery-thumb").forEach(t => t.classList.remove("active"));
  thumbEl.classList.add("active");
}

/* ─────────────────────────────────────────
   REPORT MODAL
───────────────────────────────────────── */
let _reportModalReady = false;

function _ensureReportModal() {
  if (_reportModalReady) return;
  _reportModalReady = true;

  const overlay = document.createElement("div");
  overlay.id = "reportModalOverlay";
  overlay.className = "report-modal-overlay";

  const modal = document.createElement("div");
  modal.id = "reportModal";
  modal.className = "report-modal";
  modal.innerHTML = `
    <h2><i class="ti ti-flag" aria-hidden="true"></i> Report an Issue</h2>
    <p id="reportModalTarget" class="report-modal-target"></p>
    <form id="reportModalForm">
      <input type="hidden" id="reportModalUserId" />
      <input type="hidden" id="reportModalContextType" />
      <input type="hidden" id="reportModalContextId" />
      <div class="form-group">
        <label><i class="ti ti-message" aria-hidden="true"></i> What happened?</label>
        <textarea id="reportModalReason" placeholder="Describe the issue (at least 10 characters)..." required></textarea>
      </div>
      <div class="form-row">
        <button type="button" class="secondary-button" id="reportModalCancel">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel
        </button>
        <button type="submit" class="primary-button" style="background:var(--ump-red);">
          <i class="ti ti-flag" aria-hidden="true"></i> Submit Report
        </button>
      </div>
    </form>
    <p id="reportModalMessage" style="margin-top:12px;font-size:13px;font-weight:600;"></p>`;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  function close() {
    modal.classList.remove("open");
    overlay.classList.remove("open");
    document.getElementById("reportModalForm").reset();
    document.getElementById("reportModalMessage").textContent = "";
  }

  overlay.addEventListener("click", close);
  modal.querySelector("#reportModalCancel").addEventListener("click", close);

  modal.querySelector("#reportModalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason         = document.getElementById("reportModalReason").value.trim();
    const reportedUserId = document.getElementById("reportModalUserId").value;
    const contextType     = document.getElementById("reportModalContextType").value;
    const contextId        = document.getElementById("reportModalContextId").value;
    const messageEl         = document.getElementById("reportModalMessage");
    const submitBtn          = modal.querySelector("button[type='submit']");

    if (reason.length < 10) {
      messageEl.textContent = "Please provide at least 10 characters.";
      messageEl.style.color = "red";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Submitting…`;
    try {
      await apiRequest("/reports", "POST", {
        reportedUserId: Number(reportedUserId),
        contextType: contextType || undefined,
        contextId: contextId ? Number(contextId) : undefined,
        reason
      });
      showToast("Report submitted. Our team will review it.");
      close();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.style.color = "red";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="ti ti-flag" aria-hidden="true"></i> Submit Report`;
    }
  });
}

function openReportModal({ reportedUserId, reportedUserName = "this user", contextType = null, contextId = null, contextLabel = null }) {
  if (!reportedUserId) return;
  _ensureReportModal();
  document.getElementById("reportModalUserId").value    = reportedUserId;
  document.getElementById("reportModalContextType").value = contextType || "";
  document.getElementById("reportModalContextId").value    = contextId || "";
  document.getElementById("reportModalTarget").textContent = contextLabel
    ? `You're reporting ${reportedUserName} regarding "${contextLabel}". Reports are reviewed by an administrator.`
    : `You're reporting ${reportedUserName}. Reports are reviewed by an administrator.`;
  document.getElementById("reportModal").classList.add("open");
  document.getElementById("reportModalOverlay").classList.add("open");
}

/* ─────────────────────────────────────────
   PROFILE MODAL
───────────────────────────────────────── */
let _profileModalReady = false;

function _ensureProfileModal() {
  if (_profileModalReady) return;
  _profileModalReady = true;

  const overlay = document.createElement("div");
  overlay.id = "sharedProfileModalOverlay";
  overlay.className = "report-modal-overlay";

  const modal = document.createElement("div");
  modal.id = "sharedProfileModal";
  modal.className = "report-modal";
  modal.innerHTML = `
    <h2><i class="ti ti-user" aria-hidden="true"></i> User Profile</h2>
    <div id="sharedProfileModalContent"><p style="color:var(--muted);font-size:13px;">Loading…</p></div>
    <div class="form-row" style="margin-top:16px;">
      <button type="button" class="secondary-button" id="sharedProfileModalClose">
        <i class="ti ti-x" aria-hidden="true"></i> Close
      </button>
      <button type="button" class="primary-button" id="sharedProfileModalReport" style="background:var(--ump-red);">
        <i class="ti ti-flag" aria-hidden="true"></i> Report User
      </button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  function close() {
    modal.classList.remove("open");
    overlay.classList.remove("open");
  }

  overlay.addEventListener("click", close);
  modal.querySelector("#sharedProfileModalClose").addEventListener("click", close);
}

async function openUserProfileModal(userId, userName = "") {
  if (!userId) return;
  _ensureProfileModal();

  const modal     = document.getElementById("sharedProfileModal");
  const overlay    = document.getElementById("sharedProfileModalOverlay");
  const content     = document.getElementById("sharedProfileModalContent");
  const reportBtn    = document.getElementById("sharedProfileModalReport");

  modal.classList.add("open");
  overlay.classList.add("open");
  content.innerHTML = `<p style="color:var(--muted);font-size:13px;"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p>`;

  let me = null;
  try {
    const raw = localStorage.getItem("taskifyUser");
    me = raw ? JSON.parse(raw) : null;
  } catch (_) { /* ignore */ }

  const isSelf = me && Number(me.id) === Number(userId);
  reportBtn.style.display = isSelf ? "none" : "flex";
  reportBtn.onclick = () => {
    modal.classList.remove("open");
    overlay.classList.remove("open");
    openReportModal({ reportedUserId: userId, reportedUserName: userName || "this user" });
  };

  try {
    const res = await apiRequest(`/users/${userId}/profile`);
    const profile = res.data;
    const reviews = profile.recent_reviews.length
      ? profile.recent_reviews.map(r => `
          <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:600;">${r.reviewer_name}</span>
              <div class="badge"><i class="ti ti-star" aria-hidden="true"></i> ${r.rating}/5</div>
            </div>
            <p style="font-size:13px;color:var(--muted);">${r.comment || "No comment provided."}</p>
          </div>`).join("")
      : `<p style="color:var(--muted);font-size:13px;">No reviews yet.</p>`;

    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div class="market-avatar" style="width:48px;height:48px;font-size:16px;">${avatarHtml(profile.profilePhoto, profile.full_name)}</div>
        <div>
          <div style="font-weight:700;font-size:15px;">${profile.full_name}</div>
          <div style="font-size:12px;color:var(--muted);">${profile.email}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
        <div style="text-align:center;background:var(--background);border-radius:var(--radius);padding:12px;">
          <div style="font-size:18px;font-weight:800;color:var(--ump-green);">${Number(profile.rating_average || 0).toFixed(1)}</div>
          <div style="font-size:11px;color:var(--muted);">Rating</div>
        </div>
        <div style="text-align:center;background:var(--background);border-radius:var(--radius);padding:12px;">
          <div style="font-size:18px;font-weight:800;">${profile.total_reviews}</div>
          <div style="font-size:11px;color:var(--muted);">Reviews</div>
        </div>
        <div style="text-align:center;background:var(--background);border-radius:var(--radius);padding:12px;">
          <div style="font-size:18px;font-weight:800;">${profile.completed_tasks}</div>
          <div style="font-size:11px;color:var(--muted);">Tasks</div>
        </div>
      </div>
      <div class="market-tags" style="margin-bottom:14px;">
        <div class="badge"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified</div>
        <div class="badge blue">${profile.member_type || profile.role}</div>
        ${profile.faculty ? `<div class="badge navy">${profile.faculty}</div>` : ""}
      </div>
      <h4 style="font-size:13px;font-weight:700;margin-bottom:6px;">Recent Reviews</h4>
      ${reviews}`;
  } catch (err) {
    content.innerHTML = errorState(err.message);
  }
}

function attachProfileLinkEvents(root = document) {
  root.querySelectorAll(".profile-link").forEach(link => {
    link.addEventListener("click", () => openUserProfileModal(link.dataset.userId, link.dataset.userName));
  });
}

/* ─────────────────────────────────────────
   IMAGE LIGHTBOX — full-size view with zoom/pan/navigation.
   Built once, reused everywhere via openImageLightbox(urls, startIndex).
   Wired in globally at the bottom of this file via click delegation, so
   no page-specific code is needed to make galleries/avatars clickable.
───────────────────────────────────────── */
let _lightboxReady = false;

function _ensureImageLightbox() {
  if (_lightboxReady) return;
  _lightboxReady = true;

  const overlay = document.createElement("div");
  overlay.id = "imageLightboxOverlay";
  overlay.className = "image-lightbox-overlay";
  overlay.innerHTML = `
    <button type="button" class="image-lightbox-close" id="imageLightboxClose" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
    <button type="button" class="image-lightbox-nav prev" id="imageLightboxPrev" aria-label="Previous image"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
    <div class="image-lightbox-stage" id="imageLightboxStage">
      <img id="imageLightboxImg" alt="Full size image" draggable="false" />
    </div>
    <button type="button" class="image-lightbox-nav next" id="imageLightboxNext" aria-label="Next image"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    <div class="image-lightbox-controls">
      <button type="button" id="imageLightboxZoomOut" aria-label="Zoom out"><i class="ti ti-zoom-out" aria-hidden="true"></i></button>
      <span id="imageLightboxZoomLevel">100%</span>
      <button type="button" id="imageLightboxZoomIn" aria-label="Zoom in"><i class="ti ti-zoom-in" aria-hidden="true"></i></button>
      <button type="button" id="imageLightboxReset" aria-label="Reset zoom"><i class="ti ti-refresh" aria-hidden="true"></i></button>
    </div>
    <div class="image-lightbox-counter" id="imageLightboxCounter"></div>`;
  document.body.appendChild(overlay);

  const stage       = overlay.querySelector("#imageLightboxStage");
  const imgEl       = overlay.querySelector("#imageLightboxImg");
  const zoomLevelEl = overlay.querySelector("#imageLightboxZoomLevel");
  const counterEl   = overlay.querySelector("#imageLightboxCounter");
  const prevBtn     = overlay.querySelector("#imageLightboxPrev");
  const nextBtn     = overlay.querySelector("#imageLightboxNext");

  let urls = [];
  let index = 0;
  let scale = 1;
  let panX = 0, panY = 0;
  let dragging = false;
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  function applyTransform() {
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
  }

  function clampPan() {
    if (scale <= 1) { panX = 0; panY = 0; return; }
    const rect = stage.getBoundingClientRect();
    const maxPanX = (rect.width * (scale - 1)) / 2;
    const maxPanY = (rect.height * (scale - 1)) / 2;
    panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
    panY = Math.min(maxPanY, Math.max(-maxPanY, panY));
  }

  function showIndex(i) {
    index = ((i % urls.length) + urls.length) % urls.length;
    imgEl.src = urls[index];
    scale = 1; panX = 0; panY = 0;
    applyTransform();
    const multi = urls.length > 1;
    counterEl.textContent = multi ? `${index + 1} / ${urls.length}` : "";
    prevBtn.style.display = multi ? "flex" : "none";
    nextBtn.style.display = multi ? "flex" : "none";
  }

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  overlay.querySelector("#imageLightboxClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") showIndex(index - 1);
    if (e.key === "ArrowRight") showIndex(index + 1);
  });

  prevBtn.addEventListener("click", () => showIndex(index - 1));
  nextBtn.addEventListener("click", () => showIndex(index + 1));

  overlay.querySelector("#imageLightboxZoomIn").addEventListener("click", () => { scale = Math.min(4, scale + 0.5); clampPan(); applyTransform(); });
  overlay.querySelector("#imageLightboxZoomOut").addEventListener("click", () => { scale = Math.max(1, scale - 0.5); clampPan(); applyTransform(); });
  overlay.querySelector("#imageLightboxReset").addEventListener("click", () => { scale = 1; panX = 0; panY = 0; applyTransform(); });

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    scale = Math.min(4, Math.max(1, scale + (e.deltaY > 0 ? -0.2 : 0.2)));
    clampPan();
    applyTransform();
  }, { passive: false });

  imgEl.addEventListener("dblclick", () => {
    scale = scale > 1 ? 1 : 2;
    panX = 0; panY = 0;
    clampPan();
    applyTransform();
  });

  function startDrag(x, y) {
    if (scale <= 1) return;
    dragging = true;
    dragStartX = x; dragStartY = y;
    panStartX = panX; panStartY = panY;
  }
  function moveDrag(x, y) {
    if (!dragging) return;
    panX = panStartX + (x - dragStartX);
    panY = panStartY + (y - dragStartY);
    clampPan();
    applyTransform();
  }
  function endDrag() { dragging = false; }

  stage.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener("mouseup", endDrag);
  stage.addEventListener("touchstart", (e) => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  stage.addEventListener("touchmove", (e) => { if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  stage.addEventListener("touchend", endDrag);

  overlay._show = (list, startIndex) => {
    urls = list;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    showIndex(startIndex || 0);
  };
}

function openImageLightbox(urls, startIndex = 0) {
  if (!urls || !urls.length) return;
  _ensureImageLightbox();
  document.getElementById("imageLightboxOverlay")._show(urls, startIndex);
}

/* Global delegation: makes gallery main images, single detail images,
   card thumbnails, and avatars clickable everywhere without touching
   every card-building function. Gallery thumbnails keep their existing
   switchGalleryImage() behavior instead of opening the lightbox, since
   their job is to change which photo is "main". */
document.addEventListener("click", (event) => {
  const img = event.target.closest("img");
  if (!img) return;
  if (img.closest(".upload-preview-item") || img.closest(".image-cropper-stage") || img.closest(".nav-avatar")) return;

  const isMainGallery  = img.id === "galleryMain";
  const isSingleDetail = !!img.closest(".detail-image-single");
  const isCardThumb    = !!img.closest(".market-image");
  const isAvatar        = !!img.closest(".market-avatar") || !!img.closest(".profile-avatar-large");

  if (!isMainGallery && !isSingleDetail && !isCardThumb && !isAvatar) return;

  event.preventDefault();

  const galleryContainer = img.closest(".image-gallery");
  let urls;
  let startIndex = 0;
  if (galleryContainer) {
    urls = Array.from(galleryContainer.querySelectorAll(".image-gallery-thumb img")).map(t => t.src);
    startIndex = Math.max(0, urls.indexOf(img.src));
  } else {
    urls = [img.src];
  }
  openImageLightbox(urls, startIndex);
});

/* ─────────────────────────────────────────
   IMAGE CROPPER — used for profile-photo uploads (register + profile
   page). Drag to reposition, slider to zoom, crops to a square. Returns
   a Promise<Blob|null> — null if the person cancels.
───────────────────────────────────────── */
let _cropperReady = false;

function _ensureImageCropper() {
  if (_cropperReady) return;
  _cropperReady = true;

  const overlay = document.createElement("div");
  overlay.id = "imageCropperOverlay";
  overlay.className = "image-cropper-overlay";
  overlay.innerHTML = `
    <div class="image-cropper-modal">
      <h2><i class="ti ti-crop" aria-hidden="true"></i> Adjust Photo</h2>
      <div class="image-cropper-stage" id="imageCropperStage">
        <img id="imageCropperImg" alt="Crop preview" draggable="false" />
      </div>
      <div class="image-cropper-zoom-row">
        <i class="ti ti-photo" aria-hidden="true" style="font-size:13px;"></i>
        <input type="range" id="imageCropperZoom" min="100" max="300" value="100" />
        <i class="ti ti-photo" aria-hidden="true" style="font-size:20px;"></i>
      </div>
      <p style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px;">Drag to reposition · Use the slider to zoom</p>
      <div class="form-row">
        <button type="button" class="secondary-button" id="imageCropperSkip"><i class="ti ti-x" aria-hidden="true"></i> Cancel</button>
        <button type="button" class="primary-button" id="imageCropperApply"><i class="ti ti-check" aria-hidden="true"></i> Use Photo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function openImageCropper(file, { aspect = 1 } = {}) {
  return new Promise((resolve) => {
    _ensureImageCropper();

    const overlay   = document.getElementById("imageCropperOverlay");
    const stage      = document.getElementById("imageCropperStage");
    const imgEl       = document.getElementById("imageCropperImg");
    const zoomInput    = document.getElementById("imageCropperZoom");
    const applyBtn       = document.getElementById("imageCropperApply");
    const skipBtn          = document.getElementById("imageCropperSkip");

    stage.style.aspectRatio = String(aspect);

    const objectUrl = URL.createObjectURL(file);
    let naturalW = 0, naturalH = 0;
    let baseScale = 1, zoomFactor = 1;
    let offsetX = 0, offsetY = 0;
    let dragging = false, dragStartX = 0, dragStartY = 0, startOffsetX = 0, startOffsetY = 0;

    function stageSize() {
      const rect = stage.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    }

    function applyTransform() {
      const totalScale = baseScale * zoomFactor;
      imgEl.style.width  = `${naturalW * totalScale}px`;
      imgEl.style.height = `${naturalH * totalScale}px`;
      imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    function clampOffset() {
      const { w, h } = stageSize();
      const totalScale = baseScale * zoomFactor;
      const dispW = naturalW * totalScale;
      const dispH = naturalH * totalScale;
      offsetX = Math.min(0, Math.max(w - dispW, offsetX));
      offsetY = Math.min(0, Math.max(h - dispH, offsetY));
    }

    function onLoad() {
      naturalW = imgEl.naturalWidth;
      naturalH = imgEl.naturalHeight;
      const { w, h } = stageSize();
      baseScale = Math.max(w / naturalW, h / naturalH);
      zoomFactor = 1;
      zoomInput.value = 100;
      offsetX = (w - naturalW * baseScale) / 2;
      offsetY = (h - naturalH * baseScale) / 2;
      applyTransform();
    }

    imgEl.onload = onLoad;
    imgEl.src = objectUrl;

    function onZoomInput() {
      zoomFactor = Number(zoomInput.value) / 100;
      clampOffset();
      applyTransform();
    }
    zoomInput.addEventListener("input", onZoomInput);

    function startDrag(x, y) {
      dragging = true;
      dragStartX = x; dragStartY = y;
      startOffsetX = offsetX; startOffsetY = offsetY;
    }
    function moveDrag(x, y) {
      if (!dragging) return;
      offsetX = startOffsetX + (x - dragStartX);
      offsetY = startOffsetY + (y - dragStartY);
      clampOffset();
      applyTransform();
    }
    function endDrag() { dragging = false; }

    stage.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener("mouseup", endDrag);
    stage.addEventListener("touchstart", (e) => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    stage.addEventListener("touchmove", (e) => { if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    stage.addEventListener("touchend", endDrag);

    function cleanup() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      zoomInput.removeEventListener("input", onZoomInput);
      window.removeEventListener("mousemove", moveDrag);
      window.removeEventListener("mouseup", endDrag);
      URL.revokeObjectURL(objectUrl);
      applyBtn.onclick = null;
      skipBtn.onclick = null;
    }

    skipBtn.onclick = () => { cleanup(); resolve(null); };

    applyBtn.onclick = () => {
      const { w, h } = stageSize();
      const totalScale = baseScale * zoomFactor;
      const sx = -offsetX / totalScale;
      const sy = -offsetY / totalScale;
      const sWidth  = w / totalScale;
      const sHeight = h / totalScale;

      const outW = Math.round(Math.min(1200, w * 2));
      const outH = Math.round(outW / aspect);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

      canvas.toBlob((blob) => {
        cleanup();
        resolve(blob);
      }, "image/jpeg", 0.92);
    };

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  });
}