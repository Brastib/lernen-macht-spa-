// Übungen zu Mathe-Themen erzeugen (für Big Boy): Aufgaben + exakt gerechnete Lösungen, keine KI.
import { variant, fmt } from './mathgen.js';

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sup2 = (s) => s + '²';
const coef = (k, v) => (k === 1 ? v : k + v);           // 1x → x
const sgn = (n) => (n < 0 ? ' − ' : ' + ') + Math.abs(n);

// ---------- Binomische Formeln ----------
function binom(level) {
  const a = rnd(1, level === 'schwerer' ? 9 : 5), b = rnd(1, level === 'schwerer' ? 12 : 9);
  const v = pick(['x', 'a', 'y', 'b']);
  const A = coef(a, v), t = pick([1, 2, 3]);
  const sq = (k) => (k === 1 ? sup2(v) : `${k * k}${sup2(v)}`);
  if (t === 1) return { q: `(${A} + ${b})²`, a: `${sq(a)} + ${2 * a * b}${v} + ${b * b}` };
  if (t === 2) return { q: `(${A} − ${b})²`, a: `${sq(a)} − ${2 * a * b}${v} + ${b * b}` };
  return { q: `(${A} + ${b})(${A} − ${b})`, a: `${sq(a)} − ${b * b}` };
}
function binomBack(level) {
  const a = rnd(1, level === 'schwerer' ? 7 : 4), b = rnd(1, 9), v = 'x';
  const sq = a === 1 ? 'x²' : `${a * a}x²`, A = coef(a, v), t = pick([1, 2, 3]);
  if (t === 1) return { q: `${sq} + ${2 * a * b}x + ${b * b}`, a: `(${A} + ${b})²` };
  if (t === 2) return { q: `${sq} − ${2 * a * b}x + ${b * b}`, a: `(${A} − ${b})²` };
  return { q: `${sq} − ${b * b}`, a: `(${A} + ${b})(${A} − ${b})` };
}
function nItems(fn, n, level) {
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) { const it = fn(level); if (it && !out.some((x) => x.q === it.q)) out.push(it); }
  return out;
}

// ---------- Prozent ----------
function prozent() {
  const p = pick([5, 10, 12, 15, 20, 25, 30, 40, 50, 75]), g = rnd(2, 40) * 10;
  const w = (p * g) / 100;
  return pick([
    { q: `${p} % von ${g} € =`, a: `${fmtNum(w)} €` },
    { q: `${fmtNum(w)} € sind ${p} % von wie viel Euro?`, a: `${g} €` },
    { q: `Wie viel Prozent sind ${fmtNum(w)} von ${g}?`, a: `${p} %` },
  ]);
}
const fmtNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

// ---------- Pythagoras ----------
function pyth() {
  const [x, y, z] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]]);
  const k = pick([1, 1, 2, 3]);
  const [a, b, c] = [x * k, y * k, z * k];
  return pick([
    { q: `a = ${a} cm, b = ${b} cm. Berechne c.`, a: `c = ${c} cm` },
    { q: `c = ${c} cm, a = ${a} cm. Berechne b.`, a: `b = ${b} cm` },
  ]);
}

// Themen: Stichwörter → Erzeuger
const T = [
  { key: /binom/, title: 'Binomische Formeln', groups: (n, l) => [
    { title: 'Löse die Klammern mit den binomischen Formeln auf.', items: nItems(binom, Math.ceil(n * 0.6), l) },
    { title: 'Schreibe als Produkt (rückwärts).', items: nItems(binomBack, Math.max(2, Math.floor(n * 0.4)), l) }] },
  { key: /gleichung|nach x|loese|lös/, title: 'Gleichungen lösen', tpl: ['3x + 5 = 20', '2(x - 4) = 10', '7 - x = 2x + 1', '5x - 3 = 2x + 9'], head: 'Löse die Gleichungen.' },
  { key: /bruch|brüch|bruech/, title: 'Bruchrechnung', tpl: ['3/4 + 1/6', '5/8 - 1/4', '2/3 · 3/5', '3/4 : 1/2'], head: 'Berechne. Kürze, wenn es geht.', kind: 'calc' },
  { key: /prozent/, title: 'Prozentrechnung', groups: (n) => [{ title: 'Berechne.', items: nItems(prozent, n) }] },
  { key: /potenz|hoch/, title: 'Potenzen', tpl: ['2^5', '3^2 + 4^2', '4^3 - 5^2', '(2 + 3)^2'], head: 'Berechne.', kind: 'calc' },
  { key: /schriftlich|multipli|mal rechnen|dividier|geteilt|plus|minus|rechnen/, title: 'Schriftlich rechnen', tpl: ['345 · 12', '1288 : 4', '4507 + 2896', '8003 - 4785'], head: 'Berechne schriftlich.', kind: 'calc' },
  { key: /dezimal|komma/, title: 'Dezimalzahlen', tpl: ['2.5 + 3.75', '7.2 - 4.85', '1.5 · 2.4', '6.3 : 0.7'], head: 'Berechne.', kind: 'calc' },
  { key: /pythagoras/, title: 'Satz des Pythagoras', groups: (n) => [{ title: 'Rechtwinkliges Dreieck (c ist die längste Seite). Berechne die fehlende Seite.', items: nItems(pyth, n) }] },
];
export const TOPIC_NAMES = T.map((t) => t.title);

const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
export function findTopic(text) { const n = norm(text); return T.find((t) => t.key.test(n) || t.key.test(String(text).toLowerCase())) || null; }

// Gruppen wie mathFromText: [{ title, items:[{q,a}], sure:true }]
export function makeTopic(topic, { n = 8, level = 'gleich' } = {}) {
  if (topic.groups) return topic.groups(n, level).filter((g) => g.items.length).map((g) => ({ ...g, sure: true }));
  const items = [];
  for (let i = 0; i < n * 6 && items.length < n; i++) {
    const v = variant({ task: topic.tpl[i % topic.tpl.length], kind: topic.kind || 'eq' }, level);
    if (v && !items.some((x) => x.q === v.q)) items.push(v);
  }
  return [{ title: topic.head, items, sure: true }];
}
// Ein Beispiel mit Lösung (für „schreib ein Beispiel aufs Blatt“)
export function exampleFor(topic) {
  const g = makeTopic(topic, { n: 1 })[0];
  const it = g && g.items[0];
  return it ? `Beispiel: ${it.q.replace(/\s*=\s*$/, '')} = ${it.a.replace(/^x = /, 'x = ')}` : '';
}
void fmt; void sgn;
