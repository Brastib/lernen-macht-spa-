// Spielerprofile: feste Spieler, die gespeichert bleiben. Jedes Spiel und das Turnier wählen daraus aus.
// Gemeinsame API für alle Spiele (auch Papierpanzer):
//   listProfiles(), getProfile(id), findProfile(name)
//   pickPlayers({ title, min, max, key })  -> Promise<[{id, name, color, av}] | null>
//   recordDuel(game, A, B, res), recordCpu(game, p, res, pIsB), recordScore(game, p, score, low)
//   statsOf(id), totals(id)
//   profileData(id, ns, def) / setProfileData(id, ns, data)  -> eigener Speicher pro Profil und Spiel (z. B. Garage)
// Gäste ({ guest: true, id: null }) und der Computer werden nie gespeichert.
import { h, icon, sheet, toast, confirmSheet } from './ui.js';

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Kein Platz mehr zum Sichern.'); return false; } },
};
export const PCOLORS = ['#4f7cff', '#ff6b5a', '#2fbf71', '#f2b632', '#a46bff', '#ff7ac8', '#21b8c9', '#8a8f98', '#e07a2f', '#3a9d8f', '#c0476e', '#5b6bd6'];
export const AVATARS = ['🦊', '🐼', '🐯', '🦉', '🐢', '🐙', '🦄', '🐸', '🐧', '🦁', '🐺', '🐲', '🚀', '⚡', '⭐', '🔥', '🎸', '⚽', '🎮', '👑'];
const MAX = 24;
const KEY = 'gProfiles', SKEY = 'gProfStats', DKEY = 'gProfData';
const NAMED = ['gSkins', 'gHub', 'gFighters'];   // Speicher, die nach Namen (klein geschrieben) sortiert sind
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Profile ----------
export function listProfiles() {
  let list = store.get(KEY, null);
  if (!Array.isArray(list)) list = migrate();
  return list;
}
// Einmalig: alte Spielerliste (gPlayers) und Bestenliste (gStats) übernehmen
function migrate() {
  const old = store.get('gPlayers', []) || [];
  const gst = store.get('gStats', {}) || {};
  const list = [], stats = store.get(SKEY, {});
  for (const p of old) {
    if (!p || !p.name || list.some((q) => q.name.toLowerCase() === p.name.toLowerCase())) continue;
    const id = uid() + list.length;
    list.push({ id, name: p.name, color: p.color || PCOLORS[list.length % PCOLORS.length], av: '', created: Date.now() });
    const s = gst[p.name];
    if (s && (s.w || s.d || s.l)) stats[id] = { games: { alt: { w: s.w || 0, d: s.d || 0, l: s.l || 0 } }, cpu: {}, best: {}, last: 0 };
  }
  store.set(KEY, list);
  store.set(SKEY, stats);
  return list;
}
export const getProfile = (id) => listProfiles().find((p) => p.id === id) || null;
export const findProfile = (name) => (name ? listProfiles().find((p) => p.name.toLowerCase() === String(name).toLowerCase()) : null) || null;
const pub = (p) => ({ id: p.id, name: p.name, color: p.color, av: p.av || '' });

