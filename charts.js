/* CHAMPIONS — small hand-made SVG charts (no libraries, so it works offline).
   Player colors come from one fixed order of 8 hues, checked for colorblind
   safety and contrast on the dark felt of every theme (more players → gray).
   A color always follows the player, never the rank. Lines are 2px with an end
   dot that wears a ring in the card color; grid and axes are hairlines; touching
   the chart shows a crosshair and a readout of every player at that night. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
  const OTHER = '#7c837e';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  function htmlEl(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Player id → color, in a fixed order (first 8 players get a hue, the rest gray). */
  function colorMap(orderedIds) {
    const out = {};
    orderedIds.forEach((id, i) => {
      out[id] = i < PALETTE.length ? PALETTE[i] : OTHER;
    });
    return out;
  }

  function niceStep(span, count) {
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  /** Clean axis ticks covering lo … hi (about `count` steps). */
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) {
      const pad = Math.max(1, Math.abs(lo) * 0.1);
      lo -= pad;
      hi += pad;
    }
    const step = niceStep(hi - lo, count || 4);
    const start = Math.floor(lo / step + 1e-9) * step;
    const end = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }

  /**
   * Multi-series line chart, drawn at the host's real width.
   * opts: {
   *   labels: ['3 Nov', …]      short x labels (one per night)
   *   titles: ['Mon 3 Nov', …]  readout headers
   *   series: [{ id, name, color, values: [number | null, …] }]
   *   focus: id | null          one player highlighted, the others dimmed
   *   format: (v) => text       how values are written on the axis
   *   tipFormat: (v) => text    … and in the readout (defaults to format)
   *   invert: true              rank chart: 1 at the top
   *   zero: true                keep 0 inside the y range
   *   height: 240, label: 'accessible name'
   * }
   */
  function lineChart(host, opts) {
    host.textContent = '';
    const n = opts.labels.length;
    const fmt = opts.format || ((v) => String(v));
    const all = [];
    for (const s of opts.series) for (const v of s.values) if (v != null && Number.isFinite(v)) all.push(v);
    if (!n || !all.length) {
      htmlEl('p', 'chart-empty', host).textContent = opts.emptyText || 'Nothing to show yet.';
      return;
    }
    const W = Math.max(260, Math.floor(host.clientWidth || 320));
    const H = opts.height || 240;
    const cs = getComputedStyle(host);
    const surface = cs.getPropertyValue('--chart-surface').trim() || '#0a2418';

    // y scale
    let ticks;
    let lo;
    let hi;
    if (opts.invert) {
      hi = Math.max(2, ...all);
      lo = 1;
      const step = Math.max(1, Math.ceil((hi - 1) / 5));
      ticks = [];
      for (let r = 1; r <= hi; r += step) ticks.push(r);
    } else {
      const dlo = Math.min(...all, opts.zero ? 0 : Infinity);
      const dhi = Math.max(...all, opts.zero ? 0 : -Infinity);
      ticks = niceTicks(dlo, dhi, 4);
      lo = ticks[0];
      hi = ticks[ticks.length - 1];
    }
    const tickText = ticks.map((t) => (opts.invert ? `#${t}` : fmt(t)));
    const padL = Math.round(Math.max(24, Math.max(...tickText.map((t) => t.length)) * 6.4 + 10));
    const padR = 12;
    const padT = 10;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const X = (i) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
    const Y = (v) => (opts.invert ? padT + ((v - lo) / (hi - lo || 1)) * plotH : padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH);

    const svg = svgEl('svg', {
      width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img',
      'aria-label': opts.label || 'Chart',
    }, host);

    // grid + y labels
    const grid = svgEl('g', { class: 'grid' }, svg);
    ticks.forEach((t, k) => {
      const y = Math.round(Y(t)) + 0.5;
      svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: !opts.invert && t === 0 && lo < 0 ? 'axis' : 'gl' }, grid);
      const tx = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, grid);
      tx.textContent = tickText[k];
    });
    // x labels: as many as fit, always the newest night
    const fit = Math.max(1, Math.floor(plotW / 48));
    const every = Math.max(1, Math.ceil(n / fit));
    for (let i = n - 1; i >= 0; i -= every) {
      const x = X(i);
      const anchor = n > 1 && i === 0 && every === 1 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
      const tx = svgEl('text', { x: anchor === 'start' ? x - 2 : anchor === 'end' ? x + 2 : x, y: H - 8, 'text-anchor': anchor, class: 'tick' }, grid);
      tx.textContent = opts.labels[i];
    }

    // lines (dimmed ones first, the focused one on top)
    const focus = opts.focus && opts.series.some((s) => s.id === opts.focus) ? opts.focus : null;
    const order = opts.series.slice().sort((a, b) => (a.id === focus) - (b.id === focus));
    const lines = svgEl('g', { class: 'lines' }, svg);
    for (const s of order) {
      const dim = focus && s.id !== focus;
      const g = svgEl('g', { opacity: dim ? 0.2 : 1 }, lines);
      let d = '';
      let last = null;
      s.values.forEach((v, i) => {
        if (v == null || !Number.isFinite(v)) {
          last = null;
          return;
        }
        d += `${last === null ? 'M' : 'L'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
        last = i;
      });
      if (d) svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      let li = -1;
      for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null && Number.isFinite(s.values[i])) { li = i; break; }
      if (li >= 0) svgEl('circle', { cx: X(li), cy: Y(s.values[li]), r: 4, fill: s.color, stroke: surface, 'stroke-width': 2 }, g);
    }

    // crosshair + readout
    const cross = svgEl('g', { class: 'cross', visibility: 'hidden' }, svg);
    const vline = svgEl('line', { y1: padT, y2: padT + plotH, class: 'xhair' }, cross);
    const dots = svgEl('g', {}, cross);
    const tip = htmlEl('div', 'chart-tip', host);
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    let current = -1;

    function show(i) {
      if (i < 0 || i >= n) return;
      current = i;
      const x = X(i);
      vline.setAttribute('x1', x);
      vline.setAttribute('x2', x);
      dots.textContent = '';
      const rows = [];
      for (const s of opts.series) {
        const v = s.values[i];
        if (v == null || !Number.isFinite(v)) continue;
        rows.push({ s, v });
        if (!focus || s.id === focus) svgEl('circle', { cx: x, cy: Y(v), r: 4.5, fill: s.color, stroke: surface, 'stroke-width': 2 }, dots);
      }
      rows.sort((a, b) => (opts.invert ? a.v - b.v : b.v - a.v));
      cross.setAttribute('visibility', 'visible');
      tip.textContent = '';
      const head = htmlEl('div', 'tip-h', tip);
      head.textContent = (opts.titles && opts.titles[i]) || opts.labels[i];
      for (const { s, v } of rows) {
        const row = htmlEl('div', `tip-row${focus === s.id ? ' on' : ''}`, tip);
        const key = htmlEl('i', 'key', row);
        key.style.background = s.color;
        htmlEl('b', '', row).textContent = opts.tipFormat ? opts.tipFormat(v) : opts.invert ? `#${v}` : fmt(v);
        htmlEl('span', '', row).textContent = s.name;
      }
      tip.hidden = false;
      // keep the readout inside the card, on the side away from the finger
      const scale = svg.getBoundingClientRect().width / W || 1;
      const px = x * scale;
      const tw = tip.offsetWidth;
      const hostW = host.clientWidth;
      let left = px + 14;
      if (left + tw > hostW - 4) left = px - 14 - tw;
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.round(padT * scale)}px`;
    }
    function hide() {
      current = -1;
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }
    const idxAt = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / (r.width || 1)) * W;
      if (n === 1) return 0;
      return Math.max(0, Math.min(n - 1, Math.round(((px - padL) / plotW) * (n - 1))));
    };
    svg.addEventListener('pointerdown', (e) => show(idxAt(e.clientX)));
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) show(idxAt(e.clientX));
    });
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
    host.tabIndex = 0;
    host.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        show(current < 0 ? n - 1 : Math.max(0, Math.min(n - 1, current + step)));
      } else if (e.key === 'Escape') hide();
    });
    host.addEventListener('focus', () => {
      if (current < 0 && host.matches(':focus-visible')) show(n - 1);
    });
    host.addEventListener('blur', hide);
  }

  /**
   * A tiny trend line (as text, for list rows). Muted line, accent end dot.
   * min / max: share one scale across rows so trends compare fairly.
   */
  function sparkline(values, o) {
    o = o || {};
    const w = o.width || 64;
    const h = o.height || 24;
    const p = 3;
    const pts = [];
    values.forEach((v, i) => {
      if (v != null && Number.isFinite(v)) pts.push([i, v]);
    });
    if (pts.length < 2) return '';
    const vs = pts.map((q) => q[1]);
    const lo = o.min != null ? o.min : Math.min(...vs);
    const hi = o.max != null ? o.max : Math.max(...vs);
    const span = hi - lo || 1;
    const X = (i) => p + (i * (w - 2 * p)) / Math.max(1, values.length - 1);
    const Y = (v) => h - p - ((v - lo) / span) * (h - 2 * p);
    const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
    const [li, lv] = pts[pts.length - 1];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${X(li).toFixed(1)}" cy="${Y(lv).toFixed(1)}" r="2.8"/></svg>`;
  }

  root.Charts = { PALETTE, OTHER, colorMap, niceTicks, lineChart, sparkline };
})(typeof self !== 'undefined' ? self : this);
