/* Expenses view: day / week / month totals, category & method breakdowns, history, search */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance, Forms, Charts } = root;
  const state = { range: 'day', date: null, q: '', cat: 'All' };

  UI.route('expenses', {
    title: 'Expenses',
    render(el, params) {
      const today = U.todayStr();
      if (!state.date) state.date = today;
      const s = DB.get();
      if (params && params.add === '1') { history.replaceState(null, '', '#/expenses'); setTimeout(() => Forms.transaction({ type: 'expense' }), 50); }
      const d = state.date;
      let from, to, label;
      if (state.range === 'day') { from = to = d; label = U.relDay(d, today); }
      else if (state.range === 'week') { from = U.weekStart(d); to = U.weekEnd(d); label = U.fmtDateShort(from) + ' – ' + U.fmtDate(to); }
      else if (state.range === 'month') { from = U.monthStart(d); to = U.monthEnd(d); label = U.fmtMonthLong(U.monthKey(d)); }
      else { from = '0000-01-01'; to = '9999-12-31'; label = 'All time'; }

      let list = Finance.expenses(from, to);
      if (state.cat !== 'All') list = list.filter(t => t.category === state.cat);
      if (state.q) { const q = state.q.toLowerCase(); list = list.filter(t => (t.title + ' ' + t.category + ' ' + t.note + ' ' + t.method).toLowerCase().includes(q) || String(t.amount / 100).includes(q)); }
      list = Finance.sorted(list);
      const total = U.sum(list, t => t.amount);
      const cats = Finance.byCategory(from, to);
      const methods = Finance.byMethod(from, to);
      const step = state.range === 'day' ? 1 : state.range === 'week' ? 7 : 0;

      let h = '<div class="seg mb">' + [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(r => '<button data-range="' + r[0] + '" class="' + (state.range === r[0] ? 'active' : '') + '">' + r[1] + '</button>').join('') + '</div>';
      if (state.range !== 'all') {
        h += '<div class="row between mb"><button class="icon-btn" data-nav="-1">‹</button><div class="center grow"><div class="bold">' + label + '</div></div><button class="icon-btn" data-nav="1">›</button></div>';
        if (state.range === 'day') h += '<div class="row mb"><input type="date" value="' + d + '" data-pick style="min-height:36px;border-radius:9px;border:1px solid var(--border);background:var(--surface);padding:0 10px;font-size:13px"><button class="btn sm" data-today ' + (d === today ? 'hidden' : '') + '>Today</button></div>';
      }
      h += '<div class="card accent"><div class="muted small">Total spent · ' + label + '</div><div class="hero-num num">' + U.fmtINR(total) + '</div><div class="muted small mt-s">' + list.length + ' expense' + (list.length === 1 ? '' : 's') + (state.range === 'month' && U.monthKey(d) === U.monthKey(today) ? ' · avg ' + U.fmtINR(Math.round(total / Math.max(1, +today.slice(8))), { whole: true }) + '/day' : '') + '</div></div>';
      h += '<div class="row mt"><button class="btn primary block" data-add>+ Add expense</button></div>';

      if (state.range === 'week' || state.range === 'month') {
        h += '<div class="card mt"><div class="card-title">Daily trend</div><div id="exp-trend"></div></div>';
      }
      if (cats.length) {
        h += '<div class="card mt"><div class="card-title">By category</div><div class="row" style="align-items:flex-start"><div id="exp-donut" style="width:150px;flex:none"></div><div class="grow stack" style="gap:6px">' +
          cats.slice(0, 6).map((c, i) => '<div><div class="row between small"><span class="ellipsis"><i class="badge" style="background:' + Charts.series(i) + ';width:10px;height:10px;padding:0;border-radius:3px;display:inline-block;vertical-align:-1px;margin-right:6px"></i>' + U.esc(c[0]) + '</span><span class="bold num">' + U.fmtINR(c[1], { whole: true }) + '</span></div>' + UI.progress(c[1] / cats[0][1] * 100) + '</div>').join('') + '</div></div></div>';
        h += '<div class="card mt"><div class="card-title">By payment method</div><div class="row wrap">' + methods.map(m => '<span class="badge">' + U.esc(m[0]) + ' · ' + U.fmtINR(m[1], { whole: true }) + '</span>').join('') + '</div></div>';
      }
      h += '<div class="section-head"><h2>History</h2><span class="faint small">' + list.length + '</span></div>';
      h += '<div class="search-box">⌕<input data-q placeholder="Search expenses…" value="' + U.esc(state.q) + '"></div>';
      h += '<div class="chips">' + ['All'].concat(s.settings.expenseCategories).map(c => '<button class="chip ' + (state.cat === c ? 'active' : '') + '" data-cat="' + U.esc(c) + '">' + U.esc(c) + '</button>').join('') + '</div>';
      // group by date
      const groups = U.groupBy(list, t => t.date);
      const dates = Object.keys(groups).sort().reverse();
      h += '<div id="exp-list">' + (dates.length ? dates.map(dt => '<div class="section-head" style="margin-top:12px"><h3 class="small muted">' + U.relDay(dt, today) + '</h3><span class="small bold num">' + U.fmtINR(U.sum(groups[dt], t => t.amount)) + '</span></div><div class="card list">' + groups[dt].map(root.txRow).join('') + '</div>').join('') : '<div class="card">' + UI.empty('🧾', 'No expenses here', 'Tap + Add expense to record spending') + '</div>') + '</div>';
      el.innerHTML = h;

      if (el.querySelector('#exp-trend')) {
        const ser = Finance.dailySeries(from, to);
        Charts.bar(el.querySelector('#exp-trend'), { labels: ser.map(x => x[0]), series: [{ name: 'Spent', values: ser.map(x => x[1]) }] }, { height: 150, labelFormat: x => +x.slice(8), tipLabel: x => U.fmtDate(x) });
      }
      if (el.querySelector('#exp-donut')) Charts.donut(el.querySelector('#exp-donut'), cats.slice(0, 7).concat(cats.length > 7 ? [['Other', U.sum(cats.slice(7), c => c[1])]] : []), { size: 150, centerText: U.fmtINRCompact(U.sum(cats, c => c[1])), centerSub: 'total' });
      el.querySelector('#exp-donut') && (el.querySelector('#exp-donut').querySelector('.legend').remove());

      el.addEventListener('click', e => {
        const r = e.target.closest('[data-range]'); if (r) { state.range = r.dataset.range; UI.refresh(); return; }
        const n = e.target.closest('[data-nav]'); if (n) { state.date = step ? U.addDays(state.date, step * +n.dataset.nav) : U.addMonths(state.date, +n.dataset.nav); UI.refresh(); return; }
        if (e.target.closest('[data-today]')) { state.date = today; UI.refresh(); return; }
        if (e.target.closest('[data-add]')) { Forms.transaction({ type: 'expense', date: state.range === 'day' ? state.date : today }); return; }
        const c = e.target.closest('[data-cat]'); if (c) { state.cat = c.dataset.cat; UI.refresh(); }
      });
      const pick = el.querySelector('[data-pick]'); if (pick) pick.addEventListener('change', () => { if (U.isDateStr(pick.value)) { state.date = pick.value; UI.refresh(); } });
      const q = el.querySelector('[data-q]'); q.addEventListener('input', U.debounce(() => { state.q = q.value; const p = q.selectionStart; UI.refresh(); const nq = el.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(p, p); }, 250));
      root.bindTxList(el.querySelector('#exp-list'));
    },
  });
})(window);
