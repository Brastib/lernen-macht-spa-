// Lernkarten (z. B. Vokabeln) mit Wiederholungsplan nach dem Karteikasten-Prinzip.
// Jede Karte hat eine Stufe 0-6. Gewusst = eine Stufe hoch und später wieder dran,
// nicht gewusst = zurück auf Stufe 0 und in dieser Runde gleich nochmal.
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, confirmSheet, promptSheet, menu } from './ui.js';
import { editReminder } from './reminders.js';
import { profile, newRun, hit, endRun, resultView, floatXp, multOf, playerCard } from './game.js';
import { playMenu } from './play.js';

// ---------- Coins: für richtige Antworten, einlösbar für Joker ----------
export const JOKERS = { hint: 2, save: 5 };   // Preise
export async function getCoins() { const m = await db.getMeta('coins'); return (m && m.n) || 0; }
export async function addCoins(d) { const n = Math.max(0, (await getCoins()) + d); await db.putItems('meta', { id: 'coins', n }); return n; }
export const coinTag = (n, cls = '') => h('span.coins' + cls, null, h('i.coinic'), h('b', { text: String(n) }));
export function hintText(a) {
  const w = String(a).trim();
  return 'Tipp: ' + w.split(/\s+/).map((x) => x[0] + ' ' + '_ '.repeat(Math.max(0, x.length - 1)).trim()).join('   ') + `  (${w.replace(/\s/g, '').length} Zeichen)`;
}

export const INTERVALS = [0, 1, 2, 4, 8, 16, 32];   // Tage bis zur nächsten Wiederholung je Stufe
export const LANGS = {
  'en-GB': 'Englisch', 'fr-FR': 'Französisch', 'es-ES': 'Spanisch', 'it-IT': 'Italienisch',
  'la': 'Latein', 'de-DE': 'Deutsch', '': 'Keine Sprache',
};
const DAY = 86400000;
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const isDue = (c, now = Date.now()) => (c.due || 0) <= now;
export const dueCount = (cards) => { const n = Date.now(); return cards.filter((c) => isDue(c, n)).length; };

// ---------- Antwort prüfen (beim Eintippen) ----------
function norm(t) {
  return String(t).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[.,!?;:"'„“»«¿¡\-–]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(to|the|a|an|le|la|les|l|un|une|el|los|las|der|die|das|ein|eine) /, '');
}
function dist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// 'right' | 'close' (kleiner Tippfehler, zählt als gewusst) | 'wrong'
export function checkAnswer(given, expected) {
  const g = norm(given);
  if (!g) return 'wrong';
  const options = String(expected).split(/[,;/]| oder /).map(norm).filter(Boolean);
  options.push(norm(expected));
  if (options.includes(g)) return 'right';
  const strip = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (options.some((o) => strip(o) === strip(g) || (o.length > 3 && dist(o, g) <= (o.length > 7 ? 2 : 1)))) return 'close';
  return 'wrong';
}

// Liste aus Text lesen: eine Karte pro Zeile, getrennt durch Tab, ; , = , " - " oder " – "
export function parseList(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.split(/\t|;| = | - | – | — |=/);
    if (m.length < 2) continue;
    const front = m[0].trim(), back = m.slice(1).join(', ').trim();
    if (front && back) out.push({ front, back });
  }
  return out;
}

