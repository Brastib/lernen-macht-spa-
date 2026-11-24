// Big Boy: Chat-Helfer in der App. Versteht feste Befehle (öffnen, suchen, Lernkarten, Aufgaben, abschreiben,
// Übungsblatt zu einem Thema, erklären, Beispiel aufs Blatt) und ruft dafür die anderen Funktionen auf.
// Freie Fragen beantwortet die lokale Text-KI, Fragen zum offenen Blatt die Bild-KI (beide auf dem Gerät).
// Ehrlich: Die kleine KI steuert die App nicht frei. Befehle werden mit festen Regeln erkannt; Änderungen nur nach „Ja“.
import * as db from './db.js';
import { h, icon, toast } from './ui.js';

let app = null;            // { go, nav, render, openBookAt, openPage, features }
let panel = null, list = null, input = null, chips = null;
const history = [];        // für die Text-KI: [{ role, content }]

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').trim();
const has = (t, re) => re.test(norm(t));

export function initBigBoy(api) {
  app = api;
  const fab = h('button.bbfab', { 'aria-label': 'Big Boy fragen', title: 'Big Boy fragen', on: { click: toggle } }, icon('bot'), h('span', { text: 'Big Boy' }));
  document.body.append(fab);
}

function toggle() { if (panel && !panel.hidden) close(); else open(); }
function close() { if (panel) { panel.hidden = true; document.body.classList.remove('bbopen'); } }
async function open() {
  if (!panel) build();
  panel.hidden = false;
  document.body.classList.add('bbopen');
  renderChips();
  if (!list.childElementCount) say('Hi, ich bin Big Boy. Ich kann Sachen in der App öffnen, Übungsblätter machen, Lernkarten erstellen und dir Blätter erklären. Schreib einfach, was du brauchst.');
  setTimeout(() => input.focus(), 60);
}
function build() {
  list = h('div.bblist', { role: 'log', 'aria-live': 'polite' });
  input = h('textarea.bbinput', { rows: 1, placeholder: 'Frag Big Boy …', 'aria-label': 'Nachricht an Big Boy' });
  const send = h('button.bbsend', { 'aria-label': 'Senden', on: { click: submit } }, icon('up'));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
  chips = h('div.bbchips');
  panel = h('aside.bbpanel', { 'aria-label': 'Big Boy' },
    h('header.bbhead', null, h('div.bbava', null, icon('bot')), h('div', null, h('b', { text: 'Big Boy' }), h('small', { text: 'Dein Lern-Helfer · läuft auf dem iPad' })),
      h('button.bbx', { 'aria-label': 'Schließen', on: { click: close } }, icon('close'))),
    list, chips, h('div.bbbar', null, input, send));
  document.body.append(panel);
}
function renderChips() {
  const ed = editorOpen();
  const sug = ed
    ? ['Erklär mir das Blatt', 'Schreib ein Beispiel aufs Blatt', 'Mehr Aufgaben wie dieses Blatt', 'Lernkarten aus dieser Seite', 'Lies meine Handschrift']
    : ['Binomische Formeln, erstell mir was', 'Öffne Mathe', 'Such Fotosynthese', 'Was kannst du?'];
  chips.replaceChildren(...sug.map((s) => h('button.bbchip', { text: s, on: { click: () => { input.value = s; submit(); } } })));
}

// ---------- Nachrichten ----------
function bubble(who, text, extra = []) {
  const b = h('div.bbmsg.' + who, null, ...(text ? String(text).split('\n').map((l) => h('p', { text: l })) : []), ...extra);
  list.append(b);
  list.scrollTop = list.scrollHeight;
  return b;
}
const say = (text, extra) => bubble('bot', text, extra);
function thinking(text = 'Big Boy denkt nach …') { const b = bubble('bot.wait', text); return { set: (t) => { b.firstChild && (b.firstChild.textContent = t); }, done: () => b.remove() }; }
const btn = (label, fn, primary = false) => h('button.btn.small' + (primary ? '.primary' : ''), { text: label, on: { click: fn } });
const row = (...b) => h('div.bbacts', null, ...b);

async function submit() {
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';
  bubble('me', text);
  try { await handle(text); }
  catch (err) { say('Da ist etwas schiefgegangen: ' + (err && err.message || err)); }
  renderChips();
}

