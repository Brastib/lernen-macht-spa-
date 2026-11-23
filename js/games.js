// Games: Spieler, Duelle (Tic-Tac-Toe, Windflug, Papierflieger) und Turnier „jeder gegen jeden“.
import { $, h, icon, sheet, menu, toast, confirmSheet } from './ui.js';

const COLORS = ['#4f7cff', '#ff6b5a', '#2fbf71', '#f2b632', '#a46bff', '#ff7ac8', '#21b8c9', '#8a8f98'];
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
export const GAMES = {
  ttt: { name: 'Tic-Tac-Toe', icon: 'ttt', sub: 'Drei in einer Reihe gewinnt', run: ticTacToe },
  wind: { name: 'Windflug', icon: 'wind', sub: 'Flieg durch Stifte und Bücher', run: windflug },
  plane: { name: 'Papierflieger', icon: 'plane', sub: 'Wer wirft am weitesten?', run: planeDuel },
  arena: { name: 'Strichkampf', icon: 'sword', sub: 'Figur und Waffe malen, dann kämpfen', run: (...a) => import('./arena.js').then((m) => m.arena(...a)) },
};
const MIX = ['ttt', 'wind', 'plane', 'arena'];

const players = () => store.get('gPlayers', []);
const names = () => store.get('gNames', []);
function savePlayers(list) {
  store.set('gPlayers', list);
  const all = [...list.map((p) => p.name), ...names()].filter((n, i, a) => a.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
  store.set('gNames', all.slice(0, 24));
}
function addStat(A, B, res) {
  const st = store.get('gStats', {});
  const row = (n) => (st[n] = st[n] || { w: 0, d: 0, l: 0 });
  if (res.w == null) { row(A.name).d++; row(B.name).d++; }
  else { row((res.w ? B : A).name).w++; row((res.w ? A : B).name).l++; }
  store.set('gStats', st);
}

// ---------- eigene Skins (Windflug) ----------
const skins = () => store.get('gSkins', {});
const skinOf = (name) => skins()[name.toLowerCase()] || null;
function setSkin(name, url) {
  const all = skins();
  if (url) all[name.toLowerCase()] = url; else delete all[name.toLowerCase()];
  try { localStorage.setItem('gSkins', JSON.stringify(all)); return true; } catch (e) { toast('Kein Platz mehr für Skins. Lösch einen alten Skin.'); return false; }
}
const skinImgs = new Map();
function skinImage(name) {
  const url = skinOf(name);
  if (!url) return null;
  let im = skinImgs.get(url);
  if (!im) { im = new Image(); im.src = url; skinImgs.set(url, im); }
  return im;
}
const SKIN_MIN = 0.5;   // Zeichnung muss mindestens die Hälfte der Malfläche überspannen
// Skin malen. Ergebnis: true, wenn gespeichert oder gelöscht
export async function skinEditor(p) {
  const { paintSheet } = await import('./gpaint.js');
  const r = await paintSheet({ title: `Skin für ${p.name}`, color: p.color, old: skinOf(p.name), min: SKIN_MIN, saveLabel: 'Skin sichern', removeLabel: 'Standard-Flieger',
    text: 'Mal deine Spielfigur. Sie fliegt nach rechts. Die Zeichnung muss mindestens bis zur gestrichelten Linie reichen.' });
  if (r === 'remove') { setSkin(p.name, null); toast('Skin entfernt'); return true; }
  if (r && setSkin(p.name, r.url)) { toast('Skin gesichert'); return true; }
  return false;
}

// ---------- Übersicht ----------
export async function renderGames(ctx) {
  const again = () => renderGames(ctx);
  const tour = store.get('gTour', null);
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Pause', title: 'Games',
    meta: tour && !tour.done ? `Turnier läuft · ${tour.matches.filter((m) => m.res).length} von ${tour.matches.length} Duellen` : 'Turnier und Duelle zu zweit',
    actions: [ctx.iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
      { label: 'Spieler bearbeiten', icon: 'edit', onClick: async () => { if (await editPlayers()) again(); } },
      tour ? { label: 'Turnier beenden', icon: 'trash', onClick: async () => { if (await confirmSheet('Turnier beenden?', 'Tabelle und Ergebnisse dieses Turniers werden gelöscht.', 'Beenden')) { store.set('gTour', null); again(); } } } : null,
      { label: 'Bestenliste leeren', icon: 'trash', onClick: async () => { if (await confirmSheet('Bestenliste leeren?', 'Alle Siege, Unentschieden und Niederlagen werden auf null gesetzt.', 'Leeren')) { store.set('gStats', {}); again(); } } },
    ].filter(Boolean)))],
  });
  const view = $('view');
  view.textContent = '';

  // Turnier
  view.append(h('h2.section', { text: 'Turnier' }));
  if (tour) view.append(tourPanel(tour, again));
  else view.append(h('div.ghero', null,
    h('span.gheroic', null, icon('trophy')),
    h('div.gherotx', null, h('b', { text: 'Turnier starten' }), h('small', { text: 'Jeder gegen jeden, mit Tabelle. Sieg 3 Punkte, Unentschieden 1 Punkt.' })),
    h('button.btn.primary', { text: 'Neues Turnier', on: { click: async () => { if (await newTournament()) again(); } } })));

  // Duelle
  view.append(h('h2.section', { text: 'Duell zu zweit' }), h('div.ptiles.gtiles', null,
    ...Object.entries(GAMES).map(([k, g]) => h('button.ptile', { on: { click: () => freeDuel(k, again) } },
      h('span.ptileic', null, icon(g.icon)), h('b', { text: g.name }), h('small', { text: g.sub })))));

  // Spieler und Bestenliste
  const ps = players();
  const st = store.get('gStats', {});
  view.append(h('div.gsechead', null, h('h2.section', { text: 'Spieler' }), h('button.btn.gedit', { text: ps.length ? 'Bearbeiten' : 'Spieler eintragen', on: { click: async () => { if (await editPlayers()) again(); } } })));
  if (!ps.length) view.append(h('p.calm', { text: 'Noch keine Spieler. Trag ein, wer mitspielt. Die Namen bleiben gespeichert.' }));
  else {
    const rows = ps.map((p) => ({ p, s: st[p.name] || { w: 0, d: 0, l: 0 } })).sort((a, b) => b.s.w - a.s.w || b.s.d - a.s.d || a.s.l - b.s.l);
    view.append(h('div.glist', null, ...rows.map(({ p, s }, i) => h('div.grow', null,
      h('span.grank', { text: String(i + 1) }), dot(p), h('b.gname', { text: p.name }),
      h('span.gnums', null, num(s.w, 'Siege'), num(s.d, 'Unent.'), num(s.l, 'Nied.')),
      h('button.gskinbtn', { title: 'Skin für Windflug malen', 'aria-label': `Skin für ${p.name} malen`, on: { click: async () => { if (await skinEditor(p)) again(); } } },
        skinOf(p.name) ? h('img', { src: skinOf(p.name), alt: '' }) : icon('pen'), h('span', { text: 'Skin' }))))));
  }
}
const dot = (p) => h('span.gdot', { style: { background: p.color } });
const num = (n, l) => h('span.gnum', null, h('b', { text: String(n) }), h('small', { text: l }));

// ---------- Spieler eintragen ----------
function playerSheet(title, { withGame = false, okLabel = 'Sichern' } = {}) {
  return sheet(title, (body, close) => {
    const saved = players();
    let count = Math.max(2, Math.min(8, saved.length || 2));
    let game = 'ttt', power = store.get('gPower', true);
    const vals = saved.map((p) => p.name);
    const list = h('div.gnames');
    const dl = h('datalist', { id: 'gnamelist' }, ...names().map((n) => h('option', { value: n })));
    const cnt = h('b.gcount', { text: String(count) });
    const draw = () => {
      cnt.textContent = String(count);
      list.replaceChildren(...Array.from({ length: count }, (_, i) => h('label.gnamerow', null,
        h('span.gdot', { style: { background: COLORS[i] } }),
        h('input', { type: 'text', value: vals[i] || '', placeholder: `Spieler ${i + 1}`, list: 'gnamelist', maxlength: 18, autocomplete: 'off', on: { input: (e) => { vals[i] = e.target.value; } } }))));
    };
    body.append(
      h('div.gstep', null, h('span', { text: 'Wie viele spielen?' }), h('div.gstepper', null,
        h('button.btn.round', { 'aria-label': 'Weniger', text: '−', on: { click: () => { if (count > 2) { count--; draw(); } } } }), cnt,
        h('button.btn.round', { 'aria-label': 'Mehr', text: '+', on: { click: () => { if (count < 8) { count++; draw(); } } } }))),
      list, dl);
    if (withGame) {
      const seg = h('div.gseg');
      const opts = [['ttt', 'Tic-Tac-Toe'], ['wind', 'Windflug'], ['plane', 'Flieger'], ['arena', 'Strichkampf'], ['mix', 'Gemischt']];
      const drawSeg = () => seg.replaceChildren(...opts.map(([k, l]) => h('button' + (k === game ? '.on' : ''), { text: l, on: { click: () => { game = k; drawSeg(); } } })));
      drawSeg();
      const pw = h('label.gswitch', null, h('span', null, h('b', { text: 'Power-ups beim Papierflieger' }), h('small', { text: 'Vor jedem Wurf eins aus drei wählen, dazu Kugeln in der Luft' })),
        h('input', { type: 'checkbox', checked: power, on: { change: (e) => { power = e.target.checked; } } }));
      body.append(h('p.glabel', { text: 'Welches Spiel?' }), seg, pw);
    }
    body.append(h('div.dlgactions', null,
      h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
      h('button.btn.primary', { text: okLabel, on: { click: () => {
        const list2 = vals.slice(0, count).map((v, i) => ({ name: (v || '').trim() || `Spieler ${i + 1}`, color: COLORS[i] }));
        const dup = list2.find((p, i) => list2.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) !== i);
        if (dup) { toast(`„${dup.name}“ kommt doppelt vor.`); return; }
        savePlayers(list2);
        if (withGame) store.set('gPower', power);
        close({ players: list2, game, power });
      } } })));
    draw();
  });
}
const editPlayers = () => playerSheet('Wer spielt mit?');

