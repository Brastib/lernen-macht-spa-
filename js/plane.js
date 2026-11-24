// Papierflieger: Eine Seite wird Schritt für Schritt gefaltet und fliegt danach über den Bildschirm.
// Alles in einem Canvas, ohne Bibliotheken. Die Seite selbst bleibt unverändert.
import { h, icon } from './ui.js';
import { WORLDS, worldDef, sizeText, makeWorld, resetWorld, starRain, worldStep, tickWorld, drawWorld, drawWorldOver, miniBase, drawMini, BONUS } from './planeworld.js';

const SW = 360, SH = Math.round(SW * Math.SQRT2);   // Blatt in A4-Form (logische Einheiten)
const RES = 2;                                       // Auflösung der Blatt-Bilder
const L = 190, SPAN = 80;                            // Flieger: Länge und halbe Spannweite (Bildschirm-px)
const PX_PER_M = 150;                                // Spielmaß für die Flugweite
const BEST_KEY = 'planeBest';

// Faltlinien in Blatt-Koordinaten: Punkt a, Punkt b, Testpunkt auf der Seite, die umgeklappt wird
function folds() {
  const y2 = Math.min(SH - 1, (SW / 2) / Math.tan(Math.PI / 8));
  return [
    { a: [SW / 2, 0], b: [0, SW / 2], t: [2, 2] },
    { a: [SW / 2, 0], b: [SW, SW / 2], t: [SW - 2, 2] },
    { a: [SW / 2, 0], b: [0, y2], t: [1, y2 * 0.5] },
    { a: [SW / 2, 0], b: [SW, y2], t: [SW - 1, y2 * 0.5] },
    { a: [SW / 2, 0], b: [SW / 2, SH], t: [1, SH / 2] },
  ].map((f) => {
    const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1], l = Math.hypot(dx, dy);
    let n = [-dy / l, dx / l];
    if ((f.t[0] - f.a[0]) * n[0] + (f.t[1] - f.a[1]) * n[1] < 0) n = [-n[0], -n[1]];
    return { ...f, d: [dx / l, dy / l], n };
  });
}

const mkCanvas = (w = SW * RES, hh = SH * RES) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };

// Halbebene der Faltlinie als Clip (side +1: Klappe, -1: Rest)
function clipHalf(ctx, f, side) {
  const B = 4000, [ax, ay] = f.a, [dx, dy] = f.d, nx = f.n[0] * side, ny = f.n[1] * side;
  ctx.beginPath();
  ctx.moveTo(ax - dx * B, ay - dy * B);
  ctx.lineTo(ax + dx * B, ay + dy * B);
  ctx.lineTo(ax + dx * B + nx * B, ay + dy * B + ny * B);
  ctx.lineTo(ax - dx * B + nx * B, ay - dy * B + ny * B);
  ctx.closePath();
  ctx.clip();
}
// Klappe drehen: senkrecht zur Faltlinie um cos(θ) stauchen (bei θ = π gespiegelt)
function foldMatrix(ctx, f, c) {
  const k = c - 1, [nx, ny] = f.n, an = f.a[0] * nx + f.a[1] * ny;
  ctx.transform(1 + k * nx * nx, k * nx * ny, k * nx * ny, 1 + k * ny * ny, -k * an * nx, -k * an * ny);
}

// Rückseite: Papierfarbe, die Schrift scheint leicht durch
function backOf(S, paper) {
  const c = mkCanvas(), x = c.getContext('2d');
  x.drawImage(S, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = 0.16; x.drawImage(S, 0, 0); x.globalAlpha = 1;
  return c;
}
// dunkle Silhouette für die Licht-Schattierung der Klappe
function darkOf(S) {
  const c = mkCanvas(), x = c.getContext('2d');
  x.drawImage(S, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = 'rgb(20,30,50)'; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// Ein Faltschritt bei Winkel th (0 … π), in Blatt-Einheiten gezeichnet
function drawFold(ctx, st, f, th) {
  const c = Math.cos(th), s = Math.sin(th);
  ctx.save(); clipHalf(ctx, f, -1); ctx.drawImage(st.S, 0, 0, SW, SH); ctx.restore();
  ctx.save();
  if (s > 0.01) { ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 18 * s; ctx.shadowOffsetY = 10 * s; }
  foldMatrix(ctx, f, c);
  clipHalf(ctx, f, 1);
  ctx.drawImage(c >= 0 ? st.S : st.B, 0, 0, SW, SH);
  ctx.restore();
  // Licht: die schräg stehende Klappe wird etwas dunkler
  if (s > 0.02) {
    ctx.save(); foldMatrix(ctx, f, c); clipHalf(ctx, f, 1);
    ctx.globalAlpha = 0.2 * s; ctx.drawImage(st.D, 0, 0, SW, SH);
    ctx.restore();
  }
}

// Nach dem Falten: neues Bild mit Knick-Linie
function bake(st, f, paper) {
  const c = mkCanvas(), x = c.getContext('2d');
  x.scale(RES, RES);
  drawFold(x, st, f, Math.PI);
  x.globalCompositeOperation = 'source-atop';
  x.strokeStyle = 'rgba(40,50,70,.22)'; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(f.a[0], f.a[1]); x.lineTo(f.b[0], f.b[1]); x.stroke();
  return { S: c, B: backOf(c, paper), D: darkOf(c) };
}

// Dreieck auf Dreieck abbilden (für die Flügel-Textur)
function mapTri(ctx, img, s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-6) return;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); ctx.lineTo(u2, v2); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, dd, u0 - a * x0 - c * y0, v0 - b * x0 - dd * y0);
  ctx.drawImage(img, 0, 0, SW, SH);
  ctx.restore();
}

const fill = (el, ...k) => el.replaceChildren(...k.filter(Boolean));
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Power-ups: id → Name, Symbol, Farbe, Wirkung
export const POWERS = {
  turbo: { name: 'Turbo', icon: 'bolt', color: '#f2a516', desc: 'Sofort viel schneller' },
  lift: { name: 'Aufwind', icon: 'up', color: '#17a9bb', desc: 'Steigt hoch und fliegt länger' },
  light: { name: 'Leichtpapier', icon: 'page', color: '#9b62f2', desc: '5 s fast kein Luftwiderstand' },
  glide: { name: 'Gleitflug', icon: 'feather', color: '#25a865', desc: '4 s ohne Höhe zu verlieren' },
  tail: { name: 'Rückenwind', icon: 'wind', color: '#3f6ff0', desc: '3 s Schub von hinten' },
  double: { name: 'Meter ×2', icon: 'x2', color: '#f05a48', desc: '3 s zählt jeder Meter doppelt' },
  magnet: { name: 'Magnet', icon: 'magnet', color: '#e0457b', desc: '6 s fliegen Sterne zu dir', map: true },
  shield: { name: 'Schutzhülle', icon: 'shield', color: '#5c6b84', desc: 'Der nächste Aufprall zählt nicht', map: true },
  rain: { name: 'Sternregen', icon: 'star', color: '#e0a106', desc: 'Legt Sterne vor dir auf die Bahn', map: true },
};
export const POWER_IDS = Object.keys(POWERS);
// Power-ups, die in einer Welt Sinn ergeben (Magnet, Schutzhülle, Sternregen nur auf Karten)
export const powersFor = (world) => POWER_IDS.filter((id) => !POWERS[id].map || (world && world !== 'free'));
export { WORLDS, worldDef, sizeText };
const WORLD_KEY = 'planeWorld';
const bestKey = (w) => (w && w !== 'free' ? BEST_KEY + '_' + w : BEST_KEY);
const POWER_KEY = 'planePower';

