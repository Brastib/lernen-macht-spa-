// Skin-Hub: pro Spieler eigene Skins und Karten (Golf-Bahnen, Rennstrecken, Burgwache-Wege, Auto-Skin).
// Spielt jemand mit, stehen seine Karten im Spiel zur Auswahl und sein Auto fährt mit seinem Skin.
import { h, icon, toast, confirmSheet } from './ui.js';
import { isDark, inkOf, rng, chip } from './sketch.js';

const KEY = 'gHub';
const MAXMAPS = 8;
export function loadHub() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveHub(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { toast('Kein Platz mehr. Lösch alte Karten oder Skins.'); return false; } }
const entry = (all, name) => (all[name.toLowerCase()] = all[name.toLowerCase()] || {});

// ---------- Karten ----------
const round = (pts) => pts.map(([a, b]) => [Math.round(a), Math.round(b)]);
export const pack = {
  race: (t) => round(t),
  tower: (t) => round(t),
  golf: (c) => ({ walls: c.walls.map(round), start: round([c.start])[0], hole: round([c.hole])[0], mask: Array.from(c.mask).join('') }),
};
export const unpack = {
  race: (d) => d.map((q) => [...q]),
  tower: (d) => d.map((q) => [...q]),
  golf: (d) => ({ walls: d.walls.map((w) => w.map((q) => [...q])), start: [...d.start], hole: [...d.hole], mask: Uint8Array.from(d.mask, (ch) => +ch) }),
};
export function addMap(p, game, data) {
  const all = loadHub(), e = entry(all, p.name); e[game] = e[game] || [];
  if (e[game].length >= MAXMAPS) { toast(`Höchstens ${MAXMAPS} Karten pro Spiel. Lösch erst eine.`); return false; }
  const n = 1 + Math.max(0, ...e[game].map((m) => m.n || 0));
  e[game].push({ n, d: pack[game](data) });
  return saveHub(all);
}
function delMap(p, game, i) { const all = loadHub(), e = entry(all, p.name); (e[game] || []).splice(i, 1); saveHub(all); }
// Karten aller Mitspieler für ein Spiel: [{ owner, label, data }]
export function savedMaps(game, list) {
  const all = loadHub(), out = [], seen = new Set();
  for (const p of list.filter(Boolean)) {
    const k = p.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    for (const m of (all[k] && all[k][game]) || []) out.push({ owner: p, label: `${p.name}: Nr. ${m.n}`, data: unpack[game](m.d) });
  }
  return out;
}
// Leiste mit gespeicherten Karten zum Antippen
export function mapPicker(game, list, onPick) {
  const maps = savedMaps(game, list);
  if (!maps.length) return null;
  return h('div.hubpick', null, h('small', { text: 'Gespeicherte Karten:' }),
    ...maps.map((m) => h('button.hubchip', { style: { '--pc': m.owner.color }, on: { click: () => onPick(m.data) } }, h('span.gdot', { style: { background: m.owner.color } }), h('span', { text: m.label }))));
}

// ---------- Auto-Skin ----------
export function carSkin(name) { const e = loadHub()[name.toLowerCase()]; return (e && e.car) || null; }
const imgs = new Map();
export function carImage(name) {
  const url = carSkin(name); if (!url) return null;
  let im = imgs.get(url); if (!im) { im = new Image(); im.src = url; imgs.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}

// ---------- kleine Vorschaubilder ----------
function thumb(game, d, color) {
  const W = 160, H = 100, cv = h('canvas.hubthumb', { width: W * 2, height: H * 2 }), x = cv.getContext('2d'), dark = isDark(), ink = inkOf(dark);
  x.scale(2, 2); x.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; x.fillRect(0, 0, W, H);
  const SW = game === 'golf' ? 1000 : 1000, SH = 640, k = Math.min(W / SW, H / SH), ox = (W - SW * k) / 2, oy = (H - SH * k) / 2;
  x.translate(ox, oy); x.scale(k, k); x.lineCap = 'round'; x.lineJoin = 'round';
  const line = (pts, close) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); if (close) x.closePath(); };
  if (game === 'golf') {
    x.fillStyle = dark ? 'rgba(80,200,120,.12)' : 'rgba(80,190,110,.15)'; x.fillRect(0, 0, 1000, 640);
    const MW = 100; for (let i = 0; i < d.mask.length; i++) if (d.mask[i] !== '0') { x.fillStyle = d.mask[i] === '1' ? '#e8d28c' : '#7fb6f2'; x.fillRect((i % MW) * 10, Math.floor(i / MW) * 10, 10, 10); }
    x.strokeStyle = ink; x.lineWidth = 12; d.walls.forEach((w) => { line(w); x.stroke(); });
    x.fillStyle = ink; x.beginPath(); x.arc(d.hole[0], d.hole[1], 22, 0, 7); x.fill(); x.fillStyle = color; x.beginPath(); x.arc(d.start[0], d.start[1], 18, 0, 7); x.fill();
  } else {
    x.strokeStyle = ink; x.lineWidth = game === 'race' ? 100 : 56; line(d, game === 'race'); x.stroke();
    x.strokeStyle = game === 'race' ? (dark ? '#3a3e48' : '#d9d9de') : (dark ? '#4a4234' : '#eadcc0'); x.lineWidth = game === 'race' ? 86 : 44; line(d, game === 'race'); x.stroke();
  }
  x.setTransform(1, 0, 0, 1, 0, 0); x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(1, 1, W * 2 - 2, H * 2 - 2);
  return cv;
}

