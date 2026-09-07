const currentUser = requireAuth();

if (currentUser?.member_type !== "Lecturer") {
  window.location.href = "./profile.html";
}

const profileMainCard   = document.getElementById("profileMainCard");
const profilePhotoInput = document.getElementById("profilePhotoInput");

let latestProfile = null;
let selectedStudent = null;
let editSkills = [];
let editServices = [];

document.querySelectorAll(".profile-tab, [data-goto-tab]").forEach(el => {
  const key = el.dataset.tab || el.dataset.gotoTab;
  if (!key) return;
  el.addEventListener("click", () => {
    document.querySelectorAll(".profile-tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`.profile-tab[data-tab="${key}"]`)?.classList.add("active");
    document.querySelectorAll(".profile-tab-panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`${key}Tab`)?.classList.add("active");
  });
});

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function activityIcon(type) {
  const map = { endorsement_given: "ti-certificate", review_received: "ti-star" };
  return map[type] || "ti-activity";
}

function activityRow(item) {
  return `
    <div class="profile-activity-item">
      <div class="profile-activity-icon"><i class="ti ${activityIcon(item.type)}" aria-hidden="true"></i></div>
      <div class="profile-activity-body">
        <div class="profile-activity-title">${item.title}</div>
        ${item.subtitle ? `<div class="profile-activity-sub">${item.subtitle}</div>` : ""}
      </div>
      <div class="profile-activity-time">${timeAgo(item.created_at)}</div>
    </div>`;
}

async function loadProfile() {
  try {
    const res = await apiRequest(`/users/${currentUser.id}/profile`);
    const profile = res.data;
    latestProfile = profile;

    profileMainCard.innerHTML = `
      <div class="profile-header-card">
        <div class="profile-cover-photo" style="background-image:url('./assets/images/UMP-Buildings-62.jpg');"></div>
        <button type="button" class="edit-profile-header-btn" id="openEditProfileBtn">
          <i class="ti ti-pencil" aria-hidden="true"></i> Edit Profile
        </button>
        <div class="profile-header-body">
          <div class="profile-avatar-large-wrap">
            <div class="profile-avatar-large" style="overflow:hidden;">
              ${avatarHtml(profile.full_name, profile.profilePhoto)}
            </div>
          </div>
          <div class="profile-header-info">
            <h2>${posterName(profile.full_name, profile.lecturer_title)} <span class="lecturer-title-badge"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Verified Lecturer</span></h2>
            <p><i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}${profile.office_location ? ` &nbsp;·&nbsp; <i class="ti ti-map-pin" aria-hidden="true"></i> ${profile.office_location}` : ""}</p>
            <p style="margin-top:2px;"><i class="ti ti-building" aria-hidden="true"></i> ${profile.faculty || "Faculty not set"}${profile.years_experience ? ` &nbsp;·&nbsp; ${profile.years_experience}+ years experience` : ""}</p>
          </div>
        </div>
        <div class="profile-stats-inline">
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-certificate" aria-hidden="true"></i></div><div class="pstat-value">${profile.lecturer_stats?.endorsementsGiven ?? 0}</div><div class="pstat-label">Endorsements Given</div></div>
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-users" aria-hidden="true"></i></div><div class="pstat-value">${profile.lecturer_stats?.studentsEndorsed ?? 0}</div><div class="pstat-label">Students Endorsed</div></div>
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-star" aria-hidden="true"></i></div><div class="pstat-value">${Number(profile.rating_average || 0).toFixed(1)}</div><div class="pstat-label">Avg Rating</div></div>
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-message-star" aria-hidden="true"></i></div><div class="pstat-value">${profile.total_reviews}</div><div class="pstat-label">Reviews</div></div>
        </div>
      </div>
    `;

    document.getElementById("openEditProfileBtn")?.addEventListener("click", openEditProfileModal);

    document.getElementById("aboutMeText").textContent = profile.bio || "No bio added yet. Click Edit Profile to introduce yourself.";
    document.getElementById("expertiseTagsRow").innerHTML = profile.skills.length
      ? profile.skills.map(s => `<div class="profile-tag">${s}</div>`).join("")
      : `<p style="color:var(--muted);font-size:12px;">No expertise tags added yet.</p>`;
    document.getElementById("servicesTagsRow").innerHTML = profile.services.length
      ? profile.services.map(s => `<div class="profile-tag" style="background:rgba(0,155,114,0.10);color:var(--ump-green);">${s}</div>`).join("")
      : `<p style="color:var(--muted);font-size:12px;">No services listed yet.</p>`;
    document.getElementById("availabilityText").textContent = profile.availability_note ||
      (profile.consultation_mode ? `Available for ${profile.consultation_mode}.` : "No availability set yet.");

    const activityHtml = profile.recent_activity.length
      ? profile.recent_activity.map(activityRow).join("")
      : `<p style="color:var(--muted);font-size:13px;">No activity yet.</p>`;
    document.getElementById("overviewActivityList").innerHTML = activityHtml;
    document.getElementById("fullActivityList").innerHTML = activityHtml;

    document.getElementById("endorsementCountPill").textContent = profile.lecturer_stats?.endorsementsGiven ?? 0;

    renderReviews(profile.recent_reviews || []);
  } catch (err) {
    profileMainCard.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

function renderReviews(reviews) {
  const container = document.getElementById("recentReviewsContainer");
  if (!reviews.length) {
    container.innerHTML = emptyState("ti-star", "No reviews yet", "Reviews appear here after completed collaborations.");
    return;
  }
  container.innerHTML = reviews.map(r => {
    const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
    return `
      <div class="market-card">
        <div class="market-content">
          <div class="market-top">
            <div class="market-user">
              <div class="market-avatar">${avatarHtml(r.reviewer_name, r.reviewer_profile_photo)}</div>
              <div><div class="market-user-name profile-link" data-user-id="${r.reviewer_id}" style="cursor:pointer;">${r.reviewer_name}</div></div>
            </div>
            <div class="badge"><i class="ti ti-star" aria-hidden="true"></i> ${r.rating}/5</div>
          </div>
          <p style="color:var(--ump-gold);font-size:16px;margin-bottom:8px;">${stars}</p>
          <p style="color:var(--muted);font-size:13px;">${r.comment || "No comment provided."}</p>
        </div>
      </div>`;
  }).join("");
  attachProfileLinkEvents();
}

async function loadEndorsementsGiven() {
  const container = document.getElementById("myEndorsementsGivenContainer");
  try {
    const res = await apiRequest("/lecturer/endorsements/given");
    const endorsements = res.data;
    container.innerHTML = endorsements.length
      ? endorsements.map(e => `
          <div class="endorsement-card">
            <div class="endorsement-card-top">
              <div class="market-avatar" style="width:38px;height:38px;">${avatarHtml(e.endorsed_user_name, e.endorsed_user_photo)}</div>
              <div>
                <div class="profile-link" data-user-id="${e.endorsed_user_id}" style="cursor:pointer;font-weight:700;font-size:13px;">${e.endorsed_user_name}</div>
                <div style="font-size:11px;color:var(--muted);">${new Date(e.created_at).toLocaleDateString()}</div>
              </div>
              <div class="endorsement-badge ${e.endorsement_type.toLowerCase()}" style="margin-left:auto;">
                <i class="ti ti-certificate" aria-hidden="true"></i> ${e.endorsement_type}
              </div>
            </div>
            ${e.message ? `<p style="font-size:13px;color:var(--text);margin-bottom:10px;">"${e.message}"</p>` : ""}
            <button type="button" class="market-action-btn outline revoke-endorsement-btn" data-endorsement-id="${e.id}" style="color:var(--ump-red);border-color:rgba(224,58,62,0.25);">
              <i class="ti ti-trash" aria-hidden="true"></i> Revoke
            </button>
          </div>`).join("")
      : emptyState("ti-certificate", "No endorsements given yet", "Use Give Endorsement to vouch for a student's tutoring or listings.");
    attachProfileLinkEvents();
    attachRevokeEvents();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function attachRevokeEvents() {
  document.querySelectorAll(".revoke-endorsement-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Revoke this endorsement?")) return;
      try {
        await apiRequest(`/lecturer/endorsements/${btn.dataset.endorsementId}`, "DELETE");
        showToast("Endorsement revoked.");
        await Promise.all([loadEndorsementsGiven(), loadProfile()]);
      } catch (err) { showToast(err.message, "error"); }
    });
  });
}

const giveEndorsementModal    = document.getElementById("giveEndorsementModal");
const studentSearchInput      = document.getElementById("studentSearchInput");
const studentSearchResults    = document.getElementById("studentSearchResults");
const selectedStudentChip     = document.getElementById("selectedStudentChip");
const endorsementTypeSelect   = document.getElementById("endorsementTypeSelect");
const contextListingGroup     = document.getElementById("contextListingGroup");
const contextListingSelect    = document.getElementById("contextListingSelect");
const endorsementMessage      = document.getElementById("endorsementMessage");

function openGiveEndorsementModal() {
  selectedStudent = null;
  studentSearchInput.value = "";
  studentSearchResults.style.display = "none";
  selectedStudentChip.style.display = "none";
  endorsementTypeSelect.value = "Tutoring";
  contextListingGroup.style.display = "none";
  contextListingSelect.innerHTML = `<option value="">No specific listing</option>`;
  endorsementMessage.value = "";
  giveEndorsementModal.style.display = "block";
  document.getElementById("overlay").style.display = "block";
}

function closeGiveEndorsementModal() {
  giveEndorsementModal.style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

document.getElementById("openGiveEndorsementBtn")?.addEventListener("click", openGiveEndorsementModal);
document.getElementById("quickGiveEndorsementBtn")?.addEventListener("click", openGiveEndorsementModal);
document.getElementById("closeGiveEndorsementModal")?.addEventListener("click", closeGiveEndorsementModal);

let searchDebounce = null;
studentSearchInput?.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = studentSearchInput.value.trim();
  if (q.length < 2) { studentSearchResults.style.display = "none"; return; }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await apiRequest(`/lecturer/search-students?q=${encodeURIComponent(q)}`);
      const students = res.data;
      studentSearchResults.innerHTML = students.length
        ? students.map(s => `
            <div class="student-search-result-row" data-student-id="${s.id}" data-student-name="${s.full_name}" data-student-photo="${s.profile_photo_url || ""}">
              <div class="market-avatar" style="width:28px;height:28px;">${avatarHtml(s.full_name, s.profile_photo_url)}</div>
              <div>
                <div style="font-weight:600;">${s.full_name}</div>
                <div style="font-size:11px;color:var(--muted);">${s.email}</div>
              </div>
            </div>`).join("")
        : `<div style="padding:10px 12px;font-size:12px;color:var(--muted);">No matching students.</div>`;
      studentSearchResults.style.display = "block";

      studentSearchResults.querySelectorAll(".student-search-result-row").forEach(row => {
        row.addEventListener("click", () => selectStudent({
          id: row.dataset.studentId, name: row.dataset.studentName, photo: row.dataset.studentPhoto
        }));
      });
    } catch (err) { showToast(err.message, "error"); }
  }, 300);
});

