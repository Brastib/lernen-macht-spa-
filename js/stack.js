// Hochstapler: Blöcke fahren hin und her, im richtigen Moment fallen lassen. Was übersteht, wird abgeschnitten.
// Allein (Rekord) oder zu zweit gleichzeitig, jeder tippt auf seine Seite.
import { h, icon } from './ui.js';

const LW = 400, LH = 640, BH = 30, BASE = 220, PERFECT = 5;
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

// kleine Zufallszahlen, die bei gleichem Startwert gleich bleiben (für krakelige Linien)
function wob(seed) { let x = (seed * 2654435761) >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function newLane(p) {
  return { p, tower: [{ x: (LW - BASE) / 2, w: BASE, seed: 1 }], cur: null, dir: 1, falling: [], cam: 0, combo: 0, best: 0, over: false, flash: 0, words: [], shake: 0 };
}
function spawn(L) {
  const n = L.tower.length, top = L.tower[n - 1];
  const speed = Math.min(470, 165 + n * 9);
  L.dir = n % 2 ? 1 : -1;
  L.cur = { x: L.dir > 0 ? -top.w * 0.6 : LW - top.w * 0.4, w: top.w, v: speed * L.dir, seed: n * 7 + 3 };
}
function drop(L) {
  if (!L.cur || L.over) return;
  const top = L.tower[L.tower.length - 1], c = L.cur;
  const y = L.tower.length;
  const a = Math.max(c.x, top.x), b = Math.min(c.x + c.w, top.x + top.w);
  L.cur = null;
  if (b - a <= 0) {
    L.falling.push({ x: c.x, w: c.w, y, vy: 0, vx: c.v * 0.3, rot: 0, vr: Math.sign(c.v) * 2, seed: c.seed });
    L.over = true; L.shake = 1;
    L.words.push({ txt: 'Daneben!', t: 0, x: LW / 2, y });
    return;
  }
  if (Math.abs(c.x - top.x) <= PERFECT) {
    L.combo++;
    let w = top.w, x = top.x;
    if (L.combo >= 3 && w < BASE) { const g = Math.min(10, BASE - w); w += g; x -= g / 2; }
    L.tower.push({ x, w, seed: c.seed });
    L.flash = 1;
    L.words.push({ txt: L.combo >= 3 ? `Perfekt ×${L.combo}` : 'Perfekt!', t: 0, x: x + w / 2, y, good: true });
  } else {
    L.combo = 0;
    L.tower.push({ x: a, w: b - a, seed: c.seed });
    const cut = c.x < a ? { x: c.x, w: a - c.x } : { x: b, w: c.x + c.w - b };
    L.falling.push({ ...cut, y, vy: 0, vx: (c.x < a ? -1 : 1) * 40, rot: 0, vr: (c.x < a ? -1 : 1) * 2.4, seed: c.seed + 1 });
    if (b - a < 18) L.words.push({ txt: 'Knapp!', t: 0, x: (a + b) / 2, y });
  }
  spawn(L);
}
function step(L, dt) {
  if (L.cur) {
    const c = L.cur; c.x += c.v * dt;
    if (c.x > LW - c.w * 0.35 && c.v > 0) c.v = -c.v;
    if (c.x < -c.w * 0.65 && c.v < 0) c.v = -c.v;
  }
  for (const f of L.falling) { f.vy += 1500 * dt; f.y -= f.vy * dt / BH; f.x += f.vx * dt; f.rot += f.vr * dt; }
  L.falling = L.falling.filter((f) => f.y > L.cam - 30);
  const want = Math.max(0, L.tower.length - 9);
  L.cam += (want - L.cam) * Math.min(1, dt * 4);
  L.flash = Math.max(0, L.flash - dt * 2.5); L.shake = Math.max(0, L.shake - dt * 2);
  L.words.forEach((w) => { w.t += dt; }); L.words = L.words.filter((w) => w.t < 1.1);
}

// gezeichneter Block: Farbe, Schraffur, doppelte Bleistiftkante
function sketchBlock(x, X, y0, w, hgt, seed, col, ink, alpha = 1) {
  const r = wob(seed);
  x.save(); x.globalAlpha = alpha;
  x.fillStyle = col; x.globalAlpha = alpha * 0.32; x.fillRect(X, y0, w, hgt);
  x.globalAlpha = alpha * 0.55; x.strokeStyle = col; x.lineWidth = 1.6;
  x.save(); x.beginPath(); x.rect(X, y0, w, hgt); x.clip();
  x.beginPath();
  for (let k = -hgt; k < w; k += 9) { x.moveTo(X + k, y0 + hgt); x.lineTo(X + k + hgt, y0); }
  x.stroke(); x.restore();
  x.globalAlpha = alpha; x.strokeStyle = ink; x.lineJoin = 'round'; x.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const j = () => (r() - 0.5) * (k ? 2.6 : 1.4);
    x.lineWidth = k ? 1.1 : 2.2;
    x.beginPath();
    x.moveTo(X + j(), y0 + j()); x.lineTo(X + w + j(), y0 + j()); x.lineTo(X + w + j(), y0 + hgt + j()); x.lineTo(X + j(), y0 + hgt + j()); x.closePath();
    x.stroke();
  }
  x.restore();
}

