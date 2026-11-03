/* Calendar: month grid shared by Tasks (calendar mode) and the Calendar page */
(function (root) {
  'use strict';
  const { U, UI, DB, Tasks, Events, Forms } = root;
  const state = { date: null };

  // Renders a month grid for the month containing `sel`. Uses data-d / data-mnav buttons.
  function calendarHTML(sel, opts) {
    opts = opts || {};
    const today = U.todayStr();
    const mk = U.monthKey(sel);
    const first = mk + '-01';
    const [y, m] = mk.split('-').map(Number);
    const n = U.daysInMonth(y, m);
    const startDow = (U.dayOfWeek(first) + 6) % 7; // Monday first
    const tmap = opts.tasks !== false ? Tasks.monthMap(mk, today) : {};
    const emap = {};
    if (opts.events !== false) for (const e of DB.get().events) if (e.date.startsWith(mk)) emap[e.date] = (emap[e.date] || 0) + 1;
    if (opts.goals !== false) for (const g of DB.get().goals) if (g.targetDate && g.targetDate.startsWith(mk) && g.status !== 'Completed') emap[g.targetDate] = (emap[g.targetDate] || 0) + 1;
    let h = '<div class="card"><div class="cal-head"><button class="icon-btn" data-mnav="-1">‹</button><h2>' + U.fmtMonthLong(mk) + '</h2><button class="icon-btn" data-mnav="1">›</button></div><div class="cal-grid">';
    h += ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => '<div class="dow">' + d + '</div>').join('');
    for (let i = 0; i < startDow; i++) { const d = U.addDays(first, i - startDow); h += '<button class="cal-day other" data-d="' + d + '">' + +d.slice(8) + '</button>'; }
    for (let d = 1; d <= n; d++) {
      const ds = mk + '-' + U.pad(d);
      const t = tmap[ds]; const ev = emap[ds];
      let dots = '';
      if (t) { if (t.overdue) dots += '<i class="over"></i>'; if (t.total - t.done - t.overdue > 0) dots += '<i></i>'; if (t.done) dots += '<i class="done"></i>'; }
      if (ev) dots += '<i class="ev"></i>';
      h += '<button class="cal-day' + (ds === today ? ' today' : '') + (ds === sel ? ' sel' : '') + '" data-d="' + ds + '">' + d + '<span class="dots">' + dots + '</span></button>';
    }
    const trailing = (7 - ((startDow + n) % 7)) % 7;
    for (let i = 1; i <= trailing; i++) { const d = U.addDays(mk + '-' + U.pad(n), i); h += '<button class="cal-day other" data-d="' + d + '">' + +d.slice(8) + '</button>'; }
    h += '</div><div class="row wrap xs faint mt-s" style="gap:10px"><span><i class="badge" style="background:var(--accent);width:6px;height:6px;padding:0;display:inline-block;border-radius:50%"></i> pending</span><span><i class="badge" style="background:var(--good);width:6px;height:6px;padding:0;display:inline-block;border-radius:50%"></i> done</span><span><i class="badge" style="background:var(--bad);width:6px;height:6px;padding:0;display:inline-block;border-radius:50%"></i> overdue</span><span><i class="badge" style="background:var(--s7);width:6px;height:6px;padding:0;display:inline-block;border-radius:50%"></i> event / deadline</span></div></div>';
    return h;
  }
  root.calendarHTML = calendarHTML;

  UI.route('calendar', {
    title: 'Calendar', tab: 'more',
    render(el) {
      const today = U.todayStr();
      if (!state.date) state.date = today;
      const sel = state.date;
      const tasks = Tasks.forDate(sel);
      const events = Events.forDate(sel);
      const goals = DB.get().goals.filter(g => g.targetDate === sel);
      const upcoming = Events.upcoming(today, 60);
      const deadlines = DB.get().goals.filter(g => g.targetDate && g.targetDate >= today && g.status !== 'Completed').sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 5);
      let h = calendarHTML(sel);
      h += '<div class="section-head"><h2>' + U.relDay(sel, today) + '</h2><div class="row" style="gap:6px"><button class="btn sm" data-ev>+ Event</button><button class="btn sm primary" data-task>+ Task</button></div></div>';
      h += '<div class="card" id="cal-agenda">' +
        events.map(e => '<div class="item clickable" data-ev-id="' + e.id + '"><div class="ico" style="background:var(--accent-soft)">📅</div><div class="body"><div class="title">' + U.esc(e.title) + '</div><div class="sub">' + (e.time ? U.fmtTime(e.time) + ' · ' : '') + U.esc(e.note || 'Event') + '</div></div></div>').join('') +
        goals.map(g => '<div class="item"><div class="ico">🎯</div><div class="body"><div class="title">Goal deadline: ' + U.esc(g.title) + '</div><div class="sub">' + g.status + '</div></div></div>').join('') +
        tasks.map(t => root.taskRow(t, today)).join('') +
        (!events.length && !tasks.length && !goals.length ? UI.empty('🗓️', 'Nothing on this day') : '') + '</div>';
      if (upcoming.length || deadlines.length) {
        h += '<div class="section-head"><h2>Upcoming events & deadlines</h2></div><div class="card list" id="cal-upcoming">' +
          upcoming.map(e => '<div class="item clickable" data-ev-id="' + e.id + '"><div class="ico">📅</div><div class="body"><div class="title">' + U.esc(e.title) + '</div><div class="sub">' + U.relDay(e.date, today) + (e.time ? ' · ' + U.fmtTime(e.time) : '') + '</div></div><span class="xs faint">' + (U.diffDays(today, e.date) === 0 ? 'today' : 'in ' + U.diffDays(today, e.date) + 'd') + '</span></div>').join('') +
          deadlines.map(g => '<div class="item"><div class="ico">🎯</div><div class="body"><div class="title">' + U.esc(g.title) + '</div><div class="sub">Goal due ' + U.fmtDate(g.targetDate) + '</div></div><span class="xs faint">in ' + U.diffDays(today, g.targetDate) + 'd</span></div>').join('') + '</div>';
      }
      el.innerHTML = h;
      el.addEventListener('click', e => {
        const d = e.target.closest('[data-d]'); if (d) { state.date = d.dataset.d; UI.refresh(); return; }
        const mn = e.target.closest('[data-mnav]'); if (mn) { state.date = U.addMonths(U.monthStart(state.date), +mn.dataset.mnav); UI.refresh(); return; }
        if (e.target.closest('[data-ev]')) { Forms.event({ date: sel }); return; }
        if (e.target.closest('[data-task]')) { Forms.task({ date: sel }); return; }
        const ev = e.target.closest('[data-ev-id]'); if (ev) { Forms.event({ id: ev.dataset.evId }); }
      });
      root.bindTaskList(el.querySelector('#cal-agenda'));
    },
  });
})(window);
