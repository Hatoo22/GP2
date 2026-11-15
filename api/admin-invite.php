<?php
// Admins invite another admin by email.
// POST {email}            -> creates an "invited" admin and emails a link (valid 72 hours)
// POST {user_id, resend}  -> sends a fresh link to someone who is still invited
require_once __DIR__ . '/admin-auth.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/password-tokens.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);
if (!dira_mail_ready()) out(['success' => false, 'message' => "Email isn't set up yet, so invitations can't be sent."], 503);

dira_users_allow_invited($conn);
dira_tokens_ensure($conn);

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$inviter = trim((string)($_SESSION['user_name'] ?? '')) ?: 'An administrator';

if (!empty($input['resend'])) {
    $userId = intval($input['user_id'] ?? 0);
    $st = $conn->prepare("SELECT user_id, email, role, status FROM users WHERE user_id = ? LIMIT 1");
    $st->bind_param('i', $userId);
    $st->execute();
    $user = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$user || $user['role'] !== 'admin' || $user['status'] !== 'invited') {
        out(['success' => false, 'message' => 'This person is not waiting for an invitation.'], 400);
    }
} else {
    $email = strtolower(trim((string)($input['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['success' => false, 'message' => 'Please enter a valid email address.'], 400);

    $st = $conn->prepare("SELECT user_id, email, role, status FROM users WHERE LOWER(email) = ? LIMIT 1");
    $st->bind_param('s', $email);
    $st->execute();
    $existing = $st->get_result()->fetch_assoc();
    $st->close();

    if ($existing && !($existing['role'] === 'admin' && $existing['status'] === 'invited')) {
        out(['success' => false, 'message' => 'This email already has a Dir\'a account.'], 409);
    }

    if ($existing) {
        $user = $existing; // invited before: just send a new link
    } else {
        // placeholder name and an unusable random password until they accept
        $placeholder = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
        $name = 'Invited admin';
        $ins = $conn->prepare("INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, 'admin', 'invited')");
        $ins->bind_param('sss', $name, $email, $placeholder);
        $ins->execute();
        $user = ['user_id' => $conn->insert_id, 'email' => $email];
        $ins->close();
    }
}

$token = dira_token_create($conn, (int)$user['user_id'], 'invite', 72);
$link = dira_app_url() . '/set-password.html?token=' . $token;

$html = dira_mail_layout(
    "You're invited to manage Dir'a",
    "$inviter added you as an administrator on Dir'a. Set your name and password to activate your account.",
    'Accept invitation',
    $link,
    'This link works once and expires in 3 days. If you weren\'t expecting this, you can ignore this email.'
);
$text = "You're invited to be an administrator on Dir'a. Accept here: $link\n\nThe link expires in 3 days.";
$sent = dira_send_mail($user['email'], '', "You're invited to Dir'a", $html, $text);

if (!$sent['ok']) {
    out(['success' => false, 'message' => 'The account was created, but the email failed: ' . $sent['error'] . ' Try "Resend invite" later.', 'user_id' => (int)$user['user_id']], 502);
}

out(['success' => true, 'message' => 'Invitation sent to ' . $user['email'] . '.', 'user_id' => (int)$user['user_id']]);
