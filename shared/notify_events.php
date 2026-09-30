<?php
/* ============================================================================
   shared/notify_events.php — «اعلان رویدادی»

   وقتی خودِ کاربر کاری در اپ انجام می‌دهد (مثلاً درخواست/گزارشی ثبت می‌کند)،
   بلافاصله یک اعلان شخصی برای همان کاربر ساخته می‌شود تا:
     ۱) در فهرست اعلان‌های خودش (اپ و سایت) دیده شود،
     ۲) و اگر اپ بسته باشد، از مسیر فایربیس (اگر تنظیم شده باشد) به گوشی برسد.

   این اعلان «اختصاصی» است (user_phone = شماره‌ی همان کاربر)، پس وضعیت
   خوانده‌شده/حذف‌شده‌اش به بقیه‌ی کاربران ربطی ندارد.
   ============================================================================ */

require_once __DIR__ . '/fa_datetime.php';
if (file_exists(__DIR__ . '/fcm.php')) {
    require_once __DIR__ . '/fcm.php';
}

/**
 * ثبت یک اعلان رویدادی برای کاربر.
 *
 * @param PDO    $pdo
 * @param string $phone  شماره‌ی کاربر (اگر خالی باشد فقط در لاگ ثبت می‌شود)
 * @param string $title  عنوان اعلان (مثلاً «✅ ثبت درخواست»)
 * @param string $body   متن کامل اعلان
 * @param array  $extra  داده‌های همراه برای کلیک روی اعلان (اختیاری)
 * @return array{ok:bool,id:int,pushed:bool,error:string}
 */
function eplakNotifyUser(PDO $pdo, string $phone, string $title, string $body, array $extra = []): array
{
    $out = ['ok' => false, 'id' => 0, 'pushed' => false, 'error' => ''];

    $phone = preg_replace('/[^0-9+]/', '', trim($phone)) ?? '';
    if ($phone === '' || $phone === 'all') {
        $out['error'] = 'no_phone';
        return $out;
    }

    $title = eplakNotifyTrim($title, 250);
    $body  = eplakNotifyTrim($body, 900);

    /* ۱) ذخیره در جدول اعلان‌ها (برای فهرست داخل اپ و سایت) */
    try {
        $stmt = $pdo->prepare('INSERT INTO notifications (user_phone, title, body, read_flag) VALUES (:phone, :title, :body, 0)');
        $stmt->execute([':phone' => $phone, ':title' => $title, ':body' => $body]);
        $out['id'] = (int) $pdo->lastInsertId();
        $out['ok'] = true;
    } catch (Throwable $e) {
        $out['error'] = $e->getMessage();
        error_log('[eplak-notify-event] ذخیره‌ی اعلان ناموفق: ' . $e->getMessage());
        return $out;
    }

    /* ۲) ارسال فوری به گوشی از مسیر فایربیس (اگر پروژه تنظیم شده باشد).
          اگر اپ باز باشد، فهرست اعلان‌ها خودش اعلان را نشان می‌دهد. */
    if (function_exists('eplakFcmNotifyPhone')) {
        try {
            $payload = array_merge([
                'id'    => (string) $out['id'],
                'url'   => 'index.html#screen-notifications',
            ], $extra);
            $res = eplakFcmNotifyPhone($pdo, $phone, $title, $body, $payload);
            $out['pushed'] = ((int) ($res['sent'] ?? 0)) > 0;
        } catch (Throwable $e) {
            error_log('[eplak-notify-event] ارسال فوری فایربیس ناموفق: ' . $e->getMessage());
        }
    }

    return $out;
}

/**
 * اعلان «ثبت درخواست/گزارش» — الگوی آماده برای رویدادهای اپ.
 *
 * @param string $kindLabel مثل «درخواست» یا «تیکت»
 * @param string $code      کد پیگیری
 */
function eplakNotifyRequestCreated(PDO $pdo, string $phone, string $kindLabel, string $code): array
{
    $when  = eplakFaDateTime();
    $title = '✅ ثبت ' . $kindLabel;
    $body  = $kindLabel . ' شما با کد پیگیری ' . $code . ' در تاریخ ' . $when . ' ثبت شد.'
           . ' نتیجه‌ی بررسی از همین‌جا به شما اطلاع داده می‌شود.';

    return eplakNotifyUser($pdo, $phone, $title, $body, [
        'code' => $code,
        'kind' => 'request_created',
    ]);
}

/** کوتاه‌کردن متن برای ستون‌های دیتابیس */
function eplakNotifyTrim(string $text, int $max): string
{
    $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max, 'UTF-8');
    }
    return substr($text, 0, $max);
}
