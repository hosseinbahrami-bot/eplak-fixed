<?php
/* shared/media.php — موتور مشترک آپلود و نگهداری «رسانه» کاربران (عکس و فیلم)
   ============================================================================
   چرا این فایل ساخته شد؟
   پیش از این، اپ هیچ‌جا فایل کاربر را واقعاً آپلود نمی‌کرد؛ فقط نام فایل در
   حافظه‌ی مرورگر ذخیره می‌شد و با بستن مرورگر از بین می‌رفت (و در WebView
   اندروید هم انتخاب فایل اصلاً کار نمی‌کرد). این موتور مسئولیت‌های زیر را
   به‌صورت واحد بر دوش می‌گیرد:

   ۱) اعتبارسنجی فایل با «امضای بایتی» (magic bytes) — نه پسوند و نه هدر
      Content-Type‎ که هر دو از سمت کاربر قابل جعل هستند.
   ۲) ذخیره‌سازی با نام تصادفی ۳۲ کاراکتری در uploads/media/YYYY/MM
      (بدون هیچ داده‌ی قابل حدس مثل شماره موبایل یا شناسه گزارش).
   ۳) ثبت رکورد در جدول media و اتصال آن به کاربر/گزارش.
   ۴) بستن اجرای PHP در پوشه‌ی آپلود (.htaccess) + nosniff + سرو با MIME
      صحیح، برای جلوگیری از Stored-XSS و اجرای کد.
   ۵) تحویل فایل با پشتیبانی از HTTP Range (پخش/جابه‌جایی فیلم در مرورگر).

   نکته‌ی مهم: این فایل عمداً به shared/bootstrap.php وابسته نیست تا هم در
   CLI (تست‌ها) و هم در اندپوینت‌ها به‌سادگی قابل استفاده باشد.
*/

if (!defined('EPLAK_MEDIA_LIB')) {
    define('EPLAK_MEDIA_LIB', true);
}

class EplakMediaError extends RuntimeException
{
    /** @var int */
    private $statusCode;

    public function __construct(string $message, int $statusCode = 400)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   تنظیمات
   ───────────────────────────────────────────────────────────────────────────── */

/** خواندن تنظیمات رسانه از shared/config.php (کلید media) + مقادیر پیش‌فرض */
function eplakMediaConfig(): array
{
    static $cfg = null;
    if (is_array($cfg)) {
        return $cfg;
    }

    $fileCfg = [];
    $cfgPath = __DIR__ . '/config.php';
    if (is_file($cfgPath)) {
        $loaded = include $cfgPath;
        if (is_array($loaded)) {
            $fileCfg = $loaded;
        }
    }
    $media = (isset($fileCfg['media']) && is_array($fileCfg['media'])) ? $fileCfg['media'] : [];
    $root  = defined('EPLAK_ROOT') ? EPLAK_ROOT : dirname(__DIR__);

    $cfg = [
        /* حداکثر حجم فایل‌ها (بایت) — قابل تغییر در shared/config.php */
        'max_image_bytes'   => (int) ($media['max_image_bytes'] ?? 12 * 1024 * 1024),
        'max_video_bytes'   => (int) ($media['max_video_bytes'] ?? 96 * 1024 * 1024),
        /* حداکثر تعداد رسانه برای هر گزارش/تیکت */
        'max_count'         => (int) ($media['max_count'] ?? 6),
        /* حداکثر طول ویدیو (ثانیه) — کنترل سمت کلاینت + سقف سخت سمت سرور */
        'max_video_seconds' => (int) ($media['max_video_seconds'] ?? 90),
        /* سقف تعداد آپلود در ساعت برای هر شماره (ضد سوءاستفاده) */
        'hourly_limit'      => (int) ($media['hourly_limit'] ?? 120),
        /* پوشه‌ی فیزیکی ذخیره‌سازی */
        'dir'               => (string) ($media['dir'] ?? $root . '/uploads/media'),
        /* اگر پوشه‌ی آپلود مستقیماً از وب در دسترس نیست، false بگذارید تا
           فایل‌ها از طریق api/media.php?action=file&t=TOKEN سرو شوند */
        'public'            => array_key_exists('public', $media) ? (bool) $media['public'] : true,
        /* آدرس پایه‌ی عمومی فایل‌ها (اختیاری؛ مثلاً https://eplak.ir/uploads/media) */
        'public_url'        => rtrim((string) ($media['public_url'] ?? ''), '/'),
        /* بازنویسی تصویرهای بزرگ سمت کلاینت (فقط راهنما برای اپ) */
        'client_max_dim'    => (int) ($media['client_max_dim'] ?? 1920),
        'client_quality'    => (float) ($media['client_quality'] ?? 0.82),
    ];

    return $cfg;
}

/** تبدیل مقدارهای ini مثل 8M/512K به بایت (برای پیام‌های دقیق خطا) */
function eplakMediaIniBytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return 0;   // بدون سقف
    }
    $unit = strtolower(substr($value, -1));
    $number = (float) $value;
    switch ($unit) {
        case 'g':
            $number *= 1024 * 1024 * 1024;
            break;
        case 'm':
            $number *= 1024 * 1024;
            break;
        case 'k':
            $number *= 1024;
            break;
    }
    return (int) $number;
}

