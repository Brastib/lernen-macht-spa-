// Spielmodi für einen Kartenstapel: Zeit-Challenge, Paare finden, Boss-Runde.
// Wichtig: Spiele ändern den Wiederholungsplan NICHT (keine Stufen, keine Termine). Sie geben nur XP.
import { $, h, icon, toast, sheet } from './ui.js';
import { profile, newRun, hit, endRun, resultView, floatXp, setRecord, sound } from './game.js';
import { checkAnswer, choicesFor } from './cards.js';

let G = null;   // laufendes Spiel
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtS = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

export const MODES = [
  ['time', 'Zeit-Challenge', '60 Sekunden, 4 Antworten zur Auswahl. Falsch kostet 3 Sekunden.', 'bolt', 4],
  ['memory', 'Paare finden', 'Decke Wort und Übersetzung als Paar auf. So schnell wie möglich.', 'pairs', 3],
  ['boss', 'Boss-Runde', 'Deine schwersten Karten. Eintippen oder mit dem Pencil schreiben, 3 Leben.', 'trophy', 3],
];

export async function playMenu(deck, cards, onDone) {
  const P = await profile();
  const pick = await sheet('Spielen', (body, close) => {
    const l = h('div.modes');
    for (const [k, name, desc, ic, min] of MODES) {
      const rec = P.records[`${k}:${deck.id}`];
      const recText = rec == null ? '' : k === 'time' ? `Rekord: ${rec} Punkte` : k === 'memory' ? `Rekord: ${fmtS(rec)}` : `Besiegt: ${rec}×`;
      const ok = cards.length >= min;
      l.append(h('button.mode', { disabled: !ok, on: { click: () => close(k) } },
        h('span.modeic', null, icon(ic)),
        h('span.modetext', null, h('b', { text: name }), h('small', { text: ok ? desc : `Braucht mindestens ${min} Karten.` }), recText ? h('small.rec', { text: recText }) : null)));
    }
    body.append(h('p.dlgtext', { text: 'Spiele geben XP, ändern aber nicht deinen Wiederholungsplan. Dafür ist „Lernen“ da.' }), l);
  }, { wide: true });
  if (!pick) return;
  start(pick, deck, cards, onDone);
}

function open(kind, deck, cards, onDone) {
  G = { kind, deck, cards, onDone, run: newRun(), timers: [] };
  $('study').hidden = false;
  $('study').classList.add('gamemode');
  document.body.classList.add('studying');
  $('studyCard').textContent = ''; $('studyActions').textContent = '';
  $('studyProg').style.setProperty('--p', '0');
}
function later(fn, ms) { const t = setTimeout(fn, ms); G.timers.push(t); return t; }
function closeGame() {
  if (!G) return;
  G.timers.forEach(clearTimeout); clearInterval(G.tick);
  if (G.run && !G.ended && (G.run.right || G.run.wrong)) endRun(G.run, { bonus: 0 }).catch(() => {});
  const cb = G.onDone;
  G = null;
  $('study').hidden = true;
  $('study').classList.remove('gamemode');
  document.body.classList.remove('studying');
  if (cb) cb();
}
$('studyClose').addEventListener('click', () => { if (G) closeGame(); });
document.addEventListener('keydown', (e) => {
  if (!G || $('study').hidden || document.querySelector('.dlgscrim')) return;
  if (e.key === 'Escape') closeGame();
  else if (G.kind === 'time' && /^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('#studyActions .choice')[+e.key - 1]; if (b) b.click(); }
});
function hud(extra = []) {
  const el = $('studyHud'); el.textContent = '';
  el.append(...extra, h('span.hudxp', { text: `${G.run.xp} XP` }));
  if (G.run.combo >= 2) el.append(h('span.combo' + (G.run.combo >= 5 ? '.hot' : ''), { text: `${G.run.combo}er Combo` }));
}
async function over(title, lines, { extra = {}, record, bonus = 20 } = {}) {
  G.ended = true;
  clearInterval(G.tick);
  const R = await endRun(G.run, { bonus, extra });
  const box = $('studyCard'), act = $('studyActions');
  box.textContent = ''; act.textContent = '';
  box.append(resultView(R, { title, lines, record }));
  const { kind, deck, cards, onDone } = G;
  act.append(h('button.btn.big', { text: 'Fertig', on: { click: closeGame } }),
    h('button.btn.big.primary', { text: 'Nochmal', on: { click: () => { G.onDone = null; closeGame(); start(kind, deck, cards, onDone); } } }));
}

function start(kind, deck, cards, onDone) {
  open(kind, deck, cards, onDone);
  if (kind === 'time') return timeGame();
  if (kind === 'memory') return memoryGame();
  return bossGame();
}

