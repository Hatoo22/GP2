<?php
// Admin "Analyze" button. Talks to the AI service (py/comment_api.py),
// which runs py/process_all_games.py in the background.
//   GET  ?action=status            -> progress of the current / last run
//   GET  ?action=count             -> how many games "new" and "all" would process
//   POST {mode:"one", game_id}     -> analyze one game
//   POST {mode:"new"}              -> analyze games that haven't been analyzed yet
//   POST {mode:"all"}              -> re-analyze every game
//   POST {action:"stop"}           -> stop after the current game
//
// Needs on the website: AI_API_URL and ADMIN_TASK_TOKEN
// (the same ADMIN_TASK_TOKEN must be set on the AI service).
// Locally they can go in api/mail-config.local.php as 'ai_api_url' / 'admin_task_token'.
require_once __DIR__ . '/admin-auth.php';
header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }

function setting($env, $key) {
    $v = getenv($env);
    if ($v !== false && $v !== '') return $v;
    $file = __DIR__ . '/mail-config.local.php';
    if (is_file($file)) {
        $local = include $file;
        if (is_array($local) && !empty($local[$key])) return $local[$key];
    }
    return '';
}

$base = rtrim(setting('AI_API_URL', 'ai_api_url'), '/');
$token = setting('ADMIN_TASK_TOKEN', 'admin_task_token');
if ($base === '' || $token === '') {
    out(['success' => false, 'not_configured' => true,
         'message' => 'The analysis service is not connected yet (AI_API_URL / ADMIN_TASK_TOKEN are missing).'], 503);
}

function call_ai($method, $path, $body = null) {
    global $base, $token;
    $ch = curl_init($base . $path);
    $headers = ['Accept: application/json', 'X-Admin-Token: ' . $token];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,   // the service may need to wake up first
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) out(['success' => false, 'message' => 'Could not reach the analysis service: ' . $err], 502);
    $data = json_decode($res, true);
    if (!is_array($data)) out(['success' => false, 'message' => "The analysis service answered unexpectedly (HTTP $code). It may need to be updated."], 502);
    out($data, $code ?: 200);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'status';
    if ($action === 'count') call_ai('GET', '/analyze-count');
    call_ai('GET', '/analyze-status');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['success' => false, 'message' => 'Method not allowed.'], 405);

$input = json_decode(file_get_contents('php://input'), true) ?: [];
if (($input['action'] ?? '') === 'stop') call_ai('POST', '/analyze-stop', new stdClass());

$mode = $input['mode'] ?? '';
if (!in_array($mode, ['one', 'new', 'all'], true)) out(['success' => false, 'message' => 'Choose what to analyze.'], 400);
$body = ['mode' => $mode];
if ($mode === 'one') {
    $gid = intval($input['game_id'] ?? 0);
    if ($gid <= 0) out(['success' => false, 'message' => 'Choose a game.'], 400);
    $body['game_id'] = $gid;
}
call_ai('POST', '/analyze-games', $body);
