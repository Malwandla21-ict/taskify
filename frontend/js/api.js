/* ── API base URL ──
   Auto-detects local dev vs a deployed environment so the exact same
   files work unmodified in both places — no build step, no bundler here.
   Once the backend is deployed (see DEPLOYMENT.md), replace
   PRODUCTION_API_URL below with its real URL. */
const PRODUCTION_API_URL = "https://api.taskify-marketplace.co.za/api";
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = IS_LOCAL ? "http://127.0.0.1:5000/api" : PRODUCTION_API_URL;

/* ── Global top loading bar ──
   Automatically shown for the duration of ANY apiRequest/apiMultipartRequest
   call, so every page load, login, task/rental/sale/event/message action,
   and image upload gets visible feedback instead of a silent wait —
   removes the "did my click even register?" repeated-clicking problem. */
let activeRequestCount = 0;
let topLoaderEl = null;
let topLoaderHideTimer = null;

function ensureTopLoader() {
  if (topLoaderEl) return topLoaderEl;

  const style = document.createElement("style");
  style.textContent = `
    #taskifyTopLoader {
      position: fixed; top: 0; left: 0; height: 3px; width: 0%;
      background: linear-gradient(90deg, var(--ump-green, #009B72), var(--ump-blue, #0072CE));
      z-index: 9999; opacity: 0;
      transition: width 0.35s ease, opacity 0.25s ease;
      box-shadow: 0 0 8px rgba(0,155,114,0.55);
    }
  `;
  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.id = "taskifyTopLoader";
  document.body.appendChild(bar);
  topLoaderEl = bar;
  return bar;
}

let topLoaderTrickleTimer = null;
let topLoaderWidth = 0;
/* Requests that already show their own progress (image uploads) don't
   also trigger the "still working" pill. */
let quietRequestCount = 0;

function startTopLoader({ quiet = false } = {}) {
  activeRequestCount++;
  if (quiet) quietRequestCount++;
  const bar = ensureTopLoader();
  clearTimeout(topLoaderHideTimer);
  bar.style.opacity = "1";
  /* Jump straight to 70% so it always reads as "in progress" even for
     very fast requests, then keep creeping towards 94% while anything is
     still running — a bar parked at 70% for ten seconds reads as stuck.
     Finishes to 100% when the last request ends. */
  requestAnimationFrame(() => {
    topLoaderWidth = Math.max(topLoaderWidth, 70);
    bar.style.width = `${topLoaderWidth}%`;
  });
  if (!topLoaderTrickleTimer) {
    topLoaderTrickleTimer = setInterval(() => {
      if (!activeRequestCount) return;
      topLoaderWidth += (94 - topLoaderWidth) * 0.12;
      bar.style.width = `${topLoaderWidth}%`;
    }, 600);
  }
  scheduleSlowRequestNotice();
}

function stopTopLoader({ quiet = false } = {}) {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (quiet) quietRequestCount = Math.max(0, quietRequestCount - 1);
  if (!topLoaderEl || activeRequestCount > 0) return;

  clearInterval(topLoaderTrickleTimer);
  topLoaderTrickleTimer = null;
  topLoaderWidth = 0;
  clearSlowRequestNotice();
  topLoaderEl.style.width = "100%";
  topLoaderHideTimer = setTimeout(() => {
    if (activeRequestCount > 0) return;
    topLoaderEl.style.opacity = "0";
    setTimeout(() => {
      if (activeRequestCount === 0 && topLoaderEl) topLoaderEl.style.width = "0%";
    }, 250);
  }, 200);
}

/* ── Slow-request & offline pill ──
   The backend runs on Render's free plan, which sleeps after 15 idle
   minutes; the first request after that takes 30-60s while it wakes.
   Without a word of explanation that looks exactly like a broken site,
   so once anything has been running for a few seconds a small pill at
   the bottom says what's going on, and says more if it keeps going.
   The same pill tells people when their own connection drops. */
const SLOW_REQUEST_STAGES = [
  { after: 4000,  title: "Still working on it…", detail: "" },
  { after: 10000, title: "Waking Taskify up…", detail: "The first visit after a quiet spell can take up to a minute. Hang tight." },
  { after: 35000, title: "Almost there…", detail: "Thanks for your patience — the server is nearly ready." }
];
let slowRequestTimers = [];
let netPillEl = null;
let netPillMode = null;   // "slow" | "offline" | "online"
let netPillHideTimer = null;

function ensureNetPill() {
  if (netPillEl) return netPillEl;
  netPillEl = document.createElement("div");
  netPillEl.className = "net-pill";
  netPillEl.setAttribute("role", "status");
  netPillEl.setAttribute("aria-live", "polite");
  document.body.appendChild(netPillEl);
  return netPillEl;
}

function showNetPill(mode, iconHtml, title, detail = "") {
  const pill = ensureNetPill();
  clearTimeout(netPillHideTimer);
  netPillMode = mode;
  pill.className = `net-pill ${mode}`;
  pill.innerHTML = `${iconHtml}<div><span></span>${detail ? "<small></small>" : ""}</div>`;
  /* Text set via textContent — it never contains markup. */
  pill.querySelector("span").textContent = title;
  if (detail) pill.querySelector("small").textContent = detail;
  requestAnimationFrame(() => pill.classList.add("show"));
}

