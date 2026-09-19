const params = new URLSearchParams(window.location.search);
const gameId = params.get("game_id");

document.addEventListener("DOMContentLoaded", () => {
  const saferBtn =
    document.getElementById("saferAlternativeBtn");

  if (saferBtn && gameId) {
    saferBtn.href =
      `recommendations.html?game_id=${gameId}`;
  }

  initializeReviewForm();
});

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function setValue(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.value = value;
  }
}

function setHTML(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.innerHTML = value;
  }
}




function getRiskColor(value) {
  const risk = Number(value) || 0;

  // 0–30: Low
  if (risk <= 30) {
    return {
      level: "Low",
      solid: "#22c55e",
      gradient: "linear-gradient(90deg, #4ade80, #16a34a)"
    };
  }

  // More than 30 and less than 70: Medium
  if (risk < 70) {
    return {
      level: "Medium",
      solid: "#f59e0b",
      gradient: "linear-gradient(90deg, #fde047, #f59e0b)"
    };
  }

  // 70–100: High
  return {
    level: "High",
    solid: "#ef4444",
    gradient: "linear-gradient(90deg, #ef4444, #dc2626)"
  };
}

function setBar(id, value) {
  const bar = document.getElementById(id);

  if (!bar) return;

  const safeValue = Math.max(
    0,
    Math.min(100, Number(value) || 0)
  );

  const riskStyle = getRiskColor(safeValue);

  bar.style.width = `${safeValue}%`;

  bar.style.setProperty(
    "background",
    riskStyle.gradient,
    "important"
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
  const numericCount = Number(count) || 0;
  const numericTotal = Number(total) || 0;

  if (numericTotal <= 0) {
    return 0;
  }

  const percentage =
    (numericCount / numericTotal) * 100;

  return Number(percentage.toFixed(2));
}

async function loadGameDetails() {
  if (!gameId) {
    alert(
      "Missing game_id in URL. " +
      "Open this page from the View Details button."
    );

    return;
  }

  try {
    const response = await fetch(
      `api/game-details.php?game_id=${gameId}`
    );

    const data = await response.json();

    console.log("Game details API:", data);

    if (!data.success || !data.game) {
      alert(
        data.message || "Cannot load game details."
      );

      return;
    }

    const game = data.game;

    const isNoAnalysis =
      game.analysis_status === "no_comments" ||
      Number(game.comments_count || 0) === 0;

    const noAnalysisMessage =
      document.getElementById("noAnalysisMessage");

    const detailMetrics =
      document.querySelector(".detailMetrics");

    if (isNoAnalysis) {
      if (noAnalysisMessage) {
        noAnalysisMessage.style.display = "block";
      }

      if (detailMetrics) {
        detailMetrics.style.display = "none";
      }

      setText("overallRiskPercent", "New");

      setText(
        "overallRiskLevel",
        "No analysis available"
      );

      setText(
        "lastUpdated",
        "Not analyzed yet"
      );
    } else {
      if (noAnalysisMessage) {
        noAnalysisMessage.style.display = "none";
      }

      if (detailMetrics) {
        detailMetrics.style.display = "grid";
      }

      setText(
        "lastUpdated",
        game.analyzed_at || "Today"
      );

      const overallGauge =
        document.getElementById("overallGauge");

      const overallRiskLevelElement =
        document.getElementById("overallRiskLevel");

      const overallPercent = Math.max(
        0,
        Math.min(
          100,
          Number(game.overall_risk_percent) || 0
        )
      );

      const overallRiskStyle =
        getRiskColor(overallPercent);

      setText(
        "overallRiskPercent",
        `${overallPercent.toFixed(2)}%`
      );

      setText(
        "overallRiskLevel",
        overallRiskStyle.level
      );

      if (overallGauge) {
        overallGauge.style.setProperty(
          "--p",
          `${overallPercent}%`
        );

        overallGauge.style.setProperty(
          "background",
          `conic-gradient(
            ${overallRiskStyle.solid} ${overallPercent}%,
            rgba(15, 23, 42, 0.10) 0
          )`,
          "important"
        );

        overallGauge.style.setProperty(
          "box-shadow",
          `0 0 28px ${overallRiskStyle.solid}66`,
          "important"
        );
      }

      if (overallRiskLevelElement) {
        overallRiskLevelElement.style.color =
          overallRiskStyle.solid;
      }

      const threat = labelPercent(
        game.threat,
        game.comments_count
      );

      const bullying = labelPercent(
        game.bullying,
        game.comments_count
      );

      const sexual = labelPercent(
        game.sexual_harassment,
        game.comments_count
      );

      const other = labelPercent(
        game.other_toxicity,
        game.comments_count
      );

      const hate = labelPercent(
        game.hate_speech,
        game.comments_count
      );

      setText("bullyingPercent", `${bullying}%`);
      setText("sexualPercent", `${sexual}%`);
      setText("threatPercent", `${threat}%`);
      setText("hatePercent", `${hate}%`);
      setText("otherPercent", `${other}%`);

      setBar("bullyingBar", bullying);
      setBar("sexualBar", sexual);
      setBar("threatBar", threat);
      setBar("hateBar", hate);
      setBar("otherBar", other);
    }

    const saferBtn =
      document.getElementById(
        "saferAlternativeBtn"
      );

    if (saferBtn) {
      saferBtn.href =
        `recommendations.html?game_id=${game.game_id}`;
    }

    setText(
      "gameName",
      game.game_name || "Game Name"
    );

    const gameImage =
      document.getElementById("gameImage");

    if (gameImage) {
      gameImage.src =
        game.image_url || "images/default-game.jpg";

      gameImage.alt =
        game.game_name || "Game image";
    }

    setText(
      "gameDescription",
      game.description || ""
    );

    setHTML(
      "gameGenres",
      (game.genre || "")
        .split(",")
        .filter((genre) => genre.trim() !== "")
        .map(
          (genre) =>
            `<span class="tag">${genre.trim()}</span>`
        )
        .join("")
    );

    setValue("reportGameId", game.game_id);

  } catch (error) {
    console.error(
      "Game details error:",
      error
    );

    alert(
      "Cannot load game details. " +
      "Check api/game-details.php"
    );
  }
}

function openReportModal() {
  const reportModal =
    document.getElementById("reportModal");

  if (reportModal) {
    reportModal.classList.add("show");
  }

  const gameName =
    document.getElementById("gameName");

  const overallRisk =
    document.getElementById(
      "overallRiskPercent"
    );

  const riskLevel =
    document.getElementById(
      "overallRiskLevel"
    );

  setText(
    "reportGameName",
    gameName?.textContent || ""
  );

  setText(
    "reportRiskPercent",
    overallRisk?.textContent || ""
  );

  setText(
    "reportRiskLevel",
    riskLevel?.textContent || ""
  );
}

function closeReportModal() {
  const reportModal =
    document.getElementById("reportModal");

  if (reportModal) {
    reportModal.classList.remove("show");
  }
}

function trackGame() {
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
      game_id: Number(gameId)
    })
  })
    .then((response) => response.json())

    .then((data) => {
      showToast(
        data.message ||
        "Game added to your list."
      );
    })

    .catch((error) => {
      console.error(
        "Track game error:",
        error
      );

      alert("Cannot track game.");
    });
}

