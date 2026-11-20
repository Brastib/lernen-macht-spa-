// Rechner, Teil 2: Gleichungen lösen (mit Lösungsweg) und Statistik. Alles offline, ohne eval.
import { h, icon, toast } from './ui.js';
import { compile } from './mathfn.js';
import { toFrac, fracEl, de } from './kit.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const EPS = 1e-9;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
// Zahl schön: Bruch, wenn es einen gibt, sonst Kommazahl
function num(v, { sign = false } = {}) {
  v = clean(v);
  const fr = toFrac(v, 1000);
  const s = sign && v >= 0 ? '+ ' : sign ? '− ' : '';
  if (fr) return h('span.nv', null, s, fracEl(sign ? { n: Math.abs(fr.n), d: fr.d } : fr));
  return h('span.nv', { text: s + de(sign ? Math.abs(v) : v) });
}
const txt = (v) => { v = clean(v); const fr = toFrac(v, 1000); return fr ? `${fr.n < 0 ? '−' : ''}${Math.abs(fr.n)}/${fr.d}` : de(v); };

// ================= Gleichungen =================
export function splitEq(src) {
  const s = String(src).replace(/==/g, '=');
  const parts = s.split('=');
  if (parts.length > 2) throw new Error('Bitte nur ein Gleichheitszeichen.');
  const L = parts[0].trim(), R = parts.length === 2 ? parts[1].trim() : '0';
  if (!L || !R) throw new Error('Auf beiden Seiten vom = muss etwas stehen.');
  const fl = compile(L), fr = compile(R);
  return { L, R, fl, fr, F: (x) => fl(x) - fr(x) };
}

// Ist F ein Polynom bis Grad 2? Dann a, b, c zurückgeben.
export function quadCoeffs(F) {
  const c = F(0), p1 = F(1), m1 = F(-1);
  if (![c, p1, m1].every(isFinite)) return null;
  const a = (p1 + m1 - 2 * c) / 2, b = (p1 - m1) / 2;
  for (const x of [2, -3, 0.5, 7, -11.3]) { const y = F(x); if (!isFinite(y) || !near(y, a * x * x + b * x + c, 1e-8)) return null; }
  return { a: clean(a), b: clean(b), c: clean(c) };
}

// Nullstellen numerisch suchen
export function numericRoots(F, lo = -1000, hi = 1000) {
  const roots = [];
  const add = (x) => { x = clean(Math.round(x * 1e10) / 1e10); if (!roots.some((r) => near(r, x, 1e-7))) roots.push(x); };
  const ok = (x) => { const y = F(x); return isFinite(y) && Math.abs(y) < 1e-6; };
  const scan = (a, b, n) => {
    const dx = (b - a) / n;
    let x0 = a, y0 = F(a), prevAbs = Math.abs(y0), prevPrev = Infinity;
    for (let i = 1; i <= n && roots.length < 400; i++) {
      const x1 = a + i * dx, y1 = F(x1);
      if (isFinite(y0) && isFinite(y1)) {
        if (y0 === 0) add(x0);
        else if (y0 * y1 < 0) {
          let l = x0, r = x1, fl = y0;
          for (let k = 0; k < 80; k++) { const m = (l + r) / 2, fm = F(m); if (fl * fm <= 0) r = m; else { l = m; fl = fm; } }
          const m = (l + r) / 2;
          if (ok(m)) add(m);   // kein Sprung (wie bei tan oder 1/x)
        }
        // Berührpunkt: |F| hat ein kleines Minimum ohne Vorzeichenwechsel
        const ab = Math.abs(y1);
        if (prevAbs < prevPrev && prevAbs <= ab && prevAbs < 1e-2) {
          let l = x0 - dx, r = x1;
          for (let k = 0; k < 100; k++) { const m1 = l + (r - l) * 0.382, m2 = l + (r - l) * 0.618; if (Math.abs(F(m1)) < Math.abs(F(m2))) r = m2; else l = m1; }
          const m = (l + r) / 2;
          if (Math.abs(F(m)) < 1e-9) add(m);
        }
        prevPrev = prevAbs; prevAbs = ab;
      }
      x0 = x1; y0 = y1;
    }
  };
  scan(-20, 20, 8000);
  scan(lo, hi, 40000);
  return roots.sort((a, b) => a - b);
}

