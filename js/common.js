/* database times are saved in UTC (api/config.php sets the connection to UTC);
   this reads them as UTC so "2h ago" and dates show in the visitor's own time */
function diraDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value * 1000);
  const s = String(value || "").trim();
  if (!s) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s.replace(" ", "T"));
  return new Date(s.replace(" ", "T") + "Z");
}

/* one way to show a risk percent everywhere: whole numbers, "<1%" for tiny values */
function diraPct(value) {
  const v = Number(value || 0);
  if (v <= 0) return "0%";
  if (v < 1) return "<1%";
  return `${Math.round(Math.min(v, 100))}%`;
}

document.addEventListener('DOMContentLoaded', () => {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('show');
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.animate,.bubble,.orb,.card,.stat,.dashBox,.metric')
    .forEach(el => obs.observe(el));

  document.querySelectorAll('[data-year]')
    .forEach(el => el.textContent = new Date().getFullYear());

  document.querySelectorAll('a').forEach(link => {
    if (['log out', 'تسجيل الخروج'].includes(link.textContent.trim().toLowerCase())) {
      link.addEventListener('click', () => {
        localStorage.removeItem('diraUser');
      });
    }
  });

  // dark is the default; light only when the visitor picked it with the theme button
  const savedTheme = localStorage.getItem('diraThemeChoice');

  if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
    document.documentElement.classList.remove('dark-pre');
  } else {
    document.body.classList.add('dark-mode');
    document.documentElement.classList.add('dark-pre');
  }

    const navAvatarMap = {
    default: "👤",
    cat: "🐱",
    lion: "🦁",
    rabbit: "🐰",
    owl: "🦉",
    duck: "🦆",
    turtle: "🐢",
    bear: "🐻"
  };

  const savedAvatar = localStorage.getItem("profile_avatar");

  document.querySelectorAll(".profileIcon").forEach(icon => {
    icon.textContent = navAvatarMap[savedAvatar] || navAvatarMap.default;
  });

  updateThemeIcon();
});

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  document.documentElement.classList.toggle('dark-pre', document.body.classList.contains('dark-mode'));

  if (document.body.classList.contains('dark-mode')) {
    localStorage.setItem('diraThemeChoice', 'dark');
  } else {
    localStorage.setItem('diraThemeChoice', 'light');
  } 

  updateThemeIcon();
}

function updateThemeIcon() {
  const themeButtons = document.querySelectorAll('button[onclick="toggleTheme()"]');

  themeButtons.forEach(button => {
    if (document.body.classList.contains('dark-mode')) {
      button.textContent = '☀';
      button.setAttribute('aria-label', 'Switch to light mode');
      button.setAttribute('title', 'Switch to light mode');
    } else {
      button.textContent = '🌙';
      button.setAttribute('aria-label', 'Switch to dark mode');
      button.setAttribute('title', 'Switch to dark mode');
    }
  });
}


/* =========================
   AUTH GUARDIAN SCENES
========================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    if (
      !document.body.classList.contains(
        'authPage'
      )
    ) {
      return;
    }


    const dirGuardian =
      document.getElementById(
        'dirGuardian'
      );


    if (!dirGuardian) {
      return;
    }


    const scenes = [
      'auth-peek',
      'auth-wave'
    ];


    let lastScene = null;
    let guardianTimer = null;



    function clearGuardianScene() {

      scenes.forEach(scene => {

        dirGuardian.classList.remove(
          scene
        );

      });

    }



    function playGuardianScene(
      forcedScene = null
    ) {

      clearTimeout(guardianTimer);

      clearGuardianScene();


      let scene = forcedScene;


      if (!scene) {

        const availableScenes =
          scenes.filter(
            item => item !== lastScene
          );


        scene =
          availableScenes[
            Math.floor(
              Math.random() *
              availableScenes.length
            )
          ];

      }


      lastScene = scene;


      void dirGuardian.offsetWidth;


      dirGuardian.classList.add(
        scene
      );


      const duration =
        scene === 'auth-wave'
          ? 4800
          : 4600;


      guardianTimer =
        setTimeout(
          () => {

            clearGuardianScene();


            guardianTimer =
              setTimeout(
                () => {
                  playGuardianScene();
                },

                3500 +
                Math.random() * 3500
              );

          },

          duration
        );

    }



    /* أول ظهور */
    setTimeout(
      () => {

        playGuardianScene(
          'auth-peek'
        );

      },

      1000
    );



    /* يتفاعل مع اختيار الحساب */
    window.addEventListener(
  'dira:role-selected',
  (event) => {

    const role = event.detail?.role;

    /* نوقف حركة الـpeek / wave المؤقتة */
    clearTimeout(guardianTimer);
    clearGuardianScene();

    /* نخليه ظاهر وثابت */
    dirGuardian.classList.add(
      'auth-role-active'
    );

    /* نشيل الحالة السابقة */
    dirGuardian.classList.remove(
      'auth-individual',
      'auth-employee'
    );

    if (role === 'individual') {
      dirGuardian.classList.add(
        'auth-individual'
      );
    }

    if (role === 'employee') {
      dirGuardian.classList.add(
        'auth-employee'
      );
    }

  }
);

  }
);

