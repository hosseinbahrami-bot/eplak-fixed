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

# ── ۱-۲) اگر سایت خطای دیتابیس دارد، متن دقیق خطا را نشان بده ──────────────
if [ "$CODE_LOGIN" = "500" ]; then
  hdr "۱-۲) ⚠️ متن دقیق خطای سرور"
  python3 - "$LOGIN" <<'PYEOF'
import re, sys, html
try:
    raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
except Exception as e:
    print('  (خواندن پاسخ ممکن نشد:', e, ')'); raise SystemExit
m = re.search(r'<div class="detail">(.*?)</div>', raw, re.S)
detail = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''
title = re.search(r'<h1>(.*?)</h1>', raw, re.S)
print('  پیام:', html.unescape(re.sub(r'<[^>]+>', '', title.group(1))).strip() if title else '—')
print('  جزئیات فنی:', detail if detail else '—')
body = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
hints = [h.strip() for h in re.findall(r'<li>(.*?)</li>', raw, re.S)]
if hints:
    print()
    print('  راه‌حل‌های پیشنهادی خود سایت:')
    for h in hints[:4]:
        print('   •', html.unescape(re.sub(r'<[^>]+>', '', h)).strip()[:180])
PYEOF
  say ""
  say "**🛠 راه‌حل سریع:** این آدرس را در مرورگر باز کنید و اطلاعات دیتابیس را وارد کنید:"
  say ""
  say "\`$BASE/rescue-db.php\`"
  say ""
  say "اگر این فایل روی هاست نیست، از بسته‌ی آپلود (\`eplak-fixed-update.zip\`) آن را Extract کنید"
  say "یا از این آدرس دانلود و در همین پوشه بگذارید:"
  say "\`https://github.com/hosseinbahrami-bot/eplak-fixed/raw/arena/01a0db08-eplak-fixed/rescue-db.php\`"
  say ""
  say "اطلاعات دیتابیس در cPanel → **MySQL® Databases** است (ستون Databases و Users)."
  say ""
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
check_marker "اعلان‌های داخل برنامه" "اعلان‌های داخل برنامه فعال است"
check_marker "کنش حذف اعلان" "deleteNotifications"
check_marker "اعلان فوری پس از ثبت درخواست" "refreshNotificationsNow"
say ""
say "- کد پاسخ فایل: \`$CODE_LIVE\` • حجم: $(wc -c < "$LIVE" 2>/dev/null | tr -d ' ') بایت"
say "- تعداد اشاره به fcm در فایل: \`$(countof "$LIVE" 'fcm')\`"

NEW_WEB="no"
NEW_ONLINE="no"
SMOKE_OK="no"
ENGINE_OK="no"
NEW_VER_PAGE="no"
APK_FCM="no"
RESCUE_PRESENT="no"
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

# ── ۳-۲) سرویس اعلان‌های کاربر (وضعیت خوانده‌شدن برای هر کاربر) ─────────────
hdr "۳-۲) فهرست اعلان‌های کاربر — \`api/notifications.php\`"
NOTIF="$TMP/notif.json"
CODE_NOTIF=$(grab "$BASE/api/notifications.php?phone=09000000000&device=probe-device" "$NOTIF")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_NOTIF\` |"
HEADNOTIF="$(head -c 300 "$NOTIF" 2>/dev/null)"
say "| پاسخ | \`$HEADNOTIF\` |"
if has "$NOTIF" "\"unread\"" && has "$NOTIF" "notifications"; then
  say "| وضعیت | ✅ سرویس اعلان‌های کاربر بالاست |"
  NEW_NOTIF="yes"
else
  say "| وضعیت | ❌ پاسخ مورد انتظار نبود |"
  NEW_NOTIF="no"
  STATUS="fail"
  ISSUES+=("سرویس api/notifications.php پاسخ درست نداد")
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

# ── ۵) بررسی وجود موتور فایربیس (بدون دسترسی مستقیم) ─────────────────────
hdr "۵) فایل‌های جدید نسخه"
say "> پوشه‌ی \`shared/\` در فایل \`.htaccess\` عمداً مسدود شده است (امنیت)؛ پس"
say "> ۴۰۴ گرفتن از آن **طبیعی** است و نشانه‌ی نبودن فایل نیست."
say ""
say "| فایل | کد پاسخ | تفسیر |"
say "|---|---|---|"

# shared/* → ۴۰۴ طبیعی است؛ وجود واقعی‌شان از روی api/push.php فهمیده می‌شود
for f in "shared/fcm.php" "shared/notification_reads.php"; do
  c=$(grab "$BASE/$f" "$TMP/x.out")
  case "$c" in
    404) note="✅ طبیعی است (پوشه‌ی محافظت‌شده)" ;;
    200) note="✅ فایل هست و مستقیم هم باز می‌شود (محافظت غیرفعال)" ;;
    403|401) note="✅ طبیعی است (پوشه‌ی محافظت‌شده)" ;;
    000) note="❓ پاسخ نداد" ;;
    *) note="کد $c" ;;
  esac
  say "| $f | $c | $note |"
done

# بررسی واقعی وجود موتور فایربیس از روی پاسخ سرور
if has "$PUSH" "fcm_ready"; then
  say "| موتور فایربیس (از روی \`api/push.php\`) | $CODE_PUSH | ✅ نصب است و اجرا می‌شود |"
  ENGINE_OK="yes"
else
  say "| موتور فایربیس (از روی \`api/push.php\`) | $CODE_PUSH | ❌ نصب نشده |"
  ENGINE_OK="no"
fi

# صفحه‌ی بررسی نسخه‌ی پنل (پشت ورود) و دیگر صفحات پنل
for f in "admin/version.php" "admin/notification_view.php" "admin/notifications.php" "admin/settings.php"; do
  pc=$(grab "$BASE/$f" "$TMP/p.out")
  if [ "$pc" = "404" ]; then
    note="❌ روی سرور نیست"
    if [ "$f" = "admin/version.php" ]; then ISSUES+=("صفحه‌ی «بررسی نسخه» هنوز آپلود نشده است (بسته‌ی قدیمی‌تر روی هاست است)"); fi
  elif has "$TMP/p.out" "Fatal error" || has "$TMP/p.out" "Parse error"; then
    note="❌ خطای PHP"
    STATUS="fail"; ISSUES+=("صفحه‌ی $f خطای PHP می‌دهد")
  elif has "$TMP/p.out" "پنل مدیریت" || has "$TMP/p.out" "ورود"; then
    note="✅ هست (پشت ورود پنل)"
  else
    note="✅ هست"
  fi
  say "| $f | $pc | $note |"
  if [ "$f" = "admin/version.php" ] && [ "$pc" != "404" ]; then NEW_VER_PAGE="yes"; fi
done

# ── ۵-۲) بررسی امنیتی: ابزار بازیابی نباید روی سایت بماند ──────────────────
hdr "۵-۲) وضعیت ابزار بازیابی (rescue-db.php)"
RESCUE_OUT="$TMP/rescue.html"
CODE_RESCUE=$(grab "$BASE/rescue-db.php" "$RESCUE_OUT")
say "| مورد | نتیجه |"
say "|---|---|"
say "| کد پاسخ | \`$CODE_RESCUE\` |"
case "$CODE_RESCUE" in
  200)
    if has "$RESCUE_OUT" "بازیابی اتصال دیتابیس"; then
      say "| وضعیت | ⚠️ ابزار بازیابی روی سایت است — اگر کارتان تمام شده، پاکش کنید |"
      RESCUE_PRESENT="yes"
    else
      say "| وضعیت | ✅ فایل نیست (صفحه‌ی دیگری پاسخ داد) |"
      RESCUE_PRESENT="no"
    fi
    ;;
  404|403) say "| وضعیت | ✅ روی سایت نیست (خوب است) |"; RESCUE_PRESENT="no" ;;
  000) say "| وضعیت | ❓ پاسخ نداد |"; RESCUE_PRESENT="no" ;;
  *) say "| وضعیت | کد $CODE_RESCUE |"; RESCUE_PRESENT="no" ;;
esac

# فایل‌های CI گیت‌هاب روی هاست لازم نیستند (از بسته‌ی تازه حذف شده‌اند)
CODE_CI=$(grab "$BASE/.github/workflows/live-check.yml" "$TMP/ci.out")
if [ "$CODE_CI" = "200" ]; then
  say "| فایل‌های CI گیت‌هاب روی هاست | ⚠️ هست — لازم نیست؛ می‌توانید پوشه‌ی \`.github\` را پاک کنید (اختیاری) |"
else
  say "| فایل‌های CI گیت‌هاب روی هاست | ✅ نیست (درست است) |"
fi

# ── ۶) لینک‌های دانلود روی گیت‌هاب ────────────────────────────────────────
hdr "۶) لینک‌های دانلود (گیت‌هاب)"
ZIP_URL="https://github.com/hosseinbahrami-bot/eplak-fixed/raw/arena/01a0db08-eplak-fixed/eplak-fixed-update.zip"
APK_URL="https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk"
say "| فایل | کد پاسخ | حجم | وضعیت |"
say "|---|---|---|---|"
for pair in "بسته‌ی سایت (zip)|$ZIP_URL" "اپ اندروید (APK)|$APK_URL"; do
  label="${pair%%|*}"; url="${pair#*|}"
  # فقط هدرها را می‌خوانیم (سرور گیت‌هاب ۳۰۲ می‌دهد و برای بررسی همین کافی است)
  headers=$(curl -sIL --max-time 40 "$url" 2>/dev/null || echo '')
  code=$(printf '%s' "$headers" | grep -oE '^HTTP/[0-9.]+ [0-9]+' | tail -1 | awk '{print $2}')
  code="${code:-000}"
  size=$(printf '%s' "$headers" | grep -i '^content-length:' | tail -1 | tr -dc '0-9')
  size="${size:-0}"
  case "$code" in
    200|206|302) note="✅ قابل دانلود" ;;
    404) note="❌ پیدا نشد"; STATUS="fail"; ISSUES+=("لینک دانلود «$label» کار نمی‌کند") ;;
    000) note="❓ پاسخ نداد" ;;
    *) note="کد $code" ;;
  esac
  say "| $label | $code | $size بایت | $note |"
done
say ""
say "> لینک‌ها: بسته‌ی سایت ← \`$ZIP_URL\` • اپ اندروید ← \`$APK_URL\`"

# ── ۷) وضعیت فایل APK منتشرشده (از روی صفحه‌ی Releases) ───────────────────
hdr "۷) اپ اندروید منتشرشده"
REL_JSON="$TMP/release.json"
gh api "repos/hosseinbahrami-bot/eplak-fixed/releases/tags/v2.0-eplak-update" > "$REL_JSON" 2>/dev/null || echo '{}' > "$REL_JSON"

APK_SIZE=$(python3 - "$REL_JSON" <<'PYEOF' 2>/dev/null || echo 0
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    for a in d.get("assets", []):
        if a.get("name") == "eplak-app.apk":
            print(a.get("size", 0))
except Exception:
    print(0)
PYEOF
)
BODY_TXT=$(python3 - "$REL_JSON" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("body", ""))
except Exception:
    print("")
PYEOF
)
VER=$(printf '%s' "$BODY_TXT" | grep -oE 'نسخه‌ی اپ \| `[^`]+`' | head -1 | grep -oE '`[^`]+`' | tr -d '`')
COMMIT=$(printf '%s' "$BODY_TXT" | grep -oE 'کامیت \| `[^`]+`' | head -1 | grep -oE '`[^`]+`' | tr -d '`')
FCM_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'فایربیس در بیلد \| [^|]+' | head -1 | sed 's/.*| //' | sed 's/ *$//')
if [ -z "$FCM_LINE" ]; then
  # سازگاری با توضیحات قدیمی Releases (قبل از اصلاح متن‌ها)
  FCM_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'اعلان فایربیس \(اپ بسته\) \| [^|]+' | head -1 | sed 's/.*| //' | sed 's/ *$//')
fi
LINK_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'متصل به پروژه‌ی [0-9]+' | head -1)

say "| مورد | مقدار |"
say "|---|---|"
say "| نسخه‌ی اپ | \`${VER:-؟}\` |"
say "| کامیت ساخته‌شده | \`${COMMIT:-؟}\` |"
say "| حجم فایل | ${APK_SIZE:-0} بایت |"
APK_VER_NUM="$(printf '%s' "${VER:-}" | awk -F. '{print $3+0}')"
if [ "${APK_VER_NUM:-0}" -ge 14 ] 2>/dev/null; then
  say "| نسخه‌ی تازه اپ (۲.۰.۱۴ یا بالاتر) | ✅ \`${VER}\` |"
else
  say "| نسخه‌ی تازه اپ | ⚠️ \`${VER:-؟}\` — نسخه‌ی ۲.۰.۱۴ حذف اعلان، سپر آفلاین و ورود دوباره را دارد |"
  ISSUES+=("روی گوشی نسخه‌ی ۲.۰.۱۴ یا بالاتر نصب کنید (نسخه‌ی فعلی Releases: ${VER:-؟})")
fi
say "| فایربیس داخل اپ | ${FCM_LINE:-؟} |"
say "| اتصال پروژه | ${LINK_LINE:-—} |"
if printf '%s' "$FCM_LINE" | grep -qE "گنجانده|متصل"; then
  say "| نتیجه | ✅ کد و تنظیمات فایربیس داخل بیلد اپ هست (رسیدن اعلان در حالت بسته بودن اپ باید روی گوشی تأیید شود) |"
  APK_FCM="wired"
elif printf '%s' "$FCM_LINE" | grep -q "فعال"; then
  say "| نتیجه | ⚠️ متن قدیمی Releases — «فعال» ادعای تأییدنشده است؛ به‌جای آن «گنجانده شد» نوشته می‌شود |"
  APK_FCM="wired"
else
  say "| نتیجه | ⏳ اپ فعلی بدون فایربیس ساخته شده |"
  APK_FCM="no"
fi

# ── ۸) امکانات نسخه‌ی جدید (آنلاین‌اجباری، حذف اعلان، ورود دوباره) ─────────
hdr "۸) امکانات نسخه‌ی جدید"
say "> این بخش نشانه‌های چهار خواسته‌ی تازه را روی سایت بررسی می‌کند:"
say "> ۱) اپ فقط آنلاین کار کند • ۲) حذف اعلان • ۳) اعلان فوری پس از ثبت درخواست •"
say "> ۴) درخواست دوباره‌ی کد تایید پس از خروج از اپ."
say ""
say "| مورد | کد پاسخ | وضعیت |"
say "|---|---|---|"

# ۱) نقطه‌ی اتصال اینترنت
CODE_PING=$(grab "$BASE/api/ping.php" "$TMP/ping.out")
if [ "$CODE_PING" = "200" ] && has "$TMP/ping.out" '"online":true'; then
  say "| \`api/ping.php\` (بررسی اتصال) | $CODE_PING | ✅ هست و پاسخ می‌دهد |"
  NEW_ONLINE="yes"
else
  say "| \`api/ping.php\` (بررسی اتصال) | $CODE_PING | ⚠️ نیست — پرده‌ی «بدون اینترنت» کار نمی‌کند |"
  NEW_ONLINE="no"
  ISSUES+=("api/ping.php روی هاست نیست؛ بسته‌ی تازه را روی هاست Extract کنید")
fi

# ۲) سپر آفلاین و دکمه‌های حذف، از روی فایل‌های واقعی روی سرور
CODE_GUARD=$(grab "$BASE/modules/online-guard.js" "$TMP/guard.out")
if [ "$CODE_GUARD" = "200" ] && has "$TMP/guard.out" "eplakOfflineGate"; then
  say "| \`modules/online-guard.js\` (سپر آفلاین) | $CODE_GUARD | ✅ نصب است |"
else
  say "| \`modules/online-guard.js\` (سپر آفلاین) | $CODE_GUARD | ⚠️ نیست |"
fi
CODE_LIVEJS=$(grab "$BASE/modules/live.js" "$TMP/live2.out")
if [ "$CODE_LIVEJS" = "200" ] && has "$TMP/live2.out" "deleteNotifications"; then
  say "| حذف اعلان در \`modules/live.js\` | $CODE_LIVEJS | ✅ هست |"
else
  say "| حذف اعلان در \`modules/live.js\` | $CODE_LIVEJS | ⏳ کد قدیمی است |"
fi
if [ "$CODE_LIVEJS" = "200" ] && has "$TMP/live2.out" "refreshNotificationsNow"; then
  say "| اعلان فوری پس از ثبت درخواست | $CODE_LIVEJS | ✅ هست |"
else
  say "| اعلان فوری پس از ثبت درخواست | $CODE_LIVEJS | ⏳ کد قدیمی است |"
fi
CODE_STORAGE=$(grab "$BASE/core/storage.js" "$TMP/storage.out")
if [ "$CODE_STORAGE" = "200" ] && has "$TMP/storage.out" "prepareAppExit"; then
  say "| پاک شدن حساب پس از خروج از اپ | $CODE_STORAGE | ✅ هست |"
else
  say "| پاک شدن حساب پس از خروج از اپ | $CODE_STORAGE | ⏳ کد قدیمی است |"
fi

# پرده‌ی «بدون اینترنت» باید هم در صفحه باشد و هم محتوا را پنهان کند
CODE_INDEX=$(grab "$BASE/index.html" "$TMP/index2.out")
if [ "$CODE_INDEX" = "200" ] && has "$TMP/index2.out" "eplakOfflineGate"; then
  if has "$TMP/index2.out" "phone-frame { visibility: hidden"; then
    say "| پرده‌ی «بدون اینترنت» در صفحه + پنهان شدن محتوا | $CODE_INDEX | ✅ هست |"
  else
    say "| پرده‌ی «بدون اینترنت» در صفحه | $CODE_INDEX | ⚠️ هست ولی پنهان‌سازی محتوا نیست |"
  fi
else
  say "| پرده‌ی «بدون اینترنت» در صفحه | $CODE_INDEX | ⏳ نیست |"
  ISSUES+=("index.html روی هاست قدیمی است؛ بسته‌ی تازه را Extract کنید")
fi

# نشانه‌های سرور تازه: اعلان رویدادی و تاریخ شمسی
CODE_PUSH2=$(grab "$BASE/api/push.php?action=config" "$TMP/push2.out")
if [ "$CODE_PUSH2" = "200" ] && has "$TMP/push2.out" "fcm_ready"; then
  say "| موتور سرور تازه (فایربیس + اعلان رویدادی) | $CODE_PUSH2 | ✅ هست |"
else
  say "| موتور سرور تازه (فایربیس + اعلان رویدادی) | $CODE_PUSH2 | ⏳ سرور قدیمی است |"
fi
say ""

# ── ۹) آزمون واقعی سرتاسری (فقط با EPLAK_SMOKE=1) ─────────────────────────
#  این بخش با یک «شماره‌ی آزمایشی» (۰۹۰۰۰۰۰۰۰۰۰ — شماره‌ای که به هیچ کس تعلق
#  ندارد) یک درخواست ثبت می‌کند، اعلان فوری همان درخواست را می‌خواند، آن را
#  حذف می‌کند و در پایان گزارش آزمایشی را هم پاک می‌کند. هدف: اثبات کارکرد
#  واقعی سه خواسته (اعلان فوری، حذف اعلان، سرور تازه) روی سایت زنده.
if [ "${EPLAK_SMOKE:-0}" = "1" ]; then
  hdr "۹) آزمون واقعی سرتاسری (درخواست ← اعلان فوری ← حذف ← پاک‌سازی)"
  TEST_PHONE="09000000000"
  J="$(mktemp)"

  # ۹-۱) ثبت یک درخواست آزمایشی
  SMOKE_CODE=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$TEST_PHONE\",\"name\":\"آزمون خودکار سامانه\",\"title\":\"آزمون خودکار سامانه — قابل حذف\",\"description\":\"این رکورد برای بررسی خودکار سامانه ساخته شده و در همان آزمون پاک می‌شود.\",\"category\":\"سایر\"}" \
    "$BASE/api/reports.php" 2>/dev/null) || SMOKE_CODE="000"
  RID=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("id", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
  RCODE=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("tracking_code", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
  if [ -n "$RID" ]; then
    say "| ۹-۱ | ✅ درخواست آزمایشی ثبت شد (کد پاسخ $SMOKE_CODE، شناسه $RID، کد پیگیری \`$RCODE\`) |"
  else
    say "| ۹-۱ | ❌ ثبت درخواست آزمایشی ناموفق (کد پاسخ $SMOKE_CODE) |"
    SMOKE_OK="no"
    ISSUES+=("آزمون واقعی: ثبت درخواست روی سایت کار نکرد")
  fi

  # ۹-۲) اعلان فوری همان درخواست باید ساخته شده باشد
  NID=""
  if [ -n "$RCODE" ]; then
    sleep 2
    code=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' "$BASE/api/notifications.php?phone=$TEST_PHONE&t=$(date +%s)" 2>/dev/null) || code="000"
    NID=$(python3 - "$J" "$RCODE" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    for n in d.get("notifications", []):
        if sys.argv[2] and sys.argv[2] in str(n.get("body", "")):
            print(n.get("id", ""))
            break
    else:
        if d.get("notifications"):
            print(d["notifications"][0].get("id", ""))
except Exception:
    print("")
PYEOF
)
    HAS_CODE=$(python3 - "$J" "$RCODE" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    body = " ".join(str(n.get("body", "")) for n in d.get("notifications", []))
    print("yes" if (sys.argv[2] in body and "ساعت" in body) else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$HAS_CODE" = "yes" ]; then
      say "| ۹-۲ | ✅ اعلان فوری «درخواست ثبت شد» با کد پیگیری و تاریخ/ساعت رسید (شناسه $NID) |"
    else
      say "| ۹-۲ | ❌ اعلان فوری با کد پیگیری/تاریخ پیدا نشد (کد پاسخ $code) |"
      ISSUES+=("آزمون واقعی: اعلان فوری پس از ثبت درخواست ساخته نشد")
    fi
  fi

  # ۹-۳) حذف همان اعلان برای همین کاربر
  if [ -n "$NID" ]; then
    code=$(curl -sS -L --max-time 40 -A "$UA" -o "$J" -w '%{http_code}' \
      -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
      -d "action=delete&phone=$TEST_PHONE&ids=$NID" "$BASE/api/notifications.php" 2>/dev/null) || code="000"
    DEL_HIDDEN=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo ""
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get("hidden", "") if d.get("success") else "")
except Exception:
    print("")
PYEOF
)
    sleep 1
    curl -sS -L --max-time 40 -A "$UA" -o "$J" "$BASE/api/notifications.php?phone=$TEST_PHONE&t=$(date +%s)" >/dev/null 2>&1 || true
    STILL=$(python3 - "$J" "$NID" <<'PYEOF' 2>/dev/null || echo "yes"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    ids = [str(n.get("id", "")) for n in d.get("notifications", [])]
    print("yes" if sys.argv[2] in ids else "no")
except Exception:
    print("yes")
PYEOF
)
    if [ -n "$DEL_HIDDEN" ] && [ "$STILL" = "no" ]; then
      say "| ۹-۳ | ✅ اعلان حذف شد و از فهرست همین کاربر رفت (کد پاسخ $code، مخفی‌شده: $DEL_HIDDEN) |"
      SMOKE_OK="yes"
    else
      say "| ۹-۳ | ❌ حذف اعلان تأیید نشد (کد پاسخ $code، مخفی‌شده: ${DEL_HIDDEN:-—}، هنوز در فهرست: $STILL) |"
      ISSUES+=("آزمون واقعی: حذف اعلان کار نکرد")
    fi
  fi

  # ۹-۴) پاک‌سازی: گزارش آزمایشی حذف می‌شود که در پنل ادمین نماند
  if [ -n "$RID" ]; then
    code=$(curl -sS -L --max-time 40 -A "$UA" -X DELETE -o "$J" -w '%{http_code}' \
      "$BASE/api/reports.php?id=$RID&phone=$TEST_PHONE" 2>/dev/null) || code="000"
    CLEAN=$(python3 - "$J" <<'PYEOF' 2>/dev/null || echo "no"
import json, sys
try:
    print("yes" if json.load(open(sys.argv[1])).get("success") else "no")
except Exception:
    print("no")
PYEOF
)
    if [ "$CLEAN" = "yes" ]; then
      say "| ۹-۴ | ✅ گزارش آزمایشی پاک شد (کد پاسخ $code) — داده‌ی آزمایشی روی سایت نماند |"
    else
      say "| ۹-۴ | ⚠️ گزارش آزمایشی پاک نشد (کد پاسخ $code) — در پنل ادمین گزارش «آزمون خودکار سامانه — قابل حذف» را دستی حذف کنید |"
      ISSUES+=("گزارش آزمایشی روی سایت مانده؛ از پنل ادمین حذفش کنید")
    fi
  fi

  rm -f "$J"
  say ""
fi

# ── نتیجه‌ی نهایی ─────────────────────────────────────────────────────────
hdr "نتیجه"
NEW_WEB="no"; NEW_API="no"  # توجه: NEW_ONLINE در بخش ۸ تعیین شده و این‌جا صفر نمی‌شود
if has "$LIVE" "registerAppDevice"; then NEW_WEB="yes"; fi
if has "$PUSH" "fcm_ready"; then NEW_API="yes"; fi

if [ "$CODE_LIVE" = "000" ] && [ "$CODE_LOGIN" = "000" ]; then
  say "❓ **سایت از بیرون پاسخ نداد** — یا موقتاً پایین است، یا فقط از داخل ایران در دسترس است."
  say ""
  say "راه جایگزین: خودتان این آدرس را در مرورگر باز کنید و نتیجه را بگویید:"
  say "\`$BASE/admin/version.php\` (بعد از ورود به پنل)"
  STATUS="unreachable"
elif [ "$NEW_WEB" = "yes" ] && [ "$NEW_API" = "yes" ]; then
  say "✅ **نسخه‌ی جدید روی سایت اعمال شده است.** موتور اعلان‌ها (فایربیس) و کد سرور تازه روی سایت فعال است."
  if [ "$ENGINE_OK" = "yes" ] && has "$PUSH" '"fcm_ready":false'; then
    say ""
    say "ℹ️ فایربیس روی سرور آماده است ولی **کلید سرویس هنوز وارد نشده**؛ برای فعال شدن:"
    say "پنل ادمین → تنظیمات → «اعلان گوشی برای اپ اندروید (فایربیس)» → چسباندن فایل JSON کلید سرویس."
  fi
elif [ "$NEW_WEB" = "yes" ] && [ "$NEW_API" = "no" ]; then
  say "⚠️ **بخشی از تغییرات اعمال شده است.** کد سایت (\`modules/live.js\`) تازه است ولی موتور سرور فایربیس پاسخ نمی‌دهد."
  say "یعنی \`shared/fcm.php\` و \`shared/bootstrap.php\` جدید آپلود نشده‌اند."
else
  say "❌ **نسخه‌ی جدید هنوز روی سایت اعمال نشده است.**"
  say ""
  say "یعنی فایل \`eplak-fixed-update.zip\` هنوز روی هاست باز نشده است."
fi

# چک‌لیست وضعیت سه قدم اصلی
say ""
say "**چک‌لیست:**"
say ""
if [ "$CODE_LOGIN" = "500" ]; then
  say "- ❌ **سایت الان دیتابیس را پیدا نمی‌کند** — راه‌حل در بخش ۱-۲ همین گزارش"
fi
if has "$PUSH" '"fcm_ready":true'; then
  say "- ✅ کلید سرویس فایربیس در پنل ثبت شده (سرور آماده‌ی ارسال است)"
else
  say "- ⏳ کلید سرویس فایربیس در پنل ثبت نشده — پنل ادمین → تنظیمات → «اعلان فایربیس»"
fi
if [ "$NEW_VER_PAGE" = "yes" ]; then
  say "- ✅ بسته‌ی تازه‌ی سایت روی هاست باز شده (صفحه‌ی «بررسی نسخه» هست)"
else
  say "- ⏳ بسته‌ی تازه‌ی سایت روی هاست باز نشده — فایل eplak-fixed-update.zip را Extract کنید"
fi
if [ "$APK_FCM" = "wired" ]; then
  say "- ✅ فایل APK منتشرشده کد و تنظیمات فایربیس را دارد (نصبش کنید و رسیدن اعلان را روی گوشی امتحان کنید)"
elif [ "$APK_FCM" = "yes" ]; then
  say "- ✅ فایل APK منتشرشده با اعلان فایربیس ساخته شده (نصبش کنید)"
else
  say "- ⏳ فایل APK فعلی فایربیس ندارد"
fi
if [ "${EPLAK_SMOKE:-0}" = "1" ]; then
  if [ "$SMOKE_OK" = "yes" ]; then
    say "- ✅ آزمون واقعی روی سایت سبز بود: ثبت درخواست ← اعلان فوری با کد پیگیری و تاریخ ← حذف اعلان ← پاک‌سازی"
  else
    say "- ⚠️ آزمون واقعی سرتاسری کامل سبز نشد — بخش ۹ را ببینید"
  fi
fi
if [ "$NEW_ONLINE" = "yes" ]; then
  say "- ✅ نقطه‌ی بررسی اتصال (\`api/ping.php\`) و پرده‌ی «بدون اینترنت اتصال ممکن نیست» نصب شده‌اند"
else
  say "- ⏳ پرده‌ی «بدون اینترنت» هنوز روی سایت نصب نشده — بسته‌ی تازه را Extract کنید"
fi
say "- 📱 برای دیدن تعداد گوشی‌های ثبت‌شده: پنل ادمین → «بررسی نسخه» (باید بزرگ‌تر از صفر باشد)"
if [ "$RESCUE_PRESENT" = "yes" ]; then
  say "- ⚠️ ابزار بازیابی \`rescue-db.php\` روی سایت است — بعد از رفع مشکل، حذفش کنید (امنیت)"
fi

if [ ${#ISSUES[@]} -gt 0 ]; then
  say ""
  say "**نکته‌های نیازمند پیگیری:**"
  for i in "${ISSUES[@]}"; do say "- $i"; done
fi

rm -rf "$TMP"
if [ "$STATUS" = "fail" ]; then exit 1; fi
exit 0
