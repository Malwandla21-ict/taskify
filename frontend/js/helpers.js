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
    Posted: "blue", Accepted: "gold", "In Progress": "gold",
    Completed: "", Cancelled: "red", Available: "", Booked: "gold", Returned: ""
  };
  return `<div class="badge ${map[status] ?? ""}">${status}</div>`;
}

/* ── Start (or resume) a Taskify conversation about a listing and
   navigate straight to the thread. Used across task/equipment/sale
   detail pages in place of the old WhatsApp handoff, so every
   negotiation stays on-platform and visible to admins. ── */
async function startConversationAndRedirect(contextType, contextId) {
  try {
    const res = await apiRequest("/conversations/start", "POST", { contextType, contextId: Number(contextId) });
    window.location.href = `./conversation.html?id=${res.data.id}`;
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ─────────────────────────────────────────
   IMAGE UPLOADER
   Usage:
     const uploader = initImageUploader("uploadArea", "previewGrid");
     const urls = await uploader.upload("tasks");
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

    const response = await fetch(
      `http://127.0.0.1:5000/api/upload?folder=${folder}`,
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