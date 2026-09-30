/* backend.test.mjs — دیتابیس، ساختار خودترمیم، ارسال اعلان، آپلود عکس و نمایش در پنل */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-backend.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.rmSync(`${APP}/uploads`, { recursive: true, force: true });

const FX = '/tmp/eplak-regression-fixtures';
fs.mkdirSync(FX, { recursive: true });
fs.writeFileSync(`${FX}/photo.png`, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
fs.writeFileSync(`${FX}/bad.txt`, Buffer.from('not an image'));

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path', '/tmp'); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

console.log('\n=== دیتابیس، جدول‌ها و بذرها ===');
const db = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/media.php';
require_once '${APP}/shared/webpush.php';
require_once '${APP}/shared/fcm.php';
require_once '${APP}/shared/notification_reads.php';
$out = [];
$out['news'] = (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
$out['depts'] = (int) $pdo->query('SELECT COUNT(*) FROM departments')->fetchColumn();
$out['tables'] = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
$out['schema'] = eplakAppSetting($pdo, 'schema_version', '');
$out['send_cols'] = array_column($pdo->query('PRAGMA table_info(notification_sends)')->fetchAll(), 'name');
$out['fcm_hidden'] = true;
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09121112233','آزمون')");
$out['sent'] = sendNotification($pdo, 'عنوان', 'متن', 'all', [], 'admin');
$out['recipients'] = count(getNotificationRecipients($pdo, (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn()));
echo json_encode($out);`));
ok('بذرها اجرا شدند (۶ خبر/دانستنی + ۶۵ واحد)', db?.news === 6 && db?.depts === 65, `news=${db?.news} depts=${db?.depts}`);
const wanted = ['notifications', 'notification_reads', 'notification_deletes', 'device_tokens', 'push_subscriptions', 'report_media', 'app_settings'];
const missing = wanted.filter((t) => !(db?.tables || []).includes(t));
ok('همه‌ی جدول‌های لازم ساخته شدند', missing.length === 0, 'گم‌شده: ' + missing.join(', '));
ok('نسخه‌ی ساختار دیتابیس تازه ثبت شد', /^2026-09-30\./.test(String(db?.schema)), String(db?.schema));
ok('ستون‌های شمارش فایربیس ساخته شدند', (db?.send_cols || []).includes('fcm_sent') && (db?.send_cols || []).includes('fcm_failed'), JSON.stringify(db?.send_cols));
ok('ارسال اعلان کار می‌کند (عمومی + کاربر)', db?.sent === 2 && db?.recipients === 2, JSON.stringify({ sent: db?.sent, recipients: db?.recipients }));

console.log('\n=== آپلود عکس گزارش (مسیر واقعی اپ) ===');
const upload = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'چاله خیابان', 'description' => 'توضیح', 'category' => 'سایر'];
$_FILES = ['media' => ['name' => ['p.png'], 'type' => ['image/png'], 'tmp_name' => ['${FX}/photo.png'], 'error' => [0], 'size' => [70]]];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('گزارش با یک عکس ثبت شد', upload?.success === true && upload?.media_count === 1, JSON.stringify(upload).slice(0, 160));
const stored = upload?.media?.[0];
ok('عکس در uploads/reports ذخیره شد', String(stored?.path || '').startsWith('uploads/reports/'), String(stored?.path));
ok('عکس روی دیسک است', !!stored && fs.existsSync(`${APP}/${stored.path}`));
ok('آدرس عکس نسبی است', !/^https?:/i.test(String(stored?.url || '')), String(stored?.url));

/* اعلان فوری بعد از ثبت گزارش از مسیر واقعی API (بدون هیچ تنظیم اضافه) */
const notifyAfter = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$row = $pdo->query("SELECT title, body FROM notifications WHERE user_phone = '09121112233' ORDER BY id DESC LIMIT 1")->fetch();
echo json_encode(['title' => $row['title'] ?? '', 'body' => $row['body'] ?? '']);`));
ok('ثبت گزارش از مسیر API، اعلان فوری برای همان کاربر می‌سازد',
  String(notifyAfter?.body || '').includes('کد پیگیری'), String(notifyAfter?.body));
ok('متن اعلان، تاریخ و ساعت ثبت را دارد', String(notifyAfter?.body || '').includes('ساعت'), String(notifyAfter?.body));

const guard = fs.existsSync(`${APP}/uploads/.htaccess`) ? fs.readFileSync(`${APP}/uploads/.htaccess`, 'utf8') : '';
ok('نگهبان uploads نسخه‌ی سالم ساخته شد', guard.includes('eplak-media-guard-v2'));
ok('هیچ php_flag بیرون از IfModule نیست', !/^php_(flag|value)/m.test(guard));

const bad = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'تست فایل بد', 'description' => 'x', 'category' => 'سایر'];
$_FILES = ['media' => ['name' => ['bad.txt'], 'type' => ['text/plain'], 'tmp_name' => ['${FX}/bad.txt'], 'error' => [0], 'size' => [11]]];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/reports.php';`));
ok('فایل غیرمجاز ذخیره نمی‌شود', (bad?.media_count || 0) === 0, JSON.stringify(bad).slice(0, 160));