async function newTournament() {
  const r = await playerSheet('Neues Turnier', { withGame: true, okLabel: 'Turnier starten' });
  if (!r) return false;
  const n = r.players.length;
  const pairs = roundRobin(n);
  store.set('gTour', {
    game: r.game, power: r.power !== false, players: r.players, done: false, started: Date.now(),
    matches: pairs.map(([a, b], i) => ({ a, b, game: r.game === 'mix' ? MIX[i % MIX.length] : r.game, res: null })),
  });
  return true;
}
// Jeder gegen jeden (Kreis-Verfahren), damit niemand zweimal direkt hintereinander spielt
function roundRobin(n) {
  const ids = Array.from({ length: n }, (_, i) => i);
  if (n % 2) ids.push(-1);
  const m = ids.length, out = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a >= 0 && b >= 0) out.push(r % 2 ? [b, a] : [a, b]);
    }
    ids.splice(1, 0, ids.pop());
  }
  return out;
}
function table(t) {
  const rows = t.players.map((p, i) => ({ i, p, sp: 0, w: 0, d: 0, l: 0, pts: 0 }));
  for (const m of t.matches) {
    if (!m.res) continue;
    const A = rows[m.a], B = rows[m.b];
    A.sp++; B.sp++;
    if (m.res.w == null) { A.d++; B.d++; A.pts++; B.pts++; }
    else { const W = m.res.w ? B : A, L = m.res.w ? A : B; W.w++; W.pts += 3; L.l++; }
  }
  return rows.sort((a, b) => b.pts - a.pts || b.w - a.w || a.l - b.l || a.i - b.i);
}

function tourPanel(t, again) {
  const rows = table(t);
  const next = t.matches.find((m) => !m.res);
  const played = t.matches.filter((m) => m.res).length;
  const box = h('div.gtour');
  if (next) {
    const A = t.players[next.a], B = t.players[next.b], g = GAMES[next.game];
    box.append(h('div.gnext', null,
      h('div.gnexthead', null, h('small', { text: `Duell ${played + 1} von ${t.matches.length}` }), h('span.gtag', null, icon(g.icon), g.name)),
      h('div.gnextvs', null, h('span.gpl', null, dot(A), h('b', { text: A.name })), h('span.gvs', { text: 'gegen' }), h('span.gpl', null, dot(B), h('b', { text: B.name }))),
      h('button.btn.primary.gstart', { on: { click: async () => {
        const res = await runDuel(next.game, A, B, { tour: true, power: t.power !== false });
        if (!res) return;
        const t2 = store.get('gTour', null);
        if (!t2) return;
        const m2 = t2.matches.find((m) => !m.res && m.a === next.a && m.b === next.b);
        if (m2) m2.res = res;
        if (t2.matches.every((m) => m.res)) t2.done = true;
        store.set('gTour', t2);
        again();
      } } }, icon('play'), 'Duell starten')));
  } else {
    const top = rows[0], shared = rows.filter((r) => r.pts === top.pts && r.w === top.w && r.l === top.l);
    box.append(h('div.gchamp', null,
      h('span.gchampic', { style: { color: top.p.color } }, icon('trophy')),
      h('b', { text: shared.length > 1 ? `Geteilter Sieg: ${shared.map((r) => r.p.name).join(' und ')}` : `${top.p.name} gewinnt das Turnier!` }),
      h('small', { text: `${top.pts} Punkte aus ${top.sp} Duellen` }),
      h('div.gchampbtns', null,
        h('button.btn', { text: 'Turnier schließen', on: { click: () => { store.set('gTour', null); again(); } } }),
        h('button.btn.primary', { text: 'Neues Turnier', on: { click: async () => { if (await newTournament()) again(); } } }))));
  }
  // Tabelle
  box.append(h('div.gtable', null,
    h('div.gtr.gth', null, h('span', { text: '#' }), h('span.gtn', { text: 'Name' }), h('span', { text: 'Sp' }), h('span', { text: 'S' }), h('span', { text: 'U' }), h('span', { text: 'N' }), h('span.gtp', { text: 'Pkt' })),
    ...rows.map((r, k) => h('div.gtr' + (k === 0 && played ? '.lead' : ''), null,
      h('span', { text: String(k + 1) }), h('span.gtn', null, dot(r.p), h('b', { text: r.p.name })),
      h('span', { text: String(r.sp) }), h('span', { text: String(r.w) }), h('span', { text: String(r.d) }), h('span', { text: String(r.l) }), h('span.gtp', { text: String(r.pts) })))));
  // Duelle
  box.append(h('details.gmatches', null, h('summary', { text: `Alle Duelle (${played} von ${t.matches.length} gespielt)` }),
    h('div', null, ...t.matches.map((m) => {
      const A = t.players[m.a], B = t.players[m.b];
      const res = m.res ? (m.res.w == null ? 'Unentschieden' : `${(m.res.w ? B : A).name} gewinnt`) : 'offen';
      return h('div.gmatch' + (m.res ? '.done' : ''), null, icon(GAMES[m.game].icon), h('span.gmn', { text: `${A.name} gegen ${B.name}` }), h('small', { text: m.res && m.res.detail ? `${res} · ${m.res.detail}` : res }));
    }))));
  return box;
}

