const params = new URLSearchParams(window.location.search);
const gameId = params.get("game_id");

function applyGameDetailsRoleActions() {

  const storedUser =
    localStorage.getItem('diraUser');

  const commentSection =
  document.getElementById('gameCommentSection');

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

  if (commentSection) {
  commentSection.hidden =
    role !== 'individual';
}

  const trackBtn =
    document.getElementById('trackGameBtn');

  const saferBtn =
    document.getElementById('saferAlternativeBtn');

  const reportBtn =
    document.getElementById('reportGameBtn');

  if (role === 'employee') {

    if (reportBtn) {
      reportBtn.hidden = true;
    }

  }

  if (role === 'admin') {

    if (trackBtn) {
      trackBtn.hidden = true;
    }

    if (saferBtn) {
      saferBtn.hidden = true;
    }

    if (reportBtn) {
      reportBtn.hidden = true;
    }

  }

}

document.addEventListener("DOMContentLoaded", () => {

  applyGameDetailsRoleActions();

  const saferBtn =
    document.getElementById("saferAlternativeBtn");

  if (saferBtn && gameId) {
    saferBtn.href =
      `recommendations.html?game_id=${gameId}`;
  }

});

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setHTML(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function getRiskColor(value) {
  value = Number(value || 0);

  if (value >= 70) {
    return '#ef4444';
  }

  if (value >= 31) {
    return '#f59e0b';
  }

  return '#22c55e';
}

function setBar(id, value) {
  const bar = document.getElementById(id);

  if (!bar) return;

  const numericValue = Number(value || 0);

  bar.style.width =
    `${numericValue}%`;

  bar.style.setProperty(
    '--risk-color',
    getRiskColor(numericValue)
  );
}

const labelWeights = {
  sexual_harassment: 0.266,
  hate_speech: 0.201,
  bullying: 0.195,
  threat: 0.182,
  other_toxicity: 0.156
};

function labelPercent(count, total) {
  count = Number(count || 0);
  total = Number(total || 0);

  if (total <= 0) return 0;

  const percent =
    (count / total) * 100;

  return Number(percent.toFixed(2));
}

// Same pills as the game cards: "New" for unanalyzed games,
// otherwise "<percent>% Risk" + the risk level
function renderDetailPills(game, isNew) {
  const box = document.getElementById("gameDetailPills");
  if (!box) return;

  const level = game.overall_risk_level || "Low";
  const riskClass = `risk-${String(level).toLowerCase()}`;

  box.innerHTML = isNew
    ? `<span class="pill new-pill">New</span>`
    : `<span class="pill">${diraPct(game.overall_risk_percent)} Risk</span>
       <span class="pill ${riskClass}">${level}</span>`;
}


// ---------- overview rendering ----------
const RISK_LABELS = [
  ["bullying", "Bullying", "Picking on, mocking or ganging up on players"],
  ["hate_speech", "Hate speech", "Attacks on race, religion, gender or origin"],
  ["threat", "Threats", "Threats of harm, doxxing or real-life violence"],
  ["sexual_harassment", "Sexual harassment", "Unwanted sexual comments or content"],
  ["other_toxicity", "Other toxicity", "Insults, swearing and general hostility"]
];

function riskLevelOf(v) {
  v = Number(v || 0);
  return v >= 70 ? "High" : v >= 31 ? "Medium" : "Low";
}

function formatAnalyzedDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (isNaN(d)) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function renderRisk(game) {
  const overall = Number(game.overall_risk_percent || 0);
  const color = getRiskColor(overall);
  const level = game.overall_risk_level || riskLevelOf(overall);

  // ring
  const ring = document.getElementById("overallRing");
  if (ring) {
    const c = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${c}`;
    ring.style.strokeDashoffset = `${c}`;
    ring.style.stroke = color;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${c * (1 - Math.min(overall, 100) / 100)}`;
    }));
  }
  setText("overallRiskPercent", diraPct(overall));
  const levelEl = document.getElementById("overallRiskLevel");
  if (levelEl) { levelEl.textContent = `${level} risk`; levelEl.style.color = color; }

  setText("commentsCount", Number(game.comments_count || 0).toLocaleString("en-US"));
  setText("lastUpdated", formatAnalyzedDate(game.analyzed_at));

  // breakdown, biggest first
  const rows = RISK_LABELS.map(([key, label, hint]) => ({
    key, label, hint, value: labelPercent(game[key], game.comments_count)
  })).sort((a, b) => b.value - a.value);

  const list = document.getElementById("riskBreakdown");
  if (list) {
    list.innerHTML = rows.map((r) => `
      <li>
        <div class="gx-bar-top">
          <span><b>${r.label}</b><small>${r.hint}</small></span>
          <strong style="color:${getRiskColor(r.value)}">${diraPct(r.value)}</strong>
        </div>
        <div class="gx-bar"><i style="--w:${Math.min(r.value, 100)}%; --c:${getRiskColor(r.value)}"></i></div>
      </li>`).join("");
  }

  // one-line verdict
  const top = rows[0];
  const verdict = document.getElementById("riskVerdict");
  if (verdict) {
    // a low-risk game shouldn't sound like it has a problem
    if (!top || top.value <= 0) {
      verdict.textContent = "Players rarely run into harmful behavior here.";
    } else if (overall < 31) {
      verdict.textContent = `Low risk overall. The little that shows up is mostly ${top.label.toLowerCase()}.`;
    } else {
      verdict.textContent = `${top.label} is the most common problem in this community.`;
    }
  }
}

