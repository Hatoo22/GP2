<?php
// =========================================================
// DIR'A — spam rules for user reports
// Every report gets a spam score from clear, explainable rules.
// Score >= DIRA_SPAM_THRESHOLD  ->  the report goes to "Spam".
// Employees can always override the decision (Not spam / Mark as spam).
// On top of the rules, a pretrained spam model (mshenoda/roberta-spam,
// running on the AI service) adds points through dira_spam_model_score().
// If the AI service can't be reached, the rules alone decide.
// =========================================================

const DIRA_SPAM_THRESHOLD = 50;

/** Make sure the spam columns exist on the reports table (runs once). */
function dira_spam_ensure_columns($conn) {
    static $done = false;
    if ($done) return;
    $done = true;

    $cols = [];
    $res = $conn->query("SHOW COLUMNS FROM reports");
    if ($res) {
        while ($r = $res->fetch_assoc()) $cols[] = $r['Field'];
    }
    $add = [];
    if (!in_array('is_spam', $cols, true))       $add[] = "ADD COLUMN is_spam TINYINT(1) NOT NULL DEFAULT 0";
    if (!in_array('spam_score', $cols, true))    $add[] = "ADD COLUMN spam_score INT NULL DEFAULT NULL";
    if (!in_array('spam_reasons', $cols, true))  $add[] = "ADD COLUMN spam_reasons TEXT NULL";
    if (!in_array('spam_override', $cols, true)) $add[] = "ADD COLUMN spam_override VARCHAR(10) NULL DEFAULT NULL";
    if ($add) {
        try {
            $conn->query("ALTER TABLE reports " . implode(', ', $add));
        } catch (Throwable $e) {
            error_log('DIRA: could not add spam columns: ' . $e->getMessage());
        }
    }
}

function dira_spam_normalize($text) {
    $t = mb_strtolower(trim((string)$text));
    $t = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $t);
    return trim(preg_replace('/\s+/u', ' ', $t));
}

