<?php
/* ============================================================================
   ابزار بازیابی اتصال دیتابیس — ای‌پلاک
   ----------------------------------------------------------------------------
   اگر سایت پیام «اتصال به دیتابیس برقرار نشد» می‌دهد و فایل
   shared/config.php روی هاست پاک شده یا اطلاعات آن اشتباه است، با این صفحه
   می‌توانید اطلاعات دیتابیس را وارد کنید، اتصال آزمایش شود و فایل
   shared/config.php دوباره ساخته شود. هیچ داده‌ای پاک نمی‌شود.

   مهم: این فایل هیچ اطلاعات محرمانه‌ای را نمایش نمی‌دهد و به‌محض موفقیت،
   خودش را غیرفعال می‌کند تا کسی نتواند از آن سوءاستفاده کند.
   ============================================================================ */

declare(strict_types=1);

$root      = __DIR__;
$cfgPath   = $root . '/shared/config.php';
$exPath    = $root . '/shared/config.example.php';
$marker    = $root . '/shared/config.rescue-done';

function h($s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

function testConnection(array $c): array {
    $driver = $c['driver'] ?? 'mysql';
    try {
        if ($driver === 'sqlite') {
            $path = $c['sqlite_path'] ?? ($GLOBALS['root'] . '/data/eplak.sqlite');
            $dir = dirname($path);
            if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
                return [false, 'پوشه‌ی data ساخته نشد: ' . $dir];
            }
            $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $pdo->query('SELECT 1');
            return [true, 'اتصال به فایل SQLite برقرار شد.'];
        }
        $dsn = 'mysql:host=' . ($c['host'] ?? 'localhost')
             . ';dbname=' . ($c['name'] ?? '') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, (string) ($c['user'] ?? ''), (string) ($c['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 8,
        ]);
        $pdo->query('SELECT 1');
        return [true, 'اتصال به دیتابیس MySQL برقرار شد.'];
    } catch (Throwable $e) {
        return [false, $e->getMessage()];
    }
}

function readConfig(): array {
    $cfgPath = $GLOBALS['cfgPath'];
    if (!is_file($cfgPath)) return [];
    $v = @include $cfgPath;
    return is_array($v) ? $v : [];
}

