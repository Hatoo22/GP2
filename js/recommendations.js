/* =========================================================
   SAFER ALTERNATIVES
   - "Instead of <game>" at the top
   - ranked list of low-risk games that share its genres,
     each showing how much lower the risk is
   - the selected alternative is compared behavior by behavior
   ========================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const note = $("recommendationNote");
  const layout = $("rxLayout");
  const listEl = $("rxList");
  const compareEl = $("rxCompare");

  const gameId = new URLSearchParams(location.search).get("game_id");

  const BEHAVIORS = [
    ["bullying", "Bullying"],
    ["hate_speech", "Hate speech"],
    ["threat", "Threats"],
    ["sexual_harassment", "Sexual harassment"],
    ["other_toxicity", "Other toxicity"]
  ];

  let current = null;
  let alternatives = [];
  let selected = 0;

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // some descriptions come from Steam already HTML-escaped (&quot;): decode first
  const decode = (v) => { const t = document.createElement("textarea"); t.innerHTML = String(v ?? ""); return t.value; };
  const genres = (v) => String(v || "").split(",").map((g) => g.trim()).filter(Boolean);
  const risk = (g) => Number(g.overall_risk_percent || 0);
  const color = (v) => (v >= 70 ? "#ef4444" : v >= 31 ? "#f59e0b" : "#22c55e");
  const levelOf = (g) => g.overall_risk_level || (risk(g) >= 70 ? "High" : risk(g) >= 31 ? "Medium" : "Low");

  // share of comments showing a behavior, same as the game page
  function share(g, key) {
    const total = Number(g.comments_count || 0);
    if (total <= 0) return 0;
    return Math.min(100, (Number(g[key] || 0) / total) * 100);
  }

  function shared(a, b) {
    const set = new Set(genres(b).map((x) => x.toLowerCase()));
    return genres(a).filter((x) => set.has(x.toLowerCase()));
  }

  /* ---------- render ---------- */
  function renderFrom() {
    $("rxFrom").hidden = false;
    $("rxFromImg").src = current.image_url || "images/default-game.jpg";
    $("rxFromName").textContent = current.game_name || "This game";
    const r = risk(current);
    $("rxFromRisk").innerHTML = `<b style="color:${color(r)}">${Math.round(r)}% risk</b> · ${esc(levelOf(current))} · ${esc(genres(current.genre).join(", "))}`;
    $("rxBack").href = `game-details.html?game_id=${encodeURIComponent(current.game_id)}`;
    document.title = `Safer than ${current.game_name} | DIR'A`;
  }

  function renderList() {
    listEl.innerHTML = alternatives.map((g, i) => {
      const drop = Math.max(0, Math.round(risk(current) - risk(g)));
      const same = shared(g.genre, current.genre);
      return `
        <li>
          <button type="button" class="rx-item${i === selected ? " is-active" : ""}" data-i="${i}" aria-pressed="${i === selected}">
            <span class="rx-rank">${i + 1}</span>
            <img src="${esc(g.image_url || "images/default-game.jpg")}" alt="" loading="lazy">
            <span class="rx-item-text">
              <strong>${esc(g.game_name)}</strong>
              <small>${same.length ? `Also ${esc(same.slice(0, 2).join(" · "))}` : esc(genres(g.genre).slice(0, 2).join(" · "))}</small>
            </span>
            <span class="rx-drop" title="${drop} points lower risk">${drop > 0 ? `↓ ${drop}%` : `${Math.round(risk(g))}%`}</span>
          </button>
        </li>`;
    }).join("");
  }

  function renderCompare() {
    const g = alternatives[selected];
    if (!g) return;
    const rc = risk(current), rg = risk(g);
    const drop = Math.max(0, Math.round(rc - rg));
    const same = shared(g.genre, current.genre);

    const rows = BEHAVIORS.map(([key, label]) => {
      const a = share(current, key), b = share(g, key);
      return `
        <li>
          <span class="rx-b-label">${label}</span>
          <span class="rx-b-bars">
            <span class="rx-bar rx-bar--from"><i style="--w:${a}%"></i><em>${Math.round(a)}%</em></span>
            <span class="rx-bar rx-bar--to"><i style="--w:${b}%"></i><em>${Math.round(b)}%</em></span>
          </span>
        </li>`;
    }).join("");

    compareEl.innerHTML = `
      <div class="rx-c-head">
        <img src="${esc(g.image_url || "images/default-game.jpg")}" alt="">
        <div>
          <h2>${esc(g.game_name)}</h2>
          <p>${esc(decode(g.description || ""))}</p>
          <div class="gx-tags">${genres(g.genre).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
        </div>
      </div>

      <div class="rx-c-score">
        <div class="rx-score">
          <span>${esc(current.game_name)}</span>
          <strong style="color:${color(rc)}">${Math.round(rc)}%</strong>
        </div>
        <div class="rx-arrow" aria-hidden="true">→</div>
        <div class="rx-score rx-score--to">
          <span>${esc(g.game_name)}</span>
          <strong style="color:${color(rg)}">${Math.round(rg)}%</strong>
        </div>
        <p class="rx-verdict">${drop > 0
          ? `<b>${drop} points lower risk</b>${same.length ? `, and it's also ${esc(same.join(", "))}.` : "."}`
          : "A low-risk game in a similar genre."}</p>
      </div>

      <div class="rx-c-break">
        <div class="rx-legend">
          <span><i class="rx-dot rx-dot--from"></i>${esc(current.game_name)}</span>
          <span><i class="rx-dot rx-dot--to"></i>${esc(g.game_name)}</span>
        </div>
        <ul class="rx-behaviors">${rows}</ul>
      </div>

      <div class="rx-c-actions">
        <a class="btn" href="game-details.html?game_id=${encodeURIComponent(g.game_id)}">Open ${esc(g.game_name)}</a>
        ${alternatives.length > 1 ? `<button type="button" class="gx-btn" id="rxNext">Next alternative</button>` : ""}
      </div>`;

    const next = $("rxNext");
    if (next) next.addEventListener("click", () => select((selected + 1) % alternatives.length, true));
  }

  function select(i, focusList) {
    selected = i;
    listEl.querySelectorAll(".rx-item").forEach((b, n) => {
      b.classList.toggle("is-active", n === i);
      b.setAttribute("aria-pressed", String(n === i));
    });
    renderCompare();
    if (focusList) listEl.querySelectorAll(".rx-item")[i]?.focus({ preventScroll: true });
    if (window.innerWidth < 900) compareEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  listEl.addEventListener("click", (e) => {
    const b = e.target.closest(".rx-item");
    if (b) select(Number(b.dataset.i));
  });
  listEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const n = alternatives.length;
    select((selected + (e.key === "ArrowDown" ? 1 : n - 1)) % n, true);
  });

  /* ---------- load ---------- */
  async function load() {
    if (!gameId) {
      note.textContent = "Open this page from a game's \"Safer alternative\" button.";
      return;
    }
    try {
      const [d1, d2] = await Promise.all([
        fetch(`api/game-details.php?game_id=${encodeURIComponent(gameId)}`).then((r) => r.json()),
        fetch("api/games.php").then((r) => r.json())
      ]);
      if (!d1.success || !d1.game) throw new Error("Couldn't load this game.");
      if (!d2.success) throw new Error("Couldn't load the games list.");

      current = d1.game;
      renderFrom();

      alternatives = (d2.games || [])
        .map((g) => ({ ...g, _shared: shared(g.genre, current.genre).length }))
        .filter((g) =>
          String(g.game_id) !== String(current.game_id) &&
          String(g.overall_risk_level || "").toLowerCase() === "low" &&
          g.analysis_status === "analyzed" && Number(g.comments_count || 0) > 0 &&
          g._shared > 0)
        .sort((a, b) => b._shared - a._shared || risk(a) - risk(b))
        .slice(0, 8);

      if (!alternatives.length) {
        note.innerHTML = `We couldn't find a low-risk game that shares a genre with <strong>${esc(current.game_name)}</strong> yet.`;
        return;
      }

      note.textContent = `${alternatives.length} low-risk ${alternatives.length === 1 ? "game" : "games"} in the same genre, best match first.`;
      layout.hidden = false;
      renderList();
      renderCompare();
    } catch (err) {
      note.textContent = err.message || "Couldn't load safer alternatives.";
    }
  }

  load();
})();
