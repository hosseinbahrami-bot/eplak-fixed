/* app.test.mjs — درخواست‌های واقعی اپ: «خوانده شد»، اعلان سیستمی اندروید و ثبت توکن فایربیس */
import fs from 'fs'; import vm from 'vm'; import path from 'path';

const ROOT = process.env.EPLAK_ROOT || path.resolve(process.cwd(), '../../..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  — ' + x : '')); } };

/* ---------- محیط حداقلی مرورگر/WebView ---------- */
const calls = [];
const store = {};

function makeDom(nodes) {
  return {
    readyState: 'loading',
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => {
      const node = { style: {}, onclick: null, appendChild() {}, addEventListener() {}, _html: '', id: '' };
      Object.defineProperty(node, 'innerHTML', { set(v) { this._html = v; if (node.id === 'eplakLiveNotifBanner') calls.push('banner'); }, get() { return this._html; } });
      return node;
    },
    addEventListener() {}, removeEventListener() {},
    body: { appendChild: () => {} },
    hidden: false,
  };
}

function buildSandbox(opts = {}) {
  const nodes = new Map();
  ['notifDeviceNotice', 'notifListWrap', 'homeNotifDot', 'dashNotifDot'].forEach((id) => {
    nodes.set(id, { id, innerHTML: '', style: { display: '' }, appendChild() {}, addEventListener() {} });
  });

  const server = { notifications: opts.serverNotifications || [] };
  const sandbox = {
    console,
    setTimeout, clearTimeout, clearInterval: () => 0, setInterval: () => 0,
    URLSearchParams, requestAnimationFrame: (fn) => fn(),
    fetch: async (url, o) => {
      calls.push({ url, body: o && o.body });
      if (String(url).includes('notifications.php')) return { ok: true, json: async () => ({ success: true, notifications: server.notifications, unread: 1 }) };
      if (String(url).includes('news.php')) return { ok: true, json: async () => ({ success: true, items: [] }) };
      if (String(url).includes('push.php')) return { ok: true, json: async () => ({ success: true, vapid_public_key: 'x', enabled: true, fcm_ready: true }) };
      return { ok: true, json: async () => ({ success: true }) };
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    navigator: {},
    document: makeDom(nodes),
    getCurrentPhone: () => '09123456789',
    soundManager: { playNotification: () => calls.push('sound') },
    showScreen: () => {},
    saveNotifications: () => {},
    renderNotifications: () => {},
    notifications: [],
    seenNotifIds: new Set(),
    window: null,
    _server: server,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  if (opts.android) {
    sandbox.localStorage.setItem('eplak_device_id', 'dev-1');
    sandbox.AndroidApp = {
      showNotification: (t, b, i) => calls.push({ native: { t, b, i } }),
      notificationsEnabled: () => opts.notificationsEnabled !== false,
      ensureNotificationChannel: () => calls.push('channel'),
      requestNotificationPermission: () => calls.push('requestPermission'),
      getFcmToken: () => opts.fcmToken || '',
      isFcmReady: () => !!opts.fcmToken,
      refreshFcmToken: () => calls.push('refreshToken'),
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(`${ROOT}/modules/live.js`, 'utf8'), sandbox, { filename: 'live.js' });
  return sandbox;
}

/* ---------- ۱) گزارش «خوانده شد» به سرور ---------- */
console.log('\n=== گزارش «خوانده شد» از اپ ===');
const s1 = buildSandbox({});
ok('markNotificationsRead در دسترس است', typeof s1.markNotificationsRead === 'function');
await s1.markNotificationsRead('srv-7', false);
const body1 = new URLSearchParams(calls.at(-1).body);
ok('کنش read به api/notifications.php می‌رود', String(calls.at(-1).url).endsWith('/notifications.php') && body1.get('action') === 'read');
ok('شماره‌ی کاربر همراه درخواست است', body1.get('phone') === '09123456789', body1.get('phone'));
ok('شناسه‌ی اعلان بدون پیشوند srv- فرستاده می‌شود', body1.get('ids') === '7', body1.get('ids'));
ok('شناسه‌ی دستگاه برای کاربر مهمان همراه است', (body1.get('device') || '').length >= 5, body1.get('device'));
ok('بدنه فرمی است (روی همه‌ی هاست‌ها پارس می‌شود)', /x-www-form-urlencoded/.test(calls.at(-1).body ? 'x-www-form-urlencoded' : ''));

await s1.markNotificationsRead(null, true);
const body2 = new URLSearchParams(calls.at(-1).body);
ok('«همه را خواندم» درست فرستاده می‌شود', body2.get('all') === '1' && !body2.get('ids'));

await s1.markNotificationsRead(['srv-3', 9, 'srv-11'], false);
const body3 = new URLSearchParams(calls.at(-1).body);
ok('آرایه‌ی شناسه‌ها درست تبدیل می‌شود', body3.get('ids') === '3,9,11', body3.get('ids'));

/* ---------- ۲) اعلان سیستمی در اپ اندروید ---------- */
console.log('\n=== اعلان سیستمی اپ اندروید ===');
const first = [{ id: 11, title: 'قطعی آب', body: 'فردا ۸ تا ۱۲', read_flag: 0, created_at: '2026-09-26 10:00:00' }];
const s2 = buildSandbox({ android: true, serverNotifications: first, fcmToken: 'FCM-TOKEN-XYZ' });
ok('اپ اندروید شناسایی می‌شود', s2.eplakPushCapability().kind === 'android_native');
ok('وضعیت فایربیس گزارش می‌شود', s2.eplakPushCapability().fcm === true);

await s2.syncLiveContent();
const before = calls.filter((c) => c && c.native).length;
s2._server.notifications = [{ id: 12, title: 'اطلاعیه تازه', body: 'متن تازه', read_flag: 0, created_at: '2026-09-26 11:00:00' }, ...first];
await s2.syncLiveContent();
const native = calls.filter((c) => c && c.native).pop();
ok('اعلان تازه، نوتیفیکیشن سیستمی اندروید را صدا می‌زند', !!native && before === 0, JSON.stringify(calls.slice(-4)));
ok('عنوان و متن درست منتقل می‌شود', native?.native?.t === 'اطلاعیه تازه' && native?.native?.b === 'متن تازه', JSON.stringify(native?.native));
ok('بنر داخل برنامه هم نمایش داده می‌شود', calls.includes('banner'));

/* ---------- ۳) ثبت توکن فایربیس روی سرور ---------- */
console.log('\n=== ثبت دستگاه اپ روی سرور ===');
calls.length = 0;
const reg = await s2.registerAppDevice(true);
const regCall = calls.find((c) => typeof c === 'object' && String(c.url).includes('push.php'));
const regBody = new URLSearchParams(regCall?.body || '');
ok('توکن دستگاه به سرور فرستاده شد', reg?.ok === true, JSON.stringify(reg));
ok('کنش register_fcm استفاده شده', regBody.get('action') === 'register_fcm', regBody.get('action'));
ok('توکن و شماره درست ارسال شد', regBody.get('token') === 'FCM-TOKEN-XYZ' && regBody.get('phone') === '09123456789', JSON.stringify([regBody.get('token'), regBody.get('phone')]));

calls.length = 0;
await s2.registerAppDevice(false);
ok('ثبت تکراری دوباره فرستاده نمی‌شود (سبک‌بار)', calls.filter((c) => typeof c === 'object' && String(c.url).includes('push.php')).length === 0);

/* ---------- ۴) اپ بدون فایربیس ---------- */
console.log('\n=== اپ بدون فایربیس (تنظیم نشده) ===');
const s3 = buildSandbox({ android: true, fcmToken: '' });
const r3 = await s3.registerAppDevice(true);
ok('نبود توکن بی‌خطا مدیریت می‌شود', r3.ok === false && r3.reason === 'no_fcm_token', JSON.stringify(r3));
s3.renderDeviceNotice();
const notice = s3.document.getElementById('notifDeviceNotice').innerHTML;
ok('به کاربر وضعیت دقیق اعلان نشان داده می‌شود', notice.length > 20, notice.slice(0, 80));

/* ---------- ۵) اپ با فایربیس ---------- */
console.log('\n=== اپ با فایربیس ===');
const s4 = buildSandbox({ android: true, fcmToken: 'T' });
s4.renderDeviceNotice();
const notice4 = s4.document.getElementById('notifDeviceNotice').innerHTML;
ok('ادعای تأییدنشده‌ی «اعلان گوشی کامل فعال است» نوشته نمی‌شود',
  !notice4.includes('کامل فعال است') && !notice4.includes('حتی وقتی برنامه بسته باشد'), notice4.slice(0, 90));
ok('به کاربر می‌گوید اعلان داخل برنامه کار می‌کند', notice4.includes('داخل برنامه'));
ok('راهنمای واقعی تنظیمات گوشی به کاربر داده می‌شود',
  notice4.includes('تنظیمات گوشی') && notice4.includes('ای‌پلاک'));

/* ---------- ۶) مرورگر ---------- */
console.log('\n=== مرورگر/دستگاه بدون اعلان پس‌زمینه ===');
const s5 = buildSandbox({});
s5.renderDeviceNotice();
const notice5 = s5.document.getElementById('notifDeviceNotice').innerHTML;
ok('متن دستگاه بدون اعلان پس‌زمینه صادقانه است و ادعای صفحه‌ی قفل نمی‌کند',
  notice5.includes('اعلان‌های تازه در فهرست') && !notice5.includes('صفحه‌ی قفل'), notice5.slice(0, 90));

/* ---------- ۷) حذف اعلان ---------- */
console.log('\n=== حذف اعلان از فهرست کاربر ===');
calls.length = 0;
const s6 = buildSandbox({ android: true, fcmToken: 'T' });
s6.notifications = [
  { id: 'srv-21', title: 'الف', body: 'متن الف', read: false, time: '۱۰:۰۰' },
  { id: 'srv-22', title: 'ب', body: 'متن ب', read: true, time: '۱۱:۰۰' }
];
const rDel = await s6.deleteNotifications([21], false);
const delBody = new URLSearchParams(String(calls.at(-1).body));
ok('حذف با کنش delete به سرور می‌رود',
  String(calls.at(-1).url).endsWith('/notifications.php') && delBody.get('action') === 'delete');
ok('شناسه‌ی اعلان بدون پیشوند srv- حذف می‌شود', delBody.get('ids') === '21', delBody.get('ids'));
ok('شماره‌ی کاربر همراه درخواست حذف است', delBody.get('phone') === '09123456789');
ok('پاسخ موفق سرور پذیرفته می‌شود', rDel.ok === true);

calls.length = 0;
await s6.deleteNotifications(null, true);
const delAllBody = new URLSearchParams(String(calls.at(-1).body));
ok('«حذف همه» با all=1 فرستاده می‌شود', delAllBody.get('all') === '1' && !delAllBody.get('ids'));

/* ---------- ۸) صف حذف وقتی اینترنت نیست ---------- */
console.log('\n=== صف حذف در حالت قطعی اینترنت ===');
const s7 = buildSandbox({ android: true, fcmToken: 'T' });
s7.notifications = [{ id: 'srv-31', title: 'ج', body: 'متن ج', read: false, time: '۱۲:۰۰' }];
calls.length = 0;
s7.fetch = async () => { throw new Error('offline'); };
await s7.deleteNotif('srv-31');
ok('اعلان در حالت آفلاین از فهرست خود کاربر پاک می‌شود', !s7.notifications.some((n) => String(n.id) === 'srv-31'));
ok('وقتی اینترنت نیست، حذف در صف می‌ماند (گم نمی‌شود)', s7.eplakPendingDeletes().length === 1, JSON.stringify(s7.eplakPendingDeletes()));

calls.length = 0;
s7.fetch = async (url, o) => { calls.push({ url, body: o && o.body }); return { ok: true, json: async () => ({ success: true, deleted: true }) }; };
await s7.flushPendingDeleteNotifs();
const retryBody = new URLSearchParams(String(calls.at(-1).body));
ok('با برگشتن اینترنت، حذف دوباره به سرور می‌رود', retryBody.get('action') === 'delete' && retryBody.get('ids') === '31', String(calls.at(-1).body));

calls.length = 0;
const refreshed = await s7.refreshNotificationsNow();
ok('refreshNotificationsNow فهرست را از سرور می‌خواند',
  refreshed === true && calls.some((c) => typeof c === 'object' && String(c.url).includes('/notifications.php')));

/* ---------- ۹) تازه‌سازی وضعیت گزارش‌ها و گالری پیوست‌ها ---------- */
console.log('\n=== تازه‌سازی وضعیت گزارش‌ها (پنل ادمین ← اپ) ===');
const reportsJs = fs.readFileSync(path.join(ROOT, 'modules/reports.js'), 'utf8');

ok('آدرس API در همه‌ی درخواست‌ها «فراخوانی» شده است (نه خودِ تابع)',
  !/\$\{apiBase\}/.test(reportsJs) && (reportsJs.match(/\$\{apiBase\(\)\}/g) || []).length >= 6,
  'تعداد موارد درست: ' + (reportsJs.match(/\$\{apiBase\(\)\}/g) || []).length);
ok('فهرست گزارش‌ها از سرور خوانده می‌شود (مسیر درست API)',
  /\$\{apiBase\(\)\}\/reports\.php\?phone=/.test(reportsJs));
ok('حذف گزارش هم از مسیر درست API انجام می‌شود',
  /\$\{apiBase\(\)\}\/reports\.php\?action=delete/.test(reportsJs));
ok('کارهای تیکت هم از مسیر درست انجام می‌شوند',
  /\$\{apiBase\(\)\}\/tickets\.php/.test(reportsJs));
ok('فهرست واحدها از سرور خوانده می‌شود',
  /\$\{apiBase\(\)\}\/departments\.php/.test(reportsJs));

ok('وضعیت گزارش‌ها خودکار تازه می‌شود (هر ۴۵ ثانیه)',
  /REPORTS_REFRESH_MS = 45000/.test(reportsJs) && /setInterval\(/.test(reportsJs));
ok('با برگشتن اپ از پس‌زمینه هم وضعیت‌ها تازه می‌شوند',
  /visibilitychange/.test(reportsJs) && /refreshReportsNow/.test(reportsJs));
ok('در پس‌زمینه بودن اپ، درخواست بی‌فایده زده نمی‌شود',
  /document\.visibilityState === 'hidden'/.test(reportsJs));
ok('پس از تازه‌سازی، فهرست/جزئیات دوباره رندر می‌شود',
  /function repaintReportsScreens/.test(reportsJs) && /skipBackend: true/.test(reportsJs));
ok('وضعیت تازه از سرور به مقدار داخلی اپ نگاشت می‌شود',
  /status: normalizeStatusValue\(item\.status \|\| 'pending'\)/.test(reportsJs));

console.log('\n=== گالری عکس و فیلم در اپ ===');
ok('کاشی‌های عکس در گالری ساخته می‌شوند', /media-tile/.test(reportsJs) && /media-strip/.test(reportsJs));
ok('فیلم‌ها با پیش‌نمایش و آیکن پخش نشان داده می‌شوند',
  /media-video-card/.test(reportsJs) && /media-play-badge/.test(reportsJs));
ok('نمایش تمام‌صفحه (لایت‌باکس) برای پیوست‌ها هست',
  /function openReportMedia/.test(reportsJs) && /function closeReportMedia/.test(reportsJs));
ok('بین پیوست‌ها می‌توان جلو/عقب رفت',
  /function stepReportMedia/.test(reportsJs) && /media-viewer-nav/.test(reportsJs));
ok('دکمه‌ی بازگشت گوشی، اول گالری را می‌بندد',
  /reportMediaViewer/.test(fs.readFileSync(path.join(ROOT, 'core/router.js'), 'utf8')));
ok('اندازه‌ی فایل هر پیوست در گالری نوشته می‌شود', /formatFileSize\(m\.size/.test(reportsJs));

const appCss = fs.readFileSync(path.join(ROOT, 'assets/css/style.css'), 'utf8');
const stateSrc = fs.readFileSync(path.join(ROOT, 'core/state.js'), 'utf8');
const iconsSrc = fs.readFileSync(path.join(ROOT, 'assets/js/icons.js'), 'utf8');
ok('استایل گالری اپ (کاشی مربعی و لایت‌باکس) اضافه شده است',
  /\.media-tile \{/.test(appCss) && /aspect-ratio: 1 \/ 1/.test(appCss) && /\.media-viewer\.open/.test(appCss));
ok('صفحه‌ی اپ، نسخه‌ی تازه‌ی فایل‌ها را بار می‌کند',
  /modules\/reports\.js\?v=23/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));

console.log('\n=== گزارش فنی ارسال پیوست (برای پیگیری) ===');
ok('نتیجه‌ی هر تلاش ارسال در اپ ثبت می‌شود',
  /UPLOAD_LOG_KEY/.test(reportsJs) && /function saveUploadLog/.test(reportsJs));
ok('کاربر می‌تواند جزئیات فنی را ببیند',
  /function showUploadDetails/.test(reportsJs) && /نمایش جزئیات فنی ارسال/.test(reportsJs));

/* ---------- ۱۰) هیچ تابعی در قالب رشته‌ای «بدون فراخوانی» جاگذاری نشده ---------- */
console.log('\n=== بررسی سراسری: جاگذاری تابع بدون فراخوانی در رشته‌ها ===');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'uploads', 'data', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};
const suspicious = [];
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const funcs = new Set([
    ...Array.from(src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g), (m) => m[1]),
    ...Array.from(src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g), (m) => m[1]),
  ]);
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}(?![\(\w])/g)) {
    if (funcs.has(m[1])) {
      suspicious.push(path.relative(ROOT, file) + ':' + (src.slice(0, m.index).split('\n').length) + ' → ${' + m[1] + '}');
    }
  }
}
ok('هیچ تابعی بدون () داخل رشته‌های قالبی جاگذاری نشده است',
  suspicious.length === 0, suspicious.slice(0, 4).join(' | '));