// ---------- freies Duell ----------
async function freeDuel(key, after) {
  let ps = players();
  if (ps.length < 2) { const r = await editPlayers(); if (!r) return; ps = r.players; }
  let pick;
  if (ps.length === 2) pick = ps;
  else {
    pick = await sheet(`${GAMES[key].name}: Wer spielt?`, (body, close) => {
      const sel = [];
      const grid = h('div.gpick');
      const go = h('button.btn.primary', { text: 'Los geht’s', disabled: true, on: { click: () => close(sel.map((i) => ps[i])) } });
      const draw = () => {
        grid.replaceChildren(...ps.map((p, i) => h('button.gchip' + (sel.includes(i) ? '.on' : ''), { on: { click: () => {
          const k = sel.indexOf(i);
          if (k >= 0) sel.splice(k, 1); else { if (sel.length === 2) sel.shift(); sel.push(i); }
          draw();
        } } }, dot(p), p.name)));
        go.disabled = sel.length !== 2;
      };
      body.append(h('p.glabel', { text: 'Tippe zwei Namen an.' }), grid, h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), go));
      draw();
    });
    if (!pick) return;
  }
  await runDuel(key, pick[0], pick[1], { tour: false });
  after();
}

// ---------- Spielfenster ----------
function openFx(title, sub) {
  const ac = new AbortController();
  let onClose = null;
  const stage = h('div.gstage');
  const close = () => { if (ac.signal.aborted) return; ac.abort(); root.classList.remove('in'); setTimeout(() => root.remove(), 220); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.planefx')) close(); };
  const root = h('div.gamefx', null,
    h('div.gtop', null, h('div.gtitle', null, h('b', { text: title }), h('small', { text: sub })),
      h('button.btn.round.gclose', { 'aria-label': 'Schließen', title: 'Schließen', on: { click: close } }, icon('close'))),
    stage);
  document.body.append(root);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => root.classList.add('in'));
  return { root, stage, signal: ac.signal, close, set onClose(f) { onClose = f; } };
}

// Spielt ein Duell. Ergebnis {w: 0|1|null, detail} oder null, wenn abgebrochen.
async function runDuel(key, A, B, { tour, power }) {
  const g = GAMES[key];
  const fx = openFx(g.name, `${A.name} gegen ${B.name}`);
  let round = 0, last = null;
  const aborted = new Promise((r) => { fx.onClose = () => r(null); });
  for (;;) {
    fx.stage.replaceChildren();
    const res = await Promise.race([g.run(fx, round % 2 ? B : A, round % 2 ? A : B, { power: tour ? power : null }), aborted]);
    if (!res || fx.signal.aborted) return last;
    // Ergebnis auf A/B zurückrechnen, falls getauscht wurde
    const r = round % 2 && res.w != null ? { ...res, w: 1 - res.w } : res;
    addStat(A, B, r);
    last = r;
    const next = await Promise.race([resultCard(fx, r, A, B, tour), aborted]);
    if (next !== 'again') { fx.close(); return r; }
    round++;
  }
}

