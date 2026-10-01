# Eplak — iOS version and PWA version

This guide explains how to get Eplak on an **iPhone** and as a **PWA** (installable web app), what each
version can do, and what has not yet been tried on a real phone.

---

## 1) Which version should I use?

| | Install | Notification while the app is closed | Needs |
|---|---|---|---|
| **PWA** (installable web app) | iPhone: Safari → “Add to Home Screen” • Android: Chrome | ✅ Android • ✅ iPhone on **iOS 16.4 or newer** (only when the PWA was added to the Home Screen) | nothing — free |
| **iOS app (IPA file)** | Sideloadly / AltStore / Xcode (or Iranian iOS stores; section 4.5) | ❌ a closed-app notification needs an Apple developer account and an **APNs** key; in-app notifications work while the app is open | an Apple ID |
| **Android app (APK)** | install the file | ✅ Firebase | — |

> **Suggestion:** for a quick try on an iPhone, and to get **notifications on iPhone**, the PWA is the best way.
> The IPA is better when you want a “real app icon” or want to publish through Iranian stores.

---

## 2) Downloads

Everything is on one page: **[v2.0-eplak-update](https://github.com/hosseinbahrami-bot/eplak-fixed/releases/tag/v2.0-eplak-update)**

| File | Direct link |
|---|---|
| iOS app (unsigned IPA) | `https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app-unsigned.ipa` |
| SHA-256 of the IPA | `…/eplak-app-unsigned.ipa.sha256` |
| Xcode project (for anyone with a Mac) | `…/eplak-ios-project.zip` |
| Standalone PWA (static files) | `…/eplak-pwa.zip` |
| Android app | `…/eplak-app.apk` |
| Host package (site and panel) | `https://github.com/hosseinbahrami-bot/eplak-fixed/raw/arena/01a0f647-eplak-fixed/eplak-fixed-update.zip` |

---

## 3) PWA

### 3.1) The site itself is a PWA (recommended)
Once you extract the host package (`docs/DEPLOY_UPDATE_EN.md`), the site address,
`https://eplak.ir/eplak-fixed/`, is a complete PWA: `manifest.json`, the `sw.js` service worker, the
192/512/180 icons and the iOS tags in `index.html` are all in place. To install it on a phone:

**iPhone** (use **Safari** — not Chrome, and not the in-app browser of Telegram/Instagram):
1. Open the site address in Safari.
2. Tap the **Share** button (square with an up arrow) → scroll down → **Add to Home Screen** → **Add**.
3. Open it from the “ای‌پلاک” icon on the Home Screen; it runs full-screen without an address bar.
4. **Notifications** (iOS 16.4 or newer only): open the app from **that Home Screen icon** and tap “Allow”
   when asked for notification permission. iOS does not deliver web notifications from inside Safari itself.

**Android**: Chrome → ⋮ menu → **Install app** or **Add to Home screen**.

### 3.2) Standalone PWA for a static host (`eplak-pwa.zip`)
To put the same PWA on a host without PHP (GitHub Pages, Netlify, Cloudflare Pages or another folder):
extract `eplak-pwa.zip` and upload its contents. In this package:
- the API address is set to the main server (`https://eplak.ir/eplak-fixed/api`), so sign-in with the verification code, reports, notifications and city places all come from that server;
- report photo/video addresses also point to the main server;
- for another server: `EPLAK_PWA_API_BASE=https://example.ir/eplak-fixed/api bash tools/build-pwa.sh`;
- the admin panel and PHP are not included (they exist only on the host);
- every address (origin) has its own storage, so a user has to sign in once more on a new address.

---

## 4) iOS app (IPA file)

The iOS app bundles the same web app (exactly the files the Android APK contains) and opens it in a
`WKWebView`; sign-in, reports with photo/video, the city map and routing with Neshan all work through
the same Eplak server.

### 4.1) Why “unsigned”?
An iPhone only runs an app that Apple (or your Apple ID) has signed. GitHub builds this project's IPA
without a signature (it has no Apple account); **you sign and install it with your Apple ID**:
with a free Apple ID the app must be re-signed **every 7 days**; with a developer account (USD 99/year) there is no such limit.

### 4.2) Install with Sideloadly (Windows or Mac)
1. Install [Sideloadly](https://sideloadly.io) and connect the iPhone with a cable.
2. Drag `eplak-app-unsigned.ipa` into the app, enter your Apple ID and press **Start**.
3. On the iPhone: **Settings → General → VPN & Device Management** → your e-mail → **Trust**.
4. (iOS 16 or newer) if the app does not open: turn on **Settings → Privacy & Security → Developer Mode** and restart the phone.

### 4.3) Install with AltStore
Give the IPA to AltStore; it signs and installs it with your Apple ID and refreshes it every week (while the computer is on).

### 4.4) With Xcode (Mac)
1. Extract `eplak-ios-project.zip` (or clone the repository and run `bash ios-app/sync-web.sh` to create the `Web` folder).
2. Open `ios-app/Eplak.xcodeproj` in **Xcode**.
3. Under **Signing & Capabilities** choose your team (Personal Team or developer account).
4. Pick the phone or a simulator and press **Run (⌘R)**. Final build: **Product → Archive**.

### 4.5) Iranian iOS stores
The project's older guide said the IPA can be uploaded to the panel of stores such as Sibche, Anardoni or SibApp so they
sign and publish it with their enterprise/Ad-Hoc certificate. I have not tested this and do not know their terms; check with the store first.

---

## 5) Differences and limits

- **Notifications while the app is closed:** not in the iOS app (IPA). Apple requires a developer account and an **APNs** key (in Firebase),
  which this package does not have. In-app notifications (while the app is open) and the notification bell work. If notifications matter on
  iPhone, give people the PWA (iOS 16.4+, added to the Home Screen).
- **Internet:** like Android, the app does not work offline and shows the “no internet connection” curtain.
- **Camera, gallery, location:** iOS asks the first time (the texts are in Persian). “My location” and “Route with Neshan” need the location permission.
- **Neshan:** “Route with Neshan” opens a `neshan://…` link; if the Neshan app is not installed, the Neshan web version opens in Safari a moment later.
- **Updates:** the web files inside the IPA go in at build time just like the APK; every change rebuilds the IPA and `eplak-pwa.zip`
  (`.github/workflows/ios-ipa.yml` and `pwa.yml`). The server (PHP) always comes from the host and is updated by uploading the host package.

---

## 6) What has been tried and what has not

**Tried (automatically, on GitHub):**
- Building the iOS app with Xcode on macOS; building the unsigned IPA (arm64, minimum iOS 14); comparing the web files inside the IPA with the repository.
- Running the app for real on an **iPhone simulator**: the page loads from `file://`, `api/ping.php` answers from inside the `WKWebView`, the city map opens,
  “My location” and “Route with Neshan” hand the `neshan://…` link to the native shell, with screenshots (`ios-app/ci/simulator-smoke.sh`).
- The PWA in **Chrome** on a separate origin against the real server: CORS, service worker, installability (`Page.getInstallabilityErrors` is empty), manifest, the map (`tools/pwa-smoke.mjs`).

**Not yet tried on a real phone:** installing the IPA on an iPhone, camera/gallery, the Neshan app actually opening,
PWA notifications on iOS, and installing the PWA with Safari on an iPhone. Please try these once on your own phone.

---

## 7) Building and troubleshooting

- **Automatic build:** any change to `index.html`, `app.js`, `core/`, `modules/`, `views/` or `assets/` rebuilds the APK, the IPA and `eplak-pwa.zip`.
- **Manual PWA build:** `bash tools/build-pwa.sh` (output: the `pwa-dist` folder and `eplak-pwa.zip`).
- **Manual iOS build (Mac):** `bash ios-app/sync-web.sh`, then Xcode.
- **IPA will not install:** compare its SHA-256 with the `.sha256` file; turn on Developer Mode (iOS 16+); try another Apple ID.
- **White screen or “no internet”:** check the phone's internet and that `https://eplak.ir/eplak-fixed/api/ping.php` opens.
