// PDF rein und raus.
// Import: jede PDF-Seite wird ein Bild (wie ein Scan) und kann danach beschriftet werden.
//   Dafür wird pdf.js (Mozilla, Apache-2.0) aus vendor/ nachgeladen, erst wenn es gebraucht wird.
// Export: eigene kleine PDF-Erzeugung ohne Bibliothek. Jede Seite (Scan oder Blatt + Pencil + Text)
//   wird als JPEG-Bild in eine A4-Seite gelegt.
import * as db from './db.js';
import { compress, makeThumb, looksScanned, cleanCanvas } from './scanner.js';
import { renderPage, blobToImage } from './paper.js';

let libPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Konnte ' + src + ' nicht laden'));
    document.head.append(s);
  });
}
function pdfLib() {
  if (!libPromise) {
    libPromise = (async () => {
      if (!window.pdfjsLib) await loadScript('vendor/pdf.min.js');
      const lib = window.pdfjsLib;
      if (!lib) throw new Error('PDF-Leser fehlt');
      lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
      return lib;
    })();
    libPromise.catch(() => { libPromise = null; });
  }
  return libPromise;
}

// PDF-Datei in ein Buch übernehmen. onProgress(seite, gesamt)
export async function importPdf(file, bookId, onProgress = () => {}, { autoClean = true } = {}) {
  let nClean = 0;
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = doc.numPages;
  const added = [];
  for (let i = 1; i <= n; i++) {
    onProgress(i, n);
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(4, 2200 / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // Eingescannte PDF-Seiten automatisch säubern, das Original bleibt gespeichert
    let clean = null;
    if (autoClean && looksScanned(c)) {
      const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0);
      clean = cleanCanvas(cc);
    }
    const out = await compress(clean || c);
    const thumb = await makeThumb(clean || c);
    const pg = await db.addPage({ bookId, image: out.blob, thumb, width: out.width, height: out.height });
    if (clean) {
      const orig = await compress(c);
      await db.replaceImage(pg.id, orig.blob, thumb);           // Original kurz hinlegen …
      await db.replaceImage(pg.id, out.blob, thumb, { keepOrig: true, cleaned: true });   // … und als Original aufheben
      pg.cleaned = Date.now(); nClean++;
    }
    added.push(pg);
    page.cleanup();
    c.width = c.height = 1;
  }
  await doc.destroy();
  added.cleaned = nClean;
  return added;
}

// ---------- PDF schreiben ----------
export async function exportPdf(pages, onProgress = () => {}) {
  const imgs = [];
  let i = 0;
  for (const p of pages) {
    onProgress(++i, pages.length);
    const blob = p.kind === 'blank' ? null : await db.getImage(p.id);
    const bg = blob ? await blobToImage(blob) : null;
    const strokes = await db.getInk(p.id);
    const c = renderPage(p, bg, strokes, 1240);   // ca. 150 dpi auf A4
    const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    imgs.push({ bytes: new Uint8Array(await jpg.arrayBuffer()), w: c.width, h: c.height });
    c.width = c.height = 1;
  }
  return buildPdf(imgs);
}

export function buildPdf(images) {
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (num, ...body) => { offsets[num] = len; push(`${num} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n%âãÏÓ\n');
  const n = images.length;
  const total = 2 + 3 * n;
  const kids = images.map((_, k) => `${3 + 3 * k} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  images.forEach((im, k) => {
    const W = 595.28, H = +(W * im.h / im.w).toFixed(2);
    const pg = 3 + 3 * k, cs = pg + 1, xo = pg + 2;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${k} ${xo} 0 R >> >> /Contents ${cs} 0 R >>`);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${k} Do Q`;
    obj(cs, `<< /Length ${content.length} >>\nstream\n`, content, '\nendstream');
    obj(xo, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream');
  });
  const xref = len;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= total; k++) x += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
