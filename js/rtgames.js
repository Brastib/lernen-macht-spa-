// Papier-Spiele, Paket 2 (Echtzeit zu zweit auf einem iPad):
// Tischtennis und Lufthockey (jeder steuert auf seiner Hälfte, auch gegen Computer),
// Schlangenduell und Leuchtspur (je zwei Dreh-Knöpfe pro Spieler). Alles auf kariertem Papier mit Bleistift-Strichen.
import { h, icon } from './ui.js';
import { FONT, UIFONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, bigText, chip, store, rng } from './sketch.js';

const FL = 1000, FW = 600;   // Spielfeld (Tor-Achse × Breite)

// ======================================================================
// Tischtennis und Lufthockey: gemeinsames Spielfeld (quer: A links, B rechts; hochkant gedreht: A unten)
// ======================================================================
function field(fx, A, B, o, kind) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, hockey = kind === 'hockey', WIN = 7;
    const dark = isDark(), ink = inkOf(dark);
    const C = canvasBox(fx.stage), x = C.x;
    const hint = h('div.stkhint', { text: cpu ? 'Finger auf deine Hälfte legen und ziehen. Am PC: W/S' + (hockey ? '/A/D' : '') + '.' : 'Jeder zieht auf seiner Hälfte. Am PC: W/S' + (hockey ? '/A/D' : '') + ' und Pfeiltasten.' });
    C.box.append(hint);
    let rot = false, U = 1, ox = 0, oy = 0;
    const layout = () => {
      const m = 12; rot = C.ch > C.cw * 1.08;
      const W = rot ? C.ch : C.cw, H = rot ? C.cw : C.ch;
      U = Math.min((W - 2 * m) / FL, (H - 2 * m) / FW);
      if (rot) { ox = (C.cw - FW * U) / 2; oy = (C.ch - FL * U) / 2; } else { ox = (C.cw - FL * U) / 2; oy = (C.ch - FW * U) / 2; }
    };
    const toField = (sx, sy) => (rot ? [(oy + FL * U - sy) / U, (sx - ox) / U] : [(sx - ox) / U, (sy - oy) / U]);
    const toScreen = (X, Y) => (rot ? [ox + Y * U, oy + FL * U - X * U] : [ox + X * U, oy + Y * U]);
    const setT = () => { const d = C.dpr; if (rot) x.setTransform(0, -U * d, U * d, 0, ox * d, (oy + FL * U) * d); else x.setTransform(U * d, 0, 0, U * d, ox * d, oy * d); };

    // ---------- Zustand ----------
    const PX = [40, FL - 40], PL = 62, PT = 16;           // Schläger (Tischtennis)
    const RM = 40, RP = 26, G0 = 195, G1 = 405;          // Schläger, Puck, Tor (Lufthockey)
    const home = (i) => (hockey ? [i ? FL - 120 : 120, FW / 2] : [PX[i], FW / 2]);
    const P = [A, B].map((p, i) => { const [hx, hy] = home(i); return { p, i, x: hx, y: hy, tx: hx, ty: hy, vx: 0, vy: 0, score: 0, flash: 0, err: 0 }; });
    const ball = { x: FL / 2, y: FW / 2, vx: 0, vy: 0, spd: 0, trail: [] };
    let count = 2.4, pause = 0, serveTo = Math.random() < 0.5 ? 0 : 1, msg = '', msgT = 0, done = false, raf = 0, last = 0, hits = 0;
    const R = rng((Math.random() * 1e9) | 0);

    function serve(to) {
      ball.x = FL / 2; ball.y = FW / 2; ball.trail = [];
      if (hockey) { ball.x = to ? FL * 0.66 : FL * 0.34; ball.vx = ball.vy = 0; P.forEach((q) => { [q.x, q.y] = home(q.i); q.tx = q.x; q.ty = q.y; q.vx = q.vy = 0; }); return; }
      ball.spd = 470; hits = 0;
      const a = (R() - 0.5) * 0.9;
      ball.vx = Math.cos(a) * ball.spd * (to ? 1 : -1); ball.vy = Math.sin(a) * ball.spd;
      ball.y = FW * (0.3 + R() * 0.4);
    }
    function point(side) {   // side bekommt den Punkt
      P[side].score++; P[side].flash = 1;
      msg = P[side].score >= WIN ? `${P[side].p.name} gewinnt!` : hockey ? `Tor für ${P[side].p.name}!` : `Punkt für ${P[side].p.name}`;
      msgT = 1.2; pause = 1.2; serveTo = side;   // danach bekommt der andere den Ball
      ball.vx = ball.vy = 0;
      if (P[side].score >= WIN && !done) {
        done = true;
        setTimeout(() => { cleanup(); resolve({ w: side, detail: `${P[0].score} : ${P[1].score} ${hockey ? 'Tore' : 'Punkte'}` }); }, 1300);
      }
    }

    // ---------- Eingabe ----------
    const ptr = new Map();
    const setTarget = (q, X, Y) => {
      if (hockey) { q.tx = Math.max(q.i ? FL / 2 + RM : RM, Math.min(q.i ? FL - RM : FL / 2 - RM, X)); q.ty = Math.max(RM, Math.min(FW - RM, Y)); }
      else q.ty = Math.max(PL, Math.min(FW - PL, Y));
    };
    C.cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = C.cv.getBoundingClientRect(), [X, Y] = toField(e.clientX - r.left, e.clientY - r.top);
      const side = cpu ? 0 : X < FL / 2 ? 0 : 1;
      ptr.set(e.pointerId, side); setTarget(P[side], X, Y);
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => {
      const side = ptr.get(e.pointerId); if (side == null) return;
      const r = C.cv.getBoundingClientRect(), [X, Y] = toField(e.clientX - r.left, e.clientY - r.top);
      setTarget(P[side], X, Y);
    });
    const up = (e) => ptr.delete(e.pointerId);
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    const keys = new Set();
    const onKey = (e) => {
      const k = e.code, use = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k);
      if (!use) return; e.preventDefault();
      if (e.type === 'keydown') keys.add(k); else keys.delete(k);
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    function keyMove(dt) {
      const sets = [['KeyW', 'KeyS', 'KeyA', 'KeyD'], ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']];
      sets.forEach((s, i) => {
        if (cpu && i === 1) s = null;
        const q = P[cpu ? 0 : i]; if (!s) return;
        const sp = 900 * dt;
        let dy = (keys.has(s[1]) ? 1 : 0) - (keys.has(s[0]) ? 1 : 0), dx = (keys.has(s[3]) ? 1 : 0) - (keys.has(s[2]) ? 1 : 0);
        if (cpu && i === 0) { dy += (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0); dx += (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0); }
        if (!dx && !dy) return;
        setTarget(q, (hockey ? q.tx : q.x) + dx * sp, q.ty + dy * sp);
      });
    }
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    // ---------- Computer ----------
    function cpuThink(dt) {
      const q = P[1];
      if (!hockey) {
        if (ball.vx > 0) {
          const t = (q.x - PT / 2 - ball.x) / ball.vx;
          let yy = ball.y + ball.vy * t; const lo = 11, hi = FW - 11, span = hi - lo;
          yy = ((yy - lo) % (2 * span) + 2 * span) % (2 * span); yy = lo + (yy > span ? 2 * span - yy : yy);
          if (!q.err) q.err = (R() - 0.5) * (70 + hits * 6);
          q.ty = Math.max(PL, Math.min(FW - PL, yy + q.err));
        } else { q.err = 0; q.ty += (FW / 2 - q.ty) * Math.min(1, dt * 1.5); }
        return;
      }
      q.think = (q.think || 0) - dt; if (q.think > 0) return; q.think = 0.05 + R() * 0.05;
      if (ball.x > FL / 2 - 40) {
        if (q.x < ball.x - 6) { q.tx = Math.min(FL - RM, ball.x + 70); q.ty = ball.y + (q.y < ball.y ? -85 : 85); }
        else { const gx = 0 - ball.x, gy = FW / 2 + (R() - 0.5) * 160 - ball.y, d = Math.hypot(gx, gy) || 1; q.tx = ball.x - (gx / d) * (RM + RP - 34); q.ty = ball.y - (gy / d) * (RM + RP - 34); }
      } else { q.tx = FL - 115; q.ty = FW / 2 + (ball.y - FW / 2) * 0.55; }
      q.tx = Math.max(FL / 2 + RM, Math.min(FL - RM, q.tx)); q.ty = Math.max(RM, Math.min(FW - RM, q.ty));
    }

    // ---------- Physik ----------
    function stepPong(dt) {
      P.forEach((q) => { const sp = (cpu && q.i ? 560 : 2600) * dt; q.y += Math.max(-sp, Math.min(sp, q.ty - q.y)); });
      if (pause > 0 || !ball.spd) return;
      const n = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 7)), d = dt / n, r = 11;
      for (let s = 0; s < n; s++) {
        ball.x += ball.vx * d; ball.y += ball.vy * d;
        if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
        if (ball.y > FW - r) { ball.y = FW - r; ball.vy = -Math.abs(ball.vy); }
        for (const q of P) {
          const dir = q.i ? -1 : 1, face = q.x + dir * PT / 2;
          const coming = q.i ? ball.vx > 0 : ball.vx < 0;
          const reach = q.i ? ball.x + r >= face && ball.x + r <= face + 26 : ball.x - r <= face && ball.x - r >= face - 26;
          if (coming && reach && Math.abs(ball.y - q.y) <= PL + r) {
            const off = Math.max(-1, Math.min(1, (ball.y - q.y) / (PL + r))), a = off * 1.0;
            ball.spd = Math.min(1150, ball.spd * 1.055); hits++;
            ball.vx = Math.cos(a) * ball.spd * dir; ball.vy = Math.sin(a) * ball.spd;
            ball.x = face + dir * r; q.flash = 0.6; P[1].err = 0;
          }
        }
        if (ball.x < -r) return point(1);
        if (ball.x > FL + r) return point(0);
      }
    }
    function stepHockey(dt) {
      const n = 4, d = dt / n;
      for (let s = 0; s < n; s++) {
        for (const q of P) {
          const vmax = (cpu && q.i ? 880 : 3000) * d;
          let mx = q.tx - q.x, my = q.ty - q.y; const L = Math.hypot(mx, my);
          if (L > vmax) { mx *= vmax / L; my *= vmax / L; }
          const nx = Math.max(q.i ? FL / 2 + RM : RM, Math.min(q.i ? FL - RM : FL / 2 - RM, q.x + mx)), ny = Math.max(RM, Math.min(FW - RM, q.y + my));
          q.vx = (nx - q.x) / d; q.vy = (ny - q.y) / d; q.x = nx; q.y = ny;
        }
        if (pause > 0) continue;
        ball.x += ball.vx * d; ball.y += ball.vy * d;
        const fr = Math.exp(-0.32 * d); ball.vx *= fr; ball.vy *= fr;
        if (ball.y < RP) { ball.y = RP; ball.vy = Math.abs(ball.vy) * 0.9; }
        if (ball.y > FW - RP) { ball.y = FW - RP; ball.vy = -Math.abs(ball.vy) * 0.9; }
        const mouth = ball.y > G0 + RP * 0.35 && ball.y < G1 - RP * 0.35;
        if (ball.x < RP) { if (mouth) { if (ball.x < -RP * 0.2) return point(1); } else { ball.x = RP; ball.vx = Math.abs(ball.vx) * 0.9; } }
        if (ball.x > FL - RP) { if (mouth) { if (ball.x > FL + RP * 0.2) return point(0); } else { ball.x = FL - RP; ball.vx = -Math.abs(ball.vx) * 0.9; } }
        for (const q of P) {
          const dx = ball.x - q.x, dy = ball.y - q.y, dd = Math.hypot(dx, dy), min = RM + RP;
          if (dd < min && dd > 0.001) {
            const nx = dx / dd, ny = dy / dd;
            ball.x = q.x + nx * min; ball.y = q.y + ny * min;
            const rel = (ball.vx - q.vx) * nx + (ball.vy - q.vy) * ny;
            if (rel < 0) { ball.vx -= 1.9 * rel * nx; ball.vy -= 1.9 * rel * ny; q.flash = 0.5; }
            const sp = Math.hypot(ball.vx, ball.vy); if (sp > 1500) { ball.vx *= 1500 / sp; ball.vy *= 1500 / sp; }
          }
        }
      }
    }

    // ---------- Zeichnen ----------
    function drawTable() {
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.fillStyle = dark ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.55)'; x.fillRect(0, 0, FL, FW);
      x.strokeStyle = ink; x.lineWidth = 3.2;
      if (hockey) {
        pline(x, 0, 0, FL, 0, 1); pline(x, 0, FW, FL, FW, 2);
        pline(x, 0, 0, 0, G0, 3); pline(x, 0, G1, 0, FW, 4); pline(x, FL, 0, FL, G0, 5); pline(x, FL, G1, FL, FW, 6);
        x.lineWidth = 2; x.globalAlpha = 0.5; pline(x, FL / 2, 6, FL / 2, FW - 6, 7);
        pcirc(x, FL / 2, FW / 2, 70, 8); x.stroke();
        x.beginPath(); x.arc(0, FW / 2, 120, -Math.PI / 2, Math.PI / 2); x.stroke();
        x.beginPath(); x.arc(FL, FW / 2, 120, Math.PI / 2, Math.PI * 1.5); x.stroke();
        x.globalAlpha = 1;
        P.forEach((q) => { x.strokeStyle = q.p.color; x.lineWidth = 9; const gx = q.i ? FL + 2 : -2; pline(x, gx, G0, gx, G1, 9 + q.i, 0.8); });
      } else {
        prect(x, 0, 0, FL, FW, 11, 1.4); x.stroke();
        x.lineWidth = 2; x.globalAlpha = 0.45; x.setLineDash([14, 12]); pline(x, FL / 2, 8, FL / 2, FW - 8, 12, 0.6); x.setLineDash([]);
        pline(x, 0, FW / 2, FL, FW / 2, 13, 0.6); x.globalAlpha = 1;
      }
    }
    function drawBall() {
      const r = hockey ? RP : 11;
      if (!hockey) {
        ball.trail.push([ball.x, ball.y]); if (ball.trail.length > 9) ball.trail.shift();
        x.fillStyle = ink; ball.trail.forEach(([a, b], k) => { x.globalAlpha = (k / ball.trail.length) * 0.18; x.beginPath(); x.arc(a, b, 3 + k * 0.6, 0, Math.PI * 2); x.fill(); });
        x.globalAlpha = 1;
        x.fillStyle = dark ? '#f4f1e6' : '#fff'; pcirc(x, ball.x, ball.y, r, 21, 0.1); x.fill();
        x.strokeStyle = ink; x.lineWidth = 2.2; x.stroke();
        x.lineWidth = 1.2; x.globalAlpha = 0.6; x.beginPath(); x.arc(ball.x - 2, ball.y - 1, r * 0.5, 0.4, 2.2); x.stroke(); x.globalAlpha = 1;
        return;
      }
      x.fillStyle = dark ? '#cfd5e0' : '#3a3d44'; pcirc(x, ball.x, ball.y, r, 22, 0.05); x.fill();
      x.strokeStyle = ink; x.lineWidth = 2.4; x.stroke();
      x.strokeStyle = dark ? '#1b1f28' : '#fff'; x.globalAlpha = 0.5; x.lineWidth = 2; x.beginPath(); x.arc(ball.x, ball.y, r * 0.55, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
    }
    function drawPlayer(q) {
      const c = q.p.color;
      x.lineCap = 'round'; x.lineJoin = 'round';
      if (!hockey) {
        const X = q.x - PT / 2, Y = q.y - PL;
        x.fillStyle = shade(c, dark ? -0.1 : 0.55); prect(x, X, Y, PT, PL * 2, 30 + q.i, 0.8); x.fill();
        hatch(x, X, Y, PT, PL * 2, c, 5, 0.9, 1.6);
        x.strokeStyle = ink; x.lineWidth = 2.4; prect(x, X, Y, PT, PL * 2, 30 + q.i, 0.8); x.stroke();
        if (q.flash > 0) { x.strokeStyle = c; x.globalAlpha = q.flash; x.lineWidth = 3; x.beginPath(); x.arc(q.x, q.y, PL * 0.6 + (1 - q.flash) * 40, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
        return;
      }
      x.fillStyle = shade(c, dark ? -0.15 : 0.6); pcirc(x, q.x, q.y, RM, 40 + q.i, 0.05); x.fill();
      x.save(); pcirc(x, q.x, q.y, RM, 40 + q.i, 0.05); x.clip(); hatch(x, q.x - RM, q.y - RM, RM * 2, RM * 2, c, 6, 0.8, 1.8); x.restore();
      x.strokeStyle = ink; x.lineWidth = 2.6; pcirc(x, q.x, q.y, RM, 40 + q.i, 0.05); x.stroke();
      x.fillStyle = c; pcirc(x, q.x, q.y, RM * 0.45, 50 + q.i, 0.08); x.fill(); x.lineWidth = 2; x.stroke();
      if (q.flash > 0) { x.strokeStyle = c; x.globalAlpha = q.flash; x.lineWidth = 3; x.beginPath(); x.arc(q.x, q.y, RM + 6 + (1 - q.flash) * 30, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
    }
    function hud() {
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      const fs = Math.max(40, Math.min(120, FW * U * 0.32));
      P.forEach((q) => {
        const [sx, sy] = toScreen(q.i ? FL * 0.75 : FL * 0.25, FW / 2);
        x.save(); x.textAlign = 'center'; x.textBaseline = 'middle';
        x.globalAlpha = 0.16 + q.flash * 0.3; x.fillStyle = q.p.color; x.font = `800 ${fs}px ${FONT}`; x.fillText(String(q.score), sx, sy);
        x.globalAlpha = 0.55; x.fillStyle = ink; x.font = `700 ${Math.round(fs * 0.17)}px ${UIFONT}`;
        const nm = q.p.name.length > 16 ? q.p.name.slice(0, 15) + '…' : q.p.name; x.fillText(nm, sx, sy + fs * 0.55);
        x.restore();
      });
      if (count > 0) bigText(x, String(Math.ceil(count / 0.8)), C.cw / 2, C.ch / 2, dark);
      else if (msgT > 0) {
        x.save(); x.globalAlpha = Math.min(1, msgT * 3); x.font = `800 ${Math.round(Math.min(44, C.cw / 14))}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = x.measureText(msg).width + 40, hh = Math.min(44, C.cw / 14) + 26;
        x.fillStyle = dark ? 'rgba(27,31,40,.92)' : 'rgba(251,250,245,.94)'; x.strokeStyle = ink; x.lineWidth = 2;
        prect(x, C.cw / 2 - w / 2, C.ch / 2 - hh / 2, w, hh, 77, 1.2); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(msg, C.cw / 2, C.ch / 2 + 2); x.restore();
      }
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0); last = t;
      layout();
      if (count > 0) { count -= dt; if (count <= 0) { hint.classList.add('fade'); serve(serveTo); } }
      else if (!done) {
        keyMove(dt); if (cpu) cpuThink(dt);
        if (pause > 0) { pause -= dt; if (pause <= 0) serve(1 - serveTo); }
        if (hockey) stepHockey(dt); else stepPong(dt);
      }
      msgT = Math.max(0, msgT - dt); P.forEach((q) => { q.flash = Math.max(0, q.flash - dt * 2); });
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark);
      setT(); drawTable(); P.forEach(drawPlayer); if (pause <= 0 || hockey) drawBall();
      hud();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
export const pingpong = (fx, A, B, o = {}) => field(fx, A, B, o, 'pong');
export const hockey = (fx, A, B, o = {}) => field(fx, A, B, o, 'hockey');

// ======================================================================
// Schlangenduell und Leuchtspur: Raster-Spiele mit Dreh-Knöpfen
// ======================================================================
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
function padLayout(fx, list, title) {
  const wrap = h('div.sgwrap' + (list.length > 1 ? '' : '.solo'));
  const pads = list.map((p, i) => {
    const sc = h('span.sgscore');
    const mk = (d, lab, ic) => { const b = h('button.sgbtn', { 'aria-label': `${p.name}: ${lab}`, title: lab }, icon(ic), h('span', { text: lab })); return { b, d }; };
    const L = mk(-1, 'Links', 'turnl'), Rr = mk(1, 'Rechts', 'turnr');
    const el = h('div.sgpad', { style: { '--pc': p.color } }, chip(p), sc, h('div.sgbtns', null, L.b, Rr.b), h('small.sgkeys', { text: list.length > 1 ? (i ? 'Tasten K und L' : 'Tasten A und S') : 'Pfeiltasten ← →' }));
    return { el, sc, btns: [L, Rr] };
  });
  const boardHost = h('div.sgboard');
  wrap.append(...(pads.length > 1 ? [pads[0].el, boardHost, pads[1].el] : [boardHost, pads[0].el]));
  fx.stage.append(wrap);
  const rs = fx.stage.getBoundingClientRect(); wrap.classList.toggle('tall', rs.height > rs.width * 0.9);
  const C = canvasBox(boardHost);
  const ro = new ResizeObserver(() => { const r = wrap.getBoundingClientRect(); wrap.classList.toggle('tall', r.height > r.width * 0.9); });
  ro.observe(wrap);
  const r0 = wrap.getBoundingClientRect(); wrap.classList.toggle('tall', r0.height > r0.width * 0.9);
  return { wrap, pads, C, tall: r0.height > r0.width * 0.9, stop: () => { ro.disconnect(); C.ro.disconnect(); } };
}

function gridGame(fx, A, B, o, kind) {
  return new Promise((resolve) => {
    const snake = kind === 'snake', cpu = !!o.cpu && !!B, solo = !B;
    const list = B && !cpu ? [A, B] : [A];
    const dark = isDark(), ink = inkOf(dark);
    const L = padLayout(fx, list);
    const C = L.C, x = C.x;
    const asp = Math.max(0.5, Math.min(2.2, C.cw / Math.max(1, C.ch))), N = snake ? 560 : 2400;
    const GH = Math.max(12, Math.round(Math.sqrt(N / asp))), GW = Math.max(12, Math.round(GH * asp));   // Raster passend zur Fläche
    const R = rng((Math.random() * 1e9) | 0);
    const players = [A, B].filter(Boolean);
    let S = [], food = [], grid = null, tick = 0, acc = 0, count = 2.4, between = 0, roundMsg = '', raf = 0, last = 0, over = false, eaten = 0;
    const wins = players.map(() => 0);
    let round = 0;
    const rec = solo && snake ? store.get('gSnakeBest', 0) : 0;

    function newRound() {
      round++; acc = 0; eaten = 0;
      tick = snake ? 0.14 : 0.062;
      grid = new Int8Array(GW * GH);
      S = players.map((p, i) => {
        let sx, sy, d;
        if (snake) { if (solo) { sx = 5; sy = (GH / 2) | 0; d = 0; } else { sx = i ? GW - 6 : 5; sy = i ? 4 : GH - 5; d = i ? 2 : 0; } }
        else { sx = i ? GW - 8 : 7; sy = i ? 6 : GH - 7; d = i ? 1 : 3; if (solo) { sx = 7; sy = GH - 7; d = 3; } }
        const body = [];
        for (let k = 0; k < (snake ? 4 : 1); k++) body.push([sx - DX[d] * k, sy - DY[d] * k]);
        const s = { p, i, d, q: [], body, prevTail: null, alive: true, pts: [[sx, sy]], score: 0, bot: cpu && i === 1, die: 0 };
        if (!snake) grid[sy * GW + sx] = i + 1;
        return s;
      });
      food = [];
      if (snake) for (let k = 0; k < (solo ? 2 : 3); k++) addFood();
      updPads();
    }
    function free(cx, cy) { if (S.some((s) => s.body.some(([a, b]) => a === cx && b === cy))) return false; return !food.some((f) => f.x === cx && f.y === cy); }
    function addFood() { for (let k = 0; k < 200; k++) { const fx2 = 1 + ((R() * (GW - 2)) | 0), fy = 1 + ((R() * (GH - 2)) | 0); if (free(fx2, fy)) { food.push({ x: fx2, y: fy, t: 0, seed: (R() * 1e6) | 0 }); return; } } }
    function turn(i, d) { const s = S[i]; if (!s || !s.alive || count > 0 || between > 0 || s.bot) return; if (s.q.length < 3) s.q.push(d); }
    function updPads() {
      L.pads.forEach((pd, i) => {
        if (solo && snake) pd.sc.textContent = `${S[0] ? S[0].score : 0} Äpfel` + (rec ? ` · Rekord ${rec}` : '');
        else if (cpu) pd.sc.textContent = `Runden ${wins[0]} : ${wins[1]} gegen Computer`;
        else pd.sc.textContent = `${wins[i]} ${wins[i] === 1 ? 'Runde' : 'Runden'}`;
      });
    }
    L.pads.forEach((pd, i) => pd.btns.forEach(({ b, d }) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 140); turn(i, d); })));
    const onKey = (e) => {
      if (e.repeat) return;
      const map = list.length > 1 ? { KeyA: [0, -1], KeyS: [0, 1], KeyK: [1, -1], KeyL: [1, 1] } : { ArrowLeft: [0, -1], ArrowRight: [0, 1], KeyA: [0, -1], KeyS: [0, 1], KeyD: [0, 1] };
      const m = map[e.code]; if (!m) return; e.preventDefault(); turn(m[0], m[1]);
    };
    document.addEventListener('keydown', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); L.stop(); document.removeEventListener('keydown', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    // Computer für Leuchtspur: Richtung mit dem meisten freien Platz
    function room(sx, sy, lim) {
      if (sx < 0 || sy < 0 || sx >= GW || sy >= GH || grid[sy * GW + sx]) return 0;
      const seen = new Uint8Array(GW * GH), st = [sy * GW + sx]; seen[st[0]] = 1; let n = 0;
      while (st.length && n < lim) { const c = st.pop(); n++; const cx = c % GW, cy = (c / GW) | 0; for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const j = ny * GW + nx; if (!seen[j] && !grid[j]) { seen[j] = 1; st.push(j); } } }
      return n;
    }
    function botMove(s) {
      const [hx, hy] = s.body[0], opp = S[0];
      let best = 0, bestV = -1;
      for (const t of [0, -1, 1]) {
        const d = (s.d + t + 4) % 4, nx = hx + DX[d], ny = hy + DY[d];
        let v = room(nx, ny, 420);
        if (v > 0) { v += t === 0 ? 6 : 0; v += R() * 8; const [ax, ay] = opp.body[0]; v -= Math.hypot(nx - ax, ny - ay) * 0.15; }
        if (v > bestV) { bestV = v; best = t; }
      }
      if (best) s.q = [best];
    }

    function step() {
      const alive = S.filter((s) => s.alive);
      alive.forEach((s) => { if (s.bot) botMove(s); if (s.q.length) s.d = (s.d + s.q.shift() + 4) % 4; });
      const heads = alive.map((s) => [s.body[0][0] + DX[s.d], s.body[0][1] + DY[s.d]]);
      const dead = new Set();
      if (snake) {
        const occ = new Set();
        S.forEach((s) => { const grow = food.some((f) => f.x === s.body[0][0] + DX[s.d] && f.y === s.body[0][1] + DY[s.d]); s.body.forEach(([a, b], k) => { if (k === s.body.length - 1 && !grow && s.alive) return; occ.add(a + ',' + b); }); });
        alive.forEach((s, k) => { const [a, b] = heads[k]; if (a < 0 || b < 0 || a >= GW || b >= GH || occ.has(a + ',' + b)) dead.add(s); });
      } else {
        alive.forEach((s, k) => { const [a, b] = heads[k]; if (a < 0 || b < 0 || a >= GW || b >= GH || grid[b * GW + a]) dead.add(s); });
      }
      for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) if (heads[a][0] === heads[b][0] && heads[a][1] === heads[b][1]) { dead.add(alive[a]); dead.add(alive[b]); }
      alive.forEach((s, k) => {
        if (dead.has(s)) { s.alive = false; s.die = 1; s.prevTail = null; return; }
        const [a, b] = heads[k];
        s.body.unshift([a, b]);
        if (snake) {
          const fi = food.findIndex((f) => f.x === a && f.y === b);
          if (fi >= 0) { food.splice(fi, 1); s.score++; eaten++; s.grow = (s.grow || 0) + 1; addFood(); tick = Math.max(0.075, tick - 0.0025); updPads(); }
          if (s.grow) { s.grow--; s.prevTail = null; } else s.prevTail = s.body.pop();
        } else { grid[b * GW + a] = s.i + 1; s.body.length = 1; s.pts.push([a, b]); }
      });
      if (!snake) tick = Math.max(0.042, tick - 0.00006);
      if (!dead.size) return;
      // Runde vorbei?
      if (solo && snake) { over = true; setTimeout(() => { cleanup(); resolve({ score: S[0].score }); }, 1100); return; }
      const left = S.filter((s) => s.alive);
      if (left.length > 1) return;
      const wi = left.length === 1 ? left[0].i : -1;
      if (wi >= 0) wins[wi]++;
      updPads();
      const champ = wins.findIndex((w) => w >= 2);
      if (champ >= 0 || round >= 5) {
        over = true;
        roundMsg = champ >= 0 ? `${players[champ].name} gewinnt!` : 'Unentschieden';
        between = 9;
        setTimeout(() => { cleanup(); resolve({ w: wins[0] > wins[1] ? 0 : wins[1] > wins[0] ? 1 : null, detail: `${wins[0]} : ${wins[1]} Runden` }); }, 1500);
        return;
      }
      roundMsg = wi >= 0 ? `Runde für ${players[wi].name}` : 'Beide raus: Runde zählt nicht';
      between = 1.6;
    }

    // ---------- Zeichnen ----------
    let cs = 10, bx = 0, by = 0;
    const cx = (gx) => bx + (gx + 0.5) * cs, cy = (gy) => by + (gy + 0.5) * cs;
    function drawSnake(s, f) {
      const c = s.p.color, b = s.body;
      const pts = [];
      const hd = s.alive && !over && between <= 0 && count <= 0 && b.length > 1 ? [b[1][0] + (b[0][0] - b[1][0]) * f, b[1][1] + (b[0][1] - b[1][1]) * f] : b[0];
      pts.push(hd); for (let k = 1; k < b.length; k++) pts.push(b[k]);
      if (s.prevTail && s.alive) { const t = b[b.length - 1]; pts.push([s.prevTail[0] + (t[0] - s.prevTail[0]) * f, s.prevTail[1] + (t[1] - s.prevTail[1]) * f]); }
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      if (!s.alive) x.globalAlpha = 0.45;
      const path = () => { x.beginPath(); pts.forEach(([a, bb], k) => (k ? x.lineTo(cx(a), cy(bb)) : x.moveTo(cx(a), cy(bb)))); };
      x.strokeStyle = ink; x.lineWidth = cs * 0.72 + 4; path(); x.stroke();
      x.strokeStyle = shade(c, dark ? -0.05 : 0.25); x.lineWidth = cs * 0.72; path(); x.stroke();
      x.strokeStyle = shade(c, dark ? 0.35 : -0.25); x.lineWidth = Math.max(1.2, cs * 0.1); x.setLineDash([cs * 0.25, cs * 0.35]); path(); x.stroke(); x.setLineDash([]);
      // Kopf mit Augen
      const [ha, hb] = hd, X = cx(ha), Y = cy(hb), d = s.d, px = -DY[d], py = DX[d];
      x.fillStyle = shade(c, dark ? -0.05 : 0.25); x.strokeStyle = ink; x.lineWidth = 2; pcirc(x, X, Y, cs * 0.5, 3 + s.i, 0.1); x.fill(); x.stroke();
      for (const sgn of [-1, 1]) {
        const ex = X + DX[d] * cs * 0.12 + px * sgn * cs * 0.2, ey = Y + DY[d] * cs * 0.12 + py * sgn * cs * 0.2;
        x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.beginPath(); x.arc(ex, ey, cs * 0.13, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = ink; x.beginPath(); x.arc(ex + DX[d] * cs * 0.04, ey + DY[d] * cs * 0.04, cs * 0.06, 0, Math.PI * 2); x.fill();
      }
      if (!s.alive) { x.globalAlpha = 1; x.strokeStyle = '#d33'; x.lineWidth = 3; pline(x, X - cs * 0.4, Y - cs * 0.4, X + cs * 0.4, Y + cs * 0.4, 5, 0.5); pline(x, X + cs * 0.4, Y - cs * 0.4, X - cs * 0.4, Y + cs * 0.4, 6, 0.5); }
      x.restore();
    }
    function drawTrail(s, f) {
      const c = s.p.color, pts = s.pts.slice();
      if (s.alive && !over && between <= 0 && count <= 0 && pts.length) { const [a, b] = pts[pts.length - 1]; pts.push([a + DX[s.d] * f, b + DY[s.d] * f]); }
      x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
      const path = () => { x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(cx(a), cy(b)) : x.moveTo(cx(a), cy(b)))); };
      if (dark) { x.shadowColor = c; x.shadowBlur = cs * 1.2; }
      x.globalAlpha = dark ? 0.85 : 0.5; x.strokeStyle = c; x.lineWidth = cs * 0.95; path(); x.stroke();
      x.shadowBlur = 0; x.globalAlpha = dark ? 0.9 : 0.75; x.strokeStyle = shade(c, dark ? 0.5 : -0.2); x.lineWidth = Math.max(1, cs * 0.18); path(); x.stroke();
      x.globalAlpha = 1;
      // Textmarker-Spitze
      const [a, b] = pts[pts.length - 1], X = cx(a), Y = cy(b), d = s.d;
      x.translate(X, Y); x.rotate(Math.atan2(DY[d], DX[d]));
      x.fillStyle = c; x.strokeStyle = ink; x.lineWidth = 2;
      prect(x, -cs * 2.2, -cs * 0.85, cs * 1.7, cs * 1.7, 9 + s.i, 0.6); x.fill(); x.stroke();
      x.fillStyle = shade(c, 0.4); x.beginPath(); x.moveTo(-cs * 0.5, -cs * 0.6); x.lineTo(cs * 0.45, -cs * 0.25); x.lineTo(cs * 0.45, cs * 0.25); x.lineTo(-cs * 0.5, cs * 0.6); x.closePath(); x.fill(); x.stroke();
      if (!s.alive) { x.rotate(-Math.atan2(DY[d], DX[d])); x.strokeStyle = '#d33'; x.lineWidth = 3; pline(x, -cs, -cs, cs, cs, 7, 0.5); pline(x, cs, -cs, -cs, cs, 8, 0.5); }
      x.restore();
    }
    function drawFood(fd, t) {
      const X = cx(fd.x), Y = cy(fd.y), r = cs * 0.36 * (1 + Math.sin(t * 4 + fd.seed) * 0.05);
      x.save(); x.fillStyle = '#e0483e'; pcirc(x, X, Y + cs * 0.04, r, fd.seed, 0.12); x.fill();
      hatch(x, X - r, Y - r, r * 2, r * 2, '#a52a22', 4, 0.5, 1);
      x.strokeStyle = ink; x.lineWidth = 1.8; pcirc(x, X, Y + cs * 0.04, r, fd.seed, 0.12); x.stroke();
      x.beginPath(); x.moveTo(X, Y - r * 0.8); x.lineTo(X + r * 0.2, Y - r * 1.4); x.stroke();
      x.fillStyle = '#3aa35b'; x.beginPath(); x.ellipse(X + r * 0.55, Y - r * 1.15, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2); x.fill(); x.stroke();
      x.restore();
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      if (count > 0) count -= dt;
      else if (between > 0) { between -= dt; if (between <= 0 && !over) { count = 1.6; newRound(); } }
      else if (!over) { acc += dt; let guard = 0; while (acc >= tick && guard++ < 4 && between <= 0 && !over) { acc -= tick; step(); } }
      S.forEach((s) => { s.die = Math.max(0, s.die - dt); });
      const xx = C.begin();
      cs = Math.max(4, Math.floor(Math.min((C.cw - 16) / GW, (C.ch - 16) / GH)));
      bx = Math.round((C.cw - GW * cs) / 2); by = Math.round((C.ch - GH * cs) / 2);
      paper(xx, C.cw, C.ch, dark, snake ? cs : cs * 2, bx, by);
      x.strokeStyle = ink; x.lineWidth = 3; x.lineCap = 'round'; prect(x, bx - 2, by - 2, GW * cs + 4, GH * cs + 4, 91, 1.2); x.stroke();
      const f = Math.min(1, acc / tick);
      if (snake) { food.forEach((fd) => drawFood(fd, t / 1000)); S.forEach((s) => drawSnake(s, f)); }
      else S.forEach((s) => drawTrail(s, f));
      if (count > 0) {
        const txt = String(Math.ceil(count / 0.8));
        x.save(); x.fillStyle = dark ? 'rgba(27,31,40,.7)' : 'rgba(251,250,245,.75)'; x.beginPath(); x.arc(C.cw / 2, C.ch / 2, 54, 0, Math.PI * 2); x.fill(); x.restore();
        bigText(x, txt, C.cw / 2, C.ch / 2, dark, 60);
      } else if (between > 0 && roundMsg) {
        x.save(); const fs = Math.round(Math.max(20, Math.min(38, C.cw / 18)));
        x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 24, x.measureText(roundMsg).width + 44), hh = fs + 28;
        x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
        prect(x, C.cw / 2 - w / 2, C.ch / 2 - hh / 2, w, hh, 44, 1.2); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(roundMsg, C.cw / 2, C.ch / 2 + 2, w - 24); x.restore();
      }
      raf = requestAnimationFrame(frame);
    }
    newRound();
    raf = requestAnimationFrame(frame);
  });
}
export const snakeDuel = (fx, A, B, o = {}) => gridGame(fx, A, B, o, 'snake');
export const snakeSolo = (fx, p) => gridGame(fx, p, null, {}, 'snake');
export const trail = (fx, A, B, o = {}) => gridGame(fx, A, B, o, 'trail');
