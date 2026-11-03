/* MyLife OS — finance engine.
   One ledger (state.transactions) is the single source of truth. Balances are
   never stored; they are always recomputed from the ledger so edits/deletes stay
   consistent. Amounts are integer paise.

   Transaction types:
     opening    — opening balance for an account (one per account)
     adjustment — manual correction of an account balance (+/-), transparent in history
     income     — money received into accountId
     expense    — money spent from accountId (this IS the expense tracker record)
     transfer   — accountId -> toAccountId, never income/expense */
(function (root) {
  'use strict';
  const U = root.U || require('./util.js');
  const DB = root.DB || require('./db.js');

  const TYPES = ['opening', 'adjustment', 'income', 'expense', 'transfer'];
  const METHODS = ['Cash', 'UPI', 'Bank', 'Card', 'Other'];

  // ---- validation ----------------------------------------------------------
  function validateTx(t, s) {
    const errs = [];
    if (!TYPES.includes(t.type)) errs.push('Unknown transaction type.');
    if (!Number.isInteger(t.amount)) errs.push('Enter a valid amount.');
    else if (t.type !== 'adjustment' && t.amount <= 0) errs.push('Amount must be greater than zero.');
    else if (t.type === 'adjustment' && t.amount === 0) errs.push('Adjustment cannot be zero.');
    if (Math.abs(t.amount) > 1e13) errs.push('Amount is too large.');
    if (!U.isDateStr(t.date)) errs.push('Pick a valid date.');
    if (!s.accounts.some(a => a.id === t.accountId)) errs.push('Choose an account.');
    if (t.type === 'transfer') {
      if (!s.accounts.some(a => a.id === t.toAccountId)) errs.push('Choose a destination account.');
      if (t.toAccountId === t.accountId) errs.push('Cannot transfer to the same account.');
    }
    if ((t.type === 'expense' || t.type === 'income') && !(t.title && t.title.trim())) errs.push('Enter a title.');
    if (t.time && !/^\d{2}:\d{2}$/.test(t.time)) errs.push('Invalid time.');
    return errs;
  }

  function clean(input) {
    const t = {
      id: input.id || U.uid('tx'),
      type: input.type,
      amount: input.amount,
      title: (input.title || '').trim(),
      category: (input.category || '').trim(),
      date: input.date,
      time: input.time || '',
      accountId: input.accountId,
      toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
      method: input.method || '',
      note: (input.note || '').trim(),
      createdAt: input.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (!t.method) {
      const acc = DB.get().accounts.find(a => a.id === t.accountId);
      t.method = acc ? acc.type : 'Other';
    }
    if (t.type === 'transfer') t.category = 'Transfer';
    if (t.type === 'opening') { t.title = t.title || 'Opening balance'; t.category = 'Opening'; }
    if (t.type === 'adjustment') { t.title = t.title || 'Balance adjustment'; t.category = 'Adjustment'; }
    return t;
  }

  // ---- CRUD ------------------------------------------------------------------
  function add(input) {
    const t = clean(input);
    const errs = validateTx(t, DB.get());
    if (errs.length) throw new Error(errs.join(' '));
    DB.update(s => {
      s.transactions.push(t);
      DB.logActivity(describe(t));
    });
    return t;
  }

  function edit(id, input) {
    const s = DB.get();
    const idx = s.transactions.findIndex(t => t.id === id);
    if (idx < 0) throw new Error('Transaction not found.');
    const old = s.transactions[idx];
    const t = clean(Object.assign({}, old, input, { id: old.id, createdAt: old.createdAt, type: input.type || old.type }));
    const errs = validateTx(t, s);
    if (errs.length) throw new Error(errs.join(' '));
    DB.update(st => { st.transactions[idx] = t; DB.logActivity('Edited: ' + describe(t)); });
    return t;
  }

  function remove(id) {
    DB.update(s => {
      const t = s.transactions.find(x => x.id === id);
      s.transactions = s.transactions.filter(x => x.id !== id);
      if (t) DB.logActivity('Deleted: ' + describe(t));
    });
  }

  function get(id) { return DB.get().transactions.find(t => t.id === id) || null; }

  function describe(t) {
    const amt = U.fmtINR(Math.abs(t.amount));
    switch (t.type) {
      case 'expense': return 'Spent ' + amt + ' on ' + t.title;
      case 'income': return 'Received ' + amt + ' (' + (t.title || t.category) + ')';
      case 'transfer': return 'Transferred ' + amt + ' ' + accName(t.accountId) + ' → ' + accName(t.toAccountId);
      case 'opening': return 'Opening balance ' + amt + ' for ' + accName(t.accountId);
      case 'adjustment': return 'Adjusted ' + accName(t.accountId) + ' by ' + U.fmtINR(t.amount, { plus: true });
    }
    return '';
  }
  function accName(id) { const a = DB.get().accounts.find(x => x.id === id); return a ? a.name : 'Unknown'; }

  // ---- balances (always derived) -------------------------------------------
  // Effect of a transaction on account `accId`
  function effectOn(t, accId) {
    switch (t.type) {
      case 'opening': case 'adjustment': case 'income': return t.accountId === accId ? t.amount : 0;
      case 'expense': return t.accountId === accId ? -t.amount : 0;
      case 'transfer': return (t.accountId === accId ? -t.amount : 0) + (t.toAccountId === accId ? t.amount : 0);
    }
    return 0;
  }

  function accountBalance(accId, upToDate) {
    let b = 0;
    for (const t of DB.get().transactions) {
      if (upToDate && t.date > upToDate) continue;
      b += effectOn(t, accId);
    }
    return b;
  }

  function balances(upToDate) {
    const s = DB.get();
    const out = {};
    s.accounts.forEach(a => { out[a.id] = 0; });
    for (const t of s.transactions) {
      if (upToDate && t.date > upToDate) continue;
      if (t.type === 'transfer') {
        if (t.accountId in out) out[t.accountId] -= t.amount;
        if (t.toAccountId in out) out[t.toAccountId] += t.amount;
      } else if (t.type === 'expense') {
        if (t.accountId in out) out[t.accountId] -= t.amount;
      } else if (t.accountId in out) out[t.accountId] += t.amount;
    }
    return out;
  }

  function totalBalance(upToDate) { return U.sum(Object.values(balances(upToDate))); }

  // ---- queries -----------------------------------------------------------------
  function inRange(from, to, type) {
    return DB.get().transactions.filter(t => (!type || t.type === type) && t.date >= from && t.date <= to);
  }
  function expenses(from, to) { return inRange(from, to, 'expense'); }
  function incomes(from, to) { return inRange(from, to, 'income'); }
  function totalExpense(from, to) { return U.sum(expenses(from, to), t => t.amount); }
  function totalIncome(from, to) { return U.sum(incomes(from, to), t => t.amount); }
  function onDate(d, type) { return inRange(d, d, type); }

  function byCategory(from, to) {
    const m = {};
    for (const t of expenses(from, to)) m[t.category || 'Other'] = (m[t.category || 'Other'] || 0) + t.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }
  function byMethod(from, to) {
    const m = {};
    for (const t of expenses(from, to)) m[t.method || 'Other'] = (m[t.method || 'Other'] || 0) + t.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }
  function dailySeries(from, to, type) {
    const m = {};
    for (let d = from; d <= to; d = U.addDays(d, 1)) m[d] = 0;
    for (const t of inRange(from, to, type || 'expense')) m[t.date] += t.amount;
    return Object.entries(m);
  }
  function monthlySeries(months, type, endMonthKey) {
    const end = endMonthKey || U.monthKey(U.todayStr());
    const keys = [];
    let k = end + '-01';
    for (let i = 0; i < months; i++) { keys.unshift(U.monthKey(k)); k = U.addMonths(k, -1); }
    return keys.map(mk => [mk, U.sum(inRange(mk + '-01', U.monthEnd(mk + '-01'), type), t => t.amount)]);
  }

  // sorted newest first
  function sorted(list) {
    return (list || DB.get().transactions).slice().sort((a, b) =>
      b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt);
  }

  function search(q) {
    q = (q || '').toLowerCase().trim();
    if (!q) return sorted();
    return sorted(DB.get().transactions.filter(t =>
      (t.title + ' ' + t.category + ' ' + t.note + ' ' + t.method + ' ' + accName(t.accountId)).toLowerCase().includes(q)
      || String(t.amount / 100).includes(q)));
  }

  // ---- budgets ------------------------------------------------------------------
  function budgetStatus(monthKey) {
    const s = DB.get();
    const mk = monthKey || U.monthKey(U.todayStr());
    const from = mk + '-01', to = U.monthEnd(from);
    const spent = totalExpense(from, to);
    const cats = byCategory(from, to);
    const catMap = Object.fromEntries(cats);
    const overall = s.settings.monthlyBudget || 0;
    const catItems = Object.entries(s.settings.categoryBudgets || {})
      .filter(([, v]) => v > 0)
      .map(([c, limit]) => ({ category: c, limit, spent: catMap[c] || 0, pct: limit ? Math.round(((catMap[c] || 0) / limit) * 100) : 0 }));
    return {
      month: mk, overall, spent, remaining: overall - spent,
      pct: overall ? Math.round((spent / overall) * 100) : 0,
      categories: catItems,
      alerts: [
        ...(overall && spent > overall ? [{ level: 'over', text: 'Monthly budget exceeded by ' + U.fmtINR(spent - overall) }]
          : overall && spent >= overall * 0.8 ? [{ level: 'warn', text: 'You have used ' + Math.round((spent / overall) * 100) + '% of this month\'s budget' }] : []),
        ...catItems.filter(c => c.spent > c.limit).map(c => ({ level: 'over', text: c.category + ' budget exceeded by ' + U.fmtINR(c.spent - c.limit) })),
        ...catItems.filter(c => c.spent <= c.limit && c.spent >= c.limit * 0.8).map(c => ({ level: 'warn', text: c.category + ' at ' + c.pct + '% of its budget' })),
      ],
    };
  }

  // ---- accounts ------------------------------------------------------------------
  function addAccount(name, type, icon) {
    name = (name || '').trim();
    if (!name) throw new Error('Enter an account name.');
    const a = { id: U.uid('acc'), name, type: METHODS.includes(type) ? type : 'Other', icon: icon || '💼', createdAt: Date.now() };
    DB.update(s => s.accounts.push(a));
    return a;
  }
  function renameAccount(id, name, icon) {
    DB.update(s => { const a = s.accounts.find(x => x.id === id); if (a) { a.name = name.trim() || a.name; if (icon) a.icon = icon; } });
  }
  function removeAccount(id) {
    const s = DB.get();
    if (s.accounts.length <= 1) throw new Error('Keep at least one account.');
    if (s.transactions.some(t => t.accountId === id || t.toAccountId === id)) throw new Error('This account has transactions. Delete or move them first.');
    DB.update(st => { st.accounts = st.accounts.filter(a => a.id !== id); if (st.settings.defaultAccountId === id) st.settings.defaultAccountId = st.accounts[0].id; });
  }

  // Set what the balance of an account *should be* right now. If an opening
  // transaction does not exist yet, one is created; otherwise an adjustment is
  // recorded so history remains transparent.
  function setBalance(accId, targetPaise, note) {
    const s = DB.get();
    const hasOpening = s.transactions.some(t => t.type === 'opening' && t.accountId === accId);
    const current = accountBalance(accId);
    const delta = targetPaise - current;
    if (delta === 0) return null;
    return add({
      type: hasOpening ? 'adjustment' : 'opening',
      amount: delta, date: U.todayStr(), time: U.nowTime(), accountId: accId,
      title: hasOpening ? 'Balance adjustment' : 'Opening balance',
      note: note || (hasOpening ? 'Balance set to ' + U.fmtINR(targetPaise) + ' (was ' + U.fmtINR(current) + ')' : ''),
    });
  }

  // ---- CSV export ------------------------------------------------------------------
  function toCSV(list) {
    const rows = [['Date', 'Time', 'Type', 'Title', 'Category', 'Amount (INR)', 'Account', 'To Account', 'Payment Method', 'Note']];
    for (const t of sorted(list)) {
      rows.push([t.date, t.time || '', t.type, t.title, t.category, (t.amount / 100).toFixed(2), accName(t.accountId), t.toAccountId ? accName(t.toAccountId) : '', t.method || '', t.note || '']);
    }
    return rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  const F = {
    TYPES, METHODS, validateTx, add, edit, remove, get, describe, accName,
    accountBalance, balances, totalBalance, inRange, expenses, incomes, totalExpense, totalIncome, onDate,
    byCategory, byMethod, dailySeries, monthlySeries, sorted, search, budgetStatus,
    addAccount, renameAccount, removeAccount, setBalance, toCSV, effectOn,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
  else root.Finance = F;
})(typeof window !== 'undefined' ? window : globalThis);
