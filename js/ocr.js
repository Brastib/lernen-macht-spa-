// Texterkennung (OCR) für die Suche: findet gedruckten Text auf Scans und PDF-Seiten.
// Handschrift erkennt Tesseract kaum. Läuft komplett auf dem Gerät (Tesseract.js 5, Apache-2.0,
// Sprachdaten Deutsch + Englisch aus vendor/tesseract). Wird erst geladen, wenn man es benutzt.
import * as db from './db.js';

let libP = null;
function loadLib() {
  if (!libP) {
    libP = new Promise((resolve, reject) => {
      if (window.Tesseract) { resolve(window.Tesseract); return; }
      const s = document.createElement('script');
      s.src = 'vendor/tesseract/tesseract.min.js';
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Texterkennung fehlt')));
      s.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden'));
      document.head.append(s);
    });
    libP.catch(() => { libP = null; });
  }
  return libP;
}
const abs = (p) => new URL(p, document.baseURI).href;

async function makeWorker() {
  const T = await loadLib();
  return T.createWorker(['deu', 'eng'], 1, {
    workerPath: abs('vendor/tesseract/worker.min.js'),
    corePath: abs('vendor/tesseract/'),
    langPath: abs('vendor/tesseract/lang'),
    workerBlobURL: false,
    gzip: true,
  });
}

// Wörter mit Position (in Seiten-Einheiten, Seite ist PAGE_W breit). Für „Lernkarten aus Markiertem“.
// Speichert nebenbei den erkannten Text der Seite, falls er noch fehlt.
export async function ocrWords(p, pageW, onProgress = () => {}) {
  const blob = await db.getImage(p.id);
  if (!blob) return [];
  onProgress('Texterkennung wird geladen …');
  const worker = await makeWorker();
  try {
    onProgress('Text auf der Seite wird erkannt …');
    const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
    const k = pageW / p.width;
    const words = [];
    let li = 0;
    for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const l of par.lines || []) {
      li++;
      for (const w of l.words || []) {
        const t = (w.text || '').trim();
        if (!t) continue;
        const bb = w.bbox;
        words.push({ text: t, conf: w.confidence, line: li, x0: bb.x0 * k, y0: bb.y0 * k, x1: bb.x1 * k, y1: bb.y1 * k });
      }
    }
    if (p.ocr == null) {
      const text = (data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      await db.updatePage(p.id, { ocr: text, ocrAt: Date.now() }); p.ocr = text;
    }
    return words;
  } finally { await worker.terminate(); }
}

// Seiten ohne erkannten Text, die ein Bild haben (Scans, PDF-Seiten)
export const needsOcr = (p) => p.kind !== 'blank' && p.ocr == null;

