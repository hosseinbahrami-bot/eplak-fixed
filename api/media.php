<?php
/* api/media.php — آپلود و مدیریت عکس/فیلم کاربران (گزارش‌های مردمی و پروفایل)
   ============================================================================
   این اندپوینت «تنها مسیر رسمی» ورود فایل به سامانه است.

   مسیرها:
     POST   (multipart/form-data)  fields: phone, report_id?, source?, duration_ms?
            file(s):  file  یا  files[]            → آپلود یک/چند رسانه
     POST   ?action=attach  {phone, report_id, ids[]}  → اتصال رسانه‌ها به گزارش
     GET    ?action=list&phone=…&report_id=…           → فهرست رسانه‌های کاربر/گزارش
     GET    ?action=config                             → محدودیت‌ها برای نمایش در اپ
     GET    ?action=file&t=TOKEN[&download=1]          → تحویل فایل (با Range)
     DELETE|POST ?action=delete&id=…&phone=…           → حذف رسانه (فقط مالک)

   نکته‌ی امنیتی: مالکیت هر رسانه با شماره‌ی موبایل (تنها شناسه‌ی اپ) بررسی
   می‌شود و نوع فایل با «امضای بایتی» تشخیص داده می‌شود؛ نه پسوند و نه
   هدر مرورگر قابل اعتماد نیستند.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/media.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$query  = $_GET;

/* ── تحویل فایل: این مسیر هدر JSON نمی‌خواهد ─────────────────────────── */
$action = (string) ($query['action'] ?? '');
if ($method === 'GET' && ($action === 'file' || $action === 'download')) {
    /* CORS برای پخش ویدیو در وب‌ویو/مرورگر */
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Range, Content-Type');
    header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

    $token = (string) ($query['t'] ?? ($query['token'] ?? ''));
    if ($token === '') {
        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'missing token';
        exit;
    }
    try {
        $row = eplakMediaFetchRowByToken($pdo, $token);
        if (!$row) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'not found';
            exit;
        }
        eplakMediaStreamFile($row, $action === 'download' || !empty($query['download']));
    } catch (Throwable $e) {
        error_log('[eplak-media:file] ' . $e->getMessage());
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'server error';
        exit;
    }
}

eplakApiHeaders();

/* ── تنظیمات/محدودیت‌ها برای کلاینت ──────────────────────────────────── */
if ($method === 'GET' && $action === 'config') {
    $cfg = eplakMediaConfig();
    $server = eplakMediaServerLimits();
    eplakJson([
        'success' => true,
        'limits'  => [
            'max_image_bytes'   => min($cfg['max_image_bytes'], $server['effective_max'] > 0 ? $server['effective_max'] : $cfg['max_image_bytes']),
            'max_video_bytes'   => min($cfg['max_video_bytes'], $server['effective_max'] > 0 ? $server['effective_max'] : $cfg['max_video_bytes']),
            'max_count'         => $cfg['max_count'],
            'max_video_seconds' => $cfg['max_video_seconds'],
            'client_max_dim'    => $cfg['client_max_dim'],
            'client_quality'    => $cfg['client_quality'],
        ],
        'server'  => [
            'upload_max_filesize' => $server['upload_max_filesize'],
            'post_max_size'       => $server['post_max_size'],
            'file_uploads'        => $server['file_uploads'],
        ],
    ]);
}

