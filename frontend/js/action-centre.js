/* ── Action Centre ("Waiting for you") on the dashboard ──
   Lists every open task, offer, sale and rental the user is part of,
   from GET /api/activity: first what needs THEM, then (folded away) what's
   waiting on someone else. Each card says what's happened, who acts next,
   any deadline, and has one main button.

   Simple one-click steps (start / finish a task, confirm completion,
   approve / decline a booking) run right here with the same endpoints the
   detail pages use — the server still checks who's allowed and whether
   the step is valid. Anything needing more (a handover code, photos, a
   counter-offer) links to the page where that happens. */

const actionCentreList    = document.getElementById("actionCentreList");
const actionWaiting       = document.getElementById("actionWaiting");
const actionWaitingList   = document.getElementById("actionWaitingList");
const actionWaitingCount  = document.getElementById("actionWaitingCount");

let actionItems = [];

const ACTION_KIND_ICONS = {
  task: "ti-clipboard-list", offer: "ti-arrows-exchange", sale: "ti-shopping-cart", rental: "ti-building-store"
};
const ACTION_TONE_BADGES = { action: "gold", waiting: "blue", problem: "red" };

function escapeActionText(value) {
  return escapeHtml(value);
}

/* "2026-10-17" (a date) or a full timestamp → "Fri 17 Oct" / "Fri 17 Oct, 14:00",
   plus a short "today / tomorrow / in 3 days / 2 days ago" hint. */
function formatActionDeadline(value) {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const label = date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })
    + (dateOnly ? "" : `, ${date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`);

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  const hint = days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday"
    : days > 1 ? `in ${days} days` : `${-days} days ago`;
  return { label, hint };
}

function actionButtonHtml(item, which, isPrimary) {
  const action = item[which];
  if (!action) return "";
  const cls = isPrimary ? "primary-button" : "secondary-button";
  if (action.type === "link") {
    return `<a href="${escapeActionText(action.href)}" class="${cls} action-btn">${escapeActionText(action.label)}</a>`;
  }
  return `<button type="button" class="${cls} action-btn" data-action-key="${escapeActionText(item.key)}" data-action-which="${which}">
            ${escapeActionText(action.label)}
          </button>`;
}

function actionCardHtml(item) {
  const deadline = formatActionDeadline(item.deadline);
  const amount = item.amount != null ? formatRand(item.amount) : null;
  const meta = [
    deadline ? `<span class="${item.overdue ? "action-meta-overdue" : ""}"><i class="ti ti-clock" aria-hidden="true"></i> ${escapeActionText(item.deadlineLabel || "Due")} ${escapeActionText(deadline.label)} <em>(${deadline.hint})</em></span>` : "",
    amount ? `<span><i class="ti ti-cash" aria-hidden="true"></i> ${amount}${item.payment ? ` · ${escapeActionText(item.payment)}` : ""}</span>` : "",
    item.nextBy && item.nextBy !== "you" ? `<span><i class="ti ti-user" aria-hidden="true"></i> Next: ${escapeActionText(item.nextBy)}</span>` : ""
  ].filter(Boolean).join("");

  const hasButtons = item.action || item.secondaryAction;
  return `
    <article class="action-card tone-${item.tone}">
      <div class="action-card-icon" aria-hidden="true"><i class="ti ${ACTION_KIND_ICONS[item.kind] || "ti-bolt"}"></i></div>
      <div class="action-card-body">
        <div class="action-card-top">
          <span class="action-card-role">${escapeActionText(item.role)}</span>
          <span class="badge ${ACTION_TONE_BADGES[item.tone] || ""}">${escapeActionText(item.status)}</span>
        </div>
        <h3><a href="${escapeActionText(item.href)}">${escapeActionText(item.title)}</a></h3>
        <p class="action-card-step">${escapeActionText(item.step)}</p>
        ${meta ? `<div class="action-card-meta">${meta}</div>` : ""}
      </div>
      <div class="action-card-actions">
        ${hasButtons
          ? actionButtonHtml(item, "action", true) + actionButtonHtml(item, "secondaryAction", false)
          : `<a href="${escapeActionText(item.href)}" class="secondary-button action-btn">View</a>`}
      </div>
    </article>`;
}

async function loadActionCentre() {
  if (!actionCentreList) return;
  try {
    const res = await apiRequest("/activity");
    const { needsYou = [], waitingOnOthers = [] } = res.data || {};
    actionItems = [...needsYou, ...waitingOnOthers];

    actionCentreList.innerHTML = needsYou.length
      ? needsYou.map(actionCardHtml).join("")
      : emptyState("ti-circle-check", "You're all caught up",
          "Nothing needs you right now. New requests, offers and handovers will show up here.");

    actionWaiting.hidden = waitingOnOthers.length === 0;
    actionWaitingCount.textContent = waitingOnOthers.length;
    actionWaitingList.innerHTML = waitingOnOthers.map(actionCardHtml).join("");
  } catch (err) {
    actionCentreList.innerHTML = errorState(err.message || "Couldn't load your next steps.");
  }
}

/* One-click steps. Buttons are disabled while the request runs so a double
   click can't send it twice (the server also refuses repeats). */
async function runInlineAction(button) {
  const item = actionItems.find((i) => i.key === button.dataset.actionKey);
  const action = item?.[button.dataset.actionWhich];
  if (!action || action.type !== "api") return;
  if (action.confirm && !confirm(action.confirm)) return;

  const card = button.closest(".action-card");
  const buttons = card ? card.querySelectorAll("button.action-btn") : [button];
  const originalHtml = button.innerHTML;
  buttons.forEach((b) => { b.disabled = true; });
  button.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Working…`;

  try {
    await apiRequest(action.endpoint, action.method, action.body || null);
    if (action.moment) showPaymentMoment(action.moment, action.success);
    else showToast(action.success || "Done.");
    await loadActionCentre();
    if (typeof refreshActionBadge === "function") refreshActionBadge();
  } catch (err) {
    showToast(err.message, "error");
    buttons.forEach((b) => { b.disabled = false; });
    button.innerHTML = originalHtml;
  }
}

document.addEventListener("click", (e) => {
  const button = e.target.closest("button.action-btn[data-action-key]");
  if (button) runInlineAction(button);
});

loadActionCentre();