export function solveEq(src) {
  const { L, R, F } = splitEq(src);
  const q = quadCoeffs(F);
  const steps = [];
  if (q) {
    const { a, b, c } = q;
    if (Math.abs(a) < EPS && Math.abs(b) < EPS) {
      return { kind: 'const', sol: Math.abs(c) < EPS ? 'all' : 'none', steps: [['Alles auf eine Seite', `${txt(c)} = 0`]] };
    }
    if (Math.abs(a) < EPS) {
      const x = -c / b;
      steps.push(['Alles auf eine Seite', `${poly(0, b, c)} = 0`]);
      if (c) steps.push([`${c > 0 ? '−' : '+'} ${txt(Math.abs(c))} auf beiden Seiten`, `${coef(b)}x = ${txt(-c)}`]);
      if (b !== 1) steps.push([`: ${txt(b)} auf beiden Seiten`, `x = ${txt(x)}`]);
      return { kind: 'linear', a, b, c, sol: [clean(x)], steps };
    }
    const p = b / a, qq = c / a;
    steps.push(['Alles auf eine Seite', `${poly(a, b, c)} = 0`]);
    if (a !== 1) steps.push([`: ${txt(a)} (Normalform)`, `${poly(1, p, qq)} = 0`]);
    steps.push(['p-q-Formel', `p = ${txt(p)}, q = ${txt(qq)}  →  x = −p/2 ± √((p/2)² − q)`]);
    const D = (p / 2) ** 2 - qq;
    steps.push(['Unter der Wurzel', `(p/2)² − q = ${txt(D)}`]);
    let sol;
    if (D < -1e-12) { steps.push(['D < 0', 'Aus einer negativen Zahl gibt es keine Wurzel, also keine Lösung.']); sol = []; }
    else if (Math.abs(D) <= 1e-12) { steps.push(['D = 0', `Genau eine Lösung: x = −p/2 = ${txt(-p / 2)}`]); sol = [clean(-p / 2)]; }
    else { const r = Math.sqrt(D); steps.push(['D > 0', `x = ${txt(-p / 2)} ± ${Number.isInteger(clean(r)) || toFrac(r, 1000) ? txt(r) : '√' + txt(D) + ' ≈ ' + de(r)}`]); sol = [clean(-p / 2 - r), clean(-p / 2 + r)]; }
    return { kind: 'quad', a, b, c, D, sol, steps };
  }
  let sol = numericRoots(F), more = 0;
  if (sol.length > 12) { more = sol.length - 12; sol = [...sol].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 12).sort((a, b) => a - b); }
  return { kind: 'numeric', sol, more, steps: [['Näherung', 'Keine lineare oder quadratische Gleichung. Die Lösungen sind schrittweise angenähert (gesucht zwischen −1000 und 1000, Winkel im Bogenmaß).']], L, R };
}
const coef = (v) => (v === 1 ? '' : v === -1 ? '−' : txt(v));
function poly(a, b, c) {
  const parts = [];
  const term = (v, s) => { if (Math.abs(v) < EPS) return; const neg = v < 0, av = Math.abs(v); const body = s ? (av === 1 ? s : txt(av) + s) : txt(av); parts.push(parts.length ? (neg ? '− ' : '+ ') + body : (neg ? '−' : '') + body); };
  term(a, 'x²'); term(b, 'x'); term(c, '');
  return parts.join(' ') || '0';
}

