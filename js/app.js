// Hauptteil: Bibliothek mit Fächern, Büchern und Seiten.
import * as db from './db.js';
const APP_VERSION = '35';   // gleich wie VERSION in sw.js
import { openEditor } from './editor.js';
import { renderPage, PAPERS } from './paper.js';
import { detectPage, defaultCorners } from './scanner.js';
import { startScan, setOnSaved } from './scan.js';
import { openReader, readerOpen, readerPages, invalidate, tocSheet } from './reader.js';
import { $, h, icon, toast, busy, kb, fmtBytes, plural, sheet, confirmSheet, promptSheet, menu, saveFile, shareReady } from './ui.js';
import { renderDeck, newDeckFlow, startStudy, dueCount, addCardsFlow } from './cards.js';
import { playerCard, profileSheet } from './game.js';
import { renderKit, TABS as KIT_TABS, focusWatch } from './kit.js';
import { backupBanner, backupSheet, backupNow } from './backup.js';
import { greeting, applyTheme, themeSheet, focusPill, weekCard } from './dash.js';
import { renderTimetable, renderExams, renderGrades, nowCard, examCard, subjectSchoolBox } from './school.js';
import { editHomework, hwList, sortHw } from './homework.js';
import { renderPlan, todayPlan } from './plan.js';
import { renderSorter, dateGroup, fmtDay } from './organize.js';
import { importPdf, exportPdf } from './pdfio.js';
import { ocrPages, needsOcr, snippet, needsInk, hasInk, readInk, fuzzyFind } from './ocr.js';
import { renderCodeList } from './code.js';
import { renderReminders, dueBanner, startReminderWatch, editReminder } from './reminders.js';

// ---------- Vorlagen ----------
const PALETTE = ['#3b6fd8', '#d0493f', '#2f9e8f', '#6c5bd4', '#3f9b4f', '#c0752a', '#2f8fb3', '#b0577a', '#8a6d3b', '#5f6673'];
const PRESETS = [
  ['Mathe', '#3b6fd8'], ['Deutsch', '#d0493f'], ['Englisch', '#2f9e8f'], ['Französisch', '#6c5bd4'],
  ['Latein', '#8a6d3b'], ['Spanisch', '#c0752a'], ['Biologie', '#3f9b4f'], ['Chemie', '#c0752a'],
  ['Physik', '#4b5bbf'], ['Geschichte', '#9a6b3f'], ['Erdkunde', '#2f8fb3'], ['Politik', '#5f6673'],
  ['Religion', '#b0577a'], ['Ethik', '#b0577a'], ['Kunst', '#d26a9c'], ['Musik', '#8e5bb5'],
  ['Informatik', '#2c7a7b'], ['Sport', '#e08a2e'],
];
const KINDS = {
  book: { label: 'Buch', icon: 'book', hint: 'z. B. Lambacher Schweizer 9', what: 'Gescanntes Schulbuch' },
  notebook: { label: 'Heft', icon: 'notebook', hint: 'z. B. Matheheft', what: 'Zum Schreiben mit dem Pencil' },
  folder: { label: 'Mappe', icon: 'folder', hint: 'z. B. Arbeitsblätter', what: 'Für lose Blätter und Arbeitsblätter' },
};
const INBOX = db.INBOX_BOOK;

// ---------- Zustand ----------
let nav = { view: 'library' };
let pages = [];               // Seiten der offenen Buch-Ansicht
let selecting = false;
const selected = new Set();
const thumbUrls = new Map();

