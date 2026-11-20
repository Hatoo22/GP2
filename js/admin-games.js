/* =========================================================
   ADMIN — GAMES MANAGEMENT
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);

  const tableBody = $("adminGamesTable");
  const searchInput = $("adminGameSearch");
  const sortSelect = $("adminSort");
  const tabs = $("agTabs");
  const pager = $("agPages");
  const showing = $("agShowing");

  const PAGE_SIZE = 12;
  const RISK_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", new: "#94a3b8" };

  let games = [];
  let filter = "all";
  let page = 1;

  const nf = new Intl.NumberFormat("en-US");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function levelOf(game) {
    const isNew =
      game.analysis_status !== "analyzed" ||
      Number(game.comments_count || 0) === 0 ||
      String(game.overall_risk_level || "").toLowerCase() === "new";
    return isNew ? "new" : String(game.overall_risk_level || "low").toLowerCase();
  }

  /* ---------- counts on tabs ---------- */
  function updateCounts() {
    const c = { all: games.length, low: 0, medium: 0, high: 0, new: 0 };
    games.forEach((g) => { c[levelOf(g)] = (c[levelOf(g)] || 0) + 1; });
    $("cntAll").textContent = nf.format(c.all);
    $("cntLow").textContent = nf.format(c.low);
    $("cntMedium").textContent = nf.format(c.medium);
    $("cntHigh").textContent = nf.format(c.high);
    $("cntNew").textContent = nf.format(c.new);
  }

  /* ---------- filter + sort ---------- */
  function getList() {
    const q = searchInput.value.trim().toLowerCase();
    let list = games.filter((g) => {
      const matchesTab = filter === "all" || levelOf(g) === filter;
      const hay = `${g.game_name || ""} ${g.genre || ""}`.toLowerCase();
      return matchesTab && (!q || hay.includes(q));
    });

    const risk = (g) => (levelOf(g) === "new" ? -1 : Number(g.overall_risk_percent || 0));
    const sorters = {
      newest: (a, b) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
        Number(b.game_id) - Number(a.game_id),
      riskHigh: (a, b) => risk(b) - risk(a),
      riskLow: (a, b) => {
        const ra = risk(a), rb = risk(b);
        if (ra === -1) return 1;
        if (rb === -1) return -1;
        return ra - rb;
      },
      nameAZ: (a, b) => String(a.game_name).localeCompare(String(b.game_name))
    };
    return list.sort(sorters[sortSelect.value] || sorters.newest);
  }

  /* ---------- row ---------- */
  function rowHtml(g) {
    const lvl = levelOf(g);
    const isNew = lvl === "new";
    const pct = Number(g.overall_risk_percent || 0);
    const color = RISK_COLORS[lvl] || RISK_COLORS.new;
    const genres = String(g.genre || "")
      .split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3);

    const image = g.image_url
      ? `<img class="ag-thumb" src="${escapeHtml(g.image_url)}" alt="" loading="lazy">`
      : `<span class="ag-thumb ag-thumb--empty">🎮</span>`;

    return `
      <tr>
        <td>
          <div class="ag-game">
            ${image}
            <div class="ag-game-text">
              <strong>${escapeHtml(g.game_name)}</strong>
              <div class="ag-genres">
                ${genres.length ? genres.map((x) => `<span>${escapeHtml(x)}</span>`).join("") : `<span>No genre</span>`}
              </div>
            </div>
          </div>
        </td>
        <td>
          ${isNew
            ? `<span class="ag-muted">—</span>`
            : `<div class="ag-score">
                 <span class="ag-score-track"><i style="width:${Math.min(100, pct)}%;background:${color}"></i></span>
                 <strong>${pct.toFixed(2)}%</strong>
               </div>`}
        </td>
        <td>
          <span class="dsh-pill" style="--c:${color}">${isNew ? "New" : escapeHtml(lvl.charAt(0).toUpperCase() + lvl.slice(1))}</span>
        </td>
        <td>
          <div class="ag-analysis">
            <span class="ag-status-dot ${isNew ? "is-off" : ""}"></span>
            <div>
              <span>${isNew ? "Not analyzed yet" : "Analyzed"}</span>
              <small>${isNew ? "Waiting for comments" : `${nf.format(Number(g.comments_count || 0))} comments`}</small>
            </div>
          </div>
        </td>
        <td class="ag-right">
          <button type="button" class="ag-view ag-analyze" data-id="${escapeHtml(g.game_id)}" title="Run the analysis for this game">Analyze</button>
          <a class="ag-view" href="game-details.html?game_id=${encodeURIComponent(g.game_id)}">View →</a>
        </td>
      </tr>`;
  }

  /* ---------- render ---------- */
  function render() {
    const list = getList();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages);

    const start = (page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = slice.length
      ? slice.map(rowHtml).join("")
      : `<tr><td colspan="5" class="dsh-empty">No games match your search.</td></tr>`;

    showing.textContent = list.length
      ? `Showing ${start + 1}–${start + slice.length} of ${nf.format(list.length)} games`
      : "";

    // compact pager: 1 … 4 5 6 … 16
    const nums = new Set([1, pages, page - 1, page, page + 1]);
    const visible = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    let html = `<button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`;
    visible.forEach((n, i) => {
      if (i && n - visible[i - 1] > 1) html += `<span class="ag-gap">…</span>`;
      html += `<button type="button" data-page="${n}" class="${n === page ? "is-active" : ""}">${n}</button>`;
    });
    html += `<button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Next page">›</button>`;
    pager.innerHTML = pages > 1 ? html : "";
  }

  /* ---------- events ---------- */
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".ag-tab");
    if (!btn) return;
    tabs.querySelectorAll(".ag-tab").forEach((t) => t.classList.toggle("is-active", t === btn));
    filter = btn.dataset.filter;
    page = 1;
    render();
  });

  searchInput.addEventListener("input", () => { page = 1; render(); });
  sortSelect.addEventListener("change", () => { page = 1; render(); });

  pager.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled) return;
    page = Number(btn.dataset.page);
    render();
    document.querySelector(".ag-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- load ---------- */
  try {
    const res = await fetch("api/games.php");
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Unable to load games.");
    games = data.games || [];
    window.diraAdminGames = games; // used by the Analyze window
    updateCounts();
    render();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5" class="dsh-empty">Unable to load games.</td></tr>`;
  }

  /* =========================================================
     ADD GAME MODAL (Steam search → add)
     ========================================================= */
  const addGameBtn = $("addGameBtn");
  const addGameModal = $("addGameModal");
  const closeAddGameModal = $("closeAddGameModal");
  const steamGameSearch = $("steamGameSearch");
  const searchSteamBtn = $("searchSteamBtn");
  const steamSearchResults = $("steamSearchResults");
  const steamSearchMessage = $("steamSearchMessage");

  const existingAppIds = () =>
    new Set(games.map((g) => String(g.api_game_id || "")).filter(Boolean));

  addGameBtn.addEventListener("click", () => {
    addGameModal.classList.add("show");
    steamGameSearch.focus();
  });

  closeAddGameModal.addEventListener("click", () => addGameModal.classList.remove("show"));

  addGameModal.addEventListener("click", (event) => {
    if (event.target === addGameModal) addGameModal.classList.remove("show");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") addGameModal.classList.remove("show");
  });

  // opened from Suggestions ("Find game"): open the Add Game window and search Steam
  const suggested = new URLSearchParams(location.search).get("add");
  if (suggested) {
    setTimeout(() => {
      addGameModal.classList.add("show");
      steamGameSearch.value = suggested;
      searchSteamGames();
      history.replaceState(null, "", location.pathname);
    }, 300);
  }

  async function searchSteamGames() {
    const query = steamGameSearch.value.trim();
    if (!query) {
      steamSearchMessage.textContent = "Please enter a game name.";
      return;
    }

    steamSearchMessage.textContent = "Searching Steam...";
    steamSearchResults.innerHTML = "";

    try {
      const response = await fetch(`api/admin-games.php?action=search&q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Unable to search Steam.");

      steamSearchMessage.textContent = "";
      if (!data.games.length) {
        steamSearchMessage.textContent = "No games found.";
        return;
      }

      const owned = existingAppIds();

      data.games.forEach((game) => {
        const already = owned.has(String(game.appid));
        const item = document.createElement("div");
        item.className = "admin-steam-result" + (already ? " is-added" : "");
        item.innerHTML = `
          ${game.image ? `<img src="${escapeHtml(game.image)}" alt="${escapeHtml(game.name)}">` : ""}
          <div class="admin-steam-result-info">
            <h3>${escapeHtml(game.name)}</h3>
            <p>Steam App ID: ${escapeHtml(game.appid)}</p>
          </div>
          ${already
            ? `<span class="ag-added">✓ Already on DIR'A</span>`
            : `<button class="btn steam-select-game" type="button" data-appid="${escapeHtml(game.appid)}">Select</button>`}
        `;
        steamSearchResults.appendChild(item);
      });
    } catch (error) {
      console.error(error);
      steamSearchMessage.textContent = "Unable to search Steam.";
    }
  }

  searchSteamBtn.addEventListener("click", searchSteamGames);
  steamGameSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchSteamGames();
  });

  steamSearchResults.addEventListener("click", async (event) => {
    const button = event.target.closest(".steam-select-game");
    if (!button) return;

    const appid = button.dataset.appid;
    if (!appid) return;

    // prevent double submissions while a request is running
    steamSearchResults.querySelectorAll(".steam-select-game").forEach((b) => (b.disabled = true));
    const originalText = button.textContent;
    button.textContent = "Adding...";
    steamSearchMessage.textContent = "Retrieving game information from Steam...";

    try {
      const response = await fetch("api/admin-games.php?action=add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Unable to add game.");

      steamSearchMessage.textContent = data.message;
      steamSearchResults.innerHTML = "";
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      console.error(error);
      steamSearchMessage.textContent = error.message || "Unable to add game.";
      steamSearchResults.querySelectorAll(".steam-select-game").forEach((b) => (b.disabled = false));
      button.textContent = originalText;
    }
  });
});
