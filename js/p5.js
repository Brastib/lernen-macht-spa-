// Papier-Spiele, Paket 5: Karo-Billard (zu zweit / allein), Kritzelkick (Fußball zu zweit oder gegen Computer),
// Bombenlabyrinth (Wände sprengen, den anderen erwischen). Alles im Kritzel-Look auf kariertem Papier.
import { h, icon } from './ui.js';
import { FONT, UIFONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, store, rng, turnCard } from './sketch.js';

function banner(x, cw, ch, dark, txt, y = null) {
  const ink = inkOf(dark);
  x.save(); const fs = Math.round(Math.max(20, Math.min(36, cw / 16)));
  x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(cw - 20, x.measureText(txt).width + 44), hh = fs + 26, yy = y == null ? ch / 2 - hh / 2 : y;
  x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
  prect(x, cw / 2 - w / 2, yy, w, hh, 31, 1.1); x.fill(); x.stroke();
  x.fillStyle = ink; x.fillText(txt, cw / 2, yy + hh / 2 + 1, w - 20); x.restore();
}
const fit = (C, W, H, m = 10) => { const U = Math.min((C.cw - 2 * m) / W, (C.ch - 2 * m) / H); return { U, ox: (C.cw - W * U) / 2, oy: (C.ch - H * U) / 2 }; };
const toWorld = (C, g, e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - g.ox) / g.U, (e.clientY - r.top - g.oy) / g.U]; };

