<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$send = $id > 0 ? getNotificationSendById($pdo, $id) : null;

if (!$send) {
    eplakRedirect('notifications.php');
}

$recipients = getNotificationRecipients($pdo, $id);
$readCount = 0;
foreach ($recipients as $r) {
    if ((int)$r['read_flag'] === 1) {
        $readCount++;
    }
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جزئیات اعلان شماره <?= (int)$send['id'] ?></title>
  <link rel="stylesheet" href="assets/style.css?v=6">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <link rel="stylesheet" href="assets/fontawesome/css/all.min.css">
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
        <a class="active" href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
        <a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
        <a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
        <a href="logout.php"><i class="fas fa-sign-out-alt"></i> <span>خروج</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-envelope-open-text" style="color: var(--primary-500); margin-left: 12px;"></i>
            جزئیات اعلان
          </h1>
          <p>گزارش تحویل و وضعیت خوانده شدن</p>
        </div>
        <div class="topbar-right">
          <a href="notifications.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
        </div>
      </header>

      <section class="meta-card" style="margin: 0 24px 20px;">
        <h3 style="margin-bottom:10px;"><?= htmlspecialchars($send['title']) ?></h3>
        <p style="line-height:1.9; color:var(--dark-600);"><?= nl2br(htmlspecialchars($send['body'])) ?></p>
        <div class="stats-mini" style="margin-top:16px;">
          <div class="stat-item">گیرندگان <strong><?= count($recipients) ?></strong></div>
          <div class="stat-item">خوانده شده <strong><?= $readCount ?></strong></div>
          <div class="stat-item">خوانده نشده <strong><?= count($recipients) - $readCount ?></strong></div>
          <div class="stat-item">نوع ارسال
            <strong><?= $send['target_type'] === 'all' ? 'همه کاربران' : 'کاربران انتخابی' ?></strong>
          </div>
          <div class="stat-item">زمان <strong><?= htmlspecialchars($send['created_at']) ?></strong></div>
        </div>
      </section>

      <section class="panel" style="margin: 0 24px 24px;">
        <h2><i class="fas fa-users"></i> فهرست گیرندگان</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>شماره تماس</th>
              <th>وضعیت</th>
              <th>زمان دریافت</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$recipients): ?>
              <tr><td colspan="4" style="text-align:center; padding:24px; color:var(--dark-400);">گیرنده‌ای ثبت نشده است.</td></tr>
            <?php else: ?>
              <?php foreach ($recipients as $i => $r): ?>
                <tr>
                  <td><?= $i + 1 ?></td>
                  <td dir="ltr" style="text-align:right;"><?= htmlspecialchars($r['user_phone']) ?></td>
                  <td>
                    <?php if ((int)$r['read_flag'] === 1): ?>
                      <span class="status-done" style="padding:3px 10px; border-radius:999px; font-size:12px;">خوانده شده</span>
                    <?php else: ?>
                      <span class="status-pending" style="padding:3px 10px; border-radius:999px; font-size:12px;">خوانده نشده</span>
                    <?php endif; ?>
                  </td>
                  <td style="font-size:12px; color:var(--dark-500);"><?= htmlspecialchars($r['created_at']) ?></td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</body>
</html>
