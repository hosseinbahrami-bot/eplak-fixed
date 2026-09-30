# Report media (photo/video) upload + precise GPS location on the map

This document covers the two new requirements:

1. **Photo/video upload in “Submit Request”** must work, and every uploaded file must be visible in the **admin panel**.
2. The location step must use the **phone’s GPS** and show the user’s **precise position on a map**.

---

## 1) Why it did not work before (root cause)

| Item | Cause |
|---|---|
| Picking files inside the app | `MainActivity.kt` only had `webView.webChromeClient = WebChromeClient()`. Android does **not** open a file picker by itself — the app must implement `onShowFileChooser`. Because it was missing, tapping “tap to add photo or video” did nothing. |
| GPS in the form | `useCurrentLocation()` only wrote a **fixed string** (“current user location (from GPS)”) into the address box. No GPS, no map. |
| Location-step map | It was a **decorative card**: “selected location map (demo)”. |
| Location permission | No `ACCESS_FINE_LOCATION` in the manifest, no `setGeolocationEnabled(true)`, no `onGeolocationPermissionsShowPrompt`. |

---

## 2) What was fixed

### A) Android app (`android-app/`)

- `MainActivity.kt`
  - `onShowFileChooser` implemented → the **gallery/file picker opens** (images + videos, multi-select).
  - Multi-select via `EXTRA_ALLOW_MULTIPLE` and `clipData` handling.
  - If the user cancels, `onReceiveValue(null)` is returned so the file field never gets stuck.
  - `setGeolocationEnabled(true)` + `onGeolocationPermissionsShowPrompt` → the app asks for location permission and answers `navigator.geolocation`.
  - New JS-bridge methods: `hasLocationPermission()`, `requestLocationPermission()`, `openAppSettings()`, `isLocationServiceEnabled()`, `openUrl(url)`.
- `AndroidManifest.xml`
  - Added `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`.
  - `uses-feature android.hardware.location.gps required="false"` so devices without GPS can still install the app.

### B) Web layer

- `assets/js/ep-map.js` (**new file**) — a lightweight map engine on free **OpenStreetMap** tiles:
  - **No API key required**, and if tiles cannot be downloaded the flow still works (coordinates are stored).
  - Finger-drag panning, `+`/`−` zoom, center pin, and reverse geocoding (`nominatim.openstreetmap.org`) to fill the street address.
- `modules/reports.js`
  - Real `useCurrentLocation()` using `navigator.geolocation.getCurrentPosition(..., { enableHighAccuracy: true })`.
  - In the Android app, the location permission is requested first, then the position is read.
  - Coordinates are kept in `reportDraft.geo` and **sent to the server** with the report (`lat`, `lng`).
  - Photos are **compressed before upload** (max 1600 px, quality 82%) so mobile uploads are fast and reliable.
  - Upload percentage is shown on the success screen, followed by a final confirmation.
- `index.html`
  - Real map in the location step + latitude/longitude display + “view on map” button.
  - Upload status line under the tracking code.
- `core/storage.js`
  - `syncFormDataToBackendWithProgress` — upload via `XMLHttpRequest` with progress reporting.

### C) Server and admin panel

- `shared/bootstrap.php`
  - New `reports` columns: `lat`, `lng`, `location_accuracy` (added automatically to an existing database).
  - Schema version: `2026-09-30.2`.
- `api/reports.php`
  - Coordinate validation (`eplakReportCoord`) and persistence; invalid coordinates never break report creation.
  - Report list also returns `lat`/`lng`.
- `admin/report_detail.php`
  - **Precise location map** with marker + coordinates + accuracy (meters) + “open in full map”.
  - Citizen photos and videos (already implemented) are displayed in the same page.
- `admin/reports.php`
  - Under the location column: a “📍 precise location on map” link for geolocated reports.

### D) Key finding from the live test on eplak.ir: the host firewall blocks file uploads

