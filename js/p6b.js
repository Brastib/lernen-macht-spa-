// Brettspiele, Paket 6 (Teil 2): Dame (mit Schlagpflicht, fliegenden Damen) und Mühle (setzen, ziehen, springen).
// Beide zu zweit oder gegen den Computer. Alles auf Karopapier mit Bleistift-Strichen.
import { h } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, pcirc, hatch, shade, canvasBox } from './sketch.js';
import { banner, fit, toWorld } from './p6a.js';

// ---------- gemeinsame Teile ----------
function boardUI(fx) {
  const sc = h('div.hsstats'), hint = h('p.hshint.bdhint'), host = h('div.hsarea');
  fx.stage.append(h('div.hswrap', null, h('div.hshud', null, sc), hint, host));
  return { sc, hint, C: canvasBox(host) };
}
const stat = (p, on, txt) => h('span.hsstat.rcstat' + (on ? '.on' : ''), { style: { '--pc': p.color } }, h('small', { text: p.name }), h('b', { text: txt }));
// Spielstein: farbige Scheibe mit Schraffur und Bleistiftrand
function stone(x, cx, cy, r, color, ink, dark, seed, alpha = 1) {
  x.save(); x.globalAlpha *= alpha;
  x.fillStyle = 'rgba(0,0,0,.16)'; x.beginPath(); x.ellipse(cx + 2, cy + 4, r, r * 0.9, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = dark ? shade(color, -0.25) : shade(color, 0.45); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip(); hatch(x, cx - r, cy - r, r * 2, r * 2, color, 5, 0.95, 1.6); x.restore();
  x.strokeStyle = ink; x.lineWidth = 2.4; pcirc(x, cx, cy, r, seed, 0.05); x.stroke();
  x.lineWidth = 1.2; x.globalAlpha *= 0.55; pcirc(x, cx, cy, r * 0.62, seed + 3, 0.08); x.stroke();
  x.restore();
}
function crown(x, cx, cy, s, ink) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.fillStyle = '#f2c230'; x.strokeStyle = ink; x.lineWidth = 2 / s * 1.1; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(-14, 8); x.lineTo(-16, -8); x.lineTo(-7, 0); x.lineTo(0, -12); x.lineTo(7, 0); x.lineTo(16, -8); x.lineTo(14, 8); x.closePath(); x.fill(); x.stroke();
  x.restore();
}
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ======================================================================
// Dame
// ======================================================================
const rc = (i) => [i >> 3, i & 7];
const ix = (r, c) => r * 8 + c;
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const own = (v, p) => (p === 0 ? v > 0 : v < 0);   // Spieler 0 = positive Steine (unten), Spieler 1 = negative (oben)
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
function dameInit() {
  const b = new Int8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[ix(r, c)] = -1; else if (r > 4) b[ix(r, c)] = 1; }
  return b;
}
// Schlagfolgen per Tiefensuche (geschlagene Steine bleiben bis zum Ende liegen und blockieren)
function capSeq(b, from, p, king, cur, path, taken, out) {
  const [r, c] = rc(cur); let found = false;
  for (const [dr, dc] of DIRS) {
    if (king) {
      let rr = r + dr, cc = c + dc;
      while (inb(rr, cc) && b[ix(rr, cc)] === 0) { rr += dr; cc += dc; }
      if (!inb(rr, cc)) continue;
      const q = ix(rr, cc); if (!b[q] || own(b[q], p) || taken.includes(q)) continue;
      let lr = rr + dr, lc = cc + dc;
      while (inb(lr, lc) && b[ix(lr, lc)] === 0) {
        found = true; const l = ix(lr, lc), t2 = [...taken, q];
        if (!capSeq(b, from, p, king, l, [...path, l], t2, out)) out.push({ from, path: [...path, l], caps: t2 });
        lr += dr; lc += dc;
      }
    } else {
      const lr = r + 2 * dr, lc = c + 2 * dc; if (!inb(lr, lc)) continue;
      const q = ix(r + dr, c + dc), l = ix(lr, lc);
      if (!b[q] || own(b[q], p) || taken.includes(q) || b[l] !== 0) continue;
      found = true; const t2 = [...taken, q];
      if (!capSeq(b, from, p, king, l, [...path, l], t2, out)) out.push({ from, path: [...path, l], caps: t2 });
    }
  }
  return found;
}
function dameMoves(b, p) {
  const caps = [], quiet = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v || !own(v, p)) continue;
    const king = Math.abs(v) === 2;
    b[i] = 0; capSeq(b, i, p, king, i, [], [], caps); b[i] = v;
    if (caps.length) continue;
    const [r, c] = rc(i);
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== (p === 0 ? -1 : 1)) continue;
      let rr = r + dr, cc = c + dc;
      while (inb(rr, cc) && b[ix(rr, cc)] === 0) { quiet.push({ from: i, path: [ix(rr, cc)], caps: [] }); if (!king) break; rr += dr; cc += dc; }
    }
  }
  return caps.length ? caps : quiet;
}
function dameApply(b, m) {
  const nb = b.slice(), v = nb[m.from], to = m.path[m.path.length - 1], r = to >> 3;
  nb[m.from] = 0; m.caps.forEach((q) => { nb[q] = 0; });
  nb[to] = v === 1 && r === 0 ? 2 : v === -1 && r === 7 ? -2 : v;
  return nb;
}
function dameEval(b, p) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue; const [r, c] = rc(i);
    const val = Math.abs(v) === 2 ? 330 : 100 + (v > 0 ? 7 - r : r) * 5 + (c > 1 && c < 6 ? 4 : 0) + ((v > 0 && r === 7) || (v < 0 && r === 0) ? 6 : 0);
    s += own(v, p) ? val : -val;
  }
  return s;
}
function dameAB(b, p, d, al, be) {
  const ms = dameMoves(b, p); if (!ms.length) return -100000 - d;
  if (d <= 0 && !ms[0].caps.length) return dameEval(b, p);
  if (d <= -3) return dameEval(b, p);
  let best = -Infinity;
  for (const m of ms) { const v = -dameAB(dameApply(b, m), 1 - p, d - 1, -be, -al); if (v > best) best = v; if (v > al) al = v; if (al >= be) break; }
  return best;
}
function dameCpu(b, p) {
  const ms = dameMoves(b, p); let best = ms[0], bv = -Infinity;
  for (const m of ms) { const v = -dameAB(dameApply(b, m), 1 - p, 5, -Infinity, Infinity) + Math.random() * 10; if (v > bv) { bv = v; best = m; } }
  return best;
}

