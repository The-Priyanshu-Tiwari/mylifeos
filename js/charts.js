/* MyLife OS — tiny canvas chart library (bar, line, donut) with hover tooltips.
   Colors come from CSS tokens so light/dark are both handled. */
(function (root) {
  'use strict';
  const U = root.U;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function series(n) { return css('--s' + (((n) % 8) + 1)); }

  function setup(el, height) {
    el.classList.add('chart');
    el.innerHTML = '<canvas></canvas><div class="tip"></div>';
    const canvas = el.querySelector('canvas');
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth || 320;
    canvas.width = w * dpr; canvas.height = height * dpr;
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font = '11px ' + css('--font');
    return { canvas, ctx, w, h: height, tip: el.querySelector('.tip'), el };
  }

  function hover(c, hitTest) {
    const move = (e) => {
      const r = c.canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      const x = p.clientX - r.left, y = p.clientY - r.top;
      const hit = hitTest(x, y);
      if (hit) {
        c.tip.innerHTML = hit.html;
        c.tip.style.left = hit.x + 'px';
        c.tip.style.top = Math.max(hit.y, 28) + 'px';
        c.tip.style.display = 'block';
      } else c.tip.style.display = 'none';
    };
    c.canvas.addEventListener('mousemove', move);
    c.canvas.addEventListener('mouseleave', () => { c.tip.style.display = 'none'; });
    c.canvas.addEventListener('touchstart', move, { passive: true });
    c.canvas.addEventListener('touchmove', move, { passive: true });
    c.canvas.addEventListener('touchend', () => setTimeout(() => { c.tip.style.display = 'none'; }, 1500));
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  function axes(c, pad, max, fmt) {
    const { ctx, w, h } = c;
    ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1;
    ctx.fillStyle = css('--text-3'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(fmt(max * i / 4), pad.l - 6, y);
    }
    ctx.strokeStyle = css('--axis');
    ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
  }

  function roundTop(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h));
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath();
  }

  // data: { labels: [], series: [{name, values:[], color?}] }, grouped bars
  function bar(el, data, opts) {
    opts = opts || {};
    const c = setup(el, opts.height || 180);
    const { ctx, w, h } = c;
    const fmt = opts.format || (v => U.fmtINRCompact(v));
    const pad = { l: opts.padL || 46, r: 8, t: 10, b: 24 };
    const nS = data.series.length;
    const maxV = niceMax(Math.max(0, ...data.series.flatMap(s => s.values)));
    axes(c, pad, maxV, fmt);
    const n = data.labels.length;
    const slot = (w - pad.l - pad.r) / Math.max(n, 1);
    const gap = 2;
    const bw = Math.max(2, (slot * 0.72 - gap * (nS - 1)) / nS);
    const bars = [];
    data.labels.forEach((lab, i) => {
      data.series.forEach((s, j) => {
        const v = s.values[i] || 0;
        const bh = (h - pad.t - pad.b) * (v / maxV);
        const x = pad.l + slot * i + slot * 0.14 + j * (bw + gap);
        const y = h - pad.b - bh;
        ctx.fillStyle = s.color || series(j);
        if (bh > 0) { roundTop(ctx, x, y, bw, bh, 4); ctx.fill(); }
        bars.push({ x, y, w: bw, h: bh, v, lab, s: s.name, color: s.color || series(j) });
      });
      // x labels (skip some if crowded)
      const every = Math.ceil(n / Math.max(1, Math.floor((w - pad.l) / 34)));
      if (i % every === 0 || n <= 8) {
        ctx.fillStyle = css('--text-3'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(opts.labelFormat ? opts.labelFormat(lab) : lab, pad.l + slot * i + slot / 2, h - pad.b + 6);
      }
    });
    hover(c, (x, y) => {
      const i = Math.floor((x - pad.l) / slot);
      if (i < 0 || i >= n) return null;
      const grp = bars.filter(b => b.lab === data.labels[i]);
      const html = '<b>' + U.esc(opts.tipLabel ? opts.tipLabel(data.labels[i]) : data.labels[i]) + '</b><br>' +
        grp.map(b => (nS > 1 ? U.esc(b.s) + ': ' : '') + U.esc(opts.tipFormat ? opts.tipFormat(b.v) : fmt(b.v))).join('<br>');
      return { x: pad.l + slot * i + slot / 2, y: Math.min(...grp.map(b => b.y)) - 4, html };
    });
    if (nS > 1) legend(el, data.series.map((s, j) => [s.name, s.color || series(j)]));
    return c;
  }

  function line(el, data, opts) {
    opts = opts || {};
    const c = setup(el, opts.height || 180);
    const { ctx, w, h } = c;
    const fmt = opts.format || (v => U.fmtINRCompact(v));
    const pad = { l: opts.padL || 46, r: 10, t: 12, b: 24 };
    const maxV = niceMax(Math.max(0, ...data.series.flatMap(s => s.values)));
    axes(c, pad, maxV, fmt);
    const n = data.labels.length;
    const sx = i => pad.l + (n > 1 ? (w - pad.l - pad.r) * i / (n - 1) : (w - pad.l - pad.r) / 2);
    const sy = v => h - pad.b - (h - pad.t - pad.b) * (v / maxV);
    data.series.forEach((s, j) => {
      const col = s.color || series(j);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      s.values.forEach((v, i) => { i ? ctx.lineTo(sx(i), sy(v)) : ctx.moveTo(sx(i), sy(v)); });
      ctx.stroke();
      if (opts.area !== false && data.series.length === 1) {
        ctx.lineTo(sx(n - 1), h - pad.b); ctx.lineTo(sx(0), h - pad.b); ctx.closePath();
        ctx.fillStyle = col; ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
      }
      if (n <= 31) s.values.forEach((v, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx(i), sy(v), n > 14 ? 2.5 : 4, 0, Math.PI * 2); ctx.fill(); });
    });
    const every = Math.ceil(n / Math.max(1, Math.floor((w - pad.l) / 40)));
    ctx.fillStyle = css('--text-3'); ctx.textBaseline = 'top';
    data.labels.forEach((lab, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
      ctx.fillText(opts.labelFormat ? opts.labelFormat(lab) : lab, sx(i), h - pad.b + 6);
    });
    hover(c, (x) => {
      if (n === 0) return null;
      const i = U.clamp(Math.round((x - pad.l) / ((w - pad.l - pad.r) / Math.max(n - 1, 1))), 0, n - 1);
      const html = '<b>' + U.esc(opts.tipLabel ? opts.tipLabel(data.labels[i]) : data.labels[i]) + '</b><br>' +
        data.series.map(s => (data.series.length > 1 ? U.esc(s.name) + ': ' : '') + U.esc(opts.tipFormat ? opts.tipFormat(s.values[i]) : fmt(s.values[i]))).join('<br>');
      return { x: sx(i), y: Math.min(...data.series.map(s => sy(s.values[i]))) - 6, html };
    });
    if (data.series.length > 1) legend(el, data.series.map((s, j) => [s.name, s.color || series(j)]));
    return c;
  }

  // items: [[label, value]]
  function donut(el, items, opts) {
    opts = opts || {};
    const size = opts.size || 150;
    const c = setup(el, size);
    const { ctx, w } = c;
    const total = U.sum(items, i => i[1]) || 1;
    const cx = w / 2, cy = size / 2, R = size / 2 - 6, r = R * 0.62;
    let a = -Math.PI / 2;
    const arcs = [];
    items.forEach((it, j) => {
      const ang = (it[1] / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, a, a + ang); ctx.arc(cx, cy, r, a + ang, a, true); ctx.closePath();
      ctx.fillStyle = series(j); ctx.fill();
      ctx.strokeStyle = css('--surface'); ctx.lineWidth = 2; ctx.stroke();
      arcs.push({ a0: a, a1: a + ang, it, color: series(j) });
      a += ang;
    });
    ctx.fillStyle = css('--text'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 15px ' + css('--font');
    ctx.fillText(opts.centerText || U.fmtINRCompact(total), cx, cy - (opts.centerSub ? 7 : 0));
    if (opts.centerSub) { ctx.font = '11px ' + css('--font'); ctx.fillStyle = css('--text-3'); ctx.fillText(opts.centerSub, cx, cy + 10); }
    hover(c, (x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d < r || d > R) return null;
      let ang = Math.atan2(dy, dx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
      const hit = arcs.find(s => ang >= s.a0 && ang < s.a1);
      if (!hit) return null;
      return { x, y: y - 6, html: '<b>' + U.esc(hit.it[0]) + '</b> ' + U.fmtINR(hit.it[1]) + ' (' + Math.round(hit.it[1] / total * 100) + '%)' };
    });
    legend(el, items.map((it, j) => [it[0] + ' · ' + Math.round(it[1] / total * 100) + '%', series(j)]));
    return c;
  }

  function legend(el, entries) {
    const d = document.createElement('div');
    d.className = 'legend';
    d.innerHTML = entries.map(e => '<span><i style="background:' + e[1] + '"></i>' + U.esc(e[0]) + '</span>').join('');
    el.appendChild(d);
  }

  root.Charts = { bar, line, donut, series };
})(window);
