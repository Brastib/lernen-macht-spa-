// Schulrechner mit Anzeige wie im Heft: Brüche übereinander, Wurzeln, Hochzahlen hochgestellt.
// Eingabe als kleiner Baum (Zeilen mit Zeichen und Bausteinen), Cursor mit Pfeiltasten oder Antippen.
// Eigener Rechenkern (kein eval). Ergebnis exakt (Bruch, Wurzel, π) oder als Kommazahl, auch ·10ⁿ und ENG.
import { h, toast, menu } from './ui.js';
import { supify, unsup } from './mathfn.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
export const VARS = ['a', 'b', 'c', 'd', 'x', 'y', 'm'];

// ================= Baum =================
// Zeile = Array von Knoten. Knoten: {t:'c', v} Zeichen · {t:'f', v} Funktion mit offener Klammer · Bausteine mit Kästchen
const SLOTS = { frac: ['a', 'b'], sqrt: ['a'], root: ['n', 'a'], pow: ['a'], E: ['a'], abs: ['a'], logb: ['n', 'a'] };
const C = (v) => ({ t: 'c', v });
const F = (v) => ({ t: 'f', v });
const S = (t, init = {}) => { const n = { t }; for (const k of SLOTS[t]) n[k] = init[k] || []; return n; };
const isS = (n) => !!(n && SLOTS[n.t]);
const digits = (s) => [...String(s)].map((c) => C(c === '.' ? ',' : c === '-' ? '−' : c));
const FN = {
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
  log: 'log', ln: 'ln', sqrt: '√', abs: 'Abs',
};

// Eltern jeder Zeile finden (Bäume sind klein, daher jedes Mal neu)
function parents(root) {
  const m = new Map();
  const walk = (row) => { row.forEach((n, i) => { if (isS(n)) for (const k of SLOTS[n.t]) { m.set(n[k], { node: n, key: k, row, i }); walk(n[k]); } }); };
  walk(root);
  return m;
}