export function dame(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = o.cpu ? 1 : -1, P = [A, B], dark = isDark(), ink = inkOf(dark);
    const CELL = 80, M = 22, WW = CELL * 8 + M * 2;
    let b = dameInit(), turn = 0, sel = -1, moves = dameMoves(b, 0), anim = null, over = false, last = null, quiet = 0, raf = 0, msg = '', msgT = 0, fade = [], g = null;
    const { sc, hint, C } = boardUI(fx), x = C.x;
    const cnt = (p) => { let n = 0, k = 0; for (const v of b) if (v && own(v, p)) { n++; if (Math.abs(v) === 2) k++; } return [n, k]; };
    const upd = () => {
      sc.replaceChildren(...P.map((p, i) => { const [n, k] = cnt(i); return stat(p, i === turn && !over, `${n} ${n === 1 ? 'Stein' : 'Steine'}${k ? ` · ${k} ${k === 1 ? 'Dame' : 'Damen'}` : ''}`); }));
      if (!over) hint.textContent = turn === cpu ? 'Computer überlegt …' : `${P[turn].name} ist dran (${turn ? 'oben' : 'unten'}). ` + (moves[0] && moves[0].caps.length ? 'Schlagpflicht: du musst schlagen!' : 'Tippe einen Stein an, dann ein Feld.');
    };
    const cxy = (i) => { const [r, c] = rc(i); return [M + c * CELL + CELL / 2, M + r * CELL + CELL / 2]; };
    const cleanup = () => cancelAnimationFrame(raf);
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function finish(w, detail) { over = true; upd(); hint.textContent = detail; msg = w == null ? 'Unentschieden' : `${P[w].name} gewinnt!`; msgT = 9; setTimeout(() => { cleanup(); resolve({ w, detail }); }, 1700); }
    function doMove(m) {
      sel = -1; anim = { m, v: b[m.from], t: 0, pts: [m.from, ...m.path] };
    }
    function endMove() {
      const m = anim.m, wasMan = Math.abs(anim.v) === 1; anim = null;
      m.caps.forEach((q) => fade.push({ q, v: b[q], t: 0 }));
      const before = b[m.from]; b = dameApply(b, m); last = m;
      if (Math.abs(b[m.path[m.path.length - 1]]) === 2 && Math.abs(before) === 1) { msg = 'Dame!'; msgT = 1; }
      quiet = m.caps.length || wasMan ? 0 : quiet + 1;
      turn = 1 - turn; moves = dameMoves(b, turn); upd();
      if (!moves.length) return finish(1 - turn, cnt(turn)[0] ? `${P[turn].name} kann nicht mehr ziehen` : `Alle Steine von ${P[turn].name} geschlagen`);
      if (quiet >= 40) return finish(null, '40 Züge ohne Schlagen');
      if (turn === cpu) setTimeout(() => { if (!over && !fx.signal.aborted) doMove(dameCpu(b, turn)); }, 380);
    }
    C.cv.addEventListener('pointerdown', (e) => {
      if (anim || over || turn === cpu || !g) return; e.preventDefault();
      const [wx, wy] = toWorld(C, g, e), c = Math.floor((wx - M) / CELL), r = Math.floor((wy - M) / CELL);
      if (!inb(r, c)) { sel = -1; return; }
      const i = ix(r, c);
      if (b[i] && own(b[i], turn)) { sel = moves.some((m) => m.from === i) ? i : -1; if (sel < 0) { msg = moves[0].caps.length ? 'Ein anderer Stein muss schlagen' : 'Der kann nicht ziehen'; msgT = 1.1; } return; }
      if (sel >= 0) { const m = moves.find((mm) => mm.from === sel && mm.path[mm.path.length - 1] === i); if (m) doMove(m); else sel = -1; }
    });
    function frame(tm) {
      if (fx.signal.aborted) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, frame.l ? (tm - frame.l) / 1000 : 0); frame.l = tm; msgT = Math.max(0, msgT - dt);
      fade.forEach((f) => { f.t += dt * 2.5; }); fade = fade.filter((f) => f.t < 1);
      if (anim) { anim.t += dt / 0.2; if (anim.t >= anim.pts.length - 1) endMove(); }
      g = fit(C, WW, WW);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      // Brett
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) continue; const X = M + c * CELL, Y = M + r * CELL;
        x.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(40,40,60,.06)'; x.fillRect(X, Y, CELL, CELL);
        hatch(x, X, Y, CELL, CELL, dark ? '#8a93a8' : '#6b6f7a', 7, dark ? 0.35 : 0.45, 1.1);
      }
      x.strokeStyle = ink; x.lineWidth = 3; x.lineJoin = 'round'; x.beginPath(); x.rect(M, M, CELL * 8, CELL * 8); x.stroke();
      x.lineWidth = 1.2; x.globalAlpha = 0.5; x.beginPath(); x.rect(M - 6, M - 6, CELL * 8 + 12, CELL * 8 + 12); x.stroke(); x.globalAlpha = 1;
      // letzter Zug
      if (last && !anim) { x.strokeStyle = P[1 - turn].color; x.lineWidth = 3; x.setLineDash([4, 8]); x.globalAlpha = 0.8; x.beginPath(); [last.from, ...last.path].forEach((q, k) => { const [a, bb] = cxy(q); k ? x.lineTo(a, bb) : x.moveTo(a, bb); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
      // Wer kann ziehen? Bei Schlagpflicht pulsiert der Rand
      const mine = !over && !anim && turn !== cpu;
      if (mine && moves[0] && moves[0].caps.length) {
        const pulse = 0.5 + Math.sin(tm / 200) * 0.3;
        new Set(moves.map((m) => m.from)).forEach((q) => { const [a, bb] = cxy(q); x.strokeStyle = '#e0483e'; x.globalAlpha = pulse; x.lineWidth = 3; x.beginPath(); x.arc(a, bb, 35, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; });
      }
      // Steine
      for (let i = 0; i < 64; i++) {
        const v = b[i]; if (!v || (anim && i === anim.m.from)) continue;
        const [a, bb] = cxy(i), p = v > 0 ? 0 : 1, capt = anim && anim.m.caps.includes(i) && anim.t >= anim.m.caps.indexOf(i) + 1;
        stone(x, a, bb, 29, P[p].color, ink, dark, i + 1, capt ? 0.35 : 1);
        if (Math.abs(v) === 2) crown(x, a, bb - 1, 1, ink);
      }
      fade.forEach((f) => { const [a, bb] = cxy(f.q); stone(x, a, bb - f.t * 14, 29, P[f.v > 0 ? 0 : 1].color, ink, dark, f.q + 1, 0.35 * (1 - f.t)); });
      if (anim) {
        const k = Math.min(anim.pts.length - 2, Math.floor(anim.t)), t = ease(Math.min(1, anim.t - k));
        const [a0, b0] = cxy(anim.pts[k]), [a1, b1] = cxy(anim.pts[k + 1]), lift = Math.sin(t * Math.PI) * (anim.m.caps.length ? 16 : 6);
        stone(x, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t - lift, 29, P[anim.v > 0 ? 0 : 1].color, ink, dark, 99);
        if (Math.abs(anim.v) === 2) crown(x, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t - lift - 1, 1, ink);
      }
      // Auswahl und Ziele
      if (mine && sel >= 0) {
        const [a, bb] = cxy(sel); x.strokeStyle = P[turn].color; x.lineWidth = 4; x.beginPath(); x.arc(a, bb, 36, 0, Math.PI * 2); x.stroke();
        moves.filter((m) => m.from === sel).forEach((m) => {
          x.strokeStyle = P[turn].color; x.lineWidth = 2; x.globalAlpha = 0.45; x.setLineDash([3, 7]); x.beginPath(); [m.from, ...m.path].forEach((q, k) => { const [c1, c2] = cxy(q); k ? x.lineTo(c1, c2) : x.moveTo(c1, c2); }); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
          const [c1, c2] = cxy(m.path[m.path.length - 1]); x.fillStyle = P[turn].color; x.globalAlpha = 0.25; x.beginPath(); x.arc(c1, c2, 22, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; x.lineWidth = 2.5; x.strokeStyle = P[turn].color; pcirc(x, c1, c2, 22, m.path.length + c1, 0.1); x.stroke();
        });
      }
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg); x.restore(); }
    }
    upd(); raf = requestAnimationFrame(frame);
  });
}

