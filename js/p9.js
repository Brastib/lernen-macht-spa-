// Papier-Spiele, Paket 9: Tintenbahn (Linien malen, Kugel in den Becher), Pärchenjagd (Kritzel-Paare finden),
// Korbwurf (Papierkugel in den Papierkorb), Stiftezupfen (Stifte vom Haufen nehmen, ohne dass einer wackelt).
// Alles im Kritzel-Look auf kariertem Papier, nur Finger oder Pencil.
import { h } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, store, rng, turnCard } from './sketch.js';

function banner(x, cw, ch, dark, txt, y = null) {
  const ink = inkOf(dark);
  x.save(); const fs = Math.round(Math.max(20, Math.min(34, cw / 16)));
  x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(cw - 20, x.measureText(txt).width + 44), hh = fs + 26, yy = y == null ? ch / 2 - hh / 2 : y;
  x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
  prect(x, cw / 2 - w / 2, yy, w, hh, 31, 1.1); x.fill(); x.stroke();
  x.fillStyle = ink; x.fillText(txt, cw / 2, yy + hh / 2 + 1, w - 20); x.restore();
}
const fit = (C, W, H, m = 8) => { const U = Math.min((C.cw - 2 * m) / W, (C.ch - 2 * m) / H); return { U, ox: (C.cw - W * U) / 2, oy: (C.ch - H * U) / 2 }; };
const toWorld = (C, g, e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - g.ox) / g.U, (e.clientY - r.top - g.oy) / g.U]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms, sig) => new Promise((r) => { const t = setTimeout(r, ms); sig?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
// nächster Punkt auf Strecke a-b
function nearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return [ax + dx * t, ay + dy * t];
}
// Kugel gegen Strecken: rausschieben, abprallen lassen. Gibt true zurück, wenn etwas berührt wurde.
function collide(b, r, segs, bounce = 0.3, fric = 0.15) {
  let hit = false;
  for (const s of segs) {
    const [cx, cy] = nearest(b.x, b.y, s[0], s[1], s[2], s[3]);
    let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
    if (d >= r || d === 0) continue;
    nx /= d; ny /= d; b.x = cx + nx * r; b.y = cy + ny * r;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + bounce) * vn * nx; b.vy -= (1 + bounce) * vn * ny;
      const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
      b.vx -= vt * tx * fric * 0.012; b.vy -= vt * ty * fric * 0.012;
    }
    if (s[4]) hit = s[4]; else if (!hit) hit = true;
  }
  return hit;
}
// gedrehtes Rechteck als 4 Strecken
function rectSegs(o) {
  const c = Math.cos(o.a || 0), s = Math.sin(o.a || 0), cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const P = [[-o.w / 2, -o.h / 2], [o.w / 2, -o.h / 2], [o.w / 2, o.h / 2], [-o.w / 2, o.h / 2]].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
  return P.map((p, i) => [p[0], p[1], P[(i + 1) % 4][0], P[(i + 1) % 4][1]]);
}
// Gegenstände auf dem Papier (Buch, Lineal, Radiergummi), gedreht um die Mitte
function drawThing(x, o, ink, dark, seed) {
  x.save(); x.translate(o.x + o.w / 2, o.y + o.h / 2); x.rotate(o.a || 0);
  const W = o.w, H = o.h, X = -W / 2, Y = -H / 2;
  x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(X + 4, Y + 5, W, H);
  x.lineWidth = 2; x.strokeStyle = ink; x.lineJoin = 'round';
  if (o.k === 'ruler') {
    x.fillStyle = '#f4d35e'; prect(x, X, Y, W, H, seed, 0.8); x.fill(); x.stroke();
    x.lineWidth = 1.2; x.beginPath();
    for (let i = 8; i < W - 4; i += 10) { const L = (i / 10) % 5 === 0 ? H * 0.5 : H * 0.28; x.moveTo(X + i, Y); x.lineTo(X + i, Y + L); }
    x.stroke();
  } else if (o.k === 'eraser') {
    x.fillStyle = '#f2a0a8'; x.beginPath(); x.roundRect(X, Y, W, H, 6); x.fill(); x.stroke();
    x.fillStyle = '#5a7fd6'; x.beginPath(); x.roundRect(X + W * 0.5, Y, W * 0.5, H, [0, 6, 6, 0]); x.fill(); x.stroke();
  } else {   // Buch: Seiten-Schnitt + Einband
    const col = o.c || '#2f7cf6';
    x.fillStyle = dark ? '#d9d6c8' : '#fffdf2'; prect(x, X, Y, W, H, seed, 0.7); x.fill(); x.stroke();
    x.fillStyle = col; prect(x, X, Y, W, Math.max(6, H * 0.26), seed + 1, 0.6); x.fill(); x.stroke();
    prect(x, X, Y + H - Math.max(6, H * 0.26), W, Math.max(6, H * 0.26), seed + 2, 0.6); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(120,110,90,.55)'; x.lineWidth = 1; x.beginPath();
    for (let k = 1; k < 4; k++) { const yy = Y + H * 0.26 + (H * 0.48) * k / 4; x.moveTo(X + 6, yy); x.lineTo(X + W - 6, yy); }
    x.stroke();
    x.fillStyle = shade(col.startsWith('#') ? col : '#2f7cf6', 0.45); x.fillRect(X + W * 0.12, Y + 2, W * 0.2, Math.max(2, H * 0.26 - 4));
  }
  x.restore();
}

