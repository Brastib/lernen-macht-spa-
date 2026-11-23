// Paket 7 (Teil 4): Kritzel-Kart. Golfwagen-Rennen auf einem gemalten Golfplatz, ganz ohne Tastatur.
// Die Wagen fahren von selbst, man lenkt mit zwei Knöpfen. Tintenfässer einsammeln und dann
// Hindernisse quer auf die Strecke malen. Sand bremst, im Teich muss man neu starten.
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, pcirc, prect, hatch, shade, canvasBox, chip, rng, store } from './sketch.js';
import { banner, fit, toWorld, drawTrackSheet } from './p6a.js';

const RW = 1000, RH = 640, ROAD = 96, LAPS = 3, MAXINK = 2, LINE_T = 8, LINE_LEN = 170;
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l; t = Math.max(0, Math.min(1, t)); const qx = ax + dx * t, qy = ay + dy * t; return [Math.hypot(px - qx, py - qy), qx, qy]; };

export function kart(fx, A, B, o = {}) {
  return (async () => {
    const R = rng((Math.random() * 1e9) | 0);
    const { mapPicker, carImage } = await import('./hub.js');
    const track = await drawTrackSheet(fx, A, R, { picker: (pick) => mapPicker('race', [A, B], pick) });
    if (!track || fx.signal.aborted) return null;
    return kartRun(fx, A, B, track, R, !!o.cpu, carImage);
  })();
}

