/* ── helpers.js — shared UI utilities ── */

/* Anything a person typed (titles, descriptions, messages, names, bios,
   reviews…) goes into the page as text, never as HTML. Wrap it in
   escapeHtml() wherever it's put into an innerHTML template — including
   attribute values like alt="" and data-*. Safe for both. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;
  const iconMap = { success: "ti-circle-check", error: "ti-circle-x", warning: "ti-alert-triangle" };
  const icon = iconMap[type] || "ti-info-circle";
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${escapeHtml(message)}`;
  toastContainer.appendChild(toast);
  /* Exit the way it entered (see .toast-leaving / toastOut in main.css) —
     add the leaving class first so it plays its own out-animation, then
     remove the element once that's had time to finish, instead of the
     toast just popping out of existence. */
  setTimeout(() => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 200);
  }, 3500);
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
      <p>${escapeHtml(message)}</p>
    </div>`;
}

/* ── Taskify mark loader ──
   The brand symbol (geometry from assets/taskify-2d-badge) with the
   trolley tracing itself in on a loop and a gold arc orbiting it. Used
   for whole-section loads and the slow-network pill; sized like an icon
   (1em), so set font-size on the parent. Styles: .tk-loader in main.css. */
function taskifyMarkLoader(label = "") {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `
    <svg class="tk-loader" viewBox="-12 -12 124 124" ${a11y}>
      <circle class="tkl-orbit" cx="50" cy="50" r="57" fill="none" stroke="#F5B400" stroke-width="5"
              stroke-linecap="round" pathLength="1" stroke-dasharray="0.22 0.78"></circle>
      <circle cx="50" cy="50" r="48" fill="#12A66E"></circle>
      <g transform="translate(3 4)">
        <rect x="33" y="18" width="36" height="10" rx="2.5" fill="#FFFFFF"></rect>
        <rect x="46" y="18" width="10" height="32" rx="1.5" fill="#FFFFFF"></rect>
        <path class="tkl-cart" d="M22 35 H30 L39.5 62 H66 L71.5 48 H43" fill="none" stroke="#FFFFFF"
              stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1"></path>
        <circle class="tkl-wheel" cx="44" cy="71.5" r="4.4" fill="#FFFFFF"></circle>
        <circle class="tkl-wheel w2" cx="62" cy="71.5" r="4.4" fill="#FFFFFF"></circle>
      </g>
    </svg>`;
}

/* ── Skeleton placeholders ──
   A container opts in with data-skeleton="<kind>" (and optionally
   data-skeleton-count). On page load its "Loading…" placeholder is
   swapped for grey shapes shaped like the content that's coming, so the
   page looks nearly ready instead of empty. Each page's own script still
   replaces the container's innerHTML exactly as before — nothing else
   needs to know skeletons exist. When that happens the new content
   eases in once (see .sk-revealing in main.css). */
const SKELETON_TEMPLATES = {
  cards: () => `
    <div class="sk-card" aria-hidden="true">
      <div class="sk sk-media"></div>
      <div class="sk-card-body">
        <div class="sk-row-flex sk-user">
          <span class="sk sk-circle" style="width:32px;height:32px;"></span>
          <div><span class="sk sk-line sk-w45"></span><span class="sk sk-line sk-w30" style="margin:0;"></span></div>
        </div>
        <span class="sk sk-line lg sk-w90"></span>
        <span class="sk sk-line lg sk-w60"></span>
        <div class="sk-tags">
          <span class="sk sk-pill" style="width:72px;"></span>
          <span class="sk sk-pill" style="width:88px;"></span>
          <span class="sk sk-pill" style="width:58px;"></span>
        </div>
        <div class="sk-footer">
          <span class="sk sk-line xl" style="width:76px;margin:0;"></span>
          <span class="sk" style="width:78px;height:32px;border-radius:999px;"></span>
        </div>
      </div>
    </div>`,
  rows: () => `
    <div class="sk-hrow" aria-hidden="true">
      <div class="sk sk-media"></div>
      <div>
        <span class="sk sk-line lg sk-w60"></span>
        <span class="sk sk-line sk-w90"></span>
        <span class="sk sk-line sk-w75"></span>
        <div class="sk-row-flex" style="margin-top:12px;">
          <span class="sk sk-pill" style="width:70px;"></span>
          <span class="sk sk-pill" style="width:90px;"></span>
        </div>
      </div>
    </div>`,
  mini: () => `
    <div class="sk-mini" aria-hidden="true">
      <div class="sk sk-media"></div>
      <div><span class="sk sk-line sk-w75"></span><span class="sk sk-line sk-w45"></span></div>
    </div>`,
  items: () => `
    <div class="sk-item" aria-hidden="true">
      <span class="sk sk-circle" style="width:38px;height:38px;"></span>
      <div>
        <span class="sk sk-line lg sk-w45"></span>
        <span class="sk sk-line sk-w90"></span>
        <span class="sk sk-line sk-w20" style="margin:0;"></span>
      </div>
    </div>`,
  detail: () => `
    <div class="detail-layout sk-detail" aria-hidden="true">
      <div class="detail-main">
        <div class="sk sk-media"></div>
        <span class="sk sk-pill" style="width:84px;margin-bottom:14px;"></span>
        <span class="sk sk-line xl sk-w75" style="height:28px;margin-bottom:16px;"></span>
        <span class="sk sk-line sk-w90"></span>
        <span class="sk sk-line sk-w90"></span>
        <span class="sk sk-line sk-w60"></span>
        <div class="sk-row-flex" style="margin-top:18px;">
          <span class="sk sk-pill" style="width:80px;"></span>
          <span class="sk sk-pill" style="width:96px;"></span>
          <span class="sk sk-pill" style="width:64px;"></span>
        </div>
      </div>
      <div class="sk-side">
        <span class="sk sk-line sk-w45"></span>
        <span class="sk sk-line xl sk-w60" style="height:30px;margin-bottom:18px;"></span>
        <div class="sk-row-flex" style="margin-bottom:14px;">
          <span class="sk sk-circle" style="width:40px;height:40px;"></span>
          <div style="flex:1;"><span class="sk sk-line sk-w60"></span><span class="sk sk-line sk-w45" style="margin:0;"></span></div>
        </div>
        <span class="sk sk-line sk-w90"></span>
        <span class="sk sk-line sk-w75"></span>
        <div class="sk sk-btn"></div>
      </div>
    </div>`,
  profile: () => `
    <div aria-hidden="true" style="width:100%;max-width:340px;">
      <span class="sk sk-line xl sk-w60" style="height:24px;margin-bottom:12px;"></span>
      <span class="sk sk-line sk-w90"></span>
      <span class="sk sk-line sk-w45"></span>
    </div>`
};

const SKELETON_DEFAULT_COUNT = { cards: 6, rows: 3, mini: 3, items: 5, detail: 1, profile: 1 };

function skeletonHtml(kind, count) {
  const template = SKELETON_TEMPLATES[kind];
  if (!template) return "";
  const n = count || SKELETON_DEFAULT_COUNT[kind] || 3;
  return Array.from({ length: n }, template).join("");
}

/* Put a skeleton into a container right now (also used by pages that
   reload a list after the first load, e.g. opening a chat thread). */
function showSkeleton(container, kind, { count, label = "Loading…" } = {}) {
  if (!container) return;
  container.innerHTML = `${skeletonHtml(kind, count)}<span class="sr-only" role="status">${label}</span>`;
  watchSkeletonReveal(container);
}

function watchSkeletonReveal(container) {
  if (container._skObserver) container._skObserver.disconnect();
  const observer = new MutationObserver(() => {
    if (container.querySelector(".sk")) return;   // still (or again) a skeleton
    observer.disconnect();
    container._skObserver = null;
    container.classList.add("sk-revealing");
    setTimeout(() => container.classList.remove("sk-revealing"), 700);
  });
  observer.observe(container, { childList: true });
  container._skObserver = observer;
}

function hydrateSkeletons(scope = document) {
  scope.querySelectorAll("[data-skeleton]").forEach(container => {
    /* Only replace the static "Loading…" placeholder — if the page's own
       script has already rendered real content, leave it alone. */
    const placeholder = container.querySelector(".ti-loader");
    if (!placeholder) return;
    const label = (container.querySelector("h3, .rail-loading, p")?.textContent || "Loading…").trim();
    showSkeleton(container, container.dataset.skeleton, {
      count: Number(container.dataset.skeletonCount) || undefined,
      label
    });
  });

  /* Any other big "Loading…" panel gets the Taskify mark instead of the
     generic ring. */
  scope.querySelectorAll(".empty-state-icon > .ti-loader").forEach(icon => {
    icon.outerHTML = taskifyMarkLoader();
  });
}

hydrateSkeletons();

/* ── Images fade in instead of painting in strips ──
   Listing and detail photos come from Cloudinary and can take a moment
   on mobile data. While one is still downloading, its frame shimmers;
   when it lands it fades in. Watches the whole page, so cards rendered
   later by any page script are covered without changes there. Images
   that are already loaded (cache) are left alone — no flash. */
const FADE_IMAGE_SELECTOR = ".market-image img, .detail-image-single img, .image-gallery-main img, .image-gallery-thumb img";

function prepareFadeImage(img) {
  if (img.dataset.fadeBound || !img.matches(FADE_IMAGE_SELECTOR)) return;
  img.dataset.fadeBound = "1";
  if (img.complete && img.naturalWidth) return;

  const frame = img.parentElement;
  img.classList.add("img-fade", "img-pending");
  frame?.classList.add("media-loading");
  const done = () => {
    img.classList.remove("img-pending");
    frame?.classList.remove("media-loading");
  };
  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });
}

/* Gallery thumbnails swap the main image's src; re-arm the fade for it. */
function rearmFadeImage(img) {
  if (!img || (img.complete && img.naturalWidth)) return;
  delete img.dataset.fadeBound;
  prepareFadeImage(img);
}

(function watchImagesForFade() {
  if (!("MutationObserver" in window)) return;
  document.querySelectorAll(FADE_IMAGE_SELECTOR).forEach(prepareFadeImage);
  new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === "IMG") prepareFadeImage(node);
        else if (node.querySelector) node.querySelectorAll("img").forEach(prepareFadeImage);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
})();

function avatarInitials(name = "") {
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function avatarHtml(name = "", photoUrl = null, options = {}) {
  const { lightbox = true } = options;

  if (photoUrl && typeof photoUrl === "string" && photoUrl.trim()) {
    if (!lightbox) {
      return `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || "User")}" />`;
    }
    const gallery = `avatar-${Math.random().toString(36).slice(2, 9)}`;
    return `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || "User")}" class="lightbox-img" data-gallery="${gallery}" data-full="${escapeHtml(photoUrl)}" />`;
  }
  return escapeHtml(avatarInitials(name));
}

