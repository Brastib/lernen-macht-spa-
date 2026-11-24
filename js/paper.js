// Papier-Vorlagen und Zeichnen von Strichen.
// Alle Seiten benutzen "Seiten-Einheiten": Breite = 1000, Höhe je nach Seite.
// A4 (210 x 297 mm) -> 1000 x 1414. 1 mm = 1000/210 Einheiten.

export const PAGE_W = 1000;
export const A4_H = Math.round(PAGE_W * 297 / 210);
const MM = PAGE_W / 210;

export const PAPERS = {
  grid: 'Kariert',
  lined: 'Liniert',
  blank: 'Blanko',
  mm: 'Millimeter',
  music: 'Noten',
  cornell: 'Cornell',
};
// Cornell-Notizen: Stichwort-Spalte links, Kopf oben, Zusammenfassung unten
export const CORNELL = { cue: 62 * MM, head: 30 * MM, foot: 52 * MM };

// Linien-Abstände (für Zeichnen und die Karo-Hilfe)
export const GRID = 5 * MM;            // 5-mm-Kästchen
export const LINE_STEP = 9 * MM;       // Lineatur ca. 9 mm
export const LINE_TOP = 25 * MM;
// Welche Linien hat das Papier? gx = senkrechte Linien, gy = waagerechte (je [Abstand, Start])
export function paperLines(paper) {
  if (paper === 'grid') return { gx: [GRID, 0], gy: [GRID, 0] };
  if (paper === 'lined' || paper === 'cornell') return { gx: null, gy: [LINE_STEP, LINE_TOP] };
  if (paper === 'mm') return { gx: [MM, 0], gy: [MM, 0] };
  return null;
}

