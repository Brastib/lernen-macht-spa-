// Welten für den Papierflieger: große Karten (von oben gesehen) mit Hindernissen, Wind-Zonen,
// Sternen, Ringen und Papierkörben. Jede Karte ist fest (gleicher Aufbau bei jedem Öffnen), damit Rekorde vergleichbar sind.
import { rng } from './sketch.js';

export const PX_M = 150;                              // gleiches Maß wie im Flieger: 150 px = 1 m
export const BONUS = { star: 2, ring: 8, bin: 25 };   // Bonus-Meter

export const WORLDS = [
  { id: 'free', name: 'Freies Feld', desc: 'Endlos weit, nichts im Weg', color: '#e9edf4' },
  { id: 'desk', name: 'Schreibtisch', desc: 'Bücherstapel, Stiftebecher, Tassen und Tischlüfter', w: 16000, h: 10000, color: '#d8b78a' },
  { id: 'lib', name: 'Bibliothek', desc: 'Lange Regalgänge, Lüftungsgitter und offene Türen', w: 22000, h: 14000, color: '#6f8c7c' },
  { id: 'yard', name: 'Schulhof', desc: 'Bäume, Bänke, Windböen, Pfützen und Tauben', w: 26000, h: 16000, color: '#a2a7ad' },
  { id: 'sky', name: 'Wolkenmeer', desc: 'Aufwinde, Gewitter, Ballons und Möwen. Die größte Karte', w: 34000, h: 20000, color: '#9fd0f2' },
];
export const worldDef = (id) => WORLDS.find((w) => w.id === id) || WORLDS[1];
export const sizeText = (d) => d.w ? `${Math.round(d.w / PX_M)} × ${Math.round(d.h / PX_M)} m` : 'ohne Rand';

const hash = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
const TAU = Math.PI * 2;

