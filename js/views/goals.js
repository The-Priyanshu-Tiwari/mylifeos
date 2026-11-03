/* Goals view */
(function (root) {
  'use strict';
  const { U, UI, DB, Goals, Forms } = root;
  const state = { filter: 'Active' };

  UI.route('goals', {
    title: 'Goals', tab: 'more',
    render(el) {
      const today = U.todayStr();
      let goals = DB.get().goals.slice();
      if (state.filter === 'Active') goals = goals.filter(g => g.status !== 'Completed');
      else if (state.filter === 'Completed') goals = goals.filter(g => g.status === 'Completed');
      goals.sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));
      const all = DB.get().goals;
      let h = '<div class="grid3"><div class="stat sm"><div class="label">Total</div><div class="value">' + all.length + '</div></div><div class="stat sm"><div class="label">In progress</div><div class="value">' + all.filter(g => g.status === 'In Progress').length + '</div></div><div class="stat sm"><div class="label">Completed</div><div class="value good">' + all.filter(g => g.status === 'Completed').length + '</div></div></div>';
      h += '<div class="row mt"><button class="btn primary block" data-add>+ New goal</button></div>';
      h += '<div class="chips mt">' + ['Active', 'All', 'Completed'].map(f => '<button class="chip ' + (state.filter === f ? 'active' : '') + '" data-f="' + f + '">' + f + '</button>').join('') + '</div>';
      if (!goals.length) h += '<div class="card">' + UI.empty('🎯', 'No goals here', 'e.g. Save ₹50,000 · Finish a course · Run 5 km') + '</div>';
      goals.forEach(g => {
        const p = Goals.pct(g);
        const saved = Goals.saved(g);
        const days = g.targetDate ? U.diffDays(today, g.targetDate) : null;
        h += '<div class="card"><div class="row between" style="align-items:flex-start"><div class="grow" style="min-width:0"><div class="bold">' + U.esc(g.title) + '</div>' + (g.desc ? '<div class="small muted mt-s">' + U.esc(g.desc) + '</div>' : '') + '</div><span class="badge ' + (g.status === 'Completed' ? 'good' : g.status === 'In Progress' ? 'accent' : '') + '">' + g.status + '</span></div>' +
          '<div class="row between small mt"><span class="muted">' + (g.targetAmount ? '<b class="num">' + U.fmtINR(saved, { whole: true }) + '</b> of ' + U.fmtINR(g.targetAmount, { whole: true }) : 'Progress') + '</span><span class="bold">' + p + '%</span></div>' + UI.progress(p, p >= 100 ? 'good' : '') +
          '<div class="row between mt-s" style="flex-wrap:wrap;gap:6px 12px"><span class="xs faint">' + (g.targetDate ? (days < 0 ? '<span class="bad">Overdue by ' + (-days) + ' days</span>' : days === 0 ? 'Due today' : 'Due ' + U.fmtDate(g.targetDate) + ' · ' + days + ' days left') : 'No deadline') + '</span><span class="row" style="gap:14px;white-space:nowrap;margin-left:auto">' + (g.targetAmount && g.status !== 'Completed' ? '<button class="link xs" data-save="' + g.id + '">+ Add savings</button>' : '') + (g.contributions && g.contributions.length ? '<button class="link xs" data-contrib="' + g.id + '">Savings log</button>' : '') + '<button class="link xs" data-edit="' + g.id + '">Edit</button></span></div></div>';
      });
      el.innerHTML = h;
      el.addEventListener('click', async e => {
        if (e.target.closest('[data-add]')) { Forms.goal(); return; }
        const f = e.target.closest('[data-f]'); if (f) { state.filter = f.dataset.f; UI.refresh(); return; }
        const ed = e.target.closest('[data-edit]'); if (ed) { Forms.goal({ id: ed.dataset.edit }); return; }
        const sv = e.target.closest('[data-save]'); if (sv) { Forms.contribute(sv.dataset.save); return; }
        const c = e.target.closest('[data-contrib]'); if (c) {
          const g = DB.get().goals.find(x => x.id === c.dataset.contrib);
          UI.sheet({ title: 'Savings log · ' + g.title, body: '<div class="list">' + g.contributions.slice().reverse().map(x => '<div class="item"><div class="body"><div class="title num">' + U.fmtINR(x.amount, { plus: true }) + '</div><div class="sub">' + U.fmtDate(x.date) + (x.note ? ' · ' + U.esc(x.note) : '') + '</div></div><button type="button" class="btn sm danger" data-rm="' + x.id + '">✕</button></div>').join('') + '</div>',
            onOpen(form, close) { form.addEventListener('click', async ev => { const r = ev.target.closest('[data-rm]'); if (r && await UI.confirm({ message: 'Remove this entry?' })) { Goals.removeContribution(g.id, r.dataset.rm); close(); } }); } });
        }
      });
    },
  });
})(window);
