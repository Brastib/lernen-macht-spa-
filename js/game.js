// Spiel-Ebene für die Lernkarten: Punkte (XP), Level, Combo, Tages-Serie, Tagesziel, Abzeichen, Töne.
// Ändert nichts am Wiederholungsplan, das macht weiter cards.js.
import * as db from './db.js';
import { h, icon, toast } from './ui.js';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const prevDay = (k) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1).getTime()); };

// ---------- Spielstand ----------
const FRESH = { id: 'game', xp: 0, right: 0, answered: 0, bestCombo: 0, streak: 0, bestStreak: 0, lastDay: '', days: {}, goal: 20, sound: true, badges: {}, records: {} };
let P = null;
export async function profile() {
  if (P) return P;
  try { P = (await db.listMeta()).find((m) => m.id === 'game') || null; } catch (e) { P = null; }
  P = { ...FRESH, ...(P || {}) };
  P.days = P.days || {}; P.badges = P.badges || {}; P.records = P.records || {};
  refreshStreak();
  return P;
}
async function save() { if (P) await db.putItems('meta', P); }
// Serie bricht, wenn gestern und heute nichts gelernt wurde
function refreshStreak() {
  const t = dayKey(), y = prevDay(t);
  if (P.lastDay !== t && P.lastDay !== y) P.streak = 0;
}
export const today = () => (P && P.days[dayKey()]) || 0;

// Level: Level n braucht insgesamt 50·n·(n+1) XP (100, 300, 600, 1000 …)
export function levelInfo(xp) {
  let n = 1;
  while (50 * n * (n + 1) <= xp) n++;
  const lo = 50 * (n - 1) * n, hi = 50 * n * (n + 1);
  return { level: n, into: xp - lo, need: hi - lo, frac: (xp - lo) / (hi - lo) };
}
const TITLES = ['Einsteiger', 'Lernender', 'Fortgeschritten', 'Routiniert', 'Könner', 'Experte', 'Profi', 'Meister', 'Großmeister', 'Legende'];
export const titleOf = (lvl) => TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 2))];

// ---------- Abzeichen ----------
export const BADGES = [
  ['first', 'Erste Runde', 'Eine Lernrunde beendet'],
  ['right100', 'Hundert', '100 Karten richtig'],
  ['right500', 'Fünfhundert', '500 Karten richtig'],
  ['right2000', 'Zweitausend', '2000 Karten richtig'],
  ['combo10', 'Lauf', '10 richtige am Stück'],
  ['combo25', 'Unaufhaltsam', '25 richtige am Stück'],
  ['streak3', 'Dranbleiben', '3 Tage in Folge gelernt'],
  ['streak7', 'Eine Woche', '7 Tage in Folge gelernt'],
  ['streak30', 'Ein Monat', '30 Tage in Folge gelernt'],
  ['goal', 'Ziel erreicht', 'Tagesziel geschafft'],
  ['perfect', 'Fehlerlos', 'Runde mit mindestens 10 Karten ohne Fehler'],
  ['level5', 'Level 5', 'Level 5 erreicht'],
  ['level10', 'Level 10', 'Level 10 erreicht'],
  ['time20', 'Schnell', 'Zeit-Challenge: 20 Punkte'],
  ['memory', 'Gutes Gedächtnis', 'Paare finden in unter 45 Sekunden'],
  ['boss', 'Boss besiegt', 'Eine Boss-Runde gewonnen'],
];
function unlock(id, out) {
  if (P.badges[id]) return;
  P.badges[id] = Date.now();
  const b = BADGES.find((x) => x[0] === id);
  if (b) out.push(b);
}
function checkBadges(out, extra = {}) {
  const lvl = levelInfo(P.xp).level;
  if (P.right >= 100) unlock('right100', out);
  if (P.right >= 500) unlock('right500', out);
  if (P.right >= 2000) unlock('right2000', out);
  if (P.bestCombo >= 10) unlock('combo10', out);
  if (P.bestCombo >= 25) unlock('combo25', out);
  if (P.streak >= 3) unlock('streak3', out);
  if (P.streak >= 7) unlock('streak7', out);
  if (P.streak >= 30) unlock('streak30', out);
  if (lvl >= 5) unlock('level5', out);
  if (lvl >= 10) unlock('level10', out);
  for (const k of Object.keys(extra)) if (extra[k]) unlock(k, out);
}

