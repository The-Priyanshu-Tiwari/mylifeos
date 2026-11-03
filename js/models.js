/* MyLife OS — habits, goals, notes, events */
(function (root) {
  'use strict';
  const U = root.U || require('./util.js');
  const DB = root.DB || require('./db.js');

  // ---- Habits -------------------------------------------------------------
  // habit.days = { 'YYYY-MM-DD': true }
  const Habits = {
    add(input) {
      const name = (input.name || '').trim();
      if (!name) throw new Error('Enter a habit name.');
      const h = { id: U.uid('hab'), name, icon: input.icon || '✅', days: {}, createdAt: Date.now(), archived: false, color: input.color || '' };
      DB.update(s => { s.habits.push(h); DB.logActivity('New habit: ' + name); });
      return h;
    },
    edit(id, input) {
      DB.update(s => { const h = s.habits.find(x => x.id === id); if (!h) return; if (input.name && input.name.trim()) h.name = input.name.trim(); if (input.icon) h.icon = input.icon; if ('archived' in input) h.archived = !!input.archived; });
    },
    remove(id) { DB.update(s => { s.habits = s.habits.filter(x => x.id !== id); }); },
    toggle(id, date) {
      date = date || U.todayStr();
      DB.update(s => {
        const h = s.habits.find(x => x.id === id); if (!h) return;
        h.days = h.days || {};
        if (h.days[date]) delete h.days[date]; else { h.days[date] = true; DB.logActivity('Habit done: ' + h.name); }
      });
    },
    done(h, date) { return !!(h.days && h.days[date]); },
    streak(h, today) {
      today = today || U.todayStr();
      let n = 0, d = today;
      if (!Habits.done(h, d)) d = U.addDays(d, -1); // streak still alive if today not yet done
      while (Habits.done(h, d)) { n++; d = U.addDays(d, -1); }
      return n;
    },
    bestStreak(h) {
      const days = Object.keys(h.days || {}).sort();
      let best = 0, cur = 0, prev = null;
      for (const d of days) { cur = (prev && U.diffDays(prev, d) === 1) ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
      return best;
    },
    countInRange(h, from, to) { let n = 0; for (const d in (h.days || {})) if (d >= from && d <= to) n++; return n; },
    pctInRange(h, from, to) {
      const start = h.createdAt ? U.todayStr(new Date(h.createdAt)) : from;
      const f = start > from ? start : from;
      const days = U.diffDays(f, to) + 1;
      return days > 0 ? U.pct(Habits.countInRange(h, f, to), days) : 0;
    },
  };

  // ---- Goals ----------------------------------------------------------------
  const Goals = {
    STATUSES: ['Not Started', 'In Progress', 'Completed'],
    add(input) {
      const g = Goals.clean(input);
      if (!g.title) throw new Error('Enter a goal title.');
      DB.update(s => { s.goals.push(g); DB.logActivity('New goal: ' + g.title); });
      return g;
    },
    clean(input, old) {
      const g = Object.assign({}, old || {}, input);
      return {
        id: g.id || U.uid('goal'), title: (g.title || '').trim(), desc: (g.desc || '').trim(),
        targetDate: U.isDateStr(g.targetDate) ? g.targetDate : '',
        targetAmount: Number.isInteger(g.targetAmount) && g.targetAmount > 0 ? g.targetAmount : 0,
        contributions: Array.isArray(g.contributions) ? g.contributions : [],
        progress: U.clamp(parseInt(g.progress, 10) || 0, 0, 100),
        status: Goals.STATUSES.includes(g.status) ? g.status : 'Not Started',
        createdAt: g.createdAt || Date.now(), updatedAt: Date.now(),
        completedAt: g.status === 'Completed' ? (g.completedAt || Date.now()) : null,
      };
    },
    edit(id, input) {
      DB.update(s => { const i = s.goals.findIndex(x => x.id === id); if (i >= 0) s.goals[i] = Goals.clean(Object.assign({}, input, { id }), s.goals[i]); });
    },
    remove(id) { DB.update(s => { s.goals = s.goals.filter(x => x.id !== id); }); },
    saved(g) { return U.sum(g.contributions || [], c => c.amount); },
    pct(g) { return g.targetAmount ? U.pct(Goals.saved(g), g.targetAmount) : g.progress; },
    contribute(id, amount, note) {
      if (!Number.isInteger(amount) || amount === 0) throw new Error('Enter a valid amount.');
      DB.update(s => {
        const g = s.goals.find(x => x.id === id); if (!g) return;
        g.contributions.push({ id: U.uid('c'), date: U.todayStr(), amount, note: (note || '').trim() });
        if (g.status === 'Not Started') g.status = 'In Progress';
        if (g.targetAmount && Goals.saved(g) >= g.targetAmount) { g.status = 'Completed'; g.completedAt = Date.now(); }
        DB.logActivity('Saved ' + U.fmtINR(amount) + ' towards ' + g.title);
      });
    },
    removeContribution(id, cid) { DB.update(s => { const g = s.goals.find(x => x.id === id); if (g) g.contributions = g.contributions.filter(c => c.id !== cid); }); },
  };

  // ---- Notes --------------------------------------------------------------------
  const Notes = {
    add(input) {
      const n = Notes.clean(input);
      if (!n.title && !n.body) throw new Error('Write something first.');
      DB.update(s => { s.notes.push(n); DB.logActivity('Added note: ' + (n.title || n.body.slice(0, 30))); });
      return n;
    },
    clean(input, old) {
      const n = Object.assign({}, old || {}, input);
      return {
        id: n.id || U.uid('note'), title: (n.title || '').trim(), body: (n.body || '').trim(),
        category: (n.category || 'General').trim(), pinned: !!n.pinned,
        journal: !!n.journal, date: U.isDateStr(n.date) ? n.date : U.todayStr(),
        createdAt: n.createdAt || Date.now(), updatedAt: Date.now(),
      };
    },
    edit(id, input) { DB.update(s => { const i = s.notes.findIndex(x => x.id === id); if (i >= 0) s.notes[i] = Notes.clean(Object.assign({}, input, { id }), s.notes[i]); }); },
    remove(id) { DB.update(s => { s.notes = s.notes.filter(x => x.id !== id); }); },
    togglePin(id) { DB.update(s => { const n = s.notes.find(x => x.id === id); if (n) n.pinned = !n.pinned; }); },
    search(q, cat) {
      q = (q || '').toLowerCase().trim();
      return DB.get().notes.filter(n => (!q || (n.title + ' ' + n.body).toLowerCase().includes(q)) && (!cat || cat === 'All' || (cat === 'Journal' ? n.journal : n.category === cat)))
        .sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
    },
  };

  // ---- Events (custom calendar items) --------------------------------------------
  const Events = {
    add(input) {
      const title = (input.title || '').trim();
      if (!title) throw new Error('Enter an event title.');
      if (!U.isDateStr(input.date)) throw new Error('Pick a valid date.');
      const e = { id: U.uid('ev'), title, date: input.date, time: input.time || '', note: (input.note || '').trim(), createdAt: Date.now() };
      DB.update(s => s.events.push(e));
      return e;
    },
    edit(id, input) { DB.update(s => { const e = s.events.find(x => x.id === id); if (e) Object.assign(e, { title: (input.title || e.title).trim(), date: U.isDateStr(input.date) ? input.date : e.date, time: input.time || '', note: (input.note || '').trim() }); }); },
    remove(id) { DB.update(s => { s.events = s.events.filter(x => x.id !== id); }); },
    forDate(d) { return DB.get().events.filter(e => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || '')); },
    upcoming(today, days) { const end = U.addDays(today, days || 30); return DB.get().events.filter(e => e.date >= today && e.date <= end).sort((a, b) => a.date.localeCompare(b.date)); },
  };

  // Global search across tasks, transactions and notes
  function globalSearch(q) {
    q = (q || '').toLowerCase().trim();
    if (!q) return { tasks: [], transactions: [], notes: [] };
    const s = DB.get();
    return {
      tasks: s.tasks.filter(t => (t.title + ' ' + t.desc + ' ' + t.category).toLowerCase().includes(q)).slice(0, 15),
      transactions: s.transactions.filter(t => (t.title + ' ' + t.category + ' ' + t.note).toLowerCase().includes(q) || String(t.amount / 100).includes(q)).slice(0, 15),
      notes: Notes.search(q).slice(0, 15),
    };
  }

  const M = { Habits, Goals, Notes, Events, globalSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else Object.assign(root, M);
})(typeof window !== 'undefined' ? window : globalThis);
