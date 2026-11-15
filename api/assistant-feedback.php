<?php
// Saves messages sent through the DIR'A Guardian assistant:
//   type = game_suggestion    -> a game the user wants added
//   type = general_suggestion -> any idea / feedback
require_once __DIR__ . '/session.php';
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    if ($_SERVER["REQUEST_METHOD"] !== "POST") {
        echo json_encode(["success" => false, "message" => "Invalid request method"]);
        exit;
    }

    $user_id = $_SESSION["user_id"] ?? null;
    if (!$user_id) {
        echo json_encode(["success" => false, "message" => "Please log in first"]);
        exit;
    }

    if (strtolower($_SESSION["user_role"] ?? "") !== "individual") {
        echo json_encode(["success" => false, "message" => "The assistant is available for individual users only."]);
        exit;
    }

    $type = trim($_POST["type"] ?? "");
    $message = trim($_POST["message"] ?? "");

    $allowedTypes = ["game_suggestion", "general_suggestion"];
    if (!in_array($type, $allowedTypes, true)) {
        echo json_encode(["success" => false, "message" => "Invalid message type"]);
        exit;
    }

    $maxLength = $type === "game_suggestion" ? 150 : 1000;
    if ($message === "" || mb_strlen($message) > $maxLength) {
        echo json_encode(["success" => false, "message" => "Message must be between 1 and $maxLength characters"]);
        exit;
    }

    $conn->query("
        CREATE TABLE IF NOT EXISTS assistant_feedback (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type VARCHAR(30) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $stmt = $conn->prepare("INSERT INTO assistant_feedback (user_id, type, message) VALUES (?, ?, ?)");
    $uid = (int)$user_id;
    $stmt->bind_param("iss", $uid, $type, $message);
    $stmt->execute();
    $stmt->close();

    echo json_encode(["success" => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error, please try again"]);
}
