// Ordnung für lose Arbeitsblätter: Eingang Blatt für Blatt einsortieren (mit Vorschlag fürs Fach),
// und in Mappen nach Datum gruppieren.
import * as db from './db.js';
import { $, h, icon, toast, plural, confirmSheet } from './ui.js';
import { getTimetable } from './school.js';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY = 864e5;
const mins = (hhmm) => { const [a, b] = String(hhmm).split(':').map(Number); return a * 60 + b; };
export const fmtDay = (t) => { const d = new Date(t); return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`; };

// Stichwörter je Fach (für Seiten mit erkanntem Text)
const KEYS = {
  mathe: ['funktion', 'gleichung', 'berechne', 'dreieck', 'winkel', 'prozent', 'bruch', 'term', 'parabel', 'graph', 'lösung', 'zahl', 'fläche', 'volumen', 'wahrscheinlichkeit', 'satz des', 'koordinat'],
  deutsch: ['gedicht', 'erörterung', 'grammatik', 'text', 'autor', 'erzähl', 'roman', 'satzglied', 'nomen', 'verb', 'adjektiv', 'interpretation', 'inhaltsangabe', 'kommasetzung', 'rechtschreib'],
  englisch: [' the ', ' and ', ' you ', ' is ', ' are ', ' with ', ' what ', 'exercise', 'vocabulary', 'unit'],
  französisch: [' le ', ' la ', ' les ', ' est ', ' je ', ' tu ', ' nous ', ' vous ', 'exercice', 'vocabulaire'],
  spanisch: [' el ', ' los ', ' es ', ' yo ', ' usted ', 'ejercicio'],
  latein: [' est ', ' et ', ' non ', 'lektion', 'deklination', 'konjugation', 'übersetze'],
  biologie: ['zelle', 'photosynthese', 'organ', 'pflanze', 'tier', 'enzym', 'dna', 'blut', 'ökosystem', 'evolution', 'nerv', 'bakterie'],
  chemie: ['reaktion', 'atom', 'molekül', 'säure', 'base', 'element', 'ion', 'oxid', 'stoff', 'formel', 'periodensystem', 'lösung'],
  physik: ['kraft', 'energie', 'geschwindigkeit', 'spannung', 'strom', 'widerstand', 'masse', 'beschleunigung', 'welle', 'newton', 'joule', 'volt'],
  geschichte: ['jahrhundert', 'krieg', 'kaiser', 'revolution', 'reich', 'mittelalter', 'antike', 'quelle', 'weimarer', 'könig'],
  erdkunde: ['klima', 'kontinent', 'karte', 'stadt', 'bevölkerung', 'landwirtschaft', 'vulkan', 'gebirge', 'fluss', 'wirtschaft'],
  politik: ['demokratie', 'bundestag', 'wahl', 'gesetz', 'grundgesetz', 'partei', 'regierung', 'gesellschaft'],
  religion: ['bibel', 'gott', 'glaube', 'kirche', 'ethik', 'moral', 'religion'],
  informatik: ['algorithmus', 'programm', 'variable', 'schleife', 'daten', 'computer', 'code'],
  musik: ['note', 'takt', 'rhythmus', 'komponist', 'tonleiter', 'melodie'],
  kunst: ['farbe', 'bild', 'künstler', 'perspektive', 'malerei', 'skulptur'],
};
const ALIAS = { bio: 'biologie', ma: 'mathe', mathematik: 'mathe', de: 'deutsch', en: 'englisch', english: 'englisch', franz: 'französisch', geo: 'erdkunde', geografie: 'erdkunde', geographie: 'erdkunde', sozialkunde: 'politik', powi: 'politik', gemeinschaftskunde: 'politik', ethik: 'religion', reli: 'religion', info: 'informatik', ch: 'chemie', ph: 'physik', ge: 'geschichte' };
const keyOf = (name) => { const n = name.toLowerCase().trim(); return KEYS[n] ? n : ALIAS[n] || Object.keys(KEYS).find((k) => n.startsWith(k.slice(0, 4))) || null; };

// Vorschlag fürs Fach: 1. Stundenplan zur Scan-Zeit, 2. Stichwörter im erkannten Text
export function suggestSubject(page, { tt, subjects }) {
  const t = new Date(page.created || Date.now());
  if (tt && tt.cells) {
    const d = (t.getDay() + 6) % 7, m = t.getHours() * 60 + t.getMinutes();
    if (d < (tt.days || 5)) {
      for (let p = 0; p < tt.periods.length; p++) {
        const per = tt.periods[p], cell = tt.cells[`${d}-${p}`];
        if (!cell || !cell.subjectId) continue;
        // während der Stunde oder bis 10 Minuten danach
        if (mins(per.s) <= m && m <= mins(per.e) + 10) {
          const s = subjects.find((x) => x.id === cell.subjectId);
          if (s) return { subjectId: s.id, reason: `Gescannt in der ${p + 1}. Stunde (${s.name} laut Stundenplan)` };
        }
      }
    }
  }
  if (page.ocr) {
    const text = ' ' + page.ocr.toLowerCase().replace(/\s+/g, ' ') + ' ';
    let best = null;
    for (const s of subjects) {
      const k = keyOf(s.name);
      let score = text.includes(s.name.toLowerCase()) ? 3 : 0;
      if (k) for (const w of KEYS[k]) { let i = text.indexOf(w); while (i >= 0) { score++; i = text.indexOf(w, i + w.length); } }
      if (score >= 2 && (!best || score > best.score)) best = { s, score };
    }
    if (best) return { subjectId: best.s.id, reason: `Passt zum Text auf dem Blatt (${best.s.name})` };
  }
  return null;
}

// Überschriften für Mappen: Heute, Diese Woche, Letzte Woche, Monat Jahr
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export function dateGroup(t, now = new Date()) {
  const d = new Date(t), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mon = new Date(start.getTime() - ((start.getDay() + 6) % 7) * DAY);
  if (d >= start) return 'Heute';
  if (d >= mon) return 'Diese Woche';
  if (d >= new Date(mon.getTime() - 7 * DAY)) return 'Letzte Woche';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- Einsortieren ----------
let pos = 0;
export async function renderSorter(ctx) {
  const [all, subjects, books, tt] = await Promise.all([db.listPages(db.INBOX_BOOK), db.listSubjects(), db.listAllBooks(), getTimetable().catch(() => null)]);
  const pages = all.sort((a, b) => a.index - b.index);
  const view = $('view');
  view.textContent = '';
  const again = () => renderSorter(ctx);
  const header = (meta, actions = []) => ctx.setHeader({ back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) }, eyebrow: 'Eingang', title: 'Einsortieren', meta, actions });
  if (!pages.length) {
    header('Alles erledigt');
    view.append(h('section.empty', null, h('div.emptyart', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h('h2', { text: 'Alles einsortiert' }), h('p', { text: 'Im Eingang liegt nichts mehr. Neue Scans landen erst hier und du sortierst sie mit ein paar Tipps ein.' }),
      h('div.emptyactions', null, ctx.btn('Zur Bibliothek', 'left', () => ctx.go({ view: 'library' }), '.primary'))));
    return;
  }
  if (!subjects.length) { header(plural(pages.length, 'Blatt', 'Blätter')); view.append(h('section.empty', null, h('h2', { text: 'Leg zuerst ein Fach an' }), h('p', { text: 'Dann kannst du die Blätter den Fächern zuordnen.' }))); return; }
  pos = Math.max(0, Math.min(pos, pages.length - 1));
  const p = pages[pos];
  const noOcr = pages.filter((x) => x.kind !== 'blank' && x.ocr == null);
  header(`Blatt ${pos + 1} von ${pages.length}`, noOcr.length ? [ctx.btn('Text erkennen', 'search', async () => {
    const { ocrPages } = await import('./ocr.js');
    const { busy } = await import('./ui.js');
    busy(true, 'Texterkennung …');
    try { await ocrPages(noOcr, (t) => { const b = $('busyText'); if (b) b.textContent = t; }); } catch (e) { toast('Texterkennung fehlgeschlagen: ' + e.message, 5000); }
    busy(false); again();
  })] : []);

  const sug = suggestSubject(p, { tt, subjects });
  let last = ''; try { last = localStorage.getItem('sortLast') || ''; } catch (e) { /* egal */ }
  let subjectId = sug ? sug.subjectId : subjects.some((s) => s.id === last) ? last : subjects[0].id;
  let target = null;
  let mark = p.mark || '';

  // Vorschau
  const img = h('img', { alt: 'Blatt' });
  (async () => {
    let blob = p.kind === 'blank' ? null : await db.getImage(p.id);
    if (!blob) blob = await db.getThumb(p.id);
    if (blob) { const u = URL.createObjectURL(blob); img.src = u; img.onload = () => setTimeout(() => URL.revokeObjectURL(u), 1000); }
  })();
  const prev = h('div.sortprev', null, h('div.sortsheet', null, img));

  const subjRow = h('div.chips.left.sortsubj');
  const targetRow = h('div.chips.left.sorttarget');
  const drawTargets = () => {
    const list = books.filter((b) => b.subjectId === subjectId).sort((a, b) => (a.kind === 'folder' ? -1 : 0) - (b.kind === 'folder' ? -1 : 0) || a.title.localeCompare(b.title));
    const folder = list.find((b) => b.kind === 'folder');
    if (!target || !list.some((b) => b.id === target) && target !== '__new') target = folder ? folder.id : '__new';
    targetRow.replaceChildren(
      ...(folder ? [] : [h('button.pchip' + (target === '__new' ? '.on' : ''), { on: { click: () => { target = '__new'; drawTargets(); } } }, icon('folder'), h('span', { text: 'Arbeitsblätter (neue Mappe)' }))]),
      ...list.map((b) => h('button.pchip' + (target === b.id ? '.on' : ''), { on: { click: () => { target = b.id; drawTargets(); } } }, icon(b.kind === 'folder' ? 'folder' : b.kind === 'notebook' ? 'notebook' : 'book'), h('span', { text: b.title }))));
  };
  const drawSubj = () => {
    subjRow.replaceChildren(...subjects.map((s) => h('button.pchip' + (s.id === subjectId ? '.on' : ''), { style: { '--c': s.color }, on: { click: () => { subjectId = s.id; target = null; drawSubj(); drawTargets(); } } },
      h('i'), h('span', { text: s.name }), sug && sug.subjectId === s.id ? h('em.sugtag', { text: 'Vorschlag' }) : null)));
  };
  drawSubj(); drawTargets();
  const markIn = h('input.field', { type: 'text', id: 'sortMark', placeholder: 'z. B. AB Photosynthese', value: mark, autocomplete: 'off' });
  markIn.addEventListener('input', () => { mark = markIn.value; });

  const doSort = async () => {
    let to = target;
    if (to === '__new') { const b = await db.addBook({ subjectId, title: 'Arbeitsblätter', kind: 'folder', paper: 'grid' }); to = b.id; }
    if (mark.trim() !== (p.mark || '')) await db.updatePage(p.id, { mark: mark.trim() || null });
    await db.movePages([p.id], to);
    // In Mappen bleiben die Blätter nach Datum geordnet
    const tb = to === target || target === '__new' ? (books.find((b) => b.id === to) || { kind: 'folder' }) : null;
    if (tb && tb.kind === 'folder') { const ps = await db.listPages(to); await db.setOrder(to, ps.sort((a, b) => (a.created || 0) - (b.created || 0)).map((x) => x.id)); }
    try { localStorage.setItem('sortLast', subjectId); } catch (e) { /* egal */ }
    const s = subjects.find((x) => x.id === subjectId);
    toast(`Einsortiert in ${s ? s.name : 'Fach'}`);
    again();
  };
  const d = new Date(p.created || Date.now());
  const panel = h('div.sortpanel', null,
    h('div.sortmeta', null, h('b', { text: p.kind === 'blank' ? 'Notiz' : 'Scan' }), h('span', { text: `${fmtDay(d)}${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr` })),
    sug ? h('div.sortsug', null, icon('bolt'), h('span', { text: sug.reason })) : h('p.calm.small', { text: noOcr.length ? 'Kein Vorschlag. Mit „Text erkennen“ oben kann die App das Fach am Text erraten.' : 'Kein Vorschlag. Wähle das Fach aus.' }),
    h('p.fieldlabel', { text: 'Fach' }), subjRow,
    h('p.fieldlabel', { text: 'Wohin' }), targetRow,
    h('label.fieldlabel', { for: 'sortMark', text: 'Name (optional, erscheint als Lesezeichen)' }), markIn,
    h('div.sortactions', null,
      h('button.btn.round.danger', { 'aria-label': 'Löschen', title: 'Löschen', on: { click: async () => { if (await confirmSheet('Blatt löschen?', 'Das Blatt wird von diesem Gerät gelöscht.')) { await db.deletePage(p.id); toast('Gelöscht'); again(); } } } }, icon('trash')),
      h('span.rdgap'),
      h('button.btn', { text: 'Überspringen', on: { click: () => { pos = (pos + 1) % pages.length; again(); } } }),
      h('button.btn.primary', { on: { click: doSort } }, icon('select'), h('span', { text: 'Einsortieren' }))));

  const strip = h('div.sortstrip');
  pages.forEach((q, i) => {
    const t = h('img', { alt: '' });
    db.getThumb(q.id).then((b) => { if (b) { const u = URL.createObjectURL(b); t.src = u; t.onload = () => URL.revokeObjectURL(u); } });
    strip.append(h('button.sortmini' + (i === pos ? '.on' : ''), { 'aria-label': `Blatt ${i + 1}`, on: { click: () => { pos = i; again(); } } }, t));
  });
  view.append(h('section.sorter', null, prev, panel), strip);
  const on = strip.querySelector('.on'); if (on) setTimeout(() => { strip.scrollLeft = Math.max(0, on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2); }, 50);
}