console.log('\n=== پنل ادمین روی همان گزارش ===');
const panel = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$rid = (int) $pdo->query('SELECT id FROM reports ORDER BY id DESC LIMIT 1')->fetchColumn();
$media = getReportMedia($pdo, $rid);
echo json_encode([
  'count' => count($media),
  'url' => $media ? adminMediaUrl($media[0]['path']) : '',
  'stats' => getDashboardStats($pdo)['reports_with_media'] ?? 0,
]);`));
ok('پنل عکس شهروند را می‌بیند', panel?.count === 1, JSON.stringify(panel));
ok('آدرس عکس در پنل درست است', String(panel?.url || '').startsWith('../uploads/'), String(panel?.url));
ok('داشبورد گزارش‌های دارای فایل را می‌شمارد', (panel?.stats || 0) >= 1, String(panel?.stats));

console.log('\n=== موقعیت دقیق گزارش (GPS) — ذخیره، بازگشت و نمایش ===');
const geo = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'چاله با موقعیت', 'description' => 'توضیح', 'category' => 'سایر', 'location' => 'خیابان امام', 'lat' => '35.3242100', 'lng' => '51.6455300', 'locationAccuracy' => '12.5'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('گزارش با مختصات GPS ثبت شد', geo?.success === true && Math.abs(Number(geo?.lat) - 35.32421) < 0.0000001,
  JSON.stringify(geo).slice(0, 160));

const geoRow = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$row = $pdo->query('SELECT lat, lng, location_accuracy FROM reports ORDER BY id DESC LIMIT 1')->fetch();
echo json_encode(['lat' => $row['lat'], 'lng' => $row['lng'], 'acc' => $row['location_accuracy']]);`));
ok('مختصات در دیتابیس ذخیره شد',
  Math.abs(Number(geoRow?.lat) - 35.32421) < 0.0000001 && Math.abs(Number(geoRow?.lng) - 51.64553) < 0.0000001,
  JSON.stringify(geoRow));
ok('دقت موقعیت (متر) هم ذخیره می‌شود', Math.abs(Number(geoRow?.acc) - 12.5) < 0.01, String(geoRow?.acc));

const geoList = pickJson(await run(`
$_GET = ['phone' => '09121112233'];
$_SERVER['REQUEST_METHOD'] = 'GET';
require '${APP}/api/reports.php';`));
const geoItem = (geoList?.reports || []).find((r) => Math.abs(Number(r.lat) - 35.32421) < 0.0000001);
ok('API فهرست گزارش‌ها، مختصات را برمی‌گرداند', !!geoItem, JSON.stringify(geoList).slice(0, 160));

const geoBad = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'موقعیت خراب', 'description' => 'توضیح', 'category' => 'سایر', 'lat' => 'abc', 'lng' => '999'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
ok('مختصات نامعتبر باعث خطا نمی‌شود (فقط نادیده گرفته می‌شود)',
  geoBad?.success === true && geoBad?.lat === null, JSON.stringify(geoBad).slice(0, 160));

