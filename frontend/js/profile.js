const currentUser        = requireAuth();
const profileMainCard    = document.getElementById("profileMainCard");
const recentReviewsContainer = document.getElementById("recentReviewsContainer");

const pStatTasks    = document.getElementById("pStatTasks");
const pStatRating   = document.getElementById("pStatRating");
const pStatRentals  = document.getElementById("pStatRentals");
const pStatListings = document.getElementById("pStatListings");

async function loadProfile() {
  try {
    const res     = await apiRequest(`/users/${currentUser.id}/profile`);
    const profile = res.data;

    /* ── Header card ── */
    const initials = avatarInitials(profile.full_name);
    profileMainCard.innerHTML = `
      <div class="profile-header-card">
        <div class="profile-avatar-large">${initials}</div>
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