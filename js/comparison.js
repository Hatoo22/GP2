console.log("Comparison ready");

let gamesData = [];

const labelWeights = {
  sexual_harassment: 0.266,
  hate_speech: 0.201,
  bullying: 0.195,
  threat: 0.182,
  other_toxicity: 0.156
};


async function loadComparisonGames() {
  try {
    const response = await fetch("api/games.php");
    const data = await response.json();

    if (!data.success) {
      showMessage(data.message || "Cannot load games.");
      return;
    }

    gamesData = data.games || [];

    const params = new URLSearchParams(window.location.search);
    const gamesParam = params.get("games");

    if (!gamesParam) {
      showMessage("No games were selected.");
      return;
    }

    const selectedIds = gamesParam
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);

    if (selectedIds.length < 2 || selectedIds.length > 6) {
      showMessage("Please select between 2 and 6 games.");
      return;
    }

    const selectedGames = selectedIds
      .map(id => getGameById(id))
      .filter(Boolean);

    if (selectedGames.length !== selectedIds.length) {
      showMessage("Some selected games could not be found.");
      return;
    }

    const unavailableGames = selectedGames.filter(
  game => game.analysis_status === "no_comments"
);

const comparableGames = selectedGames.filter(
  game => game.analysis_status !== "no_comments"
);

if (comparableGames.length < 2) {
  showMessage(
    "At least two analyzed games are required to start a comparison."
  );
  return;
}

if (unavailableGames.length > 0) {
  const names = unavailableGames
    .map(game => game.game_name)
    .join(", ");

  document.getElementById("compareMessage").textContent =
    `${names} ${
      unavailableGames.length === 1 ? "was" : "were"
    } excluded from the comparison because ${
      unavailableGames.length === 1 ? "it does" : "they do"
    } not have enough comments yet.`;
}

displayGameComparison(comparableGames);


  } catch (error) {
    console.error("Comparison load error:", error);
    showMessage("Cannot load games.");
  }
}


function showMessage(message) {
  const messageElement = document.getElementById("compareMessage");

  if (messageElement) {
    messageElement.textContent = message;
  }

  document.getElementById("comparisonResult").style.display = "none";
}


function getGameById(id) {
  return gamesData.find(
    game => String(game.game_id) === String(id)
  );
}


function getRiskValue(game) {
  return Number(game.overall_risk_percent || 0);
}


function weightedLabelPercent(count, total, label) {
  count = Number(count || 0);
  total = Number(total || 0);

  if (total <= 0) return 0;

  // Breakdown shows the share of comments with this behavior (same as the
  // game page). The weights are only used to build the overall risk score.
  const rawPercent = Math.min(100, (count / total) * 100);

  return Number(rawPercent.toFixed(2));
}


// one colour per game, used in the score tiles and the behavior bars
const GAME_COLORS = ["#06b6d4", "#8b5cf6", "#ec4899", "#3b82f6", "#84cc16", "#f97316"];
const CMP_BEHAVIORS = [
  ["bullying", "Bullying"],
  ["hate_speech", "Hate speech"],
  ["threat", "Threats"],
  ["sexual_harassment", "Sexual harassment"],
  ["other_toxicity", "Other toxicity"]
];

function cmpEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function cmpRiskColor(v) {
  return v >= 70 ? "#ef4444" : v >= 31 ? "#f59e0b" : "#22c55e";
}

function displayGameComparison(selectedGames) {
  const comparisonResult = document.getElementById("comparisonResult");
  const comparisonGrid = document.getElementById("comparisonGrid");
  comparisonResult.style.display = "block";

  const games = selectedGames.map((g, i) => ({ ...g, _color: GAME_COLORS[i % GAME_COLORS.length] }));
  const lowest = Math.min(...games.map(getRiskValue));

  // 1) score tiles
  const tiles = games.map(g => {
    const r = getRiskValue(g);
    const safest = r === lowest && games.filter(x => getRiskValue(x) === lowest).length === 1;
    return `
      <a class="cmp-tile" href="game-details.html?game_id=${encodeURIComponent(g.game_id)}" style="--g:${g._color}">
        <span class="cmp-tile-img">${g.image_url ? `<img src="${cmpEsc(g.image_url)}" alt="" loading="lazy">` : ""}</span>
        <span class="cmp-tile-name"><i></i>${cmpEsc(g.game_name)}</span>
        <strong style="color:${cmpRiskColor(r)}">${diraPct(r)}</strong>
        <span class="cmp-tile-level">${cmpEsc(g.overall_risk_level || "Low")} risk</span>
        ${safest ? `<em class="cmp-safest">Safest</em>` : ""}
      </a>`;
  }).join("");

  // 2) behavior by behavior
  const rows = CMP_BEHAVIORS.map(([key, label]) => `
    <li>
      <span class="cmp-b-label">${label}</span>
      <span class="cmp-b-bars">
        ${games.map(g => {
          const v = weightedLabelPercent(g[key], g.comments_count, key);
          return `<span class="cmp-bar" style="--g:${g._color}" title="${cmpEsc(g.game_name)}: ${diraPct(v)}"><i style="--w:${v}%"></i><em>${diraPct(v)}</em></span>`;
        }).join("")}
      </span>
    </li>`).join("");

  const legend = games.map(g => `<span style="--g:${g._color}"><i></i>${cmpEsc(g.game_name)}</span>`).join("");

  comparisonGrid.className = "cmp";
  comparisonGrid.innerHTML = `
    <div class="cmp-tiles cmp-tiles--${Math.min(games.length, 6)}">${tiles}</div>
    <article class="cmp-card">
      <div class="cmp-card-head">
        <h2>What players run into</h2>
        <div class="cmp-legend">${legend}</div>
      </div>
      <ul class="cmp-behaviors">${rows}</ul>
    </article>`;

  document.getElementById("resultText").innerHTML = createComparisonSummary(selectedGames);
}