/** Text that carries no meaning: "tttt", "aaaa!!!", "asdfgh", "qwerty", "xzcvb". */
function dira_spam_gibberish_reason($text, $label) {
    $raw = trim((string)$text);
    if ($raw === '') return null;
    $t = mb_strtolower(preg_replace('/\s+/u', '', $raw));
    $len = mb_strlen($t);
    if ($len === 0) return null;

    // the same character repeated (tttt, aaaaaa, !!!!!)
    if (preg_match('/(.)\1{3,}/u', $t)) {
        return "Repeated characters in the $label";
    }
    // one character makes up most of the text
    $counts = count_chars(preg_replace('/[^a-z0-9]/', '', $t), 1);
    if ($len >= 4 && $counts && max($counts) / $len >= 0.6) {
        return "Repeated characters in the $label";
    }
    // keyboard mashing
    foreach (['asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'qwer', 'wert', 'erty', 'rtyu', 'tyui', 'yuio', 'zxcv', 'xcvb', 'cvbn', 'vbnm', '1234', '2345', '3456'] as $seq) {
        if (strpos($t, $seq) !== false) return "Keyboard mashing in the $label";
    }
    // a long latin "word" with no vowels at all (e.g. "xkcdqrtpl")
    if (preg_match('/^[a-z]+$/', $t) && $len >= 6 && !preg_match('/[aeiouy]/', $t)) {
        return "The $label has no real words";
    }
    return null;
}

/** Links or advertising words. */
function dira_spam_promo_reason($text) {
    $t = mb_strtolower((string)$text);
    if (preg_match('~(https?://|www\.|\.(com|net|org|io|gg|ly|xyz|ru)\b)~', $t)) {
        return "Contains a link";
    }
    if (preg_match('/\b(free|win|winner|prize|discount|promo|coupon|buy now|click here|subscribe|followers|giveaway|cheap|offer)\b/u', $t)) {
        return "Looks like an advertisement";
    }
    return null;
}

/**
 * Score one report. $r needs: user_id, game_id, title, behavior_other.
 * Optional: report_id (so it isn't compared with itself), date_reported.
 * Returns ['score' => int, 'reasons' => string[], 'is_spam' => bool]
 */
function dira_spam_score($conn, array $r, $useModel = true) {
    $score = 0;
    $reasons = [];

    $title = (string)($r['title'] ?? '');
    $other = (string)($r['behavior_other'] ?? '');
    $userId = (int)($r['user_id'] ?? 0);
    $gameId = (int)($r['game_id'] ?? 0);
    $reportId = (int)($r['report_id'] ?? 0);
    $when = !empty($r['date_reported']) ? $r['date_reported'] : date('Y-m-d H:i:s');

    // 1) meaningless text
    if (($why = dira_spam_gibberish_reason($title, 'title'))) { $score += 55; $reasons[] = $why; }
    elseif (mb_strlen(trim($title)) > 0 && mb_strlen(trim($title)) < 4) { $score += 30; $reasons[] = "The title is too short to mean anything"; }
    if (($why = dira_spam_gibberish_reason($other, 'details'))) { $score += 30; $reasons[] = $why; }

    // 2) links / ads
    if (($why = dira_spam_promo_reason($title . ' ' . $other))) { $score += 50; $reasons[] = $why; }

    if ($userId > 0) {
        // 3) the same report sent again (same user, same game, same title) within 30 days
        $norm = dira_spam_normalize($title);
        if ($norm !== '') {
            $stmt = $conn->prepare("
                SELECT title FROM reports
                WHERE user_id = ? AND game_id = ? AND report_id <> ?
                  AND date_reported BETWEEN DATE_SUB(?, INTERVAL 30 DAY) AND ?
            ");
            $stmt->bind_param('iiiss', $userId, $gameId, $reportId, $when, $when);
            $stmt->execute();
            $res = $stmt->get_result();
            $dups = 0;
            while ($row = $res->fetch_assoc()) {
                if (dira_spam_normalize($row['title']) === $norm) $dups++;
            }
            $stmt->close();
            if ($dups > 0) {
                $score += 50;
                $reasons[] = $dups === 1 ? "Same report was already sent before" : "Same report was sent " . ($dups + 1) . " times";
            }
        }

        // 4) flooding: many reports from the same user in a short time
        $stmt = $conn->prepare("
            SELECT COUNT(*) AS n FROM reports
            WHERE user_id = ? AND report_id <> ?
              AND date_reported BETWEEN DATE_SUB(?, INTERVAL 1 HOUR) AND ?
        ");
        $stmt->bind_param('iiss', $userId, $reportId, $when, $when);
        $stmt->execute();
        $n = (int)($stmt->get_result()->fetch_assoc()['n'] ?? 0);
        $stmt->close();
        if ($n >= 4) {
            $score += 40;
            $reasons[] = "Too many reports from this user in one hour (" . ($n + 1) . ")";
        }
    }

    // 5) pretrained spam model: only for new reports, and only when the rules
    //    above haven't already decided it's spam
    $model = ($useModel && $score < DIRA_SPAM_THRESHOLD)
        ? dira_spam_model_score($title . "\n" . $other)
        : ['score' => 0, 'reason' => null];
    if ($model['score'] > 0) {
        $score += $model['score'];
        // don't repeat what the rules already said
        if (!empty($model['reason']) && !in_array('Looks like an advertisement', $reasons, true)) $reasons[] = $model['reason'];
    }

    return [
        'score' => min(100, $score),
        'reasons' => $reasons,
        'is_spam' => $score >= DIRA_SPAM_THRESHOLD,
    ];
}

/**
 * Model 2: pretrained spam classifier on the AI service (Space endpoint "spam").
 * Returns up to 60 points when the model thinks the text is spam.
 * Fails quietly (0 points) if the service isn't configured or doesn't answer in time.
 */
function dira_spam_model_score($text) {
    static $unavailable = false;
    $none = ['score' => 0, 'reason' => null];
    $text = trim((string)$text);
    if ($unavailable || mb_strlen($text) < 8) return $none;

    require_once __DIR__ . '/ai-client.php';
    if (dira_ai_base() === '') { $unavailable = true; return $none; }

    // Model 2 on the AI service (Hugging Face Space, endpoint "spam")
    $data = dira_ai_call('spam', [mb_substr($text, 0, 1000)], 8);
    if (empty($data['success']) || !isset($data['spam_probability'])) {
        $unavailable = true;   // don't keep waiting on it for the other complaints in this request
        return $none;
    }

    $p = (float)$data['spam_probability'];
    if ($p < 0.5) return $none;
    return [
        'score'  => (int)round($p * 60),   // 0.5 -> 30 points, 1.0 -> 60 points
        // shown to employees in plain words; which part of the system decided stays in the back end
        'reason' => 'Looks like an advert or a scam message',
    ];
}

/** Save a score on a report (keeps a manual decision by an employee). */
function dira_spam_save($conn, $reportId, array $result) {
    $isSpam = $result['is_spam'] ? 1 : 0;
    $score = (int)$result['score'];
    $reasons = json_encode($result['reasons'], JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare("
        UPDATE reports
        SET spam_score = ?, spam_reasons = ?,
            is_spam = CASE spam_override WHEN 'spam' THEN 1 WHEN 'not_spam' THEN 0 ELSE ? END
        WHERE report_id = ?
    ");
    $stmt->bind_param('isii', $score, $reasons, $isSpam, $reportId);
    $stmt->execute();
    $stmt->close();
}

/** Score every report that hasn't been scored yet (old reports). */
function dira_spam_backfill($conn) {
    dira_spam_ensure_columns($conn);
    $res = $conn->query("SELECT report_id, user_id, game_id, title, behavior_other, date_reported FROM reports WHERE spam_score IS NULL ORDER BY date_reported ASC, report_id ASC LIMIT 500");
    if (!$res) return;
    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = $row;
    foreach ($rows as $row) {
        dira_spam_save($conn, (int)$row['report_id'], dira_spam_score($conn, $row, false)); // old reports: rules only (fast)
    }
}

/** Is the column there yet? (for queries that filter spam out) */
function dira_spam_has_columns($conn) {
    $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'is_spam'");
    return $res && $res->num_rows > 0;
}