function kartRun(fx, A, B, track, R, cpu, carImage) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), n = track.length;
    const near = (px, py) => { let bd = 1e9, bi = 0; for (let i = 0; i < n; i++) { const d = Math.hypot(track[i][0] - px, track[i][1] - py); if (d < bd) { bd = d; bi = i; } } return [bi, bd]; };
    // ---------- Platz: Sand, Teiche, Tintenfässer ----------
    const bunkers = [], ponds = [], pots = [];
    for (let k = 0; k < 3; k++) { const i = Math.floor(((k + 0.35 + R() * 0.3) / 3) * n), [px, py] = track[i]; bunkers.push({ x: px + (R() - 0.5) * 30, y: py + (R() - 0.5) * 30, r: 30 + R() * 10, seed: k * 17 }); }
    for (let k = 0; k < 40 && ponds.length < 3; k++) {
      const i = (R() * n) | 0, a = Math.atan2(track[(i + 1) % n][1] - track[i][1], track[(i + 1) % n][0] - track[i][0]), side = R() < 0.5 ? 1 : -1;
      const off = ROAD / 2 + 40 + R() * 30, px = track[i][0] - Math.sin(a) * off * side, py = track[i][1] + Math.cos(a) * off * side, rx = 34 + R() * 18, ry = 22 + R() * 10;
      if (px < rx + 10 || py < ry + 10 || px > RW - rx - 10 || py > RH - ry - 10) continue;
      if (near(px, py)[1] < ROAD / 2 + Math.max(rx, ry) - 6) continue;
      if (ponds.some((q) => Math.hypot(q.x - px, q.y - py) < 120)) continue;
      ponds.push({ x: px, y: py, rx, ry, a: R() * Math.PI });
    }
    for (let k = 0; k < 4; k++) { const i = Math.floor(((k + 0.6) / 4) * n) % n; pots.push({ i, x: track[i][0], y: track[i][1], t: 0 }); }
    const inPond = (px, py) => ponds.some((q) => { const c = Math.cos(-q.a), s = Math.sin(-q.a), dx = px - q.x, dy = py - q.y, u = dx * c - dy * s, v = dx * s + dy * c; return (u * u) / (q.rx * q.rx) + (v * v) / (q.ry * q.ry) < 0.8; });
    const inSand = (px, py) => bunkers.some((b) => Math.hypot(px - b.x, py - b.y) < b.r);

    // ---------- Wagen ----------
    const a0 = Math.atan2(track[1][1] - track[0][1], track[1][0] - track[0][0]), nx0 = -Math.sin(a0), ny0 = Math.cos(a0);
    const list = [A, B];
    const karts = list.map((p, i) => ({ p, i, x: track[0][0] - Math.cos(a0) * 30 + nx0 * (i ? 20 : -20), y: track[0][1] - Math.sin(a0) * 30 + ny0 * (i ? 20 : -20), a: a0, v: 0, idx: 0, prog: 0, lap: 0, done: false, time: 0, ink: 0, armed: false, sink: 0, spin: 0, steer: 0, cpu: cpu && i === 1, img: carImage ? carImage(p.name) : null, trail: [] }));
    const lines = [];
    let count = 3.2, t = 0, raf = 0, last = 0, over = false, msg = '', msgT = 0, drawing = null, lastArm = null;

    // ---------- Oberfläche ----------
    const stats = h('div.hsstats');
    const host = h('div.hsarea.gkfield');
    const pad = (c, side) => {
      const mk = (d, ic, lab) => { const b = h('button.gkbtn', { 'aria-label': lab }, icon(ic)); const set = (v) => { c.keys[d] = v; b.classList.toggle('on', !!v); }; b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(1); try { b.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => set(0))); b.addEventListener('contextmenu', (e) => e.preventDefault()); return b; };
      c.keys = [0, 0];
      c.inkBtn = h('button.gkink', { on: { click: () => arm(c) } }, icon('pen'), h('span'));
      const L = mk(0, 'left', 'Links lenken'), Rt = mk(1, 'right', 'Rechts lenken');
      return h('div.gkpad.' + side, { style: { '--pc': c.p.color } }, chip(c.p), h('div.gkrow', null, ...(side === 'r' ? [c.inkBtn, L, Rt] : [L, Rt, c.inkBtn])));
    };
    const pads = karts.filter((c) => !c.cpu).map((c, i) => pad(c, i ? 'r' : 'l'));
    const hint = h('p.hshint', { text: 'Die Wagen fahren von selbst, ihr lenkt nur. Tintenfass einsammeln, dann „Malen“ drücken und einen Strich quer über die Strecke ziehen.' });
    fx.stage.replaceChildren(h('div.hswrap.gkwrap', null, h('div.hshud', null, stats), hint, host, h('div.gkpads', null, ...pads)));
    const C = canvasBox(host), x = C.x;
    function arm(c) { if (!c.ink || over || count > 0) return; c.armed = !c.armed; lastArm = c.armed ? c : karts.find((q) => q.armed) || null; syncPads(); }
    function syncPads() { karts.forEach((c) => { if (!c.inkBtn) return; c.inkBtn.disabled = !c.ink; c.inkBtn.classList.toggle('on', c.armed); c.inkBtn.lastChild.textContent = c.armed ? 'Jetzt malen!' : `Malen ×${c.ink}`; }); }
    const fmt = (s) => (s ? s.toFixed(2).replace('.', ',') + ' s' : '–');
    const upd = () => stats.replaceChildren(...karts.map((c) => h('span.hsstat.rcstat', { style: { '--pc': c.p.color } }, h('small', { text: c.p.name }), h('b', { text: c.done ? 'Ziel!' : `Runde ${Math.min(LAPS, c.lap + 1)}/${LAPS}` }))), h('span.hsstat', null, h('small', { text: 'Zeit' }), h('b', { text: fmt(t) })));
    // Malen auf der Strecke
    C.cv.addEventListener('pointerdown', (e) => {
      const who = lastArm && lastArm.armed ? lastArm : karts.find((q) => q.armed && !q.cpu);
      if (!who) return; e.preventDefault();
      const g = fit(C, RW, RH); drawing = { who, pts: [toWorld(C, g, e)], len: 0 };
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => {
      if (!drawing) return; const g = fit(C, RW, RH), q = toWorld(C, g, e), l = drawing.pts[drawing.pts.length - 1], d = Math.hypot(q[0] - l[0], q[1] - l[1]);
      if (d > 8 && drawing.len + d <= LINE_LEN) { drawing.pts.push(q); drawing.len += d; }
    });
    const up = () => { if (!drawing) return; const d = drawing; drawing = null; if (d.len < 30) return; addLine(d.who, d.pts); };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    function addLine(c, pts) {
      lines.push({ pts, owner: c.i, t: LINE_T, hp: 2, seed: (R() * 1e5) | 0 });
      c.ink--; c.armed = false; if (lastArm === c) lastArm = null; syncPads();
      msg = `${c.p.name} malt ein Hindernis!`; msgT = 1.1;
    }
    const keyMap = { KeyA: [0, 0], KeyD: [0, 1], ArrowLeft: [1, 0], ArrowRight: [1, 1] };
    const kd = (e) => { let m = keyMap[e.code]; if (!m) { if (e.code === 'KeyW' || e.code === 'ShiftLeft') arm(karts[0]); else if ((e.code === 'ArrowUp' || e.code === 'ShiftRight') && !karts[1].cpu) arm(karts[1]); return; } if (karts[1].cpu && m[0] === 1) m = [0, m[1]]; const c = karts[m[0]]; if (c.cpu) return; e.preventDefault(); c.keys[m[1]] = e.type === 'keydown' ? 1 : 0; };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', kd);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', kd); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });

    // ---------- Fahren ----------
    function nearestFrom(c) { let best = c.idx, bd = 1e9; for (let k = -14; k <= 14; k++) { const j = (c.idx + k + n) % n, d = Math.hypot(track[j][0] - c.x, track[j][1] - c.y); if (d < bd) { bd = d; best = j; } } return [best, bd]; }
    function cpuThink(c, dt) {
      const look = track[(c.idx + 7) % n], want = Math.atan2(look[1] - c.y, look[0] - c.x);
      let d = want - c.a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      // Hindernissen ausweichen
      for (const L of lines) for (let i = 1; i < L.pts.length; i++) { const ahead = [c.x + Math.cos(c.a) * 60, c.y + Math.sin(c.a) * 60]; const [dd] = segDist(ahead[0], ahead[1], L.pts[i - 1][0], L.pts[i - 1][1], L.pts[i][0], L.pts[i][1]); if (dd < 26) d += (d >= 0 ? 0.9 : -0.9); }
      c.steer = Math.max(-1, Math.min(1, d * 2.4));
      // Hindernis hinter sich malen, wenn der Gegner knapp dahinter ist
      const foe = karts[1 - c.i];
      if (c.ink && !foe.done && c.prog - foe.prog > 4 && c.prog - foe.prog < 40 && R() < dt * 0.8) {
        const j = (c.idx - 4 + n) % n, [px, py] = track[j], a = Math.atan2(track[(j + 1) % n][1] - py, track[(j + 1) % n][0] - px), side = R() < 0.5 ? 1 : -1, nx = -Math.sin(a), ny = Math.cos(a), off = side * 14;
        addLine(c, [[px + nx * (off - 30), py + ny * (off - 30)], [px + nx * (off + 30), py + ny * (off + 30)]]);
      }
    }
    function step(dt) {
      t += dt;
      for (const c of karts) {
        if (c.done) { c.v *= 0.95; c.x += Math.cos(c.a) * c.v * dt; c.y += Math.sin(c.a) * c.v * dt; continue; }
        if (c.sink > 0) { c.sink -= dt; if (c.sink <= 0) { const [j] = near(c.x, c.y), q = track[j], q2 = track[(j + 1) % n]; c.x = q[0]; c.y = q[1]; c.a = Math.atan2(q2[1] - q[1], q2[0] - q[0]); c.v = 0; } continue; }
        if (c.cpu) cpuThink(c, dt); else c.steer = c.keys[1] - c.keys[0];
        const [j, dist] = nearestFrom(c), off = dist > ROAD / 2, sand = inSand(c.x, c.y);
        const top = (off ? 120 : sand ? 125 : 225) * (c.cpu ? 0.96 : 1);
        c.v += (top - c.v) * Math.min(1, dt * (c.v > top ? 3.5 : 1.3));
        if (c.spin > 0) { c.spin -= dt; c.a += dt * 9; }
        else c.a += c.steer * dt * 2.7 * Math.min(1, Math.max(0.3, c.v / 140));
        const ox = c.x, oy = c.y;
        c.x += Math.cos(c.a) * c.v * dt; c.y += Math.sin(c.a) * c.v * dt;
        { const qx = Math.max(20, Math.min(RW - 20, c.x)), qy = Math.max(20, Math.min(RH - 20, c.y)); if (qx !== c.x || qy !== c.y) c.v *= 0.6; c.x = qx; c.y = qy; }
        // gemalte Hindernisse
        for (const L of lines) for (let i = 1; i < L.pts.length; i++) {
          const [dd, qx, qy] = segDist(c.x, c.y, L.pts[i - 1][0], L.pts[i - 1][1], L.pts[i][0], L.pts[i][1]);
          if (dd < 15) { const nx = (c.x - qx) / (dd || 1), ny = (c.y - qy) / (dd || 1); c.x = ox + nx * 4; c.y = oy + ny * 4; c.v *= 0.25; c.spin = 0.35; L.hp--; if (L.hp <= 0) L.t = Math.min(L.t, 0.4); msg = 'Krach!'; msgT = 0.6; break; }
        }
        if (inPond(c.x, c.y)) { c.sink = 1.1; c.v = 0; msg = `${c.p.name}: Platsch!`; msgT = 1.1; continue; }
        if (sand && c.v > 60 && R() < 0.6) c.trail.push([c.x - Math.cos(c.a) * 14, c.y - Math.sin(c.a) * 14, 1, 1]);
        else if (Math.abs(c.steer) > 0.5 && c.v > 180 && R() < 0.3) c.trail.push([c.x, c.y, 1, 0]);
        c.trail.forEach((s) => { s[2] -= dt * 0.5; }); c.trail = c.trail.filter((s) => s[2] > 0).slice(-120);
        // Tintenfässer
        for (const pt of pots) if (pt.t <= 0 && Math.hypot(pt.x - c.x, pt.y - c.y) < 24) { pt.t = 6; if (c.ink < MAXINK) { c.ink++; syncPads(); } if (!c.cpu) { msg = `${c.p.name} hat Tinte!`; msgT = 0.9; } }
        // Runden
        let d = j - c.idx; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
        c.prog += d; c.idx = j;
        if (c.prog >= n * (c.lap + 1)) {
          c.lap++;
          if (c.lap >= LAPS) { c.done = true; c.time = t; msg = `${c.p.name} ist im Ziel!`; msgT = 2; }
          else { msg = `${c.p.name}: Runde ${c.lap + 1}`; msgT = 1; }
          upd();
        }
      }
      { const [p, q] = karts, dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d < 30 && d > 0 && !p.sink && !q.sink) { const o2 = (30 - d) / 2; p.x -= dx / d * o2; p.y -= dy / d * o2; q.x += dx / d * o2; q.y += dy / d * o2; p.v *= 0.97; q.v *= 0.97; } }
      for (const pt of pots) pt.t -= dt;
      for (const L of lines) L.t -= dt;
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].t <= 0) lines.splice(i, 1);
      if (!over && karts.some((c) => c.done)) {
        over = true;
        const w = karts.filter((c) => c.done).sort((a, b) => a.time - b.time)[0];
        setTimeout(() => { cleanup(); resolve({ w: w.i, detail: `${w.p.name} gewinnt in ${fmt(w.time)}` }); }, 1800);
      }
    }

    // ---------- Zeichnen ----------
    function drawCourse() {
      x.fillStyle = dark ? 'rgba(70,150,90,.14)' : 'rgba(90,180,100,.16)'; x.fillRect(0, 0, RW, RH);
      x.save(); x.beginPath(); x.rect(0, 0, RW, RH); x.clip(); hatch(x, 0, 0, RW, RH, dark ? '#4e9a63' : '#6cbf7d', 14, dark ? 0.12 : 0.16, 1); x.restore();
      for (const q of ponds) {
        x.save(); x.translate(q.x, q.y); x.rotate(q.a);
        x.fillStyle = dark ? 'rgba(80,140,255,.35)' : 'rgba(110,170,255,.45)'; x.beginPath(); x.ellipse(0, 0, q.rx, q.ry, 0, 0, 7); x.fill();
        x.strokeStyle = dark ? '#7fb6f2' : '#3d7fd9'; x.lineWidth = 2.4; x.beginPath(); x.ellipse(0, 0, q.rx, q.ry, 0, 0, 7); x.stroke();
        x.lineWidth = 1.5; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(-q.rx * 0.45, k * q.ry * 0.35); x.quadraticCurveTo(-q.rx * 0.2, k * q.ry * 0.35 - 4, 0, k * q.ry * 0.35); x.quadraticCurveTo(q.rx * 0.2, k * q.ry * 0.35 + 4, q.rx * 0.45, k * q.ry * 0.35); x.stroke(); }
        x.restore();
      }
      const path = () => { x.beginPath(); track.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = ink; x.lineWidth = ROAD + 6; path(); x.stroke();
      x.strokeStyle = dark ? '#2f6b43' : '#a6e0a8'; x.lineWidth = ROAD; path(); x.stroke();
      x.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.45)'; x.lineWidth = ROAD * 0.5; x.setLineDash([26, 26]); path(); x.stroke(); x.setLineDash([]);   // gemähte Streifen
      for (const b of bunkers) {
        x.fillStyle = dark ? '#8a7a52' : '#efd99a'; x.strokeStyle = dark ? '#c9b37a' : '#b8964a'; x.lineWidth = 2;
        pcirc(x, b.x, b.y, b.r, b.seed, 0.12); x.fill(); x.stroke();
        x.fillStyle = dark ? 'rgba(0,0,0,.25)' : 'rgba(150,110,40,.35)'; for (let k = 0; k < 14; k++) { const a = k * 2.4, r = (k % 5) / 5 * b.r * 0.8; x.fillRect(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 2, 2); }
      }
      // Start/Ziel und Fähnchen
      const [ax, ay] = track[0], [bx, by] = track[1], a = Math.atan2(by - ay, bx - ax);
      x.save(); x.translate(ax, ay); x.rotate(a);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#26262b'; x.fillRect(-6 + j * 6, -ROAD / 2 + i * ROAD / 8, 6, ROAD / 8); }
      x.restore();
      for (let k = 1; k <= 3; k++) {
        const i = Math.floor((k / 4) * n), q = track[i], q2 = track[(i + 1) % n], aa = Math.atan2(q2[1] - q[1], q2[0] - q[0]), fx0 = q[0] - Math.sin(aa) * (ROAD / 2 + 16), fy0 = q[1] + Math.cos(aa) * (ROAD / 2 + 16);
        x.strokeStyle = ink; x.lineWidth = 2; pline(x, fx0, fy0, fx0, fy0 - 30, k, 0.3);
        x.fillStyle = '#e0483e'; x.beginPath(); x.moveTo(fx0, fy0 - 30); x.lineTo(fx0 + 16, fy0 - 25); x.lineTo(fx0, fy0 - 19); x.closePath(); x.fill(); x.stroke();
        x.font = `700 11px ${FONT}`; x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(String(k), fx0 + 6, fy0 - 21.5);
      }
    }
    function drawPot(pt, tm) {
      if (pt.t > 0) return;
      const bob = Math.sin(tm / 260 + pt.i) * 2;
      x.save(); x.translate(pt.x, pt.y + bob);
      x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(2, 12 - bob, 12, 4, 0, 0, 7); x.fill();
      x.fillStyle = '#2b3b66'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, -10, -8, 20, 18, pt.i, 0.4); x.fill(); x.stroke();
      x.fillStyle = '#c9a66b'; x.fillRect(-5, -14, 10, 6); x.strokeRect(-5, -14, 10, 6);
      x.fillStyle = '#fff'; x.font = `800 11px ${FONT}`; x.textAlign = 'center'; x.fillText('Ink', 0, 5);
      x.restore();
    }
    function drawKart(c, tm) {
      if (c.sink > 0) { x.save(); x.globalAlpha = Math.max(0, c.sink - 0.1); x.strokeStyle = dark ? '#7fb6f2' : '#3d7fd9'; x.lineWidth = 2.5; for (let r = 0; r < 3; r++) { x.beginPath(); x.arc(c.x, c.y, 8 + r * 9 + (1.1 - c.sink) * 20, 0, 7); x.stroke(); } x.restore(); return; }
      x.save(); x.translate(c.x, c.y); x.rotate(c.a);
      if (c.img) { x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(2, 3, 19, 12, 0, 0, 7); x.fill(); x.drawImage(c.img, -22, -22, 44, 44); x.restore(); return; }
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(-16, -9, 36, 22);
      x.fillStyle = ink; [[-13, -13], [-13, 10], [8, -13], [8, 10]].forEach(([a, b]) => x.fillRect(a, b, 8, 4));
      x.fillStyle = dark ? '#e9e4da' : '#fff'; prect(x, -18, -11, 36, 22, 3 + c.i, 0.5); x.fill();
      x.fillStyle = dark ? shade(c.p.color, -0.15) : shade(c.p.color, 0.3); x.fillRect(-18, -11, 10, 22);
      x.strokeStyle = ink; x.lineWidth = 2; prect(x, -18, -11, 36, 22, 3 + c.i, 0.5); x.stroke();
      // Dach (Sonnendach) und Golftasche
      x.fillStyle = c.p.color; x.globalAlpha = 0.85; prect(x, -8, -12, 18, 24, 9 + c.i, 0.4); x.fill(); x.globalAlpha = 1; x.stroke();
      x.save(); x.beginPath(); x.rect(-8, -12, 18, 24); x.clip(); hatch(x, -8, -12, 18, 24, '#fff', 5, 0.5, 1); x.restore();
      x.fillStyle = '#8a5a2b'; x.beginPath(); x.arc(-14, 0, 5, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = '#c9ccd3'; x.lineWidth = 1.5; for (const dy of [-3, 0, 3]) { x.beginPath(); x.moveTo(-14, dy); x.lineTo(-22, dy * 1.6); x.stroke(); }
      x.restore();
      if (c.armed) { x.save(); x.strokeStyle = c.p.color; x.lineWidth = 2.5; x.setLineDash([5, 5]); x.beginPath(); x.arc(c.x, c.y, 28 + Math.sin(tm / 150) * 3, 0, 7); x.stroke(); x.restore(); }
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      if (count > 0) count -= dt; else if (!over || karts.some((c) => !c.done)) { step(dt / 2); step(dt / 2); }
      if ((tm | 0) % 4 === 0) upd();
      msgT = Math.max(0, msgT - dt);
      const g = fit(C, RW, RH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      drawCourse();
      x.strokeStyle = ink;
      for (const c of karts) for (const [a, b, l, sand] of c.trail) { x.globalAlpha = l * 0.45; x.fillStyle = sand ? (dark ? '#c9b37a' : '#b8964a') : ink; x.fillRect(a - 1.5, b - 1.5, 3, 3); }
      x.globalAlpha = 1;
      for (const pt of pots) drawPot(pt, tm);
      for (const L of lines) {
        x.save(); x.globalAlpha = Math.min(1, L.t / 0.6); x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = karts[L.owner].p.color; x.lineWidth = 12; x.globalAlpha *= 0.35; x.beginPath(); L.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
        x.globalAlpha = Math.min(1, L.t / 0.6); x.strokeStyle = ink; x.lineWidth = 5;
        for (let i = 1; i < L.pts.length; i++) pline(x, L.pts[i - 1][0], L.pts[i - 1][1], L.pts[i][0], L.pts[i][1], L.seed + i, 0.8);
        x.restore();
      }
      if (drawing) { x.save(); x.strokeStyle = drawing.who.p.color; x.lineWidth = 5; x.lineCap = 'round'; x.setLineDash([8, 6]); x.beginPath(); drawing.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); x.restore(); }
      karts.forEach((c) => drawKart(c, tm));
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (count > 0) banner(x, C.cw, C.ch, dark, count > 0.4 ? String(Math.ceil(count - 0.4)) : 'Los!');
      else if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    if (window.__gkDebug) window.__gk = { karts, syncPads };
    upd(); syncPads(); raf = requestAnimationFrame(frame);
  });
}
