<?php
function getDashboardStats(PDO $pdo): array {
    $reportsCount = $pdo->query('SELECT COUNT(*) as count FROM reports')->fetch();
    $usersCount = $pdo->query('SELECT COUNT(*) as count FROM users')->fetch();
    $ticketsCount = $pdo->query('SELECT COUNT(*) as count FROM tickets')->fetch();
    $pendingReportsCount = $pdo->query("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'")->fetch();
    $doneReportsCount = $pdo->query("SELECT COUNT(*) as count FROM reports WHERE status = 'done'")->fetch();
    $pendingTicketsCount = $pdo->query("SELECT COUNT(*) as count FROM tickets WHERE status = 'pending'")->fetch();

    return [
        'reports_count' => (int)$reportsCount['count'],
        'users_count' => (int)$usersCount['count'],
        'tickets_count' => (int)$ticketsCount['count'],
        'pending_reports_count' => (int)$pendingReportsCount['count'],
        'done_reports_count' => (int)$doneReportsCount['count'],
        'pending_tickets_count' => (int)$pendingTicketsCount['count'],
    ];
}

function getLatestReports(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getLatestTickets(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("TC-", LPAD(id + 1000, 4, "0")) AS code FROM tickets ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getLatestUsers(PDO $pdo, int $limit = 5): array {
    $stmt = $pdo->prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT :limit');
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getAllDepartments(PDO $pdo, bool $onlyActive = false): array {
    $sql = 'SELECT * FROM departments';
    if ($onlyActive) {
        $sql .= ' WHERE is_active = 1';
    }
    $sql .= ' ORDER BY parent_id IS NULL DESC, sort_order ASC, name ASC';
    $stmt = $pdo->query($sql);
    return $stmt->fetchAll();
}

function getSubDepartments(PDO $pdo, int $parentId): array {
    $stmt = $pdo->prepare('SELECT * FROM departments WHERE parent_id = :parent_id ORDER BY sort_order ASC, name ASC');
    $stmt->execute([':parent_id' => $parentId]);
    return $stmt->fetchAll();
}

function getDepartmentTree(PDO $pdo): array {
    $rows = getAllDepartments($pdo);
    $index = [];
    foreach ($rows as $row) {
        $row['children'] = [];
        $index[(int)$row['id']] = $row;
    }

    foreach ($rows as $row) {
        $parentId = (int)($row['parent_id'] ?? 0);
        if ($parentId > 0 && isset($index[$parentId])) {
            $index[$parentId]['children'][] = &$index[(int)$row['id']];
        }
    }

    $tree = [];
    foreach ($index as $row) {
        if ((int)($row['parent_id'] ?? 0) === 0) {
            $tree[] = $row;
        }
    }

    return $tree;
}

function getDepartmentById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM departments WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $department = $stmt->fetch();
    return $department ?: null;
}

function createDepartment(PDO $pdo, array $data): int {
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        return 0;
    }

    $parentId = isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null ? (int)$data['parent_id'] : null;
    $sortOrder = isset($data['sort_order']) ? (int)$data['sort_order'] : 0;
    $slug = trim((string)($data['slug'] ?? '')) ?: null;
    $code = trim((string)($data['code'] ?? '')) ?: null;

    $stmt = $pdo->prepare('INSERT INTO departments (name, slug, code, parent_id, sort_order, is_active, description, icon, color) VALUES (:name, :slug, :code, :parent_id, :sort_order, :is_active, :description, :icon, :color)');
    $stmt->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':code' => $code,
        ':parent_id' => $parentId,
        ':sort_order' => $sortOrder,
        ':is_active' => (int)($data['is_active'] ?? 1),
        ':description' => trim((string)($data['description'] ?? '')),
        ':icon' => trim((string)($data['icon'] ?? 'fa-building')) ?: null,
        ':color' => trim((string)($data['color'] ?? '#0f766e')) ?: '#0f766e',
    ]);

    return (int)$pdo->lastInsertId();
}

