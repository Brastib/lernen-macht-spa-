// Chemie: Atommodell, Übersichten (Bindungen, Organik, Säuren/Basen, Metalle), Molmasse-Rechner. Alles offline.
import { h, icon, toast, sheet } from './ui.js';
import { ELEMENTS, CATS, pseWidget } from './kit.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (markup, vb, cls = '') => {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', vb); if (cls) s.setAttribute('class', cls);
  s.innerHTML = markup; return s;
};
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const sup = (s) => String(s).replace(/[0-9+-]/g, (c) => SUP[c]);
export const sub = (s) => String(s).replace(/([A-Za-z)])(\d+)/g, (_, a, d) => a + d.replace(/[0-9]/g, (c) => SUB[c]));
const de = (v, d = 3) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',').replace('-', '−');

// ================= Elektronenkonfiguration =================
const ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
const CAP = { s: 2, p: 6, d: 10, f: 14 };
// Elemente, die von der einfachen Auffüll-Regel abweichen
const EXC = {
  24: { '4s': 1, '3d': 5 }, 29: { '4s': 1, '3d': 10 }, 41: { '5s': 1, '4d': 4 }, 42: { '5s': 1, '4d': 5 }, 44: { '5s': 1, '4d': 7 }, 45: { '5s': 1, '4d': 8 },
  46: { '5s': 0, '4d': 10 }, 47: { '5s': 1, '4d': 10 }, 57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 }, 64: { '4f': 7, '5d': 1 }, 78: { '6s': 1, '5d': 9 },
  79: { '6s': 1, '5d': 10 }, 89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 }, 91: { '5f': 2, '6d': 1 }, 92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 },
  96: { '5f': 7, '6d': 1 }, 103: { '6d': 0, '7p': 1 },
};
const NOBLE = [[86, 'Rn'], [54, 'Xe'], [36, 'Kr'], [18, 'Ar'], [10, 'Ne'], [2, 'He']];
function fill(z) {
  const m = {};
  let left = z;
  for (const o of ORDER) { if (!left) break; const n = Math.min(CAP[o[1]], left); m[o] = n; left -= n; }
  if (EXC[z]) Object.assign(m, EXC[z]);
  return m;
}
export function electronConfig(z) {
  const m = fill(z);
  const shells = [];
  for (const [o, n] of Object.entries(m)) { const k = +o[0] - 1; shells[k] = (shells[k] || 0) + n; }
  for (let i = 0; i < shells.length; i++) shells[i] = shells[i] || 0;
  while (shells.length > 1 && !shells[shells.length - 1]) shells.pop();
  const sortKey = (o) => +o[0] * 10 + 'spdf'.indexOf(o[1]);
  const fmt = (mm) => Object.entries(mm).filter(([, n]) => n > 0).sort((a, b) => sortKey(a[0]) - sortKey(b[0])).map(([o, n]) => o + sup(n)).join(' ');
  let short = fmt(m);
  const ng = NOBLE.find(([nz]) => nz < z);
  if (ng) {
    const core = fill(ng[0]);
    const rest = {};
    for (const [o, n] of Object.entries(m)) { const r = n - (core[o] || 0); if (r > 0) rest[o] = r; }
    short = `[${ng[1]}] ${fmt(rest)}`;
  }
  return { full: fmt(m), short, shells };
}

// ================= Atommodell (Schalenmodell nach Bohr, vereinfacht) =================
const SHELL_NAMES = 'KLMNOPQ';
export function atomModel(e) {
  const { shells } = electronConfig(e.z);
  const k = shells.length, R0 = 46, R1 = 142;
  const neutrons = Math.max(0, Math.round(e.mass) - e.z);
  let m = '';
  shells.forEach((n, i) => {
    const r = k === 1 ? 80 : R0 + (R1 - R0) * i / (k - 1);
    const outer = i === k - 1;
    m += `<circle class="orbit" cx="160" cy="160" r="${r}"/>`;
    m += `<g class="shell" style="animation-duration:${14 + i * 7}s;${i % 2 ? 'animation-direction:reverse;' : ''}">`;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 - Math.PI / 2 + i * 0.35;
      m += `<circle class="electron${outer ? ' val' : ''}" cx="${(160 + r * Math.cos(a)).toFixed(2)}" cy="${(160 + r * Math.sin(a)).toFixed(2)}" r="${n > 18 ? 3.6 : 4.6}"/>`;
    }
    m += '</g>';
    m += `<text class="shellname" x="${160 + r * 0.707 + 4}" y="${160 - r * 0.707 - 4}">${SHELL_NAMES[i]}</text>`;
  });
  m += `<g class="nucleus"><circle cx="160" cy="160" r="30"/><text x="160" y="155" class="nuc1">${e.z} p⁺</text><text x="160" y="172" class="nuc2">${neutrons} n</text></g>`;
  const s = svg(m, '0 0 320 320', 'atom');
  // Easter Egg: fünfmal auf den Kern tippen
  let taps = 0, tt = null;
  s.querySelector('.nucleus').addEventListener('click', () => {
    taps++; clearTimeout(tt); tt = setTimeout(() => { taps = 0; }, 1200);
    if (taps >= 5) { taps = 0; s.classList.add('turbo'); toast('Teilchenbeschleuniger an. Keine Sorge, es ist nur Spaß.'); setTimeout(() => s.classList.remove('turbo'), 4000); }
  });
  return s;
}

