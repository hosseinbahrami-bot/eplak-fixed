<?php
/* ============================================================================
   ابزار بازیابی اتصال دیتابیس — ای‌پلاک
   ----------------------------------------------------------------------------
   اگر سایت پیام «اتصال به دیتابیس برقرار نشد» می‌دهد (مثلاً چون فایل
   shared/config.php روی هاست نیست)، با این صفحه در دو دقیقه درست می‌شود:
     ۱) اطلاعات دیتابیس را وارد می‌کنید
     ۲) اگر نام دیتابیس را نمی‌دانید، دکمه‌ی «پیدا کردن نام دیتابیس» را می‌زنید
     ۳) اتصال آزمایش و فایل shared/config.php ساخته می‌شود

   هیچ داده‌ای پاک نمی‌شود. این فایل هیچ رمزی را نمایش نمی‌دهد و پس از موفقیت
   با یک کلیک خودش را حذف می‌کند.
   ============================================================================ */

declare(strict_types=1);

$root    = __DIR__;
$cfgPath = $root . '/shared/config.php';
$marker  = $root . '/shared/config.rescue-done';

function h($s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

/* ── نام‌های محتمل دیتابیس بر اساس نام کاربری (پیشوند cPanel) ─────────────── */
function rescueCandidates(string $user, string $entered = ''): array {
    $out = [];
    if ($entered !== '') { $out[] = $entered; }
    $prefix = '';
    if (preg_match('/^([A-Za-z0-9]+)_/', $user, $m)) { $prefix = $m[1]; }
    $bases = ['eplak-db', 'eplak_db', 'eplak', 'eplakfixed', 'eplak-fixed', 'epalak', 'eplak_db2'];
    foreach ($bases as $b) {
        if ($prefix !== '') { $out[] = $prefix . '_' . $b; }
        $out[] = $b;
    }
    return array_values(array_unique($out));
}

/* ── آزمایش اتصال ─────────────────────────────────────────────────────────── */
function rescueTest(array $c): array {
    $driver = $c['driver'] ?? 'mysql';
    try {
        if ($driver === 'sqlite') {
            $path = (string) ($c['sqlite_path'] ?? ($GLOBALS['root'] . '/data/eplak.sqlite'));
            $dir = dirname($path);
            if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
                return [false, 'پوشه‌ی data ساخته نشد: ' . $dir];
            }
            $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $pdo->query('SELECT 1');
            return [true, 'اتصال به فایل SQLite برقرار شد.'];
        }
        $host = (string) ($c['host'] ?? 'localhost');
        $name = (string) ($c['name'] ?? '');
        $dsn  = 'mysql:host=' . $host . ($name !== '' ? ';dbname=' . $name : '') . ';charset=utf8mb4';
        $pdo  = new PDO($dsn, (string) ($c['user'] ?? ''), (string) ($c['pass'] ?? ''), [
            PDO::ATTR_ERRMODE  => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT  => 8,
        ]);
        $pdo->query('SELECT 1');
        return [true, 'اتصال به دیتابیس MySQL برقرار شد.'];
    } catch (Throwable $e) {
        return [false, $e->getMessage()];
    }
}

/* ── جست‌وجوی نام درست دیتابیس ─────────────────────────────────────────────── */
function rescueDiscover(array $c): array {
    $results = [];
    $found   = '';
    foreach (rescueCandidates((string) $c['user'], (string) $c['name']) as $name) {
        $try = $c; $try['name'] = $name;
        [$okTest, $msg] = rescueTest($try);
        $results[] = ['name' => $name, 'ok' => $okTest, 'msg' => $msg];
        if ($okTest) { $found = $name; break; }
    }
    return [$found, $results];
}

function readConfig(): array {
    if (!is_file($GLOBALS['cfgPath'])) return [];
    $v = @include $GLOBALS['cfgPath'];
    return is_array($v) ? $v : [];
}

function writeConfig(array $c): bool {
    $out = "<?php\n"
         . "/* shared/config.php — تنظیمات خصوصی سرور (ساخته‌شده با ابزار بازیابی).\n"
         . "   این فایل اطلاعات دیتابیس همین سرور است و در گیت/بسته‌ی آپلود نیست. */\n"
         . "return [\n"
         . "    'driver' => " . var_export($c['driver'], true) . ",\n";
    if (($c['driver'] ?? '') === 'sqlite') {
        $out .= "    'sqlite_path' => " . var_export($c['sqlite_path'], true) . ",\n";
    } else {
        $out .= "    'host' => " . var_export($c['host'], true) . ",\n"
              . "    'user' => " . var_export($c['user'], true) . ",\n"
              . "    'pass' => " . var_export($c['pass'], true) . ",\n"
              . "    'name' => " . var_export($c['name'], true) . ",\n";
    }
    $out .= "    'sqlite_path' => __DIR__ . '/../data/eplak.sqlite',\n];\n";
    $tmp = $GLOBALS['cfgPath'] . '.tmp';
    if (@file_put_contents($tmp, $out) === false) return false;
    return @rename($tmp, $GLOBALS['cfgPath']);
}

/* ── وضعیت فعلی ───────────────────────────────────────────────────────────── */
$cfgExists = is_file($cfgPath);
$cfg       = readConfig();
[$connOk, $connDetail] = rescueTest($cfg);
$alreadyOk = $cfgExists && $connOk;

$message = ''; $ok = false;
$discoverResults = null; $discoveredName = '';

/* مقادیر پیش‌فرض فرم: مقادیر فایل موجود، یا حدس معقول از پیام خطای سایت */
$formHost = (string) ($_POST['host'] ?? $cfg['host'] ?? 'localhost');
$formUser = (string) ($_POST['user'] ?? $cfg['user'] ?? 'wigitali_root');
$formName = (string) ($_POST['name'] ?? $cfg['name'] ?? 'wigitali_eplak-db');
$formPass = (string) ($_POST['pass'] ?? '');
$formDriver = (($_POST['driver'] ?? $cfg['driver'] ?? 'mysql') === 'sqlite') ? 'sqlite' : 'mysql';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? 'save');
    $new = [
        'driver'      => $formDriver,
        'sqlite_path' => $root . '/data/eplak.sqlite',
        'host'        => trim($formHost),
        'user'        => trim($formUser),
        'pass'        => $formPass,
        'name'        => trim($formName),
    ];

    if ($action === 'discover') {
        [$found, $rows] = rescueDiscover($new);
        $discoverResults = $rows;
        if ($found !== '') {
            $discoveredName = $found;
            $formName = $found;
            $forSave = $new; $forSave['name'] = $found;
            if (writeConfig($forSave)) {
                $ok = true;
                $message = '✅ نام درست دیتابیس پیدا شد: «' . $found . '» — اتصال برقرار و فایل shared/config.php ساخته شد.';
                $cfg = $forSave; $alreadyOk = true; $cfgExists = true;
            } else {
                $message = '✅ نام درست دیتابیس: «' . $found . '» (اتصال برقرار شد) ولی نوشتن فایل shared/config.php ممکن نشد. '
                         . 'دسترسی نوشتن پوشه‌ی shared را 755 یا 775 بگذارید و دوباره تلاش کنید.';
            }
        } else {
            $message = '❌ هیچ‌کدام از نام‌های محتمل دیتابیس با این نام کاربری/رمز باز نشد. '
                     . 'اطلاعات را از cPanel → MySQL® Databases بردارید (جدول پایین را ببینید).';
        }
    } else {
        [$okTest, $detail] = rescueTest($new);
        if (!$okTest) {
            $message = '❌ اتصال برقرار نشد: ' . $detail;
            if (stripos($detail, 'Unknown database') !== false) {
                $message .= ' — احتمالاً نام دیتابیس اشتباه است؛ دکمه‌ی «پیدا کردن نام دیتابیس» را بزنید.';
            } elseif (stripos($detail, 'Access denied') !== false) {
                $message .= ' — نام کاربری یا رمز اشتباه است؛ در cPanel بخش Current Users روی Change Password بزنید و رمز تازه بگذارید.';
            }
        } elseif (!writeConfig($new)) {
            $message = '❌ اتصال برقرار شد ولی نوشتن فایل shared/config.php ممکن نشد. '
                     . 'دسترسی (Permission) پوشه‌ی shared را روی 755 یا 775 بگذارید و دوباره تلاش کنید.';
        } else {
            @file_put_contents($marker, date('c'));
            $cfg = $new; $cfgExists = true; $alreadyOk = true; $ok = true;
            $message = '✅ اتصال برقرار شد و فایل shared/config.php ساخته شد. حالا سایت باید سالم باشد.';
        }
    }
}