async function loadGameDetails() {
  if (!gameId) {
    alert("Missing game_id in URL. Open this page from View Details button.");
    return;
  }

  try {
    const res = await fetch(`api/game-details.php?game_id=${gameId}`);
    const data = await res.json();

    console.log("Game details API:", data);

    if (!data.success || !data.game) {
      alert(data.message || "Cannot load game details.");
      return;
    }

    const game = data.game;
    setTrackButton(Number(game.is_tracked || 0) === 1);

    const isNoAnalysis =
  game.analysis_status !== "analyzed" ||
  Number(game.comments_count || 0) === 0;

renderDetailPills(game, isNoAnalysis);

const noAnalysisMessage = document.getElementById("noAnalysisMessage");
const detailMetrics = document.querySelector(".detailMetrics");

if (isNoAnalysis) {
  if (noAnalysisMessage) noAnalysisMessage.style.display = "block";
  if (detailMetrics) detailMetrics.style.display = "none";

  setText("overallRiskPercent", "New");
  setText("overallRiskLevel", "No analysis available");
  setText("lastUpdated", "Not analyzed yet");
} else {
  if (noAnalysisMessage) noAnalysisMessage.style.display = "none";
  if (detailMetrics) detailMetrics.style.display = "grid";

  renderRisk(game);
}

const saferBtn = document.getElementById("saferAlternativeBtn");
if (saferBtn) {
  saferBtn.href = `recommendations.html?game_id=${game.game_id}`;
}


    setText("gameName", game.game_name || "Game Name");
    console.log("image_url:", game.image_url);

const gameImage = document.getElementById("gameImage");

if (gameImage) {
  gameImage.src = game.image_url || "images/default-game.jpg";
  gameImage.alt = game.game_name || "Game image";
}
    setText("gameDescription", game.description || "");
    const year = game.release_date ? String(game.release_date).slice(0, 4) : "";
    setText("gameMeta", [game.platform, year && year !== "0000" ? `Released ${year}` : ""].filter(Boolean).join(" · "));
    document.title = `${game.game_name || "Game"} | DIR'A`;


    setHTML("gameGenres", `
  ${(game.genre || "")
    .split(",")
    .filter(g => g.trim())
    .map(g => `<span>${g.trim()}</span>`)
    .join("")}
`);


    setValue("reportGameId", game.game_id);

  } catch (error) {
    console.error("Game details error:", error);
    alert("Cannot load game details. Check api/game-details.php");
  }
}

function openReportModal() {
  const reportModal = document.getElementById("reportModal");
  if (reportModal) reportModal.classList.add("show");

  setText("reportGameName", document.getElementById("gameName")?.textContent || "");
  setText("reportRiskPercent", document.getElementById("overallRiskPercent")?.textContent || "");
  setText("reportRiskLevel", document.getElementById("overallRiskLevel")?.textContent || "");
}

function closeReportModal() {
  const reportModal = document.getElementById("reportModal");
  if (reportModal) reportModal.classList.remove("show");
}

let isTracked = false;

function setTrackButton(tracked) {
  isTracked = !!tracked;
  const btn = document.getElementById("trackGameBtn");
  if (!btn) return;
  btn.textContent = isTracked ? "Tracked" : "Track";
  btn.classList.toggle("is-tracked", isTracked);
}

