const track = document.getElementById("featuredGamesTrack");

function card(game) {
  const isNew = game.analysis_status !== "analyzed" || Number(game.comments_count || 0) === 0;
const riskClass = isNew ? "new-pill" : `risk-${String(game.overall_risk_level || "Low").toLowerCase()}`;
  return `
    <article class="card marquee-card">
      <div class="top-pills">
  ${isNew ? "" : `<span class="pill">${game.overall_risk_percent ?? 0}% Risk</span>`}
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

      <div class="cardActions">
        <a class="btn" href="signup.html">
          View Details
        </a>
      </div>
    </article>
  `;
}

async function loadFeaturedGames() {
  const res = await fetch("api/main-home.php");
  const data = await res.json();

  if (!data.success) {
    track.innerHTML = `<p class="mini">Cannot load games.</p>`;
    return;
  }

  const games = data.games || [];
  const html = games.map(card).join("");
  renderMarquee(track, html + html + html, games.length, true);

  startPicks(data.showcase || []);
}

loadFeaturedGames();

/* =========================================================
   HERO: three real games (low / medium / high). Pointing at
   one makes the guardian react to that game's risk level.
   ========================================================= */
function startPicks(showcase) {
  const wrap = document.getElementById("mhPicks");
  const list = document.getElementById("mhPicksList");
  if (!wrap || !list) return;
  if (!showcase.length) {
    wrap.hidden = true;
    return;
  }

  const COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  list.innerHTML = showcase.map((g) => {
    const level = String(g.overall_risk_level || "Low").toLowerCase();
    const pct = Number(g.overall_risk_percent || 0);
    return `
      <a class="mh-pick" href="signup.html" data-level="${level}" style="--risk:${COLORS[level] || COLORS.low}">
        <img src="${esc(g.image_url)}" alt="">
        <div class="mh-pick-body">
          <strong>${esc(g.game_name)}</strong>
          <div class="mh-pick-row">
            <span class="mh-pick-meter"><i style="--w:${Math.max(3, Math.min(100, pct))}%"></i></span>
            <span class="mh-pick-pct">${pct.toFixed(0)}%</span>
          </div>
        </div>
        <span class="mh-pick-level">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
      </a>`;
  }).join("");

  let current = null;

  function react(card) {
    if (card === current) return;
    current = card;
    list.querySelectorAll(".mh-pick").forEach((c) => c.classList.toggle("is-active", c === card));
    wrap.classList.toggle("has-active", !!card);
    if (!card) {
      try {
        if (typeof clearHighTimers === "function") clearHighTimers();
        highReactionRunning = false;
      } catch (e) { /* ignore */ }
      if (typeof guardianIdle === "function") guardianIdle();
      return;
    }
    // stop an unfinished "high risk" panic so the new reaction shows right away
    try {
      if (typeof clearHighTimers === "function") clearHighTimers();
      highReactionRunning = false; // shared with guardian.js
    } catch (e) { /* guardian.js not loaded */ }
    if (typeof guardianIdle === "function") guardianIdle();
    if (typeof guardianReact === "function") guardianReact(card.dataset.level);
  }

  list.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".mh-pick");
    if (card) react(card);
  });
  list.addEventListener("mouseleave", () => react(null));
  list.addEventListener("focusin", (e) => {
    const card = e.target.closest(".mh-pick");
    if (card) react(card);
  });
  list.addEventListener("focusout", (e) => {
    if (!list.contains(e.relatedTarget)) react(null);
  });

  // fill the meters once the cards are on screen
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add("is-ready")));
}

/* =========================================================
   HOW IT WORKS: the guardian travels down the line as you
   scroll. Each step appears when he reaches it and hides
   again when you scroll back up.
   ========================================================= */
(function initJourney() {
  const journey = document.getElementById("mhJourney");
  if (!journey) return;

  const fill = document.getElementById("mhRailFill");
  const bot = journey.querySelector(".mh-rail-bot");
  const head = bot.querySelector(".guardian-head-wrap");
  const eyes = [...bot.querySelectorAll(".guardian-eye")];
  const steps = [...journey.querySelectorAll(".mh-step")];

  let ticking = false;
  let lastReached = -1;

  /* ---- scroll: move the guardian and reveal steps ---- */
  function update() {
    ticking = false;
    const rect = journey.getBoundingClientRect();
    const vh = window.innerHeight;

    const anchor = vh * 0.6;
    const progress = Math.min(1, Math.max(0, (anchor - rect.top) / rect.height));
    const y = progress * rect.height;

    fill.style.height = y + "px";
    bot.style.setProperty("--y", y + "px");

    let reached = -1;
    steps.forEach((step, i) => {
      const visible = y >= step.offsetTop + 20;
      step.classList.toggle("is-visible", visible);
      if (visible) reached = i;
    });

    // happy little nod when he arrives at a new step
    if (reached > lastReached && reached >= 0) {
      bot.classList.remove("guardian-low");
      void bot.offsetWidth;
      bot.classList.add("guardian-low");
      clearTimeout(bot._nodTimer);
      bot._nodTimer = setTimeout(() => bot.classList.remove("guardian-low"), 900);
    }
    lastReached = reached;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  /* ---- mouse: head and eyes follow the cursor ---- */
  document.addEventListener("mousemove", (e) => {
    const r = bot.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.3;
    const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / 400));
    const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / 300));
    head.style.transform = `translate(${nx * 5}px, ${ny * 4}px) rotate(${nx * 7}deg)`;
    eyes.forEach((eye) => { eye.style.transform = `translate(${nx * 5}px, ${ny * 3}px)`; });
  });

  /* ---- natural blinking ---- */
  (function blink() {
    eyes.forEach((eye) => eye.classList.add("guardian-blink"));
    setTimeout(() => eyes.forEach((eye) => eye.classList.remove("guardian-blink")), 130);
    setTimeout(blink, 2500 + Math.random() * 3500);
  })();
})();

/* =========================================================
   STATS: numbers count up once when they come into view
   ========================================================= */
(function initStats() {
  const nums = document.querySelectorAll(".mh-stat-num[data-count]");
  if (!nums.length) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  function run(el) {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || "";
    const start = performance.now();
    const dur = 1200;
    (function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      const v = target * (1 - Math.pow(1 - t, 3));
      el.textContent = v.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        run(e.target);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.6 });

  nums.forEach((n) => {
    n.textContent = "0" + (n.dataset.suffix || "");
    io.observe(n);
  });
})();

/* "See how it works": land where the journey starts (step 1),
   not at the top of the section where step 2 is already showing */
(function initHowLink() {
  const link = document.querySelector('a.mh-ghost[href="#how"]');
  const journey = document.getElementById("mhJourney");
  if (!link || !journey) return;

  link.addEventListener("click", (e) => {
    e.preventDefault();
    const firstStep = journey.querySelector(".mh-step");
    const stepTop = journey.getBoundingClientRect().top + window.scrollY + (firstStep ? firstStep.offsetTop : 0);
    // the guardian reaches a step when it sits at 60% of the screen height
    const target = stepTop + 40 - window.innerHeight * 0.6;
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    history.replaceState(null, "", "#how");
  });
})();
