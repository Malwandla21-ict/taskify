requireAuth();

const tutorsContainer   = document.getElementById("tutorsContainer");
const tutorSearchInput  = document.getElementById("tutorSearchInput");
const tutorFacultyFilter = document.getElementById("tutorFacultyFilter");
const tutorSortSelect   = document.getElementById("tutorSortSelect");

const statEndorsedTutors     = document.getElementById("statEndorsedTutors");
const statFacultiesCovered   = document.getElementById("statFacultiesCovered");
const statTotalEndorsements  = document.getElementById("statTotalEndorsements");
const statAvgRating          = document.getElementById("statAvgRating");

let cachedTutors = [];

/* ── Client-side-only "saved" heart toggle ── local per browser only;
   there is no saved-tutors table/endpoint in the backend yet. */
function getSavedTutorIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedTutors") || "[]"); }
  catch { return []; }
}
function toggleSavedTutorId(id) {
  const saved = getSavedTutorIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedTutors", JSON.stringify(saved));
  return saved.includes(id);
}
function attachSaveHeartEvents() {
  document.querySelectorAll(".save-heart-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.saveId);
      const nowSaved = toggleSavedTutorId(id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
    });
  });
}

function populateFacultyFilter(tutors) {
  const faculties = [...new Set(tutors.map(t => t.faculty).filter(Boolean))].sort();
  tutorFacultyFilter.innerHTML = `<option value="All">All Faculties</option>` +
    faculties.map(f => `<option value="${f}">${f}</option>`).join("");
}

function tutorCard(tutor) {
  const latestEndorsement = tutor.endorsements[0];
  const isSaved = getSavedTutorIds().includes(tutor.student_id);
  const endorsementCount = tutor.endorsements.length;

  return `
    <div class="tutor-card-v2">
      <div class="tutor-card-v2-media">
        <div class="media-placeholder light green"><i class="ti ti-user" aria-hidden="true"></i></div>
        <div class="corner-badge corner-badge-left tutor-endorsed"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Endorsed</div>
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${tutor.student_id}" aria-label="Save tutor">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="tutor-card-v2-body">
        <div class="tutor-card-v2-name">${tutor.student_name}</div>
        <div class="tutor-card-v2-subject">${tutor.faculty || "Faculty not set"}</div>
        <div class="tutor-card-v2-meta">
          <span><i class="ti ti-certificate" aria-hidden="true"></i> ${endorsementCount} lecturer endorsement${endorsementCount === 1 ? "" : "s"}</span>
          <span class="rating"><i class="ti ti-star" aria-hidden="true"></i> ${Number(tutor.rating_average || 0).toFixed(1)} (${tutor.total_reviews} review${tutor.total_reviews === 1 ? "" : "s"})</span>
        </div>
        ${latestEndorsement?.message
          ? `<div class="tutor-card-v2-quote">"${latestEndorsement.message}"<strong>— ${latestEndorsement.lecturer_title || ""} ${latestEndorsement.lecturer_name}</strong></div>`
          : `<div class="tutor-card-v2-quote">Endorsed by ${latestEndorsement.lecturer_title || ""} ${latestEndorsement.lecturer_name}<strong>&nbsp;</strong></div>`}
        <button type="button" class="primary-button profile-link" data-user-id="${tutor.student_id}">
          <i class="ti ti-user" aria-hidden="true"></i> View Profile
        </button>
      </div>
    </div>`;
}

function renderStats(tutors) {
  statEndorsedTutors.textContent = tutors.length;

  const faculties = new Set(tutors.map(t => t.faculty).filter(Boolean));
  statFacultiesCovered.textContent = faculties.size;

  const totalEndorsements = tutors.reduce((sum, t) => sum + t.endorsements.length, 0);
  statTotalEndorsements.textContent = totalEndorsements;

  const rated = tutors.filter(t => Number(t.total_reviews) > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, t) => sum + Number(t.rating_average || 0), 0) / rated.length
    : 0;
  statAvgRating.textContent = rated.length ? avgRating.toFixed(1) : "—";
}

function renderTutors() {
  const q = tutorSearchInput?.value.trim().toLowerCase() || "";
  const faculty = tutorFacultyFilter?.value || "All";

  let filtered = cachedTutors.filter(t => {
    const matchesFaculty = faculty === "All" || t.faculty === faculty;
    const matchesSearch = !q ||
      t.student_name.toLowerCase().includes(q) ||
      (t.faculty || "").toLowerCase().includes(q) ||
      t.endorsements.some(e => (e.message || "").toLowerCase().includes(q));
    return matchesFaculty && matchesSearch;
  });

  const sort = tutorSortSelect?.value || "rating";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "endorsements") return b.endorsements.length - a.endorsements.length;
    if (sort === "reviews") return Number(b.total_reviews) - Number(a.total_reviews);
    return Number(b.rating_average || 0) - Number(a.rating_average || 0);
  });

  tutorsContainer.innerHTML = filtered.length
    ? filtered.map(tutorCard).join("")
    : emptyState("ti-school-bell", "No tutors found", "Try a different search or filter.");
  attachProfileLinkEvents();
  attachSaveHeartEvents();
}

document.getElementById("findTutorCtaButton")?.addEventListener("click", () => {
  document.getElementById("tutorsGridAnchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  tutorSearchInput?.focus();
});

tutorSearchInput?.addEventListener("input", renderTutors);
tutorFacultyFilter?.addEventListener("change", renderTutors);
tutorSortSelect?.addEventListener("change", renderTutors);

async function loadTutors() {
  try {
    const res = await apiRequest("/lecturer/tutors");
    cachedTutors = res.data;
    populateFacultyFilter(cachedTutors);
    renderStats(cachedTutors);
    renderTutors();
  } catch (err) {
    tutorsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadTutors();