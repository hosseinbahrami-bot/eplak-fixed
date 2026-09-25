<?php
/* api/_common.php — ابزارهای مشترک و امنیتی اندپوینت‌های عمومی اپ

   - هدرهای CORS/کش یکسان
   - اعتبارسنجی شماره موبایل ایران (تنها شناسه‌ای که اپ برای «مالکیت» دارد)
   - پاسخ‌های JSON استاندارد بدون افشای جزئیات داخلی (پیام خطای PDO و …)
   - محدودسازی طول ورودی‌ها
*/

require_once __DIR__ . '/../admin/includes/db.php';

function eplakApiHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function eplakJson(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function eplakJsonError(string $message, int $status = 400): void {
    eplakJson(['success' => false, 'error' => $message], $status);
}

/* ارقام فارسی/عربی → لاتین، سپس اعتبارسنجی 09xxxxxxxxx */
function eplakNormalizePhone(?string $raw): string {
    $raw = trim((string) $raw);
    if ($raw === '') {
        return '';
    }
    $fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    $en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    $raw = str_replace($fa, $en, $raw);
    $raw = str_replace($ar, $en, $raw);
    $raw = preg_replace('/[\s\-()]+/', '', $raw);
    if (preg_match('/^\+?98(9\d{9})$/', $raw, $m)) {
        $raw = '0' . $m[1];
    } elseif (preg_match('/^(9\d{9})$/', $raw, $m)) {
        $raw = '0' . $m[1];
    }
    return preg_match('/^09\d{9}$/', $raw) ? $raw : '';
}

function eplakReadJsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function eplakStr($value, int $maxLen): string {
    $value = trim((string) ($value ?? ''));
    if ($value === '') {
        return '';
    }
    // حذف کاراکترهای کنترلی به‌جز خط جدید/تب
    $value = preg_replace('/[^\P{C}\n\t]+/u', '', $value) ?? $value;
    if (mb_strlen($value, 'UTF-8') > $maxLen) {
        $value = mb_substr($value, 0, $maxLen, 'UTF-8');
    }
    return $value;
}

/* ثبت خطای داخلی در لاگ سرور و برگرداندن پیام عمومی به کلاینت */
function eplakServerError(Throwable $e, string $context = ''): void {
    error_log('[eplak-api' . ($context !== '' ? ":$context" : '') . '] ' . $e->getMessage());
    eplakJsonError('خطای داخلی سرور. لطفاً بعداً دوباره تلاش کنید.', 500);
}