// ================= Rechnen =================
class CalcErr extends Error {}
const fact = (v) => { if (!Number.isInteger(v) || v < 0) throw new CalcErr('Mathe-Fehler: n! geht nur mit 0, 1, 2, 3 …'); if (v > 170) return Infinity; let r = 1; for (let i = 2; i <= v; i++) r *= i; return r; };
function powf(a, b) {
  if (a < 0 && !Number.isInteger(b)) {
    const inv = 1 / b, ri = Math.round(inv);
    if (Math.abs(inv - ri) < 1e-9 && ri % 2 !== 0) return -Math.pow(-a, b);   // ungerade Wurzel aus negativer Zahl
  }
  return Math.pow(a, b);
}
function rootf(n, a) {
  if (a < 0 && Number.isInteger(n) && n % 2 !== 0) return -Math.pow(-a, 1 / n);
  return Math.pow(a, 1 / n);
}
const R = Math.PI / 180;
function trig(f, v, deg) {
  if (deg && Number.isInteger(v / 90) && ['sin', 'cos', 'tan'].includes(f)) {
    const k = ((v / 90) % 4 + 4) % 4;
    if (f === 'sin') return [0, 1, 0, -1][k];
    if (f === 'cos') return [1, 0, -1, 0][k];
    if (k % 2) throw new CalcErr('Mathe-Fehler: tan von 90° gibt es nicht.');
    return 0;
  }
  const x = deg && ['sin', 'cos', 'tan'].includes(f) ? v * R : v;
  let r = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan }[f](x);
  if (deg && f[0] === 'a') r /= R;
  return Math.abs(r) < 1e-14 ? 0 : r;
}
function applyFn(f, v, env) {
  switch (f) {
    case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'atan': return trig(f, v, env.deg);
    case 'sinh': return Math.sinh(v); case 'cosh': return Math.cosh(v); case 'tanh': return Math.tanh(v);
    case 'asinh': return Math.asinh(v); case 'acosh': return Math.acosh(v); case 'atanh': return Math.atanh(v);
    case 'log': return Math.log10(v); case 'ln': return Math.log(v); case 'sqrt': return Math.sqrt(v); case 'abs': return Math.abs(v);
  }
  throw new CalcErr('Syntax-Fehler');
}
const startsAtom = (n) => !!n && (n.t === 'f' || n.t === 'E' || (isS(n) && n.t !== 'pow') || (n.t === 'c' && /^[0-9,(πe]$|^Ans$|^[a-dxym]$/.test(n.v)));

export function evaluate(row, env) {
  if (!row.length) throw new CalcErr('Ein Kästchen ist noch leer.');
  let i = 0;
  const at = () => row[i];
  const isC = (n, v) => n && n.t === 'c' && n.v === v;
  const sub = (r) => evaluate(r, env);
  const close = () => { if (isC(at(), ')')) i++; else if (at()) throw new CalcErr('Syntax-Fehler: Klammer fehlt.'); };
  function expr() {
    let v = term();
    while (isC(at(), '+') || isC(at(), '−')) { const o = row[i++].v; const r = term(); v = o === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      const n = at();
      if (isC(n, '×') || isC(n, '÷')) { i++; const r = unary(); if (n.v === '÷' && r === 0) throw new CalcErr('Mathe-Fehler: Durch 0 teilen geht nicht.'); v = n.v === '×' ? v * r : v / r; }
      else if (startsAtom(n)) v *= unary();     // 2π, 3(4+1), 2√3
      else break;
    }
    return v;
  }
  function unary() {
    if (isC(at(), '−')) { i++; return -unary(); }
    if (isC(at(), '+')) { i++; return unary(); }
    return power();
  }
  function power() {
    let v = atom();
    for (;;) {
      const n = at();
      if (!n) break;
      if (n.t === 'pow') { i++; v = powf(v, sub(n.a)); }
      else if (n.t === 'E') { i++; v *= 10 ** sub(n.a); }
      else if (isC(n, '!')) { i++; v = fact(v); }
      else if (isC(n, '%')) { i++; v /= 100; }
      else break;
    }
    return v;
  }
  function atom() {
    const n = at();
    if (!n) throw new CalcErr('Syntax-Fehler: Da fehlt noch etwas.');
    if (n.t === 'c' && /[0-9,]/.test(n.v)) {
      let s = '';
      while (at() && at().t === 'c' && /[0-9,]/.test(at().v)) s += row[i++].v;
      if ((s.match(/,/g) || []).length > 1 || s === ',') throw new CalcErr('Syntax-Fehler: Zahl mit zwei Kommas.');
      return parseFloat(s.replace(',', '.'));
    }
    i++;
    if (n.t === 'E') return 10 ** sub(n.a);
    if (n.t === 'pow') throw new CalcErr('Syntax-Fehler: Vor der Hochzahl fehlt die Grundzahl.');
    if (n.t === 'f') { const v = expr(); close(); return applyFn(n.v, v, env); }
    if (n.t === 'frac') { const b = sub(n.b); if (b === 0) throw new CalcErr('Mathe-Fehler: Durch 0 teilen geht nicht.'); return sub(n.a) / b; }
    if (n.t === 'sqrt') return Math.sqrt(sub(n.a));
    if (n.t === 'root') return rootf(sub(n.n), sub(n.a));
    if (n.t === 'abs') return Math.abs(sub(n.a));
    if (n.t === 'logb') return Math.log(sub(n.a)) / Math.log(sub(n.n));
    if (n.t === 'c') {
      if (n.v === '(') { const v = expr(); close(); return v; }
      if (n.v === 'π') return Math.PI;
      if (n.v === 'e') return Math.E;
      if (n.v === 'Ans') return env.ans;
      if (VARS.includes(n.v)) { if (env.vars[n.v] === undefined) throw new CalcErr(`${n.v.toUpperCase()} hat noch keinen Wert. Speichern mit SHIFT + RCL (STO).`); return env.vars[n.v]; }
      if (n.v === ')') throw new CalcErr('Syntax-Fehler: Eine Klammer zu viel.');
    }
    throw new CalcErr('Syntax-Fehler: Da fehlt eine Zahl.');
  }
  const v = expr();
  if (i < row.length) throw new CalcErr(isC(at(), ')') ? 'Syntax-Fehler: Eine Klammer zu viel.' : 'Syntax-Fehler');
  return v;
}
export function calc(row, env) {
  const v = evaluate(row, env);
  if (!isFinite(v)) throw new CalcErr(isNaN(v) ? 'Mathe-Fehler: Das geht nicht (z. B. Wurzel aus einer negativen Zahl).' : 'Mathe-Fehler: Die Zahl ist zu groß.');
  return v === 0 ? 0 : parseFloat(v.toPrecision(15));
}

// ================= Ergebnis darstellen =================
function ratio(x, maxDen, tol = 1e-11) {
  if (!isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1, v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v;
  for (let k = 0; k < 40; k++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (k1 > maxDen) return null;
    if (Math.abs(v - h1 / k1) <= tol * Math.max(1, v)) return { n: sign * h1, d: k1 };
    if (b - a < 1e-13) break;
    b = 1 / (b - a);
  }
  return null;
}
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
// Exakte Form: Bruch, k·√m / q oder k·π / q. null = nur Kommazahl
export function exact(v) {
  if (Number.isInteger(v) || Math.abs(v) > 1e9 || Math.abs(v) < 1e-6) return null;
  const fr = ratio(v, 10000);
  if (fr) return fr.d === 1 ? null : { kind: 'frac', n: fr.n, d: fr.d };
  const sq = ratio(v * v, 1000);
  if (sq && sq.n <= 1e6) {
    let r = sq.n * sq.d, k = 1;                         // √(p/q) = √(p·q) / q
    for (let f = 2; f * f <= r; f++) while (r % (f * f) === 0) { r /= f * f; k *= f; }
    let q = sq.d; const g = gcd(k, q); k /= g; q /= g;
    if (r > 1 && r <= 100000) return { kind: 'surd', s: v < 0 ? -1 : 1, k, m: r, q };
  }
  const pi = ratio(v / Math.PI, 100);
  if (pi && Math.abs(pi.n) <= 1000) return { kind: 'pi', n: pi.n, d: pi.d };
  return null;
}
const trimNum = (x, sig = 10) => String(parseFloat(x.toPrecision(sig))).replace('.', ',');
// Kommazahl als Baum; sehr groß/klein als Mantisse ·10ⁿ. eng = Hochzahl fest vorgeben (ENG)
export function decTree(v, eng = null, sig = 10) {
  const neg = v < 0, a = Math.abs(v);
  const out = neg ? [C('−')] : [];
  let e = null;
  if (eng != null) e = eng;
  else if (a !== 0 && (a >= 1e10 || a < 1e-4)) e = Math.floor(Math.log10(a));
  if (e == null) return out.concat(digits(trimNum(a, sig)));
  let m = a / 10 ** e;
  if (eng == null && parseFloat(m.toPrecision(10)) >= 10) { m /= 10; e += 1; }
  return out.concat(digits(trimNum(m, sig)), [S('E', { a: digits(String(e)) })]);
}
function exactTree(x) {
  const sign = (n) => (n < 0 ? [C('−')] : []);
  if (x.kind === 'frac') return sign(x.n).concat([S('frac', { a: digits(Math.abs(x.n)), b: digits(x.d) })]);
  let top;
  if (x.kind === 'surd') top = (x.k > 1 ? digits(x.k) : []).concat([S('sqrt', { a: digits(x.m) })]);
  else top = (Math.abs(x.n) > 1 ? digits(Math.abs(x.n)) : []).concat([C('π')]);
  const s = x.kind === 'surd' ? x.s : Math.sign(x.n);
  const q = x.kind === 'surd' ? x.q : x.d;
  return sign(s).concat(q > 1 ? [S('frac', { a: top, b: digits(q) })] : top);
}
// Text: 6,674·10⁻¹¹ (für Verlauf und „aufs Blatt“)
export function numText(v, sig = 10) {
  if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'Fehler';
  return lin(decTree(v, null, sig));
}
const wrap = (s) => (/^[0-9,]+$|^[a-zA-Zπ]$/.test(s) ? s : '(' + s + ')');
// Baum als eine Zeile Text (mit hochgestellten Zahlen)
export function lin(row) {
  const raw = (r) => r.map((n) => {
    switch (n.t) {
      case 'c': return n.v === '×' ? '·' : n.v === '÷' ? ':' : n.v;
      case 'f': return FN[n.v] + '(';
      case 'frac': return wrap(raw(n.a)) + '/' + wrap(raw(n.b));
      case 'sqrt': return '√' + wrap(raw(n.a));
      case 'root': return '^(' + raw(n.n) + ')√' + wrap(raw(n.a));
      case 'pow': return '^(' + raw(n.a) + ')';
      case 'E': return '·10^(' + raw(n.a) + ')';
      case 'abs': return '|' + raw(n.a) + '|';
      case 'logb': return 'log_' + wrap(raw(n.n)) + '(' + raw(n.a) + ')';
      default: return '';
    }
  }).join('');
  return supify(raw(row));
}
// Text (Tastatur, Stift, alter Verlauf) -> Baum
export function fromText(text) {
  let s = unsup(String(text)).replace(/\s+/g, '').replace(/[*·×]/g, '×').replace(/[/:÷]/g, '÷').replace(/[-–]/g, '−').replace(/\./g, ',');
  const words = [['arcsin', F('asin')], ['arccos', F('acos')], ['arctan', F('atan')], ['asin', F('asin')], ['acos', F('acos')], ['atan', F('atan')],
    ['sinh', F('sinh')], ['cosh', F('cosh')], ['tanh', F('tanh')], ['sin', F('sin')], ['cos', F('cos')], ['tan', F('tan')], ['sqrt', F('sqrt')], ['wurzel', F('sqrt')],
    ['abs', F('abs')], ['ln', F('ln')], ['lg', F('log')], ['log', F('log')], ['ans', C('Ans')], ['pi', C('π')]];
  let i = 0;
  const group = () => {      // ab '(' bis zur passenden ')'
    let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; }
    const g = s.slice(i + 1, j); i = j + 1; return g;
  };
  const row = [];
  while (i < s.length) {
    const c = s[i];
    if (c === '^') {
      i++;
      if (s[i] === '(') { row.push(S('pow', { a: fromText(group()) })); continue; }
      const m = /^−?[0-9,]+|^[a-zπ]/i.exec(s.slice(i));
      if (!m) throw new CalcErr('Nach ^ fehlt die Hochzahl.');
      row.push(S('pow', { a: fromText(m[0]) })); i += m[0].length; continue;
    }
    if (c === '√') { row.push(F('sqrt')); i++; if (s[i] === '(') i++; continue; }
    const low = s.slice(i).toLowerCase();
    const w = words.find(([k]) => low.startsWith(k));
    if (w) { row.push({ ...w[1] }); i += w[0].length; if (w[1].t === 'f' && s[i] === '(') i++; continue; }
    if (/[0-9,+−×÷()!%π]/.test(c)) { row.push(C(c)); i++; continue; }
    if ((c === 'e' || c === 'E') && /^[0-9,]/.test(s[i - 1] || '') && /^[+−]?[0-9]/.test(s.slice(i + 1))) {   // 5,97e24
      const m = /^[+−]?[0-9]+/.exec(s.slice(i + 1)); row.push(S('E', { a: fromText(m[0].replace('+', '')) })); i += 1 + m[0].length; continue;
    }
    if (c === 'e' || c === 'E') { row.push(C('e')); i++; continue; }
    if (VARS.includes(c.toLowerCase())) { row.push(C(c.toLowerCase())); i++; continue; }
    if (c === '=') { i++; continue; }
    throw new CalcErr(`Das Zeichen „${c}“ kenne ich nicht.`);
  }
  return row;
}

// ================= Anzeige =================
const SQRT_SVG = '<svg class="nrsvg" viewBox="0 0 10 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0.6 11.5 L2.6 10.4 L5.4 19.2 L9.6 0.8 L10 0.8" vector-effect="non-scaling-stroke"/></svg>';
// Baum -> DOM. cur = {row, i} oder null. Jedes Element merkt sich seine Stelle (__p) fürs Antippen.
function renderRow(row, cur, cls = 'nrow') {
  const el = h('span.' + cls);
  const caret = () => h('span.ncur', { 'aria-hidden': 'true' });
  if (!row.length) {
    const box = h('span.nslot'); box.__p = { row, i: 0, empty: true };
    if (cur && cur.row === row) box.append(caret());
    el.append(box); return el;
  }
  row.forEach((n, i) => {
    if (cur && cur.row === row && cur.i === i) el.append(caret());
    const ne = renderNode(n, cur); ne.__p = { row, i };
    el.append(ne);
  });
  if (cur && cur.row === row && cur.i === row.length) el.append(caret());
  return el;
}
const CHARS = { '−': '−', '×': '×', '÷': '÷', '+': '+', Ans: 'Ans' };
function renderNode(n, cur) {
  switch (n.t) {
    case 'c': {
      const op = /^[+−×÷]$/.test(n.v);
      return h('span.nc' + (op ? '.nop' : '') + (/^[a-dxym]$/.test(n.v) ? '.nvar' : '') + (n.v === 'Ans' ? '.nans' : ''), { text: CHARS[n.v] || (VARS.includes(n.v) ? n.v.toUpperCase() : n.v) });
    }
    case 'f': return h('span.nc.nfn', { text: FN[n.v] + '(' });
    case 'frac': return h('span.nfrac', null, renderRow(n.a, cur, 'nrow.nnum'), h('span.nbar'), renderRow(n.b, cur, 'nrow.nden'));
    case 'sqrt': { const e = h('span.nsqrt'); e.innerHTML = SQRT_SVG; e.append(renderRow(n.a, cur, 'nrow.nrad')); return e; }
    case 'root': { const e = h('span.nsqrt.nroot'); e.innerHTML = SQRT_SVG; e.prepend(renderRow(n.n, cur, 'nrow.nidx')); e.append(renderRow(n.a, cur, 'nrow.nrad')); return e; }
    case 'pow': return h('span.npow', null, renderRow(n.a, cur, 'nrow.nexp'), h('span.nbase'));
    case 'E': return h('span.nE', null, h('span.nc.nten', { text: '×10' }), h('span.npow', null, renderRow(n.a, cur, 'nrow.nexp'), h('span.nbase')));
    case 'abs': return h('span.nabs', null, renderRow(n.a, cur));
    case 'logb': return h('span.nlogb', null, h('span.nc.nfn', { text: 'log' }), renderRow(n.n, cur, 'nrow.nsub'), h('span.nc', { text: '(' }), renderRow(n.a, cur), h('span.nc', { text: ')' }));
  }
  return h('span');
}

// ================= Tasten =================
// [Hauptbeschriftung, SHIFT-Beschriftung, Aktion, SHIFT-Aktion, Klassen]
const BOX = '<i class="kbox"></i>';
const L = {
  frac: `<span class="kfr">${BOX}<i class="kfl"></i>${BOX}</span>`,
  sqrt: `√${BOX}`, cbrt: `<sup>3</sup>√${BOX}`, nroot: `<sup>${BOX}</sup>√${BOX}`,
  sq: 'x<sup>2</sup>', cube: 'x<sup>3</sup>', pow: `x<sup>${BOX}</sup>`, inv: 'x<sup>−1</sup>',
  logb: `log<sub>${BOX}</sub>`, tenx: '10<sup>x</sup>', ex: 'e<sup>x</sup>', E: '×10<sup>x</sup>',
};

export function sciCalc(root, { compact = false, focus = true } = {}) {
  let deg = store.get('calcDeg', true), ans = store.get('calcAns', 0), vars = store.get('calcVars', {});
  let hist = store.get('calcHist', []);
  let tree = [], cur = { row: tree, i: 0 };
  let shift = false, hyp = false, done = false, result = null, eng = null, err = '', forceDec = false;

  // ---------- Aufbau ----------
  const ind = h('div.nind');
  const exprBox = h('div.nexpr', { 'aria-label': 'Rechnung' });
  const resBox = h('div.nres', { 'aria-live': 'polite' });
  const txt = h('input.ntext', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'z. B. 6,67·10^-11 · 5^2', hidden: true, 'aria-label': 'Rechnung als Text' });
  const lcd = h('div.nlcd', { tabindex: '-1' }, ind, exprBox, txt, resBox);
  const varsEl = h('div.calcvars.nvars');
  const histEl = h('div.calchist');

  const key = (label, sl, act, sact, cls = '', rep = false) => {
    const b = h('button.nk' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button' });
    b.innerHTML = `<span class="ksh">${sl || ''}</span><span class="kl"><span>${label}</span></span>`;
    let timer = null;
    const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; b.classList.remove('down'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('down');
      const s = shift && sact;
      shift = false;
      try { (s ? sact : act)(b); } catch (x) { showErr(x); }
      render();
      if (rep) timer = setTimeout(() => { timer = setInterval(() => { act(b); render(); }, 70); }, 380);
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, stop);
    b.addEventListener('click', (e) => e.preventDefault());
    return b;
  };
  const shiftBtn = h('button.nk.ntop.nshift', { type: 'button' }, h('span.kl', { text: 'SHIFT' }));
  shiftBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); shift = !shift; keepHyp = true; render(); });
  const modeBtn = h('button.nk.ntop', { type: 'button', title: 'Winkel: Grad oder Bogenmaß' });
  modeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); deg = !deg; store.set('calcDeg', deg); shift = false; if (done) recalc(); render(); });
  const sdBtn = key('S⇔D', '', () => toggleSD(), null, 'ntop');
  const moreBtn = key('···', '', (b) => moreMenu(b), null, 'ntop');
  const nav = h('div.nnav', { role: 'group', 'aria-label': 'Cursor bewegen' },
    ...[['left', '◀', () => move(-1)], ['up', '▲', () => vert(-1)], ['down', '▼', () => vert(1)], ['right', '▶', () => move(1)]].map(([k, t, fn]) => {
      const b = key(t, '', fn, null, 'narr', true); b.setAttribute('aria-label', { up: 'hoch', down: 'runter', left: 'links', right: 'rechts' }[k]); return b;
    }));
  const top = h('div.ntopbar', null, h('div.ntl', null, shiftBtn, modeBtn), nav, h('div.ntr', null, sdBtn, moreBtn));

  const T = (fn) => () => insFn(fn);
  const fnKeys = [
    [L.frac, '|x|', () => tpl(S('frac'), 'a'), () => tpl(S('abs'), 'a')],
    [L.sqrt, L.cbrt, () => tpl(S('sqrt'), 'a'), () => tpl(S('root', { n: [C('3')] }), 'a')],
    [L.sq, L.cube, () => attach(S('pow', { a: [C('2')] })), () => attach(S('pow', { a: [C('3')] }))],
    [L.pow, L.nroot, () => attach(S('pow'), 'a'), () => tpl(S('root'), 'n')],
    ['log', L.tenx, T('log'), () => { put([C('1'), C('0')]); tpl(S('pow'), 'a'); }],
    ['ln', L.ex, T('ln'), () => { put([C('e')]); tpl(S('pow'), 'a'); }],
    ['(−)', 'π', () => put([C('−')]), () => put([C('π')])],
    [L.inv, 'x!', () => attach(S('pow', { a: [C('−'), C('1')] })), () => attach(C('!'))],
    [L.logb, '%', () => tpl(S('logb'), 'n'), () => attach(C('%'))],
    ['sin', 'sin<sup>−1</sup>', () => trigKey('sin', false), () => trigKey('sin', true)],
    ['cos', 'cos<sup>−1</sup>', () => trigKey('cos', false), () => trigKey('cos', true)],
    ['tan', 'tan<sup>−1</sup>', () => trigKey('tan', false), () => trigKey('tan', true)],
    ['RCL', 'STO', (b) => rcl(b), (b) => sto(b)],
    ['M+', 'M−', () => mem(1), () => mem(-1)],
    ['hyp', 'e', () => { hyp = !hyp; keepHyp = true; }, () => put([C('e')])],
    ['ENG', '←ENG', () => engKey(-3), () => engKey(3)],
    ['(', '', () => put([C('(')]), null],
    [')', '', () => put([C(')')]), null],
    // nur bei iPad quer sichtbar (füllt die Spalte): häufige Zweitbelegungen direkt
    ['π', '', () => put([C('π')]), null, 'xtra'],
    ['e', '', () => put([C('e')]), null, 'xtra'],
    [L.cube, '', () => attach(S('pow', { a: [C('3')] })), null, 'xtra'],
    ['|x|', '', () => tpl(S('abs'), 'a'), null, 'xtra'],
    ['x!', '', () => attach(C('!')), null, 'xtra'],
    ['%', '', () => attach(C('%')), null, 'xtra'],
  ].map(([l, s, a, sa, x]) => key(l, s, a, sa, 'sci fnk' + (x ? ' ' + x : '')));
  const numKeys = [
    ['7'], ['8'], ['9'], ['DEL', '', () => del(), null, 'grn', true], ['AC', '', () => clearAll(), null, 'grn'],
    ['4'], ['5'], ['6'], ['×', '', () => op('×'), null, 'opk'], ['÷', '', () => op('÷'), null, 'opk'],
    ['1'], ['2'], ['3'], ['+', '', () => op('+'), null, 'opk'], ['−', '', () => op('−'), null, 'opk'],
    ['0'], [',', '', () => put([C(',')]), null], [L.E, '', () => tpl(S('E'), 'a', true), null, 'exk'], ['Ans', '', () => put([C('Ans')]), null, 'ansk'], ['=', '≈', () => equals(false), () => equals(true), 'eqk'],
  ].map(([l, s = '', a, sa, c, rep]) => key(l, s, a || (() => put([C(l)])), sa, 'numk' + (c ? ' ' + c : ''), !!rep));
  const pad = h('div.calcpad.npad', null, h('div.nfgrid', null, ...fnKeys), h('div.nngrid', null, ...numKeys));
  const device = h('div.ndev', null, lcd, top, pad);
  const wrapEl = h('div.calc.nc' + (compact ? '.compact' : ''), null, h('div.ndevcol', null, device, varsEl), histEl);
  root.append(wrapEl);

  // ---------- Bearbeiten ----------
  let keepHyp = false;
  function begin(kind) {
    // nach „=“: Rechenzeichen rechnen mit Ans weiter, alles andere fängt neu an
    if (!done) return;
    done = false; result = null; eng = null; err = ''; forceDec = false;
    tree = kind === 'cont' ? [C('Ans')] : [];
    cur = { row: tree, i: tree.length };
  }
  function edited() { if (err) err = ''; }
  function put(nodes) { begin('new'); edited(); cur.row.splice(cur.i, 0, ...nodes); cur.i += nodes.length; }
  function tpl(node, slot, cont = false) {
    begin(cont ? 'cont' : 'new'); edited();
    cur.row.splice(cur.i, 0, node);
    cur = { row: node[slot], i: node[slot].length };
  }
  // Bausteine, die an die Zahl davor gehören (x², xʸ, x⁻¹, !, %)
  function attach(node, slot) {
    begin('cont'); edited();
    cur.row.splice(cur.i, 0, node);
    if (slot) cur = { row: node[slot], i: node[slot].length }; else cur.i++;
  }
  function op(c) { begin('cont'); edited(); cur.row.splice(cur.i, 0, C(c)); cur.i++; }
  function insFn(f) { begin('new'); edited(); cur.row.splice(cur.i, 0, F(f)); cur.i++; }
  function trigKey(f, inv) {
    const name = (inv ? 'a' : '') + f + (hyp ? 'h' : '');
    hyp = false; insFn(name);
  }
  function move(d) {
    if (done) { done = false; eng = null; }
    const row = cur.row, pm = parents(tree);
    if (d < 0) {
      if (cur.i > 0) {
        const n = row[cur.i - 1];
        if (isS(n)) { const k = SLOTS[n.t][SLOTS[n.t].length - 1]; cur = { row: n[k], i: n[k].length }; } else cur.i--;
        return;
      }
      const p = pm.get(row); if (!p) return;
      const ks = SLOTS[p.node.t], j = ks.indexOf(p.key);
      if (j > 0) { const r = p.node[ks[j - 1]]; cur = { row: r, i: r.length }; } else cur = { row: p.row, i: p.i };
    } else {
      if (cur.i < row.length) {
        const n = row[cur.i];
        if (isS(n)) cur = { row: n[SLOTS[n.t][0]], i: 0 }; else cur.i++;
        return;
      }
      const p = pm.get(row); if (!p) return;
      const ks = SLOTS[p.node.t], j = ks.indexOf(p.key);
      if (j < ks.length - 1) cur = { row: p.node[ks[j + 1]], i: 0 }; else cur = { row: p.row, i: p.i + 1 };
    }
  }
  // ▲▼: zwischen Zähler/Nenner, Grundzahl/Hochzahl, Wurzel-Index/Inhalt wechseln
  function vert(d) {
    if (done) { done = false; eng = null; }
    let row = cur.row; const pm = parents(tree);
    const nb = (n) => n && (n.t === 'pow' || n.t === 'E');
    for (;;) {
      const p = pm.get(row);
      if (!p) {
        if (d < 0) { const n = cur.row === row ? (nb(row[cur.i]) ? row[cur.i] : nb(row[cur.i - 1]) ? row[cur.i - 1] : null) : null; if (n) cur = { row: n.a, i: n.a.length }; }
        return;
      }
      const t = p.node.t;
      if (t === 'frac' && ((d > 0 && p.key === 'a') || (d < 0 && p.key === 'b'))) { const r = p.node[d > 0 ? 'b' : 'a']; cur = { row: r, i: Math.min(cur.i, r.length) }; return; }
      if ((t === 'root' || t === 'logb') && ((d > 0 && p.key === 'n') || (d < 0 && p.key === 'a'))) { const r = p.node[d > 0 ? 'a' : 'n']; cur = { row: r, i: d > 0 ? 0 : r.length }; return; }
      if ((t === 'pow' || t === 'E') && d > 0) { cur = { row: p.row, i: p.i + 1 }; return; }
      row = p.row;
    }
  }
  function del() {
    if (done) { done = false; eng = null; result = null; }
    edited();
    const row = cur.row;
    if (cur.i > 0) {
      const n = row[cur.i - 1];
      if (isS(n) && SLOTS[n.t].some((k) => n[k].length)) { move(-1); return; }   // erst hinein, Inhalt löschen
      row.splice(cur.i - 1, 1); cur.i--; return;
    }
    const p = parents(tree).get(row); if (!p) return;
    const n = p.node;
    if (SLOTS[n.t].every((k) => !n[k].length)) { p.row.splice(p.i, 1); cur = { row: p.row, i: p.i }; }
    else if (n.t !== 'pow' && n.t !== 'E' && n.t !== 'frac' && p.key === 'a') {
      // Baustein auflösen, Inhalt bleibt stehen (z. B. √ weg, 2 bleibt)
      p.row.splice(p.i, 1, ...n.a); cur = { row: p.row, i: p.i };
    } else move(-1);
  }
  function clearAll() { tree = []; cur = { row: tree, i: 0 }; done = false; result = null; err = ''; eng = null; hyp = false; forceDec = false; }
  const env = () => ({ deg, ans, vars });
  function equals(dec) {
    if (done && !dec && !err) { forceDec = false; return; }
    if (!tree.length) return;
    try {
      const v = calc(tree, env());
      const q = lin(tree);
      if (!(hist[0] && hist[0].q === q && hist[0].a === v)) { hist.unshift({ q, a: v, t: tree }); hist = hist.slice(0, 30); store.set('calcHist', hist); }
      result = v; ans = v; store.set('calcAns', v); done = true; eng = null; err = ''; forceDec = !!dec;
      cur = { row: tree, i: tree.length };
      drawHist();
    } catch (e) { showErr(e); }
  }
  function recalc() { try { result = calc(tree, env()); ans = result; store.set('calcAns', ans); } catch (e) { showErr(e); } }
  function showErr(e) {
    if (!(e instanceof CalcErr)) console.error(e);
    err = e instanceof CalcErr ? e.message : 'Syntax-Fehler'; result = null; done = false;
  }
  // S⇔D: Ergebnis zwischen exakt (Bruch, Wurzel, π) und Kommazahl umschalten
  function toggleSD() {
    if (!done || result == null) { toast('S⇔D wirkt auf das Ergebnis. Erst mit = ausrechnen.'); return; }
    if (eng != null) { eng = null; return; }
    if (exact(result)) forceDec = !forceDec;
    else toast('Dieses Ergebnis gibt es nur als Kommazahl');
  }
  function engKey(step) {
    if (!done || result == null) { toast('ENG wirkt auf das Ergebnis. Erst mit = ausrechnen.'); return; }
    if (result === 0) return;
    const base = 3 * Math.floor(Math.log10(Math.abs(result)) / 3);
    eng = eng == null ? base : eng + step;
  }
  function mem(sign) {
    let v;
    try { v = done && result != null ? result : calc(tree, env()); } catch (e) { showErr(e); return; }
    if (!done) { result = v; ans = v; store.set('calcAns', v); done = true; }
    vars.m = (vars.m || 0) + sign * v; store.set('calcVars', vars); drawVars();
    toast(`M = ${numText(vars.m)}`);
  }
  function sto(anchor) {
    let v;
    try { v = done && result != null ? result : tree.length ? calc(tree, env()) : ans; } catch (e) { showErr(e); return; }
    menu(anchor, VARS.map((k) => ({ label: `${k.toUpperCase()} = ${numText(v)}${vars[k] !== undefined ? '   (statt ' + numText(vars[k]) + ')' : ''}`, onClick: () => { vars[k] = v; store.set('calcVars', vars); drawVars(); render(); toast(`${k.toUpperCase()} = ${numText(v)} gespeichert`); } })));
  }
  function rcl(anchor) {
    const ks = VARS.filter((k) => vars[k] !== undefined);
    if (!ks.length) { toast('Noch nichts gespeichert. Ergebnis speichern: SHIFT, dann RCL (STO).', 3200); return; }
    menu(anchor, ks.map((k) => ({ label: `${k.toUpperCase()} = ${numText(vars[k])}`, onClick: () => { put([C(k)]); render(); } })));
  }
  function moreMenu(anchor) {
    menu(anchor, [
      { label: 'Mit Tastatur oder Stift eintippen', onClick: () => openText() },
      { label: deg ? 'Winkel: Bogenmaß (RAD)' : 'Winkel: Grad (DEG)', onClick: () => { deg = !deg; store.set('calcDeg', deg); if (done) recalc(); render(); } },
      { label: 'Speicher A–Y und M löschen', onClick: () => { vars = {}; store.set('calcVars', vars); drawVars(); render(); } },
      { label: 'Verlauf löschen', onClick: () => { hist = []; store.set('calcHist', hist); drawHist(); } },
    ]);
  }
  function openText() {
    txt.hidden = false; exprBox.hidden = true;
    txt.value = tree.length ? lin(tree).replace(/·/g, '*') : '';
    txt.focus(); txt.select();
  }
  function closeText(apply) {
    if (apply) {
      try { const t = fromText(txt.value); clearAll(); tree.push(...t); cur = { row: tree, i: tree.length }; if (tree.length) equals(false); }
      catch (e) { showErr(e); }
    }
    txt.hidden = true; exprBox.hidden = false; render();
    lcd.focus({ preventScroll: true });
  }
  txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); closeText(true); } else if (e.key === 'Escape') { e.preventDefault(); closeText(false); } });
  txt.addEventListener('blur', () => { if (!txt.hidden) closeText(!!txt.value.trim()); });

  // ---------- Zeichnen ----------
  function render() {
    if (!keepHyp) hyp = false;
    keepHyp = false;
    shiftBtn.classList.toggle('on', shift);
    wrapEl.classList.toggle('shifted', shift);
    modeBtn.innerHTML = `<span class="kl"><span>${deg ? 'DEG' : 'RAD'}</span></span>`;
    ind.textContent = '';
    for (const [on, t] of [[shift, 'S'], [hyp, 'hyp'], [true, deg ? 'D' : 'R'], [vars.m !== undefined && vars.m !== 0, 'M']]) if (on) ind.append(h('span', { text: t }));
    exprBox.textContent = '';
    exprBox.append(renderRow(tree, done ? null : cur, 'nrow.nmain'));
    if (!tree.length && done === false) exprBox.classList.add('blank'); else exprBox.classList.remove('blank');
    resBox.textContent = ''; resBox.classList.toggle('err', !!err);
    if (err) resBox.append(h('span.nerr', { text: err }));
    else if (done && result != null) {
      const ex = !forceDec && eng == null ? exact(result) : null;
      resBox.append(renderRow(ex ? exactTree(ex) : decTree(result, eng), null, 'nrow.nout'));
      if (ex) resBox.append(h('span.nalt', { text: '≈ ' + numText(result) }));
    }
    // Cursor sichtbar halten
    const c = exprBox.querySelector('.ncur');
    if (c) {
      const er = exprBox.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (cr.right > er.right - 8) exprBox.scrollLeft += cr.right - er.right + 24;
      else if (cr.left < er.left + 8) exprBox.scrollLeft -= er.left - cr.left + 24;
    } else exprBox.scrollLeft = 0;
  }
  // Antippen setzt den Cursor
  exprBox.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lcd.focus({ preventScroll: true });
    let el = e.target;
    while (el && el !== exprBox && !el.__p) el = el.parentElement;
    if (done) { done = false; eng = null; }
    if (!el || el === exprBox) { cur = { row: tree, i: tree.length }; render(); return; }
    const p = el.__p, r = el.getBoundingClientRect();
    cur = { row: p.row, i: p.empty ? 0 : p.i + (e.clientX > r.left + r.width / 2 ? 1 : 0) };
    render();
  });
  // Tastatur (PC / iPad-Tastatur)
  lcd.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const map = { '+': () => op('+'), '-': () => op('−'), '*': () => op('×'), '/': () => op('÷'), ':': () => op('÷'), '^': () => attach(S('pow'), 'a'),
      '(': () => put([C('(')]), ')': () => put([C(')')]), ',': () => put([C(',')]), '.': () => put([C(',')]), '!': () => attach(C('!')), '%': () => attach(C('%')),
      Enter: () => equals(false), '=': () => equals(false), Backspace: () => del(), Delete: () => del(), Escape: () => clearAll(),
      ArrowLeft: () => move(-1), ArrowRight: () => move(1), ArrowUp: () => vert(-1), ArrowDown: () => vert(1), p: () => put([C('π')]), e: () => put([C('e')]) };
    let fn = map[k];
    if (!fn && /^[0-9]$/.test(k)) fn = () => put([C(k)]);
    if (!fn) return;
    e.preventDefault(); shift = false;
    try { fn(); } catch (x) { showErr(x); }
    render();
  });
  lcd.addEventListener('pointerdown', (e) => { if (e.target === lcd || e.target === resBox) { e.preventDefault(); lcd.focus({ preventScroll: true }); } });

  function drawVars() {
    varsEl.textContent = '';
    for (const k of VARS.filter((x) => vars[x] !== undefined)) {
      varsEl.append(h('span.vchip', null,
        h('button', { type: 'button', on: { click: () => { put([C(k)]); render(); } } }, h('b', { text: k.toUpperCase() }), ' = ' + numText(vars[k])),
        h('button.vdel', { type: 'button', 'aria-label': `${k.toUpperCase()} löschen`, text: '×', on: { click: () => { delete vars[k]; store.set('calcVars', vars); drawVars(); render(); } } })));
    }
  }
  function drawHist() {
    histEl.textContent = '';
    const list = hist.slice(0, compact ? 3 : 14);
    if (!list.length) return;
    if (!compact) histEl.append(h('div.nhhead', { text: 'Verlauf' }));
    for (const x of list) {
      histEl.append(h('button.hrow', { type: 'button', on: { click: () => {
        try { clearAll(); const t = x.t ? JSON.parse(JSON.stringify(x.t)) : fromText(x.q); tree.push(...t); cur = { row: tree, i: tree.length }; result = x.a; done = true; } catch (e) { showErr(e); }
        render();
      } } }, h('span', { text: x.t ? x.q : supify(x.q) }), h('b', { text: '= ' + numText(x.a) })));
    }
  }
  drawVars(); drawHist(); render();
  if (focus) setTimeout(() => lcd.focus({ preventScroll: true }), 50);

  // Für den schwebenden Rechner: Rechnung + Ergebnis (oder das letzte Ergebnis)
  return {
    result() {
      if (done && result != null) return { q: lin(tree), a: result, name: null };
      if (tree.length) { try { return { q: lin(tree), a: calc(tree, env()), name: null }; } catch (e) { return null; } }
      return null;
    },
  };
}