// ======================================================================
// Karo-Billard
// ======================================================================
const BWD = 1000, BHT = 520, BRAD = 13, PR = 25;
const POCKETS = [[0, 0], [BWD / 2, -4], [BWD, 0], [0, BHT], [BWD / 2, BHT + 4], [BWD, BHT]];
const BCOL = ['#f2c230', '#2f7cf6', '#e0483e', '#a46bff', '#ff9a3c', '#2fbf71', '#8b2e3c', '#21b8c9', '#d4a017'];
export function pool(fx, A, B) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), solo = !B, P = [A, B].filter(Boolean);
    const R = rng((Math.random() * 1e9) | 0);
    const pts = P.map(() => 0); let turn = 0, shots = 0;
    const balls = [{ n: 0, x: 250, y: BHT / 2, vx: 0, vy: 0, in: false, rot: 0 }];
    { // Dreieck
      const order = [1, 2, 3, 4, 9, 5, 6, 7, 8]; let k = 0;
      for (let row = 0; row < 4 && k < order.length; row++) for (let i = 0; i <= row && k < order.length; i++) balls.push({ n: order[k++], x: 700 + row * BRAD * 1.75, y: BHT / 2 + (i - row / 2) * BRAD * 2.02, vx: 0, vy: 0, in: false, rot: R() * 6 });
      if (k < order.length) balls.push({ n: order[k], x: 700 + 4 * BRAD * 1.75, y: BHT / 2, vx: 0, vy: 0, in: false, rot: 0 });
    }
    const cue = balls[0];
    const stats = h('div.hsstats');
    const turnChip = h('div.hsturn');
    const hud = h('div.hshud', null, turnChip, stats);
    const hint = h('p.hshint', { text: 'Irgendwo hinlegen und nach hinten ziehen wie eine Schleuder. Die Linie zeigt, wohin die Kugel rollt. Goldene Stern-Kugel = 3 Punkte.' });
    const host = h('div.hsarea');
    fx.stage.append(h('div.hswrap', null, hud, hint, host));
    const C = canvasBox(host), x = C.x;
    let aim = null, moving = false, potted = [], foul = false, touched = false, msg = '', msgT = 0, over = false, raf = 0, last = 0;
    const updHud = () => {
      turnChip.replaceChildren(chip(P[turn], h('small', { text: solo ? 'räumt den Tisch ab' : 'ist dran' })));
      const left = balls.filter((b) => b.n && !b.in).length;
      stats.replaceChildren(...(solo ? [['Stöße', shots], ['Kugeln übrig', left], ['Rekord', store.get('gPoolBest', 0) || '–']] : [[P[0].name, pts[0]], [P[1].name, pts[1]], ['Kugeln übrig', left]]).map(([l, v]) => h('span.hsstat', null, h('small', { text: l }), h('b', { text: String(v) }))));
    };
    updHud();
    let g = fit(C, BWD + 80, BHT + 80);
    C.cv.addEventListener('pointerdown', (e) => { if (moving || over) return; e.preventDefault(); const p = toWorld(C, g, e); aim = { id: e.pointerId, from: p, to: p }; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aim && aim.id === e.pointerId) aim.to = toWorld(C, g, e); });
    C.cv.addEventListener('pointerup', (e) => {
      if (!aim || aim.id !== e.pointerId) return;
      const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy); aim = null;
      if (L < 14) return;
      const sp = Math.min(1, L / 280) * 1500; cue.vx = dx / L * sp; cue.vy = dy / L * sp;
      moving = true; potted = []; foul = false; touched = false; shots++; hint.remove(); updHud();
    });
    C.cv.addEventListener('pointercancel', () => { aim = null; });
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', cleanup);
    const nearPocket = (b) => POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < PR + 14);
    function physics(dt) {
      const n = 6, d = dt / n;
      for (let s = 0; s < n; s++) {
        for (const b of balls) {
          if (b.in) continue;
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0) { const k = Math.max(0, sp - (150 + sp * 0.5) * d) / sp; b.vx *= k; b.vy *= k; if (sp < 4) b.vx = b.vy = 0; }
          b.x += b.vx * d; b.y += b.vy * d; b.rot += sp * d / BRAD;
          if (POCKETS.some(([px, py]) => Math.hypot(b.x - px, b.y - py) < PR)) { b.in = true; b.vx = b.vy = 0; if (b.n) potted.push(b.n); else foul = true; continue; }
          if (!nearPocket(b)) {
            if (b.x < BRAD) { b.x = BRAD; b.vx = Math.abs(b.vx) * 0.82; } if (b.x > BWD - BRAD) { b.x = BWD - BRAD; b.vx = -Math.abs(b.vx) * 0.82; }
            if (b.y < BRAD) { b.y = BRAD; b.vy = Math.abs(b.vy) * 0.82; } if (b.y > BHT - BRAD) { b.y = BHT - BRAD; b.vy = -Math.abs(b.vy) * 0.82; }
          } else { b.x = Math.max(-PR, Math.min(BWD + PR, b.x)); b.y = Math.max(-PR, Math.min(BHT + PR, b.y)); }
        }
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j]; if (a.in || c.in) continue;
          const dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy);
          if (dd < BRAD * 2 && dd > 0.001) {
            const nx = dx / dd, ny = dy / dd, ov = BRAD * 2 - dd; a.x -= nx * ov / 2; a.y -= ny * ov / 2; c.x += nx * ov / 2; c.y += ny * ov / 2;
            const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            if (rel > 0) { const k = rel * 0.96; a.vx -= k * nx; a.vy -= k * ny; c.vx += k * nx; c.vy += k * ny; if (!a.n || !c.n) touched = true; }
          }
        }
      }
      if (moving && balls.every((b) => b.in || (!b.vx && !b.vy))) { moving = false; settle(); }
    }
    function settle() {
      const val = potted.reduce((s, n) => s + (n === 9 ? 3 : 1), 0);
      if (foul) {
        cue.in = false; cue.x = 250; cue.y = BHT / 2; cue.vx = cue.vy = 0;
        while (balls.some((b) => b !== cue && !b.in && Math.hypot(b.x - cue.x, b.y - cue.y) < BRAD * 2.2)) cue.x -= BRAD * 2.2;
      }
      if (solo) { if (foul) { shots++; msg = 'Weiße versenkt: +1 Stoß'; msgT = 1.4; } else if (val) { msg = potted.length > 1 ? `${potted.length} Kugeln!` : 'Drin!'; msgT = 1; } }
      else {
        pts[turn] += val - (foul ? 1 : 0);
        if (foul) { msg = `Weiße drin: −1 für ${P[turn].name}`; msgT = 1.6; turn = 1 - turn; }
        else if (val) { msg = `+${val} für ${P[turn].name}, nochmal!`; msgT = 1.3; }
        else { turn = 1 - turn; msg = `${P[turn].name} ist dran`; msgT = 1.1; }
      }
      updHud();
      if (balls.every((b) => !b.n || b.in)) {
        over = true; msg = 'Tisch leer!'; msgT = 9;
        setTimeout(() => { cleanup(); resolve(solo ? { score: shots } : { w: pts[0] > pts[1] ? 0 : pts[1] > pts[0] ? 1 : null, detail: `${pts[0]} : ${pts[1]} Punkte` }); }, 1400);
      }
    }
    // Vorschau: wo trifft die Weiße zuerst?
    function predict(dx, dy) {
      let px = cue.x, py = cue.y;
      for (let k = 0; k < 900; k++) {
        px += dx * 2; py += dy * 2;
        if (px < BRAD || px > BWD - BRAD || py < BRAD || py > BHT - BRAD) return { x: px, y: py };
        for (const b of balls) if (b !== cue && !b.in && Math.hypot(b.x - px, b.y - py) < BRAD * 2) return { x: px, y: py, b };
      }
      return { x: px, y: py };
    }
    function drawBall(b) {
      if (b.in) return;
      const c = b.n ? BCOL[b.n - 1] : null;
      x.fillStyle = 'rgba(0,0,0,.16)'; x.beginPath(); x.ellipse(b.x + 3, b.y + 4, BRAD, BRAD * 0.8, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = c ? (dark ? shade(c, -0.15) : shade(c, 0.25)) : (dark ? '#f4f1e6' : '#fff');
      pcirc(x, b.x, b.y, BRAD, b.n + 3, 0.05); x.fill();
      if (c) { x.save(); pcirc(x, b.x, b.y, BRAD, b.n + 3, 0.05); x.clip(); x.translate(b.x, b.y); x.rotate(b.rot * 0.15); hatch(x, -BRAD, -BRAD, BRAD * 2, BRAD * 2, shade(c, -0.25), 4, 0.7, 1.2); x.restore(); }
      x.strokeStyle = ink; x.lineWidth = 1.8; pcirc(x, b.x, b.y, BRAD, b.n + 3, 0.05); x.stroke();
      if (b.n) {
        x.fillStyle = '#fffdf6'; x.beginPath(); x.arc(b.x, b.y, BRAD * 0.55, 0, Math.PI * 2); x.fill(); x.lineWidth = 1; x.stroke();
        if (b.n === 9) { x.fillStyle = '#d4a017'; x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.6 : 6; x.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); } x.closePath(); x.fill(); }
        else { x.fillStyle = '#26262b'; x.font = `800 ${Math.round(BRAD * 0.95)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(b.n), b.x, b.y + 1); }
      }
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0); last = t;
      if (moving) physics(dt);
      msgT = Math.max(0, msgT - dt);
      g = fit(C, BWD + 80, BHT + 80);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 20 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * (g.ox + 40 * g.U), C.dpr * (g.oy + 40 * g.U));
      // Bande (Holz, schraffiert) und Tuch
      x.fillStyle = dark ? '#3b2c1e' : '#d8b48a'; prect(x, -34, -34, BWD + 68, BHT + 68, 3, 1.2); x.fill();
      x.save(); prect(x, -34, -34, BWD + 68, BHT + 68, 3, 1.2); x.clip(); hatch(x, -34, -34, BWD + 68, BHT + 68, dark ? '#7a5a3a' : '#a0703f', 8, 0.6, 1.4); x.restore();
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, -34, -34, BWD + 68, BHT + 68, 3, 1.2); x.stroke();
      x.fillStyle = dark ? '#1f3a2c' : '#cfe8d4'; x.fillRect(0, 0, BWD, BHT);
      x.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(40,110,60,.12)'; x.lineWidth = 1; x.beginPath(); for (let k = 20; k < BWD; k += 20) { x.moveTo(k, 0); x.lineTo(k, BHT); } for (let k = 20; k < BHT; k += 20) { x.moveTo(0, k); x.lineTo(BWD, k); } x.stroke();
      x.strokeStyle = ink; x.lineWidth = 2.4; prect(x, 0, 0, BWD, BHT, 4, 0.8); x.stroke();
      x.globalAlpha = 0.35; x.lineWidth = 1.5; pline(x, 250, 8, 250, BHT - 8, 5, 0.6); x.beginPath(); x.arc(250, BHT / 2, 70, Math.PI / 2, Math.PI * 1.5); x.stroke(); x.globalAlpha = 1;
      for (const [px, py] of POCKETS) { x.fillStyle = '#121418'; pcirc(x, px, py, PR, px + py, 0.08); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke(); }
      // Zielen
      if (aim && !moving) {
        const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy), k = Math.min(1, L / 280);
        if (L > 14) {
          const ux = dx / L, uy = dy / L, hit = predict(ux, uy);
          x.strokeStyle = P[turn].color; x.lineWidth = 2.5; x.setLineDash([3, 8]); x.lineCap = 'round'; x.beginPath(); x.moveTo(cue.x, cue.y); x.lineTo(hit.x, hit.y); x.stroke(); x.setLineDash([]);
          x.strokeStyle = ink; x.globalAlpha = 0.5; x.lineWidth = 1.5; x.beginPath(); x.arc(hit.x, hit.y, BRAD, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
          if (hit.b) { const nx = hit.b.x - hit.x, ny = hit.b.y - hit.y, nl = Math.hypot(nx, ny) || 1; x.strokeStyle = ink; x.globalAlpha = 0.6; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(hit.b.x, hit.b.y); x.lineTo(hit.b.x + nx / nl * 90, hit.b.y + ny / nl * 90); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
          // Bleistift als Queue
          const back = 22 + k * 90, sx = cue.x - ux * back, sy = cue.y - uy * back, ex = sx - ux * 380, ey = sy - uy * 380;
          x.lineCap = 'butt'; x.strokeStyle = ink; x.lineWidth = 14; x.beginPath(); x.moveTo(sx - ux * 30, sy - uy * 30); x.lineTo(ex, ey); x.stroke();
          x.strokeStyle = '#f4c430'; x.lineWidth = 10; x.stroke();
          x.strokeStyle = '#f1d7b0'; x.lineWidth = 10; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx - ux * 30, sy - uy * 30); x.stroke();
          x.strokeStyle = ink; x.lineWidth = 4; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx - ux * 8, sy - uy * 8); x.stroke();
          x.strokeStyle = '#f2a0a8'; x.lineWidth = 12; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - ux * 20, ey - uy * 20); x.stroke();
          x.lineCap = 'round';
        }
      }
      balls.forEach(drawBall);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Kritzelkick (Fußball von oben)
// ======================================================================
const FFL = 1000, FFW = 600, PRAD = 22, BALLR = 12, GOAL0 = 215, GOAL1 = 385, WINF = 5;
export function kick(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0);
    const P = [A, B].map((p, i) => ({ p, i, x: 0, y: 0, vx: 0, vy: 0, tx: null, ty: null, score: 0, leg: 0, kickT: 0, face: i ? -1 : 1, cool: 0 }));
    const ball = { x: FFL / 2, y: FFW / 2, vx: 0, vy: 0, rot: 0 };
    const host = h('div.hsarea');
    const hint = h('p.hshint', { text: cpu ? 'Finger halten = hinlaufen, kurz tippen = schießen. Tastatur: WASD oder Pfeile, Leertaste schießt.' : 'Jeder auf seiner Hälfte: Finger halten = laufen, kurz tippen = schießen. Tastatur: WASD + Leertaste, Pfeile + Enter.' });
    fx.stage.append(h('div.hswrap', null, hint, host));
    const C = canvasBox(host), x = C.x;
    let g = fit(C, FFL + 60, FFW + 20), count = 2.4, pause = 0, msg = '', msgT = 0, over = false, raf = 0, last = 0;
    function kickoff(to) {
      P.forEach((q) => { q.x = q.i ? FFL - 170 : 170; q.y = FFW / 2; q.vx = q.vy = 0; q.tx = q.ty = null; });
      ball.x = to === 1 ? FFL / 2 + 40 : to === 0 ? FFL / 2 - 40 : FFL / 2; ball.y = FFW / 2; ball.vx = ball.vy = 0;
    }
    kickoff(-1);
    // Eingabe Touch
    const ptr = new Map();
    C.cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); const [wx, wy] = toWorld(C, g, e); const side = cpu ? 0 : wx - 30 < FFL / 2 ? 0 : 1;
      ptr.set(e.pointerId, { side, t: performance.now(), x0: e.clientX, y0: e.clientY }); P[side].tx = wx - 30; P[side].ty = wy - 10;
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => { const q = ptr.get(e.pointerId); if (!q) return; const [wx, wy] = toWorld(C, g, e); P[q.side].tx = wx - 30; P[q.side].ty = wy - 10; });
    const up = (e) => { const q = ptr.get(e.pointerId); if (!q) return; ptr.delete(e.pointerId); const pl = P[q.side]; pl.tx = pl.ty = null; if (performance.now() - q.t < 230 && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < 30) doKick(pl); };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    const keys = new Set();
    const onKey = (e) => {
      const k = e.code; if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(k)) return;
      e.preventDefault();
      if (e.type === 'keydown') { keys.add(k); if (!e.repeat) { if (k === 'Space') doKick(P[0]); if (k === 'Enter') doKick(P[cpu ? 0 : 1]); } } else keys.delete(k);
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);
    function doKick(q) {
      if (count > 0 || pause > 0 || over || q.cool > 0) return; q.kickT = 0.25; q.cool = 0.35;
      const dx = ball.x - q.x, dy = ball.y - q.y, d = Math.hypot(dx, dy);
      if (d > PRAD + BALLR + 26) return;
      const gx = (q.i ? 0 : FFL) - ball.x, gy = FFW / 2 + (R() - 0.5) * 120 - ball.y, gl = Math.hypot(gx, gy) || 1;
      let kx = dx / (d || 1) * 0.55 + gx / gl * 0.45, ky = dy / (d || 1) * 0.55 + gy / gl * 0.45; const kl = Math.hypot(kx, ky) || 1;
      ball.vx = kx / kl * 980; ball.vy = ky / kl * 980;
    }
    function cpuThink() {
      const q = P[1], gx = 0, gy = FFW / 2;
      const dx = gx - ball.x, dy = gy - ball.y, dl = Math.hypot(dx, dy) || 1;
      const bx = ball.x - dx / dl * (PRAD + BALLR + 4), by = ball.y - dy / dl * (PRAD + BALLR + 4);
      if (ball.x > q.x + 10 && ball.x > FFL * 0.5) { q.tx = Math.min(FFL - 30, ball.x + 50); q.ty = ball.y + (q.y < ball.y ? -60 : 60); }
      else if (ball.x < FFL * 0.35 && ball.vx < -50) { q.tx = FFL - 120; q.ty = FFW / 2 + (ball.y - FFW / 2) * 0.4; }
      else { q.tx = bx; q.ty = by; }
      if (Math.hypot(ball.x - q.x, ball.y - q.y) < PRAD + BALLR + 18 && q.x > ball.x && R() < 0.12) doKick(q);
    }
    function step(dt) {
      if (cpu) cpuThink();
      P.forEach((q, i) => {
        q.cool = Math.max(0, q.cool - dt); q.kickT = Math.max(0, q.kickT - dt);
        let ax = 0, ay = 0;
        const ks = i === 0 ? (cpu ? [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']] : [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']]) : (cpu ? null : [['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight']]);
        if (ks) { const on = (l) => l.some((k) => keys.has(k)); ax = (on(ks[3]) ? 1 : 0) - (on(ks[2]) ? 1 : 0); ay = (on(ks[1]) ? 1 : 0) - (on(ks[0]) ? 1 : 0); }
        let vx = 0, vy = 0; const max = cpu && i ? 250 : 330;
        if (ax || ay) { const l = Math.hypot(ax, ay); vx = ax / l * max; vy = ay / l * max; }
        else if (q.tx != null) { const dx = q.tx - q.x, dy = q.ty - q.y, l = Math.hypot(dx, dy); if (l > 6) { vx = dx / l * Math.min(max, l * 6); vy = dy / l * Math.min(max, l * 6); } }
        q.vx += (vx - q.vx) * Math.min(1, dt * 10); q.vy += (vy - q.vy) * Math.min(1, dt * 10);
        q.x = Math.max(PRAD, Math.min(FFL - PRAD, q.x + q.vx * dt)); q.y = Math.max(PRAD, Math.min(FFW - PRAD, q.y + q.vy * dt));
        if (Math.abs(q.vx) > 20) q.face = Math.sign(q.vx);
        q.leg += Math.hypot(q.vx, q.vy) * dt * 0.05;
      });
      // Spieler gegeneinander
      { const a = P[0], b = P[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d < PRAD * 2 && d > 0) { const ov = (PRAD * 2 - d) / 2; a.x -= dx / d * ov; a.y -= dy / d * ov; b.x += dx / d * ov; b.y += dy / d * ov; } }
      // Ball
      const n = 4, d = dt / n;
      for (let s = 0; s < n; s++) {
        const sp = Math.hypot(ball.vx, ball.vy); if (sp > 0) { const k = Math.max(0, sp - (60 + sp * 0.7) * d) / sp; ball.vx *= k; ball.vy *= k; }
        ball.x += ball.vx * d; ball.y += ball.vy * d; ball.rot += sp * d / BALLR;
        if (ball.y < BALLR) { ball.y = BALLR; ball.vy = Math.abs(ball.vy) * 0.8; } if (ball.y > FFW - BALLR) { ball.y = FFW - BALLR; ball.vy = -Math.abs(ball.vy) * 0.8; }
        const mouth = ball.y > GOAL0 && ball.y < GOAL1;
        if (ball.x < BALLR) { if (mouth) { if (ball.x < -BALLR) return goal(1); } else { ball.x = BALLR; ball.vx = Math.abs(ball.vx) * 0.8; } }
        if (ball.x > FFL - BALLR) { if (mouth) { if (ball.x > FFL + BALLR) return goal(0); } else { ball.x = FFL - BALLR; ball.vx = -Math.abs(ball.vx) * 0.8; } }
        if (ball.x < 0 || ball.x > FFL) { ball.y = Math.max(GOAL0 + BALLR, Math.min(GOAL1 - BALLR, ball.y)); }
        for (const q of P) {
          const dx = ball.x - q.x, dy = ball.y - q.y, dd = Math.hypot(dx, dy), min = PRAD + BALLR;
          if (dd < min && dd > 0.001) { const nx = dx / dd, ny = dy / dd; ball.x = q.x + nx * min; ball.y = q.y + ny * min; const rel = (ball.vx - q.vx) * nx + (ball.vy - q.vy) * ny; if (rel < 0) { ball.vx -= 1.5 * rel * nx; ball.vy -= 1.5 * rel * ny; } }
        }
      }
    }
    function goal(side) {
      P[side].score++; pause = 1.6; ball.vx = ball.vy = 0;
      msg = P[side].score >= WINF ? `${P[side].p.name} gewinnt!` : `Tor für ${P[side].p.name}!`; msgT = 1.6;
      if (P[side].score >= WINF) { over = true; setTimeout(() => { cleanup(); resolve({ w: side, detail: `${P[0].score} : ${P[1].score} Tore` }); }, 1600); }
      else setTimeout(() => { if (!fx.signal.aborted) kickoff(1 - side); }, 1500);
    }
    function figure(q) {
      const c = q.p.color, X = q.x, Y = q.y, s = Math.sin(q.leg), f = q.face;
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(X, Y + 16, 18, 7, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = ink; x.lineWidth = 3.5;
      const hip = [X, Y - 4];
      const kickLeg = q.kickT > 0 ? [X + f * 22, Y + 4] : [X + s * 9, Y + 15];
      x.beginPath(); x.moveTo(...hip); x.lineTo(...kickLeg); x.moveTo(...hip); x.lineTo(X - s * 9, Y + 15); x.stroke();
      x.strokeStyle = c; x.lineWidth = 9; x.beginPath(); x.moveTo(X, Y - 6); x.lineTo(X, Y - 26); x.stroke();
      x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.moveTo(X, Y - 23); x.lineTo(X + 12, Y - 13 + s * 4); x.moveTo(X, Y - 23); x.lineTo(X - 12, Y - 13 - s * 4); x.stroke();
      x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.beginPath(); x.arc(X, Y - 36, 9, 0, Math.PI * 2); x.fill(); x.lineWidth = 2.6; x.stroke();
      x.fillStyle = ink; x.beginPath(); x.arc(X + f * 4, Y - 37, 1.6, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0); last = t;
      if (count > 0) { count -= dt; } else if (pause > 0) pause -= dt; else if (!over) step(dt);
      msgT = Math.max(0, msgT - dt);
      g = fit(C, FFL + 60, FFW + 20);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 20 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * (g.ox + 30 * g.U), C.dpr * (g.oy + 10 * g.U));
      // Rasen mit Streifen
      for (let k = 0; k < 10; k++) { x.fillStyle = k % 2 ? (dark ? 'rgba(60,160,90,.14)' : 'rgba(60,170,90,.16)') : (dark ? 'rgba(60,160,90,.08)' : 'rgba(60,170,90,.08)'); x.fillRect(k * FFL / 10, 0, FFL / 10, FFW); }
      x.strokeStyle = ink; x.lineWidth = 3; x.lineCap = 'round';
      pline(x, 0, 0, FFL, 0, 1); pline(x, 0, FFW, FFL, FFW, 2); pline(x, 0, 0, 0, GOAL0, 3); pline(x, 0, GOAL1, 0, FFW, 4); pline(x, FFL, 0, FFL, GOAL0, 5); pline(x, FFL, GOAL1, FFL, FFW, 6);
      x.lineWidth = 2; x.globalAlpha = 0.6; pline(x, FFL / 2, 4, FFL / 2, FFW - 4, 7); pcirc(x, FFL / 2, FFW / 2, 75, 8, 0.04); x.stroke();
      x.strokeRect(0, FFW / 2 - 140, 140, 280); x.strokeRect(FFL - 140, FFW / 2 - 140, 140, 280); x.globalAlpha = 1;
      // Tore mit Netz
      P.forEach((q) => {
        const gx = q.i ? FFL : -28; x.save(); x.beginPath(); x.rect(gx, GOAL0, 28, GOAL1 - GOAL0); x.clip();
        x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 1; x.beginPath(); for (let k = -200; k < 200; k += 8) { x.moveTo(gx + k, GOAL0); x.lineTo(gx + k + 200, GOAL1); x.moveTo(gx + k + 200, GOAL0); x.lineTo(gx + k, GOAL1); } x.stroke(); x.restore();
        x.strokeStyle = q.p.color; x.lineWidth = 5; x.strokeRect(gx, GOAL0, 28, GOAL1 - GOAL0);
      });
      // Spielstand groß auf dem Rasen
      x.save(); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 110px ${FONT}`; P.forEach((q) => { x.globalAlpha = 0.13; x.fillStyle = q.p.color; x.fillText(String(q.score), q.i ? FFL * 0.75 : FFL * 0.25, FFW / 2); }); x.restore();
      x.save(); x.font = `700 18px ${UIFONT}`; x.fillStyle = ink; x.globalAlpha = 0.6; x.textBaseline = 'top'; x.textAlign = 'left'; x.fillText(A.name, 12, 10, 300); x.textAlign = 'right'; x.fillText(B.name, FFL - 12, 10, 300); x.restore();
      [...P].sort((a, b) => a.y - b.y).forEach(figure);
      // Ball
      x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(ball.x + 2, ball.y + 5, BALLR, BALLR * 0.6, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; pcirc(x, ball.x, ball.y, BALLR, 9, 0.06); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
      x.save(); x.translate(ball.x, ball.y); x.rotate(ball.rot); x.fillStyle = ink; x.beginPath(); for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; x.lineTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5); } x.closePath(); x.fill();
      x.lineWidth = 1.2; x.beginPath(); for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; x.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5); x.lineTo(Math.cos(a) * BALLR, Math.sin(a) * BALLR); } x.stroke(); x.restore();
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (count > 0) banner(x, C.cw, C.ch, dark, String(Math.ceil(count / 0.8)));
      else if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    fx.stage.querySelector('.hshint') && setTimeout(() => hint.remove(), 6000);
  });
}

