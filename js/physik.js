// Physik-Rechner: Formeln nach jeder Größe umstellen, Werte mit Einheiten einsetzen, Rechenweg zeigen.
// Dazu ein Einheiten-Umrechner, der zusammengesetzte Einheiten versteht (N in kg·m/s², km/h in m/s, kWh in J …).
// Alles offline, ohne Bibliotheken.
import { h, icon } from './ui.js';
import { expoInput } from './mathfn.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ================= Zahlen =================
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '.': '·' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
export function fmt(x, sig = 6) {
  if (!isFinite(x)) return isNaN(x) ? '–' : (x > 0 ? '∞' : '−∞');
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) {
    let e = Math.floor(Math.log10(a)), m = x / 10 ** e;
    if (Math.abs(parseFloat(m.toPrecision(4))) >= 10) { m /= 10; e += 1; }
    const ms = String(parseFloat(m.toPrecision(4))).replace('.', ',').replace('-', '−');
    return (ms === '1' ? '' : ms === '−1' ? '−' : ms + ' · ') + '10' + sup(e);
  }
  return String(parseFloat(x.toPrecision(sig))).replace('.', ',').replace('-', '−');
}
// Zahl aus Eingabe: 2,5 · 2.5e3 · 2,5·10^3 · 3,5 · 10⁻³ · 1/2 · π
const SUPIN = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
export function parseNum(s) {
  s = String(s).trim();
  if (!s) return NaN;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + m.split('').map((c) => SUPIN[c]).join(''))
    .replace(/[·×⋅*]/g, '*').replace(/[−–]/g, '-').replace(/,/g, '.').replace(/\s+/g, '').replace(/π/g, 'p');
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw 0; i++; return v; }
    if (peek() === 'p') { i++; return Math.PI; }
    const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length; return parseFloat(m[0]);
  };
  const unary = () => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return pow(); };
  const pow = () => { const b = num(); if (peek() === '^') { i++; return b ** unary(); } return b; };
  const mul = () => { let v = unary(); while (peek() === '*' || peek() === '/') { const o = s[i++]; const r = unary(); v = o === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  try { const v = add(); return i === s.length ? v : NaN; } catch (e) { return NaN; }
}

// Knöpfe für Hochzahlen in Zahlenfeldern: 6,67 ·10ⁿ − 1 1 -> 6,67·10⁻¹¹ (iPad-Zahlentastatur hat kein ^)
function numField(inp) { if (!inp._expo) inp._expo = expoInput(inp); return inp; }
function expoBar(target) {
  const ins = (t) => (e) => {
    e.preventDefault();
    const inp = target();
    if (!inp || inp.readOnly) return;
    if (document.activeElement !== inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
    numField(inp)._expo.insert(t);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const b = (label, t, title) => h('button.phxb', { type: 'button', title, 'aria-label': title, on: { pointerdown: ins(t) } }, label);
  return h('div.phexpo', null, b('·10ⁿ', '·10^', 'Mal 10 hoch …'), b('xʸ', '^', 'Hochzahl'), b('−', '-', 'Minus (auch in der Hochzahl)'));
}

// ================= Einheiten =================
// Dimension als Exponenten von [m, kg, s, A, K, mol]
const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0) => [m, kg, s, A, K, mol];
const PREFIX = { T: [1e12, 'Tera'], G: [1e9, 'Giga'], M: [1e6, 'Mega'], k: [1e3, 'Kilo'], h: [1e2, 'Hekto'], da: [10, 'Deka'], d: [0.1, 'Dezi'], c: [1e-2, 'Zenti'], m: [1e-3, 'Milli'], 'µ': [1e-6, 'Mikro'], n: [1e-9, 'Nano'], p: [1e-12, 'Piko'] };
// Name: [Faktor zur SI-Einheit, Dimension, Vorsilben erlaubt?]
const ATOMS = {
  m: [1, D(1)], g: [1e-3, D(0, 1)], s: [1, D(0, 0, 1)], A: [1, D(0, 0, 0, 1)], K: [1, D(0, 0, 0, 0, 1)], mol: [1, D(0, 0, 0, 0, 0, 1)],
  N: [1, D(1, 1, -2)], J: [1, D(2, 1, -2)], W: [1, D(2, 1, -3)], Pa: [1, D(-1, 1, -2)], V: [1, D(2, 1, -3, -1)], 'Ω': [1, D(2, 1, -3, -2)],
  C: [1, D(0, 0, 1, 1)], Hz: [1, D(0, 0, -1)], F: [1, D(-2, -1, 4, 2)], T: [1, D(0, 1, -2, -1)],
  l: [1e-3, D(3)], L: [1e-3, D(3)], Wh: [3600, D(2, 1, -2)], Ah: [3600, D(0, 0, 1, 1)], eV: [1.602176634e-19, D(2, 1, -2)], cal: [4.184, D(2, 1, -2)], bar: [1e5, D(-1, 1, -2)],
  min: [60, D(0, 0, 1), false], h: [3600, D(0, 0, 1), false], d: [86400, D(0, 0, 1), false], a: [31557600, D(0, 0, 1), false], t: [1000, D(0, 1), false],
  ha: [1e4, D(2), false], atm: [101325, D(-1, 1, -2), false], PS: [735.49875, D(2, 1, -3), false], '%': [0.01, D(), false],
  '°C': [1, D(0, 0, 0, 0, 1), false, 273.15], '°F': [5 / 9, D(0, 0, 0, 0, 1), false, 459.67 * 5 / 9],
};
const ALIAS = { Ohm: 'Ω', ohm: 'Ω', 'Ω': 'Ω', sec: 's', Std: 'h', std: 'h', Liter: 'l', grad: '°C', '°': '°C' };
const BASE_NAMES = ['m', 'kg', 's', 'A', 'K', 'mol'];
const SHOW_ORDER = [1, 0, 3, 2, 4, 5];

function atom(word) {
  if (ALIAS[word]) word = ALIAS[word];
  if (ATOMS[word]) { const [f, d, , off] = ATOMS[word]; return { f, d, off, parts: [word] }; }
  for (const p of Object.keys(PREFIX).sort((a, b) => b.length - a.length)) {
    if (!word.startsWith(p)) continue;
    let rest = word.slice(p.length); if (ALIAS[rest]) rest = ALIAS[rest];
    const at = ATOMS[rest];
    if (at && at[2] !== false) return { f: PREFIX[p][0] * at[0], d: at[1], parts: [p + '|' + rest] };
  }
  return null;
}
// Wort in eine oder zwei Einheiten zerlegen (z. B. „Nm“ = N·m, „kgm“ = kg·m)
function word2(w) {
  const a = atom(w); if (a) return a;
  for (let k = 1; k < w.length; k++) {
    const x = atom(w.slice(0, k)), y = atom(w.slice(k));
    if (x && y) return { f: x.f * y.f, d: x.d.map((v, i) => v + y.d[i]), parts: [...x.parts, ...y.parts] };
  }
  return null;
}
// Einheiten-Ausdruck lesen: kg·m/s², J/(kg·K), km/h, m^-1, m2, 1/min …
export function parseUnit(src) {
  let s = String(src).trim().replace(/μ/g, 'µ').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + m.split('').map((c) => SUPIN[c]).join(''))
    .replace(/[*×⋅.]/g, '·').replace(/[−–]/g, '-').replace(/\s*·\s*/g, '·').replace(/\s*\/\s*/g, '/').replace(/\s+/g, '·');
  if (!s || s === '1' || s === '–') return { f: 1, d: D(), parts: [] };
  let i = 0, err = null;
  const parts = [];
  const mulD = (a, b, e = 1) => a.map((v, k) => v + e * b[k]);
  const factor = () => {
    let r;
    if (s[i] === '(') { i++; r = expr(); if (s[i] !== ')') throw 'Klammer fehlt'; i++; }
    else {
      const m = /^(\d+(?:[.,]\d+)?|°[CF]|%|[A-Za-zµΩ]+)/.exec(s.slice(i));
      if (!m) throw 'Zeichen „' + (s[i] || '') + '“';
      i += m[0].length;
      if (/^\d/.test(m[0])) r = { f: parseFloat(m[0].replace(',', '.')), d: D() };
      else { const a = word2(m[0]); if (!a) throw '„' + m[0] + '“'; parts.push(...a.parts); r = { f: a.f, d: a.d, off: a.off }; }
    }
    // Hochzahl: ^2, ^-1, oder Ziffern direkt hinter Buchstaben (m2, s-2)
    const em = /^\^?(-?\d+)/.exec(s.slice(i));
    if (em && (s[i] === '^' || /[A-Za-zµΩ)]/.test(s[i - 1]))) { i += em[0].length; const e = +em[1]; r = { f: r.f ** e, d: r.d.map((v) => v * e) }; }
    return r;
  };
  // Alles hinter einem „/“ bis zum nächsten „/“ steht im Nenner: J/kg·K = J/(kg·K)
  const expr = () => {
    let r = factor(), den = false;
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '/') { den = true; i++; } else if (s[i] === '·') i++;
      const g = factor();
      r = { f: den ? r.f / g.f : r.f * g.f, d: mulD(r.d, g.d, den ? -1 : 1) };
    }
    return r;
  };
  try { const r = expr(); if (i < s.length) throw 'Zeichen „' + s[i] + '“'; r.parts = parts; return r; } catch (e) { err = typeof e === 'string' ? e : 'Eingabe'; }
  return { err };
}
export function dimsStr(d) {
  const num = [], den = [];
  for (const k of SHOW_ORDER) {
    const e = Math.round(d[k] * 100) / 100;
    if (!e) continue;
    const pe = Math.abs(e);
    (e > 0 ? num : den).push(BASE_NAMES[k] + (pe === 1 ? '' : pe === 0.5 ? '^½' : sup(pe)));
  }
  if (!num.length && !den.length) return '1';
  const n = num.join('·') || '1';
  if (!den.length) return n;
  return n + '/' + (den.length > 1 ? '(' + den.join('·') + ')' : den[0]);
}
const sameD = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

