<?php
// The bell in the top bar (players and employees).
//   GET                                   -> {unread, items: latest 20, email: true|false}
//   POST {action:"read", id}              -> mark one as read
//   POST {action:"read_all"}              -> mark all as read
//   POST {action:"email", on: true|false} -> turn the "game became high risk" emails on/off
//
// Like most apps, notifications last 30 days: the bell shows the last 30 days
// and older ones are deleted, read or not.
require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/notify.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

$uid = (int)($_SESSION['user_id'] ?? 0);
$role = strtolower($_SESSION['user_role'] ?? '');
if (!$uid) out(['success' => false, 'message' => 'Not logged in.'], 401);
if (!in_array($role, ['individual', 'employee'], true)) out(['success' => true, 'unread' => 0, 'items' => []]);

dira_notify_ensure($conn);

const DIRA_BELL_DAYS = 30;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // tidy up now and then (cheap, no scheduled job needed)
    if (mt_rand(1, 20) === 1) {
        $conn->query("DELETE FROM notifications
            WHERE created_at < NOW() - INTERVAL " . DIRA_BELL_DAYS . " DAY");
    }

    $st = $conn->prepare("SELECT id, type, title, body, link, is_read, UNIX_TIMESTAMP(created_at) AS ts
        FROM notifications WHERE user_id = ? AND created_at > NOW() - INTERVAL " . DIRA_BELL_DAYS . " DAY ORDER BY id DESC LIMIT 20");
    $st->bind_param('i', $uid);
    $st->execute();
    $items = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();
    foreach ($items as &$it) { $it['id'] = (int)$it['id']; $it['ts'] = (int)$it['ts']; $it['is_read'] = (int)$it['is_read'] === 1; }
    unset($it);

    $st = $conn->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0 AND created_at > NOW() - INTERVAL " . DIRA_BELL_DAYS . " DAY");
    $st->bind_param('i', $uid);
    $st->execute();
    $unread = (int)$st->get_result()->fetch_row()[0];
    $st->close();

    $st = $conn->prepare("SELECT notify_email FROM users WHERE user_id = ?");
    $st->bind_param('i', $uid);
    $st->execute();
    $pref = $st->get_result()->fetch_row();
    $st->close();

    out(['success' => true, 'unread' => $unread, 'items' => $items, 'email' => (int)($pref[0] ?? 1) === 1]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

if ($action === 'read') {
    $id = (int)($input['id'] ?? 0);
    $st = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
    $st->bind_param('ii', $id, $uid);
    $st->execute();
    $st->close();
    out(['success' => true]);
}

if ($action === 'read_all') {
    $st = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0");
    $st->bind_param('i', $uid);
    $st->execute();
    $st->close();
    out(['success' => true]);
}

if ($action === 'email') {
    $on = !empty($input['on']) ? 1 : 0;
    $st = $conn->prepare("UPDATE users SET notify_email = ? WHERE user_id = ?");
    $st->bind_param('ii', $on, $uid);
    $st->execute();
    $st->close();
    out(['success' => true, 'email' => $on === 1,
         'message' => $on ? "You'll get an email when a game you follow becomes high risk." : 'Risk emails are off.']);
}

out(['success' => false, 'message' => 'Unknown action.'], 400);
