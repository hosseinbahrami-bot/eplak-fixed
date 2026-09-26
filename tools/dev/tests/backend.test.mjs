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
const wanted = ['notifications', 'notification_reads', 'device_tokens', 'push_subscriptions', 'report_media', 'app_settings'];
const missing = wanted.filter((t) => !(db?.tables || []).includes(t));
ok('همه‌ی جدول‌های لازم ساخته شدند', missing.length === 0, 'گم‌شده: ' + missing.join(', '));
ok('نسخه‌ی ساختار دیتابیس تازه ثبت شد', /^2026-09-26\./.test(String(db?.schema)), String(db?.schema));
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

console.log('\n' + '='.repeat(52));
console.log(`BACKEND: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
