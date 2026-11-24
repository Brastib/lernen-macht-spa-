// Rechenaufgaben sicher neu erzeugen: Aufgaben vom Blatt erkennen, Zahlen austauschen, Lösung exakt ausrechnen.
// Kein Raten durch eine KI: Brüche werden genau gerechnet, Gleichungen (linear in x) genau gelöst.

// ---------- Brüche ----------
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const R = (n, d = 1) => { if (!d) throw new Error('durch 0'); if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => R(a.n * b.n, a.d * b.d);
const div = (a, b) => { if (!b.n) throw new Error('durch 0'); return R(a.n * b.d, a.d * b.n); };
const isZero = (a) => a.n === 0;
function fromDec(s) {
  const [i, f = ''] = s.split('.');
  const d = 10 ** f.length;
  return R(parseInt(i + f, 10) * (s.startsWith('-') ? 1 : 1), d);
}
const safe = (r) => Math.abs(r.n) < 1e12 && r.d < 1e9;

// Wert linear in x: a·x + b
const L = (a, b) => ({ a, b });
const C = (r) => L(R(0), r);
function lmul(p, q) {
  if (!isZero(p.a) && !isZero(q.a)) throw new Error('nicht linear');
  return L(add(mul(p.a, q.b), mul(q.a, p.b)), mul(p.b, q.b));
}
function ldiv(p, q) { if (!isZero(q.a)) throw new Error('x im Nenner'); return L(div(p.a, q.b), div(p.b, q.b)); }
function lpow(p, e) {
  if (!isZero(p.a)) throw new Error('nicht linear');
  if (e < 0 || e > 6) throw new Error('Hochzahl');
  let r = R(1); for (let i = 0; i < e; i++) r = mul(r, p.b);
  return C(r);
}

// ---------- Text normalisieren und zerlegen ----------
const SUP = { '²': '^2', '³': '^3', '⁴': '^4' };
export function normalize(s) {
  return String(s)
    .replace(/[·×∙•*]/g, '*').replace(/÷/g, ':').replace(/[−–—]/g, '-')
    .replace(/[²³⁴]/g, (c) => SUP[c])
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ').trim();
}
// Tokens: Zahl, x, Operator, Klammer
function tokens(s) {
  const out = [];
  const re = /\s*(\d+(?:\.\d+)?|[xX]|[-+*/:^()])/y;
  let m, i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) return null;
    out.push(m[1] === 'X' ? 'x' : m[1]);
    i = re.lastIndex;
  }
  return out;
}
function parse(tk) {
  let i = 0;
  const peek = () => tk[i];
  const isNum = (t) => t != null && /^\d/.test(t);
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = tk[i++]; const w = term(); v = op === '+' ? L(add(v.a, w.a), add(v.b, w.b)) : L(sub(v.a, w.a), sub(v.b, w.b)); }
    return v;
  }
  function term() {
    let v = power();
    for (;;) {
      const t = peek();
      if (t === '*') { i++; v = lmul(v, power()); }
      else if (t === '/' || t === ':') { i++; v = ldiv(v, power()); }
      else if (t === 'x' || t === '(' || (isNum(t) && false)) v = lmul(v, power());   // 3x, 2(x+1)
      else return v;
    }
  }
  function power() {
    let v = unary();
    if (peek() === '^') { i++; const e = tk[i++]; if (!isNum(e)) throw new Error('Hochzahl'); v = lpow(v, parseInt(e, 10)); }
    return v;
  }
  function unary() {
    if (peek() === '-') { i++; const v = unary(); return L(sub(R(0), v.a), sub(R(0), v.b)); }
    if (peek() === '+') { i++; return unary(); }
    return prim();
  }
  function prim() {
    const t = tk[i++];
    if (t == null) throw new Error('kurz');
    if (isNum(t)) return C(fromDec(t));
    if (t === 'x') return L(R(1), R(0));
    if (t === '(') { const v = expr(); if (tk[i++] !== ')') throw new Error('Klammer'); return v; }
    throw new Error('Zeichen');
  }
  const v = expr();
  if (i !== tk.length) throw new Error('Rest');
  return v;
}
export function evalLinear(s) { const tk = tokens(normalize(s)); if (!tk) throw new Error('Zeichen'); return parse(tk); }