function applyRoleNavigation() {

  const storedUser = localStorage.getItem('diraUser');

  if (!storedUser) {
    return;
  }

  let user;

  try {
    user = JSON.parse(storedUser);
  } catch {
    return;
  }

  const role = user.role;

  const linksContainer =
    document.querySelector('.nav .links');

  const logo =
    document.querySelector('.nav .logo');

  if (!linksContainer) {
    return;
  }

  if (role === 'employee') {

    if (logo) {
      logo.href = 'government-dashboard.html';
    }

    linksContainer.innerHTML = `
      <a href="government-dashboard.html">
        Dashboard
      </a>

      <a href="employee-complaints.html">
        Complaints
      </a>

      <a href="games.html">
        Games
      </a>

      <a href="tracked-games.html">
        My List
      </a>

      <a
  class="btn logoutLink"
  href="#"
>
  Log Out
</a>

      <button
        onclick="toggleTheme()"
        class="icon"
        type="button"
      >
        🌙
      </button>

      <a
        class="icon profileIcon"
        href="profile.html"
      >
        👤
      </a>
    `;
  }

  if (role === 'admin') {

  if (logo) {
    logo.href = 'admin-dashboard.html';
  }

  linksContainer.innerHTML = `
    <a href="admin-dashboard.html">
      Dashboard
    </a>

    <a href="admin-games.html">
      Games
    </a>

    <a href="admin-users.html">
      Users
    </a>

    <a href="admin-complaints.html">
      Complaints
    </a>

    <a href="admin-suggestions.html">
      Suggestions
    </a>

    <a href="admin-announcements.html">
      Announcements
    </a>

    <a
      class="btn logoutLink"
      href="#"
    >
      Log Out
    </a>

    <button
      onclick="toggleTheme()"
      class="icon"
      type="button"
    >
      🌙
    </button>

    <a
      class="icon profileIcon"
      href="profile.html"
      aria-label="My profile"
    >
      👤
    </a>
  `;
}

  // the menu was rebuilt: put the saved avatar and theme icon back
  const avatarMap = {
    default: "👤", cat: "🐱", lion: "🦁", rabbit: "🐰",
    owl: "🦉", duck: "🦆", turtle: "🐢", bear: "🐻"
  };
  const savedAvatar = localStorage.getItem("profile_avatar");
  linksContainer.querySelectorAll(".profileIcon").forEach(icon => {
    icon.textContent = avatarMap[savedAvatar] || avatarMap.default;
  });
  if (typeof updateThemeIcon === "function") {
    updateThemeIcon();
  }

}

document.addEventListener('DOMContentLoaded', () => {

  applyRoleNavigation();

  setActiveNavLink();

});

document.addEventListener('click', async (event) => {

  const logoutLink =
    event.target.closest('.logoutLink');

  if (!logoutLink) {
    return;
  }

  event.preventDefault();

  try {
    await fetch('api/logout.php');
  } catch (error) {
    console.error('Logout request failed:', error);
  }

  localStorage.removeItem('diraUser');

  window.location.href = 'main-home.html';

});

function setActiveNavLink() {

  const currentPage =
    window.location.pathname.split('/').pop();

  const navLinks =
    document.querySelectorAll('.nav .links a');

  navLinks.forEach(link => {
    link.classList.remove('active');
  });

  navLinks.forEach(link => {

    const linkPage =
      link.getAttribute('href');

    if (linkPage === currentPage) {
      link.classList.add('active');
    }

  });

  const storedUser =
    localStorage.getItem('diraUser');

  if (!storedUser) {
    return;
  }

  let user;

  try {
    user = JSON.parse(storedUser);
  } catch {
    return;
  }

  if (
    user.role === 'admin' &&
    currentPage === 'game-details.html'
  ) {

    const gamesLink =
      document.querySelector(
        '.nav .links a[href="admin-games.html"]'
      );

    if (gamesLink) {
      gamesLink.classList.add('active');
    }
  }

  if (
  user.role === 'employee' &&
  currentPage === 'game-details.html'
) {

  const gamesLink =
    document.querySelector(
      '.nav .links a[href="games.html"]'
    );

  if (gamesLink) {
    gamesLink.classList.add('active');
  }
}
}



