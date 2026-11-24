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
  const fab = h('button.bbfab', { 'aria-label': 'Big Boy fragen', title: 'Big Boy fragen', on: { click: toggle } });
  document.body.append(fab);
}

function toggle() { if (panel && !panel.hidden) close(); else open(); }
function close() { if (panel) { panel.hidden = true; document.body.classList.remove('bbopen'); } }
async function open() {
  if (!panel) build();
  panel.hidden = false;
  document.body.classList.add('bbopen');
  renderChips();
  if (!list.childElementCount && !restoreChat()) say('Hi, ich bin Big Boy. Ich kenne deine Hausaufgaben, Arbeiten, Noten, deinen Stunden- und Vertretungsplan und kann sie für dich eintragen. Ich öffne Sachen, mache Übungsblätter und Lernkarten und erkläre dir Blätter. Schreib einfach, was du brauchst.');
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
    : ['Was steht an?', 'Was hab ich auf?', 'Was hab ich morgen?', 'Fällt was aus?', 'Welche Arbeiten kommen?', 'Meine letzten Blätter', 'Binomische Formeln, erstell mir was', 'Was kannst du?'];
  chips.replaceChildren(...sug.map((s) => h('button.bbchip', { text: s, on: { click: () => { input.value = s; submit(); } } })));
}

