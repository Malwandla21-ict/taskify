/* ── landing.js — public landing page only (index.html). No requireAuth()
   here on purpose: this page has to work for signed-out visitors, since
   it's the whole point of being Google-indexable. ── */

/* If someone's already signed in (e.g. a bookmark, or Google indexed "/"
   and a returning user clicked it), skip the marketing page and take them
   straight to their dashboard rather than making them click through. */
(function redirectIfAlreadySignedIn() {
  if (localStorage.getItem("taskifyToken") && localStorage.getItem("taskifyUser")) {
    window.location.replace("./dashboard.html");
  }
})();

/* Reveal-on-scroll: progressive enhancement only. Every .reveal/.reveal-img
   element is fully visible without this script (see the no-JS/reduced-
   motion rule in landing.css) — this just adds the fade/slide-in (or, for
   photos, a settle-into-place zoom-out) as each one enters the viewport. */
function setupScrollReveal() {
  const targets = document.querySelectorAll(".reveal, .reveal-img");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach(el => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  targets.forEach(el => observer.observe(el));
}

/* Highlights the nav link for whichever section is currently in view, so
   Home/Features/How It Works/About aren't just dead anchor links — they
   reflect where you actually are on the page as you scroll. */
function setupNavScrollSpy() {
  const sections = ["home", "features", "how-it-works", "about"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const links = document.querySelectorAll(".landing-nav-links a[data-nav]");
  if (!sections.length || !links.length || !("IntersectionObserver" in window)) return;

  const setActive = (id) => {
    links.forEach(link => link.classList.toggle("active", link.dataset.nav === id));
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting);
    if (visible.length) {
      const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
      setActive(topMost.target.id);
    }
  }, { rootMargin: "-45% 0px -50% 0px" });

  sections.forEach(section => observer.observe(section));
}

setupScrollReveal();
setupNavScrollSpy();
