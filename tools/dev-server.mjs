#!/usr/bin/env node
/* tools/dev-server.mjs — سرور توسعه‌ی ای‌پلاک (فقط برای تست محلی/پیش‌نمایش)
   ============================================================================
   این ابزار «جایگزین سبک PHP» برای تست خودِ اپ است (وقتی PHP/MySQL روی سیستم
   نیست). رفتار اندپوینت‌های واقعی PHP را برای مسیرهای زیر شبیه‌سازی می‌کند:

     GET    /api/media.php?action=config                → محدودیت‌ها
     POST   /api/media.php            (multipart)       → آپلود عکس/فیلم
     POST   /api/media.php?action=attach                → اتصال به گزارش
     GET    /api/media.php?action=list&phone=…          → فهرست رسانه‌ها
     GET    /api/media.php?action=file&t=TOKEN          → تحویل فایل (با Range)
     DELETE /api/media.php?action=delete&id=…&phone=…   → حذف
     GET/POST /api/reports.php                          → گزارش‌ها
     GET/POST /api/users.php                            → کاربران
     GET    /api/departments.php                        → واحدها

   داده‌ها در `.devdata/db.json` و فایل‌ها در `uploads/media/YYYY/MM/` ذخیره
   می‌شوند؛ یعنی همان ساختاری که نسخه‌ی PHP تولید می‌کند.

   اجرا:   node tools/dev-server.mjs        (پیش‌فرض روی پورت 8080)
   ⚠️ این فایل «تولیدی» نیست و روی هاست واقعی استفاده نمی‌شود.
*/
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(ROOT, '.devdata');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MEDIA_DIR = path.join(ROOT, 'uploads', 'media');

const LIMITS = {
  max_image_bytes: 12 * 1024 * 1024,
  max_video_bytes: 96 * 1024 * 1024,
  max_count: 6,
  max_video_seconds: 90,
  client_max_dim: 1920,
  client_quality: 0.82,
};

/* ── پایگاه‌داده‌ی فایلی ساده ─────────────────────────────────────────── */
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { reports: [], media: [], users: [], seq: { report: 0, media: 0 } };
  }
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
}
let db = loadDb();

/* ── تشخیص نوع واقعی فایل با امضای بایتی (هم‌رفتار با shared/media.php) ── */
const MIME_TABLE = {
  'image/jpeg': ['image', 'jpg'],
  'image/png': ['image', 'png'],
  'image/webp': ['image', 'webp'],
  'image/gif': ['image', 'gif'],
  'image/heic': ['image', 'heic'],
  'image/avif': ['image', 'avif'],
  'video/mp4': ['video', 'mp4'],
  'video/quicktime': ['video', 'mov'],
  'video/webm': ['video', 'webm'],
  'video/3gpp': ['video', '3gp'],
  'video/mpeg': ['video', 'mpg'],
};
function sniff(buf) {
  if (buf.length < 12) return '';
  const ascii = (from, to) => buf.slice(from, to).toString('latin1');
  if (ascii(0, 3) === '\xFF\xD8\xFF') return 'image/jpeg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === '\x1A\x45\xDF\xA3') return buf.slice(0, 512).toString('latin1').toLowerCase().includes('webm') ? 'video/webm' : '';
  if (ascii(0, 4) === '\x00\x00\x01\xBA' || ascii(0, 4) === '\x00\x00\x01\xB3') return 'video/mpeg';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return 'video/3gpp';
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'm4v ', 'msnv'].includes(brand)) return 'video/mp4';
  }
  return '';
}

