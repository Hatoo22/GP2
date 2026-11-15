<?php
// Lets an individual user delete their own account.
// Personal data is removed (name, email, password, avatar, saved list).
// Reports and suggestions they submitted stay on the platform,
// shown as "Deleted user", because they are part of game reviews
// and statistics. Analyzed comments only live as counts on games.

require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/db.php';

function respond($code, $body) {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Invalid request method.']);
}

$userId = (int)($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    respond(401, ['success' => false, 'message' => 'Please log in first.']);
}

if (strtolower($_SESSION['user_role'] ?? '') !== 'individual') {
    respond(403, ['success' => false, 'message' => 'Only individual accounts can be deleted from the profile page.']);
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$password = (string)($data['password'] ?? '');

if ($password === '') {
    respond(400, ['success' => false, 'message' => 'Please enter your password to confirm.']);
}

$columns  = get_columns($conn, 'users');
$passCol  = pick_column($columns, ['password', 'password_hash', 'user_password']);
$emailCol = pick_column($columns, ['email', 'user_email']);
$nameCol  = pick_column($columns, ['name', 'full_name', 'username']);

if (!$passCol || !$emailCol) {
    respond(500, ['success' => false, 'message' => 'Account table is not configured correctly.']);
}

/* ---------- confirm password ---------- */
$stmt = $conn->prepare("SELECT `$passCol` AS pw FROM users WHERE user_id = ? LIMIT 1");
$stmt->bind_param('i', $userId);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    respond(404, ['success' => false, 'message' => 'Account not found.']);
}

$stored = (string)($row['pw'] ?? '');
$ok = password_verify($password, $stored) || ($stored !== '' && hash_equals($stored, $password));

if (!$ok) {
    respond(401, ['success' => false, 'message' => 'Incorrect password.']);
}

/* ---------- remember when an account was deleted ---------- */
if (!in_array('deleted_at', $columns, true)) {
    try {
        $conn->query("ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL");
        $columns[] = 'deleted_at';
    } catch (Throwable $e) {
        error_log('DIRA: could not add users.deleted_at: ' . $e->getMessage());
    }
}

/* ---------- delete personal data ---------- */
$conn->begin_transaction();

try {
    // saved games list
    $stmt = $conn->prepare("DELETE FROM tracked_games WHERE user_id = ?");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $stmt->close();

    // anonymize the account row (kept so their reports still point to "Deleted user")
    $set = [];
    $types = '';
    $values = [];

    if ($nameCol) { $set[] = "`$nameCol` = ?"; $types .= 's'; $values[] = 'Deleted user'; }

    $set[] = "`$emailCol` = ?"; $types .= 's'; $values[] = 'deleted-' . $userId . '@deleted.dira';

    // random password nobody knows, so the account can never be logged into
    $set[] = "`$passCol` = ?"; $types .= 's'; $values[] = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);

    if (in_array('profile_avatar', $columns, true)) { $set[] = "profile_avatar = 'default'"; }
    if (in_array('status', $columns, true))         { $set[] = "status = 'disabled'"; }
    if (in_array('deleted_at', $columns, true))     { $set[] = "deleted_at = NOW()"; }

    $sql = "UPDATE users SET " . implode(', ', $set) . " WHERE user_id = ? AND role = 'individual' LIMIT 1";
    $types .= 'i';
    $values[] = $userId;

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$values);
    $stmt->execute();
    $stmt->close();

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log('DIRA: delete account failed: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Could not delete the account. Please try again.']);
}

/* ---------- log out ---------- */
$_SESSION = [];
session_destroy();

respond(200, ['success' => true, 'message' => 'Your account has been deleted.']);