// Lewis-Schreibweise: Symbol mit Valenzelektronen als Punkte (nur Hauptgruppen)
export function lewis(e, v) {
  if (v == null) return null;
  const pos = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const slots = [0, 0, 0, 0];
  if (e.z === 2) slots[0] = 2;
  else for (let i = 0; i < v; i++) slots[i % 4]++;
  let m = `<text x="60" y="60" class="lsym">${e.sym}</text>`;
  slots.forEach((n, i) => {
    const [dx, dy] = pos[i];
    for (let j = 0; j < n; j++) {
      const off = n === 2 ? (j ? 6 : -6) : 0;
      const x = 60 + dx * 30 + (dy ? off : 0), y = 60 + dy * 30 + (dx ? off : 0);
      m += `<circle cx="${x}" cy="${y}" r="3.6" class="ldot"/>`;
    }
  });
  return svg(m, '0 0 120 120', 'lewis');
}

const valence = (e) => (e.group <= 2 ? e.group : e.group >= 13 ? (e.z === 2 ? 2 : e.group - 10) : null);
export function elSheet(e) {
  const v = valence(e);
  const cfg = electronConfig(e.z);
  return sheet(`${e.name} (${e.sym})`, (body, close) => {
    const rows = [['Ordnungszahl', String(e.z)], ['Atommasse', `${String(e.mass).replace('.', ',')} u`], ['Gruppe', CATS[e.cat]], ['Periode', String(e.period)],
      ['Hauptgruppe', e.group <= 2 ? `${e.group}. Hauptgruppe` : e.group >= 13 ? `${e.group - 10}. Hauptgruppe` : 'Nebengruppe'],
      v != null ? ['Außenelektronen', String(v)] : null, ['Protonen / Elektronen', `${e.z} / ${e.z}`],
      ['Neutronen (häufigstes Isotop, ca.)', String(Math.max(0, Math.round(e.mass) - e.z))],
      ['Elektronen pro Schale', cfg.shells.map((n, i) => `${SHELL_NAMES[i]} ${n}`).join(' · ')]].filter(Boolean);
    const lw = lewis(e, v);
    body.append(...[
      h('div.elhero', null,
        h('div.elhead.' + e.cat, null, h('small', { text: String(e.z) }), h('b', { text: e.sym }), h('span', { text: e.name }), h('em', { text: CATS[e.cat] })),
        h('div.atomwrap', null, atomModel(e), h('small', { text: 'Schalenmodell (vereinfacht). Außenelektronen sind farbig.' }))),
      h('div.elcfg', null, h('small', { text: 'Elektronenkonfiguration' }), h('b', { text: cfg.short }), cfg.short !== cfg.full ? h('span', { text: cfg.full }) : null),
      lw ? h('div.ellewis', null, lw, h('span', null, h('b', { text: 'Elektronenschreibweise' }), h('small', { text: `${v} Außenelektronen als Punkte. ${v >= 4 && e.cat !== 'ng' ? `Für die Edelgasregel fehlen ${8 - v}.` : e.cat === 'ng' ? 'Volle Außenschale: sehr reaktionsträge.' : `Gibt leicht ${v} Elektron${v > 1 ? 'en' : ''} ab.`}` }))) : null,
      h('div.eltable', null, ...rows.map(([k, val]) => h('div.elrow', null, h('span', { text: k }), h('b', { text: val })))),
      h('p.calm.small', { text: 'Werte gerundet. Bei sehr schweren Elementen ist die Masse die des stabilsten Isotops.' }),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } }))].filter(Boolean));
  }, { wide: true });
}