// ======================================================================
// Bombenlabyrinth
// ======================================================================
const MW5 = 15, MH5 = 11, FUSE = 2.2, FLAME = 0.55;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export function bombs(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0);
    const P0 = [A, B];
    const wins = [0, 0]; let round = 0;
    // Oberfläche: Feld + Steuer-Pads
    const mkPad = (p, i) => {
      const b = (d, ic, lab) => h('button.bmbtn.' + d, { 'aria-label': lab, title: lab, style: { '--pc': p.color } }, icon(ic));
      const btns = { up: b('up', 'arup', 'Hoch'), left: b('left', 'left', 'Links'), right: b('right', 'right', 'Rechts'), down: b('down', 'down', 'Runter') };
      const bomb = h('button.bmbomb', { style: { '--pc': p.color }, 'aria-label': 'Bombe legen' }, h('span.bmbombic'), h('span', { text: 'Bombe' }));
      const sc = h('span.sgscore');
      const el = h('div.sgpad.bmpad', { style: { '--pc': p.color } }, chip(p), sc, h('div.bmdpad', null, btns.up, btns.left, btns.right, btns.down), bomb, h('small.sgkeys', { text: cpu ? 'WASD/Pfeile + Leertaste' : i ? 'Pfeile + Enter' : 'WASD + Leertaste' }));
      return { el, btns, bomb, sc };
    };
    const pads = (cpu ? [A] : [A, B]).map(mkPad);
    const boardHost = h('div.sgboard');
    const wrap = h('div.sgwrap' + (cpu ? '.solo' : ''));
    wrap.append(...(pads.length > 1 ? [pads[0].el, boardHost, pads[1].el] : [boardHost, pads[0].el]));
    fx.stage.append(wrap);
    const rs = fx.stage.getBoundingClientRect(); wrap.classList.toggle('tall', rs.height > rs.width * 0.9);
    const C = canvasBox(boardHost), x = C.x;
    const ro = new ResizeObserver(() => { const r = wrap.getBoundingClientRect(); wrap.classList.toggle('tall', r.height > r.width * 0.9); }); ro.observe(wrap);

    let map, pl, bombsL, flames, items, count, between, msg, over = false, raf = 0, last = 0;
    const idx = (cx, cy) => cy * MW5 + cx;
    function newRound() {
      round++; map = new Uint8Array(MW5 * MH5); bombsL = []; flames = []; items = [];
      for (let cy = 0; cy < MH5; cy++) for (let cx = 0; cx < MW5; cx++) {
        if (cx === 0 || cy === 0 || cx === MW5 - 1 || cy === MH5 - 1 || (cx % 2 === 0 && cy % 2 === 0)) map[idx(cx, cy)] = 1;
        else if (R() < 0.62) map[idx(cx, cy)] = 2;
      }
      const starts = [[1, 1], [MW5 - 2, MH5 - 2]];
      starts.forEach(([sx, sy]) => [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => { const cx = sx + dx, cy = sy + dy; if (map[idx(cx, cy)] === 2) map[idx(cx, cy)] = 0; }));
      pl = P0.map((p, i) => ({ p, i, cx: starts[i][0], cy: starts[i][1], fx: starts[i][0], fy: starts[i][1], mv: null, prog: 0, want: null, max: 1, range: 2, speed: 4.2, alive: true, deadT: 0, bot: cpu && i === 1, face: 1, walk: 0 }));
      count = 1.8; between = 0; msg = '';
      updPads();
    }
    function updPads() { pads.forEach((pd, i) => { pd.sc.textContent = cpu ? `Runden ${wins[0]} : ${wins[1]} gegen Computer` : `${wins[i]} ${wins[i] === 1 ? 'Runde' : 'Runden'}`; }); }
    const solid = (cx, cy, who) => { const v = map[idx(cx, cy)]; if (v) return true; return bombsL.some((b) => b.cx === cx && b.cy === cy && !(who && b.pass.has(who.i))); };
    function placeBomb(q) {
      if (!q.alive || count > 0 || between > 0 || over) return;
      const cx = q.mv && q.prog > 0.5 ? q.mv[0] : q.cx, cy = q.mv && q.prog > 0.5 ? q.mv[1] : q.cy;
      if (bombsL.filter((b) => b.owner === q.i).length >= q.max || bombsL.some((b) => b.cx === cx && b.cy === cy)) return;
      bombsL.push({ cx, cy, t: FUSE, owner: q.i, range: q.range, pass: new Set(pl.filter((r) => r.alive && Math.round(r.fx) === cx && Math.round(r.fy) === cy).map((r) => r.i)) });
    }
    function blast(b) {
      bombsL = bombsL.filter((q) => q !== b);
      const cells = [[b.cx, b.cy]];
      for (const [dx, dy] of Object.values(DIRS)) for (let k = 1; k <= b.range; k++) {
        const cx = b.cx + dx * k, cy = b.cy + dy * k, v = map[idx(cx, cy)];
        if (v === 1) break;
        cells.push([cx, cy]);
        if (v === 2) { map[idx(cx, cy)] = 0; if (R() < 0.32) items.push({ cx, cy, k: ['bomb', 'range', 'speed'][(R() * 3) | 0], t: 0.3 }); break; }
        const it = items.findIndex((q) => q.cx === cx && q.cy === cy && q.t <= 0); if (it >= 0) items.splice(it, 1);
      }
      cells.forEach(([cx, cy]) => flames.push({ cx, cy, t: FLAME, c: b }));
      bombsL.filter((q) => cells.some(([cx, cy]) => q.cx === cx && q.cy === cy)).forEach((q) => { q.t = Math.min(q.t, 0.05); });
    }
    // Gefahr für den Computer: Felder, die bald brennen
    function danger() {
      const d = new Float32Array(MW5 * MH5).fill(99);
      for (const b of bombsL) { const mark = (cx, cy) => { d[idx(cx, cy)] = Math.min(d[idx(cx, cy)], b.t); }; mark(b.cx, b.cy); for (const [dx, dy] of Object.values(DIRS)) for (let k = 1; k <= b.range; k++) { const cx = b.cx + dx * k, cy = b.cy + dy * k, v = map[idx(cx, cy)]; if (v === 1) break; mark(cx, cy); if (v === 2) break; } }
      for (const f of flames) d[idx(f.cx, f.cy)] = 0;
      return d;
    }
    function bfs(q, goal, dz, extraBomb) {
      const start = [q.cx, q.cy], seen = new Int16Array(MW5 * MH5).fill(-1), qu = [start]; seen[idx(...start)] = -2;
      while (qu.length) {
        const [cx, cy] = qu.shift();
        if (goal(cx, cy)) { let c = idx(cx, cy), prev = c; while (seen[c] !== -2) { prev = c; c = seen[c]; } return prev === idx(...start) ? [cx, cy, null] : [cx, cy, [prev % MW5, (prev / MW5) | 0]]; }
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = cx + dx, ny = cy + dy, j = idx(nx, ny);
          if (seen[j] !== -1 || map[j] || (bombsL.some((b) => b.cx === nx && b.cy === ny)) || (extraBomb && extraBomb[0] === nx && extraBomb[1] === ny) || dz[j] < 0.6) continue;
          seen[j] = idx(cx, cy); qu.push([nx, ny]);
        }
      }
      return null;
    }
    function botThink(q) {
      const dz = danger(), here = idx(q.cx, q.cy), foe = pl[0];
      const safe = (cx, cy) => dz[idx(cx, cy)] > 50;
      if (dz[here] < 50) { const r = bfs(q, safe, dz.map((v, k) => (k === here ? 99 : v))); q.want = r && r[2] ? r[2] : null; return; }
      // Bombe legen, wenn sinnvoll und Fluchtweg da
      const nearBox = Object.values(DIRS).some(([dx, dy]) => map[idx(q.cx + dx, q.cy + dy)] === 2);
      const foeLine = foe.alive && ((foe.cx === q.cx && Math.abs(foe.cy - q.cy) <= q.range) || (foe.cy === q.cy && Math.abs(foe.cx - q.cx) <= q.range));
      if ((nearBox || foeLine) && bombsL.filter((b) => b.owner === q.i).length < q.max && R() < 0.8) {
        const test = danger(); const mark = (cx, cy) => { test[idx(cx, cy)] = Math.min(test[idx(cx, cy)], FUSE); };
        mark(q.cx, q.cy); for (const [dx, dy] of Object.values(DIRS)) for (let k = 1; k <= q.range; k++) { const cx = q.cx + dx * k, cy = q.cy + dy * k, v = map[idx(cx, cy)]; if (v === 1) break; mark(cx, cy); if (v === 2) break; }
        const esc = bfs(q, (cx, cy) => test[idx(cx, cy)] > 50, test.map((v, k) => (k === here ? 99 : v)));
        if (esc) { placeBomb(q); q.want = esc[2]; return; }
      }
      const it = items.length ? bfs(q, (cx, cy) => items.some((i) => i.cx === cx && i.cy === cy), dz) : null;
      const tgt = it || bfs(q, (cx, cy) => (foe.alive && Math.abs(cx - foe.cx) + Math.abs(cy - foe.cy) <= 1) || Object.values(DIRS).some(([dx, dy]) => map[idx(cx + dx, cy + dy)] === 2), dz);
      q.want = tgt && tgt[2] && dz[idx(...tgt[2])] > 50 ? tgt[2] : null;
      if (!q.want && R() < 0.3) { const opts = Object.values(DIRS).map(([dx, dy]) => [q.cx + dx, q.cy + dy]).filter(([cx, cy]) => !solid(cx, cy, q) && dz[idx(cx, cy)] > 50); if (opts.length) q.want = opts[(R() * opts.length) | 0]; }
    }
    // Eingabe
    const held = [new Set(), new Set()];
    const dirOf = (q) => [...held[q.i]].pop() || null;   // zuletzt gedrückte Richtung zählt
    pads.forEach((pd, i) => {
      Object.entries(pd.btns).forEach(([d, b]) => {
        const on = (e) => { e.preventDefault(); held[i].delete(d); held[i].add(d); b.classList.add('on'); };
        const off = () => { held[i].delete(d); b.classList.remove('on'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      });
      pd.bomb.addEventListener('pointerdown', (e) => { e.preventDefault(); placeBomb(pl[i]); pd.bomb.classList.add('on'); setTimeout(() => pd.bomb.classList.remove('on'), 150); });
    });
    const KEYS = cpu ? { KeyW: [0, 'up'], KeyS: [0, 'down'], KeyA: [0, 'left'], KeyD: [0, 'right'], ArrowUp: [0, 'up'], ArrowDown: [0, 'down'], ArrowLeft: [0, 'left'], ArrowRight: [0, 'right'] }
      : { KeyW: [0, 'up'], KeyS: [0, 'down'], KeyA: [0, 'left'], KeyD: [0, 'right'], ArrowUp: [1, 'up'], ArrowDown: [1, 'down'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'] };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (e.type === 'keydown' && !e.repeat) placeBomb(pl[e.code === 'Enter' && !cpu ? 1 : 0]); return; }
      const m = KEYS[e.code]; if (!m) return; e.preventDefault();
      if (e.type === 'keydown') { held[m[0]].delete(m[1]); held[m[0]].add(m[1]); } else held[m[0]].delete(m[1]);
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    function step(dt) {
      for (const q of pl) {
        if (!q.alive) { q.deadT += dt; continue; }
        if (!q.mv) {
          let d = null;
          if (q.bot) { if (!q.think || q.think <= 0) { botThink(q); q.think = 0.08; } q.think -= dt; if (q.want) d = [q.want[0] - q.cx, q.want[1] - q.cy]; }
          else { const k = dirOf(q); if (k) d = DIRS[k]; }
          if (d && Math.abs(d[0]) + Math.abs(d[1]) === 1) { if (d[0]) q.face = d[0]; const nx = q.cx + d[0], ny = q.cy + d[1]; if (!solid(nx, ny, q)) { q.mv = [nx, ny]; q.prog = 0; } }
        }
        if (q.mv) {
          q.prog += dt * q.speed; q.walk += dt * 12;
          if (q.prog >= 1) { q.cx = q.mv[0]; q.cy = q.mv[1]; q.mv = null; q.prog = 0; if (q.bot) q.want = null; }
        }
        q.fx = q.mv ? q.cx + (q.mv[0] - q.cx) * q.prog : q.cx; q.fy = q.mv ? q.cy + (q.mv[1] - q.cy) * q.prog : q.cy;
        // Durchgangsrecht über eigene Bombe endet, wenn man runter ist
        bombsL.forEach((b) => { if (b.pass.has(q.i) && Math.abs(q.fx - b.cx) + Math.abs(q.fy - b.cy) >= 0.95) b.pass.delete(q.i); });
        const tcx = Math.round(q.fx), tcy = Math.round(q.fy);
        const it = items.findIndex((i) => i.cx === tcx && i.cy === tcy && i.t <= 0);
        if (it >= 0) { const k = items[it].k; if (k === 'bomb') q.max = Math.min(5, q.max + 1); else if (k === 'range') q.range = Math.min(7, q.range + 1); else q.speed = Math.min(7, q.speed + 0.7); items.splice(it, 1); }
        if (flames.some((f) => f.cx === tcx && f.cy === tcy)) { q.alive = false; q.deadT = 0; }
      }
      bombsL.forEach((b) => { b.t -= dt; }); [...bombsL].filter((b) => b.t <= 0).forEach((b) => { if (bombsL.includes(b)) blast(b); });
      flames.forEach((f) => { f.t -= dt; }); flames = flames.filter((f) => f.t > 0);
      items.forEach((i) => { i.t -= dt; });
      const alive = pl.filter((q) => q.alive);
      if (alive.length < 2 && between <= 0) {
        const wi = alive.length === 1 ? alive[0].i : -1; if (wi >= 0) wins[wi]++; updPads();
        const champ = wins.findIndex((w) => w >= 2);
        if (champ >= 0 || round >= 5) { over = true; msg = champ >= 0 ? `${P0[champ].name} gewinnt!` : 'Unentschieden'; between = 9; setTimeout(() => { cleanup(); resolve({ w: wins[0] > wins[1] ? 0 : wins[1] > wins[0] ? 1 : null, detail: `${wins[0]} : ${wins[1]} Runden` }); }, 1700); }
        else { msg = wi >= 0 ? `Runde für ${P0[wi].name}` : 'Beide erwischt!'; between = 2; }
      }
    }
    // ---------- Zeichnen ----------
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.04, last ? (t - last) / 1000 : 0); last = t;
      if (count > 0) count -= dt; else if (between > 0) { step(dt); between -= dt; if (between <= 0 && !over) newRound(); } else step(dt);
      const xx = C.begin();
      const cs = Math.floor(Math.min((C.cw - 10) / MW5, (C.ch - 10) / MH5)), X0 = Math.round((C.cw - MW5 * cs) / 2), Y0 = Math.round((C.ch - MH5 * cs) / 2);
      paper(xx, C.cw, C.ch, dark, cs / 2, X0, Y0);
      const T = t / 1000;
      for (let cy = 0; cy < MH5; cy++) for (let cx = 0; cx < MW5; cx++) {
        const v = map[idx(cx, cy)], X = X0 + cx * cs, Y = Y0 + cy * cs;
        if (v === 1) {
          x.fillStyle = dark ? '#3a3e48' : '#c9ccd3'; prect(x, X + 1, Y + 1, cs - 2, cs - 2, cx * 31 + cy, 0.6); x.fill();
          x.strokeStyle = ink; x.lineWidth = 1.2; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(X + 2, Y + cs / 2); x.lineTo(X + cs - 2, Y + cs / 2); x.moveTo(X + cs / 2, Y + 2); x.lineTo(X + cs / 2, Y + cs / 2); x.moveTo(X + cs / 4, Y + cs / 2); x.lineTo(X + cs / 4, Y + cs - 2); x.moveTo(X + cs * 0.75, Y + cs / 2); x.lineTo(X + cs * 0.75, Y + cs - 2); x.stroke(); x.globalAlpha = 1;
          x.lineWidth = 2; prect(x, X + 1, Y + 1, cs - 2, cs - 2, cx * 31 + cy, 0.6); x.stroke();
        } else if (v === 2) {
          const p = cs * 0.1;
          x.fillStyle = dark ? '#5a4630' : '#e2c49a'; prect(x, X + p, Y + p, cs - 2 * p, cs - 2 * p, cx * 7 + cy * 3, 1); x.fill();
          hatch(x, X + p, Y + p, cs - 2 * p, cs - 2 * p, dark ? '#a07a4a' : '#a5763f', 5, 0.6, 1.1);
          x.strokeStyle = ink; x.lineWidth = 1.8; prect(x, X + p, Y + p, cs - 2 * p, cs - 2 * p, cx * 7 + cy * 3, 1); x.stroke();
          x.lineWidth = 1.2; x.beginPath(); x.moveTo(X + p, Y + p); x.lineTo(X + cs - p, Y + cs - p); x.moveTo(X + cs - p, Y + p); x.lineTo(X + p, Y + cs - p); x.globalAlpha = 0.35; x.stroke(); x.globalAlpha = 1;
        }
      }
      // Gegenstände
      for (const it of items) {
        const X = X0 + (it.cx + 0.5) * cs, Y = Y0 + (it.cy + 0.5) * cs, r = cs * 0.32 * (1 + Math.sin(T * 5) * 0.06);
        x.fillStyle = it.k === 'bomb' ? '#ffb3a8' : it.k === 'range' ? '#ffd27a' : '#a8e6c0'; pcirc(x, X, Y, r, it.cx * 3 + it.cy, 0.1); x.fill(); x.strokeStyle = ink; x.lineWidth = 1.8; x.stroke();
        x.fillStyle = ink; x.font = `800 ${Math.round(cs * 0.36)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(it.k === 'bomb' ? '+1' : it.k === 'range' ? '↔' : '»', X, Y + 1);
      }
      // Bomben
      for (const b of bombsL) {
        const X = X0 + (b.cx + 0.5) * cs, Y = Y0 + (b.cy + 0.55) * cs, pulse = 1 + Math.sin((FUSE - b.t) * (8 + (FUSE - b.t) * 6)) * 0.06, r = cs * 0.32 * pulse;
        x.fillStyle = dark ? '#0d0f13' : '#2a2d33'; pcirc(x, X, Y, r, b.cx * 5 + b.cy, 0.06); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
        x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(X - r * 0.35, Y - r * 0.35, r * 0.2, 0, Math.PI * 2); x.fill();
        x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(X + r * 0.5, Y - r * 0.7); x.quadraticCurveTo(X + r, Y - r * 1.4, X + r * 0.6, Y - r * 1.6); x.stroke();
        x.fillStyle = (T * 10 | 0) % 2 ? '#ffb000' : '#ff5a2a'; x.beginPath(); x.arc(X + r * 0.6, Y - r * 1.6, cs * 0.07, 0, Math.PI * 2); x.fill();
      }
      // Flammen als Textmarker-Kleckse
      for (const f of flames) {
        const X = X0 + (f.cx + 0.5) * cs, Y = Y0 + (f.cy + 0.5) * cs, k = f.t / FLAME;
        x.fillStyle = `rgba(255,${Math.round(120 + 90 * k)},40,${0.35 + 0.5 * k})`; pcirc(x, X, Y, cs * (0.42 + 0.1 * Math.sin(T * 30 + f.cx)), f.cx * 9 + f.cy, 0.25); x.fill();
        x.fillStyle = `rgba(255,240,120,${0.6 * k})`; pcirc(x, X, Y, cs * 0.22, f.cx + f.cy * 9, 0.3); x.fill();
      }
      // Figuren
      for (const q of pl) {
        const X = X0 + (q.fx + 0.5) * cs, Y = Y0 + (q.fy + 0.5) * cs, c = q.p.color, s = Math.sin(q.walk) * (q.mv ? 1 : 0), u = cs / 40;
        x.save(); x.translate(X, Y); if (!q.alive) { x.globalAlpha = Math.max(0, 1 - q.deadT); x.rotate(q.deadT * 4); }
        x.lineCap = 'round'; x.strokeStyle = ink; x.lineWidth = 2.6 * u;
        x.beginPath(); x.moveTo(0, 2 * u); x.lineTo(s * 7 * u, 14 * u); x.moveTo(0, 2 * u); x.lineTo(-s * 7 * u, 14 * u); x.stroke();
        x.strokeStyle = c; x.lineWidth = 7 * u; x.beginPath(); x.moveTo(0, 3 * u); x.lineTo(0, -8 * u); x.stroke();
        x.strokeStyle = ink; x.lineWidth = 2.4 * u; x.beginPath(); x.moveTo(0, -6 * u); x.lineTo(9 * u, (1 + s * 3) * u); x.moveTo(0, -6 * u); x.lineTo(-9 * u, (1 - s * 3) * u); x.stroke();
        x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.beginPath(); x.arc(0, -15 * u, 7 * u, 0, Math.PI * 2); x.fill(); x.lineWidth = 2.2 * u; x.stroke();
        x.fillStyle = ink; x.beginPath(); x.arc(q.face * 3 * u, -16 * u, 1.4 * u, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, X0, Y0, MW5 * cs, MH5 * cs, 99, 1); x.stroke();
      if (count > 0) banner(x, C.cw, C.ch, dark, String(Math.ceil(count / 0.6)));
      else if (between > 0 && msg) banner(x, C.cw, C.ch, dark, msg);
      raf = requestAnimationFrame(frame);
    }
    newRound();
    raf = requestAnimationFrame(frame);
  });
}
