// Funktionsplotter: Terme eintippen, sofort im Koordinatensystem sehen. Mehrere Funktionen, Schieberegler,
// Nullstellen / Extrempunkte / Schnittpunkte antippbar, Wertetabelle, als Seite ins Heft oder als Zeichnung in die offene Seite.
import * as db from './db.js';
import { h, icon, toast, sheet } from './ui.js';
import { compile, paramsOf, mathify, stripName, expoInput, supify } from './mathfn.js';

const COLORS = ['#2a55d4', '#d0493f', '#2f9e6a', '#c0752a', '#6c5bd4', '#2f8fb3', '#b0577a', '#5f6673'];
const NAMES = ['f', 'g', 'h', 'i', 'j', 'u', 'v', 'w'];
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const DEFAULT = () => ({ fns: [{ src: 'x² − 2', color: COLORS[0], on: true }, { src: 'a·x + 1', color: COLORS[1], on: true }], params: { a: 1 }, ranges: {}, view: { cx: 0, cy: 0, s: 40 } });

// Zahl schön auf Deutsch: 3 Nachkommastellen, fast-ganze Zahlen glätten
export function fmt(v, d = 3) {
  if (!Number.isFinite(v)) return '–';
  if (Math.abs(v - Math.round(v)) < 1e-7) v = Math.round(v);
  const s = String(Math.round(v * 10 ** d) / 10 ** d);
  return (s === '-0' ? '0' : s).replace('.', ',').replace('-', '−');
}
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// ---------- Analyse ----------
function golden(f, a, b, max) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 80; i++) {
    const fc = max ? -f(c) : f(c), fd = max ? -f(d) : f(d);
    if (fc < fd) { b = d; d = c; c = b - g * (b - a); } else { a = c; c = d; d = a + g * (b - a); }
  }
  return (a + b) / 2;
}
function bisect(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 70; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (fm === 0) return m;
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
// Nullstellen von f in [x0, x1]; yTol: was als "springt" gilt (Polstellen ausschließen)
function zeros(f, x0, x1, yTol) {
  const N = 800, out = [];
  let xp = x0, yp = f(x0);
  for (let i = 1; i <= N; i++) {
    const x = x0 + (x1 - x0) * i / N, y = f(x);
    if (Number.isFinite(y) && Number.isFinite(yp)) {
      if (y === 0) out.push(x);
      else if ((y < 0) !== (yp < 0) && yp !== 0 && Math.abs(y - yp) < yTol) {
        const r = bisect(f, xp, x);
        if (Math.abs(f(r)) < 1e-6 * Math.max(1, yTol)) out.push(r);
      }
    }
    xp = x; yp = y;
  }
  return out;
}
function extrema(f, x0, x1) {
  const N = 800, xs = [], ys = [], out = [];
  for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * i / N; xs.push(x); ys.push(f(x)); }
  for (let i = 1; i < N; i++) {
    const a = ys[i - 1], b = ys[i], c = ys[i + 1];
    if (![a, b, c].every(Number.isFinite)) continue;
    const max = b > a && b >= c, min = b < a && b <= c;
    if (!max && !min) continue;
    const x = golden(f, xs[i - 1], xs[i + 1], max), y = f(x);
    // Spitzen an Polstellen oder Sprüngen ignorieren
    if (!Number.isFinite(y) || Math.abs(y - b) > Math.abs(a - c) * 4 + 1e-6) continue;
    out.push({ x, y, max });
  }
  return out;
}
function dedupe(list, tol) {
  const out = [];
  for (const p of list) if (!out.some((q) => Math.abs(q.x - p.x) < tol && Math.abs(q.y - p.y) < tol)) out.push(p);
  return out;
}

