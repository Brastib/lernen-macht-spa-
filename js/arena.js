// Strichkampf: gemalte Strichmännchen mit gemalten Waffen (Nahkampf oder Schusswaffe) kämpfen in der Arena.
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
export function weaponStats(info = {}, kind = info.kind || 'melee') {
  const len = Math.max(0.15, info.len || 0.5);
  const thick = (info.n || 400) * 4 / (len * S);
  const weight = Math.max(0, Math.min(1, (thick - 8) / 40));
  if (kind === 'gun') {
    return { kind, len, weight, reach: len * S * KW, dmg: 3.5 + 4 * weight + 2 * len, rate: 0.32 + 0.32 * weight, mag: Math.max(3, 7 - Math.round(4 * weight)), reload: 1.3 + 0.9 * weight, speed: 950 - 320 * weight, size: 4 + 5 * weight };
  }
  return { kind, len, weight, reach: len * S * KW, dmg: 7 + 11 * weight + 5 * len, swing: 0.28 + 0.4 * weight + 0.15 * len };
}
const bar = (label, v) => h('span.paintstat', null, h('small', { text: label }), h('span.pbar', null, h('i', { style: { width: Math.round(Math.max(0.06, Math.min(1, v)) * 100) + '%' } })));
const statBars = (st) => st.kind === 'gun'
  ? [bar('Schaden', (st.dmg - 3.5) / 9), bar('Tempo', 1 - (st.rate - 0.32) / 0.4), bar('Munition', st.mag / 7)]
  : [bar('Reichweite', st.len / 0.95), bar('Schaden', (st.dmg - 7) / 16), bar('Tempo', 1 - (st.swing - 0.28) / 0.6)];

// Standard-Figur und -Waffe, falls nichts gemalt ist
function defFigure(color, ghost = false) {
  const c = document.createElement('canvas'); c.width = 200; c.height = 300;
  const x = c.getContext('2d');
  x.strokeStyle = ghost ? '#1d1d1f' : color; x.lineWidth = 14; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.arc(100, 50, 36, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(100, 88); x.lineTo(100, 180); x.moveTo(100, 115); x.lineTo(48, 162);
  x.moveTo(100, 180); x.lineTo(62, 290); x.moveTo(100, 180); x.lineTo(138, 290); x.stroke();
  if (!ghost) { x.fillStyle = color; x.beginPath(); x.arc(112, 44, 6, 0, Math.PI * 2); x.fill(); }
  return { url: c.toDataURL('image/png'), w: 200 / 300 * 0.6, h: 0.6, hip: 0.6, def: true };
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
  const x0 = gx - 30, y0 = gy - L * 0.72 - 30, w = L * 0.72 + 60, hh = L * 0.72 + 60;
  const o = document.createElement('canvas'); o.width = Math.round(w); o.height = Math.round(hh);
  o.getContext('2d').drawImage(c, x0, y0, w, hh, 0, 0, w, hh);
  return { url: o.toDataURL('image/png'), w: w / S, h: hh / S, grip: [(gx - x0) / w, (gy - y0) / hh], kind: 'melee', info: { kind: 'melee', len: L / S, n: 1400, ang: a } };
}
const loadImg = (url) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = url; });

