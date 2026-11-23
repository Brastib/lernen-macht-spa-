// Papier-Spiele, Paket 1: Reaktionstest, Vier in einer Reihe, Kästchen erobern. Alles im Kritzel-Look.
import { h } from './ui.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const dot = (p) => h('span.gdot', { style: { background: p.color } });
const chip = (p, sub) => h('span.gturn', null, dot(p), h('b', { text: p.name }), sub ? h('small', { text: sub }) : null);
// gekritzelter Kreis (leicht unrund, zwei Striche)
function scribble(cx, cy, r, seed) {
  let a = seed * 9301 % 233280; const R = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  let d = '';
  for (let k = 0; k <= 30; k++) { const t = k / 28 * Math.PI * 2 + 0.3, rr = r * (1 + (R() - 0.5) * 0.08); d += (k ? 'L' : 'M') + (cx + Math.cos(t) * rr).toFixed(1) + ' ' + (cy + Math.sin(t) * rr).toFixed(1); }
  return d;
}

// ================= Reaktionstest =================
// Zu zweit: 5 Runden, wer zuerst auf seine Hälfte tippt, wenn der Stern kommt. Zu früh = Runde verloren.
// Allein: 5 Messungen, der Durchschnitt zählt (kleiner ist besser).
export function reaction(fx, A, B) {
  return new Promise((resolve) => {
    const P = B ? [A, B] : [A];
    const wins = P.map(() => 0), times = P.map(() => []);
    const ROUNDS = 5;
    let round = 0, state = 'idle', goAt = 0, timer = 0;
    const halves = P.map((p, i) => {
      const lab = h('b.rxbig'), sub = h('small.rxsub');
      const el = h('button.rxhalf', { style: { '--pc': p.color }, 'aria-label': `${p.name} tippen` }, h('span.rxname', null, dot(p), h('b', { text: p.name })), lab, sub, h('span.rxscore'));
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i); });
      return { el, lab, sub };
    });
    const wrap = h('div.rxwrap' + (B ? '' : '.solo'), null, ...halves.map((x) => x.el));
    fx.stage.append(wrap);
    const onKey = (e) => { if (e.repeat) return; if (!B && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); tap(0); } if (B && e.code === 'KeyA') tap(0); if (B && e.code === 'KeyL') tap(1); };
    document.addEventListener('keydown', onKey);
    fx.signal.addEventListener('abort', () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); });
    const setAll = (lab, sub, cls = '') => halves.forEach((x, i) => { x.lab.textContent = typeof lab === 'function' ? lab(i) : lab; x.sub.textContent = typeof sub === 'function' ? sub(i) : sub; x.el.className = 'rxhalf ' + cls; });
    const score = () => halves.forEach((x, i) => { x.el.querySelector('.rxscore').textContent = B ? `${wins[i]} ${wins[i] === 1 ? 'Punkt' : 'Punkte'}` : times[0].length ? `Ø ${avg(times[0])} ms` : ''; });
    const avg = (l) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0);
    function ready() {
      if (round >= ROUNDS) return end();
      round++; state = 'wait'; score();
      setAll('Warte …', `Runde ${round} von ${ROUNDS} · Erst tippen, wenn der Stern kommt!`, 'wait');
      timer = setTimeout(() => { state = 'go'; goAt = performance.now(); setAll('JETZT!', 'Tippen!', 'go'); }, 1400 + Math.random() * 2600);
    }
    function tap(i) {
      if (fx.signal.aborted) return;
      if (state === 'idle' || state === 'pause') return;
      if (state === 'wait') {
        clearTimeout(timer); state = 'pause';
        if (B) { wins[1 - i]++; setAll((k) => (k === i ? 'Zu früh!' : 'Punkt für dich'), (k) => (k === i ? 'Der Punkt geht an die andere Seite.' : ''), 'pause'); halves[i].el.classList.add('bad'); }
        else { setAll('Zu früh!', 'Diese Runde zählt nicht. Gleich nochmal.', 'pause bad'); round--; }
        score(); timer = setTimeout(ready, 1500); return;
      }
      if (state === 'go') {
        const ms = Math.round(performance.now() - goAt); state = 'pause';
        times[i].push(ms);
        if (B) { wins[i]++; setAll((k) => (k === i ? `${ms} ms` : 'Zu langsam'), (k) => (k === i ? 'Punkt für dich!' : ''), 'pause'); halves[i].el.classList.add('win'); }
        else setAll(`${ms} ms`, ms < 250 ? 'Blitzschnell!' : ms < 350 ? 'Gut!' : 'Geht noch schneller.', 'pause win');
        score(); timer = setTimeout(ready, 1400);
      }
    }
    function end() {
      document.removeEventListener('keydown', onKey);
      if (!B) return resolve({ score: avg(times[0]) });
      const [a, b] = wins, ta = avg(times[0]), tb = avg(times[1]);
      resolve({ w: a > b ? 0 : b > a ? 1 : ta && tb ? (ta < tb ? 0 : tb < ta ? 1 : null) : null, detail: `${a} : ${b} Punkte` + (ta || tb ? ` · Ø ${ta || '–'} / ${tb || '–'} ms` : '') });
    }
    setAll('Bereit?', B ? 'Jeder tippt auf seine Hälfte, sobald der Stern erscheint. Tippe, um zu starten.' : 'Tippe, sobald der Stern erscheint. Tippe, um zu starten.', 'pause');
    state = 'idle';
    const start = () => { if (state === 'idle') { state = 'pause'; ready(); } };
    halves.forEach((x) => x.el.addEventListener('pointerdown', start, { once: true }));
    const k0 = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyA' || e.code === 'KeyL') { document.removeEventListener('keydown', k0); start(); } };
    document.addEventListener('keydown', k0);
    score();
  });
}

