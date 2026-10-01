<?php
/* api/maptile.php — سرو کردن «کاشی نقشه» از سرور خودمان (پروکسی نقشه)

   چرا این فایل لازم است؟
   ۱) اپ اندروید صفحه را با file:///android_asset/index.html باز می‌کند؛ در این
      حالت درخواست کاشی نقشه «Referer» معتبر ندارد و سرور کاشی OpenStreetMap
      آن را با کد ۴۰۳ رد می‌کند → نقشه خالی می‌ماند.
   ۲) دسترسی مستقیم گوشی به سرورهای کاشی خارجی در ایران کند یا بسته است.
   راه‌حل: کاشی‌ها از «سرور خودمان» خواسته می‌شوند (همان مسیری که آپلود عکس و
   فیلم با آن کار می‌کند) و سرور کاشی را از چند منبع می‌گیرد، روی دیسک کش
   می‌کند و به اپ/سایت می‌دهد. اگر منبعی جواب نداد، خودکار منبع بعدی.

   کنش‌ها:
     GET ?z=15&x=20830&y=12693[&src=esri]      → تصویر کاشی (پیش‌فرض: src=auto)
     GET ?action=config                         → فهرست منابع و منبع پیش‌فرض (JSON)
     GET ?action=test                           → آزمایش همه‌ی منابع از روی سرور (JSON)
     GET ?action=reverse&lat=..&lng=..           → آدرس فارسی از مختصات (JSON)
     GET ?action=static&lat=..&lng=..&z=..&w=..&h=..[&src=neshan] → نقشه‌ی استاتیک

   امنیت: فقط منابع ثبت‌شده در فهرست سفید، z بین ۰ تا ۱۹، x/y داخل محدوده‌ی
   همان بزرگ‌نمایی، و آدرس دلخواه فقط با قالب https و از پنل مدیریت.
   (منطق اصلی در shared/maptiles.php است تا پنل مدیریت هم همان را مصرف کند.)
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/maptiles.php';

/* ══════════════════════════════════════════════════════════════════════
   مسیر اصلی درخواست
   ══════════════════════════════════════════════════════════════════════ */
$pdo = null;
try {
    $pdo = eplakGetPdo();
} catch (\Throwable $e) {
    $pdo = null;   /* نقشه بدون دیتابیس هم باید کار کند (منابع بدون کلید) */
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

$action = strtolower(trim((string) ($_GET['action'] ?? '')));

/* ── کنش: فهرست منابع (اپ/سایت از همین‌جا می‌فهمد چه منبعی آماده است) ── */
if ($action === 'config') {
    eplakApiHeaders();
    $sources = eplakMapSourceRegistry($pdo);
    $default = $pdo ? trim((string) eplakAppSetting($pdo, 'map_default_source', 'auto')) : 'auto';
    if ($default === 'neshan' && empty($sources['neshan']['ready'])) {
        $default = 'auto';
    }
    if ($default === 'custom' && empty($sources['custom']['ready'])) {
        $default = 'auto';
    }
    $list = [];
    foreach ($sources as $id => $source) {
        if (!empty($source['ready'])) {
            $list[] = [
                'id'       => $id,
                'label'    => $source['label'],
                'kind'     => $source['kind'],
                'attrib'   => $source['attrib'],
                'needsKey' => !empty($source['needsKey']),
            ];
        }
    }
    eplakJson([
        'success'    => true,
        'proxy'      => true,
        'default'    => ($default !== '' ? $default : 'auto'),
        'order'      => eplakMapAutoOrder($pdo),
        'sources'    => $list,
        'tile_url'   => 'api/maptile.php?src={src}&z={z}&x={x}&y={y}',
        'static_url' => 'api/maptile.php?action=static&src={src}&lat={lat}&lng={lng}&z={z}&w={w}&h={h}',
        'reverse'    => !empty($sources['neshan']['ready']),
    ]);
}

/* ── کنش: آزمایش منابع (از راه JSON؛ پنل مدیریت هم همین را صدا می‌زند) ── */
if ($action === 'test') {
    eplakApiHeaders();
    @set_time_limit(90);
    eplakJson(eplakMapTestSources($pdo));
}

/* ── کنش: آدرس فارسی از مختصات ─────────────────────────────────────── */
if ($action === 'reverse') {
    eplakApiHeaders();
    $lat = (float) ($_GET['lat'] ?? 0);
    $lng = (float) ($_GET['lng'] ?? 0);
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || ($lat == 0.0 && $lng == 0.0)) {
        eplakJsonError('مختصات معتبر نیست', 400);
    }
    $result = eplakMapReverse($pdo, $lat, $lng);
    eplakJson([
        'success'  => (bool) $result['ok'],
        'address'  => (string) ($result['address'] ?? ''),
        'provider' => (string) ($result['provider'] ?? ''),
        'error'    => (string) ($result['error'] ?? ''),
    ], $result['ok'] ? 200 : 502);
}

