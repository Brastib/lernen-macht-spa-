// Alkane benennen (IUPAC) – reine Logik ohne Oberfläche.
// Molekül = { atoms: [{id, x, y}], bonds: [[a, b], ...] }, nur C-Atome, nur Einfachbindungen, keine Ringe.

export const STEMS = ['Meth', 'Eth', 'Prop', 'But', 'Pent', 'Hex', 'Hept', 'Oct', 'Non', 'Dec', 'Undec', 'Dodec', 'Tridec', 'Tetradec', 'Pentadec', 'Hexadec', 'Heptadec', 'Octadec', 'Nonadec', 'Icos'];
const MULT = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
const MULT_CX = ['', '', 'bis', 'tris', 'tetrakis', 'pentakis', 'hexakis'];
export const MULT_WORD = ['', '', 'di-', 'tri-', 'tetra-', 'penta-', 'hexa-', 'hepta-', 'octa-'];

const stem = (n) => STEMS[n - 1] || ('C' + n + '-');
export const capFirst = (s) => s.replace(/[a-zäöü]/i, (c) => c.toUpperCase());
const alphaKey = (s) => s.replace(/[^a-zäöüß]/gi, '').toLowerCase();
const cmpArr = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

export function adjacency(mol) {
  const adj = new Map(mol.atoms.map((a) => [a.id, []]));
  for (const [a, b] of mol.bonds) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
  return adj;
}

// Alle Wege von start weg (ohne über "from" zu gehen) bis zu einem Ende.
function pathsAway(adj, start, from) {
  const out = [];
  const walk = (cur, prev, path) => {
    const next = adj.get(cur).filter((n) => n !== prev);
    if (!next.length) { out.push(path); return; }
    for (const n of next) walk(n, cur, [...path, n]);
  };
  walk(start, from, [start]);
  return out;
}

// Reste an einer Kette (chain = Atom-IDs, Nummer = Index+1). Ausgeschlossen: das Atom "from" (bei Seitenketten der Anknüpfungspunkt).
function branchesOf(adj, chain, from) {
  const inChain = new Set(chain);
  const subs = [];
  chain.forEach((id, i) => {
    for (const nb of adj.get(id)) {
      if (inChain.has(nb) || nb === from) continue;
      const s = nameBranch(adj, nb, id);
      subs.push({ ...s, loc: i + 1, on: id, root: nb });
    }
  });
  return subs;
}

function groupSubs(subs) {
  const m = new Map();
  for (const s of subs) {
    if (!m.has(s.name)) m.set(s.name, { name: s.name, key: s.key, complex: s.complex, size: s.size, locs: [], subs: [] });
    const g = m.get(s.name); g.locs.push(s.loc); g.subs.push(s);
  }
  const groups = [...m.values()];
  groups.forEach((g) => g.locs.sort((a, b) => a - b));
  // Alphabetisch: einfache Reste ohne di/tri, zusammengesetzte mit ihrem vollen Namen
  groups.sort((a, b) => a.key.localeCompare(b.key, 'de') || a.name.localeCompare(b.name, 'de'));
  return groups;
}

// Bewertung einer ausgerichteten Kette: kleiner = besser
function score(adj, chain, from) {
  const subs = branchesOf(adj, chain, from);
  const groups = groupSubs(subs);
  const locs = subs.map((s) => s.loc).sort((a, b) => a - b);
  const alphaLocs = groups.flatMap((g) => g.locs);
  return { chain, subs, groups, locs, alphaLocs };
}
function better(a, b) {
  // true wenn a besser als b
  if (a.chain.length !== b.chain.length) return a.chain.length > b.chain.length;
  if (a.subs.length !== b.subs.length) return a.subs.length > b.subs.length;
  const c = cmpArr(a.locs, b.locs); if (c) return c < 0;
  const d = cmpArr(a.alphaLocs, b.alphaLocs); if (d) return d < 0;
  // weniger verzweigte Reste bevorzugen (mehr einfache Reste)
  const sa = a.subs.filter((s) => !s.complex).length, sb = b.subs.filter((s) => !s.complex).length;
  if (sa !== sb) return sa > sb;
  return format(a.groups, a.chain.length).localeCompare(format(b.groups, b.chain.length)) < 0;
}

// Name eines Rests, der an "parent" hängt und mit "root" beginnt
function nameBranch(adj, root, parent) {
  let best = null;
  for (const p of pathsAway(adj, root, parent)) {
    const s = score(adj, p, parent);
    if (!best || better(s, best)) best = s;
  }
  const n = best.chain.length;
  const size = countAway(adj, root, parent);
  if (!best.subs.length) return { name: stem(n).toLowerCase() + 'yl', key: stem(n).toLowerCase() + 'yl', complex: false, size, len: n };
  const inner = format(best.groups, n, { yl: true });
  return { name: '(' + inner + ')', key: alphaKey(inner), complex: true, size, len: n };
}
function countAway(adj, root, parent) {
  let c = 0; const st = [[root, parent]];
  while (st.length) { const [cur, prev] = st.pop(); c++; for (const n of adj.get(cur)) if (n !== prev) st.push([n, cur]); }
  return c;
}

// Gruppen + Kettenlänge -> Name (klein geschrieben, außer erster Buchstabe)
export function format(groups, n, opt = {}) {
  const parts = groups.map((g) => {
    const k = g.locs.length;
    let nm = g.name;
    if (k > 1) nm = g.complex ? (MULT_CX[k] || k + '×') + nm : (MULT[k] || k + '×') + nm;
    return g.locs.join(',') + '-' + nm;
  });
  let s = parts.join('-');
  const base = stem(n).toLowerCase() + (opt.yl ? 'yl' : 'an');
  // Vor dem Stammnamen kein Bindestrich, außer nach einer Klammer ist ok ohne
  s = s + base;
  return capFirst(s.toLowerCase());
}

// Hauptfunktion: Molekül -> Name + alle Zwischenschritte
export function nameAlkane(mol) {
  const atoms = mol.atoms;
  if (!atoms.length) return null;
  const adj = adjacency(mol);
  // Prüfen: zusammenhängend, kein Ring, höchstens 4 Bindungen
  const seen = new Set(); const st = [atoms[0].id];
  while (st.length) { const c = st.pop(); if (seen.has(c)) continue; seen.add(c); adj.get(c).forEach((n) => st.push(n)); }
  if (seen.size !== atoms.length) return { error: 'Das Molekül besteht aus mehreren Teilen. Alle C-Atome müssen verbunden sein.' };
  if (mol.bonds.length !== atoms.length - 1) return { error: 'Alkane in diesem Baukasten haben keine Ringe.' };
  if (atoms.some((a) => adj.get(a.id).length > 4)) return { error: 'Ein C-Atom hat mehr als 4 Bindungen. Das geht nicht.' };

  const n = atoms.length;
  const formula = { c: n, h: 2 * n + 2 };
  if (n === 1) return { name: 'Methan', chain: [atoms[0].id], groups: [], subs: [], n, len: 1, formula, longest: 1, allChains: 1, other: null };

  const leaves = atoms.filter((a) => adj.get(a.id).length === 1).map((a) => a.id);
  const cands = [];
  for (const l of leaves) for (const p of pathsAway(adj, l, null)) if (p.length > 1 || leaves.length === 1) cands.push(p);
  const maxLen = Math.max(...cands.map((p) => p.length));
  const longest = cands.filter((p) => p.length === maxLen);
  let best = null;
  const scored = longest.map((p) => score(adj, p, null));
  for (const s of scored) if (!best || better(s, best)) best = s;
  // gleiche Kette andersherum (für die Erklärung)
  const rev = scored.find((s) => s.chain[0] === best.chain[best.chain.length - 1] && s.chain[s.chain.length - 1] === best.chain[0] && s.chain.length === best.chain.length && s.chain.every((id, i) => id === best.chain[best.chain.length - 1 - i]));
  const uniqueChains = new Set(longest.map((p) => [p[0], p[p.length - 1]].sort().join('-'))).size;
  const maxSubs = Math.max(...scored.map((s) => s.subs.length));
  const name = format(best.groups, maxLen);
  return {
    name, n, len: maxLen, formula,
    chain: best.chain, subs: best.subs, groups: best.groups, locs: best.locs,
    other: rev ? { locs: rev.locs, groups: rev.groups } : null,
    allChains: uniqueChains, maxSubs,
    fewerSubsChains: scored.some((s) => s.subs.length < maxSubs),
  };
}

// ---------- Falsche Namen für die Übung (typische Fehler) ----------
export function wrongNames(res, mol, naiveChain) {
  const out = new Map();
  const add = (s, why) => { if (s && s !== res.name && !out.has(s)) out.set(s, why); };
  const n = res.len;
  // 1. falsch herum nummeriert
  if (res.other) add(format(res.other.groups, n), 'Falsch herum nummeriert');
  else if (res.groups.length) add(format(res.groups.map((g) => ({ ...g, locs: g.locs.map((l) => n + 1 - l).sort((a, b) => a - b) })), n), 'Falsch herum nummeriert');
  // 2. di/tri mitgezählt beim Alphabet
  if (res.groups.length > 1) {
    const g2 = [...res.groups].sort((a, b) => {
      const ka = (a.locs.length > 1 ? MULT[a.locs.length] : '') + a.key, kb = (b.locs.length > 1 ? MULT[b.locs.length] : '') + b.key;
      return ka.localeCompare(kb, 'de');
    });
    add(format(g2, n), 'di/tri beim Alphabet mitgezählt');
    add(format([...res.groups].reverse(), n), 'Nicht alphabetisch sortiert');
  }
  // 3. gleiche Reste nicht zusammengefasst
  if (res.groups.some((g) => g.locs.length > 1)) {
    const parts = res.subs.slice().sort((a, b) => a.loc - b.loc).map((s) => ({ name: s.name, key: s.key, complex: s.complex, locs: [s.loc] }));
    add(format(parts.sort((a, b) => a.key.localeCompare(b.key, 'de')), n), 'Gleiche Reste nicht zusammengefasst');
  }
  // 4. nicht die längste Kette
  if (naiveChain && mol) {
    const adj = adjacency(mol);
    const tries = [naiveChain, [...naiveChain].reverse()].map((c) => score(adj, c, null));
    let b = tries[0]; if (better(tries[1], b)) b = tries[1];
    add(format(b.groups, b.chain.length), 'Nicht die längste Kette genommen');
  }
  // 5. Kette zu kurz gezählt / Zahl daneben
  if (res.groups.length) {
    const g = res.groups.map((x, i) => (i === 0 ? { ...x, locs: x.locs.map((l) => Math.min(n - 1, l + 1)) } : x));
    add(format(g, n), 'Falsche Position');
    add(format(res.groups, n + 1), 'C-Atome falsch gezählt');
    add(format(res.groups, n - 1), 'C-Atome falsch gezählt');
  }
  return [...out.entries()].map(([name, why]) => ({ name, why }));
}

