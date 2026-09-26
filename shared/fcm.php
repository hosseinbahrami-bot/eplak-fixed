<?php
/* shared/fcm.php — اعلان سیستمی گوشی برای اپ اندروید از طریق فایربیس (FCM)

   چرا لازم است؟
   اپ اندروید سایت را در WebView نشان می‌دهد و اندروید در WebView نه «Push API»
   دارد و نه «Notification API». پس برای رسیدن اعلان در حالت «بسته بودن کامل
   اپلیکیشن» باید از سرویس استاندارد گوگل (Firebase Cloud Messaging) استفاده شود.

   این فایل روی سرور (بدون هیچ کتابخانه‌ی بیرونی) اعلان را به گوگل می‌فرستد:
     ۱) ساخت توکن دسترسی از «کلید سرویس» حساب فایربیس
        (امضای JWT با RS256 و سپس گرفتن access_token از oauth2.googleapis.com)
     ۲) ارسال پیام به هر دستگاه با FCM HTTP v1
        (https://fcm.googleapis.com/v1/projects/{project}/messages:send)

   کلید سرویس در پنل ادمین → تنظیمات → بخش «اعلان گوشی در اپ اندروید» وارد
   می‌شود و در جدول app_settings ذخیره می‌گردد (خارج از کد و خارج از گیت).
   ============================================================================ */

require_once __DIR__ . '/webpush.php';   /* استفاده از eplakHttpPost و توابع base64 */

/** وضعیت آماده بودن موتور: افزونه‌های لازم + کلید سرویس وارد شده */
function eplakFcmConfig(PDO $pdo): array
{
    $out = [
        'ready'        => false,
        'configured'   => false,
        'project_id'   => '',
        'client_email' => '',
        'private_key'  => '',
        'error'        => '',
    ];

    if (!function_exists('openssl_sign') || !function_exists('openssl_get_privatekey')) {
        $out['error'] = 'افزونه‌ی OpenSSL روی سرور فعال نیست.';
        return $out;
    }
    if (!function_exists('curl_init') && !ini_get('allow_url_fopen')) {
        $out['error'] = 'برای ارسال اعلان به گوگل، یکی از curl یا allow_url_fopen لازم است.';
        return $out;
    }

    $raw = (string) eplakAppSetting($pdo, 'fcm_service_account', '');
    if (trim($raw) === '') {
        $out['error'] = 'کلید سرویس فایربیس وارد نشده است.';
        return $out;
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        $out['error'] = 'فایل کلید سرویس قابل خواندن نیست (JSON نامعتبر).';
        return $out;
    }

    $project = trim((string) ($json['project_id'] ?? ''));
    $email   = trim((string) ($json['client_email'] ?? ''));
    $key     = (string) ($json['private_key'] ?? '');

    if ($project === '' || $email === '' || $key === '') {
        $out['error'] = 'کلید سرویس ناقص است (project_id / client_email / private_key).';
        return $out;
    }
    if (strpos($key, 'BEGIN PRIVATE KEY') === false) {
        $out['error'] = 'کلید خصوصی نامعتبر است. محتوای فایل JSON را کامل و بدون تغییر وارد کنید.';
        return $out;
    }

    $out['project_id']   = $project;
    $out['client_email'] = $email;
    $out['private_key']  = $key;
    $out['configured']   = true;
    $out['ready']        = true;

    return $out;
}

/** توکن دسترسی گوگل (OAuth2) — یک ساعت معتبر است و در دیتابیس کش می‌شود */
function eplakFcmAccessToken(PDO $pdo, bool $force = false): array
{
    $out = ['token' => '', 'error' => ''];

    if (!$force) {
        $cached = (string) eplakAppSetting($pdo, 'fcm_access_token', '');
        $expiry = (int) eplakAppSetting($pdo, 'fcm_access_token_exp', '0');
        if ($cached !== '' && $expiry > time() + 60) {
            $out['token'] = $cached;
            return $out;
        }
    }

    $cfg = eplakFcmConfig($pdo);
    if (!$cfg['ready']) {
        $out['error'] = $cfg['error'];
        return $out;
    }

    $now    = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss'   => $cfg['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ];

    $input = eplakB64UrlEncode((string) json_encode($header, JSON_UNESCAPED_SLASHES))
        . '.' . eplakB64UrlEncode((string) json_encode($claims, JSON_UNESCAPED_SLASHES));

    $key = @openssl_get_privatekey($cfg['private_key']);
    if ($key === false) {
        $out['error'] = 'کلید خصوصی فایربیس قابل استفاده نیست.';
        return $out;
    }

    $signature = '';
    if (!@openssl_sign($input, $signature, $key, OPENSSL_ALGO_SHA256)) {
        $out['error'] = 'امضای درخواست فایربیس ناموفق بود.';
        return $out;
    }
    $assertion = $input . '.' . eplakB64UrlEncode($signature);

    $response = eplakHttpPost(
        'https://oauth2.googleapis.com/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $assertion,
        ]),
        20
    );

    if ($response['status'] !== 200) {
        $detail = '';
        $body   = json_decode((string) $response['body'], true);
        if (is_array($body)) {
            $detail = (string) ($body['error_description'] ?? $body['error'] ?? '');
        }
        $out['error'] = 'گرفتن توکن دسترسی گوگل ناموفق بود'
            . ($response['status'] ? ' (کد ' . $response['status'] . ')' : '')
            . ($detail !== '' ? ': ' . $detail : ($response['error'] !== '' ? ': ' . $response['error'] : ''));
        return $out;
    }

    $data = json_decode((string) $response['body'], true);
    $token = is_array($data) ? (string) ($data['access_token'] ?? '') : '';
    if ($token === '') {
        $out['error'] = 'پاسخ گوگل توکن دسترسی نداشت.';
        return $out;
    }

    $expiresIn = is_array($data) ? (int) ($data['expires_in'] ?? 3600) : 3600;
    try {
        eplakSetAppSetting($pdo, 'fcm_access_token', $token);
        eplakSetAppSetting($pdo, 'fcm_access_token_exp', (string) ($now + max(60, $expiresIn)));
    } catch (\Throwable $e) {
        /* کش ناموفق مهم نیست */
    }

    $out['token'] = $token;
    return $out;
}

