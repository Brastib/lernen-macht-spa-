// Scannen: Foto holen, Ecken anpassen, gerade ziehen, verkleinern, speichern.
import * as db from './db.js';
import { $, busy, toast, kb } from './ui.js';
import { loadPhoto, rotateCanvas, detectPage, warp, compress, makeThumb, processScan } from './scanner.js';

const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- Foto holen ----------
let queue = [];           // weitere Fotos aus "Importieren"
let targetBook = db.INBOX_BOOK;
let onSaved = () => {};

// Scannen in ein bestimmtes Buch starten. Muss direkt aus einem Tipp kommen (iPad-Regel).
export function startScan(bookId, source = 'camera') {
  targetBook = bookId || db.INBOX_BOOK;
  $(source === 'camera' ? 'fileCamera' : 'filePhotos').click();
}
export function setOnSaved(fn) { onSaved = fn; }
$('fileCamera').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) startCrop(f); });
$('filePhotos').addEventListener('change', (e) => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  queue = files.slice(1);
  startCrop(files[0]);
});

// ---------- Zuschneiden ----------
let work = null;          // Arbeitsbild (Canvas)
let corners = null;       // 4 Ecken in Bild-Koordinaten [tl, tr, br, bl]
let mode = 'color';
try { mode = localStorage.getItem('scanMode') || 'color'; } catch (e) { /* egal */ }
let view = { s: 1, ox: 0, oy: 0 };

function setMode(m) {
  mode = m;
  try { localStorage.setItem('scanMode', m); } catch (e) { /* egal */ }
  $('modeColor').classList.toggle('on', m === 'color');
  $('modeGray').classList.toggle('on', m === 'gray');
  $('modePhoto').classList.toggle('on', m === 'photo');
  if (previewOn) renderPreview();
}
let previewOn = false, previewTimer = 0;
setMode(mode);
$('modeColor').addEventListener('click', () => setMode('color'));
$('modeGray').addEventListener('click', () => setMode('gray'));
$('modePhoto').addEventListener('click', () => setMode('photo'));

// Vorschau: zeigt das fertige Ergebnis (kleiner gerechnet, damit es schnell geht). Nochmal tippen = zurück zu den Ecken.
function setPreview(on) {
  previewOn = on;
  $('cropPreview').classList.toggle('on', on);
  $('scanPreview').hidden = !on;
  $('photo').style.visibility = on ? 'hidden' : '';
  $('overlay').style.visibility = on ? 'hidden' : '';
  $('cropAuto').disabled = on; $('cropFull').disabled = on; $('cropRotate').disabled = on;
  if (on) renderPreview();
}
function renderPreview() {
  clearTimeout(previewTimer);
  $('cropHint').textContent = 'Vorschau wird berechnet …';
  previewTimer = setTimeout(() => {
    if (!work || !previewOn) return;
    const out = processScan(warp(work, corners, 1300), mode);
    const stage = $('stage'), W = stage.clientWidth, H = stage.clientHeight, pad = 28;
    const s = Math.min((W - 2 * pad) / out.width, (H - 2 * pad) / out.height);
    const dw = Math.round(out.width * s), dh = Math.round(out.height * s), dpr = window.devicePixelRatio || 1;
    const c = $('scanPreview');
    c.width = Math.round(dw * dpr); c.height = Math.round(dh * dpr);
    c.style.width = dw + 'px'; c.style.height = dh + 'px';
    c.style.left = Math.round((W - dw) / 2) + 'px'; c.style.top = Math.round((H - dh) / 2) + 'px';
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(out, 0, 0, c.width, c.height);
    $('cropHint').textContent = 'Vorschau · Modus wählen, Auge = zurück zu den Ecken';
  }, 30);
}
$('cropPreview').addEventListener('click', () => setPreview(!previewOn));

async function startCrop(file) {
  busy(true, 'Foto wird geladen …');
  try {
    work = await loadPhoto(file);
    const r = detectPage(work);
    corners = r.corners;
    $('cropHint').textContent = r.found ? 'Seite erkannt · Auge oben zeigt das Ergebnis' : 'Keine Seite erkannt · Ecken bitte selbst setzen';
    $('crop').hidden = false;
    setPreview(false);
    $('cropSaveNext').textContent = queue.length ? `Speichern & weiter (${queue.length})` : 'Speichern & weiter';
    layout();
  } catch (err) {
    console.error(err);
    toast('Fehler beim Laden: ' + err.message, 4000);
  } finally {
    busy(false);
  }
}