// ---------- Widget ----------
// mode 'page': eigene Werkzeug-Seite. mode 'sheet': im Heft-Editor, mit Knopf „In die Seite zeichnen“.
export function plotWidget(root, { onInsert } = {}) {
  const st = Object.assign(DEFAULT(), store.get('plot', null) || {});
  const save = () => store.set('plot', st);
  let compiled = [];           // [{ f, err, name, color, on }]
  let points = [];             // Analyse-Punkte
  let sel = null;              // gewählter Punkt { x, y, label, color }
  let lastFocus = null;

  const canvas = h('canvas.plotcv');
  const tip = h('div.plottip', { hidden: true });
  const zoomBtn = (ic, label, fn) => h('button.plotbtn', { 'aria-label': label, title: label, on: { click: fn } }, typeof ic === 'string' && ic.length === 1 ? h('b', { text: ic }) : icon(ic));
  const tools = h('div.plottools', null,
    zoomBtn('+', 'Hineinzoomen', () => zoomAt(1.5)),
    zoomBtn('−', 'Herauszoomen', () => zoomAt(1 / 1.5)),
    zoomBtn('auto', 'Standardansicht', () => { st.view = { cx: 0, cy: 0, s: 40 }; save(); draw(); }));
  const stage = h('div.plotstage', null, canvas, tools, tip);

  const list = h('div.plotfns');
  const sliders = h('div.plotsliders');
  const analysis = h('div.plotpts');
  const keys = h('div.plotkeys', null, ...[['x', 'x'], ['x²', '^2'], ['xⁿ', '^'], ['√', 'sqrt('], ['(', '('], [')', ')'], ['π', 'π'], ['sin', 'sin('], ['cos', 'cos('], ['·', '·'], ['/', '/'], ['a', 'a']].map(([l, t]) =>
    h('button.pk', { text: l, on: { pointerdown: (e) => { e.preventDefault(); insert(t); } } })));
  const actions = h('div.plotactions', null,
    h('button.btn', { on: { click: () => tableSheet() } }, icon('list'), h('span', { text: 'Wertetabelle' })),
    onInsert
      ? h('button.btn.primary', { on: { click: () => doInsert() } }, icon('pen'), h('span', { text: 'In die Seite zeichnen' }))
      : h('button.btn.primary', { on: { click: () => toBook() } }, icon('notebook'), h('span', { text: 'Ins Heft' })));
  const panel = h('div.plotpanel', null,
    h('div.plothead', null, h('h2.section', { text: 'Funktionen' }), h('button.txt', { text: '+ Funktion', on: { click: () => addFn() } })),
    list, keys, sliders, h('h2.section', { text: 'Besondere Punkte' }), analysis, actions);
  root.append(h('div.plot' + (onInsert ? '.insheet' : ''), null, stage, panel));

  function insert(t) {
    const inp = lastFocus && lastFocus.isConnected ? lastFocus : list.querySelector('input');
    if (!inp) return;
    inp._expo.insert(t);
    inp.dispatchEvent(new Event('input'));
    inp.focus();
  }

  // ----- Liste der Funktionen -----
  function drawList() {
    list.textContent = '';
    st.fns.forEach((fn, i) => {
      const inp = h('input.plotin', { type: 'text', value: supify(fn.src), placeholder: 'z. B. 0,5x² − 3', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': `${NAMES[i]}(x)` });
      const err = h('small.ploterr');
      inp._expo = expoInput(inp);
      inp.addEventListener('focus', () => { lastFocus = inp; });
      inp.addEventListener('input', () => { fn.src = inp.value; save(); recompile(); });
      const vis = h('button.plotvis' + (fn.on ? '.on' : ''), { style: { '--c': fn.color }, 'aria-label': 'Ein- oder ausblenden', on: { click: () => { fn.on = !fn.on; save(); drawList(); recompile(); } } });
      const del = h('button.plotdel', { 'aria-label': 'Entfernen', on: { click: () => { st.fns.splice(i, 1); save(); drawList(); recompile(); } } }, icon('close'));
      list.append(h('div.plotfn' + (fn.on ? '' : '.off'), { style: { '--c': fn.color } }, vis, h('label.plotname', { text: `${NAMES[i]}(x) =` }), inp, del, err));
    });
    if (!st.fns.length) list.append(h('p.calm', { text: 'Noch keine Funktion. Tippe auf „+ Funktion“.' }));
  }
  function addFn(src = '') {
    if (st.fns.length >= NAMES.length) { toast(`Höchstens ${NAMES.length} Funktionen`); return; }
    const used = new Set(st.fns.map((f) => f.color));
    st.fns.push({ src, color: COLORS.find((c) => !used.has(c)) || COLORS[st.fns.length % COLORS.length], on: true });
    save(); drawList(); recompile();
    const ins = list.querySelectorAll('input'); ins[ins.length - 1]?.focus();
  }

  // ----- Schieberegler -----
  let anim = null;
  function drawSliders() {
    const ps = [...new Set(st.fns.flatMap((f) => paramsOf(f.src)))].sort();
    sliders.textContent = '';
    if (!ps.length) { sliders.hidden = true; return; }
    sliders.hidden = false;
    sliders.append(h('h2.section', { text: 'Schieberegler' }));
    for (const p of ps) {
      if (st.params[p] == null) st.params[p] = 1;
      const [lo, hi] = st.ranges[p] || [-5, 5];
      const val = h('b.slval', { text: `${p} = ${fmt(st.params[p], 2)}` });
      const r = h('input.slider', { type: 'range', min: String(lo), max: String(hi), step: String((hi - lo) / 200), value: String(st.params[p]), 'aria-label': `Parameter ${p}` });
      r.addEventListener('input', () => { st.params[p] = Number(r.value); val.textContent = `${p} = ${fmt(st.params[p], 2)}`; save(); refresh(); });
      const play = h('button.plotbtn.small', { 'aria-label': `${p} bewegen`, title: 'Bewegen', on: { click: () => {
        if (anim && anim.p === p) { cancelAnimationFrame(anim.id); anim = null; play.classList.remove('on'); return; }
        if (anim) cancelAnimationFrame(anim.id);
        play.classList.add('on');
        const t0 = performance.now(), v0 = st.params[p];
        const step = (t) => {
          if (!r.isConnected) { anim = null; return; }
          const ph = Math.asin(Math.max(-1, Math.min(1, ((v0 - lo) / (hi - lo)) * 2 - 1)));
          const v = lo + (hi - lo) * (Math.sin(ph + (t - t0) / 1400) + 1) / 2;
          st.params[p] = Math.round(v * 100) / 100; r.value = String(st.params[p]); val.textContent = `${p} = ${fmt(st.params[p], 2)}`;
          refresh(true);
          anim.id = requestAnimationFrame(step);
        };
        anim = { p, id: requestAnimationFrame(step) };
      } } }, icon('play'));
      const range = h('button.txt.small', { text: `${fmt(lo)} … ${fmt(hi)}`, on: { click: async () => {
        const res = await sheet(`Bereich für ${p}`, (body, close) => {
          const a = h('input.field', { type: 'text', inputmode: 'decimal', value: fmt(lo) }), b = h('input.field', { type: 'text', inputmode: 'decimal', value: fmt(hi) });
          body.append(h('div.fieldgrid', null, h('div', null, h('p.fieldlabel', { text: 'von' }), a), h('div', null, h('p.fieldlabel', { text: 'bis' }), b)),
            h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
              h('button.btn.primary', { text: 'OK', on: { click: () => { const n = (v) => parseFloat(v.replace(',', '.').replace('−', '-')); const x = n(a.value), y = n(b.value); if (Number.isFinite(x) && Number.isFinite(y) && x < y) close([x, y]); } } })));
        });
        if (res) { st.ranges[p] = res; st.params[p] = Math.min(res[1], Math.max(res[0], st.params[p])); save(); drawSliders(); refresh(); }
      } } });
      sliders.append(h('div.slrow', null, h('div.slhead', null, val, range, play), r));
    }
  }

  // ----- Rechnen -----
  function recompile() {
    compiled = st.fns.map((fn, i) => {
      if (!fn.src.trim()) return { name: NAMES[i], color: fn.color, on: false, empty: true };
      try { const f = compile(fn.src, { params: st.params }); f(0.5); return { f, name: NAMES[i], color: fn.color, on: fn.on, src: fn.src }; } catch (e) { return { err: e.message, name: NAMES[i], color: fn.color, on: false }; }
    });
    list.querySelectorAll('.plotfn').forEach((row, i) => {
      const c = compiled[i]; if (!c) return;
      row.classList.toggle('bad', !!c.err);
      row.querySelector('.ploterr').textContent = c.err || '';
    });
    drawSliders();
    refresh();
  }
  let aTimer = null;
  function refresh(fast) {
    draw();
    clearTimeout(aTimer);
    aTimer = setTimeout(() => { analyse(); draw(); }, fast ? 120 : 40);
  }
  const safe = (f) => (x) => { try { return f(x); } catch (e) { return NaN; } };
  function analyse() {
    const { x0, x1, y0, y1 } = bounds();
    const tol = (x1 - x0) / 400, yTol = (y1 - y0) * 0.6;
    const vis = compiled.filter((c) => c.on && c.f);
    const pts = [];
    for (const c of vis) {
      const f = safe(c.f);
      const ex = extrema(f, x0, x1);
      const zs = zeros(f, x0, x1, yTol).map((x) => ({ x, y: 0 }));
      for (const e of ex) if (Math.abs(e.y) < 1e-6) zs.push({ x: e.x, y: 0 });
      dedupe(zs, tol).forEach((p) => pts.push({ ...p, kind: 'zero', fn: c, label: `Nullstelle von ${c.name}` }));
      dedupe(ex, tol).forEach((p) => pts.push({ x: p.x, y: p.y, kind: p.max ? 'max' : 'min', fn: c, label: `${p.max ? 'Hochpunkt' : 'Tiefpunkt'} von ${c.name}` }));
      const y0v = f(0);
      if (x0 <= 0 && 0 <= x1 && Number.isFinite(y0v)) pts.push({ x: 0, y: y0v, kind: 'yint', fn: c, label: `${c.name} schneidet die y-Achse` });
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const f = safe(vis[i].f), g = safe(vis[j].f), d = (x) => f(x) - g(x);
      const xs = zeros(d, x0, x1, yTol);
      for (const e of extrema(d, x0, x1)) if (Math.abs(e.y) < 1e-6) xs.push(e.x);
      dedupe(xs.map((x) => ({ x, y: f(x) })), tol).forEach((p) => { if (Number.isFinite(p.y)) pts.push({ ...p, kind: 'cut', fn: vis[i], fn2: vis[j], label: `Schnittpunkt ${vis[i].name} und ${vis[j].name}` }); });
    }
    // gleiche Schnittpunkte mehrerer Paare zusammenfassen
    const tol2 = tol * 2, merged = [];
    for (const p of pts) {
      const q = p.kind === 'cut' && merged.find((m) => m.kind === 'cut' && Math.abs(m.x - p.x) < tol2 && Math.abs(m.y - p.y) < tol2);
      if (!q) { merged.push({ ...p, names: p.kind === 'cut' ? new Set([p.fn.name, p.fn2.name]) : null }); continue; }
      q.names.add(p.fn.name); q.names.add(p.fn2.name);
      const n = [...q.names]; q.label = `Schnittpunkt ${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
    }
    points = merged.slice(0, 200);
    drawPoints();
  }
  const KIND = { zero: 'Nullstellen', max: 'Hochpunkte', min: 'Tiefpunkte', cut: 'Schnittpunkte', yint: 'y-Achsenabschnitt' };
  function drawPoints() {
    analysis.textContent = '';
    if (!points.length) { analysis.append(h('p.calm', { text: 'Im sichtbaren Bereich gibt es keine besonderen Punkte.' })); return; }
    for (const k of ['zero', 'max', 'min', 'cut', 'yint']) {
      const ps = points.filter((p) => p.kind === k);
      if (!ps.length) continue;
      analysis.append(h('p.ptkind', { text: KIND[k] }));
      const row = h('div.ptchips');
      for (const p of ps) {
        row.append(h('button.ptchip' + (sel && sel.x === p.x && sel.y === p.y ? '.on' : ''), { style: { '--c': p.fn.color, '--c2': p.fn2 ? p.fn2.color : p.fn.color }, on: { click: () => select(p, true) } },
          h('i'), h('span', { text: `(${fmt(p.x)} | ${fmt(p.y)})` })));
      }
      analysis.append(row);
    }
    analysis.append(h('p.calm.small', { text: 'Gesucht wird nur im sichtbaren Bereich. Werte gerundet.' }));
  }
  function select(p, center) {
    sel = p;
    if (center) {
      const { x0, x1, y0, y1 } = bounds();
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) { st.view.cx = p.x; st.view.cy = p.y; save(); }
    }
    draw(); drawPoints();
  }

  // ----- Zeichnen -----
  let W = 0, H = 0, dpr = 1;
  function bounds() { const v = st.view; return { x0: v.cx - W / 2 / v.s, x1: v.cx + W / 2 / v.s, y0: v.cy - H / 2 / v.s, y1: v.cy + H / 2 / v.s }; }
  const px = (x) => W / 2 + (x - st.view.cx) * st.view.s;
  const py = (y) => H / 2 - (y - st.view.cy) * st.view.s;
  function draw() { drawTo(canvas.getContext('2d'), W, H, dpr, false); placeTip(); }
  function drawTo(ctx, Wd, Hd, scale, print, view = st.view) {
    const css = getComputedStyle(root);
    const col = print ? { bg: '#ffffff', grid: '#e7e8ec', grid2: '#f3f4f6', axis: '#1d1d1f', text: '#5a5a62' }
      : { bg: css.getPropertyValue('--surface').trim() || '#fff', grid: css.getPropertyValue('--plot-grid').trim() || '#e7e8ec', grid2: css.getPropertyValue('--plot-grid2').trim() || '#f3f4f6', axis: css.getPropertyValue('--ink').trim() || '#111', text: css.getPropertyValue('--muted').trim() || '#666' };
    const X = (x) => Wd / 2 + (x - view.cx) * view.s, Y = (y) => Hd / 2 - (y - view.cy) * view.s;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, Wd, Hd);
    const x0 = view.cx - Wd / 2 / view.s, x1 = view.cx + Wd / 2 / view.s, y0 = view.cy - Hd / 2 / view.s, y1 = view.cy + Hd / 2 / view.s;
    const step = niceStep(90 / view.s), minor = step / (String(step).match(/^[2]/) ? 4 : 5);
    const lines = (stp, color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
      for (let x = Math.ceil(x0 / stp) * stp; x <= x1; x += stp) { const p = Math.round(X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, Hd); }
      for (let y = Math.ceil(y0 / stp) * stp; y <= y1; y += stp) { const p = Math.round(Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(Wd, p); }
      ctx.stroke();
    };
    if (minor * view.s >= 9) lines(minor, col.grid2, 1);
    lines(step, col.grid, 1);
    // Achsen
    const ax = Math.min(Wd - 1, Math.max(0, X(0))), ay = Math.min(Hd - 1, Math.max(0, Y(0)));
    ctx.strokeStyle = col.axis; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(0, Math.round(ay) + 0.5); ctx.lineTo(Wd, Math.round(ay) + 0.5); ctx.moveTo(Math.round(ax) + 0.5, 0); ctx.lineTo(Math.round(ax) + 0.5, Hd); ctx.stroke();
    ctx.fillStyle = col.axis; ctx.beginPath();
    ctx.moveTo(Wd, ay + 0.5); ctx.lineTo(Wd - 9, ay - 4); ctx.lineTo(Wd - 9, ay + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ax + 0.5, 0); ctx.lineTo(ax - 4, 9); ctx.lineTo(ax + 5, 9); ctx.closePath(); ctx.fill();
    ctx.font = '500 12px -apple-system, "Inter", "Segoe UI", sans-serif'; ctx.fillStyle = col.text;
    // Beschriftung mit Hintergrund-Rand, damit sie auf Linien lesbar bleibt
    ctx.strokeStyle = col.bg; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    const lbl = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ly = ay + 5 > Hd - 18 ? ay - 18 : ay + 5;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { if (Math.abs(x) < step / 2) continue; const p = X(x); if (p < 12 || p > Wd - 16) continue; lbl(fmt(x, 4), p, ly); }
    ctx.textAlign = ax > Wd - 40 ? 'right' : 'left'; ctx.textBaseline = 'middle';
    const lx = ax > Wd - 40 ? ax - 6 : ax + 6;
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { if (Math.abs(y) < step / 2) continue; const p = Y(y); if (p < 14 || p > Hd - 10) continue; lbl(fmt(y, 4), lx, p); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = 'italic 600 13px Georgia, serif'; ctx.fillStyle = col.axis;
    ctx.fillText('x', Wd - 14, ay + 8 > Hd - 18 ? ay - 22 : ay + 8); ctx.fillText('y', ax + 8 > Wd - 14 ? ax - 16 : ax + 9, 4);
    if (Math.abs(X(0) - ax) < 1 && Math.abs(Y(0) - ay) < 1) { ctx.font = '500 12px -apple-system, sans-serif'; ctx.fillStyle = col.text; ctx.fillText('0', ax + 5, ay + 4); }
    // Graphen
    for (const c of compiled) {
      if (!c.on || !c.f) continue;
      ctx.strokeStyle = c.color; ctx.lineWidth = print ? 3 : 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let pen = false, prev = null;
      const N = Math.ceil(Wd * 1.5);
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * i / N;
        let y; try { y = c.f(x); } catch (e) { y = NaN; }
        if (!Number.isFinite(y)) { pen = false; prev = null; continue; }
        const p = Math.max(-1e4, Math.min(1e4, Y(y)));
        if (pen && prev != null && Math.abs(p - prev) > Hd * 1.2) pen = false;   // Polstelle
        if (pen) ctx.lineTo(X(x), p); else { ctx.moveTo(X(x), p); pen = true; }
        prev = p;
      }
      ctx.stroke();
    }
    // Legende beim Bild
    if (print) {
      ctx.font = '600 15px -apple-system, "Inter", sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      let yy = 10;
      const ps = [...new Set(compiled.filter((c) => c.on && c.f).flatMap((c) => paramsOf(c.src)))].sort();
      const rows = compiled.filter((c) => c.on && c.f).map((c) => [`${c.name}(x) = ${mathify(stripName(c.src).trim())}`, c.color]);
      if (ps.length) rows.push([ps.map((q) => `${q} = ${fmt(st.params[q] ?? 1, 2)}`).join(';  '), '#5a5a62']);
      for (const [t, color] of rows) {
        const tw = ctx.measureText(t).width;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(8, yy - 3, tw + 34, 24);
        ctx.fillStyle = color; if (color !== '#5a5a62') ctx.fillRect(14, yy + 7, 13, 3); ctx.fillText(t, 33, yy);
        yy += 25;
      }
      return;
    }
    // besondere Punkte
    for (const p of points) {
      const X1 = X(p.x), Y1 = Y(p.y);
      if (X1 < -10 || X1 > Wd + 10 || Y1 < -10 || Y1 > Hd + 10) continue;
      const on = sel && sel.x === p.x && sel.y === p.y;
      ctx.beginPath(); ctx.arc(X1, Y1, on ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? p.fn.color : col.bg; ctx.fill();
      ctx.lineWidth = 2.2; ctx.strokeStyle = p.fn.color; ctx.stroke();
    }
    if (sel && sel.kind === 'trace') {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = sel.fn.color; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(X(sel.x), Y(0)); ctx.lineTo(X(sel.x), Y(sel.y)); ctx.lineTo(X(0), Y(sel.y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(X(sel.x), Y(sel.y), 6, 0, Math.PI * 2); ctx.fillStyle = sel.fn.color; ctx.fill();
    }
  }
  function placeTip() {
    if (!sel) { tip.hidden = true; return; }
    const x = px(sel.x), y = py(sel.y);
    if (x < 0 || x > W || y < 0 || y > H) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = '';
    tip.append(h('small', { text: sel.label }), h('b', { text: `(${fmt(sel.x)} | ${fmt(sel.y)})` }));
    tip.style.setProperty('--c', sel.fn.color);
    const left = Math.min(W - 10, Math.max(10, x));
    tip.style.left = left + 'px'; tip.style.top = y + 'px';
    tip.classList.toggle('below', y < 70);
  }
  function resize() {
    // clientWidth statt getBoundingClientRect: unabhängig von der Einblend-Animation (scale)
    if (!stage.clientWidth) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    draw();
    clearTimeout(aTimer); aTimer = setTimeout(() => { analyse(); draw(); }, 60);
  }
  const ro = new ResizeObserver(resize); ro.observe(stage);

  function zoomAt(f, cx = W / 2, cy = H / 2) {
    const v = st.view;
    const wx = v.cx + (cx - W / 2) / v.s, wy = v.cy - (cy - H / 2) / v.s;
    v.s = Math.min(5000, Math.max(0.5, v.s * f));
    v.cx = wx - (cx - W / 2) / v.s; v.cy = wy + (cy - H / 2) / v.s;
    save(); refresh(true);
  }

  // ----- Finger, Pencil, Maus -----
  const ptrs = new Map();
  let gesture = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (ptrs.size === 1) gesture = { kind: 'tap', sx: e.offsetX, sy: e.offsetY, cx: st.view.cx, cy: st.view.cy };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...st.view } };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (!gesture) return;
    if (gesture.kind === 'tap' || gesture.kind === 'pan') {
      const dx = e.offsetX - gesture.sx, dy = e.offsetY - gesture.sy;
      if (gesture.kind === 'tap' && Math.hypot(dx, dy) < 6) return;
      gesture.kind = 'pan';
      st.view.cx = gesture.cx - dx / st.view.s; st.view.cy = gesture.cy + dy / st.view.s;
      draw();
    } else if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const v0 = gesture.view, s = Math.min(5000, Math.max(0.5, v0.s * d / gesture.d));
      const wx = v0.cx + (gesture.mx - W / 2) / v0.s, wy = v0.cy - (gesture.my - H / 2) / v0.s;
      st.view = { s, cx: wx - (mx - W / 2) / s, cy: wy + (my - H / 2) / s };
      draw();
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gesture && gesture.kind === 'tap' && e.type === 'pointerup') tapAt(e.offsetX, e.offsetY);
    if (gesture && gesture.kind !== 'tap') { save(); refresh(true); }
    gesture = ptrs.size ? { kind: 'none' } : null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });

  function tapAt(x, y) {
    // 1. besonderer Punkt in der Nähe?
    let best = null, bd = 22;
    for (const p of points) { const d = Math.hypot(px(p.x) - x, py(p.y) - y); if (d < bd) { bd = d; best = p; } }
    if (best) { select(best); return; }
    // 2. Kurve in der Nähe: Punkt auf dem Graphen zeigen
    const wx = st.view.cx + (x - W / 2) / st.view.s;
    let bc = null, bdist = 26;
    for (const c of compiled) {
      if (!c.on || !c.f) continue;
      let yv; try { yv = c.f(wx); } catch (e) { continue; }
      if (!Number.isFinite(yv)) continue;
      const d = Math.abs(py(yv) - y);
      if (d < bdist) { bdist = d; bc = { x: wx, y: yv, fn: c, kind: 'trace', label: `${c.name}(${fmt(wx, 2)})` }; }
    }
    if (bc) { const r = Math.round(bc.x * 100) / 100, yv = bc.fn.f(r); if (Number.isFinite(yv)) { bc.x = r; bc.y = yv; bc.label = `${bc.fn.name}(${fmt(r, 2)})`; } }
    sel = bc;
    draw(); drawPoints();
  }

  // ----- Wertetabelle -----
  function tableSheet() {
    const vis = compiled.filter((c) => c.on && c.f);
    if (!vis.length) { toast('Erst eine Funktion eintragen'); return; }
    const t = store.get('plotTable', { a: -3, b: 3, d: 0.5 });
    return sheet('Wertetabelle', (body, close) => {
      const n = (v) => parseFloat(String(v).replace(',', '.').replace('−', '-'));
      const fa = h('input.field', { type: 'text', inputmode: 'decimal', value: fmt(t.a), id: 'wtA' }), fb = h('input.field', { type: 'text', inputmode: 'decimal', value: fmt(t.b), id: 'wtB' }), fd = h('input.field', { type: 'text', inputmode: 'decimal', value: fmt(t.d), id: 'wtD' });
      const out = h('div.wtwrap');
      const make = () => {
        const a = n(fa.value), b = n(fb.value), d = n(fd.value);
        out.textContent = '';
        if (![a, b, d].every(Number.isFinite) || d <= 0 || a > b) { out.append(h('p.calm', { text: 'Bitte Start, Ende und eine Schrittweite größer 0 eintragen.' })); return; }
        if ((b - a) / d > 400) { out.append(h('p.calm', { text: 'Das wären zu viele Zeilen. Nimm eine größere Schrittweite.' })); return; }
        store.set('plotTable', { a, b, d });
        const tb = h('table.wt');
        tb.append(h('thead', null, h('tr', null, h('th', { text: 'x' }), ...vis.map((c) => h('th', { style: { color: c.color }, text: `${c.name}(x)` })))));
        const tbody = h('tbody');
        for (let i = 0; a + i * d <= b + 1e-9; i++) {
          const x = Math.round((a + i * d) * 1e9) / 1e9;
          tbody.append(h('tr', null, h('td', { text: fmt(x) }), ...vis.map((c) => { let y; try { y = c.f(x); } catch (e) { y = NaN; } return h('td', { text: Number.isFinite(y) ? fmt(y) : 'n. d.' }); })));
        }
        tb.append(tbody); out.append(tb);
      };
      [fa, fb, fd].forEach((x) => x.addEventListener('input', make));
      body.append(h('div.fieldgrid.three', null,
        h('div', null, h('label.fieldlabel', { for: 'wtA', text: 'x von' }), fa), h('div', null, h('label.fieldlabel', { for: 'wtB', text: 'bis' }), fb), h('div', null, h('label.fieldlabel', { for: 'wtD', text: 'Schritt' }), fd)),
      out, h('p.calm.small', { text: '„n. d.“ heißt: an dieser Stelle nicht definiert.' }),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
      make();
    }, { wide: true });
  }

  // ----- Als Seite in ein Heft -----
  function renderImage() {
    const Wd = 1600, Hd = 1130;
    const c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
    // gleicher Ausschnitt wie auf dem Bildschirm, alles (auch Schrift) passend vergrößert
    const k = Wd / Math.max(W, 400);
    drawTo(c.getContext('2d'), Wd / k, Hd / k, k, true, st.view);
    return c;
  }
  async function toBook() {
    if (!compiled.some((c) => c.on && c.f)) { toast('Erst eine Funktion eintragen'); return; }
    const [subjects, books] = await Promise.all([db.listSubjects(), db.listAllBooks()]);
    const target = await sheet('In welches Heft?', (body, close) => {
      if (!books.length) body.append(h('p.calm', { text: 'Leg zuerst in einem Fach ein Heft oder Buch an. Bis dahin landet das Bild im Eingang.' }));
      for (const s of subjects) {
        const bs = books.filter((b) => b.subjectId === s.id);
        if (!bs.length) continue;
        body.append(h('p.fieldlabel', { text: s.name }));
        for (const b of bs) body.append(h('button.dayrow', { style: { '--c': s.color }, on: { click: () => close(b) } }, icon(b.kind === 'notebook' ? 'notebook' : b.kind === 'folder' ? 'folder' : 'book'), h('span', null, h('b', { text: b.title }))));
      }
      body.append(h('button.dayrow', { on: { click: () => close({ id: db.INBOX_BOOK, title: 'Eingang' }) } }, icon('inbox'), h('span', null, h('b', { text: 'Eingang' }), h('small', { text: 'Später einsortieren' }))),
        h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } })));
    }, { wide: true });
    if (!target) return;
    const { compress, makeThumb } = await import('./scanner.js');
    const c = renderImage();
    const out = await compress(c);
    const thumb = await makeThumb(c);
    await db.addPage({ bookId: target.id, image: out.blob, thumb, width: out.width, height: out.height });
    toast(`Als neue Seite in „${target.title}“ gespeichert. Du kannst darauf mit dem Pencil weiterschreiben.`, 5000);
  }
  function doInsert() {
    const fns = compiled.filter((c) => c.on && c.f).map((c) => ({ f: c.f, src: c.src, color: c.color, name: c.name }));
    if (!fns.length) { toast('Erst eine Funktion eintragen'); return; }
    onInsert({ fns, bounds: bounds() });
  }

  drawList();
  recompile();
  return { destroy: () => { ro.disconnect(); if (anim) cancelAnimationFrame(anim.id); } };
}

// Im Heft-Editor: Plotter als großes Fenster. Ergebnis: { fns, bounds } oder null
export function plotterSheet() {
  let ctl = null;
  return sheet('Funktionsplotter', (body, close) => {
    ctl = plotWidget(body, { onInsert: (res) => close(res) });
  }, { wide: true }).then((r) => { ctl && ctl.destroy(); return r; });
}