/* Other report field */

const behaviorOtherCheck =
  document.getElementById(
    "behaviorOtherCheck"
  );

const behaviorOtherText =
  document.getElementById(
    "behaviorOtherText"
  );

if (behaviorOtherCheck && behaviorOtherText) {
  behaviorOtherText.style.display = "none";

  behaviorOtherCheck.addEventListener(
    "change",
    function () {
      if (this.checked) {
        behaviorOtherText.style.display =
          "block";
      } else {
        behaviorOtherText.style.display =
          "none";

        behaviorOtherText.value = "";
      }
    }
  );
}

/* Submit report */

const reportForm =
  document.getElementById("reportForm");

if (reportForm) {
  reportForm.addEventListener(
    "submit",
    function (event) {
      event.preventDefault();

      const formData = new FormData(this);

      fetch("api/create-report.php", {
        method: "POST",
        body: formData
      })
        .then(async (response) => {
          const text = await response.text();

          console.log(
            "Create report response:",
            text
          );

          try {
            return JSON.parse(text);
          } catch {
            throw new Error(text);
          }
        })

        .then((data) => {
          const reportMessage =
            document.getElementById(
              "reportMessage"
            );

          if (data.success) {
            this.reset();

            if (behaviorOtherText) {
              behaviorOtherText.style.display =
                "none";

              behaviorOtherText.value = "";
            }

            showToast(
              "Report submitted successfully."
            );

            closeReportModal();
          } else if (reportMessage) {
            reportMessage.textContent =
              data.message ||
              "Could not submit report.";
          }
        })

        .catch((error) => {
          console.error(
            "Submit report error:",
            error
          );

          const reportMessage =
            document.getElementById(
              "reportMessage"
            );

          if (reportMessage) {
            reportMessage.textContent =
              "Cannot submit report. Check Console.";
          }
        });
    }
  );
}

