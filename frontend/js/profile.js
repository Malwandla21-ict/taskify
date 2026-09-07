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
        <div class="profile-cover-photo" style="background-image:url('./assets/images/UMP_GAPP_09_Tristan_McLaren_-_Student_Residence_Courtyard.jpg');"></div>
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
        <div class="profile-stats-inline">
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-clipboard-check" aria-hidden="true"></i></div><div class="pstat-value">${profile.stats.tasks_posted}</div><div class="pstat-label">Tasks Posted</div></div>
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-star" aria-hidden="true"></i></div><div class="pstat-value">${Number(profile.rating_average || 0).toFixed(1)}</div><div class="pstat-label">Avg Rating</div></div>
          <div class="pstat-card"><div class="pstat-icon"><i class="ti ti-cash" aria-hidden="true"></i></div><div class="pstat-value">R${profile.stats.total_earned.toFixed(0)}</div><div class="pstat-label">Total Earned</div></div>
        </div>
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
    const [salesRes, equipmentRes] = await Promise.all([
      apiRequest("/sales/my-listings"),
      apiRequest("/equipment/my-listings")
    ]);
    const mySales     = salesRes.data;
    const myEquipment  = equipmentRes.data;
    listingsLoaded = true;

    const cards = [
      ...mySales.map(item => `
        <div class="market-card">
          <div class="market-content">
            <div class="market-top">${sectionBadge(item.section)}${statusBadge(item.status)}</div>
            <h3>${item.title}</h3>
            <div class="market-footer">
              <div class="market-price">R${item.price}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <a href="./sale-details.html?id=${item.id}" class="market-action-btn outline">View</a>
                ${item.status === "Available" ? `
                  <button class="market-action-btn outline my-mark-sold-btn" data-item-id="${item.id}">
                    <i class="ti ti-circle-check" aria-hidden="true"></i> Mark Sold
                  </button>` : ""}
                <button class="market-action-btn outline my-delete-sale-btn" data-item-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                  <i class="ti ti-trash" aria-hidden="true"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </div>`),
      ...myEquipment.map(item => `
        <div class="market-card">
          <div class="market-content">
            <div class="market-top">${sectionBadge(item.section)}<div class="badge ${item.is_available ? "green" : "gold"}">${item.is_available ? "Available" : "Booked"}</div></div>
            <h3>${item.name}</h3>
            <div class="market-footer">
              <div class="market-price">R${item.daily_price}/day</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <a href="./equipment-details.html?id=${item.id}" class="market-action-btn outline">View</a>
                ${item.is_available ? `
                  <button class="market-action-btn outline my-delete-equipment-btn" data-equipment-id="${item.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
                    <i class="ti ti-trash" aria-hidden="true"></i> Delete
                  </button>` : ""}
              </div>
            </div>
          </div>
        </div>`)
    ];

    container.innerHTML = cards.length ? cards.join("") : emptyState("ti-tag", "No listings yet", "Items and equipment you list appear here.");
    attachMyListingsEvents();
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

function attachMyListingsEvents() {
  document.querySelectorAll(".my-mark-sold-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Updating…`;
      try {
        await apiRequest(`/sales/${btn.dataset.itemId}/sold`, "PATCH");
        showToast("Item marked as sold!");
        loadMyListings();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Mark Sold`;
      }
    });
  });

  document.querySelectorAll(".my-delete-sale-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this listing?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Deleting…`;
      try {
        await apiRequest(`/sales/${btn.dataset.itemId}`, "DELETE");
        showToast("Listing deleted.");
        loadMyListings();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });

  document.querySelectorAll(".my-delete-equipment-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this equipment listing?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Deleting…`;
      try {
        await apiRequest(`/equipment/${btn.dataset.equipmentId}`, "DELETE");
        showToast("Equipment listing deleted.");
        loadMyListings();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-trash" aria-hidden="true"></i> Delete`;
      }
    });
  });
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
   (every login lands on this page) or via admin.js bouncing them back
   from the admin panel. The actual enforcement is server-side
   (requireTwoFactor, auth.middleware.js) — this is the proactive nudge so
   they don't have to go hunting for the Security card themselves. */
function showAdminTwoFactorBanner() {
  if (document.getElementById("adminTwoFactorBanner")) return;
  const banner = document.createElement("div");
  banner.id = "adminTwoFactorBanner";
  banner.style.cssText = "background:rgba(224,58,62,0.08);border:1px solid rgba(224,58,62,0.3);color:var(--ump-red);padding:12px 16px;border-radius:10px;margin:16px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;";
  banner.innerHTML = `<i class="ti ti-shield-exclamation" aria-hidden="true"></i> Two-factor authentication is required for admin accounts. Set it up below to access the admin panel.`;
  profileMainCard?.insertAdjacentElement("beforebegin", banner);
}

loadProfile();
refreshTwoFactorStatus().then(({ enabled }) => {
  if (currentUser?.role === "admin" && !enabled) {
    showAdminTwoFactorBanner();
    openSecurityModal(twoFactorModal);
    renderTwoFactorMethodChoice();
  }
});