// Called when an API answers "Not logged in": the browser still thinks the
// user is logged in (localStorage) but the server session is gone.
function handleSessionExpired(data) {
  const msg = String((data && data.message) || '').toLowerCase();
  if (data && data.success === false && msg.includes('not logged in')) {
    localStorage.removeItem('diraUser');
    alert('Your session has expired. Please log in again.');
    window.location.href = 'login.html';
    return true;
  }
  return false;
}

/* =========================================================
   Individuals: dot on "Complaints" in the nav when one of
   their complaints got a new status since they last looked
   ========================================================= */
(function complaintUpdateDot() {
  let role = "";
  try { role = (JSON.parse(localStorage.getItem("diraUser") || "{}").role) || ""; } catch {}
  if (role !== "individual") return;
  if (/my-reports\.html$/i.test(location.pathname)) return;

  const link = document.querySelector('.nav a[href="my-reports.html"]');
  if (!link) return;

  let seen = null;
  try { seen = JSON.parse(localStorage.getItem("diraComplaintSeen") || "null"); } catch {}
  seen = seen || {}; // every complaint starts as Pending

  const norm = (s) => {
    const v = String(s || "").trim().toLowerCase();
    if (v.startsWith("resol") || v === "closed" || v === "done") return "Resolved";
    if (v.includes("review") || v === "in progress") return "Reviewing";
    return "Pending";
  };

  fetch("api/my-reports.php", { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.success) return;
      const changed = (data.reports || []).some((c) => (seen[c.report_id] || "Pending") !== norm(c.status));
      if (changed && !link.querySelector(".nav-dot")) {
        link.insertAdjacentHTML("beforeend", '<span class="nav-dot" title="A complaint has a new status"></span>');
      }
    })
    .catch(() => {});
})();

/* =========================================================
   PHONE MENU: on small screens the page links fold into a
   ☰ button; tapping it opens them under the top bar.
   ========================================================= */
(function phoneMenu() {
  function pageLinks(links) {
    return [...links.children].filter((el) => el.matches("a:not(.btn):not(.icon)"));
  }

  function ensureButton() {
    const nav = document.querySelector(".nav");
    const links = nav && nav.querySelector(".links");
    if (!links || !pageLinks(links).length) return;
    if (links.querySelector(".navMenuBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "navMenuBtn";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", nav.classList.contains("menu-open") ? "true" : "false");
    btn.innerHTML = "<span></span><span></span><span></span>";
    links.appendChild(btn);
  }

  function setOpen(nav, open) {
    nav.classList.toggle("menu-open", open);
    const btn = nav.querySelector(".navMenuBtn");
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
  }

  document.addEventListener("click", (e) => {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    if (e.target.closest(".navMenuBtn")) {
      setOpen(nav, !nav.classList.contains("menu-open"));
      return;
    }
    // a page link was chosen, or a tap outside the bar: close
    if (nav.classList.contains("menu-open") &&
        (!nav.contains(e.target) || e.target.closest(".links > a:not(.btn):not(.icon)"))) {
      setOpen(nav, false);
    }
  });
  document.addEventListener("keydown", (e) => {
    const nav = document.querySelector(".nav.menu-open");
    if (e.key === "Escape" && nav) setOpen(nav, false);
  });

  function start() {
    ensureButton();
    const links = document.querySelector(".nav .links");
    // some pages rebuild the menu (role, profile): put the button back
    if (links && "MutationObserver" in window) {
      new MutationObserver(ensureButton).observe(links, { childList: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* =========================================================
   FOOTER: same simple footer on every page - logo, a
   contact line for support, and one line about the project.
   ========================================================= */
(function siteFooter() {
  function build() {
    document.querySelectorAll(".footer").forEach((footer) => {
      const logo = footer.querySelector(".footer-logo");
      [...footer.children].forEach((el) => { if (el !== logo) el.remove(); });

      const contact = document.createElement("p");
      contact.className = "footerContact";
      contact.innerHTML = 'Questions or feedback? <a href="mailto:dira.mrhn@gmail.com">dira.mrhn@gmail.com</a>';

      const note = document.createElement("p");
      note.className = "footerNote";
      note.textContent = `© ${new Date().getFullYear()} Dir'a · Graduation project`;

      footer.append(contact, note);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();

/* the bell, the maintenance banner and the profile email switch live in their own file */
(function loadNotifications() {
  if (document.querySelector('script[src*="js/notifications.js"]')) return;
  const s = document.createElement("script");
  s.src = "js/notifications.js?v=3";
  s.defer = true;
  document.head.appendChild(s);
})();
