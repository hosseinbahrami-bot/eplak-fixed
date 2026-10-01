<?php
/* admin/settings.php — تنظیمات پنل مدیریت
   • تغییر نام کاربری و رمز عبور مدیر
   • وضعیت و آزمایش «اعلان پس‌زمینه» (Web Push) برای رسیدن اعلان در حالت قفل/بسته بودن برنامه
   • وضعیت فنی سرور (ماژول‌های لازم، سقف حجم آپلود، مسیر فایل‌های پیوست)
*/
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/../shared/fcm.php';
require_once __DIR__ . '/../shared/maptiles.php';

$adminId  = (int) ($_SESSION['admin_id'] ?? 0);
$admin    = getAdminById($pdo, $adminId);
$message  = '';
$messageType = 'danger';
$pushTestResult = null;
$mapTestResult  = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    eplakRequireCsrf();
    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'update_username') {
        $error = updateAdminUsername($pdo, $adminId, (string) ($_POST['username'] ?? ''));
        if ($error === '') {
            $_SESSION['admin_username'] = trim((string) ($_POST['username'] ?? ''));
            $message = '✅ نام کاربری با موفقیت تغییر کرد. از این پس با نام کاربری جدید وارد شوید.';
            $messageType = 'success';
        } else {
            $message = '⚠️ ' . $error;
        }
    } elseif ($action === 'update_password') {
        $error = updateAdminPassword(
            $pdo,
            $adminId,
            (string) ($_POST['current_password'] ?? ''),
            (string) ($_POST['new_password'] ?? ''),
            (string) ($_POST['confirm_password'] ?? '')
        );
        if ($error === '') {
            /* شناسه‌ی نشست پس از تغییر رمز نو می‌شود (جلوگیری از تثبیت نشست) */
            session_regenerate_id(true);
            $message = '✅ رمز عبور با موفقیت تغییر کرد. از این پس با رمز جدید وارد می‌شوید.';
            $messageType = 'success';
        } else {
            $message = '⚠️ ' . $error;
        }
    } elseif ($action === 'test_push') {
        /* ارقام فارسی/عربی و فاصله‌ها هم پذیرفته می‌شوند */
        $phone = trim((string) ($_POST['test_phone'] ?? ''));
        $phone = str_replace(
            ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩',' ','-','(',')'],
            ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9','','','',''],
            $phone
        );
        $subs   = eplakPushSubscriptions($pdo, [$phone]);
        if ($phone === '') {
            $message = '⚠️ شماره موبایل را وارد کنید.';
        } elseif (!$subs) {
            $message = '⚠️ برای شماره‌ی ' . htmlspecialchars($phone) . ' هیچ دستگاهی ثبت نشده است. '
                     . 'کاربر باید یک‌بار سایت را در مرورگر کروم گوشی باز کند، از منو «افزودن به صفحه اصلی» را بزند و اجازه‌ی اعلان را تأیید کند. '
                     . '(داخل اپ اندروید، سیستم‌عامل به WebView اجازه‌ی اعلان پس‌زمینه نمی‌دهد.)';
        } else {
            $pushTestResult = eplakWebPushSend(
                $pdo,
                $subs,
                'اعلان آزمایشی — ای‌پلاک',
                'اگر این پیام را روی گوشی می‌بینید، اعلان پس‌زمینه درست کار می‌کند.',
                ['url' => 'index.html', 'tag' => 'eplak-test-' . time()]
            );
            $message = $pushTestResult['sent'] > 0
                ? '✅ اعلان آزمایشی برای ' . (int) $pushTestResult['sent'] . ' دستگاه ارسال شد.'
                : '⚠️ ارسال آزمایشی ناموفق بود. جزئیات خطا در پایین همین صفحه آمده است.';
            $messageType = $pushTestResult['sent'] > 0 ? 'success' : 'danger';
        }
    } elseif ($action === 'regen_vapid') {
        eplakSetAppSetting($pdo, 'vapid_pem', '');
        eplakSetAppSetting($pdo, 'vapid_public', '');
        $vapid = eplakVapidKeys($pdo);
        $message = $vapid['ready']
            ? '✅ کلیدهای تازه‌ی اعلان ساخته شد. کاربران باید یک‌بار اپلیکیشن را باز کنند تا اشتراک‌شان دوباره ثبت شود.'
            : '⚠️ ساخت کلید ناموفق بود: ' . $vapid['error'];
        $messageType = $vapid['ready'] ? 'success' : 'danger';
    } elseif ($action === 'save_fcm') {
        /* کلید سرویس فایربیس (JSON) — از Firebase Console → Project settings →
           Service accounts → Generate new private key */
        $raw = trim((string) ($_POST['fcm_service_account'] ?? ''));
        if ($raw === '') {
            eplakSetAppSetting($pdo, 'fcm_service_account', '');
            $message = '✅ کلید سرویس فایربیس پاک شد. اعلان اپ اندروید غیرفعال می‌شود.';
            $messageType = 'success';
        } else {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded) || empty($decoded['project_id']) || empty($decoded['client_email']) || empty($decoded['private_key'])) {
                $message = '⚠️ محتوای کلید سرویس نامعتبر است. کل فایل JSON را (از { تا }) کپی کنید.';
                $messageType = 'danger';
            } else {
                eplakSetAppSetting($pdo, 'fcm_service_account', (string) json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
                /* توکن دسترسی قبلی باطل می‌شود تا با کلید تازه ساخته شود */
                eplakSetAppSetting($pdo, 'fcm_access_token', '');
                eplakSetAppSetting($pdo, 'fcm_access_token_exp', '0');

                $cfg = eplakFcmConfig($pdo);
                $auth = eplakFcmAccessToken($pdo, true);
                if ($cfg['ready'] && $auth['token'] !== '') {
                    $message = '✅ کلید سرویس فایربیس ذخیره شد و اتصال به گوگل برقرار است (پروژه: ' . htmlspecialchars($cfg['project_id']) . ').';
                    $messageType = 'success';
                } else {
                    $message = '⚠️ کلید ذخیره شد ولی اتصال به گوگل برقرار نشد: ' . htmlspecialchars($auth['error'] !== '' ? $auth['error'] : $cfg['error']);
                    $messageType = 'danger';
                }
            }
        }
    } elseif ($action === 'test_fcm') {
        $phone = trim((string) ($_POST['fcm_test_phone'] ?? ''));
        $phone = str_replace(
            ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩',' ','-','(',')'],
            ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9','','','',''],
            $phone
        );
        if ($phone === '') {
            $message = '⚠️ شماره موبایل را وارد کنید.';
            $messageType = 'danger';
        } else {
            $tokens = eplakFcmTokens($pdo, [$phone]);
            if (!$tokens) {
                $message = '⚠️ برای شماره‌ی ' . htmlspecialchars($phone) . ' هیچ دستگاهی از اپ اندروید ثبت نشده است. اپ باید یک‌بار با این شماره باز شود تا توکن دستگاه ثبت گردد.';
                $messageType = 'danger';
            } else {
                $result = eplakFcmSend(
                    $pdo,
                    $tokens,
                    'اعلان آزمایشی — ای‌پلاک',
                    'این پیام از پنل مدیریت برای بررسی اعلان اپ اندروید فرستاده شده است.',
                    ['url' => 'index.html', 'tag' => 'eplak-fcm-test-' . time()]
                );
                $message = $result['sent'] > 0
                    ? '✅ اعلان آزمایشی فایربیس برای ' . (int) $result['sent'] . ' دستگاه از ' . count($tokens) . ' دستگاه ارسال شد.'
                    : '⚠️ ارسال ناموفق بود: ' . htmlspecialchars(implode(' | ', array_slice($result['errors'], 0, 2)) . ' ' . $result['skipped']);
                $messageType = $result['sent'] > 0 ? 'success' : 'danger';
            }
        }
    } elseif ($action === 'save_map') {
        /* ── تنظیمات نقشه‌ی موقعیت ────────────────────────────────────────
           «خودکار» یعنی سرور خودش منابع را به ترتیب سلامت امتحان می‌کند و
           اپ هم از راه api/maptile.php کاشی می‌گیرد (در اپ اندروید مطمئن‌ترین
           مسیر، چون درخواست مستقیم به سرور کاشی خارجی اغلب بسته است). */
        $allowed = ['auto', 'neshan', 'esri', 'esri_sat', 'esri_topo', 'carto', 'osmfr', 'osm', 'wikimedia', 'custom'];
        $default = trim((string) ($_POST['map_default_source'] ?? 'auto'));
        if (!in_array($default, $allowed, true)) {
            $default = 'auto';
        }

        $neshanKey = preg_replace('/[^A-Za-z0-9\-]/', '', trim((string) ($_POST['map_neshan_key'] ?? '')));
        if ($neshanKey !== '' && strlen((string) $neshanKey) < 8) {
            $message = '⚠️ کلید «نشان» معتبر نیست. کلید را کامل از پنل platform.neshan.org کپی کنید (یا کادر را خالی بگذارید).';
            $messageType = 'danger';
        } else {
            $customTpl = trim((string) ($_POST['map_custom_tiles'] ?? ''));
            $customOk = true;
            if ($customTpl !== ''
                && (strpos($customTpl, 'https://') !== 0
                    || strpos($customTpl, '{z}') === false
                    || strpos($customTpl, '{x}') === false
                    || strpos($customTpl, '{y}') === false)) {
                $customOk = false;
                $message = '⚠️ آدرس دلخواه کاشی باید با https:// شروع شود و {z} و {x} و {y} را داشته باشد. نمونه: https://example.com/tiles/{z}/{x}/{y}.png';
                $messageType = 'danger';
            }
            if ($customOk) {
                if (strlen($customTpl) > 300) {
                    $customTpl = substr($customTpl, 0, 300);
                }
                eplakSetAppSetting($pdo, 'map_default_source', $default);
                eplakSetAppSetting($pdo, 'map_neshan_key', (string) $neshanKey);
                eplakSetAppSetting($pdo, 'map_custom_tiles', $customTpl);
                /* سلامت منابع از نو سنجیده شود تا ترتیب «خودکار» تازه باشد */
                eplakSetAppSetting($pdo, 'map_src_health', '{}');
                $sources = eplakMapSourceRegistry($pdo);
                $label = isset($sources[$default]) ? $sources[$default]['label'] : 'خودکار';
                $message = '✅ تنظیمات نقشه ذخیره شد (منبع پیش‌فرض: ' . htmlspecialchars($default === 'auto' ? 'خودکار' : $label) . ')'
                    . ($neshanKey !== '' ? ' — کلید «نشان» ثبت شد؛ نقشه‌ی فارسی نشان فعال است.' : '')
                    . ($customTpl !== '' ? ' — آدرس دلخواه کاشی ثبت شد.' : '');
                $messageType = 'success';
            }
        }
    } elseif ($action === 'test_map') {
        /* هر منبع نقشه یک‌بار «واقعاً» از روی سرور شما امتحان می‌شود تا معلوم
           شود کدام‌یک از هاست شما باز است (بدون حدس زدن). */
        @set_time_limit(150);
        $mapTestResult = eplakMapTestSources($pdo);
        $registry = eplakMapSourceRegistry($pdo);
        $names = [];
        foreach ((array) ($mapTestResult['working'] ?? []) as $id) {
            $names[] = isset($registry[$id]) ? $registry[$id]['label'] : $id;
        }
        if ($names) {
            $message = '✅ این منابع نقشه از سرور شما باز هستند: ' . implode('، ', $names)
                . '. بهترین حالت: منبع پیش‌فرض روی «خودکار» بماند تا اپ خودش همان را انتخاب کند.';
            $messageType = 'success';
        } else {
            $message = '⚠️ هیچ منبع نقشه‌ای از سرور شما پاسخ نداد. اپ در این حالت کاشی را «مستقیم» از منابع آزاد می‌گیرد؛'
                . ' اگر نقشه باز هم دیده نشد، دسترسی خروجی هاست به اینترنت (فایروال هاست) را بررسی کنید.';
            $messageType = 'danger';
        }
    } elseif ($action === 'repair_schema') {
        $report = eplakRunSchemaSync($pdo, true);
        if ($report['failed']) {
            $message = '⚠️ برخی ستون‌ها اضافه نشد: ' . implode(' | ', array_slice($report['failed'], 0, 4));
            $messageType = 'danger';
        } elseif ($report['added']) {
            $message = '✅ ساختار دیتابیس ترمیم شد. ستون‌های اضافه‌شده: ' . implode('، ', $report['added']);
            $messageType = 'success';
        } else {
            $message = '✅ ساختار دیتابیس کامل است؛ چیزی برای ترمیم نبود.';
            $messageType = 'success';
        }
    } elseif ($action === 'save_push_subject') {
        $subject = trim((string) ($_POST['vapid_subject'] ?? ''));
        if ($subject !== '' && strpos($subject, 'mailto:') !== 0 && strpos($subject, 'https://') !== 0) {
            $subject = 'mailto:' . $subject;
        }
        eplakSetAppSetting($pdo, 'vapid_subject', $subject);
        $message = '✅ نشانی تماس اعلان‌ها ذخیره شد.';
        $messageType = 'success';
    }

    $admin = getAdminById($pdo, $adminId);
}

