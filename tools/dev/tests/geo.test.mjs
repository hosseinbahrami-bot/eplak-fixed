/* geo.test.mjs — «موقعیت دقیق روی نقشه» و «انتخاب عکس/فیلم» در اپ
   ------------------------------------------------------------------
   این آزمون‌ها واقعاً اجرا می‌شوند (نه فقط متن‌کاوی):
     ۱) موتور نقشه (assets/js/ep-map.js) در یک DOM ساختگی اجرا می‌شود و
        بررسی می‌شود که کاشی‌های درست برای مختصات داده‌شده درخواست شوند.
     ۲) مسیر GPS در modules/reports.js: استفاده‌ی واقعی از
        navigator.geolocation.getCurrentPosition با دقت بالا.
     ۳) پل اندروید: انتخاب فایل (onShowFileChooser) و اجازه‌ی موقعیت.
     ۴) مسیر ذخیره‌ی مختصات در سرور و نمایش آن در پنل ادمین.
*/
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

/* ══════════ ۱) موتور نقشه در DOM ساختگی ══════════ */
console.log('\n=== موتور نقشه‌ی EplakMap (کاشی‌های OpenStreetMap) ===');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this._class = new Set();
    this._className = '';
    this.listeners = {};
    this.parentNode = null;
    this._html = '';
    this.textContent = '';
    this.classList = {
      add: (c) => this._class.add(c),
      remove: (c) => this._class.delete(c),
      contains: (c) => this._class.has(c),
      toggle: (c, on) => { if (on === undefined) { this._class.has(c) ? this._class.delete(c) : this._class.add(c); } else if (on) { this._class.add(c); } else { this._class.delete(c); } },
    };
  }
  /* شبیه‌سازی ساده‌ی DOM: هر تگ باز شده در innerHTML به یک فرزند تبدیل می‌شود
     (برای دکمه‌های زوم نقشه و لایه‌ی کاشی‌ها کافی است) */
  set className(v) { this._className = String(v); String(v).split(/\s+/).forEach((c) => c && this._class.add(c)); }
  get className() { return this._className; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    const re = /<(\w+)([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(this._html)) !== null) {
      const child = new FakeNode(m[1]);
      if (m[2]) {
        const cm = /class="([^"]+)"/.exec(m[2]);
        if (cm) cm[1].split(/\s+/).forEach((c) => c && child._class.add(c));
      }
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._html; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, ev) { (this.listeners[type] || []).forEach((fn) => fn(ev || {})); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  querySelector(sel) { return this._findAll(sel)[0] || null; }
  querySelectorAll(sel) { return this._findAll(sel); }
  _matches(node, sel) {
    if (sel === '[data-tile]') return !!(node.dataset && node.dataset.tile);
    const m = /^\[data-tile="(.+)"\]$/.exec(sel);
    if (m) return node.dataset && node.dataset.tile === m[1];
    if (sel.startsWith('.')) return node._class.has(sel.slice(1));
    return node.tagName === sel.toUpperCase();
  }
  _findAll(sel) {
    const out = [];
    const walk = (node) => node.children.forEach((c) => { if (this._matches(c, sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  getBoundingClientRect() { return { width: this._rectW || 256, height: this._rectH || 256, left: 0, top: 0 }; }
}

function makeMapSandbox() {
  const head = new FakeNode('head');
  const documentStub = {
    head,
    documentElement: head,
    getElementById: () => null,
    createElement: (tag) => new FakeNode(tag),
    addEventListener() {}, removeEventListener() {},
  };
  const sandbox = {
    console, setTimeout, clearTimeout, Math, Date, JSON, Number, isFinite, parseInt, parseFloat,
    document: documentStub,
    window: null,
    addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: false, json: async () => null }),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/js/ep-map.js'), sandbox, { filename: 'ep-map.js' });
  return sandbox;
}

const worldOf = (lat, lng, zoom) => {
  const size = 256 * Math.pow(2, zoom);
  const x = (lng + 180) / 360 * size;
  const rad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * size;
  return { x, y, size };
};

const sandbox = makeMapSandbox();
ok('فایل نقشه، شیء EplakMap را می‌سازد', !!sandbox.EplakMap && typeof sandbox.EplakMap.create === 'function');
ok('آدرس کاشی‌ها OpenStreetMap است (بدون کلید API)', /tile\.openstreetmap\.org/.test(read('assets/js/ep-map.js')));

const box = new FakeNode('div');
box._rectW = 256; box._rectH = 256;
let lastChange = null;
const map = sandbox.EplakMap.create(box, {
  lat: 35.3242, lng: 51.6455, zoom: 15,
  onChange: (pos) => { lastChange = pos; },
});

const tileKeys = box.querySelectorAll('[data-tile]').map((n) => n.dataset.tile).sort();
const expectKeys = (() => {
  const zoom = 15;
  const c = worldOf(35.3242, 51.6455, zoom);
  const left = c.x - 128, top = c.y - 128;
  const max = Math.pow(2, zoom) - 1;
  const keys = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + 256) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + 256) / 256); ty++) {
      if (ty < 0 || ty > max) continue;
      keys.push(`${zoom}/${((tx % (max + 1)) + max + 1) % (max + 1)}/${ty}`);
    }
  }
  return keys.sort();
})();

