<?php
/* shared/maptiles.php — «موتور نقشه» سمت سرور (منابع کاشی، پروکسی، کش، آدرس‌یاب)

   چرا فایل جدا؟ چون هم api/maptile.php (سرو کردن کاشی به اپ/سایت) و هم
   admin/settings.php (دکمه‌ی «آزمایش نقشه») به همین تابع‌ها نیاز دارند.

   چه کاری می‌کند؟
   • فهرست منابع نقشه (Esri، کارتو، OSM فرانسه/جهانی، ویکی‌مدیا، و «نشان»
     با کلید رایگان) و ترتیب امتحان کردنشان بر پایه‌ی سلامت اخیر.
   • گرفتن کاشی از منبع، با کش روی دیسک (uploads/map-cache) و ETag.
   • آدرس‌یابی معکوس (مختصات → آدرس فارسی): اول نشان (اگر کلید باشد)،
     بعد Nominatim — هر دو از راه سرور تا در اپ اندروید هم کار کند.
   • آزمایش همه‌ی منابع از روی سرور (برای فهمیدن اینکه از هاست شما کدام
     منبع نقشه باز است).

   نکته: اسنپ و نشان هر دو از «داده‌ی» OpenStreetMap استفاده می‌کنند و کاشی را
   از سرور داخل کشور سرو می‌کنند؛ این فایل همان کار را برای ای‌پلاک انجام
   می‌دهد (و با کلید رایگان نشان، نقشه‌ی خود نشان با برچسب فارسی فعال می‌شود).
*/
require_once __DIR__ . '/bootstrap.php';


/* ══════════════════════════════════════════════════════════════════════
   فهرست منابع نقشه (XYZ = کاشی‌های چهارگوش، static = یک تصویر برای کل کادر)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapSourceRegistry(?PDO $pdo): array
{
    $neshanKey = $pdo ? trim((string) eplakAppSetting($pdo, 'map_neshan_key', '')) : '';
    $customTpl = $pdo ? trim((string) eplakAppSetting($pdo, 'map_custom_tiles', '')) : '';
    if ($customTpl !== '' && (strpos($customTpl, 'https://') !== 0 || strpos($customTpl, '{z}') === false)) {
        $customTpl = '';   /* فقط قالب https با {z}/{x}/{y} پذیرفته می‌شود */
    }

    return [
        /* نقشه‌ی خودِ نشان — برچسب فارسی، سرور داخل ایران (به کلید رایگان نیاز دارد) */
        'neshan' => [
            'label'    => 'نشان (برچسب فارسی)',
            'kind'     => 'static',
            'needsKey' => true,
            'ready'    => $neshanKey !== '',
            'key'      => $neshanKey,
            'url'      => 'https://api.neshan.org/v1/static?key={key}&type=neshan&zoom={z}&center={lat},{lng}&width={w}&height={h}',
            'attrib'   => '© نشان',
        ],
        /* Esri: بدون کلید، بدون سخت‌گیری Referer، و معمولاً از ایران در دسترس */
        'esri' => [
            'label'    => 'Esri خیابان',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
            'attrib'   => '© Esri, OpenStreetMap',
        ],
        'esri_sat' => [
            'label'    => 'Esri ماهواره',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            'attrib'   => '© Esri, Maxar, Earthstar Geographics',
        ],
        'esri_topo' => [
            'label'    => 'Esri توپوگرافی',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
            'attrib'   => '© Esri',
        ],
        'carto' => [
            'label'    => 'کارتو (روشن)',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            'attrib'   => '© OpenStreetMap, © CARTO',
        ],
        'osmfr' => [
            'label'    => 'OpenStreetMap فرانسه',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
            'attrib'   => '© OpenStreetMap France',
        ],
        'osm' => [
            'label'    => 'OpenStreetMap',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            'referer'  => 'https://www.openstreetmap.org/',
            'attrib'   => '© OpenStreetMap',
        ],
        'wikimedia' => [
            'label'    => 'ویکی‌مدیا',
            'kind'     => 'xyz',
            'needsKey' => false,
            'ready'    => true,
            'url'      => 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
            'attrib'   => '© OpenStreetMap, Wikimedia',
        ],
        'custom' => [
            'label'    => 'آدرس دلخواه (پنل مدیریت)',
            'kind'     => 'xyz',
            'needsKey' => $customTpl === '' ? false : false,
            'ready'    => $customTpl !== '',
            'url'      => $customTpl,
            'attrib'   => '© منبع دلخواه',
        ],
    ];
}

