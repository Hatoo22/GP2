<?php
// Suggestions sent through the Dir'a Assistant (admins only)
//   GET                                   -> all suggestions, newest first
//   POST {action:"read", id, read:bool}   -> mark one as read / unread
//   POST {action:"read_all"}              -> mark every unread one as read
require_once __DIR__ . '/admin-auth.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

$conn->query("
    CREATE TABLE IF NOT EXISTS assistant_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(30) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $input['action'] ?? '';

    if ($action === 'read') {
        $id = intval($input['id'] ?? 0);
        $status = !empty($input['read']) ? 'read' : 'new';
        if ($id <= 0) out(['success' => false, 'message' => 'Invalid suggestion.'], 400);
        $st = $conn->prepare("UPDATE assistant_feedback SET status = ? WHERE id = ? LIMIT 1");
        $st->bind_param('si', $status, $id);
        $st->execute();
        $st->close();
        out(['success' => true, 'status' => $status]);
    }

    if ($action === 'read_all') {
        $conn->query("UPDATE assistant_feedback SET status = 'read' WHERE status = 'new'");
        out(['success' => true, 'updated' => $conn->affected_rows]);
    }

    out(['success' => false, 'message' => 'Invalid action.'], 400);
}

$res = $conn->query("
    SELECT f.id, f.type, f.message, f.status, f.created_at,
           u.name AS user_name, u.email AS user_email
    FROM assistant_feedback f
    LEFT JOIN users u ON u.user_id = f.user_id
    ORDER BY f.created_at DESC, f.id DESC
");
$items = [];
while ($res && ($row = $res->fetch_assoc())) $items[] = $row;

out(['success' => true, 'suggestions' => $items]);