/* ── پارس multipart/form-data (بدون وابستگی بیرونی) ──────────────────── */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = '--' + (m[1] || m[2]).trim();
  const fields = {};
  const files = [];
  const parts = buffer.toString('latin1').split(boundary);

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerBlock = part.slice(0, headerEnd);
    const nameMatch = /name="([^"]*)"/i.exec(headerBlock);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const fileMatch = /filename="([^"]*)"/i.exec(headerBlock);
    const start = headerEnd + 4;
    let end = part.length - 2;       // حذف \r\n انتهایی
    if (part.slice(-4) === '\r\n--') end = part.length - 4;
    const raw = Buffer.from(part.slice(start, end === -1 ? part.length : end), 'latin1');

    if (fileMatch) {
      files.push({ field: name.replace(/\[\]$/, ''), filename: fileMatch[1], data: raw });
    } else {
      fields[name] = raw.toString('utf8');
    }
  }
  return { fields, files };
}

/* ── کمکی‌های پاسخ ───────────────────────────────────────────────────── */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(body);
}
function baseUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  return (/^\d+\.\d+\.\d+\.\d+/.test(host) ? 'http://' : 'http://') + host;
}
function normalizePhone(raw) {
  let v = String(raw || '').trim().replace(/[\s\-()]/g, '');
  v = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  if (/^\+?98(9\d{9})$/.test(v)) v = '0' + v.replace(/^\+?98/, '');
  else if (/^9\d{9}$/.test(v)) v = '0' + v;
  return /^09\d{9}$/.test(v) ? v : '';
}
function mediaPublic(row, req) {
  const base = baseUrl(req);
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    name: row.original_name,
    size: row.size_bytes,
    width: row.width,
    height: row.height,
    duration_ms: row.duration_ms,
    source: row.source,
    report_id: row.report_id,
    created_at: row.created_at,
    url: `${base}/uploads/media/${row.rel_path}`,
    path: `/uploads/media/${row.rel_path}`,
    token: row.token,
  };
}