// ================= Übersicht: Abschnitte =================
const SECTIONS = [['pse', 'Periodensystem'], ['bind', 'Bindungen'], ['org', 'Organik'], ['alk', 'Alkane benennen'], ['acid', 'Säuren & Basen'], ['metal', 'Metalle'], ['mol', 'Molmasse'], ['lab', 'Labor']];
export function chemWidget(root) {
  let cur = 'pse';
  try { cur = localStorage.getItem('chemSec') || 'pse'; } catch (e) { /* egal */ }
  if (!SECTIONS.some(([k]) => k === cur)) cur = 'pse';
  const tabs = h('div.seg.chemtabs');
  const body = h('div.chembody');
  const show = (k) => {
    cur = k;
    try { localStorage.setItem('chemSec', k); } catch (e) { /* egal */ }
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    body.textContent = '';
    ({ pse: pseWidget, bind: bondsView, org: organicView, acid: acidView, metal: metalView, mol: molView, alk: (r) => import('./alkane.js').then((m) => m.alkaneView(r)), lab: (r) => import('./lab.js').then((m) => m.labView(r)) })[k](body);
  };
  for (const [k, l] of SECTIONS) tabs.append(h('button', { 'data-k': k, text: l, on: { click: () => show(k) } }));
  root.append(h('div.chemtabswrap', null, tabs), body);
  show(cur);
}

const card = (title, sub, figure, ...kids) => h('article.chemcard', null,
  figure ? h('div.chemfig', null, figure) : null,
  h('div.chemtext', null, h('h3', { text: title }), sub ? h('p.chemsub', { text: sub }) : null, ...kids));
const facts = (list) => h('ul.chemfacts', null, ...list.map((t) => h('li', { text: t })));

