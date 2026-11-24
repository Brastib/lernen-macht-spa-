// Papier-Spiele, Paket 4 (Teil 1): Schiffe versenken (auf Karopapier) (Papierpanzer liegt seit v85 in js/tanks.js).
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
