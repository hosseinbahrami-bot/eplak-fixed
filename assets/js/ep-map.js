/* ============================================================================
   assets/js/ep-map.js — نقشه‌ی سبک ای‌پلاک (بدون کلید API)

   چرا این فایل؟
   در «ثبت درخواست» باید موقعیت دقیق کاربر (از GPS گوشی) روی نقشه دیده شود و
   همین نقشه در پنل ادمین هم مختصات شهروند را نشان بدهد. Google Maps به کلید
   نیاز دارد و در بعضی شرایط باز نمی‌شود؛ پس این نقشه از کاشی‌های رایگان و
   آزاد OpenStreetMap ساخته شده و فقط با <img> کار می‌کند (بدون کتابخانه‌ی
   بیرونی، بدون کلید، سبک و سریع).

   نحوه‌ی استفاده:
     const map = EplakMap.create(document.getElementById('reportMapPicker'), {
        lat: 35.3242, lng: 51.6455, zoom: 16, draggable: true,
        onChange: (pos) => { ... }        // پس از جابه‌جایی/زوم/تنظیم نقطه
     });
     map.setPosition(35.3242, 51.6455);
     const pos = map.getPosition();        // { lat, lng, zoom }
     const addr = await EplakMap.reverseGeocode(lat, lng);   // آدرس فارسی (اختیاری)

   نکته‌ی مهم: این نقشه وقتی کاشی‌ها دانلود نشوند هم به کار خود ادامه می‌دهد
   (مختصات ثبت می‌شود) — یعنی قطعی نقشه باعث از کار افتادن ثبت درخواست نمی‌شود.
   ============================================================================ */
