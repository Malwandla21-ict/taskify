const currentUser        = requireAuth();
const profileMainCard    = document.getElementById("profileMainCard");
const recentReviewsContainer = document.getElementById("recentReviewsContainer");

const pStatTasks    = document.getElementById("pStatTasks");
const pStatRating   = document.getElementById("pStatRating");
const pStatRentals  = document.getElementById("pStatRentals");
const pStatListings = document.getElementById("pStatListings");
const profilePhotoInput = document.getElementById("profilePhotoInput");

async function loadProfile() {
  try {
    const res     = await apiRequest(`/users/${currentUser.id}/profile`);
    const profile = res.data;

    profileMainCard.innerHTML = `
      <div class="profile-header-card">
        <button type="button" id="changeProfilePhoto" aria-label="Change profile photo" title="Change profile photo"
                style="position:relative;cursor:pointer;background:none;border:none;padding:0;">
          <div class="profile-avatar-large" style="overflow:hidden;">
            ${avatarHtml(profile.full_name, profile.profilePhoto)}
          </div>
          <span style="position:absolute;bottom:0;right:0;width:28px;height:28px;background:var(--ump-green);border:2px solid var(--ump-navy);border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <i class="ti ti-pencil" style="font-size:13px;color:white;" aria-hidden="true"></i>
          </span>
        </button>
        <div class="profile-header-info">
          <h2>${profile.full_name}</h2>
          <p>
            <i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}
          </p>
          <div class="profile-header-badges">
            <span class="profile-badge verified"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</span>
            <span class="profile-badge"><i class="ti ti-user" aria-hidden="true"></i> ${profile.member_type || "Student"}</span>
            <span class="profile-badge"><i class="ti ti-star" aria-hidden="true"></i> ${Number(profile.rating_average || 0).toFixed(1)} Rating</span>
            ${profile.role === "admin" ? `<span class="profile-badge"><i class="ti ti-shield-lock" aria-hidden="true"></i> Admin</span>` : ""}
          </div>
        </div>
      </div>`;

    /* ── Registration / academic details ── */
    const academicSection = document.getElementById("profileAcademicCard");
    if (academicSection) {
      academicSection.innerHTML = `
        <div class="form-panel">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:7px;">
            <i class="ti ti-id-badge" aria-hidden="true"></i> Student Details
          </h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Student / Staff Number</div>
              <div style="font-size:14px;font-weight:600;">${profile.student_number || "Not provided"}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Faculty / Department</div>
              <div style="font-size:14px;font-weight:600;">${profile.faculty || "Not provided"}</div>
            </div>
            ${profile.member_type !== "Staff" ? `
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Academic Year</div>
              <div style="font-size:14px;font-weight:600;">${profile.academic_year || "Not provided"}</div>
            </div>` : ""}
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Phone Number</div>
              <div style="font-size:14px;font-weight:600;">${profile.phone_number || "Not provided"}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">Member Since</div>
              <div style="font-size:14px;font-weight:600;">${new Date(profile.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>`;
    }

    if (pStatTasks)    pStatTasks.textContent    = profile.completed_tasks   ?? "0";
    if (pStatRating)   pStatRating.textContent   = Number(profile.rating_average || 0).toFixed(1);
    if (pStatRentals)  pStatRentals.textContent  = profile.total_rentals      ?? "0";
    if (pStatListings) pStatListings.textContent = profile.total_listings     ?? "0";

    renderReviews(profile.recent_reviews || []);
  } catch (err) {
    profileMainCard.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

profilePhotoInput?.addEventListener("change", async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("Choose a JPEG, PNG or WebP image smaller than 5 MB.", "error");
    profilePhotoInput.value = "";
    return;
  }

  const formData = new FormData();
  formData.append("profilePhoto", file);
  try {
    const response = await apiMultipartRequest("/users/me/profile-photo", "PATCH", formData);
    const user = { ...currentUser, ...response.data };
    localStorage.setItem("taskifyUser", JSON.stringify(user));
    showToast("Profile photo updated.");
    await loadProfile();
    populateAvatar();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    profilePhotoInput.value = "";
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#changeProfilePhoto")) profilePhotoInput?.click();
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
              <div class="market-avatar">${avatarHtml(r.reviewer_name, r.reviewer_profile_photo)}</div>
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