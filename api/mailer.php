<?php
// Sending email through Brevo's HTTPS API (Railway Hobby blocks SMTP).
//
// Settings come from environment variables on Railway:
//   BREVO_API_KEY    – the API key (Transactional email: All)
//   MAIL_FROM        – verified sender address
//   MAIL_FROM_NAME   – name people see
//   APP_URL          – optional, e.g. https://dira.up.railway.app
// Locally (MAMP) they can be put in api/mail-config.local.php instead,
// which is listed in .gitignore and must never be committed.

function dira_mail_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $local = [];
    $file = __DIR__ . '/mail-config.local.php';
    if (is_file($file)) {
        $loaded = include $file;
        if (is_array($loaded)) $local = $loaded;
    }
    $pick = function ($env, $key, $default = '') use ($local) {
        $v = getenv($env);
        if ($v !== false && $v !== '') return $v;
        return $local[$key] ?? $default;
    };
    $cfg = [
        'api_key'   => $pick('BREVO_API_KEY', 'api_key'),
        'from'      => $pick('MAIL_FROM', 'from', 'dira.mrhn@gmail.com'),
        'from_name' => $pick('MAIL_FROM_NAME', 'from_name', "Dir'a"),
        'app_url'   => rtrim($pick('APP_URL', 'app_url'), '/'),
    ];
    return $cfg;
}

// Base URL of the site, e.g. http://localhost:8888/GP2/GP2-Last-Version
function dira_app_url(): string {
    $cfg = dira_mail_config();
    if ($cfg['app_url'] !== '') return $cfg['app_url'];
    $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
    $proto = explode(',', $proto)[0];
    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return $proto . '://' . $host . $dir;
}

function dira_mail_ready(): bool {
    return dira_mail_config()['api_key'] !== '';
}

// Returns ['ok' => bool, 'error' => string]
function dira_send_mail(string $toEmail, string $toName, string $subject, string $html, string $text = ''): array {
    $cfg = dira_mail_config();
    if ($cfg['api_key'] === '') {
        return ['ok' => false, 'error' => 'Email is not set up yet (BREVO_API_KEY is missing).'];
    }

    $payload = [
        'sender'      => ['email' => $cfg['from'], 'name' => $cfg['from_name']],
        'to'          => [['email' => $toEmail, 'name' => $toName !== '' ? $toName : $toEmail]],
        'subject'     => $subject,
        'htmlContent' => $html,
    ];
    if ($text !== '') $payload['textContent'] = $text;

    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'accept: application/json',
            'content-type: application/json',
            'api-key: ' . $cfg['api_key'],
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    if (is_file(__DIR__ . '/cacert.pem')) {
        curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem');
    }
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        error_log('DIRA mail: ' . $err);
        return ['ok' => false, 'error' => 'Could not reach the email service.'];
    }
    if ($code < 200 || $code >= 300) {
        error_log('DIRA mail HTTP ' . $code . ': ' . $body);
        $msg = json_decode($body, true)['message'] ?? 'The email service refused the message.';
        return ['ok' => false, 'error' => $msg];
    }
    return ['ok' => true, 'error' => ''];
}

// Branded email layout in Dir'a's dark theme (black + orange)
function dira_mail_layout(string $title, string $intro, string $buttonText, string $url, string $note, string $extraHtml = ''): string {
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    return '<!doctype html><html><head><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>'
      . '<body style="margin:0;padding:0;background:#0d0d0c;font-family:Arial,Helvetica,sans-serif;color:#f5f5f4">'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d0d0c" style="background:#0d0d0c;padding:36px 12px"><tr><td align="center">'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#141311" style="max-width:520px;background:#141311;border:1px solid #2a241e;border-radius:18px;padding:34px">'
      . '<tr><td style="font-size:22px;font-weight:bold;color:#ff9d3d;padding-bottom:22px;letter-spacing:0.5px">Dir\'a</td></tr>'
      . '<tr><td style="font-size:21px;font-weight:bold;color:#f5f5f4;padding-bottom:12px">' . $e($title) . '</td></tr>'
      . '<tr><td style="font-size:15px;line-height:1.65;color:#d6d3d1;padding-bottom:26px">' . $e($intro) . '</td></tr>'
      . ($extraHtml !== '' ? '<tr><td style="padding-bottom:26px">' . $extraHtml . '</td></tr>' : '')
      . '<tr><td style="padding-bottom:26px"><a href="' . $e($url) . '" style="display:inline-block;background:#ff9d3d;color:#1a0f05;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:999px">' . $e($buttonText) . '</a></td></tr>'
      . '<tr><td style="font-size:13px;line-height:1.6;color:#a8a29e;border-top:1px solid #2a241e;padding-top:18px">' . $e($note) . '</td></tr>'
      . '<tr><td style="font-size:12px;line-height:1.5;color:#78716c;padding-top:14px;word-break:break-all">If the button doesn\'t work, copy this link:<br><a href="' . $e($url) . '" style="color:#ff9d3d">' . $e($url) . '</a></td></tr>'
      . '</table></td></tr></table></body></html>';
}