function nameProblem(name, id) {
  if (!name) return 'Bitte einen Namen eingeben.';
  if (/^(computer|gast( \d+)?)$/i.test(name)) return `„${name}“ ist schon vergeben.`;
  if (listProfiles().some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return `„${name}“ gibt es schon.`;
  return '';
}
function moveNamed(from, to) {   // Skins, Karten und Kämpfer beim Umbenennen mitnehmen
  const a = from.toLowerCase(), b = to.toLowerCase();
  if (a === b) return;
  for (const k of NAMED) {
    const all = store.get(k, null);
    if (!all || typeof all !== 'object' || !(a in all)) continue;
    all[b] = all[a]; delete all[a];
    store.set(k, all);
  }
  const t = store.get('gTour', null);   // laufendes Turnier
  if (t && Array.isArray(t.players)) { for (const p of t.players) if (p.name === from) p.name = to; store.set('gTour', t); }
}
function saveProfile(p) {
  const list = listProfiles();
  const i = list.findIndex((q) => q.id === p.id);
  if (i >= 0) { if (list[i].name !== p.name) moveNamed(list[i].name, p.name); list[i] = { ...list[i], ...p }; }
  else { if (list.length >= MAX) { toast(`Höchstens ${MAX} Profile.`); return null; } list.push({ ...p, id: uid(), created: Date.now() }); }
  if (!store.set(KEY, list)) return null;
  return i >= 0 ? list[i] : list[list.length - 1];
}
function deleteProfile(id) {
  const p = getProfile(id);
  if (!p) return;
  store.set(KEY, listProfiles().filter((q) => q.id !== id));
  const st = store.get(SKEY, {}); delete st[id]; store.set(SKEY, st);
  const dt = store.get(DKEY, {}); delete dt[id]; store.set(DKEY, dt);
  const n = p.name.toLowerCase();
  for (const k of NAMED) { const all = store.get(k, null); if (all && typeof all === 'object' && n in all) { delete all[n]; store.set(k, all); } }
}
const freeColor = () => { const used = listProfiles().map((p) => p.color); return PCOLORS.find((c) => !used.includes(c)) || PCOLORS[listProfiles().length % PCOLORS.length]; };

// ---------- Statistik ----------
const blank = () => ({ games: {}, cpu: {}, best: {}, last: 0 });
export function statsOf(id) { const s = store.get(SKEY, {})[id]; return s ? { ...blank(), ...s } : blank(); }
function editStats(id, fn) {
  if (!id || !getProfile(id)) return;
  const all = store.get(SKEY, {});
  const s = all[id] = { ...blank(), ...(all[id] || {}) };
  fn(s);
  s.last = Date.now();
  store.set(SKEY, all);
}
const bump = (map, game, f) => { const r = map[game] = map[game] || { w: 0, d: 0, l: 0 }; r[f]++; };
// Duell zwischen zwei Menschen. res.w: 0 = A gewinnt, 1 = B gewinnt, null = unentschieden.
export function recordDuel(game, A, B, res) {
  if (!res || !A || !B) return;
  const idOf = (p) => (p.guest ? null : p.id || (findProfile(p.name) || {}).id);
  const a = idOf(A), b = idOf(B);
  const fa = res.w == null ? 'd' : res.w ? 'l' : 'w', fb = res.w == null ? 'd' : res.w ? 'w' : 'l';
  editStats(a, (s) => bump(s.games, game, fa));
  editStats(b, (s) => bump(s.games, game, fb));
}
// Gegen den Computer. pIsB = der Mensch war Spieler B.
export function recordCpu(game, p, res, pIsB = false) {
  if (!res || !p || p.guest) return;
  const id = p.id || (findProfile(p.name) || {}).id;
  const f = res.w == null ? 'd' : (res.w === 1) === pIsB ? 'w' : 'l';
  editStats(id, (s) => bump(s.cpu, game, f));
}
// Rekord allein. Gibt den alten und neuen Bestwert dieses Profils zurück.
export function recordScore(game, p, score, low = false) {
  if (!p || p.guest || score == null) return null;
  const id = p.id || (findProfile(p.name) || {}).id;
  if (!id) return null;
  const old = statsOf(id).best[game];
  const rec = low ? score > 0 && (old == null || score < old) : old == null || score > old;
  editStats(id, (s) => { s.games = s.games || {}; if (rec) s.best[game] = score; s.plays = (s.plays || 0) + 1; });
  return { old: old == null ? null : old, rec };
}
export function totals(id) {
  const s = statsOf(id), t = { w: 0, d: 0, l: 0, cw: 0, cd: 0, cl: 0 };
  for (const r of Object.values(s.games)) { t.w += r.w; t.d += r.d; t.l += r.l; }
  for (const r of Object.values(s.cpu)) { t.cw += r.w; t.cd += r.d; t.cl += r.l; }
  t.n = t.w + t.d + t.l;
  return t;
}
export function clearStats() { store.set(SKEY, {}); }

// ---------- eigener Speicher pro Profil (für einzelne Spiele) ----------
export function profileData(id, ns, def = null) { const d = (store.get(DKEY, {})[id] || {})[ns]; return d === undefined ? def : d; }
export function setProfileData(id, ns, data) {
  if (!id || !getProfile(id)) return false;
  const all = store.get(DKEY, {});
  (all[id] = all[id] || {})[ns] = data;
  return store.set(DKEY, all);
}

// ---------- Anzeige ----------
export function avatar(p, cls = '') {
  const t = p.av || (p.name || '?').trim().slice(0, 1).toUpperCase();
  return h('span.pfav' + (cls ? '.' + cls : '') + (p.av ? '.emo' : ''), { style: { '--pc': p.color }, 'aria-hidden': 'true' }, h('b', { text: t }));
}
let GAMEINFO = { names: {}, fmt: {} };
// games.js meldet Namen, Icons und Rekord-Formate an (sonst gäbe es einen Import-Kreis)
export function registerGames(info) { GAMEINFO = info; }

// ---------- Profil anlegen / bearbeiten ----------
export function editProfile(p = null) {
  return sheet(p ? 'Profil bearbeiten' : 'Neues Profil', (body, close) => {
    const cur = { name: p ? p.name : '', color: p ? p.color : freeColor(), av: p ? p.av || '' : '' };
    const prev = h('div.pfprev');
    const input = h('input.field', { type: 'text', value: cur.name, placeholder: 'Name', maxlength: 18, autocomplete: 'off', on: { input: (e) => { cur.name = e.target.value; drawPrev(); } } });
    const sw = h('div.pfswatches'), avs = h('div.pfavs');
    const drawPrev = () => prev.replaceChildren(avatar({ ...cur, name: cur.name.trim() || '?' }, 'big'), h('b', { text: cur.name.trim() || 'Neuer Spieler' }));
    const draw = () => {
      drawPrev();
      sw.replaceChildren(...PCOLORS.map((c) => h('button.pfsw' + (c === cur.color ? '.on' : ''), { style: { '--pc': c }, 'aria-label': 'Farbe', on: { click: () => { cur.color = c; draw(); } } })));
      avs.replaceChildren(h('button.pfavopt' + (!cur.av ? '.on' : ''), { title: 'Anfangsbuchstabe', on: { click: () => { cur.av = ''; draw(); } } }, h('b', { text: (cur.name.trim() || 'A').slice(0, 1).toUpperCase() })),
        ...AVATARS.map((a) => h('button.pfavopt' + (a === cur.av ? '.on' : ''), { on: { click: () => { cur.av = a; draw(); } } }, h('span', { text: a }))));
    };
    const save = () => {
      const name = cur.name.trim().replace(/\s+/g, ' ');
      const bad = nameProblem(name, p && p.id);
      if (bad) { toast(bad); input.focus(); return; }
      const r = saveProfile({ ...(p || {}), name, color: cur.color, av: cur.av });
      if (r) close(r);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    body.append(prev, h('p.glabel', { text: 'Name' }), input, h('p.glabel', { text: 'Farbe' }), sw, h('p.glabel', { text: 'Bild' }), avs,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), h('button.btn.primary', { text: p ? 'Sichern' : 'Profil anlegen', on: { click: save } })));
    draw();
  });
}

