const currentUser = requireAuth();

const tasksContainer            = document.getElementById("tasksContainer");
const historyContainer          = document.getElementById("historyContainer");
const taskHistoryMiniContainer  = document.getElementById("taskHistoryMiniContainer");
const taskForm                  = document.getElementById("taskForm");
const taskMessage               = document.getElementById("taskMessage");

const taskStep1        = document.getElementById("taskStep1");
const taskStep2        = document.getElementById("taskStep2");
const taskStep3        = document.getElementById("taskStep3");
const taskStepText     = document.getElementById("taskStepText");
const taskProgressFill = document.getElementById("taskProgressFill");
const taskPreview      = document.getElementById("taskPreview");
const tDot1            = document.getElementById("tDot1");
const tDot2            = document.getElementById("tDot2");
const tDot3            = document.getElementById("tDot3");

const nextTaskStep2    = document.getElementById("nextTaskStep2");
const nextTaskStep3    = document.getElementById("nextTaskStep3");
const backTaskStep1    = document.getElementById("backTaskStep1");
const backTaskStep2    = document.getElementById("backTaskStep2");

const reviewModal            = document.getElementById("reviewModal");
const reviewForm             = document.getElementById("reviewForm");
const reviewTaskIdInput      = document.getElementById("reviewTaskId");
const ratingInput            = document.getElementById("rating");
const commentInput           = document.getElementById("comment");
const closeReviewModalButton = document.getElementById("closeReviewModal");
const reviewMessage          = document.getElementById("reviewMessage");

const taskSearchInput    = document.getElementById("taskSearchInput");
const taskCategoryFilter = document.getElementById("taskCategoryFilter");
const taskPriceFilter    = document.getElementById("taskPriceFilter");
const taskSortSelect     = document.getElementById("taskSortSelect");

let cachedTasks     = [];
let selectedSection = "All";

closeReviewModalButton?.addEventListener("click", () => closeModal(reviewModal, reviewForm, reviewMessage));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(reviewModal, reviewForm, reviewMessage));

const taskCreateOverlay    = document.getElementById("taskCreateOverlay");
const taskCreateModal      = document.getElementById("taskCreateModal");
const openTaskModalButton  = document.getElementById("openTaskModalButton");
const heroCreateTaskButton = document.getElementById("heroCreateTaskButton");
const closeTaskModalButton = document.getElementById("closeTaskModalButton");

function openTaskCreateModal() {
  taskForm?.reset();
  taskMessage.textContent = "";
  showTaskStep(1);
  if (taskUploader) taskUploader.reset();
  taskCreateOverlay?.classList.add("open");
  taskCreateModal?.classList.add("open");
}

function closeTaskCreateModal() {
  taskCreateOverlay?.classList.remove("open");
  taskCreateModal?.classList.remove("open");
}

openTaskModalButton?.addEventListener("click", openTaskCreateModal);
heroCreateTaskButton?.addEventListener("click", openTaskCreateModal);
closeTaskModalButton?.addEventListener("click", closeTaskCreateModal);
taskCreateOverlay?.addEventListener("click", closeTaskCreateModal);

function showTaskStep(n) {
  taskStep1.style.display = n === 1 ? "block" : "none";
  taskStep2.style.display = n === 2 ? "block" : "none";
  taskStep3.style.display = n === 3 ? "block" : "none";
  taskStepText.textContent  = `Step ${n} of 3`;
  taskProgressFill.style.width = n === 1 ? "33%" : n === 2 ? "66%" : "100%";

  [tDot1, tDot2, tDot3].forEach((dot, i) => {
    if (!dot) return;
    dot.classList.remove("active", "done");
    if (i + 1 < n)  dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });
}

