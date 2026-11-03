/* Home dashboard */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance, Tasks, Habits, Forms, Events, Goals } = root;

  const QUOTES = [
    'Small steps every day add up to big results.', 'Discipline is choosing what you want most over what you want now.',
    'Do one thing today your future self will thank you for.', 'Progress, not perfection.', 'Your habits shape your future.',
    'A budget is telling your money where to go instead of wondering where it went.', 'Start where you are. Use what you have. Do what you can.',
    'Focus on being productive instead of busy.', 'The best time to start was yesterday. The next best time is now.', 'Consistency beats intensity.',
    'Every rupee saved is a rupee earned.', 'Plan your day, or your day will plan you.', 'Done is better than perfect.', 'Make today count.',
  ];

  function taskRow(t, today) {
    const over = Tasks.isOverdue(t, today);
    return '<div class="task ' + (t.status === 'Completed' ? 'done' : '') + (over ? ' overdue' : '') + '" data-id="' + t.id + '">' +
      '<button class="check ' + (t.status === 'In Progress' ? 'progress' : '') + '" data-toggle aria-label="Toggle complete">' + (t.status === 'Completed' ? '✓' : t.status === 'In Progress' ? '…' : '') + '</button>' +
      '<div class="body" data-open><div class="title">' + (t.pinned ? '📌 ' : '') + U.esc(t.title) + '</div>' +
      '<div class="meta"><span class="badge ' + t.priority.toLowerCase() + '">' + t.priority + '</span>' +
      (t.date !== today ? '<span>' + U.relDay(t.date, today) + '</span>' : '') +
      (t.startTime ? '<span>' + U.fmtTime(t.startTime) + '</span>' : '') + (t.deadline ? '<span>due ' + U.fmtTime(t.deadline) + '</span>' : '') +
      (over ? '<span class="badge bad">Overdue</span>' : '') + (t.recurrence ? '<span>🔁</span>' : '') + '</div></div></div>';
  }
  root.taskRow = taskRow;

  function bindTaskList(el) {
    el.addEventListener('click', e => {
      const row = e.target.closest('.task'); if (!row) return;
      if (e.target.closest('[data-toggle]')) { const sp = Tasks.toggle(row.dataset.id); if (sp) UI.toast('Next occurrence created for ' + U.relDay(sp.date)); }
      else if (e.target.closest('[data-open]')) Forms.task({ id: row.dataset.id });
    });
  }
  root.bindTaskList = bindTaskList;

  function txRow(t) {
    const sign = t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '';
    const cls = t.type === 'expense' ? 'bad' : t.type === 'income' ? 'good' : '';
    const amt = t.type === 'adjustment' ? U.fmtINR(t.amount, { plus: true }) : sign + U.fmtINR(t.amount);
    const sub = t.type === 'transfer' ? Finance.accName(t.accountId) + ' → ' + Finance.accName(t.toAccountId) : U.esc(t.category) + ' · ' + U.esc(Finance.accName(t.accountId));
    return '<div class="item clickable" data-tx="' + t.id + '"><div class="ico">' + UI.catIcon(t.category) + '</div><div class="body"><div class="title ellipsis">' + U.esc(t.title || t.category) + '</div><div class="sub ellipsis">' + sub + (t.time ? ' · ' + U.fmtTime(t.time) : '') + '</div></div><div class="amt ' + cls + '">' + amt + '</div></div>';
  }
  root.txRow = txRow;
  function bindTxList(el) { el.addEventListener('click', e => { const r = e.target.closest('[data-tx]'); if (r) Forms.transaction({ id: r.dataset.tx }); }); }
  root.bindTxList = bindTxList;

  UI.route('home', {
    title: 'MyLife OS',
    render(el) {
      const s = DB.get();
      const today = U.todayStr();
      const mk = U.monthKey(today);
      const st = Tasks.stats(today);
      const overdue = Tasks.overdue(today);
      const todayExp = Finance.totalExpense(today, today);
      const monthInc = Finance.totalIncome(mk + '-01', U.monthEnd(today));
      const monthExp = Finance.totalExpense(mk + '-01', U.monthEnd(today));
      const bal = Finance.totalBalance();
      const budget = Finance.budgetStatus(mk);
      const todays = Tasks.forDate(today);
      const upcoming = Tasks.upcoming(today, 7).slice(0, 5);
      const events = Events.upcoming(today, 14).slice(0, 3);
      const habits = s.habits.filter(h => !h.archived);
      const habitsDone = habits.filter(h => Habits.done(h, today)).length;
      const name = s.settings.name ? ', ' + s.settings.name : '';
      const quote = QUOTES[U.diffDays('2026-01-01', today) % QUOTES.length];
      const backupDue = s.settings.backupReminderDays > 0 && (s.transactions.length + s.tasks.length > 5) && (Date.now() - (s.settings.lastBackupAt || s.createdAt)) > s.settings.backupReminderDays * 86400000;

      el.innerHTML =
        '<div class="row between" style="align-items:flex-start"><div><div class="muted small">' + U.fmtDate(today, { weekday: true }) + '</div><h2 style="font-size:22px">' + U.greeting() + U.esc(name) + ' 👋</h2></div></div>' +
        '<p class="faint small mt-s" style="font-style:italic">“' + quote + '”</p>' +
        (s._recovered ? '<div class="alert warn mt">⚠ Your main data file was unreadable; the last good backup copy was restored.</div>' : '') +
        (backupDue ? '<div class="alert info mt"><span>💾</span><span class="grow">It has been a while since your last backup.</span><button class="link" data-go="settings">Back up now</button></div>' : '') +
        '<div class="section-head"><h2>Quick add</h2></div>' +
        '<div class="quick-actions">' +
          '<button data-q="task"><span class="qi">☑</span>Task</button><button data-q="expense"><span class="qi">💸</span>Expense</button><button data-q="income"><span class="qi">💰</span>Income</button><button data-q="transfer"><span class="qi">🔁</span>Transfer</button><button data-q="note"><span class="qi">📝</span>Note</button>' +
        '</div>' +
        '<div class="section-head"><h2>Today</h2><a href="#/tasks">All tasks ›</a></div>' +
        '<div class="grid4">' +
          '<div class="stat sm"><div class="label">Tasks</div><div class="value">' + st.total + '</div></div>' +
          '<div class="stat sm"><div class="label">Done</div><div class="value good">' + st.done + '</div></div>' +
          '<div class="stat sm"><div class="label">Pending</div><div class="value">' + st.pending + '</div></div>' +
          '<div class="stat sm"><div class="label">Overdue</div><div class="value ' + (overdue.length ? 'bad' : '') + '">' + overdue.length + '</div></div>' +
        '</div>' +
        (st.total ? '<div class="card tight mt"><div class="row between small"><span class="muted">Completion</span><span class="bold">' + st.pct + '%</span></div>' + UI.progress(st.pct, st.pct === 100 ? 'good' : '') + '</div>' : '') +
        '<div class="section-head"><h2>Money</h2><a href="#/finance">Finance ›</a></div>' +
        '<div class="card accent"><div class="muted small">Available balance</div><div class="hero-num num">' + U.fmtINR(bal) + '</div>' +
          '<div class="row between mt small"><span>Today\'s spend</span><span class="bold num">' + U.fmtINR(todayExp) + '</span></div></div>' +
        '<div class="grid2 mt">' +
          '<div class="stat"><div class="label">Income · ' + U.fmtMonth(mk) + '</div><div class="value good num">' + U.fmtINR(monthInc, { whole: true }) + '</div></div>' +
          '<div class="stat"><div class="label">Spent · ' + U.fmtMonth(mk) + '</div><div class="value bad num">' + U.fmtINR(monthExp, { whole: true }) + '</div></div>' +
        '</div>' +
        (budget.overall ? '<div class="card tight mt"><div class="row between small"><span class="muted">Monthly budget</span><span class="bold num">' + U.fmtINR(budget.spent, { whole: true }) + ' / ' + U.fmtINR(budget.overall, { whole: true }) + '</span></div>' + UI.progress(budget.pct, budget.pct >= 100 ? 'bad' : budget.pct >= 80 ? 'warn' : 'good') + '</div>' : '') +
        budget.alerts.slice(0, 2).map(a => '<div class="alert ' + (a.level === 'over' ? 'bad' : 'warn') + ' mt">⚠ ' + U.esc(a.text) + '</div>').join('') +
        (habits.length ? '<div class="section-head"><h2>Habits</h2><a href="#/habits">All ›</a></div><div class="card tight"><div class="row between small mb"><span class="muted">' + habitsDone + ' of ' + habits.length + ' done today</span><span class="bold">' + U.pct(habitsDone, habits.length) + '%</span></div><div class="chips" style="padding-bottom:0">' + habits.map(h => '<button class="chip ' + (Habits.done(h, today) ? 'active' : '') + '" data-habit="' + h.id + '">' + h.icon + ' ' + U.esc(h.name) + '</button>').join('') + '</div></div>' : '') +
        '<div class="section-head"><h2>Today\'s tasks</h2><button class="link" data-q="task">+ Add</button></div>' +
        '<div class="card" id="home-tasks">' + (todays.length ? todays.slice(0, 8).map(t => taskRow(t, today)).join('') + (todays.length > 8 ? '<a class="small" href="#/tasks">+ ' + (todays.length - 8) + ' more</a>' : '') : UI.empty('🎉', 'Nothing scheduled for today', 'Tap + to add a task')) + '</div>' +
        (overdue.length ? '<div class="section-head"><h2 class="bad">Overdue</h2><button class="link" data-carry>Move all to today</button></div><div class="card" id="home-overdue">' + overdue.slice(0, 5).map(t => taskRow(t, today)).join('') + '</div>' : '') +
        (upcoming.length || events.length ? '<div class="section-head"><h2>Upcoming</h2><a href="#/calendar">Calendar ›</a></div><div class="card" id="home-upcoming">' +
          events.map(e => '<div class="item"><div class="ico">📅</div><div class="body"><div class="title">' + U.esc(e.title) + '</div><div class="sub">' + U.relDay(e.date, today) + (e.time ? ' · ' + U.fmtTime(e.time) : '') + '</div></div></div>').join('') +
          upcoming.map(t => taskRow(t, today)).join('') + '</div>' : '') +
        '<div class="section-head"><h2>Recent transactions</h2><a href="#/finance">All ›</a></div>' +
        '<div class="card list" id="home-tx">' + (s.transactions.length ? Finance.sorted().slice(0, 5).map(txRow).join('') : UI.empty('💳', 'No transactions yet', 'Set your opening balance in Finance')) + '</div>';

      el.addEventListener('click', e => {
        const q = e.target.closest('[data-q]');
        if (q) { const k = q.dataset.q; if (k === 'task') Forms.task(); else if (k === 'note') Forms.note(); else Forms.transaction({ type: k }); return; }
        const h = e.target.closest('[data-habit]'); if (h) { Habits.toggle(h.dataset.habit); return; }
        if (e.target.closest('[data-carry]')) { const n = Tasks.carryForward(); UI.toast(n + ' task(s) moved to today'); return; }
        const g = e.target.closest('[data-go]'); if (g) UI.go(g.dataset.go);
      });
      ['home-tasks', 'home-overdue', 'home-upcoming'].forEach(id => { const x = el.querySelector('#' + id); if (x) bindTaskList(x); });
      bindTxList(el.querySelector('#home-tx'));
    },
  });
})(window);