async function thumbUrl(id) {
  if (thumbUrls.has(id)) return thumbUrls.get(id);
  const blob = await db.getThumb(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  thumbUrls.set(id, u);
  return u;
}
function dropThumb(id) {
  const u = thumbUrls.get(id);
  if (u) { URL.revokeObjectURL(u); thumbUrls.delete(id); }
  invalidate(id);
}
function setThumb(img, id) { thumbUrl(id).then((u) => { if (u) img.src = u; }); }

// ---------- Kopfbereich ----------
function setHeader({ back, eyebrow, title, meta = '', actions = [] }) {
  $('navBack').hidden = !back;
  if (back) { $('navBackLabel').textContent = back.label; $('navBack').onclick = back.go; }
  $('navEyebrow').textContent = eyebrow || '';
  $('navEyebrow').hidden = !eyebrow;
  $('navTitle').textContent = title;
  $('count').textContent = meta;
  $('storage').textContent = '';
  const a = $('navActions');
  a.textContent = '';
  a.append(...actions);
}
const btn = (label, ic, onClick, cls = '') =>
  h('button.btn' + cls, { on: { click: onClick } }, ic ? icon(ic) : null, label ? h('span', { text: label }) : null);
const iconBtn = (ic, label, onClick) =>
  h('button.btn.round', { 'aria-label': label, title: label, on: { click: onClick } }, icon(ic));

let lastView = null;   // Startseite nur beim Hinkommen einblenden, nicht bei jedem Abhaken
async function render() {
  if (nav.view !== 'library') lastView = nav.view;
  setSelecting(false);
  window.scrollTo(0, 0);
  if (nav.view === 'library') return renderLibrary();
  if (nav.view === 'subject') return renderSubject();
  if (nav.view === 'code') return renderCodeList({ setHeader, btn, go });
  if (nav.view === 'reminders') return renderReminders({ setHeader, btn, go, saveFile });
  if (nav.view === 'kit') return renderKit({ setHeader, btn, iconBtn, go }, nav.tab);
  if (nav.view === 'timetable') return renderTimetable({ setHeader, btn, iconBtn, go });
  if (nav.view === 'exams') return renderExams({ setHeader, btn, iconBtn, go });
  if (nav.view === 'sort') return renderSorter({ setHeader, btn, iconBtn, go });
  if (nav.view === 'plan') return renderPlan({ setHeader, btn, iconBtn, go }, nav.examId);
  if (nav.view === 'grades') return renderGrades({ setHeader, btn, iconBtn, go });
  if (nav.view === 'deck') return renderDeck(nav.deck, { setHeader, btn, iconBtn, go, subject: nav.subject, saveFile });
  return renderBook();
}
function go(n) { nav = n; render(); }

// ---------- Bibliothek ----------
async function renderLibrary() {
  const [subjects, books, all] = await Promise.all([db.listSubjects(), db.listAllBooks(), db.listAllPages()]);
  const inbox = all.filter((p) => p.bookId === INBOX).sort((a, b) => a.index - b.index);
  const greet = greeting();
  setHeader({
    eyebrow: greet.eyebrow, title: greet.title,
    meta: `${plural(subjects.length, 'Fach', 'Fächer')} · ${plural(all.length, 'Seite', 'Seiten')}`,
    actions: [
      iconBtn('search', 'Suchen', () => searchFlow()),
      iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
        { label: 'Arbeitsblatt scannen und ausfüllen', icon: 'page', onClick: () => worksheetScan() },
        'sep',
        { label: 'Sicherung …', icon: 'save', onClick: () => backupSheet({ saveFile, onLoad: () => $('fileBackup').click(), after: render }) },
        { label: 'Sicherung laden', icon: 'restore', onClick: () => $('fileBackup').click() },
        'sep',
        { label: 'Text in allen Scans erkennen', icon: 'search', onClick: async () => ocrFlow(await db.listAllPages()) },
        'sep',
        { label: 'Darstellung (hell/dunkel)', icon: 'moon', onClick: () => themeSheet() },
      ])),
      btn('Notiz', 'pen', () => quickNote()),
      btn('Arbeitsblatt', 'page', () => worksheetScan(), '.wideonly'),
      btn('Fach', 'plus', () => addSubjectFlow()),
      btn('Scannen', 'camera', () => startScan(INBOX, 'camera'), '.primary'),
    ],
  });
  db.storageInfo().then((est) => { if (est && est.usage != null && nav.view === 'library') $('storage').textContent = `${fmtBytes(est.usage)} belegt`; });

  const view = $('view');
  view.textContent = '';
  view.classList.toggle('enter', lastView !== 'library');
  lastView = 'library';
  const banner = await dueBanner({ go });
  if (banner) view.append(banner);
  const bk = await backupBanner({ saveFile, after: render });
  if (bk) view.append(bk);
  const fp = focusPill(go);
  if (fp) view.append(fp);
  if (subjects.length) view.append(h('section.dashrow', null, await nowCard({ go, subjects }), await examCard({ go, subjects })));
  if (subjects.length) view.append(await weekCard({ go, subjects, after: render }));
  if (subjects.length) await todaySection(view, subjects);
  if (!subjects.length) {
    view.append(h('section.empty', null,
      h('div.emptyart', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('h2', { text: 'Leg dein erstes Fach an' }),
      h('p', { text: 'In jedes Fach kommen deine Bücher, Hefte und Mappen. Tipp ein Fach an, um es anzulegen.' }),
      presetChips([], () => render())));
  } else {
    const grid = h('div.subjects');
    const [hwAll, exAll] = await Promise.all([db.listHomework(), db.listExams()]);
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    for (const s of subjects) {
      const sb = books.filter((b) => b.subjectId === s.id);
      const n = all.filter((p) => sb.some((b) => b.id === p.bookId)).length;
      const nHw = hwAll.filter((x) => x.subjectId === s.id && !x.done).length;
      const nEx = exAll.filter((x) => x.subjectId === s.id && x.date >= todayIso).length;
      grid.append(h('button.subject', { style: { '--c': s.color }, on: { click: () => go({ view: 'subject', subject: s }) } },
        (nHw || nEx) ? h('span.sbadges', null, nEx ? h('em.sbadge.ex', { text: nEx > 1 ? `${nEx} Prüfungen` : 'Prüfung' }) : null, nHw ? h('em.sbadge', { text: `${nHw} HA` }) : null) : null,
        h('span.mono', { text: s.name.slice(0, 2) }),
        h('span.sname', { text: s.name }),
        h('span.smeta', { text: `${plural(sb.length, 'Buch', 'Bücher')} · ${plural(n, 'Seite', 'Seiten')}` })));
    }
    grid.append(h('button.subject.add', { on: { click: () => addSubjectFlow() } }, icon('plus'), h('span.sname', { text: 'Fach hinzufügen' })));
    view.append(h('h2.section', { text: 'Fächer' }), grid);
  }

  // Planer
  const [rems, exams, grades] = await Promise.all([db.listReminders(), db.listExams(), db.listGrades()]);
  const openRems = rems.filter((r) => !r.done).length;
  const tile = (cls, ic, title, sub, view) => h('button.ptile' + cls, { on: { click: () => go({ view }) } }, h('span.ptileic', null, icon(ic)), h('b', { text: title }), h('small', { text: sub }));
  view.append(h('h2.section', { text: 'Planer' }), h('div.ptiles', null,
    tile('', 'grid', 'Stundenplan', 'Fächer, Räume, Zeiten', 'timetable'),
    tile('', 'bookmark', 'Prüfungen', exams.length ? plural(exams.filter((x) => x.date >= new Date().toISOString().slice(0, 10)).length, 'geplant', 'geplant') : 'Arbeiten und Tests', 'exams'),
    tile('', 'homework', 'Noten', grades.length ? plural(grades.length, 'Note', 'Noten') : 'Schnitt pro Fach', 'grades'),
    tile('.rementry', 'clock', 'Erinnerungen', openRems ? `${openRems} offen` : 'Für alles, was du nicht vergessen willst', 'reminders')));
  // Werkzeuge
  view.append(h('h2.section', { text: 'Werkzeuge' }), h('div.ptiles.kit', null,
    ...KIT_TABS.map(([k, l, ic, sub]) => h('button.ptile', { on: { click: () => go({ view: 'kit', tab: k }) } }, h('span.ptileic', null, icon(ic)), h('b', { text: l }), h('small', { text: sub })))));

  // Programmieren
  const nCode = (await db.listCode()).length;
  view.append(h('h2.section', { text: 'Programmieren' }),
    h('button.inbox.codeentry', { on: { click: () => go({ view: 'code' }) } },
      h('span.codeicon', null, icon('code')),
      h('span.inboxtext', null,
        h('b', { text: 'Code' }),
        h('small', { text: nCode ? `${plural(nCode, 'Projekt', 'Projekte')} · Web, Python, Lua` : 'Kleine Spiele und Programme bauen: Web, Python, Lua' }))));

  // Eingang: Seiten, die noch keinem Buch zugeordnet sind (Versionshinweis kommt ganz ans Ende)
  if (inbox.length) {
    const strip = h('div.strip');
    for (const p of inbox.slice(0, 8)) {
      const img = h('img', { alt: '' });
      setThumb(img, p.id);
      strip.append(h('span.mini', null, img));
    }
    view.append(
      h('div.colhead.inboxhead', null, h('h2.section', { text: 'Eingang' }), h('button.txt.strong', { on: { click: () => go({ view: 'sort' }) } }, 'Einsortieren →')),
      h('button.inbox', { on: { click: () => go({ view: 'book', book: { id: INBOX, title: 'Eingang', kind: 'inbox' } }) } },
        h('span.inboxtext', null,
          h('b', { text: plural(inbox.length, 'Seite', 'Seiten') + ' noch nicht einsortiert' }),
          h('small', { text: 'Tippe auf „Einsortieren“: Die App schlägt das Fach vor' })),
        strip));
  }
  view.append(h('p.appversion', { text: 'Version ' + APP_VERSION }));
}

