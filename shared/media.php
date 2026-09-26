<?php
/* ============================================================================
   shared/media.php — ذخیره‌سازی و بازیابی «عکس و فیلم» گزارش‌های شهروندی

   مسئله‌ی قبلی: اپلیکیشن فقط «نام فایل» را در حافظه‌ی محلی نگه می‌داشت و هیچ
   فایلی به سرور فرستاده نمی‌شد؛ بنابراین در پنل مدیریت هیچ عکس/فیلمی از درخواست
   شهروند دیده نمی‌شد. این فایل مسیر کامل آپلود → ذخیره روی سرور → نمایش در پنل
   را فراهم می‌کند.

   قواعد امنیتی:
     • فقط پسوندها و MIMEهای مجاز (تصویر/ویدیو) پذیرفته می‌شوند — تشخیص نوع با
       finfo و در صورت نبود آن با getimagesize/allowed-extension.
     • نام فایل تصادفی ساخته می‌شود (هیچ بخشی از نام کاربر روی سرور نمی‌نشیند).
     • سقف حجم و سقف تعداد فایل برای هر گزارش.
     • فایل‌ها با پسوند غیرقابل‌اجرا ذخیره می‌شوند و در کنارشان .htaccess برای
       جلوگیری از اجرای اسکریپت قرار می‌گیرد.
   ============================================================================ */

if (!defined('EPLAK_MEDIA_MAX_IMAGE_MB')) {
    define('EPLAK_MEDIA_MAX_IMAGE_MB', 12);
}
if (!defined('EPLAK_MEDIA_MAX_VIDEO_MB')) {
    define('EPLAK_MEDIA_MAX_VIDEO_MB', 80);
}
if (!defined('EPLAK_MEDIA_MAX_PER_REPORT')) {
    define('EPLAK_MEDIA_MAX_PER_REPORT', 6);
}

/* MIME مجاز → [پسوند, نوع] */
function eplakMediaAllowedTypes(): array {
    return [
        'image/jpeg'      => ['ext' => 'jpg',  'kind' => 'image'],
        'image/jpg'       => ['ext' => 'jpg',  'kind' => 'image'],
        'image/pjpeg'     => ['ext' => 'jpg',  'kind' => 'image'],
        'image/png'       => ['ext' => 'png',  'kind' => 'image'],
        'image/webp'      => ['ext' => 'webp', 'kind' => 'image'],
        'image/gif'       => ['ext' => 'gif',  'kind' => 'image'],
        'image/heic'      => ['ext' => 'heic', 'kind' => 'image'],
        'image/heif'      => ['ext' => 'heic', 'kind' => 'image'],
        'image/bmp'       => ['ext' => 'bmp',  'kind' => 'image'],
        'video/mp4'       => ['ext' => 'mp4',  'kind' => 'video'],
        'video/quicktime' => ['ext' => 'mov',  'kind' => 'video'],
        'video/x-msvideo' => ['ext' => 'avi',  'kind' => 'video'],
        'video/webm'      => ['ext' => 'webm', 'kind' => 'video'],
        'video/3gpp'      => ['ext' => '3gp',  'kind' => 'video'],
        'video/x-matroska' => ['ext' => 'mkv', 'kind' => 'video'],
        'video/mpeg'      => ['ext' => 'mpg',  'kind' => 'video'],
        'video/mov'       => ['ext' => 'mov',  'kind' => 'video'],
    ];
}

function eplakMediaExtensionTypes(): array {
    return [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'heic' => 'image/heic', 'heif' => 'image/heic', 'bmp' => 'image/bmp',
        'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm',
        '3gp' => 'video/3gpp', 'mkv' => 'video/x-matroska', 'avi' => 'video/x-msvideo', 'mpg' => 'video/mpeg',
    ];
}

/* پوشه‌ی ذخیره‌سازی فایل‌های ارسالی (در ریشه‌ی پروژه: uploads/reports/…) */
function eplakMediaUploadRoot(): string {
    return EPLAK_ROOT . '/uploads/reports';
}

