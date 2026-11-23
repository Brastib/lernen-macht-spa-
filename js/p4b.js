// Papier-Spiele, Paket 4 (Teil 2): Kritzelgolf (Bahn selbst malen, dann putten) und Malraten (einer malt, der andere rät).
import { h, icon, toast } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, store, rng, turnCard } from './sketch.js';

// ======================================================================
// Kritzelgolf
// ======================================================================
const GW = 1000, GH = 640, BR = 9, HOLE = 15, CELL = 10, HOLES = 3, MAXS = 10;
const MW = GW / CELL, MH = GH / CELL;
function emptyCourse() { return { walls: [], mask: new Uint8Array(MW * MH), start: [110, GH / 2], hole: [GW - 110, GH / 2] }; }
function paintMask(c, x, y, v, r = 26) {
  for (let my = Math.floor((y - r) / CELL); my <= Math.floor((y + r) / CELL); my++) for (let mx = Math.floor((x - r) / CELL); mx <= Math.floor((x + r) / CELL); mx++) {
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) continue;
    if (Math.hypot((mx + 0.5) * CELL - x, (my + 0.5) * CELL - y) <= r) c.mask[my * MW + mx] = v;
  }
}
function randomCourse(R) {
  const c = emptyCourse();
  c.start = [90 + R() * 60, 120 + R() * (GH - 240)]; c.hole = [GW - 90 - R() * 80, 120 + R() * (GH - 240)];
  const n = 3 + ((R() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const cx = 260 + (k + 0.5) * (480 / n) + (R() - 0.5) * 60, top = R() < 0.5;
    const len = 200 + R() * 220, pts = [];
    for (let t = 0; t <= 6; t++) pts.push([cx + Math.sin(t + k) * 12, top ? t / 6 * len : GH - t / 6 * len]);
    c.walls.push(pts);
  }
  for (let k = 0; k < 2; k++) { const v = R() < 0.55 ? 1 : 2, x0 = 300 + R() * 400, y0 = 80 + R() * (GH - 160); for (let t = 0; t < 8; t++) paintMask(c, x0 + Math.cos(t) * 30 * R(), y0 + Math.sin(t * 1.3) * 30, v, 34); }
  // Abschlag und Loch frei halten
  paintMask(c, ...c.start, 0, 40); paintMask(c, ...c.hole, 0, 40);
  return c;
}
function drawCourse(x, c, dark, { ink }) {
  // Sand und Wasser (jede Sorte als eine Fläche, damit nichts doppelt durchscheint)
  for (const v of [1, 2]) {
    x.beginPath();
    for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) if (c.mask[my * MW + mx] === v) { x.moveTo((mx + 0.5) * CELL + CELL * 0.85, (my + 0.5) * CELL); x.arc((mx + 0.5) * CELL, (my + 0.5) * CELL, CELL * 0.85, 0, Math.PI * 2); }
    x.fillStyle = v === 1 ? (dark ? 'rgba(242,194,48,.3)' : 'rgba(242,194,48,.42)') : (dark ? 'rgba(63,140,230,.42)' : 'rgba(63,150,230,.36)');
    x.fill('nonzero');
  }
  x.save(); x.beginPath();
  for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) if (c.mask[my * MW + mx] === 2) { x.moveTo((mx + 0.5) * CELL + CELL * 0.85, (my + 0.5) * CELL); x.arc((mx + 0.5) * CELL, (my + 0.5) * CELL, CELL * 0.85, 0, Math.PI * 2); }
  x.clip(); x.strokeStyle = dark ? '#8fc3ff' : '#2a6fc0'; x.globalAlpha = 0.6; x.lineWidth = 1.4; x.beginPath();
  for (let yy = 6; yy < GH; yy += 12) for (let xx = (yy % 24 ? 0 : 10); xx < GW; xx += 24) { x.moveTo(xx, yy); x.quadraticCurveTo(xx + 5, yy - 4, xx + 10, yy); }
  x.stroke(); x.restore();
  x.save(); x.fillStyle = dark ? '#d8b04a' : '#a07a1f'; x.globalAlpha = 0.6;
  for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) if (c.mask[my * MW + mx] === 1 && (mx * 7 + my * 3) % 5 === 0) { x.beginPath(); x.arc(mx * CELL + 5, my * CELL + 5, 1.2, 0, Math.PI * 2); x.fill(); }
  x.restore();
  // Wände: dicke Bleistift-Striche
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const w of c.walls) {
    x.strokeStyle = ink; x.lineWidth = 7; x.beginPath(); w.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    x.strokeStyle = dark ? '#1b1f28' : '#fbfaf5'; x.lineWidth = 2; x.globalAlpha = 0.5; x.stroke(); x.globalAlpha = 1;
  }
  // Abschlag
  x.strokeStyle = ink; x.lineWidth = 2; x.setLineDash([5, 5]); x.beginPath(); x.arc(c.start[0], c.start[1], 18, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  // Loch mit Fahne
  const [hx, hy] = c.hole;
  x.fillStyle = dark ? '#05070b' : '#26262b'; pcirc(x, hx, hy, HOLE, 3, 0.08); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
  x.lineWidth = 3; x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx, hy - 62); x.stroke();
  x.fillStyle = '#e0483e'; x.beginPath(); x.moveTo(hx, hy - 62); x.lineTo(hx + 34, hy - 52); x.lineTo(hx, hy - 42); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke();
}
function fieldGeo(C) { const U = Math.min((C.cw - 12) / GW, (C.ch - 12) / GH); return { U, ox: (C.cw - GW * U) / 2, oy: (C.ch - GH * U) / 2 }; }
function drawFrame(x, C, dark, g) {
  x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 20 * g.U, g.ox, g.oy);
  x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
  x.fillStyle = dark ? 'rgba(80,200,120,.06)' : 'rgba(80,190,110,.08)'; x.fillRect(0, 0, GW, GH);
  x.strokeStyle = inkOf(dark); x.lineWidth = 4; x.lineCap = 'round'; prect(x, 0, 0, GW, GH, 77, 1.5); x.stroke();
}
// Bahn malen
export function drawCourseSheet(fx, p, n, R, opt = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    let c = emptyCourse(), tool = 'wall', cur = null, drag = null;
    const tools = [['wall', 'Wand', 'pen'], ['sand', 'Sand', 'marker'], ['water', 'Wasser', 'bucket'], ['erase', 'Radierer', 'eraser'], ['start', 'Abschlag', 'target'], ['hole', 'Loch', 'golfflag']];
    const seg = h('div.gseg.glftools');
    const drawSeg = () => seg.replaceChildren(...tools.map(([k, l, ic]) => h('button' + (k === tool ? '.on' : ''), { on: { click: () => { tool = k; drawSeg(); } } }, icon(ic), h('span', { text: l }))));
    drawSeg();
    const host = h('div.hsarea');
    const wrap = h('div.hswrap', null,
      h('div.hshud', null, chip(p, h('small', { text: opt.hub ? 'malt eine Bahn' : `malt Loch ${n} von ${HOLES}` })), h('span.bsspacer'),
        h('button.btn', { text: 'Zufallsbahn', on: { click: () => { c = randomCourse(R); draw(); } } }),
        h('button.btn', { text: 'Leeren', on: { click: () => { c = emptyCourse(); draw(); } } }),
        h('button.btn.primary', { text: opt.okText || 'Fertig', on: { click: () => { cleanup(); resolve(c); } } })),
      opt.picker ? opt.picker((d) => { c = d; draw(); }) : null, seg, h('p.hshint', { text: 'Mal Wände mit dem Stift, Sand bremst, Wasser kostet einen Schlag. Abschlag und Loch kannst du verschieben.' }), host);
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host), x = C.x;
    function draw() { const g = fieldGeo(C); drawFrame(x, C, dark, g); drawCourse(x, c, dark, { ink }); if (cur) { x.strokeStyle = ink; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); cur.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
      x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.beginPath(); x.arc(c.start[0], c.start[1], BR, 0, Math.PI * 2); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke(); }
    const ro = new ResizeObserver(draw); ro.observe(host);
    const toW = (e) => { const g = fieldGeo(C), r = C.cv.getBoundingClientRect(); return [Math.max(0, Math.min(GW, (e.clientX - r.left - g.ox) / g.U)), Math.max(0, Math.min(GH, (e.clientY - r.top - g.oy) / g.U))]; };
    const near = (pt, q, d) => Math.hypot(pt[0] - q[0], pt[1] - q[1]) < d;
    C.cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); const pt = toW(e); try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
      if (tool === 'start' || near(pt, c.start, 30)) { drag = 'start'; c.start = pt; }
      else if (tool === 'hole' || near(pt, c.hole, 30)) { drag = 'hole'; c.hole = pt; }
      else if (tool === 'wall') cur = [pt];
      else { drag = tool; act(pt); }
      draw();
    });
    const act = (pt) => {
      if (drag === 'sand') paintMask(c, ...pt, 1); else if (drag === 'water') paintMask(c, ...pt, 2);
      else if (drag === 'erase') { paintMask(c, ...pt, 0); c.walls = c.walls.filter((w) => !w.some((q) => near(q, pt, 26))); }
    };
    C.cv.addEventListener('pointermove', (e) => {
      const pt = toW(e);
      if (cur) { const l = cur[cur.length - 1]; if (Math.hypot(pt[0] - l[0], pt[1] - l[1]) > 8) cur.push(pt); draw(); }
      else if (drag === 'start') { c.start = pt; draw(); } else if (drag === 'hole') { c.hole = pt; draw(); } else if (drag) { act(pt); draw(); }
    });
    const up = () => { if (cur && cur.length > 1) c.walls.push(cur); cur = null; drag = null; if (c.walls.length > 60) c.walls.shift(); draw(); };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    const cleanup = () => { ro.disconnect(); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    draw();
  });
}
// Ein Loch spielen. Ergebnis: Schläge
function playHole(fx, p, c, n, info) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const st = h('b', { text: '0' });
    const host = h('div.hsarea');
    const wrap = h('div.hswrap', null, h('div.hshud', null, chip(p, h('small', { text: `Loch ${n} von ${HOLES}` })), h('div.hsstats', null, h('span.hsstat', null, h('small', { text: 'Schläge' }), st), ...info.map(([l, v]) => h('span.hsstat', null, h('small', { text: l }), h('b', { text: String(v) }))))),
      h('p.hshint', { text: 'Vom Ball weg nach hinten ziehen und loslassen, wie eine Schleuder. Weiter ziehen = fester.' }), host);
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host), x = C.x;
    const ball = { x: c.start[0], y: c.start[1], vx: 0, vy: 0, z: 1 };
    let strokes = 0, lastPos = [...c.start], aim = null, raf = 0, last = 0, done = false, sink = 0, msg = '', msgT = 0, splash = null, sandPuff = null, inSand = false;
    const hdist = () => Math.hypot(ball.x - c.hole[0], ball.y - c.hole[1]);
    const segs = []; c.walls.forEach((w) => { for (let k = 1; k < w.length; k++) segs.push([w[k - 1], w[k]]); });
    const toW = (e) => { const g = fieldGeo(C), r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - g.ox) / g.U, (e.clientY - r.top - g.oy) / g.U]; };
    const moving = () => Math.hypot(ball.vx, ball.vy) > 2;
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (done || moving()) return; aim = { id: e.pointerId, from: toW(e), to: toW(e) }; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aim && aim.id === e.pointerId) aim.to = toW(e); });
    const release = (e) => {
      if (!aim || aim.id !== e.pointerId) return;
      const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy); aim = null;
      if (L < 12) return;
      const pw = Math.min(1, L / 260) * 1050;
      lastPos = [ball.x, ball.y]; ball.vx = dx / L * pw; ball.vy = dy / L * pw; strokes++; st.textContent = String(strokes);
      wrap.querySelector('.hshint')?.remove();
    };
    C.cv.addEventListener('pointerup', release); C.cv.addEventListener('pointercancel', () => { aim = null; });
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    const finish = (v, text) => { if (done) return; done = true; msg = text; msgT = 9; setTimeout(() => { cleanup(); resolve(v); }, 1300); };
    function step(dt) {
      if (done) return;
      const n2 = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 3)), d = dt / n2;
      for (let s = 0; s < n2; s++) {
        const mx = Math.floor(ball.x / CELL), my = Math.floor(ball.y / CELL), m = mx >= 0 && my >= 0 && mx < MW && my < MH ? c.mask[my * MW + mx] : 0;
        const sp = Math.hypot(ball.vx, ball.vy);
        if (m === 2 && hdist() > HOLE + 4) { splash = { x: ball.x, y: ball.y, t: 0 }; strokes++; st.textContent = String(strokes); ball.vx = ball.vy = 0; ball.x = lastPos[0]; ball.y = lastPos[1]; msg = 'Platsch! Ins Wasser, +1 Schlag'; msgT = 1.3; if (strokes >= MAXS) finish(MAXS, `${MAXS} Schläge, weiter geht’s`); return; }
        if (m === 1 && sp > 240) { const k = 240 / sp; ball.vx *= k; ball.vy *= k; if (!inSand) { sandPuff = { x: ball.x, y: ball.y, t: 0 }; } }
        inSand = m === 1;
        if (sp > 0) { const dec = (m === 1 ? 700 : 95) * d + sp * (m === 1 ? 3.2 : 0.55) * d; const k = Math.max(0, sp - dec) / sp; ball.vx *= k; ball.vy *= k; }
        ball.x += ball.vx * d; ball.y += ball.vy * d;
        // Rand
        if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx) * 0.8; } if (ball.x > GW - BR) { ball.x = GW - BR; ball.vx = -Math.abs(ball.vx) * 0.8; }
        if (ball.y < BR) { ball.y = BR; ball.vy = Math.abs(ball.vy) * 0.8; } if (ball.y > GH - BR) { ball.y = GH - BR; ball.vy = -Math.abs(ball.vy) * 0.8; }
        // Wände
        for (const [a, b] of segs) {
          const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
          const t = Math.max(0, Math.min(1, ((ball.x - a[0]) * ex + (ball.y - a[1]) * ey) / l2));
          const px = a[0] + ex * t, py = a[1] + ey * t, dx = ball.x - px, dy = ball.y - py, dd = Math.hypot(dx, dy), R0 = BR + 3.5;
          if (dd < R0 && dd > 0.0001) {
            const nx = dx / dd, ny = dy / dd; ball.x = px + nx * R0; ball.y = py + ny * R0;
            const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 1.8 * vn * nx; ball.vy -= 1.8 * vn * ny; }
          }
        }
        // Loch
        const hd = Math.hypot(ball.x - c.hole[0], ball.y - c.hole[1]);
        if (hd < HOLE - 2) {
          if (Math.hypot(ball.vx, ball.vy) < 560) { ball.vx = ball.vy = 0; ball.x = c.hole[0]; ball.y = c.hole[1]; sink = 1; return finish(strokes, strokes === 1 ? 'Ass! Mit einem Schlag!' : `Drin! ${strokes} Schläge`); }
          ball.vx += (c.hole[0] - ball.x) * 4 * d; ball.vy += (c.hole[1] - ball.y) * 4 * d;
        }
      }
      if (!moving()) {
        ball.vx = ball.vy = 0;
        const mx = Math.floor(ball.x / CELL), my = Math.floor(ball.y / CELL);
        if (c.mask[my * MW + mx] === 2) { strokes++; st.textContent = String(strokes); ball.x = lastPos[0]; ball.y = lastPos[1]; msg = 'Platsch! +1 Schlag'; msgT = 1.2; }
        if (strokes >= MAXS) finish(MAXS, `${MAXS} Schläge, weiter geht’s`);
      }
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0); last = t;
      step(dt); msgT = Math.max(0, msgT - dt); sink = Math.max(0, sink - dt);
      const g = fieldGeo(C); drawFrame(x, C, dark, g); drawCourse(x, c, dark, { ink });
      if (splash) { splash.t += dt; const k = splash.t / 0.9; x.strokeStyle = '#2f7cf6'; x.lineWidth = 3; for (let r = 0; r < 3; r++) { x.globalAlpha = Math.max(0, 1 - k) * (1 - r * 0.25); x.beginPath(); x.ellipse(splash.x, splash.y, 6 + (k * 40 + r * 10), (6 + k * 40 + r * 10) * 0.6, 0, 0, Math.PI * 2); x.stroke(); } x.fillStyle = '#2f7cf6'; for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2; x.globalAlpha = Math.max(0, 1 - k); x.beginPath(); x.arc(splash.x + Math.cos(a) * k * 30, splash.y + Math.sin(a) * k * 18 - Math.sin(k * Math.PI) * 26, 3, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; if (k >= 1) splash = null; }
      if (sandPuff) { sandPuff.t += dt; const k = sandPuff.t / 0.6; x.fillStyle = '#d9b46a'; for (let q = 0; q < 8; q++) { const a = q / 8 * Math.PI * 2; x.globalAlpha = Math.max(0, 1 - k) * 0.8; x.beginPath(); x.arc(sandPuff.x + Math.cos(a) * k * 22, sandPuff.y + Math.sin(a) * k * 22, 2.5, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; if (k >= 1) sandPuff = null; }
      if (aim && !moving()) {
        const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy), k = Math.min(1, L / 260);
        if (L > 12) {
          const ux = dx / L, uy = dy / L;
          x.strokeStyle = p.color; x.lineWidth = 3; x.setLineDash([2, 9]); x.lineCap = 'round';
          x.beginPath(); x.moveTo(ball.x, ball.y); x.lineTo(ball.x + ux * (60 + k * 220), ball.y + uy * (60 + k * 220)); x.stroke(); x.setLineDash([]);
          x.strokeStyle = ink; x.lineWidth = 2; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(ball.x, ball.y); x.lineTo(ball.x - ux * k * 120, ball.y - uy * k * 120); x.stroke(); x.globalAlpha = 1;
          x.strokeStyle = k > 0.8 ? '#e0483e' : p.color; x.lineWidth = 4; x.beginPath(); x.arc(ball.x, ball.y, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); x.stroke();
        }
      }
      if (!done || sink > 0 || !msg.startsWith('Drin') && !msg.startsWith('Ass')) {
        x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(ball.x + 3, ball.y + 4, BR, BR * 0.7, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = dark ? '#f4f1e6' : '#fff'; pcirc(x, ball.x, ball.y, BR * (done ? Math.max(0.3, sink) : 1), 5, 0.1); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
        x.strokeStyle = p.color; x.lineWidth = 1.5; x.beginPath(); x.arc(ball.x, ball.y, BR * 0.45, 0.3, 2.6); x.stroke();
      }
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); const fs = Math.round(Math.max(22, Math.min(38, C.cw / 16))); x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 20, x.measureText(msg).width + 44), hh = fs + 26; x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
        prect(x, C.cw / 2 - w / 2, C.ch / 2 - hh / 2, w, hh, 12, 1.2); x.fill(); x.stroke(); x.fillStyle = ink; x.fillText(msg, C.cw / 2, C.ch / 2 + 2, w - 20); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
export function golf(fx, A, B) {
  return (async () => {
    const R = rng((Math.random() * 1e9) | 0), P = [A, B].filter(Boolean), tot = P.map(() => 0);
    for (let n = 1; n <= HOLES; n++) {
      const drawer = P[(n - 1) % P.length];
      if (B) { const ok = await turnCard(fx, drawer, `Loch ${n}: ${drawer.name} malt die Bahn`, 'Wände, Sand und Wasser malen. Oder eine Zufallsbahn nehmen.', 'Bahn malen', 'golfflag'); if (!ok) return null; }
      const { mapPicker } = await import('./hub.js');
      const c = await drawCourseSheet(fx, drawer, n, R, { picker: (pick) => mapPicker('golf', P, pick) }); if (!c) return null;
      for (const [i, p] of P.entries()) {
        if (B) { const ok = await turnCard(fx, p, `Loch ${n}: ${p.name} puttet`, i ? `Zu schlagen: ${tot[0]} Schläge insgesamt` : 'Weniger Schläge ist besser.', 'Los', 'golfflag'); if (!ok) return null; }
        const s = await playHole(fx, p, c, n, B ? [['Gesamt', tot[i]]] : [['Gesamt', tot[0]]]); if (s == null) return null;
        tot[i] += s;
      }
    }
    if (!B) return { score: tot[0] };
    return { w: tot[0] < tot[1] ? 0 : tot[1] < tot[0] ? 1 : null, detail: `${tot[0]} : ${tot[1]} Schläge (weniger gewinnt)` };
  })();
}

// ======================================================================
// Malraten
// ======================================================================
const WORDS = ('Haus Baum Sonne Auto Fahrrad Katze Hund Fisch Vogel Blume Apfel Banane Brille Buch Stift Schere Uhr Handy Lampe Stuhl Tisch Bett Tür Fenster Schlüssel Regenschirm Eis Pizza Kuchen Tasse Flasche Schiff Flugzeug Rakete Zug Ball Krone Herz Stern Mond Wolke Blitz Regen Schneemann Berg Insel Brücke Leiter Zelt Burg Gespenst Roboter Drache Pilz Kaktus Schnecke Spinne Biene Schmetterling Elefant Giraffe Schlange Maus Pinguin Hase Ente Frosch Schildkröte Hai Krake Igel Eule Pferd Kuh Schwein Gitarre Trommel Geschenk Kerze Ballon Kamera Fernseher Computer Kopfhörer Rucksack Schuh Hut Socke Hose Pullover Zahnbürste Taschenlampe Anker Bombe Pfeil Bogen Schwert Schild Hammer Säge Glühbirne Magnet Pflaster Spritze Lineal Zirkel Taschenrechner Globus Mikroskop Tafel Schulranzen Kran Bagger Traktor Feuer Vulkan Leuchtturm Windmühle Ampel Rutsche Schaukel Zahn Auge Nase Ohr Hand Fuß Skateboard Kekse Popcorn Burger Pommes Erdbeere Karotte Zitrone Ananas Wassermelone Würfel Puzzle Rätsel Krokodil Dino Einhorn Zauberer Pirat Ritter Astronaut Ufo Regenbogen Sanduhr Briefumschlag Paket Wecker').split(' ');
const DCOL = ['#26262b', '#e0483e', '#2f7cf6', '#2fbf71', '#f2a20c', '#a46bff'];
function pickOptions(R, word, n = 8) { const set = new Set([word]); while (set.size < n) set.add(WORDS[(R() * WORDS.length) | 0]); return [...set].sort(() => R() - 0.5); }
const keepDrawings = (list) => { try { localStorage.setItem('gDrawings', JSON.stringify(list.slice(-24))); return true; } catch (e) { return false; } };
const drawings = () => store.get('gDrawings', []);
// Gemeinsame Ratefläche: Bild (malen oder abspielen) + Antwort-Knöpfe + Zeit
function guessRound(fx, { drawer, guesser, word, R, replay = null, time = 60, title }) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const opts = pickOptions(R, word);
    const timeEl = h('b', { text: String(time) });
    let color = DCOL[0], width = 5, strokes = [], curS = null, t0 = performance.now(), left = time, lock = 0, done = false, raf = 0, last = 0;
    const tools = h('div.drtools', null, ...DCOL.map((c) => h('button.drcol', { style: { '--c': c }, 'aria-label': 'Farbe', on: { click: (e) => { color = c; width = 5; tools.querySelectorAll('.drcol').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } } })),
      h('button.btn.drbtn', { on: { click: () => { color = 'erase'; width = 26; tools.querySelectorAll('.drcol').forEach((b) => b.classList.remove('on')); } } }, icon('eraser'), h('span', { text: 'Radierer' })),
      h('button.btn.drbtn', { on: { click: () => { strokes = []; } } }, icon('trash'), h('span', { text: 'Leeren' })));
    tools.firstChild.classList.add('on');
    // Allein (Bild abspielen): Antworten zum Antippen. Zu zweit: der Maler entscheidet mit Richtig / Falsch.
    const ansEls = replay ? opts.map((w) => h('button.drans', { text: w, on: { pointerdown: (e) => { e.preventDefault(); answer(w, e.currentTarget); } } })) : [];
    let wrong = 0;
    const wrongEl = h('small.drwrong', { text: 'Sag deine Antwort laut!' });
    const peek = h('button.drans.drpeek', { text: 'Wort zeigen (halten)' });
    const showW = (on) => { peek.textContent = on ? word : 'Wort zeigen (halten)'; };
    peek.addEventListener('pointerdown', (e) => { e.preventDefault(); showW(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => peek.addEventListener(ev, () => showW(false)));
    const judge = replay ? null : h('div.dranswers.drjudge', null,
      h('button.drans.drok', { on: { pointerdown: (e) => { e.preventDefault(); if (!done) end(true, `Richtig: ${word}!`); } } }, icon('check'), h('span', { text: 'Richtig' })),
      h('button.drans.drno', { on: { pointerdown: (e) => { e.preventDefault(); if (done) return; wrong++; wrongEl.textContent = `${wrong}× falsch geraten`; msg = 'Falsch! Weiter raten'; msgT = 1; } } }, icon('close'), h('span', { text: 'Falsch' })),
      peek, wrongEl);
    const ansBox = h('div.drsideans', null, h('small.drwho', null, chip(guesser, h('small', { text: replay ? 'rät: Was ist das?' : 'rät laut' }))), replay ? h('div.dranswers', null, ...ansEls) : judge,
      replay ? null : h('small.drjudgehint', { text: `${drawer ? drawer.name : 'Der Maler'} drückt Richtig oder Falsch.` }));
    const host = h('div.drboard');
    const wrap = h('div.hswrap.drwrap', null,
      h('div.hshud', null, drawer ? chip(drawer, h('small', { text: 'malt' })) : h('span.pkchip', null, h('b', { text: title || 'Bilder raten' })), h('span.bsspacer'), h('span.hsstat', null, h('small', { text: 'Zeit' }), timeEl), h('button.btn.hsfin', { text: 'Aufgeben', on: { click: () => end(false, 'Aufgegeben') } })),
      replay ? null : tools, h('div.drmain', null, host, ansBox));
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host), x = C.x;
    let msg = '', msgT = 0;
    // Malen (Koordinaten 0..1000 × 0..700, damit Bilder auf jedem Gerät gleich aussehen)
    const geo = () => { const U = Math.min(C.cw / 1000, C.ch / 700); return { U, ox: (C.cw - 1000 * U) / 2, oy: (C.ch - 700 * U) / 2 }; };
    const toW = (e) => { const g = geo(), r = C.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left - g.ox) / g.U), Math.round((e.clientY - r.top - g.oy) / g.U)]; };
    if (!replay) {
      C.cv.addEventListener('pointerdown', (e) => { if (done) return; e.preventDefault(); const [a, b] = toW(e); curS = { c: color, w: width, p: [[a, b, Math.round(performance.now() - t0)]] }; strokes.push(curS); try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
      C.cv.addEventListener('pointermove', (e) => { if (!curS) return; const [a, b] = toW(e), l = curS.p[curS.p.length - 1]; if (Math.hypot(a - l[0], b - l[1]) > 3) curS.p.push([a, b, Math.round(performance.now() - t0)]); });
      const up = () => { curS = null; }; C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    }
    function answer(w, el) {
      if (done || lock > 0) return;
      if (w === word) { el.classList.add('ok'); end(true, `Richtig: ${word}!`); }
      else { el.classList.add('bad'); el.disabled = true; lock = 3; msg = 'Falsch! 3 Sekunden Pause'; msgT = 1.2; ansBox.classList.add('locked'); }
    }
    function end(ok, text) {
      if (done) return; done = true; msg = text; msgT = 9;
      if (!ok) ansEls.forEach((b) => { if (b.textContent === word) b.classList.add('ok'); });
      const pts = ok ? 1 + Math.ceil(left / 10) : 0;
      setTimeout(() => { cancelAnimationFrame(raf); C.ro.disconnect(); resolve({ ok, pts, strokes }); }, 1600);
    }
    fx.signal.addEventListener('abort', () => { done = true; cancelAnimationFrame(raf); C.ro.disconnect(); resolve(null); }, { once: true });
    function drawStroke(s, upto) {
      const pts = upto == null ? s.p : s.p.filter((q) => q[2] <= upto); if (!pts.length) return;
      x.strokeStyle = s.c === 'erase' ? (dark ? '#1b1f28' : '#fbfaf5') : s.c === '#26262b' ? ink : s.c; x.lineWidth = s.w; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); if (pts.length === 1) x.lineTo(pts[0][0] + 0.1, pts[0][1]); x.stroke();
    }
    const total = replay ? Math.max(1, ...replay.flatMap((s) => s.p.map((q) => q[2]))) : 1;
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.05, last ? (tm - last) / 1000 : 0); last = tm;
      if (!done) { left = Math.max(0, time - (performance.now() - t0) / 1000); timeEl.textContent = String(Math.ceil(left)); if (left <= 0) end(false, `Zeit um! Es war: ${word}`); }
      if (lock > 0) { lock -= dt; if (lock <= 0) ansBox.classList.remove('locked'); }
      msgT = Math.max(0, msgT - dt);
      const g = geo(); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.fillStyle = dark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.5)'; x.fillRect(0, 0, 1000, 700);
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, 2, 2, 996, 696, 5, 1.2); x.stroke();
      // abspielen: Bild entsteht in 70 % der Zeit
      const upto = replay ? ((performance.now() - t0) / 1000) / (time * 0.7) * total : null;
      (replay || strokes).forEach((s) => drawStroke(s, done && replay ? null : upto));
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); const fs = Math.round(Math.max(20, Math.min(34, C.cw / 16))); x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 20, x.measureText(msg).width + 40), hh = fs + 24; x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
        prect(x, C.cw / 2 - w / 2, 12, w, hh, 4, 1); x.fill(); x.stroke(); x.fillStyle = ink; x.fillText(msg, C.cw / 2, 12 + hh / 2 + 1, w - 20); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
