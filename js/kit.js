// Werkzeuge für die Schule: Taschenrechner, Fokus-Timer, Einheiten, Periodensystem, Formelsammlung. Alles offline.
import { $, h, icon, toast, sheet } from './ui.js';
import { sciCalc, numText } from './scicalc.js';
export { de };

export const TABS = [['calc', 'Rechner', 'calc', 'Wissenschaftlich, Grad und Bogenmaß'], ['plot', 'Funktionen', 'graph', 'Graphen live zeichnen, Nullstellen, Schnittpunkte'], ['focus', 'Fokus-Timer', 'clock', 'Konzentriert lernen mit Pausen'], ['phys', 'Physik', 'phys', 'Formeln umstellen, Einheiten wie N in kg·m/s²'], ['units', 'Einheiten', 'ruler2', 'Länge, Masse, Zeit, Temperatur …'], ['chem', 'Chemie', 'atom', 'Periodensystem, Atommodelle, Labor'], ['formulas', 'Formeln', 'sigma', 'Mathe, Physik, Chemie']];
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
// Zahl als Text: 2,5 · sehr groß/klein als 6,674·10⁻¹¹
const de = (n, sig = 10) => numText(n, sig);

export async function renderKit(ctx, tab = 'calc') {
  if (tab === 'pse') tab = 'chem';
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Werkzeuge', title: TABS.find((t) => t[0] === (tab === 'pse' ? 'chem' : tab))?.[1] || 'Werkzeuge', meta: 'Funktioniert auch ohne Internet',
    actions: [],
  });
  const view = $('view');
  view.textContent = '';
  const tabs = h('div.seg.kittabs');
  for (const [k, l] of TABS) tabs.append(h('button' + (k === tab ? '.on' : ''), { text: l, on: { click: () => ctx.go({ view: 'kit', tab: k }) } }));
  const body = h('div.kitbody');
  view.append(tabs, body);
  if (tab === 'calc') calcModes(body);
  else if (tab === 'plot') import('./plotter.js').then((m) => m.plotWidget(body));
  else if (tab === 'focus') focusWidget(body);
  else if (tab === 'units') unitsWidget(body);
  else if (tab === 'phys') import('./physik.js').then((m) => m.physWidget(body));
  else if (tab === 'pse' || tab === 'chem') import('./chem.js').then((m) => m.chemWidget(body));
  else formulasWidget(body, ctx);
}