// ---------- Aufgaben auf dem Blatt erkennen ----------
const PREFIX = /^\s*((?:\d{1,2}[.)]|[a-hA-H][.)]|[•·-])\s*)/;
// Erkennt eine Rechenzeile. Gibt { pre, task, kind: 'calc'|'eq' } oder null
export function detect(line) {
  let s = String(line).trim();
  if (s.length < 3 || s.length > 90) return null;
  const pm = s.match(PREFIX);
  const pre = pm ? pm[1] : '';
  if (pm) s = s.slice(pm[0].length);
  // Mehrere Aufgaben in einer Zeile („a) 3+4=  b) 5·6=“) trennt splitLine vorher
  const n = normalize(s);
  if (!/\d/.test(n) || /[a-wyzA-WYZäöüß]{2,}/.test(n.replace(/x/gi, ''))) return null;
  const hasX = /x/i.test(n);
  const eq = n.split('=');
  if (hasX) {
    if (eq.length !== 2 || !eq[0].trim() || !eq[1].trim()) return null;
    try { const l = evalLinear(eq[0]), r = evalLinear(eq[1]); const a = sub(l.a, r.a); if (isZero(a)) return null; } catch (e) { return null; }
    return { pre, task: s.trim(), kind: 'eq' };
  }
  const lhs = eq[0].replace(/[_.…?\s]+$/g, '').trim();
  if (!/[-+*/:^]/.test(lhs.replace(/^-/, '')) || (lhs.match(/\d+(?:\.\d+)?/g) || []).length < 2) return null;
  try { evalLinear(lhs); } catch (e) { return null; }
  // Original-Schreibweise der linken Seite behalten
  const orig = s.split('=')[0].trim();
  return { pre, task: orig, kind: 'calc' };
}
export function splitLine(line) {
  // „a) 3 + 4 =  b) 5 · 6 =“ → zwei Teile
  const parts = String(line).split(/\s+(?=[a-h]\)\s*[\d(x-])/);
  return parts.length > 1 ? parts : [line];
}

// ---------- Zahlen austauschen ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function randLike(numStr, level) {
  const [i, f = ''] = numStr.split('.');
  let digits = i.replace(/^0+(?=\d)/, '').length;
  if (level === 'leichter') digits = Math.max(1, digits - (digits > 2 ? 1 : 0));
  if (level === 'schwerer' && digits < 6) digits += 1;
  const lo = digits === 1 ? 2 : 10 ** (digits - 1), hi = 10 ** digits - 1;
  let n = String(rnd(lo, hi));
  if (f.length) { let fr = String(rnd(1, 10 ** f.length - 1)).padStart(f.length, '0'); if (/0$/.test(fr)) fr = fr.slice(0, -1) + rnd(1, 9); n += ',' + fr; }
  return n;
}
// Zahlen im Original-Text ersetzen; Hochzahlen (nach ^ oder ²) bleiben
function vary(text, level) {
  // Brüche a/b als Paar: Nenner 2–12 (bzw. ähnlich groß), echter Bruch bleibt echt, nicht a = b
  const fr = [];
  let t = text.replace(/(\d+)\s*\/\s*(\d+)/g, (m, a, b) => {
    const A = +a, B = +b;
    const maxD = B <= 12 ? (level === 'leichter' ? 10 : level === 'schwerer' ? 20 : 12) : Math.min(99, B * 2);
    let d = rnd(2, maxD), n;
    if (A < B) n = rnd(1, d - 1); else { n = rnd(d + 1, d * 3); }
    if (n % d === 0) n += 1;
    fr.push(m.replace(a, String(n)).replace(new RegExp(b + '$'), String(d)));
    return String.fromCharCode(0xE000 + fr.length - 1);
  });
  t = t.replace(/(\^\s*)?(\d+(?:[.,]\d+)?)/g, (m, pow, num) => (pow ? m : randLike(num.replace(',', '.'), level)));
  return t.replace(/[\uE000-\uE0FF]/g, (c) => fr[c.charCodeAt(0) - 0xE000]);
}
function classOf(r) {
  if (r.d === 1) return 'int';
  let d = r.d; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5;
  return d === 1 ? 'dec' : 'frac';
}
const usesFrac = (t) => /\d\s*\/\s*\d/.test(t);
export function fmt(r, asFrac) {
  const neg = r.n < 0, n = Math.abs(r.n);
  if (r.d === 1) return (neg ? '−' : '') + n;
  if (!asFrac && classOf(r) === 'dec') { const v = (r.n / r.d).toFixed(6).replace(/0+$/, '').replace('.', ','); return v.replace('-', '−'); }
  return (neg ? '−' : '') + `${n}/${r.d}`;
}
function solveText(task, kind) {
  const n = normalize(task);
  if (kind === 'calc') { const v = evalLinear(n.split('=')[0]); if (!isZero(v.a)) throw new Error('x'); return v.b; }
  const [l, r] = n.split('=').map(evalLinear);
  const a = sub(l.a, r.a), b = sub(r.b, l.b);
  if (isZero(a)) throw new Error('keine Lösung');
  return div(b, a);
}
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// Alle Rechnungen/Gleichungen in einem Text exakt lösen (zum Gegenprüfen der KI): ['3x + 5 = 20 → x = 5', …]
export function exactSolutions(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) for (const part of splitLine(raw.trim())) {
    const d = detect(part); if (!d) continue;
    try { const v = solveText(d.task, d.kind); out.push(d.kind === 'eq' ? `${pretty(d.task)} → x = ${fmt(v, usesFrac(d.task))}` : `${pretty(d.task)} = ${fmt(v, usesFrac(d.task))}`); } catch (e) { /* keine Lösung */ }
    if (out.length >= 12) return out;
  }
  return out;
}
const pretty = (t) => t.replace(/\*/g, '·').replace(/(\d)\.(\d)/g, '$1,$2').replace(/\s*\^\s*(\d+)/g, (m, d) => [...d].map((c) => SUPD[+c]).join(''));

