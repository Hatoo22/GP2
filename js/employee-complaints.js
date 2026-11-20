/* =========================================================
   GOVERNMENT EMPLOYEE — COMPLAINTS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const tableBody = $("complaintsTable");
  const searchInput = $("complaintSearch");
  const tabs = $("acTabs");
  const severityChips = $("severityChips");
  const pager = $("acPages");
  const showing = $("acShowing");

  const modal = $("complaintModal");
  const statusSwitch = $("modalStatusSwitch");
  const statusMsg = $("modalStatusMsg");
  const gameFilterBox = $("gameFilter");

  const PAGE_SIZE = 10;
  const STATUSES = ["Pending", "Reviewing", "Resolved"];
  const STATUS_COLORS = { Pending: "#f59e0b", Reviewing: "#3b82f6", Resolved: "#22c55e" };
  const SEVERITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
  const nf = new Intl.NumberFormat("en-US");

  let complaints = [];
  let statusFilter = "all";
  let severityFilter = "all";
  let page = 1;
  let current = null;
  let gameFilter = null;   // game_id when opened from the dashboard

  /* ---------- helpers ---------- */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    const date = diraDate(value);
    if (isNaN(date)) return value;
    const opts = { day: "2-digit", month: "short", year: "numeric" };
    if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleString("en-GB", opts);
  }

  function normStatus(s) {
    const v = String(s || "Pending").trim().toLowerCase();
    return STATUSES.find((x) => x.toLowerCase() === v) || "Pending";
  }

  const normSeverity = (s) => String(s || "").trim().toLowerCase();
  const isSpam = (c) => Number(c.is_spam) === 1;
  const spamReasons = (c) => {
    try { const r = JSON.parse(c.spam_reasons || "[]"); return Array.isArray(r) ? r : []; }
    catch { return []; }
  };

  function getBehaviors(c) {
    const list = [];
    if (Number(c.behavior_toxic) === 1) list.push("Toxic language");
    if (Number(c.behavior_bullying) === 1) list.push("Bullying");
    if (Number(c.behavior_hate) === 1) list.push("Hate speech");
    if (Number(c.behavior_sexual) === 1) list.push("Sexual harassment");
    if (Number(c.behavior_threat) === 1) list.push("Threats");
    if (c.behavior_other && String(c.behavior_other).trim()) list.push("Other");
    return list;
  }

  function getLocations(c) {
    const list = [];
    if (Number(c.location_chat) === 1) list.push("Chat");
    if (Number(c.location_gameplay) === 1) list.push("Gameplay");
    if (Number(c.location_community) === 1) list.push("Community");
    return list;
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  }

  function hue(seed) {
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  const severityPill = (sev) => {
    const s = normSeverity(sev);
    if (!s) return `<span class="ag-muted">—</span>`;
    return `<span class="dsh-pill" style="--c:${SEVERITY_COLORS[s] || "#94a3b8"}">${escapeHtml(s.charAt(0).toUpperCase() + s.slice(1))}</span>`;
  };

  const statusPill = (st) => {
    const s = normStatus(st);
    return `<span class="au-pill" style="--c:${STATUS_COLORS[s]}"><i></i>${s}</span>`;
  };

  const tags = (list, max = 99) => {
    if (!list.length) return `<span class="ag-muted">—</span>`;
    const shown = list.slice(0, max).map((x) => `<span>${escapeHtml(x)}</span>`).join("");
    const more = list.length > max ? `<span>+${list.length - max}</span>` : "";
    return shown + more;
  };

  /* ---------- counts ---------- */
  function updateCounts() {
    const c = { all: 0, Pending: 0, Reviewing: 0, Resolved: 0, spam: 0 };
    const scope = gameFilter ? complaints.filter((x) => String(x.game_id) === String(gameFilter)) : complaints;
    scope.forEach((x) => {
      if (isSpam(x)) { c.spam++; return; }
      c.all++;
      c[normStatus(x.status)]++;
    });
    $("cntSpam").textContent = nf.format(c.spam);
    $("cntAll").textContent = nf.format(c.all);
    $("cntPending").textContent = nf.format(c.Pending);
    $("cntReviewing").textContent = nf.format(c.Reviewing);
    $("cntResolved").textContent = nf.format(c.Resolved);
  }

  /* ---------- render ---------- */
  function getList() {
    const q = searchInput.value.trim().toLowerCase();
    return complaints.filter((c) => {
      if (gameFilter && String(c.game_id) !== String(gameFilter)) return false;
      if (statusFilter === "spam") { if (!isSpam(c)) return false; }
      else {
        if (isSpam(c)) return false;
        if (statusFilter !== "all" && normStatus(c.status) !== statusFilter) return false;
      }
      if (severityFilter !== "all" && normSeverity(c.severity) !== severityFilter) return false;
      if (!q) return true;
      return [c.title, c.game_name, c.user_name, c.user_email, getBehaviors(c).join(" ")]
        .join(" ").toLowerCase().includes(q);
    });
  }

  function rowHtml(c) {
    const img = c.game_image
      ? `<img class="ac-thumb" src="${escapeHtml(c.game_image)}" alt="" loading="lazy">`
      : `<span class="ac-thumb ag-thumb--empty">🎮</span>`;
    return `
      <tr class="ac-row" data-id="${escapeHtml(c.report_id)}">
        <td>
          <div class="ac-title">
            <strong>${escapeHtml(c.title || "Untitled complaint")}</strong>
            <span>${escapeHtml(c.user_name || "Unknown user")} · ${formatDate(c.date_reported)}</span>
            ${isSpam(c) ? `<span class="ac-spam-reason">⚑ ${escapeHtml(spamReasons(c)[0] || "Marked as spam")}</span>` : ""}
          </div>
        </td>
        <td>
          <div class="ac-game-cell">${img}<span>${escapeHtml(c.game_name || "Unknown game")}</span></div>
        </td>
        <td><div class="ag-genres">${tags(getBehaviors(c), 2)}</div></td>
        <td>${severityPill(c.severity)}</td>
        <td>${statusPill(c.status)}</td>
        <td class="ag-right"><button class="ag-view view-complaint" type="button" data-id="${escapeHtml(c.report_id)}">View →</button></td>
      </tr>`;
  }

  function render() {
    updateCounts();
    const list = getList();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = slice.length
      ? slice.map(rowHtml).join("")
      : `<tr><td colspan="6" class="dsh-empty">${complaints.length ? "No complaints match your filters." : "No complaints yet 🎉"}</td></tr>`;

    showing.textContent = list.length
      ? `Showing ${start + 1}–${start + slice.length} of ${nf.format(list.length)} complaints`
      : "";

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

  /* ---------- details panel ---------- */
  function paintStatusSwitch() {
    const st = normStatus(current.status);
    statusSwitch.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.status === st));
  }

  function paintSpam(c) {
    const box = $("spamBox");
    const reasons = spamReasons(c);
    box.hidden = !isSpam(c);
    $("spamReasons").innerHTML = reasons.length
      ? reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")
      : `<li>Marked as spam by an employee</li>`;
    $("spamScore").textContent = c.spam_override === "spam" ? "Marked by an employee" : (c.spam_score != null ? `Spam score ${c.spam_score}/100` : "");
    const btn = $("spamToggleBtn");
    btn.textContent = isSpam(c) ? "Not spam" : "Mark as spam";
    btn.classList.toggle("au-btn--danger", !isSpam(c));
    $("spamHint").textContent = isSpam(c) ? "Wrong? Move it back to the complaints." : "";
  }

  function openComplaint(c) {
    current = c;
    $("modalId").textContent = c.report_id;
    $("modalComplaintTitle").textContent = c.title || "Untitled complaint";
    $("modalDate").textContent = `Submitted ${formatDate(c.date_reported, true)}`;

    $("modalGameBox").innerHTML = `
      ${c.game_image ? `<img src="${escapeHtml(c.game_image)}" alt="">` : `<span class="ac-thumb ag-thumb--empty">🎮</span>`}
      <div>
        <span class="ac-label">Game</span>
        <strong>${escapeHtml(c.game_name || "Unknown game")}</strong>
      </div>
      ${c.game_id ? `<a class="ag-view" href="game-details.html?game_id=${encodeURIComponent(c.game_id)}">Open game →</a>` : ""}`;

    paintSpam(c);
    $("modalSeverity").innerHTML = severityPill(c.severity);
    $("modalLocation").innerHTML = tags(getLocations(c));
    $("modalBehavior").innerHTML = tags(getBehaviors(c));

    const other = String(c.behavior_other || "").trim();
    $("otherBehaviorBox").hidden = !other;
    $("modalOther").textContent = other;

    const avatar = $("modalAvatar");
    avatar.textContent = initials(c.user_name);
    avatar.style.setProperty("--h", hue(c.user_email || c.user_id));
    $("modalUser").textContent = c.user_name || "Unknown user";

    statusMsg.textContent = "";
    paintStatusSwitch();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    current = null;
  }

  async function post(body) {
    const res = await fetch("api/employee-complaints.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Server error (HTTP ${res.status}). Please try again.`); }
    if (!data.success) throw new Error(data.message || "Request failed.");
    return data;
  }

  /* status change */
  statusSwitch.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-status]");
    if (!btn || !current) return;
    const newStatus = btn.dataset.status;
    if (normStatus(current.status) === newStatus) return;

    const previous = current.status;
    current.status = newStatus;
    paintStatusSwitch();
    statusMsg.textContent = "Saving…";

    try {
      await post({ action: "status", report_id: current.report_id, status: newStatus });
      statusMsg.textContent = `Marked as ${newStatus}.`;
      render();
    } catch (err) {
      current.status = previous;
      paintStatusSwitch();
      statusMsg.textContent = err.message || "Couldn't update the status.";
    }
  });

  function setGameFilter(gid) {
    const game = complaints.find((c) => String(c.game_id) === String(gid));
    if (!game) return;
    gameFilter = String(gid);
    $("gameFilterName").textContent = game.game_name || "this game";
    gameFilterBox.hidden = false;
  }

  $("clearGameFilter").addEventListener("click", () => {
    gameFilter = null;
    gameFilterBox.hidden = true;
    history.replaceState(null, "", location.pathname);
    page = 1;
    render();
  });

  /* spam / not spam */
  $("spamToggleBtn").addEventListener("click", async () => {
    if (!current) return;
    const toSpam = !isSpam(current);
    const btn = $("spamToggleBtn");
    btn.disabled = true;
    try {
      await post({ action: "spam", report_id: current.report_id, spam: toSpam });
      current.is_spam = toSpam ? 1 : 0;
      current.spam_override = toSpam ? "spam" : "not_spam";
      paintSpam(current);
      render();
    } catch (err) {
      $("spamHint").textContent = err.message || "Couldn't update.";
    } finally {
      btn.disabled = false;
    }
  });

  /* the assistant's "Open these complaints": put the game in the search box */
  window.addEventListener("dira:complaints-search", (e) => {
    const query = (e.detail && e.detail.query) || "";
    gameFilter = null;
    gameFilterBox.hidden = true;
    searchInput.value = query;
    page = 1;
    render();
    searchInput.focus();
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  /* ---------- events ---------- */
  tableBody.addEventListener("click", (e) => {
    const row = e.target.closest(".ac-row");
    if (!row) return;
    const c = complaints.find((x) => String(x.report_id) === row.dataset.id);
    if (c) openComplaint(c);
  });

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".ag-tab");
    if (!b) return;
    tabs.querySelectorAll(".ag-tab").forEach((t) => t.classList.toggle("is-active", t === b));
    statusFilter = b.dataset.status;
    page = 1;
    render();
  });

  severityChips.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-severity]");
    if (!b) return;
    severityChips.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
    severityFilter = b.dataset.severity;
    page = 1;
    render();
  });

  searchInput.addEventListener("input", () => { page = 1; render(); });

  pager.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn || btn.disabled) return;
    page = Number(btn.dataset.page);
    render();
    document.querySelector(".ag-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("closeComplaintModal").addEventListener("click", closePanel);
  modal.addEventListener("click", (e) => { if (e.target === modal) closePanel(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && current) closePanel(); });

  /* ---------- load ---------- */
  (async () => {
    try {
      const res = await fetch("api/employee-complaints.php");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Unable to load complaints.");
      complaints = data.complaints || [];

      const params = new URLSearchParams(location.search);
      // opened for one game (from the dashboard): search for it instead of
      // locking a filter, so another game can be searched right away
      const gid = params.get("game_id");
      if (gid) {
        const g = complaints.find((c) => String(c.game_id) === String(gid));
        if (g && g.game_name) searchInput.value = g.game_name;
      }
      const q = params.get("q");
      if (q) searchInput.value = q;

      const st = params.get("status");
      if (["Pending", "Reviewing", "Resolved"].includes(st)) {
        statusFilter = st;
        tabs.querySelectorAll(".ag-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.status === st));
      }

      render();
    } catch (err) {
      console.error(err);
      tableBody.innerHTML = `<tr><td colspan="6" class="dsh-empty">Unable to load complaints.</td></tr>`;
    }
  })();
});
