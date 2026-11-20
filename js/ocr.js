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
