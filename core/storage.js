/* core/storage.js — ذخیره‌سازی محلی چندحسابی کامل (per-phone)
   =====================================================================
   ساختار داده در localStorage:
     eplak_profiles        => { "<phone>": { name, avatar }, ... }
     eplak_current_phone   => "<phone>"
     eplak_reports_<phone> => [ ...آرایه گزارش‌های این شماره ]
     eplak_payments_<phone>=> [ ...آرایه پرداخت‌های این شماره ]
     eplak_notifs_<phone>  => [ ...آرایه اعلان‌های این شماره ]
     eplak_favids_<phone>  => [ ...آرایه آی‌دی علاقه‌مندی‌های این شماره ]
     eplak_rid_<phone>     => <عدد — شمارنده آی‌دی گزارش>
   ===================================================================== */

(function () {
  const LS_PROFILES     = 'eplak_profiles';
  const LS_CURRENT      = 'eplak_current_phone';
  const DEFAULT_NAME    = 'شهروند';
  const DEFAULT_AVATAR  = '👤';
  // در گوشی واقعی باید IP کامپیوترِ دارای XAMPP استفاده شود؛ 127.0.0.1 به خود گوشی اشاره می‌کند.
  // در صورت تغییر IP سیستم، فقط مقدار زیر را تغییر دهید.
  const BACKEND_BASE_URL = window.EPLAK_API_BASE_URL ||
    (window.location.protocol === 'file:' ? 'https://eplak.ir/eplak-fixed/api' : 'api');
  window.EPLAK_API_BASE_URL = BACKEND_BASE_URL;

  /* ─── آدرس پایه‌ی API ─────────────────────────────────────────────
     همه‌ی ماژول‌ها باید از همین یک تابع استفاده کنند (قبلاً چند ماژول آدرس
     IP کامپیوتر توسعه‌دهنده را هاردکد کرده بودند و روی سایت/اپ کار نمی‌کرد). */
  function apiBase() {
    const configured = (typeof window.EPLAK_API_BASE_URL === 'string' && window.EPLAK_API_BASE_URL)
      ? window.EPLAK_API_BASE_URL
      : BACKEND_BASE_URL;
    return String(configured || 'api').replace(/\/+$/, '');
  }
  window.eplakApiBase = apiBase;

  /* ─── آدرس فایل‌های پیوست (عکس/فیلم گزارش) ────────────────────────
     روی وب، آدرس‌ها نسبی‌اند (uploads/reports/…) و درست کار می‌کنند.
     در اپ اندروید صفحه با file:///android_asset/index.html باز می‌شود؛ آنجا
     آدرس نسبی به خود گوشی اشاره می‌کند، پس باید به دامنه‌ی سرور وصل شود. */
  function resolveMediaUrl(path) {
    const value = String(path || '').trim();
    if (value === '') return '';
    if (/^(https?:)?\/\//i.test(value) || value.indexOf('data:') === 0 || value.indexOf('blob:') === 0) {
      return value;
    }
    if (window.location.protocol === 'file:') {
      const base = String(BACKEND_BASE_URL || '').replace(/\/+$/, '').replace(/\/api$/i, '');
      if (/^(https?:)?\/\//i.test(base)) {
        return base + '/' + value.replace(/^\/+/, '');
      }
    }
    return value;
  }
  window.eplakResolveMediaUrl = resolveMediaUrl;

  /* ─── کمکی‌های خام localStorage ─────────────────────────────────── */
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch(e) {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  }
  function lsGetJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return (parsed !== null && parsed !== undefined) ? parsed : fallback;
    } catch(e) { return fallback; }
  }
  function lsSetJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  /* ─── «نوع محتوای ساده» برای درخواست‌های JSON ────────────────────────
     چرا text/plain و نه application/json؟
       • در اپ اندروید صفحه از file:///android_asset باز می‌شود و origin آن
         «null» است. با Content-Type: application/json مرورگر/وب‌ویو یک
         درخواست پیش‌پرواز OPTIONS می‌فرستد؛ اگر آن پاسخ تأیید نشود ارسال
         بی‌صدا شکست می‌خورد (همان پیام «پیوست‌ها به سرور نرسیدند»).
       • text/plain جزء انواع ساده است و پیش‌پرواز ندارد.
       • سرور بدنه را با php://input می‌خواند و به Content-Type کاری ندارد. */
  const JSON_CONTENT_TYPE = 'text/plain;charset=UTF-8';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* پیام فارسی خطای «حمل» (شبکه/فایروال/حجم) برای نمایش به کاربر */
  function transportMessage(status, kind) {
    const code = Number(status) || 0;
    if (kind === 'timeout') return 'پاسخی از سرور نرسید (زمان انتظار تمام شد)';
    if (code === 403) return 'فایروال هاست درخواست را رد کرد (کد ۴۰۳)';
    if (code === 413) return 'حجم درخواست بیش از حد مجاز هاست است (کد ۴۱۳)';
    if (code === 404) return 'این سرویس روی هاست فعال نیست (کد ۴۰۴) — بسته‌ی تازه را Extract کنید';
    if (code === 405) return 'این روش ارسال روی هاست فعال نیست (کد ۴۰۵)';
    if (code >= 500) return 'خطای داخلی سرور (کد ' + code + ')';
    if (code > 0) return 'پاسخ سرور خوانده نشد (کد ' + code + ')';
    return 'ارتباط با سرور برقرار نشد (اینترنت را بررسی کنید)';
  }

  function shortDetail(text) {
    return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  function transportFail(status, kind, detail) {
    const code = Number(status) || 0;
    return {
      success: false,
      __transport: true,
      status: code,
      kind: kind || 'network',
      error: transportMessage(code, kind),
      detail: shortDetail(detail)
    };
  }

  /* آیا پاسخ، خطای «حمل» است (نه پاسخ منطقی سرور)؟ */
  function isTransportFailure(res) {
    return !!(res && res.__transport);
  }

  /* ارسال JSON با XMLHttpRequest — هم درصد پیشرفت می‌دهد و هم کد وضعیت را
     برای عیب‌یابی برمی‌گرداند (برخلاف fetch که در بعضی حالت‌ها پیام مبهم
     می‌دهد). در صورت شکست، شیء { __transport:true, status, error } برمی‌گردد. */
  function postJsonXhr(url, payload, timeoutMs, onProgress) {
    return new Promise(resolve => {
      let body;
      try {
        body = JSON.stringify(payload || {});
      } catch (e) {
        resolve(transportFail(0, 'encode', 'ساخت بدنه‌ی درخواست ممکن نشد'));
        return;
      }
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', JSON_CONTENT_TYPE);
        xhr.timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 60000;
        if (typeof onProgress === 'function' && xhr.upload) {
          xhr.upload.onprogress = function (ev) {
            if (ev && ev.lengthComputable && ev.total > 0) {
              onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
            }
          };
        }
        xhr.onload = function () {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          if (typeof onProgress === 'function') onProgress(100);
          if (data === null || typeof data !== 'object') {
            resolve(transportFail(xhr.status, 'body', xhr.responseText));
            return;
          }
          resolve(data);
        };
        xhr.onerror = function () { resolve(transportFail(0, 'network', '')); };
        xhr.ontimeout = function () { resolve(transportFail(0, 'timeout', '')); };
        xhr.send(body);
      } catch (error) {
        resolve(transportFail(0, 'network', error && error.message));
      }
    });
  }

  async function syncDataToBackend(endpoint, payload) {
    if (!payload || typeof payload !== 'object') return null;
    const res = await postJsonXhr(BACKEND_BASE_URL + '/' + endpoint + '.php', payload, 60000);
    if (isTransportFailure(res)) {
      console.warn('[backend] request failed', endpoint, res.status, res.error);
      return null;
    }
    return res;
  }

  /* ارسال فرم چندبخشی (برای آپلود عکس/فیلم گزارش‌ها).
     نکته: هدر Content-Type عمداً تنظیم نمی‌شود تا مرورگر خودش boundary بگذارد.
     توجه: روی هاست فعلی، همین مسیر برای درخواست‌های دارای فایل با کد ۴۰۳
     بسته شده است (فایروال ModSecurity/Imunify)؛ فقط به‌عنوان مسیر قدیمی نگه
     داشته شده و مسیر اصلی، آپلود «تکه‌تکه‌ی JSON» است. */
  function syncFormDataToBackendWithProgress(endpoint, formData, onProgress) {
    return new Promise(resolve => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', BACKEND_BASE_URL + '/' + endpoint + '.php', true);
        xhr.timeout = 300000;
        if (typeof onProgress === 'function' && xhr.upload) {
          xhr.upload.onprogress = function (ev) {
            if (ev && ev.lengthComputable) {
              onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
            }
          };
        }
        xhr.onload = function () {
          let data = null;
          try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          if (typeof onProgress === 'function') onProgress(100);
          if (data === null || typeof data !== 'object') {
            resolve(transportFail(xhr.status, 'body', xhr.responseText));
            return;
          }
          resolve(data);
        };
        xhr.onerror = function () { resolve(transportFail(0, 'network', '')); };
        xhr.ontimeout = function () { resolve(transportFail(0, 'timeout', '')); };
        xhr.send(formData);
      } catch (error) {
        resolve(transportFail(0, 'network', error && error.message));
      }
    });
  }

  /* ارسال JSON با نمایش درصد پیشرفت (عکس/فیلمی که داخل بدنه‌ی JSON
     به‌صورت base64 می‌رود — همان مسیری که فایروال هاست اجازه می‌دهد). */
  function syncJsonToBackendWithProgress(endpoint, payload, onProgress) {
    return postJsonXhr(BACKEND_BASE_URL + '/' + endpoint + '.php', payload, 300000, onProgress);
  }

  /* خواندن فایل گوشی به‌صورت data URL (base64) */
  function readFileAsDataUrl(blob) {
    return new Promise(resolve => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      } catch (e) {
        resolve('');
      }
    });
  }

  function postJson(url, payload, timeoutMs) {
    return postJsonXhr(url, payload, timeoutMs || 60000);
  }

  /* ── آپلود تکه‌تکه‌ی عکس/فیلم (مسیر JSON) ─────────────────────────────
     هاست فعلی، ارسال multipart/form-data همراه فایل را با کد ۴۰۳ می‌بندد و
     به حجم درخواست JSON هم حساس است؛ پس هر تکه کوچک (پیش‌فرض ۵۱۲ کیلوبایت
     خام ≈ ۷۰۰ کیلوبایت base64) و مستقل فرستاده می‌شود، هر تکه در صورت خطای
     شبکه تا ۳ بار تکرار می‌شود و ترتیب تکه‌ها روی سرور بررسی می‌شود.
     خروجی:
       { ok, media:[...], failed:[نام فایل‌ها], error, unsupported, blocked, status }
     unsupported=true یعنی نسخه‌ی هاست قدیمی است (کنش تکه‌تکه را ندارد). */
  const MEDIA_CHUNK_DEFAULT = 512 * 1024;
  const MEDIA_CHUNK_MIN = 64 * 1024;

  function mediaChunkSize() {
    const custom = Number(window.EPLAK_MEDIA_CHUNK_SIZE);
    return (isFinite(custom) && custom >= MEDIA_CHUNK_MIN) ? custom : MEDIA_CHUNK_DEFAULT;
  }

  async function sendMediaChunk(payload) {
    const url = BACKEND_BASE_URL + '/media.php?action=chunk';
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      last = await postJson(url, payload, 120000);
      if (last && last.success === true) return last;
      /* فقط خطای شبکه/زمان دوباره تلاش می‌شود؛ پاسخ‌های سرور (۴۰۳/۴۱۳/…) بی‌فایده‌اند */
      if (last && last.__transport && (last.kind === 'network' || last.kind === 'timeout') && attempt < 2) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      return last;
    }
    return last;
  }

  async function uploadReportMediaChunked(reportId, phone, files, onProgress) {
    const size = mediaChunkSize();
    const media = [];
    const failed = [];
    let error = '';
    let unsupported = false;
    let blocked = false;
    let status = 0;
    const list = Array.from(files || []);
    if (!reportId || !list.length) {
      return { ok: true, media: media, failed: failed, error: '', unsupported: false, blocked: false, status: 0 };
    }

    for (let fileIndex = 0; fileIndex < list.length; fileIndex++) {
      const file = list[fileIndex];
      const fileName = file.name || ('attachment-' + (fileIndex + 1));
      const total = Math.max(1, Math.ceil(file.size / size));
      const uploadId = (Date.now().toString(16) + Math.floor(Math.random() * 0xffffff).toString(16)).slice(0, 32);
      let fileError = '';
      let fileOk = false;

      for (let index = 0; index < total; index++) {
        const start = index * size;
        const chunk = file.slice(start, Math.min(file.size, start + size));
        const data = await readFileAsDataUrl(chunk);
        if (!data) {
          fileError = 'خواندن فایل «' + fileName + '» روی گوشی ممکن نشد.';
          break;
        }

        const res = await sendMediaChunk({
          phone: phone,
          reportId: reportId,
          uploadId: uploadId,
          index: index,
          total: total,
          name: fileName,
          mime: file.type || '',
          data: data
        });

        if (!res) {
          fileError = 'ارتباط با سرور برقرار نشد.';
          break;
        }
        if (res.__transport) {
          status = res.status || 0;
          unsupported = (status === 404 || status === 405);
          blocked = (status === 403 || status === 413);
          fileError = res.error || 'ارسال فایل ناموفق بود.';
          break;
        }
        if (res.success !== true) {
          status = 0;
          fileError = String(res.error || 'ارسال فایل ناموفق بود.');
          if (fileError.indexOf('گزارش یافت نشد') > -1 || fileError.indexOf('کنش نامعتبر') > -1) {
            unsupported = true;
          }
          break;
        }
        if (index === total - 1 && res.media) {
          media.push(res.media);
          fileOk = true;
        }
        if (typeof onProgress === 'function') {
          const overall = ((fileIndex + (index + 1) / total) / list.length) * 100;
          onProgress(Math.min(99, Math.round(overall)));
        }
      }

      if (!fileOk) {
        failed.push(fileName);
        if (!error) error = fileError;
        /* اگر سرویس تکه‌تکه روی هاست نیست، ادامه دادن بی‌فایده است */
        if (unsupported || blocked) break;
      }
    }

    if (typeof onProgress === 'function') onProgress(100);
    return {
      ok: failed.length === 0 && media.length > 0,
      media: media,
      failed: failed,
      error: error,
      unsupported: unsupported,
      blocked: blocked,
      status: status
    };
  }

  /* ── صف پیوست‌های ناموفق (نگه‌داشتن فایل در گوشی تا ارسال موفق) ──────────
     اگر هنگام ثبت گزارش، اینترنت ضعیف باشد یا سرور فایل را نپذیرد، فایل در
     حافظه‌ی مرورگر/اپ (IndexedDB) ذخیره می‌شود و در نخستین فرصت — باز شدن
     دوباره‌ی اپ یا برگشتن اینترنت — خودکار دوباره فرستاده می‌شود. پس کاربر
     هیچ‌وقت عکس/فیلمش را از دست نمی‌دهد و لازم نیست کاری انجام دهد.
     اگر مرورگر از IndexedDB پشتیبانی نکند، این بخش بی‌صدا کنار گذاشته
     می‌شود و رفتار قبلی (دکمه‌ی تلاش دوباره) برجا می‌ماند. */
  const PENDING_DB = 'eplak_pending_media';
  const PENDING_STORE = 'items';

  function openPendingDb() {
    return new Promise(resolve => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = window.indexedDB.open(PENDING_DB, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (db && !db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function pendingTx(db, mode) {
    return db.transaction(PENDING_STORE, mode).objectStore(PENDING_STORE);
  }

  /* افزودن فایل‌های ناموفق به صف (برای ارسال خودکار در فرصت بعدی) */
  async function queuePendingMedia(reportId, phone, files) {
    const list = Array.from(files || []).filter(f => f && typeof f === 'object' && (f.size || 0) > 0);
    if (!reportId || !phone || !list.length) return false;
    const db = await openPendingDb();
    if (!db) return false;
    const stamp = Date.now();
    return new Promise(resolve => {
      try {
        const store = pendingTx(db, 'readwrite');
        list.forEach((file, i) => {
          store.put({
            key: String(reportId) + '-' + stamp + '-' + i,
            reportId: Number(reportId),
            phone: String(phone),
            name: file.name || ('attachment-' + (i + 1)),
            type: file.type || '',
            size: Number(file.size) || 0,
            blob: file,
            addedAt: new Date().toISOString()
          });
        });
        store.transaction.oncomplete = function () { resolve(true); };
        store.transaction.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  /* تعداد فایل‌های در انتظار ارسال */
  async function countPendingMedia() {
    const db = await openPendingDb();
    if (!db) return 0;
    return new Promise(resolve => {
      try {
        const req = pendingTx(db, 'readonly').count();
        req.onsuccess = function () { resolve(Number(req.result) || 0); };
        req.onerror = function () { return resolve(0); };
      } catch (e) { resolve(0); }
    });
  }

  /* تلاش دوباره برای همه‌ی فایل‌های صف (هنگام باز شدن اپ یا برگشتن اینترنت) */
  async function flushPendingMedia(onReportDone) {
    const db = await openPendingDb();
    if (!db) return { sent: 0, left: 0 };
    const rows = await new Promise(resolve => {
      try {
        const req = pendingTx(db, 'readonly').getAll();
        req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
        req.onerror = function () { return resolve([]); };
      } catch (e) { resolve([]); }
    });
    if (!rows.length) return { sent: 0, left: 0 };

    /* گروه‌بندی بر اساس گزارش؛ ترتیب تکه‌ها بر اساس زمان افزوده‌شدن است */
    rows.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
    const groups = new Map();
    rows.forEach(row => {
      const key = String(row.reportId) + '|' + String(row.phone);
      if (!groups.has(key)) groups.set(key, { reportId: row.reportId, phone: row.phone, items: [] });
      groups.get(key).items.push(row);
    });

    let sent = 0;
    const leftovers = [];
    const failedGroups = new Set();
    for (const [key, group] of groups.entries()) {
      const res = await uploadReportMediaChunked(group.reportId, group.phone, group.items.map(i => i.blob), null);
      const okCount = (res && Array.isArray(res.media)) ? res.media.length : 0;
      if (res && res.ok && okCount > 0) {
        sent += group.items.length;
        if (typeof onReportDone === 'function') {
          try { onReportDone(group.reportId, group.items.length); } catch (e) {}
        }
      } else {
        failedGroups.add(key);
      }
    }
    groups.forEach((group, key) => {
      if (failedGroups.has(key)) group.items.forEach(item => leftovers.push(item));
    });

    /* صف بازنویسی می‌شود: فقط فایل‌های ناموفق باقی می‌مانند */
    if (sent > 0) {
      await new Promise(resolve => {
        try {
          const store = pendingTx(db, 'readwrite');
          store.clear();
          leftovers.forEach(item => store.put(item));
          store.transaction.oncomplete = function () { resolve(true); };
          store.transaction.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }

    return { sent: sent, left: await countPendingMedia() };
  }

  window.eplakQueuePendingMedia = queuePendingMedia;
  window.eplakFlushPendingMedia = flushPendingMedia;
  window.eplakCountPendingMedia = countPendingMedia;

  /* وضعیت پیوست‌های یک گزارش روی سرور (برای تأیید نهایی که فایل‌ها ذخیره شدند) */
  async function reportMediaStatus(reportId, phone) {
    if (!reportId || !phone) return null;
    const res = await postJson(BACKEND_BASE_URL + '/media.php?action=media_status', { phone: phone, reportId: reportId }, 30000);
    if (!res || res.__transport || res.success !== true) return null;
    return {
      count: Number(res.media_count || 0),
      max: Number(res.max || 0),
      media: Array.isArray(res.media) ? res.media : []
    };
  }

  async function syncFormDataToBackend(endpoint, formData) {
    if (!formData || typeof FormData === 'undefined' || !(formData instanceof FormData)) return null;
    try {
      const response = await fetch(BACKEND_BASE_URL + '/' + endpoint + '.php', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        console.warn('[backend] form request failed', endpoint, await response.text());
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[backend] form unavailable', endpoint, error.message);
      return null;
    }
  }
  window.syncFormDataToBackend = syncFormDataToBackend;

  function syncUserProfileToBackend(phone = getCurrentPhone()) {
    if (!phone) return;
    const nameInput = document.getElementById('editNameInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    const profile = getProfileByPhone(phone);
    const payload = {
      phone,
      name: (nameInput?.value || '').trim() || profile.name || DEFAULT_NAME,
      address: (addressInput?.value || '').trim(),
      nid: (nidInput?.value || '').trim()
    };
    syncDataToBackend('users', payload);
  }

  /* ─── پروفایل (نام + عکس) ──────────────────────────────────────── */
  function readAllProfiles() {
    const p = lsGetJSON(LS_PROFILES, {});
    return (p && typeof p === 'object') ? p : {};
  }
  function writeAllProfiles(all) { lsSetJSON(LS_PROFILES, all); }

  function getCurrentPhone() { return lsGet(LS_CURRENT) || ''; }
  function setCurrentPhone(phone) {
    if (phone) lsSet(LS_CURRENT, phone);
    else lsDel(LS_CURRENT);
  }

  function getProfileByPhone(phone) {
    if (!phone) return { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
    const all = readAllProfiles();
    const ex = all[phone];
    return {
      name:    (ex && ex.name)    ? ex.name    : DEFAULT_NAME,
      avatar:  (ex && ex.avatar)  ? ex.avatar  : DEFAULT_AVATAR,
      address: (ex && typeof ex.address === 'string') ? ex.address : '',
      nid:     (ex && typeof ex.nid === 'string') ? ex.nid : ''
    };
  }
  function ensureProfileExists(phone) {
    if (!phone) return;
    const all = readAllProfiles();
    if (!all[phone]) {
      all[phone] = { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
      writeAllProfiles(all);
    }
  }
  function updateProfileByPhone(phone, patch) {
    if (!phone) return;
    const all = readAllProfiles();
    const cur = all[phone] || { name: DEFAULT_NAME, avatar: DEFAULT_AVATAR, address: '', nid: '' };
    all[phone] = Object.assign({}, cur, patch);
    writeAllProfiles(all);
  }

  async function loadUserProfileFromBackend(phone) {
    if (!phone) return;
    try {
      const response = await fetch(BACKEND_BASE_URL + '/users.php?phone=' + encodeURIComponent(phone));
      if (!response.ok) return;
      const data = await response.json();
      if (!data.success || !data.user) return;
      updateProfileByPhone(phone, {
        name:    data.user.name || DEFAULT_NAME,
        address: data.user.address || '',
        nid:     data.user.nid || '',
        avatar:  data.user.avatar || DEFAULT_AVATAR
      });
      if (typeof userProfile === 'object' && userProfile) {
        userProfile.name = data.user.name || DEFAULT_NAME;
      }
      updateProfileUI();
    } catch (error) {
      console.warn('[backend] profile fetch failed', error.message);
    }
  }

  /* ─── کلیدهای per-phone برای سایر داده‌ها ──────────────────────── */
  function keyReports(phone)  { return 'eplak_reports_'  + phone; }
  function keyPayments(phone) { return 'eplak_payments_' + phone; }
  function keyNotifs(phone)   { return 'eplak_notifs_'   + phone; }
  function keyFavIds(phone)   { return 'eplak_favids_'   + phone; }
  function keyRid(phone)      { return 'eplak_rid_'      + phone; }

  /* داده‌های پیش‌فرض برای یک کاربر تازه */
  function defaultPayments() {
    return [
      { id: 'p1', code: 'INV-9001', title: 'عوارض نوسازی سال ۱۴۰۳', due: '۱۴۰۳/۰۴/۳۱', amount: 1850000, status: 'pending' },
      { id: 'p2', code: 'INV-8744', title: 'عوارض پسماند بهار',       due: '۱۴۰۳/۰۳/۳۱', amount:  420000, status: 'pending' },
      { id: 'p3', code: 'INV-8120', title: 'عوارض کسب و پیشه',       due: '۱۴۰۳/۰۲/۱۵', amount: 2200000, status: 'done'    }
    ];
  }
  function defaultNotifications() {
    return [
      { id: 'no1', title: 'خوش آمدید', body: 'به اپ ای‌پلاک خوش آمدید.', time: 'هم‌اکنون', icon: '👋', read: false }
    ];
  }
  function defaultFavIds() { return ['s1', 's4']; }

  /* ─── بارگذاری داده‌های یک شماره به متغیرهای سراسری ────────────── */
  function loadUserData(phone) {
    if (!phone) return;

    /* گزارش‌ها */
    const savedReports = lsGetJSON(keyReports(phone), null);
    if (savedReports !== null) {
      reports.length = 0;
      savedReports.forEach(r => reports.push(r));
    } else {
      /* اولین ورود این شماره — گزارش‌های نمونه حذف، لیست خالی */
      reports.length = 0;
      saveReports(phone);
    }

    /* تیکت‌های همین شماره */
    if (typeof window.loadSavedTickets === 'function') window.loadSavedTickets(phone);

    /* شمارنده آی‌دی گزارش */
    const rid = lsGetJSON(keyRid(phone), 1);
    reportIdCounter = typeof rid === 'number' ? rid : 1;

    /* پرداخت‌ها */
    const savedPayments = lsGetJSON(keyPayments(phone), null);
    if (savedPayments !== null) {
      payments.length = 0;
      savedPayments.forEach(p => payments.push(p));
    } else {
      payments.length = 0;
      defaultPayments().forEach(p => payments.push(p));
      savePayments(phone);
    }

    /* اعلان‌ها */
    const savedNotifs = lsGetJSON(keyNotifs(phone), null);
    if (savedNotifs !== null) {
      notifications.length = 0;
      savedNotifs.forEach(n => notifications.push(n));
    } else {
      notifications.length = 0;
      defaultNotifications().forEach(n => notifications.push(n));
      saveNotifications(phone);
    }

    /* علاقه‌مندی‌ها */
    const savedFavs = lsGetJSON(keyFavIds(phone), null);
    if (savedFavs !== null) {
      favoriteIds.length = 0;
      savedFavs.forEach(id => favoriteIds.push(id));
    } else {
      favoriteIds.length = 0;
      defaultFavIds().forEach(id => favoriteIds.push(id));
      saveFavorites(phone);
    }
  }

  /* ─── ذخیره داده‌ها ─────────────────────────────────────────────── */
  function saveReports(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyReports(phone), reports);
    lsSetJSON(keyRid(phone), reportIdCounter);
  }
  function savePayments(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyPayments(phone), payments);
  }
  function saveNotifications(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyNotifs(phone), notifications);
  }
  function saveFavorites(phone) {
    phone = phone || getCurrentPhone();
    if (!phone) return;
    lsSetJSON(keyFavIds(phone), favoriteIds);
  }

  const DEFAULT_AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:55%;height:55%;color:rgba(255,255,255,0.9);margin:auto;"><circle cx="12" cy="8" r="4.5" fill="currentColor" fill-opacity="0.25"/><path d="M20 21a8 8 0 0 0-16 0" fill="currentColor" fill-opacity="0.15"/></svg>';

  /* ─── رندر UI پروفایل ───────────────────────────────────────────── */
  function renderAvatarInto(el, avatarValue) {
    if (!el) return;
    if (avatarValue && avatarValue.startsWith('data:image')) {
      el.innerHTML = '<img src="' + avatarValue + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;aspect-ratio:1/1;">';
    } else if (avatarValue && avatarValue.indexOf('<svg') !== -1) {
      el.innerHTML = avatarValue;
    } else {
      el.innerHTML = DEFAULT_AVATAR_SVG;
    }
  }

  function formatPhoneDisplaySafe(raw) {
    if (typeof formatPhoneDisplay === 'function') return formatPhoneDisplay(raw);
    if (!raw || raw.length !== 11) return raw;
    return raw.slice(0, 4) + ' ' + raw.slice(4, 7) + ' ' + raw.slice(7);
  }

  function updateProfileUI() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const defaultName = isEn ? 'Citizen' : DEFAULT_NAME;
    const noPhone = isEn ? 'No phone registered' : 'شماره ثبت نشده';
    const noNid = isEn ? 'National ID not registered' : 'کد ملی ثبت نشده';
    const noAddr = isEn ? 'Address not registered' : 'آدرس ثبت نشده';

    document.querySelectorAll('#profileNameDisplay').forEach(x => {
      const val = profile.name || defaultName;
      x.textContent = (isEn && val === DEFAULT_NAME) ? 'Citizen' : val;
    });
    document.querySelectorAll('#profilePhoneDisplay').forEach(x => x.textContent = phone ? formatPhoneDisplaySafe(phone) : noPhone);
    document.querySelectorAll('#profileNidDisplay').forEach(x => x.textContent = profile.nid || noNid);
    document.querySelectorAll('#profileAddressDisplay').forEach(x => x.textContent = profile.address || noAddr);
    document.querySelectorAll('.avatar').forEach(x => renderAvatarInto(x, profile.avatar));

    const homeName = document.getElementById('homeUserName');
    if (homeName) {
      const displayName = (isEn && (!profile.name || profile.name === DEFAULT_NAME)) ? 'Citizen' : (profile.name || DEFAULT_NAME);
      homeName.textContent = (isEn ? 'Hello ' : 'سلام ') + displayName;
    }
    updateHomeProfileMenu();

    refreshAvatarActionButtons();
    closeProfileActionsMenu();
  }

  function toggleProfileActionsMenu() {
    const panel = document.getElementById('profileActionsPanel');
    if (!panel) return;
    panel.classList.toggle('open');
  }

  function closeProfileActionsMenu() {
    const panel = document.getElementById('profileActionsPanel');
    if (!panel) return;
    panel.classList.remove('open');
  }

  function toggleHomeProfileMenu() {
    const panel = document.getElementById('homeProfileActionsPanel');
    if (!panel) return;
    panel.classList.toggle('open');
  }

  function closeHomeProfileMenu() {
    const panel = document.getElementById('homeProfileActionsPanel');
    if (!panel) return;
    panel.classList.remove('open');
  }

  function updateHomeProfileMenu() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const label = document.getElementById('homeProfileButtonLabel');
    const menuName = document.getElementById('homeProfileMenuName');
    const menuPhone = document.getElementById('homeProfileMenuPhone');
    if (label) label.textContent = profile.name || DEFAULT_NAME;
    if (menuName) menuName.textContent = profile.name || DEFAULT_NAME;
    if (menuPhone) menuPhone.textContent = phone ? formatPhoneDisplaySafe(phone) : '';
  }

  document.addEventListener('click', event => {
    const panel = document.getElementById('profileActionsPanel');
    const toggle = document.getElementById('profileMenuToggleBtn');
    const homePanel = document.getElementById('homeProfileActionsPanel');
    const homeToggle = document.getElementById('homeProfileToggleBtn');
    if (panel && panel.classList.contains('open')) {
      if (panel.contains(event.target) || toggle?.contains(event.target)) {
        return;
      }
      panel.classList.remove('open');
    }
    if (homePanel && homePanel.classList.contains('open')) {
      if (homePanel.contains(event.target) || homeToggle?.contains(event.target)) {
        return;
      }
      homePanel.classList.remove('open');
    }
  });

  /* ─── ورود با شماره ─────────────────────────────────────────────── */
  function loginWithPhone(phone) {
    if (!phone) return;
    ensureProfileExists(phone);
    setCurrentPhone(phone);

    const profile = getProfileByPhone(phone);
    syncUserProfileToBackend(phone);
    if (typeof loadUserProfileFromBackend === 'function') {
      loadUserProfileFromBackend(phone);
    }
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = phone;
      userProfile.phone = formatPhoneDisplaySafe(phone);
      userProfile.name = profile.name;
    }

    /* بارگذاری داده‌های اختصاصی این شماره */
    loadUserData(phone);
    if (typeof loadReportsFromBackend === 'function') {
      loadReportsFromBackend(phone, { silent: true });
    }
    updateProfileUI();
  }

  /* ─── خروج ─────────────────────────────────────────────────────── */
  function logoutCurrentUser() {
    setCurrentPhone('');
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = '';
      userProfile.phone = '';
      userProfile.name = DEFAULT_NAME;
    }
    /* پاک کردن متغیرهای سراسری تا کاربر بعدی داده قدیمی نبیند */
    if (typeof reports !== 'undefined') reports.length = 0;
    if (typeof payments !== 'undefined') payments.length = 0;
    if (typeof notifications !== 'undefined') notifications.length = 0;
    if (typeof favoriteIds !== 'undefined') favoriteIds.length = 0;
    if (typeof window.clearTicketsInMemory === 'function') window.clearTicketsInMemory();
  }

  /* ─── «حساب داخل اپ ذخیره نشود» ───────────────────────────────────
     درخواست کارفرما: اپ اندروید بعد از بسته شدن (خروج با دوبار زدن دکمه‌ی
     بازگشت) باید دوباره کد تایید بخواهد. بنابراین هر بار که اپ از صفر بالا
     می‌آید، اطلاعات ورود از دستگاه پاک می‌شود؛ مگر کاربر همان لحظه کد تایید
     را وارد کرده باشد (markLoginDone در اندروید ثبت می‌شود). */
  function clearStoredSession() {
    try {
      setCurrentPhone('');
      if (typeof userProfile === 'object' && userProfile) {
        userProfile.rawPhone = '';
        userProfile.phone = '';
        userProfile.name = DEFAULT_NAME;
      }
      if (typeof reports !== 'undefined') reports.length = 0;
      if (typeof payments !== 'undefined') payments.length = 0;
      if (typeof notifications !== 'undefined') notifications.length = 0;
      if (typeof favoriteIds !== 'undefined') favoriteIds.length = 0;
    } catch (e) {}
  }
  window.clearStoredSession = clearStoredSession;

  /* آیا اپ اندروید می‌گوید «این بالا آمدن تازه است و باید کد تایید گرفته شود»؟ */
  function nativeRequiresLogin() {
    try {
      if (window.AndroidApp && typeof window.AndroidApp.shouldRequireLogin === 'function') {
        return window.AndroidApp.shouldRequireLogin() === true;
      }
    } catch (e) {}
    return false;
  }

  /* پاک‌سازی اطلاعات ورود پیش از خروج کامل از اپ (دوبار زدن دکمه‌ی بازگشت) */
  function prepareAppExit() {
    clearStoredSession();
    try {
      if (window.AndroidApp && typeof window.AndroidApp.prepareExit === 'function') {
        window.AndroidApp.prepareExit();
      }
    } catch (e) {}
  }
  window.prepareAppExit = prepareAppExit;

  /* ─── بازیابی session پس از رفرش ──────────────────────────────── */
  function restoreSession() {
    /* در اپ اندروید: اگر این بالا آمدن تازه است، حساب بازیابی نمی‌شود */
    if (nativeRequiresLogin()) {
      clearStoredSession();
      try {
        if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
        if (typeof window.showScreen === 'function') window.showScreen('screen-login', { skipHistory: true });
      } catch (e) {}
      return false;
    }

    const phone = getCurrentPhone();
    if (!phone) return false;

    ensureProfileExists(phone);
    const profile = getProfileByPhone(phone);
    if (typeof userProfile === 'object' && userProfile) {
      userProfile.rawPhone = phone;
      userProfile.phone = formatPhoneDisplaySafe(phone);
      userProfile.name = profile.name;
    }

    /* بارگذاری داده‌های این کاربر */
    loadUserData(phone);
    updateProfileUI();

    if (typeof showScreen === 'function') showScreen('screen-home');
    return true;
  }

  /* ─── فرم ویرایش پروفایل ────────────────────────────────────────── */
  function persistNameSilently() {
    const phone = getCurrentPhone();
    if (!phone) return;
    const nameInput = document.getElementById('editNameInput');
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    updateProfileByPhone(phone, { name });
    if (typeof userProfile === 'object' && userProfile) userProfile.name = name;
    updateProfileUI();
  }

  function saveProfile() {
    const phone = getCurrentPhone();
    if (!phone) {
      if (typeof showToast === 'function') showToast('برای ویرایش پروفایل ابتدا وارد شوید');
      return;
    }
    const nameInput = document.getElementById('editNameInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    const name = (nameInput?.value || '').trim();
    const address = (addressInput?.value || '').trim();
    const nid = (nidInput?.value || '').trim();
    if (!name) {
      if (typeof showToast === 'function') showToast('نام و نام خانوادگی را وارد کنید');
      return;
    }
    updateProfileByPhone(phone, { name, address, nid });
    if (typeof userProfile === 'object' && userProfile) userProfile.name = name;
    if (typeof syncUserProfileToBackend === 'function') {
      syncUserProfileToBackend(phone);
    }
    updateProfileUI();
    if (typeof showToast === 'function') showToast('تغییرات با موفقیت ذخیره شد');
    if (typeof showScreen === 'function') showScreen('screen-profile');
  }

  function fillEditProfileForm() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const nameInput  = document.getElementById('editNameInput');
    const phoneInput = document.getElementById('editPhoneInput');
    const addressInput = document.getElementById('editAddressInput');
    const nidInput = document.getElementById('editNidInput');
    if (nameInput)  nameInput.value = profile.name || DEFAULT_NAME;
    if (addressInput) addressInput.value = profile.address || '';
    if (nidInput) nidInput.value = profile.nid || '';
    if (phoneInput) {
      phoneInput.value = phone ? formatPhoneDisplaySafe(phone) : '';
      phoneInput.setAttribute('readonly', 'readonly');
      phoneInput.setAttribute('disabled', 'disabled');
      phoneInput.style.opacity = '0.7';
      phoneInput.style.cursor  = 'not-allowed';
      phoneInput.title = 'شماره موبایل هویت حساب شماست و قابل تغییر نیست';
    }
    refreshAvatarActionButtons();
  }

  /* ─── آپلود / حذف عکس پروفایل ──────────────────────────────────── */
  function getOrCreateAvatarUploadInput() {
    let upload = document.getElementById('profileAvatarUpload');
    if (upload) return upload;
    upload = document.createElement('input');
    upload.type = 'file'; upload.accept = 'image/*';
    upload.id = 'profileAvatarUpload'; upload.style.display = 'none';
    document.body.appendChild(upload);

    upload.addEventListener('change', e => {
      const file = e.target.files[0];
      upload.value = '';
      if (!file) return;
      const phone = getCurrentPhone();
      if (!phone) { if (typeof showToast === 'function') showToast('برای تغییر عکس ابتدا وارد شوید'); return; }
      const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i.test(file.name || '');
      if (!isImage) { if (typeof showToast === 'function') showToast('لطفاً یک فایل تصویری انتخاب کنید'); return; }
      if (file.size > 8 * 1024 * 1024) { if (typeof showToast === 'function') showToast('حجم تصویر باید کمتر از ۸ مگابایت باشد'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        updateProfileByPhone(phone, { avatar: reader.result });
        updateProfileUI();
        if (typeof showToast === 'function') showToast('عکس پروفایل به‌روزرسانی شد');
      };
      reader.onerror = () => { if (typeof showToast === 'function') showToast('خطا در خواندن فایل تصویر'); };
      reader.readAsDataURL(file);
    });
    return upload;
  }

  function triggerAvatarUpload() {
    const phone = getCurrentPhone();
    if (!phone) { if (typeof showToast === 'function') showToast('برای تغییر عکس ابتدا وارد شوید'); return; }
    getOrCreateAvatarUploadInput().click();
  }

  function removeAvatarPhoto() {
    const phone = getCurrentPhone();
    if (!phone) { if (typeof showToast === 'function') showToast('برای حذف عکس ابتدا وارد شوید'); return; }
    const profile = getProfileByPhone(phone);
    if (!profile.avatar || !profile.avatar.startsWith('data:image')) return;
    updateProfileByPhone(phone, { avatar: DEFAULT_AVATAR });
    updateProfileUI();
    if (typeof showToast === 'function') showToast('عکس پروفایل حذف شد');
  }

  function refreshAvatarActionButtons() {
    const phone = getCurrentPhone();
    const profile = getProfileByPhone(phone);
    const hasPhoto = !!(profile.avatar && profile.avatar.startsWith('data:image'));
    const removeBtn = document.getElementById('removeAvatarBtn');
    if (removeBtn) removeBtn.style.display = hasPhoto ? 'flex' : 'none';
  }

  function setupAvatarUpload() {
    getOrCreateAvatarUploadInput();
    document.querySelectorAll('.avatar').forEach(a => {
      a.style.cursor = 'pointer';
      a.onclick = () => triggerAvatarUpload();
    });
    refreshAvatarActionButtons();
  }

  /* ─── راه‌اندازی اولیه ──────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.steps-bar').forEach(x => x.style.direction = 'rtl');
    const nameInput = document.getElementById('editNameInput');
    nameInput?.addEventListener('input', persistNameSilently);
    setupAvatarUpload();
    updateProfileUI();
    restoreSession();
  });

  /* ─── export به window ──────────────────────────────────────────── */
  window.saveProfileData     = saveProfile;
  window.saveProfile         = saveProfile;
  window.loginWithPhone      = loginWithPhone;
  window.logoutCurrentUser   = logoutCurrentUser;
  window.fillEditProfileForm = fillEditProfileForm;
  window.updateProfileUI     = updateProfileUI;
  window.getCurrentPhone     = getCurrentPhone;
  window.triggerAvatarUpload = triggerAvatarUpload;
  window.removeAvatarPhoto   = removeAvatarPhoto;  window.toggleProfileActionsMenu = toggleProfileActionsMenu;
  window.toggleHomeProfileMenu = toggleHomeProfileMenu;
  window.updateHomeProfileMenu = updateHomeProfileMenu;  /* توابع ذخیره‌سازی داده — صدا زده می‌شوند از modules مربوطه */
  window.saveReports         = saveReports;
  window.savePayments        = savePayments;
  window.saveNotifications   = saveNotifications;
  window.saveFavorites       = saveFavorites;
  window.syncDataToBackend   = syncDataToBackend;
  window.syncFormDataToBackendWithProgress = syncFormDataToBackendWithProgress;
  window.syncJsonToBackendWithProgress    = syncJsonToBackendWithProgress;
  window.uploadReportMediaChunked         = uploadReportMediaChunked;
  window.eplakReadFileAsDataUrl           = readFileAsDataUrl;
  window.eplakMediaStatus                 = reportMediaStatus;
  window.eplakQueuePendingMedia           = queuePendingMedia;
  window.eplakFlushPendingMedia           = flushPendingMedia;
  window.eplakCountPendingMedia           = countPendingMedia;
  window.eplakTransportMessage            = transportMessage;
  window.eplakIsTransportFailure          = isTransportFailure;
  window.eplakJsonContentType             = function () { return JSON_CONTENT_TYPE; };
  window.eplakMediaChunkSize              = mediaChunkSize;
  window.syncUserProfileToBackend = syncUserProfileToBackend;

})();
