<?php
/* tools/media-selftest.php — آزمون خودکار «عکس و فیلم» روی سرور واقعی
   ============================================================================
   این اسکریپت با یک دیتابیس SQLite موقت (جدا از دیتابیس اصلی) ثابت می‌کند که:

     • جدول media ساخته می‌شود و ستون‌هایش کامل است
     • نوع فایل با «امضای بایتی» درست تشخیص داده می‌شود (عکس/فیلم/فایل جعلی)
     • فایل روی سرور ذخیره می‌شود و آدرس عمومی معتبر می‌گیرد
     • مالکیت رسانه (شماره‌ی موبایل) و اتصال به گزارش درست کار می‌کند
     • حذف رسانه، هم رکورد و هم فایل را پاک می‌کند

   اجرا روی هاست/لوکال:
       php tools/media-selftest.php

   خروجی: ۰ = موفق، ۱ = خطا، ۲ = پیش‌نیاز (pdo_sqlite) نصب نیست.
   این فایل هیچ آسیبی به داده‌های اصلی نمی‌زند (دیتابیس و فایل‌های موقت).
*/

/* فقط محیط‌های خط فرمان/توسعه؛ از مسیر وب قابل اجرا نیست */
if (!in_array(PHP_SAPI, ['cli', 'embed', 'phpdbg'], true)) {
    http_response_code(403);
    echo 'این اسکریپت فقط از خط فرمان اجرا می‌شود.';
    exit(1);
}

/* پرچم تست: به eplakMediaStoreFile اجازه می‌دهد مسیر فایل محلی را «امن» بداند
   (در مسیر وب هرگز تعریف نمی‌شود؛ پس آپلود واقعی همیشه is_uploaded_file دارد) */
define('EPLAK_MEDIA_CLI_TEST', true);
define('EPLAK_ROOT', dirname(__DIR__));

$tmpRoot  = sys_get_temp_dir() . '/eplak-media-selftest-' . bin2hex(random_bytes(4));
$tmpDb    = $tmpRoot . '/selftest.sqlite';
$tmpMedia = $tmpRoot . '/uploads';
@mkdir($tmpRoot, 0777, true);
@mkdir($tmpMedia, 0777, true);

/* دیتابیس موقت، جدا از دیتابیس اصلی */
putenv('DB_DRIVER=sqlite');
putenv('DB_SQLITE_PATH=' . $tmpDb);

$passed = 0;
$failed = [];
$notes  = [];

function selftest_check(string $name, bool $ok, string $extra = ''): void
{
    global $passed, $failed;
    if ($ok) {
        $passed++;
        echo "  ✅ $name" . ($extra !== '' ? " — $extra" : '') . "\n";
    } else {
        $failed[] = $name . ($extra !== '' ? " — $extra" : '');
        echo "  ❌ $name" . ($extra !== '' ? " — $extra" : '') . "\n";
    }
}