function requireAuth() {
  if (!localStorage.getItem("taskifyToken") || !localStorage.getItem("taskifyUser")) {
    window.location.href = "./login.html";
    return null;
  }
  return JSON.parse(localStorage.getItem("taskifyUser"));
}

/* Like requireAuth(), but never redirects — used on pages that guests are
   allowed to browse (tasks/equipment/sales/events lists and their detail
   pages). Returns the logged-in user, or null for a guest; callers are
   responsible for guarding anything that actually needs an account. */
function getCurrentUser() {
  try {
    const raw = localStorage.getItem("taskifyToken") ? localStorage.getItem("taskifyUser") : null;
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/* Gate a single action (post a task, accept, book, RSVP, message, review…)
   behind having an account, on a page a guest is otherwise allowed to
   browse. Call it at the top of the click handler / form submit — returns
   true and does nothing if logged in; for a guest it shows a toast and
   sends them to login, then returns false so the caller can just
   `if (!requireAuthAction()) return;`. (Doesn't carry a return-to URL —
   login doesn't support that yet, same as every other login redirect in
   the app today.) */
function requireAuthAction(message = "Create an account or sign in to do that.") {
  if (getCurrentUser()) return true;
  showToast(message, "warning");
  setTimeout(() => { window.location.href = "./login.html"; }, 900);
  return false;
}

function myProfileUrl(user) {
  return user?.member_type === "Lecturer" ? "./lecturer-profile.html" : "./profile.html";
}

/* Prefixes a lecturer's title onto their name ("Dr. Lerato Maseko"). Used
   anywhere a poster/organizer/reviewer/sender name is shown, so lecturer
   identity is consistent everywhere without each caller reimplementing it. */
function posterName(name, lecturerTitle) {
  return lecturerTitle ? `${lecturerTitle} ${name}` : (name || "");
}

function badge(label, variant = "") {
  return `<div class="badge ${variant}">${label}</div>`;
}

function sectionBadge(section) {
  const cls = section === "Academic" ? "" : "blue";
  return `<div class="badge ${cls}">${escapeHtml(section)}</div>`;
}

/* Sales use New/Excellent/Good/Fair/Used; equipment uses
   Excellent/Functional/Damaged (panel feedback). An equipment listing made
   before conditions were saved has none — callers decide what to show. */
function conditionBadge(condition) {
  if (!condition) return "";
  const map = { New: "", Excellent: "", Good: "blue", Functional: "blue", Fair: "gold", Used: "gold", Damaged: "red" };
  const icon = condition === "Damaged" ? `<i class="ti ti-alert-triangle" aria-hidden="true"></i> ` : "";
  return `<div class="badge ${map[condition] ?? ""}">${icon}${escapeHtml(condition)}</div>`;
}

/* Equipment condition — keep in sync with EQUIPMENT_CONDITIONS in
   backend/src/services/equipment.service.js. */
const EQUIPMENT_CONDITIONS = {
  Excellent:  "Like new. No marks, everything works.",
  Functional: "Works properly. May have small signs of use.",
  Damaged:    "Has damage. Explain what's wrong in the description."
};

/* "Last checked by Rita (renter) on 2 Oct 2026" — the panel's
   "Inspected by". The owner sets the condition when listing, the renter
   confirms it at pickup, and the owner confirms it again at return. */
function equipmentConditionCheckedText(item) {
  if (!item.condition_status) return "The owner hasn't stated a condition for this item yet.";
  if (!item.condition_checked_by_name) return "";
  const role = Number(item.condition_checked_by) === Number(item.owner_id) ? "owner" : "renter";
  const when = item.condition_checked_at
    ? ` on ${new Date(item.condition_checked_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  return `Last checked by ${item.condition_checked_by_name} (${role})${when}`;
}

function statusBadge(status) {
  const map = {
    Posted: "blue", Accepted: "gold", "In Progress": "gold",
    "Awaiting Confirmation": "gold", Disputed: "red",
    Completed: "", Cancelled: "red", Available: "", Booked: "gold", Returned: "",
    Upcoming: "blue", Reserved: "gold", Pending: "gold", Confirmed: "blue", "Awaiting Payment": "gold",
    /* offer statuses (Pending/Accepted above are shared) */
    Declined: "red", Withdrawn: "navy", Expired: "navy"
  };
  return `<div class="badge ${map[status] ?? ""}">${escapeHtml(status)}</div>`;
}

/* ── Feature switches (backend config/features.js, GET /api/features) ──
   Anything marked data-feature="name" stays hidden (layout-v2.css) unless
   that feature is on. The server refuses switched-off features anyway;
   this just keeps their buttons out of sight. */
let taskifyFeaturesPromise = null;
function loadFeatures() {
  if (!taskifyFeaturesPromise) {
    taskifyFeaturesPromise = fetch(`${API_BASE_URL}/features`)
      .then((res) => res.json())
      .then((json) => json.data || {})
      .catch(() => ({}));
  }
  return taskifyFeaturesPromise;
}

async function applyFeatureSwitches(scope = document) {
  const features = await loadFeatures();
  scope.querySelectorAll("[data-feature]").forEach((el) => {
    el.classList.toggle("feature-on", !!features[el.dataset.feature]);
  });
  return features;
}
document.addEventListener("DOMContentLoaded", () => applyFeatureSwitches());

/* ── Rentals: dates, deadlines and terms ──
   Shared by the rental pages. Times are always shown in South African
   time, whatever timezone the viewer's device is set to. */
const TASKIFY_TIME_ZONE = "Africa/Johannesburg";

function todayInSast() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TASKIFY_TIME_ZONE }).format(new Date());
}

/* "2026-10-11" → "Sun 11 Oct" */
function rentalDate(dateText) {
  if (!dateText) return "";
  const [y, m, d] = String(dateText).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/* A moment → "Sun 11 Oct, 18:00" (South African time) */
function rentalDeadline(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: TASKIFY_TIME_ZONE });
  const time = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TASKIFY_TIME_ZONE });
  return `${date}, ${time}`;
}

/* The rental terms (from the API's `terms`): when it's due back, paying,
   cancelling, and the three money rules with their review status. */
function rentalTermsHtml(terms) {
  if (!terms) return "";
  const rule = (icon, title, r) => `
    <li><i class="ti ${icon}" aria-hidden="true"></i>
      <span><strong>${title}</strong> <em class="rental-rule-status${r.inEffect ? " on" : ""}">${escapeReportText(r.statusLabel)}</em><br>${escapeReportText(r.summary)}</span></li>`;
  return `
    <ul class="rental-terms">
      <li><i class="ti ti-clock" aria-hidden="true"></i>
        <span><strong>Return deadline</strong><br>${escapeReportText(terms.returnTime)} (South African time) on your last day. Ask for an extension before then if you need it longer.</span></li>
      <li><i class="ti ti-credit-card" aria-hidden="true"></i>
        <span><strong>Paying</strong><br>You pay only after the owner approves, and then have up to ${Number(terms.paymentWindowHours)} hours (demo payment).</span></li>
      <li><i class="ti ti-arrow-back-up" aria-hidden="true"></i>
        <span><strong>Cancelling</strong><br>${escapeReportText(terms.cancellation?.summary || "")}</span></li>
      ${terms.returning ? `<li><i class="ti ti-package-import" aria-hidden="true"></i>
        <span><strong>Returning it</strong><br>${escapeReportText(terms.returning.summary)}</span></li>` : ""}
      ${terms.protectionFund ? `<li><i class="ti ti-shield-check" aria-hidden="true"></i>
        <span><strong>Protection fee</strong> <em class="rental-rule-status on">In effect (demo)</em><br>${escapeReportText(terms.protectionFund.summary)}</span></li>` : ""}
      ${rule("ti-shield-lock", "Deposit", terms.deposit)}
      ${rule("ti-calendar-minus", "Returning early", terms.earlyReturn)}
      ${rule("ti-calendar-exclamation", "Returning late", terms.lateReturn)}
    </ul>
    <p class="pay-note" style="font-size:11px;">Terms version ${escapeReportText(terms.policyVersion)}.</p>`;
}

/* ── Payment simulation helpers (DEMO — no real money moves) ──
   Shared by the rental (equipment) and sales pages. All the numbers come
   from the backend (config/paymentSettings.js); these only format them. */
function formatRand(amount) {
  return `R${Number(amount || 0).toFixed(2)}`;
}

function demoPaymentBanner(text) {
  return `
    <div class="demo-pay-banner">
      <i class="ti ti-info-circle" aria-hidden="true"></i>
      <span><strong>Demo mode.</strong> ${text}</span>
    </div>`;
}

function moneyRow(label, amount, { strong = false, hint = "" } = {}) {
  return `
    <div class="money-row${strong ? " strong" : ""}">
      <span>${label}${hint ? `<small>${hint}</small>` : ""}</span>
      <span>${formatRand(amount)}</span>
    </div>`;
}

/* "Food" / "Refreshments" tags on an event (the organizer ticks these when
   posting or editing it). Empty string when neither is provided. */
function eventFoodTags(event) {
  return (Number(event.has_food) ? `<div class="market-tag"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i> Food stalls</div>` : "")
    + (Number(event.has_refreshments) ? `<div class="market-tag"><i class="ti ti-cup" aria-hidden="true"></i> Drinks on sale</div>` : "");
}

/* Edit mode for the create forms: an owner's Edit button on a detail page
   links to e.g. tasks.html?edit=12, and that page opens its create form
   pre-filled. clearEditParam() tidies the address bar afterwards so a
   refresh doesn't reopen the form. */
function getEditIdFromUrl() {
  const id = new URLSearchParams(window.location.search).get("edit");
  return id && /^\d+$/.test(id) ? id : null;
}

function clearEditParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("edit");
  history.replaceState(null, "", url);
}

/* Brand "Payment held" / "Payment released" pop-up (taskify-motion.js).
   Call it only after the API call has succeeded — it replaces the success
   toast. If the motion script isn't on the page it falls back to a normal
   toast, so a successful action can never end up in a catch block. */
function showPaymentMoment(type, message, options = {}) {
  if (window.TaskifyMotion) TaskifyMotion.moment(type, { ...options, message });
  else showToast(message);
}

/* Renter trust level chip — level key is "new" | "trusted" | "top". */
function trustChip(level, label) {
  const icon = level === "top" ? "ti-crown" : level === "trusted" ? "ti-shield-check" : "ti-seedling";
  return `<span class="trust-chip ${escapeHtml(level || "new")}"><i class="ti ${icon}" aria-hidden="true"></i> ${escapeHtml(label || "New")} renter</span>`;
}

/* Small row of clickable condition-photo thumbnails (pickup/return). */
function conditionPhotoStrip(urls = [], galleryId = "") {
  if (!Array.isArray(urls) || !urls.length) return "";
  return `
    <div class="condition-photo-strip">
      ${urls.map(url => `<img src="${escapeHtml(url)}" alt="Condition photo" class="lightbox-img" data-gallery="${escapeHtml(galleryId)}" data-full="${escapeHtml(url)}" />`).join("")}
    </div>`;
}

/* Shown on a poster's own task/listing/event when it's held under
   moderation review (moderation_status === 'pending_review') — it isn't
   visible to anyone else yet, so this is the only place a badge like this
   is needed. Returns "" for anything else (clean/removed/undefined), so
   callers can drop it inline without an extra condition. */
function pendingReviewBadge(moderationStatus) {
  if (moderationStatus !== "pending_review") return "";
  return `<div class="badge gold" title="Only visible to you until an admin reviews it">
            <i class="ti ti-alert-triangle" aria-hidden="true"></i> Pending Review
          </div>`;
}

/* Short content-policy reminder shown just above the submit button on the
   task/sales/equipment/event creation forms, so posters see it right
   before they publish rather than only after something gets flagged. */
function contentPolicyNotice() {
  return `
    <div style="display:flex;gap:10px;align-items:flex-start;background:rgba(245,180,0,0.08);border:1px solid rgba(245,180,0,0.25);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:12.5px;color:var(--muted);line-height:1.5;">
      <i class="ti ti-shield-exclamation" aria-hidden="true" style="color:#b38900;font-size:16px;flex-shrink:0;margin-top:1px;"></i>
      <span><strong>Keep it appropriate.</strong> Threats, violence, hate speech, sexual content or anything promoting self-harm aren't allowed on Taskify. Posts that violate this are blocked or held for admin review before anyone else can see them, and repeat violations can lead to account suspension.</span>
    </div>`;
}

/* ── Endorsement / lecturer UI helpers ──
   These read the endorsed_by_lecturer_* and *_member_type / *_lecturer_title
   fields the backend now attaches to tasks, equipment, sales, and events. */

function endorsementBadge(item) {
  if (!item || !item.endorsed_by_lecturer_name) return "";
  const title = item.endorsed_by_lecturer_title ? `${escapeHtml(item.endorsed_by_lecturer_title)} ` : "";
  return `<div class="market-tag" style="background:rgba(108,61,255,0.10);color:#6c3dff;">
            <i class="ti ti-certificate" aria-hidden="true"></i> Recommended by ${title}${escapeHtml(item.endorsed_by_lecturer_name)}
          </div>`;
}

/* Small ribbon shown on the card image itself (top-left). shiftDown lets
   task cards avoid colliding with the existing urgent-badge, which also
   sits top-left. */
function endorsementCornerBadge(item, { shiftDown = false } = {}) {
  if (!item || !item.endorsed_by_lecturer_name) return "";
  const title = item.endorsed_by_lecturer_title ? `${escapeHtml(item.endorsed_by_lecturer_title)} ` : "";
  return `<div class="corner-badge corner-badge-left${shiftDown ? " shift-down" : ""}" title="Recommended by ${title}${escapeHtml(item.endorsed_by_lecturer_name)}">
            <i class="ti ti-certificate" aria-hidden="true"></i> Recommended
          </div>`;
}

/* Small ribbon (top-right) shown when the poster/organizer/owner/seller
   themselves is a verified lecturer account. */
/* Only for lecturers an admin has verified — choosing "Lecturer" at
   sign-up isn't enough (verified comes from the API's *_lecturer_verified). */
function lecturerPostedCornerBadge(memberType, verified) {
  if (memberType !== "Lecturer" || !Number(verified)) return "";
  return `<div class="corner-badge corner-badge-right lecturer" title="Posted by a verified lecturer">
            <i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Lecturer
          </div>`;
}

/* Larger, quote-styled block for detail pages — this is where the
   lecturer's actual endorsement message becomes visible and readable,
   rather than just a name in a small pill. */
function endorsementDetailBlock(item) {
  if (!item || !item.endorsed_by_lecturer_name) return "";
  const title = item.endorsed_by_lecturer_title ? `${escapeHtml(item.endorsed_by_lecturer_title)} ` : "";
  return `
    <div class="endorsement-detail-block">
      <div class="endorsement-detail-header">
        <div class="market-avatar" style="width:36px;height:36px;">${avatarHtml(item.endorsed_by_lecturer_name, item.endorsed_by_lecturer_photo)}</div>
        <div>
          <div class="profile-link" data-user-id="${escapeHtml(item.endorsed_by_lecturer_id)}" style="cursor:pointer;font-weight:700;font-size:13px;">${title}${escapeHtml(item.endorsed_by_lecturer_name)}</div>
          <div class="endorsement-badge ${escapeHtml((item.endorsement_type || "General").toLowerCase())}" style="margin-top:3px;">
            <i class="ti ti-certificate" aria-hidden="true"></i> ${escapeHtml(item.endorsement_type || "General")} Endorsement
          </div>
        </div>
      </div>
      ${item.endorsement_message
        ? `<p class="endorsement-detail-quote">"${escapeHtml(item.endorsement_message)}"</p>`
        : `<p class="endorsement-detail-quote" style="font-style:italic;opacity:0.8;">Personally recommended by this lecturer.</p>`}
    </div>`;
}

/* Navigates back using real browser history when the visit came from
   within Taskify (so back returns to whatever filtered/search state the
   person was actually on); falls back to a fixed URL otherwise (e.g. the
   page was opened directly, in a new tab, or via a shared link). */
function goBack(fallbackUrl) {
  const cameFromSameSite = document.referrer && document.referrer.startsWith(window.location.origin);
  if (cameFromSameSite && window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = fallbackUrl;
  }
}

async function startConversationAndRedirect(contextType, contextId, triggerBtn = null) {
  let originalHtml = null;
  if (triggerBtn) {
    originalHtml = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<span class="busy-icon busy-dots" aria-hidden="true"><span></span><span></span><span></span></span> Opening chat…`;
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
              <span style="font-size:13px;font-weight:600;">${escapeHtml(r.reviewer_name)}</span>
              <div class="badge"><i class="ti ti-star" aria-hidden="true"></i> ${escapeHtml(r.rating)}/5</div>
            </div>
            <p style="font-size:13px;color:var(--muted);">${escapeHtml(r.comment || "No comment provided.")}</p>
          </div>`).join("")
      : `<p style="color:var(--muted);font-size:13px;">No reviews yet.</p>`;

    const lecturerBlock = isLecturer ? `
      <div class="market-tags" style="margin-bottom:14px;">
        <div class="lecturer-title-badge"><i class="ti ti-chalkboard" aria-hidden="true"></i> ${escapeHtml(profile.lecturer_title || "")} Verified Lecturer</div>
      </div>
      ${profile.skills?.length ? `
        <div style="margin-bottom:14px;">
          <h4 style="font-size:12px;font-weight:700;margin-bottom:6px;">Expertise</h4>
          <div class="market-tags">${profile.skills.map(s => `<div class="market-tag">${escapeHtml(s)}</div>`).join("")}</div>
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
          <div class="endorsement-badge ${escapeHtml(e.endorsement_type.toLowerCase())}" style="margin:0 6px 6px 0;">
            <i class="ti ti-certificate" aria-hidden="true"></i> ${escapeHtml(e.endorsement_type)} — ${escapeHtml(e.lecturer_title || "")} ${escapeHtml(e.lecturer_name)}
          </div>`).join("")}
      </div>` : "";

    profileContent.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div class="market-avatar" style="width:48px;height:48px;font-size:16px;">${avatarHtml(profile.full_name, profile.profilePhoto)}</div>
        <div>
          <div style="font-weight:700;font-size:15px;">${escapeHtml(posterName(profile.full_name, profile.lecturer_title))}</div>
          ${profile.email ? `<div style="font-size:12px;color:var(--muted);">${escapeHtml(profile.email)}</div>` : ""}
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
        <div class="badge blue">${escapeHtml(profile.member_type || "Student")}</div>
        ${isLecturer ? (profile.lecturer_verified
          ? `<div class="badge"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Verified lecturer</div>`
          : `<div class="badge gold">Lecturer — not yet verified</div>`) : ""}
        ${profile.role === "admin" ? `<div class="badge navy"><i class="ti ti-shield-lock" aria-hidden="true"></i> Admin</div>` : ""}
      </div>
      <div style="background:var(--background);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:13px;">
        ${profile.student_number !== undefined ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Student/Staff No.</span><strong>${escapeHtml(profile.student_number || "Not provided")}</strong></div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Faculty</span><strong>${escapeHtml(profile.faculty || "Not provided")}</strong></div>
        ${profile.member_type === "Student" ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:var(--muted);">Academic Year</span><strong>${escapeHtml(profile.academic_year || "Not provided")}</strong></div>` : ""}
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

/* ── Client-side photo shrinking ──
   The server stores listing photos at max 1200×900 regardless, so a
   12-megapixel phone photo is ~90% wasted upload. Anything big is redrawn
   at up to 1600px on its longest side as a JPEG before it's sent. If the
   browser can't decode it, or the result isn't actually smaller, the
   original file is sent unchanged. */
const SHRINK_MAX_SIDE = 1600;
const SHRINK_MIN_BYTES = 1.2 * 1024 * 1024;

function shouldShrinkImage(file) {
  return file.size > SHRINK_MIN_BYTES && /^image\/(jpe?g|png|webp)$/.test(file.type);
}

async function shrinkImageForUpload(file) {
  if (!shouldShrinkImage(file)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, SHRINK_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";   // PNG transparency becomes white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* The visible side of an upload: the ring overlay on the drop zone, the
   per-thumbnail fill, and the submit button's progress. Returned as a
   small controller so initImageUploader's upload() reads as a list of
   stages. */
function uploadProgressUi(uploadArea, thumbs, noun) {
  const overlay = document.createElement("div");
  overlay.className = "upload-area-loading-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="upload-ring">
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <circle class="track" cx="29" cy="29" r="25"></circle>
        <circle class="fill" cx="29" cy="29" r="25" pathLength="1"></circle>
      </svg>
      <div class="pct"><i class="ti ti-cloud-upload busy-icon busy-lift" aria-hidden="true"></i></div>
    </div>
    <span class="upload-stage">Getting ready…</span>
    <span class="upload-stage-hint"></span>`;
  uploadArea.classList.add("uploading");
  uploadArea.appendChild(overlay);

  const ring = overlay.querySelector(".upload-ring");
  const fill = overlay.querySelector(".fill");
  const pct = overlay.querySelector(".pct");
  const stageEl = overlay.querySelector(".upload-stage");
  const hintEl = overlay.querySelector(".upload-stage-hint");

  thumbs.forEach(item => {
    item.classList.add("is-uploading");
    item.insertAdjacentHTML("beforeend", `<div class="upload-thumb-progress"></div>`);
  });

  /* Mirror progress on the form's submit button (if it's mid-submit). */
  const button = uploadArea.closest("form")?.querySelector("button[type='submit']");
  const buttonBusy = button && button.disabled;
  const buttonHtml = buttonBusy ? button.innerHTML : "";
  if (buttonBusy) button.classList.add("has-progress");

  function setButton(label, fraction) {
    if (!buttonBusy) return;
    button.innerHTML = `<i class="ti ti-cloud-upload busy-icon busy-lift" aria-hidden="true"></i> ${label}`;
    button.style.setProperty("--btn-progress", String(fraction));
  }

  let savingTimer = null;

  return {
    stage(text, hint = "") {
      stageEl.textContent = text;
      hintEl.textContent = hint;
      setButton(text, 0);
    },
    progress(fraction, sizes) {
      const percent = Math.min(99, Math.round(fraction * 100));
      fill.style.strokeDashoffset = String(1 - fraction);
      pct.textContent = `${percent}%`;
      setButton(`Uploading ${noun}… ${percent}%`, fraction);

      /* Thumbnails clear in order, each by its own share of the bytes. */
      const total = sizes.reduce((a, b) => a + b, 0) || 1;
      let sent = fraction * total;
      thumbs.forEach((item, i) => {
        const size = sizes[i] || 0;
        const own = size ? Math.max(0, Math.min(1, sent / size)) : 1;
        sent -= size;
        const shade = item.querySelector(".upload-thumb-progress");
        if (shade) shade.style.transform = `scaleY(${1 - own})`;
      });
    },
    processing(text, hint) {
      if (ring.classList.contains("is-processing")) return;
      ring.classList.add("is-processing");
      pct.innerHTML = "";
      thumbs.forEach(item => {
        const shade = item.querySelector(".upload-thumb-progress");
        if (shade) shade.style.transform = "scaleY(0)";
      });
      this.stage(text, hint);
      if (buttonBusy) button.style.setProperty("--btn-progress", "1");
      savingTimer = setTimeout(() => {
        stageEl.textContent = `Saving your ${noun}…`;
        hintEl.textContent = "Nearly done.";
      }, 3500);
    },
    done(text) {
      clearTimeout(savingTimer);
      ring.classList.remove("is-processing");
      fill.style.strokeDashoffset = "0";
      pct.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i>`;
      stageEl.textContent = text;
      hintEl.textContent = "";
      thumbs.forEach(item => {
        item.querySelector(".upload-thumb-progress")?.remove();
        item.insertAdjacentHTML("beforeend", `<span class="upload-thumb-done" aria-hidden="true"><i class="ti ti-check"></i></span>`);
      });
    },
    remove() {
      clearTimeout(savingTimer);
      overlay.remove();
      uploadArea.classList.remove("uploading");
      thumbs.forEach(item => {
        item.classList.remove("is-uploading");
        item.querySelector(".upload-thumb-progress")?.remove();
        item.querySelector(".upload-thumb-done")?.remove();
      });
      if (buttonBusy) {
        button.classList.remove("has-progress");
        button.style.removeProperty("--btn-progress");
        button.innerHTML = buttonHtml;
      }
    }
  };
}

function initImageUploader(uploadAreaId, previewGridId) {
  const uploadArea  = document.getElementById(uploadAreaId);
  const previewGrid = document.getElementById(previewGridId);
  if (!uploadArea || !previewGrid) return null;

  let selectedFiles = [];
  /* Photos already saved on a listing (edit mode) — shown first, each
     removable. upload() only sends the new files; the caller combines
     getExisting() with what upload() returns. */
  let existingUrls = [];

  const fileInput = document.createElement("input");
  fileInput.type     = "file";
  fileInput.accept   = "image/jpeg,image/png,image/webp";
  fileInput.multiple = true;
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  /* Object URLs for the new files' previews — instant (no base64 encode
     of a 10MB phone photo) and kept in the order the files were picked. */
  const previewUrls = new Map();
  let justAdded = new Set();
  let uploading = false;

  uploadArea.addEventListener("click", () => { if (!uploading) fileInput.click(); });

  uploadArea.addEventListener("dragover", e => {
    e.preventDefault();
    if (!uploading) uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", e => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    if (!uploading) handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener("change", () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });

  function previewUrlFor(file) {
    if (!previewUrls.has(file)) previewUrls.set(file, URL.createObjectURL(file));
    return previewUrls.get(file);
  }

  function forgetPreview(file) {
    const url = previewUrls.get(file);
    if (url) URL.revokeObjectURL(url);
    previewUrls.delete(file);
  }

  function handleFiles(newFiles) {
    const imageFiles = newFiles.filter(f =>
      ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type)
    );
    if (!imageFiles.length) {
      showToast("Only JPEG, PNG or WebP images are allowed.", "error");
      return;
    }
    const remaining = 5 - existingUrls.length - selectedFiles.length;
    if (remaining <= 0) {
      showToast("Maximum 5 images allowed.", "warning");
      return;
    }
    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      showToast(`Only ${remaining} more image(s) can be added.`, "warning");
    }
    selectedFiles = [...selectedFiles, ...toAdd];
    justAdded = new Set(toAdd);
    renderPreviews();
    justAdded = new Set();
  }

  function renderPreviews() {
    previewGrid.innerHTML = "";
    existingUrls.forEach((url, index) => {
      const item = document.createElement("div");
      item.className = "upload-preview-item";
      item.innerHTML = `
        <img alt="Saved image ${index + 1}" />
        <button type="button" class="upload-remove-btn" aria-label="Remove image">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>`;
      item.querySelector("img").src = url;
      item.querySelector(".upload-remove-btn").addEventListener("click", () => {
        existingUrls.splice(index, 1);
        renderPreviews();
      });
      previewGrid.appendChild(item);
    });
    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = `upload-preview-item${justAdded.has(file) ? " is-new" : ""}`;
      item.dataset.newIndex = String(index);
      item.innerHTML = `
        <img alt="Preview ${index + 1}" />
        <button type="button" class="upload-remove-btn" data-index="${index}" aria-label="Remove image">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>`;
      item.querySelector("img").src = previewUrlFor(file);
      item.querySelector(".upload-remove-btn").addEventListener("click", () => {
        forgetPreview(file);
        selectedFiles.splice(index, 1);
        renderPreviews();
      });
      previewGrid.appendChild(item);
    });
    const total = existingUrls.length + selectedFiles.length;
    uploadArea.classList.toggle("has-files", total > 0);
    const counter = uploadArea.querySelector(".upload-counter");
    if (counter) counter.textContent = `${total}/5 images`;
  }

  /* ── Upload with visible progress ──
     Stages the person sees, in order:
       1. "Preparing photos…"   big phone photos are shrunk in the browser
                                 first (the server caps them at 1200×900
                                 anyway), which can make the upload many
                                 times faster on mobile data
       2. "Uploading… 42%"      real bytes sent; each thumbnail clears
                                 from the bottom as its own bytes go out
       3. "Checking photos…"    all bytes sent; the server runs the
                                 content-safety check, then saves them
       4. "Photos uploaded"     ticks on every thumbnail, then the caller
                                 carries on (e.g. posting the listing)
     The form's submit button mirrors the same progress, because on some
     forms the drop zone has scrolled out of view by the time you submit. */
  async function upload(folder = "general") {
    if (!selectedFiles.length) return [];
    uploading = true;

    const count = selectedFiles.length;
    const noun = count > 1 ? "photos" : "photo";
    const thumbs = Array.from(previewGrid.querySelectorAll(".upload-preview-item[data-new-index]"));
    const ui = uploadProgressUi(uploadArea, thumbs, noun);

    try {
      const needsShrinking = selectedFiles.some(shouldShrinkImage);
      if (needsShrinking) ui.stage(`Preparing ${noun}…`, "Making them lighter so they upload faster.");
      const prepared = await Promise.all(selectedFiles.map(shrinkImageForUpload));

      const tooBig = prepared.findIndex(file => file.size > 5 * 1024 * 1024);
      if (tooBig !== -1) throw new Error(`Image ${tooBig + 1} is larger than 5MB. Choose a smaller photo.`);

      const formData = new FormData();
      prepared.forEach(file => formData.append("images", file));
      const sizes = prepared.map(file => file.size);

      ui.stage(`Uploading ${count} ${noun}…`);
      const response = await apiMultipartRequest(`/upload?folder=${encodeURIComponent(folder)}`, "POST", formData, null, {
        onUploadProgress: fraction => {
          if (fraction >= 1) {
            ui.processing(`Checking your ${noun}…`, "A quick safety check before they go live.");
          } else {
            ui.progress(fraction, sizes);
          }
        }
      });

      ui.done(`${count > 1 ? "Photos" : "Photo"} uploaded`);
      await new Promise(resolve => setTimeout(resolve, 450));
      return response.data.urls;
    } finally {
      uploading = false;
      ui.remove();
    }
  }

  function reset() {
    selectedFiles.forEach(forgetPreview);
    selectedFiles = [];
    existingUrls = [];
    previewGrid.innerHTML = "";
    uploadArea.classList.remove("has-files");
    const counter = uploadArea.querySelector(".upload-counter");
    if (counter) counter.textContent = "0/5 images";
  }

  function getFiles() { return selectedFiles; }

  function setExisting(urls = []) {
    existingUrls = Array.isArray(urls) ? urls.slice(0, 5) : [];
    selectedFiles.forEach(forgetPreview);
    selectedFiles = [];
    renderPreviews();
  }

  function getExisting() { return existingUrls.slice(); }

  return { upload, reset, getFiles, setExisting, getExisting };
}

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
      <div class="detail-image-single" style="--detail-img:${escapeHtml(detailBackdropUrl(imageUrls[0]))}">
        <img src="${escapeHtml(imageUrls[0])}" alt="Listing image" class="lightbox-img" data-gallery="${galleryId}" data-full="${escapeHtml(imageUrls[0])}" />
      </div>`;
  }

  return `
    <div class="image-gallery">
      <div class="image-gallery-main" style="--detail-img:${escapeHtml(detailBackdropUrl(imageUrls[0]))}">
        <img src="${escapeHtml(imageUrls[0])}" alt="Main image" id="galleryMain" class="lightbox-img" data-gallery="${galleryId}" data-full="${escapeHtml(imageUrls[0])}" />
      </div>
      <div class="image-gallery-thumbs">
        ${imageUrls.map((url, i) => `
          <div class="image-gallery-thumb ${i === 0 ? "active" : ""}"
               data-url="${escapeHtml(url)}" onclick="switchGalleryImage(this.dataset.url, this)">
            <img src="${escapeHtml(url)}" alt="Image ${i + 1}" class="lightbox-img" data-gallery="${galleryId}" data-full="${escapeHtml(url)}" />
          </div>`).join("")}
      </div>
    </div>`;
}

/* Detail images are shown whole (object-fit: contain) rather than cropped,
   so the frame's spare space is filled with a blurred copy of the same
   photo — see .detail-image-single / .image-gallery-main in main.css. */
function detailBackdropUrl(url) {
  return `url('${String(url).replace(/'/g, "%27")}')`;
}