async function editFigure(p) {
  const f = getFighter(p);
  const r = await paintSheet({ title: `Kämpfer für ${p.name}`, color: p.color, old: f.fig && f.fig.url, min: 0.55, saveLabel: 'Kämpfer sichern', removeLabel: 'Standard-Figur',
    ghost: defFigure('#000', true).url,
    text: 'Mal dein Strichmännchen. Es schaut nach rechts. Die Beine unten bewegen sich beim Laufen, den Waffenarm bekommt es automatisch. Die Figur muss mindestens bis zur gestrichelten Linie reichen.' });
  if (r === 'remove') return setPart(p, 'fig', null);
  if (r) return setPart(p, 'fig', { url: r.url, w: r.w, h: r.h });
  return false;
}
async function editWeapon(p) {
  const f = getFighter(p);
  const r = await paintSheet({ title: `Waffe für ${p.name}`, color: '#1d1d1f', old: f.weap && f.weap.url, oldGrip: f.weap && f.weap.grip, grip: GRIP, saveLabel: 'Waffe sichern', removeLabel: 'Standard-Schwert',
    kinds: [['melee', 'Nahkampf'], ['gun', 'Schusswaffe']], kind: (f.weap && f.weap.kind) || 'melee',
    minFor: (k) => (k === 'gun' ? 0.22 : 0.3),
    small: 'Noch zu kurz. Mal die Waffe mindestens bis zum gestrichelten Kreis.', empty: 'Fang beim roten Punkt an, dort hält die Figur die Waffe.',
    stats: (info, kind) => statBars(weaponStats(info, kind)),
    textFor: (k) => k === 'gun'
      ? 'Mal die Schusswaffe vom Griff (roter Punkt) aus. Der Punkt, der am weitesten weg ist, wird die Mündung (blau). Dort kommen die Schüsse raus. Dick heißt mehr Schaden, aber weniger Munition.'
      : 'Mal die Waffe vom Griff (roter Punkt) aus. Lang heißt mehr Reichweite, dick und schwer heißt mehr Schaden, aber langsamer.' });
  if (r === 'remove') return setPart(p, 'weap', null);
  if (r) return setPart(p, 'weap', { url: r.url, w: r.w, h: r.h, grip: r.grip, muzzle: r.muzzle, kind: r.kind, info: { ...r.info, kind: r.kind } });
  return false;
}

