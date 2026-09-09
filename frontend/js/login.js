const loginForm    = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

/* ── Password visibility toggle ── */
function initPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input   = document.getElementById(btn.dataset.target);
      const icon    = btn.querySelector("i");
      const showing = input.type === "text";

      input.type     = showing ? "password" : "text";
      icon.className = showing ? "ti ti-eye" : "ti ti-eye-off";
      btn.classList.toggle("active", !showing);
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

/* ── Message helper ── */
function showMessage(msg, color = "red") {
  loginMessage.textContent = msg;
  loginMessage.style.color = color;
}

/* ── Remembered devices ──
   A "remember this device" trusted-device token (see two-factor.js) is
   scoped per-account, per-browser, so it's keyed by the email being
   logged in with rather than a single shared slot. Admin accounts never
   get one issued in the first place, so this is a no-op for them. */
function trustedDeviceKey(email) {
  return `taskifyTrustedDevice:${String(email || "").trim().toLowerCase()}`;
}

/* ── Submit ── */
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const deviceToken = localStorage.getItem(trustedDeviceKey(email)) || undefined;

    const submitBtn = loginForm.querySelector("button[type='submit']");
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Signing in…`;
    showMessage("Signing you in…", "#687280");

    try {
      const response = await apiRequest("/auth/login", "POST", { email, password, deviceToken });

      /* Password was correct but this account has 2FA enabled — hand off
         to the two-factor step instead of logging in directly. The temp
         token is short-lived and only good for completing this one login,
         so sessionStorage (cleared when the tab closes) is enough. */
      if (response.data.requires2FA) {
        sessionStorage.setItem("taskify2FATempToken", response.data.tempToken);
        /* Tells two-factor.html whether this account even has an
           authenticator app to fall back to — an email-method account has
           none, so that screen should open straight into email mode. */
        sessionStorage.setItem("taskify2FAMethod", response.data.method || "totp");
        /* Whether to offer "remember this device" at all — never true for
           admin accounts, whose 2FA stays mandatory every time. */
        sessionStorage.setItem("taskify2FACanRememberDevice", response.data.canRememberDevice ? "1" : "0");
        sessionStorage.setItem("taskify2FAEmail", email);
        showMessage("Enter your two-factor code…", "var(--ump-green)");
        setTimeout(() => {
          window.location.href = "./two-factor.html";
        }, 400);
        return;
      }

      /* No 2FA challenge at all — either the account doesn't have 2FA on,
         or this device was already recognized as trusted (backend skipped
         straight past the challenge). Either way there's nothing more to
         store here; a fresh trusted-device token is only ever issued from
         the two-factor screen itself. */

      localStorage.setItem("taskifyToken", response.data.token);
      localStorage.setItem("taskifyUser", JSON.stringify(response.data.user));

      showMessage("Login successful. Redirecting…", "var(--ump-green)");

      /* Login now lands on the dashboard — it carries the tagline/hero
         and (for a first-time account) the onboarding modal, so it's the
         better first thing a user sees after signing in. */
      setTimeout(() => {
        window.location.href = "./dashboard.html";
      }, 900);

    } catch (error) {
      showMessage(error.message || "Invalid email or password.", "red");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });
}

/* ── Init ── */
initPasswordToggles();
