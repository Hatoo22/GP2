<?php
// Admin "Analyze" button.
// The page asks for the list of games, then sends them here one at a time:
//   GET  ?action=count                         -> how many games "new" and "all" would process
//   GET  ?action=list&mode=one|new|all[&game_id=] -> the games to process, in order
//   POST {action:"run", game_id, refresh?}     -> analyze one game and save its score
//   POST {action:"finish"}                     -> run ended: send the grouped "became high risk" emails
//
// For each game the AI service (Hugging Face Space, hf-space/app.py) fetches the
// Steam reviews and YouTube comments and runs the model on them. The Space
// can't reach the database, so the saving happens here, and what players
// shared on Dir'a (site comments + counted complaints) is added back first.
require_once __DIR__ . '/admin-auth.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/ai-client.php';
require_once __DIR__ . '/report-score.php';
require_once __DIR__ . '/notify.php';
header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

const DIRA_LABELS = ['threat', 'bullying', 'sexual_harassment', 'hate_speech', 'other_toxicity'];

function games_where(string $mode): string {
    if ($mode === 'new') {
        return "WHERE COALESCE(analysis_status, 'no_comments') <> 'analyzed' OR COALESCE(comments_count, 0) = 0";
    }
    return '';
}

// what players added on Dir'a itself, so a re-analysis doesn't lose it
function site_extras(mysqli $conn, int $gameId): array {
    $counts = array_fill_keys(DIRA_LABELS, 0);
    $n = 0;
    try {
        $st = $conn->prepare("SELECT COUNT(*) AS n,
                COALESCE(SUM(threat),0) AS threat, COALESCE(SUM(bullying),0) AS bullying,
                COALESCE(SUM(sexual_harassment),0) AS sexual_harassment,
                COALESCE(SUM(hate_speech),0) AS hate_speech, COALESCE(SUM(other_toxicity),0) AS other_toxicity
            FROM site_comments WHERE game_id = ?");
        if ($st) {
            $st->bind_param('i', $gameId);
            $st->execute();
            $row = $st->get_result()->fetch_assoc() ?: [];
            $st->close();
            $n += (int)($row['n'] ?? 0);
            foreach (DIRA_LABELS as $k) $counts[$k] += (int)($row[$k] ?? 0);
        }
    } catch (Throwable $e) { /* table not created yet */ }
    try {
        $st = $conn->prepare("SELECT COUNT(*) AS n,
                COALESCE(SUM(behavior_threat = 1),0) AS threat,
                COALESCE(SUM(behavior_bullying = 1),0) AS bullying,
                COALESCE(SUM(behavior_sexual = 1),0) AS sexual_harassment,
                COALESCE(SUM(behavior_hate = 1),0) AS hate_speech,
                COALESCE(SUM(behavior_toxic = 1 OR TRIM(COALESCE(behavior_other,'')) <> ''),0) AS other_toxicity
            FROM reports WHERE game_id = ? AND counted_in_score = 1");
        if ($st) {
            $st->bind_param('i', $gameId);
            $st->execute();
            $row = $st->get_result()->fetch_assoc() ?: [];
            $st->close();
            $n += (int)($row['n'] ?? 0);
            foreach (DIRA_LABELS as $k) $counts[$k] += (int)($row[$k] ?? 0);
        }
    } catch (Throwable $e) { /* column not created yet */ }
    return [$counts, $n];
}

mysqli_report(MYSQLI_REPORT_OFF);

/* ---------- GET: count / list ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'count';

    if ($action === 'count') {
        $all = (int)$conn->query("SELECT COUNT(*) FROM games")->fetch_row()[0];
        $new = (int)$conn->query("SELECT COUNT(*) FROM games " . games_where('new'))->fetch_row()[0];
        out(['success' => true, 'all' => $all, 'new' => $new, 'connected' => dira_ai_base() !== '']);
    }

    if ($action === 'list') {
        dira_send_risk_emails($conn); // anything left from a run that was closed early
        $mode = $_GET['mode'] ?? '';
        if ($mode === 'one') {
            $gid = (int)($_GET['game_id'] ?? 0);
            $st = $conn->prepare("SELECT game_id, game_name FROM games WHERE game_id = ?");
            $st->bind_param('i', $gid);
            $st->execute();
            $games = $st->get_result()->fetch_all(MYSQLI_ASSOC);
            $st->close();
        } elseif ($mode === 'new' || $mode === 'all') {
            $games = $conn->query("SELECT game_id, game_name FROM games " . games_where($mode) . " ORDER BY game_id ASC")
                          ->fetch_all(MYSQLI_ASSOC);
        } else {
            out(['success' => false, 'message' => 'Choose what to analyze.'], 400);
        }
        out(['success' => true, 'games' => $games]);
    }
    out(['success' => false, 'message' => 'Unknown action.'], 400);
}

/* ---------- POST: analyze one game ---------- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);

$input = json_decode(file_get_contents('php://input'), true) ?: [];
if (($input['action'] ?? '') === 'finish') {
    $sent = dira_send_risk_emails($conn);
    out(['success' => true, 'emails' => $sent]);
}
if (($input['action'] ?? '') !== 'run') out(['success' => false, 'message' => 'Unknown action.'], 400);

$gameId = (int)($input['game_id'] ?? 0);
$st = $conn->prepare("SELECT game_id, api_game_id, game_name, overall_risk_level, analysis_status FROM games WHERE game_id = ? LIMIT 1");
$st->bind_param('i', $gameId);
$st->execute();
$game = $st->get_result()->fetch_assoc();
$st->close();
if (!$game) out(['success' => false, 'message' => 'Game not found.'], 404);

if (dira_ai_base() === '') {
    out(['success' => false, 'stop' => true, 'message' => 'The analysis service is not connected yet (AI_API_URL is missing).'], 503);
}

// fetching ~600 comments and running the model takes a while
@set_time_limit(420);
ignore_user_abort(true);

$catalog = array_column($conn->query("SELECT game_name FROM games WHERE game_name IS NOT NULL AND game_name <> ''")->fetch_all(MYSQLI_ASSOC), 'game_name');

$ai = dira_ai_call('analyze_game', [
    (string)($game['api_game_id'] ?? ''),
    (string)$game['game_name'],
    json_encode($catalog, JSON_UNESCAPED_UNICODE),
    !empty($input['refresh']),
], 360);

$name = $game['game_name'];
if (empty($ai['success'])) {
    out(['success' => false, 'stop' => !empty($ai['unreachable']), 'game_name' => $name,
         'message' => $ai['message'] ?? 'The analysis failed.'], 502);
}
if (!empty($ai['skipped'])) {
    out(['success' => true, 'status' => 'skipped', 'game_name' => $name,
         'message' => "Skipped: " . ($ai['message'] ?? 'YouTube is unavailable') . ". The old score was kept."]);
}

[$extraCounts, $extraN] = site_extras($conn, $gameId);
$found = (int)($ai['comments_count'] ?? 0);

if ($found === 0 && $extraN === 0) {
    $st = $conn->prepare("UPDATE games SET threat=0, bullying=0, sexual_harassment=0, hate_speech=0, other_toxicity=0,
            overall_risk_percent=0, overall_risk_level='New', comments_count=0,
            analysis_status='no_comments', analyzed_at=CURRENT_TIMESTAMP WHERE game_id=?");
    $st->bind_param('i', $gameId);
    $st->execute();
    $st->close();
    out(['success' => true, 'status' => 'no_comments', 'game_name' => $name, 'message' => 'No comments found.']);
}

$counts = [];
foreach (DIRA_LABELS as $k) $counts[$k] = (int)($ai['counts'][$k] ?? 0) + $extraCounts[$k];
$total = $found + $extraN;
[$overall, $level] = dira_overall_from_counts($counts, $total);

$st = $conn->prepare("UPDATE games SET threat=?, bullying=?, sexual_harassment=?, hate_speech=?, other_toxicity=?,
        overall_risk_percent=?, overall_risk_level=?, comments_count=?,
        analysis_status='analyzed', analyzed_at=CURRENT_TIMESTAMP WHERE game_id=?");
$st->bind_param('iiiiidsii', $counts['threat'], $counts['bullying'], $counts['sexual_harassment'],
    $counts['hate_speech'], $counts['other_toxicity'], $overall, $level, $total, $gameId);
$ok = $st->execute();
$st->close();
if (!$ok) out(['success' => false, 'game_name' => $name, 'message' => 'Could not save the result.'], 500);

// tell the people who follow this game if its level changed (emails go out when the run finishes)
$oldLevel = ($game['analysis_status'] ?? '') === 'analyzed' ? $game['overall_risk_level'] : '';
$notified = dira_notify_risk_change($conn, $gameId, $oldLevel, $level, (float)$overall);

out(['success' => true, 'status' => 'analyzed', 'game_name' => $name,
     'overall' => $overall, 'level' => $level, 'comments' => $total, 'notified' => $notified,
     'message' => "$found from Steam/YouTube + $extraN from Dir'a → " . round($overall) . "% ($level)"]);
