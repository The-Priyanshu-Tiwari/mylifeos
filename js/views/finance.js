/* Finance view: balances per account, income/expense/savings, budget, transaction history with filters */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance, Forms, Charts } = root;
  const state = { tab: 'overview', month: null, type: 'All', cat: 'All', acc: 'All', q: '' };

  function setBalanceSheet(accId) {
    const s = DB.get();
    const acc = s.accounts.find(a => a.id === accId) || s.accounts[0];
    const cur = Finance.accountBalance(acc.id);
    UI.sheet({
      title: 'Set balance · ' + acc.name, submit: 'Update balance',
      body: '<p class="muted small mb">Current balance: <b class="num">' + U.fmtINR(cur) + '</b>. Enter what this account actually holds right now. The difference is recorded as a visible adjustment so your history stays honest.</p>' +
        UI.field('Account', UI.select('accountId', s.accounts.map(a => [a.id, a.icon + ' ' + a.name]), acc.id)) +
        '<div class="field"><label>Actual balance (₹)</label><div class="amount-input">' + UI.input('amount', cur / 100, 'inputmode="decimal" autofocus') + '</div></div>' +
        UI.field('Reason (optional)', UI.input('note', '', 'placeholder="e.g. counted wallet cash"')),
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        const target = Forms.amountFromInput(f.amount);
        if (isNaN(target)) throw new Error('Enter a valid amount.');
        const r = Finance.setBalance(f.accountId, target, f.note);
        UI.toast(r ? 'Balance updated' : 'Balance unchanged');
      },
    });
  }
  root.setBalanceSheet = setBalanceSheet;

  function accountsSheet() {
    const s = DB.get();
    UI.sheet({
      title: 'Accounts & wallets',
      body: '<div class="list" data-acc-list>' + s.accounts.map(a => '<div class="item"><div class="ico">' + a.icon + '</div><div class="body"><div class="title">' + U.esc(a.name) + '</div><div class="sub">' + a.type + ' · ' + U.fmtINR(Finance.accountBalance(a.id)) + '</div></div><button type="button" class="btn sm" data-ren="' + a.id + '">Rename</button><button type="button" class="btn sm danger" data-del="' + a.id + '">✕</button></div>').join('') + '</div>' +
        '<div class="section-head"><h3>Add account</h3></div><div class="frow">' + UI.field('Name', UI.input('name', '', 'placeholder="e.g. Savings, Wallet"')) + UI.field('Type', UI.select('type', Finance.METHODS, 'Bank')) + '</div>' + UI.field('Icon', UI.input('icon', '💼', 'maxlength="3"')),
      submit: 'Add account',
      onOpen(form, close) {
        form.addEventListener('click', async e => {
          const r = e.target.closest('[data-ren]'); if (r) { const a = s.accounts.find(x => x.id === r.dataset.ren); const v = await UI.prompt({ title: 'Rename account', label: 'Name', value: a.name }); if (v && v.trim()) { Finance.renameAccount(a.id, v); close(); accountsSheet(); } return; }
          const d = e.target.closest('[data-del]'); if (d) { try { if (await UI.confirm({ message: 'Delete this account?' })) { Finance.removeAccount(d.dataset.del); close(); accountsSheet(); } } catch (ex) { UI.toast(ex.message, 'bad'); } }
        });
      },
      onSubmit(form) { const f = Object.fromEntries(new FormData(form)); Finance.addAccount(f.name, f.type, f.icon); UI.toast('Account added', 'good'); },
    });
  }

  function budgetSheet() {
    const s = DB.get();
    const cb = s.settings.categoryBudgets || {};
    UI.sheet({
      title: 'Budgets & limits', submit: 'Save budgets',
      body: '<div class="field"><label>Monthly overall budget (₹)</label><div class="amount-input">' + UI.input('overall', s.settings.monthlyBudget ? s.settings.monthlyBudget / 100 : '', 'inputmode="decimal" placeholder="0 = no limit"') + '</div></div>' +
        '<div class="card-title">Category limits per month</div>' + s.settings.expenseCategories.map(c => '<div class="field inline"><label>' + UI.catIcon(c) + ' ' + U.esc(c) + '</label><input name="cat:' + U.esc(c) + '" inputmode="decimal" placeholder="₹" value="' + (cb[c] ? cb[c] / 100 : '') + '" style="max-width:130px;min-height:40px"></div>').join('') +
        '<p class="hint faint xs">You will see a warning at 80% and an alert when a limit is exceeded.</p>',
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        const overall = f.overall.trim() ? Forms.amountFromInput(f.overall) : 0;
        if (isNaN(overall) || overall < 0) throw new Error('Invalid overall budget.');
        const cats = {};
        for (const [k, v] of Object.entries(f)) if (k.startsWith('cat:') && v.trim()) { const p = Forms.amountFromInput(v); if (isNaN(p) || p < 0) throw new Error('Invalid limit for ' + k.slice(4)); if (p > 0) cats[k.slice(4)] = p; }
        DB.update(st => { st.settings.monthlyBudget = overall; st.settings.categoryBudgets = cats; });
        UI.toast('Budgets saved', 'good');
      },
    });
  }
  root.budgetSheet = budgetSheet;

  UI.route('finance', {
    title: 'Finance',
    render(el) {
      const s = DB.get();
      const today = U.todayStr();
      if (!state.month) state.month = U.monthKey(today);
      const mk = state.month;
      const from = mk + '-01', to = U.monthEnd(from);
      const bals = Finance.balances();
      const total = Finance.totalBalance();
      const inc = Finance.totalIncome(from, to), exp = Finance.totalExpense(from, to);
      const allInc = Finance.totalIncome('0000-01-01', '9999-12-31'), allExp = Finance.totalExpense('0000-01-01', '9999-12-31');
      const budget = Finance.budgetStatus(mk);
      const hasOpening = s.transactions.some(t => t.type === 'opening');

      let h = '<div class="seg mb">' + [['overview', 'Overview'], ['history', 'History'], ['budget', 'Budget']].map(t => '<button data-tab="' + t[0] + '" class="' + (state.tab === t[0] ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div>';

      if (state.tab === 'overview') {
        if (!hasOpening) h += '<div class="alert info mb"><span>🏁</span><span class="grow">Start by telling the app how much money you have right now.</span><button class="link" data-setbal>Set balance</button></div>';
        h += '<div class="card accent"><div class="muted small">Total available balance</div><div class="hero-num num">' + U.fmtINR(total) + '</div><div class="row mt" style="gap:8px"><button class="btn sm" style="background:rgba(255,255,255,.18);color:#fff;border:0" data-setbal>Set balance</button><button class="btn sm" style="background:rgba(255,255,255,.18);color:#fff;border:0" data-accounts>Accounts</button></div></div>';
        h += '<div class="grid2 mt">' + s.accounts.map(a => '<button class="stat" style="text-align:left;cursor:pointer" data-setbal="' + a.id + '"><div class="label">' + a.icon + ' ' + U.esc(a.name) + '</div><div class="value num ' + (bals[a.id] < 0 ? 'bad' : '') + '" style="font-size:18px">' + U.fmtINR(bals[a.id]) + '</div></button>').join('') + '</div>';
        h += '<div class="grid3 mt"><button class="btn primary" data-add="expense">− Expense</button><button class="btn" data-add="income">+ Income</button><button class="btn" data-add="transfer">⇄ Transfer</button></div>';
        h += '<div class="row between" style="margin:18px 0 8px"><button class="icon-btn" data-mnav="-1">‹</button><h2 class="center">' + U.fmtMonthLong(mk) + '</h2><button class="icon-btn" data-mnav="1">›</button></div>';
        h += '<div class="grid3"><div class="stat sm"><div class="label">Income</div><div class="value good num">' + U.fmtINRCompact(inc) + '</div></div><div class="stat sm"><div class="label">Expenses</div><div class="value bad num">' + U.fmtINRCompact(exp) + '</div></div><div class="stat sm"><div class="label">Net savings</div><div class="value num ' + (inc - exp < 0 ? 'bad' : 'good') + '">' + U.fmtINRCompact(inc - exp) + '</div></div></div>';
        if (budget.overall) h += '<div class="card tight mt"><div class="row between small"><span class="muted">Monthly budget</span><span class="bold num">' + U.fmtINR(budget.remaining, { whole: true }) + ' left</span></div>' + UI.progress(budget.pct, budget.pct >= 100 ? 'bad' : budget.pct >= 80 ? 'warn' : 'good') + '<div class="xs faint mt-s">' + U.fmtINR(budget.spent, { whole: true }) + ' of ' + U.fmtINR(budget.overall, { whole: true }) + ' (' + budget.pct + '%)</div></div>';
        budget.alerts.forEach(a => { h += '<div class="alert ' + (a.level === 'over' ? 'bad' : 'warn') + ' mt">⚠ ' + U.esc(a.text) + '</div>'; });
        h += '<div class="card mt"><div class="card-title">Income vs expenses · last 6 months</div><div id="fin-chart"></div></div>';
        h += '<div class="card mt"><div class="row between"><div><div class="card-title" style="margin:0">All time</div><div class="small muted">Income ' + U.fmtINR(allInc, { whole: true }) + ' · Spent ' + U.fmtINR(allExp, { whole: true }) + '</div></div><div class="right"><div class="xs faint">Net savings</div><div class="bold num ' + (allInc - allExp < 0 ? 'bad' : 'good') + '">' + U.fmtINR(allInc - allExp, { whole: true }) + '</div></div></div></div>';
        h += '<div class="section-head"><h2>Recent transactions</h2><button class="link" data-tab="history">See all ›</button></div><div class="card list" id="fin-recent">' + (s.transactions.length ? Finance.sorted().slice(0, 8).map(root.txRow).join('') : UI.empty('💳', 'No transactions yet')) + '</div>';
      } else if (state.tab === 'history') {
        h += '<div class="search-box">⌕<input data-q placeholder="Search transactions…" value="' + U.esc(state.q) + '"></div>';
        h += '<div class="chips">' + [['All', 'All types'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers'], ['adjustment', 'Adjustments']].map(t => '<button class="chip ' + (state.type === t[0] ? 'active' : '') + '" data-f="type" data-v="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
        h += '<div class="chips">' + [['All', 'All accounts']].concat(s.accounts.map(a => [a.id, a.icon + ' ' + a.name])).map(a => '<button class="chip ' + (state.acc === a[0] ? 'active' : '') + '" data-f="acc" data-v="' + a[0] + '">' + U.esc(a[1]) + '</button>').join('') + '</div>';
        h += '<div class="chips">' + ['All'].concat(s.settings.expenseCategories, s.settings.incomeCategories).map(c => '<button class="chip ' + (state.cat === c ? 'active' : '') + '" data-f="cat" data-v="' + U.esc(c) + '">' + (c === 'All' ? 'All categories' : U.esc(c)) + '</button>').join('') + '</div>';
        h += '<div class="row between mt"><button class="icon-btn" data-mnav="-1">‹</button><div class="bold center">' + (state.month === 'all' ? 'All time' : U.fmtMonthLong(mk)) + '</div><button class="icon-btn" data-mnav="1">›</button></div><div class="center mb"><button class="link small" data-allmonths>' + (state.month === 'all' ? 'Pick a month' : 'Show all time') + '</button></div>';
        let list = state.month === 'all' ? s.transactions : Finance.inRange(from, to);
        if (state.type !== 'All') list = list.filter(t => t.type === state.type || (state.type === 'adjustment' && t.type === 'opening'));
        if (state.acc !== 'All') list = list.filter(t => t.accountId === state.acc || t.toAccountId === state.acc);
        if (state.cat !== 'All') list = list.filter(t => t.category === state.cat);
        if (state.q) { const q = state.q.toLowerCase(); list = list.filter(t => (t.title + ' ' + t.category + ' ' + t.note + ' ' + Finance.accName(t.accountId)).toLowerCase().includes(q) || String(t.amount / 100).includes(q)); }
        list = Finance.sorted(list);
        const ti = U.sum(list.filter(t => t.type === 'income'), t => t.amount), te = U.sum(list.filter(t => t.type === 'expense'), t => t.amount);
        h += '<div class="grid2"><div class="stat sm"><div class="label">Income (filtered)</div><div class="value good num">' + U.fmtINR(ti, { whole: true }) + '</div></div><div class="stat sm"><div class="label">Expenses (filtered)</div><div class="value bad num">' + U.fmtINR(te, { whole: true }) + '</div></div></div>';
        h += '<div class="row between mt"><span class="small faint">' + list.length + ' transactions</span><button class="btn sm" data-csv>⬇ CSV</button></div>';
        const groups = U.groupBy(list, t => t.date);
        const dates = Object.keys(groups).sort().reverse();
        h += '<div id="fin-list">' + (dates.length ? dates.map(dt => '<div class="section-head" style="margin-top:12px"><h3 class="small muted">' + U.relDay(dt, today) + '</h3></div><div class="card list">' + groups[dt].map(root.txRow).join('') + '</div>').join('') : '<div class="card mt">' + UI.empty('🔍', 'No transactions match') + '</div>') + '</div>';
        el._csvList = list;
      } else {
        h += '<div class="row between mb"><button class="icon-btn" data-mnav="-1">‹</button><h2 class="center">' + U.fmtMonthLong(mk) + '</h2><button class="icon-btn" data-mnav="1">›</button></div>';
        h += '<div class="card"><div class="row between"><div class="card-title" style="margin:0">Overall budget</div><button class="link small" data-budget>Edit</button></div>' + (budget.overall ? '<div class="hero-num num mt-s">' + U.fmtINR(budget.remaining, { whole: true }) + '<span class="small muted" style="font-size:14px;font-weight:500"> left of ' + U.fmtINR(budget.overall, { whole: true }) + '</span></div><div class="mt-s">' + UI.progress(budget.pct, budget.pct >= 100 ? 'bad' : budget.pct >= 80 ? 'warn' : 'good') + '</div><div class="xs faint mt-s">Spent ' + U.fmtINR(budget.spent, { whole: true }) + ' (' + budget.pct + '%)' + (mk === U.monthKey(today) ? ' · ' + U.fmtINR(Math.max(0, Math.round(budget.remaining / Math.max(1, U.diffDays(today, to) + 1))), { whole: true }) + '/day for the rest of the month' : '') + '</div>' : '<p class="muted small mt-s">No monthly budget set. <button class="link" data-budget>Set one</button></p>') + '</div>';
        const cats = Object.fromEntries(Finance.byCategory(from, to));
        h += '<div class="section-head"><h2>Category limits</h2><button class="link" data-budget>Edit</button></div><div class="card">' + (budget.categories.length ? budget.categories.map(c => '<div class="mb"><div class="row between small"><span>' + UI.catIcon(c.category) + ' ' + U.esc(c.category) + '</span><span class="num ' + (c.spent > c.limit ? 'bad bold' : '') + '">' + U.fmtINR(c.spent, { whole: true }) + ' / ' + U.fmtINR(c.limit, { whole: true }) + '</span></div>' + UI.progress(c.pct, c.pct >= 100 ? 'bad' : c.pct >= 80 ? 'warn' : 'good') + '</div>').join('') : UI.empty('🎯', 'No category limits', 'Set limits for Food, Shopping, etc.')) + '</div>';
        const uncapped = Object.entries(cats).filter(([c]) => !budget.categories.some(x => x.category === c));
        if (uncapped.length) h += '<div class="section-head"><h2>Other spending</h2></div><div class="card">' + uncapped.map(([c, v]) => '<div class="row between small" style="padding:6px 0"><span>' + UI.catIcon(c) + ' ' + U.esc(c) + '</span><span class="num bold">' + U.fmtINR(v, { whole: true }) + '</span></div>').join('') + '</div>';
      }
      el.innerHTML = h;

      if (el.querySelector('#fin-chart')) {
        const mi = Finance.monthlySeries(6, 'income', mk), me = Finance.monthlySeries(6, 'expense', mk);
        Charts.bar(el.querySelector('#fin-chart'), { labels: mi.map(x => x[0]), series: [{ name: 'Income', values: mi.map(x => x[1]), color: getComputedStyle(document.documentElement).getPropertyValue('--s3').trim() }, { name: 'Expenses', values: me.map(x => x[1]), color: getComputedStyle(document.documentElement).getPropertyValue('--s2').trim() }] }, { height: 170, labelFormat: x => U.fmtMonth(x).slice(0, 3), tipLabel: x => U.fmtMonth(x) });
      }
      el.addEventListener('click', e => {
        const t = e.target.closest('[data-tab]'); if (t) { state.tab = t.dataset.tab; UI.refresh(); return; }
        const sb = e.target.closest('[data-setbal]'); if (sb) { setBalanceSheet(sb.dataset.setbal || s.settings.defaultAccountId); return; }
        if (e.target.closest('[data-accounts]')) { accountsSheet(); return; }
        if (e.target.closest('[data-budget]')) { budgetSheet(); return; }
        const a = e.target.closest('[data-add]'); if (a) { Forms.transaction({ type: a.dataset.add }); return; }
        const mn = e.target.closest('[data-mnav]'); if (mn) { state.month = U.monthKey(U.addMonths((state.month === 'all' ? U.monthKey(today) : state.month) + '-01', +mn.dataset.mnav)); UI.refresh(); return; }
        if (e.target.closest('[data-allmonths]')) { state.month = state.month === 'all' ? U.monthKey(today) : 'all'; UI.refresh(); return; }
        const f = e.target.closest('[data-f]'); if (f) { state[f.dataset.f] = f.dataset.v; UI.refresh(); return; }
        if (e.target.closest('[data-csv]')) { UI.download('mylifeos-transactions-' + (state.month === 'all' ? 'all' : mk) + '.csv', Finance.toCSV(el._csvList), 'text/csv'); UI.toast('CSV downloaded'); }
      });
      const q = el.querySelector('[data-q]'); if (q) q.addEventListener('input', U.debounce(() => { state.q = q.value; const p = q.selectionStart; UI.refresh(); const nq = el.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(p, p); }, 250));
      ['fin-recent', 'fin-list'].forEach(id => { const x = el.querySelector('#' + id); if (x) root.bindTxList(x); });
    },
  });
})(window);
