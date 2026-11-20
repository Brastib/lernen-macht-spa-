// Werkzeuge für die Schule: Taschenrechner, Fokus-Timer, Einheiten, Periodensystem, Formelsammlung. Alles offline.
import { $, h, icon, toast, sheet } from './ui.js';
import { compile } from './mathfn.js';

export const TABS = [['calc', 'Rechner', 'calc', 'Wissenschaftlich, Grad und Bogenmaß'], ['plot', 'Funktionen', 'graph', 'Graphen live zeichnen, Nullstellen, Schnittpunkte'], ['focus', 'Fokus-Timer', 'clock', 'Konzentriert lernen mit Pausen'], ['units', 'Einheiten', 'ruler2', 'Länge, Masse, Zeit, Temperatur …'], ['pse', 'Periodensystem', 'atom', 'Alle 118 Elemente'], ['formulas', 'Formeln', 'sigma', 'Mathe, Physik, Chemie']];
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const de = (n, digits = 10) => {
  if (!isFinite(n)) return n > 0 ? '∞' : n < 0 ? '−∞' : 'Fehler';
  let s = Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(6) : String(parseFloat(n.toPrecision(digits)));
  return s.replace('.', ',').replace('-', '−');
};

export async function renderKit(ctx, tab = 'calc') {
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Werkzeuge', title: TABS.find((t) => t[0] === tab)?.[1] || 'Werkzeuge', meta: 'Funktioniert auch ohne Internet',
    actions: [],
  });
  const view = $('view');
  view.textContent = '';
  const tabs = h('div.seg.kittabs');
  for (const [k, l] of TABS) tabs.append(h('button' + (k === tab ? '.on' : ''), { text: l, on: { click: () => ctx.go({ view: 'kit', tab: k }) } }));
  const body = h('div.kitbody');
  view.append(tabs, body);
  if (tab === 'calc') calcWidget(body);
  else if (tab === 'plot') import('./plotter.js').then((m) => m.plotWidget(body));
  else if (tab === 'focus') focusWidget(body);
  else if (tab === 'units') unitsWidget(body);
  else if (tab === 'pse') pseWidget(body);
  else formulasWidget(body);
}

