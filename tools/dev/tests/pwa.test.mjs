/* pwa.test.mjs — «نسخه PWA»: manifest، تگ‌های iOS/اندروید، و بسته‌ی ایستای مستقل
   ---------------------------------------------------------------------------
   PWA همان سایت است (manifest.json + sw.js + آیکون‌ها). این آزمون می‌سنجد:
     ۱) manifest.json معتبر است و آیکون‌هایش واقعاً هستند و اندازه‌ی اعلام‌شده را دارند
        (شرط نصب در Chrome/اندروید)، و index.html تگ‌های نصب روی iOS را دارد
        (apple-touch-icon ۱۸۰، حالت تمام‌صفحه، نوار وضعیت، viewport-fit)
     ۲) سرویس‌ورکر: ثبت می‌شود و اعلان (push / notificationclick) را مدیریت می‌کند
     ۳) tools/build-pwa.sh (واقعاً اجرا می‌شود): بسته‌ی ایستا با آدرس API روی سرور اصلی؛ index.html
        مخزن دست‌نخورده می‌ماند؛ همان کدِ core/storage.js روی یک origin دیگر آدرس API را از پیکربندی
        می‌خواند و آدرس پیوست‌ها (uploads/…) به سرور اصلی می‌رود (jsdom)
        و محتوای zip: فقط فایل‌های ایستا، بدون بخش‌های PHP/پنل/راهنما
     ۴) آزمون دودیِ Chrome (tools/pwa-smoke.mjs) و ورک‌فلوی pwa.yml سالم‌اند
     ۵) راهنمای نصب (FA/EN)
*/
import fs from 'fs'; import path from 'path'; import os from 'os';
import { spawnSync } from 'child_process';
import { JSDOM } from 'jsdom';
import YAML from 'yaml';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const p = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(p(rel), 'utf8');
const exists = (rel) => fs.existsSync(p(rel));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

function pngSize(file) {
  const b = fs.readFileSync(file);
  return b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
}

/* ── ۱) manifest و تگ‌های نصب ────────────────────────────────────────────── */
console.log('— ۱) manifest و تگ‌های نصب');
const html = read('index.html');
const mf = JSON.parse(read('manifest.json'));
ok('manifest: نام، نام کوتاه، start_url، display=standalone، فارسی و راست‌به‌چپ',
  !!mf.name && mf.short_name === 'ای‌پلاک' && mf.start_url === './index.html' && mf.display === 'standalone' && mf.lang === 'fa' && mf.dir === 'rtl');