// Lineares Gleichungssystem (Gauß)
export function solveSystem(A, bvec) {
  const n = A.length, M = A.map((r, i) => [...r, bvec[i]]);
  let rank = 0;
  const piv = [];
  for (let col = 0; col < n && rank < n; col++) {
    let best = rank;
    for (let r = rank + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    if (Math.abs(M[best][col]) < 1e-12) continue;
    [M[rank], M[best]] = [M[best], M[rank]];
    for (let r = 0; r < n; r++) {
      if (r === rank) continue;
      const f = M[r][col] / M[rank][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[rank][k];
    }
    piv.push(col); rank++;
  }
  for (let r = rank; r < n; r++) if (Math.abs(M[r][n]) > 1e-9) return { kind: 'none' };
  if (rank < n) return { kind: 'many' };
  const x = new Array(n);
  piv.forEach((col, r) => { x[col] = clean(M[r][n] / M[r][col]); });
  return { kind: 'one', x };
}

const VARS3 = ['x', 'y', 'z'];
export function eqWidget(root) {
  let mode = store.get('eqMode', 'one');
  const seg = h('div.seg.eqseg');
  const body = h('div.eqbody');
  for (const [k, l] of [['one', 'Eine Gleichung'], ['sys2', '2 Unbekannte'], ['sys3', '3 Unbekannte']]) {
    seg.append(h('button' + (k === mode ? '.on' : ''), { text: l, on: { click: (e) => { mode = k; store.set('eqMode', k); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw(); } } }));
  }
  root.append(h('div.eqwrap', null, seg, body));
  const draw = () => { body.textContent = ''; if (mode === 'one') oneEq(body); else sysEq(body, mode === 'sys2' ? 2 : 3); };
  draw();
}

function oneEq(root) {
  const inp = h('input.field.eqin', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'z. B. x² − 5x + 6 = 0', 'aria-label': 'Gleichung' });
  inp.value = store.get('eqLast', '');
  const res = h('div.eqres');
  const ins = (t, back = 0) => { const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length; inp.setRangeText(t, s, e, 'end'); if (back) inp.setSelectionRange(inp.selectionEnd - back, inp.selectionEnd - back); inp.focus(); run(); };
  const keys = h('div.eqkeys', null, ...[['x', 'x'], ['x²', '^2'], ['xʸ', '^'], ['√', 'sqrt()', 1], ['(', '('], [')', ')'], ['=', ' = '], ['·', '·'], ['/', '/']].map(([l, t, b]) =>
    h('button.ck.sci', { text: l, on: { pointerdown: (e) => { e.preventDefault(); ins(t, b || 0); } } })));
  const ex = h('div.chips.left', null, ...['2x + 3 = 11', 'x² − 5x + 6 = 0', '3(x − 2) = x + 4', 'x² + 2x + 5 = 0', '2^x = 8', 'x³ = 2x + 1'].map((t) =>
    h('button.pchip.small', { text: t, on: { click: () => { inp.value = t; run(); } } })));
  let tm;
  function run() {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const v = inp.value.trim(); store.set('eqLast', v);
      res.textContent = '';
      if (!v) return;
      try { if (!/x/i.test(v)) throw new Error('In der Gleichung muss ein x vorkommen.'); res.append(eqResult(solveEq(v), v)); }
      catch (e) { res.append(h('p.eqerr', { text: e.message })); }
    }, 180);
  }
  inp.addEventListener('input', run);
  root.append(h('div.eqcard', null, inp, keys), h('p.fieldlabel', { text: 'Beispiele' }), ex, res);
  run();
}

function eqResult(r, src) {
  const box = h('div.eqout');
  const sol = h('div.eqsol');
  if (r.sol === 'all') sol.append(h('b', { text: 'Jede Zahl ist eine Lösung' }), h('small', { text: 'Beide Seiten sind immer gleich.' }));
  else if (r.sol === 'none' || (Array.isArray(r.sol) && !r.sol.length)) sol.append(h('b', { text: 'Keine Lösung' }), h('small', { text: r.kind === 'numeric' ? 'Im Bereich −1000 bis 1000 nichts gefunden.' : 'L = { }' }));
  else {
    const list = r.sol;
    list.forEach((x, i) => sol.append(h('div.solrow', null, h('span', { text: list.length > 1 ? `x${'₁₂₃₄₅₆₇₈₉'[i] || ''} =` : 'x =' }), num(x), r.kind === 'numeric' || !toFrac(x, 1000) ? null : h('small', { text: '≈ ' + de(x) }))));
    if (r.more) sol.append(h('small', { text: `Es gibt noch ${r.more} weitere Lösungen. Gezeigt sind die 12, die am nächsten an 0 liegen.` }));
    sol.append(h('small.eqL', { text: `L = { ${list.map((x) => txt(x)).join('; ')}${r.more ? '; …' : ''} }` }));
  }
  box.append(h('p.fieldlabel', { text: r.kind === 'quad' ? 'Quadratische Gleichung' : r.kind === 'linear' ? 'Lineare Gleichung' : 'Lösung' }), sol);
  if (r.steps.length) {
    const st = h('ol.eqsteps');
    for (const [a, b] of r.steps) st.append(h('li', null, h('small', { text: a }), h('span', { text: b })));
    box.append(h('p.fieldlabel', { text: 'Lösungsweg' }), st);
  }
  if (Array.isArray(r.sol) && r.sol.length) {
    const { fl, fr } = splitEq(src);
    const x = r.sol[0];
    box.append(h('p.calm.small', { text: `Probe mit x = ${txt(x)}: links ${de(fl(x))}, rechts ${de(fr(x))}` }));
  }
  return box;
}