const geoPanel = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$rid = (int) $pdo->query('SELECT id FROM reports WHERE lat IS NOT NULL ORDER BY id DESC LIMIT 1')->fetchColumn();
$r = getReportById($pdo, $rid);
echo json_encode(['lat' => $r['lat'] ?? null, 'lng' => $r['lng'] ?? null, 'has' => ($r['lat'] !== null && $r['lng'] !== null)]);`));
ok('پنل ادمین به مختصات همان گزارش دسترسی دارد', geoPanel?.has === true, JSON.stringify(geoPanel));

console.log('\n=== آپلود پیوست از مسیر JSON (بدون multipart) + ارسال تکه‌تکه ===');
/* ساخته شدن یک گزارش تازه برای آزمون پیوست */
const mediaReport = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون پیوست', 'description' => 'توضیح', 'category' => 'سایر'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
const MRID = Number(mediaReport?.id || 0);
ok('گزارش پایه برای آزمون پیوست ساخته شد', MRID > 0, JSON.stringify(mediaReport).slice(0, 120));

/* تصویر واقعی ۱×۱ (PNG) — بافر مستقل تا فایل fixture قبلی که جابه‌جا شده لازم نباشد */
const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const b64 = pngBuffer.toString('base64');

/* ۱) آپلود یک‌مرحله‌ای از مسیر JSON */
const up = pickJson(await run(`
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09121112233', 'reportId' => '${MRID}', 'name' => 'json.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('آپلود JSON (base64) کار می‌کند', up?.success === true && up?.media_count === 1, JSON.stringify(up).slice(0, 200));
ok('فایل آپلودشده داخل uploads/reports ذخیره می‌شود', String(up?.media?.path || '').startsWith('uploads/reports/'), String(up?.media?.path));
ok('فایل روی دیسک موجود است', !!up?.media?.path && fs.existsSync(`${APP}/${up.media.path}`));