// ---------- Karten anlegen / bearbeiten ----------
export async function addCardsFlow(deck, after) {
  let added = 0;
  await sheet('Karten hinzufügen', (body, close) => {
    const lang = LANGS[deck.lang] || 'Vorderseite';
    const f = h('input.field', { type: 'text', id: 'cardFront', placeholder: deck.lang ? `Wort auf ${lang}` : 'Frage', autocomplete: 'off', autocapitalize: 'off' });
    const b = h('input.field', { type: 'text', id: 'cardBack', placeholder: deck.lang && deck.lang !== 'de-DE' ? 'Deutsch' : 'Antwort', autocomplete: 'off', autocapitalize: 'off' });
    const info = h('p.dlgtext', { text: 'Enter speichert und springt zur nächsten Karte.' });
    const save = async () => {
      const front = f.value.trim(), back = b.value.trim();
      if (!front) { f.focus(); return; }
      if (!back) { b.focus(); return; }
      await db.putItems('cards', { deckId: deck.id, front, back, box: 0, due: 0, right: 0, wrong: 0 });
      added++;
      info.textContent = `${plural(added, 'Karte', 'Karten')} gespeichert. Weiter mit der nächsten.`;
      f.value = ''; b.value = ''; f.focus();
    };
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (f.value.trim()) b.focus(); } });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    body.append(
      h('label.fieldlabel', { for: 'cardFront', text: deck.lang && deck.lang !== 'de-DE' ? lang : 'Vorderseite' }), f,
      h('label.fieldlabel', { for: 'cardBack', text: deck.lang && deck.lang !== 'de-DE' ? 'Deutsch' : 'Rückseite' }), b,
      info,
      h('div.dlgactions', null,
        h('button.btn', { text: 'Fertig', on: { click: () => close(true) } }),
        h('button.btn.primary', { text: 'Speichern', on: { click: save } })));
  });
  if (added) { toast(`${plural(added, 'Karte', 'Karten')} hinzugefügt`); after(); }
}

