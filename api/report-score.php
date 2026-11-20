<?php
// Verified complaints count toward a game's risk score.
//
// A complaint is counted once it is Resolved by an employee and is not spam.
// The behaviors the player ticked (and the employee confirmed) are added to the
// game's behavior counts, exactly like one more analyzed comment, and the
// overall risk is recalculated with the same weights as py/process_all_games.py.
// If the complaint is later moved out of Resolved or marked as spam, it is
// taken out again. reports.counted_in_score prevents counting it twice.

const DIRA_RISK_WEIGHTS = [
    'sexual_harassment' => 0.266,
    'hate_speech'       => 0.201,
    'bullying'          => 0.195,
    'threat'            => 0.182,
    'other_toxicity'    => 0.156,
];

function dira_report_score_ensure_column(mysqli $conn): void {
    $res = $conn->query("SHOW COLUMNS FROM reports LIKE 'counted_in_score'");
    if ($res && $res->num_rows === 0) {
        $conn->query("ALTER TABLE reports ADD COLUMN counted_in_score TINYINT(1) NOT NULL DEFAULT 0");
    }
}

// which of the five model labels this complaint adds to (0 or 1 each)
function dira_report_labels(array $r): array {
    $other = (int)($r['behavior_toxic'] ?? 0) === 1 || trim((string)($r['behavior_other'] ?? '')) !== '';
    return [
        'bullying'          => (int)($r['behavior_bullying'] ?? 0) === 1 ? 1 : 0,
        'hate_speech'       => (int)($r['behavior_hate'] ?? 0) === 1 ? 1 : 0,
        'sexual_harassment' => (int)($r['behavior_sexual'] ?? 0) === 1 ? 1 : 0,
        'threat'            => (int)($r['behavior_threat'] ?? 0) === 1 ? 1 : 0,
        'other_toxicity'    => $other ? 1 : 0,
    ];
}

function dira_overall_from_counts(array $counts, int $total): array {
    if ($total <= 0) return [0.0, 'New'];
    $overall = 0.0;
    foreach (DIRA_RISK_WEIGHTS as $label => $w) {
        $overall += ($counts[$label] / $total) * 100 * $w;
    }
    $overall = round($overall, 2);
    $level = $overall <= 30 ? 'Low' : ($overall <= 69 ? 'Medium' : 'High');
    return [$overall, $level];
}

// Bring one complaint's contribution in line with its current status.
// Returns 'added', 'removed' or 'unchanged'.
function dira_report_sync_score(mysqli $conn, int $reportId): string {
    dira_report_score_ensure_column($conn);

    $conn->begin_transaction();
    try {
        $st = $conn->prepare("SELECT * FROM reports WHERE report_id = ? LIMIT 1 FOR UPDATE");
        $st->bind_param('i', $reportId);
        $st->execute();
        $r = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$r) { $conn->rollback(); return 'unchanged'; }

        $should = strcasecmp((string)$r['status'], 'Resolved') === 0 && (int)($r['is_spam'] ?? 0) !== 1;
        $counted = (int)($r['counted_in_score'] ?? 0) === 1;
        if ($should === $counted) { $conn->commit(); return 'unchanged'; }

        $sign = $should ? 1 : -1;
        $gameId = (int)$r['game_id'];

        $gs = $conn->prepare("SELECT threat, bullying, sexual_harassment, hate_speech, other_toxicity, comments_count, overall_risk_level, analysis_status FROM games WHERE game_id = ? LIMIT 1 FOR UPDATE");
        $gs->bind_param('i', $gameId);
        $gs->execute();
        $g = $gs->get_result()->fetch_assoc();
        $gs->close();
        if (!$g) { $conn->rollback(); return 'unchanged'; }

        $labels = dira_report_labels($r);
        $counts = [];
        foreach (DIRA_RISK_WEIGHTS as $label => $_) {
            $counts[$label] = max(0, (int)round((float)($g[$label] ?? 0)) + $sign * $labels[$label]);
        }
        $total = max(0, (int)($g['comments_count'] ?? 0) + $sign);
        [$overall, $level] = dira_overall_from_counts($counts, $total);
        $status = $total > 0 ? 'analyzed' : 'no_comments';

        $up = $conn->prepare("
            UPDATE games SET
              threat = ?, bullying = ?, sexual_harassment = ?, hate_speech = ?, other_toxicity = ?,
              comments_count = ?, overall_risk_percent = ?, overall_risk_level = ?,
              analysis_status = ?, analyzed_at = CURRENT_TIMESTAMP
            WHERE game_id = ?");
        $up->bind_param('iiiiiidssi',
            $counts['threat'], $counts['bullying'], $counts['sexual_harassment'],
            $counts['hate_speech'], $counts['other_toxicity'],
            $total, $overall, $level, $status, $gameId);
        $up->execute();
        $up->close();

        $flag = $should ? 1 : 0;
        $rf = $conn->prepare("UPDATE reports SET counted_in_score = ? WHERE report_id = ? LIMIT 1");
        $rf->bind_param('ii', $flag, $reportId);
        $rf->execute();
        $rf->close();

        $conn->commit();

        // tell the people who follow this game if its level changed (after the commit: it may create tables)
        require_once __DIR__ . '/notify.php';
        $oldLevel = ($g['analysis_status'] ?? '') === 'analyzed' ? ($g['overall_risk_level'] ?? '') : '';
        if (dira_notify_risk_change($conn, $gameId, $oldLevel, $level, (float)$overall) > 0) {
            dira_send_risk_emails($conn);
        }
        return $should ? 'added' : 'removed';
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('DIRA report score sync failed: ' . $e->getMessage());
        return 'unchanged';
    }
}
