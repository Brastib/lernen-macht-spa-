// Gemeinsame Zeichen-Helfer für die Papier-Spiele (Paket 2 und 3): kariertes Papier, krakelige Bleistift-Linien, Schraffur.
import { h, icon } from './ui.js';

export const FONT = '"Noteworthy","Marker Felt","Segoe Print","Comic Sans MS",system-ui,sans-serif';
export const UIFONT = 'system-ui,-apple-system,sans-serif';
export const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
export const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const inkOf = (dark) => (dark ? '#e8ecf4' : '#26262b');
export const paperOf = (dark) => (dark ? '#1b1f28' : '#fbfaf5');

// Papier mit Karos über die ganze Fläche
export function paper(x, w, hh, dark, step = 24, ox = 0, oy = 0) {
  x.fillStyle = paperOf(dark); x.fillRect(0, 0, w, hh);
  x.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(60,100,170,.12)'; x.lineWidth = 1; x.beginPath();
  for (let gx = ((ox % step) + step) % step; gx < w; gx += step) { x.moveTo(Math.round(gx) + 0.5, 0); x.lineTo(Math.round(gx) + 0.5, hh); }
  for (let gy = ((oy % step) + step) % step; gy < hh; gy += step) { x.moveTo(0, Math.round(gy) + 0.5); x.lineTo(w, Math.round(gy) + 0.5); }
  x.stroke();
}
// krakelige Linie von a nach b (zwei leicht versetzte Striche wie mit Bleistift)
export function pline(x, x0, y0, x1, y1, seed = 1, j = 1.2) {
  const R = rng(seed * 7919 + 13), n = Math.max(2, Math.min(8, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40)));
  x.beginPath();
  for (let k = 0; k <= n; k++) { const t = k / n, ox = (R() - 0.5) * j * 2, oy = (R() - 0.5) * j * 2; k ? x.lineTo(x0 + (x1 - x0) * t + ox, y0 + (y1 - y0) * t + oy) : x.moveTo(x0 + ox, y0 + oy); }
  x.stroke();
}
// krakeliges Rechteck (Pfad)
export function prect(x, X, Y, W, H, seed = 1, j = 1) {
  const R = rng(seed * 104729 + 7), p = () => (R() - 0.5) * j * 2;
  x.beginPath();
  x.moveTo(X + p(), Y + p()); x.lineTo(X + W + p(), Y + p()); x.lineTo(X + W + p(), Y + H + p()); x.lineTo(X + p(), Y + H + p()); x.closePath();
}
// leicht unrunder Kreis (Pfad)
export function pcirc(x, cx, cy, r, seed = 1, j = 0.06) {
  const R = rng(seed * 15485863 + 3);
  x.beginPath();
  for (let k = 0; k <= 26; k++) { const t = k / 24 * Math.PI * 2 + 0.4, rr = r * (1 + (R() - 0.5) * j); k ? x.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr) : x.moveTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); }
}
// Buntstift-Schraffur in einem Rechteck
export function hatch(x, X, Y, W, H, color, gap = 6, alpha = 0.55, lw = 1.3) {
  x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
  x.strokeStyle = color; x.globalAlpha *= alpha; x.lineWidth = lw; x.beginPath();
  for (let d = -H; d < W; d += gap) { x.moveTo(X + d, Y + H); x.lineTo(X + d + H, Y); }
  x.stroke(); x.restore();
}
// Farbe aufhellen/abdunkeln (#rrggbb, k -1..1)
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Canvas, das seine Box ausfüllt. draw(x, cw, ch) zeichnet in CSS-Pixeln.
export function canvasBox(parent, cls = '') {
  const cv = h('canvas.stkcv');
  const box = h('div.stkwrap' + cls, null, cv);
  parent.append(box);
  const x = cv.getContext('2d');
  const o = { box, cv, x, cw: 1, ch: 1, dpr: 1 };
  const size = () => { const r = box.getBoundingClientRect(); o.dpr = Math.min(2, devicePixelRatio || 1); o.cw = Math.max(1, r.width); o.ch = Math.max(1, r.height); cv.width = Math.round(o.cw * o.dpr); cv.height = Math.round(o.ch * o.dpr); };
  o.ro = new ResizeObserver(size); o.ro.observe(box); size();
  o.begin = () => { x.setTransform(o.dpr, 0, 0, o.dpr, 0, 0); return x; };
  return o;
}
// große Zahl in der Mitte (Countdown)
export function bigText(x, txt, cx, cy, dark, size = 64) {
  x.save(); x.fillStyle = inkOf(dark); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${size}px ${FONT}`;
  x.fillText(txt, cx, cy); x.restore();
}

// Karte im Spiel: Wer ist dran? (für Highscore-Duelle nacheinander)
export function turnCard(fx, p, title, sub, btn, ic) {
  return new Promise((resolve) => {
    fx.stage.replaceChildren(h('div.gres', null, h('div.grescard', null,
      h('span.gresic', { style: { color: p.color } }, icon(ic)),
      h('b', { text: title }), sub ? h('small', { text: sub }) : null,
      h('div.gresbtns', null, h('button.btn.primary', { text: btn, on: { click: () => resolve(true) } })))));
    fx.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
}
// Namens-Chip mit Farbe
export const chip = (p, extra) => h('span.pkchip', null, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name }), extra || null);