/* ساخت پوشه‌ی ماهانه + محافظت از اجرای اسکریپت */
function eplakMediaEnsureDir(string $absoluteDir): bool {
    if (!is_dir($absoluteDir) && !@mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
        return false;
    }
    $uploadsRoot = EPLAK_ROOT . '/uploads';
    if (!is_dir($uploadsRoot) && !@mkdir($uploadsRoot, 0775, true) && !is_dir($uploadsRoot)) {
        return false;
    }
    $htaccess = $uploadsRoot . '/.htaccess';
    $guardMarker = '# eplak-media-guard-v2';
    $existing = is_file($htaccess) ? (string) @file_get_contents($htaccess) : '';

    /* اگر فایل نگهبان نبود یا نسخه‌ی قدیمی بود، بازنویسی می‌شود.
       نکته‌ی مهم: همه‌ی دستورهای مربوط به PHP داخل <IfModule> هستند؛ در غیر این
       صورت روی هاست‌هایی که PHP-FPM/LiteSpeed دارند خطای 500 می‌داد و
       عکس‌های گزارش‌ها نمایش داده نمی‌شدند. */
    if (strpos($existing, $guardMarker) === false) {
        $guard = $guardMarker . " — جلوگیری از اجرای اسکریپت در پوشه‌ی فایل‌های آپلودی (نسخه‌ی ۲)\n"
            . "<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php5.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php8.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_authz_core.c>\n"
            . "  <FilesMatch \"\\.(php|php5|php7|phtml|pht|phar|cgi|pl|py|sh|htaccess)$\">\n    Require all denied\n  </FilesMatch>\n"
            . "</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n"
            . "  <FilesMatch \"\\.(php|php5|php7|phtml|pht|phar|cgi|pl|py|sh|htaccess)$\">\n    Order allow,deny\n    Deny from all\n  </FilesMatch>\n"
            . "</IfModule>\n";
        @file_put_contents($htaccess, $guard);
        @chmod($htaccess, 0644);
    }
    return true;
}

function eplakMediaMaxBytes(string $kind): int {
    $mb = $kind === 'video' ? EPLAK_MEDIA_MAX_VIDEO_MB : EPLAK_MEDIA_MAX_IMAGE_MB;
    return $mb * 1024 * 1024;
}

/* تشخیص نوع فایل: اول finfo، بعد پسوند، در نهایت تصویرسنجی */
function eplakMediaDetectType(string $tmpPath, string $originalName): array {
    $allowed = eplakMediaAllowedTypes();
    $mime = '';

    if (function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = (string) @finfo_file($finfo, $tmpPath);
            @finfo_close($finfo);
        }
    }
    $mime = strtolower(trim(explode(';', $mime)[0]));

    if ($mime !== '' && isset($allowed[$mime])) {
        return ['ok' => true, 'mime' => $mime, 'ext' => $allowed[$mime]['ext'], 'kind' => $allowed[$mime]['kind']];
    }

    /* پسوند فایل به‌عنوان مکمل (برخی هاست‌ها finfo ندارند) */
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $byExt = eplakMediaExtensionTypes();
    if ($ext !== '' && isset($byExt[$ext])) {
        $guessed = $byExt[$ext];
        if (isset($allowed[$guessed])) {
            return ['ok' => true, 'mime' => $guessed, 'ext' => $allowed[$guessed]['ext'], 'kind' => $allowed[$guessed]['kind']];
        }
    }

    /* اگر finfo تشخیص نداد ولی خروجی تصویری معتبر بود */
    if (function_exists('getimagesize')) {
        $info = @getimagesize($tmpPath);
        if (is_array($info) && !empty($info['mime']) && isset($allowed[strtolower($info['mime'])])) {
            $m = strtolower($info['mime']);
            return ['ok' => true, 'mime' => $m, 'ext' => $allowed[$m]['ext'], 'kind' => $allowed[$m]['kind']];
        }
    }

    return ['ok' => false, 'mime' => $mime, 'ext' => '', 'kind' => ''];
}

/* ثبت ردیف فایل در دیتابیس */
function eplakMediaInsertRow(PDO $pdo, int $reportId, string $relativePath, string $kind, string $originalName, string $mime, int $size): bool {
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO report_media (report_id, kind, file_path, original_name, mime_type, size_bytes)
             VALUES (:report_id, :kind, :file_path, :original_name, :mime_type, :size_bytes)'
        );
        $stmt->execute([
            ':report_id'     => $reportId,
            ':kind'          => $kind,
            ':file_path'     => $relativePath,
            ':original_name' => mb_substr($originalName, 0, 250, 'UTF-8'),
            ':mime_type'     => $mime,
            ':size_bytes'    => $size,
        ]);
        return true;
    } catch (\Throwable $e) {
        error_log('[eplak-media] insert failed: ' . $e->getMessage());
        return false;
    }
}