// ================= Vier in einer Reihe =================
const COLS = 7, ROWS = 6;
function fourWin(b, p) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (b[r][c] !== p) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
      if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p)) return cells;
    }
  }
  return null;
}
const dropRow = (b, c) => { for (let r = ROWS - 1; r >= 0; r--) if (b[r][c] == null) return r; return -1; };
function fourEval(b, me) {
  let v = 0;
  const win = (cells) => { const m = cells.filter(([r, c]) => b[r][c] === me).length, o = cells.filter(([r, c]) => b[r][c] === 1 - me).length; if (m && o) return 0; return m === 3 ? 6 : m === 2 ? 2 : o === 3 ? -7 : o === 2 ? -2 : 0; };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
    if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) v += win(cells);
  }
  for (let r = 0; r < ROWS; r++) if (b[r][3] === me) v += 3; else if (b[r][3] === 1 - me) v -= 3;
  return v;
}
function fourAB(b, depth, a, bt, turn, me) {
  if (fourWin(b, 1 - turn)) return (turn === me ? -1 : 1) * (1000 + depth);
  const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => dropRow(b, c) >= 0);
  if (!cols.length) return 0;
  if (!depth) return fourEval(b, me);
  if (turn === me) {
    let v = -Infinity;
    for (const c of cols) { const r = dropRow(b, c); b[r][c] = turn; v = Math.max(v, fourAB(b, depth - 1, a, bt, 1 - turn, me)); b[r][c] = null; a = Math.max(a, v); if (a >= bt) break; }
    return v;
  }
  let v = Infinity;
  for (const c of cols) { const r = dropRow(b, c); b[r][c] = turn; v = Math.min(v, fourAB(b, depth - 1, a, bt, 1 - turn, me)); b[r][c] = null; bt = Math.min(bt, v); if (a >= bt) break; }
  return v;
}
export function fourCpu(b, me, depth = 5) {
  const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => dropRow(b, c) >= 0);
  if (Math.random() < 0.12) return cols[(Math.random() * cols.length) | 0];   // ab und zu ein Fehler
  let best = cols[0], bv = -Infinity;
  for (const c of cols) { const r = dropRow(b, c); b[r][c] = me; const v = fourAB(b, depth - 1, -Infinity, Infinity, 1 - me, me) + Math.random() * 0.5; b[r][c] = null; if (v > bv) { bv = v; best = c; } }
  return best;
}
export function four(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const P = [A, B], cpu = o.cpu ? 1 : null;
    const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    let turn = 0, over = false, busy = false, n = 0;
    const CW = 70, W = COLS * CW + 20, H = ROWS * CW + 20;
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'p4board' });
    const grid = S('g', { class: 'p4grid' }), discs = S('g'), hover = S('g');
    svg.append(grid, discs, hover);
    for (let c = 0; c <= COLS; c++) grid.append(S('path', { d: `M${10 + c * CW + (c % 2 ? 1 : -1)} 8 L${10 + c * CW} ${H - 8}` }));
    grid.append(S('path', { d: `M6 ${H - 10} L${W - 6} ${H - 9}`, class: 'p4floor' }));
    const chips = [chip(A, 'fängt an'), chip(B, '')];
    const msg = h('p.gmsg');
    const wrapB = h('div.p4wrap', null, h('div.gturns', null, ...chips), h('div.p4boardwrap', null, svg), msg);
    fx.stage.append(wrapB);
    const sizeIt = () => { const r = wrapB.getBoundingClientRect(); const w = Math.max(260, Math.min(r.width - 32, (r.height - 140) * W / H, 760)); svg.style.width = w + 'px'; svg.style.height = (w * H / W) + 'px'; };
    const ro = new ResizeObserver(sizeIt); ro.observe(wrapB); sizeIt();
    fx.signal.addEventListener('abort', () => ro.disconnect());
    const show = () => { chips.forEach((c, i) => c.classList.toggle('on', !over && turn === i)); if (!over) msg.textContent = turn === cpu ? 'Computer überlegt …' : `${P[turn].name} ist dran: tippe auf eine Spalte.`; };
    function colAt(e) { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) * W / r.width - 10) / CW))); }
    svg.addEventListener('pointermove', (e) => {
      if (over || turn === cpu) return;
      const c = colAt(e);
      hover.replaceChildren(S('path', { d: `M${10 + c * CW + 8} 6 L${10 + (c + 1) * CW - 8} 6`, stroke: P[turn].color, class: 'p4hov' }));
    });
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!over && !busy && turn !== cpu) play(colAt(e)); });
    function play(c) {
      const r = dropRow(b, c); if (r < 0) return;
      b[r][c] = turn; n++;
      const cx = 10 + c * CW + CW / 2, cy = 10 + r * CW + CW / 2;
      const g = S('g', { class: 'p4disc', style: `--fall:${-(r + 1) * CW}px; color:${P[turn].color}` });
      g.append(S('circle', { cx, cy, r: CW * 0.36, class: 'p4fill' }), S('path', { d: scribble(cx, cy, CW * 0.38, n * 7 + 1), class: 'p4ink' }), S('path', { d: scribble(cx, cy, CW * 0.2, n * 3 + 5), class: 'p4ink2' }));
      discs.append(g); hover.replaceChildren();
      const line = fourWin(b, turn);
      if (line) {
        over = true; show();
        const [r0, c0] = line[0], [r3, c3] = line[3];
        discs.append(S('path', { d: `M${10 + c0 * CW + CW / 2} ${10 + r0 * CW + CW / 2} L${10 + c3 * CW + CW / 2} ${10 + r3 * CW + CW / 2}`, class: 'p4win', stroke: P[turn].color }));
        msg.textContent = `${P[turn].name} hat vier in einer Reihe!`;
        return setTimeout(() => resolve({ w: turn, detail: 'Vier in einer Reihe' }), 1000);
      }
      if (n === ROWS * COLS) { over = true; show(); msg.textContent = 'Alles voll.'; return setTimeout(() => resolve({ w: null, detail: 'Alles voll' }), 1000); }
      turn = 1 - turn; show();
      if (turn === cpu) { busy = true; setTimeout(() => { busy = false; if (!over && !fx.signal.aborted) play(fourCpu(b, cpu)); }, 450); }
    }
    show();
  });
}

