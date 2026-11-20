// Schreib-Ansicht: mit Apple Pencil (oder Finger) auf Blätter und Scans schreiben.
import * as db from './db.js';
import { PAGE_W, drawPaper, drawStroke, renderPage, pageHeight, blobToImage, paperLines, fitText, lhOf, lineHeight, textWidthMax, FONT } from './paper.js';
import { makeTool, drawTool, hitTool, findEdge, snapPoint, niceAngle, niceRadius, magnetTool, TOOL_NAMES, KNOB_OFF, MM } from './tools.js';
import { menu, sheet, h as el, toast, busy, promptSheet, shareReady } from './ui.js';
import { compile, mathify } from './mathfn.js';
import { axesBox, axesFrame } from './paper.js';

const $ = (id) => document.getElementById(id);
const COLORS = [
  ['#1d1d1f', 'Graphit'], ['#1f4fbf', 'Blau'], ['#c62f2f', 'Rot'],
  ['#23764a', 'Grün'], ['#f2c230', 'Gelb'], ['#e2679f', 'Rosa'],
];
const SIZES = { pen: [1.8, 3, 5], marker: [14, 22, 32], text: [18, 24, 34] };
const TOOLS = ['pen', 'marker', 'eraser', 'lasso', 'text'];
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
let gridAssist = true;       // Karo-Hilfe: Lineal und gerade Striche rasten an den Linien ein

try { const f = localStorage.getItem('fingerDraws'); if (f !== null) fingerDraws = f === '1'; } catch (e) { /* egal */ }
try { const g = localStorage.getItem('gridAssist'); if (g !== null) gridAssist = g === '1'; } catch (e) { /* egal */ }
// Linien des Papiers, an denen die Karo-Hilfe einrastet (oder null)
const assistLines = () => (page && page.kind === 'blank' && gridAssist ? paperLines(page.paper) : null);

export async function openEditor(p, { onClose } = {}) {
  page = p; onCloseCb = onClose;
  strokes = await db.getInk(p.id);
  undo = []; redo = []; dirty = false; zoom = 1;
  cur = null; touches.clear(); pinch = null; tpl = null; tplDrag = null; sel = null; textEd = null;
  bg = null;
  if (p.kind !== 'blank') {
    const blob = await db.getImage(p.id);
    if (blob) bg = await blobToImage(blob);
  }
  $('editor').hidden = false;
  buildPalette();
  layout(true);
}

async function close() {
  finishStroke();
  commitText();
  await flushSave();
  $('editor').hidden = true;
  const closed = page;
  page = null; bg = null; strokes = [];
  if (onCloseCb) onCloseCb(closed);
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
  updateToolbar();
}

function setTool(t) { if (t !== 'text') commitText(); tool = t; if (t !== 'lasso' && sel) { sel = null; drawSel(); } updateToolbar(); }

function updateToolbar() {
  for (const t of TOOLS) {
    $('ed_' + t).classList.toggle('on', tool === t);
    $('ed_' + t).setAttribute('aria-pressed', tool === t);
  }
  const active = tool === 'marker' ? markerColor : color;
  [...$('edColors').children].forEach((b) => b.classList.toggle('on', tool !== 'eraser' && b.dataset.color === active));
  [...$('edSizes').children].forEach((b, i) => b.classList.toggle('on', i === sizeIdx));
  $('edTools').classList.toggle('erasing', tool === 'eraser' || tool === 'lasso');
  $('edTools').classList.toggle('texting', tool === 'text');
  $('edMath').classList.toggle('on', !!tpl);
  $('edSelDelete').hidden = !sel;
  $('edUndo').disabled = !undo.length;
  $('edRedo').disabled = !redo.length;
  $('edFinger').classList.toggle('on', fingerDraws);
  $('edFinger').setAttribute('aria-pressed', fingerDraws);
  $('edFingerLabel').textContent = fingerDraws ? 'Finger schreibt' : 'Finger blättert';
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
[...$('edSizes').children].forEach((b, i) => b.addEventListener('click', () => {
  sizeIdx = i;
  if (textEd) { setTextSize(textEd.st, SIZES.text[i]); styleText(); }
  updateToolbar();
}));
$('edUndo').addEventListener('click', doUndo);
$('edRedo').addEventListener('click', doRedo);
$('edDone').addEventListener('click', close);
// ---------- Arbeitsblatt: Name/Datum einsetzen, als PDF teilen ----------
$('edShare').addEventListener('click', (e) => {
  menu(e.currentTarget, [
    { label: 'Als PDF teilen', icon: 'share', onClick: sharePagePdf },
    { label: 'Name und Datum einsetzen', icon: 'text', onClick: stampName },
    { label: 'Namen ändern', icon: 'edit', onClick: () => { try { localStorage.removeItem('myName'); } catch (err) { /* egal */ } stampName(); } },
  ]);
});
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
  const h = pageHeight(page);
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
  const dpr = window.devicePixelRatio || 1;
  const pxW = Math.min(2600, Math.round(cssW * dpr));
  const pxH = Math.round(pxW * h / PAGE_W);
  for (const id of ['edBg', 'edInk', 'edLive']) { const c = $(id); c.width = pxW; c.height = pxH; }
  const s = pxW / PAGE_W;
  for (const id of ['edTpl', 'edSel']) $(id).setAttribute('viewBox', `0 0 ${PAGE_W} ${h}`);
  drawTool($('edTpl'), tpl);
  drawSel();
  styleText();
  const bctx = $('edBg').getContext('2d');
  if (bg) { bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, pxW, pxH); bctx.drawImage(bg, 0, 0, pxW, pxH); }
  else drawPaper(bctx, page.paper || 'blank', PAGE_W, h, s);
  redrawInk();
}
window.addEventListener('resize', () => { if (page) layout(true); });

