// Alkane benennen: Baukasten (Molekül bauen -> Name Schritt für Schritt nach den 5 IUPAC-Schritten),
// Name -> Molekül zeichnen, Übung (Namen finden / Molekül bauen). Alles offline.
import { h, icon, toast } from './ui.js';
import { nameAlkane, parseName, layout, wrongNames, STEMS, MULT_WORD, adjacency, capFirst } from './alkname.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const COLS = 15, ROWS = 9, S = 60, PAD = 30;
const SUBN = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const subs = (n) => String(n).replace(/\d/g, (d) => SUBN[d]);
const formulaText = (f) => `C${f.c > 1 ? subs(f.c) : ''}H${subs(f.h)}`;
const molMass = (f) => (f.c * 12.011 + f.h * 1.008).toFixed(1).replace('.', ',');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const EXAMPLES = ['2-Methylpentan', '2,2-Dimethylbutan', '3-Ethyl-2-methylhexan', '2,2,4-Trimethylpentan', '3-Ethyl-2,2-dimethylpentan', '4-Ethyl-2,3-dimethylheptan', '2-Ethylpentan'];
const ALKYL = (k) => STEMS[k - 1] + 'yl';
const ALKYL_F = ['', '−CH₃', '−CH₂−CH₃', '−CH₂−CH₂−CH₃', '−CH₂−CH₂−CH₂−CH₃'];

// ================= Zeichnen =================
function hLabel(nb) { const hh = 4 - nb; return 'C' + (hh > 0 ? 'H' + (hh > 1 ? subs(hh) : '') : ''); }
function drawMol(svg, mol, res, opt = {}) {
  const adj = adjacency(mol);
  const byId = new Map(mol.atoms.map((a) => [a.id, a]));
  const P = (a) => [PAD + a.x * S, PAD + a.y * S];
  const chainIdx = new Map((res && !res.error && opt.show !== false ? res.chain : []).map((id, i) => [id, i + 1]));
  const subOf = new Map();
  if (res && !res.error && opt.show !== false) {
    // Reste einfärben (gedämpft) – Atome jedes Rests sammeln
    for (const s of res.subs || []) {
      const st = [[s.root, s.on]];
      while (st.length) { const [c, p] = st.pop(); subOf.set(c, s); for (const n of adj.get(c)) if (n !== p) st.push([n, c]); }
    }
  }
  let m = '';
  if (opt.grid) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) m += `<circle class="adot" cx="${PAD + x * S}" cy="${PAD + y * S}" r="2.6"/>`;
  for (const [a, b] of mol.bonds) {
    const A = byId.get(a), B = byId.get(b); if (!A || !B) continue;
    const [x1, y1] = P(A), [x2, y2] = P(B);
    const main = chainIdx.has(a) && chainIdx.has(b);
    m += `<line class="abond${main ? ' main' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  for (const a of mol.atoms) {
    const [x, y] = P(a);
    const lab = opt.hydrogens === false ? 'C' : hLabel(adj.get(a.id).length);
    const w = lab.length > 2 ? 40 : lab.length > 1 ? 32 : 24;
    const ci = chainIdx.get(a.id);
    const cls = ci ? ' main' : subOf.has(a.id) ? ' side' : '';
    m += `<g class="aatom${cls}${opt.active === a.id ? ' active' : ''}" data-id="${a.id}"><rect x="${x - w / 2}" y="${y - 14}" width="${w}" height="28" rx="9"/><text x="${x}" y="${y + 6}">${lab}</text></g>`;
    if (ci && opt.numbers !== false && res.chain.length > 1) m += `<g class="anum"><circle cx="${x + 26}" cy="${y - 25}" r="9.5"/><text x="${x + 26}" y="${y - 21}">${ci}</text></g>`;
  }
  svg.innerHTML = m;
}
function newSvg(cls) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', `0 0 ${PAD * 2 + (COLS - 1) * S} ${PAD * 2 + (ROWS - 1) * S}`);
  s.setAttribute('class', cls);
  return s;
}
// Ausschnitt eng um das Molekül (für die Übung)
function fitSvg(svg, mol) {
  const xs = mol.atoms.map((a) => a.x), ys = mol.atoms.map((a) => a.y);
  const x0 = PAD + Math.min(...xs) * S - 44, y0 = PAD + Math.min(...ys) * S - 44;
  const w = (Math.max(...xs) - Math.min(...xs)) * S + 88, hh = (Math.max(...ys) - Math.min(...ys)) * S + 88;
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${hh}`);
  svg.style.width = Math.round(w * 1.15) + 'px'; svg.style.height = Math.round(hh * 1.15) + 'px';
}