/* ۲) امنیت: شماره‌ی غیرمالک نمی‌تواند فایل اضافه کند */
const foreign = pickJson(await run(`
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09129998877', 'reportId' => '${MRID}', 'name' => 'x.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('شماره‌ی غیرمالک اجازه‌ی افزودن فایل ندارد', foreign?.success === false, JSON.stringify(foreign).slice(0, 160));

/* ۳) سقف تعداد فایل هر گزارش */
const cap = pickJson(await run(`
require '${APP}/admin/includes/db.php';
for ($i = 0; $i < 6; $i++) {
    $pdo->exec("INSERT INTO report_media (report_id, kind, file_path, original_name, mime_type, size_bytes) VALUES (${MRID}, 'image', 'uploads/reports/2026/09/f$_i.png', 'f.png', 'image/png', 100)");
}
$_GET = ['action' => 'upload'];
$_POST = ['phone' => '09121112233', 'reportId' => '${MRID}', 'name' => 'cap.png', 'mime' => 'image/png', 'data' => 'data:image/png;base64,${b64}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('سقف تعداد فایل هر گزارش رعایت می‌شود', cap?.success === false && String(cap?.error || '').includes('حداکثر'), JSON.stringify(cap).slice(0, 160));

/* گزارش تازه برای آزمون تکه‌تکه (سقف بالا پر شد) */
const chunkReport = pickJson(await run(`
$_POST = ['phone' => '09121112233', 'title' => 'گزارش آزمون فیلم تکه‌تکه', 'description' => 'توضیح', 'category' => 'سایر'];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_TYPE'] = 'multipart/form-data; boundary=x';
require '${APP}/api/reports.php';`));
const CRID = Number(chunkReport?.id || 0);
ok('گزارش دوم برای آزمون تکه‌تکه ساخته شد', CRID > 0, String(CRID));

/* ۴) ارسال تکه‌تکه: PNG در دو نیمه */
const raw = pngBuffer;
const half1 = raw.slice(0, Math.floor(raw.length / 2)).toString('base64');
const half2 = raw.slice(Math.floor(raw.length / 2)).toString('base64');

const chunk1 = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'abcdef12abcd1234', 'index' => '0', 'total' => '2', 'name' => 'chunk.png', 'mime' => 'image/png', 'data' => '${half1}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی اول پذیرفته می‌شود و هنوز ثبت نهایی نمی‌شود',
  chunk1?.success === true && chunk1?.done === false && chunk1?.received === 1, JSON.stringify(chunk1).slice(0, 160));

const chunk2 = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'abcdef12abcd1234', 'index' => '1', 'total' => '2', 'name' => 'chunk.png', 'mime' => 'image/png', 'data' => '${half2}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی آخر، فایل را به هم می‌چسباند و ثبت می‌کند',
  chunk2?.success === true && chunk2?.done === true && chunk2?.media_count === 1, JSON.stringify(chunk2).slice(0, 200));

const assembled = chunk2?.media?.path ? fs.statSync(`${APP}/${chunk2.media.path}`).size : 0;
ok('حجم فایل ساخته‌شده با فایل اصلی یکی است', assembled === raw.length, `${assembled} ≠ ${raw.length}`);

/* ۵) ترتیب تکه‌ها */
const badOrder = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'bad0order0123', 'index' => '1', 'total' => '3', 'name' => 'x.png', 'mime' => 'image/png', 'data' => '${half1}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('تکه‌ی خارج از نوبت رد می‌شود (فایل خراب ساخته نشود)', badOrder?.success === false && badOrder?.expected === 0, JSON.stringify(badOrder).slice(0, 160));

/* ۶) محتوای غیرمجاز در تکه‌ی آخر رد می‌شود */
const evilTxt = Buffer.from('not an image at all').toString('base64');
const evil = pickJson(await run(`
$_GET = ['action' => 'chunk'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}', 'uploadId' => 'evil00001234567', 'index' => '0', 'total' => '1', 'name' => 'evil.txt', 'mime' => 'text/plain', 'data' => '${evilTxt}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('فایل غیرمجاز در مسیر تکه‌تکه هم ذخیره نمی‌شود', evil?.success === false, JSON.stringify(evil).slice(0, 160));

/* ۷) وضعیت پیوست‌های گزارش */
const status = pickJson(await run(`
$_GET = ['action' => 'media_status'];
$_POST = ['phone' => '09121112233', 'reportId' => '${CRID}'];
$_SERVER['REQUEST_METHOD'] = 'POST';
require '${APP}/api/media.php';`));
ok('کنش media_status تعداد پیوست‌ها را برمی‌گرداند', status?.success === true && status?.media_count === 1, JSON.stringify(status).slice(0, 160));

/* ۸) پنل ادمین همان فایل تکه‌تکه‌شده را می‌بیند */
const panelMedia = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$media = getReportMedia($pdo, ${CRID});
echo json_encode([
  'count' => count($media),
  'kind' => $media[0]['kind'] ?? '',
  'url' => $media ? adminMediaUrl($media[0]['path']) : '',
]);`));
ok('پنل ادمین فایل ارسال‌شده از مسیر تازه را می‌بیند',
  panelMedia?.count === 1 && panelMedia?.kind === 'image' && String(panelMedia?.url || '').startsWith('../uploads/'),
  JSON.stringify(panelMedia));

console.log('\n=== ساختار خودترمیم روی دیتابیس قدیمی ===');
const legacy = pickJson(await run(`
$legacy = '/tmp/eplak-regression-legacy.sqlite';
@unlink($legacy);
$old = new PDO('sqlite:' . $legacy);
$old->exec("CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone VARCHAR(20), title VARCHAR(255), body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$old->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('all','قدیمی','متن قدیمی')");
$old = null;
putenv('DB_SQLITE_PATH=' . $legacy);
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
$cols = array_column($pdo->query('PRAGMA table_info(notifications)')->fetchAll(), 'name');
$sendId = sendNotification($pdo, 'تازه', 'متن', 'all', [], 'admin');
$kept = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE title = 'قدیمی'")->fetchColumn();
echo json_encode(['has_send_id' => in_array('send_id', $cols, true), 'send_ok' => $sendId >= 1, 'old_rows' => $kept]);`));
ok('ستون send_id خودکار به دیتابیس قدیمی اضافه شد', legacy?.has_send_id === true, JSON.stringify(legacy));
ok('ارسال اعلان روی دیتابیس قدیمی کار می‌کند (خطای قبلی)', legacy?.send_ok === true, JSON.stringify(legacy));
ok('داده‌های قبلی حفظ شدند', legacy?.old_rows === 1, JSON.stringify(legacy));

/* دیتابیس قدیمیِ همین سایت، جدول reports را بدون ستون‌های lat/lng دارد؛
   همگام‌سازی خودکار باید آن‌ها را اضافه کند تا موقعیت دقیق ذخیره شود. */
const legacyGeo = pickJson(await run(`
$legacy = '/tmp/eplak-regression-legacy-geo.sqlite';
@unlink($legacy);
$old = new PDO('sqlite:' . $legacy);
$old->exec("CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_phone VARCHAR(20) NOT NULL, title VARCHAR(255) NOT NULL, description TEXT NOT NULL, category VARCHAR(100) NOT NULL, department VARCHAR(255) DEFAULT '', sub_department VARCHAR(255) DEFAULT '', location VARCHAR(500) DEFAULT '', status VARCHAR(50) DEFAULT 'pending', reply TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
$old = null;
putenv('DB_SQLITE_PATH=' . $legacy);
require '${APP}/admin/includes/db.php';
$cols = array_column($pdo->query('PRAGMA table_info(reports)')->fetchAll(), 'name');
echo json_encode(['lat' => in_array('lat', $cols, true), 'lng' => in_array('lng', $cols, true), 'acc' => in_array('location_accuracy', $cols, true)]);`));
ok('ستون‌های موقعیت خودکار به جدول reports قدیمی اضافه شدند',
  legacyGeo?.lat === true && legacyGeo?.lng === true && legacyGeo?.acc === true, JSON.stringify(legacyGeo));

console.log('\n=== صفحه‌ی «بررسی نسخه» در پنل ادمین ===');
const ver = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/version.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
require '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/fcm.php';
require_once '${APP}/shared/webpush.php';
ob_start(); require '${APP}/admin/version.php'; $html = ob_get_clean();
$stored = (string) eplakAppSetting($pdo, 'schema_version', '');
echo json_encode([
  'len' => strlen($html),
  'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Notice:)/', $html) === 1,
  'has_schema' => strpos($html, EPLAK_SCHEMA_VERSION) !== false,
  'schema_in_db' => $stored === EPLAK_SCHEMA_VERSION,
  'badge_ok' => substr_count($html, 'pill-ok'),
  'badge_bad' => substr_count($html, 'pill-bad'),
  'fcm_hint' => strpos($html, 'فایربیس') !== false,
  'apk_hint' => strpos($html, 'بررسی نسخه') !== false,
]);`));
ok('صفحه‌ی بررسی نسخه بدون خطا رندر می‌شود', (ver?.len || 0) > 3000 && ver?.fatal !== true, JSON.stringify(ver));
ok('نسخه‌ی کد در صفحه نشان داده می‌شود', ver?.has_schema === true);
ok('هم‌خوانی نسخه‌ی دیتابیس تأیید می‌شود', ver?.schema_in_db === true);
ok('فایل‌های نسخه‌ی جدید «هست» علامت خورده‌اند', (ver?.badge_ok || 0) >= 5, JSON.stringify({ ok: ver?.badge_ok, bad: ver?.badge_bad }));
ok('وضعیت فایربیس و اعلان مرورگر نمایش داده می‌شود', ver?.fcm_hint === true);

console.log('\n=== هم‌خوانی منوی پنل ===');
const fsx = await import('fs');
const adminDir = `${APP}/admin`;
const navPages = fsx.readdirSync(adminDir).filter((f) => f.endsWith('.php'));
let navCount = 0, missingLink = [];
for (const f of navPages) {
  const html = fsx.readFileSync(`${adminDir}/${f}`, 'utf8');
  const hasSidebar = /href="settings\.php"><i class="fas fa-cog"><\/i> <span>تنظیمات<\/span>/.test(html);
  if (!hasSidebar) continue;
  navCount++;
  if (!html.includes('href="version.php"')) missingLink.push(f);
}
ok('صفحات پنل با منوی کنار، لینک «بررسی نسخه» دارند', navCount >= 20 && missingLink.length === 0,
   `صفحات دارای منو: ${navCount} • بدون لینک: ${missingLink.join(', ') || 'هیچ'}`);

console.log('\n' + '='.repeat(52));
console.log(`BACKEND: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
