<?php
// Government-employee-only guard. Include at the top of employee APIs:
//   require_once __DIR__ . '/employee-auth.php';
// Requested directly it tells employee pages whether the visitor may stay.

require_once __DIR__ . '/session.php';

function dira_employee_deny($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

if (empty($_SESSION['user_id'])) {
    dira_employee_deny(401, 'Please log in as a government employee.');
}

if (strtolower($_SESSION['user_role'] ?? '') !== 'employee') {
    dira_employee_deny(403, 'Government employee access only.');
}

if (strtolower($_SESSION['user_status'] ?? 'active') !== 'active') {
    dira_employee_deny(403, 'Your account is not active.');
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => true, 'employee' => true]);
    exit;
}
