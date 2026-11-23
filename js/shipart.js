// Schiffe als Kästchen-Formen (auch um die Ecke) und wie sie gezeichnet werden.
// Wird von Schiffe versenken (p4a.js) und vom Skin-Hub (hub.js) benutzt.
import { inkOf, hatch, shade } from './sketch.js';

export const STD_FLEET = [5, 4, 3, 3, 2].map((n) => Array.from({ length: n }, (_, k) => [k, 0]));
export const FLEET_CELLS = 17;      // so viele Kästchen hat die normale Flotte
export const MAX_SHIPS = 8, MAX_SHIP = 6, EDIT_N = 6;

// Form nach links oben schieben und sortieren
export function norm(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([a, b]) => [a - mx, b - my]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}
// r-mal um 90° drehen
export function rot(cells, r) {
  let out = cells.map((c) => [...c]);
  for (let k = 0; k < (((r % 4) + 4) % 4); k++) out = out.map(([a, b]) => [-b, a]);
  return norm(out);
}
export const dims = (cells) => [1 + Math.max(...cells.map((c) => c[0])), 1 + Math.max(...cells.map((c) => c[1]))];
// Hängen alle Kästchen über Kanten zusammen?
export function connected(cells) {
  if (!cells.length) return false;
  const set = new Set(cells.map(([a, b]) => `${a},${b}`)), seen = new Set([`${cells[0][0]},${cells[0][1]}`]), todo = [cells[0]];
  while (todo.length) {
    const [a, b] = todo.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${a + dx},${b + dy}`; if (set.has(k) && !seen.has(k)) { seen.add(k); todo.push([a + dx, b + dy]); } }
  }
  return seen.size === set.size;
}
// Prüft eine ganze Flotte. Gibt einen Fehlertext oder '' zurück.
export function fleetProblem(fleet) {
  if (!fleet.length) return 'Bau mindestens ein Schiff.';
  if (fleet.length > MAX_SHIPS) return `Höchstens ${MAX_SHIPS} Schiffe.`;
  for (const [i, s] of fleet.entries()) {
    if (!s.length) return `Schiff ${i + 1} ist noch leer.`;
    if (s.length > MAX_SHIP) return `Schiff ${i + 1} ist zu groß (höchstens ${MAX_SHIP} Kästchen).`;
    if (!connected(s)) return `Bei Schiff ${i + 1} hängen nicht alle Kästchen zusammen.`;
  }
  const n = fleet.reduce((a, s) => a + s.length, 0);
  if (n !== FLEET_CELLS) return `Es sind ${n} Kästchen. Es müssen genau ${FLEET_CELLS} sein.`;
  return '';
}

// Ein Schiff zeichnen. cells = Felder auf dem Gitter (X0/Y0 = linke obere Ecke, cs = Kästchengröße).
export function drawShip(x, cells, X0, Y0, cs, { color = '#4f7cff', dark = false, sunk = false, lw = 2.2 } = {}) {
  const ink = inkOf(dark), p = cs * 0.14;
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const mnx = Math.min(...xs), mny = Math.min(...ys), mxx = Math.max(...xs), mxy = Math.max(...ys);
  const X = X0 + mnx * cs, Y = Y0 + mny * cs, w = (mxx - mnx + 1) * cs, hh = (mxy - mny + 1) * cs;
  const line = cells.length > 1 && (mnx === mxx || mny === mxy), v = line && mnx === mxx;
  const set = new Set(cells.map(([a, b]) => `${a},${b}`)), has = (a, b) => set.has(`${a},${b}`);
  let path;
  if (line) {
    path = () => {
      x.beginPath();
      if (v) { x.moveTo(X + w / 2, Y + p * 0.6); x.quadraticCurveTo(X + w - p, Y + cs * 0.6, X + w - p, Y + cs); x.lineTo(X + w - p, Y + hh - p * 1.6); x.quadraticCurveTo(X + w / 2, Y + hh - p * 0.4, X + p, Y + hh - p * 1.6); x.lineTo(X + p, Y + cs); x.quadraticCurveTo(X + p, Y + cs * 0.6, X + w / 2, Y + p * 0.6); }
      else { x.moveTo(X + w - p * 0.6, Y + hh / 2); x.quadraticCurveTo(X + w - cs * 0.6, Y + hh - p, X + w - cs, Y + hh - p); x.lineTo(X + p * 1.6, Y + hh - p); x.quadraticCurveTo(X + p * 0.4, Y + hh / 2, X + p * 1.6, Y + p); x.lineTo(X + w - cs, Y + p); x.quadraticCurveTo(X + w - cs * 0.6, Y + p, X + w - p * 0.6, Y + hh / 2); }
      x.closePath();
    };
  } else {
    // Vereinigung der Kästchen: abgerundete Felder plus Brücken zu Nachbarn
    path = () => {
      x.beginPath();
      for (const [a, b] of cells) {
        const cx = X0 + a * cs, cy = Y0 + b * cs;
        x.roundRect(cx + p, cy + p, cs - 2 * p, cs - 2 * p, cs * 0.24);
        if (has(a + 1, b)) x.rect(cx + cs / 2, cy + p, cs, cs - 2 * p);
        if (has(a, b + 1)) x.rect(cx + p, cy + cs / 2, cs - 2 * p, cs);
        if (has(a + 1, b) && has(a, b + 1) && has(a + 1, b + 1)) x.rect(cx + cs / 2, cy + cs / 2, cs, cs);
      }
    };
  }
  const fill = sunk ? (dark ? '#3a3f4a' : '#c9ccd3') : (dark ? shade(color, -0.4) : shade(color, 0.6));
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  if (line) { x.fillStyle = fill; path(); x.fill(); }
  else { x.strokeStyle = ink; x.lineWidth = lw * 2; path(); x.stroke(); x.fillStyle = fill; path(); x.fill(); }   // nur der äußere Rand bleibt stehen
  x.save(); path(); x.clip(); hatch(x, X, Y, w, hh, sunk ? ink : color, 6, sunk ? 0.25 : 0.7, 1.3); x.restore();
  if (line) { x.strokeStyle = ink; x.lineWidth = lw; path(); x.stroke(); }
  // Bullaugen und Brücke (auf dem Feld mit den meisten Nachbarn)
  const nb = ([a, b]) => has(a + 1, b) + has(a - 1, b) + has(a, b + 1) + has(a, b - 1);
  const order = line ? [...cells].sort((q, r) => q[0] - r[0] || q[1] - r[1]) : cells;
  const bridge = line ? order[Math.floor(order.length / 2)] : cells.reduce((best, c) => (nb(c) > nb(best) ? c : best), cells[0]);
  x.strokeStyle = ink; x.lineWidth = Math.max(1, lw * 0.68);
  for (const c of order) {
    const cx = X0 + (c[0] + 0.5) * cs, cy = Y0 + (c[1] + 0.5) * cs;
    if (c === bridge) x.strokeRect(cx - cs * 0.18, cy - cs * 0.18, cs * 0.36, cs * 0.36);
    else { x.beginPath(); x.arc(cx, cy, cs * 0.1, 0, Math.PI * 2); x.stroke(); }
  }
  x.restore();
}