$schemaReport  = eplakSchemaSyncReport();
$schemaVersion = (string) eplakAppSetting($pdo, 'schema_version', '');

$vapid        = eplakVapidKeys($pdo, false);
$vapidReady   = $vapid['ready'];
$pushPossible = eplakPushEnabled();
$pushStats    = getPushStats($pdo);
$pushErrors   = getPushLastErrors($pdo, 5);
$vapidSubject = (string) eplakAppSetting($pdo, 'vapid_subject', '');

/* وضعیت اعلان اپ اندروید (فایربیس/FCM) */
$fcmConfig  = eplakFcmConfig($pdo);
$fcmDevices = eplakFcmCount($pdo);
$fcmTokensTotal = eplakFcmCount($pdo, false);

/* وضعیت نقشه‌ی موقعیت */
$mapRegistry   = eplakMapSourceRegistry($pdo);
$mapDefault    = (string) eplakAppSetting($pdo, 'map_default_source', 'auto');
$mapNeshanKey  = (string) eplakAppSetting($pdo, 'map_neshan_key', '');
$mapCustom     = (string) eplakAppSetting($pdo, 'map_custom_tiles', '');
$mapCacheDir   = eplakMapCacheDir();
$mapCacheReady = is_dir($mapCacheDir) ? is_writable($mapCacheDir) : is_writable(EPLAK_ROOT . '/uploads');

