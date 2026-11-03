/* MyLife OS — shared add/edit forms (bottom sheets) */
(function (root) {
  'use strict';
  const { U, UI, DB, Finance, Tasks, Habits, Goals, Notes, Events } = root;

  // Safe mini calculator for amount fields: "150+200*2" -> 550
  function calc(expr) {
    expr = String(expr || '').replace(/[₹,\s]/g, '');
    if (!/^[\d.+\-*/()]+$/.test(expr)) return NaN;
    const tokens = expr.match(/\d+\.?\d*|[+\-*/()]/g) || [];
    let i = 0;
    function parseExpr() { let v = parseTerm(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const r = parseTerm(); v = op === '+' ? v + r : v - r; } return v; }
    function parseTerm() { let v = parseFactor(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; const r = parseFactor(); v = op === '*' ? v * r : v / r; } return v; }
    function parseFactor() {
      const t = tokens[i++];
      if (t === '(') { const v = parseExpr(); i++; return v; }
      if (t === '-') return -parseFactor();
      if (t === '+') return parseFactor();
      return parseFloat(t);
    }
    const v = parseExpr();
    return i === tokens.length && isFinite(v) ? v : NaN;
  }
  function amountFromInput(v) { const n = calc(v); return isNaN(n) ? NaN : Math.round(n * 100); }

  function accountOptions() { return DB.get().accounts.map(a => [a.id, a.icon + ' ' + a.name]); }
  function catOptions(list, current) {
    const opts = list.slice();
    if (current && !opts.includes(current)) opts.push(current);
    return opts.map(c => [c, c]).concat([['__new', '+ New category…']]);
  }
  function amountField(name, value) {
    return '<div class="field"><label>Amount (₹)</label><div class="amount-input">' + UI.input(name, value != null ? (value / 100) : '', 'inputmode="decimal" placeholder="0" autocomplete="off" autofocus') + '</div><div class="hint">Tip: you can type a sum like 150+200</div></div>';
  }
  function wireNewCategory(form, selName, listKey) {
    const sel = form.querySelector('select[name=' + selName + ']');
    if (!sel) return;
    sel.addEventListener('change', async () => {
      if (sel.value !== '__new') return;
      const v = await UI.prompt({ title: 'New category', label: 'Category name', ok: 'Add' });
      const name = (v || '').trim();
      if (name) {
        DB.update(s => { if (!s.settings[listKey].includes(name)) s.settings[listKey].push(name); }, { silent: true });
        const o = document.createElement('option'); o.value = name; o.textContent = name;
        sel.insertBefore(o, sel.lastElementChild); sel.value = name;
      } else sel.selectedIndex = 0;
    });
  }

  // ---- Transaction (expense / income / transfer) -------------------------
  function transaction(opts) {
    opts = opts || {};
    const s = DB.get();
    const old = opts.id ? Finance.get(opts.id) : null;
    const type = (old && old.type) || opts.type || 'expense';
    const t = old || { type, date: opts.date || U.todayStr(), time: U.nowTime(), accountId: s.settings.defaultAccountId, category: type === 'income' ? s.settings.incomeCategories[0] : s.settings.expenseCategories[0] };
    const isFixed = old && (old.type === 'opening' || old.type === 'adjustment');
    const title = old ? 'Edit ' + old.type : (type === 'expense' ? 'Add expense' : type === 'income' ? 'Add income' : 'Transfer between accounts');

    function body(tp) {
      let h = '';
      if (!old) h += '<div class="mb">' + UI.segmented('type', [['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']], tp) + '</div>';
      h += amountField('amount', t.amount != null ? Math.abs(t.amount) : null);
      if (tp === 'expense' || tp === 'income') {
        h += UI.field(tp === 'expense' ? 'What did you spend on?' : 'Source / title', UI.input('title', t.title, 'placeholder="' + (tp === 'expense' ? 'e.g. Lunch, Petrol' : 'e.g. Salary for Nov') + '" required'));
        h += UI.field('Category', UI.select('category', catOptions(tp === 'expense' ? s.settings.expenseCategories : s.settings.incomeCategories, t.category), t.category));
      }
      if (isFixed) h += UI.field('Title', UI.input('title', t.title));
      h += '<div class="frow">' + UI.field('Date', UI.input('date', t.date, 'type="date" required')) + UI.field('Time (optional)', UI.input('time', t.time, 'type="time"')) + '</div>';
      if (tp === 'transfer') {
        h += '<div class="frow">' + UI.field('From account', UI.select('accountId', accountOptions(), t.accountId)) + UI.field('To account', UI.select('toAccountId', accountOptions(), t.toAccountId || (s.accounts.find(a => a.id !== t.accountId) || {}).id)) + '</div>';
      } else {
        h += UI.field(tp === 'expense' ? 'Paid from (account / payment method)' : 'Received into', UI.select('accountId', accountOptions(), t.accountId));
      }
      h += UI.field('Note (optional)', '<textarea name="note" rows="2" placeholder="Details…">' + U.esc(t.note || '') + '</textarea>');
      return h;
    }

    UI.sheet({
      title, body: body(type), submit: old ? 'Save changes' : 'Add',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this transaction? The balance will be recalculated.' })) { Finance.remove(old.id); close(); UI.toast('Transaction deleted'); } } } : null,
      onOpen(form) {
        wireNewCategory(form, 'category', (type === 'income' ? 'incomeCategories' : 'expenseCategories'));
        const typeInp = form.querySelector('input[name=type]');
        if (typeInp) typeInp.addEventListener('change', () => {
          const amt = form.querySelector('input[name=amount]').value;
          const tp = typeInp.value;
          form.querySelector('.sheet-content').innerHTML = body(tp);
          form.querySelector('input[name=amount]').value = amt;
          const cat = form.querySelector('select[name=category]');
          if (cat) cat.value = (tp === 'income' ? s.settings.incomeCategories : s.settings.expenseCategories)[0];
          wireNewCategory(form, 'category', (tp === 'income' ? 'incomeCategories' : 'expenseCategories'));
        });
      },
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        const tp = old ? old.type : f.type;
        let amount = amountFromInput(f.amount);
        if (isNaN(amount)) throw new Error('Enter a valid amount.');
        if (isFixed) amount = old.amount < 0 ? -amount : amount; // keep adjustment sign
        if (f.category === '__new') throw new Error('Choose a category.');
        const acc = s.accounts.find(a => a.id === f.accountId);
        const data = { type: tp, amount, title: f.title, category: f.category, date: f.date, time: f.time, accountId: f.accountId, toAccountId: f.toAccountId, note: f.note, method: acc ? acc.type : 'Other' };
        if (old) { Finance.edit(old.id, data); UI.toast('Saved'); }
        else {
          const tx = Finance.add(data);
          UI.toast((tp === 'expense' ? 'Expense added · ' : tp === 'income' ? 'Income added · ' : 'Transferred ') + U.fmtINR(amount), 'good', { label: 'Undo', onClick: () => { Finance.remove(tx.id); UI.toast('Undone'); } });
          if (tp === 'expense') { const b = Finance.budgetStatus(); const over = b.alerts.find(a => a.level === 'over'); if (over) setTimeout(() => UI.toast('⚠ ' + over.text, 'bad'), 400); }
        }
        if (opts.onDone) opts.onDone();
      },
    });
  }

  // ---- Task ----------------------------------------------------------------
  function task(opts) {
    opts = opts || {};
    const s = DB.get();
    const old = opts.id ? Tasks.get(opts.id) : null;
    const t = old || { date: opts.date || U.todayStr(), priority: 'Medium', category: s.settings.taskCategories[0], status: 'Pending', recurrence: null };
    const rec = t.recurrence || { type: 'None' };
    let h = UI.field('Task', UI.input('title', t.title, 'placeholder="What needs to be done?" required autofocus'));
    h += UI.field('Details (optional)', '<textarea name="desc" rows="2" placeholder="Notes, links, steps…">' + U.esc(t.desc || '') + '</textarea>');
    h += UI.field('Date', UI.input('date', t.date, 'type="date" required'));
    h += '<div class="field"><label>Priority</label>' + UI.segmented('priority', ['High', 'Medium', 'Low'], t.priority) + '</div>';
    h += UI.field('Category', UI.select('category', catOptions(s.settings.taskCategories, t.category), t.category));
    h += '<div class="frow">' + UI.field('Start time', UI.input('startTime', t.startTime, 'type="time"')) + UI.field('Deadline', UI.input('deadline', t.deadline, 'type="time"')) + '</div>';
    if (old) h += '<div class="field"><label>Status</label>' + UI.segmented('status', Tasks.STATUSES, t.status) + '</div>';
    h += '<div class="frow">' + UI.field('Repeat', UI.select('rtype', Tasks.RECUR, rec.type)) +
      '<div class="field" data-custom ' + (rec.type === 'Custom' ? '' : 'hidden') + '><label>Every</label><div class="row"><input name="rint" type="number" min="1" value="' + (rec.interval || 1) + '" style="width:70px">' + UI.select('runit', ['days', 'weeks', 'months'], rec.unit || 'days') + '</div></div></div>';
    h += UI.toggleField('Reminder', 'reminder', t.reminder);
    h += '<div class="field" data-rem ' + (t.reminder ? '' : 'hidden') + '><label>Remind at</label>' + UI.input('reminderTime', t.reminderTime || t.startTime || '09:00', 'type="time"') + '<div class="hint">Shows a notification when the app is open (and a system notification if you allowed them).</div></div>';
    h += UI.toggleField('Pin as important', 'pinned', t.pinned);
    UI.sheet({
      title: old ? 'Edit task' : 'New task', body: h, submit: old ? 'Save changes' : 'Add task',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this task?' })) { Tasks.remove(old.id); close(); UI.toast('Task deleted'); } } } : null,
      onOpen(form) {
        wireNewCategory(form, 'category', 'taskCategories');
        form.querySelector('select[name=rtype]').addEventListener('change', e => { form.querySelector('[data-custom]').hidden = e.target.value !== 'Custom'; });
        form.querySelector('input[name=reminder]').addEventListener('change', e => { form.querySelector('[data-rem]').hidden = !e.target.checked; });
      },
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        if (f.category === '__new') throw new Error('Choose a category.');
        const data = { title: f.title, desc: f.desc, date: f.date, priority: f.priority, category: f.category, startTime: f.startTime, deadline: f.deadline, status: f.status || 'Pending', reminder: f.reminder === 'on', reminderTime: f.reminderTime, pinned: f.pinned === 'on', recurrence: f.rtype === 'None' ? null : { type: f.rtype, interval: f.rint, unit: f.runit } };
        if (old) { Tasks.edit(old.id, data); UI.toast('Task saved'); } else { Tasks.add(data); UI.toast('Task added for ' + U.relDay(f.date), 'good'); }
        if (opts.onDone) opts.onDone();
      },
    });
  }

  // ---- Note ----------------------------------------------------------------
  function note(opts) {
    opts = opts || {};
    const s = DB.get();
    const old = opts.id ? DB.get().notes.find(n => n.id === opts.id) : null;
    const n = old || { category: opts.journal ? 'Journal' : 'General', journal: !!opts.journal, date: U.todayStr() };
    let h = UI.field('Title', UI.input('title', n.title, 'placeholder="' + (n.journal ? 'Journal · ' + U.fmtDate(n.date) : 'Title') + '" autofocus'));
    h += UI.field(n.journal ? 'How was your day?' : 'Note', '<textarea name="body" rows="7" placeholder="Write here…">' + U.esc(n.body || '') + '</textarea>');
    h += '<div class="frow">' + UI.field('Category', UI.select('category', catOptions(s.settings.noteCategories, n.category), n.category)) + UI.field('Date', UI.input('date', n.date, 'type="date"')) + '</div>';
    h += UI.toggleField('Journal entry', 'journal', n.journal);
    h += UI.toggleField('Pin', 'pinned', n.pinned);
    UI.sheet({
      title: old ? 'Edit note' : (n.journal ? 'Journal entry' : 'New note'), body: h, submit: 'Save',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this note?' })) { Notes.remove(old.id); close(); UI.toast('Note deleted'); } } } : null,
      onOpen(form) { wireNewCategory(form, 'category', 'noteCategories'); },
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        if (f.category === '__new') throw new Error('Choose a category.');
        const data = { title: f.title, body: f.body, category: f.category, date: f.date, journal: f.journal === 'on', pinned: f.pinned === 'on' };
        if (old) Notes.edit(old.id, data); else Notes.add(data);
        UI.toast('Note saved', 'good');
        if (opts.onDone) opts.onDone();
      },
    });
  }

  // ---- Habit -------------------------------------------------------------------
  const HABIT_ICONS = ['✅', '🏃', '📖', '📚', '🌅', '💧', '🧠', '🧘', '🥗', '💪', '🚭', '🛏️', '✍️', '🎸', '🧹', '💊', '🙏', '🚶'];
  function habit(opts) {
    opts = opts || {};
    const old = opts.id ? DB.get().habits.find(h => h.id === opts.id) : null;
    const hb = old || { icon: '✅' };
    let h = UI.field('Habit', UI.input('name', hb.name, 'placeholder="e.g. Exercise, Read 20 pages" required autofocus'));
    h += '<div class="field"><label>Icon</label><input type="hidden" name="icon" value="' + hb.icon + '"><div class="row wrap" data-icons>' + HABIT_ICONS.map(i => '<button type="button" class="btn sm' + (i === hb.icon ? ' primary' : '') + '" data-i="' + i + '" style="font-size:18px;min-width:44px">' + i + '</button>').join('') + '</div></div>';
    if (old) h += UI.toggleField('Archived (hide from today)', 'archived', hb.archived);
    UI.sheet({
      title: old ? 'Edit habit' : 'New habit', body: h, submit: 'Save',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this habit and its history?' })) { Habits.remove(old.id); close(); UI.toast('Habit deleted'); } } } : null,
      onOpen(form) { form.querySelector('[data-icons]').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; form.querySelector('input[name=icon]').value = b.dataset.i; form.querySelectorAll('[data-icons] button').forEach(x => x.classList.toggle('primary', x === b)); }); },
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        if (old) Habits.edit(old.id, { name: f.name, icon: f.icon, archived: f.archived === 'on' }); else Habits.add({ name: f.name, icon: f.icon });
        UI.toast('Habit saved', 'good');
      },
    });
  }

  // ---- Goal -----------------------------------------------------------------------
  function goal(opts) {
    opts = opts || {};
    const old = opts.id ? DB.get().goals.find(g => g.id === opts.id) : null;
    const g = old || { status: 'Not Started', progress: 0 };
    let h = UI.field('Goal', UI.input('title', g.title, 'placeholder="e.g. Save ₹50,000, Finish the course" required autofocus'));
    h += UI.field('Description', '<textarea name="desc" rows="2">' + U.esc(g.desc || '') + '</textarea>');
    h += '<div class="frow">' + UI.field('Target date', UI.input('targetDate', g.targetDate, 'type="date"')) + UI.field('Target amount (₹, optional)', UI.input('targetAmount', g.targetAmount ? g.targetAmount / 100 : '', 'inputmode="decimal" placeholder="Financial goal"')) + '</div>';
    h += '<div class="field"><label>Status</label>' + UI.segmented('status', Goals.STATUSES, g.status) + '</div>';
    h += '<div class="field" data-prog><label>Progress: <span data-pv>' + g.progress + '</span>%</label><input type="range" name="progress" min="0" max="100" value="' + g.progress + '"><div class="hint">For financial goals progress is calculated from saved amount instead.</div></div>';
    UI.sheet({
      title: old ? 'Edit goal' : 'New goal', body: h, submit: 'Save',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this goal?' })) { Goals.remove(old.id); close(); UI.toast('Goal deleted'); } } } : null,
      onOpen(form) { form.querySelector('input[name=progress]').addEventListener('input', e => { form.querySelector('[data-pv]').textContent = e.target.value; }); },
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        let ta = 0;
        if (f.targetAmount.trim()) { ta = amountFromInput(f.targetAmount); if (isNaN(ta) || ta <= 0) throw new Error('Enter a valid target amount.'); }
        const data = { title: f.title, desc: f.desc, targetDate: f.targetDate, targetAmount: ta, status: f.status, progress: f.status === 'Completed' ? 100 : parseInt(f.progress, 10) };
        if (old) Goals.edit(old.id, data); else Goals.add(data);
        UI.toast('Goal saved', 'good');
      },
    });
  }

  function contribute(goalId) {
    const g = DB.get().goals.find(x => x.id === goalId);
    UI.sheet({
      title: 'Add savings to "' + g.title + '"', submit: 'Add',
      body: amountField('amount') + UI.field('Note (optional)', UI.input('note', '', 'placeholder="e.g. from salary"')) + '<p class="hint faint xs">This only tracks progress; it does not move money between your accounts. Use a Transfer for that.</p>',
      onSubmit(form) {
        const f = Object.fromEntries(new FormData(form));
        const a = amountFromInput(f.amount);
        if (isNaN(a) || a === 0) throw new Error('Enter a valid amount.');
        Goals.contribute(goalId, a, f.note);
        UI.toast('Saved ' + U.fmtINR(a), 'good');
      },
    });
  }

  // ---- Event -------------------------------------------------------------------
  function event(opts) {
    opts = opts || {};
    const old = opts.id ? DB.get().events.find(e => e.id === opts.id) : null;
    const ev = old || { date: opts.date || U.todayStr() };
    let h = UI.field('Event', UI.input('title', ev.title, 'placeholder="e.g. Dentist, Birthday, Exam" required autofocus'));
    h += '<div class="frow">' + UI.field('Date', UI.input('date', ev.date, 'type="date" required')) + UI.field('Time', UI.input('time', ev.time, 'type="time"')) + '</div>';
    h += UI.field('Note', '<textarea name="note" rows="2">' + U.esc(ev.note || '') + '</textarea>');
    UI.sheet({
      title: old ? 'Edit event' : 'New event', body: h, submit: 'Save',
      danger: old ? { label: 'Delete', onClick: async (close) => { if (await UI.confirm({ message: 'Delete this event?' })) { Events.remove(old.id); close(); } } } : null,
      onSubmit(form) { const f = Object.fromEntries(new FormData(form)); if (old) Events.edit(old.id, f); else Events.add(f); UI.toast('Event saved', 'good'); },
    });
  }

  // ---- Quick add menu (FAB) ------------------------------------------------------
  function quickAdd() {
    const items = [['expense', '💸', 'Expense'], ['income', '💰', 'Income'], ['transfer', '🔁', 'Transfer'], ['task', '☑️', 'Task'], ['note', '📝', 'Note'], ['journal', '📔', 'Journal'], ['habit', '🔥', 'Habit'], ['goal', '🎯', 'Goal'], ['event', '📅', 'Event']];
    const sh = UI.sheet({
      title: 'Quick add',
      body: '<div class="grid3 mb">' + items.map(i => '<button type="button" class="btn" data-q="' + i[0] + '" style="flex-direction:column;min-height:74px;gap:4px"><span style="font-size:24px">' + i[1] + '</span><span class="small">' + i[2] + '</span></button>').join('') + '</div>',
      onOpen(form, close) {
        form.addEventListener('click', e => {
          const b = e.target.closest('[data-q]'); if (!b) return;
          close();
          const q = b.dataset.q;
          if (q === 'expense' || q === 'income' || q === 'transfer') transaction({ type: q });
          else if (q === 'task') task();
          else if (q === 'note') note();
          else if (q === 'journal') note({ journal: true });
          else if (q === 'habit') habit();
          else if (q === 'goal') goal();
          else if (q === 'event') event();
        });
      },
    });
    return sh;
  }

  root.Forms = { transaction, task, note, habit, goal, contribute, event, quickAdd, calc, amountFromInput };
})(window);