function switchGalleryImage(url, thumbEl) {
  const main = document.getElementById("galleryMain");
  if (main) {
    main.src = url;
    rearmFadeImage(main);
    main.dataset.full = url;
    main.parentElement?.style.setProperty("--detail-img", detailBackdropUrl(url));
  }
  document.querySelectorAll(".image-gallery-thumb").forEach(t => t.classList.remove("active"));
  thumbEl.classList.add("active");
}

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

/* ==============================
   REPORT A PROBLEM (shared by the task / equipment / sale / event pages)
   A report is a problem sent to Taskify admins about ONE specific item.
   It is NOT a review — reviews are star ratings shown on profiles.
   Keep REPORT_CATEGORIES in sync with VALID_CATEGORIES in
   backend/src/services/report.service.js.
============================== */
const REPORT_CATEGORIES = {
  payment:          { label: "Money / payment problem",               icon: "ti-cash" },
  damaged_item:     { label: "Broken or damaged item",                icon: "ti-tool" },
  not_as_described: { label: "Not as described",                      icon: "ti-photo-x" },
  no_show:          { label: "Didn't show up / didn't do the work",   icon: "ti-user-x" },
  scam:             { label: "Scam or fraud",                         icon: "ti-alert-octagon" },
  harassment:       { label: "Harassment or abusive messages",        icon: "ti-message-report" },
  inappropriate:    { label: "Inappropriate or not-allowed content",  icon: "ti-eye-off" },
  other:            { label: "Something else",                        icon: "ti-dots" }
};