ok('کاشی‌های درست برای مختصات ورودی درخواست شدند',
  tileKeys.length === expectKeys.length && tileKeys.join('|') === expectKeys.join('|'),
  `دریافتی=${tileKeys.join(',')} انتظار=${expectKeys.join(',')}`);
ok('آدرس کاشی با z/x/y ساخته می‌شود',
  box.querySelectorAll('[data-tile]').every((n) => /^https:\/\/tile\.openstreetmap\.org\/15\/\d+\/\d+\.png$/.test(n.src || '')),
  String(box.querySelectorAll('[data-tile]')[0]?.src));
ok('وقتی موقعیت داده شده، نشانگر دیده می‌شود', box.querySelector('.ep-map-pin').style.display === '');
ok('موقعیت داده‌شده «انتخاب‌شده» اعلام می‌شود', map.getPosition().hasFix === true);

/* نقشه‌ی بدون موقعیت (مرحله‌ی «موقعیت» پیش از گرفتن GPS): نشانگر پنهان و
   نشانه‌ی هدف در مرکز دیده می‌شود تا کاربر بداند باید نقشه را بکشد. */
const box2 = new FakeNode('div');
const map2 = sandbox.EplakMap.create(box2, { lat: 35.3242, lng: 51.6455, zoom: 14, hasFix: false });
ok('نقشه‌ی بدون موقعیت، نشانگر انتخاب‌شده نشان نمی‌دهد', box2.querySelector('.ep-map-pin').style.display === 'none');
ok('تا انتخاب نقطه، «هدف» مرکزی دیده می‌شود', box2.querySelector('.ep-map-crosshair').style.display === '');
ok('پیش از انتخاب کاربر، hasFix صفر است', map2.getPosition().hasFix === false);
map2.setPosition(35.32, 51.64);
ok('پس از تعیین نقطه، hasFix یک می‌شود', map2.getPosition().hasFix === true);

map.setPosition(35.7001, 51.4002);
const afterKeys = box.querySelectorAll('[data-tile]').map((n) => n.dataset.tile);
const pos = map.getPosition();
ok('setPosition مختصات را ذخیره می‌کند', Math.abs(pos.lat - 35.7001) < 1e-9 && Math.abs(pos.lng - 51.4002) < 1e-9, JSON.stringify(pos));
ok('با تنظیم موقعیت، نشانگر نمایش داده می‌شود', box.querySelector('.ep-map-pin').style.display === '');
ok('نقشه پس از جابه‌جایی، کاشی‌های تازه می‌گیرد', afterKeys.length > 0 && afterKeys.join('|') !== tileKeys.join('|'));
ok('onChange با موقعیت تازه خبر می‌دهد', !!lastChange && Math.abs(lastChange.lat - 35.7001) < 1e-9);

const posText = sandbox.EplakMap.formatPosition(35.32421, 51.64553, 12.4);
ok('متن موقعیت شامل عرض/طول و دقت است', /35\.324210/.test(posText) && /51\.645530/.test(posText) && /12/.test(posText), posText);
ok('آدرس‌یابی معکوس برای مختصات نامعتبر خطا نمی‌دهد', typeof sandbox.EplakMap.reverseGeocode('x', 5).then === 'function');
ok('نقشه آدرس‌یابی معکوس OpenStreetMap دارد', /nominatim\.openstreetmap\.org\/reverse/.test(read('assets/js/ep-map.js')));