/** سقف‌های واقعی سرور برای بارگذاری فایل (upload_max_filesize / post_max_size) */
function eplakMediaServerLimits(): array
{
    $upload = eplakMediaIniBytes((string) ini_get('upload_max_filesize'));
    $post   = eplakMediaIniBytes((string) ini_get('post_max_size'));
    return [
        'upload_max_filesize' => $upload,
        'post_max_size'       => $post,
        'max_file_uploads'    => (int) ini_get('max_file_uploads') ?: 20,
        'file_uploads'        => (bool) ini_get('file_uploads'),
        /* بزرگ‌ترین فایلی که عملاً قابل ارسال است */
        'effective_max'       => ($post > 0 && $upload > 0) ? min($post, $upload) : max($post, $upload),
    ];
}

/** فهرست MIME های مجاز → نوع (image/video) و پسوند ذخیره‌سازی */
function eplakMediaMimeTable(): array
{
    return [
        'image/jpeg'      => ['image', 'jpg'],
        'image/png'       => ['image', 'png'],
        'image/webp'      => ['image', 'webp'],
        'image/gif'       => ['image', 'gif'],
        'image/heic'      => ['image', 'heic'],
        'image/heif'      => ['image', 'heif'],
        'image/avif'      => ['image', 'avif'],
        'video/mp4'       => ['video', 'mp4'],
        'video/quicktime' => ['video', 'mov'],
        'video/webm'      => ['video', 'webm'],
        'video/3gpp'      => ['video', '3gp'],
        'video/mpeg'      => ['video', 'mpg'],
    ];
}

function eplakMediaKindForMime(string $mime): string
{
    $table = eplakMediaMimeTable();
    return isset($table[$mime]) ? $table[$mime][0] : '';
}

function eplakMediaExtensionForMime(string $mime): string
{
    $table = eplakMediaMimeTable();
    return isset($table[$mime]) ? $table[$mime][1] : '';
}

/* ─────────────────────────────────────────────────────────────────────────────
   تشخیص نوع واقعی فایل (امضای بایتی)
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * تشخیص MIME واقعی از روی محتوای فایل — بدون نیاز به اکستنشن fileinfo.
 * اگر fileinfo موجود و قاطع باشد، نظر آن هم در نظر گرفته می‌شود.
 *
 * @return string MIME شناسایی‌شده یا '' در صورت ناشناخته بودن
 */
function eplakMediaSniffMime(string $path): string
{
    $fp = @fopen($path, 'rb');
    if (!$fp) {
        return '';
    }
    $head = (string) fread($fp, 512);
    fclose($fp);
    if ($head === '') {
        return '';
    }

    $sniffed = eplakMediaSniffMimeFromBytes($head);
    if ($sniffed === '') {
        return '';
    }

    /* تایید دوم با fileinfo (اختیاری — روی بعضی هاست‌ها نصب نیست) */
    if (function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $detected = @finfo_file($finfo, $path);
            @finfo_close($finfo);
            if (is_string($detected) && $detected !== '' && $detected !== 'application/octet-stream') {
                /* اگر fileinfo چیز دیگری بگوید (مثلاً متن/PHP زیر پسوند عکس)،
                   فقط وقتی قبول می‌کنیم که در فهرست مجاز باشد و با امضا
                   هم‌خوانی داشته باشد؛ در غیر این صورت نظر fileinfo ارجح است
                   تا فایل مشکوک رد شود. */
                $table = eplakMediaMimeTable();
                if (isset($table[$detected]) && $detected === $sniffed) {
                    return $detected;
                }
                if (!isset($table[$detected])) {
                    /* fileinfo نوع دیگری می‌شناسد؛ امضا را باور نمی‌کنیم */
                    return '';
                }
            }
        }
    }

    return $sniffed;
}

