// Strichkampf: gemalte Strichmännchen mit gemalten Waffen (Nahkampf oder Schusswaffe) kämpfen in der Arena.
import { h, icon, toast } from './ui.js';
import { paintSheet } from './gpaint.js';
import { PRESETS, PRESET_IDS, presetImage } from './weapons.js';

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
    return { kind, len, weight, reach: len * S * KW, dmg: 4.5 + 4 * weight + 2 * len, rate: 0.32 + 0.32 * weight, mag: Math.max(3, 7 - Math.round(4 * weight)), reload: 1.3 + 0.9 * weight, speed: 950 - 320 * weight, size: 4 + 5 * weight, pellets: 1, spread: 0.03, near: 220, far: 460 };
  }
  return { kind, len, weight, reach: len * S * KW, dmg: 7 + 11 * weight + 5 * len, swing: 0.28 + 0.4 * weight + 0.15 * len };
}
const bar = (label, v) => h('span.paintstat', null, h('small', { text: label }), h('span.pbar', null, h('i', { style: { width: Math.round(Math.max(0.06, Math.min(1, v)) * 100) + '%' } })));
const statBars = (st) => st.kind === 'gun'
  ? [bar('Schaden', (st.dmg * (st.pellets || 1) + (st.boom ? 6 : 0)) / 26), bar('Tempo', 1 - (st.rate - 0.07) / 1.05), bar('Munition', st.mag / 20)]
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

// Waffe aussuchen: fertige Waffen oder selbst malen
function chooseWeapon(p) {
  return import('./ui.js').then(({ sheet }) => sheet(`Waffe für ${p.name}`, (body, close) => {
    const cur = getFighter(p).weap;
    const tile = (id) => {
      const P = PRESETS[id], im = presetImage(id);
      const st = { pellets: 1, ...P.st };
      const tag = P.kind === 'gun' ? (st.boom ? 'Explosion' : st.pellets > 1 ? 'Schrot' : st.rate < 0.15 ? 'Dauerfeuer' : 'Schuss') : 'Nahkampf';
      return h('button.wtile' + (cur && cur.preset === id ? '.on' : ''), { on: { click: () => { setPart(p, 'weap', { preset: id }); close(true); } } },
        h('span.wimg', null, h('img', { src: im.img.toDataURL('image/png'), alt: '' })),
        h('b', { text: P.name }), h('small', { text: P.sub || tag }));
    };
    body.append(
      h('div.wgrid', null,
        h('button.wtile.own' + (cur && cur.url ? '.on' : ''), { on: { click: () => close('own') } },
          h('span.wimg', null, icon('pen')), h('b', { text: 'Selbst malen' }), h('small', { text: cur && cur.url ? 'Deine gemalte Waffe ändern' : 'Nahkampf oder Schusswaffe' })),
        ...PRESET_IDS.map(tile)));
  }, { wide: true }));
}

