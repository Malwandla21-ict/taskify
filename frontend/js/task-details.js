const currentUser          = requireAuth();
const taskDetailsContainer = document.getElementById("taskDetailsContainer");

const params = new URLSearchParams(window.location.search);
const taskId = params.get("id");

document.getElementById("backButton")?.addEventListener("click", () => goBack("./tasks.html"));

async function loadTaskDetails() {
  try {
    const res = await apiRequest(`/tasks/${taskId}`);
    renderTaskDetails(res.data);
  } catch (err) {
    taskDetailsContainer.innerHTML = errorState(err.message || "This task may have been cancelled or removed.");
    showToast(err.message, "error");
  }
}

function renderTaskDetails(task) {
  const isOwn           = Number(task.created_by)  === Number(currentUser.id);
  const isAcceptedByMe   = Number(task.accepted_by) === Number(currentUser.id);
  const canMessagePoster = !isOwn;

  let primaryAction;
  if (!isOwn && task.status === "Posted") {
    primaryAction = `<button class="primary-button" id="acceptTaskButton" data-task-id="${task.id}" data-task-price="${task.price}">
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
  } else if (task.status === "Awaiting Confirmation" && isOwn) {
    primaryAction = `<button class="primary-button" id="confirmCompletionButton" data-task-id="${task.id}" style="background:var(--ump-green);">
                        <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion
                      </button>`;
  } else {
    primaryAction = statusBadge(task.status);
  }

  const messageButton = canMessagePoster
    ? `<button class="secondary-button" id="messagePosterButton" style="margin-top:10px;">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Poster
       </button>`
    : "";

  const canCancel = isOwn && ["Posted", "Accepted"].includes(task.status);
  const canDelete = isOwn && task.status === "Posted";
  const ownerActions = `
    ${canCancel ? `
      <button class="secondary-button cancel-task-btn" data-task-id="${task.id}" style="margin-top:10px;">
        <i class="ti ti-x" aria-hidden="true"></i> Cancel Task
      </button>` : ""}
    ${canDelete ? `
      <button class="secondary-button delete-task-btn" data-task-id="${task.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete Task
      </button>` : ""}`;

  taskDetailsContainer.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;align-items:start;">
      <div>
        <div style="position:relative;">
          ${renderImageGallery(task.image_urls, "ti-clipboard-list")}
          ${endorsementCornerBadge(task)}
          ${lecturerPostedCornerBadge(task.created_by_member_type)}
        </div>
        ${task.urgent ? `<div class="urgent-badge" style="display:inline-flex;margin-bottom:12px;"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${sectionBadge(task.section || "General")}
        <h1 style="font-size:32px;font-weight:800;margin:16px 0 10px;letter-spacing:-0.5px;">${task.title}</h1>
        <p style="color:var(--muted);line-height:1.75;font-size:15px;">${task.description}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${task.category}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${task.location}</div>
          ${statusBadge(task.status)}
        </div>
        ${endorsementDetailBlock(task)}
      </div>
      <div class="form-panel">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Task Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(task.created_by_name, task.created_by_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${task.created_by}" style="cursor:pointer;font-weight:600;font-size:13px;">${posterName(task.created_by_name, task.created_by_lecturer_title)}</div>
            <div style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:3px;">
              <i class="ti ti-shield-check" aria-hidden="true"></i> ${task.created_by_member_type === "Lecturer" ? "Verified Lecturer" : "Verified Student"}
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
        ${ownerActions}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Tasks
        </button>
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./tasks.html"));

  attachTaskActionEvents();
  attachOwnerActionEvents();
  attachProfileLinkEvents();

  document.getElementById("messagePosterButton")?.addEventListener("click", (e) => {
    startConversationAndRedirect("task", taskId, e.currentTarget);
  });
}

function attachTaskActionEvents() {
  const accept   = document.getElementById("acceptTaskButton");
  const start    = document.getElementById("startTaskButton");
  const complete = document.getElementById("completeTaskButton");
  const confirmBtn = document.getElementById("confirmCompletionButton");

  if (accept)   accept.addEventListener("click",   () => openPaymentSimulationModal(accept));
  if (start)    start.addEventListener("click",    () => updateTask(start,    `/tasks/${start.dataset.taskId}/status`,    "PATCH", { status: "In Progress" },         "Task started!",   "Starting…"));
  if (complete) complete.addEventListener("click", () => updateTask(complete, `/tasks/${complete.dataset.taskId}/status`, "PATCH", { status: "Awaiting Confirmation" },"Marked as done — awaiting confirmation.", "Submitting…"));
  if (confirmBtn) confirmBtn.addEventListener("click", () => {
    if (!window.confirm("Confirm this task is complete? This releases payment to the worker.")) return;
    updateTask(confirmBtn, `/tasks/${confirmBtn.dataset.taskId}/confirm-completion`, "PATCH", null, "Task completed and payment released!", "Confirming…");
  });
}

/* ── Demo payment simulation ──
   There's no real payment gateway wired up yet, so accepting a task (which
   the backend already marks as "payment held") is fronted by a clearly
   labeled demo step rather than silently flipping the payment status with
   no visible moment for it. Deliberately no card-entry fields — this can
   be publicly reachable, and a form that invites someone to type a real
   card number for a payment that doesn't exist is the wrong shape even as
   a demo. */
const paymentModal          = document.getElementById("paymentModal");
const paymentModalAmount    = document.getElementById("paymentModalAmount");
const cancelPaymentModalBtn = document.getElementById("cancelPaymentModal");
const simulatePaymentButton = document.getElementById("simulatePaymentButton");

cancelPaymentModalBtn?.addEventListener("click", () => closeModal(paymentModal));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(paymentModal));

function openPaymentSimulationModal(acceptBtn) {
  if (paymentModalAmount) paymentModalAmount.textContent = `R${acceptBtn.dataset.taskPrice}`;
  openModal(paymentModal);

  if (simulatePaymentButton) {
    simulatePaymentButton.onclick = () => {
      closeModal(paymentModal);
      updateTask(
        acceptBtn,
        `/tasks/${acceptBtn.dataset.taskId}/accept`,
        "PATCH",
        null,
        "Task accepted! Payment held in escrow (demo).",
        "Accepting…"
      );
    };
  }
}

function attachOwnerActionEvents() {
  document.querySelectorAll(".cancel-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancel this task?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Cancelling…`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/cancel`, "PATCH");
        showToast("Task cancelled.");
        setTimeout(() => window.location.href = "./tasks.html", 800);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Cancel Task`;
      }
    });
  });

  document.querySelectorAll(".delete-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this task?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Deleting…`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}`, "DELETE");
        showToast("Task deleted.");
        setTimeout(() => window.location.href = "./tasks.html", 800);
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete Task`;
      }
    });
  });
}

async function updateTask(btn, url, method, body, msg, loadingLabel) {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> ${loadingLabel}`;
  try {
    await apiRequest(url, method, body);
    showToast(msg);
    setTimeout(() => window.location.href = "./tasks.html", 800);
  } catch (err) {
    showToast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

loadTaskDetails();