// ================= Erklärung nach den 5 Schritten =================
function stepsView(res, mol) {
  const box = h('div.alksteps');
  if (!res) { box.append(h('p.calm', { text: 'Baue ein Molekül, dann erscheint hier der Name mit allen 5 Schritten von deinem Arbeitsblatt.' })); return box; }
  if (res.error) { box.append(h('p.alkerr', { text: res.error })); return box; }
  const step = (n, title, ...kids) => h('section.alkstep', null, h('div.alkstepn', { text: String(n) }), h('div.alkstept', null, h('h4', { text: title }), ...kids));
  const p = (t) => h('p', { text: t });
  const L = res.len, stemName = STEMS[L - 1].toLowerCase() + 'an';
  if (res.n === 1) { box.append(step(1, 'Die längste Kette finden', p('Nur ein C-Atom: Das ist Methan, CH₄.'))); return box; }
  // Schritt 1
  const byId = new Map(mol.atoms.map((a) => [a.id, a]));
  const pts = res.chain.map((id) => byId.get(id));
  let turns = 0; for (let i = 2; i < pts.length; i++) { const d1 = [pts[i - 1].x - pts[i - 2].x, pts[i - 1].y - pts[i - 2].y], d2 = [pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]; if (d1[0] !== d2[0] || d1[1] !== d2[1]) turns++; }
  const s1 = [p(`Die längste durchgehende Kette hat ${L} C-Atome (blau markiert). ${L} C-Atome → Stammname „-${stemName}“.`)];
  if (turns) s1.push(p('Achtung: Die Kette geht hier um die Ecke. Sie muss nicht gerade gezeichnet sein.'));
  if (res.allChains > 1) s1.push(p(`Es gibt ${res.allChains} gleich lange Ketten. ${res.fewerSubsChains ? `Dann nimmt man die mit den meisten Seitenketten (hier ${res.maxSubs}).` : 'Alle führen zum selben Namen.'}`));
  box.append(step(1, 'Die längste Kohlenstoffkette finden (Stammname)', ...s1));
  if (!res.subs.length) {
    box.append(step(2, 'Fertig', p(`Keine Seitenketten: Das Molekül ist unverzweigt und heißt einfach ${res.name}.`)));
    return box;
  }
  // Schritt 2
  const a = res.locs.join(','), b = res.other ? res.other.locs.join(',') : null;
  const s2 = [];
  if (b && b !== a) {
    let i = 0; while (res.locs[i] === res.other.locs[i]) i++;
    s2.push(p(`Von der einen Seite: ${a}. Von der anderen Seite: ${b}.`));
    s2.push(p(`Beim ersten Unterschied gewinnt die kleinere Zahl: ${res.locs[i]} ist kleiner als ${res.other.locs[i]}. Also wird so nummeriert wie im Bild.`));
  } else if (b && res.groups.length > 1 && JSON.stringify(res.groups) !== JSON.stringify(res.other.groups)) {
    s2.push(p(`Beide Richtungen ergeben ${a}. Dann bekommt der Rest, der im Alphabet zuerst kommt (${capFirst(res.groups[0].name.replace(/[()]/g, ''))}), die kleinere Nummer.`));
  } else {
    s2.push(p(`Beide Richtungen ergeben ${a}. Egal, von wo du zählst.`));
  }
  box.append(step(2, 'Die Hauptkette nummerieren', ...s2));
  // Schritt 3
  const rows = res.subs.slice().sort((x, y) => x.loc - y.loc).map((s) => {
    const simple = !s.complex;
    const txt = simple ? `${ALKYL(s.len)} (${ALKYL_F[s.len] || s.len + ' C-Atome'}, ${s.len} C-Atom${s.len > 1 ? 'e' : ''})` : `${capFirst(s.name.replace(/[()]/g, ''))}: selbst verzweigt. Man zählt ab dem C-Atom, das an der Hauptkette hängt (= 1).`;
    return h('li', null, h('b', { text: `C${s.loc}: ` }), txt);
  });
  box.append(step(3, 'Die Seitenketten (Alkylreste) benennen', p('Alles, was nicht zur Hauptkette gehört. Endung -an wird zu -yl.'), h('ul', null, ...rows)));
  // Schritt 4
  const multi = res.groups.filter((g) => g.locs.length > 1);
  const s4 = multi.length
    ? multi.map((g) => { const nm = capFirst(g.name.replace(/[()]/g, '')); return p(g.complex ? `${nm} kommt ${g.locs.length}× vor (an ${g.locs.join(', ')}). Bei verzweigten Resten sagt man bis-, tris- statt di-, tri-.` : `${nm} kommt ${g.locs.length}× vor (an ${g.locs.join(', ')}) → ${g.locs.join(',')}-${capFirst(MULT_WORD[g.locs.length].replace('-', ''))}${nm.toLowerCase()}`); })
    : [p('Jeder Rest kommt nur einmal vor, also kein di-, tri- oder tetra-.')];
  box.append(step(4, 'Gleiche Seitenketten zusammenfassen', ...s4));
  // Schritt 5
  const order = res.groups.map((g) => capFirst(g.name.replace(/[()]/g, '')));
  const s5 = [];
  if (order.length > 1) s5.push(p(`Alphabetisch: ${order.join(' vor ')}.${res.groups.some((g) => g.locs.length > 1 && !g.complex) ? ' Vorsilben wie di- oder tri- zählen dabei nicht.' : ''}`));
  s5.push(p('Komma zwischen Zahlen, Bindestrich zwischen Zahl und Wort, der letzte Rest wird mit dem Stammnamen zusammengeschrieben.'));
  s5.push(h('div.alkfinal', null, h('b', { text: res.name })));
  box.append(step(5, 'Den Gesamtnamen zusammensetzen', ...s5));
  return box;
}