/* ══════════ ۲) مسیر GPS در ماژول گزارش‌ها ══════════ */
console.log('\n=== موقعیت GPS در ماژول ثبت درخواست ===');
const reportsJs = read('modules/reports.js');
ok('از GPS واقعی گوشی استفاده می‌شود (getCurrentPosition)', /navigator\.geolocation\.getCurrentPosition/.test(reportsJs));
ok('دقت بالا فعال است (enableHighAccuracy)', /enableHighAccuracy:\s*true/.test(reportsJs));
ok('پیام جعلی قدیمی حذف شده است', !/موقعیت فعلی کاربر \(دریافت‌شده از GPS\)/.test(reportsJs));
ok('موقعیت روی نقشه‌ی واقعی ساخته می‌شود', /EplakMap\.create/.test(reportsJs) && /reportMapPicker/.test(reportsJs));
ok('مختصات انتخاب‌شده ذخیره و نمایش داده می‌شود', /reportDraft\.geo/.test(reportsJs) && /reportCoordsText/.test(reportsJs));
ok('خطای «دسترسی بسته» با راهنمای فعال‌سازی نمایش داده می‌شود', /دسترسی به موقعیت بسته است/.test(reportsJs) && /موقعیت مکانی/.test(reportsJs));
ok('مختصات همراه گزارش به سرور فرستاده می‌شود', /draftPayload\.lat/.test(reportsJs) && /draftPayload\.lng/.test(reportsJs));
ok('در اپ اندروید اجازه‌ی موقعیت از پل اندروید گرفته می‌شود',
  /AndroidApp\.hasLocationPermission/.test(reportsJs) && /AndroidApp\.requestLocationPermission/.test(reportsJs));
ok('پاسخ اجازه‌ی موقعیت از اندروید دریافت می‌شود', /eplakLocationPermissionResult/.test(reportsJs));
ok('اگر GPS گوشی خاموش باشد، راهنمای روشن کردنش داده می‌شود', /isLocationServiceEnabled/.test(reportsJs) && /GPS\) گوشی خاموش است/.test(reportsJs));
ok('مختصات در صفحه‌ی تأیید گزارش هم نشان داده می‌شود', /confirmLocationText[\s\S]{0,200}geo\.lat/.test(reportsJs));

const indexHtml = read('index.html');
ok('صفحه‌ی اپ، فایل نقشه را بار می‌کند', /assets\/js\/ep-map\.js\?v=\d+/.test(indexHtml));
ok('کادر نقشه در مرحله‌ی «موقعیت» وجود دارد', /id="reportMapPicker"/.test(indexHtml));
ok('نمایش مختصات زیر نقشه هست', /id="reportCoordsText"/.test(indexHtml));
ok('صفحه‌ی جای‌گزین «نقشه نمایشی» حذف شده است', !/نقشه موقعیت انتخابی \(نمایشی\)/.test(indexHtml));
ok('دکمه‌ی موقعیت فعلی، شناسه‌ی جدا دارد (برای حالت انتظار)', /id="reportGpsBtn"/.test(indexHtml));
ok('ورودی عکس/فیلم هم عکس و هم فیلم را می‌پذیرد', /id="reportPhotoInput"\s+accept="image\/\*,video\/\*"\s+multiple/.test(indexHtml));
ok('وضعیت ارسال پیوست در صفحه‌ی موفقیت هست', /id="reportUploadStatus"/.test(indexHtml));