// ---------- Eine Runde ----------
// Ablauf: const R = newRun(); hit(R, …) je Antwort; await endRun(R, {...}) am Ende.
export function newRun() { return { xp: 0, combo: 0, best: 0, right: 0, wrong: 0, levelBefore: P ? levelInfo(P.xp).level : 1, xpBefore: P ? P.xp : 0, newBadges: [] }; }
export const multOf = (combo) => Math.min(3, 1 + Math.floor(combo / 5) * 0.5);
// Antwort werten. Gibt die verdienten XP zurück (0 bei falsch)
export function hit(R, ok, { base = 10 } = {}) {
  if (!P) return 0;
  P.answered++;
  const k = dayKey();
  if (ok) {
    R.combo++; R.right++;
    R.best = Math.max(R.best, R.combo);
    const gain = Math.round(base * multOf(R.combo - 1));
    R.xp += gain; P.xp += gain; P.right++;
    P.bestCombo = Math.max(P.bestCombo, R.combo);
    const before = P.days[k] || 0;
    P.days[k] = before + 1;
    // Serie zählt, sobald heute die erste Karte richtig ist
    if (P.lastDay !== k) { P.streak = P.lastDay === prevDay(k) ? P.streak + 1 : 1; P.lastDay = k; P.bestStreak = Math.max(P.bestStreak, P.streak); }
    if (before < P.goal && P.days[k] >= P.goal) { P.xp += 50; R.xp += 50; unlock('goal', R.newBadges); R.goalNow = true; }
    sound(R.combo > 1 && R.combo % 5 === 0 ? 'combo' : 'right');
    return gain;
  }
  R.combo = 0; R.wrong++;
  sound('wrong');
  return 0;
}
export async function endRun(R, { bonus = 20, extra = {} } = {}) {
  if (!P) await profile();
  R.xp += bonus; P.xp += bonus;
  unlock('first', R.newBadges);
  checkBadges(R.newBadges, extra);
  // ältere Tage aufräumen (nur 120 Tage merken)
  const keys = Object.keys(P.days).sort();
  while (keys.length > 120) delete P.days[keys.shift()];
  await save();
  R.levelAfter = levelInfo(P.xp).level;
  if (R.levelAfter > R.levelBefore) setTimeout(() => sound('level'), 400);
  return R;
}
export async function setRecord(key, value, better = (a, b) => a > b) {
  await profile();
  const old = P.records[key];
  if (old == null || better(value, old)) { P.records[key] = value; await save(); return { record: true, old }; }
  return { record: false, old };
}
export async function setGoal(n) { await profile(); P.goal = n; await save(); }
export async function setSound(on) { await profile(); P.sound = on; await save(); }

// ---------- Töne (selbst erzeugt, keine Dateien) ----------
let AC = null;
function sound(kind) {
  if (!P || !P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const notes = { right: [[660, 0, 0.09], [880, 0.07, 0.12]], combo: [[660, 0, 0.08], [880, 0.06, 0.08], [1320, 0.12, 0.18]],
      wrong: [[220, 0, 0.16]], level: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]], win: [[784, 0, 0.12], [1047, 0.12, 0.3]] }[kind] || [];
    const t0 = AC.currentTime + 0.01;
    for (const [f, at, dur] of notes) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'wrong' ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(kind === 'wrong' ? 0.12 : 0.08, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(AC.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    }
  } catch (e) { /* ohne Ton geht es auch */ }
  try { if (navigator.vibrate) navigator.vibrate(kind === 'wrong' ? 30 : 8); } catch (e) { /* iPad kann das nicht */ }
}
export { sound };

