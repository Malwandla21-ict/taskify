const twoFactorForm       = document.getElementById("twoFactorForm");
const twoFactorMessage    = document.getElementById("twoFactorMessage");
const codeInput           = document.getElementById("code");
const codeLabel           = document.getElementById("codeLabel");
const subtitle            = document.getElementById("twoFactorSubtitle");
const toggleBackupCode    = document.getElementById("toggleBackupCode");
const toggleEmailOtp      = document.getElementById("toggleEmailOtp");
const toggleEmailOtpWrap  = document.getElementById("toggleEmailOtpWrap");
const resendEmailOtpWrap  = document.getElementById("resendEmailOtpWrap");
const resendEmailOtp      = document.getElementById("resendEmailOtp");
const rememberDeviceWrap  = document.getElementById("rememberDeviceWrap");
const rememberDeviceInput = document.getElementById("rememberDevice");
const verifyButton        = document.getElementById("verifyButton");

const tempToken = sessionStorage.getItem("taskify2FATempToken");

/* No pending 2FA session — nothing to verify, send them back to log in. */
if (!tempToken) {
  window.location.href = "./login.html";
}

/* Set by login.js from the /login response — an "email" account has no
   authenticator app at all, so there's nothing to fall back FROM and
   nothing to toggle back TO. A missing value (older session storage,
   or a plain totp account) defaults to the normal app-first behavior. */
const accountMethod = sessionStorage.getItem("taskify2FAMethod") || "totp";

/* Set by login.js from the /login response — never true for admin
   accounts, whose 2FA stays mandatory on every login. Only shown when
   true; the backend also re-checks role server-side, so this is purely
   about whether to offer the option, not a security boundary itself. */
const canRememberDevice = sessionStorage.getItem("taskify2FACanRememberDevice") === "1";
if (canRememberDevice && rememberDeviceWrap) {
  rememberDeviceWrap.hidden = false;
  rememberDeviceWrap.style.display = "flex";
}

function trustedDeviceKey(email) {
  return `taskifyTrustedDevice:${String(email || "").trim().toLowerCase()}`;
}

/* Three ways to finish signing in: the authenticator app (default), a
   saved backup code, or a short-lived code emailed on request. The
   verify-login endpoint accepts whichever code comes in and checks all
   three server-side, so switching modes here only changes what the
   input looks like (and, for email, triggers sending the code) — it
   never needs to tell the backend which mode is active. */
let mode = "app"; // "app" | "backup" | "email"
let resendCooldownTimer = null;

function showMessage(msg, color = "red") {
  twoFactorMessage.textContent = msg;
  twoFactorMessage.style.color = color;
}

function setMode(nextMode) {
  mode = nextMode;
  resendEmailOtpWrap.hidden = mode !== "email";

  if (mode === "backup") {
    codeInput.type = "text";
    codeInput.removeAttribute("maxlength");
    codeInput.removeAttribute("inputmode");
    codeInput.placeholder = "XXXXX-XXXXX";
    codeLabel.innerHTML = `<i class="ti ti-key" aria-hidden="true"></i> Backup code`;
    subtitle.textContent = "Enter one of the one-time backup codes you saved when you enabled 2FA.";
    toggleBackupCode.textContent = "Use my authenticator app instead";
    toggleEmailOtp.textContent = "Email me a code instead";
  } else if (mode === "email") {
    codeInput.type = "text";
    codeInput.inputMode = "numeric";
    codeInput.maxLength = 6;
    codeInput.placeholder = "123456";
    codeLabel.innerHTML = `<i class="ti ti-mail" aria-hidden="true"></i> Email code`;
    subtitle.textContent = "Enter the 6-digit code we emailed you.";
    toggleBackupCode.textContent = "Use a backup code instead";
    toggleEmailOtp.textContent = "Use my authenticator app instead";
  } else {
    codeInput.type = "text";
    codeInput.inputMode = "numeric";
    codeInput.maxLength = 6;
    codeInput.placeholder = "123456";
    codeLabel.innerHTML = `<i class="ti ti-key" aria-hidden="true"></i> Authentication code`;
    subtitle.textContent = "Enter the 6-digit code from your authenticator app.";
    toggleBackupCode.textContent = "Use a backup code instead";
    toggleEmailOtp.textContent = "Email me a code instead";
  }

  codeInput.value = "";
  codeInput.focus();
}

/* Mirrors the backend's LOGIN_EMAIL_OTP_RESEND_COOLDOWN_SECONDS default —
   purely cosmetic here (the backend enforces the real cooldown and returns
   a clear error if this drifts), just avoids an obviously-too-early retry. */
