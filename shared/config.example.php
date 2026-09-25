<?php
/* shared/config.php — تنظیمات خصوصی سرور (این فایل را کپی کرده و config.php بنامید؛ در گیت قرار نمی‌گیرد)
   یا به‌جای آن متغیرهای محیطی DB_DRIVER / DB_HOST / DB_USER / DB_PASS / DB_NAME / DB_SQLITE_PATH را تنظیم کنید.

   دو حالت:
   1) MySQL (پیش‌فرض، مناسب محیط تولید):
      driver = 'mysql' + مقادیر host/user/pass/name
   2) SQLite (بدون نیاز به سرور MySQL — مناسب توسعه محلی و پیش‌نمایش):
      driver = 'sqlite' — همه‌ی جداول و داده‌های پیش‌فرض (ادمین admin/admin123)
      به‌صورت خودکار در sqlite_path ساخته می‌شوند.
*/
return [
    'driver' => 'mysql',
    'host' => '127.0.0.1',
    'user' => 'wigitali_root',
    'pass' => 'CHANGE_ME',
    'name' => 'wigitali_eplak-db',

    /* فقط در حالت driver = 'sqlite': */
    'sqlite_path' => __DIR__ . '/../data/eplak.sqlite',
];