/* ترتیب امتحان کردن منابع در حالت «خودکار» — اول آن‌هایی که از ایران/WebView
   مطمئن‌تر جواب می‌دهند، بعد بقیه. */
function eplakMapAutoOrder(?PDO $pdo): array
{
    $base = ['esri', 'carto', 'osmfr', 'esri_topo', 'osm', 'wikimedia'];
    $health = [];
    if ($pdo) {
        $raw = (string) eplakAppSetting($pdo, 'map_src_health', '{}');
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $health = $decoded;
        }
    }
    /* امتیاز = تعداد شکست‌های یک ساعت اخیر (کمتر = بهتر) */
    $now = time();
    $scored = [];
    foreach ($base as $index => $id) {
        $entry = isset($health[$id]) && is_array($health[$id]) ? $health[$id] : [];
        $fails = 0;
        if (!empty($entry['fail_at']) && is_array($entry['fail_at'])) {
            foreach ($entry['fail_at'] as $stamp) {
                if ((int) $stamp > ($now - 3600)) {
                    $fails++;
                }
            }
        }
        $scored[] = ['id' => $id, 'fails' => $fails, 'order' => $index];
    }
    usort($scored, function ($a, $b) {
        if ($a['fails'] !== $b['fails']) {
            return $a['fails'] < $b['fails'] ? -1 : 1;
        }
        return $a['order'] < $b['order'] ? -1 : 1;
    });
    $ordered = [];
    foreach ($scored as $item) {
        $ordered[] = $item['id'];
    }
    return $ordered;
}

/* ثبت نتیجه‌ی هر تلاش (برای تصمیم «خودکار» در دفعه‌ی بعد) — با محدود کردن
   نوشتن، هر کاشی باعث نوشتن در دیتابیس نمی‌شود. */
function eplakMapNoteHealth(?PDO $pdo, string $src, bool $ok): void
{
    if (!$pdo) {
        return;
    }
    static $written = [];
    $now = time();
    if (isset($written[$src]) && ($now - $written[$src]) < 120) {
        return;   /* در دو دقیقه‌ی اخیر برای این منبع نوشته‌ایم */
    }
    $written[$src] = $now;

    $raw = (string) eplakAppSetting($pdo, 'map_src_health', '{}');
    $health = json_decode($raw, true);
    if (!is_array($health)) {
        $health = [];
    }
    if (!isset($health[$src]) || !is_array($health[$src])) {
        $health[$src] = ['ok_at' => [], 'fail_at' => [], 'ok' => 0, 'fail' => 0];
    }
    $bucket = $ok ? 'ok_at' : 'fail_at';
    $health[$src][$bucket][] = $now;
    /* فقط ۲۰ نشان زمانی اخیر نگه داشته می‌شود */
    if (count($health[$src][$bucket]) > 20) {
        $health[$src][$bucket] = array_slice($health[$src][$bucket], -20);
    }
    $health[$src][$ok ? 'ok' : 'fail'] = (int) ($health[$src][$ok ? 'ok' : 'fail'] ?? 0) + 1;
    try {
        eplakSetAppSetting($pdo, 'map_src_health', (string) json_encode($health, JSON_UNESCAPED_SLASHES));
    } catch (\Throwable $e) {
        error_log('[eplak-api:maptile.health] ' . $e->getMessage());
    }
}

