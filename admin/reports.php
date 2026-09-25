<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$reports = getAllReports($pdo);
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مدیریت گزارش‌ها</title>
  <link rel="stylesheet" href="assets/style.css?v=6">
  <script src="assets/theme.js?v=7"></script>
  <script src="assets/persian-digits.js?v=6"></script>
  <!-- Font Awesome for icons -->
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
        <a class="active" href="reports.php"><i class="fas fa-flag"></i> <span>گزارش‌ها</span></a>
        <a href="users.php"><i class="fas fa-users"></i> <span>کاربران</span></a>
        <a href="departments.php"><i class="fas fa-sitemap"></i> <span>واحدها</span></a>
                <a href="news.php"><i class="fas fa-newspaper"></i> <span>اخبار و دانستنی‌ها</span></a>
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
<a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
<a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1><i class="fas fa-flag" style="color: #0f766e; margin-left: 12px;"></i>مدیریت گزارش‌ها</h1>
          <p>مشاهده و بروزرسانی وضعیت گزارش‌های ثبت‌شده</p>
        </div>
        <div class="topbar-right">
          <a href="report_add.php" class="btn btn-primary">
            <i class="fas fa-plus"></i> گزارش جدید
          </a>
        </div>
      </header>

      <!-- آمار سریع -->
      <div class="stats-mini">
        <div class="stat-item">
          <i class="fas fa-list" style="color: #0f766e;"></i>
          <span>تعداد کل: <strong><?= count($reports) ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-hourglass-half" style="color: #d97706;"></i>
          <span>در انتظار: <strong><?= count(array_filter($reports, fn($r) => $r['status'] === 'در انتظار')) ?></strong></span>
        </div>
        <div class="stat-item">
          <i class="fas fa-check-circle" style="color: #16a34a;"></i>
          <span>انجام‌شده: <strong><?= count(array_filter($reports, fn($r) => $r['status'] === 'انجام‌شده')) ?></strong></span>
        </div>
      </div>

      <section class="panel">
        <div class="panel-header">
          <h2><i class="fas fa-table" style="color: #0f766e; margin-left: 10px;"></i>لیست گزارش‌ها</h2>
          <div class="panel-actions">
            <input type="text" id="searchReport" placeholder="جستجوی گزارش..." class="search-input">
            <select class="filter-select">
              <option value="all">همه وضعیت‌ها</option>
              <option value="در انتظار">در انتظار</option>
              <option value="انجام‌شده">انجام‌شده</option>
            </select>
          </div>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>عنوان</th>
                <th>کاربر</th>
                <th>واحد</th>
                <th>موقعیت</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($reports as $report): ?>
                <tr>
                  <td><span class="badge-code">#<?= htmlspecialchars($report['code']) ?></span></td>
                  <td><strong><?= htmlspecialchars($report['title']) ?></strong></td>
                  <td><i class="fas fa-user" style="color: #94a3b8; margin-left: 6px;"></i><?= htmlspecialchars($report['user_phone']) ?></td>
                  <td><?= htmlspecialchars($report['department'] ?: $report['category']) ?></td>
                  <td><?= htmlspecialchars($report['location'] ?: '—') ?></td>
                  <td>
                    <?php
                      $statusClass = $report['status'] === 'انجام‌شده' ? 'status-done' : 'status-pending';
                    ?>
                    <span class="<?= $statusClass ?>">
                      <?= htmlspecialchars($report['status']) ?>
                    </span>
                  </td>
                  <td><?= htmlspecialchars($report['created_at']) ?></td>
                  <td>
                    <div class="action-buttons">
                      <a href="report_detail.php?id=<?= (int)$report['id'] ?>" class="btn-action view" title="مشاهده و پاسخ">
                        <i class="fas fa-eye"></i>
                      </a>
                      <a href="actions.php?type=report_edit&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action edit" title="ویرایش">
                        <i class="fas fa-pen"></i>
                      </a>
                      <a href="actions.php?type=report_delete&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn-action delete" title="حذف" onclick="return confirm('آیا از حذف این گزارش اطمینان دارید؟')">
                        <i class="fas fa-trash"></i>
                      </a>
                    </div>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>