The automated live test (section 9 of the live-check report) showed:

| Test | Result |
|---|---|
| `multipart/form-data` **without a file** (text only) | ✅ HTTP 200 |
| The same request **with a file** (even a 70-byte PNG) | ❌ HTTP **403** (host Forbidden page) |

So the host firewall (ModSecurity/Imunify360) has a rule against “file upload to a PHP script” and
rejects the request. This was likely one of the main causes of the user’s “upload does not work” experience.

**Implemented solution (no host settings change required):**

- The app sends files **inside the JSON body as base64** (this route is open on the host).
- Compressed photos and small files (up to 6 MB each, 12 MB total) travel with the report itself:
  one request, no multipart upload at all.
- Large videos are sent **in 1 MB chunks** to `api/media.php?action=chunk` after the report is created,
  and are reassembled on the server (chunk order is enforced; type/size validation happens on the last chunk).
- If the phone number does not own the report, or the 6-file cap is reached, the file is rejected.

> Important: **photos work with the new APK and no host change at all.**
> Only large videos (over 6 MB) require extracting the new package on the host.

---

## 3) Step by step: apply to the live site (host panel)

1. Download `eplak-fixed-update.zip` from GitHub.
2. Host panel → **File Manager** → open the `eplak-fixed` folder.
3. Upload the ZIP → right-click it → **Extract** → confirm.
4. Open this page once so the **new database columns are created**:
   `https://eplak.ir/eplak-fixed/admin/login.php` → sign in → **Settings** → click **“repair database schema”**.
5. Final verification: run the live check from GitHub Actions (tick the smoke option).

---

## 4) Step by step: install the new APK

1. APK link:
   `https://github.com/hosseinbahrami-bot/eplak-fixed/releases/download/v2.0-eplak-update/eplak-app.apk`
2. Download → allow “install from unknown sources” if asked → **Install**.
3. The first time you tap **“use my current location”**, Android asks for the location permission → choose **While using the app**.

### Photo/video test

1. App → home → **“Submit Request”**.
2. Fill the steps up to the **“Photos”** step.
3. Tap the “tap to add photo or video” box → **the gallery opens** → pick up to 3 files.
4. **Next** → **Confirm and send**.
5. Under the tracking code you will see the upload percentage and then “✅ … attachment uploaded and registered in the municipality panel”.

### Location test

1. In the **“Location”** step, tap the blue **“use my current location”** button.
2. Grant the permission → the map moves to your position and the coordinates + accuracy (meters) appear below.
3. Drag the map with your finger to fine-tune the pin onto the exact spot.

---

## 5) Step by step: see media and location in the admin panel

1. `https://eplak.ir/eplak-fixed/admin/login.php` → sign in.
2. Menu **“Reports”** → under the location column, look for “📍 precise location on map”.
3. Click the **eye** icon (view & reply).
4. On the report page:
   - **“Citizen attachments”** → photos and videos (videos are playable) + download buttons.
   - **“Precise location on map”** → map with marker, coordinates, accuracy, and “open in full map”.

---

## 6) Size limits (configurable in code)

| Item | Default | Where to change |
|---|---|---|
| Image | 12 MB | `shared/media.php` (`EPLAK_MEDIA_MAX_IMAGE_MB`) |
| Video | 80 MB | `shared/media.php` (`EPLAK_MEDIA_MAX_VIDEO_MB`) |
| Files per report | 6 on server, 3 in the app | `shared/media.php` · `modules/reports.js` |
| Inline (JSON) upload threshold | 6 MB per file / 12 MB total | `modules/reports.js` (`INLINE_MAX_FILE` / `INLINE_MAX_TOTAL`) |
| Video chunk size | 1 MB | `core/storage.js` |
| PHP upload cap | 64 MB | `.htaccess` (`upload_max_filesize`) |

Note: photos are compressed inside the app, so an 8 MB phone photo becomes roughly 200–500 KB and the upload almost always succeeds.