/* ── حذف ابزار پس از موفقیت ───────────────────────────────────────────────── */
if (isset($_GET['disable']) && $alreadyOk) {
    @file_put_contents($marker, date('c'));
    @unlink(__FILE__);
    header('Location: admin/login.php');
    exit;
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>بازیابی اتصال دیتابیس — ای‌پلاک</title>
  <style>
    body{font-family:Vazirmatn,Tahoma,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:24px}
    .box{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(15,23,42,.08);max-width:760px;margin:0 auto;padding:28px}
    h1{font-size:20px;margin:0 0 6px}
    h2{font-size:15px;margin:24px 0 10px;color:#334155;border-top:1px solid #e2e8f0;padding-top:18px}
    p.sub{color:#64748b;font-size:13px;margin:0 0 18px;line-height:2}
    .state{border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:16px;line-height:1.9}
    .ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
    .bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
    label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}
    input[type=text],input[type=password]{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;box-sizing:border-box;direction:ltr;text-align:left}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
    button{border:0;border-radius:10px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer}
    .b1{background:#2563eb;color:#fff}
    .b2{background:#0f766e;color:#fff}
    .guide{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;font-size:13px;line-height:2;color:#334155}
    code{background:#f1f5f9;border-radius:6px;padding:2px 6px;direction:ltr;unicode-bidi:embed;font-size:12.5px}
    .detail{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px 12px;font-size:12.5px;direction:ltr;text-align:left;overflow-wrap:anywhere;margin-top:10px}
    a.btn{display:inline-block;margin-top:16px;background:#059669;color:#fff;text-decoration:none;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
    th,td{text-align:right;padding:7px 6px;border-bottom:1px dashed #e2e8f0}
    th{color:#64748b;font-weight:600}
    .yes{color:#047857;font-weight:700}
    .no{color:#b91c1c}
    .ltr{direction:ltr;text-align:left;font-family:monospace;font-size:12px}
    details summary{cursor:pointer;font-size:13px;color:#475569}
  </style>
</head>
<body>
<div class="box">
  <h1>بازیابی اتصال دیتابیس</h1>
  <p class="sub">بدون این تنظیمات، سایت پیام «اتصال به دیتابیس برقرار نشد» می‌دهد. هیچ داده‌ای پاک نمی‌شود؛ فقط «کلید اتصال» ساخته می‌شود.</p>

  <?php if ($message !== ''): ?>
    <div class="state <?= $ok ? 'ok' : 'bad' ?>"><?= h($message) ?></div>
  <?php endif; ?>

  <?php if ($alreadyOk): ?>
    <div class="state ok">
      ✅ اتصال دیتابیس برقرار است. نیازی به تنظیم نیست.
      <?php if ($cfgExists): ?>(فایل <code>shared/config.php</code> موجود است.)<?php endif; ?>
    </div>
    <a class="btn" href="admin/login.php">رفتن به پنل ادمین</a>
    <a class="btn" style="background:#b91c1c" href="?disable=1">بستن و پاک کردن این ابزار از هاست</a>
  <?php else: ?>

    <div class="state bad">
      ❌ اتصال برقرار نیست.
      <?php if (!$cfgExists): ?>
        فایل <code>shared/config.php</code> روی هاست <strong>وجود ندارد</strong>؛ به همین دلیل برنامه با مقادیر
        پیش‌فرض داخل کد وصل می‌شود و رد می‌شود.
      <?php endif; ?>
      <div class="detail"><?= h($connDetail) ?></div>
    </div>

    <h2>۱) اطلاعات دیتابیس را وارد کنید</h2>
    <div class="guide">
      این چهار مقدار از پنل هاست شما می‌آید: <strong>cPanel → بخش MySQL® Databases</strong>
      <br>• جدول <strong>Current Databases</strong> → ستون Databases = <strong>نام دیتابیس</strong>
      <br>• جدول <strong>Current Users</strong> → ستون Users = <strong>نام کاربری</strong>
      <br>• <strong>رمز عبور</strong> قابل دیدن نیست؛ اگر یادتان نیست روی همان کاربر <strong>Change Password</strong> بزنید
      و رمز تازه بگذارید (هیچ داده‌ای پاک نمی‌شود).
      <br>• میزبان (Host) روی اکثر هاست‌ها <code>localhost</code> است.
      <br>• نام‌ها معمولاً با پیشوند اکانت هستند؛ مثلاً <code>wigitali_eplak-db</code>.
    </div>

    <form method="post" autocomplete="off">
      <div class="row">
        <div>
          <label>سرور دیتابیس (Host)</label>
          <input type="text" name="host" value="<?= h($formHost) ?>" placeholder="localhost">
        </div>
        <div>
          <label>نام دیتابیس</label>
          <input type="text" name="name" value="<?= h($formName) ?>" placeholder="wigitali_eplak-db">
        </div>
      </div>
      <div class="row">
        <div>
          <label>نام کاربری</label>
          <input type="text" name="user" value="<?= h($formUser) ?>" placeholder="wigitali_root">
        </div>
        <div>
          <label>رمز عبور</label>
          <input type="password" name="pass" value="" placeholder="رمز دیتابیس">
        </div>
      </div>

      <div class="btns">
        <button class="b1" type="submit" name="action" value="save">آزمایش اتصال و ذخیره</button>
        <button class="b2" type="submit" name="action" value="discover">نمی‌دانم نام دیتابیس چیست — خودت پیدا کن</button>
      </div>

      <details style="margin-top:16px">
        <summary>حالت اضطراری: استفاده از SQLite (بدون MySQL)</summary>
        <div class="guide" style="margin-top:10px">
          فقط اگر سرور MySQL از کار افتاده باشد. سایت با یک فایل <code>data/eplak.sqlite</code> بالا می‌آید
          ولی <strong>داده‌های قبلی MySQL داخل آن نیست</strong> (سایت خالی می‌شود).
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:400">
          <input type="checkbox" name="driver" value="sqlite" style="width:auto" <?= $formDriver === 'sqlite' ? 'checked' : '' ?>> از SQLite استفاده کن
        </label>
      </details>
    </form>

    <?php if (is_array($discoverResults)): ?>
      <h2>۲) نتیجه‌ی جست‌وجوی نام دیتابیس</h2>
      <table>
        <thead><tr><th>نام آزمایش‌شده</th><th>نتیجه</th></tr></thead>
        <tbody>
        <?php foreach ($discoverResults as $r): ?>
          <tr>
            <td class="ltr"><?= h($r['name']) ?></td>
            <td>
              <?php if ($r['ok']): ?>
                <span class="yes">✅ اتصال برقرار شد</span>
              <?php else: ?>
                <span class="no">—</span>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <p class="sub">اگر همه ناموفق بودند، یعنی نام کاربری/رمز اشتباه است یا دیتابیس روی این سرور با نام دیگری است؛ در cPanel نام دقیق را بردارید.</p>
    <?php endif; ?>

  <?php endif; ?>

  <p class="sub" style="margin-top:22px">
    پس از موفقیت، با دکمه‌ی بالای صفحه این فایل از هاست پاک می‌شود. این ابزار هیچ رمزی را نمایش نمی‌دهد.
  </p>
</div>
</body>
</html>