// ---------- Kontext ----------
function editorOpen() { const e = document.getElementById('editor'); return e && !e.hidden; }
async function editor() { return import('./editor.js'); }
async function currentPage() { if (!editorOpen()) return null; const E = await editor(); const s = E.edState(); return s.open ? E.edFlush() : null; }

// ---------- Befehle ----------
async function handle(text) {
  const n = norm(text);
  if (/^(hilfe|was kannst du|befehle|wer bist du)/.test(n) || /was kannst du/.test(n)) return help();
  if (/(lernkarte|karteikarte)/.test(n)) return cards();
  if (/(wie (dieses|das) blatt|mehr aufgaben|aehnliche aufgaben|neue aufgaben)/.test(n)) return moreTasks();
  if (/(abschreib|handschrift|lies (mein|das|die))/.test(n)) return transcribe();
  if (/beispiel/.test(n) && /(blatt|hinschreib|schreib|drauf)/.test(n)) return example(text);
  if (/(erstell|mach|gib|generier|bau).*(was|aufgabe|ubung|uebung|blatt|test|training)|(ubungsblatt|uebungsblatt)/.test(n) || (/(erstell|mach mir)/.test(n))) return makeSheet(text);
  const mo = n.match(/^(?:bitte\s+)?(?:offne|oeffne|zeig(?:\s+mir)?|geh(?:e)?\s+(?:zu|in)|starte?|spiel(?:e)?)\s+(.+)$/);
  if (mo) return openThing(mo[1]);
  const ms = n.match(/^(?:such(?:e)?|finde?)\s+(?:nach\s+)?(.+)$/);
  if (ms) return search(ms[1]);
  if (/(erklar|erklaer|was (ist|sind|heisst|bedeutet)|wie (geht|rechne|funktioniert)|warum|versteh|hilf)/.test(n)) return explain(text);
  return freeChat(text);
}

function help() {
  say('Das kann ich:\n• „Öffne Mathe“, „Öffne Taschenrechner“, „Starte Schach“\n• „Such Fotosynthese“ (sucht auf allen Seiten)\n• „Binomische Formeln, erstell mir was“ (Übungsblatt mit Lösungen)\n• Im Blatt: „Erklär mir das“, „Schreib ein Beispiel aufs Blatt“, „Mehr Aufgaben wie dieses Blatt“, „Lernkarten aus dieser Seite“, „Lies meine Handschrift“\n• Sonst frag mich einfach etwas.\nMathe-Aufgaben rechne ich sicher. Was die KI schreibt, kann Fehler haben.');
}

async function cards() {
  const p = await currentPage();
  const m = await import('./autocards.js');
  if (p) { say('Okay, ich suche die wichtigen Infos auf dieser Seite.'); return m.autoCardsFlow([p]); }
  const nav = app.nav();
  if (nav.view === 'book' && nav.book) { const pages = await db.listPages(nav.book.id); say(`Okay, aus „${nav.book.title}“.`); return m.autoCardsFlow(pages.slice(0, 40), { title: nav.book.title }); }
  say('Öffne zuerst eine Seite oder ein Buch, dann mache ich Lernkarten daraus.');
}
async function moreTasks() {
  const p = await currentPage();
  if (!p) return say('Öffne zuerst das Arbeitsblatt, dann mache ich neue Aufgaben im gleichen Stil.');
  const book = p.bookId ? await db.getBook(p.bookId).catch(() => null) : null;
  say('Mach ich. Du kannst gleich auswählen, wie viele und wie schwer.');
  return (await import('./morework.js')).moreTasksFlow([p], { title: book ? book.title : '' });
}
async function transcribe() {
  const p = await currentPage();
  if (!p) return say('Öffne zuerst die Seite mit deiner Handschrift.');
  return (await import('./morework.js')).transcribeFlow(p);
}