/** تشخیص MIME از روی بایت‌های ابتدای فایل (قابل تست مستقل) */
function eplakMediaSniffMimeFromBytes(string $head): string
{
    $len = strlen($head);
    if ($len < 12) {
        return '';
    }

    /* JPEG */
    if (substr($head, 0, 3) === "\xFF\xD8\xFF") {
        return 'image/jpeg';
    }
    /* PNG */
    if (substr($head, 0, 8) === "\x89PNG\r\n\x1a\n") {
        return 'image/png';
    }
    /* GIF */
    if (substr($head, 0, 4) === 'GIF8') {
        return 'image/gif';
    }
    /* WEBP (RIFF....WEBP) */
    if (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    /* EBML: WebM / Matroska */
    if (substr($head, 0, 4) === "\x1A\x45\xDF\xA3") {
        return (stripos($head, 'webm') !== false) ? 'video/webm' : '';
    }
    /* MPEG-PS / MPEG-ES */
    if (substr($head, 0, 4) === "\x00\x00\x01\xBA" || substr($head, 0, 4) === "\x00\x00\x01\xB3") {
        return 'video/mpeg';
    }
    /* خانواده‌ی ISO-BMFF: mp4 / mov / 3gp / heic / avif … */
    if (substr($head, 4, 4) === 'ftyp') {
        $brand = strtolower(substr($head, 8, 4));
        if (in_array($brand, ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'], true)) {
            return 'image/heic';
        }
        if ($brand === 'avif' || $brand === 'avis') {
            return 'image/avif';
        }
        if ($brand === 'qt  ') {
            return 'video/quicktime';
        }
        if (strpos($brand, '3gp') === 0 || strpos($brand, '3g2') === 0) {
            return 'video/3gpp';
        }
        if (in_array($brand, ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'mmp4', 'm4v ', 'm4a ', 'mp71', 'MSNV'], true)) {
            return 'video/mp4';
        }
        /* برند ناشناخته ولی ساختار ISO-BMFF است: بدترین حالت را فرض می‌کنیم */
        return '';
    }

    return '';
}

/* ─────────────────────────────────────────────────────────────────────────────
   پوشه‌ی ذخیره‌سازی
   ───────────────────────────────────────────────────────────────────────────── */

/** مسیر ریشه‌ی آپلود + ساخت پوشه و فایل‌های امنیتی در صورت نیاز */
function eplakMediaRootDir(): string
{
    $cfg = eplakMediaConfig();
    $dir = rtrim($cfg['dir'], "/\\");
    if ($dir === '') {
        $dir = (defined('EPLAK_ROOT') ? EPLAK_ROOT : dirname(__DIR__)) . '/uploads/media';
    }
    return $dir;
}

function eplakMediaEnsureRoot(): string
{
    $dir = eplakMediaRootDir();
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new EplakMediaError('پوشه‌ی ذخیره‌سازی رسانه روی سرور قابل ساخت نیست: ' . $dir, 500);
        }
    }
    if (!is_writable($dir)) {
        throw new EplakMediaError('پوشه‌ی ذخیره‌سازی رسانه روی سرور قابل نوشتن نیست (سطح دسترسی را بررسی کنید).', 500);
    }

    /* اجرای PHP/اسکریپت در پوشه‌ی رسانه‌ها ممنوع؛ همچنین nosniff برای جلوگیری
       از تفسیر محتوای آپلودی به‌عنوان HTML. (در Nginx این فایل بی‌اثر است و
       باید با location ~* \.(php|phtml)$ بلوک شود — در مستندات توضیح داده شده.) */
    $htaccess = $dir . '/.htaccess';
    if (!is_file($htaccess)) {
        $rules = "# اجرای هر نوع اسکریپت در پوشه‌ی رسانه‌ها مسدود است\n"
            . "RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phps .cgi .pl .py .sh .shtml\n"
            . "RemoveType .php .phtml .phps\n"
            . "AddType text/plain .php .phtml .phps .cgi .pl .py .sh\n"
            . "<IfModule mod_headers.c>\n"
            . "  Header set X-Content-Type-Options \"nosniff\"\n"
            . "  Header set Content-Security-Policy \"default-src 'none'; img-src 'self'; media-src 'self'; sandbox\"\n"
            . "</IfModule>\n"
            . "<FilesMatch \"\\.(php|phtml|phps|php[0-9]|cgi|pl|py|sh)$\">\n"
            . "  <IfModule mod_authz_core.c>\n"
            . "    Require all denied\n"
            . "  </IfModule>\n"
            . "  <IfModule !mod_authz_core.c>\n"
            . "    Deny from all\n"
            . "  </IfModule>\n"
            . "</FilesMatch>\n";
        @file_put_contents($htaccess, $rules);
    }
    $index = $dir . '/index.html';
    if (!is_file($index)) {
        @file_put_contents($index, "<!doctype html><meta charset=\"utf-8\"><title>—</title>\n");
    }

    return $dir;
}

