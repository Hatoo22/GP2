<?php
// Admin announcements: new features, maintenance, general news.
//   GET                                     -> the latest announcements
//   POST {action:"create", type, title, body, audience, ends_at?, email?}
//        type: feature | maintenance | info
//        audience: all | individual | employee   (maintenance always goes to everyone)
//        ends_at: when the maintenance banner should disappear, ISO time with zone (maintenance only)
//        email: also send it by email
//   POST {action:"end", id}                 -> hide a maintenance banner now
//   POST {action:"delete", id}              -> remove it (and from everyone's bell)
require_once __DIR__ . '/admin-auth.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/notify.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

dira_notify_ensure($conn);
$TYPES = ['feature', 'maintenance', 'info'];
$AUDIENCES = ['all', 'individual', 'employee'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = $conn->query("SELECT a.id, a.type, a.title, a.body, a.audience, a.ends_at, a.emailed, UNIX_TIMESTAMP(a.created_at) AS ts,
            u.name AS created_by_name,
            (SELECT COUNT(*) FROM notifications n WHERE n.announcement_id = a.id) AS recipients,
            (SELECT COUNT(*) FROM notifications n WHERE n.announcement_id = a.id AND n.is_read = 1) AS seen
        FROM announcements a LEFT JOIN users u ON u.user_id = a.created_by
        ORDER BY a.id DESC LIMIT 50")->fetch_all(MYSQLI_ASSOC);
    $now = time();
    foreach ($rows as &$r) {
        $r['active'] = $r['type'] === 'maintenance' && (!$r['ends_at'] || strtotime($r['ends_at'] . ' UTC') > $now);
        if ($r['ends_at']) $r['ends_at'] = gmdate('Y-m-d\\TH:i:s\\Z', strtotime($r['ends_at'] . ' UTC'));
    }
    unset($r);
    out(['success' => true, 'items' => $rows]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';
$id = (int)($input['id'] ?? 0);

if ($action === 'end') {
    $st = $conn->prepare("UPDATE announcements SET ends_at = UTC_TIMESTAMP() WHERE id = ? AND type = 'maintenance'");
    $st->bind_param('i', $id);
    $st->execute();
    $st->close();
    out(['success' => true, 'message' => 'The maintenance banner is hidden now.']);
}

if ($action === 'delete') {
    $st = $conn->prepare("DELETE FROM notifications WHERE announcement_id = ?");
    $st->bind_param('i', $id);
    $st->execute();
    $st->close();
    $st = $conn->prepare("DELETE FROM announcements WHERE id = ?");
    $st->bind_param('i', $id);
    $st->execute();
    $st->close();
    out(['success' => true, 'message' => 'Announcement removed.']);
}

if ($action !== 'create') out(['success' => false, 'message' => 'Unknown action.'], 400);

$type = in_array($input['type'] ?? '', $TYPES, true) ? $input['type'] : 'info';
$audience = in_array($input['audience'] ?? '', $AUDIENCES, true) ? $input['audience'] : 'all';
if ($type === 'maintenance') $audience = 'all';
$title = trim((string)($input['title'] ?? ''));
$body = trim((string)($input['body'] ?? ''));
if ($title === '') out(['success' => false, 'message' => 'Write a title.'], 400);
if (mb_strlen($title) > 120) out(['success' => false, 'message' => 'Keep the title under 120 characters.'], 400);
if (mb_strlen($body) > 600) out(['success' => false, 'message' => 'Keep the message under 600 characters.'], 400);

$endsAt = null;
if ($type === 'maintenance') {
    $raw = trim((string)($input['ends_at'] ?? ''));
    if ($raw === '') out(['success' => false, 'message' => 'Choose when the maintenance ends, so the banner hides by itself.'], 400);
    $ts = strtotime($raw);
    if (!$ts || $ts <= time()) out(['success' => false, 'message' => 'The end time must be in the future.'], 400);
    $endsAt = gmdate('Y-m-d H:i:s', $ts);   // kept in UTC
}
$sendEmail = !empty($input['email']) ? 1 : 0;
$by = (int)$_SESSION['user_id'];

$st = $conn->prepare("INSERT INTO announcements (type, title, body, audience, ends_at, emailed, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
$st->bind_param('sssssii', $type, $title, $body, $audience, $endsAt, $sendEmail, $by);
$st->execute();
$annId = (int)$st->insert_id;
$st->close();

// who gets it: active players and/or employees
$roles = $audience === 'all' ? "'individual','employee'" : "'" . $audience . "'";
$users = $conn->query("SELECT user_id, name, email FROM users
    WHERE role IN ($roles) AND LOWER(COALESCE(status, 'active')) = 'active'")->fetch_all(MYSQLI_ASSOC);

$ins = $conn->prepare("INSERT INTO notifications (user_id, type, title, body, announcement_id) VALUES (?, ?, ?, ?, ?)");
foreach ($users as $u) {
    $uid = (int)$u['user_id'];
    $ins->bind_param('isssi', $uid, $type, $title, $body, $annId);
    $ins->execute();
}
$ins->close();

$emailed = 0;
$emailNote = '';
if ($sendEmail) {
    if (!dira_mail_ready()) {
        $emailNote = " Emails weren't sent: email isn't set up on the server.";
    } else {
        @set_time_limit(300);
        $base = dira_app_url();
        $html = dira_mail_layout($title, $body !== '' ? $body : $title, 'Open Dir\'a', "$base/login.html",
            "You get this email because you have an account on Dir'a.");
        foreach ($users as $u) {
            if (!filter_var($u['email'], FILTER_VALIDATE_EMAIL)) continue;
            $r = dira_send_mail($u['email'], trim((string)$u['name']), $title, $html, $title . "\n\n" . $body);
            if (!empty($r['ok'])) $emailed++;
        }
        $emailNote = " Emailed to $emailed.";
    }
}

out(['success' => true, 'id' => $annId, 'recipients' => count($users), 'emailed' => $emailed,
     'message' => 'Sent to ' . count($users) . ' ' . (count($users) === 1 ? 'person' : 'people') . '.' . $emailNote]);