function startResendCooldown(seconds = 45) {
  clearInterval(resendCooldownTimer);
  let remaining = seconds;
  resendEmailOtp.style.pointerEvents = "none";
  resendEmailOtp.style.opacity = "0.5";
  resendEmailOtp.textContent = `Resend code (${remaining}s)`;

  resendCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendCooldownTimer);
      resendEmailOtp.style.pointerEvents = "";
      resendEmailOtp.style.opacity = "";
      resendEmailOtp.textContent = "Resend code";
      return;
    }
    resendEmailOtp.textContent = `Resend code (${remaining}s)`;
  }, 1000);
}

async function requestEmailOtp() {
  try {
    const response = await apiRequest("/auth/2fa/verify-login/email-otp", "POST", { tempToken });
    showMessage(response.message || "Code sent — check your email.", "var(--ump-green)");
    startResendCooldown(45);
  } catch (error) {
    showMessage(error.message || "Couldn't send a code right now.", "red");

    /* A stale/expired temp token means the whole login attempt has to
       restart — no amount of retrying fixes that. */
    if (/expired/i.test(error.message || "")) {
      sessionStorage.removeItem("taskify2FATempToken");
      setTimeout(() => { window.location.href = "./login.html"; }, 1800);
    }
  }
}

toggleBackupCode.addEventListener("click", (event) => {
  event.preventDefault();
  setMode(mode === "backup" ? "app" : "backup");
});

toggleEmailOtp.addEventListener("click", (event) => {
  event.preventDefault();
  const enteringEmailMode = mode !== "email";
  setMode(enteringEmailMode ? "email" : "app");
  if (enteringEmailMode) requestEmailOtp();
});

resendEmailOtp.addEventListener("click", (event) => {
  event.preventDefault();
  if (resendEmailOtp.style.pointerEvents === "none") return;
  requestEmailOtp();
});

twoFactorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = codeInput.value.trim();
  if (!code) {
    showMessage("Enter your code.");
    return;
  }

  const originalHtml = verifyButton.innerHTML;
  verifyButton.disabled = true;
  verifyButton.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Verifying…`;
  showMessage("Verifying…", "#687280");

  try {
    const rememberDevice = canRememberDevice && !!rememberDeviceInput?.checked;
    const response = await apiRequest("/auth/2fa/verify-login", "POST", { tempToken, code, rememberDevice });

    localStorage.setItem("taskifyToken", response.data.token);
    localStorage.setItem("taskifyUser", JSON.stringify(response.data.user));

    /* Only present when rememberDevice was true and the account is
       eligible (never admin) — save it so login.js can send it back next
       time and skip the 2FA challenge on this browser. */
    if (response.data.deviceToken && response.data.user?.email) {
      localStorage.setItem(trustedDeviceKey(response.data.user.email), response.data.deviceToken);
    }

    sessionStorage.removeItem("taskify2FATempToken");
    sessionStorage.removeItem("taskify2FAMethod");
    sessionStorage.removeItem("taskify2FACanRememberDevice");
    sessionStorage.removeItem("taskify2FAEmail");

    showMessage("Verified. Redirecting…", "var(--ump-green)");
    setTimeout(() => {
      window.location.href = "./profile.html";
    }, 700);
  } catch (error) {
    showMessage(error.message || "Invalid code. Please try again.", "red");
    verifyButton.disabled = false;
    verifyButton.innerHTML = originalHtml;

    /* A stale/expired temp token means the whole login attempt has to
       restart — no amount of retrying the code will fix that. */
    if (/expired/i.test(error.message || "")) {
      sessionStorage.removeItem("taskify2FATempToken");
      sessionStorage.removeItem("taskify2FAMethod");
      sessionStorage.removeItem("taskify2FACanRememberDevice");
      sessionStorage.removeItem("taskify2FAEmail");
      setTimeout(() => { window.location.href = "./login.html"; }, 1800);
    }
  }
});

/* An email-method account has no authenticator app to default to, so this
   screen skips straight to email mode and fires the first code itself —
   there's no "app code" input that could ever work for them, and making
   them click "email me a code" for their own primary method would just be
   friction. The toggle back to "app" mode is hidden entirely rather than
   just defaulted away from, since switching to it would only show an
   input nothing can satisfy. */
if (accountMethod === "email" && tempToken) {
  toggleEmailOtpWrap.style.display = "none";
  setMode("email");
  requestEmailOtp();
}