// Beispiel aufs Blatt
async function example(text) {
  const p = await currentPage();
  if (!p) return say('Öffne zuerst das Blatt, auf das das Beispiel soll.');
  const T = await import('./topics.js');
  let topic = T.findTopic(text);
  if (!topic) {
    // Thema vom Blatt erraten
    const pageText = [p.ocr, p.textBoxes, p.aiText].filter(Boolean).join('\n');
    topic = T.findTopic(pageText);
  }
  let ex = topic ? T.exampleFor(topic) : '', sure = !!ex;
  if (!ex) {
    const V = await import('./visionai.js');
    if (!(await V.visionDownloaded())) return say(`Für ein Beispiel zu diesem Blatt brauche ich die Bild-KI (${V.VSIZE}, einmalig).`, [row(btn('KI-Einstellungen', async () => (await import('./autocards.js')).aiSettingsSheet()))]);
    const w = thinking('Ich schaue mir das Blatt an …');
    try { ex = await V.ask(await V.pageImage(p), 'Schreibe EIN kurzes, passendes Beispiel zu diesem Arbeitsblatt, so wie es auf dem Blatt gemacht wird, mit Lösung. Höchstens 4 Zeilen, auf Deutsch, nur das Beispiel.', { maxTokens: 220, onProgress: w.set }); }
    finally { w.done(); await V.unloadVision(); }
  }
  if (!ex) return say('Mir ist kein gutes Beispiel eingefallen.');
  say((sure ? 'Gerechnet, das stimmt sicher:' : 'Vorschlag von der KI (bitte prüfen):') + '\n' + ex, [row(
    btn('Aufs Blatt schreiben', async (e) => { const el = e.currentTarget; const E = await editor(); if (E.edInsertText(ex)) { el.disabled = true; say('Steht auf dem Blatt. Rückgängig geht mit dem Pfeil oben.'); } else say('Das Blatt ist nicht mehr offen.'); }, true))]);
}

// Übungsblatt zu einem Thema
async function makeSheet(text) {
  const T = await import('./topics.js');
  const topic = T.findTopic(text);
  const n0 = (norm(text).match(/(\d{1,2})\s*(aufgaben|stuck|stueck)/) || [])[1];
  const n = Math.min(16, Math.max(3, +n0 || 8));
  const level = /leicht|einfach/.test(norm(text)) ? 'leichter' : /schwer/.test(norm(text)) ? 'schwerer' : 'gleich';
  const subjects = await db.listSubjects();
  const subj = subjects.find((s) => norm(text).includes(norm(s.name))) || (topic ? subjects.find((s) => /^mathe/.test(norm(s.name))) : null) || subjects.find((s) => app.nav().subject && s.id === app.nav().subject.id) || subjects[0];
  if (!subj) return say('Leg zuerst ein Fach an, dann mache ich dir ein Blatt.');
  let tasks, title, sure = true;
  if (topic) {
    const M = await import('./morework.js');
    tasks = M.groupsToTasks(T.makeTopic(topic, { n, level }));
    title = topic.title;
  } else {
    const thema = text.replace(/^(bitte\s+)?/i, '').replace(/[,.!]?\s*(erstell|mach|gib|generier|bau)\w*\s+(mir\s+)?(bitte\s+)?(was|ein(e|en)?\s+\w+|aufgaben|übungen?)\b.*$/i, '').replace(/^(ich habe|hab|wir haben)\s+/i, '').trim() || text;
    const A = await import('./localai.js');
    const sup = await A.aiSupport();
    if (!sup.ok || !(await A.isDownloaded())) {
      return say(`Zu „${thema}“ kann ich ohne Text-KI keine Aufgaben schreiben. Mathe-Themen gehen immer: ${T.TOPIC_NAMES.join(', ')}.` + (sup.ok ? ' Die Text-KI kannst du in den KI-Einstellungen laden.' : ''), sup.ok ? [row(btn('KI-Einstellungen', async () => (await import('./autocards.js')).aiSettingsSheet()))] : []);
    }
    const w = thinking('Ich schreibe Aufgaben …');
    let raw = '';
    try {
      raw = await A.chat([{ role: 'system', content: 'Du bist Big Boy, ein Nachhilfe-Lehrer. Du schreibst Übungsaufgaben für Schüler auf Deutsch.' },
        { role: 'user', content: `Schreibe ${Math.min(n, 8)} Übungsaufgaben zum Thema „${thema}“ (${level === 'gleich' ? 'mittel' : level}). Zu jeder eine kurze, richtige Lösung. Format genau so:\nTHEMA: <Thema>\nAUFGABE: <Text>\nLÖSUNG: <Lösung>\n\nAUFGABE: ...` }], { maxTokens: 1200, onProgress: w.set });
    } finally { w.done(); await A.unloadAi(); }
    const M = await import('./morework.js');
    const p = M.parseTasks(raw);
    if (!p.tasks.length) return say('Die KI hat leider keine brauchbaren Aufgaben geliefert. Versuch es nochmal oder anders formuliert.');
    tasks = p.tasks.map((t) => ({ ...t, on: true }));
    title = p.theme || thema; sure = false;
  }
  const preview = tasks.map((t, i) => `${i + 1}. ${t.text}${t.items ? ': ' + t.items.slice(0, 3).map((x) => x.q.replace(/\s*=$/, '')).join(', ') + (t.items.length > 3 ? ' …' : '') : ''}`).join('\n');
  say(`Ich mache ein Übungsblatt „${title}“ mit Lösungsblatt in ${subj.name}, Mappe „Übungen von Big Boy“.\n${preview}\n${sure ? 'Alle Lösungen sind gerechnet.' : 'Die Lösungen kommen von der KI, prüf sie bitte.'}`, [row(
    btn('Ja, anlegen', async (e) => {
      e.currentTarget.disabled = true;
      const books = await db.listBooks(subj.id);
      let book = books.find((b) => b.title === 'Übungen von Big Boy');
      if (!book) book = await db.addBook({ subjectId: subj.id, title: 'Übungen von Big Boy', kind: 'folder' });
      const M = await import('./morework.js');
      const { first } = await M.createSheet(tasks, { title, sub: subj.name, bookId: book.id });
      say(`Fertig. Ich öffne das Blatt.`);
      if (window.innerWidth < 700) close();
      await app.openBookAt(book, subj, first);
    }, true),
    btn('Nein', (e) => { e.currentTarget.parentNode.remove(); say('Okay, dann nicht.'); }))]);
}