async function selectStudent(student) {
  selectedStudent = student;
  studentSearchResults.style.display = "none";
  studentSearchInput.value = "";
  selectedStudentChip.style.display = "flex";
  selectedStudentChip.className = "selected-student-chip";
  selectedStudentChip.innerHTML = `
    <div class="market-avatar" style="width:32px;height:32px;">${avatarHtml(student.name, student.photo)}</div>
    <span style="font-weight:600;font-size:13px;">${student.name}</span>
    <button type="button" id="clearSelectedStudent"><i class="ti ti-x" aria-hidden="true"></i></button>`;
  document.getElementById("clearSelectedStudent").addEventListener("click", () => {
    selectedStudent = null;
    selectedStudentChip.style.display = "none";
    contextListingGroup.style.display = "none";
  });

  try {
    const res = await apiRequest(`/lecturer/students/${student.id}/listings`);
    const { sales, equipment, tasks, events } = res.data;
    const hasAny = sales.length || equipment.length || (tasks?.length) || (events?.length);
    if (hasAny) {
      contextListingSelect.innerHTML = `<option value="">No specific listing</option>` +
        (tasks?.length ? `<optgroup label="Tasks">${tasks.map(t => `<option value="task:${t.id}">${t.title} (${t.status})</option>`).join("")}</optgroup>` : "") +
        (sales.length ? `<optgroup label="Sales Items">${sales.map(s => `<option value="sales_item:${s.id}">${s.title} (${s.status})</option>`).join("")}</optgroup>` : "") +
        (equipment.length ? `<optgroup label="Equipment">${equipment.map(e => `<option value="equipment:${e.id}">${e.name}</option>`).join("")}</optgroup>` : "") +
        (events?.length ? `<optgroup label="Events">${events.map(ev => `<option value="event:${ev.id}">${ev.title} (${ev.status})</option>`).join("")}</optgroup>` : "");
      contextListingGroup.style.display = "block";
    } else {
      contextListingGroup.style.display = "none";
    }
  } catch (err) {
    contextListingGroup.style.display = "none";
  }
}

