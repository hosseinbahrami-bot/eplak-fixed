/* ============================================================================
   assets/js/ep-map.js — نقشه‌ی موقعیت ای‌پلاک (چندمنبعی، بدون وابستگی خارجی)

   چرا نقشه پیش‌تر دیده نمی‌شد؟
   ۱) کاشی‌ها فقط از tile.openstreetmap.org گرفته می‌شد؛ این سرور به درخواست
      بدون Referer معتبر (مثل WebView اپ که صفحه را با file:///android_asset
      باز می‌کند) کد ۴۰۳ می‌دهد.
   ۲) دسترسی مستقیم گوشی به سرورهای کاشی خارجی در ایران کند/بسته است.

   راه‌حل این نسخه (همان کاری که اسنپ و نشان می‌کنند: داده‌ی OpenStreetMap،
   ولی سرو شدن از سرور داخل کشور):
   • کاشی‌ها اول از «سرور خودمان» گرفته می‌شوند: api/maptile.php — این مسیر
     همان مسیری است که آپلود عکس/فیلم با آن کار می‌کند، پس در اپ هم باز است.
   • سرور، کاشی را از چند منبع (Esri، کارتو، OSM فرانسه، OSM، ویکی‌مدیا)
     می‌گیرد و روی دیسک کش می‌کند؛ اگر منبعی جواب نداد، منبع بعدی.
   • اگر کلید رایگان «نشان» در پنل مدیریت وارد شود، نقشه‌ی خودِ نشان با
     برچسب فارسی هم به فهرست منابع اضافه می‌شود.
   • اگر پروکسی در دسترس نبود (مثلاً سرور هنوز به‌روز نشده)، اپ خودکار به
     گرفتن مستقیم کاشی از منابع آزاد برمی‌گردد.
   • کاربر می‌تواند با دکمه‌ی «منبع نقشه» بین منابع جابه‌جا شود و با دکمه‌ی
     «ماهواره» نمای ماهواره‌ای بگیرد؛ انتخاب موفق در گوشی به خاطر سپرده
     می‌شود تا دفعه‌ی بعد نقشه فوراً باز شود.

   نحوه‌ی استفاده (بدون تغییر نسبت به قبل):
     const map = EplakMap.create(document.getElementById('reportMapPicker'), {
        lat: 35.3242, lng: 51.6455, zoom: 16, draggable: true,
        onChange: (pos) => { ... }
     });
     map.setPosition(35.3242, 51.6455);
     const pos = map.getPosition();
     const addr = await EplakMap.reverseGeocode(lat, lng);

   نکته‌ی مهم: اگر هیچ منبعی باز نشود هم کار ثبت درخواست نمی‌خوابد — مختصات
   ثبت می‌شود و در پنل ادمین نمایش داده می‌شود.
   ============================================================================ */
