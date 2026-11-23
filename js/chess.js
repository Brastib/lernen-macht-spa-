// Schach zu zweit oder gegen den Computer. Alle Regeln: Rochade, en passant, Umwandlung, Schach, Matt, Patt,
// 50-Züge-Regel, dreifache Wiederholung, zu wenig Material.
import { h, icon, sheet, confirmSheet } from './ui.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAME = { q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' };
const white = (pc) => pc && pc === pc.toUpperCase();
const sideOf = (pc) => (pc ? (white(pc) ? 'w' : 'b') : null);
const RC = (i) => [i >> 3, i & 7];
const IX = (r, c) => r * 8 + c;
const ok = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const N_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const K_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const B_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]], R_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function startPos() {
  const b = Array(64).fill(null);
  'rnbqkbnr'.split('').forEach((p, c) => { b[c] = p; b[56 + c] = p.toUpperCase(); b[8 + c] = 'p'; b[48 + c] = 'P'; });
  return { b, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 };
}

// Wird Feld sq von Seite by angegriffen?
export function attacked(b, sq, by) {
  const [r, c] = RC(sq), W = by === 'w';
  const is = (i, t) => b[i] && sideOf(b[i]) === by && b[i].toLowerCase() === t;
  const pr = W ? r + 1 : r - 1;               // Bauern greifen schräg nach vorn an
  for (const dc of [-1, 1]) if (ok(pr, c + dc) && is(IX(pr, c + dc), 'p')) return true;
  for (const [dr, dc] of N_D) if (ok(r + dr, c + dc) && is(IX(r + dr, c + dc), 'n')) return true;
  for (const [dr, dc] of K_D) if (ok(r + dr, c + dc) && is(IX(r + dr, c + dc), 'k')) return true;
  const ray = (dirs, types) => dirs.some(([dr, dc]) => {
    let rr = r + dr, cc = c + dc;
    while (ok(rr, cc)) { const p = b[IX(rr, cc)]; if (p) return sideOf(p) === by && types.includes(p.toLowerCase()); rr += dr; cc += dc; }
    return false;
  });
  return ray(B_D, 'bq') || ray(R_D, 'rq');
}
const kingSq = (b, side) => b.findIndex((p) => p === (side === 'w' ? 'K' : 'k'));
export const inCheck = (s, side = s.turn) => attacked(s.b, kingSq(s.b, side), side === 'w' ? 'b' : 'w');

