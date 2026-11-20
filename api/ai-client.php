<?php
// Talks to the AI service (the Hugging Face Space, see hf-space/app.py).
// Every Gradio call has two steps: start the job, then read its result.
//
// Settings (Railway variables, or api/mail-config.local.php when running locally):
//   AI_API_URL   e.g. https://rathath-dira-api.hf.space        ('ai_api_url')
//   AI_API_KEY   the same value as the API_KEY secret on the Space ('ai_api_key')

function dira_ai_setting(string $env, string $key): string {
    $v = getenv($env);
    if ($v !== false && $v !== '') return (string)$v;
    $file = __DIR__ . '/mail-config.local.php';
    if (is_file($file)) {
        $local = include $file;
        if (is_array($local) && !empty($local[$key])) return (string)$local[$key];
    }
    return '';
}

function dira_ai_base(): string {
    return rtrim(dira_ai_setting('AI_API_URL', 'ai_api_url'), '/');
}

function dira_ai_http(string $url, ?string $postBody, int $timeout): array {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => min(15, $timeout),
        CURLOPT_TIMEOUT        => $timeout,
    ];
    if ($postBody !== null) {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = $postBody;
        $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
    }
    curl_setopt_array($ch, $opts);
    if (is_file(__DIR__ . '/cacert.pem')) curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$body, $code, $err];
}

/**
 * Calls one endpoint of the Space and returns its result (an array),
 * or ['success' => false, 'message' => ..., 'unreachable' => true] when it can't.
 * The API key is added as the last input automatically.
 */
function dira_ai_call(string $api, array $inputs, int $timeout = 180): array {
    $base = dira_ai_base();
    if ($base === '') {
        return ['success' => false, 'unreachable' => true, 'message' => 'The AI service is not connected (AI_API_URL is missing).'];
    }
    $inputs[] = dira_ai_setting('AI_API_KEY', 'ai_api_key');

    // 1) start the job (a sleeping Space needs time to wake up)
    [$body, $code, $err] = dira_ai_http("$base/gradio_api/call/$api", json_encode(['data' => $inputs]), min(90, $timeout));
    $start = is_string($body) ? json_decode($body, true) : null;
    if ($body === false || $code >= 400 || empty($start['event_id'])) {
        $why = $body === false ? $err : "HTTP $code";
        return ['success' => false, 'unreachable' => true,
                'message' => "The AI service didn't answer ($why). It may be waking up, try again in a minute."];
    }

    // 2) wait for the result (server-sent events text)
    [$body, $code, $err] = dira_ai_http("$base/gradio_api/call/$api/" . urlencode($start['event_id']), null, $timeout);
    if (is_string($body) && preg_match('/event:\s*complete\s*\ndata:\s*(.+)/', $body, $m)) {
        $out = json_decode(trim($m[1]), true);
        if (is_array($out) && is_array($out[0] ?? null)) return $out[0];
    }
    if (is_string($body) && preg_match('/event:\s*error/', $body)) {
        return ['success' => false, 'message' => 'The AI service hit an error while working on this. Check the Space logs.'];
    }
    return ['success' => false, 'unreachable' => true,
            'message' => 'The AI service took too long or answered unexpectedly.' . ($err ? " ($err)" : '')];
}