// Öffnen: Fach, Buch, Funktion, Spiel
async function openThing(q) {
  q = q.replace(/^(das|die|den|mein(en|e)?)\s+/, '').trim();
  const [subjects, books] = await Promise.all([db.listSubjects(), db.listAllBooks()]);
  const s = subjects.find((x) => norm(x.name) === q) || subjects.find((x) => norm(x.name).startsWith(q) || q.startsWith(norm(x.name)));
  const b = books.find((x) => norm(x.title) === q) || books.find((x) => norm(x.title).includes(q));
  const feats = (await app.features()).filter((f) => true);
  const { matchFeatures } = await import('./nav.js');
  const SYN = { taschenrechner: 'rechner', rechenmaschine: 'rechner', plotter: 'funktionen', graph: 'funktionen', graphen: 'funktionen', timer: 'fokus', periodensystem: 'chemie', pse: 'chemie', formelsammlung: 'formeln', noten: 'noten', stundenplan: 'stundenplan', hausaufgabe: 'hausaufgaben', vokabeln: 'lernkarten', karteikarten: 'lernkarten' };
  const q2 = q.split(/\s+/).map((w) => SYN[w] || w).join(' ');
  let f = matchFeatures(feats, q2)[0] || matchFeatures(feats, q)[0];
  if (!f) for (const w of q2.split(/\s+/).filter((w) => w.length > 3)) { f = matchFeatures(feats, w)[0]; if (f) break; }
  const done = () => { if (window.innerWidth < 700) close(); };
  if (s && (!b || norm(s.name) === q)) { app.go({ view: 'subject', subject: s }); say(`„${s.name}“ ist offen.`); return done(); }
  if (b) { const subj = subjects.find((x) => x.id === b.subjectId); app.go({ view: 'book', book: b, subject: subj }); say(`„${b.title}“ ist offen.`); return done(); }
  if (f) { f.run(); say(`„${f.name}“ ist offen.`); return done(); }
  say(`„${q}“ habe ich nicht gefunden. Probier „Such ${q}“, dann suche ich auf allen Seiten.`);
}

