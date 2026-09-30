<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';


/* =========================================
   JSON RESPONSE
========================================= */

function sendJson($data, $status = 200) {

    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE
    );

    exit;
}


$allowedRoles = [
    "individual",
    "employee",
    "admin"
];


$allowedStatuses = [
    "active",
    "pending",
    "disabled"
];



/* =========================================
   UPDATE ACCOUNT STATUS
========================================= */

if ($_SERVER["REQUEST_METHOD"] === "POST") {

    $input =
        json_decode(
            file_get_contents("php://input"),
            true
        );


    $userId =
        intval(
            $input["user_id"] ?? 0
        );


    $newStatus =
        strtolower(
            trim(
                $input["status"] ?? ""
            )
        );

     if ($userId <= 0) {

        sendJson([
            "success" => false,
            "message" => "Invalid user ID."
        ], 400);
    }

    if ($newStatus === "disabled") {

    $checkMainAdmin =
        $conn->prepare(
            "SELECT is_main_admin
             FROM users
             WHERE user_id = ?
             LIMIT 1"
        );

    $checkMainAdmin->bind_param(
        "i",
        $userId
    );

    $checkMainAdmin->execute();

    $result =
        $checkMainAdmin->get_result();

    $targetUser =
        $result->fetch_assoc();

    $checkMainAdmin->close();


    if (
        $targetUser &&
        intval($targetUser["is_main_admin"]) === 1
    ) {

        sendJson([
            "success" => false,
            "message" => "The Main Admin account cannot be disabled."
        ], 403);
    }
}

    $disableReason =
    trim(
        $input["disable_reason"] ?? ""
    );

$disableDuration =
    $input["disable_duration"] ?? "";  


   


    if (
        !in_array(
            $newStatus,
            $allowedStatuses,
            true
        )
    ) {

        sendJson([
            "success" => false,
            "message" => "Invalid account status."
        ], 400);
    }



    /* =========================================
       GET USER
    ========================================= */

    $stmt =
        $conn->prepare(
            "SELECT
                user_id,
                name,
                email,
                role,
                status
             FROM users
             WHERE user_id = ?
             LIMIT 1"
        );


    $stmt->bind_param(
        "i",
        $userId
    );


    $stmt->execute();


    $user =
        $stmt
            ->get_result()
            ->fetch_assoc();


    $stmt->close();


    if (!$user) {

        sendJson([
            "success" => false,
            "message" => "User not found."
        ], 404);
    }



    /* =========================================
       PROTECT LAST ACTIVE ADMIN
    ========================================= */

    if (
        $user["role"] === "admin" &&
        $user["status"] === "active" &&
        $newStatus === "disabled"
    ) {

        $result =
            $conn->query(
                "SELECT COUNT(*) AS total
                 FROM users
                 WHERE role = 'admin'
                 AND status = 'active'"
            );


        $activeAdmins =
            (int)$result
                ->fetch_assoc()["total"];


        if ($activeAdmins <= 1) {

            sendJson([
                "success" => false,
                "message" =>
                    "The last active administrator cannot be disabled."
            ], 400);
        }
    }



/* =========================================
   UPDATE STATUS
========================================= */

if ($newStatus === "disabled") {

    if ($disableReason === "") {
        sendJson([
            "success" => false,
            "message" => "Disable reason is required."
        ], 400);
    }

    if (
    $disableDuration === "" ||
    (
        $disableDuration !== "indefinite" &&
        intval($disableDuration) <= 0
    )
) {
    sendJson([
        "success" => false,
        "message" => "Suspension duration is required."
    ], 400);
}

   if ($disableDuration === "indefinite") {

    $stmt =
        $conn->prepare(
            "UPDATE users
             SET
                status = 'disabled',
                disable_reason = ?,
                disabled_at = NOW(),
                disabled_until = NULL
             WHERE user_id = ?
             LIMIT 1"
        );

    $stmt->bind_param(
        "si",
        $disableReason,
        $userId
    );

} else {

    $disableDays =
        intval($disableDuration);

    $stmt =
        $conn->prepare(
            "UPDATE users
             SET
                status = 'disabled',
                disable_reason = ?,
                disabled_at = NOW(),
                disabled_until = DATE_ADD(
                    NOW(),
                    INTERVAL ? DAY
                )
             WHERE user_id = ?
             LIMIT 1"
        );

    $stmt->bind_param(
        "sii",
        $disableReason,
        $disableDays,
        $userId
    );
}

} else {

    $stmt =
        $conn->prepare(
            "UPDATE users
             SET
                status = ?,
                disable_reason = NULL,
                disabled_at = NULL,
                disabled_until = NULL
             WHERE user_id = ?
             LIMIT 1"
        );

    $stmt->bind_param(
        "si",
        $newStatus,
        $userId
    );
}

if (!$stmt->execute()) {

    sendJson([
        "success" => false,
        "message" => "Unable to update account."
    ], 500);
}


$stmt->close();


sendJson([
    "success" => true,
    "message" => "Account status updated successfully.",
    "status" => $newStatus
]);

}


/* =========================================
   GET USERS BY ROLE
========================================= */

$role =
    $_GET["role"] ??
    "individual";


if (
    !in_array(
        $role,
        $allowedRoles,
        true
    )
) {

    sendJson([
        "success" => false,
        "message" => "Invalid user role."
    ], 400);
}


$sql = "
SELECT
    user_id,
    name,
    email,
    role,
    status,
    created_at,
    profile_avatar,
    is_main_admin

FROM users

WHERE role = ?

ORDER BY created_at DESC, user_id DESC
";


$stmt =
    $conn->prepare($sql);


$stmt->bind_param(
    "s",
    $role
);


$stmt->execute();


$result =
    $stmt->get_result();


$users = [];


while (
    $row =
        $result->fetch_assoc()
) {

    $users[] =
        $row;
}


$stmt->close();


sendJson([
    "success" => true,
    "role" => $role,
    "count" => count($users),
    "users" => $users
]);

?>