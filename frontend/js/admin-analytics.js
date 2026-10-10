/*
  Admin → Analytics & Reports.
  Loads /admin/analytics for the chosen dates, draws the cards and charts,
  downloads CSV reports (/admin/exports/:type), and prints a summary
  (the browser's "Save as PDF" turns the print into a PDF).
  Charts use Chart.js from the CDN; if it fails to load, the numbers still show.
*/
let analyticsLoaded = false;
let analyticsRange = { from: null, to: null };
const analyticsCharts = {};

function escapeAnalyticsText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Today's date (YYYY-MM-DD) in South African time, n days from now. */
function sastDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d);
}

function rangeFromPreset(preset) {
  const to = sastDate(0);
  if (preset === "year") return { from: `${to.slice(0, 4)}-01-01`, to };
  const days = Number(preset) || 30;
  return { from: sastDate(-(days - 1)), to };
}

function changeText(now, before) {
  if (before === undefined || before === null) return "";
  if (!before) return now ? `<span class="analytics-delta up">New this period</span>` : `<span class="analytics-delta">No change</span>`;
  const pct = Math.round(((now - before) / before) * 100);
  const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "";
  return `<span class="analytics-delta ${cls}">${arrow} ${Math.abs(pct)}% vs previous period</span>`;
}

function kpiCard(icon, colour, value, label, delta = "") {
  return `
    <div class="admin-stat-card-v2 ${colour}">
      <div class="stat-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${delta}
    </div>`;
}

const listRow = (label, value) =>
  `<div class="analytics-row"><span>${label}</span><strong>${value}</strong></div>`;
const hours = (h) => (h === null || h === undefined ? "—" : h < 1 ? "under an hour" : `${h} h`);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + Number(b || 0), 0);