// ----- Bindungen -----
function bondsView(root) {
  const ion = svg(Array.from({ length: 16 }, (_, i) => { const x = 30 + (i % 4) * 46, y = 26 + Math.floor(i / 4) * 40, na = (i + Math.floor(i / 4)) % 2 === 0;
    return `<circle cx="${x}" cy="${y}" r="${na ? 11 : 17}" class="${na ? 'cat' : 'an'}"/><text x="${x}" y="${y + 4}" class="ionl">${na ? 'Na⁺' : 'Cl⁻'}</text>`; }).join(''), '0 0 200 170', 'chemsvg');
  const cov = svg(`<circle cx="70" cy="60" r="34" class="shellc"/><circle cx="130" cy="60" r="34" class="shellc"/><text x="70" y="66" class="big">Cl</text><text x="130" y="66" class="big">Cl</text>
    <circle cx="100" cy="52" r="4" class="pair"/><circle cx="100" cy="68" r="4" class="pair"/>
    <text x="100" y="128" class="formula">Cl — Cl</text>`, '0 0 200 150', 'chemsvg');
  const polar = svg(`<g transform="translate(100 70)"><circle r="28" class="oxy"/><text y="6" class="big">O</text>
    <line x1="-18" y1="18" x2="-52" y2="44" class="bond"/><line x1="18" y1="18" x2="52" y2="44" class="bond"/>
    <circle cx="-62" cy="52" r="16" class="hyd"/><circle cx="62" cy="52" r="16" class="hyd"/><text x="-62" y="57" class="mid">H</text><text x="62" y="57" class="mid">H</text>
    <text x="0" y="-38" class="delta">δ−</text><text x="-62" y="88" class="delta">δ+</text><text x="62" y="88" class="delta">δ+</text></g>`, '0 0 200 170', 'chemsvg');
  const metal = svg(Array.from({ length: 12 }, (_, i) => { const x = 34 + (i % 4) * 44, y = 34 + Math.floor(i / 4) * 44; return `<circle cx="${x}" cy="${y}" r="15" class="core"/><text x="${x}" y="${y + 4}" class="ionl">+</text>`; }).join('') +
    Array.from({ length: 22 }, (_, i) => `<circle cx="${(14 + (i * 37) % 176).toFixed(0)}" cy="${(14 + (i * 23) % 140).toFixed(0)}" r="2.8" class="egas"/>`).join(''), '0 0 200 170', 'chemsvg metalsvg');
  const hb = svg(`<g class="w1"><circle cx="50" cy="60" r="18" class="oxy"/><text x="50" y="65" class="mid">O</text><line x1="38" y1="72" x2="24" y2="92" class="bond"/><line x1="62" y1="72" x2="80" y2="84" class="bond"/><text x="20" y="106" class="small">H</text><text x="88" y="92" class="small">H</text></g>
    <line x1="96" y1="88" x2="128" y2="96" class="hbond"/>
    <g><circle cx="146" cy="100" r="18" class="oxy"/><text x="146" y="105" class="mid">O</text><line x1="158" y1="112" x2="172" y2="132" class="bond"/><line x1="134" y1="112" x2="120" y2="132" class="bond"/><text x="176" y="146" class="small">H</text><text x="112" y="146" class="small">H</text></g>`, '0 0 200 170', 'chemsvg');
  root.append(h('div.chemgrid', null,
    card('Ionenbindung', 'Metall + Nichtmetall · ΔEN größer als 1,7', ion, facts(['Das Metall gibt Elektronen ab, das Nichtmetall nimmt sie auf.', 'Positive und negative Ionen ziehen sich an: es entsteht ein Ionengitter.', 'Salze: hohe Schmelztemperatur, hart und spröde.', 'Leiten Strom nur geschmolzen oder in Wasser gelöst.', 'Beispiel: Natriumchlorid NaCl (Kochsalz)'])),
    card('Elektronenpaarbindung', 'Nichtmetall + Nichtmetall · unpolar, ΔEN kleiner als 0,4', cov, facts(['Zwei Atome teilen sich ein oder mehrere Elektronenpaare. Der Strich steht für ein gemeinsames Paar.', 'So erreichen beide die Edelgasregel (8 Außenelektronen).', 'Einfach-, Doppel- und Dreifachbindung möglich.', 'Beispiele: H₂, Cl₂, O₂ (doppelt), N₂ (dreifach)'])),
    card('Polare Elektronenpaarbindung', 'ΔEN zwischen 0,4 und 1,7', polar, facts(['Das Atom mit der größeren Elektronegativität zieht die Elektronen stärker an.', 'Es entstehen Teilladungen δ+ und δ−: ein Dipol.', 'Wasser ist gewinkelt und deshalb ein Dipol.', 'EN-Werte: H 2,2 · C 2,6 · N 3,0 · O 3,4 · F 4,0 · Cl 3,2 · Na 0,9'])),
    card('Metallbindung', 'Metall + Metall', metal, facts(['Positive Atomrümpfe sitzen in einem Gitter.', 'Die Außenelektronen bewegen sich frei: das Elektronengas.', 'Darum leiten Metalle Strom und Wärme, glänzen und sind verformbar.'])),
    card('Kräfte zwischen Molekülen', 'Wasserstoffbrücken, Dipol-Dipol, Van-der-Waals', hb, facts(['Wasserstoffbrücken: zwischen H und den stark negativen Atomen F, O, N. Sie erklären die hohe Siedetemperatur von Wasser.', 'Dipol-Dipol-Kräfte: zwischen polaren Molekülen.', 'Van-der-Waals-Kräfte: schwach, wirken zwischen allen Molekülen und werden mit der Molekülgröße stärker.']))));
}

