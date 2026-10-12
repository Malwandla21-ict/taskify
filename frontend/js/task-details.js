/* Guests (no account) can view this page — see helpers.js's
   getCurrentUser()/requireAuthAction(). currentUser is null for a guest;
   accepting the task or messaging the poster is guarded individually below. */
const currentUser          = getCurrentUser();
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
  const isOwn           = !!currentUser && Number(task.created_by)  === Number(currentUser.id);
  const isAcceptedByMe   = !!currentUser && Number(task.accepted_by) === Number(currentUser.id);

  /* Who a report from this page is about: a visitor or the worker reports
     the poster; the poster reports the student who took the task. */
  const reportTarget = !currentUser ? null
    : !isOwn
      ? { contextType: "task", contextId: task.id, itemTitle: task.title, reportedUserId: task.created_by, reportedUserName: task.created_by_name }
      : task.accepted_by
        ? { contextType: "task", contextId: task.id, itemTitle: task.title, reportedUserId: task.accepted_by, reportedUserName: task.accepted_by_name }
        : null;
  /* Messaging opens once the task is assigned to you (the server decides —
     see conversation.service.js messagingAccess). Before that, price talk
     goes through Make an offer. */
  const canMessagePoster = !isOwn && !!task.can_message;

  let primaryAction;
  if (!isOwn && task.status === "Posted") {
    /* The poster chooses who does each task: students apply (an offer at
       the listed price, see js/offers.js) and the poster picks one. Starts
       hidden for signed-in users until offers.js knows they can apply. */
    primaryAction = `<button class="primary-button" id="applyForTaskButton"${currentUser ? " hidden" : ""}>
                        <i class="ti ti-hand-finger" aria-hidden="true"></i> Apply for this Task
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
    /* Review step: confirm (releases the payment) or report a problem
       (task becomes Disputed, payment stays held, an admin decides). */
    primaryAction = `<p class="pay-note" style="margin-bottom:10px;">${escapeTaskText(task.accepted_by_name || "The worker")} marked this as done. Check the work, then confirm, or report a problem if it isn't done properly.</p>
                      <button class="primary-button" id="confirmCompletionButton" data-task-id="${task.id}" data-task-price="${escapeHtml(task.price)}" style="background:var(--ump-green);">
                        <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion
                      </button>
                      <button class="secondary-button" id="reportTaskProblemButton" data-task-id="${task.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
                        <i class="ti ti-alert-triangle" aria-hidden="true"></i> Report a Problem
                      </button>`;
  } else if (task.status === "Disputed" && (isOwn || isAcceptedByMe)) {
    primaryAction = `<div class="pay-panel" style="border-color:var(--ump-red);">
                        <h4><i class="ti ti-alert-triangle" aria-hidden="true" style="color:var(--ump-red);"></i> Problem reported</h4>
                        <p class="pay-note">${isOwn ? "You" : escapeTaskText(task.created_by_name || "The poster")} said: "${escapeTaskText(task.dispute_reason || "")}"</p>
                        <p class="pay-note" style="margin-bottom:${isOwn ? "10px" : "0"};">The payment stays held while a Taskify admin looks at it. They can release it to the worker, refund the poster, or send the task back to be finished.${isOwn ? " If it gets sorted out, you can still confirm." : " Message the poster to sort it out."}</p>
                        ${isOwn ? `<button class="primary-button" id="confirmCompletionButton" data-task-id="${task.id}" data-task-price="${escapeHtml(task.price)}" style="background:var(--ump-green);">
                          <i class="ti ti-circle-check" aria-hidden="true"></i> It's sorted: Confirm Completion
                        </button>` : ""}
                      </div>`;
  } else {
    primaryAction = statusBadge(task.status);
  }

  /* In-app offers (js/offers.js) — only on an open task you don't own.
     Starts hidden; offers.js shows it once it knows you can offer. Guests
     see it straight away (it asks them to sign in). */
  const canOffer = !isOwn && task.status === "Posted";
  const makeOfferButton = canOffer
    ? `<button class="secondary-button" id="makeOfferButton" style="margin-top:10px;"${currentUser ? " hidden" : ""}>
         <i class="ti ti-tag" aria-hidden="true"></i> Make an offer
       </button>`
    : "";

  /* The other person's phone number only comes back from the API once the
     (demo) payment is held between you — see task.service.js. */
  const otherPhone = isOwn ? task.accepted_by_phone_number : task.created_by_phone_number;
  const contactRow = otherPhone
    ? `<div style="margin-bottom:12px;">
         <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Contact (payment held)</div>
         <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:5px;">
           <i class="ti ti-phone" aria-hidden="true"></i> ${escapeHtml(otherPhone)}
         </div>
       </div>`
    : "";

  const messageButton = canMessagePoster
    ? `<button class="secondary-button" id="messagePosterButton" style="margin-top:10px;">
         <i class="ti ti-message-circle" aria-hidden="true"></i> Message Poster
       </button>`
    : "";

  const canCancel = isOwn && ["Posted", "Accepted"].includes(task.status);
  const canDelete = isOwn && task.status === "Posted";
  /* Editable only until someone accepts it — same rule as the server. */
  const canEdit = isOwn && task.status === "Posted";
  const ownerActions = `
    ${canEdit ? `
      <a href="./tasks.html?edit=${task.id}" class="secondary-button" style="margin-top:10px;">
        <i class="ti ti-edit" aria-hidden="true"></i> Edit Task
      </a>` : ""}
    ${canCancel ? `
      <button class="secondary-button cancel-task-btn" data-task-id="${task.id}" style="margin-top:10px;">
        <i class="ti ti-x" aria-hidden="true"></i> Cancel Task
      </button>` : ""}
    ${canDelete ? `
      <button class="secondary-button delete-task-btn" data-task-id="${task.id}" style="margin-top:10px;color:var(--ump-red);border-color:rgba(224,58,62,0.3);">
        <i class="ti ti-trash" aria-hidden="true"></i> Delete Task
      </button>` : ""}`;

  taskDetailsContainer.innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-media">
          ${renderImageGallery(task.image_urls, "ti-clipboard-list")}
          ${endorsementCornerBadge(task)}
          ${lecturerPostedCornerBadge(task.created_by_member_type, task.created_by_lecturer_verified)}
        </div>
        ${task.urgent ? `<div class="urgent-badge" style="display:inline-flex;margin-bottom:12px;"><i class="ti ti-flame" aria-hidden="true"></i> Urgent</div>` : ""}
        ${sectionBadge(task.section || "General")}
        <h1 class="detail-title">${escapeHtml(task.title)}</h1>
        <p class="detail-description">${escapeHtml(task.description)}</p>
        <div class="market-tags" style="margin-top:18px;">
          <div class="market-tag"><i class="ti ti-tag" aria-hidden="true"></i> ${escapeHtml(task.category)}</div>
          <div class="market-tag"><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(task.location)}</div>
          ${statusBadge(task.status)}
        </div>
        ${endorsementDetailBlock(task)}
        ${!isOwn && task.status === "Posted" ? noticeHtml("taskWorker") : ""}
        <div id="offersSection"></div>
      </div>
      <div class="form-panel detail-summary">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:7px;">
          <i class="ti ti-receipt" aria-hidden="true"></i> Task Summary
        </h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);">
          <div class="market-avatar" style="width:40px;height:40px;flex-shrink:0;">${avatarHtml(task.created_by_name, task.created_by_profile_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${task.created_by}" style="cursor:pointer;font-weight:600;font-size:13px;">${escapeHtml(posterName(task.created_by_name, task.created_by_lecturer_title))}</div>
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
          <div class="market-price">R${escapeHtml(task.price)} <span>/task</span></div>
        </div>
        ${contactRow}
        ${primaryAction}
        ${makeOfferButton}
        ${messageButton}
        ${ownerActions}
        <button type="button" class="secondary-button" id="backButtonBottom" style="margin-top:10px;display:flex;">
          <i class="ti ti-arrow-left" aria-hidden="true"></i> Back to Tasks
        </button>
        ${reportTarget ? reportProblemButtonHtml() : ""}
      </div>
    </div>`;

  document.getElementById("backButtonBottom")?.addEventListener("click", () => goBack("./tasks.html"));

  attachTaskActionEvents();
  attachOwnerActionEvents();
  attachProfileLinkEvents();

  /* Report a problem about THIS item (goes to admins, not a review) */
  document.getElementById("reportProblemButton")?.addEventListener("click", () => openReportModal(reportTarget));

  /* Owners always get the Offers panel (their negotiations, even after the
     task is taken); anyone else only while the task is open. */
  if (isOwn || canOffer) {
    initOffers({
      contextType: "task",
      contextId: taskId,
      listing: task,
      isOwner: isOwn,
      sectionEl: document.getElementById("offersSection"),
      applyButton: document.getElementById("applyForTaskButton"),
      makeOfferButton: document.getElementById("makeOfferButton"),
      onListingChanged: loadTaskDetails
    });
  }

  document.getElementById("messagePosterButton")?.addEventListener("click", (e) => {
    if (!requireAuthAction("Sign in to message the poster.")) return;
    startConversationAndRedirect("task", taskId, e.currentTarget);
  });
}