// Größen mit passenden Einheiten. Die erste Einheit ist die SI-Einheit.
const Q = {
  len: ['Länge', ['m', 'mm', 'cm', 'dm', 'km', 'µm', 'nm']],
  mass: ['Masse', ['kg', 'g', 'mg', 't']],
  time: ['Zeit', ['s', 'ms', 'min', 'h', 'd']],
  speed: ['Geschwindigkeit', ['m/s', 'km/h']],
  acc: ['Beschleunigung', ['m/s²']],
  gfield: ['Ortsfaktor', ['N/kg', 'm/s²']],
  force: ['Kraft', ['N', 'kN', 'mN', 'MN']],
  energy: ['Energie / Arbeit', ['J', 'kJ', 'MJ', 'Wh', 'kWh', 'N·m', 'W·s', 'kcal', 'eV']],
  power: ['Leistung', ['W', 'mW', 'kW', 'MW', 'PS']],
  pressure: ['Druck', ['Pa', 'hPa', 'kPa', 'MPa', 'bar', 'mbar']],
  area: ['Fläche', ['m²', 'dm²', 'cm²', 'mm²', 'km²', 'ha']],
  vol: ['Volumen', ['m³', 'dm³', 'cm³', 'l', 'ml']],
  dens: ['Dichte', ['kg/m³', 'g/cm³', 'kg/l', 'g/l']],
  volt: ['Spannung', ['V', 'mV', 'kV']],
  amp: ['Stromstärke', ['A', 'mA']],
  ohm: ['Widerstand', ['Ω', 'kΩ', 'MΩ']],
  charge: ['Ladung', ['C', 'mAh', 'Ah', 'A·s']],
  freq: ['Frequenz', ['Hz', 'kHz', 'MHz', '1/min']],
  temp: ['Temperatur', ['K', '°C', '°F']],
  dtemp: ['Temperaturänderung', ['K', '°C']],
  shc: ['Spez. Wärmekapazität', ['J/(kg·K)', 'kJ/(kg·K)']],
  spring: ['Federkonstante', ['N/m', 'N/cm']],
  momentum: ['Impuls', ['kg·m/s', 'N·s']],
  torque: ['Drehmoment', ['N·m']],
  rhoel: ['Spez. Widerstand', ['Ω·mm²/m', 'Ω·m']],
  capac: ['Kapazität', ['F', 'µF', 'nF', 'pF']],
  ratio: ['ohne Einheit', ['1', '%']],
  count: ['Anzahl', ['1']],
  gconst: ['Gravitationskonstante', ['N·m²/kg²']],
  planck: ['Planck-Konstante', ['J·s']],
};
const CONV_Q = ['force', 'energy', 'power', 'pressure', 'speed', 'acc', 'len', 'mass', 'time', 'area', 'vol', 'dens', 'volt', 'amp', 'ohm', 'charge', 'freq', 'temp', 'momentum', 'shc', 'spring'];
const qDims = (k) => parseUnit(Q[k][1][0]).d;
function quantityOf(d) {
  for (const k of CONV_Q) if (sameD(qDims(k), d)) return k;
  for (const k of Object.keys(Q)) if (sameD(qDims(k), d)) return k;
  return null;
}

