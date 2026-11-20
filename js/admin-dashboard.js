/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  const RISK_COLORS = {
    Low: "#22c55e",
    Medium: "#f59e0b",
    High: "#ef4444",
    New: "#94a3b8"
  };

  const STATUS_COLORS = {
    pending: "#f59e0b",
    reviewing: "#3b82f6",
    reviewed: "#3b82f6",
    resolved: "#22c55e",
    closed: "#22c55e",
    rejected: "#94a3b8"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const nf = new Intl.NumberFormat("en-US");

  const svg = (p) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON_GAME = svg('<rect x="2" y="6" width="20" height="12" rx="6"/><path d="M6 12h4"/><path d="M8 10v4"/><circle cx="15.5" cy="11" r="0.6" fill="currentColor"/><circle cx="17.5" cy="13" r="0.6" fill="currentColor"/>');
  const ICON_IDEA = svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>');

  function timeAgo(value) {
    if (!value) return "";
    const d = diraDate(value);
    if (isNaN(d)) return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  /* ---------- header ---------- */
  const hour = new Date().getHours();
  $("adGreeting").textContent =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  $("adToday").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  /* ---------- load ---------- */
  let data;
  try {
    const res = await fetch("api/admin-dashboard.php", { credentials: "same-origin" });
    data = await res.json();
    if (!data.success) throw new Error();
  } catch {
    document.querySelectorAll(".dsh-empty").forEach((el) => (el.textContent = "Couldn't load data."));
    return;
  }

  /* ---------- KPIs ---------- */
  const s = data.summary;
  $("kpiGames").textContent = nf.format(s.total_games);
  $("kpiGamesSub").textContent = `${nf.format(s.analyzed_games)} analyzed`;

  $("kpiUsers").textContent = nf.format(s.total_users);
  $("kpiUsersSub").textContent = s.new_users_month > 0
    ? `+${nf.format(s.new_users_month)} in the last 30 days`
    : "No new users in 30 days";

  $("kpiEmployees").textContent = nf.format(s.total_employees);
  if (s.pending_employees > 0) {
    $("kpiEmployeesSub").textContent = `${nf.format(s.pending_employees)} awaiting your approval`;
    $("kpiEmployeesSub").classList.add("is-warn");
  } else {
    $("kpiEmployeesSub").textContent = "All accounts approved";
  }

  $("kpiReports").textContent = nf.format(s.total_reports);
  $("kpiReportsSub").textContent = s.pending_reports > 0
    ? `${nf.format(s.pending_reports)} pending review`
    : "All reports reviewed";
  if (s.pending_reports > 0) $("kpiReportsSub").classList.add("is-warn");

  /* ---------- risk donut ---------- */
  const risk = data.risk;
  const order = ["Low", "Medium", "High", "New"];
  const totalGames = order.reduce((a, k) => a + (risk[k] || 0), 0);
  $("riskTotal").textContent = nf.format(totalGames);

  let acc = 0;
  const stops = order.map((k) => {
    const pct = totalGames ? (risk[k] / totalGames) * 100 : 0;
    const from = acc;
    acc += pct;
    return `${RISK_COLORS[k]} ${from}% ${acc}%`;
  });
  $("riskDonut").style.background = totalGames
    ? `conic-gradient(${stops.join(",")})`
    : "var(--line)";

  const labels = { Low: "Low risk", Medium: "Medium risk", High: "High risk", New: "Not analyzed yet" };
  $("riskLegend").innerHTML = order.map((k) => {
    const pct = totalGames ? Math.round((risk[k] / totalGames) * 100) : 0;
    return `
      <li>
        <span class="dsh-dot" style="background:${RISK_COLORS[k]}"></span>
        <span class="dsh-legend-label">${labels[k]}</span>
        <span class="dsh-legend-value">${nf.format(risk[k] || 0)}</span>
        <span class="dsh-legend-pct">${pct}%</span>
      </li>`;
  }).join("");

  /* ---------- reports by status ---------- */
  const statuses = data.report_status || [];
  const totalReports = statuses.reduce((a, r) => a + r.total, 0);
  const colorFor = (st) => STATUS_COLORS[String(st).toLowerCase()] || "#a78bfa";

  if (totalReports) {
    $("statusBar").innerHTML = statuses.map((r) =>
      `<span style="flex:${r.total};background:${colorFor(r.status)}" title="${escapeHtml(r.status)}: ${r.total}"></span>`
    ).join("");
    $("statusLegend").innerHTML = statuses.map((r) => `
      <li><span class="dsh-dot" style="background:${colorFor(r.status)}"></span>
      ${escapeHtml(r.status)} <strong>${nf.format(r.total)}</strong></li>`).join("");
  } else {
    $("statusBar").innerHTML = `<span style="flex:1;background:var(--line)"></span>`;
    $("statusLegend").innerHTML = `<li>No reports yet</li>`;
  }

  /* ---------- behaviors ---------- */
  const behaviors = data.behaviors || [];
  const maxB = Math.max(1, ...behaviors.map((b) => b.total));
  $("behaviorBars").innerHTML = `
    <p class="dsh-subtitle">Most reported behaviors</p>
    ${behaviors.map((b) => `
      <div class="dsh-bar-row">
        <span class="dsh-bar-label">${escapeHtml(b.label)}</span>
        <span class="dsh-bar-track"><i style="width:${(b.total / maxB) * 100}%"></i></span>
        <span class="dsh-bar-value">${nf.format(b.total)}</span>
      </div>`).join("")}`;

  /* ---------- needs attention ---------- */
  const top = data.top_games || [];
  $("topGames").innerHTML = top.length
    ? top.map((g) => {
        const isNew = g.analysis_status !== "analyzed" || Number(g.comments_count) === 0;
        const level = isNew ? "New" : (g.overall_risk_level || "Low");
        const key = level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
        return `
          <li class="dsh-item">
            ${g.image_url
              ? `<img class="dsh-thumb" src="${escapeHtml(g.image_url)}" alt="">`
              : `<span class="dsh-thumb dsh-thumb--empty"></span>`}
            <div class="dsh-item-main">
              <strong>${escapeHtml(g.game_name)}</strong>
              <span class="mini">${isNew ? "Not analyzed yet" : `${Number(g.overall_risk_percent || 0)}% risk score`}</span>
            </div>
            <span class="dsh-pill" style="--c:${RISK_COLORS[key] || RISK_COLORS.New}">${escapeHtml(key)}</span>
            <span class="dsh-count">${nf.format(g.reports)}<small>reports</small></span>
          </li>`;
      }).join("")
    : `<li class="dsh-empty">No reported games yet 🎉</li>`;

  /* ---------- suggestions ---------- */
  const sug = data.suggestions || [];
  if (data.new_suggestions > 0) {
    $("newSuggestions").hidden = false;
    $("newSuggestions").textContent = `${data.new_suggestions} new`;
  }
  $("latestSuggestions").innerHTML = sug.length
    ? sug.map((f) => {
        const isGame = f.type === "game_suggestion";
        return `
          <li class="dsh-item dsh-item--suggestion">
            <span class="dsh-sug-icon">${isGame ? ICON_GAME : ICON_IDEA}</span>
            <div class="dsh-item-main">
              <strong>${escapeHtml(f.message)}</strong>
              <span class="mini">${isGame ? "Game suggestion" : "Suggestion"} · ${escapeHtml(f.user_name || "User")} · ${timeAgo(f.created_at)}</span>
            </div>
            ${f.status === "new" ? `<span class="dsh-new-dot" title="New"></span>` : ""}
          </li>`;
      }).join("")
    : `<li class="dsh-empty">No suggestions yet. They'll appear here when users send them through the assistant.</li>`;
});
