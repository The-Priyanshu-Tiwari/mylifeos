/* More menu + global search + activity history */
(function (root) {
  'use strict';
  const { U, UI, DB, Forms, globalSearch } = root;

  UI.route('more', {
    title: 'More',
    render(el) {
      const s = DB.get();
      const items = [['habits', '🔥', 'Habits'], ['goals', '🎯', 'Goals'], ['notes', '📝', 'Notes & Journal'], ['calendar', '📅', 'Calendar'], ['reports', '📊', 'Reports'], ['review', '🗓️', 'Weekly review'], ['activity', '🕘', 'Activity'], ['settings', '⚙️', 'Settings & Backup']];
      el.innerHTML = '<div class="menu-grid">' + items.map(i => '<a href="#/' + i[0] + '"><span class="mi">' + i[1] + '</span><span>' + i[2] + '</span></a>').join('') + '</div>' +
        '<div class="card mt"><div class="card-title">Your data</div><div class="small muted">' + s.transactions.length + ' transactions · ' + s.tasks.length + ' tasks · ' + s.notes.length + ' notes · ' + s.habits.length + ' habits · ' + s.goals.length + ' goals</div><div class="xs faint mt-s">Stored only on this device. Last backup: ' + (s.settings.lastBackupAt ? U.fmtDateTime(s.settings.lastBackupAt) : 'never') + '</div><button class="btn sm mt" data-go="settings">Backup &amp; restore</button></div>' +
        '<p class="center xs faint mt">MyLife OS · offline personal dashboard</p>';
      el.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) UI.go(g.dataset.go); });
    },
  });

  UI.route('search', {
    title: 'Search', tab: 'more', noFab: true,
    render(el, params) {
      const q = params.q || '';
      el.innerHTML = '<div class="search-box">⌕<input data-q placeholder="Search tasks, expenses, notes…" value="' + U.esc(q) + '" autofocus></div><div id="results"></div>';
      const inp = el.querySelector('[data-q]');
      const res = el.querySelector('#results');
      function run() {
        const r = globalSearch(inp.value);
        const today = U.todayStr();
        if (!inp.value.trim()) { res.innerHTML = UI.empty('🔍', 'Type to search across everything'); return; }
        res.innerHTML =
          '<div class="section-head"><h2>Tasks (' + r.tasks.length + ')</h2></div><div class="card" id="s-tasks">' + (r.tasks.length ? r.tasks.map(t => root.taskRow(t, today)).join('') : '<p class="faint small">None</p>') + '</div>' +
          '<div class="section-head"><h2>Transactions (' + r.transactions.length + ')</h2></div><div class="card list" id="s-tx">' + (r.transactions.length ? r.transactions.map(root.txRow).join('') : '<p class="faint small">None</p>') + '</div>' +
          '<div class="section-head"><h2>Notes (' + r.notes.length + ')</h2></div><div class="notes-grid" id="s-notes">' + (r.notes.length ? r.notes.map(root.noteCard).join('') : '<p class="faint small">None</p>') + '</div>';
        root.bindTaskList(res.querySelector('#s-tasks')); root.bindTxList(res.querySelector('#s-tx'));
        res.querySelector('#s-notes').addEventListener('click', e => { const n = e.target.closest('[data-note]'); if (n) Forms.note({ id: n.dataset.note }); });
      }
      inp.addEventListener('input', U.debounce(run, 200));
      run();
      setTimeout(() => inp.focus(), 50);
    },
  });

  UI.route('activity', {
    title: 'Activity', tab: 'more', noFab: true,
    render(el) {
      const a = DB.get().activity;
      el.innerHTML = '<div class="card list">' + (a.length ? a.slice(0, 100).map(x => '<div class="item" style="min-height:44px;padding:8px 0"><div class="body"><div class="small">' + U.esc(x.text) + '</div><div class="xs faint">' + U.fmtDateTime(x.ts) + '</div></div></div>').join('') : UI.empty('🕘', 'No activity yet')) + '</div>';
    },
  });

  UI.route('review', {
    title: 'Review', tab: 'more', noFab: true,
    render(el, params) {
      const { Finance, Tasks, Habits } = root;
      const today = U.todayStr();
      const mode = params.mode || 'week';
      const from = mode === 'week' ? U.weekStart(today) : U.monthStart(today);
      const to = mode === 'week' ? U.weekEnd(today) : U.monthEnd(today);
      const pf = mode === 'week' ? U.addDays(from, -7) : U.addMonths(from, -1);
      const pt = mode === 'week' ? U.addDays(to, -7) : U.monthEnd(pf);
      const tasks = Tasks.inRange(from, to); const done = tasks.filter(t => t.status === 'Completed').length;
      const ptasks = Tasks.inRange(pf, pt); const pdone = ptasks.filter(t => t.status === 'Completed').length;
      const exp = Finance.totalExpense(from, to), pexp = Finance.totalExpense(pf, pt);
      const inc = Finance.totalIncome(from, to);
      const cats = Finance.byCategory(from, to).slice(0, 3);
      const habits = DB.get().habits.filter(h => !h.archived);
      const delta = (a, b, money) => b === 0 ? '' : '<span class="xs ' + (a > b ? 'bad' : 'good') + '">' + (a > b ? '▲' : '▼') + ' ' + (money ? U.fmtINRCompact(Math.abs(a - b)) : Math.abs(a - b)) + ' vs last ' + mode + '</span>';
      el.innerHTML = '<div class="seg mb"><button data-m="day" class="' + (mode === 'day' ? 'active' : '') + '">Today</button><button data-m="week" class="' + (mode === 'week' ? 'active' : '') + '">This week</button><button data-m="month" class="' + (mode === 'month' ? 'active' : '') + '">This month</button></div>' +
        (mode === 'day' ? dayOverview() :
        '<div class="muted small mb">' + U.fmtDate(from) + ' – ' + U.fmtDate(to) + '</div>' +
        '<div class="grid2"><div class="stat"><div class="label">Tasks completed</div><div class="value">' + done + ' <span class="small muted">/ ' + tasks.length + '</span></div>' + delta(pdone, done) + '</div><div class="stat"><div class="label">Completion rate</div><div class="value">' + U.pct(done, tasks.length) + '%</div></div></div>' +
        '<div class="grid2 mt"><div class="stat"><div class="label">Spent</div><div class="value bad num">' + U.fmtINRCompact(exp) + '</div>' + delta(exp, pexp, true) + '</div><div class="stat"><div class="label">Income</div><div class="value good num">' + U.fmtINRCompact(inc) + '</div></div></div>' +
        (cats.length ? '<div class="card mt"><div class="card-title">Top spending</div>' + cats.map(c => '<div class="row between small" style="padding:4px 0"><span>' + UI.catIcon(c[0]) + ' ' + U.esc(c[0]) + '</span><span class="num bold">' + U.fmtINR(c[1], { whole: true }) + '</span></div>').join('') + '</div>' : '') +
        (habits.length ? '<div class="card mt"><div class="card-title">Habits</div>' + habits.map(h => '<div class="row between small" style="padding:4px 0"><span>' + h.icon + ' ' + U.esc(h.name) + '</span><span class="num">' + Habits.countInRange(h, from, to > today ? today : to) + ' / ' + (U.diffDays(from, to > today ? today : to) + 1) + ' days</span></div>').join('') + '</div>' : '') +
        '<div class="card mt"><div class="card-title">Reflection</div><p class="small muted">' + reflection(done, tasks.length, exp, pexp) + '</p><button class="btn sm mt" data-journal>Write a journal entry</button></div>');
      function dayOverview() {
        const st = Tasks.stats(today); const e = Finance.totalExpense(today, today);
        const hd = habits.filter(h => Habits.done(h, today)).length;
        return '<div class="grid2"><div class="stat"><div class="label">Tasks</div><div class="value">' + st.done + ' / ' + st.total + '</div></div><div class="stat"><div class="label">Spent today</div><div class="value bad num">' + U.fmtINR(e) + '</div></div><div class="stat"><div class="label">Habits</div><div class="value">' + hd + ' / ' + habits.length + '</div></div><div class="stat"><div class="label">Overdue</div><div class="value">' + Tasks.overdue(today).length + '</div></div></div><div class="card mt"><div class="card-title">Reflection</div><p class="small muted">' + reflection(st.done, st.total, e, 0) + '</p><button class="btn sm mt" data-journal>Write a journal entry</button></div>';
      }
      function reflection(d, t, e, pe) {
        const parts = [];
        if (t === 0) parts.push('No tasks were planned. Try planning tomorrow tonight.');
        else if (d === t) parts.push('You completed everything you planned — excellent.');
        else if (d / t >= 0.7) parts.push('Good progress: most tasks got done.');
        else parts.push('Many tasks are still pending. Consider fewer, more focused tasks.');
        if (pe && e > pe * 1.2) parts.push('Spending is up noticeably compared to the previous period.');
        else if (pe && e < pe * 0.8) parts.push('Spending is down compared to the previous period — nice.');
        return parts.join(' ');
      }
      el.addEventListener('click', e => { const m = e.target.closest('[data-m]'); if (m) { UI.go('review', { mode: m.dataset.m }); return; } if (e.target.closest('[data-journal]')) Forms.note({ journal: true }); });
    },
  });
})(window);