function layout() {
  if (!work || $('crop').hidden) return;
  const stage = $('stage');
  const W = stage.clientWidth, H = stage.clientHeight, pad = 28;
  const s = Math.min((W - 2 * pad) / work.width, (H - 2 * pad) / work.height);
  const dw = Math.round(work.width * s), dh = Math.round(work.height * s);
  view = { s, ox: Math.round((W - dw) / 2), oy: Math.round((H - dh) / 2) };
  const c = $('photo');
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(dw * dpr); c.height = Math.round(dh * dpr);
  c.style.width = dw + 'px'; c.style.height = dh + 'px';
  c.style.left = view.ox + 'px'; c.style.top = view.oy + 'px';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, 0, 0, c.width, c.height);
  const svg = $('overlay');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.style.left = '0px'; svg.style.top = '0px';
  drawOverlay();
}
window.addEventListener('resize', () => { layout(); if (previewOn) renderPreview(); });

const toScreen = ([x, y]) => [view.ox + x * view.s, view.oy + y * view.s];
const toImage = ([x, y]) => [
  Math.min(work.width, Math.max(0, (x - view.ox) / view.s)),
  Math.min(work.height, Math.max(0, (y - view.oy) / view.s)),
];

function drawOverlay() {
  const svg = $('overlay');
  svg.textContent = '';
  const pts = corners.map(toScreen);
  const poly = document.createElementNS(SVGNS, 'polygon');
  poly.setAttribute('points', pts.map(p => p.join(',')).join(' '));
  svg.append(poly);
  pts.forEach((p, i) => {
    const h = document.createElementNS(SVGNS, 'circle');
    h.setAttribute('class', 'h'); h.setAttribute('r', 22);
    h.setAttribute('cx', p[0]); h.setAttribute('cy', p[1]);
    h.dataset.i = i;
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', 'dot'); dot.setAttribute('r', 4);
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
    svg.append(h, dot);
  });
}

// Ziehen mit Finger, Maus oder Apple Pencil (Pointer Events)
let drag = null;
$('overlay').addEventListener('pointerdown', (e) => {
  const svg = $('overlay');
  const r = svg.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  // nächste Ecke finden (auch wenn nicht genau getroffen)
  let best = -1, bd = Infinity;
  corners.map(toScreen).forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
  if (best < 0 || bd > 70) return;
  const p = toScreen(corners[best]);
  drag = { i: best, id: e.pointerId, dx: p[0] - x, dy: p[1] - y };
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  e.preventDefault();
});
$('overlay').addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const r = $('overlay').getBoundingClientRect();
  corners[drag.i] = toImage([e.clientX - r.left + drag.dx, e.clientY - r.top + drag.dy]);
  drawOverlay();
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
$('overlay').addEventListener('pointerup', endDrag);
$('overlay').addEventListener('pointercancel', endDrag);

$('cropRotate').addEventListener('click', () => {
  const W = work.height;
  work = rotateCanvas(work);
  // Ecken mitdrehen: (x,y) -> (H_alt - y, x); Reihenfolge bleibt oben-links zuerst
  corners = corners.map(([x, y]) => [W - y, x]);
  corners = [corners[3], corners[0], corners[1], corners[2]];
  layout();
});
$('cropFull').addEventListener('click', () => {
  corners = [[0, 0], [work.width, 0], [work.width, work.height], [0, work.height]];
  drawOverlay();
});
$('cropAuto').addEventListener('click', () => {
  const r = detectPage(work);
  corners = r.corners;
  if (!r.found) toast('Keine Seite erkannt.');
  drawOverlay();
});
$('cropCancel').addEventListener('click', () => {
  closeCrop();
  if (queue.length) startCrop(queue.shift());
});

function closeCrop() { setPreview(false); $('crop').hidden = true; work = null; corners = null; }

// Verarbeitung läuft der Reihe nach, damit „Speichern + nächste“ sofort die Kamera öffnen kann.
let chain = Promise.resolve();
function processAndSave(canvas, cs, m) {
  const target = targetBook;
  chain = chain.then(async () => {
    try {
      const t0 = performance.now();
      const flat = processScan(warp(canvas, cs), m);
      const { blob, width, height } = await compress(flat);
      const thumb = await makeThumb(flat);
      await db.addPage({ bookId: target, image: blob, thumb, width, height });
      const ms = Math.round(performance.now() - t0);
      toast(`Seite gespeichert · ${kb(blob.size)}`);
      console.log('[scan] gespeichert', { bytes: blob.size, width, height, ms });
      await onSaved(target);
    } catch (err) {
      console.error(err);
      toast('Speichern fehlgeschlagen: ' + err.message, 5000);
    }
  });
  return chain;
}

$('cropSave').addEventListener('click', async () => {
  const c = work, cs = corners.map(p => [...p]);
  closeCrop();
  busy(true, 'Wird gespeichert …');
  await processAndSave(c, cs, mode);
  busy(false);
  if (queue.length) startCrop(queue.shift());
});
$('cropSaveNext').addEventListener('click', () => {
  const c = work, cs = corners.map(p => [...p]);
  closeCrop();
  // Kamera muss direkt im Tipp geöffnet werden (iPad-Regel), Speichern läuft nebenbei.
  if (queue.length) { const next = queue.shift(); processAndSave(c, cs, mode); startCrop(next); }
  else { $('fileCamera').click(); processAndSave(c, cs, mode); }
});

