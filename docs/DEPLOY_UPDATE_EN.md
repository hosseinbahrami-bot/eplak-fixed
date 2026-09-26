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

**Changed files:**
- `shared/bootstrap.php` — automatic database-schema repair (fixes `send_id`)
- `admin/settings.php` — change username/password + database-structure section + push test
- `admin/includes/functions.php`, `admin/report_detail.php`, `admin/reports.php`,
  `admin/news.php`, `admin/news_add.php`, `admin/news_edit.php`,
  `admin/notifications.php`, `admin/index.php`, `admin/assets/style.css`
- `api/reports.php`, `api/news.php`
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

## 7) Quick checklist after the update

- [ ] `https://eplak.ir/eplak-fixed/` opens and loads the new app version
- [ ] `https://eplak.ir/eplak-fixed/admin/login.php` → login works
- [ ] **Settings**: change username and password, then log in with the new ones
- [ ] **News & tips**: add/edit one and see it on the site
- [ ] **Reports**: submit a report with a photo, open it in the panel and see the photo
- [ ] **Test notification**: send one from the panel to your own phone
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
