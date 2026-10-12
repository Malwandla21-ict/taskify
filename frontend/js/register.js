const registerForm    = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const steps = [step1, step2, step3];

const progressFill = document.getElementById("progressFill");
const stepText     = document.getElementById("stepText");

const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");
const dot3 = document.getElementById("dot3");

const nextToStep2 = document.getElementById("nextToStep2");
const nextToStep3 = document.getElementById("nextToStep3");
const backToStep1 = document.getElementById("backToStep1");
const backToStep2 = document.getElementById("backToStep2");

const roleGrid           = document.querySelector(".role-grid");
const roleOptions        = document.querySelectorAll(".role-option");
const academicYearGroup  = document.getElementById("academicYearGroup");
const academicYearSelect = document.getElementById("academicYear");
const lecturerFieldsGroup = document.getElementById("lecturerFieldsGroup");
const lecturerTitleSelect = document.getElementById("lecturerTitle");

const field = (id) => document.getElementById(id);

let selectedRole = "Student";
let croppedProfilePhoto = null;
let currentStep = 1;

/* UMP student numbers are 9 digits; staff and lecturer numbers are 5.
   (Same rule as backend/src/routes/auth.routes.js.) */
const ID_RULES = {
  Student:  { digits: 9, label: "Student Number", noun: "student number", example: "223456789", hint: "9 digits, as on your student card" },
  Lecturer: { digits: 5, label: "Staff Number",   noun: "staff number",   example: "12345",     hint: "5 digits, as on your staff card" }
};
const idRule = () => ID_RULES[selectedRole] || ID_RULES.Student;

const profilePhotoInput   = document.getElementById("profilePhoto");
const profilePhotoPreview = document.getElementById("profilePhotoPreview");
const profilePhotoLabel   = document.getElementById("profilePhotoLabel");

/* Opens the cropper immediately after a file is chosen, instead of
   previewing the raw file — this is the step that was previously
   missing after the profile overhaul. */
profilePhotoInput?.addEventListener("change", () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showMessage("Choose a JPEG, PNG or WebP image smaller than 5 MB.");
    profilePhotoInput.value = "";
    return;
  }

  openImageCropper(file, (croppedFile) => {
    croppedProfilePhoto = croppedFile;
    profilePhotoPreview.src = URL.createObjectURL(croppedFile);
    profilePhotoPreview.style.display = "block";
    profilePhotoLabel.textContent = "Change photo";
  });
});

