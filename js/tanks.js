// Papierpanzer (v85): Winkel + Kraft, Gelände geht kaputt, Panzer fahren (Sprit pro Zug),
// mehr Waffen, Extras (Reparieren, Schild, Sprit) und Nachschub-Kisten, die man einsammeln kann.
// Zu zweit an einem iPad oder gegen den Computer.
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, prect, pcirc, hatch, shade, canvasBox, chip, rng } from './sketch.js';

const TW = 1200, TH = 700, GRAV = 420;
const FUEL = 100, FUEL_PX = 1.7, SPEED = 85;   // 100 Sprit = ca. 170 Punkte Fahrweg
const WEAP = [
  { id: 'ball', name: 'Kugel', ic: 'target', r: 40, dmg: 42, n: Infinity },
  { id: 'three', name: 'Dreier', ic: 'star', r: 26, dmg: 22, n: 2, split: 3 },
  { id: 'big', name: 'Riesenknall', ic: 'bomb', r: 75, dmg: 60, n: 1 },
  { id: 'roll', name: 'Rollbombe', ic: 'ball', r: 44, dmg: 40, n: 1, roll: true },
  { id: 'dirt', name: 'Erdhügel', ic: 'up', r: 60, dmg: 0, n: 1, dirt: true },
];
const EXTRA = [
  { id: 'heal', name: 'Reparieren', ic: 'heart', n: 1 },
  { id: 'shield', name: 'Schild', ic: 'shield', n: 1 },
  { id: 'fuel', name: 'Volltanken', ic: 'bolt', n: 1 },
];

