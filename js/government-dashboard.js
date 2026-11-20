/* =========================================================
   GOVERNMENT EMPLOYEE — DASHBOARD
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat("en-US");

  const RISK_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", new: "#94a3b8" };
  const SEVERITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

  // same weights the AI model uses for the overall score
  const RISK_WEIGHTS = {
    sexual_harassment: 0.266,
    hate_speech: 0.201,
    bullying: 0.195,
    threat: 0.182,
    other_toxicity: 0.156
  };
  const LABELS = {
    sexual_harassment: "Sexual harassment",
    hate_speech: "Hate speech",
    bullying: "Bullying",
    threat: "Threats",
    other_toxicity: "Other toxicity"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function timeAgo(value) {
    if (!value) return "";
    const d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d)) return "";
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const days = Math.floor(s / 86400);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const levelKey = (g) => {
    const l = String(g.overall_risk_level || "").toLowerCase();
    return Number(g.comments_count || 0) === 0 || l === "new" || !l ? "new" : l;
  };

  const pill = (text, color) =>
    `<span class="dsh-pill" style="--c:${color}">${escapeHtml(text)}</span>`;

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
    const res = await fetch("api/government-dashboard.php", { credentials: "same-origin" });
    data = await res.json();
    if (!data.success) throw new Error();
  } catch {
    document.querySelectorAll(".dsh-empty").forEach((el) => (el.textContent = "Couldn't load data."));
    return;
  }

  const s = data.summary;
  const games = data.games || [];

  /* ---------- KPIs ---------- */
  $("kpiPending").textContent = nf.format(s.pending_reports);
  $("kpiPendingSub").textContent = s.pending_reports > 0 ? "Need your review" : "Nothing waiting 🎉";
  if (s.pending_reports > 0) $("kpiPendingSub").classList.add("is-warn");

  $("kpiReviewing").textContent = nf.format(s.reviewing_reports);

  $("kpiResolved").textContent = nf.format(s.resolved_reports);
  $("kpiResolvedSub").textContent = s.total_reports
    ? `${Math.round((s.resolved_reports / s.total_reports) * 100)}% of all complaints`
    : "No complaints yet";

  $("kpiGames").textContent = nf.format(s.total_reported_games);
  $("kpiGamesSub").textContent = `${nf.format(s.high_risk_games)} high risk`;
  if (s.high_risk_games > 0) $("kpiGamesSub").classList.add("is-danger");

  /* ---------- games list ---------- */
  function gameRow(g, i) {
    const lvl = levelKey(g);
    return `
      <li class="dsh-item gd-game ${i === 0 ? "is-active" : ""}" data-id="${g.game_id}" tabindex="0" role="button">
        ${g.image_url
          ? `<img class="dsh-thumb" src="${escapeHtml(g.image_url)}" alt="" loading="lazy">`
          : `<span class="dsh-thumb dsh-thumb--empty"></span>`}
        <div class="dsh-item-main">
          <strong>${escapeHtml(g.game_name)}</strong>
          <span class="mini">${lvl === "new" ? "Not analyzed yet" : `${Number(g.overall_risk_percent).toFixed(2)}% risk score`}</span>
        </div>
        ${pill(lvl === "new" ? "New" : lvl.charAt(0).toUpperCase() + lvl.slice(1), RISK_COLORS[lvl])}
        <span class="dsh-count">${nf.format(g.report_count)}<small>${g.report_count === 1 ? "complaint" : "complaints"}</small></span>
      </li>`;
  }

  /* ---------- analysis card ---------- */
  function showAnalysis(g) {
    const lvl = levelKey(g);
    const total = Number(g.comments_count || 0);
    const rows = Object.keys(RISK_WEIGHTS).map((k) => {
      const raw = Number(g.breakdown?.[k] || 0);
      const value = total ? (raw / total) * 100 * RISK_WEIGHTS[k] : 0;
      return { k, value };
    }).sort((a, b) => b.value - a.value);
    const max = Math.max(1, ...rows.map((r) => r.value));

    $("gdAnalysis").innerHTML = `
      <div class="gd-hero">
        ${g.image_url ? `<img src="${escapeHtml(g.image_url)}" alt="">` : ""}
        <div class="gd-hero-shade"></div>
        <div class="gd-hero-text">
          <span class="gd-eyebrow">Risk analysis</span>
          <h2>${escapeHtml(g.game_name)}</h2>
        </div>
      </div>

      <div class="gd-overall">
        <div>
          <span class="gd-label">Overall risk</span>
          <strong>${lvl === "new" ? "—" : Number(g.overall_risk_percent).toFixed(2) + "%"}</strong>
        </div>
        ${pill(lvl === "new" ? "Not analyzed" : lvl.charAt(0).toUpperCase() + lvl.slice(1) + " risk", RISK_COLORS[lvl])}
      </div>

      <p class="gd-label">Contribution by behavior</p>
      ${rows.map((r) => `
        <div class="dsh-bar-row">
          <span class="dsh-bar-label">${LABELS[r.k]}</span>
          <span class="dsh-bar-track"><i style="width:${(r.value / max) * 100}%"></i></span>
          <span class="dsh-bar-value">${r.value.toFixed(1)}%</span>
        </div>`).join("")}

      <p class="mini gd-note">Based on ${nf.format(total)} analyzed player comments.</p>

      <a class="btn gd-cta" href="employee-complaints.html?game_id=${encodeURIComponent(g.game_id)}">
        Review ${nf.format(g.report_count)} ${g.report_count === 1 ? "complaint" : "complaints"} →
      </a>`;
  }

  const list = $("gdGames");
  const TOP = 6;          // games shown before "Show all"
  let expanded = false;

  function renderGames() {
    const activeId = list.querySelector(".gd-game.is-active")?.dataset.id ?? String(games[0]?.game_id);
    const shown = expanded ? games : games.slice(0, TOP);
    list.innerHTML = shown.map(gameRow).join("");
    list.querySelectorAll(".gd-game").forEach((li) => li.classList.toggle("is-active", li.dataset.id === activeId));

    const more = $("gdMore");
    if (games.length > TOP) {
      more.hidden = false;
      more.textContent = expanded ? "Show fewer" : `Show all ${games.length} games`;
    } else {
      more.hidden = true;
    }
  }

  if (games.length) {
    renderGames();
    showAnalysis(games[0]);
    $("gdMore").addEventListener("click", () => {
      expanded = !expanded;
      renderGames();
    });
  } else {
    list.innerHTML = `<li class="dsh-empty">No games have complaints yet.</li>`;
    $("gdAnalysis").innerHTML = `<div class="dsh-empty">Nothing to analyze yet.</div>`;
  }

  function selectGame(li) {
    const g = games.find((x) => String(x.game_id) === li.dataset.id);
    if (!g) return;
    list.querySelectorAll(".gd-game").forEach((x) => x.classList.toggle("is-active", x === li));
    showAnalysis(g);
  }

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".gd-game");
    if (li) selectGame(li);
  });
  list.addEventListener("keydown", (e) => {
    const li = e.target.closest(".gd-game");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectGame(li); }
  });

  /* ---------- complaints over time ---------- */
  const weekly = data.weekly || [];
  const maxW = Math.max(1, ...weekly.map((w) => w.total));
  $("gdWeeks").innerHTML = weekly.map((w, i) => {
    const d = new Date(w.week_start + "T00:00:00");
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const isNow = i === weekly.length - 1;
    return `
      <div class="gd-week ${isNow ? "is-now" : ""}" title="${w.total} complaints · week of ${label}">
        <span class="gd-week-val">${w.total || ""}</span>
        <span class="gd-week-bar" style="height:${Math.max(4, (w.total / maxW) * 100)}%"></span>
        <span class="gd-week-label">${isNow ? "This week" : label}</span>
      </div>`;
  }).join("");

  if (weekly.length >= 2) {
    const thisWeek = weekly[weekly.length - 1].total;
    const lastWeek = weekly[weekly.length - 2].total;
    const trend = $("gdTrend");
    if (thisWeek > lastWeek) { trend.textContent = `▲ ${thisWeek - lastWeek} vs last week`; trend.classList.add("is-up"); }
    else if (thisWeek < lastWeek) { trend.textContent = `▼ ${lastWeek - thisWeek} vs last week`; trend.classList.add("is-down"); }
    else { trend.textContent = "Same as last week"; }
  }

  /* ---------- what users are reporting ---------- */
  const behaviors = data.behaviors || [];
  const maxB = Math.max(1, ...behaviors.map((b) => b.total));
  $("gdBehaviors").innerHTML = behaviors.map((b) => `
    <div class="dsh-bar-row">
      <span class="dsh-bar-label">${escapeHtml(b.label)}</span>
      <span class="dsh-bar-track"><i style="width:${(b.total / maxB) * 100}%"></i></span>
      <span class="dsh-bar-value">${nf.format(b.total)}</span>
    </div>`).join("");

  const sev = data.severity || {};
  const sevTotal = (sev.high || 0) + (sev.medium || 0) + (sev.low || 0);
  const sevOrder = [["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  $("gdSeverityBar").innerHTML = sevTotal
    ? sevOrder.filter(([k]) => sev[k]).map(([k, l]) =>
        `<span style="flex:${sev[k]};background:${SEVERITY_COLORS[k]}" title="${l}: ${sev[k]}"></span>`).join("")
    : `<span style="flex:1;background:var(--line)"></span>`;
  $("gdSeverityLegend").innerHTML = sevOrder.map(([k, l]) => `
    <li><span class="dsh-dot" style="background:${SEVERITY_COLORS[k]}"></span>${l} <strong>${nf.format(sev[k] || 0)}</strong></li>`).join("");
});
