const currentUser          = requireAuth();
const taskDetailsContainer = document.getElementById("taskDetailsContainer");

const params = new URLSearchParams(window.location.search);
const taskId = params.get("id");

async function loadTaskDetails() {
  try {
    const res  = await apiRequest(`/tasks/${taskId}`);
    const task = res.data;
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
  const isOwn              = Number(task.created_by)  === Number(currentUser.id);
  const isAcceptedByMe     = Number(task.accepted_by) === Number(currentUser.id);

  let actionArea = "";
  if (!isOwn && !task.accepted_by && task.status === "Posted") {
    actionArea = `<button class="primary-button" id="acceptTaskButton" data-task-id="${task.id}">
                    <i class="ti ti-check" aria-hidden="true"></i> Accept Task
                  </button>`;
  } else if (isAcceptedByMe && task.status === "Accepted") {
    actionArea = `
      <button class="primary-button" id="startTaskButton" data-task-id="${task.id}">
        <i class="ti ti-player-play" aria-hidden="true"></i> Start Task
      </button>
      <button class="secondary-button" id="withdrawTaskButton" data-task-id="${task.id}" style="margin-top:10px;">
        <i class="ti ti-logout" aria-hidden="true"></i> Withdraw From Task
      </button>`;
  } else if (isAcceptedByMe && task.status === "In Progress") {
    actionArea = `<button class="primary-button" id="markDoneButton" data-task-id="${task.id}">
                    <i class="ti ti-circle-check" aria-hidden="true"></i> Mark Work as Done
                  </button>`;
  } else if (isAcceptedByMe && task.status === "Awaiting Confirmation") {
    actionArea = `<div class="badge gold" style="display:inline-flex;"><i class="ti ti-hourglass" aria-hidden="true"></i> Waiting for owner confirmation</div>`;
  } else if (isOwn && task.status === "Awaiting Confirmation") {
    actionArea = `<button class="primary-button" id="confirmCompletionButton" data-task-id="${task.id}" style="background:var(--ump-green);">
                    <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion & Release Payment
                  </button>`;
  } else {
    actionArea = statusBadge(task.status);
  }

  let reportTargetId   = null;
  let reportTargetName = "this user";
  if (!isOwn) {
    reportTargetId   = task.created_by;
    reportTargetName = task.created_by_name;
  } else if (task.accepted_by) {
    reportTargetId   = task.accepted_by;
    reportTargetName = task.accepted_by_name || "the assigned student";
  }

  const reportButton = reportTargetId
    ? `<button type="button" class="secondary-button" id="reportTaskButton" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.30);">
         <i class="ti ti-flag" aria-hidden="true"></i> Report an Issue
       </button>`
    : "";

  /* WhatsApp contact — only shown once two people are actually paired
     (task accepted). Owner messages the worker; worker messages the
     owner. Before acceptance there's no counterpart to message. */
  let whatsappButton = "";
  if (task.accepted_by) {
    const contactPhone = isOwn ? task.accepted_by_phone_number : task.created_by_phone_number;
    if (contactPhone) {
      whatsappButton = `<a href="${createWhatsAppLink(contactPhone, task.title)}" target="_blank" class="market-action-btn" style="margin-top:10px;width:100%;justify-content:center;background:var(--ump-green);">
           <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Message via WhatsApp
         </a>`;
    }
  }

  const workerLine = task.accepted_by
    ? `<div style="display:flex;align-items:center;gap:10px;margin:16px 0;padding:12px;background:var(--background);border-radius:var(--radius);">
         <div class="market-avatar" style="width:32px;height:32px;flex-shrink:0;">${avatarHtml(task.accepted_by_profile_photo, task.accepted_by_name)}</div>
         <div>
           <div style="font-size:11px;color:var(--muted);">Assigned to</div>
           <div class="profile-link" data-user-id="${task.accepted_by}" data-user-name="${task.accepted_by_name || ""}" style="font-size:13px;font-weight:600;cursor:pointer;">${task.accepted_by_name || "Unknown"}</div>
         </div>
       </div>`
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
        ${workerLine}
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Task Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(task.created_by_profile_photo, task.created_by_name)}</div>
          <div>
            <div class="profile-link" data-user-id="${task.created_by}" data-user-name="${task.created_by_name}" style="font-weight:600;font-size:13px;cursor:pointer;">${task.created_by_name}</div>
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
        ${actionArea}
        ${whatsappButton}
        <a href="./tasks.html" class="secondary-button" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Tasks
        </a>
        ${reportButton}
      </div>
    </div>`;

  attachTaskActionEvents();
  attachProfileLinkEvents(taskDetailsContainer);

  document.getElementById("reportTaskButton")?.addEventListener("click", () => {
    openReportModal({
      reportedUserId: reportTargetId,
      reportedUserName: reportTargetName,
      contextType: "task",
      contextId: task.id,
      contextLabel: task.title
    });
  });
}

function attachTaskActionEvents() {
  const accept            = document.getElementById("acceptTaskButton");
  const start              = document.getElementById("startTaskButton");
  const markDone          = document.getElementById("markDoneButton");
  const withdraw          = document.getElementById("withdrawTaskButton");
  const confirmCompletion = document.getElementById("confirmCompletionButton");

  if (accept) accept.addEventListener("click", () =>
    updateTask(accept, `/tasks/${accept.dataset.taskId}/accept`, "PATCH", null, "Task accepted!"));

  if (start) start.addEventListener("click", () =>
    updateTask(start, `/tasks/${start.dataset.taskId}/status`, "PATCH", { status: "In Progress" }, "Task started!"));

  if (markDone) markDone.addEventListener("click", () =>
    updateTask(markDone, `/tasks/${markDone.dataset.taskId}/status`, "PATCH", { status: "Awaiting Confirmation" }, "Marked as done — waiting for the owner to confirm."));

  if (withdraw) withdraw.addEventListener("click", () => {
    if (!confirm("Withdraw from this task? It will be reposted for other students.")) return;
    updateTask(withdraw, `/tasks/${withdraw.dataset.taskId}/withdraw`, "PATCH", null, "You have withdrawn from this task.");
  });

  if (confirmCompletion) confirmCompletion.addEventListener("click", () => {
    if (!confirm("Confirm this task is complete? This will release payment to the worker.")) return;
    updateTask(confirmCompletion, `/tasks/${confirmCompletion.dataset.taskId}/confirm-completion`, "PATCH", null, "Task completed and payment released!");
  });
}

async function updateTask(btn, url, method, body, msg) {
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;
  try {
    await apiRequest(url, method, body);
    showToast(msg);
    setTimeout(() => window.location.href = "./tasks.html", 800);
  } catch (err) {
    showToast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

loadTaskDetails();