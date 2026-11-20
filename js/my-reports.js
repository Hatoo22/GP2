/* =========================================================
   MY COMPLAINTS (individual users)
   - status tabs with counts
   - each complaint shows a 3-step tracker: Sent → Reviewing → Resolved
   - complaints whose status changed since the last visit get an "Updated" badge
   ========================================================= */
(() => {
  const list = document.getElementById("mcList");
  const tabs = document.getElementById("mcTabs");
  const updatesBox = document.getElementById("mcUpdates");

  const SEEN_KEY = "diraComplaintSeen";
  const STEPS = ["Pending", "Reviewing", "Resolved"];
  const STEP_LABEL = { Pending: "Sent", Reviewing: "Under review", Resolved: "Resolved" };
  const STATUS_TEXT = {
    Pending: "We received your complaint. It's waiting for an employee to pick it up.",
    Reviewing: "An employee is looking into your complaint now.",
    Resolved: "Your complaint was reviewed and closed. Thank you for reporting."
  };
  const BEHAVIORS = [
    ["behavior_toxic", "Toxic language"],
    ["behavior_bullying", "Bullying"],
    ["behavior_hate", "Hate speech"],
    ["behavior_sexual", "Sexual content"],
    ["behavior_threat", "Threats"]
  ];

  let complaints = [];
  let filter = "all";
  let updatedIds = new Set();

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function normStatus(s) {
    const v = String(s || "").trim().toLowerCase();
    if (v.startsWith("resol") || v === "closed" || v === "done") return "Resolved";
    if (v.includes("review") || v === "in progress") return "Reviewing";
    return "Pending";
  }

  function formatDate(d) {
    const date = diraDate(d);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function readSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); } catch { return null; }
  }
  function saveSeen() {
    const map = {};
    complaints.forEach((c) => { map[c.report_id] = normStatus(c.status); });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch {}
  }

  function behaviorsOf(c) {
    const out = BEHAVIORS.filter(([k]) => Number(c[k]) === 1).map(([, label]) => label);
    if (String(c.description || "").trim()) out.push("Other");
    return out;
  }

  function tracker(status) {
    const at = STEPS.indexOf(status);
    return `<ol class="mc-track" data-at="${at}">
      ${STEPS.map((s, i) => `<li class="${i < at || (i === at && s === "Resolved") ? "is-done" : i === at ? "is-now" : ""}"><b></b><span>${STEP_LABEL[s]}</span></li>`).join("")}
    </ol>`;
  }

  function card(c) {
    const status = normStatus(c.status);
    const behaviors = behaviorsOf(c);
    const updated = updatedIds.has(String(c.report_id));
    const img = c.game_image
      ? `<img src="${esc(c.game_image)}" alt="" loading="lazy">`
      : `<span class="mc-noimg">${esc((c.game_name || "?").charAt(0))}</span>`;
    const gameLink = c.game_id ? `game-details.html?game_id=${encodeURIComponent(c.game_id)}` : "#";

    return `<article class="mc-card mc-${status.toLowerCase()}${updated ? " is-updated" : ""}">
      <a class="mc-thumb" href="${gameLink}" aria-label="Open ${esc(c.game_name)}">${img}</a>

      <div class="mc-main">
        <div class="mc-top">
          <div>
            <h3>${esc(c.title)}</h3>
            <p class="mc-meta"><a href="${gameLink}">${esc(c.game_name)}</a> · Sent ${formatDate(c.date_reported)}</p>
          </div>
          <div class="mc-badges">
            ${updated ? `<span class="mc-new">Updated</span>` : ""}
            <span class="mc-status">${STEP_LABEL[status]}</span>
          </div>
        </div>

        ${behaviors.length ? `<div class="mc-tags">${behaviors.map((b) => `<span>${esc(b)}</span>`).join("")}</div>` : ""}
        ${String(c.description || "").trim() ? `<p class="mc-desc">${esc(c.description)}</p>` : ""}

        ${tracker(status)}
        <p class="mc-note">${STATUS_TEXT[status]}</p>
      </div>
    </article>`;
  }

  function updateCounts() {
    const n = { all: complaints.length, Pending: 0, Reviewing: 0, Resolved: 0 };
    complaints.forEach((c) => n[normStatus(c.status)]++);
    document.getElementById("mcAll").textContent = n.all;
    document.getElementById("mcPending").textContent = n.Pending;
    document.getElementById("mcReviewing").textContent = n.Reviewing;
    document.getElementById("mcResolved").textContent = n.Resolved;
  }

  function render() {
    if (!complaints.length) {
      list.innerHTML = `<div class="mc-empty">
        <h3>No complaints yet</h3>
        <p>Saw toxic behavior in a game? Open the game's page and press Report.</p>
        <a class="btn" href="games.html">Browse games</a>
      </div>`;
      return;
    }
    const shown = complaints.filter((c) => filter === "all" || normStatus(c.status) === filter);
    list.innerHTML = shown.length
      ? shown.map(card).join("")
      : `<p class="mc-empty">No ${STEP_LABEL[filter].toLowerCase()} complaints.</p>`;
  }

  function showUpdates() {
    if (!updatedIds.size) { updatesBox.hidden = true; return; }
    const n = updatedIds.size;
    updatesBox.hidden = false;
    updatesBox.innerHTML = `<span class="mc-dot"></span>
      <strong>${n === 1 ? "1 complaint has" : `${n} complaints have`} a new status</strong>
      <span class="mini">since your last visit</span>`;
  }

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".ag-tab");
    if (!btn) return;
    tabs.querySelectorAll(".ag-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
    filter = btn.dataset.status;
    render();
  });

  async function load() {
    try {
      const res = await fetch("api/my-reports.php", { cache: "no-store" });
      const data = await res.json();
      if (typeof handleSessionExpired === "function" && handleSessionExpired(data)) return;
      if (!data.success) {
        list.innerHTML = `<p class="mc-empty">${esc(data.message || "Couldn't load your complaints.")}</p>`;
        return;
      }
      complaints = data.reports || [];

      // what changed since the last visit
      // (every complaint starts as Pending, so anything we haven't seen yet counts from there)
      const seen = readSeen() || {};
      complaints.forEach((c) => {
        const before = seen[c.report_id] || "Pending";
        if (before !== normStatus(c.status)) updatedIds.add(String(c.report_id));
      });

      updateCounts();
      render();
      showUpdates();
      saveSeen(); // the nav dot clears once the page has been seen
      document.querySelectorAll('.nav a[href="my-reports.html"] .nav-dot').forEach((d) => d.remove());
    } catch {
      list.innerHTML = `<p class="mc-empty">Couldn't load your complaints. Try refreshing the page.</p>`;
    }
  }

  load();
})();
