/* ── API base URL ──
   Auto-detects local dev vs a deployed environment so the exact same
   files work unmodified in both places — no build step, no bundler here.
   Once the backend is deployed (see DEPLOYMENT.md), replace
   PRODUCTION_API_URL below with its real URL. */
const PRODUCTION_API_URL = "https://taskify-backend-uure.onrender.com/api";
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

function startTopLoader() {
  activeRequestCount++;
  const bar = ensureTopLoader();
  clearTimeout(topLoaderHideTimer);
  bar.style.opacity = "1";
  /* Jump straight to 70% so it always reads as "in progress" even for
     very fast requests, then finishes to 100% when the last request ends. */
  requestAnimationFrame(() => { bar.style.width = "70%"; });
}

function stopTopLoader() {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (!topLoaderEl || activeRequestCount > 0) return;

  topLoaderEl.style.width = "100%";
  topLoaderHideTimer = setTimeout(() => {
    if (activeRequestCount > 0) return;
    topLoaderEl.style.opacity = "0";
    setTimeout(() => {
      if (activeRequestCount === 0 && topLoaderEl) topLoaderEl.style.width = "0%";
    }, 250);
  }, 200);
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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

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

async function apiMultipartRequest(endpoint, method, formData, token = null) {
  startTopLoader();
  try {
    const resolvedToken = token || localStorage.getItem("taskifyToken");
    const headers = {};
    if (resolvedToken) headers.Authorization = `Bearer ${resolvedToken}`;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers, body: formData });
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