function resultCard(fx, res, A, B, tour) {
  return new Promise((resolve) => {
    const W = res.w == null ? null : (res.w ? B : A);
    fx.stage.querySelectorAll('.gres').forEach((el) => el.remove());
    fx.stage.append(h('div.gres', null, h('div.grescard', null,
      h('span.gresic', { style: { color: W ? W.color : 'var(--muted)' } }, icon(W ? 'trophy' : 'pairs')),
      h('b', { text: W ? `${W.name} gewinnt!` : 'Unentschieden' }),
      res.detail ? h('small', { text: res.detail }) : null,
      h('div.gresbtns', null,
        tour ? null : h('button.btn', { text: 'Fertig', on: { click: () => resolve('done') } }),
        h('button.btn.primary', { text: tour ? 'Zurück zur Tabelle' : 'Nochmal', on: { click: () => resolve(tour ? 'done' : 'again') } })))));
  });
}

// ---------- Tic-Tac-Toe ----------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function ticTacToe(fx, A, B) {
  return new Promise((resolve) => {
    const cells = Array(9).fill(null);
    let turn = 0, over = false;
    const pa = h('span.gturn', null, dot(A), h('b', { text: A.name }), h('small', { text: '✕' }));
    const pb = h('span.gturn', null, dot(B), h('b', { text: B.name }), h('small', { text: '◯' }));
    const msg = h('p.gmsg');
    const board = h('div.tttboard');
    const btns = cells.map((_, i) => h('button.tttcell', { 'aria-label': `Feld ${i + 1}`, on: { click: () => play(i) } }));
    board.append(...btns);
    fx.stage.append(h('div.tttwrap', null, h('div.gturns', null, pa, pb), board, msg));
    const svg = (p, who) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 100 100');
      s.setAttribute('class', 'tttmark');
      s.style.color = p.color;
      s.innerHTML = who ? '<circle cx="50" cy="50" r="28" pathLength="1"/>' : '<path d="M27 27L73 73" pathLength="1"/><path d="M73 27L27 73" pathLength="1" style="animation-delay:.12s"/>';
      return s;
    };
    const show = () => {
      pa.classList.toggle('on', !over && turn === 0); pb.classList.toggle('on', !over && turn === 1);
      if (!over) msg.textContent = `${turn ? B.name : A.name} ist dran`;
    };
    function play(i) {
      if (over || cells[i] != null || fx.signal.aborted) return;
      cells[i] = turn;
      btns[i].append(svg(turn ? B : A, turn));
      btns[i].disabled = true;
      const line = LINES.find((l) => l.every((k) => cells[k] === turn));
      if (line) return end(turn, line);
      if (cells.every((c) => c != null)) return end(null);
      turn = 1 - turn; show();
    }
    function end(w, line) {
      over = true; show();
      btns.forEach((b) => { b.disabled = true; });
      if (line) {
        line.forEach((k) => btns[k].classList.add('win'));
        const c = (k) => [(k % 3) * 100 + 50, Math.floor(k / 3) * 100 + 50];
        const [x1, y1] = c(line[0]), [x2, y2] = c(line[2]);
        const dx = Math.sign(x2 - x1) * 30, dy = Math.sign(y2 - y1) * 30;
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 300 300'); s.setAttribute('class', 'tttline');
        s.style.color = (w ? B : A).color;
        s.innerHTML = `<path d="M${x1 - dx} ${y1 - dy}L${x2 + dx} ${y2 + dy}" pathLength="1"/>`;
        board.append(s);
      }
      msg.textContent = w == null ? 'Alle Felder voll.' : `${(w ? B : A).name} hat drei in einer Reihe.`;
      setTimeout(() => resolve({ w, detail: w == null ? 'Alle Felder voll' : 'Drei in einer Reihe' }), 900);
    }
    show();
  });
}

// ---------- Windflug ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PENCILS = [['#f4c430', '#d9a90f'], ['#3f7be0', '#2b5fb8'], ['#e25645', '#b93a2c'], ['#2fa56a', '#1f7f4f'], ['#8f63d8', '#6d45b6']];
const BOOKS = ['#2f4a7a', '#8b2e3c', '#2c6b57', '#b8772a', '#4b3f72', '#6a7383', '#a5462b', '#1f5f7a'];

