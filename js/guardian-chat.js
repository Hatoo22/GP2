/* =========================================================
   DIR'A GUARDIAN — ASSISTANT CHAT
   Click the robot to open a small guided chat:
   - FAQ answers
   - Suggest a game (sends the game name)
   - Send a suggestion (free text)
   ========================================================= */
(function () {
  const guardianEl = document.getElementById("dirGuardian");
  if (!guardianEl || document.body.classList.contains("authPage")) return;

  // The assistant is for individual users only (not government employees or admins)
  let role = "individual";
  try {
    role = String(JSON.parse(localStorage.getItem("diraUser") || "{}").role || "individual").toLowerCase();
  } catch { /* keep default */ }
  if (role !== "individual") {
    guardianEl.remove();
    return;
  }

  const FAQS = [
    {
      q: "What is DIR'A?",
      a: "DIR'A is an AI-powered platform that analyzes what players say about games and detects harmful behavior, so you can see how safe a game's community is before you or your kids play it."
    },
    {
      q: "How is the risk score calculated?",
      a: "Our AI model reads public player comments about each game and detects five types of harmful behavior: threats, bullying, sexual harassment, hate speech and other toxicity. Each type has a weight, and together they make the game's overall risk percentage."
    },
    {
      q: "What do Low, Medium and High mean?",
      a: "Low = risk score up to 30%.\nMedium = from 31% to 69%.\nHigh = 70% or more.\nHigher means more harmful behavior was found in the game's community."
    },
    {
      q: "Why does a game show “New”?",
      a: "“New” means the game hasn't been analyzed yet, because we don't have enough comments about it so far. Its risk score will appear once the analysis is done."
    },
    {
      q: "How do I add a game to My List?",
      a: "Click the heart ♡ on any game card. The game is saved to “My List” at the top of the page, so you can follow it."
    },
    {
      q: "How do I compare games?",
      a: "Click the ⇄ icon on up to 6 game cards. A bar appears at the bottom of the page. Then press “Compare Games” to see them side by side."
    },
    {
      q: "How do I report harmful behavior?",
      a: "Open the game's details page and press “Report”. Choose the type of behavior, how serious it is and where it happened, then submit. You can follow your reports from the “Reports” page."
    }
  ];

  /* ---------- build the panel ---------- */
  const hint = document.createElement("div");
  hint.className = "guardianHint";
  hint.textContent = "Need help? Click me!";
  document.body.appendChild(hint);

  const panel = document.createElement("section");
  panel.className = "guardianChat";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "DIR'A assistant");
  panel.innerHTML = `
    <header class="guardianChatHead">
      <div class="guardianChatTitle">
        <span class="guardianChatDot"></span>
        <div>
          <strong>Dir'a Assistant</strong>
          <small>Here to help</small>
        </div>
      </div>
      <button type="button" class="guardianChatClose" aria-label="Close chat">×</button>
    </header>
    <div class="guardianChatBody" aria-live="polite"></div>
    <div class="guardianChatOptions"></div>
    <form class="guardianChatForm" hidden>
      <textarea rows="1" maxlength="1000" placeholder="Type here..."></textarea>
      <button type="submit" class="guardianChatSend" aria-label="Send">➤</button>
    </form>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector(".guardianChatBody");
  const options = panel.querySelector(".guardianChatOptions");
  const form = panel.querySelector(".guardianChatForm");
  const input = form.querySelector("textarea");
  const closeBtn = panel.querySelector(".guardianChatClose");

  // options live inside the conversation, always after the last message,
  // so everything scrolls together as one chat
  body.appendChild(options);

  let mode = null;      // "game_suggestion" | "general_suggestion" | null
  let started = false;
  let sending = false;

  /* ---------- helpers ---------- */
  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }

  function addMsg(text, who) {
    const msg = document.createElement("div");
    msg.className = `guardianMsg guardianMsg--${who}`;
    msg.textContent = text;
    body.insertBefore(msg, options);
    scrollDown();
    return msg;
  }

  function botSay(text, then) {
    const typing = document.createElement("div");
    typing.className = "guardianMsg guardianMsg--bot guardianTyping";
    typing.innerHTML = "<span></span><span></span><span></span>";
    body.insertBefore(typing, options);
    scrollDown();

    setTimeout(() => {
      typing.remove();
      addMsg(text, "bot");
      if (then) then();
    }, 450);
  }

  function setOptions(list) {
    options.innerHTML = "";
    list.forEach(({ label, action, variant }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "guardianChip" + (variant ? ` guardianChip--${variant}` : "");
      b.textContent = label;
      b.addEventListener("click", action);
      options.appendChild(b);
    });
    scrollDown();
  }

  function showInput(placeholder, maxLength) {
    input.value = "";
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    form.hidden = false;
    setTimeout(() => input.focus(), 50);
  }

  function hideInput() {
    form.hidden = true;
    mode = null;
  }

  function react(type) {
    if (typeof guardianReact === "function") {
      guardianReact(type);
      setTimeout(() => {
        if (typeof guardianIdle === "function") guardianIdle();
      }, 1400);
    }
  }

  /* ---------- flows ---------- */
  function mainMenu(text) {
    hideInput();
    botSay(text || "How can I help you?", () => {
      setOptions([
        { label: "❓ I have a question", action: faqMenu },
        { label: "🎮 Suggest a game", action: suggestGame },
        { label: "💡 Send a suggestion", action: sendSuggestion }
      ]);
    });
  }

  function faqMenu() {
    hideInput();
    addMsg("I have a question", "user");
    setOptions([]);
    botSay("Sure! Pick one of these common questions:", showFaqList);
  }

  function showFaqList() {
    setOptions([
      ...FAQS.map((f) => ({ label: f.q, action: () => answerFaq(f) })),
      { label: "← Main menu", action: () => mainMenu(), variant: "ghost" }
    ]);
  }

  function answerFaq(f) {
    addMsg(f.q, "user");
    setOptions([]);
    botSay(f.a, () => {
      setOptions([
        { label: "Another question", action: () => botSay("Here you go:", showFaqList) },
        { label: "← Main menu", action: () => mainMenu("Anything else I can help with?"), variant: "ghost" }
      ]);
    });
  }

  function suggestGame() {
    addMsg("Suggest a game", "user");
    setOptions([]);
    botSay("Great! What's the name of the game you'd like us to add?", () => {
      mode = "game_suggestion";
      showInput("Game name...", 150);
      setOptions([{ label: "Cancel", action: () => mainMenu(), variant: "ghost" }]);
    });
  }

  function sendSuggestion() {
    addMsg("Send a suggestion", "user");
    setOptions([]);
    botSay("I'd love to hear it! Write your suggestion and I'll pass it to the DIR'A team.", () => {
      mode = "general_suggestion";
      showInput("Write your suggestion...", 1000);
      setOptions([{ label: "Cancel", action: () => mainMenu(), variant: "ghost" }]);
    });
  }

  async function submitText(text) {
    if (sending) return;
    sending = true;

    const type = mode;
    addMsg(text, "user");
    hideInput();
    setOptions([]);

    try {
      const data = new FormData();
      data.append("type", type);
      data.append("message", text);

      const res = await fetch("api/assistant-feedback.php", {
        method: "POST",
        body: data,
        credentials: "same-origin"
      });
      const json = await res.json();

      if (!json.success) throw new Error(json.message || "Failed");

      react("low");
      const thanks = type === "game_suggestion"
        ? `Thanks! I sent “${text}” to our team. They'll review it and may add it soon.`
        : "Thank you! Your suggestion was sent to the DIR'A team.";
      botSay(thanks, () => mainMenu("Anything else I can help with?"));
    } catch (err) {
      react("medium");
      botSay(`Sorry, I couldn't send that. ${err.message || ""}`.trim(), () => {
        setOptions([
          { label: "Try again", action: () => (type === "game_suggestion" ? suggestGame() : sendSuggestion()) },
          { label: "← Main menu", action: () => mainMenu(), variant: "ghost" }
        ]);
      });
    } finally {
      sending = false;
    }
  }

  /* ---------- open / close ---------- */
  function openChat() {
    hint.classList.remove("show");
    panel.classList.add("open");
    guardianEl.classList.add("guardian-chat-open");

    if (!started) {
      started = true;
      react("low");
      botSay("Hi! I'm Dir'a, your Assistant 👋", () => mainMenu());
    }
  }

  function closeChat() {
    panel.classList.remove("open");
    guardianEl.classList.remove("guardian-chat-open");
  }

  guardianEl.addEventListener("click", () => {
    panel.classList.contains("open") ? closeChat() : openChat();
  });

  guardianEl.setAttribute("role", "button");
  guardianEl.setAttribute("tabindex", "0");
  guardianEl.setAttribute("aria-label", "Open DIR'A assistant");
  guardianEl.removeAttribute("aria-hidden");
  guardianEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      guardianEl.click();
    }
  });

  closeBtn.addEventListener("click", closeChat);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closeChat();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !mode) return;
    submitText(text);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  /* small hint bubble a moment after the page loads */
  setTimeout(() => {
    if (!panel.classList.contains("open")) hint.classList.add("show");
  }, 1500);
  setTimeout(() => hint.classList.remove("show"), 7500);
})();