// ---------- Zeit-Challenge ----------
function timeGame() {
  const LEN = 60000;
  G.score = 0; G.end = Date.now() + LEN; G.order = shuffle(G.cards.slice()); G.pos = 0;
  $('studyInfo').textContent = 'Zeit-Challenge';
  const clock = h('span.clock');
  const tick = () => {
    const left = Math.max(0, G.end - Date.now());
    clock.textContent = Math.ceil(left / 1000) + ' s';
    clock.classList.toggle('low', left < 10000);
    $('studyProg').style.setProperty('--p', String(1 - left / LEN));
    if (left <= 0 && !G.ended) finishTime();
  };
  G.tick = setInterval(tick, 100);
  G.clock = clock;
  tick();
  nextQ();
}
function nextQ() {
  if (!G || G.ended) return;
  if (G.pos >= G.order.length) { G.order = shuffle(G.cards.slice()); G.pos = 0; }
  const c = G.order[G.pos++];
  const it = { c, rev: Math.random() < 0.5 };
  const q = it.rev ? c.back : c.front, a = it.rev ? c.front : c.back;
  const box = $('studyCard'), act = $('studyActions');
  box.textContent = ''; act.textContent = '';
  box.append(h('div.flash.quick', null, h('div.fside.q', null, h('small', { text: `Punkte ${G.score}` }), h('p', { text: q }))));
  const grid = h('div.choices');
  for (const o of choicesFor(it, G.cards)) {
    grid.append(h('button.choice', { text: o, on: { click: (e) => {
      if (grid.dataset.done) return;
      grid.dataset.done = '1';
      const ok = o === a;
      e.currentTarget.classList.add(ok ? 'right' : 'wrong');
      if (!ok) grid.querySelectorAll('.choice').forEach((b) => { if (b.textContent === a) b.classList.add('right'); });
      const gain = hit(G.run, ok, { base: 6 });
      if (ok) { G.score++; floatXp(box, '+' + gain); } else { G.end -= 3000; floatXp(G.clock, '−3 s', '.bad'); }
      hud([G.clock]);
      later(nextQ, ok ? 220 : 700);
    } } }));
  }
  act.append(grid);
  hud([G.clock]);
}
async function finishTime() {
  const key = `time:${G.deck.id}`;
  const r = G.score ? await setRecord(key, G.score) : { record: false, old: (await profile()).records[key] };
  over(G.score ? `${G.score} Punkte` : 'Zeit vorbei', [`${G.run.right} richtig, ${G.run.wrong} falsch · beste Combo ${G.run.best}`],
    { extra: { time20: G.score >= 20 }, record: r.record && r.old != null ? `Neuer Rekord! Vorher ${r.old}` : r.record ? 'Erster Rekord gesetzt' : r.old != null ? `Rekord: ${r.old}` : '' });
}

// ---------- Paare finden ----------
function memoryGame() {
  const n = Math.min(6, G.cards.length);
  const pick = shuffle(G.cards.slice()).slice(0, n);
  const tiles = shuffle(pick.flatMap((c) => [{ id: c.id, text: c.front, side: 'f' }, { id: c.id, text: c.back, side: 'b' }]));
  G.pairs = n; G.found = 0; G.moves = 0; G.t0 = 0; G.open = [];
  $('studyInfo').textContent = 'Paare finden';
  const clock = h('span.clock', { text: '0,0 s' });
  G.clock = clock;
  G.tick = setInterval(() => { if (G && G.t0) clock.textContent = fmtS(Date.now() - G.t0); }, 100);
  const board = h('div.memory' + (n > 4 ? '.big' : ''));
  for (const t of tiles) {
    const el = h('button.tile.' + t.side, { 'aria-label': 'Karte' }, h('span.back', { text: '' }), h('span.face', { text: t.text }));
    el.addEventListener('click', () => flip(el, t));
    board.append(el);
  }
  $('studyCard').append(board);
  $('studyActions').append(h('p.calm', { text: 'Tipp zwei Karten an: Wort und Übersetzung gehören zusammen.' }));
  hud([clock]);
}
function flip(el, t) {
  if (!G || G.ended || el.classList.contains('up') || G.open.length >= 2) return;
  if (!G.t0) G.t0 = Date.now();
  el.classList.add('up');
  G.open.push([el, t]);
  if (G.open.length < 2) return;
  G.moves++;
  const [[e1, t1], [e2, t2]] = G.open;
  if (t1.id === t2.id && t1.side !== t2.side) {
    const gain = hit(G.run, true, { base: 8 });
    floatXp(e2, '+' + gain);
    later(() => { e1.classList.add('done'); e2.classList.add('done'); G.open = []; G.found++; hud([G.clock]);
      $('studyProg').style.setProperty('--p', String(G.found / G.pairs));
      if (G.found === G.pairs) finishMemory(); }, 260);
  } else {
    hit(G.run, false);
    later(() => { e1.classList.remove('up'); e2.classList.remove('up'); G.open = []; hud([G.clock]); }, 850);
  }
}
async function finishMemory() {
  const ms = Date.now() - G.t0;
  clearInterval(G.tick);
  sound('win');
  const r = await setRecord(`memory:${G.deck.id}`, ms, (a, b) => a < b);
  over(`Alle Paare in ${fmtS(ms)}`, [`${G.moves} Züge für ${G.pairs} Paare`],
    { extra: { memory: G.pairs >= 6 && ms < 45000 }, record: r.record && r.old != null ? `Neuer Rekord! Vorher ${fmtS(r.old)}` : r.record ? 'Erster Rekord gesetzt' : `Rekord: ${fmtS(r.old)}` });
}

