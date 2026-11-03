/* Tasks view: day strip + list, calendar mode, search & filters */
(function (root) {
  'use strict';
  const { U, UI, DB, Tasks, Forms } = root;
  const state = { date: null, mode: 'day', q: '', status: 'All', priority: 'All', category: 'All', showDone: true };

  function weekStrip(sel, today) {
    const start = U.weekStart(sel);
    let h = '<div class="week-strip">';
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(start, i);
      const n = Tasks.forDate(d).length;
      h += '<button data-d="' + d + '" class="' + (d === sel ? 'sel' : '') + '"><small>' + U.DAYS[U.dayOfWeek(d)] + '</small>' + +d.slice(8) + (n ? '<span class="dot"></span>' : '<span class="dot" style="opacity:0"></span>') + '</button>';
    }
    return h + '</div>';
  }

  UI.route('tasks', {
    title: 'Tasks',
    render(el) {
      const today = U.todayStr();
      if (!state.date) state.date = today;
      const s = DB.get();
      const sel = state.date;
      const st = Tasks.stats(sel);
      const overdue = Tasks.overdue(today);
      let h = '<div class="row between mb"><div class="seg" style="flex:1">' + ['day', 'calendar', 'search'].map(m => '<button data-mode="' + m + '" class="' + (state.mode === m ? 'active' : '') + '">' + (m === 'day' ? 'Day' : m === 'calendar' ? 'Calendar' : 'Search') + '</button>').join('') + '</div></div>';

      if (state.mode === 'day') {
        h += '<div class="row between mb"><button class="icon-btn" data-nav="-7">‹</button><div class="center grow"><div class="bold">' + U.relDay(sel, today) + '</div><div class="xs faint">' + (sel === today ? '' : U.fmtDate(sel)) + '</div></div><button class="icon-btn" data-nav="7">›</button></div>';
        h += weekStrip(sel, today);
        h += '<div class="row between mb"><button class="btn sm" data-today ' + (sel === today ? 'hidden' : '') + '>Go to today</button><input type="date" value="' + sel + '" data-pick style="min-height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);padding:0 10px;font-size:13px"><span class="grow"></span><button class="btn sm primary" data-add>+ Add</button></div>';
        const list = Tasks.forDate(sel);
        if (list.length) h += '<div class="card tight mb"><div class="row between small"><span class="muted">' + st.done + ' of ' + st.total + ' completed</span><span class="bold">' + st.pct + '%</span></div>' + UI.progress(st.pct, st.pct === 100 ? 'good' : '') + '</div>';
        h += '<div class="card" id="day-list">' + (list.length ? list.map(t => root.taskRow(t, today)).join('') : UI.empty('🗓️', 'No tasks on ' + U.relDay(sel, today).toLowerCase(), 'Tap + Add to plan this day')) + '</div>';
        if (sel === today && overdue.length) h += '<div class="section-head"><h2 class="bad">Overdue (' + overdue.length + ')</h2><button class="link" data-carry>Move all to today</button></div><div class="card" id="over-list">' + overdue.map(t => root.taskRow(t, today)).join('') + '</div>';
        const recent = Tasks.recentlyCompleted(8).filter(t => t.date !== sel).slice(0, 5); // skip ones already shown above
        if (recent.length) h += '<div class="section-head"><h2>Recently completed</h2></div><div class="card" id="recent-list">' + recent.map(t => root.taskRow(t, today)).join('') + '</div>';
      } else if (state.mode === 'calendar') {
        h += root.calendarHTML(sel, { tasks: true, events: false }) + '<div class="section-head"><h2>' + U.relDay(sel, today) + '</h2><button class="link" data-add>+ Add</button></div>';
        const list = Tasks.forDate(sel);
        h += '<div class="card" id="day-list">' + (list.length ? list.map(t => root.taskRow(t, today)).join('') : UI.empty('🗓️', 'No tasks on this day')) + '</div>';
      } else {
        h += '<div class="search-box">⌕<input data-q placeholder="Search tasks…" value="' + U.esc(state.q) + '"></div>';
        h += '<div class="chips">' + ['All', 'Pending', 'In Progress', 'Completed'].map(x => '<button class="chip ' + (state.status === x ? 'active' : '') + '" data-f="status" data-v="' + x + '">' + x + '</button>').join('') + '</div>';
        h += '<div class="chips">' + ['All', 'High', 'Medium', 'Low'].map(x => '<button class="chip ' + (state.priority === x ? 'active' : '') + '" data-f="priority" data-v="' + x + '">' + (x === 'All' ? 'Any priority' : x) + '</button>').join('') + '</div>';
        h += '<div class="chips">' + ['All'].concat(s.settings.taskCategories).map(x => '<button class="chip ' + (state.category === x ? 'active' : '') + '" data-f="category" data-v="' + U.esc(x) + '">' + (x === 'All' ? 'Any category' : U.esc(x)) + '</button>').join('') + '</div>';
        const list = Tasks.search(state.q, state).slice(0, 100);
        h += '<div class="card mt" id="day-list">' + (list.length ? list.map(t => root.taskRow(t, today)).join('') : UI.empty('🔍', 'No matching tasks')) + '</div>';
      }
      el.innerHTML = h;

      el.addEventListener('click', e => {
        const m = e.target.closest('[data-mode]'); if (m) { state.mode = m.dataset.mode; UI.refresh(); return; }
        const d = e.target.closest('[data-d]'); if (d) { state.date = d.dataset.d; UI.refresh(); return; }
        const nav = e.target.closest('[data-nav]'); if (nav) { state.date = U.addDays(state.date, +nav.dataset.nav); UI.refresh(); return; }
        const mn = e.target.closest('[data-mnav]'); if (mn) { state.date = U.addMonths(U.monthStart(state.date), +mn.dataset.mnav); UI.refresh(); return; }
        if (e.target.closest('[data-today]')) { state.date = today; UI.refresh(); return; }
        if (e.target.closest('[data-add]')) { Forms.task({ date: state.date }); return; }
        if (e.target.closest('[data-carry]')) { const n = Tasks.carryForward(); UI.toast(n + ' task(s) moved to today'); return; }
        const f = e.target.closest('[data-f]'); if (f) { state[f.dataset.f] = f.dataset.v; UI.refresh(); }
      });
      const pick = el.querySelector('[data-pick]'); if (pick) pick.addEventListener('change', () => { if (U.isDateStr(pick.value)) { state.date = pick.value; UI.refresh(); } });
      const q = el.querySelector('[data-q]'); if (q) { q.addEventListener('input', U.debounce(() => { state.q = q.value; const pos = q.selectionStart; UI.refresh(); const nq = el.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(pos, pos); }, 250)); }
      ['day-list', 'over-list', 'recent-list'].forEach(id => { const x = el.querySelector('#' + id); if (x) root.bindTaskList(x); });
    },
  });
})(window);