/* Which problem types make sense for each kind of item — e.g. an event
   has no "broken item" or "payment" option. */
const REPORT_CATEGORIES_BY_CONTEXT = {
  task:       ["payment", "no_show", "not_as_described", "scam", "harassment", "inappropriate", "other"],
  equipment:  ["damaged_item", "not_as_described", "payment", "no_show", "scam", "harassment", "inappropriate", "other"],
  sales_item: ["not_as_described", "damaged_item", "payment", "no_show", "scam", "harassment", "inappropriate", "other"],
  event:      ["inappropriate", "not_as_described", "scam", "harassment", "other"]
};

const REPORT_CONTEXT_LABELS = {
  task: "Task",
  equipment: "Equipment / Uniforms listing",
  equipment_booking: "Equipment rental",
  sales_item: "Item for sale",
  event: "Campus Marketplace listing",
  message: "Chat message"
};

function reportCategoryLabel(category) {
  return (REPORT_CATEGORIES[category] || REPORT_CATEGORIES.other).label;
}

/* Older name for escapeHtml() (top of this file), kept for existing callers. */
function escapeReportText(value) {
  return escapeHtml(value);
}

/* The small "Report a problem" button that sits at the bottom of each
   detail page's summary card. */
function reportProblemButtonHtml() {
  return `
    <button type="button" class="report-problem-link" id="reportProblemButton">
      <i class="ti ti-flag" aria-hidden="true"></i> Report a problem
    </button>`;
}