async function makeFighter(p, side) {
  const f = getFighter(p);
  const fig = f.fig || defFigure(p.color), weap = f.weap && (f.weap.url || PRESETS[f.weap.preset]) ? f.weap : { preset: 'sword' };
  if (weap.preset) {
    const P = PRESETS[weap.preset], im = presetImage(weap.preset);
    const img = await loadImg(fig.url);
    const st = { kind: P.kind, pellets: 1, spread: 0.03, life: 3, grav: 260, weight: 0.3, ...P.st };
    if (P.kind === 'melee') st.len = st.reach / (S * KW);
    return fighterObj(p, side, fig, img, im.img, st, P.kind, { ww: im.ww, wh: im.wh, grip: im.grip, wang0: 0, mdx: im.mdx, mdy: im.mdy, wname: P.name });
  }
  const [img, wimg] = await Promise.all([loadImg(fig.url), loadImg(weap.url)]);
  const kind = weap.kind || 'melee';
  const st = { life: 3, grav: 260, ...weaponStats(weap.info || {}, kind) };
  const ww = weap.w * S * KW, wh = weap.h * S * KW, grip = weap.grip || [0, 1];
  const mz = weap.muzzle || [1, 0];
  const mdx = (mz[0] - grip[0]) * ww, mdy = (mz[1] - grip[1]) * wh;
  return fighterObj(p, side, fig, img, wimg, st, kind, { ww, wh, grip, wang0: kind === 'gun' ? 0 : ((weap.info && weap.info.ang) || -Math.PI / 4), mdx, mdy, wname: kind === 'gun' ? 'Eigene Schusswaffe' : 'Eigene Waffe' });
}
function fighterObj(p, side, fig, img, wimg, st, kind, w) {
  const fw = Math.min(170, Math.max(40, FIG_H * fig.w / fig.h));
  return {
    p, img, wimg, st, kind, fw, fh: FIG_H, hip: fig.hip || 0.6, bw: Math.max(36, Math.min(100, fw * 0.6)), ...w, mlen: Math.hypot(w.mdx, w.mdy), floor: GROUND,
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
          h('div.arcardhead', null, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name }), h('span.gtag', null, icon(F.kind === 'gun' ? 'target' : 'sword'), F.wname)),
          cv,
          h('div.paintstats', null, ...statBars(F.st)),
          h('div.arbtns', null,
            h('button.btn', { on: { click: async () => { if (await editFigure(p)) drawPrep(); } } }, icon('pen'), f.fig ? 'Figur ändern' : 'Figur malen'),
            h('button.btn', { on: { click: async () => { const r = await chooseWeapon(p); if (r === 'own') await editWeapon(p); if (r) drawPrep(); } } }, icon('sword'), 'Waffe wählen')));
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
    let cv, ctx, hud, raf = 0, last = 0, W = 1000, F = [], parts = [], pops = [], dust = [], shots = [], blocks = [], debris = [], booms = [], shake = 0, slow = 1, timeLeft = 60, over = false, started = 0;
    async function start() {
      cancelAnimationFrame(prevRaf);
      F = await Promise.all([makeFighter(A, 0), makeFighter(B, 1)]);
      if (fx.signal.aborted) return;
      prep.remove();
      cv = h('canvas.arcv');
      const hpEl = (f, i) => h('div.arhp' + (i ? '.r' : ''), null,
        h('div.arhpname', null, h('span.gdot', { style: { background: f.p.color } }), h('b', { text: f.p.name })),
        h('div.arhpbar', null, h('i', { style: { background: f.p.color } })),
        f.kind === 'gun' ? (f.st.mag > 10 ? h('div.arammo.num', null, h('b')) : h('div.arammo', null, ...Array.from({ length: f.st.mag }, () => h('i')))) : null);
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
      // Plattformen aus Holzbrettern: man kann draufspringen, Explosionen und Schüsse machen sie kaputt
      const plat = (cx, y, n) => { for (let i = 0; i < n; i++) blocks.push({ x: cx - n * 22 + i * 44, y, w: 44, h: 16, hp: 4, max: 4, seed: Math.random() * 10 }); };
      plat(W / 2, GROUND - 175, 5); plat(Math.max(110, W * 0.16), GROUND - 265, 3); plat(Math.min(W - 110, W * 0.84), GROUND - 265, 3);
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
      if (f.y >= f.floor - 1) { f.vy = -680; f.vx = f.face * (f.kind === 'gun' ? -160 : 320); puff(f.x, f.floor, 6); }
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
        const nb = box.querySelector('b'); if (nb) nb.textContent = f.reloadT > 0 ? 'Nachladen …' : `${f.ammo} / ${f.st.mag}`;
      });
    }
    function puff(x, y, n = 4, dir = 0) {
      for (let i = 0; i < n; i++) dust.push({ x: x + (Math.random() - 0.5) * 30, y: y - 4, vx: (Math.random() - 0.5) * 80 + dir * 60, t: Math.random() * 0.1, r: 6 + Math.random() * 8 });
    }
    function think(f, o, dt) {
      f.t += dt; f.tapCd = Math.max(0, f.tapCd - dt); f.cd -= dt; f.hurt = Math.max(0, f.hurt - dt);
      f.land = Math.max(0, f.land - dt * 5); f.recoil = Math.max(0, f.recoil - dt * 6); f.flash = Math.max(0, f.flash - dt * 8);
      const onGround = f.y >= f.floor - 0.5;
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
          if (Math.sign(dx) === Math.sign(s.vx) && Math.abs(dx) < 200) { f.dodge.add(s); if (Math.random() < 0.4) { f.vy = -600; puff(f.x, f.floor, 4); } }
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
      const py = f.y;
      f.x += f.vx * dt; f.y += f.vy * dt;
      let floor = GROUND;
      if (f.vy >= 0) for (const b of blocks) if (b.hp > 0 && f.x + f.bw * 0.25 > b.x && f.x - f.bw * 0.25 < b.x + b.w && py <= b.y + 1 && f.y >= b.y - 0.5) floor = Math.min(floor, b.y);
      f.floor = floor;
      if (f.y > floor) {
        if (f.wasAir && f.vy > 300) { f.land = 1; puff(f.x, floor, f.ko ? 8 : 5); if (f.ko) { f.vy = -f.vy * 0.3; f.y = floor; } }
        f.y = floor; if (!f.ko || Math.abs(f.vy) < 80) f.vy = 0;
        if (f.ko || f.hurt > 0.1 || f.swing >= 0 || over) f.vx *= 1 - Math.min(1, dt * 7);
      }
      f.wasAir = f.y < f.floor - 2;
      // Beine
      const sp = Math.abs(f.vx);
      if (!f.wasAir && sp > 30) {
        f.leg += dt * sp * 0.05;
        f.dustT -= dt; if (f.dustT <= 0 && sp > 120) { f.dustT = 0.18; puff(f.x - f.face * 10, f.floor, 1, -Math.sign(f.vx)); }
      } else f.leg *= 1 - Math.min(1, dt * 6);
    }
    function meleeBrain(f, o, dt, dist, onGround) {
      if (f.swing < 0 && f.hurt <= 0.1 && onGround) {
        if (dist > f.st.reach * 0.8) { f.vx += (f.face * (o.kind === 'gun' ? 285 : 200) - f.vx) * Math.min(1, dt * 6); if (o.kind === 'gun' && dist > 160 && Math.random() < dt * 1.3) { f.vx = f.face * 480; f.vy = -380; puff(f.x, f.floor, 4); } }
        else { f.vx *= 1 - Math.min(1, dt * 8); if (f.cd <= 0) { f.swing = 0; f.hit = false; } }
        if (o.floor < f.floor - 60 && Math.abs(o.x - f.x) < 140 && Math.random() < dt * 3) { f.vy = -880; f.vx = f.face * 120; puff(f.x, f.floor, 5); }
        f.jumpT -= dt;
        if (f.jumpT <= 0) { f.jumpT = 1.5 + Math.random() * 2.5; if (Math.random() < 0.55) { f.vy = -560; f.vx = f.face * (140 + Math.random() * 120); puff(f.x, f.floor, 4); } }
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
        const near = Math.min(f.st.near || 220, W * 0.3), far = Math.min(f.st.far || 460, W * 0.65);
        let target = 0;
        if (dist < near) target = -f.face * 165; else if (dist > far) target = f.face * 170;
        f.vx += (target - f.vx) * Math.min(1, dt * 6);
        const atWall = f.x < f.bw / 2 + 40 || f.x > W - f.bw / 2 - 40;
        if (atWall && dist < near && Math.random() < dt * 2.5) { f.vy = -760; f.vx = f.face * 420; puff(f.x, f.floor, 5); }
        f.jumpT -= dt;
        if (f.jumpT <= 0) { f.jumpT = 2 + Math.random() * 3; const r = Math.random(); if (r < 0.3) { f.vy = -900; puff(f.x, f.floor, 5); } else if (r < 0.6) { f.vy = -540; puff(f.x, f.floor, 4); } }
      }
      if (f.cd <= 0 && f.hurt <= 0 && Math.abs(want - f.aim) < 0.2) fire(f, o);
    }
    function fire(f, o) {
      if (f.ammo <= 0 || f.reloadT > 0 || f.cd > 0 && f.tapCd < 0.69) return;
      const st = f.st;
      const { hand } = armPose(f);
      let ang = f.aim;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = hand[0] + ca * f.mdx - sa * f.mdy, ly = hand[1] + sa * f.mdx + ca * f.mdy;
      const mx = f.x + f.face * lx, my = f.y + ly;
      if (st.grenade) {
        // im Bogen werfen
        const d = Math.max(80, Math.abs(o.x - mx)), th = 0.8, v = Math.max(320, Math.min(900, Math.sqrt(st.grav * d / Math.sin(2 * th))));
        shots.push({ x: mx, y: my, vx: f.face * Math.cos(th) * v, vy: -Math.sin(th) * v, owner: f, r: st.size, c: f.p.color, t: 0, trail: [], nade: true, rot: 0 });
      } else {
        for (let k = 0; k < (st.pellets || 1); k++) {
          const a = ang + (Math.random() - 0.5) * 2 * (st.spread || 0);
          const sp = st.speed * (st.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
          shots.push({ x: mx, y: my, vx: f.face * Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: f, r: st.size, c: f.p.color, t: 0, trail: [], rocket: !!st.boom });
        }
      }
      f.ammo--; f.cd = st.rate; f.recoil = st.boom || st.pellets > 1 ? 1.4 : 1; f.flash = st.grenade ? 0 : 1;
      f.vx -= f.face * (40 + 160 * (st.weight || 0.3));
      if (f.ammo <= 0) f.reloadT = st.reload;
      if (Math.random() < (st.rate > 0.25 ? 0.6 : 0.15)) {
        const w = st.grenade ? ['Hepp!', 'Fang!'] : st.boom ? ['WUSCH!', 'Fauch!'] : st.pellets > 1 ? ['BAMM!', 'Wumm!'] : ['Peng!', 'Piu!', 'Puff!'];
        pops.push({ x: mx + f.face * 20, y: my - 18, t: 0.15, txt: w[(Math.random() * w.length) | 0], c: f.p.color, small: true });
      }
    }
    function explode(x, y, owner) {
      const st = owner.st, R = st.boom;
      booms.push({ x, y, r: R, t: 0 });
      shake = 1;
      puff(x, y + 10, 14);
      for (let i = 0; i < 18; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 700, vy: -Math.random() * 600, t: Math.random() * 0.2, c: Math.random() < 0.5 ? '#f2a516' : owner.p.color, r: 3 + Math.random() * 5, star: Math.random() < 0.5 });
      pops.push({ x, y: y - 40, t: 0, txt: ['BUMM!', 'KAWUMM!', 'BOOM!'][(Math.random() * 3) | 0], c: '#f2a516', big: true });
      for (const o of F) {
        if (o === owner || o.ko) continue;
        const dx = o.x - x, dy = (o.y - o.fh / 2) - y, d = Math.hypot(dx, dy);
        if (d < R + o.bw / 2 + 30) {
          const k = Math.max(0.35, 1 - d / (R * 1.5));
          o.hp -= st.dmg * k; o.hurt = 0.45;
          o.vx = Math.sign(dx || 1) * 520 * k; o.vy = -520 * k;
          if (o.hp <= 0) { o.hp = 0; o.ko = true; o.vy = -600; slow = 0.3; finish(F.indexOf(owner)); }
        }
      }
      for (const b of blocks) if (b.hp > 0 && Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y) < R + 22) breakBlock(b, x, y);
    }
    function breakBlock(b, x = b.x + b.w / 2, y = b.y) {
      b.hp = 0;
      for (let i = 0; i < 3; i++) debris.push({ x: b.x + b.w * (i + 0.5) / 3, y: b.y + b.h / 2, w: b.w / 3, h: b.h, vx: (b.x + b.w / 2 - x) * 3 + (Math.random() - 0.5) * 200, vy: -200 - Math.random() * 300, rot: 0, vr: (Math.random() - 0.5) * 12, t: 0, seed: b.seed + i });
      puff(b.x + b.w / 2, b.y + b.h, 3);
    }
    function stepShots(dt) {
      for (const s of shots) {
        s.t += dt; s.vy += (s.owner.st.grav || 260) * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.nade) s.rot += s.vx * dt * 0.05;
        s.trail.push([s.x, s.y]); if (s.trail.length > (s.rocket ? 14 : 8)) s.trail.shift();
        if (s.rocket && Math.random() < 0.5) dust.push({ x: s.x - Math.sign(s.vx) * 10, y: s.y, vx: -s.vx * 0.05, t: 0.1, r: 4 });
        const o = F.find((q) => q !== s.owner);
        const boomy = s.rocket || s.nade;
        if (!s.dead && o && !o.ko && Math.abs(s.x - o.x) < o.bw / 2 + s.r && s.y > o.y - o.fh && s.y < o.y + 4) {
          s.dead = true;
          if (boomy) explode(s.x, s.y, s.owner); else hitFoe(s.owner, o, [s.x, s.y], s.owner.st.dmg * 0.8, s.owner.st.pellets > 1 ? 0.12 : s.owner.st.dmg < 4 ? 0.1 : 0.4);
        }
        if (!s.dead) for (const b of blocks) {
          if (b.hp <= 0 || s.x < b.x || s.x > b.x + b.w || s.y < b.y || s.y > b.y + b.h) continue;
          if (s.nade) { if (s.vy > 0) { s.y = b.y - 1; s.vy = -s.vy * 0.45; s.vx *= 0.7; } else s.vy = Math.abs(s.vy) * 0.4; break; }
          s.dead = true;
          if (s.rocket) explode(s.x, s.y, s.owner);
          else { b.hp--; for (let i = 0; i < 3; i++) parts.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, t: 0.3, c: dark ? '#8a6a45' : '#c99a5e', r: 2 + Math.random() * 2 }); if (b.hp <= 0) breakBlock(b, s.x, s.y); }
          break;
        }
        if (!s.dead && s.y > GROUND) {
          if (s.nade) { s.y = GROUND; s.vy = -s.vy * 0.45; s.vx *= 0.7; if (Math.abs(s.vy) < 60) s.vy = 0; }
          else { s.dead = true; if (s.rocket) explode(s.x, GROUND - 6, s.owner); else puff(s.x, GROUND, 2); }
        }
        if (s.nade && !s.dead && s.t > 1.4) { s.dead = true; explode(s.x, s.y, s.owner); }
        if (s.x < 10 || s.x > W - 10) { if (s.nade) { s.vx = -s.vx * 0.5; s.x = Math.max(11, Math.min(W - 11, s.x)); } else { s.dead = true; if (s.rocket) explode(s.x, s.y, s.owner); } }
        if (s.t > (s.owner.st.life || 3)) s.dead = true;
      }
      shots = shots.filter((s) => !s.dead);
      for (const d of debris) { d.t += dt; d.vy += 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; if (d.y > GROUND - d.h / 2) { d.y = GROUND - d.h / 2; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vr *= 0.5; } }
      debris = debris.filter((d) => d.t < 2.2);
      booms.forEach((b) => { b.t += dt; });
      booms = booms.filter((b) => b.t < 0.5);
    }
    function weaponPts(f) {
      const { hand, phi } = armPose(f);
      return [0.45, 0.72, 1].map((t) => [f.x + f.face * (hand[0] + Math.cos(phi) * f.st.reach * t), f.y + hand[1] + Math.sin(phi) * f.st.reach * t]);
    }
    function hitFoe(f, o, at, dmg0, kb) {
      f.hit = true;
      const dmg = dmg0 * (0.9 + Math.random() * 0.2);
      o.hp -= dmg; o.hurt = kb > 0.6 ? 0.4 : kb > 0.2 ? 0.2 : 0.06;
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
      // Bretter
      const wood = dark ? '#8a6a45' : '#d9b27a', wood2 = dark ? '#6d5235' : '#c39558';
      const plank = (x, y, w, hh, seed, cracks) => {
        ctx.fillStyle = wood; ctx.fillRect(x, y, w, hh);
        ctx.strokeStyle = wood2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 4, y + hh * 0.4); ctx.lineTo(x + w - 6, y + hh * 0.4 + Math.sin(seed) * 2); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
        if (cracks) { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.45, y + hh * 0.5); ctx.lineTo(x + w * 0.35, y + hh); if (cracks > 1) { ctx.moveTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.6, y + hh * 0.6); } ctx.stroke(); }
      };
      for (const b of blocks) if (b.hp > 0) plank(b.x, b.y, b.w, b.h, b.seed, b.max - b.hp);
      for (const d of debris) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, d.t - 1.6) / 0.6); ctx.translate(d.x, d.y); ctx.rotate(d.rot); plank(-d.w / 2, -d.h / 2, d.w, d.h, d.seed, 1); ctx.restore(); }
      // Explosionen
      for (const b of booms) {
        const k = b.t / 0.5;
        ctx.save(); ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + k * 0.7), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2843a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.25 + k * 0.5), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = b.r * (0.5 + k * 0.75) * (i % 2 ? 0.8 : 1.05); ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); }
        ctx.stroke(); ctx.restore();
      }
      // Staub
      for (const q of dust) { ctx.globalAlpha = Math.max(0, 0.35 * (1 - q.t / 0.5)); ctx.fillStyle = dark ? '#cfd6e4' : '#9a978f'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + q.t * 2), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const f of F) drawFighter(ctx, f, false);
      // Schüsse
      for (const s of shots) {
        ctx.strokeStyle = s.c; ctx.lineCap = 'round';
        for (let i = 1; i < s.trail.length; i++) { ctx.globalAlpha = i / s.trail.length * 0.5; ctx.lineWidth = s.r * 2 * i / s.trail.length; ctx.beginPath(); ctx.moveTo(...s.trail[i - 1]); ctx.lineTo(...s.trail[i]); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (s.nade) { const im = presetImage('nade'); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.drawImage(im.img, -im.grip[0] * im.ww, -im.grip[1] * im.wh, im.ww, im.wh); ctx.restore(); continue; }
        if (s.rocket) {
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
          ctx.fillStyle = '#7d8a4e'; ctx.strokeStyle = ink; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(2, -6); ctx.lineTo(-12, -6); ctx.lineTo(-12, 6); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-22 - Math.random() * 8, 0); ctx.lineTo(-12, 4); ctx.fill();
          ctx.restore(); continue;
        }
        ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
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
        for (let i = 0; i < 3; i++) { const a = f.t * 4 + i * 2.1; star(c, f.x - f.face * f.fh * 0.85 + Math.cos(a) * 22, f.floor - 22 + Math.sin(a) * 7, 6, a); }
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
