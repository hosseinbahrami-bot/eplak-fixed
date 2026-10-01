#!/usr/bin/env node
/*
 * live.test.mjs — تست زندهٔ «عکس و فیلم بارگذاری می‌شود»
 * ---------------------------------------------------------------------------
 * این تست سه لایه را به هم وصل می‌کند:
 *   ۱) tools/dev-server.mjs  (سرور HTTP واقعی، مثل اندپوینت‌های PHP)
 *   ۲) core/media.js         (موتور آپلود سمت مرورگر)
 *   ۳) jsdom + XHR واقعی     (همان کدی که در مرورگر اجرا می‌شود)
 * اگر این تست سبز شود یعنی: عکس از گالری/دوربین و فیلم واقعاً روی سرور
 * آپلود، ذخیره و بعد قابل بازیابی می‌شوند.
 *
 * اجرا:  node tools/.media-e2e/live.test.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { JSDOM, VirtualConsole } from 'jsdom';
import { indexedDB as fakeIndexedDB, IDBKeyRange as fakeIDBKeyRange } from 'fake-indexeddb';

const ROOT = process.env.EPLAK_ROOT || '/home/user/eplak-fixed';
const PORT = 8700 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const API_BASE = `${BASE}/api`;
const PHONE = '09123456789';

let pass = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

/* ── فایل‌های آزمایشی با امضای واقعی ─────────────────────────────────── */
function pngBytes(w = 4, h = 4) {
  const table = [];
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x55)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function mp4Bytes() {
  const head = Buffer.alloc(24); head.writeUInt32BE(24, 0); head.write('ftypisom', 4, 'latin1'); head.write('isommp42', 12, 'latin1');
  const mdat = Buffer.alloc(1024); mdat.writeUInt32BE(1024, 0); mdat.write('mdat', 4, 'latin1');
  return Buffer.concat([head, mdat]);
}