function updateDepartment(PDO $pdo, int $id, array $data): void {
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        return;
    }

    $parentId = isset($data['parent_id']) && $data['parent_id'] !== '' && $data['parent_id'] !== null ? (int)$data['parent_id'] : null;
    $sortOrder = isset($data['sort_order']) ? (int)$data['sort_order'] : 0;
    $slug = trim((string)($data['slug'] ?? '')) ?: null;
    $code = trim((string)($data['code'] ?? '')) ?: null;

    $stmt = $pdo->prepare('UPDATE departments SET name = :name, slug = :slug, code = :code, parent_id = :parent_id, sort_order = :sort_order, is_active = :is_active, description = :description, icon = :icon, color = :color WHERE id = :id');
    $stmt->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':code' => $code,
        ':parent_id' => $parentId,
        ':sort_order' => $sortOrder,
        ':is_active' => (int)($data['is_active'] ?? 1),
        ':description' => trim((string)($data['description'] ?? '')),
        ':icon' => trim((string)($data['icon'] ?? 'fa-building')) ?: null,
        ':color' => trim((string)($data['color'] ?? '#0f766e')) ?: '#0f766e',
        ':id' => $id,
    ]);
}

function deleteDepartment(PDO $pdo, int $id): void {
    foreach (getSubDepartments($pdo, $id) as $child) {
        deleteDepartment($pdo, (int)$child['id']);
    }
    $stmt = $pdo->prepare('DELETE FROM departments WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function getAllReports(PDO $pdo): array {
    $stmt = $pdo->query('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports ORDER BY created_at DESC');
    return $stmt->fetchAll();
}

/* وضعیت‌های معتبر (کلیدهای انگلیسی و برچسب‌های فارسی) */
function eplakStatusKeys(): array {
    return ['pending', 'in_progress', 'review', 'done'];
}

function eplakStatusRawValues(): array {
    return ['pending', 'in_progress', 'review', 'done',
            'در انتظار', 'در حال بررسی', 'انجام شده', 'انجام‌شده', 'انجام شده '];
}

/* تشخیص وضعیت یک ردیف گزارش.
   در برخی ردیف‌های قدیمی، مقدار وضعیت و واحد اداری جابه‌جا ذخیره شده است؛
   این تابع هر دو ستون را بررسی می‌کند و هرکدام شبیه وضعیت بود همان را برمی‌گرداند. */
function reportStatusOf(array $row): string {
    $valid = eplakStatusRawValues();
    foreach (['status', 'department'] as $col) {
        $v = trim((string)($row[$col] ?? ''));
        if ($v === '') {
            continue;
        }
        if (in_array($v, $valid, true)) {
            return normalizeStatusValue($v);
        }
    }
    return 'pending';
}

/** گزارش‌ها بر اساس واحد اداری (برای نمودار ستونی) */
function getReportsByDepartment(PDO $pdo, int $limit = 8): array
{
    $rows = $pdo->query('SELECT department, COUNT(*) AS cnt FROM reports GROUP BY department ORDER BY cnt DESC, department ASC')
                ->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $name = trim((string)$r['department']);
        $out[] = ['label' => $name !== '' ? $name : 'واحد نامشخص', 'count' => (int)$r['cnt']];
    }
    if (count($out) > $limit) {
        $top = array_slice($out, 0, $limit);
        $restCount = 0;
        foreach (array_slice($out, $limit) as $r) { $restCount += $r['count']; }
        $top[] = ['label' => 'سایر', 'count' => $restCount];
        $out = $top;
    }
    return $out;
}

/** روند ماهانهٔ گزارش‌ها — ماه‌های بدون گزارش هم با صفر نمایش داده می‌شوند */
function getReportsMonthly(PDO $pdo, int $months = 6): array
{
    $raw = $pdo->query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS cnt
                        FROM reports
                        WHERE created_at IS NOT NULL AND created_at > '0001-01-01'
                        GROUP BY ym")->fetchAll();
    $map = [];
    foreach ($raw as $r) { $map[(string)$r['ym']] = (int)$r['cnt']; }

    $names = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
              'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];

    $out = [];
    $cursor = new DateTime('first day of this month');
    $cursor->modify('-' . ($months - 1) . ' months');
    for ($i = 0; $i < $months; $i++) {
        $key = $cursor->format('Y-m');
        $out[] = [
            'key'   => $key,
            'label' => $names[(int)$cursor->format('n') - 1],
            'year'  => (int)$cursor->format('Y'),
            'count' => $map[$key] ?? 0,
        ];
        $cursor->modify('+1 month');
    }
    return $out;
}

/* آمار وضعیت گزارش‌ها برای نمودار */
function getReportsStatusStats(PDO $pdo): array {
    $rows = $pdo->query('SELECT status, department FROM reports')->fetchAll();
    $stats = ['pending' => 0, 'in_progress' => 0, 'done' => 0];
    $total = 0;
    foreach ($rows as $r) {
        $key = reportStatusOf($r);
        if (!isset($stats[$key])) {
            $stats[$key] = 0;
        }
        $stats[$key]++;
        $total++;
    }
    return ['total' => $total, 'counts' => $stats];
}

