// Lernkarten aus Markiertem: Was du auf einem Scan mit dem Textmarker markierst, wird zu Karteikarten.
// Ablauf: Texterkennung mit Wort-Positionen → Wörter unter den Markerstrichen → Vorschläge → prüfen → speichern.
import * as db from './db.js';
import { h, icon, toast, busy, sheet, plural } from './ui.js';

// Abstand Punkt–Strecke
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distStroke(px, py, pts) {
  let d = Infinity;
  if (pts.length < 6) return Math.hypot(px - pts[0], py - pts[1]);
  for (let i = 0; i + 5 < pts.length; i += 3) d = Math.min(d, distSeg(px, py, pts[i], pts[i + 1], pts[i + 3], pts[i + 4]));
  return d;
}

// Wörter, die unter einem Markerstrich liegen, zu Textstücken zusammenfassen
export function markedPhrases(words, strokes) {
  const marks = strokes.filter((s) => s.tool === 'marker' && s.pts && s.pts.length >= 3);
  const used = new Set();
  const groups = [];
  for (const st of marks) {
    const hit = [];
    words.forEach((w, i) => {
      const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2, hh = w.y1 - w.y0;
      if (distStroke(cx, cy, st.pts) <= st.size / 2 + hh * 0.35) hit.push(i);
    });
    if (!hit.length) continue;
    const fresh = hit.filter((i) => !used.has(i));
    if (!fresh.length) continue;
    fresh.forEach((i) => used.add(i));
    groups.push(fresh.sort((a, b) => words[a].line - words[b].line || words[a].x0 - words[b].x0));
  }
  // Striche, die direkt aneinander anschließen (gleiche Zeile, nebeneinander), zusammenlegen
  groups.sort((a, b) => words[a[0]].line - words[b[0]].line || words[a[0]].x0 - words[b[0]].x0);
  const merged = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const lw = words[prev[prev.length - 1]], fw = words[g[0]];
      const adj = (lw.line === fw.line && fw.x0 - lw.x1 < (lw.y1 - lw.y0) * 1.2) || (fw.line === lw.line + 1 && g[0] === prev[prev.length - 1] + 1);
      if (adj) { prev.push(...g); continue; }
    }
    merged.push([...g]);
  }
  return merged.map((g) => {
    let text = '';
    g.forEach((i, k) => {
      const w = words[i].text;
      if (k && /-$/.test(text) && words[i].line !== words[g[k - 1]].line) text = text.slice(0, -1) + w;
      else text += (k ? ' ' : '') + w;
    });
    return { text: tidy(text), idx: g };
  }).filter((x) => x.text.length > 1);
}
const tidy = (t) => t.replace(/\s+/g, ' ').replace(/^[„"“»(\[]+|[”"“«)\],;]+$/g, '').trim();

// Satz um die markierten Wörter (für Lückentexte)
function contextOf(words, idx) {
  const lines = new Set(idx.map((i) => words[i].line));
  const first = Math.min(...idx), last = Math.max(...idx);
  // ganze Zeilen nehmen, dann auf den Satz zuschneiden
  const all = words.map((w, i) => ({ ...w, i })).filter((w) => lines.has(w.line) || lines.has(w.line - 1) && w.i > last || lines.has(w.line + 1) && w.i < first);
  let s = all.findIndex((w) => w.i === first), e = all.findIndex((w) => w.i === last);
  const perLine = new Map(); words.forEach((w) => perLine.set(w.line, (perLine.get(w.line) || 0) + 1));
  // rückwärts bis zum Satzanfang; eine kurze Zeile ohne Punkt davor ist meist eine Überschrift
  while (s > 0 && !/[.!?:]$/.test(all[s - 1].text) && !(all[s - 1].line !== all[s].line && perLine.get(all[s - 1].line) <= 3)) s--;
  while (e < all.length - 1 && !/[.!?]$/.test(all[e].text)) e++;
  const part = all.slice(s, e + 1);
  let text = '';
  let blank = false;
  part.forEach((w, k) => {
    const marked = idx.includes(w.i);
    if (marked) { if (!blank) { text += (k ? ' ' : '') + '_____'; blank = true; } return; }
    if (k && /-$/.test(text) && w.line !== part[k - 1].line) text = text.slice(0, -1) + w.text;
    else text += (k ? ' ' : '') + w.text;
  });
  return text.replace(/\s+/g, ' ').trim();
}

// Vorschlag für eine Karte
export function suggestCard(phrase, words) {
  const m = phrase.text.match(/^(.{1,80}?)\s*(?:\s[–—-]\s|\s?[=:→]\s?|\s-\s)\s*(.{1,120})$/);
  if (m && m[1].trim() && m[2].trim()) return { front: tidy(m[1]), back: tidy(m[2]), kind: 'pair' };
  const ctx = words ? contextOf(words, phrase.idx) : '';
  if (ctx && ctx !== '_____' && ctx.replace('_____', '').trim().split(' ').length >= 3) return { front: ctx, back: phrase.text, kind: 'gap' };
  return { front: phrase.text, back: '', kind: 'term' };
}