/** مسیر فیزیکی یک رکورد رسانه با کنترل «فرار از پوشه» (Path Traversal) */
function eplakMediaAbsolutePath(array $row): string
{
    $root = eplakMediaRootDir();
    $rel  = str_replace('\\', '/', (string) ($row['rel_path'] ?? ''));
    if ($rel === '' && !empty($row['stored_name'])) {
        $rel = (string) $row['stored_name'];
    }
    $rel = ltrim($rel, '/');
    if ($rel === '' || strpos($rel, '..') !== false) {
        return '';
    }
    return $root . '/' . $rel;
}

/* ─────────────────────────────────────────────────────────────────────────────
   آدرس عمومی فایل‌ها
   ───────────────────────────────────────────────────────────────────────────── */

/** آدرس پایه‌ی وب‌سایت بر اساس درخواست جاری (پشتیبانی از پروکسی/HTTPS) */
function eplakMediaSiteBase(): string
{
    $scheme = 'http';
    if (function_exists('eplakIsHttpsRequest')) {
        $scheme = eplakIsHttpsRequest() ? 'https' : 'http';
    } elseif (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        $scheme = 'https';
    }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? ''));
    if ($host === '') {
        return '';
    }
    return $scheme . '://' . $host;
}

/** پوشه‌ی اپ نسبت به ریشه‌ی وب — از مسیر اسکریپت جاری محاسبه می‌شود */
function eplakMediaAppDir(): string
{
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    $dir = str_replace('\\', '/', dirname($script));            // /eplak-fixed/api
    if (preg_match('#/api$#', $dir)) {
        $dir = substr($dir, 0, -4);                              // /eplak-fixed
    }
    return rtrim($dir, '/');
}

/** مسیر عمومی پوشه‌ی رسانه‌ها (نسبی به ریشه‌ی دامنه) */
function eplakMediaPublicPath(array $row): string
{
    $cfg = eplakMediaConfig();
    $rel = str_replace('\\', '/', (string) ($row['rel_path'] ?? ''));
    if ($cfg['public_url'] !== '') {
        return $cfg['public_url'] . '/' . $rel;
    }
    if (!$cfg['public']) {
        return eplakMediaAppDir() . '/api/media.php?action=file&t=' . urlencode((string) ($row['token'] ?? ''));
    }
    return eplakMediaAppDir() . '/uploads/media/' . $rel;
}

/** آدرس کامل (با دامنه) برای نمایش در اپ/پنل مدیریت */
function eplakMediaUrlForRow(array $row): string
{
    $path = eplakMediaPublicPath($row);
    if (preg_match('#^https?://#i', $path)) {
        return $path;
    }
    return eplakMediaSiteBase() . $path;
}

/** تبدیل رکورد دیتابیس به ساختار عمومی (کوتاه و امن برای JSON) */
function eplakMediaRowToPublic(array $row): array
{
    return [
        'id'          => (int) ($row['id'] ?? 0),
        'kind'        => (string) ($row['kind'] ?? 'image'),
        'mime'        => (string) ($row['mime'] ?? ''),
        'name'        => (string) ($row['original_name'] ?? ''),
        'size'        => (int) ($row['size_bytes'] ?? 0),
        'width'       => isset($row['width']) ? (int) $row['width'] : null,
        'height'      => isset($row['height']) ? (int) $row['height'] : null,
        'duration_ms' => isset($row['duration_ms']) ? (int) $row['duration_ms'] : null,
        'source'      => (string) ($row['source'] ?? ''),
        'report_id'   => isset($row['report_id']) ? (int) $row['report_id'] : null,
        'created_at'  => (string) ($row['created_at'] ?? ''),
        'url'         => eplakMediaUrlForRow($row),
        'path'        => eplakMediaPublicPath($row),
        'token'       => (string) ($row['token'] ?? ''),
    ];
}

