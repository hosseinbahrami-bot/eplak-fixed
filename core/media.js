/* core/media.js — موتور عکس و فیلم اپ ای‌پلاک (نسخه‌ی ۱)
   ============================================================================
   این فایل مسئول «کار کردن واقعی» عکس/فیلم در اپ است:

   ۱) آدرس سرور (API) را به‌صورت یکپارچه تشخیص می‌دهد — چه اپ روی وب‌سایت باشد،
      چه داخل اپ اندروید با آدرس file:// یا appassets باز شده باشد.
   ۲) عکس/فیلم گرفتن با دوربین داخل اپ (getUserMedia + MediaRecorder) و
      انتخاب از گالری / دوربین سیستمی (<input capture>).
   ۳) فشرده‌سازی عکس و ساخت پیش‌نمایش، اعتبارسنجی نوع و حجم پیش از ارسال
      (تا آپلودهای نیمه‌کاره و پیام‌های خطای مبهم رخ ندهد).
   ۴) آپلود واقعی با درصد پیشرفت، تلاش مجدد خودکار و «صف آفلاین» (IndexedDB)
      تا اگر اینترنت قطع بود، فایل با برگشت اینترنت خودش ارسال شود.
*/
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
     ۱) آدرس سرور — تنها منبع حقیقت برای همه‌ی درخواست‌های شبکه‌ای اپ
     ═══════════════════════════════════════════════════════════════════════ */
  var LS_API_BASE = 'eplak_api_base';

  /* ── ساخت/آزادسازی آدرس موقت فایل (با محافظت) ─────────────────────────
     بعضی WebViewهای قدیمی اندروید URL.createObjectURL ندارند؛ اگر خطا بدهد
     نباید کل مسیر «گرفتن فیلم» از کار بیفتد. */
  function makeObjectUrl(blob) {
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob) || '';
      }
    } catch (e) { /* پشتیبانی نمی‌شود */ }
    return '';
  }

  function releaseObjectUrl(url) {
    try {
      if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    } catch (e) { /* بی‌اهمیت */ }
  }

  function readStoredBase() {
    try { return (localStorage.getItem(LS_API_BASE) || '').trim(); } catch (e) { return ''; }
  }

  function normalizeBase(value) {
    var v = (value || '').trim();
    if (!v) return '';
    v = v.replace(/\/+$/, '');                       // بدون اسلش انتهایی
    if (/^api$/i.test(v)) v = 'api';
    return v;
  }

  /* منبع تشخیص آدرس، به ترتیب اولویت:
     ۱) متغیر سراسری window.EPLAK_API_BASE_URL (تعریف‌شده در صفحه)
     ۲) مقدار ذخیره‌شده در حافظه‌ی اپ (تنظیمات دستی/پل اندروید)
     ۳) پل اندروید (AndroidApp.getApiBaseUrl)
     ۴) اگر صفحه از http(s) باز شده: پوشه‌ی api کنار خود صفحه */
  function resolveRawBase() {
    if (window.EPLAK_API_BASE_URL) return normalizeBase(window.EPLAK_API_BASE_URL);

    var stored = readStoredBase();
    if (stored) return normalizeBase(stored);

    try {
      if (window.AndroidApp && typeof window.AndroidApp.getApiBaseUrl === 'function') {
        var fromApp = normalizeBase(window.AndroidApp.getApiBaseUrl());
        if (fromApp) return fromApp;
      }
    } catch (e) { /* پل در دسترس نیست */ }

    var proto = (window.location && window.location.protocol) || '';
    if (proto === 'http:' || proto === 'https:') return 'api';
    return '';
  }

  var apiBaseCache = null;

  function apiBase(forceRefresh) {
    if (forceRefresh) apiBaseCache = null;
    if (apiBaseCache !== null) return apiBaseCache;
    var raw = resolveRawBase();
    if (!raw) { apiBaseCache = ''; return apiBaseCache; }
    if (/^https?:\/\//i.test(raw)) { apiBaseCache = raw; return apiBaseCache; }
    /* مسیر نسبی (پیش‌فرض: api) → تبدیل به آدرس کامل بر اساس صفحه */
    try {
      apiBaseCache = new URL(raw.replace(/\/+$/, '') + '/', window.location.href).href.replace(/\/+$/, '');
    } catch (e) {
      apiBaseCache = raw;
    }
    return apiBaseCache;
  }

  function setApiBase(value) {
    var v = normalizeBase(value);
    try {
      if (v) localStorage.setItem(LS_API_BASE, v);
      else localStorage.removeItem(LS_API_BASE);
    } catch (e) { /* حافظه در دسترس نیست */ }
    window.EPLAK_API_BASE_URL = v || undefined;
    apiBase(true);
    try { window.dispatchEvent(new CustomEvent('eplak:apibase', { detail: { base: apiBase() } })); } catch (e) {}
    return apiBase();
  }

  function apiUrl(path) {
    var base = apiBase();
    var p = String(path || '').replace(/^\/+/, '');
    if (!base) {
      /* آدرس سرور تنظیم نشده (مثلاً اپ اندروید بدون تنظیم) — مسیر نسبی برمی‌گردانیم
         تا خطا در لایه‌ی بالاتر مدیریت شود. */
      return 'api/' + p;
    }
    return base + '/' + p;
  }

  /** آدرس دریافتی از سرور را به آدرس کامل تبدیل می‌کند */
  function absoluteUrl(url) {
    var u = String(url || '');
    if (!u) return '';
    if (/^(https?:|data:|blob:)/i.test(u)) return u;
    var base = apiBase();
    try {
      if (u.charAt(0) === '/') {
        /* مسیر «نسبت به ریشه» همیشه روی همان سروری سوار می‌شود که فایل‌ها
           آنجا ذخیره شده‌اند (سرور API)، نه لزوماً سرور صفحه. این تفاوت در
           اپ اندروید مهم است، چون صفحه از appassets سرو می‌شود ولی فایل‌ها
           روی سرور شهرداری هستند. */
        if (base) return new URL(base).origin + u;
        return new URL(u, window.location.href).href;
      }
      if (base) return new URL(u.replace(/^\.\//, ''), base + '/').href;
      return new URL(u, window.location.href).href;
    } catch (e) {
      return u;
    }
  }

  window.EplakApi = {
    base: apiBase,
    url: apiUrl,
    absolute: absoluteUrl,
    setBase: setApiBase,
    isConfigured: function () { return apiBase() !== ''; }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     ۲) تنظیمات و ابزارهای کوچک
     ═══════════════════════════════════════════════════════════════════════ */
  var DEFAULT_LIMITS = {
    max_image_bytes: 12 * 1024 * 1024,
    max_video_bytes: 96 * 1024 * 1024,
    max_count: 6,
    max_video_seconds: 90,
    client_max_dim: 1920,
    client_quality: 0.82
  };
  var limits = null;
  var LS_LIMITS = 'eplak_media_limits';

  function loadStoredLimits() {
    try {
      var raw = localStorage.getItem(LS_LIMITS);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) { return null; }
  }

  function fetchLimits() {
    if (limits) return Promise.resolve(limits);
    var stored = loadStoredLimits();
    if (stored) { limits = Object.assign({}, DEFAULT_LIMITS, stored); }
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', apiUrl('media.php?action=config'), true);
      xhr.timeout = 12000;
      xhr.onload = function () {
        try {
          var data = JSON.parse(xhr.responseText || '{}');
          if (data && data.success && data.limits) {
            limits = Object.assign({}, DEFAULT_LIMITS, data.limits);
            try { localStorage.setItem(LS_LIMITS, JSON.stringify(data.limits)); } catch (e) {}
          }
          if (data && data.success && data.server) {
            serverInfo = data.server;
            try { localStorage.setItem('eplak_media_server_limits', JSON.stringify(data.server)); } catch (e) {}
          }
        } catch (e) { /* پاسخ نامعتبر — پیش‌فرض‌ها کافی است */ }
        resolve(limits || DEFAULT_LIMITS);
      };
      xhr.onerror = xhr.ontimeout = function () { resolve(limits || DEFAULT_LIMITS); };
      xhr.send();
    });
  }

  var serverInfo = null;
  try {
    var storedServer = localStorage.getItem('eplak_media_server_limits');
    if (storedServer) serverInfo = JSON.parse(storedServer);
  } catch (e) { serverInfo = null; }

  function currentLimits() { return limits || loadStoredLimits() || DEFAULT_LIMITS; }

  function currentServerLimits() { return serverInfo || null; }

  /** آیا فایل از سقف واقعی سرور بزرگ‌تر است؟ (پیش از شروع آپلود هشدار می‌دهیم) */
  function exceedsServerLimit(file) {
    var info = currentServerLimits();
    if (!info) return false;
    var max = Number(info.post_max_size || info.upload_max_filesize || 0);
    if (!max) return false;
    return (file && file.size) ? file.size > max : false;
  }

  function humanSize(bytes) {
    var b = Number(bytes) || 0;
    if (b < 1024) return b + ' بایت';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' کیلوبایت';
    return (b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + ' مگابایت';
  }

  function isImage(file) {
    return !!file && (/^image\//i.test(file.type || '') || /\.(jpe?g|png|webp|gif|hei[cf]|avif)$/i.test(file.name || ''));
  }
  function isVideo(file) {
    return !!file && (/^video\//i.test(file.type || '') || /\.(mp4|m4v|mov|webm|3gp|mkv|avi)$/i.test(file.name || ''));
  }

  function extFor(file, kind) {
    var name = (file && file.name) || '';
    var m = name.match(/\.([A-Za-z0-9]{2,5})$/);
    var ext = m ? m[1].toLowerCase() : '';
    if (!ext) ext = kind === 'video' ? 'mp4' : 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    return ext;
  }

  function toast(message) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(message); return; } catch (e) {}
    }
    if (window.console) console.log('[media]', message);
  }

  function uniqueId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۳) آماده‌سازی فایل: فشرده‌سازی عکس، بررسی حجم فیلم و پیش‌نمایش
     ═══════════════════════════════════════════════════════════════════════ */

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = makeObjectUrl(file);
      if (!url) { reject(new Error('image-decode-failed')); return; }
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { releaseObjectUrl(url); reject(new Error('image-decode-failed')); };
      img.src = url;
    });
  }

  /**
   * فشرده‌سازی عکس روی خود گوشی (پیش از آپلود).
   * دلیل: عکس ۴۰ مگاپیکسلی گوشی‌های امروزی هم آپلود را کند می‌کند و هم روی
   * بعضی هاست‌ها از سقف حجم رد می‌شود؛ نسخه‌ی ۱۹۲۰ پیکسلی کیفیت بصری
   * یکسانی برای کارشناس شهرداری دارد.
   */
  function compressImage(file) {
    var cfg = currentLimits();
    var maxDim = Number(cfg.client_max_dim) || 1920;
    var quality = Number(cfg.client_quality) || 0.82;

    /* این فرمت‌ها را مرورگر نمی‌تواند روی canvas بکشد یا متحرک‌اند → دست‌نخورده */
    if (/^image\/(gif|hei[cf]|avif)$/i.test(file.type || '') || /\.(gif|hei[cf]|avif)$/i.test(file.name || '')) {
      return Promise.resolve(file);
    }

    if (typeof document === 'undefined' || !document.createElement) return Promise.resolve(file);

    return loadImageElement(file).then(function (res) {
      var img = res.img;
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var needsResize = Math.max(w, h) > maxDim;
      /* عکس کوچک و کم‌حجم را دوباره کدگذاری نکن (افت کیفیت بی‌دلیل) */
      if (!needsResize && file.size <= 1.5 * 1024 * 1024) {
        URL.revokeObjectURL(res.url);
        return file;
      }
      var scale = needsResize ? Math.min(1, maxDim / Math.max(w, h)) : 1;
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      var ctx = canvas.getContext('2d');
      if (!ctx) { releaseObjectUrl(res.url); return file; }
      /* پس‌زمینه‌ی سفید برای عکس‌های شفاف که به JPEG تبدیل می‌شوند */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);

      var done = new Promise(function (resolve) {
        try {
          canvas.toBlob(function (blob) {
            releaseObjectUrl(res.url);
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            var name = (file.name || 'photo').replace(/\.[A-Za-z0-9]{2,5}$/, '') + '.jpg';
            resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
          }, 'image/jpeg', quality);
        } catch (e) {
          releaseObjectUrl(res.url);
          resolve(file);
        }
      });
      return done;
    }).catch(function () { return file; });
  }

  /** اطلاعات فیلم: طول، ابعاد و پیش‌نمایش تصویری (بندانگشتی) */
  function probeVideo(file) {
    return new Promise(function (resolve) {
      var url = makeObjectUrl(file);
      if (!url) {
        /* محیط از پیش‌نمایش پشتیبانی نمی‌کند؛ فایل بدون تحلیل طول می‌ماند */
        resolve({ url: '', duration: 0, width: 0, height: 0, thumb: '' });
        return;
      }
      var video = document.createElement('video');
      var finished = false;
      var result = { url: url, duration: 0, width: 0, height: 0, thumb: '' };

      function finish() {
        if (finished) return;
        finished = true;
        /* ساخت بندانگشتی از فریم اول (اختیاری — خطا مهم نیست) */
        try {
          if (result.width && result.height) {
            var canvas = document.createElement('canvas');
            var scale = Math.min(1, 320 / Math.max(result.width, result.height));
            canvas.width = Math.max(1, Math.round(result.width * scale));
            canvas.height = Math.max(1, Math.round(result.height * scale));
            var ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              result.thumb = canvas.toDataURL('image/jpeg', 0.7);
            }
          }
        } catch (e) { /* cynic: بعضی مرورگرها اجازه نمی‌دهند */ }
        resolve(result);
      }

      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = function () {
        result.duration = video.duration || 0;
        result.width = video.videoWidth || 0;
        result.height = video.videoHeight || 0;
        /* برای گرفتن فریم، باید کمی جلو برویم */
        try { video.currentTime = Math.min(0.2, (video.duration || 1) / 10); } catch (e) { finish(); }
      };
      video.onseeked = finish;
      video.onerror = finish;
      setTimeout(finish, 4000);
      video.src = url;
    });
  }

  /**
   * آماده‌سازی نهایی یک فایل پیش از افزودن به فرم:
   * نوع‌سنجی، فشرده‌سازی عکس، سنجش طول فیلم و ساخت پیش‌نمایش.
   */
  function prepareFile(file, options) {
    options = options || {};
    var cfg = currentLimits();

    if (!file || typeof file.size !== 'number') {
      return Promise.reject(new Error('فایل نامعتبر است.'));
    }

    var kind = isVideo(file) ? 'video' : (isImage(file) ? 'image' : '');
    if (!kind) {
      return Promise.reject(new Error('فقط عکس (JPG/PNG/WEBP) یا فیلم (MP4/MOV/WEBM) قابل بارگذاری است.'));
    }

    if (kind === 'video' && exceedsServerLimit(file)) {
      var info = currentServerLimits() || {};
      var maxMb = Math.round((info.post_max_size || 0) / (1024 * 1024));
      return Promise.reject(new Error('این فیلم از سقف بارگذاری سرور (' + maxMb + ' مگابایت) بزرگ‌تر است؛ فیلم کوتاه‌تر یا کم‌کیفیت‌تری بگیرید.'));
    }

    var pipeline = kind === 'image' ? compressImage(file) : Promise.resolve(file);

    return pipeline.then(function (prepared) {
      var size = prepared.size || 0;
      var limit = kind === 'image' ? cfg.max_image_bytes : cfg.max_video_bytes;

      if (kind === 'image' && size > limit) {
        throw new Error('حجم عکس پس از فشرده‌سازی هم بیش از حد مجاز است (' + humanSize(limit) + ').');
      }
      if (kind === 'video' && size > limit) {
        throw new Error('حجم فیلم بیش از حد مجاز است (' + humanSize(limit) + '). فیلمی کوتاه‌تر بگیرید.');
      }

      if (kind !== 'video') {
        return loadImageElement(prepared).then(function (res) {
          var thumbUrl = res.url;
          var item = {
            id: uniqueId(),
            kind: 'image',
            file: prepared,
            size: size,
            originalSize: file.size,
            name: prepared.name || file.name || 'photo.jpg',
            thumb: thumbUrl,
            isObjectUrl: true,
            width: res.img.naturalWidth || 0,
            height: res.img.naturalHeight || 0,
            duration: 0,
            source: options.source || 'gallery'
          };
          return item;
        }).catch(function () {
          return {
            id: uniqueId(), kind: 'image', file: prepared, size: size,
            originalSize: file.size, name: prepared.name || 'photo.jpg',
            thumb: '', width: 0, height: 0, duration: 0, source: options.source || 'gallery'
          };
        });
      }

      return probeVideo(prepared).then(function (info) {
        var seconds = Math.round(info.duration || 0);
        if (seconds && cfg.max_video_seconds && seconds > cfg.max_video_seconds + 3) {
          throw new Error('طول فیلم باید حداکثر ' + cfg.max_video_seconds + ' ثانیه باشد (فیلم شما ' + seconds + ' ثانیه است).');
        }
        return {
          id: uniqueId(),
          kind: 'video',
          file: prepared,
          size: size,
          originalSize: file.size,
          name: prepared.name || file.name || 'video.mp4',
          thumb: info.thumb || '',
          previewUrl: info.url,
          isObjectUrl: !!info.url,
          width: info.width || 0,
          height: info.height || 0,
          duration: seconds,
          source: options.source || 'camera'
        };
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۴) گرفتن عکس/فیلم با دوربین داخل اپ (Live Camera)
     ═══════════════════════════════════════════════════════════════════════ */

  function cameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder !== undefined);
  }

  function cameraAvailable() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    /* getUserMedia فقط در «زمینه‌ی امن» (https یا localhost یا appassets) کار می‌کند */
    if (window.isSecureContext === false) return false;
    return true;
  }

  function pickFile(mode, options) {
    options = options || {};
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.setAttribute('accept', mode === 'video' ? 'video/*' : 'image/*');
      if (options.capture !== false) input.setAttribute('capture', mode === 'video' ? 'camcorder' : 'environment');
      if (options.multiple) input.setAttribute('multiple', 'multiple');
      document.body.appendChild(input);

      var settled = false;
      function done(files) {
        if (settled) return;
        settled = true;
        try { input.remove(); } catch (e) {}
        var list = [];
        for (var i = 0; i < (files || []).length; i++) list.push(files[i]);
        resolve(list);
      }

      input.addEventListener('change', function () { done(input.files); });
      /* اگر کاربر پنجره را ببندد، change رخ نمی‌دهد؛ با focus برمی‌گردیم */
      window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(function () { done(input.files); }, 800);
      });

      try { input.click(); } catch (e) { done([]); }
    });
  }

  function buildCameraOverlay() {
    var el = document.createElement('div');
    el.id = 'eplakCameraOverlay';
    el.setAttribute('dir', 'rtl');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483000', 'background:#04070f',
      'display:flex', 'flex-direction:column', 'font-family:inherit'
    ].join(';');

    el.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;color:#e2e8f0;">',
      '  <button type="button" data-act="close" aria-label="بستن" style="background:rgba(255,255,255,.08);border:0;color:#e2e8f0;font-size:20px;width:40px;height:40px;border-radius:50%;cursor:pointer;">✕</button>',
      '  <div style="font-size:14px;font-weight:700;" data-role="title">دوربین</div>',
      '  <button type="button" data-act="switch" aria-label="تغییر دوربین" style="background:rgba(255,255,255,.08);border:0;color:#e2e8f0;font-size:18px;width:40px;height:40px;border-radius:50%;cursor:pointer;">🔄</button>',
      '</div>',
      '<div style="position:relative;flex:1;min-height:0;overflow:hidden;background:#000;">',
      '  <video data-role="preview" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block;"></video>',
      '  <img data-role="shot" alt="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;">',
      '  <div data-role="timer" style="display:none;position:absolute;top:14px;right:14px;background:rgba(239,68,68,.9);color:#fff;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700;direction:ltr;">00:00</div>',
      '  <div data-role="hint" style="position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#cbd5e1;font-size:12px;text-shadow:0 1px 3px #000;padding:0 16px;"></div>',
      '</div>',
      '<div style="padding:18px 16px 26px;background:#0b1120;">',
      '  <div data-role="error" style="display:none;color:#fca5a5;font-size:13px;text-align:center;line-height:1.9;margin-bottom:12px;"></div>',
      '  <div style="display:flex;align-items:center;justify-content:space-around;gap:10px;">',
      '    <button type="button" data-act="gallery" style="background:rgba(255,255,255,.08);border:0;color:#e2e8f0;font-size:12px;padding:10px 12px;border-radius:12px;cursor:pointer;">گالری</button>',
      '    <button type="button" data-act="shutter" style="width:74px;height:74px;border-radius:50%;border:4px solid rgba(255,255,255,.35);background:#00c9a7;cursor:pointer;box-shadow:0 0 0 4px rgba(0,201,167,.25);"></button>',
      '    <button type="button" data-act="mode" style="background:rgba(255,255,255,.08);border:0;color:#e2e8f0;font-size:12px;padding:10px 12px;border-radius:12px;cursor:pointer;">فیلم</button>',
      '  </div>',
      '  <div data-role="review" style="display:none;gap:10px;margin-top:14px;">',
      '    <button type="button" data-act="retake" style="flex:1;background:rgba(255,255,255,.1);border:0;color:#e2e8f0;padding:12px;border-radius:12px;cursor:pointer;font-weight:700;">تکرار</button>',
      '    <button type="button" data-act="use" style="flex:1;background:#00c9a7;border:0;color:#04211c;padding:12px;border-radius:12px;cursor:pointer;font-weight:800;">استفاده از این</button>',
      '  </div>',
      '</div>'
    ].join('');

    return el;
  }

  /**
   * دوربین داخل اپ. mode: 'photo' | 'video'
   * @returns Promise<File|null>
   */
  function openCamera(mode, options) {
    options = options || {};
    var initialMode = mode === 'video' ? 'video' : 'photo';

    if (!cameraAvailable()) {
      /* دوربین داخل اپ ممکن نیست (http بدون TLS، مرورگر قدیمی یا عدم اجازه)
         → همان تجربه با دوربین سیستمی از طریق input capture */
      toast('دوربین داخل اپ در این حالت فعال نیست؛ دوربین گوشی باز می‌شود.');
      return pickFile(initialMode, { capture: true }).then(function (files) {
        return files.length ? files[0] : null;
      });
    }

    return new Promise(function (resolve) {
      var overlay = buildCameraOverlay();
      document.body.appendChild(overlay);

      var video = overlay.querySelector('[data-role="preview"]');
      var shotImg = overlay.querySelector('[data-role="shot"]');
      var timerEl = overlay.querySelector('[data-role="timer"]');
      var hintEl = overlay.querySelector('[data-role="hint"]');
      var errorEl = overlay.querySelector('[data-role="error"]');
      var reviewEl = overlay.querySelector('[data-role="review"]');
      var titleEl = overlay.querySelector('[data-role="title"]');
      var shutterBtn = overlay.querySelector('[data-act="shutter"]');
      var modeBtn = overlay.querySelector('[data-act="mode"]');

      var stream = null;
      var recorder = null;
      var chunks = [];
      var recordedBlob = null;
      var recordedExt = 'webm';
      var mode2 = initialMode;
      var facing = options.facing || 'environment';
      var timerId = null;
      var startedAt = 0;
      var result = null;
      var closed = false;

      function cleanup(files) {
        if (closed) return;
        closed = true;
        if (timerId) { clearInterval(timerId); timerId = null; }
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
        try {
          if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        } catch (e) {}
        try { video.srcObject = null; } catch (e) {}
        try { overlay.remove(); } catch (e) {}
        resolve(files || null);
      }

      function showError(message) {
        errorEl.style.display = 'block';
        errorEl.textContent = message;
      }

      function clearError() {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }

      function stopStream() {
        try {
          if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        } catch (e) {}
        stream = null;
      }

      function startStream() {
        stopStream();
        clearError();
        var constraints = {
          audio: mode2 === 'video',
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };
        hintEl.textContent = 'در حال روشن‌کردن دوربین…';
        return navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
          if (closed) {
            try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            return;
          }
          stream = s;
          video.srcObject = s;
          hintEl.textContent = mode2 === 'video'
            ? 'برای شروع ضبط، دکمه‌ی وسط را بزنید.'
            : 'برای گرفتن عکس، دکمه‌ی وسط را بزنید.';
          return video.play().catch(function () {});
        }).catch(function (err) {
          var name = (err && err.name) || '';
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            showError('دسترسی به دوربین داده نشد. از تنظیمات گوشی، اجازه‌ی دوربین برای این برنامه را فعال کنید یا از دکمه‌ی «گالری» استفاده کنید.');
          } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            showError('دوربینی روی این دستگاه پیدا نشد. می‌توانید از دکمه‌ی «گالری» فایل انتخاب کنید.');
          } else if (name === 'NotReadableError') {
            showError('دوربین در اختیار برنامه‌ی دیگری است. آن را ببندید و دوباره تلاش کنید.');
          } else {
            showError('روشن‌کردن دوربین ممکن نشد' + (name ? ' (' + name + ')' : '') + '. می‌توانید از «گالری» فایل انتخاب کنید.');
          }
        });
      }

      function updateModeUi() {
        titleEl.textContent = mode2 === 'video' ? 'ضبط فیلم' : 'گرفتن عکس';
        modeBtn.textContent = mode2 === 'video' ? 'عکس' : 'فیلم';
        hintEl.textContent = mode2 === 'video'
          ? 'برای شروع ضبط، دکمه‌ی وسط را بزنید.'
          : 'برای گرفتن عکس، دکمه‌ی وسط را بزنید.';
      }

      function showReview() {
        video.style.visibility = 'hidden';
        shotImg.style.display = 'block';
        reviewEl.style.display = 'flex';
        timerEl.style.display = 'none';
        hintEl.textContent = 'پیش‌نمایش — تایید یا تکرار کنید.';
      }

      function hideReview() {
        shotImg.style.display = 'none';
        shotImg.removeAttribute('src');
        video.style.visibility = 'visible';
        reviewEl.style.display = 'none';
      }

      function takePhoto() {
        if (!video.videoWidth) { toast('دوربین آماده نیست؛ کمی صبر کنید'); return; }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        shotImg.src = dataUrl;
        try {
          var byteString = atob(dataUrl.split(',')[1]);
          var buffer = new Uint8Array(byteString.length);
          for (var i = 0; i < byteString.length; i++) buffer[i] = byteString.charCodeAt(i);
          result = new File([buffer], 'photo-' + Date.now() + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
        } catch (e) {
          result = null;
        }
        /* برای عکس، دوربین را نگه می‌داریم تا «تکرار» سریع باشد */
        showReview();
      }

      function supportedVideoMime() {
        var candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4;codecs=h264,aac',
          'video/mp4'
        ];
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
        for (var i = 0; i < candidates.length; i++) {
          if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
        }
        return '';
      }

      function startRecording() {
        if (!stream) { toast('دوربین آماده نیست'); return; }
        var mime = supportedVideoMime();
        recordedExt = (mime && mime.indexOf('mp4') !== -1) ? 'mp4' : 'webm';
        try {
          recorder = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 })
            : new MediaRecorder(stream);
        } catch (e) {
          showError('ضبط فیلم در این مرورگر پشتیبانی نمی‌شود. لطفاً از «گالری» یا دوربین سیستمی استفاده کنید.');
          return;
        }
        chunks = [];
        recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          try {
            recordedBlob = new Blob(chunks, { type: (mime && mime.split(';')[0]) || 'video/webm' });
            result = new File([recordedBlob], 'video-' + Date.now() + '.' + recordedExt,
              { type: recordedBlob.type, lastModified: Date.now() });
          } catch (e) { result = null; }
        };
        recorder.start(1000);

        startedAt = Date.now();
        timerEl.style.display = 'block';
        timerEl.textContent = '00:00';
        timerId = setInterval(function () {
          var seconds = Math.floor((Date.now() - startedAt) / 1000);
          timerEl.textContent = '0' + Math.floor(seconds / 60) + ':' + ('0' + (seconds % 60)).slice(-2);
          var maxSeconds = Number(currentLimits().max_video_seconds) || 90;
          if (seconds >= maxSeconds) stopRecording();
        }, 400);
        shutterBtn.style.background = '#ef4444';
        hintEl.textContent = 'در حال ضبط…';
      }

      function stopRecording() {
        if (timerId) { clearInterval(timerId); timerId = null; }
        timerEl.style.display = 'none';
        shutterBtn.style.background = '#00c9a7';
        if (recorder && recorder.state !== 'inactive') {
          try { recorder.stop(); } catch (e) {}
        }
        setTimeout(function () {
          if (result) {
            /* پیش‌نمایش فیلم با همان فایل ضبط‌شده */
            var previewUrl = makeObjectUrl(result);
            if (previewUrl) {
              try {
                shotImg.src = previewUrl;
                showReview();
              } catch (e) {
                cleanup(result);   /* اگر پیش‌نمایش ممکن نشد، مستقیم تحویل بده */
              }
            } else {
              cleanup(result);
            }
          } else {
            hideReview();
            hintEl.textContent = 'ضبط ناموفق بود؛ دوباره تلاش کنید.';
          }
        }, 350);
      }

      overlay.addEventListener('click', function (event) {
        var btn = event.target.closest ? event.target.closest('button[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');

        if (act === 'close') { cleanup(null); return; }
        if (act === 'switch') {
          facing = facing === 'environment' ? 'user' : 'environment';
          startStream();
          return;
        }
        if (act === 'mode') {
          mode2 = mode2 === 'video' ? 'photo' : 'video';
          hideReview();
          result = null;
          updateModeUi();
          startStream();
          return;
        }
        if (act === 'gallery') {
          pickFile(mode2, { capture: false, multiple: false }).then(function (files) {
            if (files.length) cleanup(files[0]);
          });
          return;
        }
        if (act === 'shutter') {
          if (mode2 === 'video') {
            if (recorder && recorder.state === 'recording') stopRecording();
            else startRecording();
          } else {
            takePhoto();
          }
          return;
        }
        if (act === 'retake') {
          result = null;
          hideReview();
          if (!stream) startStream();
          return;
        }
        if (act === 'use') {
          if (result) cleanup(result);
          else toast('چیزی برای ارسال نیست');
          return;
        }
      });

      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape' && !closed) {
          document.removeEventListener('keydown', onKey);
          cleanup(null);
        }
      });

      updateModeUi();
      startStream();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۵) آپلود واقعی (XHR + درصد پیشرفت + تلاش مجدد)
     ═══════════════════════════════════════════════════════════════════════ */

  function uploadOne(item, options) {
    options = options || {};
    var file = item.file || item;
    var phone = options.phone || '';
    var form = new FormData();
    form.append('phone', phone);
    form.append('source', item.source || options.source || 'upload');
    if (options.reportId) form.append('report_id', String(options.reportId));
    if (item.duration) form.append('duration_ms', String(Math.round(item.duration * 1000)));
    form.append('file', file, file.name || (item.kind === 'video' ? 'video.mp4' : 'photo.jpg'));

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl('media.php'), true);
      xhr.timeout = options.timeout || 180000;
      if (xhr.upload && typeof options.onProgress === 'function') {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) {
            options.onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)), item);
          }
        };
      }
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) { data = null; }
        if (xhr.status === 413) {
          var tooBig = new Error('حجم فایل از سقف سرور بیشتر است؛ فیلم کوتاه‌تری بگیرید یا سقف سرور را بالا ببرید.');
          tooBig.status = 413;
          tooBig.retryable = false;
          reject(tooBig);
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
          var uploaded = (data.items && data.items[0]) || null;
          if (typeof options.onProgress === 'function') options.onProgress(100, item);
          resolve(uploaded);
        } else {
          var message = (data && (data.error || (data.errors && data.errors[0] && data.errors[0].error)))
            || (xhr.status === 413 ? 'حجم فایل از سقف تنظیمات سرور بیشتر است.' : 'بارگذاری ناموفق بود (کد ' + xhr.status + ').');
          var error = new Error(message);
          error.status = xhr.status;
          error.retryable = (xhr.status === 0 || xhr.status >= 500 || xhr.status === 408 || xhr.status === 429);
          reject(error);
        }
      };
      xhr.onerror = function () {
        var error = new Error('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.');
        error.retryable = true;
        reject(error);
      };
      xhr.ontimeout = function () {
        var error = new Error('زمان بارگذاری به پایان رسید؛ اتصال اینترنت کند است.');
        error.retryable = true;
        reject(error);
      };
      xhr.send(form);
    });
  }

  /**
   * آپلود یک فایل با تلاش مجدد.
   * @returns Promise<{item, uploaded, error}>
   */
  function uploadWithRetry(item, options) {
    options = options || {};
    var attempts = options.attempts || 2;
    var attempt = 0;

    function tryOnce() {
      attempt++;
      return uploadOne(item, options).catch(function (error) {
        if (attempt <= attempts && error && error.retryable) {
          var delay = 900 * attempt;
          if (typeof options.onProgress === 'function') options.onProgress(-1, item);
          return new Promise(function (resolve) { setTimeout(resolve, delay); }).then(tryOnce);
        }
        throw error;
      });
    }

    return tryOnce().then(function (uploaded) {
      return { item: item, uploaded: uploaded, error: null };
    }).catch(function (error) {
      return { item: item, uploaded: null, error: error };
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۶) صف آفلاین (IndexedDB) — فایل‌ها با برگشت اینترنت خودشان ارسال می‌شوند
     ═══════════════════════════════════════════════════════════════════════ */
  var DB_NAME = 'eplak_media_db';
  var DB_VERSION = 1;
  var STORE = 'queue';

  function idbAvailable() {
    return typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!idbAvailable()) { reject(new Error('no-idb')); return; }
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('idb-open-failed')); };
    });
  }

  function idbPut(record) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('idb-put-failed')); };
      });
    });
  }

  function idbAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error || new Error('idb-get-failed')); };
      });
    });
  }

  function idbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    });
  }

  function idbCount() {
    return idbAll().then(function (rows) { return rows.length; }).catch(function () { return 0; });
  }

  /* برای صف آفلاین، «بایت‌های» فایل ذخیره می‌شود نه خود شیء File؛ چون
     بعضی WebViewها Blob را در IndexedDB درست ذخیره/بازگردانی نمی‌کنند و
     فایل پس از بازیابی قابل ارسال نیست. */
  function readFileBytes(file) {
    if (!file) return Promise.reject(new Error('no-file'));
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(new Uint8Array(reader.result)); };
        reader.onerror = function () { reject(reader.error || new Error('read-failed')); };
        reader.readAsArrayBuffer(file);
      } catch (e) { reject(e); }
    });
  }

  function bytesToFile(bytes, name, type) {
    try {
      if (!bytes || typeof Blob === 'undefined') return null;
      var blob = new Blob([bytes], { type: type || 'application/octet-stream' });
      if (typeof File === 'function') {
        return new File([blob], name || 'media', { type: blob.type || type || '', lastModified: Date.now() });
      }
      blob.name = name || 'media';
      return blob;
    } catch (e) { return null; }
  }

  function isRealBlob(value) {
    if (!value) return false;
    try { return typeof Blob !== 'undefined' && value instanceof Blob; } catch (e) { return false; }
  }

  function enqueue(item, options) {
    options = options || {};
    if (!idbAvailable()) return Promise.resolve(false);
    return readFileBytes(item.file).then(function (bytes) {
      var record = {
        id: item.id || uniqueId(),
        bytes: bytes,
        name: item.name || (item.file && item.file.name) || 'media',
        type: (item.file && item.file.type) || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        kind: item.kind || 'image',
        size: item.size || bytes.length || 0,
        thumb: (item.thumb && item.thumb.indexOf('data:') === 0) ? item.thumb : '',
        duration: item.duration || 0,
        phone: options.phone || '',
        reportId: options.reportId || null,
        source: item.source || 'upload',
        createdAt: Date.now(),
        tries: 0
      };
      return idbPut(record).then(function () { return true; });
    }).then(function (ok) {
      updatePendingBadge();
      try { notifyQueue(null); } catch (e) { /* بی‌اهمیت */ }
      return ok;
    }).catch(function () { return false; });
  }

  var listeners = [];

  function notifyQueue(rows) {
    listeners.forEach(function (fn) {
      try { fn(rows || []); } catch (e) {}
    });
  }

  function onQueueChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function updatePendingBadge() {
    idbCount().then(function (count) {
      try {
        document.querySelectorAll('[data-media-pending-count]').forEach(function (el) {
          el.textContent = count > 0 ? String(count) : '';
          el.style.display = count > 0 ? 'inline-flex' : 'none';
        });
      } catch (e) {}
    });
  }

  function runFlush(options) {
    return idbAll().then(function (rows) {
      if (!rows.length) return { sent: 0, failed: 0 };

      var sent = 0;
      var failed = 0;

      return rows.reduce(function (chain, record) {
        return chain.then(function () {
          /* رکوردهای بدون شماره (مثلاً تخلیه‌ی خودکار پیش از ورود) نباید
             «تلاش ناموفق» شمرده شوند؛ وگرنه پس از ۱۲ بار پاک می‌شدند. */
          if (!record.phone) return null;
          var queuedFile = record.bytes ? bytesToFile(record.bytes, record.name, record.type) : (isRealBlob(record.file) ? record.file : null);
          if (!queuedFile) {
            /* فایل قابل بازسازی نیست (رکورد قدیمی) — در صف بماند تا پاک نشود */
            return null;
          }
          var queuedItem = {
            id: record.id, kind: record.kind, file: queuedFile, name: record.name,
            size: record.size, duration: record.duration, source: record.source
          };
          return uploadWithRetry(queuedItem, {
            phone: record.phone,
            reportId: record.reportId || null,
            source: record.source || 'upload',
            attempts: 1,
            onProgress: options.onProgress ? function (p, it) { options.onProgress(p, it, record); } : undefined
          }).then(function (res) {
            if (res.uploaded) {
              sent++;
              return idbDelete(record.id).then(function () {
                try {
                  window.dispatchEvent(new CustomEvent('eplak:media-uploaded', {
                    detail: { record: record, uploaded: res.uploaded }
                  }));
                } catch (e) {}
              });
            }
            failed++;
            record.tries = (record.tries || 0) + 1;
            if (record.tries >= 12) {
              return idbDelete(record.id);      /* پس از تلاش‌های زیاد، دیگر تکرار نکن */
            }
            return idbPut(record);
          });
        });
      }, Promise.resolve()).then(function () {
        updatePendingBadge();
        return { sent: sent, failed: failed };
      });
    }).catch(function (error) {
      try {
        console.warn('[EplakMedia] تخلیه‌ی صف ناموفق بود:', (error && (error.name + ': ' + error.message)) || error, error && error.stack);
      } catch (e) { /* بی‌اهمیت */ }
      return { sent: 0, failed: 0, error: error };
    });
  }

  /* صف تخلیه‌ی پیاپی: اگر یک تخلیه در جریان باشد، درخواست بعدی به‌جای
     «نادیده گرفته شدن»، پشت همان زنجیره اجرا می‌شود (باگ: درخواست دوم
     بی‌صدا حذف می‌شد و فایل در صف جا می‌ماند). */
  var flushChain = Promise.resolve({ sent: 0, failed: 0 });

  function flushQueue(options) {
    options = options || {};
    if (!idbAvailable()) return Promise.resolve({ sent: 0, failed: 0 });
    flushChain = flushChain.then(
      function () { return runFlush(options); },
      function () { return runFlush(options); }
    );
    return flushChain;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۷) آپلود عکس پروفایل (Avatar)
     ═══════════════════════════════════════════════════════════════════════ */
  function uploadAvatar(file, phone) {
    if (!file) return Promise.reject(new Error('فایلی انتخاب نشد.'));
    if (!isImage(file)) return Promise.reject(new Error('لطفاً یک فایل تصویری انتخاب کنید.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('حجم عکس باید کمتر از ۱۲ مگابایت باشد.'));

    /* نسخه‌ی کوچک مربعی برای پروفایل (۴۰۰ پیکسل) — سبک و همیشه قابل نمایش */
    return compressForAvatar(file).then(function (small) {
      var item = { id: uniqueId(), kind: 'image', file: small, name: small.name || 'avatar.jpg', source: 'avatar' };
      return uploadOne(item, { phone: phone, source: 'avatar' });
    });
  }

  function compressForAvatar(file) {
    if (typeof document === 'undefined') return Promise.resolve(file);
    return loadImageElement(file).then(function (res) {
      var img = res.img;
      var size = 400;
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) { releaseObjectUrl(res.url); return file; }
      var side = Math.min(w, h);
      var sx = (w - side) / 2;
      var sy = (h - side) / 2;
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      if (!ctx) { releaseObjectUrl(res.url); return file; }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(res.url);
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', 0.85);
      });
    }).catch(function () { return file; });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۸) راه‌اندازی خودکار: ارسال صف با برگشت اینترنت
     ═══════════════════════════════════════════════════════════════════════ */
  function autoFlush() {
    if (!idbAvailable()) return;
    var run = function () {
      flushQueue({}).then(function (result) {
        if (result && result.sent > 0) {
          toast('✅ ' + result.sent + ' فایل در صف، با موفقیت بارگذاری شد');
        }
      });
    };
    window.addEventListener('online', function () { setTimeout(run, 1200); });
    if (document.readyState === 'complete') setTimeout(run, 2500);
    else document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 2500); });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ۹) تنظیم آدرس سرور (برای اپ اندروید و نصب‌های جداشده)
     ═══════════════════════════════════════════════════════════════════════ */
  function askForServerAddress(options) {
    options = options || {};
    return new Promise(function (resolve) {
      var current = apiBase() || '';
      var wrap = document.createElement('div');
      wrap.dir = 'rtl';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(4,7,15,.82);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
      wrap.innerHTML = [
        '<div style="background:#0b1120;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:20px;max-width:420px;width:100%;color:#e2e8f0;">',
        '  <div style="font-size:15px;font-weight:800;margin-bottom:8px;">آدرس سرور سامانه</div>',
        '  <div style="font-size:12.5px;line-height:2;color:#94a3b8;margin-bottom:12px;">برای ارسال عکس و فیلم، آدرس سرویس‌دهی (پوشه‌ی api) را وارد کنید. مثال: <span style="direction:ltr;display:inline-block;">https://eplak.ir/eplak-fixed/api</span></div>',
        '  <input data-role="input" type="url" inputmode="url" placeholder="https://example.com/eplak-fixed/api" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#0f172a;color:#e2e8f0;direction:ltr;font-size:13px;" value="' + current.replace(/"/g, '&quot;') + '">',
        '  <div data-role="msg" style="display:none;color:#fca5a5;font-size:12px;margin-top:8px;"></div>',
        '  <div style="display:flex;gap:10px;margin-top:14px;">',
        '    <button type="button" data-act="cancel" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#e2e8f0;cursor:pointer;">انصراف</button>',
        '    <button type="button" data-act="save" style="flex:1;padding:12px;border-radius:12px;border:0;background:#00c9a7;color:#04211c;font-weight:800;cursor:pointer;">ذخیره</button>',
        '  </div>',
        '</div>'
      ].join('');
      document.body.appendChild(wrap);

      var input = wrap.querySelector('[data-role="input"]');
      var msg = wrap.querySelector('[data-role="msg"]');

      function close(value) {
        try { wrap.remove(); } catch (e) {}
        resolve(value);
      }

      wrap.addEventListener('click', function (event) {
        var btn = event.target.closest ? event.target.closest('button[data-act]') : null;
        if (!btn) return;
        if (btn.getAttribute('data-act') === 'cancel') { close(null); return; }
        var value = (input.value || '').trim();
        if (!value) { msg.style.display = 'block'; msg.textContent = 'آدرس را وارد کنید.'; return; }
        if (!/^https?:\/\//i.test(value)) { msg.style.display = 'block'; msg.textContent = 'آدرس باید با http:// یا https:// شروع شود.'; return; }
        setApiBase(value);
        fetchLimits().then(function () { close(apiBase()); });
      });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 120);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     خروجی عمومی
     ═══════════════════════════════════════════════════════════════════════ */
  window.EplakMedia = {
    version: 1,
    /* آدرس سرور */
    apiBase: apiBase,
    apiUrl: apiUrl,
    absoluteUrl: absoluteUrl,
    setApiBase: setApiBase,
    askForServerAddress: askForServerAddress,
    /* تنظیمات و کمکی‌ها */
    fetchLimits: fetchLimits,
    limits: currentLimits,
    serverLimits: currentServerLimits,
    exceedsServerLimit: exceedsServerLimit,
    humanSize: humanSize,
    isImage: isImage,
    isVideo: isVideo,
    uniqueId: uniqueId,
    /* آماده‌سازی فایل */
    prepareFile: prepareFile,
    compressImage: compressImage,
    probeVideo: probeVideo,
    /* دوربین و گالری */
    cameraAvailable: cameraAvailable,
    cameraSupported: cameraSupported,
    openCamera: openCamera,
    pickFile: pickFile,
    /* آپلود */
    uploadOne: uploadOne,
    uploadWithRetry: uploadWithRetry,
    uploadAvatar: uploadAvatar,
    /* صف آفلاین */
    enqueue: enqueue,
    flushQueue: flushQueue,
    queueCount: idbCount,
    onQueueChange: onQueueChange,
    updatePendingBadge: updatePendingBadge,
    idbAvailable: idbAvailable
  };

  /* محدودیت‌ها را یک‌بار از سرور می‌گیریم (بی‌صدا؛ اگر نشد پیش‌فرض‌ها می‌مانند) */
  try {
    if (apiBase()) fetchLimits();
  } catch (e) {}

  autoFlush();
})();