/* Builds the modal once, the first time it's needed, so no page has to
   carry its markup in its HTML file. */
function ensureReportModal() {
  let modal = document.getElementById("reportProblemModal");
  if (modal) return modal;

  const overlay = document.createElement("div");
  overlay.className = "report-modal-overlay";
  overlay.id = "reportProblemOverlay";

  modal = document.createElement("div");
  modal.className = "report-modal";
  modal.id = "reportProblemModal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "reportProblemTitle");
  modal.innerHTML = `
    <h2 id="reportProblemTitle"><i class="ti ti-flag" aria-hidden="true"></i> Report a problem</h2>
    <div class="report-modal-target" id="reportProblemTarget"></div>
    <form id="reportProblemForm">
      <div class="form-group">
        <label for="reportProblemCategory"><i class="ti ti-list-details" aria-hidden="true"></i> What's the problem?</label>
        <select id="reportProblemCategory" required></select>
      </div>
      <div class="form-group">
        <label for="reportProblemReason"><i class="ti ti-message" aria-hidden="true"></i> What happened?</label>
        <textarea id="reportProblemReason" minlength="10" maxlength="1000" required
          placeholder="Give the admin enough detail to understand it, e.g. what was agreed and what actually happened."></textarea>
      </div>
      <p class="report-modal-note">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        This goes to Taskify admins only, not to the other student. Want to rate someone instead?
        Leave a review once the task or rental is finished.
      </p>
      <div class="form-row">
        <button type="button" class="secondary-button" id="reportProblemCancel">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel
        </button>
        <button type="submit" class="primary-button" id="reportProblemSubmit" style="background:var(--ump-red);">
          <i class="ti ti-send" aria-hidden="true"></i> Send report
        </button>
      </div>
    </form>
    <p id="reportProblemMessage" style="margin-top:12px;font-size:13px;font-weight:600;"></p>`;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.remove("open");
    overlay.classList.remove("open");
  };
  overlay.addEventListener("click", close);
  modal.querySelector("#reportProblemCancel").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });
  modal._close = close;
  return modal;
}

