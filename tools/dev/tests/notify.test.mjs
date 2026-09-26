/* notify.test.mjs — «خوانده شدن» اعلان: هر کاربر جدا، پنل درست نشان می‌دهد */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const APP = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const DB = '/tmp/eplak-regression-notify.sqlite';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER=sqlite'); putenv('DB_SQLITE_PATH=${DB}'); ini_set('session.save_path', '/tmp'); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };
const pickJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/g); if (!m) return null; for (let i = m.length - 1; i >= 0; i--) { try { return JSON.parse(m[i]); } catch (e) {} } return null; };

console.log('\n=== ارسال اعلان گروهی ===');
const sent = pickJson(await run(`
require '${APP}/admin/includes/db.php';
require '${APP}/admin/includes/functions.php';
require_once '${APP}/shared/notification_reads.php';
$pdo->exec("INSERT INTO users (phone, name) VALUES ('09120000001','الف'), ('09120000002','ب'), ('09120000003','ج')");
sendNotification($pdo, 'قطعی آب', 'فردا از ۸ تا ۱۲', 'all', [], 'admin');
echo json_encode(['send_id' => (int) $pdo->query('SELECT MAX(id) FROM notification_sends')->fetchColumn()]);`));
ok('اعلان گروهی ساخته شد', sent?.send_id > 0, JSON.stringify(sent));

const listA = pickJson(await run(`$_GET = ['phone' => '09120000001']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('کاربر «الف» اعلان را می‌بیند (نخوانده)', listA?.unread === 1 && listA?.notifications?.[0]?.read_flag === 0, JSON.stringify(listA));
const notifId = listA?.notifications?.[0]?.id;

const readA = pickJson(await run(`$_POST = ['action' => 'read', 'phone' => '09120000001', 'id' => '${notifId}']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`));
ok('خواندن اعلان ثبت شد', readA?.success === true && readA?.marked >= 1, JSON.stringify(readA));

const listA2 = pickJson(await run(`$_GET = ['phone' => '09120000001']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('برای «الف» حالا خوانده‌شده است', listA2?.unread === 0 && listA2?.notifications?.[0]?.read_flag === 1, JSON.stringify(listA2));

const listB = pickJson(await run(`$_GET = ['phone' => '09120000002']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('برای «ب» هنوز خوانده‌نشده است (جدایی وضعیت کاربران)', listB?.unread === 1 && listB?.notifications?.[0]?.read_flag === 0, JSON.stringify(listB));

console.log('\n=== دو کاربر مهمان روی دو گوشی ===');
const g = pickJson(await run(`
require '${APP}/admin/includes/db.php';
$pdo->exec("INSERT INTO notifications (user_phone, title, body) VALUES ('all', 'اطلاعیه عمومی', 'متن')");
echo json_encode(['id' => (int) $pdo->lastInsertId()]);`));
const gid = g?.id;
await run(`$_POST = ['action' => 'read', 'phone' => '', 'device' => 'device-aaa', 'ids' => '${gid}']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`);
const guest1 = pickJson(await run(`$_GET = ['phone' => 'all', 'device' => 'device-aaa']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const guest2 = pickJson(await run(`$_GET = ['phone' => 'all', 'device' => 'device-bbb']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
const itemFor = (j, id) => (j?.notifications || []).find((n) => n.id === id);
ok('مهمان اول اعلان عمومی را خوانده‌شده می‌بیند', itemFor(guest1, gid)?.read_flag === 1, JSON.stringify(itemFor(guest1, gid)));
ok('مهمان دوم هم‌چنان خوانده‌نشده می‌بیند (باگ قبلی)', itemFor(guest2, gid)?.read_flag === 0, JSON.stringify(itemFor(guest2, gid)));

console.log('\n=== «همه را خواندم» برای کاربر «ج» ===');
const readAll = pickJson(await run(`$_POST = ['action' => 'read', 'phone' => '09120000003', 'all' => '1']; $_SERVER['REQUEST_METHOD'] = 'POST'; require '${APP}/api/notifications.php';`));
const listC = pickJson(await run(`$_GET = ['phone' => '09120000003']; $_SERVER['REQUEST_METHOD'] = 'GET'; require '${APP}/api/notifications.php';`));
ok('همه‌ی اعلان‌های کاربر خوانده شد', readAll?.marked >= 2 && listC?.unread === 0, JSON.stringify({ marked: readAll?.marked, unread: listC?.unread }));

console.log('\n=== نمایش در پنل ادمین (صفحه‌ی رندر‌شده) ===');
const view = await run(`
$_SESSION = [];
$_GET = ['id' => '${sent.send_id}'];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/notification_view.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1; $_SESSION['admin_username'] = 'admin';
ob_start(); require '${APP}/admin/notification_view.php'; $html = ob_get_clean();
echo json_encode([
  'len' => strlen($html),
  'fatal' => strpos($html, 'Fatal error') !== false,
  'warn' => preg_match('/(Warning|Notice|Deprecated):/', $html) === 1,
  'stats' => (function ($h) {
      /* سه کارت آماری به ترتیب: گیرندگان، خوانده شده، خوانده نشده */
      $grab = function ($h, $p) { $s = strpos($h, '<strong>', $p) + 8; $e = strpos($h, '</strong>', $s); return (int) substr($h, $s, $e - $s); };
      $p1 = strpos($h, 'stat-item');
      $p2 = $p1 === false ? false : strpos($h, 'stat-item', $p1 + 1);
      $p3 = $p2 === false ? false : strpos($h, 'stat-item', $p2 + 1);
      if ($p3 === false) { return [-1, -1, -1]; }
      return [$grab($h, $p1), $grab($h, $p2), $grab($h, $p3)];
  })($html),
]);`);
const v = pickJson(view);
ok('صفحه‌ی گیرندگان رندر می‌شود', (v?.len || 0) > 2000, String(v?.len));
ok('بدون خطا و هشدار PHP', v && !v.fatal && v.warn !== true, JSON.stringify({ fatal: v?.fatal, warn: v?.warn }));
console.log(`   آمار: ${v?.stats?.[0]} گیرنده، ${v?.stats?.[1]} خوانده‌شده، ${v?.stats?.[2]} خوانده‌نشده`);
ok('مجموع خوانده‌شده و خوانده‌نشده برابر شمار گیرندگان است', v?.stats?.[1] + v?.stats?.[2] === v?.stats?.[0], JSON.stringify(v?.stats));
ok('حداقل دو نفر (الف و ج) اعلان را خوانده‌اند', v?.stats?.[1] >= 2, JSON.stringify(v?.stats));
ok('کاربر «ب» هنوز خوانده‌نشده دارد', v?.stats?.[2] >= 1, JSON.stringify(v?.stats));

const sends = pickJson(await run(`
$_SESSION = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/admin/notifications.php';
$_SERVER['PHP_SELF'] = '/admin/login.php';
require '${APP}/admin/auth.php';
$_SESSION['admin_logged_in'] = true; $_SESSION['admin_id'] = 1;
ob_start(); require '${APP}/admin/notifications.php'; $html = ob_get_clean();
echo json_encode(['len' => strlen($html), 'fatal' => strpos($html, 'Fatal error') !== false, 'fcm_col' => strpos($html, 'اعلان اپ (فایربیس)') !== false]);`));
ok('صفحه‌ی ارسال اعلان رندر می‌شود', (sends?.len || 0) > 3000, String(sends?.len));
ok('ستون اعلان فایربیس در جدول هست', sends?.fcm_col === true);

console.log('\n' + '='.repeat(52));
console.log(`NOTIFY: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
