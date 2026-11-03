/* MyLife OS — persistent store (localStorage, single JSON document, versioned)
   Everything the app knows lives in one state object. Save is debounced and
   also flushed on pagehide so nothing is lost when the tab closes. */
(function (root) {
  'use strict';
  const U = root.U || require('./util.js');

  const KEY = 'mylifeos.v1';
  const BACKUP_KEY = 'mylifeos.v1.backup'; // last-known-good copy, used if the main key is corrupt
  const VERSION = 1;

  const DEFAULT_EXPENSE_CATS = ['Food', 'Transportation', 'Shopping', 'Education', 'Bills', 'Entertainment', 'Health', 'Personal', 'Travel', 'Other'];
  const DEFAULT_INCOME_CATS = ['Salary', 'Freelancing', 'Business', 'Personal Receipts', 'Other Income'];
  const DEFAULT_TASK_CATS = ['Personal', 'Work', 'Study', 'Home', 'Health', 'Finance', 'Errands', 'Other'];
  const DEFAULT_NOTE_CATS = ['General', 'Idea', 'Journal', 'Important', 'Work', 'Personal'];

  function defaultAccounts() {
    return [
      { id: 'acc_cash', name: 'Cash', type: 'Cash', icon: '💵', createdAt: Date.now() },
      { id: 'acc_bank', name: 'Bank Account', type: 'Bank', icon: '🏦', createdAt: Date.now() },
      { id: 'acc_upi', name: 'UPI', type: 'UPI', icon: '📱', createdAt: Date.now() },
      { id: 'acc_card', name: 'Card', type: 'Card', icon: '💳', createdAt: Date.now() },
    ];
  }

  function defaultState() {
    return {
      version: VERSION,
      createdAt: Date.now(),
      settings: {
        name: '',
        theme: 'auto',            // auto | light | dark
        monthlyBudget: 0,         // paise, 0 = not set
        categoryBudgets: {},      // { category: paise }
        expenseCategories: DEFAULT_EXPENSE_CATS.slice(),
        incomeCategories: DEFAULT_INCOME_CATS.slice(),
        taskCategories: DEFAULT_TASK_CATS.slice(),
        noteCategories: DEFAULT_NOTE_CATS.slice(),
        backupReminderDays: 7,
        lastBackupAt: 0,
        onboarded: false,
        defaultAccountId: 'acc_cash',
      },
      accounts: defaultAccounts(),
      transactions: [],   // single source of truth for all money movement
      tasks: [],
      habits: [],
      goals: [],
      notes: [],
      events: [],
      activity: [],
    };
  }

  // Make sure a loaded/imported object has every collection and setting
  // (handles older/partial data gracefully).
  function normalize(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    const out = Object.assign({}, d, s);
    out.settings = Object.assign({}, d.settings, s.settings || {});
    for (const k of ['accounts', 'transactions', 'tasks', 'habits', 'goals', 'notes', 'events', 'activity']) {
      if (!Array.isArray(out[k])) out[k] = d[k];
      out[k] = out[k].filter(x => x && typeof x === 'object');
    }
    for (const k of ['expenseCategories', 'incomeCategories', 'taskCategories', 'noteCategories']) {
      if (!Array.isArray(out.settings[k]) || !out.settings[k].length) out.settings[k] = d.settings[k];
    }
    if (!out.accounts.length) out.accounts = defaultAccounts();
    if (typeof out.settings.categoryBudgets !== 'object' || !out.settings.categoryBudgets) out.settings.categoryBudgets = {};
    out.version = VERSION;
    return out;
  }

  // ---- validation of a document (used by import) --------------------------
  function validate(doc) {
    const errors = [];
    if (!doc || typeof doc !== 'object') return { ok: false, errors: ['Not a JSON object'] };
    if (!('transactions' in doc) && !('tasks' in doc) && !('settings' in doc)) {
      errors.push('File does not look like a MyLife OS backup (no transactions/tasks/settings).');
    }
    const arrs = ['accounts', 'transactions', 'tasks', 'habits', 'goals', 'notes', 'events'];
    for (const k of arrs) if (k in doc && !Array.isArray(doc[k])) errors.push('"' + k + '" must be a list.');
    if (Array.isArray(doc.transactions)) {
      doc.transactions.forEach((t, i) => {
        if (!t || typeof t !== 'object') { errors.push('Transaction #' + (i + 1) + ' is not an object.'); return; }
        if (!['expense', 'income', 'transfer', 'opening', 'adjustment'].includes(t.type)) errors.push('Transaction #' + (i + 1) + ' has unknown type "' + t.type + '".');
        if (!Number.isInteger(t.amount)) errors.push('Transaction #' + (i + 1) + ' amount must be an integer (paise).');
        if (!U.isDateStr(t.date)) errors.push('Transaction #' + (i + 1) + ' has invalid date.');
      });
    }
    if (Array.isArray(doc.tasks)) {
      doc.tasks.forEach((t, i) => {
        if (!t || typeof t !== 'object') { errors.push('Task #' + (i + 1) + ' is not an object.'); return; }
        if (!U.isDateStr(t.date)) errors.push('Task #' + (i + 1) + ' has invalid date.');
        if (typeof t.title !== 'string') errors.push('Task #' + (i + 1) + ' missing title.');
      });
    }
    return { ok: errors.length === 0, errors: errors.slice(0, 20) };
  }

  // ---- storage ---------------------------------------------------------------
  let state = null;
  const listeners = new Set();
  let storage = null;
  try { storage = root.localStorage; storage.getItem(KEY); } catch (e) { storage = null; } // blocked in some viewers / content:// origins
  let memory = {};
  function lsGet(k) { try { return storage ? storage.getItem(k) : (memory[k] || null); } catch (e) { return memory[k] || null; } }
  function lsSet(k, v) { try { if (storage) storage.setItem(k, v); else memory[k] = v; } catch (e) { memory[k] = v; throw e; } }

  function load() {
    let raw = lsGet(KEY);
    let parsed = null, recovered = false;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    if (!parsed) {
      const b = lsGet(BACKUP_KEY);
      if (b) { try { parsed = JSON.parse(b); recovered = true; } catch (e) { parsed = null; } }
    }
    state = normalize(parsed);
    state._recovered = recovered;
    return state;
  }

  function saveNow() {
    if (!state) return;
    const copy = Object.assign({}, state);
    delete copy._recovered;
    copy.savedAt = Date.now();
    const json = JSON.stringify(copy);
    const prev = lsGet(KEY);
    try {
      lsSet(KEY, json);
      if (prev) lsSet(BACKUP_KEY, prev);
      lastError = null;
    } catch (e) {
      lastError = e;
      if (root.console) console.error('Save failed', e);
    }
  }
  let lastError = null;
  const saveSoon = U.debounce(saveNow, 150);

  function get() { if (!state) load(); return state; }

  // Mutate inside fn; the store persists and notifies views.
  function update(fn, opts) {
    const s = get();
    const r = fn(s);
    saveSoon();
    if (!(opts && opts.silent)) emit();
    return r;
  }
  function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function replace(doc) {
    state = normalize(doc);
    saveNow();
    emit();
  }
  function reset() { replace(defaultState()); }

  function exportJSON() {
    const copy = Object.assign({}, get());
    delete copy._recovered;
    copy.exportedAt = Date.now();
    copy.app = 'MyLife OS';
    return JSON.stringify(copy, null, 2);
  }

  // Merge: keep existing records, add records from doc whose ids are new.
  function mergeFrom(doc) {
    const inc = normalize(doc);
    const counts = {};
    update(s => {
      for (const k of ['accounts', 'transactions', 'tasks', 'habits', 'goals', 'notes', 'events']) {
        const have = new Set(s[k].map(x => x.id));
        let n = 0;
        for (const x of inc[k]) if (x.id && !have.has(x.id)) { s[k].push(x); n++; }
        counts[k] = n;
      }
      for (const k of ['expenseCategories', 'incomeCategories', 'taskCategories', 'noteCategories']) {
        for (const c of inc.settings[k]) if (!s.settings[k].includes(c)) s.settings[k].push(c);
      }
    });
    return counts;
  }

  function logActivity(text) {
    const s = get();
    s.activity.unshift({ ts: Date.now(), text: String(text).slice(0, 200) });
    if (s.activity.length > 300) s.activity.length = 300;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  }

  const DB = {
    KEY, VERSION, defaultState, normalize, validate, load, get, update, saveNow, subscribe, replace, reset,
    exportJSON, mergeFrom, logActivity, get lastError() { return lastError; },
    _useMemory() { storage = null; memory = {}; state = null; },
    get persistent() { return storage !== null; },
    rawSize() { return (lsGet(KEY) || '').length; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DB;
  else root.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
