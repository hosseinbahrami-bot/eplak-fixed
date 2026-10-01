/* آزمون فرانت‌اند: بررسی «همه‌ی دکمه‌های inline با تابع واقعی وصل هستند»
   و بررسی مسیر آپلود (فرم‌دیتای ارسالی به api/media.php) در یک DOM واقعی (jsdom).

   اجرا:  node tools/.media-e2e/frontend.test.mjs
*/
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const ROOT = process.env.EPLAK_ROOT || '/home/user/eplak-fixed';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const { VirtualConsole } = await import('jsdom');

/* اسکریپت‌ها را خودمان به ترتیب تزریق می‌کنیم (اسکریپت‌های بیرونی مثل نقشه
   گوگل لازم نیستند و شبکه هم در دسترس نیست). تزریق هر فایل به‌صورت یک
   <script> جداگانه باعث می‌شود متغیرهای let/const بین فایل‌ها مثل مرورگر
   به اشتراک گذاشته شوند. */
const scriptBlocks = [];
const stripRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = stripRe.exec(html)) !== null) {
  const srcMatch = /src\s*=\s*["']([^"']+)["']/i.exec(m[1] || '');
  if (srcMatch && /^https?:\/\//i.test(srcMatch[1])) continue;
  if (srcMatch) {
    const file = path.join(ROOT, srcMatch[1].replace(/^\.\//, '').split('?')[0]);
    if (fs.existsSync(file)) scriptBlocks.push({ label: srcMatch[1], code: fs.readFileSync(file, 'utf8') });
  } else if ((m[2] || '').trim()) {
    scriptBlocks.push({ label: 'inline', code: m[2] });
  }
}
const htmlNoScripts = html.replace(stripRe, '<!--script-->');

const virtualConsole = new VirtualConsole();
const consoleErrors = [];
virtualConsole.on('jsdomError', (error) => {
  const msg = String(error && error.message ? error.message : error);
  if (/Not implemented|Could not parse CSS/i.test(msg)) return;
  consoleErrors.push(msg);
});

const dom = new JSDOM(htmlNoScripts, {
  url: 'https://example.com/eplak-fixed/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

window.fetch = () => Promise.reject(new Error('offline-in-test'));
window.open = () => null;

for (const block of scriptBlocks) {
  const el = window.document.createElement('script');
  el.textContent = block.code;
  try {
    window.document.body.appendChild(el);
  } catch (error) {
    consoleErrors.push(`${block.label}: ${error.message}`);
  }
}
await new Promise((resolve) => setTimeout(resolve, 200));

const results = {};
const scriptErrors = consoleErrors;
console.log('script errors:', scriptErrors.length ? scriptErrors : 'none');
results.scriptsLoaded = scriptErrors.length === 0;

// ── ۲) هر on*="fn(" در سند باید به یک تابع موجود اشاره کند ────────────────
const missing = new Map();
window.document.querySelectorAll('*').forEach((el) => {
  for (const attr of Array.from(el.attributes || [])) {
    if (!/^on/i.test(attr.name)) continue;
    const body = attr.value || '';
    const calls = body.match(/([A-Za-z_$][\w$]*)\s*\(/g) || [];
    for (const call of calls) {
      const name = call.replace(/\s*\($/, '');
      // متدهای داخلی مرورگر را نادیده بگیر
      const builtins = ['stopPropagation', 'preventDefault', 'replace', 'slice', 'toggle', 'push', 'filter', 'map', 'toString', 'indexOf', 'if', 'for', 'while', 'return', 'typeof', 'new', 'function', 'catch', 'switch', 'setTimeout', 'focus', 'click', 'close', 'open', 'alert', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Promise'];
      if (builtins.includes(name)) continue;
      const target = window[name];
      if (typeof target !== 'function') {
        missing.set(name, (missing.get(name) || 0) + 1);
      }
    }
  }
});
const missingList = Array.from(missing.entries()).map(([name, count]) => `${name} (${count})`);
console.log('handlers not resolvable:', missingList.length ? missingList : 'none');
results.allHandlersResolvable = missingList.length === 0;

// ── ۳) خروجی‌های اپ برای جریان گزارش/رسانه ──────────────────────────────
const required = [
  'addReportPhotos', 'addReportMediaFiles', 'removeReportPhoto', 'clearReportMedia',
  'captureReportMedia', 'openReportCamera', 'openReportGallery', 'renderReportPhotosPreview',
  'updateMediaCounter', 'uploadMediaItems', 'attachMediaToReport', 'queueMediaForLater',
  'goReportStep2', 'goReportStep3', 'goReportStep4', 'selectDepartment', 'toggleDept',
  'updateCount', 'startNewReport', 'useCurrentLocation', 'triggerAvatarUpload', 'removeAvatarPhoto',
];
const missingExports = required.filter((name) => typeof window[name] !== 'function');
console.log('missing exports:', missingExports.length ? missingExports : 'none');
results.requiredExportsPresent = missingExports.length === 0;
results.mediaEngineLoaded = typeof window.EplakMedia === 'object' && typeof window.EplakMedia.prepareFile === 'function';
results.apiResolverLoaded = typeof window.EplakApi === 'object' && typeof window.EplakApi.absolute === 'function';

// ── ۴) آدرس سرور و تبدیل آدرس فایل ───────────────────────────────────────
window.EplakApi.setBase('https://eplak.ir/eplak-fixed/api');
results.apiBase = window.EplakApi.base();
results.absoluteKeepHttp = window.EplakApi.absolute('https://cdn.example.com/a.png') === 'https://cdn.example.com/a.png';
results.absoluteRootRelative = window.EplakApi.absolute('/eplak-fixed/uploads/media/a.png') === 'https://eplak.ir/eplak-fixed/uploads/media/a.png';
results.absoluteRelative = window.EplakApi.absolute('media/12.png') === 'https://eplak.ir/eplak-fixed/api/media/12.png';

// ── ۵) فرم‌دیتای آپلود: فیلدهای درست به api/media.php ───────────────────
let captured = null;
class FakeXHR {
  constructor() { this.upload = {}; this.status = 0; this.responseText = ''; FakeXHR.last = this; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader() {}
  getResponseHeader() { return ''; }
  send(body) {
    captured = { method: this.method, url: this.url, body };
    this.status = 200;
    this.responseText = JSON.stringify({ success: true, count: 1, items: [{ id: 7, kind: 'image', mime: 'image/jpeg', name: 'photo.jpg', size: 1234, url: 'https://eplak.ir/eplak-fixed/uploads/media/2026/10/x.jpg', path: '/eplak-fixed/uploads/media/2026/10/x.jpg', token: 'abc' }] });
    if (typeof this.onload === 'function') this.onload();
  }
}
window.XMLHttpRequest = FakeXHR;

const file = new window.File([new Uint8Array([1, 2, 3, 4])], 'photo.jpg', { type: 'image/jpeg' });
const item = { id: 'm1', kind: 'image', file, name: 'photo.jpg', size: 4, source: 'camera' };
const progress = [];
const uploadResult = await window.EplakMedia.uploadOne(item, {
  phone: '09123456789',
  reportId: 12,
  source: 'camera',
  onProgress: (percent) => progress.push(percent),
});
results.uploadUrlOk = captured && /\/media\.php$/.test(captured.url);
results.uploadMethodOk = captured && captured.method === 'POST';
const form = captured && captured.body;
const fields = {};
if (form && typeof form.forEach === 'function') {
  form.forEach((value, key) => { fields[key] = value; });
}
results.uploadFieldsOk = fields.phone === '09123456789' && fields.source === 'camera' && fields.report_id === '12' && !!fields.file;
results.uploadReturnedId = uploadResult && uploadResult.id === 7 && uploadResult.kind === 'image';
results.progressReported = progress.includes(100);

// ── ۶) خطای سرور (فایل ردشده) باید پیام فارسی بدهد ─────────────────────
window.XMLHttpRequest = class extends FakeXHR {
  send() {
    this.status = 400;
    this.responseText = JSON.stringify({ success: false, error: 'حجم عکس بیش از حد مجاز است.' });
    if (typeof this.onload === 'function') this.onload();
  }
};
let errorMessage = '';
try {
  await window.EplakMedia.uploadOne({ id: 'm2', kind: 'image', file, name: 'big.jpg', size: 4, source: 'gallery' }, { phone: '09123456789' });
} catch (error) {
  errorMessage = error.message;
}
results.serverErrorSurfaced = /حجم عکس/.test(errorMessage);
window.XMLHttpRequest = FakeXHR;

// ── ۷) پیش‌نمایش و حذف رسانه در فرم گزارش ───────────────────────────────
const draft = window.eval('reportDraft');   // let در اسکریپت کلاسیک = متغیر سراسری واژگانی
draft.media = [
  { id: 'a', kind: 'image', name: 'a.jpg', size: 1200, thumb: 'data:image/png;base64,iVBORw0KGgo=', status: 'ready', progress: 0 },
  { id: 'b', kind: 'video', name: 'b.mp4', size: 900000, thumb: '', previewUrl: '', duration: 12, status: 'ready', progress: 0 },
];
window.renderReportPhotosPreview();
const preview = window.document.getElementById('reportPhotosPreview');
results.previewRendered = preview.querySelectorAll('.photo-thumb').length === 2;
results.counterRendered = /۲/.test(window.document.getElementById('reportMediaCounter').textContent);

window.removeReportPhoto(0);
results.removeByIdxWorks = draft.media.length === 1 && draft.media[0].id === 'b';
results.previewAfterRemove = window.document.getElementById('reportPhotosPreview').querySelectorAll('.photo-thumb').length === 1;

// ── ۸) گالری جزئیات گزارش ───────────────────────────────────────────────
window.open = () => null;
window.renderDetailMedia({
  media: [
    { kind: 'image', name: 'عکس ۱', url: '/eplak-fixed/uploads/media/2026/10/a.jpg' },
    { kind: 'video', name: 'فیلم ۱', url: '/eplak-fixed/uploads/media/2026/10/b.mp4' },
  ],
});
const detailWrap = window.document.getElementById('detailMediaWrap');
results.detailGalleryRendered = detailWrap.style.display === 'block'
  && detailWrap.querySelectorAll('img').length === 1
  && detailWrap.querySelectorAll('video').length === 1;

// ── ۹) صف آفلاین در نبود IndexedDB نباید خطا بدهد ────────────────────────
let queueOk = true;
try {
  delete window.indexedDB;
  await window.EplakMedia.enqueue({ id: 'q1', kind: 'image', file, name: 'q.jpg' }, { phone: '09123456789' });
} catch (error) {
  queueOk = false;
}
results.queueDegradesGracefully = queueOk;

// ── گزارش ───────────────────────────────────────────────────────────────
console.log('\n--- SUMMARY ---\n' + JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => v === false);
if (failed.length) {
  console.log('\nFAILED CHECKS: ' + failed.map(([k]) => k).join(', '));
  process.exitCode = 1;
} else {
  console.log('\nALL FRONTEND CHECKS PASSED ✅');
}
try { window.close(); } catch (e) { /* بی‌اهمیت */ }
setTimeout(() => process.exit(process.exitCode || 0), 50).unref?.();