// ================= Kästchen erobern =================
// 5×5 Kästchen. Linie zwischen zwei Punkten ziehen. Wer ein Kästchen schließt, bekommt es und ist nochmal dran.
const BN = 5;
const edges = () => { const l = []; for (let r = 0; r <= BN; r++) for (let c = 0; c < BN; c++) l.push(`h${r},${c}`); for (let r = 0; r < BN; r++) for (let c = 0; c <= BN; c++) l.push(`v${r},${c}`); return l; };
const boxEdges = (r, c) => [`h${r},${c}`, `h${r + 1},${c}`, `v${r},${c}`, `v${r},${c + 1}`];
const boxesOf = (e) => { const [k, rest] = [e[0], e.slice(1)]; const [r, c] = rest.split(',').map(Number); const out = []; if (k === 'h') { if (r > 0) out.push([r - 1, c]); if (r < BN) out.push([r, c]); } else { if (c > 0) out.push([r, c - 1]); if (c < BN) out.push([r, c]); } return out; };
export function boxCpu(lines) {
  const free = edges().filter((e) => !lines.has(e));
  const sides = (r, c) => boxEdges(r, c).filter((x) => lines.has(x)).length;
  const closes = free.filter((e) => boxesOf(e).some(([r, c]) => sides(r, c) === 3));
  if (closes.length) return closes[(Math.random() * closes.length) | 0];
  const safe = free.filter((e) => boxesOf(e).every(([r, c]) => sides(r, c) < 2));
  if (safe.length) return safe[(Math.random() * safe.length) | 0];
  // sonst: die Linie, die dem Gegner am wenigsten Kästchen schenkt
  let best = free[0], bv = Infinity;
  for (const e of free) {
    const L = new Set(lines); L.add(e); let give = 0;
    for (;;) { const f = edges().filter((x) => !L.has(x)).find((x) => boxesOf(x).some(([r, c]) => boxEdges(r, c).filter((y) => L.has(y)).length === 3)); if (!f) break; L.add(f); give++; }
    if (give < bv) { bv = give; best = e; }
  }
  return best;
}
export function boxes(fx, A, B, o = {}) {
  return new Promise((resolve) => {
    const P = [A, B], cpu = o.cpu ? 1 : null;
    const lines = new Map(), own = new Map(), pts = [0, 0];
    let turn = 0, over = false, busy = false;
    const G = 90, M = 24, W = BN * G + M * 2;
    const svg = S('svg', { viewBox: `0 0 ${W} ${W}`, class: 'bxboard' });
    const chips = [chip(A, '0'), chip(B, '0')];
    const msg = h('p.gmsg');
    const wrapB = h('div.p4wrap', null, h('div.gturns', null, ...chips), h('div.p4boardwrap', null, svg), msg);
    fx.stage.append(wrapB);
    const sizeIt = () => { const r = wrapB.getBoundingClientRect(); const w = Math.max(260, Math.min(r.width - 32, r.height - 150, 640)); svg.style.width = svg.style.height = w + 'px'; };
    const ro = new ResizeObserver(sizeIt); ro.observe(wrapB); sizeIt();
    fx.signal.addEventListener('abort', () => ro.disconnect());
    const pos = (e) => { const [r, c] = e.slice(1).split(',').map(Number); return e[0] === 'h' ? [M + c * G, M + r * G, M + (c + 1) * G, M + r * G] : [M + c * G, M + r * G, M + c * G, M + (r + 1) * G]; };
    function render() {
      svg.replaceChildren();
      for (const [k, w] of own) { const [r, c] = k.split(',').map(Number); const g = S('g', { class: 'bxown', style: `color:${P[w].color}` }); g.append(S('rect', { x: M + c * G + 6, y: M + r * G + 6, width: G - 12, height: G - 12, rx: 6 })); const t = S('text', { x: M + c * G + G / 2, y: M + r * G + G / 2 + 9 }); t.textContent = P[w].name.slice(0, 1).toUpperCase(); g.append(t); svg.append(g); }
      for (const e of edges()) { const [x1, y1, x2, y2] = pos(e); const who = lines.get(e); svg.append(S('line', { x1, y1, x2, y2, class: who == null ? 'bxfree' : 'bxline', stroke: who == null ? '' : P[who].color, 'data-e': e })); }
      for (let r = 0; r <= BN; r++) for (let c = 0; c <= BN; c++) svg.append(S('circle', { cx: M + c * G, cy: M + r * G, r: 5, class: 'bxdot' }));
      chips.forEach((ch, i) => { ch.classList.toggle('on', !over && turn === i); ch.querySelector('small').textContent = `${pts[i]} Kästchen`; });
      if (!over) msg.textContent = turn === cpu ? 'Computer überlegt …' : `${P[turn].name} ist dran: tippe zwischen zwei Punkte.`;
    }
    function edgeAt(ev) {
      const r = svg.getBoundingClientRect(), k = W / r.width, x = (ev.clientX - r.left) * k - M, y = (ev.clientY - r.top) * k - M;
      const gx = x / G, gy = y / G, fx2 = gx - Math.round(gx), fy2 = gy - Math.round(gy);
      if (Math.abs(fy2) < Math.abs(fx2)) { const rr = Math.round(gy), c = Math.floor(gx); return rr >= 0 && rr <= BN && c >= 0 && c < BN ? `h${rr},${c}` : null; }
      const c = Math.round(gx), rr = Math.floor(gy); return c >= 0 && c <= BN && rr >= 0 && rr < BN ? `v${rr},${c}` : null;
    }
    svg.addEventListener('pointerdown', (ev) => { ev.preventDefault(); if (over || busy || turn === cpu) return; const e = edgeAt(ev); if (e && !lines.has(e)) play(e); });
    function play(e) {
      lines.set(e, turn);
      let got = 0;
      for (const [r, c] of boxesOf(e)) if (boxEdges(r, c).every((x) => lines.has(x))) { own.set(`${r},${c}`, turn); pts[turn]++; got++; }
      if (own.size === BN * BN) {
        over = true; render();
        const w = pts[0] > pts[1] ? 0 : pts[1] > pts[0] ? 1 : null;
        msg.textContent = w == null ? 'Gleich viele Kästchen!' : `${P[w].name} hat die meisten Kästchen!`;
        return setTimeout(() => resolve({ w, detail: `${pts[0]} : ${pts[1]} Kästchen` }), 1000);
      }
      if (!got) turn = 1 - turn;
      render();
      if (turn === cpu) { busy = true; setTimeout(() => { busy = false; if (!over && !fx.signal.aborted) play(boxCpu(new Set(lines.keys()))); }, 420); }
    }
    render();
  });
}
