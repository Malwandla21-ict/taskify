const currentUser          = requireAuth();
const taskDetailsContainer = document.getElementById("taskDetailsContainer");

const params = new URLSearchParams(window.location.search);
const taskId = params.get("id");

async function loadTaskDetails() {
  try {
    const res  = await apiRequest("/tasks");
    const task = res.data.find(t => Number(t.id) === Number(taskId));
    if (!task) {
      taskDetailsContainer.innerHTML = emptyState("ti-clipboard-off", "Task not found", "This task may have been cancelled or removed.");
      return;
    }
    renderTaskDetails(task);
  } catch (err) {
    taskDetailsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

function renderTaskDetails(task) {
  const isOwn          = Number(task.created_by)  === Number(currentUser.id);
  const isAcceptedByMe  = Number(task.accepted_by) === Number(currentUser.id);
  const initials        = avatarInitials(task.created_by_name);
  const canMessagePoster = !isOwn;

  let primaryAction = "";
  if (!isOwn && task.status === "Posted") {
    primaryAction = `<button class="primary-button" id="acceptTaskButton" data-task-id="${task.id}">
                        <i class="ti ti-check" aria-hidden="true"></i> Accept Task
                      </button>`;
  } else if (task.status === "Accepted" && isAcceptedByMe) {
    primaryAction = `<button class="primary-button" id="startTaskButton" data-task-id="${task.id}">
                        <i class="ti ti-player-play" aria-hidden="true"></i> Start Task
                      </button>`;
  } else if (task.status === "In Progress" && isAcceptedByMe) {
    primaryAction = `<button class="primary-button" id="completeTaskButton" data-task-id="${task.id}">
                        <i class="ti ti-circle-check" aria-hidden="true"></i> Mark Complete
                      </button>`;
  } else if (!isOwn) {
    primaryAction = statusBadge(task.status);
  } else {
    primaryAction = statusBadge(task.status);
  }

  const messageButton = canMessagePoster
    ? `<button class="secondary-button" id="messagePosterButton" style="margin-top:10px;">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Poster
       </button>`
    : "";

  taskDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        ${renderImageGallery(task.image_urls, "ti-clipboard-list")}
        ${task.urgent ? `<div class="urgent-badge" style="display:inline-flex;margin-bottom:12px;"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${sectionBadge(task.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${task.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${task.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${statusBadge(task.status)}
        </div>
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Task Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:13px;">${task.created_by_name}</div>
            <div style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:3px;">
              <i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student
            </div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Status</div>
          ${statusBadge(task.status)}
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Budget</div>
          <div class="market-price">R${task.price} <span>/task</span></div>
        </div>
        ${primaryAction}
        ${messageButton}
        <a href="./tasks.html" class="secondary-button" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Tasks
        </a>
      </div>
    </div>`;

  attachTaskActionEvents();

  document.getElementById("messagePosterButton")?.addEventListener("click", () => {
    startConversationAndRedirect("task", taskId);
  });
}

function attachTaskActionEvents() {
  const accept   = document.getElementById("acceptTaskButton");
  const start    = document.getElementById("startTaskButton");
  const complete = document.getElementById("completeTaskButton");

  if (accept)   accept.addEventListener("click",   () => updateTask(`/tasks/${accept.dataset.taskId}/accept`,   "PATCH", null,                   "Task accepted!"));
  if (start)    start.addEventListener("click",    () => updateTask(`/tasks/${start.dataset.taskId}/status`,    "PATCH", { status:"In Progress" }, "Task started!"));
  if (complete) complete.addEventListener("click", () => updateTask(`/tasks/${complete.dataset.taskId}/status`, "PATCH", { status:"Completed" },   "Task completed!"));
}

async function updateTask(url, method, body, msg) {
  try {
    await apiRequest(url, method, body);
    showToast(msg);
    setTimeout(() => window.location.href = "./tasks.html", 800);
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadTaskDetails();