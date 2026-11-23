// Bildverarbeitung: Seite finden, gerade ziehen, verbessern, verkleinern.
// Alles läuft lokal im Browser, ohne Internet und ohne Zusatz-Bibliotheken.

export const MAX_BYTES = 420 * 1024;   // Ziel: unter 420 KB pro Seite (scharf genug zum Heranzoomen)
const WORK_MAX = 2800;                 // Arbeitsgröße des Fotos (längste Seite)
const OUT_MAX = 2200;                  // Größe der fertigen Seite (längste Seite)
const DETECT_MAX = 360;                // kleine Kopie nur für die Seiten-Erkennung

// Foto-Datei laden und auf Arbeitsgröße bringen.
// Safari dreht Fotos beim Zeichnen automatisch richtig (EXIF).
export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      i.src = url;
    });
    const s = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Bild um 90° drehen (im Uhrzeigersinn).
export function rotateCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

// ---------- Seiten-Erkennung ----------
// Idee: Das Blatt ist meist heller als der Hintergrund (Tisch).
// 1. kleine Graustufen-Kopie, leicht weichzeichnen
// 2. Helligkeits-Schwelle automatisch bestimmen (Otsu)
// 3. größte zusammenhängende helle Fläche suchen
// 4. deren 4 äußerste Ecken nehmen
// Ergebnis sind Ecken in Koordinaten des Arbeitsbildes.
// Wenn nichts Sinnvolles gefunden wird: Rahmen mit etwas Abstand zum Rand.
export function detectPage(canvas) {
  const W = canvas.width, H = canvas.height;
  const s = Math.min(1, DETECT_MAX / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Graustufen
  let g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  g = boxBlur(g, w, h, 2);

  // Otsu-Schwelle
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[Math.min(255, g[i] | 0)]++;
  const thr = otsu(hist, g.length);

  // größte helle Fläche (4er-Nachbarschaft)
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) mask[i] = g[i] > thr ? 1 : 0;
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0, bestLabel = 0, cur = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    cur++;
    let sp = 0, count = 0;
    stack[sp++] = i; label[i] = cur;
    while (sp) {
      const p = stack[--sp]; count++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
    }
    if (count > best) { best = count; bestLabel = cur; }
  }

  const fallback = defaultCorners(W, H);
  if (!bestLabel || best < 0.12 * w * h) return { corners: fallback, found: false };

  // Ecken: kleinste/größte x+y und x-y
  let tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0];
  let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  let touchesAll = 0;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % w, y = (i / w) | 0;
    const sm = x + y, df = x - y;
    if (sm < minS) { minS = sm; tl = [x, y]; }
    if (sm > maxS) { maxS = sm; br = [x, y]; }
    if (df > maxD) { maxD = df; tr = [x, y]; }
    if (df < minD) { minD = df; bl = [x, y]; }
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesAll++;
  }
  const corners = [tl, tr, br, bl].map(([x, y]) => [(x + 0.5) / s, (y + 0.5) / s]);
  const area = polyArea(corners);
  // Fläche zu klein, oder die helle Fläche ist eher der Hintergrund -> Rahmen
  // Ein echtes Blatt füllt sein Viereck fast ganz aus (Rauschen/Muster nicht).
  const fill = best / (area * s * s);
  if (area < 0.12 * W * H || fill < 0.8 || touchesAll > 0.6 * 2 * (w + h)) return { corners: fallback, found: false };
  return { corners, found: true };
}

export function defaultCorners(W, H) {
  const mx = W * 0.06, my = H * 0.06;
  return [[mx, my], [W - mx, my], [W - mx, H - my], [mx, H - my]];
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -r; x < w; x++) {
      if (x + r < w) { acc += src[y * w + x + r]; n++; }
      if (x - r - 1 >= 0) { acc -= src[y * w + x - r - 1]; n--; }
      if (x >= 0) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
      if (y >= 0) out[y * w + x] = acc / n;
    }
  }
  return out;
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

export function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ---------- Gerade ziehen (Perspektive) ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Berechnet eine Matrix, die Ziel-Punkte (Rechteck) auf Foto-Punkte abbildet.
function homography(from, to) {
  // löst 8 Gleichungen für h11..h32 (h33 = 1)
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const div = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= div;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map(r => r[n]);
}

export function warp(srcCanvas, corners) {
  const [tl, tr, br, bl] = corners;
  let ow = Math.max(dist(tl, tr), dist(bl, br));
  let oh = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, OUT_MAX / Math.max(ow, oh));
  ow = Math.max(8, Math.round(ow * s)); oh = Math.max(8, Math.round(oh * s));

  const H = homography([[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]], [tl, tr, br, bl]);
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const src = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;

  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const octx = out.getContext('2d', { willReadFrequently: true });
  const od = octx.createImageData(ow, oh);
  const o = od.data;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const z = H[6] * x + H[7] * y + 1;
      let u = (H[0] * x + H[1] * y + H[2]) / z;
      let v = (H[3] * x + H[4] * y + H[5]) / z;
      if (u < 0) u = 0; else if (u > sw - 1.001) u = sw - 1.001;
      if (v < 0) v = 0; else if (v > sh - 1.001) v = sh - 1.001;
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const k = (y * ow + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const a = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * fx;
        const c = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * fx;
        o[k + ch] = a + (c - a) * fy;
      }
      o[k + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

// ---------- Verbessern ----------
// mode: 'color' = Farbe, leicht kontrastreicher
//       'gray'  = Graustufen, Papier wird weiß (kleinste Dateien, gut für Text)
export function enhance(canvas, mode = 'color') {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
  const total = d.length / 4;
  const pct = (p) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= total * p) return i; } return 255; };
  const lo = pct(0.02);
  const hi = Math.max(lo + 30, pct(mode === 'gray' ? 0.80 : 0.97));
  const scale = 255 / (hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = (i - lo) * scale;
  if (mode === 'gray') {
    for (let i = 0; i < d.length; i += 4) {
      const v = lut[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0];
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}


// ---------- Schärfer und gerader ----------
// Schatten und ungleichmäßiges Licht entfernen: Papierhelligkeit schätzen (Text herausfiltern) und ausgleichen.
export function flatten(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const S = 8, sw = Math.ceil(w / S), sh = Math.ceil(h / S), R = 3;
  // Je Farbkanal: hellster Wert je Block = Papier. So verschwindet auch ein Farbstich (gelbes Licht).
  const bgs = [0, 1, 2].map((ch) => {
    const small = new Float32Array(sw * sh);
    for (let by = 0; by < sh; by++) for (let bx = 0; bx < sw; bx++) {
      let mx = 0;
      for (let y = by * S; y < Math.min(h, by * S + S); y += 2) for (let x = bx * S; x < Math.min(w, bx * S + S); x += 2) { const v = d[(y * w + x) * 4 + ch]; if (v > mx) mx = v; }
      small[by * sw + bx] = mx;
    }
    const dil = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let mx = 0;
      for (let yy = Math.max(0, y - R); yy <= Math.min(sh - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(sw - 1, x + R); xx++) if (small[yy * sw + xx] > mx) mx = small[yy * sw + xx];
      dil[y * sw + x] = mx;
    }
    return boxBlur(dil, sw, sh, 4);
  });
  const [bR, bG, bB] = bgs;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1.001, Math.max(0, y / S - 0.5)), y0 = fy | 0, ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1.001, Math.max(0, x / S - 0.5)), x0 = fx | 0, tx = fx - x0;
      const i0 = y0 * sw + x0, i1 = i0 + 1, i2 = i0 + sw, i3 = i2 + 1;
      const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty), w2 = (1 - tx) * ty, w3 = tx * ty;
      const r = bR[i0] * w0 + bR[i1] * w1 + bR[i2] * w2 + bR[i3] * w3;
      const g = bG[i0] * w0 + bG[i1] * w1 + bG[i2] * w2 + bG[i3] * w3;
      const bb = bB[i0] * w0 + bB[i1] * w1 + bB[i2] * w2 + bB[i3] * w3;
      const L = 0.299 * r + 0.587 * g + 0.114 * bb;
      const lim = L < 110 ? 1.25 : 2.4;   // dunkle Flächen (Bilder) kaum anfassen
      const i = (y * w + x) * 4;
      d[i] = Math.min(255, d[i] * Math.min(lim, 250 / Math.max(1, r)));
      d[i + 1] = Math.min(255, d[i + 1] * Math.min(lim, 250 / Math.max(1, g)));
      d[i + 2] = Math.min(255, d[i + 2] * Math.min(lim, 250 / Math.max(1, bb)));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Schräglage der Textzeilen finden (bis ±5°) und gerade drehen
export function skewAngle(canvas) {
  const W = 700, f = Math.min(1, W / canvas.width);
  const w = Math.round(canvas.width * f), h = Math.round(canvas.height * f);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const pts = [];
  const m = Math.round(w * 0.05);
  for (let yy = m; yy < h - m; yy++) for (let xx = m; xx < w - m; xx++) {
    const i = (yy * w + xx) * 4;
    if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110) pts.push(xx, yy);
  }
  const n = pts.length / 2;
  if (n < 400 || n > w * h * 0.25) return 0;
  const score = (deg) => {
    const t = Math.tan(deg * Math.PI / 180), bins = new Float32Array(h * 2 + 8);
    for (let i = 0; i < pts.length; i += 2) { const b = Math.round(pts[i + 1] - pts[i] * t + h * 0.5); if (b >= 0 && b < bins.length) bins[b]++; }
    let s = 0; for (let i = 1; i < bins.length; i++) { const v = bins[i] - bins[i - 1]; s += v * v; }
    return s;
  };
  let best = 0, bs = score(0);
  for (let a = -5; a <= 5.001; a += 0.5) { const sc = score(a); if (sc > bs) { bs = sc; best = a; } }
  for (let a = best - 0.45; a <= best + 0.451; a += 0.15) { const sc = score(a); if (sc > bs) { bs = sc; best = a; } }
  return Math.abs(best) < 0.25 ? 0 : best;
}
export function deskew(canvas) {
  const a = skewAngle(canvas);
  if (!a) return canvas;
  const r = -a * Math.PI / 180, w = canvas.width, h = canvas.height;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const x = out.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  // leicht vergrößern, damit keine weißen Ecken entstehen
  const k = 1 + Math.abs(Math.sin(r)) * Math.max(w / h, h / w);
  x.translate(w / 2, h / 2); x.rotate(r); x.scale(k, k);
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, -w / 2, -h / 2);
  return out;
}

// Schärfen (Unscharf maskieren auf der Helligkeit)
export function sharpen(canvas, amount = 0.6) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const B = boxBlur(L, w, h, 1);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) {
    const diff = (L[j] - B[j]) * amount;
    if (diff > -2 && diff < 2) continue;
    d[i] = Math.max(0, Math.min(255, d[i] + diff)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + diff)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + diff));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Sieht die Seite nach Foto/Scan aus (graues oder ungleich helles Papier)? Saubere digitale PDFs bleiben dann unverändert.
export function looksScanned(canvas) {
  const W = 400, f = Math.min(1, W / canvas.width);
  const w = Math.max(8, Math.round(canvas.width * f)), h = Math.max(8, Math.round(canvas.height * f));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, S = 10, vals = [];
  for (let by = 0; by + S <= h; by += S) for (let bx = 0; bx + S <= w; bx += S) {
    let mx = 0;
    for (let y = by; y < by + S; y++) for (let xx = bx; xx < bx + S; xx++) { const i = (y * w + xx) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; if (l > mx) mx = l; }
    vals.push(mx);
  }
  if (!vals.length) return false;
  vals.sort((a, b) => a - b);
  const q = (t) => vals[Math.min(vals.length - 1, Math.floor(vals.length * t))];
  const paper = q(0.7), spread = q(0.9) - q(0.35);
  return paper < 244 || spread > 16;
}
// Komplett säubern: gerade drehen (optional), Schatten weg, Kontrast, schärfen
export function cleanCanvas(canvas, { straighten = true } = {}) {
  return sharpen(enhance(flatten(straighten ? deskew(canvas) : canvas), 'color'), 0.5);
}

// ---------- Verkleinern ----------
function toBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

function scaled(canvas, f) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * f));
  c.height = Math.max(1, Math.round(canvas.height * f));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

// Speichert so klein wie nötig: erst Qualität senken, dann Größe.
export async function compress(canvas, maxBytes = MAX_BYTES) {
  let c = canvas;
  for (let round = 0; round < 6; round++) {
    for (const q of [0.78, 0.68, 0.58, 0.5]) {
      const blob = await toBlob(c, 'image/jpeg', q);
      if (blob && blob.size <= maxBytes) return { blob, width: c.width, height: c.height, quality: q };
    }
    c = scaled(c, 0.85);
  }
  const blob = await toBlob(c, 'image/jpeg', 0.45);
  return { blob, width: c.width, height: c.height, quality: 0.45 };
}

export async function makeThumb(canvas, width = 260) {
  const f = Math.min(1, width / canvas.width);
  return toBlob(scaled(canvas, f), 'image/jpeg', 0.6);
}