// ---------- Karte erzeugen ----------
export function makeWorld(id) {
  const def = worldDef(id);
  if (!def.w) return null;
  const R = rng(hash('flieger-' + id)), W = def.w, H = def.h;
  const wd = { id, def, w: W, h: H, start: { x: Math.round(W * 0.2), y: Math.round(H * 0.55) }, solids: [], zones: [], stars: [], rings: [], bins: [], birds: [], decor: [], t: 0 };
  const st = wd.start;
  const rr = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[(R() * arr.length) | 0];
  const free = (x, y, r, gap = 70) => {
    if (x < r + 140 || y < r + 140 || x > W - r - 140 || y > H - r - 140) return false;
    if (Math.hypot(x - st.x, y - st.y) < r + 650) return false;
    for (const o of wd.solids) if (Math.abs(x - o.x) < r + o.br + gap && Math.hypot(x - o.x, y - o.y) < r + o.br + gap) return false;
    return true;
  };
  const spot = (r, gap, minStart = 0) => {
    for (let i = 0; i < 60; i++) { const x = R() * W, y = R() * H; if (Math.hypot(x - st.x, y - st.y) >= minStart && free(x, y, r, gap)) return [x, y]; }
    return null;
  };
  const circ = (k, r, hh, extra = {}) => { const p = spot(r); if (!p) return null; const o = { k, s: 'c', x: p[0], y: p[1], r, br: r, hh, seed: (R() * 1e6) | 0, ...extra }; wd.solids.push(o); return o; };
  const rect = (k, w, h, hh, a = R() * TAU, extra = {}) => { const br = Math.hypot(w, h) / 2, p = spot(br); if (!p) return null; const o = { k, s: 'r', x: p[0], y: p[1], w, h, a, br, hh, seed: (R() * 1e6) | 0, ...extra }; wd.solids.push(o); return o; };
  const zone = (k, r, n, extra = () => ({})) => { for (let i = 0; i < n; i++) { const p = spot(r * 0.45, 0, 1200); if (p) wd.zones.push({ k, x: p[0], y: p[1], r, ...extra() }); } };
  const decor = (k, n, f) => { for (let i = 0; i < n; i++) { const d = { k, x: R() * W, y: R() * H, a: R() * TAU, seed: (R() * 1e6) | 0, ...f() }; if (Math.hypot(d.x - st.x, d.y - st.y) > 1100) wd.decor.push(d); } };
  const BOOK = ['#c0392b', '#2e6bd1', '#2f9e66', '#e2a225', '#7b52c7', '#d9603b', '#33475b', '#17a2a2'];

  if (id === 'desk') {
    decor('sheet', 60, () => ({ w: rr(420, 560), h: rr(560, 720) }));
    decor('note', 80, () => ({ w: 170, c: pick(['#ffe66d', '#ffb3c7', '#b8f2a6', '#a8d8ff']) }));
    decor('ink', 40, () => ({ r: rr(70, 160) }));
    for (let i = 0; i < 85; i++) rect('books', rr(260, 380), rr(190, 270), 1.0, R() * TAU, { cols: [pick(BOOK), pick(BOOK), pick(BOOK)], n: 2 + ((R() * 2) | 0) });
    for (let i = 0; i < 34; i++) circ('pens', rr(78, 96), 1.35);
    for (let i = 0; i < 40; i++) circ('cup', rr(70, 88), 0.9, { c: pick(['#f4f1ea', '#2e6bd1', '#c0392b', '#2f3b4c', '#e2a225']), ha: R() * TAU });
    for (let i = 0; i < 40; i++) rect('ruler', rr(820, 1000), 76, 0.14);
    for (let i = 0; i < 80; i++) rect('eraser', 120, 64, 0.24);
    for (let i = 0; i < 20; i++) rect('lamp', 210, 210, 1.3, R() * TAU);
    zone('lift', 300, 24, () => ({ look: 'fan' }));
    zone('gust', 520, 20, () => ({ a: R() * TAU }));
  } else if (id === 'lib') {
    decor('rug', 50, () => ({ w: rr(900, 1500), h: rr(600, 900), c: pick(['#a4543e', '#3d5a8a', '#8a6d3d']) }));
    // Regalblöcke: mehrere parallele Regale mit Gängen dazwischen
    for (let b = 0; b < 44; b++) {
      const n = 3 + ((R() * 3) | 0), len = rr(1600, 2600), gap = rr(520, 700), vert = R() < 0.5, bw = vert ? n * gap : len, bh = vert ? len : n * gap;
      const p = spot(Math.hypot(bw, bh) / 2, 120);
      if (!p) continue;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * gap;
        const o = { k: 'shelf', s: 'r', x: p[0] + (vert ? off : 0), y: p[1] + (vert ? 0 : off), w: vert ? 170 : len, h: vert ? len : 170, a: 0, hh: 1.45, seed: (R() * 1e6) | 0 };
        o.br = Math.hypot(o.w, o.h) / 2;
        wd.solids.push(o);
      }
    }
    for (let i = 0; i < 70; i++) rect('table', rr(560, 680), rr(320, 380), 0.7, pick([0, Math.PI / 2]));
    for (let i = 0; i < 40; i++) rect('cart', 320, 170, 0.85);
    for (let i = 0; i < 26; i++) circ('globe', 110, 1.1);
    zone('lift', 280, 40, () => ({ look: 'grill' }));
    zone('gust', 560, 30, () => ({ a: R() * TAU }));
  } else if (id === 'yard') {
    decor('grass', 90, () => ({ r: rr(500, 1100) }));
    decor('hop', 30, () => ({}));
    decor('ringpaint', 30, () => ({ r: rr(260, 420) }));
    decor('leaf', 600, () => ({ c: pick(['#c9732b', '#e0a43a', '#9c5a2a']) }));
    for (let i = 0; i < 220; i++) circ('tree', rr(170, 250), 1.45);
    for (let i = 0; i < 110; i++) rect('bench', rr(420, 520), 110, 0.45);
    for (let i = 0; i < 20; i++) rect('shed', rr(700, 900), rr(480, 600), 1.5, pick([0, Math.PI / 2]));
    for (let i = 0; i < 30; i++) circ('hoop', 46, 1.5, { a: R() * TAU });
    zone('wet', 260, 70, () => ({ seed: (R() * 1e6) | 0 }));
    zone('gust', 640, 40, () => ({ a: R() * TAU }));
    zone('lift', 340, 24, () => ({ look: 'swirl' }));
    for (let i = 0; i < 50; i++) { const p = spot(300, 0, 2000); if (p) wd.birds.push({ k: 'pigeon', cx: p[0], cy: p[1], R: rr(200, 520), w: (R() < 0.5 ? -1 : 1) * rr(0.35, 0.7), ph: R() * TAU, r: 36, hh: 1.5, x: p[0], y: p[1] }); }
  } else if (id === 'sky') {
    decor('puff', 400, () => ({ r: rr(160, 420) }));
    for (let i = 0; i < 70; i++) circ('balloon', rr(80, 105), 1.5, { c: pick(['#ff5d73', '#ffb627', '#4f7cff', '#2fbf71', '#a46bff']) });
    zone('lift', 420, 60, () => ({ look: 'swirl' }));
    zone('gust', 760, 50, () => ({ a: R() * TAU }));
    zone('storm', 560, 36, () => ({ seed: (R() * 1e6) | 0 }));
    zone('cloud', 620, 110, () => ({ seed: (R() * 1e6) | 0 }));
    for (let i = 0; i < 90; i++) { const p = spot(300, 0, 2200); if (p) wd.birds.push({ k: 'gull', cx: p[0], cy: p[1], R: rr(250, 700), w: (R() < 0.5 ? -1 : 1) * rr(0.25, 0.55), ph: R() * TAU, r: 40, hh: 1.5, x: p[0], y: p[1] }); }
  }

  // Papierkörbe (Ziel), Ringe, Sterne
  const nb = { desk: 5, lib: 6, yard: 7, sky: 8 }[id];
  for (let i = 0; i < nb; i++) { const p = spot(150, 60, 2600); if (p) wd.bins.push({ x: p[0], y: p[1], r: 130 }); }
  const nr = Math.round(W * H / 4.5e6);
  for (let i = 0; i < nr; i++) { const p = spot(190, 30, 900); if (p) wd.rings.push({ x: p[0], y: p[1], a: R() * TAU, len: 340, got: false }); }
  const clusters = Math.round(W * H / 1.6e6);
  for (let c = 0; c < clusters; c++) {
    const p = spot(80, 20, 500); if (!p) continue;
    const a = R() * TAU, n = 5 + ((R() * 3) | 0), arc = R() < 0.5 ? (R() - 0.5) * 0.5 : 0;
    let x = p[0], y = p[1], d = a;
    for (let i = 0; i < n; i++) {
      if (free(x, y, 40, 20)) wd.stars.push({ x, y, got: false, ph: R() * TAU });
      d += arc; x += Math.cos(d) * 170; y += Math.sin(d) * 170;
    }
  }
  wd.pat = null;
  return wd;
}

