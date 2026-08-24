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

/*
  Single source of truth for avatar rendering. If a real photo URL exists,
  returns a clickable <img class="lightbox-img"> so it's viewable in the
  global lightbox — UNLESS options.lightbox is explicitly false (used by
  the navbar avatar). Otherwise returns plain initials text.
*/
function avatarHtml(name = "", photoUrl = null, options = {}) {
  const { lightbox = true } = options;

  if (photoUrl && typeof photoUrl === "string" && photoUrl.trim()) {
    if (!lightbox) {
      return `<img src="${photoUrl}" alt="${name || "User"}" />`;
    }
    const gallery = `avatar-${Math.random().toString(36).slice(2, 9)}`;
    return `<img src="${photoUrl}" alt="${name || "User"}" class="lightbox-img" data-gallery="${gallery}" data-full="${photoUrl}" />`;
  }
  return avatarInitials(name);
}

function requireAuth() {
  if (!localStorage.getItem("taskifyToken") || !localStorage.getItem("taskifyUser")) {
    window.location.href = "./login.html";
    return null;
  }
  return JSON.parse(localStorage.getItem("taskifyUser"));
}

/* Returns the correct "my profile" page for the logged-in account's
   member_type, used by the navbar avatar link and by profile pages that
   need to bounce a lecturer/student to the right place. */
function myProfileUrl(user) {
  return user?.member_type === "Lecturer" ? "./lecturer-profile.html" : "./profile.html";
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
    Posted: "blue", Accepted: "gold", "In Progress": "gold",
    Completed: "", Cancelled: "red", Available: "", Booked: "gold", Returned: "",
    Upcoming: "blue"
  };
  return `<div class="badge ${map[status] ?? ""}">${status}</div>`;
}

/* Renders the "Recommended by Dr. X" tag on a sales/equipment listing,
   fed by the real lecturer_endorsements join done server-side. Returns
   an empty string (no badge) if the item isn't endorsed. */
function endorsementBadge(item) {
  if (!item || !item.endorsed_by_lecturer_name) return "";
  const title = item.endorsed_by_lecturer_title ? `${item.endorsed_by_lecturer_title} ` : "";
  return `<div class="market-tag" style="background:rgba(108,61,255,0.10);color:#6c3dff;">
            <i class="ti ti-certificate" aria-hidden="true"></i> Recommended by ${title}${item.endorsed_by_lecturer_name}
          </div>`;
}

