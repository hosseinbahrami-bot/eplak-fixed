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
      const apiBase = window.EPLAK_API_BASE_URL ||
        (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');
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
    const apiBase = window.EPLAK_API_BASE_URL ||
      (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');
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

      const apiBase = window.EPLAK_API_BASE_URL ||
        (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');
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

  function resetReportDraft() {
    reportDraft = { type: 'سایر', department: '', subDepartment: '', desc: '', location: '', photos: [] };
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

  function useCurrentLocation() {
    document.getElementById('reportLocationInput').value = 'موقعیت فعلی کاربر (دریافت‌شده از GPS)';
    showToast('موقعیت فعلی شما دریافت شد');
  }

  function goReportStep3() {
    const locEl = document.getElementById('reportLocationInput');
    reportDraft.location = locEl.value.trim();
    if (!reportDraft.location) {
      showToast('لطفاً موقعیت مکانی را مشخص کنید');
      return;
    }
    showScreen('screen-report-step3');
  }

  function addReportPhotos(input) {
    const files = Array.from(input.files || []);
    const remaining = 3 - reportDraft.photos.length;
    files.slice(0, remaining).forEach(file => {
      reportDraft.photos.push(file.name);
    });
    renderReportPhotosPreview();
    input.value = '';
  }

  function renderReportPhotosPreview() {
    const wrap = document.getElementById('reportPhotosPreview');
    wrap.innerHTML = reportDraft.photos.map((name, idx) => `
      <div style="position:relative; width:64px; height:64px; border-radius:12px; background:var(--card-bg); border:1px solid var(--card-border); display:flex; align-items:center; justify-content:center; font-size:22px;">
        🖼️
        <span onclick="removeReportPhoto(${idx})" style="position:absolute; top:-6px; left:-6px; width:20px; height:20px; background:rgba(255,60,60,0.9); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; color:white; cursor:pointer;">✕</span>
      </div>
    `).join('');
  }

  function removeReportPhoto(idx) {
    reportDraft.photos.splice(idx, 1);
    renderReportPhotosPreview();
  }

  function goReportStep4() {
    document.getElementById('confirmDeptText').textContent = reportDraft.subDepartment
      ? (reportDraft.department + ' / ' + reportDraft.subDepartment) : '—';
    document.getElementById('confirmDescText').textContent = reportDraft.desc || '—';
    document.getElementById('confirmLocationText').textContent = reportDraft.location || '—';
    document.getElementById('confirmPhotoCount').textContent = `${toPersianDigits(reportDraft.photos.length)} تصویر`;
    showScreen('screen-report-step4');
  }

  function submitNewReport() {
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

    // 5. پاک‌سازی فرم پیش‌نویس
    const draftPayload = {
      userPhone: currentPhone,
      title: newReport.title,
      description: newReport.desc || newReport.title,
      category: newReport.subDepartment || newReport.department || 'سایر',
      department: newReport.department || '',
      subDepartment: newReport.subDepartment || '',
      location: newReport.location || ''
    };
    resetReportDraft();

    // 6. ارسال ناهمگام به سرور در پس‌زمینه (کاملاً موازی بدون قفل کردن رابط کاربری)
    if (currentPhone && typeof window.syncDataToBackend === 'function') {
      window.syncDataToBackend('reports', draftPayload)
        .then(backendRes => {
          if (backendRes && backendRes.tracking_code) {
            newReport.code = backendRes.tracking_code;
            if (backendRes.id) {
              /* شناسه‌ی سروری جایگزین شناسه‌ی موقت محلی می‌شود تا حذف/جزئیات
                 دقیقاً به همان رکورد سرور اشاره کند */
              newReport.backendId = backendRes.id;
              newReport.id = String(backendRes.id);
            }
            delete newReport.pendingSync;
            const currentTrackElem = document.getElementById('successTrackCode');
            if (currentTrackElem && (currentTrackElem.textContent === code || !currentTrackElem.textContent)) {
              currentTrackElem.textContent = backendRes.tracking_code;
            }
            if (typeof saveReports === 'function') saveReports(currentPhone);
          }
          if (typeof loadReportsFromBackend === 'function') {
            loadReportsFromBackend(currentPhone, { silent: true });
          }
        })
        .catch(err => {
          console.warn('[reports] background sync note:', err);
        });
    }
  }
  window.submitNewReport = submitNewReport;


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
    const apiBase = window.EPLAK_API_BASE_URL ||
      (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');
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
      const apiBase = window.EPLAK_API_BASE_URL ||
        (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');
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

    const apiBase = window.EPLAK_API_BASE_URL ||
      (window.location && window.location.protocol === 'file:' ? 'http://192.168.98.133/eplak-fixed/api' : 'api');

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

