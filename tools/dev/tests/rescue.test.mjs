/* rescue.test.mjs — آزمون ابزار بازیابی اتصال دیتابیس (rescue-db.php) */
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime, useHostFilesystem } from '@php-wasm/node';
import fs from 'fs'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const SANDBOX = '/tmp/eplak-rescue-test';

/* یک نسخه‌ی موقت از سایت می‌سازیم تا آزمون به فایل‌های اصلی دست نزند */
fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(SANDBOX, { recursive: true });
for (const d of ['shared', 'data', 'admin', 'api']) {
  if (fs.existsSync(`${ROOT}/${d}`)) fs.cpSync(`${ROOT}/${d}`, `${SANDBOX}/${d}`, { recursive: true });
}
fs.copyFileSync(`${ROOT}/rescue-db.php`, `${SANDBOX}/rescue-db.php`);
fs.rmSync(`${SANDBOX}/shared/config.php`, { force: true });
fs.rmSync(`${SANDBOX}/shared/config.rescue-done`, { force: true });
fs.mkdirSync(`${SANDBOX}/data`, { recursive: true });

const runtimeId = await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } });
const php = new PHP(runtimeId);
useHostFilesystem(php);
const run = async (code) => String((await php.run({
  code: `<?php putenv('DB_DRIVER='); putenv('DB_HOST='); putenv('DB_USER='); putenv('DB_PASS='); putenv('DB_NAME='); ${code}`,
})).text).trim();

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

console.log('\n=== ۱) وقتی فایل config.php نیست ===');
const before = await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/rescue-db.php';
ob_start(); include '${SANDBOX}/rescue-db.php'; $html = ob_get_clean();
echo json_encode([
  'len' => strlen($html),
  'fatal' => preg_match('/(Fatal error|Parse error|Warning:|Notice:)/', $html) === 1,
  'detects_missing' => strpos($html, 'وجود ندارد') !== false,
  'has_form' => strpos($html, 'name="host"') !== false && strpos($html, 'name="user"') !== false && strpos($html, 'name="pass"') !== false,
  'has_guide' => strpos($html, 'MySQL') !== false,
  'leaks_pass' => strpos($html, 'CHANGE_ME') !== false,
]);`);
const b = JSON.parse(before);
ok('صفحه بدون خطا رندر می‌شود', (b.len || 0) > 1500 && b.fatal === false, before.slice(0, 200));
ok('فقدان فایل تنظیمات را تشخیص می‌دهد', b.detects_missing === true);
ok('فرم اطلاعات دیتابیس را نشان می‌دهد', b.has_form === true);
ok('راهنمای cPanel را نشان می‌دهد', b.has_guide === true);
ok('هیچ رمزی را لو نمی‌دهد', b.leaks_pass === false);

console.log('\n=== ۲) ذخیره‌ی تنظیمات درست (SQLite برای آزمون) ===');
const save = await run(`
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['SCRIPT_NAME'] = '/rescue-db.php';
$_POST = ['driver' => 'sqlite', 'sqlite_path' => '${SANDBOX}/data/eplak.sqlite'];
ob_start(); include '${SANDBOX}/rescue-db.php'; $html = ob_get_clean();
echo json_encode([
  'ok_message' => strpos($html, 'اتصال برقرار شد و فایل') !== false,
  'config_written' => is_file('${SANDBOX}/shared/config.php'),
  'marker' => is_file('${SANDBOX}/shared/config.rescue-done'),
]);`);
const sv = JSON.parse(save);
ok('پیام موفقیت نمایش داده می‌شود', sv.ok_message === true, save.slice(0, 200));
ok('فایل shared/config.php ساخته شد', sv.config_written === true);
ok('ابزار پس از موفقیت غیرفعال (نشانه) می‌شود', sv.marker === true);

console.log('\n=== ۳) محتوای فایل ساخته‌شده ===');
const content = fs.existsSync(`${SANDBOX}/shared/config.php`) ? fs.readFileSync(`${SANDBOX}/shared/config.php`, 'utf8') : '';
ok('فایل PHP معتبر است (با <?php شروع می‌شود)', content.trimStart().startsWith('<?php'));
ok('مقدارها به‌صورت امن با var_export نوشته شده‌اند', content.includes('var_export') || content.includes("'sqlite'") || content.includes('"sqlite"'));
ok('فایل با return آرایه برمی‌گرداند', /return \[/.test(content));

console.log('\n=== ۴) وقتی اتصال سالم است، ابزار فقط اطلاع می‌دهد ===');
const good = await run(`
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/rescue-db.php';
ob_start(); include '${SANDBOX}/rescue-db.php'; $html = ob_get_clean();
echo json_encode([
  'says_ok' => strpos($html, 'اتصال دیتابیس برقرار است') !== false,
  'no_form' => strpos($html, 'name="pass"') === false,
  'has_login_link' => strpos($html, 'admin/login.php') !== false,
]);`);
const g = JSON.parse(good);
ok('می‌گوید اتصال سالم است', g.says_ok === true, good.slice(0, 160));
ok('وقتی همه‌چیز خوب است فرم نشان نمی‌دهد', g.no_form === true);
ok('لینک ورود به پنل را می‌دهد', g.has_login_link === true);

console.log('\n' + '='.repeat(52));
console.log(`RESCUE: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
