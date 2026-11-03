/* Reports & analytics with custom date range */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance, Tasks, Charts } = root;
  const state = { preset: '30', from: null, to: null };

  UI.route('reports', {
    title: 'Reports', tab: 'more', noFab: true,
    render(el) {
      const today = U.todayStr();
      let from, to;
      if (state.preset === 'custom' && state.from && state.to) { from = state.from; to = state.to; }
      else if (state.preset === 'month') { from = U.monthStart(today); to = U.monthEnd(today); }
      else if (state.preset === 'lastmonth') { const m = U.addMonths(U.monthStart(today), -1); from = m; to = U.monthEnd(m); }
      else if (state.preset === 'year') { from = today.slice(0, 4) + '-01-01'; to = today.slice(0, 4) + '-12-31'; }
      else { from = U.addDays(today, -(+state.preset - 1)); to = today; }
      if (from > to) { const t = from; from = to; to = t; }
      const days = U.diffDays(from, to) + 1;
      const exp = Finance.totalExpense(from, to), inc = Finance.totalIncome(from, to);
      const tasks = Tasks.inRange(from, to), done = tasks.filter(t => t.status === 'Completed').length;
      const cats = Finance.byCategory(from, to);
      const methods = Finance.byMethod(from, to);
      const cs = getComputedStyle(document.documentElement);
      const col = n => cs.getPropertyValue('--s' + n).trim();

      let h = '<div class="chips">' + [['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['90', '90 days'], ['year', 'This year'], ['custom', 'Custom']].map(p => '<button class="chip ' + (state.preset === p[0] ? 'active' : '') + '" data-p="' + p[0] + '">' + p[1] + '</button>').join('') + '</div>';
      if (state.preset === 'custom') h += '<div class="frow mb"><div class="field"><label>From</label><input type="date" data-from value="' + (state.from || from) + '"></div><div class="field"><label>To</label><input type="date" data-to value="' + (state.to || to) + '"></div></div>';
      h += '<div class="muted small mb">' + U.fmtDate(from) + ' – ' + U.fmtDate(to) + ' · ' + days + ' days</div>';
      h += '<div class="grid2"><div class="stat"><div class="label">Spent</div><div class="value bad num">' + U.fmtINRCompact(exp) + '</div><div class="xs faint">' + U.fmtINR(Math.round(exp / days), { whole: true }) + '/day</div></div><div class="stat"><div class="label">Income</div><div class="value good num">' + U.fmtINRCompact(inc) + '</div></div><div class="stat"><div class="label">Net savings</div><div class="value num ' + (inc - exp < 0 ? 'bad' : 'good') + '">' + U.fmtINRCompact(inc - exp) + '</div><div class="xs faint">' + (inc ? Math.round((inc - exp) / inc * 100) + '% of income' : '') + '</div></div><div class="stat"><div class="label">Tasks done</div><div class="value">' + done + ' <span class="small muted">/ ' + tasks.length + '</span></div><div class="xs faint">' + U.pct(done, tasks.length) + '% completion</div></div></div>';

      h += '<div class="card mt"><div class="card-title">Daily expense trend</div><div id="r-daily"></div></div>';
      h += '<div class="card mt"><div class="card-title">Category-wise distribution</div>' + (cats.length ? '<div id="r-cat"></div><table class="table mt"><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr>' + cats.map(c => '<tr><td>' + UI.catIcon(c[0]) + ' ' + U.esc(c[0]) + '</td><td class="num">' + U.fmtINR(c[1], { whole: true }) + '</td><td class="num">' + Math.round(c[1] / exp * 100) + '%</td></tr>').join('') + '</table>' : UI.empty('🧾', 'No expenses in this range')) + '</div>';
      if (methods.length) h += '<div class="card mt"><div class="card-title">Payment methods</div><div id="r-method"></div></div>';
      h += '<div class="card mt"><div class="card-title">Income vs expenditure · monthly</div><div id="r-inc"></div></div>';
      h += '<div class="card mt"><div class="card-title">Savings trend · monthly</div><div id="r-sav"></div></div>';
      h += '<div class="card mt"><div class="card-title">Monthly budget utilisation</div><div id="r-budget"></div></div>';
      h += '<div class="card mt"><div class="card-title">Daily task completion</div><div id="r-tasks"></div></div>';
      h += '<div class="card mt"><div class="card-title">Weekly productivity</div><div id="r-week"></div></div>';
      h += '<div class="card mt"><div class="card-title">Monthly productivity</div><div id="r-month"></div></div>';
      h += '<div class="row mt"><button class="btn block" data-dl>⬇ Download report (CSV)</button></div>';
      el.innerHTML = h;

      const daily = Finance.dailySeries(from, to);
      Charts.line(el.querySelector('#r-daily'), { labels: daily.map(x => x[0]), series: [{ name: 'Spent', values: daily.map(x => x[1]), color: col(2) }] }, { height: 160, labelFormat: x => U.fmtDateShort(x), tipLabel: x => U.fmtDate(x) });
      if (cats.length) Charts.donut(el.querySelector('#r-cat'), cats.slice(0, 7).concat(cats.length > 7 ? [['Other', U.sum(cats.slice(7), c => c[1])]] : []), { size: 170 });
      if (methods.length) Charts.bar(el.querySelector('#r-method'), { labels: methods.map(m => m[0]), series: [{ name: 'Spent', values: methods.map(m => m[1]), color: col(7) }] }, { height: 140 });
      const months = Math.min(12, Math.max(3, Math.ceil(days / 30) + 2));
      const endMk = U.monthKey(to);
      const mi = Finance.monthlySeries(months, 'income', endMk), me = Finance.monthlySeries(months, 'expense', endMk);
      Charts.bar(el.querySelector('#r-inc'), { labels: mi.map(x => x[0]), series: [{ name: 'Income', values: mi.map(x => x[1]), color: col(3) }, { name: 'Expenses', values: me.map(x => x[1]), color: col(2) }] }, { height: 170, labelFormat: x => U.fmtMonth(x).slice(0, 3), tipLabel: x => U.fmtMonth(x) });
      const sav = mi.map((x, i) => Math.max(0, x[1] - me[i][1]));
      const neg = mi.some((x, i) => x[1] - me[i][1] < 0);
      Charts.bar(el.querySelector('#r-sav'), { labels: mi.map(x => x[0]), series: [{ name: 'Savings', values: sav, color: col(6) }] }, { height: 150, labelFormat: x => U.fmtMonth(x).slice(0, 3), tipLabel: x => U.fmtMonth(x) });
      if (neg) el.querySelector('#r-sav').insertAdjacentHTML('beforeend', '<div class="xs faint mt-s">Months where expenses exceeded income show as 0.</div>');
      const bud = DB.get().settings.monthlyBudget;
      if (bud) Charts.bar(el.querySelector('#r-budget'), { labels: me.map(x => x[0]), series: [{ name: '% of budget used', values: me.map(x => Math.round(x[1] / bud * 100)), color: col(4) }] }, { height: 150, format: v => v + '%', tipFormat: v => v + '%', labelFormat: x => U.fmtMonth(x).slice(0, 3), tipLabel: x => U.fmtMonth(x), padL: 40 });
      else el.querySelector('#r-budget').innerHTML = '<p class="small muted">Set a monthly budget in Finance → Budget to see utilisation.</p>';
      const dc = Tasks.dailyCompletion(from, to);
      const dcLabels = dc.map(x => x[0]);
      Charts.bar(el.querySelector('#r-tasks'), { labels: dcLabels, series: [{ name: 'Completed', values: dc.map(x => x[1]), color: col(6) }, { name: 'Total', values: dc.map(x => x[2]), color: col(1) }] }, { height: 150, format: v => String(v), tipFormat: v => String(v), labelFormat: x => U.fmtDateShort(x), tipLabel: x => U.fmtDate(x), padL: 30 });
      // weekly: last 8 weeks ending at `to`
      const wl = [], wd = [], wt = [];
      for (let i = 7; i >= 0; i--) { const ws = U.addDays(U.weekStart(to), -7 * i); const we = U.addDays(ws, 6); const l = Tasks.inRange(ws, we); wl.push(U.fmtDateShort(ws)); wd.push(l.filter(t => t.status === 'Completed').length); wt.push(l.length); }
      Charts.bar(el.querySelector('#r-week'), { labels: wl, series: [{ name: 'Completed', values: wd, color: col(6) }, { name: 'Planned', values: wt, color: col(1) }] }, { height: 150, format: v => String(v), tipFormat: v => String(v), padL: 30 });
      const ml = [], md = [], mtt = [];
      for (let i = 5; i >= 0; i--) { const m = U.addMonths(U.monthStart(to), -i); const l = Tasks.inRange(m, U.monthEnd(m)); ml.push(U.fmtMonth(U.monthKey(m)).slice(0, 3)); md.push(l.filter(t => t.status === 'Completed').length); mtt.push(l.length); }
      Charts.bar(el.querySelector('#r-month'), { labels: ml, series: [{ name: 'Completed', values: md, color: col(6) }, { name: 'Planned', values: mtt, color: col(1) }] }, { height: 150, format: v => String(v), tipFormat: v => String(v), padL: 30 });

      el.addEventListener('click', e => {
        const p = e.target.closest('[data-p]'); if (p) { state.preset = p.dataset.p; if (state.preset === 'custom') { state.from = state.from || from; state.to = state.to || to; } UI.refresh(); return; }
        if (e.target.closest('[data-dl]')) {
          const rows = [['MyLife OS report', U.fmtDate(from) + ' to ' + U.fmtDate(to)], [], ['Summary'], ['Total income', (inc / 100).toFixed(2)], ['Total expenses', (exp / 100).toFixed(2)], ['Net savings', ((inc - exp) / 100).toFixed(2)], ['Tasks completed', done + ' of ' + tasks.length], [], ['Category', 'Amount'], ...cats.map(c => [c[0], (c[1] / 100).toFixed(2)]), [], ['Payment method', 'Amount'], ...methods.map(m => [m[0], (m[1] / 100).toFixed(2)]), [], ['Daily expenses'], ...daily.map(d => [d[0], (d[1] / 100).toFixed(2)]), []];
          const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n\r\n' + Finance.toCSV(Finance.inRange(from, to));
          UI.download('mylifeos-report-' + from + '-to-' + to + '.csv', csv, 'text/csv'); UI.toast('Report downloaded');
        }
      });
      const f = el.querySelector('[data-from]'), t = el.querySelector('[data-to]');
      if (f) { f.addEventListener('change', () => { if (U.isDateStr(f.value)) { state.from = f.value; UI.refresh(); } }); t.addEventListener('change', () => { if (U.isDateStr(t.value)) { state.to = t.value; UI.refresh(); } }); }
    },
  });
})(window);