function showStep(n) {
  currentStep = n;
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

function showMessage(msg, color = "red") {
  registerMessage.textContent = msg;
  registerMessage.style.color = color;
}

/* ── Step-level error handling ──
   Every problem on the step is shown at once, each under its own field,
   with a one-line count at the top; the first one gets focus. */
function reportStepErrors(stepEl, problems) {
  const summary = stepEl.querySelector(".form-error-summary");
  stepEl.querySelectorAll(".input-invalid").forEach(clearFieldError);
  problems.forEach(([target, message]) => setFieldError(target, message));

  if (summary) {
    summary.hidden = problems.length === 0;
    summary.innerHTML = problems.length
      ? `<i class="ti ti-alert-circle" aria-hidden="true"></i> ${problems.length === 1
          ? "1 thing to fix before you continue."
          : `${problems.length} things to fix before you continue.`}`
      : "";
  }
  if (problems.length) focusFirstInvalid(stepEl);
  return problems.length === 0;
}

/* The count at the top updates as people fix things. */
registerForm.addEventListener("input", refreshSummary);
registerForm.addEventListener("change", refreshSummary);
function refreshSummary() {
  steps.forEach(stepEl => {
    const summary = stepEl.querySelector(".form-error-summary");
    if (!summary || summary.hidden) return;
    const left = stepEl.querySelectorAll(".input-invalid").length;
    summary.hidden = left === 0;
    summary.innerHTML = `<i class="ti ti-alert-circle" aria-hidden="true"></i> ${left === 1
      ? "1 thing left to fix."
      : `${left} things left to fix.`}`;
  });
}

/* ── Account type ── */
function applyRoleUI() {
  const isStudent  = selectedRole === "Student";
  const isLecturer = selectedRole === "Lecturer";

  academicYearGroup.style.display   = isStudent ? "block" : "none";
  lecturerFieldsGroup.style.display = isLecturer ? "block" : "none";

  if (!isStudent) academicYearSelect.value = "";
  if (!isLecturer) {
    lecturerTitleSelect.value = "";
    document.getElementById("yearsExperience").value = "";
    document.getElementById("officeLocation").value = "";
    document.getElementById("consultationMode").value = "";
  }

  /* The ID field, email example and faculty list follow the account type. */
  const rule = idRule();
  const numberInput = field("studentNumber");
  field("studentNumberLabel").innerHTML = `<i class="ti ti-id-badge" aria-hidden="true"></i> ${rule.label}`;
  numberInput.placeholder = rule.example;
  numberInput.maxLength = rule.digits;
  numberInput.value = numberInput.value.replace(/\D/g, "").slice(0, rule.digits);
  field("email").placeholder = isStudent ? `${ID_RULES.Student.example}@ump.ac.za` : "name.surname@ump.ac.za";
  field("emailHint").querySelector("span").textContent = isStudent
    ? "Your student number followed by @ump.ac.za"
    : "Your staff email: name.surname@ump.ac.za";
  field("facultyLabel").innerHTML = `<i class="ti ti-building" aria-hidden="true"></i> ${isStudent ? "Faculty" : "Faculty or Department"}`;
  field("step2Subtitle").textContent = isStudent ? "Your faculty and year of study" : "Your faculty or department, and how students can reach you";

  /* Keep the choice when switching type, unless a student would be left
     holding a staff-only department. */
  const facultySelect = field("faculty");
  const keep = isStudent && !UMP_FACULTIES[facultySelect.value] ? "" : facultySelect.value;
  fillFacultySelect(facultySelect, { memberType: selectedRole, selected: keep, hintEl: field("facultyHint") });

  updateNumberHint();
}

function selectRole(option) {
  roleOptions.forEach(o => {
    o.classList.toggle("active", o === option);
    o.setAttribute("aria-checked", String(o === option));
    o.tabIndex = o === option ? 0 : -1;
  });
  selectedRole = option.dataset.role;
  clearFieldError(field("studentNumber"));
  applyRoleUI();
}

roleOptions.forEach(option => {
  option.addEventListener("click", () => selectRole(option));
  option.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRole(option); }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const list = [...roleOptions];
      const next = list[(list.indexOf(option) + 1) % list.length];
      selectRole(next);
      next.focus();
    }
  });
});

/* ── Student / staff number: digits only, live count, and for students
   the email fills itself in from the number. ── */
const numberInput = field("studentNumber");
const emailInput  = field("email");
let emailAutoFilled = false;

function updateNumberHint() {
  const rule = idRule();
  const len = numberInput.value.length;
  const hint = field("studentNumberHint");
  hint.querySelector("span").textContent = rule.hint;
  field("studentNumberCount").textContent = `${len}/${rule.digits}`;
  hint.classList.toggle("ok", len === rule.digits);
  hint.querySelector(".ti").className = `ti ${len === rule.digits ? "ti-circle-check" : "ti-info-circle"}`;
}

numberInput.addEventListener("input", () => {
  numberInput.value = numberInput.value.replace(/\D/g, "").slice(0, idRule().digits);
  updateNumberHint();

  if (selectedRole === "Student" && (!emailInput.value.trim() || emailAutoFilled)) {
    emailInput.value = numberInput.value.length === ID_RULES.Student.digits ? `${numberInput.value}@ump.ac.za` : "";
    emailAutoFilled = !!emailInput.value;
    if (emailAutoFilled) clearFieldError(emailInput);
  }
});
emailInput.addEventListener("input", () => { emailAutoFilled = false; });

