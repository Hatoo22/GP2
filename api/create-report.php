<?php
require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    // Allow only POST requests for report submission
  if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
  }

   // Get the logged-in user's ID from the session
  $user_id = $_SESSION["user_id"] ?? null;

  // Stop the request if the user is not logged in
  if (!$user_id) {
    echo json_encode(["success" => false, "message" => "Not logged in"]);
    exit;
  }

  // Read the main report fields
  $game_id = $_POST["game_id"] ?? null;
  $title = trim($_POST["title"] ?? "");

   // Read selected behavior types
  $behavior_toxic = isset($_POST["behavior_toxic"]) ? 1 : 0;
  $behavior_bullying = isset($_POST["behavior_bullying"]) ? 1 : 0;
  $behavior_hate = isset($_POST["behavior_hate"]) ? 1 : 0;
  $behavior_sexual = isset($_POST["behavior_sexual"]) ? 1 : 0;
  $behavior_threat = isset($_POST["behavior_threat"]) ? 1 : 0;
  $behavior_other = trim($_POST["behavior_other"] ?? "");

   // Read the report severity level
  $severity = trim($_POST["severity"] ?? "");

  // Read where the behavior happened
  $location_chat = isset($_POST["location_chat"]) ? 1 : 0;
  $location_gameplay = isset($_POST["location_gameplay"]) ? 1 : 0;
  $location_community = isset($_POST["location_community"]) ? 1 : 0;

  // Validate required fields
  if (!$game_id || $title === "" || $severity === "") {
    echo json_encode(["success" => false, "message" => "Please fill all required fields"]);
    exit;
  }

  // Ensure that at least one behavior type is selected or described
  if (
    $behavior_toxic === 0 &&
    $behavior_bullying === 0 &&
    $behavior_hate === 0 &&
    $behavior_sexual === 0 &&
    $behavior_threat === 0 &&
    $behavior_other === ""
  ) {
    echo json_encode(["success" => false, "message" => "Please select at least one behavior or write other details"]);
    exit;
  }

  // Ensure that at least one behavior location is selected
  if (
    $location_chat === 0 &&
    $location_gameplay === 0 &&
    $location_community === 0
  ) {
    echo json_encode(["success" => false, "message" => "Please select where the behavior happened"]);
    exit;
  }

  /* ---------- spam protection before saving ---------- */
  require_once __DIR__ . '/spam-check.php';
  dira_spam_ensure_columns($conn);

  // the exact same report from the same user in the last 24 hours
  $normTitle = dira_spam_normalize($title);
  $chk = $conn->prepare("SELECT title FROM reports WHERE user_id = ? AND game_id = ? AND date_reported >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
  $chk->bind_param("ii", $user_id, $game_id);
  $chk->execute();
  $res = $chk->get_result();
  while ($row = $res->fetch_assoc()) {
    if (dira_spam_normalize($row["title"]) === $normTitle) {
      $chk->close();
      echo json_encode(["success" => false, "message" => "You already sent this report today. We're reviewing it."]);
      exit;
    }
  }
  $chk->close();

  // too many reports in a few minutes
  $chk = $conn->prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND date_reported >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
  $chk->bind_param("i", $user_id);
  $chk->execute();
  $recent = (int)($chk->get_result()->fetch_assoc()["n"] ?? 0);
  $chk->close();
  if ($recent >= 5) {
    echo json_encode(["success" => false, "message" => "You've sent a lot of reports in a short time. Please wait a few minutes and try again."]);
    exit;
  }

  // Insert the submitted report into the database
  $sql = "
    INSERT INTO reports
    (
      user_id,
      game_id,
      title,
      behavior_toxic,
      behavior_bullying,
      behavior_hate,
      behavior_sexual,
      behavior_threat,
      behavior_other,
      severity,
      location_chat,
      location_gameplay,
      location_community,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
  ";

  $stmt = $conn->prepare($sql);

  $stmt->bind_param(
    "iisiiiiissiii",
    $user_id,
    $game_id,
    $title,
    $behavior_toxic,
    $behavior_bullying,
    $behavior_hate,
    $behavior_sexual,
    $behavior_threat,
    $behavior_other,
    $severity,
    $location_chat,
    $location_gameplay,
    $location_community
  );

  $stmt->execute();
  $newReportId = $stmt->insert_id;

  // give the new report its spam score (it may go straight to "Spam")
  try {
    dira_spam_save($conn, $newReportId, dira_spam_score($conn, [
      "report_id" => $newReportId,
      "user_id" => $user_id,
      "game_id" => $game_id,
      "title" => $title,
      "behavior_other" => $behavior_other,
    ]));
  } catch (Throwable $e) {
    error_log("DIRA spam scoring failed: " . $e->getMessage());
  }

  echo json_encode([
    "success" => true,
    "message" => "Report submitted successfully"
  ]);

  $stmt->close();

} catch (Throwable $e) {
  // Return a server error response if something fails
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "message" => "Server error: " . $e->getMessage()
  ]);
}
?>