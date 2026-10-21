/* The video's frame around the real Taskify app. record.mjs drives the app
   inside #app with real clicks and typing, and calls these helpers to move
   the visible cursor, update the test-case panel and show captions. The
   app itself is untouched: same origin, loaded in an iframe. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("app");
let cases = [];
let typingUrl = false;

/* Address bar follows the app's real location. */
app.addEventListener("load", () => {
  if (!typingUrl) $("url").textContent = app.contentWindow.location.href;
});

function renderCases() {
  $("caseList").innerHTML = cases.map((c, i) => `
    <li class="case ${c.status || ""}" id="case${i}">
      <span class="num">${i + 1}</span>
      <span class="chip">${c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : c.status === "running" ? "RUNNING" : "PENDING"}</span>
      <div class="name">${esc(c.name)}</div>
      <div class="row"><b>Input</b>${esc(c.input)}</div>
      <div class="row"><b>Expected</b>${esc(c.expected)}</div>
      <div class="row actual ${c.actual ? "show" : ""}"><b>Actual</b>${esc(c.actual || "")}</div>
    </li>`).join("");
  const passed = cases.filter((c) => c.status === "pass").length;
  $("score").textContent = `${passed} / ${cases.length} passed`;
}

window.stage = {
  init({ title, meta, cases: list }) {
    $("title").textContent = title;
    $("meta").innerHTML = meta.map(esc).join("<br>");
    cases = list.map((c) => ({ ...c }));
    renderCases();
  },

  load(url) {
    return new Promise((resolve) => {
      app.addEventListener("load", () => resolve(), { once: true });
      app.src = url;
    });
  },

  setCase(i, status, actual) {
    cases[i].status = status;
    if (actual !== undefined) cases[i].actual = actual;
    renderCases();
  },

  caption(text) {
    const el = $("caption");
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = text || ""; el.style.opacity = 1; }, 180);
  },

  cursorTo(x, y, ms) {
    const c = $("cursor");
    c.style.transitionDuration = `${ms}ms`;
    // The arrow's tip is ~4px in from the SVG's corner.
    c.style.left = `${x - 4}px`;
    c.style.top = `${y - 2}px`;
  },

  ripple(x, y) {
    const r = $("ripple");
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    r.classList.remove("go");
    void r.offsetWidth;
    r.classList.add("go");
  },

  /* Lines are [{ text, cls }]; a line whose cls is "link" is the reset URL. */
  terminal(show, lines) {
    if (lines) {
      $("termBody").innerHTML = lines.map((l) =>
        l.link
          ? `<span class="${l.cls || ""}">${esc(l.before)}</span><span class="link" id="termLink">${esc(l.link)}</span><span class="${l.cls || ""}">${esc(l.after || "")}</span>`
          : `<span class="${l.cls || ""}">${esc(l.text)}</span>`
      ).join("\n");
    }
    $("terminal").classList.toggle("show", show);
  },

  highlightLink(on) {
    $("termLink")?.classList.toggle("hot", on);
  },

  linkBox() {
    const r = $("termLink").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  },

  addressBox() {
    const r = document.querySelector(".address").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  },

  /* "Pastes" a URL into the address bar, then opens it in the app. */
  async pasteUrl(url) {
    typingUrl = true;
    const addr = document.querySelector(".address");
    addr.classList.add("typing");
    $("url").textContent = "";
    await new Promise((r) => setTimeout(r, 350));
    $("url").textContent = url;
    await new Promise((r) => setTimeout(r, 700));
    addr.classList.remove("typing");
    typingUrl = false;
    await this.load(url);
  },

  card(html) {
    const card = $("card");
    if (html) card.innerHTML = `<div class="card-inner">${html}</div>`;
    card.classList.toggle("show", !!html);
    $("cursor").style.opacity = html ? 0 : 1;
  },

  cardTable(withResults) {
    const rows = cases.map((c, i) => `<tr><td>${i + 1}. ${esc(c.name)}</td><td>${esc(c.input)}</td><td>${esc(c.expected)}</td>${
      withResults ? `<td><span class="pill ${c.status === "pass" ? "" : "fail"}">${c.status === "pass" ? "PASS" : "FAIL"}</span></td>` : ""}</tr>`).join("");
    return `<table><thead><tr><th>Test case</th><th>Input / action</th><th>Expected result</th>${withResults ? "<th>Result</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
  }
};