// ---------- Nachrichten ----------
const CHAT_KEY = 'bbChat';
function saveChat(who, text) {
  try { const a = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); a.push({ who, text: String(text).slice(0, 2000), at: Date.now() }); localStorage.setItem(CHAT_KEY, JSON.stringify(a.slice(-40))); } catch (e) { /* egal */ }
}
function restoreChat() {
  let a = []; try { a = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch (e) { /* egal */ }
  if (!a.length) return false;
  for (const m of a) bubble(m.who === 'me' ? 'me' : 'bot', m.text, [], false);
  list.append(h('div.bbsep', null, h('span', { text: 'Frühere Nachrichten' }), h('button.bbclear', { text: 'Löschen', on: { click: () => { try { localStorage.removeItem(CHAT_KEY); } catch (e) { /* egal */ } list.textContent = ''; history.length = 0; say('Verlauf gelöscht. Was du mir mit „Merk dir“ gesagt hast, weiß ich noch.'); } } })));
  for (const m of a.slice(-8)) history.push({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text });
  return true;
}
function bubble(who, text, extra = [], keep = true) {
  if (keep && text && (who === 'me' || who === 'bot')) saveChat(who, text);
  const lines = text ? String(text).split('\n') : [];
  const b = h('div.bbmsg.' + who, null, ...lines.map((l) => (who.startsWith('bot') ? h('p', null, ...mathNodes(l)) : h('p', { text: l }))), ...extra);
  list.append(b);
  list.scrollTop = list.scrollHeight;
  return b;
}
// **fett** und Brüche wie 3/4 als echte Brüche anzeigen
function mathNodes(line) {
  const out = [];
  for (const part of String(line).split(/(\*\*[^*]+\*\*|(?<![\d/.,])\d{1,4}\/\d{1,4}(?![\d/]))/)) {
    if (!part) continue;
    if (part.startsWith('**')) out.push(h('b', { text: part.slice(2, -2) }));
    else if (/^\d+\/\d+$/.test(part)) { const [a, c] = part.split('/'); out.push(h('span.bbfrac', { 'aria-label': `${a} durch ${c}` }, h('span', { text: a }), h('span', { text: c }))); }
    else out.push(document.createTextNode(part));
  }
  return out;
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
let vocabAt = 0;
async function nlu() {
  const NL = await import('./bbnlu.js');
  if (Date.now() - vocabAt > 60000) {
    vocabAt = Date.now();
    try {
      const [subjects, books, feats] = await Promise.all([db.listSubjects(), db.listAllBooks(), app.features()]);
      NL.setExtraWords([...subjects.map((x) => x.name), ...feats.filter((f) => !f.game).map((f) => f.name)]);
      void books;
    } catch (e) { /* egal */ }
  }
  return NL;
}
const TASK_RE = /\b(?:aufgabe|aufg|nr|nummer)\.?\s*([a-z]?\s?\d{1,2}\s?[a-z]?)\b|\b([a-h]\s?\d{1,2})\b/;
function isTaskHelp(n) {
  if (!TASK_RE.test(n) || /hausaufgabe/.test(n)) return false;
  return /(hilf|hilfe|erklar|erklaer|wie (geht|mache|mach|lose|loese|rechne)|losung|loesung|versteh|kapier|bei (der )?aufgabe|mach (mit mir|mal)|zeig|was (muss|soll) ich)/.test(n) || /^(aufgabe|aufg|nr)\.?\s*[a-z]?\s?\d/.test(n);
}

async function handle(raw, { routed = false } = {}) {
  const NL = await nlu();
  const fx = NL.fixText(raw);
  const text = fx.text, n = fx.n;
  if (fx.fixes.length && !routed) { const me = [...list.querySelectorAll('.bbmsg.me')].pop(); if (me) me.append(h('small.bbread', { text: 'verstanden: ' + fx.fixes.map(([, b]) => b).join(', ') })); }
  const st = NL.smalltalk(n); if (st) return say(st);
  if (/^(hilfe|was kannst du|befehle|wer bist du)/.test(n) || /was kannst du/.test(n)) return help();
  if (isTaskHelp(n)) return helpTask(raw, n);
  // Reine Rechnung („wie viel ist 3/4 + 1/6“, „löse 3x + 5 = 20“): sicher rechnen
  const expr = (raw.match(/[\dx(][\dx\s+\-*/:·^().,=²³]*$/i) || [''])[0].trim();
  if (expr && /\d/.test(expr) && /[+\-*/:·^=²³]/.test(expr)) {
    const M = await import('./mathgen.js');
    const r = M.exactSolutions(expr.replace(/²/g, '^2').replace(/³/g, '^3').replace(/=\s*$/, ''));
    if (r.length) { say('Gerechnet, das stimmt sicher:\n' + r.join('\n'), [row(btn('Erklär mir den Rechenweg', () => explain('Erkläre Schritt für Schritt, wie man ' + expr + ' rechnet.')))]); return; }
  }
  if (!/^(bitte\s+)?(offne|oeffne|starte?|spiel(e)?)\s/.test(n)) {
    const D = await import('./bbdata.js');
    // „Merk dir …“: den Inhalt genau so speichern, wie er geschrieben wurde
    if (await D.handleData(/^(bitte\s+)?(merk|notier)/.test(n) ? raw : text, { say, btn, row, app, thinking, close })) return;
  }
  if (/(lernkarte|karteikarte)/.test(n)) return cards();
  if (/(wie (dieses|das) blatt|mehr aufgaben|aehnliche aufgaben|ahnliche aufgaben|neue aufgaben)/.test(n)) return moreTasks();
  if (/(abschreib|handschrift|lies (mein|das|die))/.test(n)) return transcribe();
  if (/beispiel/.test(n) && /(blatt|hinschreib|schreib|drauf)/.test(n)) return example(text);
  if (/(erstell|mach|gib|generier|bau).*(was|aufgabe|ubung|uebung|blatt|test|training)|(ubungsblatt|uebungsblatt)/.test(n) || (/(erstell|mach mir)/.test(n))) return makeSheet(text);
  const mo = n.match(/^(?:bitte\s+)?(?:offne|oeffne|zeig(?:\s+mir)?|geh(?:e)?\s+(?:zu|in)|starte?|spiel(?:e)?)\s+(.+)$/);
  if (mo) return openThing(mo[1]);
  const ms = n.match(/^(?:such(?:e)?|finde?)\s+(?:nach\s+)?(.+)$/);
  if (ms) return search(ms[1]);
  if (/(erklar|erklaer|was (ist|sind|heisst|bedeutet)|wie (geht|rechne|funktioniert|berechne|lose|loese)|warum|versteh|hilf|formel|rechne|berechne|beweis)/.test(n)) return explain(raw);
  if (routed) return freeChat(raw);
  // Nichts Festes erkannt: die KI übersetzt den Satz in einen Befehl, sonst „Meintest du …?“
  const A = await import('./localai.js');
  const sup = await A.aiSupport();
  const model = sup.ok ? await A.bestDownloaded() : null;
  if (model) {
    const cmd = await routeWithAi(raw, model);
    if (cmd && cmd !== 'CHAT') { say('Ich mache: „' + cmd + '“'); return handle(cmd, { routed: true }); }
    return freeChat(raw);
  }
  const sug = NL.suggest(n, 3);
  say(sug.length ? 'Meintest du das?' : 'Das hab ich nicht verstanden. Probier eins davon oder schreib „Was kannst du?“.', [row(...(sug.length ? sug : ['Was steht an?', 'Was hab ich auf?', 'Was kannst du?']).map((x) => btn(x, () => { input.value = x.replace(/ …$/, ' '); if (!/…$/.test(x)) submit(); else input.focus(); })))]);
  if (sup.ok) say('Mit der Text-KI verstehe ich auch freie Sätze und erkläre ausführlich.', [row(aiLoadBtn())]);
}

// KI: freien Satz in einen festen Befehl übersetzen
async function routeWithAi(raw, model) {
  const A = await import('./localai.js');
  const { EXAMPLES } = await import('./bbnlu.js');
  const w = thinking('Ich überlege, was du meinst …');
  try {
    const out = await A.chat([
      { role: 'system', content: 'Du übersetzt Nachrichten eines Schülers (oft mit Rechtschreibfehlern) in Befehle für eine Lern-App. Erlaubte Befehle (Werte wie Fach, Datum, Text, Uhrzeit ersetzt du durch die aus der Nachricht):\n' + EXAMPLES.map((e) => '- ' + e).join('\n') + '\nAntworte NUR mit genau einem Befehl in dieser Form, auf Deutsch, ohne Erklärung. Wenn die Nachricht eine Wissensfrage, eine Bitte um Erklärung oder einfach Unterhaltung ist, antworte nur mit CHAT.' },
      { role: 'user', content: raw }], { maxTokens: 60, temperature: 0, model, onProgress: w.set });
    const c = out.split('\n')[0].replace(/^[-•„"'\s]+|[“"'\s]+$/g, '').trim();
    return c && c.length < 140 ? (/^chat\b/i.test(c) ? 'CHAT' : c) : 'CHAT';
  } catch (e) { return 'CHAT'; } finally { w.done(); }
}

// Knopf: Text-KI laden (empfiehlt „Beste“ auf starken iPads)
function aiLoadBtn() {
  return btn('Text-KI laden', async (e) => {
    e.currentTarget.disabled = true;
    const A = await import('./localai.js');
    say('Welche Stufe? „Beste“ ist am klügsten (ca. 5 GB, für dein iPad Pro gut). Am besten im WLAN, danach offline.', [row(
      ...Object.entries(A.MODELS).reverse().map(([k, m]) => btn(`${m.label} (${m.size})`, async (ev) => {
        ev.currentTarget.parentElement.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        A.setAiChoice(k);
        const w = thinking('KI wird heruntergeladen …');
        try { await A.getEngine(w.set, k); w.done(); say('Fertig, die KI ist bereit. Frag mich einfach.'); }
        catch (er) { w.done(); say('Laden ging nicht: ' + (er && er.message || er)); }
      }, k === 'beste')))]);
  }, true);
}

function help() {
  say('Das kann ich:\n• „Was hab ich auf?“, „Hausaufgabe Mathe S. 54 Nr. 3 bis Freitag“, „Mathe Hausaufgabe erledigt“\n• „Was hab ich morgen?“, „Fällt was aus?“, „Montag 3. Stunde Mathe Raum 204“\n• „Welche Arbeiten kommen?“, „Klassenarbeit Englisch am 3.12.“, „Note 2- in Mathe“, „Mein Notenschnitt“\n• „Was soll ich lernen?“, „Erinner mich morgen um 7 Uhr an Sportsachen“\n• „Meine letzten Blätter“, „Merk dir: …“, „Was hast du dir gemerkt?“, „Was steht an?“\n• „Öffne Mathe“, „Öffne Taschenrechner“, „Starte Schach“\n• „Such Fotosynthese“ (sucht auf allen Seiten)\n• „Binomische Formeln, erstell mir was“ (Übungsblatt mit Lösungen)\n• Im Blatt: „Erklär mir das“, „Schreib ein Beispiel aufs Blatt“, „Mehr Aufgaben wie dieses Blatt“, „Lernkarten aus dieser Seite“, „Lies meine Handschrift“\n• Sonst frag mich einfach etwas.\nÄnderungen mache ich erst nach deinem „Ja“, und du kannst sie rückgängig machen. Mathe-Aufgaben rechne ich sicher. Was die KI schreibt, kann Fehler haben.');
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
  const NL = await import('./bbnlu.js');
  const cand = [...subjects.map((x) => ({ name: x.name, run: () => app.go({ view: 'subject', subject: x }) })), ...feats.map((x) => ({ name: x.name, run: x.run }))]
    .map((c) => ({ c, s: Math.max(NL.similarity(q, c.name), ...q.split(/\s+/).map((w) => NL.similarity(w, c.name))) })).filter((x) => x.s >= 0.55).sort((a, b) => b.s - a.s).slice(0, 3);
  if (cand.length) return say(`„${q}“ kenne ich nicht. Meintest du:`, [row(...cand.map(({ c }) => btn(c.name, () => { c.run(); say(`„${c.name}“ ist offen.`); done(); })), btn(`Such „${q}“`, () => search(q)))]);
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

// ---------- Blätter lesen ----------
// Welche Seite ist gemeint? Offenes Blatt, offener Leser, offenes Buch, sonst die zuletzt bearbeitete Seite. „Blatt 2“/„Seite 2“ = 2. Seite davon.
async function resolvePage(n) {
  const num = +((n.match(/\b(?:blatt|seite|s\.)\s*(\d{1,3})\b/) || [])[1] || 0);
  const pick = async (bookId, cur) => {
    const pages = await db.listPages(bookId);
    const p = num && pages[num - 1] ? pages[num - 1] : (cur || pages[0]);
    const book = await db.getBook(bookId).catch(() => null);
    return p ? { page: p, label: `${book ? book.title : 'Eingang'}, Seite ${pages.findIndex((x) => x.id === p.id) + 1}` } : null;
  };
  const cur = await currentPage();
  if (cur) return num ? pick(cur.bookId, cur) : pick(cur.bookId, cur);
  const R = await import('./reader.js');
  const rs = R.readerState && R.readerState();
  if (rs && rs.current) { const p = num && rs.pages[num - 1] ? rs.pages[num - 1] : rs.current; return { page: p, label: `${rs.title || 'Leser'}, Seite ${rs.pages.indexOf(p) + 1}` }; }
  const nav = app.nav();
  if (nav.view === 'book' && nav.book) return pick(nav.book.id, null);
  const all = (await db.listAllPages()).sort((a, b) => (b.edited || b.created || 0) - (a.edited || a.created || 0));
  return all[0] ? pick(all[0].bookId, num ? null : all[0]) : null;
}
// Text einer Seite: schon gelesener Text, sonst die Bild-KI (liest auch Handschrift), sonst Texterkennung
async function pageText(p, w) {
  if (p.aiText) return { text: p.aiText, how: 'dem schon gelesenen Text' };
  const V = await import('./visionai.js');
  if (await V.visionDownloaded()) {
    w.set('Ich lese das Blatt (Bild-KI) …');
    try {
      const t = await V.readPage(await V.pageImage(p), w.set);
      if (t) { await db.updatePage(p.id, { aiText: t, aiAt: Date.now() }); p.aiText = t; return { text: t, how: 'der Bild-KI' }; }
    } finally { await V.unloadVision(); }
  }
  let t = [p.ocr, p.textBoxes, p.ink].filter(Boolean).join('\n').trim();
  if (!t && p.kind !== 'blank') {
    w.set('Ich lese den Text auf dem Blatt …');
    try { const O = await import('./ocr.js'); await O.ocrWords(p, p.width || 1000, w.set); t = [p.ocr, p.textBoxes, p.ink].filter(Boolean).join('\n').trim(); } catch (e) { /* offline oder kein Bild */ }
  }
  return { text: t, how: 'der Texterkennung (nur Gedrucktes)' };
}
// Eine Aufgabe (A1, Aufgabe 3, 2b …) im Text finden
function findTask(text, label) {
  const lines = String(text).split('\n');
  const L = label.replace(/\s+/g, '').toLowerCase();
  const m = L.match(/^([a-h])?(\d{1,2})([a-h])?$/);
  if (!m) return '';
  const [, pre, num, post] = m;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(`^\\s*(?:[*#]+\\s*)?(?:(?:aufgabe|aufg\\.?|nr\\.?|nummer)\\s*)?${pre ? esc(pre) + '\\s?' : '(?:[a-h]\\s?)?'}${num}\\s*${post ? esc(post) : ''}(?![\\d])\\s*[.):\\-]?`, 'i');
  const anyTask = /^\s*(?:[*#]+\s*)?(?:(?:aufgabe|aufg\.?|nr\.?)\s*[a-h]?\s?\d{1,2}|[a-h]\s?\d{1,2}\b|\d{1,2}\s*[.)])/i;
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) return '';
  let j = i + 1;
  while (j < lines.length && j - i < 40 && !anyTask.test(lines[j])) j++;
  return lines.slice(i, j).join('\n').trim();
}
// Text-KI (beste geladene) oder null
async function textModel() {
  const A = await import('./localai.js');
  const sup = await A.aiSupport();
  return sup.ok ? A.bestDownloaded() : null;
}
const TEACH = 'Du bist Big Boy, ein geduldiger, freundlicher Nachhilfe-Lehrer für einen Schüler (Klasse 7 bis 10). Erkläre AUSFÜHRLICH und Schritt für Schritt auf Deutsch, in einfachen Sätzen:\n1. Worum geht es? (in eigenen Worten)\n2. Was muss man wissen? (Regel oder Formel)\n3. Lösungsweg: jeder Schritt in einer eigenen Zeile, mit allen Zwischenschritten und kurzer Begründung.\n4. Ergebnis\n5. Merksatz (ein Satz)\nSchreibe Formeln mit ², ³, √, · und Brüche als a/b. Kein LaTeX. Wenn der Text vom Blatt unklar ist (Texterkennung kann Fehler haben) oder etwas fehlt, sag das ehrlich. Korrigiere keine Rechtschreibung.';

async function answerWithPage({ question, task, label, page, pageTxt }) {
  const NL = await import('./bbnlu.js');
  const M = await import('./mathgen.js');
  const sure = M.exactSolutions(task || pageTxt).slice(0, 8);
  const model = await textModel();
  const V = await import('./visionai.js');
  let ans = '';
  if (model) {
    const A = await import('./localai.js');
    const w = thinking('Big Boy denkt nach …');
    const ctx = (task ? `Aufgabe ${label} vom Blatt:\n${task}\n\n` : '') + `Text vom ganzen Blatt (zur Info):\n${pageTxt.slice(0, task ? 1800 : 3200)}` + (sure.length ? `\n\nSicher gerechnete Ergebnisse (stimmen garantiert, nutze sie):\n${sure.join('\n')}` : '');
    try { ans = await A.chat([{ role: 'system', content: TEACH }, { role: 'user', content: `${ctx}\n\nFrage des Schülers: ${question}` }], { maxTokens: 1400, temperature: 0.3, model, onProgress: w.set }); }
    finally { w.done(); }
    history.push({ role: 'user', content: (task ? `Aufgabe ${label}: ${task}\n` : '') + question }, { role: 'assistant', content: ans });
    while (history.length > 8) history.shift();
  } else if (await V.visionDownloaded()) {
    const w = thinking('Ich schaue mir das Blatt an …');
    try { ans = await V.ask(await V.pageImage(page), `${TEACH}\n\nSchau dir dieses Arbeitsblatt genau an.${task ? ` Es geht um Aufgabe ${label}: ${task}` : ''}\nFrage des Schülers: „${question}“`, { maxTokens: 1000, temperature: 0.3, onProgress: w.set }); }
    finally { w.done(); await V.unloadVision(); }
  }
  if (!ans) {
    say((sure.length ? 'Sicher gerechnet:\n' + sure.join('\n') + '\n' : '') + 'Für eine ausführliche Erklärung brauche ich die Text-KI.', [row(aiLoadBtn())]);
    return;
  }
  const pretty = NL.prettyMath(ans);
  const acts = [btn('Einfacher erklären', () => freeChat('Erkläre das noch einfacher, mit einem Alltagsbeispiel.')), btn('Nächster Schritt allein?', () => freeChat('Gib mir nur einen Tipp für den ersten Schritt, nicht die Lösung, damit ich es selbst versuche.'))];
  if (editorOpen()) acts.unshift(btn('Lösung aufs Blatt', async (e) => { const el = e.currentTarget; const E = await editor(); if (E.edInsertText(pretty.replace(/\*\*/g, ''))) { el.disabled = true; say('Steht auf dem Blatt. Rückgängig geht mit dem Pfeil oben.'); } }, true));
  say(pretty, [...(sure.length ? [h('small.bbnote', { text: 'Sicher gerechnet: ' + sure.join(' · ') })] : []), h('small.bbnote', { text: 'Von der KI erklärt. Kann Fehler haben.' }), row(...acts)]);
}

// „Hilf mir bei Aufgabe A1 auf Blatt 1“
async function helpTask(raw, n) {
  const m = n.match(TASK_RE);
  const label = (m[1] || m[2] || '').replace(/\s+/g, '').toUpperCase();
  const where = await resolvePage(n);
  if (!where) return say('Ich finde kein Blatt. Scanne oder öffne zuerst das Arbeitsblatt.');
  const w = thinking(`Ich schaue auf ${where.label} …`);
  let got;
  try { got = await pageText(where.page, w); } finally { w.done(); }
  if (!got.text) return say(`Auf ${where.label} kann ich keinen Text lesen. Lade die Bild-KI, dann lese ich auch Handschrift und Bilder.`, [row(btn('KI-Einstellungen', async () => (await import('./autocards.js')).aiSettingsSheet()))]);
  const task = findTask(got.text, label);
  const NL = await import('./bbnlu.js');
  say(task ? `${where.label}, Aufgabe ${label}:\n${NL.prettyMath(task)}` : `Auf ${where.label} finde ich „${label}“ nicht genau. Ich nehme das ganze Blatt.`, [h('small.bbnote', { text: `Gelesen mit ${got.how}. Stimmt die Aufgabe nicht, sag mir die Seite, z. B. „Aufgabe ${label} auf Blatt 2“.` })]);
  return answerWithPage({ question: raw, task, label, page: where.page, pageTxt: got.text });
}

// Erklären: mit Blatt (offen oder zuletzt) liest Big Boy das Blatt, sonst Text-KI
async function explain(text) {
  const n = norm(text);
  const T = await import('./topics.js');
  const topic = T.findTopic(text);
  const aboutSheet = editorOpen() || (await import('./reader.js')).readerOpen() || /\b(blatt|seite|arbeitsblatt|hier|das da|diese)\b/.test(n);
  if (aboutSheet) {
    const where = await resolvePage(n);
    if (where) {
      const w = thinking(`Ich schaue auf ${where.label} …`);
      let got; try { got = await pageText(where.page, w); } finally { w.done(); }
      if (got.text) return answerWithPage({ question: text, task: '', label: '', page: where.page, pageTxt: got.text });
    }
  }
  if (topic) { const ex = T.exampleFor(topic); if (ex) say(`Zu ${topic.title} ein gerechnetes ${ex}`); }
  return freeChat(text);
}

async function freeChat(text) {
  const A = await import('./localai.js');
  const sup = await A.aiSupport();
  if (!sup.ok) return say('Freie Fragen kann ich hier nicht beantworten: ' + sup.why + ' Befehle wie „Was hab ich auf?“ gehen trotzdem. Schreib „Was kannst du?“.');
  const model = await A.bestDownloaded();
  if (!model) return say('Für freie Fragen und ausführliche Erklärungen brauche ich die Text-KI (einmal laden, dann offline).', [row(aiLoadBtn())]);
  history.push({ role: 'user', content: text });
  while (history.length > 8) history.shift();
  const ctx = await (await import('./bbdata.js')).contextSummary();
  const w = thinking();
  let ans = '';
  try {
    ans = await A.chat([{ role: 'system', content: TEACH + '\nBei Fragen zu Terminen und Aufgaben nutze nur diese Infos, erfinde nichts:\n' + ctx }, ...history], { maxTokens: 1200, temperature: 0.4, model, onProgress: w.set });
  } finally { w.done(); }
  history.push({ role: 'assistant', content: ans });
  const NL = await import('./bbnlu.js');
  const pretty = NL.prettyMath(ans);
  const acts = editorOpen() ? [row(btn('Aufs Blatt schreiben', async (e) => { const el = e.currentTarget; const E = await editor(); if (E.edInsertText(pretty.replace(/\*\*/g, ''))) { el.disabled = true; say('Steht auf dem Blatt.'); } }))] : [];
  say(pretty || 'Dazu fällt mir gerade nichts ein.', [h('small.bbnote', { text: 'Von der KI. Kann Fehler haben.' }), ...acts]);
}
