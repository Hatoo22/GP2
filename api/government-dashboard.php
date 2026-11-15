<?php
require_once __DIR__ . '/employee-auth.php';

header('Content-Type: application/json; charset=utf-8');

require_once 'config.php';
require_once __DIR__ . '/spam-check.php';
dira_spam_ensure_columns($conn);
try { dira_spam_backfill($conn); } catch (Throwable $e) {}
$NS = " AND COALESCE(is_spam,0) = 0 ";      // for queries on reports without alias
$NSR = " AND COALESCE(r.is_spam,0) = 0 ";  // for queries with alias r


$response = [
    "success" => true,

    "summary" => [
        "total_reports" => 0,
        "total_reported_games" => 0,
        "high_risk_games" => 0,
        "pending_reports" => 0,
        "reviewing_reports" => 0,
        "resolved_reports" => 0
    ],

    "latest_pending" => [],
    "weekly" => [],
    "behaviors" => [],
    "severity" => ["high" => 0, "medium" => 0, "low" => 0],

    "games" => []
];


/* =========================================
   1. TOTAL REPORTS
========================================= */

$result = $conn->query("
    SELECT COUNT(*) AS total_reports
    FROM reports
    WHERE 1=1 $NS
");

if ($result) {

    $row = $result->fetch_assoc();

    $response["summary"]["total_reports"] =
        (int)$row["total_reports"];
}


/* =========================================
   2. TOTAL GAMES WITH REPORTS
========================================= */

$result = $conn->query("
    SELECT COUNT(DISTINCT game_id) AS total_reported_games
    FROM reports
    WHERE 1=1 $NS
");

if ($result) {

    $row = $result->fetch_assoc();

    $response["summary"]["total_reported_games"] =
        (int)$row["total_reported_games"];
}


/* =========================================
   3. HIGH RISK REPORTED GAMES
========================================= */

$result = $conn->query("
    SELECT COUNT(DISTINCT g.game_id) AS high_risk_games

    FROM games g

    INNER JOIN reports r
        ON r.game_id = g.game_id

    WHERE g.overall_risk_level = 'High' $NSR
");

if ($result) {

    $row = $result->fetch_assoc();

    $response["summary"]["high_risk_games"] =
        (int)$row["high_risk_games"];
}


/* =========================================
   3b. REPORTS BY STATUS + LATEST PENDING
========================================= */

$result = $conn->query("SELECT COALESCE(NULLIF(status,''),'Pending') AS st, COUNT(*) AS total FROM reports WHERE 1=1 $NS GROUP BY st");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $key = strtolower($row["st"]) . "_reports";
        if (isset($response["summary"][$key])) {
            $response["summary"][$key] += (int)$row["total"];
        }
    }
}

$result = $conn->query("
    SELECT r.report_id, r.title, r.severity, r.date_reported, r.game_id,
           g.game_name, g.image_url
    FROM reports r
    LEFT JOIN games g ON g.game_id = r.game_id
    WHERE COALESCE(NULLIF(r.status,''),'Pending') = 'Pending' $NSR
    ORDER BY r.date_reported DESC, r.report_id DESC
    LIMIT 5
");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $response["latest_pending"][] = $row;
    }
}


/* =========================================
   3c. TRENDS: complaints per week (last 8 weeks),
       reported behaviors and severity mix
========================================= */

$weeks = [];
for ($i = 7; $i >= 0; $i--) {
    $start = new DateTime('monday this week');
    $start->modify("-{$i} week");
    $weeks[$start->format('Y-m-d')] = 0;
}
$firstWeek = array_key_first($weeks);
$stmt = $conn->prepare("SELECT date_reported FROM reports WHERE date_reported >= ? $NS");
$stmt->bind_param('s', $firstWeek);
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $d = new DateTime($row['date_reported']);
    $d->modify('monday this week');
    $key = $d->format('Y-m-d');
    if (isset($weeks[$key])) $weeks[$key]++;
}
$stmt->close();
foreach ($weeks as $start => $count) {
    $response["weekly"][] = ["week_start" => $start, "total" => $count];
}

