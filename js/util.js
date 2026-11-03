/* MyLife OS — shared utilities (dates in Asia/Kolkata, currency, ids, escaping) */
(function (root) {
  'use strict';

  const TZ = 'Asia/Kolkata';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- ids ---------------------------------------------------------------
  function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + rnd;
  }

  // ---- dates (all calendar dates are 'YYYY-MM-DD' strings in IST) -------
  // Formats a JS Date instance into its IST calendar parts.
  function istParts(d) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = {};
    fmt.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return {
      y: +p.year, m: +p.month, d: +p.day,
      hh: (+p.hour) % 24, mm: +p.minute, ss: +p.second,
    };
  }

  function todayStr(now) {
    const p = istParts(now || new Date());
    return pad(p.y, 4) + '-' + pad(p.m) + '-' + pad(p.d);
  }

  function nowTime(now) {
    const p = istParts(now || new Date());
    return pad(p.hh) + ':' + pad(p.mm);
  }

  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  function isDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const dt = toUTC(s);
    return !isNaN(dt) && fromUTC(dt) === s; // rejects 2026-13-01, 2026-02-30 etc.
  }

  // 'YYYY-MM-DD' -> UTC midnight Date (used purely for calendar arithmetic)
  function toUTC(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function fromUTC(dt) {
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  }

  function addDays(s, n) { const dt = toUTC(s); dt.setUTCDate(dt.getUTCDate() + n); return fromUTC(dt); }
  function addMonths(s, n) {
    const dt = toUTC(s);
    const day = dt.getUTCDate();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() + n);
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(day, last));
    return fromUTC(dt);
  }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function dayOfWeek(s) { return toUTC(s).getUTCDay(); }
  function monthKey(s) { return s.slice(0, 7); }
  function monthStart(s) { return s.slice(0, 7) + '-01'; }
  function monthEnd(s) {
    const [y, m] = s.split('-').map(Number);
    return s.slice(0, 7) + '-' + pad(new Date(Date.UTC(y, m, 0)).getUTCDate());
  }
  function weekStart(s) { return addDays(s, -((dayOfWeek(s) + 6) % 7)); } // Monday
  function weekEnd(s) { return addDays(weekStart(s), 6); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // 'DD MMM YYYY'
  function fmtDate(s, opts) {
    if (!isDateStr(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    const base = d + ' ' + MONTHS[m - 1] + ' ' + y;
    if (opts && opts.weekday) return DAYS[dayOfWeek(s)] + ', ' + base;
    return base;
  }
  function fmtDateShort(s) { // 'DD MMM'
    if (!isDateStr(s)) return '';
    const [, m, d] = s.split('-').map(Number);
    return d + ' ' + MONTHS[m - 1];
  }
  function fmtMonth(key) { // 'YYYY-MM' -> 'Nov 2026'
    const [y, m] = key.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + y;
  }
  function fmtMonthLong(key) {
    const [y, m] = key.split('-').map(Number);
    return MONTHS_LONG[m - 1] + ' ' + y;
  }
  function fmtTime(t) { // 'HH:MM' -> '9:05 am'
    if (!t || !/^\d{2}:\d{2}$/.test(t)) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    return ((h % 12) || 12) + ':' + pad(m) + ' ' + ap;
  }
  function relDay(s, today) {
    today = today || todayStr();
    const n = diffDays(today, s);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return fmtDate(s, { weekday: true });
  }
  function fmtDateTime(ts) {
    const p = istParts(new Date(ts));
    return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y + ', ' + fmtTime(pad(p.hh) + ':' + pad(p.mm));
  }

  // ---- money: amounts are stored as integer paise to avoid float drift ----
  function toPaise(v) {
    if (typeof v === 'string') v = v.replace(/[₹,\s]/g, '');
    const n = Number(v);
    if (!isFinite(n)) return NaN;
    return Math.round(n * 100);
  }
  function fromPaise(p) { return p / 100; }

  // Indian grouping: 12,34,567.89
  function fmtINR(paise, opts) {
    opts = opts || {};
    const neg = paise < 0;
    const abs = Math.abs(paise);
    const rupees = Math.floor(abs / 100);
    const ps = abs % 100;
    let s = String(rupees);
    if (s.length > 3) {
      const last3 = s.slice(-3);
      let rest = s.slice(0, -3);
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      s = rest + ',' + last3;
    }
    if (!opts.whole && ps !== 0) s += '.' + pad(ps);
    const sign = neg ? '-' : (opts.plus ? '+' : '');
    return sign + '₹' + s;
  }
  function fmtINRCompact(paise) {
    const abs = Math.abs(paise) / 100;
    const sign = paise < 0 ? '-' : '';
    if (abs >= 1e7) return sign + '₹' + (abs / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
    if (abs >= 1e5) return sign + '₹' + (abs / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
    if (abs >= 1e3) return sign + '₹' + (abs / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
    return fmtINR(paise, { whole: true });
  }

  // ---- misc --------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pct(a, b) { return b > 0 ? clamp(Math.round((a / b) * 100), 0, 100) : 0; }
  function sum(arr, f) { let t = 0; for (const x of arr) t += f ? f(x) : x; return t; }
  function groupBy(arr, f) {
    const m = {};
    for (const x of arr) { const k = f(x); (m[k] = m[k] || []).push(x); }
    return m;
  }
  function sortBy(arr, f, desc) {
    return arr.slice().sort((a, b) => {
      const x = f(a), y = f(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
    });
  }
  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms); };
  }
  function greeting(now) {
    const h = istParts(now || new Date()).hh;
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  const U = {
    TZ, MONTHS, MONTHS_LONG, DAYS, DAYS_LONG,
    uid, pad, istParts, todayStr, nowTime, isDateStr, addDays, addMonths, diffDays, dayOfWeek,
    monthKey, monthStart, monthEnd, weekStart, weekEnd, daysInMonth,
    fmtDate, fmtDateShort, fmtMonth, fmtMonthLong, fmtTime, relDay, fmtDateTime,
    toPaise, fromPaise, fmtINR, fmtINRCompact,
    esc, clamp, pct, sum, groupBy, sortBy, debounce, greeting,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  else root.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