/* ══════════════════════════════════════════════════════════════════════
   کش روی دیسک: uploads/map-cache/{src}/{z}/{x}/{y}.img
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapCacheDir(): string
{
    return EPLAK_ROOT . '/uploads/map-cache';
}

function eplakMapCachePath(string $src, string $name): string
{
    /* سخت‌گیری روی نام‌ها: هیچ «..»، جداکننده‌ی مسیر یا نویسه‌ی عجیب نباید
       بماند تا نشود از پوشه‌ی کش کاشی‌ها بیرون زد. */
    $src = preg_replace('/[^a-z0-9_]/', '', strtolower($src));
    if ($src === '' || strlen($src) > 24) {
        return '';
    }
    $name = str_replace(['..', '/', '\\', "\0"], '', strtolower($name));
    $name = preg_replace('/[^a-z0-9_.-]/', '', $name);
    if ($name === '' || strlen($name) > 64 || substr($name, -4) !== '.img') {
        return '';
    }
    $dir = eplakMapCacheDir() . '/' . $src;
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return '';
    }
    return $dir . '/' . $name;
}

function eplakMapCacheRead(string $path, int $maxAge): ?string
{
    if ($path === '' || !is_file($path)) {
        return null;
    }
    if ((time() - (int) filemtime($path)) > $maxAge) {
        @unlink($path);
        return null;
    }
    $data = @file_get_contents($path);
    return ($data === false || $data === '') ? null : $data;
}

function eplakMapCacheWrite(string $path, string $body): void
{
    if ($path === '' || $body === '') {
        return;
    }
    @file_put_contents($path, $body, LOCK_EX);
}

/* ══════════════════════════════════════════════════════════════════════
   دریافت یک آدرس از بیرون (curl و در نبود آن file_get_contents)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapFetchUrl(string $url, array $headers = [], int $timeout = 12, bool $verifySsl = true): array
{
    $started = microtime(true);
    $agent = 'Mozilla/5.0 (Linux; Android 13; EplakMapProxy/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
    $allHeaders = array_merge(['Accept: image/*,*/*;q=0.8', 'Accept-Language: fa-IR,fa;q=0.9,en;q=0.6'], $headers);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_USERAGENT      => $agent,
                CURLOPT_HTTPHEADER     => $allHeaders,
                CURLOPT_SSL_VERIFYPEER => $verifySsl,
                CURLOPT_SSL_VERIFYHOST => $verifySsl ? 2 : 0,
                CURLOPT_ENCODING       => '',
            ]);
            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            $error = ($body === false) ? (string) curl_error($ch) : '';
            curl_close($ch);
            if ($body !== false) {
                return [
                    'ok'     => ($status === 200),
                    'status' => $status,
                    'type'   => $type,
                    'body'   => (string) $body,
                    'ms'     => (int) round((microtime(true) - $started) * 1000),
                    'error'  => '',
                ];
            }
            /* خطای SSL روی بعضی هاست‌ها (نبود CA) — یک بار بدون بررسی گواهی
               امتحان می‌شود؛ کاشی نقشه داده‌ی حساسی نیست. */
            if (stripos($error, 'SSL') !== false || stripos($error, 'certificate') !== false) {
                if ($verifySsl) {
                    return eplakMapFetchUrl($url, $headers, $timeout, false);
                }
            }
        }
    }

    $context = stream_context_create([
        'http' => [
            'method'        => 'GET',
            'header'        => implode("\r\n", array_merge(['User-Agent: ' . $agent], $allHeaders)),
            'timeout'       => $timeout,
            'ignore_errors' => true,
        ],
        'ssl'  => [
            'verify_peer'      => $verifySsl,
            'verify_peer_name' => $verifySsl,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $status = 0;
    $type = '';
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1];
            }
            if (stripos($line, 'Content-Type:') === 0) {
                $type = trim(substr($line, 13));
            }
        }
    }
    return [
        'ok'     => ($status === 200 && $body !== false),
        'status' => $status,
        'type'   => $type,
        'body'   => ($body === false) ? '' : (string) $body,
        'ms'     => (int) round((microtime(true) - $started) * 1000),
        'error'  => ($body === false) ? 'fetch_failed' : '',
    ];
}

/* آیا این بدنه واقعاً یک تصویر است؟ (بعضی سرورها صفحه‌ی خطا را با ۲۰۰ می‌دهند) */
function eplakMapLooksLikeImage(string $body, string $type): bool
{
    $len = strlen($body);
    if ($len < 120 || $len > 3000000) {
        return false;
    }
    if (stripos($type, 'image/') === 0) {
        return true;
    }
    $head = substr($body, 0, 12);
    if (strncmp($head, "\x89PNG", 4) === 0) {
        return true;
    }
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) {
        return true;
    }
    if (strncmp($head, 'RIFF', 4) === 0 && strpos($body, 'WEBP') !== false) {
        return true;
    }
    return false;
}

