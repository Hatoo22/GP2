/* =========================================================
   NOTIFICATIONS
   - the bell in the top bar (players and employees): risk changes of
     followed games, new features, maintenance, news
   - the maintenance banner at the top of every page (everyone)
   - the "email me" switch on the profile page
   Loaded by common.js on every page.
   ========================================================= */
(() => {
  if (window.__diraNotifications) return;
  window.__diraNotifications = true;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function role() {
    try { return (JSON.parse(localStorage.getItem("diraUser") || "{}").role || "").toLowerCase(); }
    catch { return ""; }
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - Number(ts || 0)));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const svg = (p) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    risk: svg('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    maintenance: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'),
    feature: svg('<path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>')
  };

  /* ---------------- maintenance banner (everyone) ---------------- */
  async function loadNotice() {
    try {
      const data = await fetch("api/site-notice.php", { cache: "no-store" }).then((r) => r.json());
      const n = data && data.notice;
      if (!n) return;
      const key = `diraNoticeClosed-${n.id}`;
      try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
      const until = n.ends_at
        ? new Date(n.ends_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "";
      const bar = document.createElement("div");
      bar.className = "siteNotice";
      bar.setAttribute("role", "status");
      bar.innerHTML = `
        <span class="siteNoticeIcon">${ICONS.maintenance}</span>
        <p><strong>${esc(n.title)}</strong>${n.body ? ` <span>${esc(n.body)}</span>` : ""}${until ? ` <em>Until ${esc(until)}</em>` : ""}</p>
        <button type="button" aria-label="Hide this message">×</button>`;
      bar.querySelector("button").addEventListener("click", () => {
        bar.remove();
        try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      });
      document.body.prepend(bar);
    } catch { /* no banner */ }
  }

  /* ---------------- bell (players + employees) ---------------- */
  let state = { unread: 0, items: [], email: true };
  let open = false;

  function bellButton() {
    const links = document.querySelector(".nav .links");
    if (!links) return null;
    let wrap = links.querySelector(".bellWrap");
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.className = "bellWrap";
    wrap.innerHTML = `
      <button type="button" class="icon bellBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
        ${ICONS.bell}<span class="bellCount" hidden></span>
      </button>
      <div class="bellPanel" hidden>
        <div class="bellHead">
          <strong>Notifications</strong>
          <button type="button" class="bellReadAll">Mark all as read</button>
        </div>
        <ul class="bellList"></ul>
      </div>`;
    // before the theme button
    const theme = links.querySelector('button[onclick="toggleTheme()"]');
    links.insertBefore(wrap, theme || null);
    render();
    return wrap;
  }

  function render() {
    const wrap = document.querySelector(".nav .bellWrap");
    if (!wrap) return;
    const count = wrap.querySelector(".bellCount");
    count.hidden = !state.unread;
    count.textContent = state.unread > 9 ? "9+" : String(state.unread);
    wrap.querySelector(".bellBtn").setAttribute("aria-label", state.unread ? `Notifications, ${state.unread} unread` : "Notifications");
    wrap.querySelector(".bellReadAll").hidden = !state.unread;

    const list = wrap.querySelector(".bellList");
    list.innerHTML = state.items.length
      ? state.items.map((n) => {
          const tag = n.link ? "a" : "div";
          const href = n.link ? ` href="${esc(n.link)}"` : "";
          return `
            <li class="bellItem${n.is_read ? "" : " is-unread"}" data-type="${esc(n.type)}">
              <${tag} class="bellItemInner" data-id="${n.id}"${href}>
                <span class="bellIcon">${ICONS[n.type] || ICONS.info}</span>
                <span class="bellText">
                  <strong>${esc(n.title)}</strong>
                  ${n.body ? `<span>${esc(n.body)}</span>` : ""}
                  <time>${timeAgo(n.ts)}</time>
                </span>
              </${tag}>
            </li>`;
        }).join("")
      : `<li class="bellEmpty">You're all caught up. Changes to games in your list and news from Dir'a show up here for 30 days.</li>`;
  }

  async function refresh() {
    try {
      const data = await fetch("api/notifications.php", { cache: "no-store" }).then((r) => r.json());
      if (!data.success) return;
      state = { unread: data.unread || 0, items: data.items || [], email: data.email !== false };
      render();
      syncProfileSwitch();
    } catch { /* offline: keep the old list */ }
  }

  function post(body) {
    return fetch("api/notifications.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then((r) => r.json()).catch(() => ({ success: false }));
  }

  function setOpen(value) {
    const wrap = document.querySelector(".nav .bellWrap");
    if (!wrap) return;
    open = value;
    wrap.querySelector(".bellPanel").hidden = !open;
    wrap.querySelector(".bellBtn").setAttribute("aria-expanded", open ? "true" : "false");
    wrap.classList.toggle("is-open", open);
  }

  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".nav .bellWrap");
    if (!wrap) return;
    if (e.target.closest(".bellBtn")) { setOpen(!open); return; }
    if (e.target.closest(".bellReadAll")) {
      state.items.forEach((n) => { n.is_read = true; });
      state.unread = 0;
      render();
      post({ action: "read_all" });
      return;
    }
    const item = e.target.closest(".bellItemInner");
    if (item) {
      const n = state.items.find((x) => String(x.id) === item.dataset.id);
      if (n && !n.is_read) {
        n.is_read = true;
        state.unread = Math.max(0, state.unread - 1);
        render();
        post({ action: "read", id: n.id });
      }
      return; // a link still opens the game
    }
    if (open && !wrap.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });

  /* ---------------- profile: email switch ---------------- */
  function syncProfileSwitch() {
    const box = document.getElementById("notifyPrefs");
    const input = document.getElementById("notifyEmail");
    if (!box || !input) return;
    box.hidden = false;
    input.checked = !!state.email;
  }

  function wireProfileSwitch() {
    const input = document.getElementById("notifyEmail");
    if (!input || input.dataset.wired) return;
    input.dataset.wired = "1";
    input.addEventListener("change", async () => {
      const note = document.getElementById("notifyEmailNote");
      const data = await post({ action: "email", on: input.checked });
      if (data.success) {
        state.email = data.email;
        if (note) note.textContent = data.message || "";
      } else {
        input.checked = !input.checked;
        if (note) note.textContent = "Couldn't save. Try again.";
      }
    });
  }

  /* ---------------- start ---------------- */
  function start() {
    loadNotice();
    const r = role();
    if (r !== "individual" && r !== "employee") return;

    bellButton();
    wireProfileSwitch();
    refresh();
    setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60000);

    // pages that rebuild the menu (role, profile): put the bell back
    const links = document.querySelector(".nav .links");
    if (links && "MutationObserver" in window) {
      new MutationObserver(() => { if (!links.querySelector(".bellWrap")) bellButton(); })
        .observe(links, { childList: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