/** ثبت/به‌روزرسانی توکن یک دستگاه اندروید. خروجی: true در صورت موفقیت */
function eplakFcmSaveToken(PDO $pdo, string $phone, string $token, string $platform = 'android'): bool
{
    $token = trim($token);
    if ($token === '' || strlen($token) > 400) {
        return false;
    }

    $phone = preg_replace('/[^0-9+]/', '', $phone) ?? '';
    if (strlen($phone) > 20) {
        $phone = substr($phone, 0, 20);
    }
    $platform = mb_substr(preg_replace('/[^a-z]/', '', strtolower($platform)) ?? 'android', 0, 20, 'UTF-8');

    try {
        $find = $pdo->prepare('SELECT id FROM device_tokens WHERE token = :token LIMIT 1');
        $find->execute([':token' => $token]);
        $id = (int) $find->fetchColumn();

        if ($id > 0) {
            $upd = $pdo->prepare('UPDATE device_tokens SET user_phone = :phone, platform = :platform, is_active = 1, fail_count = 0, last_error = "", last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
            $upd->execute([':phone' => $phone, ':platform' => $platform, ':id' => $id]);
            return true;
        }

        $ins = $pdo->prepare('INSERT INTO device_tokens (user_phone, token, platform, is_active, last_seen_at) VALUES (:phone, :token, :platform, 1, CURRENT_TIMESTAMP)');
        $ins->execute([':phone' => $phone, ':token' => $token, ':platform' => $platform]);
        return true;
    } catch (\Throwable $e) {
        error_log('[eplak-fcm] ذخیره‌ی توکن ناموفق: ' . $e->getMessage());
        return false;
    }
}

/** توکن‌های فعال — اگر شماره‌ها داده شود فقط همان‌ها، وگرنه همه */
function eplakFcmTokens(PDO $pdo, array $phones = [], bool $includeGuests = false): array
{
    try {
        if (!$phones) {
            return $pdo->query('SELECT * FROM device_tokens WHERE is_active = 1 ORDER BY id DESC')->fetchAll();
        }

        $clean = [];
        foreach ($phones as $phone) {
            $phone = trim((string) $phone);
            if ($phone === '' || $phone === 'all') {
                continue;
            }
            $clean[] = $phone;
        }
        if (!$clean && !$includeGuests) {
            return [];
        }

        $params = [];
        $where  = [];
        foreach ($clean as $i => $phone) {
            $key = ':p' . $i;
            $where[] = 'user_phone = ' . $key;
            $params[$key] = $phone;
        }
        if ($includeGuests) {
            $where[] = "user_phone = ''";
        }

        $sql  = 'SELECT * FROM device_tokens WHERE is_active = 1 AND (' . implode(' OR ', $where) . ') ORDER BY id DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    } catch (\Throwable $e) {
        return [];
    }
}

/** تعداد دستگاه‌های ثبت‌شده */
function eplakFcmCount(PDO $pdo, bool $onlyActive = true): int
{
    try {
        $sql = 'SELECT COUNT(*) FROM device_tokens' . ($onlyActive ? ' WHERE is_active = 1' : '');
        return (int) $pdo->query($sql)->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
}

/** حذف توکن (وقتی کاربر اعلان را خاموش می‌کند) */
function eplakFcmDeleteToken(PDO $pdo, string $token): void
{
    try {
        $stmt = $pdo->prepare('DELETE FROM device_tokens WHERE token = :token');
        $stmt->execute([':token' => trim($token)]);
    } catch (\Throwable $e) {
        /* بی‌صدا */
    }
}

/** خطاهایی که یعنی «این دستگاه دیگر معتبر نیست» و باید غیرفعال شود */
function eplakFcmErrorIsFatal(string $status, int $httpCode): bool
{
    $status = strtoupper(trim($status));
    if (in_array($status, ['UNREGISTERED', 'NOT_FOUND', 'SENDER_ID_MISMATCH'], true)) {
        return true;
    }
    return $httpCode === 404;
}

/** ارسال به یک دستگاه. خروجی: ['ok'=>bool, 'fatal'=>bool, 'error'=>string] */
function eplakFcmSendOne(PDO $pdo, array $device, string $accessToken, string $projectId, string $title, string $body, array $extra = []): array
{
    $out = ['ok' => false, 'fatal' => false, 'error' => ''];

    $token = trim((string) ($device['token'] ?? ''));
    if ($token === '') {
        $out['error'] = 'توکن دستگاه خالی است.';
        $out['fatal'] = true;
        return $out;
    }

    /* داده‌های همراه پیام باید رشته باشند */
    $data = [
        'url' => (string) ($extra['url'] ?? 'index.html'),
    ];
    if (isset($extra['id'])) {
        $data['id'] = (string) $extra['id'];
    }
    if (isset($extra['tag'])) {
        $data['tag'] = (string) $extra['tag'];
    }

    $message = [
        'message' => [
            'token'        => $token,
            'notification' => ['title' => $title, 'body' => $body],
            'android'      => [
                'priority'     => 'high',
                'notification' => [
                    'channel_id' => 'eplak_alerts',
                    'sound'      => 'default',
                    /* لمس اعلان، اپ را باز می‌کند (کلاس اصلی) */
                    'click_action' => 'OPEN_MAIN_ACTIVITY',
                ],
            ],
            'data'     => $data,
        ],
    ];

    $response = eplakHttpPost(
        'https://fcm.googleapis.com/v1/projects/' . rawurlencode($projectId) . '/messages:send',
        [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json; charset=utf-8',
        ],
        (string) json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        20
    );

    if ($response['status'] === 200) {
        $out['ok'] = true;
        return $out;
    }

    $status = '';
    $detail = '';
    $parsed = json_decode((string) $response['body'], true);
    if (is_array($parsed) && isset($parsed['error']) && is_array($parsed['error'])) {
        $status = (string) ($parsed['error']['status'] ?? '');
        $detail = (string) ($parsed['error']['message'] ?? '');
    }

    $out['error'] = trim(($response['status'] ? 'HTTP ' . $response['status'] . ' ' : '') . $status . ' ' . $detail);
    if ($out['error'] === '') {
        $out['error'] = $response['error'] !== '' ? $response['error'] : 'خطای نامشخص در ارسال به گوگل';
    }
    $out['fatal'] = eplakFcmErrorIsFatal($status, (int) $response['status']);

    return $out;
}

/**
 * ارسال اعلان به چند دستگاه.
 * خروجی: ['sent'=>int, 'failed'=>int, 'errors'=>array, 'skipped'=>string]
 */
function eplakFcmSend(PDO $pdo, array $devices, string $title, string $body, array $extra = []): array
{
    $result = ['sent' => 0, 'failed' => 0, 'errors' => [], 'skipped' => ''];

    if (!$devices) {
        return $result;
    }

    $cfg = eplakFcmConfig($pdo);
    if (!$cfg['ready']) {
        $result['skipped'] = $cfg['error'];
        return $result;
    }

    $auth = eplakFcmAccessToken($pdo);
    if ($auth['token'] === '') {
        /* یک‌بار دیگر با نادیده‌گرفتن کش امتحان می‌کنیم */
        $auth = eplakFcmAccessToken($pdo, true);
    }
    if ($auth['token'] === '') {
        $result['skipped'] = $auth['error'];
        return $result;
    }

    foreach ($devices as $device) {
        $one = eplakFcmSendOne($pdo, $device, $auth['token'], $cfg['project_id'], $title, $body, $extra);

        if ($one['ok']) {
            $result['sent']++;
            try {
                $upd = $pdo->prepare('UPDATE device_tokens SET fail_count = 0, last_error = "" WHERE id = :id');
                $upd->execute([':id' => (int) $device['id']]);
            } catch (\Throwable $e) {}
            continue;
        }

        $result['failed']++;
        $result['errors'][] = $one['error'];

        try {
            if ($one['fatal']) {
                $upd = $pdo->prepare('UPDATE device_tokens SET is_active = 0, last_error = :err, fail_count = fail_count + 1 WHERE id = :id');
            } else {
                $upd = $pdo->prepare('UPDATE device_tokens SET last_error = :err, fail_count = fail_count + 1 WHERE id = :id');
            }
            $upd->execute([':err' => mb_substr($one['error'], 0, 250, 'UTF-8'), ':id' => (int) $device['id']]);
        } catch (\Throwable $e) {}
    }

    return $result;
}

/** ارسال آزمایشی به دستگاه‌های یک شماره */
function eplakFcmNotifyPhone(PDO $pdo, string $phone, string $title, string $body, array $extra = []): array
{
    return eplakFcmSend($pdo, eplakFcmTokens($pdo, [$phone]), $title, $body, $extra);
}