(function (global) {
  'use strict';

  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_SIZE = 256;
  var MIN_ZOOM = 3;
  var MAX_ZOOM = 19;
  var STYLE_ID = 'epMapStyles';
  var MAX_TILE_ERRORS = 4;   /* بعد از این تعداد خطا، پیام «نقشه در دسترس نیست» */

  /* ── استایل‌ها یک‌بار به صفحه اضافه می‌شوند (هم اپ، هم پنل ادمین) ── */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.ep-map{position:relative;overflow:hidden;border-radius:14px;background:#dfe6ee;',
      '  touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;}',
      '.ep-map.ep-map-dragging{cursor:grabbing;}',
      '.ep-map-tiles{position:absolute;inset:0;}',
      '.ep-map-tiles img{position:absolute;width:256px;height:256px;border:0;pointer-events:none;',
      '  -webkit-user-drag:none;user-select:none;}',
      '.ep-map-dark .ep-map-tiles img{filter:brightness(0.72) saturate(0.85) hue-rotate(180deg) invert(0.92);}',
      '.ep-map-fallback{position:absolute;inset:0;display:none;align-items:center;justify-content:center;',
      '  flex-direction:column;gap:6px;text-align:center;padding:12px;background:linear-gradient(135deg,#16233c,#0d1527);',
      '  color:#cbd5e1;font-size:11.5px;line-height:1.9;}',
      '.ep-map-fallback.show{display:flex;}',
      '.ep-map-fallback .ep-map-coords{direction:ltr;font-weight:700;color:#00C9A7;font-size:12.5px;}',
      '.ep-map-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;',
      '  filter:drop-shadow(0 6px 10px rgba(239,68,68,0.45));z-index:3;}',
      '.ep-map-pin svg{display:block;}',
      '.ep-map-crosshair{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;',
      '  border-radius:50%;border:2px solid rgba(0,201,167,0.9);box-shadow:0 0 0 6px rgba(0,201,167,0.18);z-index:2;}',
      '.ep-map-attrib{position:absolute;left:6px;bottom:6px;z-index:4;background:rgba(13,21,39,0.62);',
      '  color:#e2e8f0;font-size:9.5px;padding:2px 7px;border-radius:8px;text-decoration:none;}',
      '.ep-map-zoom{position:absolute;right:8px;top:8px;z-index:4;display:flex;flex-direction:column;gap:6px;}',
      '.ep-map-zoom button{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);',
      '  background:rgba(13,21,39,0.72);color:#fff;font-size:17px;font-weight:800;line-height:1;cursor:pointer;}',
      '.ep-map-zoom button:active{transform:scale(0.94);}',
      '.ep-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      '  z-index:2;background:rgba(223,230,238,0.65);font-size:12px;color:#334155;}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
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

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
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
    var tileErrors = 0;
    var tilesLayer, fallback, loading;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    container.classList.add('ep-map');
    container.innerHTML = '';

    tilesLayer = document.createElement('div');
    tilesLayer.className = 'ep-map-tiles';
    container.appendChild(tilesLayer);

    var crosshair = document.createElement('div');
    crosshair.className = 'ep-map-crosshair';
    container.appendChild(crosshair);

    var pin = document.createElement('div');
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

    fallback = document.createElement('div');
    fallback.className = 'ep-map-fallback';
    fallback.innerHTML = '<div>🗺️ نقشه در دسترس نیست (اینترنت یا دسترسی به سرور نقشه)</div>'
      + '<div class="ep-map-coords">—</div>'
      + '<div>مختصات همین‌جا ثبت می‌شود و در پنل ادمین نمایش داده می‌شود.</div>';
    container.appendChild(fallback);

    loading = document.createElement('div');
    loading.className = 'ep-map-loading';
    loading.textContent = 'در حال بارگذاری نقشه…';
    container.appendChild(loading);

    var zoomBox = document.createElement('div');
    zoomBox.className = 'ep-map-zoom';
    zoomBox.innerHTML = '<button type="button" aria-label="بزرگ‌نمایی">+</button>'
      + '<button type="button" aria-label="کوچک‌نمایی">−</button>';
    container.appendChild(zoomBox);

    var attrib = document.createElement('a');
    attrib.className = 'ep-map-attrib';
    attrib.href = 'https://www.openstreetmap.org/copyright';
    attrib.target = '_blank';
    attrib.rel = 'noopener';
    attrib.textContent = '© OpenStreetMap';
    container.appendChild(attrib);

    zoomBox.children[0].addEventListener('click', function (e) {
      e.stopPropagation();
      setZoom(state.zoom + 1);
    });
    zoomBox.children[1].addEventListener('click', function (e) {
      e.stopPropagation();
      setZoom(state.zoom - 1);
    });

    function size() {
      var rect = container.getBoundingClientRect();
      return { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    }

    function updateFallbackCoords() {
      var el = fallback.querySelector('.ep-map-coords');
      if (el) el.textContent = state.lat.toFixed(6) + ', ' + state.lng.toFixed(6);
    }

    /* رسم کاشی‌های لازم برای ظرف فعلی */
    function renderTiles() {
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

          var img = document.createElement('img');
          img.dataset.tile = key;
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = TILE_URL.replace('{z}', state.zoom).replace('{x}', wrappedX).replace('{y}', ty);
          img.style.left = (tx * TILE_SIZE - left) + 'px';
          img.style.top = (ty * TILE_SIZE - top) + 'px';
          img.addEventListener('load', function () {
            tileErrors = 0;
            loading.style.display = 'none';
            fallback.classList.remove('show');
          });
          img.addEventListener('error', function () {
            img.style.visibility = 'hidden';
            tileErrors++;
            if (tileErrors >= MAX_TILE_ERRORS) {
              loading.style.display = 'none';
              fallback.classList.add('show');
              updateFallbackCoords();
            }
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
        var tx = parseInt(parts[1], 10);
        var ty = parseInt(parts[2], 10);
        if (isNaN(tx) || isNaN(ty)) return;
        node.style.left = (tx * TILE_SIZE - left) + 'px';
        node.style.top = (ty * TILE_SIZE - top) + 'px';
      });

      updateFallbackCoords();
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
      render(silent !== true);
    }

    function setZoom(zoom) {
      var next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
      if (next === state.zoom) return;
      state.zoom = next;
      render(true);
    }

    function getPosition() {
      return { lat: state.lat, lng: state.lng, zoom: state.zoom, hasFix: state.hasFix };
    }

    /* ── پن کردن نقشه با انگشت/موس (نشانگر در مرکز می‌ماند) ── */
    var drag = null;
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
      renderTiles();
    }
    function onUp() {
      if (!drag) return;
      drag = null;
      container.classList.remove('ep-map-dragging');
      notify();
    }

    container.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    container.addEventListener('touchstart', onDown, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onUp);
    container.addEventListener('touchcancel', onUp);

    window.addEventListener('resize', function () { renderTiles(); });

    /* رسم اولیه: بدون این کار، نقشه تا اولین جابه‌جایی/زوم خالی می‌ماند. */
    renderTiles();

    return {
      setPosition: setPosition,
      getPosition: getPosition,
      setZoom: setZoom,
      zoomIn: function () { setZoom(state.zoom + 1); },
      zoomOut: function () { setZoom(state.zoom - 1); },
      refresh: function () { renderTiles(); },
      setTheme: function (night) { container.classList.toggle('ep-map-dark', !!night); },
      destroy: function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        tileCache.clear();
      },
      element: container
    };
  }

  /* ── آدرس‌یابی معکوس (اختیاری): از مختصات به آدرس فارسی ─────────────
     اگر اینترنت یا سرویس نقشه پاسخ ندهد، null برمی‌گردد و برنامه
     «عرض/طول جغرافیایی» را نشان می‌دهد. */
  function reverseGeocode(lat, lng) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return Promise.resolve(null);
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1'
      + '&accept-language=fa&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);

    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return null;
        var address = data.display_name || null;
        if (!address && data.address) {
          var parts = [];
          ['road', 'neighbourhood', 'suburb', 'city', 'state'].forEach(function (k) {
            if (data.address[k]) parts.push(data.address[k]);
          });
          address = parts.join('، ') || null;
        }
        return address;
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
    formatPosition: formatPosition,
    isFiniteNumber: isFiniteNumber
  };

  global.EplakMap = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
