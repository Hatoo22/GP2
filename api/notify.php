<?php
// Notifications: the bell in the top bar + risk emails.
//
// Kinds of notification:
//   risk         a game the user follows changed risk level (Low / Medium / High)
//   maintenance  an announcement from the admins about downtime
//   feature      an announcement about something new on Dir'a
//   info         any other announcement
//
// Risk emails: only when a followed game becomes High, at most one email per
// user per game per 24 hours, and the games are grouped so a user gets one
// email per batch (an admin "Analyze all" run sends one email at the end).
// Users can turn the emails off from their profile (users.notify_email).

require_once __DIR__ . '/mailer.php';

const DIRA_RISK_LEVELS = ['Low', 'Medium', 'High'];

// Creates the tables the first time. Uses DDL, so never call it inside a transaction.
function dira_notify_ensure(mysqli $conn): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $conn->query("CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(20) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body VARCHAR(600) NOT NULL DEFAULT '',
        link VARCHAR(255) NULL,
        game_id INT NULL,
        announcement_id INT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        email_status VARCHAR(10) NOT NULL DEFAULT 'none',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user (user_id, is_read),
        KEY idx_email (email_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(20) NOT NULL DEFAULT 'info',
        title VARCHAR(200) NOT NULL,
        body VARCHAR(1000) NOT NULL DEFAULT '',
        audience VARCHAR(20) NOT NULL DEFAULT 'all',
        ends_at DATETIME NULL,
        emailed TINYINT(1) NOT NULL DEFAULT 0,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $col = $conn->query("SHOW COLUMNS FROM users LIKE 'notify_email'");
    if ($col && $col->num_rows === 0) {
        $conn->query("ALTER TABLE users ADD COLUMN notify_email TINYINT(1) NOT NULL DEFAULT 1");
    }
}

function dira_level_name($level): string {
    $l = ucfirst(strtolower(trim((string)$level)));
    return in_array($l, DIRA_RISK_LEVELS, true) ? $l : '';
}

/**
 * Call after a game's score was saved (outside any transaction).
 * Adds a bell notification for everyone who follows the game when its level changed,
 * and marks a risk email as waiting when it became High.
 * Returns how many users were notified.
 */
function dira_notify_risk_change(mysqli $conn, int $gameId, $oldLevel, $newLevel, float $percent): int {
    $old = dira_level_name($oldLevel);
    $new = dira_level_name($newLevel);
    // a game that wasn't analyzed before ("New") getting its first score is not a change
    if ($old === '' || $new === '' || $old === $new) return 0;

    try {
        dira_notify_ensure($conn);

        $st = $conn->prepare("SELECT game_name FROM games WHERE game_id = ? LIMIT 1");
        $st->bind_param('i', $gameId);
        $st->execute();
        $game = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$game) return 0;
        $name = (string)$game['game_name'];

        $st = $conn->prepare("SELECT DISTINCT u.user_id, u.notify_email
            FROM tracked_games t JOIN users u ON u.user_id = t.user_id
            WHERE t.game_id = ? AND u.role IN ('individual', 'employee')
              AND LOWER(COALESCE(u.status, 'active')) = 'active'");
        $st->bind_param('i', $gameId);
        $st->execute();
        $followers = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        $st->close();
        if (!$followers) return 0;

        $up = array_search($new, DIRA_RISK_LEVELS, true) > array_search($old, DIRA_RISK_LEVELS, true);
        $title = $up ? "$name is now $new risk" : "$name dropped to $new risk";
        $body = "Went from $old to $new (" . round($percent) . "% risk).";
        $link = "game-details.html?game_id=$gameId";

        $recent = $conn->prepare("SELECT 1 FROM notifications WHERE user_id = ? AND game_id = ? AND type = 'risk'
            AND email_status IN ('pending', 'sent') AND created_at > NOW() - INTERVAL 1 DAY LIMIT 1");
        $ins = $conn->prepare("INSERT INTO notifications (user_id, type, title, body, link, game_id, email_status)
            VALUES (?, 'risk', ?, ?, ?, ?, ?)");
        foreach ($followers as $f) {
            $uid = (int)$f['user_id'];
            $email = 'none';
            if ($new === 'High' && (int)($f['notify_email'] ?? 1) === 1) {
                $recent->bind_param('ii', $uid, $gameId);
                $recent->execute();
                $email = $recent->get_result()->num_rows ? 'none' : 'pending';
            }
            $ins->bind_param('isssis', $uid, $title, $body, $link, $gameId, $email);
            $ins->execute();
        }
        $recent->close();
        $ins->close();
        return count($followers);
    } catch (Throwable $e) {
        error_log('DIRA notify risk: ' . $e->getMessage());
        return 0;
    }
}

/**
 * Sends the waiting risk emails: one email per user listing every game that became High.
 * Safe to call any time; does nothing if there is nothing waiting.
 */
function dira_send_risk_emails(mysqli $conn): int {
    try {
        dira_notify_ensure($conn);
        if (!dira_mail_ready()) return 0;

        $res = $conn->query("SELECT n.id, n.user_id, n.title, n.body, n.game_id, u.email, u.name
            FROM notifications n JOIN users u ON u.user_id = n.user_id
            WHERE n.email_status = 'pending' AND n.type = 'risk'
            ORDER BY n.user_id, n.id LIMIT 500");
        $byUser = [];
        while ($res && ($row = $res->fetch_assoc())) $byUser[(int)$row['user_id']][] = $row;
        if (!$byUser) return 0;

        $base = dira_app_url();
        $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
        $sentCount = 0;
        $mark = $conn->prepare("UPDATE notifications SET email_status = ? WHERE id = ?");

        foreach ($byUser as $items) {
            $first = $items[0];
            $n = count($items);
            $title = $n === 1 ? $first['title'] : "$n games you follow are now high risk";
            $intro = $n === 1
                ? "A game in your list became high risk. " . $first['body']
                : "These games in your list became high risk:";

            $list = '';
            $text = '';
            foreach ($items as $it) {
                $url = "$base/game-details.html?game_id=" . (int)$it['game_id'];
                $list .= '<div style="padding:10px 14px;margin-bottom:8px;border:1px solid #2a241e;border-radius:12px;background:#1b1916">'
                       . '<a href="' . $e($url) . '" style="color:#f5f5f4;font-weight:bold;text-decoration:none">' . $e($it['title']) . '</a>'
                       . '<div style="font-size:13px;color:#a8a29e;padding-top:4px">' . $e($it['body']) . '</div></div>';
                $text .= "- {$it['title']}: {$it['body']} $url\n";
            }

            $link = $n === 1 ? "$base/game-details.html?game_id=" . (int)$first['game_id'] : "$base/tracked-games.html";
            $html = dira_mail_layout(
                $title,
                $intro,
                $n === 1 ? 'See the game' : 'Open my list',
                $link,
                "You get this email because you follow these games on Dir'a. You can turn these emails off from your profile.",
                $n === 1 ? '' : $list
            );
            $sent = dira_send_mail((string)$first['email'], trim((string)$first['name']), $title, $html, "$title\n\n$text");
            $status = !empty($sent['ok']) ? 'sent' : 'none';
            if (!empty($sent['ok'])) $sentCount++;
            else error_log('DIRA risk email: ' . ($sent['error'] ?? 'failed'));
            foreach ($items as $it) {
                $id = (int)$it['id'];
                $mark->bind_param('si', $status, $id);
                $mark->execute();
            }
        }
        $mark->close();
        return $sentCount;
    } catch (Throwable $e) {
        error_log('DIRA risk emails: ' . $e->getMessage());
        return 0;
    }
}