// "Heute": offene Hausaufgaben und fällige Lernkarten über alle Fächer
async function todaySection(view, subjects) {
  const [hw, decks, cards] = await Promise.all([db.listHomework(), db.listDecks(), db.listCards()]);
  const subjMap = new Map(subjects.map((s) => [s.id, s]));
  const open = hw.filter((x) => !x.done && subjMap.has(x.subjectId)).sort(sortHw);
  const dueDecks = decks.map((d) => ({ d, cards: cards.filter((c) => c.deckId === d.id) }))
    .map((x) => ({ ...x, due: dueCount(x.cards) })).filter((x) => x.due && subjMap.has(x.d.subjectId));
  const wrap = h('section.today');
  const col1 = h('div.todaycol', null,
    h('div.colhead', null, h('h2.section', { text: 'Hausaufgaben' }),
      h('button.txt', { on: { click: () => editHomework({}, { subjects, after: render }) } }, '+ Eintragen')));
  if (open.length) col1.append(hwList(open.slice(0, 8), { subjMap, after: render }));
  else col1.append(h('p.calm', { text: 'Nichts offen.' }));
  if (open.length > 8) col1.append(h('p.calm', { text: `… und ${open.length - 8} weitere in den Fächern` }));
  const col2 = h('div.todaycol', null, h('div.colhead', null, h('h2.section', { text: 'Heute lernen' })),
    await playerCard({ onOpen: () => profileSheet(render) }));
  const tp = await todayPlan({ go, subjects, after: render });
  if (tp) col2.append(tp);
  if (dueDecks.length) {
    const l = h('div.duelist');
    for (const x of dueDecks) {
      const s = subjMap.get(x.d.subjectId);
      l.append(h('button.duedeck', { style: { '--c': s.color }, on: { click: () => startStudy(x.d, x.cards, render) } },
        icon('cards'), h('span', null, h('b', { text: x.d.title }), h('small', { text: s.name })),
        h('span.duecount', { text: String(x.due) })));
    }
    col2.append(l);
  } else if (!tp) col2.append(h('p.calm', { text: decks.length ? 'Alle Karten sind gelernt. Morgen geht es weiter.' : 'Lernkarten legst du in einem Fach an.' }));
  wrap.append(col1, col2);
  view.append(wrap);
}

function presetChips(existing, after) {
  const names = new Set(existing.map((s) => s.name.toLowerCase()));
  const wrap = h('div.chips');
  for (const [name, color] of PRESETS) {
    if (names.has(name.toLowerCase())) continue;
    wrap.append(h('button.pchip', {
      style: { '--c': color },
      on: { click: async () => { await db.addSubject({ name, color }); toast(`${name} angelegt`); after(); } },
    }, h('i'), h('span', { text: name })));
  }
  return wrap;
}

async function addSubjectFlow() {
  const existing = await db.listSubjects();
  await sheet('Fach hinzufügen', (body, close) => {
    let color = PALETTE[existing.length % PALETTE.length];
    const input = h('input.field', { type: 'text', placeholder: 'Eigener Name, z. B. Wirtschaft', id: 'subjName', autocomplete: 'off' });
    const sw = colorPicker(color, (c) => { color = c; });
    const create = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      await db.addSubject({ name, color });
      close(true);
      toast(`${name} angelegt`);
      render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    body.append(
      h('p.fieldlabel', { text: 'Schnell wählen' }),
      presetChips(existing, () => { close(true); render(); }),
      h('label.fieldlabel', { for: 'subjName', text: 'Oder eigenes Fach' }), input,
      sw,
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Anlegen', on: { click: create } })));
  }, { wide: true });
}

function colorPicker(current, onPick) {
  const row = h('div.colorrow', { role: 'radiogroup', 'aria-label': 'Farbe' });
  for (const c of PALETTE) {
    const b = h('button.cdot' + (c === current ? '.on' : ''), { style: { '--c': c }, 'aria-label': 'Farbe', on: { click: () => {
      row.querySelectorAll('.cdot').forEach((x) => x.classList.toggle('on', x === b));
      onPick(c);
    } } });
    row.append(b);
  }
  return row;
}

// ---------- Fach ----------
async function renderSubject() {
  const s = nav.subject;
  const [books, all, hw, decks, allCards] = await Promise.all([db.listBooks(s.id), db.listAllPages(), db.listHomework(s.id), db.listDecks(s.id), db.listCards()]);
  const moreBtn = iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
    { label: 'Umbenennen', icon: 'edit', onClick: async () => {
      const name = await promptSheet('Fach umbenennen', { value: s.name });
      if (name) { await db.updateSubject(s.id, { name }); s.name = name; render(); }
    } },
    { label: 'Farbe ändern', icon: 'select', onClick: () => sheet('Farbe wählen', (body, close) => {
      body.append(colorPicker(s.color, async (c) => { await db.updateSubject(s.id, { color: c }); s.color = c; close(true); render(); }));
    }) },
    'sep',
    { label: 'Fach löschen', icon: 'trash', danger: true, onClick: async () => {
      const n = all.filter((p) => books.some((b) => b.id === p.bookId)).length;
      const ok = await confirmSheet(`${s.name} löschen?`, `Das Fach mit ${plural(books.length, 'Buch', 'Büchern')}, ${plural(n, 'Seite', 'Seiten')}, Hausaufgaben und Lernkarten wird von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.`);
      if (ok) { await db.deleteSubject(s.id); toast(`${s.name} gelöscht`); go({ view: 'library' }); }
    } },
  ]));
  setHeader({
    back: { label: 'Bibliothek', go: () => go({ view: 'library' }) },
    eyebrow: 'Fach', title: s.name,
    meta: plural(books.length, 'Buch', 'Bücher'),
    actions: [moreBtn, btn('Neu', 'plus', (e) => newBookMenu(e.currentTarget), '.primary')],
  });
  $('navTitle').style.setProperty('--c', s.color);

  const view = $('view');
  view.textContent = '';
  view.append(await subjectSchoolBox(s, { go, after: render }));
  // Hausaufgaben
  const openHw = hw.filter((x) => !x.done).sort(sortHw), doneHw = hw.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (hw.length || decks.length) {
    const hwSec = h('section.subsec', null, h('div.colhead', null, h('h2.section', { text: 'Hausaufgaben' }),
      h('button.txt', { on: { click: () => editHomework({ subjectId: s.id }, { after: render }) } }, '+ Eintragen')));
    if (openHw.length) hwSec.append(hwList(openHw, { after: render })); else hwSec.append(h('p.calm', { text: 'Nichts offen.' }));
    if (doneHw.length) {
      const det = h('details.donebox', null, h('summary', { text: `Erledigt (${doneHw.length})` }), hwList(doneHw.slice(0, 30), { after: render }));
      hwSec.append(det);
    }
    view.append(hwSec);
  }
  // Lernkarten
  if (decks.length) {
    const dg = h('div.decks');
    for (const d of decks.sort((a, b) => a.created - b.created)) {
      const cs = allCards.filter((c) => c.deckId === d.id), due = dueCount(cs);
      dg.append(h('button.deckcard', { style: { '--c': s.color }, on: { click: () => go({ view: 'deck', deck: d, subject: s }) } },
        h('span.deckstack', null, h('span'), h('span', null, icon('cards'))),
        h('span.cap', null, h('b', { text: d.title }), h('small', { text: `${plural(cs.length, 'Karte', 'Karten')}${due ? ` · ${due} fällig` : ''}` })),
        due ? h('span.duecount', { text: String(due) }) : null));
    }
    dg.append(h('button.deckcard.add', { on: { click: () => newDeck() } }, icon('plus'), h('span.cap', null, h('b', { text: 'Neuer Stapel' }))));
    view.append(h('section.subsec', null, h('h2.section', { text: 'Lernkarten' }), dg));
  }
  if (!books.length && !decks.length && !hw.length) {
    view.append(h('section.empty', null,
      h('h2', { text: `Noch nichts in ${s.name}` }),
      h('p', { text: 'Leg ein Buch zum Scannen, ein Heft zum Schreiben oder eine Mappe für Arbeitsblätter an.' }),
      h('div.kindrow', null, ...Object.entries(KINDS).map(([k, v]) =>
        h('button.kind', { on: { click: () => newBookFlow(k) } }, icon(v.icon), h('b', { text: v.label }), h('small', { text: v.what }))),
        h('button.kind', { on: { click: () => newDeck() } }, icon('cards'), h('b', { text: 'Lernkarten' }), h('small', { text: 'Vokabeln mit Wiederholplan' })),
        h('button.kind', { on: { click: () => editHomework({ subjectId: s.id }, { after: render }) } }, icon('homework'), h('b', { text: 'Hausaufgabe' }), h('small', { text: 'Eintragen und abhaken' })))));
    return;
  }
  if (!books.length) {
    view.append(h('section.subsec', null, h('h2.section', { text: 'Bücher und Hefte' }),
      h('p.calm', { text: 'Noch keine. Über „Neu“ legst du ein Buch, Heft oder eine Mappe an.' })));
    return;
  }
  const grid = h('div.books');
  for (const b of books) {
    const bp = all.filter((p) => p.bookId === b.id).sort((x, y) => x.index - y.index);
    const img = h('img', { alt: '' });
    if (bp[0]) setThumb(img, bp[0].id);
    grid.append(h('button.bookcard', { style: { '--c': s.color }, on: { click: () => go({ view: 'book', book: b, subject: s }) } },
      h('span.cover' + (bp[0] ? '' : '.blank'), null,
        bp[0] ? img : h('span.covertitle', { text: b.title }),
        h('span.spine'),
        h('span.kindbadge', null, icon(KINDS[b.kind]?.icon || 'book'))),
      h('span.cap', null, h('b', { text: b.title }), h('small', { text: `${KINDS[b.kind]?.label || 'Buch'} · ${plural(bp.length, 'Seite', 'Seiten')}` }))));
  }
  view.append(h('section.subsec', null, (hw.length || decks.length) ? h('h2.section', { text: 'Bücher und Hefte' }) : null, grid));
}