// ----- Organik -----
const PREFIX = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec'];
const BP = [-162, -89, -42, -0.5, 36, 69, 98, 126, 151, 174];
function structure(n, type) {
  // Bindungsordnung zwischen C1 und C2
  const ord = (i) => (i === 0 && type === 'ene' ? 2 : i === 0 && type === 'yne' ? 3 : 1);
  const dx = 64, x0 = 52, y = 74;
  const W = x0 * 2 + (n - 1) * dx;
  let m = '';
  const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sb"/>`;
  for (let i = 0; i < n - 1; i++) {
    const a = x0 + i * dx + 13, b = x0 + (i + 1) * dx - 13, o = ord(i);
    if (o === 1) m += line(a, y, b, y);
    if (o === 2) m += line(a, y - 4, b, y - 4) + line(a, y + 4, b, y + 4);
    if (o === 3) m += line(a, y - 6, b, y - 6) + line(a, y, b, y) + line(a, y + 6, b, y + 6);
  }
  for (let i = 0; i < n; i++) {
    const x = x0 + i * dx;
    const bonds = (i > 0 ? ord(i - 1) : 0) + (i < n - 1 ? ord(i) : 0);
    let hN = 4 - bonds;
    const end = i === 0 || i === n - 1, out = i === 0 ? -1 : 1;
    const spots = [];
    if (end && (hN === 1 || hN === 3 || n === 1)) spots.push('out');
    spots.push('up', 'down');
    if (n === 1) spots.push('in');
    for (const sp of spots) {
      if (hN <= 0) break;
      hN--;
      if (sp === 'up') m += line(x, y - 13, x, y - 38) + `<text x="${x}" y="${y - 44}" class="hat">H</text>`;
      if (sp === 'down') m += line(x, y + 13, x, y + 38) + `<text x="${x}" y="${y + 58}" class="hat">H</text>`;
      if (sp === 'out') m += line(x + out * 13, y, x + out * 34, y) + `<text x="${x + out * 44}" y="${y + 6}" class="hat">H</text>`;
      if (sp === 'in') m += line(x + 13, y, x + 34, y) + `<text x="${x + 44}" y="${y + 6}" class="hat">H</text>`;
    }
    m += `<text x="${x}" y="${y + 7}" class="cat2">C</text>`;
  }
  const s = svg(m, `0 0 ${W} 150`, 'struct');
  s.style.width = Math.min(W, 900) + 'px';
  return s;
}
function organicView(root) {
  let type = 'ane', n = 3;
  const seg = h('div.seg');
  const TYPES = [['ane', 'Alkane'], ['ene', 'Alkene'], ['yne', 'Alkine']];
  const range = h('input.slider', { type: 'range', min: '1', max: '10', step: '1', value: String(n), 'aria-label': 'Anzahl C-Atome' });
  const out = h('div.orgout');
  const draw = () => {
    if (type !== 'ane' && n < 2) { n = 2; range.value = '2'; }
    range.min = type === 'ane' ? '1' : '2';
    const hC = type === 'ane' ? 2 * n + 2 : type === 'ene' ? 2 * n : 2 * n - 2;
    const name = PREFIX[n - 1] + (type === 'ane' ? 'an' : type === 'ene' ? 'en' : 'in');
    const formula = `C${n > 1 ? sub(n) : ''}H${sub(hC)}`;
    const half = Array.from({ length: n }, (_, i) => {
      const bonds = (i > 0 ? (i === 1 && type !== 'ane' ? (type === 'ene' ? 2 : 3) : 1) : 0) + (i < n - 1 ? (i === 0 && type !== 'ane' ? (type === 'ene' ? 2 : 3) : 1) : 0);
      const hh = 4 - bonds; return 'C' + (hh ? 'H' + (hh > 1 ? sub(hh) : '') : '');
    }).join(type === 'ane' ? '–' : '–').replace('–', type === 'ene' ? '=' : type === 'yne' ? '≡' : '–');
    out.textContent = '';
    out.append(
      h('div.orghead', null, h('b', { text: name }), h('span.orgformula', { text: formula }), h('span.orghalf', { text: half })),
      h('div.structwrap', null, structure(n, type)),
      h('div.orgfacts', null,
        h('div', null, h('small', { text: 'Allgemeine Formel' }), h('b', { text: type === 'ane' ? 'CₙH₂ₙ₊₂' : type === 'ene' ? 'CₙH₂ₙ' : 'CₙH₂ₙ₋₂' })),
        h('div', null, h('small', { text: 'Bindung' }), h('b', { text: type === 'ane' ? 'nur Einfachbindungen (gesättigt)' : type === 'ene' ? 'eine C=C-Doppelbindung' : 'eine C≡C-Dreifachbindung' })),
        type === 'ane' ? h('div', null, h('small', { text: 'Siedetemperatur' }), h('b', { text: `${de(BP[n - 1], 1)} °C · bei 20 °C ${BP[n - 1] < 20 ? 'gasförmig' : 'flüssig'}` })) : h('div', null, h('small', { text: 'Nachweis' }), h('b', { text: 'Entfärbt Bromwasser (Addition)' }))));
  };
  for (const [k, l] of TYPES) {
    const b = h('button' + (k === type ? '.on' : ''), { text: l, on: { click: () => { type = k; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); } } });
    seg.append(b);
  }
  range.addEventListener('input', () => { n = +range.value; draw(); });
  const groups = [
    ['Alkohole', 'Hydroxygruppe –OH', 'Ethanol C₂H₅OH', 'Polar, mischbar mit Wasser (kurze Ketten).'],
    ['Aldehyde', 'Aldehydgruppe –CHO', 'Ethanal CH₃CHO', 'Entstehen durch Oxidation primärer Alkohole.'],
    ['Ketone', 'Ketogruppe >C=O', 'Propanon (Aceton) CH₃COCH₃', 'Aus sekundären Alkoholen. Gutes Lösungsmittel.'],
    ['Carbonsäuren', 'Carboxygruppe –COOH', 'Ethansäure (Essigsäure) CH₃COOH', 'Saure Lösungen, geben H⁺ ab.'],
    ['Ester', 'Estergruppe –COO–', 'Ethansäureethylester CH₃COOC₂H₅', 'Aus Säure + Alkohol (Veresterung). Riechen fruchtig.'],
    ['Amine', 'Aminogruppe –NH₂', 'Methylamin CH₃NH₂', 'Basisch, riechen fischig.'],
  ];
  root.append(
    h('section.chempanel', null, h('div.orgctrl', null, seg, h('label.orgn', null, h('span', { text: 'C-Atome' }), range)), out),
    h('h2.section', { text: 'Funktionelle Gruppen' }),
    h('div.fgrid', null, ...groups.map(([t, g, ex, note]) => h('div.fcard', null, h('b', { text: t }), h('span.fg', { text: g }), h('small', { text: ex }), h('small', { text: note })))));
  draw();
}

