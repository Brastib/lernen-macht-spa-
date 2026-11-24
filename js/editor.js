// Schreib-Ansicht: mit Apple Pencil (oder Finger) auf Blätter und Scans schreiben.
import * as db from './db.js';
import { fillHit } from './paper.js';
import { PAGE_W, A4_H, drawPaper, drawStroke, renderPage, pageHeight, blobToImage, paperLines, fitText, lhOf, lineHeight, textWidthMax, FONT } from './paper.js';
import { makeTool, drawTool, hitTool, findEdge, snapPoint, niceAngle, niceRadius, magnetTool, TOOL_NAMES, KNOB_OFF, MM } from './tools.js';
import { menu, sheet, h as el, toast, busy, promptSheet, shareReady } from './ui.js';
import { compile, mathify, expoInput, supify } from './mathfn.js';
import { axesBox, axesFrame } from './paper.js';
import { detectGaps, textForGap, baselineShift, gapAt } from './gaps.js';

// Geteilte Ansicht: Es gibt zwei Blatt-Bereiche (links/rechts). Die Kennungen der Zeichenflächen
// zeigen immer auf den Bereich, in dem gerade geschrieben wird (pane 0 = links, 1 = rechts).
const PANE_IDS = new Set(['edScroll', 'edPage', 'edBg', 'edInk', 'edLive', 'edTpl', 'edSel']);
let pane = 0, split = false;
const $ = (id) => document.getElementById(pane && PANE_IDS.has(id) ? id + '2' : id);
const COLORS = [
  ['#1d1d1f', 'Graphit'], ['#1f4fbf', 'Blau'], ['#c62f2f', 'Rot'],
  ['#23764a', 'Grün'], ['#f2c230', 'Gelb'], ['#e2679f', 'Rosa'],
];
const SIZES = { pen: [1.8, 3, 5], marker: [14, 22, 32], text: [18, 24, 34] };
const TOOLS = ['pen', 'marker', 'eraser', 'lasso', 'text', 'fill'];
const FANG = 1.8 * MM;          // Fangweite der Karo-Hilfe
const ERASER_R = 10;

let page = null, bg = null, strokes = [], undo = [], redo = [];
let tool = 'pen', color = COLORS[0][0], sizeIdx = 1, markerColor = COLORS[4][0];
let fingerDraws = true, penSeen = false;
let zoom = 1, onCloseCb = null, saveTimer = null, dirty = false;
let cur = null;               // Strich, der gerade gezeichnet wird
let liveFrom = 3;             // ab hier ist der Stift-Strich noch nicht gezeichnet
let rafId = 0;
const touches = new Map();    // Finger zum Schieben/Zoomen
let pinch = null;
let tpl = null;              // angelegtes Mathe-Werkzeug
let tplDrag = null;
let sel = null;              // Lasso-Auswahl { strokes: Set, box: [x0, y0, x1, y1] }
let textEd = null;           // offenes Textfeld { st, isNew, before, ta }
let gapMode = false, gaps = [], gapGroups = new Map(), gapTimer = 0, touchTap = null;
let gridAssist = true;       // Karo-Hilfe: Lineal und gerade Striche rasten an den Linien ein

try { const f = localStorage.getItem('fingerDraws'); if (f !== null) fingerDraws = f === '1'; } catch (e) { /* egal */ }
try { const g = localStorage.getItem('gridAssist'); if (g !== null) gridAssist = g === '1'; } catch (e) { /* egal */ }
// Linien des Papiers, an denen die Karo-Hilfe einrastet (oder null)
const assistLines = () => (page && page.kind === 'blank' && gridAssist ? paperLines(page.paper) : null);

export async function openEditor(p, { onClose } = {}) {
  if (split) endSplit(false);
  pane = 0;
  onCloseCb = onClose; usedSplit = false;
  await loadInto(p);
  $('editor').hidden = false;
  buildPalette();
  layout(true);
  updatePaneHeads();
}

// Lädt ein Blatt in den aktiven Bereich
async function loadInto(p) {
  const [ink, blob] = await Promise.all([db.getInk(p.id), p.kind !== 'blank' ? db.getImage(p.id) : null]);
  const img = blob ? await blobToImage(blob) : null;
  page = p; strokes = ink; bg = img;
  undo = []; redo = []; dirty = false; zoom = 1;
  cur = null; touches.clear(); pinch = null; tpl = null; tplDrag = null; sel = null; textEd = null;
  band = { y0: 0, y1: 0 };
  exitGapMode();
}

async function close() {
  finishStroke();
  snapAllGaps();
  exitGapMode();
  commitText();
  const saves = [flushSave()];
  if (split) withPane(1 - pane, () => saves.push(flushSave()));
  await Promise.all(saves);
  const closed = usedSplit ? null : page;   // null: Bibliothek erneuert alle Vorschaubilder
  if (split) endSplit(false);
  $('editor').hidden = true;
  page = null; bg = null; strokes = [];
  if (onCloseCb) onCloseCb(closed);
}

// ---------- Geteilte Ansicht: zwei Blätter nebeneinander ----------
const stash = [null, null];   // Zustand des gerade nicht aktiven Bereichs
let usedSplit = false;
const grab = () => ({ page, bg, strokes, undo, redo, dirty, zoom, tpl, band });
function put(s) { ({ page, bg, strokes, undo, redo, dirty, zoom, tpl, band } = s); }
const paneEl = (i) => document.querySelector(`#edPanes .edpane[data-pane="${i}"]`);

// Kurz in den anderen Bereich wechseln (ohne Nebenwirkungen), z. B. zum Neuzeichnen beim Scrollen
function withPane(i, fn) {
  if (!split || i === pane) { fn(); return; }
  const mine = grab(), keepSel = sel, old = pane;
  sel = null;
  put(stash[i]); pane = i;
  try { fn(); } finally { stash[i] = grab(); pane = old; put(mine); sel = keepSel; }
}

// Bereich i zum Schreiben auswählen (Werkzeugleiste wirkt dann dort)
function activate(i) {
  if (!split || i === pane) return;
  finishStroke(); commitText(); exitGapMode();
  if (sel) { sel = null; drawSel(); }
  flushSave();
  touches.clear(); pinch = null; tplDrag = null; cur = null;
  stash[pane] = grab();
  pane = i;
  put(stash[i]); stash[i] = null;
  updateToolbar(); updatePaneHeads();
}

async function startSplit() {
  const p2 = await pickPage({ title: 'Zweites Blatt daneben', exclude: page.id, startBook: page.bookId });
  if (!p2 || !page) return;
  finishStroke(); commitText(); exitGapMode();
  if (sel) { sel = null; drawSel(); }
  flushSave();
  split = true; usedSplit = true;
  $('editor').classList.add('split');
  $('edPanes').classList.add('split');
  paneEl(1).hidden = false;
  stash[0] = grab();
  pane = 1;
  await loadInto(p2);
  layout(true);
  $('edScroll').scrollTop = 0;
  withPane(0, () => layout(true));
  updateToolbar(); updatePaneHeads();
}

// Rechtes Blatt schließen; das linke bleibt offen
function endSplit(relayout = true) {
  if (!split) return;
  if (pane === 1) {
    finishStroke(); commitText(); exitGapMode();
    if (sel) { sel = null; drawSel(); }
    flushSave();
    put(stash[0]); pane = 0;
  } else { flushSave(); withPane(1, () => flushSave()); }
  stash[0] = stash[1] = null;
  split = false;
  for (const id of ['edBg2', 'edInk2', 'edLive2']) { const c = document.getElementById(id); c.width = c.height = 1; }
  paneEl(1).hidden = true;
  $('editor').classList.remove('split');
  $('edPanes').classList.remove('split');
  if (relayout) { layout(true); updateToolbar(); updatePaneHeads(); }
}

// Seiten links und rechts tauschen
function swapPanes() {
  if (!split) return;
  finishStroke(); commitText(); exitGapMode();
  if (sel) { sel = null; drawSel(); }
  const o = 1 - pane, mine = grab();
  put(stash[o]); stash[o] = mine;          // Inhalte tauschen, aktiver Bereich bleibt
  layout(true);
  withPane(o, () => layout(true));
  updateToolbar(); updatePaneHeads();
}

// Im Bereich i ein anderes Blatt öffnen
async function showInPane(i, p) {
  activate(i);
  finishStroke(); commitText();
  flushSave();
  await loadInto(p);
  layout(true);
  $('edScroll').scrollTop = 0;
  updateToolbar(); updatePaneHeads();
}

const bookCache = new Map();
async function bookTitle(id) {
  if (id === db.INBOX_BOOK) return 'Eingang';
  if (!bookCache.has(id)) bookCache.set(id, (await db.getBook(id).catch(() => null))?.title || 'Blatt');
  return bookCache.get(id);
}
async function updatePaneHeads() {
  for (const i of [0, 1]) paneEl(i).classList.toggle('active', split && i === pane);
  if (!split) return;
  for (const i of [0, 1]) {
    let pg = null;
    withPane(i, () => { pg = page; });
    if (!pg) continue;
    const list = await db.listPages(pg.bookId);
    const k = list.findIndex((x) => x.id === pg.id);
    const head = paneEl(i).querySelector('.edphead');
    head.querySelector('.edpname').textContent = await bookTitle(pg.bookId);
    head.querySelector('.edpnum').textContent = k >= 0 ? `Seite ${k + 1} von ${list.length}` : '';
    const other = () => { let o = null; withPane(1 - i, () => { o = page; }); return o; };
    const step = (d) => { let j = k + d; if (list[j] && other() && list[j].id === other().id) j += d; return list[j] || null; };
    head.querySelector('[data-act="prev"]').disabled = !step(-1);
    head.querySelector('[data-act="next"]').disabled = !step(1);
    head._step = step;
  }
}
for (const i of [0, 1]) {
  paneEl(i).querySelector('.edphead').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const head = e.currentTarget, act = b.dataset.act;
    if (act === 'close') { endSplit(); return; }
    if (act === 'swap') { swapPanes(); return; }
    if (act === 'prev' || act === 'next') { const p = head._step && head._step(act === 'prev' ? -1 : 1); if (p) showInPane(i, p); return; }
    if (act === 'pick') {
      let mine = null, other = null;
      withPane(i, () => { mine = page; }); withPane(1 - i, () => { other = page; });
      const p = await pickPage({ title: i ? 'Blatt rechts wählen' : 'Blatt links wählen', exclude: other && other.id, current: mine && mine.id, startBook: mine && mine.bookId });
      if (p && (!mine || p.id !== mine.id)) showInPane(i, p);
    }
  });
}

