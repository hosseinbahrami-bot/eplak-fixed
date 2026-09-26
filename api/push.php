<?php
/* api/push.php — ثبت و مدیریت «اعلان پس‌زمینه» (Web Push) برای اپلیکیشن شهروندی

   GET  ?action=config                        → کلید عمومی VAPID + وضعیت فعال بودن
   GET  ?action=status&phone=09xxxxxxxxx      → تعداد دستگاه‌های ثبت‌شده‌ی این شماره
   POST action=subscribe  {phone, subscription:{endpoint, keys:{p256dh, auth}}}
   POST action=unsubscribe {endpoint}
   POST action=register_fcm {phone, token}    → ثبت توکن فایربیس اپ اندروید
   POST action=unregister_fcm {token}
   POST action=test {phone}                   → ارسال اعلان آزمایشی (وب‌پوش + فایربیس)

   نکته: اعلان‌های «درون‌برنامه‌ای» (in-app) همیشه کار می‌کنند؛ این اندپوینت مسیر
   «نوتیفیکیشن سیستمی گوشی» را اضافه می‌کند تا اعلان حتی در حالت قفل بودن صفحه و
   بسته بودن برنامه به کاربر برسد.
*/
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../shared/webpush.php';
require_once __DIR__ . '/../shared/fcm.php';

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
            $fcm   = eplakFcmConfig($pdo);
            eplakJson([
                'success'         => true,
                'enabled'         => $vapid['ready'] && eplakPushEnabled(),
                'vapid_public_key' => $vapid['public'],
                'reason'          => $vapid['ready'] ? '' : $vapid['error'],
                'secure_context_required' => true,
                /* مسیر اعلان سیستمی برای اپ اندروید (فایربیس) */
                'fcm_ready'       => $fcm['ready'],
                'fcm_reason'      => $fcm['ready'] ? '' : $fcm['error'],
            ]);
        }

        case 'status': {
            if ($phone === '') {
                eplakJsonError('شماره موبایل معتبر الزامی است', 400);
            }
            $subs   = eplakPushSubscriptions($pdo, [$phone]);
            $tokens = eplakFcmTokens($pdo, [$phone]);
            eplakJson([
                'success'       => true,
                'devices'       => count($subs) + count($tokens),
                'browser_devices' => count($subs),
                'app_devices'   => count($tokens),
                'push_enabled'  => eplakPushEnabled(),
                'fcm_ready'     => eplakFcmConfig($pdo)['ready'],
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

        case 'register_fcm': {
            /* ثبت دستگاه اپ اندروید. برخلاف مرورگر، اپ شماره‌ی کاربر را می‌داند
               و توکن فایربیس را از خود اندروید می‌گیرد. */
            $token = trim((string) ($input['token'] ?? ($_GET['token'] ?? '')));
            if ($token === '') {
                eplakJsonError('توکن دستگاه الزامی است', 400);
            }
            if (!eplakFcmSaveToken($pdo, $phone, $token, (string) ($input['platform'] ?? 'android'))) {
                eplakJsonError('ذخیره‌ی توکن دستگاه ناموفق بود', 400);
            }
            $fcm = eplakFcmConfig($pdo);
            eplakJson([
                'success'   => true,
                'saved'     => true,
                'devices'   => count(eplakFcmTokens($pdo, $phone === '' ? [] : [$phone], $phone === '')),
                'fcm_ready' => $fcm['ready'],
                'fcm_reason' => $fcm['ready'] ? '' : $fcm['error'],
            ]);
        }

        case 'unregister_fcm': {
            $token = trim((string) ($input['token'] ?? ($_GET['token'] ?? '')));
            if ($token === '') {
                eplakJsonError('توکن دستگاه الزامی است', 400);
            }
            eplakFcmDeleteToken($pdo, $token);
            eplakJson(['success' => true, 'removed' => true]);
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

            $title = 'اعلان آزمایشی — ای‌پلاک';
            $body  = 'این پیام برای بررسی رسیدن اعلان در حالت قفل/بسته بودن برنامه ارسال شده است.';
            $meta  = ['url' => 'index.html', 'tag' => 'eplak-test-' . time()];

            /* مسیر ۱: مرورگر / افزودن به صفحه اصلی (Web Push) */
            $subscriptions = eplakPushSubscriptions($pdo, [$phone]);
            $browser = $subscriptions
                ? eplakWebPushSend($pdo, $subscriptions, $title, $body, $meta)
                : ['sent' => 0, 'failed' => 0, 'errors' => []];

            /* مسیر ۲: اپ اندروید (فایربیس/FCM) */
            $tokens = eplakFcmTokens($pdo, [$phone]);
            $app    = $tokens
                ? eplakFcmSend($pdo, $tokens, $title, $body, $meta)
                : ['sent' => 0, 'failed' => 0, 'errors' => [], 'skipped' => ''];

            $sent  = (int) $browser['sent'] + (int) $app['sent'];
            $total = count($subscriptions) + count($tokens);

            if ($total === 0) {
                eplakJson([
                    'success' => false,
                    'error'   => 'برای این شماره هیچ دستگاهی ثبت نشده است. ابتدا در اپلیکیشن اجازه‌ی اعلان را فعال کنید.',
                    'devices' => 0,
                ], 200);
            }

            eplakJson([
                'success' => $sent > 0,
                'sent'    => $sent,
                'failed'  => (int) $browser['failed'] + (int) $app['failed'],
                'devices' => $total,
                'browser_devices' => count($subscriptions),
                'app_devices'     => count($tokens),
                'errors'  => array_merge($browser['errors'], $app['errors']),
                'fcm_skipped' => $app['skipped'] ?? '',
            ]);
        }

        default:
            eplakJsonError('عملیات نامعتبر است', 400);
    }
} catch (Throwable $e) {
    eplakServerError($e, 'push');
}
