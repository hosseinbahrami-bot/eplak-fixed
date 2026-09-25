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

  async function syncDataToBackend(endpoint, payload) {
    if (!payload || typeof payload !== 'object') return null;
    try {
      const response = await fetch(BACKEND_BASE_URL + '/' + endpoint + '.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.warn('[backend] request failed', endpoint, await response.text());
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[backend] unavailable', endpoint, error.message);
      return null;
    }
  }

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

  /* ─── بازیابی session پس از رفرش ──────────────────────────────── */
  function restoreSession() {
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
  window.syncUserProfileToBackend = syncUserProfileToBackend;

})();
