<?php
/* api/push.php — ثبت و مدیریت «اعلان پس‌زمینه» (Web Push) برای اپلیکیشن شهروندی

   GET  ?action=config                        → کلید عمومی VAPID + وضعیت فعال بودن
   GET  ?action=status&phone=09xxxxxxxxx      → تعداد دستگاه‌های ثبت‌شده‌ی این شماره
   POST action=subscribe  {phone, subscription:{endpoint, keys:{p256dh, auth}}}
   POST action=unsubscribe {endpoint}
   POST action=test {phone}                   → ارسال اعلان آزمایشی به دستگاه‌های این شماره

   نکته: اعلان‌های «درون‌برنامه‌ای» (in-app) همیشه کار می‌کنند؛ این اندپوینت مسیر
   «نوتیفیکیشن سیستمی گوشی» را اضافه می‌کند تا اعلان حتی در حالت قفل بودن صفحه و
   بسته بودن برنامه به کاربر برسد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/webpush.php';

eplakApiHeaders();

$action = strtolower(trim((string) ($_REQUEST['action'] ?? 'config')));
$input  = eplakReadJsonBody();
if (!$input) {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $input = $decoded;
        }
    }
}

$phone = eplakNormalizePhone($input['phone'] ?? ($_GET['phone'] ?? ''));
if ($phone === '') {
    /* کاربر مهمان: اعلان‌های عمومی را می‌گیرد (same as notifications.php 'all') */
    $phone = '';
}

try {
    switch ($action) {
        case 'config': {
            $vapid = eplakVapidKeys($pdo);
            eplakJson([
                'success'         => true,
                'enabled'         => $vapid['ready'] && eplakPushEnabled(),
                'vapid_public_key' => $vapid['public'],
                'reason'          => $vapid['ready'] ? '' : $vapid['error'],
                'secure_context_required' => true,
            ]);
        }

        case 'status': {
            if ($phone === '') {
                eplakJsonError('شماره موبایل معتبر الزامی است', 400);
            }
            $subs = eplakPushSubscriptions($pdo, [$phone]);
            eplakJson([
                'success'       => true,
                'devices'       => count($subs),
                'push_enabled'  => eplakPushEnabled(),
            ]);
        }

        case 'subscribe': {
            $subscription = $input['subscription'] ?? null;
            if (!is_array($subscription)) {
                eplakJsonError('اطلاعات اشتراک نامعتبر است', 400);
            }
            if (!eplakPushEnabled()) {
                eplakJson(['success' => false, 'error' => 'امکان اعلان پس‌زمینه روی این سرور فعال نیست.', 'enabled' => false], 200);
            }

            $userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
            if (!eplakPushSaveSubscription($pdo, $phone, $subscription, $userAgent)) {
                eplakJsonError('ذخیره‌ی اشتراک ناموفق بود', 400);
            }

            /* کلیدهای VAPID را همین‌جا هم بساز (تا اولین ارسال بدون تأخیر باشد) */
            eplakVapidKeys($pdo);

            eplakJson([
                'success'  => true,
                'saved'    => true,
                'devices'  => count(eplakPushSubscriptions($pdo, $phone === '' ? [] : [$phone], $phone === '')),
            ]);
        }

        case 'unsubscribe': {
            $endpoint = trim((string) ($input['endpoint'] ?? ($_GET['endpoint'] ?? '')));
            if ($endpoint === '') {
                eplakJsonError('نشانی اشتراک الزامی است', 400);
            }
            eplakPushDeleteSubscription($pdo, $endpoint);
            eplakJson(['success' => true, 'removed' => true]);
        }

        case 'test': {
            if ($phone === '') {
                eplakJsonError('برای ارسال آزمایشی، شماره موبایل الزامی است', 400);
            }
            $subscriptions = eplakPushSubscriptions($pdo, [$phone]);
            if (!$subscriptions) {
                eplakJson(['success' => false, 'error' => 'برای این شماره هیچ دستگاهی ثبت نشده است. ابتدا در اپلیکیشن، اجازه‌ی اعلان را فعال کنید.', 'devices' => 0], 200);
            }
            $result = eplakWebPushSend(
                $pdo,
                $subscriptions,
                'اعلان آزمایشی — ای‌پلاک',
                'این پیام برای بررسی رسیدن اعلان در حالت قفل/بسته بودن برنامه ارسال شده است.',
                ['url' => 'index.html', 'tag' => 'eplak-test-' . time()]
            );
            eplakJson([
                'success' => $result['sent'] > 0,
                'sent'    => $result['sent'],
                'failed'  => $result['failed'],
                'devices' => count($subscriptions),
                'errors'  => $result['errors'],
            ]);
        }

        default:
            eplakJsonError('عملیات نامعتبر است', 400);
    }
} catch (Throwable $e) {
    eplakServerError($e, 'push');
}
