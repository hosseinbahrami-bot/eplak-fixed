# اپلک — سایت، پنل ادمین و اپ اندروید

> **این صفحه اولین جایی است که بعد از هر تغییر باید نگاه کنید:** همین‌جا لینک دانلود همه‌چیز هست.

## ⬇️ دانلودها (همیشه همین لینک‌ها)

| فایل | توضیح | لینک دانلود |
|---|---|---|
| 📱 **اپ اندروید** | فایل نصب گوشی (`eplak-app.apk`) — نسخه‌ی آخر همیشه: [صفحه‌ی Releases](https://github.com/hosseinbahrami-bot/eplak-fixed/releases) | **[دانلود APK](https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk)** |
| 🌐 **بسته‌ی سایت و پنل** | برای آپلود روی `eplak.ir/eplak-fixed` | **[دانلود `eplak-fixed-update.zip`](https://github.com/hosseinbahrami-bot/eplak-fixed/raw/arena/01a0f647-eplak-fixed/eplak-fixed-update.zip)** |
| 🗂️ **همه‌ی نسخه‌ها** | صفحه‌ی Releases گیت‌هاب | [صفحه‌ی Releases](https://github.com/hosseinbahrami-bot/eplak-fixed/releases/tag/v2.0-eplak-update) |

**نصب اپ روی گوشی:** فایل APK را دانلود کنید → اجازه‌ی «نصب از منابع نامشخص» را بدهید → نصب.
اگر پیام «App not installed» دیدید، نسخه‌ی قبلی اپ را پاک کنید و دوباره نصب کنید.

## 🔔 اعلان‌ها

| حالت | وضعیت |
|---|---|
| داخل اپ (فهرست اعلان‌ها) | ✅ کار می‌کند — با هر ثبت درخواست، پیام «درخواست شما با کد پیگیری … در تاریخ … ثبت شد» همان لحظه ساخته می‌شود |
| نوار اعلان گوشی، وقتی اپ باز است | ✅ نمایش داده می‌شود (اجازه‌ی اعلان باید داده شده باشد) |
| نوار اعلان گوشی، وقتی اپ بسته است | ⏳ در حال اصلاح و ارزیابی روی گوشی کاربر — تا تأیید نهایی، هیچ ادعایی درباره‌ی «فعال بودن کامل» مطرح نمی‌شود |
| حذف اعلان | ✅ دکمه‌ی سطل‌زباله روی هر اعلان + «حذف همه» در سرصفحه (فقط از فهرست همان کاربر) |

> 📌 برای اعلان روی گوشی: در تنظیمات گوشی → برنامه‌ها → ای‌پلاک → اعلان‌ها، اجازه‌ی اعلان را روشن کنید
> و آخرین نسخه‌ی اپ را از بخش [Releases](https://github.com/hosseinbahrami-bot/eplak-fixed/releases) نصب کنید.

## 📚 راهنماها

- `docs/FIREBASE_SETUP_FA.md` — 🔥 **آموزش گام‌به‌گام فایربیس** (ساخت پروژه، گرفتن دو فایل، فعال‌سازی اعلان اپ بسته).
- `docs/FIREBASE_SETUP_EN.md` — the same Firebase guide in English.
- `docs/DEPLOY_UPDATE_FA.md` — راهنمای فارسی: آپلود روی هاست، ساخت دیتابیس، اعلان فایربیس، دانلود APK.
- `docs/DEPLOY_UPDATE_EN.md` — same guide in English.
- `docs/CITY_MAP_FA.md` — 🗺️ **نقشه و اماکن شهری + مسیریابی با «نشان»**: دسته‌ها، افزودن مکان، قالب لینک نشان، آزمون روی گوشی.
- `docs/CITY_MAP_EN.md` — the same City Map & Neshan routing guide in English.
- `docs/README.md` — معرفی ساختار پروژه.
- `docs/technical-architecture.md` — معماری فنی.

## 🧪 آزمون‌های خودکار

```bash
bash tools/dev/run-regression.sh          # همه‌ی آزمون‌های خودکار
bash tools/dev/run-regression.sh fcm      # فقط موتور فایربیس
bash tools/dev/run-regression.sh syntax   # فقط بررسی نحوی PHP و JS
bash tools/dev/run-regression.sh places   # نقشه و اماکن شهری + مسیریابی با نشان
```

همین آزمون‌ها با هر تغییر روی گیت‌هاب هم اجرا می‌شوند:
**Actions → «آزمون‌های خودکار (Regression)»**.

## 🤖 ساخت خودکار APK

با هر تغییر در فایل‌های اپ/سایت، گیت‌هاب خودش APK تازه می‌سازد و در Releases می‌گذارد:
**Actions → Build Android APK**. کلید امضای اپ ثابت می‌ماند تا نسخه‌ی تازه روی نسخه‌ی نصب‌شده به‌روزرسانی شود.