// ---------- Anzeige-Bausteine ----------
const FLAME = '<svg viewBox="0 0 24 24" class="ic flame"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.3 1.6 1.1 2.6 2.3 3C11 9 11 6 12 3z"/></svg>';
export function ring(frac, label, sub) {
  const r = 22, c = 2 * Math.PI * r;
  const el = h('div.goalring');
  el.innerHTML = `<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" class="track"/><circle cx="28" cy="28" r="${r}" class="fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, frac))}"/></svg>`;
  el.append(h('span.goalnum', { text: label }));
  if (sub) el.title = sub;
  return el;
}
// Kompakte Spieler-Karte (Bibliothek, Stapel)
export async function playerCard({ onOpen } = {}) {
  await profile();
  const L = levelInfo(P.xp);
  const t = today();
  const card = h('button.player', { on: { click: () => (onOpen ? onOpen() : profileSheet()) } },
    ring(t / P.goal, `${Math.min(t, 999)}`, 'Tagesziel'),
    h('span.pmain', null,
      h('span.ptop', null, h('b', { text: `Level ${L.level}` }), h('small', { text: titleOf(L.level) })),
      h('span.xpbar', null, h('i', { style: { '--p': String(L.frac) } })),
      h('small.pxp', { text: `${L.into} / ${L.need} XP · Ziel heute ${Math.min(t, P.goal)}/${P.goal}` })),
    h('span.pstreak' + (P.streak ? '.on' : ''), { title: 'Tage in Folge' }));
  card.lastChild.innerHTML = FLAME + `<b>${P.streak}</b>`;
  return card;
}
// Profil mit Abzeichen und Einstellungen
export async function profileSheet(after) {
  await profile();
  const { sheet } = await import('./ui.js');
  const L = levelInfo(P.xp);
  await sheet('Dein Fortschritt', (body, close) => {
    const stats = h('div.pstats', null,
      ...[[`${L.level}`, 'Level'], [String(P.xp), 'XP gesamt'], [String(P.streak), 'Tage in Folge'], [String(P.bestStreak), 'beste Serie'], [String(P.right), 'richtig gesamt'], [String(P.bestCombo), 'beste Combo']]
        .map(([v, l]) => h('div.stat', null, h('b', { text: v }), h('small', { text: l }))));
    const grid = h('div.badges');
    for (const [id, name, desc] of BADGES) {
      const got = P.badges[id];
      grid.append(h('div.badge' + (got ? '.got' : ''), { title: desc }, h('span.bico', null, icon(got ? 'select' : 'lock')), h('b', { text: name }), h('small', { text: desc })));
    }
    const goalSel = h('select.field', { id: 'goalSel', on: { change: async (e) => { await setGoal(+e.target.value); toast('Tagesziel: ' + e.target.value + ' Karten'); } } },
      ...[10, 20, 30, 50, 100].map((n) => h('option', { value: String(n), text: `${n} Karten am Tag` })));
    goalSel.value = String(P.goal);
    const snd = h('input', { type: 'checkbox', id: 'sndChk', on: { change: async (e) => { await setSound(e.target.checked); if (e.target.checked) sound('right'); } } });
    snd.checked = !!P.sound;
    body.append(stats,
      h('h3.dlgsub', { text: `Abzeichen (${Object.keys(P.badges).length}/${BADGES.length})` }), grid,
      h('div.fieldgrid', null,
        h('div', null, h('label.fieldlabel', { for: 'goalSel', text: 'Tagesziel' }), goalSel),
        h('div', null, h('label.fieldlabel', { text: 'Töne' }), h('label.checkrow.slim', { for: 'sndChk' }, snd, h('span', null, h('b', { text: 'Töne an' }))))),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
  }, { wide: true });
  if (after) after();
}

// Ergebnis einer Runde (gemeinsam für Lernen und Spiele)
export function resultView(R, { title, lines = [], record } = {}) {
  const L = levelInfo(P.xp);
  const prevFrac = levelInfo(R.xpBefore || 0);
  const wrap = h('div.studydone.gameover', null,
    h('div.xpburst', null, h('b', { text: `+${R.xp}` }), h('small', { text: 'XP' })),
    h('h2', { text: title || 'Runde geschafft' }),
    ...lines.map((l) => h('p', { text: l })),
    record ? h('p.record', { text: record }) : null,
    h('div.lvlrow', null,
      h('span', { text: `Level ${L.level}` }),
      h('span.xpbar.big', null, h('i', { style: { '--p': String(R.levelAfter > R.levelBefore ? 0 : prevFrac.frac) } })),
      h('span', { text: `${L.into}/${L.need}` })),
    R.levelAfter > R.levelBefore ? h('p.levelup', { text: `Level ${R.levelAfter} erreicht · ${titleOf(R.levelAfter)}` }) : null,
    R.goalNow ? h('p.goalnow', { text: `Tagesziel geschafft · +50 XP` }) : null,
    R.newBadges.length ? h('div.newbadges', null, ...R.newBadges.map(([, n, d]) => h('div.badge.got.pop', { title: d }, h('span.bico', null, icon('select')), h('b', { text: n }), h('small', { text: d })))) : null);
  // Balken danach auffüllen (Animation)
  requestAnimationFrame(() => setTimeout(() => { const i = wrap.querySelector('.lvlrow .xpbar i'); if (i) i.style.setProperty('--p', String(L.frac)); }, 120));
  return wrap;
}

// Kleine fliegende „+12“-Anzeige
export function floatXp(anchor, text, cls = '') {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const f = h('div.floatxp' + cls, { text });
  f.style.left = r.left + r.width / 2 + 'px';
  f.style.top = r.top + 20 + 'px';
  document.body.append(f);
  setTimeout(() => f.remove(), 900);
}