export function paintGuess(fx, A, B) {
  return (async () => {
    const R = rng((Math.random() * 1e9) | 0);
    if (!B) return guessSolo(fx, A, R);
    const P = [A, B], pts = [0, 0], ROUNDS = 4, used = new Set();
    for (let r = 0; r < ROUNDS; r++) {
      const di = r % 2, d = P[di], g = P[1 - di];
      let word; do { word = WORDS[(R() * WORDS.length) | 0]; } while (used.has(word)); used.add(word);
      const ok1 = await turnCard(fx, d, `Runde ${r + 1} von ${ROUNDS}: ${d.name} malt`, `${g.name} schaut bitte weg! ${d.name} tippt auf den Knopf, um das geheime Wort zu sehen.`, 'Wort zeigen', 'pen');
      if (!ok1) return null;
      const ok2 = await turnCard(fx, d, word, `Merk dir das Wort. Dann darf ${g.name} wieder schauen. Mal es in 60 Sekunden, ohne Buchstaben!`, 'Los, malen!', 'pen');
      if (!ok2) return null;
      const res = await guessRound(fx, { drawer: d, guesser: g, word, R });
      if (!res) return null;
      if (res.ok) { pts[1 - di] += res.pts; pts[di] += Math.ceil(res.pts / 2); }
      if (res.strokes.length) { const list = drawings(); list.push({ word, by: d.name, s: res.strokes.map((s) => ({ c: s.c, w: s.w, p: s.p.slice(0, 600) })) }); if (!keepDrawings(list)) toast('Kein Platz, das Bild wurde nicht gespeichert.'); }
    }
    return { w: pts[0] > pts[1] ? 0 : pts[1] > pts[0] ? 1 : null, detail: `${pts[0]} : ${pts[1]} Punkte (Raten gibt volle Punkte, gut malen die Hälfte)` };
  })();
}
async function guessSolo(fx, p, R) {
  const list = drawings();
  if (list.length < 1) {
    await turnCard(fx, p, 'Noch keine Bilder', 'Spielt erst Malraten zu zweit. Die gemalten Bilder werden gespeichert, dann kannst du sie hier allein erraten.', 'Schließen', 'pen');
    fx.close(); return null;
  }
  const pick = [...list].sort(() => R() - 0.5).slice(0, 5);
  let score = 0;
  for (const [k, d] of pick.entries()) {
    const ok = await turnCard(fx, p, `Bild ${k + 1} von ${pick.length}`, `Gemalt von ${d.by}. Das Bild malt sich langsam von selbst. Je schneller du rätst, desto mehr Punkte.`, 'Los', 'pen');
    if (!ok) return null;
    const res = await guessRound(fx, { drawer: null, guesser: p, word: d.word, R, replay: d.s, time: 30, title: `Bild ${k + 1} von ${pick.length}` });
    if (!res) return null; score += res.pts;
  }
  return { score };
}