(function (global) {
  'use strict';

  /* ── منابع نقشه ────────────────────────────────────────────────────────
     direct = آدرس مستقیم کاشی (وقتی پروکسی سرور در دسترس نیست)
     proxy  = همان کاشی از راه api/maptile.php سرور خودمان                  */
  var SOURCES = [
    { id: 'esri',      label: 'خیابان (Esri)',   kind: 'xyz',    attrib: '© Esri, OpenStreetMap',
      direct: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' },
    { id: 'esri_sat',  label: 'ماهواره',          kind: 'xyz',    attrib: '© Esri, Maxar, Earthstar Geographics',
      direct: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    { id: 'esri_topo', label: 'توپوگرافی',        kind: 'xyz',    attrib: '© Esri',
      direct: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' },
    { id: 'carto',     label: 'کارتو',            kind: 'xyz',    attrib: '© OpenStreetMap, © CARTO',
      direct: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png' },
    { id: 'osmfr',     label: 'OSM فرانسه',       kind: 'xyz',    attrib: '© OpenStreetMap France',
      direct: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png' },
    { id: 'osm',       label: 'OpenStreetMap',    kind: 'xyz',    attrib: '© OpenStreetMap',
      direct: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
    { id: 'wikimedia', label: 'ویکی‌مدیا',         kind: 'xyz',    attrib: '© OpenStreetMap, Wikimedia',
      direct: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png' },
    /* نقشه‌ی نشان: فقط وقتی کلید رایگان در پنل مدیریت وارد شده باشد آماده است
       (از سرور config گرفته می‌شود). این منبع «یک تصویر برای کل کادر» است. */
    { id: 'neshan',    label: 'نشان (فارسی)',     kind: 'static', attrib: '© نشان', direct: '' }
  ];

  /* ترتیب امتحان کردن منابع (اول آن‌هایی که در ایران/WebView مطمئن‌ترند) */
  var DEFAULT_ORDER = ['esri', 'carto', 'osmfr', 'esri_topo', 'osm', 'wikimedia'];
  var SAT_ID = 'esri_sat';

  var TILE_SIZE = 256;
  var MIN_ZOOM = 3;
  var MAX_ZOOM = 19;
  var STYLE_ID = 'epMapStyles';
  var MAX_TILE_ERRORS = 3;     /* بعد از این تعداد خطای پشت‌سرهم → منبع بعدی */
  var PREFS_KEY = 'eplakMapPrefs';
  var CONFIG_KEY = 'eplakMapConfig';
  var CONFIG_TTL = 6 * 3600 * 1000;   /* ۶ ساعت */

  /* ── ابزارهای کوچک ─────────────────────────────────────────────────── */
  function apiBase() {
    try {
      if (typeof global.eplakApiBase === 'function') {
        var value = global.eplakApiBase();
        if (value) return String(value).replace(/\/+$/, '');
      }
    } catch (e) {}
    if (typeof global.EPLAK_API_BASE_URL === 'string' && global.EPLAK_API_BASE_URL) {
      return String(global.EPLAK_API_BASE_URL).replace(/\/+$/, '');
    }
    try {
      if (global.location && global.location.protocol === 'file:') return 'https://eplak.ir/eplak-fixed/api';
      /* صفحه‌های پنل ادمین داخل پوشه‌ی admin/ هستند؛ API یک پوشه بالاتر است */
      var path = String((global.location && global.location.pathname) || '');
      if (path.indexOf('/admin/') !== -1 || /\/admin\/[^\/]*$/.test(path)) return '../api';
    } catch (e) {}
    return 'api';
  }

  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function readJson(key) {
    var store = storage();
    if (!store) return null;
    try {
      var raw = store.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return (data && typeof data === 'object') ? data : null;
    } catch (e) { return null; }
  }

  function writeJson(key, value) {
    var store = storage();
    if (!store) return;
    try { store.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function sourceById(id) {
    for (var i = 0; i < SOURCES.length; i++) {
      if (SOURCES[i].id === id) return SOURCES[i];
    }
    return null;
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function fillTemplate(tpl, vars) {
    return String(tpl || '')
      .replace(/\{z\}/g, vars.z)
      .replace(/\{x\}/g, vars.x)
      .replace(/\{y\}/g, vars.y);
  }

  /* ── وضعیت مشترک همه‌ی نقشه‌های صفحه ─────────────────────────────────── */
  var runtime = {
    config: null,          /* پاسخ api/maptile.php?action=config */
    configAsked: false,
    proxy: true,           /* کاشی از سرور خودمان گرفته شود؟ */
    src: '',               /* منبع انتخاب‌شده ('' یعنی خودکار) */
    sat: false,            /* نمای ماهواره */
    listeners: []          /* نقشه‌های باز (برای به‌روزرسانی پس از رسیدن config) */
  };

  var prefs = readJson(PREFS_KEY) || {};
  if (prefs && typeof prefs === 'object') {
    runtime.proxy = prefs.proxy !== false;
    runtime.src = (typeof prefs.src === 'string' && prefs.src) ? prefs.src : '';
    runtime.sat = !!prefs.sat;
  }
  var cachedConfig = readJson(CONFIG_KEY);
  if (cachedConfig && cachedConfig.at && (Date.now() - cachedConfig.at) < CONFIG_TTL && cachedConfig.data) {
    runtime.config = cachedConfig.data;
  }

  function savePrefs() {
    writeJson(PREFS_KEY, { proxy: runtime.proxy, src: runtime.src, sat: runtime.sat, at: Date.now() });
  }

  function notifyMaps() {
    runtime.listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  }

  /* کدام منابع «آماده» هستند؟ (نشان فقط با کلید، از پاسخ سرور) */
  function readySources() {
    var serverList = (runtime.config && Array.isArray(runtime.config.sources)) ? runtime.config.sources : null;
    if (serverList) {
      return serverList.map(function (item) { return item && item.id; }).filter(Boolean);
    }
    return DEFAULT_ORDER.concat([SAT_ID]);
  }

  function sourceOrder() {
    var order = (runtime.config && Array.isArray(runtime.config.order) && runtime.config.order.length)
      ? runtime.config.order.slice()
      : DEFAULT_ORDER.slice();
    /* «نشان» اگر آماده باشد، اولویت اول است (برچسب فارسی و سرور داخل کشور) */
    if (runtime.config && Array.isArray(runtime.config.sources)) {
      var hasNeshan = runtime.config.sources.some(function (item) { return item && item.id === 'neshan'; });
      if (hasNeshan && order.indexOf('neshan') === -1) order.unshift('neshan');
    }
    return order;
  }

  function isStaticSource(id) {
    var found = sourceById(id);
    if (found && found.kind === 'static') return true;
    if (runtime.config && Array.isArray(runtime.config.sources)) {
      for (var i = 0; i < runtime.config.sources; i++) {
        if (runtime.config.sources[i] && runtime.config.sources[i].id === id) {
          return runtime.config.sources[i].kind === 'static';
        }
      }
    }
    return false;
  }

  /* فهرست تلاش‌ها: اول پروکسی سرور خودمان، بعد گرفتن مستقیم از منابع آزاد */
  function attemptList() {
    var order = sourceOrder();
    var list = [];
    if (runtime.sat) {
      return [{ proxy: true, src: SAT_ID }, { proxy: false, src: SAT_ID }];
    }
    if (runtime.proxy) {
      list.push({ proxy: true, src: runtime.src || 'auto' });
      order.slice(0, 2).forEach(function (id) {
        if (id !== runtime.src) list.push({ proxy: true, src: id });
      });
    }
    order.forEach(function (id) { list.push({ proxy: false, src: id }); });
    if (runtime.src) list.push({ proxy: false, src: runtime.src });
    /* حذف تکراری‌ها */
    var seen = {};
    return list.filter(function (item) {
      var key = (item.proxy ? 'p:' : 'd:') + item.src;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function tileUrlFor(attempt, z, x, y) {
    if (attempt.proxy) {
      return apiBase() + '/maptile.php?src=' + encodeURIComponent(attempt.src)
        + '&z=' + z + '&x=' + x + '&y=' + y;
    }
    var found = sourceById(attempt.src);
    if (!found || !found.direct) return '';
    return fillTemplate(found.direct, { z: z, x: x, y: y });
  }

  function staticUrlFor(src, lat, lng, z, w, h) {
    return apiBase() + '/maptile.php?action=static&src=' + encodeURIComponent(src)
      + '&lat=' + lat.toFixed(5) + '&lng=' + lng.toFixed(5)
      + '&z=' + z + '&w=' + Math.max(120, Math.min(1200, Math.round(w)))
      + '&h=' + Math.max(120, Math.min(1200, Math.round(h)));
  }

  function attribFor(src) {
    var found = sourceById(src);
    if (found && found.attrib) return found.attrib;
    if (runtime.config && Array.isArray(runtime.config.sources)) {
      for (var i = 0; i < runtime.config.sources; i++) {
        if (runtime.config.sources[i] && runtime.config.sources[i].id === src) {
          return runtime.config.sources[i].attrib || '© نقشه';
        }
      }
    }
    return '© OpenStreetMap';
  }

  function labelFor(src) {
    if (src === 'auto') return 'خودکار';
    var found = sourceById(src);
    if (found) return found.label;
    if (runtime.config && Array.isArray(runtime.config.sources)) {
      for (var i = 0; i < runtime.config.sources; i++) {
        if (runtime.config.sources[i] && runtime.config.sources[i].id === src) return runtime.config.sources[i].label;
      }
    }
    return 'نقشه';
  }

  /* یک‌بار از سرور می‌پرسیم کدام منابع آماده‌اند (کلید نشان، منبع پیش‌فرض) */
  function loadConfig(force) {
    if (runtime.configAsked && !force) return Promise.resolve(runtime.config);
    runtime.configAsked = true;
    if (typeof global.fetch !== 'function') return Promise.resolve(null);
    var url = apiBase() + '/maptile.php?action=config';
    var options = { headers: { 'Accept': 'application/json' } };
    var timer = null;
    if (typeof global.AbortController === 'function') {
      var controller = new global.AbortController();
      options.signal = controller.signal;
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, 8000);
    }
    return global.fetch(url, options)
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (!data || data.success !== true) { runtime.config = null; return null; }
        runtime.config = data;
        writeJson(CONFIG_KEY, { at: Date.now(), data: data });
        /* اگر منبع پیش‌فرض سرور چیز خاصی است و کاربر انتخابی نکرده، همان را بگیر */
        if (!runtime.src && data['default'] && data['default'] !== 'auto') runtime.src = data['default'];
        notifyMaps();
        return data;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        runtime.config = null;
        return null;
      });
  }

  /* ── استایل‌ها یک‌بار به صفحه اضافه می‌شوند (هم اپ، هم پنل ادمین) ── */
  function injectStyles() {
    if (global.document && typeof global.document.getElementById === 'function'
        && global.document.getElementById(STYLE_ID)) return;
    var style = global.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ep-map{position:relative;overflow:hidden;border-radius:14px;background:#dfe6ee;',
      '  touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;}',
      '.ep-map.ep-map-dragging{cursor:grabbing;}',
      '.ep-map-tiles{position:absolute;inset:0;}',
      '.ep-map-tiles img{position:absolute;width:256px;height:256px;border:0;pointer-events:none;',
      '  -webkit-user-drag:none;user-select:none;}',
      '.ep-map-static{position:absolute;left:0;top:0;border:0;pointer-events:none;max-width:none;',
      '  -webkit-user-drag:none;user-select:none;}',
      '.ep-map-dark .ep-map-tiles img{filter:brightness(0.72) saturate(0.85) hue-rotate(180deg) invert(0.92);}',
      '.ep-map-dark .ep-map-static{filter:brightness(0.72) saturate(0.85) hue-rotate(180deg) invert(0.92);}',
      '.ep-map-fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;',
      '  flex-direction:column;gap:6px;text-align:center;padding:12px;background:linear-gradient(135deg,#16233c,#0d1527);',
      '  color:#cbd5e1;font-size:11.5px;line-height:1.9;}',
      '.ep-map-fallback.show{display:flex;}',
      '.ep-map-fallback .ep-map-coords{direction:ltr;font-weight:700;color:#00C9A7;font-size:12.5px;}',
      '.ep-map-fallback button{margin-top:4px;padding:6px 14px;border:1px solid rgba(0,201,167,0.5);border-radius:10px;',
      '  background:rgba(0,201,167,0.14);color:#00C9A7;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;}',
      '.ep-map-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;',
      '  filter:drop-shadow(0 6px 10px rgba(239,68,68,0.45));z-index:3;}',
      '.ep-map-pin svg{display:block;}',
      '.ep-map-crosshair{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;',
      '  border-radius:50%;border:2px solid rgba(0,201,167,0.9);box-shadow:0 0 0 6px rgba(0,201,167,0.18);z-index:2;}',
      '.ep-map-attrib{position:absolute;left:6px;bottom:6px;z-index:4;background:rgba(13,21,39,0.62);',
      '  color:#e2e8f0;font-size:9.5px;padding:2px 7px;border-radius:8px;text-decoration:none;}',
      '.ep-map-tools{position:absolute;left:6px;top:8px;z-index:4;display:flex;gap:6px;}',
      '.ep-map-tools button{border:1px solid rgba(255,255,255,0.28);background:rgba(13,21,39,0.72);color:#fff;',
      '  font-family:inherit;font-size:10px;font-weight:700;padding:5px 9px;border-radius:10px;cursor:pointer;',
      '  display:flex;align-items:center;gap:4px;}',
      '.ep-map-tools button.on{background:rgba(0,201,167,0.85);border-color:rgba(0,201,167,0.9);color:#04231d;}',
      '.ep-map-tools button svg{display:block;}',
      '.ep-map-zoom{position:absolute;right:8px;top:8px;z-index:4;display:flex;flex-direction:column;gap:6px;}',
      '.ep-map-zoom button{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);',
      '  background:rgba(13,21,39,0.72);color:#fff;font-size:17px;font-weight:800;line-height:1;cursor:pointer;}',
      '.ep-map-zoom button:active{transform:scale(0.94);}',
      '.ep-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      '  z-index:2;background:rgba(223,230,238,0.65);font-size:12px;color:#334155;}'
    ].join('');
    (global.document.head || global.document.documentElement).appendChild(style);
  }

  /* ── تبدیل‌های ریاضی نقشه (Web Mercator) ───────────────────────────── */
  function lngToWorldX(lng, zoom) {
    return (lng + 180) / 360 * TILE_SIZE * Math.pow(2, zoom);
  }
  function latToWorldY(lat, zoom) {
    var clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    var rad = clamped * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
    return y * TILE_SIZE * Math.pow(2, zoom);
  }
  function worldXToLng(x, zoom) {
    return x / (TILE_SIZE * Math.pow(2, zoom)) * 360 - 180;
  }
  function worldYToLat(y, zoom) {
    var n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * Math.pow(2, zoom));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  /* ── ساخت یک نقشه در ظرف داده‌شده ─────────────────────────────────── */
  function create(container, options) {
    if (!container) return null;
    injectStyles();
    var opts = options || {};

    var state = {
      lat: isFiniteNumber(opts.lat) ? opts.lat : 35.3242,   /* پیش‌فرض: ورامین */
      lng: isFiniteNumber(opts.lng) ? opts.lng : 51.6455,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, isFiniteNumber(opts.zoom) ? opts.zoom : 15)),
      draggable: opts.draggable !== false,
      /* hasFix=false یعنی lat/lng فقط «مرکز اولیه‌ی نقشه» است و کاربر هنوز
         نقطه‌ای انتخاب نکرده (نشانگر پنهان می‌ماند). */
      hasFix: opts.hasFix === false ? false : (isFiniteNumber(opts.lat) && isFiniteNumber(opts.lng))
    };
    var tileCache = new Map();
    var attempts = attemptList();
    var attemptIndex = 0;
    var errorStreak = 0;
    var loadedAny = false;
    var tilesLayer, fallback, loading, toolsBox, attrib, staticImg, staticCenter;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    container.classList.add('ep-map');
    container.innerHTML = '';

    tilesLayer = global.document.createElement('div');
    tilesLayer.className = 'ep-map-tiles';
    container.appendChild(tilesLayer);

    var crosshair = global.document.createElement('div');
    crosshair.className = 'ep-map-crosshair';
    container.appendChild(crosshair);

    var pin = global.document.createElement('div');
    pin.className = 'ep-map-pin';
    pin.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#ef4444" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#ef4444" fill-opacity="0.35"/>'
      + '<circle cx="12" cy="10" r="3" fill="#ef4444"/></svg>';
    container.appendChild(pin);

    /* تا وقتی نقطه‌ای انتخاب نشده، به‌جای نشانگر یک «هدف» در مرکز دیده می‌شود
       (یعنی: نقشه را بکشید تا محل را انتخاب کنید). */
    pin.style.display = state.hasFix ? '' : 'none';
    crosshair.style.display = state.hasFix ? 'none' : '';

    fallback = global.document.createElement('div');
    fallback.className = 'ep-map-fallback';
    fallback.innerHTML = '<div style="display:flex;align-items:center;gap:6px;justify-content:center;">'
      + '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00C9A7" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21"/>'
      + '<line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/></svg>'
      + '<span>نقشه باز نشد (اینترنت یا دسترسی به سرور نقشه)</span></div>'
      + '<div class="ep-map-coords">—</div>'
      + '<div>مختصات همین‌جا ثبت می‌شود و در پنل ادمین روی نقشه نمایش داده می‌شود.</div>'
      + '<button type="button">تلاش دوباره برای نقشه</button>';
    container.appendChild(fallback);

    loading = global.document.createElement('div');
    loading.className = 'ep-map-loading';
    loading.textContent = 'در حال بارگذاری نقشه…';
    container.appendChild(loading);

    var zoomBox = global.document.createElement('div');
    zoomBox.className = 'ep-map-zoom';
    zoomBox.innerHTML = '<button type="button" aria-label="بزرگ‌نمایی">+</button>'
      + '<button type="button" aria-label="کوچک‌نمایی">−</button>';
    container.appendChild(zoomBox);

    /* ابزارها: «ماهواره» و «منبع نقشه» (برای جابه‌جایی دستی بین منابع) */
    toolsBox = global.document.createElement('div');
    toolsBox.className = 'ep-map-tools';
    toolsBox.innerHTML = '<button type="button" class="ep-map-sat" aria-label="نمای ماهواره">'
      + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>'
      + '<path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg><span>ماهواره</span></button>'
      + '<button type="button" class="ep-map-src" aria-label="منبع نقشه">'
      + '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 12 15 2 8.5"/>'
      + '<polyline points="2 15.5 12 22 22 15.5"/></svg><span>منبع</span></button>';
    container.appendChild(toolsBox);

    attrib = global.document.createElement('a');
    attrib.className = 'ep-map-attrib';
    attrib.href = 'https://www.openstreetmap.org/copyright';
    attrib.target = '_blank';
    attrib.rel = 'noopener';
    attrib.textContent = attribFor(currentSrc());
    container.appendChild(attrib);

    zoomBox.children[0].addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      setZoom(state.zoom + 1);
    });
    zoomBox.children[1].addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      setZoom(state.zoom - 1);
    });

    function currentAttempt() {
      return attempts[attemptIndex] || { proxy: runtime.proxy, src: runtime.src || 'auto' };
    }
    function currentSrc() {
      var attempt = currentAttempt();
      return attempt.src === 'auto' ? 'auto' : attempt.src;
    }

    function updateTools() {
      var satBtn = toolsBox.querySelector('.ep-map-sat');
      var srcBtn = toolsBox.querySelector('.ep-map-src');
      if (satBtn) satBtn.classList.toggle('on', !!runtime.sat || currentSrc() === SAT_ID);
      if (srcBtn) {
        var label = labelFor(currentSrc());
        var span = srcBtn.querySelector('span');
        if (span) span.textContent = (runtime.proxy ? '' : 'مستقیم • ') + label;
      }
      if (attrib) attrib.textContent = attribFor(currentSrc() === 'auto' ? 'osm' : currentSrc());
    }

    function size() {
      var rect = container.getBoundingClientRect();
      return { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    }

    function updateFallbackCoords() {
      var el = fallback.querySelector('.ep-map-coords');
      if (el) el.textContent = state.lat.toFixed(6) + ', ' + state.lng.toFixed(6);
    }

    function markLoaded() {
      loadedAny = true;
      errorStreak = 0;
      loading.style.display = 'none';
      fallback.classList.remove('show');
      /* ترکیب برنده در گوشی به خاطر سپرده می‌شود تا نقشه‌ی بعدی فوراً باز شود */
      var attempt = currentAttempt();
      if (runtime.proxy !== attempt.proxy || runtime.src !== (attempt.src === 'auto' ? '' : attempt.src)) {
        runtime.proxy = attempt.proxy;
        runtime.src = attempt.src === 'auto' ? '' : attempt.src;
        savePrefs();
        notifyMaps();
      }
    }

    /* اگر یک منبع چند کاشی پشت‌سرهم خطا داد، منبع/مسیر بعدی امتحان می‌شود */
    function nextAttempt(reason) {
      if (loadedAny && attemptIndex > 0) return;    /* نقشه کار می‌کند؛ دست نزن */
      errorStreak = 0;
      attemptIndex++;
      if (attemptIndex >= attempts.length) {
        loading.style.display = 'none';
        fallback.classList.add('show');
        updateFallbackCoords();
        return;
      }
      tilesLayer.innerHTML = '';
      staticImg = null;
      staticCenter = null;
      loading.style.display = '';
      loading.textContent = 'در حال بارگذاری نقشه…';
      fallback.classList.remove('show');
      updateTools();
      renderTiles();
    }

    /* ── نمای «یک تصویر» (منبع نشان: نقشه‌ی فارسی از سرور داخل کشور) ── */
    function renderStatic() {
      var attempt = currentAttempt();
      var box = size();
      var url = staticUrlFor(attempt.src === 'auto' ? 'neshan' : attempt.src, state.lat, state.lng, state.zoom, box.w, box.h);
      if (staticImg && staticImg.getAttribute('data-url') === url) {
        return;
      }
      tilesLayer.innerHTML = '';
      var img = global.document.createElement('img');
      img.className = 'ep-map-static';
      img.alt = '';
      img.setAttribute('data-url', url);
      img.style.width = box.w + 'px';
      img.style.height = box.h + 'px';
      img.style.left = '0px';
      img.style.top = '0px';
      img.src = url;
      img.addEventListener('load', function () { markLoaded(); });
      img.addEventListener('error', function () { nextAttempt('static'); });
      tilesLayer.appendChild(img);
      staticImg = img;
      staticCenter = {
        x: lngToWorldX(state.lng, state.zoom),
        y: latToWorldY(state.lat, state.zoom)
      };
    }

    /* جابه‌جایی تصویر استاتیک همراه انگشت (تا دوباره گرفتن تصویر نرم باشد) */
    function shiftStatic() {
      if (!staticImg || !staticCenter) return;
      var dx = staticCenter.x - lngToWorldX(state.lng, state.zoom);
      var dy = staticCenter.y - latToWorldY(state.lat, state.zoom);
      staticImg.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
    }

    /* رسم کاشی‌های لازم برای ظرف فعلی */
    function renderTiles() {
      var attempt = currentAttempt();
      if (isStaticSource(attempt.src) || (attempt.src === 'auto' && runtime.config && runtime.config['default'] === 'neshan')) {
        renderStatic();
        return;
      }

      var box = size();
      var centerX = lngToWorldX(state.lng, state.zoom);
      var centerY = latToWorldY(state.lat, state.zoom);
      var left = centerX - box.w / 2;
      var top = centerY - box.h / 2;
      var maxTile = Math.pow(2, state.zoom) - 1;

      var firstX = Math.floor(left / TILE_SIZE);
      var lastX = Math.floor((left + box.w) / TILE_SIZE);
      var firstY = Math.floor(top / TILE_SIZE);
      var lastY = Math.floor((top + box.h) / TILE_SIZE);

      var wanted = {};
      for (var tx = firstX; tx <= lastX; tx++) {
        for (var ty = firstY; ty <= lastY; ty++) {
          if (ty < 0 || ty > maxTile) continue;
          var wrappedX = ((tx % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
          var key = state.zoom + '/' + wrappedX + '/' + ty;
          wanted[key] = true;
          if (tilesLayer.querySelector('[data-tile="' + key + '"]')) continue;

          var img = global.document.createElement('img');
          img.dataset.tile = key;
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = tileUrlFor(attempt, state.zoom, wrappedX, ty);
          img.style.left = (tx * TILE_SIZE - left) + 'px';
          img.style.top = (ty * TILE_SIZE - top) + 'px';
          img.addEventListener('load', function () { markLoaded(); });
          img.addEventListener('error', function () {
            img.style.visibility = 'hidden';
            errorStreak++;
            if (errorStreak >= MAX_TILE_ERRORS) nextAttempt('tile-error');
          });
          tilesLayer.appendChild(img);
        }
      }

      /* کاشی‌های خارج از محدوده حذف می‌شوند تا حجم حافظه کم بماند */
      Array.prototype.slice.call(tilesLayer.children).forEach(function (node) {
        if (!wanted[node.dataset.tile]) node.remove();
      });

      /* جابه‌جایی کاشی‌های موجود (بعد از پن/زوم) */
      Array.prototype.slice.call(tilesLayer.children).forEach(function (node) {
        var parts = String(node.dataset.tile || '').split('/');
        if (parts.length !== 3) return;
        var tileX = parseInt(parts[1], 10);
        var tileY = parseInt(parts[2], 10);
        if (isNaN(tileX) || isNaN(tileY)) return;
        node.style.left = (tileX * TILE_SIZE - left) + 'px';
        node.style.top = (tileY * TILE_SIZE - top) + 'px';
      });

      updateFallbackCoords();
      updateTools();
    }

    function notify() {
      onChange({ lat: state.lat, lng: state.lng, zoom: state.zoom, hasFix: state.hasFix });
    }

    function render(notifyChange) {
      renderTiles();
      if (notifyChange !== false) notify();
    }

    function setPosition(lat, lng, silent) {
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return;
      state.lat = Math.max(-85, Math.min(85, lat));
      state.lng = ((lng + 180) % 360 + 360) % 360 - 180;
      state.hasFix = true;
      pin.style.display = '';
      crosshair.style.display = 'none';
      staticImg = null;
      render(silent !== true);
    }

    function setZoom(zoom) {
      var next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
      if (next === state.zoom) return;
      state.zoom = next;
      staticImg = null;
      render(true);
    }

    function getPosition() {
      return { lat: state.lat, lng: state.lng, zoom: state.zoom, hasFix: state.hasFix };
    }

    /* ── پن کردن نقشه با انگشت/موس (نشانگر در مرکز می‌ماند) ── */
    var drag = null;
    var staticTimer = null;
    function pointerPos(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    function onDown(e) {
      if (!state.draggable) return;
      var p = pointerPos(e);
      drag = { x: p.x, y: p.y, worldX: lngToWorldX(state.lng, state.zoom), worldY: latToWorldY(state.lat, state.zoom) };
      container.classList.add('ep-map-dragging');
    }
    function onMove(e) {
      if (!drag) return;
      if (e.cancelable) e.preventDefault();
      var p = pointerPos(e);
      var worldX = drag.worldX - (p.x - drag.x);
      var worldY = drag.worldY - (p.y - drag.y);
      state.lng = worldXToLng(worldX, state.zoom);
      state.lat = Math.max(-85, Math.min(85, worldYToLat(worldY, state.zoom)));
      state.hasFix = true;
      pin.style.display = '';
      crosshair.style.display = 'none';
      if (staticImg) {
        shiftStatic();      /* تصویر موجود با انگشت جابه‌جا می‌شود… */
        return;
      }
      renderTiles();
    }
    function onUp() {
      if (!drag) return;
      drag = null;
      container.classList.remove('ep-map-dragging');
      if (staticImg) {
        /* …و پس از رها کردن، تصویر تازه‌ی همان نقطه گرفته می‌شود */
        if (staticTimer) clearTimeout(staticTimer);
        staticTimer = setTimeout(function () { renderStatic(); }, 260);
      }
      notify();
    }

    container.addEventListener('mousedown', onDown);
    if (global.document && typeof global.document.addEventListener === 'function') {
      global.document.addEventListener('mousemove', onMove);
      global.document.addEventListener('mouseup', onUp);
    }
    container.addEventListener('touchstart', onDown, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onUp);
    container.addEventListener('touchcancel', onUp);

    if (global.addEventListener) global.addEventListener('resize', function () { renderTiles(); });

    /* دکمه‌های ابزار */
    var satBtn = toolsBox.querySelector('.ep-map-sat');
    if (satBtn) {
      satBtn.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        toggleSatellite();
      });
    }
    var srcBtn = toolsBox.querySelector('.ep-map-src');
    if (srcBtn) {
      srcBtn.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        cycleSource();
      });
    }
    var retryBtn = fallback.querySelector('button');
    if (retryBtn) {
      retryBtn.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        restart();
      });
    }

    /* «ماهواره»: جابه‌جایی بین نمای خیابان و نمای ماهواره‌ای */
    function toggleSatellite() {
      runtime.sat = !runtime.sat;
      if (runtime.sat) {
        runtime.src = SAT_ID;
      } else if (runtime.src === SAT_ID) {
        runtime.src = '';
      }
      savePrefs();
      restart();
      notifyMaps();
    }

    /* «منبع نقشه»: چرخش بین منابع آماده (دستی) */
    function cycleSource() {
      var ready = readySources().filter(function (id) { return id !== SAT_ID; });
      if (!ready.length) ready = DEFAULT_ORDER.slice();
      var now = currentSrc();
      var index = ready.indexOf(now);
      var next = ready[(index + 1) % ready.length];
      runtime.sat = false;
      runtime.src = next;
      runtime.proxy = true;      /* اول از سرور خودمان، چون در اپ مطمئن‌تر است */
      savePrefs();
      restart();
      notifyMaps();
    }

    /* شروع دوباره‌ی تلاش‌ها (پس از تغییر منبع یا «تلاش دوباره») */
    function restart() {
      attempts = attemptList();
      attemptIndex = 0;
      errorStreak = 0;
      loadedAny = false;
      tilesLayer.innerHTML = '';
      staticImg = null;
      staticCenter = null;
      fallback.classList.remove('show');
      loading.style.display = '';
      renderTiles();
    }

    /* وقتی فهرست منابع از سرور رسید، نقشه با منبع درست دوباره رسم می‌شود */
    var onConfig = function () {
      if (loadedAny) { updateTools(); return; }
      restart();
    };
    runtime.listeners.push(onConfig);

    /* رسم اولیه: بدون این کار، نقشه تا اولین جابه‌جایی/زوم خالی می‌ماند. */
    renderTiles();
    loadConfig(false);

    return {
      setPosition: setPosition,
      getPosition: getPosition,
      setZoom: setZoom,
      zoomIn: function () { setZoom(state.zoom + 1); },
      zoomOut: function () { setZoom(state.zoom - 1); },
      refresh: function () { renderTiles(); },
      restart: restart,
      setTheme: function (night) { container.classList.toggle('ep-map-dark', !!night); },
      setSource: function (id) {
        runtime.sat = (id === SAT_ID);
        runtime.src = String(id || '');
        runtime.proxy = true;
        savePrefs();
        restart();
      },
      getSource: function () {
        return { src: currentSrc(), proxy: !!currentAttempt().proxy, satellite: !!runtime.sat, label: labelFor(currentSrc()) };
      },
      nextSource: cycleSource,
      toggleSatellite: toggleSatellite,
      destroy: function () {
        runtime.listeners = runtime.listeners.filter(function (fn) { return fn !== onConfig; });
        if (global.document && typeof global.document.removeEventListener === 'function') {
          global.document.removeEventListener('mousemove', onMove);
          global.document.removeEventListener('mouseup', onUp);
        }
        tileCache.clear();
      },
      element: container
    };
  }

  /* ── ساخت «آدرس نوشتاری دقیق» از پاسخ آدرس‌یاب ───────────────────────
     پاسخ خام سرویس، یک رشته‌ی طولانی و بی‌ترتیب است (کشور، استان، شهر، …)
     و در کادر «آدرس» بدرد نمی‌خورد. اینجا آدرس کوتاه، مرتب و فارسی ساخته
     می‌شود: «خیابان، پلاک، محله، شهر».
     ترتیب اولویت: خیابان/معبر → محله → شهر → (در صورت نبود) شهرستان/استان. */
  var STREET_KEYS = ['road', 'pedestrian', 'footway', 'cycleway', 'residential', 'path', 'square'];
  var HOOD_KEYS   = ['neighbourhood', 'quarter', 'suburb', 'hamlet', 'borough', 'city_block'];
  var CITY_KEYS   = ['city', 'town', 'village', 'municipality', 'city_district', 'county'];

  function firstOf(source, keys) {
    for (var i = 0; i < keys.length; i++) {
      var value = source && source[keys[i]];
      if (value && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function formatShortAddress(data, lat, lng) {
    if (!data) return '';
    var addr = data.address || {};
    var parts = [];

    var street = firstOf(addr, STREET_KEYS);
    var house  = addr.house_number ? ('پلاک ' + String(addr.house_number).trim()) : '';
    if (street) parts.push(house ? (street + '، ' + house) : street);

    var hood = firstOf(addr, HOOD_KEYS);
    if (hood && parts.indexOf(hood) === -1) parts.push(hood);

    var city = firstOf(addr, CITY_KEYS);
    if (city && parts.indexOf(city) === -1) parts.push(city);

    /* اگر فقط محله/شهر را داشتیم و نام خیابان نبود، از رشته‌ی کامل سرویس
       (display_name) برای «دقیق‌تر شدن» استفاده می‌کنیم. */
    if (parts.length < 2 && data.display_name) {
      String(data.display_name).split(',').forEach(function (piece) {
        var value = piece.trim();
        if (value && parts.length < 3 && parts.indexOf(value) === -1 && !/^\d+$/.test(value)) {
          parts.push(value);
        }
      });
    }

    if (!parts.length) return '';

    var text = parts.join('، ');
    if (text.length > 120) text = text.slice(0, 120).trim();

    /* اگر آدرس خیلی کوتاه/مبهم بود، مختصات دقیق را هم کنارش می‌گذاریم تا
       کاربر بداند موقعیت ثبت‌شده کجاست. */
    if (text.length < 10 && isFiniteNumber(lat) && isFiniteNumber(lng)) {
      text = text + ' (عرض ' + Number(lat).toFixed(5) + ' • طول ' + Number(lng).toFixed(5) + ')';
    }
    return text;
  }

  /* ── آدرس‌یابی معکوس: از مختصات به آدرس فارسی ─────────────────────────
     اول از راه سرور خودمان (api/maptile.php?action=reverse) — چون هم در اپ
     درست کار می‌کند و هم اگر کلید «نشان» باشد آدرس فارسی دقیق‌تر می‌دهد.
     اگر سرور پاسخ نداد، مستقیم به Nominatim می‌رویم. در هر دو حالت اگر
     اینترنت/سرویس جواب ندهد null برمی‌گردد و برنامه «عرض/طول جغرافیایی» را
     نشان می‌دهد. */
  function fetchJson(url, timeoutMs) {
    if (typeof global.fetch !== 'function') return Promise.resolve(null);
    var options = { headers: { 'Accept': 'application/json' } };
    var timer = null;
    if (typeof global.AbortController === 'function') {
      var controller = new global.AbortController();
      options.signal = controller.signal;
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs || 6000);
    }
    return global.fetch(url, options)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return (res && res.ok) ? res.json() : null;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return null;
      });
  }

  function reverseGeocode(lat, lng) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return Promise.resolve(null);

    var proxyUrl = apiBase() + '/maptile.php?action=reverse&lat=' + encodeURIComponent(lat)
      + '&lng=' + encodeURIComponent(lng);
    var directUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1'
      + '&accept-language=fa&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);

    return fetchJson(proxyUrl, 8000)
      .then(function (data) {
        if (data && data.success === true && data.address) return String(data.address);
        return fetchJson(directUrl, 6000).then(function (osm) {
          if (!osm) return null;
          var short = formatShortAddress(osm, lat, lng);
          if (short) return short;
          return osm.display_name ? String(osm.display_name).split(',').slice(0, 3).join('، ').trim() : null;
        });
      })
      .catch(function () { return null; });
  }

  /* متن مختصات برای نمایش به کاربر */
  function formatPosition(lat, lng, accuracy) {
    var text = 'عرض ' + Number(lat).toFixed(6) + ' • طول ' + Number(lng).toFixed(6);
    if (isFiniteNumber(accuracy) && accuracy > 0) {
      text += ' • دقت حدود ' + Math.round(accuracy) + ' متر';
    }
    return text;
  }

  var api = {
    create: create,
    reverseGeocode: reverseGeocode,
    formatShortAddress: formatShortAddress,
    formatPosition: formatPosition,
    isFiniteNumber: isFiniteNumber,
    /* ابزارهای منبع نقشه (برای آزمون و تنظیم دستی) */
    sources: function () { return SOURCES.map(function (item) { return { id: item.id, label: item.label, kind: item.kind }; }); },
    readySources: readySources,
    attemptList: attemptList,
    tileUrlFor: tileUrlFor,
    staticUrlFor: staticUrlFor,
    loadConfig: loadConfig,
    getRuntime: function () { return { proxy: runtime.proxy, src: runtime.src, sat: runtime.sat, config: runtime.config }; },
    setPreference: function (patch) {
      if (!patch) return;
      if (typeof patch.proxy === 'boolean') runtime.proxy = patch.proxy;
      if (typeof patch.src === 'string') runtime.src = patch.src;
      if (typeof patch.sat === 'boolean') runtime.sat = patch.sat;
      savePrefs();
    }
  };

  global.EplakMap = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