// Auswahl: erst Buch/Heft/Mappe, dann die Seite (mit Vorschaubildern)
async function pickPage({ title, exclude, current, startBook }) {
  const [subjects, books] = await Promise.all([db.listSubjects(), db.listAllBooks()]);
  const subj = new Map(subjects.map((s) => [s.id, s]));
  const order = (b) => [subjects.findIndex((s) => s.id === b.subjectId), b.title || ''];
  books.sort((a, b) => { const [x1, y1] = order(a), [x2, y2] = order(b); return x1 - x2 || y1.localeCompare(y2, 'de'); });
  const places = [{ id: db.INBOX_BOOK, title: 'Eingang', color: 'var(--muted)', kind: 'inbox' },
    ...books.map((b) => ({ id: b.id, title: b.title || 'Ohne Namen', color: subj.get(b.subjectId)?.color || 'var(--muted)', sub: subj.get(b.subjectId)?.name || '', kind: b.kind }))];
  const urls = [];
  const res = await sheet(title, (body, done) => {
    const list = el('div.pickbooks', { role: 'listbox', 'aria-label': 'Bücher und Hefte' });
    const grid = el('div.pickpages');
    let token = 0;
    const show = async (pl) => {
      list.querySelectorAll('.pickbook').forEach((x) => x.classList.toggle('on', x.dataset.id === pl.id));
      const my = ++token;
      grid.replaceChildren(el('p.pickempty', { text: 'Lädt …' }));
      const pages = await db.listPages(pl.id);
      if (my !== token) return;
      grid.replaceChildren();
      if (!pages.length) { grid.append(el('p.pickempty', { text: 'Hier sind noch keine Seiten.' })); return; }
      pages.forEach((p, k) => {
        const busyHere = p.id === exclude, here = p.id === current;
        const img = el('img', { alt: '' });
        const tile = el('button.picktile' + (here ? '.on' : ''), { disabled: busyHere, on: { click: () => done(p) } },
          el('span.pickthumb', null, img),
          el('small', { text: busyHere ? 'schon offen' : here ? `Seite ${k + 1} · offen` : `Seite ${k + 1}` }));
        grid.append(tile);
        db.getThumb(p.id).then((t) => { if (t && my === token) { const u = URL.createObjectURL(t); urls.push(u); img.src = u; } }).catch(() => {});
      });
    };
    for (const pl of places) {
      list.append(el('button.pickbook', { 'data-id': pl.id, style: { '--c': pl.color }, on: { click: () => show(pl) } },
        el('i.dot'), el('span', null, el('b', { text: pl.title }), pl.sub ? el('small', { text: pl.sub }) : null)));
    }
    body.append(el('div.pickcols', null, list, grid));
    show(places.find((x) => x.id === startBook) || places[0]);
    setTimeout(() => list.querySelector('.pickbook.on')?.scrollIntoView({ block: 'nearest' }), 30);
  }, { wide: true });
  for (const u of urls) URL.revokeObjectURL(u);
  return res || null;
}

// ---------- Werkzeugleiste ----------
function buildPalette() {
  const box = $('edColors');
  if (box.children.length) { updateToolbar(); return; }
  COLORS.forEach(([c, name]) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.setProperty('--sw', c);
    b.setAttribute('aria-label', name); b.title = name;
    b.dataset.color = c;
    b.addEventListener('click', () => {
      if (tool === 'marker') markerColor = c;
      else { color = c; if (tool === 'eraser' || tool === 'lasso') setTool('pen'); }
      if (textEd) { textEd.st.color = c; styleText(); }
      updateToolbar();
    });
    box.append(b);
  });
  // Eigene Farbe (Farbwähler)
  const inp = document.createElement('input');
  inp.type = 'color'; inp.value = '#7a5cff'; inp.setAttribute('aria-label', 'Eigene Farbe');
  const lab = document.createElement('label');
  lab.className = 'swatch custom'; lab.title = 'Eigene Farbe'; lab.dataset.custom = '1';
  lab.append(inp);
  inp.addEventListener('input', () => {
    const c = inp.value;
    if (tool === 'marker') markerColor = c;
    else { color = c; if (tool === 'eraser' || tool === 'lasso') setTool('pen'); }
    if (textEd) { textEd.st.color = c; styleText(); }
    updateToolbar();
  });
  box.append(lab);
  updateToolbar();
}

function setTool(t) { if (t !== 'text') commitText(); tool = t; if (t !== 'lasso' && sel) { sel = null; drawSel(); } updateToolbar(); }

function updateToolbar() {
  for (const t of TOOLS) {
    $('ed_' + t).classList.toggle('on', tool === t);
    $('ed_' + t).setAttribute('aria-pressed', tool === t);
  }
  const active = tool === 'marker' ? markerColor : color;
  const known = COLORS.some(([c]) => c === active);
  [...$('edColors').children].forEach((b) => {
    if (b.dataset.custom) { b.classList.toggle('on', tool !== 'eraser' && !known); b.classList.toggle('set', !known); if (!known) b.style.setProperty('--sw', active); return; }
    b.classList.toggle('on', tool !== 'eraser' && b.dataset.color === active);
  });
  [...$('edSizes').children].forEach((b, i) => b.classList.toggle('on', i === sizeIdx));
  $('edTools').classList.toggle('erasing', tool === 'eraser' || tool === 'lasso');
  $('edTools').classList.toggle('texting', tool === 'text');
  $('edTools').classList.toggle('filling', tool === 'fill');
  $('edMath').classList.toggle('on', !!tpl && tpl.type !== 'ruler' && tpl.type !== 'triangle');
  $('edQRuler').classList.toggle('on', !!tpl && tpl.type === 'ruler');
  $('edQTri').classList.toggle('on', !!tpl && tpl.type === 'triangle');
  $('edQRuler').setAttribute('aria-pressed', String(!!tpl && tpl.type === 'ruler'));
  $('edQTri').setAttribute('aria-pressed', String(!!tpl && tpl.type === 'triangle'));
  $('edSelDelete').hidden = !sel;
  $('edUndo').disabled = !undo.length;
  $('edRedo').disabled = !redo.length;
  $('edFinger').classList.toggle('on', fingerDraws);
  $('edFinger').setAttribute('aria-pressed', fingerDraws);
  $('edFingerLabel').textContent = fingerDraws ? 'Finger schreibt' : 'Finger blättert';
  $('edSplit').classList.toggle('on', split);
  $('edSplit').setAttribute('aria-label', split ? 'Geteilte Ansicht beenden' : 'Zweites Blatt daneben');
  $('edSplit').title = split ? 'Rechtes Blatt schließen' : 'Zweites Blatt daneben öffnen';
}