// Vor jedem Wurf: Sterne und Ringe wieder da
export function resetWorld(wd) {
  if (!wd) return;
  wd.stars = wd.stars.filter((s) => !s.tmp);
  for (const s of wd.stars) { s.got = false; s.gt = 0; s.ox = s.oy = undefined; }
  for (const r of wd.rings) { r.got = false; r.gt = 0; }
  for (const z of wd.zones) z.in = false;
}
// Sternregen: Sterne vor dem Flieger auf die Flugbahn legen
export function starRain(wd, x, y, vx, vy) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  for (let i = 1; i <= 9; i++) {
    const d = 260 + i * 190, wob = Math.sin(i * 1.3) * 60;
    wd.stars.push({ x: x + ux * d - uy * wob, y: y + uy * d + ux * wob, got: false, ph: i, tmp: true });
  }
}

// ---------- Kollision ----------
function hitSolid(o, x, y, pr) {
  if (o.s === 'c') {
    const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
    if (d >= o.r + pr) return null;
    return d > 0.01 ? { nx: dx / d, ny: dy / d, pen: o.r + pr - d } : { nx: 1, ny: 0, pen: o.r + pr };
  }
  const c = Math.cos(o.a), s = Math.sin(o.a), dx = x - o.x, dy = y - o.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c, hw = o.w / 2, hh = o.h / 2;
  const qx = Math.max(-hw, Math.min(hw, lx)), qy = Math.max(-hh, Math.min(hh, ly));
  let nx, ny, pen;
  const ex = lx - qx, ey = ly - qy, d = Math.hypot(ex, ey);
  if (d > 0.01) { if (d >= pr) return null; nx = ex / d; ny = ey / d; pen = pr - d; }
  else {
    const px = hw - Math.abs(lx), py = hh - Math.abs(ly);
    if (px < py) { nx = Math.sign(lx) || 1; ny = 0; pen = px + pr; } else { nx = 0; ny = Math.sign(ly) || 1; pen = py + pr; }
  }
  return { nx: nx * c - ny * s, ny: nx * s + ny * c, pen };
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
function segHit(p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y) {
  const rx = p1x - p0x, ry = p1y - p0y, sx = q1x - q0x, sy = q1y - q0y, den = cross(rx, ry, sx, sy);
  if (Math.abs(den) < 1e-9) return false;
  const t = cross(q0x - p0x, q0y - p0y, sx, sy) / den, u = cross(q0x - p0x, q0y - p0y, rx, ry) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
export const ringEnds = (r) => { const c = Math.cos(r.a) * r.len / 2, s = Math.sin(r.a) * r.len / 2; return [r.x - c, r.y - s, r.x + c, r.y + s]; };

// Ein Physik-Schritt in der Welt. p: { x, y, vx, vy, z } in Welt-Koordinaten (wird verändert), prev: Position davor.
// fx: { magnet, ghost } · cb: { star, ring, bin, bump, wall, zone }
export function worldStep(wd, p, prev, dt, fx, cb) {
  const air = p.z > 0;
  // Zonen
  for (const z of wd.zones) {
    const d = Math.hypot(p.x - z.x, p.y - z.y), inside = d < z.r;
    if (inside && !z.in && air && cb.zone) cb.zone(z);
    z.in = inside;
    if (!inside) continue;
    const k = 1 - d / z.r * 0.5;
    if (z.k === 'lift' && air) p.z = Math.min(1.25, p.z + 0.6 * k * dt);
    else if (z.k === 'gust' && air) { p.vx += Math.cos(z.a) * 720 * k * dt; p.vy += Math.sin(z.a) * 720 * k * dt; }
    else if (z.k === 'storm' && air) { p.z = Math.max(0, p.z - 0.34 * dt); p.vx += (Math.random() - 0.5) * 900 * dt; p.vy += (Math.random() - 0.5) * 900 * dt; }
    else if (z.k === 'cloud' && air) { p.vx *= 1 - 0.4 * dt; p.vy *= 1 - 0.4 * dt; }
    else if (z.k === 'wet' && !air) { p.vx *= 1 - Math.min(1, 7 * dt); p.vy *= 1 - Math.min(1, 7 * dt); }
  }
  // Hindernisse und Vögel
  if (!fx.ghost) {
    const pr = 28;
    const test = (o) => {
      if (p.z >= o.hh || Math.abs(p.x - o.x) > o.br + pr || Math.abs(p.y - o.y) > o.br + pr) return;
      const hit = hitSolid(o, p.x, p.y, pr);
      if (!hit) return;
      if (cb.bump && cb.bump(o) === 'shield') return 'shield';
      p.x += hit.nx * hit.pen; p.y += hit.ny * hit.pen;
      const vn = p.vx * hit.nx + p.vy * hit.ny;
      if (vn < 0) { p.vx -= 1.45 * vn * hit.nx; p.vy -= 1.45 * vn * hit.ny; }
      p.vx *= 0.7; p.vy *= 0.7; p.z = Math.max(0, p.z - 0.05);
    };
    for (const o of wd.solids) if (test(o) === 'shield') break;
    for (const b of wd.birds) if (test({ ...b, s: 'c', br: b.r }) === 'shield') break;
  }
  // Sterne
  for (const s of wd.stars) {
    if (s.got) { s.gt += dt; continue; }
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
    if (fx.magnet && d < 520 && d > 1) { const m = Math.min(d, 1100 * dt); s.x += dx / d * m; s.y += dy / d * m; }
    if (d < 70) { s.got = true; s.gt = 0; cb.star && cb.star(s); }
  }
  // Ringe (durchfliegen)
  if (air) for (const r of wd.rings) {
    if (r.got) { r.gt += dt; continue; }
    if (Math.abs(p.x - r.x) > 600 || Math.abs(p.y - r.y) > 600) continue;
    const [ax, ay, bx, by] = ringEnds(r);
    if (segHit(prev.x, prev.y, p.x, p.y, ax, ay, bx, by)) { r.got = true; r.gt = 0; cb.ring && cb.ring(r); }
  } else for (const r of wd.rings) if (r.got) r.gt += dt;
  // Papierkorb: tief drüber = drin
  for (const b of wd.bins) if (p.z < 0.3 && Math.hypot(p.x - b.x, p.y - b.y) < b.r * 0.78) { cb.bin && cb.bin(b); break; }
  // Rand
  const m = 40;
  let wall = false;
  if (p.x < m) { p.x = m; p.vx = Math.abs(p.vx) * 0.6; wall = true; }
  if (p.x > wd.w - m) { p.x = wd.w - m; p.vx = -Math.abs(p.vx) * 0.6; wall = true; }
  if (p.y < m) { p.y = m; p.vy = Math.abs(p.vy) * 0.6; wall = true; }
  if (p.y > wd.h - m) { p.y = wd.h - m; p.vy = -Math.abs(p.vy) * 0.6; wall = true; }
  if (wall && cb.wall) cb.wall();
}
// Vögel bewegen (läuft immer, auch wenn der Flieger liegt)
export function tickWorld(wd, dt) {
  wd.t += dt;
  for (const b of wd.birds) { const a = b.ph + wd.t * b.w; b.x = b.cx + Math.cos(a) * b.R; b.y = b.cy + Math.sin(a) * b.R; b.dir = a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2); }
}

// ---------- Zeichnen ----------
const VOID = { desk: '#5a4331', lib: '#39322c', yard: '#4f7d3f', sky: '#cfe8fb' };
function floorPattern(ctx, id) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), R = rng(hash('boden-' + id));
  if (id === 'desk') {
    x.fillStyle = '#d8b78a'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 46; i++) {
      const y0 = R() * 512, amp = 3 + R() * 8, k = 1 + ((R() * 3) | 0), ph = R() * TAU;
      x.strokeStyle = `rgba(${R() < 0.5 ? '120,80,40' : '150,105,60'},${0.08 + R() * 0.14})`; x.lineWidth = 0.8 + R() * 1.8;
      x.beginPath();
      for (let t = 0; t <= 512; t += 8) { const y = y0 + Math.sin(t / 512 * TAU * k + ph) * amp; t ? x.lineTo(t, y) : x.moveTo(t, y); }
      x.stroke();
    }
  } else if (id === 'lib') {
    x.fillStyle = '#6f8c7c'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
    for (let i = -512; i < 1024; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 512, 512); x.stroke(); x.beginPath(); x.moveTo(i + 512, 0); x.lineTo(i, 512); x.stroke(); }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},.05)`; x.fillRect(R() * 512, R() * 512, 2, 2); }
  } else if (id === 'yard') {
    x.fillStyle = '#a2a7ad'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { const v = R(); x.fillStyle = v < 0.5 ? `rgba(60,64,70,${0.1 + R() * 0.25})` : `rgba(240,240,245,${0.1 + R() * 0.3})`; x.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
  } else {
    x.fillStyle = '#9fd0f2'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      const ex = R() * 512, ey = R() * 512, rx = 20 + R() * 50, ry = 6 + R() * 14;
      x.fillStyle = 'rgba(255,255,255,.1)';
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { x.beginPath(); x.ellipse(ex + ox, ey + oy, rx, ry, 0, 0, TAU); x.fill(); }
    }
  }
  return ctx.createPattern(c, 'repeat');
}

const shadowOf = (hh) => [10 + hh * 26, 14 + hh * 40];
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawDecor(ctx, d, t) {
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
  if (d.k === 'sheet') {
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-d.w / 2 + 8, -d.h / 2 + 10, d.w, d.h);
    ctx.fillStyle = '#fbfaf5'; ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
    ctx.strokeStyle = 'rgba(70,120,210,.28)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let y = -d.h / 2 + 70; y < d.h / 2 - 20; y += 34) { ctx.moveTo(-d.w / 2 + 20, y); ctx.lineTo(d.w / 2 - 20, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,80,80,.45)'; ctx.beginPath(); ctx.moveTo(-d.w / 2 + 70, -d.h / 2); ctx.lineTo(-d.w / 2 + 70, d.h / 2); ctx.stroke();
  } else if (d.k === 'note') {
    ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(-d.w / 2 + 6, -d.w / 2 + 8, d.w, d.w);
    ctx.fillStyle = d.c; ctx.fillRect(-d.w / 2, -d.w / 2, d.w, d.w);
    ctx.strokeStyle = 'rgba(40,40,60,.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-50, -30); ctx.lineTo(40, -30); ctx.moveTo(-50, 0); ctx.lineTo(20, 0); ctx.moveTo(-50, 30); ctx.lineTo(50, 30); ctx.stroke();
  } else if (d.k === 'ink') {
    ctx.fillStyle = 'rgba(30,40,110,.55)'; ctx.beginPath();
    const R = rng(d.seed);
    for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, r = d.r * (0.7 + R() * 0.4); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((R() - 0.5) * d.r * 3, (R() - 0.5) * d.r * 3, 8 + R() * 14, 0, TAU); ctx.fill(); }
  } else if (d.k === 'rug') {
    ctx.fillStyle = d.c; rr(ctx, -d.w / 2, -d.h / 2, d.w, d.h, 30); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 10; rr(ctx, -d.w / 2 + 40, -d.h / 2 + 40, d.w - 80, d.h - 80, 20); ctx.stroke();
  } else if (d.k === 'grass') {
    ctx.fillStyle = '#7fae5b'; ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(60,110,50,.35)'; ctx.beginPath(); ctx.ellipse(d.r * 0.2, d.r * 0.1, d.r * 0.6, d.r * 0.4, 0.4, 0, TAU); ctx.fill();
  } else if (d.k === 'hop') {
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 10;
    const s = 150; [[0, 0], [0, -1], [-0.5, -2], [0.5, -2], [0, -3], [-0.5, -4], [0.5, -4], [0, -5]].forEach(([cx, cy]) => ctx.strokeRect(cx * s - s / 2, cy * s - s / 2, s, s));
  } else if (d.k === 'ringpaint') {
    ctx.strokeStyle = 'rgba(255,214,92,.75)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.stroke();
  } else if (d.k === 'leaf') {
    ctx.fillStyle = d.c; ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, TAU); ctx.fill();
  } else if (d.k === 'puff') {
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    const R = rng(d.seed); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((R() - 0.5) * d.r * 1.4, (R() - 0.5) * d.r * 0.5, d.r * (0.35 + R() * 0.3), 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

function drawZone(ctx, z, t) {
  ctx.save(); ctx.translate(z.x, z.y);
  if (z.k === 'lift') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
    g.addColorStop(0, 'rgba(255,214,92,.32)'); g.addColorStop(1, 'rgba(255,214,92,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
    if (z.look === 'fan') {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(14, 20, 118, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.arc(0, 0, 112, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9aa3b0'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.rotate(t * 9);
      ctx.fillStyle = 'rgba(79,124,255,.7)';
      for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.ellipse(0, -52, 26, 50, 0.35, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(90,100,115,.6)'; ctx.lineWidth = 2;
      for (let r = 30; r < 112; r += 20) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#5b6578'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
    } else if (z.look === 'grill') {
      ctx.fillStyle = '#c8ced6'; rr(ctx, -110, -80, 220, 160, 14); ctx.fill();
      ctx.strokeStyle = '#6d7684'; ctx.lineWidth = 6; ctx.beginPath();
      for (let x = -86; x <= 86; x += 24) { ctx.moveTo(x, -62); ctx.lineTo(x, 62); }
      ctx.stroke();
    }
    // aufsteigende Ringe
    ctx.strokeStyle = 'rgba(230,160,20,.55)'; ctx.lineWidth = 5; ctx.setLineDash([22, 16]);
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(0, 0, 120 + k * (z.r - 120), t * 0.6 + i, t * 0.6 + i + TAU); ctx.stroke(); }
  } else if (z.k === 'gust') {
    ctx.rotate(z.a);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
    g.addColorStop(0, 'rgba(120,190,255,.2)'); g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(60,130,220,.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const R = rng(z.r | 0);
    for (let i = 0; i < 9; i++) {
      const y = (R() - 0.5) * z.r * 1.4, len = 120 + R() * 120, sp = 0.5 + R() * 0.5;
      const x = (((t * sp * 900 + R() * 2000) % (z.r * 2)) - z.r);
      if (Math.hypot(x, y) > z.r * 0.95) continue;
      ctx.beginPath(); ctx.moveTo(x - len, y); ctx.quadraticCurveTo(x - len / 2, y - 14, x, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,130,220,.55)';
    ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(10, -40); ctx.lineTo(10, 40); ctx.closePath(); ctx.fill();
  } else if (z.k === 'wet') {
    const R = rng(z.seed);
    ctx.fillStyle = 'rgba(70,110,160,.55)'; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU, r = z.r * (0.72 + R() * 0.3); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.7) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.7); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 5;
    const k = (t * 0.6) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(-30, -10, 30 + k * 80, (30 + k * 80) * 0.6, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
// Wolken und Gewitter liegen über dem Flieger
function drawOverZone(ctx, z, t) {
  ctx.save(); ctx.translate(z.x, z.y);
  const R = rng(z.seed || 7);
  const blob = (rgb, al) => {
    for (let i = 0; i < 8; i++) {
      const a = R() * TAU, d = R() * z.r * 0.45, px = Math.cos(a) * d, py = Math.sin(a) * d * 0.7, r = z.r * (0.34 + R() * 0.22);
      const g = ctx.createRadialGradient(px - r * 0.2, py - r * 0.25, r * 0.1, px, py, r);
      g.addColorStop(0, `rgba(${rgb},${al})`); g.addColorStop(0.6, `rgba(${rgb},${al * 0.8})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
  };
  if (z.k === 'cloud') blob('255,255,255', 0.55);
  else if (z.k === 'storm') {
    blob('74,82,104', 0.7);
    const fl = Math.sin(t * 13 + z.x) > 0.93;
    if (fl) {
      ctx.strokeStyle = 'rgba(255,236,120,.95)'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-40, -z.r * 0.4); ctx.lineTo(20, -30); ctx.lineTo(-20, 10); ctx.lineTo(50, z.r * 0.4); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSolid(ctx, o, t) {
  const [sx, sy] = shadowOf(o.hh);
  ctx.save(); ctx.translate(o.x, o.y);
  // Schatten
  ctx.fillStyle = 'rgba(20,20,30,.2)';
  if (o.s === 'c') { ctx.beginPath(); ctx.arc(sx, sy, o.r, 0, TAU); ctx.fill(); }
  else { ctx.save(); ctx.translate(sx, sy); ctx.rotate(o.a); rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 10); ctx.fill(); ctx.restore(); }
  if (o.s === 'r') ctx.rotate(o.a);
  const R = rng(o.seed);
  switch (o.k) {
    case 'books': {
      for (let i = 0; i < o.n; i++) {
        ctx.save(); ctx.rotate((R() - 0.5) * 0.25); ctx.translate((R() - 0.5) * 20, (R() - 0.5) * 20);
        const w = o.w * (1 - i * 0.08), h = o.h * (1 - i * 0.08), c = o.cols[i % 3];
        ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(ctx, -w / 2 + 4, -h / 2 + 6, w, h, 8); ctx.fill();
        ctx.fillStyle = c; rr(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
        ctx.fillStyle = '#f6f1e4'; ctx.fillRect(w / 2 - 16, -h / 2 + 8, 10, h - 16);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-w / 2, -h / 2, 18, h);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, -w * 0.2, -h * 0.22, w * 0.42, h * 0.16, 4); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'pens': {
      ctx.fillStyle = '#3c4656'; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#262d38'; ctx.beginPath(); ctx.arc(0, 0, o.r - 10, 0, TAU); ctx.fill();
      const cols = ['#e74c3c', '#2e6bd1', '#2f9e66', '#f2b632', '#9b62f2', '#1d1d1f', '#ff7ac8'];
      for (let i = 0; i < 9; i++) { const a = R() * TAU, d = R() * (o.r - 30); ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 13, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(Math.cos(a) * d - 4, Math.sin(a) * d - 4, 4, 0, TAU); ctx.fill(); }
      break;
    }
    case 'cup': {
      ctx.save(); ctx.rotate(o.ha); ctx.fillStyle = o.c; rr(ctx, o.r - 10, -18, 46, 36, 16); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(ctx, o.r + 4, -8, 18, 16, 8); ctx.fill(); ctx.restore();
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#5a3a22'; ctx.beginPath(); ctx.arc(0, 0, o.r - 12, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(-o.r * 0.25, -o.r * 0.25, o.r * 0.3, o.r * 0.14, -0.7, 0, TAU); ctx.fill();
      break;
    }
    case 'ruler': {
      ctx.fillStyle = 'rgba(235,245,255,.88)'; rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(60,90,140,.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      for (let x = -o.w / 2 + 20, i = 0; x < o.w / 2 - 10; x += 15, i++) { ctx.moveTo(x, -o.h / 2); ctx.lineTo(x, -o.h / 2 + (i % 10 === 0 ? 30 : i % 5 === 0 ? 22 : 13)); }
      ctx.stroke();
      break;
    }
    case 'eraser': {
      ctx.fillStyle = '#f3a6b6'; rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 10); ctx.fill();
      ctx.fillStyle = '#2e6bd1'; ctx.fillRect(-o.w * 0.1, -o.h / 2, o.w * 0.6 - 4, o.h);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(o.w * 0.05, -o.h / 2 + 18, o.w * 0.3, 8);
      break;
    }
    case 'lamp': {
      ctx.fillStyle = '#2f3b4c'; ctx.beginPath(); ctx.arc(-50, 40, 60, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2f3b4c'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-50, 40); ctx.lineTo(20, -30); ctx.stroke();
      ctx.fillStyle = '#e2a225'; ctx.beginPath(); ctx.arc(30, -40, 66, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(30, -40, 36, 0, TAU); ctx.fill();
      break;
    }
    case 'shelf': {
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      const cols = ['#c0392b', '#2e6bd1', '#2f9e66', '#e2a225', '#7b52c7', '#d9603b', '#33475b', '#e8e1cf'];
      const long = o.w > o.h, L = long ? o.w : o.h;
      for (let p = 8; p < L - 8;) {
        const bw = 14 + R() * 18;
        if (p + bw > L - 8) break;
        ctx.fillStyle = cols[(R() * cols.length) | 0];
        if (long) { ctx.fillRect(-o.w / 2 + p, -o.h / 2 + 8, bw - 3, o.h / 2 - 14); ctx.fillRect(-o.w / 2 + p, 6, bw - 3, o.h / 2 - 14); }
        else { ctx.fillRect(-o.w / 2 + 8, -o.h / 2 + p, o.w / 2 - 14, bw - 3); ctx.fillRect(6, -o.h / 2 + p, o.w / 2 - 14, bw - 3); }
        p += bw;
      }
      ctx.fillStyle = '#4a3220'; if (long) ctx.fillRect(-o.w / 2, -3, o.w, 6); else ctx.fillRect(-3, -o.h / 2, 6, o.h);
      break;
    }
    case 'table': {
      ctx.fillStyle = '#8a6d3d';
      for (const sgn of [-1, 1]) for (const k of [-0.25, 0.25]) { rr(ctx, o.w * k - 50, sgn * (o.h / 2 + 30) - 40, 100, 80, 14); ctx.fill(); }
      ctx.fillStyle = '#c9a46b'; rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 16); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,30,.35)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#fbfaf5'; ctx.save(); ctx.rotate(0.2); ctx.fillRect(-60, -50, 110, 140); ctx.restore();
      break;
    }
    case 'cart': {
      ctx.fillStyle = '#8f99a6'; rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 12); ctx.fill();
      ctx.fillStyle = '#5b6578'; rr(ctx, -o.w / 2 + 12, -o.h / 2 + 12, o.w - 24, o.h - 24, 8); ctx.fill();
      const cols = ['#c0392b', '#2e6bd1', '#2f9e66', '#e2a225'];
      for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(-o.w / 2 + 22 + i * 46, -o.h / 2 + 22, 36, o.h - 44); }
      break;
    }
    case 'globe': {
      ctx.fillStyle = '#2e6bd1'; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5fbf6b';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse((R() - 0.5) * o.r, (R() - 0.5) * o.r, o.r * 0.3, o.r * 0.18, R() * 3, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#c9a46b'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, o.r + 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-o.r * 0.3, -o.r * 0.3, o.r * 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'tree': {
      const g = ['#3f7d3a', '#4f9444', '#5ca84f'];
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + R(), d = o.r * 0.45; ctx.fillStyle = g[i % 3]; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, o.r * 0.58, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#6fbd5c'; ctx.beginPath(); ctx.arc(-o.r * 0.15, -o.r * 0.2, o.r * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(-o.r * 0.3, -o.r * 0.35, o.r * 0.25, 0, TAU); ctx.fill();
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(-o.w / 2 + 30, -o.h / 2 - 6, 20, o.h + 12); ctx.fillRect(o.w / 2 - 50, -o.h / 2 - 6, 20, o.h + 12);
      ctx.fillStyle = '#b07a45';
      for (let i = 0; i < 3; i++) rr(ctx, -o.w / 2, -o.h / 2 + i * (o.h / 3), o.w, o.h / 3 - 8, 6), ctx.fill();
      break;
    }
    case 'shed': {
      ctx.fillStyle = '#b8483a'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
      ctx.fillStyle = '#9b3a2f'; ctx.fillRect(-o.w / 2, 0, o.w, o.h / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 4; ctx.beginPath();
      for (let x = -o.w / 2 + 40; x < o.w / 2; x += 40) { ctx.moveTo(x, -o.h / 2); ctx.lineTo(x, o.h / 2); }
      ctx.stroke();
      ctx.fillStyle = '#7a2d24'; ctx.fillRect(-o.w / 2, -6, o.w, 12);
      break;
    }
    case 'hoop': {
      ctx.fillStyle = '#5b6578'; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.save(); ctx.rotate(o.a);
      ctx.fillStyle = '#f4f6f9'; ctx.fillRect(o.r - 6, -80, 22, 160);
      ctx.strokeStyle = '#ef6c2a'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(o.r + 70, 0, 48, 0, TAU); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'balloon': {
      ctx.strokeStyle = 'rgba(60,60,70,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, o.r); ctx.quadraticCurveTo(30, o.r + 60, 0, o.r + 120); ctx.stroke();
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-o.r * 0.35, -o.r * 0.35, o.r * 0.28, o.r * 0.18, -0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, o.r - 4, 9, 0, TAU); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawBird(ctx, b, t) {
  const [sx, sy] = shadowOf(b.hh);
  const flap = Math.sin(t * 12 + b.ph) * 0.5 + 0.5;
  const body = (col, wing) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 30, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = wing;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-20, s * (40 + flap * 30), -36, s * (36 + flap * 34)); ctx.quadraticCurveTo(6, s * 20, 14, 0); ctx.fill(); }
  };
  ctx.save(); ctx.translate(b.x + sx, b.y + sy); ctx.rotate(b.dir); ctx.globalAlpha = 0.22; body('#111', '#111'); ctx.restore();
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.dir);
  if (b.k === 'gull') body('#ffffff', '#e3e8ee'); else body('#8b93a1', '#6d7584');
  ctx.fillStyle = b.k === 'gull' ? '#ffb627' : '#3b414c'; ctx.beginPath(); ctx.moveTo(30, -4); ctx.lineTo(44, 0); ctx.lineTo(30, 4); ctx.fill();
  ctx.restore();
}