document.getElementById("submitEndorsementBtn")?.addEventListener("click", async () => {
  if (!selectedStudent) {
    showToast("Please select a student first.", "error");
    return;
  }

  const btn = document.getElementById("submitEndorsementBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Submitting…`;

  const contextValue = contextListingSelect.value;
  let contextType = null, contextId = null;
  if (contextValue) {
    const [type, id] = contextValue.split(":");
    contextType = type; contextId = Number(id);
  }

  try {
    await apiRequest("/lecturer/endorsements", "POST", {
      endorsedUserId: Number(selectedStudent.id),
      endorsementType: endorsementTypeSelect.value,
      contextType, contextId,
      message: endorsementMessage.value.trim()
    });
    showToast(`Endorsement given to ${selectedStudent.name}.`);
    closeGiveEndorsementModal();
    await Promise.all([loadEndorsementsGiven(), loadProfile()]);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

const editProfileModal   = document.getElementById("editProfileModal");
const editSkillsTagsRow  = document.getElementById("editSkillsTagsRow");
const editServicesTagsRow = document.getElementById("editServicesTagsRow");
const editSkillInput     = document.getElementById("editSkillInput");
const editServiceInput   = document.getElementById("editServiceInput");

function renderEditSkillsTags() {
  editSkillsTagsRow.innerHTML = editSkills.length
    ? editSkills.map((s, i) => `
        <div class="profile-tag editable">
          ${s}
          <button type="button" data-index="${i}" aria-label="Remove ${s}"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>`).join("")
    : `<p style="color:var(--muted);font-size:12px;">No expertise tags added yet.</p>`;

  editSkillsTagsRow.querySelectorAll("button[data-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      editSkills.splice(Number(btn.dataset.index), 1);
      renderEditSkillsTags();
    });
  });
}

function renderEditServicesTags() {
  editServicesTagsRow.innerHTML = editServices.length
    ? editServices.map((s, i) => `
        <div class="profile-tag editable" style="background:rgba(0,155,114,0.10);color:var(--ump-green);">
          ${s}
          <button type="button" data-index="${i}" aria-label="Remove ${s}"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>`).join("")
    : `<p style="color:var(--muted);font-size:12px;">No services listed yet.</p>`;

  editServicesTagsRow.querySelectorAll("button[data-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      editServices.splice(Number(btn.dataset.index), 1);
      renderEditServicesTags();
    });
  });
}