function newBookMenu(anchor) {
  menu(anchor, [
    ...Object.entries(KINDS).map(([k, v]) => ({ label: `${v.label} – ${v.what}`, icon: v.icon, onClick: () => newBookFlow(k) })),
    'sep',
    { label: 'Lernkarten – Vokabeln lernen', icon: 'cards', onClick: () => newDeck() },
    { label: 'Hausaufgabe eintragen', icon: 'homework', onClick: () => editHomework({ subjectId: nav.subject.id }, { after: render }) },
  ]);
}
async function newDeck() {
  const s = nav.subject;
  const d = await newDeckFlow(s);
  if (!d) return;
  go({ view: 'deck', deck: d, subject: s });
  setTimeout(() => addCardsFlow(d, render), 120);
}

async function newBookFlow(kind) {
  const s = nav.subject;
  const k = KINDS[kind];
  const res = await sheet({ book: 'Neues Buch', notebook: 'Neues Heft', folder: 'Neue Mappe' }[kind], (body, close) => {
    let paper = s.name.toLowerCase().startsWith('mathe') || s.name === 'Physik' || s.name === 'Chemie' ? 'grid' : 'lined';
    const input = h('input.field', { type: 'text', placeholder: k.hint, id: 'bookTitle', autocomplete: 'off' });
    const submit = () => { const t = input.value.trim() || `${k.label} ${s.name}`; close({ title: t, paper }); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    body.append(h('label.fieldlabel', { for: 'bookTitle', text: 'Titel' }), input);
    if (kind === 'notebook') {
      const seg = h('div.seg.papers2');
      for (const [p, label] of Object.entries(PAPERS)) {
        const b = h('button' + (p === paper ? '.on' : ''), { text: label, on: { click: () => { paper = p; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } } });
        seg.append(b);
      }
      body.append(h('p.fieldlabel', { text: 'Papier' }), seg);
    }
    body.append(h('div.dlgactions', null,
      h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
      h('button.btn.primary', { text: 'Anlegen', on: { click: submit } })));
  });
  if (!res) return;
  const b = await db.addBook({ subjectId: s.id, title: res.title, kind, paper: res.paper });
  go({ view: 'book', book: b, subject: s });
}

// ---------- Buch (und Eingang) ----------
async function renderBook() {
  const b = nav.book, s = nav.subject;
  const isInbox = b.id === INBOX;
  pages = await db.listPages(b.id);
  const k = KINDS[b.kind];
  const actions = [];
  if (!isInbox) actions.push(iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
    { label: 'Umbenennen', icon: 'edit', onClick: async () => {
      const t = await promptSheet(`${k?.label || 'Buch'} umbenennen`, { label: 'Titel', value: b.title });
      if (t) { await db.updateBook(b.id, { title: t }); b.title = t; render(); }
    } },
    { label: 'Inhaltsverzeichnis', icon: 'list', onClick: async () => { const i = await tocSheet(pages, b.title); if (i != null) openBook(i); } },
    { label: 'Als PDF speichern', icon: 'pdf', onClick: () => pdfExportFlow(pages, b.title) },
    { label: 'Text erkennen (für die Suche)', icon: 'search', onClick: () => ocrFlow(pages) },
    ...(pages.some((p) => p.kind !== 'blank') ? [{ label: 'Seiten säubern (schärfer, weißes Papier)', icon: 'auto', onClick: () => cleanFlow(selecting && selected.size ? pages.filter((p) => selected.has(p.id)) : pages) }] : []),
    ...(pages.some((p) => p.cleaned) ? [{ label: 'Säubern rückgängig (Original)', icon: 'restore', onClick: () => uncleanFlow(selecting && selected.size ? pages.filter((p) => selected.has(p.id)) : pages) }] : []),
    ...(b.kind === 'folder' ? [{ label: 'Nach Datum sortieren', icon: 'clock', onClick: async () => {
      const ids = [...pages].sort((x, y) => (x.created || 0) - (y.created || 0)).map((x) => x.id);
      await db.setOrder(b.id, ids); toast('Nach Datum sortiert'); render();
    } }] : []),
    'sep',
    { label: `${k?.label || 'Buch'} löschen`, icon: 'trash', danger: true, onClick: async () => {
      const ok = await confirmSheet(`„${b.title}“ löschen?`, `${plural(pages.length, 'Seite', 'Seiten')} werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.`);
      if (ok) { await db.deleteBook(b.id); pages.forEach((p) => dropThumb(p.id)); toast('Gelöscht'); go({ view: 'subject', subject: s }); }
    } },
  ])));
  if (pages.length) {
    actions.push(btn('Auswählen', 'select', () => setSelecting(!selecting)));
    actions.push(btn('Lesen', 'read', () => openBook(0)));
  }
  actions.push(btn('Importieren', 'import', (e) => menu(e.currentTarget, [
    { label: 'Fotos', icon: 'import', onClick: () => startScan(b.id, 'photos') },
    { label: 'PDF-Datei', icon: 'pdf', onClick: () => { pdfTarget = b.id; $('filePdf').click(); } },
  ])));
  actions.push(btn(b.kind === 'notebook' ? 'Neue Seite' : 'Neues Blatt', 'page', (e) => {
    if (b.kind === 'notebook') newSheet(b.paper || 'lined');
    else menu(e.currentTarget, Object.entries(PAPERS).map(([p, label]) => ({ label, icon: 'page', onClick: () => newSheet(p) })));
  }));
  if (isInbox && pages.length) actions.push(btn('Einsortieren', 'folder', () => go({ view: 'sort' })));
  actions.push(btn('Scannen', 'camera', () => startScan(b.id, 'camera'), '.primary'));
  setHeader({
    back: isInbox ? { label: 'Bibliothek', go: () => go({ view: 'library' }) } : { label: s.name, go: () => go({ view: 'subject', subject: s }) },
    eyebrow: isInbox ? 'Noch nicht einsortiert' : `${k?.label || 'Buch'} · ${s.name}`,
    title: b.title,
    meta: plural(pages.length, 'Seite', 'Seiten') + (pages.some((p) => p.size) ? ' · ' + fmtBytes(pages.reduce((a, p) => a + (p.size || 0), 0)) : ''),
    actions,
  });

  const view = $('view');
  view.textContent = '';
  if (!pages.length) {
    view.append(h('section.empty', null,
      h('div.emptyart', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('h2', { text: isInbox ? 'Der Eingang ist leer' : 'Noch keine Seiten' }),
      h('p', { text: b.kind === 'notebook' ? 'Tipp auf „Neue Seite“ und schreib mit dem Pencil los.' : 'Scanne die erste Seite oder importiere Fotos.' })));
    return;
  }
  const grid = h('div.grid');
  const byDate = (b.kind === 'folder' || isInbox) && pages.length > 3;
  let lastGroup = null;
  pages.forEach((p, i) => {
    if (byDate) { const g = dateGroup(p.created || 0); if (g !== lastGroup) { lastGroup = g; grid.append(h('h3.gridgroup', { text: g })); } }
    const img = h('img', { alt: `Seite ${i + 1}` });
    setThumb(img, p.id);
    const tile = h('button.tile' + (selected.has(p.id) ? '.picked' : ''), { 'data-id': p.id, on: { click: () => {
      if (selecting) { toggleSel(p.id); return; }
      openBook(i);
    } } },
      h('span.sheet', null, img, h('span.check', null, icon('select')), p.mark ? h('span.ribbon') : null),
      h('span.cap', null,
        h('b', { text: p.mark ? `${i + 1} · ${p.mark}` : `Seite ${i + 1}` }),
        h('small', { text: (b.kind === 'folder' || isInbox ? fmtDay(p.created || 0) + ' · ' : '') + (p.kind === 'blank' ? (PAPERS[p.paper] || 'Blatt') : `Scan · ${kb(p.size)}`) + (p.strokes ? ' · beschriftet' : '') })));
    grid.append(tile);
  });
  view.append(grid);
  view.classList.toggle('selecting', selecting);
}

