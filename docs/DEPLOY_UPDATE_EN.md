# Update Guide — live site (eplak.ir/eplak-fixed)

Use this when you upload the new code to the host so the admin-panel and app
changes **appear on the real site**.

---

## 1) Where to go — download the package

Download the update package (one file):

- **Direct link:**
  `https://github.com/hosseinbahrami-bot/eplak-fixed/raw/arena/01a0db08-eplak-fixed/eplak-fixed-update.zip`
- or open the file page and click **Download**:
  `https://github.com/hosseinbahrami-bot/eplak-fixed/blob/arena/01a0db08-eplak-fixed/eplak-fixed-update.zip`
- Release page with the same link and notes:
  `https://github.com/hosseinbahrami-bot/eplak-fixed/releases/tag/v2.0-eplak-update`

The package contains **code only**. These are intentionally NOT inside it and
will not be overwritten: `data/` (database), `uploads/` (citizens' photos and
videos), `shared/config.php` (your server settings).

### What is in the package

**New files:**
- `shared/webpush.php` — background push-notification engine
- `shared/media.php` — storage for report photos and videos
- `api/push.php` — push endpoints
- `api/media.php` — safe serving of attachment files
- `.htaccess` — caching + security rules (explained in section 5)
- `shared/notification_reads.php` — records who read each notification (per-user read state)

**Changed files:**
- `shared/bootstrap.php` — automatic database-schema repair (fixes `send_id`)
- `admin/settings.php` — change username/password + database-structure section + push test
- `admin/includes/functions.php`, `admin/report_detail.php`, `admin/reports.php`,
  `admin/news.php`, `admin/news_add.php`, `admin/news_edit.php`,
  `admin/notifications.php`, `admin/index.php`, `admin/assets/style.css`
- `api/reports.php`, `api/news.php`, `api/notifications.php` (per-user read state)
- `admin/notification_view.php`, `admin/notifications.php` (correct read/unread display)
- `android-app/.../NotificationBridge.kt`, `MainActivity.kt`, `AndroidManifest.xml` (phone notifications)
- `index.html`, `app.js`, `sw.js`
- `core/storage.js`, `core/i18n.js`
- `modules/reports.js`, `modules/live.js`, `modules/dashboard.js`
- `router_admin.php`

---

## 2) Where to go — upload it (cPanel)

1. Log in to **cPanel → File Manager** and open the folder `public_html/eplak-fixed`.
2. **Back up first:** right-click the `eplak-fixed` folder → `Compress` → create a
   zip and download it (or use `Backup Wizard`).
3. Upload `eplak-fixed-update.zip` into that same folder (use the **Upload** button).
4. Right-click the uploaded zip → **Extract** → confirm **Overwrite existing files**.
5. Delete the zip file afterwards.
6. Make sure the `uploads` folder exists with permissions `755`
   (it is created automatically if missing — it just has to be writable).

### Alternative: Git (if enabled on the host)
If cPanel shows **Git™ Version Control** and the repo is connected there, just
click **Pull or Deploy** on that page.

---

## 3) After the upload — three short steps

1. **Automatic database repair.** Log in to the panel once:
   `https://eplak.ir/eplak-fixed/admin/login.php`
   The new code adds the missing columns (e.g. `notifications.send_id`) by itself.
   To be sure: **Panel → Settings (تنظیمات) → Database structure
   (ساختار دیتابیس) → the "بررسی و ترمیم ساختار دیتابیس" button**.
2. **Browser cache.** Refresh once with `Ctrl+F5` (on a phone: fully close the app
   and reopen it). The new `.htaccess` stops `index.html` and the JS files from
   being cached, so every future change shows up immediately.
3. **Test the notification.** Open the app on a phone and allow notifications, then
   **Panel → Settings → Send test notification (ارسال اعلان آزمایشی)**, enter the
   number and press send.

---

## 4) Where to go in the admin panel (paths)

| What you want | Where to go |
|---|---|
| Log in to the panel | `https://eplak.ir/eplak-fixed/admin/login.php` |
| Change username / password | Panel → **تنظیمات** (Settings) |
| Repair database structure | Panel → **تنظیمات** → **ساختار دیتابیس** → repair button |
| Send a test notification | Panel → **تنظیمات** → **ارسال اعلان آزمایشی** |
| Manage news & tips | Panel → **اخبار** / **دانستنی‌ها** |
| See a report's photos/video | Panel → **گزارش‌ها** → open the report → detail page |

---

## 5) About `.htaccess`

The `.htaccess` file does three things:
- HTML and PHP pages are **not cached** → panel and app changes appear on the site immediately
- `sw.js` is always revalidated → the new push-notification worker activates
- Direct browser access to internal folders (`shared/`, `data/`, `admin/includes/`) is blocked

If the site returns **HTTP 500 after uploading**, the host does not allow one of
the directives. Fix it in one move:
`File Manager → .htaccess → Rename → .htaccess.off`
The site comes back immediately and all other changes stay in place.

---

## 6) About the Android app

The Android app has the site files **bundled inside the APK**
(`file:///android_asset/index.html`). So uploading to the host does **not** change
an app that is already installed — the app needs a **rebuilt APK**:

1. Update the folder `android-app/app/src/main/assets/` from this project
   (`index.html`, `sw.js`, `core/`, `modules/`, `assets/`).
2. In Android Studio: `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
3. Install the new APK on the phone (uninstall/update the previous one).

> Inside the app the API address is `https://eplak.ir/eplak-fixed/api`, so all data
> (news, tips, reports, notifications) is read from the same live site.

