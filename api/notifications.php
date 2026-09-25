<?php
/* api/notifications.php — اعلان‌های ارسالی پنل ادمین برای اپلیکیشن

   GET  ?phone=09xxxxxxxxx        → فهرست اعلان‌های آن کاربر
   GET  ?phone=...&unread=1       → فقط خوانده‌نشده‌ها
   GET  ?phone=...&since_id=123   → اعلان‌های جدیدتر از شناسه داده‌شده
   POST (form/json) action=read   → علامت‌گذاری یک اعلان به‌عنوان خوانده‌شده
        فیلدها: action=read, phone, id
*/
require_once __DIR__ . '/../admin/includes/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_REQUEST['action'] ?? '';
$phone  = trim($_REQUEST['phone'] ?? '');

try {
    /* علامت‌گذاری به‌عنوان خوانده‌شده */
    if ($action === 'read' && $phone !== '') {
        $id = (int)($_REQUEST['id'] ?? 0);
        if ($id > 0) {
            $stmt = $pdo->prepare('UPDATE notifications SET read_flag = 1 WHERE id = :id AND (user_phone = :phone OR user_phone = "all")');
            $stmt->execute([':id' => $id, ':phone' => $phone]);
        } else {
            $stmt = $pdo->prepare('UPDATE notifications SET read_flag = 1 WHERE user_phone = :phone OR user_phone = "all"');
            $stmt->execute([':phone' => $phone]);
        }
        echo json_encode(['success' => true, 'read' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $onlyUnread = (string)($_GET['unread'] ?? '') === '1';
    $sinceId    = (int)($_GET['since_id'] ?? 0);

    $params = [];
    if ($phone !== '' && $phone !== 'all') {
        $sql = 'SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE user_phone = :phone
                UNION
                SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE (user_phone = "all" OR user_phone = "")
                AND (send_id IS NULL OR send_id NOT IN (SELECT send_id FROM notifications WHERE user_phone = :phone2 AND send_id IS NOT NULL))';
        $params[':phone'] = $phone;
        $params[':phone2'] = $phone;
    } else {
        $sql = 'SELECT id, title, body, read_flag, created_at, send_id FROM notifications WHERE (user_phone = "all" OR user_phone = "")';
    }

    if ($onlyUnread) {
        $sql = "SELECT * FROM ($sql) AS sub WHERE (read_flag = 0 OR read_flag IS NULL)";
    }
    if ($sinceId > 0) {
        $sql = ($onlyUnread ? $sql : "SELECT * FROM ($sql) AS sub") . ' AND id > :since_id';
        $params[':since_id'] = $sinceId;
    }

    $sql .= ' ORDER BY id DESC LIMIT 100';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $items = array_map(static function (array $r): array {
        return [
            'id'         => (int)$r['id'],
            'title'      => $r['title'],
            'body'       => $r['body'],
            'read_flag'  => (int)$r['read_flag'],
            'created_at' => $r['created_at'],
        ];
    }, $rows);

    $unread = 0;
    foreach ($items as $it) {
        if ($it['read_flag'] === 0) {
            $unread++;
        }
    }

    echo json_encode([
        'success'       => true,
        'count'         => count($items),
        'unread'        => $unread,
        'notifications' => $items,
        'latest_id'     => !empty($items) ? $items[0]['id'] : 0,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