function eplakMapContentType(string $body, string $type): string
{
    if (stripos($type, 'image/png') !== false) {
        return 'image/png';
    }
    if (stripos($type, 'image/jpeg') !== false || stripos($type, 'image/jpg') !== false) {
        return 'image/jpeg';
    }
    if (stripos($type, 'image/webp') !== false) {
        return 'image/webp';
    }
    $head = substr($body, 0, 12);
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if (strncmp($head, 'RIFF', 4) === 0) {
        return 'image/webp';
    }
    return 'image/png';
}

/* ساخت آدرس کاشی از قالب منبع */
function eplakMapBuildUrl(array $source, array $vars): string
{
    $url = (string) ($source['url'] ?? '');
    $map = [
        '{z}'   => (string) (int) ($vars['z'] ?? 0),
        '{x}'   => (string) (int) ($vars['x'] ?? 0),
        '{y}'   => (string) (int) ($vars['y'] ?? 0),
        '{lat}' => (string) ($vars['lat'] ?? '35.3242'),
        '{lng}' => (string) ($vars['lng'] ?? '51.6455'),
        '{w}'   => (string) (int) ($vars['w'] ?? 640),
        '{h}'   => (string) (int) ($vars['h'] ?? 400),
        '{key}' => (string) ($source['key'] ?? ''),
    ];
    return strtr($url, $map);
}

/* ══════════════════════════════════════════════════════════════════════
   گرفتن یک کاشی از یک منبع (اول کش دیسک، بعد شبکه)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapGetTile(?PDO $pdo, string $src, int $z, int $x, int $y, bool $useCache = true, int $timeout = 12): array
{
    $sources = eplakMapSourceRegistry($pdo);
    if (!isset($sources[$src]) || ($sources[$src]['kind'] ?? '') !== 'xyz' || empty($sources[$src]['ready'])) {
        return ['ok' => false, 'error' => 'منبع نقشه نامعتبر است', 'status' => 0, 'src' => $src];
    }
    $source = $sources[$src];
    $maxTile = (1 << $z) - 1;
    if ($x < 0 || $x > $maxTile || $y < 0 || $y > $maxTile) {
        return ['ok' => false, 'error' => 'مختصات کاشی بیرون از محدوده است', 'status' => 0, 'src' => $src];
    }

    $cacheName = $z . '-' . $x . '-' . $y . '.img';
    $cachePath = $useCache ? eplakMapCachePath($src, $cacheName) : '';
    if ($cachePath !== '') {
        $cached = eplakMapCacheRead($cachePath, 2592000);   /* ۳۰ روز */
        if ($cached !== null) {
            return ['ok' => true, 'body' => $cached, 'type' => 'image/' . (substr($cached, 1, 3) === 'PNG' ? 'png' : 'jpeg'),
                    'src' => $src, 'cached' => true, 'status' => 200, 'ms' => 0];
        }
    }

    $url = eplakMapBuildUrl($source, ['z' => $z, 'x' => $x, 'y' => $y]);
    $headers = [];
    if (!empty($source['referer'])) {
        $headers[] = 'Referer: ' . $source['referer'];
    }
    $result = eplakMapFetchUrl($url, $headers, $timeout);
    if (!$result['ok'] || !eplakMapLooksLikeImage($result['body'], $result['type'])) {
        eplakMapNoteHealth($pdo, $src, false);
        return ['ok' => false, 'error' => $result['error'] !== '' ? $result['error'] : 'پاسخ منبع نقشه تصویر نبود',
                'status' => $result['status'], 'src' => $src, 'ms' => $result['ms']];
    }

    eplakMapNoteHealth($pdo, $src, true);
    eplakMapCacheWrite($cachePath, $result['body']);
    return ['ok' => true, 'body' => $result['body'], 'type' => eplakMapContentType($result['body'], $result['type']),
            'src' => $src, 'cached' => false, 'status' => 200, 'ms' => $result['ms']];
}

