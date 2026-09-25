<?php
if (!defined('EPLAK_ROOT')) {
    define('EPLAK_ROOT', dirname(__DIR__));
}

function eplakIsHttpsRequest(): bool {
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    $fwdProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($fwdProto === 'https') {
        return true;
    }
    $fwdPort = (string) ($_SERVER['HTTP_X_FORWARDED_PORT'] ?? '');
    return $fwdPort === '443';
}

function eplakStartSession(string $name): void {
    if (session_status() === PHP_SESSION_NONE) {
        /* سازگاری با اجرا پشت پروکسی/پیش‌نمایشِ جاسازی‌شده (iframe):
           اگر مرورگر کوکی شخص‌ثالث را مسدود کند، شناسه نشست از طریق URL
           منتقل می‌شود (به‌جای trans_sidِ رسمی که در PHP 8.5 غیرفعال/منسوخ
           شده؛ پیاده‌سازی داخلی: eplakAdoptUrlSessionId + eplakSessionUrlRewriter).
           در حالت عادی (کوکی پذیرفته می‌شود) نشانی‌ها تمیز می‌مانند و
           هیچ شناسه‌ای در URL ظاهر نمی‌شود. */
        @ini_set('session.use_cookies', '1');
        @ini_set('session.use_strict_mode', '1');
        @ini_set('session.cookie_httponly', '1');

        if (eplakIsHttpsRequest()) {
            session_set_cookie_params([
                'path'     => '/',
                'secure'   => true,
                'httponly' => true,
                'samesite' => 'None',
            ]);
        } else {
            session_set_cookie_params([
                'path'     => '/',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        session_name($name);
        eplakAdoptUrlSessionId();
        session_start();

        /* اگر کوکی نشست در این درخواست نبود (مرورگر کوکی را بلوک کرده)،
           بافر خروجی بازنویس‌کننده فعال می‌شود تا لینک‌ها و فرم‌ها شناسه
           نشست را در URL حمل کنند. */
        if (empty($_COOKIE[$name]) && session_status() === PHP_SESSION_ACTIVE) {
            ob_start('eplakSessionUrlRewriter');
        }
    }
}

/* قبل از session_start: اگر این درخواست کوکی نشست نداشته باشد ولی شناسه
   نشست را در پارامتر (?eplak_admin=...) یا فیلد پنهان فرم لاگین حمل
   کرده باشد، آن را می‌پذیریم. strict-mode شناسه‌های نامعتبر (غیرموجود در
   مخزن نشست) را رد می‌کند، پس سوءاستفاده از این مسیر برای hijack نمی‌شود.
   باید بعد از session_name() و قبل از session_start() فراخوانی شود. */
function eplakAdoptUrlSessionId(): void {
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    if (!empty($_COOKIE[session_name()])) {
        return; // حالت عادی: فقط کوکی معتبر است و مقادیر URL نادیده گرفته می‌شوند
    }
    $candidate = $_REQUEST[session_name()] ?? $_REQUEST['PHPSESSID'] ?? '';
    if (is_string($candidate) && preg_match('/^[a-zA-Z0-9]{10,100}$/', $candidate)) {
        session_id($candidate);
    }
}

/* بافر خروجی (فقط در حالتِ بلوک‌شدن کوکی): attributes href/src نسبی را بازنویسی
   می‌کند و یک فیلد پنهان در فرم‌ها می‌گذارد تا شناسه نشست در URL بماند.
   نشانی‌های خارجی/سکیم‌دار دست‌نخورده می‌مانند. */
function eplakSessionUrlRewriter(string $html, int $phase = 0): string {
    $id = session_id();
    if ($id === '' || $html === '') {
        return $html;
    }
    $name = session_name();
    $tag  = $name . '=' . rawurlencode($id);

    $html = preg_replace_callback(
        '/\b(href|src)\s*=\s*(["\'])([^\'"<>\s]+)\2/i',
        static function (array $m) use ($name, $tag): string {
            $url = $m[3];
            if ($url === '') {
                return $m[0];
            }
            if ($url[0] === '#') {
                return $m[0];
            }
            if (preg_match('#^(https?:)?//#i', $url) || preg_match('#^(javascript|mailto|tel|data):#i', $url)) {
                return $m[0];
            }
            if (strpos($url, $name . '=') !== false) {
                return $m[0]; // شناسه نشست را از قبل در بر دارد
            }
            return $m[1] . '=' . $m[2] . $url . (strpos($url, '?') === false ? '?' : '&') . $tag . $m[2];
        },
        $html
    );

    $hidden = '<input type="hidden" name="' . $name . '" value="' . $id . '">';
    $html   = preg_replace_callback('/<form\b[^>]*>/i', static fn(array $m): string => $m[0] . $hidden, $html);

    return $html;
}

function eplakSessionInUrlNeeded(): bool {
    $name = session_name();
    return session_status() !== PHP_SESSION_NONE
        && $name !== ''
        && session_id() !== ''
        && empty($_COOKIE[$name]);
}

/* هدایت سازگار با محیط‌هایی که کوکی را نمی‌پذیرند:
   اگر مرورگر کوکی نشست را نفرستاده باشد، شناسه نشست به نشانی مقصد افزوده
   می‌شود تا نشست بعد از هدایت هم حفظ گردد. در حالت عادی (کوکی فعال)
   نشانی‌ها دقیقاً همان قبل می‌مانند. */
function eplakRedirect(string $target): void {
    // فقط مسیرهای نسبی/داخلی — جلوگیری از Open Redirect
    if (preg_match('#^(https?:)?//#i', $target)) {
        $target = 'index.php';
    }
    /* مسیر نسبی را به مسیر مطلق (از ریشه) تبدیل می‌کنیم؛ برخی پروکسی/پیش‌نمایش‌ها
       Location نسبی را درست حل نمی‌کنند و کاربر را به‌جای پنل ادمین به ریشه‌ی
       اپ می‌فرستند (مثلاً «index.php» به‌جای /admin/index.php). */
    if ($target === '' || $target[0] !== '/') {
        $path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
        $dir  = rtrim(dirname($path), '/');
        $target = $dir . '/' . $target;
    }
    /* اگر مرورگر کوکی نشست را نپذیرد (مثلاً پیش‌نمایش جاسازی‌شده/iframe)،
       شناسه نشست را در نشانی مقصد هم می‌بریم تا نشست بعد از هدایت حفظ شود؛
       در حالت عادی (کوکی فعال) نشانی بدون تغییر می‌ماند. */
    if (eplakSessionInUrlNeeded()) {
        $sep    = (strpos($target, '?') === false) ? '?' : '&';
        $target .= $sep . rawurlencode((string) session_name()) . '=' . rawurlencode((string) session_id());
    }
    header('Location: ' . $target);
    exit;
}

/* ─────────────────────────────────────────────────────────────────────────────
   درایور دیتابیس:
   - پیش‌فرض: mysql (همان رفتار قدیمی)
   - حالت توسعه/پیش‌نمایش بدون سرور MySQL: driver = sqlite
     (با متغیر محیطی DB_DRIVER یا کلید 'driver' در shared/config.php)
   در حالت sqlite، فایل دیتابیس پیش‌فرض data/eplak.sqlite در ریشه‌ی پروژه است
   و همه‌ی جداول + داده‌های پیش‌فرض به‌صورت خودکار ساخته می‌شوند.
   ───────────────────────────────────────────────────────────────────────────── */

function eplakIsSqlite(PDO $pdo): bool {
    return strtolower((string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite';
}

/* واحدهای اداری پیش‌فرض — مشترک بین مسیر MySQL و SQLite */
function eplakDefaultDepartments(): array {
    return [
        'حوزه شهردار' => ['دفتر شهردار', 'روابط عمومی و امور بین‌الملل', 'بازرسی و ارزیابی عملکرد', 'حراست', 'امور حقوقی', 'شورای مشاوران'],
        'معاونت اداری و مالی' => ['منابع انسانی', 'امور اداری', 'امور مالی و حسابداری', 'بودجه و برنامه‌ریزی', 'تدارکات و پشتیبانی', 'فناوری اطلاعات (IT)'],
        'معاونت فنی و عمرانی' => ['طراحی و اجرای پروژه‌های عمرانی', 'ساخت و نگهداری معابر', 'پل‌ها و تونل‌ها', 'ساختمان‌های عمومی', 'تأسیسات شهری'],
        'معاونت شهرسازی و معماری' => ['صدور پروانه ساختمانی', 'پایان کار ساختمان', 'کنترل و نظارت ساختمانی', 'طرح‌های توسعه شهری', 'کمیسیون‌های شهرسازی'],
        'معاونت خدمات شهری' => ['نظافت شهری', 'مدیریت پسماند', 'فضای سبز', 'زیباسازی شهر', 'آرامستان‌ها', 'کنترل حیوانات شهری'],
        'معاونت حمل‌ونقل و ترافیک' => ['مدیریت ترافیک', 'پارکینگ‌ها', 'حمل‌ونقل عمومی', 'پایانه‌ها', 'ایمنی و علائم راهنمایی'],
        'معاونت فرهنگی و اجتماعی' => ['فرهنگسراها', 'کتابخانه‌ها', 'امور جوانان', 'امور بانوان', 'مشارکت‌های مردمی', 'ورزش همگانی'],
        'معاونت برنامه‌ریزی و توسعه' => ['آمار و اطلاعات', 'پژوهش و نوآوری', 'مدیریت پروژه', 'هوشمندسازی شهر'],
        'سازمان‌ها و شرکت‌های وابسته' => ['سازمان مدیریت پسماند', 'سازمان آتش‌نشانی و خدمات ایمنی', 'سازمان پارک‌ها و فضای سبز', 'سازمان زیباسازی', 'سازمان حمل‌ونقل بار و مسافر', 'سازمان میادین و بازارها', 'سازمان آرامستان‌ها', 'سازمان فناوری اطلاعات و ارتباطات', 'سازمان فرهنگی، اجتماعی و ورزشی', 'سازمان سرمایه‌گذاری و مشارکت‌های مردمی', 'شرکت بهره‌برداری مترو (در شهرهای دارای مترو)', 'شرکت واحد اتوبوسرانی', 'شرکت نوسازی و بهسازی شهری'],
    ];
}

/* کاربر پیش‌فرض ادمین را در صورت خالی بودن جدول می‌سازد */
function eplakSeedDefaultAdmin(PDO $pdo): void {
    $count = (int) $pdo->query('SELECT COUNT(*) as count FROM admin_users')->fetch()['count'];
    if ($count === 0) {
        $stmt = $pdo->prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (:username, :password_hash, :role)');
        $stmt->execute([
            ':username'      => 'admin',
            ':password_hash' => password_hash('admin123', PASSWORD_DEFAULT),
            ':role'          => 'super_admin',
        ]);
    }
}

/* واحدهای اداری پیش‌فرض را در صورت خالی بودن جدول می‌سازد */
function eplakSeedDefaultDepartments(PDO $pdo): void {
    $count = (int) $pdo->query('SELECT COUNT(*) as count FROM departments')->fetch()['count'];
    if ($count !== 0) {
        return;
    }
    foreach (eplakDefaultDepartments() as $parentName => $children) {
        $parentStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, NULL, :sort_order, 1)');
        $parentStmt->execute([':name' => $parentName, ':sort_order' => 0]);
        $parentId = (int) $pdo->lastInsertId();

        foreach ($children as $index => $childName) {
            $childStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, :parent_id, :sort_order, 1)');
            $childStmt->execute([
                ':name'      => $childName,
                ':parent_id' => $parentId,
                ':sort_order' => $index + 1,
            ]);
        }
    }
}

/* توابع کمکی برای سازگاری SQLهای MySQL با SQLite (بدون تغییر کوئری‌های اپ) —
   سازگار با PHP 7.4 تا 8.5 (در 8.5 از Pdo\Sqlite استفاده می‌شود) */
function eplakSqliteCreateFunction(PDO $pdo, string $name, callable $fn, int $numArgs): void {
    if (method_exists($pdo, 'createFunction')) {
        $pdo->createFunction($name, $fn, $numArgs);
        return;
    }
    @$pdo->sqliteCreateFunction($name, $fn, $numArgs);
}

function eplakRegisterSqliteFunctions(PDO $pdo): void {
    eplakSqliteCreateFunction($pdo, 'concat', function (...$args): string {
        $out = '';
        foreach ($args as $a) {
            $out .= $a === null ? '' : (string) $a;
        }
        return $out;
    }, -1);

    eplakSqliteCreateFunction($pdo, 'lpad', function ($value, $length, $pad): string {
        return str_pad((string) $value, max(0, (int) $length), (string) $pad, STR_PAD_LEFT);
    }, 3);

    eplakSqliteCreateFunction($pdo, 'now', static function (): string {
        return date('Y-m-d H:i:s');
    }, 0);

    /* معادل ساده‌ی DATE_FORMAT() — فقط توکن‌های رایج */
    eplakSqliteCreateFunction($pdo, 'date_format', function ($value, $format = '%Y-%m-%d') {
        if ($value === null) {
            return null;
        }
        $ts = strtotime((string) $value);
        if ($ts === false) {
            return null;
        }
        $map = [
            '%Y' => 'Y', '%y' => 'y', '%m' => 'm', '%c' => 'n', '%d' => 'd', '%e' => 'j',
            '%H' => 'H', '%k' => 'G', '%i' => 'i', '%s' => 's', '%S' => 's', '%T' => 'H:i:s',
            '%M' => 'F', '%b' => 'M', '%W' => 'l', '%a' => 'D', '%p' => 'A',
        ];
        $phpFormat = strtr((string) $format, $map);
        return date($phpFormat, $ts);
    }, 2);
}

/* اسکیمای کامل SQLite — معادل اسکیمای نهایی MySQL (شامل ستون‌های ارتقاء‌یافته) */
function eplakSqliteBootstrap(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        category VARCHAR(100) DEFAULT '',
        department VARCHAR(255) DEFAULT '',
        priority VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL DEFAULT '',
        address VARCHAR(500) DEFAULT '',
        nid VARCHAR(20) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        send_id INT,
        read_flag TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS notification_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL DEFAULT 'all',
        recipients_count INT NOT NULL DEFAULT 0,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        department VARCHAR(255) DEFAULT '',
        sub_department VARCHAR(255) DEFAULT '',
        location VARCHAR(500) DEFAULT '',
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(20) NOT NULL DEFAULT 'news',
        title VARCHAR(255) NOT NULL,
        summary TEXT,
        body TEXT NOT NULL,
        icon VARCHAR(50),
        image_url VARCHAR(500),
        published TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        parent_id INT,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        slug VARCHAR(255),
        code VARCHAR(50),
        description TEXT,
        icon VARCHAR(50),
        color VARCHAR(7) DEFAULT '#0f766e',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_department_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE
    )");

    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_department_name_parent ON departments(name, parent_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_department_parent ON departments(parent_id)');

    eplakSeedDefaultDepartments($pdo);
    eplakSeedDefaultAdmin($pdo);
}

/* کوئری upsert جدول users — سازگار با هر دو درایور */
function eplakUsersUpsertSql(PDO $pdo, bool $keepDefaultName = false): string {
    $base = 'INSERT INTO users (phone, name, address, nid) VALUES (:phone, :name, :address, :nid) ';
    if (eplakIsSqlite($pdo)) {
        $nameExpr = $keepDefaultName
            ? 'CASE WHEN (excluded.name <> "" AND excluded.name <> "شهروند") THEN excluded.name WHEN name <> "" THEN name ELSE excluded.name END'
            : 'CASE WHEN excluded.name = "" THEN name ELSE excluded.name END';
        return $base . 'ON CONFLICT(phone) DO UPDATE SET
            name = ' . $nameExpr . ',
            address = CASE WHEN excluded.address <> "" THEN excluded.address ELSE address END,
            nid = CASE WHEN excluded.nid <> "" THEN excluded.nid ELSE nid END';
    }
    $nameExpr = $keepDefaultName
        ? 'IF(VALUES(name) != "" AND VALUES(name) != "شهروند", VALUES(name), IF(name != "", name, VALUES(name)))'
        : 'IF(VALUES(name) = "", name, VALUES(name))';
    return $base . 'ON DUPLICATE KEY UPDATE
            name = ' . $nameExpr . ',
            address = IF(VALUES(address) != "", VALUES(address), address),
            nid = IF(VALUES(nid) != "", VALUES(nid), nid)';
}

function eplakGetPdo(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    /* اطلاعات اتصال: اول متغیرهای محیطی، سپس فایل خصوصی shared/config.php
       (خارج از گیت — نمونه: shared/config.example.php). رمز عبور دیگر در کد نیست. */
    $fileCfg = [];
    $cfgPath = __DIR__ . '/config.php';
    if (is_file($cfgPath)) {
        $loaded = include $cfgPath;
        if (is_array($loaded)) {
            $fileCfg = $loaded;
        }
    }
    $driver = strtolower((string) (getenv('DB_DRIVER') ?: ($fileCfg['driver'] ?? 'mysql')));
    $host   = getenv('DB_HOST') ?: ($fileCfg['host'] ?? '127.0.0.1');
    $user   = getenv('DB_USER') ?: ($fileCfg['user'] ?? 'wigitali_root');
    $pass   = getenv('DB_PASS') ?: ($fileCfg['pass'] ?? '');
    $dbname = getenv('DB_NAME') ?: ($fileCfg['name'] ?? 'wigitali_eplak-db');

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    /* ── حالت توسعه/پیش‌نمایش: SQLite بدون نیاز به سرور MySQL ─────────────── */
    if ($driver === 'sqlite') {
        $path = getenv('DB_SQLITE_PATH') ?: ($fileCfg['sqlite_path'] ?? EPLAK_ROOT . '/data/eplak.sqlite');
        $dir  = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("ساخت مسیر دیتابیس SQLite ممکن نشد: $dir");
        }
        try {
            if (class_exists('Pdo\\Sqlite')) {
                $pdo = new Pdo\Sqlite('sqlite:' . $path, null, null, $options);
            } else {
                $pdo = new PDO('sqlite:' . $path, null, null, $options);
            }
        } catch (\Throwable $e) {
            throw new \RuntimeException('اتصال به دیتابیس SQLite برقرار نشد (' . $e->getMessage() . ').', 0, $e);
        }
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA foreign_keys=ON');
        eplakRegisterSqliteFunctions($pdo);
        eplakSqliteBootstrap($pdo);
        return $pdo;
    }

    /* ── حالت پیش‌فرض: MySQL/MariaDB ──────────────────────────────────────── */
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, $options);
    } catch (\Throwable $e) {
        /* تلاش دوم از روی همان دیتابیس روی 127.0.0.1؛ اگر این هم شکست بخورد
           خطا را با پیام مشخص پرتاب می‌کنیم تا به‌جای «صفحه سفید»،
           صفحه‌ی خطای خوانا در admin/includes/db.php نمایش داده شود. */
        try {
            $pdo = new PDO("mysql:host=127.0.0.1;dbname=$dbname;charset=utf8mb4", $user, $pass, $options);
        } catch (\Throwable $e2) {
            throw new \RuntimeException(
                'اتصال به دیتابیس MySQL برقرار نشد (' . $e2->getMessage() . '). '
                . 'بررسی کنید: ۱) MySQL روشن باشد، ۲) دیتابیس «' . $dbname . '» وجود داشته باشد، '
                . '۳) فایل shared/config.php (کپی از shared/config.example.php) یا متغیرهای محیطی '
                . 'DB_HOST / DB_USER / DB_PASS / DB_NAME با اطلاعات درست تنظیم شده باشند، '
                . '۴) اکستنشن pdo_mysql در PHP فعال باشد. '
                . 'برای اجرا بدون سرور MySQL می‌توانید درایور sqlite را فعال کنید '
                . '(DB_DRIVER=sqlite یا driver=sqlite در shared/config.php).',
                0,
                $e2
            );
        }
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        category VARCHAR(100) DEFAULT '',
        department VARCHAR(255) DEFAULT '',
        priority VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL DEFAULT '',
        address VARCHAR(500) DEFAULT '',
        nid VARCHAR(20) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        send_id INT NULL,
        read_flag TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS notification_sends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL DEFAULT 'all',
        recipients_count INT NOT NULL DEFAULT 0,
        created_by VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_phone VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        department VARCHAR(255) DEFAULT '',
        sub_department VARCHAR(255) DEFAULT '',
        location VARCHAR(500) DEFAULT '',
        status VARCHAR(50) DEFAULT 'pending',
        reply TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(20) NOT NULL DEFAULT 'news',
        title VARCHAR(255) NOT NULL,
        summary TEXT NULL,
        body TEXT NOT NULL,
        icon VARCHAR(50) NULL,
        image_url VARCHAR(500) NULL,
        published TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        slug VARCHAR(255) NULL,
        code VARCHAR(50) NULL,
        description TEXT NULL,
        icon VARCHAR(50) NULL,
        color VARCHAR(7) DEFAULT '#0f766e',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_department_name_parent (name, parent_id),
        KEY idx_department_parent (parent_id),
        CONSTRAINT fk_department_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE
    )");

    /* به‌روزرسانی اسکیمای قدیمی (فقط MySQL — در SQLite اسکیمای کامل ساخته می‌شود) */
    foreach (['reply', 'department', 'sub_department', 'location'] as $column) {
        $col = $pdo->query("SHOW COLUMNS FROM reports LIKE '$column'")->fetch();
        if (!$col) {
            if ($column === 'reply') {
                $pdo->exec('ALTER TABLE reports ADD COLUMN reply TEXT NULL');
            } elseif ($column === 'department') {
                $pdo->exec('ALTER TABLE reports ADD COLUMN department VARCHAR(255) DEFAULT ""');
            } elseif ($column === 'sub_department') {
                $pdo->exec('ALTER TABLE reports ADD COLUMN sub_department VARCHAR(255) DEFAULT ""');
            } else {
                $pdo->exec('ALTER TABLE reports ADD COLUMN location VARCHAR(500) DEFAULT ""');
            }
        }
    }

    foreach (['category', 'department', 'priority'] as $column) {
        $col = $pdo->query("SHOW COLUMNS FROM tickets LIKE '$column'")->fetch();
        if (!$col) {
            if ($column === 'category') {
                $pdo->exec('ALTER TABLE tickets ADD COLUMN category VARCHAR(100) DEFAULT ""');
            } elseif ($column === 'department') {
                $pdo->exec('ALTER TABLE tickets ADD COLUMN department VARCHAR(255) DEFAULT ""');
            } else {
                $pdo->exec('ALTER TABLE tickets ADD COLUMN priority VARCHAR(20) DEFAULT "medium"');
            }
        }
    }

    $departmentColumns = [
        'slug' => 'VARCHAR(255) NULL',
        'code' => 'VARCHAR(50) NULL',
        'description' => 'TEXT NULL',
        'icon' => 'VARCHAR(50) NULL',
        'color' => 'VARCHAR(7) DEFAULT "#0f766e"',
        'updated_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ];
    foreach ($departmentColumns as $column => $definition) {
        $col = $pdo->query("SHOW COLUMNS FROM departments LIKE '$column'")->fetch();
        if (!$col) {
            $pdo->exec("ALTER TABLE departments ADD COLUMN `$column` $definition");
        }
    }

    eplakSeedDefaultDepartments($pdo);
    eplakSeedDefaultAdmin($pdo);

    return $pdo;
}
