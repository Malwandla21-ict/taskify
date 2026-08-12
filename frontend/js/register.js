const registerForm    = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

const progressFill = document.getElementById("progressFill");
const stepText     = document.getElementById("stepText");

const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");
const dot3 = document.getElementById("dot3");

const nextToStep2 = document.getElementById("nextToStep2");
const nextToStep3 = document.getElementById("nextToStep3");
const backToStep1 = document.getElementById("backToStep1");
const backToStep2 = document.getElementById("backToStep2");

const roleOptions       = document.querySelectorAll(".role-option");
const academicYearGroup = document.getElementById("academicYearGroup");
const academicYearSelect = document.getElementById("academicYear");

let selectedRole = "Student";
const profilePhotoInput = document.getElementById("profilePhoto");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");
const profilePhotoLabel = document.getElementById("profilePhotoLabel");

/* Holds the cropped result — used instead of profilePhotoInput.files[0]
   at submit time, since a file input's FileList can't be reassigned. */
let croppedProfilePhotoBlob = null;

profilePhotoInput?.addEventListener("change", async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showMessage("Choose a JPEG, PNG or WebP image smaller than 5 MB.");
    profilePhotoInput.value = "";
    return;
  }

  const blob = await openImageCropper(file, { aspect: 1 });
  if (!blob) {
    profilePhotoInput.value = "";
    return;
  }

  croppedProfilePhotoBlob = blob;
  profilePhotoPreview.src = URL.createObjectURL(blob);
  profilePhotoPreview.style.display = "block";
  profilePhotoLabel.textContent = "Change photo";
});

/* ── Step navigation ── */
function showStep(n) {
  step1.style.display = n === 1 ? "block" : "none";
  step2.style.display = n === 2 ? "block" : "none";
  step3.style.display = n === 3 ? "block" : "none";

  stepText.textContent    = `Step ${n} of 3`;
  progressFill.style.width = n === 1 ? "33%" : n === 2 ? "66%" : "100%";

  [dot1, dot2, dot3].forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < n)  dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });

  showMessage("");
}

/* ── Messages ── */
function showMessage(msg, color = "red") {
  registerMessage.textContent = msg;
  registerMessage.style.color = color;
}

/* ── Role toggle: hide Academic Year for Staff ── */
function applyRoleUI() {
  const isStudent = selectedRole === "Student";
  academicYearGroup.style.display = isStudent ? "block" : "none";
  if (!isStudent) academicYearSelect.value = "";
}

roleOptions.forEach(option => {
  option.addEventListener("click", () => {
    roleOptions.forEach(o => o.classList.remove("active"));
    option.classList.add("active");
    selectedRole = option.dataset.role;
    applyRoleUI();
  });
});

/* ── Validators ── */
function validateStep1() {
  const firstName    = document.getElementById("firstName").value.trim();
  const lastName     = document.getElementById("lastName").value.trim();
  const studentNumber = document.getElementById("studentNumber").value.trim();
  const email        = document.getElementById("email").value.trim();
  const phoneNumber  = document.getElementById("phoneNumber").value.trim();

  if (!firstName || !lastName || !studentNumber || !email || !phoneNumber) {
    showMessage("Please complete all fields before continuing.");
    return false;
  }

  if (!email.toLowerCase().endsWith("@ump.ac.za")) {
    showMessage("Please use your UMP email address (e.g. s202312345@ump.ac.za).");
    return false;
  }

  const phoneRegex = /^(\+27|27|0)[0-9]{9}$/;
  if (!phoneRegex.test(phoneNumber.replace(/\s+/g, ""))) {
    showMessage("Please enter a valid South African phone number.");
    return false;
  }

  return true;
}

function validateStep2() {
  const faculty      = document.getElementById("faculty").value;
  const academicYear = academicYearSelect.value;

  if (!faculty) {
    showMessage("Please select your faculty or department.");
    return false;
  }

  if (selectedRole === "Student" && !academicYear) {
    showMessage("Please select your academic year.");
    return false;
  }

  return true;
}

function validateStep3() {
  const password        = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const termsAccepted   = document.getElementById("termsCheckbox").checked;

  if (!password || password.length < 6) {
    showMessage("Password must be at least 6 characters long.");
    return false;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords do not match. Please check and try again.");
    return false;
  }

  if (!termsAccepted) {
    showMessage("Please accept the Terms & Conditions to continue.");
    return false;
  }

  return true;
}

/* ── Step buttons ── */
nextToStep2.addEventListener("click", () => {
  if (validateStep1()) showStep(2);
});

nextToStep3.addEventListener("click", () => {
  if (validateStep2()) showStep(3);
});

backToStep1.addEventListener("click", () => showStep(1));
backToStep2.addEventListener("click", () => showStep(2));

/* ── Helpers ── */
function buildFullName() {
  const first = document.getElementById("firstName").value.trim();
  const last  = document.getElementById("lastName").value.trim();
  return `${first} ${last}`.trim();
}

/* ── Submit ── */
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStep3()) return;

  const registerData = new FormData();
  registerData.append("fullName", buildFullName());
  registerData.append("email", document.getElementById("email").value.trim());
  registerData.append("phoneNumber", document.getElementById("phoneNumber").value.trim());
  registerData.append("password", document.getElementById("password").value);
  registerData.append("studentNumber", document.getElementById("studentNumber").value.trim());
  registerData.append("memberType", selectedRole);
  registerData.append("faculty", document.getElementById("faculty").value);
  if (selectedRole === "Student") {
    registerData.append("academicYear", document.getElementById("academicYear").value);
  }

  if (croppedProfilePhotoBlob) {
    registerData.append("profilePhoto", croppedProfilePhotoBlob, "profile.jpg");
  }

  const submitBtn = document.getElementById("createAccountButton");
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Creating account…`;
  showMessage("Creating your account…", "#687280");

  try {
    const response = await apiMultipartRequest("/auth/register", "POST", registerData);

    const token = response.data.token;
    const user  = response.data.user;

    localStorage.setItem("taskifyToken", token);
    localStorage.setItem("taskifyUser", JSON.stringify(user));

    showMessage("Account created! Redirecting you now…", "var(--ump-green)");

    setTimeout(() => {
      window.location.href = "./profile.html";
    }, 900);

  } catch (error) {
    showMessage(error.message || "Something went wrong. Please try again.", "red");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;
  }
});

/* ── Password visibility toggles ── */
function initPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const icon  = btn.querySelector("i");
      const showing = input.type === "text";

      input.type = showing ? "password" : "text";
      icon.className = showing ? "ti ti-eye" : "ti ti-eye-off";
      btn.classList.toggle("active", !showing);
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

/* ── Init ── */
applyRoleUI();
initPasswordToggles();