$result = $conn->query("
    SELECT
      COALESCE(SUM(behavior_toxic),0)    AS toxic,
      COALESCE(SUM(behavior_bullying),0) AS bullying,
      COALESCE(SUM(behavior_hate),0)     AS hate,
      COALESCE(SUM(behavior_sexual),0)   AS sexual,
      COALESCE(SUM(behavior_threat),0)   AS threat,
      COALESCE(SUM(CASE WHEN COALESCE(behavior_other,'') <> '' THEN 1 ELSE 0 END),0) AS other
    FROM reports
    WHERE 1=1 $NS
");
if ($result && ($b = $result->fetch_assoc())) {
    $response["behaviors"] = [
        ["label" => "Toxic language",    "total" => (int)$b["toxic"]],
        ["label" => "Bullying",          "total" => (int)$b["bullying"]],
        ["label" => "Hate speech",       "total" => (int)$b["hate"]],
        ["label" => "Sexual harassment", "total" => (int)$b["sexual"]],
        ["label" => "Threats",           "total" => (int)$b["threat"]],
        ["label" => "Other",             "total" => (int)$b["other"]],
    ];
    usort($response["behaviors"], fn($x, $y) => $y["total"] <=> $x["total"]);
}

$result = $conn->query("SELECT LOWER(COALESCE(severity,'')) AS sev, COUNT(*) AS total FROM reports WHERE 1=1 $NS GROUP BY sev");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        if (isset($response["severity"][$row["sev"]])) {
            $response["severity"][$row["sev"]] = (int)$row["total"];
        }
    }
}


/* =========================================
   4. REPORTED GAMES TABLE
========================================= */

$sql = "
    SELECT

        g.game_id,
        g.game_name,
        g.image_url,
        g.genre,
        g.platform,
        g.required_age,

        g.overall_risk_percent,
        g.overall_risk_level,

        g.comments_count,

        g.threat,
        g.bullying,
        g.sexual_harassment,
        g.hate_speech,
        g.other_toxicity,

        COUNT(r.report_id) AS report_count

    FROM games g

    INNER JOIN reports r
        ON r.game_id = g.game_id
        $NSR

    GROUP BY

        g.game_id,
        g.game_name,
        g.image_url,
        g.genre,
        g.platform,
        g.required_age,

        g.overall_risk_percent,
        g.overall_risk_level,

        g.comments_count,

        g.threat,
        g.bullying,
        g.sexual_harassment,
        g.hate_speech,
        g.other_toxicity

    ORDER BY
        report_count DESC,
        g.game_name ASC
";


$result = $conn->query($sql);


/* =========================================
   DATABASE ERROR
========================================= */

if (!$result) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $conn->error
    ]);

    exit;
}


/* =========================================
   FORMAT GAME DATA
========================================= */

while ($row = $result->fetch_assoc()) {

    $response["games"][] = [

        "game_id" =>
            (int)$row["game_id"],

        "game_name" =>
            $row["game_name"],

        "image_url" =>
            $row["image_url"],

        "genre" =>
            $row["genre"],

        "platform" =>
            $row["platform"],

        "required_age" =>
            (int)$row["required_age"],


        /* Number of reports */

        "report_count" =>
            (int)$row["report_count"],


        /* Overall risk */

        "overall_risk_percent" =>
            (float)$row["overall_risk_percent"],

        "overall_risk_level" =>
            $row["overall_risk_level"],


        /* Number of analyzed comments */

        "comments_count" =>
            (int)$row["comments_count"],


        /* Raw model values */

        "breakdown" => [

            "threat" =>
                (float)$row["threat"],

            "bullying" =>
                (float)$row["bullying"],

            "sexual_harassment" =>
                (float)$row["sexual_harassment"],

            "hate_speech" =>
                (float)$row["hate_speech"],

            "other_toxicity" =>
                (float)$row["other_toxicity"]
        ]
    ];
}


/* =========================================
   JSON RESPONSE
========================================= */

echo json_encode(
    $response,
    JSON_UNESCAPED_UNICODE |
    JSON_UNESCAPED_SLASHES
);


$conn->close();

?>