/* ─────────────────────────────────────────────────────────────────────────────
   اعتبارسنجی و ذخیره‌سازی
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * اعتبارسنجی یک فایل آپلودی ($_FILES[...] یا مسیر امن داخلی).
 *
 * @return array اطلاعات تاییدشده‌ی فایل
 * @throws EplakMediaError
 */
function eplakMediaValidateUpload(string $tmpPath, int $size, string $originalName, string $declaredMime = '', string $source = ''): array
{
    $cfg = eplakMediaConfig();

    if ($tmpPath === '' || !is_file($tmpPath)) {
        throw new EplakMediaError('فایلی برای بارگذاری دریافت نشد.');
    }
    if ($size <= 0) {
        $size = (int) @filesize($tmpPath);
    }
    if ($size <= 0) {
        throw new EplakMediaError('فایل خالی است و قابل بارگذاری نیست.');
    }

    $mime = eplakMediaSniffMime($tmpPath);
    if ($mime === '') {
        throw new EplakMediaError('نوع فایل قابل تشخیص نیست. فقط عکس (JPG/PNG/WEBP/HEIC) یا فیلم (MP4/MOV/WEBM/3GP) مجاز است.');
    }
    $kind = eplakMediaKindForMime($mime);
    if ($kind === '') {
        throw new EplakMediaError('این نوع فایل پشتیبانی نمی‌شود.');
    }

    $limit = $kind === 'image' ? $cfg['max_image_bytes'] : $cfg['max_video_bytes'];
    if ($size > $limit) {
        $limitMb = round($limit / (1024 * 1024));
        $label = $kind === 'image' ? 'حجم عکس' : 'حجم فیلم';
        throw new EplakMediaError($label . ' بیش از حد مجاز است (حداکثر ' . $limitMb . ' مگابایت).');
    }

    /* تصاویر: جلوگیری از فایل‌هایی که محتوای HTML/JS را کنار بایت‌های تصویر
       پنهان می‌کنند (defense in depth در برابر Stored-XSS). */
    if ($kind === 'image') {
        $fp = @fopen($tmpPath, 'rb');
        if ($fp) {
            $head = (string) fread($fp, 2048);
            fclose($fp);
            if (preg_match('/<\s*script|<\?php|<!doctype\s+html|<svg/i', $head)) {
                throw new EplakMediaError('محتوای فایل تصویری نامعتبر است.');
            }
        }
    }

    $width = null;
    $height = null;
    if ($kind === 'image' && function_exists('getimagesize')) {
        $info = @getimagesize($tmpPath);
        if (is_array($info) && !empty($info[0]) && !empty($info[1])) {
            $width  = (int) $info[0];
            $height = (int) $info[1];
            if ($width > 12000 || $height > 12000) {
                throw new EplakMediaError('ابعاد تصویر بیش از حد بزرگ است.');
            }
        }
    }

    $safeName = eplakMediaSafeOriginalName($originalName);

    return [
        'tmp'      => $tmpPath,
        'size'     => $size,
        'mime'     => $mime,
        'kind'     => $kind,
        'ext'      => eplakMediaExtensionForMime($mime),
        'name'     => $safeName,
        'source'   => in_array($source, ['camera', 'gallery', 'upload', 'avatar'], true) ? $source : 'upload',
        'width'    => $width,
        'height'   => $height,
    ];
}

/** پاک‌سازی نام اصلی فایل (فقط برای نمایش/دانلود) */
function eplakMediaSafeOriginalName(string $name): string
{
    $name = str_replace(['\\', '/', "\0"], '', $name);
    $name = preg_replace('/[\x00-\x1F\x7F]+/u', '', $name);
    if (!is_string($name) || trim($name) === '') {
        return 'media';
    }
    $name = trim($name);
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 180, 'UTF-8');
    } else {
        $name = substr($name, 0, 180);
    }
    return $name;
}

/**
 * انتقال فایل تاییدشده به پوشه‌ی رسانه + ثبت رکورد در دیتابیس.
 *
 * @param array $info خروجی eplakMediaValidateUpload (اگر ندهید، خودش اعتبارسنجی می‌کند)
 * @throws EplakMediaError
 */