/* Opens the report form for ONE specific item. The item's name and type
   are shown at the top so the student (and later the admin) knows exactly
   what the report is about.
     contextType:      "task" | "equipment" | "sales_item" | "event"
     contextId:        the item's id
     itemTitle:        the item's name, shown in the modal
     reportedUserId:   who the problem is with
     reportedUserName: their name, shown in the modal */
function openReportModal({ contextType, contextId, itemTitle, reportedUserId, reportedUserName }) {
  if (!requireAuthAction("Sign in to report a problem.")) return;

  const modal   = ensureReportModal();
  const overlay = document.getElementById("reportProblemOverlay");
  const form    = modal.querySelector("#reportProblemForm");
  const select  = modal.querySelector("#reportProblemCategory");
  const message = modal.querySelector("#reportProblemMessage");
  const submit  = modal.querySelector("#reportProblemSubmit");

  const categories = REPORT_CATEGORIES_BY_CONTEXT[contextType] || Object.keys(REPORT_CATEGORIES);
  select.innerHTML = `<option value="">Choose one…</option>` +
    categories.map(c => `<option value="${c}">${REPORT_CATEGORIES[c].label}</option>`).join("");

  modal.querySelector("#reportProblemTarget").innerHTML = `
    <div class="report-modal-item">
      <span class="report-modal-item-type">${escapeReportText(REPORT_CONTEXT_LABELS[contextType] || "Item")}</span>
      <strong>${escapeReportText(itemTitle)}</strong>
      ${reportedUserName ? `<span class="report-modal-item-user">Problem with: ${escapeReportText(reportedUserName)}</span>` : ""}
    </div>`;

  form.reset();
  message.textContent = "";
  submit.disabled = false;

  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    message.textContent = "";
    try {
      await apiRequest("/reports", "POST", {
        reportedUserId: Number(reportedUserId),
        contextType,
        contextId: Number(contextId),
        category: select.value,
        reason: modal.querySelector("#reportProblemReason").value.trim()
      });
      modal._close();
      showToast("Report sent. An admin will look into it.");
    } catch (err) {
      message.textContent = err.message;
      message.style.color = "var(--ump-red)";
      submit.disabled = false;
    }
  };

  overlay.classList.add("open");
  modal.classList.add("open");
  select.focus();
}


/* ==============================
   LISTING CATEGORIES (panel feedback, 2026-10-04)
   One fixed list per listing type. The category decides the section
   (Academic or General), so forms no longer ask for both. Names are
   shared across types on purpose ("Calculators" for rentals AND sales)
   so the Academic / General pages show one button per category.
   Keep in sync with backend/src/config/categories.js.
============================== */
const TASKIFY_CATEGORIES = {
  task: {
    Academic: ["Tutoring & Study Help", "Programming & Tech Help", "Printing & Typing", "Other academic"],
    General:  ["Errands & Deliveries", "Cleaning & Laundry", "Moving & Lifting", "Repairs & Fixes",
               "Hair & Beauty", "Photography & Design", "Other"]
  },
  equipment: {
    Academic: ["Equipment / Uniforms", "Calculators", "Laptops & Tablets", "Textbooks", "Other academic"],
    General:  ["Electronics & Gadgets", "Cameras & Audio", "Sports & Outdoor", "Kitchen & Appliances",
               "Party & Event Gear", "Other"]
  },
  sales: {
    Academic: ["Textbooks", "Equipment / Uniforms", "Calculators", "Laptops & Tablets", "Stationery", "Other academic"],
    General:  ["Electronics & Gadgets", "Clothing & Shoes", "Furniture & Room Items", "Kitchen & Appliances",
               "Sports & Outdoor", "Other"]
  },
  /* Campus Marketplace (the area that used to be "Events"). Keep in sync
     with backend/src/config/categories.js. */
  event: {
    Academic: ["Departmental opportunity"],
    General:  ["Campus market day", "Student stalls & pop-ups", "Swap & exchange",
               "University farm-produce sale", "Institutional surplus sale", "Lost-property sale or auction",
               "Other marketplace"]
  }
};

/* Campus Marketplace categories that need a "who authorised this" note and
   an admin check before they're shown. */
const INSTITUTIONAL_EVENT_CATEGORIES = [
  "University farm-produce sale", "Institutional surplus sale",
  "Lost-property sale or auction", "Departmental opportunity"
];

/* The old general-events categories: existing events keep them until they
   end, but they aren't offered for new listings. */
