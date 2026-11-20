/* =========================================================
   ADMIN: "Analyze games"
   - choose one game / games not analyzed yet / all games
   - this page sends the games to the server one at a time and shows progress
     (keep the page open until it finishes; Stop ends after the current game)
   ========================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const modal = $("analyzeModal");
  if (!modal) return;

  const banner = $("anBanner");
  const select = $("anGame");
  const msg = $("anMsg");
  const warning = $("anWarning");
  const startBtn = $("anStart");
  let counts = null;
  let running = false;
  let stopAsked = false;

  const nf = new Intl.NumberFormat("en-US");
  const mode = () => (modal.querySelector('input[name="anMode"]:checked') || {}).value || "one";

  // rough guide: about a minute per game
  function durationText(n) {
    if (!n) return "";
    const min = Math.max(1, Math.round(n * 1));
    if (min < 60) return `about ${min} minute${min === 1 ? "" : "s"}`;
    const h = Math.round((min / 60) * 10) / 10;
    return `about ${h} hour${h === 1 ? "" : "s"}`;
  }

  async function api(method, query = "", body) {
    try {
      const res = await fetch(`api/admin-analyze.php${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
      return await res.json().catch(() => ({ success: false, message: `Server error (HTTP ${res.status}).` }));
    } catch {
      return { success: false, stop: true, message: "Couldn't reach the website. Check your connection." };
    }
  }

  function fillGames(preselect) {
    const games = (window.diraAdminGames || []).slice().sort((a, b) => String(a.game_name).localeCompare(String(b.game_name)));
    select.innerHTML = games.map((g) =>
      `<option value="${g.game_id}">${String(g.game_name || "Game").replace(/</g, "&lt;")}</option>`).join("");
    if (preselect) select.value = String(preselect);
  }

  function updateWarning() {
    const m = mode();
    startBtn.dataset.confirm = "";
    startBtn.textContent = "Start analysis";
    select.disabled = m !== "one";
    let n = 1;
    if (m === "new") n = counts ? counts.new : 0;
    if (m === "all") n = counts ? counts.all : 0;
    if (m === "all" || (m === "new" && n > 5)) {
      warning.hidden = false;
      warning.textContent = `This will analyze ${nf.format(n)} games and take ${durationText(n)}. ` +
        "Keep this page open until it finishes; scores update one game at a time and Stop ends after the current game. " +
        "Each run also uses part of the daily YouTube quota.";
    } else if (m === "new" && n === 0 && counts) {
      warning.hidden = false;
      warning.textContent = "Every game is already analyzed.";
    } else {
      warning.hidden = true;
    }
    startBtn.disabled = running || (m === "new" && counts && counts.new === 0);
  }

  async function openModal(preselect) {
    fillGames(preselect);
    if (preselect) modal.querySelector('input[value="one"]').checked = true;
    msg.textContent = running ? "An analysis is already running." : "";
    modal.classList.add("show");
    updateWarning();
    const data = await api("GET", "?action=count");
    if (data.success) {
      counts = { new: data.new, all: data.all };
      $("anNewCount").textContent = `(${nf.format(data.new)})`;
      $("anAllCount").textContent = `(${nf.format(data.all)})`;
      if (!data.connected) msg.textContent = "The analysis service is not connected yet (AI_API_URL is missing).";
      updateWarning();
    } else {
      msg.textContent = data.message || "Couldn't load the games.";
    }
  }

  function closeModal() { modal.classList.remove("show"); }

  /* ---------- progress banner ---------- */
  function showProgress(title, done, total, current) {
    banner.hidden = false;
    banner.classList.remove("is-done");
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("anBar").style.width = `${Math.max(3, pct)}%`;
    $("anStop").hidden = false;
    $("anTitle").textContent = title;
    $("anCount").textContent = total ? `${nf.format(done)} of ${nf.format(total)}` : "Starting…";
    $("anCurrent").textContent = current;
  }

  function showDone(title, summary, note) {
    banner.hidden = false;
    banner.classList.add("is-done");
    $("anBar").style.width = "100%";
    $("anStop").hidden = true;
    $("anTitle").textContent = title;
    $("anCount").textContent = summary;
    $("anCurrent").textContent = note;
  }

  // leaving the page would stop the run
  function guardLeave(e) {
    if (!running) return;
    e.preventDefault();
    e.returnValue = "";
  }
  window.addEventListener("beforeunload", guardLeave);

  async function run(m, gameId) {
    running = true;
    stopAsked = false;
    const title = m === "one" ? "Analyzing the game…" : m === "new" ? "Analyzing new games…" : "Analyzing all games…";
    showProgress(title, 0, 0, "Getting the list of games…");

    const q = m === "one" ? `?action=list&mode=one&game_id=${encodeURIComponent(gameId)}` : `?action=list&mode=${m}`;
    const list = await api("GET", q);
    if (!list.success) {
      running = false;
      showDone("The analysis couldn't start", "", list.message || "Couldn't load the games.");
      return;
    }

    const games = list.games || [];
    const r = { analyzed: 0, no_comments: 0, skipped: 0, failed: 0 };
    let lastIssue = "";
    let fatal = "";

    for (let i = 0; i < games.length; i++) {
      if (stopAsked) break;
      const g = games[i];
      showProgress(title, i, games.length, `Now: ${g.game_name} (the first one can take longer while the AI service wakes up)`);

      const res = await api("POST", "", { action: "run", game_id: g.game_id });
      if (res.success) {
        if (res.status === "analyzed") r.analyzed++;
        else if (res.status === "no_comments") r.no_comments++;
        else if (res.status === "skipped") { r.skipped++; lastIssue = `${g.game_name}: ${res.message}`; }
      } else {
        r.failed++;
        lastIssue = `${g.game_name}: ${res.message || "failed"}`;
        // the AI service is down or not connected: no point trying the rest
        if (res.stop) { fatal = res.message || "The analysis service didn't answer."; break; }
      }
    }

    running = false;
    const summary = `${nf.format(r.analyzed)} analyzed · ${nf.format(r.no_comments)} without comments` +
      (r.skipped ? ` · ${nf.format(r.skipped)} skipped` : "") + (r.failed ? ` · ${nf.format(r.failed)} failed` : "");
    if (fatal) showDone("The analysis stopped with an error", summary, fatal);
    else if (stopAsked) showDone("Analysis stopped", summary, "Reloading to show the new scores…");
    else showDone("Analysis finished", summary, lastIssue ? `Last issue: ${lastIssue}` : "Reloading to show the new scores…");

    if (!fatal && (r.analyzed || r.no_comments)) setTimeout(() => location.reload(), lastIssue ? 6000 : 2500);
  }

  /* ---------- events ---------- */
  $("analyzeBtn").addEventListener("click", () => openModal());
  $("closeAnalyzeModal").addEventListener("click", closeModal);
  $("anCancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  modal.querySelectorAll('input[name="anMode"]').forEach((r) => r.addEventListener("change", updateWarning));
  select.addEventListener("focus", () => { modal.querySelector('input[value="one"]').checked = true; updateWarning(); });

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".ag-analyze");
    if (b) openModal(b.dataset.id);
  });

  startBtn.addEventListener("click", () => {
    if (running) return;
    const m = mode();
    // "all" needs a second click to confirm
    if (m === "all" && startBtn.dataset.confirm !== "1") {
      startBtn.dataset.confirm = "1";
      startBtn.textContent = "Yes, analyze all games";
      msg.textContent = "Click again to confirm.";
      return;
    }
    startBtn.dataset.confirm = "";
    startBtn.textContent = "Start analysis";
    closeModal();
    run(m, select.value);
  });

  $("anStop").addEventListener("click", () => {
    stopAsked = true;
    $("anStop").hidden = true;
    $("anCurrent").textContent = "Stopping after the current game…";
  });
})();
