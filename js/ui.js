/* MyLife OS — UI framework: hash router, bottom sheets, dialogs, toasts, helpers */
(function (root) {
  'use strict';
  const U = root.U;

  const routes = {};
  let current = null;
  const viewEl = () => document.getElementById('view');

  function route(name, def) { routes[name] = def; }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, qs] = h.split('?');
    const params = {};
    (qs || '').split('&').forEach(p => { if (!p) return; const [k, v] = p.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { name: path.split('/')[0] || 'home', params };
  }

  function go(name, params) {
    const qs = params ? '?' + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
    location.hash = '#/' + name + qs;
  }

  const scrollPos = {};
  function render() {
    const { name, params } = parseHash();
    const def = routes[name] || routes.home;
    if (current && current.name !== name) scrollPos[current.name] = window.scrollY;
    const same = current && current.name === name;
    current = { name, params };
    document.getElementById('page-title').textContent = typeof def.title === 'function' ? def.title(params) : def.title;
    const isTab = ['home', 'tasks', 'expenses', 'finance', 'more'].includes(name);
    document.getElementById('btn-back').hidden = isTab;
    document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === (isTab ? name : def.tab || 'more')));
    const el = viewEl();
    try {
      el.innerHTML = '';
      def.render(el, params);
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="card"><h3>Something went wrong</h3><p class="muted small mt-s">' + U.esc(e.message) + '</p><button class="btn mt" onclick="location.reload()">Reload</button></div>';
    }
    if (!same) window.scrollTo(0, scrollPos[name] || 0);
    document.getElementById('fab').hidden = def.noFab === true;
  }

  function refresh() { render(); }

  // ---- sheet -----------------------------------------------------------
  const sheetRoot = () => document.getElementById('sheet-root');
  let openSheets = 0;

  // opts: { title, body (html string | element), submit: 'Save', onSubmit(formEl) -> truthy to close,
  //         danger: {label, onClick}, onOpen(el) }
  function sheet(opts) {
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" style="position:relative">' +
      '<div class="grab" style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:38px;height:4px;border-radius:2px;background:var(--surface-3)"></div>' +
      '<div class="sheet-head"><h2>' + U.esc(opts.title || '') + '</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>' +
      '<form class="sheet-body" novalidate><div class="form-error" hidden></div><div class="sheet-content"></div></form>' +
      '<div class="sheet-foot"></div></div>';
    const content = bd.querySelector('.sheet-content');
    if (typeof opts.body === 'string') content.innerHTML = opts.body; else if (opts.body) content.appendChild(opts.body);
    const form = bd.querySelector('form');
    const foot = bd.querySelector('.sheet-foot');
    const err = bd.querySelector('.form-error');
    function close() { bd.remove(); openSheets--; if (openSheets <= 0) document.body.style.overflow = ''; }
    if (opts.danger) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn danger'; b.textContent = opts.danger.label; b.style.flex = '0 0 auto';
      b.onclick = () => { opts.danger.onClick(close); };
      foot.appendChild(b);
    }
    if (opts.onSubmit !== undefined) {
      const b = document.createElement('button'); b.type = 'submit'; b.className = 'btn primary'; b.textContent = opts.submit || 'Save';
      foot.appendChild(b);
    } else foot.remove();
    form.onsubmit = (e) => {
      e.preventDefault();
      err.hidden = true;
      try {
        const r = opts.onSubmit(form, close);
        if (r !== false) close();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; form.scrollTop = 0; }
    };
    bd.querySelector('[data-close]').onclick = close;
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    sheetRoot().appendChild(bd);
    openSheets++;
    document.body.style.overflow = 'hidden';
    if (opts.onOpen) opts.onOpen(form, close);
    const first = form.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 60);
    return { close, form };
  }

  function confirm(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    return new Promise(resolve => {
      const bd = document.createElement('div');
      bd.className = 'sheet-backdrop centered';
      bd.innerHTML = '<div class="dialog" role="alertdialog"><h3>' + U.esc(opts.title || 'Are you sure?') + '</h3><p class="muted">' + U.esc(opts.message || '') + '</p>' +
        '<div class="actions"><button class="btn" data-no>' + U.esc(opts.cancel || 'Cancel') + '</button><button class="btn ' + (opts.danger === false ? 'primary' : 'danger') + '" data-yes>' + U.esc(opts.ok || 'Delete') + '</button></div></div>';
      bd.querySelector('[data-no]').onclick = () => { bd.remove(); resolve(false); };
      bd.querySelector('[data-yes]').onclick = () => { bd.remove(); resolve(true); };
      bd.addEventListener('click', e => { if (e.target === bd) { bd.remove(); resolve(false); } });
      sheetRoot().appendChild(bd);
    });
  }

  function prompt(opts) {
    return new Promise(resolve => {
      sheet({
        title: opts.title, submit: opts.ok || 'OK',
        body: '<div class="field"><label>' + U.esc(opts.label || '') + '</label><input name="v" value="' + U.esc(opts.value || '') + '" placeholder="' + U.esc(opts.placeholder || '') + '" autofocus ' + (opts.type ? 'type="' + opts.type + '" inputmode="decimal"' : '') + '></div>',
        onSubmit(f) { resolve(f.v.value); },
      });
    });
  }

  // ---- toast ------------------------------------------------------------
  function toast(msg, type, action) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.innerHTML = '<span>' + U.esc(msg) + '</span>';
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.onClick(); t.remove(); }; t.appendChild(b); }
    document.getElementById('toast-root').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, action ? 5000 : 2400);
  }

  // ---- html helpers -------------------------------------------------------
  function select(name, options, value, attrs) {
    return '<select name="' + name + '" ' + (attrs || '') + '>' + options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return '<option value="' + U.esc(v) + '"' + (v === value ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    }).join('') + '</select>';
  }
  function field(label, inner, hint) { return '<div class="field"><label>' + U.esc(label) + '</label>' + inner + (hint ? '<div class="hint">' + U.esc(hint) + '</div>' : '') + '</div>'; }
  function input(name, value, attrs) { return '<input name="' + name + '" value="' + U.esc(value == null ? '' : value) + '" ' + (attrs || '') + '>'; }
  function toggleField(label, name, checked) {
    return '<div class="field inline"><label>' + U.esc(label) + '</label><label class="switch"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '><i></i></label></div>';
  }
  function segmented(name, options, value) {
    return '<div class="seg" data-seg="' + name + '"><input type="hidden" name="' + name + '" value="' + U.esc(value) + '">' +
      options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return '<button type="button" data-v="' + U.esc(v) + '" class="' + (v === value ? 'active' : '') + '">' + U.esc(l) + '</button>'; }).join('') + '</div>';
  }
  function empty(icon, text, sub) { return '<div class="empty"><div class="big">' + icon + '</div><div>' + U.esc(text) + '</div>' + (sub ? '<div class="xs mt-s">' + U.esc(sub) + '</div>' : '') + '</div>'; }
  function progress(p, cls) { return '<div class="bar"><i class="' + (cls || '') + '" style="width:' + U.clamp(p, 0, 100) + '%"></i></div>'; }

  // delegate: segmented controls anywhere
  document.addEventListener('click', e => {
    const b = e.target.closest('.seg > button');
    if (!b) return;
    const seg = b.parentElement;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    const inp = seg.querySelector('input[type=hidden]');
    inp.value = b.dataset.v;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  }

  function catIcon(cat) {
    const m = { Food: '🍽️', Transportation: '🚌', Shopping: '🛍️', Education: '📚', Bills: '🧾', Entertainment: '🎬', Health: '💊', Personal: '🙂', Travel: '✈️', Other: '📦', Salary: '💼', Freelancing: '💻', Business: '🏢', 'Personal Receipts': '🤝', 'Other Income': '💰', Transfer: '🔁', Opening: '🏁', Adjustment: '🛠️', Work: '💼', Study: '📖', Home: '🏠', Finance: '💰', Errands: '🧺', General: '📝', Idea: '💡', Journal: '📔', Important: '⭐' };
    return m[cat] || '🏷️';
  }

  root.UI = { route, go, render, refresh, sheet, confirm, prompt, toast, select, field, input, toggleField, segmented, empty, progress, download, catIcon, parseHash, get current() { return current; } };
})(window);