export async function importListFlow(deck, after) {
  const res = await sheet('Vokabelliste einfügen', (body, close) => {
    const ta = h('textarea.field.area', { id: 'cardList', rows: 9, placeholder: 'house - Haus\nto run - rennen, laufen\ngreen; grün', autocapitalize: 'off', spellcheck: false });
    const info = h('p.dlgtext', { text: 'Eine Vokabel pro Zeile. Trennen mit „ - “, „;“, „=“ oder Tab (z. B. aus einer Tabelle kopiert).' });
    ta.addEventListener('input', () => {
      const n = parseList(ta.value).length;
      info.textContent = n ? `${plural(n, 'Karte', 'Karten')} erkannt.` : 'Eine Vokabel pro Zeile. Trennen mit „ - “, „;“, „=“ oder Tab.';
    });
    body.append(h('label.fieldlabel', { for: 'cardList', text: 'Liste' }), ta, info,
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Hinzufügen', on: { click: () => close(parseList(ta.value)) } })));
    setTimeout(() => ta.focus(), 60);
  }, { wide: true });
  if (!res || !res.length) return;
  await db.putItems('cards', res.map((c) => ({ deckId: deck.id, ...c, box: 0, due: 0, right: 0, wrong: 0 })));
  toast(`${plural(res.length, 'Karte', 'Karten')} hinzugefügt`);
  after();
}

async function editCardFlow(card, after) {
  const res = await sheet('Karte bearbeiten', (body, close) => {
    const f = h('input.field', { type: 'text', id: 'ecFront', value: card.front, autocomplete: 'off', autocapitalize: 'off' });
    const b = h('input.field', { type: 'text', id: 'ecBack', value: card.back, autocomplete: 'off', autocapitalize: 'off' });
    body.append(
      h('label.fieldlabel', { for: 'ecFront', text: 'Vorderseite' }), f,
      h('label.fieldlabel', { for: 'ecBack', text: 'Rückseite' }), b,
      h('p.dlgtext', { text: `Stufe ${card.box || 0} von 6 · ${card.right || 0}× gewusst, ${card.wrong || 0}× nicht gewusst` }),
      h('div.dlgactions', null,
        h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Neu lernen', title: 'Zurück auf Stufe 0', on: { click: () => close('reset') } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => close({ front: f.value.trim(), back: b.value.trim() }) } })));
  });
  if (!res) return;
  if (res === 'delete') await db.deleteItems('cards', card.id);
  else if (res === 'reset') await db.putItems('cards', { ...card, box: 0, due: 0 });
  else if (res.front && res.back) await db.putItems('cards', { ...card, ...res });
  after();
}

// ---------- Ansicht eines Kartenstapels ----------
// ctx: { setHeader, btn, iconBtn, go, subject }
export async function renderDeck(deck, ctx) {
  const cards = (await db.listCards(deck.id)).sort((a, b) => a.created - b.created);
  const due = dueCount(cards);
  const again = () => renderDeck(deck, ctx);
  const more = ctx.iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
    { label: 'Umbenennen', icon: 'edit', onClick: async () => {
      const t = await promptSheet('Stapel umbenennen', { label: 'Titel', value: deck.title });
      if (t) { deck.title = t; await db.putItems('decks', deck); again(); }
    } },
    { label: 'Sprache (Vorlesen)', icon: 'speak', onClick: async () => {
      const l = await pickLang(deck.lang);
      if (l != null) { deck.lang = l; await db.putItems('decks', deck); again(); }
    } },
    { label: 'Liste einfügen', icon: 'import', onClick: () => importListFlow(deck, again) },
    { label: 'Ans Lernen erinnern …', icon: 'clock', onClick: async () => {
      const subjects = await db.listSubjects();
      const ex = (await db.listReminders()).find((r) => r.refId === deck.id && r.kind === 'vokabeln');
      await editReminder(ex || { text: 'Lernen: ' + deck.title, kind: 'vokabeln', refId: deck.id, subjectId: deck.subjectId, repeat: 'daily', time: '17:00' }, { subjects, saveFile: ctx.saveFile });
    } },
    { label: 'Alle neu lernen', icon: 'undo', onClick: async () => {
      if (await confirmSheet('Alle Karten neu lernen?', 'Alle Karten gehen zurück auf Stufe 0 und sind sofort wieder dran.', 'Zurücksetzen', false)) {
        await db.putItems('cards', cards.map((c) => ({ ...c, box: 0, due: 0 }))); again();
      }
    } },
    'sep',
    { label: 'Stapel löschen', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmSheet(`„${deck.title}“ löschen?`, `${plural(cards.length, 'Karte', 'Karten')} werden gelöscht. Das lässt sich nicht rückgängig machen.`)) {
        await db.deleteDeck(deck.id); toast('Gelöscht'); ctx.go({ view: 'subject', subject: ctx.subject });
      }
    } },
  ]));
  ctx.setHeader({
    back: { label: ctx.subject.name, go: () => ctx.go({ view: 'subject', subject: ctx.subject }) },
    eyebrow: `Lernkarten · ${ctx.subject.name}`,
    title: deck.title,
    meta: `${plural(cards.length, 'Karte', 'Karten')} · ${due} fällig`,
    actions: [more, ctx.btn('Karte', 'plus', () => addCardsFlow(deck, again)),
      ...(cards.length >= 3 ? [ctx.btn('Spielen', 'bolt', () => playMenu(deck, cards, again))] : []),
      ctx.btn('Lernen', 'cards', () => startStudy(deck, cards, again), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  if (!cards.length) {
    view.append(h('section.empty', null,
      h('div.emptycards', { 'aria-hidden': 'true' }, h('span'), h('span')),
      h('h2', { text: 'Noch keine Karten' }),
      h('p', { text: 'Tipp Vokabeln einzeln ein oder füge eine ganze Liste auf einmal ein, zum Beispiel aus dem Buch abgeschrieben.' }),
      h('div.emptyactions', null,
        ctx.btn('Liste einfügen', 'import', () => importListFlow(deck, again)),
        ctx.btn('Karte hinzufügen', 'plus', () => addCardsFlow(deck, again), '.primary'))));
    return;
  }
  // Stufen-Übersicht
  const boxes = INTERVALS.map(() => 0);
  for (const c of cards) boxes[Math.min(6, c.box || 0)]++;
  const bar = h('div.boxbar');
  boxes.forEach((n, i) => { if (n) bar.append(h('span', { style: { flexGrow: String(n), '--k': String(i / 6) }, title: `Stufe ${i}: ${n}` })); });
  const learned = boxes.slice(4).reduce((a, b) => a + b, 0);
  view.append(await playerCard({ onOpen: async () => { const { profileSheet } = await import('./game.js'); profileSheet(again); } }));
  view.append(h('section.deckstats', null,
    h('div.stat', null, h('b', { text: String(due) }), h('small', { text: 'heute fällig' })),
    h('div.stat', null, h('b', { text: String(cards.length - learned) }), h('small', { text: 'in Arbeit' })),
    h('div.stat', null, h('b', { text: String(learned) }), h('small', { text: 'sitzen (ab Stufe 4)' })),
    h('div.boxwrap', null, bar, h('div.boxlegend', null, h('span', { text: 'neu' }), h('span', { text: 'sicher' })))));
  const list = h('div.cardlist');
  for (const c of cards) {
    const next = isDue(c) ? 'jetzt' : nextLabel(c.due);
    list.append(h('button.cardrow', { on: { click: () => editCardFlow(c, again) } },
      h('span.cf', { text: c.front }), h('span.cb', { text: c.back }),
      h('span.cbox', { style: { '--k': String((c.box || 0) / 6) }, title: `Stufe ${c.box || 0}` }, String(c.box || 0)),
      h('small.cnext', { text: next })));
  }
  view.append(h('h2.section', { text: 'Karten' }), list);
}

function nextLabel(t) {
  const d = Math.round((startOfDay(t) - startOfDay()) / DAY);
  if (d <= 0) return 'heute';
  if (d === 1) return 'morgen';
  return `in ${d} Tagen`;
}

async function pickLang(cur) {
  return sheet('Sprache der Vorderseite', (body, close) => {
    const list = h('div.targets');
    for (const [k, v] of Object.entries(LANGS)) list.append(h('button.target' + (k === (cur || '') ? '.current' : ''), { on: { click: () => close(k) } }, h('span', { text: v })));
    body.append(h('p.dlgtext', { text: 'Damit liest das iPad die Wörter richtig vor.' }), list);
  });
}

export async function newDeckFlow(subject) {
  const guess = { englisch: 'en-GB', französisch: 'fr-FR', spanisch: 'es-ES', italienisch: 'it-IT', latein: 'la' }[subject.name.toLowerCase()] ?? '';
  const t = await promptSheet('Neuer Kartenstapel', { label: 'Titel', placeholder: 'z. B. Unit 3 Vokabeln', ok: 'Anlegen' });
  if (!t) return null;
  const [deck] = await db.putItems('decks', [{ subjectId: subject.id, title: t, lang: guess }]);
  return deck;
}

// ---------- Lernen ----------
let S = null;   // laufende Runde

export async function startStudy(deck, cards, onDone) {
  if (!cards.length) { toast('Noch keine Karten'); return; }
  await profile();
  const due = cards.filter((c) => isDue(c));
  const opts = await sheet('Lernen', (body, close) => {
    let dir = 'ab', mode = 'flip', practice = !due.length;
    const seg = (items, cur, set) => {
      const s = h('div.seg');
      for (const [k, label] of items) {
        const b = h('button' + (k === cur ? '.on' : ''), { text: label, on: { click: () => { set(k); s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } } });
        s.append(b);
      }
      return s;
    };
    const fl = LANGS[deck.lang] && deck.lang !== 'de-DE' && deck.lang ? LANGS[deck.lang] : 'Vorderseite';
    const bl = fl === 'Vorderseite' ? 'Rückseite' : 'Deutsch';
    body.append(
      h('p.dlgtext', { text: due.length ? `${plural(due.length, 'Karte ist', 'Karten sind')} heute dran.` : 'Heute ist nichts fällig. Du kannst trotzdem alle Karten üben, das ändert den Plan nicht.' }),
      h('p.fieldlabel', { text: 'Richtung' }),
      seg([['ab', `${fl} → ${bl}`], ['ba', `${bl} → ${fl}`], ['mix', 'Gemischt']], dir, (v) => { dir = v; }),
      h('p.fieldlabel', { text: 'Antworten' }),
      seg([['flip', 'Umdrehen'], ...(cards.length >= 4 ? [['choice', 'Auswählen']] : []), ['type', 'Eintippen']], mode, (v) => { mode = v; }),
      h('p.calm.small', { text: 'Eintippen gibt die meisten Punkte. Mit dem Pencil kannst du ins Feld auch schreiben.' }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        due.length && due.length < cards.length ? h('button.btn', { text: 'Alle üben', on: { click: () => close({ dir, mode, practice: true }) } }) : null,
        h('button.btn.primary', { text: practice ? 'Alle üben' : 'Los', on: { click: () => close({ dir, mode, practice }) } })));
  });
  if (!opts) return;
  const list = (opts.practice ? cards : due).slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  S = { deck, queue: list.map((c) => ({ c, rev: opts.dir === 'ba' || (opts.dir === 'mix' && Math.random() < 0.5), missed: false })),
    total: list.length, done: 0, right: 0, wrong: 0, mode: opts.mode, practice: opts.practice, onDone, shown: false, item: null,
    all: cards, run: newRun(), coins: await getCoins(), earned: 0 };
  hud();
  $('study').hidden = false;
  document.body.classList.add('studying');
  nextCard();
}

function speak(text, lang) {
  try {
    if (!('speechSynthesis' in window) || !lang || lang === 'la') { toast('Vorlesen geht für diese Sprache nicht'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* egal */ }
}
const isForeign = () => S.deck.lang && S.deck.lang !== 'de-DE';
const sideName = (front) => (isForeign() ? (front ? LANGS[S.deck.lang] : 'Deutsch') : (front ? 'Vorderseite' : 'Rückseite'));
const sideLang = (front) => (front ? S.deck.lang : (S.deck.lang && S.deck.lang !== 'de-DE' ? 'de-DE' : S.deck.lang));

function nextCard() {
  const box = $('studyCard'), act = $('studyActions');
  box.textContent = ''; act.textContent = '';
  $('studyProg').style.setProperty('--p', String(S.total ? S.done / S.total : 1));
  $('studyInfo').textContent = S.queue.length ? `${S.done + 1} von ${S.total}${S.practice ? ' · Übung' : ''}` : '';
  if (!S.queue.length) return finish();
  const it = S.item = S.queue.shift();
  S.shown = false;
  const q = it.rev ? it.c.back : it.c.front, a = it.rev ? it.c.front : it.c.back;
  const qFront = !it.rev;
  box.append(h('div.flash', null,
    h('div.fside.q', null, h('small', { text: sideName(qFront) }), h('p', { text: q }),
      h('button.icbtn.say', { 'aria-label': 'Vorlesen', on: { click: (e) => { e.stopPropagation(); speak(q, sideLang(qFront)); } } }, icon('speak'))),
    h('div.fside.a', { id: 'studyAnswer' })));
  const reveal = (result, given) => {
    if (S.shown) return;
    S.shown = true;
    const ans = $('studyAnswer');
    ans.append(h('small', { text: 'Lösung' }), h('p', { text: a }),
      h('button.icbtn.say', { 'aria-label': 'Vorlesen', on: { click: () => speak(a, sideLang(!qFront)) } }, icon('speak')));
    if (result) {
      ans.classList.add(result);
      ans.prepend(h('div.verdict', { text: result === 'right' ? 'Richtig' : result === 'close' ? `Fast richtig: „${given}“ · zählt als gewusst` : `Deine Antwort: „${given || '–'}“` }));
    }
    act.textContent = '';
    if (result) {
      act.append(h('button.btn.big' + (result === 'wrong' ? '.primary' : ''), { text: result === 'wrong' ? 'Weiter' : 'Doch nicht gewusst', on: { click: () => grade(false) } }));
      if (result !== 'wrong') act.append(h('button.btn.big.good', { text: 'Weiter', on: { click: () => grade(true) } }));
      else if (S.mode !== 'choice') act.append(h('button.btn.big', { text: 'War doch richtig', on: { click: () => grade(true) } }));
      setTimeout(() => act.lastChild && act.lastChild.focus && (result === 'wrong' ? act.firstChild : act.lastChild).focus(), 30);
    } else {
      act.append(
        h('button.btn.big.bad', { on: { click: () => grade(false) } }, icon('close'), h('span', { text: 'Nicht gewusst' })),
        h('button.btn.big.good', { on: { click: () => grade(true) } }, icon('select'), h('span', { text: 'Gewusst' })));
    }
  };
  S.reveal = reveal;
  const jokers = h('div.jokers');
  const drawJokers = () => {
    jokers.replaceChildren(
      h('button.joker', { disabled: S.shown || it.hint || S.coins < JOKERS.hint, title: S.mode === 'choice' ? 'Zwei falsche Antworten weg' : 'Erster Buchstabe und Länge',
        on: { click: () => useJoker('hint') } }, h('span', { text: S.mode === 'choice' ? '50 : 50' : 'Tipp' }), coinTag(JOKERS.hint, '.cost')),
      h('button.joker', { disabled: S.shown || S.coins < JOKERS.save, title: 'Lösung zeigen, zählt nicht als Fehler',
        on: { click: () => useJoker('save') } }, h('span', { text: 'Retter' }), coinTag(JOKERS.save, '.cost')));
  };
  const useJoker = async (kind) => {
    if (S.shown || S.coins < JOKERS[kind]) return;
    S.coins = await addCoins(-JOKERS[kind]); hud();
    if (kind === 'hint') {
      it.hint = true;
      if (S.mode === 'choice') {
        const wrong = [...act.querySelectorAll('.choice')].filter((b) => b.textContent !== a && !b.disabled);
        wrong.sort(() => Math.random() - 0.5).slice(0, 2).forEach((b) => { b.disabled = true; b.classList.add('gone'); });
      } else box.querySelector('.fside.q').append(h('p.hintline', { text: hintText(a) }));
      drawJokers();
    } else {
      it.saved = true;
      reveal(null);
      act.textContent = '';
      $('studyAnswer').prepend(h('div.verdict.saved', { text: 'Retter eingesetzt · zählt nicht als Fehler' }));
      act.append(h('button.btn.big.primary', { text: 'Weiter', on: { click: () => skipSaved() } }));
    }
  };
  S.drawJokers = drawJokers;
  drawJokers();
  if (S.mode === 'choice') {
    const opts = choicesFor(it, S.all);
    const grid = h('div.choices');
    for (const o of opts) {
      grid.append(h('button.choice', { text: o, on: { click: (e) => {
        if (S.shown) return;
        const ok = o === a;
        grid.querySelectorAll('.choice').forEach((b) => { b.disabled = true; if (b.textContent === a) b.classList.add('right'); });
        if (!ok) e.currentTarget.classList.add('wrong');
        reveal(ok ? 'right' : 'wrong', o);
        if (ok) { act.textContent = ''; setTimeout(() => { if (S && S.item === it) grade(true); }, 650); }
      } } }));
    }
    act.append(jokers, grid);
  } else if (S.mode === 'type') {
    const inp = h('input.field.answer', { type: 'text', placeholder: 'Antwort eintippen', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, id: 'studyInput' });
    const check = () => { if (!S.shown) { const g = inp.value.trim(); inp.disabled = true; reveal(checkAnswer(g, a), g); } };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    act.append(jokers, inp, h('button.btn.big.primary', { text: 'Prüfen', on: { click: check } }));
    setTimeout(() => inp.focus(), 60);
  } else {
    box.firstChild.addEventListener('click', () => reveal(null));
    act.append(jokers, h('button.btn.big.primary', { text: 'Lösung zeigen', on: { click: () => reveal(null) } }));
  }
}

// Retter: Karte gilt als erledigt, ohne Punkte, ohne Stufe zu ändern
async function skipSaved() {
  const it = S.item;
  if (!it) return;
  S.item = null; S.done++;
  if (S) nextCard();
}

async function grade(knew) {
  const it = S.item;
  if (!it) return;
  S.item = null;
  const c = it.c;
  const gain = hit(S.run, knew, { base: S.mode === 'type' ? 15 : S.mode === 'choice' ? 8 : 10 });
  const card = $('studyCard').querySelector('.flash');
  if (card) card.classList.add(knew ? 'won' : 'lost');
  if (gain) floatXp($('studyCard'), '+' + gain + (S.run.combo >= 5 ? ` · ×${multOf(S.run.combo - 1)}` : ''));
  hud();
  if (knew && !it.missed && !it.hint) {
    let c0 = S.mode === 'type' ? 2 : 1;
    if (S.run.combo && S.run.combo % 5 === 0) c0 += 2;   // Combo-Bonus
    S.coins = await addCoins(c0); S.earned += c0; hud();
    floatCoin($('studyCard'), c0);
  }
  if (knew) {
    S.done++; S.right++;
    if (!S.practice) {
      c.box = it.missed ? 1 : Math.min(6, (c.box || 0) + 1);
      c.due = startOfDay() + INTERVALS[c.box] * DAY;
    }
    c.right = (c.right || 0) + 1;
  } else {
    S.wrong++;
    it.missed = true;
    if (!S.practice) { c.box = 0; c.due = 0; }
    c.wrong = (c.wrong || 0) + 1;
    // in dieser Runde nochmal, ein paar Karten später
    S.queue.splice(Math.min(S.queue.length, 3), 0, it);
  }
  await db.putItems('cards', c);
  if (card) await new Promise((r) => setTimeout(r, knew ? 180 : 260));
  if (S) nextCard();
}

function floatCoin(host, n) {
  const el = h('span.coinfloat', null, h('i.coinic'), h('b', { text: '+' + n }));
  host.append(el); setTimeout(() => el.remove(), 1100);
}
// Combo und Punkte oben in der Leiste
function hud() {
  const el = $('studyHud');
  if (!el || !S || !S.run) return;
  const R = S.run;
  el.textContent = '';
  el.append(coinTag(S.coins ?? 0, '.hud'), h('span.hudxp', { text: `${R.xp} XP` }));
  if (R.combo >= 2) {
    const c = h('span.combo' + (R.combo >= 5 ? '.hot' : ''), { text: `${R.combo}er Combo${R.combo >= 5 ? ' ×' + String(multOf(R.combo)).replace('.', ',') : ''}` });
    el.append(c);
  }
}
// 4 Antworten: richtige + 3 andere aus demselben Stapel
export function choicesFor(it, all) {
  const a = it.rev ? it.c.front : it.c.back;
  const pool = [...new Set(all.filter((c) => c.id !== it.c.id).map((c) => (it.rev ? c.front : c.back)).filter((x) => x && x !== a))];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const opts = [a, ...pool.slice(0, 3)];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return opts;
}

async function finish() {
  const box = $('studyCard'), act = $('studyActions');
  $('studyProg').style.setProperty('--p', '1');
  S.ended = true;
  const R = await endRun(S.run, { extra: { perfect: S.total >= 10 && S.wrong === 0 } });
  box.append(resultView(R, {
    title: S.wrong ? 'Runde geschafft' : 'Fehlerlos',
    lines: [`${plural(S.total, 'Karte', 'Karten')} gelernt${S.wrong ? `, ${S.wrong}× nochmal ran` : ', alle beim ersten Mal gewusst'} · beste Combo ${R.best}.`,
      S.earned ? `${plural(S.earned, 'Coin', 'Coins')} gesammelt, du hast jetzt ${S.coins}. Damit kannst du Joker kaufen.` : '',
      S.practice ? '' : 'Was du gewusst hast, kommt erst in ein paar Tagen wieder. Schwierige Karten kommen öfter. So bleibt es im Langzeitgedächtnis.'].filter(Boolean),
  }));
  act.append(h('button.btn.big.primary', { text: 'Fertig', on: { click: closeStudy } }));
}

function closeStudy() {
  if (!S) return;
  try { speechSynthesis.cancel(); } catch (e) { /* egal */ }
  const cb = S.onDone;
  if (S.run && !S.ended && (S.run.right || S.run.wrong)) endRun(S.run, { bonus: 0 }).catch(() => {});
  S = null;
  $('study').hidden = true;
  document.body.classList.remove('studying');
  if (cb) cb();
}

$('studyClose').addEventListener('click', closeStudy);
document.addEventListener('keydown', (e) => {
  if (!S || $('study').hidden || document.querySelector('.dlgscrim')) return;
  if (e.target.id === 'studyInput') return;
  if (e.key === 'Escape') closeStudy();
  else if (S.mode === 'choice' && !S.shown && /^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('#studyActions .choice')[+e.key - 1]; if (b) b.click(); }
  else if (S.mode === 'flip' && !S.shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); S.reveal(null); }
  else if (S.mode === 'flip' && S.shown && S.item && (e.key === 'ArrowRight' || e.key === '2')) grade(true);
  else if (S.mode === 'flip' && S.shown && S.item && (e.key === 'ArrowLeft' || e.key === '1')) grade(false);
});