document.getElementById("addSkillBtn")?.addEventListener("click", () => {
  const val = editSkillInput.value.trim();
  if (!val) return;
  if (editSkills.length >= 12) { showToast("You can add up to 12 expertise tags.", "error"); return; }
  if (editSkills.some(s => s.toLowerCase() === val.toLowerCase())) { editSkillInput.value = ""; return; }
  editSkills.push(val);
  editSkillInput.value = "";
  renderEditSkillsTags();
});

document.getElementById("addServiceBtn")?.addEventListener("click", () => {
  const val = editServiceInput.value.trim();
  if (!val) return;
  if (editServices.length >= 12) { showToast("You can add up to 12 services.", "error"); return; }
  if (editServices.some(s => s.toLowerCase() === val.toLowerCase())) { editServiceInput.value = ""; return; }
  editServices.push(val);
  editServiceInput.value = "";
  renderEditServicesTags();
});

editSkillInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("addSkillBtn").click(); } });
editServiceInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("addServiceBtn").click(); } });

/* Keeps the small avatar preview at the top of the Edit Profile modal in
   sync with whatever's currently loaded — called when the modal opens and
   again right after a new photo finishes uploading (the modal's own DOM
   isn't part of profileMainCard, so loadProfile() re-rendering the header
   doesn't touch it automatically). */
function refreshEditPhotoPreview() {
  const preview = document.getElementById("editPhotoPreview");
  if (preview && latestProfile) {
    preview.innerHTML = avatarHtml(latestProfile.full_name, latestProfile.profilePhoto, { lightbox: false });
  }
}

function openEditProfileModal() {
  if (!latestProfile) return;

  refreshEditPhotoPreview();
  document.getElementById("editBio").value = latestProfile.bio || "";
  document.getElementById("editLecturerTitle").value = latestProfile.lecturer_title || "";
  document.getElementById("editYearsExperience").value = latestProfile.years_experience ?? "";
  document.getElementById("editPhoneNumber").value = latestProfile.phone_number || "";
  document.getElementById("editFaculty").value = latestProfile.faculty || "";
  document.getElementById("editOfficeLocation").value = latestProfile.office_location || "";
  document.getElementById("editConsultationMode").value = latestProfile.consultation_mode || "";
  document.getElementById("editAvailabilityNote").value = latestProfile.availability_note || "";
  editSkills = [...(latestProfile.skills || [])];
  editServices = [...(latestProfile.services || [])];
  renderEditSkillsTags();
  renderEditServicesTags();

  editProfileModal.style.display = "block";
  document.getElementById("overlay").style.display = "block";
}

