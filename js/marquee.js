/* =========================================================
   Games carousel (home + main-home)
   - Moves on its own, slowly and endlessly
   - The user can swipe / drag / scroll / use the arrows freely
   - Auto movement pauses while the user interacts or hovers,
     then resumes a few seconds later from where they left it
   ========================================================= */
(function () {
  const SPEED = 40;          // pixels per second
  const RESUME_DELAY = 3000; // ms after the last interaction

  function initMarquee(track) {
    if (!track || track.dataset.marqueeReady) return;
    track.dataset.marqueeReady = "1";

    const wrap = track.closest(".marquee-wrap");
    if (!wrap) return;

    // Shell holds the arrows on top of the scroll area
    const shell = document.createElement("div");
    shell.className = "marquee-shell";
    wrap.parentNode.insertBefore(shell, wrap);
    shell.appendChild(wrap);

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "marquee-arrow marquee-arrow--prev";
    prevBtn.setAttribute("aria-label", "Previous games");
    prevBtn.innerHTML = "&#8249;";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "marquee-arrow marquee-arrow--next";
    nextBtn.setAttribute("aria-label", "Next games");
    nextBtn.innerHTML = "&#8250;";

    shell.appendChild(prevBtn);
    shell.appendChild(nextBtn);

    const reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pos = 0;            // our own float position (scrollLeft rounds)
    let lastSet = 0;
    let lastTime = null;
    let hovering = false;
    let pointerDown = false;
    let resumeAt = 0;
    let smoothUntil = 0;
    let scrollEndTimer = null;

    // Mouse drag (touch already scrolls natively)
    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let dragMoved = false;

    // Width of one copy of the list (the list is rendered 3 times)
    function loopWidth() {
      const count = Number(track.dataset.count || 0);
      const kids = track.children;
      if (!count || kids.length < count * 3) return 0;
      return kids[count].offsetLeft - kids[0].offsetLeft;
    }

    function isLooping() {
      if (track.dataset.loop !== "1" || track.classList.contains("is-searching")) return false;
      const w = loopWidth();
      return w > 0 && w >= wrap.clientWidth;
    }

    // Keep the scroll position inside the middle copy (same picture, no jump)
    function normalize(value) {
      const w = loopWidth();
      if (!w) return value;
      while (value < w * 0.5) value += w;
      while (value >= w * 1.5) value -= w;
      return value;
    }

    function step() {
      const card = track.querySelector(".marquee-card");
      if (!card) return 300;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 20;
      return card.offsetWidth + gap;
    }

    function pauseFor(ms) {
      resumeAt = Math.max(resumeAt, performance.now() + ms);
    }

    function wrapAround() {
      if (!isLooping()) return;
      const next = normalize(wrap.scrollLeft);
      if (Math.abs(next - wrap.scrollLeft) > 1) wrap.scrollLeft = next;
      pos = wrap.scrollLeft;
      lastSet = pos;
    }

    function tick(time) {
      if (lastTime === null) lastTime = time;
      const dt = Math.min(time - lastTime, 100);
      lastTime = time;

      // Did the user move it (swipe, wheel, momentum)? Follow them.
      if (Math.abs(wrap.scrollLeft - lastSet) > 2) {
        pos = wrap.scrollLeft;
        lastSet = pos;
        pauseFor(RESUME_DELAY);
      }

      const canMove =
        !reduceMotion &&
        isLooping() &&
        !hovering &&
        !pointerDown &&
        !dragging &&
        time >= resumeAt;

      if (canMove) {
        pos = normalize(pos + (SPEED * dt) / 1000);
        wrap.scrollLeft = pos;
        lastSet = wrap.scrollLeft;
      }

      requestAnimationFrame(tick);
    }

    // ---------- Interactions ----------
    wrap.addEventListener("mouseenter", () => { hovering = true; });
    wrap.addEventListener("mouseleave", () => {
      hovering = false;
      pauseFor(800);
    });

    wrap.addEventListener("touchstart", () => {
      pointerDown = true;
      pauseFor(RESUME_DELAY);
    }, { passive: true });

    wrap.addEventListener("touchend", () => {
      pointerDown = false;
      pauseFor(RESUME_DELAY);
    }, { passive: true });

    wrap.addEventListener("wheel", () => pauseFor(RESUME_DELAY), { passive: true });

    wrap.addEventListener("scroll", () => {
      // Keep the endless loop working when the user scrolls to an edge
      if (pointerDown || dragging || performance.now() < smoothUntil) return;
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(wrapAround, 120);
    }, { passive: true });

    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartScroll = wrap.scrollLeft;
      wrap.classList.add("is-dragging");
      pauseFor(RESUME_DELAY);
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 5) dragMoved = true;
      if (dragMoved) {
        e.preventDefault();
        wrap.scrollLeft = dragStartScroll - dx;
      }
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove("is-dragging");
      pauseFor(RESUME_DELAY);
      wrapAround();
    });

    // A drag should not count as a click on "View Details"
    wrap.addEventListener("click", (e) => {
      if (dragMoved) {
        e.preventDefault();
        e.stopPropagation();
        dragMoved = false;
      }
    }, true);

    // Stop the browser's native image/link drag ghost
    wrap.addEventListener("dragstart", (e) => e.preventDefault());

    function go(direction) {
      pauseFor(RESUME_DELAY + 600);
      wrapAround();
      smoothUntil = performance.now() + 700;
      setTimeout(wrapAround, 750);
      wrap.scrollBy({ left: direction * step(), behavior: "smooth" });
    }

    prevBtn.addEventListener("click", () => go(-1));
    nextBtn.addEventListener("click", () => go(1));

    // Keyboard support when the carousel has focus
    wrap.tabIndex = 0;
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });

    requestAnimationFrame(tick);

    // Called after the cards are (re)rendered
    track.marqueeReset = function () {
      wrap.scrollLeft = isLooping() ? loopWidth() : 0;
      pos = wrap.scrollLeft;
      lastSet = pos;
      shell.classList.toggle("no-arrows", track.querySelectorAll(".marquee-card").length < 2);
    };
  }

  /**
   * Render cards into a marquee track.
   * loop = true  -> list is shown 3 times for the endless effect
   * loop = false -> plain list (e.g. search results)
   */
  window.renderMarquee = function (track, html, count, loop) {
    initMarquee(track);
    track.innerHTML = html;
    track.dataset.count = String(count);
    track.dataset.loop = loop && count > 0 ? "1" : "0";
    if (track.marqueeReset) track.marqueeReset();
  };
})();