// ================= Taschenrechner =================
// Bruch zu einer Kommazahl (Kettenbruch). null, wenn es keinen „schönen“ Bruch gibt.
export function toFrac(x, maxDen = 10000) {
  if (!isFinite(x) || Number.isInteger(x)) return null;
  const sign = x < 0 ? -1 : 1; let v = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v;
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(b);
    [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (k1 > maxDen) return null;
    if (Math.abs(v - h1 / k1) < 1e-10 * Math.max(1, v)) return k1 === 1 ? null : { n: sign * h1, d: k1 };
    if (b - a < 1e-12) break;
    b = 1 / (b - a);
  }
  return null;
}
export function fracEl(fr, { mixed = false } = {}) {
  const neg = fr.n < 0, n = Math.abs(fr.n), w = Math.floor(n / fr.d), r = n % fr.d;
  const stack = (a, b) => h('span.fr', null, h('span', { text: String(a) }), h('span', { text: String(b) }));
  if (mixed && w) return h('span.frw', null, (neg ? '−' : '') + w, stack(r, fr.d));
  return h('span.frw', null, neg ? '−' : '', stack(n, fr.d));
}
// Taschenrechner wie ein Schulrechner (Anzeige wie im Heft) – siehe js/scicalc.js
export function calcWidget(root, opts) { return sciCalc(root, opts); }
function calcModes(root) {
  const modes = [['calc', 'Rechnen'], ['eq', 'Gleichungen'], ['stat', 'Statistik']];
  let cur = store.get('calcMode', 'calc');
  const seg = h('div.seg.calcmodes');
  const box = h('div.calcmodebody');
  const draw = () => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === cur));
    box.textContent = '';
    if (cur === 'calc') calcWidget(box);
    else import('./calc2.js').then((m) => (cur === 'eq' ? m.eqWidget(box) : m.statWidget(box)));
  };
  for (const [k, l] of modes) seg.append(h('button', { 'data-k': k, text: l, on: { click: () => { cur = k; store.set('calcMode', k); draw(); } } }));
  root.append(seg, box);
  draw();
}
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
  const R = 118, C = 2 * Math.PI * R;
  const ticks = Array.from({ length: 60 }, (_, i) => { const a = i / 60 * 2 * Math.PI, r1 = i % 5 ? 132 : 128, r2 = 137; return `<line x1="${140 + r1 * Math.cos(a)}" y1="${140 + r1 * Math.sin(a)}" x2="${140 + r2 * Math.cos(a)}" y2="${140 + r2 * Math.sin(a)}" class="${i % 5 ? 'tk' : 'tk5'}"/>`; }).join('');
  const ringEl = h('div.focusring');
  ringEl.innerHTML = `<svg viewBox="0 0 280 280" aria-hidden="true"><defs>
    <linearGradient id="fgF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="g1"/><stop offset="1" class="g2"/></linearGradient></defs>
    <g class="ticks">${ticks}</g>
    <circle cx="140" cy="140" r="${R}" class="track"/>
    <circle cx="140" cy="140" r="${R}" class="fill" stroke="url(#fgF)" stroke-dasharray="${C}" stroke-dashoffset="0"/>
    <circle cx="${140 + R}" cy="140" r="9" class="knob"/></svg>`;
  const timeEl = h('b.focustime'), modeEl = h('span.focusmode'), endEl = h('small.focusend');
  ringEl.append(h('div.focuscenter', null, modeEl, timeEl, endEl));
  const toggle = () => {
    const s = fstate();
    if (s.running) { s.left = leftOf(s); s.running = false; } else { s.end = Date.now() + s.left; s.running = true; }
    fsave(s); draw();
  };
  const startBtn = h('button.fplay', { on: { click: toggle } });
  const resetBtn = h('button.fround', { 'aria-label': 'Zurücksetzen', title: 'Zurücksetzen', on: { click: () => { const s = fstate(); s.running = false; s.left = durOf(s); fsave(s); draw(); } } }, icon('undo'), h('small', { text: 'Neu' }));
  const skipBtn = h('button.fround', { 'aria-label': 'Überspringen', title: 'Überspringen', on: { click: () => { const s = fstate(); s.mode = s.mode === 'focus' ? 'break' : 'focus'; s.running = false; s.left = durOf(s); fsave(s); draw(); } } }, icon('right'), h('small', { text: 'Weiter' }));
  const presets = h('div.seg');
  FOCUS_PRESETS.forEach(([, , l], i) => presets.append(h('button' + (fstate().preset === i ? '.on' : ''), { text: l, on: { click: (e) => {
    const s = fstate(); s.preset = i; s.running = false; s.left = durOf(s); fsave(s);
    presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw();
  } } })));
  const dots = h('div.fdots');
  const countEl = h('p.fcount');
  const wrap = h('div.focus', null, h('div.focusstage', null, ringEl), h('div.focusbtns', null, resetBtn, startBtn, skipBtn), presets, h('div.ftoday', null, dots, countEl),
    h('p.calm.small', { text: 'Leg das iPad weg und arbeite, bis der Ring leer ist. Der Timer läuft weiter, wenn du in der App etwas anderes machst. Ist die App ganz geschlossen, gibt es keinen Ton.' }));
  root.append(wrap);
  let lastSig = '';
  const draw = () => {
    if (!root.isConnected && root.dataset.drawn) { clearInterval(t); return; }
    root.dataset.drawn = '1';
    const s = fstate(), left = leftOf(s), d = durOf(s);
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    timeEl.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    modeEl.textContent = s.mode === 'focus' ? 'Fokus' : 'Pause';
    const frac = d ? left / d : 0;
    wrap.classList.toggle('brk', s.mode !== 'focus');
    wrap.classList.toggle('running', !!s.running);
    ringEl.querySelector('.fill').setAttribute('stroke-dashoffset', String(C * (1 - frac)));
    const ang = -frac * 2 * Math.PI;   // Ring läuft gegen den Uhrzeigersinn leer
    const kn = ringEl.querySelector('.knob'); kn.setAttribute('cx', String(140 + R * Math.cos(ang))); kn.setAttribute('cy', String(140 + R * Math.sin(ang)));
    if (s.running) { const e = new Date(s.end); endEl.textContent = `bis ${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')} Uhr`; }
    else endEl.textContent = left < d ? 'angehalten' : `${presetOf(s)[s.mode === 'focus' ? 0 : 1]} Minuten`;
    const sig = (s.running ? 'p' : left < d ? 'w' : 's');
    if (sig !== lastSig) { lastSig = sig; startBtn.replaceChildren(icon(s.running ? 'pause' : 'play'), h('span', { text: s.running ? 'Pause' : left < d ? 'Weiter' : 'Start' })); }
    const n = s.day === new Date().toDateString() ? s.count : 0;
    const goal = Math.max(4, n);
    if (dots.childElementCount !== goal || dots.dataset.n !== String(n)) { dots.dataset.n = String(n); dots.replaceChildren(...Array.from({ length: goal }, (_, i) => h('i' + (i < n ? '.on' : '')))); }
    countEl.textContent = n ? `Heute ${n} Fokus-${n === 1 ? 'Einheit' : 'Einheiten'} geschafft${n >= 4 ? '. Stark!' : ''}` : 'Heute noch keine Fokus-Einheit';
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
// Zahl für Einheiten: sehr groß/klein als 6,21 · 10⁻⁵
const SUPD = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function fmtU(v) {
  if (!isFinite(v)) return de(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-4 || a >= 1e10)) {
    const e = Math.floor(Math.log10(a)), m = v / 10 ** e;
    return `${String(parseFloat(m.toPrecision(4))).replace('.', ',').replace('-', '−')} · 10${String(e).split('').map((c) => SUPD[c]).join('')}`;
  }
  return de(v, 8);
}
function unitsWidget(root) {
  let cat = store.get('unitCat', 'Länge');
  if (!UNITS[cat]) cat = 'Länge';
  const cats = h('div.seg.wrap.unitcats');
  const box = h('div.unitbox');
  const drawCats = () => { cats.textContent = ''; for (const c of Object.keys(UNITS)) cats.append(h('button' + (c === cat ? '.on' : ''), { text: c, on: { click: () => { cat = c; store.set('unitCat', c); drawCats(); drawBox(); } } })); };
  function drawBox() {
    box.textContent = '';
    const list = UNITS[cat];
    const val = h('input.unitval', { type: 'text', inputmode: 'decimal', value: store.get('unitVal', '1'), 'aria-label': 'Wert' });
    const from = h('select.unitsel', { 'aria-label': 'Von' }, ...list.map(([u]) => h('option', { value: u, text: u })));
    const to = h('select.unitsel', { 'aria-label': 'Nach' }, ...list.map(([u]) => h('option', { value: u, text: u })));
    const pair = store.get('unitPair_' + cat, null);
    from.value = pair ? pair[0] : list[cat === 'Temperatur' ? 0 : Math.min(2, list.length - 1)][0];
    to.value = pair ? pair[1] : list[cat === 'Temperatur' ? 1 : Math.min(3, list.length - 1)][0];
    if (!list.some((x) => x[0] === from.value)) from.value = list[0][0];
    if (!list.some((x) => x[0] === to.value)) to.value = list[1][0];
    const out = h('output.unitout');
    const all = h('div.unitall');
    const conv = (v, f, t) => (cat === 'Temperatur' ? convTemp(v, f, t) : v * list.find((x) => x[0] === f)[1] / list.find((x) => x[0] === t)[1]);
    const upd = () => {
      store.set('unitVal', val.value); store.set('unitPair_' + cat, [from.value, to.value]);
      const v = parseFloat(val.value.replace(',', '.').replace('−', '-'));
      all.textContent = '';
      if (isNaN(v)) { out.textContent = '–'; return; }
      out.textContent = fmtU(conv(v, from.value, to.value));
      for (const [u] of list) {
        if (u === from.value) continue;
        all.append(h('button.urow' + (u === to.value ? '.on' : ''), { on: { click: () => { to.value = u; upd(); } } }, h('span', { text: u }), h('b', { text: fmtU(conv(v, from.value, u)) })));
      }
    };
    [val, from, to].forEach((x) => x.addEventListener('input', upd));
    const swap = h('button.uswap', { 'aria-label': 'Tauschen', title: 'Tauschen', on: { click: () => { const a = from.value; from.value = to.value; to.value = a; swap.classList.toggle('turn'); upd(); } } }, icon('undo'));
    box.append(
      h('div.unitpair', null,
        h('label.ucard', null, h('small', { text: 'Von' }), val, from),
        swap,
        h('div.ucard.res', null, h('small', { text: 'Ergebnis' }), out, to)),
      h('p.fieldlabel', { text: 'In allen Einheiten' }), all);
    upd();
  }
  drawCats(); drawBox();
  root.append(cats, box);
}

