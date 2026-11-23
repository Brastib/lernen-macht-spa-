// Papier-Spiele, Paket 6 (Teil 1): Papierrennen (Strecke malen, 2 Autos), Kissenschlacht (aus dem Ring schubsen),
// Windbogen (Bogenschießen mit Wind, abwechselnd), Sternenduell (2 Raumschiffe, Schwerkraft um einen Planeten).
// Rennen und Kissenschlacht brauchen eine Tastatur (WASD = Spieler 1, Pfeiltasten = Spieler 2). Ohne Tastatur: Schloss.
import { h, icon } from './ui.js';
import { FONT, UIFONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, store, rng, turnCard } from './sketch.js';

export function banner(x, cw, ch, dark, txt, y = null) {
  const ink = inkOf(dark);
  x.save(); const fs = Math.round(Math.max(20, Math.min(36, cw / 16)));
  x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(cw - 20, x.measureText(txt).width + 44), hh = fs + 26, yy = y == null ? ch / 2 - hh / 2 : y;
  x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
  prect(x, cw / 2 - w / 2, yy, w, hh, 31, 1.1); x.fill(); x.stroke();
  x.fillStyle = ink; x.fillText(txt, cw / 2, yy + hh / 2 + 1, w - 20); x.restore();
}
export const fit = (C, W, H, m = 10) => { const U = Math.min((C.cw - 2 * m) / W, (C.ch - 2 * m) / H); return { U, ox: (C.cw - W * U) / 2, oy: (C.ch - H * U) / 2 }; };
export const toWorld = (C, g, e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - g.ox) / g.U, (e.clientY - r.top - g.oy) / g.U]; };
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------- Tastatur-Schloss ----------
export const hasKeyboard = () => { try { return sessionStorage.getItem('gKbd') === '1'; } catch (e) { return !!window.__gKbd; } };
export function noteKeyboard() { window.__gKbd = true; try { sessionStorage.setItem('gKbd', '1'); } catch (e) { /* egal */ } }
function keyboardGate(fx, title) {
  if (hasKeyboard()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const card = h('div.grescard.kbcard', null,
      h('span.gresic.kblock', null, icon('lock')),
      h('b', { text: `${title} braucht eine Tastatur` }),
      h('small', { text: 'Spieler 1 fährt mit W A S D, Spieler 2 mit den Pfeiltasten. Schließ eine Tastatur an und drück irgendeine Taste, dann geht das Schloss auf.' }),
      h('div.kbkeys', null, ...['W', 'A', 'S', 'D', '↑', '←', '↓', '→'].map((k) => h('kbd', { text: k }))));
    fx.stage.replaceChildren(h('div.gres', null, card));
    const on = (e) => { if (e.key && e.key !== 'Unidentified') { noteKeyboard(); document.removeEventListener('keydown', on); card.classList.add('open'); card.querySelector('.kblock').replaceChildren(icon('check')); setTimeout(() => resolve(true), 500); } };
    document.addEventListener('keydown', on);
    fx.signal.addEventListener('abort', () => { document.removeEventListener('keydown', on); resolve(false); }, { once: true });
  });
}
function keySet() {
  const keys = new Set();
  const on = (e) => { const k = e.code; if (!/^(Key[WASDFQE]|Arrow|Space|Enter|ShiftRight|Minus|Period|Slash)/.test(k)) return; e.preventDefault(); if (e.type === 'keydown') keys.add(k); else keys.delete(k); };
  document.addEventListener('keydown', on); document.addEventListener('keyup', on);
  return { keys, stop: () => { document.removeEventListener('keydown', on); document.removeEventListener('keyup', on); } };
}

