/* Settings, backup & restore, categories, data management */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance } = root;

  function exportBackup() {
    const json = DB.exportJSON();
    UI.download('mylifeos-backup-' + U.todayStr() + '.json', json, 'application/json');
    DB.update(s => { s.settings.lastBackupAt = Date.now(); });
    UI.toast('Backup downloaded', 'good');
  }
  root.exportBackup = exportBackup;

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let doc;
      try { doc = JSON.parse(reader.result); } catch (e) { UI.toast('That file is not valid JSON', 'bad'); return; }
      const v = DB.validate(doc);
      if (!v.ok) { UI.sheet({ title: 'Import failed', body: '<div class="alert bad mb">The file has problems and was not imported.</div><ul class="small muted">' + v.errors.map(e => '<li>' + U.esc(e) + '</li>').join('') + '</ul>' }); return; }
      const cur = DB.get();
      const counts = ['transactions', 'tasks', 'notes', 'habits', 'goals', 'events'].map(k => k + ': ' + ((doc[k] || []).length)).join(' · ');
      UI.sheet({
        title: 'Restore backup',
        body: '<p class="small muted">Backup from <b>' + (doc.exportedAt ? U.fmtDateTime(doc.exportedAt) : 'unknown date') + '</b><br>' + counts + '</p>' +
          '<p class="small muted mt">You currently have ' + cur.transactions.length + ' transactions and ' + cur.tasks.length + ' tasks on this device.</p>' +
          '<div class="stack mt"><button type="button" class="btn" data-mode="merge"><span>Merge</span><span class="xs faint">· add records that are not already here</span></button><button type="button" class="btn danger" data-mode="replace">Replace everything with this backup</button></div>',
        onOpen(form, close) {
          form.addEventListener('click', async e => {
            const b = e.target.closest('[data-mode]'); if (!b) return;
            if (b.dataset.mode === 'replace') {
              if (!await UI.confirm({ title: 'Replace all data?', message: 'All current data on this device will be overwritten by the backup. This cannot be undone. A safety copy of the current data will be downloaded first.', ok: 'Replace' })) return;
              UI.download('mylifeos-before-restore-' + U.todayStr() + '.json', DB.exportJSON(), 'application/json');
              DB.replace(doc); close(); UI.toast('Backup restored', 'good'); UI.go('home');
            } else {
              const c = DB.mergeFrom(doc); close();
              UI.toast('Merged: ' + Object.entries(c).filter(x => x[1]).map(x => x[1] + ' ' + x[0]).join(', ') || 'Nothing new to merge', 'good');
            }
          });
        },
      });
    };
    reader.readAsText(file);
  }

  function categoriesSheet(key, title) {
    const s = DB.get();
    UI.sheet({
      title, submit: 'Add',
      body: '<div class="list" data-cats>' + s.settings[key].map(c => '<div class="item" style="min-height:44px;padding:6px 0"><div class="body">' + UI.catIcon(c) + ' ' + U.esc(c) + '</div><button type="button" class="btn sm danger" data-rm="' + U.esc(c) + '">✕</button></div>').join('') + '</div>' + UI.field('New category', UI.input('name', '', 'placeholder="Name"')),
      onOpen(form, close) { form.addEventListener('click', async e => { const r = e.target.closest('[data-rm]'); if (!r) return; if (s.settings[key].length <= 1) { UI.toast('Keep at least one category', 'bad'); return; } if (await UI.confirm({ message: 'Remove "' + r.dataset.rm + '"? Existing records keep their category.' , ok: 'Remove' })) { DB.update(st => { st.settings[key] = st.settings[key].filter(c => c !== r.dataset.rm); }); close(); categoriesSheet(key, title); } }); },
      onSubmit(form) { const n = form.name.value.trim(); if (!n) throw new Error('Enter a name.'); DB.update(st => { if (!st.settings[key].includes(n)) st.settings[key].push(n); }); },
    });
  }

  UI.route('settings', {
    title: 'Settings', tab: 'more', noFab: true,
    render(el) {
      const s = DB.get();
      const size = Math.round(DB.rawSize() / 1024);
      el.innerHTML =
        '<div class="card"><div class="card-title">Profile</div>' + UI.field('Your name (for the greeting)', UI.input('name', s.settings.name, 'data-name placeholder="e.g. Priya"')) +
          '<div class="field"><label>Theme</label>' + UI.segmented('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.settings.theme) + '</div>' +
          UI.field('Default account for new expenses', UI.select('defAcc', s.accounts.map(a => [a.id, a.icon + ' ' + a.name]), s.settings.defaultAccountId)) + '</div>' +
        '<div class="card mt"><div class="card-title">Backup & restore</div><p class="small muted">Your data lives only in this browser. Download a backup regularly and keep it in Google Drive or email it to yourself.</p>' +
          '<div class="xs faint mt-s">Last backup: ' + (s.settings.lastBackupAt ? U.fmtDateTime(s.settings.lastBackupAt) : 'never') + ' · data size ' + size + ' KB</div>' +
          '<div class="grid2 mt"><button class="btn primary" data-export>⬇ Export JSON</button><label class="btn" style="cursor:pointer">⬆ Import JSON<input type="file" accept="application/json,.json" data-import hidden></label></div>' +
          '<div class="grid2 mt"><button class="btn" data-csv>Transactions CSV</button><button class="btn" data-go="reports">Monthly report</button></div>' +
          '<div class="field mt"><label>Remind me to back up every</label>' + UI.select('bk', [[0, 'Never'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(x => [String(x[0]), x[1]]), String(s.settings.backupReminderDays)) + '</div></div>' +
        '<div class="card mt"><div class="card-title">Finance</div><div class="stack"><button class="btn" data-budget>Budgets & spending limits</button><button class="btn" data-cats="expenseCategories">Expense categories</button><button class="btn" data-cats="incomeCategories">Income sources</button><button class="btn" data-setbal>Set account balance</button></div></div>' +
        '<div class="card mt"><div class="card-title">Tasks & notes</div><div class="stack"><button class="btn" data-cats="taskCategories">Task categories</button><button class="btn" data-cats="noteCategories">Note categories</button><button class="btn" data-notif>' + (('Notification' in window) ? (Notification.permission === 'granted' ? '🔔 Reminders enabled' : 'Enable reminder notifications') : 'Notifications not supported') + '</button></div></div>' +
        '<div class="card mt"><div class="card-title">App</div><div class="small muted">Version 1.0 · ' + (navigator.onLine ? 'Online' : 'Offline') + ' · ' + (window.matchMedia('(display-mode: standalone)').matches ? 'Installed as app' : 'Running in browser') + '</div><div class="stack mt"><button class="btn" data-install hidden>📲 Install app on home screen</button><button class="btn" data-update>Check for updates</button><button class="btn danger" data-wipe>Erase all data</button></div></div>';

      el.querySelector('[data-name]').addEventListener('change', e => DB.update(st => { st.settings.name = e.target.value.trim(); }, { silent: true }));
      el.querySelector('input[name=theme]').addEventListener('change', e => { DB.update(st => { st.settings.theme = e.target.value; }, { silent: true }); root.applyTheme(); });
      el.querySelector('select[name=defAcc]').addEventListener('change', e => DB.update(st => { st.settings.defaultAccountId = e.target.value; }, { silent: true }));
      el.querySelector('select[name=bk]').addEventListener('change', e => DB.update(st => { st.settings.backupReminderDays = +e.target.value; }, { silent: true }));
      el.querySelector('[data-import]').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
      const inst = el.querySelector('[data-install]');
      if (root.deferredInstall) inst.hidden = false;
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-export]')) { exportBackup(); return; }
        if (e.target.closest('[data-csv]')) { UI.download('mylifeos-transactions-all.csv', Finance.toCSV(), 'text/csv'); return; }
        const g = e.target.closest('[data-go]'); if (g) { UI.go(g.dataset.go); return; }
        if (e.target.closest('[data-budget]')) { root.budgetSheet(); return; }
        if (e.target.closest('[data-setbal]')) { root.setBalanceSheet(s.settings.defaultAccountId); return; }
        const c = e.target.closest('[data-cats]'); if (c) { categoriesSheet(c.dataset.cats, c.textContent); return; }
        if (e.target.closest('[data-notif]')) { if ('Notification' in window) { const p = await Notification.requestPermission(); UI.toast(p === 'granted' ? 'Reminders enabled' : 'Notifications blocked'); UI.refresh(); } return; }
        if (e.target.closest('[data-install]')) { if (root.deferredInstall) { root.deferredInstall.prompt(); root.deferredInstall = null; inst.hidden = true; } return; }
        if (e.target.closest('[data-update]')) { if (navigator.serviceWorker) { const r = await navigator.serviceWorker.getRegistration(); if (r) { await r.update(); UI.toast('Checked for updates'); } } return; }
        if (e.target.closest('[data-wipe]')) {
          if (!await UI.confirm({ title: 'Erase all data?', message: 'Everything — transactions, tasks, notes, habits, goals — will be permanently deleted from this device. Export a backup first!', ok: 'Erase everything' })) return;
          const typed = await UI.prompt({ title: 'Type ERASE to confirm', label: 'Confirmation' });
          if (typed !== 'ERASE') { UI.toast('Cancelled'); return; }
          DB.reset(); DB.saveNow(); location.hash = '#/home'; location.reload(); // fresh start shows the welcome sheet again
        }
      });
    },
  });
})(window);
