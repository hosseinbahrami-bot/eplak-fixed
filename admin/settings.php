<?php
require_once __DIR__ . '/auth.php';
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>تنظیمات پنل</title>
  <link rel="stylesheet" href="assets/style.css?v=6">
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo-light" src="assets/img/logo.png" alt="ای‌پلاک">
        <img class="logo-dark" src="assets/img/logo-light.png" alt="ای‌پلاک">
      </div>
      <nav>
        <a href="index.php">داشبورد</a>
        <a href="reports.php">گزارش‌ها</a>
        <a href="users.php">کاربران</a>
        <a href="departments.php">واحدها</a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a class="active" href="settings.php">تنظیمات</a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <h1>تنظیمات پنل</h1>
        <p>مکان توسعه و تنظیمات آینده</p>
      </header>

      <section class="panel">
        <h2>امکانات پیش‌رو</h2>
        <ul>
          <li>افزودن احراز هویت مدیر</li>
          <li>ویرایش وضعیت گزارش‌ها</li>
          <li>افزودن دسترسی‌های چندسطحی</li>
          <li>اتصال به دیتابیس واقعی و API</li>
        </ul>
      </section>
    </main>
  </div>
</body>
</html>