// ======================================================================
// Tintenbahn: Linien malen, damit die Kugel im Becher landet. Wenig Tinte = viele Punkte.
// ======================================================================
const TW = 1000, TH = 620, TR = 13, INK_MAX = 2200, CUPW = 100, CUPH = 84;
const T_LEVELS = [
  { name: 'Erste Rampe', s: [130, 70], cup: [760, 600], obs: [] },
  { name: 'Bücherberg', s: [110, 70], cup: [880, 600], obs: [{ k: 'book', x: 420, y: 500, w: 200, h: 44, c: '#2f7cf6' }, { k: 'book', x: 440, y: 456, w: 170, h: 44, c: '#e0483e' }, { k: 'book', x: 430, y: 412, w: 180, h: 44, c: '#2fbf71' }] },
  { name: 'Schiefes Lineal', s: [520, 60], cup: [150, 600], obs: [{ k: 'ruler', x: 380, y: 250, w: 340, h: 34, a: 0.32 }] },
  { name: 'Auf dem Regal', s: [110, 80], cup: [860, 410], obs: [{ k: 'book', x: 760, y: 410, w: 220, h: 50, c: '#a46bff' }, { k: 'book', x: 780, y: 460, w: 190, h: 50, c: '#ff9a3c' }, { k: 'book', x: 770, y: 510, w: 210, h: 50, c: '#21b8c9' }, { k: 'book', x: 760, y: 560, w: 230, h: 50, c: '#e0483e' }] },
  { name: 'Hoch hinaus', s: [890, 70], cup: [170, 330], obs: [{ k: 'book', x: 50, y: 330, w: 260, h: 46, c: '#2f7cf6' }, { k: 'eraser', x: 500, y: 420, w: 130, h: 52, a: -0.2 }] },
  { name: 'Slalom', s: [100, 60], cup: [900, 600], obs: [{ k: 'eraser', x: 260, y: 250, w: 120, h: 50, a: 0.15 }, { k: 'ruler', x: 430, y: 380, w: 260, h: 30, a: -0.25 }, { k: 'eraser', x: 680, y: 220, w: 120, h: 50, a: -0.3 }, { k: 'book', x: 620, y: 520, w: 150, h: 100, c: '#2fbf71' }] },
];
export function inkpath(fx, A, B) {
  return (async () => {
    const solo = !B, P = [A, B].filter(Boolean), pts = P.map(() => 0);
    let order = T_LEVELS.map((_, i) => i);
    if (!solo) { const R = rng((Math.random() * 1e9) | 0); order = order.map((i) => [R(), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((a) => a[1]); }
    for (let li = 0; li < order.length; li++) {
      for (let pi = 0; pi < P.length; pi++) {
        if (fx.signal.aborted) return null;
        const L = T_LEVELS[order[li]];
        if (!solo || li > 0) {
          const ok = await turnCard(fx, P[pi], solo ? `Bahn ${li + 1} von ${order.length}` : `${P[pi].name} ist dran`, `„${L.name}“ · bisher ${pts[pi]} Punkte`, 'Los geht’s', 'inkpath');
          if (!ok) return null;
        }
        const r = await inkLevel(fx, P[pi], L, li, order.length, solo ? pts[0] : null, P, pts, pi);
        if (!r) return null;
        pts[pi] += r.pts;
      }
    }
    if (solo) return { score: pts[0] };
    return { w: pts[0] > pts[1] ? 0 : pts[1] > pts[0] ? 1 : null, detail: `${pts[0]} : ${pts[1]} Punkte` };
  })();
}
function inkLevel(fx, p, L, li, nL, soloPts, P, pts, pi) {
  return new Promise((resolve) => {
    fx.stage.replaceChildren();
    const dark = isDark(), ink = inkOf(dark);
    const strokes = []; let cur = null, used = 0, tries = 1, ball = null, mode = 'draw', msg = '', msgT = 0, done = false, raf = 0, last = 0, inCup = 0, still = 0, rollT = 0, trail = [];
    const stats = h('div.hsstats');
    const inkEl = h('b'), triesEl = h('b');
    const meter = h('span.inkmeter', null, h('span.inkfill'));
    const upd = () => {
      inkEl.textContent = `${Math.round(used / INK_MAX * 100)} %`; triesEl.textContent = String(tries);
      meter.firstChild.style.width = `${Math.max(0, 100 - used / INK_MAX * 100)}%`;
      meter.firstChild.style.background = p.color;
    };
    stats.append(h('span.hsstat', null, h('small', { text: 'Bahn' }), h('b', { text: `${li + 1}/${nL}` })),
      h('span.hsstat.inkstat', null, h('small', { text: 'Tinte übrig' }), meter),
      h('span.hsstat', null, h('small', { text: 'Tinte benutzt' }), inkEl),
      h('span.hsstat', null, h('small', { text: 'Versuch' }), triesEl),
      ...P.map((q, i) => h('span.hsstat.rcstat' + (i === pi ? '.on' : ''), { style: { '--pc': q.color } }, h('small', { text: P.length > 1 ? q.name : 'Punkte' }), h('b', { text: `${pts[i]} P` }))));
    const hud = h('div.hshud', null, chip(p), stats);
    const hint = h('p.hshint', { text: 'Mal Linien, über die die Kugel in den Becher rollt. Dann „Los!“. Wenig Tinte gibt mehr Punkte.' });
    const host = h('div.hsarea');
    const undoB = h('button.btn.plbtn', { text: 'Rückgängig', on: { click: () => { if (mode === 'draw' && strokes.length) { const s = strokes.pop(); used -= s.len; upd(); } } } });
    const clearB = h('button.btn.plbtn', { text: 'Alles weg', on: { click: () => { if (mode === 'draw') { strokes.length = 0; used = 0; upd(); } } } });
    const skipB = h('button.btn.plbtn', { text: 'Aufgeben', on: { click: () => finish(0, 'Aufgegeben') } });
    const goB = h('button.btn.primary.plshot', { text: 'Los!', on: { click: () => (mode === 'draw' ? roll() : stop()) } });
    fx.stage.append(h('div.hswrap', null, hud, hint, host, h('div.plbar', null, undoB, clearB, skipB, h('span.plgap'), goB)));
    const C = canvasBox(host), x = C.x; let g = fit(C, TW, TH);
    // feste Strecken: Gegenstände, Becher, Papierränder
    const [cx, cb] = L.cup, ct = cb - CUPH;
    const fixed = [[0, -400, 0, TH + 100], [TW, -400, TW, TH + 100]];
    L.obs.forEach((o) => fixed.push(...rectSegs(o)));
    const cupSegs = [[cx - CUPW / 2 - 4, ct, cx - CUPW / 2, cb], [cx - CUPW / 2, cb, cx + CUPW / 2, cb], [cx + CUPW / 2, cb, cx + CUPW / 2 + 4, ct]];
    fixed.push(...cupSegs);
    upd();
    const roll = () => {
      if (done) return;
      mode = 'roll'; goB.textContent = 'Stopp'; ball = { x: L.s[0], y: L.s[1] + 30, vx: L.s[0] > TW / 2 ? -40 : 40, vy: 0, rot: 0 }; inCup = 0; still = 0; rollT = 0; trail = [];
      hint.textContent = 'Die Kugel rollt … Mit „Stopp“ kannst du weitermalen.';
    };
    const stop = (txt) => {
      if (done) return;
      mode = 'draw'; ball = null; goB.textContent = 'Los!'; tries++; upd();
      if (txt) { msg = txt; msgT = 1.3; }
      hint.textContent = 'Bahn verbessern und nochmal „Los!“. Deine Linien bleiben stehen.';
    };
    function finish(points, txt) {
      if (done) return; done = true; msg = txt; msgT = 5; hint.textContent = txt;
      [undoB, clearB, skipB, goB].forEach((b) => { b.disabled = true; });
      setTimeout(() => { cleanup(); if (!fx.signal.aborted) resolve({ pts: points }); }, 1500);
    }
    // Malen
    C.cv.addEventListener('pointerdown', (e) => {
      if (mode !== 'draw' || done) return; e.preventDefault();
      const q = toWorld(C, g, e); cur = { id: e.pointerId, pts: [q], len: 0 }; strokes.push(cur);
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => {
      if (!cur || cur.id !== e.pointerId) return;
      const q = toWorld(C, g, e), l = cur.pts[cur.pts.length - 1], d = Math.hypot(q[0] - l[0], q[1] - l[1]);
      if (d < 7) return;
      if (used + d > INK_MAX) { msg = 'Tinte leer!'; msgT = 1; return; }
      cur.pts.push(q); cur.len += d; used += d; upd();
    });
    const up = (e) => { if (cur && cur.id === e.pointerId) { if (cur.pts.length < 2) strokes.pop(); cur = null; } };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    function cleanup() { cancelAnimationFrame(raf); C.ro.disconnect(); }
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function step(dt) {
      if (mode !== 'roll' || !ball) return;
      rollT += dt;
      const segs = [];
      strokes.forEach((s) => { for (let i = 1; i < s.pts.length; i++) segs.push([s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]]); });
      const N = 8, h2 = dt / N;
      for (let k = 0; k < N; k++) {
        ball.vy += 900 * h2;
        const sp = Math.hypot(ball.vx, ball.vy); if (sp > 1400) { ball.vx *= 1400 / sp; ball.vy *= 1400 / sp; }
        ball.x += ball.vx * h2; ball.y += ball.vy * h2;
        collide(ball, TR, fixed, 0.28, 0.2); collide(ball, TR + 2.5, segs, 0.25, 0.2);
      }
      ball.rot += ball.vx * dt / TR;
      trail.push([ball.x, ball.y]); if (trail.length > 24) trail.shift();
      const sp = Math.hypot(ball.vx, ball.vy);
      const inside = ball.x > cx - CUPW / 2 && ball.x < cx + CUPW / 2 && ball.y > ct + 6 && ball.y < cb + 2;
      inCup = inside ? inCup + dt : 0;
      if (inCup > 0.35) {
        const p0 = Math.max(100, 1000 - Math.round(used / 3) - 100 * (tries - 1));
        finish(p0, `Drin! +${p0} Punkte`); mode = 'win'; return;
      }
      still = sp < 12 ? still + dt : 0;
      if (ball.y > TH + 60) stop('Daneben! Nochmal');
      else if (still > 1.4) stop('Kugel steckt fest');
      else if (rollT > 14) stop('Zu lange unterwegs');
    }
    function draw() {
      g = fit(C, TW, TH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.save(); x.translate(g.ox, g.oy); x.scale(g.U, g.U);
      x.strokeStyle = dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.2)'; x.lineWidth = 1.5; x.setLineDash([8, 8]); x.strokeRect(0, 0, TW, TH); x.setLineDash([]);
      L.obs.forEach((o, i) => drawThing(x, o, ink, dark, 50 + i));
      // Trichter am Start
      const [sx, sy] = L.s;
      x.fillStyle = dark ? '#3a3f4c' : '#efe7d4'; x.strokeStyle = ink; x.lineWidth = 2.2;
      x.beginPath(); x.moveTo(sx - 40, sy - 40); x.lineTo(sx + 40, sy - 40); x.lineTo(sx + 14, sy + 8); x.lineTo(sx + 14, sy + 22); x.lineTo(sx - 14, sy + 22); x.lineTo(sx - 14, sy + 8); x.closePath(); x.fill(); x.stroke();
      hatch(x, sx - 40, sy - 40, 80, 20, ink, 6, 0.25, 1);
      if (!ball) { x.fillStyle = shade(p.color, -0.1); pcirc(x, sx, sy - 22, TR, 3); x.fill(); x.stroke(); }
      // Becher (Stiftebecher)
      x.fillStyle = dark ? 'rgba(90,127,214,.35)' : 'rgba(90,127,214,.22)';
      x.beginPath(); x.moveTo(cx - CUPW / 2 - 4, ct); x.lineTo(cx - CUPW / 2, cb); x.lineTo(cx + CUPW / 2, cb); x.lineTo(cx + CUPW / 2 + 4, ct); x.closePath(); x.fill();
      hatch(x, cx - CUPW / 2, ct, CUPW, CUPH, '#5a7fd6', 7, 0.45, 1.2);
      x.strokeStyle = ink; x.lineWidth = 3; x.lineCap = 'round';
      cupSegs.forEach((s, i) => pline(x, s[0], s[1], s[2], s[3], 90 + i, 0.8));
      x.lineWidth = 2; x.beginPath(); x.ellipse(cx, ct, CUPW / 2 + 4, 7, 0, 0, Math.PI * 2); x.stroke();
      x.fillStyle = ink; x.font = `700 15px ${FONT}`; x.textAlign = 'center'; x.fillText('Ziel', cx, ct - 16);
      // gemalte Linien
      x.lineCap = 'round'; x.lineJoin = 'round';
      strokes.forEach((s) => {
        x.strokeStyle = shade(p.color, dark ? 0.1 : -0.15); x.lineWidth = 5; x.beginPath();
        s.pts.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.4; x.stroke();
      });
      // Kugel
      if (ball) {
        trail.forEach((t, i) => { x.fillStyle = p.color; x.globalAlpha = i / trail.length * 0.25; x.beginPath(); x.arc(t[0], t[1], TR * i / trail.length, 0, 7); x.fill(); });
        x.globalAlpha = 1;
        x.save(); x.translate(ball.x, ball.y); x.rotate(ball.rot);
        x.fillStyle = p.color; x.strokeStyle = ink; x.lineWidth = 2; pcirc(x, 0, 0, TR, 5); x.fill(); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, TR * 0.55, -0.6, 1.2); x.stroke();
        x.restore();
      }
      x.restore();
      if (msgT > 0) banner(x, C.cw, C.ch, dark, msg, 14);
    }
    function frame(t) {
      const dt = Math.min(0.033, (t - (last || t)) / 1000); last = t;
      if (!done || mode === 'win') step(dt);
      msgT = Math.max(0, msgT - dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Pärchenjagd: Kritzel-Karten aufdecken und Paare finden
// ======================================================================
const DOODLES = ['sun', 'moon', 'star', 'heart', 'house', 'tree', 'fish', 'flower', 'cloud', 'rocket', 'apple', 'umbrella', 'key', 'bulb', 'cat', 'boat'];
const DCOL = { sun: '#f2b400', moon: '#8a7cf0', star: '#e0a106', heart: '#e0483e', house: '#c0603a', tree: '#2fbf71', fish: '#21a3c9', flower: '#e85aa8', cloud: '#5a7fd6', rocket: '#ff7a3c', apple: '#d93a3a', umbrella: '#a46bff', key: '#c99a1a', bulb: '#e6c200', cat: '#8b6a4e', boat: '#2f7cf6' };
function doodle(x, id, s, ink, seed) {
  const c = DCOL[id]; x.lineWidth = Math.max(1.6, s * 0.045); x.strokeStyle = ink; x.lineJoin = 'round'; x.lineCap = 'round';
  const F = () => { x.fillStyle = c; x.fill(); x.stroke(); };
  const r = s * 0.3;
  switch (id) {
    case 'sun': pcirc(x, 0, 0, r * 0.75, seed); F(); x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; x.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); x.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); } x.stroke(); break;
    case 'moon': x.beginPath(); x.arc(0, 0, r, 0.9, Math.PI * 2 - 0.9 + Math.PI * 0); x.arc(r * 0.45, -r * 0.1, r * 0.75, -1.25, 1.45, true); x.closePath(); F(); break;
    case 'star': x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.48 : r * 1.15; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); F(); break;
    case 'heart': x.beginPath(); x.moveTo(0, r * 1.0); x.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.7, -r * 1.3, 0, -r * 0.45); x.bezierCurveTo(r * 0.7, -r * 1.3, r * 1.6, -r * 0.1, 0, r * 1.0); F(); break;
    case 'house': prect(x, -r * 0.8, -r * 0.1, r * 1.6, r * 1.1, seed, 1); F(); x.beginPath(); x.moveTo(-r * 1.05, -r * 0.05); x.lineTo(0, -r * 1.05); x.lineTo(r * 1.05, -r * 0.05); x.closePath(); x.fillStyle = shade(c, -0.3); x.fill(); x.stroke(); x.fillStyle = '#fff6c8'; x.fillRect(-r * 0.2, r * 0.35, r * 0.4, r * 0.65); x.strokeRect(-r * 0.2, r * 0.35, r * 0.4, r * 0.65); break;
    case 'tree': x.fillStyle = '#8b5a2b'; x.fillRect(-r * 0.15, r * 0.2, r * 0.3, r * 0.9); x.strokeRect(-r * 0.15, r * 0.2, r * 0.3, r * 0.9); pcirc(x, 0, -r * 0.25, r * 0.8, seed, 0.18); F(); break;
    case 'fish': x.beginPath(); x.ellipse(-r * 0.15, 0, r * 0.85, r * 0.55, 0, 0, 7); F(); x.beginPath(); x.moveTo(r * 0.6, 0); x.lineTo(r * 1.2, -r * 0.5); x.lineTo(r * 1.2, r * 0.5); x.closePath(); F(); x.fillStyle = ink; x.beginPath(); x.arc(-r * 0.6, -r * 0.1, r * 0.1, 0, 7); x.fill(); break;
    case 'flower': for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; x.beginPath(); x.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.42, r * 0.28, a, 0, 7); F(); } x.beginPath(); x.arc(0, 0, r * 0.32, 0, 7); x.fillStyle = '#f2c230'; x.fill(); x.stroke(); break;
    case 'cloud': x.beginPath(); x.arc(-r * 0.5, r * 0.1, r * 0.5, Math.PI * 0.5, Math.PI * 1.5); x.arc(0, -r * 0.3, r * 0.6, Math.PI, Math.PI * 2); x.arc(r * 0.55, r * 0.1, r * 0.45, Math.PI * 1.5, Math.PI * 0.5); x.closePath(); F(); x.strokeStyle = '#5a7fd6'; x.beginPath(); [-0.4, 0, 0.4].forEach((k) => { x.moveTo(r * k, r * 0.75); x.lineTo(r * k - r * 0.15, r * 1.15); }); x.stroke(); break;
    case 'rocket': x.beginPath(); x.moveTo(0, -r * 1.2); x.quadraticCurveTo(r * 0.6, -r * 0.4, r * 0.4, r * 0.6); x.lineTo(-r * 0.4, r * 0.6); x.quadraticCurveTo(-r * 0.6, -r * 0.4, 0, -r * 1.2); F(); x.fillStyle = '#bfe3ff'; x.beginPath(); x.arc(0, -r * 0.25, r * 0.22, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#f2c230'; x.beginPath(); x.moveTo(-r * 0.25, r * 0.65); x.lineTo(0, r * 1.2); x.lineTo(r * 0.25, r * 0.65); x.closePath(); x.fill(); x.stroke(); break;
    case 'apple': pcirc(x, 0, r * 0.1, r * 0.85, seed, 0.1); F(); x.beginPath(); x.moveTo(0, -r * 0.6); x.lineTo(r * 0.1, -r * 1.1); x.stroke(); x.beginPath(); x.ellipse(r * 0.4, -r * 0.95, r * 0.3, r * 0.14, -0.4, 0, 7); x.fillStyle = '#2fbf71'; x.fill(); x.stroke(); break;
    case 'umbrella': x.beginPath(); x.arc(0, 0, r * 1.05, Math.PI, 0); x.closePath(); F(); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, r * 1.0); x.arc(-r * 0.2, r * 1.0, r * 0.2, 0, Math.PI); x.stroke(); break;
    case 'key': x.beginPath(); x.arc(-r * 0.55, 0, r * 0.42, 0, 7); F(); x.fillStyle = shade(c, 0.6); x.beginPath(); x.arc(-r * 0.55, 0, r * 0.15, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-r * 0.13, 0); x.lineTo(r * 1.1, 0); x.moveTo(r * 0.7, 0); x.lineTo(r * 0.7, r * 0.35); x.moveTo(r * 1.0, 0); x.lineTo(r * 1.0, r * 0.3); x.lineWidth *= 1.4; x.stroke(); break;
    case 'bulb': x.beginPath(); x.arc(0, -r * 0.25, r * 0.75, Math.PI * 0.8, Math.PI * 2.2); x.lineTo(r * 0.3, r * 0.65); x.lineTo(-r * 0.3, r * 0.65); x.closePath(); F(); x.fillStyle = '#9aa0aa'; x.fillRect(-r * 0.3, r * 0.65, r * 0.6, r * 0.4); x.strokeRect(-r * 0.3, r * 0.65, r * 0.6, r * 0.4); x.beginPath(); x.moveTo(-r * 0.2, r * 0.3); x.lineTo(0, -r * 0.1); x.lineTo(r * 0.2, r * 0.3); x.stroke(); break;
    case 'cat': x.beginPath(); x.moveTo(-r * 0.85, -r * 0.2); x.lineTo(-r * 0.75, -r * 1.0); x.lineTo(-r * 0.3, -r * 0.65); x.lineTo(r * 0.3, -r * 0.65); x.lineTo(r * 0.75, -r * 1.0); x.lineTo(r * 0.85, -r * 0.2); x.quadraticCurveTo(r * 0.9, r * 0.8, 0, r * 0.8); x.quadraticCurveTo(-r * 0.9, r * 0.8, -r * 0.85, -r * 0.2); F(); x.fillStyle = ink; x.beginPath(); x.arc(-r * 0.35, -r * 0.05, r * 0.1, 0, 7); x.arc(r * 0.35, -r * 0.05, r * 0.1, 0, 7); x.fill(); x.beginPath(); x.moveTo(-r * 0.9, r * 0.25); x.lineTo(-r * 0.35, r * 0.3); x.moveTo(r * 0.9, r * 0.25); x.lineTo(r * 0.35, r * 0.3); x.stroke(); break;
    case 'boat': x.beginPath(); x.moveTo(-r * 1.1, r * 0.3); x.lineTo(r * 1.1, r * 0.3); x.lineTo(r * 0.7, r * 0.85); x.lineTo(-r * 0.7, r * 0.85); x.closePath(); F(); x.beginPath(); x.moveTo(0, r * 0.3); x.lineTo(0, -r * 1.1); x.stroke(); x.beginPath(); x.moveTo(r * 0.08, -r * 1.0); x.lineTo(r * 0.85, r * 0.15); x.lineTo(r * 0.08, r * 0.15); x.closePath(); x.fillStyle = '#fffdf2'; x.fill(); x.stroke(); break;
    default: break;
  }
}
export function pairs(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0), solo = !B, P = [A, B].filter(Boolean), cpu = !!o.cpu;
    const NP = 12;
    const ids = DOODLES.map((d) => [R(), d]).sort((a, b) => a[0] - b[0]).slice(0, NP).map((a) => a[1]);
    const cards = [...ids, ...ids].map((d) => [R(), d]).sort((a, b) => a[0] - b[0]).map(([, d], i) => ({ d, i, up: 0, want: 0, owner: -1, shake: 0, pop: 0 }));
    const score = P.map(() => 0); let turn = 0, open = [], busy = false, moves = 0, t0 = 0, over = false, raf = 0, last = 0, msg = '', msgT = 0;
    if (fx.debug) fx.debug.cards = cards;
    const mem = new Map();   // Computer: Index -> Bild (merkt nicht alles)
    const stats = h('div.hsstats');
    const timeEl = h('b', { text: '0:00' });
    const upd = () => stats.replaceChildren(...(solo
      ? [h('span.hsstat', null, h('small', { text: 'Züge' }), h('b', { text: String(moves) })), h('span.hsstat', null, h('small', { text: 'Paare' }), h('b', { text: `${score[0]}/${NP}` })), h('span.hsstat', null, h('small', { text: 'Zeit' }), timeEl), h('span.hsstat', null, h('small', { text: 'Rekord' }), h('b', { text: store.get('gPairBest', 0) ? `${store.get('gPairBest', 0)} Züge` : '–' }))]
      : P.map((p, i) => h('span.hsstat.rcstat' + (i === turn ? '.on' : ''), { style: { '--pc': p.color } }, h('small', { text: p.name + (i === turn ? ' · dran' : '') }), h('b', { text: `${score[i]} ${score[i] === 1 ? 'Paar' : 'Paare'}` })))));
    const host = h('div.hsarea');
    fx.stage.append(h('div.hswrap', null, h('div.hshud', null, stats), h('p.hshint', { text: solo ? 'Zwei Karten aufdecken. Gleiche Bilder bleiben liegen. Schaffst du es mit wenig Zügen?' : 'Zwei Karten aufdecken. Ein Paar gefunden? Dann bist du nochmal dran.' }), host));
    const C = canvasBox(host), x = C.x;
    let lay = null;
    const layout = () => {
      const land = C.cw >= C.ch, cols = land ? 6 : 4, rows = NP * 2 / cols, gap = 10;
      const cw = Math.min((C.cw - gap * (cols + 1)) / cols, ((C.ch - gap * (rows + 1)) / rows) * 0.78), ch = cw / 0.78;
      const W = cols * cw + (cols + 1) * gap, H = rows * ch + (rows + 1) * gap;
      lay = { cols, rows, cw, ch, gap, ox: (C.cw - W) / 2, oy: (C.ch - H) / 2 };
    };
    const rectOf = (i) => { const c = i % lay.cols, r = (i / lay.cols) | 0; return [lay.ox + lay.gap + c * (lay.cw + lay.gap), lay.oy + lay.gap + r * (lay.ch + lay.gap)]; };
    upd();
    const remember = (i) => { if (!cpu || R() < 0.72) mem.set(i, cards[i].d); };
    function flip(i) {
      const c = cards[i]; if (busy || over || c.want || c.owner >= 0) return;
      if (!t0) t0 = performance.now();
      c.want = 1; open.push(i); remember(i);
      if (open.length < 2) return;
      moves++; busy = true; upd();
      const [a, b] = open; open = [];
      if (cards[a].d === cards[b].d) {
        setTimeout(() => {
          if (fx.signal.aborted) return;
          cards[a].owner = cards[b].owner = turn; cards[a].pop = cards[b].pop = 1; mem.delete(a); mem.delete(b);
          score[turn]++; busy = false; upd();
          if (cards.every((k) => k.owner >= 0)) end(); else if (!solo) { msg = `Paar! ${P[turn].name} nochmal`; msgT = 1; cpuGo(); }
        }, 450);
      } else {
        setTimeout(() => { if (fx.signal.aborted) return; cards[a].shake = cards[b].shake = 0.4; }, 650);
        setTimeout(() => {
          if (fx.signal.aborted) return;
          cards[a].want = cards[b].want = 0; busy = false;
          if (!solo) { turn = 1 - turn; msg = `${P[turn].name} ist dran`; msgT = 0.9; upd(); cpuGo(); }
        }, 1150);
      }
    }
    // Computer
    function cpuGo() {
      if (!cpu || turn !== 1 || over) return;
      setTimeout(async () => {
        if (fx.signal.aborted || over || turn !== 1) return;
        const free = cards.filter((c) => c.owner < 0 && !c.want).map((c) => c.i);
        const known = free.filter((i) => mem.has(i));
        let a = -1, b = -1;
        for (const i of known) { const j = known.find((k) => k !== i && mem.get(k) === mem.get(i)); if (j != null) { a = i; b = j; break; } }
        const unknown = free.filter((i) => !mem.has(i));
        if (a < 0) a = (unknown.length ? unknown : free)[(R() * (unknown.length || free.length)) | 0];
        flip(a); await sleep(750, fx.signal); if (fx.signal.aborted || over) return;
        if (b < 0) {
          const m = [...mem.entries()].find(([k, d]) => k !== a && d === cards[a].d && cards[k].owner < 0);
          if (m) b = m[0];
          else { const rest = free.filter((i) => i !== a && !mem.has(i)); const pool = rest.length ? rest : free.filter((i) => i !== a); b = pool[(R() * pool.length) | 0]; }
        }
        flip(b);
      }, 750);
    }
    function end() {
      over = true; const secs = Math.round((performance.now() - t0) / 1000);
      msg = solo ? `Geschafft in ${moves} Zügen!` : score[0] === score[1] ? 'Unentschieden!' : `${P[score[0] > score[1] ? 0 : 1].name} gewinnt!`; msgT = 9;
      setTimeout(() => { cleanup(); if (fx.signal.aborted) return; resolve(solo ? { score: moves, detail: `${secs} s` } : { w: score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null, detail: `${score[0]} : ${score[1]} Paare` }); }, 1500);
    }
    C.cv.addEventListener('pointerdown', (e) => {
      if (!lay || (cpu && turn === 1)) return; e.preventDefault();
      const r = C.cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      for (const c of cards) { const [X, Y] = rectOf(c.i); if (px >= X && px <= X + lay.cw && py >= Y && py <= Y + lay.ch) { flip(c.i); break; } }
    });
    function cleanup() { cancelAnimationFrame(raf); C.ro.disconnect(); }
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function drawCard(c) {
      const [X, Y] = rectOf(c.i), W = lay.cw, H = lay.ch, sx = Math.abs(Math.cos(c.up * Math.PI)), front = c.up > 0.5;
      const dx = c.shake > 0 ? Math.sin(c.shake * 60) * 4 : 0, sc = 1 + Math.sin(c.pop * Math.PI) * 0.06;
      x.save(); x.translate(X + W / 2 + dx, Y + H / 2); x.scale(Math.max(0.02, sx) * sc, sc);
      x.fillStyle = 'rgba(0,0,0,.14)'; x.beginPath(); x.roundRect(-W / 2 + 3, -H / 2 + 4, W, H, 10); x.fill();
      x.strokeStyle = ink; x.lineWidth = 2;
      if (!front) {
        x.fillStyle = dark ? '#3a4152' : '#e9dcc0'; x.beginPath(); x.roundRect(-W / 2, -H / 2, W, H, 10); x.fill(); x.stroke();
        x.save(); x.beginPath(); x.roundRect(-W / 2 + 6, -H / 2 + 6, W - 12, H - 12, 7); x.clip();
        hatch(x, -W / 2, -H / 2, W, H, dark ? '#8fa3d6' : '#b08a4a', 9, 0.5, 1.2); x.restore();
        x.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(80,60,20,.45)'; x.lineWidth = 1.5; x.beginPath(); x.roundRect(-W / 2 + 6, -H / 2 + 6, W - 12, H - 12, 7); x.stroke();
        x.fillStyle = dark ? '#e8ecf4' : '#5c4520'; x.font = `800 ${Math.round(W * 0.3)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 2);
      } else {
        const own = c.owner >= 0 ? P[c.owner].color : null;
        x.fillStyle = dark ? '#262b36' : '#fffdf6'; x.beginPath(); x.roundRect(-W / 2, -H / 2, W, H, 10); x.fill();
        if (own) { x.fillStyle = own; x.globalAlpha = 0.16; x.fill(); x.globalAlpha = 1; x.strokeStyle = own; x.lineWidth = 3.5; }
        x.stroke();
        x.save(); x.translate(0, 0); doodle(x, c.d, Math.min(W, H * 0.9), ink, c.d.length * 7); x.restore();
      }
      x.restore();
    }
    function frame(t) {
      const dt = Math.min(0.033, (t - (last || t)) / 1000); last = t;
      layout(); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, C.cw, C.ch, dark);
      cards.forEach((c) => { c.up += (c.want || c.owner >= 0 ? 1 : -1) * dt * 4.5; c.up = clamp(c.up, 0, 1); c.shake = Math.max(0, c.shake - dt); c.pop = Math.max(0, c.pop - dt * 2.5); drawCard(c); });
      if (solo && t0 && !over) { const s = Math.round((performance.now() - t0) / 1000); timeEl.textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
      msgT = Math.max(0, msgT - dt); if (msgT > 0) banner(x, C.cw, C.ch, dark, msg);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Korbwurf: Papierkugel in den Papierkorb werfen, mit Wind, wanderndem Korb und Bücherstapel
// ======================================================================
const KW = 1000, KH = 600, FLOOR = 560, KR = 15, BIN_T = 430, BIN_TW = 124, BIN_BW = 92;
export function binToss(fx, A, B) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0), solo = !B, P = [A, B].filter(Boolean);
    const N = solo ? 10 : 6;
    // gleiche Bedingungen für beide Spieler pro Runde
    const conds = Array.from({ length: N }, (_, i) => ({
      bx: 560 + R() * 330, wind: i < 1 ? 0 : Math.round((R() * 2 - 1) * (2 + i * 0.6)) / 2,
      move: i >= (solo ? 4 : 2) ? 50 + R() * 60 : 0, ph: R() * 6, stack: i >= (solo ? 6 : 3) ? 90 + R() * 120 : 0,
    }));
    const score = P.map(() => 0), thrown = P.map(() => 0), streak = P.map(() => 0);
    let turn = 0, ball = null, aim = null, busy = false, over = false, raf = 0, last = 0, msg = '', msgT = 0, T = 0, rimHit = false, flyT = 0, bins = [];
    const stats = h('div.hsstats'), host = h('div.hsarea');
    const upd = () => stats.replaceChildren(...P.map((p, i) => h('span.hsstat.rcstat' + (i === turn ? '.on' : ''), { style: { '--pc': p.color } }, h('small', { text: p.name }), h('b', { text: `${score[i]} P · ${thrown[i]}/${N}` }))),
      ...(solo ? [h('span.hsstat', null, h('small', { text: 'Rekord' }), h('b', { text: String(store.get('gBinBest', 0) || '–') }))] : []));
    fx.stage.append(h('div.hswrap', null, h('div.hshud', null, stats), h('p.hshint', { text: 'Auf das Papier tippen, nach hinten ziehen und loslassen. Sauber rein = 3 Punkte, über den Rand = 2.' }), host));
    const C = canvasBox(host), x = C.x; let g = fit(C, KW, KH);
    const cond = () => conds[thrown[turn]] || conds[N - 1];
    const binX = () => { const c = cond(); return clamp(c.bx + (c.move ? Math.sin(T * 1.1 + c.ph) * c.move : 0), 470, 930); };
    const START = [150, 404];
    if (fx.debug) fx.debug.binX = () => binX();
    const segsNow = () => {
      const bx = binX(), c = cond();
      const s = [
        [bx - BIN_TW / 2, BIN_T, bx - BIN_BW / 2, FLOOR, 'rim'], [bx - BIN_BW / 2, FLOOR, bx + BIN_BW / 2, FLOOR], [bx + BIN_BW / 2, FLOOR, bx + BIN_TW / 2, BIN_T, 'rim'],
        [-50, FLOOR, KW + 50, FLOOR], [0, -800, 0, FLOOR], [KW, -800, KW, FLOOR],
        [70, 420, 230, 420], [230, 420, 230, FLOOR], // Pult
      ];
      if (c.stack) { const sx = 360 + (c.bx - 560) * 0.25; s.push(...rectSegs({ x: sx, y: FLOOR - c.stack, w: 70, h: c.stack })); }
      return s;
    };
    const newTurn = () => { msg = solo ? `Wurf ${thrown[0] + 1} von ${N}` : `${P[turn].name}: Wurf ${thrown[turn] + 1}`; msgT = 1.1; upd(); };
    newTurn();
    C.cv.addEventListener('pointerdown', (e) => { if (ball || busy || over) return; e.preventDefault(); const q = toWorld(C, g, e); aim = { id: e.pointerId, from: q, to: q }; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aim && aim.id === e.pointerId) aim.to = toWorld(C, g, e); });
    const vel = () => { const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy), v = Math.min(1, L / 280) * 1250; return L < 1 ? [0, 0, 0] : [dx / L * v, dy / L * v, L]; };
    C.cv.addEventListener('pointerup', (e) => {
      if (!aim || aim.id !== e.pointerId) return; const [vx, vy, L] = vel(); aim = null;
      if (L < 18) return;
      ball = { x: START[0], y: START[1], vx, vy, rot: 0 }; rimHit = false; flyT = 0; fx.stage.querySelector('.hshint')?.remove();
    });
    C.cv.addEventListener('pointercancel', () => { aim = null; });
    function cleanup() { cancelAnimationFrame(raf); C.ro.disconnect(); }
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function land(inBin) {
      const w = turn; let pts = 0;
      if (inBin) { pts = rimHit ? 2 : 3; streak[w]++; if (streak[w] >= 3) pts += 1; msg = (rimHit ? 'Über den Rand: ' : 'Sauber! ') + `+${pts}` + (streak[w] >= 3 ? ' (Serie)' : ''); bins.push({ x: binX() - BIN_BW / 2 + 16 + R() * (BIN_BW - 32), c: P[w].color, r: R() * 6 }); }
      else { streak[w] = 0; msg = 'Daneben!'; }
      score[w] += pts; thrown[w]++; msgT = 1.3; ball = null; busy = true; upd();
      setTimeout(() => {
        if (fx.signal.aborted) return; busy = false; bins = [];
        if (thrown.every((s) => s >= N)) {
          over = true; msg = solo ? `${score[0]} Punkte` : score[0] === score[1] ? 'Unentschieden' : `${P[score[0] > score[1] ? 0 : 1].name} gewinnt!`; msgT = 9; upd();
          setTimeout(() => { cleanup(); if (!fx.signal.aborted) resolve(solo ? { score: score[0] } : { w: score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null, detail: `${score[0]} : ${score[1]} Punkte` }); }, 1500);
          return;
        }
        if (!solo) turn = 1 - turn; newTurn();
      }, 1200);
    }
    function step(dt) {
      if (!ball) return;
      flyT += dt; const segs = segsNow(), wind = cond().wind, n = 6, h2 = dt / n;
      for (let k = 0; k < n; k++) {
        ball.vy += 1150 * h2; ball.vx += wind * 70 * h2;
        ball.x += ball.vx * h2; ball.y += ball.vy * h2;
        const hit = collide(ball, KR, segs, 0.42, 0.4);
        if (hit === 'rim') rimHit = true;
      }
      ball.rot += ball.vx * dt / KR * 0.6;
      const bx = binX(), inside = ball.y > BIN_T + 10 && Math.abs(ball.x - bx) < BIN_BW / 2 + (FLOOR - ball.y) / (FLOOR - BIN_T) * (BIN_TW - BIN_BW) / 2;
      if (inside && ball.y > FLOOR - KR - 6) return land(true);
      const sp = Math.hypot(ball.vx, ball.vy);
      if ((ball.y > FLOOR - KR - 2 && sp < 40) || flyT > 6 || ball.x < -60 || ball.x > KW + 60) land(false);
    }
    function drawBall(px, py, rot, col, r = KR) {
      x.save(); x.translate(px, py); x.rotate(rot);
      x.fillStyle = dark ? '#d9d6c8' : '#fffdf2'; x.strokeStyle = ink; x.lineWidth = 2;
      x.beginPath(); for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, rr = r * (0.82 + ((k * 37) % 7) / 25); k ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke();
      x.strokeStyle = col; x.lineWidth = 1.4; x.beginPath(); x.moveTo(-r * 0.5, -r * 0.2); x.lineTo(r * 0.1, r * 0.1); x.lineTo(-r * 0.1, r * 0.5); x.moveTo(r * 0.2, -r * 0.55); x.lineTo(r * 0.45, 0); x.stroke();
      x.restore();
    }
    function draw() {
      g = fit(C, KW, KH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.save(); x.translate(g.ox, g.oy); x.scale(g.U, g.U);
      const c = cond(), bx = binX(), p = P[turn];
      // Boden
      x.strokeStyle = ink; x.lineWidth = 2.5; pline(x, 0, FLOOR, KW, FLOOR, 4, 1); hatch(x, 0, FLOOR, KW, KH - FLOOR, ink, 9, 0.18, 1);
      // Pult
      x.fillStyle = dark ? '#5a4632' : '#c9a273'; prect(x, 70, 420, 160, 14, 8, 0.8); x.fill(); x.stroke();
      x.fillStyle = dark ? '#4a3a2a' : '#b38a5c'; x.fillRect(80, 434, 14, FLOOR - 434); x.fillRect(206, 434, 14, FLOOR - 434); x.strokeRect(80, 434, 14, FLOOR - 434); x.strokeRect(206, 434, 14, FLOOR - 434);
      // Bücherstapel
      if (c.stack) { const sx = 360 + (c.bx - 560) * 0.25, n = Math.max(2, Math.round(c.stack / 40)), hh = c.stack / n; for (let k = 0; k < n; k++) drawThing(x, { k: 'book', x: sx + (k % 2 ? 4 : -2), y: FLOOR - (k + 1) * hh, w: 70 - (k % 2 ? 8 : 0), h: hh, c: ['#2f7cf6', '#e0483e', '#2fbf71', '#a46bff', '#ff9a3c'][k % 5] }, ink, dark, 70 + k); }
      // Papierkorb (Gitter)
      x.fillStyle = dark ? 'rgba(160,170,190,.2)' : 'rgba(90,100,120,.12)';
      x.beginPath(); x.moveTo(bx - BIN_TW / 2, BIN_T); x.lineTo(bx - BIN_BW / 2, FLOOR); x.lineTo(bx + BIN_BW / 2, FLOOR); x.lineTo(bx + BIN_TW / 2, BIN_T); x.closePath(); x.fill();
      bins.forEach((b) => drawBall(b.x, FLOOR - KR, b.r, b.c));
      x.strokeStyle = dark ? 'rgba(200,210,230,.45)' : 'rgba(60,70,90,.4)'; x.lineWidth = 1.2; x.beginPath();
      for (let k = 1; k < 8; k++) { const t = k / 8; x.moveTo(bx - BIN_TW / 2 + BIN_TW * t, BIN_T); x.lineTo(bx - BIN_BW / 2 + BIN_BW * t, FLOOR); }
      for (let k = 1; k < 4; k++) { const yy = BIN_T + (FLOOR - BIN_T) * k / 4, w2 = BIN_TW / 2 - (BIN_TW - BIN_BW) / 2 * k / 4; x.moveTo(bx - w2, yy); x.lineTo(bx + w2, yy); }
      x.stroke();
      x.strokeStyle = ink; x.lineWidth = 3; pline(x, bx - BIN_TW / 2, BIN_T, bx - BIN_BW / 2, FLOOR, 11, 0.6); pline(x, bx + BIN_TW / 2, BIN_T, bx + BIN_BW / 2, FLOOR, 12, 0.6);
      x.lineWidth = 4; x.beginPath(); x.ellipse(bx, BIN_T, BIN_TW / 2, 6, 0, 0, Math.PI * 2); x.stroke();
      // Wind-Anzeige
      x.save(); x.translate(KW / 2, 46); x.fillStyle = dark ? 'rgba(27,31,40,.9)' : 'rgba(251,250,245,.95)'; prect(x, -92, -24, 184, 48, 77, 1); x.fill(); x.lineWidth = 2; x.strokeStyle = ink; x.stroke();
      x.fillStyle = ink; x.font = `700 18px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      if (!c.wind) x.fillText('Kein Wind', 0, 1);
      else { const d = Math.sign(c.wind), n = Math.min(4, Math.ceil(Math.abs(c.wind))); x.fillText(`Wind ${String(Math.abs(c.wind)).replace('.', ',')}`, -22, 1); x.strokeStyle = '#21a3c9'; x.lineWidth = 2.5; x.beginPath(); for (let k = 0; k < n; k++) { const ox = 42 + k * 10 * d - (d < 0 ? -30 : 0); x.moveTo(ox - 6 * d, -7); x.lineTo(ox, 0); x.lineTo(ox - 6 * d, 7); } x.stroke(); }
      x.restore();
      // Zielen
      if (aim) {
        const [vx, vy] = vel(); let px = START[0], py = START[1], qx = vx, qy = vy;
        x.fillStyle = p.color; for (let k = 0; k < 7; k++) { for (let s = 0; s < 4; s++) { qy += 1150 * 0.012; px += qx * 0.012; py += qy * 0.012; } x.globalAlpha = 1 - k / 8; x.beginPath(); x.arc(px, py, 4.5 - k * 0.4, 0, 7); x.fill(); }
        x.globalAlpha = 1; x.strokeStyle = p.color; x.lineWidth = 2; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(aim.from[0], aim.from[1]); x.lineTo(aim.to[0], aim.to[1]); x.stroke(); x.setLineDash([]);
      }
      // Kugel
      if (ball) drawBall(ball.x, ball.y, ball.rot, p.color);
      else if (!over) drawBall(START[0], START[1], 0.3, p.color);
      x.restore();
      if (msgT > 0) banner(x, C.cw, C.ch, dark, msg, 12 + 70 * g.U);
    }
    function frame(t) {
      const dt = Math.min(0.033, (t - (last || t)) / 1000); last = t;
      if (!ball && !busy) T += dt;   // Korb wandert nur vor dem Wurf weiter … und während des Flugs
      if (ball) T += dt;
      step(dt); msgT = Math.max(0, msgT - dt); draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Stiftezupfen: nur Stifte nehmen, auf denen kein anderer liegt
// ======================================================================
const SW = 1000, SH = 640;
const PEN_KIND = [{ c: '#f4c430', v: 1, n: 'gelb' }, { c: '#2f7cf6', v: 2, n: 'blau' }, { c: '#e0483e', v: 3, n: 'rot' }, { c: '#2fbf71', v: 5, n: 'grün' }];
function segDist(a, b) {   // kleinster Abstand zweier Strecken (vereinfachte Prüfung über Endpunkte + Schnitt)
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(a[0], a[1], b[0]), d2 = cross(a[0], a[1], b[1]), d3 = cross(b[0], b[1], a[0]), d4 = cross(b[0], b[1], a[1]);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  const pd = (p, s) => { const q = nearest(p[0], p[1], s[0][0], s[0][1], s[1][0], s[1][1]); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
  return Math.min(pd(a[0], b), pd(a[1], b), pd(b[0], a), pd(b[1], a));
}
function drawPen(x, s, ink, lift = 0) {
  const L = s.len, W = 15, dx = Math.cos(s.a), dy = Math.sin(s.a);
  x.save(); x.translate(s.x + s.ox, s.y + s.oy - lift); x.rotate(s.a + s.wob);
  x.fillStyle = 'rgba(0,0,0,.16)'; x.beginPath(); x.roundRect(-L / 2 + 3, -W / 2 + 4 + lift * 0.6, L, W, 4); x.fill();
  const col = PEN_KIND[s.k].c, tip = 30, er = 20;
  x.lineWidth = 1.6; x.strokeStyle = ink; x.lineJoin = 'round';
  // Schaft
  x.fillStyle = col; x.fillRect(-L / 2 + tip, -W / 2, L - tip - er, W);
  x.fillStyle = shade(col, 0.35); x.fillRect(-L / 2 + tip, -W / 2, L - tip - er, W * 0.32);
  x.fillStyle = shade(col, -0.18); x.fillRect(-L / 2 + tip, W / 2 - W * 0.3, L - tip - er, W * 0.3);
  x.strokeRect(-L / 2 + tip, -W / 2, L - tip - er, W);
  // Holzspitze + Mine
  x.fillStyle = '#efd2a4'; x.beginPath(); x.moveTo(-L / 2 + tip, -W / 2); x.lineTo(-L / 2, 0); x.lineTo(-L / 2 + tip, W / 2); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = shade(col, -0.35); x.beginPath(); x.moveTo(-L / 2 + 10, -W / 6); x.lineTo(-L / 2, 0); x.lineTo(-L / 2 + 10, W / 6); x.closePath(); x.fill();
  // Ring + Radierer
  x.fillStyle = '#c9ccd3'; x.fillRect(L / 2 - er, -W / 2, 8, W); x.strokeRect(L / 2 - er, -W / 2, 8, W);
  x.fillStyle = '#f2a0a8'; x.beginPath(); x.roundRect(L / 2 - 12, -W / 2, 12, W, [0, 4, 4, 0]); x.fill(); x.stroke();
  if (s.k === 3) { x.fillStyle = '#fff'; x.font = `800 11px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('★ 5', 0, 1); }
  x.restore();
  return [dx, dy];
}
export function pickup(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0), solo = !B, P = [A, B].filter(Boolean), cpu = !!o.cpu;
    const N = solo ? 26 : 23;
    const pens = [];
    for (let i = 0; i < N; i++) {
      const r = R(), k = i === 0 || i === Math.floor(N / 2) ? 3 : r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
      const ang = R() * Math.PI, rr = Math.sqrt(R()), th = R() * Math.PI * 2;
      pens.push({ i, k, x: SW / 2 + Math.cos(th) * rr * 250, y: SH / 2 + Math.sin(th) * rr * 160, a: ang, len: 230 + R() * 90, alive: true, wob: 0, wobT: 0, ox: 0, oy: 0, fly: 0, to: null });
    }
    const ends = (s) => [[s.x - Math.cos(s.a) * s.len / 2, s.y - Math.sin(s.a) * s.len / 2], [s.x + Math.cos(s.a) * s.len / 2, s.y + Math.sin(s.a) * s.len / 2]];
    if (fx.debug) Object.assign(fx.debug, { pens });
    const coverers = (s) => pens.filter((q) => q.alive && q.i > s.i && segDist(ends(s), ends(q)) < 14);
    const score = P.map(() => 0), miss = P.map(() => 0), MAXMISS = 3;
    let turn = 0, busy = false, over = false, raf = 0, last = 0, msg = '', msgT = 0, finger = null, hover = -1;
    const stats = h('div.hsstats'), host = h('div.hsarea');
    const upd = () => stats.replaceChildren(...P.map((p, i) => h('span.hsstat.rcstat' + (i === turn ? '.on' : ''), { style: { '--pc': p.color } }, h('small', { text: p.name + (!solo && i === turn ? ' · dran' : '') }), h('b', { text: `${score[i]} P` + (solo ? ` · ${'✗'.repeat(miss[0])}${'○'.repeat(MAXMISS - miss[0])}` : '') }))),
      h('span.hsstat', null, h('small', { text: 'Übrig' }), h('b', { text: String(pens.filter((s) => s.alive).length) })),
      ...(solo ? [h('span.hsstat', null, h('small', { text: 'Rekord' }), h('b', { text: String(store.get('gPickBest', 0) || '–') }))] : []),
      h('span.hsstat.pklegend', null, h('small', { text: 'Punkte' }), h('b', null, ...PEN_KIND.map((k) => h('span.pkdot', { style: { background: k.c }, text: String(k.v) })))));
    fx.stage.append(h('div.hswrap', null, h('div.hshud', null, stats), h('p.hshint', { text: solo ? 'Tippe einen Stift an, auf dem kein anderer liegt. Liegt doch einer drauf, wackelt es. Nach 3 Wacklern ist Schluss.' : 'Tippe einen Stift an, auf dem kein anderer liegt. Klappt es, bist du nochmal dran. Wackelt es, ist der andere dran.' }), host));
    const C = canvasBox(host), x = C.x; let g = fit(C, SW, SH);
    upd();
    const tray = (w) => [w === 0 ? 60 : SW - 60, SH + 120];
    function take(s, w) {
      const cov = coverers(s);
      if (!cov.length) {
        s.alive = false; s.fly = 0.001; s.to = tray(w); s.from = [s.x, s.y]; score[w] += PEN_KIND[s.k].v; msg = `+${PEN_KIND[s.k].v}`; msgT = 0.7; upd();
        if (!pens.some((q) => q.alive)) { end(); return true; }
        return true;
      }
      [s, ...cov].forEach((q) => { q.wobT = 0.7; }); miss[w]++; msg = 'Es wackelt!'; msgT = 1.2; upd();
      if (solo && miss[0] >= MAXMISS) { setTimeout(() => end(), 800); busy = true; return false; }
      if (!solo) { busy = true; setTimeout(() => { if (fx.signal.aborted || over) return; busy = false; turn = 1 - turn; msg = `${P[turn].name} ist dran`; msgT = 1; upd(); cpuGo(); }, 1100); }
      return false;
    }
    function end() {
      if (over) return; over = true; busy = true;
      const clear = !pens.some((q) => q.alive);
      if (solo && clear) score[0] += 10;
      msg = solo ? (clear ? `Alles weg! ${score[0]} Punkte` : `${score[0]} Punkte`) : score[0] === score[1] ? 'Unentschieden' : `${P[score[0] > score[1] ? 0 : 1].name} gewinnt!`; msgT = 9; upd();
      setTimeout(() => { cleanup(); if (!fx.signal.aborted) resolve(solo ? { score: score[0] } : { w: score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null, detail: `${score[0]} : ${score[1]} Punkte` }); }, 1600);
    }
    const hitAt = (q) => { let best = null; for (const s of pens) { if (!s.alive) continue; const e = ends(s), n = nearest(q[0], q[1], e[0][0], e[0][1], e[1][0], e[1][1]); if (Math.hypot(q[0] - n[0], q[1] - n[1]) < 13 && (!best || s.i > best.i)) best = s; } return best; };
    C.cv.addEventListener('pointerdown', (e) => {
      if (busy || over || (cpu && turn === 1)) return; e.preventDefault();
      const s = hitAt(toWorld(C, g, e)); if (s) { take(s, turn); if (!over && !busy) cpuGo(); }
    });
    C.cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { const s = hitAt(toWorld(C, g, e)); hover = s ? s.i : -1; } });
    function cpuGo() {
      if (!cpu || turn !== 1 || over) return;
      busy = true;
      setTimeout(async () => {
        if (fx.signal.aborted || over) return;
        const alive = pens.filter((s) => s.alive), free = alive.filter((s) => !coverers(s).length);
        let pick;
        const near = alive.filter((s) => coverers(s).length === 1);
        if (near.length && R() < 0.14) pick = near[(R() * near.length) | 0];
        else { free.sort((a, b) => PEN_KIND[b.k].v - PEN_KIND[a.k].v); pick = R() < 0.6 ? free[0] : free[(R() * free.length) | 0]; }
        finger = { x: pick.x, y: pick.y, t: 0 };
        await sleep(650, fx.signal); if (fx.signal.aborted || over) return;
        finger = null; busy = false;
        const ok = take(pick, 1);
        if (ok && !over) cpuGo();
      }, 700);
    }
    function cleanup() { cancelAnimationFrame(raf); C.ro.disconnect(); }
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function draw(dt) {
      g = fit(C, SW, SH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.save(); x.translate(g.ox, g.oy); x.scale(g.U, g.U);
      // Tischdecke (Kreis aus Kritzel)
      x.strokeStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.16)'; x.lineWidth = 2; x.setLineDash([10, 8]);
      x.beginPath(); x.ellipse(SW / 2, SH / 2, 380, 270, 0, 0, 7); x.stroke(); x.setLineDash([]);
      for (const s of pens) {
        if (s.wobT > 0) { s.wobT = Math.max(0, s.wobT - dt); s.wob = Math.sin(s.wobT * 45) * 0.05 * (s.wobT / 0.7); s.ox = Math.sin(s.wobT * 38) * 2.5; } else { s.wob = 0; s.ox = 0; }
        if (s.alive) drawPen(x, s, ink, 0);
      }
      // Hover-Hilfe mit Maus/Pencil: Umriss
      if (hover >= 0 && pens[hover].alive && !busy) { const s = pens[hover]; x.save(); x.translate(s.x, s.y); x.rotate(s.a); x.strokeStyle = P[turn].color; x.lineWidth = 3; x.setLineDash([6, 5]); x.beginPath(); x.roundRect(-s.len / 2 - 4, -12, s.len + 8, 24, 10); x.stroke(); x.restore(); }
      // fliegende Stifte
      for (const s of pens) {
        if (!s.fly || s.fly >= 1) continue;
        s.fly = Math.min(1, s.fly + dt * 1.6); const t = s.fly, e = t * t * (3 - 2 * t);
        const q = { ...s, x: s.from[0] + (s.to[0] - s.from[0]) * e, y: s.from[1] + (s.to[1] - s.from[1]) * e - Math.sin(t * Math.PI) * 120, a: s.a + t * 2.5 };
        x.globalAlpha = 1 - t * 0.6; drawPen(x, q, ink, 6); x.globalAlpha = 1;
      }
      if (finger) { finger.t += dt; x.strokeStyle = P[1].color; x.lineWidth = 3; x.beginPath(); x.arc(finger.x, finger.y, 18 + Math.sin(finger.t * 10) * 4, 0, 7); x.stroke(); }
      x.restore();
      if (msgT > 0) banner(x, C.cw, C.ch, dark, msg, 12);
    }
    function frame(t) {
      const dt = Math.min(0.033, (t - (last || t)) / 1000); last = t;
      msgT = Math.max(0, msgT - dt); draw(dt);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
