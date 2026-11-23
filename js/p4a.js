// Papier-Spiele, Paket 4 (Teil 1): Schiffe versenken (auf Karopapier) und Papierpanzer (Winkel + Kraft, Gelände geht kaputt).
// Zu zweit an einem iPad (mit „Gib das iPad weiter“-Karten) oder gegen den Computer.
import { h, icon } from './ui.js';
import { FONT, UIFONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, rng, turnCard } from './sketch.js';
import { STD_FLEET, rot, dims, drawShip } from './shipart.js';
import { shipFleet } from './hub.js';

const wait = (ms, sig) => new Promise((r) => { const t = setTimeout(r, ms); sig.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

// ======================================================================
// Schiffe versenken
// ======================================================================
const N = 10, COLS = 'ABCDEFGHIJ';
// Schiff: { shape: Kästchen-Form, r: Drehung 0-3, x, y }
const shapeOf = (s) => rot(s.shape, s.r);
function cellsOf(s) { return shapeOf(s).map(([a, b]) => [s.x + a, s.y + b]); }
function fits(ships, s, skip) {
  const cs = cellsOf(s);
  if (cs.some(([x, y]) => x < 0 || y < 0 || x >= N || y >= N)) return false;
  for (const o of ships) { if (o === skip) continue; for (const [a, b] of cellsOf(o)) for (const [x, y] of cs) if (a === x && b === y) return false; }
  return true;
}
function randomFleet(R, shapes = STD_FLEET) {
  const order = shapes.map((sh, i) => i).sort((i, j) => shapes[j].length - shapes[i].length);   // große zuerst
  for (let tries = 0; tries < 200; tries++) {
    const ships = new Array(shapes.length); let ok = true;
    for (const i of order) {
      let placed = false;
      for (let k = 0; k < 300 && !placed; k++) { const s = { shape: shapes[i], r: (R() * 4) | 0, x: (R() * N) | 0, y: (R() * N) | 0 }; if (fits(ships.filter(Boolean), s)) { ships[i] = s; placed = true; } }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return [];
}
// Brett zeichnen: Karos, Buchstaben/Zahlen, Schiffe, Schüsse
function drawSea(x, cw, ch, dark, { ships = [], shots = null, showShips = true, sunkOnly = false, hover = null, color = '#4f7cff', label = '' }) {
  const ink = inkOf(dark);
  const lab = Math.max(14, Math.min(26, Math.min(cw, ch) / 16));
  const cs = Math.floor(Math.min((cw - lab - 10) / N, (ch - lab - 10 - (label ? lab : 0)) / N));
  const X0 = Math.round((cw - N * cs + lab) / 2), Y0 = Math.round((ch - N * cs + lab + (label ? lab : 0)) / 2);
  paper(x, cw, ch, dark, cs, X0, Y0);
  x.fillStyle = dark ? 'rgba(80,140,255,.07)' : 'rgba(80,140,255,.06)'; x.fillRect(X0, Y0, N * cs, N * cs);
  x.strokeStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(60,100,170,.25)'; x.lineWidth = 1; x.beginPath();
  for (let k = 0; k <= N; k++) { x.moveTo(X0 + k * cs + 0.5, Y0); x.lineTo(X0 + k * cs + 0.5, Y0 + N * cs); x.moveTo(X0, Y0 + k * cs + 0.5); x.lineTo(X0 + N * cs, Y0 + k * cs + 0.5); }
  x.stroke();
  x.strokeStyle = ink; x.lineWidth = 2.6; x.lineCap = 'round'; prect(x, X0, Y0, N * cs, N * cs, 17, 1); x.stroke();
  x.fillStyle = ink; x.font = `700 ${Math.round(lab * 0.75)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let k = 0; k < N; k++) { x.fillText(COLS[k], X0 + (k + 0.5) * cs, Y0 - lab * 0.55); x.fillText(String(k + 1), X0 - lab * 0.6, Y0 + (k + 0.5) * cs); }
  if (label) { x.font = `700 ${Math.round(lab * 0.8)}px ${UIFONT}`; x.fillText(label, cw / 2, Y0 - lab * 1.5); }
  // Schiffe
  for (const s of ships) {
    if (!showShips && !(sunkOnly && s.sunk)) continue;
    drawShip(x, cellsOf(s), X0, Y0, cs, { color, dark, sunk: !!s.sunk });
  }
  // Schüsse
  if (shots) for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const v = shots[y * N + xx]; if (!v) continue;
    const cx = X0 + (xx + 0.5) * cs, cy = Y0 + (y + 0.5) * cs;
    if (v === 1) { x.strokeStyle = ink; x.globalAlpha = 0.7; x.lineWidth = 1.6; pcirc(x, cx, cy, cs * 0.16, xx * 13 + y, 0.2); x.stroke(); x.globalAlpha = 1; }
    else { x.strokeStyle = '#e0483e'; x.lineWidth = Math.max(2.5, cs * 0.1); pline(x, cx - cs * 0.3, cy - cs * 0.3, cx + cs * 0.3, cy + cs * 0.3, xx + y * 10, 0.8); pline(x, cx + cs * 0.3, cy - cs * 0.3, cx - cs * 0.3, cy + cs * 0.3, xx + y * 10 + 5, 0.8); }
  }
  if (hover) { x.strokeStyle = color; x.lineWidth = 3; prect(x, X0 + hover[0] * cs + 2, Y0 + hover[1] * cs + 2, cs - 4, cs - 4, 5, 0.6); x.stroke(); }
  return { X0, Y0, cs };
}
// Schiffe setzen (ziehen = verschieben, tippen = drehen)
function placeFleet(fx, p, R, shapes) {
  return new Promise((resolve) => {
    const dark = isDark();
    let ships = randomFleet(R, shapes);
    const info = h('p.bshint', { text: 'Schiff ziehen = verschieben, kurz tippen = drehen. Schiffe dürfen direkt aneinander liegen.' });
    const btnR = h('button.btn', { text: 'Neu verteilen', on: { click: () => { ships = randomFleet(R, shapes); draw(); } } });
    const btnOk = h('button.btn.primary', { text: 'Fertig', on: { click: () => { cleanup(); resolve(ships); } } });
    const host = h('div.bsplace');
    const wrap = h('div.bswrap.place', null, h('div.hshud', null, chip(p, h('small', { text: 'setzt die Flotte' })), h('span.bsspacer'), btnR, btnOk), info, host);
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host); let geo = null, drag = null;
    const draw = () => { const x = C.begin(); geo = drawSea(x, C.cw, C.ch, dark, { ships, color: p.color }); if (drag && !drag.ok) { x.strokeStyle = '#e0483e'; x.lineWidth = 3; const s = drag.s; cellsOf(s).forEach(([a, b]) => x.strokeRect(geo.X0 + a * geo.cs + 2, geo.Y0 + b * geo.cs + 2, geo.cs - 4, geo.cs - 4)); } };
    const ro = new ResizeObserver(draw); ro.observe(host);
    const cell = (e) => { const r = C.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - geo.X0) / geo.cs), Math.floor((e.clientY - r.top - geo.Y0) / geo.cs)]; };
    C.cv.addEventListener('pointerdown', (e) => {
      const [cx, cy] = cell(e); const s = ships.find((q) => cellsOf(q).some(([a, b]) => a === cx && b === cy)); if (!s) return;
      e.preventDefault(); drag = { s, ox: s.x, oy: s.y, gx: cx - s.x, gy: cy - s.y, moved: false, ok: true }; try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => {
      if (!drag) return; const [cx, cy] = cell(e), nx = cx - drag.gx, ny = cy - drag.gy;
      if (nx !== drag.s.x || ny !== drag.s.y) { drag.moved = true; const [dw, dh] = dims(shapeOf(drag.s)); drag.s.x = Math.max(0, Math.min(N - dw, nx)); drag.s.y = Math.max(0, Math.min(N - dh, ny)); drag.ok = fits(ships, drag.s, drag.s); draw(); }
    });
    const up = () => {
      if (!drag) return; const s = drag.s;
      if (!drag.moved) {
        // um das angetippte Feld drehen, dann notfalls ins Brett schieben
        const old = { r: s.r, x: s.x, y: s.y }; s.r = (s.r + 1) % 4;
        const [dw, dh] = dims(shapeOf(s)); s.x = Math.max(0, Math.min(N - dw, s.x)); s.y = Math.max(0, Math.min(N - dh, s.y));
        if (!fits(ships, s, s)) { Object.assign(s, old); info.textContent = 'Hier passt das gedrehte Schiff nicht hin.'; }
      }
      else if (!fits(ships, s, s)) { s.x = drag.ox; s.y = drag.oy; info.textContent = 'Da geht es nicht: Schiffe dürfen sich nicht überlappen.'; }
      drag = null; draw();
    };
    C.cv.addEventListener('pointerup', up); C.cv.addEventListener('pointercancel', up);
    const cleanup = () => { ro.disconnect(); C.ro.disconnect(); };
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    draw();
  });
}
export function ships(fx, A, B, o = {}) {
  return (async () => {
    const cpu = !!o.cpu, R = rng((Math.random() * 1e9) | 0), dark = isDark();
    const P = [A, B].map((p) => ({ p, fleet: null, shots: new Uint8Array(N * N), n: 0 }));
    // Flotten setzen
    for (const [i, q] of P.entries()) {
      const shapes = (!(cpu && i === 1) && shipFleet(q.p.name)) || STD_FLEET;
      if (cpu && i === 1) { q.fleet = randomFleet(R, shapes); continue; }
      if (!cpu) { const ok = await turnCard(fx, q.p, `${q.p.name} setzt die Schiffe`, `${P[1 - i].p.name} schaut bitte weg!`, 'Ich bin bereit', 'grid'); if (!ok) return null; }
      q.fleet = await placeFleet(fx, q.p, R, shapes); if (!q.fleet) return null;
    }
    // Computer-Gedächtnis
    const ai = { hits: [] };
    function cpuPick(shots, fleet) {
      const open = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !shots[y * N + x];
      const live = ai.hits.filter(([x, y]) => !fleet.some((s) => s.sunk && cellsOf(s).some(([a, b]) => a === x && b === y)));
      if (live.length) {
        const cand = [];
        if (live.length > 1) {
          const v = live.every(([x]) => x === live[0][0]), hz = live.every(([, y]) => y === live[0][1]);
          if (v || hz) { const xs = live.map((c) => (v ? c[1] : c[0])), lo = Math.min(...xs), hi = Math.max(...xs); const c0 = v ? [live[0][0], lo - 1] : [lo - 1, live[0][1]], c1 = v ? [live[0][0], hi + 1] : [hi + 1, live[0][1]]; [c0, c1].forEach((c) => { if (open(...c)) cand.push(c); }); }
        }
        if (!cand.length) live.forEach(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { if (open(x + dx, y + dy)) cand.push([x + dx, y + dy]); }));
        if (cand.length) return cand[(R() * cand.length) | 0];
      }
      const all = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (open(x, y) && (x + y) % 2 === 0) {
        all.push([x, y]);
      }
      if (!all.length) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (open(x, y)) all.push([x, y]);
      return all[(R() * all.length) | 0];
    }
    function fire(i, x, y) {   // Spieler i schießt auf Flotte von 1-i
      const me = P[i], foe = P[1 - i]; me.n++;
      const s = foe.fleet.find((q) => cellsOf(q).some(([a, b]) => a === x && b === y));
      me.shots[y * N + x] = s ? 2 : 1;
      if (!s) return 'miss';
      if (cellsOf(s).every(([a, b]) => me.shots[b * N + a] === 2)) {
        s.sunk = true;
        return foe.fleet.every((q) => q.sunk) ? 'win' : 'sunk';
      }
      return 'hit';
    }
    // Spielansicht
    let turn = R() < 0.5 ? 0 : 1;
    for (;;) {
      const me = P[turn], foe = P[1 - turn];
      if (!(cpu && turn === 1) && !cpu) { const ok = await turnCard(fx, me.p, `${me.p.name} ist dran`, `${foe.p.name} schaut bitte weg!`, 'Los', 'target'); if (!ok) return null; }
      const res = await new Promise((resolve) => {
        const status = h('p.bshint');
        const bigHost = h('div.bsbig'), smallHost = h('div.bssmall');
        const left = (q) => q.fleet.filter((s) => !s.sunk).length;
        const legend = h('div.bslegend');
        const wrap = h('div.bswrap', null, h('div.hshud', null, chip(me.p, h('small', { text: cpu && turn === 1 ? 'zielt …' : 'schießt' })), h('span.bsspacer'), legend), status, h('div.bsboards', null, bigHost, smallHost));
        fx.stage.replaceChildren(wrap);
        const B1 = canvasBox(bigHost), B2 = canvasBox(smallHost);
        let geo = null, hover = null, busy = cpu && turn === 1, lastRes = '';
        const updLegend = () => legend.replaceChildren(h('span.hsstat', null, h('small', { text: 'Gegner-Schiffe' }), h('b', { text: String(left(foe)) })), h('span.hsstat', null, h('small', { text: 'Deine Schiffe' }), h('b', { text: String(left(me)) })), h('span.hsstat', null, h('small', { text: 'Schüsse' }), h('b', { text: String(me.n) })));
        const draw = () => {
          const vw = cpu ? P[0] : me, tg = cpu ? P[1] : foe;   // gegen den Computer immer aus deiner Sicht
          const x1 = B1.begin(); geo = drawSea(x1, B1.cw, B1.ch, dark, { ships: tg.fleet, shots: vw.shots, showShips: false, sunkOnly: true, hover, color: tg.p.color, label: `Meer von ${tg.p.name}` });
          const x2 = B2.begin(); drawSea(x2, B2.cw, B2.ch, dark, { ships: vw.fleet, shots: tg.shots, color: vw.p.color, label: cpu ? 'Deine Flotte' : `Flotte von ${vw.p.name}` });
        };
        const ro = new ResizeObserver(draw); ro.observe(wrap);
        status.textContent = busy ? 'Der Computer überlegt …' : 'Tippe auf ein Feld im Meer des Gegners. Jeder hat einen Schuss pro Zug.';
        updLegend();
        const cell = (e) => { const r = B1.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - geo.X0) / geo.cs), Math.floor((e.clientY - r.top - geo.Y0) / geo.cs)]; };
        const finish = (v) => { ro.disconnect(); B1.ro.disconnect(); B2.ro.disconnect(); resolve(v); };
        const after = async (r, x, y) => {
          const name = `${COLS[x]}${y + 1}`;
          lastRes = r;
          status.textContent = r === 'miss' ? `${name}: Wasser.` : r === 'hit' ? `${name}: Treffer!` : r === 'sunk' ? `${name}: Versenkt!` : `${name}: Alle Schiffe versenkt!`;
          updLegend(); draw();
          if (r === 'win') { await wait(1200, fx.signal); return finish('win'); }
          busy = true; await wait(r === 'miss' ? 1000 : 1300, fx.signal); return finish('next');
        };
        const cpuTurn = async () => { await wait(650, fx.signal); if (fx.signal.aborted) return; const [x, y] = cpuPick(me.shots, foe.fleet); const r = fire(1, x, y); if (r !== 'miss') ai.hits.push([x, y]); after(r, x, y); };
        B1.cv.addEventListener('pointermove', (e) => { if (busy || e.pointerType !== 'mouse') return; const c = cell(e); hover = c[0] >= 0 && c[1] >= 0 && c[0] < N && c[1] < N ? c : null; draw(); });
        B1.cv.addEventListener('pointerdown', (e) => {
          e.preventDefault(); if (busy || fx.signal.aborted) return;
          const [x, y] = cell(e); if (x < 0 || y < 0 || x >= N || y >= N) return;
          if (me.shots[y * N + x]) { status.textContent = 'Da hast du schon hingeschossen.'; return; }
          busy = true; hover = null; after(fire(turn, x, y), x, y);
        });
        fx.signal.addEventListener('abort', () => finish(null), { once: true });
        draw();
        if (busy) cpuTurn();
      });
      if (!res || fx.signal.aborted) return null;
      if (res === 'win') return { w: turn, detail: `${P[turn].p.name} hat alle Schiffe versenkt, mit ${P[turn].n} Schüssen.` };
      turn = 1 - turn;
    }
  })();
}

// ======================================================================
// Papierpanzer
// ======================================================================
const TW = 1200, TH = 700, GRAV = 420;
const WEAP = [
  { id: 'ball', name: 'Kugel', r: 40, dmg: 42, n: Infinity },
  { id: 'three', name: 'Dreier', r: 26, dmg: 22, n: 2, split: 3 },
  { id: 'big', name: 'Riesenknall', r: 75, dmg: 60, n: 1 },
];
export function tanks(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = !!o.cpu, R = rng((Math.random() * 1e9) | 0), dark = isDark(), ink = inkOf(dark);
    // Gelände
    const ground = new Float32Array(TW);
    const ph = [R() * 6, R() * 6, R() * 6], amp = [70 + R() * 50, 30 + R() * 25, 12];
    for (let i = 0; i < TW; i++) ground[i] = TH * 0.62 - amp[0] * Math.sin(i / TW * Math.PI * (1.2 + ph[0] / 6) + ph[0]) - amp[1] * Math.sin(i / 90 + ph[1]) - amp[2] * Math.sin(i / 31 + ph[2]);
    const T = [A, B].map((p, i) => ({ p, i, x: i ? TW * (0.8 + R() * 0.08) : TW * (0.12 + R() * 0.08), y: 0, ang: i ? 135 : 45, pow: 62, hp: 100, ammo: WEAP.map((w) => w.n), w: 0, hurt: 0 }));
    const flat = (t) => { const x0 = Math.round(t.x), g = ground[x0]; for (let k = -22; k <= 22; k++) { const xx = x0 + k; if (xx >= 0 && xx < TW) ground[xx] = g; } };   // ebener Platz für den Panzer
    T.forEach(flat);
    let turn = R() < 0.5 ? 0 : 1, wind = 0, shells = [], booms = [], bits = [], phase = 'aim', raf = 0, last = 0, turns = 0, over = false, msg = '', msgT = 0;
    const newWind = () => { wind = Math.round((R() * 2 - 1) * 10) / 10; };
    newWind();

    // ---------- Oberfläche ----------
    const angIn = h('input.tkrange', { type: 'range', min: 0, max: 180, step: 1 });
    const powIn = h('input.tkrange', { type: 'range', min: 10, max: 100, step: 1 });
    const angV = h('b'), powV = h('b');
    const weapSeg = h('div.gseg.tkweap');
    const fireBtn = h('button.btn.primary.tkfire', null, icon('target'), h('span', { text: 'Feuer!' }));
    const hpEls = T.map((t) => { const bar = h('span.tkbar', null, h('i', { style: { background: t.p.color } })); return { el: h('div.tkhp', null, chip(t.p), bar), bar }; });
    const windEl = h('span.tkwind');
    const hud = h('div.hshud.tkhud', null, hpEls[0].el, windEl, hpEls[1].el);
    const ctrl = h('div.tkctrl', null,
      h('label.tklab', null, h('small', { text: 'Winkel' }), angV, angIn),
      h('label.tklab', null, h('small', { text: 'Kraft' }), powV, powIn),
      weapSeg, fireBtn);
    const host = h('div.tkfield');
    const wrap = h('div.hswrap.tkwrap', null, hud, host, ctrl);
    fx.stage.append(wrap);
    const C = canvasBox(host), x = C.x;
    let U = 1, ox = 0, oy = 0;
    const cur = () => T[turn];
    const human = () => !(cpu && turn === 1);
    function syncCtrl() {
      const t = cur();
      angIn.value = String(t.ang); powIn.value = String(t.pow); angV.textContent = `${Math.round(t.ang)}°`; powV.textContent = String(Math.round(t.pow));
      weapSeg.replaceChildren(...WEAP.map((w, k) => h('button' + (k === t.w ? '.on' : ''), { disabled: !t.ammo[k], text: t.ammo[k] === Infinity ? w.name : `${w.name} ×${t.ammo[k]}`, on: { click: () => { t.w = k; syncCtrl(); } } })));
      const dis = phase !== 'aim' || !human();
      [angIn, powIn, fireBtn].forEach((el) => { el.disabled = dis; }); weapSeg.querySelectorAll('button').forEach((b, k) => { if (dis) b.disabled = true; else b.disabled = !t.ammo[k]; });
      ctrl.style.setProperty('--pc', t.p.color);
      windEl.textContent = wind === 0 ? 'Kein Wind' : `Wind ${wind > 0 ? '→' : '←'} ${Math.abs(wind * 10).toFixed(0)}`;
      hpEls.forEach((e, k) => { e.bar.firstChild.style.width = `${Math.max(0, T[k].hp)}%`; e.el.classList.toggle('on', k === turn); });
    }
    angIn.addEventListener('input', () => { cur().ang = +angIn.value; syncCtrl(); });
    powIn.addEventListener('input', () => { cur().pow = +powIn.value; syncCtrl(); });
    fireBtn.addEventListener('click', () => { if (phase === 'aim' && human()) shoot(); });
    // Zielen durch Ziehen auf dem Feld
    let aiming = null;
    const toW = (e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / U, (e.clientY - r.top - oy) / U]; };
    C.cv.addEventListener('pointerdown', (e) => { if (phase !== 'aim' || !human()) return; e.preventDefault(); aiming = e.pointerId; aimAt(toW(e)); try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (aiming === e.pointerId) aimAt(toW(e)); });
    C.cv.addEventListener('pointerup', (e) => { if (aiming === e.pointerId) aiming = null; });
    function aimAt([wx, wy]) { const t = cur(), dx = wx - t.x, dy = (t.y - 14) - wy; t.ang = Math.max(0, Math.min(180, Math.round(Math.atan2(Math.max(0, dy), dx) * 180 / Math.PI))); t.pow = Math.max(10, Math.min(100, Math.round(Math.hypot(dx, dy) / 3.2))); syncCtrl(); }
    const onKey = (e) => {
      if (phase !== 'aim' || !human()) return; const t = cur();
      if (e.code === 'ArrowLeft') t.ang = Math.min(180, t.ang + 1); else if (e.code === 'ArrowRight') t.ang = Math.max(0, t.ang - 1);
      else if (e.code === 'ArrowUp') t.pow = Math.min(100, t.pow + 1); else if (e.code === 'ArrowDown') t.pow = Math.max(10, t.pow - 1);
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shoot(); return; } else return;
      e.preventDefault(); syncCtrl();
    };
    document.addEventListener('keydown', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    // ---------- Spielablauf ----------
    const muzzle = (t) => { const a = t.ang * Math.PI / 180; return [t.x + Math.cos(a) * 30, t.y - 16 - Math.sin(a) * 30]; };
    function shoot() {
      const t = cur(), w = WEAP[t.w]; if (!t.ammo[t.w]) return;
      t.ammo[t.w]--; if (!t.ammo[t.w]) t.w = 0;
      const a = t.ang * Math.PI / 180, v = t.pow * 8.4, [mx, my] = muzzle(t);
      const list = w.split ? [-0.07, 0, 0.07] : [0];
      shells = list.map((d) => ({ x: mx, y: my, vx: Math.cos(a + d) * v, vy: -Math.sin(a + d) * v, w, trail: [] }));
      phase = 'fly'; syncCtrl();
    }
    function explode(cx, cy, w) {
      booms.push({ x: cx, y: cy, r: w.r, t: 0 });
      for (let i = Math.max(0, Math.floor(cx - w.r)); i < Math.min(TW, Math.ceil(cx + w.r)); i++) { const d = Math.sqrt(Math.max(0, w.r * w.r - (i - cx) ** 2)); if (ground[i] < cy + d) ground[i] = Math.max(ground[i], cy + d); ground[i] = Math.min(TH - 6, ground[i]); }
      for (let k = 0; k < 14; k++) bits.push({ x: cx, y: cy, vx: (R() - 0.5) * 380, vy: -R() * 340, t: 0 });
      for (const t of T) { const d = Math.hypot(t.x - cx, t.y - 10 - cy); if (d < w.r + 22) { const dmg = Math.round(w.dmg * (1 - d / (w.r + 22)) + 4); t.hp -= dmg; t.hurt = 1; t.lost = dmg; } }
    }
    function nextTurn() {
      T.forEach((t) => { t.y = ground[Math.round(Math.max(0, Math.min(TW - 1, t.x)))]; });
      const dead = T.filter((t) => t.hp <= 0); turns++;
      if (dead.length || turns >= 40) {
        over = true; phase = 'over';
        const w = dead.length === 2 ? null : dead.length ? (dead[0].i ? 0 : 1) : T[0].hp > T[1].hp ? 0 : T[1].hp > T[0].hp ? 1 : null;
        msg = w == null ? 'Unentschieden' : `${T[w].p.name} gewinnt!`; msgT = 9;
        setTimeout(() => { cleanup(); resolve({ w, detail: `Leben: ${Math.max(0, T[0].hp)} zu ${Math.max(0, T[1].hp)}` }); }, 1500);
        syncCtrl(); return;
      }
      turn = 1 - turn; newWind(); phase = 'aim'; msg = `${cur().p.name} ist dran`; msgT = 1.1; syncCtrl();
      if (!human()) setTimeout(cpuAim, 900);
    }
    function sim(t, ang, pow) {
      const a = ang * Math.PI / 180, v = pow * 8.4; let [px, py] = muzzle({ ...t, ang }); let vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
      for (let k = 0; k < 900; k++) { const d = 1 / 60; vx += wind * 60 * d; vy += GRAV * d; px += vx * d; py += vy * d; if (px < 0 || px >= TW) return [px, py]; if (py >= ground[Math.round(px)]) return [px, py]; }
      return [px, py];
    }
    function cpuAim() {
      if (over || fx.signal.aborted) return;
      const t = cur(), foe = T[1 - turn]; let best = null;
      for (let ang = 95; ang <= 170; ang += 3) for (let pow = 20; pow <= 100; pow += 3) { const [px, py] = sim(t, ang, pow); const d = Math.hypot(px - foe.x, py - foe.y); if (!best || d < best.d) best = { d, ang, pow }; }
      const err = 6 + R() * 10;
      const goalA = best.ang + (R() - 0.5) * err * 0.5, goalP = Math.max(10, Math.min(100, best.pow + (R() - 0.5) * err));
      if (t.ammo[2] && R() < 0.3) t.w = 2; else if (t.ammo[1] && R() < 0.3) t.w = 1; else t.w = 0;
      // sichtbar zielen
      const a0 = t.ang, p0 = t.pow; let k = 0;
      const anim = () => { if (fx.signal.aborted || over) return; k = Math.min(1, k + 0.06); t.ang = a0 + (goalA - a0) * k; t.pow = p0 + (goalP - p0) * k; syncCtrl(); if (k < 1) setTimeout(anim, 30); else setTimeout(shoot, 350); };
      anim();
    }

    // ---------- Zeichnen ----------
    function drawTank(t) {
      const c = t.p.color; x.save(); x.translate(t.x, t.y);
      if (t.hurt > 0) x.translate(Math.sin(t.hurt * 40) * 3 * t.hurt, 0);
      x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink;
      // Rohr
      const a = t.ang * Math.PI / 180; x.lineWidth = 9; x.beginPath(); x.moveTo(0, -16); x.lineTo(Math.cos(a) * 32, -16 - Math.sin(a) * 32); x.stroke();
      x.strokeStyle = shade(c, dark ? 0 : -0.15); x.lineWidth = 5; x.stroke(); x.strokeStyle = ink;
      // Turm
      x.fillStyle = dark ? shade(c, -0.3) : shade(c, 0.45); x.beginPath(); x.arc(0, -14, 12, Math.PI, 0); x.closePath(); x.fill(); x.lineWidth = 2.2; x.stroke();
      // Wanne
      x.fillStyle = dark ? shade(c, -0.3) : shade(c, 0.45); prect(x, -24, -12, 48, 12, 30 + t.i, 0.6); x.fill();
      hatch(x, -24, -12, 48, 12, c, 5, 0.9, 1.4); prect(x, -24, -12, 48, 12, 30 + t.i, 0.6); x.stroke();
      // Ketten
      x.fillStyle = dark ? '#2a2e37' : '#e9e6dc'; x.beginPath(); x.roundRect(-27, -3, 54, 10, 5); x.fill(); x.stroke();
      x.lineWidth = 1.5; for (let k = -18; k <= 18; k += 12) { x.beginPath(); x.arc(k, 2, 3, 0, Math.PI * 2); x.stroke(); }
      x.restore();
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      // Physik
      if (phase === 'fly') {
        for (const s of shells) {
          if (s.dead) continue;
          for (let k = 0; k < 3; k++) {
            const d = dt / 3; s.vx += wind * 60 * d; s.vy += GRAV * d; s.x += s.vx * d; s.y += s.vy * d;
            if (s.x < -60 || s.x > TW + 60 || s.y > TH + 40) { s.dead = true; break; }
            const gx = Math.round(s.x); const hitT = T.find((t) => Math.abs(s.x - t.x) < 26 && s.y > t.y - 22 && s.y < t.y + 6);
            if (hitT || (gx >= 0 && gx < TW && s.y >= ground[gx])) { s.dead = true; explode(s.x, s.y, s.w); break; }
          }
          s.trail.push([s.x, s.y]); if (s.trail.length > 40) s.trail.shift();
        }
        if (shells.every((s) => s.dead)) { phase = 'settle'; setTimeout(nextTurn, 700); }
      }
      T.forEach((t) => { const g = ground[Math.round(Math.max(0, Math.min(TW - 1, t.x)))]; t.y = t.y < g ? Math.min(g, t.y + 260 * dt) : g; t.hurt = Math.max(0, t.hurt - dt * 1.5); });
      booms.forEach((b) => { b.t += dt; }); booms = booms.filter((b) => b.t < 0.6);
      bits.forEach((q) => { q.t += dt; q.vy += 700 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }); bits = bits.filter((q) => q.t < 1);
      msgT = Math.max(0, msgT - dt);
      // Zeichnen
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      U = Math.min(C.cw / TW, C.ch / TH); ox = (C.cw - TW * U) / 2; oy = (C.ch - TH * U) / 2;
      paper(x, C.cw, C.ch, dark, 24 * U, ox, oy);
      x.setTransform(C.dpr * U, 0, 0, C.dpr * U, C.dpr * ox, C.dpr * oy);
      // Wolken je nach Wind
      x.strokeStyle = ink; x.globalAlpha = 0.25; x.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const cx = ((k * 420 + tm / 1000 * wind * 40) % (TW + 200) + TW + 200) % (TW + 200) - 100, cy = 80 + k * 40; x.beginPath(); x.arc(cx, cy, 26, Math.PI * 0.9, Math.PI * 2.1); x.arc(cx + 36, cy + 4, 20, Math.PI * 1.1, Math.PI * 2.2); x.stroke(); }
      x.globalAlpha = 1;
      // Gelände
      x.beginPath(); x.moveTo(0, TH); for (let i = 0; i < TW; i += 3) x.lineTo(i, ground[i]); x.lineTo(TW, ground[TW - 1]); x.lineTo(TW, TH); x.closePath();
      x.fillStyle = dark ? '#2c2a24' : '#efe4cc'; x.fill();
      x.save(); x.clip(); hatch(x, 0, 0, TW, TH, dark ? '#8a7a55' : '#b08d57', 9, 0.6, 1.4); x.restore();
      x.strokeStyle = dark ? '#6fbf73' : '#3f9a4b'; x.lineWidth = 5; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i] + 2) : x.moveTo(i, ground[i] + 2)); x.stroke();
      x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i]) : x.moveTo(i, ground[i])); x.stroke();
      // Zielhilfe
      if (phase === 'aim') {
        const t = cur(), a = t.ang * Math.PI / 180, [mx, my] = muzzle(t), L = 30 + t.pow * 1.1;
        x.strokeStyle = t.p.color; x.lineWidth = 3; x.setLineDash([6, 8]); x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + Math.cos(a) * L, my - Math.sin(a) * L); x.stroke(); x.setLineDash([]);
      }
      T.forEach(drawTank);
      // Schüsse
      for (const s of shells) {
        x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 1.6; x.setLineDash([3, 6]); x.beginPath(); s.trail.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        if (!s.dead) { x.fillStyle = ink; x.beginPath(); x.arc(s.x, s.y, s.w.id === 'big' ? 8 : 5, 0, Math.PI * 2); x.fill(); }
      }
      for (const b of booms) {
        const k = b.t / 0.6; x.fillStyle = `rgba(255,${Math.round(180 - k * 120)},60,${0.75 * (1 - k)})`; pcirc(x, b.x, b.y, b.r * (0.5 + k * 0.7), 7, 0.25); x.fill();
        x.strokeStyle = ink; x.globalAlpha = 1 - k; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1;
      }
      x.fillStyle = dark ? '#8a7a55' : '#7a5a35'; bits.forEach((q) => { x.globalAlpha = 1 - q.t; x.fillRect(q.x - 2.5, q.y - 2.5, 5, 5); }); x.globalAlpha = 1;
      T.forEach((t) => { if (t.hurt > 0 && t.lost) { x.globalAlpha = t.hurt; x.fillStyle = '#e0483e'; x.font = `800 26px ${FONT}`; x.textAlign = 'center'; x.fillText(`-${t.lost}`, t.x, t.y - 60 - (1 - t.hurt) * 30); x.globalAlpha = 1; } });
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); x.font = `800 ${Math.round(Math.min(34, C.cw / 16))}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 20, x.measureText(msg).width + 40), hh = Math.min(34, C.cw / 16) + 24;
        x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, C.cw / 2 - w / 2, 14, w, hh, 8, 1); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(msg, C.cw / 2, 14 + hh / 2 + 1, w - 20); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    T.forEach((t) => { t.y = ground[Math.round(t.x)]; });
    msg = `${cur().p.name} fängt an`; msgT = 1.4;
    syncCtrl();
    if (!human()) setTimeout(cpuAim, 1200);
    raf = requestAnimationFrame(frame);
  });
}
