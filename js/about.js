/* About page: fill the AI weight bars when they come into view */
(function () {
  const box = document.getElementById("abWeights");
  if (!box) return;
  if (!("IntersectionObserver" in window)) { box.classList.add("is-in"); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      box.classList.add("is-in");
      io.disconnect();
    }
  }, { threshold: 0.4 });
  io.observe(box);
})();

/* the guardian says hello with a little nod when the page opens,
   and again when you point at him */
(function () {
  const g = document.getElementById("dirGuardian");
  if (!g) return;
  const hello = () => {
    if (typeof guardianReact === "function") guardianReact("low");
    setTimeout(() => { if (typeof guardianIdle === "function") guardianIdle(); }, 1200);
  };
  setTimeout(hello, 700);
  const art = document.querySelector(".ab-intro-art");
  if (art) art.addEventListener("mouseenter", hello);
})();

/* =========================================================
   The guardian flies after the mouse while you're in the top
   section, and floats back to his spot when you leave it or
   scroll down to the next section.
   ========================================================= */
(function () {
  const intro = document.querySelector(".ab-intro");
  const art = document.querySelector(".ab-intro-art");
  const g = document.getElementById("dirGuardian");
  if (!intro || !art || !g) return;
  if (!window.matchMedia("(hover: hover)").matches) return; // phones / tablets: stay put

  // wrap him so we can move him without touching his own scale
  const follower = document.createElement("div");
  follower.className = "ab-follower";
  g.parentNode.insertBefore(follower, g);
  follower.appendChild(g);

  let targetX = 0, targetY = 0;
  let x = 0, y = 0;
  let mouse = null;
  let running = false;

  function homeCenter() {
    const r = art.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function computeTarget() {
    const ir = intro.getBoundingClientRect();
    const vh = window.innerHeight;
    // only chase while the cursor is inside the top section and it's mostly on screen
    const introVisible = ir.bottom > vh * 0.45;
    if (!mouse || !introVisible ||
        mouse.y < ir.top || mouse.y > ir.bottom ||
        mouse.x < ir.left - 40 || mouse.x > ir.right + 40) {
      targetX = 0; targetY = 0;
      return;
    }
    const { cx, cy } = homeCenter();
    // keep a little distance so he hovers next to the cursor, not on top of it
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const keep = Math.min(dist, 90);
    targetX = dx - (dx / dist) * keep;
    targetY = dy - (dy / dist) * keep;

    // stay inside the section
    const halfW = 80, halfH = 120;
    targetX = Math.max(ir.left + halfW - cx, Math.min(ir.right - halfW - cx, targetX));
    targetY = Math.max(ir.top + halfH - cy, Math.min(ir.bottom - halfH - cy, targetY));
  }

  function tick() {
    computeTarget();
    const prevX = x;
    x += (targetX - x) * 0.08;
    y += (targetY - y) * 0.08;
    const vx = x - prevX;
    const tilt = Math.max(-14, Math.min(14, vx * 1.2));
    const bob = Math.sin(performance.now() / 380) * 4;
    follower.style.transform = `translate(${x}px, ${y + bob}px) rotate(${tilt}deg)`;

    const settled = Math.abs(targetX - x) < 0.3 && Math.abs(targetY - y) < 0.3 && targetX === 0 && targetY === 0;
    if (settled) {
      running = false;
      follower.style.transform = "";
      return;
    }
    requestAnimationFrame(tick);
  }

  function start() {
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  document.addEventListener("mousemove", (e) => { mouse = { x: e.clientX, y: e.clientY }; start(); });
  window.addEventListener("scroll", start, { passive: true });
  document.addEventListener("mouseleave", () => { mouse = null; start(); });
})();