function normalizeStatusValue(string $status): string {
    $status = trim($status);
    $map = [
        'pending' => 'pending',
        'در انتظار' => 'pending',
        'in_progress' => 'in_progress',
        'در حال بررسی' => 'in_progress',
        'done' => 'done',
        'انجام شده' => 'done',
        'انجام‌شده' => 'done',
    ];

    return $map[$status] ?? 'pending';
}

function statusLabel(string $status): string {
    $status = normalizeStatusValue($status);
    $labels = [
        'pending' => 'در انتظار',
        'in_progress' => 'در حال بررسی',
        'done' => 'انجام‌شده',
    ];

    return $labels[$status] ?? 'در انتظار';
}

function statusClass(string $status): string {
    $status = normalizeStatusValue($status);
    $classes = [
        'pending' => 'status-pending',
        'in_progress' => 'status-progress',
        'done' => 'status-done',
    ];

    return $classes[$status] ?? 'status-pending';
}

function getAllUsers(PDO $pdo): array {
    $stmt = $pdo->query('SELECT u.*, COUNT(r.id) AS report_count FROM users u LEFT JOIN reports r ON u.phone = r.user_phone GROUP BY u.id ORDER BY u.created_at DESC');
    return $stmt->fetchAll();
}

function getUserByPhone(PDO $pdo, string $phone): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE phone = :phone LIMIT 1');
    $stmt->execute([':phone' => $phone]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function getUserById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $user = $stmt->fetch();
    return $user ?: null;
}

function createUser(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO users (phone, name, address, nid) VALUES (:phone, :name, :address, :nid)');
    $stmt->execute([
        ':phone' => trim((string)($data['phone'] ?? '')),
        ':name' => trim((string)($data['name'] ?? '')),
        ':address' => trim((string)($data['address'] ?? '')),
        ':nid' => trim((string)($data['nid'] ?? '')),
    ]);

    return (int)$pdo->lastInsertId();
}

function updateUser(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare('UPDATE users SET phone = :phone, name = :name, address = :address, nid = :nid WHERE id = :id');
    $stmt->execute([
        ':phone' => trim((string)($data['phone'] ?? '')),
        ':name' => trim((string)($data['name'] ?? '')),
        ':address' => trim((string)($data['address'] ?? '')),
        ':nid' => trim((string)($data['nid'] ?? '')),
        ':id' => $id,
    ]);
}