// Nach Lesezeichen-Änderung im Leser die Kacheln still neu zeichnen
async function renderBookGridOnly() {
  const y = window.scrollY;
  await renderBook();
  window.scrollTo(0, y);
}

function openBook(i) {
  openReader(pages, i, { title: nav.book.title, onEdit: (p) => openEditor(p, { onClose: afterEdit }), onMarks: () => { if (nav.view === 'book') renderBookGridOnly(); } });
}

// Schnellnotiz: sofort ein leeres Blatt im Eingang (Papier wie beim letzten Mal)
async function quickNote() {
  let paper = 'grid';
  try { paper = localStorage.getItem('quickPaper') || 'grid'; } catch (e) { /* egal */ }
  nav = { view: 'library' };
  await newSheet(paper);
}

async function newSheet(paper) {
  try { localStorage.setItem('quickPaper', paper); } catch (e) { /* egal */ }
  const probe = { kind: 'blank', paper, width: 1000, height: 1414 };
  const thumb = await new Promise((r) => renderPage(probe, null, [], 260).toBlob(r, 'image/jpeg', 0.7));
  const page = await db.addBlankPage({ bookId: nav.book?.id || INBOX, paper, thumb });
  await render();
  openEditor(page, { onClose: afterEdit });
}

async function afterEdit(page) {
  if (page) dropThumb(page.id);
  else { for (const id of [...thumbUrls.keys()]) dropThumb(id); }
  await render();
  if (readerOpen() && nav.view === 'book') readerPages(pages);
}

