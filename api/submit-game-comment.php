<?php

session_start();

header('Content-Type: application/json; charset=utf-8');

if (
    !isset($_SESSION['user_id']) ||
    ($_SESSION['user_role'] ?? '') !== 'individual'
) {
    http_response_code(403);

    echo json_encode([
        'success' => false,
        'message' => 'You are not allowed to submit comments.'
    ]);

    exit;
}

$data = json_decode(
    file_get_contents('php://input'),
    true
);

$gameId = (int)($data['game_id'] ?? 0);
$comment = trim($data['comment'] ?? '');

if ($gameId <= 0 || $comment === '') {
    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Invalid comment data.'
    ]);

    exit;
}

$payload = json_encode([
    'game_id' => $gameId,
    'comment' => $comment
]);

$ch = curl_init(
    'http://127.0.0.1:5000/analyze-comment'
);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo(
    $ch,
    CURLINFO_HTTP_CODE
);

if ($response === false) {
    curl_close($ch);

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Analysis service is unavailable.'
    ]);

    exit;
}

curl_close($ch);

http_response_code(
    $httpCode >= 100
        ? $httpCode
        : 200
);

echo $response;