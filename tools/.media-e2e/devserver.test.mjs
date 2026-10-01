#!/usr/bin/env node
/*
 * devserver.test.mjs — تست دود برای tools/dev-server.mjs
 * سرور را خودش بالا می‌آورد (روی پورت تصادفی)، همان سناریوهای harness.mjs را
 * روی مسیر HTTP واقعی (multipart واقعی) اجرا می‌کند و در پایان خاموش می‌شود.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = process.env.EPLAK_ROOT || '/home/user/eplak-fixed';
const PORT = 8123 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const PHONE = '09123456789';
let pass = 0;
const fails = [];

function check(name, ok, extra = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fails.push(name + (extra ? ' — ' + extra : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

/* تولید فایل‌های واقعی با امضای بایتی */
function pngBytes(w = 3, h = 3) {
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x33)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function mp4Bytes() {
  const head = Buffer.alloc(24);
  head.writeUInt32BE(24, 0);
  head.write('ftypisom', 4, 'latin1');
  head.write('isommp42', 12, 'latin1');
  const mdat = Buffer.alloc(8);
  mdat.writeUInt32BE(8, 0);
  mdat.write('mdat', 4, 'latin1');
  return Buffer.concat([head, mdat]);
}

function multipart(fields, files) {
  const boundary = '----eplak' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
  }
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`, 'utf8'));
    parts.push(f.data);
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, json, res };
}

const child = spawn(process.execPath, [path.join(ROOT, 'tools/dev-server.mjs')], {
  env: { ...process.env, PORT: String(PORT), HOST: '0.0.0.0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d.toString(); });
child.stderr.on('data', (d) => { serverLog += d.toString(); });
process.on('exit', () => { try { child.kill('SIGKILL'); } catch (e) { /* */ } });

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/media.php?action=config`);
      if (r.ok) return true;
    } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