async function startConversationAndRedirect(contextType, contextId, triggerBtn = null) {
  let originalHtml = null;
  if (triggerBtn) {
    originalHtml = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Opening chat…`;
  }
  try {
    const res = await apiRequest("/conversations/start", "POST", { contextType, contextId: Number(contextId) });
    window.location.href = `./conversation.html?id=${res.data.id}`;
  } catch (err) {
    showToast(err.message, "error");
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalHtml;
    }
  }
}

function openModal(modal) {
  if (!modal) return;
  modal.style.display = "block";
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.display = "block";
}

function closeModal(modal, form, msgEl) {
  if (modal) modal.style.display = "none";
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.display = "none";
  if (form) form.reset();
  if (msgEl) msgEl.textContent = "";
}

/* ── Shared "view user profile" modal — now identity-aware. Shows lecturer
   badge/expertise for lecturers, endorsements-received for students. ── */
async function loadUserProfile(userId) {
  const profileModal   = document.getElementById("profileModal");
  const profileContent = document.getElementById("profileContent");
  if (!profileModal || !profileContent) return;

  profileContent.innerHTML = `<p style="color:var(--muted);font-size:13px;"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p>`;
  openModal(profileModal);

  try {
    const res     = await apiRequest(`/users/${userId}/profile`);
    const profile = res.data;
    const isLecturer = profile.member_type === "Lecturer";

    const reviews = profile.recent_reviews.length
      ? profile.recent_reviews.slice(0, 3).map(r => `
          <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:600;">${r.reviewer_name}</span>
              <div class="badge"><i class="ti ti-star" aria-hidden="true"></i> ${r.rating}/5</div>
            </div>
            <p style="font-size:13px;color:var(--muted);">${r.comment || "No comment provided."}</p>
          </div>`).join("")
      : `<p style="color:var(--muted);font-size:13px;">No reviews yet.</p>`;

    const lecturerBlock = isLecturer ? `
      <div class="market-tags" style="margin-bottom:14px;">
        <div class="lecturer-title-badge"><i class="ti ti-chalkboard" aria-hidden="true"></i> ${profile.lecturer_title || ""} Verified Lecturer</div>
      </div>
      ${profile.skills?.length ? `
        <div style="margin-bottom:14px;">
          <h4 style="font-size:12px;font-weight:700;margin-bottom:6px;">Expertise</h4>
          <div class="market-tags">${profile.skills.map(s => `<div class="market-tag">${s}</div>`).join("")}</div>
        </div>` : ""}
      ${profile.lecturer_stats ? `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
          <div style="text-align:center;background:var(--background);border-radius:var(--radius);padding:12px;">
            <div style="font-size:18px;font-weight:800;">${profile.lecturer_stats.endorsementsGiven}</div>
            <div style="font-size:11px;color:var(--muted);">Endorsements Given</div>
          </div>
          <div style="text-align:center;background:var(--background);border-radius:var(--radius);padding:12px;">
            <div style="font-size:18px;font-weight:800;">${profile.lecturer_stats.studentsEndorsed}</div>
            <div style="font-size:11px;color:var(--muted);">Students Endorsed</div>
          </div>
        </div>` : ""}
    ` : "";

    const endorsementsBlock = (!isLecturer && profile.endorsements_received?.length) ? `
      <div style="margin-bottom:14px;">
        <h4 style="font-size:12px;font-weight:700;margin-bottom:6px;">Lecturer Endorsements</h4>
        ${profile.endorsements_received.slice(0, 3).map(e => `
          <div class="endorsement-badge ${e.endorsement_type.toLowerCase()}" style="margin:0 6px 6px 0;">
            <i class="ti ti-certificate" aria-hidden="true"></i> ${e.endorsement_type} — ${e.lecturer_title || ""} ${e.lecturer_name}
          </div>`).join("")}
      </div>` : "";

    profileContent.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div class="market-avatar" style="width:48px;height:48px;font-size:16px;">${avatarHtml(profile.full_name, profile.profilePhoto)}</div>
        <div>
          <div style="font-weight:700;font-size:15px;">${profile.lecturer_title ? profile.lecturer_title + " " : ""}${profile.full_name}</div>
          <div style="font-size:12px;color:var(--muted);">${profile.email}</div>
        </div>
      </div>
      ${lecturerBlock}
      ${!isLecturer ? `
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
          <div style="font-size:18px;font-weight:800;">${profile.stats?.tasks_posted ?? 0}</div>
          <div style="font-size:11px;color:var(--muted);">Tasks Posted</div>
        </div>
      </div>` : ""}
      ${endorsementsBlock}
      <div class="market-tags" style="margin-bottom:14px;">
        <div class="badge"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified</div>
        <div class="badge blue">${profile.member_type || "Student"}</div>
        ${profile.role === "admin" ? `<div class="badge navy"><i class="ti ti-shield-lock" aria-hidden="true"></i> Admin</div>` : ""}
      </div>
      <div style="background:var(--background);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Student/Staff No.</span><strong>${profile.student_number || "Not provided"}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Faculty</span><strong>${profile.faculty || "Not provided"}</strong></div>
        ${profile.member_type === "Student" ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Academic Year</span><strong>${profile.academic_year || "Not provided"}</strong></div>` : ""}
      </div>
      ${!isLecturer ? `<h4 style="font-size:13px;font-weight:700;margin-bottom:6px;">Recent Reviews</h4>${reviews}` : ""}`;
  } catch (err) {
    profileContent.innerHTML = errorState(err.message);
  }
}

function openUserProfileModal(userId) {
  loadUserProfile(userId);
}

function attachProfileLinkEvents() {
  document.querySelectorAll(".profile-link").forEach(link => {
    if (link.dataset.profileBound) return;
    link.dataset.profileBound = "1";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadUserProfile(link.dataset.userId);
    });
  });

  const closeBtn     = document.getElementById("closeProfileModal");
  const profileModal = document.getElementById("profileModal");
  const overlayEl    = document.getElementById("overlay");

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", () => closeModal(profileModal, null, null));
  }
  if (overlayEl && !overlayEl.dataset.profileBound) {
    overlayEl.dataset.profileBound = "1";
    overlayEl.addEventListener("click", () => closeModal(profileModal, null, null));
  }
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
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append("images", file));
    const token = localStorage.getItem("taskifyToken");

    const overlay = document.createElement("div");
    overlay.className = "upload-area-loading-overlay";
    const count = selectedFiles.length;
    overlay.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i><span>Uploading ${count} image${count > 1 ? "s" : ""}…</span>`;
    uploadArea.classList.add("uploading");
    uploadArea.appendChild(overlay);

    try {
      const response = await fetch(
        `${API_BASE_URL}/upload?folder=${folder}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Image upload failed.");
      return data.data.urls;
    } finally {
      uploadArea.classList.remove("uploading");
      overlay.remove();
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

/* Render image gallery for detail pages */
function renderImageGallery(imageUrls = [], fallbackIcon = "ti-image") {
  if (!imageUrls || !imageUrls.length) {
    return `
      <div class="market-image">
        <div class="market-image-placeholder">
          <i class="ti ${fallbackIcon}" aria-hidden="true"></i>
        </div>
      </div>`;
  }

  const galleryId = `gallery-${Math.random().toString(36).slice(2, 9)}`;

  if (imageUrls.length === 1) {
    return `
      <div class="detail-image-single">
        <img src="${imageUrls[0]}" alt="Listing image" class="lightbox-img" data-gallery="${galleryId}" data-full="${imageUrls[0]}" />
      </div>`;
  }

  return `
    <div class="image-gallery">
      <div class="image-gallery-main">
        <img src="${imageUrls[0]}" alt="Main image" id="galleryMain" class="lightbox-img" data-gallery="${galleryId}" data-full="${imageUrls[0]}" />
      </div>
      <div class="image-gallery-thumbs">
        ${imageUrls.map((url, i) => `
          <div class="image-gallery-thumb ${i === 0 ? "active" : ""}"
               onclick="switchGalleryImage('${url}', this)">
            <img src="${url}" alt="Image ${i + 1}" class="lightbox-img" data-gallery="${galleryId}" data-full="${url}" />
          </div>`).join("")}
      </div>
    </div>`;
}

function switchGalleryImage(url, thumbEl) {
  const main = document.getElementById("galleryMain");
  if (main) { main.src = url; main.dataset.full = url; }
  document.querySelectorAll(".image-gallery-thumb").forEach(t => t.classList.remove("active"));
  thumbEl.classList.add("active");
}

/* ── Global Image Lightbox ── */
(function setupLightbox() {
  let currentGroup = [];
  let currentIndex = 0;
  let zoomLevel = 1;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let imgOffset = { x: 0, y: 0 };

  const style = document.createElement("style");
  style.textContent = `
    .taskify-lightbox-overlay {
      position: fixed; inset: 0; background: rgba(6,19,51,0.92);
      z-index: 5000; display: none; align-items: center; justify-content: center;
      flex-direction: column;
    }
    .taskify-lightbox-overlay.open { display: flex; }
    .taskify-lightbox-stage {
      position: relative; width: 100%; height: calc(100% - 70px);
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; cursor: grab;
    }
    .taskify-lightbox-stage.dragging { cursor: grabbing; }
    .taskify-lightbox-stage img {
      max-width: 90%; max-height: 90%; user-select: none;
      transition: transform 0.05s linear; border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .taskify-lightbox-bar {
      height: 70px; width: 100%; display: flex; align-items: center;
      justify-content: center; gap: 10px; flex-shrink: 0;
    }
    .taskify-lightbox-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.12); color: white; font-size: 17px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .taskify-lightbox-btn:hover { background: rgba(255,255,255,0.22); }
    .taskify-lightbox-close {
      position: absolute; top: 18px; right: 22px; width: 40px; height: 40px;
      border-radius: 50%; border: none; background: rgba(255,255,255,0.12);
      color: white; font-size: 18px; cursor: pointer; z-index: 5001;
    }
    .taskify-lightbox-close:hover { background: rgba(255,255,255,0.22); }
    .taskify-lightbox-counter {
      position: absolute; top: 24px; left: 24px; color: rgba(255,255,255,0.75);
      font-size: 13px; font-weight: 600; z-index: 5001;
    }
    img.lightbox-img { cursor: zoom-in; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "taskify-lightbox-overlay";
  overlay.innerHTML = `
    <span class="taskify-lightbox-counter" id="lightboxCounter"></span>
    <button class="taskify-lightbox-close" id="lightboxClose" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
    <div class="taskify-lightbox-stage" id="lightboxStage">
      <img id="lightboxImage" src="" alt="Full size image" />
    </div>
    <div class="taskify-lightbox-bar">
      <button class="taskify-lightbox-btn" id="lightboxPrev" aria-label="Previous image"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
      <button class="taskify-lightbox-btn" id="lightboxZoomOut" aria-label="Zoom out"><i class="ti ti-zoom-out" aria-hidden="true"></i></button>
      <button class="taskify-lightbox-btn" id="lightboxZoomReset" aria-label="Reset zoom"><i class="ti ti-focus-2" aria-hidden="true"></i></button>
      <button class="taskify-lightbox-btn" id="lightboxZoomIn" aria-label="Zoom in"><i class="ti ti-zoom-in" aria-hidden="true"></i></button>
      <button class="taskify-lightbox-btn" id="lightboxNext" aria-label="Next image"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    </div>`;
  document.body.appendChild(overlay);

  const stage   = overlay.querySelector("#lightboxStage");
  const imageEl = overlay.querySelector("#lightboxImage");
  const counter = overlay.querySelector("#lightboxCounter");

  function applyTransform() {
    imageEl.style.transform = `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${zoomLevel})`;
  }

  function showIndex(i) {
    if (!currentGroup.length) return;
    currentIndex = (i + currentGroup.length) % currentGroup.length;
    imageEl.src = currentGroup[currentIndex];
    zoomLevel = 1;
    imgOffset = { x: 0, y: 0 };
    applyTransform();
    counter.textContent = currentGroup.length > 1 ? `${currentIndex + 1} / ${currentGroup.length}` : "";
  }

  function openLightbox(urls, startIndex = 0) {
    currentGroup = urls.filter(Boolean);
    if (!currentGroup.length) return;
    overlay.classList.add("open");
    showIndex(startIndex);
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  overlay.querySelector("#lightboxClose").addEventListener("click", closeLightbox);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeLightbox(); });
  overlay.querySelector("#lightboxPrev").addEventListener("click", () => showIndex(currentIndex - 1));
  overlay.querySelector("#lightboxNext").addEventListener("click", () => showIndex(currentIndex + 1));
  overlay.querySelector("#lightboxZoomIn").addEventListener("click", () => { zoomLevel = Math.min(zoomLevel + 0.4, 4); applyTransform(); });
  overlay.querySelector("#lightboxZoomOut").addEventListener("click", () => { zoomLevel = Math.max(zoomLevel - 0.4, 1); applyTransform(); });
  overlay.querySelector("#lightboxZoomReset").addEventListener("click", () => { zoomLevel = 1; imgOffset = { x: 0, y: 0 }; applyTransform(); });

  stage.addEventListener("wheel", (e) => {
    if (!overlay.classList.contains("open")) return;
    e.preventDefault();
    zoomLevel = Math.min(Math.max(zoomLevel + (e.deltaY < 0 ? 0.2 : -0.2), 1), 4);
    applyTransform();
  }, { passive: false });

  stage.addEventListener("mousedown", (e) => {
    if (zoomLevel <= 1) return;
    dragging = true;
    stage.classList.add("dragging");
    dragStart = { x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    imgOffset = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    applyTransform();
  });
  window.addEventListener("mouseup", () => { dragging = false; stage.classList.remove("dragging"); });

  window.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showIndex(currentIndex - 1);
    if (e.key === "ArrowRight") showIndex(currentIndex + 1);
  });

  document.addEventListener("click", (e) => {
    const img = e.target.closest("img.lightbox-img");
    if (!img) return;
    const groupAttr = img.dataset.gallery;
    let urls;
    if (groupAttr) {
      urls = Array.from(document.querySelectorAll(`img.lightbox-img[data-gallery="${groupAttr}"]`))
        .map(el => el.dataset.full || el.src);
      const startIndex = Math.max(urls.indexOf(img.dataset.full || img.src), 0);
      openLightbox(urls, startIndex);
    } else {
      openLightbox([img.dataset.full || img.src], 0);
    }
  });

  window.openLightbox = openLightbox;
})();