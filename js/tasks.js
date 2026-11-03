/* MyLife OS — tasks. Every task has a calendar date. Completing a task keeps it
   (status + completedAt). Recurring tasks: completing one spawns the next
   occurrence from the same template, so history is preserved per occurrence. */
(function (root) {
  'use strict';
  const U = root.U || require('./util.js');
  const DB = root.DB || require('./db.js');

  const PRIORITIES = ['High', 'Medium', 'Low'];
  const STATUSES = ['Pending', 'In Progress', 'Completed'];
  const RECUR = ['None', 'Daily', 'Weekly', 'Monthly', 'Custom'];

  function clean(input, old) {
    const t = Object.assign({}, old || {}, input);
    return {
      id: t.id || U.uid('task'),
      title: (t.title || '').trim(),
      desc: (t.desc || '').trim(),
      date: t.date,
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
      category: (t.category || 'Personal').trim(),
      startTime: t.startTime || '',
      deadline: t.deadline || '',            // 'HH:MM' on the task date
      status: STATUSES.includes(t.status) ? t.status : 'Pending',
      reminder: !!t.reminder,
      reminderTime: t.reminderTime || '',
      pinned: !!t.pinned,
      recurrence: normRecur(t.recurrence),
      seriesId: t.seriesId || null,
      completedAt: t.status === 'Completed' ? (t.completedAt || Date.now()) : null,
      createdAt: t.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  }
  function normRecur(r) {
    if (!r || !r.type || r.type === 'None') return null;
    const n = Math.max(1, parseInt(r.interval, 10) || 1);
    if (r.type === 'Custom') return { type: 'Custom', interval: n, unit: ['days', 'weeks', 'months'].includes(r.unit) ? r.unit : 'days' };
    if (RECUR.includes(r.type)) return { type: r.type };
    return null;
  }

  function validate(t) {
    const errs = [];
    if (!t.title) errs.push('Enter a task title.');
    if (!U.isDateStr(t.date)) errs.push('Pick a valid date.');
    for (const k of ['startTime', 'deadline', 'reminderTime']) if (t[k] && !/^\d{2}:\d{2}$/.test(t[k])) errs.push('Invalid time.');
    return errs;
  }

  function add(input) {
    const t = clean(input);
    const errs = validate(t);
    if (errs.length) throw new Error(errs.join(' '));
    if (t.recurrence && !t.seriesId) t.seriesId = t.id;
    DB.update(s => { s.tasks.push(t); DB.logActivity('Added task: ' + t.title); });
    return t;
  }
  function edit(id, input) {
    const s = DB.get();
    const idx = s.tasks.findIndex(x => x.id === id);
    if (idx < 0) throw new Error('Task not found.');
    const t = clean(Object.assign({}, input, { id, createdAt: s.tasks[idx].createdAt }), s.tasks[idx]);
    const errs = validate(t);
    if (errs.length) throw new Error(errs.join(' '));
    if (t.recurrence && !t.seriesId) t.seriesId = t.id;
    DB.update(st => { st.tasks[idx] = t; });
    return t;
  }
  function remove(id) { DB.update(s => { s.tasks = s.tasks.filter(x => x.id !== id); }); }
  function get(id) { return DB.get().tasks.find(x => x.id === id) || null; }

  function nextDate(date, r) {
    if (!r) return null;
    switch (r.type) {
      case 'Daily': return U.addDays(date, 1);
      case 'Weekly': return U.addDays(date, 7);
      case 'Monthly': return U.addMonths(date, 1);
      case 'Custom':
        if (r.unit === 'weeks') return U.addDays(date, 7 * r.interval);
        if (r.unit === 'months') return U.addMonths(date, r.interval);
        return U.addDays(date, r.interval);
    }
    return null;
  }

  // Change status. Completing a recurring task creates the next occurrence
  // (once per series/date, so toggling does not duplicate).
  function setStatus(id, status) {
    if (!STATUSES.includes(status)) throw new Error('Bad status');
    let spawned = null;
    DB.update(s => {
      const t = s.tasks.find(x => x.id === id);
      if (!t) return;
      t.status = status;
      t.completedAt = status === 'Completed' ? Date.now() : null;
      t.updatedAt = Date.now();
      if (status === 'Completed') {
        DB.logActivity('Completed task: ' + t.title);
        if (t.recurrence) {
          const nd = nextDate(t.date, t.recurrence);
          const exists = s.tasks.some(x => x.seriesId === t.seriesId && x.date === nd);
          if (nd && !exists) {
            spawned = clean({
              title: t.title, desc: t.desc, date: nd, priority: t.priority, category: t.category,
              startTime: t.startTime, deadline: t.deadline, reminder: t.reminder, reminderTime: t.reminderTime,
              recurrence: t.recurrence, seriesId: t.seriesId, pinned: t.pinned,
            });
            s.tasks.push(spawned);
          }
        }
      }
    });
    return spawned;
  }
  function toggle(id) {
    const t = get(id);
    if (!t) return;
    return setStatus(id, t.status === 'Completed' ? 'Pending' : 'Completed');
  }
  function togglePin(id) { DB.update(s => { const t = s.tasks.find(x => x.id === id); if (t) t.pinned = !t.pinned; }); }

  // ---- queries ---------------------------------------------------------------
  function isOverdue(t, today, now) {
    if (t.status === 'Completed') return false;
    today = today || U.todayStr();
    if (t.date < today) return true;
    if (t.date === today && t.deadline) return t.deadline < (now || U.nowTime());
    return false;
  }
  function forDate(d) { return sort(DB.get().tasks.filter(t => t.date === d)); }
  function overdue(today) { today = today || U.todayStr(); return sort(DB.get().tasks.filter(t => isOverdue(t, today))); }
  function upcoming(today, days) {
    today = today || U.todayStr();
    const end = U.addDays(today, days || 7);
    return sort(DB.get().tasks.filter(t => t.status !== 'Completed' && t.date > today && t.date <= end));
  }
  function inRange(from, to) { return DB.get().tasks.filter(t => t.date >= from && t.date <= to); }
  function recentlyCompleted(n) {
    return DB.get().tasks.filter(t => t.status === 'Completed').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, n || 5);
  }
  function stats(d) {
    const list = forDate(d);
    const done = list.filter(t => t.status === 'Completed').length;
    return { total: list.length, done, pending: list.length - done, pct: U.pct(done, list.length) };
  }
  function search(q, filters) {
    q = (q || '').toLowerCase().trim();
    filters = filters || {};
    return sort(DB.get().tasks.filter(t =>
      (!q || (t.title + ' ' + t.desc + ' ' + t.category).toLowerCase().includes(q)) &&
      (!filters.status || filters.status === 'All' || t.status === filters.status) &&
      (!filters.priority || filters.priority === 'All' || t.priority === filters.priority) &&
      (!filters.category || filters.category === 'All' || t.category === filters.category)));
  }
  const PRIO_RANK = { High: 0, Medium: 1, Low: 2 };
  function sort(list) {
    return list.slice().sort((a, b) =>
      (b.pinned - a.pinned) ||
      ((a.status === 'Completed') - (b.status === 'Completed')) ||
      a.date.localeCompare(b.date) ||
      (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) ||
      (a.startTime || a.deadline || '99').localeCompare(b.startTime || b.deadline || '99') ||
      a.createdAt - b.createdAt);
  }

  // Move all overdue (unfinished, past-dated) tasks to today.
  function carryForward(today) {
    today = today || U.todayStr();
    let n = 0;
    DB.update(s => {
      for (const t of s.tasks) if (t.status !== 'Completed' && t.date < today) { t.date = today; t.updatedAt = Date.now(); n++; }
      if (n) DB.logActivity('Carried forward ' + n + ' task(s) to today');
    });
    return n;
  }

  // Count of tasks per date in a month (for calendar dots)
  function monthMap(mk, today) {
    const m = {};
    for (const t of DB.get().tasks) {
      if (!t.date.startsWith(mk)) continue;
      const e = m[t.date] = m[t.date] || { total: 0, done: 0, overdue: 0 };
      e.total++;
      if (t.status === 'Completed') e.done++;
      else if (isOverdue(t, today)) e.overdue++;
    }
    return m;
  }

  // Productivity: completed vs total for each day in range
  function dailyCompletion(from, to) {
    const out = [];
    for (let d = from; d <= to; d = U.addDays(d, 1)) { const st = stats(d); out.push([d, st.done, st.total]); }
    return out;
  }

  const T = { PRIORITIES, STATUSES, RECUR, add, edit, remove, get, setStatus, toggle, togglePin, isOverdue, forDate, overdue, upcoming, inRange, recentlyCompleted, stats, search, sort, carryForward, monthMap, dailyCompletion, nextDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.Tasks = T;
})(typeof window !== 'undefined' ? window : globalThis);