function star(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d) : ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
  ctx.closePath();
}

function drawRing(ctx, r, t) {
  const [ax, ay, bx, by] = ringEnds(r), k = r.got ? Math.min(1, r.gt / 0.6) : 0;
  if (k >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - k;
  const col = r.got ? '#2fbf71' : '#ff6b5a';
  // Schatten
  ctx.strokeStyle = 'rgba(20,20,30,.16)'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax + 40, ay + 60); ctx.lineTo(bx + 40, by + 60); ctx.stroke();
  // Reifen von oben: flaches Oval zwischen zwei Pfosten
  ctx.translate(r.x, r.y); ctx.rotate(r.a);
  ctx.lineWidth = 14; ctx.strokeStyle = col;
  ctx.beginPath(); ctx.ellipse(0, 0, r.len / 2, 30 + Math.sin(t * 3 + r.x) * 4, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.ellipse(0, -4, r.len / 2 - 8, 22, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  for (const s of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * r.len / 2, 0, 15, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke(); }
  ctx.restore();
  if (r.got) { ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#2fbf71'; ctx.font = '800 54px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`+${BONUS.ring} m`, r.x, r.y - 50 - k * 60); ctx.restore(); }
}

function drawBin(ctx, b, t, id) {
  ctx.save(); ctx.translate(b.x, b.y);
  const pulse = (t * 0.8) % 1;
  ctx.strokeStyle = `rgba(47,191,113,${0.55 * (1 - pulse)})`; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, b.r + 30 + pulse * 120, 0, TAU); ctx.stroke();
  if (id === 'sky') {
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * b.r * 0.75, Math.sin(a) * b.r * 0.75, b.r * 0.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2fbf71'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 90px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Z', 0, 4);
  } else {
    ctx.fillStyle = 'rgba(20,20,30,.2)'; ctx.beginPath(); ctx.arc(14, 22, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3c4656'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#20262f'; ctx.beginPath(); ctx.arc(0, 0, b.r - 14, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,185,.55)'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * (b.r - 14), Math.sin(a) * (b.r - 14)); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#f4f1ea'; ctx.save(); ctx.rotate(0.5); ctx.beginPath(); ctx.arc(-30, 20, 26, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// Boden, Deko, Zonen, Ziele, Ringe, Hindernisse, Sterne (alles unter dem Flieger)
export function drawWorld(ctx, wd, gx, gy, W, H, dark) {
  if (!wd.pat) wd.pat = floorPattern(ctx, wd.id);
  const t = wd.t, pad = 900;
  const vis = (x, y, r = 400) => x > gx - r - pad * 0 && x < gx + W + r && y > gy - r && y < gy + H + r;
  ctx.save();
  ctx.fillStyle = VOID[wd.id]; ctx.fillRect(0, 0, W, H);
  ctx.translate(-gx, -gy);
  const x0 = Math.max(0, gx), y0 = Math.max(0, gy), x1 = Math.min(wd.w, gx + W), y1 = Math.min(wd.h, gy + H);
  if (x1 > x0 && y1 > y0) { ctx.fillStyle = wd.pat; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
  // Rand
  ctx.strokeStyle = wd.id === 'sky' ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.35)'; ctx.lineWidth = 24;
  ctx.strokeRect(-12, -12, wd.w + 24, wd.h + 24);
  for (const d of wd.decor) if (vis(d.x, d.y, 800)) drawDecor(ctx, d, t);
  // Start
  if (vis(wd.start.x, wd.start.y)) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 8; ctx.setLineDash([26, 18]);
    ctx.beginPath(); ctx.arc(wd.start.x, wd.start.y, 200, 0, TAU); ctx.stroke(); ctx.restore();
  }
  for (const z of wd.zones) if (vis(z.x, z.y, z.r)) drawZone(ctx, z, t);
  for (const b of wd.bins) if (vis(b.x, b.y, 300)) drawBin(ctx, b, t, wd.id);
  for (const o of wd.solids) if (vis(o.x, o.y, o.br + 80)) drawSolid(ctx, o, t);
  for (const r of wd.rings) if (vis(r.x, r.y, 300)) drawRing(ctx, r, t);
  for (const s of wd.stars) {
    if (!vis(s.x, s.y, 80)) continue;
    const k = s.got ? Math.min(1, s.gt / 0.45) : 0;
    if (k >= 1) continue;
    ctx.save(); ctx.translate(s.x, s.y - k * 80); ctx.globalAlpha = 1 - k;
    ctx.fillStyle = 'rgba(20,20,30,.15)'; ctx.save(); ctx.translate(16, 24); star(ctx, 30); ctx.fill(); ctx.restore();
    ctx.rotate(Math.sin(t * 2 + s.ph) * 0.25);
    const sc = 1 + Math.sin(t * 4 + s.ph) * 0.06 + k * 0.6; ctx.scale(sc, sc);
    ctx.fillStyle = '#ffc928'; star(ctx, 32); ctx.fill();
    ctx.strokeStyle = '#d68a00'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-7, -9, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const b of wd.birds) if (vis(b.x, b.y, 100)) drawBird(ctx, b, t);
  ctx.restore();
  if (dark) { ctx.fillStyle = 'rgba(8,12,22,.32)'; ctx.fillRect(0, 0, W, H); }
}
// Wolken und Gewitter über dem Flieger
export function drawWorldOver(ctx, wd, gx, gy, W, H) {
  ctx.save(); ctx.translate(-gx, -gy);
  for (const z of wd.zones) if ((z.k === 'cloud' || z.k === 'storm') && z.x > gx - z.r && z.x < gx + W + z.r && z.y > gy - z.r && z.y < gy + H + z.r) drawOverZone(ctx, z, wd.t);
  ctx.restore();
}

// Übersichtskarte (einmal vorzeichnen)
export function miniBase(wd, w) {
  const h = Math.round(w * wd.h / wd.w), c = document.createElement('canvas'), s = w / wd.w;
  c.width = w * 2; c.height = h * 2;
  const x = c.getContext('2d'); x.scale(2 * s, 2 * s);
  x.fillStyle = worldDef(wd.id).color; x.fillRect(0, 0, wd.w, wd.h);
  const ZC = { lift: 'rgba(255,190,40,.7)', gust: 'rgba(60,130,220,.45)', wet: 'rgba(70,110,160,.6)', storm: 'rgba(60,66,84,.6)', cloud: 'rgba(255,255,255,.6)' };
  for (const z of wd.zones) { x.fillStyle = ZC[z.k]; x.beginPath(); x.arc(z.x, z.y, z.r, 0, TAU); x.fill(); }
  x.fillStyle = 'rgba(30,36,48,.75)';
  for (const o of wd.solids) {
    if (o.s === 'c') { x.beginPath(); x.arc(o.x, o.y, Math.max(o.r, 90), 0, TAU); x.fill(); }
    else { x.save(); x.translate(o.x, o.y); x.rotate(o.a); x.fillRect(-o.w / 2, -o.h / 2, Math.max(o.w, 120), Math.max(o.h, 120)); x.restore(); }
  }
  x.fillStyle = '#2fbf71'; for (const b of wd.bins) { x.beginPath(); x.arc(b.x, b.y, 300, 0, TAU); x.fill(); }
  x.strokeStyle = '#fff'; x.lineWidth = 120; x.beginPath(); x.arc(wd.start.x, wd.start.y, 260, 0, TAU); x.stroke();
  return c;
}
export function drawMini(mc, base, wd, px, py, gx, gy, W, H, trail) {
  const x = mc.getContext('2d'), w = mc.width, h = mc.height, s = w / wd.w;
  x.clearRect(0, 0, w, h); x.drawImage(base, 0, 0, w, h);
  x.fillStyle = '#ffc928';
  for (const st of wd.stars) if (!st.got) x.fillRect(st.x * s - 1, st.y * s - 1, 2.5, 2.5);
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.strokeRect(gx * s, gy * s, W * s, H * s);
  if (trail && trail.length > 1) { x.strokeStyle = 'rgba(79,124,255,.8)'; x.lineWidth = 2; x.beginPath(); trail.forEach(([a, b], i) => (i ? x.lineTo(a * s, b * s) : x.moveTo(a * s, b * s))); x.stroke(); }
  x.fillStyle = '#ff3b5c'; x.strokeStyle = '#fff'; x.lineWidth = 2;
  x.beginPath(); x.arc(px * s, py * s, 5, 0, TAU); x.fill(); x.stroke();
}
