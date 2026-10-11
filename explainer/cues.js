/* ============================================================
   Taskify explainer — the ONE timeline every part reads.

   Times are in seconds from the start of the film. The player
   (film.js), the app screens (app-film.js), the soundtrack builder
   (tools/build-audio.mjs) and the MP4 exporter (tools/export-mp4.mjs)
   all use these numbers, so moving a cue here moves the picture,
   the voice and the sound effects together.

   Works in the browser (window.FILM_CUES) and in Node (require/import).
============================================================ */
(function (root, factory) {
  const cues = factory();
  if (typeof module === "object" && module.exports) module.exports = cues;
  else root.FILM_CUES = cues;
})(typeof self !== "undefined" ? self : this, function () {
  const DURATION = 75;
  const FPS = 30;

  const SCENES = [
    { id: "intro",   label: "Introduction",       start: 0,    end: 9.5 },
    { id: "tasks",   label: "Tasks",              start: 9.5,  end: 27.5 },
    { id: "sales",   label: "Sales",              start: 27.5, end: 43.5 },
    { id: "rentals", label: "Rentals",            start: 43.5, end: 59.5 },
    { id: "outro",   label: "The bigger picture", start: 59.5, end: DURATION }
  ];

  /* Voice-over. `file` is in audio/vo/. `end` is the latest the line may
     run to; tools/build-audio.mjs warns if a recording is longer. */
  const NARRATION = [
    { id: "01-intro", start: 0.55, end: 10.1,
      text: "Meet Taskify — a campus-focused platform that brings student opportunities, buying and selling, and equipment rentals together in one place." },
    { id: "02-tasks", start: 10.3, end: 27.0,
      text: "Need help with something, or have a skill you can offer? With Tasks, students can discover opportunities, connect around work that needs doing, and turn their time and skills into value." },
    { id: "03-sales", start: 28.3, end: 43.0,
      text: "Looking for something you need, or have something you no longer use? Sales helps students discover items from their campus community and gives sellers a place to showcase what they have." },
    { id: "04-rentals", start: 44.3, end: 59.0,
      text: "Need equipment without buying it outright? Rentals helps students find items they can use when they need them, while giving owners an opportunity to make their resources available to others." },
    { id: "05-outro", start: 60.2, end: 74.2,
      text: "Whether you're finding help, discovering your next purchase, or renting what you need, Taskify brings more campus opportunities within reach. One platform. Three ways to make student life easier." }
  ];

  /* Every on-screen beat. Grouped by scene; names are used by film.js and
     app-film.js. Keep them in time order inside each group. */
  const T = {
    // Scene 1 — logo, then the dashboard
    logoIn: 0.15, taglineIn: 1.9, logoOut: 3.0, frameIn: 3.0, frameSettled: 4.2,
    chipTasks: 4.6, chipSales: 5.9, chipRentals: 7.1, chipsOut: 9.0,

    // Scene 2 — Tasks
    navTasksClick: 9.9, tasksPage: 10.15, tasksCards: 10.5, tasksScroll: 11.4,
    tasksHover: 13.2, tasksViewClick: 14.6, taskDetail: 14.9,
    taskReadPan: 15.6, taskSummaryPan: 18.0, applyClick: 19.6,
    applyModal: 19.8, applySendClick: 21.4, applySent: 21.6,
    taskJourney: 23.0, taskJourneyOut: 27.2,

    // Scene 3 — Sales
    navSalesClick: 27.8, salesPage: 28.05, salesCards: 28.4, salesScroll: 29.2,
    salesSearchFocus: 30.6, salesTypeStart: 30.9, salesTypeEnd: 31.8, salesFiltered: 32.0,
    salesViewClick: 33.2, saleDetail: 33.5, saleSummaryPan: 34.6,
    buyClick: 37.2, buyModal: 37.4, simulateClick: 39.6, paymentHeld: 40.0,
    handoverPanel: 40.1, momentOut: 42.3, salesBackClick: 42.6, salesBack: 42.8,

    // Scene 4 — Rentals
    navRentalsClick: 43.7, rentalsPage: 43.95, rentalsCards: 44.3, rentalsScroll: 45.0,
    rentalsHover: 46.4, rentalsViewClick: 47.6, rentalDetail: 47.9, rentalSummaryPan: 48.8,
    requestClick: 50.4, bookingModal: 50.6, startDatePick: 51.2, endDatePick: 51.9,
    quoteIn: 52.3, sendRequestClick: 54.6, requestSent: 54.8,
    rentalJourney: 55.6, rentalJourneyOut: 59.3,

    // Scene 5 — pull back, three modules, brand end card
    navDashClick: 59.7, dashBack: 59.95, pullBack: 60.4,
    moduleTasks: 60.9, moduleSales: 62.5, moduleRentals: 64.2,
    endCard: 66.3, endLines: 69.4, endTagline: 71.3, fadeOut: 74.4
  };

  /* Sound effects for tools/build-audio.mjs: [time, kind, gain]. */
  const SFX = [
    [T.logoIn, "shimmer", 0.55],
    [T.frameIn, "whoosh", 0.45],
    [T.chipTasks, "pop", 0.32], [T.chipSales, "pop", 0.32], [T.chipRentals, "pop", 0.32],
    [T.navTasksClick, "click", 0.5], [T.tasksPage - 0.05, "swish", 0.3],
    [T.tasksViewClick, "click", 0.5], [T.taskDetail - 0.05, "swish", 0.25],
    [T.applyClick, "click", 0.5], [T.applySendClick, "click", 0.5], [T.applySent, "chime", 0.35],
    [T.taskJourney + 0.3, "tick", 0.25], [T.taskJourney + 0.95, "tick", 0.25], [T.taskJourney + 1.6, "tick", 0.25],
    [T.taskJourney + 2.25, "tick", 0.25], [T.taskJourney + 2.9, "chime", 0.3],
    [T.navSalesClick, "click", 0.5], [T.salesPage - 0.05, "swish", 0.3],
    [T.salesSearchFocus, "click", 0.4], [T.salesTypeStart, "type", 0.22],
    [T.salesViewClick, "click", 0.5], [T.saleDetail - 0.05, "swish", 0.25],
    [T.buyClick, "click", 0.5], [T.simulateClick, "click", 0.5], [T.paymentHeld + 0.25, "chime", 0.35],
    [T.salesBackClick, "click", 0.45], [T.salesBack - 0.05, "swish", 0.22],
    [T.navRentalsClick, "click", 0.5], [T.rentalsPage - 0.05, "swish", 0.3],
    [T.rentalsViewClick, "click", 0.5], [T.rentalDetail - 0.05, "swish", 0.25],
    [T.requestClick, "click", 0.5], [T.startDatePick, "click", 0.4], [T.endDatePick, "click", 0.4],
    [T.sendRequestClick, "click", 0.5], [T.requestSent, "chime", 0.35],
    [T.rentalJourney + 0.3, "tick", 0.25], [T.rentalJourney + 0.9, "tick", 0.25], [T.rentalJourney + 1.5, "tick", 0.25],
    [T.rentalJourney + 2.1, "tick", 0.25], [T.rentalJourney + 2.7, "chime", 0.3],
    [T.navDashClick, "click", 0.45], [T.pullBack, "whoosh", 0.4],
    [T.moduleTasks, "pop", 0.32], [T.moduleSales, "pop", 0.32], [T.moduleRentals, "pop", 0.32],
    [T.endCard, "shimmer", 0.6], [T.endLines, "pop", 0.25]
  ];

  return { DURATION, FPS, SCENES, NARRATION, T, SFX };
});