// Eine neue Aufgabe wie das Vorbild
export function variant(d, level = 'gleich') {
  let want, origSign;
  try { const v = solveText(d.task, d.kind); want = classOf(v); origSign = Math.sign(v.n); } catch (e) { return null; }
  const frac = usesFrac(d.task);
  for (let k = 0; k < 400; k++) {
    const t = vary(d.task, level);
    let v;
    try { v = solveText(t, d.kind); } catch (e) { continue; }
    if (!safe(v) || classOf(v) !== want && !(want === 'frac' && classOf(v) === 'int' && k > 200)) continue;
    if (origSign >= 0 && v.n < 0) continue;
    if (origSign !== 0 && v.n === 0) continue;
    if (want === 'dec' && String(v.d).length > 4) continue;
    if (want === 'frac' && v.d > 144) continue;
    if (t === d.task) continue;
    return { q: pretty(t) + (d.kind === 'calc' ? ' =' : ''), a: d.kind === 'eq' ? 'x = ' + fmt(v, frac) : fmt(v, frac) };
  }
  return null;
}

// ---------- Ganzes Blatt: Rechenblöcke finden ----------
// Gibt Gruppen zurück: { title, items: [{ q, a }], kind }
export function mathFromText(text, { level = 'gleich', perGroup = 0 } = {}) {
  const lines = String(text || '').split('\n');
  const groups = [];
  let cur = null, lastHead = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = splitLine(line).map(detect);
    const found = parts.filter(Boolean);
    if (!found.length) {
      if (cur) { groups.push(cur); cur = null; }
      if (line.length <= 120 && /[\p{L}]{3,}/u.test(line)) lastHead = line;
      continue;
    }
    if (!cur) cur = { head: lastHead, src: [] };
    cur.src.push(...found);
  }
  if (cur) groups.push(cur);
  const out = [];
  for (const g of groups) {
    const n = perGroup || Math.min(12, Math.max(g.src.length, 4));
    const items = [];
    for (let i = 0; i < n * 2 && items.length < n; i++) {
      const v = variant(g.src[i % g.src.length], level);
      if (v && !items.some((x) => x.q === v.q)) items.push(v);
    }
    if (!items.length) continue;
    const head = g.head.replace(/^\s*\d{1,2}[.)]\s*/, '').trim();
    out.push({ title: head || (g.src[0].kind === 'eq' ? 'Löse die Gleichungen.' : 'Berechne.'), items, kind: g.src[0].kind, sure: true });
  }
  return out;
}
