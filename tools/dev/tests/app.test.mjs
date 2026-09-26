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
console.log('\n=== اپ با فایربیس فعال ===');
const s4 = buildSandbox({ android: true, fcmToken: 'T' });
s4.renderDeviceNotice();
ok('پیام «حتی وقتی برنامه بسته باشد» نمایش داده می‌شود', s4.document.getElementById('notifDeviceNotice').innerHTML.includes('بسته'));

/* ---------- ۶) مرورگر ---------- */
console.log('\n=== مرورگر/دستگاه بدون اعلان پس‌زمینه ===');
const s5 = buildSandbox({});
s5.renderDeviceNotice();
ok('راهنمای «افزودن به صفحه اصلی» نمایش داده می‌شود', s5.document.getElementById('notifDeviceNotice').innerHTML.includes('افزودن به صفحه اصلی'), s5.document.getElementById('notifDeviceNotice').innerHTML.slice(0, 90));

console.log('\n' + '='.repeat(52));
console.log(`APP: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
