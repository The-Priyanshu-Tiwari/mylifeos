// Run: node tests/engine.test.js
const assert = require('assert');
const U = require('../js/util.js');
const DB = require('../js/db.js');
const F = require('../js/finance.js');
const T = require('../js/tasks.js');
const M = require('../js/models.js');

DB._useMemory();
DB.load();
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; } }
const rs = v => U.toPaise(v);
const today = U.todayStr();

console.log('util');
test('todayStr is IST', () => { assert.match(today, /^\d{4}-\d{2}-\d{2}$/); assert.strictEqual(U.todayStr(new Date('2026-01-01T19:00:00Z')), '2026-01-02'); });
test('date arithmetic', () => {
  assert.strictEqual(U.addDays('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(U.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(U.monthEnd('2024-02-10'), '2024-02-29');
  assert.strictEqual(U.weekStart('2026-11-03'), '2026-11-02');
  assert.strictEqual(U.fmtDate('2026-11-03'), '3 Nov 2026');
});
test('INR formatting', () => {
  assert.strictEqual(U.fmtINR(rs('1234567.5')), '₹12,34,567.50');
  assert.strictEqual(U.fmtINR(rs('25000')), '₹25,000');
  assert.strictEqual(U.fmtINR(-15000), '-₹150');
  assert.strictEqual(U.toPaise('₹1,000.10'), 100010);
  assert.ok(isNaN(U.toPaise('abc')));
});

console.log('finance');
test('example from spec: 25000 - (150+200+1000+700) = 22950', () => {
  F.setBalance('acc_cash', rs(25000));
  F.add({ type: 'expense', amount: rs(150), title: 'Food', category: 'Food', date: today, accountId: 'acc_cash' });
  F.add({ type: 'expense', amount: rs(200), title: 'Petrol', category: 'Transportation', date: today, accountId: 'acc_cash' });
  F.add({ type: 'expense', amount: rs(1000), title: 'Shopping', category: 'Shopping', date: today, accountId: 'acc_cash' });
  F.add({ type: 'expense', amount: rs(700), title: 'Internet Bill', category: 'Bills', date: today, accountId: 'acc_cash' });
  assert.strictEqual(F.accountBalance('acc_cash'), rs(22950));
  assert.strictEqual(F.totalBalance(), rs(22950));
  assert.strictEqual(F.totalExpense(today, today), rs(2050));
});
test('income increases balance', () => {
  F.add({ type: 'income', amount: rs(5000), title: 'Salary', category: 'Salary', date: today, accountId: 'acc_bank' });
  assert.strictEqual(F.accountBalance('acc_bank'), rs(5000));
  assert.strictEqual(F.totalBalance(), rs(27950));
});
test('transfer moves money without counting as income/expense', () => {
  const before = { e: F.totalExpense('2000-01-01', '2100-01-01'), i: F.totalIncome('2000-01-01', '2100-01-01') };
  F.add({ type: 'transfer', amount: rs(2000), date: today, accountId: 'acc_bank', toAccountId: 'acc_upi' });
  assert.strictEqual(F.accountBalance('acc_bank'), rs(3000));
  assert.strictEqual(F.accountBalance('acc_upi'), rs(2000));
  assert.strictEqual(F.totalBalance(), rs(27950));
  assert.strictEqual(F.totalExpense('2000-01-01', '2100-01-01'), before.e);
  assert.strictEqual(F.totalIncome('2000-01-01', '2100-01-01'), before.i);
});
test('edit and delete recalc', () => {
  const tx = F.add({ type: 'expense', amount: rs(100), title: 'Tea', category: 'Food', date: today, accountId: 'acc_upi' });
  assert.strictEqual(F.accountBalance('acc_upi'), rs(1900));
  F.edit(tx.id, { amount: rs(250) });
  assert.strictEqual(F.accountBalance('acc_upi'), rs(1750));
  F.edit(tx.id, { accountId: 'acc_cash' });
  assert.strictEqual(F.accountBalance('acc_upi'), rs(2000));
  assert.strictEqual(F.accountBalance('acc_cash'), rs(22700));
  F.remove(tx.id);
  assert.strictEqual(F.accountBalance('acc_cash'), rs(22950));
  assert.strictEqual(F.totalBalance(), rs(27950));
});
test('transparent balance adjustment', () => {
  const adj = F.setBalance('acc_cash', rs(20000));
  assert.strictEqual(adj.type, 'adjustment');
  assert.strictEqual(adj.amount, rs(-2950));
  assert.strictEqual(F.accountBalance('acc_cash'), rs(20000));
  assert.strictEqual(F.setBalance('acc_cash', rs(20000)), null);
});
test('validation rejects bad input', () => {
  assert.throws(() => F.add({ type: 'expense', amount: -5, title: 'x', date: today, accountId: 'acc_cash' }), /greater than zero/);
  assert.throws(() => F.add({ type: 'expense', amount: 500, title: '', date: today, accountId: 'acc_cash' }), /title/);
  assert.throws(() => F.add({ type: 'expense', amount: 500, title: 'x', date: '2026-13-01', accountId: 'acc_cash' }), /date/);
  assert.throws(() => F.add({ type: 'transfer', amount: 500, date: today, accountId: 'acc_cash', toAccountId: 'acc_cash' }), /same account/);
  assert.throws(() => F.add({ type: 'expense', amount: 1.5, title: 'x', date: today, accountId: 'acc_cash' }), /valid amount/);
});
test('category/method breakdowns and budgets', () => {
  const cats = Object.fromEntries(F.byCategory(today, today));
  assert.strictEqual(cats.Shopping, rs(1000));
  assert.strictEqual(cats.Food, rs(150));
  DB.update(s => { s.settings.monthlyBudget = rs(2500); s.settings.categoryBudgets = { Shopping: rs(800) }; });
  const b = F.budgetStatus();
  assert.strictEqual(b.spent, rs(2050));
  assert.strictEqual(b.remaining, rs(450));
  assert.ok(b.alerts.some(a => a.text.includes('Shopping budget exceeded')));
  assert.ok(b.alerts.some(a => a.text.includes('82%')));
});
test('balance reproducible from ledger after reload', () => {
  const json = DB.exportJSON();
  DB.replace(JSON.parse(json));
  assert.strictEqual(F.totalBalance(), rs(25000));
});
test('CSV export', () => {
  const csv = F.toCSV();
  assert.ok(csv.startsWith('"Date","Time","Type"'));
  assert.ok(csv.includes('"Internet Bill"'));
});

console.log('tasks');
test('date-wise tasks and stats', () => {
  const tm = U.addDays(today, 1);
  T.add({ title: 'A', date: today, priority: 'High' });
  T.add({ title: 'B', date: today, priority: 'Low' });
  T.add({ title: 'C', date: tm });
  assert.strictEqual(T.forDate(today).length, 2);
  assert.strictEqual(T.forDate(today)[0].title, 'A');
  assert.strictEqual(T.forDate(tm).length, 1);
  assert.strictEqual(T.upcoming(today, 7).length, 1);
});
test('completion is preserved', () => {
  const a = T.forDate(today)[0];
  T.toggle(a.id);
  const again = T.get(a.id);
  assert.strictEqual(again.status, 'Completed');
  assert.ok(again.completedAt);
  assert.strictEqual(T.stats(today).pct, 50);
  assert.strictEqual(T.forDate(today).length, 2);
});
test('overdue and carry forward', () => {
  const y = U.addDays(today, -1);
  T.add({ title: 'Old', date: y });
  assert.strictEqual(T.overdue(today).length, 1);
  assert.strictEqual(T.carryForward(today), 1);
  assert.strictEqual(T.overdue(today).length, 0);
  assert.strictEqual(T.forDate(today).length, 3);
});
test('recurring tasks spawn the next occurrence once', () => {
  const r = T.add({ title: 'Gym', date: today, recurrence: { type: 'Daily' } });
  const sp = T.setStatus(r.id, 'Completed');
  assert.strictEqual(sp.date, U.addDays(today, 1));
  assert.strictEqual(sp.seriesId, r.id);
  T.setStatus(r.id, 'Pending');
  T.setStatus(r.id, 'Completed');
  assert.strictEqual(DB.get().tasks.filter(t => t.seriesId === r.id).length, 2);
  assert.strictEqual(T.nextDate('2026-01-31', { type: 'Monthly' }), '2026-02-28');
  assert.strictEqual(T.nextDate('2026-01-01', { type: 'Custom', interval: 2, unit: 'weeks' }), '2026-01-15');
});

console.log('models');
test('habit streaks', () => {
  const h = M.Habits.add({ name: 'Read' });
  M.Habits.toggle(h.id, today);
  M.Habits.toggle(h.id, U.addDays(today, -1));
  M.Habits.toggle(h.id, U.addDays(today, -2));
  const hh = DB.get().habits[0];
  assert.strictEqual(M.Habits.streak(hh, today), 3);
  M.Habits.toggle(h.id, today);
  assert.strictEqual(M.Habits.streak(DB.get().habits[0], today), 2);
});
test('goal contributions', () => {
  const g = M.Goals.add({ title: 'Save', targetAmount: rs(1000) });
  M.Goals.contribute(g.id, rs(400));
  assert.strictEqual(M.Goals.pct(DB.get().goals[0]), 40);
  M.Goals.contribute(g.id, rs(600));
  assert.strictEqual(DB.get().goals[0].status, 'Completed');
});
test('notes search & pin', () => {
  M.Notes.add({ title: 'Wifi password', body: 'in the drawer', category: 'Important' });
  M.Notes.add({ title: 'Idea', body: 'build an app' });
  assert.strictEqual(M.Notes.search('wifi').length, 1);
  M.Notes.togglePin(DB.get().notes[1].id);
  assert.strictEqual(M.Notes.search('')[0].title, 'Idea');
});

console.log('import / validation');
test('validate rejects garbage, merge keeps existing', () => {
  assert.strictEqual(DB.validate('x').ok, false);
  assert.strictEqual(DB.validate({ transactions: [{ type: 'nope', amount: 'a', date: 'x' }] }).ok, false);
  const doc = JSON.parse(DB.exportJSON());
  assert.strictEqual(DB.validate(doc).ok, true);
  const n = DB.get().transactions.length;
  const counts = DB.mergeFrom(doc);
  assert.strictEqual(counts.transactions, 0);
  assert.strictEqual(DB.get().transactions.length, n);
  doc.transactions.push({ id: 'tx_new', type: 'income', amount: 100, title: 'x', date: today, accountId: 'acc_cash', createdAt: 1 });
  assert.strictEqual(DB.mergeFrom(doc).transactions, 1);
});
test('corrupt data normalizes gracefully', () => {
  const s = DB.normalize({ transactions: 'bad', settings: null, tasks: [null, { id: 'a', title: 'ok', date: today }] });
  assert.deepStrictEqual(s.transactions, []);
  assert.strictEqual(s.tasks.length, 1);
  assert.strictEqual(s.accounts.length, 4);
});

console.log('\n' + passed + ' tests passed' + (process.exitCode ? ', some FAILED' : ''));
