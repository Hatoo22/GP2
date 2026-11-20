/* Admin: suggestions from the Dir'a Assistant */
(() => {
  const $ = (id) => document.getElementById(id);
  const list = $("sgList");
  const search = $("sgSearch");
  let items = [];
  let type = "all";
  let read = "all";

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNew = (s) => String(s.status || "new").toLowerCase() === "new";
  const nf = new Intl.NumberFormat("en-US");

  function timeAgo(v) {
    const d = diraDate(v);
    if (isNaN(d)) return "";
    const s = (Date.now() - d) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  async function post(body) {
    const res = await fetch("api/admin-suggestions.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success) throw new Error(data.message || "Couldn't update.");
    return data;
  }

  function counts() {
    $("cntAll").textContent = nf.format(items.length);
    $("cntGame").textContent = nf.format(items.filter((s) => s.type === "game_suggestion").length);
    $("cntIdea").textContent = nf.format(items.filter((s) => s.type !== "game_suggestion").length);
    const unread = items.filter(isNew).length;
    $("cntNew").textContent = nf.format(unread);
    $("sgMarkAll").disabled = unread === 0;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((s) => {
      if (type !== "all" && (type === "game_suggestion" ? s.type !== "game_suggestion" : s.type === "game_suggestion")) return false;
      if (read === "new" && !isNew(s)) return false;
      if (read === "read" && isNew(s)) return false;
      if (q && ![s.message, s.user_name, s.user_email].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });

    if (!items.length) {
      list.innerHTML = `<li class="dsh-empty">No suggestions yet. They'll appear here when users send them through the Dir'a Assistant.</li>`;
      return;
    }
    if (!shown.length) {
      list.innerHTML = `<li class="dsh-empty">Nothing matches these filters.</li>`;
      return;
    }

    list.innerHTML = shown.map((s) => {
      const game = s.type === "game_suggestion";
      const unread = isNew(s);
      return `
        <li class="sg-item${unread ? " is-new" : ""}" data-id="${esc(s.id)}">
          <span class="sg-kind sg-kind--${game ? "game" : "idea"}">${game ? "Game" : "Idea"}</span>
          <div class="sg-body">
            <p class="sg-msg">${game ? `Add <strong>${esc(s.message)}</strong> to Dir'a` : esc(s.message)}</p>
            <span class="sg-meta">${esc(s.user_name || "Deleted user")}${s.user_email ? ` · ${esc(s.user_email)}` : ""} · ${timeAgo(s.created_at)}</span>
          </div>
          <div class="sg-actions">
            ${game ? `<a class="au-btn" href="admin-games.html?add=${encodeURIComponent(s.message)}" title="Search Steam for this game">Find game</a>` : ""}
            <button type="button" class="au-btn sg-toggle">${unread ? "Mark as read" : "Mark unread"}</button>
          </div>
        </li>`;
    }).join("");
  }

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".sg-toggle");
    if (!btn) return;
    const li = btn.closest(".sg-item");
    const s = items.find((x) => String(x.id) === li.dataset.id);
    if (!s) return;
    const toRead = isNew(s);
    btn.disabled = true;
    try {
      await post({ action: "read", id: Number(s.id), read: toRead });
      s.status = toRead ? "read" : "new";
      counts();
      render();
    } catch (err) {
      btn.textContent = err.message;
      btn.disabled = false;
    }
  });

  $("sgMarkAll").addEventListener("click", async () => {
    const b = $("sgMarkAll");
    b.disabled = true;
    try {
      await post({ action: "read_all" });
      items.forEach((s) => { s.status = "read"; });
      counts();
      render();
    } catch { b.disabled = false; }
  });

  $("sgTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".ag-tab");
    if (!b) return;
    $("sgTabs").querySelectorAll(".ag-tab").forEach((x) => x.classList.toggle("is-active", x === b));
    type = b.dataset.type;
    render();
  });

  $("sgRead").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-read]");
    if (!b) return;
    $("sgRead").querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
    read = b.dataset.read;
    render();
  });

  search.addEventListener("input", render);

  async function load() {
    try {
      const res = await fetch("api/admin-suggestions.php", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Couldn't load suggestions.");
      items = data.suggestions || [];
      counts();
      render();
    } catch (err) {
      list.innerHTML = `<li class="dsh-empty">${esc(err.message)}</li>`;
    }
  }
  load();
})();
