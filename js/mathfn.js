// Kleiner Rechner für Funktionsterme wie "x^2 - 2x + 1", "2sin(x)", "0,5x³", "sqrt(x+1)".
// Kein eval: eigener Parser. Gibt eine Funktion x => y zurück oder wirft einen verständlichen Fehler.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, wurzel: Math.sqrt, abs: Math.abs, betrag: Math.abs,
  ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
};
const SUP = { '√': 'sqrt', '·': '*', '×': '*', '−': '-', '÷': '/', 'π': 'pi' };

// Buchstaben, die als Parameter (Schieberegler) gelten dürfen
export const PARAM_LETTERS = 'abcdkmnpqrstuvw';
export const stripName = (src) => String(src).trim().replace(/^([a-z]\s*\(\s*x\s*\)|y)\s*=/i, '');
function tokenize(src, opts = {}) {
  let s = stripName(src);
  s = unsup(s);
  s = s.replace(/[√·×−÷π]/g, (c) => SUP[c]).replace(/(\d),(\d)/g, '$1.$2').toLowerCase();
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
        if (opts.params && PARAM_LETTERS.includes(w[0])) { out.push({ t: 'par', v: w[0] }); w = w.slice(1); continue; }
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
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'x' || prev.t === ')' || prev.t === 'par');
    const curStarts = tk.t === 'num' || tk.t === 'x' || tk.t === '(' || tk.t === 'fn' || tk.t === 'par';
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
  const tk = tokenize(src, opts);
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
    if (t.t === 'par') { const P = opts.params, k = t.v; return () => (P[k] ?? 1); }
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

// ----- Hochzahlen: echte hochgestellte Zeichen statt ^ -----
// Eingabe darf ^ enthalten; angezeigt wird x², 2ˣ, xⁿ⁺¹ … Der Parser wandelt Hochzahl-Folgen zurück in ^( … ).
const SUPMAP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  '/': 'ᐟ', '.': 'ᐧ', ',': 'ᐧ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
const UNSUPMAP = {};
for (const [k, v] of Object.entries(SUPMAP)) if (!(v in UNSUPMAP)) UNSUPMAP[v] = k;
UNSUPMAP['ᐧ'] = '.';
const SUPCHARS = Object.keys(UNSUPMAP).join('');
const SUPRUN = new RegExp('[' + SUPCHARS.replace(/[-\\\]^]/g, '\\$&') + ']+', 'g');
const canSup = (g) => [...g].every((c) => c in SUPMAP || c === ' ');
const toSup = (g) => [...g].filter((c) => c !== ' ').map((c) => SUPMAP[c]).join('');
// "x⁽ⁿ⁺¹⁾" / "xⁿ⁺¹" -> "x^(n+1)"
export function unsup(text) {
  return String(text).replace(SUPRUN, (run) => '^(' + [...run].map((c) => UNSUPMAP[c]).join('') + ')');
}
// Fertige ^-Stellen in Hochzahlen umwandeln: x^2 -> x², 2^(n+1) -> 2ⁿ⁺¹, 10^-3 -> 10⁻³
export function supify(text) {
  return String(text)
    .replace(/\^\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (m, g) => (g.trim() && canSup(g) ? toSup(g) : m))
    .replace(/\^\s*([-−]?[0-9]+(?:[.,][0-9]+)?|[a-z](?![a-z]))/gi, (m, g) => (canSup(g.toLowerCase()) ? toSup(g.toLowerCase()) : m));
}