function game(fx, players, { solo = false } = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = dark ? '#e8ecf4' : '#26262b', grid = dark ? 'rgba(255,255,255,.06)' : 'rgba(60,100,170,.12)';
    const cv = h('canvas.stkcv');
    const hint = h('div.stkhint', { text: players.length > 1 ? 'Tippt auf eure Seite, um den Block fallen zu lassen' : 'Tippen oder Leertaste: Block fallen lassen' });
    const wrap = h('div.stkwrap', null, cv, hint);
    fx.stage.append(wrap);
    const x = cv.getContext('2d');
    const lanes = players.map(newLane);
    let cw = 0, ch = 0, dpr = 1, raf = 0, last = 0, count = 2.4, done = false;
    const size = () => {
      const r = wrap.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    };
    const ro = new ResizeObserver(size); ro.observe(wrap); size();
    const laneRect = (i) => { const n = lanes.length, w = cw / n; return { x0: i * w, w }; };

    const onDown = (e) => {
      if (count > 0 || done) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const i = Math.min(lanes.length - 1, Math.floor((e.clientX - r.left) / (r.width / lanes.length)));
      drop(lanes[i]);
    };
    const onKey = (e) => {
      if (count > 0 || done || e.repeat) return;
      if (lanes.length === 1 && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); drop(lanes[0]); }
      if (lanes.length === 2 && e.code === 'KeyA') drop(lanes[0]);
      if (lanes.length === 2 && (e.code === 'KeyL' || e.code === 'Enter')) drop(lanes[1]);
    };
    cv.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    fx.signal.addEventListener('abort', () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); });

    function drawLane(L, i) {
      const { x0, w } = laneRect(i);
      const U = Math.min(w / (LW + 40), ch / LH);
      const ox = x0 + (w - LW * U) / 2 + (L.shake ? Math.sin(performance.now() / 20) * 6 * L.shake : 0);
      const groundY = ch - 70 * U;
      const Y = (row) => groundY - (row - L.cam) * BH * U;           // Unterkante der Reihe row
      x.save();
      x.beginPath(); x.rect(x0, 0, w, ch); x.clip();
      // Tisch
      const gy = Y(0) + BH * U;
      if (gy < ch + 40) {
        x.strokeStyle = ink; x.lineWidth = 2.4; x.lineCap = 'round';
        x.beginPath(); x.moveTo(x0 + 16, gy + 1); x.lineTo(x0 + w - 16, gy - 1); x.moveTo(x0 + 20, gy + 6); x.lineTo(x0 + w - 24, gy + 5); x.stroke();
        x.lineWidth = 1.4; x.beginPath();
        for (let k = x0 + 30; k < x0 + w - 20; k += 22) { x.moveTo(k, gy + 8); x.lineTo(k - 12, gy + 22); }
        x.stroke();
      }
      // Turm
      L.tower.forEach((b, row) => {
        const y = Y(row);
        if (y < -BH * U || y > ch + BH * U) return;
        sketchBlock(x, ox + b.x * U, y, b.w * U, BH * U, b.seed, row ? L.p.color : (dark ? '#8a8f98' : '#6a6f78'), ink);
      });
      if (L.flash) { const t = L.tower[L.tower.length - 1]; x.save(); x.globalAlpha = L.flash * 0.8; x.strokeStyle = '#f2b632'; x.lineWidth = 4; x.strokeRect(ox + t.x * U - 4, Y(L.tower.length - 1) - 4, t.w * U + 8, BH * U + 8); x.restore(); }
      if (L.cur) sketchBlock(x, ox + L.cur.x * U, Y(L.tower.length), L.cur.w * U, BH * U, L.cur.seed, L.p.color, ink);
      for (const f of L.falling) {
        x.save(); const cx = ox + (f.x + f.w / 2) * U, cy = Y(f.y) + BH * U / 2;
        x.translate(cx, cy); x.rotate(f.rot);
        sketchBlock(x, -f.w * U / 2, -BH * U / 2, f.w * U, BH * U, f.seed, L.p.color, ink, 0.85);
        x.restore();
      }
      // Wörter
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const wd of L.words) {
        const a = 1 - wd.t / 1.1;
        x.globalAlpha = Math.max(0, a);
        x.font = `800 ${Math.round(22 * Math.max(0.8, U))}px "Noteworthy","Marker Felt","Segoe Print",system-ui,sans-serif`;
        x.fillStyle = wd.good ? '#e0a106' : '#e04848';
        x.fillText(wd.txt, ox + Math.max(60, Math.min(LW - 60, wd.x)) * U, Y(wd.y) - 26 * U - wd.t * 40);
      }
      x.globalAlpha = 1;
      // Kopf: Name und Höhe
      const n = L.tower.length - 1;
      x.font = `700 15px system-ui, -apple-system, sans-serif`; x.textAlign = 'left'; x.fillStyle = ink;
      x.beginPath(); x.fillStyle = L.p.color; x.arc(x0 + 26, 30, 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = ink; x.fillText(L.p.name, x0 + 40, 31);
      x.textAlign = 'right'; x.font = `800 30px system-ui, -apple-system, sans-serif`;
      x.fillText(String(n), x0 + w - 22, 34);
      x.font = `600 12px system-ui, -apple-system, sans-serif`; x.globalAlpha = 0.6;
      x.fillText(n === 1 ? 'Block' : 'Blöcke', x0 + w - 22, 58);
      if (solo && L.rec) x.fillText(`Rekord ${L.rec}`, x0 + w - 22, 76);
      x.globalAlpha = 1;
      if (L.over && lanes.length > 1) {
        x.fillStyle = dark ? 'rgba(20,22,28,.6)' : 'rgba(255,255,255,.6)'; x.fillRect(x0, 0, w, ch);
        x.fillStyle = ink; x.textAlign = 'center'; x.font = `800 26px system-ui, -apple-system, sans-serif`;
        x.fillText(`${n} ${n === 1 ? 'Block' : 'Blöcke'}`, x0 + w / 2, ch / 2 - 10);
        x.font = `600 15px system-ui, -apple-system, sans-serif`; x.globalAlpha = 0.7;
        x.fillText(lanes.every((l) => l.over) ? '' : 'Warte auf die andere Seite …', x0 + w / 2, ch / 2 + 22);
        x.globalAlpha = 1;
      }
      x.restore();
      if (i > 0) { x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 2; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0, ch); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      if (count > 0) { count -= dt; if (count <= 0) { lanes.forEach(spawn); hint.classList.add('fade'); } }
      lanes.forEach((L) => step(L, dt));
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; x.fillRect(0, 0, cw, ch);
      x.strokeStyle = grid; x.lineWidth = 1; x.beginPath();
      for (let gx = 0; gx < cw; gx += 24) { x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, ch); }
      for (let gy = 0; gy < ch; gy += 24) { x.moveTo(0, gy + 0.5); x.lineTo(cw, gy + 0.5); }
      x.stroke();
      lanes.forEach(drawLane);
      if (count > 0) {
        x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 64px system-ui, -apple-system, sans-serif`;
        x.fillText(String(Math.ceil(count / 0.8)), cw / 2, ch / 2);
      }
      if (!done && lanes.every((L) => L.over) && lanes.every((L) => !L.falling.length)) {
        done = true;
        setTimeout(() => {
          cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey);
          const s = lanes.map((L) => L.tower.length - 1);
          if (solo) resolve({ score: s[0] });
          else resolve({ w: s[0] === s[1] ? null : s[0] > s[1] ? 0 : 1, detail: `${s[0]} zu ${s[1]} Blöcke` });
        }, 500);
      }
      raf = requestAnimationFrame(frame);
    }
    if (solo) lanes[0].rec = store.get('gStackBest', 0);
    raf = requestAnimationFrame(frame);
  });
}

export const stackDuel = (fx, A, B) => game(fx, [A, B]);

// Allein: so hoch wie möglich, Rekord bleibt gespeichert
export async function stackSolo(fx, p) {
  for (;;) {
    fx.stage.replaceChildren();
    const r = await game(fx, [p], { solo: true });
    if (!r || fx.signal.aborted) return;
    const best = store.get('gStackBest', 0), rec = r.score > best;
    if (rec) store.set('gStackBest', r.score);
    const again = await new Promise((res) => {
      fx.stage.append(h('div.gres', null, h('div.grescard', null,
        h('span.gresic', { style: { color: rec ? '#e0a106' : p.color } }, icon(rec ? 'trophy' : 'stack')),
        h('b', { text: `${r.score} ${r.score === 1 ? 'Block' : 'Blöcke'}` }),
        h('small', { text: rec ? (best ? `Neuer Rekord! Vorher ${best}.` : 'Dein erster Rekord.') : `Rekord: ${best}` }),
        h('div.gresbtns', null,
          h('button.btn', { text: 'Fertig', on: { click: () => res(false) } }),
          h('button.btn.primary', { text: 'Nochmal', on: { click: () => res(true) } })))));
    });
    if (!again) { fx.close(); return; }
  }
}