function updateTaskPreview() {
  const title    = document.getElementById("title").value.trim();
  const category = document.getElementById("category").value.trim();
  const section  = document.getElementById("taskSection").value;
  const desc     = document.getElementById("description").value.trim();
  const location = document.getElementById("location").value.trim();
  const price    = document.getElementById("price").value.trim();
  const urgent   = document.getElementById("urgent").checked;

  taskPreview.innerHTML = `
    <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">${title || "Task title"}</h3>
    <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">${desc || "Task description will appear here."}</p>
    <div class="market-tags">
      ${sectionBadge(section)}
      <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${category || "Category"}</div>
      <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${location || "Location"}</div>
      ${urgent ? `<div class="market-tag" style="background:rgba(224,58,62,0.10);color:var(--ump-red);"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
    </div>
    <div style="margin-top:14px;font-size:13px;color:var(--muted);">
      Budget: <strong style="color:var(--ump-green);font-size:16px;">R${price || "0"}</strong>
    </div>`;
}

function validateStep1() {
  const title    = document.getElementById("title").value.trim();
  const category = document.getElementById("category").value.trim();
  if (!title || !category) { showToast("Please complete the task title and category.", "error"); return false; }
  return true;
}

function validateStep2() {
  const desc     = document.getElementById("description").value.trim();
  const location = document.getElementById("location").value.trim();
  if (!desc || !location) { showToast("Please complete the description and location.", "error"); return false; }
  return true;
}

nextTaskStep2.addEventListener("click", () => { if (validateStep1()) showTaskStep(2); });
nextTaskStep3.addEventListener("click", () => { if (validateStep2()) { updateTaskPreview(); showTaskStep(3); } });
backTaskStep1.addEventListener("click", () => showTaskStep(1));
backTaskStep2.addEventListener("click", () => showTaskStep(2));

document.getElementById("price")?.addEventListener("input", updateTaskPreview);
document.getElementById("urgent")?.addEventListener("change", updateTaskPreview);

document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderTasks();
  });
});

taskSearchInput?.addEventListener("input", renderTasks);
taskCategoryFilter?.addEventListener("change", renderTasks);
taskPriceFilter?.addEventListener("change", renderTasks);
taskSortSelect?.addEventListener("change", renderTasks);

function populateCategoryFilter(tasks) {
  const cats = [...new Set(tasks.map(t => t.category).filter(Boolean))].sort();
  taskCategoryFilter.innerHTML = `<option value="All">All Categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

/* ── Client-side-only "saved" heart toggle ── local per browser only;
   there is no saved-listings table/endpoint in the backend yet. */
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedTasks") || "[]"); }
  catch { return []; }
}
function toggleSavedId(id) {
  const saved = getSavedIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedTasks", JSON.stringify(saved));
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

/* ── Card builder ──
   Corner badges: "Recommended" (purple, left) if this task was endorsed,
   and "Lecturer" (navy, right) if the poster themselves is a verified
   lecturer account. Urgent badge already occupies top-left, so the
   Recommended ribbon shifts down when both are present. */
function taskCard(task) {
  const isOwn      = Number(task.created_by) === Number(currentUser.id);
  const canCancel  = isOwn && ["Posted", "Accepted"].includes(task.status);
  const isEndorsed = !!task.endorsed_by_lecturer_name;
  const isSaved    = getSavedIds().includes(task.id);

  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" class="lightbox-img" data-gallery="task-${task.id}" data-full="${task.image_urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
        ${task.urgent ? `<div class="urgent-badge"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${endorsementCornerBadge(task, { shiftDown: task.urgent && isEndorsed })}
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
          ${sectionBadge(task.section || "General")}
        </div>
        <h3>${task.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${statusBadge(task.status)}
          ${endorsementBadge(task)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${task.price} <span>/task</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="./task-details.html?id=${task.id}" class="market-action-btn">
              <i class="ti ti-eye" aria-hidden="true"></i> View
            </a>
            ${canCancel ? `<button class="market-action-btn outline cancel-task-btn" data-task-id="${task.id}"><i class="ti ti-x" aria-hidden="true"></i> Cancel</button>` : ""}
            ${isOwn && task.status === "Posted" ? `
              <button class="market-action-btn outline delete-task-btn" data-task-id="${task.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete
              </button>` : ""}
          </div>
        </div>
      </div>
    </div>`;
}

function getFilteredSortedTasks() {
  const q = taskSearchInput?.value.trim().toLowerCase() || "";
  const category = taskCategoryFilter?.value || "All";
  const priceBucket = taskPriceFilter?.value || "All";

  let filtered = cachedTasks.filter(t => {
    const matchesSection  = selectedSection === "All" || t.section === selectedSection;
    const matchesCategory = category === "All" || t.category === category;
    const matchesSearch   = !q || [t.title, t.description, t.category, t.location].some(f => f?.toLowerCase().includes(q));
    const price = Number(t.price);
    const matchesPrice =
      priceBucket === "All" ? true :
      priceBucket === "under100" ? price < 100 :
      priceBucket === "100to300" ? price >= 100 && price <= 300 :
      price > 300;
    return matchesSection && matchesCategory && matchesSearch && matchesPrice;
  });

  const sort = taskSortSelect?.value || "newest";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "price_asc")  return Number(a.price) - Number(b.price);
    if (sort === "price_desc") return Number(b.price) - Number(a.price);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return filtered;
}

function renderTasks() {
  const filtered = getFilteredSortedTasks();
  tasksContainer.innerHTML = filtered.length
    ? filtered.map(taskCard).join("")
    : emptyState("ti-clipboard-list", "No tasks found", "Try a different filter or post a new task.");
  attachCancelButtonEvents();
  attachDeleteTaskEvents();
  attachProfileLinkEvents();
  attachSaveHeartEvents();
}

function attachDeleteTaskEvents() {
  document.querySelectorAll(".delete-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this task?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}`, "DELETE");
        showToast("Task deleted.");
        await loadTasks();
        await loadTaskHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });
}

function historyCard(task) {
  const isPoster  = Number(task.created_by) === Number(currentUser.id);
  const roleLabel = isPoster ? "You posted this" : "You accepted this";

  return `
    <div class="market-card">
      <div class="market-image" style="position:relative;">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" class="lightbox-img" data-gallery="task-history-${task.id}" data-full="${task.image_urls[0]}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
        ${endorsementCornerBadge(task)}
        ${lecturerPostedCornerBadge(task.created_by_member_type)}
      </div>
      <div class="market-content">
        <div class="market-top">
          ${sectionBadge(task.section || "General")}
          ${statusBadge(task.status)}
        </div>
        <h3>${task.title}</h3>
        <p style="color:var(--muted);font-size:13px;margin:6px 0 10px;">${task.description}</p>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          <div class="market-tag"><i class="ti ti-user" aria-hidden="true"></i> ${roleLabel}</div>
          <div class="market-tag"><i class="ti ti-credit-card" aria-hidden="true"></i> ${task.payment_status || "N/A"}</div>
          ${endorsementBadge(task)}
        </div>
        <div class="market-footer">
          <div class="market-price">R${task.price} <span>/task</span></div>
          ${task.status === "Completed"
            ? `<button class="market-action-btn review-task-btn" data-task-id="${task.id}">
                 <i class="ti ti-star" aria-hidden="true"></i> Leave Review
               </button>`
            : `<a href="./task-details.html?id=${task.id}" class="market-action-btn outline"><i class="ti ti-eye" aria-hidden="true"></i> View</a>`}
        </div>
      </div>
    </div>`;
}

function historyMiniCard(task) {
  return `
    <a href="./task-details.html?id=${task.id}" class="mini-history-item">
      <div class="mini-history-thumb"><div class="media-placeholder light"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div></div>
      <div class="mini-history-info">
        <div class="mini-history-top">
          ${sectionBadge(task.section || "General")}
          ${statusBadge(task.status)}
        </div>
        <div class="mini-history-title">${task.title}</div>
        <div class="mini-history-meta">R${task.price} &middot; ${task.payment_status || "N/A"}</div>
      </div>
    </a>`;
}

function attachCancelButtonEvents() {
  document.querySelectorAll(".cancel-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this task?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Cancelling…`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/cancel`, "PATCH");
        showToast("Task cancelled.");
        await loadTasks();
        await loadTaskHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Cancel`;
      }
    });
  });
}

function attachReviewButtonEvents(scope = document) {
  scope.querySelectorAll(".review-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      reviewForm.reset();
      reviewTaskIdInput.value = btn.dataset.taskId;
      reviewMessage.textContent = "";
      openModal(reviewModal);
    });
  });
}

reviewForm?.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await apiRequest(`/reviews/tasks/${reviewTaskIdInput.value}`, "POST", {
      rating: Number(ratingInput.value),
      comment: commentInput.value.trim()
    });
    showToast("Review submitted!");
    closeModal(reviewModal, reviewForm, reviewMessage);
    await loadTaskHistory();
  } catch (err) {
    reviewMessage.textContent = err.message;
    reviewMessage.style.color = "red";
    showToast(err.message, "error");
  }
});

async function loadTasks() {
  try {
    const res = await apiRequest("/tasks");
    cachedTasks = res.data;
    populateCategoryFilter(cachedTasks);

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam && taskSearchInput) taskSearchInput.value = searchParam;

    renderTasks();
  } catch (err) {
    console.error("loadTasks failed:", err);
    tasksContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

async function loadTaskHistory() {
  try {
    const res   = await apiRequest("/tasks/history");
    const tasks = res.data;

    historyContainer.innerHTML = tasks.length
      ? tasks.map(historyCard).join("")
      : emptyState("ti-clock", "No history yet", "Completed tasks appear here.");
    attachReviewButtonEvents(historyContainer);

    taskHistoryMiniContainer.innerHTML = tasks.length
      ? tasks.slice(0, 4).map(historyMiniCard).join("")
      : `<p class="rail-loading">No history yet.</p>`;
  } catch (err) {
    console.error("loadTaskHistory failed:", err);
    historyContainer.innerHTML = errorState(err.message);
    taskHistoryMiniContainer.innerHTML = `<p class="rail-loading">Couldn't load history.</p>`;
    showToast(err.message, "error");
  }
}

document.getElementById("viewAllHistoryLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  const section = document.getElementById("fullHistorySection");
  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth", block: "start" });
});

taskForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const price = document.getElementById("price").value.trim();
  if (!price) { showToast("Please enter a budget.", "error"); return; }

  const submitBtn = taskForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Posting…`;

  try {
    let imageUrls = [];
    if (taskUploader && taskUploader.getFiles().length) {
      showToast("Uploading images…", "warning");
      imageUrls = await taskUploader.upload("tasks");
    }

    await apiRequest("/tasks", "POST", {
      title:       document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      category:    document.getElementById("category").value.trim(),
      section:     document.getElementById("taskSection").value,
      price:       Number(price),
      location:    document.getElementById("location").value.trim(),
      urgent:      document.getElementById("urgent").checked,
      imageUrls
    });
    showToast("Task posted successfully!");
    taskForm.reset();
    if (taskUploader) taskUploader.reset();
    showTaskStep(1);
    closeTaskCreateModal();
    await loadTasks();
    await loadTaskHistory();
  } catch (err) {
    taskMessage.textContent = err.message;
    taskMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="ti ti-send" aria-hidden="true"></i> Post Task`;
  }
});

loadTasks();
loadTaskHistory();

const taskUploader = initImageUploader("taskUploadArea", "taskPreviewGrid");