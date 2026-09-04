const currentUser = requireAuth();

if (currentUser?.member_type === "Lecturer") {
  window.location.href = "./lecturer-profile.html";
}

const profileMainCard        = document.getElementById("profileMainCard");
const recentReviewsContainer = document.getElementById("recentReviewsContainer");
const profilePhotoInput      = document.getElementById("profilePhotoInput");

let latestProfile = null;
let editSkills = [];

document.querySelectorAll(".profile-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".profile-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".profile-tab-panel").forEach(p => p.classList.remove("active"));
    document.getElementById(`${tab.dataset.tab}Tab`).classList.add("active");

    if (tab.dataset.tab === "listings" && !listingsLoaded) loadMyListings();
  });
});

function activityIcon(type) {
  const map = {
    task_posted: "ti-clipboard-plus", task_completed: "ti-circle-check",
    review_received: "ti-star", equipment_booked: "ti-package",
    item_listed: "ti-tag", endorsement_given: "ti-certificate"
  };
  return map[type] || "ti-activity";
}

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
    const res     = await apiRequest(`/users/${currentUser.id}/profile`);
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
          <h2>${profile.full_name}${profile.is_verified ? ` <i class="ti ti-rosette-discount-check" style="color:var(--ump-green);font-size:18px;" aria-hidden="true"></i>` : ""}</h2>
          <p><i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}</p>
          <p style="margin-top:2px;"><i class="ti ti-calendar" aria-hidden="true"></i> Joined ${new Date(profile.created_at).toLocaleDateString()} · Member for ${profile.member_since_label}</p>
          <div class="profile-header-badges">
            <span class="profile-badge verified"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</span>
            <span class="profile-badge"><i class="ti ti-user" aria-hidden="true"></i> ${profile.member_type || "Student"}</span>
            <span class="profile-badge"><i class="ti ti-star" aria-hidden="true"></i> ${Number(profile.rating_average || 0).toFixed(1)} Rating</span>
          </div>
        </div>
      </div>
      <div class="profile-stats-inline" style="margin-top:14px;">
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-clipboard-check" aria-hidden="true"></i></div><div class="pstat-value">${profile.stats.tasks_posted}</div><div class="pstat-label">Tasks Posted</div></div>
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-star" aria-hidden="true"></i></div><div class="pstat-value">${Number(profile.rating_average || 0).toFixed(1)}</div><div class="pstat-label">Avg Rating</div></div>
        <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-cash" aria-hidden="true"></i></div><div class="pstat-value">R${profile.stats.total_earned.toFixed(0)}</div><div class="pstat-label">Total Earned</div></div>
      </div>
    `;

    document.getElementById("openEditProfileBtn")?.addEventListener("click", openEditProfileModal);

    document.getElementById("aboutMeText").textContent = profile.bio || "No bio added yet. Click Edit Profile to introduce yourself.";
    document.getElementById("skillsTagsRow").innerHTML = profile.skills.length
      ? profile.skills.map(s => `<div class="profile-tag">${s}</div>`).join("")
      : `<p style="color:var(--muted);font-size:12px;">No skills added yet.</p>`;

    document.getElementById("emailVerifiedBadge").innerHTML = profile.is_verified ? badge("Verified", "") : badge("Pending", "gold");
    document.getElementById("accountTypeBadge").innerHTML = badge(profile.member_type, "blue");
    const resendBtn = document.getElementById("resendVerificationBtn");
    if (resendBtn) resendBtn.style.display = profile.is_verified ? "none" : "block";

    document.getElementById("availabilityText").textContent = profile.availability_note || "No availability set yet.";

    document.getElementById("statsGrid").innerHTML = `
      <div class="profile-stat-item"><div class="icon" style="background:rgba(0,114,206,0.10);color:var(--ump-blue);"><i class="ti ti-clipboard-list" aria-hidden="true"></i></div><div><div class="value">${profile.stats.tasks_posted}</div><div class="label">Tasks Posted</div></div></div>
      <div class="profile-stat-item"><div class="icon" style="background:rgba(0,155,114,0.10);color:var(--ump-green);"><i class="ti ti-circle-check" aria-hidden="true"></i></div><div><div class="value">${profile.completed_tasks}</div><div class="label">Tasks Completed</div></div></div>
      <div class="profile-stat-item"><div class="icon" style="background:rgba(245,180,0,0.14);color:#b38900;"><i class="ti ti-clock" aria-hidden="true"></i></div><div><div class="value">${profile.stats.tasks_in_progress}</div><div class="label">In Progress</div></div></div>
      <div class="profile-stat-item"><div class="icon" style="background:rgba(224,58,62,0.10);color:var(--ump-red);"><i class="ti ti-x" aria-hidden="true"></i></div><div><div class="value">${profile.stats.tasks_cancelled}</div><div class="label">Cancelled</div></div></div>
      <div class="profile-stat-item"><div class="icon" style="background:rgba(0,155,114,0.10);color:var(--ump-green);"><i class="ti ti-thumb-up" aria-hidden="true"></i></div><div><div class="value">${profile.stats.positive_reviews}</div><div class="label">Positive Reviews</div></div></div>
      <div class="profile-stat-item"><div class="icon" style="background:rgba(12,29,74,0.08);color:var(--ump-navy);"><i class="ti ti-users" aria-hidden="true"></i></div><div><div class="value">${profile.stats.total_listings}</div><div class="label">Total Listings</div></div></div>
    `;

    const activityHtml = profile.recent_activity.length
      ? profile.recent_activity.map(activityRow).join("")
      : `<p style="color:var(--muted);font-size:13px;">No activity yet.</p>`;
    document.getElementById("overviewActivityList").innerHTML = activityHtml;
    document.getElementById("fullActivityList").innerHTML = activityHtml;

    renderReviews(profile.recent_reviews || []);
    renderEndorsements(profile.endorsements_received || []);
  } catch (err) {
    profileMainCard.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

function renderReviews(reviews) {
  if (!reviews.length) {
    recentReviewsContainer.innerHTML = emptyState("ti-star", "No reviews yet", "Reviews appear here after completed tasks.");
    return;
  }
  recentReviewsContainer.innerHTML = reviews.map(r => {
    const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
    return `
      <div class="market-card">
        <div class="market-content">
          <div class="market-top">
            <div class="market-user">
              <div class="market-avatar">${avatarHtml(r.reviewer_name, r.reviewer_profile_photo)}</div>
              <div>
                <div class="market-user-name profile-link" data-user-id="${r.reviewer_id}" style="cursor:pointer;">${r.reviewer_name}</div>
                <div class="market-user-meta"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</div>
              </div>
            </div>
            <div class="badge"><i class="ti ti-star" aria-hidden="true"></i> ${r.rating}/5</div>
          </div>
          <p style="color:var(--ump-gold);font-size:16px;margin-bottom:8px;letter-spacing:1px;">${stars}</p>
          <p style="color:var(--muted);font-size:13px;line-height:1.6;">${r.comment || "No comment provided."}</p>
        </div>
      </div>`;
  }).join("");
  attachProfileLinkEvents();
}

function renderEndorsements(endorsements) {
  const container = document.getElementById("myEndorsementsContainer");
  if (!endorsements.length) {
    container.innerHTML = emptyState("ti-certificate", "No endorsements yet", "Lecturers can endorse your tutoring or listings — they'll show up here.");
    return;
  }
  container.innerHTML = endorsements.map(e => `
    <div class="endorsement-card">
      <div class="endorsement-card-top">
        <div class="market-avatar" style="width:38px;height:38px;">${avatarHtml(e.lecturer_name, e.lecturer_photo)}</div>
        <div>
          <div class="profile-link" data-user-id="${e.lecturer_id}" style="cursor:pointer;font-weight:700;font-size:13px;">${posterName(e.lecturer_name, e.lecturer_title)}</div>
          <div style="font-size:11px;color:var(--muted);">${new Date(e.created_at).toLocaleDateString()}</div>
        </div>
        <div class="endorsement-badge ${e.endorsement_type.toLowerCase()}" style="margin-left:auto;">
          <i class="ti ti-certificate" aria-hidden="true"></i> ${e.endorsement_type}
        </div>
      </div>
      ${e.message ? `<p style="font-size:13px;color:var(--text);">"${e.message}"</p>` : ""}
    </div>`).join("");
  attachProfileLinkEvents();
}

let listingsLoaded = false;
async function loadMyListings() {
  const container = document.getElementById("myListingsContainer");
  try {
    const [salesRes, equipmentRes] = await Promise.all([apiRequest("/sales"), apiRequest("/equipment")]);
    const mySales     = salesRes.data.filter(i => Number(i.seller_id) === Number(currentUser.id));
    const myEquipment  = equipmentRes.data.filter(i => Number(i.owner_id) === Number(currentUser.id));
    listingsLoaded = true;

    const cards = [
      ...mySales.map(item => `
        <div class="market-card">
          <div class="market-content">
            <div class="market-top">${sectionBadge(item.section)}${statusBadge(item.status)}</div>
            <h3>${item.title}</h3>
            <div class="market-footer"><div class="market-price">R${item.price}</div>
              <a href="./sale-details.html?id=${item.id}" class="market-action-btn outline">View</a>
            </div>
          </div>
        </div>`),
      ...myEquipment.map(item => `
        <div class="market-card">
          <div class="market-content">
            <div class="market-top">${sectionBadge(item.section)}<div class="badge ${item.is_available ? "green" : "gold"}">${item.is_available ? "Available" : "Booked"}</div></div>
            <h3>${item.name}</h3>
            <div class="market-footer"><div class="market-price">R${item.daily_price}/day</div>
              <a href="./equipment-details.html?id=${item.id}" class="market-action-btn outline">View</a>
            </div>
          </div>
        </div>`)
    ];

    container.innerHTML = cards.length ? cards.join("") : emptyState("ti-tag", "No listings yet", "Items and equipment you list appear here.");
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

const editProfileModal   = document.getElementById("editProfileModal");
const editAcademicYearGroup = document.getElementById("editAcademicYearGroup");
const editSkillsTagsRow  = document.getElementById("editSkillsTagsRow");
const editSkillInput     = document.getElementById("editSkillInput");

function renderEditSkillsTags() {
  editSkillsTagsRow.innerHTML = editSkills.length
    ? editSkills.map((s, i) => `
        <div class="profile-tag editable">
          ${s}
          <button type="button" data-index="${i}" aria-label="Remove ${s}"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>`).join("")
    : `<p style="color:var(--muted);font-size:12px;">No skills added yet.</p>`;

  editSkillsTagsRow.querySelectorAll("button[data-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      editSkills.splice(Number(btn.dataset.index), 1);
      renderEditSkillsTags();
    });
  });
}

document.getElementById("addSkillBtn")?.addEventListener("click", () => {
  const val = editSkillInput.value.trim();
  if (!val) return;
  if (editSkills.length >= 12) { showToast("You can add up to 12 skills.", "error"); return; }
  if (editSkills.some(s => s.toLowerCase() === val.toLowerCase())) { editSkillInput.value = ""; return; }
  editSkills.push(val);
  editSkillInput.value = "";
  renderEditSkillsTags();
});

editSkillInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("addSkillBtn").click(); }
});

function openEditProfileModal() {
  if (!latestProfile) return;

  document.getElementById("editBio").value = latestProfile.bio || "";
  document.getElementById("editPhoneNumber").value = latestProfile.phone_number || "";
  document.getElementById("editFaculty").value = latestProfile.faculty || "";
  document.getElementById("editAcademicYear").value = latestProfile.academic_year || "";
  document.getElementById("editAvailabilityNote").value = latestProfile.availability_note || "";
  editSkills = [...(latestProfile.skills || [])];
  renderEditSkillsTags();

  editAcademicYearGroup.style.display = latestProfile.member_type === "Student" ? "block" : "none";

  editProfileModal.style.display = "block";
  document.getElementById("overlay").style.display = "block";
}

function closeEditProfileModal() {
  editProfileModal.style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

document.getElementById("closeEditProfileModal")?.addEventListener("click", closeEditProfileModal);
document.getElementById("overlay")?.addEventListener("click", closeEditProfileModal);

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

  try {
    await apiRequest("/users/me", "PATCH", {
      bio: document.getElementById("editBio").value.trim(),
      phoneNumber: phoneNumber || undefined,
      faculty: document.getElementById("editFaculty").value,
      academicYear: latestProfile.member_type === "Student" ? document.getElementById("editAcademicYear").value : undefined,
      skills: editSkills,
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

/* Now opens the cropper before uploading, instead of uploading the raw
   selected file — restores the cropping step that existed before the
   profile overhaul. */
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

/* ══════════════════════ Security: resend verification ══════════════════════ */

document.getElementById("resendVerificationBtn")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Sending…`;
  try {
    const res = await apiRequest("/auth/resend-verification", "POST", { email: currentUser.email });
    showToast(res.message || "Verification email sent.");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

/* ══════════════════════ Security: two-factor authentication ══════════════════════ */

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

async function refreshTwoFactorStatus() {
  try {
    const res = await apiRequest("/auth/2fa/status");
    const enabled = res.data.enabled;
    twoFactorStatusBadge.innerHTML = enabled ? badge("Enabled", "") : badge("Disabled", "gold");
    document.getElementById("manageTwoFactorBtn").innerHTML = enabled
      ? `<i class="ti ti-shield-lock" aria-hidden="true"></i> Manage / Disable`
      : `<i class="ti ti-shield-lock" aria-hidden="true"></i> Enable two-factor authentication`;
    return enabled;
  } catch (err) {
    twoFactorStatusBadge.textContent = "—";
    return false;
  }
}

function renderTwoFactorStart() {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
      Add an extra layer of protection to your account. Once enabled, you'll need a code
      from an authenticator app (Google Authenticator, Authy, 1Password, etc.) every time you log in.
    </p>
    <button type="button" class="primary-button" id="startTwoFactorSetupBtn" style="width:100%;">
      <i class="ti ti-qrcode" aria-hidden="true"></i> Start setup
    </button>`;

  document.getElementById("startTwoFactorSetupBtn").addEventListener("click", startTwoFactorSetup);
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

function renderTwoFactorBackupCodes(codes) {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;font-weight:700;color:var(--ump-green);margin-bottom:8px;">
      <i class="ti ti-circle-check" aria-hidden="true"></i> Two-factor authentication is enabled.
    </p>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">
      Save these one-time backup codes somewhere safe. Each works once if you lose access to your authenticator app —
      they will not be shown again.
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

function renderTwoFactorManage() {
  twoFactorModalBody.innerHTML = `
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">
      Two-factor authentication is currently enabled. To disable it, confirm your password and a current code.
    </p>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="twoFactorDisablePassword" autocomplete="current-password" />
    </div>
    <div class="form-group">
      <label>6-digit code or backup code</label>
      <input type="text" id="twoFactorDisableCode" placeholder="123456 or XXXXX-XXXXX" />
    </div>
    <p id="twoFactorDisableMessage" style="font-size:12px;font-weight:600;color:var(--ump-red);"></p>
    <button type="button" class="secondary-button" id="confirmTwoFactorDisableBtn" style="width:100%;">
      <i class="ti ti-shield-x" aria-hidden="true"></i> Disable two-factor authentication
    </button>`;

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
  const enabled = await refreshTwoFactorStatus();
  if (enabled) renderTwoFactorManage();
  else renderTwoFactorStart();
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

loadProfile();
refreshTwoFactorStatus();