// ================= Formeln (kleiner Ausdrucks-Baum) =================
function parseExpr(src) {
  const toks = src.match(/\d+(?:\.\d+)?|sqrt|[A-Za-zΔρηλμ]+(?:_[A-Za-z0-9]+)?|[-+*/^()=]/g);
  let i = 0;
  const peek = () => toks[i];
  const prim = () => {
    const t = toks[i++];
    if (t === '(') { const e = add(); i++; return e; }
    if (t === 'sqrt') { i++; const e = add(); i++; return { t: 'sqrt', a: e }; }
    if (t === '-') return { t: 'neg', a: pow() };
    if (/^\d/.test(t)) return { t: 'n', x: +t };
    return { t: 'v', s: t };
  };
  const pow = () => { const b = prim(); if (peek() === '^') { i++; const neg = peek() === '-' ? (i++, -1) : 1; return { t: 'pow', a: b, e: neg * +toks[i++] }; } return b; };
  const mul = () => { let a = pow(); while (peek() === '*' || peek() === '/') { const o = toks[i++]; a = { t: o === '*' ? 'mul' : 'div', a, b: pow() }; } return a; };
  const add = () => { let a = mul(); while (peek() === '+' || peek() === '-') { const o = toks[i++]; a = { t: o === '+' ? 'add' : 'sub', a, b: mul() }; } return a; };
  const l = add();
  if (peek() === '=') { i++; return { l, r: add() }; }
  return l;
}
function ev(n, env) {
  switch (n.t) {
    case 'n': return n.x;
    case 'v': return env[n.s];
    case 'add': return ev(n.a, env) + ev(n.b, env);
    case 'sub': return ev(n.a, env) - ev(n.b, env);
    case 'mul': return ev(n.a, env) * ev(n.b, env);
    case 'div': return ev(n.a, env) / ev(n.b, env);
    case 'pow': return ev(n.a, env) ** n.e;
    case 'sqrt': return Math.sqrt(ev(n.a, env));
    case 'cbrt': return Math.cbrt(ev(n.a, env));
    case 'neg': return -ev(n.a, env);
  }
  return NaN;
}
// Dimension eines Ausdrucks (für die Einheiten-Kontrolle)
function dimOf(n, env) {
  const z = D();
  switch (n.t) {
    case 'n': return z;
    case 'v': return env[n.s];
    case 'add': case 'sub': { const a = dimOf(n.a, env), b = dimOf(n.b, env); return a && b && sameD(a, b) ? a : (a && b && a.every((v) => !v) ? b : (a && b && b.every((v) => !v) ? a : null)); }
    case 'mul': case 'div': { const a = dimOf(n.a, env), b = dimOf(n.b, env); return a && b ? a.map((v, k) => v + (n.t === 'mul' ? 1 : -1) * b[k]) : null; }
    case 'pow': { const a = dimOf(n.a, env); return a ? a.map((v) => v * n.e) : null; }
    case 'sqrt': { const a = dimOf(n.a, env); return a ? a.map((v) => v / 2) : null; }
    case 'cbrt': { const a = dimOf(n.a, env); return a ? a.map((v) => v / 3) : null; }
    case 'neg': return dimOf(n.a, env);
  }
  return null;
}
export function symHTML(s) {
  const [b, ...rest] = s.split('_');
  return `<var class="phv">${esc(b)}${rest.length ? `<sub>${esc(rest.join('_'))}</sub>` : ''}</var>`;
}
const symText = (s) => { const [b, r] = s.split('_'); return b + (r ? (/^\d+$/.test(r) ? r.split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[c]).join('') : r) : ''); };
// Ausdruck als HTML mit echten Brüchen
function rend(n, sub, top = true) {
  const R = (x) => rend(x, sub, false);
  const paren = (x) => (['add', 'sub'].includes(x.t) ? `(${R(x)})` : R(x));
  switch (n.t) {
    case 'n': return n.x === 0.5 ? '½' : n.x === 0.25 ? '¼' : esc(fmt(n.x));
    case 'v': return sub && sub[n.s] != null ? sub[n.s] : symHTML(n.s);
    case 'add': return `${R(n.a)} + ${R(n.b)}`;
    case 'sub': return `${R(n.a)} − ${['add', 'sub'].includes(n.b.t) ? `(${R(n.b)})` : R(n.b)}`;
    case 'mul': {
      const fs = []; const walk = (x) => (x.t === 'mul' ? (walk(x.a), walk(x.b)) : fs.push(x)); walk(n);
      return fs.map(paren).join(' · ');
    }
    case 'div': return `<span class="pf"><span class="pfn">${R(n.a)}</span><span class="pfd">${R(n.b)}</span></span>`;
    case 'pow': {
      const simple = n.a.t === 'v' && !(sub && sub[n.a.s] != null && sub[n.a.s].includes(' ')) || n.a.t === 'n';
      return `<span class="ppow">${simple ? R(n.a) : `(${R(n.a)})`}<sup>${esc(String(n.e).replace('-', '−'))}</sup></span>`;
    }
    case 'sqrt': return `<span class="psq"><span class="psqs">√</span><span class="psqi">${R(n.a)}</span></span>`;
    case 'cbrt': return `<span class="psq"><span class="psqs">∛</span><span class="psqi">${R(n.a)}</span></span>`;
    case 'neg': return `−${paren(n.a)}`;
  }
  return '';
}
const eqHTML = (l, r, sub) => `<span class="peqn">${rend(l, sub)} <span class="peq">=</span> ${rend(r, sub)}</span>`;

// ---- Monome: k · a^e · b^f … (fast alle Schulformeln haben diese Form) ----
function toMono(n) {
  switch (n.t) {
    case 'n': return { k: n.x, f: [] };
    case 'v': return { k: 1, f: [[n.s, 1]] };
    case 'mul': case 'div': {
      const a = toMono(n.a), b = toMono(n.b); if (!a || !b) return null;
      return monoMul(a, b, n.t === 'mul' ? 1 : -1);
    }
    case 'pow': { const a = toMono(n.a); return a && { k: a.k ** n.e, f: a.f.map(([s, e]) => [s, e * n.e]) }; }
    case 'sqrt': { const a = toMono(n.a); return a && { k: Math.sqrt(a.k), f: a.f.map(([s, e]) => [s, e / 2]), root: true }; }
  }
  return null;
}
function monoMul(a, b, sign = 1) {
  const f = a.f.map((x) => [...x]);
  for (const [s, e] of b.f) { const hit = f.find((x) => x[0] === s); if (hit) hit[1] += sign * e; else f.push([s, sign * e]); }
  return { k: sign > 0 ? a.k * b.k : a.k / b.k, f: f.filter((x) => Math.abs(x[1]) > 1e-12) };
}
const monoPow = (m, e) => ({ k: m.k ** e, f: m.f.map(([s, x]) => [s, x * e]) });
function fromMono(m) {
  const num = [], den = [];
  const k = Math.round(m.k * 1e9) / 1e9;
  for (const [s, e] of m.f) {
    const base = { t: 'v', s }, pe = Math.abs(e);
    const node = pe === 1 ? base : { t: 'pow', a: base, e: pe };
    (e > 0 ? num : den).push(node);
  }
  let kn = k, kd = 1;
  if (k !== 1 && Number.isInteger(Math.round(1 / k * 1e9) / 1e9) && k < 1) { kn = 1; kd = Math.round(1 / k); }
  if (kn !== 1 || !num.length) num.unshift({ t: 'n', x: kn });
  if (kd !== 1) den.unshift({ t: 'n', x: kd });
  const prod = (arr) => arr.reduce((a, b) => (a ? { t: 'mul', a, b } : b), null);
  return den.length ? { t: 'div', a: prod(num), b: prod(den) } : prod(num);
}
const opTxt = (s, e) => symText(s) + (Math.abs(e) === 1 ? '' : sup(Math.abs(e)));
// Formel (L = R) nach x umstellen. Ergebnis: Schritte [{op, html}] und rechte Seite als Baum.
function solveMono(L, R, x) {
  let A = toMono(L), B = toMono(R);
  if (!A || !B) return null;
  let xl = A.f.some(([s]) => s === x);
  if (!xl && !B.f.some(([s]) => s === x)) return null;
  if (!xl) [A, B] = [B, A];
  const steps = [];
  const show = (ops) => steps.push({ ops, html: eqHTML(fromMono(A), fromMono(B)) });
  // Wurzel auf der Seite mit x: erst quadrieren
  const ex = () => A.f.find(([s]) => s === x)[1];
  if (!Number.isInteger(Math.round(ex() * 1e9) / 1e9)) { const p = Math.round(1 / Math.abs(ex() % 1)); A = monoPow(A, p); B = monoPow(B, p); show([p === 2 ? 'quadrieren' : 'hoch ' + p]); }
  // x im Nenner: mit x malnehmen, dann steht x auf der anderen Seite
  if (ex() < 0) {
    const e = -ex();
    A = monoMul(A, { k: 1, f: [[x, e]] }); B = monoMul(B, { k: 1, f: [[x, e]] });
    [A, B] = [B, A];
    show(['· ' + opTxt(x, e)]);
  }
  // Alles andere von der x-Seite wegbringen
  const others = { k: A.k, f: A.f.filter(([s]) => s !== x) };
  if (others.k !== 1 || others.f.length) {
    const ops = [];
    const k = Math.round(others.k * 1e9) / 1e9;
    if (k !== 1) { const inv = Math.round(1 / k * 1e9) / 1e9; ops.push(Number.isInteger(inv) && k < 1 ? '· ' + inv : '÷ ' + fmt(k)); }
    for (const [s, e] of others.f) ops.push((e > 0 ? '÷ ' : '· ') + opTxt(s, e));
    B = monoMul(B, others, -1); A = { k: 1, f: A.f.filter(([s]) => s === x) };
    show(ops);
  }
  const e = ex();
  let rhs = fromMono(B);
  if (e !== 1) {
    rhs = e === 2 ? { t: 'sqrt', a: rhs } : e === 3 ? { t: 'cbrt', a: rhs } : { t: 'pow', a: rhs, e: Math.round(1 / e * 1000) / 1000 };
    steps.push({ ops: [e === 2 ? '√ ziehen' : e === 3 ? '∛ ziehen' : 'Wurzel'], html: eqHTML({ t: 'v', s: x }, rhs) });
  }
  return { steps, rhs };
}

