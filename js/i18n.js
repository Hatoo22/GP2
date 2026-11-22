/* =========================================================
   DIR'A language switch (English / العربية)

   - The site is written in English. When Arabic is chosen, this file
     turns the page right-to-left and swaps every English text it knows
     (from js/i18n-ar.js) for its Arabic translation, including text that
     the page scripts add later (cards, messages, pop-ups).
   - The choice is saved in localStorage ("diraLang") so it stays on
     every page until the visitor switches back.
   - Load it in <head> on every page, before the page scripts.
========================================================= */
(function () {
  "use strict";

  var LANG = "en";
  try { if (localStorage.getItem("diraLang") === "ar") LANG = "ar"; } catch (e) {}
  window.DIRA_LANG = LANG;

  var root = document.documentElement;

  window.diraSetLang = function (lang) {
    try { localStorage.setItem("diraLang", lang === "ar" ? "ar" : "en"); } catch (e) {}
    location.reload();
  };

  /* small helper the page scripts can use: diraT("Hello {name}", {name: x}) */
  window.diraT = function (text, vars) {
    var out = (LANG === "ar" && window.__diraTr) ? (window.__diraTr(text) || text) : text;
    if (vars) out = out.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return out;
  };

  /* ---------- the switch button, next to the theme button ---------- */
  function addSwitch() {
    var themeButtons = document.querySelectorAll('button[onclick="toggleTheme()"]');
    themeButtons.forEach(function (themeBtn) {
      if (themeBtn.parentNode.querySelector(":scope > .langSwitch")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "icon langSwitch" + (themeBtn.classList.contains("authTheme") ? " authTheme" : "");
      b.setAttribute("data-no-i18n", "");
      if (LANG === "ar") {
        b.textContent = "EN";
        b.lang = "en";
        b.setAttribute("aria-label", "Switch to English");
        b.title = "English";
      } else {
        b.textContent = "ع";
        b.lang = "ar";
        b.setAttribute("aria-label", "التبديل إلى العربية");
        b.title = "العربية";
      }
      b.addEventListener("click", function () { window.diraSetLang(LANG === "ar" ? "en" : "ar"); });
      themeBtn.parentNode.insertBefore(b, themeBtn);
    });
  }

  // some pages rebuild their top bar after loading, so keep the button there
  function keepSwitch() {
    addSwitch();
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () { queued = false; addSwitch(); }, 0);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (LANG !== "ar") {
    document.addEventListener("DOMContentLoaded", keepSwitch);
    return;
  }

  /* ================= Arabic mode ================= */
  root.lang = "ar";
  root.dir = "rtl";
  root.classList.add("lang-ar", "i18n-wait");

  // right-to-left versions of the main style sheets (style.rtl.css and
  // guardian.rtl.css are made from the normal ones with the rtlcss tool)
  var sheetsReady = [];
  Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function (link) {
    var href = link.getAttribute("href") || "";
    var m = href.match(/^(style|guardian)\.css(\?.*)?$/);
    if (!m) return;
    sheetsReady.push(new Promise(function (done) {
      link.addEventListener("load", done);
      link.addEventListener("error", done);
    }));
    link.setAttribute("href", m[1] + ".rtl.css" + (m[2] || ""));
  });

  // Arabic font + the dictionary (loaded only for Arabic visitors)
  document.write(
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">' +
    '<style>html.i18n-wait body{opacity:0}</style>' +
    '<script src="js/i18n-ar.js?v=1"><\/script>'
  );

  /* dates: the page scripts ask for "en-GB" dates; give Arabic month names
     with the normal (Gregorian) calendar and Western digits */
  var AR_LOCALE = "ar-SA-u-ca-gregory-nu-latn";
  ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"].forEach(function (fn) {
    var orig = Date.prototype[fn];
    Date.prototype[fn] = function (locale, opts) {
      if (locale == null || /^en/i.test(String(locale))) locale = AR_LOCALE;
      return orig.call(this, locale, opts);
    };
  });

  /* ---------- translation ---------- */
  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }

  function dict() { return window.DIRA_AR || {}; }
  function patterns() { return window.DIRA_AR_PATTERNS || []; }

  var cache = Object.create(null);

  function tr(text) {
    var key = norm(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    if (key in cache) return cache[key];
    var d = dict(), out = null;
    if (Object.prototype.hasOwnProperty.call(d, key)) out = d[key];
    else {
      var pats = patterns();
      for (var i = 0; i < pats.length; i++) {
        var m = key.match(pats[i][0]);
        if (!m) continue;
        var rep = pats[i][1];
        out = typeof rep === "function"
          ? rep(m, trOrSame)
          : rep.replace(/([$%])(\d)/g, function (all, kind, n) {
              var v = m[+n] == null ? "" : m[+n];
              return kind === "%" ? trOrSame(v) : v;
            });
        break;
      }
    }
    cache[key] = out;
    return out;
  }
  function trOrSame(s) {
    if (s == null) return "";
    var t = tr(s);
    return t == null ? s : t;
  }
  window.__diraTr = tr;
  window.diraTr = trOrSame;

  var ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tip", "data-label"];

  function skip(el, forText) {
    if (!el || !el.closest) return true;
    return !!el.closest(forText
      ? "script,style,noscript,textarea,[data-no-i18n],[contenteditable=true]"
      : "script,style,noscript,[data-no-i18n]");
  }

  function doText(node) {
    var v = node.nodeValue;
    if (!v) return;
    if (!/[A-Za-z]/.test(v)) {
      // "<1%" would show as "1%>" in right-to-left text
      var pe = node.parentElement;
      if (/^\s*[<>]\s*\d/.test(v) && pe && pe.childNodes.length === 1 && !pe.hasAttribute("dir")) pe.setAttribute("dir", "ltr");
      return;
    }
    if (skip(node.parentElement, true)) return;
    var t = tr(v);
    if (t == null) {
      // English that stays English (a game's description, what a user wrote):
      // let it keep its own direction so the punctuation stays in place
      var p = node.parentElement;
      if (p && !p.hasAttribute("dir") && p.childNodes.length === 1 &&
          /^[\s"“'(]*[A-Za-z]/.test(v) && /[.!?:)"”'…]\s*$/.test(v)) p.setAttribute("dir", "auto");
      return;
    }
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    var nv = lead + t + trail;
    if (nv !== v) node.nodeValue = nv;
  }

  function doAttrs(el) {
    if (skip(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var v = el.getAttribute(a), t = tr(v);
      if (t != null && t !== v) el.setAttribute(a, t);
    }
    if (el.tagName === "INPUT" && /^(submit|button|reset)$/i.test(el.type) && el.value) {
      var tv = tr(el.value);
      if (tv != null && tv !== el.value) el.value = tv;
    }
  }

  function walk(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) doAttrs(rootNode);
    var w = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doAttrs(n);
    }
  }

  function doTitle() {
    var t = tr(document.title);
    if (t != null && t !== document.title) document.title = t;
  }

  /* pop-up messages the scripts show with alert / confirm / prompt */
  ["alert", "confirm", "prompt"].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== "function") return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof msg === "string") args[0] = trOrSame(msg);
      return orig.apply(window, args);
    };
  });

  /* the browser's own "Please fill out this field" bubbles, in Arabic */
  function validityText(el) {
    var v = el.validity;
    if (v.valueMissing) {
      if (el.type === "checkbox") return "حدّد هذا الخيار للمتابعة.";
      if (el.type === "radio") return "اختر أحد الخيارات.";
      if (el.tagName === "SELECT") return "اختر عنصرًا من القائمة.";
      return "املأ هذا الحقل من فضلك.";
    }
    if (v.typeMismatch) return el.type === "email" ? "أدخل بريدًا إلكترونيًا صحيحًا من فضلك." : "أدخل قيمة صحيحة من فضلك.";
    if (v.tooShort) return "أدخل " + el.minLength + " أحرف على الأقل من فضلك.";
    if (v.tooLong) return "النص أطول من المسموح.";
    if (v.patternMismatch) return el.title ? trOrSame(el.title) : "اكتب القيمة بالشكل المطلوب من فضلك.";
    if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch) return "أدخل قيمة صحيحة من فضلك.";
    if (v.badInput) return "أدخل قيمة صحيحة من فضلك.";
    return "";
  }
  document.addEventListener("invalid", function (e) {
    var el = e.target;
    if (!el || !el.setCustomValidity || el.validity.customError) return;
    var msg = validityText(el);
    if (msg) { el.setCustomValidity(msg); el.dataset.diraV = "1"; }
  }, true);
  function clearOne(el) {
    if (el && el.setCustomValidity && el.dataset && el.dataset.diraV === "1") {
      el.setCustomValidity("");
      delete el.dataset.diraV;
    }
  }
  // before the browser checks a form again, remove our messages so only real problems count
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest('button, input[type="submit"]');
    if (!b || !b.form || (b.type !== "submit")) return;
    Array.prototype.forEach.call(b.form.elements, clearOne);
  }, true);
  ["requestSubmit", "reportValidity", "checkValidity"].forEach(function (fn) {
    var orig = HTMLFormElement.prototype[fn];
    if (!orig) return;
    HTMLFormElement.prototype[fn] = function () {
      Array.prototype.forEach.call(this.elements, clearOne);
      return orig.apply(this, arguments);
    };
  });
  function clearValidity(e) {
    var el = e.target;
    if (el && el.setCustomValidity && el.dataset && el.dataset.diraV === "1") {
      clearOne(el);
      // radio buttons in the same group share the message
      if (el.type === "radio" && el.name && el.form) {
        Array.prototype.forEach.call(el.form.querySelectorAll('input[type="radio"]'), function (r) {
          if (r.name === el.name) clearOne(r);
        });
      }
    }
  }
  document.addEventListener("input", clearValidity, true);
  document.addEventListener("change", clearValidity, true);

  var observer;
  function start() {
    walk(document.body);
    doTitle();
    keepSwitch();
    observer = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(["value"])
    });
    var titleEl = document.querySelector("title");
    if (titleEl) new MutationObserver(doTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
    Promise.all(sheetsReady).then(function () { root.classList.remove("i18n-wait"); });
  }

  // run after the page scripts' own start-up code, so they still see the
  // English text they expect while setting up
  document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 0); });
  // never leave the page hidden
  setTimeout(function () { root.classList.remove("i18n-wait"); }, 2500);
})();