// ======================================================================
// Mühle
// ======================================================================
const MP = [[0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]];
const MILLS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23], [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]];
const ADJ = Array.from({ length: 24 }, () => []);
for (const m of MILLS) for (let k = 0; k < 2; k++) { ADJ[m[k]].push(m[k + 1]); ADJ[m[k + 1]].push(m[k]); }
const ALL24 = [...Array(24).keys()];
const sg = (p) => (p ? -1 : 1);
const millAt = (b, i) => { const v = b[i]; return !!v && MILLS.some((m) => m.includes(i) && m.every((j) => b[j] === v)); };
const onBoard = (b, p) => { let n = 0; for (const v of b) if (v === sg(p)) n++; return n; };
const millCount = (st, p) => st.hand[p] + onBoard(st.b, p);
function removable(b, p) {   // Steine von p, die man wegnehmen darf
  const opp = ALL24.filter((i) => b[i] === sg(p)); const free = opp.filter((i) => !millAt(b, i));
  return free.length ? free : opp;
}
function millBases(st, p) {
  const b = st.b, s = sg(p), out = [];
  if (st.hand[p] > 0) { for (let i = 0; i < 24; i++) if (!b[i]) out.push([-1, i]); return out; }
  const fly = onBoard(b, p) <= 3;
  for (let i = 0; i < 24; i++) if (b[i] === s) for (const j of fly ? ALL24 : ADJ[i]) if (!b[j]) out.push([i, j]);
  return out;
}
function millMoves(st, p) {
  const b = st.b, s = sg(p), out = [];
  for (const [f, t] of millBases(st, p)) {
    if (f >= 0) b[f] = 0; b[t] = s;
    if (millAt(b, t)) { const rem = removable(b, 1 - p); if (rem.length) rem.forEach((r) => out.push({ f, t, r })); else out.push({ f, t, r: -1 }); } else out.push({ f, t, r: -1 });
    b[t] = 0; if (f >= 0) b[f] = s;
  }
  return out;
}
function millApply(st, m, p) {
  const b = st.b.slice(), hand = st.hand.slice();
  if (m.f >= 0) b[m.f] = 0; else hand[p]--;
  b[m.t] = sg(p); if (m.r >= 0) b[m.r] = 0;
  return { b, hand };
}
const millLost = (st, p) => (st.hand[p] === 0 && millCount(st, p) < 3) || !millBases(st, p).length;
function millEval(st, p) {
  const s = sg(p); let v = (millCount(st, p) - millCount(st, 1 - p)) * 100;
  for (const m of MILLS) {
    let a = 0, o = 0, e = 0; for (const j of m) { const q = st.b[j]; if (q === s) a++; else if (q === -s) o++; else e++; }
    if (a === 2 && e === 1) v += 14; if (o === 2 && e === 1) v -= 16; if (a === 3) v += 5; if (o === 3) v -= 5;
  }
  if (st.hand[p] === 0 && st.hand[1 - p] === 0) v += (millBases(st, p).length - millBases(st, 1 - p).length) * 2;
  return v;
}
function millAB(st, p, d, al, be) {
  if (millLost(st, p)) return -10000 - d;
  if (d <= 0) return millEval(st, p);
  let best = -Infinity;
  for (const m of millMoves(st, p)) { const v = -millAB(millApply(st, m, p), 1 - p, d - 1, -be, -al); if (v > best) best = v; if (v > al) al = v; if (al >= be) break; }
  return best;
}
function millCpu(st, p) {
  const ms = millMoves(st, p), fly = (st.hand[0] === 0 && onBoard(st.b, 0) <= 3) || (st.hand[1] === 0 && onBoard(st.b, 1) <= 3);
  const d = fly ? 1 : ms.length > 40 ? 2 : 3;
  let best = ms[0], bv = -Infinity;
  for (const m of ms) { const v = -millAB(millApply(st, m, p), 1 - p, d, -Infinity, Infinity) + Math.random() * 8; if (v > bv) { bv = v; best = m; } }
  return best;
}