// ---------- Hub-Ansicht für einen Spieler ----------
const GAMESETS = [
  { k: 'race', title: 'Papierrennen', ic: 'car', text: 'Eigene Rennstrecken. Fährst du mit, kann man sie vor dem Rennen auswählen.' },
  { k: 'golf', title: 'Kritzelgolf', ic: 'golfflag', text: 'Eigene Golfbahnen mit Wänden, Sand und Wasser.' },
  { k: 'tower', title: 'Burgwache', ic: 'castle', text: 'Eigene Wege für die Gegner.' },
];
export function openHub(fx, p, { skinEditor, windSkin } = {}) {
  const R = rng((Math.random() * 1e9) | 0);
  const render = () => {
    const e = loadHub()[p.name.toLowerCase()] || {};
    const card = (ic, title, text, ...kids) => h('section.hubcard', null, h('div.hubhead', null, h('span.ptileic', null, icon(ic)), h('div', null, h('b', { text: title }), h('small', { text })), ), ...kids);
    const skinRow = (url, label, onEdit) => h('div.hubskin', null, url ? h('img.hubimg', { src: url, alt: '' }) : h('span.hubempty', null, icon('pen')), h('button.btn', { text: url ? `${label} ändern` : `${label} malen`, on: { click: onEdit } }));
    const maps = (g) => {
      const list = e[g.k] || [];
      return h('div.hubmaps', null,
        ...list.map((m, i) => h('div.hubmap', null, thumb(g.k, m.d, p.color), h('small', { text: `Nr. ${m.n}` }),
          h('button.btn.round.hubdel', { 'aria-label': 'Karte löschen', title: 'Löschen', on: { click: async () => { if (await confirmSheet('Karte löschen?', `${g.title}, Nr. ${m.n} von ${p.name}`)) { delMap(p, g.k, i); render(); } } } }, icon('trash')))),
        list.length < MAXMAPS ? h('button.hubnew', { on: { click: () => newMap(g.k) } }, icon('plus'), h('span', { text: 'Neue Karte' })) : null);
    };
    fx.stage.replaceChildren(h('div.hubwrap', null,
      h('div.hshud', null, chip(p, h('small', { text: 'Skins und Karten' }))),
      card('wind', 'Windflug', 'Deine Spielfigur, die durch Stifte und Bücher fliegt.', skinRow(windSkin ? windSkin(p.name) : null, 'Flieger', async () => { if (skinEditor && await skinEditor(p)) render(); })),
      card('car', 'Papierrennen: Auto', 'Dein Auto von oben. Es fährt mit, wenn du dabei bist.', skinRow(e.car, 'Auto', () => editCar())),
      ...GAMESETS.map((g) => card(g.ic, g.k === 'race' ? 'Papierrennen: Strecken' : g.title, g.text, maps(g))),
      h('p.calm.hubnote', { text: 'Alles bleibt nur auf diesem Gerät gespeichert.' })));
  };
  async function editCar() {
    const { paintSheet } = await import('./gpaint.js');
    const r = await paintSheet({ title: `Auto für ${p.name}`, color: p.color, old: carSkin(p.name), min: 0.35, saveLabel: 'Auto sichern', removeLabel: 'Standard-Auto',
      text: 'Mal dein Auto von oben. Vorne ist rechts. Es muss mindestens bis zur gestrichelten Linie reichen.' });
    if (!r) return;
    const all = loadHub(), en = entry(all, p.name);
    if (r === 'remove') delete en.car; else en.car = r.url;
    if (saveHub(all)) { toast(r === 'remove' ? 'Auto entfernt' : 'Auto gesichert'); render(); }
  }
  async function newMap(game) {
    let data = null;
    if (game === 'race') data = await (await import('./p6a.js')).drawTrackSheet(fx, p, R, { okText: 'Speichern' });
    else if (game === 'golf') data = await (await import('./p4b.js')).drawCourseSheet(fx, p, 1, R, { okText: 'Speichern', hub: true });
    else data = await (await import('./p6c.js')).pathSheet(fx, p, R, { okText: 'Speichern' });
    if (fx.signal.aborted) return;
    if (data && addMap(p, game, data)) toast('Karte gespeichert');
    render();
  }
  render();
}
