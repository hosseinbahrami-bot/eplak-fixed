<?php
require_once __DIR__ . '/_common.php';

eplakApiHeaders();

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $phone = eplakNormalizePhone($_GET['phone'] ?? '');
    if ($phone === '') {
        eplakJsonError('شماره موبایل معتبر الزامی است', 400);
    }

    $stmt = $pdo->prepare('SELECT id, phone, name, address, nid, avatar, created_at FROM users WHERE phone = :phone LIMIT 1');
    $stmt->execute([':phone' => $phone]);
    $user = $stmt->fetch();
    if (!$user) {
        echo json_encode(['success' => false, 'user' => null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'user' => $user], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$phone = eplakNormalizePhone($input['phone'] ?? $input['userPhone'] ?? '');
$name = eplakStr($input['name'] ?? '', 255);
$address = eplakStr($input['address'] ?? '', 500);
$nid = eplakStr($input['nid'] ?? '', 20);

/* عکس پروفایل: فقط آدرس فایل خودِ همین سرور (uploads) یا خالی پذیرفته می‌شود
   تا کاربر نتواند آدرس دلبخواه/متن خطرناک را در پروفایل خود جا بگذارد. */
$avatarRaw = trim((string) ($input['avatar'] ?? ''));
$avatar = '';
if ($avatarRaw !== '' && $avatarRaw !== '0') {
    if (preg_match('#^https?://#i', $avatarRaw)) {
        $avatarHost = strtolower((string) parse_url($avatarRaw, PHP_URL_HOST));
        $selfHost   = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $selfHost   = preg_replace('/:\d+$/', '', $selfHost);
        if ($avatarHost === '' || ($selfHost !== '' && $avatarHost !== $selfHost)) {
            eplakJsonError('آدرس عکس پروفایل نامعتبر است', 400);
        }
        $avatar = eplakStr($avatarRaw, 500);
    } elseif (preg_match('#^/[\w\-./%]+$#', $avatarRaw) && strpos($avatarRaw, '..') === false) {
        $avatar = eplakStr($avatarRaw, 500);
    } else {
        eplakJsonError('آدرس عکس پروفایل نامعتبر است', 400);
    }
}

if ($phone === '') {
    eplakJsonError('شماره موبایل معتبر الزامی است', 400);
}
if ($nid !== '' && !preg_match('/^\d{10}$/', $nid)) {
    eplakJsonError('کد ملی باید ۱۰ رقم باشد', 400);
}

if ($name === '') {
    $name = 'شهروند';
}

try {
    $params = [
        ':phone' => $phone,
        ':name' => $name,
        ':address' => $address,
        ':nid' => $nid,
    ];
    $hasAvatarColumn = true;
    try {
        $cols = eplakIsSqlite($pdo)
            ? $pdo->query('PRAGMA table_info(users)')->fetchAll()
            : $pdo->query('SHOW COLUMNS FROM users')->fetchAll();
        $hasAvatarColumn = false;
        foreach ($cols as $col) {
            $colName = strtolower((string) ($col['name'] ?? ($col['Field'] ?? '')));
            if ($colName === 'avatar') {
                $hasAvatarColumn = true;
                break;
            }
        }
    } catch (Throwable $e) {
        $hasAvatarColumn = false;
    }

    if ($hasAvatarColumn) {
        $stmt = $pdo->prepare(eplakUsersUpsertSql($pdo, true, true));
        $params[':avatar'] = $avatar;
    } else {
        $stmt = $pdo->prepare(eplakUsersUpsertSql($pdo, true, false));
    }
    $stmt->execute($params);

    $stmtGet = $pdo->prepare('SELECT id, phone, name, address, nid, avatar, created_at FROM users WHERE phone = :phone LIMIT 1');
    $stmtGet->execute([':phone' => $phone]);
    $savedUser = $stmtGet->fetch();

    echo json_encode(['success' => true, 'user' => $savedUser], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    eplakServerError($e, 'users');
}
