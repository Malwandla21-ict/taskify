const currentUser = requireAuth();

const tasksContainer   = document.getElementById("tasksContainer");
const historyContainer = document.getElementById("historyContainer");
const taskForm         = document.getElementById("taskForm");
const taskMessage      = document.getElementById("taskMessage");

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

const reviewModal           = document.getElementById("reviewModal");
const reviewForm            = document.getElementById("reviewForm");
const reviewTaskIdInput     = document.getElementById("reviewTaskId");
const ratingInput           = document.getElementById("rating");
const commentInput          = document.getElementById("comment");
const closeReviewModalButton = document.getElementById("closeReviewModal");
const reviewMessage         = document.getElementById("reviewMessage");

const overlay               = document.getElementById("overlay");

/* ── Creation modal ── */
const taskCreateOverlay = document.getElementById("taskCreateOverlay");
const taskCreateModal   = document.getElementById("taskCreateModal");

function openTaskCreateModal() {
  taskCreateModal.classList.add("open");
  taskCreateOverlay.classList.add("open");
}
function closeTaskCreateModal() {
  taskCreateModal.classList.remove("open");
  taskCreateOverlay.classList.remove("open");
}
document.getElementById("openTaskModalButton")?.addEventListener("click", openTaskCreateModal);
document.getElementById("closeTaskModalButton")?.addEventListener("click", closeTaskCreateModal);
taskCreateOverlay?.addEventListener("click", closeTaskCreateModal);

let cachedTasks    = [];
let selectedSection = "All";

/* ── Modals ── */
function openModal(modal) {
  modal.style.display  = "block";
  overlay.style.display = "block";
}

function closeModal(modal, form, msgEl) {
  modal.style.display  = "none";
  overlay.style.display = "none";
  if (form)  form.reset();
  if (msgEl) msgEl.textContent = "";
}

closeReviewModalButton?.addEventListener("click", () => closeModal(reviewModal, reviewForm, reviewMessage));
overlay?.addEventListener("click", () => {
  closeModal(reviewModal, reviewForm, reviewMessage);
});

/* ── Step navigation ── */
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

/* ── Preview ── */
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

/* ── Validators ── */
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

/* ── Filters ── */
document.querySelectorAll(".filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSection = btn.dataset.section;
    renderTasks(cachedTasks);
  });
});