function sysEq(root, n) {
  const key = 'eqSys' + n;
  const saved = store.get(key, null);
  const vars = VARS3.slice(0, n);
  const cells = [];
  const grid = h('div.sysgrid', { style: { '--n': n } });
  const def = n === 2 ? [[2, 1, 7], [1, -1, 2]] : [[1, 1, 1, 6], [2, -1, 1, 3], [1, 2, -1, 2]];
  for (let r = 0; r < n; r++) {
    const row = [];
    grid.append(h('span.sysno', { text: `(${['I', 'II', 'III'][r]})` }));
    for (let c = 0; c <= n; c++) {
      const v = saved ? saved[r][c] : def[r][c];
      const inp = h('input.field.sysin', { type: 'text', inputmode: 'decimal', value: String(v).replace('.', ','), 'aria-label': c < n ? `Zahl vor ${vars[c]} in Zeile ${r + 1}` : `Rechte Seite Zeile ${r + 1}` });
      inp.addEventListener('input', run);
      row.push(inp);
      grid.append(inp, h('span.sysop', { text: c < n - 1 ? `${vars[c]}  +` : c === n - 1 ? `${vars[c]}  =` : '' }));
    }
    cells.push(row);
  }
  const res = h('div.eqres');
  function run() {
    res.textContent = '';
    const val = cells.map((row) => row.map((i) => { const t = i.value.trim().replace(',', '.').replace('−', '-'); if (t === '' || t === '-') return NaN; try { return compile(t)(0); } catch (e) { return NaN; } }));
    if (val.flat().some((v) => !isFinite(v))) { res.append(h('p.eqerr', { text: 'Bitte in jedes Feld eine Zahl schreiben (auch 0 oder 1).' })); return; }
    store.set(key, val);
    const r = solveSystem(val.map((row) => row.slice(0, n)), val.map((row) => row[n]));
    const sol = h('div.eqsol');
    if (r.kind === 'none') sol.append(h('b', { text: 'Keine Lösung' }), h('small', { text: 'Die Gleichungen widersprechen sich (z. B. parallele Geraden).' }));
    else if (r.kind === 'many') sol.append(h('b', { text: 'Unendlich viele Lösungen' }), h('small', { text: 'Mindestens eine Gleichung sagt dasselbe wie eine andere.' }));
    else {
      r.x.forEach((x, i) => sol.append(h('div.solrow', null, h('span', { text: `${vars[i]} =` }), num(x), toFrac(x, 1000) ? h('small', { text: '≈ ' + de(x) }) : null)));
      sol.append(h('small.eqL', { text: `L = { (${r.x.map(txt).join(' | ')}) }` }));
    }
    res.append(h('div.eqout', null, h('p.fieldlabel', { text: 'Lösung' }), sol, h('p.calm.small', { text: 'Gerechnet mit dem Gauß-Verfahren (Additionsverfahren).' })));
  }
  root.append(h('div.eqcard', null, grid), res);
  run();
}