function readBody(req, limit = 150 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ── هندلرها ─────────────────────────────────────────────────────────── */
async function handleMedia(req, res, url) {
  const action = url.searchParams.get('action') || '';
  const method = req.method.toUpperCase();

  if (method === 'GET' && action === 'config') {
    return sendJson(res, 200, {
      success: true,
      limits: LIMITS,
      server: { upload_max_filesize: LIMITS.max_video_bytes, post_max_size: 150 * 1024 * 1024, file_uploads: true },
    });
  }

  if (method === 'GET' && action === 'file') {
    const token = url.searchParams.get('t') || '';
    const row = db.media.find((x) => x.token === token);
    if (!row) { res.writeHead(404); return res.end('not found'); }
    const filePath = path.join(MEDIA_DIR, row.rel_path);
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('file missing'); }
    const size = fs.statSync(filePath).size;
    const range = req.headers.range;
    let start = 0;
    let end = size - 1;
    let status = 200;
    const headers = {
      'Content-Type': row.mime,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400',
    };
    if (range) {
      const rm = /bytes=(\d*)-(\d*)/.exec(range);
      if (rm) {
        if (rm[1]) start = Number(rm[1]);
        if (rm[2]) end = Math.min(Number(rm[2]), size - 1);
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return undefined;
  }

  if (method === 'GET' && (action === 'list' || action === '')) {
    const phone = normalizePhone(url.searchParams.get('phone'));
    if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
    const reportId = url.searchParams.get('report_id');
    let rows = db.media.filter((m) => m.user_phone === phone);
    if (reportId) rows = rows.filter((m) => String(m.report_id) === String(reportId));
    return sendJson(res, 200, { success: true, count: rows.length, items: rows.map((r) => mediaPublic(r, req)) });
  }

  if (method === 'POST' && action === 'attach') {
    const body = await readJson(req);
    const phone = normalizePhone(body.phone);
    const reportId = Number(body.report_id || 0);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    if (!phone || !reportId) return sendJson(res, 400, { success: false, error: 'شماره/شناسه گزارش نامعتبر است' });
    const report = db.reports.find((r) => r.id === reportId && r.user_phone === phone);
    if (!report) return sendJson(res, 404, { success: false, error: 'گزارش یافت نشد' });
    let attached = 0;
    for (const row of db.media) {
      if (row.user_phone !== phone) continue;
      const shouldAttach = ids.length ? ids.includes(row.id) : row.report_id === null;
      if (shouldAttach && row.report_id === null) { row.report_id = reportId; attached += 1; }
    }
    saveDb(db);
    return sendJson(res, 200, {
      success: true,
      attached,
      items: db.media.filter((m) => m.report_id === reportId).map((r) => mediaPublic(r, req)),
    });
  }

  if ((method === 'DELETE' || action === 'delete') && (action === 'delete' || method === 'DELETE')) {
    const id = Number(url.searchParams.get('id') || 0);
    const phone = normalizePhone(url.searchParams.get('phone'));
    const row = db.media.find((m) => m.id === id && m.user_phone === phone);
    if (!row) return sendJson(res, 404, { success: false, error: 'رسانه یافت نشد' });
    db.media = db.media.filter((m) => m.id !== id);
    saveDb(db);
    try { fs.unlinkSync(path.join(MEDIA_DIR, row.rel_path)); } catch (e) { /* بی‌اهمیت */ }
    return sendJson(res, 200, { success: true, deleted_id: id });
  }

  if (method !== 'POST') return sendJson(res, 405, { success: false, error: 'Method not allowed' });

  /* آپلود */
  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    return sendJson(res, 413, {
      success: false,
      error: 'حجم درخواست بیش از حد مجاز سرور است. لطفاً فایل کوچک‌تری انتخاب کنید (هر عکس حداکثر ۱۲ و هر فیلم حداکثر ۹۶ مگابایت).',
    });
  }
  const { fields, files } = parseMultipart(raw, req.headers['content-type']);
  const phone = normalizePhone(fields.phone);
  if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
  if (!files.length) return sendJson(res, 400, { success: false, error: 'هیچ فایلی دریافت نشد. لطفاً دوباره تلاش کنید.' });

  let reportId = fields.report_id ? Number(fields.report_id) : null;
  if (reportId) {
    const ok = db.reports.some((r) => r.id === reportId && r.user_phone === phone);
    if (!ok) return sendJson(res, 404, { success: false, error: 'گزارش یافت نشد' });
  }

  const stored = [];
  const errors = [];
  const already = reportId ? db.media.filter((m) => m.report_id === reportId).length : 0;
  let room = Math.max(0, LIMITS.max_count - already);

  for (const file of files) {
    if (room <= 0) { errors.push({ name: file.filename, error: `حداکثر ${LIMITS.max_count} فایل برای هر گزارش مجاز است.` }); continue; }
    const mime = sniff(file.data);
    if (!mime || !MIME_TABLE[mime]) {
      errors.push({ name: file.filename, error: 'نوع فایل قابل تشخیص نیست. فقط عکس (JPG/PNG/WEBP/HEIC) یا فیلم (MP4/MOV/WEBM/3GP) مجاز است.' });
      continue;
    }
    const [kind, ext] = MIME_TABLE[mime];
    const limit = kind === 'image' ? LIMITS.max_image_bytes : LIMITS.max_video_bytes;
    if (file.data.length > limit) {
      errors.push({ name: file.filename, error: `حجم ${kind === 'image' ? 'عکس' : 'فیلم'} بیش از حد مجاز است (حداکثر ${Math.round(limit / 1048576)} مگابایت).` });
      continue;
    }
    if (kind === 'image' && /<\s*script|<\?php|<!doctype\s+html|<svg/i.test(file.data.slice(0, 2048).toString('utf8'))) {
      errors.push({ name: file.filename, error: 'محتوای فایل تصویری نامعتبر است.' });
      continue;
    }

    const sub = new Date().toISOString().slice(0, 7).replace('-', '/');
    const dir = path.join(MEDIA_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    const storedName = crypto.randomBytes(16).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(dir, storedName), file.data);

    const row = {
      id: ++db.seq.media,
      user_phone: phone,
      report_id: reportId,
      kind,
      mime,
      original_name: String(file.filename || 'media').replace(/[\\/]/g, '').slice(0, 180),
      stored_name: storedName,
      rel_path: `${sub}/${storedName}`,
      size_bytes: file.data.length,
      width: null,
      height: null,
      duration_ms: fields.duration_ms ? Number(fields.duration_ms) : null,
      source: ['camera', 'gallery', 'upload', 'avatar'].includes(fields.source) ? fields.source : 'upload',
      token: crypto.randomBytes(16).toString('hex'),
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    db.media.push(row);
    stored.push(mediaPublic(row, req));
    room -= 1;
  }

  saveDb(db);
  if (!stored.length) return sendJson(res, 400, { success: false, error: errors[0] ? errors[0].error : 'بارگذاری ناموفق بود', errors });
  return sendJson(res, 200, { success: true, count: stored.length, items: stored, errors });
}

function readJson(req) {
  return readBody(req, 20 * 1024 * 1024).then((buf) => {
    try { return JSON.parse(buf.toString('utf8') || '{}'); } catch (e) { return {}; }
  });
}

async function handleReports(req, res, url) {
  const method = req.method.toUpperCase();
  if (method === 'GET') {
    const phone = normalizePhone(url.searchParams.get('phone'));
    if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
    const rows = db.reports
      .filter((r) => r.user_phone === phone)
      .sort((a, b) => b.id - a.id)
      .map((r) => ({
        ...r,
        code: `EP-1403-${String(r.id).padStart(4, '0')}`,
        media: db.media.filter((m) => m.report_id === r.id).map((m) => mediaPublic(m, req)),
      }));
    return sendJson(res, 200, { success: true, reports: rows });
  }

  const body = await readJson(req);
  if ((body.action === 'delete') || url.searchParams.get('action') === 'delete' || method === 'DELETE') {
    const id = Number(body.id || url.searchParams.get('id') || 0);
    const phone = normalizePhone(body.phone || url.searchParams.get('phone'));
    const row = db.reports.find((r) => r.id === id && r.user_phone === phone);
    if (!row) return sendJson(res, 404, { success: false, error: 'گزارش یافت نشد', deleted_id: id });
    db.reports = db.reports.filter((r) => r.id !== id);
    const media = db.media.filter((m) => m.report_id === id);
    db.media = db.media.filter((m) => m.report_id !== id);
    saveDb(db);
    media.forEach((m) => { try { fs.unlinkSync(path.join(MEDIA_DIR, m.rel_path)); } catch (e) { /* بی‌اهمیت */ } });
    return sendJson(res, 200, { success: true, deleted_id: id });
  }

  const phone = normalizePhone(body.phone || body.userPhone);
  if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
  const title = String(body.title || body.subject || '').slice(0, 255);
  const description = String(body.description || body.details || '').slice(0, 4000);
  if (!title || !description) return sendJson(res, 400, { success: false, error: 'عنوان و توضیحات گزارش الزامی است' });

  const report = {
    id: ++db.seq.report,
    user_phone: phone,
    title,
    description,
    category: String(body.category || 'سایر').slice(0, 100),
    department: String(body.department || '').slice(0, 255),
    sub_department: String(body.subDepartment || body.sub_department || '').slice(0, 255),
    location: String(body.location || '').slice(0, 500),
    status: 'pending',
    reply: null,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  db.reports.push(report);

  const ids = Array.isArray(body.media_ids) ? body.media_ids.map(Number) : [];
  let toAttach = ids;
  if (!toAttach.length) {
    toAttach = db.media.filter((m) => m.user_phone === phone && m.report_id === null).map((m) => m.id);
  }
  for (const m of db.media) {
    if (m.user_phone === phone && m.report_id === null && toAttach.includes(m.id)) m.report_id = report.id;
  }
  saveDb(db);

  return sendJson(res, 200, {
    success: true,
    id: report.id,
    tracking_code: `EP-1403-${String(report.id).padStart(4, '0')}`,
    media: db.media.filter((m) => m.report_id === report.id).map((m) => mediaPublic(m, req)),
  });
}

async function handleUsers(req, res, url) {
  if (req.method.toUpperCase() === 'GET') {
    const phone = normalizePhone(url.searchParams.get('phone'));
    if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
    const user = db.users.find((u) => u.phone === phone);
    return sendJson(res, 200, user ? { success: true, user } : { success: false, user: null });
  }
  const body = await readJson(req);
  const phone = normalizePhone(body.phone || body.userPhone);
  if (!phone) return sendJson(res, 400, { success: false, error: 'شماره موبایل معتبر الزامی است' });
  let user = db.users.find((u) => u.phone === phone);
  if (!user) {
    user = { id: db.users.length + 1, phone, name: '', address: '', nid: '', avatar: '', created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
    db.users.push(user);
  }
  if (body.name) user.name = String(body.name).slice(0, 255);
  if (typeof body.address === 'string') user.address = body.address.slice(0, 500);
  if (typeof body.nid === 'string') user.nid = body.nid.slice(0, 20);
  if (typeof body.avatar === 'string' && (/^https?:\/\//i.test(body.avatar) || body.avatar === '')) user.avatar = body.avatar.slice(0, 500);
  saveDb(db);
  return sendJson(res, 200, { success: true, user });
}

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.3gp': 'video/3gpp',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' || urlPath === '' ? '/index.html' : urlPath);
  const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  let target = filePath;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — یافت نشد'); }

  const ext = path.extname(target).toLowerCase();
  const size = fs.statSync(target).size;
  const headers = {
    'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
  };
  if (target.startsWith(MEDIA_DIR)) headers['X-Content-Type-Options'] = 'nosniff';

  /* پشتیبانی از Range برای فیلم‌ها (پخش/جست‌وجو در مرورگر) */
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range;
  if (range) {
    const rm = /bytes=(\d*)-(\d*)/.exec(range);
    if (rm && (rm[1] || rm[2])) {
      if (rm[1]) start = Number(rm[1]);
      if (rm[2]) end = Math.min(Number(rm[2]), size - 1);
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  return fs.createReadStream(target, { start, end }).pipe(res);
}

/* ── سرور ────────────────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range',
    });
    return res.end();
  }

  /* مسیر کوتاه و خوانا برای صفحه‌ی دانلود اپ (فقط ابزار توسعه) */
  if (p === '/apk' || p === '/apk/' || p === '/download' || p === '/download/') {
    return serveStatic(req, res, '/tools/apk-download.html');
  }

  try {
    if (p.endsWith('/api/media.php')) return await handleMedia(req, res, url);
    if (p.endsWith('/api/reports.php')) return await handleReports(req, res, url);
    if (p.endsWith('/api/users.php')) return await handleUsers(req, res, url);
    if (p.endsWith('/api/departments.php')) return sendJson(res, 200, { success: true, departments: [] });
    if (/\/api\/[a-z_]+\.php$/.test(p)) return sendJson(res, 200, { success: true, items: [] });
    return serveStatic(req, res, p);
  } catch (error) {
    console.error('[dev-server]', error);
    return sendJson(res, 500, { success: false, error: 'خطای داخلی سرور توسعه: ' + error.message });
  }
});

server.listen(PORT, HOST, () => {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  console.log(`✅ سرور توسعه‌ی ای‌پلاک روی http://${HOST}:${PORT} فعال شد`);
  console.log(`   اپ:        http://${HOST}:${PORT}/index.html`);
  console.log(`   API رسانه: http://${HOST}:${PORT}/api/media.php?action=config`);
  console.log('   (این سرور فقط برای تست است؛ نسخه‌ی اصلی با PHP اجرا می‌شود)');
});