const LEGACY_EVENT_CATEGORIES = [
  "Workshop & Training", "Study Group / Revision", "Careers & Info Session", "Guest Lecture / Seminar",
  "Other academic", "Sports & Fitness", "Society & Club Meeting", "Social & Entertainment", "Arts & Culture",
  "Community & Outreach", "Other"
];

/* An approved institutional listing — reviewed by Taskify, never presented
   as official or endorsed by the university. */
function institutionalBadge(item) {
  if (!item?.is_institutional) return "";
  return `<div class="market-tag institutional-tag" title="A Taskify admin checked who authorised this listing. It is not an official university announcement."><i class="ti ti-building-bank" aria-hidden="true"></i> Reviewed institutional listing</div>`;
}

/* Icon + one-line blurb for the category buttons on the Academic and
   General pages. */
const CATEGORY_DETAILS = {
  "Tutoring & Study Help":   { icon: "ti-school",          blurb: "Get help with a module" },
  "Programming & Tech Help": { icon: "ti-code",            blurb: "Coding and tech support" },
  "Printing & Typing":       { icon: "ti-printer",         blurb: "Print, type and bind" },
  "Equipment / Uniforms":    { icon: "ti-shirt",           blurb: "Lab coats, boots, PPE, toolkits" },
  "Calculators":             { icon: "ti-calculator",      blurb: "Scientific and graphing" },
  "Laptops & Tablets":       { icon: "ti-device-laptop",   blurb: "For classes and projects" },
  "Textbooks":               { icon: "ti-book",            blurb: "Prescribed books and guides" },
  "Stationery":              { icon: "ti-pencil",          blurb: "Pens, files, notebooks" },
  "Other academic":          { icon: "ti-dots",            blurb: "Anything else for your studies" },
  "Errands & Deliveries":    { icon: "ti-walk",            blurb: "Pick-ups and drop-offs" },
  "Cleaning & Laundry":      { icon: "ti-wash-machine",    blurb: "Rooms and washing" },
  "Moving & Lifting":        { icon: "ti-truck",           blurb: "Move in, move out" },
  "Repairs & Fixes":         { icon: "ti-tool",            blurb: "Small fixes around res" },
  "Hair & Beauty":           { icon: "ti-scissors",        blurb: "Hair, nails and more" },
  "Photography & Design":    { icon: "ti-camera",          blurb: "Photos, posters, logos" },
  "Electronics & Gadgets":   { icon: "ti-device-mobile",   blurb: "Phones, chargers, consoles" },
  "Cameras & Audio":         { icon: "ti-headphones",      blurb: "Cameras, speakers, mics" },
  "Sports & Outdoor":        { icon: "ti-ball-football",   blurb: "Balls, bikes, gym gear" },
  "Kitchen & Appliances":    { icon: "ti-tools-kitchen-2", blurb: "Kettles, microwaves, pots" },
  "Party & Event Gear":      { icon: "ti-confetti",        blurb: "Decor and sound" },
  "Clothing & Shoes":        { icon: "ti-hanger",          blurb: "Everyday wear" },
  "Furniture & Room Items":  { icon: "ti-armchair",        blurb: "Desks, chairs, shelves" },
  "Other":                   { icon: "ti-dots",            blurb: "Anything else" },
  "Campus market day":       { icon: "ti-building-store",  blurb: "Market days on campus" },
  "Student stalls & pop-ups":{ icon: "ti-tent",            blurb: "Student stalls and pop-ups" },
  "Swap & exchange":         { icon: "ti-arrows-exchange", blurb: "Swap books, clothes and more" },
  "University farm-produce sale": { icon: "ti-plant",      blurb: "Authorised farm-produce sales" },
  "Institutional surplus sale":   { icon: "ti-packages",   blurb: "Authorised surplus sales" },
  "Lost-property sale or auction":{ icon: "ti-gavel",      blurb: "Authorised lost-property sales" },
  "Departmental opportunity":     { icon: "ti-building-bank", blurb: "Approved departmental requests" },
  "Other marketplace":       { icon: "ti-dots",            blurb: "Other campus exchanges" }
};

/* "Academic" or "General" for a category on the list, otherwise null. */
function categorySection(type, category) {
  const groups = TASKIFY_CATEGORIES[type];
  if (!groups || !category) return null;
  if (groups.Academic.includes(category)) return "Academic";
  if (groups.General.includes(category)) return "General";
  return null;
}

function categoryOptgroupsHtml(type, selected = "") {
  const groups = TASKIFY_CATEGORIES[type] || { Academic: [], General: [] };
  return ["Academic", "General"].map(section => `
    <optgroup label="${section}">
      ${groups[section].map(c => `<option value="${c}"${c === selected ? " selected" : ""}>${c}</option>`).join("")}
    </optgroup>`).join("");
}

/* Fills a create/edit form's category dropdown. A listing whose old
   category isn't on the list starts on "Choose…" so the owner picks a
   new one. hintEl (optional) shows which section it will appear under. */
function fillCategorySelect(selectEl, type, selected = "", hintEl = null) {
  if (!selectEl) return;
  const valid = categorySection(type, selected) ? selected : "";
  selectEl.innerHTML = `<option value="">Choose a category…</option>` + categoryOptgroupsHtml(type, valid);
  selectEl.value = valid;

  if (!hintEl) return;
  const updateHint = () => {
    const section = categorySection(type, selectEl.value);
    hintEl.innerHTML = section
      ? `<i class="ti ti-layout-grid" aria-hidden="true"></i> Shows on the <strong>${section}</strong> page`
      : "";
  };
  if (!selectEl.dataset.hintBound) {
    selectEl.addEventListener("change", updateHint);
    /* form.reset() (used when the create modal reopens) doesn't fire
       "change", so refresh the hint after a reset too. */
    selectEl.form?.addEventListener("reset", () => setTimeout(updateHint, 0));
    selectEl.dataset.hintBound = "1";
  }
  updateHint();
}

/* Fills a list page's "All Categories" filter from the fixed list, so
   every category is there even before anyone has posted in it. */
function fillCategoryFilter(selectEl, type) {
  if (!selectEl) return;
  const current = selectEl.value || "All";
  selectEl.innerHTML = `<option value="All">All Categories</option>` + categoryOptgroupsHtml(type);
  selectEl.value = categorySection(type, current) ? current : "All";
}

/* ── University of Mpumalanga faculties ──
   UMP's three faculties and their schools (ump.ac.za "Faculties and
   Schools", checked 2026-10-12), plus support departments for staff.
   Keep in sync with backend/src/config/faculties.js. */
const UMP_FACULTIES = {
  "Faculty of Agriculture and Natural Sciences": [
    "School of Agricultural Sciences",
    "School of Biology and Environmental Sciences",
    "School of Computing and Mathematical Sciences"
  ],
  "Faculty of Economics, Development and Business Sciences": [
    "School of Development Studies",
    "School of Hospitality and Tourism Management",
    "School of Social Sciences"
  ],
  "Faculty of Education": [
    "School of Early Childhood Education"
  ]
};
const UMP_SUPPORT_DEPARTMENTS = ["Administration", "Finance", "ICT Services", "Library", "Student Affairs", "Other"];

/* Fills a faculty <select>. Students only get the three faculties; staff
   and lecturers also get the support departments. A saved value from
   before the list changed is kept as its own option so editing a profile
   never silently drops it. If hintEl is given it lists the chosen
   faculty's schools, so a Computing or Hospitality student can tell
   which faculty they're in. */
