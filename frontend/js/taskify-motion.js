/*
  Taskify Motion — logo reveal + payment moments.

  Use:
    TaskifyMotion.mountReveal(element, { color: "#FFFFFF" })   // logo reveal
    TaskifyMotion.moment("held", { message: "R360.50 is safe until handover." })
    TaskifyMotion.moment("released", { message: "R350.00 sent to the seller." })

  Plain JavaScript (Web Animations API, no library), so it can drop straight
  into the Taskify frontend later. Every animation uses only transform,
  opacity and SVG stroke drawing. Honors "Reduce motion".
*/
(function (global) {
  "use strict";

  const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";      // same as --ease-out in main.css
  const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";  // same as --ease-in-out in main.css

  const GREEN = "#12A66E";
  const GOLD = "#F5B400";
  const BURST_COLORS = ["#12A66E", "#F5B400", "#0072CE", "#E03A3E", "#12A66E", "#F5B400", "#0072CE", "#0E2238", "#12A66E", "#F5B400"];

  const reducedQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function prefersReduced() { return !!(reducedQuery && reducedQuery.matches); }

  /* ---------- SVG building blocks (geometry copied from the real mark files) ---------- */

  // The symbol's inner shapes, in the mark's own coordinates.
  function symbolInner() {
    return `
      <circle class="tk-circle" cx="50" cy="50" r="48" fill="${GREEN}"></circle>
      <g transform="translate(3 4)">
        <g class="tk-body">
          <g class="tk-t">
            <rect x="33" y="18" width="36" height="10" rx="2.5" fill="#FFFFFF"></rect>
            <rect x="46" y="18" width="10" height="32" rx="1.5" fill="#FFFFFF"></rect>
          </g>
          <path class="tk-tick" d="M37 27 L47 37 L64 17" fill="none" stroke="#FFFFFF" stroke-width="6.5"
                stroke-linecap="round" stroke-linejoin="round" pathLength="1"
                style="stroke-dasharray:1;stroke-dashoffset:1"></path>
          <path class="tk-cart" d="M22 35 H30 L39.5 62 H66 L71.5 48 H43" fill="none" stroke="#FFFFFF"
                stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1"></path>
          <circle class="tk-wheel" cx="44" cy="71.5" r="4.4" fill="#FFFFFF"></circle>
          <circle class="tk-wheel" cx="62" cy="71.5" r="4.4" fill="#FFFFFF"></circle>
        </g>
      </g>`;
  }

  // Symbol with room around it for the ring and the burst (used for payment moments).
  function symbolSVG(label) {
    let dots = "";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const cx = (50 + Math.cos(a) * 54).toFixed(2);
      const cy = (50 + Math.sin(a) * 54).toFixed(2);
      dots += `<circle class="tk-dot" cx="${cx}" cy="${cy}" r="${i % 2 ? 2.6 : 3.4}" fill="${BURST_COLORS[i]}" style="opacity:0"
                data-dx="${(Math.cos(a) * 15).toFixed(2)}" data-dy="${(Math.sin(a) * 15).toFixed(2)}"></circle>`;
    }
    return `
      <svg class="tk-mark" viewBox="-22 -22 144 144" role="img" aria-label="${label || "Taskify"}" style="overflow:visible">
        <g transform="translate(-2 -2)">
          <circle class="tk-ring" cx="50" cy="50" r="55" fill="none" stroke="${GOLD}" stroke-width="3.5"
                  stroke-linecap="round" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1"></circle>
          ${dots}
          ${symbolInner()}
        </g>
      </svg>`;
  }

  // Horizontal lockup (icon + "taskify" + "MARKETPLACE") for the reveal.
  // The wordmark uses currentColor so the same file works on light and navy backgrounds.
  function lockupSVG(wordPath, marketPath) {
    return `
      <svg class="tk-lockup" viewBox="0 0 307.7 100" role="img" aria-label="Taskify Marketplace" style="overflow:visible">
        <g class="tk-word"><path d="${wordPath}" fill="currentColor"></path></g>
        <g class="tk-market"><path d="${marketPath}" fill="${GREEN}"></path></g>
        <g class="tk-icon-move">
          <g transform="scale(1.04167) translate(-2 -2)">${symbolInner()}</g>
        </g>
      </svg>`;
  }

  /* ---------- tiny animation helper ---------- */

  // Remembers every animation started on a root so a replay can cancel the old one first.
  function track(root) {
    if (root._tkAnims) root._tkAnims.forEach((a) => a.cancel());
    root._tkAnims = [];
    const reduce = prefersReduced();
    return function anim(el, keyframes, opts) {
      if (!el) return null;
      const o = Object.assign({ fill: "both", easing: EASE_OUT }, opts);
      if (reduce) {
        // Reduced motion: no movement. Jump to the end state; text still fades gently.
        if (o.gentle) { keyframes = [{ opacity: 0 }, { opacity: 1 }]; o.duration = 200; o.delay = 0; o.easing = "ease"; }
        else { o.duration = 0; o.delay = 0; }
      }
      delete o.gentle;
      const a = el.animate(keyframes, o);
      root._tkAnims.push(a);
      return a;
    };
  }

  const fb = { transformBox: "fill-box", transformOrigin: "center" }; // scale/rotate around the shape's own centre

  function styleOrigin(el) { if (el) { el.style.transformBox = fb.transformBox; el.style.transformOrigin = fb.transformOrigin; } }

  /* ---------- A. Logo reveal (brand video / intro) — 2.9 s ---------- */

  function playReveal(svg) {
    const anim = track(svg);
    const q = (s) => svg.querySelector(s);
    const qa = (s) => svg.querySelectorAll(s);
    [q(".tk-circle"), ...qa(".tk-wheel"), q(".tk-t")].forEach(styleOrigin);

    // 1. Green circle grows in.
    anim(q(".tk-circle"), [{ transform: "scale(0.82)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 520 });
    // 2. Cart line draws itself from the handle.
    anim(q(".tk-cart"), [{ strokeDashoffset: 1, strokeDasharray: 1 }, { strokeDashoffset: 0, strokeDasharray: 1 }],
      { duration: 760, delay: 260, easing: EASE_IN_OUT });
    // 3. Wheels pop in, one after the other.
    qa(".tk-wheel").forEach((w, i) => anim(w,
      [{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 380, delay: 860 + i * 70 }));
    // 4. The "T" (the task) drops into the cart and settles.
    anim(q(".tk-t"), [
      { transform: "translateY(-22px) scaleY(1)", opacity: 0, easing: EASE_IN_OUT },
      { transform: "translateY(-8px) scaleY(1)", opacity: 1, offset: 0.35, easing: "cubic-bezier(0.55, 0, 1, 0.45)" },
      { transform: "translateY(1.2px) scaleY(0.95)", opacity: 1, offset: 0.68, easing: EASE_OUT },
      { transform: "translateY(0) scaleY(1)", opacity: 1 }
    ], { duration: 620, delay: 1080 });
    // 5. Icon slides left while "taskify" slides out from behind it.
    anim(q(".tk-icon-move"), [{ transform: "translateX(103.85px)" }, { transform: "translateX(0px)" }],
      { duration: 700, delay: 1760, easing: EASE_IN_OUT });
    anim(q(".tk-word"), [
      { transform: "translateX(-26px)", opacity: 0, clipPath: "inset(0 100% 0 0)" },
      { transform: "translateX(0px)", opacity: 1, clipPath: "inset(0 0% 0 0)" }
    ], { duration: 720, delay: 1960 });
    // 6. "MARKETPLACE" settles in last.
    anim(q(".tk-market"), [{ transform: "translateY(5px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }],
      { duration: 520, delay: 2380, gentle: true });

    return 2900; // total length in ms
  }

  /* ---------- 1. Payment held — 1.0 s ---------- */

  function playHeld(root) {
    const anim = track(root);
    const q = (s) => root.querySelector(s);
    [q(".tk-t"), q(".tk-ring")].forEach(styleOrigin);
    resetMarkParts(root);

    // The item ("T") drops into the cart.
    anim(q(".tk-t"), [
      { transform: "translateY(-18px)", opacity: 0 },
      { transform: "translateY(-6px)", opacity: 1, offset: 0.4 },
      { transform: "translateY(1px)", offset: 0.75 },
      { transform: "translateY(0)", opacity: 1 }
    ], { duration: 460 });
    // A gold ring closes around the mark: the money is locked away safely.
    anim(q(".tk-ring"), [
      { strokeDashoffset: 1, transform: "rotate(-90deg)", stroke: GOLD },
      { strokeDashoffset: 0, transform: "rotate(-90deg)", stroke: GOLD }
    ], { duration: 700, delay: 280, easing: EASE_IN_OUT });
    // Status text rises in.
    root.querySelectorAll("[data-held-line]").forEach((el, i) =>
      anim(el, [{ transform: "translateY(6px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 320, delay: 560 + i * 60, gentle: true }));
    return 1000;
  }

  /* ---------- 2. Payment released — 1.1 s ---------- */

  function playReleased(root) {
    const anim = track(root);
    const q = (s) => root.querySelector(s);
    const qa = (s) => root.querySelectorAll(s);
    [q(".tk-t"), q(".tk-ring"), q(".tk-body"), ...qa(".tk-dot")].forEach(styleOrigin);

    // Start from the "held" look: gold ring closed, T in the cart.
    // The T leaves...
    anim(q(".tk-t"), [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.9)", opacity: 0 }],
      { duration: 200 });
    // ...and a tick draws itself in its place.
    anim(q(".tk-tick"), [{ strokeDashoffset: 1, strokeDasharray: 1 }, { strokeDashoffset: 0, strokeDasharray: 1 }],
      { duration: 420, delay: 140 });
    // The cart gives a small roll forward, like it's heading off.
    anim(q(".tk-body"), [
      { transform: "translateX(0)" }, { transform: "translateX(3px)", offset: 0.45 }, { transform: "translateX(0)" }
    ], { duration: 560, easing: EASE_IN_OUT });
    // The ring turns from gold (held) to green (released).
    anim(q(".tk-ring"), [
      { strokeDashoffset: 0, transform: "rotate(-90deg)", stroke: GOLD },
      { strokeDashoffset: 0, transform: "rotate(-90deg)", stroke: GREEN }
    ], { duration: 320, delay: 80, easing: "ease" });
    // A small burst in UMP colours.
    qa(".tk-dot").forEach((d, i) => {
      const dx = d.getAttribute("data-dx"), dy = d.getAttribute("data-dy");
      anim(d, [
        { transform: "translate(0px, 0px) scale(0.6)", opacity: 0 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 }
      ], { duration: 640, delay: 380 + (i % 2) * 40 });
    });
    root.querySelectorAll("[data-released-line]").forEach((el, i) =>
      anim(el, [{ transform: "translateY(6px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 320, delay: 520 + i * 60, gentle: true }));
    return 1100;
  }

  function resetMarkParts(root) {
    const tick = root.querySelector(".tk-tick");
    if (tick) tick.style.strokeDashoffset = "1";
  }

  function cancel(root) {
    if (root && root._tkAnims) { root._tkAnims.forEach((a) => a.cancel()); root._tkAnims = []; }
  }


  /* ======================================================================
     Drop-in helpers for the Taskify frontend
     ====================================================================== */

  const WORD_PATH = "M134.83 58.04L125.04 58.04L125.04 35.26L118 35.26L118 26.94L125.04 26.94L125.04 14.07L134.83 14.07L134.83 26.94L141.87 26.94L141.87 35.26L134.83 35.26L134.83 58.04ZM156.27 58.68L156.27 58.68Q151.98 58.68 148.62 56.57Q145.26 54.46 143.31 50.81Q141.36 47.16 141.36 42.49Q141.36 37.82 143.31 34.17Q145.26 30.52 148.62 28.41Q151.98 26.30 156.27 26.30L156.27 26.30Q159.41 26.30 161.97 27.51L161.97 27.51Q163.57 28.28 164.85 29.50L164.85 29.50L164.85 26.94L174.45 26.94L174.45 58.04L164.85 58.04L164.85 55.55Q163.63 56.70 161.97 57.47L161.97 57.47Q159.41 58.68 156.27 58.68ZM158.26 49.85L158.26 49.85Q161.39 49.85 163.31 47.77Q165.23 45.69 165.23 42.49L165.23 42.49Q165.23 40.31 164.37 38.65Q163.50 36.99 161.94 36.06Q160.37 35.13 158.32 35.13Q156.27 35.13 154.70 36.06Q153.14 36.99 152.21 38.65Q151.28 40.31 151.28 42.49L151.28 42.49Q151.28 44.60 152.18 46.27Q153.07 47.93 154.67 48.89Q156.27 49.85 158.26 49.85ZM190.45 58.81L190.45 58.81Q187.70 58.81 185.04 58.11Q182.38 57.40 180.11 56.09Q177.84 54.78 176.24 53.05L176.24 53.05L181.81 47.42Q183.34 49.08 185.46 50.01Q187.57 50.94 190.06 50.94L190.06 50.94Q191.79 50.94 192.72 50.43Q193.65 49.91 193.65 49.02L193.65 49.02Q193.65 47.87 192.53 47.26Q191.41 46.65 189.68 46.17Q187.95 45.69 186.03 45.11Q184.11 44.54 182.38 43.51Q180.66 42.49 179.57 40.67Q178.48 38.84 178.48 36.03L178.48 36.03Q178.48 33.02 180.02 30.81Q181.55 28.60 184.37 27.32Q187.18 26.04 190.96 26.04L190.96 26.04Q194.93 26.04 198.29 27.42Q201.65 28.79 203.76 31.48L203.76 31.48L198.19 37.11Q196.72 35.39 194.90 34.68Q193.07 33.98 191.34 33.98L191.34 33.98Q189.68 33.98 188.85 34.46Q188.02 34.94 188.02 35.83L188.02 35.83Q188.02 36.79 189.10 37.37Q190.19 37.95 191.92 38.39Q193.65 38.84 195.57 39.48Q197.49 40.12 199.22 41.21Q200.94 42.30 202.03 44.12Q203.12 45.95 203.12 48.89L203.12 48.89Q203.12 53.43 199.70 56.12Q196.27 58.81 190.45 58.81ZM237.62 58.04L226.10 58.04L215.98 43.07L215.98 58.04L206.19 58.04L206.19 11.58L215.98 11.58L215.98 40.83L226.03 26.94L236.98 26.94L225.58 41.59L237.62 58.04ZM247.54 58.04L237.74 58.04L237.74 26.94L247.54 26.94L247.54 58.04ZM242.67 22.65L242.67 22.65Q240.37 22.65 238.86 21.08Q237.36 19.51 237.36 17.27L237.36 17.27Q237.36 14.97 238.86 13.43Q240.37 11.90 242.67 11.90L242.67 11.90Q244.98 11.90 246.45 13.43Q247.92 14.97 247.92 17.27L247.92 17.27Q247.92 19.51 246.45 21.08Q244.98 22.65 242.67 22.65ZM265.97 58.04L256.18 58.04L256.18 35.26L249.33 35.26L249.33 26.94L256.18 26.94L256.18 24.25Q256.18 20.47 257.87 17.43Q259.57 14.39 262.64 12.63Q265.71 10.87 269.94 10.87L269.94 10.87Q273.14 10.87 275.54 11.93Q277.94 12.99 279.73 14.84L279.73 14.84L273.58 20.99Q272.94 20.35 272.14 19.99Q271.34 19.64 270.26 19.64L270.26 19.64Q268.27 19.64 267.12 20.79Q265.97 21.95 265.97 23.93L265.97 23.93L265.97 26.94L274.93 26.94L274.93 35.26L265.97 35.26L265.97 58.04ZM288.88 71.16L278.83 71.16L285.87 55.93L274.03 26.94L284.59 26.94L290.80 45.82L297.14 26.94L307.70 26.94L294.38 58.17L288.88 71.16Z";
  const MARKET_PATH = "M119.50 89.02L118 89.02L118 81.28L119.06 81.28L121.88 85.82L124.71 81.28L125.77 81.28L125.77 89.02L124.28 89.02L124.28 84.40L122.39 87.43L121.38 87.43L119.50 84.41L119.50 89.02ZM135.16 89.02L133.60 89.02L136.71 81.28L137.93 81.28L141.03 89.02L139.44 89.02L138.90 87.58L135.71 87.58L135.16 89.02ZM136.19 86.32L138.42 86.32L137.32 83.40L136.19 86.32ZM150.26 89.02L148.77 89.02L148.77 81.28L151.79 81.28Q152.54 81.28 153.11 81.57Q153.67 81.87 153.99 82.37Q154.30 82.88 154.30 83.54L154.30 83.54Q154.30 84.22 153.99 84.72Q153.67 85.22 153.10 85.50L153.10 85.50Q152.70 85.69 152.22 85.76L152.22 85.76L154.81 89.02L152.99 89.02L150.53 85.78L150.26 85.78L150.26 89.02ZM151.66 82.50L150.26 82.50L150.26 84.62L151.66 84.62Q152.21 84.62 152.51 84.34Q152.81 84.06 152.81 83.56L152.81 83.56Q152.81 83.11 152.51 82.81Q152.21 82.50 151.66 82.50L151.66 82.50ZM169.05 89.02L167.15 89.02L163.97 85.19L163.97 89.02L162.47 89.02L162.47 81.28L163.97 81.28L163.97 84.78L167.06 81.28L168.93 81.28L165.60 84.96L169.05 89.02ZM182.04 89.02L176.66 89.02L176.66 81.28L181.99 81.28L181.99 82.60L178.16 82.60L178.16 84.43L181.66 84.43L181.66 85.71L178.16 85.71L178.16 87.70L182.04 87.70L182.04 89.02ZM193.28 89.02L191.78 89.02L191.78 82.61L189.31 82.61L189.31 81.28L195.75 81.28L195.75 82.61L193.28 82.61L193.28 89.02ZM205.10 89.02L203.60 89.02L203.60 81.28L206.65 81.28Q207.39 81.28 207.97 81.58Q208.56 81.88 208.90 82.42Q209.24 82.97 209.24 83.71Q209.24 84.46 208.90 85.01Q208.56 85.55 207.97 85.85Q207.39 86.15 206.65 86.15L206.65 86.15L205.10 86.15L205.10 89.02ZM206.49 82.50L205.10 82.50L205.10 84.92L206.49 84.92Q206.85 84.92 207.13 84.78Q207.42 84.64 207.58 84.37Q207.75 84.10 207.75 83.71L207.75 83.71Q207.75 83.34 207.58 83.07Q207.42 82.79 207.13 82.65Q206.85 82.50 206.49 82.50L206.49 82.50ZM222.16 89.02L217.12 89.02L217.12 81.28L218.62 81.28L218.62 87.69L222.16 87.69L222.16 89.02ZM230.82 89.02L229.25 89.02L232.37 81.28L233.59 81.28L236.69 89.02L235.09 89.02L234.56 87.58L231.37 87.58L230.82 89.02ZM231.85 86.32L234.07 86.32L232.97 83.40L231.85 86.32ZM247.57 89.13L247.57 89.13Q246.72 89.13 246.00 88.82Q245.27 88.52 244.73 87.98Q244.18 87.43 243.89 86.71Q243.60 85.98 243.60 85.14L243.60 85.14Q243.60 84.31 243.89 83.58Q244.18 82.86 244.73 82.32Q245.27 81.78 245.99 81.47Q246.71 81.16 247.57 81.16L247.57 81.16Q248.49 81.16 249.20 81.46Q249.90 81.77 250.44 82.30L250.44 82.30L249.43 83.31Q249.11 82.96 248.65 82.76Q248.19 82.56 247.57 82.56L247.57 82.56Q247.03 82.56 246.58 82.74Q246.14 82.92 245.81 83.27Q245.48 83.62 245.30 84.09Q245.13 84.57 245.13 85.14L245.13 85.14Q245.13 85.73 245.30 86.20Q245.48 86.67 245.81 87.02Q246.14 87.37 246.58 87.55Q247.03 87.74 247.57 87.74L247.57 87.74Q248.22 87.74 248.69 87.54Q249.15 87.34 249.47 86.98L249.47 86.98L250.48 87.99Q249.94 88.53 249.23 88.83Q248.52 89.13 247.57 89.13ZM263.73 89.02L258.35 89.02L258.35 81.28L263.67 81.28L263.67 82.60L259.85 82.60L259.85 84.43L263.34 84.43L263.34 85.71L259.85 85.71L259.85 87.70L263.73 87.70L263.73 89.02Z";

  // Puts the horizontal logo inside `container` and plays the reveal once.
  // color: colour of the "taskify" lettering ("#0E2238" on light, "#FFFFFF" on dark).
  // marketColor: colour of the small "MARKETPLACE" line. Brand green by default;
  // pass a lighter green on dark photo backgrounds, where the brand green is hard to read.
  function mountReveal(container, opts) {
    const o = Object.assign({ color: "#0E2238", marketColor: GREEN, autoplay: true }, opts);
    container.innerHTML = lockupSVG(WORD_PATH, MARKET_PATH);
    const svg = container.querySelector(".tk-lockup");
    svg.style.color = o.color;
    svg.querySelector(".tk-market path").setAttribute("fill", o.marketColor);
    svg.style.width = "100%";
    svg.style.height = "auto";
    if (o.autoplay) playReveal(svg);
    return svg;
  }

  // Payment pop-up: a small card at the bottom of the screen with the animated mark.
  // type: "held" | "released". Returns nothing; removes itself after a few seconds.
  // Call it only AFTER the API call has succeeded.
  function injectMomentStyles() {
    if (document.getElementById("tk-moment-styles")) return;
    const css = `
      .tk-moment { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); z-index: 3000;
        width: min(380px, calc(100vw - 32px)); display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 16px;
        padding: 14px 18px 14px 12px; border-radius: 16px; background: #FFFFFF; color: #0E2238;
        border: 1px solid rgba(14, 34, 56, 0.10); box-shadow: 0 18px 40px rgba(14, 34, 56, 0.18);
        font-family: inherit; transform: translate(-50%, 0); cursor: pointer; }
      .tk-moment .tk-mark { width: 92px; height: 92px; margin: -14px; display: block; }
      .tk-moment strong { display: block; font-size: 15px; line-height: 1.3; }
      .tk-moment span { display: block; font-size: 13px; line-height: 1.45; color: #56677A; margin-top: 2px; }
      .tk-moment em { font-style: normal; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
        color: #8A6A00; background: #FFF6DC; border-radius: 999px; padding: 1px 8px; margin-left: 6px; vertical-align: 2px; }`;
    const style = document.createElement("style");
    style.id = "tk-moment-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  let activeMoment = null;
  function moment(type, opts) {
    const o = Object.assign({ title: type === "released" ? "Payment released" : "Payment held", message: "", demo: true, duration: 3200 }, opts);
    injectMomentStyles();
    if (activeMoment) activeMoment.remove();

    const card = document.createElement("div");
    card.className = "tk-moment";
    card.setAttribute("role", "status");
    card.setAttribute("aria-live", "polite");
    card.innerHTML = symbolSVG(o.title) +
      `<div><strong data-${type}-line>${o.title}${o.demo ? "<em>Demo</em>" : ""}</strong>` +
      (o.message ? `<span data-${type}-line></span>` : "") + `</div>`;
    if (o.message) card.querySelector("span").textContent = o.message; // text only, never HTML
    document.body.appendChild(card);
    activeMoment = card;

    const reduce = prefersReduced();
    card.animate(
      reduce ? [{ opacity: 0 }, { opacity: 1 }]
             : [{ opacity: 0, transform: "translate(-50%, 14px) scale(0.97)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }],
      { duration: reduce ? 200 : 300, easing: EASE_OUT, fill: "both" });

    if (type === "released") {
      // Show the "held" end state first, then play the release on top of it.
      const ring = card.querySelector(".tk-ring");
      ring.style.strokeDashoffset = "0";
      ring.style.transformBox = "fill-box"; ring.style.transformOrigin = "center"; ring.style.transform = "rotate(-90deg)";
      playReleased(card);
    } else {
      playHeld(card);
    }

    let closed = false;
    function close() {
      if (closed) return; closed = true;
      const exit = card.animate(
        reduce ? [{ opacity: 1 }, { opacity: 0 }]
               : [{ opacity: 1, transform: "translate(-50%, 0)" }, { opacity: 0, transform: "translate(-50%, 14px)" }],
        { duration: 200, easing: EASE_OUT, fill: "both" });
      exit.onfinish = () => { card.remove(); if (activeMoment === card) activeMoment = null; };
    }
    card.addEventListener("click", close);
    setTimeout(close, o.duration);
  }

  global.TaskifyMotion = { mountReveal, moment, symbolSVG, lockupSVG, playReveal, playHeld, playReleased, cancel, prefersReduced, EASE_OUT, EASE_IN_OUT };
})(window);