function hideNetPill(mode) {
  if (!netPillEl || (mode && netPillMode !== mode)) return;
  netPillEl.classList.remove("show");
  netPillMode = null;
}

function netPillLoaderHtml() {
  return typeof taskifyMarkLoader === "function"
    ? taskifyMarkLoader()
    : `<i class="ti ti-loader net-pill-icon" aria-hidden="true"></i>`;
}

function scheduleSlowRequestNotice() {
  if (slowRequestTimers.length) return;
  slowRequestTimers = SLOW_REQUEST_STAGES.map(stage => setTimeout(() => {
    if (activeRequestCount <= quietRequestCount || netPillMode === "offline") return;
    showNetPill("slow", netPillLoaderHtml(), stage.title, stage.detail);
  }, stage.after));
}

function clearSlowRequestNotice() {
  slowRequestTimers.forEach(clearTimeout);
  slowRequestTimers = [];
  hideNetPill("slow");
}

window.addEventListener("offline", () => {
  showNetPill("offline", `<i class="ti ti-wifi-off net-pill-icon" aria-hidden="true"></i>`,
    "You're offline", "Check your Wi-Fi or data. We'll pick up where you left off.");
});
window.addEventListener("online", () => {
  if (netPillMode !== "offline") return;
  showNetPill("online", `<i class="ti ti-wifi net-pill-icon" aria-hidden="true"></i>`, "Back online");
  netPillHideTimer = setTimeout(() => hideNetPill("online"), 2500);
});

/* fetch() rejects with a bare TypeError ("Failed to fetch") when the
   request never reached the server — no signal, DNS, CORS during a
   deploy. Turn that into something a person can act on. */
function networkErrorMessage() {
  return navigator.onLine === false
    ? "You're offline. Reconnect to the internet and try again."
    : "Couldn't reach Taskify. Check your connection and try again.";
}

/* ── Session expiry handling ──
   A 401 on a request that carried a token means the token itself is no
   longer valid — it expired (JWT_EXPIRES_IN, 1 day by default), or was
   invalidated server-side by a password change, password reset, or 2FA
   toggle bumping the account's token_version. Without this, the stale
   token stays sitting in localStorage, the UI keeps looking logged in
   (navbar, profile, everything looks normal), and every action after that
   just throws a confusing "Unauthorized. Invalid token." with nothing
   telling the user to log back in. Login itself never sends a token, so a
   401 from a wrong password there is untouched by this and handled
   normally by the caller. */
let sessionExpiredRedirecting = false;
function handleSessionExpired() {
  if (sessionExpiredRedirecting) return;
  if (window.location.pathname.endsWith("login.html")) return;

  sessionExpiredRedirecting = true;
  localStorage.removeItem("taskifyToken");
  localStorage.setItem("taskifySessionExpired", "1");
  window.location.href = "./login.html";
}

async function apiRequest(endpoint, method = "GET", body = null, token = null) {
  startTopLoader();
  try {
    const resolvedToken = token || localStorage.getItem("taskifyToken");

    const headers = { "Content-Type": "application/json" };
    if (resolvedToken) headers.Authorization = `Bearer ${resolvedToken}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    } catch {
      throw new Error(networkErrorMessage());
    }

    /* If response is not JSON (e.g. HTML error page), catch it clearly */
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(`Server error (${response.status}). Is your backend running?`);
    }

    const data = await response.json();

    if (response.status === 401 && resolvedToken) {
      handleSessionExpired();
      throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok) throw new Error(data.message || "Something went wrong.");

    return data;
  } finally {
    stopTopLoader();
  }
}

/* Multipart uploads go through XMLHttpRequest rather than fetch, because
   only XHR reports upload progress — that's what lets the image uploader
   show a real percentage instead of an open-ended spinner. Pass
   { onUploadProgress(fraction, loaded, total) } to receive it; it fires
   with fraction 1 once every byte has been sent and the server is
   working on the reply. */
function apiMultipartRequest(endpoint, method, formData, token = null, { onUploadProgress } = {}) {
  const quiet = !!onUploadProgress;
  startTopLoader({ quiet });
  const resolvedToken = token || localStorage.getItem("taskifyToken");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE_URL}${endpoint}`);
    if (resolvedToken) xhr.setRequestHeader("Authorization", `Bearer ${resolvedToken}`);

    if (onUploadProgress) {
      xhr.upload.addEventListener("progress", e => {
        if (e.lengthComputable && e.total) onUploadProgress(e.loaded / e.total, e.loaded, e.total);
      });
      xhr.upload.addEventListener("load", () => onUploadProgress(1));
    }

    xhr.addEventListener("error", () => reject(new Error(networkErrorMessage())));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    xhr.addEventListener("load", () => {
      const contentType = xhr.getResponseHeader("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        reject(new Error(`Server error (${xhr.status}). Is your backend running?`));
        return;
      }

      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch { reject(new Error("Something went wrong.")); return; }

      if (xhr.status === 401 && resolvedToken) {
        handleSessionExpired();
        reject(new Error("Your session has expired. Please log in again."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.message || "Something went wrong."));
        return;
      }
      resolve(data);
    });

    xhr.send(formData);
  }).finally(() => stopTopLoader({ quiet }));
}
