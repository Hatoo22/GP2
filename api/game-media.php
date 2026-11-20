<?php
// Public: a short clip (and stills) of a game from its Steam store page,
// used by the home page so the screen shows the game that was picked.
//   GET ?game_id=N -> {video: url | null, type: "hls" | "mp4", poster, shots: [..]}
// Newer Steam trailers only come as HLS streams (played with hls.js, or natively on Safari).
// Steam answers are cached for a day in the system temp folder.
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');

function out($d) { echo json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }

$gameId = (int)($_GET['game_id'] ?? 0);
$st = $conn->prepare("SELECT api_game_id, image_url FROM games WHERE game_id = ? LIMIT 1");
$st->bind_param('i', $gameId);
$st->execute();
$row = $st->get_result()->fetch_assoc();
$st->close();
$appId = preg_replace('/\D/', '', (string)($row['api_game_id'] ?? ''));
// games added by hand may only have a Steam picture: its address holds the app id
if ($appId === '' && preg_match('#/apps/(\d+)/#', (string)($row['image_url'] ?? ''), $m)) $appId = $m[1];
if ($appId === '') out(['success' => true, 'video' => null, 'poster' => null, 'shots' => []]);

$cacheFile = rtrim(sys_get_temp_dir(), '/\\') . "/dira-media-$appId.json";
if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400) {
    $cached = json_decode((string)file_get_contents($cacheFile), true);
    if (is_array($cached)) out($cached);
}

$ch = curl_init("https://store.steampowered.com/api/appdetails?appids=$appId&l=english");
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_FOLLOWLOCATION => true]);
if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
$body = curl_exec($ch);
curl_close($ch);

$data = json_decode((string)$body, true);
$info = $data[$appId]['data'] ?? [];

$video = null;
$type = null;
$poster = null;
$movies = $info['movies'] ?? [];
// the "highlight" trailer is the store's main one
usort($movies, fn($a, $b) => (int)!empty($b['highlight']) <=> (int)!empty($a['highlight']));
foreach ($movies as $m) {
    $mp4 = $m['mp4']['480'] ?? $m['mp4']['max'] ?? $m['webm']['480'] ?? $m['webm']['max'] ?? null;
    $hls = $m['hls_h264'] ?? null;
    if ($mp4 || $hls) {
        $video = preg_replace('#^http://#', 'https://', $mp4 ?: $hls);
        $type = $mp4 ? 'mp4' : 'hls';
        $poster = isset($m['thumbnail']) ? preg_replace('#^http://#', 'https://', $m['thumbnail']) : null;
        break;
    }
}
$shots = [];
foreach (array_slice($info['screenshots'] ?? [], 0, 4) as $s) {
    if (!empty($s['path_full'])) $shots[] = preg_replace('#^http://#', 'https://', $s['path_full']);
}

$result = ['success' => true, 'video' => $video, 'type' => $type, 'poster' => $poster ?: ($shots[0] ?? null), 'shots' => $shots];
if ($info) @file_put_contents($cacheFile, json_encode($result, JSON_UNESCAPED_SLASHES));
out($result);
