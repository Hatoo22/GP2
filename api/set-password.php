<?php
// GET  ?token=...                     -> is the link valid? (purpose, email, name)
// POST {token, password, name?}       -> saves the new password (and the name for invited admins)
require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/password-tokens.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

$expired = ['success' => false, 'expired' => true, 'message' => 'This link has expired or was already used.'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $row = dira_token_find($conn, (string)($_GET['token'] ?? ''));
    if (!$row) out($expired, 410);
    out([
        'success' => true,
        'purpose' => $row['purpose'],
        'email'   => $row['email'],
        'name'    => $row['purpose'] === 'invite' ? '' : $row['name'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$password = (string)($input['password'] ?? '');
$row = dira_token_find($conn, (string)($input['token'] ?? ''));
if (!$row) out($expired, 410);

if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    out(['success' => false, 'message' => 'Use at least 8 characters with letters and numbers.'], 400);
}

$userId = (int)$row['user_id'];

// resetting to the password the account already has: tell them, change nothing
if ($row['purpose'] === 'reset') {
    $cur = $conn->prepare("SELECT password FROM users WHERE user_id = ? LIMIT 1");
    $cur->bind_param('i', $userId);
    $cur->execute();
    $stored = (string)($cur->get_result()->fetch_row()[0] ?? '');
    $cur->close();
    if ($stored !== '' && (password_verify($password, $stored) || hash_equals($stored, $password))) {
        out([
            'success' => false,
            'same_password' => true,
            'message' => "That's already your current password, so nothing needs to change. You can log in with it.",
        ]);
    }
}

$hash = password_hash($password, PASSWORD_DEFAULT);

$conn->begin_transaction();
try {
    if ($row['purpose'] === 'invite') {
        $name = trim((string)($input['name'] ?? ''));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
            $conn->rollback();
            out(['success' => false, 'message' => 'Please enter your full name.'], 400);
        }
        $st = $conn->prepare("UPDATE users SET password = ?, name = ?, status = 'active' WHERE user_id = ? LIMIT 1");
        $st->bind_param('ssi', $hash, $name, $userId);
    } else {
        $st = $conn->prepare("UPDATE users SET password = ? WHERE user_id = ? LIMIT 1");
        $st->bind_param('si', $hash, $userId);
    }
    $st->execute();
    $st->close();

    // this link and any other open links for the user stop working
    $u = $conn->prepare("UPDATE password_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL");
    $u->bind_param('i', $userId);
    $u->execute();
    $u->close();

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log('DIRA set-password: ' . $e->getMessage());
    out(['success' => false, 'message' => "Couldn't save your password. Please try again."], 500);
}

out([
    'success' => true,
    'message' => $row['purpose'] === 'invite'
        ? 'Your admin account is ready. You can log in now.'
        : 'Your password was changed. You can log in now.',
]);