function selftest_cleanup(string $tmpRoot): void
{
    if (!is_dir($tmpRoot)) {
        return;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($tmpRoot, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $entry) {
        $entry->isDir() ? @rmdir($entry->getPathname()) : @unlink($entry->getPathname());
    }
    @rmdir($tmpRoot);
}

echo "▶ آزمون عکس و فیلم ای‌پلاک\n";
echo '  PHP ' . PHP_VERSION . ' | pdo_sqlite: ' . (extension_loaded('pdo_sqlite') ? 'دارد' : 'ندارد')
    . ' | fileinfo: ' . (extension_loaded('fileinfo') ? 'دارد' : 'ندارد') . "\n";

if (!extension_loaded('pdo_sqlite')) {
    echo "\n⚠️ اکستنشن pdo_sqlite روی این PHP نصب نیست؛ آزمون رد شد (۲).\n";
    selftest_cleanup($tmpRoot);
    exit(2);
}

try {
    require_once EPLAK_ROOT . '/shared/bootstrap.php';
    require_once EPLAK_ROOT . '/shared/media.php';

    /* ── ۱) دیتابیس و جدول ───────────────────────────────────────────── */
    $pdo = eplakGetPdo();
    eplakEnsureMediaTable($pdo);
    $cols = [];
    foreach ($pdo->query('PRAGMA table_info(media)') as $col) {
        $cols[strtolower((string) $col['name'])] = true;
    }
    $required = ['id', 'user_phone', 'report_id', 'kind', 'mime', 'original_name', 'stored_name', 'rel_path', 'size_bytes', 'token', 'source', 'created_at'];
    $missingCols = array_values(array_diff($required, array_keys($cols)));
    selftest_check('جدول media با همه‌ی ستون‌ها ساخته شد', $missingCols === [], $missingCols ? 'کمبود: ' . implode(',', $missingCols) : count($cols) . ' ستون');

    /* ── ۲) تنظیمات ──────────────────────────────────────────────────── */
    $cfg = eplakMediaConfig();
    selftest_check('تنظیمات پیش‌فرض رسانه معتبر است', $cfg['max_image_bytes'] > 0 && $cfg['max_video_bytes'] > 0 && $cfg['max_count'] > 0,
        'عکس ' . round($cfg['max_image_bytes'] / 1048576) . 'MB / فیلم ' . round($cfg['max_video_bytes'] / 1048576) . 'MB / حداکثر ' . $cfg['max_count'] . ' فایل');
    selftest_check('تبدیل مقدار ini (۸M → بایت)', eplakMediaIniBytes('8M') === 8388608 && eplakMediaIniBytes('512K') === 524288, '8M=8388608');

    /* ── ۳) ساخت فایل‌های آزمایشی با امضای واقعی ──────────────────────── */
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', true);
    $jpeg = base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', true);
    $mp4 = "\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2mp41\x00\x00\x00\x08mdat";
    $webm = "\x1A\x45\xDF\xA3\x01\x00\x00\x00webm";
    $fake = 'GIF-like text that is not a real image at all';

    $files = [
        'photo.png'  => $png,
        'photo.jpg'  => $jpeg,
        'movie.mp4'  => $mp4,
        'clip.webm'  => $webm,
        'evil.jpg'   => $fake,
    ];
    foreach ($files as $name => $bytes) {
        file_put_contents($tmpRoot . '/' . $name, $bytes);
    }

    /* ── ۴) تشخیص نوع ────────────────────────────────────────────────── */
    selftest_check('تشخیص PNG', eplakMediaSniffMime($tmpRoot . '/photo.png') === 'image/png', eplakMediaSniffMime($tmpRoot . '/photo.png'));
    selftest_check('تشخیص JPEG', eplakMediaSniffMime($tmpRoot . '/photo.jpg') === 'image/jpeg', eplakMediaSniffMime($tmpRoot . '/photo.jpg'));
    selftest_check('تشخیص MP4', eplakMediaSniffMime($tmpRoot . '/movie.mp4') === 'video/mp4', eplakMediaSniffMime($tmpRoot . '/movie.mp4'));
    selftest_check('تشخیص WEBM', eplakMediaSniffMime($tmpRoot . '/clip.webm') === 'video/webm', eplakMediaSniffMime($tmpRoot . '/clip.webm'));
    selftest_check('رد فایل جعلی با پسوند jpg', eplakMediaSniffMime($tmpRoot . '/evil.jpg') === '', 'بدون امضای تصویر');

    /* ── ۵) ذخیره‌سازی ───────────────────────────────────────────────── */
    $user = '09123456789';
    $stored = [];
    try {
        $stored['image'] = eplakMediaStoreFile($pdo, $tmpRoot . '/photo.png', [
            'phone' => $user, 'report_id' => null, 'source' => 'camera', 'mime' => 'image/png', 'original_name' => 'IMG_0001.PNG',
        ]);
        $stored['video'] = eplakMediaStoreFile($pdo, $tmpRoot . '/movie.mp4', [
            'phone' => $user, 'report_id' => null, 'source' => 'camera', 'mime' => 'video/mp4', 'original_name' => 'VID_0002.mp4', 'duration_ms' => 4200,
        ]);
    } catch (Throwable $e) {
        selftest_check('ذخیره‌ی عکس و فیلم', false, $e->getMessage());
    }

    if (!empty($stored['image']) && !empty($stored['video'])) {
        selftest_check('ذخیره‌ی عکس و فیلم در دیتابیس', (int) $stored['image']['id'] > 0 && (int) $stored['video']['id'] > 0,
            'شناسه‌ها: ' . (int) $stored['image']['id'] . ' و ' . (int) $stored['video']['id']);
        selftest_check('نوع و MIME درست ثبت شد', $stored['image']['kind'] === 'image' && $stored['video']['kind'] === 'video'
            && $stored['image']['mime'] === 'image/png' && $stored['video']['mime'] === 'video/mp4',
            $stored['image']['kind'] . '/' . $stored['video']['kind']);
        selftest_check('طول فیلم ذخیره شد', (int) $stored['video']['duration_ms'] === 4200, (string) (int) $stored['video']['duration_ms']);
        selftest_check('نام اصلی فایل حفظ شد', $stored['image']['original_name'] === 'IMG_0001.PNG', $stored['image']['original_name']);

        $imagePath = eplakMediaAbsolutePath($stored['image']);
        $videoPath = eplakMediaAbsolutePath($stored['video']);
        selftest_check('فایل‌ها روی دیسک نوشته شدند', is_file($imagePath) && is_file($videoPath),
            'image=' . (is_file($imagePath) ? filesize($imagePath) . 'B' : 'نیست') . ' video=' . (is_file($videoPath) ? filesize($videoPath) . 'B' : 'نیست'));
        selftest_check('فایل جعلی ذخیره نشد', !is_file($tmpMedia . '/evil.jpg'));

        $public = eplakMediaRowToPublic($stored['image']);
        selftest_check('آدرس عمومی معتبر ساخته شد', (bool) preg_match('#(uploads/media|action=file&t=)#', $public['url']),
            $public['url']);
        selftest_check('توکن یکتا برای تحویل امن فایل', strlen($public['token']) >= 16, $public['token']);

        /* ── ۶) فهرست بر اساس مالک ──────────────────────────────────────── */
        $mine = eplakMediaRowsForUser($pdo, $user);
        $other = eplakMediaRowsForUser($pdo, '09120000000');
        selftest_check('فهرست رسانه‌های کاربر', count($mine) === 2, count($mine) . ' رکورد');
        selftest_check('جداسازی مالکیت (شماره‌ی دیگر)', count($other) === 0, count($other) . ' رکورد');
        selftest_check('سقف آپلود ساعتی', eplakMediaHourlyUsage($pdo, $user) === 2, (string) eplakMediaHourlyUsage($pdo, $user));

        /* ── ۷) اتصال به گزارش ──────────────────────────────────────────── */
        $pdo->exec("INSERT INTO reports (user_phone, title, description, category, status) VALUES (" .
            $pdo->quote($user) . ", 'تست', 'تست', 'تست', 'pending')");
        $reportId = (int) $pdo->lastInsertId();
        $attached = eplakMediaAttachToReport($pdo, [$stored['image']['id'], $stored['video']['id']], $reportId, $user);
        selftest_check('اتصال رسانه‌ها به گزارش', $attached === 2, "attached=$attached report=$reportId");
        selftest_check('فهرست رسانه‌های گزارش', count(eplakMediaRowsForReport($pdo, $reportId)) === 2);

        /* ── ۸) حذف ─────────────────────────────────────────────────────── */
        $deleted = eplakMediaDeleteForUser($pdo, (int) $stored['image']['id'], $user);
        selftest_check('حذف رسانه توسط مالک', $deleted === true);
        selftest_check('فایل حذف‌شده از دیسک پاک شد', !is_file($imagePath));
        selftest_check('حذف توسط شماره‌ی غیرمالک انجام نمی‌شود', eplakMediaDeleteForUser($pdo, (int) $stored['video']['id'], '09120000000') === false);
        selftest_check('حذف رسانه‌های گزارش', eplakMediaDeleteForReport($pdo, $reportId) === 1, 'یک رسانه‌ی باقی‌مانده');
    }

    /* ── ۹) سقف‌های واقعی سرور ──────────────────────────────────────── */
    $server = eplakMediaServerLimits();
    $notes[] = 'سقف PHP: upload_max_filesize=' . ($server['upload_max_filesize'] ? round($server['upload_max_filesize'] / 1048576) . 'MB' : 'نامحدود')
        . ' post_max_size=' . ($server['post_max_size'] ? round($server['post_max_size'] / 1048576) . 'MB' : 'نامحدود');
    $effective = (int) $server['effective_max'];
    if ($effective > 0 && $effective < 8 * 1024 * 1024) {
        $notes[] = '⚠️ سقف بارگذاری سرور خیلی کم است؛ برای فیلم، post_max_size را بالا ببرید.';
    }
} catch (Throwable $e) {
    $failed[] = 'اجرای آزمون: ' . $e->getMessage();
    echo '  ❌ خطای غیرمنتظره: ' . $e->getMessage() . "\n";
}

selftest_cleanup($tmpRoot);

foreach ($notes as $note) {
    echo '  ℹ️ ' . $note . "\n";
}
echo "\n" . ($failed ? '❌ ناموفق' : '✅ همه‌ی آزمون‌ها موفق') . " — $passed موفق، " . count($failed) . " ناموفق\n";
if ($failed) {
    foreach ($failed as $f) {
        echo '   - ' . $f . "\n";
    }
    exit(1);
}
exit(0);
