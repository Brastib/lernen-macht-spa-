// Kleiner Rechner für Funktionsterme wie "x^2 - 2x + 1", "2sin(x)", "0,5x³", "sqrt(x+1)".
// Kein eval: eigener Parser. Gibt eine Funktion x => y zurück oder wirft einen verständlichen Fehler.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, wurzel: Math.sqrt, abs: Math.abs, betrag: Math.abs,
  ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
};
const SUP = { '²': '^2', '³': '^3', '⁴': '^4', '¹': '^1', '⁰': '^0', '√': 'sqrt', '·': '*', '×': '*', '−': '-', '÷': '/', 'π': 'pi' };

function tokenize(src) {
  let s = String(src).trim().replace(/^(f\s*\(\s*x\s*\)|y)\s*=/i, '');
  s = s.replace(/[²³⁴¹⁰√·×−÷π]/g, (c) => SUP[c]).replace(/(\d),(\d)/g, '$1.$2').toLowerCase();
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
    if (/[a-zäöü]/.test(c)) {
      let j = i; while (j < s.length && /[a-zäöü]/.test(s[j])) j++;
      let w = s.slice(i, j);
      // Wörter wie "xsin" oder "2pix" auseinandernehmen
      while (w) {
        const f = Object.keys(FUNCS).concat(['pi']).sort((a, b) => b.length - a.length).find((k) => w.startsWith(k));
        if (f) { out.push(f === 'pi' ? { t: 'num', v: Math.PI } : { t: 'fn', v: f }); w = w.slice(f.length); continue; }
        if (w[0] === 'x') { out.push({ t: 'x' }); w = w.slice(1); continue; }
        if (w[0] === 'e') { out.push({ t: 'num', v: Math.E }); w = w.slice(1); continue; }
        throw new Error(`„${w}“ kenne ich nicht. Erlaubt: x, Zahlen, + − · / ^, Klammern, sin, cos, tan, sqrt, abs, ln, log, exp, pi`);
      }
      i = j; continue;
    }
    if ('+-*/^()'.includes(c)) { out.push({ t: c }); i++; continue; }
    if (c === '[' || c === '{') { out.push({ t: '(' }); i++; continue; }
    if (c === ']' || c === '}') { out.push({ t: ')' }); i++; continue; }
    throw new Error(`Das Zeichen „${c}“ kenne ich nicht.`);
  }
  // Mal-Zeichen ergänzen: 2x, 3(x+1), x(x-1), )(, 2sin(x), x sin(x)
  const res = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'x' || prev.t === ')');
    const curStarts = tk.t === 'num' || tk.t === 'x' || tk.t === '(' || tk.t === 'fn';
    if (prevEnds && curStarts) res.push({ t: '*' });
    res.push(tk);
  }
  return res;
}

// Grammatik: expr = term (+|- term)* ; term = unary (*|/ unary)* ; unary = -unary | power ; power = atom (^ unary)?
// opts.deg: Winkel in Grad (Taschenrechner)
const R = Math.PI / 180;
const DEGF = { sin: (v) => Math.sin(v * R), cos: (v) => Math.cos(v * R), tan: (v) => Math.tan(v * R), arcsin: (v) => Math.asin(v) / R, arccos: (v) => Math.acos(v) / R, arctan: (v) => Math.atan(v) / R };
export function compile(src, opts = {}) {
  const tk = tokenize(src);
  if (!tk.length) throw new Error('Bitte einen Term eingeben, z. B. x^2 - 1');
  let i = 0;
  const peek = () => tk[i] && tk[i].t;
  const eat = (t) => { if (peek() !== t) throw new Error(t === ')' ? 'Eine Klammer wird nicht geschlossen.' : 'Der Term ist unvollständig.'); i++; };
  function expr() {
    let a = term();
    while (peek() === '+' || peek() === '-') { const op = tk[i++].t; const b = term(), l = a; a = op === '+' ? (x) => l(x) + b(x) : (x) => l(x) - b(x); }
    return a;
  }
  function term() {
    let a = unary();
    while (peek() === '*' || peek() === '/') { const op = tk[i++].t; const b = unary(), l = a; a = op === '*' ? (x) => l(x) * b(x) : (x) => l(x) / b(x); }
    return a;
  }
  function unary() {
    if (peek() === '-') { i++; const a = unary(); return (x) => -a(x); }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    const a = atom();
    if (peek() === '^') { i++; const b = unary(); return (x) => pow(a(x), b(x)); }
    return a;
  }
  function atom() {
    const t = tk[i];
    if (!t) throw new Error('Der Term ist unvollständig.');
    i++;
    if (t.t === 'num') { const v = t.v; return () => v; }
    if (t.t === 'x') return (x) => x;
    if (t.t === '(') { const a = expr(); eat(')'); return a; }
    if (t.t === 'fn') {
      const f = (opts.deg && DEGF[t.v]) || FUNCS[t.v];
      if (peek() === '(') { i++; const a = expr(); eat(')'); return (x) => f(a(x)); }
      const a = power();     // sin x
      return (x) => f(a(x));
    }
    throw new Error('Der Term ist unvollständig.');
  }
  const f = expr();
  if (i < tk.length) throw new Error(tk[i].t === ')' ? 'Eine Klammer zu viel.' : 'Der Term ist unvollständig.');
  return f;
}
// Negative Basis mit ungeradem Bruch-Exponenten (z. B. x^(1/3)) erlauben
function pow(a, b) {
  if (a < 0 && !Number.isInteger(b)) {
    const inv = 1 / b;
    if (Number.isInteger(Math.round(inv * 1e9) / 1e9) && Math.round(inv) % 2 !== 0) return -Math.pow(-a, b);
  }
  return Math.pow(a, b);
}

// Schreibweise für Formeln in Textfeldern: x^2 -> x², sqrt -> √, * -> ·, >= -> ≥ …
const SUPMAP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', x: 'ˣ', '(': '⁽', ')': '⁾' };
const SUBMAP = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', n: 'ₙ', x: 'ₓ' };
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', sigma: 'σ', phi: 'φ', omega: 'ω', Omega: 'Ω', theta: 'θ', pi: 'π', mu: 'μ', rho: 'ρ', epsilon: 'ε' };
export function mathify(text) {
  return String(text)
    .replace(/\^\(([0-9n+\-x]+)\)/g, (_, g) => [...g].map((c) => SUPMAP[c] || c).join(''))
    .replace(/\^(-?[0-9]+|n|x)/g, (_, g) => [...g].map((c) => SUPMAP[c] || c).join(''))
    .replace(/_\(([0-9n+\-x]+)\)/g, (_, g) => [...g].map((c) => SUBMAP[c] || c).join(''))
    .replace(/_([0-9]+|n|x)/g, (_, g) => [...g].map((c) => SUBMAP[c] || c).join(''))
    .replace(/\bsqrt\s*/g, '√').replace(/\bwurzel\s*/gi, '√')
    .replace(/<=>/g, '⇔').replace(/=>/g, '⇒').replace(/->/g, '→').replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/!=/g, '≠').replace(/\+-/g, '±')
    .replace(/~=/g, '≈').replace(/(\S)\s*\*\s*(?=\S)/g, '$1 · ').replace(/\binf\b/g, '∞').replace(/(\d)\s*grad\b/gi, '$1°')
    .replace(/\b(alpha|beta|gamma|delta|Delta|lambda|sigma|phi|omega|Omega|theta|pi|mu|rho|epsilon)\b/g, (m) => GREEK[m]);
}
