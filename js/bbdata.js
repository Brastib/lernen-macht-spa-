// Big Boy, Teil 2: kennt deine Schuldaten (Hausaufgaben, Arbeiten, Stundenplan, Vertretungsplan, Noten,
// Lernkarten, Erinnerungen, letzte Blätter) und kann sie ändern. Feste Regeln, keine KI.
// Jede Änderung erst nach „Ja“, danach gibt es „Rückgängig“.
import * as db from './db.js';
import { h } from './ui.js';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').trim();
const WDN = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const t0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const dayText = (d) => { const diff = Math.round((d - t0()) / DAY); return (diff === 0 ? 'heute' : diff === 1 ? 'morgen' : diff === 2 ? 'übermorgen' : WDN[d.getDay()][0].toUpperCase() + WDN[d.getDay()].slice(1)) + ` (${d.getDate()}.${d.getMonth() + 1}.)`; };

// ---------- Erkennen: Datum, Uhrzeit, Fach, Stunde, Note ----------
// strict: „bis Montag“ am Montag = nächster Montag
export function parseDay(n, { strict = false } = {}) {
  const now = t0();
  if (/\b(uebermorgen|ubermorgen)\b/.test(n)) return addDays(now, 2);
  if (/\bmorgen\b/.test(n)) return addDays(now, 1);
  if (/\bheute\b/.test(n)) return now;
  let m = n.match(/\bin (\d+|einer|zwei|drei) (tag|tagen|woche|wochen)\b/);
  if (m) { const k = { einer: 1, zwei: 2, drei: 3 }[m[1]] || +m[1]; return addDays(now, /woche/.test(m[2]) ? 7 * k : k); }
  if (/\b(nachste|naechste) woche\b/.test(n)) return addDays(now, 7);
  m = n.match(/\b(\d{1,2})\.\s?(\d{1,2})\.?(?:\s?(\d{2,4}))?(?!\d)/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < addDays(now, -60)) d = new Date(y + 1, +m[2] - 1, +m[1]);
    return d;
  }
  const i = WDN.findIndex((w) => new RegExp(`\\b${w}s?\\b`).test(n));
  if (i >= 0) { let k = (i - now.getDay() + 7) % 7; if (k === 0 && strict) k = 7; return addDays(now, k); }
  return null;
}
export function parseTime(n) {
  const m = n.match(/\b(?:um\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/) || n.match(/\bum\s+(\d{1,2})[:.](\d{2})\b/);
  if (!m || +m[1] > 23) return null;
  return `${pad(+m[1])}:${pad(+(m[2] || 0))}`;
}
const ALIAS = [['mathe', 'mathematik', 'ma'], ['bio', 'biologie'], ['deutsch', 'de'], ['englisch', 'engl', 'en'], ['franzosisch', 'franz', 'franze'], ['erdkunde', 'geo', 'geographie', 'erdi', 'ek'],
  ['politik', 'powi', 'politik und wirtschaft', 'pw'], ['religion', 'reli'], ['geschichte', 'gesch', 'ge'], ['physik', 'phy', 'ph'], ['chemie', 'chem', 'ch'], ['informatik', 'info', 'inf'],
  ['sport'], ['kunst'], ['musik'], ['latein'], ['spanisch'], ['ethik'], ['nachhilfe']];
const word = (k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
export function findSubject(n, subjects) {
  let best = null, bl = 0;
  for (const s of subjects) {
    const sn = norm(s.name);
    const grp = ALIAS.find((g) => g.includes(sn) || g.some((a) => a.length > 3 && sn.startsWith(a)));
    const keys = [sn, ...(grp || []).filter((k) => k.length > 2 || grp[0] === sn)];
    for (const k of keys) if (k.length > bl && word(k).test(n)) { best = s; bl = k.length; }
  }
  return best;
}
export function parsePeriod(n) { const m = n.match(/\b(\d{1,2})\s*\.?\s*(stunde|std)\b/); return m ? +m[1] : null; }

// ---------- Kleine Helfer ----------
let UI = null;   // { say, btn, row, app, thinking, close }
const subjMap = async () => { const s = await db.listSubjects(); return { list: s, map: new Map(s.map((x) => [x.id, x])) }; };
const sname = (map, id) => (map.get(id) || {}).name || 'ohne Fach';
function confirmAct(lines, doIt, { yes = 'Ja, eintragen' } = {}) {
  const b = UI.say(lines);
  const acts = UI.row(
    UI.btn(yes, async () => {
      acts.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        const undo = await doIt();
        await refresh();
        const r = UI.row(UI.btn('Rückgängig', async () => { r.querySelector('button').disabled = true; await undo(); await refresh(); UI.say('Rückgängig gemacht.'); }));
        UI.say('Erledigt.', [r]);
      } catch (e) { UI.say('Ging nicht: ' + (e && e.message || e)); }
    }, true),
    UI.btn('Nein', () => { acts.querySelectorAll('button').forEach((x) => { x.disabled = true; }); UI.say('Okay, nichts geändert.'); }));
  b.append(acts);
}
async function refresh() { try { if (!document.getElementById('editor') || document.getElementById('editor').hidden) await UI.app.render(); } catch (e) { /* egal */ } }

// ---------- Gedächtnis ----------
async function memList() { return ((await db.getMeta('bbmem')) || { id: 'bbmem', notes: [] }).notes; }
async function memSave(notes) { await db.putItems('meta', { id: 'bbmem', notes }); }
export async function memNotes() { return memList(); }

// ---------- Zusammenfassung für die Text-KI (damit sie „alles weiß“) ----------
export async function contextSummary() {
  try {
    const { map } = await subjMap();
    const today = t0();
    const hw = (await db.listHomework()).filter((x) => !x.done).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9'))).slice(0, 8);
    const ex = (await db.listExams()).filter((x) => x.date && parseIso(x.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const notes = await memList();
    const lines = [`Heute ist ${dayText(today)}.`];
    if (hw.length) lines.push('Offene Hausaufgaben: ' + hw.map((x) => `${sname(map, x.subjectId)}: ${x.text.split('\n')[0].slice(0, 60)}${x.due ? ' (bis ' + dayText(parseIso(x.due)) + ')' : ''}`).join('; '));
    if (ex.length) lines.push('Kommende Arbeiten: ' + ex.map((x) => `${x.kind || 'Arbeit'} ${sname(map, x.subjectId)} am ${dayText(parseIso(x.date))}${x.topic ? ' zu ' + x.topic.slice(0, 50) : ''}`).join('; '));
    if (notes.length) lines.push('Das soll ich mir merken: ' + notes.slice(-12).map((x) => x.text).join('; '));
    return lines.join('\n').slice(0, 1600);
  } catch (e) { return ''; }
}

// ---------- Befehle ----------
export async function handleData(text, ui) {
  UI = ui;
  const n = norm(text);
  const q = /^(was|wann|welche|welcher|wie|hab ich|habe ich|gibt es|fallt|faellt|ist)\b|\?$/.test(n);

  // Gedächtnis
  let m = n.match(/^(?:bitte\s+)?merk(?:e)?\s+dir(?:\s*[:,]|\s+dass|\s+bitte)?\s+(.+)$/) || n.match(/^notier(?:e)?\s+dir\s+(.+)$/);
  if (m) { const raw = text.replace(/^.*?(merke?|notiere?)\s+dir(\s*[:,]|\s+dass|\s+bitte)?\s*/i, '').trim() || m[1]; return remember(raw); }
  if (/(was (hast du dir|weisst du) (gemerkt|uber mich|ueber mich|von mir)|was weisst du alles|dein gedachtnis|dein gedaechtnis)/.test(n)) return showMemory();
  m = n.match(/^vergiss\s+(.+)$/); if (m) return forget(m[1]);

  // Überblick
  if (/^(was steht an|was ist los|uberblick|ueberblick|ubersicht fur|zusammenfassung|was muss ich (heute )?(machen|tun))\??$/.test(n)) return overview();

  // Letzte Blätter
  if (/(letzte|letzten|aktuelle|aktuellen|zuletzt|neueste|neuesten).*(blatt|blatter|blaetter|seite|seiten|arbeitsblatt|arbeitsblatter)|woran (hab|habe) ich (zuletzt )?gearbeitet|schau dir meine (blatter|blaetter|seiten)/.test(n)) return recentPages();

  // Erinnerung
  if (/^erinner(e|n)? mich\b/.test(n)) return addReminder(text, n);

  // Vertretungsplan
  if (/(entfall|entfallt|entfaellt|fallt .*aus|faellt .*aus|ausfall|vertretung|vertretungsplan|raumanderung|raumaenderung)/.test(n)) return vplan(n);

  // Stundenplan ändern: „Montag 3. Stunde Mathe (Raum 204)“ / „Dienstag 5. Stunde frei“
  const per = parsePeriod(n), wd = WDN.findIndex((w) => new RegExp(`\\b${w}s?\\b`).test(n));
  if (per && wd >= 0 && !q) return setCell(text, n, wd, per);
  // Stundenplan lesen
  if (/(stundenplan|was (hab|habe|haben) (ich|wir) (heute|morgen|ubermorgen|uebermorgen|am |montag|dienstag|mittwoch|donnerstag|freitag)|welche (stunden|facher|faecher)|wie sieht .*(heute|morgen|montag|dienstag|mittwoch|donnerstag|freitag) aus|wann (hab|habe|haben) (ich|wir) (schule )?(aus|schluss))/.test(n) && !/hausaufgabe/.test(n)) return dayView(n);

  // Hausaufgaben
  if (/(hausaufgabe|hausaufgaben|\bha\b|\bhaus\b)/.test(n) || (/\b(hab|habe|haben|hast|bekommen)\b.*\bauf\b/.test(n) && !q)) {
    if (!/\bbis\b/.test(n) && /(erledigt|geschafft|abhaken|hak .*ab|\b(ist|sind|hab|habe)\b.*\b(fertig|gemacht)\b|\b(fertig|gemacht)\s*[.!]?$)/.test(n)) return hwDone(n);
    if (q || /^(meine |offene |alle )?(hausaufgaben|ha)\??$/.test(n) || /(was|welche).*(auf|hausaufgabe)/.test(n)) return hwList(n);
    return hwAdd(text, n);
  }
  if (/^was (hab|habe|haben) (ich|wir) (noch )?auf/.test(n)) return hwList(n);

  // Arbeiten / Tests
  const EX = /(klassenarbeit|arbeit|test|vokabeltest|referat|praesentation|prasentation|klausur|abgabe)(en|s|e)?\b/;
  if (EX.test(n) && !/(lernkarte|arbeitsblatt)/.test(n)) {
    if (q || /(welche|wann|meine|nachste|naechste|kommende|alle).*(arbeit|test|klausur|praesentation|prasentation|referat)/.test(n) || /^(arbeiten|tests|klassenarbeiten)\??$/.test(n)) return examList(n);
    if (parseDay(n)) return examAdd(text, n);
  }

  // Noten
  if (/(noten|notenschnitt|durchschnitt|schnitt|zeugnis)/.test(n) && !/\bnote\s+[1-6]/.test(n)) return gradeList(n);
  if (/(\bnote\b|\bpunkte\b|\bbekommen\b|\bgeschrieben\b|\bhab (eine|ne|n)\b)/.test(n) && /\b([1-6][+-]?|1[0-5]|[0-9] punkte)\b/.test(n) && !q) return gradeAdd(text, n);

  // Lernkarten fällig / was lernen
  if (/(was soll ich lernen|was muss ich lernen|was (soll|kann) ich (heute )?(uben|ueben|lernen)|karten (fallig|faellig)|fallige|faellige|vokabeln (lernen|uben|ueben)|lernplan)/.test(n)) return learnNow();

  return false;
}

// ---------- Umsetzung ----------
async function remember(raw) {
  const notes = await memList();
  const note = { id: db.newId(), text: raw.replace(/\s+/g, ' ').slice(0, 300), at: Date.now() };
  await memSave([...notes, note].slice(-200));
  UI.say(`Gemerkt: „${note.text}“`, [UI.row(UI.btn('Rückgängig', async (e) => { e.currentTarget.disabled = true; await memSave((await memList()).filter((x) => x.id !== note.id)); UI.say('Wieder vergessen.'); }))]);
  return true;
}
async function showMemory() {
  const notes = await memList();
  const hw = (await db.listHomework()).filter((x) => !x.done).length, ex = (await db.listExams()).filter((x) => x.date && parseIso(x.date) >= t0()).length;
  UI.say(`Ich sehe ${hw} offene Hausaufgaben und ${ex} kommende Arbeiten, deinen Stundenplan, Noten und Blätter.` + (notes.length ? '\nGemerkt hab ich mir:\n' + notes.slice(-15).map((x) => '• ' + x.text).join('\n') : '\nExtra gemerkt hab ich mir noch nichts. Schreib z. B. „Merk dir: Herr Kunz will Hefter mit Deckblatt“.'));
  return true;
}
async function forget(what) {
  const notes = await memList();
  const hit = notes.filter((x) => norm(x.text).includes(what.replace(/^(das|die|den)\s+/, '')));
  if (!hit.length) { UI.say(`Dazu hab ich mir nichts gemerkt.`); return true; }
  confirmAct(`Soll ich das vergessen?\n` + hit.map((x) => '• ' + x.text).join('\n'), async () => {
    await memSave(notes.filter((x) => !hit.includes(x)));
    return async () => memSave([...(await memList()), ...hit]);
  }, { yes: 'Ja, vergessen' });
  return true;
}

async function hwList(n) {
  const { map } = await subjMap();
  const { dueLabel } = await import('./homework.js');
  let hw = (await db.listHomework()).filter((x) => !x.done);
  const d = parseDay(n); const subj = findSubject(n, [...map.values()]);
  if (d) hw = hw.filter((x) => x.due === iso(d));
  if (subj) hw = hw.filter((x) => x.subjectId === subj.id);
  hw.sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  if (!hw.length) { UI.say(d || subj ? 'Dafür hast du nichts offen. 🎉' : 'Du hast keine offenen Hausaufgaben. 🎉'); return true; }
  UI.say(`Offen (${hw.length}):\n` + hw.slice(0, 15).map((x) => `• ${sname(map, x.subjectId)}: ${x.text.split('\n')[0]} · ${dueLabel(x.due).text}`).join('\n'),
    [UI.row(UI.btn('Hausaufgaben öffnen', () => UI.app.go({ view: 'library' })))]);
  return true;
}
async function hwAdd(text, n) {
  const { list, map } = await subjMap();
  if (!list.length) { UI.say('Leg zuerst ein Fach an, dann kann ich Hausaufgaben eintragen.'); return true; }
  const subj = findSubject(n, list);
  const d = parseDay(n, { strict: true }) || addDays(t0(), 1);
  // Aufgabentext: Befehlswörter, Fach und Datum herausnehmen
  let t = text.replace(/^(neue|trag|trage|notier|notiere|schreib|schreibe)\s+(eine?\s+)?/i, '').replace(/\b(hausaufgaben?|HA)\b\s*:?/i, '')
    .replace(/\b(ich\s+)?(hab|habe|haben|wir)\s+(in\s+\w+\s+)?/i, '').replace(/\b(auf|aufbekommen|ein|eintragen|bitte)\b\s*$/i, '')
    .replace(/\b(bis|für|fuer|zum|zu|am)\s+(morgen|übermorgen|heute|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|nächste woche|naechste woche|\d{1,2}\.\s?\d{1,2}\.?(\s?\d{2,4})?)\b/i, '')
    .replace(/\b(morgen|übermorgen)\b/i, '');
  if (subj) t = t.replace(new RegExp(`\\b(in|für|fuer|im)?\\s*${subj.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  t = t.replace(/\s+/g, ' ').replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, '').replace(/\s+(auf|aufbekommen|ein|eintragen|bitte)$/i, '').trim();
  if (!t) { UI.say('Was ist die Aufgabe? Schreib z. B. „Hausaufgabe Mathe S. 54 Nr. 3 bis Freitag“.'); return true; }
  const s = subj || list[0];
  confirmAct(`Neue Hausaufgabe:\n• Fach: ${s.name}${subj ? '' : ' (kein Fach erkannt, bitte prüfen)'}\n• Aufgabe: ${t}\n• Bis: ${dayText(d)}\n• Erinnerung am Abend vorher um 17 Uhr`, async () => {
    const R = await import('./reminders.js');
    const [saved] = await db.putItems('homework', [{ text: t, due: iso(d), subjectId: s.id, done: false }]);
    await R.syncHomeworkReminder(saved, 'eve');
    return async () => { await db.deleteItems('homework', saved.id); await R.syncHomeworkReminder(saved, ''); };
  });
  void map;
  return true;
}
async function hwDone(n) {
  const { list, map } = await subjMap();
  let hw = (await db.listHomework()).filter((x) => !x.done);
  const subj = findSubject(n, list); if (subj) hw = hw.filter((x) => x.subjectId === subj.id);
  const words = n.split(/\s+/).filter((w) => w.length > 3 && !/(hausaufgabe|erledigt|fertig|geschafft|abhaken|gemacht|habe|mathe)/.test(w));
  const scored = hw.map((x) => ({ x, s: words.filter((w) => norm(x.text).includes(w)).length })).sort((a, b) => b.s - a.s || String(a.x.due || '9').localeCompare(String(b.x.due || '9')));
  if (!scored.length) { UI.say('Dazu finde ich keine offene Hausaufgabe.'); return true; }
  const doneIt = (x) => confirmAct(`Als erledigt abhaken?\n• ${sname(map, x.subjectId)}: ${x.text.split('\n')[0]}`, async () => {
    const R = await import('./reminders.js');
    await db.putItems('homework', [{ ...x, done: true }]); await R.syncHomeworkReminder({ ...x, done: true }, 'eve');
    return async () => { await db.putItems('homework', [{ ...x, done: false }]); };
  }, { yes: 'Ja, abhaken' });
  if (scored.length === 1 || scored[0].s > (scored[1] ? scored[1].s : 0)) { doneIt(scored[0].x); return true; }
  UI.say('Welche meinst du?', [h('div.bbhits', null, ...scored.slice(0, 6).map(({ x }) => h('button.bbhit', { on: { click: () => doneIt(x) } }, h('b', { text: sname(map, x.subjectId) }), h('small', { text: x.text.split('\n')[0].slice(0, 50) }))))]);
  return true;
}

async function examList(n) {
  const { list, map } = await subjMap();
  const S = await import('./school.js');
  let ex = (await db.listExams()).filter((x) => x.date && parseIso(x.date) >= t0()).sort((a, b) => a.date.localeCompare(b.date));
  const subj = findSubject(n, list); if (subj) ex = ex.filter((x) => x.subjectId === subj.id);
  if (!ex.length) { UI.say(subj ? `In ${subj.name} ist keine Arbeit eingetragen.` : 'Es ist keine Arbeit eingetragen.'); return true; }
  UI.say('Kommende Arbeiten:\n' + ex.slice(0, 10).map((x) => `• ${x.kind || 'Arbeit'} ${sname(map, x.subjectId)}: ${S.approxLabel(x)} (${S.countdownText(S.daysUntil(x.date))})${x.topic ? ' · ' + x.topic.split('\n')[0].slice(0, 60) : ''}`).join('\n'),
    [UI.row(UI.btn('Arbeiten öffnen', () => UI.app.go({ view: 'exams' })))]);
  return true;
}
async function examAdd(text, n) {
  const { list } = await subjMap();
  const S = await import('./school.js');
  const subj = findSubject(n, list);
  if (!subj) { UI.say('In welchem Fach? Schreib z. B. „Klassenarbeit Mathe am 3.12.“.'); return true; }
  const d = parseDay(n, { strict: true });
  const kind = S.EXAM_KINDS.find((k) => n.includes(norm(k))) || (/praesentation|prasentation/.test(n) ? 'Präsentation' : /\btest\b/.test(n) ? 'Test' : 'Klassenarbeit');
  const tm = text.match(/(?:^|\s)(?:über|ueber|zu|zum|thema:?)\s+(.+)$/i);
  const topic = tm ? tm[1].replace(/\b(am|bis)\b.*$/i, '').trim() : '';
  confirmAct(`Eintragen?\n• ${kind} in ${subj.name}\n• am ${dayText(d)}` + (topic ? `\n• Thema: ${topic}` : ''), async () => {
    const [saved] = await db.putItems('exams', [{ subjectId: subj.id, kind, date: iso(d), topic }]);
    return async () => db.deleteItems('exams', saved.id);
  });
  return true;
}

async function gradeList(n) {
  const { list, map } = await subjMap();
  const S = await import('./school.js');
  const [grades, cfg] = await Promise.all([db.listGrades(), S.gradeCfg()]);
  if (!grades.length) { UI.say('Du hast noch keine Noten eingetragen. Schreib z. B. „Note 2 in Mathe“.'); return true; }
  const subj = findSubject(n, list);
  const ids = subj ? [subj.id] : [...new Set(grades.map((g) => g.subjectId))];
  const lines = ids.map((id) => { const g = grades.filter((x) => x.subjectId === id); const a = S.average(g, cfg, id); return a == null ? null : `• ${sname(map, id)}: Schnitt ${S.fmt1(a)} (${g.length} ${g.length === 1 ? 'Note' : 'Noten'})`; }).filter(Boolean);
  UI.say((subj ? `Noten in ${subj.name}:\n` : 'Deine Schnitte:\n') + (lines.join('\n') || 'Noch kein Schnitt.'), [UI.row(UI.btn('Noten öffnen', () => UI.app.go(subj ? { view: 'gradesubj', subjectId: subj.id } : { view: 'grades' })))]);
  return true;
}
async function gradeAdd(text, n) {
  const { list } = await subjMap();
  const S = await import('./school.js');
  const cfg = await S.gradeCfg();
  const subj = findSubject(n, list);
  if (!subj) { UI.say('In welchem Fach? Schreib z. B. „Note 2- in Mathe“.'); return true; }
  let value = null, label = '';
  if (cfg.scale === 'punkte') { const m = n.match(/\b(1[0-5]|[0-9])\s*(punkte|pkt)?\b/); if (m) { value = +m[1]; label = m[1] + ' Punkte'; } }
  else { const m = n.match(/\b([1-6])\s*([+-])?(?![\d.])/); if (m) { const f = S.NOTEN.find(([k]) => k === m[1] + (m[2] || '')) || S.NOTEN.find(([k]) => k === m[1]); if (f) { value = f[1]; label = f[0]; } } }
  if (value == null) { UI.say('Welche Note? Schreib z. B. „Note 2- in Mathe“.'); return true; }
  const cat = /(mundlich|muendlich|mitarbeit|epo)/.test(n) ? 'muendlich' : /(praesentation|prasentation|referat|vortrag)/.test(n) ? 'praesi' : 'schriftlich';
  const catTxt = { schriftlich: 'schriftlich', muendlich: 'mündlich', praesi: 'Präsentation' }[cat];
  const d = parseDay(n) || t0();
  const lab = /\b(test|klassenarbeit|arbeit|vokabeltest|referat)\b/.exec(n);
  confirmAct(`Note eintragen?\n• ${label} in ${subj.name} (${catTxt})\n• Datum: ${dayText(d)}`, async () => {
    const [saved] = await db.putItems('grades', [{ value, subjectId: subj.id, cat, label: lab ? lab[1][0].toUpperCase() + lab[1].slice(1) : '', weight: 1, date: iso(d) }]);
    return async () => db.deleteItems('grades', saved.id);
  });
  return true;
}

async function vplanInfo() {
  const V = await import('./vplan.js');
  const [cfg, rec] = await Promise.all([V.vplanCfg(), V.vplanCached()]);
  return { V, cfg, rec, by: cfg && cfg.url ? V.entriesByDate(rec && rec.data, cfg.klasse) : null };
}
async function vplan(n) {
  const { V, cfg, rec, by } = await vplanInfo();
  if (!by) { UI.say('Den Vertretungsplan hast du noch nicht eingerichtet. Das geht im Stundenplan.', [UI.row(UI.btn('Stundenplan öffnen', () => UI.app.go({ view: 'timetable' })))]); return true; }
  const d = parseDay(n);
  const days = [...by.entries()].filter(([k, v]) => parseIso(k) >= t0() && (!d || k === iso(d)) && v.list.length).sort(([a], [b]) => a.localeCompare(b));
  const age = rec && rec.at ? ` (Stand: ${V.ageText(rec.at)})` : '';
  if (!days.length) { UI.say((d ? `Für ${dayText(d)} steht nichts im Vertretungsplan` : 'Im Vertretungsplan steht für dich nichts') + age + '.'); return true; }
  UI.say(days.map(([k, v]) => `${V.dayLabel(k)}:\n` + v.list.map((e) => `• ${V.stundeText(e)}. Std: ${V.KIND_LABEL[V.kindOf(e)]}${V.detailText(e) ? ' · ' + V.detailText(e) : ''}`).join('\n')).join('\n') + (age ? '\n' + age.trim() : ''),
    [UI.row(UI.btn('Stundenplan öffnen', () => UI.app.go({ view: 'timetable' })))]);
  return true;
}

async function dayView(n) {
  const { map } = await subjMap();
  const S = await import('./school.js');
  const tt = await S.getTimetable();
  const d = parseDay(n) || t0();
  const di = (d.getDay() + 6) % 7;
  const lines = [];
  if (di >= tt.days) lines.push(`${dayText(d)} ist keine Schule.`);
  else {
    const { V, by } = await vplanInfo();
    const vp = by && by.get(iso(d)) ? by.get(iso(d)).list : [];
    const lessons = [];
    tt.periods.forEach((p, i) => {
      if (p.pause) return;
      const c = tt.cells[`${di}-${i}`];
      const ents = vp.filter((e) => V.periodsOf(e.stunde).includes(i + 1));
      if (!c || !c.subjectId) { if (ents.length) lessons.push(`• ${i + 1}. Std (${p.s}): ${ents.map((e) => V.shortText(e)).join(', ')}`); return; }
      lessons.push(`• ${i + 1}. Std (${p.s}–${p.e}): ${sname(map, c.subjectId)}${c.room ? ', Raum ' + c.room : ''}` + (ents.length ? ' → ' + ents.map((e) => V.shortText(e)).join(', ') : ''));
    });
    lines.push(lessons.length ? `${dayText(d)}:\n` + lessons.join('\n') : `Für ${dayText(d)} ist im Stundenplan nichts eingetragen.`);
  }
  const hw = (await db.listHomework()).filter((x) => !x.done && x.due === iso(d));
  if (hw.length) lines.push('Abgabe: ' + hw.map((x) => `${sname(map, x.subjectId)} (${x.text.split('\n')[0].slice(0, 40)})`).join(', '));
  const ex = (await db.listExams()).filter((x) => x.date === iso(d));
  if (ex.length) lines.push('Achtung: ' + ex.map((x) => `${x.kind || 'Arbeit'} in ${sname(map, x.subjectId)}`).join(', '));
  UI.say(lines.join('\n'), [UI.row(UI.btn('Stundenplan öffnen', () => UI.app.go({ view: 'timetable' })))]);
  return true;
}
async function setCell(text, n, wd, per) {
  const { list, map } = await subjMap();
  const S = await import('./school.js');
  const tt = await S.getTimetable();
  const di = (wd + 6) % 7;
  if (di >= tt.days) { UI.say(`Dein Stundenplan hat nur ${tt.days} Tage.`); return true; }
  const p = per - 1;
  if (!tt.periods[p]) { UI.say(`Dein Stundenplan hat nur ${tt.periods.length} Stunden. Mehr Stunden stellst du im Stundenplan bei den Zeiten ein.`); return true; }
  if (tt.periods[p].pause) { UI.say(`Die ${per}. Stunde ist bei dir eine Pause.`); return true; }
  const key = `${di}-${p}`, old = tt.cells[key] ? { ...tt.cells[key] } : null;
  const clear = /\b(frei|leer|losch|loesch|weg|nichts|entfernen|keine)\b/.test(n.replace(/\d+\s*\.?\s*stunde/, ''));
  const subj = clear ? null : findSubject(n.replace(WDN[wd], ''), list);
  if (!clear && !subj) { UI.say('Welches Fach? Schreib z. B. „Montag 3. Stunde Mathe Raum 204“ oder „Montag 3. Stunde frei“.'); return true; }
  const rm = text.match(/\braum\s+([A-Za-z0-9.\-]+)/i);
  const val = clear ? null : { subjectId: subj.id, room: rm ? rm[1] : (old && old.subjectId === subj.id ? old.room || '' : '') };
  const dayName = WDN[wd][0].toUpperCase() + WDN[wd].slice(1);
  confirmAct(`Stundenplan ändern?\n• ${dayName}, ${per}. Stunde (${tt.periods[p].s}–${tt.periods[p].e})\n• vorher: ${old && old.subjectId ? sname(map, old.subjectId) + (old.room ? ', Raum ' + old.room : '') : 'leer'}\n• neu: ${val ? subj.name + (val.room ? ', Raum ' + val.room : '') : 'leer'}\nGilt jede Woche. Für einen einzelnen Tag nimm den Vertretungsplan.`, async () => {
    const t = await S.getTimetable();
    if (val) t.cells[key] = val; else delete t.cells[key];
    await db.putItems('meta', t);
    return async () => { const t2 = await S.getTimetable(); if (old) t2.cells[key] = old; else delete t2.cells[key]; await db.putItems('meta', t2); };
  }, { yes: 'Ja, ändern' });
  return true;
}

async function addReminder(text, n) {
  const { list } = await subjMap();
  const d = parseDay(n) || t0();
  const time = parseTime(n) || '17:00';
  let t = text.replace(/^erinner(e|n)?\s+mich\s*/i, '').replace(/\b(heute|morgen|übermorgen|uebermorgen|am\s+\w+|um\s+\d{1,2}([:.]\d{2})?\s*(uhr)?|\d{1,2}([:.]\d{2})?\s*uhr|in\s+\d+\s+tagen|\d{1,2}\.\s?\d{1,2}\.?(\s?\d{2,4})?)\b/gi, '')
    .replace(/^\s*(daran,?\s*)?(an|dass|das)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!t) { UI.say('Woran soll ich dich erinnern? Schreib z. B. „Erinner mich morgen um 7 Uhr an Sportsachen“.'); return true; }
  t = t[0].toUpperCase() + t.slice(1);
  const at = new Date(d); const [hh, mm] = time.split(':').map(Number); at.setHours(hh, mm);
  if (at < new Date()) { UI.say(`${dayText(d)} um ${time} ist schon vorbei. Sag mir eine spätere Zeit.`); return true; }
  const subj = findSubject(norm(t), list);
  confirmAct(`Erinnerung eintragen?\n• ${t}\n• ${dayText(d)} um ${time} Uhr\nHinweis: Die App erinnert nur, wenn sie offen ist. Für sicher: in der Liste „In iPad-Kalender eintragen“.`, async () => {
    const [saved] = await db.putItems('reminders', [{ kind: 'frei', text: t, date: iso(d), time, repeat: 'none', subjectId: subj ? subj.id : null, done: false }]);
    return async () => db.deleteItems('reminders', saved.id);
  });
  return true;
}

async function recentPages() {
  const [pages, books, subjects] = await Promise.all([db.listAllPages(), db.listAllBooks(), db.listSubjects()]);
  const bm = new Map(books.map((b) => [b.id, b])), sm = new Map(subjects.map((s) => [s.id, s]));
  const top = pages.filter((p) => bm.has(p.bookId)).sort((a, b) => (b.edited || b.created || 0) - (a.edited || a.created || 0)).slice(0, 6);
  if (!top.length) { UI.say('Du hast noch keine Blätter.'); return true; }
  const when = (ms) => { const d = new Date(ms); const k = Math.round((t0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / DAY); return k === 0 ? 'heute' : k === 1 ? 'gestern' : `vor ${k} Tagen`; };
  const V = await import('./visionai.js');
  const canLook = await V.visionDownloaded();
  UI.say('Deine letzten Blätter:' + (canLook ? ' Tipp auf „Worum geht’s?“, dann schaut die Bild-KI drauf.' : ''), [h('div.bbhits', null, ...top.map((p) => {
    const b = bm.get(p.bookId), s = sm.get(b.subjectId);
    const idx = 0;
    return h('div.bbpage', null,
      h('button.bbhit', { on: { click: async () => { const list = (await db.listPages(b.id)); await UI.app.openBookAt(b, s, Math.max(0, list.findIndex((x) => x.id === p.id))); } } },
        h('b', { text: `${s ? s.name + ' · ' : ''}${b.title}` }), h('small', { text: when(p.edited || p.created) })),
      canLook ? UI.btn('Worum geht’s?', async (e) => { e.currentTarget.disabled = true; await lookAt(p); }) : null);
    void idx;
  }))]);
  return true;
}
async function lookAt(p) {
  const V = await import('./visionai.js');
  const w = UI.thinking('Die Bild-KI schaut sich das Blatt an …');
  try {
    const img = await V.pageImage(p);
    const ans = await V.ask(img, 'Worum geht es auf diesem Blatt? Antworte auf Deutsch in höchstens 3 kurzen Sätzen: Fach, Thema und was zu tun ist.', { maxTokens: 220, onProgress: w.set });
    w.done(); UI.say(ans || 'Ich konnte nichts erkennen.', [h('small.bbnote', { text: 'Von der Bild-KI. Kann Fehler haben.' })]);
  } catch (e) { w.done(); UI.say('Die Bild-KI ging nicht: ' + (e && e.message || e)); }
}

async function learnNow() {
  const { map } = await subjMap();
  const [decks, cards, exams] = await Promise.all([db.listDecks(), db.listCards(), db.listExams()]);
  const now = Date.now();
  const due = decks.map((d) => ({ d, n: cards.filter((c) => c.deckId === d.id && (c.due || 0) <= now).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const soon = exams.filter((x) => x.date && parseIso(x.date) >= t0() && parseIso(x.date) <= addDays(t0(), 14)).sort((a, b) => a.date.localeCompare(b.date));
  const lines = [];
  if (soon.length) lines.push('Bald dran:\n' + soon.map((x) => `• ${x.kind || 'Arbeit'} ${sname(map, x.subjectId)} ${dayText(parseIso(x.date))}${x.topic ? ': ' + x.topic.split('\n')[0].slice(0, 50) : ''}`).join('\n'));
  if (due.length) lines.push('Fällige Lernkarten:\n' + due.slice(0, 6).map((x) => `• ${x.d.title}: ${x.n}`).join('\n'));
  if (!lines.length) lines.push('Gerade ist nichts fällig und keine Arbeit in den nächsten 2 Wochen. Gute Zeit, um Hausaufgaben zu machen oder etwas zu wiederholen.');
  UI.say(lines.join('\n'), [UI.row(...due.slice(0, 2).map((x) => UI.btn(`${x.d.title} lernen`, () => UI.app.go({ view: 'deck', deck: x.d, subject: map.get(x.d.subjectId) }))), ...(soon.length ? [UI.btn('Lernplan', () => UI.app.go({ view: 'plan', examId: soon[0].id }))] : []))]);
  return true;
}

async function overview() {
  await dayView('heute');
  const hw = (await db.listHomework()).filter((x) => !x.done);
  if (hw.length) await hwList(''); else UI.say('Keine offenen Hausaufgaben.');
  await learnNow();
  return true;
}
void WDS;