// ---------- Auswählen, sortieren, verschieben ----------
function setSelecting(on) {
  selecting = on;
  if (!on) selected.clear();
  $('view').classList.toggle('selecting', on);
  $('view').querySelectorAll('.tile').forEach((t) => t.classList.toggle('picked', selected.has(t.dataset.id)));
  $('selbar').hidden = !on;
  document.body.classList.toggle('selmode', on);
  updateSel();
}
function toggleSel(id) {
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  $('view').querySelectorAll('.tile').forEach((t) => t.classList.toggle('picked', selected.has(t.dataset.id)));
  updateSel();
}
function updateSel() {
  const n = selected.size;
  $('selCount').textContent = n ? plural(n, 'Seite', 'Seiten') + ' ausgewählt' : 'Seiten antippen';
  for (const id of ['selLeft', 'selRight', 'selMove', 'selDelete', 'selPdf']) $(id).disabled = !n;
}
async function shift(d) {
  const ids = pages.map((p) => p.id);
  const order = d < 0 ? [...ids.keys()] : [...ids.keys()].reverse();
  for (const i of order) {
    const j = i + d;
    if (!selected.has(ids[i]) || j < 0 || j >= ids.length || selected.has(ids[j])) continue;
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  await db.setOrder(nav.book.id, ids);
  const keep = new Set(selected);
  await render();
  keep.forEach((id) => selected.add(id));
  setSelecting(true);
}
$('selLeft').addEventListener('click', () => shift(-1));
$('selRight').addEventListener('click', () => shift(1));
$('selDone').addEventListener('click', () => setSelecting(false));
$('selPdf').addEventListener('click', () => pdfExportFlow(pages, nav.book.title));
$('selDelete').addEventListener('click', async () => {
  const n = selected.size;
  const ok = await confirmSheet(`${plural(n, 'Seite', 'Seiten')} löschen?`, 'Die Seiten werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.');
  if (!ok) return;
  for (const id of selected) { await db.deletePage(id); dropThumb(id); }
  const rest = pages.filter((p) => !selected.has(p.id)).map((p) => p.id);
  await db.setOrder(nav.book.id, rest);
  toast(plural(n, 'Seite', 'Seiten') + ' gelöscht');
  render();
});
$('selMove').addEventListener('click', async () => {
  const [subjects, books] = await Promise.all([db.listSubjects(), db.listAllBooks()]);
  const target = await sheet('Verschieben nach …', (body, close) => {
    const list = h('div.targets');
    if (nav.book.id !== INBOX) list.append(h('button.target', { on: { click: () => close({ id: INBOX, title: 'Eingang' }) } }, icon('inbox'), h('span', { text: 'Eingang' })));
    for (const s of subjects) {
      const sb = books.filter((b) => b.subjectId === s.id);
      list.append(h('p.targethead', { style: { '--c': s.color } }, h('i'), h('span', { text: s.name })));
      if (!sb.length) list.append(h('p.targetnone', { text: 'Noch keine Bücher' }));
      for (const b of sb) {
        list.append(h('button.target' + (b.id === nav.book.id ? '.current' : ''), { disabled: b.id === nav.book.id, on: { click: () => close(b) } },
          icon(KINDS[b.kind]?.icon || 'book'), h('span', { text: b.title })));
      }
    }
    if (!subjects.length) list.append(h('p.targetnone', { text: 'Leg zuerst in der Bibliothek ein Fach und ein Buch an.' }));
    body.append(list);
  });
  if (!target) return;
  const n = selected.size;
  await db.movePages([...selected].filter((id) => pages.some((p) => p.id === id)), target.id);
  toast(`${plural(n, 'Seite', 'Seiten')} nach „${target.title}“ verschoben`);
  render();
});

// ---------- Suche ----------
async function searchFlow() {
  const [subjects, books, all, decks, cards, hw] = await Promise.all([db.listSubjects(), db.listAllBooks(), db.listAllPages(), db.listDecks(), db.listCards(), db.listHomework()]);
  const sub = new Map(subjects.map((s) => [s.id, s]));
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  await sheet('Suchen', (body, close) => {
    const input = h('input.field', { type: 'search', placeholder: 'Fach, Buch, Wort auf einer Seite, Vokabel …', id: 'searchField', autocomplete: 'off' });
    const list = h('div.targets.results');
    const show = () => {
      const q = norm(input.value.trim());
      list.textContent = '';
      const hitsS = subjects.filter((s) => !q || norm(s.name).includes(q));
      const hitsB = books.filter((b) => q && (norm(b.title).includes(q) || norm(sub.get(b.subjectId)?.name || '').includes(q)));
      for (const s of hitsS) {
        list.append(h('button.target', { on: { click: () => { close(true); go({ view: 'subject', subject: s }); } } },
          h('i.dot', { style: { '--c': s.color } }), h('span', { text: s.name }), h('small', { text: 'Fach' })));
      }
      for (const b of hitsB) {
        const s = sub.get(b.subjectId);
        const n = all.filter((p) => p.bookId === b.id).length;
        list.append(h('button.target', { on: { click: () => { close(true); go({ view: 'book', book: b, subject: s }); } } },
          icon(KINDS[b.kind]?.icon || 'book'), h('span', { text: b.title }), h('small', { text: `${s ? s.name + ' · ' : ''}${plural(n, 'Seite', 'Seiten')}` })));
      }
      if (q) {
        // Lesezeichen
        for (const p of all.filter((x) => x.mark && norm(x.mark).includes(q)).slice(0, 20)) {
          const b = bookMap.get(p.bookId); if (!b) continue;
          const s = sub.get(b.subjectId);
          list.append(h('button.target', { on: { click: async () => {
            close(true); nav = { view: 'book', book: b, subject: s }; await render();
            const i = pages.findIndex((x) => x.id === p.id); if (i >= 0) openBook(i);
          } } }, icon('bookmark'), h('span', { text: p.mark }), h('small', { text: `${b.title} · S. ${p.index + 1}` })));
        }
        // Text auf Seiten (Texterkennung und Textfelder)
        let nText = 0;
        for (const p of all) {
          if (nText >= 30) break;
          const src = [p.tags, p.ocr, p.textBoxes].filter(Boolean).join('\n');
          if (!src || !norm(src).includes(q)) continue;
          const b = p.bookId === INBOX ? { id: INBOX, title: 'Eingang', kind: 'inbox' } : bookMap.get(p.bookId); if (!b) continue;
          const s = sub.get(b.subjectId);
          nText++;
          list.append(h('button.target', { on: { click: async () => {
            close(true); nav = b.id === INBOX ? { view: 'book', book: b } : { view: 'book', book: b, subject: s }; await render();
            const i = pages.findIndex((x) => x.id === p.id); if (i >= 0) openBook(i);
          } } }, icon('page'), h('span.snip', { text: snippet(src, q, norm) }), h('small', { text: `${b.title} · S. ${p.index + 1}` })));
        }
        // Handschrift (unsicher erkannt, unscharf gesucht)
        let nInk = 0;
        for (const p of all) {
          if (nInk >= 20) break;
          if (!p.ink) continue;
          const already = [p.tags, p.ocr, p.textBoxes].filter(Boolean).join('\n');
          if (already && norm(already).includes(q)) continue;
          const w = fuzzyFind(p.ink, q, norm); if (!w) continue;
          const b = p.bookId === INBOX ? { id: INBOX, title: 'Eingang', kind: 'inbox' } : bookMap.get(p.bookId); if (!b) continue;
          const s = sub.get(b.subjectId);
          nInk++;
          list.append(h('button.target', { on: { click: async () => {
            close(true); nav = b.id === INBOX ? { view: 'book', book: b } : { view: 'book', book: b, subject: s }; await render();
            const i = pages.findIndex((x) => x.id === p.id); if (i >= 0) openBook(i);
          } } }, icon('pen'), h('span.snip', { text: `„${w}“` }), h('small', { text: `Handschrift, unsicher · ${b.title} · S. ${p.index + 1}` })));
        }
        // Kartenstapel und Vokabeln
        const deckHits = new Map();
        for (const d of decks) if (norm(d.title).includes(q)) deckHits.set(d.id, null);
        for (const c of cards) if (!deckHits.has(c.deckId) && (norm(c.front).includes(q) || norm(c.back).includes(q))) deckHits.set(c.deckId, c);
        for (const [id, c] of [...deckHits].slice(0, 20)) {
          const d = decks.find((x) => x.id === id); if (!d) continue;
          const s = sub.get(d.subjectId); if (!s) continue;
          list.append(h('button.target', { on: { click: () => { close(true); go({ view: 'deck', deck: d, subject: s }); } } },
            icon('cards'), h('span', { text: c ? `${c.front} – ${c.back}` : d.title }), h('small', { text: c ? d.title : `Lernkarten · ${s.name}` })));
        }
        // Hausaufgaben
        for (const x of hw.filter((y) => norm(y.text).includes(q)).slice(0, 20)) {
          const s = sub.get(x.subjectId); if (!s) continue;
          list.append(h('button.target', { on: { click: () => { close(true); go({ view: 'subject', subject: s }); } } },
            icon('homework'), h('span', { text: x.text }), h('small', { text: `${s.name}${x.done ? ' · erledigt' : ''}` })));
        }
      }
      if (!list.children.length) list.append(h('p.targetnone', { text: q ? 'Nichts gefunden.' : 'Noch keine Fächer.' }));
    };
    input.addEventListener('input', show);
    // Handschrift lesen (Versuch)
    const inkBar = h('div.inkbar');
    const drawInkBar = () => {
      const withInk = all.filter(hasInk), todo = withInk.filter(needsInk);
      inkBar.hidden = !withInk.length;
      if (!withInk.length) return;
      const artifact = !!document.documentElement.dataset.artifact;
      const btn = h('button.btn.small', { disabled: artifact || !todo.length, on: { click: async () => {
        let stop = false;
        const msg = h('small', { text: 'Texterkennung wird geladen …' });
        const cancel = h('button.btn.small', { text: 'Abbrechen', on: { click: () => { stop = true; cancel.disabled = true; msg.textContent = 'Wird nach dieser Seite beendet …'; } } });
        inkBar.replaceChildren(h('div.inkinfo', null, h('b', { text: 'Handschrift wird gelesen' }), msg), h('span.inkspin', { 'aria-hidden': 'true' }), cancel);
        try {
          const { drawStroke } = await import('./paper.js');
          const n = await readInk(todo, drawStroke, (t) => { if (!stop) msg.textContent = t; }, () => stop);
          const found = todo.filter((p) => p.ink).length;
          toast(`${plural(n, 'Seite', 'Seiten')} gelesen, auf ${found} davon wurden Wörter erkannt.`, 4000);
        } catch (err) { toast('Handschrift lesen fehlgeschlagen: ' + err.message, 5000); }
        finally { drawInkBar(); show(); }
      } } }, icon('pen'), h('span', { text: todo.length ? `Handschrift lesen (${todo.length})` : 'Alles gelesen' }));
      inkBar.replaceChildren(
        h('div.inkinfo', null,
          h('b', { text: 'Handschrift suchen' }),
          h('small', { text: artifact
            ? 'Geht nur in der eigenen App unter brastib.github.io/lernen-macht-spa-, nicht in dieser Testversion.'
            : 'Ein Versuch: Saubere Druckbuchstaben klappen oft, Schreibschrift kaum. Sicher findest du Seiten über Stichworte (im Editor unter „Teilen“).' })),
        btn);
    };
    drawInkBar();
    body.append(input, list, inkBar);
    show();
  });
}

// ---------- Texterkennung ----------
async function ocrFlow(list) {
  if (document.documentElement.dataset.artifact) {
    toast('Texterkennung geht nur in der eigenen App unter brastib.github.io/lernen-macht-spa-, nicht in dieser Testversion.', 5000);
    return;
  }
  const todo = list.filter(needsOcr);
  if (!todo.length) { toast(list.some((p) => p.kind !== 'blank') ? 'Text ist schon erkannt' : 'Keine Scans oder PDF-Seiten'); return; }
  const ok = await confirmSheet('Text erkennen?', `${plural(todo.length, 'Seite wird', 'Seiten werden')} gelesen, damit die Suche Wörter darauf findet. Das dauert etwa 5 bis 15 Sekunden pro Seite und läuft nur auf diesem Gerät. Gedruckter Text klappt gut, Handschrift kaum.`, 'Starten', false);
  if (!ok) return;
  let stop = false;
  busy(true, 'Texterkennung wird geladen …');
  const cancel = h('button.btn.ghost.busystop', { text: 'Abbrechen', on: { click: () => { stop = true; cancel.disabled = true; $('busyText').textContent = 'Wird nach dieser Seite beendet …'; } } });
  $('busy').append(cancel);
  try {
    const n = await ocrPages(todo, (t) => { if (!stop) $('busyText').textContent = t; }, () => stop);
    toast(`Text auf ${plural(n, 'Seite', 'Seiten')} erkannt. Die Suche findet ihn jetzt.`, 3500);
  } catch (err) {
    toast('Texterkennung fehlgeschlagen: ' + err.message, 5000);
  } finally {
    cancel.remove();
    busy(false);
  }
}

// ---------- Seiten säubern ----------
async function cleanFlow(list) {
  const todo = list.filter((p) => p.kind !== 'blank' && !p.cleaned);
  if (!todo.length) { toast('Diese Seiten sind schon gesäubert.'); return; }
  const ok = await confirmSheet('Seiten säubern?', `${plural(todo.length, 'Seite wird', 'Seiten werden')} verbessert: Schatten weg, Papier weiß, Schrift schärfer, schiefe Seiten gerade. Das Original bleibt gespeichert, du kannst es jederzeit zurückholen.`, 'Säubern', false);
  if (!ok) return;
  const { cleanCanvas, compress, makeThumb } = await import('./scanner.js');
  const { blobToImage } = await import('./paper.js');
  let stop = false, n = 0;
  busy(true, 'Seiten werden gesäubert …');
  const cancel = h('button.btn.ghost.busystop', { text: 'Abbrechen', on: { click: () => { stop = true; cancel.disabled = true; } } });
  $('busy').append(cancel);
  try {
    for (const p of todo) {
      if (stop) break;
      $('busyText').textContent = `Seite ${n + 1} von ${todo.length} wird gesäubert …`;
      const blob = await db.getImage(p.id); if (!blob) continue;
      const img = await blobToImage(blob);
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      // Beschriftete Seiten nicht drehen, sonst passen die Striche nicht mehr
      const out = cleanCanvas(c, { straighten: !p.strokes });
      const { blob: nb } = await compress(out);
      const th = await makeThumb(out);
      await db.replaceImage(p.id, nb, th, { keepOrig: true, cleaned: true });
      dropThumb(p.id);
      n++;
      await new Promise((r) => setTimeout(r, 0));
    }
    toast(`${plural(n, 'Seite', 'Seiten')} gesäubert.`, 3000);
  } catch (err) { toast('Säubern fehlgeschlagen: ' + err.message, 5000); }
  finally { cancel.remove(); busy(false); render(); }
}
async function uncleanFlow(list) {
  const todo = list.filter((p) => p.cleaned);
  if (!todo.length) return;
  const ok = await confirmSheet('Originale zurückholen?', `${plural(todo.length, 'Seite bekommt', 'Seiten bekommen')} wieder das ursprüngliche Bild.`, 'Zurückholen', false);
  if (!ok) return;
  const { makeThumb } = await import('./scanner.js');
  const { blobToImage } = await import('./paper.js');
  busy(true, 'Originale werden zurückgeholt …');
  let n = 0;
  try {
    for (const p of todo) {
      const orig = await db.getOrig(p.id); if (!orig) continue;
      const img = await blobToImage(orig);
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
      await db.replaceImage(p.id, orig, await makeThumb(c), { cleaned: false });
      await db.dropOrig(p.id);
      dropThumb(p.id); n++;
    }
    toast(`${plural(n, 'Original', 'Originale')} zurückgeholt.`, 3000);
  } finally { busy(false); render(); }
}

// ---------- PDF ----------
let pdfTarget = INBOX;
$('filePdf').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  busy(true, 'PDF wird geöffnet …');
  try {
    const added = await importPdf(f, pdfTarget, (i, n) => { $('busyText').textContent = `PDF wird übernommen … Seite ${i} von ${n}`; });
    busy(false);
    toast(`${plural(added.length, 'Seite', 'Seiten')} aus „${f.name}“ übernommen` + (added.cleaned ? `, ${added.cleaned === added.length ? 'alle' : added.cleaned} gesäubert` : ''), 3500);
    render();
  } catch (err) {
    busy(false);
    toast('PDF konnte nicht geöffnet werden: ' + err.message, 5000);
  }
});

