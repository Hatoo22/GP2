<?php
require_once __DIR__ . '/admin-auth.php';
// Admin dashboard data: KPIs, risk distribution, report insights,
// most-reported games and the latest assistant suggestions.

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/spam-check.php';
dira_spam_ensure_columns($conn);
try { dira_spam_backfill($conn); } catch (Throwable $e) {}
$NS = " AND COALESCE(is_spam,0) = 0 ";
$NSR = " AND COALESCE(r.is_spam,0) = 0 ";

function scalar($conn, $sql, $default = 0) {
    $res = $conn->query($sql);
    if (!$res) return $default;
    $row = $res->fetch_row();
    return $row ? (int)$row[0] : $default;
}

function rows($conn, $sql) {
    $out = [];
    $res = $conn->query($sql);
    if ($res) {
        while ($r = $res->fetch_assoc()) $out[] = $r;
    }
    return $out;
}

/* ---------- KPIs ---------- */
$hasDeleted = false;
$colRes = $conn->query("SHOW COLUMNS FROM users LIKE 'deleted_at'");
if ($colRes && $colRes->num_rows > 0) $hasDeleted = true;
$notDeleted = $hasDeleted ? " AND deleted_at IS NULL" : "";

$summary = [
    "total_games"        => scalar($conn, "SELECT COUNT(*) FROM games"),
    "analyzed_games"     => scalar($conn, "SELECT COUNT(*) FROM games WHERE analysis_status = 'analyzed' AND COALESCE(comments_count,0) > 0"),
    "total_users"        => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'individual'" . $notDeleted),
    "new_users_month"    => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'individual' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)" . $notDeleted),
    "total_employees"    => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'employee'"),
    "active_employees"   => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'employee' AND status = 'active'"),
    "pending_employees"  => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'employee' AND status = 'pending'"),
    "disabled_employees" => scalar($conn, "SELECT COUNT(*) FROM users WHERE role = 'employee' AND status = 'disabled'"),
    "total_reports"      => scalar($conn, "SELECT COUNT(*) FROM reports WHERE 1=1 $NS"),
    "spam_reports"       => scalar($conn, "SELECT COUNT(*) FROM reports WHERE COALESCE(is_spam,0) = 1"),
    "pending_reports"    => scalar($conn, "SELECT COUNT(*) FROM reports WHERE status = 'Pending' $NS"),
];

/* ---------- games by risk level ---------- */
$risk = ["Low" => 0, "Medium" => 0, "High" => 0, "New" => 0];
foreach (rows($conn, "
    SELECT
      CASE
        WHEN analysis_status <> 'analyzed' OR COALESCE(comments_count,0) = 0 THEN 'New'
        ELSE COALESCE(NULLIF(overall_risk_level,''), 'Low')
      END AS lvl,
      COUNT(*) AS total
    FROM games
    GROUP BY lvl
") as $r) {
    $key = ucfirst(strtolower($r["lvl"]));
    if (isset($risk[$key])) $risk[$key] += (int)$r["total"];
}

/* ---------- reports by status ---------- */
$reportStatus = [];
foreach (rows($conn, "SELECT COALESCE(NULLIF(status,''),'Pending') AS status, COUNT(*) AS total FROM reports WHERE 1=1 $NS GROUP BY status ORDER BY total DESC") as $r) {
    $reportStatus[] = ["status" => $r["status"], "total" => (int)$r["total"]];
}

/* ---------- reported behaviors ---------- */
$b = rows($conn, "
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
$b = $b[0] ?? [];
$behaviors = [
    ["label" => "Toxic language",     "total" => (int)($b["toxic"] ?? 0)],
    ["label" => "Bullying",           "total" => (int)($b["bullying"] ?? 0)],
    ["label" => "Hate speech",        "total" => (int)($b["hate"] ?? 0)],
    ["label" => "Sexual harassment",  "total" => (int)($b["sexual"] ?? 0)],
    ["label" => "Threats",            "total" => (int)($b["threat"] ?? 0)],
    ["label" => "Other",              "total" => (int)($b["other"] ?? 0)],
];
usort($behaviors, fn($x, $y) => $y["total"] <=> $x["total"]);

/* ---------- most reported games ---------- */
$topGames = rows($conn, "
    SELECT
      g.game_id, g.game_name, g.image_url,
      g.overall_risk_level, g.overall_risk_percent,
      g.analysis_status, COALESCE(g.comments_count,0) AS comments_count,
      COUNT(r.report_id) AS reports
    FROM reports r
    JOIN games g ON g.game_id = r.game_id
    WHERE 1=1 $NSR
    GROUP BY g.game_id
    ORDER BY reports DESC, g.overall_risk_percent DESC
    LIMIT 5
");

/* ---------- latest suggestions (assistant) ---------- */
$suggestions = [];
$newSuggestions = 0;
$hasTable = $conn->query("SHOW TABLES LIKE 'assistant_feedback'");
if ($hasTable && $hasTable->num_rows > 0) {
    $newSuggestions = scalar($conn, "SELECT COUNT(*) FROM assistant_feedback WHERE status = 'new'");
    $suggestions = rows($conn, "
        SELECT f.id, f.type, f.message, f.status, f.created_at, u.name AS user_name
        FROM assistant_feedback f
        LEFT JOIN users u ON u.user_id = f.user_id
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT 5
    ");
}

echo json_encode([
    "success"         => true,
    "summary"         => $summary,
    "risk"            => $risk,
    "report_status"   => $reportStatus,
    "behaviors"       => $behaviors,
    "top_games"       => $topGames,
    "suggestions"     => $suggestions,
    "new_suggestions" => $newSuggestions
], JSON_UNESCAPED_UNICODE);