async function makeFighter(p, side) {
  const f = getFighter(p);
  const fig = f.fig || defFigure(p.color), weap = f.weap || defWeapon();
  const [img, wimg] = await Promise.all([loadImg(fig.url), loadImg(weap.url)]);
  const kind = weap.kind || 'melee';
  const st = weaponStats(weap.info || {}, kind);
  const fw = Math.min(170, Math.max(40, FIG_H * fig.w / fig.h));
  const ww = weap.w * S * KW, wh = weap.h * S * KW, grip = weap.grip || [0, 1];
  const mz = weap.muzzle || [1, 0];
  const mdx = (mz[0] - grip[0]) * ww, mdy = (mz[1] - grip[1]) * wh;
  return {
    p, img, wimg, st, kind, fw, fh: FIG_H, hip: fig.hip || 0.6, bw: Math.max(36, Math.min(100, fw * 0.6)),
    ww, wh, grip, wang0: kind === 'gun' ? 0 : ((weap.info && weap.info.ang) || -Math.PI / 4), mdx, mdy, mlen: Math.hypot(mdx, mdy),
    x: 0, y: GROUND, vx: 0, vy: 0, face: side ? -1 : 1, hp: 100, cd: 0.6 + Math.random() * 0.4, swing: -1, hit: false, hurt: 0, ko: false, rot: 0, tapCd: 0,
    jumpT: 1 + Math.random() * 2, t: Math.random() * 10, leg: 0, land: 0, wasAir: false, dustT: 0, recoil: 0, aim: 0, ammo: st.mag || 0, reloadT: 0, flash: 0, koT: 0, cheer: 0, dodge: new Set(),
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
// Lage von Schulter, Hand und Waffenwinkel (in Blickrichtung rechts, relativ zu den Füßen)
function armPose(f) {
  const sh = [f.fw * 0.04, -f.fh * 0.66], len = f.fh * 0.27;
  let phi, a;
  if (f.kind === 'gun') { phi = f.aim - f.recoil * 0.45; a = phi * 0.85; }
  else { phi = swingAngle(f.ko ? -1 : f.swing); a = Math.max(-1.6, Math.min(1.1, phi * 0.55 + 0.35)); }
  if (f.ko) { a = 1.3; phi = 1.6; }
  return { sh, hand: [sh[0] + Math.cos(a) * len, sh[1] + Math.sin(a) * len], phi };
}

export function arena(fx, A, B) {
  return new Promise((resolve) => {
    const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const ink = dark ? '#e8ecf4' : '#1d1d1f';
    const prep = h('div.arprep');
    fx.stage.append(prep);

    // ---------- Vorbereitung: Figur und Waffe malen ----------
    let prevRaf = 0;
    async function drawPrep() {
      cancelAnimationFrame(prevRaf);
      const made = await Promise.all([A, B].map((p, i) => makeFighter(p, i)));
      const cards = made.map((F, i) => {
        const p = F.p, f = getFighter(p);
        const cv = h('canvas.arprev', { width: 440, height: 400 });
        F.cv = cv;
        return h('div.arcard', null,
          h('div.arcardhead', null, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name }), h('span.gtag', null, icon(F.kind === 'gun' ? 'target' : 'sword'), F.kind === 'gun' ? 'Schusswaffe' : 'Nahkampf')),
          cv,
          h('div.paintstats', null, ...statBars(F.st)),
          h('div.arbtns', null,
            h('button.btn', { on: { click: async () => { if (await editFigure(p)) drawPrep(); } } }, icon('pen'), f.fig ? 'Figur ändern' : 'Figur malen'),
            h('button.btn', { on: { click: async () => { if (await editWeapon(p)) drawPrep(); } } }, icon('edit'), f.weap ? 'Waffe ändern' : 'Waffe malen')));
      });
      if (fx.signal.aborted) return;
      prep.replaceChildren(
        h('div.arcards', null, ...cards),
        h('p.calm.arhint', { text: 'Die Kämpfer kämpfen von allein. Tippt auf eure Bildschirmseite für einen Sprung-Angriff oder Schuss (oder Taste A und L).' }),
        h('button.btn.primary.arstart', { on: { click: start } }, icon('play'), 'Kampf starten'));
      // kleine Vorschau-Animation: atmen, Waffe bewegen
      let lastP = performance.now();
      const anim = (now) => {
        if (fx.signal.aborted || !prep.isConnected) return;
        const dt = Math.min(0.05, (now - lastP) / 1000); lastP = now;
        for (const F of made) {
          F.t += dt;
          if (F.kind === 'gun') { F.aim = Math.sin(F.t * 1.3) * 0.12; F.recoil = Math.max(0, F.recoil - dt * 5); if ((F.t % 2.2) < dt) F.recoil = 1; }
          else { if (F.swing < 0 && (F.t % 2.4) < dt) F.swing = 0; if (F.swing >= 0) { F.swing += dt / F.st.swing; if (F.swing >= 1) F.swing = -1; } }
          renderPreview(F.cv, F);
        }
        prevRaf = requestAnimationFrame(anim);
      };
      prevRaf = requestAnimationFrame(anim);
    }
    function renderPreview(cv, F) {
      const x = cv.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
      const k = cv.height / 260;
      x.setTransform(k, 0, 0, k, 0, 0);
      x.strokeStyle = dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.12)'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 232); x.lineTo(cv.width / k - 20, 232); x.stroke();
      const save = { x: F.x, y: F.y, face: F.face };
      Object.assign(F, { x: cv.width / k / 2 - 30, y: 230, face: 1 });
      drawFighter(x, F, true);
      Object.assign(F, save);
    }
    drawPrep();

    // ---------- Kampf ----------
    let cv, ctx, hud, raf = 0, last = 0, W = 1000, F = [], parts = [], pops = [], dust = [], shots = [], shake = 0, slow = 1, timeLeft = 60, over = false, started = 0;
    async function start() {
      cancelAnimationFrame(prevRaf);
      F = await Promise.all([makeFighter(A, 0), makeFighter(B, 1)]);
      if (fx.signal.aborted) return;
      prep.remove();
      cv = h('canvas.arcv');
      const hpEl = (f, i) => h('div.arhp' + (i ? '.r' : ''), null,
        h('div.arhpname', null, h('span.gdot', { style: { background: f.p.color } }), h('b', { text: f.p.name })),
        h('div.arhpbar', null, h('i', { style: { background: f.p.color } })),
        f.kind === 'gun' ? h('div.arammo', null, ...Array.from({ length: f.st.mag }, () => h('i'))) : null);
      const timer = h('div.artime', { text: '60' });
      hud = { el: h('div.arhud', null, hpEl(F[0], 0), timer, hpEl(F[1], 1)), timer, ammo: [0, 1].map((i) => -1) };
      const tip = h('p.artip', { text: 'Tippt auf eure Seite: Sprung-Angriff oder Schuss' });
      const wrap = h('div.arwrap', null, cv, hud.el, tip);
      fx.stage.append(wrap);
      ctx = cv.getContext('2d');
      const size = () => {
        const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
        const U = r.height / 600; W = r.width / U;
        ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
        if (!started) { F[0].x = W * 0.22; F[1].x = W * 0.78; }
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
      if (w != null) F[w].cheer = 1;
      setTimeout(() => {
        if (fx.signal.aborted) return;
        finish.cleanup && finish.cleanup();
        const [a, b] = F.map((f) => Math.max(0, Math.round(f.hp)));
        resolve({ w, detail: w == null ? `Zeit um · ${a} : ${b} Leben` : `${(w ? F[1] : F[0]).p.name} hat noch ${w ? b : a} Leben` });
      }, 2000);
    }
    function tap(i) {
      const f = F[i];
      if (!f || f.ko || over || f.tapCd > 0) return;
      f.tapCd = 0.7;
      if (f.y >= GROUND - 1) { f.vy = -640; f.vx = f.face * (f.kind === 'gun' ? -160 : 320); puff(f.x, GROUND, 6); }
      if (f.kind === 'gun') fire(f, F[1 - i]);
      else if (f.swing < 0) { f.swing = 0; f.hit = false; f.cd = 0; }
    }
    function loop(now) {
      if (fx.signal.aborted) return;
      const real = Math.min(0.033, (now - last) / 1000); last = now;
      step(real * slow, real); draw();
      raf = requestAnimationFrame(loop);
    }
    function step(dt, real) {
      if (!over) { timeLeft -= dt; hud.timer.textContent = String(Math.max(0, Math.ceil(timeLeft))); if (timeLeft <= 0) { const [a, b] = F; finish(Math.abs(a.hp - b.hp) < 1 ? null : a.hp > b.hp ? 0 : 1); } }
      shake = Math.max(0, shake - real * 3);
      if (slow < 1) slow = Math.min(1, slow + real * 0.5);
      F.forEach((f, i) => think(f, F[1 - i], dt));
      const [a, b] = F, gap = (a.bw + b.bw) / 2 * 0.9, d = b.x - a.x;
      if (Math.abs(d) < gap && !a.ko && !b.ko && Math.abs(a.y - b.y) < 60) { const push = (gap - Math.abs(d)) / 2 * Math.sign(d || 1); a.x -= push; b.x += push; }
      for (const f of F) f.x = Math.max(f.bw / 2 + 20, Math.min(W - f.bw / 2 - 20, f.x));
      stepShots(dt);
      parts.forEach((q) => { q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.t += dt; });
      parts = parts.filter((q) => q.t < 0.8);
      dust.forEach((q) => { q.t += dt; q.x += q.vx * dt; q.y -= 20 * dt; });
      dust = dust.filter((q) => q.t < 0.5);
      pops.forEach((q) => { q.t += real; });
      pops = pops.filter((q) => q.t < 0.8);
      hud.el.querySelectorAll('.arhpbar i').forEach((el, i) => { el.style.width = Math.max(0, F[i].hp) + '%'; });
      F.forEach((f, i) => {
        if (f.kind !== 'gun') return;
        const n = f.reloadT > 0 ? -2 : f.ammo;
        if (hud.ammo[i] === n) return;
        hud.ammo[i] = n;
        const box = hud.el.querySelectorAll('.arhp')[i].querySelector('.arammo');
        box.classList.toggle('reload', f.reloadT > 0);
        box.querySelectorAll('i').forEach((el, k) => el.classList.toggle('on', f.reloadT <= 0 && k < f.ammo));
      });
    }
    function puff(x, y, n = 4, dir = 0) {
      for (let i = 0; i < n; i++) dust.push({ x: x + (Math.random() - 0.5) * 30, y: y - 4, vx: (Math.random() - 0.5) * 80 + dir * 60, t: Math.random() * 0.1, r: 6 + Math.random() * 8 });
    }
    function think(f, o, dt) {
      f.t += dt; f.tapCd = Math.max(0, f.tapCd - dt); f.cd -= dt; f.hurt = Math.max(0, f.hurt - dt);
      f.land = Math.max(0, f.land - dt * 5); f.recoil = Math.max(0, f.recoil - dt * 6); f.flash = Math.max(0, f.flash - dt * 8);
      const onGround = f.y >= GROUND - 0.5;
      if (f.ko) {
        f.koT += dt;
        f.rot += (1.5 - f.rot) * Math.min(1, dt * 7);
      } else if (over) {
        f.vx *= 1 - Math.min(1, dt * 6);
        if (f.cheer && onGround && f.t % 0.6 < dt) { f.vy = -420; }
      } else {
        f.face = o.x >= f.x ? 1 : -1;
        const dist = Math.abs(o.x - f.x) - o.bw / 2;
        if (f.kind === 'gun') gunBrain(f, o, dt, dist, onGround);
        else meleeBrain(f, o, dt, dist, onGround);
        // Kugeln ausweichen
        for (const s of shots) {
          if (s.owner === f || f.dodge.has(s) || !onGround) continue;
          const dx = f.x - s.x;
          if (Math.sign(dx) === Math.sign(s.vx) && Math.abs(dx) < 200) { f.dodge.add(s); if (Math.random() < 0.4) { f.vy = -600; puff(f.x, GROUND, 4); } }
        }
      }
      // Schlag (Nahkampf)
      if (f.swing >= 0) {
        f.swing += dt / f.st.swing;
        if (!f.hit && f.swing > 0.32 && f.swing < 0.68 && !o.ko && !f.ko) {
          const pts = weaponPts(f);
          if (pts.some(([px, py]) => Math.abs(px - o.x) < o.bw / 2 + 4 && py > o.y - o.fh && py < o.y + 4)) hitFoe(f, o, pts[pts.length - 1], f.st.dmg * (f.y < GROUND - 10 ? 1.25 : 1), 1);
        }
        if (f.swing >= 1) { f.swing = -1; f.cd = 0.35 + Math.random() * 0.5; }
      }
      // Nachladen
      if (f.reloadT > 0) { f.reloadT -= dt; if (f.reloadT <= 0) f.ammo = f.st.mag; }
      // Bewegung
      f.vy += 1800 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > GROUND) {
        if (f.wasAir && f.vy > 300) { f.land = 1; puff(f.x, GROUND, f.ko ? 8 : 5); if (f.ko) { f.vy = -f.vy * 0.3; f.y = GROUND; } }
        f.y = GROUND; if (!f.ko || Math.abs(f.vy) < 80) f.vy = 0;
        if (f.ko || f.hurt > 0 || f.swing >= 0 || over) f.vx *= 1 - Math.min(1, dt * 7);
      }
      f.wasAir = f.y < GROUND - 2;
      // Beine
      const sp = Math.abs(f.vx);
      if (!f.wasAir && sp > 30) {
        f.leg += dt * sp * 0.05;
        f.dustT -= dt; if (f.dustT <= 0 && sp > 120) { f.dustT = 0.18; puff(f.x - f.face * 10, GROUND, 1, -Math.sign(f.vx)); }
      } else f.leg *= 1 - Math.min(1, dt * 6);
    }
    function meleeBrain(f, o, dt, dist, onGround) {
      if (f.swing < 0 && f.hurt <= 0 && onGround) {
        if (dist > f.st.reach * 0.8) f.vx += (f.face * 200 - f.vx) * Math.min(1, dt * 6);
        else { f.vx *= 1 - Math.min(1, dt * 8); if (f.cd <= 0) { f.swing = 0; f.hit = false; } }
        f.jumpT -= dt;
        if (f.jumpT <= 0) { f.jumpT = 1.5 + Math.random() * 2.5; if (Math.random() < 0.55) { f.vy = -560; f.vx = f.face * (140 + Math.random() * 120); puff(f.x, GROUND, 4); } }
      }
    }
    function gunBrain(f, o, dt, dist, onGround) {
      // auf die Brust des Gegners zielen
      const { sh } = armPose(f);
      const ax = f.x + f.face * sh[0], ay = f.y + sh[1];
      const tx = o.x, ty = o.y - o.fh * 0.55;
      const want = Math.max(-1.0, Math.min(0.7, Math.atan2(ty - ay, Math.abs(tx - ax))));
      f.aim += (want - f.aim) * Math.min(1, dt * 8);
      if (f.hurt <= 0 && onGround) {
        const near = Math.min(260, W * 0.28), far = Math.min(520, W * 0.6);
        let target = 0;
        if (dist < near) target = -f.face * 210; else if (dist > far) target = f.face * 170;
        f.vx += (target - f.vx) * Math.min(1, dt * 6);
        const atWall = f.x < f.bw / 2 + 40 || f.x > W - f.bw / 2 - 40;
        if (atWall && dist < near && Math.random() < dt * 2.5) { f.vy = -700; f.vx = f.face * 420; puff(f.x, GROUND, 5); }
        f.jumpT -= dt;
        if (f.jumpT <= 0) { f.jumpT = 2 + Math.random() * 3; if (Math.random() < 0.4) { f.vy = -540; puff(f.x, GROUND, 4); } }
      }
      if (f.cd <= 0 && f.hurt <= 0 && Math.abs(want - f.aim) < 0.2) fire(f, o);
    }
    function fire(f, o) {
      if (f.ammo <= 0 || f.reloadT > 0 || f.cd > 0 && f.tapCd < 0.69) return;
      const { hand } = armPose(f);
      const ang = f.aim, ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = hand[0] + ca * f.mdx - sa * f.mdy, ly = hand[1] + sa * f.mdx + ca * f.mdy;
      const mx = f.x + f.face * lx, my = f.y + ly;
      shots.push({ x: mx, y: my, vx: f.face * Math.cos(ang) * f.st.speed, vy: Math.sin(ang) * f.st.speed, owner: f, r: f.st.size, c: f.p.color, t: 0, trail: [] });
      f.ammo--; f.cd = f.st.rate; f.recoil = 1; f.flash = 1;
      f.vx -= f.face * (40 + 80 * f.st.weight);
      if (f.ammo <= 0) { f.reloadT = f.st.reload; }
      if (Math.random() < 0.35) pops.push({ x: mx + f.face * 20, y: my - 18, t: 0.15, txt: ['Peng!', 'Piu!', 'Puff!'][(Math.random() * 3) | 0], c: f.p.color, small: true });
    }
    function stepShots(dt) {
      for (const s of shots) {
        s.t += dt; s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        s.trail.push([s.x, s.y]); if (s.trail.length > 8) s.trail.shift();
        const o = F.find((q) => q !== s.owner);
        if (!s.dead && o && !o.ko && Math.abs(s.x - o.x) < o.bw / 2 + s.r && s.y > o.y - o.fh && s.y < o.y + 4) {
          s.dead = true; hitFoe(s.owner, o, [s.x, s.y], s.owner.st.dmg, 0.45);
        }
        if (s.y > GROUND) { s.dead = true; puff(s.x, GROUND, 2); }
        if (s.x < -40 || s.x > W + 40 || s.t > 3) s.dead = true;
      }
      shots = shots.filter((s) => !s.dead);
    }
    function weaponPts(f) {
      const { hand, phi } = armPose(f);
      return [0.45, 0.72, 1].map((t) => [f.x + f.face * (hand[0] + Math.cos(phi) * f.st.reach * t), f.y + hand[1] + Math.sin(phi) * f.st.reach * t]);
    }
    function hitFoe(f, o, at, dmg0, kb) {
      f.hit = true;
      const dmg = dmg0 * (0.9 + Math.random() * 0.2);
      o.hp -= dmg; o.hurt = kb > 0.6 ? 0.4 : 0.22;
      o.vx = f.face * (180 + 260 * f.st.weight) * kb; o.vy = -(200 + 160 * f.st.weight) * kb;
      shake = Math.min(1, 0.3 + dmg / 30);
      for (let i = 0; i < 12; i++) parts.push({ x: at[0], y: at[1], vx: (Math.random() - 0.5) * 420 + f.face * 160, vy: -Math.random() * 380, t: Math.random() * 0.2, c: Math.random() < 0.5 ? f.p.color : ink, r: 2 + Math.random() * 4, star: Math.random() < 0.3 });
      const big = dmg > 17;
      const words = f.kind === 'gun' ? ['Plopp!', 'Tock!', 'Bonk!'] : big ? ['KRACH!', 'BUMM!', 'WUMMS!'] : ['Zack!', 'Pow!', 'Klong!', 'Patsch!'];
      pops.push({ x: at[0], y: at[1] - 20, t: 0, txt: words[(Math.random() * words.length) | 0], c: f.p.color, big });
      if (o.hp <= 0) { o.hp = 0; o.ko = true; o.vy = -520; o.vx = f.face * 380; slow = 0.3; finish(F.indexOf(f)); }
    }

    // ---------- Zeichnen ----------
    function draw() {
      const sx = shake ? Math.sin(performance.now() / 18) * 8 * shake : 0;
      ctx.save(); ctx.translate(sx, 0);
      ctx.fillStyle = dark ? '#1b1f28' : '#fbfaf5'; ctx.fillRect(-20, 0, W + 40, 600);
      ctx.strokeStyle = dark ? 'rgba(140,170,255,.10)' : 'rgba(70,120,210,.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let x = 0; x < W + 24; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, 600); } for (let y = 0; y < 600; y += 24) { ctx.moveTo(-20, y); ctx.lineTo(W + 20, y); } ctx.stroke();
      const g = ctx.createRadialGradient(W / 2, GROUND, 40, W / 2, GROUND, W * 0.6);
      g.addColorStop(0, dark ? 'rgba(123,155,255,.14)' : 'rgba(255,214,120,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(-20, 0, W + 40, 600);
      ctx.strokeStyle = dark ? 'rgba(230,236,248,.55)' : 'rgba(29,29,31,.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(24, GROUND); ctx.lineTo(24, GROUND - 190); ctx.moveTo(W - 24, GROUND); ctx.lineTo(W - 24, GROUND - 190); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = dark ? 'rgba(255,120,120,.4)' : 'rgba(225,80,80,.45)';
      for (const y of [GROUND - 180, GROUND - 120]) { ctx.beginPath(); ctx.moveTo(24, y); ctx.quadraticCurveTo(W / 2, y + 10, W - 24, y); ctx.stroke(); }
      ctx.strokeStyle = ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, GROUND + 2); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, GROUND + 2 + Math.sin(x * 0.07) * 1.2); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = dark ? 'rgba(232,236,244,.18)' : 'rgba(29,29,31,.16)';
      ctx.beginPath(); for (let x = -40; x < W + 40; x += 14) { ctx.moveTo(x, GROUND + 8); ctx.lineTo(x - 30, 600); } ctx.stroke();
      for (const f of F) { ctx.fillStyle = 'rgba(0,0,0,.16)'; const s = Math.max(0.3, 1 - (GROUND - f.y) / 300); ctx.beginPath(); ctx.ellipse(f.x, GROUND + 4, f.bw * 0.7 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill(); }
      // Staub
      for (const q of dust) { ctx.globalAlpha = Math.max(0, 0.35 * (1 - q.t / 0.5)); ctx.fillStyle = dark ? '#cfd6e4' : '#9a978f'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + q.t * 2), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const f of F) drawFighter(ctx, f, false);
      // Schüsse
      for (const s of shots) {
        ctx.strokeStyle = s.c; ctx.lineCap = 'round';
        for (let i = 1; i < s.trail.length; i++) { ctx.globalAlpha = i / s.trail.length * 0.5; ctx.lineWidth = s.r * 2 * i / s.trail.length; ctx.beginPath(); ctx.moveTo(...s.trail[i - 1]); ctx.lineTo(...s.trail[i]); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke();
      }
      for (const q of parts) {
        ctx.globalAlpha = Math.max(0, 1 - q.t / 0.8); ctx.fillStyle = q.c;
        if (q.star) star(ctx, q.x, q.y, q.r * 1.6, q.t * 8); else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const q of pops) {
        const k = Math.min(1, q.t * 8), a = Math.max(0, 1 - Math.max(0, q.t - 0.45) / 0.35);
        ctx.save(); ctx.translate(q.x, q.y - q.t * 40); ctx.rotate(-0.12); ctx.scale(k, k); ctx.globalAlpha = a;
        ctx.font = `800 ${q.big ? 46 : q.small ? 22 : 34}px -apple-system, "Segoe UI", Roboto, sans-serif`; ctx.textAlign = 'center';
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
    function star(c, x, y, r, rot) {
      c.save(); c.translate(x, y); c.rotate(rot); c.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = i * Math.PI / 5; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.restore();
    }
    // Figur als Puppe: Oberkörper atmet und neigt sich, die beiden Bein-Hälften schwingen um die Hüfte
    function drawFighter(c, f, preview) {
      const air = !preview && f.y < GROUND - 2;
      const breathe = Math.sin(f.t * 3.2) * 0.022;
      let sy = 1 + breathe - f.land * 0.16, sxs = 1 - breathe * 0.5 + f.land * 0.12;
      if (air && !f.ko) { sy += 0.05; sxs -= 0.04; }
      const lean = f.ko ? 0 : f.hurt > 0 ? -0.3 : Math.max(-0.14, Math.min(0.16, f.vx * f.face / 1400)) + (f.swing > 0.3 && f.swing < 0.62 ? 0.12 : 0);
      const { sh, hand, phi } = armPose(f);
      const iw = f.img ? f.img.naturalWidth : 1, ih = f.img ? f.img.naturalHeight : 1, hip = f.hip;
      const legA = air && !f.ko ? 0.45 : Math.sin(f.leg) * 0.55, legB = air && !f.ko ? -0.6 : -Math.sin(f.leg) * 0.55;
      c.save();
      c.translate(f.x, f.y);
      c.scale(f.face, 1);
      if (f.ko) { c.translate(-f.fh * 0.05 * f.rot, 0); c.rotate(-f.rot); }
      c.scale(sxs, sy);
      if (dark) { c.shadowColor = 'rgba(255,255,255,.45)'; c.shadowBlur = 4; }
      if (f.hurt > 0 && Math.floor(f.hurt * 30) % 2) c.globalAlpha = 0.55;
      const hx = 0, hy = -f.fh * (1 - hip), lh = f.fh * (1 - hip);
      if (f.img) {
        // Beine (hinten, vorne)
        for (const [sx0, sw, rot] of [[0, 0.5, legA], [0.5, 0.5, legB]]) {
          c.save(); c.translate(hx, hy); c.rotate(rot);
          c.drawImage(f.img, sx0 * iw, hip * ih, sw * iw, (1 - hip) * ih, -f.fw / 2 + sx0 * f.fw, 0, sw * f.fw, lh);
          c.restore();
        }
        // Oberkörper
        c.save(); c.translate(hx, hy); c.rotate(lean);
        c.drawImage(f.img, 0, 0, iw, hip * ih, -f.fw / 2, -f.fh * hip, f.fw, f.fh * hip);
        // Waffenarm
        c.translate(0, f.fh * (1 - hip));
        c.strokeStyle = f.p.color; c.lineWidth = 5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sh[0], sh[1]); c.lineTo(hand[0], hand[1]); c.stroke();
        // Schwung-Spur
        if (!preview && f.kind !== 'gun' && f.swing > 0.3 && f.swing < 0.68) {
          c.save(); c.globalAlpha = 0.18; c.fillStyle = f.p.color; c.shadowBlur = 0;
          c.beginPath(); c.moveTo(hand[0], hand[1]); c.arc(hand[0], hand[1], f.st.reach, swingAngle(0.3), phi); c.closePath(); c.fill(); c.restore();
        }
        c.translate(hand[0], hand[1]);
        c.save();
        c.rotate(phi - f.wang0);
        if (f.wimg) c.drawImage(f.wimg, -f.grip[0] * f.ww, -f.grip[1] * f.wh, f.ww, f.wh);
        c.restore();
        // Mündungsfeuer
        if (f.kind === 'gun' && f.flash > 0) {
          c.rotate(phi); c.fillStyle = '#ffcf4a'; c.globalAlpha = f.flash; c.shadowBlur = 0;
          star(c, f.mdx + 6, f.mdy, 10 + f.flash * 8, f.t * 20);
        }
        c.restore();
      }
      c.restore();
      // K.O.-Sterne und Nachladen
      if (f.ko && f.koT > 0.4) {
        c.save(); c.fillStyle = '#f2b632';
        for (let i = 0; i < 3; i++) { const a = f.t * 4 + i * 2.1; star(c, f.x - f.face * f.fh * 0.85 + Math.cos(a) * 22, GROUND - 22 + Math.sin(a) * 7, 6, a); }
        c.restore();
      }
      if (!preview && f.kind === 'gun' && f.reloadT > 0 && !f.ko) {
        const k = 1 - f.reloadT / f.st.reload, cx = f.x, cy = f.y - f.fh - 26;
        c.save(); c.lineWidth = 4; c.lineCap = 'round';
        c.strokeStyle = dark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.12)'; c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = f.p.color; c.beginPath(); c.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
        c.restore();
      }
    }
  });
}