// ---------- Profil ansehen ----------
export function profileSheet(id, { onHub } = {}) {
  return sheet('Profil', (body, close) => {
    const draw = () => {
      const p = getProfile(id);
      if (!p) { close('deleted'); return; }
      const s = statsOf(id), t = totals(id);
      const quote = t.n ? Math.round((t.w / t.n) * 100) : null;
      const num = (n, l) => h('div.pfnum', null, h('b', { text: String(n) }), h('small', { text: l }));
      const keys = [...new Set([...Object.keys(s.games), ...Object.keys(s.cpu), ...Object.keys(s.best)])];
      const played = (k) => { const a = s.games[k] || {}, b = s.cpu[k] || {}; return (a.w || 0) + (a.d || 0) + (a.l || 0) + (b.w || 0) + (b.d || 0) + (b.l || 0); };
      keys.sort((a, b) => (a === 'alt') - (b === 'alt') || played(b) - played(a) || (GAMEINFO.names[a]?.name || a).localeCompare(GAMEINFO.names[b]?.name || b));
      const wdl = (r) => (r ? `${r.w} S · ${r.d} U · ${r.l} N` : '');
      const rows = keys.map((k) => {
        const g = GAMEINFO.names[k] || { name: k === 'alt' ? 'Frühere Spiele' : k, icon: 'game' };
        const bits = [];
        if (s.games[k]) bits.push(h('span', null, h('em', { text: 'Duell' }), wdl(s.games[k])));
        if (s.cpu[k]) bits.push(h('span', null, h('em', { text: 'Computer' }), wdl(s.cpu[k])));
        if (s.best[k] != null) bits.push(h('span', null, h('em', { text: 'Rekord' }), GAMEINFO.fmt[k] ? GAMEINFO.fmt[k](s.best[k]) : String(s.best[k])));
        return h('div.pfgrow', null, h('span.pfgic', null, icon(g.icon)), h('b.pfgname', { text: g.name }), h('div.pfgbits', null, ...bits));
      });
      body.replaceChildren(...[
        h('div.pfhead', null, avatar(p, 'big'), h('div.pfheadtx', null, h('b', { text: p.name }), h('small', { text: quote == null ? 'Noch keine Duelle gespielt' : `${quote} % der Duelle gewonnen` }))),
        h('div.pfnums', null, num(t.n, 'Duelle'), num(t.w, 'Siege'), num(t.d, 'Unent.'), num(t.l, 'Nied.')),
        t.cw + t.cd + t.cl ? h('p.pfcpu', { text: `Gegen den Computer: ${t.cw} ${t.cw === 1 ? 'Sieg' : 'Siege'}, ${t.cd} Unentschieden, ${t.cl} ${t.cl === 1 ? 'Niederlage' : 'Niederlagen'}` }) : null,
        h('p.glabel', { text: 'Pro Spiel' }),
        rows.length ? h('div.pfglist', null, ...rows) : h('p.calm', { text: 'Sobald dieses Profil spielt, stehen hier Siege und Rekorde.' }),
        h('div.dlgactions.pfacts', null,
          h('button.btn.danger', { text: 'Löschen', on: { click: async () => {
            if (await confirmSheet(`${p.name} löschen?`, 'Profil, Statistik, Skins und eigene Karten werden gelöscht.', 'Löschen')) { deleteProfile(id); close('deleted'); }
          } } }),
          onHub ? h('button.btn', { text: 'Skin-Hub', on: { click: () => { close('hub'); onHub(pub(p)); } } }) : null,
          h('button.btn.primary', { text: 'Bearbeiten', on: { click: async () => { const r = await editProfile(p); if (r) draw(); } } }))].filter(Boolean));
    };
    draw();
  }, { wide: true });
}

