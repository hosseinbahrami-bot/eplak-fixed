#!/usr/bin/env bash
# ============================================================================
#  بررسی سایت زنده — آیا نسخه‌ی جدید روی eplak.ir اعمال شده است؟
#
#  اجرا:   bash tools/live-check.sh                       (آدرس پیش‌فرض)
#          bash tools/live-check.sh https://آدرس-دیگر     (آدرس دلخواه)
#
#  این اسکریپت هیچ رمز و اطلاعات محرمانه‌ای لازم ندارد؛ فقط صفحات عمومی
#  سایت را می‌خواند و نشانه‌های نسخه‌ی جدید را در آن‌ها جست‌وجو می‌کند.
# ============================================================================
set -uo pipefail

BASE="${1:-https://eplak.ir/eplak-fixed}"
BASE="${BASE%/}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
TMP="$(mktemp -d)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
STATUS="pass"      # pass | fail | unreachable
ISSUES=()

say()  { printf '%s\n' "$*"; }
hdr()  { printf '\n### %s\n\n' "$*"; }

# دانلود یک آدرس؛ خروجی: کد HTTP روی خط اول، فایل بدنه در مسیر داده‌شده
grab() {
  local url="$1" out="$2" code
  code=$(curl -sS -L --max-time 30 -A "$UA" -o "$out" -w '%{http_code}' "$url" 2>"$out.err") || code="000"
  printf '%s' "${code:-000}"
}

has() { [ -f "$1" ] && grep -qF -- "$2" "$1"; }
countof() { [ -f "$1" ] && grep -oF -- "$2" "$1" | wc -l | tr -d ' ' || echo 0; }

say "# گزارش بررسی سایت زنده"
say ""
say "- آدرس بررسی‌شده: \`$BASE\`"
say "- زمان بررسی (UTC): $(date -u '+%Y-%m-%d %H:%M')"
say "- نسخه‌ی مخزن: \`$(cd "$REPO" && git log --oneline -1 2>/dev/null | cut -c1-60)\`"

# ── ۱) صفحه‌ی ورود پنل ادمین ────────────────────────────────────────────────
hdr "۱) پنل ادمین — صفحه‌ی ورود"
LOGIN="$TMP/login.html"
CODE_LOGIN=$(grab "$BASE/admin/login.php" "$LOGIN")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_LOGIN\` |"
say "| حجم پاسخ | $(wc -c < "$LOGIN" 2>/dev/null | tr -d ' ') بایت |"
TITLE=$(grep -oE '<title>[^<]*</title>' "$LOGIN" 2>/dev/null | head -1 | sed 's/<[^>]*>//g')
say "| عنوان صفحه | ${TITLE:-—} |"
if grep -qiE 'Fatal error|Warning:|Parse error' "$LOGIN" 2>/dev/null; then
  say "| خطای PHP | ❌ دیده شد |"
  ISSUES+=("صفحه‌ی ورود پنل خطای PHP می‌دهد")
else
  say "| خطای PHP | ✅ ندارد |"
fi
if [ "$CODE_LOGIN" = "200" ] && [ "$(wc -c < "$LOGIN" 2>/dev/null | tr -d ' ')" -gt 500 ]; then
  say "| وضعیت | ✅ پنل ادمین بالاست |"
else
  say "| وضعیت | ❌ پنل ادمین جواب درست نداد |"
  STATUS="fail"
  ISSUES+=("صفحه‌ی ورود پنل در دسترس نبود (کد $CODE_LOGIN)")
fi

# ── ۲) فایل جاوااسکریپت اعلان‌ها (نشانه‌ی اصلی نسخه‌ی جدید) ─────────────────
hdr "۲) فایل \`modules/live.js\` — نشانه‌های نسخه‌ی جدید"
LIVE="$TMP/live.js"
CODE_LIVE=$(grab "$BASE/modules/live.js" "$LIVE")
say "| نشانه | روی سرور | انتظار |"
say "|---|---|---|"
check_marker() { # label marker
  local label="$1" marker="$2" live_has="❌ نیست" repo_has="—"
  if has "$LIVE" "$marker"; then live_has="✅ هست"; fi
  if [ -f "$REPO/modules/live.js" ] && grep -qF -- "$marker" "$REPO/modules/live.js"; then repo_has="✅ باید باشد"; else repo_has="— نمی‌خواهد باشد"; fi
  say "| $label | $live_has | $repo_has |"
}
check_marker "ثبت دستگاه اپ (فایربیس)" "registerAppDevice"
check_marker "کنش \`register_fcm\`" "register_fcm"
check_marker "تشخیص آماده بودن فایربیس" "isFcmReady"
check_marker "پیام «حتی وقتی برنامه بسته باشد»" "حتی وقتی برنامه بسته باشد"
say ""
say "- کد پاسخ فایل: \`$CODE_LIVE\` • حجم: $(wc -c < "$LIVE" 2>/dev/null | tr -d ' ') بایت"
say "- تعداد اشاره به fcm در فایل: \`$(countof "$LIVE" 'fcm')\`"

NEW_WEB="no"
if has "$LIVE" "registerAppDevice"; then NEW_WEB="yes"; fi

# ── ۳) سرویس اعلان سرور ────────────────────────────────────────────────────
hdr "۳) سرویس اعلان — \`api/push.php?action=config\`"
PUSH="$TMP/push.json"
CODE_PUSH=$(grab "$BASE/api/push.php?action=config" "$PUSH")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_PUSH\` |"
say "| پاسخ | \`$(head -c 300 "$PUSH" 2>/dev/null)\` |"
NEW_API="no"
if has "$PUSH" "fcm_ready"; then
  NEW_API="yes"
  say "| کلیدهای فایربیس | ✅ \`fcm_ready\` هست → کد سرور به‌روز شده |"
else
  say "| کلیدهای فایربیس | ❌ \`fcm_ready\` نیست → کد سرور قدیمی است |"
fi
if [ "$NEW_API" = "no" ] && [ "$NEW_WEB" = "no" ]; then
  STATUS="fail"
  ISSUES+=("سایت هنوز نسخه‌ی قدیم را اجرا می‌کند (بسته‌ی به‌روزرسانی آپلود نشده)")
fi

# ── ۴) نسخه‌ی فایل‌های اصلی سایت (کش‌باستر) ────────────────────────────────
hdr "۴) نسخه‌ی فایل‌های سایت (کش‌باستر)"
IDX="$TMP/index.html"
CODE_IDX=$(grab "$BASE/index.html" "$IDX")
say "- کد پاسخ: \`$CODE_IDX\` • حجم: $(wc -c < "$IDX" 2>/dev/null | tr -d ' ') بایت"
if [ -f "$IDX" ] && [ -f "$REPO/index.html" ]; then
  say ""
  say "| فایل | روی سرور | در مخزن | وضعیت |"
  say "|---|---|---|---|"
  for f in "assets/css/style.css" "modules/reports.js" "core/i18n.js" "app.js"; do
    lv=$(grep -oE "${f//./\\.}\?v=[0-9]+" "$IDX" | head -1 | grep -oE '[0-9]+$')
    rv=$(grep -oE "${f//./\\.}\?v=[0-9]+" "$REPO/index.html" | head -1 | grep -oE '[0-9]+$')
    if [ -z "$lv" ]; then lv="—"; fi
    if [ -z "$rv" ]; then rv="—"; fi
    mark="✅ یکسان"
    if [ "$lv" != "$rv" ]; then mark="⚠️ متفاوت"; fi
    say "| $f | $lv | $rv | $mark |"
  done
else
  say ""
  say "⚠️ مقایسه‌ی کش‌باستر انجام نشد (یکی از فایل‌ها خوانده نشد)."
fi

# ── ۵) فایل‌های جدید نسخه ─────────────────────────────────────────────────
hdr "۵) فایل‌های تازه‌ی نسخه (دسترسی مستقیم معمولاً بسته است)"
say "| فایل | کد پاسخ | توضیح |"
say "|---|---|---|"
for f in "shared/fcm.php" "shared/notification_reads.php" "admin/version.php" "admin/notification_view.php"; do
  # صفحه‌ی بررسی نسخه: پشت ورود پنل است؛ اگر ۳۰۲ به صفحه‌ی ورود بدهد یعنی فایل هست
  if [ "$f" = "admin/version.php" ]; then
    pc=$(grab "$BASE/$f" "$TMP/v.out")
    if [ "$pc" = "404" ]; then
      say "| $f | $pc | ❌ پیدا نشد → نسخه‌ی جدید آپلود نشده |"
      STATUS="fail"; ISSUES+=("صفحه‌ی بررسی نسخه روی سرور نیست")
    elif has "$TMP/v.out" "بررسی نسخه"; then
      say "| $f | $pc | ✅ هست و باز می‌شود |"
    elif has "$TMP/v.out" "ورود"; then
      say "| $f | $pc | ✅ هست (پشت ورود پنل) |"
    else
      say "| $f | $pc | ✅ هست |"
    fi
    continue
  fi
  c=$(grab "$BASE/$f" "$TMP/x.out")
  note="—"
  case "$c" in
    200) if [ ! -s "$TMP/x.out" ]; then note="✅ فایل هست (بدون خروجی مستقیم)"; else note="⚠️ خروجی داد — بررسی دستی لازم است"; fi ;;
    403|401) note="✅ فایل هست (دسترسی بسته است)"; ;;
    404) note="❌ پیدا نشد → نسخه‌ی جدید آپلود نشده"; STATUS="fail";;
    500) note="❌ خطای سرور"; STATUS="fail";;
    000) note="❓ پاسخ نداد";;
    *) note="کد $c";;
  esac
  say "| $f | $c | $note |"
done

# ── نتیجه‌ی نهایی ─────────────────────────────────────────────────────────
hdr "نتیجه"
if [ "$CODE_LIVE" = "000" ] && [ "$CODE_LOGIN" = "000" ]; then
  say "❓ **سایت از بیرون پاسخ نداد** — یا موقتاً پایین است، یا فقط از داخل ایران در دسترس است."
  say ""
  say "راه جایگزین: خودتان این آدرس را در مرورگر باز کنید و نتیجه را بگویید:"
  say "\`$BASE/admin/version.php\` (بعد از ورود به پنل)"
  STATUS="unreachable"
elif [ "$NEW_WEB" = "yes" ] && [ "$NEW_API" = "yes" ]; then
  say "✅ **نسخه‌ی جدید روی سایت اعمال شده است.** موتور اعلان‌ها (فایربیس) و کد سرور تازه روی سایت فعال است."
else
  say "❌ **نسخه‌ی جدید هنوز روی سایت اعمال نشده است.**"
  say ""
  say "یعنی فایل \`eplak-fixed-update.zip\` هنوز روی هاست باز نشده است."
fi

if [ ${#ISSUES[@]} -gt 0 ]; then
  say ""
  say "**نکته‌های نیازمند پیگیری:**"
  for i in "${ISSUES[@]}"; do say "- $i"; done
fi

rm -rf "$TMP"
if [ "$STATUS" = "fail" ]; then exit 1; fi
exit 0
