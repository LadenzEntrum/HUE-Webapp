<?php
/**
 * Philips Hue Bridge v1 API proxy.
 *
 * Keeps the bridge token out of the browser. Exposes only the endpoints
 * the frontend needs (lights list, groups list, light state, group action).
 *
 * Config (bridge IP + username) lives at /volume1/hue-config.php on the
 * Synology — above the web root, never HTTP-accessible, never overwritten
 * by a deploy rsync.
 *
 * Usage from JS:
 *   GET  hue.php?path=/lights
 *   GET  hue.php?path=/groups
 *   PUT  hue.php?path=/lights/{id}/state   body: JSON state object
 *   PUT  hue.php?path=/groups/{id}/action  body: JSON action object
 */

$config_file = '/volume1/hue-config.php';
if (!file_exists($config_file)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Bridge config not found. Create /volume1/hue-config.php from config.example.php.']);
    exit;
}
require_once $config_file;

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Validate path parameter
$path = $_GET['path'] ?? '';
if (!preg_match('#^/(lights|groups)(/\d+/(state|action))?$#', $path)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid path']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'PUT'], true)) {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$url  = "http://{$HUE_BRIDGE_IP}/api/{$HUE_USERNAME}{$path}";
$body = ($method === 'PUT') ? file_get_contents('php://input') : null;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => $body,
]);

$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($res === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Bridge unreachable', 'detail' => $err]);
    exit;
}

http_response_code($code ?: 200);
echo $res;
