<?php
/* router_admin.php — روتر اختصاصی پیش‌نمایش زنده پنل مدیریت شهرداری روی پورت 8082 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// اگر کاربر ریشه را باز کرد، مستقیماً وارد پنل مدیریت شود
if ($uri === '/' || $uri === '') {
    header('Location: /admin/login.php');
    exit;
}

if ($uri === '/admin' || $uri === '/admin/') {
    header('Location: /admin/login.php');
    exit;
}

$file = __DIR__ . $uri;

// اگر فایل استاتیک است، هدرهای استاندارد اضافه و ارسال شود
if (is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mimes = [
        'css'   => 'text/css; charset=utf-8',
        'js'    => 'application/javascript; charset=utf-8',
        'png'   => 'image/png',
        'jpg'   => 'image/jpeg',
        'jpeg'  => 'image/jpeg',
        'webp'  => 'image/webp',
        'gif'   => 'image/gif',
        'svg'   => 'image/svg+xml',
        'ico'   => 'image/x-icon',
        'woff2' => 'font/woff2',
        'woff'  => 'font/woff',
        'ttf'   => 'font/ttf',
        'json'  => 'application/json; charset=utf-8'
    ];

    if (isset($mimes[$ext])) {
        header('Access-Control-Allow-Origin: *');
        header('Content-Type: ' . $mimes[$ext]);
        header('Cache-Control: public, max-age=3600');
        readfile($file);
        exit;
    }

    if ($ext === 'php') {
        require $file;
        exit;
    }
}

// بررسی فایل دارای پسوند php بدون ذکر آن در آدرس
if (is_file($file . '.php')) {
    require $file . '.php';
    exit;
}

return false;
