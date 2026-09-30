/* modules/reports.js — ثبت گزارش جدید، لیست گزارش‌ها و پیگیری درخواست */
/* استخراج‌شده عیناً از فایل اصلی app_01.html با پشتیبانی آفلاین و داده‌های توکار شهرداری */

  const DEFAULT_DEPARTMENTS = [
    {
      id: 1,
      name: 'حوزه شهردار',
      children: [
        { id: 2, name: 'دفتر شهردار ورامین' },
        { id: 3, name: 'روابط عمومی و امور بین‌الملل' },
        { id: 4, name: 'بازرسی و ارزیابی عملکرد' },
        { id: 5, name: 'حراست شهرداری' },
        { id: 6, name: 'امور حقوقی' },
        { id: 7, name: 'شورای مشاوران' }
      ]
    },
    {
      id: 8,
      name: 'معاونت اداری و مالی',
      children: [
        { id: 9, name: 'منابع انسانی' },
        { id: 10, name: 'امور اداری' },
        { id: 11, name: 'امور مالی و حسابداری' },
        { id: 12, name: 'بودجه و برنامه‌ریزی' },
        { id: 13, name: 'تدارکات و پشتیبانی' },
        { id: 14, name: 'فناوری اطلاعات (IT)' }
      ]
    },
    {
      id: 15,
      name: 'معاونت فنی و عمرانی',
      children: [
        { id: 16, name: 'طراحی و اجرای پروژه‌های عمرانی' },
        { id: 17, name: 'ساخت و نگهداری معابر' },
        { id: 18, name: 'پل‌ها و تونل‌ها' },
        { id: 19, name: 'ساختمان‌های عمومی' },
        { id: 20, name: 'تأسیسات شهری' }
      ]
    },
    {
      id: 21,
      name: 'معاونت شهرسازی و معماری',
      children: [
        { id: 22, name: 'صدور پروانه ساختمانی' },
        { id: 23, name: 'پایان کار ساختمان' },
        { id: 24, name: 'کنترل و نظارت ساختمانی' },
        { id: 25, name: 'طرح‌های توسعه شهری' },
        { id: 26, name: 'کمیسیون‌های شهرسازی' }
      ]
    },
    {
      id: 27,
      name: 'معاونت خدمات شهری',
      children: [
        { id: 28, name: 'نظافت شهری' },
        { id: 29, name: 'مدیریت پسماند' },
        { id: 30, name: 'فضای سبز' },
        { id: 31, name: 'زیباسازی شهر' },
        { id: 32, name: 'آرامستان‌ها' },
        { id: 33, name: 'کنترل حیوانات شهری' }
      ]
    },
    {
      id: 34,
      name: 'معاونت حمل‌ونقل و ترافیک',
      children: [
        { id: 35, name: 'مدیریت ترافیک' },
        { id: 36, name: 'پارکینگ‌ها' },
        { id: 37, name: 'حمل‌ونقل عمومی' },
        { id: 38, name: 'پایانه‌ها' },
        { id: 39, name: 'ایمنی و علائم راهنمایی' }
      ]
    },
    {
      id: 40,
      name: 'معاونت فرهنگی و اجتماعی',
      children: [
        { id: 41, name: 'فرهنگسراها' },
        { id: 42, name: 'کتابخانه‌ها' },
        { id: 43, name: 'امور جوانان' },
        { id: 44, name: 'امور بانوان' },
        { id: 45, name: 'مشارکت‌های مردمی' },
        { id: 46, name: 'ورزش همگانی' }
      ]
    },
    {
      id: 47,
      name: 'معاونت برنامه‌ریزی و توسعه',
      children: [
        { id: 48, name: 'آمار و اطلاعات' },
        { id: 49, name: 'پژوهش و نوآوری' },
        { id: 50, name: 'مدیریت پروژه' },
        { id: 51, name: 'هوشمندسازی شهر' }
      ]
    },
    {
      id: 52,
      name: 'سازمان‌ها و شرکت‌های وابسته',
      children: [
        { id: 53, name: 'سازمان مدیریت پسماند' },
        { id: 54, name: 'سازمان آتش‌نشانی و خدمات ایمنی' },
        { id: 55, name: 'سازمان پارک‌ها و فضای سبز' },
        { id: 56, name: 'سازمان زیباسازی' },
        { id: 57, name: 'سازمان حمل‌ونقل بار و مسافر' },
        { id: 58, name: 'سازمان میادین و بازارها' },
        { id: 59, name: 'سازمان آرامستان‌ها' },
        { id: 60, name: 'سازمان فناوری اطلاعات و ارتباطات' },
        { id: 61, name: 'سازمان فرهنگی، اجتماعی و ورزشی' },
        { id: 62, name: 'سازمان سرمایه‌گذاری و مشارکت‌های مردمی' },
        { id: 63, name: 'شرکت بهره‌برداری مترو' },
        { id: 64, name: 'شرکت واحد اتوبوسرانی' },
        { id: 65, name: 'شرکت نوسازی و بهسازی شهری' }
      ]
    }
  ];

  /* =========================================================
     New Report — multi-step form
  ========================================================= */
  function startNewReport() {
    resetReportDraft();
    loadDepartmentsFromBackend();
    showScreen('screen-report');
  }

  function renderDepartments(list) {
    const wrap = document.getElementById('deptListWrap');
    if (!wrap) return;
    const items = (Array.isArray(list) && list.length) ? list : DEFAULT_DEPARTMENTS;
    const safeEscape = (typeof escapeHtml === 'function')
      ? escapeHtml
      : (str => String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const translateText = text => (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(text) : text;

    wrap.innerHTML = items.map((parent, parentIndex) => {
      const pName = translateText(parent.name);
      return `
      <div class="dept-item">
        <div class="dept-header" onclick="toggleDept(this)">
          <span class="dept-title">${parentIndex + 1}. ${safeEscape(pName)}</span>
          <span class="dept-arrow">⌄</span>
        </div>
        <div class="dept-sub-list">
          ${(parent.children || []).map(child => {
            const cName = translateText(child.name);
            return `
            <div class="dept-sub-item" onclick="selectDepartment(this, '${safeEscape(parent.name).replace(/'/g, "\\'")}')">${safeEscape(cName)}</div>
          `;
          }).join('')}
        </div>
      </div>
    `;
    }).join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDepartmentsFromBackend);
  } else {
    loadDepartmentsFromBackend();
  }

  async function loadDepartmentsFromBackend() {
    const wrap = document.getElementById('deptListWrap');
    if (!wrap) return;

    // If wrap is empty or currently contains an error/loading message, immediately render default departments
    if (!wrap.children || !wrap.children.length || !wrap.querySelector || wrap.querySelector('.dept-item') === null) {
      renderDepartments(DEFAULT_DEPARTMENTS);
    }

    try {
      const response = await fetch(`${apiBase}/departments.php`);
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      const list = Array.isArray(data?.departments) ? data.departments : [];

      if (list.length) {
        renderDepartments(list);
      }
    } catch (error) {
      console.warn('[departments] Backend sync note (using built-in municipal directory):', error.message || error);
      if (!wrap.children || !wrap.children.length || !wrap.querySelector || wrap.querySelector('.dept-item') === null) {
        renderDepartments(DEFAULT_DEPARTMENTS);
      }
    }
  }

  window.DEFAULT_DEPARTMENTS = DEFAULT_DEPARTMENTS;
  window.renderDepartments = renderDepartments;

  function formatReportDate(dateValue) {
    if (!dateValue) return '—';
    let date = new Date(dateValue);
    if (Number.isNaN(date.getTime()) && typeof dateValue === 'string') {
      date = new Date(dateValue.replace(' ', 'T'));
    }
    if (Number.isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function formatReportDateTime(dateValue) {
    if (!dateValue) {
      const now = new Date();
      const d = now.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const t = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${d} - ساعت ${t}`;
    }
    if (typeof dateValue === 'string') {
      if (dateValue.includes('ساعت') || / \d{1,2}:\d{2}/.test(dateValue)) {
        return dateValue;
      }
    }
    let date = new Date(dateValue);
    if (Number.isNaN(date.getTime()) && typeof dateValue === 'string') {
      date = new Date(dateValue.replace(' ', 'T'));
    }
    if (Number.isNaN(date.getTime())) {
      return String(dateValue);
    }
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    if (isEn) {
      const d = date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${d} ${t}`;
    }
    const d = date.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const t = date.toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${d} - ساعت ${t}`;
  }
  window.formatReportDate = formatReportDate;
  window.formatReportDateTime = formatReportDateTime;

  /* ── هماهنگی حذف با همگام‌سازی سرور ──────────────────────────────
     شناسه‌ی گزارش‌هایی که کاربر حذف کرده ولی حذف آن‌ها هنوز در سرور
     قطعی نشده، این‌جا نگه داشته می‌شود تا همگام‌سازی پس‌زمینه (که هر
     چند ثانیه یک‌بار کل لیست را از سرور می‌گیرد) آن‌ها را دوباره
     به لیست برنگرداند. */
  const pendingDeleteIds = new Set();
  const PENDING_DELETE_KEY = 'eplak_pending_report_deletes';
  let reportsSyncInFlight = null;

  function loadPendingDeletes() {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(PENDING_DELETE_KEY) : null;
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) arr.forEach(id => pendingDeleteIds.add(String(id)));
    } catch (e) { /* ignore */ }
  }
  function savePendingDeletes() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(Array.from(pendingDeleteIds)));
      }
    } catch (e) { /* ignore */ }
  }
  loadPendingDeletes();

  /* شناسه‌ی سروری یک گزارش (عدد) — یا null اگر گزارش فقط محلی است */
  function getReportBackendId(r) {
    if (!r) return null;
    const candidates = [r.backendId, r.id];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isInteger(n) && n > 0) return n;
    }
    return null;
  }

  async function requestBackendDelete(backendId, phone) {
    const response = await fetch(`${apiBase}/reports.php?action=delete&id=${encodeURIComponent(backendId)}&phone=${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: backendId, phone })
    });
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    // 404 یعنی از قبل در سرور وجود ندارد — نتیجه‌ی مطلوب همان است
    if (response.status === 404) return true;
    if (!response.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `delete failed (${response.status})`);
    }
    return true;
  }

  /* تلاش مجدد برای حذف‌هایی که قبلاً ناتمام مانده‌اند (مثلاً قطع اینترنت) */
  async function flushPendingDeletes(phone) {
    if (!phone || !pendingDeleteIds.size) return;
    for (const id of Array.from(pendingDeleteIds)) {
      try {
        await requestBackendDelete(id, phone);
        pendingDeleteIds.delete(id);
      } catch (e) { /* دفعه‌ی بعد دوباره تلاش می‌شود */ }
    }
    savePendingDeletes();
  }

  /* گزارش‌هایی که هنگام قطع اینترنت ثبت شده‌اند (pendingSync) را دوباره به
     سرور می‌فرستد تا واقعاً به دست شهرداری برسند. */
  async function flushPendingCreates(phone) {
    if (!phone || typeof window.syncDataToBackend !== 'function') return;
    const pending = reports.filter(r => r && r.pendingSync === true && getReportBackendId(r) === null);
    for (const r of pending) {
      try {
        const res = await window.syncDataToBackend('reports', {
          userPhone: phone,
          title: r.title,
          description: r.desc || r.title,
          category: r.subDepartment || r.department || 'سایر',
          department: r.department || '',
          subDepartment: r.subDepartment || '',
          location: r.location || ''
        });
        if (res && res.id) {
          r.backendId = res.id;
          r.id = String(res.id);
          if (res.tracking_code) r.code = res.tracking_code;
          delete r.pendingSync;
        }
      } catch (e) { /* دفعه‌ی بعد */ }
    }
    if (pending.length && typeof saveReports === 'function') saveReports(phone);
  }

  async function loadReportsFromBackend(phone = getCurrentPhone(), options = {}) {
    const { silent = false } = options;
    if (!phone) {
      reports.length = 0;
      return [];
    }

    // اگر یک همگام‌سازی در جریان است، همان را برگردان (جلوگیری از درخواست‌های موازی)
    if (reportsSyncInFlight) return reportsSyncInFlight;

    reportsSyncInFlight = (async () => {
    try {
      await flushPendingDeletes(phone);
      await flushPendingCreates(phone);

      const response = await fetch(`${apiBase}/reports.php?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('reports fetch failed');
      const data = await response.json();
      const rows = (Array.isArray(data?.reports) ? data.reports : [])
        .filter(item => !pendingDeleteIds.has(String(item.id)));
      const mapped = rows.map(item => ({
        id: String(item.id),
        backendId: item.id,
        code: item.code || `EP-1403-${String(Number(item.id) + 1000).padStart(4, '0')}`,
        title: item.title || 'گزارش جدید',
        location: item.location || 'نامشخص',
        rawDate: item.created_at,
        date: formatReportDate(item.created_at),
        dateTime: formatReportDateTime(item.created_at),
        status: normalizeStatusValue(item.status || 'pending'),
        icon: '📋',
        iconBg: 'rgba(0,201,167,0.12)',
        desc: item.description || item.details || '',
        department: item.department || '',
        subDepartment: item.sub_department || '',
        reply: item.reply || '',
        /* عکس/فیلم‌های ذخیره‌شده روی سرور (از جدول report_media) */
        media: Array.isArray(item.media) ? item.media.map(m => ({
          id: m.id,
          kind: m.kind,
          url: mediaUrlOf(m.url || m.path),
          name: m.name,
          size: m.size
        })) : [],
        timeline: Array.isArray(item.timeline) ? item.timeline : []
      }));

      /* گزارش‌های محلی که هنوز به سرور نرسیده‌اند (بدون شناسه‌ی سروری) را
         نگه می‌داریم تا با هر همگام‌سازی از لیست کاربر ناپدید نشوند.
         اگر نسخه‌ی سروری همان گزارش رسیده باشد (عنوان/توضیح یکسان)، نسخه‌ی
         محلی کنار گذاشته می‌شود تا تکراری دیده نشود. */
      const serverIds = new Set(mapped.map(m => String(m.backendId)));
      const sameAsServer = (r) => mapped.some(m =>
        m.title === r.title && (m.desc || '') === (r.desc || '') && (m.location || 'نامشخص') === (r.location || 'نامشخص'));
      const localOnly = reports.filter(r => {
        const bid = getReportBackendId(r);
        if (bid !== null) return false;            // از سرور آمده؛ لیست سرور مرجع است
        return !sameAsServer(r);
      });

      reports.length = 0;
      mapped.forEach(item => reports.push(item));
      localOnly.forEach(item => reports.unshift(item));
      if (typeof saveReports === 'function') saveReports(phone);
      return reports;
    } catch (error) {
      if (!silent) {
        console.warn('[reports] backend sync failed', error);
      }
      return reports;
    } finally {
      reportsSyncInFlight = null;
    }
    })();
    return reportsSyncInFlight;
  }

  window.loadReportsFromBackend = loadReportsFromBackend;

  /* پاک کردن تصاویر پیش‌نویس و آزادکردن حافظه‌ی پیش‌نمایش‌ها */
  function clearReportPhotos() {
    (reportDraft.photos || []).forEach(entry => {
      if (entry && entry.previewUrl) {
        try { URL.revokeObjectURL(entry.previewUrl); } catch (e) {}
      }
    });
    reportDraft.photos = [];
  }

  function resetReportDraft() {
    reportDraft = { type: 'سایر', department: '', subDepartment: '', desc: '', location: '', photos: [], geo: null };
    const desc = document.getElementById('reportDescInput');
    if (desc) { desc.value = ''; updateCount(desc); }
    document.querySelectorAll('#deptListWrap .dept-sub-item').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#deptListWrap .dept-item').forEach(it => it.classList.remove('open'));
    const deptBox = document.getElementById('deptSelectedBox');
    if (deptBox) deptBox.style.display = 'none';
    const loc = document.getElementById('reportLocationInput');
    if (loc) loc.value = '';
    const photoPrev = document.getElementById('reportPhotosPreview');
    if (photoPrev) photoPrev.innerHTML = '';
    const coords = document.getElementById('reportCoordsText');
    if (coords) coords.textContent = 'موقعیتی انتخاب نشده است';
  }

  function toggleDept(headerEl) {
    const item = headerEl.closest('.dept-item');
    if (!item) return;
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('#deptListWrap .dept-item.open').forEach(el => el.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  }

  function selectDepartment(el, mainLabel) {
    document.querySelectorAll('#deptListWrap .dept-sub-item').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const subLabel = el.textContent.trim();
    reportDraft.department = mainLabel;
    reportDraft.subDepartment = subLabel;
    const box = document.getElementById('deptSelectedBox');
    const text = document.getElementById('deptSelectedText');
    if (box && text) {
      text.textContent = mainLabel + ' / ' + subLabel;
      box.style.display = 'flex';
    }
    document.querySelectorAll('#deptListWrap .dept-item.open').forEach(it => it.classList.remove('open'));
  }

  function updateCount(el) {
    if (!el) return;
    const count = (el.value || '').length;
    if (el.nextElementSibling) {
      el.nextElementSibling.textContent = count + '/300';
    }
  }

  function goReportStep2() {
    const descEl = document.getElementById('reportDescInput');
    reportDraft.desc = descEl.value.trim();
    if (!reportDraft.subDepartment) {
      showToast('لطفاً واحد مربوطه را انتخاب کنید');
      return;
    }
    if (!reportDraft.desc) {
      showToast('لطفاً توضیحات مشکل را وارد کنید');
      return;
    }
    showScreen('screen-report-step2');
  }

  /* =========================================================
     موقعیت مکانی: GPS گوشی + نمایش روی نقشه
     ---------------------------------------------------------
     - نشانگر نقشه همیشه در مرکز است؛ کاربر با کشیدن نقشه آن را روی محل
       دقیق مشکل می‌گذارد (lat/lng در reportDraft.geo نگه داشته می‌شود).
     - دکمه‌ی «استفاده از موقعیت فعلی من» با GPS خود گوشی موقعیت را می‌گیرد
       (در اپ اندروید، اجازه‌ی دسترسی از پل AndroidApp گرفته می‌شود).
     - آدرس خیابان (اختیاری) از سرویس آزاد OpenStreetMap گرفته می‌شود؛ اگر
       اینترنت/سرویس پاسخ ندهد، همان مختصات ثبت می‌شود.
  ========================================================= */
  let reportMap = null;
  let reportGeoTimer = null;
  let pendingGpsRequest = false;

  function coordsText() {
    const geo = reportDraft.geo || {};
    const out = document.getElementById('reportCoordsText');
    if (!out) return;
    if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
      out.textContent = 'موقعیتی انتخاب نشده است';
      return;
    }
    const base = (window.EplakMap && window.EplakMap.formatPosition)
      ? window.EplakMap.formatPosition(geo.lat, geo.lng, geo.accuracy)
      : (geo.lat.toFixed(6) + ' , ' + geo.lng.toFixed(6));
    out.textContent = base;
  }

  /* آدرس را از مختصات می‌گیرد و در کادر «یا آدرس را وارد کنید» می‌گذارد */
  function lookupAddress(lat, lng, force) {
    if (!window.EplakMap || typeof window.EplakMap.reverseGeocode !== 'function') return;
    clearTimeout(reportGeoTimer);
    reportGeoTimer = setTimeout(function () {
      window.EplakMap.reverseGeocode(lat, lng).then(function (address) {
        if (!address) return;
        const locEl = document.getElementById('reportLocationInput');
        if (!locEl) return;
        /* اگر کاربر خودش آدرسی نوشته، آن را با نتیجه‌ی جست‌وجو بازنویسی نمی‌کنیم
           (مگر در حالت «موقعیت فعلی من» که force=true است). */
        if (!force && locEl.value.trim() !== '') return;
        locEl.value = address;
        reportDraft.location = address;
      }).catch(function () {});
    }, 400);
  }

  /* ساخت نقشه فقط وقتی صفحه‌ی «موقعیت» دیده می‌شود (برای صرفه‌جویی در اینترنت) */
  function initReportMap(force) {
    if (reportMap && !force) return reportMap;
    const box = document.getElementById('reportMapPicker');
    if (!box || !window.EplakMap) return null;
    if (box.offsetHeight === 0 && !force) return null;   /* صفحه هنوز دیده نمی‌شود */

    const geo = reportDraft.geo || {};
    const hasFix = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    reportMap = window.EplakMap.create(box, {
      lat: hasFix ? geo.lat : 35.3242,
      lng: hasFix ? geo.lng : 51.6455,
      zoom: hasFix ? 17 : 14,
      draggable: true,
      hasFix: hasFix,
      onChange: function (pos) {
        if (!pos.hasFix) return;
        reportDraft.geo = { lat: pos.lat, lng: pos.lng, accuracy: (reportDraft.geo || {}).accuracy, source: 'map' };
        coordsText();
        lookupAddress(pos.lat, pos.lng, false);
      }
    });
    coordsText();
    return reportMap;
  }
  window.initReportMap = initReportMap;

  /* نمایش مختصات انتخاب‌شده در نقشه‌ی کامل (برای بازبینی/ارسال به دیگران) */
  function openReportCoordsInMap() {
    const geo = reportDraft.geo || {};
    if (typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
      showToast('اول موقعیت را انتخاب کنید');
      return;
    }
    const url = 'https://www.openstreetmap.org/?mlat=' + geo.lat.toFixed(6)
      + '&mlon=' + geo.lng.toFixed(6) + '#map=17/' + geo.lat.toFixed(6) + '/' + geo.lng.toFixed(6);
    try {
      if (window.AndroidApp && typeof window.AndroidApp.openUrl === 'function') {
        window.AndroidApp.openUrl(url);
        return;
      }
    } catch (e) {}
    window.open(url, '_blank', 'noopener');
  }
  window.openReportCoordsInMap = openReportCoordsInMap;

  /* پیام‌های دقیق و راهنمای رفع مشکل برای هر نوع خطای موقعیت */
  function geoErrorText(err) {
    const code = err && typeof err.code === 'number' ? err.code : 0;
    if (code === 1) {   /* PERMISSION_DENIED */
      return 'دسترسی به موقعیت بسته است. برای فعال‌سازی: تنظیمات گوشی → برنامه‌ها → ای‌پلاک → مجوزها → موقعیت مکانی → «فقط هنگام استفاده از برنامه»';
    }
    if (code === 2) {
      return 'موقعیت قابل تشخیص نیست. کمی صبر کنید یا در فضای باز دوباره تلاش کنید';
    }
    if (code === 3) {
      return 'زمان گرفتن موقعیت تمام شد؛ دوباره تلاش کنید';
    }
    return 'موقعیت دریافت نشد؛ مختصات را با کشیدن نقشه انتخاب کنید';
  }

  function setGpsButtonBusy(busy) {
    const btn = document.getElementById('reportGpsBtn');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.style.opacity = busy ? '0.65' : '1';
    const label = btn.querySelector('span');
    if (label) label.textContent = busy ? 'در حال دریافت موقعیت…' : 'استفاده از موقعیت فعلی من';
  }

  function applyGeoFix(lat, lng, accuracy) {
    reportDraft.geo = { lat: lat, lng: lng, accuracy: accuracy, source: 'gps' };
    const map = initReportMap(true);
    if (map) map.setPosition(lat, lng);
    if (map) map.setZoom(17);
    coordsText();
    lookupAddress(lat, lng, true);
    showToast('موقعیت شما روی نقشه مشخص شد ✅');
  }

  /* نتیجه‌ی اجازه‌ی دسترسی موقعیت از سمت اندروید */
  window.eplakLocationPermissionResult = function (granted) {
    setGpsButtonBusy(false);
    if (granted && pendingGpsRequest) {
      pendingGpsRequest = false;
      useCurrentLocation();
      return;
    }
    pendingGpsRequest = false;
    if (!granted) {
      showToast('اجازه‌ی موقعیت داده نشد؛ می‌توانید محل را با کشیدن نقشه انتخاب کنید');
    }
  };

  function useCurrentLocation() {
    /* در اپ اندروید ابتدا اجازه‌ی دسترسی به موقعیت گرفته می‌شود */
    try {
      if (window.AndroidApp && typeof window.AndroidApp.hasLocationPermission === 'function'
          && !window.AndroidApp.hasLocationPermission()) {
        pendingGpsRequest = true;
        setGpsButtonBusy(true);
        if (typeof window.AndroidApp.requestLocationPermission === 'function') {
          window.AndroidApp.requestLocationPermission();
          showToast('برای ثبت دقیق محل، اجازه‌ی «موقعیت مکانی» را بدهید');
          return;
        }
      }
    } catch (e) {}

    if (!navigator.geolocation) {
      showToast('این گوشی از موقعیت‌یابی پشتیبانی نمی‌کند؛ محل را روی نقشه انتخاب کنید');
      initReportMap(true);
      return;
    }

    setGpsButtonBusy(true);
    showToast('در حال دریافت موقعیت دقیق…');

    navigator.geolocation.getCurrentPosition(
      function (position) {
        setGpsButtonBusy(false);
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        if (isNaN(lat) || isNaN(lng)) {
          showToast('موقعیت دریافتی نامعتبر بود؛ دوباره تلاش کنید');
          return;
        }
        applyGeoFix(lat, lng, Number(position.coords.accuracy) || 0);
      },
      function (err) {
        setGpsButtonBusy(false);
        /* اگر GPS گوشی خاموش باشد، راهنمای روشن کردنش را نشان می‌دهیم
           (تشخیص از روی پل اندروید؛ در مرورگر این تابع وجود ندارد). */
        let gpsOff = false;
        try {
          if (window.AndroidApp && typeof window.AndroidApp.isLocationServiceEnabled === 'function') {
            gpsOff = !window.AndroidApp.isLocationServiceEnabled();
          }
        } catch (e) {}
        if (gpsOff && (!err || err.code !== 1)) {
          showToast('سرویس موقعیت (GPS) گوشی خاموش است؛ آن را روشن کنید یا محل را با کشیدن نقشه انتخاب کنید');
        } else {
          showToast(geoErrorText(err));
        }
        initReportMap(true);
        /* اگر کاربر قبلاً «دسترسی به موقعیت» گرفتن با گوشی را فعال کرده،
           در اپ اندروید دکمه‌ی میان‌بر تنظیمات را نشان می‌دهیم. */
        try {
          if (err && err.code === 1 && window.AndroidApp && typeof window.AndroidApp.openAppSettings === 'function') {
            pendingGpsRequest = false;
          }
        } catch (e) {}
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function goReportStep3() {
    const locEl = document.getElementById('reportLocationInput');
    reportDraft.location = (locEl ? locEl.value : '').trim();
    const geo = reportDraft.geo || {};
    const hasCoords = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    /* اگر مختصات GPS/نقشه داریم، نوشتن آدرس اجباری نیست */
    if (!reportDraft.location && hasCoords) {
      reportDraft.location = (window.EplakMap && window.EplakMap.formatPosition)
        ? window.EplakMap.formatPosition(geo.lat, geo.lng, 0).replace('عرض ', 'موقعیت: ')
        : ('موقعیت ' + geo.lat.toFixed(5) + ' , ' + geo.lng.toFixed(5));
    }
    if (!reportDraft.location) {
      showToast('لطفاً موقعیت مکانی را مشخص کنید (GPS یا کشیدن نقشه)');
      return;
    }
    showScreen('screen-report-step3');
  }

  /* آدرس پایه‌ی API — فقط از منبع واحد (core/storage.js) خوانده می‌شود */
  function apiBase() {
    if (typeof window.eplakApiBase === 'function') {
      return window.eplakApiBase();
    }
    return String(window.EPLAK_API_BASE_URL || 'api').replace(/\/+$/, '');
  }

  /* آدرس پیوست‌ها: در اپ اندروید (file://) باید به دامنه‌ی سرور وصل شود */
  function mediaUrlOf(path) {
    return (typeof window.eplakResolveMediaUrl === 'function')
      ? window.eplakResolveMediaUrl(path)
      : String(path || '');
  }

  /* حداکثر حجم مجاز برای هر فایل — هم‌راستا با محدودیت سرور (shared/media.php) */
  const REPORT_MEDIA_MAX_IMAGE_MB = 12;
  const REPORT_MEDIA_MAX_VIDEO_MB = 60;

  /* تشخیص عکس/فیلم — در برخی گوشی‌ها file.type خالی است، پس پسوند هم بررسی می‌شود */
  function detectMediaKind(file) {
    const type = (file.type || '').toLowerCase();
    if (type.indexOf('video/') === 0) return 'video';
    if (type.indexOf('image/') === 0) return 'image';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'mov', 'webm', '3gp', 'mkv', 'avi', 'mpg'].indexOf(ext) > -1) return 'video';
    return 'image';
  }

  /* افزودن عکس/فیلم انتخاب‌شده به پیش‌نویس — فایل واقعی نگه داشته می‌شود تا
     هنگام ثبت گزارش به سرور آپلود شود (قبلاً فقط نام فایل ذخیره می‌شد و هیچ
     فایلی به سرور نمی‌رفت، بنابراین در پنل مدیریت چیزی دیده نمی‌شد). */
  /* وضعیت ارسال پیوست‌ها روی صفحه‌ی «گزارش ثبت شد» — کاربر باید ببیند عکس و
     فیلمش واقعاً در حال رفتن به سرور است و بعد هم تأیید بگیرد. */
  function setUploadStatus(text, tone) {
    const el = document.getElementById('reportUploadStatus');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.style.color = (tone === 'error') ? '#ef4444' : (tone === 'done' ? 'var(--teal)' : 'var(--text-muted)');
  }
  window.setReportUploadStatus = setUploadStatus;

  /* ── فشرده‌سازی عکس پیش از ارسال ──────────────────────────────────────
     دوربین گوشی‌های امروزی عکس ۳ تا ۸ مگابایتی می‌سازد؛ اگر همان‌طور ارسال شود
     آپلود روی اینترنت موبایل کند می‌شود و بعضی هاست‌ها هم قبول نمی‌کنند. اینجا
     عکس تا حداکثر ۱۶۰۰ پیکسل کوچک و با کیفیت ۸۲٪ به JPEG تبدیل می‌شود
     (حجم نمونه‌ی معمول: ۲۰۰ تا ۵۰۰ کیلوبایت) — عکس‌های کوچک‌تر از ۴۰۰ کیلوبایت
     دست‌نخورده می‌مانند تا کیفیت بی‌دلیل کم نشود. GIF و HEIC هم دست‌نخورده
     می‌مانند (یا متحرک‌اند یا مرورگر اندروید نمی‌تواند بازشان کند). */
  const REPORT_IMAGE_MAX_SIDE = 1600;
  const REPORT_IMAGE_QUALITY = 0.82;
  const REPORT_IMAGE_SKIP_BELOW = 400 * 1024;

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
      } else {
        try {
          const dataUrl = canvas.toDataURL(type, quality);
          const bin = atob(dataUrl.split(',')[1] || '');
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(new Blob([bytes], { type: type }));
        } catch (e) { resolve(null); }
      }
    });
  }

  async function compressReportImage(file) {
    const type = (file.type || '').toLowerCase();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (type === 'image/gif' || ext === 'gif' || type === 'image/heic' || type === 'image/heif') return file;
    if (file.size <= REPORT_IMAGE_SKIP_BELOW) return file;

    const img = await loadImageElement(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, REPORT_IMAGE_MAX_SIDE / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    /* پس‌زمینه‌ی سفید برای عکس‌های شفاف (PNG) تا تبدیل به JPEG سیاه نشود */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await canvasToBlob(canvas, 'image/jpeg', REPORT_IMAGE_QUALITY);
    if (!blob || blob.size >= file.size) return file;

    const newName = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    try {
      return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (e) {
      /* مرورگرهای قدیمی که سازنده‌ی File را پشتیبانی نمی‌کنند */
      blob.name = newName;
      return blob;
    }
  }

  function formatFileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (Math.round(n / (1024 * 1024) * 10) / 10) + ' مگابایت';
    return Math.max(1, Math.round(n / 1024)) + ' کیلوبایت';
  }

  async function addReportPhotos(input) {
    const files = Array.from(input.files || []);
    const remaining = 3 - reportDraft.photos.length;
    if (remaining <= 0) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
      input.value = '';
      return;
    }

    const chosen = files.slice(0, remaining);
    if (files.length > remaining) {
      showToast('حداکثر ۳ فایل می‌توانید پیوست کنید');
    }

    /* حجم‌های غیرمجاز همان‌جا رد می‌شوند تا کاربر بعد از ثبت گزارش غافلگیر نشود */
    let rejected = 0;
    const accepted = [];
    chosen.forEach(file => {
      const kind = detectMediaKind(file);
      const maxMb = kind === 'video' ? REPORT_MEDIA_MAX_VIDEO_MB : REPORT_MEDIA_MAX_IMAGE_MB;
      if (file.size > maxMb * 1024 * 1024) {
        rejected++;
        showToast('حجم ' + (kind === 'video' ? 'فیلم' : 'عکس') + ' «' + file.name + '» بیش از ' + maxMb + ' مگابایت است؛ فایل سبک‌تری انتخاب کنید');
        return;
      }
      accepted.push({ file: file, kind: kind });
    });

    if (accepted.some(item => item.kind === 'image')) {
      showToast('در حال آماده‌سازی عکس‌ها…');
    }

    for (const item of accepted) {
      let file = item.file;
      if (item.kind === 'image') {
        try {
          file = await compressReportImage(item.file);
        } catch (e) {
          file = item.file;   /* اگر فشرده‌سازی نشد، همان فایل اصلی ارسال می‌شود */
        }
      }
      reportDraft.photos.push({
        file: file,
        name: file.name || item.file.name,
        kind: item.kind,
        size: file.size,
        previewUrl: URL.createObjectURL(file)
      });
    }

    const videos = accepted.filter(item => item.kind === 'video');
    if (videos.length && rejected === 0) {
      const biggest = videos.reduce((a, b) => (a.file.size > b.file.size ? a : b));
      if (biggest.file.size > 20 * 1024 * 1024) {
        showToast('فیلم ' + formatFileSize(biggest.file.size) + ' است؛ ارسالش کمی طول می‌کشد');
      }
    }

    renderReportPhotosPreview();
    input.value = '';
  }

  function renderReportPhotosPreview() {
    const wrap = document.getElementById('reportPhotosPreview');
    if (!wrap) return;
    wrap.innerHTML = reportDraft.photos.map((item, idx) => {
      const preview = (item.kind === 'video')
        ? '<span style="font-size:24px;">🎬</span>'
        : '<img src="' + item.previewUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:11px;">';
      return `
      <div style="position:relative; width:68px; height:68px; border-radius:12px; background:var(--card-bg); border:1px solid var(--card-border); display:flex; align-items:center; justify-content:center; font-size:22px; overflow:hidden;">
        ${preview}
        <span onclick="removeReportPhoto(${idx})" style="position:absolute; top:2px; left:2px; width:20px; height:20px; background:rgba(255,60,60,0.92); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; color:white; cursor:pointer; z-index:2;">✕</span>
      </div>`;
    }).join('');
  }

  function removeReportPhoto(idx) {
    const removed = reportDraft.photos.splice(idx, 1)[0];
    if (removed && removed.previewUrl) {
      try { URL.revokeObjectURL(removed.previewUrl); } catch (e) {}
    }
    renderReportPhotosPreview();
  }

  function goReportStep4() {
    document.getElementById('confirmDeptText').textContent = reportDraft.subDepartment
      ? (reportDraft.department + ' / ' + reportDraft.subDepartment) : '—';
    document.getElementById('confirmDescText').textContent = reportDraft.desc || '—';
    const geo = reportDraft.geo || {};
    const hasCoords = typeof geo.lat === 'number' && typeof geo.lng === 'number';
    document.getElementById('confirmLocationText').textContent = hasCoords
      ? ((reportDraft.location || '') + ' — ' + geo.lat.toFixed(5) + ' , ' + geo.lng.toFixed(5))
      : (reportDraft.location || '—');
    document.getElementById('confirmPhotoCount').textContent = `${toPersianDigits(reportDraft.photos.length)} فایل (عکس/فیلم)`;
    showScreen('screen-report-step4');
  }

  async function submitNewReport() {
    const iconMap = { 'سایر': '⋯', 'نظافت': '💡', 'زیرساخت': '🌿', 'زیرسبز': '🌳', 'روشنایی': '🔆' };
    const currentPhone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    const title = (reportDraft.desc || '').slice(0, 28) || (reportDraft.type + ' - گزارش جدید');
    const nowIso = new Date().toISOString();
    const code = 'EP-1403-' + String(1000 + reports.length + 1).padStart(4, '0');

    const newReport = {
      id: `r${reportIdCounter++}`,
      code,
      title,
      location: reportDraft.location || 'نامشخص',
      lat: (reportDraft.geo && typeof reportDraft.geo.lat === 'number') ? reportDraft.geo.lat : null,
      lng: (reportDraft.geo && typeof reportDraft.geo.lng === 'number') ? reportDraft.geo.lng : null,
      rawDate: nowIso,
      date: formatReportDate(nowIso),
      dateTime: formatReportDateTime(nowIso),
      status: 'pending',
      icon: iconMap[reportDraft.type] || '📋',
      iconBg: 'rgba(0,201,167,0.12)',
      desc: reportDraft.desc || 'بدون توضیحات',
      department: reportDraft.department || '',
      subDepartment: reportDraft.subDepartment || '',
      reply: '',
      timeline: [],
      /* پیش‌نمایش محلی فایل‌های پیوست تا در جزئیات گزارش هم بلافاصله دیده شوند */
      media: (reportDraft.photos || []).map(item => ({
        kind: item.kind,
        url: item.previewUrl,
        local: true,
        name: item.name,
        size: item.size
      })),
      pendingSync: true   // تا زمان تأیید سرور؛ در صورت قطع اینترنت بعداً ارسال می‌شود
    };

    // 1. ذخیره سریع و آنی در حافظه محلی (بدون کوچکترین لگ یا مکث)
    reports.unshift(newReport);
    if (typeof saveReports === 'function') saveReports(currentPhone);

    // 2. نمایش بلادرنگ کد پیگیری در المان صفحه نتیجه (0ms Latency)
    const trackElem = document.getElementById('successTrackCode');
    if (trackElem) trackElem.textContent = code;

    // 3. پخش صدای موفقیت
    if (window.soundManager && typeof window.soundManager.playDing === 'function') {
      window.soundManager.playDing();
    }

    // 4. نمایش فوری صفحه موفقیت بدون معطلی شبکه
    showScreen('screen-report-success');

    // 5. پاک‌سازی فرم پیش‌نویس (فایل‌ها قبل از پاک‌سازی در متغیر نگه داشته می‌شوند)
    const draftPhotos = (reportDraft.photos || []).slice();
    const draftPayload = {
      userPhone: currentPhone,
      title: newReport.title,
      description: newReport.desc || newReport.title,
      category: newReport.subDepartment || newReport.department || 'سایر',
      department: newReport.department || '',
      subDepartment: newReport.subDepartment || '',
      location: newReport.location || ''
    };
    /* مختصات دقیق موقعیت (از GPS گوشی یا نشانگر نقشه) — برای نمایش روی نقشه
       در پنل ادمین و برای مسیریابی اکیپ شهرداری */
    if (typeof newReport.lat === 'number' && typeof newReport.lng === 'number') {
      draftPayload.lat = newReport.lat;
      draftPayload.lng = newReport.lng;
      draftPayload.location = (newReport.location && newReport.location !== 'نامشخص')
        ? newReport.location
        : (newReport.lat.toFixed(6) + ' , ' + newReport.lng.toFixed(6));
    }
    resetReportDraft();

    // 6. ارسال ناهمگام به سرور در پس‌زمینه (کاملاً موازی بدون قفل کردن رابط کاربری)
    if (currentPhone) {
      const filesToUpload = (draftPhotos || []).map(item => item.file).filter(Boolean);

      /* ── چرا دیگر FormData نمی‌فرستیم؟ ────────────────────────────────
         هاست فعلی، درخواست multipart/form-data که فایل دارد را با کد 403
         می‌بندد (فایروال ModSecurity/Imunify). مسیر JSON باز است، پس:
           • فایل‌های کوچک (عکس فشرده‌شده و فیلم کوتاه) داخل همان JSON
             به‌صورت base64 همراه گزارش می‌روند — یک درخواست، همان لحظه.
           • فایل‌های حجیم (فیلم) پس از ساخته شدن گزارش، تکه‌تکه (۱ مگابایتی)
             به api/media.php فرستاده و روی سرور به هم چسبانده می‌شوند. */
      const INLINE_MAX_FILE = 6 * 1024 * 1024;      /* هر فایل تا ۶ مگابایت */
      const INLINE_MAX_TOTAL = 12 * 1024 * 1024;    /* مجموع تا ۱۲ مگابایت */
      const inlineFiles = [];
      const largeFiles = [];
      let inlineBytes = 0;
      filesToUpload.forEach(file => {
        if (file.size <= INLINE_MAX_FILE && (inlineBytes + file.size) <= INLINE_MAX_TOTAL) {
          inlineFiles.push(file);
          inlineBytes += file.size;
        } else {
          largeFiles.push(file);
        }
      });

      const reportPayload = Object.assign({}, draftPayload);

      const preparePayload = async () => {
        if (!inlineFiles.length) return true;
        setUploadStatus('در حال آماده‌سازی ' + toPersianDigits(filesToUpload.length) + ' پیوست (عکس/فیلم)…');
        const items = [];
        for (const file of inlineFiles) {
          const dataUrl = (typeof window.eplakReadFileAsDataUrl === 'function')
            ? await window.eplakReadFileAsDataUrl(file)
            : '';
          if (!dataUrl) {
            showToast('خواندن فایل «' + file.name + '» ممکن نشد؛ دوباره تلاش کنید');
            return false;
          }
          items.push({ name: file.name || 'attachment', mime: file.type || '', data: dataUrl });
        }
        reportPayload.media = items;
        return true;
      };

      const sendReport = preparePayload().then(ready => {
        if (!ready) return null;
        if (typeof window.syncJsonToBackendWithProgress === 'function') {
          return window.syncJsonToBackendWithProgress('reports', reportPayload, pct => {
            setUploadStatus('در حال ارسال گزارش و پیوست‌ها… ' + toPersianDigits(Math.max(1, pct)) + '٪');
          });
        }
        return (typeof window.syncDataToBackend === 'function')
          ? window.syncDataToBackend('reports', reportPayload)
          : Promise.resolve(null);
      });

      sendReport
        .then(async backendRes => {
          if (backendRes && backendRes.tracking_code) {
            newReport.code = backendRes.tracking_code;
            if (backendRes.id) {
              /* شناسه‌ی سروری جایگزین شناسه‌ی موقت محلی می‌شود تا حذف/جزئیات
                 دقیقاً به همان رکورد سرور اشاره کند */
              newReport.backendId = backendRes.id;
              newReport.id = String(backendRes.id);
            }
            delete newReport.pendingSync;

            /* فایل‌های تأییدشده‌ی سرور جای پیش‌نمایش‌های محلی را می‌گیرند تا در
               جزئیات گزارش، همان فایل واقعی ذخیره‌شده روی سرور نمایش داده شود. */
            if (Array.isArray(backendRes.media) && backendRes.media.length) {
              newReport.media = backendRes.media.map(item => ({
                kind: item.kind,
                url: mediaUrlOf(item.url),
                name: item.name,
                size: item.size
              }));
            }
            if (filesToUpload.length > 0) {
              const savedCount = Array.isArray(backendRes.media) ? backendRes.media.length : 0;
              const pendingLarge = largeFiles.length;
              if (Array.isArray(backendRes.media_errors) && backendRes.media_errors.length) {
                setUploadStatus('⚠️ ' + backendRes.media_errors[0], 'error');
                showToast('برخی فایل‌ها ذخیره نشد: ' + backendRes.media_errors[0]);
              } else if (savedCount === 0) {
                setUploadStatus('⚠️ پیوست‌ها ذخیره نشدند؛ حجم فایل را کم کنید و دوباره تلاش کنید', 'error');
                showToast('پیوست‌ها ذخیره نشدند؛ حجم فایل را کم کنید و دوباره تلاش کنید');
              } else if (pendingLarge > 0) {
                setUploadStatus('✅ ' + toPersianDigits(savedCount) + ' پیوست ارسال شد؛ ارسال ' + toPersianDigits(pendingLarge) + ' فایل حجیم در حال انجام است…', 'done');
              } else {
                setUploadStatus('✅ ' + toPersianDigits(savedCount) + ' پیوست با موفقیت ارسال و در پنل شهرداری ثبت شد', 'done');
                showToast('عکس/فیلم‌ها با موفقیت ارسال شد ✅');
              }
            } else {
              setUploadStatus('');
            }

            const currentTrackElem = document.getElementById('successTrackCode');
            if (currentTrackElem && (currentTrackElem.textContent === code || !currentTrackElem.textContent)) {
              currentTrackElem.textContent = backendRes.tracking_code;
            }
            if (typeof saveReports === 'function') saveReports(currentPhone);
          }
          else if (backendRes && backendRes.success === false) {
            /* سرور دلیل دقیق را گفته است (مثلاً حجم فایل بیش از حد مجاز) */
            const reason = String(backendRes.error || '').trim();
            setUploadStatus('⚠️ ' + (reason !== '' ? reason : 'پیوست‌ها ذخیره نشدند'), 'error');
            showToast(reason !== ''
              ? ('گزارش ذخیره شد ولی پیوست ارسال نشد: ' + reason)
              : 'گزارش ذخیره شد ولی پیوست‌ها به سرور نرسیدند');
          } else if (!backendRes) {
            setUploadStatus('⚠️ گزارش ثبت شد ولی پیوست‌ها به سرور نرسیدند؛ اینترنت را بررسی کنید', 'error');
            showToast('گزارش ثبت شد ولی ارتباط با سرور برقرار نشد؛ پیوست‌ها ارسال نشدند');
          }

          /* ── فایل‌های حجیم (فیلم): ارسال تکه‌تکه پس از ساخته شدن گزارش ── */
          if (largeFiles.length && newReport.backendId && typeof window.uploadReportMediaChunked === 'function') {
            try {
              setUploadStatus('در حال ارسال ' + toPersianDigits(largeFiles.length) + ' فیلم/فایل حجیم…');
              const chunkRes = await window.uploadReportMediaChunked(
                newReport.backendId, currentPhone, largeFiles,
                pct => setUploadStatus('در حال ارسال فیلم… ' + toPersianDigits(Math.max(1, pct)) + '٪')
              );
              if (chunkRes && chunkRes.ok && chunkRes.media.length) {
                const merged = (Array.isArray(newReport.media) ? newReport.media : []).concat(
                  chunkRes.media.map(item => ({
                    kind: item.kind,
                    url: mediaUrlOf(item.url),
                    name: item.name,
                    size: item.size
                  }))
                );
                newReport.media = merged;
                if (typeof saveReports === 'function') saveReports(currentPhone);
                setUploadStatus('✅ ' + toPersianDigits(merged.length) + ' پیوست با موفقیت ارسال و در پنل شهرداری ثبت شد', 'done');
                showToast('فیلم/فایل‌های حجیم با موفقیت ارسال شد ✅');
              } else if (chunkRes && chunkRes.unsupported) {
                setUploadStatus('⚠️ ارسال فایل حجیم روی این هاست فعال نیست؛ بسته‌ی تازه‌ی سایت را روی هاست Extract کنید', 'error');
                showToast('برای ارسال فیلم، بسته‌ی تازه‌ی سایت را روی هاست Extract کنید');
              } else {
                const reason = (chunkRes && chunkRes.error) ? chunkRes.error : 'ارسال فایل حجیم ناموفق بود';
                setUploadStatus('⚠️ گزارش ثبت شد ولی ' + reason, 'error');
                showToast(reason);
              }
            } catch (e) {
              console.warn('[reports] chunked upload note:', e);
              setUploadStatus('⚠️ ارسال فایل حجیم ناموفق بود؛ دوباره تلاش کنید', 'error');
            }
          }

          if (typeof loadReportsFromBackend === 'function') {
            loadReportsFromBackend(currentPhone, { silent: true });
          }
          /* اعلان «درخواست شما ثبت شد» تا این لحظه در سرور ساخته شده است؛
             همین حالا فهرست اعلان‌ها را تازه می‌کنیم تا پیام و کد پیگیری
             بلافاصله به کاربر نشان داده شود. */
          if (typeof window.refreshNotificationsNow === 'function') {
            try { window.refreshNotificationsNow(); } catch (e) {}
          }
        })
        .catch(err => {
          console.warn('[reports] background sync note:', err);
          setUploadStatus('⚠️ ارسال به سرور انجام نشد؛ با وصل بودن اینترنت دوباره تلاش کنید', 'error');
          showToast('ارسال گزارش به سرور انجام نشد؛ با وصل بودن اینترنت دوباره تلاش می‌شود');
        });
    }
  }
  window.submitNewReport = submitNewReport;

  /* با باز شدن صفحه‌ی «موقعیت»، نقشه ساخته می‌شود و با بازگشت به آن،
     کاشی‌ها یک‌بار دیگر هم‌اندازه‌گیری می‌شوند تا کامل دیده شوند. */
  window.addEventListener('eplak-screen-shown', function (ev) {
    const id = ev && ev.detail ? ev.detail.id : '';
    if (id !== 'screen-report-step2') return;
    let tries = 0;
    const build = function () {
      tries++;
      const map = initReportMap(false);
      if (map) {
        map.refresh();
      } else if (tries < 6) {
        /* ارتفاع کادر نقشه ممکن است کمی دیر تعیین شود (انیمیشن ورود صفحه) */
        setTimeout(build, 200);
      }
      coordsText();
    };
    setTimeout(build, 60);
  });


  /* =========================================================
     Reports List / Filter / Detail
  ========================================================= */
  function renderReportsList(filter, options = {}) {
    const wrap = document.getElementById('reportsListWrap');
    if (!wrap) return;

    const normalizedFilter = normalizeStatusValue(filter ?? 'all');

    const doRender = () => {
      const list = normalizedFilter === 'all'
        ? reports
        : reports.filter(r => normalizeStatusValue(r.status) === normalizedFilter || (normalizeStatusValue(r.status) === 'in_progress' && normalizedFilter === 'in_progress'));

      const countBadge = document.getElementById('reportsCountBadge');
      if (countBadge) countBadge.textContent = toPersianDigits(reports.length);

      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');
      const deleteWord = isEn ? 'Delete' : 'حذف';
      const emptyMsg = isEn ? 'No reports found in this category' : 'گزارشی در این دسته یافت نشد';

      if (list.length === 0) {
        wrap.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">${emptyMsg}</div>`;
        return;
      }
      wrap.innerHTML = list.map(r => {
        const statusMeta = getStatusMeta(r.status);
        const displayDate = r.dateTime || r.date || '—';
        return `
          <div class="report-swipe">
            <div class="report-delete-bg" onpointerdown="event.stopPropagation()" onclick="deleteReport('${r.id}', event)">
              <div class="delete-action" style="color:#ef4444;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6 L19,20 a2,2 0 0 1 -2,2 H7 a2,2 0 0 1 -2,-2 L5,6"/><path d="M8,6 V4 a2,2 0 0 1 2,-2 h4 a2,2 0 0 1 2,2 v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span style="color:#ef4444; font-weight:800;">${deleteWord}</span>
              </div>
            </div>
            <div class="report-swipe-item" onclick="openReportDetail('${r.id}')">
              <div class="report-item">
                <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
                <div class="report-info">
                  <h4>${escapeHtml(r.title)}</h4>
                  <p>${escapeHtml(r.location)} - ${displayDate}</p>
                </div>
                <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      initReportSwipe();
    };

    // رندر آنی بدون تاخیر از حافظه موجود
    doRender();

    // همگام‌سازی نامحسوس در پس‌زمینه با سرور
    const phone = getCurrentPhone();
    renderUserTicketsList();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(err => {
        console.warn('[reports] silent reload note:', err);
      });
      loadTicketsFromBackend(phone).then(() => {
        renderUserTicketsList();
      }).catch(() => {});
    }
  }
  window.renderReportsList = renderReportsList;

  async function deleteReport(id, e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const targetId = String(id || activeReportId || '').trim();
    if (!targetId) return;

    const idx = reports.findIndex(r => String(r.id).trim() === targetId || String(r.code).trim() === targetId);
    if (idx === -1) {
      console.warn('[reports] report to delete not found:', targetId);
      return;
    }

    const removedReport = reports[idx];
    const backendId = getReportBackendId(removedReport);
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';

    /* ۱. قبل از هر چیز شناسه در فهرست «در انتظار حذف» ثبت می‌شود تا
          همگام‌سازی پس‌زمینه (هر ۳.۵ ثانیه) گزارش را برنگرداند. */
    if (backendId !== null) {
      pendingDeleteIds.add(String(backendId));
      savePendingDeletes();
    }

    /* ۲. حذف آنی از حافظه و رابط کاربری */
    reports.splice(idx, 1);
    if (activeReportId === removedReport.id) activeReportId = null;
    if (typeof saveReports === 'function') {
      saveReports(phone);
    }

    const rerenderAll = () => {
      const activeTab = document.querySelector('#reportsFilterTabs .filter-tab.active');
      const filter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
      renderReportsList(filter, { skipBackend: true });
      if (typeof renderProfileReportsSummary === 'function') {
        renderProfileReportsSummary({ skipBackend: true });
      }
      if (typeof renderProfileTrackingQuick === 'function') {
        renderProfileTrackingQuick({ skipBackend: true });
      }
      if (typeof renderTrackRecent === 'function') {
        renderTrackRecent({ skipBackend: true });
      }
    };
    rerenderAll();

    /* ۳. حذف قطعی در سرور (فقط برای گزارش‌هایی که در سرور ثبت شده‌اند) */
    if (phone && backendId !== null) {
      try {
        await requestBackendDelete(backendId, phone);
        pendingDeleteIds.delete(String(backendId));
        savePendingDeletes();
      } catch (err) {
        /* شناسه در فهرست «در انتظار حذف» می‌ماند و در همگام‌سازی بعدی
           دوباره تلاش می‌شود؛ تا آن زمان هم به لیست برنمی‌گردد. */
        console.warn('[reports] backend delete deferred:', err && err.message ? err.message : err);
      }
    }

    showToast('گزارش با موفقیت حذف شد');
  }

  window.deleteReport = deleteReport;
  window.deleteCurrentOpenReport = function() {
    if (!activeReportId) return;
    deleteReport(activeReportId);
    if (typeof goBack === 'function') goBack();
  };

  /* =========================================================
     Swipe-to-delete gesture for report items
  ========================================================= */
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.report-swipe')) return;
    document.querySelectorAll('#reportsListWrap .report-swipe-item.open, #userTicketsListWrap .report-swipe-item.open').forEach(el => {
      el.style.transform = 'translateX(0)';
      el.classList.remove('open');
    });
  });

  function initReportSwipe() {
    const SWIPE_OPEN = -88; // px the item shifts to reveal the delete action
    const items = document.querySelectorAll('#reportsListWrap .report-swipe-item, #userTicketsListWrap .report-swipe-item');

    function closeSwipeItem(el) {
      el.style.transform = 'translateX(0)';
      el.classList.remove('open');
    }

    function closeAllExcept(except) {
      document.querySelectorAll('#reportsListWrap .report-swipe-item.open, #userTicketsListWrap .report-swipe-item.open').forEach(el => {
        if (el !== except) closeSwipeItem(el);
      });
    }

    items.forEach(item => {
      let startX = 0;
      let baseX = 0;
      let dragging = false;
      let moved = false;

      item.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        baseX = item.classList.contains('open') ? SWIPE_OPEN : 0;
        item.classList.add('swiping');
        closeAllExcept(item);
        try { item.setPointerCapture(e.pointerId); } catch (err) {}
      });

      item.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        if (Math.abs(delta) > 6) moved = true;
        let next = baseX + delta;
        if (next > 0) next = next * 0.25; // rubber-band past the resting point
        if (next < SWIPE_OPEN) next = SWIPE_OPEN + (next - SWIPE_OPEN) * 0.2; // rubber-band past open
        item.style.transform = `translateX(${next}px)`;
      });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        item.classList.remove('swiping');
        const match = /translateX\((-?\d+\.?\d*)px\)/.exec(item.style.transform || '');
        const x = match ? parseFloat(match[1]) : 0;
        if (x < SWIPE_OPEN / 2) {
          item.style.transform = `translateX(${SWIPE_OPEN}px)`;
          item.classList.add('open');
        } else {
          closeSwipeItem(item);
        }
      }

      item.addEventListener('pointerup', endDrag);
      item.addEventListener('pointercancel', endDrag);

      // Prevent the tap-to-open-detail click from firing right after a swipe,
      // and let a tap on an already-open item close it instead of navigating.
      item.addEventListener('click', (e) => {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
        if (item.classList.contains('open')) {
          e.preventDefault();
          e.stopPropagation();
          closeSwipeItem(item);
        }
      }, true);
    });
  }

  function filterReports(filter, btn) {
    const safeFilter = normalizeStatusValue(filter ?? 'all');
    document.querySelectorAll('#reportsFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReportsList(safeFilter);
  }

  function openReportDetail(id) {
    const r = reports.find(x => String(x.id) === String(id) || String(x.code) === String(id));
    if (!r) return;
    const safeStatus = normalizeStatusValue(r.status);
    const statusMeta = getStatusMeta(safeStatus);
    const replyText = (r.reply || r.admin_reply || r.response || '').trim();
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const translateText = text => (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t(text) : text;

    // قالب‌بندی کامل تاریخ همراه با ساعت برای بخش روند رسیدگی زیر ثبت گزارش
    const submitDateTime = formatReportDateTime(r.rawDate || r.created_at || r.dateTime || r.date);

    let timelineBase;
    if (Array.isArray(r.timeline) && r.timeline.length) {
      timelineBase = r.timeline.map((step, idx) => {
        if (idx === 0 && (!step.date || step.date === '—' || !step.date.includes(':'))) {
          return { ...step, date: submitDateTime };
        }
        return step;
      });
    } else {
      timelineBase = [
        { label: translateText('ثبت گزارش'), date: submitDateTime, done: true },
        { label: translateText('بررسی اولیه'), date: (safeStatus === 'in_progress' || safeStatus === 'done') ? submitDateTime : '—', done: safeStatus === 'in_progress' || safeStatus === 'done' },
        { label: translateText('ارجاع به واحد مربوطه'), date: safeStatus === 'done' ? '—' : '—', done: safeStatus === 'done' },
        { label: translateText('پاسخ مدیریت'), date: replyText ? '—' : '—', done: !!replyText }
      ];
    }

    activeReportId = id;
    document.getElementById('detailIconBox').style.background = r.iconBg;
    document.getElementById('detailIconBox').innerHTML = window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon;
    document.getElementById('detailTitle').textContent = r.title;
    document.getElementById('detailDate').textContent = submitDateTime;
    const statusEl = document.getElementById('detailStatus');
    statusEl.className = 'report-status ' + statusMeta.className;
    statusEl.textContent = statusMeta.label;
    document.getElementById('detailCode').textContent = r.code;
    document.getElementById('detailLocation').textContent = r.location;
    document.getElementById('detailDept').textContent = (r.department && r.subDepartment)
      ? (r.department + ' / ' + r.subDepartment) : '—';
    document.getElementById('detailDesc').textContent = r.desc;

    /* عکس‌ها و فیلم‌های ارسالی برای این گزارش */
    const mediaWrap = document.getElementById('detailMediaWrap');
    if (mediaWrap) {
      const mediaList = Array.isArray(r.media) ? r.media : [];
      if (!mediaList.length) {
        mediaWrap.style.display = 'none';
        mediaWrap.innerHTML = '';
      } else {
        mediaWrap.style.display = 'block';
        mediaWrap.innerHTML = `
          <div class="section-title" style="padding:0 4px;">${translateText('تصاویر و فیلم‌های ارسالی')}</div>
          <div class="glass-card" style="padding:14px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              ${mediaList.map(m => (m.kind === 'video')
                ? `<video src="${escapeHtml(mediaUrlOf(m.url || ''))}" controls preload="metadata" playsinline
                          style="width:100%; max-width:320px; border-radius:12px; background:#000;"></video>`
                : `<a href="${escapeHtml(mediaUrlOf(m.url || ''))}" target="_blank" rel="noopener"
                      style="display:block; width:86px; height:86px; border-radius:12px; overflow:hidden; border:1px solid var(--card-border);">
                     <img src="${escapeHtml(mediaUrlOf(m.url || ''))}" alt="${escapeHtml(m.name || '')}" loading="lazy"
                          style="width:100%; height:100%; object-fit:cover;"
                          onerror="this.closest('a').style.display='none';">
                   </a>`).join('')}
            </div>
          </div>`;
      }
    }

    const replyWrap = document.getElementById('detailReplyWrap');
    if (replyWrap) {
      if (replyText) {
        replyWrap.style.display = 'block';
        replyWrap.innerHTML = `
          <div style="text-align:right;">
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">${translateText('پاسخ مدیریت')}</p>
            <p style="font-size:13px; line-height:1.8; color:var(--text-primary);">${escapeHtml(replyText)}</p>
          </div>
        `;
      } else {
        replyWrap.style.display = 'none';
        replyWrap.innerHTML = '';
      }
    }

    document.getElementById('detailTimeline').innerHTML = timelineBase.map((step, idx) => {
      const isLast = idx === timelineBase.length - 1;
      const dotClass = step.done ? 'done' : (idx > 0 && timelineBase[idx - 1].done && !step.done ? 'current' : '');
      return `
        <div class="timeline-row">
          <div class="timeline-marker">
            <div class="timeline-dot ${dotClass}"></div>
            ${!isLast ? `<div class="timeline-line ${step.done ? 'done' : ''}"></div>` : ''}
          </div>
          <div class="timeline-content">
            <h5>${escapeHtml(step.label)}</h5>
            <p>${step.date || '—'}</p>
          </div>
        </div>`;
    }).join('');
    showScreen('screen-report-detail');
  }


  /* =========================================================
     Track Request
  ========================================================= */
  function getTrackingInputElement() {
    const primary = document.getElementById('trackCodeInput');
    if (primary) return primary;
    const profileInput = document.getElementById('profileTrackCodeInput');
    if (profileInput) return profileInput;
    return document.getElementById('homeTrackCodeInput');
  }

  function getTrackingResultBox() {
    const primary = document.getElementById('trackResultBox');
    if (primary) return primary;
    const profileBox = document.getElementById('profileTrackResultBox');
    if (profileBox) return profileBox;
    return document.getElementById('homeTrackResultBox');
  }

  function renderProfileReportsSummary(options = {}) {
    const wrap = document.getElementById('profileReportsList');
    if (!wrap) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');

      if (!reports.length) {
        const msg = isEn ? 'No reports submitted yet.' : 'هنوز گزارشی ثبت نشده است.';
        wrap.innerHTML = `<div style="padding:14px 0; color:var(--text-muted); font-size:13px; text-align:center;">${msg}</div>`;
        return;
      }

      wrap.innerHTML = reports.slice(0, 3).map(r => {
        const statusMeta = getStatusMeta(r.status);
        return `
          <div class="report-item" onclick="openReportDetail('${r.id}')">
            <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
            <div class="report-info">
              <h4>${escapeHtml(r.title)}</h4>
              <p>${escapeHtml(r.code || '—')}</p>
            </div>
            <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
          </div>
        `;
      }).join('');
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function renderHomeReportsSummary() {
    return renderProfileReportsSummary();
  }

  function renderReportListCards(items, box) {
    if (!box) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    if (!Array.isArray(items) || !items.length) {
      const msg = isEn ? 'No reports to display at the moment.' : 'در حال حاضر گزارشی برای نمایش وجود ندارد.';
      box.innerHTML = `<div style="padding:12px 0; color:var(--text-muted); font-size:12.5px; text-align:center;">${msg}</div>`;
      return;
    }

    box.innerHTML = items.map(r => {
      const statusMeta = getStatusMeta(r.status);
      return `
        <div class="report-item" onclick="openReportDetail('${r.id}')">
          <span class="report-status ${statusMeta.className}">${statusMeta.label}</span>
          <div class="report-info">
            <h4>${escapeHtml(r.title)}</h4>
            <p>${escapeHtml(r.code || '—')}</p>
          </div>
          <div class="report-icon-box" style="background:${r.iconBg};">${window.EplakIcons ? window.EplakIcons.get(r.icon) : r.icon}</div>
        </div>
      `;
    }).join('');
  }

  function renderProfileTrackingQuick(options = {}) {
    const box = document.getElementById('profileTrackResultBox');
    if (!box) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');

      const input = document.getElementById('profileTrackCodeInput');
      if (!input || !input.value.trim()) {
        renderReportListCards(reports, box);
        return;
      }

      const code = input.value.trim();
      if (!code) return;
      const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
      const found = reports.find(r => {
        const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
        const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
        return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
      });
      if (!found) {
        const notFoundMsg = isEn ? 'No report found with this tracking code' : 'گزارشی با این کد پیگیری یافت نشد';
        box.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted);">${notFoundMsg}</div>`;
        return;
      }
      renderReportListCards([found], box);
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      loadReportsFromBackend(phone, { silent: true }).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function renderHomeTrackingQuick() {
    return renderProfileTrackingQuick();
  }

    /* =========================================================
     Request & Ticket Tracking (پیگیری درخواست‌ها و تیکت‌ها)
  ========================================================= */
  let activeTrackFilter = 'all';

  function filterTrackList(filter, btnEl) {
    activeTrackFilter = filter;
    document.querySelectorAll('#trackFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderTrackRecent({ skipBackend: true });
  }

  function renderTrackRecent(options = {}) {
    const wrap = document.getElementById('trackRecentList');
    const resultBox = getTrackingResultBox();
    if (!wrap) return;

    const doRender = () => {
      const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
        ? window.i18n.getLanguage() === 'en'
        : (window.i18n && window.i18n.currentLang === 'en');
      const noItemsMsg = isEn ? 'No requests or tickets to display.' : 'در حال حاضر گزارش یا تیکتی برای پیگیری وجود ندارد.';

      let items = [];

      if (activeTrackFilter === 'all' || activeTrackFilter === 'reports') {
        reports.forEach(r => {
          items.push({
            type: 'report',
            id: r.id,
            code: r.code || '—',
            title: r.title,
            sub: r.location ? `${r.location} • ${r.dateTime || r.date || '—'}` : (r.dateTime || r.date || '—'),
            status: r.status,
            created_at: r.rawDate || r.created_at || r.date || '',
            dateTime: r.dateTime || r.date || '—',
            icon: r.icon,
            iconBg: r.iconBg,
            raw: r
          });
        });
      }

      if (activeTrackFilter === 'all' || activeTrackFilter === 'tickets') {
        tickets.forEach(t => {
          items.push({
            type: 'ticket',
            id: t.id,
            code: t.code || '—',
            title: t.title,
            sub: `${t.department || 'پشتیبانی شهرداری'} • ${t.dateTime || formatReportDateTime(t.created_at)}`,
            status: t.status,
            reply: t.reply,
            created_at: t.created_at || '',
            dateTime: t.dateTime || formatReportDateTime(t.created_at),
            icon: 'ticket',
            iconBg: 'rgba(0,201,167,0.18)',
            raw: t
          });
        });
      }

      // مرتب‌سازی بر اساس تازه‌ترین تاریخ و ساعت
      items.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime() || 0;
        const timeB = new Date(b.created_at).getTime() || 0;
        return timeB - timeA;
      });

      if (!items.length) {
        wrap.innerHTML = `<div style="padding:22px 0; color:var(--text-muted); font-size:13px; text-align:center;">${noItemsMsg}</div>`;
        return;
      }

      wrap.innerHTML = items.map(item => {
        const isTicket = item.type === 'ticket';
        const hasReply = !!(isTicket && item.reply && item.reply.trim());
        let statusMeta = getStatusMeta(item.status);
        let statusLabel = statusMeta.label;
        if (isTicket) {
          if (hasReply) {
            statusLabel = 'پاسخ داده شده';
          } else if (item.status === 'pending') {
            statusLabel = 'در انتظار پاسخ';
          }
        }

        const typeBadge = isTicket
          ? `<span style="font-size:10.5px; font-weight:800; background:rgba(0,201,167,0.15); color:var(--teal); padding:2px 7px; border-radius:8px;">🎫 تیکت</span>`
          : `<span style="font-size:10.5px; font-weight:800; background:rgba(59,130,246,0.15); color:#3b82f6; padding:2px 7px; border-radius:8px;">📋 گزارش</span>`;

        const onClickCall = isTicket ? `openTicketDetail('${item.id}')` : `openReportDetail('${item.id}')`;
        const hasReplyBadge = hasReply
          ? `<span style="font-size:10.5px; font-weight:700; color:#10b981; background:rgba(16,185,129,0.12); padding:2px 6px; border-radius:6px;">پاسخ شهرداری</span>`
          : '';

        return `
          <div class="report-item track-item-card" onclick="${onClickCall}" style="align-items:flex-start; padding:13px 14px;">
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; flex-shrink:0;">
              <span class="report-status ${statusMeta.className}">${statusLabel}</span>
              ${hasReplyBadge}
            </div>
            <div class="report-info" style="flex:1; text-align:right;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; justify-content:flex-end;">
                ${typeBadge}
                <span style="font-size:11px; font-weight:700; color:var(--teal); direction:ltr; font-family:monospace;">${escapeHtml(item.code)}</span>
              </div>
              <h4 style="font-size:13.5px; font-weight:800; margin:0 0 4px; color:var(--text-primary); line-height:1.5;">${escapeHtml(item.title)}</h4>
              <p style="font-size:11px; color:var(--text-muted); margin:0;">${escapeHtml(item.sub)}</p>
            </div>
            <div class="report-icon-box" style="background:${item.iconBg}; align-self:center; font-size:18px;">
              ${isTicket ? '🎫' : (window.EplakIcons ? window.EplakIcons.get(item.icon) : item.icon)}
            </div>
          </div>
        `;
      }).join('');
    };

    doRender();

    const phone = getCurrentPhone();
    if (phone && !options.skipBackend) {
      Promise.all([
        loadReportsFromBackend(phone, { silent: true }),
        loadTicketsFromBackend(phone, { silent: true })
      ]).then(() => {
        doRender();
      }).catch(() => {});
    }
  }

  function searchByTrackCode() {
    const input = getTrackingInputElement();
    const resultBox = getTrackingResultBox();
    const code = (input ? input.value.trim() : '');

    // واژه کلیدی مستقیم برای ورود به پنل ادمین
    const lowerCode = code.toLowerCase();
    if (lowerCode === 'admin' || lowerCode === 'panel' || lowerCode === 'modir' || code === 'مدیر') {
      window.location.href = '/admin';
      return;
    }

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    if (!code) {
      renderTrackRecent({ skipBackend: true });
      if (resultBox) resultBox.innerHTML = '';
      return;
    }

    const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
    
    // ۱. جستجو در تیکت‌ها
    const foundTicket = tickets.find(t => {
      const tCode = String(t.code || '').toLowerCase().replace(/\s+/g, '');
      const tTitle = String(t.title || '').toLowerCase().replace(/\s+/g, '');
      return tCode === normalizedCode || tTitle.includes(normalizedCode);
    });
    if (foundTicket) {
      openTicketDetail(foundTicket.id);
      return;
    }

    // ۲. جستجو در گزارش‌ها
    const foundReport = reports.find(r => {
      const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
      const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
      return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
    });

    if (foundReport) {
      openReportDetail(foundReport.id);
      return;
    }

    const phone = getCurrentPhone();
    if (phone) {
      Promise.all([
        loadReportsFromBackend(phone, { silent: true }),
        loadTicketsFromBackend(phone, { silent: true })
      ]).then(() => {
        const foundTicketAfter = tickets.find(t => {
          const tCode = String(t.code || '').toLowerCase().replace(/\s+/g, '');
          const tTitle = String(t.title || '').toLowerCase().replace(/\s+/g, '');
          return tCode === normalizedCode || tTitle.includes(normalizedCode);
        });
        if (foundTicketAfter) {
          openTicketDetail(foundTicketAfter.id);
          return;
        }

        const foundReportAfter = reports.find(r => {
          const reportCode = String(r.code || '').toLowerCase().replace(/\s+/g, '');
          const reportTitle = String(r.title || '').toLowerCase().replace(/\s+/g, '');
          return reportCode === normalizedCode || reportTitle.includes(normalizedCode);
        });
        if (foundReportAfter) {
          openReportDetail(foundReportAfter.id);
          return;
        }

        if (resultBox) {
          const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
          resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
        }
      }).catch(() => {
        if (resultBox) {
          const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
          resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
        }
      });
    } else {
      if (resultBox) {
        const notFoundMsg = isEn ? 'No request or ticket found with this code' : `درخواستی با کد «${escapeHtml(code)}» یافت نشد`;
        resultBox.innerHTML = `<div class="glass-card" style="padding:16px; text-align:center; font-size:13px; color:var(--text-muted); border-radius:14px;">${notFoundMsg}</div>`;
      }
    }
  }


    /* =========================================================
     Ticket System (ثبت تیکت، مدیریت، تفکیک تب‌ها و حذف تیکت)
  ========================================================= */
  let tickets = [];
  window.tickets = tickets;
  let activeTicketId = null;
  window.activeTicketId = activeTicketId;
  let activeTicketFilter = 'all';
  let activeReportsMainTab = 'reports';

  function switchReportsMainTab(section, btnEl) {
    activeReportsMainTab = section;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');

    const indicator = document.getElementById('reportsSwitcherIndicator');
    const btns = document.querySelectorAll('#reportsMainSwitcher .reports-switcher-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (btnEl) {
      btnEl.classList.add('active');
    } else {
      const activeBtn = document.getElementById(section === 'tickets' ? 'tabBtnTickets' : 'tabBtnReports');
      if (activeBtn) activeBtn.classList.add('active');
    }

    if (indicator) {
      if (section === 'tickets') {
        indicator.style.transform = isEn ? 'translateX(100%)' : 'translateX(-100%)';
      } else {
        indicator.style.transform = 'translateX(0)';
      }
    }

    const paneReports = document.getElementById('sectionReportsPane');
    const paneTickets = document.getElementById('sectionTicketsPane');

    if (section === 'tickets') {
      if (paneReports) paneReports.style.display = 'none';
      if (paneTickets) {
        paneTickets.style.display = 'flex';
        renderUserTicketsList(activeTicketFilter);
      }
    } else {
      if (paneTickets) paneTickets.style.display = 'none';
      if (paneReports) {
        paneReports.style.display = 'flex';
        renderReportsList('all');
      }
    }
  }

    function filterUserTickets(filter, btnEl) {
    activeTicketFilter = filter;
    document.querySelectorAll('#ticketsFilterTabs .filter-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderUserTicketsList(filter);
  }

  function renderUserTicketsList(filter = activeTicketFilter) {
    const wrap = document.getElementById('userTicketsListWrap');
    if (!wrap) return;

    const countBadge = document.getElementById('userTicketsCountBadge');
    if (countBadge) countBadge.textContent = toPersianDigits(tickets.length);
    const repBadge = document.getElementById('reportsCountBadge');
    if (repBadge) repBadge.textContent = toPersianDigits(reports.length);

    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const deleteWord = isEn ? 'Delete' : 'حذف';
    const emptyMsg = isEn ? 'No tickets found in this category' : 'تیکتی در این دسته یافت نشد';

    let filtered = tickets;
    if (filter === 'pending') {
      filtered = tickets.filter(t => (!t.reply || !t.reply.trim()) && (t.status === 'pending' || !t.status));
    } else if (filter === 'done' || filter === 'answered') {
      filtered = tickets.filter(t => (t.reply && t.reply.trim()) || t.status === 'done' || t.status === 'answered');
    } else if (filter === 'review' || filter === 'in_progress') {
      filtered = tickets.filter(t => t.status === 'in_progress' || t.status === 'review');
    }

    if (filtered.length === 0) {
      wrap.innerHTML = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px;">${emptyMsg}</div>`;
      return;
    }

    wrap.innerHTML = filtered.map(t => {
      const hasReply = !!(t.reply && t.reply.trim());
      let statusMeta = getStatusMeta(t.status);
      let statusLabel = statusMeta.label;
      if (hasReply) {
        statusLabel = isEn ? 'Answered' : 'پاسخ داده شده';
      } else if (t.status === 'pending') {
        statusLabel = isEn ? 'Pending' : 'در انتظار';
      } else if (t.status === 'in_progress' || t.status === 'review') {
        statusLabel = isEn ? 'In Review' : 'بررسی';
      }
      const displayDate = t.dateTime || formatReportDateTime(t.created_at);

      return `
        <div class="report-swipe">
          <div class="report-delete-bg" onpointerdown="event.stopPropagation()" onclick="confirmDeleteTicket('${t.id}', event)">
            <div class="delete-action" style="color:#ef4444;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6 L19,20 a2,2 0 0 1 -2,2 H7 a2,2 0 0 1 -2,-2 L5,6"/><path d="M8,6 V4 a2,2 0 0 1 2,-2 h4 a2,2 0 0 1 2,2 v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              <span style="color:#ef4444; font-weight:800;">${deleteWord}</span>
            </div>
          </div>
          <div class="report-swipe-item" onclick="openTicketDetail('${t.id}')">
            <div class="report-item">
              <span class="report-status ${statusMeta.className}">${statusLabel}</span>
              <div class="report-info">
                <h4>${escapeHtml(t.title)}</h4>
                <p>${escapeHtml(t.department || 'پشتیبانی شهرداری')} - ${displayDate}${hasReply ? ' <span style="color:#10b981; font-weight:700;">(پاسخ شهرداری)</span>' : ''}</p>
              </div>
              <div class="report-icon-box" style="background:rgba(0,201,167,0.16); color:var(--teal);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20M2 14.5h20"/></svg>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    initReportSwipe();
  }

  function openTicketDetail(id) {
    const t = tickets.find(x => String(x.id) === String(id) || String(x.code) === String(id));
    if (!t) return;
    activeTicketId = t.id;

    const statusMeta = getStatusMeta(t.status);
    const priorityLabels = {
      low: 'پایین',
      medium: 'متوسط',
      high: 'بالا',
      critical: 'بحرانی'
    };

    const titleEl = document.getElementById('ticketDetailTitle');
    const statusEl = document.getElementById('ticketDetailStatus');
    const codeEl = document.getElementById('ticketDetailCode');
    const dateEl = document.getElementById('ticketDetailDate');
    const deptEl = document.getElementById('ticketDetailDept');
    const prioEl = document.getElementById('ticketDetailPriority');
    const descEl = document.getElementById('ticketDetailDesc');
    const replyCard = document.getElementById('ticketDetailReplyCard');
    const replyEl = document.getElementById('ticketDetailReply');

    if (titleEl) titleEl.textContent = t.title || 'بدون عنوان';
    if (statusEl) {
      statusEl.className = 'report-status ' + statusMeta.className;
      statusEl.textContent = (t.reply && t.reply.trim()) ? 'پاسخ داده شده' : statusMeta.label;
    }
    if (codeEl) codeEl.textContent = t.code || '—';
    if (dateEl) dateEl.textContent = t.dateTime || formatReportDateTime(t.created_at);
    if (deptEl) deptEl.textContent = t.department || 'پشتیبانی شهرداری';
    if (prioEl) prioEl.textContent = priorityLabels[t.priority] || 'متوسط';
    if (descEl) descEl.textContent = t.description || '—';

    if (replyCard && replyEl) {
      if (t.reply && t.reply.trim()) {
        replyEl.textContent = t.reply;
        replyCard.style.display = 'flex';
      } else {
        replyCard.style.display = 'none';
        replyEl.textContent = '';
      }
    }

    showScreen('screen-ticket-detail');
  }

  /* =========================================================
     Ticket Deletion Logic (حذف تیکت همراه با تایید و هماهنگی سرور)
  ========================================================= */
  function deleteCurrentOpenTicket() {
    if (!activeTicketId) return;
    confirmDeleteTicket(activeTicketId, null, true);
  }

  function confirmDeleteTicket(id, e, isFromDetail = false) {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    const targetId = String(id || activeTicketId || '').trim();
    if (!targetId) return;

    const t = tickets.find(x => String(x.id).trim() === targetId || String(x.code).trim() === targetId);
    const title = t ? t.title : 'این تیکت';

    if (window.confirm(`آیا از حذف تیکت «${title}» اطمینان دارید؟`)) {
      deleteTicketById(targetId);
      if (isFromDetail && typeof goBack === 'function') {
        goBack();
      }
    }
  }

  async function deleteTicketById(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return;

    const idx = tickets.findIndex(t => String(t.id).trim() === targetId || String(t.code).trim() === targetId);
    if (idx === -1) return;

    const removedTicket = tickets[idx];
    const backendId = getReportBackendId(removedTicket);
    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';

    if (backendId !== null) {
      pendingTicketDeleteIds.add(String(backendId));
      savePendingTicketDeletes();
    }

    tickets.splice(idx, 1);
    if (activeTicketId === removedTicket.id) activeTicketId = null;
    saveTickets(phone);

    // ارسال به بک‌اند جهت حذف قطعی از دیتابیس (با اعتبارسنجی مالکیت)
    if (phone && backendId !== null) {
      try {
        await requestTicketBackendDelete(backendId, phone);
        pendingTicketDeleteIds.delete(String(backendId));
        savePendingTicketDeletes();
      } catch (err) {
        console.warn('[tickets] backend delete deferred:', err && err.message ? err.message : err);
      }
    }

    renderUserTicketsList(activeTicketFilter);
    if (typeof renderTrackRecent === 'function') {
      renderTrackRecent({ skipBackend: true });
    }
    if (typeof showToast === 'function') {
      showToast('تیکت با موفقیت حذف شد');
    }
  }

  // مقداردهی اولیه تیکت‌ها از حافظه محلی
  /* در نسخه‌های قبلی این تابع فراخوانی می‌شد ولی هیچ‌جا تعریف نشده بود؛
     ReferenceError حاصل، اجرای بقیهٔ این فایل (تمام window.* exportها از جمله
     window.tickets، renderTrackRecent و searchByTrackCode) را از کار می‌انداخت. */
  /* کلید ذخیره‌ی تیکت‌ها به‌ازای هر شماره جداست تا کاربران مختلف روی یک
     دستگاه تیکت‌های یکدیگر را نبینند (قبلاً یک کلید مشترک بود). */
  function ticketsStorageKey(phone) {
    const p = phone || ((typeof getCurrentPhone === 'function') ? getCurrentPhone() : '');
    return p ? ('eplak_tickets_' + p) : '';
  }
  function loadSavedTickets(phone) {
    try {
      const key = ticketsStorageKey(phone);
      if (!key || !window.localStorage) return;
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && Array.isArray(tickets)) {
        tickets.length = 0;
        saved.forEach(t => { if (t && t.id) tickets.push(t); });
      }
    } catch (e) { /* حافظه محلی در دسترس نیست — نادیده بگیر */ }
  }
  window.loadSavedTickets = loadSavedTickets;
  window.clearTicketsInMemory = function () { if (Array.isArray(tickets)) tickets.length = 0; };
  /* دکمه «+ ثبت تیکت جدید» در تب تیکت‌ها — در نسخه‌های قبلی تعریف نشده بود و دکمه مرده بود */
  function startNewTicket() {
    if (typeof showScreen === 'function') showScreen('screen-ticket-new');
  }
  /* شمارندهٔ کاراکترهای متن تیکت (ticketCharCount = 0/800) — قبلاً تعریف نشده بود */
  function updateTicketCount(el) {
    try {
      const counter = document.getElementById('ticketCharCount');
      if (counter && el) counter.textContent = String(el.value.length) + '/800';
    } catch (e) { /* ignore */ }
  }

  /* ── همگام‌سازی تیکت‌ها با سرور (قبلاً export می‌شد ولی تعریف نداشت) ── */
  function mapTicketRow(item) {
    const created = item.created_at || item.createdAt || '';
    return {
      id: String(item.id),
      backendId: item.id,
      code: item.code || ('TK-1403-' + String(Number(item.id) + 1000).padStart(4, '0')),
      title: item.title || 'تیکت',
      description: item.description || '',
      category: item.category || '',
      department: item.department || '',
      priority: item.priority || 'medium',
      status: normalizeStatusValue(item.status || 'pending'),
      reply: item.reply || '',
      user_phone: item.user_phone || '',
      created_at: created,
      dateTime: formatReportDateTime(created)
    };
  }

  /* حذف‌های ناتمام تیکت‌ها (همان سازوکار گزارش‌ها) */
  const pendingTicketDeleteIds = new Set();
  const PENDING_TICKET_DELETE_KEY = 'eplak_pending_ticket_deletes';
  let ticketsSyncInFlight = null;
  try {
    const raw = window.localStorage ? window.localStorage.getItem(PENDING_TICKET_DELETE_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(id => pendingTicketDeleteIds.add(String(id)));
  } catch (e) { /* ignore */ }
  function savePendingTicketDeletes() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(PENDING_TICKET_DELETE_KEY, JSON.stringify(Array.from(pendingTicketDeleteIds)));
      }
    } catch (e) { /* ignore */ }
  }
  async function requestTicketBackendDelete(backendId, phone) {
    const response = await fetch(`${apiBase}/tickets.php?action=delete&id=${encodeURIComponent(backendId)}&phone=${encodeURIComponent(phone)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: backendId, phone })
    });
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (response.status === 404) return true;
    if (!response.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `delete failed (${response.status})`);
    }
    return true;
  }
  async function flushPendingTicketDeletes(phone) {
    if (!phone || !pendingTicketDeleteIds.size) return;
    for (const id of Array.from(pendingTicketDeleteIds)) {
      try {
        await requestTicketBackendDelete(id, phone);
        pendingTicketDeleteIds.delete(id);
      } catch (e) { /* retry next time */ }
    }
    savePendingTicketDeletes();
  }

  async function loadTicketsFromBackend(phone = getCurrentPhone(), options = {}) {
    const { silent = false } = options;
    if (!phone) return [];
    if (ticketsSyncInFlight) return ticketsSyncInFlight;
    ticketsSyncInFlight = (async () => {
    try {
      await flushPendingTicketDeletes(phone);
      const response = await fetch(`${apiBase}/tickets.php?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('tickets fetch failed');
      const data = await response.json();
      const rows = (Array.isArray(data?.tickets) ? data.tickets : [])
        .filter(item => !pendingTicketDeleteIds.has(String(item.id)));
      const mapped = rows.map(mapTicketRow);
      tickets.length = 0;
      mapped.forEach(t => tickets.push(t));
      if (typeof saveTickets === 'function') saveTickets(phone);
      return tickets;
    } catch (error) {
      if (!silent) console.warn('[tickets] backend sync failed', error);
      return tickets;
    } finally {
      ticketsSyncInFlight = null;
    }
    })();
    return ticketsSyncInFlight;
  }

  /* ── ثبت تیکت جدید از فرم «ثبت تیکت جدید» (قبلاً دکمه بدون عملکرد بود) ── */
  async function submitNewTicket() {
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const toast = (m) => { if (typeof showToast === 'function') showToast(m); };

    const titleEl = document.getElementById('ticketTitleInput');
    const descEl = document.getElementById('ticketDescInput');
    const deptEl = document.getElementById('ticketDeptSelect');
    const prioEl = document.getElementById('ticketPrioritySelect');

    const title = titleEl ? titleEl.value.trim() : '';
    const description = descEl ? descEl.value.trim() : '';
    const department = deptEl ? (deptEl.value || '').trim() : '';
    const priority = prioEl ? (prioEl.value || 'medium').trim() : 'medium';

    if (!title) { toast(isEn ? 'Please enter the ticket title' : 'لطفاً عنوان تیکت را وارد فرمایید'); return; }
    if (!description) { toast(isEn ? 'Please enter the ticket text' : 'لطفاً متن تیکت را وارد فرمایید'); return; }

    const phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
    if (!phone) { toast(isEn ? 'Please login first' : 'برای ثبت تیکت ابتدا وارد حساب خود شوید'); return; }


    const btnBusy = (isEn ? 'Sending…' : 'در حال ارسال…');
    const sendBtn = document.querySelector('#screen-ticket-new .btn-teal span');
    const sendBtnHtml = sendBtn ? sendBtn.textContent : '';
    if (sendBtn) sendBtn.textContent = btnBusy;

    try {
      const response = await fetch(`${apiBase}/tickets.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhone: phone,
          name: (window.currentUserName || (window.authUser && window.authUser.name) || ''),
          title: title,
          description: description,
          category: 'درخواست اداری',
          department: department,
          priority: priority,
          status: 'pending'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'ticket submit failed');

      const t = mapTicketRow(data.ticket || { ...data, title, description, department, priority, status: 'pending' });
      tickets.unshift(t);
      if (typeof saveTickets === 'function') saveTickets(phone);
      if (typeof renderUserTicketsList === 'function') renderUserTicketsList(activeTicketFilter);
      if (typeof renderTrackRecent === 'function') renderTrackRecent({ skipBackend: true });

      const codeElem = document.getElementById('successTicketCode');
      if (codeElem) codeElem.textContent = t.code;

      if (titleEl) titleEl.value = '';
      if (descEl) { descEl.value = ''; updateTicketCount(descEl); }

      if (window.soundManager && typeof window.soundManager.playDing === 'function') window.soundManager.playDing();
      showScreen('screen-ticket-success');
    } catch (err) {
      console.warn('[tickets] submit failed', err);
      toast(isEn ? 'Ticket submission failed. Please try again' : 'ثبت تیکت ناموفق بود — دوباره تلاش کنید');
    } finally {
      if (sendBtn) sendBtn.textContent = sendBtnHtml;
    }
  }
  /* جفت ذخیره‌سازی محلی — services.js (فرم ملاقات با شهردار) صدایش می‌زند */
  function saveTickets(phone) {
    try {
      const key = ticketsStorageKey(phone);
      if (key && window.localStorage && Array.isArray(tickets)) {
        window.localStorage.setItem(key, JSON.stringify(tickets.slice(0, 50)));
      }
    } catch (e) { /* ignore */ }
  }
  loadSavedTickets();

  // Window exports
  window.switchReportsMainTab = switchReportsMainTab;
  window.filterUserTickets = filterUserTickets;
  window.confirmDeleteTicket = confirmDeleteTicket;
  window.deleteCurrentOpenTicket = deleteCurrentOpenTicket;
  window.deleteTicketById = deleteTicketById;
  window.filterTrackList = filterTrackList;
  window.startNewTicket = startNewTicket;
  window.updateTicketCount = updateTicketCount;
  window.submitNewTicket = submitNewTicket;
  window.loadTicketsFromBackend = loadTicketsFromBackend;
  window.renderUserTicketsList = renderUserTicketsList;
  window.openTicketDetail = openTicketDetail;
  window.tickets = tickets;

  window.submitNewReport = submitNewReport;
  window.renderReportsList = renderReportsList;
  window.filterReports = filterReports;
  window.openReportDetail = openReportDetail;
  window.renderProfileReportsSummary = renderProfileReportsSummary;
  window.renderHomeReportsSummary = renderHomeReportsSummary;
  window.renderProfileTrackingQuick = renderProfileTrackingQuick;
  window.renderHomeTrackingQuick = renderHomeTrackingQuick;
  window.renderTrackRecent = renderTrackRecent;
  window.searchByTrackCode = searchByTrackCode;