$('ed_pen').addEventListener('click', () => setTool('pen'));
$('ed_marker').addEventListener('click', () => {
  setTool('marker');
  // Einmaliger Tipp: Markiertes auf Scans wird zu Lernkarten
  try {
    if (page && page.kind !== 'blank' && !localStorage.getItem('tipMarkCards')) { localStorage.setItem('tipMarkCards', '1'); toast('Tipp: Was du auf Scans markierst, wird unter „Werkzeuge“ → „Lernkarten aus Markiertem“ zu Karteikarten.', 5500); }
  } catch (err) { /* egal */ }
});
$('ed_eraser').addEventListener('click', () => setTool('eraser'));
$('ed_lasso').addEventListener('click', () => setTool('lasso'));
$('ed_text').addEventListener('click', () => setTool('text'));
$('ed_fill').addEventListener('click', () => {
  setTool('fill');
  try { if (!localStorage.getItem('tipFill')) { localStorage.setItem('tipFill', '1'); toast('Farbeimer: Tippe in eine umrandete Fläche. Jede Farbe geht über den bunten Kreis.', 4500); } } catch (err) { /* egal */ }
});
[...$('edSizes').children].forEach((b, i) => b.addEventListener('click', () => {
  sizeIdx = i;
  if (textEd) { setTextSize(textEd.st, SIZES.text[i]); styleText(); }
  updateToolbar();
}));
$('edUndo').addEventListener('click', doUndo);
$('edRedo').addEventListener('click', doRedo);
$('edDone').addEventListener('click', close);
$('edSplit').addEventListener('click', () => { if (split) endSplit(); else startSplit(); });
// ---------- Arbeitsblatt: Name/Datum einsetzen, als PDF teilen ----------
$('edShare').addEventListener('click', (e) => {
  menu(e.currentTarget, [
    { label: 'Als PDF teilen', icon: 'share', onClick: sharePagePdf },
    { label: 'Name und Datum einsetzen', icon: 'text', onClick: stampName },
    { label: 'Namen ändern', icon: 'edit', onClick: () => { try { localStorage.removeItem('myName'); } catch (err) { /* egal */ } stampName(); } },
    { label: 'Stichworte für die Suche …', icon: 'search', onClick: tagsFlow },
    'sep',
    { label: 'Als Papierflieger falten', icon: 'plane', onClick: planeFlow },
  ]);
});
async function tagsFlow() {
  const pg = page; if (!pg) return;
  const res = await sheet('Stichworte für die Suche', (body, close) => {
    const input = el('textarea.field.tagfield', { rows: 3, id: 'tagField', placeholder: 'z. B. Photosynthese, Zellatmung, Test 12.3.' });
    input.value = pg.tags || '';
    body.append(
      el('p.dlgtext', { text: 'Die Suche findet diese Seite über die Wörter hier. Schreib einfach mit dem Pencil ins Feld, das iPad macht daraus Text (Kritzeln/Scribble).' }),
      input,
      el('div.dlgactions', null,
        el('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        el('button.btn.primary', { text: 'Sichern', on: { click: () => close({ v: input.value.replace(/\s+/g, ' ').trim() }) } })));
    setTimeout(() => input.focus(), 50);
  });
  if (!res) return;
  await db.updatePage(pg.id, { tags: res.v });
  pg.tags = res.v;
  toast(res.v ? 'Stichworte gesichert. Die Suche findet die Seite jetzt.' : 'Stichworte entfernt.');
}
async function planeFlow() {
  finishStroke(); commitText();
  await flushSave();
  const c = renderPage(page, bg, strokes, 720);
  const m = await import('./plane.js');
  await m.paperPlane(c);
}
async function sharePagePdf() {
  finishStroke(); commitText();
  await flushSave();
  busy(true, 'PDF wird erstellt …');
  try {
    const { exportPdf } = await import('./pdfio.js');
    const blob = await exportPdf([page]);
    busy(false);
    const d = new Date();
    const name = `Arbeitsblatt ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.pdf`;
    await shareReady('Arbeitsblatt ist bereit', name, blob, { hint: 'Im Teilen-Menü kannst du es per Mail, AirDrop oder Teams an deine Lehrkraft schicken oder „In Dateien sichern“ wählen.' });
  } catch (err) { busy(false); toast('PDF fehlgeschlagen: ' + err.message, 5000); }
}
async function stampName() {
  commitText();
  let name = '';
  try { name = localStorage.getItem('myName') || ''; } catch (err) { /* egal */ }
  if (!name) {
    name = await promptSheet('Dein Name', { label: 'So steht er auf deinen Arbeitsblättern', placeholder: 'Vorname Nachname', ok: 'Einsetzen' });
    if (!name || !name.trim()) return;
    name = name.trim();
    try { localStorage.setItem('myName', name); } catch (err) { /* egal */ }
  }
  const d = new Date();
  const text = `${name} · ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  const x = PAGE_W - 30 * MM - Math.min(320, text.length * 10), y = 12 * MM;
  const st = { tool: 'text', color, size: 18, text, pts: [x, y, 0, x, y + 24, 0] };
  fitText(st);
  const w = st.pts[3] - st.pts[0];
  if (w > 0 && st.pts[0] + w > PAGE_W - 8 * MM) { const dx = PAGE_W - 8 * MM - w - st.pts[0]; st.pts[0] += dx; st.pts[3] += dx; }
  strokes.push(st); undo.push({ type: 'add', stroke: st }); redo = []; changed(); redrawInk(); updateToolbar();
  toast('Name und Datum stehen oben rechts. Mit dem Lasso kannst du sie verschieben.', 3500);
}
// ---------- Vorlesen und Diktieren ----------
$('edSpeak').addEventListener('click', (e) => {
  menu(e.currentTarget, [
    { label: 'Seite vorlesen', icon: 'speak', onClick: speakPage },
    { label: 'Diktieren: Text einfügen', icon: 'mic', onClick: dictateText },
  ]);
});
async function speakPage() {
  finishStroke(); commitText();
  const own = strokes.filter((x) => x.tool === 'text').sort((a, b) => a.pts[1] - b.pts[1] || a.pts[0] - b.pts[0]).map((x) => x.text);
  let ocr = page.ocr;
  if (page.kind !== 'blank' && ocr == null) {
    busy(true, 'Text auf der Seite wird erkannt …');
    try { const { ocrPages } = await import('./ocr.js'); await ocrPages([page], (t) => { const b = $('busyText'); if (b) b.textContent = t; }); ocr = page.ocr; }
    catch (err) { toast('Texterkennung fehlgeschlagen: ' + err.message, 4000); }
    busy(false);
  }
  const text = [ocr, ...own].filter(Boolean).join('\n\n');
  const { readAloud } = await import('./speech.js');
  readAloud(text, { title: 'Seite vorlesen', emptyHint: page.kind === 'blank' ? 'Auf dieser Seite gibt es noch keinen getippten Text. Handschrift kann die App nicht vorlesen.' : 'Auf dieser Seite wurde kein gedruckter Text gefunden. Handschrift kann die App nicht vorlesen.' });
}
async function dictateText() {
  finishStroke(); commitText();
  const { dictate } = await import('./speech.js');
  const text = await dictate({ title: 'Diktieren' });
  if (!text) return;
  const sc = $('edScroll').getBoundingClientRect(), pr = $('edPage').getBoundingClientRect();
  const k = pr.width / PAGE_W, H = pageHeight(page);
  const x = Math.max(15 * MM, Math.min(PAGE_W - 80 * MM, (sc.left + 40 - pr.left) / k));
  const y = Math.max(12 * MM, Math.min(H - 30 * MM, (sc.top + sc.height * 0.3 - pr.top) / k));
  const st = { tool: 'text', color, size: SIZES.text[sizeIdx] || 18, text, pts: [x, y, 0, x, y + 24, 0] };
  fitText(st);
  strokes.push(st); undo.push({ type: 'add', stroke: st }); redo = []; changed(); redrawInk(); updateToolbar();
  toast('Text eingefügt. Mit dem Lasso kannst du ihn verschieben.', 3000);
}
$('edZoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
$('edZoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
$('edFinger').addEventListener('click', () => {
  fingerDraws = !fingerDraws;
  try { localStorage.setItem('fingerDraws', fingerDraws ? '1' : '0'); } catch (e) { /* egal */ }
  updateToolbar();
});

// ---------- Größe und Zeichnen der Ebenen ----------
function fitWidth() {
  const sc = $('edScroll');
  // Heftseiten: Breite wie bei einem A4-Blatt, auch wenn die Seite nach unten länger wird
  const h = page.kind === 'blank' ? A4_H : pageHeight(page);
  return Math.min(sc.clientWidth - 48, (sc.clientHeight - 48) * PAGE_W / h) || 600;
}

function setZoom(z, rerender = true) {
  zoom = Math.max(0.5, Math.min(4, z));
  layout(rerender);
}

function layout(rerender) {
  if (!page) return;
  const h = pageHeight(page);
  const cssW = Math.round(fitWidth() * zoom);
  const cssH = Math.round(cssW * h / PAGE_W);
  const wrap = $('edPage');
  wrap.style.width = cssW + 'px';
  wrap.style.height = cssH + 'px';
  if (!rerender) return;
  for (const id of ['edTpl', 'edSel']) $(id).setAttribute('viewBox', `0 0 ${PAGE_W} ${h}`);
  drawTool($('edTpl'), tpl);
  drawSel();
  styleText();
  renderBand(true);
}

// Lange Seiten: Die Zeichenflächen decken nur den sichtbaren Bereich (plus Rand) ab, nicht die ganze Seite.
// Sonst würde eine endlose Heftseite den Speicher des iPads sprengen. band = { y0, y1 } in Seiten-Einheiten.
let band = { y0: 0, y1: 0 };
const MAX_PX = 9e6;   // höchstens so viele Pixel pro Zeichenfläche
function renderBand(force) {
  if (!page) return;
  const h = pageHeight(page), wrap = $('edPage'), sc = $('edScroll');
  const cssW = wrap.clientWidth || parseFloat(wrap.style.width) || 1;
  const dpr = window.devicePixelRatio || 1;
  const pxW = Math.min(2600, Math.round(cssW * dpr));
  const k = cssW / PAGE_W;                 // CSS-Pixel pro Seiten-Einheit
  let y0 = 0, y1 = h;
  if (pxW * pxW * h / PAGE_W > MAX_PX) {
    const pr = wrap.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const vTop = (sr.top - pr.top) / k, vH = sr.height / k;
    const want = Math.max(vH * 2.2, Math.min(h, MAX_PX * PAGE_W / (pxW * pxW)));
    const need0 = Math.max(0, vTop - vH * 0.1), need1 = Math.min(h, vTop + vH * 1.1);
    if (!force && band.y0 <= need0 && band.y1 >= need1 && band.y1 - band.y0 > 0) return;
    y0 = Math.max(0, vTop + vH / 2 - want / 2); y1 = Math.min(h, y0 + want); y0 = Math.max(0, y1 - want);
  } else if (!force && band.y0 === 0 && band.y1 === h) return;
  band = { y0, y1 };
  const pxH = Math.max(1, Math.round(pxW * (y1 - y0) / PAGE_W));
  const s = pxW / PAGE_W;
  for (const id of ['edBg', 'edInk', 'edLive']) {
    const c = $(id); c.width = pxW; c.height = pxH;
    c.style.top = (y0 * k) + 'px'; c.style.height = ((y1 - y0) * k) + 'px'; c.style.bottom = 'auto';
    c.getContext('2d').setTransform(1, 0, 0, 1, 0, -y0 * s);
  }
  const bctx = $('edBg').getContext('2d');
  if (bg) { bctx.fillStyle = '#fff'; bctx.fillRect(0, y0 * s, pxW, pxH); bctx.drawImage(bg, 0, 0, pxW, h * s); }
  else drawPaper(bctx, page.paper || 'blank', PAGE_W, h, s);
  redrawInk();
}
// Leinwand leeren (unabhängig vom Ausschnitt)
function wipe(c) { const x = c.getContext('2d'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore(); }
const bandRaf = [0, 0];
for (const i of [0, 1]) {
  document.getElementById(i ? 'edScroll2' : 'edScroll').addEventListener('scroll', () => {
    if (!bandRaf[i]) bandRaf[i] = requestAnimationFrame(() => { bandRaf[i] = 0; if (page && (i === pane || split)) withPane(i, () => renderBand(false)); });
  }, { passive: true });
}

// Endlose Heftseite: Wenn unten geschrieben wird, kommt neues Papier dazu (in halben Seiten).
function contentBottom() {
  let b = 0;
  for (const st of strokes) {
    const p = st.pts || [];
    for (let i = 1; i < p.length; i += 3) if (p[i] > b) b = p[i];
    if (st.tool === 'text') b = Math.max(b, (p[1] || 0) + (st.lh || 40) * (String(st.text || '').split('\n').length + 1));
  }
  return b;
}
function growPage() {
  if (!page || page.kind !== 'blank') return;
  const H = pageHeight(page), b = contentBottom(), step = A4_H / 2;
  if (b < H - A4_H * 0.4) return;
  const nh = Math.ceil((b + A4_H * 0.6) / step) * step;
  if (nh <= H) return;
  page.h = nh;
  db.updatePage(page.id, { h: nh }).catch((e) => console.warn(e));
  const sc = $('edScroll'), top = sc.scrollTop;
  layout(true);
  sc.scrollTop = top;
}
window.addEventListener('resize', () => { if (!page) return; layout(true); if (split) withPane(1 - pane, () => layout(true)); });

const scale = () => $('edInk').width / PAGE_W;

function redrawInk() {
  const c = $('edInk'), ctx = c.getContext('2d');
  wipe(c);
  const s = scale(), y0 = band.y0, y1 = band.y1;
  for (const st of strokes) {
    if (textEd && st === textEd.st) continue;
    if (y0 > 0 || y1 < pageHeight(page)) {
      // nur Striche im Ausschnitt zeichnen (schneller bei langen Seiten)
      const p = st.pts || []; let lo = Infinity, hi = -Infinity;
      for (let i = 1; i < p.length; i += 3) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
      const pad = st.tool === 'text' ? 400 : (st.size || 10) * 4 + 20;
      if (st.tool !== 'fill' && (hi < y0 - pad || lo > y1 + pad)) continue;
    }
    drawStroke(ctx, st, s);
  }
}

function clearLive() {
  wipe($('edLive'));
}

// Zeichnet höchstens einmal pro Bildschirm-Bild (schnell, auch bei langen Strichen).
function scheduleLive() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (!cur || cur.erase) return;
    const ctx = $('edLive').getContext('2d');
    if (cur.tool === 'marker') {
      clearLive();
      drawStroke(ctx, cur, scale());
    } else {
      // Stift: nur die neuen Stücke zeichnen
      drawStroke(ctx, cur, scale(), liveFrom, false);
      liveFrom = Math.max(3, cur.pts.length);
    }
  });
}

// ---------- Stift-Eingabe (Pointer Events: Pencil, Finger, Maus) ----------
function toPage(e) {
  const r = $('edPage').getBoundingClientRect();
  return [
    Math.round(((e.clientX - r.left) / r.width) * PAGE_W * 10) / 10,
    Math.round(((e.clientY - r.top) / r.width) * PAGE_W * 10) / 10,
  ];
}
function pressureOf(e) {
  if (e.pointerType === 'pen') return Math.round((e.pressure || 0.5) * 100) / 100;
  return 0.5;
}

const areas = [document.getElementById('edScroll'), document.getElementById('edScroll2')];
const area = { addEventListener: (t, fn, o) => areas.forEach((a, i) => a.addEventListener(t, (e) => onArea(i, t, e, fn), o)) };
// Ereignisse aus dem anderen Bereich: beim Aufsetzen dorthin wechseln, sonst ignorieren
function onArea(i, t, e, fn) {
  if (i !== pane && t === 'pointerdown') {
    if (!split) return;
    // Handballen im anderen Bereich, während der Pencil schreibt: nicht wechseln
    if (e.pointerType === 'touch' && (cur || touches.size || tplDrag)) return;
    activate(i);
  }
  fn(e);
}

// iPad: Scribble, Lupe und Text-Auswahl abfangen, sonst gehen Pencil-Striche verloren
for (const t of ['touchstart', 'touchmove']) {
  area.addEventListener(t, (e) => { if (page && !e.target.closest('.edtext')) e.preventDefault(); }, { passive: false });
}
area.addEventListener('contextmenu', (e) => e.preventDefault());
area.addEventListener('selectstart', (e) => { if (!e.target.closest('.edtext')) e.preventDefault(); });

area.addEventListener('pointerdown', (e) => {
  if (!page) return;
  if (e.target.closest('.edtext')) return;   // im Textfeld: normal tippen/markieren
  if (textEd) {
    // Tippen daneben schließt das Textfeld
    commitText();
    e.preventDefault();
    return;
  }
  if (e.pointerType === 'pen' && !penSeen) {
    penSeen = true;
    // Wie bei Apple: sobald der Pencil benutzt wird, blättert der Finger nur noch
    if (fingerDraws) { fingerDraws = false; updateToolbar(); }
  }
  const onPage = !!e.target.closest('.edpage');
  const [x, y] = toPage(e);
  const drawsHere = e.pointerType !== 'touch' || fingerDraws;

  // 1) Zweiter Finger auf dem Werkzeug: drehen
  if (tplDrag && tplDrag.mode === 'body' && e.pointerType === 'touch' && tplDrag.type === 'touch' && !tplDrag.id2) {
    tplDrag.id2 = e.pointerId; tplDrag.p2 = [x, y]; tplDrag.p1 = tplDrag.last;
    tplDrag.a0 = tpl.angle; tplDrag.v0 = Math.atan2(y - tplDrag.last[1], x - tplDrag.last[0]);
    e.preventDefault();
    return;
  }

  // 2) Strich an der Kante eines Werkzeugs: einrasten (der Drehknopf hat Vorrang)
  const hit = tpl && onPage && !cur ? hitTool(tpl, x, y) : null;
  let snapEdge = null;
  if (tpl && onPage && hit !== 'knob' && drawsHere && (tool === 'pen' || tool === 'marker')) snapEdge = findEdge(tpl, x, y);

  // 3) Werkzeug anfassen (verschieben, drehen, Radius)
  if (hit && !snapEdge) {
    {
      tplDrag = { mode: hit, id: e.pointerId, type: e.pointerType, start: [x, y], last: [x, y], x0: tpl.x, y0: tpl.y, a0: tpl.angle,
        off: Math.atan2(y - tpl.y, x - tpl.x) * 180 / Math.PI - tpl.angle };
      try { $('edScroll').setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      e.preventDefault();
      return;
    }
  }

  if (tool === 'text' && onPage && !cur && (e.pointerType !== 'touch' || touches.size === 0)) {
    // Textfeld: beim Loslassen öffnen (iPad zeigt die Tastatur nur bei einer echten Berührung)
    cur = { textTap: true, id: e.pointerId, type: e.pointerType, at: [x, y], cx: e.clientX, cy: e.clientY, scrolling: false };
    try { $('edScroll').setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    e.preventDefault();
    return;
  }

  if (tool === 'fill' && onPage && drawsHere && !cur) {
    e.preventDefault();
    fillAt(x, y);
    return;
  }
  if (e.pointerType === 'touch' && !fingerDraws) {
    touchTap = (gapMode || tool === 'fill') && onPage && touches.size === 0 ? { id: e.pointerId, at: [x, y], cx: e.clientX, cy: e.clientY, t: performance.now() } : null;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) startPinch();
    e.preventDefault();
    return;
  }
  if (!onPage) return;
  if (cur) {
    // Handballen während der Pencil schreibt: ignorieren
    if (e.pointerType === 'touch' && cur.type === 'pen') return;
    // Ein altes Ende ging verloren (passiert auf dem iPad manchmal): alten Strich abschließen
    finishStroke();
  }
  try { $('edScroll').setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  e.preventDefault();
  if (tool === 'eraser') { cur = { erase: true, id: e.pointerId, type: e.pointerType, removed: [] }; eraseAt(x, y); return; }
  if (tool === 'lasso') {
    if (sel && inBox(sel.box, x, y)) { cur = { lassoMove: true, id: e.pointerId, type: e.pointerType, start: [x, y], dx: 0, dy: 0 }; return; }
    clearSel();
    cur = { lasso: true, id: e.pointerId, type: e.pointerType, pts: [x, y] };
    drawSel();
    return;
  }
  const [sx, sy] = snapEdge ? snapPoint(tpl, snapEdge, x, y) : [x, y];
  cur = {
    id: e.pointerId,
    type: e.pointerType,
    tool,
    color: tool === 'marker' ? markerColor : color,
    size: SIZES[tool === 'marker' ? 'marker' : 'pen'][sizeIdx],
    pts: [r1(sx), r1(sy), pressureOf(e)],
    snap: snapEdge,
  };
  liveFrom = 3;
  clearLive();
  scheduleLive();
});
const r1 = (v) => Math.round(v * 10) / 10;

area.addEventListener('pointermove', (e) => {
  if (tplDrag && (e.pointerId === tplDrag.id || e.pointerId === tplDrag.id2)) { moveTpl(e); return; }
  if (touches.has(e.pointerId)) { moveTouch(e); return; }
  if (!cur || e.pointerId !== cur.id) return;
  if (cur.textTap) {
    // Mit dem Finger wischen statt tippen: Blatt schieben
    const dx = e.clientX - cur.cx, dy = e.clientY - cur.cy;
    if (cur.scrolling || Math.hypot(dx, dy) > 10) {
      if (e.pointerType === 'touch') { cur.scrolling = true; $('edScroll').scrollLeft -= dx; $('edScroll').scrollTop -= dy; cur.cx = e.clientX; cur.cy = e.clientY; }
    }
    return;
  }
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (evs.length ? evs : [e])) {
    let [x, y] = toPage(ev);
    if (cur.erase) { eraseAt(x, y); continue; }
    if (cur.lasso) { cur.pts.push(x, y); continue; }
    if (cur.lassoMove) { moveSel(x - cur.start[0], y - cur.start[1]); continue; }
    if (cur.snap) { [x, y] = snapPoint(tpl, cur.snap, x, y); x = r1(x); y = r1(y); }
    const n = cur.pts.length;
    if (Math.hypot(x - cur.pts[n - 3], y - cur.pts[n - 2]) < 0.6) continue;
    cur.pts.push(x, y, pressureOf(ev));
  }
  if (cur.lasso) drawSel();
  else if (!cur.erase && !cur.lassoMove) scheduleLive();
});

function moveTpl(e) {
  const [x, y] = toPage(e);
  const d = tplDrag;
  if (d.id2) {
    // zwei Finger: drehen um den ersten Finger herum
    if (e.pointerId === d.id) d.p1 = [x, y]; else d.p2 = [x, y];
    const v = Math.atan2(d.p2[1] - d.p1[1], d.p2[0] - d.p1[0]);
    tpl.angle = niceAngle(d.a0 + (v - d.v0) * 180 / Math.PI);
  } else if (d.mode === 'body') {
    tpl.x = d.x0 + (x - d.start[0]);
    tpl.y = d.y0 + (y - d.start[1]);
    const L = assistLines();
    if (L) magnetTool(tpl, L, FANG);
    d.last = [x, y];
  } else if (d.mode === 'knob') {
    const ang = Math.atan2(y - tpl.y, x - tpl.x) * 180 / Math.PI;
    if (tpl.type === 'compass') {
      tpl.angle = ang;
      tpl.r = niceRadius(Math.hypot(x - tpl.x, y - tpl.y) - KNOB_OFF);
    } else {
      tpl.angle = niceAngle(ang - d.off);
    }
  }
  drawTool($('edTpl'), tpl);
}

function finishStroke() {
  if (!cur) return;
  const c = cur;
  cur = null;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  if (c.textTap) { if (!c.scrolling) { const g = gapMode && !textAt(c.at[0], c.at[1]) ? gapAt(gaps, c.at[0], c.at[1]) : null; if (g) openGapText(g); else openText(c.at[0], c.at[1]); } return; }
  if (c.lasso) { pickSel(c.pts); updateToolbar(); return; }
  if (c.lassoMove) {
    if (c.dx || c.dy) { undo.push({ type: 'move', strokes: [...sel.strokes], dx: c.dx, dy: c.dy }); redo = []; changed(); }
    updateToolbar();
    return;
  }
  if (c.erase) {
    if (c.removed.length) { undo.push({ type: 'erase', items: c.removed }); redo = []; changed(); }
  } else {
    if (gapMode && c.tool === 'pen' && gapTap(c)) { clearLive(); updateToolbar(); return; }
    const st = { tool: c.tool, color: c.color, size: c.size, pts: assistStroke(c) };
    strokes.push(st);
    if (gapMode && c.tool === 'pen') gapStroke(st);
    drawStroke($('edInk').getContext('2d'), st, scale());
    undo.push({ type: 'add', stroke: st }); redo = [];
    changed();
  }
  clearLive();
  updateToolbar();
  growPage();
}

// ---------- Karo-Hilfe: gerade Striche an Linien und Kästchen ausrichten ----------
// Fast gerade Striche werden gerade gezogen; waagerecht/senkrecht rasten sie auf die Linie ein,
// und beim Stift landen die Enden genau auf Karo-Kreuzungen. Handschrift (kurze/krumme Striche) bleibt unverändert.
function assistStroke(c) {
  const L = assistLines(), p = c.pts;
  if (!L || p.length < 6) return p;
  if (c.snap && c.snap.kind !== 'line') return p;
  const n = p.length / 3;
  const A = [p[0], p[1]], B = [p[p.length - 3], p[p.length - 2]];
  let len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (len < (c.snap ? 2 * MM : 8 * MM)) return p;
  let d = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  let mx = 0, my = 0, pr = 0;
  for (let i = 0; i < p.length; i += 3) { mx += p[i]; my += p[i + 1]; pr += p[i + 2]; }
  mx /= n; my /= n; pr /= n;
  if (!c.snap) {
    // gerade genug? (Abweichung von der Linie A-B und kein Hin und Her)
    let dev = 0, path = 0;
    for (let i = 0; i < p.length; i += 3) {
      dev = Math.max(dev, Math.abs((p[i] - A[0]) * d[1] - (p[i + 1] - A[1]) * d[0]));
      if (i) path += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    }
    if (dev > Math.max(1 * MM, 0.04 * len) || path > 1.15 * len) return p;
    const ang = Math.abs(Math.atan2(d[1], d[0]) * 180 / Math.PI);
    const near = (v, ln) => { if (!ln) return v; const r = ln[1] + Math.round((v - ln[1]) / ln[0]) * ln[0]; return Math.abs(r - v) < FANG ? r : v; };
    if (ang < 6 || ang > 174) { d = [Math.sign(d[0]) || 1, 0]; my = near(my, L.gy); }
    else if (Math.abs(ang - 90) < 6) { d = [0, Math.sign(d[1]) || 1]; mx = near(mx, L.gx); }
  }
  // Anfang und Ende entlang der Richtung
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i] - mx) * d[0] + (p[i + 1] - my) * d[1];
    t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  let P0 = [mx + t0 * d[0], my + t0 * d[1]], P1 = [mx + t1 * d[0], my + t1 * d[1]];
  if (L.gx && L.gy && c.tool === 'pen') { P0 = snapEnd(P0, d, L); P1 = snapEnd(P1, d, L); }
  // Richtung wie gezeichnet beibehalten
  const fwd = (B[0] - A[0]) * d[0] + (B[1] - A[1]) * d[1] >= 0;
  const [S, E] = fwd ? [P0, P1] : [P1, P0];
  len = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const steps = Math.max(1, Math.ceil(len / 6));
  const out = [];
  const pres = Math.round(pr * 100) / 100;
  for (let i = 0; i <= steps; i++) out.push(r1(S[0] + (E[0] - S[0]) * i / steps), r1(S[1] + (E[1] - S[1]) * i / steps), pres);
  return out;
}
// Linien-Ende bis zur nächsten Karo-Linie verlängern/kürzen (wenn nah genug)
function snapEnd(P, d, L) {
  let best = 0, bd = FANG;
  const tryAxis = (k, ln) => {
    if (!ln || Math.abs(d[k]) < 0.05) return;
    const r = ln[1] + Math.round((P[k] - ln[1]) / ln[0]) * ln[0];
    const t = (r - P[k]) / d[k];
    if (Math.abs(t) < bd) { bd = Math.abs(t); best = t; }
  };
  tryAxis(0, L.gx); tryAxis(1, L.gy);
  return [P[0] + best * d[0], P[1] + best * d[1]];
}

// ---------- Textfelder ----------
function setTextSize(st, size) {
  st.size = size;
  const L = assistLines();
  // Auf Karo/Linien: Zeilenabstand = ganze Kästchen bzw. Zeilen, damit Text auf den Linien sitzt
  if (L) { const step = L.gy[0]; st.lh = Math.max(1, Math.round(lineHeight(size) / step)) * step; } else delete st.lh;
}
function textAt(x, y) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const st = strokes[i];
    if (st.tool !== 'text') continue;
    const [x0, y0, , x1, y1] = st.pts;
    if (x >= x0 - 8 && x <= x1 + 8 && y >= y0 - 6 && y <= y1 + 6) return st;
  }
  return null;
}
function openText(x, y, preset = null) {
  let st = preset ? null : textAt(x, y), isNew = false;
  if (preset) { st = preset; isNew = true; } else if (!st) {
    isNew = true;
    st = { tool: 'text', color, size: SIZES.text[sizeIdx], text: '', pts: [] };
    setTextSize(st, st.size);
    const L = assistLines(), lh = lhOf(st);
    let tx = x - 2, ty = y - lh / 2;
    if (L) {
      // in die Zeile/das Kästchen setzen, auf der getippt wurde
      const [step, start] = L.gy;
      ty = start + Math.floor((y - start) / step) * step;
      if (ty < 0) ty = 0;
      if (L.gx) tx = L.gx[1] + Math.round((x - L.gx[1]) / L.gx[0]) * L.gx[0];
    }
    tx = Math.max(4, Math.min(PAGE_W - 120, tx));
    st.pts = [r1(tx), r1(ty), 0, r1(tx), r1(ty + lh), 0];
  }
  const ta = document.createElement('textarea');
  ta.className = 'edtext';
  ta.value = st.text;
  ta.setAttribute('autocapitalize', 'sentences');
  ta.setAttribute('aria-label', 'Text');
  ta.spellcheck = false;
  ta.addEventListener('input', growText);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); commitText(); } });
  textEd = { st, isNew, ta, before: { text: st.text, color: st.color, size: st.size, lh: st.lh } };
  $('edPage').append(ta);
  styleText();
  if (!isNew) redrawInk();
  ta.focus();
  if (!isNew) ta.setSelectionRange(ta.value.length, ta.value.length);
  updateToolbar();
}
function styleText() {
  if (!textEd) return;
  const { st, ta } = textEd;
  const k = $('edPage').clientWidth / PAGE_W, h = pageHeight(page);
  const x = st.pts[0], y = st.pts[1];
  Object.assign(ta.style, {
    left: (x / PAGE_W * 100) + '%',
    top: (y / h * 100) + '%',
    width: (textWidthMax(x) * k) + 'px',
    fontSize: (st.size * k) + 'px',
    lineHeight: (lhOf(st) * k) + 'px',
    fontFamily: FONT,
    color: st.color,
  });
  growText();
}
function growText() {
  if (!textEd) return;
  const ta = textEd.ta;
  ta.style.height = '0px';
  ta.style.height = Math.max(ta.scrollHeight, parseFloat(ta.style.lineHeight) || 20) + 'px';
}
function commitText() {
  if (!textEd) return;
  const { st, isNew, ta, before } = textEd;
  textEd = null;
  const text = mathify(ta.value.replace(/\s+$/, ''));
  ta.remove();
  if (isNew) {
    if (text) { st.text = text; fitText(st); strokes.push(st); undo.push({ type: 'add', stroke: st }); redo = []; changed(); }
  } else if (!text) {
    const index = strokes.indexOf(st);
    if (index >= 0) { strokes.splice(index, 1); undo.push({ type: 'erase', items: [{ stroke: st, index }] }); redo = []; changed(); }
  } else {
    st.text = text; fitText(st);
    const after = { text: st.text, color: st.color, size: st.size, lh: st.lh };
    if (JSON.stringify(after) !== JSON.stringify(before)) { undo.push({ type: 'text', stroke: st, before, after }); redo = []; changed(); }
  }
  redrawInk();
  updateToolbar();
  growPage();
}
function applyText(st, v) {
  Object.assign(st, v);
  if (v.lh == null) delete st.lh;
  fitText(st);
}

function endPointer(e) {
  if (tplDrag && (e.pointerId === tplDrag.id || e.pointerId === tplDrag.id2)) {
    if (e.pointerId === tplDrag.id2) { tplDrag.id2 = null; tplDrag.x0 = tpl.x; tplDrag.y0 = tpl.y; tplDrag.start = tplDrag.p1 || tplDrag.last; }
    else tplDrag = null;
    return;
  }
  if (touches.has(e.pointerId)) {
    touches.delete(e.pointerId);
    if (touchTap && touchTap.id === e.pointerId && e.type === 'pointerup' && Math.hypot(e.clientX - touchTap.cx, e.clientY - touchTap.cy) < 10 && performance.now() - touchTap.t < 450) {
      const [tx, ty] = touchTap.at; touchTap = null;
      if (tool === 'fill') { fillAt(tx, ty); return; }
      const g = textAt(tx, ty) ? null : gapAt(gaps, tx, ty);
      if (g) openGapText(g); else if (textAt(tx, ty)) openText(tx, ty);
      return;
    }
    touchTap = null;
    if (pinch && touches.size < 2) { pinch = null; layout(true); }
    return;
  }
  if (cur && e.pointerId === cur.id) finishStroke();
}
area.addEventListener('pointerup', endPointer);
area.addEventListener('pointercancel', endPointer);
area.addEventListener('lostpointercapture', endPointer);
// Sicherheitsnetz: Ende auch dann erkennen, wenn es außerhalb passiert
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', () => { finishStroke(); touches.clear(); pinch = null; tplDrag = null; });

// ---------- Mathe-Werkzeuge ----------
// Mitte des sichtbaren Bereichs in Seiten-Einheiten
function viewCenter() {
  const sc = $('edScroll').getBoundingClientRect(), pr = $('edPage').getBoundingClientRect();
  return [((sc.left + sc.width / 2) - pr.left) / pr.width * PAGE_W, ((sc.top + sc.height / 2) - pr.top) / pr.width * PAGE_W];
}

// ---------- Koordinatensystem und Funktionsgraph ----------
const num = (v) => parseFloat(String(v).replace(',', '.').replace('−', '-'));
let lastAx = { xmin: -5, xmax: 5, ymin: -5, ymax: 5, cm: 1 };
function makeAxes(ax) {
  const unit = ax.cm * 10 * MM;
  const w = (ax.xmax - ax.xmin) * unit, hh = (ax.ymax - ax.ymin) * unit, H = pageHeight(page);
  if (w > PAGE_W - 12 * MM || hh > H - 16 * MM) return null;
  const [cx, cy] = viewCenter();
  let ox = cx - w / 2 - ax.xmin * unit, oy = cy - hh / 2 + ax.ymax * unit;
  // ganz aufs Blatt
  const x0 = Math.max(4 * MM, Math.min(PAGE_W - w - 8 * MM, ox + ax.xmin * unit));
  const y0 = Math.max(8 * MM, Math.min(H - hh - 6 * MM, oy - ax.ymax * unit));
  ox = x0 - ax.xmin * unit; oy = y0 + ax.ymax * unit;
  // Ursprung auf eine Karo-Kreuzung legen
  const L = assistLines();
  if (L && L.gx) ox = L.gx[1] + Math.round((ox - L.gx[1]) / L.gx[0]) * L.gx[0];
  if (L && L.gy) oy = L.gy[1] + Math.round((oy - L.gy[1]) / L.gy[0]) * L.gy[0];
  const axd = { xmin: ax.xmin, xmax: ax.xmax, ymin: ax.ymin, ymax: ax.ymax, unit };
  return { tool: 'axes', color: '#1d1d1f', size: 2, ax: axd, pts: axesBox(r1(ox + ax.xmin * unit), r1(oy - ax.ymax * unit), axd) };
}
function addGroup(list) {
  strokes.push(...list);
  undo.push({ type: 'addMany', strokes: list }); redo = [];
  redrawInk(); changed(); updateToolbar();
}
async function axesFlow() {
  commitText();
  const res = await sheet('Koordinatensystem', (body, close) => {
    const f = (id, label, v) => [el('label.fieldlabel', { for: id, text: label }), el('input.field', { id, type: 'text', inputmode: 'text', value: String(v), autocomplete: 'off' })];
    let cm = lastAx.cm;
    const seg = el('div.seg');
    for (const [v, l] of [[0.5, '1 = ½ cm'], [1, '1 = 1 cm'], [2, '1 = 2 cm']]) {
      const b = el('button' + (v === cm ? '.on' : ''), { text: l, on: { click: () => { cm = v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } } });
      seg.append(b);
    }
    const err = el('p.dlgtext');
    body.append(el('div.fieldgrid', null,
      el('div', null, ...f('axXmin', 'x von', lastAx.xmin)), el('div', null, ...f('axXmax', 'x bis', lastAx.xmax)),
      el('div', null, ...f('axYmin', 'y von', lastAx.ymin)), el('div', null, ...f('axYmax', 'y bis', lastAx.ymax))),
    el('p.fieldlabel', { text: 'Einheit' }), seg, err,
    el('div.dlgactions', null,
      el('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
      el('button.btn.primary', { text: 'Einfügen', on: { click: () => {
        const ax = { xmin: num($('axXmin').value), xmax: num($('axXmax').value), ymin: num($('axYmin').value), ymax: num($('axYmax').value), cm };
        if ([ax.xmin, ax.xmax, ax.ymin, ax.ymax].some((v) => !Number.isFinite(v)) || ax.xmin >= ax.xmax || ax.ymin >= ax.ymax) { err.textContent = 'Bitte Zahlen eintragen, „von“ kleiner als „bis“.'; return; }
        const st = makeAxes(ax);
        if (!st) { err.textContent = 'So groß passt es nicht aufs Blatt. Nimm eine kleinere Einheit oder weniger Bereich.'; return; }
        lastAx = ax;
        close(st);
      } } })));
  });
  if (res) { addGroup([res]); toast('Koordinatensystem eingefügt. Mit dem Lasso kannst du es verschieben.'); }
}

const FN_NAMES = ['f', 'g', 'h', 'k', 'p', 'q'];
async function graphFlow() {
  commitText();
  const axes = [...strokes].reverse().find((st) => st.tool === 'axes');
  const res = await sheet('Funktionsgraph', (body, close) => {
    const inp = el('input.field', { id: 'fnInput', type: 'text', placeholder: 'z. B. x² − 2x + 1', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
    expoInput(inp);
    const msg = el('p.dlgtext', { text: axes ? 'Wird in das zuletzt eingefügte Koordinatensystem gezeichnet.' : 'Es gibt noch kein Koordinatensystem. Ich füge eins von −5 bis 5 ein.' });
    const ok = () => {
      try { const f = compile(inp.value); f(1); close({ f, src: inp.value.trim() }); } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    inp.addEventListener('input', () => {
      msg.classList.remove('err');
      if (!inp.value.trim()) return;
      try { compile(inp.value); msg.textContent = 'f(x) = ' + mathify(inp.value.trim().replace(/^(f\s*\(\s*x\s*\)|y)\s*=/i, '').trim()); } catch (e) { msg.textContent = e.message; }
    });
    const ex = el('div.chips.left', null, ...['x²', '0,5x² − 2', '2x + 1', '(x − 1)² − 3', 'sqrt(x)', 'sin(x)', '1/x'].map((t) =>
      el('button.pchip.small', { text: t, on: { click: () => { inp.value = t; inp.dispatchEvent(new Event('input')); inp.focus(); } } })));
    body.append(el('label.fieldlabel', { for: 'fnInput', text: 'f(x) =' }), inp, msg, ex,
      el('div.dlgactions', null,
        el('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        el('button.btn.primary', { text: 'Zeichnen', on: { click: ok } })));
  });
  if (!res) return;
  const group = [];
  let ax = axes;
  if (!ax) { ax = makeAxes({ xmin: -5, xmax: 5, ymin: -5, ymax: 5, cm: 1 }); if (!ax) { toast('Kein Platz für ein Koordinatensystem'); return; } group.push(ax); }
  if (!plotInto(ax, res.f, res.src, color, group)) { toast('Der Graph liegt ganz außerhalb des Koordinatensystems'); if (group.length) addGroup(group); return; }
  addGroup(group);
}
// Aus dem Funktionsplotter: Koordinatensystem passend zum Ausschnitt plus alle Graphen in ihren Farben
async function plotterFlow() {
  commitText();
  const { plotterSheet } = await import('./plotter.js');
  const res = await plotterSheet();
  if (!res) return;
  const b = res.bounds;
  const ax = { xmin: Math.floor(b.x0), xmax: Math.ceil(b.x1), ymin: Math.floor(b.y0), ymax: Math.ceil(b.y1) };
  if (ax.xmin >= 0) ax.xmin = -1; if (ax.xmax <= 0) ax.xmax = 1; if (ax.ymin >= 0) ax.ymin = -1; if (ax.ymax <= 0) ax.ymax = 1;
  if (ax.xmax - ax.xmin > 40 || ax.ymax - ax.ymin > 56) { toast('Der Ausschnitt ist zu groß fürs Blatt. Zoom im Plotter etwas hinein (höchstens etwa 40 Einheiten breit).', 6000); return; }
  let st = null;
  for (const cm of [1, 0.5, 0.25]) { st = makeAxes({ ...ax, cm }); if (st) break; }
  if (!st) { toast('Kein Platz für das Koordinatensystem auf dieser Seite'); return; }
  const group = [st];
  for (const fn of res.fns) plotInto(st, fn.f, fn.src, fn.color, group);
  addGroup(group);
  toast('Graphen eingezeichnet. Mit dem Lasso kannst du sie verschieben.');
}
function plotInto(ax, fnc, src, color, group) {
  const res = { f: fnc, src };
  const { xmin, xmax, ymin, ymax, unit } = ax.ax;
  const { ox, oy } = axesFrame(ax);
  const N = 800, segs = [];
  let seg = [], prevY = null;
  for (let i = 0; i <= N; i++) {
    const x = xmin + (xmax - xmin) * i / N;
    let y; try { y = res.f(x); } catch (e) { y = NaN; }
    const ok = Number.isFinite(y) && y >= ymin && y <= ymax;
    const jump = prevY != null && Number.isFinite(y) && Math.abs(y - prevY) > (ymax - ymin) * 0.5;
    if (!ok || jump) { if (seg.length > 3) segs.push(seg); seg = []; }
    if (ok) seg.push(r1(ox + x * unit), r1(oy - y * unit), 0.5);
    prevY = Number.isFinite(y) ? y : null;
  }
  if (seg.length > 3) segs.push(seg);
  if (!segs.length) return false;
  for (const pts of segs) {
    // Punkte ausdünnen (fast gerade Stücke brauchen weniger Punkte)
    const out = [pts[0], pts[1], pts[2]];
    for (let i = 3; i < pts.length; i += 3) {
      const n = out.length;
      if (i === pts.length - 3 || Math.hypot(pts[i] - out[n - 3], pts[i + 1] - out[n - 2]) > 2.5) out.push(pts[i], pts[i + 1], pts[i + 2]);
    }
    group.push({ tool: 'pen', color, size: SIZES.pen[1], pts: out });
  }
  // Beschriftung am Ende des Graphen
  const used = strokes.concat(group).filter((st) => st.fnOf === ax.pts.join(',')).length;
  const name = FN_NAMES[used % FN_NAMES.length];
  const last = segs[segs.length - 1];
  const ex = last[last.length - 3], ey = last[last.length - 2];
  const label = { tool: 'text', color, size: 18, text: `${name}(x) = ${mathify(res.src.replace(/^(f\s*\(\s*x\s*\)|y)\s*=/i, '').trim())}`, pts: [], fnOf: ax.pts.join(',') };
  const lx = Math.max(ax.pts[0], Math.min(ax.pts[3] - 150, ex - 160)), ly = Math.max(ax.pts[1], Math.min(ax.pts[4] - 24, ey - 30));
  label.pts = [r1(lx), r1(ly), 0, r1(lx), r1(ly + 24), 0];
  fitText(label);
  group.push(label);
  return true;
}

function showTool(type) {
  if (!type) { tpl = null; drawTool($('edTpl'), null); updateToolbar(); return; }
  // in die Mitte des sichtbaren Bereichs legen
  const sc = $('edScroll').getBoundingClientRect(), pr = $('edPage').getBoundingClientRect();
  const cx = ((sc.left + sc.width / 2) - pr.left) / pr.width * PAGE_W;
  const cy = ((sc.top + sc.height / 2) - pr.top) / pr.width * PAGE_W;
  const h = pageHeight(page);
  tpl = makeTool(type, Math.max(80, Math.min(PAGE_W - 80, cx)), Math.max(80, Math.min(h - 80, cy)));
  if (type === 'compass') tpl.angle = 0;
  drawTool($('edTpl'), tpl);
  if (tool === 'eraser' || tool === 'lasso') setTool('pen');
  updateToolbar();
}
// Umschalter: antippen = Werkzeug zeigen, nochmal antippen = ausblenden
function toggleTool(k) { showTool(tpl && tpl.type === k ? null : k); }
$('edQRuler').addEventListener('click', () => toggleTool('ruler'));
$('edQTri').addEventListener('click', () => toggleTool('triangle'));
$('edMath').addEventListener('click', (e) => {
  menu(e.currentTarget, [
    { label: 'Koordinatensystem …', icon: 'axes', onClick: axesFlow },
    { label: 'Funktionsgraph …', icon: 'graph', onClick: graphFlow },
    { label: 'Funktionsplotter …', icon: 'graph', onClick: plotterFlow },
    { label: 'Taschenrechner', icon: 'calc', onClick: () => import('./kit.js').then((m) => m.calcSheet()) },
    ...(page && page.kind !== 'blank' ? [{ label: (gapMode ? '✓ ' : '') + 'Lücken ausfüllen', icon: 'text', onClick: () => (gapMode ? exitGapMode() : enterGapMode()) }] : []),
    ...(page && page.kind !== 'blank' ? [{ label: 'Lernkarten aus Markiertem', icon: 'cards', onClick: async () => { finishStroke(); commitText(); await flushSave(); const m = await import('./markcards.js'); m.cardsFromMarks({ page, strokes, pageW: PAGE_W }); } }] : []),
    ...(page ? [{ label: 'Neue Aufgaben wie dieses Blatt (KI) …', icon: 'page', onClick: async () => { finishStroke(); commitText(); await flushSave(); const tb = strokes.filter((x) => x.tool === 'text').map((x) => x.text).join('\n'); const m = await import('./morework.js'); m.moreTasksFlow([{ ...page, textBoxes: tb, strokes: strokes.length }], { title: (await db.getBook(page.bookId).catch(() => null))?.title || '' }); } }] : []),
    ...(page ? [{ label: 'Seite abschreiben (Handschrift lesen, KI) …', icon: 'eye', onClick: async () => { finishStroke(); commitText(); await flushSave(); const m = await import('./morework.js'); m.transcribeFlow({ ...page, strokes: strokes.length }); } }] : []),
    ...(page ? [{ label: 'Lernkarten automatisch (KI) …', icon: 'bolt', onClick: async () => { finishStroke(); commitText(); await flushSave(); const tb = strokes.filter((x) => x.tool === 'text').map((x) => x.text).join('\n'); const m = await import('./autocards.js'); m.autoCardsFlow([{ ...page, textBoxes: tb }]); } }] : []),
    'sep',
    ...Object.entries(TOOL_NAMES).map(([k, label]) => ({ label: (tpl && tpl.type === k ? '✓ ' : '') + label, icon: 'tool-' + k, onClick: () => toggleTool(k) })),
    'sep',
    { label: 'Werkzeug weglegen', icon: 'close', onClick: () => showTool(null) },
    ...(page && page.kind === 'blank' && paperLines(page.paper) ? ['sep', {
      label: (gridAssist ? '✓ ' : '') + (paperLines(page.paper).gx ? 'Karo-Hilfe' : 'Linien-Hilfe'), icon: 'grid',
      onClick: () => {
        gridAssist = !gridAssist;
        try { localStorage.setItem('gridAssist', gridAssist ? '1' : '0'); } catch (err) { /* egal */ }
        updateToolbar();
      },
    }] : []),
  ]);
});

// ---------- Lücken ausfüllen ----------
// Findet Schreiblinien auf Scans. Tippen öffnet ein Textfeld genau auf der Linie,
// Handschrift mit dem Stift wird nach einer kurzen Pause auf die Linie gesetzt.
function enterGapMode() {
  if (!page || !bg) { toast('Das geht auf gescannten Arbeitsblättern.', 3500); return; }
  commitText();
  gaps = detectGaps(bg, PAGE_W);
  if (!gaps.length) { toast('Auf dieser Seite wurden keine leeren Schreiblinien gefunden.', 4000); return; }
  gapMode = true; gapGroups = new Map();
  drawGaps();
  const bar = el('div.gapbar', { id: 'gapBar' },
    el('div.gapinfo', null,
      el('b', { text: gaps.length === 1 ? '1 Lücke gefunden' : `${gaps.length} Lücken gefunden` }),
      el('small', { text: 'Tippen: Textfeld auf der Linie. Mit dem Stift schreiben: rastet auf der Linie ein.' })),
    el('button.btn.primary.small', { text: 'Fertig', on: { click: exitGapMode } }));
  $('editor').append(bar);
}
function exitGapMode() {
  if (gapMode) snapAllGaps();
  gapMode = false; gaps = []; gapGroups = new Map(); touchTap = null;
  clearTimeout(gapTimer);
  document.getElementById('edGaps')?.remove();
  document.getElementById('gapBar')?.remove();
}
function drawGaps() {
  document.getElementById('edGaps')?.remove();
  if (!gapMode) return;
  const ph = pageHeight(page);
  const layer = el('div.gaplayer', { id: 'edGaps', 'aria-hidden': 'true' });
  gaps.forEach((g, i) => {
    const m = el('span.gapmark');
    Object.assign(m.style, {
      left: (g.x0 / PAGE_W * 100) + '%', width: ((g.x1 - g.x0) / PAGE_W * 100) + '%',
      top: ((g.y - g.avail) / ph * 100) + '%', height: ((g.avail + 1.5) / ph * 100) + '%',
      animationDelay: Math.min(i * 30, 400) + 'ms',
    });
    layer.append(m);
  });
  $('edPage').append(layer);
}
function openGapText(g) {
  commitText();
  const t = textForGap(g, lineHeight);
  const st = { tool: 'text', color, size: t.size, lh: t.lh, text: '', pts: [r1(t.x), r1(t.y), 0, r1(t.x), r1(t.y + t.lh), 0] };
  openText(t.x, t.y, st);
}
// Kurzer Tipp mit dem Stift in eine Lücke: Textfeld statt Punkt
function gapTap(c) {
  const p = c.pts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  if (x1 - x0 > 3 || y1 - y0 > 3 || p.length > 30) return false;
  const g = gapAt(gaps, p[0], p[1]);
  if (!g) return false;
  if (textAt(p[0], p[1])) openText(p[0], p[1]); else openGapText(g);
  return true;
}
function gapStroke(st) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < st.pts.length; i += 3) { x0 = Math.min(x0, st.pts[i]); x1 = Math.max(x1, st.pts[i]); y0 = Math.min(y0, st.pts[i + 1]); y1 = Math.max(y1, st.pts[i + 1]); }
  const g = gapAt(gaps, (x0 + x1) / 2, (y0 + y1) / 2, 14);
  if (!g) return;
  if (!gapGroups.has(g)) gapGroups.set(g, []);
  gapGroups.get(g).push(st);
  clearTimeout(gapTimer);
  gapTimer = setTimeout(snapAllGaps, 700);
}
function snapAllGaps() {
  clearTimeout(gapTimer);
  let moved = false;
  for (const [g, list0] of gapGroups) {
    const list = list0.filter((s) => strokes.includes(s));
    gapGroups.set(g, list);
    const dy = baselineShift(list, g);
    if (!dy) continue;
    translate(list, 0, dy);
    undo.push({ type: 'move', strokes: [...list], dx: 0, dy }); redo = [];
    moved = true;
  }
  if (moved && page) { changed(); redrawInk(); updateToolbar(); }
}

// ---------- Farbeimer ----------
// Füllt die umrandete Fläche unter dem Finger/Stift. Grenzen sind dunkle oder kräftig farbige Linien
// (Scan, eigene Striche); helle Karo- und Linien-Papierlinien zählen nicht als Grenze.
function fillAt(x, y) {
  if (!page) return;
  finishStroke(); commitText();
  const W = PAGE_W, H = Math.round(pageHeight(page));
  const X = Math.round(x), Y = Math.round(y);
  if (X < 0 || Y < 0 || X >= W || Y >= H) return;
  const c = renderPage(page, bg, strokes.filter((s) => s.tool !== 'fill' && s.tool !== 'marker'), W);
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const wall = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < wall.length; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    wall[j] = l < 165 || (sat > 90 && l < 225) ? 1 : 0;
  }
  // kleine Lücken in Linien schließen
  const wall2 = wall.slice();
  for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
    const j = yy * W + xx;
    if (wall[j] && !(wall[j - 1] && wall[j + 1] && wall[j - W] && wall[j + W])) { wall2[j - 1] = wall2[j + 1] = wall2[j - W] = wall2[j + W] = 1; }
  }
  if (wall2[Y * W + X]) { toast('Tippe in eine leere Fläche, nicht auf eine Linie.', 2500); return; }
  const mark = new Uint8Array(W * H);
  const stack = [X, Y];
  let count = 0;
  const limit = W * H * 0.6;
  while (stack.length) {
    const sy = stack.pop(), sx0 = stack.pop();
    let sx = sx0;
    while (sx > 0 && !wall2[sy * W + sx - 1] && !mark[sy * W + sx - 1]) sx--;
    let upOpen = false, downOpen = false;
    for (; sx < W && !wall2[sy * W + sx] && !mark[sy * W + sx]; sx++) {
      mark[sy * W + sx] = 1; count++;
      if (sy > 0) { const o = !wall2[(sy - 1) * W + sx] && !mark[(sy - 1) * W + sx]; if (o && !upOpen) stack.push(sx, sy - 1); upOpen = o; }
      if (sy < H - 1) { const o = !wall2[(sy + 1) * W + sx] && !mark[(sy + 1) * W + sx]; if (o && !downOpen) stack.push(sx, sy + 1); downOpen = o; }
    }
    if (count > limit) break;
  }
  if (count > limit) { toast('Diese Fläche ist nicht geschlossen. Zieh die Umrandung zu und tipp nochmal.', 3500); return; }
  // Farbe 2 Pixel unter die Linien ziehen, damit kein weißer Rand bleibt
  for (let it = 0; it < 2; it++) {
    const add = [];
    for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
      const j = yy * W + xx;
      if (!mark[j] && (mark[j - 1] || mark[j + 1] || mark[j - W] || mark[j + W])) add.push(j);
    }
    for (const j of add) mark[j] = 1;
  }
  const spans = [];
  for (let yy = 0; yy < H; yy++) {
    let s0 = -1;
    for (let xx = 0; xx <= W; xx++) {
      const on = xx < W && mark[yy * W + xx];
      if (on && s0 < 0) s0 = xx;
      else if (!on && s0 >= 0) { spans.push(yy, s0, xx - 1); s0 = -1; }
    }
  }
  const st = { tool: 'fill', color, size: 0, pts: [X, Y, 0], spans };
  strokes.push(st);
  undo.push({ type: 'add', stroke: st }); redo = [];
  changed(); redrawInk(); updateToolbar();
}

// ---------- Lasso: Striche auswählen und verschieben ----------
const inBox = (b, x, y) => x >= b[0] - 8 && x <= b[2] + 8 && y >= b[1] - 8 && y <= b[3] + 8;

function bboxOf(list) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const st of list) {
    const p = st.pts, m = st.tool === 'text' || st.tool === 'axes' ? 2 : st.size / 2;
    for (let i = 0; i < p.length; i += 3) {
      b = [Math.min(b[0], p[i] - m), Math.min(b[1], p[i + 1] - m), Math.max(b[2], p[i] + m), Math.max(b[3], p[i + 1] + m)];
    }
  }
  return b;
}
function pickSel(loop) {
  const poly = [];
  for (let i = 0; i < loop.length; i += 2) poly.push([loop[i], loop[i + 1]]);
  const chosen = new Set();
  if (poly.length > 2) {
    for (const st of strokes) {
      const p = st.pts;
      let inside = 0, total = 0;
      for (let i = 0; i < p.length; i += 3) { total++; if (pip(p[i], p[i + 1], poly)) inside++; }
      if (total && inside / total >= 0.5) chosen.add(st);
    }
  }
  sel = chosen.size ? { strokes: chosen, box: bboxOf(chosen) } : null;
  drawSel();
}
function pip(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function moveSel(dx, dy) {
  if (!sel || !cur) return;
  const ddx = dx - cur.dx, ddy = dy - cur.dy;
  cur.dx = dx; cur.dy = dy;
  translate(sel.strokes, ddx, ddy);
  sel.box = bboxOf(sel.strokes);
  redrawInk(); drawSel();
}
function translate(list, dx, dy) {
  for (const st of list) if (st.spans) st.off = [r1((st.off ? st.off[0] : 0) + dx), r1((st.off ? st.off[1] : 0) + dy)];
  for (const st of list) for (let i = 0; i < st.pts.length; i += 3) { st.pts[i] = r1(st.pts[i] + dx); st.pts[i + 1] = r1(st.pts[i + 1] + dy); }
}
function clearSel() { sel = null; drawSel(); updateToolbar(); }
function drawSel() {
  const svg = $('edSel');
  svg.textContent = '';
  const NS = 'http://www.w3.org/2000/svg';
  if (cur && cur.lasso && cur.pts.length > 2) {
    const pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', cur.pts.join(' '));
    pl.setAttribute('class', 'lassoline');
    svg.append(pl);
  }
  if (sel) {
    const [x0, y0, x1, y1] = sel.box;
    const r = document.createElementNS(NS, 'rect');
    Object.entries({ x: x0 - 6, y: y0 - 6, width: x1 - x0 + 12, height: y1 - y0 + 12, rx: 6, class: 'selbox' }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.append(r);
  }
}
$('edSelDelete').addEventListener('click', () => {
  if (!sel) return;
  const items = [];
  for (let i = strokes.length - 1; i >= 0; i--) if (sel.strokes.has(strokes[i])) { items.push({ stroke: strokes[i], index: i }); strokes.splice(i, 1); }
  undo.push({ type: 'erase', items }); redo = [];
  clearSel(); redrawInk(); changed(); updateToolbar();
});

// Radierer: entfernt ganze Striche, die berührt werden (wie der Objekt-Radierer bei Apple)
function eraseAt(x, y) {
  let hit = false;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const st = strokes[i], p = st.pts, r = ERASER_R + st.size / 2;
    if (st.tool === 'axes') {
      // nur an den Achsen radieren (nicht überall im Kasten, sonst verschwindet es beim Radieren eigener Striche)
      const { ox, oy } = axesFrame(st);
      const ay = Math.min(p[4], Math.max(p[1], oy)), axx = Math.min(p[3], Math.max(p[0], ox));
      if (segDist(x, y, p[0], ay, p[3], ay) < ERASER_R || segDist(x, y, axx, p[1], axx, p[4]) < ERASER_R) {
        cur.removed.push({ stroke: st, index: i }); strokes.splice(i, 1); hit = true;
      }
      continue;
    }
    if (st.tool === 'fill') {
      if (fillHit(st, x, y)) { cur.removed.push({ stroke: st, index: i }); strokes.splice(i, 1); hit = true; }
      continue;
    }
    if (st.tool === 'text') {
      if (x >= p[0] - ERASER_R && x <= p[3] + ERASER_R && y >= p[1] - ERASER_R && y <= p[4] + ERASER_R) {
        cur.removed.push({ stroke: st, index: i }); strokes.splice(i, 1); hit = true;
      }
      continue;
    }
    for (let k = 0; k < p.length; k += 3) {
      const k2 = k + 3 < p.length ? k + 3 : k;
      if (segDist(x, y, p[k], p[k + 1], p[k2], p[k2 + 1]) < r) {
        cur.removed.push({ stroke: st, index: i });
        strokes.splice(i, 1);
        hit = true;
        break;
      }
    }
  }
  if (hit) redrawInk();
}

// Abstand Punkt -> Linienstück (damit auch schnelle Striche mit großen Lücken getroffen werden)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function doUndo() {
  finishStroke();
  commitText();
  const a = undo.pop(); if (!a) return;
  if (a.type === 'text') applyText(a.stroke, a.before);
  else if (a.type === 'addMany') { for (const st of a.strokes) { const i = strokes.indexOf(st); if (i >= 0) strokes.splice(i, 1); } }
  else if (a.type === 'add') strokes.splice(strokes.lastIndexOf(a.stroke), 1);
  else if (a.type === 'move') translate(a.strokes, -a.dx, -a.dy);
  else for (const it of [...a.items].reverse()) strokes.splice(it.index, 0, it.stroke);
  if (sel) clearSel();
  redo.push(a); redrawInk(); changed(); updateToolbar();
}
function doRedo() {
  finishStroke();
  commitText();
  const a = redo.pop(); if (!a) return;
  if (a.type === 'text') applyText(a.stroke, a.after);
  else if (a.type === 'addMany') strokes.push(...a.strokes);
  else if (a.type === 'add') strokes.push(a.stroke);
  else if (a.type === 'move') translate(a.strokes, a.dx, a.dy);
  else for (const it of a.items) { const i = strokes.indexOf(it.stroke); if (i >= 0) strokes.splice(i, 1); }
  undo.push(a); redrawInk(); changed(); updateToolbar();
}

// ---------- Finger: schieben und mit zwei Fingern zoomen ----------
function moveTouch(e) {
  const t = touches.get(e.pointerId);
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  t.x = e.clientX; t.y = e.clientY;
  if (pinch) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    setZoom(pinch.zoom * d / pinch.d, false);
    return;
  }
  $('edScroll').scrollLeft -= dx; $('edScroll').scrollTop -= dy;
}
function startPinch() {
  const [a, b] = [...touches.values()];
  pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
}

// ---------- Speichern ----------
function changed() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 900);
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !page) return;
  dirty = false;
  const pg = page, list = strokes.map((s) => ({ ...s }));
  let thumbCanvas = renderPage(pg, bg, list, 260);
  if (pg.kind === 'blank' && thumbCanvas.height > Math.round(260 * A4_H / PAGE_W) + 1) {
    // lange Heftseite: Vorschaubild zeigt den Anfang im A4-Format
    const t = document.createElement('canvas'); t.width = 260; t.height = Math.round(260 * A4_H / PAGE_W);
    t.getContext('2d').drawImage(thumbCanvas, 0, 0); thumbCanvas = t;
  }
  const thumb = await new Promise((r) => thumbCanvas.toBlob(r, 'image/jpeg', 0.7));
  await db.saveInk(pg.id, list, thumb);
}

// Bei Wechsel in eine andere App sofort sichern
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishStroke(); commitText(); flushSave(); } });

// für Tests
window.__editorState = () => ({ texts: strokes.filter((s) => s.tool === 'text').map((s) => ({ text: s.text, pts: s.pts.slice(), lh: s.lh })), editing: !!textEd, gridAssist, cur: !!cur, strokes: strokes.length, touches: touches.size, tpl: tpl && { ...tpl }, last: strokes.length ? strokes[strokes.length - 1].pts.slice() : null, sel: sel ? sel.strokes.size : 0 });

// ---------- Für Big Boy (Chat-Helfer) ----------
export function edState() { return { open: !$('editor').hidden && !!page, page, strokes }; }
export async function edFlush() { finishStroke(); commitText(); await flushSave(); return { ...page, strokes: strokes.length }; }
// Text als Textfeld sichtbar auf die Seite setzen (rückgängig machbar wie jedes Textfeld)
export function edInsertText(text) {
  if ($('editor').hidden || !page) return false;
  finishStroke(); commitText();
  const sc = $('edScroll').getBoundingClientRect(), pr = $('edPage').getBoundingClientRect();
  const k = pr.width / PAGE_W, H = pageHeight(page);
  const x = Math.max(15 * MM, Math.min(PAGE_W - 80 * MM, (sc.left + 40 - pr.left) / k));
  const y = Math.max(12 * MM, Math.min(H - 30 * MM, (sc.top + sc.height * 0.35 - pr.top) / k));
  const st = { tool: 'text', color, size: SIZES.text[sizeIdx] || 18, text, pts: [x, y, 0, x, y + 24, 0] };
  fitText(st);
  strokes.push(st); undo.push({ type: 'add', stroke: st }); redo = []; changed(); redrawInk(); updateToolbar();
  return true;
}
