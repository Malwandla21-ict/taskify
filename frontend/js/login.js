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

/* ── Submit ── */
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const submitBtn = loginForm.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    showMessage("Signing you in…", "#687280");

    try {
      const response = await apiRequest("/auth/login", "POST", { email, password });

      localStorage.setItem("taskifyToken", response.data.token);
      localStorage.setItem("taskifyUser", JSON.stringify(response.data.user));

      showMessage("Login successful. Redirecting…", "var(--ump-green)");

      setTimeout(() => {
        window.location.href = "./dashboard.html";
      }, 1000);

    } catch (error) {
      showMessage(error.message || "Invalid email or password.", "red");
      submitBtn.disabled = false;
    }
  });
}

/* ── Init ── */
initPasswordToggles();