function pseudo(s) {
  const out = [], b = s.b, me = s.turn, foe = me === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const pc = b[i]; if (!pc || sideOf(pc) !== me) continue;
    const t = pc.toLowerCase(), [r, c] = RC(i);
    const add = (to, extra = {}) => out.push({ from: i, to, pc, cap: b[to], ...extra });
    if (t === 'p') {
      const d = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
      const push = (to) => { if (RC(to)[0] === last) for (const q of 'qrbn') add(to, { promo: q }); else add(to); };
      if (ok(r + d, c) && !b[IX(r + d, c)]) {
        push(IX(r + d, c));
        if (r === start && !b[IX(r + 2 * d, c)]) add(IX(r + 2 * d, c), { dbl: true });
      }
      for (const dc of [-1, 1]) {
        if (!ok(r + d, c + dc)) continue;
        const to = IX(r + d, c + dc);
        if (b[to] && sideOf(b[to]) === foe) push(to);
        else if (to === s.ep) add(to, { ep: true, cap: me === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? N_D : K_D) {
        if (!ok(r + dr, c + dc)) continue;
        const to = IX(r + dr, c + dc);
        if (!b[to] || sideOf(b[to]) === foe) add(to);
      }
      if (t === 'k') {
        const row = me === 'w' ? 7 : 0, K = me === 'w' ? 'K' : 'k', Q = me === 'w' ? 'Q' : 'q';
        if (i === IX(row, 4) && !attacked(b, i, foe)) {
          if (s.castle[K] && !b[IX(row, 5)] && !b[IX(row, 6)] && b[IX(row, 7)] === (me === 'w' ? 'R' : 'r') && !attacked(b, IX(row, 5), foe) && !attacked(b, IX(row, 6), foe)) add(IX(row, 6), { castle: 'K' });
          if (s.castle[Q] && !b[IX(row, 3)] && !b[IX(row, 2)] && !b[IX(row, 1)] && b[IX(row, 0)] === (me === 'w' ? 'R' : 'r') && !attacked(b, IX(row, 3), foe) && !attacked(b, IX(row, 2), foe)) add(IX(row, 2), { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'b' ? B_D : t === 'r' ? R_D : [...B_D, ...R_D];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (ok(rr, cc)) {
          const to = IX(rr, cc);
          if (b[to]) { if (sideOf(b[to]) === foe) add(to); break; }
          add(to); rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}
export function apply(s, m) {
  const b = s.b.slice(), me = s.turn, castle = { ...s.castle };
  b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : m.pc;
  b[m.from] = null;
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = null;
  if (m.castle) {
    const row = me === 'w' ? 7 : 0;
    if (m.castle === 'K') { b[IX(row, 5)] = b[IX(row, 7)]; b[IX(row, 7)] = null; } else { b[IX(row, 3)] = b[IX(row, 0)]; b[IX(row, 0)] = null; }
  }
  if (m.pc === 'K') castle.K = castle.Q = false;
  if (m.pc === 'k') castle.k = castle.q = false;
  for (const [sq, k] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) castle[k] = false;
  return { b, turn: me === 'w' ? 'b' : 'w', castle, ep: m.dbl ? (m.from + m.to) / 2 : -1, half: m.pc.toLowerCase() === 'p' || m.cap ? 0 : s.half + 1, full: s.full + (me === 'b' ? 1 : 0) };
}
export function legal(s) {
  return pseudo(s).filter((m) => { const n = apply(s, m); return !attacked(n.b, kingSq(n.b, s.turn), n.turn); });
}
const key = (s) => s.b.map((p) => p || '.').join('') + s.turn + Object.entries(s.castle).filter(([, v]) => v).map(([k]) => k).join('') + s.ep;
function lowMaterial(b) {
  const rest = b.filter((p) => p && p.toLowerCase() !== 'k');
  if (!rest.length) return true;
  if (rest.length === 1 && 'bn'.includes(rest[0].toLowerCase())) return true;
  if (rest.length === 2 && rest.every((p) => p.toLowerCase() === 'b')) {
    const col = b.map((p, i) => (p && p.toLowerCase() === 'b' ? (RC(i)[0] + RC(i)[1]) % 2 : -1)).filter((x) => x >= 0);
    return col[0] === col[1];
  }
  return false;
}
// Spielstand: null = läuft, sonst {w: 'w'|'b'|null, why}
export function status(s, seen) {
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? { w: s.turn === 'w' ? 'b' : 'w', why: 'Schachmatt' } : { w: null, why: 'Patt' };
  if (s.half >= 100) return { w: null, why: '50 Züge ohne Schlagen oder Bauernzug' };
  if (lowMaterial(s.b)) return { w: null, why: 'Zu wenig Figuren für ein Matt' };
  if (seen && (seen.get(key(s)) || 0) >= 3) return { w: null, why: 'Dreimal dieselbe Stellung' };
  return null;
}

// ---------- Computer ----------
const PST_P = [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
const CENTER = (i) => { const [r, c] = RC(i); return 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)); };
function evalW(b) {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p) continue;
    const t = p.toLowerCase(), W = p !== t, mi = W ? i : (7 - (i >> 3)) * 8 + (i & 7);
    let x = VAL[t];
    if (t === 'p') x += PST_P[mi];
    else if (t === 'n' || t === 'b') x += CENTER(i) * 8;
    else if (t === 'q') x += CENTER(i) * 3;
    v += W ? x : -x;
  }
  return v;
}
function search(s, d, a, bt) {
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? -100000 - d : 0;
  if (d === 0) return (s.turn === 'w' ? 1 : -1) * evalW(s.b);
  ms.sort((x, y) => (y.cap ? VAL[y.cap.toLowerCase()] : 0) - (x.cap ? VAL[x.cap.toLowerCase()] : 0));
  for (const m of ms) {
    const v = -search(apply(s, m), d - 1, -bt, -a);
    if (v > a) a = v;
    if (a >= bt) break;
  }
  return a;
}
export function bestMove(s, level = 2) {
  const ms = legal(s);
  const depth = level >= 3 ? 3 : level === 2 ? 2 : 1;
  let best = null, bv = -Infinity;
  for (const m of ms.sort(() => Math.random() - 0.5)) {
    let v = -search(apply(s, m), depth - 1, -Infinity, Infinity);
    if (level === 1) v += Math.random() * 120;       // leicht: macht auch mal Fehler
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}

// ---------- Brett ----------
const FILES = 'abcdefgh';
function promoSheet(me) {
  return sheet('Bauer umwandeln', (body, close) => {
    body.append(h('p.calm', { text: 'In welche Figur soll der Bauer werden?' }), h('div.chpromo', null,
      ...'qrbn'.split('').map((q) => h('button.chpromobtn', { on: { click: () => close(q) } },
        h('span.chpc.' + (me === 'w' ? 'w' : 'b'), { text: GLYPH[q] + '︎' }), h('b', { text: NAME[q] })))));
  }).then((q) => q || 'q');
}

export function chessGame(fx, A, B, { ai = null, level = 2 } = {}) {
  return new Promise((resolve) => {
    let s = startPos(), sel = -1, lastMv = null, over = false, thinking = false;
    const seen = new Map([[key(s), 1]]);
    const lost = { w: [], b: [] };
    const P = { w: A, b: B };
    const chip = (side) => h('span.gturn.chturn', null, h('span.gdot', { style: { background: P[side].color } }), h('b', { text: P[side].name }),
      h('small', { text: side === 'w' ? 'Weiß' : 'Schwarz' }));
    const ca = chip('w'), cb = chip('b');
    const capA = h('div.chcap'), capB = h('div.chcap');
    const msg = h('p.gmsg');
    const board = h('div.chboard');
    const cells = Array.from({ length: 64 }, (_, i) => {
      const [r, c] = RC(i);
      const el = h('button.chsq' + ((r + c) % 2 ? '.dk' : '.lt'), { 'aria-label': FILES[c] + (8 - r), on: { click: () => tap(i) } });
      if (c === 0) el.append(h('i.chrank', { text: String(8 - r) }));
      if (r === 7) el.append(h('i.chfile', { text: FILES[c] }));
      return el;
    });
    board.append(...cells);
    const giveUp = h('button.btn', { on: { click: async () => {
      if (over) return;
      const who = ai ? 'w' : s.turn;
      if (await confirmSheet('Aufgeben?', `${P[who].name} gibt auf. ${P[who === 'w' ? 'b' : 'w'].name} gewinnt.`, 'Aufgeben')) finish({ w: who === 'w' ? 'b' : 'w', why: `${P[who].name} hat aufgegeben` });
    } } }, icon('close'), 'Aufgeben');
    const wrap = h('div.chwrap', null,
      h('div.chside', null, cb, capB),
      h('div.chboardwrap', null, board),
      h('div.chside', null, ca, capA),
      h('div.chfoot', null, msg, giveUp));
    fx.stage.append(wrap);
    const sizeBoard = () => {
      const r = wrap.getBoundingClientRect();
      const side = Math.max(240, Math.min(r.width - 32, r.height - 190, 720));
      board.style.width = board.style.height = side + 'px'; board.style.setProperty('--cell', side / 8 + 'px');
    };
    const ro = new ResizeObserver(sizeBoard); ro.observe(wrap); sizeBoard();
    fx.signal.addEventListener('abort', () => ro.disconnect());

    function render() {
      const ms = sel >= 0 ? legal(s).filter((m) => m.from === sel) : [];
      const chk = inCheck(s) ? kingSq(s.b, s.turn) : -1;
      cells.forEach((el, i) => {
        el.querySelector('.chpc')?.remove(); el.querySelector('.chdot')?.remove();
        const p = s.b[i];
        if (p) el.append(h('span.chpc.' + (white(p) ? 'w' : 'b'), { text: GLYPH[p.toLowerCase()] + '︎' }));
        const m = ms.find((x) => x.to === i);
        if (m) el.append(h('span.chdot' + (m.cap ? '.cap' : '')));
        el.classList.toggle('sel', i === sel);
        el.classList.toggle('last', !!lastMv && (lastMv.from === i || lastMv.to === i));
        el.classList.toggle('chk', i === chk);
      });
      ca.classList.toggle('on', !over && s.turn === 'w'); cb.classList.toggle('on', !over && s.turn === 'b');
      const pcs = (arr) => arr.sort((x, y) => VAL[y] - VAL[x]).map((t) => GLYPH[t] + '︎').join('');
      capA.textContent = pcs(lost.b); capB.textContent = pcs(lost.w);
      const diff = lost.b.reduce((a, t) => a + VAL[t], 0) - lost.w.reduce((a, t) => a + VAL[t], 0);
      if (diff) (diff > 0 ? capA : capB).append(h('small', { text: ' +' + Math.round(Math.abs(diff) / 100) }));
      if (!over) msg.textContent = thinking ? 'Computer überlegt …' : `${P[s.turn].name} ist dran` + (chk >= 0 ? ' · Schach!' : '');
      giveUp.disabled = over;
    }
    async function doMove(m) {
      if (m.promo && !(ai && s.turn === ai)) { const q = await promoSheet(s.turn); if (fx.signal.aborted) return; m = legal(s).find((x) => x.from === m.from && x.to === m.to && x.promo === q) || m; }
      if (m.cap) lost[sideOf(m.cap)].push(m.cap.toLowerCase());
      s = apply(s, m); lastMv = m; sel = -1;
      seen.set(key(s), (seen.get(key(s)) || 0) + 1);
      const st = status(s, seen);
      render();
      if (st) return finish(st);
      if (ai && s.turn === ai) aiTurn();
    }
    function aiTurn() {
      thinking = true; render();
      setTimeout(() => {
        if (fx.signal.aborted || over) return;
        const m = bestMove(s, level);
        thinking = false;
        if (m) doMove(m);
      }, 350);
    }
    function tap(i) {
      if (over || thinking || (ai && s.turn === ai)) return;
      const p = s.b[i];
      if (sel >= 0) {
        const cand = legal(s).filter((m) => m.from === sel && m.to === i);
        if (cand.length) { doMove(cand.find((m) => !m.promo || m.promo === 'q') || cand[0]); return; }
      }
      sel = p && sideOf(p) === s.turn && i !== sel ? i : -1;
      render();
    }
    function finish(st) {
      over = true; render();
      msg.textContent = st.w ? `${st.why}! ${P[st.w].name} gewinnt.` : `Unentschieden: ${st.why}.`;
      setTimeout(() => { ro.disconnect(); resolve({ w: st.w == null ? null : st.w === 'w' ? 0 : 1, detail: st.why }); }, 1200);
    }
    render();
    if (ai === 'w') aiTurn();
  });
}

export const chessDuel = (fx, A, B) => chessGame(fx, A, B);
