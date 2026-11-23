// Strichkampf: gemalte Strichmännchen mit gemalten Waffen kämpfen in der Arena.
import { h, icon, toast } from './ui.js';
import { paintSheet } from './gpaint.js';

const S = 600, KW = 150 / 450;            // Malfläche → Arena-Einheiten
const GROUND = 520, FIG_H = 150, GRIP = [0.2, 0.8];
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Kein Platz mehr zum Sichern.'); return false; } },
};
const fighters = () => store.get('gFighters', {});
const key = (p) => p.name.toLowerCase();
function getFighter(p) { return fighters()[key(p)] || {}; }
function setPart(p, part, val) {
  const all = fighters(), f = all[key(p)] || {};
  if (val) f[part] = val; else delete f[part];
  all[key(p)] = f;
  return store.set('gFighters', all);
}

// Werte der Waffe aus der Zeichnung: lang = mehr Reichweite, dick = mehr Schaden, aber langsamer
export function weaponStats(info) {
  const len = Math.max(0.2, info.len || 0.5);
  const thick = (info.n || 400) * 4 / (len * S);
  const weight = Math.max(0, Math.min(1, (thick - 8) / 40));
  return { len, weight, reach: len * S * KW, dmg: 7 + 11 * weight + 5 * len, swing: 0.28 + 0.4 * weight + 0.15 * len };
}
const bar = (label, v) => h('span.paintstat', null, h('small', { text: label }), h('span.pbar', null, h('i', { style: { width: Math.round(Math.max(0.06, Math.min(1, v)) * 100) + '%' } })));
const statBars = (st) => [bar('Reichweite', st.len / 0.95), bar('Schaden', (st.dmg - 7) / 16), bar('Tempo', 1 - (st.swing - 0.28) / 0.6)];

// Standard-Figur und -Waffe, falls nichts gemalt ist
function defFigure(color, ghost = false) {
  const c = document.createElement('canvas'); c.width = 200; c.height = 300;
  const x = c.getContext('2d');
  x.strokeStyle = ghost ? '#1d1d1f' : color; x.lineWidth = 14; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.arc(100, 50, 36, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(100, 88); x.lineTo(100, 190); x.moveTo(100, 115); x.lineTo(40, 160); x.moveTo(100, 115); x.lineTo(160, 150);
  x.moveTo(100, 190); x.lineTo(55, 290); x.moveTo(100, 190); x.lineTo(145, 290); x.stroke();
  if (!ghost) { x.fillStyle = color; x.beginPath(); x.arc(112, 44, 6, 0, Math.PI * 2); x.fill(); }
  return { url: c.toDataURL('image/png'), w: 200 / 300 * 0.6, h: 0.6 };
}
function defWeapon() {
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const x = c.getContext('2d');
  const gx = GRIP[0] * S, gy = GRIP[1] * S, a = -Math.PI / 4, L = 230;
  const px = (d, o = 0) => [gx + Math.cos(a) * d - Math.sin(a) * o, gy + Math.sin(a) * d + Math.cos(a) * o];
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = '#6b4a2b'; x.lineWidth = 16; x.beginPath(); x.moveTo(...px(0)); x.lineTo(...px(40)); x.stroke();
  x.strokeStyle = '#8a8f98'; x.lineWidth = 12; x.beginPath(); x.moveTo(...px(40, -30)); x.lineTo(...px(40, 30)); x.stroke();
  x.fillStyle = '#d9dee6'; x.strokeStyle = '#5d6470'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(...px(44, -11)); x.lineTo(...px(L - 25, -11)); x.lineTo(...px(L, 0)); x.lineTo(...px(L - 25, 11)); x.lineTo(...px(44, 11)); x.closePath(); x.fill(); x.stroke();
  // zuschneiden wie beim Malen
  const x0 = gx - 30, y0 = gy - L * 0.72 - 30, w = L * 0.72 + 60, hh = L * 0.72 + 60;
  const o = document.createElement('canvas'); o.width = Math.round(w); o.height = Math.round(hh);
  o.getContext('2d').drawImage(c, x0, y0, w, hh, 0, 0, w, hh);
  return { url: o.toDataURL('image/png'), w: w / S, h: hh / S, grip: [(gx - x0) / w, (gy - y0) / hh], info: { len: L / S, n: 1400, ang: a } };
}
const loadImg = (url) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = url; });

