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
           - SameSite=None; Secure اجازه می‌دهد کوکی در حالت جاسازی‌شده پذیرفته شود
           - اگر مرورگر کوکی شخص‌ثالث را مسدود کند، شناسه نشست از طریق URL
             (trans_sid) منتقل می‌شود تا ورود همچنان کار کند */
        /* اگر مرورگر کوکی را نپذیرد (مثلاً کوکی‌های شخص‌ثالث در حالت
           جاسازی‌شده مسدود باشند)، شناسه نشست به‌طور خودکار در URL منتقل
           می‌شود؛ در غیر این صورت نشانی‌ها تمیز می‌مانند. */
        /* هشدار امنیتی: انتقال شناسه‌ی نشست در URL (trans_sid) امکان
           Session Fixation و نشت شناسه در لاگ/Referer را فراهم می‌کرد؛
           غیرفعال شد. نشست فقط از طریق کوکی HttpOnly منتقل می‌شود. */
        @ini_set('session.use_cookies', '1');
        @ini_set('session.use_only_cookies', '1');
        @ini_set('session.use_trans_sid', '0');
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
        session_start();
    }
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
    header('Location: ' . $target);
    exit;
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
    $host   = getenv('DB_HOST') ?: ($fileCfg['host'] ?? '127.0.0.1');
    $user   = getenv('DB_USER') ?: ($fileCfg['user'] ?? 'wigitali_root');
    $pass   = getenv('DB_PASS') ?: ($fileCfg['pass'] ?? '');
    $dbname = getenv('DB_NAME') ?: ($fileCfg['name'] ?? 'wigitali_eplak-db');

    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (\Throwable $e) {
        $pdo = new PDO("mysql:host=127.0.0.1;dbname=$dbname;charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_department_name_parent (name, parent_id),
        KEY idx_department_parent (parent_id),
        CONSTRAINT fk_department_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE CASCADE
    )");

    $defaultDepartments = [
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

    $count = (int)$pdo->query('SELECT COUNT(*) as count FROM departments')->fetch()['count'];
    if ($count === 0) {
        foreach ($defaultDepartments as $parentName => $children) {
            $parentStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, NULL, :sort_order, 1)');
            $parentStmt->execute([':name' => $parentName, ':sort_order' => 0]);
            $parentId = (int)$pdo->lastInsertId();

            foreach ($children as $index => $childName) {
                $childStmt = $pdo->prepare('INSERT INTO departments (name, parent_id, sort_order, is_active) VALUES (:name, :parent_id, :sort_order, 1)');
                $childStmt->execute([
                    ':name' => $childName,
                    ':parent_id' => $parentId,
                    ':sort_order' => $index + 1,
                ]);
            }
        }
    }

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

    $adminCount = $pdo->query('SELECT COUNT(*) as count FROM admin_users')->fetch();
    if ((int)$adminCount['count'] === 0) {
        $defaultHash = password_hash('admin123', PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (:username, :password_hash, :role)');
        $stmt->execute([
            ':username' => 'admin',
            ':password_hash' => $defaultHash,
            ':role' => 'super_admin',
        ]);
    }

    return $pdo;
}