function fillFacultySelect(selectEl, { memberType = "Student", selected = "", hintEl = null } = {}) {
  if (!selectEl) return;
  const isStudent = memberType === "Student";
  const known = [...Object.keys(UMP_FACULTIES), ...(isStudent ? [] : UMP_SUPPORT_DEPARTMENTS)];
  const legacy = selected && !known.includes(selected)
    ? `<option value="${escapeHtml(selected)}" data-legacy="1">${escapeHtml(selected)} (old name, please choose again)</option>`
    : "";

  selectEl.innerHTML = `<option value="">${isStudent ? "Select your faculty" : "Select your faculty or department"}</option>
    <optgroup label="Faculties">
      ${Object.keys(UMP_FACULTIES).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
    </optgroup>
    ${isStudent ? "" : `<optgroup label="Support departments">
      ${UMP_SUPPORT_DEPARTMENTS.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
    </optgroup>`}
    ${legacy}`;
  selectEl.value = selected || "";

  if (!hintEl) return;
  const updateHint = () => {
    const schools = UMP_FACULTIES[selectEl.value];
    hintEl.innerHTML = schools
      ? `<i class="ti ti-school" aria-hidden="true"></i> <span>Includes ${schools.map(escapeHtml).join(", ")}</span>`
      : `<i class="ti ti-info-circle" aria-hidden="true"></i> <span>Computing is in Agriculture and Natural Sciences; Hospitality and Tourism is in Economics, Development and Business Sciences.</span>`;
  };
  if (!selectEl.dataset.facultyHintBound) {
    selectEl.addEventListener("change", updateHint);
    selectEl.dataset.facultyHintBound = "1";
  }
  updateHint();
}

/* ── Field-level errors ──
   Puts a short message right under the field and outlines it in red, so
   people see exactly what to fix instead of hunting for one sentence at
   the bottom of the form. The error clears itself as soon as they change
   the field. `target` is the input/select (or a wrapper like a role
   grid); the message goes after its .form-group's last child. */
function setFieldError(target, message) {
  if (!target) return;
  const group = target.closest(".form-group") || target.parentElement;
  target.classList.add("input-invalid");
  target.setAttribute("aria-invalid", "true");

  let error = group.querySelector(":scope > .field-error");
  if (!error) {
    error = document.createElement("p");
    error.className = "field-error";
    error.id = `${target.id || "field"}-error-${Math.random().toString(36).slice(2, 7)}`;
    group.appendChild(error);
  }
  error.innerHTML = `<i class="ti ti-alert-circle" aria-hidden="true"></i><span></span>`;
  error.querySelector("span").textContent = message;
  if (target.matches("input, select, textarea")) target.setAttribute("aria-describedby", error.id);

  if (!target.dataset.errorClearBound) {
    target.dataset.errorClearBound = "1";
    const clear = () => clearFieldError(target);
    target.addEventListener("input", clear);
    target.addEventListener("change", clear);
    target.addEventListener("click", () => { if (!target.matches("input, select, textarea")) clear(); });
  }
}

function clearFieldError(target) {
  if (!target) return;
  const group = target.closest(".form-group") || target.parentElement;
  target.classList.remove("input-invalid");
  target.removeAttribute("aria-invalid");
  group?.querySelector(":scope > .field-error")?.remove();
}

/* After validating a step: scroll to and focus the first field that needs
   fixing, with a small nudge so the eye finds it. */
function focusFirstInvalid(scope) {
  const first = scope.querySelector(".input-invalid");
  if (!first) return;
  first.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = first.matches("input, select, textarea") ? first : first.querySelector("input, button, [tabindex]");
  focusable?.focus({ preventScroll: true });
  first.classList.remove("field-nudge");
  void first.offsetWidth;
  first.classList.add("field-nudge");
}

/* ── "Read and tick" confirmations ──
   For the moments with real consequences (academic tasks, selling,
   renting out, renting), the person must tick a box before the server
   accepts the action, and the server records which version they ticked
   (backend config/acknowledgements.js). The text comes from the server so
   what's shown is exactly what's recorded. */
let acknowledgementsPromise = null;
function loadAcknowledgements() {
  if (!acknowledgementsPromise) {
    acknowledgementsPromise = apiRequest("/acknowledgements")
      .then(res => res.data || {})
      .catch(() => { acknowledgementsPromise = null; return {}; });
  }
  return acknowledgementsPromise;
}

/* Fills `container` with the box for `kind`. Ticks are kept if the same
   box is rendered again (e.g. when a form step is revisited). */
async function renderAcknowledgementBox(container, kind) {
  if (!container) return;
  const all = await loadAcknowledgements();
  const ack = all[kind];
  if (!ack) { container.innerHTML = ""; return; }
  const wasTicked = container.querySelector(`input[data-ack-kind="${kind}"]`)?.checked;
  container.innerHTML = `
    <div class="form-group ack-box">
      <div class="ack-box-head"><i class="ti ti-alert-triangle" aria-hidden="true"></i> <strong>${escapeHtml(ack.title)}</strong></div>
      <ul>${ack.points.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
      <label class="checkbox-row ack-check">
        <input type="checkbox" data-ack-kind="${escapeHtml(kind)}" data-ack-version="${escapeHtml(ack.version)}"${wasTicked ? " checked" : ""} />
        <span>${escapeHtml(ack.agree)}</span>
      </label>
      <a class="ack-more" href="./terms.html#responsibilities" target="_blank" rel="noopener">Your responsibilities on Taskify <i class="ti ti-external-link" aria-hidden="true"></i></a>
    </div>`;
  const input = container.querySelector("input");
  input.addEventListener("change", () => clearFieldError(container.querySelector(".ack-check")));
}

/* { kind: version } for every ticked box shown inside scope — the shape
   the API expects as `acknowledgements`. */
function readAcknowledgements(scope) {
  const out = {};
  scope.querySelectorAll("input[data-ack-kind]").forEach(input => {
    if (input.checked && input.offsetParent !== null) out[input.dataset.ackKind] = input.dataset.ackVersion;
  });
  return out;
}

/* Marks every visible, unticked box in scope; true when all are ticked. */
function checkAcknowledgementBoxes(scope) {
  let ok = true;
  scope.querySelectorAll("input[data-ack-kind]").forEach(input => {
    if (input.offsetParent === null || input.checked) return;
    setFieldError(input.closest(".ack-check"), "Please read this and tick the box to continue.");
    ok = false;
  });
  if (!ok) focusFirstInvalid(scope);
  return ok;
}

/* The server refused because the text changed or the box wasn't ticked:
   re-render the boxes with the current wording and point at them. */
async function handleAcknowledgementError(scope, error) {
  if (!(error?.fields || []).some(f => f.path === "acknowledgements")) return false;
  acknowledgementsPromise = null;
  const boxes = [...scope.querySelectorAll("[data-ack-container]")];
  for (const box of boxes) {
    if (box.offsetParent === null) continue;
    box.innerHTML = "";   // so the fresh text renders unticked
    await renderAcknowledgementBox(box, box.dataset.ackContainer);
    setFieldError(box.querySelector(".ack-check"), error.message);
  }
  focusFirstInvalid(scope);
  return true;
}

/* ── Plain warnings ──
   Things people should know before they act, so nobody is caught out.
   Short and specific; shown where the decision is made. */
const TASKIFY_NOTICES = {
  taskWorker: {
    icon: "ti-info-circle", title: "Before you take this on",
    points: [
      "Agree exactly what's included, the price and the deadline in the chat before you start.",
      "For jobs in someone's room or off campus, meet in daylight and tell a friend where you're going.",
      "You're paid only when the poster confirms the job is done (demo). Never pay anyone to get a job.",
      "Academic tasks must be about learning. Don't write or complete marked work for someone — it's misconduct for both of you."
    ]
  },
  highValue: {
    icon: "ti-shield-search", title: "Buying something valuable?",
    points: [
      "Ask to see the box, receipt or another proof that it's theirs.",
      "For phones and laptops, check the serial or IMEI matches the device and that it isn't locked to someone else's account.",
      "If the price looks too good, or they rush you, walk away. Buying stolen goods is an offence even if you didn't know."
    ]
  },
  chat: {
    icon: "ti-lock", title: "Stay safe in chat",
    points: [
      "Never send money, banking details, passwords or your handover code here. Taskify will never ask for them.",
      "Keep the deal on Taskify: if someone pushes you to pay or talk elsewhere, report the message."
    ]
  },
  marketFood: {
    icon: "ti-tools-kitchen-2", title: "About food stalls",
    points: [
      "Food and drinks are sold by the stallholders, not by Taskify or the university. Taskify doesn't check food safety.",
      "Check ingredients for allergies before you buy."
    ]
  },
  market: {
    icon: "ti-info-circle", title: "Good to know",
    points: [
      "Stalls are run by students and departments. Deal with the seller directly and check things before paying.",
      "\"I'm going\" just keeps you updated — it doesn't reserve anything."
    ]
  }
};

function noticeHtml(key) {
  const n = TASKIFY_NOTICES[key];
  if (!n) return "";
  return `
    <div class="notice-box" role="note">
      <div class="notice-box-head"><i class="ti ${n.icon}" aria-hidden="true"></i> <strong>${n.title}</strong></div>
      <ul>${n.points.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    </div>`;
}

/* ── Profile photo nudge ──
   A photo lets the person you're meeting recognise you, so handovers are
   quicker and safer, and people respond more to listings with a face
   behind them. Shown only to signed-in people who haven't added one. */
function currentUserHasPhoto() {
  try { return !!JSON.parse(localStorage.getItem("taskifyUser") || "{}").profilePhoto; }
  catch { return true; }
}

function profilePhotoNudgeHtml(reason = "So the person you meet can recognise you on campus.") {
  if (!localStorage.getItem("taskifyToken") || currentUserHasPhoto()) return "";
  return `
    <a class="photo-nudge" href="./profile.html#edit-photo">
      <span class="photo-nudge-icon"><i class="ti ti-camera-plus" aria-hidden="true"></i></span>
      <span><strong>Add a profile photo</strong><small>${escapeHtml(reason)}</small></span>
      <i class="ti ti-chevron-right" aria-hidden="true"></i>
    </a>`;
}