ok('manifest: رنگ پس‌زمینه و رنگ تم معتبرند', /^#[0-9a-f]{6}$/i.test(mf.background_color) && /^#[0-9a-f]{6}$/i.test(mf.theme_color));
const iconProblems = [];
const sizes = new Set();
for (const ic of mf.icons || []) {
  const f = path.join(ROOT, ic.src);
  const sz = fs.existsSync(f) ? pngSize(f) : null;
  const [w, h] = String(ic.sizes || '').split('x').map(Number);
  if (!sz || sz.w !== w || sz.h !== h) iconProblems.push(`${ic.src} (${ic.sizes}) ≠ ${sz ? sz.w + 'x' + sz.h : 'نیست'}`);
  if (ic.type !== 'image/png') iconProblems.push(ic.src + ': type');
  if (ic.purpose && !String(ic.purpose).split(/\s+/).every((x) => ['any', 'maskable', 'monochrome'].includes(x))) iconProblems.push(ic.src + ': purpose');
  sizes.add(ic.sizes);
}
ok('manifest: هر آیکون وجود دارد، PNG است و اندازه‌اش با «sizes» یکی است', (mf.icons || []).length >= 3 && iconProblems.length === 0, iconProblems.join('; '));
ok('manifest: آیکون‌های ۱۹۲ و ۵۱۲ (شرط نصب در Chrome) هست', sizes.has('192x192') && sizes.has('512x512'));
const appleHref = (html.match(/<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)"/) || [])[1];
const appleSize = appleHref && exists(appleHref) ? pngSize(p(appleHref)) : null;
ok('iOS: apple-touch-icon ‎180×180 وجود دارد و اندازه‌اش درست است', !!appleSize && appleSize.w === 180 && appleSize.h === 180, String(appleHref));
ok('iOS/اندروید: تگ manifest، theme-color، حالت تمام‌صفحه، نوار وضعیت و عنوان زیر آیکون',
  /<link rel="manifest" href="manifest\.json">/.test(html) && /<meta name="theme-color"/.test(html)
  && /<meta name="apple-mobile-web-app-capable" content="yes">/.test(html)
  && /<meta name="apple-mobile-web-app-status-bar-style"/.test(html) && /<meta name="apple-mobile-web-app-title" content="ای‌پلاک">/.test(html));
ok('صفحه زیر ناچ/نوار پایین آیفون هم درست می‌نشیند: viewport-fit=cover و env(safe-area-inset-*) در CSS',
  /viewport-fit=cover/.test(html) && (read('assets/css/style.css').match(/env\(safe-area-inset-/g) || []).length >= 4);

/* ── ۲) سرویس‌ورکر ───────────────────────────────────────────────────────── */
console.log('— ۲) سرویس‌ورکر');
const sw = read('sw.js');
ok('index.html سرویس‌ورکر sw.js را ثبت می‌کند و خطای ثبت صفحه را نمی‌شکند',
  /navigator\.serviceWorker\.register\('sw\.js'\)/.test(html) && /\.catch\(function\(err\)/.test(html));
ok('sw.js: install/activate/fetch و اعلان (push, notificationclick) را دارد',
  ['install', 'activate', 'fetch', 'push', 'notificationclick'].every((e) => new RegExp(`addEventListener\\('${e}'`).test(sw)));

/* ── ۳) tools/build-pwa.sh (اجرای واقعی) ──────────────────────────────────── */
console.log('— ۳) ساخت PWA مستقل و محتوای zip');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'eplak-pwa-'));
const proj = path.join(TMP, 'proj');
fs.mkdirSync(path.join(proj, 'tools'), { recursive: true });
for (const item of ['index.html', 'app.js', 'core', 'modules', 'views', 'assets', 'manifest.json', 'sw.js']) {
  if (exists(item)) fs.cpSync(p(item), path.join(proj, item), { recursive: true });
}
for (const junk of ['admin', 'api', 'shared', 'docs']) fs.mkdirSync(path.join(proj, junk), { recursive: true });
fs.writeFileSync(path.join(proj, 'api/ping.php'), '<?php // نباید داخل PWA ایستا بیاید');
fs.writeFileSync(path.join(proj, 'assets/.DS_Store'), 'junk');
fs.copyFileSync(p('tools/build-pwa.sh'), path.join(proj, 'tools/build-pwa.sh'));
const origIndexHash = fs.readFileSync(p('index.html'), 'utf8');

const haveZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0 && spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0;
const havePy = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0;
if (!haveZip || !havePy) {
  console.log('  ⏭  zip/unzip یا python3 روی این دستگاه نیست؛ ساخت واقعیِ PWA رد شد (در CI اجرا می‌شود)');
} else {
  const b1 = spawnSync('bash', ['tools/build-pwa.sh', 'out', 'pwa.zip'], { cwd: proj, encoding: 'utf8' });
  ok('build-pwa.sh بدون خطا اجرا می‌شود', b1.status === 0 && /✅ آماده شد/.test(b1.stdout), (b1.stdout + b1.stderr).slice(-300));
  const OUT = path.join(proj, 'out');
  const patched = fs.existsSync(path.join(OUT, 'index.html')) ? fs.readFileSync(path.join(OUT, 'index.html'), 'utf8') : '';
  const API = 'https://eplak.ir/eplak-fixed/api';

  ok('پیکربندی API پیش از اولین اسکریپت صفحه، و بعد از آن core/storage.js می‌آید',
    patched.includes(`window.EPLAK_API_BASE_URL='${API}'`)
    && patched.indexOf('EPLAK_API_BASE_URL=') < patched.indexOf('<script src=')
    && patched.indexOf('<script src="core/storage.js') < patched.indexOf('PWA مستقل: پیوست‌های گزارش'));
  ok('index.html مخزن دست‌نخورده می‌ماند و فقط کپیِ خروجی اصلاح می‌شود',
    read('index.html') === origIndexHash && fs.readFileSync(path.join(proj, 'index.html'), 'utf8') === origIndexHash
    && patched.length > origIndexHash.length && patched.replace(/<script>window\.EPLAK_API_BASE_URL[^\n]*\n/, '').length < patched.length);

  /* همان کدِ مخزن روی یک origin دیگر (مثل github.io): آدرس API را از پیکربندی بخواند */
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { url: 'https://example.github.io/eplak-fixed/index.html', runScripts: 'outside-only' });
  const w = dom.window;
  const cfgJs = (patched.match(/<script>(window\.EPLAK_API_BASE_URL[^<]*)<\/script>/) || [, ''])[1];
  const mediaJs = (patched.match(/<script>(\/\* PWA مستقل[\s\S]*?)<\/script>/) || [, ''])[1];
  let evalErr = '';
  try { w.eval(cfgJs); w.eval(fs.readFileSync(p('core/storage.js'), 'utf8')); w.eval(mediaJs); } catch (e) { evalErr = String(e && e.message || e); }
  ok('core/storage.js روی origin دیگر آدرس API را از پیکربندی می‌خواند (نه «api» نسبی)',
    evalErr === '' && w.EPLAK_API_BASE_URL === API && typeof w.eplakApiBase === 'function' && w.eplakApiBase() === API, evalErr);
  const f = w.eplakResolveMediaUrl;
  ok('پیوست‌های نسبی (uploads/…) به سرور اصلی می‌روند؛ آدرس کامل، data: و blob: دست‌نخورده',
    typeof f === 'function' && f('uploads/reports/a.jpg') === 'https://eplak.ir/eplak-fixed/uploads/reports/a.jpg'
    && f('/uploads/x.mp4') === 'https://eplak.ir/eplak-fixed/uploads/x.mp4' && f('https://a.b/c.png') === 'https://a.b/c.png'
    && f('data:image/png;base64,AA') === 'data:image/png;base64,AA' && f('blob:abc') === 'blob:abc' && f('') === '');
  dom.window.close();

  /* ── ۴) محتوای zip ─────────────────────────────────────────────────────── */
  const list = spawnSync('unzip', ['-Z1', path.join(proj, 'pwa.zip')], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  ok('zip: فایل‌های ایستای PWA هست (index.html، manifest، sw.js، هسته، ماژول‌ها، آیکون‌ها، .nojekyll)',
    ['index.html', 'manifest.json', 'sw.js', 'app.js', '.nojekyll', 'core/storage.js', 'modules/city-map.js', 'assets/img/pwa-icon-512.png', 'assets/img/apple-touch-icon.png'].every((n) => list.includes(n)));
  ok('zip: هیچ بخش PHP/پنل/راهنما/پروژه‌ی اپ داخلش نیست و .DS_Store نمی‌رود',
    !list.some((n) => /^(api|admin|shared|docs|tools|android-app|ios-app)\//.test(n) || /\.php$/.test(n) || /\.DS_Store$/.test(n)));
  const zipIndex = spawnSync('unzip', ['-p', path.join(proj, 'pwa.zip'), 'index.html'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
  ok('index.html داخل zip همان نسخه‌ی اصلاح‌شده‌ی پوشه‌ی خروجی است', zipIndex === patched && zipIndex.length > 1000);

  const b2 = spawnSync('bash', ['tools/build-pwa.sh', 'out2', 'pwa2.zip'], { cwd: proj, encoding: 'utf8', env: { ...process.env, EPLAK_PWA_API_BASE: 'https://example.ir/x/api' } });
  const patched2 = fs.existsSync(path.join(proj, 'out2/index.html')) ? fs.readFileSync(path.join(proj, 'out2/index.html'), 'utf8') : '';
  ok('آدرس API دلخواه (EPLAK_PWA_API_BASE) هم برای API و هم برای پیوست‌ها اعمال می‌شود',
    b2.status === 0 && patched2.includes("window.EPLAK_API_BASE_URL='https://example.ir/x/api'") && patched2.includes("var base='https://example.ir/x/';"), (b2.stdout + b2.stderr).slice(-200));

  /* ساختار index.html عوض شود (تگ core/storage.js نباشد) ← ساخت با خطای روشن متوقف شود، نه بسته‌ی خراب */
  const idx = path.join(proj, 'index.html');
  fs.writeFileSync(idx, origIndexHash.replace(/<script src="core\/storage\.js[^"]*"><\/script>/, ''));
  const b3 = spawnSync('bash', ['tools/build-pwa.sh', 'out3', 'pwa3.zip'], { cwd: proj, encoding: 'utf8' });
  ok('اگر تگ core/storage.js در index.html پیدا نشود، ساخت با خطای روشن متوقف می‌شود',
    b3.status !== 0 && /core\/storage\.js در index\.html پیدا نشد/.test(b3.stdout + b3.stderr) && !fs.existsSync(path.join(proj, 'pwa3.zip')),
    (b3.stdout + b3.stderr).slice(-160));
  fs.writeFileSync(idx, origIndexHash);
}
fs.rmSync(TMP, { recursive: true, force: true });

/* ── ۵) آزمون دودی Chrome و ورک‌فلو ──────────────────────────────────────── */
console.log('— ۴) آزمون دودی و ورک‌فلو');
const nodeCheck = spawnSync(process.execPath, ['--check', p('tools/pwa-smoke.mjs')], { encoding: 'utf8' });
ok('tools/pwa-smoke.mjs سینتکس درست دارد', nodeCheck.status === 0, nodeCheck.stderr.slice(0, 200));
const smokeSrc = read('tools/pwa-smoke.mjs');
ok('نام‌هایی که آزمون دودی از صفحه می‌خواند در کد وب هست',
  html.includes('id="cityMapCanvas"') && /cm-chip/.test(read('modules/city-map.js')) && /cm-row/.test(read('modules/city-map.js'))
  && /ep-map-tiles/.test(read('assets/js/ep-map.js')) && /ep-map-markers/.test(read('assets/js/ep-map.js'))
  && /getInstallabilityErrors/.test(smokeSrc) && /getAppManifest/.test(smokeSrc) && /showScreen\('screen-map'\)/.test(smokeSrc));
let wf = null, wfErr = '';
try { wf = YAML.parse(read('.github/workflows/pwa.yml')); } catch (e) { wfErr = String(e.message || e); }
ok('pwa.yml YAML سالم است و روی Ubuntu اجرا می‌شود', !!wf && /^ubuntu-/.test(wf.jobs.pwa['runs-on']), wfErr);
const apkWf = YAML.parse(read('.github/workflows/android-apk.yml'));
const pwaPaths = new Set((wf && wf.on.push.paths) || []);
const apkWeb = apkWf.on.push.paths.filter((x) => !['android-app/**', '.github/workflows/android-apk.yml'].includes(x));
ok('هر تغییرِ وبی که APK می‌سازد، بسته‌ی PWA را هم دوباره می‌سازد', apkWeb.length >= 6 && apkWeb.every((x) => pwaPaths.has(x)) && pwaPaths.has('manifest.json') && pwaPaths.has('sw.js'), [...pwaPaths].join(' '));
const wfText = read('.github/workflows/pwa.yml');
ok('zip فقط پس از گذشتن آزمون دودی به Releases پیوست می‌شود، به همان صفحه‌ی APK',
  wf.env.RELEASE_TAG === 'v2.0-eplak-update' && wfText.indexOf('pwa-smoke.mjs') > 0
  && wfText.indexOf('pwa-smoke.mjs') < wfText.indexOf('gh release upload') && /--clobber/.test(wfText) && !/secrets\./.test(wfText));

/* ── ۶) راهنما ───────────────────────────────────────────────────────────── */
console.log('— ۵) راهنما');
const faDoc = exists('docs/IOS_PWA_FA.md') ? read('docs/IOS_PWA_FA.md') : '';
const enDoc = exists('docs/IOS_PWA_EN.md') ? read('docs/IOS_PWA_EN.md') : '';
ok('راهنمای فارسی: PWA، eplak-pwa.zip، نصب روی آیفون و اندروید', ['PWA', 'eplak-pwa.zip', 'Safari', 'Chrome', 'افزودن به صفحه اصلی'].every((t) => faDoc.includes(t)));
ok('راهنمای انگلیسی: PWA, eplak-pwa.zip, install on iPhone and Android', ['PWA', 'eplak-pwa.zip', 'Safari', 'Chrome', 'Add to Home Screen'].every((t) => enDoc.includes(t)));

console.log('\n' + '='.repeat(52));
console.log(`PWA: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
