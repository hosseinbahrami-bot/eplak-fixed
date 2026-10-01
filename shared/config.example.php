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

    /* ── عکس و فیلم گزارش‌ها (api/media.php) ────────────────────────────────
       همه‌ی این مقادیر اختیاری‌اند؛ اگر حذف شوند، مقادیر پیش‌فرض اعمال می‌شود.
       نکته‌ی مهم: سقف واقعی بارگذاری به تنظیمات PHP سرور (upload_max_filesize و
       post_max_size) هم بستگی دارد. برای فیلم، این دو مقدار را روی هاست
       حداقل ۱۰۰ مگابایت بگذارید (در cPanel → MultiPHP INI Editor):

           upload_max_filesize = 100M
           post_max_size       = 120M
           max_file_uploads    = 20
           max_execution_time  = 300

       تا وقتی این مقادیر بالا نرود، سرور فیلم‌های بزرگ را با خطای ۴۱۳ رد
       می‌کند؛ اپ هم همین سقف را می‌خواند و پیام فارسی واضح نشان می‌دهد. */
    'media' => [
        'max_image_bytes'   => 12 * 1024 * 1024,    // حداکثر ۱۲ مگابایت برای هر عکس
        'max_video_bytes'   => 96 * 1024 * 1024,    // حداکثر ۹۶ مگابایت برای هر فیلم
        'max_count'         => 6,                   // حداکثر تعداد رسانه برای هر گزارش
        'max_video_seconds' => 90,                  // حداکثر طول فیلم (ثانیه)
        'hourly_limit'      => 120,                 // سقف آپلود در ساعت برای هر شماره

        /* پوشه‌ی ذخیره‌سازی فایل‌ها (پیش‌فرض: uploads/media در ریشه‌ی پروژه).
           باید توسط PHP قابل نوشتن باشد (chmod 755 تا 775). */
        // 'dir' => __DIR__ . '/../uploads/media',

        /* اگر پوشه‌ی uploads از وب قابل دسترسی است true بماند (پیش‌فرض).
           اگر هاست اجازه‌ی دسترسی مستقیم به فایل‌ها را نمی‌دهد false کنید تا
           فایل‌ها از مسیر امن api/media.php?action=file&t=TOKEN سرو شوند. */
        'public' => true,

        /* آدرس عمومی پوشه‌ی آپلود، اگر با مسیر پیش‌فرض فرق دارد. */
        // 'public_url' => 'https://eplak.ir/uploads/media',

        /* تنظیمات فشرده‌سازی عکس در اپ (راهنما برای مرورگر/اندروید) */
        'client_max_dim' => 1920,
        'client_quality' => 0.82,
    ],
];