const createdFiles = [];
try {
  console.log('▶ dev-server smoke test');
  check('serverStarted', await waitForServer(), BASE);
  if (!(await waitForServer())) throw new Error('سرور بالا نیامد:\n' + serverLog);

  const cfg = await getJson(`${BASE}/api/media.php?action=config`);
  check('configLimits', cfg.status === 200 && cfg.json?.limits?.max_count === 6 && cfg.json.limits.max_video_bytes === 96 * 1024 * 1024,
    `max_count=${cfg.json?.limits?.max_count} max_video=${cfg.json?.limits?.max_video_bytes}`);

  const badPhone = await getJson(`${BASE}/api/media.php`, {
    method: 'POST',
    headers: { 'Content-Type': multipart({ phone: '' }, []).contentType },
    body: multipart({ phone: '' }, []).body,
  });
  check('emptyPhoneRejected', badPhone.status === 400 && badPhone.json?.success === false, badPhone.json?.error || '');

  const reportRes = await getJson(`${BASE}/api/reports.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, title: 'تست سرور محلی', description: 'شرح تست', category: 'فنی', location: 'ورامین' }),
  });
  const reportId = reportRes.json?.id;
  check('reportCreated', reportRes.status === 200 && Boolean(reportId), `id=${reportId}`);

  const png = pngBytes();
  const up = multipart({ phone: PHONE, report_id: reportId, source: 'camera', duration_ms: 4200 }, [
    { field: 'file', name: 'IMG_0001.PNG', type: 'image/jpeg', data: png },
  ]);
  const uploadRes = await getJson(`${BASE}/api/media.php`, { method: 'POST', headers: { 'Content-Type': up.contentType }, body: up.body });
  const item = uploadRes.json?.items?.[0];
  check('imageUploadOk', uploadRes.status === 200 && uploadRes.json?.success === true && item?.kind === 'image' && item?.mime === 'image/png',
    `name=${item?.name} kind=${item?.kind} mime=${item?.mime}`);
  check('fileNamePreserved', item?.name === 'IMG_0001.PNG', `name=${item?.name}`);
  check('reportIdAttached', String(item?.report_id) === String(reportId), `report_id=${item?.report_id}`);
  if (item?.path) createdFiles.push(path.join(ROOT, item.path));

  const fetchBack = await fetch(`${BASE}${item.path.startsWith('/') ? '' : '/'}${item.path.replace(/^https?:\/\/[^/]+/, '')}`);
  const bytes = Buffer.from(await fetchBack.arrayBuffer());
  check('servedBackIdentical', fetchBack.status === 200 && bytes.equals(png) && fetchBack.headers.get('content-type') === 'image/png',
    `status=${fetchBack.status} bytes=${bytes.length}/${png.length}`);

  const rangeRes = await fetch(`${BASE}${item.path.replace(/^https?:\/\/[^/]+/, '')}`, { headers: { Range: 'bytes=0-3' } });
  check('rangeSupported', rangeRes.status === 206 && rangeRes.headers.get('content-range')?.startsWith('bytes 0-3/'), `status=${rangeRes.status}`);

  const vidForm = multipart({ phone: PHONE, report_id: reportId, duration_ms: 4200, source: 'gallery' }, [
    { field: 'file', name: 'VID_0002.mp4', type: 'video/mp4', data: mp4Bytes() },
  ]);
  const vid = await getJson(`${BASE}/api/media.php`, { method: 'POST', headers: { 'Content-Type': vidForm.contentType }, body: vidForm.body });
  check('videoUploadOk', vid.status === 200 && vid.json?.items?.[0]?.kind === 'video' && vid.json.items[0].duration_ms === 4200,
    `kind=${vid.json?.items?.[0]?.kind} duration=${vid.json?.items?.[0]?.duration_ms}`);
  if (vid.json?.items?.[0]?.path) createdFiles.push(path.join(ROOT, vid.json.items[0].path));

  const evil = multipart({ phone: PHONE, report_id: reportId }, [{ field: 'file', name: 'evil.jpg', type: 'image/jpeg', data: Buffer.from('this is not an image at all') }]);
  const evilRes = await getJson(`${BASE}/api/media.php`, { method: 'POST', headers: { 'Content-Type': evil.contentType }, body: evil.body });
  check('fakeImageRejected', evilRes.status === 400 && /قابل تشخیص نیست/.test(evilRes.json?.error || ''), evilRes.json?.error || '');

  const list = await getJson(`${BASE}/api/media.php?action=list&phone=${PHONE}&report_id=${reportId}`);
  check('listByReport', list.status === 200 && list.json?.count === 2, `count=${list.json?.count}`);

  const reports = await getJson(`${BASE}/api/reports.php?phone=${PHONE}`);
  const withMedia = reports.json?.reports?.find((r) => r.id === reportId);
  check('reportCarriesMedia', Array.isArray(withMedia?.media) && withMedia.media.length === 2,
    withMedia?.media?.map((m) => `${m.id}:${m.kind}`).join(','));

  const wrong = await getJson(`${BASE}/api/media.php?action=list&phone=09120000000`);
  check('ownerIsolation', wrong.status === 200 && wrong.json?.count === 0, `count=${wrong.json?.count}`);

  const del = await fetch(`${BASE}/api/media.php?action=delete&id=${item.id}&phone=${PHONE}`, { method: 'DELETE' });
  const delJson = await del.json().catch(() => null);
  check('deleteWorked', del.status === 200 && delJson?.success === true, `deleted_id=${delJson?.deleted_id}`);
  const after = await getJson(`${BASE}/api/media.php?action=list&phone=${PHONE}`);
  check('deleteRemovedFromList', after.json?.count === 1, `count=${after.json?.count}`);

  const userRes = await getJson(`${BASE}/api/users.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, name: 'کاربر تست', avatar: item?.url }),
  });
  check('userUpsertKeepsAvatar', userRes.status === 200 && /uploads\/media\//.test(userRes.json?.user?.avatar || ''), userRes.json?.user?.avatar || '');

  const page = await fetch(`${BASE}/index.html`);
  const html = await page.text();
  check('indexServed', page.status === 200 && html.includes('reportPhotoInput') && html.includes('core/media.js'), `bytes=${html.length}`);

  console.log(`\n${fails.length ? '❌ FAILED' : '✅ ALL DEV-SERVER CHECKS PASSED'} — ${pass} passed, ${fails.length} failed`);
  if (fails.length) console.log(fails.map((f) => ' - ' + f).join('\n'));
  process.exitCode = fails.length ? 1 : 0;
} catch (error) {
  console.error('❌ dev-server test crashed:', error);
  console.error(serverLog.slice(-3000));
  process.exitCode = 1;
} finally {
  for (const f of createdFiles) { try { fs.unlinkSync(f); } catch (e) { /* بی‌اهمیت */ } }
  try { child.kill('SIGKILL'); } catch (e) { /* بی‌اهمیت */ }
}
