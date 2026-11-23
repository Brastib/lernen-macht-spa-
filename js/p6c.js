// Paket 6 (Teil 2): Burgwache (Weg malen, Türme bauen, Gegner aufhalten) und Kritzelflipper (Flipper auf Papier).
// Beide als Rekord allein oder nacheinander im Duell (mehr Punkte gewinnt).
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, rng } from './sketch.js';
import { banner, fit, toWorld, resample } from './p6a.js';
import { seq, frameUI, overText } from './hsgames.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smoothOpen(p, n = 4) {
  for (let k = 0; k < n; k++) p = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : [(p[i - 1][0] + q[0] * 2 + p[i + 1][0]) / 4, (p[i - 1][1] + q[1] * 2 + p[i + 1][1]) / 4]));
  return p;
}
function segDist(px, py, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby || 1;
  const t = clamp(((px - a[0]) * abx + (py - a[1]) * aby) / l2, 0, 1);
  return Math.hypot(px - a[0] - abx * t, py - a[1] - aby * t);
}

// ======================================================================
// Burgwache
// ======================================================================
const TW = 1000, TH = 640, PW = 46, STEP = 8, MAXW = 12;
const TOWERS = {
  pencil: { name: 'Bleistift', cost: 50, range: 135, rate: 0.45, dmg: 9, speed: 640, color: '#f2b632', ic: 'pen' },
  eraser: { name: 'Radierer', cost: 80, range: 118, rate: 1.4, dmg: 22, speed: 420, splash: 58, color: '#ff7ac8', ic: 'eraser' },
  ink: { name: 'Tinte', cost: 60, range: 118, rate: 0.9, dmg: 4, speed: 520, slow: 0.5, color: '#4f7cff', ic: 'drop' },
};
const FOES = {
  blob: { hp: 34, sp: 58, r: 15, pay: 6, color: '#2fbf71' },
  fast: { hp: 20, sp: 108, r: 11, pay: 5, color: '#f2b632' },
  tank: { hp: 150, sp: 36, r: 20, pay: 14, color: '#a46bff' },
  boss: { hp: 760, sp: 29, r: 28, pay: 70, color: '#e0483e', lives: 5 },
};
function randomPath(R) {
  const pts = [[10, 80 + R() * (TH - 160)]], n = 6;
  for (let i = 1; i < n; i++) pts.push([i / n * TW, 70 + R() * (TH - 140)]);
  pts.push([TW - 60, 120 + R() * (TH - 240)]);
  return smoothOpen(resample(pts, STEP), 10);
}
export function pathSheet(fx, p, R, opt = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    let path = null, cur = null;
    const info = h('p.hshint', { text: 'Mal den Weg der Gegner mit dem Finger: vom Anfang bis zu deiner Burg. Oder nimm einen Zufallsweg.' });
    const ok = h('button.btn.primary', { text: opt.okText || 'Los geht’s', on: { click: () => { if (path) { cleanup(); resolve(path); } } } });
    const host = h('div.hsarea');
    fx.stage.replaceChildren(h('div.hswrap', null, h('div.hshud', null, chip(p, h('small', { text: 'malt den Weg' })), h('span.bsspacer'),
      h('button.btn', { text: 'Zufallsweg', on: { click: () => { path = randomPath(R); info.textContent = 'Fertig! Du kannst neu malen oder anfangen.'; draw(); } } }), ok), opt.picker ? opt.picker((d) => { path = d; info.textContent = 'Gespeicherter Weg geladen.'; draw(); }) : null, info, host));
    const C = canvasBox(host), x = C.x;
    const draw = () => {
      const g = fit(C, TW, TH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.strokeStyle = ink; x.lineWidth = 3; prect(x, 0, 0, TW, TH, 5, 1.2); x.stroke();
      if (path) { drawPath(x, path, dark, ink); castle(x, path[path.length - 1], p.color, ink, dark); portal(x, path[0], ink, dark, 0); }
      if (cur) { x.strokeStyle = p.color; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); cur.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
      ok.disabled = !path;
    };
    const ro = new ResizeObserver(draw); ro.observe(host);
    const at = (e) => { const g = fit(C, TW, TH), q = toWorld(C, g, e); return [clamp(q[0], 30, TW - 30), clamp(q[1], 30, TH - 30)]; };
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cur = [at(e)]; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } draw(); });
    C.cv.addEventListener('pointermove', (e) => { if (!cur) return; const q = at(e), l = cur[cur.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 6) cur.push(q); draw(); });
    C.cv.addEventListener('pointerup', () => {
      if (!cur) return; const pts = cur; cur = null;
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len < 800) { info.textContent = 'Der Weg ist zu kurz. Mal einen längeren Weg.'; draw(); return; }
      path = smoothOpen(resample(pts, STEP), 6); info.textContent = 'Super Weg! Anfangen oder neu malen.'; draw();
    });
    const cleanup = () => { ro.disconnect(); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    draw();
  });
}
function drawPath(x, t, dark, ink) {
  const path = () => { x.beginPath(); t.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); };
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = ink; x.lineWidth = PW + 6; path(); x.stroke();
  x.strokeStyle = dark ? '#4a4234' : '#eadcc0'; x.lineWidth = PW; path(); x.stroke();
  x.strokeStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(120,90,40,.25)'; x.lineWidth = 2; x.setLineDash([3, 14]); path(); x.stroke(); x.setLineDash([]);
}
function castle(x, [cx, cy], color, ink, dark) {
  x.save(); x.translate(cx, cy - 6); x.lineJoin = 'round';
  x.fillStyle = dark ? '#2a2f3b' : '#fff'; x.strokeStyle = ink; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(-30, 26); x.lineTo(-30, -14); for (let k = 0; k < 4; k++) { const a = -30 + k * 15; x.lineTo(a, -24); x.lineTo(a + 7.5, -24); x.lineTo(a + 7.5, -14); x.lineTo(a + 15, -14); } x.lineTo(30, 26); x.closePath(); x.fill(); x.stroke();
  hatch(x, -30, -14, 60, 40, color, 7, 0.5, 1.2);
  x.fillStyle = ink; x.beginPath(); x.moveTo(-8, 26); x.lineTo(-8, 10); x.arc(0, 10, 8, Math.PI, 0); x.lineTo(8, 26); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(0, -24); x.lineTo(0, -46); x.stroke(); x.fillStyle = color; x.beginPath(); x.moveTo(0, -46); x.lineTo(18, -40); x.lineTo(0, -34); x.closePath(); x.fill(); x.stroke();
  x.restore();
}
function portal(x, [cx, cy], ink, dark, tm) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = dark ? '#0d0f14' : '#26262b'; x.beginPath(); x.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#a46bff'; x.lineWidth = 2; x.beginPath(); for (let k = 0; k < 30; k++) { const a = k * 0.6 + tm * 2, r = 4 + k * 0.6; k ? x.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r); } x.stroke();
  x.strokeStyle = ink; x.lineWidth = 2.5; x.beginPath(); x.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2); x.stroke();
  x.restore();
}
function waveList(n) {
  const out = [], cnt = 6 + n * 2;
  for (let i = 0; i < cnt; i++) out.push(n >= 4 && i % 4 === 3 ? 'tank' : n >= 2 && i % 3 === 1 ? 'fast' : 'blob');
  if (n % 5 === 0 || n === MAXW) out.push('boss');
  return out;
}
function towerGame(fx, p, opts = {}) {
  return (async () => {
    const R = rng((Math.random() * 1e9) | 0);
    const { mapPicker } = await import('./hub.js');
    const path = await pathSheet(fx, p, R, { picker: (pick) => mapPicker('tower', [p], pick) });
    if (!path || fx.signal.aborted) return null;
    fx.stage.replaceChildren();
    return new Promise((resolve) => {
      const dark = isDark(), ink = inkOf(dark);
      const ui = frameUI(fx, p, { stats: [['wave', 'Welle'], ['lives', 'Leben'], ['coins', 'Münzen'], ['score', 'Punkte']] });
      const hint = h('p.hshint', { text: 'Tippe neben den Weg, um einen Turm zu bauen. Tippe einen Turm an, um ihn zu verbessern.' });
      ui.hud.after(hint);
      const C = canvasBox(ui.area), x = C.x;
      const bar = h('div.tdbar'); ui.wrap.append(bar);
      const L = path.length, PLEN = (L - 1) * STEP;
      let coins = 130, lives = 10, wave = 0, score = 0, build = 'pencil', sel = null, speed = 1, running = false, over = false;
      let foes = [], shots = [], pops = [], towers = [], queue = [], spawnT = 0, raf = 0, last = 0, msg = `${p.name}: Türme bauen, dann Welle starten`, msgT = 2.2, g = null, hover = null;
      const posAt = (s) => { const f = clamp(s / STEP, 0, L - 1.001), i = Math.floor(f), t = f - i; return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t]; };
      const upgCost = (t) => Math.round(TOWERS[t.k].cost * 0.8 * t.lv);
      const sellVal = (t) => Math.round(t.spent * 0.6);
      function renderBar() {
        const btn = (cls, ic, a, b, on, dis, extra) => h('button.tdbtn' + cls, { disabled: dis || null, style: extra, on: { click: on } }, icon(ic), h('span', null, h('b', { text: a }), h('small', { text: b })));
        const left = sel
          ? [btn('.sel', TOWERS[sel.k].ic, `${TOWERS[sel.k].name} Stufe ${sel.lv}`, `Trifft: ${Math.round(sel.dmg)} · Weite: ${Math.round(sel.range)}`, () => {}, false, { '--tc': TOWERS[sel.k].color }),
            sel.lv < 3 ? btn('', 'arup', 'Verbessern', `${upgCost(sel)} Münzen`, () => upgrade(sel), coins < upgCost(sel)) : null,
            btn('', 'trash', 'Verkaufen', `+${sellVal(sel)} Münzen`, () => sell(sel)),
            btn('', 'close', 'Fertig', 'Auswahl weg', () => { sel = null; renderBar(); })]
          : Object.entries(TOWERS).map(([k, t]) => btn(build === k ? '.on' : '', t.ic, t.name, `${t.cost} Münzen`, () => { build = k; renderBar(); }, false, { '--tc': t.color }));
        bar.replaceChildren(h('div.tdgroup', null, ...left), h('span.bsspacer'),
          h('div.tdgroup', null, btn(speed === 2 ? '.on' : '', 'bolt', speed === 2 ? 'Schnell' : 'Normal', 'Tempo', () => { speed = speed === 1 ? 2 : 1; renderBar(); }),
            btn('.go', 'play', running ? `Welle ${wave} läuft` : `Welle ${wave + 1} starten`, `von ${MAXW}`, () => startWave(), running || over)));
      }
      const hud = () => { ui.set('wave', `${wave}/${MAXW}`); ui.set('lives', lives); ui.set('coins', coins); ui.set('score', score); };
      function startWave() {
        if (running || over) return; wave++; running = true; queue = waveList(wave); spawnT = 0.3; msg = `Welle ${wave}`; msgT = 1.2; hud(); renderBar();
        hint.textContent = 'Du kannst auch während der Welle bauen.';
      }
      function upgrade(t) { const c = upgCost(t); if (coins < c || t.lv >= 3) return; coins -= c; t.spent += c; t.lv++; t.dmg *= 1.55; t.range *= 1.12; t.rate *= 0.85; hud(); renderBar(); }
      function sell(t) { coins += sellVal(t); towers = towers.filter((q) => q !== t); sel = null; hud(); renderBar(); }
      const canPlace = (wx, wy) => {
        if (wx < 26 || wy < 26 || wx > TW - 26 || wy > TH - 26) return false;
        for (let i = 0; i < L - 1; i += 2) if (segDist(wx, wy, path[i], path[Math.min(L - 1, i + 2)]) < PW / 2 + 22) return false;
        if (Math.hypot(wx - path[L - 1][0], wy - path[L - 1][1]) < 60) return false;
        return towers.every((t) => Math.hypot(t.x - wx, t.y - wy) > 46);
      };
      const finish = () => {
        if (over) return; over = true; running = false; renderBar();
        const won = lives > 0 && wave >= MAXW; if (won) score += lives * 50; hud();
        msg = won ? `Burg gehalten! ${score} Punkte` : `${score} Punkte`; msgT = 9;
        setTimeout(() => { cleanup(); resolve(score); }, 1800);
      };
      ui.finish(finish);
      const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); };
      fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
      C.cv.addEventListener('pointermove', (e) => { if (g && e.pointerType === 'mouse') hover = toWorld(C, g, e); });
      C.cv.addEventListener('pointerleave', () => { hover = null; });
      C.cv.addEventListener('pointerdown', (e) => {
        if (over || !g) return; e.preventDefault();
        const [wx, wy] = toWorld(C, g, e);
        const hit = towers.find((t) => Math.hypot(t.x - wx, t.y - wy) < 24);
        if (hit) { sel = sel === hit ? null : hit; renderBar(); return; }
        if (sel) { sel = null; renderBar(); return; }
        if (!canPlace(wx, wy)) { msg = 'Hier geht kein Turm'; msgT = 0.9; return; }
        const T = TOWERS[build]; if (coins < T.cost) { msg = 'Zu wenig Münzen'; msgT = 0.9; return; }
        coins -= T.cost; towers.push({ k: build, x: wx, y: wy, lv: 1, spent: T.cost, dmg: T.dmg, range: T.range, rate: T.rate, cd: 0, a: -Math.PI / 2, kick: 0 }); hud(); renderBar();
      });
      function hurt(f, d) {
        if (f.dead) return; f.hp -= d; f.hit = 0.12;
        if (f.hp <= 0) { f.dead = true; const F = FOES[f.k]; coins += F.pay; score += F.pay * 10; pops.push({ x: f.x, y: f.y - 10, txt: `+${F.pay}`, t: 0 }); hud(); if (sel) renderBar(); }
      }
      function step(dt) {
        if (running) {
          spawnT -= dt;
          if (queue.length && spawnT <= 0) { const k = queue.shift(), F = FOES[k], m = 1 + (wave - 1) * 0.24; foes.push({ k, s: 0, x: path[0][0], y: path[0][1], hp: F.hp * m, max: F.hp * m, slowT: 0, wob: R() * 6, hit: 0 }); spawnT = k === 'fast' ? 0.5 : k === 'boss' ? 1.4 : 0.85; }
          if (!queue.length && !foes.length) {
            running = false; const bonus = 20 + wave * 5; coins += bonus; score += wave * 50; hud();
            if (wave >= MAXW) { finish(); return; }
            msg = `Welle geschafft! +${bonus} Münzen`; msgT = 1.6; renderBar();
          }
        }
        for (const f of foes) {
          const F = FOES[f.k]; f.slowT = Math.max(0, f.slowT - dt); f.hit = Math.max(0, f.hit - dt);
          f.s += F.sp * (f.slowT > 0 ? 0.5 : 1) * dt; [f.x, f.y] = posAt(f.s);
          if (f.s >= PLEN) { f.dead = true; f.home = true; lives -= F.lives || 1; hud(); msg = 'Die Burg wurde getroffen!'; msgT = 0.9; if (lives <= 0) { lives = 0; hud(); finish(); } }
        }
        foes = foes.filter((f) => !f.dead);
        for (const t of towers) {
          t.cd -= dt; t.kick = Math.max(0, t.kick - dt * 4);
          let best = null; for (const f of foes) if (Math.hypot(f.x - t.x, f.y - t.y) <= t.range && (!best || f.s > best.s)) best = f;
          if (best) t.a = Math.atan2(best.y - t.y, best.x - t.x);
          if (best && t.cd <= 0) { t.cd = t.rate; t.kick = 1; const T = TOWERS[t.k]; shots.push({ k: t.k, x: t.x + Math.cos(t.a) * 20, y: t.y + Math.sin(t.a) * 20, tg: best, dmg: t.dmg, sp: T.speed, lv: t.lv }); }
        }
        for (const s of shots) {
          const dx = s.tg.x - s.x, dy = s.tg.y - s.y, d = Math.hypot(dx, dy), mv = s.sp * dt;
          if (d <= mv + 4) {
            s.done = true; const T = TOWERS[s.k];
            if (T.splash) { foes.forEach((f) => { if (Math.hypot(f.x - s.tg.x, f.y - s.tg.y) < T.splash) hurt(f, s.dmg); }); pops.push({ x: s.tg.x, y: s.tg.y, ring: T.splash, t: 0 }); }
            else { hurt(s.tg, s.dmg); if (T.slow) s.tg.slowT = 1.6 + s.lv * 0.3; }
          } else { s.x += dx / d * mv; s.y += dy / d * mv; }
          if (s.tg.dead && !s.done && !TOWERS[s.k].splash) s.done = true;
        }
        shots = shots.filter((s) => !s.done);
        pops.forEach((q) => { q.t += dt; }); pops = pops.filter((q) => q.t < 0.8);
      }
      function drawTower(t, tm) {
        const T = TOWERS[t.k]; x.save(); x.translate(t.x, t.y);
        x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(2, 6, 22, 14, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = dark ? shade(T.color, -0.35) : shade(T.color, 0.6); x.beginPath(); x.arc(0, 0, 20, 0, Math.PI * 2); x.fill();
        x.save(); x.beginPath(); x.arc(0, 0, 20, 0, Math.PI * 2); x.clip(); hatch(x, -20, -20, 40, 40, T.color, 5, 0.8, 1.4); x.restore();
        x.strokeStyle = ink; x.lineWidth = 2.2; pcirc(x, 0, 0, 20, t.x | 0, 0.06); x.stroke();
        x.rotate(t.a); x.translate(-t.kick * 4, 0); x.lineJoin = 'round';
        if (t.k === 'pencil') {
          x.fillStyle = '#f2c230'; x.beginPath(); x.rect(-8, -5, 22, 10); x.fill(); x.stroke();
          x.fillStyle = '#f4dcb0'; x.beginPath(); x.moveTo(14, -5); x.lineTo(26, 0); x.lineTo(14, 5); x.closePath(); x.fill(); x.stroke();
          x.fillStyle = ink; x.beginPath(); x.moveTo(22, -1.7); x.lineTo(26, 0); x.lineTo(22, 1.7); x.fill();
          x.fillStyle = '#ff7ac8'; x.fillRect(-12, -5, 4, 10); x.strokeRect(-12, -5, 4, 10);
        } else if (t.k === 'eraser') {
          x.fillStyle = '#ff9fd4'; x.beginPath(); x.roundRect(-10, -9, 30, 18, 4); x.fill(); x.stroke();
          x.fillStyle = '#4f7cff'; x.beginPath(); x.rect(-10, -9, 10, 18); x.fill(); x.stroke();
        } else {
          x.fillStyle = '#26262b'; x.beginPath(); x.roundRect(-10, -10, 20, 20, 5); x.fill(); x.strokeStyle = dark ? '#cfd6e6' : ink; x.stroke();
          x.fillStyle = '#4f7cff'; x.beginPath(); x.rect(8, -4, 12, 8); x.fill(); x.stroke();
        }
        x.restore();
        for (let k = 0; k < t.lv - 1; k++) { x.fillStyle = '#f2c230'; x.strokeStyle = ink; x.lineWidth = 1.2; x.beginPath(); x.arc(t.x - 6 + k * 12, t.y + 26, 4, 0, Math.PI * 2); x.fill(); x.stroke(); }
      }
      function drawFoe(f, tm) {
        const F = FOES[f.k], r = F.r, wob = Math.sin(tm * 8 + f.wob) * 1.5;
        x.save(); x.translate(f.x, f.y);
        x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(2, r * 0.7, r, r * 0.4, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = f.hit > 0 ? '#fff' : dark ? shade(F.color, -0.2) : shade(F.color, 0.35);
        x.beginPath(); for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, rr = r * (1 + 0.1 * Math.sin(a * 5 + tm * 6 + f.wob)) + (k % 2 ? wob : 0); k ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath();
        x.fill(); x.save(); x.clip(); hatch(x, -r - 3, -r - 3, r * 2 + 6, r * 2 + 6, F.color, 4, 0.9, 1.3); x.restore();
        x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(-r * 0.3, -r * 0.2, r * 0.25, 0, Math.PI * 2); x.arc(r * 0.3, -r * 0.2, r * 0.25, 0, Math.PI * 2); x.fill(); x.lineWidth = 1.2; x.stroke();
        x.fillStyle = '#26262b'; x.beginPath(); x.arc(-r * 0.26, -r * 0.16, r * 0.11, 0, Math.PI * 2); x.arc(r * 0.34, -r * 0.16, r * 0.11, 0, Math.PI * 2); x.fill();
        if (f.slowT > 0) { x.fillStyle = 'rgba(79,124,255,.35)'; x.beginPath(); x.arc(0, 0, r + 3, 0, Math.PI * 2); x.fill(); }
        if (f.k === 'boss') { x.translate(0, -r - 4); x.fillStyle = '#f2c230'; x.strokeStyle = ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-10, 4); x.lineTo(-12, -8); x.lineTo(-5, -2); x.lineTo(0, -10); x.lineTo(5, -2); x.lineTo(12, -8); x.lineTo(10, 4); x.closePath(); x.fill(); x.stroke(); x.translate(0, r + 4); }
        x.restore();
        if (f.hp < f.max) { const w = r * 2; x.fillStyle = dark ? '#2a2f3b' : '#fff'; x.fillRect(f.x - w / 2, f.y - r - 12, w, 5); x.fillStyle = '#e0483e'; x.fillRect(f.x - w / 2, f.y - r - 12, w * Math.max(0, f.hp / f.max), 5); x.strokeStyle = ink; x.lineWidth = 1; x.strokeRect(f.x - w / 2, f.y - r - 12, w, 5); }
      }
      function frame(tm) {
        if (fx.signal.aborted) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.04, last ? (tm - last) / 1000 : 0); last = tm; msgT = Math.max(0, msgT - dt);
        if (!over) for (let k = 0; k < speed; k++) step(dt);
        const ts = tm / 1000;
        g = fit(C, TW, TH); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
        x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
        x.strokeStyle = ink; x.lineWidth = 3; prect(x, 0, 0, TW, TH, 5, 1.2); x.stroke();
        drawPath(x, path, dark, ink); portal(x, path[0], ink, dark, ts); castle(x, path[L - 1], p.color, ink, dark);
        const showR = sel || (hover && !towers.some((t) => Math.hypot(t.x - hover[0], t.y - hover[1]) < 24) ? { x: hover[0], y: hover[1], range: TOWERS[build].range, ghost: true } : null);
        if (showR) {
          const okp = !showR.ghost || canPlace(showR.x, showR.y);
          x.fillStyle = okp ? 'rgba(79,124,255,.08)' : 'rgba(224,72,62,.1)'; x.strokeStyle = okp ? '#4f7cff' : '#e0483e'; x.lineWidth = 2; x.setLineDash([6, 8]);
          x.beginPath(); x.arc(showR.x, showR.y, showR.range, 0, Math.PI * 2); x.fill(); x.stroke(); x.setLineDash([]);
          if (showR.ghost) { x.globalAlpha = 0.5; x.fillStyle = TOWERS[build].color; x.beginPath(); x.arc(showR.x, showR.y, 20, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
        }
        towers.forEach((t) => drawTower(t, ts));
        if (sel) { x.strokeStyle = TOWERS[sel.k].color; x.lineWidth = 3; x.beginPath(); x.arc(sel.x, sel.y, 26, 0, Math.PI * 2); x.stroke(); }
        foes.forEach((f) => drawFoe(f, ts));
        shots.forEach((s) => {
          const T = TOWERS[s.k];
          if (s.k === 'pencil') { x.strokeStyle = ink; x.lineWidth = 2.5; x.beginPath(); const a = Math.atan2(s.tg.y - s.y, s.tg.x - s.x); x.moveTo(s.x - Math.cos(a) * 8, s.y - Math.sin(a) * 8); x.lineTo(s.x, s.y); x.stroke(); }
          else { x.fillStyle = T.color; x.strokeStyle = ink; x.lineWidth = 1.2; x.beginPath(); x.arc(s.x, s.y, s.k === 'eraser' ? 6 : 4.5, 0, Math.PI * 2); x.fill(); x.stroke(); }
        });
        pops.forEach((q) => {
          if (q.ring) { x.strokeStyle = '#ff7ac8'; x.globalAlpha = 1 - q.t / 0.8; x.lineWidth = 3; x.beginPath(); x.arc(q.x, q.y, q.ring * (0.4 + q.t), 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; return; }
          x.fillStyle = '#e0a106'; x.globalAlpha = 1 - q.t / 0.8; x.font = `800 18px ${FONT}`; x.textAlign = 'center'; x.fillText(q.txt, q.x, q.y - q.t * 30); x.globalAlpha = 1;
        });
        x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
        if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
      }
      hud(); renderBar(); raf = requestAnimationFrame(frame);
    });
  })();
}
export const tower = (fx, A, B) => seq(fx, A, B, towerGame, 'castle', 'Jeder malt seinen Weg und verteidigt seine Burg, 12 Wellen.');