/* ── فهرست رسانه‌ها ───────────────────────────────────────────────────── */
if ($method === 'GET' && ($action === 'list' || $action === '')) {
    $phone = eplakNormalizePhone($query['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    $reportId = isset($query['report_id']) && $query['report_id'] !== '' ? (int) $query['report_id'] : null;
    try {
        $rows = eplakMediaRowsForUser($pdo, $phone, $reportId, (int) ($query['limit'] ?? 100));
        eplakJson([
            'success' => true,
            'count'   => count($rows),
            'items'   => array_map('eplakMediaRowToPublic', $rows),
        ]);
    } catch (Throwable $e) {
        eplakServerError($e, 'media.list');
    }
}

/* ── حذف/اتصال: بدنه‌ی JSON یا (برای سازگاری) فرم‌انکد ────────────────── */
$input = eplakReadJsonBody();
if (!$input && !empty($_POST)) {
    $input = $_POST;
}
$isDelete = $method === 'DELETE'
    || (($query['action'] ?? '') === 'delete')
    || ((isset($input['action']) ? $input['action'] : '') === 'delete');

if ($isDelete) {
    $id = (int) ($query['id'] ?? ($input['id'] ?? 0));
    $phone = eplakNormalizePhone($query['phone'] ?? ($input['phone'] ?? ($input['userPhone'] ?? '')));
    if ($id <= 0) {
        eplakJsonError('شناسه‌ی رسانه نامعتبر است', 400);
    }
    if ($phone === '') {
        eplakJsonError('برای حذف رسانه، شماره‌ی مالک الزامی است', 400);
    }
    try {
        $ok = eplakMediaDeleteForUser($pdo, $id, $phone);
        if (!$ok) {
            eplakJson(['success' => false, 'error' => 'رسانه یافت نشد'], 404);
        }
        eplakJson(['success' => true, 'deleted_id' => $id]);
    } catch (Throwable $e) {
        eplakServerError($e, 'media.delete');
    }
}

/* ── اتصال رسانه‌های آپلودشده به گزارش ───────────────────────────────── */
if ($method === 'POST' && (($query['action'] ?? '') === 'attach' || ((isset($input['action']) ? $input['action'] : '') === 'attach'))) {
    $phone = eplakNormalizePhone($input['phone'] ?? ($input['userPhone'] ?? ''));
    $reportId = (int) ($input['report_id'] ?? 0);
    $ids = isset($input['ids']) && is_array($input['ids']) ? $input['ids'] : [];
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    if ($reportId <= 0) {
        eplakJsonError('شناسه‌ی گزارش نامعتبر است', 400);
    }
    try {
        /* گزارش باید متعلق به همین شماره باشد */
        $stmt = $pdo->prepare('SELECT id FROM reports WHERE id = :id AND user_phone = :phone LIMIT 1');
        $stmt->execute([':id' => $reportId, ':phone' => $phone]);
        if (!$stmt->fetch()) {
            eplakJsonError('گزارش یافت نشد', 404);
        }
        $attached = eplakMediaAttachToReport($pdo, $ids, $reportId, $phone);

        /* اگر شناسه‌ای در بدنه نبود، همه‌ی رسانه‌های بی‌گزارش همین کاربر را وصل کن
           (سناریوی آفلاین: فایل‌ها قبل از ساخته‌شدن گزارش آپلود شده‌اند) */
        if ($attached === 0 && !$ids) {
            $pending = $pdo->prepare('SELECT id FROM media WHERE user_phone = :phone AND report_id IS NULL ORDER BY id ASC LIMIT 20');
            $pending->execute([':phone' => $phone]);
            $ids = array_map('intval', array_column($pending->fetchAll() ?: [], 'id'));
            if ($ids) {
                $attached = eplakMediaAttachToReport($pdo, $ids, $reportId, $phone);
            }
        }

        eplakJson([
            'success'  => true,
            'attached' => $attached,
            'items'    => array_map('eplakMediaRowToPublic', eplakMediaRowsForReport($pdo, $reportId)),
        ]);
    } catch (Throwable $e) {
        eplakServerError($e, 'media.attach');
    }
}

if ($method !== 'POST') {
    eplakJsonError('Method not allowed', 405);
}

/* ── آپلود فایل‌ها ────────────────────────────────────────────────────── */
$phone = eplakNormalizePhone($_POST['phone'] ?? ($_POST['userPhone'] ?? ''));
if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}

$reportId = isset($_POST['report_id']) && $_POST['report_id'] !== '' ? (int) $_POST['report_id'] : null;
if ($reportId !== null && $reportId > 0) {
    /* بررسی مالکیت گزارش */
    $stmt = $pdo->prepare('SELECT id FROM reports WHERE id = :id AND user_phone = :phone LIMIT 1');
    $stmt->execute([':id' => $reportId, ':phone' => $phone]);
    if (!$stmt->fetch()) {
        eplakJsonError('گزارش یافت نشد', 404);
    }
} else {
    $reportId = null;
}

$source = (string) ($_POST['source'] ?? 'upload');
$durationMs = isset($_POST['duration_ms']) ? max(0, (int) $_POST['duration_ms']) : null;

/* جمع‌آوری فایل‌های ارسالی از هر دو قالب file و files[] */
$incoming = [];
foreach (['file', 'files', 'media'] as $field) {
    if (empty($_FILES[$field])) {
        continue;
    }
    $node = $_FILES[$field];
    if (is_array($node['name'])) {
        $count = count($node['name']);
        for ($i = 0; $i < $count; $i++) {
            $incoming[] = [
                'name'     => (string) $node['name'][$i],
                'type'     => (string) ($node['type'][$i] ?? ''),
                'tmp_name' => (string) ($node['tmp_name'][$i] ?? ''),
                'error'    => (int) ($node['error'][$i] ?? 4),
                'size'     => (int) ($node['size'][$i] ?? 0),
            ];
        }
    } else {
        $incoming[] = [
            'name'     => (string) $node['name'],
            'type'     => (string) $node['type'],
            'tmp_name' => (string) $node['tmp_name'],
            'error'    => (int) $node['error'],
            'size'     => (int) $node['size'],
        ];
    }
}

if (!$incoming) {
    /* اگر بدنه‌ی درخواست از post_max_size بزرگ‌تر بوده، PHP فایل‌ها را
       خالی می‌کند و $_FILES خالی می‌ماند — این حالت باید پیام دقیق بگیرد
       وگرنه کاربر فکر می‌کند «بارگذاری کار نمی‌کند». */
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    $postMax = eplakMediaIniBytes((string) ini_get('post_max_size'));
    if ($contentLength > 0 && $postMax > 0 && $contentLength > $postMax) {
        eplakJsonError('حجم فایل از سقف مجاز سرور (' . round($postMax / (1024 * 1024)) . ' مگابایت — post_max_size) بیشتر است. فیلم کوتاه‌تری بگیرید یا سقف سرور را افزایش دهید.', 413);
    }
    if (!ini_get('file_uploads')) {
        eplakJsonError('بارگذاری فایل روی سرور غیرفعال است (file_uploads = Off).', 500);
    }
    eplakJsonError('هیچ فایلی دریافت نشد. لطفاً دوباره تلاش کنید.', 400);
}

$cfg = eplakMediaConfig();
if (count($incoming) > $cfg['max_count']) {
    eplakJsonError('حداکثر ' . $cfg['max_count'] . ' فایل در هر بار مجاز است.', 400);
}

try {
    if ($cfg['hourly_limit'] > 0 && eplakMediaHourlyUsage($pdo, $phone) >= $cfg['hourly_limit']) {
        eplakJsonError('سقف بارگذاری ساعتی شما تکمیل شده است. لطفاً کمی بعد دوباره تلاش کنید.', 429);
    }

    $already = ($reportId !== null) ? eplakMediaCountForReport($pdo, $reportId) : 0;
    $room = max(0, $cfg['max_count'] - $already);

    $stored = [];
    $errors = [];
    $uploadErrors = [
        UPLOAD_ERR_INI_SIZE   => 'حجم فایل از سقف تنظیمات سرور (upload_max_filesize) بیشتر است.',
        UPLOAD_ERR_FORM_SIZE  => 'حجم فایل بیش از حد مجاز فرم است.',
        UPLOAD_ERR_PARTIAL    => 'بارگذاری فایل ناقص ماند؛ لطفاً دوباره تلاش کنید.',
        UPLOAD_ERR_NO_FILE    => 'فایلی ارسال نشد.',
        UPLOAD_ERR_NO_TMP_DIR => 'پوشه‌ی موقت سرور در دسترس نیست.',
        UPLOAD_ERR_CANT_WRITE => 'نوشتن فایل روی سرور ممکن نشد.',
        UPLOAD_ERR_EXTENSION  => 'بارگذاری توسط یکی از اکستنشن‌های سرور متوقف شد.',
    ];

    foreach ($incoming as $file) {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors[] = ['name' => $file['name'], 'error' => $uploadErrors[$file['error']] ?? 'خطای نامشخص در بارگذاری فایل.'];
            continue;
        }
        if (count($stored) >= $room) {
            $errors[] = ['name' => $file['name'], 'error' => 'حداکثر ' . $cfg['max_count'] . ' فایل برای هر گزارش مجاز است.'];
            continue;
        }
        try {
            $info = eplakMediaValidateUpload($file['tmp_name'], $file['size'], $file['name'], $file['type'], $source);
            $row = eplakMediaStoreFile($pdo, $file['tmp_name'], [
                'phone'       => $phone,
                'report_id'   => $reportId,
                'original_name' => $file['name'],
                'mime'        => $file['type'],
                'source'      => $info['source'],
                'duration_ms' => $durationMs,
            ], $info);
            $stored[] = eplakMediaRowToPublic($row);
        } catch (EplakMediaError $e) {
            $errors[] = ['name' => $file['name'], 'error' => $e->getMessage()];
        }
    }

    if (!$stored && $errors) {
        eplakJson(['success' => false, 'error' => $errors[0]['error'], 'errors' => $errors], 400);
    }

    eplakJson([
        'success' => true,
        'count'   => count($stored),
        'items'   => $stored,
        'errors'  => $errors,
    ]);
} catch (EplakMediaError $e) {
    eplakJsonError($e->getMessage(), $e->getStatusCode());
} catch (Throwable $e) {
    eplakServerError($e, 'media.upload');
}
