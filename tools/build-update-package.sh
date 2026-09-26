#!/usr/bin/env bash
# ============================================================================
#  ساخت بسته‌ی آپلود سایت:  tools/build-update-package.sh
#  ----------------------------------------------------------------------------
#  این اسکریپت از کد فعلی یک فایل zip می‌سازد که می‌توانید در هاست Extract کنید.
#  داخل بسته فقط «کد» است؛ این‌ها عمداً قرار نمی‌گیرند تا داده‌ی سایت پاک نشود:
#     data/  ·  uploads/  ·  shared/config.php  ·  .git/
#
#  اجرا:   bash tools/build-update-package.sh
#  خروجی:  eplak-fixed-update.zip  در ریشه‌ی پروژه
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="eplak-fixed-update.zip"

echo "→ ساخت $OUT از کد فعلی…"
rm -f "$OUT"

zip -q -r "$OUT" . \
  -x ".git/*" ".arena/*" "node_modules/*" \
     "android-app/*" "backend/*" "views/*" "tools/*" \
     "data/*" "uploads/*" "test-fixtures/*" \
     "*.zip" ".gitignore" ".gitattributes" ".vscode/*" \
     "INSTALL_GUIDE_FA.md" "*/README.md" "docs/README.md" "docs/technical-architecture.md"

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "✅ آماده شد: $OUT  (${SIZE} ، ${COUNT} فایل)"
echo
echo "بررسی سریع محتوای بسته:"
# فهرست بسته یک‌بار خوانده می‌شود (pipefail + grep -q باعث خطای کاذب می‌شد)
LIST="$(unzip -Z1 "$OUT")"
has() { printf '%s\n' "$LIST" | grep -Fxq "$1"; }

for f in .htaccess index.html index.php sw.js manifest.json shared/bootstrap.php \
         shared/webpush.php shared/media.php shared/notification_reads.php \
         api/push.php api/media.php api/reports.php api/notifications.php \
         admin/settings.php admin/login.php admin/report_detail.php admin/notification_view.php \
         core/storage.js modules/reports.js modules/live.js modules/dashboard.js \
         docs/DEPLOY_UPDATE_FA.md docs/DEPLOY_UPDATE_EN.md; do
  if has "$f"; then echo "   ✅ $f"; else echo "   ❌ $f گم شده!"; exit 1; fi
done
for f in shared/config.php data/eplak.sqlite uploads/.htaccess; do
  if has "$f"; then echo "   ❌ $f نباید داخل بسته باشد!"; exit 1; fi
done
echo "   ✅ داده‌های کاربران و تنظیمات سرور داخل بسته نیستند"
