// Mathe-Werkzeuge zum Anlegen: Lineal, Geodreieck, Parabelschablone, Zirkel.
// Alles in Seiten-Einheiten (Breite 1000 = 210 mm), also in echter Größe auf dem A4-Blatt.
// Ein Werkzeug hat Lage (x, y), Drehung (Grad) und eine Form mit "Kanten".
// Ein Pencil-Strich, der nah an einer Kante beginnt, rastet auf dieser Kante ein.

export const MM = 1000 / 210;
const CM = 10 * MM;
const SNAP = 5 * MM;           // so nah muss der Stift an der Kante anfangen
export const KNOB_OFF = 14 * MM;  // Abstand Zirkel-Griff vom Kreis
const SVGNS = 'http://www.w3.org/2000/svg';
const RULER_HALF = 155 * MM;
const rad = (d) => d * Math.PI / 180;

export const TOOL_NAMES = {
  ruler: 'Lineal',
  triangle: 'Geodreieck',
  parabola: 'Parabelschablone',
  compass: 'Zirkel',
};

export function makeTool(type, x, y) {
  const t = { type, x, y, angle: 0, r: 3 * CM, k: 1 };
  return t;
}

// ---------- Umrechnung Seite <-> Werkzeug ----------
export function toLocal(t, px, py) {
  const dx = px - t.x, dy = py - t.y, a = -rad(t.angle);
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}
export function toPage(t, lx, ly) {
  const a = rad(t.angle);
  return [t.x + lx * Math.cos(a) - ly * Math.sin(a), t.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

// ---------- Formen ----------
function rulerShape() {
  // 30-cm-Lineal (Skala 0 bis 30), Messkante oben (y = 0), Ursprung = 15-cm-Marke
  const L = RULER_HALF;
  return { poly: [[-L, 0], [L, 0], [L, 32 * MM], [-L, 32 * MM]],
    edges: [{ kind: 'line', a: [-L, 0], b: [L, 0] }, { kind: 'line', a: [-L, 32 * MM], b: [L, 32 * MM] }],
    knob: [L + 13 * MM, 16 * MM] };
}
function triangleShape() {
  // Geodreieck: lange Kante 16 cm (y = 0), Spitze 8 cm darunter, Mittelpunkt = Ursprung
  const A = [-80 * MM, 0], B = [80 * MM, 0], C = [0, 80 * MM];
  return { poly: [A, B, C],
    edges: [{ kind: 'line', a: A, b: B }, { kind: 'line', a: A, b: C }, { kind: 'line', a: B, b: C }],
    knob: [92 * MM, -6 * MM] };
}
function parabolaShape(t) {
  // Normalparabel y = x² (1 Einheit = 1 cm), Öffnung nach oben, Scheitel im Ursprung.
  // Auf dem Bildschirm zeigt y nach unten, darum y = -x².
  const xs = 2.2 * CM;
  const curve = [];
  for (let i = 0; i <= 60; i++) { const x = -xs + (2 * xs * i) / 60; curve.push([x, -t.k * x * x / CM]); }
  const top = -t.k * xs * xs / CM;
  const outer = [[-3.4 * CM, top - 0.4 * CM], [3.4 * CM, top - 0.4 * CM], [3.4 * CM, 1.4 * CM], [-3.4 * CM, 1.4 * CM]];
  return { poly: outer, hole: curve, edges: [{ kind: 'parabola', k: t.k, x0: -xs, x1: xs }], knob: [4.2 * CM, 1.0 * CM] };
}
function compassShape(t) {
  return { edges: [{ kind: 'circle', r: t.r }], knob: [t.r + KNOB_OFF, 0] };
}
export function shapeOf(t) {
  if (t.type === 'ruler') return rulerShape();
  if (t.type === 'triangle') return triangleShape();
  if (t.type === 'parabola') return parabolaShape(t);
  return compassShape(t);
}

// ---------- Geometrie ----------
function nearestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return [a[0] + u * dx, a[1] + u * dy];
}
function nearestOnParabola(p, e) {
  const f = (x) => -e.k * x * x / CM;
  const d2 = (x) => (x - p[0]) ** 2 + (f(x) - p[1]) ** 2;
  let best = e.x0, bd = Infinity;
  for (let i = 0; i <= 80; i++) { const x = e.x0 + (e.x1 - e.x0) * i / 80; const d = d2(x); if (d < bd) { bd = d; best = x; } }
  let lo = Math.max(e.x0, best - (e.x1 - e.x0) / 80), hi = Math.min(e.x1, best + (e.x1 - e.x0) / 80);
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (d2(m1) < d2(m2)) hi = m2; else lo = m1;
  }
  const x = (lo + hi) / 2;
  return [x, f(x)];
}
function nearestOnEdge(p, e) {
  if (e.kind === 'line') return nearestOnSeg(p, e.a, e.b);
  if (e.kind === 'parabola') return nearestOnParabola(p, e);
  const l = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / l * e.r, p[1] / l * e.r];
}