/* ── کنش: نقشه‌ی استاتیک (برای منبع «نشان») ─────────────────────────── */
if ($action === 'static') {
    $src = strtolower(trim((string) ($_GET['src'] ?? 'neshan')));
    $sources = eplakMapSourceRegistry($pdo);
    if (!isset($sources[$src]) || ($sources[$src]['kind'] ?? '') !== 'static' || empty($sources[$src]['ready'])) {
        eplakApiHeaders();
        eplakJsonError('این منبع نقشه فعال نیست (کلید لازم است)', 400);
    }
    $lat = (float) ($_GET['lat'] ?? 35.3242);
    $lng = (float) ($_GET['lng'] ?? 51.6455);
    $z   = max(5, min(19, (int) ($_GET['z'] ?? 15)));
    $w   = max(120, min(1200, (int) ($_GET['w'] ?? 640)));
    $h   = max(120, min(1200, (int) ($_GET['h'] ?? 400)));

    $cachePath = eplakMapCachePath($src, 's-' . round($lat, 4) . '-' . round($lng, 4) . '-' . $z . '-' . $w . 'x' . $h . '.img');
    $body = $cachePath !== '' ? eplakMapCacheRead($cachePath, 86400) : null;
    if ($body === null) {
        $url = eplakMapBuildUrl($sources[$src], ['lat' => $lat, 'lng' => $lng, 'z' => $z, 'w' => $w, 'h' => $h]);
        $result = eplakMapFetchUrl($url, ['Accept: image/*'], 15);
        if (!$result['ok'] || !eplakMapLooksLikeImage($result['body'], $result['type'])) {
            header('Access-Control-Allow-Origin: *');
            http_response_code(502);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'error' => 'نقشه‌ی استاتیک گرفته نشد', 'status' => $result['status']], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $body = $result['body'];
        eplakMapCacheWrite($cachePath, $body);
    }
    header('Content-Type: ' . eplakMapContentType($body, 'image/png'));
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=86400');
    header('X-Eplak-Map-Source: ' . $src);
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

/* ── کنش پیش‌فرض: یک کاشی نقشه ─────────────────────────────────────── */
$z = (int) ($_GET['z'] ?? -1);
$x = (int) ($_GET['x'] ?? -1);
$y = (int) ($_GET['y'] ?? -1);
$src = strtolower(trim((string) ($_GET['src'] ?? 'auto')));
$src = preg_replace('/[^a-z0-9_]/', '', $src);
if ($src === '') {
    $src = 'auto';
}

if ($z < 0 || $z > 19 || $x < 0 || $y < 0 || $x > ((1 << $z) - 1) || $y > ((1 << $z) - 1)) {
    header('Access-Control-Allow-Origin: *');
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'پارامترهای کاشی نامعتبر است'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($src === 'auto') {
    /* منبع پیش‌فرضِ پنل مدیریت (اگر «خودکار» نباشد) */
    $default = $pdo ? trim((string) eplakAppSetting($pdo, 'map_default_source', 'auto')) : 'auto';
    if ($default !== '' && $default !== 'auto') {
        $sources = eplakMapSourceRegistry($pdo);
        if (($sources[$default]['kind'] ?? '') === 'xyz' && !empty($sources[$default]['ready'])) {
            $src = $default;
        }
    }
}

if ($src === 'auto') {
    $result = eplakMapGetTileAuto($pdo, $z, $x, $y);
} else {
    $result = eplakMapGetTile($pdo, $src, $z, $x, $y, true);
    if (!$result['ok']) {
        /* اگر منبع مشخص‌شده جواب نداد، بقیه امتحان می‌شوند تا نقشه خالی نماند */
        $result = eplakMapGetTileAuto($pdo, $z, $x, $y);
    }
}

if (!$result['ok']) {
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-store');
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'error'   => (string) ($result['error'] ?? 'کاشی نقشه گرفته نشد'),
        'tried'   => isset($result['tried']) ? $result['tried'] : [],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$body = (string) $result['body'];
$etag = '"' . md5($body) . '"';
header('Access-Control-Allow-Origin: *');
header('Content-Type: ' . eplakMapContentType($body, (string) ($result['type'] ?? '')));
header('Cache-Control: public, max-age=604800');
header('ETag: ' . $etag);
header('X-Eplak-Map-Source: ' . (string) ($result['src'] ?? $src));
header('X-Eplak-Map-Cached: ' . (empty($result['cached']) ? 'no' : 'yes'));
header('Content-Length: ' . strlen($body));
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
eplakMapCachePrune();
echo $body;
exit;