function windflug(fx, A, B) {
  return new Promise((resolve) => {
    const seed = (Math.random() * 1e9) | 0;      // beide bekommen dieselbe Strecke
    const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const cv = h('canvas.wfcv');
    const score = h('div.wfscore', { hidden: true });
    const card = h('div.gres');
    const wrap = h('div.wfwrap', null, cv, score, card);
    fx.stage.append(wrap);
    const ctx = cv.getContext('2d');
    const scores = [];
    let who = 0, st = null, raf = 0, last = 0, cw = 0, ch = 0, U = 1, W = 800;

    const size = () => {
      const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cw = r.width; ch = r.height;
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      U = ch / 600; W = cw / U;
      ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
      if (st) draw();
    };
    const ro = new ResizeObserver(size); ro.observe(wrap);

    function reset() {
      const R = rng(seed);
      st = { R, y: 280, vy: 0, t: 0, run: false, dead: false, pts: 0, dist: 0, obs: [], next: 520, idx: 0, shake: 0, flapT: 1 };
      spawnTo(W + 400);
    }
    function spawnTo(xmax) {
      while (st.next < st.dist + xmax) {
        const R = st.R, i = st.idx++;
        const gs = Math.max(150, 220 - i * 4);
        const prev = st.obs.length ? st.obs[st.obs.length - 1].gy : 300;
        let gy = 110 + gs / 2 + R() * (600 - 150 - gs);
        gy = Math.max(prev - 170, Math.min(prev + 170, gy));
        const books = []; let y = 600;
        while (y > gy + gs / 2 + 4) {
          let hh = 26 + R() * 22; if (y - hh < gy + gs / 2 + 18) hh = y - (gy + gs / 2);
          books.push({ y: y - hh, h: hh, w: 60 + R() * 14, off: (R() - 0.5) * 10, c: BOOKS[(R() * BOOKS.length) | 0] });
          y -= hh;
        }
        st.obs.push({ x: st.next, gy, gs, pc: PENCILS[(R() * PENCILS.length) | 0], books, passed: false });
        st.next += 270 + R() * 40;
      }
      st.obs = st.obs.filter((o) => o.x - st.dist > -120);
    }
    const PX = () => Math.min(W * 0.3, 260);

    function turnCard() {
      const p = who ? B : A;
      score.hidden = true;
      card.hidden = false;
      card.replaceChildren(h('div.grescard', null,
        h('span.gresic', { style: { color: p.color } }, icon('wind')),
        h('b', { text: `${p.name} ist dran` }),
        h('small', { text: who ? `Zu schlagen: ${scores[0]} ${scores[0] === 1 ? 'Punkt' : 'Punkte'}` : 'Tippe auf den Bildschirm oder drücke die Leertaste, damit der Flieger steigt. Weich den Stiften und Büchern aus.' }),
        h('div.gresbtns', null,
          h('button.btn', { on: { click: async (e) => { e.stopPropagation(); if (await skinEditor(p)) turnCard(); } } }, skinOf(p.name) ? 'Skin ändern' : 'Skin malen'),
          h('button.btn.primary', { text: 'Start', on: { click: (e) => { e.stopPropagation(); begin(); } } }))));
      const im = skinImage(p.name);
      if (im && !im.complete) im.onload = () => { if (st && !st.run) draw(); };
      reset(); draw();
    }
    function begin() {
      card.hidden = true; score.hidden = false; score.textContent = '0';
      st.run = true; flap();
      last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    }
    function flap() { if (!st || !st.run || st.dead) return; st.vy = -440; st.flapT = 0; }
    function crash() {
      st.dead = true; st.shake = 1;
      scores.push(st.pts);
      setTimeout(() => {
        if (fx.signal.aborted) return;
        if (who === 0) { who = 1; turnCard(); return; }
        cleanup();
        const [a, b] = scores;
        resolve({ w: a > b ? 0 : b > a ? 1 : null, detail: `${a} : ${b} Punkte` });
      }, 1100);
    }
    function loop(now) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      step(dt); draw();
      if (st.run || st.shake > 0) raf = requestAnimationFrame(loop);
    }
    function step(dt) {
      st.t += dt; st.flapT += dt;
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 2.2);
      if (!st.run) return;
      st.vy = Math.min(720, st.vy + 1650 * dt);
      st.y += st.vy * dt;
      if (st.dead) { if (st.y > 590) { st.y = 590; st.run = false; } return; }
      const speed = 190 + Math.min(80, st.pts * 3);
      st.dist += speed * dt;
      spawnTo(W + 400);
      if (st.y < 12) { st.y = 12; st.vy = Math.max(0, st.vy); }
      if (st.y > 588) return crash();
      const px = PX();
      for (const o of st.obs) {
        const x = o.x - st.dist;
        if (!o.passed && x + 56 < px - 14) { o.passed = true; st.pts++; score.textContent = String(st.pts); score.classList.remove('pop'); void score.offsetWidth; score.classList.add('pop'); }
        if (hit(o, x, px, st.y)) return crash();
      }
    }
    function hit(o, x, px, py) {
      const r = 11, top = o.gy - o.gs / 2, bot = o.gy + o.gs / 2;
      if (px + r < x - 8 || px - r > x + 72) return false;
      // Stift: Körper und spitz zulaufende Spitze
      if (px + r > x && px - r < x + 56) {
        if (py - r < top - 46) return true;
        if (py - r < top) { const half = 28 * Math.max(0, (top - (py - r)) / 46); if (Math.abs(px - (x + 28)) < half + r * 0.6) return true; }
      }
      // Bücher
      for (const b of o.books) if (py + r > b.y + 2 && px + r > x + 28 - b.w / 2 + b.off && px - r < x + 28 + b.w / 2 + b.off) return true;
      return false;
    }

    // Zeichnen
    function draw() {
      const shx = st.shake ? (Math.sin(st.t * 70) * 6 * st.shake) : 0;
      ctx.save(); ctx.translate(shx, 0);
      ctx.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; ctx.fillRect(-10, 0, W + 20, 600);
      ctx.strokeStyle = dark ? 'rgba(140,170,255,.14)' : 'rgba(70,120,210,.20)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let y = 66; y < 600; y += 30) { ctx.moveTo(-10, y); ctx.lineTo(W + 10, y); } ctx.stroke();
      // Heftrand und Lochung scrollen mit
      const page = 760, off = -(st.dist * 0.6 % page);
      for (let x = off; x < W + page; x += page) {
        ctx.strokeStyle = dark ? 'rgba(255,120,120,.22)' : 'rgba(225,80,80,.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 90, 0); ctx.lineTo(x + 90, 600); ctx.stroke();
        ctx.fillStyle = dark ? '#12151c' : '#ebe8df';
        for (const hy of [150, 300, 450]) { ctx.beginPath(); ctx.arc(x + 40, hy, 9, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const o of st.obs) { const x = o.x - st.dist; if (x > -100 && x < W + 100) { drawBooks(o, x); drawPencil(o, x); } }
      drawPlane(PX(), st.y, who ? B : A);
      ctx.restore();
    }
    function drawPencil(o, x) {
      const top = o.gy - o.gs / 2, [c1, c2] = o.pc, cone = 46;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3;
      ctx.fillStyle = c1; ctx.fillRect(x, -10, 56, top - cone + 10);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 4, -10, 12, top - cone + 10);
      ctx.fillStyle = c2; ctx.fillRect(x + 38, -10, 18, top - cone + 10);
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x + 18, -10, 2, top - cone + 10); ctx.fillRect(x + 36, -10, 2, top - cone + 10);
      // Holz
      ctx.fillStyle = dark ? '#d9b37c' : '#ecc994';
      ctx.beginPath(); ctx.moveTo(x, top - cone);
      for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(x + i * 14 - 7, top - cone + 7, x + i * 14, top - cone);
      ctx.lineTo(x + 28, top); ctx.closePath(); ctx.fill();
      // Mine
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + 28 - 9, top - 15); ctx.lineTo(x + 28 + 9, top - 15); ctx.lineTo(x + 28, top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(x + 28 - 9, top - 15); ctx.lineTo(x + 28 + 9, top - 15); ctx.lineTo(x + 28, top); ctx.closePath(); ctx.fill();
    }
    function drawBooks(o, x) {
      for (const b of o.books) {
        const bx = x + 28 - b.w / 2 + b.off;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.fillStyle = b.c; rr(bx, b.y, b.w, b.h, 4); ctx.fill(); ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(bx + 2, b.y + 2, b.w - 4, 3);
        ctx.fillStyle = 'rgba(255,214,130,.75)'; ctx.fillRect(bx + 8, b.y + 3, 3, b.h - 6); ctx.fillRect(bx + b.w - 11, b.y + 3, 3, b.h - 6);
        if (b.h > 30) { ctx.fillStyle = 'rgba(255,255,255,.78)'; rr(bx + b.w / 2 - 13, b.y + b.h / 2 - 5, 26, 10, 2); ctx.fill(); }
      }
    }
    function rr(x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawPlane(px, py, p) {
      const col = p.color;
      const ang = st.dead ? Math.min(1.2, 0.2 + st.vy / 600) : Math.max(-0.45, Math.min(0.8, st.vy / 900));
      const flapK = Math.max(0, 1 - st.flapT * 5);
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      const im = skinImage(p.name);
      if (im && im.complete && im.naturalWidth) {
        const k = 60 / Math.max(im.naturalWidth, im.naturalHeight), w = im.naturalWidth * k, hh = im.naturalHeight * k;
        ctx.scale(1 + flapK * 0.08, 1 - flapK * 0.1);
        ctx.shadowColor = dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.22)'; ctx.shadowBlur = dark ? 4 : 6; ctx.shadowOffsetY = dark ? 0 : 3;
        ctx.drawImage(im, -w / 2, -hh / 2, w, hh);
        ctx.restore(); return;
      }
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(2, 14, 18, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.4; ctx.strokeStyle = dark ? '#cdd6e6' : '#334';
      // unterer Flügel (Farbe des Spielers)
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-17, 4); ctx.lineTo(-11, 11 - flapK * 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      // oberer Flügel (Papier)
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-18, -13 + flapK * 5); ctx.lineTo(-11, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-11, 2); ctx.stroke();
      ctx.restore();
    }
    const onDown = (e) => { if (card.hidden && !e.target.closest('button')) { e.preventDefault(); flap(); } };
    const onKey = (e) => { if ((e.code === 'Space' || e.key === 'ArrowUp') && card.hidden) { e.preventDefault(); flap(); } };
    wrap.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    function cleanup() { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); }
    fx.signal.addEventListener('abort', cleanup);
    size(); turnCard();
  });
}

