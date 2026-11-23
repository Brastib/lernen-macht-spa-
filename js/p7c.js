// Paket 7 (Teil 3): Radierer-Rabatz. Zwei Teams aus je 3 Radiergummis auf einer Papier-Insel.
// Reihum: laufen, springen, zielen, schießen (Radier-Rakete, Tintenfass-Granate, Klecksregen). Wer ins Wasser fällt, ist raus.
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, pcirc, prect, hatch, shade, canvasBox, chip, rng } from './sketch.js';

const W = 1400, H = 760, MR = 2, MW = W / MR, MH = H / MR, PG = 620, UG = 900, TURN = 30, TEAM = 3;
const WEAP = [
  { id: 'rocket', name: 'Radier-Rakete', ic: 'rocket', r: 46, dmg: 46, wind: 1 },
  { id: 'nade', name: 'Tintenfass', ic: 'bomb', r: 52, dmg: 50, fuse: 3 },
  { id: 'rain', name: 'Klecksregen', ic: 'drop', r: 30, dmg: 24, n: 1 },
];

export function eraserWar(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, R = rng((Math.random() * 1e9) | 0), dark = isDark(), ink = inkOf(dark);
    // ---------- Gelände ----------
    const tc = document.createElement('canvas'); tc.width = W; tc.height = H;
    const tx = tc.getContext('2d', { willReadFrequently: true });
    const ph = [R() * 6, R() * 6, R() * 6], amp = [60 + R() * 40, 28 + R() * 18, 10];
    const top = (xx) => {
      let y = H * 0.5 - amp[0] * Math.sin(xx / W * Math.PI * 1.6 + ph[0]) - amp[1] * Math.sin(xx / 110 + ph[1]) - amp[2] * Math.sin(xx / 37 + ph[2]);
      const e = Math.min(xx - 110, W - 110 - xx); if (e < 140) y += (140 - Math.max(0, e)) ** 2 / 70;   // Ufer fallen ab
      return y;
    };
    tx.beginPath(); tx.moveTo(90, H);
    for (let xx = 90; xx <= W - 90; xx += 6) tx.lineTo(xx, Math.min(H, top(xx)));
    tx.lineTo(W - 90, H); tx.closePath();
    tx.fillStyle = dark ? '#33302a' : '#efe3c4'; tx.fill();
    tx.save(); tx.clip(); hatch(tx, 0, 0, W, H, dark ? '#b9a77e' : '#b89b5e', 9, dark ? 0.25 : 0.35, 1.2);
    // ein paar Löcher und Steine für Abwechslung
    for (let k = 0; k < 7; k++) { const cx = 200 + R() * (W - 400); tx.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(120,90,40,.10)'; tx.beginPath(); tx.ellipse(cx, top(cx) + 60 + R() * 120, 30 + R() * 40, 14 + R() * 12, R(), 0, 7); tx.fill(); }
    tx.restore();
    tx.fillStyle = dark ? '#3f7a52' : '#8fd19e';
    tx.save(); tx.beginPath(); tx.moveTo(90, H); for (let xx = 90; xx <= W - 90; xx += 6) tx.lineTo(xx, top(xx)); tx.lineTo(W - 90, H); tx.closePath(); tx.clip();
    tx.beginPath(); for (let xx = 90; xx <= W - 90; xx += 6) tx.lineTo(xx, top(xx) - 1); for (let xx = W - 90; xx >= 90; xx -= 6) tx.lineTo(xx, top(xx) + 9); tx.fill(); tx.restore();
    tx.strokeStyle = ink; tx.lineWidth = 3; tx.lineCap = 'round'; tx.beginPath(); for (let xx = 90; xx <= W - 90; xx += 6) { const y = top(xx) + Math.sin(xx * 0.7) * 0.8; xx === 90 ? tx.moveTo(xx, y) : tx.lineTo(xx, y); } tx.stroke();
    const mask = new Uint8Array(MW * MH);
    { const d = tx.getImageData(0, 0, W, H).data; for (let y = 0; y < MH; y++) for (let xx = 0; xx < MW; xx++) mask[y * MW + xx] = d[((y * MR + 1) * W + xx * MR + 1) * 4 + 3] > 100 ? 1 : 0; }
    const solid = (xx, y) => { if (xx < 0 || xx >= W || y < 0) return false; if (y >= H) return true; return !!mask[((y / MR) | 0) * MW + ((xx / MR) | 0)]; };
    function carve(cx, cy, r) {
      const x0 = Math.max(0, ((cx - r) / MR) | 0), x1 = Math.min(MW - 1, ((cx + r) / MR) | 0), y0 = Math.max(0, ((cy - r) / MR) | 0), y1 = Math.min(MH - 1, ((cy + r) / MR) | 0);
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const dx = xx * MR + 1 - cx, dy = y * MR + 1 - cy; if (dx * dx + dy * dy <= r * r) mask[y * MW + xx] = 0; }
      tx.save(); tx.globalCompositeOperation = 'destination-out'; tx.beginPath(); tx.arc(cx, cy, r, 0, 7); tx.fill();
      tx.globalCompositeOperation = 'source-atop'; tx.strokeStyle = dark ? '#a89a7c' : '#6b5a3a'; tx.lineWidth = 4; tx.beginPath(); tx.arc(cx, cy, r + 1.5, 0, 7); tx.stroke();
      tx.fillStyle = dark ? 'rgba(0,0,0,.25)' : 'rgba(80,60,30,.12)'; tx.beginPath(); tx.arc(cx, cy, r + 10, 0, 7); tx.fill(); tx.restore();
    }
    const surface = (xx) => { for (let y = 0; y < H; y += 2) if (solid(xx, y)) return y; return H + 50; };

    // ---------- Teams ----------
    const teams = [A, B].map((p, i) => ({ p, i, next: 0, rain: 1 }));
    const units = [];
    const slots = []; for (let k = 0; k < TEAM * 2; k++) slots.push(220 + (k + 0.5) * (W - 440) / (TEAM * 2) + (R() - 0.5) * 40);
    const order = [0, 1, 0, 1, 0, 1].sort(() => R() - 0.5);
    slots.forEach((sx, k) => { const t = order[k]; units.push({ t, x: sx, y: surface(sx), vx: 0, vy: 0, hp: 100, shown: 100, alive: true, ground: true, face: t ? -1 : 1, hurt: 0, seed: (R() * 1e6) | 0, dmgPop: [] }); });
    let water = H - 34, turn = R() < 0.5 ? 0 : 1, cur = null, phase = 'aim', timer = TURN, turns = 0, wind = 0, ang = -0.8, pow = 60, weap = 0, rainX = null;
    const shots = [], booms = [], bits = [], splash = [];
    let raf = 0, last = 0, settle = 0, over = false, msg = '', msgT = 0, keyL = 0, keyR = 0, cpuPlan = null;
    const alive = (t) => units.filter((u) => u.alive && u.t === t);

    // ---------- Oberfläche ----------
    const teamEls = teams.map((t) => { const bar = h('span.tkbar', null, h('i', { style: { background: t.p.color } })); return { el: h('div.tkhp', null, chip(t.p), bar), bar }; });
    const windEl = h('span.tkwind'), timeEl = h('b.ewtime');
    const hud = h('div.hshud.tkhud', null, teamEls[0].el, h('div.ewmid', null, windEl, timeEl), teamEls[1].el);
    const host = h('div.tkfield.ewfield');
    const mv = (k, ic, lab) => h('button.ewmove', { 'aria-label': lab, title: lab, 'data-k': k }, icon(ic));
    const bL = mv('L', 'left', 'Nach links'), bR = mv('R', 'right', 'Nach rechts'), bJ = mv('J', 'up', 'Springen');
    const weapSeg = h('div.gseg.tkweap');
    const powIn = h('input.tkrange', { type: 'range', min: 15, max: 100, step: 1 }), powV = h('b');
    const fireBtn = h('button.btn.primary.tkfire', null, icon('target'), h('span', { text: 'Feuer!' }));
    const tip = h('small.ewtip');
    const ctrl = h('div.tkctrl.ewctrl', null, h('div.ewmoves', null, bL, bR, bJ), weapSeg, h('label.tklab', null, h('small', { text: 'Kraft' }), powV, powIn), fireBtn, tip);
    const wrap = h('div.hswrap.tkwrap', null, hud, host, ctrl);
    fx.stage.append(wrap);
    const C = canvasBox(host), x = C.x;
    let k = 1, ox = 0, oy = 0;
    const human = () => !(cpu && turn === 1);
    function sync() {
      const t = teams[turn];
      weapSeg.replaceChildren(...WEAP.map((w, i) => h('button' + (i === weap ? '.on' : ''), { disabled: phase !== 'aim' || !human() || (w.n && !t.rain), on: { click: () => { weap = i; rainX = null; sync(); } } }, icon(w.ic), h('span', { text: w.n ? `${w.name} ×${t.rain}` : w.name }))));
      powIn.value = String(pow); powV.textContent = String(Math.round(pow));
      const dis = phase !== 'aim' || !human();
      [bL, bR, bJ, powIn, fireBtn].forEach((el) => { el.disabled = dis; });
      if (WEAP[weap].id === 'rain') { powIn.disabled = true; fireBtn.disabled = dis || rainX == null; }
      ctrl.style.setProperty('--pc', t.p.color);
      tip.textContent = !human() ? 'Der Computer ist dran …' : phase !== 'aim' ? '' : WEAP[weap].id === 'rain' ? 'Tippe auf die Stelle, wo es Kleckse regnen soll.' : 'Aufs Feld tippen oder ziehen: zielen. Dann Feuer!';
      windEl.textContent = wind === 0 ? 'Kein Wind' : `Wind ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind / 10))}`;
      teamEls.forEach((e, i) => { const sum = alive(i).reduce((a, u) => a + Math.max(0, u.hp), 0); e.bar.firstChild.style.width = `${(sum / (TEAM * 100)) * 100}%`; e.el.classList.toggle('on', i === turn); });
    }
    powIn.addEventListener('input', () => { pow = +powIn.value; sync(); });
    fireBtn.addEventListener('click', () => { if (phase === 'aim' && human()) fire(); });
    const hold = (b, set) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (b.disabled) return; set(1); try { b.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
      const up = () => set(0); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    };
    hold(bL, (v) => { keyL = v; }); hold(bR, (v) => { keyR = v; });
    bJ.addEventListener('click', () => { if (phase === 'aim' && human()) jump(); });
    const toW = (e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / k, (e.clientY - r.top - oy) / k]; };
    let aiming = null;
    const aimAt = ([wx, wy]) => {
      if (WEAP[weap].id === 'rain') { rainX = Math.max(60, Math.min(W - 60, wx)); sync(); return; }
      const dx = wx - cur.x, dy = wy - (cur.y - 18); ang = Math.atan2(dy, dx); cur.face = dx >= 0 ? 1 : -1;
      if (Math.hypot(dx, dy) > 30) pow = Math.max(15, Math.min(100, Math.hypot(dx, dy) / 2.6));
      sync();
    };
    C.cv.addEventListener('pointerdown', (e) => { if (phase !== 'aim' || !human()) return; e.preventDefault(); aiming = e.pointerId; aimAt(toW(e)); try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aiming === e.pointerId) aimAt(toW(e)); });
    C.cv.addEventListener('pointerup', (e) => { if (aiming === e.pointerId) aiming = null; });
    const onKey = (e) => {
      if (phase !== 'aim' || !human()) return;
      const dn = e.type === 'keydown';
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = dn ? 1 : 0;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = dn ? 1 : 0;
      else if (!dn) return;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') ang -= 0.04 * cur.face;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') ang += 0.04 * cur.face;
      else if (e.code === 'Space') jump();
      else if (e.code === 'Enter') fire();
      else if (e.key === '+') pow = Math.min(100, pow + 2);
      else if (e.key === '-') pow = Math.max(15, pow - 2);
      else return;
      e.preventDefault(); sync();
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });

    // ---------- Ablauf ----------
    function startTurn() {
      const t = teams[turn], list = alive(turn);
      if (!list.length) return;
      cur = list[t.next % list.length]; t.next++;
      wind = Math.round((R() * 2 - 1) * 9) * 10;
      ang = cur.face > 0 ? -0.75 : -Math.PI + 0.75; pow = 60; weap = 0; rainX = null; timer = TURN; phase = 'aim'; turns++;
      if (turns > 20) { water -= 18; msg = 'Das Wasser steigt!'; msgT = 1.8; } else { msg = `${t.p.name} ist dran`; msgT = 1.4; }
      cpuPlan = null;
      if (!human()) planCpu();
      sync();
    }
    function jump() { if (!cur || !cur.ground) return; cur.vy = -330; cur.vx = cur.face * 150; cur.ground = false; }
    function fire() {
      if (phase !== 'aim' || !cur) return;
      const w = WEAP[weap], t = teams[turn];
      if (w.id === 'rain') {
        if (rainX == null || !t.rain) return; t.rain--;
        for (let i = 0; i < 5; i++) shots.push({ w, x: rainX + (i - 2) * 34 + (R() - 0.5) * 10, y: -40 - i * 50, vx: 0, vy: 80, t: 0 });
      } else {
        const v = pow * 8.6, sx = cur.x + Math.cos(ang) * 27, sy = cur.y - 18 + Math.sin(ang) * 27;
        shots.push({ w, x: sx, y: sy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, t: 0, fuse: w.fuse || 0, trail: [] });
      }
      phase = 'fly'; keyL = keyR = 0; settle = 0; sync();
    }
    function explode(cx, cy, w) {
      carve(cx, cy, w.r);
      booms.push({ x: cx, y: cy, r: w.r, t: 0 });
      for (let i = 0; i < 18; i++) { const a = R() * 7, s = 120 + R() * 300; bits.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, t: 0, c: R() < 0.5 ? ink : (dark ? '#b9a77e' : '#b89b5e') }); }
      for (const u of units) {
        if (!u.alive) continue;
        const dx = u.x - cx, dy = u.y - 17 - cy, d = Math.hypot(dx, dy), reach = w.r + 16;
        if (d > reach) continue;
        const f = 1 - d / reach, dmg = Math.round(w.dmg * (0.35 + 0.65 * f));
        u.hp -= dmg; u.hurt = 0.6; u.dmgPop.push({ v: dmg, t: 0 });
        const n = d || 1; u.vx += (dx / n) * 420 * f; u.vy += (dy / n) * 300 * f - 260 * f; u.ground = false;
      }
    }
    function stepUnit(u, dt, walk) {
      if (!u.alive) return;
      if (u.ground && walk) {
        const nx = u.x + walk * 70 * dt; u.face = walk;
        let ny = u.y, ok = false;
        for (let s = 0; s <= 10; s++) if (!solid(nx, ny - s - 1) && !solid(nx, ny - 28 - s)) { ny -= s; ok = true; break; }
        if (ok && nx > 4 && nx < W - 4) { u.x = nx; u.y = ny; }
        if (!solid(u.x, u.y + 1)) { let d = 0; while (d < 6 && !solid(u.x, u.y + 1)) { u.y++; d++; } if (!solid(u.x, u.y + 1)) u.ground = false; }
      }
      if (!u.ground) {
        u.vy += UG * dt;
        const steps = Math.ceil(Math.max(Math.abs(u.vx), Math.abs(u.vy)) * dt / 2) || 1;
        for (let s = 0; s < steps; s++) {
          const nx = u.x + u.vx * dt / steps;
          if (solid(nx, u.y - 14) || solid(nx, u.y - 4)) u.vx *= -0.3; else u.x = nx;
          const ny = u.y + u.vy * dt / steps;
          if (u.vy > 0 && solid(u.x, ny)) {
            while (solid(u.x, u.y)) u.y--;
            if (u.vy > 620) { const d = Math.round((u.vy - 620) / 14); u.hp -= d; u.hurt = 0.5; u.dmgPop.push({ v: d, t: 0 }); }
            u.vy = 0; u.vx = 0; u.ground = true; break;
          } else if (u.vy < 0 && solid(u.x, ny - 32)) u.vy = 0;
          else u.y = ny;
        }
        u.x = Math.max(-40, Math.min(W + 40, u.x));
      } else if (!solid(u.x, u.y + 1)) u.ground = false;
      if (u.y > water) { u.alive = false; u.hp = 0; splash.push({ x: u.x, t: 0 }); }
      if (u.hp <= 0 && u.alive && u.ground) { u.alive = false; booms.push({ x: u.x, y: u.y - 12, r: 22, t: 0, grave: true }); }
      if (u.hp <= 0 && u === cur && phase === 'aim') endShot();
    }
    function stepShot(s, dt) {
      s.t += dt;
      const steps = Math.ceil(Math.hypot(s.vx, s.vy) * dt / 3) || 1;
      for (let i = 0; i < steps; i++) {
        if (s.w.wind) s.vx += wind * 1.1 * dt / steps;
        s.vy += PG * dt / steps;
        const nx = s.x + s.vx * dt / steps, ny = s.y + s.vy * dt / steps;
        const hitU = s.t > 0.08 && units.some((u) => u.alive && Math.hypot(u.x - nx, u.y - 17 - ny) < 18);
        if (solid(nx, ny) || hitU) {
          if (s.w.fuse && !hitU) {   // abprallen
            const gx = (solid(nx + 3, ny) ? 1 : 0) - (solid(nx - 3, ny) ? 1 : 0), gy = (solid(nx, ny + 3) ? 1 : 0) - (solid(nx, ny - 3) ? 1 : 0);
            let nnx = -gx, nny = -gy; const l = Math.hypot(nnx, nny); if (!l) { nnx = 0; nny = -1; } else { nnx /= l; nny /= l; }
            const dot = s.vx * nnx + s.vy * nny; s.vx = (s.vx - 2 * dot * nnx) * 0.45; s.vy = (s.vy - 2 * dot * nny) * 0.45;
            if (Math.hypot(s.vx, s.vy) < 30) { s.vx = 0; s.vy = 0; }
            return;
          }
          explode(nx, ny, s.w); s.dead = true; return;
        }
        s.x = nx; s.y = ny;
      }
      if (s.trail) { s.trail.push([s.x, s.y]); if (s.trail.length > 18) s.trail.shift(); }
      if (s.w.fuse && s.t >= s.w.fuse) { explode(s.x, s.y, s.w); s.dead = true; }
      if (s.y > water) { splash.push({ x: s.x, t: 0 }); s.dead = true; }
      if (s.x < -300 || s.x > W + 300) s.dead = true;
    }
    function endShot() { phase = 'wait'; settle = 0; sync(); }
    function nextTurn() {
      const a0 = alive(0).length, a1 = alive(1).length;
      if (!a0 || !a1) {
        over = true; const w = !a0 && !a1 ? null : a0 ? 0 : 1;
        msg = w == null ? 'Unentschieden!' : `${teams[w].p.name} gewinnt!`; msgT = 9;
        setTimeout(() => { cleanup(); resolve({ w, detail: w == null ? 'Beide Teams sind weg.' : `${teams[w].p.name} hat noch ${alive(w).length} von ${TEAM} Radierern.` }); }, 1800);
        return;
      }
      turn = 1 - turn; startTurn();
    }

    // ---------- Computer ----------
    function simulate(a, pw, w) {
      let sx = cur.x + Math.cos(a) * 27, sy = cur.y - 18 + Math.sin(a) * 27, vx = Math.cos(a) * pw * 8.6, vy = Math.sin(a) * pw * 8.6;
      for (let i = 0; i < 400; i++) {
        const dt = 1 / 60; if (w.wind) vx += wind * 1.1 * dt; vy += PG * dt; sx += vx * dt; sy += vy * dt;
        if (i > 4 && (solid(sx, sy) || units.some((u) => u.alive && Math.hypot(u.x - sx, u.y - 17 - sy) < 18))) return [sx, sy];
        if (sy > water || sx < -100 || sx > W + 100) return null;
      }
      return null;
    }
    function planCpu() {
      const foes = alive(0); if (!foes.length) return;
      let best = null;
      for (const tg of foes) for (const wi of [0, 1]) {
        const w = WEAP[wi];
        for (let a = -Math.PI + 0.12; a < -0.12; a += 0.06) for (let pw = 30; pw <= 100; pw += 5) {
          const hit = simulate(a, pw, w); if (!hit) continue;
          let sc = Math.hypot(hit[0] - tg.x, hit[1] - tg.y + 17) + (wi ? 25 : 0);
          for (const u of alive(1)) if (Math.hypot(hit[0] - u.x, hit[1] - u.y + 17) < w.r + 20) sc += 200;
          if (!best || sc < best.sc) best = { sc, a, pw, wi };
        }
      }
      if (!best) best = { a: cur.face > 0 ? -0.8 : -Math.PI + 0.8, pw: 55, wi: 0 };
      const err = 0.12 + R() * 0.16;
      cpuPlan = { a: best.a + (R() - 0.5) * err, pw: best.pw * (1 + (R() - 0.5) * 0.16), wi: best.wi, t: 1.4 };
    }

    // ---------- Schleife ----------
    function step(dt) {
      if (phase === 'aim' && !over) {
        timer -= dt;
        if (cpuPlan) {
          cpuPlan.t -= dt; const f = Math.min(1, dt * 3);
          weap = cpuPlan.wi; ang += (cpuPlan.a - ang) * f; pow += (cpuPlan.pw - pow) * f; cur.face = Math.cos(ang) >= 0 ? 1 : -1;
          if (cpuPlan.t <= 0) { ang = cpuPlan.a; pow = cpuPlan.pw; cpuPlan = null; fire(); }
        }
        if (timer <= 0) { msg = 'Zeit um!'; msgT = 1.2; endShot(); }
      }
      for (const u of units) stepUnit(u, dt, u === cur && phase === 'aim' ? keyR - keyL : 0);
      for (const s of shots) stepShot(s, dt);
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
      if (phase === 'fly' && !shots.length) endShot();
      if (phase === 'wait' && !over) {
        const calm = units.every((u) => !u.alive || u.ground) && !shots.length;
        settle = calm ? settle + dt : 0;
        if (settle > 0.9) { for (const u of units) if (u.alive && u.hp <= 0) { u.alive = false; booms.push({ x: u.x, y: u.y - 12, r: 22, t: 0, grave: true }); } phase = 'next'; setTimeout(() => { if (!fx.signal.aborted && !over) nextTurn(); }, 500); sync(); }
      }
      for (const b of booms) b.t += dt; while (booms.length && booms[0].t > 0.7) booms.shift();
      for (const b of bits) { b.t += dt; b.vy += 700 * dt; b.x += b.vx * dt; b.y += b.vy * dt; } while (bits.length && bits[0].t > 1.2) bits.shift();
      for (const s of splash) s.t += dt; while (splash.length && splash[0].t > 1) splash.shift();
      for (const u of units) { u.hurt = Math.max(0, u.hurt - dt); u.shown += (Math.max(0, u.hp) - u.shown) * Math.min(1, dt * 4); u.dmgPop.forEach((q) => { q.t += dt; }); u.dmgPop = u.dmgPop.filter((q) => q.t < 1.3); }
      msgT = Math.max(0, msgT - dt);
    }
    function drawUnit(u, t) {
      if (!u.alive) {
        if (u.y > water) return;
        x.save(); x.translate(u.x, u.y); x.scale(1.3, 1.3); x.strokeStyle = ink; x.lineWidth = 2.5;   // kleines Kreuz aus Bleistift
        pline(x, 0, 0, 0, -22, u.seed, 0.4); pline(x, -7, -15, 7, -15, u.seed + 1, 0.4); x.restore(); return;
      }
      const col = teams[u.t].p.color;
      x.save(); x.translate(u.x, u.y);
      if (u.hurt) x.translate((Math.random() - 0.5) * 3, 0);
      x.scale(1.35, 1.35);
      const wob = u === cur && phase === 'aim' ? Math.sin(t / 180) * 0.8 : 0;
      // Körper: Radiergummi, oben Teamfarbe, unten weiß
      x.save(); x.rotate((u.ground ? 0 : u.vx * 0.0006) + wob * 0.02);
      x.fillStyle = dark ? '#e9e4da' : '#fbfaf5'; prect(x, -11, -26, 22, 26, u.seed, 0.4); x.fill();
      x.fillStyle = dark ? shade(col, -0.1) : shade(col, 0.25); x.fillRect(-11, -26, 22, 12);
      x.save(); x.beginPath(); x.rect(-11, -26, 22, 12); x.clip(); hatch(x, -11, -26, 22, 12, col, 4, 0.7, 1); x.restore();
      x.strokeStyle = ink; x.lineWidth = 2; prect(x, -11, -26, 22, 26, u.seed, 0.4); x.stroke();
      x.beginPath(); x.moveTo(-11, -14); x.lineTo(11, -14); x.stroke();
      // Augen + Mund
      x.fillStyle = '#1d1d1f'; const ex = u.face * 2.5;
      x.beginPath(); x.arc(ex - 4, -8, 1.9, 0, 7); x.arc(ex + 4, -8, 1.9, 0, 7); x.fill();
      x.strokeStyle = '#1d1d1f'; x.lineWidth = 1.4; x.beginPath(); if (u.hurt) x.arc(ex, -2.5, 2.4, Math.PI, 0); else x.arc(ex, -4.5, 2.6, 0.3, Math.PI - 0.3); x.stroke();
      x.restore();
      // Lebensbalken
      x.fillStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)'; x.fillRect(-15, -38, 30, 4);
      x.fillStyle = col; x.fillRect(-15, -38, 30 * Math.max(0, u.shown) / 100, 4);
      x.font = `700 12px ${FONT}`; x.textAlign = 'center'; x.fillStyle = ink; x.fillText(String(Math.max(0, Math.round(u.shown))), 0, -42);
      for (const q of u.dmgPop) { x.globalAlpha = 1 - q.t / 1.3; x.fillStyle = '#e0483e'; x.font = `800 16px ${FONT}`; x.fillText(`-${q.v}`, 0, -56 - q.t * 30); }
      x.globalAlpha = 1;
      if (u === cur && phase === 'aim') { const by = -66 + Math.sin(t / 220) * 4; x.fillStyle = col; x.strokeStyle = ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-7, by); x.lineTo(7, by); x.lineTo(0, by + 9); x.closePath(); x.fill(); x.stroke(); }
      x.restore();
    }
    function draw(t) {
      const cw = C.cw, ch = C.ch;
      k = Math.min(cw / W, ch / H); ox = (cw - W * k) / 2; oy = (ch - H * k) / 2;
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      paper(x, cw, ch, dark, 24 * k, ox, oy);
      x.translate(ox, oy); x.scale(k, k);
      // Wolken zeigen den Wind
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 520 + t * 0.02 * (wind || 10) / 10) % (W + 300) + W + 300) % (W + 300) - 150, cy = 80 + i * 46;
        x.strokeStyle = dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.18)'; x.lineWidth = 2;
        x.beginPath(); x.arc(cx, cy, 22, Math.PI, 0); x.arc(cx + 30, cy - 8, 26, Math.PI, 0); x.arc(cx + 62, cy, 20, Math.PI, 0); x.lineTo(cx - 22, cy); x.stroke();
      }
      x.drawImage(tc, 0, 0);
      // Zielhilfe (keine Flugbahn, nur Richtung und Kraft)
      if (cur && phase === 'aim' && cur.alive) {
        if (WEAP[weap].id === 'rain') {
          if (rainX != null) { x.strokeStyle = teams[turn].p.color; x.lineWidth = 3; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(rainX, 0); x.lineTo(rainX, surface(rainX)); x.stroke(); x.setLineDash([]); pcirc(x, rainX, 30, 14, 3, 0.1); x.stroke(); }
        } else {
          const L = 34 + pow * 0.9, sx = cur.x, sy = cur.y - 18, ex = sx + Math.cos(ang) * L, ey = sy + Math.sin(ang) * L;
          x.strokeStyle = teams[turn].p.color; x.lineWidth = 3; x.setLineDash([6, 7]); x.beginPath(); x.moveTo(sx + Math.cos(ang) * 18, sy + Math.sin(ang) * 18); x.lineTo(ex, ey); x.stroke(); x.setLineDash([]);
          x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(ang - 0.45) * 12, ey - Math.sin(ang - 0.45) * 12); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(ang + 0.45) * 12, ey - Math.sin(ang + 0.45) * 12); x.stroke();
          x.save(); x.translate(sx, sy); x.rotate(ang); x.fillStyle = ink; x.fillRect(8, -3, 20, 6); x.restore();   // Rohr / Wurfarm
        }
      }
      for (const u of units) drawUnit(u, t);
      for (const s of shots) {
        if (s.trail) { x.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.2)'; x.lineWidth = 2; x.beginPath(); s.trail.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); }
        x.save(); x.translate(s.x, s.y);
        if (s.w.id === 'rocket') { x.rotate(Math.atan2(s.vy, s.vx)); x.fillStyle = '#ff8fa3'; x.strokeStyle = ink; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, 0, 10, 5, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#4f7cff'; x.fillRect(-10, -5, 6, 10); }
        else if (s.w.id === 'nade') { x.fillStyle = dark ? '#2b3b66' : '#2b3b66'; x.strokeStyle = ink; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 7, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#c9a66b'; x.fillRect(-3, -11, 6, 5); x.font = `800 13px ${FONT}`; x.fillStyle = ink; x.textAlign = 'center'; x.fillText(String(Math.max(1, Math.ceil(s.w.fuse - s.t))), 0, -16); }
        else { x.fillStyle = '#2b3b66'; x.beginPath(); x.moveTo(0, -10); x.quadraticCurveTo(7, 0, 0, 6); x.quadraticCurveTo(-7, 0, 0, -10); x.fill(); }
        x.restore();
      }
      for (const b of booms) {
        const f = b.t / 0.7; x.globalAlpha = 1 - f;
        x.strokeStyle = b.grave ? ink : '#e0483e'; x.lineWidth = 3; pcirc(x, b.x, b.y, b.r * (0.4 + f * 0.9), b.x | 0, 0.18); x.stroke();
        if (!b.grave) { x.strokeStyle = '#f2b632'; pcirc(x, b.x, b.y, b.r * (0.2 + f * 0.6), (b.y | 0) + 3, 0.25); x.stroke(); }
        x.globalAlpha = 1;
      }
      for (const b of bits) { x.globalAlpha = Math.max(0, 1 - b.t / 1.2); x.fillStyle = b.c; x.fillRect(b.x - 2, b.y - 2, 4, 4); }
      x.globalAlpha = 1;
      // Wasser
      x.fillStyle = dark ? 'rgba(80,140,255,.28)' : 'rgba(80,150,255,.25)'; const wl = -ox / k, wr = (cw - ox) / k, wb = (ch - oy) / k; x.fillRect(wl, water, wr - wl, wb - water);
      x.strokeStyle = dark ? '#7fb6f2' : '#3d7fd9'; x.lineWidth = 2.5; x.beginPath();
      for (let xx = Math.floor(wl / 8) * 8; xx <= wr + 8; xx += 8) { const y = water + Math.sin(xx / 30 + t / 400) * 3; x.lineTo(xx, y); } x.stroke();
      x.lineWidth = 1.5; x.globalAlpha = 0.5; for (let r = 1; r < 3; r++) { x.beginPath(); for (let xx = -40; xx <= W + 40; xx += 8) { const y = water + r * 12 + Math.sin(xx / 24 + t / 300 + r) * 2; xx === -40 ? x.moveTo(xx, y) : x.lineTo(xx, y); } x.stroke(); } x.globalAlpha = 1;
      for (const s of splash) { x.globalAlpha = 1 - s.t; x.strokeStyle = dark ? '#7fb6f2' : '#3d7fd9'; x.lineWidth = 2.5; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(s.x + i * 6, water); x.quadraticCurveTo(s.x + i * 14, water - 50 * Math.sin(s.t * Math.PI), s.x + i * 22, water); x.stroke(); } x.globalAlpha = 1; }
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) {
        x.save(); x.globalAlpha = Math.min(1, msgT * 2); x.font = `800 ${Math.round(Math.max(18, Math.min(30, cw / 26)))}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(cw - 24, x.measureText(msg).width + 44);
        x.fillStyle = dark ? 'rgba(27,31,40,.92)' : 'rgba(251,250,245,.94)'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, cw / 2 - w / 2, 12, w, 48, 7, 1); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(msg, cw / 2, 37, w - 20); x.restore();
      }
      timeEl.textContent = phase === 'aim' && !over ? `${Math.max(0, Math.ceil(timer))} s` : '';
    }
    function frame(t) {
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0.016); last = t;
      step(dt / 2); step(dt / 2);
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    startTurn();
    raf = requestAnimationFrame(frame);
  });
}
