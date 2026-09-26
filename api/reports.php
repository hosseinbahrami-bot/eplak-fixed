<?php
/* api/reports.php — گزارش‌های شهروندی

   GET    ?phone=09xxxxxxxxx                      → گزارش‌های همان شماره (همراه فایل‌های پیوست)
   POST   {phone,title,description,…}             → ثبت گزارش جدید
          • JSON:  آرایه‌ی اختیاری media = [{name, mime, data(base64)}]
          • multipart/form-data با فیلدهای media[] (عکس/فیلم)
   POST   ?action=delete&id=..&phone=..  (یا بدنه‌ی JSON با action=delete)
   DELETE ?id=..&phone=..                        → حذف گزارش (فقط توسط مالک)

   نکته‌ی امنیتی: هر عملیات به شماره‌ی مالک مقید است؛ هیچ مسیری برای
   فهرست‌کردن یا حذف گزارش‌های سایر کاربران وجود ندارد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/media.php';

eplakApiHeaders();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$query  = $_GET;
$isMultipart = stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false;

/* خطای «حجم بالای post_max_size»: PHP در این حالت $_POST را خالی می‌کند و
   بدون این بررسی، کاربر پیام نامفهوم «Invalid JSON» می‌گیرد. */
if ($isMultipart && !$_POST && !$_FILES && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    $limit = ini_get('post_max_size');
    if ($limit) {
        eplakJsonError('حجم فایل‌های ارسالی بیش از حد مجاز سرور است (post_max_size = ' . $limit . '). فایل‌های سبک‌تری انتخاب کنید.', 413);
    }
}

