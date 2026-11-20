/* =========================================================
   ADMIN: announcements (new features, maintenance, news)
   ========================================================= */
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("annForm");
  if (!form) return;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPE_LABEL = { feature: "New feature", maintenance: "Maintenance", info: "News" };
  const AUD_LABEL = { all: "Everyone", individual: "Players", employee: "Employees" };
  const type = () => (form.querySelector('input[name="annType"]:checked') || {}).value || "info";

  function fmtDate(value) {
    const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function syncType() {
    const m = type() === "maintenance";
    $("annEndsField").hidden = !m;
    $("annAudienceField").hidden = m; // maintenance always goes to everyone
  }
  form.querySelectorAll('input[name="annType"]').forEach((r) => r.addEventListener("change", syncType));
  syncType();

  async function call(method, body) {
    try {
      const res = await fetch("api/admin-announcements.php", {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
      return await res.json().catch(() => ({ success: false, message: `Server error (HTTP ${res.status}).` }));
    } catch {
      return { success: false, message: "Couldn't reach the website." };
    }
  }

  async function load() {
    const data = await call("GET");
    const list = $("annList");
    if (!data.success) { list.innerHTML = `<li class="dsh-empty">${esc(data.message || "Couldn't load announcements.")}</li>`; return; }
    const items = data.items || [];
    list.innerHTML = items.length ? items.map((a) => `
      <li class="an-item" data-type="${esc(a.type)}">
        <div class="an-item-top">
          <span class="an-tag">${esc(TYPE_LABEL[a.type] || "News")}</span>
          ${a.active ? `<span class="an-live">Banner showing${a.ends_at ? ` until ${esc(fmtDate(a.ends_at))}` : ""}</span>` : ""}
          <time>${esc(fmtDate(Number(a.ts)))}</time>
        </div>
        <strong>${esc(a.title)}</strong>
        ${a.body ? `<p>${esc(a.body)}</p>` : ""}
        <div class="an-item-foot">
          <span class="mini">${esc(AUD_LABEL[a.audience] || "Everyone")} · seen by ${Number(a.seen)} of ${Number(a.recipients)}${Number(a.emailed) ? " · emailed" : ""}</span>
          <span class="an-actions">
            ${a.active ? `<button type="button" class="au-btn" data-end="${a.id}">End now</button>` : ""}
            <button type="button" class="au-btn an-remove" data-del="${a.id}">Remove</button>
          </span>
        </div>
      </li>`).join("")
      : `<li class="dsh-empty">Nothing sent yet. Your announcements will be listed here.</li>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("annMsg");
    const t = type();
    const title = $("annTitle").value.trim();
    if (!title) { msg.textContent = "Write a title."; $("annTitle").focus(); return; }

    const body = {
      action: "create",
      type: t,
      title,
      body: $("annBody").value.trim(),
      audience: $("annAudience").value,
      email: $("annEmail").checked
    };
    if (t === "maintenance") {
      const v = $("annEnds").value;
      if (!v) { msg.textContent = "Choose when the maintenance ends."; $("annEnds").focus(); return; }
      body.ends_at = new Date(v).toISOString(); // the admin's local time, sent with its time zone
    }

    const btn = $("annSend");
    btn.disabled = true;
    msg.textContent = body.email ? "Sending… emails can take a moment." : "Sending…";
    const data = await call("POST", body);
    btn.disabled = false;
    msg.textContent = data.message || (data.success ? "Sent." : "Couldn't send it.");
    if (data.success) {
      form.reset();
      syncType();
      load();
    }
  });

  // "Remove" asks for a second click instead of a browser dialog
  document.addEventListener("click", async (e) => {
    const end = e.target.closest("[data-end]");
    if (end) {
      end.disabled = true;
      await call("POST", { action: "end", id: Number(end.dataset.end) });
      load();
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = "Remove from everyone?";
        setTimeout(() => { if (del.isConnected) { del.dataset.confirm = ""; del.textContent = "Remove"; } }, 4000);
        return;
      }
      del.disabled = true;
      await call("POST", { action: "delete", id: Number(del.dataset.del) });
      load();
    }
  });

  load();
})();
