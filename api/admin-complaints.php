<?php
require_once __DIR__ . '/admin-auth.php';

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/spam-check.php';
dira_spam_ensure_columns($conn);


function sendJson($data, $status = 200) {

    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE
    );

    exit;
}


/* =========================================
   DELETE COMPLAINT
========================================= */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $input =
        json_decode(
            file_get_contents('php://input'),
            true
        );


    $action =
        $input['action'] ?? '';


    if ($action !== 'delete') {

        sendJson([
            'success' => false,
            'message' => 'Invalid action.'
        ], 400);
    }


    $reportId =
        intval(
            $input['report_id'] ?? 0
        );


    if ($reportId <= 0) {

        sendJson([
            'success' => false,
            'message' => 'Invalid complaint ID.'
        ], 400);
    }


    $stmt =
        $conn->prepare(
            "DELETE FROM reports
             WHERE report_id = ?
             LIMIT 1"
        );


    $stmt->bind_param(
        'i',
        $reportId
    );


    if (!$stmt->execute()) {

        sendJson([
            'success' => false,
            'message' => 'Unable to delete complaint.'
        ], 500);
    }


    $stmt->close();


    sendJson([
        'success' => true,
        'message' => 'Complaint deleted successfully.'
    ]);
}



/* =========================================
   GET COMPLAINTS
========================================= */

try { dira_spam_backfill($conn); } catch (Throwable $e) { error_log('DIRA spam backfill: ' . $e->getMessage()); }

$sql = "
SELECT

    r.is_spam,
    r.spam_reasons,
    r.report_id,
    r.user_id,
    r.game_id,
    r.title,
    r.status,
    r.date_reported,

    r.behavior_toxic,
    r.behavior_bullying,
    r.behavior_hate,
    r.behavior_sexual,
    r.behavior_threat,
    r.behavior_other,

    r.severity,

    r.location_chat,
    r.location_gameplay,
    r.location_community,

    u.name AS user_name,
    u.email AS user_email,

    g.game_name,
    g.image_url AS game_image

FROM reports r

LEFT JOIN users u
    ON r.user_id = u.user_id

LEFT JOIN games g
    ON r.game_id = g.game_id

ORDER BY
    r.date_reported DESC,
    r.report_id DESC
";


$result =
    $conn->query($sql);


if (!$result) {

    sendJson([
        'success' => false,
        'message' => 'Unable to load complaints.'
    ], 500);
}


$complaints = [];


while (
    $row = $result->fetch_assoc()
) {

    $complaints[] = $row;
}


sendJson([
    'success' => true,
    'count' => count($complaints),
    'complaints' => $complaints
]);

?>