/* وضعیت فنی سرور */
$uploadRoot = EPLAK_ROOT . '/uploads';
$uploadRootWritable = is_dir($uploadRoot) ? is_writable($uploadRoot) : is_writable(EPLAK_ROOT);
$driver = 'MySQL/MariaDB';
try {
    if (eplakIsSqlite($pdo)) {
        $driver = 'SQLite (حالت توسعه/پیش‌نمایش)';
    }
} catch (Throwable $e) {
}
$httpsOn = eplakIsHttpsRequest();
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تنظیمات پنل</title>
  <link rel="stylesheet" href="assets/style.css?v=9">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <style>
    .settings-grid { display: grid; gap: 20px; }
    .field-hint { font-size: 12px; color: var(--dark-500); margin-top: 6px; line-height: 1.9; }
    .kv-list { display: grid; gap: 10px; margin-top: 12px; }
    .kv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between;
              padding: 10px 14px; border: 1px solid var(--dark-200); border-radius: 12px; background: var(--dark-50); }
    .kv-key { font-size: 13px; font-weight: 600; color: var(--dark-600); }
    .kv-val { font-size: 13px; color: var(--dark-700); }
    .pill { display:inline-flex; align-items:center; gap:6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .pill-ok { background: var(--success-bg, #ecfdf5); color: var(--success, #047857); }
    .pill-bad { background: var(--danger-bg, #fef2f2); color: var(--danger, #b91c1c); }
    .key-box { direction: ltr; text-align: left; font-family: monospace; font-size: 12px; word-break: break-all;
               background: var(--dark-50); border: 1px dashed var(--dark-300); border-radius: 10px; padding: 10px 12px; }
    .two-col { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .steps { padding-right: 18px; line-height: 2.2; font-size: 13px; color: var(--dark-600); }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav>
        <a href="index.php"><i class="fas fa-chart-pie"></i> <span>داشبورد</span></a>
        <a href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="tickets.php"><i class="fas fa-ticket-alt"></i> <span>تیکت‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
        <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a class="active" href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="version.php"><i class="fas fa-clipboard-check"></i> <span>بررسی نسخه</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1><i class="fas fa-cog" style="color: var(--primary-500); margin-left: 12px;"></i> تنظیمات پنل</h1>
          <p>حساب مدیر، اعلان پس‌زمینه (نوتیفیکیشن گوشی) و وضعیت فنی سرور</p>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= $messageType === 'success' ? 'success' : 'danger' ?>">
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <section class="panel">
        <h2><i class="fas fa-user-shield"></i> حساب مدیر</h2>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">نام کاربری فعلی</span>
            <span class="kv-val"><strong><?= htmlspecialchars((string) ($admin['username'] ?? '')) ?></strong></span>
          </div>
          <div class="kv-row">
            <span class="kv-key">نقش</span>
            <span class="kv-val"><?= htmlspecialchars((string) ($admin['role'] ?? 'admin')) ?></span>
          </div>
          <div class="kv-row">
            <span class="kv-key">تاریخ ایجاد حساب</span>
            <span class="kv-val"><?= htmlspecialchars((string) ($admin['created_at'] ?? '—')) ?></span>
          </div>
        </div>

        <div class="two-col" style="margin-top: 20px;">
          <!-- تغییر نام کاربری -->
          <form method="post" class="settings-grid">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="action" value="update_username">
            <div class="form-group">
              <label for="username"><i class="fas fa-at" style="color: var(--primary-500); margin-left: 6px;"></i> نام کاربری جدید</label>
              <input class="form-control" type="text" id="username" name="username"
                     value="<?= htmlspecialchars((string) ($admin['username'] ?? '')) ?>" required autocomplete="username">
              <p class="field-hint">حداقل ۳ کاراکتر؛ حروف فارسی/انگلیسی، عدد و علامت‌های . _ - @ مجاز است.</p>
            </div>
            <div>
              <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ذخیره نام کاربری</button>
            </div>
          </form>

          <!-- تغییر رمز عبور -->
          <form method="post" class="settings-grid">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="action" value="update_password">
            <div class="form-group">
              <label for="current_password"><i class="fas fa-lock" style="color: var(--primary-500); margin-left: 6px;"></i> رمز عبور فعلی</label>
              <input class="form-control" type="password" id="current_password" name="current_password" required autocomplete="current-password">
            </div>
            <div class="form-group">
              <label for="new_password"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i> رمز عبور جدید</label>
              <input class="form-control" type="password" id="new_password" name="new_password" required autocomplete="new-password" minlength="8">
              <p class="field-hint">حداقل ۸ کاراکتر و ترکیبی از حرف و عدد.</p>
            </div>
            <div class="form-group">
              <label for="confirm_password"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i> تکرار رمز عبور جدید</label>
              <input class="form-control" type="password" id="confirm_password" name="confirm_password" required autocomplete="new-password" minlength="8">
            </div>
            <div>
              <button type="submit" class="btn btn-primary"><i class="fas fa-shield-halved"></i> تغییر رمز عبور</button>
            </div>
          </form>
        </div>
      </section>

      <section class="panel">
        <h2><i class="fas fa-bell"></i> اعلان پس‌زمینه (نوتیفیکیشن گوشی در حالت قفل)</h2>
        <p class="field-hint">
          این بخش، اعلان‌های پنل را به‌صورت «نوتیفیکیشن سیستمی گوشی» ارسال می‌کند؛ حتی وقتی صفحه قفل است
          یا شهروند برنامه را بسته است. برای فعال بودن این قابلیت، سایت باید با <strong>HTTPS</strong> باز شود،
          افزونه‌ی <strong>OpenSSL</strong> روی سرور فعال باشد و شهروند یک‌بار در اپلیکیشن اجازه‌ی اعلان را تأیید کند.
        </p>

        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">وضعیت قابلیت روی سرور</span>
            <span class="kv-val">
              <?php if ($pushPossible && $vapidReady): ?>
                <span class="pill pill-ok"><i class="fas fa-circle-check"></i> آماده</span>
              <?php else: ?>
                <span class="pill pill-bad"><i class="fas fa-triangle-exclamation"></i> نیازمند بررسی</span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">کلیدهای VAPID</span>
            <span class="kv-val">
              <?php if ($vapidReady): ?>
                ساخته شده <span class="pill pill-ok">فعال</span>
              <?php else: ?>
                ساخته نشده <span class="pill pill-bad">غیرفعال</span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">دستگاه‌های ثبت‌شده (کل / فعال)</span>
            <span class="kv-val"><?= (int) $pushStats['subscribers_all'] ?> / <?= (int) $pushStats['subscribers'] ?></span>
          </div>
          <div class="kv-row">
            <span class="kv-key">آخرین ارسال گروهی (موفق / ناموفق)</span>
            <span class="kv-val">
              <?php if ($pushStats['last_send_title'] === ''): ?>
                —
              <?php else: ?>
                «<?= htmlspecialchars($pushStats['last_send_title']) ?>» —
                <?= (int) $pushStats['last_sent'] ?> موفق، <?= (int) $pushStats['last_failed'] ?> ناموفق
                <span style="color: var(--dark-400); font-size: 12px;">(<?= htmlspecialchars($pushStats['last_send_at']) ?>)</span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">باز بودن سایت روی HTTPS</span>
            <span class="kv-val">
              <?php if ($httpsOn): ?>
                <span class="pill pill-ok">بله</span>
              <?php else: ?>
                <span class="pill pill-bad">خیر — اعلان پس‌زمینه فقط روی HTTPS (یا localhost) کار می‌کند</span>
              <?php endif; ?>
            </span>
          </div>
        </div>

        <?php if ($vapidReady): ?>
          <p class="field-hint" style="margin-top: 16px;">کلید عمومی VAPID (اپلیکیشن این را خودکار از سرور می‌خواند؛ نیازی به کار دستی نیست):</p>
          <div class="key-box"><?= htmlspecialchars((string) $vapid['public']) ?></div>
        <?php elseif (!$pushPossible): ?>
          <div class="alert alert-warning" style="margin-top: 16px;">
            افزونه‌های لازم روی سرور فعال نیستند. برای اعلان پس‌زمینه باید <code>openssl</code> و یکی از
            <code>curl</code> یا <code>allow_url_fopen</code> فعال باشند. اعلان‌های داخل برنامه بدون این‌ها هم کار می‌کنند.
          </div>
        <?php endif; ?>

        <?php if ($pushErrors): ?>
          <p class="field-hint" style="margin-top: 16px;">آخرین خطاهای ثبت‌شده (برای عیب‌یابی):</p>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>شماره</th><th>تعداد خطا</th><th>آخرین پیام</th><th>زمان</th></tr></thead>
              <tbody>
                <?php foreach ($pushErrors as $err): ?>
                  <tr>
                    <td><?= htmlspecialchars((string) ($err['user_phone'] !== '' ? $err['user_phone'] : 'مهمان')) ?></td>
                    <td><?= (int) $err['fail_count'] ?></td>
                    <td style="font-size: 12px; direction: ltr; text-align: left;"><?= htmlspecialchars(mb_substr((string) $err['last_error'], 0, 160)) ?></td>
                    <td style="font-size: 12px;"><?= htmlspecialchars((string) $err['updated_at']) ?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php endif; ?>

        <div class="two-col" style="margin-top: 20px;">
          <form method="post" class="settings-grid">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="action" value="test_push">
            <div class="form-group">
              <label for="test_phone"><i class="fas fa-mobile-screen" style="color: var(--primary-500); margin-left: 6px;"></i> ارسال اعلان آزمایشی</label>
              <input class="form-control" type="tel" id="test_phone" name="test_phone" placeholder="09xxxxxxxxx" required>
              <p class="field-hint">شماره‌ای که در اپلیکیشن اجازه‌ی اعلان داده است. بهترین روش بررسی: گوشی را قفل کنید و ببینید اعلان می‌رسد.</p>
            </div>
            <div>
              <button type="submit" class="btn btn-success"><i class="fas fa-paper-plane"></i> ارسال آزمایشی</button>
            </div>
          </form>

          <form method="post" class="settings-grid">
            <?= eplakCsrfField() ?>
            <input type="hidden" name="action" value="save_push_subject">
            <div class="form-group">
              <label for="vapid_subject"><i class="fas fa-envelope" style="color: var(--primary-500); margin-left: 6px;"></i> نشانی تماس برای سرویس‌های پوش</label>
              <input class="form-control" type="text" id="vapid_subject" name="vapid_subject"
                     value="<?= htmlspecialchars($vapidSubject) ?>" placeholder="mailto:admin@example.com" style="direction: ltr; text-align: left;">
              <p class="field-hint">استاندارد VAPID این نشانی را الزامی می‌کند (mailto: یا https:).</p>
            </div>
            <div>
              <button type="submit" class="btn btn-secondary"><i class="fas fa-save"></i> ذخیره</button>
            </div>
          </form>
        </div>

        <form method="post" style="margin-top: 18px;" onsubmit="return confirm('با ساخت کلید تازه، همه‌ی اشتراک‌های فعلی باطل می‌شوند و کاربران باید یک‌بار اپلیکیشن را باز کنند. ادامه می‌دهید؟');">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="regen_vapid">
          <button type="submit" class="btn btn-outline"><i class="fas fa-rotate"></i> ساخت مجدد کلیدهای اعلان</button>
        </form>
      </section>

      <section class="panel">
        <h2><i class="fas fa-mobile-screen-button"></i> اعلان گوشی برای اپ اندروید (فایربیس)</h2>
        <p class="field-hint" style="line-height:2; margin-bottom:14px;">
          اپ اندروید سایت را داخل WebView نشان می‌دهد و اندروید در WebView اجازه‌ی «اعلان پس‌زمینه‌ی مرورگر»
          نمی‌دهد. برای رسیدن اعلان وقتی <strong>اپ کاملاً بسته است</strong>، از سرویس فایربیس گوگل استفاده می‌شود.
          <br>
          <span style="display:inline-block; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:8px 12px; margin:6px 0;">
            📘 آموزش گام‌به‌گام کامل، همراه با عیب‌یابی:
            <code dir="ltr">docs/FIREBASE_SETUP_FA.md</code> (فارسی) و
            <code dir="ltr">docs/FIREBASE_SETUP_EN.md</code> (انگلیسی) —
            همین دو فایل داخل بسته‌ی آپلود سایت هستند.
          </span>
          <br>
          <strong>راه‌اندازی یک‌باره (۵ دقیقه):</strong>
          <ol style="margin:6px 0 0; padding-inline-start:20px; font-size:13px;">
            <li>در <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>
                یک پروژه بسازید (رایگان).</li>
            <li>در همان پروژه، یک اپ اندروید با نام بسته‌ی
                <code dir="ltr">com.example.eplakfixed</code> اضافه کنید و فایل
                <code dir="ltr">google-services.json</code> را دانلود و در پوشه‌ی
                <code dir="ltr">android-app/app/</code> قرار دهید (قبل از ساخت APK).</li>
            <li>در Firebase: ⚙️ Project settings → <strong>Service accounts</strong> →
                دکمه‌ی <strong>Generate new private key</strong> → فایل JSON دانلود می‌شود.</li>
            <li>محتوای کامل همان فایل JSON را در کادر زیر بچسبانید و ذخیره کنید.</li>
          </ol>
        </p>

        <div class="kv-list" style="margin-bottom:16px;">
          <div class="kv-row">
            <span class="kv-key">وضعیت کلید سرویس</span>
            <span class="kv-val">
              <?php if ($fcmConfig['ready']): ?>
                <span class="pill pill-ok">آماده</span>
                <span style="font-size:12px; color:var(--dark-500);" dir="ltr"><?= htmlspecialchars($fcmConfig['project_id']) ?></span>
              <?php else: ?>
                <span class="pill pill-bad">تنظیم نشده</span>
                <span style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars($fcmConfig['error']) ?></span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">دستگاه‌های ثبت‌شده‌ی اپ</span>
            <span class="kv-val">
              <strong><?= (int) $fcmDevices ?></strong> دستگاه فعال
              <?php if ($fcmTokensTotal > $fcmDevices): ?>
                <span style="font-size:12px; color:var(--dark-500);">(از <?= (int) $fcmTokensTotal ?> دستگاه ثبت‌شده)</span>
              <?php endif; ?>
            </span>
          </div>
        </div>

        <form method="post" style="display:grid; gap:14px;">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="save_fcm">
          <div class="form-group">
            <label for="fcm_service_account"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i> کلید سرویس فایربیس (محتوای فایل JSON)</label>
            <textarea class="form-control" id="fcm_service_account" name="fcm_service_account" rows="6"
                      dir="ltr" style="text-align:left; font-family:monospace; font-size:12px;"
                      placeholder='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----
...","client_email":"..."}'><?= htmlspecialchars((string) eplakAppSetting($pdo, 'fcm_service_account', '')) ?></textarea>
            <p class="field-hint">این کلید محرمانه است؛ فقط روی سرور شما ذخیره می‌شود و در گیت‌هاب قرار نمی‌گیرد. برای پاک کردن، کادر را خالی کنید و ذخیره بزنید.</p>
          </div>
          <div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ذخیره و بررسی اتصال</button>
          </div>
        </form>

        <form method="post" class="settings-grid" style="margin-top:18px;">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="test_fcm">
          <div class="form-group">
            <label for="fcm_test_phone"><i class="fas fa-paper-plane" style="color: var(--primary-500); margin-left: 6px;"></i> ارسال آزمایشی به اپ اندروید</label>
            <input class="form-control" type="tel" id="fcm_test_phone" name="fcm_test_phone" placeholder="09xxxxxxxxx" required>
            <p class="field-hint">شماره‌ای که کاربر با آن در اپ وارد شده است. گوشی را ببندید و ببینید اعلان می‌رسد.</p>
          </div>
          <div>
            <button type="submit" class="btn btn-success"><i class="fas fa-mobile-screen"></i> ارسال آزمایشی فایربیس</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <h2><i class="fas fa-map-location-dot"></i> نقشه‌ی موقعیت (کاشی نقشه از سرور خودمان)</h2>
        <p class="field-hint" style="margin-top:0;">
          اپ و پنل، موقعیت شهروند را روی نقشه نشان می‌دهند. پیش‌تر کاشی‌ها <strong>مستقیم</strong> از
          <span dir="ltr">tile.openstreetmap.org</span> گرفته می‌شد؛ آن سرور به درخواست بدون
          <em>Referer</em> (مثل WebView اپ اندروید) کد <strong>۴۰۳</strong> می‌دهد و از ایران هم کند/بسته است
          — برای همین نقشه خالی می‌ماند. حالا کاشی‌ها از <strong>سرور خود شما</strong>
          (<span dir="ltr">api/maptile.php</span>) سرو می‌شوند و سرور آن‌ها را از چند منبع می‌گیرد و روی دیسک
          کش می‌کند. اسنپ و نشان هم از <strong>داده‌ی OpenStreetMap</strong> استفاده می‌کنند و کاشی را از
          سرور داخل کشور می‌دهند؛ اگر کلید رایگان «نشان» را وارد کنید، نقشه‌ی خودِ نشان با
          <strong>برچسب فارسی</strong> فعال می‌شود.
        </p>

        <div class="kv-list" style="margin-bottom:16px;">
          <div class="kv-row">
            <span class="kv-key">منبع پیش‌فرض نقشه</span>
            <span class="kv-val">
              <?php
                $mapDefaultLabel = $mapDefault === 'auto'
                    ? 'خودکار (سرور منابع را امتحان می‌کند)'
                    : (isset($mapRegistry[$mapDefault]) ? $mapRegistry[$mapDefault]['label'] : $mapDefault);
              ?>
              <span class="pill pill-ok"><?= htmlspecialchars($mapDefaultLabel) ?></span>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">کلید «نشان» (نقشه‌ی فارسی)</span>
            <span class="kv-val">
              <?php if ($mapNeshanKey !== ''): ?>
                <span class="pill pill-ok">ثبت شده</span>
                <span style="font-size:12px; color:var(--dark-500);" dir="ltr"><?= htmlspecialchars(substr($mapNeshanKey, 0, 6) . '…') ?></span>
              <?php else: ?>
                <span class="pill pill-bad">تنظیم نشده</span>
                <span style="font-size:12px; color:var(--dark-500);">منابع آزاد بدون کلید فعال‌اند</span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">آدرس دلخواه کاشی</span>
            <span class="kv-val">
              <?php if ($mapCustom !== ''): ?>
                <span class="pill pill-ok">ثبت شده</span>
                <span style="font-size:12px; color:var(--dark-500);" dir="ltr"><?= htmlspecialchars($mapCustom) ?></span>
              <?php else: ?>
                <span class="pill pill-bad">خالی</span>
              <?php endif; ?>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">پوشه‌ی کش کاشی‌ها</span>
            <span class="kv-val">
              <?= $mapCacheReady ? '<span class="pill pill-ok">قابل نوشتن</span>' : '<span class="pill pill-bad">قابل نوشتن نیست</span>' ?>
              <span style="font-size:12px; color:var(--dark-500);" dir="ltr">uploads/map-cache</span>
            </span>
          </div>
          <div class="kv-row">
            <span class="kv-key">منابع فعال</span>
            <span class="kv-val" style="font-size:12px;">
              <?php foreach ($mapRegistry as $mapId => $mapSrc): ?>
                <?php if (!empty($mapSrc['ready'])): ?>
                  <span class="pill pill-ok" style="margin:2px;"><?= htmlspecialchars($mapSrc['label']) ?></span>
                <?php else: ?>
                  <span class="pill pill-bad" style="margin:2px;"><?= htmlspecialchars($mapSrc['label']) ?></span>
                <?php endif; ?>
              <?php endforeach; ?>
            </span>
          </div>
        </div>

        <form method="post" class="settings-grid" style="margin-bottom:18px;">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="save_map">
          <div class="form-group">
            <label for="map_default_source"><i class="fas fa-layer-group" style="color: var(--primary-500); margin-left: 6px;"></i> منبع پیش‌فرض نقشه</label>
            <select class="form-control" id="map_default_source" name="map_default_source">
              <option value="auto" <?= $mapDefault === 'auto' ? 'selected' : '' ?>>خودکار (پیشنهاد می‌شود — سرور منابع سالم را امتحان می‌کند)</option>
              <?php foreach ($mapRegistry as $mapId => $mapSrc): ?>
                <?php if (empty($mapSrc['ready'])) continue; ?>
                <option value="<?= htmlspecialchars($mapId) ?>" <?= $mapDefault === $mapId ? 'selected' : '' ?>>
                  <?= htmlspecialchars($mapSrc['label']) ?><?= $mapSrc['kind'] === 'static' ? ' — یک تصویر برای کل کادر' : '' ?>
                </option>
              <?php endforeach; ?>
            </select>
            <p class="field-hint">«خودکار» بهترین حالت است: اگر یک منبع بسته باشد، منبع بعدی امتحان می‌شود و نقشه خالی نمی‌ماند.</p>
          </div>
          <div class="form-group">
            <label for="map_neshan_key"><i class="fas fa-key" style="color: var(--primary-500); margin-left: 6px;"></i> کلید نقشه‌ی «نشان» (اختیاری — برچسب فارسی)</label>
            <input class="form-control" type="text" id="map_neshan_key" name="map_neshan_key" dir="ltr"
                   style="text-align:left; font-family:monospace;" placeholder="service.XXXXXXXXXXXXXXXX"
                   value="<?= htmlspecialchars($mapNeshanKey) ?>">
            <p class="field-hint">
              دریافت رایگان و فقط از مرورگر:
              <span dir="ltr">platform.neshan.org</span> → <strong>ثبت‌نام</strong> →
              <strong>پنل توسعه‌دهندگان</strong> → <strong>ایجاد کلید دسترسی (API Key)</strong> →
              نوع سرویس را <strong>«نقشه وب / Static Map»</strong> انتخاب کنید → در فیلد
              «دامنه/IPهای مجاز» <strong>IP یا دامنه‌ی همین سایت</strong> را بنویسید → کلید ساخته‌شده را
              اینجا کپی و ذخیره کنید.
            </p>
          </div>
          <div class="form-group">
            <label for="map_custom_tiles"><i class="fas fa-link" style="color: var(--primary-500); margin-left: 6px;"></i> آدرس دلخواه کاشی (اختیاری)</label>
            <input class="form-control" type="text" id="map_custom_tiles" name="map_custom_tiles" dir="ltr"
                   style="text-align:left; font-family:monospace; font-size:12px;"
                   placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
                   value="<?= htmlspecialchars($mapCustom) ?>">
            <p class="field-hint">اگر از سرویس نقشه‌ی دیگری (مثل مپیر) کلید و آدرس کاشی دارید، قالب آن را اینجا بگذارید؛
              <span dir="ltr">{z}</span> و <span dir="ltr">{x}</span> و <span dir="ltr">{y}</span> خودکار جای‌گذاری می‌شوند.</p>
          </div>
          <div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ذخیره‌ی تنظیمات نقشه</button>
          </div>
        </form>

        <form method="post">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="test_map">
          <button type="submit" class="btn btn-success"><i class="fas fa-vial"></i> آزمایش منابع نقشه از سرور</button>
          <span class="field-hint" style="margin-right:10px;">هر منبع یک کاشی نمونه‌ی تهران را واقعاً از سرور شما می‌گیرد و نتیجه را نشان می‌دهد (چند ثانیه طول می‌کشد).</span>
        </form>

        <?php if (is_array($mapTestResult)): ?>
          <div class="kv-list" style="margin-top:16px;">
            <?php foreach ((array) ($mapTestResult['sources'] ?? []) as $mapRow): ?>
              <div class="kv-row">
                <span class="kv-key"><?= htmlspecialchars((string) ($mapRow['label'] ?? $mapRow['id'])) ?></span>
                <span class="kv-val">
                  <?php if (!empty($mapRow['ok'])): ?>
                    <span class="pill pill-ok">کار می‌کند</span>
                    <span style="font-size:12px; color:var(--dark-500);" dir="ltr">
                      HTTP <?= (int) ($mapRow['status'] ?? 0) ?> • <?= (int) ($mapRow['ms'] ?? 0) ?> ms •
                      <?= number_format((int) ($mapRow['bytes'] ?? 0)) ?> bytes
                    </span>
                  <?php else: ?>
                    <span class="pill pill-bad">باز نشد</span>
                    <span style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars((string) ($mapRow['note'] ?? '')) ?><?= !empty($mapRow['status']) ? ' (HTTP ' . (int) $mapRow['status'] . ')' : '' ?></span>
                  <?php endif; ?>
                </span>
              </div>
            <?php endforeach; ?>
            <div class="kv-row">
              <span class="kv-key">آدرس‌یاب (مختصات → آدرس فارسی)</span>
              <span class="kv-val">
                <?php if (!empty($mapTestResult['reverse']['ok'])): ?>
                  <span class="pill pill-ok"><?= htmlspecialchars((string) ($mapTestResult['reverse']['provider'] ?? '')) ?></span>
                  <span style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars((string) ($mapTestResult['reverse']['address'] ?? '')) ?></span>
                <?php else: ?>
                  <span class="pill pill-bad">پاسخ نگرفت</span>
                  <span style="font-size:12px; color:var(--dark-500);">ثبت موقعیت با مختصات ادامه پیدا می‌کند (مشکلی برای گزارش ایجاد نمی‌کند)</span>
                <?php endif; ?>
              </span>
            </div>
          </div>
        <?php endif; ?>

        <div class="form-group" style="margin-top:18px;">
          <label><i class="fas fa-map" style="color: var(--primary-500); margin-left: 6px;"></i> پیش‌نمایش زنده‌ی نقشه (همان چیزی که شهروند در اپ می‌بیند)</label>
          <div id="adminMapPreview" style="height:260px; border-radius:14px; overflow:hidden; border:1px solid var(--dark-200);"></div>
          <p class="field-hint">اگر این کادر نقشه را نشان داد، نقشه‌ی اپ هم کار می‌کند. با دکمه‌های روی نقشه می‌توانید
            «ماهواره» و «منبع» را عوض کنید. اگر نقشه باز نشد، دکمه‌ی <strong>«آزمایش منابع نقشه از سرور»</strong> را بزنید
            تا معلوم شود کدام منبع از هاست شما باز است.</p>
        </div>
      </section>

      <section class="panel">
        <h2><i class="fas fa-circle-info"></i> وضعیت فنی سرور</h2>
        <div class="kv-list">
          <div class="kv-row"><span class="kv-key">درایور دیتابیس</span><span class="kv-val"><?= htmlspecialchars($driver) ?></span></div>
          <div class="kv-row"><span class="kv-key">نسخه PHP</span><span class="kv-val" style="direction:ltr"><?= htmlspecialchars(PHP_VERSION) ?></span></div>
          <div class="kv-row">
            <span class="kv-key">افزونه OpenSSL</span>
            <span class="kv-val"><?= function_exists('openssl_pkey_new') ? '<span class="pill pill-ok">فعال</span>' : '<span class="pill pill-bad">غیرفعال</span>' ?></span>
          </div>
          <div class="kv-row">
            <span class="kv-key">curl</span>
            <span class="kv-val"><?= function_exists('curl_init') ? '<span class="pill pill-ok">فعال</span>' : '<span class="pill pill-bad">غیرفعال</span>' ?></span>
          </div>
          <div class="kv-row"><span class="kv-key">سقف حجم هر فایل آپلود</span><span class="kv-val" style="direction:ltr"><?= htmlspecialchars((string) ini_get('upload_max_filesize')) ?></span></div>
          <div class="kv-row"><span class="kv-key">سقف کل ارسال فرم</span><span class="kv-val" style="direction:ltr"><?= htmlspecialchars((string) ini_get('post_max_size')) ?></span></div>
          <div class="kv-row">
            <span class="kv-key">پوشه‌ی فایل‌های پیوست (uploads)</span>
            <span class="kv-val"><?= $uploadRootWritable ? '<span class="pill pill-ok">قابل نوشتن</span>' : '<span class="pill pill-bad">غیرقابل نوشتن — دسترسی ۷۵۵ بدهید</span>' ?></span>
          </div>
          <div class="kv-row"><span class="kv-key">تعداد مطالب اخبار/دانستنی‌ها</span><span class="kv-val"><?= (int) getDashboardStats($pdo)['news_count'] ?> مورد</span></div>
          <div class="kv-row"><span class="kv-key">گزارش‌های دارای عکس/فیلم</span><span class="kv-val"><?= (int) getDashboardStats($pdo)['reports_with_media'] ?> مورد</span></div>
        </div>

        <h3 style="margin-top: 22px; font-size: 15px;">ساختار دیتابیس (جدول‌ها و ستون‌ها)</h3>
        <p class="field-hint">
          اگر نسخه‌ی جدید به ستون تازه‌ای نیاز داشته باشد، هنگام باز شدن پنل خودکار به دیتابیس اضافه می‌شود.
          در صورت دیدن خطای «Unknown column»، دکمه‌ی ترمیم را بزنید.
        </p>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-key">نسخه‌ی ساختار دیتابیس</span>
            <span class="kv-val" style="direction:ltr"><?= htmlspecialchars($schemaVersion !== '' ? $schemaVersion : '—') ?></span>
          </div>
          <?php if ($schemaReport['ran']): ?>
            <div class="kv-row">
              <span class="kv-key">آخرین همگام‌سازی</span>
              <span class="kv-val">
                <?php if ($schemaReport['failed']): ?>
                  <span class="pill pill-bad"><?= count($schemaReport['failed']) ?> مورد ناموفق</span>
                <?php else: ?>
                  <span class="pill pill-ok"><?= count($schemaReport['added']) ?> ستون اضافه شد</span>
                <?php endif; ?>
              </span>
            </div>
            <?php if ($schemaReport['added']): ?>
              <div class="kv-row">
                <span class="kv-key">ستون‌های تازه</span>
                <span class="kv-val" style="direction:ltr; text-align:left; word-break:break-all;"><?= htmlspecialchars(implode('، ', $schemaReport['added'])) ?></span>
              </div>
            <?php endif; ?>
          <?php endif; ?>
        </div>
        <form method="post" style="margin-top: 12px;">
          <?= eplakCsrfField() ?>
          <input type="hidden" name="action" value="repair_schema">
          <button type="submit" class="btn btn-outline"><i class="fas fa-screwdriver-wrench"></i> بررسی و ترمیم ساختار دیتابیس</button>
        </form>

        <h3 style="margin-top: 22px; font-size: 15px;">چطور مطمئن شوم اعلان در حالت قفل می‌رسد؟</h3>
        <ol class="steps">
          <li>گوشی شهروند یک‌بار اپلیکیشن را باز کند و پیام «اجازه‌ی اعلان» را تأیید کند (در iOS باید اپ به صفحه‌ی اصلی اضافه شده باشد).</li>
          <li>در پنل → «ارسال اعلان» یک پیام بفرستید، یا در همین صفحه «ارسال آزمایشی» را برای همان شماره بزنید.</li>
          <li>صفحه‌ی گوشی را قفل کنید؛ اعلان باید روی صفحه‌ی قفل ظاهر شود.</li>
          <li>اگر نرسید: وضعیت HTTPS و خطاهای بالا را بررسی کنید. TTL اعلان‌ها ۲۸ روز است؛ اگر گوشی آفلاین باشد، به‌محض آنلاین شدن تحویل داده می‌شود.</li>
        </ol>
      </section>
    </main>
  </div>

  <!-- پیش‌نمایش زنده‌ی نقشه: همان موتوری که شهروند در اپ و گزارش‌ها می‌بیند -->
  <script>window.EPLAK_API_BASE_URL = '../api';</script>
  <script src="../assets/js/ep-map.js?v=3"></script>
  <script>
    (function () {
      var box = document.getElementById('adminMapPreview');
      if (!box || !window.EplakMap) return;
      /* مرکز: ورامین — همان پیش‌فرض اپ. نقطه‌ای انتخاب نشده (hasFix=false)
         تا مدیر بتواند نقشه را بکشد و منابع مختلف را امتحان کند. */
      window.adminMapPreview = window.EplakMap.create(box, {
        lat: 35.3242, lng: 51.6455, zoom: 14, draggable: true, hasFix: false
      });
    })();
  </script>
</body>
</html>
