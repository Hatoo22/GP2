(() => {
  const form = document.getElementById("forgotForm");
  const msg = document.getElementById("forgotMessage");
  const btn = document.getElementById("forgotBtn");
  const email = document.getElementById("forgotEmail");

  // carry over the email typed on the login page
  const pre = new URLSearchParams(location.search).get("email");
  if (pre) email.value = pre;

  function show(text, type) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = `formMessage authMessage ${type}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      show("Please enter a valid email address.", "error");
      email.focus();
      return;
    }
    btn.disabled = true;
    btn.firstChild.textContent = "Sending… ";
    try {
      const res = await fetch("api/forgot-password.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value })
      });
      const data = await res.json().catch(() => ({}));
      show(data.message || "Something went wrong. Please try again.", data.success ? "success" : "error");
      if (data.no_account) {
        // no account with this email: offer sign up right under the message
        const link = document.createElement("a");
        link.href = "signup.html";
        link.className = "authInlineLink";
        link.textContent = "create an account";
        msg.append(" ", link, ".");
      }
      if (data.success) form.querySelector(".field").hidden = true;
      btn.hidden = !!data.success;
    } catch {
      show("Couldn't connect. Check your internet and try again.", "error");
    } finally {
      btn.disabled = false;
      btn.firstChild.textContent = "Send reset link ";
    }
  });
})();
