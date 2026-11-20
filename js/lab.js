// Mini-Labor: kleine virtuelle Experimente (vereinfacht, nur zum Anschauen). Offline.
import { h, toast } from './ui.js';
import { phColor } from './chem.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (markup, vb, cls) => { const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', vb); s.setAttribute('class', cls); s.innerHTML = markup; return s; };
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function labView(root) {
  const seg = h('div.seg');
  const box = h('div.labbox');
  const EXP = [['flame', 'Flammenfärbung', flameLab], ['ph', 'pH-Labor', phLab], ['alkali', 'Metall in Wasser', alkaliLab]];
  let stop = null;
  const show = (k) => {
    if (stop) { stop(); stop = null; }
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    box.textContent = '';
    stop = EXP.find((x) => x[0] === k)[2](box) || null;
  };
  for (const [k, l] of EXP) seg.append(h('button', { 'data-k': k, text: l, on: { click: () => show(k) } }));
  root.append(h('p.labnote', { text: 'Virtuelles Labor: vereinfacht und nur zum Anschauen. Echte Versuche nur mit Lehrkraft und Schutzbrille.' }), seg, box);
  show('flame');
  // aufräumen, wenn die Ansicht verlassen wird
  const mo = new MutationObserver(() => { if (!box.isConnected) { if (stop) stop(); mo.disconnect(); } });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ---------- Flammenfärbung ----------
const SALTS = [
  ['Li', 'Lithiumchlorid', '#e8323c', 'karminrot'], ['Na', 'Natriumchlorid', '#ffb21a', 'gelb-orange'], ['K', 'Kaliumchlorid', '#b37cf0', 'violett (blassviolett)'],
  ['Ca', 'Calciumchlorid', '#f0602a', 'ziegelrot'], ['Sr', 'Strontiumchlorid', '#ff2850', 'kräftig rot'], ['Ba', 'Bariumchlorid', '#a8d94a', 'fahlgrün'], ['Cu', 'Kupferchlorid', '#22c4a8', 'blaugrün'],
];
function flameLab(box) {
  const flame = svgEl(`
    <defs>
      <radialGradient id="fo" cx="50%" cy="78%" r="65%"><stop offset="0" style="stop-color:var(--fl)" stop-opacity=".95"/><stop offset=".55" style="stop-color:var(--fl)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--fl)" stop-opacity="0"/></radialGradient>
      <radialGradient id="fi" cx="50%" cy="85%" r="60%"><stop offset="0" stop-color="#9fd4ff" stop-opacity=".95"/><stop offset="1" stop-color="#3b6fd8" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="fl"><path class="outer" d="M100 40 C 132 88 146 120 140 150 C 136 176 120 190 100 190 C 80 190 64 176 60 150 C 54 120 68 88 100 40 Z" fill="url(#fo)"/>
    <path class="inner" d="M100 110 C 112 132 118 148 116 160 C 114 174 108 182 100 182 C 92 182 86 174 84 160 C 82 148 88 132 100 110 Z" fill="url(#fi)"/></g>
    <rect x="86" y="190" width="28" height="70" rx="3" class="burner"/><rect x="66" y="258" width="68" height="12" rx="4" class="burner"/>
    <g class="wire" opacity="0"><line x1="168" y1="96" x2="112" y2="150" class="wireline"/><circle cx="110" cy="152" r="5" class="wiretip"/></g>`, '0 0 200 280', 'flamesvg');
  flame.style.setProperty('--fl', '#3b6fd8');
  const info = h('div.labinfo', null, h('b', { text: 'Wähle ein Salz' }), h('small', { text: 'Ein Magnesiastäbchen mit Salz wird in die nicht leuchtende Brennerflamme gehalten.' }));
  const chips = h('div.labchips', null, ...SALTS.map(([sym, name, col, word]) => h('button.labchip', { style: { '--c': col }, on: { click: (e) => {
    chips.querySelectorAll('.labchip').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    flame.querySelector('.wire').setAttribute('opacity', '1');
    flame.style.setProperty('--fl', col);
    flame.classList.remove('flare'); void flame.getBoundingClientRect(); flame.classList.add('flare');
    info.textContent = '';
    info.append(h('b', { text: `${name}: ${word}` }), h('small', { text: `Die Flamme zeigt die Farbe von ${sym}. Die Elektronen werden durch die Hitze angeregt und senden beim Zurückfallen Licht einer ganz bestimmten Farbe aus. So kann man Elemente nachweisen.` }));
  } } }, h('i'), h('span', { text: sym }))));
  box.append(h('div.labstage', null, h('div.labscene.dark', null, flame), h('div.labside', null, info, chips,
    h('button.btn', { text: 'Flamme zurücksetzen', on: { click: () => { flame.style.setProperty('--fl', '#3b6fd8'); flame.querySelector('.wire').setAttribute('opacity', '0'); chips.querySelectorAll('.labchip').forEach((b) => b.classList.remove('on')); } } }))));
}

// ---------- pH-Labor ----------
const SUBST = [['Wasser', 7], ['Zitronensaft', 2.4], ['Essig', 2.9], ['Cola', 2.5], ['Seifenwasser', 9.8], ['Natron-Lösung', 8.4], ['Rohrreiniger', 13.5], ['Salzsäure (verd.)', 1]];
const IND = {
  uni: ['Universalindikator', (p) => phColor(p)],
  bt: ['Bromthymolblau', (p) => (p < 6 ? '#e8c73a' : p < 7.6 ? mix('#e8c73a', '#2f8fd8', (p - 6) / 1.6) : '#2f6fd8')],
  pp: ['Phenolphthalein', (p) => (p < 8.2 ? 'rgba(230,236,245,.55)' : mix('#f6c6e6', '#d81b8c', Math.min(1, (p - 8.2) / 1.8)))],
  rk: ['Rotkohlsaft', (p) => (p < 3 ? '#d3254a' : p < 6 ? mix('#d3254a', '#8a3fa8', (p - 3) / 3) : p < 8 ? mix('#8a3fa8', '#3c5bc8', (p - 6) / 2) : p < 11 ? mix('#3c5bc8', '#2fa36a', (p - 8) / 3) : mix('#2fa36a', '#d9c63a', Math.min(1, (p - 11) / 2)))],
};
function mix(a, b, t) {
  const p = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`;
}
// Knopf: tippen = ein Tropfen, gedrückt halten = weiter tropfen
function holdBtn(tag, text, fn) {
  let t = null, d = null;
  const end = () => { clearTimeout(d); clearInterval(t); t = d = null; };
  return h(tag, { text, on: {
    pointerdown: (e) => { e.preventDefault(); fn(); d = setTimeout(() => { t = setInterval(fn, 140); }, 380); },
    pointerup: end, pointerleave: end, pointercancel: end,
  } });
}
function phLab(box) {
  // Modell: starke Säure/Lauge, Menge in mmol (positiv = Säure), Volumen in mL
  let V = 50, net = 0, ind = 'uni', drops = 0;
  const setPh = (p) => { net = (10 ** -p - 10 ** -(14 - p)) * V; };
  const ph = () => { const c = net / V; const hp = (c + Math.sqrt(c * c + 4e-14)) / 2; return Math.max(0, Math.min(14, -Math.log10(hp))); };
  setPh(7);
  const liquid = svgEl(`<defs><clipPath id="beak"><path d="M42 30 L42 222 Q42 240 60 240 L160 240 Q178 240 178 222 L178 30 Z"/></clipPath></defs>
    <g clip-path="url(#beak)"><rect class="liq" x="30" y="110" width="160" height="140"/><g class="bubbles"></g></g>
    <path d="M36 24 L42 30 L42 222 Q42 240 60 240 L160 240 Q178 240 178 222 L178 30 L184 24" class="glass"/>
    <g class="ticks">${[80, 110, 140, 170, 200].map((y) => `<line x1="150" x2="170" y1="${y}" y2="${y}"/>`).join('')}</g>
    <circle class="drop" cx="110" cy="0" r="6" opacity="0"/>`, '0 0 220 260', 'beaker');
  const val = h('b.phval'), word = h('small.phword');
  const meter = h('div.phmeter', null, val, word);
  const draw = () => {
    const p = ph();
    liquid.querySelector('.liq').setAttribute('fill', IND[ind][1](p));
    const lvl = Math.max(50, 110 - (V - 50) * 1.4);
    liquid.querySelector('.liq').setAttribute('y', String(lvl));
    val.textContent = 'pH ' + p.toFixed(1).replace('.', ',');
    word.textContent = p < 6.5 ? 'sauer' : p > 7.5 ? 'basisch' : 'neutral';
    meter.style.setProperty('--c', phColor(p));
  };
  const drop = (acid) => {
    if (V > 92) { toast('Das Becherglas ist voll. Starte neu.'); return; }
    net += acid ? 0.5 : -0.5; V += 0.5; drops++;
    const d = liquid.querySelector('.drop');
    d.setAttribute('fill', acid ? '#f2a9a9' : '#a9c8f2');
    if (!reduced()) { d.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(110px)', opacity: 0.2 }], { duration: 360, easing: 'ease-in' }); }
    setTimeout(draw, reduced() ? 0 : 300);
    if (drops === 1) toast('Ein Tropfen = 0,5 mL Säure oder Lauge (1 mol/L). Gedrückt halten tropft weiter.');
  };
  const sub = h('div.labchips', null, ...SUBST.map(([n, p]) => h('button.labchip', { on: { click: (e) => { sub.querySelectorAll('.labchip').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); V = 50; setPh(p); draw(); } } }, h('span', { text: n }))));
  const indSeg = h('div.seg.wrap', null, ...Object.entries(IND).map(([k, [l]]) => h('button' + (k === ind ? '.on' : ''), { text: l, on: { click: (e) => { ind = k; indSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw(); } } })));
  box.append(h('div.labstage', null, h('div.labscene', null, liquid, meter), h('div.labside', null,
    h('p.fieldlabel', { text: 'Indikator' }), indSeg,
    h('p.fieldlabel', { text: 'Was ist im Becherglas?' }), sub,
    h('p.fieldlabel', { text: 'Tropfen dazugeben' }),
    h('div.labbtns', null, holdBtn('button.btn.acid', '+ Salzsäure', () => drop(true)), holdBtn('button.btn.base', '+ Natronlauge', () => drop(false))),
    h('p.calm.small', { text: 'Tipp: Säure in Lauge tropfen, bis der Indikator die Farbe wechselt. Das ist eine Neutralisation (Titration). Schwache Säuren sind hier vereinfacht.' }))));
  draw();
}

// ---------- Alkalimetall in Wasser ----------
const ALK = { Li: ['Lithium', 0.5, null, 'reagiert ruhig, sprudelt langsam'], Na: ['Natrium', 1, '#ffcf4a', 'schmilzt zur Kugel und zischt über das Wasser'], K: ['Kalium', 1.8, '#c79bff', 'entzündet sich sofort mit violetter Flamme'] };
function alkaliLab(box) {
  const cv = h('canvas.alkcv');
  const eq = h('p.eq');
  const info = h('div.labinfo', null, h('b', { text: 'Wähle ein Metall' }), h('small', { text: 'Ins Wasser kommen ein paar Tropfen Phenolphthalein. Es färbt sich pink, wenn eine Lauge entsteht.' }));
  let raf = 0, t0 = 0, metal = null, pink = 0, parts = [], x = 0.5, vx = 0;
  const ctx = cv.getContext('2d');
  const size = () => { const w = cv.clientWidth || 600, hh = cv.clientHeight || 340, d = Math.min(2, window.devicePixelRatio || 1); cv.width = w * d; cv.height = hh * d; ctx.setTransform(d, 0, 0, d, 0, 0); return [w, hh]; };
  let W = 600, H = 340;
  const frame = (t) => {
    const dt = Math.min(0.05, (t - (t0 || t)) / 1000); t0 = t;
    ctx.clearRect(0, 0, W, H);
    const surf = H * 0.42;
    // Becken
    const g = ctx.createLinearGradient(0, surf, 0, H);
    const pk = Math.min(1, pink);
    g.addColorStop(0, `rgba(${Math.round(120 + 115 * pk)},${Math.round(180 - 120 * pk)},${Math.round(230 - 60 * pk)},.55)`);
    g.addColorStop(1, `rgba(${Math.round(70 + 150 * pk)},${Math.round(130 - 100 * pk)},${Math.round(210 - 60 * pk)},.8)`);
    ctx.fillStyle = g; ctx.fillRect(0, surf, W, H - surf);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= W; i += 8) ctx.lineTo(i, surf + Math.sin(i / 30 + t / 400) * (metal ? 2.5 * ALK[metal][1] : 1));
    ctx.stroke();
    if (metal) {
      const k = ALK[metal][1];
      vx += (Math.random() - 0.5) * k * dt * 2.4; vx *= 0.995; vx = Math.max(-0.35 * k, Math.min(0.35 * k, vx)); x += vx * dt;
      if (x < 0.08 || x > 0.92) { vx = -vx; x = Math.max(0.08, Math.min(0.92, x)); }
      const mx = x * W, my = surf - 6 + Math.sin(t / 90) * k;
      pink += dt * 0.12 * k;
      for (let i = 0; i < Math.ceil(3 * k); i++) parts.push({ x: mx + (Math.random() - 0.5) * 14, y: my + 6, vy: -20 - Math.random() * 40 * k, r: 1.5 + Math.random() * 2.5, life: 1, kind: 'gas' });
      if (ALK[metal][2]) for (let i = 0; i < Math.ceil(2 * k); i++) parts.push({ x: mx + (Math.random() - 0.5) * 10, y: my - 4, vy: -40 - Math.random() * 60, r: 4 + Math.random() * 6 * k, life: 1, kind: 'fire' });
      ctx.fillStyle = '#c9ccd3'; ctx.beginPath(); ctx.arc(mx, my, 7 + k * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(mx - 3, my - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.y += p.vy * dt; p.life -= dt * (p.kind === 'fire' ? 2.2 : 1.1);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.kind === 'fire' ? ALK[metal || 'K'][2] || '#ffcf4a' : 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r * (p.kind === 'fire' ? p.life : 1)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (parts.length > 900) parts.splice(0, parts.length - 900);
    raf = requestAnimationFrame(frame);
  };
  const start = (m) => {
    metal = m; pink = 0; x = 0.5; vx = 0.12 * ALK[m][1] * (Math.random() < 0.5 ? -1 : 1); parts = [];
    chips.querySelectorAll('.labchip').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    const [name, , , txt] = ALK[m];
    info.textContent = '';
    info.append(h('b', { text: `${name} ${txt}.` }), h('small', { text: 'Es entsteht Wasserstoff (Bläschen) und eine Lauge: Das Wasser wird pink. Je weiter unten in der 1. Hauptgruppe, desto heftiger die Reaktion.' }));
    eq.textContent = `2 ${m} + 2 H₂O → 2 ${m}OH + H₂ ↑`;
  };
  const chips = h('div.labchips', null, ...Object.entries(ALK).map(([m, [n]]) => h('button.labchip', { 'data-m': m, on: { click: () => start(m) } }, h('span', { text: `${m} · ${n}` }))));
  box.append(h('div.labstage', null, h('div.labscene.water', null, cv), h('div.labside', null, info, chips, eq,
    h('button.btn', { text: 'Neues Wasser', on: { click: () => { metal = null; pink = 0; parts = []; eq.textContent = ''; chips.querySelectorAll('.labchip').forEach((b) => b.classList.remove('on')); } } }))));
  requestAnimationFrame(() => { [W, H] = size(); raf = requestAnimationFrame(frame); });
  const ro = new ResizeObserver(() => { [W, H] = size(); }); ro.observe(cv);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}
