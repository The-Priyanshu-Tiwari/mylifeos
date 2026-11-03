/* Habits view */
(function (root) {
  'use strict';
  const { U, UI, DB, Habits, Forms } = root;
  const state = { showArchived: false };

  UI.route('habits', {
    title: 'Habits', tab: 'more',
    render(el) {
      const today = U.todayStr();
      const all = DB.get().habits;
      const habits = all.filter(h => state.showArchived || !h.archived);
      const done = habits.filter(h => !h.archived && Habits.done(h, today)).length;
      const active = habits.filter(h => !h.archived).length;
      const ws = U.weekStart(today);
      const ms = U.monthStart(today);
      let h = '<div class="card accent"><div class="row between"><div><div class="muted small">Today</div><div class="hero-num">' + done + ' <span style="font-size:18px;font-weight:500">/ ' + active + ' done</span></div></div><div class="ring" style="--p:' + U.pct(done, active) + ';background:conic-gradient(#fff calc(var(--p)*1%), rgba(255,255,255,.25) 0)"><span style="background:transparent;color:#fff">' + U.pct(done, active) + '%</span></div></div></div>';
      h += '<div class="row mt"><button class="btn primary block" data-add>+ New habit</button></div>';
      h += '<div class="section-head"><h2>Your habits</h2><button class="link small" data-arch>' + (state.showArchived ? 'Hide archived' : 'Show archived') + '</button></div>';
      if (!habits.length) h += '<div class="card">' + UI.empty('🔥', 'No habits yet', 'Add habits like Exercise, Reading, Drink water') + '</div>';
      habits.forEach(hb => {
        const streak = Habits.streak(hb, today);
        const isDone = Habits.done(hb, today);
        let week = '<div class="habit-week">';
        for (let i = 0; i < 7; i++) { const d = U.addDays(ws, i); week += '<button data-tg="' + hb.id + '" data-d="' + d + '" class="' + (Habits.done(hb, d) ? 'on' : '') + (d > today ? ' future' : '') + '" ' + (d > today ? 'disabled' : '') + '>' + U.DAYS[U.dayOfWeek(d)][0] + '<br>' + +d.slice(8) + '</button>'; }
        week += '</div>';
        h += '<div class="card' + (hb.archived ? '" style="opacity:.6' : '') + '"><div class="row between"><div class="row grow" style="min-width:0"><div class="ico" style="width:40px;height:40px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center;font-size:20px;flex:none">' + hb.icon + '</div><div class="grow" style="min-width:0"><div class="bold ellipsis">' + U.esc(hb.name) + (hb.archived ? ' <span class="badge">archived</span>' : '') + '</div><div class="xs muted">🔥 ' + streak + ' day streak · best ' + Habits.bestStreak(hb) + ' · ' + Habits.pctInRange(hb, ms, today) + '% this month</div></div></div>' +
          '<button class="check ' + (isDone ? 'on' : '') + '" data-tg="' + hb.id + '" data-d="' + today + '" aria-label="Toggle today" style="width:44px;height:44px;border-radius:14px;border:2px solid ' + (isDone ? 'var(--good)' : 'var(--axis)') + ';background:' + (isDone ? 'var(--good)' : 'transparent') + ';color:#fff;font-size:20px;flex:none">' + (isDone ? '✓' : '') + '</button></div>' +
          '<div class="mt">' + week + '</div><div class="row between mt-s"><span class="xs faint">This week: ' + Habits.countInRange(hb, ws, today) + '/' + (U.diffDays(ws, today) + 1) + '</span><span class="row" style="gap:10px"><button class="link xs" data-hist="' + hb.id + '">History</button><button class="link xs" data-edit="' + hb.id + '">Edit</button></span></div></div>';
      });
      el.innerHTML = h;
      el.addEventListener('click', e => {
        if (e.target.closest('[data-add]')) { Forms.habit(); return; }
        if (e.target.closest('[data-arch]')) { state.showArchived = !state.showArchived; UI.refresh(); return; }
        const tg = e.target.closest('[data-tg]'); if (tg) { Habits.toggle(tg.dataset.tg, tg.dataset.d); return; }
        const ed = e.target.closest('[data-edit]'); if (ed) { Forms.habit({ id: ed.dataset.edit }); return; }
        const hi = e.target.closest('[data-hist]'); if (hi) history(hi.dataset.hist);
      });
      function history(id) {
        const hb = DB.get().habits.find(x => x.id === id);
        let months = '';
        for (let k = 0; k < 3; k++) {
          const mk = U.monthKey(U.addMonths(ms, -k));
          const [y, m] = mk.split('-').map(Number); const n = U.daysInMonth(y, m);
          let grid = '<div class="heat">';
          const off = (U.dayOfWeek(mk + '-01') + 6) % 7;
          for (let i = 0; i < off; i++) grid += '<i style="background:transparent"></i>';
          for (let d = 1; d <= n; d++) { const ds = mk + '-' + U.pad(d); grid += '<i class="' + (Habits.done(hb, ds) ? 'on' : '') + '" title="' + ds + '"></i>'; }
          grid += '</div>';
          months += '<div class="mb"><div class="row between small"><b>' + U.fmtMonth(mk) + '</b><span class="muted">' + Habits.countInRange(hb, mk + '-01', U.monthEnd(mk + '-01')) + ' days</span></div>' + grid + '</div>';
        }
        UI.sheet({ title: hb.icon + ' ' + hb.name, body: '<div class="grid3 mb"><div class="stat sm"><div class="label">Streak</div><div class="value">' + Habits.streak(hb, today) + '</div></div><div class="stat sm"><div class="label">Best</div><div class="value">' + Habits.bestStreak(hb) + '</div></div><div class="stat sm"><div class="label">Total</div><div class="value">' + Object.keys(hb.days || {}).length + '</div></div></div>' + months });
      }
    },
  });
})(window);