// ---- Formelsammlung ----
// [Bereich, Stufe (M = Mittelstufe, O = Oberstufe), Name, Formel, {Größe: [Name, Größen-Art, Standardwert?, fest?]}, Hinweis, eigene Umstellungen?]
const g = ['Ortsfaktor', 'gfield', '9,81'];
const FORMULAS = [
  ['Bewegung', 'M', 'Geschwindigkeit', 'v = s / t', { v: ['Geschwindigkeit', 'speed'], s: ['Weg', 'len'], t: ['Zeit', 'time'] }, 'Gleichförmige Bewegung'],
  ['Bewegung', 'M', 'Beschleunigung', 'a = Δv / Δt', { a: ['Beschleunigung', 'acc'], 'Δv': ['Geschwindigkeitsänderung', 'speed'], 'Δt': ['Zeitspanne', 'time'] }, ''],
  ['Bewegung', 'M', 'Weg beim Anfahren', 's = 0.5 * a * t^2', { s: ['Weg', 'len'], a: ['Beschleunigung', 'acc'], t: ['Zeit', 'time'] }, 'Start aus dem Stand, gleichmäßig beschleunigt'],
  ['Bewegung', 'M', 'Geschwindigkeit beim Anfahren', 'v = a * t', { v: ['Geschwindigkeit', 'speed'], a: ['Beschleunigung', 'acc'], t: ['Zeit', 'time'] }, 'Start aus dem Stand'],
  ['Bewegung', 'O', 'Geschwindigkeit mit Anfangswert', 'v = v_0 + a * t', { v: ['Endgeschwindigkeit', 'speed'], v_0: ['Anfangsgeschwindigkeit', 'speed'], a: ['Beschleunigung', 'acc'], t: ['Zeit', 'time'] }, '',
    { v_0: [['− a·t', 'v_0 = v - a * t']], a: [['− v₀', 'a * t = v - v_0'], ['÷ t', 'a = (v - v_0) / t']], t: [['− v₀', 'a * t = v - v_0'], ['÷ a', 't = (v - v_0) / a']] }],
  ['Bewegung', 'M', 'Freier Fall: Fallhöhe', 'h = 0.5 * g * t^2', { h: ['Fallhöhe', 'len'], g, t: ['Fallzeit', 'time'] }, 'Ohne Luftwiderstand'],
  ['Bewegung', 'M', 'Freier Fall: Aufprall-Tempo', 'v = sqrt(2 * g * h)', { v: ['Geschwindigkeit', 'speed'], g, h: ['Fallhöhe', 'len'] }, 'Ohne Luftwiderstand'],
  ['Kräfte', 'M', 'Kraft (Newton)', 'F = m * a', { F: ['Kraft', 'force'], m: ['Masse', 'mass'], a: ['Beschleunigung', 'acc'] }, '1 N = 1 kg·m/s²'],
  ['Kräfte', 'M', 'Gewichtskraft', 'F_G = m * g', { F_G: ['Gewichtskraft', 'force'], m: ['Masse', 'mass'], g }, 'Auf der Erde g ≈ 9,81 N/kg, auf dem Mond 1,62 N/kg'],
  ['Kräfte', 'M', 'Federkraft (Hooke)', 'F = D * s', { F: ['Kraft', 'force'], D: ['Federkonstante', 'spring'], s: ['Dehnung', 'len'] }, ''],
  ['Kräfte', 'M', 'Hebelgesetz', 'F_1 * a_1 = F_2 * a_2', { F_1: ['Kraft 1', 'force'], a_1: ['Hebelarm 1', 'len'], F_2: ['Kraft 2', 'force'], a_2: ['Hebelarm 2', 'len'] }, 'Kraft mal Kraftarm = Last mal Lastarm'],
  ['Kräfte', 'M', 'Reibungskraft', 'F_R = μ * F_N', { F_R: ['Reibungskraft', 'force'], 'μ': ['Reibungszahl', 'ratio'], F_N: ['Normalkraft', 'force'] }, ''],
  ['Kräfte', 'O', 'Impuls', 'p = m * v', { p: ['Impuls', 'momentum'], m: ['Masse', 'mass'], v: ['Geschwindigkeit', 'speed'] }, ''],
  ['Kräfte', 'O', 'Zentripetalkraft', 'F_Z = m * v^2 / r', { F_Z: ['Zentripetalkraft', 'force'], m: ['Masse', 'mass'], v: ['Bahngeschwindigkeit', 'speed'], r: ['Radius', 'len'] }, 'Kreisbewegung'],
  ['Kräfte', 'O', 'Gravitationsgesetz', 'F = G * m_1 * m_2 / r^2', { F: ['Gravitationskraft', 'force'], G: ['Gravitationskonstante', 'gconst', '6,674·10⁻¹¹', true], m_1: ['Masse 1', 'mass'], m_2: ['Masse 2', 'mass'], r: ['Abstand', 'len'] }, ''],
  ['Kräfte', 'O', 'Drehmoment', 'M = F * r', { M: ['Drehmoment', 'torque'], F: ['Kraft', 'force'], r: ['Hebelarm', 'len'] }, ''],
  ['Druck & Dichte', 'M', 'Dichte', 'ρ = m / V', { 'ρ': ['Dichte', 'dens'], m: ['Masse', 'mass'], V: ['Volumen', 'vol'] }, 'Wasser: 1 g/cm³ = 1000 kg/m³'],
  ['Druck & Dichte', 'M', 'Druck', 'p = F / A', { p: ['Druck', 'pressure'], F: ['Kraft', 'force'], A: ['Fläche', 'area'] }, '1 bar = 100 000 Pa'],
  ['Druck & Dichte', 'M', 'Schweredruck', 'p = ρ * g * h', { p: ['Druck', 'pressure'], 'ρ': ['Dichte', 'dens'], g, h: ['Tiefe', 'len'] }, 'Druck in einer Flüssigkeit'],
  ['Druck & Dichte', 'M', 'Auftriebskraft', 'F_A = ρ * g * V', { F_A: ['Auftriebskraft', 'force'], 'ρ': ['Dichte der Flüssigkeit', 'dens'], g, V: ['eingetauchtes Volumen', 'vol'] }, 'Archimedes'],
  ['Energie', 'M', 'Arbeit', 'W = F * s', { W: ['Arbeit', 'energy'], F: ['Kraft', 'force'], s: ['Weg', 'len'] }, 'Kraft in Wegrichtung'],
  ['Energie', 'M', 'Lageenergie', 'E_pot = m * g * h', { E_pot: ['Lageenergie', 'energy'], m: ['Masse', 'mass'], g, h: ['Höhe', 'len'] }, ''],
  ['Energie', 'M', 'Bewegungsenergie', 'E_kin = 0.5 * m * v^2', { E_kin: ['Bewegungsenergie', 'energy'], m: ['Masse', 'mass'], v: ['Geschwindigkeit', 'speed'] }, ''],
  ['Energie', 'M', 'Spannenergie', 'E_sp = 0.5 * D * s^2', { E_sp: ['Spannenergie', 'energy'], D: ['Federkonstante', 'spring'], s: ['Dehnung', 'len'] }, ''],
  ['Energie', 'M', 'Leistung', 'P = W / t', { P: ['Leistung', 'power'], W: ['Arbeit / Energie', 'energy'], t: ['Zeit', 'time'] }, ''],
  ['Energie', 'O', 'Leistung aus Kraft', 'P = F * v', { P: ['Leistung', 'power'], F: ['Kraft', 'force'], v: ['Geschwindigkeit', 'speed'] }, ''],
  ['Energie', 'M', 'Wirkungsgrad', 'η = E_nutz / E_zu', { 'η': ['Wirkungsgrad', 'ratio'], E_nutz: ['genutzte Energie', 'energy'], E_zu: ['zugeführte Energie', 'energy'] }, 'Geht auch mit Leistungen. Ergebnis in % möglich'],
  ['Elektrik', 'M', 'Ohmsches Gesetz', 'U = R * I', { U: ['Spannung', 'volt'], R: ['Widerstand', 'ohm'], I: ['Stromstärke', 'amp'] }, '„URI“'],
  ['Elektrik', 'M', 'Elektrische Leistung', 'P = U * I', { P: ['Leistung', 'power'], U: ['Spannung', 'volt'], I: ['Stromstärke', 'amp'] }, ''],
  ['Elektrik', 'M', 'Elektrische Energie', 'E = P * t', { E: ['Energie', 'energy'], P: ['Leistung', 'power'], t: ['Zeit', 'time'] }, 'Stromrechnung: kW mal h = kWh'],
  ['Elektrik', 'M', 'Elektrische Arbeit', 'W = U * I * t', { W: ['Arbeit', 'energy'], U: ['Spannung', 'volt'], I: ['Stromstärke', 'amp'], t: ['Zeit', 'time'] }, ''],
  ['Elektrik', 'M', 'Ladung', 'Q = I * t', { Q: ['Ladung', 'charge'], I: ['Stromstärke', 'amp'], t: ['Zeit', 'time'] }, 'Akku: mAh ist eine Ladung'],
  ['Elektrik', 'M', 'Reihenschaltung', 'R = R_1 + R_2', { R: ['Gesamtwiderstand', 'ohm'], R_1: ['Widerstand 1', 'ohm'], R_2: ['Widerstand 2', 'ohm'] }, 'Stromstärke überall gleich',
    { R_1: [['− R₂', 'R_1 = R - R_2']], R_2: [['− R₁', 'R_2 = R - R_1']] }],
  ['Elektrik', 'M', 'Parallelschaltung', '1 / R = 1 / R_1 + 1 / R_2', { R: ['Gesamtwiderstand', 'ohm'], R_1: ['Widerstand 1', 'ohm'], R_2: ['Widerstand 2', 'ohm'] }, 'Spannung überall gleich',
    { R: [['Kehrwert', 'R = 1 / (1 / R_1 + 1 / R_2)']], R_1: [['− 1/R₂', '1 / R_1 = 1 / R - 1 / R_2'], ['Kehrwert', 'R_1 = 1 / (1 / R - 1 / R_2)']], R_2: [['− 1/R₁', '1 / R_2 = 1 / R - 1 / R_1'], ['Kehrwert', 'R_2 = 1 / (1 / R - 1 / R_1)']] }],
  ['Elektrik', 'O', 'Leitungswiderstand', 'R = ρ_el * l / A', { R: ['Widerstand', 'ohm'], 'ρ_el': ['spez. Widerstand', 'rhoel'], l: ['Länge', 'len'], A: ['Querschnitt', 'area'] }, 'Kupfer: 0,017 Ω·mm²/m'],
  ['Elektrik', 'M', 'Transformator', 'U_1 / U_2 = N_1 / N_2', { U_1: ['Primärspannung', 'volt'], U_2: ['Sekundärspannung', 'volt'], N_1: ['Windungen primär', 'count'], N_2: ['Windungen sekundär', 'count'] }, 'Idealer Transformator'],
  ['Elektrik', 'O', 'Kondensator', 'C = Q / U', { C: ['Kapazität', 'capac'], Q: ['Ladung', 'charge'], U: ['Spannung', 'volt'] }, ''],
  ['Wärme', 'M', 'Wärmeenergie', 'Q = c * m * ΔT', { Q: ['Wärme', 'energy'], c: ['spez. Wärmekapazität', 'shc'], m: ['Masse', 'mass'], 'ΔT': ['Temperaturänderung', 'dtemp'] }, 'Wasser: c = 4,19 kJ/(kg·K)'],
  ['Wellen & Optik', 'M', 'Wellengleichung', 'c = λ * f', { c: ['Ausbreitungsgeschwindigkeit', 'speed'], 'λ': ['Wellenlänge', 'len'], f: ['Frequenz', 'freq'] }, 'Schall in Luft ≈ 343 m/s, Licht ≈ 3·10⁸ m/s'],
  ['Wellen & Optik', 'M', 'Frequenz und Periode', 'f = 1 / T', { f: ['Frequenz', 'freq'], T: ['Periodendauer', 'time'] }, ''],
  ['Wellen & Optik', 'O', 'Linsengleichung', '1 / f = 1 / g + 1 / b', { f: ['Brennweite', 'len'], g: ['Gegenstandsweite', 'len'], b: ['Bildweite', 'len'] }, 'Sammellinse',
    { f: [['Kehrwert', 'f = 1 / (1 / g + 1 / b)']], g: [['− 1/b', '1 / g = 1 / f - 1 / b'], ['Kehrwert', 'g = 1 / (1 / f - 1 / b)']], b: [['− 1/g', '1 / b = 1 / f - 1 / g'], ['Kehrwert', 'b = 1 / (1 / f - 1 / g)']] }],
  ['Wellen & Optik', 'O', 'Abbildungsmaßstab', 'B / G = b / g', { B: ['Bildgröße', 'len'], G: ['Gegenstandsgröße', 'len'], b: ['Bildweite', 'len'], g: ['Gegenstandsweite', 'len'] }, ''],
  ['Wellen & Optik', 'O', 'Photonenenergie', 'E = h_P * f', { E: ['Energie', 'energy'], h_P: ['Planck-Konstante', 'planck', '6,626·10⁻³⁴', true], f: ['Frequenz', 'freq'] }, ''],
].map(([cat, lvl, name, eq, vars, note, custom], i) => ({ id: 'f' + i + '_' + name.replace(/\W+/g, ''), cat, lvl, name, eq, ast: parseExpr(eq), vars, note, custom }));
const CATS = ['Bewegung', 'Kräfte', 'Druck & Dichte', 'Energie', 'Elektrik', 'Wärme', 'Wellen & Optik'];

