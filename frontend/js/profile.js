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

    /* ── Header card ── */
    const initials = avatarInitials(profile.full_name);
    profileMainCard.innerHTML = `
      <div class="profile-header-card">
        <button type="button" class="profile-avatar-large" id="changeProfilePhoto" aria-label="Change profile photo" title="Change profile photo" style="cursor:pointer;overflow:hidden;position:relative;">
          ${profile.profilePhoto ? `<img src="${profile.profilePhoto}" alt="${profile.full_name}'s profile photo" />` : initials}
        </button>
        <div class="profile-header-info">
          <h2>${profile.full_name}</h2>
          <p>
            <i class="ti ti-mail" aria-hidden="true"></i> ${profile.email}
          </p>
          <div class="profile-header-badges">
            <span class="profile-badge verified"><i class="ti ti-shield-check" aria-hidden="true"></i> Verified Student</span>
            <span class="profile-badge"><i class="ti ti-user" aria-hidden="true"></i> ${profile.role}</span>
            <span class="profile-badge"><i class="ti ti-star" aria-hidden="true"></i> ${Number(profile.rating_average || 0).toFixed(1)} Rating</span>
          </div>
        </div>
      </div>`;

    /* ── Stat tiles ── */
    if (pStatTasks)    pStatTasks.textContent    = profile.completed_tasks   ?? "0";
    if (pStatRating)   pStatRating.textContent   = Number(profile.rating_average || 0).toFixed(1);
    if (pStatRentals)  pStatRentals.textContent  = profile.total_rentals      ?? "—";
    if (pStatListings) pStatListings.textContent = profile.total_listings     ?? "—";

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
    const initials = avatarInitials(r.reviewer_name);
    const stars    = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
    return `
      <div class="market-card">
        <div class="market-content">
          <div class="market-top">
            <div class="market-user">
              <div class="market-avatar">${initials}</div>
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