// pages: Liste von Seiten. onProgress(text). shouldStop(): true = abbrechen. Gibt Anzahl fertiger Seiten zurück.
export async function ocrPages(pages, onProgress = () => {}, shouldStop = () => false) {
  const todo = pages.filter(needsOcr);
  if (!todo.length) return 0;
  onProgress('Texterkennung wird geladen …');
  const worker = await makeWorker();
  let done = 0;
  try {
    for (const p of todo) {
      if (shouldStop()) break;
      onProgress(`Text wird erkannt … Seite ${done + 1} von ${todo.length}`);
      const blob = await db.getImage(p.id);
      if (!blob) { await db.updatePage(p.id, { ocr: '' }); continue; }
      const { data } = await worker.recognize(blob);
      const text = (data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      await db.updatePage(p.id, { ocr: text, ocrAt: Date.now() });
      p.ocr = text;
      done++;
    }
  } finally {
    await worker.terminate();
  }
  return done;
}

// Textstelle um den Treffer herum (für die Suchergebnisse)
export function snippet(text, q, norm) {
  const n = norm(text);
  const i = n.indexOf(q);
  if (i < 0) return '';
  const a = Math.max(0, i - 30), b = Math.min(text.length, i + q.length + 40);
  return (a ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}

// ---------- Handschrift (Versuch) ----------
// Tesseract ist für gedruckten Text gebaut. Saubere Druckbuchstaben klappen manchmal, Schreibschrift kaum.
// Deshalb: nur die eigenen Stift-Striche schwarz auf Weiß zeichnen, zuschneiden, lesen und als „unsicher“ speichern.
const INK_TOOLS = new Set(['pen', 'line']);
export const hasInk = (p) => (p.strokes || 0) > 0;
export const needsInk = (p) => hasInk(p) && (!p.inkAt || (p.edited || 0) > p.inkAt);

export function inkCanvas(strokes, drawStroke) {
  const pen = (strokes || []).filter((s) => (INK_TOOLS.has(s.tool) || !s.tool) && s.pts && s.pts.length >= 3);
  if (!pen.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of pen) for (let i = 0; i + 1 < s.pts.length; i += 3) { const x = s.pts[i], y = s.pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 24, w = x1 - x0 + pad * 2, hh = y1 - y0 + pad * 2;
  const k = Math.min(3, 2400 / Math.max(w, hh));
  const c = document.createElement('canvas');
  c.width = Math.max(32, Math.round(w * k)); c.height = Math.max(32, Math.round(hh * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.translate((pad - x0) * k, (pad - y0) * k);
  for (const s of pen) drawStroke(x, { ...s, color: '#000', size: Math.max(s.size || 2, 2.2) }, k);
  return c;
}

export async function readInk(pages, drawStroke, onProgress = () => {}, shouldStop = () => false) {
  const todo = pages.filter(needsInk);
  if (!todo.length) return 0;
  onProgress('Texterkennung wird geladen …');
  const worker = await makeWorker();
  let done = 0;
  try {
    for (const p of todo) {
      if (shouldStop()) break;
      onProgress(`Handschrift wird gelesen … Seite ${done + 1} von ${todo.length}`);
      const ink = await db.getInk(p.id);
      let text = '';
      // Eigene trainierte Schrift (Meine Schrift) zuerst, sonst Tesseract
      let mine = '';
      try { const mh = await import('./myhand.js'); if (await mh.ready()) mine = (await mh.readStrokes(ink)).trim(); } catch (e) { /* egal */ }
      const c = mine ? null : inkCanvas(ink, drawStroke);
      if (mine) text = mine;
      if (c) {
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
        const words = [];
        for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const l of par.lines || []) for (const w of l.words || []) {
          const t = (w.text || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
          if (t.length >= 2 && w.confidence >= 35 && /\p{L}/u.test(t)) words.push(t);
        }
        text = words.join(' ');
      }
      const at = Date.now();
      await db.updatePage(p.id, { ink: text, inkAt: at });
      p.ink = text; p.inkAt = at;
      done++;
    }
  } finally { await worker.terminate(); }
  return done;
}

// Unscharfe Suche für unsichere Handschrift: ein Wort darf ein paar Buchstaben falsch haben
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Gibt das gefundene Wort zurück oder ''
export function fuzzyFind(text, q, norm) {
  if (!text || !q) return '';
  const n = norm(text);
  if (n.includes(q)) { const i = n.indexOf(q); return text.slice(i, i + q.length); }
  if (q.length < 5 || /\s/.test(q)) return '';
  const max = q.length >= 9 ? 2 : 1;
  const words = text.split(/\s+/);
  for (const w of words) { const nw = norm(w); if (lev(nw, q, max) <= max || nw.length > q.length && lev(nw.slice(0, q.length), q, max) <= max && nw.length - q.length <= 3) return w; }
  return '';
}

// Wörter mit Position auf einem fertigen Bild (Canvas), in Pixeln dieses Bildes. Für „Vokabeln aus Scan“.
// psm '3' = automatisch (Spalten getrennt, klappt bei Vokabelteilen am besten), '6' = ein Textblock.
export async function ocrCanvasWords(canvas, { psm = '3', onProgress = () => {} } = {}) {
  onProgress('Texterkennung wird geladen …');
  const worker = await makeWorker();
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
    onProgress('Vokabeln werden gelesen …');
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words = [];
    let li = 0;
    for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const l of par.lines || []) {
      li++;
      for (const w of l.words || []) {
        const t = (w.text || '').trim();
        if (!t) continue;
        const bb = w.bbox;
        words.push({ text: t, conf: w.confidence, line: li, x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 });
      }
    }
    return words;
  } finally { await worker.terminate(); }
}
