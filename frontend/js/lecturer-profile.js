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
        <button type="button" class="edit-profile-header-btn" id="openEditProfileBtn">
          <i class="ti ti-pencil" aria-hidden="true"></i> Edit Profile
        </button>
        <div class="profile-avatar-large-wrap">
          <div class="profile-avatar-large" style="overflow:hidden;">
            ${avatarHtml(profile.full_name, profile.profilePhoto)}
          </div>
          <button type="button" id="changeProfilePhoto" class="profile-photo-edit-btn"
                  aria-label="Change profile photo" title="Change profile photo">
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
        </div>
        <div class="profile-header-info">
          <h2>${posterName(profile.full_name, profile.lecturer_title)} <span class="lecturer-title-badge"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Verified Lecturer</span></h2>
          <p><i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}${profile.office_location ? ` &nbsp;·&nbsp; <i class="ti ti-map-pin" aria-hidden="true"></i> ${profile.office_location}` : ""}</p>
          <p style="margin-top:2px;"><i class="ti ti-building" aria-hidden="true"></i> ${profile.faculty || "Faculty not set"}${profile.years_experience ? ` &nbsp;·&nbsp; ${profile.years_experience}+ years experience` : ""}</p>
        </div>
      </div>
      <div class="profile-stats-inline" style="margin-top:14px;">
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-certificate" aria-hidden="true"></i></div><div class="pstat-value">${profile.lecturer_stats?.endorsementsGiven ?? 0}</div><div class="pstat-label">Endorsements Given</div></div>
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-users" aria-hidden="true"></i></div><div class="pstat-value">${profile.lecturer_stats?.studentsEndorsed ?? 0}</div><div class="pstat-label">Students Endorsed</div></div>
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-star" aria-hidden="true"></i></div><div class="pstat-value">${Number(profile.rating_average || 0).toFixed(1)}</div><div class="pstat-label">Avg Rating</div></div>
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-message-star" aria-hidden="true"></i></div><div class="pstat-value">${profile.total_reviews}</div><div class="pstat-label">Reviews</div></div>
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

function openEditProfileModal() {
  if (!latestProfile) return;

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