// ---------- Ablauf im Editor ----------
export async function cardsFromMarks({ page, strokes, pageW }) {
  const marks = strokes.filter((s) => s.tool === 'marker');
  if (page.kind === 'blank') { toast('Das geht auf gescannten Seiten. Markiere dort gedruckten Text mit dem Textmarker.', 4500); return; }
  if (!marks.length) { toast('Markiere zuerst Wörter oder Sätze mit dem Textmarker.', 4000); return; }
  busy(true, 'Text auf der Seite wird erkannt …');
  let words;
  try {
    const { ocrWords } = await import('./ocr.js');
    words = await ocrWords(page, pageW, (t) => { const b = document.getElementById('busyText'); if (b) b.textContent = t; });
  } catch (err) { busy(false); toast('Texterkennung fehlgeschlagen: ' + err.message, 5000); return; }
  busy(false);
  const phrases = markedPhrases(words, strokes);
  if (!phrases.length) { toast('Unter den Markierungen wurde kein gedruckter Text erkannt. Handschrift geht leider nicht.', 5000); return; }
  const items = phrases.map((p) => ({ ...suggestCard(p, words), on: true }));
  await reviewSheet(items, page);
}

async function reviewSheet(items, page) {
  const book = page.bookId ? await db.getBook(page.bookId) : null;
  const subjects = await db.listSubjects();
  let subjectId = book && book.subjectId || (subjects[0] && subjects[0].id);
  if (!subjectId) { toast('Leg zuerst ein Fach an.'); return; }
  const last = (() => { try { return localStorage.getItem('markDeck') || ''; } catch (e) { return ''; } })();
  const res = await sheet(plural(items.length, 'Karte aus Markiertem', 'Karten aus Markiertem'), async (body, close) => {
    const subjSel = h('select.field', { id: 'mcSubj' }, ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
    subjSel.value = subjectId;
    const deckSel = h('select.field', { id: 'mcDeck' });
    const newName = h('input.field', { type: 'text', placeholder: 'Name des neuen Stapels', value: book ? `${book.title}` : 'Markiertes', autocomplete: 'off' });
    const fillDecks = async () => {
      const decks = (await db.listDecks(subjSel.value)).sort((a, b) => a.title.localeCompare(b.title));
      deckSel.replaceChildren(...decks.map((d) => h('option', { value: d.id, text: d.title })), h('option', { value: '__new', text: 'Neuer Stapel …' }));
      deckSel.value = decks.some((d) => d.id === last) ? last : decks.length ? decks[0].id : '__new';
      newName.hidden = deckSel.value !== '__new';
    };
    subjSel.addEventListener('change', fillDecks);
    deckSel.addEventListener('change', () => { newName.hidden = deckSel.value !== '__new'; });
    await fillDecks();
    const list = h('div.mclist');
    const count = h('span');
    const go = h('button.btn.primary', null, icon('cards'), count);
    const upd = () => { const n = items.filter((x) => x.on && x.front.trim() && x.back.trim()).length; count.textContent = n ? `${plural(n, 'Karte', 'Karten')} anlegen` : 'Nichts ausgewählt'; go.disabled = !n; };
    items.forEach((it) => {
      const f = h('textarea.field.mcf', { rows: 2, 'aria-label': 'Vorderseite' }); f.value = it.front;
      const b = h('textarea.field.mcb', { rows: 2, 'aria-label': 'Rückseite', placeholder: it.kind === 'term' ? 'Erklärung oder Übersetzung eintragen' : '' }); b.value = it.back;
      const row = h('div.mcrow' + (it.on ? '' : '.off'), null,
        h('button.hwcheck', { 'aria-label': 'Karte verwenden', 'aria-pressed': String(it.on), on: { click: (e) => { it.on = !it.on; row.classList.toggle('off', !it.on); e.currentTarget.setAttribute('aria-pressed', String(it.on)); upd(); } } }, icon('select')),
        h('div.mcfields', null,
          h('em.mckind', { text: it.kind === 'gap' ? 'Lückentext' : it.kind === 'pair' ? 'Wortpaar' : 'Begriff' }),
          h('label', null, h('small', { text: 'Vorderseite' }), f),
          h('label', null, h('small', { text: 'Rückseite' }), b)));
      f.addEventListener('input', () => { it.front = f.value; upd(); });
      b.addEventListener('input', () => { it.back = b.value; upd(); });
      list.append(row);
    });
    go.addEventListener('click', () => close({ subjectId: subjSel.value, deck: deckSel.value, name: newName.value.trim() }));
    body.append(
      h('p.dlgtext', { text: 'Prüf die Vorschläge kurz. Die Texterkennung kann sich bei einzelnen Buchstaben irren.' }),
      list,
      h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'mcSubj', text: 'Fach' }), subjSel), h('div', null, h('label.fieldlabel', { for: 'mcDeck', text: 'Stapel' }), deckSel)),
      newName,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), go));
    body.classList.add('mcbody');
    upd();
  }, { wide: true });
  if (!res) return;
  let deckId = res.deck;
  if (deckId === '__new') {
    const [d] = await db.putItems('decks', [{ subjectId: res.subjectId, title: res.name || 'Markiertes', lang: '' }]);
    deckId = d.id;
  }
  try { localStorage.setItem('markDeck', deckId); } catch (e) { /* egal */ }
  const cards = items.filter((x) => x.on && x.front.trim() && x.back.trim()).map((x) => ({ deckId, front: x.front.trim(), back: x.back.trim(), box: 0, due: 0, right: 0, wrong: 0, src: page.id }));
  await db.putItems('cards', cards);
  toast(`${plural(cards.length, 'Karte', 'Karten')} angelegt. Du findest sie im Fach unter Lernkarten.`, 4000);
}
