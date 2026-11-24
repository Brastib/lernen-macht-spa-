// Big Boy versteht auch Tippfehler und andere Schreibweisen (LRS-freundlich), ohne KI:
// Wörter, die einem bekannten Befehlswort sehr ähnlich sind (Buchstaben vertauscht, einer fehlt, klingt gleich),
// werden vor dem Erkennen ersetzt. Inhalte (z. B. der Text einer Hausaufgabe) bleiben, wie sie sind.
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

// Befehlswörter in der Form nach norm() (ä → a usw.)
const BASE = `hausaufgabe hausaufgaben stundenplan vertretungsplan vertretung klassenarbeit klassenarbeiten arbeit arbeiten praesentation prasentation referat
vokabeltest vokabeln klausur abgabe erledigt fertig geschafft gemacht abhaken eintragen morgen ubermorgen heute gestern montag dienstag mittwoch donnerstag
freitag samstag sonntag nachste woche stunde stunden erinner erinnere erinnern erinnerung erinnerungen lernkarten lernkarte karteikarten offne oeffne starte
suche such finde notenschnitt durchschnitt noten note mundlich schriftlich entfall fallt ausfall raum raumanderung merk merke vergiss gemerkt letzten letzte
blatter blatt seite seiten arbeitsblatt erklar erklare erklaren erklaer beispiel schreib schreibe erstell erstelle ubung ubungen ubungsblatt aufgabe aufgaben
abschreiben handschrift taschenrechner rechner binomische formeln formel bruchrechnung bruche prozentrechnung prozent gleichungen gleichung potenzen
pythagoras welche wann lernen lerne zeugnis bekommen geschrieben kommen kommt frei loschen spiel spiele schach uberblick ubersicht zusammenfassung
lernplan fallig dieses diese meine meinen mathe mathematik deutsch englisch franzosisch biologie physik chemie geschichte erdkunde politik religion ethik
informatik latein spanisch kunst musik sport nachhilfe danke hallo bitte notenschnitt schnitt`.split(/\s+/).filter(Boolean);

// Klingt gleich: grobe Lautschrift (v/f, ph/f, dt/t, ck/k, ie/i, h nach Vokal, doppelte Buchstaben …)
function sound(w) {
  return w.replace(/ph/g, 'f').replace(/v/g, 'f').replace(/dt|th/g, 't').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/tz/g, 'z')
    .replace(/ie/g, 'i').replace(/([aeiouy])h/g, '$1').replace(/ae/g, 'e').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1');
}
// Damerau-Levenshtein (Vertauschung zählt als 1)
function dist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
const allowed = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

let vocab = new Set(BASE), soundMap = new Map();
export function setExtraWords(words) {
  vocab = new Set([...BASE, ...words.map(norm).flatMap((w) => w.split(/[^a-z0-9]+/)).filter((w) => w.length >= 3)]);
  soundMap = new Map(); for (const v of vocab) { const s = sound(v); if (!soundMap.has(s)) soundMap.set(s, v); }
}
setExtraWords([]);

// Bestes bekanntes Wort zu w (oder null)
export function closest(w) {
  if (w.length < 4 || vocab.has(w) || /\d/.test(w)) return null;
  const s = sound(w);
  if (soundMap.has(s) && s.length >= 4) return soundMap.get(s);
  const max = allowed(w.length);
  if (!max) return null;
  let best = null, bd = max + 1, tie = false;
  for (const v of vocab) {
    if (v.length < 4) continue;
    const x = Math.min(dist(w, v, max), dist(s, sound(v), max));
    if (x < bd) { bd = x; best = v; tie = false; } else if (x === bd && v !== best) tie = true;
  }
  return bd <= max && !tie ? best : null;
}

// Häufige Schreibweisen, die der Abstand allein nicht findet
const ALIAS = { felt: 'fallt', fellt: 'fallt', faelt: 'fallt', falt: 'fallt', wass: 'was', mate: 'mathe', matte: 'mathe', mahte: 'mathe', schnit: 'schnitt', hausi: 'hausaufgabe', hausaufgabn: 'hausaufgaben',
  stundenplahn: 'stundenplan', morgn: 'morgen', moin: 'moin', oefne: 'offne', ofne: 'offne', offen: 'offne', mach: 'mach', wan: 'wann', wellche: 'welche', welsche: 'welche', erinner: 'erinner' };

// Text verbessern: gibt { text, n, fixes:[[alt, neu]] } zurück. Getrennt geschriebene Wörter („Haus aufgabe“) werden zusammengezogen.
export function fixText(text) {
  const parts = String(text).split(/([A-Za-zÄÖÜäöüß]+)/);
  const fixes = [];
  // 1) einzelne Wörter
  for (let i = 1; i < parts.length; i += 2) {
    const w = norm(parts[i]);
    const c = ALIAS[w] || closest(w);
    if (c && c !== w) { fixes.push([parts[i], c]); parts[i] = c; }
  }
  // 2) getrennt geschriebene Wörter zusammenziehen („haus aufgabe“, „noten schnitt“)
  for (let i = 1; i + 2 < parts.length; i += 2) {
    if (!/^\s+$/.test(parts[i + 1]) || !parts[i] || !parts[i + 2]) continue;
    const w = norm(parts[i]), w2 = norm(parts[i + 2]), joined = w + w2;
    if (w.length < 3 || w2.length < 3) continue;
    let hit = vocab.has(joined) ? joined : null;
    if (!hit && joined.length >= 9 && !(vocab.has(w) && vocab.has(w2))) { const c = closest(joined); if (c && c.length >= joined.length - 1) hit = c; }
    if (hit) { fixes.push([parts[i] + ' ' + parts[i + 2], hit]); parts[i] = hit; parts[i + 1] = ''; parts[i + 2] = ''; i += 2; }
  }
  const out = parts.join('');
  return { text: out, n: norm(out).replace(/\s+/g, ' ').trim(), fixes };
}