// ----- Säuren & Basen -----
const PH_EX = [[0, 'Batteriesäure'], [1.5, 'Magensaft'], [2.5, 'Zitronensaft, Cola'], [4.5, 'Saurer Regen'], [5.5, 'Haut'], [7, 'Reines Wasser'], [7.4, 'Blut'], [8.3, 'Meerwasser'], [10, 'Seifenlauge'], [11.5, 'Ammoniak-Lösung'], [13.5, 'Rohrreiniger']];
export function phColor(p) {
  const stops = [[0, [200, 30, 40]], [3, [235, 110, 40]], [5, [240, 200, 50]], [7, [80, 170, 80]], [9, [40, 120, 190]], [11, [70, 70, 170]], [14, [110, 40, 140]]];
  for (let i = 1; i < stops.length; i++) if (p <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (p - a) / (b - a);
    return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * t)).join(',')})`;
  }
  return 'rgb(110,40,140)';
}
function acidView(root) {
  const bar = h('div.phbar', null, ...Array.from({ length: 15 }, (_, i) => h('span', { style: { background: phColor(i) }, text: String(i) })));
  const marks = h('div.phmarks', null, ...PH_EX.map(([p, t]) => h('div.phmark', { style: { left: `${(p + 0.5) / 15 * 100}%` } }, h('i'), h('small', { text: t }))));
  const tbl = (head, rows) => h('table.ctable', null, h('thead', null, h('tr', null, ...head.map((x) => h('th', { text: x })))), h('tbody', null, ...rows.map((r) => h('tr', null, ...r.map((x) => h('td', { text: x }))))));
  root.append(
    h('section.chempanel', null, h('h3', { text: 'pH-Skala' }), h('p.chemsub', { text: 'Unter 7 sauer, 7 neutral, über 7 basisch (alkalisch). Ein pH-Schritt bedeutet zehnmal so viele H₃O⁺-Ionen.' }),
      h('div.phwrap', null, bar, marks)),
    h('div.chemgrid.two', null,
      h('section.chempanel', null, h('h3', { text: 'Wichtige Säuren' }), tbl(['Säure', 'Formel', 'Säurerest'], [
        ['Salzsäure', 'HCl', 'Chlorid Cl⁻'], ['Schwefelsäure', 'H₂SO₄', 'Sulfat SO₄²⁻'], ['Salpetersäure', 'HNO₃', 'Nitrat NO₃⁻'], ['Phosphorsäure', 'H₃PO₄', 'Phosphat PO₄³⁻'],
        ['Kohlensäure', 'H₂CO₃', 'Carbonat CO₃²⁻'], ['Essigsäure', 'CH₃COOH', 'Acetat CH₃COO⁻']])),
      h('section.chempanel', null, h('h3', { text: 'Wichtige Basen' }), tbl(['Base', 'Formel', 'Lösung'], [
        ['Natriumhydroxid', 'NaOH', 'Natronlauge'], ['Kaliumhydroxid', 'KOH', 'Kalilauge'], ['Calciumhydroxid', 'Ca(OH)₂', 'Kalkwasser'], ['Ammoniak', 'NH₃', 'Ammoniakwasser']]))),
    h('div.chemgrid.two', null,
      h('section.chempanel', null, h('h3', { text: 'Neutralisation' }), h('p.eq', { text: 'Säure + Lauge → Salz + Wasser' }), h('p.eq', { text: 'HCl + NaOH → NaCl + H₂O' }), h('p.eq', { text: 'H₃O⁺ + OH⁻ → 2 H₂O' }),
        h('p.chemsub', { text: 'Säuren geben Protonen (H⁺) ab, Basen nehmen sie auf (Brønsted).' })),
      h('section.chempanel', null, h('h3', { text: 'Indikatoren' }), tbl(['Indikator', 'sauer', 'neutral', 'basisch'], [
        ['Universalindikator', 'rot', 'grün', 'blau-violett'], ['Lackmus', 'rot', 'violett', 'blau'], ['Bromthymolblau', 'gelb', 'grün', 'blau'], ['Phenolphthalein', 'farblos', 'farblos', 'pink (ab 8,2)'], ['Rotkohlsaft', 'rot', 'violett', 'grün-gelb']]))));
}

// ----- Metalle -----
const SERIES = [['Li', -3.04], ['K', -2.93], ['Ca', -2.87], ['Na', -2.71], ['Mg', -2.37], ['Al', -1.66], ['Zn', -0.76], ['Fe', -0.44], ['Ni', -0.25], ['Sn', -0.14], ['Pb', -0.13], ['H₂', 0], ['Cu', 0.34], ['Ag', 0.8], ['Pt', 1.18], ['Au', 1.5]];
function metalView(root) {
  const min = -3.1, max = 1.6;
  const rows = SERIES.map(([s, v]) => h('div.srow' + (v > 0 ? '.noble' : v === 0 ? '.ref' : ''), null, h('b', { text: s }),
    h('span.sbar', null, h('i', { style: { left: `${(Math.min(0, v) - min) / (max - min) * 100}%`, width: `${Math.abs(v) / (max - min) * 100}%` } })),
    h('small', { text: (v > 0 ? '+' : '') + de(v, 2) + ' V' })));
  root.append(
    h('div.chemgrid.two', null,
      h('section.chempanel', null, h('h3', { text: 'Redoxreihe der Metalle' }), h('p.chemsub', { text: 'Oben unedel (gibt leicht Elektronen ab), unten edel. Ein unedles Metall verdrängt ein edleres aus seiner Salzlösung.' }),
        h('div.series', null, ...rows), h('p.eq', { text: 'Fe + CuSO₄ → FeSO₄ + Cu' }), h('p.chemsub', { text: 'Eisen ist unedler als Kupfer: Kupfer scheidet sich am Eisennagel ab.' })),
      h('div', null,
        h('section.chempanel', null, h('h3', { text: 'Eigenschaften' }), facts(['Leiten Strom und Wärme (Elektronengas)', 'Metallischer Glanz', 'Gut verformbar, man kann sie walzen und ziehen', 'Meist hohe Schmelztemperatur (Ausnahme: Quecksilber ist flüssig)', 'Reagieren mit Sauerstoff zu Metalloxiden'])),
        h('section.chempanel', null, h('h3', { text: 'Legierungen' }), h('table.ctable', null, h('tbody', null, ...[['Bronze', 'Kupfer + Zinn'], ['Messing', 'Kupfer + Zink'], ['Stahl', 'Eisen + wenig Kohlenstoff'], ['Edelstahl', 'Stahl + Chrom + Nickel'], ['Amalgam', 'Quecksilber + andere Metalle']].map(([a, b]) => h('tr', null, h('td', { text: a }), h('td', { text: b }))))))))
  );
}

// ----- Molmasse -----
const NAMES = { H2O: 'Wasser', CO2: 'Kohlenstoffdioxid', NaCl: 'Natriumchlorid (Kochsalz)', H2SO4: 'Schwefelsäure', HCl: 'Chlorwasserstoff', NH3: 'Ammoniak', CH4: 'Methan', C6H12O6: 'Glucose (Traubenzucker)', O2: 'Sauerstoff', N2: 'Stickstoff', NaOH: 'Natriumhydroxid', CaCO3: 'Calciumcarbonat (Kalk)', C2H5OH: 'Ethanol', CH3COOH: 'Essigsäure', 'Ca(OH)2': 'Calciumhydroxid', HNO3: 'Salpetersäure', H2O2: 'Wasserstoffperoxid', Fe2O3: 'Eisen(III)-oxid (Rost)', CuSO4: 'Kupfersulfat', C12H22O11: 'Saccharose (Haushaltszucker)' };
export function parseFormula(src) {
  const s = String(src).replace(/\s/g, '').replace(/[₀-₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
  if (!s) throw new Error('Bitte eine Formel eingeben, z. B. H2SO4');
  const parts = s.split(/[·*.]/);
  const total = {};
  for (const part of parts) {
    const m0 = part.match(/^(\d+)(.*)$/);
    const mult = m0 ? +m0[1] : 1, str = m0 ? m0[2] : part;
    let i = 0;
    const group = () => {
      const c = {};
      while (i < str.length && str[i] !== ')') {
        let sub2;
        if (str[i] === '(') { i++; sub2 = group(); if (str[i] !== ')') throw new Error('Eine Klammer wird nicht geschlossen.'); i++; }
        else {
          const m = str.slice(i).match(/^[A-Z][a-z]?/);
          if (!m) throw new Error(`„${str[i]}“ verstehe ich nicht. Elemente groß schreiben, z. B. NaCl.`);
          if (!ELEMENTS.find((e) => e.sym === m[0])) throw new Error(`„${m[0]}“ ist kein Element.`);
          sub2 = { [m[0]]: 1 }; i += m[0].length;
        }
        const n = str.slice(i).match(/^\d+/); const k = n ? +n[0] : 1; if (n) i += n[0].length;
        for (const [el, v] of Object.entries(sub2)) c[el] = (c[el] || 0) + v * k;
      }
      return c;
    };
    const c = group();
    if (i < str.length) throw new Error('Eine Klammer zu viel.');
    for (const [el, v] of Object.entries(c)) total[el] = (total[el] || 0) + v * mult;
  }
  return total;
}
function molView(root) {
  const inp = h('input.field.molin', { type: 'text', placeholder: 'z. B. H2SO4, Ca(OH)2, CuSO4·5H2O', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, value: (() => { try { return localStorage.getItem('molIn') || 'H2SO4'; } catch (e) { return 'H2SO4'; } })() });
  const mIn = h('input.field', { type: 'text', inputmode: 'decimal', placeholder: 'Masse in g', value: '10' });
  const out = h('div.molout');
  const calc = () => {
    out.textContent = '';
    try { localStorage.setItem('molIn', inp.value); } catch (e) { /* egal */ }
    let c;
    try { c = parseFormula(inp.value); } catch (e) { out.append(h('p.ploterr', { text: e.message })); return; }
    const rows = Object.entries(c).map(([sym, n]) => { const e = ELEMENTS.find((x) => x.sym === sym); return [e, n, e.mass * n]; });
    const M = rows.reduce((a, r) => a + r[2], 0);
    const key = inp.value.replace(/\s/g, '').replace(/[₀-₉]/g, (ch) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(ch)));
    const m = parseFloat(mIn.value.replace(',', '.'));
    out.append(
      h('div.molres', null, h('small', { text: NAMES[key] || 'Molare Masse' }), h('b', { text: `M = ${de(M, 2)} g/mol` }), h('span', { text: sub(key).replace(/[·*.]/g, ' · ') })),
      h('table.ctable', null, h('thead', null, h('tr', null, h('th', { text: 'Element' }), h('th', { text: 'Anzahl' }), h('th', { text: 'Masse' }), h('th', { text: 'Anteil' }))),
        h('tbody', null, ...rows.map(([e, n, w]) => h('tr', null, h('td', { text: `${e.sym} · ${e.name}` }), h('td', { text: String(n) }), h('td', { text: `${de(w, 2)} u` }), h('td', { text: `${de(w / M * 100, 1)} %` }))))),
      Number.isFinite(m) && m > 0 ? h('div.molcalc', null,
        h('div', null, h('small', { text: 'Stoffmenge n = m ⁄ M' }), h('b', { text: `${de(m / M, 4)} mol` })),
        h('div', null, h('small', { text: 'Teilchen N = n · Nₐ' }), h('b', { text: `${(m / M * 6.022e23).toExponential(3).replace('.', ',').replace('e+', ' · 10^')}` }))) : null);
    const exp = out.querySelector('.molcalc div:last-child b');
    if (exp) exp.textContent = exp.textContent.replace(/10\^(\d+)/, (_, d) => '10' + sup(d));
  };
  inp.addEventListener('input', calc); mIn.addEventListener('input', calc);
  const quick = h('div.chips.left', null, ...['H2O', 'CO2', 'NaCl', 'C6H12O6', 'CaCO3', 'CuSO4·5H2O'].map((t) => h('button.pchip.small', { text: sub(t), on: { click: () => { inp.value = t; calc(); } } })));
  root.append(h('section.chempanel', null,
    h('div.molform', null, h('div', null, h('label.fieldlabel', { text: 'Summenformel' }), inp), h('div', null, h('label.fieldlabel', { text: 'Masse (für Stoffmenge)' }), mIn)),
    quick, out));
  calc();
}