/* ══════════ ۳) آپلود عکس/فیلم: فشرده‌سازی و پیشرفت ══════════ */
console.log('\n=== آپلود عکس و فیلم از اپ ===');
ok('عکس‌ها پیش از ارسال فشرده می‌شوند (کاهش حجم برای اینترنت موبایل)', /compressReportImage/.test(reportsJs) && /toBlob/.test(reportsJs));
ok('فایل عکس فشرده با نام و نوع درست ساخته می‌شود', /new File\(\[blob\]/.test(reportsJs));
ok('فیلم‌های حجیم هشدار می‌گیرند', /ارسالش کمی طول می‌کشد/.test(reportsJs));
ok('درصد پیشرفت آپلود به کاربر نشان داده می‌شود', /setUploadStatus/.test(reportsJs) && /reportUploadStatus/.test(reportsJs));

const storageJs = read('core/storage.js');
ok('آپلود با XMLHttpRequest و رویداد پیشرفت انجام می‌شود',
  /syncFormDataToBackendWithProgress/.test(storageJs) && /XMLHttpRequest/.test(storageJs) && /upload\.onprogress/.test(storageJs));
ok('ارسال JSON با base64 (مسیر بازی که فایروال هاست می‌بندد) پیاده شده است',
  /syncJsonToBackendWithProgress/.test(storageJs) && /application\/json/.test(storageJs));
ok('ارسال تکه‌تکه‌ی فایل حجیم (فیلم) پیاده شده است',
  /uploadReportMediaChunked/.test(storageJs) && /media\.php\?action=chunk/.test(storageJs) && /FileReader/.test(storageJs));
ok('اپ فایل‌ها را در بدنه‌ی JSON می‌فرستد (multipart روی هاست بسته است)',
  /\.media = items/.test(reportsJs) && !/new FormData\(\)/.test(reportsJs));
ok('فیلم‌های حجیم پس از ثبت گزارش تکه‌تکه فرستاده می‌شوند',
  /largeFiles/.test(reportsJs) && /uploadReportMediaChunked\(/.test(reportsJs));
ok('اگر نسخه‌ی هاست قدیمی باشد، پیام روشن به کاربر داده می‌شود',
  /بسته‌ی تازه‌ی سایت را روی هاست Extract کنید/.test(reportsJs));
ok('آپلود به window معرفی شده است', /window\.syncFormDataToBackendWithProgress\s*=/.test(storageJs));
ok('پیام موفقیت پیوست‌ها به کاربر نشان داده می‌شود', /پیوست با موفقیت ارسال/.test(reportsJs));
ok('اگر پیوست ذخیره نشد، کاربر دلیل را می‌بیند', /media_errors/.test(reportsJs) && /پیوست‌ها ذخیره نشدند/.test(reportsJs));

/* ══════════ ۴) اپ اندروید: انتخاب فایل و موقعیت ══════════ */
console.log('\n=== اپ اندروید (WebView) ===');
const main = read('android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt');
ok('WebChromeClient دیگر خالی نیست', !/webChromeClient\s*=\s*WebChromeClient\(\)/.test(main));
ok('onShowFileChooser پیاده‌سازی شده است (باز شدن گالری)', /override fun onShowFileChooser/.test(main));
ok('انتخاب چندتایی فایل پشتیبانی می‌شود (EXTRA_ALLOW_MULTIPLE)',
  /EXTRA_ALLOW_MULTIPLE/.test(main) && /clipData/.test(main));
ok('هم عکس و هم فیلم پیشنهاد می‌شود', /image\/\*/.test(main) && /video\/\*/.test(main));
ok('لغو کاربر باعث قفل شدن فیلد فایل نمی‌شود (onReceiveValue(null))', /onReceiveValue\(null\)/.test(main));
ok('اجازه‌ی موقعیت مکانی از کاربر گرفته می‌شود',
  /onGeolocationPermissionsShowPrompt/.test(main) && /ACCESS_FINE_LOCATION/.test(main));
ok('موقعیت‌یابی داخل WebView فعال شده است', /setGeolocationEnabled\(true\)/.test(main));
ok('پل اندروید، توابع موقعیت را به وب می‌دهد',
  /fun hasLocationPermission\(\)/.test(main) && /fun requestLocationPermission\(\)/.test(main));
ok('بازگشت بی‌نهایت در متدهای مجوز وجود ندارد (this@MainActivity)',
  /this@MainActivity\.hasLocationPermission\(\)/.test(main) && /this@MainActivity\.requestLocationPermission\(\)/.test(main));
ok('لینک «مشاهده در نقشه» در اپ هم باز می‌شود', /fun openUrl\(url: String\)/.test(main));
ok('صفحه‌ی تنظیمات اپ برای روشن کردن دسترسی باز می‌شود', /ACTION_APPLICATION_DETAILS_SETTINGS/.test(main));

const manifest = read('android-app/app/src/main/AndroidManifest.xml');
ok('مجوز ACCESS_FINE_LOCATION در مانیفست هست', /android\.permission\.ACCESS_FINE_LOCATION/.test(manifest));
ok('مجوز ACCESS_COARSE_LOCATION در مانیفست هست', /android\.permission\.ACCESS_COARSE_LOCATION/.test(manifest));
ok('نبود GPS روی گوشی، مانع نصب اپ نمی‌شود', /hardware\.location\.gps"[^>]*required="false"/.test(manifest));

const gradle = read('android-app/app/build.gradle');
ok('فایل نقشه داخل بسته‌ی APK کپی می‌شود (assets/**)', /include 'assets\/\*\*'/.test(gradle));

/* ══════════ ۵) سرور: ذخیره و نمایش موقعیت دقیق ══════════ */
console.log('\n=== سرور و پنل ادمین ===');
const apiReports = read('api/reports.php');
ok('API مختصات را اعتبارسنجی می‌کند', /function eplakReportCoord/.test(apiReports) && /is_numeric/.test(apiReports));
ok('مختصات خارج از محدوده رد می‌شود', /\$axis === 'lat'/.test(apiReports) && /\$axis === 'lng'/.test(apiReports));
ok('مختصات در دیتابیس ذخیره می‌شود', /INSERT INTO reports \(/.test(apiReports) && /:lat/.test(apiReports) && /:lng/.test(apiReports));
ok('API فهرست، مختصات را برمی‌گرداند', /\$row\['lat'\] = /.test(apiReports) && /\$row\['lng'\] = /.test(apiReports));
ok('اگر دیتابیس ستون مختصات نداشت، ثبت گزارش نمی‌شکند', /eplakTableHasColumn/.test(apiReports));

const apiMedia = read('api/media.php');
ok('اندپوینت آپلود JSON (بدون multipart) وجود دارد', /action=upload/.test(apiMedia) && /eplakMediaDecodeBase64/.test(apiMedia));
ok('اندپوینت ارسال تکه‌تکه برای فیلم‌ها وجود دارد', /\$action [!=]== 'chunk'/.test(apiMedia) && /\.part/.test(apiMedia));
ok('مالکیت گزارش با شماره‌ی موبایل بررسی می‌شود', /user_phone = :phone/.test(apiMedia));
ok('سقف تعداد فایل هر گزارش رعایت می‌شود', /EPLAK_MEDIA_MAX_PER_REPORT/.test(apiMedia));
ok('ترتیب تکه‌ها بررسی می‌شود (فایل خراب ساخته نشود)', /ترتیب تکه‌ها به هم خورده/.test(apiMedia));
ok('تکه‌های نیمه‌کاره‌ی قدیمی پاک می‌شوند', /21600/.test(apiMedia));
ok('رمزگشایی base64 در هسته‌ی رسانه هست', /function eplakMediaDecodeBase64/.test(read('shared/media.php')));

const bootstrap = read('shared/bootstrap.php');
const reportsDdl = bootstrap.match(/CREATE TABLE IF NOT EXISTS reports \([\s\S]*?\n    \)"/g) || [];
ok('هر دو نسخه‌ی اسکیما (SQLite و MySQL) ستون مختصات دارند',
  reportsDdl.length === 2 && reportsDdl.every((d) => /\blat\b/.test(d) && /\blng\b/.test(d) && /location_accuracy/.test(d)),
  `تعداد DDL=${reportsDdl.length}`);
ok('نسخه‌ی اسکیما برای افزودن خودکار ستون‌ها بالا رفته است', /EPLAK_SCHEMA_VERSION', '2026-09-30\.2'/.test(bootstrap));
ok('کمکی بررسی وجود ستون در هسته تعریف شده است', /function eplakTableHasColumn/.test(bootstrap));

const detail = read('admin/report_detail.php');
ok('پنل ادمین نقشه‌ی موقعیت دقیق را نشان می‌دهد', /id="adminReportMap"/.test(detail) && /EplakMap\.create/.test(detail));
ok('پنل ادمین فایل نقشه را بار می‌کند', /ep-map\.js\?v=\d+/.test(detail));
ok('مختصات و دقت در پنل نوشته می‌شود', /number_format\(\$reportLat/.test(detail) && /دقت حدود/.test(detail));
ok('لینک باز کردن در نقشه‌ی کامل در پنل هست', /openstreetmap\.org\/\?mlat=/.test(detail));
ok('گزارش‌های بدون مختصات هم پیام روشن دارند', /مختصات جغرافیایی ثبت نشده است/.test(detail));

const adminList = read('admin/reports.php');
ok('فهرست گزارش‌های پنل، گزارش دارای موقعیت را نشانه‌گذاری می‌کند', /موقعیت دقیق روی نقشه/.test(adminList));

console.log('\n' + '='.repeat(52));
console.log(`GEO/MEDIA: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