function closeEditProfileModal() {
  editProfileModal.style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

document.getElementById("quickEditProfileBtn")?.addEventListener("click", openEditProfileModal);
document.getElementById("closeEditProfileModal")?.addEventListener("click", closeEditProfileModal);

document.getElementById("overlay")?.addEventListener("click", () => {
  closeGiveEndorsementModal();
  closeEditProfileModal();
});

document.getElementById("saveEditProfileBtn")?.addEventListener("click", async () => {
  const phoneNumber = document.getElementById("editPhoneNumber").value.trim();
  if (phoneNumber && !/^(\+27|27|0)[0-9]{9}$/.test(phoneNumber)) {
    showToast("Please enter a valid South African phone number.", "error");
    return;
  }

  const btn = document.getElementById("saveEditProfileBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Saving…`;

  const yearsValue = document.getElementById("editYearsExperience").value.trim();

  try {
    await apiRequest("/users/me", "PATCH", {
      bio: document.getElementById("editBio").value.trim(),
      phoneNumber: phoneNumber || undefined,
      faculty: document.getElementById("editFaculty").value,
      lecturerTitle: document.getElementById("editLecturerTitle").value || undefined,
      yearsExperience: yearsValue ? Number(yearsValue) : null,
      officeLocation: document.getElementById("editOfficeLocation").value.trim(),
      consultationMode: document.getElementById("editConsultationMode").value.trim(),
      skills: editSkills,
      services: editServices,
      availabilityNote: document.getElementById("editAvailabilityNote").value.trim()
    });
    showToast("Profile updated.");
    closeEditProfileModal();
    await loadProfile();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

/* Opens the cropper before uploading, restoring the pre-overhaul flow. */
profilePhotoInput?.addEventListener("change", () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) { profilePhotoInput.value = ""; return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("Choose a JPEG, PNG or WebP image smaller than 5 MB.", "error");
    profilePhotoInput.value = "";
    return;
  }

  openImageCropper(file, async (croppedFile) => {
    const editBtn = document.getElementById("changeProfilePhoto");
    const originalHtml = editBtn ? editBtn.innerHTML : null;
    if (editBtn) { editBtn.disabled = true; editBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`; }
    showToast("Uploading photo…", "warning");

    const formData = new FormData();
    formData.append("profilePhoto", croppedFile);
    try {
      const response = await apiMultipartRequest("/users/me/profile-photo", "PATCH", formData);
      const user = { ...currentUser, ...response.data };
      localStorage.setItem("taskifyUser", JSON.stringify(user));
      showToast("Profile photo updated.");
      await loadProfile();
      populateAvatar();
      refreshEditPhotoPreview();
    } catch (error) {
      showToast(error.message, "error");
      if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = originalHtml; }
    } finally {
      profilePhotoInput.value = "";
    }
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#changeProfilePhoto")) profilePhotoInput?.click();
});

loadProfile();
loadEndorsementsGiven();

/* ══════════════════════ Security: two-factor authentication ══════════════════════
   Ported from profile.js — same markup (twoFactorModal/changePasswordModal),
   same IDs, same backend endpoints. Lecturers previously had no Security
   card at all on this page. */

const twoFactorModal      = document.getElementById("twoFactorModal");
const twoFactorModalBody  = document.getElementById("twoFactorModalBody");
const twoFactorStatusBadge = document.getElementById("twoFactorStatusBadge");

function openSecurityModal(modal) {
  modal.style.display = "block";
  document.getElementById("overlay").style.display = "block";
}

function closeSecurityModal(modal) {
  modal.style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

function closeTwoFactorModal() { closeSecurityModal(twoFactorModal); }
function closeChangePasswordModal() { closeSecurityModal(document.getElementById("changePasswordModal")); }

document.getElementById("closeTwoFactorModal")?.addEventListener("click", closeTwoFactorModal);
document.getElementById("overlay")?.addEventListener("click", closeTwoFactorModal);
document.getElementById("overlay")?.addEventListener("click", closeChangePasswordModal);

/* Keeps the cached taskifyUser (and the in-memory currentUser) in sync
   with the server's real 2FA state every time this is called — which
   already happens right after enable/disable and on every page load.
   Without this, admin.js's Stage 4 redirect guard would keep acting on a
   stale "not enabled" reading from localStorage until the next full
   login, even right after an admin finishes setting 2FA up here. */
function syncStoredTotpEnabled(enabled) {
  if (!currentUser) return;
  currentUser.totp_enabled = enabled;
  try {
    const stored = JSON.parse(localStorage.getItem("taskifyUser") || "{}");
    stored.totp_enabled = enabled;
    localStorage.setItem("taskifyUser", JSON.stringify(stored));
  } catch {
    /* Non-fatal — worst case the admin redirect guard re-checks on next login. */
  }
}

async function refreshTwoFactorStatus() {
  try {
    const res = await apiRequest("/auth/2fa/status");
    const { enabled, method, backupCodesRemaining } = res.data;
    const methodLabel = method === "email" ? "Enabled · Email" : "Enabled · App";
    twoFactorStatusBadge.innerHTML = enabled ? badge(methodLabel, "") : badge("Disabled", "gold");
    document.getElementById("manageTwoFactorBtn").innerHTML = enabled
      ? `<i class="ti ti-shield-lock" aria-hidden="true"></i> Manage / Disable`
      : `<i class="ti ti-shield-lock" aria-hidden="true"></i> Enable two-factor authentication`;
    syncStoredTotpEnabled(enabled);
    return { enabled, method, backupCodesRemaining };
  } catch (err) {
    twoFactorStatusBadge.textContent = "—";
    return { enabled: false, method: null, backupCodesRemaining: null };
  }
}

/* First screen when 2FA is off: pick a method before anything else
   happens. The authenticator-app path is unchanged from before; the email
   path is new (see requestEmailTwoFactorSetupCode/enableEmailTwoFactor on
   the backend) and reuses the same "prove you can receive the code, then
   you're enrolled, here are your backup codes" shape as the app path. */
function renderTwoFactorMethodChoice() {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
      Add an extra layer of protection to your account. Choose how you'd like to receive your
      sign-in codes.
    </p>
    <button type="button" class="primary-button" id="startTwoFactorSetupBtn" style="width:100%;margin-bottom:10px;">
      <i class="ti ti-qrcode" aria-hidden="true"></i> Authenticator app
    </button>
    <button type="button" class="secondary-button" id="startEmailTwoFactorSetupBtn" style="width:100%;">
      <i class="ti ti-mail" aria-hidden="true"></i> Email
    </button>
    <p style="font-size:11px;color:var(--muted);margin-top:12px;">
      Authenticator app: works offline, needs an app like Google Authenticator, Authy or 1Password.<br>
      Email: no app needed — codes are sent to your account email at sign-in.
    </p>`;

  document.getElementById("startTwoFactorSetupBtn").addEventListener("click", startTwoFactorSetup);
  document.getElementById("startEmailTwoFactorSetupBtn").addEventListener("click", startEmailTwoFactorSetup);
}

async function startTwoFactorSetup() {
  twoFactorModalBody.innerHTML = `<p style="font-size:13px;color:var(--muted);"><i class="ti ti-loader" aria-hidden="true"></i> Generating your setup code…</p>`;
  try {
    const res = await apiRequest("/auth/2fa/setup", "POST");
    renderTwoFactorSetupStep(res.data.qrCodeDataUrl, res.data.manualEntryKey);
  } catch (err) {
    twoFactorModalBody.innerHTML = errorState(err.message);
  }
}

function renderTwoFactorSetupStep(qrCodeDataUrl, manualEntryKey) {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">1. Scan this QR code with your authenticator app.</p>
    <div class="qr-code-box"><img src="${qrCodeDataUrl}" alt="Two-factor QR code" /></div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:6px;">Can't scan it? Enter this key manually:</p>
    <div class="manual-key-box">${manualEntryKey}</div>
    <p style="font-size:13px;color:var(--muted);margin:14px 0 6px;">2. Enter the 6-digit code your app shows:</p>
    <div class="form-group">
      <input type="text" id="twoFactorEnableCode" inputmode="numeric" maxlength="6" placeholder="123456" />
    </div>
    <p id="twoFactorSetupMessage" style="font-size:12px;font-weight:600;color:var(--ump-red);"></p>
    <button type="button" class="primary-button" id="confirmTwoFactorEnableBtn" style="width:100%;">
      <i class="ti ti-check" aria-hidden="true"></i> Confirm &amp; enable
    </button>`;

  document.getElementById("confirmTwoFactorEnableBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const code = document.getElementById("twoFactorEnableCode").value.trim();
    const msgEl = document.getElementById("twoFactorSetupMessage");

    if (!/^\d{6}$/.test(code)) {
      msgEl.textContent = "Enter the 6-digit code from your app.";
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Verifying…`;

    try {
      const res = await apiRequest("/auth/2fa/enable", "POST", { code });
      renderTwoFactorBackupCodes(res.data.backupCodes);
      await refreshTwoFactorStatus();
    } catch (err) {
      msgEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}

async function startEmailTwoFactorSetup() {
  twoFactorModalBody.innerHTML = `<p style="font-size:13px;color:var(--muted);"><i class="ti ti-loader" aria-hidden="true"></i> Sending a code to your email…</p>`;
  try {
    const res = await apiRequest("/auth/2fa/setup-email", "POST");
    renderEmailTwoFactorSetupStep(res.message);
  } catch (err) {
    twoFactorModalBody.innerHTML = errorState(err.message);
  }
}

function renderEmailTwoFactorSetupStep(sentMessage) {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
      ${sentMessage || "We've sent a 6-digit code to your email."}
    </p>
    <div class="form-group">
      <label>6-digit code</label>
      <input type="text" id="twoFactorEnableEmailCode" inputmode="numeric" maxlength="6" placeholder="123456" />
    </div>
    <p id="twoFactorEmailSetupMessage" style="font-size:12px;font-weight:600;color:var(--ump-red);"></p>
    <button type="button" class="primary-button" id="confirmTwoFactorEnableEmailBtn" style="width:100%;margin-bottom:8px;">
      <i class="ti ti-check" aria-hidden="true"></i> Confirm &amp; enable
    </button>
    <button type="button" class="secondary-button" id="resendTwoFactorEmailCodeBtn" style="width:100%;">
      <i class="ti ti-refresh" aria-hidden="true"></i> Resend code
    </button>`;

  document.getElementById("confirmTwoFactorEnableEmailBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const code = document.getElementById("twoFactorEnableEmailCode").value.trim();
    const msgEl = document.getElementById("twoFactorEmailSetupMessage");

    if (!/^\d{6}$/.test(code)) {
      msgEl.textContent = "Enter the 6-digit code from your email.";
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Verifying…`;

    try {
      const res = await apiRequest("/auth/2fa/enable-email", "POST", { code });
      renderTwoFactorBackupCodes(res.data.backupCodes);
      await refreshTwoFactorStatus();
    } catch (err) {
      msgEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  document.getElementById("resendTwoFactorEmailCodeBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const msgEl = document.getElementById("twoFactorEmailSetupMessage");
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Sending…`;

    try {
      const res = await apiRequest("/auth/2fa/setup-email", "POST");
      msgEl.style.color = "var(--ump-green)";
      msgEl.textContent = res.message || "A new code is on its way.";
    } catch (err) {
      msgEl.style.color = "var(--ump-red)";
      msgEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}

function renderTwoFactorBackupCodes(codes, opts = {}) {
  const heading = opts.heading || `<i class="ti ti-circle-check" aria-hidden="true"></i> Two-factor authentication is enabled.`;
  const subtext = opts.subtext || `Save these one-time backup codes somewhere safe. Each works once if you lose access to your authenticator app — they will not be shown again.`;

  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;font-weight:700;color:var(--ump-green);margin-bottom:8px;">
      ${heading}
    </p>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">
      ${subtext}
    </p>
    <div class="backup-codes-grid">
      ${codes.map(c => `<div class="backup-code-chip">${c}</div>`).join("")}
    </div>
    <button type="button" class="secondary-button" id="copyBackupCodesBtn" style="width:100%;margin-top:12px;">
      <i class="ti ti-copy" aria-hidden="true"></i> Copy codes
    </button>`;

  document.getElementById("copyBackupCodesBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      showToast("Backup codes copied.");
    } catch {
      showToast("Couldn't copy automatically — please copy them manually.", "warning");
    }
  });
}

function formatDeviceDate(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* Trusted-devices list inside the 2FA "Manage" screen — never shown to
   admin accounts (2FA stays mandatory for them regardless of device
   history, so there's nothing here to manage). Loads on its own once the
   Manage screen renders, independent of the disable/regenerate flows
   above it. */
async function renderTrustedDevicesSection() {
  const container = document.getElementById("trustedDevicesSection");
  if (!container) return;

  try {
    const res = await apiRequest("/auth/2fa/trusted-devices");
    const devices = res.data || [];

    if (devices.length === 0) {
      container.innerHTML = `<p style="font-size:12px;color:var(--muted);">No remembered devices right now.</p>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
        ${devices.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border, #e5e7eb);border-radius:8px;">
            <div>
              <div style="font-size:12.5px;font-weight:600;">${d.device_label || "Unknown device"}</div>
              <div style="font-size:11px;color:var(--muted);">Last used ${formatDeviceDate(d.last_used_at)} · Expires ${formatDeviceDate(d.expires_at)}</div>
            </div>
            <button type="button" class="secondary-button" data-device-id="${d.id}" style="padding:4px 10px;font-size:11px;flex-shrink:0;">Forget</button>
          </div>`).join("")}
      </div>
      ${devices.length > 1 ? `<button type="button" class="secondary-button" id="forgetAllDevicesBtn" style="width:100%;font-size:12px;">Forget all devices</button>` : ""}`;

    container.querySelectorAll("button[data-device-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
        try {
          await apiRequest(`/auth/2fa/trusted-devices/${btn.dataset.deviceId}`, "DELETE");
          await renderTrustedDevicesSection();
        } catch (err) {
          showToast(err.message || "Couldn't forget that device.", "warning");
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });

    document.getElementById("forgetAllDevicesBtn")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Forgetting…`;
      try {
        await apiRequest("/auth/2fa/trusted-devices/revoke-all", "POST");
        await renderTrustedDevicesSection();
      } catch (err) {
        showToast(err.message || "Couldn't forget devices.", "warning");
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  } catch (err) {
    container.innerHTML = `<p style="font-size:12px;color:var(--ump-red);">Couldn't load remembered devices.</p>`;
  }
}

function renderTwoFactorManage(method, backupCodesRemaining = null) {
  /* An email-method account has no authenticator app to pull a code from —
     a backup code still works (generated for both methods), but they also
     need a way to get a fresh email code without leaving this screen. */
  const codeHint = method === "email"
    ? `6-digit code (emailed) or backup code`
    : `6-digit code or backup code`;

  /* The password + code fields below are shared by both actions this
     screen offers (disable, regenerate) — no need to ask twice for the
     same proof of identity. */
  const lowOnCodes = typeof backupCodesRemaining === "number" && backupCodesRemaining <= 2;
  const lowCodesWarning = lowOnCodes
    ? `<p style="font-size:12px;font-weight:600;color:var(--ump-gold, #b8860b);margin-bottom:12px;">
         <i class="ti ti-alert-triangle" aria-hidden="true"></i>
         ${backupCodesRemaining === 0
           ? "You have no backup codes left."
           : `Only ${backupCodesRemaining} backup code${backupCodesRemaining === 1 ? "" : "s"} left.`}
         Regenerate below to get a fresh set.
       </p>`
    : "";

  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
      Two-factor authentication is currently enabled${method === "email" ? " via email" : " via authenticator app"}.
      Confirm your password and a current code to manage it.
    </p>
    ${lowCodesWarning}
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="twoFactorDisablePassword" autocomplete="current-password" />
    </div>
    <div class="form-group">
      <label>${codeHint}</label>
      <input type="text" id="twoFactorDisableCode" placeholder="123456 or XXXXX-XXXXX" />
    </div>
    ${method === "email" ? `<p style="margin-bottom:10px;"><a href="#" id="resendTwoFactorDisableEmailCode" style="font-size:12px;">Email me a code</a></p>` : ""}
    <p id="twoFactorDisableMessage" style="font-size:12px;font-weight:600;color:var(--ump-red);"></p>
    <button type="button" class="secondary-button" id="regenerateBackupCodesBtn" style="width:100%;margin-bottom:8px;">
      <i class="ti ti-refresh" aria-hidden="true"></i> Regenerate backup codes
    </button>
    <button type="button" class="secondary-button" id="confirmTwoFactorDisableBtn" style="width:100%;">
      <i class="ti ti-shield-x" aria-hidden="true"></i> Disable two-factor authentication
    </button>
    ${currentUser?.role !== "admin" ? `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border, #e5e7eb);">
        <p style="font-size:12px;font-weight:700;margin-bottom:8px;">Remembered devices</p>
        <p style="font-size:11px;color:var(--muted);margin-bottom:10px;">
          Devices you chose to remember skip the two-factor prompt for 30 days.
        </p>
        <div id="trustedDevicesSection"><p style="font-size:12px;color:var(--muted);"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p></div>
      </div>
    ` : ""}`;

  if (currentUser?.role !== "admin") renderTrustedDevicesSection();

  document.getElementById("resendTwoFactorDisableEmailCode")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const link = event.currentTarget;
    const msgEl = document.getElementById("twoFactorDisableMessage");
    const originalText = link.textContent;
    link.textContent = "Sending…";

    try {
      const res = await apiRequest("/auth/2fa/setup-email", "POST");
      msgEl.style.color = "var(--ump-green)";
      msgEl.textContent = res.message || "A code is on its way.";
    } catch (err) {
      msgEl.style.color = "var(--ump-red)";
      msgEl.textContent = err.message;
    } finally {
      link.textContent = originalText;
    }
  });

  document.getElementById("regenerateBackupCodesBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const password = document.getElementById("twoFactorDisablePassword").value;
    const code = document.getElementById("twoFactorDisableCode").value.trim();
    const msgEl = document.getElementById("twoFactorDisableMessage");

    if (!password || !code) {
      msgEl.textContent = "Both fields are required.";
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Regenerating…`;

    try {
      const res = await apiRequest("/auth/2fa/backup-codes/regenerate", "POST", { password, code });
      renderTwoFactorBackupCodes(res.data.backupCodes, {
        heading: `<i class="ti ti-refresh" aria-hidden="true"></i> Backup codes regenerated.`,
        subtext: "Save these new codes somewhere safe — your old backup codes no longer work."
      });
    } catch (err) {
      msgEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  document.getElementById("confirmTwoFactorDisableBtn").addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const password = document.getElementById("twoFactorDisablePassword").value;
    const code = document.getElementById("twoFactorDisableCode").value.trim();
    const msgEl = document.getElementById("twoFactorDisableMessage");

    if (!password || !code) {
      msgEl.textContent = "Both fields are required.";
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Disabling…`;

    try {
      await apiRequest("/auth/2fa/disable", "POST", { password, code });
      showToast("Two-factor authentication disabled.");
      await refreshTwoFactorStatus();
      closeTwoFactorModal();
    } catch (err) {
      msgEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}

document.getElementById("manageTwoFactorBtn")?.addEventListener("click", async () => {
  openSecurityModal(twoFactorModal);
  twoFactorModalBody.innerHTML = `<p style="font-size:13px;color:var(--muted);"><i class="ti ti-loader" aria-hidden="true"></i> Loading…</p>`;
  const { enabled, method, backupCodesRemaining } = await refreshTwoFactorStatus();
  if (enabled) renderTwoFactorManage(method, backupCodesRemaining);
  else renderTwoFactorMethodChoice();
});

/* ══════════════════════ Security: change password ══════════════════════ */

const changePasswordModal = document.getElementById("changePasswordModal");

document.getElementById("openChangePasswordBtn")?.addEventListener("click", () => {
  document.getElementById("currentPasswordInput").value = "";
  document.getElementById("newPasswordInput").value = "";
  document.getElementById("confirmNewPasswordInput").value = "";
  document.getElementById("changePasswordMessage").textContent = "";
  openSecurityModal(changePasswordModal);
});

document.getElementById("closeChangePasswordModal")?.addEventListener("click", closeChangePasswordModal);

document.getElementById("submitChangePasswordBtn")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  const currentPassword = document.getElementById("currentPasswordInput").value;
  const newPassword     = document.getElementById("newPasswordInput").value;
  const confirmPassword = document.getElementById("confirmNewPasswordInput").value;
  const msgEl = document.getElementById("changePasswordMessage");
  msgEl.style.color = "var(--ump-red)";

  if (!currentPassword || !newPassword) {
    msgEl.textContent = "Both fields are required.";
    return;
  }
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    msgEl.textContent = "New password must be at least 8 characters and include a letter and a number.";
    return;
  }
  if (newPassword !== confirmPassword) {
    msgEl.textContent = "New passwords do not match.";
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Changing…`;

  try {
    const res = await apiRequest("/users/me/password", "PATCH", { currentPassword, newPassword });
    msgEl.style.color = "var(--ump-green)";
    msgEl.textContent = res.message || "Password changed.";
    /* Server bumped token_version, so THIS token is now invalid too —
       send them to log back in rather than leaving a dead session active. */
    setTimeout(() => {
      localStorage.removeItem("taskifyToken");
      localStorage.removeItem("taskifyUser");
      window.location.href = "./login.html";
    }, 1800);
  } catch (err) {
    msgEl.textContent = err.message;
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

/* Stage 4 lockdown — an admin account without 2FA gets walked straight
   into setup the moment they land here, whether that's right after login
   (a lecturer account lands on this page instead of profile.html) or via
   admin.js bouncing them back from the admin panel. The actual
   enforcement is server-side (requireTwoFactor, auth.middleware.js) —
   this is the proactive nudge so they don't have to go hunting for the
   Security card themselves. */
function showAdminTwoFactorBanner() {
  if (document.getElementById("adminTwoFactorBanner")) return;
  const banner = document.createElement("div");
  banner.id = "adminTwoFactorBanner";
  banner.style.cssText = "background:rgba(224,58,62,0.08);border:1px solid rgba(224,58,62,0.3);color:var(--ump-red);padding:12px 16px;border-radius:10px;margin:16px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;";
  banner.innerHTML = `<i class="ti ti-shield-exclamation" aria-hidden="true"></i> Two-factor authentication is required for admin accounts. Set it up below to access the admin panel.`;
  profileMainCard?.insertAdjacentElement("beforebegin", banner);
}

refreshTwoFactorStatus().then(({ enabled }) => {
  if (currentUser?.role === "admin" && !enabled) {
    showAdminTwoFactorBanner();
    openSecurityModal(twoFactorModal);
    renderTwoFactorMethodChoice();
  }
});