function solveFormula(F, x) {
  const { l, r } = F.ast;
  if (F.custom) {
    if (l.t === 'v' && l.s === x) return { steps: [], rhs: r };
    const list = F.custom[x];
    if (!list) return null;
    const steps = list.map(([op, src]) => { const e = parseExpr(src); return { ops: [op], html: eqHTML(e.l, e.r), e }; });
    return { steps, rhs: steps[steps.length - 1].e.r };
  }
  if (l.t === 'v' && l.s === x) return { steps: [], rhs: r };
  return solveMono(l, r, x);
}

// ================= Oberfläche =================
export function physWidget(root) {
  let mode = store.get('physMode', 'formel');
  const seg = h('div.seg.physmode');
  const body = h('div.physbody');
  const draw = () => {
    seg.textContent = '';
    for (const [k, l, ic] of [['formel', 'Formeln rechnen', 'sigma'], ['einheit', 'Einheiten umrechnen', 'ruler2']]) seg.append(h('button' + (k === mode ? '.on' : ''), { on: { click: () => { mode = k; store.set('physMode', k); draw(); } } }, icon(ic), l));
    body.textContent = '';
    if (mode === 'einheit') convWidget(body); else formulaWidget(body);
  };
  draw();
  root.append(seg, body);
}

// ---------- Formeln ----------
function formulaWidget(root) {
  const open = store.get('physOpen', null);
  const F = open && FORMULAS.find((f) => f.id === open);
  if (F) solver(root, F, () => { store.set('physOpen', null); root.textContent = ''; formulaWidget(root); });
  else picker(root, (f) => { store.set('physOpen', f.id); root.textContent = ''; formulaWidget(root); });
}
function picker(root, pick) {
  let cat = store.get('physCat', 'all');
  const q = h('input.field', { type: 'search', placeholder: 'Suchen, z. B. Dichte, Druck, Ohm, Energie', autocomplete: 'off', value: store.get('physQ', '') });
  const cats = h('div.chips.left');
  const list = h('div.phlist');
  const draw = () => {
    store.set('physQ', q.value);
    cats.textContent = '';
    for (const c of ['all', ...CATS]) cats.append(h('button.pchip.small' + (c === cat ? '.on' : ''), { text: c === 'all' ? 'Alle' : c, on: { click: () => { cat = c; store.set('physCat', c); draw(); } } }));
    const v = q.value.trim().toLowerCase();
    list.textContent = '';
    const items = FORMULAS.filter((f) => (cat === 'all' || f.cat === cat) && (!v || [f.name, f.cat, f.note, f.eq, ...Object.values(f.vars).map((x) => x[0])].join(' ').toLowerCase().includes(v)));
    if (!items.length) list.append(h('p.calm', { text: 'Nichts gefunden.' }));
    for (const f of items) {
      const m = h('div.phmath'); m.innerHTML = eqHTML(f.ast.l, f.ast.r);
      list.append(h('button.phcard', { on: { click: () => pick(f) } },
        h('div.phtop', null, h('b', { text: f.name }), h('span.phlvl' + (f.lvl === 'O' ? '.o' : ''), { text: f.lvl === 'O' ? 'Oberstufe' : 'Mittelstufe' })),
        m, h('small', { text: f.cat + (f.note ? ' · ' + f.note : '') })));
    }
  };
  q.addEventListener('input', draw);
  draw();
  root.append(h('p.calm.small.phintro', { text: 'Formel antippen, gesuchte Größe wählen, Werte mit Einheit eintragen. Du bekommst Umstellen, Umrechnen und den ganzen Rechenweg.' }), q, cats, list);
}

