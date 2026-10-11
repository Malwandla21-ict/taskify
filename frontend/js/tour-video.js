/* ── tour-video.js — the 75-second product tour in a pop-up player ──
   Shared by the landing page and the dashboard welcome pop-up. The video
   was made in explainer/ and lives in assets/videos/.

   Usage:
     TaskifyTour.init({ footerHtml, hashLink })   // wires every [data-tour-open]
     TaskifyTour.open(triggerElement)             // open from code

   footerHtml: what sits under the video (the landing page shows sign-up
   buttons; the dashboard shows where to start). hashLink: true makes
   page.html#tour open the player, so the tour can be shared as a link.

   The player is added to the page on first use, and the video only starts
   downloading once it is opened (preload="none"). Closing pauses it and
   puts keyboard focus back where it was. */
(function (global) {
  "use strict";

  let modal = null;
  let video = null;
  let opener = null;
  let footerHtml = "";
  let hashLink = false;

  function build() {
    if (modal) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="tour-modal" id="tourModal" role="dialog" aria-modal="true" aria-labelledby="tourModalTitle" hidden>
        <div class="tour-modal-backdrop" data-tour-close></div>
        <div class="tour-modal-panel">
          <div class="tour-modal-head">
            <h2 id="tourModalTitle">Taskify in 75 seconds</h2>
            <button type="button" class="tour-modal-close" data-tour-close aria-label="Close the video"><i class="ti ti-x" aria-hidden="true"></i></button>
          </div>
          <video id="tourVideo" controls playsinline preload="none" poster="./assets/videos/taskify-tour-poster.jpg">
            <source src="./assets/videos/taskify-tour.mp4" type="video/mp4" />
            <track kind="captions" src="./assets/videos/taskify-tour.vtt" srclang="en" label="English" />
            Your browser can't play this video. <a href="./assets/videos/taskify-tour.mp4">Download it</a> instead.
          </video>
          ${footerHtml ? `<div class="tour-modal-foot">${footerHtml}</div>` : ""}
        </div>
      </div>`);
    modal = document.getElementById("tourModal");
    video = document.getElementById("tourVideo");
    modal.querySelectorAll("[data-tour-close]").forEach((el) => el.addEventListener("click", close));

    document.addEventListener("keydown", (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") close();
      // Keep keyboard focus inside the dialog.
      if (e.key === "Tab") {
        const items = modal.querySelectorAll("button, a[href], video");
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function open(trigger) {
    build();
    opener = trigger || null;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector(".tour-modal-close").focus();
    video.play().catch(() => { /* autoplay blocked (e.g. opened from a #tour link): the controls are there */ });
    if (hashLink && location.hash !== "#tour") history.replaceState(null, "", "#tour");
  }

  function close() {
    if (!modal || modal.hidden) return;
    video.pause();
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => { modal.hidden = true; }, 250);
    if (hashLink && location.hash === "#tour") history.replaceState(null, "", location.pathname + location.search);
    // The opener may have gone (e.g. the welcome pop-up closed); only refocus it if it's still visible.
    if (opener && opener.offsetParent !== null) opener.focus();
  }

  function init(options = {}) {
    footerHtml = options.footerHtml || "";
    hashLink = !!options.hashLink;
    document.querySelectorAll("[data-tour-open]").forEach((btn) => btn.addEventListener("click", () => open(btn)));
    if (hashLink) {
      if (location.hash === "#tour") open(null);
      // A #tour link followed while already on the page doesn't reload it.
      window.addEventListener("hashchange", () => { if (location.hash === "#tour" && (!modal || modal.hidden)) open(null); });
    }
  }

  global.TaskifyTour = { init, open, close };
})(window);