async function editFigure(p) {
  const f = getFighter(p);
  const r = await paintSheet({ title: `Kämpfer für ${p.name}`, color: p.color, old: f.fig && f.fig.url, min: 0.55, saveLabel: 'Kämpfer sichern', removeLabel: 'Standard-Figur',
    ghost: defFigure('#000', true).url,
    text: 'Mal dein Strichmännchen. Es schaut nach rechts. Die Waffe malst du gleich extra. Die Figur muss mindestens bis zur gestrichelten Linie reichen.' });
  if (r === 'remove') return setPart(p, 'fig', null);
  if (r) return setPart(p, 'fig', { url: r.url, w: r.w, h: r.h });
  return false;
}
async function editWeapon(p) {
  const f = getFighter(p);
  const r = await paintSheet({ title: `Waffe für ${p.name}`, color: '#1d1d1f', old: f.weap && f.weap.url, oldGrip: f.weap && f.weap.grip, min: 0.3, grip: GRIP, saveLabel: 'Waffe sichern', removeLabel: 'Standard-Schwert',
    small: 'Noch zu kurz. Mal die Waffe mindestens bis zum gestrichelten Kreis.', empty: 'Fang beim roten Punkt an, dort hält die Figur die Waffe.',
    stats: (info) => statBars(weaponStats(info)),
    text: 'Mal die Waffe vom Griff (roter Punkt) aus. Lang heißt mehr Reichweite, dick und schwer heißt mehr Schaden, aber langsamer.' });
  if (r === 'remove') return setPart(p, 'weap', null);
  if (r) return setPart(p, 'weap', { url: r.url, w: r.w, h: r.h, grip: r.grip, info: r.info });
  return false;
}

async function makeFighter(p, side) {
  const f = getFighter(p);
  const fig = f.fig || defFigure(p.color), weap = f.weap || defWeapon();
  const [img, wimg] = await Promise.all([loadImg(fig.url), loadImg(weap.url)]);
  const st = weaponStats(weap.info || {});
  const fw = Math.min(170, Math.max(40, FIG_H * fig.w / fig.h));
  return {
    p, img, wimg, st, fw, fh: FIG_H, bw: Math.max(36, Math.min(100, fw * 0.6)),
    ww: weap.w * S * KW, wh: weap.h * S * KW, grip: weap.grip || [0, 1], wang0: (weap.info && weap.info.ang) || -Math.PI / 4,
    x: 0, y: GROUND, vx: 0, vy: 0, face: side ? -1 : 1, hp: 100, cd: 0.6 + Math.random() * 0.4, swing: -1, hit: false, hurt: 0, ko: false, rot: 0, tapCd: 0, jumpT: 1 + Math.random() * 2, t: Math.random() * 10,
  };
}

// Waffenwinkel während des Schlags (0..1): ausholen, zuschlagen, zurück
function swingAngle(k) {
  const rest = -1.05, back = -2.25, hit = 0.7;
  if (k < 0) return rest;
  if (k < 0.3) return rest + (back - rest) * (k / 0.3);
  if (k < 0.62) { const e = (k - 0.3) / 0.32; return back + (hit - back) * (1 - (1 - e) * (1 - e)); }
  return hit + (rest - hit) * ((k - 0.62) / 0.38);
}