async function pdfExportFlow(list, title) {
  const chosen = selecting && selected.size ? list.filter((p) => selected.has(p.id)) : list;
  if (!chosen.length) { toast('Keine Seiten'); return; }
  busy(true, 'PDF wird erstellt …');
  try {
    const blob = await exportPdf(chosen, (i, n) => { $('busyText').textContent = `PDF wird erstellt … Seite ${i} von ${n}`; });
    busy(false);
    const name = `${title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Seiten'}.pdf`;
    if (await shareReady('PDF ist bereit', name, blob)) toast(`PDF mit ${plural(chosen.length, 'Seite', 'Seiten')} · ${fmtBytes(blob.size)}`);
  } catch (err) {
    busy(false);
    toast('PDF fehlgeschlagen: ' + err.message, 5000);
  }
}

// ---------- Sicherung ----------
async function backupFlow() { return backupNow({ saveFile }); }
$('fileBackup').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const ok = await confirmSheet('Sicherung laden?', `„${f.name}“ wird eingespielt. Gleiche Seiten werden überschrieben, alles andere bleibt erhalten.`, 'Laden', false);
  if (!ok) return;
  busy(true, 'Sicherung wird geladen …');
  try {
    const r = await db.importAll(JSON.parse(await f.text()));
    for (const id of [...thumbUrls.keys()]) dropThumb(id);
    busy(false);
    toast(`Geladen: ${plural(r.subjects, 'Fach', 'Fächer')}, ${plural(r.pages, 'Seite', 'Seiten')}, ${plural(r.cards, 'Karte', 'Karten')}`, 4000);
    go({ view: 'library' });
  } catch (err) {
    busy(false);
    toast('Laden fehlgeschlagen: ' + err.message, 5000);
  }
});

