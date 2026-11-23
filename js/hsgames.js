// Papier-Spiele, Paket 3 (Highscore-Duell nacheinander, allein mit Rekord):
// Verdoppler (gleiche Zahlen zusammenschieben), Klötzchenregen (fallende Klötzchen zu vollen Reihen), Blockknacker (Ball gegen Kästchen).
// Eigene Namen und eigener Look: kariertes Papier, Bleistift-Striche, Buntstift-Schraffur.
import { h, icon } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, prect, pcirc, hatch, shade, canvasBox, chip, store, rng, turnCard } from './sketch.js';

// ---------- gemeinsamer Rahmen ----------
function frameUI(fx, p, { stats, finish = true }) {
  const vals = {};
  const statEls = stats.map(([k, label]) => { const b = h('b', { text: '0' }); vals[k] = b; return h('span.hsstat', null, h('small', { text: label }), b); });
  let onFinish = null;
  const fin = finish ? h('button.btn.hsfin', { text: 'Beenden', on: { click: () => onFinish && onFinish() } }) : null;
  const hud = h('div.hshud', null, chip(p), h('div.hsstats', null, ...statEls), fin);
  const area = h('div.hsarea');
  const wrap = h('div.hswrap', null, hud, area);
  fx.stage.append(wrap);
  return { wrap, hud, area, set: (k, v) => { if (vals[k] && vals[k].textContent !== String(v)) vals[k].textContent = String(v); }, finish: (f) => { onFinish = f; } };
}
function overText(x, cw, ch, dark, txt) {
  const ink = inkOf(dark);
  x.save(); const fs = Math.round(Math.max(22, Math.min(40, cw / 12)));
  x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(cw - 24, x.measureText(txt).width + 48), hh = fs + 30;
  x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2;
  prect(x, cw / 2 - w / 2, ch / 2 - hh / 2, w, hh, 61, 1.2); x.fill(); x.stroke();
  x.fillStyle = ink; x.fillText(txt, cw / 2, ch / 2 + 2, w - 24); x.restore();
}
const pts = (n) => `${n} ${n === 1 ? 'Punkt' : 'Punkte'}`;

// Highscore-Duell: erst A, dann B. Allein: ein Spiel, Ergebnis {score}.
async function seq(fx, A, B, play, ic, how) {
  if (!B) { fx.stage.replaceChildren(); const s = await play(fx, A, { solo: true }); return s == null ? null : { score: s }; }
  const sc = [];
  for (const [i, p] of [A, B].entries()) {
    const ok = await turnCard(fx, p, `${p.name} ist dran`, i ? `Zu schlagen: ${pts(sc[0])}` : `${how} Erst spielt ${A.name}, dann ${B.name}. Mehr Punkte gewinnt.`, 'Los geht’s', ic);
    if (!ok || fx.signal.aborted) return null;
    fx.stage.replaceChildren();
    const s = await play(fx, p, { duel: true, beat: i ? sc[0] : null });
    if (s == null || fx.signal.aborted) return null;
    sc.push(s);
  }
  const [a, b] = sc;
  return { w: a > b ? 0 : b > a ? 1 : null, detail: `${pts(a)} : ${pts(b)}` };
}

