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

// Seiten ohne erkannten Text, die ein Bild haben (Scans, PDF-Seiten)
export const needsOcr = (p) => p.kind !== 'blank' && p.ocr == null;

// pages: Liste von Seiten. onProgress(text). shouldStop(): true = abbrechen. Gibt Anzahl fertiger Seiten zurück.
export async function ocrPages(pages, onProgress = () => {}, shouldStop = () => false) {
  const todo = pages.filter(needsOcr);
  if (!todo.length) return 0;
  onProgress('Texterkennung wird geladen …');
  const T = await loadLib();
  const worker = await T.createWorker(['deu', 'eng'], 1, {
    workerPath: abs('vendor/tesseract/worker.min.js'),
    corePath: abs('vendor/tesseract/'),
    langPath: abs('vendor/tesseract/lang'),
    workerBlobURL: false,
    gzip: true,
  });
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
