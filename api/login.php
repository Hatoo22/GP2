<?php
require_once __DIR__ . '/session.php';
require_once 'db.php';

date_default_timezone_set('Asia/Riyadh');

$data = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';

// Validate required login fields
if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please enter email and password.']);
    exit;
}

/* ---------- too many wrong attempts: pause for a few minutes ---------- */
// After 5 wrong passwords for the same email within 5 minutes, logging in to that
// email is paused until 5 minutes after the last wrong try. Forgot password still works.
const DIRA_MAX_ATTEMPTS = 5;
const DIRA_LOCK_MINUTES = 5;

$conn->query("
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(150) NOT NULL,
        ip VARCHAR(45) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_email_time (email, created_at)
    )
");
$attemptEmail = strtolower($email);
$ip = substr($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);

$lockCheck = $conn->prepare("
    SELECT COUNT(*) AS n,
           GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), MAX(created_at) + INTERVAL " . DIRA_LOCK_MINUTES . " MINUTE)) AS wait_s
    FROM login_attempts
    WHERE email = ? AND created_at > NOW() - INTERVAL " . DIRA_LOCK_MINUTES . " MINUTE
");
$lockCheck->bind_param('s', $attemptEmail);
$lockCheck->execute();
$lock = $lockCheck->get_result()->fetch_assoc();
$lockCheck->close();

if ((int)$lock['n'] >= DIRA_MAX_ATTEMPTS) {
    $mins = max(1, (int)ceil(((int)$lock['wait_s']) / 60));
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'locked'  => true,
        'message' => "Too many wrong attempts. Try again in $mins minute" . ($mins === 1 ? '' : 's') . ", or use Forgot password."
    ]);
    exit;
}

function dira_login_failed($conn, $attemptEmail, $ip, $remainingBefore) {
    $st = $conn->prepare("INSERT INTO login_attempts (email, ip) VALUES (?, ?)");
    $st->bind_param('ss', $attemptEmail, $ip);
    $st->execute();
    $st->close();
    // tidy up old rows now and then
    if (mt_rand(1, 50) === 1) $conn->query("DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL 1 DAY");

    $left = $remainingBefore - 1;
    $msg = 'Incorrect email or password.';
    if ($left <= 0) $msg = 'Too many wrong attempts. Try again in ' . DIRA_LOCK_MINUTES . ' minutes, or use Forgot password.';
    elseif ($left <= 2) $msg .= " $left attempt" . ($left === 1 ? '' : 's') . ' left before logging in is paused for a few minutes.';

    http_response_code($left <= 0 ? 429 : 401);
    echo json_encode(['success' => false, 'locked' => $left <= 0, 'message' => $msg]);
    exit;
}
$remaining = DIRA_MAX_ATTEMPTS - (int)$lock['n'];

// Get the columns of the users table
$columns = get_columns($conn, 'users');

// Match the expected fields with the actual column names in the database
$emailCol = pick_column($columns, ['email', 'user_email']);
$passCol  = pick_column($columns, ['password', 'password_hash', 'user_password']);
$nameCol  = pick_column($columns, ['name', 'full_name', 'username']);
$idCol    = pick_column($columns, ['user_id', 'id']);
$roleCol  = pick_column($columns, ['role']);
$statusCol = pick_column($columns, ['status']);

// Find the user by email
$sql = "SELECT * FROM `users` WHERE `$emailCol` = ? LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

// Return an error if the email does not exist (counts as a wrong attempt too)
if (!$result || $result->num_rows === 0) {
    dira_login_failed($conn, $attemptEmail, $ip, $remaining);
}

$user = $result->fetch_assoc();

$storedPassword = (string)($user[$passCol] ?? '');
$isHashed = !empty(password_get_info($storedPassword)['algo']);
$passwordIsCorrect = $isHashed
    ? password_verify($password, $storedPassword)
    : ($storedPassword !== '' && hash_equals($storedPassword, $password)); // old accounts saved as plain text

// Return an error if the password is incorrect
if (!$passwordIsCorrect) {
    dira_login_failed($conn, $attemptEmail, $ip, $remaining);
}

// correct password: clear the wrong attempts for this email
$clear = $conn->prepare("DELETE FROM login_attempts WHERE email = ?");
$clear->bind_param('s', $attemptEmail);
$clear->execute();
$clear->close();

// passwords still saved as plain text (or with an old method) are encrypted now
if (!$isHashed || password_needs_rehash($storedPassword, PASSWORD_DEFAULT)) {
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    $up = $conn->prepare("UPDATE `users` SET `$passCol` = ? WHERE `$idCol` = ? LIMIT 1");
    $uid = $user[$idCol];
    $up->bind_param('si', $newHash, $uid);
    $up->execute();
    $up->close();
}

$status = $statusCol ? strtolower($user[$statusCol] ?? 'active') : 'active';
$role = $roleCol ? strtolower($user[$roleCol] ?? 'individual') : 'individual';

if ($status === 'invited') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Please finish setting up your account using the link in your invitation email.'
    ]);
    exit;
}

if ($status === 'pending') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Your account is pending administrator approval.'
    ]);
    exit;
}

if ($status === 'disabled') {

    $disabledUntil =
        $user['disabled_until'] ?? null;

    if (
        $disabledUntil &&
        strtotime($disabledUntil) <= time()
    ) {

        $reactivate =
            $conn->prepare("
                UPDATE users
                SET
                    status = 'active',
                    disable_reason = NULL,
                    disabled_at = NULL,
                    disabled_until = NULL
                WHERE user_id = ?
                LIMIT 1
            ");

        $reactivate->bind_param(
            'i',
            $user[$idCol]
        );

        $reactivate->execute();
        $reactivate->close();

        $status = 'active';

    } else {

        http_response_code(403);

        $message =
            'Your account is temporarily suspended.';

        if ($disabledUntil) {

            $formattedDate =
                date(
                    'd M Y, h:i A',
                    strtotime($disabledUntil)
                );

            $message =
                'Your account is temporarily suspended until ' .
                $formattedDate .
                '.';
        }

        echo json_encode([
            'success' => false,
            'message' => $message
        ]);

        exit;
    }
}

// Store the current user's information in the session
$_SESSION['user_id'] = $user[$idCol];
$_SESSION['user_email'] = $user[$emailCol];
$_SESSION['user_name'] = $nameCol ? $user[$nameCol] : '';
$_SESSION['user_role'] = $role;
$_SESSION['user_status'] = $status;

// Return the logged-in user's data
echo json_encode([
    'success' => true,
    'message' => 'Login successful.',
    'user' => [
        'id' => $user[$idCol],
        'name' => $nameCol ? $user[$nameCol] : '',
        'email' => $user[$emailCol],
        'role' => $role,
        'status' => $status
    ]
]);
?>