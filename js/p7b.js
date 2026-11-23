// Paket 7 (Teil 2): Kritzel-Parkour. Ein Strichmännchen läuft einen festen Hindernis-Kurs:
// springen, unter Linealen durchrutschen, an Wänden hochspringen, Federn, Stacheln. Schnellste Zeit gewinnt.
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, prect, hatch, shade, canvasBox, chip, turnCard, store } from './sketch.js';

const T = 40, ROWS = 15, G = 13;          // Kästchengröße, Zeilen, Boden-Zeile
const GRAV = 2300, RUN = 330, ACC = 2600, JUMP = 790, WALLJ = 760, SPRING = 1220, STAND = 64, LOW = 30, PW = 24;

// ---------- Kurs ----------
function buildCourse() {
  const W = 142, grid = Array.from({ length: ROWS }, () => new Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < ROWS) grid[y][x] = c; };
  const fill = (x0, x1, y0, y1, c = '#') => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, c); };
  const ground = (x0, x1) => fill(x0, x1, G, ROWS - 1);
  const stars = [], checks = [];
  // Teil 1: laufen, springen, rutschen
  ground(0, 15); fill(12, 15, 12, 12);
  ground(19, 31); set(22, 12, '^'); set(23, 12, '^'); stars.push([22.5, 9]);
  fill(27, 28, 11, 12);
  ground(32, 49); fill(34, 38, 11, 11, '='); stars.push([36, 12]);
  checks.push(41);
  // Teil 2: Wandsprung auf die Hochebene
  fill(45, 46, 5, 10);                       // schwebender Pfeiler
  fill(50, 62, 5, ROWS - 1);                 // Hochebene
  set(55, 4, '^'); set(56, 4, '^'); stars.push([55.5, 1.5]); stars.push([48, 6]);
  ground(63, 80); set(66, 12, 'S'); fill(69, 70, 6, 12); stars.push([69.5, 3]);
  checks.push(74);
  // Teil 3: Stachelgrube mit Plattformen, dann Lineal-Slalom
  fill(81, 93, G, G, '^'); fill(81, 93, G + 1, ROWS - 1);
  fill(83, 84, 11, 11); fill(87, 88, 10, 10); fill(91, 92, 11, 11); stars.push([87.5, 7.5]);
  ground(94, 112); fill(97, 100, 11, 11, '='); set(103, 12, '^'); fill(106, 109, 11, 11, '='); stars.push([108, 12]);
  checks.push(112);
  // Teil 4: Treppe, Lücke, Ziel
  ground(113, 118); fill(115, 115, 12, 12); fill(117, 118, 11, 12);
  fill(123, 128, 10, ROWS - 1); stars.push([125.5, 7.5]);
  ground(129, W - 1); fill(W - 2, W - 1, 0, G - 1);
  const finish = 136;
  return { W, grid, stars, checks, finish, start: [2.5, G] };
}
const COURSE = buildCourse();

