<?php

require_once 'db.php';

$email = trim($_GET['email'] ?? '');

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode([
        'success' => false,
        'found' => false
    ]);
    exit;
}

$emailParts = explode('@', strtolower($email));
$domain = $emailParts[1] ?? '';

$sql = "
    SELECT organization_id, organization_name, email_domain, logo_url
    FROM organizations
    WHERE email_domain = ?
    AND status = 'active'
    LIMIT 1
";

$stmt = $conn->prepare($sql);
$stmt->bind_param('s', $domain);
$stmt->execute();

$result = $stmt->get_result();

if ($result && $result->num_rows > 0) {

    $organization = $result->fetch_assoc();

    echo json_encode([
        'success' => true,
        'found' => true,
        'organization' => [
            'id' => $organization['organization_id'],
            'name' => $organization['organization_name'],
            'domain' => $organization['email_domain'],
            'logo_url' => $organization['logo_url']
        ]
    ]);

} else {

    echo json_encode([
        'success' => true,
        'found' => false
    ]);
}