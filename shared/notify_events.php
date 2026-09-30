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

/**
 * اعلان «پاسخ مدیریت» و «تغییر وضعیت» — هم برای گزارش و هم برای تیکت.
 *
 * چرا این تابع؟ قبلاً پاسخ‌دادن به تیکت در پنل ادمین فقط دیتابیس را به‌روز
 * می‌کرد و هیچ اعلانی نمی‌ساخت؛ کاربر در اپ هیچ خبری نمی‌گرفت. حالا هر دو
 * مسیر (گزارش/تیکت) از همین یک تابع رد می‌شوند تا:
 *   ۱) اعلان در فهرست اعلان‌های خود کاربر (اپ و سایت) ثبت شود،
 *   ۲) اگر اپ بسته باشد، از مسیر فایربیس به گوشی برسد،
 *   ۳) متن اعلان تاریخ/ساعت فارسی و خلاصه‌ی پاسخ را داشته باشد.
 *
 * @param string $kindLabel  مثل «درخواست» یا «تیکت»
 * @param string $code       کد پیگیری (مثلاً EP-1403-0021)
 * @param string $statusKey  کلید وضعیت: pending | in_progress | done
 * @param string $reply      متن پاسخ مدیریت (می‌تواند خالی باشد)
 */
function eplakNotifyReply(PDO $pdo, string $phone, string $kindLabel, string $code, string $statusKey, string $reply = ''): array
{
    $phone = trim($phone);
    if ($phone === '') {
        return ['ok' => false, 'id' => 0, 'pushed' => false, 'error' => 'no_phone'];
    }

    $labels = [
        'pending'     => 'در حال انتظار',
        'in_progress' => 'در حال رسیدگی',
        'done'        => 'انجام شد',
        'rejected'    => 'رد شد',
    ];
    $statusFa = $labels[$statusKey] ?? $statusKey;
    $reply    = trim($reply);
    $when     = eplakFaDateTime();

    $title = '📣 پاسخ ' . $kindLabel . ' ' . $code;
    $body  = 'وضعیت ' . $kindLabel . ' شما به «' . $statusFa . '» تغییر کرد.' . "\n";
    if ($reply !== '') {
        $body .= 'پاسخ شهرداری: ' . mb_substr($reply, 0, 180) . "\n";
    }
    $body .= 'زمان: ' . $when;

    /* اعلان درون‌برنامه‌ای + فایربیس (اگر تنظیم شده باشد) در یک جا */
    $res = eplakNotifyUser($pdo, $phone, $title, $body, [
        'code'   => $code,
        'kind'   => 'reply',
        'status' => $statusKey,
        'url'    => 'index.html#screen-notifications',
    ]);

    /* اگر فایربیس تنظیم نشده بود، اینترنتی/وب‌پوش را هم امتحان می‌کنیم تا
       اعلان در هر حالتی روی گوشی دیده شود. */
    if (empty($res['pushed']) && function_exists('eplakPushNotifyPhone')) {
        try {
            $push = eplakPushNotifyPhone($pdo, $phone, $title, $body, [
                'url'  => 'index.html#screen-notifications',
                'tag'  => 'eplak-' . ($kindLabel === 'تیکت' ? 'ticket' : 'report') . '-' . $code,
                'kind' => 'reply',
            ]);
            $res['pushed'] = ((int) ($push['sent'] ?? 0)) > 0;
        } catch (Throwable $e) {
            error_log('[eplak-notify-reply] پوش ناموفق: ' . $e->getMessage());
        }
    }

    return $res;
}
