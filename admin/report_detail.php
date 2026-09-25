<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/includes/functions.php';

$id = (int)($_GET['id'] ?? 0);
$report = getReportById($pdo, $id);
$message = '';
$messageType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $report) {
    eplakRequireCsrf();
    $status = $_POST['status'] ?? 'pending';
    $reply = trim($_POST['reply'] ?? '');
    saveReportReply($pdo, $id, $reply, $status);
    $message = '✅ پاسخ گزارش با موفقیت ثبت شد.';
    $messageType = 'success';
    $report = getReportById($pdo, $id);
}

if ($report && !isset($report['code'])) {
    $report['code'] = 'EP-1403-' . str_pad((string)((int)$report['id'] + 1000), 4, '0', STR_PAD_LEFT);
}

if ($report && !isset($report['image_path'])) {
    $report['image_path'] = null;
}

// دریافت اطلاعات کاربر
$userInfo = null;
if ($report && !empty($report['user_phone'])) {
    $userInfo = getUserByPhone($pdo, $report['user_phone']);
}
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>جزئیات گزارش</title>
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
        <a href="notifications.php"><i class="fas fa-bell"></i> <span>ارسال اعلان</span></a>
<a href="export.php"><i class="fas fa-file-excel"></i> <span>خروجی اکسل</span></a>
<a href="settings.php"><i class="fas fa-cog"></i> <span>تنظیمات</span></a>
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>
            <i class="fas fa-file-alt" style="color: var(--primary-500); margin-left: 12px;"></i>
            جزئیات گزارش
          </h1>
          <p>مشاهده گزارش و ثبت پاسخ برای کاربر</p>
        </div>
        <div class="topbar-right">
          <a href="reports.php" class="btn btn-secondary">
            <i class="fas fa-arrow-right"></i> بازگشت
          </a>
          <?php if ($report): ?>
            <a href="report_edit.php?id=<?= (int)$report['id'] ?>" class="btn btn-warning">
              <i class="fas fa-pen"></i> ویرایش
            </a>
          <?php endif; ?>
        </div>
      </header>

      <?php if ($message): ?>
        <div class="alert alert-<?= $messageType === 'success' ? 'success' : 'danger' ?>">
          <?php if ($messageType === 'success'): ?>
            <i class="fas fa-check-circle"></i>
          <?php else: ?>
            <i class="fas fa-exclamation-circle"></i>
          <?php endif; ?>
          <?= htmlspecialchars($message) ?>
        </div>
      <?php endif; ?>

      <?php if ($report): ?>
      
      <!-- ===== بخش اطلاعات کاربر ===== -->
      <?php if ($userInfo): ?>
      <div class="user-profile-card">
        <div class="user-profile-avatar">
          <?= htmlspecialchars(mb_substr($userInfo['name'] ?? 'U', 0, 1)) ?>
        </div>
        <div class="user-profile-info">
          <h3><?= htmlspecialchars($userInfo['name'] ?? 'کاربر ناشناس') ?></h3>
          <div class="user-profile-details">
            <span><i class="fas fa-phone"></i> <?= htmlspecialchars($userInfo['phone']) ?></span>
            <?php if (!empty($userInfo['nid'])): ?>
              <span><i class="fas fa-id-card"></i> <?= htmlspecialchars($userInfo['nid']) ?></span>
            <?php endif; ?>
            <?php if (!empty($userInfo['address'])): ?>
              <span><i class="fas fa-map-pin"></i> <?= htmlspecialchars($userInfo['address']) ?></span>
            <?php endif; ?>
            <span><i class="fas fa-calendar-alt"></i> عضو از: <?= htmlspecialchars($userInfo['created_at'] ?? 'نامشخص') ?></span>
          </div>
        </div>
      </div>
      <?php endif; ?>

      <!-- ===== بخش اطلاعات گزارش ===== -->
      <div class="report-meta-grid">
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--primary-50); color: var(--primary-500);">
            <i class="fas fa-hashtag"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کد گزارش</span>
            <span class="meta-value badge-code">#<?= htmlspecialchars($report['code'] ?? '') ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--warning-bg); color: var(--warning);">
            <i class="fas fa-calendar-day"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">تاریخ ثبت</span>
            <span class="meta-value"><?= htmlspecialchars($report['created_at']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: var(--info-bg); color: var(--info);">
            <i class="fas fa-user"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">کاربر</span>
            <span class="meta-value"><?= htmlspecialchars($report['user_phone']) ?></span>
          </div>
        </div>
        <div class="meta-card">
          <div class="meta-icon" style="background: <?= $report['status'] === 'done' ? 'var(--success-bg)' : 'var(--warning-bg)' ?>; color: <?= $report['status'] === 'done' ? 'var(--success)' : 'var(--warning)' ?>;">
            <i class="fas <?= $report['status'] === 'done' ? 'fa-check-circle' : ($report['status'] === 'in_progress' ? 'fa-spinner fa-spin' : 'fa-hourglass-half') ?>"></i>
          </div>
          <div class="meta-info">
            <span class="meta-label">وضعیت</span>
            <span class="meta-value">
              <?php
                $statusClass = $report['status'] === 'done' ? 'status-done' : 
                              ($report['status'] === 'in_progress' ? 'status-progress' : 'status-pending');
                $statusText = $report['status'] === 'done' ? 'انجام‌شده' :
                             ($report['status'] === 'in_progress' ? 'در حال بررسی' : 'در انتظار');
              ?>
              <span class="<?= $statusClass ?>">
                <?php if ($statusText === 'در انتظار'): ?>
                  <i class="fas fa-hourglass-half"></i>
                <?php elseif ($statusText === 'در حال بررسی'): ?>
                  <i class="fas fa-spinner fa-spin"></i>
                <?php elseif ($statusText === 'انجام‌شده'): ?>
                  <i class="fas fa-check-circle"></i>
                <?php endif; ?>
                <?= $statusText ?>
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- ===== اطلاعات کامل گزارش ===== -->
      <section class="panel report-detail-panel">
        <h2>
          <i class="fas fa-info-circle" style="color: var(--primary-500); margin-left: 10px;"></i>
          اطلاعات گزارش
        </h2>
        
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-tag" style="color: var(--dark-400); margin-left: 6px;"></i>عنوان:</span>
            <span class="detail-value"><?= htmlspecialchars($report['title']) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-folder" style="color: var(--dark-400); margin-left: 6px;"></i>دسته‌بندی:</span>
            <span class="detail-value"><?= htmlspecialchars($report['category']) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-building" style="color: var(--dark-400); margin-left: 6px;"></i>واحد مربوطه:</span>
            <span class="detail-value"><?= htmlspecialchars($report['department'] ?: ($report['sub_department'] ?: 'ثبت نشده')) ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-sitemap" style="color: var(--dark-400); margin-left: 6px;"></i>زیرواحد:</span>
            <span class="detail-value"><?= htmlspecialchars($report['sub_department'] ?: 'ثبت نشده') ?></span>
          </div>
          <div class="detail-item">
            <span class="detail-label"><i class="fas fa-map-pin" style="color: var(--dark-400); margin-left: 6px;"></i>موقعیت:</span>
            <span class="detail-value"><?= htmlspecialchars($report['location'] ?: 'ثبت نشده') ?></span>
          </div>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-align-left" style="color: var(--dark-400); margin-left: 6px;"></i>توضیحات:</span>
            <div class="text-block"><?= nl2br(htmlspecialchars($report['description'])) ?></div>
          </div>
          <?php if (!empty($report['image_path'])): ?>
          <div class="detail-item full-width">
            <span class="detail-label"><i class="fas fa-image" style="color: var(--dark-400); margin-left: 6px;"></i>تصویر:</span>
            <div class="image-preview">
              <a href="<?= htmlspecialchars((string)$report['image_path']) ?>" target="_blank">
                <img src="<?= htmlspecialchars((string)$report['image_path']) ?>" alt="تصویر گزارش" class="report-image">
              </a>
            </div>
          </div>
          <?php endif; ?>
        </div>
      </section>

      <!-- ===== بخش پاسخ قبلی ===== -->
      <section class="panel reply-panel">
        <h2>
          <i class="fas fa-reply" style="color: var(--primary-500); margin-left: 10px;"></i>
          پاسخ قبلی
        </h2>
        <?php if ($report['reply'] !== '' && $report['reply'] !== null): ?>
          <div class="text-block reply-text">
            <div class="reply-meta">
              <span><i class="fas fa-user-check" style="color: var(--primary-500);"></i> پاسخ ادمین</span>
              <span><i class="fas fa-clock" style="color: var(--dark-400);"></i> <?= htmlspecialchars($report['updated_at'] ?? date('Y-m-d H:i')) ?></span>
            </div>
            <?= nl2br(htmlspecialchars($report['reply'])) ?>
          </div>
          <div style="margin-top: 16px;">
            <a href="actions.php?type=report_reply_delete&id=<?= (int)$report['id'] ?><?= eplakCsrfQuery() ?>" class="btn btn-danger" onclick="return confirm('آیا از حذف پاسخ این گزارش اطمینان دارید؟')">
              <i class="fas fa-trash"></i> حذف پاسخ
            </a>
          </div>
        <?php else: ?>
          <div class="empty-state">
            <i class="fas fa-comment-slash" style="font-size: 48px; color: var(--dark-300);"></i>
            <h3>پاسخی ثبت نشده</h3>
            <p>هنوز پاسخی برای این گزارش ثبت نشده است.</p>
          </div>
        <?php endif; ?>
      </section>

      <!-- ===== فرم ثبت پاسخ ===== -->
      <section class="panel reply-form-panel">
        <h2>
          <i class="fas fa-edit" style="color: var(--primary-500); margin-left: 10px;"></i>
          ثبت پاسخ جدید
        </h2>
        <form method="post" class="reply-form">
<?= eplakCsrfField() ?>
          <div class="form-group">
            <label for="status">
              <i class="fas fa-tag" style="color: var(--primary-500); margin-left: 6px;"></i>
              وضعیت گزارش
            </label>
            <div class="input-icon-wrapper">
              <i class="fas fa-flag input-icon"></i>
              <select name="status" id="status" class="form-control">
                <option value="pending" <?= $report['status'] === 'pending' ? 'selected' : '' ?>>
                  در انتظار
                </option>
                <option value="in_progress" <?= $report['status'] === 'in_progress' ? 'selected' : '' ?>>
                  در حال بررسی
                </option>
                <option value="done" <?= $report['status'] === 'done' ? 'selected' : '' ?>>
                  انجام‌شده
                </option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="reply">
              <i class="fas fa-comment" style="color: var(--primary-500); margin-left: 6px;"></i>
              متن پاسخ
            </label>
            <textarea 
              name="reply" 
              id="reply" 
              rows="6" 
              class="form-control" 
              placeholder="پاسخ خود را برای کاربر وارد کنید..."
            ><?= htmlspecialchars($report['reply'] ?? '') ?></textarea>
            <small class="help-text">پاسخ شما برای کاربر نمایش داده خواهد شد</small>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-paper-plane"></i> ثبت پاسخ
            </button>
            <button type="reset" class="btn btn-secondary">
              <i class="fas fa-undo"></i> بازنشانی
            </button>
            <a href="reports.php" class="btn btn-outline">
              <i class="fas fa-times"></i> انصراف
            </a>
          </div>
        </form>
      </section>
      
      <?php else: ?>
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i>
          گزارش مورد نظر یافت نشد.
        </div>
        <div style="margin-top: 16px;">
          <a href="reports.php" class="btn btn-primary">
            <i class="fas fa-arrow-right"></i> بازگشت به لیست گزارش‌ها
          </a>
        </div>
      <?php endif; ?>
    </main>
  </div>

  <script>
    // ===== پیش‌نمایش وضعیت هنگام انتخاب =====
    document.addEventListener('DOMContentLoaded', function() {
      const statusSelect = document.getElementById('status');
      
      if (statusSelect) {
        // نمایش وضعیت فعلی
        statusSelect.addEventListener('change', function() {
          const selectedOption = this.options[this.selectedIndex];
          const statusText = selectedOption.textContent.trim();
          
          // به‌روزرسانی meta-card وضعیت در بالا
          const statusMetaCard = document.querySelector('.meta-card:last-child .meta-value .status-pending, .meta-card:last-child .meta-value .status-progress, .meta-card:last-child .meta-value .status-done');
          
          if (statusMetaCard) {
            const statusMap = {
              'در انتظار': { class: 'status-pending', icon: 'fa-hourglass-half' },
              'در حال بررسی': { class: 'status-progress', icon: 'fa-spinner fa-spin' },
              'انجام‌شده': { class: 'status-done', icon: 'fa-check-circle' }
            };
            
            const status = statusMap[statusText] || statusMap['در انتظار'];
            statusMetaCard.className = status.class;
            statusMetaCard.innerHTML = `<i class="fas ${status.icon}"></i> ${statusText}`;
          }
        });
      }
    });
  </script>
</body>
</html>