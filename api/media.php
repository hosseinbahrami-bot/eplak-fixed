<?php
/* api/media.php — سرو کردن امن فایل‌های آپلودی (عکس/فیلم گزارش‌ها)

   چرا لازم است؟ در برخی هاست‌ها/پیش‌نمایش‌ها دسترسی مستقیم به پوشه‌ی uploads
   مسدود است یا مسیر اپ با مسیر فایل یکی نیست. این اندپوینت همان فایل را با
   هدرهای درست برمی‌گرداند.

   استفاده:  api/media.php?f=uploads/reports/2026/09/xxxx.jpg
             api/media.php?id=12           (شناسه‌ی ردیف report_media)

   امنیت: فقط فایل‌هایی که داخل پوشه‌ی uploads/reports هستند سرو می‌شوند؛
   هر مسیر خارج از این پوشه (../ یا مسیر مطلق) رد می‌شود.
*/
require_once __DIR__ . '/_common.php';

$root = realpath(EPLAK_ROOT . '/uploads/reports');
if ($root === false) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'فایل یافت نشد';
    exit;
}

$requested = '';

$id = (int) ($_GET['id'] ?? 0);
if ($id > 0) {
    try {
        $stmt = $pdo->prepare('SELECT file_path FROM report_media WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $requested = (string) ($stmt->fetchColumn() ?: '');
    } catch (Throwable $e) {
        $requested = '';
    }
}

if ($requested === '') {
    $requested = (string) ($_GET['f'] ?? '');
}

$requested = rawurldecode(trim($requested));
$requested = ltrim(str_replace('\\', '/', $requested), '/');
if (strpos($requested, '..') !== false) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'مسیر نامعتبر';
    exit;
}

/* فقط مسیرهای داخل uploads/reports مجاز هستند */
$relative = preg_replace('#^.*?uploads/reports/#', '', $requested) ?? '';
$absolute = realpath($root . '/' . $relative);

if ($absolute === false || strpos($absolute, $root) !== 0 || !is_file($absolute)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'فایل یافت نشد';
    exit;
}

$mime = 'application/octet-stream';
if (function_exists('finfo_open')) {
    $finfo = @finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
        $detected = (string) @finfo_file($finfo, $absolute);
        @finfo_close($finfo);
        if ($detected !== '') {
            $mime = $detected;
        }
    }
}

$size = (int) (filesize($absolute) ?: 0);

header('Content-Type: ' . $mime);
header('Content-Length: ' . $size);
header('Cache-Control: private, max-age=86400');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . basename($absolute) . '"');

readfile($absolute);
