// Mauerlauf: Jeder ist ein Punkt auf einem 9×9-Raster. Pro Zug einen Schritt gehen ODER eine Mauer setzen.
// Wer zuerst die gegenüberliegende Seite erreicht, gewinnt. Mauern dürfen niemandem den Weg ganz versperren.
import { h, icon, toast } from './ui.js';

const N = 9, WALLS = 10, CS = 60, PAD = 14;
const SVGNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Mauer-Schlüssel: 'h r c' = waagerecht unter Reihe r über Spalten c,c+1; 'v r c' = senkrecht rechts von Spalte c über Reihen r,r+1
export function blocked(walls, r, c, r2, c2) {
  if (r2 < 0 || r2 >= N || c2 < 0 || c2 >= N) return true;
  if (r2 === r + 1) return walls.has(`h ${r} ${c}`) || walls.has(`h ${r} ${c - 1}`);
  if (r2 === r - 1) return walls.has(`h ${r2} ${c}`) || walls.has(`h ${r2} ${c - 1}`);
  if (c2 === c + 1) return walls.has(`v ${r} ${c}`) || walls.has(`v ${r - 1} ${c}`);
  if (c2 === c - 1) return walls.has(`v ${r} ${c2}`) || walls.has(`v ${r - 1} ${c2}`);
  return true;
}
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export function moves(st, who) {
  const me = st.pos[who], other = st.pos[1 - who], out = [];
  for (const [dr, dc] of DIRS) {
    const r = me[0] + dr, c = me[1] + dc;
    if (blocked(st.walls, me[0], me[1], r, c)) continue;
    if (r === other[0] && c === other[1]) {
      // über den anderen springen, sonst schräg daneben
      if (!blocked(st.walls, r, c, r + dr, c + dc)) out.push([r + dr, c + dc]);
      else for (const [sr, sc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) if (!blocked(st.walls, r, c, r + sr, c + sc)) out.push([r + sr, c + sc]);
    } else out.push([r, c]);
  }
  return out;
}
const goalRow = (who) => (who === 0 ? 0 : N - 1);
export function pathLen(walls, from, who) {
  const seen = new Set([from.join()]), q = [[...from, 0]];
  while (q.length) {
    const [r, c, d] = q.shift();
    if (r === goalRow(who)) return d;
    for (const [dr, dc] of DIRS) {
      const k = `${r + dr},${c + dc}`;
      if (seen.has(k) || blocked(walls, r, c, r + dr, c + dc)) continue;
      seen.add(k); q.push([r + dr, c + dc, d + 1]);
    }
  }
  return -1;
}
// Darf die Mauer hier hin? Gibt Grund zurück, wenn nicht.
export function wallProblem(st, w) {
  const [o, r, c] = w.split(' '), R = +r, C = +c;
  if (R < 0 || R > N - 2 || C < 0 || C > N - 2) return 'Hier passt keine Mauer hin.';
  if (st.walls.has(w)) return 'Da steht schon eine Mauer.';
  const clash = o === 'h' ? [`h ${R} ${C - 1}`, `h ${R} ${C + 1}`, `v ${R} ${C}`] : [`v ${R - 1} ${C}`, `v ${R + 1} ${C}`, `h ${R} ${C}`];
  if (clash.some((k) => st.walls.has(k))) return 'Die Mauer würde eine andere kreuzen oder überlappen.';
  const nw = new Set(st.walls.keys()); nw.add(w);
  if (pathLen(nw, st.pos[0], 0) < 0 || pathLen(nw, st.pos[1], 1) < 0) return 'Die Mauer würde den Weg ganz versperren. Das ist nicht erlaubt.';
  return null;
}

export function wallGame(fx, A, B) {
  return new Promise((resolve) => {
    const P = [A, B];
    const st = { pos: [[N - 1, 4], [0, 4]], walls: new Map(), left: [WALLS, WALLS], turn: 0 };
    let mode = 'go', ghost = null, over = false;
    const W = N * CS + PAD * 2;
    const svg = S('svg', { viewBox: `0 0 ${W} ${W}`, class: 'wlboard', role: 'img', 'aria-label': 'Spielfeld' });
    const chip = (i) => h('span.gturn.wlturn', null, h('span.gdot', { style: { background: P[i].color } }), h('b', { text: P[i].name }), h('small.wlleft'));
    const chips = [chip(0), chip(1)];
    const msg = h('p.gmsg');
    const modeSeg = h('div.gseg.wlseg');
    const rot = h('button.btn', { on: { click: () => { if (!ghost) return; ghost = ghost.replace(/^[hv]/, (m) => (m === 'h' ? 'v' : 'h')); render(); } } }, icon('rotate'), 'Drehen');
    const place = h('button.btn.primary', { on: { click: () => setWall() } }, icon('plus'), 'Mauer setzen');
    const wallBar = h('div.wlbar', null, rot, place);
    const wrap = h('div.wlwrap', null,
      h('div.gturns', null, chips[1], chips[0]),
      h('div.wlboardwrap', null, svg),
      h('div.wlctrl', null, modeSeg, wallBar), msg);
    fx.stage.append(wrap);
    const sizeBoard = () => {
      const r = wrap.getBoundingClientRect();
      const side = Math.max(260, Math.min(r.width - 32, r.height - 200, 720));
      svg.style.width = svg.style.height = side + 'px';
    };
    const ro = new ResizeObserver(sizeBoard); ro.observe(wrap); sizeBoard();
    fx.signal.addEventListener('abort', () => ro.disconnect());

    const cx = (c) => PAD + c * CS + CS / 2, cy = (r) => PAD + r * CS + CS / 2;
    function wallLine(w, cls, color) {
      const [o, r, c] = w.split(' ').map((v, i) => (i ? +v : v));
      const g = S('g', { class: cls });
      const L = 6;
      const [x1, y1, x2, y2] = o === 'h'
        ? [PAD + c * CS + L, PAD + (r + 1) * CS, PAD + (c + 2) * CS - L, PAD + (r + 1) * CS]
        : [PAD + (c + 1) * CS, PAD + r * CS + L, PAD + (c + 1) * CS, PAD + (r + 2) * CS - L];
      const j = (k) => ((r * 7 + c * 13 + k * 5) % 5) - 2;
      g.append(S('path', { d: `M${x1} ${y1 + (o === 'h' ? j(1) * 0.6 : 0)} L${x2} ${y2 + (o === 'h' ? j(2) * 0.6 : 0)}`, stroke: color, 'stroke-width': 9, 'stroke-linecap': 'round' }));
      g.append(S('path', { d: `M${x1 + (o === 'v' ? j(3) * 0.5 : 0) + 1} ${y1 + 1} L${x2 + (o === 'v' ? j(4) * 0.5 : 0) - 1} ${y2 - 1}`, class: 'wlink', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
      return g;
    }
    function render() {
      svg.replaceChildren();
      // Zielreihen
      svg.append(S('rect', { x: PAD, y: PAD, width: N * CS, height: CS, class: 'wlgoal', fill: P[0].color }));
      svg.append(S('rect', { x: PAD, y: PAD + (N - 1) * CS, width: N * CS, height: CS, class: 'wlgoal', fill: P[1].color }));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) svg.append(S('rect', { x: PAD + c * CS + 5, y: PAD + r * CS + 5, width: CS - 10, height: CS - 10, rx: 8, class: 'wlcell' }));
      for (const [w, who] of st.walls) svg.append(wallLine(w, 'wlwall', P[who].color));
      if (!over && mode === 'go') for (const [r, c] of moves(st, st.turn)) {
        const t = S('circle', { cx: cx(c), cy: cy(r), r: 11, class: 'wltarget', fill: P[st.turn].color });
        t.dataset.go = `${r},${c}`;
        svg.append(t);
      }
      if (ghost && mode === 'wall') svg.append(wallLine(ghost, 'wlghost' + (wallProblem(st, ghost) ? ' bad' : ''), P[st.turn].color));
      st.pos.forEach(([r, c], i) => {
        const g = S('g', { class: 'wlpawn' + (i === st.turn && !over ? ' on' : '') });
        g.append(S('circle', { cx: cx(c), cy: cy(r), r: 19, fill: P[i].color }), S('circle', { cx: cx(c), cy: cy(r), r: 22, class: 'wlring' }));
        svg.append(g);
      });
      chips.forEach((ch, i) => { ch.classList.toggle('on', !over && st.turn === i); ch.querySelector('.wlleft').textContent = `${st.left[i]} Mauern`; });
      modeSeg.replaceChildren(
        h('button' + (mode === 'go' ? '.on' : ''), { on: { click: () => { mode = 'go'; ghost = null; render(); } } }, 'Gehen'),
        h('button' + (mode === 'wall' ? '.on' : ''), { disabled: !st.left[st.turn], on: { click: () => { mode = 'wall'; render(); } } }, `Mauer (${st.left[st.turn]})`));
      wallBar.hidden = mode !== 'wall';
      place.disabled = !ghost || !!wallProblem(st, ghost);
      if (!over) msg.textContent = mode === 'wall'
        ? (ghost ? (wallProblem(st, ghost) || 'Passt. Tippe „Mauer setzen“ oder noch mal auf die Mauer.') : 'Tippe zwischen zwei Felder, wo die Mauer hin soll.')
        : `${P[st.turn].name} ist dran: einen Schritt gehen oder eine Mauer setzen.`;
    }
    function toBoard(e) {
      const r = svg.getBoundingClientRect(), k = W / r.width;
      return [(e.clientX - r.left) * k - PAD, (e.clientY - r.top) * k - PAD];
    }
    svg.addEventListener('pointerdown', (e) => {
      if (over || fx.signal.aborted) return;
      e.preventDefault();
      const [x, y] = toBoard(e);
      if (mode === 'go') {
        const t = moves(st, st.turn).find(([r, c]) => Math.hypot(cx(c) - PAD - x, cy(r) - PAD - y) < CS * 0.55);
        if (!t) return;
        st.pos[st.turn] = t;
        if (t[0] === goalRow(st.turn)) return finish(st.turn);
        next();
        return;
      }
      // Mauer: nächste Kreuzung und Richtung aus der Lage im Feld
      const gx = x / CS, gy = y / CS;
      const fx2 = gx - Math.round(gx), fy2 = gy - Math.round(gy);
      const o = Math.abs(fy2) < Math.abs(fx2) ? 'h' : 'v';
      const R = Math.max(0, Math.min(N - 2, o === 'h' ? Math.round(gy) - 1 : Math.floor(gy - 0.5)));
      const C = Math.max(0, Math.min(N - 2, o === 'h' ? Math.floor(gx - 0.5) : Math.round(gx) - 1));
      const w = `${o} ${R} ${C}`;
      if (ghost === w && !wallProblem(st, w)) return setWall();
      ghost = w; render();
    });
    function setWall() {
      if (!ghost || over) return;
      const p = wallProblem(st, ghost);
      if (p) { toast(p); return; }
      st.walls.set(ghost, st.turn); st.left[st.turn]--;
      ghost = null; mode = 'go';
      next();
    }
    function next() { st.turn = 1 - st.turn; if (mode === 'wall' && !st.left[st.turn]) mode = 'go'; ghost = null; render(); }
    function finish(w) {
      over = true; render();
      msg.textContent = `${P[w].name} ist auf der anderen Seite angekommen!`;
      const walls = WALLS * 2 - st.left[0] - st.left[1];
      setTimeout(() => { ro.disconnect(); resolve({ w, detail: `Ziel erreicht · ${walls} ${walls === 1 ? 'Mauer' : 'Mauern'} gesetzt` }); }, 1000);
    }
    render();
  });
}