// ---------- Boss-Runde ----------
function bossGame() {
  // Schwerste Karten: oft falsch, niedrige Stufe
  const score = (c) => (c.wrong || 0) * 2 - (c.right || 0) + (6 - (c.box || 0));
  const hard = G.cards.slice().sort((a, b) => score(b) - score(a)).slice(0, Math.min(10, G.cards.length));
  G.queue = shuffle(hard.map((c) => ({ c, rev: Math.random() < 0.5 })));
  G.hp = G.queue.length; G.maxHp = G.hp; G.lives = 3;
  $('studyInfo').textContent = 'Boss-Runde';
  bossQ();
}
function bossHud() {
  const lives = h('span.lives', null, ...[0, 1, 2].map((i) => h('i' + (i < G.lives ? '.on' : ''), null, icon('heart'))));
  hud([lives]);
}
function bossQ() {
  if (!G || G.ended) return;
  const box = $('studyCard'), act = $('studyActions');
  box.textContent = ''; act.textContent = '';
  if (G.hp <= 0) return bossWin();
  if (G.lives <= 0) return bossLose();
  if (!G.queue.length) return bossLose();
  const it = G.queue.shift();
  const q = it.rev ? it.c.back : it.c.front, a = it.rev ? it.c.front : it.c.back;
  const boss = h('div.boss', null,
    h('div.bosshead', null, icon('trophy'), h('b', { text: 'Boss' }), h('small', { text: `${G.hp} / ${G.maxHp}` })),
    h('div.bosshp', null, h('i', { style: { '--p': String(G.hp / G.maxHp) } })));
  box.append(boss, h('div.flash', null, h('div.fside.q', null, h('small', { text: 'Übersetze' }), h('p', { text: q })), h('div.fside.a', { id: 'bossAns' })));
  const inp = h('input.field.answer', { type: 'text', placeholder: 'Antwort eintippen oder schreiben', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const go = () => {
    if (inp.disabled) return;
    const g = inp.value.trim();
    if (!g) { inp.focus(); return; }
    inp.disabled = true;
    const res = checkAnswer(g, a);
    const ok = res !== 'wrong';
    const ans = $('bossAns');
    ans.classList.add(ok ? 'right' : 'wrong');
    ans.append(h('div.verdict', { text: ok ? (res === 'close' ? 'Fast richtig, zählt' : 'Treffer') : `Daneben: „${g}“` }), h('small', { text: 'Lösung' }), h('p', { text: a }));
    hit(G.run, ok, { base: 15 });
    if (ok) { G.hp--; boss.classList.add('hurt'); floatXp(boss, '−1'); boss.querySelector('.bosshp i').style.setProperty('--p', String(G.hp / G.maxHp)); boss.querySelector('small').textContent = `${G.hp} / ${G.maxHp}`; }
    else { G.lives--; G.queue.push(it); box.querySelector('.flash').classList.add('lost'); }
    $('studyProg').style.setProperty('--p', String(1 - G.hp / G.maxHp));
    bossHud();
    act.textContent = '';
    if (ok) later(bossQ, 900);
    else act.append(h('button.btn.big.primary', { text: 'Weiter', on: { click: bossQ } }));
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  act.append(inp, h('button.btn.big.primary', { text: 'Angreifen', on: { click: go } }));
  bossHud();
  setTimeout(() => inp.focus(), 60);
}
async function bossWin() {
  sound('win');
  const k = `boss:${G.deck.id}`;
  const P = await profile();
  await setRecord(k, (P.records[k] || 0) + 1, () => true);
  over('Boss besiegt', [`Mit ${G.lives} von 3 Leben übrig · beste Combo ${G.run.best}`], { extra: { boss: true }, bonus: 100 });
}
function bossLose() {
  over('Diesmal nicht', [`Der Boss hat noch ${G.hp} von ${G.maxHp} Leben. Lern die Karten nochmal normal und versuch es wieder.`], { bonus: 10 });
}
