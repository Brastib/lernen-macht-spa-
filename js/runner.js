// Kritzelsprint: Eine Strichfigur rennt über den Schreibtisch. Tippen = springen (lange halten = höher).
// Über Radiergummis, Bücher und Stifte springen, unter hohen Papierfliegern durchlaufen.
// Allein (Rekord) oder zu zweit gleichzeitig auf derselben Strecke, jeder tippt auf seine Hälfte.
import { h, icon } from './ui.js';

const LH = 300, GROUND = 236, FH = 62, GRAV = 2700, JUMP = 820;
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BOOKS = ['#2f4a7a', '#8b2e3c', '#2c6b57', '#b8772a', '#4b3f72'];

// Strecke: für beide Spieler gleich (gleicher Startwert)
function course(seed) {
  const R = rng(seed), list = [];
  let x = 700;
  return (upto) => {
    while (x < upto) {
      const lvl = Math.min(1, x / 30000), r = R();
      let o;
      if (r < 0.26) o = { k: 'eraser', w: 38, h: 22 };
      else if (r < 0.48) { const n = 1 + ((R() * (1 + lvl * 2.2)) | 0); o = { k: 'books', w: 46, h: 16 * n, n, c: [0, 1, 2].map(() => BOOKS[(R() * BOOKS.length) | 0]) }; }
      else if (r < 0.62) o = { k: 'pencil', w: 14, h: 52 + R() * 10 };
      else if (r < 0.8 && x > 2500) o = { k: 'plane', w: 46, h: 16, fly: R() < 0.5 ? 'low' : 'high' };
      else o = { k: 'sharp', w: 26, h: 26 };
      o.x = x; o.y = o.fly === 'high' ? GROUND - 96 : o.fly === 'low' ? GROUND - 34 : GROUND - o.h;
      list.push(o);
      x += 360 + R() * 340 + lvl * 260 + (o.k === 'books' && o.n > 2 ? 120 : 0);
    }
    return list;
  };
}

function newLane(p, i) {
  return { p, i, y: GROUND, vy: 0, hold: false, air: false, dead: false, dist: 0, leg: 0, puffs: [], deadT: 0, land: 0 };
}