function eplakMediaStoreFile(PDO $pdo, string $tmpPath, array $meta, ?array $info = null, bool $trustedPath = false): array
{
    $cfg = eplakMediaConfig();

    if ($info === null) {
        $info = eplakMediaValidateUpload(
            $tmpPath,
            (int) @filesize($tmpPath),
            (string) ($meta['original_name'] ?? ''),
            (string) ($meta['mime'] ?? ''),
            (string) ($meta['source'] ?? 'upload')
        );
    }

    /* مسیر باید یک «آپلود واقعی مرورگر» باشد. تنها استثنا: هارنس تست که
       خودش ثابت EPLAK_MEDIA_CLI_TEST را تعریف می‌کند (در مسیرهای واقعیِ
       وب هرگز تعریف نمی‌شود). */
    $trusted = $trustedPath
        || (defined('EPLAK_MEDIA_CLI_TEST') && EPLAK_MEDIA_CLI_TEST === true);
    if (!$trusted && !is_uploaded_file($tmpPath)) {
        throw new EplakMediaError('مسیر فایل آپلودی معتبر نیست.', 400);
    }

    $root = eplakMediaEnsureRoot();
    $sub  = date('Y/m');
    $dir  = $root . '/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new EplakMediaError('ساخت پوشه‌ی رسانه ممکن نشد.', 500);
    }

    $storedName = bin2hex(random_bytes(16)) . '.' . $info['ext'];
    $target     = $dir . '/' . $storedName;

    $moved = $trusted ? @rename($tmpPath, $target) : @move_uploaded_file($tmpPath, $target);
    if (!$moved) {
        /* در بعضی هاست‌ها move_uploaded_file روی فایل‌سیستم‌های عجیب شکست می‌خورد
           ولی copy+unlink کار می‌کند؛ اگر فایل واقعاً آپلودی است، این مسیر امن است. */
        if (is_uploaded_file($tmpPath) && @copy($tmpPath, $target)) {
            @unlink($tmpPath);
        } else {
            throw new EplakMediaError('ذخیره‌سازی فایل روی سرور ممکن نشد.', 500);
        }
    }
    @chmod($target, 0644);

    $row = [
        'user_phone'    => (string) ($meta['phone'] ?? ''),
        'report_id'     => isset($meta['report_id']) && $meta['report_id'] !== null ? (int) $meta['report_id'] : null,
        'kind'          => $info['kind'],
        'mime'          => $info['mime'],
        'original_name' => $info['name'],
        'stored_name'   => $storedName,
        'rel_path'      => $sub . '/' . $storedName,
        'size_bytes'    => (int) $info['size'],
        'width'         => $info['width'],
        'height'        => $info['height'],
        'duration_ms'   => isset($meta['duration_ms']) ? (int) $meta['duration_ms'] : null,
        'sha256'        => @hash_file('sha256', $target) ?: null,
        'source'        => $info['source'],
        'token'         => bin2hex(random_bytes(16)),
        'created_at'    => date('Y-m-d H:i:s'),
    ];

    try {
        $sql = 'INSERT INTO media (user_phone, report_id, kind, mime, original_name, stored_name, rel_path, size_bytes, width, height, duration_ms, sha256, source, token, created_at)
                VALUES (:user_phone, :report_id, :kind, :mime, :original_name, :stored_name, :rel_path, :size_bytes, :width, :height, :duration_ms, :sha256, :source, :token, :created_at)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':user_phone'    => $row['user_phone'],
            ':report_id'     => $row['report_id'],
            ':kind'          => $row['kind'],
            ':mime'          => $row['mime'],
            ':original_name' => $row['original_name'],
            ':stored_name'   => $row['stored_name'],
            ':rel_path'      => $row['rel_path'],
            ':size_bytes'    => $row['size_bytes'],
            ':width'         => $row['width'],
            ':height'        => $row['height'],
            ':duration_ms'   => $row['duration_ms'],
            ':sha256'        => $row['sha256'],
            ':source'        => $row['source'],
            ':token'         => $row['token'],
            ':created_at'    => $row['created_at'],
        ]);
        $row['id'] = (int) $pdo->lastInsertId();
    } catch (Throwable $e) {
        /* اگر ثبت در دیتابیس شکست خورد، فایل بی‌صاحب نماند */
        @unlink($target);
        throw $e;
    }

    return $row;
}

/* ─────────────────────────────────────────────────────────────────────────────
   کار با دیتابیس
   ───────────────────────────────────────────────────────────────────────────── */

