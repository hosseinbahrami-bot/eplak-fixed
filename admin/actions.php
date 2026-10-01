<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$type = $_GET['type'] ?? '';
$id = (int)($_GET['id'] ?? 0);

// همه‌ی عملیات این فایل تغییردهنده‌اند → توکن CSRF الزامی است
eplakRequireCsrf();

if ($type === 'report_delete') {
    deleteReport($pdo, $id);
    eplakRedirect('reports.php');
    exit;
}

if ($type === 'user_delete') {
    deleteUser($pdo, $id);
    eplakRedirect('users.php');
    exit;
}

if ($type === 'ticket_delete') {
    deleteTicket($pdo, $id);
    eplakRedirect('tickets.php');
    exit;
}

if ($type === 'report_reply_delete') {
    deleteReportReply($pdo, $id);
    eplakRedirect('report_detail.php?id=' . $id);
    exit;
}

/* حذف یک عکس/فیلم پیوست گزارش توسط ادمین (فقط فایل و رکورد رسانه) */
if ($type === 'media_delete') {
    $reportId = (int) ($_GET['report_id'] ?? 0);
    try {
        $media = eplakMediaFetchRow($pdo, $id);
        if ($media) {
            $reportId = $reportId > 0 ? $reportId : (int) ($media['report_id'] ?? 0);
            $del = $pdo->prepare('DELETE FROM media WHERE id = :id');
            $del->execute([':id' => $id]);
            eplakMediaUnlinkRow($media);
        }
    } catch (Throwable $e) {
        error_log('[eplak-admin:media_delete] ' . $e->getMessage());
    }
    eplakRedirect($reportId > 0 ? 'report_detail.php?id=' . $reportId . '&media_deleted=1' : 'reports.php');
    exit;
}

if ($type === 'ticket_reply_delete') {
    deleteTicketReply($pdo, $id);
    eplakRedirect('ticket_detail.php?id=' . $id);
    exit;
}

if ($type === 'news_delete') {
    deleteNews($pdo, $id);
    eplakRedirect('news.php?deleted=1');
    exit;
}

if ($type === 'news_toggle') {
    toggleNewsPublished($pdo, $id);
    eplakRedirect('news.php?success=1');
    exit;
}

if ($type === 'department_delete') {
    deleteDepartment($pdo, $id);
    eplakRedirect('departments.php');
    exit;
}

eplakRedirect('index.php');
