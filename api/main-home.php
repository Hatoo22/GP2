<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';

// Retrieve the most recently added games
$sql = "
SELECT 
  game_id,
  game_name,
  description,
  genre,
  image_url,

  overall_risk_percent,
  overall_risk_level,
  comments_count,
  analysis_status

FROM games
WHERE COALESCE(image_url, '') <> ''
  AND LOWER(game_name) NOT LIKE '%test%'
ORDER BY created_at DESC
LIMIT 10
";

$result = $conn->query($sql);

$games = [];

// Store each recent game in the games array
while ($row = $result->fetch_assoc()) {
  $games[] = $row;
}

// One well-analyzed game per risk level for the live demo on the home page
$showcase = [];
foreach (['Low', 'Medium', 'High'] as $level) {
  $stmt = $conn->prepare("
    SELECT game_id, game_name, image_url, overall_risk_percent, overall_risk_level, comments_count
    FROM games
    WHERE analysis_status = 'analyzed'
      AND COALESCE(comments_count, 0) > 0
      AND overall_risk_level = ?
      AND COALESCE(image_url, '') <> ''
      AND LOWER(game_name) NOT LIKE '%test%'
      AND (? <> 'Low' OR overall_risk_percent >= 5)
    ORDER BY comments_count DESC, overall_risk_percent DESC, game_id ASC
    LIMIT 1
  ");
  $stmt->bind_param('ss', $level, $level);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  if (!$row && $level === 'Low') {
    // fall back to any analyzed low-risk game
    $res = $conn->query("SELECT game_id, game_name, image_url, overall_risk_percent, overall_risk_level, comments_count FROM games WHERE analysis_status = 'analyzed' AND overall_risk_level = 'Low' AND COALESCE(image_url,'') <> '' ORDER BY overall_risk_percent DESC LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
  }
  if ($row) {
    $showcase[] = $row;
  }
}

// Totals for the "why it matters" numbers
$totals = $conn->query("
  SELECT
    SUM(analysis_status = 'analyzed' AND COALESCE(comments_count, 0) > 0) AS games_analyzed,
    SUM(CASE WHEN analysis_status = 'analyzed' THEN COALESCE(comments_count, 0) ELSE 0 END) AS comments_analyzed
  FROM games
")->fetch_assoc();

// Return the recent games as a JSON response
echo json_encode([
  "success" => true,
  "games" => $games,
  "showcase" => $showcase,
  "stats" => [
    "games_analyzed" => (int)($totals['games_analyzed'] ?? 0),
    "comments_analyzed" => (int)($totals['comments_analyzed'] ?? 0)
  ]
], JSON_UNESCAPED_UNICODE);
?>