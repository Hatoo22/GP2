/* =========================================================
   ADMIN: "Analyze games"
   - choose one game / games not analyzed yet / all games
   - the AI service runs it in the background; this page shows progress
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
  let pollTimer = null;
  let wasRunning = false;

  const nf = new Intl.NumberFormat("en-US");
  const mode = () => (modal.querySelector('input[name="anMode"]:checked') || {}).value || "one";

  // rough guide: about a minute per game on the AI service
  function durationText(n) {
    if (!n) return "";
    const min = Math.max(1, Math.round(n * 1));
    if (min < 60) return `about ${min} minute${min === 1 ? "" : "s"}`;
    const h = Math.round((min / 60) * 10) / 10;
    return `about ${h} hour${h === 1 ? "" : "s"}`;
  }

  async function api(method, query = "", body) {
    const res = await fetch(`api/admin-analyze.php${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    const data = await res.json().catch(() => ({ success: false, message: `Server error (HTTP ${res.status}).` }));
    return data;
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
        "It runs in the background, so you can leave this page; scores update one game at a time. " +
        "Each run also uses part of the daily YouTube quota.";
    } else if (m === "new" && n === 0 && counts) {
      warning.hidden = false;
      warning.textContent = "Every game is already analyzed.";
    } else {
      warning.hidden = true;
    }
    startBtn.disabled = m === "new" && counts && counts.new === 0;
  }

  async function openModal(preselect) {
    fillGames(preselect);
    if (preselect) modal.querySelector('input[value="one"]').checked = true;
    msg.textContent = "";
    modal.classList.add("show");
    updateWarning();
    const data = await api("GET", "?action=count");
    if (data.success) {
      counts = { new: data.new, all: data.all };
      $("anNewCount").textContent = `(${nf.format(data.new)})`;
      $("anAllCount").textContent = `(${nf.format(data.all)})`;
      updateWarning();
    } else {
      msg.textContent = data.message || "Couldn't reach the analysis service.";
    }
  }

  function closeModal() { modal.classList.remove("show"); }

  /* ---------- progress ---------- */
  function showJob(job) {
    if (!job || (!job.running && !job.finished_at)) { banner.hidden = true; return; }
    banner.hidden = false;
    const total = job.total || 0;
    const done = job.done || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("anBar").style.width = `${job.running ? Math.max(3, pct) : 100}%`;
    $("anStop").hidden = !job.running;

    if (job.running) {
      $("anTitle").textContent = job.mode === "one" ? "Analyzing the game…" : job.mode === "new" ? "Analyzing new games…" : "Analyzing all games…";
      $("anCount").textContent = total ? `${nf.format(done)} of ${nf.format(total)}` : "Starting…";
      $("anCurrent").textContent = job.current ? `Now: ${job.current}` : "Waiting for the AI service…";
      banner.classList.remove("is-done");
    } else {
      const r = job.result || {};
      banner.classList.add("is-done");
      $("anTitle").textContent = job.failed ? "The analysis stopped with an error" : r.stopped ? "Analysis stopped" : "Analysis finished";
      $("anCount").textContent = job.failed ? "" : `${nf.format(r.analyzed || 0)} analyzed · ${nf.format(r.no_comments || 0)} without comments${r.skipped ? ` · ${nf.format(r.skipped)} skipped` : ""}`;
      $("anCurrent").textContent = job.failed || (job.errors && job.errors.length ? `Last issue: ${job.errors[job.errors.length - 1]}` : "Refresh the page to see the new scores.");
    }
  }

  async function poll() {
    clearTimeout(pollTimer);
    const data = await api("GET", "?action=status");
    if (!data.success) {
      if (!data.not_configured) banner.hidden = true;
      return;
    }
    const job = data.job || {};
    showJob(job);
    if (job.running) {
      wasRunning = true;
      pollTimer = setTimeout(poll, 4000);
    } else if (wasRunning) {
      wasRunning = false;
      // reload the table so the new scores show up
      setTimeout(() => location.reload(), 2500);
    }
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

  startBtn.addEventListener("click", async () => {
    const m = mode();
    const body = { mode: m };
    if (m === "one") body.game_id = Number(select.value);
    // "all" needs a second click to confirm
    if (m === "all" && startBtn.dataset.confirm !== "1") {
      startBtn.dataset.confirm = "1";
      startBtn.textContent = "Yes, analyze all games";
      msg.textContent = "Click again to confirm.";
      return;
    }
    startBtn.dataset.confirm = "";
    startBtn.textContent = "Start analysis";

    startBtn.disabled = true;
    msg.textContent = "Starting…";
    const data = await api("POST", "", body);
    startBtn.disabled = false;
    if (!data.success) {
      msg.textContent = data.message || "Couldn't start the analysis.";
      if (data.job) { showJob(data.job); poll(); }
      return;
    }
    closeModal();
    showJob(data.job);
    wasRunning = true;
    pollTimer = setTimeout(poll, 3000);
  });

  $("anStop").addEventListener("click", async () => {
    $("anStop").disabled = true;
    await api("POST", "", { action: "stop" });
    $("anCurrent").textContent = "Stopping after the current game…";
    $("anStop").disabled = false;
  });

  // a run started earlier (or by another admin) is still going
  poll();
})();