// ---------- ein Lauf ----------
function runCourse(fx, p, { label, beat }) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), C0 = COURSE, grid = C0.grid;
    const best = store.get('gParkBest', 0);
    const stat = (k, l, v) => { const b = h('b', { text: v }); els[k] = b; return h('span.hsstat', null, h('small', { text: l }), b); };
    const els = {};
    const hud = h('div.hshud', null, chip(p, label ? h('small', { text: label }) : null), h('div.hsstats', null, stat('t', 'Zeit', '0,0 s'), stat('s', 'Sterne', `0 / ${C0.stars.length}`), stat('b', beat != null ? 'Zu schlagen' : 'Rekord', beat != null ? fmt(beat) : best ? fmt(best) : '–')));
    const hint = h('p.hshint', { text: 'Springen, unter Linealen durchrutschen, an Wänden hochspringen. Jeder Stern zieht 1 Sekunde ab.' });
    const host = h('div.pkfield');
    const btn = (k, ic, lab) => h('button.pkbtn', { 'aria-label': lab, 'data-k': k }, icon(ic), h('small', { text: lab }));
    const ctrl = h('div.pkctrl', null, h('div.pkgrp', null, btn('L', 'left', 'Links'), btn('R', 'right', 'Rechts')), h('div.pkgrp', null, btn('D', 'down', 'Rutschen'), btn('J', 'up', 'Springen')));
    const wrap = h('div.hswrap.pkwrap', null, hud, hint, host, ctrl);
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host), x = C.x;
    // Eingaben
    const keys = { L: 0, R: 0, D: 0, J: 0 }; let jumpQ = 0;
    const press = (k, on) => { if (on && k === 'J' && !keys.J) jumpQ = 0.14; keys[k] = on ? 1 : 0; if (on) started = started || true; };
    ctrl.querySelectorAll('.pkbtn').forEach((b) => {
      const k = b.getAttribute('data-k'), ids = new Set();
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); ids.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } press(k, true); b.classList.add('on'); });
      const up = (e) => { ids.delete(e.pointerId); if (!ids.size) { press(k, false); b.classList.remove('on'); } };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const KM = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowDown: 'D', KeyS: 'D', ArrowUp: 'J', KeyW: 'J', Space: 'J' };
    const kd = (e) => { const k = KM[e.code]; if (!k) return; e.preventDefault(); if (!e.repeat) press(k, true); };
    const ku = (e) => { const k = KM[e.code]; if (!k) return; e.preventDefault(); press(k, false); };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);

    // Zustand
    const P = { x: C0.start[0] * T, y: C0.start[1] * T, vx: 0, vy: 0, h: STAND, ground: false, wall: 0, wallT: 0, slide: 0, face: 1, leg: 0, coyote: 0, lockX: 0, boost: 0 };
    if (window.__pkDebug) window.__pk = { P, press: (k, on) => press(k, on) };
    let started = false, time = 0, done = false, raf = 0, last = 0, falls = 0, cp = C0.start[0] * T, flash = 0, msg = '', msgT = 0;
    const got = new Set(), puffs = [];
    const tile = (tx, ty) => (tx < 0 || tx >= C0.W ? '#' : ty < 0 ? '.' : ty >= ROWS ? '.' : grid[ty][tx]);
    const solid = (c) => c === '#' || c === '=';
    function hitsSolid(px, py, ph) {   // px = Mitte, py = Füße
      const x0 = Math.floor((px - PW / 2) / T), x1 = Math.floor((px + PW / 2 - 0.01) / T), y0 = Math.floor((py - ph) / T), y1 = Math.floor((py - 0.01) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tile(tx, ty))) return true;
      return false;
    }
    function respawn() {
      falls++; flash = 0.35; msg = 'Autsch! Zurück zum letzten Fähnchen.'; msgT = 1.6;
      P.x = cp; P.y = (cp === C0.start[0] * T ? C0.start[1] : G) * T; P.vx = 0; P.vy = 0; P.slide = 0; P.h = STAND;
      for (let ty = G; ty > 0 && hitsSolid(P.x, P.y, STAND); ty--) P.y -= T;
    }
    function step(dt) {
      if (started && !done) time += dt;
      const want = keys.R - keys.L;
      if (want) P.face = want;
      // Rutschen
      const canStand = !hitsSolid(P.x, P.y, STAND);
      if (keys.D && P.ground && Math.abs(P.vx) > 60 && !P.slide) { P.slide = 0.55; P.vx = Math.sign(P.vx) * Math.max(Math.abs(P.vx), RUN * 1.15); }
      if (P.slide > 0) { P.slide -= dt; if (P.slide <= 0 && !canStand) P.slide = 0.05; }
      if (keys.D && P.ground && !P.slide) P.h = LOW; else P.h = P.slide > 0 || !canStand ? LOW : STAND;
      // waagerecht
      if (P.lockX > 0) P.lockX -= dt;
      else if (P.slide > 0) P.vx *= Math.pow(0.4, dt);
      else if (P.h === LOW && P.ground) P.vx += (want * RUN * 0.45 - P.vx) * Math.min(1, dt * 10);
      else { const tgt = want * RUN, a = P.ground ? ACC : ACC * 0.55; P.vx += Math.max(-a * dt, Math.min(a * dt, tgt - P.vx)); }
      // Sprung (mit kurzer Puffer- und Kantenzeit)
      jumpQ -= dt; P.coyote -= dt; P.wallT -= dt;
      if (jumpQ > 0) {
        if ((P.ground || P.coyote > 0) && canStand) { P.vy = -JUMP; P.ground = false; P.coyote = 0; jumpQ = 0; P.slide = 0; puff(P.x, P.y, 5); }
        else if (P.wallT > 0 && P.wall) { P.vy = -WALLJ; P.vx = -P.wall * RUN * 1.1; P.lockX = 0.16; P.face = -P.wall; P.wallT = 0; jumpQ = 0; puff(P.x + P.wall * PW / 2, P.y - 30, 4); }
      }
      if (P.vy >= 0) P.boost = 0;
      if (!keys.J && !P.boost && P.vy < -300) P.vy += GRAV * dt * 1.2;   // kurz tippen = kleiner Sprung
      P.vy = Math.min(P.vy + GRAV * dt, 1400);
      // Wand rutschen
      if (!P.ground && P.wall && P.vy > 130 && want === P.wall) P.vy = 130;
      // Bewegung x
      const nx = P.x + P.vx * dt;
      if (!hitsSolid(nx, P.y, P.h)) P.x = nx;
      else { const dir = Math.sign(P.vx); P.x = dir > 0 ? Math.floor((nx + PW / 2) / T) * T - PW / 2 - 0.01 : Math.floor((nx - PW / 2) / T + 1) * T + PW / 2 + 0.01; P.vx = 0; }
      // Wand fühlen
      P.wall = 0;
      if (!P.ground) { if (hitsSolid(P.x + 3, P.y - 8, P.h - 16)) P.wall = 1; else if (hitsSolid(P.x - 3, P.y - 8, P.h - 16)) P.wall = -1; if (P.wall) P.wallT = 0.12; }
      // Bewegung y
      const ny = P.y + P.vy * dt, was = P.ground;
      if (!hitsSolid(P.x, ny, P.h)) { P.y = ny; P.ground = false; }
      else if (P.vy > 0) { P.y = Math.floor(ny / T) * T; P.vy = 0; P.ground = true; }
      else { P.y = Math.floor((ny - P.h) / T + 1) * T + P.h + 0.01; P.vy = 0; }
      if (P.ground && !hitsSolid(P.x, P.y + 2, 2)) P.ground = false;
      if (was && !P.ground && P.vy >= 0) P.coyote = 0.1;
      if (!was && P.ground) puff(P.x, P.y, 4);
      // Federn, Stacheln, Sterne, Fähnchen, Ziel
      const fx0 = Math.floor((P.x - PW / 2 + 3) / T), fx1 = Math.floor((P.x + PW / 2 - 3) / T), ty0 = Math.floor((P.y - P.h) / T), ty1 = Math.floor((P.y - 1) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = fx0; tx <= fx1; tx++) {
        const c = tile(tx, ty);
        if (c === '^' && P.y > ty * T + T * 0.45) return respawn();
        if (c === 'S' && P.vy >= 0 && P.y > ty * T + T * 0.5) { P.vy = -SPRING; P.boost = 1; P.ground = false; P.slide = 0; puff(P.x, P.y, 6); }
      }
      if (P.y > (ROWS + 2) * T) return respawn();
      for (const [i, [sx, sy]] of C0.stars.entries()) if (!got.has(i) && Math.abs(P.x - sx * T) < 26 && Math.abs(P.y - P.h / 2 - sy * T) < 40) { got.add(i); puff(sx * T, sy * T, 8, '#f2b632'); }
      for (const c of C0.checks) if (P.x > c * T && cp < c * T + T / 2) { cp = c * T + T / 2; msg = 'Fähnchen erreicht!'; msgT = 1.2; }
      if (!done && P.x > C0.finish * T) { done = true; msg = 'Ziel!'; msgT = 3; setTimeout(() => finish(), 1300); }
      // Animation
      P.leg += dt * (P.ground ? Math.abs(P.vx) / 26 : 0);
      for (const q of puffs) q.t += dt;
      while (puffs.length && puffs[0].t > 0.5) puffs.shift();
      flash = Math.max(0, flash - dt); msgT = Math.max(0, msgT - dt);
    }
    function puff(px, py, n, col) { for (let i = 0; i < n; i++) puffs.push({ x: px + (Math.random() - 0.5) * 20, y: py - Math.random() * 6, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 60, t: 0, col }); }
    const score = () => Math.max(0, Math.round((time - got.size) * 10) / 10);

    // ---------- Zeichnen ----------
    const blockFill = dark ? '#2a3140' : '#e6eaf2';
    function drawTile(c, tx, ty) {
      const X = tx * T, Y = ty * T;
      if (c === '#') {
        const above = tile(tx, ty - 1);
        x.fillStyle = blockFill; x.fillRect(X, Y, T, T);
        if (!solid(above) && above !== '^') { x.fillStyle = dark ? '#3f7a52' : '#8fd19e'; x.fillRect(X, Y, T, 7); }
      } else if (c === '=') {   // Lineal
        const yy = Y + 8, hh = T - 16;
        x.fillStyle = dark ? '#8a7440' : '#f3d77a'; x.fillRect(X, yy, T, hh);
        x.strokeStyle = ink; x.lineWidth = 1.2; x.beginPath();
        for (let k = 0; k < 8; k++) { const lx = X + k * 5 + 2.5, ll = k % 2 ? 5 : 9; x.moveTo(lx, yy); x.lineTo(lx, yy + ll); }
        x.stroke();
        x.lineWidth = 2; x.beginPath(); x.moveTo(X, yy); x.lineTo(X + T, yy); x.moveTo(X, yy + hh); x.lineTo(X + T, yy + hh); x.stroke();
      } else if (c === '^') {
        x.fillStyle = dark ? 'rgba(224,72,62,.35)' : 'rgba(224,72,62,.22)'; x.strokeStyle = '#e0483e'; x.lineWidth = 2.2; x.lineJoin = 'round';
        x.beginPath(); for (let k = 0; k < 3; k++) { const bx = X + k * T / 3; x.moveTo(bx, Y + T); x.lineTo(bx + T / 6, Y + T * 0.42); x.lineTo(bx + T / 3, Y + T); } x.fill(); x.stroke();
      } else if (c === 'S') {
        x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); x.moveTo(X + 6, Y + T);
        for (let k = 0; k < 5; k++) x.lineTo(X + (k % 2 ? 8 : T - 8), Y + T - 4 - k * 4);
        x.stroke(); x.fillStyle = '#4fbf7a'; x.strokeStyle = ink; prect(x, X + 2, Y + T - 26, T - 4, 7, tx, 0.5); x.fill(); x.stroke();
      }
    }
    function blockOutline(x0, x1) {   // Umriss + Schraffur der festen Blöcke als Kritzel
      x.save(); x.beginPath();
      for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) if (tile(tx, ty) === '#') x.rect(tx * T, ty * T, T, T);
      x.clip(); hatch(x, x0 * T, 0, (x1 - x0 + 1) * T, ROWS * T, dark ? '#8fa6f7' : '#6c7fb8', 9, dark ? 0.22 : 0.3, 1.1); x.restore();
      x.strokeStyle = ink; x.lineWidth = 2.4; x.lineCap = 'round';
      for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tile(tx, ty) !== '#') continue;
        const X = tx * T, Y = ty * T, sd = tx * 31 + ty * 7;
        if (tile(tx, ty - 1) !== '#') pline(x, X, Y, X + T, Y, sd, 0.6);
        if (ty + 1 < ROWS && tile(tx, ty + 1) !== '#') pline(x, X, Y + T, X + T, Y + T, sd + 1, 0.6);
        if (tile(tx - 1, ty) !== '#') pline(x, X, Y, X, Y + T, sd + 2, 0.6);
        if (tile(tx + 1, ty) !== '#') pline(x, X + T, Y, X + T, Y + T, sd + 3, 0.6);
      }
    }
    function flag(X, Y, col, checkered) {
      x.strokeStyle = ink; x.lineWidth = 3; pline(x, X, Y, X, Y - 92, X, 0.5);
      if (checkered) { const s = 11; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { x.fillStyle = (i + j) % 2 ? ink : (dark ? '#e8ecf4' : '#fff'); x.fillRect(X + i * s, Y - 92 + j * s, s, s); } x.strokeRect(X, Y - 92, 4 * s, 3 * s); }
      else { x.fillStyle = col; x.beginPath(); x.moveTo(X, Y - 92); x.lineTo(X + 34, Y - 82); x.lineTo(X, Y - 70); x.closePath(); x.fill(); x.lineWidth = 2; x.stroke(); }
    }
    function star(cx, cy, r, col) {
      x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath();
      x.fillStyle = col; x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
    }
    function line(pts, w) { x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
    function drawMan(t) {
      const X = P.x, Y = P.y, f = P.face, c = p.color;
      x.save(); x.strokeStyle = c; x.lineCap = 'round'; x.lineJoin = 'round';
      if (P.h === LOW) {   // rutschen / ducken
        const hip = [X - f * 8, Y - 8], neck = [X + f * 12, Y - 20];
        line([hip, [X - f * 22, Y - 2]], 4); line([hip, [X - f * 4, Y - 1], [X + f * 6, Y - 1]], 4); line([hip, neck], 4);
        line([[neck[0], neck[1] + 2], [X - f * 14, Y - 22]], 3.6);
        x.lineWidth = 4; x.beginPath(); x.arc(X + f * 20, Y - 24, 8, 0, 7); x.stroke();
      } else {
        const s = Math.sin(P.leg), hip = [X, Y - 26], neck = [X + f * 4, Y - 48];
        if (!P.ground && P.wall) { line([hip, [X + P.wall * 10, Y - 16], [X + P.wall * 12, Y - 4]], 4); line([hip, [X - P.wall * 4, Y - 12], [X + P.wall * 2, Y - 2]], 4); }
        else if (!P.ground) { line([hip, [X + f * 12, Y - 16], [X + f * 6, Y - 4]], 4); line([hip, [X - f * 10, Y - 14], [X - f * 18, Y - 8]], 4); }
        else if (Math.abs(P.vx) < 20) { line([hip, [X + 5, Y - 12], [X + 6, Y]], 4); line([hip, [X - 5, Y - 12], [X - 6, Y]], 4); }
        else { line([hip, [X + s * 12, Y - 12], [X + s * 16, Y]], 4); line([hip, [X - s * 12, Y - 12], [X - s * 16 - 2, Y]], 4); }
        line([hip, neck], 4);
        const a = !P.ground ? (P.wall ? -2 : -1.2) : Math.cos(P.leg) * 0.9 * Math.min(1, Math.abs(P.vx) / 120);
        line([[neck[0], neck[1] + 4], [neck[0] + 12 * Math.cos(a) * f, neck[1] + 12 + 12 * Math.sin(a)]], 3.6);
        line([[neck[0], neck[1] + 4], [neck[0] - 12 * Math.cos(a) * f, neck[1] + 12 - 12 * Math.sin(a)]], 3.6);
        x.lineWidth = 4; x.beginPath(); x.arc(X + f * 6, Y - 57, 8, 0, 7); x.stroke();
        x.fillStyle = c; x.beginPath(); x.arc(X + f * 9, Y - 59, 1.8, 0, 7); x.fill();
      }
      x.restore();
    }
    function draw(t) {
      const cw = C.cw, ch = C.ch, k = Math.min(ch / (ROWS * T), cw / (11 * T)), vw = cw / k;
      const camX = Math.max(0, Math.min(C0.W * T - vw, P.x - vw * 0.38)), oy = (ch - ROWS * T * k) / 2;
      x.save(); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, cw, ch, dark, T * k, -camX * k, oy);
      x.translate(0, oy); x.scale(k, k); x.translate(-camX, 0);
      const tx0 = Math.max(0, Math.floor(camX / T) - 1), tx1 = Math.min(C0.W - 1, Math.ceil((camX + vw) / T) + 1);
      for (let ty = 0; ty < ROWS; ty++) for (let tx = tx0; tx <= tx1; tx++) { const c = grid[ty][tx]; if (c !== '.') drawTile(c, tx, ty); }
      blockOutline(tx0, tx1);
      for (const c of C0.checks) { const hitC = cp >= c * T; flag(c * T + T / 2, G * T, hitC ? p.color : (dark ? '#5a6070' : '#c4c8d0'), false); }
      flag(C0.finish * T + T / 2, G * T, null, true);
      x.font = `700 22px ${FONT}`; x.fillStyle = ink; x.textAlign = 'center'; x.fillText('ZIEL', C0.finish * T + T / 2 + 22, G * T - 104);
      for (const [i, [sx, sy]] of C0.stars.entries()) if (!got.has(i)) star(sx * T, sy * T + Math.sin(t / 300 + i) * 3, 13, '#f2c94c');
      x.fillStyle = dark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.2)';
      for (const q of puffs) { x.globalAlpha = 1 - q.t / 0.5; x.fillStyle = q.col || (dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.25)'); x.beginPath(); x.arc(q.x + q.vx * q.t, q.y + q.vy * q.t, 3 + q.t * 9, 0, 7); x.fill(); }
      x.globalAlpha = 1;
      drawMan(t);
      x.restore();
      if (flash > 0) { x.fillStyle = `rgba(224,72,62,${flash * 0.5})`; x.fillRect(0, 0, cw, ch); }
      if (!started) msgBox(cw, ch, 'Los geht’s, wenn du dich bewegst');
      else if (msgT > 0) msgBox(cw, ch, msg);
    }
    function msgBox(cw, ch, txt) {
      x.save(); x.font = `700 ${Math.round(Math.max(18, Math.min(28, cw / 26)))}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const w = Math.min(cw - 24, x.measureText(txt).width + 40);
      x.fillStyle = dark ? 'rgba(27,31,40,.92)' : 'rgba(251,250,245,.94)'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, cw / 2 - w / 2, 14, w, 46, 3, 1); x.fill(); x.stroke();
      x.fillStyle = ink; x.fillText(txt, cw / 2, 38, w - 20); x.restore();
    }
    function frame(t) {
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
      const n = dt > 0.017 ? 2 : 1; for (let i = 0; i < n; i++) step(dt / n);
      els.t.textContent = `${(Math.round(time * 10) / 10).toFixed(1).replace('.', ',')} s`;
      els.s.textContent = `${got.size} / ${C0.stars.length}`;
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); };
    let fin = false;
    function finish() { if (fin) return; fin = true; cleanup(); resolve(fx.signal.aborted ? null : { time: score(), raw: time, stars: got.size, falls }); }
    fx.signal.addEventListener('abort', () => { if (!fin) { fin = true; cleanup(); resolve(null); } }, { once: true });
    raf = requestAnimationFrame(frame);
  });
}
const fmt = (s) => `${String((Math.round(s * 10) / 10).toFixed(1)).replace('.', ',')} s`;

export function parkour(fx, A, B) {
  return (async () => {
    if (!B) { const r = await runCourse(fx, A, {}); return r ? { score: r.time } : null; }
    const res = [];
    for (const [i, p] of [A, B].entries()) {
      const ok = await turnCard(fx, p, `${p.name} ist dran`, i ? `Zu schlagen: ${fmt(res[0].time)}` : `Erst läuft ${A.name}, dann ${B.name}. Die schnellste Zeit gewinnt. Jeder Stern zieht 1 Sekunde ab.`, 'Los geht’s', 'parkour');
      if (!ok || fx.signal.aborted) return null;
      const r = await runCourse(fx, p, { beat: i ? res[0].time : null });
      if (!r || fx.signal.aborted) return null;
      res.push(r);
    }
    const [a, b] = res.map((r) => r.time);
    return { w: a < b ? 0 : b < a ? 1 : null, detail: `${A.name}: ${fmt(a)} · ${B.name}: ${fmt(b)}` };
  })();
}