// ======================================================================
// Verdoppler
// ======================================================================
const TCOL = ['#fff4c7', '#ffe3a3', '#ffc98a', '#ffad7d', '#ff9280', '#f77a95', '#e08ae0', '#b893f2', '#8fa6f7', '#79c2ec', '#6fd3bd', '#93d877', '#d6d45e'];
function doubler(fx, p, o) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark), LIMIT = o.duel ? 180 : 0;
    const best = store.get('gDoubleBest', 0);
    const U = frameUI(fx, p, { stats: [['s', 'Punkte'], ['b', o.beat != null ? 'Zu schlagen' : 'Rekord'], ...(LIMIT ? [['t', 'Zeit']] : [])] });
    U.set('b', o.beat != null ? o.beat : best || '–');
    const C = canvasBox(U.area), x = C.x;
    const hint = h('p.hshint', { text: 'Wischen oder Pfeiltasten: alle Zettel rutschen. Gleiche Zahlen werden verdoppelt.' }); U.hud.after(hint);
    let tiles = [], score = 0, anim = 1, over = false, left = LIMIT, raf = 0, last = 0, uid = 0, moved0 = false;
    const R = rng((Math.random() * 1e9) | 0);
    const at = (r, c) => tiles.find((t) => !t.dying && t.r === r && t.c === c);
    function spawn() {
      const free = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!at(r, c)) free.push([r, c]);
      if (!free.length) return;
      const [r, c] = free[(R() * free.length) | 0];
      tiles.push({ id: ++uid, v: R() < 0.9 ? 2 : 4, r, c, pr: r, pc: c, born: 0, pop: 0, seed: (R() * 1e6) | 0 });
    }
    function canMove() {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const t = at(r, c); if (!t) return true; const a = at(r, c + 1), b = at(r + 1, c); if ((a && a.v === t.v) || (b && b.v === t.v)) return true; }
      return false;
    }
    function move(dir) {   // 0 rechts, 1 runter, 2 links, 3 hoch
      if (over || anim < 1) return;
      tiles = tiles.filter((t) => !t.dying);
      tiles.forEach((t) => { t.pr = t.r; t.pc = t.c; t.pop = 0; t.born = 1; });
      let moved = false;
      for (let line = 0; line < 4; line++) {
        const cells = [0, 1, 2, 3].map((k) => { const kk = dir === 0 || dir === 1 ? 3 - k : k; return dir === 0 || dir === 2 ? [line, kk] : [kk, line]; });
        let pos = 0, lastT = null;
        for (const [r, c] of cells) {
          const t = at(r, c); if (!t) continue;
          if (lastT && lastT.v === t.v && !lastT.merged) {
            t.r = lastT.r; t.c = lastT.c; t.dying = true; lastT.v *= 2; lastT.merged = true; lastT.pop = 1; score += lastT.v; moved = true;
          } else {
            const [nr, nc] = cells[pos++];
            if (nr !== t.r || nc !== t.c) moved = true;
            t.r = nr; t.c = nc; lastT = t;
          }
        }
      }
      tiles.forEach((t) => { t.merged = false; });
      if (!moved) return;
      if (!moved0) { moved0 = true; hint.remove(); }
      anim = 0; U.set('s', score);
      setTimeout(() => { spawn(); if (!canMove()) end('Keine Züge mehr'); }, 115);
    }
    function end(why) {
      if (over) return; over = true; U.finish(null);
      setTimeout(() => { cleanup(); resolve(score); }, 1300); endMsg = why;
    }
    let endMsg = '';
    U.finish(() => end('Beendet'));
    // Eingabe
    const onKey = (e) => { const m = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 }[e.code]; if (m == null) return; e.preventDefault(); move(m); };
    document.addEventListener('keydown', onKey);
    let sw = null;
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); sw = [e.clientX, e.clientY, e.pointerId]; });
    const swEnd = (e) => {
      if (!sw || sw[2] !== e.pointerId) return; const dx = e.clientX - sw[0], dy = e.clientY - sw[1]; sw = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3));
    };
    C.cv.addEventListener('pointerup', swEnd); C.cv.addEventListener('pointercancel', () => { sw = null; });
    C.cv.addEventListener('pointermove', (e) => { if (sw && sw[2] === e.pointerId && Math.hypot(e.clientX - sw[0], e.clientY - sw[1]) > 60) swEnd(e); });
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      anim = Math.min(1, anim + dt / 0.11);
      if (anim >= 1) tiles = tiles.filter((q) => !q.dying);
      tiles.forEach((q) => { q.born = Math.min(1, q.born + dt / 0.16); q.pop = Math.max(0, q.pop - dt / 0.2); });
      if (LIMIT && !over && moved0) { left -= dt; if (left <= 0) { left = 0; end('Zeit ist um'); } }
      if (LIMIT) U.set('t', `${Math.floor(Math.ceil(left) / 60)}:${String(Math.ceil(left) % 60).padStart(2, '0')}`);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      const S = Math.floor(Math.min(C.cw, C.ch) - 32), cell = S / 4, X0 = (C.cw - S) / 2, Y0 = (C.ch - S) / 2;
      paper(x, C.cw, C.ch, dark, cell / 4, X0, Y0);
      x.strokeStyle = ink; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 3; prect(x, X0, Y0, S, S, 5, 1.4); x.stroke();
      x.lineWidth = 1.4; x.globalAlpha = 0.35;
      for (let k = 1; k < 4; k++) { pline(x, X0 + k * cell, Y0 + 6, X0 + k * cell, Y0 + S - 6, k + 10, 0.8); pline(x, X0 + 6, Y0 + k * cell, X0 + S - 6, Y0 + k * cell, k + 20, 0.8); }
      x.globalAlpha = 1;
      const e = 1 - Math.pow(1 - anim, 3);
      const list = [...tiles].sort((a, b) => (a.dying ? 0 : 1) - (b.dying ? 0 : 1));
      for (const q of list) {
        const r = q.pr + (q.r - q.pr) * e, c = q.pc + (q.c - q.pc) * e;
        const sc = (q.born < 1 ? 0.3 + 0.7 * q.born : 1) * (1 + Math.sin(q.pop * Math.PI) * 0.1);
        const pad = cell * 0.08, w = (cell - pad * 2) * sc, cx = X0 + (c + 0.5) * cell, cy = Y0 + (r + 0.5) * cell;
        const lv = Math.min(TCOL.length - 1, Math.log2(q.v) - 1), base = TCOL[lv];
        x.save(); x.translate(cx, cy); x.rotate(((q.seed % 7) - 3) * 0.006);
        x.fillStyle = dark ? shade(base, -0.45) : base; prect(x, -w / 2, -w / 2, w, w, q.seed, 1.2); x.fill();
        hatch(x, -w / 2, -w / 2, w, w, dark ? shade(base, 0.1) : shade(base, -0.25), 7, 0.45, 1.2);
        x.strokeStyle = ink; x.lineWidth = 2.2; prect(x, -w / 2, -w / 2, w, w, q.seed, 1.2); x.stroke();
        const s = String(q.v), fs = w * (s.length <= 2 ? 0.46 : s.length === 3 ? 0.38 : s.length === 4 ? 0.3 : 0.24);
        x.fillStyle = ink; x.font = `800 ${Math.round(fs)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, 0, w * 0.03, w * 0.86);
        x.restore();
      }
      if (over) overText(x, C.cw, C.ch, dark, endMsg);
      raf = requestAnimationFrame(frame);
    }
    spawn(); spawn(); U.set('s', 0);
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Klötzchenregen
// ======================================================================
const BW = 10, BH = 20;
const SHAPES = { I: ['0000', '1111', '0000', '0000'], O: ['11', '11'], T: ['010', '111', '000'], S: ['011', '110', '000'], Z: ['110', '011', '000'], J: ['100', '111', '000'], L: ['001', '111', '000'] };
const PCOL = { I: '#3fb6d9', O: '#f2c230', T: '#a46bff', S: '#2fbf71', Z: '#ff6b5a', J: '#4f7cff', L: '#ff9a3c' };
const mat = (k) => SHAPES[k].map((r) => [...r].map(Number));
const rotCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const rotCCW = (m) => rotCW(rotCW(rotCW(m)));
function blocks(fx, p, o) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const best = store.get('gBlocksBest', 0);
    const U = frameUI(fx, p, { stats: [['s', 'Punkte'], ['l', 'Reihen'], ['v', 'Stufe'], ['b', o.beat != null ? 'Zu schlagen' : 'Rekord']] });
    U.set('b', o.beat != null ? o.beat : best || '–'); U.set('v', 1);
    U.area.classList.add('blkarea');
    const mk = (ic, lab) => h('button.blkbtn', { 'aria-label': lab, title: lab }, icon(ic), h('span', { text: lab }));
    const bL = mk('left', 'Links'), bR = mk('right', 'Rechts'), bRot = mk('rotate', 'Drehen'), bDown = mk('down', 'Schneller'), bDrop = mk('drop', 'Fallen');
    const nextCv = h('canvas.blknext');
    const padL = h('div.blkpad.l', null, bL, bR);
    const padR = h('div.blkpad.r', null, h('div.blknextbox', null, h('small', { text: 'Als Nächstes' }), nextCv), bRot, bDown, bDrop);
    const boardHost = h('div.blkboard');
    U.area.append(padL, boardHost, padR);
    const C = canvasBox(boardHost), x = C.x;
    const nx = nextCv.getContext('2d');
    const board = Array.from({ length: BH }, () => Array(BW).fill(null));
    let bag = [], cur = null, next = null, acc = 0, lockT = 0, lockN = 0, score = 0, lines = 0, level = 1, soft = false, over = false, clearing = null, raf = 0, last = 0, count = 1.6;
    const R = rng((Math.random() * 1e9) | 0);
    const take = () => { if (!bag.length) { bag = Object.keys(SHAPES); for (let i = bag.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); };
    const hit = (m, px, py) => m.some((row, r) => row.some((v, c) => v && (px + c < 0 || px + c >= BW || py + r >= BH || (py + r >= 0 && board[py + r][px + c]))));
    function spawnPiece() {
      const k = next || take(); next = take();
      const m = mat(k);
      cur = { k, m, x: ((BW - m.length) / 2) | 0, y: k === 'I' ? -1 : 0 };
      lockT = 0; lockN = 0; drawNext();
      if (hit(cur.m, cur.x, cur.y)) end('Kein Platz mehr');
    }
    const speed = () => Math.max(0.06, 0.8 * Math.pow(0.84, level - 1));
    function shift(dx) { if (!cur || over || clearing) return false; if (!hit(cur.m, cur.x + dx, cur.y)) { cur.x += dx; touchLock(); return true; } return false; }
    function rotate(cw = true) {
      if (!cur || over || clearing || cur.k === 'O') return;
      const m = cw ? rotCW(cur.m) : rotCCW(cur.m);
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) if (!hit(m, cur.x + dx, cur.y + dy)) { cur.m = m; cur.x += dx; cur.y += dy; touchLock(); return; }
    }
    function touchLock() { if (lockT > 0 && lockN < 15) { lockT = 0; lockN++; } }
    const ghostY = () => { let y = cur.y; while (!hit(cur.m, cur.x, y + 1)) y++; return y; };
    function hardDrop() { if (!cur || over || clearing || count > 0) return; const y = ghostY(); score += (y - cur.y) * 2; cur.y = y; lock(); }
    function lock() {
      cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0) board[cur.y + r][cur.x + c] = { k: cur.k, s: (R() * 1e6) | 0 }; }));
      const out = cur.m.some((row, r) => row.some((v) => v && cur.y + r < 0));
      cur = null;
      const full = []; for (let r = 0; r < BH; r++) if (board[r].every(Boolean)) full.push(r);
      if (full.length) { clearing = { rows: full, t: 0 }; score += [0, 100, 300, 500, 800][full.length] * level; lines += full.length; level = 1 + Math.floor(lines / 10); }
      else if (out) return end('Kein Platz mehr');
      else spawnPiece();
      upd();
    }
    function upd() { U.set('s', score); U.set('l', lines); U.set('v', level); }
    let endMsg = '';
    function end(why) { if (over) return; over = true; endMsg = why; U.finish(null); setTimeout(() => { cleanup(); resolve(score); }, 1300); }
    U.finish(() => end('Beendet'));

    // Knöpfe mit Wiederholung beim Gedrückthalten
    const rep = (btn, fn, first = 170, every = 55) => {
      let t1 = 0, t2 = 0;
      const stop = () => { clearTimeout(t1); clearInterval(t2); btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (count > 0) return; btn.classList.add('on'); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, every); }, first); });
      btn.addEventListener('pointerup', stop); btn.addEventListener('pointercancel', stop); btn.addEventListener('pointerleave', stop);
      return stop;
    };
    const stops = [rep(bL, () => shift(-1)), rep(bR, () => shift(1))];
    bRot.addEventListener('pointerdown', (e) => { e.preventDefault(); if (count <= 0) rotate(); });
    bDrop.addEventListener('pointerdown', (e) => { e.preventDefault(); hardDrop(); });
    bDown.addEventListener('pointerdown', (e) => { e.preventDefault(); soft = true; bDown.classList.add('on'); });
    const softOff = () => { soft = false; bDown.classList.remove('on'); };
    bDown.addEventListener('pointerup', softOff); bDown.addEventListener('pointercancel', softOff); bDown.addEventListener('pointerleave', softOff);
    // Gesten auf dem Spielfeld: tippen = drehen, ziehen = schieben, schnell nach unten wischen = fallen lassen
    let g = null, cellPx = 20;
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, sx: e.clientX, t: performance.now(), far: false }; });
    C.cv.addEventListener('pointermove', (e) => {
      if (!g || g.id !== e.pointerId || count > 0) return;
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 12) g.far = true;
      while (e.clientX - g.sx > cellPx) { shift(1); g.sx += cellPx; }
      while (g.sx - e.clientX > cellPx) { shift(-1); g.sx -= cellPx; }
    });
    C.cv.addEventListener('pointerup', (e) => {
      if (!g || g.id !== e.pointerId) return;
      const dt = performance.now() - g.t, dy = e.clientY - g.y0, dx = e.clientX - g.x0;
      if (!g.far && dt < 300 && count <= 0) rotate();
      else if (dy > 70 && dy > Math.abs(dx) * 1.5 && dt < 350) hardDrop();
      g = null;
    });
    const onKey = (e) => {
      const k = e.code;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyX', 'KeyZ', 'KeyA', 'KeyD', 'KeyS', 'KeyW'].includes(k)) return;
      e.preventDefault(); if (count > 0) return;
      if (e.type === 'keyup') { if (k === 'ArrowDown' || k === 'KeyS') soft = false; return; }
      if (k === 'ArrowLeft' || k === 'KeyA') shift(-1); else if (k === 'ArrowRight' || k === 'KeyD') shift(1);
      else if (k === 'ArrowDown' || k === 'KeyS') soft = true; else if (k === 'Space') { if (!e.repeat) hardDrop(); }
      else if (k === 'KeyZ') { if (!e.repeat) rotate(false); } else if (!e.repeat) rotate();
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); stops.forEach((s) => s()); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    function cellDraw(xx, X, Y, s, k, seed, ghost = false) {
      const c = PCOL[k], pad = Math.max(1, s * 0.06);
      if (ghost) { xx.save(); xx.strokeStyle = c; xx.globalAlpha = 0.7; xx.lineWidth = 1.6; xx.setLineDash([4, 3]); prect(xx, X + pad, Y + pad, s - pad * 2, s - pad * 2, seed, 0.6); xx.stroke(); xx.restore(); return; }
      xx.fillStyle = dark ? shade(c, -0.35) : shade(c, 0.55); prect(xx, X + pad, Y + pad, s - pad * 2, s - pad * 2, seed, 0.7); xx.fill();
      hatch(xx, X + pad, Y + pad, s - pad * 2, s - pad * 2, c, Math.max(3, s / 5), 0.95, Math.max(1, s / 14));
      xx.strokeStyle = ink; xx.lineWidth = Math.max(1.2, s / 14); prect(xx, X + pad, Y + pad, s - pad * 2, s - pad * 2, seed, 0.7); xx.stroke();
    }
    function drawNext() {
      const r = nextCv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      nextCv.width = Math.max(1, Math.round(r.width * d)); nextCv.height = Math.max(1, Math.round(r.height * d));
      nx.setTransform(d, 0, 0, d, 0, 0); nx.clearRect(0, 0, r.width, r.height);
      if (!next) return;
      const m = mat(next).filter((row) => row.some(Boolean)), cols = m[0].length, s = Math.min(22, (r.width - 8) / 4, (r.height - 8) / 2);
      const ox = (r.width - cols * s) / 2, oy = (r.height - m.length * s) / 2;
      m.forEach((row, rr) => row.forEach((v, cc) => { if (v) cellDraw(nx, ox + cc * s, oy + rr * s, s, next, rr * 7 + cc); }));
    }
    new ResizeObserver(drawNext).observe(nextCv);

    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      if (count > 0) { count -= dt; }
      else if (!over) {
        if (clearing) {
          clearing.t += dt;
          if (clearing.t > 0.22) { for (const r of clearing.rows) { board.splice(r, 1); board.unshift(Array(BW).fill(null)); } clearing = null; spawnPiece(); }
        } else if (cur) {
          acc += dt * (soft ? 18 : 1);
          const sp = speed();
          while (acc >= sp && cur) {
            acc -= sp;
            if (!hit(cur.m, cur.x, cur.y + 1)) { cur.y++; lockT = 0; if (soft) { score++; upd(); } }
            else break;
          }
          if (cur && hit(cur.m, cur.x, cur.y + 1)) { lockT += dt; if (lockT > 0.45) { acc = 0; lock(); } }
        }
      }
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      const s = Math.floor(Math.min((C.cw - 12) / BW, (C.ch - 12) / BH)); cellPx = s;
      const X0 = Math.round((C.cw - BW * s) / 2), Y0 = Math.round((C.ch - BH * s) / 2);
      paper(x, C.cw, C.ch, dark, s, X0, Y0);
      x.fillStyle = dark ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.6)'; x.fillRect(X0, Y0, BW * s, BH * s);
      x.strokeStyle = ink; x.lineWidth = 3; x.lineCap = 'round'; prect(x, X0 - 2, Y0 - 2, BW * s + 4, BH * s + 4, 3, 1.2); x.stroke();
      for (let r = 0; r < BH; r++) for (let c = 0; c < BW; c++) {
        const q = board[r][c]; if (!q) continue;
        if (clearing && clearing.rows.includes(r)) { x.save(); x.globalAlpha = Math.max(0, 1 - clearing.t / 0.22); cellDraw(x, X0 + c * s, Y0 + r * s, s, q.k, q.s); x.restore(); }
        else cellDraw(x, X0 + c * s, Y0 + r * s, s, q.k, q.s);
      }
      if (clearing) { x.save(); x.strokeStyle = ink; x.lineWidth = 3; clearing.rows.forEach((r, i) => { const w = BW * s * Math.min(1, clearing.t / 0.15); pline(x, X0, Y0 + (r + 0.5) * s, X0 + w, Y0 + (r + 0.5) * s, 70 + i, 1.5); }); x.restore(); }
      if (cur && !over) {
        const gy = ghostY();
        cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && gy + r >= 0) cellDraw(x, X0 + (cur.x + c) * s, Y0 + (gy + r) * s, s, cur.k, r * 4 + c, true); }));
        cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0) cellDraw(x, X0 + (cur.x + c) * s, Y0 + (cur.y + r) * s, s, cur.k, r * 4 + c + 1); }));
      }
      if (count > 0) overText(x, C.cw, C.ch, dark, String(Math.ceil(count / 0.55)));
      else if (over) overText(x, C.cw, C.ch, dark, endMsg);
      raf = requestAnimationFrame(frame);
    }
    spawnPiece(); upd();
    raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Blockknacker
// ======================================================================
const KW = 600, KH = 800, PY = 735, RB = 9;
const ROWC = ['#ff6b5a', '#ff9a3c', '#f2c230', '#2fbf71', '#3fb6d9', '#4f7cff', '#a46bff'];
function layoutBricks(lv, R) {
  const list = [], cols = 10, bw = 54, bh = 24, x0 = (KW - cols * 56) / 2 + 1, y0 = 90;
  const kind = (lv - 1) % 4;
  for (let r = 0; r < 7; r++) for (let c = 0; c < cols; c++) {
    let on = r < 6, hp = 1;
    if (kind === 1) on = r < 7 && Math.abs(c - 4.5) <= r + 0.5;
    if (kind === 2) { on = (r + c) % 2 === 0 || r === 0; hp = r < 2 ? 2 : 1; }
    if (kind === 3) { on = R() < 0.7; hp = R() < 0.25 ? 2 : 1; }
    if (lv > 4 && R() < 0.15) hp = 2;
    if (on) list.push({ x: x0 + c * 56, y: y0 + r * 30, w: bw, h: bh, hp, max: hp, col: ROWC[r % ROWC.length], seed: (R() * 1e6) | 0 });
  }
  return list;
}
function breaker(fx, p, o) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const best = store.get('gBrickBest', 0);
    const U = frameUI(fx, p, { stats: [['s', 'Punkte'], ['l', 'Leben'], ['v', 'Stufe'], ['b', o.beat != null ? 'Zu schlagen' : 'Rekord']] });
    U.set('b', o.beat != null ? o.beat : best || '–');
    const C = canvasBox(U.area), x = C.x;
    const hint = h('p.hshint', { text: 'Finger ziehen bewegt das Lineal. Tippen startet den Ball. Am PC: Pfeiltasten und Leertaste.' }); U.hud.after(hint);
    const R = rng((Math.random() * 1e9) | 0);
    let level = 1, lives = 3, score = 0, bricks = layoutBricks(1, R), padX = KW / 2, padW = 120, wideT = 0, stuck = true, over = false, endMsg = '', raf = 0, last = 0, msg = 'Stufe 1', msgT = 1.4;
    const ball = { x: KW / 2, y: PY - RB, vx: 0, vy: 0, spd: 430 };
    let drops = [], bits = [];
    let U2 = 1, ox = 0, oy = 0;
    const upd = () => { U.set('s', score); U.set('l', '♥'.repeat(Math.max(0, lives)) || '0'); U.set('v', level); };
    function launch() {
      if (!stuck || over) return; stuck = false; hint.remove();
      const a = -Math.PI / 2 + (R() - 0.5) * 0.7; ball.vx = Math.cos(a) * ball.spd; ball.vy = Math.sin(a) * ball.spd;
    }
    function end(why) { if (over) return; over = true; endMsg = why; U.finish(null); setTimeout(() => { cleanup(); resolve(score); }, 1300); }
    U.finish(() => end('Beendet'));
    const toX = (cx) => { const r = C.cv.getBoundingClientRect(); return (cx - r.left - ox) / U2; };
    let pid = null, downAt = 0;
    C.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; downAt = performance.now(); padX = toX(e.clientX); try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    C.cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && pid == null) return; if (pid != null && e.pointerId !== pid) return; padX = toX(e.clientX); });
    C.cv.addEventListener('pointerup', (e) => { if (e.pointerId === pid) { pid = null; if (performance.now() - downAt < 350) launch(); } });
    const keys = new Set();
    const onKey = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD'].includes(e.code)) return; e.preventDefault();
      if (e.type === 'keydown') { keys.add(e.code); if (e.code === 'Space') launch(); } else keys.delete(e.code);
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    function resetBall() { stuck = true; ball.spd = Math.min(700, 430 + (level - 1) * 30); ball.x = padX; ball.y = PY - RB; ball.vx = ball.vy = 0; }
    function hitBrick(b) {
      b.hp--; ball.spd = Math.min(760, ball.spd + 5);
      for (let k = 0; k < 5; k++) bits.push({ x: b.x + R() * b.w, y: b.y + R() * b.h, vx: (R() - 0.5) * 160, vy: -R() * 120, t: 0, c: b.col });
      if (b.hp <= 0) {
        score += 10 + level * 5;
        if (R() < 0.12) drops.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, k: R() < 0.2 ? 'heart' : 'star' });
      } else score += 5;
      upd();
    }
    function step(dt) {
      const kd = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      padX += kd * 720 * dt;
      wideT = Math.max(0, wideT - dt); padW += ((wideT > 0 ? 190 : 120) - padW) * Math.min(1, dt * 8);
      padX = Math.max(padW / 2, Math.min(KW - padW / 2, padX));
      if (stuck) { ball.x = padX; ball.y = PY - RB; }
      else {
        const sp = Math.hypot(ball.vx, ball.vy) || 1; ball.vx *= ball.spd / sp; ball.vy *= ball.spd / sp;
        const n = Math.max(1, Math.ceil(ball.spd * dt / 5)), d = dt / n;
        for (let s = 0; s < n; s++) {
          ball.x += ball.vx * d; ball.y += ball.vy * d;
          if (ball.x < RB) { ball.x = RB; ball.vx = Math.abs(ball.vx); }
          if (ball.x > KW - RB) { ball.x = KW - RB; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < RB) { ball.y = RB; ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y + RB >= PY && ball.y - RB <= PY + 18 && Math.abs(ball.x - padX) <= padW / 2 + RB) {
            const off = Math.max(-1, Math.min(1, (ball.x - padX) / (padW / 2))), a = -Math.PI / 2 + off * 1.05;
            ball.vx = Math.cos(a) * ball.spd; ball.vy = Math.sin(a) * ball.spd; ball.y = PY - RB;
          }
          for (const b of bricks) {
            if (b.hp <= 0) continue;
            const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w)), cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
            if ((ball.x - cx) ** 2 + (ball.y - cy) ** 2 > RB * RB) continue;
            const px = Math.min(ball.x + RB - b.x, b.x + b.w - (ball.x - RB)), py = Math.min(ball.y + RB - b.y, b.y + b.h - (ball.y - RB));
            if (px < py) { ball.vx = ball.x < b.x + b.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx); }
            else { ball.vy = ball.y < b.y + b.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy); }
            hitBrick(b); break;
          }
          if (Math.abs(ball.vy) < ball.spd * 0.18) ball.vy = Math.sign(ball.vy || -1) * ball.spd * 0.18;   // nie ganz waagerecht
          if (ball.y - RB > KH) {
            lives--; upd();
            if (lives <= 0) return end('Keine Leben mehr');
            msg = 'Ball weg!'; msgT = 1; resetBall(); return;
          }
        }
      }
      bricks = bricks.filter((b) => b.hp > 0);
      if (!bricks.length) { level++; score += 100; upd(); bricks = layoutBricks(level, R); msg = `Stufe ${level}`; msgT = 1.4; drops = []; resetBall(); }
      drops.forEach((q) => { q.y += 170 * dt; if (q.y > PY - 8 && q.y < PY + 20 && Math.abs(q.x - padX) < padW / 2 + 10) { q.got = true; if (q.k === 'star') { wideT = 12; msg = 'Langes Lineal!'; } else { lives = Math.min(5, lives + 1); msg = 'Extra-Leben!'; upd(); } msgT = 1; } });
      drops = drops.filter((q) => !q.got && q.y < KH + 20);
      bits.forEach((q) => { q.t += dt; q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }); bits = bits.filter((q) => q.t < 0.7);
    }
    function drawRuler() {
      const X = padX - padW / 2, w = padW;
      x.fillStyle = dark ? 'rgba(240,220,150,.35)' : 'rgba(250,228,150,.85)'; prect(x, X, PY, w, 18, 9, 0.6); x.fill();
      x.strokeStyle = ink; x.lineWidth = 2; prect(x, X, PY, w, 18, 9, 0.6); x.stroke();
      x.lineWidth = 1; x.beginPath(); for (let k = 6; k < w - 3; k += 6) { const l = (k / 6) % 5 === 0 ? 9 : 5; x.moveTo(X + k, PY + 1); x.lineTo(X + k, PY + 1 + l); } x.stroke();
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (t - last) / 1000 : 0); last = t;
      if (!over) step(dt);
      msgT = Math.max(0, msgT - dt);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      U2 = Math.min((C.cw - 16) / KW, (C.ch - 16) / KH); ox = (C.cw - KW * U2) / 2; oy = (C.ch - KH * U2) / 2;
      paper(x, C.cw, C.ch, dark, 24 * U2, ox, oy);
      x.setTransform(C.dpr * U2, 0, 0, C.dpr * U2, C.dpr * ox, C.dpr * oy);
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = ink; x.lineWidth = 3; pline(x, 0, 0, KW, 0, 1); pline(x, 0, 0, 0, KH, 2); pline(x, KW, 0, KW, KH, 3);
      x.globalAlpha = 0.35; x.setLineDash([10, 10]); pline(x, 0, KH, KW, KH, 4, 0.5); x.setLineDash([]); x.globalAlpha = 1;
      for (const b of bricks) {
        x.fillStyle = dark ? shade(b.col, -0.4) : shade(b.col, 0.6); prect(x, b.x, b.y, b.w, b.h, b.seed, 0.8); x.fill();
        hatch(x, b.x, b.y, b.w, b.h, b.col, b.hp > 1 ? 3.5 : 6, 0.9, 1.4);
        x.strokeStyle = ink; x.lineWidth = 2; prect(x, b.x, b.y, b.w, b.h, b.seed, 0.8); x.stroke();
        if (b.max > 1) { x.lineWidth = 1.2; prect(x, b.x + 4, b.y + 4, b.w - 8, b.h - 8, b.seed + 1, 0.6); x.stroke(); }
        if (b.max > 1 && b.hp === 1) { x.lineWidth = 1.6; pline(x, b.x + 10, b.y + 3, b.x + 22, b.y + b.h - 3, b.seed + 2, 0.8); pline(x, b.x + 22, b.y + b.h - 3, b.x + 30, b.y + 6, b.seed + 3, 0.8); }
      }
      bits.forEach((q) => { x.globalAlpha = 1 - q.t / 0.7; x.fillStyle = q.c; x.fillRect(q.x - 2, q.y - 2, 4, 4); }); x.globalAlpha = 1;
      for (const q of drops) {
        x.save(); x.translate(q.x, q.y); x.strokeStyle = ink; x.lineWidth = 2;
        if (q.k === 'star') { x.fillStyle = '#f2c230'; x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 6 : 14; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke(); }
        else { x.fillStyle = '#ff6b8a'; x.beginPath(); x.moveTo(0, 12); x.bezierCurveTo(-18, -2, -8, -16, 0, -6); x.bezierCurveTo(8, -16, 18, -2, 0, 12); x.fill(); x.stroke(); }
        x.restore();
      }
      drawRuler();
      x.fillStyle = dark ? '#f4f1e6' : '#fff'; pcirc(x, ball.x, ball.y, RB, 3, 0.12); x.fill(); x.strokeStyle = ink; x.lineWidth = 2.2; x.stroke();
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (over) overText(x, C.cw, C.ch, dark, endMsg);
      else if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); overText(x, C.cw, C.ch, dark, msg); x.restore(); }
      raf = requestAnimationFrame(frame);
    }
    upd(); resetBall();
    raf = requestAnimationFrame(frame);
  });
}

export const doublerGame = (fx, A, B) => seq(fx, A, B, doubler, 'double', 'Gleiche Zahlen zusammenschieben, 3 Minuten Zeit.');
export const blocksGame = (fx, A, B) => seq(fx, A, B, blocks, 'blocks', 'Klötzchen stapeln, volle Reihen verschwinden.');
export const breakerGame = (fx, A, B) => seq(fx, A, B, breaker, 'brick', 'Mit dem Ball alle Kästchen wegknacken, 3 Leben.');