/* حالت «خودکار»: منابع را به ترتیب سلامت امتحان می‌کند تا یک کاشی بگیرد */
function eplakMapGetTileAuto(?PDO $pdo, int $z, int $x, int $y): array
{
    $order = eplakMapAutoOrder($pdo);
    $sources = eplakMapSourceRegistry($pdo);
    $errors = [];
    foreach ($order as $src) {
        if (empty($sources[$src]['ready'])) {
            continue;
        }
        $result = eplakMapGetTile($pdo, $src, $z, $x, $y, true);
        if ($result['ok']) {
            return $result;
        }
        $errors[] = $src . ':' . ($result['status'] ?? 0);
        /* اگر از کش دیسک چیزی داشتیم که خراب بود، ادامه می‌دهیم */
    }
    return ['ok' => false, 'error' => 'هیچ منبع نقشه‌ای پاسخ نداد', 'tried' => $errors, 'status' => 0, 'src' => 'auto'];
}

/* ══════════════════════════════════════════════════════════════════════
   آدرس فارسی از مختصات (اول نشان اگر کلید باشد، بعد Nominatim)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapShortAddress(?array $data, float $lat, float $lng): string
{
    if (!$data) {
        return '';
    }
    $addr = (isset($data['address']) && is_array($data['address'])) ? $data['address'] : [];
    $streetKeys = ['road', 'pedestrian', 'footway', 'cycleway', 'residential', 'path', 'square'];
    $hoodKeys   = ['neighbourhood', 'quarter', 'suburb', 'hamlet', 'borough', 'city_block'];
    $cityKeys   = ['city', 'town', 'village', 'municipality', 'city_district', 'county'];

    $pick = function (array $keys) use ($addr) {
        foreach ($keys as $key) {
            if (!empty($addr[$key])) {
                return trim((string) $addr[$key]);
            }
        }
        return '';
    };

    $parts = [];
    $street = $pick($streetKeys);
    $house = !empty($addr['house_number']) ? ('پلاک ' . trim((string) $addr['house_number'])) : '';
    if ($street !== '') {
        $parts[] = ($house !== '') ? ($street . '، ' . $house) : $street;
    }
    $hood = $pick($hoodKeys);
    if ($hood !== '' && !in_array($hood, $parts, true)) {
        $parts[] = $hood;
    }
    $city = $pick($cityKeys);
    if ($city !== '' && !in_array($city, $parts, true)) {
        $parts[] = $city;
    }
    if (count($parts) < 2 && !empty($data['display_name'])) {
        foreach (explode(',', (string) $data['display_name']) as $piece) {
            $value = trim($piece);
            if ($value !== '' && count($parts) < 3 && !in_array($value, $parts, true) && !preg_match('/^\d+$/', $value)) {
                $parts[] = $value;
            }
        }
    }
    if (!$parts) {
        return '';
    }
    $text = implode('، ', $parts);
    if (mb_strlen($text) > 120) {
        $text = trim(mb_substr($text, 0, 120));
    }
    if (mb_strlen($text) < 10) {
        $text .= ' (عرض ' . number_format($lat, 5) . ' • طول ' . number_format($lng, 5) . ')';
    }
    return $text;
}

function eplakMapReverse(?PDO $pdo, float $lat, float $lng): array
{
    $sources = eplakMapSourceRegistry($pdo);
    $neshanKey = (string) ($sources['neshan']['key'] ?? '');

    /* ۱) نشان — آدرس فارسی از سرور داخل ایران */
    if ($neshanKey !== '') {
        $url = 'https://api.neshan.org/v5/reverse?lat=' . urlencode((string) $lat) . '&lng=' . urlencode((string) $lng);
        $result = eplakMapFetchUrl($url, ['X-Api-Key: ' . $neshanKey, 'Accept: application/json'], 10);
        if ($result['ok'] && $result['body'] !== '') {
            $data = json_decode($result['body'], true);
            if (is_array($data)) {
                $formatted = trim((string) ($data['formatted_address'] ?? ''));
                if ($formatted !== '') {
                    return ['ok' => true, 'address' => $formatted, 'provider' => 'neshan', 'raw' => $data];
                }
            }
        }
    }

    /* ۲) Nominatim (OpenStreetMap) — از راه سرور، با User-Agent معتبر */
    $url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1'
        . '&accept-language=fa&lat=' . urlencode((string) $lat) . '&lon=' . urlencode((string) $lng);
    $result = eplakMapFetchUrl($url, ['Accept: application/json'], 10);
    if ($result['ok'] && $result['body'] !== '') {
        $data = json_decode($result['body'], true);
        if (is_array($data)) {
            $short = eplakMapShortAddress($data, $lat, $lng);
            if ($short !== '') {
                return ['ok' => true, 'address' => $short, 'provider' => 'osm', 'raw' => $data];
            }
            $fallback = !empty($data['display_name'])
                ? trim(implode('، ', array_slice(explode(',', (string) $data['display_name']), 0, 3)))
                : '';
            if ($fallback !== '') {
                return ['ok' => true, 'address' => $fallback, 'provider' => 'osm', 'raw' => $data];
            }
        }
    }
    return ['ok' => false, 'address' => '', 'provider' => '', 'error' => 'سرویس آدرس‌یاب پاسخ نداد'];
}