// ================= Taschenrechner =================
export function calcWidget(root, { compact = false } = {}) {
  let deg = store.get('calcDeg', true), ans = store.get('calcAns', 0);
  let hist = store.get('calcHist', []);
  const inp = h('input.calcin', { type: 'text', inputmode: 'none', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: '0', 'aria-label': 'Rechnung' });
  const out = h('div.calcout', { text: ' ' });
  const histEl = h('div.calchist');
  const modeBtn = h('button.calcmode', { on: { click: () => { deg = !deg; store.set('calcDeg', deg); modeBtn.textContent = deg ? 'DEG' : 'RAD'; preview(); } } }, deg ? 'DEG' : 'RAD');
  const kbBtn = h('button.calcmode', { title: 'Tastatur', on: { click: () => { inp.inputMode = inp.inputMode === 'none' ? 'decimal' : 'none'; inp.blur(); inp.focus(); } } }, icon('edit'));
  const evalStr = (src) => {
    const s = src.replace(/ans/gi, `(${ans})`).replace(/(\d+(?:[.,]\d+)?)\s*%/g, '($1/100)').replace(/(\d+)!/g, (m, n) => String(fact(+n)));
    return compile(s, { deg })(0);
  };
  function preview() {
    const v = inp.value.trim();
    if (!v) { out.textContent = ' '; out.classList.remove('err'); return; }
    try { const r = evalStr(v); out.textContent = '= ' + de(r); out.classList.remove('err'); } catch (e) { out.textContent = ' '; }
  }
  function equals() {
    const v = inp.value.trim();
    if (!v) return;
    try {
      const r = evalStr(v);
      if (!isFinite(r) && isNaN(r)) throw new Error('Das geht nicht (z. B. Wurzel aus einer negativen Zahl).');
      hist.unshift({ q: v, a: r }); hist = hist.slice(0, 30); store.set('calcHist', hist);
      ans = r; store.set('calcAns', r);
      out.textContent = '= ' + de(r); out.classList.remove('err');
      inp.value = de(r).replace('−', '-');
      drawHist();
    } catch (e) { out.textContent = e.message; out.classList.add('err'); }
  }
  const ins = (t, back = 0) => {
    const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
    inp.setRangeText(t, s, e, 'end');
    if (back) inp.setSelectionRange(inp.selectionEnd - back, inp.selectionEnd - back);
    preview();
  };
  const K = [
    [['sin', () => ins('sin()', 1)], ['cos', () => ins('cos()', 1)], ['tan', () => ins('tan()', 1)], ['√', () => ins('sqrt()', 1)], ['x²', () => ins('^2')], ['xʸ', () => ins('^')]],
    [['sin⁻¹', () => ins('arcsin()', 1)], ['cos⁻¹', () => ins('arccos()', 1)], ['tan⁻¹', () => ins('arctan()', 1)], ['ln', () => ins('ln()', 1)], ['log', () => ins('log()', 1)], ['π', () => ins('π')]],
    [['(', () => ins('(')], [')', () => { const c = inp.selectionStart; if (inp.value[c] === ')') { inp.setSelectionRange(c + 1, c + 1); preview(); } else ins(')'); }], ['%', () => ins('%')], ['n!', () => ins('!')], ['Ans', () => ins('Ans')], ['e', () => ins('e')]],
    [['7'], ['8'], ['9'], ['C', () => { inp.value = ''; preview(); }, 'fn'], ['⌫', () => { const s = inp.selectionStart; if (s > 0) { inp.setRangeText('', s - 1, s, 'end'); preview(); } }, 'fn']],
    [['4'], ['5'], ['6'], ['×', () => ins('·'), 'op'], ['÷', () => ins('/'), 'op']],
    [['1'], ['2'], ['3'], ['+', () => ins('+'), 'op'], ['−', () => ins('-'), 'op']],
    [['0'], [',', () => ins(',')], ['×10ˣ', () => ins('·10^')], ['=', equals, 'eq', 12]],
  ];
  const pad = h('div.calcpad');
  K.forEach((row, ri) => {
    for (const [l, fn, cls, span] of row) {
      const b = h('button.ck' + (cls ? '.' + cls : '') + (ri < 3 ? '.sci' : ''), { text: l, style: span ? { gridColumn: `span ${span}` } : {} });
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); (fn || (() => ins(l)))(); });
      pad.append(b);
    }
  });
  inp.addEventListener('input', preview);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); equals(); } });
  function drawHist() {
    histEl.textContent = '';
    for (const x of hist.slice(0, compact ? 3 : 12)) {
      histEl.append(h('button.hrow', { on: { click: () => { inp.value = x.q; preview(); } } }, h('span', { text: x.q }), h('b', { text: '= ' + de(x.a) })));
    }
  }
  drawHist();
  root.append(h('div.calc' + (compact ? '.compact' : ''), null,
    h('div.calcscreen', null, h('div.calctop', null, modeBtn, kbBtn, h('small', { text: 'Tippe oder schreib die Rechnung' })), inp, out),
    pad, histEl));
  setTimeout(() => inp.focus(), 50);
}
function fact(n) { if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
export function calcSheet() {
  return sheet('Taschenrechner', (body) => calcWidget(body, { compact: true }), { wide: true });
}

// ================= Fokus-Timer =================
// Zustand liegt im Gerät (localStorage), damit der Timer weiterläuft, wenn du die Ansicht wechselst.
const FOCUS_PRESETS = [[25, 5, 'Klassisch 25/5'], [45, 10, 'Lang 45/10'], [15, 3, 'Kurz 15/3']];
const fstate = () => store.get('focus', { mode: 'focus', running: false, end: 0, left: 25 * 60000, preset: 0, count: 0, day: '' });
const fsave = (s) => store.set('focus', s);
let fTick = null;
function presetOf(s) { return FOCUS_PRESETS[s.preset] || FOCUS_PRESETS[0]; }
function durOf(s) { const p = presetOf(s); return (s.mode === 'focus' ? p[0] : p[1]) * 60000; }
function leftOf(s) { return s.running ? Math.max(0, s.end - Date.now()) : s.left; }
// prüft, ob eine Phase vorbei ist (auch wenn die Ansicht nicht offen ist)
export function focusWatch() {
  clearInterval(fTick);
  fTick = setInterval(() => {
    const s = fstate();
    if (!s.running || s.end > Date.now()) return;
    const today = new Date().toDateString();
    if (s.mode === 'focus') { s.count = s.day === today ? s.count + 1 : 1; s.day = today; }
    const was = s.mode;
    s.mode = was === 'focus' ? 'break' : 'focus';
    s.running = false; s.left = durOf(s);
    fsave(s);
    ding();
    toast(was === 'focus' ? 'Fokuszeit vorbei. Mach eine kurze Pause.' : 'Pause vorbei. Weiter geht’s.', 6000);
    try { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.getRegistration().then((r) => r && r.showNotification('Fokus-Timer', { body: was === 'focus' ? 'Fokuszeit vorbei, Pause!' : 'Pause vorbei.', tag: 'focus' })); } catch (e) { /* egal */ }
  }, 1000);
}
function ding() {
  try {
    const AC = new (window.AudioContext || window.webkitAudioContext)();
    [[784, 0], [988, 0.18], [1175, 0.36]].forEach(([f, t]) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, AC.currentTime + t); g.gain.exponentialRampToValueAtTime(0.1, AC.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + t + 0.5); o.connect(g).connect(AC.destination); o.start(AC.currentTime + t); o.stop(AC.currentTime + t + 0.55); });
  } catch (e) { /* egal */ }
}
function focusWidget(root) {
  const R = 120, C = 2 * Math.PI * R;
  const ringEl = h('div.focusring');
  ringEl.innerHTML = `<svg viewBox="0 0 280 280"><circle cx="140" cy="140" r="${R}" class="track"/><circle cx="140" cy="140" r="${R}" class="fill" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
  const timeEl = h('b.focustime'), modeEl = h('small.focusmode');
  ringEl.append(h('div.focuscenter', null, modeEl, timeEl));
  const startBtn = h('button.btn.big.primary', { on: { click: () => {
    const s = fstate();
    if (s.running) { s.left = leftOf(s); s.running = false; } else { s.end = Date.now() + s.left; s.running = true; }
    fsave(s); draw();
  } } });
  const resetBtn = h('button.btn.big', { text: 'Zurücksetzen', on: { click: () => { const s = fstate(); s.running = false; s.left = durOf(s); fsave(s); draw(); } } });
  const skipBtn = h('button.btn.big', { text: 'Überspringen', on: { click: () => { const s = fstate(); s.mode = s.mode === 'focus' ? 'break' : 'focus'; s.running = false; s.left = durOf(s); fsave(s); draw(); } } });
  const presets = h('div.seg');
  FOCUS_PRESETS.forEach(([, , l], i) => presets.append(h('button' + (fstate().preset === i ? '.on' : ''), { text: l, on: { click: (e) => {
    const s = fstate(); s.preset = i; s.running = false; s.left = durOf(s); fsave(s);
    presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw();
  } } })));
  const countEl = h('p.calm');
  root.append(h('div.focus', null, ringEl, h('div.focusbtns', null, resetBtn, startBtn, skipBtn), presets, countEl,
    h('p.calm.small', { text: 'Leg das iPad weg und arbeite, bis der Ring leer ist. Der Timer läuft weiter, wenn du in der App etwas anderes machst. Ist die App ganz geschlossen, gibt es keinen Ton.' })));
  const draw = () => {
    if (!root.isConnected && root.dataset.drawn) { clearInterval(t); return; }
    root.dataset.drawn = '1';
    const s = fstate(), left = leftOf(s), d = durOf(s);
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    timeEl.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    modeEl.textContent = s.mode === 'focus' ? 'Fokus' : 'Pause';
    ringEl.classList.toggle('brk', s.mode !== 'focus');
    ringEl.querySelector('.fill').setAttribute('stroke-dashoffset', String(C * (1 - left / d)));
    startBtn.textContent = s.running ? 'Pause' : left < d ? 'Weiter' : 'Start';
    const n = s.day === new Date().toDateString() ? s.count : 0;
    countEl.textContent = n ? `Heute ${n} Fokus-${n === 1 ? 'Einheit' : 'Einheiten'} geschafft` : 'Heute noch keine Fokus-Einheit';
  };
  draw();
  const t = setInterval(draw, 250);
}

// ================= Einheiten =================
const UNITS = {
  'Länge': [['mm', 1e-3], ['cm', 1e-2], ['dm', 0.1], ['m', 1], ['km', 1e3], ['µm', 1e-6], ['Zoll', 0.0254], ['Fuß', 0.3048], ['Meile', 1609.344]],
  'Masse': [['mg', 1e-6], ['g', 1e-3], ['kg', 1], ['t', 1e3], ['Pfund (lb)', 0.45359237]],
  'Zeit': [['ms', 1e-3], ['s', 1], ['min', 60], ['h', 3600], ['Tag', 86400], ['Woche', 604800], ['Jahr', 31557600]],
  'Fläche': [['mm²', 1e-6], ['cm²', 1e-4], ['dm²', 1e-2], ['m²', 1], ['a', 100], ['ha', 1e4], ['km²', 1e6]],
  'Volumen': [['ml', 1e-3], ['cl', 1e-2], ['dl', 0.1], ['l', 1], ['hl', 100], ['cm³', 1e-3], ['dm³', 1], ['m³', 1e3]],
  'Geschwindigkeit': [['m/s', 1], ['km/h', 1 / 3.6], ['mph', 0.44704], ['Knoten', 0.514444]],
  'Temperatur': [['°C'], ['K'], ['°F']],
  'Druck': [['Pa', 1], ['hPa', 100], ['kPa', 1e3], ['bar', 1e5], ['mbar', 100], ['atm', 101325]],
  'Energie': [['J', 1], ['kJ', 1e3], ['Wh', 3600], ['kWh', 3.6e6], ['cal', 4.184], ['kcal', 4184]],
  'Daten': [['Bit', 0.125], ['Byte', 1], ['KB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12]],
};
function convTemp(v, from, to) {
  const c = from === '°C' ? v : from === 'K' ? v - 273.15 : (v - 32) * 5 / 9;
  return to === '°C' ? c : to === 'K' ? c + 273.15 : c * 9 / 5 + 32;
}
function unitsWidget(root) {
  let cat = store.get('unitCat', 'Länge');
  if (!UNITS[cat]) cat = 'Länge';
  const cats = h('div.chips.left');
  const box = h('div.unitbox');
  const drawCats = () => { cats.textContent = ''; for (const c of Object.keys(UNITS)) cats.append(h('button.pchip.small' + (c === cat ? '.on' : ''), { text: c, on: { click: () => { cat = c; store.set('unitCat', c); drawCats(); drawBox(); } } })); };
  function drawBox() {
    box.textContent = '';
    const list = UNITS[cat];
    const val = h('input.field.unitval', { type: 'text', inputmode: 'decimal', value: '1', 'aria-label': 'Wert' });
    const from = h('select.field', null, ...list.map(([u]) => h('option', { value: u, text: u })));
    const to = h('select.field', null, ...list.map(([u]) => h('option', { value: u, text: u })));
    from.value = list[cat === 'Temperatur' ? 0 : Math.min(2, list.length - 1)][0];
    to.value = list[cat === 'Temperatur' ? 1 : Math.min(3, list.length - 1)][0];
    const res = h('div.unitres');
    const all = h('div.unitall');
    const conv = (v, f, t) => (cat === 'Temperatur' ? convTemp(v, f, t) : v * list.find((x) => x[0] === f)[1] / list.find((x) => x[0] === t)[1]);
    const upd = () => {
      const v = parseFloat(val.value.replace(',', '.').replace('−', '-'));
      all.textContent = '';
      if (isNaN(v)) { res.textContent = 'Bitte eine Zahl eingeben'; return; }
      res.textContent = `${de(v)} ${from.value} = ${de(conv(v, from.value, to.value))} ${to.value}`;
      for (const [u] of list) if (u !== from.value) all.append(h('div.urow', null, h('b', { text: de(conv(v, from.value, u)) }), h('span', { text: u })));
    };
    [val, from, to].forEach((x) => x.addEventListener('input', upd));
    const swap = h('button.icbtn', { 'aria-label': 'Tauschen', on: { click: () => { const a = from.value; from.value = to.value; to.value = a; upd(); } } }, icon('undo'));
    box.append(h('div.unitrow', null, val, from, swap, to), res, h('h3.dlgsub', { text: 'In allen Einheiten' }), all);
    upd();
  }
  drawCats(); drawBox();
  root.append(cats, box);
}

// ================= Periodensystem =================
// Symbol, Name, Atommasse (u), Gruppe: am Alkalimetall, ae Erdalkali, tm Übergangsmetall, pm Metall, md Halbmetall, nm Nichtmetall, hg Halogen, ng Edelgas, la Lanthanoid, ac Actinoid
const PSE_RAW = 'H Wasserstoff 1.008 nm|He Helium 4.003 ng|Li Lithium 6.94 am|Be Beryllium 9.012 ae|B Bor 10.81 md|C Kohlenstoff 12.011 nm|N Stickstoff 14.007 nm|O Sauerstoff 15.999 nm|F Fluor 18.998 hg|Ne Neon 20.180 ng|Na Natrium 22.990 am|Mg Magnesium 24.305 ae|Al Aluminium 26.982 pm|Si Silicium 28.085 md|P Phosphor 30.974 nm|S Schwefel 32.06 nm|Cl Chlor 35.45 hg|Ar Argon 39.948 ng|K Kalium 39.098 am|Ca Calcium 40.078 ae|Sc Scandium 44.956 tm|Ti Titan 47.867 tm|V Vanadium 50.942 tm|Cr Chrom 51.996 tm|Mn Mangan 54.938 tm|Fe Eisen 55.845 tm|Co Cobalt 58.933 tm|Ni Nickel 58.693 tm|Cu Kupfer 63.546 tm|Zn Zink 65.38 tm|Ga Gallium 69.723 pm|Ge Germanium 72.630 md|As Arsen 74.922 md|Se Selen 78.971 nm|Br Brom 79.904 hg|Kr Krypton 83.798 ng|Rb Rubidium 85.468 am|Sr Strontium 87.62 ae|Y Yttrium 88.906 tm|Zr Zirconium 91.224 tm|Nb Niob 92.906 tm|Mo Molybdän 95.95 tm|Tc Technetium 98 tm|Ru Ruthenium 101.07 tm|Rh Rhodium 102.91 tm|Pd Palladium 106.42 tm|Ag Silber 107.87 tm|Cd Cadmium 112.41 tm|In Indium 114.82 pm|Sn Zinn 118.71 pm|Sb Antimon 121.76 md|Te Tellur 127.60 md|I Iod 126.90 hg|Xe Xenon 131.29 ng|Cs Caesium 132.91 am|Ba Barium 137.33 ae|La Lanthan 138.91 la|Ce Cer 140.12 la|Pr Praseodym 140.91 la|Nd Neodym 144.24 la|Pm Promethium 145 la|Sm Samarium 150.36 la|Eu Europium 151.96 la|Gd Gadolinium 157.25 la|Tb Terbium 158.93 la|Dy Dysprosium 162.50 la|Ho Holmium 164.93 la|Er Erbium 167.26 la|Tm Thulium 168.93 la|Yb Ytterbium 173.05 la|Lu Lutetium 174.97 la|Hf Hafnium 178.49 tm|Ta Tantal 180.95 tm|W Wolfram 183.84 tm|Re Rhenium 186.21 tm|Os Osmium 190.23 tm|Ir Iridium 192.22 tm|Pt Platin 195.08 tm|Au Gold 196.97 tm|Hg Quecksilber 200.59 tm|Tl Thallium 204.38 pm|Pb Blei 207.2 pm|Bi Bismut 208.98 pm|Po Polonium 209 pm|At Astat 210 hg|Rn Radon 222 ng|Fr Francium 223 am|Ra Radium 226 ae|Ac Actinium 227 ac|Th Thorium 232.04 ac|Pa Protactinium 231.04 ac|U Uran 238.03 ac|Np Neptunium 237 ac|Pu Plutonium 244 ac|Am Americium 243 ac|Cm Curium 247 ac|Bk Berkelium 247 ac|Cf Californium 251 ac|Es Einsteinium 252 ac|Fm Fermium 257 ac|Md Mendelevium 258 ac|No Nobelium 259 ac|Lr Lawrencium 266 ac|Rf Rutherfordium 267 tm|Db Dubnium 268 tm|Sg Seaborgium 269 tm|Bh Bohrium 270 tm|Hs Hassium 277 tm|Mt Meitnerium 278 tm|Ds Darmstadtium 281 tm|Rg Roentgenium 282 tm|Cn Copernicium 285 tm|Nh Nihonium 286 pm|Fl Flerovium 289 pm|Mc Moscovium 290 pm|Lv Livermorium 293 pm|Ts Tenness 294 hg|Og Oganesson 294 ng';
const CATS = { am: 'Alkalimetall', ae: 'Erdalkalimetall', tm: 'Übergangsmetall', pm: 'Metall', md: 'Halbmetall', nm: 'Nichtmetall', hg: 'Halogen', ng: 'Edelgas', la: 'Lanthanoid', ac: 'Actinoid' };
export const ELEMENTS = PSE_RAW.split('|').map((x, i) => { const [sym, name, mass, cat] = x.split(' '); return { z: i + 1, sym, name, mass: +mass, cat, ...pos(i + 1) }; });
function pos(z) {
  if (z === 1) return { row: 1, col: 1, period: 1, group: 1 };
  if (z === 2) return { row: 1, col: 18, period: 1, group: 18 };
  const P = [[3, 10, 2], [11, 18, 3], [19, 36, 4], [37, 54, 5], [55, 86, 6], [87, 118, 7]];
  const [a, , per] = P.find(([s, e]) => z >= s && z <= e);
  let k = z - a;   // 0-basiert in der Periode
  if (per <= 3) { const col = k < 2 ? k + 1 : k + 11; return { row: per, col, period: per, group: col }; }
  if (per <= 5) return { row: per, col: k + 1, period: per, group: k + 1 };
  // Periode 6/7: f-Block in eigene Zeilen
  if (k < 2) return { row: per, col: k + 1, period: per, group: k + 1 };
  if (k <= 16) return { row: per + 3, col: k + 2, period: per, group: 3, f: true };   // La–Lu / Ac–Lr
  return { row: per, col: k - 14 + 1, period: per, group: k - 14 + 1 };
}
const valence = (e) => (e.group <= 2 ? e.group : e.group >= 13 ? (e.z === 2 ? 2 : e.group - 10) : null);
function pseWidget(root) {
  const q = h('input.field', { type: 'search', placeholder: 'Suchen: Name, Symbol oder Ordnungszahl', autocomplete: 'off' });
  const grid = h('div.pse');
  for (const e of ELEMENTS) {
    grid.append(h('button.el.' + e.cat, { style: { gridRow: String(e.row), gridColumn: String(e.col) }, 'data-k': `${e.z} ${e.sym} ${e.name}`.toLowerCase(), on: { click: () => elSheet(e) } },
      h('small', { text: String(e.z) }), h('b', { text: e.sym }), h('span', { text: e.name })));
  }
  grid.append(h('div.pselabel', { style: { gridRow: '6', gridColumn: '3' }, text: '57–71' }), h('div.pselabel', { style: { gridRow: '7', gridColumn: '3' }, text: '89–103' }));
  const legend = h('div.pselegend', null, ...Object.entries(CATS).map(([k, l]) => h('span.lg.' + k, null, h('i'), l)));
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    grid.classList.toggle('filtering', !!v);
    grid.querySelectorAll('.el').forEach((b) => b.classList.toggle('hit', !!v && b.dataset.k.split(' ').some((w, i) => (i === 0 ? w === v : w.startsWith(v)))));
  });
  root.append(q, h('div.psewrap', null, grid), legend);
}
function elSheet(e) {
  const v = valence(e);
  sheet(`${e.name} (${e.sym})`, (body, close) => {
    const rows = [['Ordnungszahl', String(e.z)], ['Atommasse', `${String(e.mass).replace('.', ',')} u`], ['Gruppe', CATS[e.cat]], ['Periode', String(e.period)],
      ['Hauptgruppe', e.group <= 2 ? `${e.group}. Hauptgruppe` : e.group >= 13 ? `${e.group - 10}. Hauptgruppe` : 'Nebengruppe'],
      v != null ? ['Außenelektronen', String(v)] : null, ['Protonen / Elektronen', `${e.z} / ${e.z}`],
      ['Neutronen (häufigstes Isotop, ca.)', String(Math.round(e.mass) - e.z)]].filter(Boolean);
    body.append(h('div.elhead.' + e.cat, null, h('small', { text: String(e.z) }), h('b', { text: e.sym }), h('span', { text: e.name })),
      h('div.eltable', null, ...rows.map(([k, val]) => h('div.elrow', null, h('span', { text: k }), h('b', { text: val })))),
      h('p.calm.small', { text: 'Werte gerundet. Bei sehr schweren Elementen ist die Masse die des stabilsten Isotops.' }),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
  });
}

// ================= Formelsammlung =================
const FORMULAS = [
  ['Mathe', 'Pythagoras', 'a² + b² = c²', 'c ist die Hypotenuse (gegenüber dem rechten Winkel)'],
  ['Mathe', 'Rechteck', 'A = a · b    u = 2a + 2b', ''],
  ['Mathe', 'Dreieck', 'A = ½ · g · h', 'g Grundseite, h Höhe auf g'],
  ['Mathe', 'Trapez', 'A = ½ · (a + c) · h', 'a, c parallele Seiten'],
  ['Mathe', 'Parallelogramm', 'A = g · h', ''],
  ['Mathe', 'Kreis', 'A = π · r²    u = 2 · π · r', ''],
  ['Mathe', 'Quader', 'V = a · b · c    O = 2(ab + ac + bc)', ''],
  ['Mathe', 'Würfel', 'V = a³    O = 6a²', ''],
  ['Mathe', 'Zylinder', 'V = π · r² · h    O = 2πr² + 2πrh', ''],
  ['Mathe', 'Kegel', 'V = ⅓ · π · r² · h', ''],
  ['Mathe', 'Pyramide', 'V = ⅓ · G · h', 'G Grundfläche'],
  ['Mathe', 'Kugel', 'V = 4⁄3 · π · r³    O = 4 · π · r²', ''],
  ['Mathe', 'Binomische Formeln', '(a + b)² = a² + 2ab + b²\n(a − b)² = a² − 2ab + b²\n(a + b)(a − b) = a² − b²', ''],
  ['Mathe', 'p-q-Formel', 'x² + px + q = 0\nx₁,₂ = −p⁄2 ± √((p⁄2)² − q)', ''],
  ['Mathe', 'Mitternachtsformel', 'ax² + bx + c = 0\nx₁,₂ = (−b ± √(b² − 4ac)) ⁄ 2a', ''],
  ['Mathe', 'Lineare Funktion', 'y = m · x + b    m = (y₂ − y₁) ⁄ (x₂ − x₁)', 'm Steigung, b y-Achsenabschnitt'],
  ['Mathe', 'Scheitelpunktform', 'y = a(x − d)² + e', 'Scheitelpunkt S(d | e)'],
  ['Mathe', 'Potenzgesetze', 'aⁿ · aᵐ = aⁿ⁺ᵐ    aⁿ : aᵐ = aⁿ⁻ᵐ\n(aⁿ)ᵐ = aⁿ·ᵐ    a⁻ⁿ = 1 ⁄ aⁿ', ''],
  ['Mathe', 'Logarithmus', 'log_a(x · y) = log_a x + log_a y\nlog_a(xⁿ) = n · log_a x', ''],
  ['Mathe', 'Trigonometrie', 'sin α = GK ⁄ H    cos α = AK ⁄ H    tan α = GK ⁄ AK', 'GK Gegenkathete, AK Ankathete, H Hypotenuse'],
  ['Mathe', 'Prozent', 'W = G · p ⁄ 100', 'W Prozentwert, G Grundwert, p Prozentsatz'],
  ['Mathe', 'Zinsen', 'Z = K · p ⁄ 100    Kₙ = K₀ · (1 + p⁄100)ⁿ', 'Zinseszins nach n Jahren'],
  ['Mathe', 'Wahrscheinlichkeit', 'P(E) = günstige ⁄ mögliche Ergebnisse', 'Laplace'],
  ['Mathe', 'Mittelwert', 'x̄ = (x₁ + x₂ + … + xₙ) ⁄ n', ''],
  ['Physik', 'Geschwindigkeit', 'v = s ⁄ t', 'm/s; 1 m/s = 3,6 km/h'],
  ['Physik', 'Beschleunigung', 'a = Δv ⁄ Δt    s = ½ · a · t²', ''],
  ['Physik', 'Kraft', 'F = m · a', 'Newton (N)'],
  ['Physik', 'Gewichtskraft', 'F_G = m · g', 'g ≈ 9,81 N/kg'],
  ['Physik', 'Dichte', 'ρ = m ⁄ V', 'g/cm³ oder kg/m³'],
  ['Physik', 'Druck', 'p = F ⁄ A', 'Pascal (Pa)'],
  ['Physik', 'Arbeit', 'W = F · s', 'Joule (J)'],
  ['Physik', 'Leistung', 'P = W ⁄ t', 'Watt (W)'],
  ['Physik', 'Energie', 'E_kin = ½ · m · v²    E_pot = m · g · h', ''],
  ['Physik', 'Ohmsches Gesetz', 'U = R · I', 'Volt, Ohm, Ampere'],
  ['Physik', 'Elektrische Leistung', 'P = U · I', ''],
  ['Physik', 'Elektrische Energie', 'E = P · t', 'kWh'],
  ['Physik', 'Reihenschaltung', 'R = R₁ + R₂    I überall gleich', ''],
  ['Physik', 'Parallelschaltung', '1⁄R = 1⁄R₁ + 1⁄R₂    U überall gleich', ''],
  ['Physik', 'Wellen', 'c = λ · f', 'Lichtgeschwindigkeit c ≈ 3 · 10⁸ m/s'],
  ['Physik', 'Hebelgesetz', 'F₁ · a₁ = F₂ · a₂', ''],
  ['Physik', 'Wirkungsgrad', 'η = E_nutz ⁄ E_zu', ''],
  ['Chemie', 'Stoffmenge', 'n = m ⁄ M', 'mol; M molare Masse aus dem Periodensystem (g/mol)'],
  ['Chemie', 'Konzentration', 'c = n ⁄ V', 'mol/l'],
  ['Chemie', 'Molares Volumen', 'Vₘ ≈ 22,4 l/mol', 'Gas bei 0 °C und 1013 hPa'],
  ['Chemie', 'Teilchenzahl', 'N = n · N_A', 'N_A ≈ 6,022 · 10²³ 1/mol'],
  ['Chemie', 'pH-Wert', 'pH = −log c(H₃O⁺)', ''],
  ['Chemie', 'Massenanteil', 'w = m(Stoff) ⁄ m(Gemisch)', ''],
  ['Konstanten', 'Naturkonstanten', 'g = 9,81 m/s²\nc = 299 792 458 m/s\nN_A = 6,022 · 10²³ 1/mol\ne = 1,602 · 10⁻¹⁹ C', ''],
];
function formulasWidget(root) {
  const q = h('input.field', { type: 'search', placeholder: 'Suchen, z. B. Kreis, Dichte, Stoffmenge', autocomplete: 'off' });
  let cat = store.get('fCat', 'Mathe');
  const cats = h('div.chips.left');
  const list = h('div.flist');
  const draw = () => {
    cats.textContent = '';
    for (const c of ['Mathe', 'Physik', 'Chemie', 'Konstanten']) cats.append(h('button.pchip.small' + (c === cat && !q.value ? '.on' : ''), { text: c, on: { click: () => { cat = c; q.value = ''; store.set('fCat', c); draw(); } } }));
    const v = q.value.trim().toLowerCase();
    list.textContent = '';
    const items = FORMULAS.filter(([c, n, f, note]) => (v ? (n + ' ' + f + ' ' + note + ' ' + c).toLowerCase().includes(v) : c === cat));
    if (!items.length) list.append(h('p.calm', { text: 'Nichts gefunden.' }));
    for (const [c, n, f, note] of items) list.append(h('div.fcard', null, h('small', { text: v ? c : '' }), h('b', { text: n }), h('pre.fmath', { text: f }), note ? h('span', { text: note }) : null));
  };
  q.addEventListener('input', draw);
  draw();
  root.append(q, cats, list);
}