/* ── Card builder (marketplace grid) ── */
function taskCard(task) {
  const isOwn     = Number(task.created_by) === Number(currentUser.id);
  const canCancel = isOwn && ["Posted", "Accepted"].includes(task.status);

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
            <div class="market-avatar">${avatarHtml(task.created_by_profile_photo, task.created_by_name)}</div>
            <div>
              <div class="market-user-name profile-link" data-user-id="${task.created_by}" data-user-name="${task.created_by_name}" style="cursor:pointer;">${task.created_by_name}</div>
              <div class="market-user-meta"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</div>
            </div>
          </div>
          ${sectionBadge(task.section || "General")}
        </div>
        <h3>${task.title}</h3>
        <div class="market-tags">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${statusBadge(task.status)}
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

/* ── Render tasks ── */
function renderTasks(tasks) {
  const filtered = tasks.filter(t => selectedSection === "All" || t.section === selectedSection);
  tasksContainer.innerHTML = filtered.length
    ? filtered.map(taskCard).join("")
    : emptyState("ti-clipboard-list", "No tasks found", "Try a different filter or post a new task.");
  attachCancelButtonEvents();
  attachDeleteTaskEvents();
  attachProfileLinkEvents(tasksContainer);
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

/* ── Detailed history card ── */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function historyCard(task) {
  const isOwn    = Number(task.created_by)  === Number(currentUser.id);
  const isWorker = Number(task.accepted_by) === Number(currentUser.id);

  let actionArea = "";
  if (task.status === "Completed") {
    actionArea = `
      <button class="market-action-btn review-task-btn" data-task-id="${task.id}">
        <i class="ti ti-star" aria-hidden="true"></i> Leave Review
      </button>`;
  } else if (isOwn && task.status === "Awaiting Confirmation") {
    actionArea = `
      <button class="market-action-btn confirm-completion-btn" data-task-id="${task.id}" style="background:var(--ump-green);">
        <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion & Release Payment
      </button>`;
  } else if (isWorker && task.status === "Accepted") {
    actionArea = `
      <button class="market-action-btn outline withdraw-task-btn" data-task-id="${task.id}">
        <i class="ti ti-logout" aria-hidden="true"></i> Withdraw
      </button>`;
  } else if (isWorker && task.status === "Awaiting Confirmation") {
    actionArea = `
      <div class="badge gold"><i class="ti ti-hourglass" aria-hidden="true"></i> Waiting for owner to confirm</div>`;
  }

  const counterpartId   = isOwn ? task.accepted_by : task.created_by;
  const counterpartName = isOwn ? task.accepted_by_name : task.created_by_name;
  const counterpartPhoto = isOwn ? task.accepted_by_profile_photo : task.created_by_profile_photo;

  const reportButton = counterpartId
    ? `<button class="market-action-btn outline report-task-btn" data-task-id="${task.id}" data-task-title="${task.title}" data-user-id="${counterpartId}" data-user-name="${counterpartName || "this user"}" style="color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
         <i class="ti ti-flag" aria-hidden="true"></i> Report
       </button>`
    : "";

  const peopleHtml = `
    <div class="history-card-people">
      <div class="history-person">
        <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(task.created_by_profile_photo, task.created_by_name)}</div>
        <div>
          <div class="history-person-role">Posted by</div>
          <div class="history-person-name profile-link" data-user-id="${task.created_by}" data-user-name="${task.created_by_name}">${isOwn ? "You" : task.created_by_name}</div>
        </div>
      </div>
      ${task.accepted_by ? `
        <div class="history-person">
          <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(counterpartPhoto, counterpartName)}</div>
          <div>
            <div class="history-person-role">${isOwn ? "Working with" : "You are"}</div>
            <div class="history-person-name profile-link" data-user-id="${task.accepted_by}" data-user-name="${task.accepted_by_name}">${isWorker ? "You" : task.accepted_by_name}</div>
          </div>
        </div>` : `
        <div class="history-person">
          <div class="history-person-role" style="color:var(--muted);"><i class="ti ti-user-question" aria-hidden="true"></i> No one has accepted this task yet</div>
        </div>`}
    </div>`;

  return `
    <div class="history-card">
      <div class="history-card-image">
        ${task.image_urls?.length
          ? `<img src="${task.image_urls[0]}" alt="${task.title}" />`
          : `<div class="market-image-placeholder"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div>`}
      </div>
      <div class="history-card-body">
        <div class="history-card-top">
          <div>
            <div class="history-card-title">${task.title}</div>
            <div class="market-tags" style="margin-bottom:0;">
              ${sectionBadge(task.section || "General")}
              <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
              ${task.urgent ? `<div class="market-tag" style="background:rgba(224,58,62,0.10);color:var(--ump-red);"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
            </div>
          </div>
          ${statusBadge(task.status)}
        </div>
        <p class="history-card-desc">${task.description}</p>
        <div class="history-card-meta-grid">
          <div class="history-meta-item">
            <i class="ti ti-currency-dollar" aria-hidden="true"></i>
            <div><div class="history-meta-label">Budget</div><div class="history-meta-value">R${task.price}</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-map-pin" aria-hidden="true"></i>
            <div><div class="history-meta-label">Location</div><div class="history-meta-value">${task.location}</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-calendar" aria-hidden="true"></i>
            <div><div class="history-meta-label">Posted</div><div class="history-meta-value">${formatDate(task.created_at)}</div></div>
          </div>
          <div class="history-meta-item">
            <i class="ti ti-credit-card" aria-hidden="true"></i>
            <div><div class="history-meta-label">Payment</div><div class="history-meta-value">${task.payment_status || "N/A"}</div></div>
          </div>
        </div>
        ${peopleHtml}
        <div class="history-card-actions">
          ${actionArea}
          ${reportButton}
        </div>
      </div>
    </div>`;
}

/* ── Cancel events ── */
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

/* ── Confirm completion (owner) ── */
function attachConfirmCompletionEvents() {
  document.querySelectorAll(".confirm-completion-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirm this task is complete? This will release payment to the worker.")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Confirming…`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/confirm-completion`, "PATCH");
        showToast("Task completed and payment released!");
        await loadTaskHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion & Release Payment`;
      }
    });
  });
}

/* ── Withdraw (worker) ── */
function attachWithdrawTaskEvents() {
  document.querySelectorAll(".withdraw-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Withdraw from this task? It will be reposted for other students.")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Withdrawing…`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/withdraw`, "PATCH");
        showToast("You have withdrawn from this task.");
        await loadTasks();
        await loadTaskHistory();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-logout" aria-hidden="true"></i> Withdraw`;
      }
    });
  });
}

/* ── Report events (history) ── */
function attachHistoryReportEvents() {
  document.querySelectorAll(".report-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openReportModal({
        reportedUserId: btn.dataset.userId,
        reportedUserName: btn.dataset.userName,
        contextType: "task",
        contextId: btn.dataset.taskId,
        contextLabel: btn.dataset.taskTitle
      });
    });
  });
}

/* ── Review events ── */
function attachReviewButtonEvents() {
  document.querySelectorAll(".review-task-btn").forEach(btn => {
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
  const submitBtn = reviewForm.querySelector("button[type='submit']");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Submitting…`;
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
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
  }
});

/* ── Loaders ── */
async function loadTasks() {
  try {
    const res = await apiRequest("/tasks");
    cachedTasks = res.data;
    renderTasks(cachedTasks);
  } catch (err) {
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
      : emptyState("ti-clock", "No history yet", "Tasks you post or accept will show here.");
    attachReviewButtonEvents();
    attachConfirmCompletionEvents();
    attachWithdrawTaskEvents();
    attachHistoryReportEvents();
    attachProfileLinkEvents(historyContainer);
  } catch (err) {
    historyContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ── Form submit ── */
taskForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const price = document.getElementById("price").value.trim();
  if (!price) { showToast("Please enter a budget.", "error"); return; }

  const submitBtn = taskForm.querySelector("button[type='submit']");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Posting…`;

  try {
    let imageUrls = [];
    if (taskUploader && taskUploader.getFiles().length) {
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
    submitBtn.innerHTML = originalLabel;
  }
});

loadTasks();
loadTaskHistory();

/* ── Image uploader init (runs after DOM is ready) ── */
const taskUploader = initImageUploader("taskUploadArea", "taskPreviewGrid");