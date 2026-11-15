<?php
// Admin-only guard. Include at the top of every admin API:
//   require_once __DIR__ . '/admin-auth.php';
// Stops the request with 401/403 unless the logged-in user is an admin.
// Requested directly (api/admin-auth.php) it tells the admin pages
// whether the visitor may stay on them.

require_once __DIR__ . '/session.php';

function dira_admin_deny($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

if (empty($_SESSION['user_id'])) {
    dira_admin_deny(401, 'Please log in as an administrator.');
}

if (strtolower($_SESSION['user_role'] ?? '') !== 'admin') {
    dira_admin_deny(403, 'Administrator access only.');
}

if (strtolower($_SESSION['user_status'] ?? 'active') !== 'active') {
    dira_admin_deny(403, 'Your account is not active.');
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => true, 'admin' => true]);
    exit;
}