/* ── Step 1 ── */
function validateStep1() {
  const problems = [];
  const firstName = field("firstName").value.trim();
  const lastName  = field("lastName").value.trim();
  const number    = numberInput.value.trim();
  const email     = emailInput.value.trim().toLowerCase();
  const phone     = field("phoneNumber").value.trim().replace(/\s+/g, "");
  const rule      = idRule();

  if (!firstName) problems.push([field("firstName"), "Enter your first name."]);
  if (!lastName) problems.push([field("lastName"), "Enter your last name."]);

  if (!number) {
    problems.push([numberInput, `Enter your ${rule.noun}.`]);
  } else if (number.length !== rule.digits) {
    problems.push([numberInput, `Your ${rule.noun} must be exactly ${rule.digits} digits — you've entered ${number.length}.`]);
  }

  const local = email.split("@")[0];
  if (!email) {
    problems.push([emailInput, "Enter your UMP email address."]);
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push([emailInput, "That doesn't look like an email address."]);
  } else if (!email.endsWith("@ump.ac.za")) {
    problems.push([emailInput, selectedRole === "Student"
      ? `Use your UMP student email, e.g. ${number.length === rule.digits ? number : rule.example}@ump.ac.za.`
      : "Use your UMP staff email, e.g. name.surname@ump.ac.za."]);
  } else if (selectedRole === "Student" && /^\d+$/.test(local) && number && local !== number) {
    problems.push([emailInput, `Your student email should match your student number (${number}@ump.ac.za).`]);
  } else if (selectedRole !== "Student" && /^\d+$/.test(local)) {
    problems.push([emailInput, "That's a student email. Lecturers sign up with name.surname@ump.ac.za — or choose Student above."]);
  }

  if (!phone) {
    problems.push([field("phoneNumber"), "Enter your WhatsApp number."]);
  } else if (!/^(\+27|27|0)[0-9]{9}$/.test(phone)) {
    problems.push([field("phoneNumber"), "Enter a South African number, e.g. 0821234567 or +27821234567."]);
  }

  return reportStepErrors(step1, problems);
}

/* ── Step 2 ── */
function validateStep2() {
  const problems = [];
  if (!field("faculty").value || field("faculty").selectedOptions[0]?.dataset.legacy) {
    problems.push([field("faculty"), selectedRole === "Student" ? "Choose your faculty." : "Choose your faculty or department."]);
  }
  if (selectedRole === "Student" && !academicYearSelect.value) {
    problems.push([academicYearSelect, "Choose your year of study."]);
  }
  if (selectedRole === "Lecturer" && !lecturerTitleSelect.value) {
    problems.push([lecturerTitleSelect, "Choose your title."]);
  }
  const years = field("yearsExperience").value.trim();
  if (selectedRole === "Lecturer" && years && (!/^\d+$/.test(years) || Number(years) > 60)) {
    problems.push([field("yearsExperience"), "Enter a whole number of years from 0 to 60."]);
  }
  return reportStepErrors(step2, problems);
}

/* ── Step 3: password guidance ──
   Required (the server enforces these): 8+ characters, a letter, a number.
   The other three only make it stronger; the meter reflects all six. */
const passwordInput = field("password");
const confirmInput  = field("confirmPassword");

function passwordChecks(pw) {
  const lower = pw.toLowerCase();
  const personal = [field("firstName").value, field("lastName").value, numberInput.value]
    .map(s => s.trim().toLowerCase()).filter(s => s.length >= 3);
  return {
    length: pw.length >= 8,
    letter: /[A-Za-z]/.test(pw),
    number: /[0-9]/.test(pw),
    mixed:  /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
    personal: pw.length > 0 && !personal.some(p => lower.includes(p))
  };
}
const REQUIRED_RULES = ["length", "letter", "number"];