// ---------- Auswahl: Wer spielt mit? ----------
// Baut die Kachel-Auswahl. Auch im Turnier-Dialog eingebettet.
export function pickerGrid({ min = 2, max = 2, key = '', onChange, onPick } = {}) {
  const guests = [];
  const ids = () => [...listProfiles().map((p) => p.id), ...guests.map((g) => g.id)];
  let sel = (store.get('gPick_' + (key || max), []) || []).filter((id) => ids().includes(id)).slice(0, max);
  const el = h('div.pfpick');
  const all = () => [...listProfiles().map(pub), ...guests];
  const result = () => {
    const ps = all(), out = sel.map((id) => ps.find((p) => p.id === id)).filter(Boolean).map((p) => ({ ...p }));
    const used = [];   // gleiche Farben im selben Spiel vermeiden
    for (const p of out) { if (used.includes(p.color)) p.color = PCOLORS.find((c) => !used.includes(c)) || p.color; used.push(p.color); }
    return out.map((p) => (p.guest ? { name: p.name, color: p.color, av: '', guest: true, id: null } : p));
  };
  const toggle = (id) => {
    const k = sel.indexOf(id);
    if (k >= 0) sel.splice(k, 1);
    else { if (sel.length >= max) sel.shift(); sel.push(id); }
    if (max === 1 && sel.length === 1 && onPick) { remember(); onPick(result()); return; }
    draw();
  };
  const remember = () => store.set('gPick_' + (key || max), sel.filter((id) => !id.startsWith('guest')));
  const draw = () => {
    const ps = all();
    el.replaceChildren(...[...ps.map((p) => {
      const k = sel.indexOf(p.id);
      return h('button.pfpk' + (k >= 0 ? '.on' : '') + (p.guest ? '.guest' : ''), { style: { '--pc': p.color }, on: { click: () => toggle(p.id) } },
        avatar(p), h('b', { text: p.name }), max > 1 && k >= 0 ? h('span.pfno', { text: String(k + 1) }) : null);
    }),
    listProfiles().length < MAX ? h('button.pfpk.add', { on: { click: async () => { const r = await editProfile(); if (r) { if (sel.length >= max) sel.shift(); sel.push(r.id); if (max === 1 && onPick) { remember(); onPick(result()); return; } draw(); } } } }, h('span.pfav.plus', null, icon('plus')), h('b', { text: 'Neues Profil' })) : null,
    h('button.pfpk.add', { on: { click: () => { const n = guests.length + 1; const g = { id: 'guest' + n, name: n === 1 ? 'Gast' : `Gast ${n}`, color: '#8a8f98', guest: true }; guests.push(g); toggle(g.id); } } }, h('span.pfav.plus', null, icon('user')), h('b', { text: 'Gast' }))].filter(Boolean));
    if (onChange) onChange(sel.length);
  };
  draw();
  return { el, result, remember, count: () => sel.length };
}

// Fragt, wer spielt. min/max Spieler; key = eigener Merkplatz für die letzte Auswahl.
export function pickPlayers({ title = 'Wer spielt?', min = 2, max = 2, key = '', hint } = {}) {
  return sheet(title, (body, close) => {
    const go = h('button.btn.primary', { text: 'Los geht’s', on: { click: () => { if (grid.count() < min) return; grid.remember(); close(grid.result()); } } });
    const grid = pickerGrid({ min, max, key, onPick: (r) => close(r), onChange: (n) => { go.disabled = n < min; } });
    const txt = hint || (max === 1 ? 'Tippe an, wer spielt.' : min === max ? `Tippe ${min} Spieler an. Nummer 1 fängt an.` : `Tippe ${min} bis ${max} Spieler an.`);
    body.append(h('p.glabel', { text: txt }), grid.el, h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), max === 1 ? null : go));
  }, { wide: true });
}