// ---------- Name -> Molekül (einfache Reste Methyl bis Hexyl) ----------
const STEM_LOW = STEMS.map((s) => s.toLowerCase());
export function parseName(src) {
  let s = String(src || '').toLowerCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
  if (!s) return { error: 'Bitte einen Namen eingeben.' };
  if (!s.endsWith('an')) return { error: 'Ein Alkan-Name endet auf „-an“, z. B. 2-Methylpentan.' };
  let n = 0;
  // "ethan" endet auch in "methan" -> längsten nehmen
  let bestLen = 0;
  STEM_LOW.forEach((st, i) => { if (s.endsWith(st + 'an') && st.length > bestLen) { bestLen = st.length; n = i + 1; } });
  if (!n) return { error: 'Den Stammnamen kenne ich nicht. Erlaubt: Methan bis Icosan.' };
  let rest = s.slice(0, s.length - bestLen - 2).replace(/-$/, '');
  const subs = [];
  const re = /^-?(\d+(?:,\d+)*)-(di|tri|tetra|penta|hexa)?(meth|eth|prop|but|pent|hex)yl/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m) return { error: `„${rest}“ verstehe ich nicht. Schreibweise wie 3-Ethyl-2,2-dimethylpentan.` };
    const locs = m[1].split(',').map(Number);
    const want = m[2] ? MULT.indexOf(m[2]) : 1;
    if (locs.length !== want) return { error: `Bei „${m[0].replace(/^-/, '')}“ passen Zahlen und Vorsilbe nicht zusammen (${locs.length} Zahl${locs.length > 1 ? 'en' : ''}, aber ${m[2] ? m[2] + '-' : 'keine Vorsilbe'}).` };
    const size = STEM_LOW.indexOf(m[3]) + 1;
    for (const l of locs) {
      if (l < 1 || l > n) return { error: `Position ${l} gibt es in einer Kette mit ${n} C-Atomen nicht.` };
      subs.push({ loc: l, size });
    }
    rest = rest.slice(m[0].length);
  }
  const per = {};
  for (const x of subs) { per[x.loc] = (per[x.loc] || 0) + 1; if (per[x.loc] > ((x.loc === 1 || x.loc === n) ? 3 : 2)) return { error: `An C${x.loc} hängen zu viele Reste. Ein C-Atom hat nur 4 Bindungen.` }; }
  return { n, subs };
}

// Aufbau auf dem Raster: Hauptkette waagerecht, Reste nach oben/unten
export function layout(spec, cols, rows) {
  const { n, subs } = spec;
  if (n > cols - 2) return { error: `Die Kette ist zu lang für das Raster (höchstens ${cols - 2} C-Atome).` };
  const mid = Math.floor(rows / 2);
  const c0 = Math.floor((cols - n) / 2);
  const atoms = [], bonds = [];
  const at = new Map();
  let id = 1;
  const put = (x, y, from) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows || at.has(x + ',' + y)) return null;
    const a = { id: id++, x, y }; atoms.push(a); at.set(x + ',' + y, a.id);
    if (from) bonds.push([from, a.id]);
    return a.id;
  };
  const chain = [];
  for (let i = 0; i < n; i++) chain.push(put(c0 + i, mid, i ? chain[i - 1] : null));
  const sorted = subs.slice().sort((a, b) => b.size - a.size || a.loc - b.loc);
  const used = {};
  for (const s of sorted) {
    const x = c0 + s.loc - 1;
    const sides = [];
    if (s.loc === 1) sides.push([-1, 0]);
    if (s.loc === n) sides.push([1, 0]);
    sides.push([0, -1], [0, 1]);
    let placed = false;
    for (const [dx, dy] of sides) {
      const k = x + ':' + dx + ':' + dy; if (used[k]) continue;
      // Platz prüfen
      const cells = [];
      let cx = x, cy = mid, ddx = dx, ddy = dy;
      for (let j = 0; j < s.size; j++) {
        let nx = cx + ddx, ny = cy + ddy;
        if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) { ddx = ddy ? (s.loc <= n / 2 ? -1 : 1) : ddx; ddy = 0; nx = cx + ddx; ny = cy; }
        cells.push([nx, ny]); cx = nx; cy = ny;
      }
      if (cells.some(([a, b]) => a < 0 || b < 0 || a >= cols || b >= rows || at.has(a + ',' + b))) continue;
      let prev = chain[s.loc - 1];
      for (const [a, b] of cells) prev = put(a, b, prev);
      used[k] = 1; placed = true; break;
    }
    if (!placed) return { error: 'So viele Reste passen nicht auf das Raster.' };
  }
  return { atoms, bonds, chain };
}
