const welcomeName = document.getElementById("welcomeName");
const trackedCount = document.getElementById("trackedCount");
const alertsCount = document.getElementById("alertsCount");
const reportsReviewCount = document.getElementById("reportsReviewCount");
const submittedReportsCount = document.getElementById("submittedReportsCount");
const recentGames = document.getElementById("recentGames");
const homeSearch = document.getElementById("homeSearch");

let recentGamesList = [];

function card(game) {
  const isNew = game.analysis_status !== "analyzed" || Number(game.comments_count || 0) === 0;
const riskClass = isNew ? "new-pill" : `risk-${String(game.overall_risk_level || "Low").toLowerCase()}`;
  
  return `
    <article class="card marquee-card">
      <div class="top-pills">
  ${isNew ? "" : `<span class="pill">${diraPct(game.overall_risk_percent)} Risk</span>`}
  <span class="pill ${riskClass}">
    ${isNew ? "New" : (game.overall_risk_level ?? "Low")}
  </span>
</div>

      ${game.image_url 
  ? `<img class="thumb" src="${game.image_url}" alt="${game.game_name}">`
  : `<div class="thumb placeholder"></div>`
}

      <h3>${game.game_name}</h3>
      <p class="mini">${game.description ?? ""}</p>

      <div class="tags">
  ${(game.genre || "")
    .split(",")
    .map(g => `<span class="tag">${g.trim()}</span>`)
    .join("")}
</div>

      <br>

            <div class="cardActions">
        <a class="btn" href="game-details.html?game_id=${game.game_id}">
          View Details
        </a>
      </div>
    </article>
  `;
}

function renderGames(list, loop = true) {
  if (list.length === 0) {
    renderMarquee(recentGames, `<p class="mini">No games found.</p>`, 0, false);
    return;
  }

  const html = list.map(card).join("");
  renderMarquee(recentGames, loop ? html + html + html : html, list.length, loop);
}

async function loadHome() {
  try {
    const res = await fetch("api/home.php");
    const data = await res.json();

    if (!data.success) {
      welcomeName.textContent = "Hello!";
      recentGames.innerHTML = `<p class="mini">${data.message}</p>`;
      return;
    }

    welcomeName.textContent = `Hello ${data.user.name}!`;

    trackedCount.textContent = data.stats.tracked_games;
    alertsCount.textContent = data.stats.active_alerts;
    reportsReviewCount.textContent = data.stats.reports_in_review;
    submittedReportsCount.textContent = data.stats.submitted_reports;

    recentGamesList = data.recent_games || [];
    renderGames(recentGamesList);

  } catch (error) {
    recentGames.innerHTML = `<p class="mini">Cannot load home data.</p>`;
  }
}

if (homeSearch) homeSearch.addEventListener("input", async function () {
  const value = this.value.trim();

  if (value === "") {
    recentGames.classList.remove("is-searching");
    renderGames(recentGamesList);
    return;
  }

  recentGames.classList.add("is-searching");

  const res = await fetch(`api/search-games.php?q=${encodeURIComponent(value)}`);
  const data = await res.json();

  renderGames(data.games || [], false);
});

loadHome();

/* =========================================================
   HOME (signed in): spotlight banner
   Four games (they change every week, a game from the user's list
   first). Each plays its Steam trailer (or screenshots) for a while,
   with its risk, then the next one comes up.
   ========================================================= */