// ================= Baukasten =================
function builder(root, { onChange, initial, compact } = {}) {
  let mol = initial || { atoms: [], bonds: [] };
  let nextId = Math.max(0, ...mol.atoms.map((a) => a.id)) + 1;
  let mode = 'add', active = null, hyd = store.get('alkH', true);
  const undo = [];
  const svg = newSvg('alkboard');
  svg.style.touchAction = 'none';
  const at = () => new Map(mol.atoms.map((a) => [a.x + ',' + a.y, a]));
  const snap = () => { undo.push(JSON.stringify(mol)); if (undo.length > 60) undo.shift(); };
  const bonded = (a, b) => mol.bonds.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const degree = (id) => mol.bonds.filter(([x, y]) => x === id || y === id).length;
  let res = null;
  const redraw = () => {
    res = mol.atoms.length ? nameAlkane(mol) : null;
    drawMol(svg, mol, res, { grid: true, hydrogens: hyd, active: mode === 'add' ? active : null, show: !compact });
    if (!mol.atoms.length) {
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', String(PAD + (COLS - 1) * S / 2)); t.setAttribute('y', String(PAD + (ROWS - 1) * S / 2 + 6)); t.setAttribute('class', 'ahint');
      t.textContent = 'Tippe auf einen Punkt für das erste C-Atom. Dann weiter daneben tippen oder mit dem Stift ziehen.';
      svg.append(t);
    }
    onChange?.(res, mol);
  };
  const ptFrom = (e) => {
    const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
    const x = (e.clientX - r.left) / r.width * vb.width + vb.x, y = (e.clientY - r.top) / r.height * vb.height + vb.y;
    return { gx: Math.round((x - PAD) / S), gy: Math.round((y - PAD) / S), fx: (x - PAD) / S, fy: (y - PAD) / S };
  };
  const inside = (gx, gy) => gx >= 0 && gy >= 0 && gx < COLS && gy < ROWS;
  const addAt = (gx, gy, from) => {
    if (from && degree(from) >= 4) { toast('Ein C-Atom hat höchstens 4 Bindungen.'); return null; }
    const a = { id: nextId++, x: gx, y: gy }; mol.atoms.push(a);
    if (from) mol.bonds.push([from, a.id]);
    return a;
  };
  const removeAtom = (id) => {
    mol.atoms = mol.atoms.filter((a) => a.id !== id);
    mol.bonds = mol.bonds.filter(([a, b]) => a !== id && b !== id);
    // größtes zusammenhängendes Stück behalten
    if (!mol.atoms.length) return;
    const adj = adjacency(mol); const seen = new Set(); let best = [];
    for (const a of mol.atoms) {
      if (seen.has(a.id)) continue;
      const comp = []; const st = [a.id];
      while (st.length) { const c = st.pop(); if (seen.has(c)) continue; seen.add(c); comp.push(c); adj.get(c).forEach((n) => st.push(n)); }
      if (comp.length > best.length) best = comp;
    }
    const keep = new Set(best);
    mol.atoms = mol.atoms.filter((a) => keep.has(a.id));
    mol.bonds = mol.bonds.filter(([a]) => keep.has(a));
  };
  let drag = null;
  const stepTo = (gx, gy) => {
    // von drag.last Schritt für Schritt zum Ziel gehen
    let guard = 0;
    while (drag.last && guard++ < 30) {
      const L = mol.atoms.find((a) => a.id === drag.last); if (!L) return;
      const dx = gx - L.x, dy = gy - L.y; if (!dx && !dy) return;
      const nx = L.x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0), ny = L.y + (Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy));
      if (!inside(nx, ny)) return;
      const here = at().get(nx + ',' + ny);
      if (here) { if (bonded(here.id, L.id)) { drag.last = here.id; active = here.id; } else return; }
      else { if (!drag.changed) { snap(); drag.changed = true; } const a = addAt(nx, ny, L.id); if (!a) return; drag.last = a.id; active = a.id; }
    }
  };
  svg.addEventListener('pointerdown', (e) => {
    const { gx, gy, fx, fy } = ptFrom(e);
    if (!inside(gx, gy) || Math.hypot(fx - gx, fy - gy) > 0.48) return;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    const here = at().get(gx + ',' + gy);
    if (mode === 'del') {
      if (here) { snap(); removeAtom(here.id); if (!mol.atoms.some((a) => a.id === active)) active = null; redraw(); }
      drag = { del: true };
      return;
    }
    if (here) { active = here.id; drag = { last: here.id }; redraw(); return; }
    let from = null;
    if (mol.atoms.length) {
      const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at().get((gx + dx) + ',' + (gy + dy))).filter(Boolean);
      if (!nbs.length) { toast('Setze neue C-Atome direkt neben ein vorhandenes.'); return; }
      from = (nbs.find((n) => n.id === active) || nbs.sort((p, q) => degree(p.id) - degree(q.id))[0]).id;
    }
    snap();
    const a = addAt(gx, gy, from); if (!a) { undo.pop(); return; }
    active = a.id; drag = { last: a.id, changed: true };
    redraw();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { gx, gy, fx, fy } = ptFrom(e);
    if (!inside(gx, gy) || Math.hypot(fx - gx, fy - gy) > 0.42) return;
    if (drag.del) { const here = at().get(gx + ',' + gy); if (here) { snap(); removeAtom(here.id); redraw(); } return; }
    const before = mol.atoms.length, la = drag.last;
    stepTo(gx, gy);
    if (mol.atoms.length !== before || drag.last !== la) redraw();
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

  const modeSeg = h('div.seg');
  const setMode = (k) => { mode = k; modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); svg.classList.toggle('del', k === 'del'); redraw(); };
  modeSeg.append(h('button.on', { 'data-k': 'add', on: { click: () => setMode('add') } }, icon('pen'), 'Bauen'), h('button', { 'data-k': 'del', on: { click: () => setMode('del') } }, icon('eraser'), 'Löschen'));
  const hBtn = h('button.btn.alkh' + (hyd ? '.on' : ''), { text: 'H anzeigen', 'aria-pressed': String(hyd), on: { click: () => { hyd = !hyd; store.set('alkH', hyd); hBtn.classList.toggle('on', hyd); hBtn.setAttribute('aria-pressed', String(hyd)); redraw(); } } });
  const tools = h('div.alktools', null, modeSeg,
    h('div.alktools2', null, hBtn,
      h('button.icbtn', { 'aria-label': 'Rückgängig', title: 'Rückgängig', on: { click: () => { if (!undo.length) return; mol = JSON.parse(undo.pop()); nextId = Math.max(0, ...mol.atoms.map((a) => a.id)) + 1; active = null; redraw(); } } }, icon('undo')),
      h('button.icbtn', { 'aria-label': 'Alles löschen', title: 'Alles löschen', on: { click: () => { if (!mol.atoms.length) return; snap(); mol = { atoms: [], bonds: [] }; active = null; redraw(); toast('Geleert. Rückgängig holt es zurück.'); } } }, icon('trash'))));
  root.append(tools, h('div.alkboardwrap', null, svg));
  redraw();
  return {
    set(m) { snap(); mol = JSON.parse(JSON.stringify(m)); nextId = Math.max(0, ...mol.atoms.map((a) => a.id)) + 1; active = null; redraw(); },
    get: () => mol,
    clear() { mol = { atoms: [], bonds: [] }; undo.length = 0; active = null; redraw(); },
  };
}