// ======================================================================
// Papierrennen
// ======================================================================
const RW = 1000, RH = 640, ROAD = 92, LAPS = 3;
export function resample(pts, step) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1]; const [bx, by] = pts[i]; let d = Math.hypot(bx - ax, by - ay);
    while (acc + d >= step) { const t = (step - acc) / d; ax += (bx - ax) * t; ay += (by - ay) * t; out.push([ax, ay]); d = Math.hypot(bx - ax, by - ay); acc = 0; }
    acc += d;
  }
  return out;
}
export function smooth(pts, n = 3) { let p = pts; for (let k = 0; k < n; k++) p = p.map((q, i) => { const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length]; return [(a[0] + q[0] * 2 + c[0]) / 4, (a[1] + q[1] * 2 + c[1]) / 4]; }); return p; }
function randomTrack(R) {
  const pts = [], n = 9;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = 0.62 + R() * 0.35; pts.push([RW / 2 + Math.cos(a) * (RW / 2 - 110) * r, RH / 2 + Math.sin(a) * (RH / 2 - 90) * r]); }
  pts.push(pts[0]);
  return smooth(resample(pts, 14), 6);
}
function drawTrackSheet(fx, p, R) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    let track = null, cur = null;
    const info = h('p.hshint', { text: 'Mal eine Runde mit dem Finger (Anfang und Ende treffen sich von selbst). Oder nimm eine Zufallsstrecke.' });
    const ok = h('button.btn.primary', { text: 'Losfahren', on: { click: () => { if (track) { cleanup(); resolve(track); } } } });
    const host = h('div.hsarea');
    fx.stage.replaceChildren(h('div.hswrap', null, h('div.hshud', null, chip(p, h('small', { text: 'malt die Strecke' })), h('span.bsspacer'),
      h('button.btn', { text: 'Zufallsstrecke', on: { click: () => { track = randomTrack(R); info.textContent = 'Fertig! Du kannst neu malen oder losfahren.'; draw(); } } }), ok), info, host));
    const C = canvasBox(host), x = C.x;
    const draw = () => {
      const g = fit(C, RW, RH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, 0, 0, RW, RH, 9, 1.2); x.stroke();
      if (track) drawRoad(x, track, dark, ink);
      if (cur) { x.strokeStyle = p.color; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); cur.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
      ok.disabled = !track;
    };
    const ro = new ResizeObserver(draw); ro.observe(host);
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); const g = fit(C, RW, RH); cur = [toWorld(C, g, e)]; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } draw(); });
    C.cv.addEventListener('pointermove', (e) => { if (!cur) return; const g = fit(C, RW, RH), q = toWorld(C, g, e), l = cur[cur.length - 1]; q[0] = Math.max(50, Math.min(RW - 50, q[0])); q[1] = Math.max(50, Math.min(RH - 50, q[1])); if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 6) cur.push(q); draw(); });
    C.cv.addEventListener('pointerup', () => {
      if (!cur) return; const pts = cur; cur = null;
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len < 900) { info.textContent = 'Die Strecke ist zu kurz. Mal eine größere Runde.'; draw(); return; }
      const t = smooth(resample([...pts, pts[0]], 14), 5);
      track = t; info.textContent = 'Super Strecke! Losfahren oder neu malen.'; draw();
    });
    const cleanup = () => { ro.disconnect(); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    draw();
  });
}
function drawRoad(x, t, dark, ink) {
  const path = () => { x.beginPath(); t.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = ink; x.lineWidth = ROAD + 6; path(); x.stroke();
  x.strokeStyle = dark ? '#3a3e48' : '#d9d9de'; x.lineWidth = ROAD; path(); x.stroke();
  x.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'; x.lineWidth = ROAD - 20; path(); x.stroke();
  x.strokeStyle = dark ? '#f4f1e6' : '#fff'; x.lineWidth = 3; x.setLineDash([18, 16]); path(); x.stroke(); x.setLineDash([]);
  // Start/Ziel mit Schachbrett
  const [ax, ay] = t[0], [bx, by] = t[1], a = Math.atan2(by - ay, bx - ax);
  x.save(); x.translate(ax, ay); x.rotate(a);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#26262b'; x.fillRect(-6 + j * 6, -ROAD / 2 + i * ROAD / 8, 6, ROAD / 8); }
  x.restore();
}
export function race(fx, A, B) {
  return (async () => {
    if (!(await keyboardGate(fx, 'Papierrennen'))) return null;
    const R = rng((Math.random() * 1e9) | 0);
    const track = await drawTrackSheet(fx, A, R); if (!track) return null;
    return raceRun(fx, A, B, track, R);
  })();
}
function raceRun(fx, A, B, track, R) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), solo = !B, list = [A, B].filter(Boolean);
    const n = track.length;
    const a0 = Math.atan2(track[1][1] - track[0][1], track[1][0] - track[0][0]);
    const nx = -Math.sin(a0), ny = Math.cos(a0);
    const cars = list.map((p, i) => ({ p, i, x: track[0][0] - Math.cos(a0) * 30 + nx * (solo ? 0 : i ? 18 : -18), y: track[0][1] - Math.sin(a0) * 30 + ny * (solo ? 0 : i ? 18 : -18), a: a0, v: 0, idx: 0, prog: 0, lap: 0, done: false, time: 0, lapStart: 0, best: 0, skid: [] }));
    const stats = h('div.hsstats');
    const host = h('div.hsarea');
    fx.stage.replaceChildren(h('div.hswrap', null, h('div.hshud', null, stats), h('p.hshint', { text: solo ? 'W = Gas, S = Bremse, A/D = lenken. 3 Runden, so schnell du kannst.' : `${A.name}: W A S D · ${B.name}: Pfeiltasten. Wer zuerst 3 Runden fährt, gewinnt.` }), host));
    const C = canvasBox(host), x = C.x; const K = keySet();
    let count = 3, t = 0, raf = 0, last = 0, over = false, msg = '', msgT = 0;
    const rec = store.get('gRaceBest', 0);
    const fmt = (s) => s ? s.toFixed(2).replace('.', ',') + ' s' : '–';
    const upd = () => stats.replaceChildren(...cars.map((c) => h('span.hsstat.rcstat', { style: { '--pc': c.p.color } }, h('small', { text: c.p.name }), h('b', { text: c.done ? 'Ziel!' : `Runde ${Math.min(LAPS, c.lap + 1)}/${LAPS}` }))),
      h('span.hsstat', null, h('small', { text: 'Zeit' }), h('b', { text: fmt(t) })), ...(solo ? [h('span.hsstat', null, h('small', { text: 'Rekord' }), h('b', { text: fmt(rec) }))] : []));
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); K.stop(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function nearest(c) {   // nächster Streckenpunkt in der Nähe des letzten
      let best = c.idx, bd = 1e9;
      for (let k = -12; k <= 12; k++) { const j = (c.idx + k + n) % n, d = Math.hypot(track[j][0] - c.x, track[j][1] - c.y); if (d < bd) { bd = d; best = j; } }
      return [best, bd];
    }
    function step(dt) {
      t += dt;
      for (const c of cars) {
        if (c.done) { c.v *= 0.96; c.x += Math.cos(c.a) * c.v * dt; c.y += Math.sin(c.a) * c.v * dt; continue; }
        const ks = c.i === 0 ? ['KeyW', 'KeyS', 'KeyA', 'KeyD'] : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        const alt = solo ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] : null;
        const on = (k) => K.keys.has(ks[k]) || (alt && K.keys.has(alt[k]));
        const [j, dist] = nearest(c); const off = dist > ROAD / 2;
        const maxV = off ? 150 : 430, acc = on(0) ? 420 : 0, brk = on(1) ? (c.v > 0 ? 600 : 220) : 0;
        c.v += (acc - brk) * dt; c.v -= c.v * (off ? 2.4 : 0.6) * dt; c.v = Math.max(-120, Math.min(maxV, c.v));
        const steer = (on(3) ? 1 : 0) - (on(2) ? 1 : 0);
        c.a += steer * dt * 2.9 * Math.max(-1, Math.min(1, c.v / 160));
        c.x += Math.cos(c.a) * c.v * dt; c.y += Math.sin(c.a) * c.v * dt;
        { const nx = Math.max(22, Math.min(RW - 22, c.x)), ny = Math.max(22, Math.min(RH - 22, c.y)); if (nx !== c.x || ny !== c.y) c.v *= 0.5; c.x = nx; c.y = ny; }
        if (Math.abs(steer) && Math.abs(c.v) > 280 && R() < 0.5) c.skid.push([c.x, c.y, 1]);
        // Fortschritt: über Start/Ziel nur vorwärts zählen
        let d = j - c.idx; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
        c.prog += d; c.idx = j;
        if (c.prog >= n * (c.lap + 1)) {
          c.lap++; const lt = t - c.lapStart; c.lapStart = t; if (!c.best || lt < c.best) c.best = lt;
          if (c.lap >= LAPS) { c.done = true; c.time = t; msg = solo ? `Ziel! ${fmt(t)}` : `${c.p.name} ist im Ziel!`; msgT = 2; }
          else { msg = `${c.p.name}: Runde ${c.lap + 1}`; msgT = 1; }
          upd();
        }
        c.skid.forEach((s) => { s[2] -= dt * 0.25; }); c.skid = c.skid.filter((s) => s[2] > 0).slice(-160);
      }
      if (cars.length > 1) { const [p, q] = cars, dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d < 30 && d > 0) { const o = (30 - d) / 2; p.x -= dx / d * o; p.y -= dy / d * o; q.x += dx / d * o; q.y += dy / d * o; p.v *= 0.97; q.v *= 0.97; } }
      if (!over && cars.some((c) => c.done) && (solo || cars.every((c) => c.done) || cars.some((c) => c.done && t - c.time > 0.01))) {
        over = true;
        const winner = cars.filter((c) => c.done).sort((a, b) => a.time - b.time)[0];
        setTimeout(() => { cleanup(); resolve(solo ? { score: Math.round(winner.time * 100) / 100 } : { w: winner.i, detail: `${winner.p.name} gewinnt in ${fmt(winner.time)}` }); }, 1800);
      }
    }
    function drawCar(c) {
      x.save(); x.translate(c.x, c.y); x.rotate(c.a);
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(-15, -8, 32, 18);
      x.fillStyle = dark ? shade(c.p.color, -0.2) : shade(c.p.color, 0.35); prect(x, -17, -10, 34, 20, 5 + c.i, 0.6); x.fill();
      hatch(x, -17, -10, 34, 20, c.p.color, 4, 0.9, 1.4);
      x.strokeStyle = ink; x.lineWidth = 2; prect(x, -17, -10, 34, 20, 5 + c.i, 0.6); x.stroke();
      x.fillStyle = dark ? '#9fd3ff' : '#cfe9ff'; x.fillRect(2, -7, 8, 14); x.strokeRect(2, -7, 8, 14);
      x.fillStyle = ink; [[-11, -12], [-11, 9], [8, -12], [8, 9]].forEach(([a, b]) => x.fillRect(a, b, 7, 3));
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      if (count > 0) { count -= dt; } else if (!over || cars.some((c) => !c.done)) step(dt);
      if (count <= 0 && (tm | 0) % 3 === 0) upd();
      msgT = Math.max(0, msgT - dt);
      const g = fit(C, RW, RH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.fillStyle = dark ? 'rgba(60,160,90,.08)' : 'rgba(60,170,90,.08)'; x.fillRect(0, 0, RW, RH);
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, 0, 0, RW, RH, 9, 1.2); x.stroke();
      drawRoad(x, track, dark, ink);
      x.fillStyle = ink; cars.forEach((c) => c.skid.forEach(([a, b, l]) => { x.globalAlpha = l * 0.35; x.fillRect(a - 1.5, b - 1.5, 3, 3); })); x.globalAlpha = 1;
      cars.forEach(drawCar);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (count > 0) banner(x, C.cw, C.ch, dark, count > 0.4 ? String(Math.ceil(count - 0.4)) : 'Los!');
      else if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    upd(); raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Kissenschlacht
// ======================================================================
const SR = 260, SPR = 34, FS = 1.35;
// Weicher Bleistift-Kreis (viele Punkte, sanftes Wackeln) für große Kreise
export function softCircle(x, r, seed, amp = 0.012, overlap = 0) {
  x.beginPath();
  for (let k = 0; k <= 120 + overlap; k++) { const t = k / 120 * Math.PI * 2, rr = r * (1 + amp * Math.sin(3 * t + seed) + amp * 0.6 * Math.sin(7 * t + seed * 2.3)); k ? x.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : x.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
}
export function sumo(fx, A, B, o = {}) {
  return (async () => {
    const cpu = !!o.cpu;
    if (!(await keyboardGate(fx, 'Kissenschlacht'))) return null;
    fx.stage.replaceChildren();
    return new Promise((resolve) => {
      const dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0);
      const host = h('div.hsarea'), sc = h('div.hsstats');
      fx.stage.append(h('div.hswrap', null, h('div.hshud', null, sc), h('p.hshint', { text: cpu ? 'W A S D laufen, Leertaste = Kissen schwingen. Schubs den Computer aus dem Ring!' : `${A.name}: W A S D + Leertaste · ${B.name}: Pfeiltasten + Enter. Schubst euch aus dem Ring!` }), host));
      const C = canvasBox(host), x = C.x, K = keySet();
      const wins = [0, 0]; let round = 0, F, count, between, msg = '', over = false, raf = 0, last = 0, feathers = [];
      const upd = () => sc.replaceChildren(...[A, B].map((p, i) => h('span.hsstat.rcstat', { style: { '--pc': p.color } }, h('small', { text: p.name }), h('b', { text: `${wins[i]} ${wins[i] === 1 ? 'Runde' : 'Runden'}` }))));
      function newRound() {
        round++; count = 1.8; between = 0; msg = '';
        F = [A, B].map((p, i) => ({ p, i, x: i ? 120 : -120, y: 0, vx: 0, vy: 0, face: i ? Math.PI : 0, swing: 0, cool: 0, out: false, stun: 0, bot: cpu && i === 1 }));
        upd();
      }
      function swing(f) {
        if (f.cool > 0 || f.out || count > 0 || between > 0) return; f.swing = 0.3; f.cool = 0.55;
        const o2 = F[1 - f.i], dx = o2.x - f.x, dy = o2.y - f.y, d = Math.hypot(dx, dy);
        const ang = Math.abs(wrapA(Math.atan2(dy, dx) - f.face));
        if (d < 125 && ang < 1.3) {
          o2.vx += dx / d * 560; o2.vy += dy / d * 560; o2.stun = 0.25;
          for (let k = 0; k < 8; k++) feathers.push({ x: (f.x + o2.x) / 2, y: (f.y + o2.y) / 2, vx: (R() - 0.5) * 220, vy: (R() - 0.5) * 220, r: R() * 6, t: 0 });
        }
      }
      const onKey = (e) => { if (e.type !== 'keydown' || e.repeat) return; if (e.code === 'Space') swing(F[0]); if (e.code === 'Enter' && !cpu) swing(F[1]); };
      document.addEventListener('keydown', onKey);
      const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); K.stop(); document.removeEventListener('keydown', onKey); };
      fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
      function step(dt) {
        for (const f of F) {
          f.cool = Math.max(0, f.cool - dt); f.swing = Math.max(0, f.swing - dt); f.stun = Math.max(0, f.stun - dt);
          let ax = 0, ay = 0;
          if (f.bot) {
            const o2 = F[0], dx = o2.x - f.x, dy = o2.y - f.y, d = Math.hypot(dx, dy) || 1;
            const toC = Math.hypot(f.x, f.y) > SR * 0.65;
            ax = toC ? -f.x / Math.hypot(f.x, f.y) * 0.8 + dx / d * 0.3 : dx / d; ay = toC ? -f.y / Math.hypot(f.x, f.y) * 0.8 + dy / d * 0.3 : dy / d;
            if (d < 115 && R() < 0.07) swing(f);
          } else {
            const ks = f.i === 0 ? ['KeyW', 'KeyS', 'KeyA', 'KeyD'] : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            const alt = cpu && f.i === 0 ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] : null;
            const on = (k) => K.keys.has(ks[k]) || (alt && K.keys.has(alt[k]));
            ax = (on(3) ? 1 : 0) - (on(2) ? 1 : 0); ay = (on(1) ? 1 : 0) - (on(0) ? 1 : 0);
          }
          const l = Math.hypot(ax, ay); if (l > 0 && f.stun <= 0) { ax /= l; ay /= l; f.vx += ax * (f.bot ? 900 : 1100) * dt; f.vy += ay * (f.bot ? 900 : 1100) * dt; f.face = Math.atan2(ay, ax); }
          f.vx -= f.vx * 3.2 * dt; f.vy -= f.vy * 3.2 * dt;
          f.x += f.vx * dt; f.y += f.vy * dt;
          if (!f.out && Math.hypot(f.x, f.y) > SR + 4) { f.out = true; }
        }
        const [p, q] = F, dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d < SPR * 2 && d > 0) { const nx = dx / d, ny = dy / d, ov = (SPR * 2 - d) / 2; p.x -= nx * ov; p.y -= ny * ov; q.x += nx * ov; q.y += ny * ov; const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny; if (rel > 0) { p.vx -= rel * nx; p.vy -= rel * ny; q.vx += rel * nx; q.vy += rel * ny; } }
        feathers.forEach((f) => { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt + 20 * dt; f.vx *= 0.96; f.vy *= 0.96; f.r += dt * 4; }); feathers = feathers.filter((f) => f.t < 1.2);
        const outs = F.filter((f) => f.out);
        if (outs.length && between <= 0) {
          const wi = outs.length === 2 ? -1 : 1 - outs[0].i; if (wi >= 0) wins[wi]++; upd();
          const champ = wins.findIndex((w) => w >= 2);
          if (champ >= 0 || round >= 5) { over = true; msg = champ >= 0 ? `${[A, B][champ].name} gewinnt!` : 'Unentschieden'; between = 9; setTimeout(() => { cleanup(); resolve({ w: wins[0] > wins[1] ? 0 : wins[1] > wins[0] ? 1 : null, detail: `${wins[0]} : ${wins[1]} Runden` }); }, 1700); }
          else { msg = wi >= 0 ? `Runde für ${[A, B][wi].name}` : 'Beide raus!'; between = 1.8; }
        }
      }
      function fighter(f) {
        const c = f.p.color; x.save(); x.translate(f.x, f.y); x.scale(FS, FS);
        if (f.out) x.globalAlpha = 0.5;
        x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(0, 8, 28, 12, 0, 0, Math.PI * 2); x.fill();
        x.rotate(f.face);
        // Kissen
        const sw = f.swing > 0 ? Math.sin((0.3 - f.swing) / 0.3 * Math.PI) : 0;
        x.save(); x.rotate(-0.9 + sw * 1.8); x.fillStyle = dark ? '#e8e4d8' : '#fff';
        x.beginPath(); x.roundRect(22, -22, 30, 44, 10); x.fill(); x.strokeStyle = ink; x.lineWidth = 2.2; x.stroke();
        x.lineWidth = 1; x.globalAlpha *= 0.5; x.beginPath(); x.moveTo(28, -14); x.lineTo(46, -14); x.moveTo(28, 14); x.lineTo(46, 14); x.stroke(); x.restore();
        // Körper von oben: Schultern und Kopf
        x.fillStyle = dark ? shade(c, -0.15) : shade(c, 0.35); x.beginPath(); x.ellipse(0, 0, 16, 26, 0, 0, Math.PI * 2); x.fill();
        x.save(); x.beginPath(); x.ellipse(0, 0, 16, 26, 0, 0, Math.PI * 2); x.clip(); hatch(x, -16, -26, 32, 52, c, 5, 0.9, 1.5); x.restore();
        x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); x.ellipse(0, 0, 16, 26, 0, 0, Math.PI * 2); x.stroke();
        x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.beginPath(); x.arc(2, 0, 11, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = ink; x.beginPath(); x.arc(9, -4, 1.8, 0, Math.PI * 2); x.arc(9, 4, 1.8, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      function frame(tm) {
        if (fx.signal.aborted) return;
        const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
        if (count > 0) count -= dt; else if (between > 0) { between -= dt; step(dt); if (between <= 0 && !over) newRound(); } else step(dt);
        const W = SR * 2 + 160, g = fit(C, W, W);
        x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
        x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * (g.ox + W / 2 * g.U), C.dpr * (g.oy + W / 2 * g.U));
        // Ring
        x.fillStyle = dark ? 'rgba(210,170,110,.16)' : 'rgba(225,190,130,.3)'; softCircle(x, SR + 30, 3, 0.005); x.fill();
        x.strokeStyle = ink; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
        x.lineWidth = 5; softCircle(x, SR, 4, 0.006, 4); x.stroke(); x.lineWidth = 1.2; x.globalAlpha = 0.4; softCircle(x, SR - 7, 5, 0.008); x.stroke(); x.globalAlpha = 1;
        x.lineWidth = 2; x.globalAlpha = 0.5; pline(x, -40, -14, -40, 14, 5); pline(x, 40, -14, 40, 14, 6); x.globalAlpha = 1;
        F.forEach(fighter);
        feathers.forEach((f) => { x.save(); x.globalAlpha = 1 - f.t / 1.2; x.translate(f.x, f.y); x.rotate(f.r); x.strokeStyle = ink; x.fillStyle = dark ? '#e8e4d8' : '#fff'; x.lineWidth = 1; x.beginPath(); x.ellipse(0, 0, 7, 2.5, 0, 0, Math.PI * 2); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-7, 0); x.lineTo(7, 0); x.stroke(); x.restore(); });
        x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
        if (count > 0) banner(x, C.cw, C.ch, dark, String(Math.ceil(count / 0.6)));
        else if (between > 0 && msg) banner(x, C.cw, C.ch, dark, msg);
        raf = requestAnimationFrame(frame);
      }
      newRound(); raf = requestAnimationFrame(frame);
    });
  })();
}