/* ذخیره‌ی محتوای خام (مسیر JSON با base64) */
function eplakMediaStoreBinary(PDO $pdo, int $reportId, string $binary, string $originalName, string $declaredMime = ''): array {
    $tmp = tempnam(sys_get_temp_dir(), 'eplakmedia');
    if ($tmp === false) {
        return ['ok' => false, 'error' => 'ساخت فایل موقت ناموفق بود.'];
    }
    file_put_contents($tmp, $binary);
    $result = eplakMediaStoreFile($pdo, $reportId, [
        'tmp_name' => $tmp,
        'name'     => $originalName,
        'type'     => $declaredMime,
        'error'    => UPLOAD_ERR_OK,
        'size'     => strlen($binary),
    ]);
    @unlink($tmp);
    return $result;
}

/* ذخیره‌ی یک فایل آپلودی ($_FILES[...]) برای گزارش مشخص */
function eplakMediaStoreFile(PDO $pdo, int $reportId, array $file): array {
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return ['ok' => false, 'error' => 'فایلی انتخاب نشده بود.'];
    }
    if ($error !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE   => 'حجم فایل بیشتر از حد مجاز سرور است (upload_max_filesize).',
            UPLOAD_ERR_FORM_SIZE  => 'حجم فایل بیشتر از حد مجاز فرم است.',
            UPLOAD_ERR_PARTIAL    => 'آپلود فایل ناتمام ماند؛ دوباره تلاش کنید.',
            UPLOAD_ERR_NO_TMP_DIR => 'پوشه‌ی موقت سرور در دسترس نیست.',
            UPLOAD_ERR_CANT_WRITE => 'نوشتن فایل روی سرور ممکن نشد.',
            UPLOAD_ERR_EXTENSION  => 'آپلود توسط یکی از افزونه‌های سرور متوقف شد.',
        ];
        return ['ok' => false, 'error' => $messages[$error] ?? ('خطای نامشخص در آپلود (کد ' . $error . ').')];
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    $originalName = (string) ($file['name'] ?? 'file');
    if ($tmpPath === '' || !is_file($tmpPath)) {
        return ['ok' => false, 'error' => 'فایل موقت پیدا نشد.'];
    }

    $detected = eplakMediaDetectType($tmpPath, $originalName);
    if (!$detected['ok']) {
        return ['ok' => false, 'error' => 'فرمت فایل مجاز نیست. فقط تصویر (jpg/png/webp/heic) یا ویدیو (mp4/mov/webm/3gp).'];
    }

    $size = (int) (filesize($tmpPath) ?: 0);
    $maxBytes = eplakMediaMaxBytes($detected['kind']);
    if ($size <= 0) {
        return ['ok' => false, 'error' => 'فایل خالی است.'];
    }
    if ($size > $maxBytes) {
        return ['ok' => false, 'error' => 'حجم فایل بیش از حد مجاز است (حداکثر ' . round($maxBytes / 1048576) . ' مگابایت).'];
    }

    $subDir = date('Y/m');
    $absoluteDir = eplakMediaUploadRoot() . '/' . $subDir;
    if (!eplakMediaEnsureDir($absoluteDir)) {
        return ['ok' => false, 'error' => 'پوشه‌ی ذخیره‌سازی فایل‌ها قابل نوشتن نیست (پوشه‌ی uploads).'];
    }

    $fileName = date('Ymd') . '-' . bin2hex(random_bytes(8)) . '.' . $detected['ext'];
    $absolutePath = $absoluteDir . '/' . $fileName;
    $relativePath = 'uploads/reports/' . $subDir . '/' . $fileName;

    $moved = is_uploaded_file($tmpPath)
        ? @move_uploaded_file($tmpPath, $absolutePath)
        : @rename($tmpPath, $absolutePath);
    if (!$moved) {
        /* اگر جابه‌جایی مستقیم ممکن نشد، کپی محتوایی انجام می‌شود */
        $moved = @copy($tmpPath, $absolutePath);
    }
    if (!$moved || !is_file($absolutePath)) {
        return ['ok' => false, 'error' => 'ذخیره‌ی فایل روی سرور ناموفق بود.'];
    }
    @chmod($absolutePath, 0644);

    if (!eplakMediaInsertRow($pdo, $reportId, $relativePath, $detected['kind'], $originalName, $detected['mime'], $size)) {
        @unlink($absolutePath);
        return ['ok' => false, 'error' => 'ثبت فایل در دیتابیس ناموفق بود.'];
    }

    return [
        'ok'   => true,
        'media' => [
            'kind' => $detected['kind'],
            'path' => $relativePath,
            'url'  => eplakMediaUrl($relativePath),
            'name' => $originalName,
            'mime' => $detected['mime'],
            'size' => $size,
        ],
    ];
}