export async function paperPlane(pageCanvas, opts = {}) {
  const duel = opts.duel || null;   // { name, note }: ein Wurf, Ergebnis wird zurückgegeben
  let result = null;
  let powerOn = opts.power != null ? !!opts.power : (() => { try { return localStorage.getItem(POWER_KEY) !== '0'; } catch (e) { return true; } })();
  let carry = opts.pick || null, used = false;          // mitgebrachtes Power-up (einmal einsetzbar)
  const fxT = { light: 0, glide: 0, tail: 0, double: 0, magnet: 0, shield: 0 };
  let worldId = opts.world || (() => { try { return localStorage.getItem(WORLD_KEY) || 'desk'; } catch (e) { return 'desk'; } })();
  if (!WORLDS.some((w) => w.id === worldId)) worldId = 'desk';
  let wd = makeWorld(worldId), mini = wd ? miniBase(wd, 200) : null;
  let bonus = 0, nStars = 0, nRings = 0, inBin = false, ghost = 0, bumpCd = 0, steer = null, keySteer = 0, wTrail = [];
  let bubbles = [], nextBubble = 0.6, flashes = [];
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#4f7cff';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const paper = '#f3f1ec';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Blatt vorbereiten: Seite auf A4 zuschneiden (oben bündig, damit der Anfang sichtbar bleibt)
  const front = mkCanvas();
  {
    const x = front.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, front.width, front.height);
    const pw = pageCanvas.width, ph = pageCanvas.height, sc = Math.max(front.width / pw, front.height / ph);
    const dw = pw * sc, dh = ph * sc;
    x.drawImage(pageCanvas, (front.width - dw) / 2, ph / pw > SH / SW ? 0 : (front.height - dh) / 2, dw, dh);
  }
  const F = folds();
  const states = [{ S: front, B: backOf(front, paper), D: darkOf(front) }];
  for (const f of F) states.push(bake(states[states.length - 1], f, paper));

  // ---------- Oberfläche ----------
  const cv = h('canvas.planecv');
  const hint = h('p.planehint', { text: 'Das Blatt wird gefaltet …' });
  const stat = h('div.planestat', { hidden: true });
  const closeBtn = h('button.btn.round.planeclose', { 'aria-label': 'Auffalten und schließen', title: 'Auffalten' }, icon('close'));
  const powBtn = h('button.planepow' + (powerOn ? '.on' : ''), { title: 'Power-ups in der Luft an oder aus', hidden: !!duel }, icon('bolt'), h('span', { text: 'Power-ups' }));
  powBtn.addEventListener('click', () => { powerOn = !powerOn; powBtn.classList.toggle('on', powerOn); try { localStorage.setItem(POWER_KEY, powerOn ? '1' : '0'); } catch (e) { /* egal */ } if (!powerOn) clearBubbles(); });
  const worldBtn = h('button.planepow.planeworldbtn', { title: 'Welt (Karte) wählen', hidden: !!duel }, icon('map'), h('span'));
  const mapCv = h('canvas.planemapcv');
  const mapHead = h('div.planemaphead');
  const mapBox = h('div.planemap', { hidden: true }, mapHead, mapCv);
  const layer = h('div.planebub');
  const useBtn = h('button.planeuse', { hidden: true });
  const drawUse = () => {
    useBtn.hidden = !carry || used || phase === 'land';
    if (!carry) return;
    const P = POWERS[carry];
    useBtn.style.setProperty('--pc', P.color);
    useBtn.replaceChildren(h('span.planeuseic', null, icon(P.icon)), h('span', null, h('b', { text: P.name }), h('small', { text: phase === 'fly' ? 'Jetzt tippen' : 'Im Flug einsetzen' })));
    useBtn.classList.toggle('ready', phase === 'fly' && plane.z > 0);
  };
  useBtn.addEventListener('click', () => { if (phase !== 'fly' || used || !carry || plane.z <= 0) return; used = true; usePower(carry); drawUse(); });
  const root = h('div.planefx' + (dark ? '.dark' : ''), { role: 'dialog', 'aria-label': 'Papierflieger' },
    cv, h('div.planetop', null, h('div.planetitle', null, h('b', { text: duel ? `${duel.name} wirft` : 'Papierflieger' }), h('small', { text: duel ? (duel.note || 'Ein Wurf, so weit wie möglich') : 'Wirf deine Notiz quer über den Bildschirm' })), h('div.planeacts', null, worldBtn, powBtn, closeBtn)),
    mapBox, layer, useBtn, hint, stat);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('in'));
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  // ---------- Zustand ----------
  // phase: fold → open → ready/held/fly/land → home → unfold
  let phase = 'fold', pt = 0, foldIdx = 0, closing = false, done = null;
  const sheetScale = () => Math.min((H * 0.66) / SH, (W * 0.8) / SW);
  const plane = { x: 0, y: 0, z: 0, vx: 0, vy: 0, ang: -Math.PI / 2, span: 0, roll: 0, sc: 1, loop: 0, loopDir: 1 };
  let marks = [], nextMark = 5, ground = { x: 0, y: 0 };
  const homeGround = () => { ground = wd ? { x: wd.start.x - W / 2, y: wd.start.y - (H / 2 + 10) } : { x: 0, y: 0 }; };
  homeGround();
  function sizeMini() {
    if (!wd) { mapBox.hidden = true; return; }
    const w = 200, hh = Math.round(w * wd.h / wd.w);
    mapCv.width = w * 2; mapCv.height = hh * 2; mapCv.style.width = w + 'px'; mapCv.style.height = hh + 'px';
  }
  function drawWorldBtn() { worldBtn.querySelector('span').textContent = worldDef(worldId).name; }
  drawWorldBtn(); sizeMini();
  root.classList.toggle('world', !!wd);
  function setWorld(id) {
    worldId = id; try { localStorage.setItem(WORLD_KEY, id); } catch (e) { /* egal */ }
    wd = makeWorld(id); mini = wd ? miniBase(wd, 200) : null;
    try { best = parseFloat(localStorage.getItem(bestKey(worldId))) || 0; } catch (e) { best = 0; }
    Object.assign(plane, { x: W / 2, y: H / 2 + 10, vx: 0, vy: 0, z: 0.35, ang: -Math.PI / 2, roll: 0 });
    homeGround(); marks = []; trail = []; wTrail = []; stat.hidden = true;
    drawWorldBtn(); sizeMini(); mapBox.hidden = !wd;
    root.classList.toggle('world', !!wd);
    clearBubbles();
    if (carry && !powersFor(worldId).includes(carry)) carry = null;
    phase = 'ready'; drawUse(); setHint(readyHint());
  }
  const readyHint = () => wd ? 'Wirf mit Schwung. Halte den Stift neben den Flieger, um zu lenken.' : (powerOn ? 'Wirf den Flieger mit Schwung. Tipp in der Luft auf die Power-up-Kugeln.' : 'Nimm den Flieger mit dem Stift oder Finger und wirf ihn mit Schwung.');
  // Welt-Auswahl
  function openWorlds() {
    if (!['ready', 'land'].includes(phase) || root.querySelector('.planeworlds')) return;
    const box = h('div.planeworlds');
    const closeW = () => { box.classList.add('out'); setTimeout(() => box.remove(), 180); };
    const list = h('div.planewlist');
    for (const d of WORLDS) {
      let b0 = 0; try { b0 = parseFloat(localStorage.getItem(bestKey(d.id))) || 0; } catch (e) { /* egal */ }
      const sw = h('canvas.planewsw');
      if (d.w) { const w0 = makeWorld(d.id), base = miniBase(w0, 120); sw.width = base.width; sw.height = base.height; sw.getContext('2d').drawImage(base, 0, 0); }
      else { sw.width = 240; sw.height = 150; const x = sw.getContext('2d'); x.fillStyle = d.color; x.fillRect(0, 0, 240, 150); x.fillStyle = 'rgba(70,100,150,.35)'; for (let yy = 10; yy < 150; yy += 20) for (let xx = 10; xx < 240; xx += 20) { x.beginPath(); x.arc(xx, yy, 2, 0, Math.PI * 2); x.fill(); } }
      list.append(h('button.planewopt' + (d.id === worldId ? '.on' : ''), { on: { click: () => { closeW(); if (d.id !== worldId) setWorld(d.id); } } },
        sw,
        h('span.planewtx', null, h('b', { text: d.name }), h('small', { text: d.desc }), h('em', { text: sizeText(d) + (b0 ? ` · Rekord ${fmtM(b0)}` : '') }))));
    }
    box.append(h('div.planewcard', null,
      h('div.planewhead', null, h('b', { text: 'Welt wählen' }), h('button.btn.round', { 'aria-label': 'Schließen', on: { click: closeW } }, icon('close'))),
      list));
    box.addEventListener('pointerdown', (e) => { if (e.target === box) closeW(); });
    root.append(box);
  }
  worldBtn.addEventListener('click', openWorlds);
  let trail = [], dist = 0, flyT = 0, held = null, hist = [], thrown = 0;
  let best = 0; try { best = parseFloat(localStorage.getItem(bestKey(worldId))) || 0; } catch (e) { /* egal */ }
  const FOLD_MS = reduce ? 260 : 620, OPEN_MS = reduce ? 250 : 650;

  function setHint(t) { hint.textContent = t; hint.classList.toggle('gone', !t); }
  const fmtM = (m) => m.toFixed(1).replace('.', ',') + ' m';
  function showStat(m, s, rec) {
    stat.hidden = false;
    fill(stat, 
      h('span', null, h('small', { text: 'Flugweite' }), h('b', { text: fmtM(m) })),
      h('span', null, h('small', { text: 'Flugzeit' }), h('b', { text: s.toFixed(1).replace('.', ',') + ' s' })),
      h('span', null, h('small', { text: 'Rekord' }), h('b', { text: fmtM(best) })),
      rec ? h('em.planerec', { text: 'Neuer Rekord!' }) : null);
  }

  // ---------- Power-ups ----------
  function usePower(id) {
    const p = plane, P = POWERS[id];
    if (id === 'turbo') { const sp = Math.hypot(p.vx, p.vy) || 1, ns = Math.min(3600, Math.max(sp * 1.7, 900)); p.vx *= ns / sp; p.vy *= ns / sp; }
    else if (id === 'lift') p.z = Math.min(1.25, Math.max(p.z, 0.2) + 0.5);
    else if (id === 'rain') { if (wd) starRain(wd, p.x + ground.x, p.y + ground.y, p.vx, p.vy); }
    else if (id === 'shield') fxT.shield = 60;
    else fxT[id] = { light: 5, glide: 4, tail: 3, double: 3, magnet: 6 }[id];
    flashes.push({ x: p.x, y: p.y, t: 0, c: P.color, name: P.name });
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* egal */ }
  }
  function clearBubbles() { bubbles.forEach((b) => b.el.remove()); bubbles = []; }
  function spawnBubble() {
    const p = plane, sp = Math.hypot(p.vx, p.vy);
    if (sp < 120) return;
    const ux = p.vx / sp, uy = p.vy / sp, ahead = 230 + Math.random() * 170, side = (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 110);
    const x = clamp(p.x + ux * ahead - uy * side, 50, W - 50), y = clamp(p.y + uy * ahead + ux * side, 130, H - 70);
    const ids = powersFor(worldId), id = ids[(Math.random() * ids.length) | 0], P = POWERS[id];
    const el = h('button.planebubble', { 'aria-label': P.name, style: { '--pc': P.color } }, icon(P.icon));
    const b = { x, y, id, t: 0, el };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (phase !== 'fly' || b.got) return; b.got = true; usePower(id); el.classList.add('got'); setTimeout(() => el.remove(), 260); bubbles = bubbles.filter((q) => q !== b); });
    layer.append(el);
    bubbles.push(b);
  }
  function stepPower(dt) {
    for (const k in fxT) if (fxT[k] > 0 && k !== 'shield') fxT[k] = Math.max(0, fxT[k] - dt);
    if (phase === 'fly' && powerOn && plane.z > 0 && flyT > 0.35) {
      nextBubble -= dt;
      if (nextBubble <= 0 && bubbles.length < 2) { spawnBubble(); nextBubble = 1.1 + Math.random() * 0.9; }
    }
    for (const b of bubbles) {
      b.t += dt;
      if (b.t > 3.2 || phase !== 'fly') { b.el.classList.add('gone'); b.dead = true; setTimeout(() => b.el.remove(), 250); }
      else b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${Math.min(1, b.t * 5)})`;
    }
    bubbles = bubbles.filter((b) => !b.dead);
  }
  function drawFlashes(dt) {
    if (!flashes.length) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 16px -apple-system, system-ui, sans-serif';
    for (const f of flashes) {
      f.t += dt;
      const k = f.t / 0.9;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = f.c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(plane.x, plane.y, 20 + k * 70, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = f.c; ctx.fillText(f.plain ? f.name : f.name + '!', plane.x, plane.y - 46 - k * 24);
    }
    ctx.restore();
    flashes = flashes.filter((f) => f.t < 0.9);
  }
  function drawAura() {
    const act = Object.keys(fxT).filter((k) => fxT[k] > 0);
    if (!act.length || phase !== 'fly') return;
    ctx.save();
    act.forEach((k, i) => {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(flyT * 10 + i);
      ctx.strokeStyle = POWERS[k].color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(plane.x, plane.y, 40 + i * 8, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- Zeichnen ----------
  function drawSheet(alpha = 1, scale = sheetScale()) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 - SW * scale / 2, H / 2 - SH * scale / 2 + 10);
    ctx.scale(scale, scale);
    if (phase === 'fold' || phase === 'unfold') {
      const f = F[foldIdx], th = Math.PI * ease(clamp(pt, 0, 1));
      // weicher Schatten unter dem Blatt
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.drawImage(states[foldIdx].S, 0, 0, SW, SH); ctx.restore();
      ctx.clearRect(-1, -1, 0, 0);
      drawFold(ctx, states[foldIdx], f, th);
    } else {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.drawImage(states[F.length].S, 0, 0, SW, SH); ctx.restore();
    }
    ctx.restore();
  }

  function drawPlane(x, y, ang, z, span, roll, len = 1, alpha = 1) {
    const sc = 1 + z * 0.22;
    const lf = Math.abs(len) < 0.04 ? 0.04 * Math.sign(len || 1) : len;
    const ls = SPAN * span * (1 - Math.max(0, roll) * 0.5), rs = SPAN * span * (1 + Math.min(0, roll) * 0.5);
    // Schatten auf dem Boden
    ctx.save();
    ctx.globalAlpha = alpha * (0.22 - z * 0.08);
    ctx.translate(x + 12 + z * 36, y + 18 + z * 70);
    ctx.rotate(ang + Math.PI / 2); ctx.scale(0.96, 0.96 * lf);
    ctx.filter = `blur(${2 + z * 6}px)`;
    ctx.fillStyle = '#0b1220';
    ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.lineTo(-ls, L / 2); ctx.lineTo(rs, L / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Flieger
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2); ctx.scale(sc, sc * lf);
    const A = [0, -L / 2], C = [0, L / 2 - 6];
    const img = states[0].S, frontSide = lf > 0;
    const tex = frontSide ? img : states[0].B;
    mapTri(ctx, tex, [[SW / 2, 0], [0, SH], [SW / 2, SH]], [A, [-ls, L / 2], C]);
    mapTri(ctx, tex, [[SW / 2, 0], [SW, SH], [SW / 2, SH]], [A, [rs, L / 2], C]);
    // Licht und Kanten
    const shade = (pts, a) => { ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach((p) => ctx.lineTo(...p)); ctx.closePath(); ctx.fillStyle = `rgba(20,30,50,${a})`; ctx.fill(); };
    shade([A, [-ls, L / 2], C], 0.06 + Math.max(0, roll) * 0.22);
    shade([A, [rs, L / 2], C], 0.12 + Math.max(0, -roll) * 0.22);
    ctx.strokeStyle = 'rgba(30,40,60,.28)'; ctx.lineWidth = 1 / sc;
    ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(-ls, L / 2); ctx.lineTo(...C); ctx.lineTo(rs, L / 2); ctx.closePath(); ctx.stroke();
    // Rumpf (Kiel) als schmaler Grat
    ctx.fillStyle = 'rgba(225,222,214,.95)';
    ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(-3, L / 2 + 2); ctx.lineTo(3, L / 2 + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,60,.35)'; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(0, L / 2 + 2); ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], k = i / trail.length;
      ctx.strokeStyle = accent; ctx.globalAlpha = k * 0.35; ctx.lineWidth = 1 + k * 2.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Physik ----------
  function step(dt) {
    const p = plane;
    if (phase === 'held') return;
    if (phase === 'fly') {
      flyT += dt;
      let sp = Math.hypot(p.vx, p.vy);
      // ruhiger Gleitflug; lenken, solange der Stift neben dem Flieger liegt (oder Pfeiltasten)
      p.roll *= 1 - Math.min(1, dt * 5);
      if ((steer || keySteer) && p.z > 0 && sp > 60) {
        let d = keySteer * 2;
        if (steer) { d = Math.atan2(steer.y - p.y, steer.x - p.x) - Math.atan2(p.vy, p.vx); d = Math.atan2(Math.sin(d), Math.cos(d)); }
        const tr = clamp(d, -2.1 * dt, 2.1 * dt), c = Math.cos(tr), s = Math.sin(tr);
        [p.vx, p.vy] = [p.vx * c - p.vy * s, p.vx * s + p.vy * c];
        p.vx *= 1 - 0.06 * dt; p.vy *= 1 - 0.06 * dt;
        p.roll = clamp(p.roll * 0.8 + (tr / dt) * 0.12, -0.6, 0.6);
      }
      const drag = p.z > 0 ? (fxT.light > 0 ? 0.05 : 0.17) : 2.4;
      if (fxT.tail > 0 && p.z > 0 && sp > 20) { p.vx += p.vx / sp * 700 * dt; p.vy += p.vy / sp * 700 * dt; }
      p.vx *= 1 - drag * dt; p.vy *= 1 - drag * dt;
      sp = Math.hypot(p.vx, p.vy);
      if (p.z > 0) { const dz = ((sp - 380) / 2400 - 0.05) * dt; p.z = Math.min(1.25, p.z + (fxT.glide > 0 ? Math.max(0, dz) : dz)); }
      if (p.z <= 0) { p.z = 0; p.roll *= 0.9; }
      const ox = p.x, oy = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (wd) worldPhys(dt, ox, oy);
      if (phase !== 'fly') return;
      dist += Math.hypot(p.x - ox, p.y - oy) * (fxT.double > 0 ? 2 : 1);
      // 5-Meter-Marken auf dem Boden
      while (dist >= nextMark * PX_PER_M) { marks.push({ x: p.x, y: p.y, m: nextMark }); nextMark += 5; }
      follow(dt);
      sp = Math.hypot(p.vx, p.vy);
      if (sp > 30) p.ang = Math.atan2(p.vy, p.vx);
      trail.push([p.x, p.y]); if (trail.length > 46) trail.shift();
      if (p.z === 0 && sp < 14) land();
    } else if (trail.length) trail.shift();
    // nach der Landung: Flieger sanft in die Mitte holen, damit die Ergebnis-Karte ihn nicht verdeckt
    if (phase === 'land' && !held) { const k = Math.min(1, dt * 3); shift((p.x - W / 2) * k, (p.y - H * 0.4) * k); }
  }

  // Welt: Hindernisse, Wind, Sterne, Ringe, Papierkorb
  function pop(text, c) { flashes.push({ x: plane.x, y: plane.y, t: 0, c, name: text, plain: true }); }
  function worldPhys(dt, ox, oy) {
    const p = plane;
    ghost = Math.max(0, ghost - dt); bumpCd = Math.max(0, bumpCd - dt);
    const w = { x: p.x + ground.x, y: p.y + ground.y, vx: p.vx, vy: p.vy, z: p.z };
    worldStep(wd, w, { x: ox + ground.x, y: oy + ground.y }, dt, { magnet: fxT.magnet > 0, ghost: ghost > 0 }, {
      star: () => { nStars++; bonus += BONUS.star; },
      ring: () => { nRings++; bonus += BONUS.ring; pop(`Ring +${BONUS.ring} m`, '#2fbf71'); },
      bin: () => { if (!inBin) { inBin = true; bonus += BONUS.bin; pop(`Treffer! +${BONUS.bin} m`, '#2fbf71'); } },
      bump: () => {
        if (fxT.shield > 0) { fxT.shield = 0; ghost = 0.7; pop('Schutzhülle', POWERS.shield.color); return 'shield'; }
        if (!bumpCd) { pop('Bumm', '#f05a48'); bumpCd = 0.4; if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) { /* egal */ } }
      },
      wall: () => { if (!bumpCd) { pop('Rand', '#f05a48'); bumpCd = 0.4; } },
      zone: (z) => { const n = { lift: 'Aufwind', gust: 'Windböe', storm: 'Gewitter', cloud: 'Wolke' }[z.k]; if (n) pop(n, { lift: '#e0a106', gust: '#3f6ff0', storm: '#5c6b84', cloud: '#8aa0b8' }[z.k]); },
    });
    p.x = w.x - ground.x; p.y = w.y - ground.y; p.vx = w.vx; p.vy = w.vy; p.z = w.z;
    if (inBin) { p.vx *= 0.2; p.vy *= 0.2; p.z = 0; land(); }
  }

  // Kamera folgt dem Flieger: statt Abprallen wandert der Boden mit
  function follow(dt) {
    const p = plane, mx = W * 0.3, top = 110, my = (H - top) * 0.28;
    let sx = 0, sy = 0;
    if (p.x > W - mx) sx = p.x - (W - mx); else if (p.x < mx) sx = p.x - mx;
    if (p.y > H - my) sy = p.y - (H - my); else if (p.y < top + my) sy = p.y - (top + my);
    const k = Math.min(1, dt * 7);
    shift(sx * k, sy * k);
  }
  function shift(sx, sy) {
    const p = plane;
    if (!sx && !sy) return;
    p.x -= sx; p.y -= sy; ground.x += sx; ground.y += sy;
    for (const t of trail) { t[0] -= sx; t[1] -= sy; }
    for (const m of marks) { m.x -= sx; m.y -= sy; }
    for (const b of bubbles) { b.x -= sx; b.y -= sy; }
  }
  function drawGround() {
    if (wd) { drawWorld(ctx, wd, ground.x, ground.y, W, H, dark); drawMarks(); return; }
    const sp = 34, ox = -((ground.x % sp) + sp) % sp, oy = -((ground.y % sp) + sp) % sp;
    ctx.save();
    ctx.fillStyle = dark ? 'rgba(170,190,230,.16)' : 'rgba(70,100,150,.2)';
    for (let y = oy; y < H; y += sp) for (let x = ox; x < W; x += sp) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    drawMarks();
  }
  function drawMarks() {
    ctx.save();
    ctx.font = '600 12px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const m of marks) {
      if (m.x < -60 || m.x > W + 60 || m.y < -40 || m.y > H + 40) continue;
      const t = m.m ? `${m.m} m` : 'Start', w = ctx.measureText(t).width + 16;
      ctx.fillStyle = dark ? 'rgba(30,38,54,.85)' : 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.roundRect(m.x - w / 2, m.y + 14, w, 20, 10); ctx.fill();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? '#cfd8ea' : '#3b4558'; ctx.fillText(t, m.x, m.y + 24.5);
    }
    ctx.restore();
  }

  function land() {
    phase = 'land';
    clearBubbles(); drawUse();
    steer = null;
    const flown = dist / PX_PER_M, m = flown + bonus;
    const bonusSpan = () => h('span', null, h('small', { text: 'Bonus' }), h('b', { text: '+' + fmtM(bonus) }));
    if (duel) {
      result = m;
      stat.hidden = false;
      fill(stat, 
        h('span', null, h('small', { text: duel.name }), h('b', { text: fmtM(m) })),
        wd ? bonusSpan() : h('span', null, h('small', { text: 'Flugzeit' }), h('b', { text: flyT.toFixed(1).replace('.', ',') + ' s' })),
        h('button.btn.primary.planenext', { text: 'Weiter', on: { click: () => startClose() } }));
      setHint('');
      return;
    }
    const rec = m > best + 0.05;
    if (rec) { best = m; try { localStorage.setItem(bestKey(worldId), String(best)); } catch (e) { /* egal */ } }
    if (wd) {
      stat.hidden = false;
      fill(stat, 
        h('span', null, h('small', { text: 'Weite' }), h('b', { text: fmtM(flown) })),
        bonusSpan(),
        h('span', null, h('small', { text: 'Gesamt' }), h('b', { text: fmtM(m) })),
        h('span', null, h('small', { text: 'Rekord' }), h('b', { text: fmtM(best) })),
        rec ? h('em.planerec', { text: 'Neuer Rekord!' }) : null,
        h('button.btn.planenext', { text: 'Zum Start', on: { click: () => { stat.hidden = true; setWorld(worldId); } } }));
      setHint(inBin ? 'Im Papierkorb gelandet! Heb den Flieger auf und wirf nochmal.' : 'Heb den Flieger auf und wirf nochmal.');
      return;
    }
    showStat(m, flyT, rec);
    setHint('Heb den Flieger auf und wirf nochmal.');
  }

  // ---------- Eingabe ----------
  const near = (x, y) => Math.hypot(x - plane.x, y - plane.y) < 90;
  cv.addEventListener('pointerdown', (e) => {
    if (!['ready', 'fly', 'land'].includes(phase)) return;
    if (phase === 'fly' && (duel || !near(e.offsetX, e.offsetY))) {
      if (!steer) { cv.setPointerCapture(e.pointerId); steer = { id: e.pointerId, x: e.offsetX, y: e.offsetY }; }
      return;
    }
    if (duel && phase !== 'ready') return;
    if (!near(e.offsetX, e.offsetY)) return;
    cv.setPointerCapture(e.pointerId);
    held = { id: e.pointerId, dx: plane.x - e.offsetX, dy: plane.y - e.offsetY };
    hist = [[performance.now(), e.offsetX, e.offsetY]];
    phase = 'held'; plane.z = 0.45; plane.loop = 0; trail = []; marks = [];
    root.classList.add('holding');
  });
  cv.addEventListener('pointermove', (e) => {
    if (steer && e.pointerId === steer.id) { steer.x = e.offsetX; steer.y = e.offsetY; return; }
    if (!held || e.pointerId !== held.id) return;
    const nx = e.offsetX + held.dx, ny = e.offsetY + held.dy;
    const mx = nx - plane.x, my = ny - plane.y;
    if (Math.hypot(mx, my) > 2) {
      const target = Math.atan2(my, mx);
      let d = target - plane.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
      plane.ang += d * 0.35;
      plane.roll = clamp(d * 0.8, -0.7, 0.7);
    }
    plane.x = clamp(nx, 30, W - 30); plane.y = clamp(ny, 90, H - 30);
    const now = performance.now();
    hist.push([now, e.offsetX, e.offsetY]);
    while (hist.length > 2 && now - hist[0][0] > 90) hist.shift();
  });
  const release = (e) => {
    if (steer && e.pointerId === steer.id) { steer = null; return; }
    if (!held || e.pointerId !== held.id) return;
    held = null; root.classList.remove('holding');
    const now = performance.now();
    const a = hist[0], b = hist[hist.length - 1], dt = Math.max(16, b[0] - a[0]) / 1000;
    let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt;
    if (now - b[0] > 120) { vx = 0; vy = 0; }
    const sp = Math.hypot(vx, vy), cap = 3400;
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    Object.assign(plane, { vx, vy, z: 0.6, loop: 0, roll: 0 });
    if (Math.hypot(vx, vy) > 40) plane.ang = Math.atan2(vy, vx);
    if (Math.hypot(vx, vy) < 60) { plane.vx = Math.cos(plane.ang) * 90; plane.vy = Math.sin(plane.ang) * 90; plane.z = 0.25; }
    dist = 0; flyT = 0; thrown++; nextMark = 5; marks = [{ x: plane.x, y: plane.y, m: 0 }];
    stat.hidden = true;
    setHint('');
    phase = 'fly';
    for (const k in fxT) fxT[k] = 0;
    bonus = 0; nStars = 0; nRings = 0; inBin = false; ghost = 0; steer = null; resetWorld(wd); wTrail = [];
    clearBubbles(); nextBubble = 0.6;
    if (!duel) used = false;
    drawUse();
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);

  // ---------- Schließen: zurück zur Mitte, Flügel zu, auffalten ----------
  let home = null;
  function startClose() {
    if (closing) return;
    closing = true;
    held = null;
    stat.hidden = true; setHint('');
    if (phase === 'fold') { finish(); return; }
    mapBox.hidden = true; root.querySelector('.planeworlds')?.remove();
    home = { x: plane.x, y: plane.y, ang: plane.ang, z: plane.z };
    phase = 'home'; pt = 0;
  }
  function finish() {
    root.classList.remove('in');
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    setTimeout(() => { root.remove(); done && done(result); }, 260);
    cancelAnimationFrame(raf);
  }
  closeBtn.addEventListener('click', startClose);
  const onKey = (e) => {
    if (e.key === 'Escape') startClose();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keySteer = e.key === 'ArrowLeft' ? -1 : 1; e.preventDefault(); }
  };
  const onKeyUp = (e) => { if ((e.key === 'ArrowLeft' && keySteer < 0) || (e.key === 'ArrowRight' && keySteer > 0)) keySteer = 0; };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  // Übersichtskarte und Anzeige oben links
  let hudKey = '', miniN = -1;
  function drawHud() {
    if (!wd || mapBox.hidden) return;
    const wx = plane.x + ground.x, wy = plane.y + ground.y;
    if (phase === 'fly') { const l = wTrail[wTrail.length - 1]; if (!l || Math.hypot(l[0] - wx, l[1] - wy) > 120) wTrail.push([wx, wy]); }
    if (++miniN % 4 === 0) drawMini(mapCv, mini, wd, wx, wy, ground.x, ground.y, W, H, wTrail);
    const m = phase === 'fly' || phase === 'land' ? dist / PX_PER_M + bonus : 0;
    const key = `${m.toFixed(1)}|${nStars}|${nRings}|${fxT.shield > 0}`;
    if (key === hudKey) return;
    hudKey = key;
    fill(mapHead, 
      h('b', { text: fmtM(m) }),
      h('span.planemapst', null, icon('star'), h('span', { text: String(nStars) })),
      h('span.planemapst', null, icon('target'), h('span', { text: String(nRings) })),
      fxT.shield > 0 ? h('span.planemapst.sh', null, icon('shield')) : null);
  }

  // ---------- Hauptschleife ----------
  let last = performance.now(), raf = 0;
  function frame(now) {
    const dt = Math.min(0.04, (now - last) / 1000); last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (wd) tickWorld(wd, dt);
    drawGround();
    const cx = W / 2, cy = H / 2 + 10, ss = sheetScale();
    const planeAt = { x: cx, y: cy - SH * ss / 2 + L / 2 * 1.0, ang: -Math.PI / 2 };

    if (phase === 'fold') {
      pt += dt * 1000 / FOLD_MS;
      if (pt >= 1) { foldIdx++; pt = 0; if (foldIdx >= F.length) { phase = 'open'; pt = 0; foldIdx = F.length - 1; } }
      if (phase === 'fold') drawSheet();
    }
    if (phase === 'open') {
      pt = Math.min(1, pt + dt * 1000 / OPEN_MS);
      const e = ease(pt);
      drawSheet(1 - clamp(pt * 2.2, 0, 1), ss + (L / SH - ss) * e * 0.9);
      Object.assign(plane, { x: cx, y: cy + (planeAt.y - cy) * 0 , ang: -Math.PI / 2, span: e, z: e * 0.35 });
      drawPlane(plane.x, plane.y, plane.ang, plane.z, plane.span, 0, 1, clamp(pt * 2, 0, 1));
      if (pt >= 1) { phase = 'ready'; drawUse(); mapBox.hidden = !wd; setHint(readyHint()); }
    } else if (phase === 'home') {
      pt = Math.min(1, pt + dt * 1000 / (reduce ? 200 : 520));
      const e = ease(pt);
      let da = -Math.PI / 2 - home.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      Object.assign(plane, { x: home.x + (cx - home.x) * e, y: home.y + (cy - home.y) * e, ang: home.ang + da * e, z: home.z + (0.35 - home.z) * e, roll: plane.roll * (1 - e) });
      drawTrail();
      drawPlane(plane.x, plane.y, plane.ang, plane.z, 1, plane.roll);
      if (pt >= 1) { phase = 'close'; pt = 0; }
    } else if (phase === 'close') {
      pt = Math.min(1, pt + dt * 1000 / OPEN_MS);
      const e = ease(pt);
      drawPlane(cx, cy, -Math.PI / 2, 0.35 * (1 - e), 1 - e, 0, 1, 1 - clamp(pt * 2.2, 0, 1));
      drawSheet(clamp((pt - 0.45) * 2.4, 0, 1), L / SH * 0.9 + (ss - L / SH * 0.9) * e);
      if (pt >= 1) { phase = 'unfold'; foldIdx = F.length - 1; pt = 1; }
    } else if (phase === 'unfold') {
      pt -= dt * 1000 / (reduce ? 150 : 300);
      if (pt <= 0) { foldIdx--; pt = 1; if (foldIdx < 0) { foldIdx = 0; pt = 0; drawSheet(); finish(); return; } }
      drawSheet();
    } else if (phase !== 'fold') {
      if (phase !== 'open') {
        step(dt);
        drawTrail();
        let len = 1;
        if (plane.loop > 0) len = Math.cos((1 - plane.loop) * Math.PI * 2);
        drawAura();
        drawPlane(plane.x, plane.y, plane.ang, plane.z, 1, plane.roll, len);
        if (wd) drawWorldOver(ctx, wd, ground.x, ground.y, W, H);
        drawFlashes(dt);
        drawHud();
        stepPower(dt);
        if (carry && !used && !!useBtn.classList.contains('ready') !== (phase === 'fly' && plane.z > 0)) drawUse();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return new Promise((r) => { done = r; });
}
