/* "Help shape Taskify" — sends feedback to the Taskify team (POST /api/feedback).
   Signed-in users only; admins read it in Admin → Feedback. */
requireAuth();

const feedbackForm    = document.getElementById("feedbackForm");
const feedbackKind    = document.getElementById("feedbackKind");
const feedbackMessage = document.getElementById("feedbackMessage");
const feedbackCount   = document.getElementById("feedbackCount");
const feedbackError   = document.getElementById("feedbackMessageError");
const feedbackSubmit  = document.getElementById("feedbackSubmit");

/* feedback.html?kind=testing (from a profile's "Help test new features" link) */
const requestedKind = new URLSearchParams(window.location.search).get("kind");
if (requestedKind && [...feedbackKind.options].some((o) => o.value === requestedKind)) feedbackKind.value = requestedKind;

feedbackMessage.addEventListener("input", () => {
  feedbackCount.textContent = `${feedbackMessage.value.length} / 2000`;
});

feedbackForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = feedbackMessage.value.trim();
  if (message.length < 10) {
    feedbackError.textContent = "Please write at least a sentence (10 characters or more).";
    return;
  }
  feedbackError.textContent = "";
  const originalHtml = feedbackSubmit.innerHTML;
  feedbackSubmit.disabled = true;
  feedbackSubmit.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i> Sending…`;
  try {
    const res = await apiRequest("/feedback", "POST", { kind: feedbackKind.value, message });
    showToast(res.message || "Thank you — your feedback has been sent.");
    feedbackForm.reset();
    feedbackCount.textContent = "0 / 2000";
  } catch (err) {
    feedbackError.textContent = err.message;
    showToast(err.message, "error");
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.innerHTML = originalHtml;
  }
});
