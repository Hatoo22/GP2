<?php
// Complaints for government employees:
//   GET  -> all complaints with game + reporter info
//   POST {action:"status", report_id, status} -> Pending | Reviewing | Resolved
require_once __DIR__ . '/employee-auth.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/spam-check.php';
require_once __DIR__ . '/report-score.php';
dira_spam_ensure_columns($conn);
dira_report_score_ensure_column($conn);

function sendJson($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    /* ---------- spam / not spam (manual decision) ---------- */
    if (($input['action'] ?? '') === 'spam') {
        $reportId = intval($input['report_id'] ?? 0);
        $isSpam = !empty($input['spam']) ? 1 : 0;
        $override = $isSpam ? 'spam' : 'not_spam';
        if ($reportId <= 0) {
            sendJson(['success' => false, 'message' => 'Invalid complaint.'], 400);
        }
        $stmt = $conn->prepare("UPDATE reports SET is_spam = ?, spam_override = ? WHERE report_id = ? LIMIT 1");
        $stmt->bind_param('isi', $isSpam, $override, $reportId);
        $stmt->execute();
        $stmt->close();
        $score = dira_report_sync_score($conn, $reportId);
        sendJson(['success' => true, 'is_spam' => $isSpam, 'score' => $score]);
    }

    if (($input['action'] ?? '') !== 'status') {
        sendJson(['success' => false, 'message' => 'Invalid action.'], 400);
    }

    $allowed = ['Pending', 'Reviewing', 'Resolved'];
    $newStatus = trim($input['status'] ?? '');
    $reportId = intval($input['report_id'] ?? 0);

    if ($reportId <= 0 || !in_array($newStatus, $allowed, true)) {
        sendJson(['success' => false, 'message' => 'Invalid status update.'], 400);
    }

    try {
        // If reports.status is an ENUM that doesn't list this value yet
        // (e.g. only 'Pending','Reviewing'), add the missing values once.
        $col = $conn->query("SHOW COLUMNS FROM reports LIKE 'status'");
        $type = $col ? (string)($col->fetch_assoc()['Type'] ?? '') : '';

        if (stripos($type, 'enum(') === 0) {
            preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $type, $m);
            $values = $m[1] ?? [];
            $lower = array_map('strtolower', $values);
            $missing = array_filter($allowed, fn($v) => !in_array(strtolower($v), $lower, true));
            if ($missing) {
                $all = array_values(array_merge($values, $missing));
                $list = implode(',', array_map(fn($v) => "'" . $conn->real_escape_string($v) . "'", $all));
                $conn->query("ALTER TABLE reports MODIFY status ENUM($list) NOT NULL DEFAULT 'Pending'");
            }
        } elseif (preg_match('/^(var)?char\((\d+)\)/i', $type, $m) && (int)$m[2] < 9) {
            // column too short for 'Reviewing' / 'Resolved'
            $conn->query("ALTER TABLE reports MODIFY status VARCHAR(20) NOT NULL DEFAULT 'Pending'");
        }

        $stmt = $conn->prepare("UPDATE reports SET status = ? WHERE report_id = ? LIMIT 1");
        $stmt->bind_param('si', $newStatus, $reportId);
        $stmt->execute();
        $stmt->close();

        // read it back to be sure the database really stored it
        $check = $conn->prepare("SELECT status FROM reports WHERE report_id = ? LIMIT 1");
        $check->bind_param('i', $reportId);
        $check->execute();
        $row = $check->get_result()->fetch_assoc();
        $check->close();
    } catch (Throwable $e) {
        error_log('DIRA status update failed: ' . $e->getMessage());
        sendJson(['success' => false, 'message' => 'Could not save the status: ' . $e->getMessage()], 500);
    }

    if (!$row) {
        sendJson(['success' => false, 'message' => 'Complaint not found.'], 404);
    }

    if (strcasecmp((string)$row['status'], $newStatus) !== 0) {
        sendJson(['success' => false, 'message' => 'The database did not accept this status (column type: ' . $type . ').'], 500);
    }

    // a resolved, non-spam complaint now counts toward the game's risk score
    $score = dira_report_sync_score($conn, $reportId);
    sendJson(['success' => true, 'status' => $newStatus, 'score' => $score]);
}

// complaints resolved before this feature existed: count them once
try {
    $pend = $conn->query("SELECT report_id FROM reports WHERE status = 'Resolved' AND COALESCE(is_spam,0) = 0 AND counted_in_score = 0 LIMIT 200");
    while ($pend && ($p = $pend->fetch_assoc())) dira_report_sync_score($conn, (int)$p['report_id']);
} catch (Throwable $e) { error_log('DIRA report score backfill: ' . $e->getMessage()); }

// score any old reports that don't have a spam score yet
try { dira_spam_backfill($conn); } catch (Throwable $e) { error_log('DIRA spam backfill: ' . $e->getMessage()); }

$sql = "
SELECT
    r.report_id, r.user_id, r.game_id, r.title, r.status, r.date_reported,
    r.is_spam, r.spam_score, r.spam_reasons, r.spam_override,
    r.behavior_toxic, r.behavior_bullying, r.behavior_hate,
    r.behavior_sexual, r.behavior_threat, r.behavior_other,
    r.severity,
    r.location_chat, r.location_gameplay, r.location_community,
    u.name AS user_name,
    g.game_name,
    g.image_url AS game_image,
    g.overall_risk_level,
    g.overall_risk_percent
FROM reports r
LEFT JOIN users u ON r.user_id = u.user_id
LEFT JOIN games g ON r.game_id = g.game_id
ORDER BY r.date_reported DESC, r.report_id DESC
";

$result = $conn->query($sql);
$complaints = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $complaints[] = $row;
    }
}

sendJson(['success' => true, 'complaints' => $complaints]);