function eplakMediaIsSqlite(PDO $pdo): bool
{
    if (function_exists('eplakIsSqlite')) {
        return eplakIsSqlite($pdo);
    }
    try {
        return strtolower((string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite';
    } catch (Throwable $e) {
        return false;
    }
}

/** سقف آپلود در ساعت برای هر شماره (کنترل سوءاستفاده) */
function eplakMediaHourlyUsage(PDO $pdo, string $phone): int
{
    if ($phone === '') {
        return 0;
    }
    $sql = eplakMediaIsSqlite($pdo)
        ? "SELECT COUNT(*) FROM media WHERE user_phone = :phone AND created_at > datetime('now','-1 hour')"
        : 'SELECT COUNT(*) FROM media WHERE user_phone = :phone AND created_at > (NOW() - INTERVAL 1 HOUR)';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':phone' => $phone]);
    return (int) $stmt->fetchColumn();
}

function eplakMediaCountForReport(PDO $pdo, int $reportId): int
{
    if ($reportId <= 0) {
        return 0;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM media WHERE report_id = :rid');
    $stmt->execute([':rid' => $reportId]);
    return (int) $stmt->fetchColumn();
}

function eplakMediaFetchRow(PDO $pdo, int $id): ?array
{
    if ($id <= 0) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM media WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function eplakMediaFetchRowByToken(PDO $pdo, string $token): ?array
{
    $token = preg_replace('/[^0-9a-f]/i', '', $token);
    if ($token === '' || strlen($token) < 16) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM media WHERE token = :token LIMIT 1');
    $stmt->execute([':token' => $token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/** رسانه‌های یک گزارش (به ترتیب زمان آپلود) */
function eplakMediaRowsForReport(PDO $pdo, int $reportId): array
{
    if ($reportId <= 0) {
        return [];
    }
    $stmt = $pdo->prepare('SELECT * FROM media WHERE report_id = :rid ORDER BY id ASC');
    $stmt->execute([':rid' => $reportId]);
    return $stmt->fetchAll() ?: [];
}

/** رسانه‌های یک کاربر (اختیاری: محدود به یک گزارش) */
function eplakMediaRowsForUser(PDO $pdo, string $phone, ?int $reportId = null, int $limit = 100): array
{
    if ($phone === '') {
        return [];
    }
    $limit = max(1, min(300, $limit));
    if ($reportId !== null && $reportId > 0) {
        $stmt = $pdo->prepare('SELECT * FROM media WHERE user_phone = :phone AND report_id = :rid ORDER BY id ASC LIMIT ' . $limit);
        $stmt->execute([':phone' => $phone, ':rid' => $reportId]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM media WHERE user_phone = :phone ORDER BY id DESC LIMIT ' . $limit);
        $stmt->execute([':phone' => $phone]);
    }
    return $stmt->fetchAll() ?: [];
}

/**
 * اتصال رسانه‌های از قبل آپلودشده به یک گزارش (مدل دو مرحله‌ای:
 * اول فایل آپلود می‌شود، بعد گزارش ساخته می‌شود و شناسه‌ی گزارش می‌آید).
 */
function eplakMediaAttachToReport(PDO $pdo, array $ids, int $reportId, string $phone): int
{
    if ($reportId <= 0 || $phone === '' || !$ids) {
        return 0;
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), function ($v) { return $v > 0; })));
    if (!$ids) {
        return 0;
    }
    $cfg = eplakMediaConfig();
    $existing = eplakMediaCountForReport($pdo, $reportId);
    if ($existing >= $cfg['max_count']) {
        return 0;
    }
    $ids = array_slice($ids, 0, max(0, $cfg['max_count'] - $existing));

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = 'UPDATE media SET report_id = ? WHERE id IN (' . $placeholders . ') AND user_phone = ?';
    $stmt = $pdo->prepare($sql);
    $params = array_merge([$reportId], $ids, [$phone]);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/** حذف یک رسانه (فقط مالک) + حذف فایل فیزیکی */
function eplakMediaDeleteForUser(PDO $pdo, int $id, string $phone): bool
{
    if ($id <= 0 || $phone === '') {
        return false;
    }
    $stmt = $pdo->prepare('SELECT * FROM media WHERE id = :id AND user_phone = :phone LIMIT 1');
    $stmt->execute([':id' => $id, ':phone' => $phone]);
    $row = $stmt->fetch();
    if (!$row) {
        return false;
    }
    $del = $pdo->prepare('DELETE FROM media WHERE id = :id AND user_phone = :phone');
    $del->execute([':id' => $id, ':phone' => $phone]);
    eplakMediaUnlinkRow($row);
    return $del->rowCount() > 0;
}

/** حذف همه‌ی رسانه‌های یک گزارش (هنگام حذف گزارش) */
function eplakMediaDeleteForReport(PDO $pdo, int $reportId): int
{
    if ($reportId <= 0) {
        return 0;
    }
    $rows = eplakMediaRowsForReport($pdo, $reportId);
    if (!$rows) {
        return 0;
    }
    $del = $pdo->prepare('DELETE FROM media WHERE report_id = :rid');
    $del->execute([':rid' => $reportId]);
    foreach ($rows as $row) {
        eplakMediaUnlinkRow($row);
    }
    return count($rows);
}

function eplakMediaUnlinkRow(array $row): void
{
    $path = eplakMediaAbsolutePath($row);
    if ($path !== '' && is_file($path)) {
        @unlink($path);
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   تحویل فایل (لینک توکن‌دار) با پشتیبانی HTTP Range
   ───────────────────────────────────────────────────────────────────────────── */

function eplakMediaStreamFile(array $row, bool $download = false): void
{
    $path = eplakMediaAbsolutePath($row);
    if ($path === '' || !is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'file not found';
        exit;
    }

    $size = (int) filesize($path);
    $mime = (string) ($row['mime'] ?? 'application/octet-stream');
    if (eplakMediaKindForMime($mime) === '') {
        $mime = 'application/octet-stream';
    }

    $start   = 0;
    $end     = $size - 1;
    $partial = false;

    if (!empty($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/i', (string) $_SERVER['HTTP_RANGE'], $m)) {
        $rangeStart = $m[1] === '' ? null : (int) $m[1];
        $rangeEnd   = $m[2] === '' ? null : (int) $m[2];
        if ($rangeStart === null && $rangeEnd !== null) {
            /* suffix range: آخرین N بایت */
            $start = max(0, $size - $rangeEnd);
            $end   = $size - 1;
        } else {
            $start = (int) $rangeStart;
            $end   = $rangeEnd === null ? $size - 1 : min($rangeEnd, $size - 1);
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header('Content-Range: bytes */' . $size);
            header('Accept-Ranges: bytes');
            exit;
        }
        $partial = true;
    }

    $length = $end - $start + 1;

    while (ob_get_level() > 0) {
        @ob_end_clean();
    }

    if ($partial) {
        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
    } else {
        http_response_code(200);
    }
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $length);
    header('Accept-Ranges: bytes');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=86400');
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . eplakMediaAsciiFileName($row) . '"');

    $fp = @fopen($path, 'rb');
    if (!$fp) {
        exit;
    }
    @fseek($fp, $start);
    $remaining = $length;
    while ($remaining > 0 && !feof($fp)) {
        $chunk = (string) fread($fp, (int) min(262144, $remaining));
        if ($chunk === '') {
            break;
        }
        $remaining -= strlen($chunk);
        echo $chunk;
        @flush();
    }
    fclose($fp);
    exit;
}

/** نام فایل ایمن برای هدر Content-Disposition (ASCII) */
function eplakMediaAsciiFileName(array $row): string
{
    $ext  = eplakMediaExtensionForMime((string) ($row['mime'] ?? ''));
    $base = preg_replace('/[^A-Za-z0-9_\-\.]/', '', (string) ($row['stored_name'] ?? 'media'));
    if ($base === '') {
        $base = 'media' . ($ext !== '' ? '.' . $ext : '');
    }
    return $base;
}

/** فایل رسانه‌ی یک کاربر را حذف و پاک‌سازی رکوردهای بدون فایل را انجام می‌دهد */
function eplakMediaPruneMissingFiles(PDO $pdo, int $limit = 200): int
{
    $stmt = $pdo->prepare('SELECT * FROM media ORDER BY id DESC LIMIT ' . max(1, $limit));
    $stmt->execute();
    $rows = $stmt->fetchAll() ?: [];
    $removed = 0;
    foreach ($rows as $row) {
        $path = eplakMediaAbsolutePath($row);
        if ($path === '' || !is_file($path)) {
            $del = $pdo->prepare('DELETE FROM media WHERE id = :id');
            $del->execute([':id' => (int) $row['id']]);
            $removed++;
        }
    }
    return $removed;
}
