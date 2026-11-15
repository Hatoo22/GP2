/* Complaints pages: on wide screens the complaint opens as a second column
   next to the list (split view) instead of a drawer over a blurred page.
   On small screens it stays a full-height panel. */
(() => {
  const modal = document.getElementById("complaintModal");
  const card = document.querySelector(".acPage .ag-card");
  if (!modal || !card) return;

  const wrap = document.createElement("div");
  wrap.className = "ac-split";
  card.parentNode.insertBefore(wrap, card);
  wrap.appendChild(card);
  wrap.appendChild(modal);

  const wide = window.matchMedia("(min-width: 1100px)");
  const tbody = card.querySelector("tbody");
  let openId = null;

  function markRow() {
    if (!tbody) return;
    tbody.querySelectorAll(".ac-row").forEach((r) =>
      r.classList.toggle("is-selected", openId !== null && r.dataset.id === openId));
  }

  let wasSplit = false;

  function sync() {
    const open = modal.classList.contains("show");
    const split = open && wide.matches;
    // closing from split view: hide at once, without the drawer's fade/slide,
    // otherwise it flashes as an overlay for a moment
    if (!open && wasSplit) {
      modal.classList.add("ac-no-anim");
      requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.remove("ac-no-anim")));
    }
    // opening straight into split view: skip the drawer's slide-in too
    if (split && !wasSplit) {
      modal.classList.add("ac-no-anim");
      requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.remove("ac-no-anim")));
    }
    wasSplit = split;
    wrap.classList.toggle("has-panel", split);
    document.body.classList.toggle("ac-split-on", split);
    if (!open) openId = null;
    markRow();
  }

  // remember which row was clicked, so it stays highlighted
  card.addEventListener("click", (e) => {
    const row = e.target.closest(".ac-row");
    if (row) openId = row.dataset.id;
  }, true);

  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ["class"] });
  if (tbody) new MutationObserver(markRow).observe(tbody, { childList: true });
  wide.addEventListener("change", sync);

  // when it opens in split view, bring the panel into view if the list is scrolled
  modal.addEventListener("transitionend", () => {
    if (!wrap.classList.contains("has-panel")) return;
    const r = modal.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.5) {
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();