/* Text people typed (names, the problem reason) goes into the page as text,
   never as HTML. */
function escapeTaskText(value) {
  return escapeHtml(value);
}

/* ── Report a problem (poster, instead of confirming) ── */
const taskProblemModal   = document.getElementById("taskProblemModal");
const taskProblemForm    = document.getElementById("taskProblemForm");
const taskProblemMessage = document.getElementById("taskProblemMessage");

function openTaskProblemModal() {
  taskProblemForm?.reset();
  if (taskProblemMessage) taskProblemMessage.textContent = "";
  openModal(taskProblemModal);
  document.getElementById("taskProblemReason")?.focus();
}

document.getElementById("cancelTaskProblem")?.addEventListener("click", () => closeModal(taskProblemModal));
document.getElementById("overlay")?.addEventListener("click", () => closeModal(taskProblemModal));

taskProblemForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const reason = document.getElementById("taskProblemReason").value.trim();
  if (reason.length < 10) {
    taskProblemMessage.textContent = "Please describe the problem in at least 10 characters.";
    return;
  }
  const submitBtn = document.getElementById("submitTaskProblem");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Reporting…`;
  try {
    await apiRequest(`/tasks/${taskId}/dispute`, "POST", {
      reason, category: document.getElementById("taskProblemCategory").value
    });
    closeModal(taskProblemModal);
    showToast("Problem reported. The payment stays held while an admin looks at it.");
    await loadTaskDetails();
  } catch (err) {
    taskProblemMessage.textContent = err.message;
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

function attachTaskActionEvents() {
  document.getElementById("reportTaskProblemButton")?.addEventListener("click", openTaskProblemModal);
  /* Arrived from the dashboard's "Report a problem" button. */
  if (window.location.hash === "#report-problem" && document.getElementById("reportTaskProblemButton")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    openTaskProblemModal();
  }

  const start    = document.getElementById("startTaskButton");
  const complete = document.getElementById("completeTaskButton");
  const confirmBtn = document.getElementById("confirmCompletionButton");

  if (start)   start.addEventListener("click",    () => updateTask(start,    `/tasks/${start.dataset.taskId}/status`,    "PATCH", { status: "In Progress" },         "Task started!",   "Starting…"));
  if (complete) complete.addEventListener("click", () => updateTask(complete, `/tasks/${complete.dataset.taskId}/status`, "PATCH", { status: "Awaiting Confirmation" },"Marked as done — awaiting confirmation.", "Submitting…"));
  if (confirmBtn) confirmBtn.addEventListener("click", () => {
    if (!window.confirm("Confirm this task is complete? This releases payment to the worker.")) return;
    updateTask(confirmBtn, `/tasks/${confirmBtn.dataset.taskId}/confirm-completion`, "PATCH", null, "Task completed and payment released!", "Confirming…",
      () => showPaymentMoment("released", `Task completed. ${formatRand(confirmBtn.dataset.taskPrice)} released to the worker.`));
  });
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

/* onSuccess (optional): runs instead of the success toast. Only the
   payment actions (accept, confirm completion) pass one, to play the
   payment pop-up, and those wait longer before leaving the page so the
   pop-up has time to finish. */
async function updateTask(btn, url, method, body, msg, loadingLabel, onSuccess = null) {
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> ${loadingLabel}`;
  try {
    await apiRequest(url, method, body);
    if (onSuccess) onSuccess();
    else showToast(msg);
    setTimeout(() => window.location.href = "./tasks.html", onSuccess ? 2000 : 800);
  } catch (err) {
    showToast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

loadTaskDetails();