function createReport(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO reports (user_phone, title, description, category, department, sub_department, location, status) VALUES (:user_phone, :title, :description, :category, :department, :sub_department, :location, :status)');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':category' => trim((string)($data['category'] ?? 'سایر')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':sub_department' => trim((string)($data['sub_department'] ?? '')),
        ':location' => trim((string)($data['location'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
    ]);

    return (int)$pdo->lastInsertId();
}

function updateReport(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare('UPDATE reports SET user_phone = :user_phone, title = :title, description = :description, category = :category, department = :department, sub_department = :sub_department, location = :location, status = :status WHERE id = :id');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':category' => trim((string)($data['category'] ?? 'سایر')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':sub_department' => trim((string)($data['sub_department'] ?? '')),
        ':location' => trim((string)($data['location'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
        ':id' => $id,
    ]);
}

function getReportById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM reports WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $report = $stmt->fetch();
    return $report ?: null;
}

function saveReportReply(PDO $pdo, int $id, string $reply, string $status): void {
    $normStatus = normalizeStatusValue($status);
    $stmt = $pdo->prepare('UPDATE reports SET reply = :reply, status = :status WHERE id = :id');
    $stmt->bindValue(':reply', $reply);
    $stmt->bindValue(':status', $normStatus);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    // ارسال خودکار اعلان به شهروند ثبت‌کننده در صورت پاسخ یا تغییر وضعیت
    try {
        $rep = getReportById($pdo, $id);
        if ($rep && !empty($rep['user_phone'])) {
            $statusLabels = [
                'pending'     => 'در انتظار بررسی',
                'in_progress' => 'در حال پیگیری و اقدام',
                'done'        => 'تکمیل و خاتمه یافته',
                'rejected'    => 'رد شده'
            ];
            $statusFa = $statusLabels[$normStatus] ?? $normStatus;
            $code = 'EP-1403-' . str_pad((string)((int)$id + 1000), 4, '0', STR_PAD_LEFT);
            $notifTitle = 'به‌روزرسانی گزارش ' . $code;
            $notifBody = 'وضعیت گزارش «' . ($rep['title'] ?? 'شما') . '» به «' . $statusFa . '» تغییر یافت.';
            if ($reply !== '') {
                $notifBody .= ' پاسخ شهرداری: ' . mb_substr($reply, 0, 120);
            }
            $ins = $pdo->prepare('INSERT INTO notifications (user_phone, title, body, read_flag) VALUES (:phone, :title, :body, 0)');
            $ins->execute([
                ':phone' => $rep['user_phone'],
                ':title' => $notifTitle,
                ':body'  => $notifBody
            ]);
        }
    } catch (Throwable $e) {
        // بدون توقف عملیات اصلی
    }
}

function deleteReportReply(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('UPDATE reports SET reply = NULL, status = :status WHERE id = :id');
    $stmt->bindValue(':status', 'pending');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function getReportsByUser(PDO $pdo, string $userPhone): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("EP-1403-", LPAD(id + 1000, 4, "0")) AS code FROM reports WHERE user_phone = :user_phone ORDER BY created_at DESC');
    $stmt->bindValue(':user_phone', $userPhone);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getTickets(PDO $pdo, string $statusFilter = 'all', string $search = ''): array {
    $query = 'SELECT * FROM tickets WHERE 1=1';
    $params = [];

    if ($statusFilter !== 'all') {
        $query .= ' AND status = :status';
        $params[':status'] = normalizeStatusValue($statusFilter);
    }

    if ($search !== '') {
        $query .= ' AND (title LIKE :search OR user_phone LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }

    $query .= ' ORDER BY created_at DESC';

    $stmt = $pdo->prepare($query);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    return $stmt->fetchAll();
}

function getAllTickets(PDO $pdo): array {
    return getTickets($pdo);
}

function getTicketsByUser(PDO $pdo, string $userPhone): array {
    $stmt = $pdo->prepare('SELECT *, CONCAT("TC-", LPAD(id + 1000, 4, "0")) AS code FROM tickets WHERE user_phone = :user_phone ORDER BY created_at DESC');
    $stmt->execute([':user_phone' => $userPhone]);
    return $stmt->fetchAll();
}

function createTicket(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare('INSERT INTO tickets (user_phone, title, description, status, reply, category, department, priority) VALUES (:user_phone, :title, :description, :status, :reply, :category, :department, :priority)');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? $data['phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
        ':reply' => (string)($data['reply'] ?? ''),
        ':category' => trim((string)($data['category'] ?? '')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':priority' => trim((string)($data['priority'] ?? 'medium')),
    ]);
    return (int)$pdo->lastInsertId();
}

function updateTicket(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare('UPDATE tickets SET user_phone = :user_phone, title = :title, description = :description, status = :status, reply = :reply, category = :category, department = :department, priority = :priority WHERE id = :id');
    $stmt->execute([
        ':user_phone' => trim((string)($data['user_phone'] ?? '')),
        ':title' => trim((string)($data['title'] ?? '')),
        ':description' => trim((string)($data['description'] ?? '')),
        ':status' => normalizeStatusValue((string)($data['status'] ?? 'pending')),
        ':reply' => (string)($data['reply'] ?? ''),
        ':category' => trim((string)($data['category'] ?? '')),
        ':department' => trim((string)($data['department'] ?? '')),
        ':priority' => trim((string)($data['priority'] ?? 'medium')),
        ':id' => $id,
    ]);
}

function getTicketById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    $ticket = $stmt->fetch();
    return $ticket ?: null;
}

function saveTicketReply(PDO $pdo, int $id, string $reply, string $status): void {
    $stmt = $pdo->prepare('UPDATE tickets SET reply = :reply, status = :status WHERE id = :id');
    $stmt->bindValue(':reply', $reply);
    $stmt->bindValue(':status', normalizeStatusValue($status));
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function deleteTicketReply(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('UPDATE tickets SET reply = NULL, status = :status WHERE id = :id');
    $stmt->bindValue(':status', 'pending');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function saveTicketDetails(PDO $pdo, int $id, string $title, string $description, string $userPhone, string $reply, string $status, string $category = '', string $department = '', string $priority = 'medium'): void {
    updateTicket($pdo, $id, [
        'title' => $title,
        'description' => $description,
        'user_phone' => $userPhone,
        'reply' => $reply,
        'status' => $status,
        'category' => $category,
        'department' => $department,
        'priority' => $priority,
    ]);
}

function deleteReport(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM reports WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function deleteUser(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function deleteTicket(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM tickets WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

/* ============================================================
   اخبار و دانستنی‌ها
   ============================================================ */

function getAllNews(PDO $pdo, string $type = ''): array {
    if ($type === 'news' || $type === 'tip') {
        $stmt = $pdo->prepare('SELECT * FROM news WHERE type = :type ORDER BY sort_order ASC, id DESC');
        $stmt->execute([':type' => $type]);
    } else {
        $stmt = $pdo->query('SELECT * FROM news ORDER BY type ASC, sort_order ASC, id DESC');
    }
    return $stmt->fetchAll();
}

function getNewsById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM news WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function createNews(PDO $pdo, array $data): int {
    $stmt = $pdo->prepare(
        'INSERT INTO news (type, title, summary, body, icon, image_url, published, sort_order)
         VALUES (:type, :title, :summary, :body, :icon, :image_url, :published, :sort_order)'
    );
    $stmt->execute([
        ':type'      => $data['type'] ?? 'news',
        ':title'     => $data['title'] ?? '',
        ':summary'   => $data['summary'] ?? null,
        ':body'      => $data['body'] ?? '',
        ':icon'      => $data['icon'] ?? null,
        ':image_url' => $data['image_url'] ?? null,
        ':published' => !empty($data['published']) ? 1 : 0,
        ':sort_order' => (int)($data['sort_order'] ?? 0),
    ]);
    return (int)$pdo->lastInsertId();
}

function updateNews(PDO $pdo, int $id, array $data): void {
    $stmt = $pdo->prepare(
        'UPDATE news SET
            type = :type,
            title = :title,
            summary = :summary,
            body = :body,
            icon = :icon,
            image_url = :image_url,
            published = :published,
            sort_order = :sort_order
         WHERE id = :id'
    );
    $stmt->execute([
        ':type'      => $data['type'] ?? 'news',
        ':title'     => $data['title'] ?? '',
        ':summary'   => $data['summary'] ?? null,
        ':body'      => $data['body'] ?? '',
        ':icon'      => $data['icon'] ?? null,
        ':image_url' => $data['image_url'] ?? null,
        ':published' => !empty($data['published']) ? 1 : 0,
        ':sort_order' => (int)($data['sort_order'] ?? 0),
        ':id'        => $id,
    ]);
}

function deleteNews(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('DELETE FROM news WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

function toggleNewsPublished(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('UPDATE news SET published = IF(published = 1, 0, 1) WHERE id = :id');
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
}

/* ============================================================
   اعلان‌ها (ارسال تکی و گروهی)
   ============================================================ */

/**
 * ارسال اعلان به کاربران.
 * $targetType: 'all' = همه کاربران | 'selected' = شماره‌های مشخص‌شده
 * returns: تعداد گیرندگان
 */
function sendNotification(PDO $pdo, string $title, string $body, string $targetType, array $phones, ?string $createdBy = null): int {
    if ($targetType === 'all') {
        $stmt = $pdo->query('SELECT phone FROM users');
        $phones = array_column($stmt->fetchAll(), 'phone');
        if (!in_array('all', $phones, true)) {
            $phones[] = 'all';
        }
    }

    $phones = array_values(array_unique(array_filter(array_map('trim', $phones), static fn($p) => $p !== '')));
    if (!$phones) {
        return 0;
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO notification_sends (title, body, target_type, recipients_count, created_by)
             VALUES (:title, :body, :target, :count, :by)'
        );
        $stmt->execute([
            ':title' => $title,
            ':body'  => $body,
            ':target' => $targetType === 'all' ? 'all' : 'selected',
            ':count' => count($phones),
            ':by'    => $createdBy,
        ]);
        $sendId = (int)$pdo->lastInsertId();

        $ins = $pdo->prepare(
            'INSERT INTO notifications (user_phone, title, body, send_id) VALUES (:phone, :title, :body, :send)'
        );
        foreach ($phones as $phone) {
            $ins->execute([
                ':phone' => $phone,
                ':title' => $title,
                ':body'  => $body,
                ':send'  => $sendId,
            ]);
        }
        $pdo->commit();
        return count($phones);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function getNotificationSends(PDO $pdo, int $limit = 50): array {
    $stmt = $pdo->prepare('SELECT * FROM notification_sends ORDER BY id DESC LIMIT ' . (int)$limit);
    $stmt->execute();
    return $stmt->fetchAll();
}

function getNotificationSendById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM notification_sends WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function getNotificationRecipients(PDO $pdo, int $sendId): array {
    $stmt = $pdo->prepare('SELECT * FROM notifications WHERE send_id = :id ORDER BY id ASC');
    $stmt->execute([':id' => $sendId]);
    return $stmt->fetchAll();
}
