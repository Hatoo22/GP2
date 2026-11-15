<?php
// POST {email} -> emails a one-time "set a new password" link (valid 1 hour).
// Tells the person when no account uses this email, so they know to sign up instead.
require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/password-tokens.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$email = strtolower(trim($input['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    out(['success' => false, 'message' => 'Please enter a valid email address.'], 400);
}

$generic = ['success' => true, 'message' => "We've sent a link to reset your password. Check your inbox and spam folder."];

if (!dira_mail_ready()) {
    out(['success' => false, 'message' => "Password reset isn't available right now. Please contact the administrator."], 503);
}

try {
    $hasDeleted = (bool)$conn->query("SHOW COLUMNS FROM users LIKE 'deleted_at'")->num_rows;
    $sql = "SELECT user_id, name, email, status FROM users WHERE LOWER(email) = ?" . ($hasDeleted ? " AND deleted_at IS NULL" : "") . " LIMIT 1";
    $st = $conn->prepare($sql);
    $st->bind_param('s', $email);
    $st->execute();
    $user = $st->get_result()->fetch_assoc();
    $st->close();

    if (!$user) {
        out(['success' => false, 'no_account' => true, 'message' => "There's no Dir'a account with this email. Check the spelling, or"], 404);
    }
    if (strtolower($user['status']) === 'invited') {
        out(['success' => false, 'message' => "This account hasn't been set up yet. Use the invitation link in your email to set your password."], 409);
    }
    // a link was sent a minute ago: don't send another one
    if (dira_token_sent_recently($conn, (int)$user['user_id'], 'reset')) out($generic);

    $token = dira_token_create($conn, (int)$user['user_id'], 'reset', 1);
    $link = dira_app_url() . '/set-password.html?token=' . $token;
    $name = trim((string)$user['name']);

    $html = dira_mail_layout(
        'Reset your password',
        ($name !== '' ? "Hi $name, w" : 'W') . "e got a request to reset the password for your Dir'a account.",
        'Set a new password',
        $link,
        "This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same."
    );
    $text = "Reset your Dir'a password: $link\n\nThis link works once and expires in 1 hour.";
    $sent = dira_send_mail($user['email'], $name, "Reset your Dir'a password", $html, $text);
    if (!$sent['ok']) error_log('DIRA forgot-password: ' . $sent['error']);
} catch (Throwable $e) {
    error_log('DIRA forgot-password: ' . $e->getMessage());
}

out($generic);