function buildView(root) {
  const head = h('div.alkhead');
  const steps = h('div');
  let cur = store.get('alkBoard', null);
  const nameIn = h('input.field', { type: 'text', placeholder: 'Name eingeben, z. B. 3-Ethyl-2-methylhexan', 'aria-label': 'Name eines Alkans', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
  let exI = 0;
  const panel = h('section.chempanel.alkpanel');
  const b = builder(panel, {
    initial: cur,
    onChange: (res, mol) => {
      store.set('alkBoard', mol);
      head.textContent = '';
      if (res && !res.error) head.append(h('div.alkname', null, h('small', { text: 'Name' }), h('b', { text: res.name })), h('div.alkmeta', null, h('span', { text: formulaText(res.formula) }), h('span', { text: `≈ ${molMass(res.formula)} g/mol` }), h('span', { text: `${res.n} C-Atom${res.n > 1 ? 'e' : ''}` })));
      else if (res?.error) head.append(h('div.alkname', null, h('small', { text: 'Name' }), h('b.err', { text: 'Kein gültiges Alkan' })));
      else head.append(h('div.alkname', null, h('small', { text: 'Name' }), h('b.calm', { text: 'Noch leer' })));
      steps.textContent = ''; steps.append(stepsView(res, mol));
    },
  });
  const draw = (txt) => {
    const p = parseName(txt);
    if (p.error) { toast(p.error, 4200); return; }
    const m = layout(p, COLS, ROWS);
    if (m.error) { toast(m.error, 4200); return; }
    b.set(m);
    const res = nameAlkane(m);
    const typed = txt.replace(/\s+/g, '').toLowerCase(), right = res.name.toLowerCase();
    if (typed !== right) toast(`Gezeichnet. Richtig heißt es aber: ${res.name}`, 5200);
  };
  const form = h('form.alkform', { on: { submit: (e) => { e.preventDefault(); nameIn.blur(); draw(nameIn.value); } } },
    nameIn, h('button.btn.primary', { type: 'submit', text: 'Zeichnen' }),
    h('button.btn', { type: 'button', text: 'Beispiel', on: { click: () => { const ex = EXAMPLES[exI++ % EXAMPLES.length]; nameIn.value = ex; draw(ex); } } }));
  root.append(
    h('section.chempanel.alkintro', null, h('h3', { text: 'Verzweigte Alkane benennen' }), h('p.chemsub', { text: 'Baue ein Molekül aus C-Atomen. Die App findet die längste Kette, nummeriert sie und setzt den Namen nach den 5 IUPAC-Schritten zusammen. Oder gib einen Namen ein und lass das Molekül zeichnen.' }), form),
    panel, h('section.chempanel', null, head, steps));
}

// ================= Übung =================
function randomSpec(level) {
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  for (let t = 0; t < 80; t++) {
    const n = level === 0 ? R(4, 6) : level === 1 ? R(5, 7) : R(5, 8);
    const k = level === 0 ? R(1, 2) : level === 1 ? R(2, 3) : R(2, 4);
    const out = [];
    for (let i = 0; i < k; i++) {
      let size = 1;
      if (level >= 1 && Math.random() < 0.35) size = 2;
      if (level >= 2 && Math.random() < 0.18) size = 3;
      // schwer: manchmal Rest an Position 2 (Kette geht um die Ecke)
      const lo = level >= 2 && Math.random() < 0.35 ? 2 : Math.max(2, size + 1), hi = level >= 2 ? n - 1 : n - size;
      if (lo > hi) continue;
      out.push({ loc: R(lo, hi), size });
    }
    if (!out.length) continue;
    const spec = { n, subs: out };
    const m = layout(spec, COLS, ROWS);
    if (m.error) continue;
    const res = nameAlkane(m);
    if (res.error || !res.subs.length) continue;
    return { mol: m, res };
  }
  return null;
}
function quizView(root) {
  let level = store.get('alkLevel', 0), kind = store.get('alkKind', 'name');
  let score = store.get('alkScore', { right: 0, total: 0, streak: 0, best: 0 });
  const stat = h('div.alkstat');
  const box = h('div.alkquiz');
  const showStat = () => { stat.textContent = ''; stat.append(h('span', null, h('b', { text: String(score.right) }), ` von ${score.total} richtig`), h('span', null, 'Serie ', h('b', { text: String(score.streak) })), h('span', null, 'Beste Serie ', h('b', { text: String(score.best) }))); };
  const answer = (ok) => {
    score.total++; if (ok) { score.right++; score.streak++; score.best = Math.max(score.best, score.streak); } else score.streak = 0;
    store.set('alkScore', score); showStat();
  };
  const levelSeg = h('div.seg');
  [['Leicht', 0], ['Mittel', 1], ['Schwer', 2]].forEach(([l, v]) => levelSeg.append(h('button' + (v === level ? '.on' : ''), { text: l, on: { click: (e) => { level = v; store.set('alkLevel', v); levelSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); next(); } } })));
  const kindSeg = h('div.seg');
  [['Namen finden', 'name'], ['Molekül bauen', 'build']].forEach(([l, v]) => kindSeg.append(h('button' + (v === kind ? '.on' : ''), { text: l, on: { click: (e) => { kind = v; store.set('alkKind', v); kindSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); next(); } } })));
  const next = () => {
    box.textContent = '';
    const q = randomSpec(level);
    if (!q) { box.append(h('p.alkerr', { text: 'Keine Aufgabe gefunden. Bitte nochmal tippen.' })); return; }
    if (kind === 'name') nameTask(q); else buildTask(q);
  };
  const explainBtn = (res, mol) => {
    const holder = h('div');
    const btn = h('button.btn', { type: 'button', text: 'Lösungsweg zeigen', on: { click: () => { btn.remove(); const s = newSvg('alkmini'); drawMol(s, mol, res, { hydrogens: true }); fitSvg(s, mol); holder.append(h('div.alkboardwrap.alkfig', null, s), stepsView(res, mol)); } } });
    return [btn, holder];
  };
  function nameTask({ mol, res }) {
    const s = newSvg('alkmini'); drawMol(s, mol, res, { show: false, hydrogens: true }); fitSvg(s, mol);
    const wrong = wrongNames(res, mol, mol.chain).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...wrong.map((w) => ({ ...w, ok: false })), { name: res.name, ok: true }].sort(() => Math.random() - 0.5);
    const list = h('div.alkopts');
    const after = h('div.alkafter');
    let done = false;
    const typeIn = h('input.field', { type: 'text', placeholder: 'Oder selbst schreiben …', autocapitalize: 'off', autocomplete: 'off', spellcheck: false, 'aria-label': 'Name selbst schreiben' });
    const finish = (ok, chosen) => {
      if (done) return; done = true; answer(ok);
      list.querySelectorAll('button').forEach((b) => { b.disabled = true; if (b.dataset.ok === '1') b.classList.add('right'); });
      if (chosen && !ok) chosen.classList.add('wrong');
      const why = chosen && !ok ? opts.find((o) => o.name === chosen.dataset.name)?.why : null;
      after.append(h('p.' + (ok ? 'alkok' : 'alkerr'), { text: ok ? 'Richtig!' : `Leider falsch${why ? ' – ' + why : ''}. Richtig: ${res.name}` }), h('div.alkrow', null, ...explainBtn(res, mol), h('button.btn.primary', { type: 'button', text: 'Nächste Aufgabe', on: { click: next } })));
    };
    for (const o of opts) list.append(h('button.alkopt', { type: 'button', 'data-ok': o.ok ? '1' : '0', 'data-name': o.name, text: o.name, on: { click: (e) => finish(o.ok, e.currentTarget) } }));
    const tf = h('form.alkform', { on: { submit: (e) => { e.preventDefault(); if (done || !typeIn.value.trim()) return; typeIn.blur(); const ok = typeIn.value.replace(/\s+/g, '').toLowerCase() === res.name.toLowerCase(); finish(ok, null); } } }, typeIn, h('button.btn', { type: 'submit', text: 'Prüfen' }));
    box.append(h('section.chempanel', null, h('h3', { text: 'Wie heißt dieses Alkan?' }), h('div.alkboardwrap.alkfig', null, s), list, tf, after));
  }
  function buildTask({ res, mol: target }) {
    const after = h('div.alkafter');
    const panel = h('section.chempanel.alkpanel');
    panel.append(h('h3', null, 'Baue: ', h('span.alktarget', { text: res.name })));
    const b = builder(panel, { compact: true });
    let done = false;
    const check = () => {
      if (done) return;
      const mol = b.get();
      const r = mol.atoms.length ? nameAlkane(mol) : null;
      after.textContent = '';
      if (!r) { toast('Erst ein Molekül bauen.'); return; }
      if (r.error) { after.append(h('p.alkerr', { text: r.error })); return; }
      const ok = r.name === res.name;
      done = true; answer(ok);
      let right = null;
      if (!ok) { const s = newSvg('alkmini'); drawMol(s, target, res, { hydrogens: true }); fitSvg(s, target); right = h('div', null, h('p.calm', { text: `So sieht ${res.name} aus (Hauptkette blau):` }), h('div.alkboardwrap.alkfig', null, s)); }
      after.append(h('p.' + (ok ? 'alkok' : 'alkerr'), { text: ok ? `Richtig! Das ist ${res.name}.` : `Dein Molekül heißt ${r.name}, nicht ${res.name}.` }), right,
        h('div.alkrow', null, ...explainBtn(r, mol), h('button.btn.primary', { type: 'button', text: 'Nächste Aufgabe', on: { click: next } })));
    };
    panel.append(h('div.alkrow', null, h('button.btn.primary', { type: 'button', text: 'Prüfen', on: { click: check } })), after);
    box.append(panel);
  }
  root.append(h('section.chempanel', null, h('div.alkqhead', null, kindSeg, levelSeg), stat), box);
  showStat(); next();
}

export function alkaneView(root) {
  let tab = store.get('alkTab', 'build');
  const seg = h('div.seg');
  const body = h('div.chembody');
  const show = (k) => { tab = k; store.set('alkTab', k); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); body.textContent = ''; (k === 'quiz' ? quizView : buildView)(body); };
  seg.append(h('button', { 'data-k': 'build', text: 'Baukasten', on: { click: () => show('build') } }), h('button', { 'data-k': 'quiz', text: 'Üben', on: { click: () => show('quiz') } }));
  root.append(h('div', null, seg), body);
  show(tab);
}