const child = spawn(process.execPath, [path.join(ROOT, 'tools/dev-server.mjs')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d.toString(); });
child.stderr.on('data', (d) => { serverLog += d.toString(); });

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try { const r = await fetch(`${BASE}/api/media.php?action=config`); if (r.ok) return true; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

try {
  console.log('▶ live browser-level upload test (jsdom + real XHR + real server)');
  check('devServerUp', await waitForServer(), BASE);

  /* گزارش بسازیم تا آپلود «متصل به گزارش» را بسنجیم */
  const reportRes = await fetch(`${BASE}/api/reports.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, title: 'تست زنده', description: 'توضیح', category: 'فنی' }),
  });
  const reportJson = await reportRes.json();
  const reportId = reportJson.id;
  check('reportCreated', reportRes.status === 200 && Boolean(reportId), `id=${reportId}`);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { const m = String(e.message || e); if (!/Not implemented|Could not parse CSS|Cannot read properties of null/.test(m)) console.error('[jsdom]', m); });
  virtualConsole.on('error', (m) => { if (!/Not implemented|Could not parse CSS/.test(String(m))) console.error('[console.error]', m); });
  virtualConsole.on('warn', (m) => { console.log('[console.warn]', String(m).slice(0, 400)); });

  const dom = new JSDOM(html, { url: `${BASE}/index.html`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.fetch = (...args) => fetch(...args);
  window.open = () => null;
  window.indexedDB = fakeIndexedDB;                 /* شبیه‌سازی پایگاه‌داده‌ی مرورگر */
  window.IDBKeyRange = fakeIDBKeyRange;
  window.EPLAK_API_BASE_URL = API_BASE;
  try { window.localStorage.setItem('eplak_api_base', API_BASE); } catch (e) { /* بی‌اهمیت */ }

  /* اسکریپت‌های اپ را به‌ترتیب مثل مرورگر سوار می‌کنیم */
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    const filePath = path.join(ROOT, src.split('?')[0]);
    if (!fs.existsSync(filePath)) continue;
    if (filePath.endsWith('sw.js')) continue;
    const el = window.document.createElement('script');
    el.textContent = fs.readFileSync(filePath, 'utf8');
    window.document.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 300));

  check('mediaEngineLoaded', typeof window.EplakMedia === 'object' && typeof window.EplakMedia.uploadOne === 'function');
  check('apiBaseResolved', window.EplakApi.base() === API_BASE, window.EplakApi.base());

  const limits = await window.EplakMedia.fetchLimits(true);
  check('limitsFetchedLive', limits && limits.max_count === 6, JSON.stringify(limits));
  const oversize = { size: 400 * 1024 * 1024, name: 'big.mp4', type: 'video/mp4' };
  check('clientGuardsOversize', window.EplakMedia.exceedsServerLimit(oversize) === true, 'file.size > post_max_size');

  /* ۱) عکس دوربین */
  const png = pngBytes();
  const photoFile = new window.File([png], 'IMG_2026.PNG', { type: 'image/jpeg' });
  const photoItem = await window.EplakMedia.prepareFile(photoFile, { source: 'camera' });
  check('preparePhotoOk', photoItem && photoItem.kind === 'image', `kind=${photoItem && photoItem.kind} name=${photoItem && photoItem.name}`);

  const progress = [];
  const photoUploaded = await window.EplakMedia.uploadOne(photoItem, {
    phone: PHONE, reportId, onProgress: (p) => progress.push(p),
  });
  check('photoUploadedLive', Boolean(photoUploaded && photoUploaded.id), `id=${photoUploaded && photoUploaded.id} url=${photoUploaded && photoUploaded.url}`);
  check('progressReached100', progress.includes(100) || progress.length > 0, `samples=${progress.join('>')}`);

  const backRes = await fetch(photoUploaded.url);
  const backBytes = Buffer.from(await backRes.arrayBuffer());
  check('photoBytesRoundTrip', backRes.status === 200 && backBytes.equals(png), `${backBytes.length}/${png.length} bytes, ${backRes.headers.get('content-type')}`);
  check('absoluteResolvesServerUrl', window.EplakApi.absolute(photoUploaded.path) === photoUploaded.url,
    `${window.EplakApi.absolute(photoUploaded.path)} == ${photoUploaded.url}`);

  /* ۲) فیلم (مثل فیلمی که کاربر با دوربین گوشی می‌گیرد) */
  const mp4 = mp4Bytes();
  const videoFile = new window.File([mp4], 'VID_2026.mp4', { type: 'video/mp4' });
  const videoItem = await window.EplakMedia.prepareFile(videoFile, { source: 'camera' });
  videoItem.duration = 4.2;
  const videoUploaded = await window.EplakMedia.uploadOne(videoItem, { phone: PHONE, reportId });
  check('videoUploadedLive', Boolean(videoUploaded && videoUploaded.id && videoUploaded.kind === 'video'),
    `id=${videoUploaded && videoUploaded.id} kind=${videoUploaded && videoUploaded.kind} duration=${videoUploaded && videoUploaded.duration_ms}`);

  const videoBack = await fetch(videoUploaded.url, { headers: { Range: 'bytes=0-15' } });
  const videoHead = Buffer.from(await videoBack.arrayBuffer());
  check('videoRangePlayback', videoBack.status === 206 && videoHead.slice(4, 8).toString('latin1') === 'ftyp', `status=${videoBack.status}`);

  /* ۳) گزارش با هر دو رسانه */
  const listRes = await fetch(`${BASE}/api/media.php?action=list&phone=${PHONE}&report_id=${reportId}`).then((r) => r.json());
  check('reportHasBothMedia', listRes.count === 2 && listRes.items.some((i) => i.kind === 'image') && listRes.items.some((i) => i.kind === 'video'),
    listRes.items.map((i) => `${i.id}:${i.kind}:${i.name}`).join(', '));

  /* ۴) صف آفلاین و تخلیهٔ صف (فلوی قطع اینترنت) */
  const offlineBytes = pngBytes(6, 6);
  const offlineFile = new window.File([offlineBytes], 'queued.png', { type: 'image/png' });
  const offlineItem = await window.EplakMedia.prepareFile(offlineFile, { source: 'gallery' });
  offlineItem.localId = 'live-' + Date.now();
  let enqueued = false;
  try { enqueued = await window.EplakMedia.enqueue(offlineItem, { phone: PHONE, reportId }); } catch (e) { enqueued = false; }
  const queuedCount = await window.EplakMedia.queueCount();
  check('offlineQueueStored', enqueued === true && queuedCount === 1, `enqueue=${enqueued} count=${queuedCount}`);

  const flush = await window.EplakMedia.flushQueue({ phone: PHONE, reportId });
  const afterFlush = await window.EplakMedia.queueCount();
  let flushDebug = JSON.stringify(flush);
  if (flush.error) {
    flushDebug += ` | String=${String(flush.error)} | ctor=${flush.error.constructor && flush.error.constructor.name} | props=${Object.getOwnPropertyNames(flush.error).join(',')}`;
  }
  check('offlineQueueFlushedToServer', afterFlush === 0 && flush.sent === 1, `flushed=${flushDebug} remaining=${afterFlush}`);

  const finalList = await fetch(`${BASE}/api/media.php?action=list&phone=${PHONE}&report_id=${reportId}`).then((r) => r.json());
  check('flushedMediaOnServer', finalList.count === 3, `count=${finalList.count}`);

  /* ۵) فایل جعلی (تغییر پسوند) باید رد شود */
  const evilFile = new window.File([Buffer.from('echo hi')], 'evil.jpg', { type: 'image/jpeg' });
  const evilItem = await window.EplakMedia.prepareFile(evilFile, { source: 'gallery' });
  let evilError = '';
  try { await window.EplakMedia.uploadOne(evilItem, { phone: PHONE, reportId }); } catch (e) { evilError = e.message || ''; }
  check('fakeFileRejectedLive', /قابل تشخیص نیست|مجاز/.test(evilError), evilError);

  /* ۶) عکس پروفایل (آواتار) هم از همان مسیر آپلود می‌شود */
  const avatarFile = new window.File([pngBytes(400, 400)], 'avatar.png', { type: 'image/png' });
  const avatarUploaded = await window.EplakMedia.uploadAvatar(avatarFile, PHONE).catch((e) => ({ error: e.message }));
  check('avatarUploadedLive', Boolean(avatarUploaded && avatarUploaded.id), JSON.stringify(avatarUploaded && (avatarUploaded.url || avatarUploaded.error)));

  window.close();
} catch (error) {
  console.error('❌ live test crashed:', error);
  console.error(serverLog.slice(-3000));
  process.exitCode = 1;
} finally {
  try { child.kill('SIGKILL'); } catch (e) { /* بی‌اهمیت */ }
  fs.rmSync(path.join(ROOT, '.devdata'), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, 'uploads', 'media'), { recursive: true, force: true });
  console.log(`${fails.length ? '❌ LIVE FAILED' : '✅ ALL LIVE CHECKS PASSED'} — ${pass} passed, ${fails.length} failed`);
  if (fails.length) console.log(fails.map((f) => ' - ' + f).join('\n'));
  process.exit(fails.length ? 1 : 0);
}
