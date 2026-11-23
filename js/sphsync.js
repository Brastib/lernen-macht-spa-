// Hausaufgaben und Arbeiten aus dem Schulportal Hessen automatisch eintragen.
// Daten kommen vom eigenen Worker (siehe vplan.js). Jeder Eintrag wird nur einmal übernommen:
// Was du danach änderst oder löschst, bleibt so (die App merkt sich, was sie schon gesehen hat).
import * as db from './db.js';

const SEEN = 'sphsync';
const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// Fachnamen vereinheitlichen, damit „Mathematik 8b (081M01)“ zu deinem Fach „Mathe“ passt
const ALIAS = [
  ['mathe', 'mathematik', 'm'], ['deutsch', 'd'], ['englisch', 'e', 'en', 'engl'], ['französisch', 'franzoesisch', 'franz', 'f', 'fr'],
  ['latein', 'l', 'la'], ['spanisch', 'spa', 'sp'], ['biologie', 'bio', 'bi'], ['chemie', 'ch'], ['physik', 'ph'],
  ['geschichte', 'g', 'ge', 'ges'], ['erdkunde', 'ek', 'geographie', 'geografie'], ['politik und wirtschaft', 'powi', 'politik', 'pw'],
  ['religion', 'reli', 'rel', 'ev', 'kath', 'evangelische religion', 'katholische religion'], ['ethik', 'eth'],
  ['sport', 'spo'], ['musik', 'mu'], ['kunst', 'ku'], ['informatik', 'info', 'inf'], ['wahlpflicht', 'wahlpflichtunterricht', 'wahlpflichtfach', 'wp', 'wpu'],
  ['darstellendes spiel', 'ds'], ['arbeitslehre', 'al'], ['naturwissenschaften', 'nawi'],
];
const clean = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-zäöüß0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const groupOf = (w) => ALIAS.findIndex((g) => g.includes(w));