function renderPasswordGuidance({ showMissing = false } = {}) {
  const pw = passwordInput.value;
  const checks = passwordChecks(pw);

  field("passwordChecklist").querySelectorAll("li").forEach(li => {
    const rule = li.dataset.rule;
    const met = checks[rule];
    const required = REQUIRED_RULES.includes(rule);
    li.classList.toggle("met", met);
    li.classList.toggle("missing", !met && required && showMissing);
    li.querySelector(".ti").className = `ti ${met ? "ti-circle-check" : required ? (showMissing ? "ti-circle-x" : "ti-circle") : "ti-circle-dashed"}`;
  });

  const meetsRequired = REQUIRED_RULES.every(r => checks[r]);
  const extras = ["mixed", "symbol", "personal"].filter(r => checks[r]).length + (pw.length >= 12 ? 1 : 0);
  const score = !pw ? 0 : !meetsRequired ? 1 : extras <= 1 ? 2 : extras <= 2 ? 3 : 4;
  field("passwordMeter").dataset.score = String(score);
  field("passwordMeterLabel").textContent = ["", "Too weak", "Okay — add a capital letter or a symbol to make it stronger", "Strong", "Very strong"][score];

  if (confirmInput.value) renderConfirmHint();
  return meetsRequired;
}

function renderConfirmHint() {
  const hint = field("confirmHint");
  if (!confirmInput.value) { hint.hidden = true; return; }
  const match = confirmInput.value === passwordInput.value;
  hint.hidden = false;
  hint.classList.toggle("ok", match);
  hint.innerHTML = match
    ? `<i class="ti ti-circle-check" aria-hidden="true"></i> <span>Passwords match</span>`
    : `<i class="ti ti-info-circle" aria-hidden="true"></i> <span>Doesn't match yet</span>`;
}

passwordInput.addEventListener("input", () => renderPasswordGuidance());
confirmInput.addEventListener("input", renderConfirmHint);

function validateStep3() {
  const problems = [];
  const pw = passwordInput.value;
  const checks = passwordChecks(pw);
  const missing = REQUIRED_RULES.filter(r => !checks[r]);
  renderPasswordGuidance({ showMissing: true });

  if (!pw) {
    problems.push([passwordInput, "Create a password."]);
  } else if (missing.length) {
    const words = { length: "at least 8 characters", letter: "a letter", number: "a number" };
    problems.push([passwordInput, `Your password still needs ${missing.map(r => words[r]).join(" and ")}.`]);
  }

  if (!confirmInput.value) {
    problems.push([confirmInput, "Type your password again to confirm it."]);
  } else if (confirmInput.value !== pw) {
    problems.push([confirmInput, "The two passwords don't match."]);
    field("confirmHint").hidden = true;   // the error below says it
  }

  if (!field("termsCheckbox").checked) {
    problems.push([field("termsRow"), "Tick this box to accept the Terms & Conditions."]);
  }
  return reportStepErrors(step3, problems);
}

field("termsCheckbox").addEventListener("change", () => clearFieldError(field("termsRow")));

nextToStep2.addEventListener("click", () => {
  if (validateStep1()) showStep(2);
});

nextToStep3.addEventListener("click", () => {
  if (validateStep2()) showStep(3);
});

backToStep1.addEventListener("click", () => showStep(1));
backToStep2.addEventListener("click", () => showStep(2));

/* Pressing Enter on steps 1 and 2 moves on (with checks) instead of
   trying to submit the whole form early. */
registerForm.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.matches("textarea, button, a")) return;
  if (currentStep === 1) { e.preventDefault(); nextToStep2.click(); }
  else if (currentStep === 2) { e.preventDefault(); nextToStep3.click(); }
});

/* ── Errors from the server go back to the field they're about ── */
const SERVER_FIELD_MAP = {
  fullName: ["firstName", 1], email: ["email", 1], phoneNumber: ["phoneNumber", 1], studentNumber: ["studentNumber", 1],
  memberType: ["studentNumber", 1], faculty: ["faculty", 2], academicYear: ["academicYear", 2],
  lecturerTitle: ["lecturerTitle", 2], yearsExperience: ["yearsExperience", 2],
  officeLocation: ["officeLocation", 2], consultationMode: ["consultationMode", 2], password: ["password", 3]
};

