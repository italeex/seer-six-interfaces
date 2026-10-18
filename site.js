/* ============================================================
   Seer — six connected interfaces · shared vanilla JS helpers
   No frameworks, no build step. All figures are sample data.
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* deterministic PRNG so every "live" chart is stable across reloads */
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* random-walk price series, clamped to (1, 99) for percentage scales */
function walk(seed, n, start, vol, drift){
  const r = mulberry32(seed);
  let v = start;
  const out = [v];
  for (let i = 1; i < n; i++){
    v += (r() - 0.5) * 2 * vol + drift;
    v = Math.max(1, Math.min(99, v));
    out.push(v);
  }
  return out;
}

const fmtPct = (v, d = 1) => v.toFixed(d) + '%';
const fmtUsd = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M'
              : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K'
              : '$' + n.toFixed(0);
const fmtInt = n => n.toLocaleString('en-US');
const sign = n => (n > 0 ? '+' : '') + n.toFixed(1);

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent){
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

/* ---------- 30-day price chart (inline SVG, drawn at runtime) ---------- */
function priceChart(svg, data, opts = {}){
  const W = 640, H = 220, P = { l: 38, r: 14, t: 14, b: 24 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const min = Math.min(...data), max = Math.max(...data);
  const pad = Math.max(2, (max - min) * 0.25);
  const lo = Math.max(0, min - pad), hi = Math.min(100, max + pad);
  const x = i => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const accent = opts.cyan ? '#38E8FF' : '#7A5BFF';

  const defs = svgEl('defs', null, svg);
  const grad = svgEl('linearGradient', { id: opts.gradId || 'gradA', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svgEl('stop', { offset: '0%',   'stop-color': accent, 'stop-opacity': .30 }, grad);
  svgEl('stop', { offset: '100%', 'stop-color': accent, 'stop-opacity': 0  }, grad);

  for (let g = 0; g <= 3; g++){
    const v = lo + (g / 3) * (hi - lo);
    svgEl('line', { class: 'grid-line', x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }, svg);
    const t = svgEl('text', { class: 'axis-text', x: 4, y: y(v) + 3 }, svg);
    t.textContent = v.toFixed(0) + '%';
  }

  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  svgEl('polygon', { class: 'area', fill: `url(#${opts.gradId || 'gradA'})`,
    points: `${P.l},${H - P.b} ${pts} ${W - P.r},${H - P.b}` }, svg);
  svgEl('polyline', { class: opts.cyan ? 'line cyan' : 'line', points: pts }, svg);

  const last = data[data.length - 1];
  svgEl('circle', { class: opts.cyan ? 'dot cyan' : 'dot', cx: x(data.length - 1), cy: y(last), r: 3.4 }, svg);

  const l0 = svgEl('text', { class: 'axis-text', x: P.l, y: H - 6 }, svg);
  l0.textContent = opts.x0 || '30d ago';
  const l1 = svgEl('text', { class: 'axis-text', x: W - P.r, y: H - 6, 'text-anchor': 'end' }, svg);
  l1.textContent = opts.x1 || 'now';
}

/* ---------- order book rows around a mid price ---------- */
function orderBook(el, mid, seed){
  const r = mulberry32(seed || 7);
  const rowsAsk = [], rowsBid = [];
  for (let i = 5; i >= 1; i--){
    rowsAsk.push({ px: mid + i * 0.3 + r() * 0.2, sz: 400 + Math.round(r() * 5200) });
  }
  for (let i = 1; i <= 5; i++){
    rowsBid.push({ px: mid - i * 0.3 - r() * 0.2, sz: 400 + Math.round(r() * 5200) });
  }
  const maxSz = Math.max(...rowsAsk.concat(rowsBid).map(o => o.sz));
  /* innerHTML below uses only numbers and literal strings generated in this
     file (sample data) — no user input is ever interpolated. */
  const row = (o, side) => `<div class="ob-row ob-${side}">` +
      `<span class="ob-bar" style="width:${Math.round(o.sz / maxSz * 100)}%"></span>` +
      `<span class="px">${o.px.toFixed(1)}%</span>` +
      `<span class="muted tiny">${side === 'ask' ? 'sell' : 'buy'}</span>` +
      `<span class="sz">${fmtInt(o.sz)}</span></div>`;
  const spread = (rowsAsk[rowsAsk.length - 1].px - rowsBid[0].px).toFixed(1);
  el.innerHTML =
    `<div class="ob-head"><span>side</span><span style="text-align:center">price</span><span style="text-align:right">size</span></div>` +
    rowsAsk.map(o => row(o, 'ask')).join('') +
    `<div class="ob-mid"><span class="muted">mid</span><span>${mid.toFixed(1)}%</span><span class="muted">spread ${spread} pts</span></div>` +
    rowsBid.map(o => row(o, 'bid')).join('');
}

/* ---------- confidence-range plot (risk page) ---------- */
function rangePlot(svg, items, maxX){
  const W = 640, rowH = 34, P = { l: 118, r: 40, t: 10, b: 26 };
  const H = P.t + items.length * rowH + P.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const x = v => P.l + (v / maxX) * (W - P.l - P.r);

  for (let g = 0; g <= 4; g++){
    const v = (g / 4) * maxX;
    svgEl('line', { class: 'grid-line', x1: x(v), x2: x(v), y1: P.t, y2: H - P.b }, svg);
    const t = svgEl('text', { class: 'axis-text', x: x(v), y: H - 8, 'text-anchor': 'middle' }, svg);
    t.textContent = v.toFixed(0) + '%';
  }
  items.forEach((it, i) => {
    const cy = P.t + i * rowH + rowH / 2;
    const cls = it.p < 3 ? 'lo' : it.p < 6 ? 'lo' : it.p < 10 ? 'mid' : 'hi';
    const lab = svgEl('text', { class: 'axis-text', x: P.l - 10, y: cy + 3, 'text-anchor': 'end',
      fill: '#E8EAF0', 'font-size': '11' }, svg);
    lab.textContent = it.name;
    svgEl('line', { class: 'range ' + cls, x1: x(it.lo), x2: x(it.hi), y1: cy, y2: cy,
      'stroke-opacity': .35 }, svg);
    svgEl('line', { class: 'range ' + cls, x1: x(it.lo), x2: x(it.p), y1: cy, y2: cy }, svg);
    svgEl('circle', { class: 'dot', cx: x(it.p), cy: cy, r: 4 }, svg);
    const pv = svgEl('text', { class: 'axis-text', x: x(it.hi) + 6, y: cy + 3, fill: '#E8EAF0' }, svg);
    pv.textContent = it.p.toFixed(1) + '%';
  });
}

/* ---------- count-up for stat values ---------- */
function countUp(el){
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.dec || '0', 10);
  const pre = el.dataset.pre || '', suf = el.dataset.suf || '';
  const t0 = performance.now(), dur = 900;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = pre + (target * eased).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
