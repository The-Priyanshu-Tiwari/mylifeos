/* MyLife OS — bootstrap */
(function (root) {
  'use strict';
  const { U, UI, DB, Tasks, Forms } = root;

  function applyTheme() {
    const t = DB.get().settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#111110' : '#f6f6f3'));
  }
  root.applyTheme = applyTheme;

  function onboarding() {
    UI.sheet({
      title: 'Welcome to MyLife OS 👋', submit: 'Get started',
      body: '<p class="small muted mb">Your private dashboard for tasks, money, habits and more. Everything stays on this device — no account needed.</p>' +
        UI.field('What should I call you?', UI.input('name', '', 'placeholder="Your name" autofocus')) +
        '<div class="card-title mt">How much money do you have right now?</div>' +
        DB.get().accounts.map(a => '<div class="field inline"><label>' + a.icon + ' ' + U.esc(a.name) + '</label><input name="bal:' + a.id + '" inputmode="decimal" placeholder="₹ 0" style="max-width:140px;min-height:40px"></div>').join('') +
        '<p class="hint faint xs">You can change these anytime in Finance → Set balance.</p>',
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        DB.update(s => { s.settings.name = (f.name || '').trim(); s.settings.onboarded = true; }, { silent: true });
        for (const [k, v] of Object.entries(f)) if (k.startsWith('bal:') && v.trim()) { const p = Forms.amountFromInput(v); if (!isNaN(p) && p !== 0) root.Finance.setBalance(k.slice(4), p); }
        UI.refresh();
      },
    });
  }

  // Reminders: check each minute for tasks whose reminder time has arrived today.
  const fired = new Set();
  function checkReminders() {
    const today = U.todayStr(), now = U.nowTime();
    for (const t of Tasks.forDate(today)) {
      if (!t.reminder || t.status === 'Completed') continue;
      const at = t.reminderTime || t.startTime;
      if (!at || at > now) continue;
      const key = t.id + '@' + today;
      if (fired.has(key)) continue;
      // only fire within 2 minutes of the time, so reopening the app later does not spam old reminders
      const [h, m] = at.split(':').map(Number), [nh, nm] = now.split(':').map(Number);
      if ((nh * 60 + nm) - (h * 60 + m) > 2) { fired.add(key); continue; }
      fired.add(key);
      UI.toast('⏰ ' + t.title, '', { label: 'Open', onClick: () => Forms.task({ id: t.id }) });
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('MyLife OS reminder', { body: t.title + (t.deadline ? ' · due ' + U.fmtTime(t.deadline) : ''), icon: 'icons/icon-192.png', tag: key }); } catch (e) { /* ignore */ }
      }
    }
  }

  function init() {
    DB.load();
    applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    window.addEventListener('hashchange', UI.render);
    UI.render();
    DB.subscribe(() => UI.render());

    document.getElementById('fab').addEventListener('click', () => Forms.quickAdd());
    document.getElementById('btn-back').addEventListener('click', () => { if (history.length > 1) history.back(); else UI.go('more'); });
    document.getElementById('btn-search').addEventListener('click', () => UI.go('search'));
    document.getElementById('btn-theme').addEventListener('click', () => {
      const cur = DB.get().settings.theme;
      const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      DB.update(s => { s.settings.theme = dark ? 'light' : 'dark'; }, { silent: true });
      applyTheme(); UI.render();
    });

    if (!DB.get().settings.onboarded && !DB.get().transactions.length) setTimeout(onboarding, 300);

    // offline/online indicator
    function net() { let b = document.getElementById('net-banner'); if (!navigator.onLine) { if (!b) { b = document.createElement('div'); b.id = 'net-banner'; b.className = 'offline-banner'; b.textContent = 'Offline — everything still works and is saved on this device.'; document.getElementById('topbar').appendChild(b); } } else if (b) b.remove(); }
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    if (!DB.persistent) { const b = document.createElement('div'); b.className = 'offline-banner'; b.style.background = 'var(--bad)'; b.textContent = 'Storage is blocked here — nothing will be saved. Open the app from an https:// link in Chrome.'; document.getElementById('topbar').appendChild(b); }

    // install prompt
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); root.deferredInstall = e; });

    // re-render at midnight / when returning to the app so "today" is right
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { UI.render(); checkReminders(); } });
    setInterval(checkReminders, 60000);
    checkReminders();

    // service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) UI.toast('Update ready', '', { label: 'Reload', onClick: () => { nw.postMessage('skipWaiting'); setTimeout(() => location.reload(), 300); } });
          });
        });
      }).catch(err => console.warn('SW registration failed', err));
    }

    // keep the save error visible
    DB.subscribe(() => { if (DB.lastError) UI.toast('⚠ Could not save — storage may be full. Export a backup.', 'bad'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