export function tanks(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, R = rng((Math.random() * 1e9) | 0), dark = isDark(), ink = inkOf(dark);
    // ---------- Gelände ----------
    const ground = new Float32Array(TW);
    const ph = [R() * 6, R() * 6, R() * 6], amp = [70 + R() * 50, 30 + R() * 25, 12];
    for (let i = 0; i < TW; i++) ground[i] = TH * 0.62 - amp[0] * Math.sin(i / TW * Math.PI * (1.2 + ph[0] / 6) + ph[0]) - amp[1] * Math.sin(i / 90 + ph[1]) - amp[2] * Math.sin(i / 31 + ph[2]);
    const gAt = (px) => ground[Math.max(0, Math.min(TW - 1, Math.round(px)))];
    const T = [A, B].map((p, i) => ({ p, i, x: i ? TW * (0.8 + R() * 0.08) : TW * (0.12 + R() * 0.08), y: 0, ang: i ? 135 : 45, pow: 62, hp: 100, fuel: FUEL, shield: 0, ammo: WEAP.map((w) => w.n), ex: EXTRA.map((e) => e.n), w: 0, hurt: 0, lost: 0, usedEx: false }));
    const flat = (t) => { const x0 = Math.round(t.x), g = ground[x0]; for (let k = -40; k <= 40; k++) { const xx = x0 + k, w = Math.max(0, Math.min(1, (40 - Math.abs(k)) / 18)); if (xx >= 0 && xx < TW) ground[xx] = g * w + ground[xx] * (1 - w); } };   // ebener Platz am Anfang, Ränder weich
    T.forEach(flat);
    let turn = R() < 0.5 ? 0 : 1, wind = 0, shells = [], booms = [], bits = [], crates = [], pops = [], phase = 'aim', raf = 0, last = 0, turns = 0, over = false, msg = '', msgT = 0;
    let keyL = 0, keyR = 0, dragX = null, cpuDrive = null;
    const newWind = () => { wind = Math.round((R() * 2 - 1) * 10) / 10; };
    newWind();

    // ---------- Oberfläche ----------
    const angIn = h('input.tkrange', { type: 'range', min: 0, max: 180, step: 1 });
    const powIn = h('input.tkrange', { type: 'range', min: 10, max: 100, step: 1 });
    const angV = h('b'), powV = h('b');
    const mv = (ic, lab) => h('button.ewmove', { 'aria-label': lab, title: lab }, icon(ic));
    const bL = mv('left', 'Nach links fahren'), bR = mv('right', 'Nach rechts fahren');
    const fuelBar = h('span.tkbar.tkfuelbar', null, h('i')), fuelV = h('b');
    const fuelBox = h('div.tkfuel', null, h('small', { text: 'Sprit' }), fuelV, fuelBar);
    const exSeg = h('div.tkextras');
    const weapSeg = h('div.gseg.tkweap');
    const fireBtn = h('button.btn.primary.tkfire', null, icon('target'), h('span', { text: 'Feuer!' }));
    const tip = h('small.ewtip');
    const hpEls = T.map((t) => { const bar = h('span.tkbar', null, h('i', { style: { background: t.p.color } })); const sh = h('span.tkshield', null, icon('shield'), h('span')); return { el: h('div.tkhp', null, h('div.tkhprow', null, chip(t.p), sh), bar), bar, sh }; });
    const windEl = h('span.tkwind');
    const hud = h('div.hshud.tkhud', null, hpEls[0].el, windEl, hpEls[1].el);
    const ctrl = h('div.tkctrl.ewctrl.tkctrl2', null,
      h('div.tkdrive', null, bL, bR, fuelBox),
      h('label.tklab', null, h('small', { text: 'Winkel' }), angV, angIn),
      h('label.tklab', null, h('small', { text: 'Kraft' }), powV, powIn),
      weapSeg, exSeg, fireBtn, tip);
    const host = h('div.tkfield.ewfield');
    const wrap = h('div.hswrap.tkwrap', null, hud, host, ctrl);
    fx.stage.append(wrap);
    const C = canvasBox(host), x = C.x;
    let U = 1, ox = 0, oy = 0;
    const cur = () => T[turn];
    const human = () => !(cpu && turn === 1);
    const canAct = () => phase === 'aim' && human() && !over;
    function syncCtrl() {
      const t = cur(), dis = !canAct();
      angIn.value = String(Math.round(t.ang)); powIn.value = String(Math.round(t.pow)); angV.textContent = `${Math.round(t.ang)}°`; powV.textContent = String(Math.round(t.pow));
      weapSeg.replaceChildren(...WEAP.map((w, k) => h('button' + (k === t.w ? '.on' : ''), { disabled: dis || !t.ammo[k], title: w.name, on: { click: () => { t.w = k; syncCtrl(); } } },
        icon(w.ic), h('span', { text: t.ammo[k] === Infinity ? w.name : `${w.name} ×${t.ammo[k]}` }))));
      exSeg.replaceChildren(...EXTRA.map((e, k) => h('button.tkex', { disabled: dis || !t.ex[k] || t.usedEx, title: `${e.name} (${t.ex[k]})`, 'aria-label': e.name, on: { click: () => useExtra(t, k) } },
        icon(e.ic), h('span', { text: e.name }), h('em', { text: String(t.ex[k]) }))));
      [angIn, powIn, fireBtn].forEach((el) => { el.disabled = dis; });
      [bL, bR].forEach((el) => { el.disabled = dis || t.fuel <= 0; });
      fuelV.textContent = String(Math.max(0, Math.round(t.fuel)));
      fuelBar.firstChild.style.width = `${Math.min(100, Math.max(0, t.fuel / FUEL * 100))}%`;
      ctrl.style.setProperty('--pc', t.p.color);
      tip.textContent = !human() ? 'Der Computer ist dran …' : phase !== 'aim' ? '' : t.fuel > 0 ? 'Pfeile halten oder Panzer ziehen: fahren. Aufs Feld tippen: zielen. Kisten einsammeln!' : 'Sprit leer. Aufs Feld tippen: zielen, dann Feuer!';
      windEl.textContent = wind === 0 ? 'Kein Wind' : `Wind ${wind > 0 ? '→' : '←'} ${Math.abs(wind * 10).toFixed(0)}`;
      hpEls.forEach((e, k) => { e.bar.firstChild.style.width = `${Math.max(0, T[k].hp)}%`; e.el.classList.toggle('on', k === turn); e.sh.hidden = !(T[k].shield > 0); e.sh.lastChild.textContent = String(Math.round(T[k].shield)); });
    }
    angIn.addEventListener('input', () => { cur().ang = +angIn.value; syncCtrl(); });
    powIn.addEventListener('input', () => { cur().pow = +powIn.value; syncCtrl(); });
    fireBtn.addEventListener('click', () => { if (canAct()) shoot(); });
    const hold = (b, set) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (b.disabled) return; set(1); try { b.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
      const up = () => set(0); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    };
    hold(bL, (v) => { keyL = v; }); hold(bR, (v) => { keyR = v; });
    // Feld: Panzer anfassen = fahren, sonst zielen
    let aiming = null, driving = null;
    const toW = (e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / U, (e.clientY - r.top - oy) / U]; };
    C.cv.addEventListener('pointerdown', (e) => {
      if (!canAct()) return; e.preventDefault();
      const [wx, wy] = toW(e), t = cur();
      if (t.fuel > 0 && Math.abs(wx - t.x) < 42 && wy > t.y - 48 && wy < t.y + 22) { driving = e.pointerId; dragX = wx; }
      else { aiming = e.pointerId; aimAt([wx, wy]); }
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => { if (aiming === e.pointerId) aimAt(toW(e)); else if (driving === e.pointerId) dragX = toW(e)[0]; });
    const endPtr = (e) => { if (aiming === e.pointerId) aiming = null; if (driving === e.pointerId) { driving = null; dragX = null; } };
    C.cv.addEventListener('pointerup', endPtr); C.cv.addEventListener('pointercancel', endPtr);
    function aimAt([wx, wy]) { const t = cur(), [px, py] = pivot(t), dx = wx - px, dy = py - wy; t.ang = Math.max(0, Math.min(180, Math.round(Math.atan2(Math.max(0, dy), dx) * 180 / Math.PI))); t.pow = Math.max(10, Math.min(100, Math.round(Math.hypot(dx, dy) / 3.2))); syncCtrl(); }
    const onKey = (e) => {
      if (e.code === 'KeyA' || e.code === 'KeyD') { if (e.code === 'KeyA') keyL = e.type === 'keydown' ? 1 : 0; else keyR = e.type === 'keydown' ? 1 : 0; e.preventDefault(); return; }
      if (e.type !== 'keydown' || !canAct()) return; const t = cur();
      if (e.code === 'ArrowLeft') t.ang = Math.min(180, t.ang + 1); else if (e.code === 'ArrowRight') t.ang = Math.max(0, t.ang - 1);
      else if (e.code === 'ArrowUp') t.pow = Math.min(100, t.pow + 1); else if (e.code === 'ArrowDown') t.pow = Math.max(10, t.pow - 1);
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shoot(); return; } else return;
      e.preventDefault(); syncCtrl();
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    // ---------- Fahren ----------
    const tilt = (t) => Math.atan2(gAt(t.x + 18) - gAt(t.x - 18), 36);
    const pivot = (t) => { const a = tilt(t); return [t.x + Math.sin(a) * 16, t.y - Math.cos(a) * 16]; };
    const muzzle = (t, ang = t.ang) => { const a = ang * Math.PI / 180, [px, py] = pivot(t); return [px + Math.cos(a) * 30, py - Math.sin(a) * 30]; };
    // fährt den Panzer ein Stück; gibt false zurück, wenn es nicht weitergeht
    function drive(t, dir, dt) {
      if (t.fuel <= 0 || !dir) return false;
      const g0 = gAt(t.x); if (t.y < g0 - 2) return false;   // fällt gerade
      let step = dir * SPEED * dt;
      const nx = Math.max(26, Math.min(TW - 26, t.x + step));
      if (Math.abs(nx - t.x) < 0.01) return false;
      const other = T[1 - t.i]; if (Math.abs(nx - other.x) < 56 && Math.abs(nx - other.x) < Math.abs(t.x - other.x)) return false;
      const climb = g0 - gAt(nx), slope = climb / Math.abs(nx - t.x);
      if (slope > 2.4 && climb > 5) { if (!t.bump) { t.bump = 1; pop(t.x, t.y - 60, 'Zu steil!', ink); } return false; }
      t.bump = 0;
      if (slope > 0) { step *= Math.max(0.5, 1 - slope * 0.3); }
      const nx2 = Math.max(26, Math.min(TW - 26, t.x + step));
      t.fuel = Math.max(0, t.fuel - Math.abs(nx2 - t.x) / FUEL_PX * (1 + Math.max(0, slope) * 0.6));
      t.x = nx2; const g = gAt(t.x); if (t.y > g || g - t.y < 6) t.y = g;
      t.roll = (t.roll || 0) + (nx2 - t.x || step) * 0.3;
      pickCrates(t);
      return true;
    }
    function pickCrates(t) {
      for (const c of crates) {
        if (c.gone || c.fall) continue;
        if (Math.abs(c.x - t.x) < 34) { c.gone = true; giveCrate(t, c); }
      }
      crates = crates.filter((c) => !c.gone);
    }
    function giveCrate(t, c) {
      const r = c.kind;
      let txt;
      if (r === 'hp') { t.hp = Math.min(100, t.hp + 25); txt = '+25 Leben'; }
      else if (r.startsWith('w:')) { const k = +r.slice(2), add = WEAP[k].id === 'big' ? 1 : 2; t.ammo[k] += add; txt = `+${add} ${WEAP[k].name}`; }
      else { const k = +r.slice(2); t.ex[k]++; txt = `+1 ${EXTRA[k].name}`; }
      pop(c.x, c.y - 50, txt, t.p.color); syncCtrl();
    }
    function dropCrate() {
      const kinds = ['hp', 'w:1', 'w:2', 'w:3', 'w:4', 'e:0', 'e:1', 'e:2'];
      let cx = 0; for (let k = 0; k < 20; k++) { cx = 80 + R() * (TW - 160); if (T.every((t) => Math.abs(t.x - cx) > 70)) break; }
      crates.push({ x: cx, y: -30, fall: true, kind: kinds[(R() * kinds.length) | 0], sway: R() * 6 });
      msg = 'Nachschub-Kiste!'; msgT = 1.2;
    }
    function useExtra(t, k) {
      if (!canAct() || !t.ex[k] || t.usedEx) return;
      t.ex[k]--; t.usedEx = true;
      const id = EXTRA[k].id;
      if (id === 'heal') { const add = Math.min(30, 100 - t.hp); t.hp += add; pop(t.x, t.y - 60, `+${add} Leben`, '#2f9e5b'); }
      else if (id === 'shield') { t.shield = 35; pop(t.x, t.y - 60, 'Schild an', t.p.color); }
      else { t.fuel += FUEL; pop(t.x, t.y - 60, '+100 Sprit', t.p.color); }
      syncCtrl();
    }
    const pop = (px, py, text, color) => { pops.push({ x: px, y: py, text, color, t: 0 }); };

    // ---------- Spielablauf ----------
    function shoot() {
      const t = cur(), w = WEAP[t.w]; if (!t.ammo[t.w]) return;
      keyL = keyR = 0; driving = null; dragX = null;
      t.ammo[t.w]--; if (!t.ammo[t.w]) t.w = 0;
      const a = t.ang * Math.PI / 180, v = t.pow * 8.4, [mx, my] = muzzle(t);
      const list = w.split ? [-0.07, 0, 0.07] : [0];
      shells = list.map((d) => ({ x: mx, y: my, vx: Math.cos(a + d) * v, vy: -Math.sin(a + d) * v, w, trail: [] }));
      phase = 'fly'; syncCtrl();
    }
    function explode(cx, cy, w) {
      if (w.dirt) {   // Erdhügel: Gelände aufschütten
        for (let i = Math.max(0, Math.floor(cx - w.r)); i < Math.min(TW, Math.ceil(cx + w.r)); i++) { const d = Math.sqrt(Math.max(0, w.r * w.r - (i - cx) ** 2)) * 0.85; ground[i] = Math.max(60, Math.min(ground[i], cy + 6) - d); }
        for (let k = 0; k < 10; k++) bits.push({ x: cx, y: cy, vx: (R() - 0.5) * 200, vy: -R() * 200, t: 0 });
        T.forEach((t) => { const g = gAt(t.x); if (t.y > g) t.y = g; });
        return;
      }
      booms.push({ x: cx, y: cy, r: w.r, t: 0 });
      for (let i = Math.max(0, Math.floor(cx - w.r)); i < Math.min(TW, Math.ceil(cx + w.r)); i++) { const d = Math.sqrt(Math.max(0, w.r * w.r - (i - cx) ** 2)); if (ground[i] < cy + d) ground[i] = Math.max(ground[i], cy + d); ground[i] = Math.min(TH - 6, ground[i]); }
      for (let k = 0; k < 14; k++) bits.push({ x: cx, y: cy, vx: (R() - 0.5) * 380, vy: -R() * 340, t: 0 });
      for (const t of T) {
        const d = Math.hypot(t.x - cx, t.y - 10 - cy); if (d >= w.r + 22) continue;
        let dmg = Math.round(w.dmg * (1 - d / (w.r + 22)) + 4);
        if (t.shield > 0) { const ab = Math.min(t.shield, dmg); t.shield -= ab; dmg -= ab; if (t.shield <= 0) pop(t.x, t.y - 90, 'Schild kaputt', ink); }
        t.hp -= dmg; t.hurt = 1; t.lost = dmg;
      }
      crates = crates.filter((c) => Math.hypot(c.x - cx, c.y - 12 - cy) > w.r + 10 || c.fall);   // Kisten können zerplatzen
    }
    function nextTurn() {
      T.forEach((t) => { t.y = gAt(t.x); });
      const dead = T.filter((t) => t.hp <= 0); turns++;
      if (dead.length || turns >= 50) {
        over = true; phase = 'over';
        const w = dead.length === 2 ? null : dead.length ? (dead[0].i ? 0 : 1) : T[0].hp > T[1].hp ? 0 : T[1].hp > T[0].hp ? 1 : null;
        msg = w == null ? 'Unentschieden' : `${T[w].p.name} gewinnt!`; msgT = 9;
        setTimeout(() => { cleanup(); resolve({ w, detail: `Leben: ${Math.max(0, T[0].hp)} zu ${Math.max(0, T[1].hp)}` }); }, 1500);
        syncCtrl(); return;
      }
      turn = 1 - turn; newWind(); phase = 'aim';
      const t = cur(); t.fuel = Math.max(t.fuel, FUEL); t.usedEx = false;
      msg = `${t.p.name} ist dran`; msgT = 1.1;
      if (turns % 3 === 2 && crates.length < 3) dropCrate();
      syncCtrl();
      if (!human()) setTimeout(cpuTurn, 900);
    }

    // ---------- Computer ----------
    function sim(t, ang, pow) {
      const a = ang * Math.PI / 180, v = pow * 8.4; let [px, py] = muzzle(t, ang); let vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
      for (let k = 0; k < 900; k++) { const d = 1 / 60; vx += wind * 60 * d; vy += GRAV * d; px += vx * d; py += vy * d; if (px < 0 || px >= TW) return [px, py]; if (py >= ground[Math.round(px)]) return [px, py]; }
      return [px, py];
    }
    function cpuTurn() {
      if (over || fx.signal.aborted) return;
      const t = cur(), reach = t.fuel * FUEL_PX * 0.8;
      // Extras
      if (t.hp < 45 && t.ex[0]) useExtraCpu(t, 0); else if (t.ex[1] && R() < 0.35) useExtraCpu(t, 1);
      // Kiste in Reichweite? Sonst manchmal ein Stück fahren
      const box = crates.filter((c) => !c.fall && Math.abs(c.x - t.x) < reach).sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
      let goal = null;
      if (box) goal = box.x; else if (R() < 0.55) goal = Math.max(40, Math.min(TW - 40, t.x + (R() < 0.5 ? -1 : 1) * (30 + R() * 90)));
      if (goal == null) { setTimeout(cpuAim, 300); return; }
      cpuDrive = { goal, until: performance.now() + 3500 };
    }
    function useExtraCpu(t, k) { t.ex[k]--; const id = EXTRA[k].id; if (id === 'heal') { const add = Math.min(30, 100 - t.hp); t.hp += add; pop(t.x, t.y - 60, `+${add} Leben`, '#2f9e5b'); } else if (id === 'shield') { t.shield = 35; pop(t.x, t.y - 60, 'Schild an', t.p.color); } syncCtrl(); }
    function cpuAim() {
      if (over || fx.signal.aborted) return;
      const t = cur(), foe = T[1 - turn]; let best = null;
      const lo = foe.x < t.x ? 95 : 10, hi = foe.x < t.x ? 170 : 85;
      for (let ang = lo; ang <= hi; ang += 3) for (let pow = 20; pow <= 100; pow += 3) { const [px, py] = sim(t, ang, pow); const d = Math.hypot(px - foe.x, py - foe.y); if (!best || d < best.d) best = { d, ang, pow }; }
      const err = 6 + R() * 10;
      const goalA = best.ang + (R() - 0.5) * err * 0.5, goalP = Math.max(10, Math.min(100, best.pow + (R() - 0.5) * err));
      if (t.ammo[2] && R() < 0.3) t.w = 2; else if (t.ammo[3] && R() < 0.25) t.w = 3; else if (t.ammo[1] && R() < 0.3) t.w = 1; else t.w = 0;
      const a0 = t.ang, p0 = t.pow; let k = 0;
      const anim = () => { if (fx.signal.aborted || over) return; k = Math.min(1, k + 0.06); t.ang = a0 + (goalA - a0) * k; t.pow = p0 + (goalP - p0) * k; syncCtrl(); if (k < 1) setTimeout(anim, 30); else setTimeout(shoot, 350); };
      anim();
    }

    // ---------- Zeichnen ----------
    function drawTank(t) {
      const c = t.p.color, tl = tilt(t); x.save(); x.translate(t.x, t.y);
      if (t.hurt > 0) x.translate(Math.sin(t.hurt * 40) * 3 * t.hurt, 0);
      x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink;
      x.save(); x.rotate(tl);
      // Rohr (Weltwinkel, darum Drehung zurück)
      x.save(); x.translate(0, -16); x.rotate(-tl);
      const a = t.ang * Math.PI / 180; x.lineWidth = 9; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 32, -Math.sin(a) * 32); x.stroke();
      x.strokeStyle = shade(c, dark ? 0 : -0.15); x.lineWidth = 5; x.stroke(); x.strokeStyle = ink; x.restore();
      // Turm
      x.fillStyle = dark ? shade(c, -0.3) : shade(c, 0.45); x.beginPath(); x.arc(0, -14, 12, Math.PI, 0); x.closePath(); x.fill(); x.lineWidth = 2.2; x.stroke();
      // Wanne
      x.fillStyle = dark ? shade(c, -0.3) : shade(c, 0.45); prect(x, -24, -12, 48, 12, 30 + t.i, 0.6); x.fill();
      hatch(x, -24, -12, 48, 12, c, 5, 0.9, 1.4); prect(x, -24, -12, 48, 12, 30 + t.i, 0.6); x.stroke();
      // Ketten (Räder drehen sich beim Fahren)
      x.fillStyle = dark ? '#2a2e37' : '#e9e6dc'; x.beginPath(); x.roundRect(-27, -3, 54, 10, 5); x.fill(); x.stroke();
      x.lineWidth = 1.5; const rr = (t.roll || 0) / 3;
      for (let k = -18; k <= 18; k += 12) { x.beginPath(); x.arc(k, 2, 3, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(k, 2); x.lineTo(k + Math.cos(rr) * 3, 2 + Math.sin(rr) * 3); x.stroke(); }
      x.restore();
      // Schild
      if (t.shield > 0) { x.strokeStyle = c; x.globalAlpha = 0.55 + Math.sin(performance.now() / 200) * 0.15; x.lineWidth = 3; x.setLineDash([7, 6]); x.beginPath(); x.arc(0, -12, 40, Math.PI * 1.02, Math.PI * 1.98); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
      x.restore();
    }
    function drawCrate(c) {
      x.save(); x.translate(c.x, c.y); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 2;
      if (c.fall) {   // Fallschirm
        const sw = Math.sin(performance.now() / 400 + c.sway) * 0.12; x.rotate(sw);
        x.fillStyle = dark ? '#3b4252' : '#fff8e6'; x.beginPath(); x.arc(0, -50, 26, Math.PI, 0); x.closePath(); x.fill(); x.stroke();
        x.beginPath(); x.moveTo(-26, -50); x.lineTo(-10, -22); x.moveTo(26, -50); x.lineTo(10, -22); x.moveTo(0, -50); x.lineTo(0, -22); x.stroke();
      }
      x.fillStyle = dark ? '#5a4a30' : '#e2c48f'; prect(x, -13, -24, 26, 24, 7, 0.6); x.fill();
      hatch(x, -13, -24, 26, 24, dark ? '#c9a46a' : '#9a6b2f', 5, 0.7, 1.2); prect(x, -13, -24, 26, 24, 7, 0.6); x.stroke();
      x.fillStyle = ink; x.font = `800 16px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, -11);
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      // Fahren
      if (phase === 'aim' && !over) {
        const t = cur();
        if (human()) {
          let dir = keyR - keyL;
          if (dragX != null && Math.abs(dragX - t.x) > 3) dir = Math.sign(dragX - t.x);
          if (dir) { const f0 = t.fuel; drive(t, dir, dt); if ((f0 > 0) !== (t.fuel > 0) || Math.round(f0) !== Math.round(t.fuel)) syncCtrl(); }
        } else if (cpuDrive) {
          const dir = Math.sign(cpuDrive.goal - t.x);
          if (Math.abs(cpuDrive.goal - t.x) < 4 || !drive(t, dir, dt) || tm > cpuDrive.until) { cpuDrive = null; syncCtrl(); setTimeout(cpuAim, 350); }
          else if ((tm | 0) % 5 === 0) syncCtrl();
        }
      }
      // Schüsse
      if (phase === 'fly') {
        for (const s of shells) {
          if (s.dead) continue;
          if (s.rolling) {   // Rollbombe rollt am Boden weiter
            s.rt += dt; const nx = s.x + s.dir * s.sp * dt, up = gAt(s.x) - gAt(nx);
            s.sp = Math.max(0, s.sp - (up > 0 ? up * 14 : -Math.min(0, up) * -10) - 40 * dt);
            if (up > 0 && up / Math.max(0.01, Math.abs(nx - s.x)) > 2.5) s.sp = 0;
            const hitT = T.find((t) => Math.abs(nx - t.x) < 28);
            s.x = nx; s.y = gAt(s.x) - 6;
            if (hitT || s.sp < 12 || s.rt > 2.2 || s.x < 4 || s.x > TW - 4) { s.dead = true; explode(s.x, s.y, s.w); }
            s.trail.push([s.x, s.y]); if (s.trail.length > 40) s.trail.shift();
            continue;
          }
          for (let k = 0; k < 3; k++) {
            const d = dt / 3; s.vx += wind * 60 * d; s.vy += GRAV * d; s.x += s.vx * d; s.y += s.vy * d;
            if (s.x < -60 || s.x > TW + 60 || s.y > TH + 40) { s.dead = true; break; }
            const gx = Math.round(s.x); const hitT = T.find((t) => Math.abs(s.x - t.x) < 26 && s.y > t.y - 22 && s.y < t.y + 6);
            if (hitT) { s.dead = true; explode(s.x, s.y, s.w); break; }
            if (gx >= 0 && gx < TW && s.y >= ground[gx]) {
              if (s.w.roll) { s.rolling = true; s.rt = 0; s.dir = s.vx >= 0 ? 1 : -1; s.sp = Math.min(260, Math.max(90, Math.abs(s.vx))); s.y = ground[gx] - 6; }
              else { s.dead = true; explode(s.x, s.y, s.w); }
              break;
            }
          }
          if (!s.rolling) { s.trail.push([s.x, s.y]); if (s.trail.length > 40) s.trail.shift(); }
        }
        if (shells.every((s) => s.dead)) { phase = 'settle'; setTimeout(nextTurn, 700); }
      }
      T.forEach((t) => { const g = gAt(t.x); t.y = t.y < g ? Math.min(g, t.y + 260 * dt) : g; t.hurt = Math.max(0, t.hurt - dt * 1.5); });
      for (const c of crates) { if (c.fall) { c.y += 70 * dt; const g = gAt(c.x); if (c.y >= g) { c.y = g; c.fall = false; } } else c.y = gAt(c.x); }
      if (phase === 'aim' && !over) T.forEach((t) => { if (t.y >= gAt(t.x) - 1) pickCrates(t); });
      booms.forEach((b) => { b.t += dt; }); booms = booms.filter((b) => b.t < 0.6);
      bits.forEach((q) => { q.t += dt; q.vy += 700 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }); bits = bits.filter((q) => q.t < 1);
      pops.forEach((q) => { q.t += dt; }); pops = pops.filter((q) => q.t < 1.6);
      msgT = Math.max(0, msgT - dt);
      // Zeichnen
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      U = Math.min(C.cw / TW, C.ch / TH); ox = (C.cw - TW * U) / 2; oy = (C.ch - TH * U) / 2;
      paper(x, C.cw, C.ch, dark, 24 * U, ox, oy);
      x.setTransform(C.dpr * U, 0, 0, C.dpr * U, C.dpr * ox, C.dpr * oy);
      x.strokeStyle = ink; x.globalAlpha = 0.25; x.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const cx = ((k * 420 + tm / 1000 * wind * 40) % (TW + 200) + TW + 200) % (TW + 200) - 100, cy = 80 + k * 40; x.beginPath(); x.arc(cx, cy, 26, Math.PI * 0.9, Math.PI * 2.1); x.arc(cx + 36, cy + 4, 20, Math.PI * 1.1, Math.PI * 2.2); x.stroke(); }
      x.globalAlpha = 1;
      // Gelände
      x.beginPath(); x.moveTo(0, TH); for (let i = 0; i < TW; i += 3) x.lineTo(i, ground[i]); x.lineTo(TW, ground[TW - 1]); x.lineTo(TW, TH); x.closePath();
      x.fillStyle = dark ? '#2c2a24' : '#efe4cc'; x.fill();
      x.save(); x.clip(); hatch(x, 0, 0, TW, TH, dark ? '#8a7a55' : '#b08d57', 9, 0.6, 1.4); x.restore();
      x.strokeStyle = dark ? '#6fbf73' : '#3f9a4b'; x.lineWidth = 5; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i] + 2) : x.moveTo(i, ground[i] + 2)); x.stroke();
      x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i]) : x.moveTo(i, ground[i])); x.stroke();
      crates.forEach(drawCrate);
      // Fahrbereich + Zielhilfe
      if (phase === 'aim' && !over) {
        const t = cur();
        if (human() && t.fuel > 0) {
          const span = t.fuel * FUEL_PX; x.strokeStyle = t.p.color; x.globalAlpha = 0.45; x.lineWidth = 4; x.setLineDash([2, 9]);
          x.beginPath(); for (let i = Math.max(0, Math.round(t.x - span)); i <= Math.min(TW - 1, Math.round(t.x + span)); i += 4) (i <= t.x - span + 4 ? x.moveTo(i, ground[i] + 12) : x.lineTo(i, ground[i] + 12)); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        }
        const a = t.ang * Math.PI / 180, [mx, my] = muzzle(t), L = 30 + t.pow * 1.1;
        x.strokeStyle = t.p.color; x.lineWidth = 3; x.setLineDash([6, 8]); x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + Math.cos(a) * L, my - Math.sin(a) * L); x.stroke(); x.setLineDash([]);
      }
      T.forEach(drawTank);
      for (const s of shells) {
        x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 1.6; x.setLineDash([3, 6]); x.beginPath(); s.trail.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        if (!s.dead) {
          x.fillStyle = s.w.dirt ? (dark ? '#8a7a55' : '#9a6b2f') : ink; x.beginPath(); x.arc(s.x, s.y, s.w.id === 'big' ? 8 : s.w.dirt ? 7 : 5, 0, Math.PI * 2); x.fill();
          if (s.w.roll) { x.strokeStyle = dark ? '#ffd166' : '#e0483e'; x.lineWidth = 2; x.beginPath(); x.arc(s.x, s.y, 8, 0, Math.PI * 2); x.stroke(); }
        }
      }
      for (const b of booms) {
        const k = b.t / 0.6; x.fillStyle = `rgba(255,${Math.round(180 - k * 120)},60,${0.75 * (1 - k)})`; pcirc(x, b.x, b.y, b.r * (0.5 + k * 0.7), 7, 0.25); x.fill();
        x.strokeStyle = ink; x.globalAlpha = 1 - k; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1;
      }
      x.fillStyle = dark ? '#8a7a55' : '#7a5a35'; bits.forEach((q) => { x.globalAlpha = 1 - q.t; x.fillRect(q.x - 2.5, q.y - 2.5, 5, 5); }); x.globalAlpha = 1;
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      T.forEach((t) => { if (t.hurt > 0 && t.lost) { x.globalAlpha = t.hurt; x.fillStyle = '#e0483e'; x.font = `800 26px ${FONT}`; x.fillText(`-${t.lost}`, t.x, t.y - 60 - (1 - t.hurt) * 30); x.globalAlpha = 1; } });
      pops.forEach((q) => { x.globalAlpha = Math.min(1, (1.6 - q.t) * 2); x.font = `800 22px ${FONT}`; x.lineWidth = 4; x.strokeStyle = dark ? '#1b1f28' : '#fbfaf5'; x.strokeText(q.text, q.x, q.y - q.t * 30); x.fillStyle = q.color; x.fillText(q.text, q.x, q.y - q.t * 30); x.globalAlpha = 1; });
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); x.font = `800 ${Math.round(Math.min(34, C.cw / 16))}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 20, x.measureText(msg).width + 40), hh = Math.min(34, C.cw / 16) + 24;
        x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, C.cw / 2 - w / 2, 14, w, hh, 8, 1); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(msg, C.cw / 2, 14 + hh / 2 + 1, w - 20); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    T.forEach((t) => { t.y = gAt(t.x); });
    msg = `${cur().p.name} fängt an`; msgT = 1.4;
    syncCtrl();
    if (!human()) setTimeout(cpuTurn, 1200);
    if (typeof window !== 'undefined') window.__tkDebug = { T, crates: () => crates, dropCrate, get phase() { return phase; }, ground };
    raf = requestAnimationFrame(frame);
  });
}