---

## 6.1) Notifications — what arrives where

| Situation | Result |
|---|---|
| **App open** | Entry in the app's notification list + an in-app banner + chime + a **system notification in the phone's notification tray** |
| **App in background / phone locked** | System notification in the tray (shown by Android itself) |
| **App fully closed** | ✅ With Firebase Cloud Messaging (section 6.1.3) |
| **Site open in Chrome on the phone** | Notification also reaches the lock screen (the most complete route today) |

### 6.1.1) Why browser push cannot work inside the Android app
The Android app shows the site in a WebView. Android does **not** implement
`Push API` or `Notification API` in WebView (MDN compatibility table — WebView
Android column for PushManager: “No support”). That is why notifications inside
the app are shown by Android itself through `NotificationBridge.kt`.
The APK must be rebuilt and reinstalled (section 6).

### 6.1.2) Enabling notifications for citizens (no technical work)
1. Open the site in **Chrome** on the phone: `https://eplak.ir/eplak-fixed`
2. Browser menu → **Add to Home screen**
3. Open the added app and **allow** notifications
The app's Notifications screen shows this device's status and offers an
**“Enable notifications”** button when permission has not been granted yet.

### 6.1.3) Notifications while the app is fully closed — Firebase (implemented ✅)
One-time setup:

**A) Create a free Firebase project**
1. <https://console.firebase.google.com> → **Add project**.
2. Inside the project → **Android** icon → package name exactly
   `com.example.eplakfixed` → **Register app**.
3. Download **`google-services.json`**.

**B) Put the file in the project (so the APK is built with Firebase)**
Place it at `android-app/app/google-services.json` and push it to GitHub
(you can upload it through the GitHub website). The APK build then runs
automatically and produces a new APK **with Firebase enabled**.

**C) Put the service key in the admin panel (needed for server-side sending)**
1. Firebase → ⚙️ **Project settings** → **Service accounts** → **Generate new private key**.
2. Panel → **تنظیمات (Settings)** → **«اعلان گوشی برای اپ اندروید (فایربیس)»** →
   paste the whole JSON → **ذخیره و بررسی اتصال (Save and check connection)**.
3. A “✅ … connection established” message means it is ready.
4. Use **ارسال آزمایشی فایربیس (Send test)** with a phone number.

> ⚠️ The service-account key is secret: it only goes into the panel and is
> blocked in `.gitignore`.

### 6.1.4) Downloading and installing the fresh APK (no Android Studio)
**Stable download link:**
`https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk`

(or the Releases page → Assets → `eplak-app.apk`). On the phone: download →
allow “install from unknown sources” → install. If you see “App not installed”,
uninstall the previous version first.

### 6.1.5) Building the APK after every change (automatic)
`.github/workflows/android-apk.yml` builds the APK in GitHub's cloud:
**Actions → Build Android APK → latest run → Artifacts → `eplak-apk`**
(or the Releases link above). The app's signing key is cached so later versions
install straight over the previous one.

### 6.1.4) Read status now works per user
Notification read state is stored per user (table `notification_reads`), so the
panel's recipient view shows “Read” only for the people who actually opened the
notification — no more “Unread” while the citizen has read it.

---

## 7) Quick checklist after the update

- [ ] `https://eplak.ir/eplak-fixed/` opens and loads the new app version
- [ ] `https://eplak.ir/eplak-fixed/admin/login.php` → login works
- [ ] **Settings**: change username and password, then log in with the new ones
- [ ] **News & tips**: add/edit one and see it on the site
- [ ] **Reports**: submit a report with a photo, open it in the panel and see the photo
- [ ] **Test notification**: send one from the panel to your own phone
- [ ] **Read status:** open a notification in the app → panel → Notifications → eye icon
      (view recipients) → it should show “خوانده شده / Read”
- [ ] If anything errors: `admin → تنظیمات → Server technical status` and the
      **Database structure** section

---

## 8) Rebuilding the package later

From the project root, run:

```bash
bash tools/build-update-package.sh
```

It rebuilds `eplak-fixed-update.zip` from the current code and verifies that all
critical files are inside and that `data/`, `uploads/` and `shared/config.php` are not.

### 7) Automated tests (safety check before any change)
Run the whole suite locally — no server, MySQL or Android Studio needed:

```bash
bash tools/dev/run-regression.sh          # everything
bash tools/dev/run-regression.sh fcm      # Firebase engine only
bash tools/dev/run-regression.sh syntax   # syntax check only
```

What is covered: `syntax` (no PHP/JS parse errors), `notify` (per-user read
state + panel stats), `app` (the app's own requests: mark-as-read, Android
system notification, FCM token registration), `pushcrypto` (browser push
encryption + VAPID signature), `fcm` (Google token, message send, dead-token
deactivation) and `backend` (tables, seeds, photo upload, self-healing schema,
panel pages). The same tests also run automatically on GitHub:
**Actions → «آزمون‌های خودکار (Regression)»**.

### 8) Checking whether the changes are live
**Option 1 (inside the panel):** after uploading the package open
`Admin → بررسی نسخه (Version check)`. If every line is green ("درست/هست"),
the upload landed correctly. Anything red means those files are missing.

**Option 2 (automatic, from GitHub):** **Actions → «بررسی سایت زنده» → Run workflow**.
A bot reads the public site and writes the result into the Issue titled
«گزارش بررسی سایت زنده (eplak.ir)». You can also run it locally:

```bash
bash tools/live-check.sh https://eplak.ir/eplak-fixed
```
