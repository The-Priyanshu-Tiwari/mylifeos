/* Notes & journal view */
(function (root) {
  'use strict';
  const { U, UI, DB, Notes, Forms } = root;
  const state = { q: '', cat: 'All' };

  function noteCard(n) {
    return '<div class="note-card" data-note="' + n.id + '"><div class="row between"><div class="bold ellipsis">' + (n.pinned ? '📌 ' : '') + (n.journal ? '📔 ' : '') + U.esc(n.title || (n.journal ? 'Journal · ' + U.fmtDate(n.date) : 'Untitled')) + '</div><span class="badge">' + U.esc(n.category) + '</span></div>' + (n.body ? '<div class="body mt-s">' + U.esc(n.body) + '</div>' : '') + '<div class="xs faint mt-s">' + U.fmtDate(n.date) + ' · edited ' + U.fmtDateTime(n.updatedAt) + '</div></div>';
  }
  root.noteCard = noteCard;

  UI.route('notes', {
    title: 'Notes & Journal', tab: 'more',
    render(el) {
      const s = DB.get();
      const list = Notes.search(state.q, state.cat);
      const pinned = list.filter(n => n.pinned), rest = list.filter(n => !n.pinned);
      let h = '<div class="grid2 mb"><button class="btn primary" data-new>+ Note</button><button class="btn" data-journal>📔 Journal entry</button></div>';
      h += '<div class="search-box">⌕<input data-q placeholder="Search notes…" value="' + U.esc(state.q) + '"></div>';
      h += '<div class="chips">' + ['All', 'Journal'].concat(s.settings.noteCategories.filter(c => c !== 'Journal')).map(c => '<button class="chip ' + (state.cat === c ? 'active' : '') + '" data-cat="' + U.esc(c) + '">' + U.esc(c) + '</button>').join('') + '</div>';
      if (pinned.length) h += '<div class="section-head"><h2>Pinned</h2></div><div class="notes-grid">' + pinned.map(noteCard).join('') + '</div>';
      h += '<div class="section-head"><h2>' + (state.cat === 'Journal' ? 'Journal' : 'Notes') + ' <span class="faint small">' + rest.length + '</span></h2></div>';
      h += '<div class="notes-grid">' + (rest.length ? rest.map(noteCard).join('') : '<div class="card">' + UI.empty('📝', 'No notes yet', 'Capture ideas, important info, or a daily journal') + '</div>') + '</div>';
      el.innerHTML = h;
      el.addEventListener('click', e => {
        if (e.target.closest('[data-new]')) { Forms.note(); return; }
        if (e.target.closest('[data-journal]')) { Forms.note({ journal: true }); return; }
        const c = e.target.closest('[data-cat]'); if (c) { state.cat = c.dataset.cat; UI.refresh(); return; }
        const n = e.target.closest('[data-note]'); if (n) Forms.note({ id: n.dataset.note });
      });
      const q = el.querySelector('[data-q]'); q.addEventListener('input', U.debounce(() => { state.q = q.value; const p = q.selectionStart; UI.refresh(); const nq = el.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(p, p); }, 250));
    },
  });
})(window);