/* Game review */

function initializeReviewForm() {
  const reviewForm =
    document.getElementById("reviewForm");

  const stars =
    document.querySelectorAll(
      "#starRating .star"
    );

  const selectedRatingInput =
    document.getElementById(
      "selectedRating"
    );

  const reviewText =
    document.getElementById("reviewText");

  const characterCount =
    document.getElementById(
      "reviewCharacterCount"
    );

  const reviewMessage =
    document.getElementById(
      "reviewMessage"
    );

  const submitButton =
    document.getElementById(
      "submitReviewBtn"
    );

  let selectedRating = 0;

  function paintStars(rating) {
    stars.forEach((star) => {
      const starRating =
        Number(star.dataset.rating);

      if (starRating <= rating) {
        star.classList.add("selected");
      } else {
        star.classList.remove("selected");
      }
    });
  }

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating =
        Number(star.dataset.rating);

      if (selectedRatingInput) {
        selectedRatingInput.value =
          selectedRating;
      }

      paintStars(selectedRating);

      if (reviewMessage) {
        reviewMessage.textContent = "";
      }
    });

    star.addEventListener(
      "mouseenter",
      () => {
        paintStars(
          Number(star.dataset.rating)
        );
      }
    );

    star.addEventListener(
      "mouseleave",
      () => {
        paintStars(selectedRating);
      }
    );
  });

  if (reviewText && characterCount) {
    reviewText.addEventListener(
      "input",
      () => {
        characterCount.textContent =
          `${reviewText.value.length} / 1000`;
      }
    );
  }

  if (!reviewForm) {
    return;
  }

  reviewForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      if (!gameId) {
        if (reviewMessage) {
          reviewMessage.textContent =
            "The game could not be identified.";
        }

        return;
      }

      if (
        selectedRating < 1 ||
        selectedRating > 5
      ) {
        if (reviewMessage) {
          reviewMessage.textContent =
            "Please select a rating from 1 to 5 stars.";
        }

        return;
      }

      const reviewValue =
        reviewText?.value.trim() || "";

      if (!reviewValue) {
        if (reviewMessage) {
          reviewMessage.textContent =
            "Please tell us about your experience.";
        }

        return;
      }

      if (submitButton) {
        submitButton.disabled = true;

        submitButton.textContent =
          "Submitting...";
      }

      try {
        const response = await fetch(
          "api/submit-review.php",
          {
            method: "POST",

            credentials: "same-origin",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              game_id: Number(gameId),
              rating: selectedRating,
              review_text: reviewValue
            })
          }
        );

        const responseText =
          await response.text();

        console.log(
          "Submit review response:",
          responseText
        );

        let result;

        try {
          result =
            JSON.parse(responseText);
        } catch {
          throw new Error(responseText);
        }

        if (!result.success) {
          if (reviewMessage) {
            reviewMessage.textContent =
              result.message ||
              "Could not submit the review.";
          }

          return;
        }

        showToast(
          result.message ||
          "Thank you! Your review has been submitted."
        );

        reviewForm.reset();

        selectedRating = 0;

        paintStars(0);

        if (characterCount) {
          characterCount.textContent =
            "0 / 1000";
        }

        if (reviewMessage) {
          reviewMessage.textContent = "";
        }

      } catch (error) {
        console.error(
          "Review submission error:",
          error
        );

        if (reviewMessage) {
          reviewMessage.textContent =
            "Cannot submit the review. Check Console.";
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;

          submitButton.textContent =
            "Submit Review";
        }
      }
    }
  );
}

/* Toast message */

function showToast(message) {
  const toast =
    document.getElementById("toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

loadGameDetails();