// ---------- Textfelder ----------
// Ein Textfeld ist ein "Strich" mit tool 'text': { tool, color, size, text, pts: [x, y, 0, x2, y2, 0] }
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
export const lineHeight = (size) => Math.round(size * 1.3 * 10) / 10;
let measureCtx = null;
export function textWidthMax(x) { return Math.max(120, PAGE_W - x - 12); }
// Text in Zeilen umbrechen (in Seiten-Einheiten)
export const lhOf = (st) => st.lh || lineHeight(st.size);
export function layoutText(text, size, maxW, lh = lineHeight(size)) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${size}px ${FONT}`;
  const lines = [];
  let w = 0;
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const test = line + word;
      if (line && measureCtx.measureText(test).width > maxW && word.trim()) {
        lines.push(line.replace(/\s+$/, '')); line = word.replace(/^\s+/, '');
      } else line = test;
    }
    lines.push(line);
  }
  for (const l of lines) w = Math.max(w, measureCtx.measureText(l).width);
  return { lines, w, h: lines.length * lh };
}
// Ecken des Textfelds neu berechnen (nach dem Tippen)
export function fitText(st) {
  const x = st.pts[0], y = st.pts[1];
  const { w, h } = layoutText(st.text, st.size, textWidthMax(x), lhOf(st));
  st.pts = [x, y, 0, Math.round((x + Math.max(w, st.size)) * 10) / 10, Math.round((y + h) * 10) / 10, 0];
}
function drawText(ctx, st, s) {
  const x = st.pts[0], y = st.pts[1], lh = lhOf(st);
  const { lines } = layoutText(st.text, st.size, textWidthMax(x), lh);
  ctx.save();
  ctx.fillStyle = st.color;
  ctx.font = `${st.size * s}px ${FONT}`;
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x * s, (y + (i + 0.5) * lh) * s));
  ctx.restore();
}

// ---------- Koordinatensystem ----------
// { tool: 'axes', color, size, ax: { xmin, xmax, ymin, ymax, unit }, pts: [links, oben, 0, rechts, unten, 0] }
// unit = Seiten-Einheiten pro 1 auf der Achse. Links/oben = Punkt (xmin | ymax).
export function axesFrame(st) {
  const { xmin, ymax, unit } = st.ax;
  return { ox: st.pts[0] - xmin * unit, oy: st.pts[1] + ymax * unit, unit };
}
export function axesBox(x0, y0, ax) {
  return [x0, y0, 0, x0 + (ax.xmax - ax.xmin) * ax.unit, y0 + (ax.ymax - ax.ymin) * ax.unit, 0];
}
function drawAxes(ctx, st, s) {
  const { xmin, xmax, ymin, ymax, unit } = st.ax;
  const { ox, oy } = axesFrame(st);
  const L = st.pts[0], T = st.pts[1], R = st.pts[3], B = st.pts[4];
  const ext = 4 * MM, tick = 1.2 * MM, arrow = 2.2 * MM;
  ctx.save();
  ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
  ctx.lineWidth = Math.max(1, (st.size || 2.2) * s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ln = (x1, y1, x2, y2) => { ctx.moveTo(x1 * s, y1 * s); ctx.lineTo(x2 * s, y2 * s); };
  ctx.beginPath();
  const ay = Math.min(B, Math.max(T, oy)), axx = Math.min(R, Math.max(L, ox));   // Achsen bleiben im Rahmen
  ln(L, ay, R + ext, ay); ln(R + ext - arrow, ay - arrow * 0.6, R + ext, ay); ln(R + ext - arrow, ay + arrow * 0.6, R + ext, ay);
  ln(axx, B, axx, T - ext); ln(axx - arrow * 0.6, T - ext + arrow, axx, T - ext); ln(axx + arrow * 0.6, T - ext + arrow, axx, T - ext);
  const every = unit < 3.2 * MM ? 5 : unit < 7 * MM ? 2 : 1;
  for (let v = Math.ceil(xmin); v <= xmax; v++) if (v !== 0 || oy !== ay) ln(ox + v * unit, ay - tick, ox + v * unit, ay + tick);
  for (let v = Math.ceil(ymin); v <= ymax; v++) if (v !== 0 || ox !== axx) ln(axx - tick, oy - v * unit, axx + tick, oy - v * unit);
  ctx.stroke();
  const fs = Math.min(15, Math.max(10, unit * 0.42));
  ctx.font = `${fs * s}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(xmin); v <= xmax; v++) if (v && v % every === 0) ctx.fillText(String(v).replace('-', '−'), (ox + v * unit) * s, (ay + tick + 1.2 * MM) * s);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(ymin); v <= ymax; v++) if (v && v % every === 0) ctx.fillText(String(v).replace('-', '−'), (axx - tick - 1.2 * MM) * s, (oy - v * unit) * s);
  if (ox === axx && oy === ay) { ctx.textBaseline = 'top'; ctx.fillText('0', (axx - 1.2 * MM) * s, (ay + 1.2 * MM) * s); }
  ctx.font = `italic ${(fs + 2) * s}px ${FONT}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText('x', (R + ext) * s, (ay + 2.2 * MM) * s);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('y', (axx + 2.2 * MM) * s, (T - ext) * s);
  ctx.restore();
}

// Papier auf ctx zeichnen. s = Pixel pro Seiten-Einheit.
export function drawPaper(ctx, paper, w, h, s) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w * s, h * s);
  if (paper === 'grid') {
    const step = GRID; // 5-mm-Kästchen wie im Schulheft
    ctx.strokeStyle = 'rgba(70, 120, 200, 0.28)';
    ctx.lineWidth = Math.max(1, 0.9 * s);
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, h * s); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y * s); ctx.lineTo(w * s, y * s); }
    ctx.stroke();
  } else if (paper === 'lined') {
    const step = LINE_STEP;
    const top = LINE_TOP;
    ctx.strokeStyle = 'rgba(70, 120, 200, 0.35)';
    ctx.lineWidth = Math.max(1, 1 * s);
    ctx.beginPath();
    for (let y = top; y < h - 10 * MM; y += step) { ctx.moveTo(0, y * s); ctx.lineTo(w * s, y * s); }
    ctx.stroke();
    // Rand links
    ctx.strokeStyle = 'rgba(220, 60, 60, 0.45)';
    ctx.beginPath(); ctx.moveTo(20 * MM * s, 0); ctx.lineTo(20 * MM * s, h * s); ctx.stroke();
  } else if (paper === 'mm') {
    // Millimeterpapier: 1 mm fein, 5 mm mittel, 1 cm kräftig
    const pass = (every, alpha, lw) => {
      ctx.strokeStyle = `rgba(214, 120, 40, ${alpha})`;
      ctx.lineWidth = Math.max(0.6, lw * s);
      ctx.beginPath();
      for (let i = every; i * MM < w; i += every) { const x = i * MM; ctx.moveTo(x * s, 0); ctx.lineTo(x * s, h * s); }
      for (let i = every; i * MM < h; i += every) { const y = i * MM; ctx.moveTo(0, y * s); ctx.lineTo(w * s, y * s); }
      ctx.stroke();
    };
    pass(1, 0.22, 0.45); pass(5, 0.38, 0.8); pass(10, 0.55, 1.3);
  } else if (paper === 'music') {
    // Notenlinien: Systeme aus 5 Linien (Abstand 2 mm)
    ctx.strokeStyle = 'rgba(40, 40, 50, 0.55)';
    ctx.lineWidth = Math.max(1, 0.9 * s);
    ctx.beginPath();
    for (let y = 22 * MM; y + 8 * MM < h - 12 * MM; y += 22 * MM) {
      for (let k = 0; k < 5; k++) { const yy = y + k * 2 * MM; ctx.moveTo(15 * MM * s, yy * s); ctx.lineTo((w - 15 * MM) * s, yy * s); }
    }
    ctx.stroke();
  } else if (paper === 'cornell') {
    const { cue, head, foot } = CORNELL;
    ctx.strokeStyle = 'rgba(70, 120, 200, 0.28)';
    ctx.lineWidth = Math.max(1, 0.9 * s);
    ctx.beginPath();
    for (let y = LINE_TOP; y < h - foot; y += LINE_STEP) { if (y > head) { ctx.moveTo(cue * s, y * s); ctx.lineTo(w * s, y * s); } }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(42, 85, 212, 0.6)';
    ctx.lineWidth = Math.max(1, 1.6 * s);
    ctx.beginPath();
    ctx.moveTo(0, head * s); ctx.lineTo(w * s, head * s);
    ctx.moveTo(cue * s, head * s); ctx.lineTo(cue * s, (h - foot) * s);
    ctx.moveTo(0, (h - foot) * s); ctx.lineTo(w * s, (h - foot) * s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(42, 85, 212, 0.55)';
    ctx.font = `600 ${11 * s}px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText('Thema · Datum', 4 * MM * s, 4 * MM * s);
    ctx.fillText('Stichworte / Fragen', 4 * MM * s, (head + 3 * MM) * s);
    ctx.fillText('Notizen', (cue + 4 * MM) * s, (head + 3 * MM) * s);
    ctx.fillText('Zusammenfassung', 4 * MM * s, (h - foot + 3 * MM) * s);
  }
}