function drawChart(id, type, labels, datasets, stacked = false) {
  if (typeof Chart === "undefined") {
    document.getElementById(id).parentElement.innerHTML = `<p class="analytics-hint">Charts couldn't load — the numbers below are still correct.</p>`;
    return;
  }
  analyticsCharts[id]?.destroy();
  analyticsCharts[id] = new Chart(document.getElementById(id), {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: datasets.length > 1, position: "bottom" } },
      scales: { x: { stacked, ticks: { maxTicksLimit: 8 } }, y: { stacked, beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function funnelBlock(title, steps) {
  const top = steps[0][1] || 0;
  return `<div class="analytics-funnel"><h4>${title}</h4>${steps.map(([label, n]) => {
    const pct = top ? Math.round((n / top) * 100) : 0;
    return `<div class="analytics-funnel-row"><span>${label}</span>
      <div class="analytics-bar"><div style="width:${pct}%"></div></div><strong>${n}</strong></div>`;
  }).join("")}</div>`;
}

function renderAnalytics(d) {
  const r = d.range;
  document.getElementById("analyticsRangeLine").textContent =
    `${r.from} to ${r.to} (${r.days} days), compared with ${r.previousFrom} to ${r.previousTo}. Grouped by ${r.bucket}. South African time.`;

  const L = d.listings.byType;
  const listingsNow = L.tasks.total + L.sales.total + L.rentals.total + L.events.total;
  const listingsBefore = sum(d.listings.previous);
  const completed = sum(d.transactions.completed);
  document.getElementById("analyticsKpis").innerHTML = [
    kpiCard("ti-user-plus", "c-navy", d.growth.signups.total, "New sign-ups", changeText(d.growth.signups.total, d.growth.signups.previous)),
    kpiCard("ti-users", "c-blue", d.growth.activeUsers.total, "Active users", changeText(d.growth.activeUsers.total, d.growth.activeUsers.previous)),
    kpiCard("ti-list-details", "c-green", listingsNow, "New listings", changeText(listingsNow, listingsBefore)),
    kpiCard("ti-circle-check", "c-gold", completed, "Completed deals"),
    kpiCard("ti-flag", "c-red", d.trust.reports.pending, "Reports still open")
  ].join("");

  const series = d.growth.signups.series;
  drawChart("chartSignups", "line", series.labels, [{ label: "Sign-ups", data: series.values, borderColor: "#0C1D4A", backgroundColor: "rgba(12,29,74,0.1)", fill: true, tension: 0.3 }]);
  document.getElementById("signupsByType").innerHTML = Object.entries(d.growth.signupsByType || {})
    .map(([type, n]) => `<span class="analytics-chip">${escapeAnalyticsText(type)}: <strong>${n}</strong></span>`).join("");

  const colours = { tasks: "#0072CE", sales: "#009B72", rentals: "#F5B400", events: "#E03A3E" };
  drawChart("chartListings", "bar", L.tasks.series.labels,
    Object.entries(L).map(([k, v]) => ({ label: k[0].toUpperCase() + k.slice(1), data: v.series.values, backgroundColor: colours[k] })), true);

  const m = d.transactions.money;
  drawChart("chartMoney", "bar", d.transactions.releasedSeries.labels,
    [{ label: "Released (R)", data: d.transactions.releasedSeries.values, backgroundColor: "#009B72" }]);
  document.getElementById("moneyList").innerHTML = [
    listRow("Released to people", formatRand(m.released)),
    listRow("Refunded", formatRand(m.refunded)),
    listRow("Protection fees", formatRand(m.protectionFees)),
    listRow("Held right now", formatRand(m.heldNow)),
    `<p class="analytics-hint">Demo payments — no real money has moved.</p>`
  ].join("");

  const f = d.funnels;
  document.getElementById("analyticsFunnels").innerHTML =
    funnelBlock("Tasks", [["Posted", f.tasks.posted], ["Assigned", f.tasks.assigned], ["Completed", f.tasks.completed]]) +
    funnelBlock("Sales", [["Listed", f.sales.listed], ["Reserved", f.sales.reserved], ["Sold", f.sales.sold]]) +
    funnelBlock("Rentals", [["Requested", f.rentals.requested], ["Approved", f.rentals.approved], ["Returned", f.rentals.completed]]);

  const s = d.speed;
  document.getElementById("speedList").innerHTML = [
    listRow("Typical time to first applicant", hours(s.hoursToFirstApplicant)),
    listRow("Typical time to choose a worker", hours(s.hoursToAssign)),
    listRow("Typical time to confirm a finished task", hours(s.hoursToConfirmCompletion)),
    listRow("Booking requests", s.bookingRequests.requested),
    listRow("…approved by the owner", s.bookingRequests.approved),
    listRow("…expired with no answer", s.bookingRequests.expired)
  ].join("");

  const t = d.trust;
  document.getElementById("trustList").innerHTML = [
    listRow("Reports made", t.reports.total),
    listRow("…resolved", t.reports.resolved),
    listRow("Task problems reported", t.disputes.opened),
    listRow("…settled", t.disputes.resolved),
    listRow("Typical time to settle", hours(t.disputes.averageHoursToResolve)),
    listRow("Content flagged / blocked", `${t.moderation.flagged} / ${t.moderation.blocked}`),
    listRow("Accounts suspended / banned", `${t.accounts.suspended} / ${t.accounts.banned}`)
  ].join("");

  const cats = d.listings.topCategories || [];
  document.getElementById("topCategories").innerHTML = cats.length
    ? cats.map((c) => listRow(`${escapeAnalyticsText(c.category)} <span class="analytics-kind">${escapeAnalyticsText(c.kind)}</span>`, c.count)).join("")
    : `<p class="analytics-hint">Nothing listed in this period.</p>`;
}

async function loadAnalytics() {
  const { from, to } = analyticsRange;
  document.getElementById("analyticsRefreshBtn").classList.add("spinning");
  try {
    const res = await apiRequest(`/admin/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    renderAnalytics(res.data);
    analyticsLoaded = true;
  } catch (err) {
    document.getElementById("analyticsKpis").innerHTML = errorState(err.message);
  } finally {
    document.getElementById("analyticsRefreshBtn").classList.remove("spinning");
  }
}

function loadAnalyticsOnce() {
  if (analyticsLoaded) return;
  analyticsRange = rangeFromPreset("30");
  loadAnalytics();
}

/* CSV download: needs the sign-in token, so fetch it as a file (a plain link can't send it). */
async function downloadReport() {
  const btn = document.getElementById("reportDownloadBtn");
  const type = document.getElementById("reportType").value;
  const { from, to } = analyticsRange;
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/exports/${type}?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("taskifyToken")}` }
    });
    if (!res.ok) {
      let message = "The report couldn't be downloaded.";
      try { message = (await res.json()).message || message; } catch { /* not JSON */ }
      throw new Error(message);
    }
    const blob = await res.blob();
    const name = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || `taskify-${type}.csv`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const rows = res.headers.get("x-row-count");
    showToast(rows === null ? `Downloaded ${name}.` : `Downloaded ${name} (${rows} rows).`);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("analyticsRange")?.addEventListener("change", (e) => {
  const custom = e.target.value === "custom";
  document.getElementById("analyticsCustom").hidden = !custom;
  if (custom) {
    document.getElementById("analyticsFrom").value = analyticsRange.from;
    document.getElementById("analyticsTo").value = analyticsRange.to;
    return;
  }
  analyticsRange = rangeFromPreset(e.target.value);
  loadAnalytics();
});

document.getElementById("analyticsApplyBtn")?.addEventListener("click", () => {
  const from = document.getElementById("analyticsFrom").value;
  const to = document.getElementById("analyticsTo").value;
  if (!from || !to) return showToast("Choose both dates.", "error");
  if (from > to) return showToast("The start date must be before the end date.", "error");
  analyticsRange = { from, to };
  loadAnalytics();
});

document.getElementById("analyticsRefreshBtn")?.addEventListener("click", loadAnalytics);
document.getElementById("analyticsPrintBtn")?.addEventListener("click", () => {
  document.body.classList.add("printing-analytics");
  window.print();
});
window.addEventListener("afterprint", () => document.body.classList.remove("printing-analytics"));
document.getElementById("reportDownloadBtn")?.addEventListener("click", downloadReport);
