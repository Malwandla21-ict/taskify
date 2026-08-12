const currentUser        = requireAuth();
const profileMainCard    = document.getElementById("profileMainCard");
const recentReviewsContainer = document.getElementById("recentReviewsContainer");

const pStatTasks    = document.getElementById("pStatTasks");
const pStatRating   = document.getElementById("pStatRating");
const pStatRentals  = document.getElementById("pStatRentals");
const pStatListings = document.getElementById("pStatListings");
const profilePhotoInput = document.getElementById("profilePhotoInput");

const profileDetailsForm    = document.getElementById("profileDetailsForm");
const pStudentNumber        = document.getElementById("pStudentNumber");
const pMemberType            = document.getElementById("pMemberType");
const pFaculty                 = document.getElementById("pFaculty");
const pAcademicYearGroup        = document.getElementById("pAcademicYearGroup");
const pAcademicYear              = document.getElementById("pAcademicYear");
const pPhoneNumber                = document.getElementById("pPhoneNumber");
const profileDetailsMessage        = document.getElementById("profileDetailsMessage");
const adminToolsSection             = document.getElementById("adminToolsSection");
const adminPendingReportsNote        = document.getElementById("adminPendingReportsNote");

let currentProfile = null;

async function loadProfile() {
  try {
    const res     = await apiRequest(`/users/${currentUser.id}/profile`);
    const profile = res.data;
    currentProfile = profile;

    /* Avatar circle is now view-only (click → lightbox, via the global
       delegation in helpers.js). A separate pencil button, overlapping
       the bottom-right of the circle, triggers the crop-and-upload flow —
       previously these two actions were conflated on the same click
       target. */
    profileMainCard.innerHTML = `
      <div class="profile-header-card">
        <div class="profile-avatar-large-wrap">
          <div class="profile-avatar-large">${avatarHtml(profile.profilePhoto, profile.full_name)}</div>
          <button type="button" class="profile-photo-edit-btn" id="editProfilePhotoButton" aria-label="Change profile photo" title="Change profile photo">
            <i class="ti ti-camera" aria-hidden="true"></i>
          </button>
        </div>
        <div class="profile-header-info">
          <h2>${profile.full_name}</h2>
          <p>
            <i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}
          </p>
          <div class="profile-header-badges">
            <span class="profile-badge verified"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified ${profile.member_type || "Student"}</span>
            ${profile.role === "admin" ? `<span class="profile-badge" style="background:var(--ump-navy);"><i class="ti ti-shield-lock" aria-hidden="true"></i> Administrator</span>` : ""}
            <span class="profile-badge"><i class="ti ti-star" aria-hidden="true"></i> ${Number(profile.rating_average || 0).toFixed(1)} Rating</span>
            ${profile.faculty ? `<span class="profile-badge"><i class="ti ti-building" aria-hidden="true"></i> ${profile.faculty}</span>` : ""}
          </div>
        </div>
      </div>`;

    if (pStatTasks)    pStatTasks.textContent    = profile.completed_tasks   ?? "0";
    if (pStatRating)   pStatRating.textContent   = Number(profile.rating_average || 0).toFixed(1);
    if (pStatRentals)  pStatRentals.textContent  = profile.total_rentals      ?? "0";
    if (pStatListings) pStatListings.textContent = profile.total_listings     ?? "0";

    pStudentNumber.value = profile.student_number || "Not provided";
    pMemberType.value    = profile.member_type || "Student";
    pFaculty.value        = profile.faculty || "";
    pAcademicYear.value    = profile.academic_year || "";
    pPhoneNumber.value      = profile.phone_number || "";
    pAcademicYearGroup.style.display = profile.member_type === "Staff" ? "none" : "block";

    if (profile.role === "admin") {
      adminToolsSection.style.display = "block";
      apiRequest("/admin/stats")
        .then(res => {
          const pending = res.data?.reports?.pending ?? 0;
          adminPendingReportsNote.textContent = pending > 0
            ? `${pending} report${pending === 1 ? "" : "s"} awaiting review, plus user management and the audit log.`
            : "No pending reports right now. Review users and the audit log anytime.";
        })
        .catch(() => { /* nice-to-have, fail quietly */ });
    }

    renderReviews(profile.recent_reviews || []);

    document.getElementById("editProfilePhotoButton")?.addEventListener("click", () => profilePhotoInput?.click());
  } catch (err) {
    profileMainCard.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

/* ── Photo upload (crop → upload) ── */
profilePhotoInput?.addEventListener("change", async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("Choose a JPEG, PNG or WebP image smaller than 5 MB.", "error");
    profilePhotoInput.value = "";
    return;
  }

  const blob = await openImageCropper(file, { aspect: 1 });
  profilePhotoInput.value = "";
  if (!blob) return;

  const editButton = document.getElementById("editProfilePhotoButton");
  const originalIcon = editButton?.innerHTML;
  if (editButton) { editButton.disabled = true; editButton.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`; }

  const formData = new FormData();
  formData.append("profilePhoto", blob, "profile.jpg");
  try {
    const response = await apiMultipartRequest("/users/me/profile-photo", "PATCH", formData);
    const user = { ...currentUser, ...response.data };
    localStorage.setItem("taskifyUser", JSON.stringify(user));
    showToast("Profile photo updated.");
    await loadProfile();
  } catch (error) {
    showToast(error.message, "error");
    if (editButton && originalIcon) { editButton.disabled = false; editButton.innerHTML = originalIcon; }
  }
});

/* ── Academic details save ── */
profileDetailsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("saveProfileDetailsButton");
  const originalLabel = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Saving…`;
  profileDetailsMessage.textContent = "";

  try {
    const payload = {
      faculty: pFaculty.value,
      phoneNumber: pPhoneNumber.value.trim()
    };
    if (currentProfile?.member_type !== "Staff") {
      payload.academicYear = pAcademicYear.value;
    }

    await apiRequest("/users/me", "PATCH", payload);
    profileDetailsMessage.textContent = "Saved!";
    profileDetailsMessage.style.color = "var(--ump-green)";
    showToast("Profile details updated.");
    await loadProfile();
  } catch (err) {
    profileDetailsMessage.textContent = err.message;
    profileDetailsMessage.style.color = "red";
    showToast(err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalLabel;
  }
});

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
              <div class="market-avatar">${avatarHtml(r.reviewer_profile_photo, r.reviewer_name)}</div>
              <div>
                <div class="market-user-name">${r.reviewer_name}</div>
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
}

loadProfile();