function untrackGameFromDetails() {
  fetch("api/untrack-game.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId })
  })
    .then(res => res.json())
    .then(data => {
      if (handleSessionExpired(data)) return;
      if (data.success) {
        setTrackButton(false);
        showToast("Game removed from your list.");
      } else {
        showToast(data.message || "Error removing game.");
      }
    });
}

function trackGame() {
  if (isTracked) {
    untrackGameFromDetails();
    return;
  }

  if (!gameId) {
    alert("Missing game_id.");
    return;
  }

  fetch("api/track-game.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      game_id: gameId
    })
  })
    .then(res => res.json())
    .then(data => {
  if (handleSessionExpired(data)) return;
  if (data.success || /already/i.test(data.message || "")) setTrackButton(true);
  showToast(data.message || "Game added to your list.");
})
    .catch(error => {
      console.error(error);
      alert("Cannot track game.");
    });
}

const behaviorOtherCheck = document.getElementById("behaviorOtherCheck");
const behaviorOtherText = document.getElementById("behaviorOtherText");

if (behaviorOtherCheck && behaviorOtherText) {
  behaviorOtherText.style.display = "none";

  behaviorOtherCheck.addEventListener("change", function () {
    behaviorOtherText.style.display = this.checked ? "block" : "none";

    if (!this.checked) {
      behaviorOtherText.value = "";
    }
  });
}

const reportForm = document.getElementById("reportForm");

if (reportForm) {
  reportForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    fetch("api/create-report.php", {
      method: "POST",
      body: formData
    })
      .then(async res => {
        const text = await res.text();
        console.log("Create report response:", text);

        try {
          return JSON.parse(text);
        } catch {
          throw new Error(text);
        }
      })
      .then(data => {
        const reportMessage = document.getElementById("reportMessage");

        if (data.success) {
  this.reset();

  if (behaviorOtherText) {
    behaviorOtherText.style.display = "none";
    behaviorOtherText.value = "";
  }

  showToast("Report submitted successfully.");
closeReportModal();
} else {
  if (reportMessage) {
    reportMessage.textContent = data.message;
  }
}
      })
      .catch(error => {
        console.error("Submit error:", error);

        const reportMessage = document.getElementById("reportMessage");
        if (reportMessage) {
          reportMessage.textContent =
            "Cannot submit report. Check Console.";
        }
      });
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

const gameCommentText =
  document.getElementById('gameCommentText');

const gameCommentCount =
  document.getElementById('gameCommentCount');

if (gameCommentText && gameCommentCount) {

  gameCommentText.addEventListener(
    'input',
    () => {

      gameCommentCount.textContent =
        `${gameCommentText.value.length} / 1000`;

    }
  );

}

function cleanUserComment(text) {

  return text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/www\.\S+/gi, '')
    .trim()
    .replace(/\s+/g, ' ');

}

function isValidUserComment(text) {

  const cleaned =
    cleanUserComment(text);

  if (!cleaned) {
    return false;
  }

  if (cleaned.length < 20) {
    return false;
  }

  if (!/[A-Za-z]/.test(cleaned)) {
    return false;
  }

  const words =
    cleaned.split(/\s+/);

  if (words.length < 3) {
    return false;
  }

  return true;
}
const submitGameCommentBtn =
  document.getElementById(
    'submitGameCommentBtn'
  );

const gameCommentMessage =
  document.getElementById(
    'gameCommentMessage'
  );

if (
  submitGameCommentBtn &&
  gameCommentText &&
  gameCommentMessage
) {

  submitGameCommentBtn.addEventListener(
    'click',
    async () => {

      const cleanedComment =
        cleanUserComment(
          gameCommentText.value
        );

      if (
        !isValidUserComment(
          cleanedComment
        )
      ) {

        gameCommentMessage.textContent =
          'Please enter a meaningful comment with at least 3 words.';

        return;
      }

      gameCommentMessage.textContent = '';

      submitGameCommentBtn.disabled = true;
      

      try {

        const response = await fetch(
          'api/submit-game-comment.php',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              game_id: gameId,
              comment: cleanedComment
            })
          }
        );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
            'Unable to analyze comment.'
          );
        }

        gameCommentText.value = '';

        gameCommentCount.textContent =
          '0 / 1000';

        showToast(
          'Comment submitted successfully.'
        );

        await loadGameDetails();

      } catch (error) {

        console.error(
          'Comment submit error:',
          error
        );

        gameCommentMessage.textContent =
          error.message ||
          'Unable to submit comment.';

      } finally {

        submitGameCommentBtn.disabled =
          false;

       
      }

    }
  );

}

loadGameDetails();