// Beispiele für „Meintest du …?“
export const EXAMPLES = [
  'Was hab ich auf?', 'Was hab ich morgen?', 'Fällt was aus?', 'Welche Arbeiten kommen?', 'Mein Notenschnitt', 'Was soll ich lernen?',
  'Was steht an?', 'Meine letzten Blätter', 'Was hast du dir gemerkt?', 'Hausaufgabe Mathe S. 54 Nr. 3 bis Freitag', 'Mathe Hausaufgabe erledigt',
  'Klassenarbeit Englisch am 3.12.', 'Note 2 in Mathe', 'Montag 3. Stunde Mathe', 'Erinner mich morgen um 7 Uhr an …', 'Merk dir: …',
  'Öffne Mathe', 'Öffne Stundenplan', 'Öffne Taschenrechner', 'Starte Schach', 'Such Fotosynthese', 'Binomische Formeln, erstell mir was',
  'Erklär mir das Blatt', 'Schreib ein Beispiel aufs Blatt', 'Lernkarten aus dieser Seite', 'Mehr Aufgaben wie dieses Blatt', 'Lies meine Handschrift', 'Was kannst du?',
];
const STOP = new Set(['was', 'ich', 'mir', 'mich', 'mein', 'meine', 'die', 'der', 'das', 'ein', 'eine', 'in', 'am', 'an', 'um', 'zu', 'und', 'hab', 'habe', 'bis', 'mit', 'aus', 'auf', 'von', 'fur', 'dir']);
const toks = (t) => norm(t).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
export function suggest(n, k = 3) {
  const a = toks(n);
  if (!a.length) return [];
  return EXAMPLES.map((e) => {
    const b = toks(e);
    let s = 0;
    for (const w of a) for (const v of b) { if (w === v) s += 2; else if (w.length >= 4 && v.length >= 4 && (w.startsWith(v.slice(0, 4)) || dist(w, v, 2) <= 1)) s += 1; }
    return { e, s };
  }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, k).map((x) => x.e);
}

// Kleine Unterhaltung ohne KI
export function smalltalk(n) {
  if (/^(hi|hallo|hey|moin|servus|guten (morgen|tag|abend)|yo|na)\b[\s!?.]*$/.test(n)) return 'Hi! Was brauchst du? Zum Beispiel „Was hab ich auf?“ oder „Was steht an?“.';
  if (/^(danke|dankeschon|thx|merci|super danke|ok danke)\b/.test(n)) return 'Gern! Sag Bescheid, wenn du noch was brauchst.';
  if (/^(wie gehts|wie geht es dir|was geht)\b/.test(n)) return 'Mir geht’s gut, ich bin bereit. Was steht bei dir an?';
  if (/^(ok|okay|gut|cool|nice|alles klar|passt)[\s!.]*$/.test(n)) return '👍';
  return null;
}

// Ähnlichkeit 0..1 zweier Wörter (für „Meintest du …?“ bei Funktionsnamen)
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(a) || a.startsWith(b)) return 0.85;
  const m = Math.max(a.length, b.length);
  return 1 - Math.min(dist(a, b, m), dist(sound(a), sound(b), m)) / m;
}

// Formeln hübsch: x^2 → x², \frac{a}{b} → a/b, sqrt → √, * → · (für Antworten der KI)
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', 'n': 'ⁿ', 'x': 'ˣ' };
const sup = (t) => [...t].map((c) => SUP[c] || c).join('');
export function prettyMath(s) {
  let t = String(s || '');
  for (let i = 0; i < 3; i++) t = t.replace(/\\(d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, _, a, b) => `${/^[\w.,]+$/.test(a) ? a : '(' + a + ')'}/${/^[\w.,]+$/.test(b) ? b : '(' + b + ')'}`);
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, (m, a) => (/^[\w.,]+$/.test(a) ? '√' + a : '√(' + a + ')'))
    .replace(/\\text\{([^{}]*)\}|\\mathrm\{([^{}]*)\}/g, (m, a, b) => a || b)
    .replace(/\\(cdot|times)/g, '·').replace(/\\div/g, ':').replace(/\\pi/g, 'π').replace(/\\(le|leq)\b/g, '≤').replace(/\\(ge|geq)\b/g, '≥')
    .replace(/\\(neq|ne)\b/g, '≠').replace(/\\approx/g, '≈').replace(/\\pm/g, '±').replace(/\\Rightarrow|\\implies/g, '⇒').replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ').replace(/\\Delta/g, 'Δ').replace(/\\(left|right)/g, '')
    .replace(/\\[()[\]]/g, '').replace(/\$\$?/g, '').replace(/\\,|\\;|\\!/g, ' ')
    .replace(/\^\s*\{([-+]?[0-9nx]+)\}/g, (m, a) => sup(a)).replace(/\^\s*([-+]?[0-9]+|[nx])\b/g, (m, a) => sup(a))
    .replace(/\bsqrt\s*\(/g, '√(').replace(/(\d|\))\s*\*\s*(?=[\d(a-z])/gi, '$1 · ').replace(/[{}]/g, '').replace(/\\/g, '');
  return t.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ');
}