const scale = () => $('edInk').width / PAGE_W;

function redrawInk() {
  const c = $('edInk'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const s = scale();
  for (const st of strokes) if (!textEd || st !== textEd.st) drawStroke(ctx, st, s);
}

function clearLive() {
  const c = $('edLive');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
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

const area = $('edScroll');

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
  const onPage = !!e.target.closest('#edPage');
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
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      e.preventDefault();
      return;
    }
  }

  if (tool === 'text' && onPage && !cur && (e.pointerType !== 'touch' || touches.size === 0)) {
    // Textfeld: beim Loslassen öffnen (iPad zeigt die Tastatur nur bei einer echten Berührung)
    cur = { textTap: true, id: e.pointerId, type: e.pointerType, at: [x, y], cx: e.clientX, cy: e.clientY, scrolling: false };
    try { area.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    e.preventDefault();
    return;
  }

  if (e.pointerType === 'touch' && !fingerDraws) {
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
  try { area.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
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
      if (e.pointerType === 'touch') { cur.scrolling = true; area.scrollLeft -= dx; area.scrollTop -= dy; cur.cx = e.clientX; cur.cy = e.clientY; }
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
  if (c.textTap) { if (!c.scrolling) openText(c.at[0], c.at[1]); return; }
  if (c.lasso) { pickSel(c.pts); updateToolbar(); return; }
  if (c.lassoMove) {
    if (c.dx || c.dy) { undo.push({ type: 'move', strokes: [...sel.strokes], dx: c.dx, dy: c.dy }); redo = []; changed(); }
    updateToolbar();
    return;
  }
  if (c.erase) {
    if (c.removed.length) { undo.push({ type: 'erase', items: c.removed }); redo = []; changed(); }
  } else {
    const st = { tool: c.tool, color: c.color, size: c.size, pts: assistStroke(c) };
    strokes.push(st);
    drawStroke($('edInk').getContext('2d'), st, scale());
    undo.push({ type: 'add', stroke: st }); redo = [];
    changed();
  }
  clearLive();
  updateToolbar();
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
function openText(x, y) {
  let st = textAt(x, y), isNew = false;
  if (!st) {
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
    const inp = el('input.field', { id: 'fnInput', type: 'text', placeholder: 'z. B. x^2 - 2x + 1', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
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
    const ex = el('div.chips.left', null, ...['x^2', '0,5x^2 - 2', '2x + 1', '(x-1)^2 - 3', 'sqrt(x)', 'sin(x)', '1/x'].map((t) =>
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
$('edMath').addEventListener('click', (e) => {
  menu(e.currentTarget, [
    { label: 'Koordinatensystem …', icon: 'axes', onClick: axesFlow },
    { label: 'Funktionsgraph …', icon: 'graph', onClick: graphFlow },
    { label: 'Funktionsplotter …', icon: 'graph', onClick: plotterFlow },
    { label: 'Taschenrechner', icon: 'calc', onClick: () => import('./kit.js').then((m) => m.calcSheet()) },
    ...(page && page.kind !== 'blank' ? [{ label: 'Lernkarten aus Markiertem', icon: 'cards', onClick: async () => { finishStroke(); commitText(); await flushSave(); const m = await import('./markcards.js'); m.cardsFromMarks({ page, strokes, pageW: PAGE_W }); } }] : []),
    'sep',
    ...Object.entries(TOOL_NAMES).map(([k, label]) => ({ label: (tpl && tpl.type === k ? '✓ ' : '') + label, icon: 'tool-' + k, onClick: () => showTool(k) })),
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
  area.scrollLeft -= dx; area.scrollTop -= dy;
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
  const thumbCanvas = renderPage(pg, bg, list, 260);
  const thumb = await new Promise((r) => thumbCanvas.toBlob(r, 'image/jpeg', 0.7));
  await db.saveInk(pg.id, list, thumb);
}

// Bei Wechsel in eine andere App sofort sichern
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishStroke(); commitText(); flushSave(); } });

// für Tests
window.__editorState = () => ({ texts: strokes.filter((s) => s.tool === 'text').map((s) => ({ text: s.text, pts: s.pts.slice(), lh: s.lh })), editing: !!textEd, gridAssist, cur: !!cur, strokes: strokes.length, touches: touches.size, tpl: tpl && { ...tpl }, last: strokes.length ? strokes[strokes.length - 1].pts.slice() : null, sel: sel ? sel.strokes.size : 0 });
