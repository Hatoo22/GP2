(() => {
  const token = new URLSearchParams(location.search).get("token") || "";
  const $ = (id) => document.getElementById(id);
  const form = $("setForm");
  const msg = $("setMessage");
  const btn = $("setBtn");
  let purpose = "reset";

  function show(text, type) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = `formMessage authMessage ${type}`;
  }

  function finish(text, type, linkText, href) {
    form.hidden = true;
    $("spDone").hidden = false;
    $("spDoneMessage").textContent = text;
    $("spDoneMessage").className = `formMessage authMessage ${type}`;
    $("spDoneLink").innerHTML = `${linkText} <span>→</span>`;
    $("spDoneLink").href = href;
  }

  async function check() {
    if (!token) {
      $("spLead").textContent = "This page needs the link from your email.";
      finish("Open the link we emailed you, or ask for a new one.", "error", "Request a new link", "forgot-password.html");
      return;
    }
    try {
      const res = await fetch(`api/set-password.php?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        $("spLead").textContent = "This link can't be used anymore.";
        finish(data.message || "This link has expired or was already used.", "error", "Request a new link", "forgot-password.html");
        return;
      }
      purpose = data.purpose;
      $("spEmail").value = data.email || "";
      if (purpose === "invite") {
        $("spTitle").innerHTML = "Welcome to<br><em>Dir'a.</em>";
        $("spLead").textContent = "You were invited as an administrator. Add your name and choose a password to activate your account.";
        $("spNameField").hidden = false;
        btn.innerHTML = "Activate account <span>→</span>";
      } else {
        $("spLead").textContent = "Choose a new password for your account.";
      }
      form.hidden = false;
      (purpose === "invite" ? $("spName") : $("spPassword")).focus();
    } catch {
      $("spLead").textContent = "Couldn't check your link. Refresh the page to try again.";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = $("spPassword").value;
    const confirm = $("spConfirm").value;
    const name = $("spName").value.trim();

    if (purpose === "invite" && name.length < 2) return show("Please enter your full name.", "error");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return show("Use at least 8 characters with letters and numbers.", "error");
    }
    if (password !== confirm) return show("The two passwords don't match.", "error");

    btn.disabled = true;
    try {
      const res = await fetch("api/set-password.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        $("spLead").textContent = "All set.";
        finish(data.message, "success", "Go to log in", "login.html");
      } else if (data.same_password) {
        $("spLead").textContent = "Good news.";
        finish(data.message, "success", "Go to log in", "login.html");
      } else if (data.expired) {
        finish(data.message, "error", "Request a new link", "forgot-password.html");
      } else {
        show(data.message || "Couldn't save your password. Please try again.", "error");
      }
    } catch {
      show("Couldn't connect. Check your internet and try again.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  check();
})();