// Suchen auf allen Seiten
async function search(q) {
  const [pages, books] = await Promise.all([db.listAllPages(), db.listAllBooks()]);
  const bm = new Map(books.map((b) => [b.id, b]));
  const nq = norm(q);
  const hits = pages.filter((p) => norm([p.tags, p.ocr, p.textBoxes, p.aiText, p.ink].filter(Boolean).join(' ')).includes(nq)).slice(0, 8);
  if (!hits.length) return say(`Zu „${q}“ habe ich auf keiner Seite etwas gefunden. (Ich finde nur Text, den die App schon erkannt hat.)`);
  const subjects = await db.listSubjects();
  say(`Gefunden auf ${hits.length} ${hits.length === 1 ? 'Seite' : 'Seiten'}:`, [h('div.bbhits', null, ...hits.map((p) => {
    const b = bm.get(p.bookId);
    return h('button.bbhit', { on: { click: async () => { const all = await db.listPages(p.bookId); await app.openBookAt(b || { id: p.bookId, title: 'Eingang' }, subjects.find((s) => b && s.id === b.subjectId), all.find((x) => x.id === p.id)); if (window.innerWidth < 700) close(); } } },
      h('b', { text: b ? b.title : 'Eingang' }), h('small', { text: `Seite ${(p.index || 0) + 1}` }));
  }))]);
}

// Erklären: mit offenem Blatt die Bild-KI, sonst die Text-KI
async function explain(text) {
  const p = await currentPage();
  const T = await import('./topics.js');
  const topic = T.findTopic(text);
  if (p) {
    const V = await import('./visionai.js');
    if (await V.visionDownloaded()) {
      const w = thinking('Ich schaue mir das Blatt an …');
      let ans = '';
      try { ans = await V.ask(await V.pageImage(p), `Du bist Big Boy, ein freundlicher Nachhilfe-Lehrer für einen Schüler. Schau dir dieses Arbeitsblatt genau an. Frage des Schülers: „${text}“. Erkläre kurz, einfach und Schritt für Schritt auf Deutsch, so wie es auf dem Blatt gemacht wird, mit einem kleinen Beispiel. Höchstens 10 Zeilen.`, { maxTokens: 500, temperature: 0.3, onProgress: w.set }); }
      finally { w.done(); await V.unloadVision(); }
      say(ans || 'Dazu ist mir leider nichts eingefallen.', ans ? [h('small.bbnote', { text: 'Von der KI erklärt. Kann Fehler haben.' }), row(btn('Beispiel aufs Blatt', () => example(text)))] : []);
      return;
    }
  }
  if (topic && !p) {
    const ex = T.exampleFor(topic);
    if (ex) say(`Zu ${topic.title} ein gerechnetes ${ex}`);
  }
  return freeChat(text, !!p);
}

async function freeChat(text, wantedVision = false) {
  const A = await import('./localai.js');
  const sup = await A.aiSupport();
  if (!sup.ok) return say('Freie Fragen kann ich hier nicht beantworten: ' + sup.why + ' Befehle wie „Öffne Mathe“ gehen trotzdem. Schreib „Was kannst du?“.');
  if (!(await A.isDownloaded())) {
    return say((wantedVision ? 'Um das Blatt anzusehen, brauche ich die Bild-KI. ' : '') + 'Für freie Fragen brauche ich die Text-KI (ca. 1 GB, einmalig, dann offline). Lade sie in den KI-Einstellungen.', [row(btn('KI-Einstellungen', async () => (await import('./autocards.js')).aiSettingsSheet()))]);
  }
  history.push({ role: 'user', content: text });
  while (history.length > 8) history.shift();
  const w = thinking();
  let ans = '';
  try {
    ans = await A.chat([{ role: 'system', content: 'Du bist Big Boy, ein freundlicher, geduldiger Nachhilfe-Lehrer in einer Lern-App für einen Schüler. Antworte kurz, einfach und auf Deutsch. Erkläre Schritt für Schritt mit einem kleinen Beispiel. Wenn du dir nicht sicher bist, sag das ehrlich. Korrigiere keine Rechtschreibung.' }, ...history], { maxTokens: 500, onProgress: w.set });
  } finally { w.done(); }
  history.push({ role: 'assistant', content: ans });
  say(ans || 'Dazu fällt mir gerade nichts ein.', [h('small.bbnote', { text: 'Von der KI. Kann Fehler haben.' })]);
}