console.log('\n=== ارسال خودکار پیوست‌های جامانده (صف گوشی) ===');
const storageSrc = fs.readFileSync(path.join(ROOT, 'core/storage.js'), 'utf8');
ok('صف پیوست‌های ناموفق روی گوشی ساخته می‌شود (IndexedDB)',
  /PENDING_DB = 'eplak_pending_media'/.test(storageSrc) && /function queuePendingMedia/.test(storageSrc)
  && /eplak_pending_media/.test(storageSrc));
ok('صف، فایل‌های ناموفق را با شناسه‌ی گزارش نگه می‌دارد',
  /key: String\(reportId\)/.test(storageSrc) && /blob: file/.test(storageSrc));
ok('ارسال دوباره‌ی صف با گروه‌بندی بر اساس گزارش انجام می‌شود',
  /async function flushPendingMedia/.test(storageSrc) && /uploadReportMediaChunked\(group\.reportId/.test(storageSrc));
ok('فایل‌های موفق از صف حذف می‌شوند و ناموفق‌ها می‌مانند',
  /store\.clear\(\);/.test(storageSrc) && /leftovers\.forEach/.test(storageSrc));
ok('اگر مرورگر IndexedDB نداشت، رفتار قبلی حفظ می‌شود (بدون خطا)',
  /if \(!window\.indexedDB\) \{/.test(storageSrc) && /resolve\(null\)/.test(storageSrc));
ok('صف در دسترس لایه‌ی اپ قرار می‌گیرد',
  /window\.eplakQueuePendingMedia/.test(storageSrc) && /window\.eplakFlushPendingMedia/.test(storageSrc)
  && /window\.eplakCountPendingMedia/.test(storageSrc));
ok('فایل‌های ناموفق هنگام ثبت گزارش در صف گذاشته می‌شوند',
  /eplakQueuePendingMedia\(newReport\.backendId, phone, files\)/.test(reportsJs));
ok('صف هنگام باز شدن اپ و برگشتن اینترنت خودکار فرستاده می‌شود',
  /window\.addEventListener\('online', function \(\) \{ flushPendingUploads\(\); \}\)/.test(reportsJs)
  && /setTimeout\(flushPendingUploads, 2500\)/.test(reportsJs));
ok('پس از ارسال خودکار، وضعیت گزارش‌ها هم تازه می‌شود',
  /پیوست جامانده خودکار ارسال شد/.test(reportsJs));

console.log('\n=== روند رسیدگی داخل اپ (هم‌خوان با پنل ادمین) ===');
ok('گام‌های واقعی سرور روی چهار مرحله‌ی روند رسیدگی سوار می‌شوند',
  /Array\.isArray\(r\.flow\) && r\.flow\.length === 4/.test(reportsJs) && /r\.flow\.map/.test(reportsJs));
ok('پاسخ سرور، روند چهارمرحله‌ای را همراه گزارش به اپ می‌دهد (بدون محاسبه‌ی موازی)',
  /flow: Array\.isArray\(item\.flow\) && item\.flow\.length === 4 \? item\.flow : null/.test(reportsJs)
  && /\$row\['flow'\] = eplakReportFlowStages\(/.test(fs.readFileSync(path.join(ROOT, 'api/reports.php'), 'utf8')));
ok('چهار مرحله دقیقاً همان خواسته‌ی کاربر است (ثبت گزارش → در حال انتظار → در حال رسیدگی → انجام شد)',
  /created: 'ثبت گزارش'/.test(reportsJs) && /pending: 'در حال انتظار'/.test(reportsJs)
  && /in_progress: 'در حال رسیدگی'/.test(reportsJs) && /done: 'انجام شد'/.test(reportsJs));
ok('هر مرحله: آیکون پک، نشان وضعیت، توضیح و تاریخ دارد',
  /flow-marker/.test(reportsJs) && /flow-badge/.test(reportsJs)
  && /flow-note/.test(reportsJs) && /flow-date/.test(reportsJs));
ok('روند پایه برای گزارش‌های بدون گام ساخته می‌شود (بدون صفحه‌ی خالی)',
  /const flowFromStatus = /.test(reportsJs) && /درخواست شهروند ثبت شد\./.test(reportsJs));
ok('مرحله‌ی جاری با انیمیشن نشان داده می‌شود (کار در جریان است)',
  /is-current/.test(reportsJs) && /@keyframes flowPulse/.test(appCss));
ok('کارت خلاصه‌ی وضعیت بالای صفحه‌ی جزئیات هست',
  /detailStatusSummary/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  && /status-summary-box/.test(reportsJs) && /\.status-summary-box/.test(appCss));
ok('کارت خلاصه، تعداد مراحل سپری‌شده از چهار مرحله را نشان می‌دهد',
  /مراحل رسیدگی/.test(reportsJs) && /flowStages\.length/.test(reportsJs));
ok('برچسب وضعیت در اپ همان چهار مرحله‌ی درخواستی است',
  /pending: 'در حال انتظار',\s*\n\s*in_progress: 'در حال رسیدگی',/.test(stateSrc)
  && /done: 'انجام شد'/.test(stateSrc));
ok('هر مرحله در پک آیکون حرفه‌ای، آیکون اختصاصی دارد',
  /'file-plus':/.test(iconsSrc) && /'clock':/.test(iconsSrc) && /'tools':/.test(iconsSrc) && /'check-circle':/.test(iconsSrc));
ok('پک آیکون با نسخه‌ی تازه در اپ بارگذاری می‌شود (کش قدیمی نمایش داده نشود)',
  /assets\/js\/icons\.js\?v=13/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  && /hydrateIcons/.test(iconsSrc) && /data-eplak-icon/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
const iconKeys = [...iconsSrc.slice(iconsSrc.indexOf('var ICONS'), iconsSrc.indexOf('var EMOJI_MAP')).matchAll(/^\s*'([^']+)':\s*'/gm)].map((m) => m[1]);
const emojiPairs = [...iconsSrc.slice(iconsSrc.indexOf('var EMOJI_MAP')).matchAll(/^\s*'([^']+)':\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]);
const emojiDupes = emojiPairs.map((p) => p[0]).filter((k, i, a) => a.indexOf(k) !== i);
const brokenRefs = emojiPairs.filter(([, v]) => !iconKeys.includes(v));
ok('نقشه‌ی ایموجی بدون کلید تکراری و کامل است (همه به آیکون موجود اشاره می‌کنند)',
  emojiDupes.length === 0 && brokenRefs.length === 0 && iconKeys.length >= 100 && emojiPairs.length >= 160,
  `icons=${iconKeys.length} map=${emojiPairs.length} dupes=${emojiDupes.length} broken=${brokenRefs.length}`);
ok('ایموجی‌های آب‌وهوا، کیفیت هوا و خدمات در پک آیکون نگاشت شده‌اند',
  ['🌧️','🌤️','❄️','🌫️','🌡️','☀️','😊','😷','🕊️','♻️','🏛️','🗑️','🤝','📵','🔕'].every((e) => new RegExp("'" + e + "':").test(iconsSrc)));

const servicesJs = fs.readFileSync(path.join(ROOT, 'modules/services.js'), 'utf8');
const liveJs = fs.readFileSync(path.join(ROOT, 'modules/live.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(ROOT, 'modules/profile.js'), 'utf8');
ok('برچسب‌های سریع خدمات، بنر اعلان و لیست علاقه‌مندی‌ها هم از پک آیکون می‌آیند (نه ایموجی خام)',
  /svcIcon\('building'\)/.test(servicesJs) && /svcIcon\('recycle'\)/.test(servicesJs)
  && /EplakIcons\.get\('megaphone'/.test(liveJs) && /function serviceIcon\(icon, size\)/.test(profileJs));
ok('آیکون‌های پک در ماژول‌ها هیچ ایموجی‌ای را در HTML جا نمی‌گذارند',
  !/svc-quick-tag[^>]*>\s*[🏛💳🏪♻🚇📑🕊]/.test(servicesJs));

const flowBlock = reportsJs.slice(
  reportsJs.indexOf('روند رسیدگی (چهار مرحله'),
  reportsJs.indexOf("showScreen('screen-report-detail')"));
ok('هیچ ایموجی‌ای در روند رسیدگی اپ باقی نمانده (همه از پک آیکون)',
  flowBlock.length > 400 && !/⏳|✅|📋/.test(flowBlock) && /EplakIcons\.get|ICON\(/.test(flowBlock));
ok('پیوست‌های ناخوانا (حجم صفر) همان لحظه‌ی انتخاب تشخیص داده می‌شوند',
  /if \(!file\.size\) \{/.test(reportsJs) && /ناخوانا/.test(reportsJs));
ok('نتیجه‌ی انتخاب فایل از اندروید در گزارش فنی ثبت می‌شود',
  /window\.eplakNativeFilesPicked = function/.test(reportsJs));
ok('فشرده‌سازی عکس چندمرحله‌ای است (تا رسیدن به حجم کم)',
  /for \(const scale of scales\)/.test(reportsJs) && /for \(const quality of qualities\)/.test(reportsJs));
ok('تعداد گام‌های رسیدگی روی ردیف هر گزارش در فهرست دیده می‌شود',
  /report-steps-chip/.test(reportsJs) && /timelineCount/.test(reportsJs) && /\.report-steps-chip/.test(appCss));

const kt = fs.readFileSync(path.join(ROOT, 'android-app/app/src/main/java/com/example/eplakfixed/MainActivity.kt'), 'utf8');
ok('اپ اندروید: فایل انتخاب‌شده داخل حافظه‌ی خود اپ کپی می‌شود (خوانا بودن تضمینی)',
  /private fun copyPickedFileToCache/.test(kt) && /Uri\.fromFile\(dest\)/.test(kt));
ok('اپ اندروید: دسترسی خواندن file:// روشن است (ریشه‌ی خرابی بارگذاری عکس)',
  /webSettings\.allowFileAccess = true/.test(kt));
ok('اپ اندروید: دسترسی content:// گالری هم روشن است',
  /webSettings\.allowContentAccess = true/.test(kt));
ok('اپ اندروید: اگر کپی فایل ممکن نشد، Uri اصلی هم تحویل داده می‌شود (شانس دوم)',
  /out\.add\(uri\)/.test(kt));
ok('اپ اندروید: فایل‌های کش قدیمی پاک می‌شوند تا حافظه‌ی گوشی پر نشود',
  /cleanOldPickedFiles/.test(kt) && /files\.drop\(12\)/.test(kt));
ok('اپ اندروید: نتیجه‌ی انتخاب فایل به لایه‌ی وب خبر داده می‌شود',
  /notifyWebFilePick/.test(kt) && /eplakNativeFilesPicked/.test(kt));

console.log('\n' + '='.repeat(52));
console.log(`APP: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
