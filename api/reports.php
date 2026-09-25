<?php
/* api/reports.php — گزارش‌های شهروندی

   GET    ?phone=09xxxxxxxxx                      → گزارش‌های همان شماره
   POST   {phone,title,description,...}          → ثبت گزارش جدید
   POST   ?action=delete&id=..&phone=..  (یا بدنه‌ی JSON با action=delete)
   DELETE ?id=..&phone=..                        → حذف گزارش (فقط توسط مالک)

   نکته‌ی امنیتی: هر عملیات به شماره‌ی مالک مقید است؛ هیچ مسیری برای
   فهرست‌کردن یا حذف گزارش‌های سایر کاربران وجود ندارد.
*/
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$query  = $_GET;

if ($method === 'GET') {
    $phone = eplakNormalizePhone($query['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }
    try {
        $stmt = $pdo->prepare('SELECT id, user_phone, title, description, category, department, sub_department, location, status, reply, created_at
                               FROM reports WHERE user_phone = :phone ORDER BY created_at DESC, id DESC LIMIT 200');
        $stmt->execute([':phone' => $phone]);
        eplakJson(['success' => true, 'reports' => $stmt->fetchAll()]);
    } catch (Throwable $e) {
        eplakServerError($e, 'reports.get');
    }
}

$input = eplakReadJsonBody();

/* ── حذف (DELETE یا POST با action=delete) ─────────────────────────── */
$isDelete = $method === 'DELETE'
    || (($query['action'] ?? '') === 'delete')
    || (($input['action'] ?? '') === 'delete');

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

    $stmtUser = $pdo->prepare('INSERT INTO users (phone, name, address, nid) VALUES (:phone, :name, :address, :nid)
        ON DUPLICATE KEY UPDATE
            name = IF(VALUES(name) = "", name, VALUES(name)),
            address = IF(VALUES(address) = "", address, VALUES(address)),
            nid = IF(VALUES(nid) = "", nid, VALUES(nid))');
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
    eplakJson([
        'success'       => true,
        'id'            => $insertId,
        'tracking_code' => 'EP-1403-' . str_pad((string) $insertId, 4, '0', STR_PAD_LEFT),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    eplakServerError($e, 'reports.create');
}