// ---------- Papierflieger-Duell ----------
function noteCanvas(p, i) {
  const c = document.createElement('canvas'); c.width = 840; c.height = 1188;
  const x = c.getContext('2d');
  x.fillStyle = '#fffdf7'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(70,120,210,.25)'; x.lineWidth = 2;
  for (let y = 160; y < c.height; y += 48) { x.beginPath(); x.moveTo(0, y); x.lineTo(c.width, y); x.stroke(); }
  x.strokeStyle = 'rgba(225,80,80,.4)'; x.beginPath(); x.moveTo(110, 0); x.lineTo(110, c.height); x.stroke();
  x.fillStyle = p.color; x.fillRect(0, 0, c.width, 26);
  x.fillStyle = '#1d1d1f'; x.font = '600 44px -apple-system, "Segoe UI", Roboto, sans-serif'; x.fillText('Turnier-Flieger', 150, 140);
  x.fillStyle = p.color; x.font = '700 120px -apple-system, "Segoe UI", Roboto, sans-serif'; x.fillText(p.name, 150, 400, 640);
  x.fillStyle = '#6e6e76'; x.font = '400 40px -apple-system, "Segoe UI", Roboto, sans-serif'; x.fillText(i ? 'wirft als Zweites' : 'wirft als Erstes', 150, 488);
  return c;
}
async function planeDuel(fx, A, B, o = {}) {
  const { paperPlane, POWERS, POWER_IDS } = await import('./plane.js');
  const fmt = (m) => m.toFixed(1).replace('.', ',') + ' m';
  const dist = [];
  let power = o.power != null ? o.power : store.get('gPower', true);
  const free = o.power == null;
  for (const [i, p] of [A, B].entries()) {
    const offer = [...POWER_IDS].sort(() => Math.random() - 0.5).slice(0, 3);
    let pick = offer[0];
    const r0 = await new Promise((r) => {
      const card = h('div.grescard.pdcard');
      const draw = () => card.replaceChildren(
        h('span.gresic', { style: { color: p.color } }, icon('plane')),
        h('b', { text: `${p.name} wirft` }),
        h('small', { text: i ? `Zu schlagen: ${fmt(dist[0])}` : 'Jeder hat einen Wurf. Der weiteste Flieger gewinnt.' }),
        free ? h('label.gswitch.small', null, h('span', null, h('b', { text: 'Power-ups' })), h('input', { type: 'checkbox', checked: power, on: { change: (e) => { power = e.target.checked; store.set('gPower', power); draw(); } } })) : null,
        power ? h('p.glabel', { text: 'Such dir ein Power-up aus' }) : null,
        power ? h('div.pdpicks', null, ...offer.map((id) => h('button.pdpick' + (id === pick ? '.on' : ''), { style: { '--pc': POWERS[id].color }, on: { click: () => { pick = id; draw(); } } },
          h('span.pdpickic', null, icon(POWERS[id].icon)), h('b', { text: POWERS[id].name }), h('small', { text: POWERS[id].desc })))) : null,
        h('div.gresbtns', null, h('button.btn.primary', { text: 'Falten und werfen', on: { click: () => r(true) } })));
      draw();
      fx.stage.replaceChildren(h('div.gres', null, card));
      fx.signal.addEventListener('abort', () => r(false));
    });
    if (!r0) return null;
    const m = await paperPlane(noteCanvas(p, i), { power, pick: power ? pick : null, duel: { name: p.name, note: i ? `Zu schlagen: ${fmt(dist[0])}` : 'Ein Wurf, so weit wie möglich' } });
    if (m == null || fx.signal.aborted) return null;
    dist.push(Math.round(m * 10) / 10);
  }
  const [a, b] = dist;
  return { w: a > b ? 0 : b > a ? 1 : null, detail: `${fmt(a)} : ${fmt(b)}` };
}