function solver(root, F, back) {
  const saved = store.get('physF_' + F.id, {});
  const syms = Object.keys(F.vars);
  const solvable = syms.filter((s) => !F.vars[s][3] && solveFormula(F, s));
  let target = solvable.includes(saved.target) ? saved.target : solvable[0];
  const vals = saved.vals || {};
  const unitPref = store.get('physUnits', {});
  const save = () => store.set('physF_' + F.id, { target, vals });

  const head = h('div.phhead', null,
    h('button.back', { on: { click: back } }, icon('left'), 'Alle Formeln'),
    h('div.phtitle', null, h('h2', { text: F.name }), h('span.phlvl' + (F.lvl === 'O' ? '.o' : ''), { text: F.lvl === 'O' ? 'Oberstufe' : 'Mittelstufe' })));
  const big = h('div.phbig'); big.innerHTML = eqHTML(F.ast.l, F.ast.r);
  const note = F.note ? h('p.calm.small', { text: F.note }) : null;
  const tchips = h('div.phtargets');
  const inputs = h('div.phinputs');
  const result = h('div.phresult');
  const way = h('div.phway');

  const drawTargets = () => {
    tchips.textContent = '';
    for (const s of solvable) {
      const b = h('button.phtarget' + (s === target ? '.on' : ''), { on: { click: () => { target = s; save(); drawTargets(); drawInputs(); calc(); } } });
      b.innerHTML = `${symHTML(s)}<span>${esc(F.vars[s][0])}</span>`;
      tchips.append(b);
    }
  };
  const fields = {};
  let lastNum = null;
  const drawInputs = () => {
    inputs.textContent = '';
    for (const s of syms) {
      if (s === target) continue;
      const [name, qk, def, fixed] = F.vars[s];
      const units = Q[qk][1];
      const cur = vals[s] || [def || '', unitPref[qk] && units.includes(unitPref[qk]) ? unitPref[qk] : units[0]];
      if (!vals[s]) vals[s] = cur;
      const inp = h('input.field.phnum', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: cur[0], placeholder: 'Wert', readOnly: !!fixed, 'aria-label': name });
      const sel = h('select.field.phunit', { 'aria-label': 'Einheit für ' + name, disabled: units.length < 2 || !!fixed }, ...units.map((u) => h('option', { value: u, text: u === '1' ? '(ohne)' : u })));
      sel.value = units.includes(cur[1]) ? cur[1] : units[0];
      const lab = h('span.phsym'); lab.innerHTML = symHTML(s);
      const upd = () => { vals[s] = [inp.value, sel.value]; if (units.length > 1) { unitPref[qk] = sel.value; store.set('physUnits', unitPref); } save(); calc(); };
      inp.addEventListener('input', upd); sel.addEventListener('change', upd);
      fields[s] = inp;
      if (!fixed) { numField(inp); inp.addEventListener('focus', () => { lastNum = inp; }); }
      inputs.append(h('label.phrow' + (fixed ? '.fixed' : ''), null, lab, h('span.phname', { text: name + (fixed ? ' (fest)' : '') }), inp, sel));
    }
  };
  const outSel = h('select.field.phunit');
  outSel.addEventListener('change', () => { saved.out = saved.out || {}; const o = store.get('physOut', {}); o[target] = outSel.value; o['q_' + F.vars[target][1]] = outSel.value; store.set('physOut', o); calc(); });

  const calc = () => {
    const sol = solveFormula(F, target);
    const [tname, tq] = F.vars[target];
    const tunits = Q[tq][1];
    const outPref = store.get('physOut', {})['q_' + tq];
    outSel.textContent = '';
    for (const u of tunits) outSel.append(h('option', { value: u, text: u === '1' ? '(ohne)' : u }));
    outSel.value = tunits.includes(outPref) ? outPref : tunits[0];
    outSel.disabled = tunits.length < 2;
    result.textContent = ''; way.textContent = '';
    if (!sol) { result.append(h('p.calm', { text: 'Nach dieser Größe kann ich hier nicht umstellen.' })); return; }

    // Werte lesen und in SI umrechnen
    const env = {}, envD = {}, conv = [], missing = [], bad = [];
    for (const s of syms) {
      if (s === target) continue;
      const [name, qk] = F.vars[s];
      const [str, u] = vals[s] || ['', Q[qk][1][0]];
      const v = parseNum(str);
      envD[s] = qDims(qk);
      if (!String(str).trim()) { missing.push(symText(s)); continue; }
      if (isNaN(v)) { bad.push(symText(s)); continue; }
      const pu = parseUnit(u);
      env[s] = v * pu.f;
      const si = Q[qk][1][0];
      if (u !== si) conv.push(`${symHTML(s)} = ${esc(fmt(v))} ${esc(u)} = ${esc(fmt(env[s]))} ${esc(si === '1' ? '' : si)}`);
    }
    const n = (x) => h('span.phstepn', { text: String(x) });
    let k = 1;
    const step = (title, html, ops) => {
      const c = h('div.phbody2'); c.innerHTML = html;
      way.append(h('div.phstep', null, n(k++), h('div.phstepc', null, h('div.phsteph', null, h('b', { text: title }), ...(ops || []).map((o) => h('span.phop', { text: '| ' + o }))), c)));
    };
    way.append(h('p.fieldlabel', { text: 'Rechenweg' }));
    step('Formel', eqHTML(F.ast.l, F.ast.r));
    if (sol.steps.length) for (const [i, st] of sol.steps.entries()) step(i === 0 ? 'Umstellen nach ' + symText(target) : 'Weiter umstellen', st.html, st.ops);
    else step('Steht schon allein', `${symHTML(target)} ist schon freigestellt.`);

    if (missing.length || bad.length) {
      result.append(h('p.phwait', { text: (missing.length ? 'Trag noch ein: ' + missing.join(', ') + '. ' : '') + (bad.length ? 'Zahl nicht lesbar bei: ' + bad.join(', ') + ' (z. B. 2,5 oder 3·10^5).' : '') }));
      return;
    }
    if (conv.length) step('In SI-Einheiten umrechnen', conv.map((c) => `<div>${c}</div>`).join(''));
    const siUnit = (s) => { const u = Q[F.vars[s][1]][1][0]; return u === '1' ? '' : u; };
    const sub = {};
    for (const s of syms) if (s !== target) sub[s] = `<span class="pval">${esc(fmt(env[s]))}${siUnit(s) ? '&#8239;' + esc(siUnit(s)) : ''}</span>`;
    step('Einsetzen', eqHTML({ t: 'v', s: target }, sol.rhs, sub));
    const val = ev(sol.rhs, env);
    const tsi = tunits[0];
    const outU = outSel.value, outF = parseUnit(outU).f;
    const ok = isFinite(val);
    const resLine = (v, u) => `${symHTML(target)} <span class="peq">=</span> <b class="pres">${esc(fmt(v))}${u && u !== '1' ? '&#8239;' + esc(u) : ''}</b>`;
    step('Ausrechnen', ok ? resLine(val, tsi) + (outU !== tsi ? `<div class="phmore">= ${esc(fmt(val / outF))} ${esc(outU === '1' ? '' : outU)}</div>` : '') : 'Geht nicht: durch 0 geteilt oder Wurzel aus einer negativen Zahl.');
    // Einheiten-Kontrolle
    const usub = {}; for (const s of syms) if (s !== target) usub[s] = `<span class="punit">${esc(siUnit(s) || '1')}</span>`;
    const d = dimOf(sol.rhs, envD), want = qDims(tq);
    if (d) {
      const match = sameD(d, want);
      const ds = dimsStr(d), named = tsi !== ds && match ? ` = ${esc(tsi)}` : '';
      step('Einheiten prüfen', `<span class="peqn">[${symHTML(target)}] <span class="peq">=</span> ${rend(sol.rhs, usub)} <span class="peq">=</span> ${esc(ds)}${named} <span class="${match ? 'pok' : 'pbad'}">${match ? '✓' : '≠ ' + esc(tsi)}</span></span>`);
    }
    // Ergebnis-Karte
    const resBox = h('div.phres', null, h('small', { text: tname + ' (' + symText(target) + ')' }));
    const line = h('div.phresv'); line.innerHTML = ok ? `${esc(fmt(val / outF))}` : '–';
    resBox.append(h('div.phresrow', null, line, outSel));
    if (ok && val < 0 && !['v', 'v_0', 'a'].includes(target)) resBox.append(h('p.phwarn', { text: 'Negativ: Prüf, ob die Werte zusammenpassen.' }));
    if (ok && tq === 'ratio' && val > 1) resBox.append(h('p.phwarn', { text: 'Über 100 %: Nutz- und zugeführte Energie vertauscht?' }));
    result.append(resBox);
  };

  drawTargets(); drawInputs(); calc();
  root.append(head, h('div.phcardbox', null, big, note), h('p.fieldlabel', { text: 'Was suchst du?' }), tchips,
    h('div.phgiven', null, h('p.fieldlabel', { text: 'Gegeben' }), expoBar(() => (lastNum && lastNum.isConnected ? lastNum : inputs.querySelector('.phnum:not([readonly])')))), inputs, result, way);
}