function writeConfig(array $c): bool {
    $out = "<?php\n"
         . "/* shared/config.php — تنظیمات خصوصی سرور.\n"
         . "   این فایل را از روی shared/config.example.php بسازید و اطلاعات دیتابیس\n"
         . "   همین سرور را در آن بگذارید. این فایل در گیت و در بسته‌ی آپلود نیست. */\n"
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
$cfgExists  = is_file($cfgPath);
$cfg        = readConfig();
$selfGone   = is_file($marker);
$test       = testConnection($cfg);
$alreadyOk  = $cfgExists && $test[0] === true;

$message = '';
$ok      = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$selfGone) {
    $driver = ($_POST['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    $new = [
        'driver' => $driver,
        'sqlite_path' => trim((string) ($_POST['sqlite_path'] ?? '')) ?: ($root . '/data/eplak.sqlite'),
        'host' => trim((string) ($_POST['host'] ?? 'localhost')),
        'user' => trim((string) ($_POST['user'] ?? '')),
        'pass' => (string) ($_POST['pass'] ?? ''),
        'name' => trim((string) ($_POST['name'] ?? '')),
    ];
    [$connOk, $detail] = testConnection($new);
    if (!$connOk) {
        $message = '❌ اتصال برقرار نشد: ' . $detail;
    } elseif (!writeConfig($new)) {
        $message = '❌ اتصال برقرار شد ولی نوشتن فایل shared/config.php ممکن نشد. '
                 . 'دسترسی نوشتن (Permission) پوشه‌ی shared را روی 755 یا 775 بگذارید و دوباره تلاش کنید.';
    } else {
        @file_put_contents($marker, date('c'));
        $cfgExists = true; $cfg = $new; $alreadyOk = true; $ok = true;
        $message = '✅ اتصال برقرار شد و فایل shared/config.php ساخته شد. '
                 . 'حالا سایت باید سالم باشد؛ همین صفحه را ببندید.';
    }
}

/* ── بستن ابزار بعد از موفقیت (با یک کلیک) ─────────────────────────────────── */
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
    .box{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(15,23,42,.08);max-width:720px;margin:0 auto;padding:28px}
    h1{font-size:20px;margin:0 0 6px}
    h2{font-size:15px;margin:22px 0 10px;color:#334155}
    p.sub{color:#64748b;font-size:13px;margin:0 0 18px}
    .state{border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:16px;line-height:1.9}
    .ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
    .bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
    label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}
    input[type=text],input[type=password]{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;box-sizing:border-box;direction:ltr;text-align:left}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    button{margin-top:18px;background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer}
    .guide{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:14px;font-size:13px;line-height:2;color:#334155}
    code{background:#f1f5f9;border-radius:6px;padding:2px 6px;direction:ltr;unicode-bidi:embed;font-size:12.5px}
    .detail{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px 12px;font-size:12.5px;direction:ltr;text-align:left;overflow-wrap:anywhere;margin-top:10px}
    a.btn{display:inline-block;margin-top:16px;background:#059669;color:#fff;text-decoration:none;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px}
  </style>
</head>
<body>
<div class="box">
  <h1>بازیابی اتصال دیتابیس</h1>
  <p class="sub">این صفحه فقط وقتی لازم است که سایت پیام «اتصال به دیتابیس برقرار نشد» بدهد. هیچ داده‌ای پاک نمی‌شود.</p>

  <?php if ($message !== ''): ?>
    <div class="state <?= $ok ? 'ok' : 'bad' ?>"><?= h($message) ?></div>
  <?php endif; ?>

  <?php if ($selfGone && !$alreadyOk): ?>
    <div class="state warn">این ابزار قبلاً استفاده شده و غیرفعال است. اگر هنوز مشکل دارید، فایل را از بسته‌ی آپلود دوباره Extract کنید.</div>
  <?php elseif ($alreadyOk): ?>
    <div class="state ok">
      ✅ اتصال دیتابیس برقرار است. نیازی به این ابزار نیست.
      <?php if ($cfgExists): ?>(فایل <code>shared/config.php</code> موجود است.)<?php endif; ?>
    </div>
    <a class="btn" href="?disable=1">بستن و پاک کردن این ابزار</a>
    <a class="btn" style="background:#2563eb" href="admin/login.php">رفتن به پنل ادمین</a>
  <?php else: ?>
    <div class="state bad">
      ❌ اتصال برقرار نیست.
      <?php if (!$cfgExists): ?>
        فایل <code>shared/config.php</code> روی هاست <strong>وجود ندارد</strong>؛ به همین دلیل برنامه با
        مقادیر پیش‌فرض وصل می‌شود و رد می‌شود.
      <?php endif; ?>
      <div class="detail"><?= h($test[1]) ?></div>
    </div>

    <h2>اطلاعات دیتابیس را وارد کنید</h2>
    <div class="guide">
      این اطلاعات را از پنل هاست خود بردارید:
      <br>• cPanel → بخش <strong>MySQL® Databases</strong> → ستون «Databases» نام دیتابیس و ستون «Users» نام کاربری را نشان می‌دهد.
      <br>• روی سرورهای cPanel معمولاً یک پیشوند به نام دارد؛ مثلاً کاربر <code>wigitali_root</code> و دیتابیس <code>wigitali_eplak</code>.
      <br>• اگر رمز را نمی‌دانید: در همان صفحه، بخش <strong>Current Users</strong> → <strong>Change Password</strong> یک رمز تازه بگذارید و همان را این‌جا وارد کنید (داده‌ها پاک نمی‌شوند).
      <br>• دقت کنید نام دیتابیس را <strong>با پیشوند</strong> و مو‌به‌مو بنویسید.
    </div>

    <form method="post" autocomplete="off">
      <div class="row">
        <div>
          <label>سرور دیتابیس (Host)</label>
          <input type="text" name="host" value="<?= h($cfg['host'] ?? 'localhost') ?>" placeholder="localhost">
        </div>
        <div>
          <label>نام دیتابیس</label>
          <input type="text" name="name" value="<?= h($cfg['name'] ?? '') ?>" placeholder="wigitali_eplak">
        </div>
      </div>
      <div class="row">
        <div>
          <label>نام کاربری</label>
          <input type="text" name="user" value="<?= h($cfg['user'] ?? '') ?>" placeholder="wigitali_root">
        </div>
        <div>
          <label>رمز عبور</label>
          <input type="password" name="pass" value="" placeholder="رمز دیتابیس">
        </div>
      </div>

      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-size:13px;color:#475569">حالت اضطراری: استفاده از SQLite (بدون MySQL)</summary>
        <div class="guide" style="margin-top:10px">
          این حالت فقط برای زمانی است که سرور MySQL از کار افتاده باشد؛ سایت با یک فایل
          <code>data/eplak.sqlite</code> بالا می‌آید ولی داده‌های قبلی MySQL داخل آن نیست.
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:400">
          <input type="checkbox" name="driver" value="sqlite" style="width:auto"> از SQLite استفاده کن
        </label>
      </details>

      <button type="submit">آزمایش اتصال و ذخیره</button>
    </form>
  <?php endif; ?>

  <p class="sub" style="margin-top:22px">
    پس از موفقیت، این فایل خودش را غیرفعال می‌کند. اگر سایت سالم شد، می‌توانید این فایل را از هاست پاک کنید.
  </p>
</div>
</body>
</html>