// ================= Statistik =================
export function parseNumbers(text) {
  let s = String(text).replace(/[−–]/g, '-').trim();
  if (!s) return [];
  // Nur Kommas, keine Leerzeichen: dann sind Kommas Trenner („1,2,3“). Sonst ist das Komma ein Dezimalkomma.
  const hasSpace = /[\s;]/.test(s);
  const parts = hasSpace ? s.split(/[\s;]+/) : (s.match(/,/g) || []).length > 1 ? s.split(',') : [s];
  return parts.filter(Boolean).map((p) => Number(p.replace(',', '.'))).filter((v) => isFinite(v));
}
const median = (a) => { const n = a.length, m = Math.floor(n / 2); return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
export function stats(values) {
  const a = [...values].sort((x, y) => x - y), n = a.length;
  if (!n) return null;
  const sum = a.reduce((s, v) => s + v, 0), mean = sum / n;
  const ss = a.reduce((s, v) => s + (v - mean) ** 2, 0);
  const lower = a.slice(0, Math.floor(n / 2)), upper = a.slice(Math.ceil(n / 2));
  const cnt = new Map(); for (const v of a) cnt.set(v, (cnt.get(v) || 0) + 1);
  const maxC = Math.max(...cnt.values());
  const modes = maxC > 1 ? [...cnt].filter(([, c]) => c === maxC).map(([v]) => v) : [];
  return { a, n, sum, mean, median: median(a), min: a[0], max: a[n - 1], range: a[n - 1] - a[0],
    q1: n > 1 ? median(lower) : a[0], q3: n > 1 ? median(upper) : a[0], varP: ss / n, sdP: Math.sqrt(ss / n), varS: n > 1 ? ss / (n - 1) : NaN, sdS: n > 1 ? Math.sqrt(ss / (n - 1)) : NaN, modes, cnt };
}

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const k of kids) e.append(k); return e; };
const stext = (x, y, t, cls, anchor = 'middle') => { const e = sv('text', { x, y, class: cls, 'text-anchor': anchor }); e.textContent = t; return e; };

function boxplot(st) {
  const W = 380, H = 112, pad = 22, lo = st.min, hi = st.max === st.min ? st.min + 1 : st.max;
  const X = (v) => pad + (v - lo) / (hi - lo) * (W - 2 * pad);
  const y = 50;
  const g = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'statsvg', role: 'img', 'aria-label': 'Boxplot' });
  g.append(
    sv('line', { x1: X(st.min), x2: X(st.q1), y1: y, y2: y, class: 'bpw' }), sv('line', { x1: X(st.q3), x2: X(st.max), y1: y, y2: y, class: 'bpw' }),
    sv('line', { x1: X(st.min), x2: X(st.min), y1: y - 14, y2: y + 14, class: 'bpw' }), sv('line', { x1: X(st.max), x2: X(st.max), y1: y - 14, y2: y + 14, class: 'bpw' }),
    sv('rect', { x: X(st.q1), y: y - 24, width: Math.max(1, X(st.q3) - X(st.q1)), height: 48, rx: 6, class: 'bpbox' }),
    sv('line', { x1: X(st.median), x2: X(st.median), y1: y - 24, y2: y + 24, class: 'bpmed' }),
    sv('circle', { cx: X(st.mean), cy: y, r: 4, class: 'bpmean' }));
  // Beschriftungen, die sich nicht überlappen
  const labels = [[st.min, 'Min'], [st.q1, 'Q1'], [st.median, 'Med'], [st.q3, 'Q3'], [st.max, 'Max']];
  let lastX = -Infinity;
  for (const [v, l] of labels) {
    const x = X(v);
    if (x - lastX < 40) continue;
    g.append(stext(x, y + 46, de(v), 'bpnum'), stext(x, y - 32, l, 'bplab'));
    lastX = x;
  }
  return g;
}
function freqChart(st) {
  let bins;
  if (st.cnt.size <= 16) bins = [...st.cnt].map(([v, c]) => ({ label: de(v), c }));
  else {
    const k = Math.min(10, Math.ceil(Math.sqrt(st.n))), w = (st.max - st.min) / k || 1;
    bins = Array.from({ length: k }, (_, i) => ({ label: de(st.min + i * w), c: 0 }));
    for (const v of st.a) bins[Math.min(k - 1, Math.floor((v - st.min) / w))].c++;
  }
  const W = 380, H = 170, pb = 26, pt = 18, bw = (W - 20) / bins.length, maxC = Math.max(...bins.map((b) => b.c));
  const g = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'statsvg', role: 'img', 'aria-label': 'Häufigkeiten' });
  g.append(sv('line', { x1: 10, x2: W - 10, y1: H - pb, y2: H - pb, class: 'axis' }));
  const showEvery = Math.ceil(bins.length / 8);
  bins.forEach((b, i) => {
    const hh = (H - pb - pt) * b.c / maxC, x = 10 + i * bw + bw * 0.14, w = bw * 0.72;
    g.append(sv('rect', { x, y: H - pb - hh, width: w, height: Math.max(0, hh), rx: Math.min(6, w / 3), class: 'bar' }));
    if (b.c) g.append(stext(x + w / 2, H - pb - hh - 5, String(b.c), 'barnum'));
    if (i % showEvery === 0) g.append(stext(x + w / 2, H - 9, b.label, 'barlab'));
  });
  return g;
}