function game(fx, players, { solo = false } = {}) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = dark ? '#e8ecf4' : '#26262b';
    const cv = h('canvas.stkcv');
    const hint = h('div.stkhint', { text: players.length > 1 ? 'Tippt auf eure Hälfte zum Springen. Lange halten springt höher.' : 'Tippen oder Leertaste: springen. Lange halten springt höher.' });
    const wrap = h('div.stkwrap', null, cv, hint);
    fx.stage.append(wrap);
    const x = cv.getContext('2d');
    const lanes = players.map(newLane);
    const obs = course((Math.random() * 1e9) | 0);
    let cw = 0, ch = 0, dpr = 1, raf = 0, last = 0, count = 2.4, done = false, speed = 340, scroll = 0, rec = store.get('gRunBest', 0);
    const size = () => {
      const r = wrap.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    };
    const ro = new ResizeObserver(size); ro.observe(wrap); size();

    const jump = (L) => { if (count > 0 || L.dead) return; L.hold = true; if (!L.air) { L.vy = -JUMP; L.air = true; } };
    const release = (L) => { L.hold = false; if (L.vy < -580) L.vy = -580; };   // kurz tippen = kleiner Sprung
    const laneAt = (e) => { const r = cv.getBoundingClientRect(), n = lanes.length; return lanes[n - 1 - Math.min(n - 1, Math.floor((e.clientY - r.top) / (r.height / n)))]; };   // A ist unten
    const down = new Map();
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); const L = laneAt(e); down.set(e.pointerId, L); jump(L); });
    const up = (e) => { const L = down.get(e.pointerId); if (L) { down.delete(e.pointerId); release(L); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const keyLane = (e) => (lanes.length === 1 ? ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') ? lanes[0] : null) : e.code === 'KeyA' ? lanes[0] : (e.code === 'KeyL' || e.code === 'Enter') ? lanes[1] : null);
    const onKey = (e) => { const L = keyLane(e); if (!L) return; e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) jump(L); } else release(L); };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); };
    fx.signal.addEventListener('abort', cleanup);

    const PX = 120;   // Position der Figur in der Spur
    function hits(L, list) {
      if (L.dead) return false;
      const fx0 = scroll + PX - 12, fx1 = scroll + PX + 12, fy0 = L.y - FH + 6, fy1 = L.y;
      return list.some((o) => o.x + 4 < fx1 && o.x + o.w - 4 > fx0 && o.y + 3 < fy1 && o.y + o.h - 2 > fy0);
    }
    function step(dt) {
      if (count > 0) { count -= dt; if (count <= 0) hint.classList.add('fade'); return; }
      const alive = lanes.filter((L) => !L.dead);
      if (alive.length) { speed = Math.min(880, speed + dt * 11); scroll += speed * dt; }
      const list = obs(scroll + 1600).filter((o) => o.x > scroll - 200);
      for (const L of lanes) {
        L.puffs.forEach((q) => { q.t += dt; q.x -= (L.dead ? 0 : speed) * dt * 0.3; }); L.puffs = L.puffs.filter((q) => q.t < 0.5);
        if (L.dead) { L.deadT += dt; L.vy += GRAV * dt; L.y = Math.min(GROUND + 40, L.y + L.vy * dt); continue; }
        L.dist = scroll;
        L.vy += GRAV * (L.hold && L.vy < 0 ? 0.72 : 1) * dt;
        L.y += L.vy * dt;
        if (L.y >= GROUND) { if (L.air) { L.land = 1; L.puffs.push({ x: PX - 8, t: 0 }, { x: PX + 8, t: 0 }); } L.y = GROUND; L.vy = 0; L.air = false; }
        L.land = Math.max(0, L.land - dt * 5);
        L.leg += dt * speed * 0.035;
        if (hits(L, list)) { L.dead = true; L.vy = -500; L.deadT = 0; L.score = Math.floor(scroll / 10); }
      }
      if (!done && lanes.every((L) => L.dead && L.deadT > 0.9)) {
        done = true;
        setTimeout(() => {
          cleanup();
          const s = lanes.map((L) => L.score);
          if (solo) resolve({ score: s[0] });
          else resolve({ w: s[0] === s[1] ? null : s[0] > s[1] ? 0 : 1, detail: `${s[0]} m zu ${s[1]} m` });
        }, 300);
      }
    }

    // ---------- Zeichnen ----------
    const line = (pts, w = 2.2) => { x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); };
    function drawObs(o, X) {
      x.save(); x.strokeStyle = ink; x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = 2;
      if (o.k === 'eraser') {
        x.fillStyle = '#f2a0a8'; x.fillRect(X, o.y, o.w * 0.55, o.h); x.fillStyle = '#7fa8e0'; x.fillRect(X + o.w * 0.55, o.y, o.w * 0.45, o.h);
        x.strokeRect(X, o.y, o.w, o.h);
      } else if (o.k === 'books') {
        for (let i = 0; i < o.n; i++) { const by = o.y + o.h - (i + 1) * 16, off = (i % 2 ? 3 : -2); x.fillStyle = o.c[i % 3]; x.fillRect(X + off, by, o.w, 15); x.strokeRect(X + off, by, o.w, 15); x.strokeStyle = 'rgba(255,255,255,.5)'; line([[X + off + 6, by + 5], [X + off + o.w - 6, by + 5]], 1.2); x.strokeStyle = ink; }
      } else if (o.k === 'pencil') {
        x.fillStyle = '#f4c430'; x.fillRect(X, o.y + 12, o.w, o.h - 12); x.strokeRect(X, o.y + 12, o.w, o.h - 12);
        x.fillStyle = '#f1d7b0'; x.beginPath(); x.moveTo(X, o.y + 12); x.lineTo(X + o.w / 2, o.y); x.lineTo(X + o.w, o.y + 12); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = ink; x.beginPath(); x.moveTo(X + o.w / 2 - 2.5, o.y + 4); x.lineTo(X + o.w / 2, o.y); x.lineTo(X + o.w / 2 + 2.5, o.y + 4); x.fill();
      } else if (o.k === 'sharp') {
        x.fillStyle = dark ? '#7d8796' : '#a7b0bd'; x.fillRect(X, o.y + 4, o.w, o.h - 4); x.strokeRect(X, o.y + 4, o.w, o.h - 4);
        x.beginPath(); x.arc(X + o.w / 2, o.y + o.h / 2 + 2, 5, 0, Math.PI * 2); x.stroke();
      } else if (o.k === 'plane') {
        x.fillStyle = dark ? '#d9dee8' : '#fff';
        x.beginPath(); x.moveTo(X, o.y + 8); x.lineTo(X + o.w, o.y); x.lineTo(X + o.w * 0.7, o.y + o.h); x.closePath(); x.fill(); x.stroke();
        line([[X, o.y + 8], [X + o.w * 0.62, o.y + 9]], 1.4);
        x.globalAlpha = 0.4; line([[X + o.w + 6, o.y + 3], [X + o.w + 22, o.y + 1]], 1.4); line([[X + o.w + 4, o.y + 9], [X + o.w + 16, o.y + 9]], 1.4);
      }
      x.restore();
    }
    function drawRunner(L, X) {
      const y = L.y, c = L.p.color, s = Math.sin(L.leg), sq = L.land * 5;
      x.save(); x.strokeStyle = c; x.lineCap = 'round'; x.lineJoin = 'round';
      if (L.dead) { x.translate(X, y - FH / 2); x.rotate(Math.min(1.5, L.deadT * 5)); x.translate(-X, -(y - FH / 2)); }
      const hip = [X, y - 24 + sq], neck = [X + 4, y - 46 + sq];
      if (L.air && !L.dead) { line([hip, [X + 12, y - 14], [X + 6, y - 4]], 4); line([hip, [X - 10, y - 12], [X - 18, y - 6]], 4); }
      else { line([hip, [X + s * 12, y - 10], [X + s * 16, y]], 4); line([hip, [X - s * 12, y - 10], [X - s * 16 - 2, y]], 4); }
      line([hip, neck], 4);
      const a = L.air ? -1.2 : Math.cos(L.leg) * 0.9;
      line([[neck[0], neck[1] + 4], [neck[0] + 12 * Math.cos(a), neck[1] + 4 + 12 * Math.sin(a) + 8]], 3.6);
      line([[neck[0], neck[1] + 4], [neck[0] - 12 * Math.cos(a), neck[1] + 4 - 12 * Math.sin(a) + 8]], 3.6);
      x.lineWidth = 4; x.beginPath(); x.arc(X + 7, y - 55 + sq, 8, 0, Math.PI * 2); x.stroke();
      x.fillStyle = c; x.beginPath(); x.arc(X + 10, y - 57 + sq, 1.8, 0, Math.PI * 2); x.fill();
      x.restore();
      x.fillStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.18)';
      for (const q of L.puffs) { x.globalAlpha = 1 - q.t / 0.5; x.beginPath(); x.arc(q.x + (q.x < PX ? -q.t * 30 : q.t * 30), GROUND - 3 - q.t * 10, 4 + q.t * 10, 0, Math.PI * 2); x.fill(); }
      x.globalAlpha = 1;
    }
    function drawLane(L, k) {
      const n = lanes.length, top = k * ch / n, hh = ch / n;
      const U = Math.min(hh / LH, cw / 560);
      x.save(); x.beginPath(); x.rect(0, top, cw, hh); x.clip();
      x.translate(0, top + (hh - LH * U) / 2); x.scale(U, U);
      const W = cw / U;
      // Tisch-Kante, Holzmaserung
      x.strokeStyle = ink; x.lineCap = 'round';
      const off = scroll % 60;
      line([[0, GROUND + 1], [W, GROUND + 1]], 2.4);
      x.globalAlpha = 0.35; x.lineWidth = 1.4; x.beginPath();
      for (let gx = -off; gx < W + 60; gx += 60) { x.moveTo(gx, GROUND + 12); x.lineTo(gx - 16, GROUND + 30); }
      x.stroke(); x.globalAlpha = 1;
      // Hindernisse
      for (const o of obs(scroll + W + 200)) { const X = o.x - scroll; if (X > -80 && X < W + 40) drawObs(o, X); }
      drawRunner(L, PX);
      // Kopf: Name und Meter
      x.fillStyle = ink; x.textBaseline = 'middle';
      x.font = '700 15px system-ui, -apple-system, sans-serif'; x.textAlign = 'left';
      x.fillStyle = L.p.color; x.beginPath(); x.arc(22, 26, 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = ink; x.fillText(L.p.name, 36, 27);
      const m = L.dead ? L.score : Math.floor(scroll / 10);
      x.textAlign = 'right'; x.font = '800 28px system-ui, -apple-system, sans-serif'; x.fillText(`${m} m`, W - 20, 30);
      if (solo && rec) { x.font = '600 12px system-ui, -apple-system, sans-serif'; x.globalAlpha = 0.6; x.fillText(`Rekord ${rec} m`, W - 20, 56); x.globalAlpha = 1; }
      if (L.dead && n > 1 && L.deadT > 0.5) {
        x.fillStyle = dark ? 'rgba(20,22,28,.55)' : 'rgba(255,255,255,.6)'; x.fillRect(0, 0, W, LH);
        x.fillStyle = ink; x.textAlign = 'center'; x.font = '800 24px system-ui, -apple-system, sans-serif';
        x.fillText(`${L.score} m`, W / 2, LH / 2 - 8);
        if (!lanes.every((q) => q.dead)) { x.font = '600 14px system-ui, -apple-system, sans-serif'; x.globalAlpha = 0.7; x.fillText('Warte auf die andere Hälfte …', W / 2, LH / 2 + 20); x.globalAlpha = 1; }
      }
      x.restore();
      if (k > 0) { x.strokeStyle = ink; x.globalAlpha = 0.35; x.lineWidth = 2; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(0, top); x.lineTo(cw, top); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
    }
    function frame(t) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.04, last ? (t - last) / 1000 : 0); last = t;
      step(dt);
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; x.fillRect(0, 0, cw, ch);
      x.strokeStyle = dark ? 'rgba(255,255,255,.06)' : 'rgba(60,100,170,.12)'; x.lineWidth = 1; x.beginPath();
      const go = (scroll * 0.5) % 24;
      for (let gx = -go; gx < cw; gx += 24) { x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, ch); }
      for (let gy = 0; gy < ch; gy += 24) { x.moveTo(0, gy + 0.5); x.lineTo(cw, gy + 0.5); }
      x.stroke();
      // Reihenfolge: Spieler 1 (A) unten
      [...lanes].reverse().forEach((L, k) => drawLane(L, k));
      if (count > 0) { x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 64px system-ui, -apple-system, sans-serif'; x.fillText(String(Math.ceil(count / 0.8)), cw / 2, ch / 2); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

export const runDuel = (fx, A, B) => game(fx, [A, B]);
export const runSolo = (fx, p) => game(fx, [p], { solo: true });