function showServerErrors(error) {
  let fields = (error.fields || []).map(f => [SERVER_FIELD_MAP[f.path || f.param], f.msg]).filter(([m]) => m);
  /* Errors from the service itself (not the validators) only have a
     message — the email ones are by far the most common. */
  if (!fields.length && /email/i.test(error.message)) fields = [[SERVER_FIELD_MAP.email, error.message]];
  if (!fields.length && /student|staff number/i.test(error.message)) fields = [[SERVER_FIELD_MAP.studentNumber, error.message]];
  if (!fields.length) {
    showMessage(error.message || "Something went wrong. Please try again.", "red");
    return;
  }

  const firstStep = Math.min(...fields.map(([[, stepNo]]) => stepNo));
  showStep(firstStep);
  const onStep = fields.filter(([[, stepNo]]) => stepNo === firstStep).map(([[id], msg]) => [field(id), msg]);
  reportStepErrors(steps[firstStep - 1], onStep);
}

function buildFullName() {
  const first = document.getElementById("firstName").value.trim();
  const last  = document.getElementById("lastName").value.trim();
  return `${first} ${last}`.trim();
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  /* Re-check every step: if something earlier is wrong, go back to it. */
  if (!validateStep1()) { showStep(1); validateStep1(); return; }
  if (!validateStep2()) { showStep(2); validateStep2(); return; }
  if (!validateStep3()) return;

  const registerData = new FormData();
  registerData.append("fullName", buildFullName());
  registerData.append("email", document.getElementById("email").value.trim());
  registerData.append("phoneNumber", document.getElementById("phoneNumber").value.trim());
  registerData.append("password", document.getElementById("password").value);
  registerData.append("studentNumber", document.getElementById("studentNumber").value.trim());
  registerData.append("memberType", selectedRole);
  registerData.append("faculty", document.getElementById("faculty").value);
  registerData.append("academicYear", selectedRole === "Student" ? academicYearSelect.value : "");

  if (selectedRole === "Lecturer") {
    registerData.append("lecturerTitle", lecturerTitleSelect.value);
    const years = document.getElementById("yearsExperience").value.trim();
    if (years) registerData.append("yearsExperience", years);
    const office = document.getElementById("officeLocation").value.trim();
    if (office) registerData.append("officeLocation", office);
    const mode = document.getElementById("consultationMode").value.trim();
    if (mode) registerData.append("consultationMode", mode);
  }

  if (croppedProfilePhoto) registerData.append("profilePhoto", croppedProfilePhoto);

  const submitBtn = document.getElementById("createAccountButton");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Creating account…`;
  showMessage("Creating your account…", "#687280");

  try {
    const response = await apiMultipartRequest("/auth/register", "POST", registerData);
    const registeredEmail = document.getElementById("email").value.trim();

    /* TEMPORARY: while SKIP_EMAIL_VERIFICATION is on (email delivery isn't
       reliable yet), the backend marks new accounts verified immediately
       and tells us via data.verified — skip the code-entry detour and send
       people straight to log in instead of a page waiting on a code that
       will never arrive. Remove this branch once that env var is gone. */
    if (response.data && response.data.verified) {
      showMessage(
        response.message || "Account created! You can log in now.",
        "var(--ump-green)"
      );
      submitBtn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Account created`;

      setTimeout(() => {
        window.location.href = "./login.html";
      }, 1500);
      return;
    }

    /* Registration no longer logs you in automatically — the account isn't
       usable until the email address is confirmed via the code we just
       emailed. Stash the email for verify-email.html (it only ever asks
       for the code, never the address) and send them straight there. */
    sessionStorage.setItem("taskifyPendingVerifyEmail", registeredEmail);

    showMessage(
      response.message || "Account created! Please check your email for a 6-digit verification code.",
      "var(--ump-green)"
    );
    submitBtn.innerHTML = `<i class="ti ti-mail-check" aria-hidden="true"></i> Check your email`;

    setTimeout(() => {
      window.location.href = "./verify-email.html";
    }, 1500);

  } catch (error) {
    showMessage("");
    showServerErrors(error);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

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

applyRoleUI();
renderPasswordGuidance();
initPasswordToggles();
