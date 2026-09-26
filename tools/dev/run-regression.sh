#!/usr/bin/env bash
# ============================================================================
#  آزمون‌های خودکار پروژه — بدون نیاز به هاست یا Android Studio
#
#  اجرا:   bash tools/dev/run-regression.sh            (همه‌ی آزمون‌ها)
#          bash tools/dev/run-regression.sh fcm        (فقط آزمون فایربیس)
#          bash tools/dev/run-regression.sh syntax     (فقط بررسی نحوی)
#
#  چه چیزی آزمایش می‌شود؟
#    syntax     → همه‌ی فایل‌های PHP و JS از نظر نحوی سالم‌اند
#    notify     → «خوانده شدن» اعلان برای هر کاربر جدا، پنل درست نشان می‌دهد
#    app        → درخواست‌های اپ (خوانده‌شده، اعلان سیستمی، ثبت توکن فایربیس)
#    pushcrypto → رمزنگاری اعلان مرورگر و امضای VAPID
#    fcm        → موتور فایربیس (JWT، ارسال پیام، توکن باطل)
#    backend    → دیتابیس، بذرها، آپلود عکس، صفحات پنل
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEV="$HERE"
WORK="${EPLAK_VERIFY_DIR:-/tmp/eplak-dev-harness}"
TARGET="${1:-all}"

echo "پروژه: $ROOT"
echo "محیط آزمون: $WORK"
echo

mkdir -p "$WORK"
cd "$WORK"

# ── نصب ابزارهای لازم (یک‌بار) ─────────────────────────────────────────────
if [ ! -d node_modules/php-parser ] || [ ! -d node_modules/@php-wasm ]; then
  echo "→ نصب ابزارهای آزمون (php-parser و php-wasm)…"
  npm init -y >/dev/null 2>&1 || true
  npm install php-parser@3.7.0 @php-wasm/node --no-audit --no-fund >/dev/null 2>&1 || {
    echo "❌ نصب ابزارها ناموفق بود. اتصال اینترنت را بررسی کنید."; exit 1; }
fi

# اسکریپت‌ها داخل پوشه‌ی آزمون کپی می‌شوند تا node_modules همان‌جا پیدا شود
cp "$DEV/php-run.mjs" "$DEV/php-syntax.mjs" "$DEV/js-syntax.mjs" "$WORK/" 2>/dev/null || true
cp "$DEV/tests/"*.mjs "$WORK/" 2>/dev/null || true

export EPLAK_ROOT="$ROOT"
FAILED=0

run_step () {
  local name="$1"; shift
  printf '\n──────── %s ────────\n' "$name"
  "$@"
  local code=$?
  if [ $code -ne 0 ]; then FAILED=1; fi
  return 0
}

if [ "$TARGET" = "all" ] || [ "$TARGET" = "syntax" ]; then
  run_step "بررسی نحوی PHP" node "$WORK/php-syntax.mjs" "$ROOT"
  run_step "بررسی نحوی JS"  node "$WORK/js-syntax.mjs"  "$ROOT"
fi

for t in notify app pushcrypto fcm backend; do
  if [ "$TARGET" = "all" ] || [ "$TARGET" = "$t" ]; then
    if [ -f "$WORK/$t.test.mjs" ]; then
      run_step "آزمون $t" node "$WORK/$t.test.mjs"
    fi
  fi
done

echo
if [ $FAILED -eq 0 ]; then
  echo "✅ همه‌ی آزمون‌ها موفق بودند."
else
  echo "❌ برخی آزمون‌ها ناموفق بودند (خروجی بالا را ببینید)."
fi
exit $FAILED
