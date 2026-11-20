<?php
// Public: the maintenance banner shown at the top of every page (no login needed).
//   GET -> {notice: {title, body, ends_at} | null}
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$notice = null;
try {
    $t = $conn->query("SHOW TABLES LIKE 'announcements'");
    if ($t && $t->num_rows) {
        $r = $conn->query("SELECT id, title, body, ends_at FROM announcements
            WHERE type = 'maintenance' AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())
            ORDER BY id DESC LIMIT 1");
        $notice = $r ? $r->fetch_assoc() : null;
        if ($notice && $notice['ends_at']) $notice['ends_at'] = gmdate('Y-m-d\\TH:i:s\\Z', strtotime($notice['ends_at'] . ' UTC'));
    }
} catch (Throwable $e) { $notice = null; }

echo json_encode(['success' => true, 'notice' => $notice ?: null], JSON_UNESCAPED_UNICODE);