/* ذخیره‌ی یک تصویر مستقل (مثلاً تصویر شاخص خبر/دانستنی) بدون ثبت در گزارش‌ها.
   خروجی: ['ok' => bool, 'path' => 'uploads/news/…', 'error' => string] */
function eplakMediaStoreSimpleFile(array $file, string $folder = 'news'): array {
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return ['ok' => false, 'path' => '', 'error' => 'فایلی انتخاب نشده بود.'];
    }
    if ($error !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'path' => '', 'error' => 'آپلود فایل ناموفق بود (کد ' . $error . ').'];
    }

    $folder = preg_replace('/[^a-z0-9_\-]/i', '', $folder) ?: 'general';
    $tmpPath = (string) ($file['tmp_name'] ?? '');
    $originalName = (string) ($file['name'] ?? 'image');

    if ($tmpPath === '' || !is_file($tmpPath)) {
        return ['ok' => false, 'path' => '', 'error' => 'فایل موقت پیدا نشد.'];
    }

    $detected = eplakMediaDetectType($tmpPath, $originalName);
    if (!$detected['ok'] || $detected['kind'] !== 'image') {
        return ['ok' => false, 'path' => '', 'error' => 'فقط تصویر مجاز است (jpg، png، webp، gif).'];
    }

    $size = (int) (filesize($tmpPath) ?: 0);
    if ($size > eplakMediaMaxBytes('image')) {
        return ['ok' => false, 'path' => '', 'error' => 'حجم تصویر بیش از حد مجاز است (' . EPLAK_MEDIA_MAX_IMAGE_MB . ' مگابایت).'];
    }

    $subDir = date('Y/m');
    $absoluteDir = EPLAK_ROOT . '/uploads/' . $folder . '/' . $subDir;
    if (!eplakMediaEnsureDir($absoluteDir)) {
        return ['ok' => false, 'path' => '', 'error' => 'پوشه‌ی uploads قابل نوشتن نیست.'];
    }

    $fileName = date('Ymd') . '-' . bin2hex(random_bytes(6)) . '.' . $detected['ext'];
    $absolutePath = $absoluteDir . '/' . $fileName;

    $moved = is_uploaded_file($tmpPath) ? @move_uploaded_file($tmpPath, $absolutePath) : @rename($tmpPath, $absolutePath);
    if (!$moved) {
        $moved = @copy($tmpPath, $absolutePath);
    }
    if (!$moved || !is_file($absolutePath)) {
        return ['ok' => false, 'path' => '', 'error' => 'ذخیره‌ی تصویر ناموفق بود.'];
    }
    @chmod($absolutePath, 0644);

    return ['ok' => true, 'path' => 'uploads/' . $folder . '/' . $subDir . '/' . $fileName, 'error' => ''];
}

/* آدرس عمومی یک فایل ذخیره‌شده (نسبت به ریشه‌ی اپ) */
function eplakMediaUrl(string $relativePath): string {
    $relativePath = ltrim($relativePath, '/');
    if ($relativePath === '') {
        return '';
    }
    /* اگر ادمین آدرس کامل وارد کرده باشد، دست‌نخورده برگردانده می‌شود */
    if (preg_match('#^(https?:)?//#i', $relativePath)) {
        return $relativePath;
    }
    return $relativePath;
}

/* فایل‌های یک گزارش */
function eplakMediaForReport(PDO $pdo, int $reportId): array {
    try {
        $stmt = $pdo->prepare('SELECT * FROM report_media WHERE report_id = :id ORDER BY id ASC');
        $stmt->execute([':id' => $reportId]);
        $rows = $stmt->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }

    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id'      => (int) $row['id'],
            'kind'    => (string) $row['kind'],
            'path'    => (string) $row['file_path'],
            'url'     => eplakMediaUrl((string) $row['file_path']),
            'name'    => (string) ($row['original_name'] ?? ''),
            'mime'    => (string) ($row['mime_type'] ?? ''),
            'size'    => (int) ($row['size_bytes'] ?? 0),
            'created' => (string) ($row['created_at'] ?? ''),
        ];
    }
    return $out;
}