(() => {
  const hero = document.getElementById("spotHero");
  if (!hero) return;
  const $ = (id) => document.getElementById(id);

  const COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
  const LABELS = [
    ["bullying", "Bullying"], ["hate_speech", "Hate speech"], ["threat", "Threats"],
    ["sexual_harassment", "Sexual harassment"], ["other_toxicity", "Other toxicity"]
  ];
  const STAY = 12000; // ms per game
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v) => (typeof diraPct === "function" ? diraPct(v) : `${Math.round(Number(v) || 0)}%`);
  const levelColor = (v) => (v >= 70 ? COLORS.high : v >= 31 ? COLORS.medium : COLORS.low);

  const video = $("spotVideo");
  const poster = $("spotPoster");
  const shotsBox = $("spotShots");
  const bar = $("spotBar");
  bar.innerHTML = "<i></i>".repeat(10);
  hero.style.setProperty("--spot-time", `${STAY / 1000}s`);

  let games = [];
  let current = -1;
  let timer = null;
  let left = STAY;
  let startedAt = 0;
  let hls = null;
  let shotTimer = null;
  let token = 0;

  /* ---------- trailers ---------- */
  let hlsLib = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLib) {
      hlsLib = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
        s.onload = () => resolve(window.Hls);
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return hlsLib;
  }

  function stopMedia() {
    clearInterval(shotTimer);
    if (hls) { hls.destroy(); hls = null; }
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.classList.remove("is-on");
    shotsBox.classList.remove("is-on");
  }

  function startShots(shots) {
    if (!shots || !shots.length) return;
    shotsBox.innerHTML = shots.map((u, n) => `<img src="${esc(u)}" alt=""${n === 0 ? ' class="is-on"' : ""}>`).join("");
    shotsBox.classList.add("is-on");
    let n = 0;
    shotTimer = setInterval(() => {
      const imgs = shotsBox.children;
      imgs[n].classList.remove("is-on");
      n = (n + 1) % imgs.length;
      imgs[n].classList.add("is-on");
    }, 3500);
  }

  async function playMedia(m) {
    const my = ++token;
    stopMedia();
    m = m || {};
    const still = m.poster || (m.shots && m.shots[0]) || "";
    hero.classList.toggle("has-media", !!still);
    if (still) { poster.src = still; poster.classList.add("is-on"); } else { poster.classList.remove("is-on"); }

    if (m.video) {
      video.addEventListener("loadedmetadata", () => { try { if (video.duration > 20) video.currentTime = 6; } catch (e) { /* ignore */ } }, { once: true });
      video.addEventListener("playing", () => { if (my === token) video.classList.add("is-on"); }, { once: true });
      try {
        if (m.type === "hls") {
          const Hls = await loadHls().catch(() => null);
          if (my !== token) return;
          if (Hls && Hls.isSupported()) {
            hls = new Hls({ capLevelToPlayerSize: true, startLevel: 0, maxBufferLength: 12 });
            hls.loadSource(m.video);
            hls.attachMedia(video);
          } else {
            video.src = m.video;
          }
        } else {
          video.src = m.video;
        }
        await Promise.race([video.play(), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 8000))]);
        return;
      } catch (e) {
        if (my !== token) return;
        stopMedia();
      }
    }
    startShots(m.shots);
  }

  /* ---------- one game ---------- */
  function render(g) {
    const color = COLORS[g.level] || COLORS.low;
    hero.style.setProperty("--spot-c", color);
    $("spotKicker").textContent = g.inListFirst ? "From your list" : "Spotlight this week";
    $("spotName").textContent = g.name;
    const filled = g.percent <= 0 ? 0 : Math.max(1, Math.ceil(g.percent / 10));
    [...bar.children].forEach((seg, n) => seg.classList.toggle("on", n < filled));
    $("spotLevel").textContent = `${pct(g.percent)} · ${g.level.charAt(0).toUpperCase() + g.level.slice(1)} risk`;
    $("spotView").href = `game-details.html?game_id=${encodeURIComponent(g.id)}`;
  }

  function show(i) {
    if (!games.length) return;
    i = (i + games.length) % games.length;
    current = i;
    const g = games[i];
    $("spotQueue").querySelectorAll("button").forEach((b, n) => {
      b.setAttribute("aria-current", n === i ? "true" : "false");
      // restart the progress line
      const line = b.querySelector(".spot-progress i");
      line.style.animation = "none";
      void line.offsetWidth;
      line.style.animation = "";
    });
    hero.classList.add("is-switching");
    setTimeout(() => {
      render(g);
      hero.classList.remove("is-switching");
    }, 250);
    playMedia(g.media);
    schedule(STAY);
  }

  /* ---------- timing (pauses while the visitor is searching or the tab is hidden) ---------- */
  function schedule(ms) {
    clearTimeout(timer);
    left = ms;
    startedAt = Date.now();
    if (!hero.classList.contains("is-paused")) timer = setTimeout(() => show(current + 1), ms);
  }
  function pause() {
    if (hero.classList.contains("is-paused")) return;
    hero.classList.add("is-paused");
    clearTimeout(timer);
    left = Math.max(0, left - (Date.now() - startedAt));
    video.pause();
  }
  function resume() {
    if (!hero.classList.contains("is-paused")) return;
    hero.classList.remove("is-paused");
    if (video.classList.contains("is-on")) video.play().catch(() => {});
    schedule(left || STAY);
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
  if ($("homeSearch")) {
    $("homeSearch").addEventListener("focus", pause);
    $("homeSearch").addEventListener("blur", resume);
  }

  $("spotQueue").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) show(Number(b.dataset.i));
  });

  /* ---------- load ---------- */
  async function load() {
    try {
      const data = await fetch("api/home-spotlight.php", { cache: "no-store" }).then((r) => r.json());
      const list = (data && data.games) || [];
      const media = await Promise.all(list.map((g) =>
        fetch(`api/game-media.php?game_id=${encodeURIComponent(g.game_id)}`, { cache: "no-cache" }).then((r) => r.json()).catch(() => null)));
      games = list.map((g, i) => {
        const total = Number(g.comments_count || 0);
        return {
          id: g.game_id,
          name: g.game_name,
          image: g.image_url,
          genre: String(g.genre || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 2).join(" · "),
          percent: Number(g.overall_risk_percent || 0),
          level: String(g.overall_risk_level || "Low").toLowerCase(),
          inList: !!g.in_list,
          inListFirst: i === 0 && !!g.in_list,
          media: media[i],
          behaviors: LABELS
            .map(([k, label]) => ({ label, value: total > 0 ? (Number(g[k] || 0) / total) * 100 : 0 }))
            .filter((b) => b.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
        };
      });
    } catch {
      games = [];
    }

    if (!games.length) {
      $("spotFeature").hidden = true;
      return;
    }

    $("spotQueue").innerHTML = games.map((g, i) => `
      <li><button type="button" data-i="${i}" aria-current="false" style="--c:${COLORS[g.level] || COLORS.low}">
        ${g.image ? `<img src="${esc(g.image)}" alt="">` : ""}
        <span><strong>${esc(g.name)}</strong><small>${esc(g.genre || "Game")}</small>
        <span class="spot-progress"><i></i></span></span>
      </button></li>`).join("");

    show(0);
  }

  load();
})();
