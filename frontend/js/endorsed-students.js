requireAuth();

const studentsContainer   = document.getElementById("studentsContainer");
const studentSearchInput  = document.getElementById("studentSearchInput");
const studentFacultyFilter = document.getElementById("studentFacultyFilter");
const studentSortSelect   = document.getElementById("studentSortSelect");

const statEndorsedStudents  = document.getElementById("statEndorsedStudents");
const statFacultiesCovered  = document.getElementById("statFacultiesCovered");
const statTotalEndorsements = document.getElementById("statTotalEndorsements");
const statAvgRating         = document.getElementById("statAvgRating");

let cachedStudents = [];

/* ── Client-side-only "saved" heart toggle ── local per browser only;
   there is no saved-students table/endpoint in the backend yet. */
function getSavedStudentIds() {
  try { return JSON.parse(localStorage.getItem("taskifySavedStudents") || "[]"); }
  catch { return []; }
}
function toggleSavedStudentId(id) {
  const saved = getSavedStudentIds();
  const idx = saved.indexOf(id);
  if (idx >= 0) saved.splice(idx, 1); else saved.push(id);
  localStorage.setItem("taskifySavedStudents", JSON.stringify(saved));
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
      const nowSaved = toggleSavedStudentId(id);
      btn.classList.toggle("saved", nowSaved);
      btn.querySelector("i").className = `ti ${nowSaved ? "ti-heart-filled" : "ti-heart"}`;
    });
  });
}

function populateFacultyFilter(students) {
  const faculties = [...new Set(students.map(s => s.faculty).filter(Boolean))].sort();
  studentFacultyFilter.innerHTML = `<option value="All">All Faculties</option>` +
    faculties.map(f => `<option value="${f}">${f}</option>`).join("");
}

function studentCard(student) {
  const endorsements = student.endorsements || [];
  const latestEndorsement = endorsements[0];
  const isSaved = getSavedStudentIds().includes(student.student_id);
  const endorsementCount = endorsements.length;

  return `
    <div class="student-card-v2">
      <div class="student-card-v2-media">
        ${student.student_photo
          ? `<img src="${student.student_photo}" alt="${student.student_name}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<div class="media-placeholder light green"><i class="ti ti-user" aria-hidden="true"></i></div>`}
        <div class="corner-badge corner-badge-left student-endorsed"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i> Endorsed</div>
        <button type="button" class="save-heart-btn ${isSaved ? "saved" : ""}" data-save-id="${student.student_id}" aria-label="Save student">
          <i class="ti ${isSaved ? "ti-heart-filled" : "ti-heart"}" aria-hidden="true"></i>
        </button>
      </div>
      <div class="student-card-v2-body">
        <div class="student-card-v2-name">${student.student_name}</div>
        <div class="student-card-v2-subject">${student.faculty || "Faculty not set"}</div>
        <div class="student-card-v2-meta">
          <span><i class="ti ti-certificate" aria-hidden="true"></i> ${endorsementCount} lecturer endorsement${endorsementCount === 1 ? "" : "s"}</span>
          <span class="rating"><i class="ti ti-star" aria-hidden="true"></i> ${Number(student.rating_average || 0).toFixed(1)} (${student.total_reviews} review${student.total_reviews === 1 ? "" : "s"})</span>
        </div>
        ${latestEndorsement?.message
          ? `<div class="student-card-v2-quote">"${latestEndorsement.message}"<strong>— ${latestEndorsement.lecturer_title || ""} ${latestEndorsement.lecturer_name || ""}</strong></div>`
          : `<div class="student-card-v2-quote">Endorsed by ${latestEndorsement?.lecturer_title || ""} ${latestEndorsement?.lecturer_name || ""}<strong>&nbsp;</strong></div>`}
        <button type="button" class="primary-button profile-link" data-user-id="${student.student_id}">
          <i class="ti ti-user" aria-hidden="true"></i> View Profile
        </button>
      </div>
    </div>`;
}

function renderStats(students) {
  statEndorsedStudents.textContent = students.length;

  const faculties = new Set(students.map(s => s.faculty).filter(Boolean));
  statFacultiesCovered.textContent = faculties.size;

  const totalEndorsements = students.reduce((sum, s) => sum + s.endorsements.length, 0);
  statTotalEndorsements.textContent = totalEndorsements;

  const rated = students.filter(s => Number(s.total_reviews) > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, s) => sum + Number(s.rating_average || 0), 0) / rated.length
    : 0;
  statAvgRating.textContent = rated.length ? avgRating.toFixed(1) : "—";
}

function renderStudents() {
  const q = studentSearchInput?.value.trim().toLowerCase() || "";
  const faculty = studentFacultyFilter?.value || "All";

  let filtered = cachedStudents.filter(s => {
    const matchesFaculty = faculty === "All" || s.faculty === faculty;
    const matchesSearch = !q ||
      (s.student_name || "").toLowerCase().includes(q) ||
      (s.faculty || "").toLowerCase().includes(q) ||
      (s.endorsements || []).some(e => (e.message || "").toLowerCase().includes(q));
    return matchesFaculty && matchesSearch;
  });

  const sort = studentSortSelect?.value || "rating";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "endorsements") return b.endorsements.length - a.endorsements.length;
    if (sort === "reviews") return Number(b.total_reviews) - Number(a.total_reviews);
    return Number(b.rating_average || 0) - Number(a.rating_average || 0);
  });

  studentsContainer.innerHTML = filtered.length
    ? filtered.map(studentCard).join("")
    : emptyState("ti-school-bell", "No endorsed students found", "Try a different search or filter.");
  attachProfileLinkEvents();
  attachSaveHeartEvents();
}

document.getElementById("findStudentCtaButton")?.addEventListener("click", () => {
  document.getElementById("studentsGridAnchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  studentSearchInput?.focus();
});

studentSearchInput?.addEventListener("input", renderStudents);
studentFacultyFilter?.addEventListener("change", renderStudents);
studentSortSelect?.addEventListener("change", renderStudents);

async function loadStudents() {
  try {
    const res = await apiRequest("/lecturer/endorsed-students");
    cachedStudents = res.data;
    populateFacultyFilter(cachedStudents);
    renderStats(cachedStudents);

    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam && studentSearchInput) studentSearchInput.value = searchParam;

    renderStudents();
  } catch (err) {
    studentsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadStudents();