// ======================================================================
// Kritzelflipper
// ======================================================================
const FW = 600, FH = 1000, BR = 12, GRAV = 1150;
function arcPts(cx, cy, r, a0, a1, n) { const o = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
function buildTable() {
  const W = [];
  const seg = (a, b, o = {}) => W.push({ a, b, r: o.r || 0, e: o.e ?? 0.55, kick: o.kick || 0, id: o.id || null, show: o.show !== false });
  seg([20, 1000], [20, 300]);
  const arc = arcPts(300, 300, 280, Math.PI, Math.PI * 2, 28); for (let k = 0; k < arc.length - 1; k++) seg(arc[k], arc[k + 1]);
  seg([580, 300], [580, 1000]);
  seg([540, 1000], [540, 400], { r: 3 });
  seg([540, 985], [580, 985], { e: 0.2 });
  seg([20, 770], [168, 872], { r: 3 }); seg([540, 770], [392, 872], { r: 3 });
  // Schleudern: Gummi-Kante schießt die Kugel weg
  seg([62, 650], [62, 745], { r: 4 }); seg([62, 745], [140, 792], { r: 4 }); seg([140, 792], [62, 650], { r: 4, kick: 430, id: 'slL', e: 0.7 });
  seg([498, 650], [498, 745], { r: 4 }); seg([498, 745], [420, 792], { r: 4 }); seg([420, 792], [498, 650], { r: 4, kick: 430, id: 'slR', e: 0.7 });
  // Pfosten zwischen den oberen Bahnen
  [160, 240, 320, 400].forEach((px) => seg([px, 100], [px, 140], { r: 5 }));
  return W;
}
const BUMPERS = [[190, 330], [370, 330], [280, 445]];
const LANES = [200, 280, 360];
const DROPS = [[440, 470], [485, 515], [530, 560]];
function flipperGame(fx, p, opts = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const ui = frameUI(fx, p, { stats: [['score', 'Punkte'], ['balls', 'Kugeln'], ['mult', 'Bonus']] });
    const hint = h('p.hshint', { text: 'Links oder rechts tippen = Flipper. Zum Abschießen halten und loslassen. Tastatur: A und L, Leertaste.' });
    ui.hud.after(hint);
    const C = canvasBox(ui.area), x = C.x, walls = buildTable();
    const FL = [{ px: 175, py: 880, s: 1, a: 0.5, pa: 0.5, up: false }, { px: 385, py: 880, s: -1, a: 0.5, pa: 0.5, up: false }];
    const LEN = 88, FR = 10, REST = 0.5, UP = -0.5;
    let ball = null, balls = 3, score = 0, mult = 1, lanes = [0, 0, 0], drops = [1, 1, 1], dropReset = 0, bumpFlash = [0, 0, 0], slFlash = { slL: 0, slR: 0 }, star = 0;
    let charging = false, power = 0, gate = false, save = 0, over = false, raf = 0, last = 0, msg = 'Halten und loslassen zum Abschießen', msgT = 2.2, pops = [], trail = [], g = null;
    const keys = new Set(), ptrs = new Map();
    const hud = () => { ui.set('score', score); ui.set('balls', balls); ui.set('mult', `×${mult}`); };
    const add = (n, px, py) => { const v = n * mult; score += v; pops.push({ x: px, y: py, txt: `+${v}`, t: 0 }); hud(); };
    const newBall = () => { ball = { x: 560, y: 972, vx: 0, vy: 0 }; gate = false; trail = []; };
    const ready = () => ball && ball.x > 540 && ball.y > 930 && Math.abs(ball.vy) < 30;
    function launch() { if (!ready()) return; ball.vy = -(1350 + power * 900); power = 0; charging = false; save = 4; }
    const leftOn = () => keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('ShiftLeft') || keys.has('KeyZ') || [...ptrs.values()].includes('L');
    const rightOn = () => keys.has('KeyL') || keys.has('ArrowRight') || keys.has('ShiftRight') || keys.has('Slash') || keys.has('KeyM') || [...ptrs.values()].includes('R');
    const onKey = (e) => {
      const k = e.code, launchK = k === 'Space' || k === 'Enter' || k === 'ArrowDown';
      if (!launchK && !/^(Key[ALZM]|Arrow|Shift|Slash)/.test(k)) return; e.preventDefault();
      if (e.type === 'keydown') { keys.add(k); if (launchK && ready()) charging = true; } else { keys.delete(k); if (launchK && charging) launch(); }
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    C.cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); const r = C.cv.getBoundingClientRect(); ptrs.set(e.pointerId, e.clientX - r.left < r.width / 2 ? 'L' : 'R');
      if (ready()) charging = true; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (charging && !ptrs.size && !keys.has('Space')) launch(); };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    const end = () => { if (over) return; over = true; ball = null; msg = `${score} Punkte`; msgT = 9; setTimeout(() => { cleanup(); resolve(score); }, 1600); };
    ui.finish(end);
    const tip = (f, a) => [f.px + f.s * Math.cos(a) * LEN, f.py + Math.sin(a) * LEN];
    function hitSeg(a, b, rr, e, vs) {
      const abx = b[0] - a[0], aby = b[1] - a[1], l2 = abx * abx + aby * aby || 1;
      const t = clamp(((ball.x - a[0]) * abx + (ball.y - a[1]) * aby) / l2, 0, 1);
      const qx = a[0] + abx * t, qy = a[1] + aby * t, dx = ball.x - qx, dy = ball.y - qy, d = Math.hypot(dx, dy), R = BR + rr;
      if (d >= R || d === 0) return null;
      const nx = dx / d, ny = dy / d; ball.x = qx + nx * R; ball.y = qy + ny * R;
      const vsx = vs ? vs[0] * t : 0, vsy = vs ? vs[1] * t : 0, rvx = ball.vx - vsx, rvy = ball.vy - vsy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; }
      return { nx, ny, vn };
    }
    function sub(dt) {
      // Flipper bewegen
      const want = [leftOn(), rightOn()];
      const tipV = FL.map((f, i) => {
        f.pa = f.a; const target = want[i] ? UP : REST, sp = want[i] ? 24 : 13;
        f.a = f.a > target ? Math.max(target, f.a - sp * dt) : Math.min(target, f.a + sp * dt);
        const t0 = tip(f, f.pa), t1 = tip(f, f.a); return [(t1[0] - t0[0]) / dt, (t1[1] - t0[1]) / dt];
      });
      if (!ball) return;
      ball.vy += GRAV * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (!gate && ball.x < 520 && ball.y < 600) gate = true;
      for (const w of walls) {
        const r = hitSeg(w.a, w.b, w.r, w.e);
        if (r && w.kick && -r.vn > 60) { ball.vx += r.nx * w.kick; ball.vy += r.ny * w.kick; slFlash[w.id] = 0.15; add(10, ball.x, ball.y); }
      }
      if (gate) hitSeg([540, 400], [580, 345], 3, 0.4);
      FL.forEach((f, i) => hitSeg([f.px, f.py], tip(f, f.a), FR, 0.35, tipV[i]));
      BUMPERS.forEach(([bx, by], i) => {
        const dx = ball.x - bx, dy = ball.y - by, d = Math.hypot(dx, dy), R = BR + 30;
        if (d < R && d > 0) { const nx = dx / d, ny = dy / d; ball.x = bx + nx * R; ball.y = by + ny * R; const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; } ball.vx += nx * 260; ball.vy += ny * 260; if (bumpFlash[i] <= 0.05) add(100, bx, by - 40); bumpFlash[i] = 0.18; }
      });
      DROPS.forEach(([y0, y1], i) => {
        if (!drops[i]) return; const r = hitSeg([528, y0], [528, y1], 5, 0.5);
        if (r) { drops[i] = 0; add(200, 500, (y0 + y1) / 2); if (!drops.some(Boolean)) { add(1000, 470, 500); msg = 'Alle Ziele! +1000'; msgT = 1.2; dropReset = 1.2; } }
      });
      LANES.forEach((lx, i) => { if (!lanes[i] && Math.hypot(ball.x - lx, ball.y - 120) < 20) { lanes[i] = 1; add(50, lx, 90); if (lanes.every(Boolean)) { lanes = [0, 0, 0]; mult = Math.min(5, mult + 1); hud(); add(500, 280, 160); msg = `Bonus ×${mult}!`; msgT = 1.2; } } });
      if (star <= 0 && Math.hypot(ball.x - 280, ball.y - 600) < 26) { star = 0.6; add(150, 280, 570); }
      const v = Math.hypot(ball.vx, ball.vy); if (v > 2400) { ball.vx *= 2400 / v; ball.vy *= 2400 / v; }
      if (ball.y > FH + 30) {
        if (save > 0) { msg = 'Glück gehabt: neue Kugel!'; msgT = 1.2; newBall(); return; }
        balls--; hud(); if (balls <= 0) { end(); return; }
        msg = balls === 1 ? 'Letzte Kugel!' : `Noch ${balls} Kugeln`; msgT = 1.2; newBall();
      }
    }
    function drawFlipper(f) {
      const [tx, ty] = tip(f, f.a);
      x.save(); x.lineCap = 'round';
      x.strokeStyle = ink; x.lineWidth = FR * 2 + 5; x.beginPath(); x.moveTo(f.px, f.py); x.lineTo(tx, ty); x.stroke();
      x.strokeStyle = dark ? shade(p.color, -0.1) : shade(p.color, 0.25); x.lineWidth = FR * 2; x.beginPath(); x.moveTo(f.px, f.py); x.lineTo(tx, ty); x.stroke();
      x.fillStyle = ink; x.beginPath(); x.arc(f.px, f.py, 4, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm; msgT = Math.max(0, msgT - dt);
      if (!over) {
        if (charging) power = Math.min(1, power + dt * 1.1);
        save = Math.max(0, save - dt); star = Math.max(0, star - dt); bumpFlash = bumpFlash.map((b) => Math.max(0, b - dt)); slFlash.slL = Math.max(0, slFlash.slL - dt); slFlash.slR = Math.max(0, slFlash.slR - dt);
        if (dropReset > 0) { dropReset -= dt; if (dropReset <= 0) drops = [1, 1, 1]; }
        for (let k = 0; k < 10; k++) sub(dt / 10);
        if (ball) { trail.push([ball.x, ball.y]); if (trail.length > 10) trail.shift(); }
        pops.forEach((q) => { q.t += dt; }); pops = pops.filter((q) => q.t < 0.9);
      }
      g = fit(C, FW, FH, 6); x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      // Tisch
      x.fillStyle = dark ? 'rgba(79,124,255,.07)' : 'rgba(79,124,255,.06)'; x.beginPath(); x.moveTo(20, 1000); x.lineTo(20, 300); x.arc(300, 300, 280, Math.PI, 0); x.lineTo(580, 1000); x.closePath(); x.fill();
      x.fillStyle = dark ? '#2a2f3b' : '#fff'; x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.globalAlpha = 0.5; x.fillStyle = ink; x.fillText('Kritzelflipper', 280, 720); x.globalAlpha = 1;
      x.lineCap = 'round'; x.lineJoin = 'round';
      walls.forEach((w, k) => {
        if (!w.show) return; const fl = w.id && slFlash[w.id] > 0;
        x.strokeStyle = w.kick ? (fl ? '#f2c230' : '#e0483e') : ink; x.lineWidth = Math.max(3, w.r * 2); pline(x, w.a[0], w.a[1], w.b[0], w.b[1], k + 1, 0.6);
      });
      [[62, 650, 62, 745, 140, 792], [498, 650, 498, 745, 420, 792]].forEach(([a, b, c, d, e2, f2]) => { x.save(); x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.lineTo(e2, f2); x.closePath(); x.clip(); hatch(x, 40, 640, 520, 160, '#e0483e', 7, 0.45, 1.2); x.restore(); });
      if (gate) { x.strokeStyle = ink; x.lineWidth = 6; pline(x, 540, 400, 580, 345, 3, 0.4); }
      // Abschuss-Feder
      const py = 985 + power * 0; x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); for (let k = 0; k < 8; k++) { x.lineTo(546 + (k % 2) * 28, py - 4 + k * 2 + power * 10); } x.stroke();
      if (charging) { x.fillStyle = '#e0483e'; x.fillRect(552, 990 - power * 120 - 10, 16, power * 120); }
      // obere Bahnen
      LANES.forEach((lx, i) => { x.fillStyle = lanes[i] ? '#f2c230' : 'transparent'; x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.arc(lx, 120, 9, 0, Math.PI * 2); x.fill(); x.stroke(); });
      // Ziele rechts
      DROPS.forEach(([y0, y1], i) => { x.lineWidth = 2; if (drops[i]) { x.fillStyle = '#2fbf71'; x.strokeStyle = ink; x.beginPath(); x.roundRect(520, y0, 14, y1 - y0, 3); x.fill(); x.stroke(); } else { x.strokeStyle = ink; x.globalAlpha = 0.35; x.setLineDash([3, 4]); x.strokeRect(520, y0, 14, y1 - y0); x.setLineDash([]); x.globalAlpha = 1; } });
      // Stern
      x.save(); x.translate(280, 600); x.rotate(tm / 900); x.fillStyle = star > 0 ? '#f2c230' : dark ? 'rgba(242,194,48,.25)' : 'rgba(242,194,48,.35)'; x.strokeStyle = ink; x.lineWidth = 2;
      x.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 9 : 22, a = k / 10 * Math.PI * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); x.restore();
      // Pilze
      BUMPERS.forEach(([bx, by], i) => {
        const s = 1 + bumpFlash[i] * 0.8, c = ['#4f7cff', '#ff6b5a', '#a46bff'][i];
        x.save(); x.translate(bx, by); x.scale(s, s);
        x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(3, 6, 30, 26, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = bumpFlash[i] > 0 ? '#fff6c8' : dark ? shade(c, -0.3) : shade(c, 0.55); x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.fill();
        x.save(); x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.clip(); hatch(x, -30, -30, 60, 60, c, 5, 0.85, 1.5); x.restore();
        x.strokeStyle = ink; x.lineWidth = 2.5; pcirc(x, 0, 0, 30, i + 2, 0.04); x.stroke(); x.lineWidth = 1.5; pcirc(x, 0, 0, 17, i + 5, 0.06); x.stroke();
        x.fillStyle = ink; x.font = `800 14px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('100', 0, 1); x.textBaseline = 'alphabetic';
        x.restore();
      });
      FL.forEach(drawFlipper);
      if (ball) {
        trail.forEach(([a, b], k) => { x.fillStyle = ink; x.globalAlpha = k / trail.length * 0.15; x.beginPath(); x.arc(a, b, BR * 0.8, 0, Math.PI * 2); x.fill(); });
        x.globalAlpha = 1; const gr = x.createRadialGradient(ball.x - 4, ball.y - 4, 2, ball.x, ball.y, BR);
        gr.addColorStop(0, dark ? '#ffffff' : '#ffffff'); gr.addColorStop(1, dark ? '#8a93a8' : '#6b6f7a');
        x.fillStyle = gr; x.beginPath(); x.arc(ball.x, ball.y, BR, 0, Math.PI * 2); x.fill(); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
      }
      pops.forEach((q) => { x.fillStyle = '#e0a106'; x.globalAlpha = 1 - q.t / 0.9; x.font = `800 20px ${FONT}`; x.textAlign = 'center'; x.fillText(q.txt, q.x, q.y - q.t * 40); x.globalAlpha = 1; });
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg, 8); x.restore(); }
    }
    hud(); newBall(); raf = requestAnimationFrame(frame);
  });
}
export const flipper = (fx, A, B) => seq(fx, A, B, flipperGame, 'pinball', 'Jeder hat 3 Kugeln. Links und rechts tippen bewegt die Flipper.');