// Ein Strich: { tool: 'pen'|'marker', color, size, pts: [x, y, druck, x, y, druck, ...] }
// Füllung (Farbeimer): Zeilen-Stücke [y, x0, x1, …] in Seiten-Einheiten, mit „Multiplizieren“ gemalt,
// damit Linien und Schrift darunter sichtbar bleiben.
const fillCache = new WeakMap();
function drawFill(ctx, st, s) {
  const sp = st.spans; if (!sp || !sp.length) return;
  const [ox, oy] = st.off || [0, 0];
  let c = fillCache.get(st);
  if (!c || c.s !== s || c.ox !== ox || c.oy !== oy) {
    const path = new Path2D();
    for (let i = 0; i < sp.length; i += 3) path.rect((sp[i + 1] + ox) * s, (sp[i] + oy) * s, (sp[i + 2] - sp[i + 1] + 1) * s, s + 0.6);
    c = { s, ox, oy, path }; fillCache.set(st, c);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = st.color;
  ctx.fill(c.path);
  ctx.restore();
}
export function fillHit(st, x, y) {
  const [ox, oy] = st.off || [0, 0], yy = Math.round(y - oy), xx = x - ox, sp = st.spans || [];
  for (let i = 0; i < sp.length; i += 3) if (sp[i] === yy && xx >= sp[i + 1] - 2 && xx <= sp[i + 2] + 2) return true;
  return false;
}

export function drawStroke(ctx, st, s, from = 3, tail = true) {
  // from/tail: für schnelles Live-Zeichnen nur neue Stücke (nur Stift)
  if (st.tool === 'text') { if (from <= 3) drawText(ctx, st, s); return; }
  if (st.tool === 'axes') { if (from <= 3) drawAxes(ctx, st, s); return; }
  if (st.tool === 'fill') { if (from <= 3) drawFill(ctx, st, s); return; }
  const p = st.pts;
  if (p.length < 3) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = st.color;
  ctx.fillStyle = st.color;
  if (st.tool === 'marker') {
    // Marker: gleich breit, durchsichtig, als ein Pfad (keine dunklen Überlappungen)
    ctx.globalAlpha = 0.35;
    ctx.lineCap = 'butt';
    ctx.lineWidth = st.size * s;
    ctx.beginPath();
    ctx.moveTo(p[0] * s, p[1] * s);
    if (p.length === 3) ctx.lineTo(p[0] * s + 0.1, p[1] * s);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * s, p[i + 1] * s);
    ctx.stroke();
  } else {
    // Stift: Breite folgt dem Druck des Pencils, weiche Kurven durch die Mittelpunkte
    const wOf = (pr) => Math.max(0.35, st.size * (0.35 + 0.9 * pr)) * s;
    if (p.length === 3) {
      if (from <= 3) { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, wOf(p[2]) / 2, 0, Math.PI * 2); ctx.fill(); }
    } else {
      for (let i = Math.max(3, from); i < p.length; i += 3) {
        const px = p[i - 3], py = p[i - 2], x = p[i], y = p[i + 1];
        const lx = i >= 6 ? (p[i - 6] + px) / 2 : px;
        const ly = i >= 6 ? (p[i - 5] + py) / 2 : py;
        const mx = (px + x) / 2, my = (py + y) / 2;
        ctx.lineWidth = wOf((p[i - 1] + p[i + 2]) / 2);
        ctx.beginPath();
        ctx.moveTo(lx * s, ly * s);
        ctx.quadraticCurveTo(px * s, py * s, mx * s, my * s);
        if (tail && i === p.length - 3) ctx.lineTo(x * s, y * s);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Seite komplett zeichnen (für Vorschau und Ansicht).
// bg: Bild (HTMLImageElement/ImageBitmap) oder null für Papier.
export function renderPage(page, bg, strokes, widthPx) {
  const h = pageHeight(page);
  const s = widthPx / PAGE_W;
  const c = document.createElement('canvas');
  c.width = Math.round(widthPx);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  if (bg) ctx.drawImage(bg, 0, 0, c.width, c.height);
  else drawPaper(ctx, page.paper || 'blank', PAGE_W, h, s);
  for (const st of strokes || []) drawStroke(ctx, st, s);
  return c;
}

export function pageHeight(page) {
  if (page.kind === 'blank') return Math.max(A4_H, page.h || 0);   // Heftseiten wachsen nach unten (page.h)
  return Math.round(PAGE_W * page.height / page.width);
}

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild defekt')); };
    img.src = url;
  });
}
