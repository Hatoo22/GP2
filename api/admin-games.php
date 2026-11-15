<?php
require_once __DIR__ . '/admin-auth.php';

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';


/* =========================================
   HELPERS
========================================= */

function sendJson($data, $status = 200) {

    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE
    );

    exit;
}


function steamRequest($url) {

    global $STEAM_LAST_ERROR;
    $STEAM_LAST_ERROR = "";

    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, "DIRA-Platform/1.0");

    // Bundled Mozilla CA list, so HTTPS works on MAMP/Windows too
    // (SSL verification stays ON).
    $caBundle = __DIR__ . '/cacert.pem';
    if (is_file($caBundle)) {
        curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
    }

    $response = curl_exec($ch);

    if (curl_errno($ch)) {

        $STEAM_LAST_ERROR = curl_error($ch);
        error_log("Steam request failed: " . $STEAM_LAST_ERROR . " | " . $url);
        curl_close($ch);
        return null;
    }

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 400) {
        $STEAM_LAST_ERROR = "Steam returned HTTP " . $httpCode;
        return null;
    }

    if (!$response) {
        $STEAM_LAST_ERROR = "Empty response from Steam";
        return null;
    }

    return json_decode($response, true);
}


function normalizeGameName($name) {

    $name = strtolower(trim($name));

    $name = preg_replace('/\s+/', ' ', $name);

    $name = str_replace(
        ['™', '®', '©'],
        '',
        $name
    );

    return $name;
}


function cleanDate($dateText) {

    if (!$dateText) {
        return null;
    }

    $timestamp = strtotime($dateText);

    if (!$timestamp) {
        return null;
    }

    return date("Y-m-d", $timestamp);
}



/* -----------------------------------------
   One-time safety net: make the database itself
   refuse a second row with the same Steam App ID.
   Skipped quietly if old duplicates already exist.
----------------------------------------- */
function ensureUniqueSteamId($conn) {
    try {
        $idx = $conn->query("SHOW INDEX FROM games WHERE Column_name = 'api_game_id' AND Non_unique = 0");
        if ($idx && $idx->num_rows > 0) {
            return;
        }
        $dup = $conn->query("SELECT api_game_id FROM games WHERE api_game_id IS NOT NULL AND api_game_id <> '' GROUP BY api_game_id HAVING COUNT(*) > 1 LIMIT 1");
        if ($dup && $dup->num_rows > 0) {
            error_log("DIRA: duplicate api_game_id values exist; unique index not created.");
            return;
        }
        $col = $conn->query("SHOW COLUMNS FROM games LIKE 'api_game_id'");
        $type = $col ? strtolower($col->fetch_assoc()["Type"] ?? "") : "";
        $keyPart = str_contains($type, "text") || str_contains($type, "blob")
            ? "api_game_id(64)"
            : "api_game_id";
        $conn->query("ALTER TABLE games ADD UNIQUE KEY uniq_games_api_game_id ($keyPart)");
    } catch (Throwable $e) {
        error_log("DIRA: could not create unique index on games.api_game_id: " . $e->getMessage());
    }
}


/* =========================================
   GET ACTION
========================================= */

$action = $_GET["action"] ?? "";


/* =========================================
   SEARCH STEAM
========================================= */

if ($action === "search") {

    $q = trim($_GET["q"] ?? "");

    if ($q === "") {

        sendJson([
            "success" => true,
            "games" => []
        ]);
    }


    $url =
        "https://store.steampowered.com/api/storesearch/"
        . "?term=" . urlencode($q)
        . "&l=english"
        . "&cc=US";


    $data = steamRequest($url);


    if (!$data || !isset($data["items"])) {

        sendJson([
            "success" => false,
            "message" => "Unable to search Steam."
                . ($GLOBALS["STEAM_LAST_ERROR"] ? " (" . $GLOBALS["STEAM_LAST_ERROR"] . ")" : "")
        ], 502);
    }


    $games = [];


    foreach ($data["items"] as $item) {

        $games[] = [
            "appid" => $item["id"] ?? null,
            "name" => $item["name"] ?? "",
            "image" => $item["tiny_image"] ?? ""
        ];
    }


    sendJson([
        "success" => true,
        "games" => $games
    ]);
}



/* =========================================
   ADD GAME
========================================= */