/* فایل‌های چند گزارش به‌صورت گروه‌بندی‌شده — یک کوئری برای کل فهرست */
function eplakMediaGroupedByReport(PDO $pdo, array $reportIds = []): array {
    $out = [];
    try {
        if (!$reportIds) {
            return [];
        }
        $ids = [];
        foreach ($reportIds as $id) {
            $id = (int) $id;
            if ($id > 0) {
                $ids[] = $id;
            }
        }
        if (!$ids) {
            return [];
        }
        $rows = $pdo->query(
            'SELECT * FROM report_media WHERE report_id IN (' . implode(',', $ids) . ') ORDER BY report_id ASC, id ASC'
        )->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }

    foreach ($rows as $row) {
        $rid = (int) $row['report_id'];
        if (!isset($out[$rid])) {
            $out[$rid] = [];
        }
        $out[$rid][] = [
            'id'   => (int) $row['id'],
            'kind' => (string) $row['kind'],
            'path' => (string) $row['file_path'],
            'url'  => eplakMediaUrl((string) $row['file_path']),
            'name' => (string) ($row['original_name'] ?? ''),
            'mime' => (string) ($row['mime_type'] ?? ''),
            'size' => (int) ($row['size_bytes'] ?? 0),
        ];
    }
    return $out;
}

/* تعداد فایل‌های هر گزارش — برای نمایش در فهرست گزارش‌های پنل */
function eplakMediaCounts(PDO $pdo, array $reportIds = []): array {
    $out = [];
    try {
        if (!$reportIds) {
            $rows = $pdo->query('SELECT report_id, kind, COUNT(*) AS c FROM report_media GROUP BY report_id, kind')->fetchAll();
        } else {
            $ids = [];
            foreach ($reportIds as $id) {
                $id = (int) $id;
                if ($id > 0) {
                    $ids[] = $id;
                }
            }
            if (!$ids) {
                return [];
            }
            $rows = $pdo->query(
                'SELECT report_id, kind, COUNT(*) AS c FROM report_media
                 WHERE report_id IN (' . implode(',', $ids) . ') GROUP BY report_id, kind'
            )->fetchAll();
        }
    } catch (\Throwable $e) {
        return [];
    }

    foreach ($rows as $row) {
        $rid = (int) $row['report_id'];
        if (!isset($out[$rid])) {
            $out[$rid] = ['image' => 0, 'video' => 0, 'total' => 0];
        }
        $kind = ((string) $row['kind']) === 'video' ? 'video' : 'image';
        $out[$rid][$kind] += (int) $row['c'];
        $out[$rid]['total'] += (int) $row['c'];
    }
    return $out;
}

/* حذف فایل‌های یک گزارش (هم ردیف دیتابیس، هم فایل روی دیسک) */
function eplakMediaDeleteForReport(PDO $pdo, int $reportId): void {
    try {
        $stmt = $pdo->prepare('SELECT file_path FROM report_media WHERE report_id = :id');
        $stmt->execute([':id' => $reportId]);
        foreach ($stmt->fetchAll() as $row) {
            $path = (string) ($row['file_path'] ?? '');
            if ($path !== '' && strpos($path, 'uploads/') === 0) {
                $absolute = EPLAK_ROOT . '/' . $path;
                if (is_file($absolute)) {
                    @unlink($absolute);
                }
            }
        }
        $del = $pdo->prepare('DELETE FROM report_media WHERE report_id = :id');
        $del->execute([':id' => $reportId]);
    } catch (\Throwable $e) {
        /* بی‌صدا */
    }
}

/* خواندن فایل آپلودی از ساختار چندفایلی $_FILES (name="media[]") */
function eplakMediaNormalizeFiles(?array $files): array {
    if (!is_array($files) || !isset($files['name'])) {
        return [];
    }
    $normalized = [];
    if (is_array($files['name'])) {
        foreach ($files['name'] as $i => $name) {
            $normalized[] = [
                'name'     => (string) $name,
                'type'     => (string) ($files['type'][$i] ?? ''),
                'tmp_name' => (string) ($files['tmp_name'][$i] ?? ''),
                'error'    => (int) ($files['error'][$i] ?? UPLOAD_ERR_NO_FILE),
                'size'     => (int) ($files['size'][$i] ?? 0),
            ];
        }
    } else {
        $normalized[] = [
            'name'     => (string) $files['name'],
            'type'     => (string) ($files['type'] ?? ''),
            'tmp_name' => (string) ($files['tmp_name'] ?? ''),
            'error'    => (int) ($files['error'] ?? UPLOAD_ERR_NO_FILE),
            'size'     => (int) ($files['size'] ?? 0),
        ];
    }
    return $normalized;
}
