const twoFactorForm    = document.getElementById("twoFactorForm");
const twoFactorMessage = document.getElementById("twoFactorMessage");
const codeInput        = document.getElementById("code");
const codeLabel        = document.getElementById("codeLabel");
const subtitle         = document.getElementById("twoFactorSubtitle");
const toggleBackupCode = document.getElementById("toggleBackupCode");
const verifyButton     = document.getElementById("verifyButton");

const tempToken = sessionStorage.getItem("taskify2FATempToken");

/* No pending 2FA session — nothing to verify, send them back to log in. */
if (!tempToken) {
  window.location.href = "./login.html";
}

let usingBackupCode = false;

function showMessage(msg, color = "red") {
  twoFactorMessage.textContent = msg;
  twoFactorMessage.style.color = color;
}

toggleBackupCode.addEventListener("click", (event) => {
  event.preventDefault();
  usingBackupCode = !usingBackupCode;

  if (usingBackupCode) {
    codeInput.type = "text";
    codeInput.removeAttribute("maxlength");
    codeInput.removeAttribute("inputmode");
    codeInput.placeholder = "XXXXX-XXXXX";
    codeLabel.innerHTML = `<i class="ti ti-key" aria-hidden="true"></i> Backup code`;
    subtitle.textContent = "Enter one of the one-time backup codes you saved when you enabled 2FA.";
    toggleBackupCode.textContent = "Use my authenticator app instead";
  } else {
    codeInput.type = "text";
    codeInput.inputMode = "numeric";
    codeInput.maxLength = 6;
    codeInput.placeholder = "123456";
    codeLabel.innerHTML = `<i class="ti ti-key" aria-hidden="true"></i> Authentication code`;
    subtitle.textContent = "Enter the 6-digit code from your authenticator app.";
    toggleBackupCode.textContent = "Use a backup code instead";
  }

  codeInput.value = "";
  codeInput.focus();
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
    const response = await apiRequest("/auth/2fa/verify-login", "POST", { tempToken, code });

    localStorage.setItem("taskifyToken", response.data.token);
    localStorage.setItem("taskifyUser", JSON.stringify(response.data.user));
    sessionStorage.removeItem("taskify2FATempToken");

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
      setTimeout(() => { window.location.href = "./login.html"; }, 1800);
    }
  }
});
