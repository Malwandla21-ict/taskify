requireAuth();

const tutorsContainer = document.getElementById("tutorsContainer");

function tutorCard(tutor) {
  const latestEndorsement = tutor.endorsements[0];
  return `
    <div class="tutor-card">
      <div class="tutor-card-header">
        <div class="market-avatar">${avatarHtml(tutor.student_name, tutor.student_photo)}</div>
        <div>
          <div class="profile-link" data-user-id="${tutor.student_id}" style="cursor:pointer;font-weight:700;font-size:15px;">${tutor.student_name}</div>
          <div style="font-size:12px;color:var(--muted);">${tutor.faculty || "Faculty not set"}</div>
        </div>
      </div>
      <div class="market-tags" style="margin-bottom:10px;">
        <div class="endorsement-badge tutoring"><i class="ti ti-certificate" aria-hidden="true"></i> ${tutor.endorsements.length} lecturer endorsement${tutor.endorsements.length === 1 ? "" : "s"}</div>
        <div class="market-tag"><i class="ti ti-star" aria-hidden="true"></i> ${Number(tutor.rating_average || 0).toFixed(1)} (${tutor.total_reviews} reviews)</div>
      </div>
      ${latestEndorsement?.message ? `
        <div class="tutor-endorsement-quote">
          "${latestEndorsement.message}"
          <div style="margin-top:6px;font-weight:700;">— ${latestEndorsement.lecturer_title || ""} ${latestEndorsement.lecturer_name}</div>
        </div>` : `
        <div class="tutor-endorsement-quote">Endorsed by ${latestEndorsement.lecturer_title || ""} ${latestEndorsement.lecturer_name}</div>`}
    </div>`;
}

async function loadTutors() {
  try {
    const res = await apiRequest("/lecturer/tutors");
    const tutors = res.data;
    tutorsContainer.innerHTML = tutors.length
      ? tutors.map(tutorCard).join("")
      : emptyState("ti-school-bell", "No verified tutors yet", "Lecturers can endorse students for tutoring from their profile.");
    attachProfileLinkEvents();
  } catch (err) {
    tutorsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadTutors();