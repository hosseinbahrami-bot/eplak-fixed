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
check_marker "پیام «حتی وقتی برنامه بسته باشد»" "حتی وقتی برنامه بسته باشد"
say ""
say "- کد پاسخ فایل: \`$CODE_LIVE\` • حجم: $(wc -c < "$LIVE" 2>/dev/null | tr -d ' ') بایت"
say "- تعداد اشاره به fcm در فایل: \`$(countof "$LIVE" 'fcm')\`"

NEW_WEB="no"
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
FCM_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'اعلان فایربیس \(اپ بسته\) \| [^|]+' | head -1 | sed 's/.*| //' | sed 's/ *$//')
LINK_LINE=$(printf '%s' "$BODY_TXT" | grep -oE 'متصل به پروژه‌ی [0-9]+' | head -1)

say "| مورد | مقدار |"
say "|---|---|"
say "| نسخه‌ی اپ | \`${VER:-؟}\` |"
say "| کامیت ساخته‌شده | \`${COMMIT:-؟}\` |"
say "| حجم فایل | ${APK_SIZE:-0} بایت |"
say "| وضعیت فایربیس داخل اپ | ${FCM_LINE:-؟} |"
say "| اتصال پروژه | ${LINK_LINE:-—} |"
if printf '%s' "$FCM_LINE" | grep -q "فعال"; then
  say "| نتیجه | ✅ اپ با اعلان فایربیس ساخته شده است |"
  APK_FCM="yes"
else
  say "| نتیجه | ⏳ اپ فعلی بدون فایربیس ساخته شده |"
  APK_FCM="no"
fi

# ── نتیجه‌ی نهایی ─────────────────────────────────────────────────────────
hdr "نتیجه"
NEW_WEB="no"; NEW_API="no"
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
if [ "$APK_FCM" = "yes" ]; then
  say "- ✅ فایل APK منتشرشده با اعلان فایربیس ساخته شده (نصبش کنید)"
else
  say "- ⏳ فایل APK فعلی فایربیس ندارد"
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