// Macht ein Eingabefeld "hochzahl-fähig": Tippen von ^ (oder Knopf xʸ) schaltet in den Hochzahl-Modus,
// die nächsten Zeichen erscheinen hochgestellt. Gibt { insert(text, back), start(prefix), reset() } zurück.
export function expoInput(inp) {
  let mode = null; // { group: bool, depth: n, fresh: bool }
  let own = false;
  const mark = () => { inp.classList.toggle('expo-on', !!mode); };
  const reset = () => { if (mode) { mode = null; mark(); } };
  // Ein Zeichen durch den Hochzahl-Modus schicken; liefert, was eingefügt wird
  function feed(c) {
    if (c === '^') { mode = { group: false, depth: 0, fresh: true }; mark(); return ''; }
    if (!mode) return c;
    const lc = c.toLowerCase();
    if (mode.fresh && c === '(') { mode.group = true; mode.depth = 1; mode.fresh = false; return ''; }
    if (mode.group) {
      if (c === '(') { mode.depth++; return '⁽'; }
      if (c === ')') { mode.depth--; if (mode.depth <= 0) { reset(); return ''; } return '⁾'; }
      if (c === ' ') return '';
      if (lc in SUPMAP) return SUPMAP[lc];
      reset(); return c;
    }
    // ohne Klammer: Zahl (auch negativ/Komma) oder ein Buchstabe
    if (mode.fresh && (c === '-' || c === '−')) { mode.fresh = 'neg'; return '⁻'; }
    if (/[0-9]/.test(c)) { mode.fresh = false; mode.num = true; return SUPMAP[c]; }
    if ((c === ',' || c === '.') && mode.num) return 'ᐧ';
    if (mode.fresh && /[a-z]/i.test(c) && lc in SUPMAP) { reset(); return SUPMAP[lc]; }
    reset(); return c;
  }
  function put(text, s, e) {
    let out = '';
    for (const c of text) out += feed(c);
    inp.setRangeText(out, s, e, 'end');
  }
  const fire = () => { own = true; inp.dispatchEvent(new Event('input', { bubbles: true })); own = false; };
  inp.addEventListener('beforeinput', (ev) => {
    if (ev.inputType !== 'insertText' || ev.data == null) { if (!/^insert/.test(ev.inputType || '')) reset(); return; }
    if (!mode && !ev.data.includes('^')) return;
    ev.preventDefault();
    put(ev.data, inp.selectionStart ?? inp.value.length, inp.selectionEnd ?? inp.value.length);
    fire();
  });
  // Rückfall (Einfügen, tote Taste ^ auf iPad-Tastatur, Programm setzt Wert): ^ im Text aufräumen
  inp.addEventListener('input', (ev) => {
    if (own || !inp.value.includes('^')) return;
    const pos = inp.selectionStart ?? inp.value.length;
    let before = inp.value.slice(0, pos), after = inp.value.slice(pos);
    let start = false;
    if (before.endsWith('^')) { before = before.slice(0, -1); start = true; }
    before = supify(before); after = supify(after);
    inp.value = before + after;
    inp.setSelectionRange(before.length, before.length);
    if (start) { mode = { group: false, depth: 0, fresh: true }; mark(); }
    ev.stopImmediatePropagation?.();
    fire();
  }, true);
  for (const t of ['blur', 'pointerdown']) inp.addEventListener(t, reset);
  inp.addEventListener('keydown', (e) => { if (/^(Arrow|Home|End|Escape|Enter|Tab)/.test(e.key)) reset(); });
  return {
    // Text von Knöpfen einfügen (läuft durch den Hochzahl-Modus)
    insert(t, back = 0) {
      if (mode && /^[a-z]{2,}/i.test(t)) reset(); // sin(, sqrt( … beenden die Hochzahl
      const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
      put(t, s, e);
      if (back) inp.setSelectionRange(inp.selectionEnd - back, inp.selectionEnd - back);
    },
    start(prefix = '') { this.insert(prefix + '^'); },
    get active() { return !!mode; },
    reset,
  };
}

// Schreibweise für Formeln in Textfeldern: x^2 -> x², sqrt -> √, * -> ·, >= -> ≥ …
const SUBMAP = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', n: 'ₙ', x: 'ₓ' };
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', sigma: 'σ', phi: 'φ', omega: 'ω', Omega: 'Ω', theta: 'θ', pi: 'π', mu: 'μ', rho: 'ρ', epsilon: 'ε' };
export function mathify(text) {
  return supify(String(text))
    .replace(/_\(([0-9n+\-x]+)\)/g, (_, g) => [...g].map((c) => SUBMAP[c] || c).join(''))
    .replace(/_([0-9]+|n|x)/g, (_, g) => [...g].map((c) => SUBMAP[c] || c).join(''))
    .replace(/\bsqrt\s*/g, '√').replace(/\bwurzel\s*/gi, '√')
    .replace(/<=>/g, '⇔').replace(/=>/g, '⇒').replace(/->/g, '→').replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/!=/g, '≠').replace(/\+-/g, '±')
    .replace(/~=/g, '≈').replace(/(\S)\s*\*\s*(?=\S)/g, '$1 · ').replace(/\binf\b/g, '∞').replace(/(\d)\s*grad\b/gi, '$1°')
    .replace(/\b(alpha|beta|gamma|delta|Delta|lambda|sigma|phi|omega|Omega|theta|pi|mu|rho|epsilon)\b/g, (m) => GREEK[m]);
}

// Welche Parameter (a, b, k …) kommen im Term vor?
export function paramsOf(src) {
  try { return [...new Set(tokenize(src, { params: {} }).filter((t) => t.t === 'par').map((t) => t.v))]; } catch (e) { return []; }
}