export function muehle(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const cpu = o.cpu ? 1 : -1, P = [A, B], dark = isDark(), ink = inkOf(dark);
    const GAP = 92, M = 46, SIDE = 44, WW = GAP * 6 + M * 2, WX = WW + SIDE * 2;
    let st = { b: new Int8Array(24), hand: [9, 9] }, turn = 0, sel = -1, pend = null, anim = null, over = false, raf = 0, msg = '', msgT = 0, quiet = 0, flash = null, fade = [], g = null;
    const { sc, hint, C } = boardUI(fx), x = C.x;
    const pxy = (i) => [SIDE + M + MP[i][0] * GAP, M + MP[i][1] * GAP];
    const phaseTxt = (p) => (st.hand[p] > 0 ? 'setzen' : onBoard(st.b, p) <= 3 ? 'springen' : 'ziehen');
    const upd = () => {
      sc.replaceChildren(...P.map((p, i) => stat(p, i === turn && !over, st.hand[i] > 0 ? `${st.hand[i]} in der Hand · ${onBoard(st.b, i)} liegen` : `${onBoard(st.b, i)} ${onBoard(st.b, i) === 1 ? 'Stein' : 'Steine'}`)));
      if (over) return;
      if (turn === cpu) hint.textContent = 'Computer überlegt …';
      else if (pend) hint.textContent = `Mühle! ${P[turn].name}, tippe einen Stein von ${P[1 - turn].name} an, der weg soll.`;
      else hint.textContent = `${P[turn].name}: Stein ${phaseTxt(turn)}. ` + (st.hand[turn] > 0 ? 'Tippe auf einen freien Punkt.' : phaseTxt(turn) === 'springen' ? 'Nur noch 3 Steine: du darfst überall hinspringen.' : 'Tippe deinen Stein an, dann einen Nachbarpunkt.');
    };
    const cleanup = () => cancelAnimationFrame(raf);
    fx.signal.addEventListener('abort', () => { cleanup(); resolve(null); }, { once: true });
    function finish(w, detail) { over = true; upd(); hint.textContent = detail; msg = w == null ? 'Unentschieden' : `${P[w].name} gewinnt!`; msgT = 9; setTimeout(() => { cleanup(); resolve({ w, detail }); }, 1700); }
    function commit(m) {
      sel = -1; pend = null;
      anim = { m, p: turn, t: 0 };
    }
    function endMove() {
      const { m, p } = anim; anim = null;
      if (m.r >= 0) fade.push({ q: m.r, p: 1 - p, t: 0 });
      st = millApply(st, m, p);
      if (m.r >= 0 || (m.f < 0)) quiet = 0; else quiet++;
      if (millAt(st.b, m.t)) { const ml = MILLS.find((mm) => mm.includes(m.t) && mm.every((j) => st.b[j] === sg(p))); flash = { ml, p, t: 0 }; msg = 'Mühle!'; msgT = 1; }
      turn = 1 - turn; upd();
      if (millLost(st, turn)) return finish(1 - turn, millCount(st, turn) < 3 ? `${P[turn].name} hat nur noch ${millCount(st, turn)} Steine` : `${P[turn].name} kann nicht mehr ziehen`);
      if (quiet >= 50) return finish(null, '50 Züge ohne Mühle');
      if (turn === cpu) setTimeout(() => { if (!over && !fx.signal.aborted) commit(millCpu(st, turn)); }, 420);
    }
    function tryBase(f, t) {
      const ms = millMoves(st, turn).filter((m) => m.f === f && m.t === t); if (!ms.length) return false;
      if (ms[0].r < 0) commit(ms[0]);
      else { pend = { f, t, opts: ms.map((m) => m.r) }; if (f >= 0) st.b[f] = 0; st.b[t] = sg(turn); if (f < 0) st.hand[turn]--; msg = 'Mühle!'; msgT = 0.9; upd(); }
      return true;
    }
    C.cv.addEventListener('pointerdown', (e) => {
      if (anim || over || turn === cpu || !g) return; e.preventDefault();
      const [wx, wy] = toWorld(C, g, e); let i = -1, bd = 40;
      for (let k = 0; k < 24; k++) { const [a, bb] = pxy(k), d = Math.hypot(a - wx, bb - wy); if (d < bd) { bd = d; i = k; } }
      if (i < 0) { sel = -1; return; }
      if (pend) {
        if (!pend.opts.includes(i)) { msg = st.b[i] === sg(1 - turn) ? 'Der steht in einer Mühle' : 'Tippe einen Stein vom Gegner an'; msgT = 1.1; return; }
        // Zug ist schon sichtbar gesetzt: zurücknehmen und sauber ausführen
        const { f, t } = pend; st.b[t] = 0; if (f >= 0) st.b[f] = sg(turn); else st.hand[turn]++;
        pend = null; anim = { m: { f, t, r: i }, p: turn, t: 1 }; return;
      }
      if (st.hand[turn] > 0) { if (!st.b[i]) tryBase(-1, i); return; }
      if (st.b[i] === sg(turn)) { sel = millBases(st, turn).some(([f]) => f === i) ? i : -1; if (sel < 0) { msg = 'Der kann nicht ziehen'; msgT = 1; } return; }
      if (sel >= 0 && !st.b[i]) { if (!tryBase(sel, i)) sel = -1; }
    });
    function frame(tm) {
      if (fx.signal.aborted) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, frame.l ? (tm - frame.l) / 1000 : 0); frame.l = tm; msgT = Math.max(0, msgT - dt);
      fade.forEach((f) => { f.t += dt * 2.5; }); fade = fade.filter((f) => f.t < 1);
      if (flash) { flash.t += dt; if (flash.t > 1.6) flash = null; }
      if (anim) { anim.t += dt / 0.22; if (anim.t >= 1) endMove(); }
      g = fit(C, WX, WW);
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); paper(x, C.cw, C.ch, dark, 24 * g.U, g.ox, g.oy);
      x.setTransform(C.dpr * g.U, 0, 0, C.dpr * g.U, C.dpr * g.ox, C.dpr * g.oy);
      x.translate(SIDE, 0);
      // Brett: drei Quadrate und Verbindungen
      x.strokeStyle = ink; x.lineCap = 'round';
      [0, 1, 2].forEach((k) => { const a = M + k * GAP, s = (6 - 2 * k) * GAP; x.lineWidth = 3; pline(x, a, a, a + s, a, k * 4 + 1); pline(x, a + s, a, a + s, a + s, k * 4 + 2); pline(x, a + s, a + s, a, a + s, k * 4 + 3); pline(x, a, a + s, a, a, k * 4 + 4); });
      [[3, 0, 3, 2], [3, 4, 3, 6], [0, 3, 2, 3], [4, 3, 6, 3]].forEach(([a, bb, c, d], k) => pline(x, M + a * GAP, M + bb * GAP, M + c * GAP, M + d * GAP, 20 + k));
      x.translate(-SIDE, 0);
      for (let i = 0; i < 24; i++) { const [a, bb] = pxy(i); x.fillStyle = ink; x.beginPath(); x.arc(a, bb, 6, 0, Math.PI * 2); x.fill(); }
      if (flash) { const [a0, b0] = pxy(flash.ml[0]), [a1, b1] = pxy(flash.ml[2]); x.strokeStyle = P[flash.p].color; x.globalAlpha = Math.max(0, 1 - flash.t / 1.6) * 0.7; x.lineWidth = 16; x.beginPath(); x.moveTo(a0, b0); x.lineTo(a1, b1); x.stroke(); x.globalAlpha = 1; }
      const mine = !over && !anim && turn !== cpu;
      // freie Ziele
      if (mine && !pend) {
        const bases = millBases(st, turn).filter(([f]) => (st.hand[turn] > 0 ? f < 0 : f === sel));
        if (st.hand[turn] > 0 || sel >= 0) bases.forEach(([, t]) => { const [a, bb] = pxy(t); x.fillStyle = P[turn].color; x.globalAlpha = 0.18; x.beginPath(); x.arc(a, bb, 20, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; });
      }
      for (let i = 0; i < 24; i++) {
        const v = st.b[i]; if (!v || (anim && i === anim.m.f)) continue;
        const [a, bb] = pxy(i), p = v > 0 ? 0 : 1, gone = anim && anim.m.r === i;
        stone(x, a, bb, 30, P[p].color, ink, dark, i + 3, gone ? 0.35 : 1);
        if (pend && pend.opts.includes(i)) { const pl = 0.5 + Math.sin(tm / 170) * 0.35; x.strokeStyle = '#e0483e'; x.globalAlpha = pl; x.lineWidth = 4; x.beginPath(); x.arc(a, bb, 37, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
      }
      fade.forEach((f) => { const [a, bb] = pxy(f.q); stone(x, a, bb - f.t * 16, 30, P[f.p].color, ink, dark, f.q + 3, 0.35 * (1 - f.t)); });
      if (anim) {
        const t = ease(Math.min(1, anim.t)), [a1, b1] = pxy(anim.m.t);
        let a0 = a1, b0 = b1 - 50; if (anim.m.f >= 0) [a0, b0] = pxy(anim.m.f);
        const al = anim.m.f < 0 ? Math.min(1, t * 2) : 1;
        stone(x, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t - Math.sin(t * Math.PI) * 10, 30, P[anim.p].color, ink, dark, 77, al);
      }
      if (mine && sel >= 0) { const [a, bb] = pxy(sel); x.strokeStyle = P[turn].color; x.lineWidth = 4; x.beginPath(); x.arc(a, bb, 37, 0, Math.PI * 2); x.stroke(); }
      // Steine in der Hand am Rand
      [0, 1].forEach((p) => { for (let k = 0; k < st.hand[p]; k++) { const a = p ? WX - 20 : 20, bb = M + 40 + k * 30; x.globalAlpha = 0.9; stone(x, a, bb, 11, P[p].color, ink, dark, k + p * 9); x.globalAlpha = 1; } });
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (msgT > 0) { x.save(); x.globalAlpha = Math.min(1, msgT * 3); banner(x, C.cw, C.ch, dark, msg); x.restore(); }
    }
    upd(); raf = requestAnimationFrame(frame);
  });
}