// ---------- Arbeitsblatt: scannen und gleich ausfüllen ----------
let worksheetPending = false;
function worksheetScan() {
  worksheetPending = true;
  toast('Arbeitsblatt fotografieren. Danach öffnet es sich direkt zum Ausfüllen.', 3500);
  startScan(INBOX, 'camera');
}
// ---------- Scannen fertig ----------
setOnSaved(async (bookId) => {
  if (worksheetPending) {
    worksheetPending = false;
    const list = (await db.listPages(bookId)).sort((a, b) => (b.created || 0) - (a.created || 0) || b.index - a.index);
    if (list[0]) { openEditor(list[0], { onClose: () => render() }); return; }
  }
  if (nav.view === 'book' && nav.book.id === bookId) await render();
  else if (nav.view === 'library') await render();
});

// ---------- Start ----------
// Offline-Modus nur in der eigenen Web-App-Version (im Claude-Artefakt nicht möglich)
if ('serviceWorker' in navigator && !document.documentElement.dataset.artifact) {
  try {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      // Beim Öffnen und beim Zurückkehren in die App nach einer neuen Version suchen
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      reg.update().catch(() => {});
    }).catch((e) => console.warn('Service Worker:', e));
    // Neue Version ist aktiv: einmal neu laden, damit alle Dateien neu sind (nicht mitten im Schreiben)
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      const busyNow = document.querySelector('.dlgscrim') || !$('editor')?.hidden || document.body.classList.contains('coding');
      if (busyNow) toast('Neue Version da. Beim nächsten Öffnen ist sie aktiv.', 4000);
      else location.reload();
    });
  } catch (e) { /* egal */ }
}
db.askPersistent();
render();
// Erinnerungen prüfen, solange die App offen ist (Hinweis + Mitteilung, falls erlaubt)
focusWatch();
applyTheme();
startReminderWatch(() => {
  if ((nav.view === 'library' || nav.view === 'reminders') && !document.querySelector('.dlgscrim')) render();
});

// für Tests
window.__lernapp = { db, detectPage, defaultCorners, openEditor, nav: () => nav };