// Kursname aus dem Portal → Fach in der App (oder null)
export function matchSubject(courseName, subjects) {
  const c = clean(courseName);
  if (!c) return null;
  // Klassen-/Kurskürzel am Ende weg („mathematik 8b“ → „mathematik“)
  const words = c.split(' ').filter((w) => !/^\d/.test(w) && !/^[a-z]?\d+[a-z]*$/.test(w));
  const head = words.join(' ');
  let best = null, bestScore = 0;
  for (const s of subjects) {
    const n = clean(s.name);
    if (!n) continue;
    let score = 0;
    if (n === head) score = 100;
    else if (head.startsWith(n + ' ') || n.startsWith(head + ' ')) score = 80;
    else if (n.length >= 3 && (head.startsWith(n) || n.startsWith(head))) score = 60;
    else {
      const gs = groupOf(n), gh = [head, words[0]].map(groupOf).find((x) => x >= 0);
      if (gs >= 0 && gs === gh) score = 70;
    }
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

// Fach im Freitext einer Kalender-Meldung finden („Klassenarbeit Mathe 8b“)
function subjectInText(t, subjects) {
  const tokens = new Set(clean(t).split(' '));
  const text = ` ${clean(t)} `;
  let best = null, len = 0;
  for (const s of subjects) {
    const n = clean(s.name);
    const g = ALIAS[groupOf(n)] || [];
    for (const w of new Set([n, ...g])) {
      if (w.length < 2) continue;   // „M“, „D“ … sind zu unsicher
      const hit = w.includes(' ') ? text.includes(` ${w} `) : tokens.has(w);
      if (hit && w.length > len) { best = s; len = w.length; }
    }
  }
  return best;
}

function examKind(t) {
  const x = t.toLowerCase();
  if (/klausur/.test(x)) return 'Klausur';
  if (/präsentation|praesentation/.test(x)) return 'Präsentation';
  if (/referat/.test(x)) return 'Referat';
  if (/vokabel/.test(x)) return 'Vokabeltest';
  if (/abgabe/.test(x)) return 'Abgabe';
  if (/\btest\b|lernkontrolle|leistungskontrolle/.test(x)) return 'Test';
  return 'Klassenarbeit';
}

// Gilt die Meldung für meine Klasse? Wenn eine andere Klasse genannt ist und meine nicht: nein.
function forMyClass(t, klasse) {
  const k = String(klasse || '').trim().toLowerCase();
  if (!k) return true;
  const named = (t.toLowerCase().match(/\b(\d{1,2}\s?[a-z]{0,3})\b/g) || []).map((x) => x.replace(/\s/g, '')).filter((x) => /^\d{1,2}[a-z]{1,3}$/.test(x));
  if (!named.length) return true;
  return named.includes(k.replace(/\s/g, ''));
}

// Nächste Stunde des Fachs nach einem Datum (aus deinem Stundenplan), sonst eine Woche später
function nextLesson(tt, subjectId, fromIso) {
  const from = fromIso ? parseIso(fromIso) : new Date();
  const days = new Set();
  for (const [k, v] of Object.entries((tt && tt.cells) || {})) if (v && v.subjectId === subjectId) days.add(+k.split('-')[0]);
  if (days.size) for (let i = 1; i <= 14; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (days.has((d.getDay() + 6) % 7)) return iso(d);
  }
  return iso(new Date(from.getTime() + 7 * DAY));
}

const hashId = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

export async function syncFromSph(data, cfg) {
  if (!data || cfg.sync === false) return null;
  const { getTimetable } = await import('./school.js');
  const [subjects, tt, seenRec, hwAll, exAll] = await Promise.all([db.listSubjects(), getTimetable(), db.getMeta(SEEN), db.listHomework(), db.listExams()]);
  const seen = new Set((seenRec && seenRec.ids) || []);
  const result = { at: Date.now(), hw: 0, ex: 0, unmatched: [] };
  const known = new Set([...hwAll, ...exAll].map((x) => x.sph).filter(Boolean));
  const today = iso(new Date());
  const minHw = iso(new Date(Date.now() - 21 * DAY));

  for (const it of data.homework || []) {
    const id = 'hw-' + hashId(`${it.course}|${it.date}|${it.text}`);
    if (seen.has(id) || known.has(id)) { seen.add(id); continue; }
    if (it.date && it.date < minHw) { seen.add(id); continue; }   // alt, vermutlich längst erledigt
    const s = matchSubject(it.course, subjects);
    if (!s) { result.unmatched.push({ what: 'Hausaufgabe', name: it.course, text: it.text }); continue; }   // bleibt offen, kommt wieder, sobald das Fach da ist
    const due = nextLesson(tt, s.id, it.date || today);
    await db.putItems('homework', [{ subjectId: s.id, text: it.text + (it.topic ? ` (Thema: ${it.topic})` : ''), due, done: !!it.done, sph: id, src: 'Schulportal' }]);
    seen.add(id); result.hw++;
  }

  for (const e of data.exams || []) {
    const date = String(e.start || '').slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || date < today) continue;
    const id = 'ex-' + (e.id || hashId(`${e.title}|${date}`));
    if (seen.has(id) || known.has(id)) { seen.add(id); continue; }
    const t = `${e.title} ${e.description}`;
    if (!forMyClass(t, cfg.klasse)) { seen.add(id); continue; }
    const s = subjectInText(t, subjects);
    if (!s) { result.unmatched.push({ what: 'Arbeit', name: e.title, text: date.split('-').reverse().join('.') }); continue; }
    const topic = [e.title, e.description].filter(Boolean).join(' · ');
    await db.putItems('exams', [{ subjectId: s.id, kind: examKind(t), date, approx: false, topic, sph: id, src: 'Schulportal' }]);
    seen.add(id); result.ex++;
  }

  const lastAdded = result.hw || result.ex ? { at: result.at, hw: result.hw, ex: result.ex } : (seenRec && seenRec.lastAdded) || null;
  await db.putItems('meta', { id: SEEN, ids: [...seen].slice(-800), last: result, lastAdded });
  return result;
}

export async function lastSync() { const r = await db.getMeta(SEEN); return r && r.last ? { ...r.last, added: r.lastAdded || null } : null; }
