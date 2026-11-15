<?php
// One-time links for "Forgot password" and admin invitations.
// Only a SHA-256 hash of the token is stored, never the token itself.

function dira_tokens_ensure(mysqli $conn): void {
    $conn->query("
        CREATE TABLE IF NOT EXISTS password_tokens (
            token_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            purpose VARCHAR(10) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_token_hash (token_hash),
            KEY idx_user (user_id)
        )
    ");
}

// users.status must accept 'invited'
function dira_users_allow_invited(mysqli $conn): void {
    $col = $conn->query("SHOW COLUMNS FROM users LIKE 'status'");
    $type = $col ? (string)($col->fetch_assoc()['Type'] ?? '') : '';
    if (stripos($type, 'enum(') === 0 && stripos($type, "'invited'") === false) {
        preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $type, $m);
        $values = array_merge($m[1] ?? [], ['invited']);
        $list = implode(',', array_map(fn($v) => "'" . $conn->real_escape_string($v) . "'", $values));
        $conn->query("ALTER TABLE users MODIFY status ENUM($list) NOT NULL DEFAULT 'active'");
    }
}

// Create a token and return the plain value (to put in the link)
function dira_token_create(mysqli $conn, int $userId, string $purpose, int $hours): string {
    dira_tokens_ensure($conn);
    // older links for the same purpose stop working
    $d = $conn->prepare("DELETE FROM password_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL");
    $d->bind_param('is', $userId, $purpose);
    $d->execute();
    $d->close();

    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $st = $conn->prepare("INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))");
    $st->bind_param('issi', $userId, $hash, $purpose, $hours);
    $st->execute();
    $st->close();
    return $token;
}

// Returns the token row joined with the user, or null if invalid / expired / used
function dira_token_find(mysqli $conn, string $token): ?array {
    dira_tokens_ensure($conn);
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $hash = hash('sha256', $token);
    $st = $conn->prepare("
        SELECT t.token_id, t.user_id, t.purpose, t.expires_at, t.used_at,
               u.name, u.email, u.role, u.status,
               (t.expires_at > NOW()) AS still_valid
        FROM password_tokens t
        JOIN users u ON u.user_id = t.user_id
        WHERE t.token_hash = ? LIMIT 1");
    $st->bind_param('s', $hash);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$row || $row['used_at'] !== null || (int)$row['still_valid'] !== 1) return null;
    return $row;
}

// Was a link sent to this user in the last minute? (stops repeated clicks)
function dira_token_sent_recently(mysqli $conn, int $userId, string $purpose): bool {
    dira_tokens_ensure($conn);
    $st = $conn->prepare("SELECT COUNT(*) FROM password_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND created_at > (NOW() - INTERVAL 60 SECOND)");
    $st->bind_param('is', $userId, $purpose);
    $st->execute();
    $n = (int)$st->get_result()->fetch_row()[0];
    $st->close();
    return $n > 0;
}
