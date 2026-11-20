<?php
// Signed-in home banner: four games that change every week (one high, one medium,
// two low when there are enough), with a game from the user's own list first.
//   GET -> {games: [{game_id, game_name, image_url, overall_risk_percent, overall_risk_level,
//                    comments_count, threat, bullying, sexual_harassment, hate_speech,
//                    other_toxicity, in_list}], week}
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

$uid = (int)($_SESSION['user_id'] ?? 0);
$week = date('o-W'); // changes every Monday
$cols = "g.game_id, g.game_name, g.image_url, g.genre, g.overall_risk_percent, g.overall_risk_level, g.comments_count,
         g.threat, g.bullying, g.sexual_harassment, g.hate_speech, g.other_toxicity";
$base = "g.analysis_status = 'analyzed' AND COALESCE(g.comments_count, 0) > 0
         AND COALESCE(g.image_url, '') <> '' AND LOWER(g.game_name) NOT LIKE '%test%'";

$picked = [];
$seen = [];
$add = function ($row) use (&$picked, &$seen) {
    if (!$row || isset($seen[$row['game_id']])) return;
    $seen[$row['game_id']] = true;
    $picked[] = $row;
};

// 1) a game from the user's list (the one most recently added)
if ($uid) {
    $st = $conn->prepare("SELECT $cols FROM tracked_games t JOIN games g ON g.game_id = t.game_id
        WHERE t.user_id = ? AND $base ORDER BY t.tracked_id DESC LIMIT 1");
    if ($st) {
        $st->bind_param('i', $uid);
        $st->execute();
        $add($st->get_result()->fetch_assoc());
        $st->close();
    }
}

// 2) this week's picks: same order for everyone during the week, new order next week
$order = "CRC32(CONCAT(g.game_id, '-', ?))";
// the game from the user's list already covers its own level
$need = ['High' => 1, 'Medium' => 1, 'Low' => 2];
foreach ($picked as $p) {
    $l = ucfirst(strtolower((string)$p['overall_risk_level']));
    if (isset($need[$l]) && $need[$l] > 0) $need[$l]--;
}
foreach ($need as $level => $n) {
    if ($n <= 0) continue;
    // low ones that show at least a little activity read better than a flat 0%
    $lowRule = $level === 'Low' ? " AND g.overall_risk_percent > 0" : "";
    $st = $conn->prepare("SELECT $cols FROM games g WHERE $base AND g.overall_risk_level = ?$lowRule
        ORDER BY $order LIMIT " . ($n + 2));
    $st->bind_param('ss', $level, $week);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    $taken = 0;
    foreach ($rows as $r) {
        if ($taken >= $n || count($picked) >= 4) break;
        if (isset($seen[$r['game_id']])) continue;
        $add($r);
        $taken++;
    }
}

// 3) not enough of some level: fill up to four with any analyzed game
if (count($picked) < 4) {
    $st = $conn->prepare("SELECT $cols FROM games g WHERE $base ORDER BY $order LIMIT 12");
    $st->bind_param('s', $week);
    $st->execute();
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        if (count($picked) >= 4) break;
        $add($r);
    }
    $st->close();
}

// which of them are already in the user's list
$inList = [];
if ($uid && $picked) {
    $ids = implode(',', array_map(fn($g) => (int)$g['game_id'], $picked));
    $res = $conn->query("SELECT game_id FROM tracked_games WHERE user_id = $uid AND game_id IN ($ids)");
    while ($res && ($r = $res->fetch_row())) $inList[(int)$r[0]] = true;
}
foreach ($picked as &$g) { $g['in_list'] = isset($inList[(int)$g['game_id']]); }
unset($g);

echo json_encode(['success' => true, 'week' => $week, 'games' => $picked], JSON_UNESCAPED_UNICODE);