export function statWidget(root) {
  const ta = h('textarea.field.area.statin', { rows: 3, placeholder: 'Zahlen mit Leerzeichen trennen, z. B. 2 3 3 5 1,5 4\n(Komma ist Dezimalkomma)', 'aria-label': 'Zahlen' });
  ta.value = store.get('statLast', '3 4 4 5 2 3 4 6 1 4');
  const res = h('div.statres');
  const ex = h('div.chips.left', null, ...[['Noten', '2 3 1 4 2 3 3 5 2 1 3 2'], ['Körpergröße', '1,62 1,75 1,68 1,80 1,71 1,59 1,77'], ['Würfeln', '6 2 3 6 1 4 5 6 2 3 3 1 4 6 5']].map(([l, v]) =>
    h('button.pchip.small', { text: l, on: { click: () => { ta.value = v; run(); } } })));
  function run() {
    store.set('statLast', ta.value);
    res.textContent = '';
    const vals = parseNumbers(ta.value);
    if (!vals.length) { res.append(h('p.calm', { text: 'Gib mindestens eine Zahl ein.' })); return; }
    const st = stats(vals);
    const tile = (label, v, sub) => h('div.stile', null, h('small', { text: label }), typeof v === 'number' ? num(v) : h('b', { text: v }), sub ? h('em', { text: sub }) : null);
    res.append(
      h('div.stgrid', null,
        tile('Anzahl n', st.n), tile('Summe', st.sum), tile('Mittelwert x̄', de(st.mean, 6), toFrac(st.mean, 1000) ? '= ' + txt(st.mean) : null), tile('Median', st.median),
        tile('Modus', st.modes.length ? st.modes.slice(0, 4).map((v) => de(v)).join('; ') + (st.modes.length > 4 ? ' …' : '') : '—', st.modes.length ? null : 'kein Wert öfter'),
        tile('Minimum', st.min), tile('Maximum', st.max), tile('Spannweite', st.range),
        tile('Unteres Quartil Q1', st.q1), tile('Oberes Quartil Q3', st.q3),
        tile('Standardabw. σ', de(st.sdP, 4), 'alle Werte (÷ n)'), tile('Standardabw. s', st.n > 1 ? de(st.sdS, 4) : '—', 'Stichprobe (÷ n−1)')),
      h('div.stcharts', null,
        h('div.stchart', null, h('p.fieldlabel', { text: 'Boxplot' }), boxplot(st), h('p.calm.small', { text: 'Kasten = mittlere Hälfte (Q1 bis Q3), Strich = Median, Punkt = Mittelwert.' })),
        h('div.stchart', null, h('p.fieldlabel', { text: st.cnt.size <= 16 ? 'Häufigkeiten' : 'Häufigkeiten (in Klassen)' }), freqChart(st))),
      h('p.fieldlabel', { text: 'Sortiert' }), h('p.stsorted', { text: st.a.map((v) => de(v)).join('  ·  ') }),
      h('p.calm.small', { text: `Varianz: ${de(st.varP, 4)} (÷ n), ${st.n > 1 ? de(st.varS, 4) : '—'} (÷ n−1). Quartile: Median der unteren und oberen Hälfte.` }));
  }
  let tm; ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 200); });
  root.append(h('div.eqcard', null, ta, ex), res);
  run();
}