/* ══════════════════════════════════════════════════════════════════════
   آزمایش همه‌ی منابع از روی سرور (دکمه‌ی «آزمایش نقشه» در پنل مدیریت)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapTestSources(?PDO $pdo): array
{
    $sources = eplakMapSourceRegistry($pdo);
    $rows = [];
    /* کاشی نمونه: تهران، بزرگ‌نمایی ۱۴ */
    $z = 14;
    $x = 10415;
    $y = 6346;
    foreach ($sources as $id => $source) {
        if (($source['kind'] ?? '') !== 'xyz') {
            continue;
        }
        if (empty($source['ready'])) {
            $rows[] = ['id' => $id, 'label' => $source['label'], 'ok' => false, 'status' => 0, 'ms' => 0,
                       'note' => 'تنظیم نشده (به کلید/آدرس نیاز دارد)'];
            continue;
        }
        /* بدون کش (واقعاً شبکه سنجیده شود) و با مهلت کوتاه‌تر، تا آزمایش
           همه‌ی منابع زیر سقف زمان اجرای هاست بماند. */
        $result = eplakMapGetTile($pdo, $id, $z, $x, $y, false, 8);
        $rows[] = [
            'id'     => $id,
            'label'  => $source['label'],
            'ok'     => (bool) $result['ok'],
            'status' => (int) ($result['status'] ?? 0),
            'ms'     => (int) ($result['ms'] ?? 0),
            'bytes'  => isset($result['body']) ? strlen($result['body']) : 0,
            'note'   => $result['ok'] ? 'کار می‌کند' : (string) ($result['error'] ?? 'خطا'),
        ];
    }
    /* آدرس‌یاب هم سنجیده می‌شود */
    $reverse = eplakMapReverse($pdo, 35.6892, 51.3890);
    return [
        'ok'      => true,
        'sources' => $rows,
        'reverse' => [
            'ok'       => (bool) $reverse['ok'],
            'provider' => (string) ($reverse['provider'] ?? ''),
            'address'  => (string) ($reverse['address'] ?? ''),
        ],
        'working' => array_values(array_map(function ($row) {
            return $row['id'];
        }, array_filter($rows, function ($row) {
            return !empty($row['ok']);
        }))),
    ];
}

/* ══════════════════════════════════════════════════════════════════════
   پاک‌سازی کش کاشی‌ها (فقط فایل‌های قدیمی‌تر از ۴۵ روز)
   ══════════════════════════════════════════════════════════════════════ */
function eplakMapCachePrune(): void
{
    if (mt_rand(1, 200) !== 1) {
        return;   /* در هر ۲۰۰ درخواست، یک بار */
    }
    $root = eplakMapCacheDir();
    if (!is_dir($root)) {
        return;
    }
    $limit = time() - (45 * 86400);
    foreach ((array) glob($root . '/*/*.img') as $file) {
        if (is_file($file) && (int) filemtime($file) < $limit) {
            @unlink($file);
        }
    }
}

