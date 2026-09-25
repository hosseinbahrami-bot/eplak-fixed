/* ============================================================
   modules/live.js — محتوای زنده (اخبار، دانستنی‌ها، اعلان‌ها و پوش بلادرنگ)
   ارتباط مستقیم و دوطرفه بین اپ شهروندی و پنل مدیریت MariaDB
   ============================================================ */
(function () {
  'use strict';

  var isInitialNotifs = true;
  var seenNotifIds = new Set();
  var isSyncing = false;

  function apiBase() {
    return (typeof window.EPLAK_API_BASE_URL === 'string' && window.EPLAK_API_BASE_URL)
      ? window.EPLAK_API_BASE_URL.replace(/\/$/, '')
      : 'api';
  }

  function faDate(value) {
    try {
      const d = value ? new Date(String(value).replace(' ', 'T')) : new Date();
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function faTime(value) {
    try {
      const d = value ? new Date(String(value).replace(' ', 'T')) : new Date();
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function escapeText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ───────────────────────────────────────────────────────────
     پوش نوتیفیکیشن سیستمی مرورگر و گوشی
  ─────────────────────────────────────────────────────────── */
  function requestPushPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            console.log('[push] مجوز اعلان‌ها فعال شد');
          }
        }).catch(function () {});
      } catch (e) {}
    }
  }
  window.requestPushPermission = requestPushPermission;

  function triggerDeviceNotification(title, body, id) {
    // 1. Web Push / System Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, {
              body: body,
              icon: 'assets/images/logo.png',
              badge: 'assets/images/logo.png',
              tag: 'eplak-' + id,
              renotify: true,
              vibrate: [200, 100, 200],
              data: { url: 'screen-notifications' }
            });
          }).catch(function () {
            new Notification(title, { body: body, icon: 'assets/images/logo.png', tag: 'eplak-' + id });
          });
        } else {
          new Notification(title, { body: body, icon: 'assets/images/logo.png', tag: 'eplak-' + id });
        }
      } catch (e) {
        console.warn('[push] device notification error:', e);
      }
    }

    // 2. Play Sound Chime
    try {
      if (window.soundManager && typeof window.soundManager.playNotification === 'function') {
        window.soundManager.playNotification();
      }
    } catch (e) {}

    // 3. Show Dynamic In-App Banner
    showLiveAnnouncementBanner(title, body);
  }

  function showLiveAnnouncementBanner(title, body) {
    var banner = document.getElementById('eplakLiveNotifBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'eplakLiveNotifBanner';
      banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120%);width:92%;max-width:440px;background:rgba(15,23,42,0.96);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);color:#fff;border-radius:20px;padding:14px 18px;border:1.5px solid rgba(0,201,167,0.45);box-shadow:0 18px 45px rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:flex-start;gap:14px;direction:rtl;font-family:Vazirmatn,sans-serif;transition:all 0.45s cubic-bezier(0.34,1.56,0.64,1);cursor:pointer;';
      document.body.appendChild(banner);
    }

    banner.innerHTML = '<div style="width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,rgba(0,201,167,0.25),rgba(15,118,110,0.4));color:#00c9a7;display:grid;place-items:center;font-size:22px;flex-shrink:0;box-shadow:0 0 15px rgba(0,201,167,0.3);">' +
      '📢' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '    <strong style="font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeText(title) + '</strong>' +
      '    <span style="font-size:10.5px;color:#00c9a7;background:rgba(0,201,167,0.15);padding:2px 7px;border-radius:10px;flex-shrink:0;">اعلان فوری</span>' +
      '  </div>' +
      '  <p style="font-size:12.5px;color:rgba(255,255,255,0.85);margin:4px 0 0;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + escapeText(body) + '</p>' +
      '</div>';

    banner.onclick = function () {
      banner.style.transform = 'translateX(-50%) translateY(-120%)';
      banner.style.opacity = '0';
      if (typeof showScreen === 'function') {
        showScreen('screen-notifications');
      }
    };

    requestAnimationFrame(function () {
      banner.style.transform = 'translateX(-50%) translateY(0)';
      banner.style.opacity = '1';
    });

    if (banner._dismissTimer) clearTimeout(banner._dismissTimer);
    banner._dismissTimer = setTimeout(function () {
      banner.style.transform = 'translateX(-50%) translateY(-120%)';
      banner.style.opacity = '0';
    }, 7000);
  }

  /* ───────────────────────────────────────────────────────────
     اخبار و دانستنی‌ها
  ─────────────────────────────────────────────────────────── */
  function applyNews(items) {
    if (typeof newsData === 'undefined' || !Array.isArray(items)) return;

    const news = items.filter(function (i) { return i.type === 'news'; });
    const tips = items.filter(function (i) { return i.type === 'tip'; });

    /* تب «اخبار و اطلاعات» */
    if (news.length) {
      newsData.length = 0;
      news.forEach(function (n) {
        newsData.push({
          id: 'srv-' + n.id,
          title: n.title,
          date: faDate(n.updated_at),
          icon: n.icon || '📰',
          summary: n.summary || '',
          body: n.body
        });
      });
      if (typeof renderNewsList === 'function') renderNewsList();
    }

    /* تب «دانستنی‌های ورامین» */
    renderTips(tips);

    /* نوار «آخرین اخبار» در پیشخوان */
    renderDashStrip(news.length ? newsData.slice(0, 2) : []);
  }

  function renderTips(tips) {
    let wrap = document.getElementById('knowledgeListWrap');
    if (!wrap) return;

    if (!tips.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = tips.map(function (t) {
      return ''
        + '<div class="glass-card" style="padding:14px; display:flex; gap:12px; align-items:flex-start; cursor:pointer;"'
        + ' onclick="openTipDetail(\'srv-' + t.id + '\')">'
        + (t.image_url
            ? '<img src="' + escapeText(t.image_url) + '" alt="" style="width:60px;height:60px;border-radius:14px;object-fit:cover;flex-shrink:0;">'
            : '<div class="promo-img" style="width:60px; height:60px; flex-shrink:0;">'
              + '<div class="promo-img-bg">' + (window.EplakIcons ? window.EplakIcons.get(t.icon || '🏛️') : escapeText(t.icon || '🏛️')) + '</div></div>')
        + '<div style="flex:1; text-align:right;">'
        +   '<h4 style="font-size:13px; font-weight:700; line-height:1.5;">' + escapeText(t.title) + '</h4>'
        +   '<p style="font-size:11px; color:var(--text-muted); margin-top:4px; line-height:1.6;">' + escapeText(t.summary || '') + '</p>'
        + '</div>'
        + '</div>';
    }).join('');

    window.__EPLAK_TIPS__ = tips;
  }

  function renderDashStrip(items) {
    const wrap = document.getElementById('dashNewsWrap');
    if (!wrap || !items.length) return;
    const isEn = (window.i18n && typeof window.i18n.getLanguage === 'function')
      ? window.i18n.getLanguage() === 'en'
      : (window.i18n && window.i18n.currentLang === 'en');
    const source = (isEn && window.newsData_EN) ? window.newsData_EN : items;
    wrap.innerHTML = source.slice(0, 2).map(function (n) {
      return ''
        + '<div class="mini-news-card" onclick="openNewsDetail(\'' + n.id + '\')">'
        +   '<div class="mini-news-text" style="text-align:' + (isEn ? 'left' : 'right') + ';">'
        +     '<h4>' + escapeText(n.title) + '</h4>'
        +     '<p>' + escapeText(n.date) + '</p>'
        +   '</div>'
        +   '<div class="mini-news-icon">' + (window.EplakIcons ? window.EplakIcons.get(n.icon) : escapeText(n.icon)) + '</div>'
        + '</div>';
    }).join('');
  }
  window.renderDashStrip = renderDashStrip;

  window.openTipDetail = function (id) {
    const list = window.__EPLAK_TIPS__ || [];
    const t = list.find(function (x) { return 'srv-' + x.id === id; });
    if (!t) return;

    const img = document.getElementById('newsDetailImg');
    const title = document.getElementById('newsDetailTitle');
    const date = document.getElementById('newsDetailDate');
    const body = document.getElementById('newsDetailBody');
    if (img) img.innerHTML = window.EplakIcons ? window.EplakIcons.get(t.icon || '🏛️') : (t.icon || '🏛️');
    if (title) title.textContent = t.title;
    if (date) date.textContent = faDate(t.updated_at);
    if (body) body.textContent = t.body;
    if (typeof showScreen === 'function') showScreen('screen-news-detail');
  };

  /* ───────────────────────────────────────────────────────────
     اعلان‌ها و همگام‌سازی بلادرنگ
  ─────────────────────────────────────────────────────────── */
  function applyNotifications(items) {
    if (typeof notifications === 'undefined' || !Array.isArray(items)) return;

    var newItemsFound = [];

    items.forEach(function (n) {
      const sid = 'srv-' + n.id;
      const numericId = parseInt(n.id, 10);

      const exists = notifications.some(function (x) {
        return String(x.id) === sid || String(x.id) === String(numericId);
      });

      if (exists) {
        const local = notifications.find(function (x) {
          return String(x.id) === sid || String(x.id) === String(numericId);
        });
        if (local && n.read_flag === 1) local.read = true;
      } else {
        var notifObj = {
          id: sid,
          title: n.title,
          body: n.body,
          read: n.read_flag === 1,
          time: faTime(n.created_at),
          date: faDate(n.created_at),
          icon: '🔔'
        };
        notifications.unshift(notifObj);

        if (!isInitialNotifs && !seenNotifIds.has(numericId)) {
          newItemsFound.push(n);
        }
      }

      seenNotifIds.add(numericId);
    });

    if (typeof saveNotifications === 'function') {
      try { saveNotifications(); } catch (e) {}
    }
    if (typeof renderNotifications === 'function') {
      try { renderNotifications(); } catch (e) {}
    }

    // Trigger alerts for newly arrived announcements
    if (!isInitialNotifs && newItemsFound.length > 0) {
      var latest = newItemsFound[0];
      triggerDeviceNotification(latest.title, latest.body, latest.id);
    }

    isInitialNotifs = false;
  }

  /* ───────────────────────────────────────────────────────────
     همگام‌سازی
  ─────────────────────────────────────────────────────────── */
  async function syncNews() {
    try {
      const res = await fetch(apiBase() + '/news.php?limit=50', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || data.success !== true) return false;
      applyNews(data.items || []);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function syncNotifications() {
    try {
      var phone = '';
      if (typeof getCurrentPhone === 'function') {
        phone = getCurrentPhone();
      }
      if (!phone && typeof userProfile !== 'undefined') {
        phone = userProfile.rawPhone || userProfile.phone || '';
      }

      // If user hasn't logged in, query broadcast notifications ('all')
      var queryPhone = phone || 'all';
      const res = await fetch(apiBase() + '/notifications.php?phone=' + encodeURIComponent(queryPhone) + '&t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || data.success !== true) return false;
      applyNotifications(data.notifications || []);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function syncReportsLive() {
    try {
      var phone = (typeof getCurrentPhone === 'function') ? getCurrentPhone() : '';
      if (phone && typeof loadReportsFromBackend === 'function') {
        await loadReportsFromBackend(phone, { silent: true });
      }
    } catch (e) {}
  }

  window.syncLiveContent = async function () {
    if (isSyncing) return;
    isSyncing = true;
    try {
      await syncNotifications();
      await syncReportsLive();
    } finally {
      isSyncing = false;
    }
  };

  /* راه‌اندازی و بررسی مداوم بلادرنگ (هر ۳.۵ ثانیه) */
  function start() {
    // Initial fetch of news and notifications
    syncNews();
    syncNotifications();

    // Fast real-time polling for instant broadcast notifications and report updates
    setInterval(window.syncLiveContent, 3500);

    // Refresh news every 30 seconds
    setInterval(syncNews, 30000);

    // Request notification permission gracefully on first user interaction
    var permissionTriggered = false;
    function promptPerm() {
      if (permissionTriggered) return;
      permissionTriggered = true;
      requestPushPermission();
      document.removeEventListener('click', promptPerm);
      document.removeEventListener('touchstart', promptPerm);
    }
    document.addEventListener('click', promptPerm);
    document.addEventListener('touchstart', promptPerm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