// ================= Periodensystem =================
// Symbol, Name, Atommasse (u), Gruppe: am Alkalimetall, ae Erdalkali, tm Übergangsmetall, pm Metall, md Halbmetall, nm Nichtmetall, hg Halogen, ng Edelgas, la Lanthanoid, ac Actinoid
const PSE_RAW = 'H Wasserstoff 1.008 nm|He Helium 4.003 ng|Li Lithium 6.94 am|Be Beryllium 9.012 ae|B Bor 10.81 md|C Kohlenstoff 12.011 nm|N Stickstoff 14.007 nm|O Sauerstoff 15.999 nm|F Fluor 18.998 hg|Ne Neon 20.180 ng|Na Natrium 22.990 am|Mg Magnesium 24.305 ae|Al Aluminium 26.982 pm|Si Silicium 28.085 md|P Phosphor 30.974 nm|S Schwefel 32.06 nm|Cl Chlor 35.45 hg|Ar Argon 39.948 ng|K Kalium 39.098 am|Ca Calcium 40.078 ae|Sc Scandium 44.956 tm|Ti Titan 47.867 tm|V Vanadium 50.942 tm|Cr Chrom 51.996 tm|Mn Mangan 54.938 tm|Fe Eisen 55.845 tm|Co Cobalt 58.933 tm|Ni Nickel 58.693 tm|Cu Kupfer 63.546 tm|Zn Zink 65.38 tm|Ga Gallium 69.723 pm|Ge Germanium 72.630 md|As Arsen 74.922 md|Se Selen 78.971 nm|Br Brom 79.904 hg|Kr Krypton 83.798 ng|Rb Rubidium 85.468 am|Sr Strontium 87.62 ae|Y Yttrium 88.906 tm|Zr Zirconium 91.224 tm|Nb Niob 92.906 tm|Mo Molybdän 95.95 tm|Tc Technetium 98 tm|Ru Ruthenium 101.07 tm|Rh Rhodium 102.91 tm|Pd Palladium 106.42 tm|Ag Silber 107.87 tm|Cd Cadmium 112.41 tm|In Indium 114.82 pm|Sn Zinn 118.71 pm|Sb Antimon 121.76 md|Te Tellur 127.60 md|I Iod 126.90 hg|Xe Xenon 131.29 ng|Cs Caesium 132.91 am|Ba Barium 137.33 ae|La Lanthan 138.91 la|Ce Cer 140.12 la|Pr Praseodym 140.91 la|Nd Neodym 144.24 la|Pm Promethium 145 la|Sm Samarium 150.36 la|Eu Europium 151.96 la|Gd Gadolinium 157.25 la|Tb Terbium 158.93 la|Dy Dysprosium 162.50 la|Ho Holmium 164.93 la|Er Erbium 167.26 la|Tm Thulium 168.93 la|Yb Ytterbium 173.05 la|Lu Lutetium 174.97 la|Hf Hafnium 178.49 tm|Ta Tantal 180.95 tm|W Wolfram 183.84 tm|Re Rhenium 186.21 tm|Os Osmium 190.23 tm|Ir Iridium 192.22 tm|Pt Platin 195.08 tm|Au Gold 196.97 tm|Hg Quecksilber 200.59 tm|Tl Thallium 204.38 pm|Pb Blei 207.2 pm|Bi Bismut 208.98 pm|Po Polonium 209 pm|At Astat 210 hg|Rn Radon 222 ng|Fr Francium 223 am|Ra Radium 226 ae|Ac Actinium 227 ac|Th Thorium 232.04 ac|Pa Protactinium 231.04 ac|U Uran 238.03 ac|Np Neptunium 237 ac|Pu Plutonium 244 ac|Am Americium 243 ac|Cm Curium 247 ac|Bk Berkelium 247 ac|Cf Californium 251 ac|Es Einsteinium 252 ac|Fm Fermium 257 ac|Md Mendelevium 258 ac|No Nobelium 259 ac|Lr Lawrencium 266 ac|Rf Rutherfordium 267 tm|Db Dubnium 268 tm|Sg Seaborgium 269 tm|Bh Bohrium 270 tm|Hs Hassium 277 tm|Mt Meitnerium 278 tm|Ds Darmstadtium 281 tm|Rg Roentgenium 282 tm|Cn Copernicium 285 tm|Nh Nihonium 286 pm|Fl Flerovium 289 pm|Mc Moscovium 290 pm|Lv Livermorium 293 pm|Ts Tenness 294 hg|Og Oganesson 294 ng';
export const CATS = { am: 'Alkalimetall', ae: 'Erdalkalimetall', tm: 'Übergangsmetall', pm: 'Metall', md: 'Halbmetall', nm: 'Nichtmetall', hg: 'Halogen', ng: 'Edelgas', la: 'Lanthanoid', ac: 'Actinoid' };
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
export function pseWidget(root) {
  const q = h('input.field', { type: 'search', placeholder: 'Suchen: Name, Symbol oder Ordnungszahl', autocomplete: 'off' });
  const grid = h('div.pse');
  for (const e of ELEMENTS) {
    grid.append(h('button.el.' + e.cat, { style: { gridRow: String(e.row), gridColumn: String(e.col) }, 'data-k': `${e.z} ${e.sym} ${e.name}`.toLowerCase(), on: { click: () => import('./chem.js').then((m) => m.elSheet(e)) } },
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

// Kleine Strichzeichnungen zu den Geometrie-Formeln (viewBox 0 0 96 72)
const FIG = {
  'Pythagoras': '<path class="fl" d="M14 60 L82 60 L14 16 Z"/><path class="ra" d="M14 50 h10 v10"/><text x="48" y="70">a</text><text x="6" y="40">b</text><text x="52" y="34">c</text>',
  'Rechteck': '<rect class="fl" x="14" y="16" width="68" height="40" rx="2"/><text x="48" y="68">a</text><text x="86" y="40">b</text>',
  'Dreieck': '<path class="fl" d="M10 58 L86 58 L56 12 Z"/><path class="dh" d="M56 12 V58"/><path class="ra" d="M56 50 h-8 v8"/><text x="30" y="69">g</text><text x="60" y="38">h</text>',
  'Trapez': '<path class="fl" d="M8 58 L88 58 L68 16 L26 16 Z"/><path class="dh" d="M40 16 V58"/><text x="48" y="69">a</text><text x="48" y="11">c</text><text x="46" y="40">h</text>',
  'Parallelogramm': '<path class="fl" d="M8 58 L68 58 L88 16 L28 16 Z"/><path class="dh" d="M28 16 V58"/><text x="40" y="69">g</text><text x="34" y="40">h</text>',
  'Kreis': '<circle class="fl" cx="48" cy="36" r="27"/><path class="ln" d="M48 36 L75 36"/><circle class="pt" cx="48" cy="36" r="2.4"/><text x="62" y="31">r</text>',
  'Quader': '<path class="fl" d="M12 26 L62 26 L62 62 L12 62 Z"/><path class="fl2" d="M12 26 L30 12 L80 12 L62 26 Z M62 26 L80 12 L80 48 L62 62 Z"/><text x="36" y="71">a</text><text x="74" y="62">b</text><text x="3" y="47">c</text>',
  'Würfel': '<path class="fl" d="M16 24 L56 24 L56 64 L16 64 Z"/><path class="fl2" d="M16 24 L32 10 L72 10 L56 24 Z M56 24 L72 10 L72 50 L56 64 Z"/><text x="34" y="72">a</text>',
  'Zylinder': '<path class="fl" d="M22 16 V56 A26 8 0 0 0 74 56 V16"/><ellipse class="fl2" cx="48" cy="16" rx="26" ry="8"/><path class="dh" d="M22 56 A26 8 0 0 1 74 56"/><path class="ln" d="M48 16 H74"/><text x="62" y="5">r</text><text x="81" y="40">h</text>',
  'Kegel': '<path class="fl" d="M48 8 L20 56 A28 8 0 0 0 76 56 Z"/><path class="dh" d="M20 56 A28 8 0 0 1 76 56 M48 8 V56"/><path class="ln" d="M48 56 H76"/><text x="60" y="70">r</text><text x="51" y="36">h</text>',
  'Pyramide': '<path class="fl" d="M12 54 L58 64 L48 10 Z"/><path class="fl2" d="M58 64 L84 50 L48 10 Z"/><path class="dh" d="M12 54 L38 42 L84 50 M38 42 L48 10"/><text x="30" y="70">G</text>',
  'Kugel': '<circle class="fl" cx="48" cy="36" r="28"/><ellipse class="dh" cx="48" cy="36" rx="28" ry="8"/><path class="ln" d="M48 36 L76 36"/><circle class="pt" cx="48" cy="36" r="2.4"/><text x="62" y="24">r</text>',
};
function figEl(name) {
  if (!FIG[name]) return null;
  const d = h('div.ffig'); d.innerHTML = `<svg viewBox="0 0 96 72" aria-hidden="true">${FIG[name]}</svg>`; return d;
}
function formulasWidget(root, ctx) {
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
    if (cat === 'Physik' && !v && ctx) list.append(h('button.fcard.physlink', { on: { click: () => ctx.go({ view: 'kit', tab: 'phys' }) } }, h('div.ftext', null, h('b', { text: 'Mit Physik-Formeln rechnen' }), h('span', { text: 'Nach jeder Größe umstellen, Werte mit Einheiten einsetzen, Rechenweg sehen' }))));
    for (const [c, n, f, note] of items) { const fig = figEl(n); list.append(h('div.fcard' + (fig ? '.hasfig' : '') + '.cat-' + c.toLowerCase(), null, h('div.ftext', null, h('small', { text: v ? c : '' }), h('b', { text: n }), h('pre.fmath', { text: fig ? f.replace(/ {3,}/g, '\n') : f }), note ? h('span', { text: note }) : null), fig)); }
  };
  q.addEventListener('input', draw);
  draw();
  root.append(q, cats, list);
}