// ---------- Einheiten ----------
const TIPS = [
  [['km/h', 'm/s'], 'Merke: km/h ÷ 3,6 = m/s'], [['m/s', 'km/h'], 'Merke: m/s · 3,6 = km/h'],
  [['kWh', 'J'], 'Merke: 1 kWh = 3,6 Millionen J'], [['J', 'kWh'], 'Merke: 1 kWh = 3,6 Millionen J'],
  [['bar', 'Pa'], 'Merke: 1 bar = 100 000 Pa = 1000 hPa'], [['Pa', 'bar'], 'Merke: 1 bar = 100 000 Pa'], [['hPa', 'bar'], 'Merke: 1000 hPa = 1 bar'],
  [['g/cm³', 'kg/m³'], 'Merke: 1 g/cm³ = 1000 kg/m³'], [['kg/m³', 'g/cm³'], 'Merke: 1000 kg/m³ = 1 g/cm³'],
  [['l', 'dm³'], '1 l ist genau 1 dm³'], [['ml', 'cm³'], '1 ml ist genau 1 cm³'],
];
function convWidget(root) {
  const st = store.get('physConv', { v: '1', from: 'N', to: 'kg·m/s²' });
  const val = h('input.field.cvval', { type: 'text', inputmode: 'decimal', value: st.v, 'aria-label': 'Wert', autocomplete: 'off' });
  const from = h('input.field.cvunit', { type: 'text', value: st.from, 'aria-label': 'Von Einheit', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const to = h('input.field.cvunit', { type: 'text', value: st.to, 'aria-label': 'Nach Einheit', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const qchips = h('div.chips.left.cvq');
  const fchips = h('div.cvchips'), tchips = h('div.cvchips');
  const out = h('div.cvout'), way = h('div.phway'), all = h('div.unitall');
  const swap = h('button.uswap', { 'aria-label': 'Tauschen', title: 'Tauschen', on: { click: () => { const a = from.value; from.value = to.value; to.value = a; swap.classList.toggle('turn'); upd(); } } }, icon('undo'));
  const unitsFor = (qk) => { const u = [...Q[qk][1]]; const b = dimsStr(qDims(qk)); if (!u.includes(b) && b !== '1') u.push(b); return u; };
  const chipRow = (box, inp, qk) => {
    box.textContent = '';
    if (!qk) return;
    for (const u of unitsFor(qk)) box.append(h('button.cvchip' + (u === inp.value.trim() ? '.on' : ''), { text: u, on: { click: () => { inp.value = u; upd(); } } }));
  };
  const drawQ = (cur) => {
    qchips.textContent = '';
    for (const k of CONV_Q) qchips.append(h('button.pchip.small' + (k === cur ? '.on' : ''), { text: Q[k][0], on: { click: () => { const u = unitsFor(k); from.value = u[k === 'temp' ? 1 : 0]; to.value = k === 'temp' ? 'K' : u[u.length - 1]; upd(); } } }));
  };
  function upd() {
    store.set('physConv', { v: val.value, from: from.value, to: to.value });
    out.textContent = ''; way.textContent = ''; all.textContent = '';
    const v = parseNum(val.value);
    const a = parseUnit(from.value), b = parseUnit(to.value);
    const qk = a.d ? quantityOf(a.d) : null;
    drawQ(qk);
    chipRow(fchips, from, qk);
    chipRow(tchips, to, qk || (b.d ? quantityOf(b.d) : null));
    if (a.err || b.err) { out.append(h('p.phwarn', { text: 'Einheit nicht erkannt: ' + (a.err || b.err) + '. Beispiele: kN, km/h, kg·m/s², J/(kg·K), m2' })); return; }
    if (isNaN(v)) { out.append(h('p.phwait', { text: 'Gib oben eine Zahl ein (z. B. 2,5 oder 3·10^5).' })); return; }
    if (!sameD(a.d, b.d)) {
      const qa = quantityOf(a.d), qb = quantityOf(b.d);
      out.append(h('p.phwarn', { text: `Passt nicht zusammen: ${from.value} ist ${qa ? Q[qa][0] : dimsStr(a.d)}, ${to.value} ist ${qb ? Q[qb][0] : dimsStr(b.d)}.` }));
      return;
    }
    // Temperatur (nicht Differenz): °C/°F/K mit Verschiebung
    const isT = (u) => ['°C', '°F', 'K'].includes(u.trim());
    let res, steps = [];
    const base = dimsStr(a.d) === '1' ? '' : dimsStr(a.d);
    if (isT(from.value) && isT(to.value) && from.value.trim() !== to.value.trim()) {
      const fa = atom(from.value.trim()), fb = atom(to.value.trim());
      const K = v * fa.f + (fa.off || 0); res = (K - (fb.off || 0)) / fb.f;
      const fu = from.value.trim(), tu = to.value.trim();
      if (fu !== 'K') steps.push(['In Kelvin', fu === '°C' ? `T = ${fmt(v)} + 273,15 = ${fmt(K)} K` : `T = (${fmt(v)} + 459,67) · 5/9 = ${fmt(K)} K`]);
      if (tu !== 'K') steps.push(['In ' + tu, tu === '°C' ? `ϑ = ${fmt(K)} − 273,15 = ${fmt(res)} °C` : `ϑ = ${fmt(K)} · 9/5 − 459,67 = ${fmt(res)} °F`]);
      steps.push(['Hinweis', 'Bei Temperatur-Unterschieden (ΔT) gilt einfach 1 °C = 1 K.']);
    } else {
      res = v * a.f / b.f;
      const bits = [];
      for (const p of [...new Set([...a.parts, ...b.parts])]) {
        const [pre, at] = p.includes('|') ? p.split('|') : [null, p];
        if (pre) bits.push(`${pre} = ${PREFIX[pre][1]} = ${fmt(PREFIX[pre][0])}`);
        const A = ATOMS[at];
        if (A && !(A[0] === 1 && dimsStr(A[1]) === at) && at !== 'kg') { const ds = dimsStr(A[1]); bits.push(`1 ${at} = ${A[0] === 1 ? '' : fmt(A[0]) + ' '}${ds === '1' ? '' : ds}`.trim()); }
      }
      if (bits.length) steps.push(['Bausteine', [...new Set(bits)].join('<br>')]);
      const fu = from.value.trim(), tu = to.value.trim();
      steps.push(['Ausgangswert in SI-Basiseinheiten', a.f === 1 ? `${fmt(v)} ${esc(fu)} = ${fmt(v)} ${esc(base)}` : `${fmt(v)} ${esc(fu)} = ${fmt(v)} · ${fmt(a.f)} ${esc(base)} = ${fmt(v * a.f)} ${esc(base)}`]);
      if (!(b.f === 1 && tu === base)) steps.push(['Zieleinheit in SI-Basiseinheiten', `1 ${esc(tu)} = ${fmt(b.f)} ${esc(base)}`]);
      if (b.f !== 1) steps.push(['Teilen', `${fmt(v * a.f)} ÷ ${fmt(b.f)} = ${fmt(res)}`]);
      const tip = TIPS.find(([p]) => p[0] === fu && p[1] === tu);
      if (tip) steps.push(['Abkürzung', tip[1]]);
    }
    const resEl = h('div.cvres'); resEl.innerHTML = `${esc(fmt(v))} ${esc(from.value.trim())} <span class="peq">=</span> <b class="pres">${esc(fmt(res))} ${esc(to.value.trim())}</b>`;
    out.append(resEl);
    if (qk) out.append(h('p.calm.small', { text: 'Größe: ' + Q[qk][0] + (base ? ' · SI-Basiseinheiten: ' + base : '') }));
    way.append(h('p.fieldlabel', { text: 'Rechenweg' }));
    steps.forEach(([t, html], i) => { const c = h('div.phbody2'); c.innerHTML = esc(html).replace(/&lt;br&gt;/g, '<br>'); way.append(h('div.phstep', null, h('span.phstepn', { text: String(i + 1) }), h('div.phstepc', null, h('div.phsteph', null, h('b', { text: t })), c))); });
    if (qk && !isT(from.value)) {
      for (const u of unitsFor(qk)) {
        if (u === to.value.trim() || u === from.value.trim()) continue;
        const pu = parseUnit(u);
        all.append(h('button.urow', { on: { click: () => { to.value = u; upd(); } } }, h('span', { text: u }), h('b', { text: fmt(v * a.f / pu.f) })));
      }
      if (all.childNodes.length) way.append(h('p.fieldlabel', { text: 'In anderen Einheiten' }), all);
    }
  }
  [val, from, to].forEach((x) => x.addEventListener('input', upd));
  root.append(qchips,
    h('div.cvpair', null,
      h('div.ucard.cvcard', null, h('div.cvhead', null, h('small', { text: 'Wert und Einheit' }), expoBar(() => val)), h('div.cvin', null, numField(val), from), fchips),
      swap,
      h('div.ucard.cvcard', null, h('small', { text: 'Umrechnen in' }), to, tchips)),
    out, way);
  upd();
}