// ======================================================================
// Windbogen
// ======================================================================
const AW = 1200, AH = 600, GRAV_A = 520;
export function archery(fx, A, B) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0), list = [A, B].filter(Boolean), solo = !B;
    const SHOTS = solo ? 8 : 5;
    const score = list.map(() => 0), shots = list.map(() => 0);
    let turn = 0, wind = 0, arrow = null, busy = false, stuck = [], aim = null, msg = '', msgT = 0, over = false, raf = 0, last = 0;
    const target = { x: 0, y: 0 };
    const sc = h('div.hsstats'), host = h('div.hsarea');
    fx.stage.append(h('div.hswrap', null, h('div.hshud', null, sc), h('p.hshint', { text: 'Irgendwo hinlegen und nach hinten ziehen, loslassen schießt. Achte auf den Wind!' }), host));
    const C = canvasBox(host), x = C.x;
    const upd = () => sc.replaceChildren(...list.map((p, i) => h('span.hsstat.rcstat' + (i === turn ? '.on' : ''), { style: { '--pc': p.color } }, h('small', { text: p.name }), h('b', { text: `${score[i]} P · ${shots[i]}/${SHOTS}` }))),
      ...(solo ? [h('span.hsstat', null, h('small', { text: 'Rekord' }), h('b', { text: String(store.get('gArchBest', 0) || '–') }))] : []));
    const newShot = () => {
      wind = Math.round((R() * 2 - 1) * 12) / 2; target.x = 760 + R() * 330; target.y = 300 + R() * 150;
      msg = solo ? `Pfeil ${shots[0] + 1} von ${SHOTS}` : `${list[turn].name} ist dran`; msgT = 1.1; upd();
    };
    const BOW = [110, 420];
    let g = fit(C, AW, AH);
    C.cv.addEventListener('pointerdown', (e) => { if (arrow || busy || over) return; e.preventDefault(); const p = toWorld(C, g, e); aim = { id: e.pointerId, from: p, to: p }; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aim && aim.id === e.pointerId) aim.to = toWorld(C, g, e); });
    C.cv.addEventListener('pointerup', (e) => {
      if (!aim || aim.id !== e.pointerId) return; const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy); aim = null;
      if (L < 14) return; const v = Math.min(1, L / 260) * 1250;
      arrow = { x: BOW[0] + 20, y: BOW[1] - 30, vx: dx / L * v, vy: dy / L * v, who: turn, trail: [] }; fx.stage.querySelector('.hshint')?.remove();
    });
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function land(pts, txt) {
      const w = arrow.who; score[w] += pts; shots[w]++; msg = txt; msgT = 1.4; arrow = null; busy = true; upd();
      setTimeout(() => {
        if (fx.signal.aborted) return; busy = false;
        if (shots.every((s) => s >= SHOTS)) {
          over = true; msg = solo ? `${score[0]} Punkte` : score[0] === score[1] ? 'Unentschieden' : `${list[score[0] > score[1] ? 0 : 1].name} gewinnt!`; msgT = 9; upd();
          setTimeout(() => { cleanup(); resolve(solo ? { score: score[0] } : { w: score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null, detail: `${score[0]} : ${score[1]} Punkte` }); }, 1500);
          return;
        }
        if (!solo) turn = 1 - turn; stuck = stuck.slice(-6); newShot();
      }, 1200);
    }
    function step(dt) {
      if (!arrow) return;
      for (let s = 0; s < 3; s++) {
        const d = dt / 3; arrow.vx += wind * 14 * d; arrow.vy += GRAV_A * d; arrow.x += arrow.vx * d; arrow.y += arrow.vy * d;
        // Scheibe: senkrechte Fläche bei target.x, Höhe ±80
        if (arrow.x >= target.x - 4 && arrow.x <= target.x + 10 && Math.abs(arrow.y - target.y) <= 80) {
          const off = Math.abs(arrow.y - target.y), ring = Math.min(4, Math.floor(off / 16)), pts = [10, 8, 6, 4, 2][ring];
          stuck.push({ x: target.x, y: arrow.y, a: Math.atan2(arrow.vy, arrow.vx), c: list[arrow.who].color, tx: target.x, ty: target.y });
          return land(pts, pts === 10 ? 'Volltreffer! 10 Punkte' : `${pts} Punkte`);
        }
        if (arrow.y > AH - 40 || arrow.x > AW + 40 || arrow.x < -40) { if (arrow.y > AH - 40) stuck.push({ x: Math.min(AW, arrow.x), y: Math.min(AH - 40, arrow.y), a: Math.atan2(arrow.vy, arrow.vx), c: list[arrow.who].color, ground: true }); return land(0, 'Daneben'); }
      }
      arrow.trail.push([arrow.x, arrow.y]); if (arrow.trail.length > 30) arrow.trail.shift();
    }
    function drawArrow(px, py, a, c, len = 46) {
      x.save(); x.translate(px, py); x.rotate(a); x.lineCap = 'round';
      x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.moveTo(-len, 0); x.lineTo(0, 0); x.stroke();
      x.fillStyle = ink; x.beginPath(); x.moveTo(4, 0); x.lineTo(-6, -4); x.lineTo(-6, 4); x.closePath(); x.fill();
      x.fillStyle = c; x.beginPath(); x.moveTo(-len, 0); x.lineTo(-len - 8, -6); x.lineTo(-len + 4, 0); x.lineTo(-len - 8, 6); x.closePath(); x.fill(); x.lineWidth = 1; x.stroke();
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      step(dt); msgT = Math.max(0, msgT - dt);
      g = fit(C, AW, AH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      // Boden und Gras
      x.strokeStyle = ink; x.lineWidth = 3; pline(x, 0, AH - 40, AW, AH - 40, 3, 1);
      x.strokeStyle = dark ? '#6fbf73' : '#3f9a4b'; x.lineWidth = 1.6; x.beginPath(); for (let k = 8; k < AW; k += 14) { x.moveTo(k, AH - 40); x.lineTo(k + 3, AH - 50 - (k * 7 % 6)); } x.stroke();
      // Windfahne
      x.save(); x.translate(AW / 2, 70); x.strokeStyle = ink; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 60); x.stroke();
      const wl = Math.abs(wind) * 9 + 10, sgn = wind >= 0 ? 1 : -1, wave = Math.sin(tm / 150) * 4;
      x.fillStyle = '#e0483e'; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(sgn * wl / 2, wave - 2, sgn * wl, wave + 6); x.lineTo(0, 18); x.closePath(); x.fill(); x.lineWidth = 1.6; x.stroke();
      x.fillStyle = ink; x.font = `800 20px ${FONT}`; x.textAlign = 'center'; x.fillText(wind === 0 ? 'Kein Wind' : `Wind ${wind > 0 ? '→' : '←'} ${Math.abs(wind)}`, 0, 92);
      x.restore();
      // Zielscheibe auf Ständer (von der Seite leicht schräg)
      x.save(); x.translate(target.x, target.y);
      x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.moveTo(-10, 60); x.lineTo(-30, AH - 40 - target.y); x.moveTo(10, 60); x.lineTo(24, AH - 40 - target.y); x.stroke();
      [['#fff', 80], ['#26262b', 64], ['#2f7cf6', 48], ['#e0483e', 32], ['#f2c230', 16]].forEach(([c, r], k) => { x.fillStyle = c; x.beginPath(); x.ellipse(0, 0, r * 0.32, r, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = k === 1 ? '#888' : ink; x.lineWidth = 1.6; x.stroke(); });
      x.restore();
      stuck.forEach((s) => { const sx = s.ground ? s.x : target.x + (s.x - s.tx), sy = s.ground ? s.y : s.y; if (s.ground || (s.tx === target.x && s.ty === target.y)) drawArrow(sx, sy, s.a, s.c); });
      // Bogenschütze
      const sh = list[turn];
      x.save(); x.translate(BOW[0], BOW[1]); x.strokeStyle = ink; x.lineCap = 'round'; x.lineWidth = 3.5;
      x.beginPath(); x.moveTo(-20, 0); x.lineTo(-30, 80); x.moveTo(-20, 0); x.lineTo(-8, 80); x.stroke();
      x.strokeStyle = sh.color; x.lineWidth = 8; x.beginPath(); x.moveTo(-20, 0); x.lineTo(-20, -45); x.stroke();
      x.fillStyle = dark ? '#f4f1e6' : '#fff'; x.strokeStyle = ink; x.lineWidth = 2.6; x.beginPath(); x.arc(-18, -60, 12, 0, Math.PI * 2); x.fill(); x.stroke();
      let a = -0.5, pull = 0;
      if (aim) { const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy); if (L > 14) { a = Math.atan2(dy, dx); pull = Math.min(1, L / 260); } }
      x.translate(0, -30); x.rotate(a);
      x.strokeStyle = dark ? '#c79a5a' : '#8b5a2b'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 42, -1.25, 1.25); x.stroke();
      const sx = Math.cos(1.25) * 42, sy = Math.sin(1.25) * 42;
      x.strokeStyle = ink; x.lineWidth = 1.3; x.beginPath(); x.moveTo(sx, -sy); x.lineTo(-pull * 30, 0); x.lineTo(sx, sy); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(-20, 0); x.lineTo(Math.cos(0) * 10, 0); x.moveTo(-20, 0); x.lineTo(-pull * 30 + 4, 0); x.stroke();
      if (!arrow && !busy && !over) drawArrow(46 - pull * 30, 0, 0, sh.color);
      x.restore();
      if (aim) { const dx = aim.from[0] - aim.to[0], dy = aim.from[1] - aim.to[1], L = Math.hypot(dx, dy); if (L > 14) { const ux = dx / L, uy = dy / L; x.strokeStyle = sh.color; x.setLineDash([3, 9]); x.lineWidth = 2.5; x.beginPath(); x.moveTo(BOW[0] + 20, BOW[1] - 30); x.lineTo(BOW[0] + 20 + ux * 150, BOW[1] - 30 + uy * 150); x.stroke(); x.setLineDash([]); } }
      if (arrow) { x.strokeStyle = ink; x.globalAlpha = 0.3; x.setLineDash([2, 6]); x.lineWidth = 1.5; x.beginPath(); arrow.trail.forEach(([a2, b2], k) => (k ? x.lineTo(a2, b2) : x.moveTo(a2, b2))); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; drawArrow(arrow.x, arrow.y, Math.atan2(arrow.vy, arrow.vx), list[arrow.who].color); }
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    newShot(); raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Sternenduell
// ======================================================================
const SW = 1000, SH = 640, GM = 2.6e6, PLR = 46;
export function space(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, dark = isDark(), ink = inkOf(dark), R = rng((Math.random() * 1e9) | 0);
    const mk = (p, i) => {
      const b = (k, ic, lab) => h('button.spbtn', { 'aria-label': lab, title: lab, style: { '--pc': p.color }, 'data-k': k }, icon(ic), h('span', { text: lab }));
      const btns = [b('l', 'turnl', 'Links'), b('r', 'turnr', 'Rechts'), b('t', 'arup', 'Schub'), b('f', 'target', 'Feuer')];
      const lives = h('span.sgscore');
      return { el: h('div.sgpad.sppad', { style: { '--pc': p.color } }, chip(p), lives, h('div.spbtns', null, ...btns), h('small.sgkeys', { text: cpu ? 'Tastatur: A/D drehen, W Schub, Leertaste Feuer' : i ? 'Pfeile + Enter' : 'A/D, W, Leertaste' })), btns, lives };
    };
    const pads = (cpu ? [A] : [A, B]).map(mk);
    const host = h('div.sgboard');
    const wrap = h('div.sgwrap' + (cpu ? '.solo' : ''));
    wrap.append(...(pads.length > 1 ? [pads[0].el, host, pads[1].el] : [host, pads[0].el]));
    fx.stage.append(wrap);
    const rs = fx.stage.getBoundingClientRect(); wrap.classList.toggle('tall', rs.height > rs.width * 0.9);
    const ro = new ResizeObserver(() => { const r = wrap.getBoundingClientRect(); wrap.classList.toggle('tall', r.height > r.width * 0.9); }); ro.observe(wrap);
    const C = canvasBox(host), x = C.x, K = keySet();
    const held = [new Set(), new Set()];
    pads.forEach((pd, i) => pd.btns.forEach((b) => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); held[i].add(k); b.classList.add('on'); if (k === 'f') fire(S[i]); });
      const off = () => { held[i].delete(k); b.classList.remove('on'); }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }));
    const stars = Array.from({ length: 60 }, () => [R() * SW, R() * SH, R() * 2 + 0.6]);
    const S = [A, B].map((p, i) => ({ p, i, x: i ? SW * 0.82 : SW * 0.18, y: SH / 2, vx: 0, vy: i ? 120 : -120, a: i ? Math.PI / 2 : -Math.PI / 2, lives: 3, cool: 0, inv: 1.5, thrust: false, bot: cpu && i === 1, boom: 0 }));
    let shots = [], parts = [], count = 2.2, over = false, raf = 0, last = 0, msg = '', msgT = 0;
    const upd = () => pads.forEach((pd, i) => { pd.lives.textContent = cpu ? `Leben: ${S[0].lives} · Computer: ${S[1].lives}` : `Leben: ${'♥'.repeat(Math.max(0, S[i].lives)) || '0'}`; });
    function fire(s) { if (count > 0 || over || s.cool > 0 || s.boom > 0) return; s.cool = 0.32; shots.push({ x: s.x + Math.cos(s.a) * 18, y: s.y + Math.sin(s.a) * 18, vx: s.vx + Math.cos(s.a) * 420, vy: s.vy + Math.sin(s.a) * 420, t: 2.6, who: s.i }); }
    const onKey = (e) => { if (e.type !== 'keydown' || e.repeat) return; if (e.code === 'Space') fire(S[0]); if (e.code === 'Enter' && !cpu) fire(S[1]); };
    document.addEventListener('keydown', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); ro.disconnect(); K.stop(); document.removeEventListener('keydown', onKey); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    const grav = (px, py) => { const dx = SW / 2 - px, dy = SH / 2 - py, r2 = dx * dx + dy * dy, r = Math.sqrt(r2); const f = GM / Math.max(r2, 2500); return [dx / r * f, dy / r * f]; };
    function hit(s, why) {
      if (s.inv > 0 || s.boom > 0) return; s.lives--; s.boom = 1.2; upd();
      for (let k = 0; k < 20; k++) parts.push({ x: s.x, y: s.y, vx: (R() - 0.5) * 300, vy: (R() - 0.5) * 300, t: 0, c: s.p.color });
      msg = why; msgT = 1.2;
      if (s.lives <= 0 && !over) { over = true; const w = 1 - s.i; msg = `${S[w].p.name} gewinnt!`; msgT = 9; setTimeout(() => { cleanup(); resolve({ w, detail: `Leben übrig: ${Math.max(0, S[0].lives)} zu ${Math.max(0, S[1].lives)}` }); }, 1600); }
    }
    function respawn(s) { s.x = s.i ? SW * 0.82 : SW * 0.18; s.y = R() < 0.5 ? SH * 0.25 : SH * 0.75; s.vx = 0; s.vy = (s.y < SH / 2 ? 1 : -1) * (s.i ? -110 : 110); s.a = Math.atan2(s.vy, s.vx); s.inv = 1.6; }
    function botCtl(s) {
      const o2 = S[0], dx = o2.x - s.x, dy = o2.y - s.y, d = Math.hypot(dx, dy);
      const lead = d / 420, tx = o2.x + o2.vx * lead - s.x, ty = o2.y + o2.vy * lead - s.y;
      const pr = Math.hypot(SW / 2 - s.x, SH / 2 - s.y), danger = pr < PLR + 90;
      let want = Math.atan2(ty, tx);
      if (danger) want = Math.atan2(s.y - SH / 2, s.x - SW / 2);
      const da = wrapA(want - s.a);
      return { l: da < -0.08, r: da > 0.08, t: danger || (Math.abs(da) < 0.5 && Math.hypot(s.vx, s.vy) < 170), f: !danger && Math.abs(da) < 0.18 && d < 520 && R() < 0.2 };
    }
    function step(dt) {
      for (const s of S) {
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt);
        if (s.boom > 0) { s.boom -= dt; if (s.boom <= 0 && s.lives > 0) respawn(s); continue; }
        let c;
        if (s.bot) { c = botCtl(s); if (c.f) fire(s); }
        else {
          const ks = s.i === 0 ? ['KeyA', 'KeyD', 'KeyW'] : ['ArrowLeft', 'ArrowRight', 'ArrowUp'];
          const alt = cpu ? ['ArrowLeft', 'ArrowRight', 'ArrowUp'] : null;
          const on = (k) => K.keys.has(ks[k]) || (alt && K.keys.has(alt[k]));
          c = { l: on(0) || held[s.i].has('l'), r: on(1) || held[s.i].has('r'), t: on(2) || held[s.i].has('t') };
        }
        s.a += ((c.r ? 1 : 0) - (c.l ? 1 : 0)) * 4 * dt; s.thrust = !!c.t;
        if (c.t) { s.vx += Math.cos(s.a) * 230 * dt; s.vy += Math.sin(s.a) * 230 * dt; if (R() < 0.6) parts.push({ x: s.x - Math.cos(s.a) * 14, y: s.y - Math.sin(s.a) * 14, vx: -Math.cos(s.a) * 80 + (R() - 0.5) * 40, vy: -Math.sin(s.a) * 80 + (R() - 0.5) * 40, t: 0.5, c: '#ffb000' }); }
        const [gx, gy] = grav(s.x, s.y); s.vx += gx * dt; s.vy += gy * dt;
        const sp = Math.hypot(s.vx, s.vy); if (sp > 380) { s.vx *= 380 / sp; s.vy *= 380 / sp; }
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.x = (s.x + SW) % SW; s.y = (s.y + SH) % SH;
        if (Math.hypot(s.x - SW / 2, s.y - SH / 2) < PLR + 10) hit(s, `${s.p.name} ist auf den Planeten gekracht!`);
      }
      for (const b of shots) { const [gx, gy] = grav(b.x, b.y); b.vx += gx * dt; b.vy += gy * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.x = (b.x + SW) % SW; b.y = (b.y + SH) % SH; b.t -= dt; if (Math.hypot(b.x - SW / 2, b.y - SH / 2) < PLR) b.t = 0;
        for (const s of S) if (s.i !== b.who && s.boom <= 0 && Math.hypot(b.x - s.x, b.y - s.y) < 16) { b.t = 0; hit(s, `Treffer für ${S[b.who].p.name}!`); } }
      shots = shots.filter((b) => b.t > 0);
      if (S[0].boom <= 0 && S[1].boom <= 0 && Math.hypot(S[0].x - S[1].x, S[0].y - S[1].y) < 24) { hit(S[0], 'Zusammenstoß!'); hit(S[1], 'Zusammenstoß!'); }
      parts.forEach((q) => { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; }); parts = parts.filter((q) => q.t < 1);
    }
    function ship(s) {
      if (s.boom > 0) return;
      x.save(); x.translate(s.x, s.y); x.rotate(s.a);
      if (s.inv > 0 && ((s.inv * 10) | 0) % 2) x.globalAlpha = 0.4;
      x.fillStyle = dark ? shade(s.p.color, -0.15) : shade(s.p.color, 0.4);
      x.beginPath(); x.moveTo(18, 0); x.lineTo(-12, -12); x.lineTo(-6, 0); x.lineTo(-12, 12); x.closePath(); x.fill();
      x.save(); x.clip(); hatch(x, -14, -14, 34, 28, s.p.color, 4, 0.9, 1.3); x.restore();
      x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(18, 0); x.lineTo(-12, -12); x.lineTo(-6, 0); x.lineTo(-12, 12); x.closePath(); x.stroke();
      x.fillStyle = dark ? '#9fd3ff' : '#cfe9ff'; x.beginPath(); x.arc(4, 0, 3.5, 0, Math.PI * 2); x.fill(); x.lineWidth = 1.2; x.stroke();
      if (s.thrust) { x.fillStyle = '#ff8a00'; x.beginPath(); x.moveTo(-7, -5); x.lineTo(-18 - Math.random() * 8, 0); x.lineTo(-7, 5); x.closePath(); x.fill(); }
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      if (count > 0) count -= dt; else step(dt);
      msgT = Math.max(0, msgT - dt);
      const g = fit(C, SW, SH, 6); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.save(); x.beginPath(); x.rect(0, 0, SW, SH); x.clip();
      x.fillStyle = dark ? 'rgba(10,14,30,.55)' : 'rgba(30,40,90,.06)'; x.fillRect(0, 0, SW, SH);
      x.strokeStyle = dark ? '#f4f1e6' : '#26262b'; x.lineWidth = 1.2; x.globalAlpha = 0.6;
      stars.forEach(([a, b, r]) => { x.beginPath(); x.moveTo(a - r * 2, b); x.lineTo(a + r * 2, b); x.moveTo(a, b - r * 2); x.lineTo(a, b + r * 2); x.stroke(); }); x.globalAlpha = 1;
      // Planet mit Ring
      x.fillStyle = dark ? '#5a4a9a' : '#c9b8ff'; pcirc(x, SW / 2, SH / 2, PLR, 7, 0.04); x.fill();
      x.save(); pcirc(x, SW / 2, SH / 2, PLR, 7, 0.04); x.clip(); hatch(x, SW / 2 - PLR, SH / 2 - PLR, PLR * 2, PLR * 2, dark ? '#9a86e0' : '#7a5cd6', 6, 0.7, 1.4); x.restore();
      x.strokeStyle = ink; x.lineWidth = 2.6; pcirc(x, SW / 2, SH / 2, PLR, 7, 0.04); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.ellipse(SW / 2, SH / 2, PLR * 1.8, PLR * 0.45, -0.35, Math.PI * 0.05, Math.PI * 0.95); x.stroke();
      x.globalAlpha = 0.18; x.setLineDash([4, 10]); x.beginPath(); x.arc(SW / 2, SH / 2, PLR + 90, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      shots.forEach((b) => { x.fillStyle = S[b.who].p.color; x.beginPath(); x.arc(b.x, b.y, 3.5, 0, Math.PI * 2); x.fill(); x.strokeStyle = ink; x.lineWidth = 1; x.stroke(); });
      parts.forEach((q) => { x.globalAlpha = Math.max(0, 1 - q.t); x.fillStyle = q.c; x.fillRect(q.x - 2, q.y - 2, 4, 4); }); x.globalAlpha = 1;
      S.forEach(ship);
      x.restore();
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, 0, 0, SW, SH, 2, 1); x.stroke();
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (count > 0) banner(x, C.cw, C.ch, dark, String(Math.ceil(count / 0.75)));
      else if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    upd(); raf = requestAnimationFrame(frame);
  });
}