export function arena(fx, A, B) {
  return new Promise((resolve) => {
    const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const prep = h('div.arprep');
    fx.stage.append(prep);

    // ---------- Vorbereitung: Figur und Waffe malen ----------
    async function drawPrep() {
      const cards = await Promise.all([A, B].map(async (p, i) => {
        const f = getFighter(p), F = await makeFighter(p, i);
        const cv = h('canvas.arprev', { width: 440, height: 400 });
        renderPreview(cv, F);
        const st = F.st;
        return h('div.arcard', null,
          h('div.arcardhead', null, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name })),
          cv,
          h('div.paintstats', null, ...statBars(st)),
          h('div.arbtns', null,
            h('button.btn', { on: { click: async () => { if (await editFigure(p)) drawPrep(); } } }, icon('pen'), f.fig ? 'Figur ändern' : 'Figur malen'),
            h('button.btn', { on: { click: async () => { if (await editWeapon(p)) drawPrep(); } } }, icon('edit'), f.weap ? 'Waffe ändern' : 'Waffe malen')));
      }));
      if (fx.signal.aborted) return;
      prep.replaceChildren(
        h('div.arcards', null, ...cards),
        h('p.calm.arhint', { text: 'Die Kämpfer kämpfen von allein. Tippt auf eure Bildschirmseite für einen Sprung-Angriff (oder Taste A und L).' }),
        h('button.btn.primary.arstart', { on: { click: start } }, icon('play'), 'Kampf starten'));
    }
    function renderPreview(cv, F) {
      const x = cv.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
      const k = cv.height / 260;
      x.setTransform(k, 0, 0, k, 0, 0);
      const f = { ...F, x: cv.width / k / 2 - 20, y: 230, face: 1, swing: -1 };
      drawFighter(x, f, 0);
      x.strokeStyle = dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 232); x.lineTo(cv.width / k - 20, 232); x.stroke();
    }
    drawPrep();

    // ---------- Kampf ----------
    let cv, ctx, hud, raf = 0, last = 0, W = 1000, U = 1, F = [], parts = [], pops = [], shake = 0, slow = 1, timeLeft = 60, over = false, started = 0;
    async function start() {
      F = await Promise.all([makeFighter(A, 0), makeFighter(B, 1)]);
      if (fx.signal.aborted) return;
      prep.remove();
      cv = h('canvas.arcv');
      const hpEl = (f, i) => h('div.arhp' + (i ? '.r' : ''), null, h('div.arhpname', null, h('span.gdot', { style: { background: f.p.color } }), h('b', { text: f.p.name })), h('div.arhpbar', null, h('i', { style: { background: f.p.color } })));
      const timer = h('div.artime', { text: '60' });
      hud = { el: h('div.arhud', null, hpEl(F[0], 0), timer, hpEl(F[1], 1)), timer };
      const tip = h('p.artip', { text: 'Tippt auf eure Seite: Sprung-Angriff' });
      const wrap = h('div.arwrap', null, cv, hud.el, tip);
      fx.stage.append(wrap);
      ctx = cv.getContext('2d');
      const size = () => {
        const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
        U = r.height / 600; W = r.width / U;
        ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
        if (!started) { F[0].x = W * 0.25; F[1].x = W * 0.75; }
      };
      const ro = new ResizeObserver(size); ro.observe(wrap); size();
      wrap.addEventListener('pointerdown', (e) => { const r = wrap.getBoundingClientRect(); tap(e.clientX - r.left < r.width / 2 ? 0 : 1); setTimeout(() => tip.classList.add('gone'), 1500); });
      const onKey = (e) => { if (e.key === 'a' || e.key === 'A') tap(0); if (e.key === 'l' || e.key === 'L') tap(1); };
      document.addEventListener('keydown', onKey);
      const cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', onKey); };
      fx.signal.addEventListener('abort', cleanup);
      finish.cleanup = cleanup;
      started = performance.now(); last = started;
      raf = requestAnimationFrame(loop);
    }
    function finish(w) {
      if (over) return; over = true;
      setTimeout(() => {
        if (fx.signal.aborted) return;
        finish.cleanup && finish.cleanup();
        const [a, b] = F.map((f) => Math.max(0, Math.round(f.hp)));
        resolve({ w, detail: w == null ? `Zeit um · ${a} : ${b} Leben` : `${(w ? F[1] : F[0]).p.name} hat noch ${w ? b : a} Leben` });
      }, 1600);
    }
    function tap(i) {
      const f = F[i];
      if (!f || f.ko || over || f.tapCd > 0) return;
      f.tapCd = 0.7;
      if (f.y >= GROUND - 1) { f.vy = -640; f.vx = f.face * 320; }
      if (f.swing < 0) { f.swing = 0; f.hit = false; f.cd = 0; }
    }
    function loop(now) {
      if (fx.signal.aborted) return;
      const real = Math.min(0.033, (now - last) / 1000); last = now;
      const dt = real * slow;
      step(dt, real); draw();
      raf = requestAnimationFrame(loop);
    }
    function step(dt, real) {
      if (!over) { timeLeft -= dt; hud.timer.textContent = String(Math.max(0, Math.ceil(timeLeft))); if (timeLeft <= 0) { const [a, b] = F; finish(Math.abs(a.hp - b.hp) < 1 ? null : a.hp > b.hp ? 0 : 1); } }
      shake = Math.max(0, shake - real * 3);
      if (slow < 1) slow = Math.min(1, slow + real * 0.5);
      F.forEach((f, i) => think(f, F[1 - i], dt));
      // nicht ineinander laufen
      const [a, b] = F, gap = (a.bw + b.bw) / 2 * 0.9, d = b.x - a.x;
      if (Math.abs(d) < gap && !a.ko && !b.ko) { const push = (gap - Math.abs(d)) / 2 * Math.sign(d || 1); a.x -= push; b.x += push; }
      for (const f of F) { f.x = Math.max(f.bw / 2 + 20, Math.min(W - f.bw / 2 - 20, f.x)); }
      parts.forEach((q) => { q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.t += dt; });
      parts = parts.filter((q) => q.t < 0.8);
      pops.forEach((q) => { q.t += real; });
      pops = pops.filter((q) => q.t < 0.8);
      hud.el.querySelectorAll('.arhpbar i').forEach((el, i) => { el.style.width = Math.max(0, F[i].hp) + '%'; });
    }
    function think(f, o, dt) {
      f.t += dt; f.tapCd = Math.max(0, f.tapCd - dt); f.cd -= dt; f.hurt = Math.max(0, f.hurt - dt);
      const onGround = f.y >= GROUND - 0.5;
      if (f.ko) {
        f.rot += (f.face * -1.45 - f.rot) * Math.min(1, dt * 6);
      } else if (!over) {
        f.face = o.x >= f.x ? 1 : -1;
        const dist = Math.abs(o.x - f.x) - o.bw / 2;
        if (f.swing < 0 && f.hurt <= 0 && onGround) {
          if (dist > f.st.reach * 0.8) f.vx += (f.face * 190 - f.vx) * Math.min(1, dt * 6);
          else {
            f.vx *= 1 - Math.min(1, dt * 8);
            if (f.cd <= 0) { f.swing = 0; f.hit = false; }
          }
          f.jumpT -= dt;
          if (f.jumpT <= 0) { f.jumpT = 1.5 + Math.random() * 2.5; if (Math.random() < 0.55) { f.vy = -560; f.vx = f.face * (120 + Math.random() * 120); } }
        }
      }
      // Schlag
      if (f.swing >= 0) {
        f.swing += dt / f.st.swing;
        if (!f.hit && f.swing > 0.32 && f.swing < 0.68 && !o.ko && !f.ko) {
          const pts = weaponPts(f);
          if (pts.some(([px, py]) => Math.abs(px - o.x) < o.bw / 2 + 4 && py > o.y - o.fh && py < o.y + 4)) hitFoe(f, o, pts[pts.length - 1]);
        }
        if (f.swing >= 1) { f.swing = -1; f.cd = 0.35 + Math.random() * 0.5; }
      }
      // Bewegung
      f.vy += 1800 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > GROUND) { f.y = GROUND; f.vy = 0; if (f.ko || f.hurt > 0 || f.swing >= 0) f.vx *= 1 - Math.min(1, dt * 7); }
    }
    function weaponPts(f) {
      const phi = swingAngle(f.swing), hx = f.fw * 0.3, hy = -f.fh * 0.55;
      return [0.45, 0.72, 1].map((t) => [f.x + f.face * (hx + Math.cos(phi) * f.st.reach * t), f.y + hy + Math.sin(phi) * f.st.reach * t]);
    }
    function hitFoe(f, o, at) {
      f.hit = true;
      const air = f.y < GROUND - 10 ? 1.25 : 1;
      const dmg = f.st.dmg * air * (0.9 + Math.random() * 0.2);
      o.hp -= dmg; o.hurt = 0.35;
      o.vx = f.face * (260 + 240 * f.st.weight); o.vy = -260 - 140 * f.st.weight;
      shake = Math.min(1, 0.4 + dmg / 30);
      for (let i = 0; i < 14; i++) parts.push({ x: at[0], y: at[1], vx: (Math.random() - 0.5) * 420 + f.face * 160, vy: -Math.random() * 380, t: Math.random() * 0.2, c: Math.random() < 0.5 ? f.p.color : (dark ? '#e8ecf4' : '#1d1d1f'), r: 2 + Math.random() * 4 });
      const words = dmg > 17 ? ['KRACH!', 'BUMM!', 'WUMMS!'] : ['Zack!', 'Pow!', 'Klong!', 'Patsch!'];
      pops.push({ x: at[0], y: at[1] - 20, t: 0, txt: words[(Math.random() * words.length) | 0], c: f.p.color, big: dmg > 17 });
      if (o.hp <= 0) { o.hp = 0; o.ko = true; o.vy = -480; o.vx = f.face * 380; slow = 0.3; finish(F.indexOf(f)); }
    }

    // ---------- Zeichnen ----------
    function draw() {
      const sx = shake ? Math.sin(performance.now() / 18) * 8 * shake : 0;
      ctx.save(); ctx.translate(sx, 0);
      // Karo-Papier
      ctx.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; ctx.fillRect(-20, 0, W + 40, 600);
      ctx.strokeStyle = dark ? 'rgba(140,170,255,.10)' : 'rgba(70,120,210,.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let x = 0; x < W + 24; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, 600); } for (let y = 0; y < 600; y += 24) { ctx.moveTo(-20, y); ctx.lineTo(W + 20, y); } ctx.stroke();
      // Licht auf die Arena
      const g = ctx.createRadialGradient(W / 2, GROUND, 40, W / 2, GROUND, W * 0.6);
      g.addColorStop(0, dark ? 'rgba(123,155,255,.14)' : 'rgba(255,214,120,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(-20, 0, W + 40, 600);
      // Seile und Pfosten
      const ink = dark ? 'rgba(230,236,248,.55)' : 'rgba(29,29,31,.55)';
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(24, GROUND); ctx.lineTo(24, GROUND - 190); ctx.moveTo(W - 24, GROUND); ctx.lineTo(W - 24, GROUND - 190); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = dark ? 'rgba(255,120,120,.4)' : 'rgba(225,80,80,.45)';
      for (const y of [GROUND - 180, GROUND - 120]) { ctx.beginPath(); ctx.moveTo(24, y); ctx.quadraticCurveTo(W / 2, y + 10, W - 24, y); ctx.stroke(); }
      // Boden: Tintenstrich mit Schraffur
      ctx.strokeStyle = dark ? '#e8ecf4' : '#1d1d1f'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, GROUND + 2); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, GROUND + 2 + Math.sin(x * 0.07) * 1.2); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = dark ? 'rgba(232,236,244,.18)' : 'rgba(29,29,31,.16)';
      ctx.beginPath(); for (let x = -40; x < W + 40; x += 14) { ctx.moveTo(x, GROUND + 8); ctx.lineTo(x - 30, 600); } ctx.stroke();
      // Schatten, Kämpfer
      for (const f of F) { ctx.fillStyle = 'rgba(0,0,0,.16)'; const s = Math.max(0.3, 1 - (GROUND - f.y) / 300); ctx.beginPath(); ctx.ellipse(f.x, GROUND + 4, f.bw * 0.7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      for (const f of F) drawFighter(ctx, f, 1);
      // Funken und Wörter
      for (const q of parts) { ctx.globalAlpha = Math.max(0, 1 - q.t / 0.8); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const q of pops) {
        const k = Math.min(1, q.t * 8), a = Math.max(0, 1 - Math.max(0, q.t - 0.45) / 0.35);
        ctx.save(); ctx.translate(q.x, q.y - q.t * 40); ctx.rotate(-0.12); ctx.scale(k, k); ctx.globalAlpha = a;
        ctx.font = `800 ${q.big ? 46 : 34}px -apple-system, "Segoe UI", Roboto, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 7; ctx.strokeStyle = dark ? '#1b1f28' : '#fff'; ctx.lineJoin = 'round'; ctx.strokeText(q.txt, 0, 0);
        ctx.fillStyle = q.c; ctx.fillText(q.txt, 0, 0);
        ctx.restore();
      }
      if (over) {
        const w = F.find((f) => !f.ko);
        if (F.some((f) => f.ko) && w) {
          ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 64px -apple-system, "Segoe UI", Roboto, sans-serif';
          ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = dark ? '#1b1f28' : '#fff'; ctx.strokeText('K.O.!', W / 2, 220);
          ctx.fillStyle = w.p.color; ctx.fillText('K.O.!', W / 2, 220); ctx.restore();
        }
      }
      ctx.restore();
    }
    function drawFighter(c, f, live) {
      const bob = live && !f.ko && f.y >= GROUND - 1 ? Math.sin(f.t * (Math.abs(f.vx) > 40 ? 14 : 4)) * (Math.abs(f.vx) > 40 ? 4 : 1.5) : 0;
      const sq = live && f.vy < -100 ? 1.06 : 1;
      c.save();
      c.translate(f.x, f.y);
      c.scale(f.face, 1);
      c.rotate(f.ko ? -Math.abs(f.rot) : (f.hurt > 0 ? -0.25 : Math.max(-0.1, Math.min(0.12, f.vx * f.face / 1600))));
      c.translate(0, bob * 0.3);
      c.scale(1 / sq, sq);
      if (f.hurt > 0 && Math.floor(f.hurt * 30) % 2) c.globalAlpha = 0.55;
      if (dark) { c.shadowColor = 'rgba(255,255,255,.5)'; c.shadowBlur = 5; }
      if (f.img) c.drawImage(f.img, -f.fw / 2, -f.fh, f.fw, f.fh);
      // Waffe in der Hand
      const phi = swingAngle(f.ko ? -1 : f.swing);
      c.translate(f.fw * 0.3, -f.fh * 0.55);
      if (f.swing > 0.3 && f.swing < 0.68 && live) {
        c.save(); c.globalAlpha = 0.18; c.fillStyle = f.p.color;
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, f.st.reach, swingAngle(0.3), phi); c.closePath(); c.fill(); c.restore();
      }
      c.rotate(phi - f.wang0);
      if (f.wimg) c.drawImage(f.wimg, -f.grip[0] * f.ww, -f.grip[1] * f.wh, f.ww, f.wh);
      c.restore();
    }
  });
}