function createGameComparisonCard(game) {
  const riskValue = getRiskValue(game);

  const riskLevel =
    String(game.overall_risk_level || "Low").toLowerCase();

  return `
    <div class="compare-card">

  <div class="compareImageWrap">

    ${
      game.image_url
        ? `<img
             class="thumb"
             src="${game.image_url}"
             alt="${game.game_name}"
           >`
        : `<div class="thumb placeholder"></div>`
    }

    <span class="pill risk-${riskLevel} compareLevelPill">
      ${game.overall_risk_level || "Low"}
    </span>

  </div>

      <h3>${game.game_name}</h3>

      <p class="risk-label">Risk Score</p>

      <div
        class="risk-circle dynamic-risk-circle"
        data-risk="${riskValue}"
      >
        <span>${riskValue}%</span>
      </div>

      <div class="toxicity-breakdown">
        ${createBreakdown(game)}
      </div>

    </div>
  `;
}


function createBreakdown(game) {
  return `
    ${createBar(
      "Bullying",
      weightedLabelPercent(
        game.bullying,
        game.comments_count,
        "bullying"
      )
    )}

    ${createBar(
      "Sexual Harassment",
      weightedLabelPercent(
        game.sexual_harassment,
        game.comments_count,
        "sexual_harassment"
      )
    )}

    ${createBar(
      "Threat",
      weightedLabelPercent(
        game.threat,
        game.comments_count,
        "threat"
      )
    )}

    ${createBar(
      "Hate Speech",
      weightedLabelPercent(
        game.hate_speech,
        game.comments_count,
        "hate_speech"
      )
    )}

    ${createBar(
      "Other Toxicity",
      weightedLabelPercent(
        game.other_toxicity,
        game.comments_count,
        "other_toxicity"
      )
    )}
  `;
}


function createBar(label, value) {
  const percent = Number(value || 0);

  return `
    <div class="risk-row">
      <strong>${label}</strong>

      <small>${percent}%</small>

      <div class="bar">
        <span style="width:${percent}%"></span>
      </div>
    </div>
  `;
}


function createComparisonSummary(selectedGames) {
  const sortedGames = [...selectedGames].sort(
    (a, b) => getRiskValue(b) - getRiskValue(a)
  );

  const highestGame = sortedGames[0];
  const lowestGame = sortedGames[sortedGames.length - 1];

  const highestRisk = getRiskValue(highestGame);
  const lowestRisk = getRiskValue(lowestGame);

  const difference = Number(
    (highestRisk - lowestRisk).toFixed(2)
  );

  const topLabels = getTopToxicLabels(highestGame);

  let summary = `
    <strong>${highestGame.game_name}</strong>
    has the highest overall risk score among the selected games
    at <strong>${highestRisk}%</strong>.
  `;

  if (selectedGames.length > 2) {
    summary += `
      <strong>${lowestGame.game_name}</strong>
      has the lowest overall risk score at
      <strong>${lowestRisk}%</strong>.
    `;
  }

  if (difference <= 5) {
    summary += `
      Overall, the risk scores of the selected games are relatively close.
    `;
  } else {
    summary += `
      The difference between the highest and lowest risk scores
      is <strong>${difference}%</strong>.
    `;
  }

  if (topLabels.length > 0) {
    summary += `
      The main toxicity indicators associated with
      <strong>${highestGame.game_name}</strong>
      are <strong>${formatLabels(topLabels)}</strong>.
    `;
  }

  return summary;
}


function getTopToxicLabels(game) {
  const labels = [
    {
      name: "bullying",
      value: weightedLabelPercent(
        game.bullying,
        game.comments_count,
        "bullying"
      )
    },
    {
      name: "sexual harassment",
      value: weightedLabelPercent(
        game.sexual_harassment,
        game.comments_count,
        "sexual_harassment"
      )
    },
    {
      name: "threat",
      value: weightedLabelPercent(
        game.threat,
        game.comments_count,
        "threat"
      )
    },
    {
      name: "hate speech",
      value: weightedLabelPercent(
        game.hate_speech,
        game.comments_count,
        "hate_speech"
      )
    },
    {
      name: "other toxicity",
      value: weightedLabelPercent(
        game.other_toxicity,
        game.comments_count,
        "other_toxicity"
      )
    }
  ];

  return labels
    .filter(label => label.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map(label => label.name);
}


function formatLabels(labels) {
  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]} and ${labels[1]}`;
}


function renderRiskCircles() {
  const styles = getComputedStyle(document.body);

  const fill =
    styles.getPropertyValue("--compare-circle-fill").trim()
    || "#32C5D2";

  const track =
    styles.getPropertyValue("--compare-circle-track").trim()
    || "#d9d9d9";

  document
    .querySelectorAll(".dynamic-risk-circle")
    .forEach(circle => {
      const percentage =
        Number(circle.dataset.risk || 0);

      circle.style.background = `
        conic-gradient(
          ${fill} 0% ${percentage}%,
          ${track} ${percentage}% 100%
        )
      `;
    });
}


loadComparisonGames().then(() => {
  renderRiskCircles();
});