/* ── فهرست گزارش‌های کاربر ─────────────────────────────────────────── */
if ($method === 'GET') {
    $phone = eplakNormalizePhone($query['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    try {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, category, department, sub_department, location, status, reply, created_at
                               FROM reports WHERE user_phone = :phone ORDER BY created_at DESC, id DESC LIMIT 200');
        $stmt->execute([':phone' => $phone]);
        $rows = $stmt->fetchAll();

        $ids = array_map(static fn($r) => (int) $r['id'], $rows);
        $mediaMap = eplakMediaGroupedByReport($pdo, $ids);

        $out = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $row['id']   = $id;
            $row['code'] = 'EP-1403-' . str_pad((string) ($id + 1000), 4, '0', STR_PAD_LEFT);
            $row['media'] = $mediaMap[$id] ?? [];
            $row['media_count'] = count($row['media']);
            $out[] = $row;
        }

        eplakJson(['success' => true, 'reports' => $out]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.get');
    }
}

/* ── خواندن ورودی (JSON یا فرم چندبخشی) ───────────────────────────── */
$input = $isMultipart ? $_POST : eplakReadJsonBody();
if ($isMultipart && !is_array($input)) {
    $input = [];
}

/* ── حذف (DELETE یا POST با action=delete) ─────────────────────────── */
$isDelete = $method === 'DELETE'
    || (($query['action'] ?? '') === 'delete')
    || ((($input['action'] ?? '')) === 'delete');

if ($isDelete) {
    $id = (int) ($query['id'] ?? 0);
    if ($id <= 0) {
        $id = (int) ($input['id'] ?? 0);
    }
    $phone = eplakNormalizePhone($query['phone'] ?? ($input['phone'] ?? ($input['userPhone'] ?? '')));

    if ($id <= 0) {
        eplakJsonError('شناسه‌ی گزارش نامعتبر است', 400);
    }
    if ($phone === '') {
        eplakJsonError('برای حذف گزارش، شماره‌ی مالک الزامی است', 400);
    }

    try {
        // حذف فقط در صورتی که گزارش متعلق به همین شماره باشد
        $stmt = $pdo->prepare('DELETE FROM reports WHERE id = :id AND user_phone = :phone');
        $stmt->execute([':id' => $id, ':phone' => $phone]);
        if ($stmt->rowCount() === 0) {
            // یا وجود ندارد، یا متعلق به این کاربر نیست — هر دو 404 (بدون افشای وجود رکورد)
            eplakJson(['success' => false, 'error' => 'گزارش یافت نشد', 'deleted_id' => $id], 404);
        }
        /* فایل‌های پیوست هم پاک می‌شوند تا فضای سرور اشغال نماند */
        eplakMediaDeleteForReport($pdo, $id);
        eplakJson(['success' => true, 'deleted_id' => $id]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.delete');
    }
}

if ($method !== 'POST') {
    eplakJsonError('Method not allowed', 405);
}

if (!$input) {
    eplakJsonError('Invalid JSON', 400);
}

/* ── ثبت گزارش جدید ─────────────────────────────────────────────────── */
$phone         = eplakNormalizePhone($input['phone'] ?? ($input['userPhone'] ?? ''));
$subject       = eplakStr($input['subject'] ?? ($input['title'] ?? ''), 255);
$details       = eplakStr($input['details'] ?? ($input['description'] ?? ''), 4000);
$reportType    = eplakStr($input['reportType'] ?? ($input['category'] ?? 'سایر'), 100);
$department    = eplakStr($input['department'] ?? ($input['mainDepartment'] ?? ''), 255);
$subDepartment = eplakStr($input['subDepartment'] ?? ($input['sub_department'] ?? ''), 255);
$location      = eplakStr($input['location'] ?? '', 500);
$name          = eplakStr($input['name'] ?? '', 255);
$address       = eplakStr($input['address'] ?? '', 500);
$nid           = eplakStr($input['nid'] ?? '', 20);

if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}
if ($subject === '' || $details === '') {
    eplakJsonError('عنوان و توضیحات گزارش الزامی است', 400);
}
if ($reportType === '') {
    $reportType = 'سایر';
}

try {
    $pdo->beginTransaction();

    $stmtUser = $pdo->prepare(eplakUsersUpsertSql($pdo, false));
    $stmtUser->execute([
        ':phone'   => $phone,
        ':name'    => $name,
        ':address' => $address,
        ':nid'     => $nid,
    ]);

    $stmtReport = $pdo->prepare('INSERT INTO reports (user_phone, title, description, category, department, sub_department, location, status)
                                 VALUES (:phone, :title, :description, :category, :department, :sub_department, :location, :status)');
    $stmtReport->execute([
        ':phone'          => $phone,
        ':title'          => $subject,
        ':description'    => $details,
        ':category'       => $reportType,
        ':department'     => $department,
        ':sub_department' => $subDepartment,
        ':location'       => $location,
        ':status'         => 'pending',
    ]);
    $insertId = (int) $pdo->lastInsertId();

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    eplakServerError($e, 'reports.create');
}

/* ── ذخیره‌ی عکس/فیلم‌های گزارش ─────────────────────────────────────── */
$savedMedia = [];
$mediaErrors = [];

try {
    if ($isMultipart) {
        $files = eplakMediaNormalizeFiles($_FILES['media'] ?? ($_FILES['photos'] ?? null));
        $count = 0;
        foreach ($files as $file) {
            if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            if ($count >= EPLAK_MEDIA_MAX_PER_REPORT) {
                $mediaErrors[] = 'حداکثر ' . EPLAK_MEDIA_MAX_PER_REPORT . ' فایل برای هر گزارش پذیرفته می‌شود.';
                break;
            }
            $result = eplakMediaStoreFile($pdo, $insertId, $file);
            if ($result['ok']) {
                $savedMedia[] = $result['media'];
            } else {
                $mediaErrors[] = $result['error'];
            }
            $count++;
        }
    } else {
        $mediaInput = $input['media'] ?? [];
        if (is_array($mediaInput)) {
            $count = 0;
            foreach ($mediaInput as $item) {
                if (!is_array($item) || $count >= EPLAK_MEDIA_MAX_PER_REPORT) {
                    continue;
                }
                $data = (string) ($item['data'] ?? ($item['base64'] ?? ''));
                if ($data === '') {
                    continue;
                }
                /* پشتیبانی از data URL: data:image/jpeg;base64,xxxx */
                $declaredMime = (string) ($item['mime'] ?? ($item['type'] ?? ''));
                if (strpos($data, 'data:') === 0 && strpos($data, 'base64,') !== false) {
                    [$meta, $data] = explode('base64,', $data, 2);
                    if (preg_match('#data:([^;]+)#', $meta, $m)) {
                        $declaredMime = $m[1];
                    }
                }
                $binary = base64_decode(preg_replace('/\s+/', '', $data) ?? '', true);
                if ($binary === false || $binary === '') {
                    $mediaErrors[] = 'محتوای فایل «' . eplakStr($item['name'] ?? 'پیوست', 80) . '» قابل خواندن نبود.';
                    continue;
                }
                $result = eplakMediaStoreBinary($pdo, $insertId, $binary, (string) ($item['name'] ?? 'file'), $declaredMime);
                if ($result['ok']) {
                    $savedMedia[] = $result['media'];
                } else {
                    $mediaErrors[] = $result['error'];
                }
                $count++;
            }
        }
    }
} catch (Throwable $e) {
    error_log('[eplak-api:reports.media] ' . $e->getMessage());
    $mediaErrors[] = 'ذخیره‌ی برخی فایل‌ها ناموفق بود.';
}

eplakJson([
    'success'       => true,
    'id'            => $insertId,
    'tracking_code' => 'EP-1403-' . str_pad((string) $insertId, 4, '0', STR_PAD_LEFT),
    'media'         => $savedMedia,
    'media_count'   => count($savedMedia),
    'media_errors'  => $mediaErrors,
]);