// Kante finden, an der ein Strich einrasten soll (oder null)
export function findEdge(t, px, py) {
  const p = toLocal(t, px, py);
  let best = null, bd = SNAP;
  for (const e of shapeOf(t).edges) {
    const q = nearestOnEdge(p, e);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// Punkt auf die Kante legen (Seiten-Koordinaten rein und raus)
export function snapPoint(t, e, px, py) {
  const q = nearestOnEdge(toLocal(t, px, py), e);
  return toPage(t, q[0], q[1]);
}

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Was wurde getroffen? 'knob' (drehen/Radius), 'body' (verschieben) oder null
export function hitTool(t, px, py) {
  const p = toLocal(t, px, py);
  const s = shapeOf(t);
  if (Math.hypot(p[0] - s.knob[0], p[1] - s.knob[1]) < 7.5 * MM) return 'knob';
  if (t.type === 'compass') return Math.hypot(p[0], p[1]) < 8 * MM ? 'body' : null;
  if (!inPoly(p, s.poly)) return null;
  if (s.hole) {
    // innerhalb der Parabel ist frei (dort wird gezeichnet)
    const yCurve = -t.k * p[0] * p[0] / CM;
    if (Math.abs(p[0]) < 2.2 * CM && p[1] < yCurve) return null;
  }
  return 'body';
}

// ---------- Zeichnen als SVG ----------
function el(name, attrs, parent) {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}
const pts = (arr) => arr.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');

function ticks(g, from, to, y, dir, labelEvery = 10, shift = 0) {
  // mm-Skala entlang y; dir = +1 nach unten; shift verschiebt die Beschriftung (Lineal: 0 links)
  for (let mm = from; mm <= to; mm++) {
    const x = (mm - shift) * MM, len = mm % 10 === 0 ? 4.5 * MM : mm % 5 === 0 ? 3 * MM : 1.8 * MM;
    el('line', { x1: x, y1: y, x2: x, y2: y + dir * len, class: 'tk' }, g);
    if (mm % labelEvery === 0) {
      el('text', { x, y: y + dir * 8 * MM, class: 'tl' }, g).textContent = String(Math.abs(mm / 10));
    }
  }
}

export function drawTool(svg, t) {
  svg.textContent = '';
  if (!t) return;
  const g = el('g', { transform: `translate(${t.x} ${t.y}) rotate(${t.angle})`, class: 'tool-' + t.type }, svg);
  const s = shapeOf(t);
  if (t.type === 'ruler') {
    el('polygon', { points: pts(s.poly), class: 'plate' }, g);
    ticks(g, 0, 300, 0, 1, 10, 150);
    el('text', { x: 0, y: 24 * MM, class: 'tn' }, g).textContent = 'cm';
  } else if (t.type === 'triangle') {
    el('polygon', { points: pts(s.poly), class: 'plate' }, g);
    ticks(g, -70, 70, 0, 1);
    // Winkelskala (Halbkreis um den Mittelpunkt)
    const R = 50 * MM;
    for (let d = 0; d <= 180; d++) {
      const a = rad(d), len = d % 10 === 0 ? 4 * MM : d % 5 === 0 ? 2.6 * MM : 1.4 * MM;
      const c = Math.cos(a), sn = Math.sin(a);
      el('line', { x1: -c * R, y1: sn * R, x2: -c * (R - len), y2: sn * (R - len), class: 'tk' }, g);
      if (d % 10 === 0 && d > 0 && d < 180) {
        const rr = R - 8 * MM;
        el('text', { x: -c * rr, y: sn * rr + 1.2 * MM, class: 'ta' }, g).textContent = String(d);
      }
    }
    el('path', { d: `M ${-R} 0 A ${R} ${R} 0 0 0 ${R} 0`, class: 'arc' }, g);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 66 * MM, class: 'mid' }, g);
    el('circle', { cx: 0, cy: 0, r: 1.2 * MM, class: 'ctr' }, g);
  } else if (t.type === 'parabola') {
    const top = s.poly[0][1];
    const d = `M ${pts([s.poly[0]])} L ${pts([s.poly[1]])} L ${pts([s.poly[2]])} L ${pts([s.poly[3]])} Z ` +
      `M ${s.hole[0][0]} ${top} L ${s.hole.map((p) => p.join(' ')).join(' L ')} L ${s.hole[s.hole.length - 1][0]} ${top} Z`;
    el('path', { d, class: 'plate', 'fill-rule': 'evenodd' }, g);
    el('polyline', { points: pts(s.hole), class: 'edge' }, g);
    // Markierungen bei ganzen x-Werten und Achse
    for (let x = -2; x <= 2; x++) {
      const px = x * CM, py = -t.k * px * px / CM;
      el('circle', { cx: px, cy: py, r: 0.9 * MM, class: 'ctr' }, g);
    }
    el('line', { x1: 0, y1: 0.6 * MM, x2: 0, y2: 1.2 * CM, class: 'mid' }, g);
    el('line', { x1: -3 * CM, y1: 0.9 * CM, x2: 3 * CM, y2: 0.9 * CM, class: 'mid' }, g);
    el('text', { x: 0, y: top + 0.25 * CM, class: 'tn' }, g).textContent = 'y = x²';
  } else {
    // Zirkel: Mittelpunkt, Radius-Linie, Kreis gestrichelt
    el('circle', { cx: 0, cy: 0, r: t.r, class: 'ghost' }, g);
    el('line', { x1: 0, y1: 0, x2: t.r + KNOB_OFF, y2: 0, class: 'radius' }, g);
    el('circle', { cx: t.r, cy: 0, r: 1.3 * MM, class: 'ctr' }, g);
    el('circle', { cx: 0, cy: 0, r: 4 * MM, class: 'pin' }, g);
    el('path', { d: `M ${-2.5 * MM} 0 H ${2.5 * MM} M 0 ${-2.5 * MM} V ${2.5 * MM}`, class: 'cross' }, g);
    el('text', { x: t.r / 2, y: -3 * MM, class: 'tn', transform: `rotate(${-t.angle} ${t.r / 2} ${-3 * MM})` }, g).textContent =
      `r = ${(t.r / CM).toFixed(1).replace('.', ',')} cm`;
  }
  // Drehknopf (beim Zirkel: Radius ziehen)
  el('circle', { cx: s.knob[0], cy: s.knob[1], r: 6 * MM, class: 'knob' }, g);
  el('circle', { cx: s.knob[0], cy: s.knob[1], r: 1.6 * MM, class: 'knobdot' }, g);
  if (t.type !== 'compass') {
    const a = ((Math.round(t.angle) % 360) + 360) % 360;
    el('text', { x: s.knob[0], y: s.knob[1] - 9 * MM, class: 'tn', transform: `rotate(${-t.angle} ${s.knob[0]} ${s.knob[1] - 9 * MM})` }, g).textContent = `${a}°`;
  }
}

// Winkel einrasten lassen: ganze Grad, bei 0/15/30/45 … magnetisch
export function niceAngle(a) {
  const r = Math.round(a / 15) * 15;
  if (Math.abs(a - r) < 2) return r;
  return Math.round(a);
}
// Karo-Hilfe: Werkzeug an Karo-Linien (oder Heft-Linien) anlegen, wenn es gerade liegt.
// lines = { gx: [Abstand, Start] | null, gy: [Abstand, Start] }, thr = Fangweite
export function magnetTool(t, lines, thr) {
  const a = ((Math.round(t.angle) % 360) + 360) % 360;
  if (t.type !== 'compass' && a % 90 !== 0) return;
  const near = (v, ln) => {
    if (!ln) return v;
    const [step, start] = ln;
    const r = start + Math.round((v - start) / step) * step;
    return Math.abs(r - v) < thr ? r : v;
  };
  // Messkante (lokal y = 0) bzw. Mittelpunkt liegen bei x/y des Werkzeugs
  t.x = near(t.x, lines.gx);
  t.y = near(t.y, lines.gy);
}

export function niceRadius(r) {
  return Math.max(3 * MM, Math.round(r / MM) * MM); // auf 1 mm
}