if ($action === "add") {

    if ($_SERVER["REQUEST_METHOD"] !== "POST") {

        sendJson([
            "success" => false,
            "message" => "POST request required."
        ], 405);
    }


    $input =
        json_decode(
            file_get_contents("php://input"),
            true
        );


    $appid =
        intval(
            $input["appid"] ?? 0
        );

    ensureUniqueSteamId($conn);


    if ($appid <= 0) {

        sendJson([
            "success" => false,
            "message" => "Invalid Steam App ID."
        ], 400);
    }



    /* -----------------------------------------
       Check if game already exists
    ----------------------------------------- */

    $check =
        $conn->prepare(
            "SELECT game_id, game_name
             FROM games
             WHERE api_game_id = ?
             LIMIT 1"
        );


    $appIdString = (string)$appid;

    $check->bind_param(
        "s",
        $appIdString
    );

    $check->execute();

    $existing =
        $check
            ->get_result()
            ->fetch_assoc();


    $check->close();


    if ($existing) {

        sendJson([
            "success" => false,
            "message" =>
                $existing["game_name"]
                . " is already available on DIR'A."
        ], 409);
    }



    /* -----------------------------------------
       Fetch Steam details
    ----------------------------------------- */

    $url =
        "https://store.steampowered.com/api/appdetails"
        . "?appids=" . $appid
        . "&l=english"
        . "&cc=US";


    $response =
        steamRequest($url);


    if (
        !$response ||
        !isset($response[$appid]) ||
        $response[$appid]["success"] !== true
    ) {

        sendJson([
            "success" => false,
            "message" =>
                "Unable to retrieve game details from Steam."
        ], 500);
    }


    $game =
        $response[$appid]["data"];



    /* -----------------------------------------
       Make sure it is actually a game
    ----------------------------------------- */

    if (($game["type"] ?? "") !== "game") {

        sendJson([
            "success" => false,
            "message" =>
                "This Steam item is not a game."
        ], 400);
    }



    /* -----------------------------------------
       Windows games only
    ----------------------------------------- */

    if (
        empty(
            $game["platforms"]["windows"]
        )
    ) {

        sendJson([
            "success" => false,
            "message" =>
                "This game does not support Windows."
        ], 400);
    }



    /* -----------------------------------------
       Extract data
    ----------------------------------------- */

    $gameName =
        $game["name"] ?? "Unknown";


    $normalizedName =
        normalizeGameName(
            $gameName
        );


    $description =
        $game["short_description"] ?? "";


    $imageUrl =
        $game["header_image"] ?? "";


    $genres = [];


    if (!empty($game["genres"])) {

        foreach (
            $game["genres"] as $genre
        ) {

            if (
                !empty(
                    $genre["description"]
                )
            ) {

                $genres[] =
                    $genre["description"];
            }
        }
    }


    $genreText =
        implode(", ", $genres);


    $platform =
        "PC";


    $releaseDate =
        cleanDate(
            $game["release_date"]["date"]
            ?? null
        );


    $requiredAge =
        intval(
            $game["required_age"] ?? 0
        );



    /* -----------------------------------------
       Check normalized name too
    ----------------------------------------- */

    $nameCheck =
        $conn->prepare(
            "SELECT game_id
             FROM games
             WHERE normalized_name = ?
             LIMIT 1"
        );


    $nameCheck->bind_param(
        "s",
        $normalizedName
    );

    $nameCheck->execute();


    if (
        $nameCheck
            ->get_result()
            ->fetch_assoc()
    ) {

        $nameCheck->close();

        sendJson([
            "success" => false,
            "message" =>
                "A game with this name already exists."
        ], 409);
    }


    $nameCheck->close();



    /* -----------------------------------------
       Insert into games
    ----------------------------------------- */

    $sql = "
        INSERT INTO games
        (
            api_game_id,
            game_name,
            normalized_name,
            description,
            image_url,
            genre,
            platform,
            release_date,
            required_age,
            overall_risk_level,
            analysis_status
        )

        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'no_comments')
    ";


    $stmt =
        $conn->prepare($sql);


    if (!$stmt) {

        sendJson([
            "success" => false,
            "message" =>
                "Database prepare failed."
        ], 500);
    }


    $stmt->bind_param(
        "ssssssssi",
        $appIdString,
        $gameName,
        $normalizedName,
        $description,
        $imageUrl,
        $genreText,
        $platform,
        $releaseDate,
        $requiredAge
    );


    try {
        $ok = $stmt->execute();
        $errno = $stmt->errno;
        $error = $stmt->error;
    } catch (mysqli_sql_exception $e) {
        $ok = false;
        $errno = $e->getCode();
        $error = $e->getMessage();
    }

    if (!$ok) {

        $stmt->close();

        // 1062 = duplicate key: someone added the same game a moment ago
        if ((int)$errno === 1062) {
            sendJson([
                "success" => false,
                "message" => $gameName . " is already available on DIR'A."
            ], 409);
        }

        sendJson([
            "success" => false,
            "message" =>
                "Unable to add game: "
                . $error
        ], 500);
    }


    $newGameId =
        $stmt->insert_id;


    $stmt->close();



    sendJson([
        "success" => true,

        "message" =>
            $gameName
            . " was added successfully.",

        "game" => [
            "game_id" => $newGameId,
            "api_game_id" => $appIdString,
            "game_name" => $gameName,
            "image_url" => $imageUrl,
            "genre" => $genreText,
            "platform" => $platform,
            "overall_risk_percent" => 0,
            "overall_risk_level" => "New",
            "analysis_status" => "no_comments"
        ]
    ]);
}



/* =========================================
   INVALID ACTION
========================================= */

sendJson([
    "success" => false,
    "message" => "Invalid action."
], 400);