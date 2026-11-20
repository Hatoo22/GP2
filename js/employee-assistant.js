/* =========================================================
   DIR'A ASSISTANT — GOVERNMENT EMPLOYEE (Complaints page)
   Summarizes complaints from the real data:
   - all complaints, or
   - one game chosen from the games that have complaints
   Everything is calculated from the database (no AI text
   generation), so numbers are always exact.
   ========================================================= */
(function () {
  const guardianEl = document.getElementById("dirGuardian");
  if (!guardianEl) return;

  const BEHAVIORS = [
    ["behavior_toxic", "toxic language"],
    ["behavior_bullying", "bullying"],
    ["behavior_hate", "hate speech"],
    ["behavior_sexual", "sexual harassment"],
    ["behavior_threat", "threats"]
  ];
  const LOCATIONS = [
    ["location_chat", "in chat"],
    ["location_gameplay", "during gameplay"],
    ["location_community", "in the community"]
  ];

  let complaints = null;

  /* ---------- helpers ---------- */
  const nf = new Intl.NumberFormat("en-US");
  const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
  const status = (c) => {
    const v = String(c.status || "Pending").toLowerCase();
    return v === "reviewing" ? "Reviewing" : v === "resolved" ? "Resolved" : "Pending";
  };
  const sev = (c) => String(c.severity || "").toLowerCase();
  const dateOf = (c) => diraDate(c.date_reported || "");
  const daysAgo = (d) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

  function countBy(list, fn) {
    const m = new Map();
    list.forEach((x) => {
      const keys = [].concat(fn(x)).filter(Boolean);
      keys.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  const behaviorsOf = (c) => {
    const list = BEHAVIORS.filter(([k]) => Number(c[k]) === 1).map(([, l]) => l);
    if (String(c.behavior_other || "").trim()) list.push("other behavior");
    return list;
  };
  const locationsOf = (c) => LOCATIONS.filter(([k]) => Number(c[k]) === 1).map(([, l]) => l);

  function joinNice(arr) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  }

  function weekTrend(list) {
    const now = Date.now();
    const week = 7 * 86400000;
    const thisWeek = list.filter((c) => now - dateOf(c) < week).length;
    const lastWeek = list.filter((c) => { const t = now - dateOf(c); return t >= week && t < 2 * week; }).length;
    if (!thisWeek && !lastWeek) return "No new complaints in the last two weeks.";
    if (thisWeek > lastWeek) return `Complaints are going up: ${thisWeek} this week vs ${lastWeek} last week.`;
    if (thisWeek < lastWeek) return `Complaints are going down: ${thisWeek} this week vs ${lastWeek} last week.`;
    return `Same as last week: ${thisWeek} new ${thisWeek === 1 ? "complaint" : "complaints"}.`;
  }

  /* ---------- summaries (one tidy card each) ---------- */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const ago = (c) => { const d = daysAgo(dateOf(c)); return d === 0 ? "today" : `${plural(d, "day", "days")} ago`; };

  function statusRow(byStatus) {
    return `<div class="gs-stats">
      <div><b>${nf.format(byStatus.Pending)}</b><span>Waiting</span></div>
      <div><b>${nf.format(byStatus.Reviewing)}</b><span>Under review</span></div>
      <div><b>${nf.format(byStatus.Resolved)}</b><span>Resolved</span></div>
    </div>`;
  }

  function section(title, inner) {
    return inner ? `<div class="gs-sec"><p class="gs-h">${title}</p>${inner}</div>` : "";
  }

  function summarizeAll(list) {
    if (!list.length) return { html: `<p>There are no complaints yet. Nothing to review 🎉</p>` };

    const byStatus = { Pending: 0, Reviewing: 0, Resolved: 0 };
    list.forEach((c) => byStatus[status(c)]++);
    const games = countBy(list, (c) => c.game_name || "Unknown game");
    const behaviors = countBy(list, behaviorsOf);
    const places = countBy(list, locationsOf);
    const pending = list.filter((c) => status(c) === "Pending").sort((a, b) => dateOf(a) - dateOf(b));
    const highPending = pending.filter((c) => sev(c) === "high").length;

    const details = [];
    if (games.length) details.push(`<li>Most reported: ${games.slice(0, 3).map(([g, n]) => `<b>${esc(g)}</b> (${n})`).join(", ")}</li>`);
    if (behaviors.length) details.push(`<li>Main issues: ${esc(joinNice(behaviors.slice(0, 3).map(([x]) => x)))}</li>`);
    if (places.length) details.push(`<li>Mostly happens ${esc(places[0][0])}</li>`);
    details.push(`<li>${esc(weekTrend(list))}</li>`);

    let next = "";
    if (pending.length) {
      const topPendingGame = countBy(pending, (c) => c.game_name || "Unknown game")[0];
      const oldest = pending[0];
      next = `<p>${highPending ? `<b>${plural(highPending, "high-severity complaint", "high-severity complaints")}</b> still waiting. ` : ""}` +
             `Start with <b>${esc(topPendingGame[0])}</b>, it has the most waiting (${topPendingGame[1]}).</p>` +
             `<p class="gs-muted">Oldest waiting: "${esc(oldest.title || "Untitled")}" · ${ago(oldest)}</p>`;
    } else {
      next = `<p>Nothing is waiting for review. Nice work!</p>`;
    }

    return {
      html: `<p class="gs-title">All complaints <span>${plural(list.length, "complaint", "complaints")} · ${plural(games.length, "game", "games")}</span></p>` +
        statusRow(byStatus) +
        section("Highlights", `<ul>${details.join("")}</ul>`) +
        section("What to do next", next)
    };
  }

  function summarizeGame(list, gameId) {
    const items = list.filter((c) => String(c.game_id) === String(gameId));
    if (!items.length) return { html: `<p>I couldn't find complaints for that game.</p>` };
    const g = items[0];

    const byStatus = { Pending: 0, Reviewing: 0, Resolved: 0 };
    items.forEach((c) => byStatus[status(c)]++);
    const sevCount = { high: 0, medium: 0, low: 0 };
    items.forEach((c) => { if (sevCount[sev(c)] !== undefined) sevCount[sev(c)]++; });
    const behaviors = countBy(items, behaviorsOf);
    const places = countBy(items, locationsOf);
    const latest = [...items].sort((a, b) => dateOf(b) - dateOf(a));
    const words = [...new Set(latest.map((c) => String(c.behavior_other || "").trim()).filter(Boolean))].slice(0, 3);

    const risk = g.overall_risk_level
      ? `<span class="gs-risk gs-risk--${esc(String(g.overall_risk_level).toLowerCase())}">AI risk ${Number(g.overall_risk_percent || 0).toFixed(1)}% · ${esc(g.overall_risk_level)}</span>`
      : "";

    const details = [];
    if (behaviors.length) details.push(`<li>Reported: ${behaviors.map(([b, n]) => `${esc(b)} (${n})`).join(", ")}</li>`);
    if (places.length) details.push(`<li>Where: ${places.map(([p2, n]) => `${esc(p2)} (${n})`).join(", ")}</li>`);
    details.push(`<li>${esc(weekTrend(items))}</li>`);

    const recent = latest.slice(0, 3).map((c) =>
      `<li>"${esc(c.title || "Untitled")}" <span class="gs-muted">· ${status(c)} · ${ago(c)}</span></li>`).join("");

    const quotes = words.map((t) => `<li>"${esc(t.length > 110 ? t.slice(0, 107) + "…" : t)}"</li>`).join("");

    return {
      html: `<p class="gs-title">${esc(g.game_name || "This game")} <span>${plural(items.length, "complaint", "complaints")}</span></p>` +
        risk +
        statusRow(byStatus) +
        section("Highlights", `<ul>${details.join("")}</ul>`) +
        section("Latest complaints", `<ul>${recent}</ul>`) +
        section("In users' own words", quotes ? `<ul>${quotes}</ul>` : "")
    };
  }

  /* ---------- UI (reuses the assistant chat styles) ---------- */
  const panel = document.createElement("section");
  panel.className = "guardianChat";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Dir'a Assistant");
  panel.innerHTML = `
    <header class="guardianChatHead">
      <div class="guardianChatTitle">
        <span class="guardianChatDot"></span>
        <div>
          <strong>Dir'a Assistant</strong>
          <small>Complaint summaries</small>
        </div>
      </div>
      <button type="button" class="guardianChatClose" aria-label="Close">×</button>
    </header>
    <div class="guardianChatBody" aria-live="polite"></div>`;
  document.body.appendChild(panel);

  const hint = document.createElement("div");
  hint.className = "guardianHint";
  hint.textContent = "Need a summary? Click me!";
  document.body.appendChild(hint);

  const body = panel.querySelector(".guardianChatBody");
  const options = document.createElement("div");
  options.className = "guardianChatOptions";
  body.appendChild(options);

  const scrollDown = () => { body.scrollTop = body.scrollHeight; };

  function addMsg(text, who) {
    const m = document.createElement("div");
    m.className = `guardianMsg guardianMsg--${who}`;
    m.textContent = text;
    body.insertBefore(m, options);
    scrollDown();
  }

  function botCard(summary, then) {
    const typing = document.createElement("div");
    typing.className = "guardianMsg guardianMsg--bot guardianTyping";
    typing.innerHTML = "<span></span><span></span><span></span>";
    body.insertBefore(typing, options);
    scrollDown();
    setTimeout(() => {
      typing.remove();
      const card = document.createElement("div");
      card.className = "guardianMsg guardianMsg--bot guardianSummary";
      card.innerHTML = summary.html; // built from escaped values only
      body.insertBefore(card, options);
      if (then) then();
      // show the summary from its top (not the buttons at the bottom)
      body.scrollTo({ top: card.offsetTop - 12, behavior: "smooth" });
    }, 650);
  }

  function botSay(texts, then) {
    const queue = [].concat(texts);
    const next = () => {
      if (!queue.length) { if (then) then(); return; }
      const typing = document.createElement("div");
      typing.className = "guardianMsg guardianMsg--bot guardianTyping";
      typing.innerHTML = "<span></span><span></span><span></span>";
      body.insertBefore(typing, options);
      scrollDown();
      setTimeout(() => { typing.remove(); addMsg(queue.shift(), "bot"); next(); }, 420);
    };
    next();
  }

  function setOptions(list) {
    options.innerHTML = "";
    list.forEach(({ label, action, variant, href }) => {
      const el = document.createElement(href ? "a" : "button");
      if (href) el.href = href; else el.type = "button";
      el.className = "guardianChip" + (variant ? ` guardianChip--${variant}` : "");
      el.textContent = label;
      if (action) el.addEventListener("click", action);
      options.appendChild(el);
    });
    scrollDown();
  }

  function react(type) {
    if (typeof guardianReact === "function") {
      guardianReact(type);
      setTimeout(() => { if (typeof guardianIdle === "function") guardianIdle(); }, 1400);
    }
  }

  async function load() {
    if (complaints) return complaints;
    const res = await fetch("api/employee-complaints.php", { credentials: "same-origin" });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Couldn't load complaints.");
    // spam reports are left out of every summary
    complaints = (data.complaints || []).filter((c) => Number(c.is_spam) !== 1);
    return complaints;
  }

  function mainMenu(text) {
    botSay(text || "What would you like me to summarize?", () => {
      setOptions([
        { label: "📋 Summarize all complaints", action: doAll },
        { label: "🎮 Summarize a game", action: pickGame }
      ]);
    });
  }

  async function doAll() {
    addMsg("Summarize all complaints", "user");
    setOptions([]);
    try {
      const list = await load();
      const pending = list.filter((c) => status(c) === "Pending" && sev(c) === "high").length;
      react(pending ? "medium" : "low");
      botCard(summarizeAll(list), () => afterSummary());
    } catch (e) {
      botSay(e.message, () => mainMenu("Want to try again?"));
    }
  }

  async function pickGame() {
    addMsg("Summarize a game", "user");
    setOptions([]);
    try {
      const list = await load();
      const games = countBy(list, (c) => `${c.game_id}|${c.game_name || "Unknown game"}`);
      if (!games.length) { botSay("No games have complaints yet.", () => mainMenu()); return; }
      botSay("Which game? These are the games with complaints, most reported first:", () => {
        setOptions([
          ...games.map(([key, n]) => {
            const [id, name] = key.split("|");
            return { label: `${name} (${n})`, action: () => doGame(id, name) };
          }),
          { label: "← Back", action: () => mainMenu(), variant: "ghost" }
        ]);
      });
    } catch (e) {
      botSay(e.message, () => mainMenu("Want to try again?"));
    }
  }

  function doGame(id, name) {
    addMsg(name, "user");
    setOptions([]);
    const items = complaints.filter((c) => String(c.game_id) === String(id));
    const highPending = items.some((c) => sev(c) === "high" && status(c) !== "Resolved");
    react(highPending ? "high" : items.some((c) => status(c) !== "Resolved") ? "medium" : "low");
    botCard(summarizeGame(complaints, id), () => afterSummary(id));
  }

  function afterSummary(gameId) {
    const opts = [];
    if (gameId) {
      const g = (complaints || []).find((c) => String(c.game_id) === String(gameId));
      const name = (g && g.game_name) || "";
      opts.push({
        label: "Open these complaints",
        action: () => {
          // on the Complaints page: just search for the game, no filter to clear
          if (/employee-complaints\.html$/i.test(location.pathname) && name) {
            window.dispatchEvent(new CustomEvent("dira:complaints-search", { detail: { query: name } }));
            close();
          } else {
            location.href = `employee-complaints.html?q=${encodeURIComponent(name)}`;
          }
        }
      });
    }
    opts.push(
      { label: "Summarize another game", action: pickGame },
      { label: "Summarize all", action: doAll, variant: gameId ? undefined : "ghost" }
    );
    setOptions(opts);
  }

  /* ---------- open / close ---------- */
  let started = false;
  function open() {
    hint.classList.remove("show");
    panel.classList.add("open");
    if (!started) {
      started = true;
      complaints = null; // always summarize fresh data
      react("low");
      botSay("Hi! I'm Dir'a, your Assistant 👋 I can summarize the complaints for you.", () => mainMenu());
    }
  }
  function close() { panel.classList.remove("open"); }

  guardianEl.setAttribute("role", "button");
  guardianEl.setAttribute("tabindex", "0");
  guardianEl.setAttribute("aria-label", "Open Dir'a Assistant");
  guardianEl.removeAttribute("aria-hidden");
  guardianEl.addEventListener("click", () => (panel.classList.contains("open") ? close() : open()));
  guardianEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); guardianEl.click(); }
  });
  panel.querySelector(".guardianChatClose").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  /* hint bubble: shows shortly after the page loads, then again every
     40 seconds as a reminder, until the chat has been opened once */
  (function hintReminder() {
    const FIRST = 1500, EVERY = 40000, SHOW_FOR = 6000;
    let opened = false;
    const guardianBox = document.getElementById("dirGuardian");
    if (guardianBox) guardianBox.addEventListener("click", () => { opened = true; hint.classList.remove("show"); });
    function pop() {
      if (opened || panel.classList.contains("open") || document.hidden) return;
      hint.classList.add("show");
      setTimeout(() => hint.classList.remove("show"), SHOW_FOR);
    }
    setTimeout(pop, FIRST);
    setInterval(pop, EVERY);
  })();
})();
