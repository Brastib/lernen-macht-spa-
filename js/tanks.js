// Papierpanzer (v96): großes Artillerie-Spiel auf Papier.
// Bis zu 8 Panzer (Menschen und Computer), Teams, viele Modi, 12 Karten, Wetter, 36 Waffen, Extras, Kisten, Minen,
// Gelände geht kaputt, Upgrades aus der Garage. battle() spielt eine Partie, tanks() ist das schnelle Duell für Turnier/Duelle.
import { h, icon, toast } from './ui.js';
import { FONT, isDark, inkOf, prect, pcirc, shade, canvasBox, chip, rng } from './sketch.js';
import { WEAPONS, W, CLASSIC, EXTRAS, MAPS, MAP, MODE, garage, findMap, OP_IDS, NORMAL_IDS, STRONG_IDS, OP_MAX } from './tankdata.js';

const GRAV = 420, SPEED = 85, FUEL_PX = 1.7;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Schnelles Duell (Turnier, Duell zu zweit, gegen Computer) ----------
export function tanks(fx, A, B, o = {}) {
  const pool = MAPS.filter((m) => !['city'].includes(m.id));
  const map = pool[(Math.random() * pool.length) | 0].id;
  return battle(fx, { players: [{ ...A }, { ...B, cpu: o.cpu ? 2 : 0 }], mode: 'ffa', map, weather: 'map', opts: { ups: 0 }, duel: true })
    .then((r) => (r ? { w: r.winner, detail: r.detail } : null));
}

// ---------- Eine Partie ----------
// cfg: { players: [{name, color, cpu (0 = Mensch, 1-4 Stärke), team, boss}], mode, map, weather, opts }
// Ergebnis: { ranking: [{i, name, color, cpu, team, place, score, kills, dmg}], winner (Index bei 2 Spielern), detail, solo }
export function battle(fx, cfg) {
  return new Promise((resolve) => {
    const mode = MODE[cfg.mode] || MODE.ffa;
    const O = Object.assign({ hp: 100, rounds: 8, wind: 1, crates: 1, fuel: 1, timer: 0, arsenal: 'all', ammo: 1, ff: 0, aim: 1, grav: 0, fall: 1, cpu: 2, ups: 1 }, cfg.opts || {});
    const R = rng((Math.random() * 1e9) | 0);
    const map = (cfg.map !== 'random' && findMap(cfg.map)) || MAPS[(R() * MAPS.length) | 0];
    const dark = isDark(), ink = inkOf(dark);
    const night = !!map.night;
    const scoreMode = mode.kind === 'score', solo = mode.kind === 'solo';
    const N = cfg.players.length;
    const TW = N <= 2 ? 1200 : N <= 4 ? 1500 : 1800, THL = Math.round(TW * 0.54);
    // Hochkant: mehr Himmel oben, das Gelände bleibt gleich
    const tall = typeof window !== 'undefined' && window.innerHeight > window.innerWidth * 1.1;
    const TH = tall ? Math.round(TW * 0.95) : THL, OFF = TH - THL;
    const grav = GRAV * (O.grav || map.grav || 1);
    const windK = (map.wind ?? 1) * [0, 1, 1.8, 2.6][O.wind];
    // ---------- Wetter ----------
    const WXS = ['clear', 'rain', 'snow', 'storm', 'fog', 'thunder'];
    let wx = cfg.weather === 'map' || !cfg.weather ? map.weather || 'clear' : cfg.weather === 'mixed' ? WXS[(R() * WXS.length) | 0] : cfg.weather;
    const mixed = cfg.weather === 'mixed';
    // ---------- Gelände ----------
    const ground = new Float32Array(TW);
    { const f = map.gen(R, 1200, 696), sx = 1200 / TW, sy = THL / 696; for (let i = 0; i < TW; i++) ground[i] = clamp(f(i * sx) * sy + OFF, 70 + OFF, TH - 24); }   // Karten sind für 1200×696 gebaut und werden skaliert
    const gAt = (px) => ground[clamp(Math.round(px), 0, TW - 1)];
    const waterY = map.water ? OFF + THL * map.water : Infinity, lavaY = map.lava ? OFF + THL * map.lava : Infinity;
    let inkY = mode.id === 'ink' ? TH + 10 : Infinity;
    const hazardY = () => Math.min(waterY, lavaY, inkY);
    // ---------- Pfützen (Regen sammelt sich) + Schneedecke ----------
    const CS = 4, NC = Math.ceil(TW / CS);
    const pool = new Float32Array(NC), cg = new Float32Array(NC);   // Wassertiefe je Zelle, Boden je Zelle
    const snow = new Float32Array(TW);
    const SNOW_MAX = 22, DROWN = 24;
    let wetK = 0, snowSmoothT = 0;
    if (wx === 'snow') for (let i = 0; i < TW; i++) snow[i] = 9;
    const raining = () => wx === 'rain' || wx === 'thunder';
    const cellOf = (px) => clamp(Math.floor(px / CS), 0, NC - 1);
    function cellGround() { for (let c = 0; c < NC; c++) { let s = 0, n = 0; for (let i = c * CS; i < Math.min(TW, c * CS + CS); i++) { s += ground[i]; n++; } cg[c] = s / n; } }
    cellGround();
    // Wasseroberfläche an Stelle px (Infinity = trocken)
    const poolTop = (px) => { const c = cellOf(px); return pool[c] > 0.6 ? cg[c] - pool[c] : Infinity; };
    const poolDepth = (px) => { const c = cellOf(px); return pool[c] > 0.6 ? Math.max(0, gAt(px) - (cg[c] - pool[c])) : 0; };
    const snowAt = (px) => snow[clamp(Math.round(px), 0, TW - 1)];
    const dryAt = (px, m) => gAt(px) < hazardY() - m && poolDepth(px) < 4;
    function waterStep(dt) {
      cellGround();
      const hz = hazardY();
      if (raining()) { const r = (wx === 'thunder' ? 0.2 : 0.16) * dt; for (let c = 0; c < NC; c++) pool[c] += r; }
      // Boden saugt etwas auf, bei Sonne verdunstet es langsam
      const soak = (raining() ? 0.1 : wx === 'snow' ? 0.02 : 0.05) * dt;
      for (let c = 0; c < NC; c++) pool[c] = Math.max(0, pool[c] - (pool[c] < 3 ? soak : soak * 0.25));
      // Fließen: Wasser läuft zum Nachbarn mit tieferer Oberfläche
      for (let pass = 0; pass < 8; pass++) {
        const fw = pass % 2 === 0;
        for (let k = 0; k < NC - 1; k++) {
          const c = fw ? k : NC - 2 - k, a = cg[c] - pool[c], b = cg[c + 1] - pool[c + 1];
          if (a < b - 0.01 && pool[c] > 0) { const m = Math.min(pool[c], (b - a) * 0.5); pool[c] -= m; pool[c + 1] += m; }
          else if (b < a - 0.01 && pool[c + 1] > 0) { const m = Math.min(pool[c + 1], (a - b) * 0.5); pool[c + 1] -= m; pool[c] += m; }
        }
        pool[0] = 0; pool[NC - 1] = 0;   // läuft am Rand ab
      }
      // Meer, Lava, Tinte schlucken das Wasser
      for (let c = 0; c < NC; c++) if (cg[c] - pool[c] > hz - 2) pool[c] = 0;
      // zusammenhängende Pfützen glatt ziehen (flache Oberfläche)
      for (let c = 0; c < NC;) {
        if (pool[c] < 1) { c++; continue; }
        let e = c, V = 0, lo = Infinity, hi = -Infinity;
        while (e < NC && pool[e] >= 1) { V += pool[e]; lo = Math.min(lo, cg[e]); hi = Math.max(hi, cg[e]); e++; }
        let L0 = lo - V, L1 = hi;
        for (let it = 0; it < 22; it++) { const L = (L0 + L1) / 2; let v = 0; for (let k = c; k < e; k++) v += Math.max(0, cg[k] - L); if (v > V) L0 = L; else L1 = L; }
        const L = (L0 + L1) / 2, sea = hz < Infinity && [c - 1, e].some((k) => k >= 0 && k < NC && cg[k] > hz - 2);
        for (let k = c; k < e; k++) pool[k] = sea ? 0 : Math.max(0, cg[k] - L);   // berührt das Meer: läuft ab
        c = e;
      }
      // Schnee: fällt, rutscht von steilen Hängen, schmilzt sonst (Schmelzwasser läuft in die Pfützen)
      if (wx === 'snow') {
        const add = 0.2 * dt;
        for (let i = 2; i < TW - 2; i++) {
          if (ground[i] > hz - 4) { snow[i] = 0; continue; }
          const sl = Math.abs(ground[i + 2] - ground[i - 2]) / 4, cap = SNOW_MAX * clamp(1.6 - sl, 0.15, 1);
          snow[i] = Math.min(cap, snow[i] + add * (pool[cellOf(i)] > 1 ? 0 : 1));
        }
      } else {
        const m = (raining() ? 0.6 : wx === 'clear' ? 0.12 : 0.05) * dt;
        for (let i = 0; i < TW; i++) if (snow[i] > 0) { const d = Math.min(snow[i], m); snow[i] -= d; pool[cellOf(i)] += d * 0.35 / CS; }
      }
      snowSmoothT += dt;
      if (snowSmoothT > 0.4) { snowSmoothT = 0; for (let i = 1; i < TW - 1; i++) snow[i] = snow[i] * 0.6 + (snow[i - 1] + snow[i + 1]) * 0.2; }
      wetK = clamp(wetK + (raining() ? dt / 20 : -dt / 40), 0, 1);
      // Panzer: Schneehaube, Ertrinken
      for (const t of T) {
        if (t.dead) continue;
        if (wx === 'snow') t.snowCap = Math.min(7, (t.snowCap || 0) + dt * 0.35); else t.snowCap = Math.max(0, (t.snowCap || 0) - dt * 0.5);
        if (t.hurt > 0.9) t.snowCap = 0;
        if (t.fallFrom != null) continue;
        // Lava: wer sie berührt, schmilzt. Wasser/Tinte (Pfütze, Meer): wer ganz untergeht, ist raus.
        const inLava = t.y > lavaY + 3;
        const dep = Math.max(poolDepth(t.x), t.y - waterY, t.y - inkY, 0);
        const inInk = t.y - inkY > t.y - waterY && t.y - inkY >= poolDepth(t.x);
        if (dep > 8 && dep <= DROWN * t.scale && !inLava && !t.wetWarn) { t.wetWarn = true; pop(t.x, t.y - 90, inInk ? 'Tinte steigt!' : 'Wasser steigt!', inInk ? '#3d3dbd' : '#2f7fd6'); }
        if (dep < 4) t.wetWarn = false;
        let how = null;
        if (inLava) { how = 'lava'; for (let k = 0; k < 26; k++) parts.push({ x: t.x + (R() - 0.5) * 50, y: lavaY, vx: (R() - 0.5) * 160, vy: -80 - R() * 220, t: 0, life: 0.9, kind: 'spark', c: k % 2 ? '#ffb02e' : '#ff5a14', r: 3 }); smoke(t.x, lavaY - 10, 10); }
        else if (dep > DROWN * t.scale) { how = inInk ? 'ink' : 'water'; for (let k = 0; k < 18; k++) parts.push({ x: t.x + (R() - 0.5) * 40, y: t.y - dep, vx: (R() - 0.5) * 80, vy: -60 - R() * 140, t: 0, life: 0.9, kind: 'drop', c: inInk ? '#6a6aff' : '#7fb8ff', r: 2.5 }); }
        if (how) {
          pop(t.x, t.y - 90, how === 'lava' ? 'Geschmolzen!' : 'Untergegangen!', how === 'lava' ? '#e0483e' : how === 'ink' ? '#3d3dbd' : '#2f7fd6');
          t.liq = how; t.shield = 0; dealDamage(t, t.hp + 999, null);
          if (t.dead) { const f = feed[feed.length - 1]; if (f) f.txt = how === 'lava' ? `${t.p.name} ist in der Lava geschmolzen` : how === 'ink' ? `${t.p.name} ist in der Tinte versunken` : `${t.p.name} ist untergegangen`; if (t === cur() && phase === 'aim' && !over) { phase = 'settle'; cpuDrive = null; syncCtrl(); later(nextTurn, 1000); } }
        }
      }
    }
    function wetBlast(cx, cy, r) {
      for (let c = cellOf(cx - r); c <= cellOf(cx + r); c++) if (Math.abs(c * CS + CS / 2 - cx) < r && cg[c] - pool[c] < cy + r) pool[c] *= 0.45;
      let puff = 0;
      for (let i = Math.max(0, Math.floor(cx - r * 1.2)); i < Math.min(TW, Math.ceil(cx + r * 1.2)); i++) { const f = 1 - Math.abs(i - cx) / (r * 1.2); if (snow[i] > 0) { puff += snow[i] * f; snow[i] = Math.max(0, snow[i] - snow[i] * f * 1.4); } }
      for (let k = 0; k < Math.min(24, puff / 20); k++) parts.push({ x: cx + (R() - 0.5) * r, y: cy - 6, vx: (R() - 0.5) * 300, vy: -R() * 260 - 40, t: 0, life: 1, kind: 'drop', c: '#ffffff', r: 2 + R() * 2.5 });
    }
    // Hintergrund-Berge (nur Deko)
    const far = [0, 1].map((k) => { const p = R() * 6, a = 40 + R() * 40; return Array.from({ length: 41 }, (_, j) => OFF + THL * (0.42 + k * 0.1) - a * Math.sin(j / 40 * Math.PI * (2 + k) + p) - 20 * Math.sin(j * 1.7 + p)); });
    // Deko am Boden je nach Karte (Bäume, Kakteen, Tannen, Felsen, Laternen, Palmen)
    const PROP = { meadow: ['tree', 'flower', 'tree', 'bush'], twin: ['tree', 'bush', 'flower'], steps: ['bush', 'flower', 'tree'], peaks: ['pine', 'pine', 'rock'], glacier: ['pine', 'rock'], dunes: ['cactus', 'cactus', 'rock'], canyon: ['rock', 'cactus'], mesa: ['rock', 'cactus', 'rock'], volcano: ['dead', 'rock'], moon: ['rock', 'flag'], city: ['lamp', 'lamp', 'bush'], islands: ['palm', 'palm', 'bush'] }[map.theme || map.id] || ['bush'];
    const props = []; for (let px = 30 + R() * 60; px < TW - 30; px += 70 + R() * 110) props.push({ x: px, k: PROP[(R() * PROP.length) | 0], s: 0.95 + R() * 0.55, f: R() < 0.5 ? -1 : 1 });
    const stones = Array.from({ length: Math.round(TW / 22) }, () => ({ x: R() * TW, d: 20 + R() * 200, r: 2 + R() * 4 }));
    const clouds = Array.from({ length: 6 }, (_, k) => ({ x: R() * TW, y: 50 + R() * 130, s: 0.6 + R() * 0.7, k }));
    const stars = night || dark ? Array.from({ length: 60 }, () => ({ x: R() * TW, y: R() * TH * 0.5, s: R() })) : [];

    // ---------- Arsenal ----------
    let arsenal;
    if (O.arsenal === 'classic') arsenal = CLASSIC.slice();
    else if (O.arsenal === 'few') arsenal = ['ball'];
    else if (O.arsenal === 'deck') { const rest = NORMAL_IDS.filter((id) => id !== 'ball').sort(() => R() - 0.5); arsenal = ['ball', ...rest.slice(0, 9)]; }
    else arsenal = NORMAL_IDS.slice();
    const ammoOf = (id) => (W[id].n === Infinity || O.ammo >= 99 ? Infinity : W[id].n * O.ammo);

    // ---------- Panzer ----------
    const T = cfg.players.map((p, i) => {
      const cpu = p.cpu ? clamp(p.cpu, 1, 4) : 0;
      const g = garage(p.name), up = (O.ups && !cpu && !cfg.duel) ? g.up : {};
      const lv = (k) => up[k] || 0;
      const boss = !!p.boss;
      const hpMax = (mode.id === 'glass' ? 40 : O.hp) * (boss ? Math.max(3, 1.6 + 1.3 * (N - 1)) : 1) + [0, 10, 20, 30][lv('armor')];
      const fuelMax = O.fuel >= 99 ? 99999 : 100 * O.fuel * (1 + [0, 0.25, 0.5, 0.8][lv('engine')]);
      const ammo = {}; arsenal.forEach((id) => { ammo[id] = ammoOf(id) * (boss && ammoOf(id) !== Infinity ? 2 : 1); });
      if (lv('ammo') >= 1 && ammo.big != null) ammo.big += 1;
      if (lv('ammo') >= 2 && ammo.cluster != null) ammo.cluster += 1;
      if (lv('ammo') >= 3 && ammo.nuke != null) ammo.nuke += 1;
      const ex = [1 + (lv('tools') >= 1) + (lv('tools') >= 3), 1, 1, 1, 1];
      return {
        p, i, cpu, boss, team: mode.coop ? (boss ? 1 : 0) : mode.teams ? (p.team ?? (i % 2)) : i,
        x: 0, y: 0, vy: 0, ang: 45, pow: 62, hpMax, hp: hpMax, fuelMax, fuel: fuelMax,
        shield: [0, 12, 22, 32][lv('shield')], ammo, ex, healAmt: lv('tools') >= 2 ? 40 : 30, w: 'ball',
        dmgMul: 1 + [0, 0.06, 0.12, 0.18][lv('barrel')], scopeLv: lv('scope'), grab: 34 + [0, 30, 60, 60][lv('magnet')], crateX2: lv('magnet') >= 3,
        body: boss ? 'crown' : g.body, pat: boss ? 'gold' : g.pat, scale: boss ? 1.7 : 1,
        dead: false, score: 0, kills: 0, dmg: 0, deaths: 0, poison: 0, chute: false, scope: false, usedEx: false, hurt: 0, lost: 0, roll: 0, fallFrom: null, lastBy: null, slide: 0, turns: 0,
      };
    });
    // Startplätze: gleichmäßig verteilt, auf trockenem Boden
    {
      const order = T.map((_, k) => k).sort(() => R() - 0.5);
      order.forEach((ti, k) => {
        let x0 = TW * (0.06 + 0.88 * (k + 0.5) / N) + (R() - 0.5) * TW / N * 0.3;
        if (gAt(x0) > hazardY() - 16) { let best = null; for (let s = 0; s < 400; s++) { const xx = 40 + R() * (TW - 80); if (dryAt(xx, 30) && T.every((o) => o.i === ti || !o.x || Math.abs(o.x - xx) > 80)) { if (!best || Math.abs(xx - x0) < Math.abs(best - x0)) best = xx; } } if (best != null) x0 = best; }
        T[ti].x = clamp(x0, 40, TW - 40);
      });
      T.forEach((t) => { flat(t.x, 34 * t.scale); t.y = gAt(t.x); });
      T.forEach((t) => { const foe = T.filter((o) => o !== t).sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0]; t.ang = foe && foe.x < t.x ? 135 : 45; });
    }
    function flat(cx, half) { const x0 = Math.round(cx), g = ground[clamp(x0, 0, TW - 1)]; for (let k = -half - 18; k <= half + 18; k++) { const xx = x0 + k, w = clamp((half + 18 - Math.abs(k)) / 18, 0, 1); if (xx >= 0 && xx < TW) ground[xx] = g * w + ground[xx] * (1 - w); } }

    // Zielscheiben (Solo-Modus)
    let targets = [], shots = 0;
    if (solo) {
      const me = T[0];
      for (let k = 0; k < 7; k++) {
        let tx = 0; for (let s = 0; s < 50; s++) { tx = 60 + R() * (TW - 120); if (Math.abs(tx - me.x) > 180 && targets.every((q) => Math.abs(q.x - tx) > 70)) break; }
        const air = k % 3 === 2; targets.push({ x: tx, y: air ? gAt(tx) - 140 - R() * 160 : gAt(tx), air, hit: false, bob: R() * 6 });
      }
    }

    // ---------- Zustand ----------
    let turn = T.findIndex(() => true), shells = [], booms = [], parts = [], crates = [], pops = [], flames = [], mines = [], beams = [], bolts = [], feed = [];
    if (!solo) turn = (R() * N) | 0;
    if (mode.coop) turn = T.findIndex((t) => !t.boss);
    let phase = 'aim', raf = 0, last = 0, turnsDone = 0, over = false, msg = '', msgT = 0, shake = 0, flash = 0, settleT = 0, wind = 0, timeLeft = 0;
    let dirty = false, keyL = 0, keyR = 0, dragX = null, cpuDrive = null, hill = null, deathOrder = [], rainP = [], ripples = [], resultSent = false;
    const totalTurns = scoreMode ? O.rounds * N : solo ? 25 : 60 * N;
    const newWind = () => { const v = (R() * 2 - 1) * windK * (wx === 'storm' ? 2.2 : 1); wind = Math.round(v * 10) / 10; };
    newWind();
    if (mode.id === 'hill') moveHill();
    let shotHits = new Map(), trees = [], pendingFx = 0, scorches = [];
    // ---------- Gespeichertes Spiel laden ----------
    const S0 = cfg.resume;
    if (S0) {
      const dy = OFF - S0.OFF;
      for (let i = 0; i < TW; i++) ground[i] = clamp((S0.ground[i] ?? ground[i]) + dy, 70 + OFF, TH - 6);
      if (S0.pool) S0.pool.forEach((v, k) => { if (k < NC) pool[k] = v; });
      if (S0.snow) S0.snow.forEach((v, k) => { if (k < TW) snow[k] = v; });
      wetK = S0.wetK || 0; arsenal = S0.arsenal || arsenal; if (S0.wx) wx = S0.wx;
      turn = S0.turn; turnsDone = S0.turnsDone; wind = S0.wind; shots = S0.shots || 0;
      inkY = S0.inkY == null ? Infinity : S0.inkY + OFF;
      hill = S0.hill || null;
      if (solo && S0.targets) targets = S0.targets.map((q) => ({ ...q, y: q.y + dy }));
      scorches = (S0.scorches || []).map((q) => ({ ...q, y: q.y + dy }));
      crates = (S0.crates || []).map((c) => ({ ...c, y: c.y + dy }));
      mines = (S0.mines || []).map((m) => ({ ...m, y: m.y + dy, o: T[m.o] || null }));
      trees = (S0.trees || []).map((tr) => ({ ...tr, o: T[tr.o] }));
      S0.tanks.forEach((q, k) => {
        const t = T[k]; if (!t) return;
        Object.assign(t, q, { y: q.y + dy, lastBy: q.lastBy != null ? T[q.lastBy] : null, burn: 0, usedEx: false, scope: false, chute: false, fallFrom: null, vy: 0, slide: 0, hurt: 0, lost: 0 });
        t.ammo = {}; Object.entries(q.ammo).forEach(([id, n]) => { t.ammo[id] = n < 0 ? Infinity : n; });
      });
      deathOrder = (S0.deathOrder || []).map((i) => T[i]).filter(Boolean);
    }
    // ---------- Spiel speichern (Platz für ein laufendes Spiel) ----------
    const canSave = !cfg.duel && !cfg.noSave;
    function snapshot() {
      const r1 = (v) => Math.round(v * 10) / 10;
      return {
        v: 1, time: Date.now(), ctx: cfg.saveCtx || null, cfg: { players: cfg.players, mode: mode.id, map: map.id, weather: cfg.weather, opts: O },
        OFF, ground: Array.from(ground, r1), pool: Array.from(pool, r1), snow: Array.from(snow, r1), wetK, arsenal, wx,
        turn, turnsDone, wind, shots, inkY: inkY === Infinity ? null : inkY - OFF, hill, targets: solo ? targets : null, scorches: scorches.slice(-20),
        crates: crates.filter((c) => !c.fall && !c.gone), mines: mines.filter((m) => !m.gone).map((m) => ({ x: m.x, y: m.y, armed: m.armed, o: m.o ? m.o.i : -1 })),
        trees: trees.map((tr) => ({ x: tr.x, o: tr.o.i, left: tr.left, grow: tr.grow })), deathOrder: deathOrder.map((t) => t.i),
        tanks: T.map((t) => ({ x: t.x, y: t.y, ang: t.ang, pow: t.pow, hp: t.hp, hpMax: t.hpMax, fuel: t.fuel, fuelMax: t.fuelMax, shield: t.shield, ex: t.ex, w: t.w, dead: t.dead, score: t.score, kills: t.kills, dmg: t.dmg, deaths: t.deaths, poison: t.poison, liq: t.liq || null, sinkK: t.sinkK || 0, turns: t.turns, lotto: t.lotto || null, deathTurn: t.deathTurn, lastBy: t.lastBy ? t.lastBy.i : null,
          ammo: Object.fromEntries(Object.entries(t.ammo).map(([id, n]) => [id, n === Infinity ? -1 : n])) })),
      };
    }
    const calm = () => phase === 'aim' && !over && !shells.some((s) => !s.dead) && pendingFx === 0 && !flames.length;
    function saveGame(manual) {
      if (!canSave) return false;
      if (!calm()) { if (manual) toast('Speichern geht, sobald alles ruhig ist'); return false; }
      try { localStorage.setItem('tkSave', JSON.stringify(snapshot())); if (manual) toast('Spiel gespeichert. Im Panzer-Menü geht es weiter.'); return true; }
      catch (e) { if (manual) toast('Speichern hat nicht geklappt (Speicher voll?)'); return false; }
    }
    function moveHill() { let hx = TW / 2; for (let s = 0; s < 40; s++) { hx = 120 + R() * (TW - 240); if (dryAt(hx, 30)) break; } hill = { x: hx, w: 150, t: 0 }; }

    // ---------- Oberfläche ----------
    const angIn = h('input.tkrange', { type: 'range', min: 0, max: 180, step: 1, 'aria-label': 'Winkel' });
    const powIn = h('input.tkrange', { type: 'range', min: 10, max: 100, step: 1, 'aria-label': 'Kraft' });
    const angV = h('b'), powV = h('b');
    const mv = (ic, lab) => h('button.ewmove', { 'aria-label': lab, title: lab }, icon(ic));
    const bL = mv('left', 'Nach links fahren'), bR = mv('right', 'Nach rechts fahren');
    const fuelBar = h('span.tkbar.tkfuelbar', null, h('i')), fuelV = h('b');
    const fuelBox = h('div.tkfuel', null, h('small', { text: 'Sprit' }), fuelV, fuelBar);
    const exSeg = h('div.tkextras');
    const wCv = h('canvas.tkwglyph', { width: 64, height: 64 });
    const wName = h('b'), wAmmo = h('small');
    const weapBtn = h('button.tkweapbtn', { 'aria-label': 'Waffe wählen', on: { click: () => togglePanel() } }, wCv, h('span.tkwtx', null, wName, wAmmo), icon('chev-down'));
    const fireBtn = h('button.btn.primary.tkfire', null, icon('target'), h('span', { text: 'Feuer!' }));
    const tip = h('small.ewtip');
    const plEls = T.map((t) => {
      const bar = h('span.tkbar', null, h('i', { style: { background: t.p.color } }));
      const sc = h('em.tkpsc'), sh = h('span.tkshield', null, icon('shield'), h('span'));
      const el = h('div.tkpl', { style: { '--pc': t.p.color } }, h('div.tkhprow', null, chip(t.p), sh, sc), bar);
      return { el, bar, sc, sh };
    });
    const windCv = h('canvas.tkwindcv', { width: 112, height: 44 });
    const infoTop = h('b'), infoSub = h('small'), timerEl = h('span.tktimer');
    const saveBtn = cfg.duel || cfg.noSave ? null : h('button.icbtn.tksavebtn', { 'aria-label': 'Spiel speichern', title: 'Spiel speichern', on: { click: () => saveGame(true) } }, icon('save'));
    const info = h('div.tkinfo', null, h('div.tkinfotx', null, infoTop, infoSub), windCv, timerEl, saveBtn);
    const hud = h('div.hshud.tkhud2', null, h('div.tkplayers' + (N > 4 ? '.many' : ''), null, ...plEls.map((e) => e.el)), info);
    const ctrl = h('div.tkctrl.ewctrl.tkctrl2.tkctrl3', null,
      h('div.tkdrive', null, bL, bR, fuelBox),
      h('label.tklab', null, h('small', { text: 'Winkel' }), angV, angIn),
      h('label.tklab', null, h('small', { text: 'Kraft' }), powV, powIn),
      weapBtn, exSeg, fireBtn, tip);
    const host = h('div.tkfield.ewfield');
    const panel = h('div.tkwpanel', { hidden: true });
    const wrap = h('div.hswrap.tkwrap', null, hud, host, ctrl);
    fx.stage.append(wrap);
    const C = canvasBox(host), x = C.x;
    host.append(panel);
    let U = 1, ox = 0, oy = 0;
    const cur = () => T[turn];
    const human = () => !cur().cpu;
    const canAct = () => phase === 'aim' && human() && !over;
    const avail = (t) => (mode.id === 'lotto' ? [t.lotto || 'ball'] : arsenal.filter((id) => t.ammo[id] > 0));
    const isFoe = (a, b) => a !== b && a.team !== b.team;

    function syncCtrl() {
      const t = cur(), dis = !canAct();
      angIn.value = String(Math.round(t.ang)); powIn.value = String(Math.round(t.pow)); angV.textContent = `${Math.round(t.ang)}°`; powV.textContent = String(Math.round(t.pow));
      const w = W[t.w];
      glyph(wCv.getContext('2d'), w, 64, dark);
      wName.textContent = w.name; wAmmo.textContent = mode.id === 'lotto' ? 'Lotto-Waffe' : t.ammo[t.w] === Infinity ? 'unbegrenzt' : `noch ${t.ammo[t.w]}`;
      weapBtn.disabled = dis || mode.id === 'lotto';
      exSeg.replaceChildren(...EXTRAS.map((e, k) => h('button.tkex', { disabled: dis || !t.ex[k] || t.usedEx || (e.id === 'fuel' && O.fuel >= 99), title: `${e.name}: ${e.d} (${t.ex[k]})`, 'aria-label': e.name, on: { click: () => useExtra(t, k) } },
        icon(e.ic), h('span', { text: e.name }), h('em', { text: String(t.ex[k]) }))));
      [angIn, powIn, fireBtn].forEach((el) => { el.disabled = dis; });
      [bL, bR].forEach((el) => { el.disabled = dis || t.fuel <= 0; });
      fuelV.textContent = O.fuel >= 99 ? '∞' : String(Math.max(0, Math.round(t.fuel)));
      fuelBar.firstChild.style.width = `${clamp(t.fuel / t.fuelMax * 100, 0, 100)}%`;
      ctrl.style.setProperty('--pc', t.p.color);
      tip.textContent = !human() ? `${t.p.name} (Computer) ist dran …` : phase !== 'aim' ? '' : t.fuel > 0 ? 'Pfeile halten oder Panzer ziehen: fahren. Aufs Feld tippen: zielen.' : 'Sprit leer. Aufs Feld tippen: zielen, dann Feuer!';
      const lead = leader();
      plEls.forEach((e, k) => {
        const q = T[k];
        e.bar.firstChild.style.width = `${clamp(q.hp / q.hpMax * 100, 0, 100)}%`;
        e.el.classList.toggle('on', k === turn); e.el.classList.toggle('dead', q.dead);
        e.sh.hidden = !(q.shield > 0); e.sh.lastChild.textContent = String(Math.round(q.shield));
        e.sc.hidden = !scoreMode && !solo; e.sc.textContent = solo ? `${shots} Schüsse` : `${Math.round(q.score)}${mode.id === 'bounty' && lead === q ? ' ★' : ''}`;
      });
      infoTop.textContent = mode.name;
      const roundNo = Math.min(Math.floor(turnsDone / Math.max(1, N)) + 1, scoreMode ? O.rounds : 999);
      infoSub.textContent = solo ? `${targets.filter((q) => q.hit).length} von ${targets.length} Scheiben · ${wxName()}` : `${map.name} · ${wxName()} · ${scoreMode ? `Runde ${roundNo}/${O.rounds}` : `Runde ${roundNo}`}`;
      drawWind();
      timerEl.hidden = !(O.timer && human() && phase === 'aim' && !over);
    }
    const wxName = () => ({ clear: 'Klar', rain: 'Regen', snow: 'Schnee', storm: 'Sturm', fog: 'Nebel', thunder: 'Gewitter' })[wx];
    function drawWind() {
      const c = windCv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 56, 22);
      c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 2; c.lineCap = 'round'; c.font = `700 12px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (Math.abs(wind) < 0.05) { c.fillText('windstill', 28, 11); return; }
      const L = clamp(Math.abs(wind) / 2.6, 0.15, 1) * 40, d = Math.sign(wind), cx = 28;
      c.strokeStyle = Math.abs(wind) > 1.6 ? '#e0483e' : Math.abs(wind) > 0.8 ? '#e0a106' : '#2f9e5b';
      c.beginPath(); c.moveTo(cx - d * L / 2, 8); c.lineTo(cx + d * L / 2, 8); c.lineTo(cx + d * L / 2 - d * 5, 4); c.moveTo(cx + d * L / 2, 8); c.lineTo(cx + d * L / 2 - d * 5, 12); c.stroke();
      c.fillStyle = ink; c.fillText(`Wind ${Math.round(Math.abs(wind) * 10)}`, 28, 18);
    }
    function togglePanel(open = panel.hidden) {
      if (!canAct() && open) return;
      panel.hidden = !open; if (!open) return;
      const t = cur();
      const info2 = h('p.tkwinfo');
      const grid = h('div.tkwgrid', null, ...arsenal.map((id) => {
        const w = W[id], n = t.ammo[id] ?? 0, cv = h('canvas', { width: 64, height: 64 });
        glyph(cv.getContext('2d'), w, 64, dark);
        const b = h('button.tkwcell' + (id === t.w ? '.on' : ''), { disabled: !n, title: w.d, on: { click: () => { t.w = id; togglePanel(false); syncCtrl(); }, pointerenter: () => { info2.textContent = `${w.name}: ${w.d}`; } } },
          cv, h('b', { text: w.name }), h('small', { text: n === Infinity ? '∞' : `×${n}` }));
        return b;
      }));
      info2.textContent = `${W[t.w].name}: ${W[t.w].d}`;
      panel.replaceChildren(h('div.tkwhead', null, h('b', { text: 'Waffe wählen' }), h('button.icbtn', { 'aria-label': 'Schließen', on: { click: () => togglePanel(false) } }, icon('close'))), grid, info2);
    }
    angIn.addEventListener('input', () => { cur().ang = +angIn.value; syncCtrl(); });
    powIn.addEventListener('input', () => { cur().pow = +powIn.value; syncCtrl(); });
    fireBtn.addEventListener('click', () => { if (canAct()) shoot(); });
    const hold = (b, set) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (b.disabled) return; set(1); try { b.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
      const up = () => set(0); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    };
    hold(bL, (v) => { keyL = v; }); hold(bR, (v) => { keyR = v; });
    let aiming = null, driving = null;
    const toW = (e) => { const r = C.cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / U, (e.clientY - r.top - oy) / U]; };
    C.cv.addEventListener('pointerdown', (e) => {
      if (!canAct()) return; e.preventDefault(); if (!panel.hidden) togglePanel(false);
      const [wx2, wy] = toW(e), t = cur();
      if (t.fuel > 0 && Math.abs(wx2 - t.x) < 42 * t.scale && wy > t.y - 50 * t.scale && wy < t.y + 22) { driving = e.pointerId; dragX = wx2; }
      else { aiming = e.pointerId; aimAt([wx2, wy]); }
      try { C.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
    });
    C.cv.addEventListener('pointermove', (e) => { if (aiming === e.pointerId) aimAt(toW(e)); else if (driving === e.pointerId) dragX = toW(e)[0]; });
    const endPtr = (e) => { if (aiming === e.pointerId) aiming = null; if (driving === e.pointerId) { driving = null; dragX = null; } };
    C.cv.addEventListener('pointerup', endPtr); C.cv.addEventListener('pointercancel', endPtr);
    function aimAt([wx2, wy]) { const t = cur(), [px, py] = pivot(t), dx = wx2 - px, dy = py - wy; t.ang = clamp(Math.round(Math.atan2(Math.max(0, dy), dx) * 180 / Math.PI), 0, 180); t.pow = clamp(Math.round(Math.hypot(dx, dy) / 3.2), 10, 100); syncCtrl(); }
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
      if (e.code === 'KeyA' || e.code === 'KeyD') { if (e.code === 'KeyA') keyL = e.type === 'keydown' ? 1 : 0; else keyR = e.type === 'keydown' ? 1 : 0; e.preventDefault(); return; }
      if (e.type !== 'keydown' || !canAct()) return; const t = cur();
      if (e.code === 'ArrowLeft') t.ang = Math.min(180, t.ang + 1); else if (e.code === 'ArrowRight') t.ang = Math.max(0, t.ang - 1);
      else if (e.code === 'ArrowUp') t.pow = Math.min(100, t.pow + 1); else if (e.code === 'ArrowDown') t.pow = Math.max(10, t.pow - 1);
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shoot(); return; } else if (e.code === 'KeyW') { togglePanel(); return; } else return;
      e.preventDefault(); syncCtrl();
    };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!fx.signal.aborted) fn(); }, ms); timers.add(id); };
    const cleanup = () => { cancelAnimationFrame(raf); C.ro.disconnect(); timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); if (typeof window !== 'undefined' && window.__tk && window.__tk.T === T) window.__tk = null; };
    fx.signal.addEventListener('abort', () => { cleanup(); if (!resultSent) { resultSent = true; resolve(null); } });

    // ---------- Fahren ----------
    const tilt = (t) => (t.dead ? 0.18 : clamp(Math.atan2(gAt(t.x + 18 * t.scale) - gAt(t.x - 18 * t.scale), 36 * t.scale), -0.55, 0.55));
    const pivot = (t) => { const a = tilt(t); return [t.x + Math.sin(a) * 16 * t.scale, t.y - Math.cos(a) * 16 * t.scale]; };
    const muzzle = (t, ang = t.ang) => { const a = ang * Math.PI / 180, [px, py] = pivot(t); return [px + Math.cos(a) * 30 * t.scale, py - Math.sin(a) * 30 * t.scale]; };
    const fuelCost = (t) => (map.fuelCost || 1) * (wx === 'snow' ? 1.2 : 1) * (1 + (t ? snowAt(t.x) : 0) / 30) * (t && poolDepth(t.x) > 3 ? 1.3 : 1);
    function drive(t, dir, dt) {
      if (t.fuel <= 0 || !dir) return false;
      const g0 = gAt(t.x); if (t.y < g0 - 2) return false;
      let step = dir * SPEED * dt;
      const nx = clamp(t.x + step, 26, TW - 26);
      if (Math.abs(nx - t.x) < 0.01) return false;
      if (T.some((o) => o !== t && !o.dead && Math.abs(nx - o.x) < 30 * (t.scale + o.scale) && Math.abs(nx - o.x) < Math.abs(t.x - o.x))) return false;
      const climb = g0 - gAt(nx), slope = climb / Math.abs(nx - t.x);
      if (slope > 2.4 && climb > 5) { if (!t.bump) { t.bump = 1; pop(t.x, t.y - 60, 'Zu steil!', ink); } return false; }
      t.bump = 0;
      if (slope > 0) step *= Math.max(0.5, 1 - slope * 0.3);
      const nx2 = clamp(t.x + step, 26, TW - 26);
      if (O.fuel < 99) t.fuel = Math.max(0, t.fuel - Math.abs(nx2 - t.x) / FUEL_PX * (1 + Math.max(0, slope) * 0.6) * fuelCost(t));
      t.roll += (nx2 - t.x) * 0.3; t.snowCap = Math.max(0, (t.snowCap || 0) - Math.abs(nx2 - t.x) * 0.05); t.x = nx2; const g = gAt(t.x); if (t.y > g || g - t.y < 6) t.y = g;
      if (R() < 0.3) parts.push({ x: t.x - dir * 22, y: t.y - 2, vx: -dir * (20 + R() * 30), vy: -20 - R() * 30, t: 0, life: 0.6, kind: 'dust', r: 3 + R() * 3 });
      pickCrates(t); checkMines();
      return true;
    }
    function pickCrates(t) {
      for (const c of crates) { if (c.gone || c.fall || t.dead) continue; if (Math.abs(c.x - t.x) < t.grab && Math.abs(c.y - t.y) < 60) { c.gone = true; giveCrate(t, c); } }
      crates = crates.filter((c) => !c.gone);
    }
    function giveCrate(t, c) {
      const r = c.kind, mul = t.crateX2 ? 2 : 1; let txt;
      const giveW = (id, n) => { if (!arsenal.includes(id)) arsenal.push(id); if (t.ammo[id] !== Infinity) t.ammo[id] = (t.ammo[id] || 0) + n; };
      if (r === 'gold') { const id = OP_IDS[(R() * OP_IDS.length) | 0]; giveW(id, mul); txt = `Gold: ${W[id].name}!`; sparkle(c.x, c.y - 20, '#f2b632'); sparkle(c.x, c.y - 30, '#ffd84d'); flash = Math.max(flash, 0.3); }
      else if (r === 'epic') { const pool = STRONG_IDS.slice().sort(() => R() - 0.5).slice(0, 2); pool.forEach((id) => giveW(id, mul)); txt = `Episch: ${pool.map((id) => W[id].name).join(' + ')}`; sparkle(c.x, c.y - 20, '#a46bff'); }
      else if (r === 'hp') { const add = Math.min(t.hpMax - t.hp, 25 * mul); t.hp += add; txt = `+${add} Leben`; }
      else if (r.startsWith('w:')) { const id = r.slice(2), add = (['big', 'nuke'].includes(id) ? 1 : 2) * mul; if (t.ammo[id] !== Infinity) t.ammo[id] = (t.ammo[id] || 0) + add; txt = `+${add} ${W[id].name}`; }
      else { const k = +r.slice(2); t.ex[k] += mul; txt = `+${mul} ${EXTRAS[k].name}`; }
      if (mode.id === 'crates') { addScore(t, 30 * mul); txt += ` · +${30 * mul}`; }
      pop(c.x, c.y - 50, txt, t.p.color); syncCtrl();
    }
    function dropCrate() {
      const pool = arsenal.filter((id) => id !== 'ball');
      const kinds = ['hp', 'hp', 'e:0', 'e:1', 'e:2', 'e:3', 'e:4', ...pool.map((id) => 'w:' + id)];
      const roll = R(), boost = mode.id === 'crates' ? 1.7 : 1;
      const tier = roll < 0.07 * boost ? 'gold' : roll < 0.25 * boost ? 'epic' : 'normal';
      let cx = 0; for (let k = 0; k < 30; k++) { cx = 80 + R() * (TW - 160); if (T.every((t) => Math.abs(t.x - cx) > 70) && dryAt(cx, 20)) break; }
      crates.push({ x: cx, y: -30, fall: true, kind: tier === 'normal' ? kinds[(R() * kinds.length) | 0] : tier, tier, sway: R() * 6 });
      msg = tier === 'gold' ? 'Goldene Kiste!' : tier === 'epic' ? 'Epische Kiste!' : 'Nachschub-Kiste!'; msgT = tier === 'normal' ? 1.1 : 1.6;
    }
    function useExtra(t, k) {
      if (!canAct() || !t.ex[k] || t.usedEx) return;
      applyExtra(t, k); syncCtrl();
    }
    function applyExtra(t, k) {
      t.ex[k]--; t.usedEx = true;
      const id = EXTRAS[k].id;
      if (id === 'heal') { const add = Math.min(t.healAmt, t.hpMax - t.hp); t.hp += add; pop(t.x, t.y - 70, `+${add} Leben`, '#2f9e5b'); sparkle(t.x, t.y - 20, '#2fbf71'); }
      else if (id === 'shield') { t.shield = Math.max(t.shield, 35); pop(t.x, t.y - 70, 'Schild an', t.p.color); }
      else if (id === 'fuel') { t.fuel = t.fuelMax; pop(t.x, t.y - 70, 'Tank voll', t.p.color); }
      else if (id === 'chute') { t.chute = true; pop(t.x, t.y - 70, 'Fallschirm bereit', t.p.color); }
      else { t.scope = true; pop(t.x, t.y - 70, 'Zielhilfe an', t.p.color); }
    }
    // Meldungen so setzen, dass sie weder Namensschilder, Schadenszahlen noch andere Meldungen überdecken
    const pop = (px, py, text, color) => {
      const w = text.length * 12 + 24;
      for (const t of T) if (Math.abs(px - t.x) < 70 * t.scale + w / 2) py = Math.min(py, (t.tagY ?? t.y - 58 * t.scale) - 74);
      for (let k = 0; k < 8; k++) { const hit = pops.find((q) => q.t < 1.4 && Math.abs(q.x - px) < (q.w + w) / 2 && Math.abs((q.y - q.t * 30) - py) < 28); if (!hit) break; py = hit.y - hit.t * 30 - 30; }
      pops.push({ x: clamp(px, w / 2 + 6, TW - w / 2 - 6), y: Math.max(40, py), text, color, t: 0, w });
    };
    function sparkle(px, py, color) { for (let k = 0; k < 14; k++) parts.push({ x: px + (R() - 0.5) * 40, y: py + (R() - 0.5) * 20, vx: (R() - 0.5) * 60, vy: -40 - R() * 80, t: 0, life: 0.9, kind: 'spark', c: color, r: 2 + R() * 2 }); }

    // ---------- Punkte, Schaden ----------
    function leader() { if (mode.id !== 'bounty') return null; const s = T.slice().sort((a, b) => b.score - a.score)[0]; return s && s.score > 0 ? s : null; }
    function addScore(t, n) { t.score += n; }
    function dealDamage(t, dmg, o, w) {
      if (t.dead || dmg <= 0) return 0;
      if (o && o !== t && o.team === t.team && !O.ff) return 0;
      const friendly = o && o !== t && o.team === t.team;
      if (o) dmg *= o.dmgMul;
      if (mode.id === 'glass') dmg *= 2;
      if (w && w.op) { const used = shotHits.get(t) || 0; dmg = Math.min(dmg, OP_MAX - used); if (dmg <= 0) return 0; shotHits.set(t, used + Math.round(dmg)); }
      dmg = Math.round(dmg);
      if (t.shield > 0) { const ab = Math.min(t.shield, dmg); t.shield -= ab; dmg -= ab; if (t.shield <= 0) pop(t.x, t.y - 95, 'Schild kaputt', ink); }
      if (dmg <= 0) return 0;
      const lead = leader();
      const real = Math.min(dmg, Math.max(0, t.hp));
      t.hp -= dmg; t.hurt = 1; t.lost += dmg; if (o) t.lastBy = o; dirty = true;
      if (o && isFoe(o, t)) { o.dmg += real; if (scoreMode) addScore(o, real * (lead === t ? 2 : 1)); }
      if (w && w.leech && o && !o.dead) { const add = Math.min(o.hpMax - o.hp, Math.round(dmg * w.leech)); if (add > 0) { o.hp += add; pop(o.x, o.y - 70, `+${add}`, '#2f9e5b'); } }
      if (w && w.poison) t.poison = w.poison;
      if (friendly && t.hp > 0 && (t.ffT || 0) < turnsDone + 1) { t.ffT = turnsDone + 1; pop(t.x, t.y - 95, 'Eigenes Team!', '#e0a106'); }
      if (t.hp <= 0) kill(t, o, lead === t);
      return dmg;
    }
    // Panzer-Explosion: erst Funken und Stichflamme, dann großer Feuerball, Turm fliegt weg, Wrack brennt nach
    function tankBlast(t) {
      const cx = t.x, cy = t.y - 14 * t.scale, sc = t.scale;
      t.burn = 7;
      pop(cx, t.y - 70 * sc, 'Zerstört!', '#e0483e');
      booms.push({ x: cx, y: cy, r: 34 * sc, t: 0 });
      for (let k = 0; k < 18; k++) parts.push({ x: cx, y: cy, vx: (R() - 0.5) * 520, vy: -R() * 420, t: 0, life: 0.4, kind: 'spark', c: k % 2 ? '#ffd166' : '#ff7a1a', r: 2 });
      shake = Math.max(shake, 6);
      fxLater(() => {
        booms.push({ x: cx, y: cy - 6, r: 115 * sc, t: 0, big: true });
        flash = Math.max(flash, 0.35); shake = Math.max(shake, 18);
        for (let k = 0; k < 42; k++) { const a = -Math.PI * R(), sp = 160 + R() * 560; parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.8 + R() * 1.1, kind: 'ember', r: 1.5 + R() * 2.5 }); }
        for (let k = 0; k < 16; k++) parts.push({ x: cx, y: cy, vx: (R() - 0.5) * 460, vy: -180 - R() * 420, t: 0, life: 1.8, kind: 'chunk', r: 3 + R() * 4, rot: R() * 6, c: k % 3 ? t.p.color : '#555' });
        parts.push({ x: cx, y: cy - 10, vx: (R() - 0.5) * 220, vy: -560, t: 0, life: 2.4, kind: 'chunk', r: 9 * sc, rot: 0, c: t.p.color });   // Turm
        for (let k = 0; k < 14; k++) parts.push({ x: cx + (R() - 0.5) * 60 * sc, y: cy - R() * 50 * sc, vx: wind * 14 + (R() - 0.5) * 50, vy: -25 - R() * 45, t: 0, life: 2.6 + R() * 1.6, kind: 'smoke', r: 14 + R() * 16 });
        for (let k = 0; k < 20; k++) parts.push({ x: cx + (R() - 0.5) * 24, y: cy, vx: (R() - 0.5) * 60, vy: -260 - R() * 280, t: 0, life: 0.6, kind: 'spark', c: k % 2 ? '#ff7a1a' : '#ffe27a', r: 3 });
        scorches.push({ x: cx, y: t.y, r: 70 * sc }); if (scorches.length > 40) scorches.shift();
      }, 320);
      fxLater(() => booms.push({ x: cx, y: cy - 44 * sc, r: 62 * sc, t: 0, big: true }), 420);
      fxLater(() => { booms.push({ x: cx + (R() - 0.5) * 40, y: cy - 20, r: 45 * sc, t: 0 }); shake = Math.max(shake, 7); }, 760);
    }
    function kill(t, o, wasLead) {
      t.dead = true; t.hp = 0; t.deaths++; t.poison = 0; t.deathTurn = turnsDone; deathOrder.push(t);
      if (t.liq) { t.lost = 0; t.hurt = 0; } else tankBlast(t);
      if (o && isFoe(o, t)) { o.kills++; if (scoreMode) addScore(o, 50 * (wasLead ? 2 : 1)); feed.push({ txt: `${o.p.name} erwischt ${t.p.name}`, c: o.p.color, t: 0 }); }
      else if (o && o !== t && o.team === t.team) feed.push({ txt: `${o.p.name} erwischt ${t.p.name} (eigenes Team)`, c: o.p.color, t: 0 });
      else if (o === t) feed.push({ txt: `${t.p.name} hat sich selbst erwischt`, c: t.p.color, t: 0 });
      else feed.push({ txt: `${t.p.name} ist raus`, c: t.p.color, t: 0 });
      if (feed.length > 4) feed.shift();
    }
    function carve(cx, cy, r) {
      for (let i = Math.max(0, Math.floor(cx - r)); i < Math.min(TW, Math.ceil(cx + r)); i++) { const d = Math.sqrt(Math.max(0, r * r - (i - cx) ** 2)); if (ground[i] < cy + d && cy - d < ground[i] + 400) ground[i] = Math.max(ground[i], cy + d); ground[i] = Math.min(TH - 6, ground[i]); }
    }
    function debris(cx, cy, n, sp = 1) { for (let k = 0; k < n; k++) parts.push({ x: cx, y: cy, vx: (R() - 0.5) * 420 * sp, vy: -R() * 360 * sp - 60, t: 0, life: 1.2, kind: 'chunk', r: 2 + R() * 4, rot: R() * 6, c: k % 3 ? map.soil[1] : map.top }); }
    function smoke(cx, cy, n) { for (let k = 0; k < n; k++) parts.push({ x: cx + (R() - 0.5) * 30, y: cy + (R() - 0.5) * 20, vx: (R() - 0.5) * 40 + wind * 12, vy: -30 - R() * 40, t: 0, life: 1.4 + R() * 0.8, kind: 'smoke', r: 8 + R() * 10 }); }
    function explode(cx, cy, w, o, opt = {}) {
      const r = w.r;
      if (!opt.noCarve && r > 0) carve(cx, cy, r);
      if (w.deep) carve(cx, cy + r * 0.6, r * 0.9);
      if (w.flood) addWater(cx, w.flood);
      if (r > 0) wetBlast(cx, cy, r);
      booms.push({ x: cx, y: cy, r, t: 0, c: w.c, ring: w.k === 'ring', big: r > 70 });
      if (r > 0) { for (let k = 0; k < 8 + r / 5; k++) { const a = -Math.PI * R(), sp = 120 + R() * 380 * Math.min(1.6, r / 50); parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.7 + R() * 0.8, kind: 'ember', r: 1.5 + R() * 2 }); } for (let k = 0; k < 2 + r / 25; k++) parts.push({ x: cx + (R() - 0.5) * r * 0.6, y: cy - R() * r * 0.4, vx: wind * 14 + (R() - 0.5) * 20, vy: -18 - R() * 26, t: 0, life: 2.4 + R() * 1.4, kind: 'smoke', r: r * 0.18 + R() * 10 }); if (!opt.noCarve) { scorches.push({ x: cx, y: cy, r }); if (scorches.length > 40) scorches.shift(); } }
      debris(cx, cy, Math.round(6 + r / 6)); smoke(cx, cy, Math.round(3 + r / 14));
      for (let k = 0; k < 8; k++) parts.push({ x: cx, y: cy, vx: (R() - 0.5) * 600, vy: (R() - 0.5) * 600, t: 0, life: 0.35, kind: 'spark', c: '#ffcf5a', r: 2 });
      shake = Math.max(shake, Math.min(18, r / 6)); if (r > 100) flash = 0.5;
      for (const t of T) {
        if (t.dead) continue;
        const d = Math.hypot(t.x - cx, t.y - 12 * t.scale - cy), rr = r + 20 * t.scale;
        if (w.k === 'ring') { if (d > w.inner && d < rr) dealDamage(t, w.dmg * (0.6 + 0.4 * (1 - Math.abs(d - (w.inner + rr) / 2) / ((rr - w.inner) / 2))), o, w); continue; }
        if (d >= rr) continue;
        let dmg = w.dmg * (1 - d / rr) ** 0.7 + 3;
        if (opt.direct === t) dmg = Math.max(dmg, w.dmg * 0.95) + (w.bonus || 0);
        dealDamage(t, dmg, o, w);
      }
      crates = crates.filter((c) => { const hit = !c.fall && Math.hypot(c.x - cx, c.y - 12 - cy) < r + 10; if (hit) { debris(c.x, c.y - 12, 8, 0.6); pop(c.x, c.y - 40, 'Kiste kaputt', ink); } return !hit; });
      if (solo) for (const q of targets) if (!q.hit && Math.hypot(q.x - cx, q.y - (q.air ? 0 : 30) - cy) < r + 22) { q.hit = true; pop(q.x, q.y - 60, 'Treffer!', '#2f9e5b'); sparkle(q.x, q.y - 30, '#f2b632'); }
      for (const m of mines) if (!m.gone && Math.abs(m.x - cx) < r + 10 && Math.abs(m.y - cy) < r + 10) { m.gone = true; later(() => explode(m.x, m.y - 4, W.mine, m.o), 120); }
      mines = mines.filter((m) => !m.gone || m.wait);
    }
    function checkMines() {
      for (const m of mines) {
        if (m.gone || !m.armed) continue;
        const t = T.find((q) => !q.dead && Math.abs(q.x - m.x) < 24 * q.scale && Math.abs(q.y - m.y) < 30);
        if (t) { m.gone = true; pop(m.x, m.y - 40, 'Mine!', '#e0483e'); explode(m.x, m.y - 4, W.mine, m.o); }
      }
      mines = mines.filter((m) => !m.gone);
    }
    function heal(cx, cy, w) {
      booms.push({ x: cx, y: cy, r: w.r, t: 0, heal: true });
      for (const t of T) { if (t.dead) continue; const d = Math.hypot(t.x - cx, t.y - 12 - cy); if (d < w.r + 20) { const add = Math.min(t.hpMax - t.hp, -w.dmg); if (add > 0) { t.hp += add; dirty = true; pop(t.x, t.y - 70, `+${add}`, '#2f9e5b'); } sparkle(t.x, t.y - 20, '#2fbf71'); } }
    }
    function lightning(px, o, w) {
      const gy = gAt(px), pts = [[px + (R() - 0.5) * 80, -10]];
      for (let k = 1; k <= 9; k++) pts.push([px + (R() - 0.5) * 50 * (1 - k / 10), -10 + (gy + 10) * k / 9]);
      pts[pts.length - 1] = [px, gy];
      bolts.push({ pts, t: 0 }); flash = Math.max(flash, 0.7);
      explode(px, gy, w, o);
    }

    // ---------- Schüsse ----------
    const speedK = (w) => (w.k === 'snipe' ? 1.45 : w.k === 'shot' ? 1.5 : 1);
    const fxLater = (fn, ms) => { pendingFx++; later(() => { pendingFx--; fn(); }, ms); };
    const mk = (x0, y0, vx, vy, w, o, ex = {}) => ({ x: x0, y: y0, vx, vy, w, o, trail: [], age: 0, mode: 'fly', hops: w.hops || 0, ...ex });
    function shoot() {
      const t = cur(), w = W[t.w];
      if (!(t.ammo[t.w] > 0) && mode.id !== 'lotto') return;
      togglePanel(false); keyL = keyR = 0; driving = null; dragX = null;
      if (mode.id !== 'lotto' && t.ammo[t.w] !== Infinity) { t.ammo[t.w]--; if (!t.ammo[t.w]) t.w = 'ball'; }
      if (solo) shots++;
      const a = t.ang * Math.PI / 180, v = t.pow * 8.4 * speedK(w), [mx, my] = muzzle(t);
      shotHits = new Map();
      t.kick = 1; smoke(mx, my, 3); booms.push({ x: mx, y: my, r: 16, t: 0, muzzle: true, ang: a });
      shells = [];
      if (w.k === 'beam') { fireBeam(t, mx, my, a, w); }
      else if (w.k === 'volley') { for (let k = 0; k < w.shots; k++) { const vv = v; shells.push(mk(mx, my, Math.cos(a) * vv, -Math.sin(a) * vv, w, t, { wait: k * 0.2 })); } }
      else if (w.split) { for (let k = 0; k < w.split; k++) { const d = (k - (w.split - 1) / 2) * w.spread, vv = v * (w.pows ? w.pows[k] : 1); shells.push(mk(mx, my, Math.cos(a + d) * vv, -Math.sin(a + d) * vv, w, t, { wait: w.pows ? k * 0.12 : 0 })); } }
      else shells.push(mk(mx, my, Math.cos(a) * v, -Math.sin(a) * v, w, t));
      phase = 'fly'; settleT = 0; syncCtrl();
    }
    function fireBeam(t, mx, my, a, w) {
      const dx = Math.cos(a), dy = -Math.sin(a); let px = mx, py = my, hitT = null;
      for (let s = 0; s < 900; s++) {
        px += dx * 3; py += dy * 3;
        if (px < 0 || px >= TW || py < -400 || py > TH) break;
        hitT = T.find((q) => q !== t && !q.dead && Math.abs(px - q.x) < 26 * q.scale && py > q.y - 24 * q.scale && py < q.y + 6);
        if (hitT || py >= ground[Math.round(px)]) break;
      }
      beams.push({ x0: mx, y0: my, x1: px, y1: py, t: 0, c: w.c });
      if (px >= 0 && px < TW && py <= TH) explode(px, py, w, t, { direct: hitT });
      settleT = 0;
    }
    function spawnSubs(s, n, opts) {
      const sw = { ...s.w, k: 'std', split: 0, sub: 0, n: 0 };
      if (opts.r) sw.r = opts.r; if (opts.dmg) sw.dmg = opts.dmg;
      for (let k = 0; k < n; k++) {
        const f = n > 1 ? k / (n - 1) - 0.5 : 0;
        shells.push(mk(s.x, s.y, opts.vx ? opts.vx(f, k) : s.vx, opts.vy ? opts.vy(f, k) : s.vy, sw, s.o, { sub: true, wait: opts.wait ? opts.wait(k) : 0, x: opts.x ? opts.x(f, k) : s.x, y: opts.y ? opts.y(f, k) : s.y }));
      }
    }
    function impact(s, direct) {
      const w = s.w, o = s.o; s.dead = true;
      switch (w.k) {
        case 'cluster': explode(s.x, s.y, { ...w, r: 26, dmg: 14 }, o, { direct }); spawnSubs(s, w.sub, { vx: (f) => f * 360 + (R() - 0.5) * 40, vy: () => -240 - R() * 160, y: () => s.y - 8 }); break;
        case 'air': {
          booms.push({ x: s.x, y: s.y, r: 18, t: 0, c: w.c }); pop(s.x, s.y - 40, w.op ? `${w.name}!` : 'Luftpost!', w.c);
          spawnSubs(s, w.sub, { x: (f) => s.x + f * (w.wide || 230) - wind * 20, y: () => -40, vx: () => wind * 30, vy: () => 60, wait: (k) => 0.5 + k * 0.16 });
          break;
        }
        case 'bolt': lightning(s.x, o, w); waterShock(s.x, o, w); break;
        case 'tele': { if (o && !o.dead) { sparkle(o.x, o.y - 20, '#a46bff'); o.x = clamp(s.x, 30, TW - 30); o.y = Math.min(o.y, gAt(o.x)); o.fallFrom = null; o.vy = 0; flat(o.x, 20); o.y = gAt(o.x); sparkle(o.x, o.y - 20, '#a46bff'); pop(o.x, o.y - 70, 'Hops!', '#a46bff'); } break; }
        case 'erase': carve(s.x, s.y, w.r); booms.push({ x: s.x, y: s.y, r: w.r, t: 0, erase: true }); debris(s.x, s.y, 14, 0.8); break;
        case 'dirt': {
          for (let i = Math.max(0, Math.floor(s.x - w.r)); i < Math.min(TW, Math.ceil(s.x + w.r)); i++) { const d = Math.sqrt(Math.max(0, w.r * w.r - (i - s.x) ** 2)) * 0.85; ground[i] = Math.max(OFF + 60, Math.min(ground[i], s.y + 6) - d); }
          debris(s.x, s.y, 12, 0.6); liftTanks(); break;
        }
        case 'wall': {
          for (let i = Math.max(0, Math.floor(s.x - 22)); i < Math.min(TW, Math.ceil(s.x + 22)); i++) { const u = Math.abs(i - s.x) / 22, hh = 160 * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3); ground[i] = Math.max(OFF + 50, Math.min(ground[i], gAt(s.x) - hh)); }
          debris(s.x, s.y, 12, 0.6); liftTanks(); break;
        }
        case 'fire': explode(s.x, s.y, { ...w, dmg: 10 }, o, { direct }); for (let k = 0; k < w.drops; k++) flames.push({ x: s.x + (k - w.drops / 2) * 5, y: gAt(s.x), life: (2.6 + R()) * (wx === 'rain' || wx === 'thunder' ? 0.55 : 1), o, t: 0, dir: k < w.drops / 2 ? -1 : 1 }); break;
        case 'heal': heal(s.x, s.y, w); break;
        case 'quake': {
          booms.push({ x: s.x, y: s.y, r: 40, t: 0, c: w.c }); shake = 24; carve(s.x, s.y, 26);
          { const a0 = Math.max(0, Math.floor(s.x - w.r)), a1 = Math.min(TW, Math.ceil(s.x + w.r)); for (let pass = 0; pass < 3; pass++) { const src = ground.slice(); for (let i = a0; i < a1; i++) { const f = 1 - Math.abs(i - s.x) / w.r; let m = 0, n = 0; for (let j = i - 40; j <= i + 40; j += 4) { m += src[clamp(j, 0, TW - 1)]; n++; } ground[i] = clamp(src[i] + (m / n - src[i]) * 0.55 * f + 3 * f, OFF + 50, TH - 6); } } liftTanks(); }
          for (const t of T) { if (t.dead) continue; const d = Math.abs(t.x - s.x); if (d < w.r) dealDamage(t, w.dmg * (1 - d / w.r) + 4, o, w); }
          for (let k = 0; k < 30; k++) { const px = s.x + (R() - 0.5) * w.r * 2; parts.push({ x: px, y: gAt(px), vx: (R() - 0.5) * 60, vy: -R() * 200, t: 0, life: 1, kind: 'chunk', r: 2 + R() * 3, rot: 0, c: map.soil[1] }); }
          break;
        }
        case 'push': {
          explode(s.x, s.y, w, o, { direct });
          for (const t of T) { if (t.dead) continue; const d = Math.hypot(t.x - s.x, t.y - 12 - s.y); if (d < w.r + 40) { const dir = Math.sign(t.x - s.x) || (R() < 0.5 ? -1 : 1); t.slide = dir * (1 - d / (w.r + 40)) * 420; } }
          break;
        }
        case 'drill': s.dead = false; s.mode = 'drill'; s.depth = 0; break;
        case 'mole': s.dead = false; s.mode = 'mole'; s.dist = 0; s.dir = s.vx >= 0 ? 1 : -1; break;
        case 'saw': s.dead = false; s.mode = 'saw'; s.dist = 0; s.dir = s.vx >= 0 ? 1 : -1; s.hit = new Set(); break;
        case 'roll': s.dead = false; s.mode = 'roll'; s.rt = 0; s.dir = s.vx >= 0 ? 1 : -1; s.sp = clamp(Math.abs(s.vx), 90, 260); s.y = gAt(s.x) - 6; break;
        case 'magnet': explode(s.x, s.y, w, o, { direct }); pullTanks(s.x, s.y, 190, 300); break;
        case 'shot': explode(s.x, s.y, { ...w, dmg: w.dmg * clamp(1.45 - s.age * 1.3, 0.3, 1.45) }, o, { direct }); break;
        case 'hole': {
          booms.push({ x: s.x, y: s.y, r: w.r * 1.3, t: 0, ring: true }); carve(s.x, s.y + 30, w.r * 0.9);
          pullTanks(s.x, s.y, 280, 520); explode(s.x, s.y, w, o, { direct });
          for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = 60 + R() * 140; parts.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, t: 0, life: 0.45, kind: 'spark', c: '#a46bff', r: 2 }); }
          break;
        }
        case 'chain': {
          lightning(s.x, o, w); let k = 1;
          for (const t of T) if (!t.dead && o && isFoe(o, t)) { const tt = t; fxLater(() => { if (!tt.dead) { lightning(tt.x, o, w); pop(tt.x, tt.y - 60, 'Zack!', '#e0a106'); } }, 220 * k++); }
          break;
        }
        case 'dragon': {
          explode(s.x, s.y, { ...w, dmg: 14 }, o, { direct }); let k = 0;
          for (const t of T) if (!t.dead && o && isFoe(o, t)) { const tt = t; fxLater(() => { if (tt.dead) return; explode(tt.x, tt.y - 10, w, o, { noCarve: true }); for (let j = 0; j < 8; j++) flames.push({ x: tt.x + (j - 4) * 7, y: gAt(tt.x), life: 2.2 + R(), o, w, t: 0, dir: j < 4 ? -1 : 1 }); for (let j = 0; j < 26; j++) parts.push({ x: tt.x + (R() - 0.5) * 30, y: tt.y - R() * 140, vx: (R() - 0.5) * 60, vy: -80 - R() * 120, t: 0, life: 0.7, kind: 'spark', c: j % 2 ? '#ff7a1a' : '#ffd166', r: 3 }); }, 300 * k++); }
          break;
        }
        case 'rift': {
          shake = 26; booms.push({ x: s.x, y: s.y, r: 40, t: 0, c: w.c });
          for (let i = Math.max(0, Math.floor(s.x - w.r)); i < Math.min(TW, Math.ceil(s.x + w.r)); i++) { const u = Math.abs(i - s.x) / w.r, dep = 150 * (1 - u * u) * (0.8 + 0.2 * Math.sin(i / 7)); ground[i] = clamp(ground[i] + dep, OFF + 50, TH - 8); }
          for (const t of T) if (!t.dead && Math.abs(t.x - s.x) < w.r) dealDamage(t, w.dmg, o, w);
          for (let k = 0; k < 40; k++) { const px = s.x + (R() - 0.5) * w.r * 2; parts.push({ x: px, y: gAt(px), vx: (R() - 0.5) * 80, vy: -R() * 260, t: 0, life: 1.1, kind: 'chunk', r: 2 + R() * 4, rot: 0, c: map.soil[1] }); }
          break;
        }
        case 'swarm': {
          booms.push({ x: s.x, y: s.y, r: 20, t: 0, c: w.c }); pop(s.x, s.y - 40, 'Raketenschwarm!', w.c); let k = 0;
          for (const t of T) if (!t.dead && o && isFoe(o, t)) shells.push(mk(t.x + (R() - 0.5) * 120, -30, (R() - 0.5) * 40, 120, { ...W.seek, r: w.r, dmg: w.dmg, op: true, c: w.c }, o, { sub: true, wait: 0.3 + k++ * 0.25 }));
          break;
        }
        case 'orbital': {
          const gy = gAt(s.x); beams.push({ x0: s.x, y0: -20, x1: s.x, y1: gy, t: 0, c: w.c, wide: 1 }); flash = 0.9; shake = 22;
          carve(s.x, gy, w.r * 0.8); explode(s.x, gy, w, o, { noCarve: true }); break;
        }
        case 'healall': {
          let n = 0;
          for (const t of T) if (!t.dead && o && !isFoe(o, t)) { const add = Math.min(t.hpMax - t.hp, -w.dmg); if (add > 0) { t.hp += add; pop(t.x, t.y - 70, `+${add}`, '#2f9e5b'); } t.shield = Math.max(t.shield, 15); sparkle(t.x, t.y - 20, '#2fbf71'); booms.push({ x: t.x, y: t.y - 20, r: 70, t: 0, heal: true }); n++; }
          for (let k = 0; k < 60; k++) parts.push({ x: R() * TW, y: -10 - R() * 200, vx: 0, vy: 200 + R() * 100, t: 0, life: 1.6, kind: 'drop', c: '#5fd38d', r: 2.2 });
          dirty = true; break;
        }
        case 'tree': {
          const tx = clamp(s.x, 30, TW - 30); trees.push({ x: tx, o, left: 3, grow: 0 }); pop(tx, gAt(tx) - 60, 'Lebensbaum!', '#2f9e5b');
          treeHeal(trees[trees.length - 1], -w.dmg); break;
        }
        case 'mine': mines.push({ x: s.x, y: gAt(s.x), o, armed: false }); pop(s.x, gAt(s.x) - 40, 'Mine liegt', ink); break;
        default: explode(s.x, s.y, w, o, { direct });
      }
    }
    function pullTanks(cx, cy, rad, power) { for (const t of T) { if (t.dead) continue; const d = Math.abs(t.x - cx); if (d < rad && d > 6) t.slide = -Math.sign(t.x - cx) * Math.min(power * (1 - d / rad) + 80, d * 3.2); } }
    function waterShock(px, o, w) {
      const inWater = (q) => poolDepth(q.x) > 2 || q.y > waterY - 2;
      if (!(poolDepth(px) > 1 || gAt(px) > waterY - 2)) return;
      for (const t of T) if (!t.dead && inWater(t)) { dealDamage(t, 20, o, w); pop(t.x, t.y - 60, 'Strom!', '#e0a106'); for (let k = 0; k < 10; k++) parts.push({ x: t.x + (R() - 0.5) * 40, y: t.y - 10, vx: (R() - 0.5) * 300, vy: -R() * 200, t: 0, life: 0.3, kind: 'spark', c: '#ffe27a', r: 2 }); }
    }
    function addWater(px, amount) { const c = cellOf(px); for (let k = -2; k <= 2; k++) if (c + k >= 0 && c + k < NC) pool[c + k] += amount / 5; }
    function treeHeal(tr, amt) {
      for (const t of T) if (!t.dead && tr.o && !isFoe(tr.o, t) && Math.abs(t.x - tr.x) < W.tree.r) { const add = Math.min(t.hpMax - t.hp, amt); if (add > 0) { t.hp += add; dirty = true; pop(t.x, t.y - 70, `+${add}`, '#2f9e5b'); sparkle(t.x, t.y - 20, '#2fbf71'); } }
    }
    function liftTanks() { T.forEach((t) => { const g = gAt(t.x); if (t.y > g) t.y = g; }); crates.forEach((c) => { if (!c.fall) c.y = gAt(c.x); }); }
    const hitTank = (s) => T.find((t) => !t.dead && (t !== s.o || s.age > 0.25) && Math.abs(s.x - t.x) < 26 * t.scale && s.y > t.y - 24 * t.scale && s.y < t.y + 6);
    function stepShell(s, d) {
      if (s.dead) return;
      if (s.wait > 0) { s.wait -= d; return; }
      s.age += d; const w = s.w;
      if (s.mode === 'roll') {
        s.rt += d; const nx = s.x + s.dir * s.sp * d, up = gAt(s.x) - gAt(nx);
        s.sp = Math.max(0, s.sp - (up > 0 ? up * 14 : -Math.min(0, up) * -10) - 40 * d);
        if (up > 0 && up / Math.max(0.01, Math.abs(nx - s.x)) > 2.5) s.sp = 0;
        const hitT = T.find((t) => !t.dead && t !== s.o && Math.abs(nx - t.x) < 28 * t.scale);
        s.x = nx; s.y = gAt(s.x) - 6; s.spin = (s.spin || 0) + s.dir * s.sp * d / 8;
        if (hitT || s.sp < 12 || s.rt > 2.4 || s.x < 4 || s.x > TW - 4) { s.dead = true; explode(s.x, s.y, w, s.o, { direct: hitT }); }
        return;
      }
      if (s.mode === 'saw') {
        const nx = s.x + s.dir * 300 * d; s.dist += 300 * d; s.spin = (s.spin || 0) + d * 30;
        for (let i = Math.round(Math.min(s.x, nx)) - 10; i <= Math.round(Math.max(s.x, nx)) + 10; i++) if (i >= 0 && i < TW) ground[i] = Math.min(TH - 6, ground[i] + 0.9);
        s.x = nx; s.y = gAt(s.x) - 8;
        if (R() < 0.6) parts.push({ x: s.x, y: s.y + 6, vx: -s.dir * (60 + R() * 120), vy: -60 - R() * 120, t: 0, life: 0.5, kind: 'spark', c: '#ffcf5a', r: 1.5 });
        for (const t of T) if (!t.dead && !s.hit.has(t) && Math.abs(t.x - s.x) < 28 * t.scale) { s.hit.add(t); dealDamage(t, w.dmg, s.o, w); pop(t.x, t.y - 60, 'Ritsch!', ink); }
        liftTanks();
        if (s.dist > w.len || s.x < 4 || s.x > TW - 4) { s.dead = true; explode(s.x, s.y, { ...w, r: 26, dmg: 10 }, s.o); }
        return;
      }
      if (s.mode === 'mole') {
        const nx = s.x + s.dir * 220 * d; s.dist += 220 * d;
        for (let i = Math.round(Math.min(s.x, nx)) - 12; i <= Math.round(Math.max(s.x, nx)) + 12; i++) if (i >= 0 && i < TW) ground[i] = Math.min(TH - 6, ground[i] + 1.4);
        s.x = nx; s.y = gAt(s.x) + 4; liftTanks();
        if (R() < 0.5) parts.push({ x: s.x, y: s.y - 4, vx: (R() - 0.5) * 80, vy: -80 - R() * 80, t: 0, life: 0.7, kind: 'chunk', r: 2 + R() * 2, rot: 0, c: map.soil[1] });
        const hitT = T.find((t) => !t.dead && t !== s.o && Math.abs(t.x - s.x) < 24 * t.scale);
        if (hitT || s.dist > w.len || s.x < 4 || s.x > TW - 4) { s.dead = true; explode(s.x, s.y - 6, w, s.o, { direct: hitT }); }
        return;
      }
      if (s.mode === 'drill') {
        s.depth += 140 * d; s.y += 140 * d;
        for (let i = Math.round(s.x) - 6; i <= Math.round(s.x) + 6; i++) if (i >= 0 && i < TW) ground[i] = Math.max(ground[i], Math.min(TH - 6, s.y));
        if (s.depth > 48 || s.y > TH - 10) { s.dead = true; explode(s.x, s.y, { ...w, r: 62 }, s.o); }
        return;
      }
      // Flug
      if (w.k === 'seek' && s.age > 0.35 && s.vy > 0) {
        const foe = T.filter((t) => !t.dead && s.o && isFoe(s.o, t)).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
        if (foe) { const dx = foe.x - s.x; s.vx += clamp(dx * 4, -520, 520) * d; s.vx *= 1 - 0.6 * d; s.seeking = true; }
      }
      if (w.k === 'magnet') {
        for (const t of T) { if (t.dead || (t === s.o && s.age < 0.6)) continue; const dx = t.x - s.x, dy = t.y - 14 - s.y, dd = Math.hypot(dx, dy); if (dd < 240 && dd > 1) { const f = 900 * (1 - dd / 240); s.vx += dx / dd * f * d; s.vy += dy / dd * f * d; s.pull = 1; } }
      }
      if (w.k === 'shot') s.vy += grav * 0.3 * d; else { s.vx += wind * 60 * d; s.vy += grav * d; }
      if ((w.k === 'apex' || w.k === 'rain') && !s.sub && s.vy > 0 && s.age > 0.2) {
        s.dead = true; booms.push({ x: s.x, y: s.y, r: 16, t: 0, c: w.c });
        if (w.k === 'apex') spawnSubs(s, w.sub, { vx: (f) => s.vx + f * 300 });
        else spawnSubs(s, w.sub, { vx: (f) => s.vx * 0.4 + f * 380 + (R() - 0.5) * 60, vy: () => 20 + R() * 60, r: w.r, dmg: w.dmg });
        return;
      }
      s.x += s.vx * d; s.y += s.vy * d;
      if (w.k === 'timer' && s.age >= w.fuse) { s.dead = true; explode(s.x, Math.min(s.y, gAt(s.x)), w, s.o); return; }
      if (s.x < -80 || s.x > TW + 80 || s.y > TH + 60) { s.dead = true; if (w.k === 'ghost' && s.x > 0 && s.x < TW) explode(s.x, gAt(s.x), w, s.o); return; }
      if (s.y < TH && s.y > hazardY() && !s.splash && s.x > 0 && s.x < TW) { s.splash = true; for (let k = 0; k < 10; k++) parts.push({ x: s.x, y: hazardY(), vx: (R() - 0.5) * 160, vy: -R() * 220, t: 0, life: 0.8, kind: 'drop', c: lavaY < waterY ? '#ff7a1a' : inkY < waterY ? '#3d3dbd' : '#4fa3ff', r: 2.5 }); }
      if (!s.psplash && s.vy > 0 && s.y > poolTop(s.x) && s.y < gAt(s.x)) { s.psplash = true; const py = poolTop(s.x); for (let k = 0; k < 12; k++) parts.push({ x: s.x, y: py, vx: (R() - 0.5) * 180, vy: -R() * 240, t: 0, life: 0.8, kind: 'drop', c: '#6fb0ff', r: 2.3 }); ripples.push({ x: s.x, y: py, t: 0, big: 1 }); }
      if (solo) { const q = targets.find((q2) => !q2.hit && Math.abs(q2.x - s.x) < 22 && (q2.air ? Math.abs(q2.y - s.y) < 22 : s.y > q2.y - 60 && s.y < q2.y)); if (q) { impact(s); return; } }
      const hitT = hitTank(s);
      if (hitT) { impact(s, hitT); return; }
      const gx = Math.round(s.x);
      if (w.k !== 'ghost' && gx >= 0 && gx < TW && s.y >= ground[gx]) {
        if (w.k === 'bounce' || w.k === 'timer') {
          if (w.every) explode(s.x, ground[gx], { ...w, r: w.r, dmg: w.dmg }, s.o);
          s.hops--;
          if (w.k === 'bounce' && s.hops <= 0) { s.dead = true; if (!w.every) explode(s.x, ground[gx], w, s.o); return; }
          const sl = Math.atan2(gAt(s.x + 4) - gAt(s.x - 4), 8), nx = Math.sin(sl), ny = -Math.cos(sl), dot = s.vx * nx + s.vy * ny;
          const rest = w.k === 'timer' ? 0.45 : 0.65;
          s.vx = (s.vx - 2 * dot * nx) * rest; s.vy = (s.vy - 2 * dot * ny) * rest; s.y = gAt(s.x) - 2;
          if (Math.hypot(s.vx, s.vy) < 40) { s.vx = 0; s.vy = 0; if (w.k === 'bounce') { s.dead = true; explode(s.x, s.y, w, s.o); } }
          return;
        }
        impact(s);
      }
    }

    // ---------- Zugwechsel ----------
    function alive() { return T.filter((t) => !t.dead); }
    function teamsAlive() { return [...new Set(alive().map((t) => t.team))]; }
    function endCheck() {
      if (solo) return targets.every((q) => q.hit) || shots >= totalTurns;
      if (scoreMode) return turnsDone >= totalTurns;
      return teamsAlive().length <= 1 || turnsDone >= totalTurns;
    }
    function nextTurn() {
      if (over) return;
      T.forEach((t) => { t.lost = 0; });
      mines.forEach((m) => { m.armed = true; });
      // Hügelkönig: wer im Feld steht, bekommt Punkte
      const t0 = cur();
      if (hill && !t0.dead && Math.abs(t0.x - hill.x) < hill.w / 2) { addScore(t0, 40); pop(t0.x, t0.y - 80, '+40 Hügel', t0.p.color); }
      turnsDone++; t0.turns++;
      if (endCheck()) return finish();
      // nächster Spieler
      let k = turn;
      for (let s = 0; s < N; s++) { k = (k + 1) % N; if (!T[k].dead || scoreMode) break; }
      turn = k;
      const newRound = turnsDone % N === 0;
      if (newRound) {
        if (mode.id === 'ink') { inkY -= TH * 0.05; msg = 'Die Tinte steigt!'; msgT = 1.3; }
        if (hill && (turnsDone / N) % 2 === 0) { moveHill(); msg = 'Der Hügel wandert!'; msgT = 1.2; }
        if (mixed && (turnsDone / N) % 2 === 0) { wx = WXS[(R() * WXS.length) | 0]; msg = `Wetter: ${wxName()}`; msgT = 1.2; }
      }
      const t = cur();
      // Wiedereinstieg in Punkte-Modi
      if (t.dead && scoreMode) {
        let nx = t.x; for (let s = 0; s < 80; s++) { nx = 60 + R() * (TW - 120); if (dryAt(nx, 30) && T.every((o) => o === t || o.dead || Math.abs(o.x - nx) > 120)) break; }
        t.dead = false; t.hp = t.hpMax; t.x = nx; flat(nx, 30); t.y = gAt(nx); t.fallFrom = null; t.vy = 0;
        pop(t.x, t.y - 70, 'Wieder da!', t.p.color); sparkle(t.x, t.y - 20, t.p.color);
      }
      newWind(); phase = 'aim';
      t.fuel = Math.max(t.fuel, t.fuelMax); t.usedEx = false; t.scope = false; t.chute = false;
      if (mode.id === 'lotto') { const pool = arsenal.filter((id) => !['tele', 'heal'].includes(id)); t.lotto = pool[(R() * pool.length) | 0]; t.w = t.lotto; }
      for (const tr of trees) if (tr.o === t && tr.left > 0 && !t.dead) { tr.left--; treeHeal(tr, 10); }
      trees = trees.filter((tr) => tr.left > 0 || tr.grow < 1);
      // Gift, Wasser, Lava, Tinte
      if (t.poison > 0) { t.poison--; pop(t.x, t.y - 90, 'Tinte brennt', '#3d3dbd'); dealDamage(t, 8, t.lastBy && t.lastBy !== t ? t.lastBy : null); }
      if (!t.dead && t.y > Math.min(waterY, inkY) + 4) { const dm = t.y > inkY ? 20 : 15; pop(t.x, t.y - 90, t.y > inkY ? 'In der Tinte!' : 'Wasser!', '#e0483e'); dealDamage(t, dm, t.lastBy && t.lastBy !== t ? t.lastBy : null); }
      if (t.dead) { syncCtrl(); later(nextTurn, 900); return; }
      if (!msgT || msgT < 0.3) { msg = `${t.p.name} ist dran`; msgT = 1.1; }
      const cr = O.crates, every = mode.id === 'crates' ? 1 : cr === 2 ? 2 : 4, maxC = mode.id === 'crates' ? 6 : 2 + (N >> 1);
      if (cr && turnsDone % every === every - 1 && crates.length < maxC) dropCrate();
      if (mode.id === 'crates' && cr === 0 && crates.length < 4) dropCrate();
      if (wx === 'thunder' && R() < 0.3) later(() => { const px = 60 + R() * (TW - 120); pop(px, gAt(px) - 80, 'Gewitter!', '#e0a106'); lightning(px, null, { ...W.bolt, dmg: 18, r: 34 }); }, 500);
      timeLeft = O.timer;
      syncCtrl();
      saveGame(false);
      if (!human()) later(cpuTurn, 800);
    }
    function finish() {
      over = true; phase = 'over';
      if (canSave) try { localStorage.removeItem('tkSave'); } catch (e) { /* egal */ }
      const rank = ranking();
      const w0 = rank[0];
      msg = solo ? (targets.every((q) => q.hit) ? `Alle Scheiben mit ${shots} Schüssen!` : 'Keine Schüsse mehr') : w0.tie ? 'Unentschieden' : mode.teams || mode.coop ? `${teamLabel(w0.team, w0)} gewinnt!` : `${w0.name} gewinnt!`; msgT = 9;
      syncCtrl();
      later(() => {
        cleanup(); resultSent = true;
        let winner = null; if (N === 2 && !w0.tie) winner = w0.i;
        const detail = N === 2 ? (scoreMode ? `Punkte: ${Math.round(T[0].score)} zu ${Math.round(T[1].score)}` : `Leben: ${Math.max(0, Math.round(T[0].hp))} zu ${Math.max(0, Math.round(T[1].hp))}`) : '';
        resolve({ ranking: rank, winner, detail, solo: solo ? { shots, all: targets.every((q) => q.hit), hit: targets.filter((q) => q.hit).length } : null, mode: mode.id, map: map.id });
      }, 1700);
    }
    function teamLabel(team, row) { if (mode.coop) return team === 0 ? 'Das Team' : 'Der Riesenpanzer'; return `Team ${['Blau', 'Rot', 'Grün', 'Gelb'][team] || team + 1}`; }
    function ranking() {
      const rows = T.map((t) => ({ i: t.i, name: t.p.name, color: t.p.color, cpu: t.cpu, team: t.team, score: Math.round(t.score), kills: t.kills, dmg: Math.round(t.dmg), hp: Math.max(0, Math.round(t.hp)), dead: t.dead, dt: t.dead ? t.deathTurn : 1e9 }));
      const tm = !!(mode.teams || mode.coop);
      const agg = {}; rows.forEach((r) => { const a = agg[r.team] || (agg[r.team] = { score: 0, hp: 0, last: -1 }); a.score += r.score; if (!r.dead) a.hp += r.hp; a.last = Math.max(a.last, r.dt); });
      const key = (r) => {
        if (scoreMode) return tm ? [agg[r.team].score, 0, r.score, r.kills] : [r.score, 0, r.kills, r.dmg];
        if (tm) return [agg[r.team].hp > 0 ? 1 : 0, agg[r.team].hp > 0 ? agg[r.team].hp : agg[r.team].last, r.hp, r.dmg];
        return [r.dead ? 0 : 1, r.dead ? r.dt : r.hp, r.dmg, 0];
      };
      rows.sort((a, b) => { const ka = key(a), kb = key(b); for (let k = 0; k < ka.length; k++) if (kb[k] !== ka[k]) return kb[k] - ka[k]; return a.team - b.team; });
      const same = (a, b) => { const ka = key(a), kb = key(b); return ka[0] === kb[0] && ka[1] === kb[1]; };
      let teamRank = 0;
      rows.forEach((r, k) => {
        if (!k) { r.place = 1; teamRank = 1; return; }
        const p = rows[k - 1];
        if (tm) { if (p.team !== r.team && !same(p, r)) teamRank++; r.place = p.team === r.team || same(p, r) ? p.place : teamRank; }
        else r.place = same(p, r) ? p.place : k + 1;
      });
      if (rows.length > 1 && rows[1].place === 1 && (!tm || rows[1].team !== rows[0].team)) rows[0].tie = true;
      return rows;
    }

    // ---------- Computer ----------
    function sim(t, ang, pow, w) {
      const a = ang * Math.PI / 180, v = pow * 8.4 * speedK(w); let [px, py] = muzzle(t, ang); let vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
      const d = 1 / 60, path = [];
      for (let k = 0; k < 900; k++) {
        if (w.k === 'shot') vy += grav * 0.3 * d; else { vx += wind * 60 * d; vy += grav * d; } px += vx * d; py += vy * d; if (k % 2 === 0) path.push([px, py]);
        if (px < 0 || px >= TW || py > TH) return { x: px, y: py, path, out: true };
        if (w.k !== 'ghost' && py >= ground[Math.round(px)]) return { x: px, y: py, path };
        const hitT = T.find((q) => !q.dead && (q !== t || k > 15) && Math.abs(px - q.x) < 26 * q.scale && py > q.y - 24 * q.scale && py < q.y + 6);
        if (hitT) return { x: px, y: py, path, tank: hitT };
      }
      return { x: px, y: py, path };
    }
    function cpuTurn() {
      if (over) return;
      const t = cur(), reach = t.fuel * FUEL_PX * 0.8;
      if (t.hp < t.hpMax * 0.45 && t.ex[0] && !t.usedEx) applyExtra(t, 0);
      else if (t.ex[1] && !t.usedEx && R() < 0.3) applyExtra(t, 1);
      syncCtrl();
      let goal = null;
      if (t.y > hazardY() - 10 || poolDepth(t.x) > 5) { let best = null; for (let xx = Math.max(30, t.x - reach); xx < Math.min(TW - 30, t.x + reach); xx += 8) if (!best || (dryAt(xx, 10) && !dryAt(best, 10)) || (dryAt(xx, 10) === dryAt(best, 10) && gAt(xx) < gAt(best))) best = xx; goal = best; }
      else if (hill && Math.abs(t.x - hill.x) > hill.w / 2 - 10 && Math.abs(t.x - hill.x) < reach + 60) goal = hill.x + (R() - 0.5) * 40;
      else {
        const box = crates.filter((c) => !c.fall && Math.abs(c.x - t.x) < reach).sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
        if (box) goal = box.x; else if (R() < 0.45) goal = clamp(t.x + (R() < 0.5 ? -1 : 1) * (30 + R() * 90), 40, TW - 40);
      }
      if (goal == null) { later(cpuAim, 300); return; }
      cpuDrive = { goal, until: performance.now() + 3500 };
    }
    function cpuAim() {
      if (over) return;
      const t = cur(), foes = T.filter((q) => !q.dead && isFoe(t, q)), mates = T.filter((q) => !q.dead && q !== t && !isFoe(t, q));
      if (solo || !foes.length) { later(shoot, 300); return; }
      const tgt = foes.map((q) => ({ q, v: Math.abs(q.x - t.x) * 0.6 + q.hp * 1.2 + (mode.id === 'bounty' && leader() === q ? -120 : 0) + R() * 120 })).sort((a, b) => a.v - b.v)[0].q;
      // Waffe wählen
      const attack = avail(t).filter((id) => !['dirt', 'wall', 'erase', 'tele', 'heal', 'mine'].includes(id) && !W[id].heal);
      let wid = 'ball';
      if (mode.id === 'lotto') wid = t.lotto;
      else {
        const nice = attack.filter((id) => id !== 'ball' && t.ammo[id] !== Infinity);
        if (nice.length && R() < (t.cpu >= 3 ? 0.75 : 0.55)) { nice.sort((a, b) => (W[b].dmg * (W[b].split || W[b].sub || W[b].shots || 1) ** 0.5) - (W[a].dmg * (W[a].split || W[a].sub || W[a].shots || 1) ** 0.5)); wid = nice[(R() * Math.min(4, nice.length)) | 0]; }
        const ops = attack.filter((id) => W[id].op); if (ops.length && R() < 0.8) wid = ops[0];
        if (t.hp < t.hpMax * 0.4 && t.ammo.heal > 0 && R() < 0.4) wid = 'heal';
        const hops = avail(t).filter((id) => W[id].heal); if (hops.length && t.hp < t.hpMax * 0.5) wid = hops[0];
      }
      if (!t.ammo[wid] && mode.id !== 'lotto') wid = 'ball';
      const w = W[wid];
      let best = null;
      const tx = tgt.x, ty = tgt.y - 10;
      if (w.k === 'heal' || w.heal) best = { ang: 90, pow: 18, d: 0 };
      else if (w.k === 'beam') { const [px, py] = pivot(t); best = { ang: clamp(Math.atan2(py - ty, tx - px) * 180 / Math.PI, 0, 180), pow: 60, d: 0 }; }
      else {
        const left = tx < t.x;
        for (let ang = left ? 92 : 8; ang <= (left ? 172 : 88); ang += 2) for (let pow = 16; pow <= 100; pow += 2) {
          const r = sim(t, ang, pow, w); let d = Math.hypot(r.x - tx, r.y - ty);
          if (r.tank === tgt) d = 0; else if (r.out) d += 200;
          for (const m of [...mates, t]) if (Math.hypot(r.x - m.x, r.y - m.y + 10) < w.r + 30) d += 600;
          if (!best || d < best.d) best = { d, ang, pow };
        }
      }
      if (best.d > 400 && w.k !== 'heal') wid = 'ball';
      t.w = wid;
      const err = [0, 16, 8, 3.5, 1.2][t.cpu] * (best.d > 80 ? 1.4 : 1);
      const goalA = clamp(best.ang + (R() - 0.5) * err * 0.6, 0, 180), goalP = clamp(best.pow + (R() - 0.5) * err, 10, 100);
      const a0 = t.ang, p0 = t.pow; let k = 0;
      const anim = () => { if (over) return; k = Math.min(1, k + 0.07); t.ang = a0 + (goalA - a0) * k; t.pow = p0 + (goalP - p0) * k; syncCtrl(); if (k < 1) later(anim, 30); else later(shoot, 350); };
      anim();
    }

    // ---------- Zeichnen ----------
    function drawSky(tm) {
      const sk = dark || night ? map.skyD : map.sky;
      const gr = x.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, sk[0]); gr.addColorStop(1, sk[1]);
      x.fillStyle = gr; x.fillRect(-40, -40, TW + 80, TH + 80);
      // Karo-Linien leicht drüber (Papier-Gefühl)
      x.strokeStyle = dark || night ? 'rgba(255,255,255,.05)' : 'rgba(60,100,170,.08)'; x.lineWidth = 1; x.beginPath();
      for (let gx = 0; gx <= TW; gx += 30) { x.moveTo(gx, 0); x.lineTo(gx, TH); } for (let gy = 0; gy <= TH; gy += 30) { x.moveTo(0, gy); x.lineTo(TW, gy); } x.stroke();
      if (stars.length && (dark || night)) { x.fillStyle = '#fff'; for (const s of stars) { x.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(tm / 900 + s.s * 9)); x.fillRect(s.x, s.y, 2, 2); } x.globalAlpha = 1; }
      // Sonne oder Mond
      const sx = TW * 0.82, sy = 90;
      if (dark || night) { x.fillStyle = '#f3eed9'; x.beginPath(); x.arc(sx, sy, 34, 0, Math.PI * 2); x.fill(); x.fillStyle = dark || night ? (map.skyD[0]) : '#fff'; x.beginPath(); x.arc(sx + 14, sy - 8, 30, 0, Math.PI * 2); x.fill(); }
      else if (wx === 'clear' || wx === 'snow') {
        x.fillStyle = '#ffd84d'; x.beginPath(); x.arc(sx, sy, 36, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#e0a106'; x.lineWidth = 2.5; x.stroke();
        x.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + tm / 6000; x.moveTo(sx + Math.cos(a) * 46, sy + Math.sin(a) * 46); x.lineTo(sx + Math.cos(a) * 60, sy + Math.sin(a) * 60); } x.stroke();
      }
      if (!(dark || night) && (wx === 'clear' || wx === 'snow')) { const g2 = x.createRadialGradient(sx, sy, 30, sx, sy, 260); g2.addColorStop(0, 'rgba(255,226,140,.35)'); g2.addColorStop(1, 'rgba(255,226,140,0)'); x.fillStyle = g2; x.fillRect(sx - 260, sy - 260, 520, 520); }
      // ferne Berge
      far.forEach((pts, k) => {
        x.fillStyle = dark || night ? `rgba(255,255,255,${0.04 + k * 0.03})` : shade(map.hill, k ? 0.25 : 0.5);
        x.globalAlpha = dark || night ? 1 : 0.7; x.beginPath(); x.moveTo(0, TH);
        pts.forEach((y, j) => x.lineTo(j / 40 * TW, y)); x.lineTo(TW, TH); x.closePath(); x.fill(); x.globalAlpha = 1;
      });
      // Dunst über dem Horizont
      { const hy = OFF + THL * 0.45, g3 = x.createLinearGradient(0, hy - 120, 0, hy + 80); const hc = dark || night ? '20,24,36' : wx === 'snow' || wx === 'fog' ? '240,244,250' : '255,252,240'; g3.addColorStop(0, `rgba(${hc},0)`); g3.addColorStop(0.6, `rgba(${hc},.4)`); g3.addColorStop(1, `rgba(${hc},0)`); x.fillStyle = g3; x.fillRect(-40, hy - 120, TW + 80, 200); }
      if (raining() || wx === 'storm') { x.fillStyle = dark ? 'rgba(10,14,24,.25)' : wx === 'storm' ? 'rgba(160,120,60,.12)' : 'rgba(70,82,104,.15)'; x.fillRect(-40, -40, TW + 80, TH + 80); }
      // Wolken
      const cloudCol = wx === 'rain' || wx === 'thunder' || wx === 'storm' ? (dark ? 'rgba(90,96,112,.9)' : 'rgba(150,158,172,.85)') : (dark || night ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.92)');
      for (const c of clouds) {
        const cx = ((c.x + tm / 1000 * wind * 30 * (0.5 + c.s)) % (TW + 300) + TW + 300) % (TW + 300) - 150, cy = c.y, s = c.s * (wx === 'rain' || wx === 'thunder' ? 1.3 : 1);
        x.fillStyle = cloudCol; x.beginPath(); x.arc(cx, cy, 30 * s, 0, Math.PI * 2); x.arc(cx + 34 * s, cy - 10 * s, 36 * s, 0, Math.PI * 2); x.arc(cx + 70 * s, cy, 28 * s, 0, Math.PI * 2); x.rect(cx, cy, 70 * s, 26 * s); x.fill();
        x.strokeStyle = ink; x.globalAlpha = 0.25; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 30 * s, cy + 8 * s); x.arc(cx, cy, 30 * s, Math.PI * 0.8, Math.PI * 1.6); x.arc(cx + 34 * s, cy - 10 * s, 36 * s, Math.PI * 1.15, Math.PI * 1.9); x.arc(cx + 70 * s, cy, 28 * s, Math.PI * 1.4, Math.PI * 2.25); x.stroke(); x.globalAlpha = 1;
      }
    }
    function groundPath() { x.beginPath(); x.moveTo(-40, TH + 40); x.lineTo(-40, ground[0]); for (let i = 0; i < TW; i += 2) x.lineTo(i, ground[i]); x.lineTo(TW + 40, ground[TW - 1]); x.lineTo(TW + 40, TH + 40); x.closePath(); }
    function drawGround() {
      let top = TH; for (let i = 0; i < TW; i += 8) top = Math.min(top, ground[i]);
      const soil = dark ? [shade(map.soil[0], -0.55), shade(map.soil[1], -0.6)] : map.soil;
      const gr = x.createLinearGradient(0, top, 0, TH); gr.addColorStop(0, soil[0]); gr.addColorStop(1, soil[1]);
      groundPath(); x.fillStyle = gr; x.fill();
      x.save(); groundPath(); x.clip();
      // Schichten
      x.lineWidth = 2;
      for (let b = 1; b <= 5; b++) {
        x.strokeStyle = dark ? `rgba(255,255,255,${0.05})` : `rgba(80,50,20,${0.1})`; x.beginPath();
        for (let i = 0; i < TW; i += 6) { const y = ground[i] + b * 36 + Math.sin(i / 47 + b * 2) * 6; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke();
      }
      // Steinchen
      x.fillStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(80,50,20,.18)';
      for (const s of stones) { const y = ground[clamp(Math.round(s.x), 0, TW - 1)] + s.d; if (y < TH) { x.beginPath(); x.ellipse(s.x, y, s.r * 1.4, s.r, 0, 0, Math.PI * 2); x.fill(); } }
      // Schraffur
      x.strokeStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(80,50,20,.09)'; x.lineWidth = 1.2; x.beginPath();
      for (let d = -TH; d < TW; d += 11) { x.moveTo(d, TH); x.lineTo(d + TH, 0); } x.stroke();
      // Brandflecken an Einschlägen
      for (const q of scorches) { const g2 = x.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 1.35); g2.addColorStop(0, dark ? 'rgba(0,0,0,.45)' : 'rgba(45,28,12,.38)'); g2.addColorStop(0.7, dark ? 'rgba(0,0,0,.18)' : 'rgba(45,28,12,.14)'); g2.addColorStop(1, 'rgba(45,28,12,0)'); x.fillStyle = g2; x.fillRect(q.x - q.r * 1.4, q.y - q.r * 1.4, q.r * 2.8, q.r * 2.8); }
      // Tiefe: weicher Schatten unter der Oberfläche
      x.lineJoin = 'round';
      [[18, 18, 0.07], [38, 26, 0.04]].forEach(([dy, lw, a]) => { x.strokeStyle = `rgba(40,20,0,${dark ? a * 1.6 : a})`; x.lineWidth = lw; x.beginPath(); for (let i = 0; i < TW; i += 4) (i ? x.lineTo(i, ground[i] + dy) : x.moveTo(i, ground[i] + dy)); x.stroke(); });
      // nasser Boden bei Regen
      if (wetK > 0.01) { x.fillStyle = `rgba(20,35,60,${0.2 * wetK})`; x.fillRect(-40, 0, TW + 80, TH + 40); }
      x.restore();
      // Oberfläche
      const topC = dark && map.top === '#ffffff' ? '#cfd8e6' : dark ? shade(map.top, -0.1) : map.top;
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = topC; x.lineWidth = 9; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i] + 4) : x.moveTo(i, ground[i] + 4)); x.stroke();
      x.strokeStyle = shade(topC.startsWith('#') ? topC : '#888888', 0.35); x.lineWidth = 2.5; x.globalAlpha = 0.7; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i] + 2) : x.moveTo(i, ground[i] + 2)); x.stroke(); x.globalAlpha = 1;
      // Grashalme
      if (['meadow', 'twin', 'steps'].includes(map.id)) { x.strokeStyle = topC; x.lineWidth = 1.6; x.beginPath(); for (let i = 4; i < TW; i += 13) { const g = ground[i]; x.moveTo(i, g + 2); x.lineTo(i - 2, g - 6 - (i * 7 % 5)); x.moveTo(i + 3, g + 2); x.lineTo(i + 5, g - 5 - (i * 3 % 4)); } x.stroke(); }
      x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i]) : x.moveTo(i, ground[i])); x.stroke();
      if (wetK > 0.05) { x.strokeStyle = `rgba(200,230,255,${0.55 * wetK})`; x.lineWidth = 1.4; x.beginPath(); for (let i = 0; i < TW; i += 3) (i ? x.lineTo(i, ground[i] + 1.5) : x.moveTo(i, ground[i] + 1.5)); x.stroke(); }
    }
    function drawProps(tm) {
      x.lineCap = 'round'; x.lineJoin = 'round';
      for (const q of props) {
        const g = gAt(q.x); if (g > hazardY() - 4 || poolDepth(q.x) > 3) continue;
        if (T.some((t) => !t.dead && Math.abs(t.x - q.x) < 34 * t.scale)) continue;   // nie hinter einem Panzer
        const sl = (gAt(q.x + 6) - gAt(q.x - 6)) / 12; if (Math.abs(sl) > 1.4) continue;
        const sw = Math.sin(tm / 1100 + q.x) * (wx === 'storm' ? 3 : wx === 'rain' || wx === 'thunder' ? 1.6 : 0.8);
        x.save(); x.translate(q.x, g + 2); x.scale(q.s * q.f, q.s); x.strokeStyle = ink; x.lineWidth = 1.6; x.globalAlpha = dark ? 0.85 : 1;
        const blob = (cx, cy, r, c) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.stroke(); };
        const k = q.k;
        if (k === 'tree') { x.fillStyle = '#a87a4a'; x.fillRect(-2.5, -18, 5, 18); x.strokeRect(-2.5, -18, 5, 18); blob(sw, -26, 11, '#4fae5a'); blob(-7 + sw, -20, 7, '#3f9a4b'); blob(7 + sw, -21, 7, '#5cbf63'); }
        else if (k === 'bush') { blob(-6, -5, 7, '#3f9a4b'); blob(5, -6, 8, '#4fae5a'); blob(0, -10, 6, '#5cbf63'); }
        else if (k === 'flower') { x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(sw, -8, sw, -14); x.stroke(); blob(sw, -16, 3.5, ['#ff6b8a', '#f2b632', '#a46bff'][Math.round(q.x) % 3]); }
        else if (k === 'pine') { x.fillStyle = '#7a5a35'; x.fillRect(-2, -8, 4, 8); [[-13, -8, -24], [-10, -18, -34], [-7, -28, -42]].forEach(([w0, y0, y1]) => { x.fillStyle = '#2f7a4b'; x.beginPath(); x.moveTo(w0 + sw * 0.3, y0); x.lineTo(sw, y1); x.lineTo(-w0 + sw * 0.3, y0); x.closePath(); x.fill(); x.stroke(); }); if (wx === 'snow' || map.id === 'glacier' || map.id === 'peaks') { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-4 + sw, -38); x.lineTo(sw, -42); x.lineTo(4 + sw, -38); x.closePath(); x.fill(); } }
        else if (k === 'cactus') { x.fillStyle = '#5c9e3f'; x.beginPath(); x.roundRect(-4, -30, 8, 30, 4); x.fill(); x.stroke(); x.beginPath(); x.roundRect(-13, -22, 6, 12, 3); x.fill(); x.stroke(); x.beginPath(); x.roundRect(7, -26, 6, 10, 3); x.fill(); x.stroke(); }
        else if (k === 'rock') { x.fillStyle = dark ? '#6b6f7a' : '#a7a29a'; x.beginPath(); x.moveTo(-12, 0); x.lineTo(-9, -9); x.lineTo(-2, -13); x.lineTo(7, -10); x.lineTo(11, 0); x.closePath(); x.fill(); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.4)'; x.beginPath(); x.moveTo(-6, -9); x.lineTo(-1, -11); x.stroke(); }
        else if (k === 'dead') { x.strokeStyle = '#3a2f2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -26); x.moveTo(0, -16); x.lineTo(-8, -24); x.moveTo(0, -20); x.lineTo(7, -28); x.stroke(); }
        else if (k === 'flag') { x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -30); x.stroke(); x.fillStyle = '#e0483e'; x.beginPath(); x.moveTo(0, -30); x.lineTo(13 + sw, -26); x.lineTo(0, -22); x.closePath(); x.fill(); }
        else if (k === 'lamp') { x.lineWidth = 2.4; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -34); x.quadraticCurveTo(0, -38, 6, -38); x.stroke(); const on = dark || night || wx === 'fog' || wx === 'rain' || wx === 'thunder'; if (on) { x.fillStyle = 'rgba(255,220,120,.25)'; x.beginPath(); x.arc(7, -34, 14, 0, Math.PI * 2); x.fill(); } blob(7, -35, 3.5, on ? '#ffd84d' : '#f3eed9'); }
        else if (k === 'palm') { x.strokeStyle = '#8a6a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(4, -18, 2 + sw, -36); x.stroke(); x.strokeStyle = '#2f9e5b'; x.lineWidth = 3; for (const a of [-2.6, -2, -1.2, -0.5]) { x.beginPath(); x.moveTo(2 + sw, -36); x.quadraticCurveTo(2 + sw + Math.cos(a) * 12, -36 + Math.sin(a) * 12 - 4, 2 + sw + Math.cos(a) * 20, -36 + Math.sin(a) * 6 + 6); x.stroke(); } }
        x.restore();
      }
      x.globalAlpha = 1;
    }
    function drawSnow(tm) {
      let any = false; for (let i = 0; i < TW; i += 6) if (snow[i] > 0.6) { any = true; break; }
      if (!any) return;
      let top = TH; for (let i = 0; i < TW; i += 8) top = Math.min(top, ground[i] - snow[i]);
      const gr = x.createLinearGradient(0, top, 0, top + 120);
      gr.addColorStop(0, dark ? '#e9eef7' : '#ffffff'); gr.addColorStop(1, dark ? '#b9c6da' : '#e4edf8');
      x.beginPath(); x.moveTo(0, ground[0] + 3);
      for (let i = 0; i < TW; i += 2) x.lineTo(i, ground[i] - snow[i] + (snow[i] > 0.6 ? 0 : 0.6));
      x.lineTo(TW, ground[TW - 1] - snow[TW - 1]);
      for (let i = TW - 1; i >= 0; i -= 2) x.lineTo(i, ground[i] + 3);
      x.closePath(); x.fillStyle = gr; x.fill();
      // blauer Schatten unten, Tinten-Kante oben
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = dark ? 'rgba(120,150,200,.35)' : 'rgba(140,175,220,.45)'; x.lineWidth = 3; x.beginPath(); let on = false;
      for (let i = 0; i < TW; i += 3) { if (snow[i] > 2) { const y = ground[i] - 1; on ? x.lineTo(i, y) : x.moveTo(i, y); on = true; } else on = false; } x.stroke();
      x.strokeStyle = ink; x.globalAlpha = 0.55; x.lineWidth = 2; x.beginPath(); on = false;
      for (let i = 0; i < TW; i += 3) { if (snow[i] > 0.8) { const y = ground[i] - snow[i]; on ? x.lineTo(i, y) : x.moveTo(i, y); on = true; } else on = false; } x.stroke(); x.globalAlpha = 1;
      // Glitzern
      x.fillStyle = '#ffffff';
      for (let k = 0; k < 26; k++) { const i = (k * 131 + 17) % TW; if (snow[i] < 3) continue; const a = Math.sin(tm / 380 + k * 2.1); if (a < 0.6) continue; const y = ground[i] - snow[i] + 3, s = (a - 0.6) * 9; x.globalAlpha = 0.9; x.fillRect(i - s / 2, y - 0.6, s, 1.2); x.fillRect(i - 0.6, y - s / 2, 1.2, s); }
      x.globalAlpha = 1;
    }
    function drawPools(tm) {
      for (let c = 0; c < NC;) {
        if (pool[c] < 0.6) { c++; continue; }
        let e = c; while (e < NC && pool[e] >= 0.6) e++;
        const x0 = Math.max(0, c * CS - 2), x1 = Math.min(TW - 1, e * CS + 2);
        const top = (i) => { const k = clamp(Math.floor(i / CS), c, e - 1); return cg[k] - pool[k]; };
        const wave = (i) => (pool[clamp(Math.floor(i / CS), c, e - 1)] > 3 ? Math.sin(i / 16 + tm / 420) * 0.9 : 0);
        let ymin = Infinity, ymax = 0;
        x.beginPath();
        for (let i = x0; i <= x1; i += 2) { const y = Math.min(top(i) + wave(i), ground[i]); ymin = Math.min(ymin, y); ymax = Math.max(ymax, ground[i]); i === x0 ? x.moveTo(i, y) : x.lineTo(i, y); }
        for (let i = x1; i >= x0; i -= 2) x.lineTo(i, ground[i] + 2);
        x.closePath();
        const gr = x.createLinearGradient(0, ymin, 0, Math.max(ymin + 10, ymax));
        gr.addColorStop(0, dark ? 'rgba(70,140,230,.62)' : 'rgba(110,185,250,.6)'); gr.addColorStop(1, dark ? 'rgba(20,60,140,.85)' : 'rgba(30,100,200,.8)');
        x.fillStyle = gr; x.fill();
        // Oberfläche + Glanz
        x.lineCap = 'round'; x.strokeStyle = dark ? '#a9d3ff' : '#dff0ff'; x.lineWidth = 2.2; x.beginPath(); let on = false;
        for (let i = x0; i <= x1; i += 2) { const y = top(i) + wave(i); if (y < ground[i] - 0.5) { on ? x.lineTo(i, y) : x.moveTo(i, y); on = true; } else on = false; } x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.6; x.beginPath();
        for (let i = x0 + 10; i < x1 - 20; i += 46) { const y = top(i) + 3 + (i % 3); if (y < ground[i] - 3) { const l = 8 + (i % 7) * 2, o = Math.sin(tm / 900 + i) * 4; x.moveTo(i + o, y); x.lineTo(i + o + l, y); } } x.stroke();
        c = e;
      }
      for (const q of ripples) { const k = q.t / (q.big ? 1.1 : 0.6), rr = (q.big ? 26 : 9) * (0.3 + k); x.strokeStyle = dark ? 'rgba(200,225,255,.7)' : 'rgba(255,255,255,.85)'; x.globalAlpha = 1 - k; x.lineWidth = q.big ? 2 : 1.2; x.beginPath(); x.ellipse(q.x, q.y, rr, rr * 0.28, 0, 0, Math.PI * 2); x.stroke(); }
      x.globalAlpha = 1;
    }
    function drawHazard(tm) {
      const surf = (y0, amp, sp) => (i) => y0 + Math.sin(i / 40 + tm / sp) * amp + Math.sin(i / 17 - tm / (sp * 0.7)) * amp * 0.35;
      const body = (f) => { x.beginPath(); x.moveTo(-40, TH + 40); for (let i = -40; i <= TW + 40; i += 8) x.lineTo(i, f(i)); x.lineTo(TW + 40, TH + 40); x.closePath(); };
      const line = (f) => { x.beginPath(); for (let i = -40; i <= TW + 40; i += 8) (i > -40 ? x.lineTo(i, f(i)) : x.moveTo(i, f(i))); };
      // Wasser (Meer)
      if (waterY < TH) {
        const f = surf(waterY, 3.5, 520), gr = x.createLinearGradient(0, waterY - 6, 0, TH);
        gr.addColorStop(0, dark ? 'rgba(70,150,235,.62)' : 'rgba(110,190,250,.58)'); gr.addColorStop(1, dark ? 'rgba(10,40,110,.92)' : 'rgba(25,85,180,.85)');
        body(f); x.fillStyle = gr; x.fill();
        x.save(); body(f); x.clip(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2;
        for (let k = 0; k < 5; k++) { const yy = waterY + 18 + k * 22; x.beginPath(); for (let i = -40; i <= TW + 40; i += 12) { const y = yy + Math.sin(i / (28 + k * 5) + tm / (700 + k * 90) + k) * 4; i > -40 ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke(); }
        x.restore();
        line(f); x.strokeStyle = dark ? '#a9d3ff' : '#e6f4ff'; x.lineWidth = 3; x.stroke(); line((i) => f(i) + 3); x.strokeStyle = 'rgba(47,127,214,.6)'; x.lineWidth = 1.5; x.stroke();
        // Schaum, wo Land ins Wasser geht
        x.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 2; i < TW - 2; i += 6) { const g = ground[i]; if ((ground[i - 2] < waterY) !== (ground[i + 2] < waterY) && Math.abs(g - waterY) < 30) { for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(i + (k - 1) * 5, f(i) + Math.sin(tm / 300 + k + i) * 1.5, 2.2, 0, Math.PI * 2); x.fill(); } } }
      }
      // Lava: Glühen darüber, helle Oberfläche, dunkle Kruste, Blasen
      if (lavaY < TH) {
        const f = surf(lavaY, 2.5, 900);
        const glow = x.createLinearGradient(0, lavaY - 90, 0, lavaY); glow.addColorStop(0, 'rgba(255,120,30,0)'); glow.addColorStop(1, `rgba(255,120,30,${0.32 + 0.06 * Math.sin(tm / 400)})`); x.fillStyle = glow; x.fillRect(-40, lavaY - 90, TW + 80, 92);
        const gr = x.createLinearGradient(0, lavaY - 4, 0, TH); gr.addColorStop(0, '#ffd166'); gr.addColorStop(0.12, '#ff8a1e'); gr.addColorStop(0.5, '#e0401a'); gr.addColorStop(1, '#7a1408');
        body(f); x.fillStyle = gr; x.fill();
        x.save(); body(f); x.clip(); x.strokeStyle = 'rgba(80,15,5,.55)'; x.lineWidth = 2.2; x.lineJoin = 'round';
        for (let k = 0; k < 14; k++) { const cx0 = ((k * 173 + tm / 60) % (TW + 200)) - 100, cy0 = lavaY + 14 + (k * 37) % 50; x.beginPath(); x.moveTo(cx0, cy0); x.lineTo(cx0 + 14, cy0 - 4); x.lineTo(cx0 + 26, cy0 + 3); x.lineTo(cx0 + 40, cy0 - 2); x.stroke(); }
        x.restore();
        line(f); x.strokeStyle = '#fff1a8'; x.lineWidth = 3; x.stroke();
        for (let k = 0; k < 10; k++) { const ph = (tm / 900 + k * 0.37) % 1, bx = (k * 211 + 60) % TW; if (gAt(bx) < lavaY) continue; x.fillStyle = `rgba(255,214,102,${1 - ph})`; x.strokeStyle = `rgba(120,20,5,${0.6 * (1 - ph)})`; x.lineWidth = 1.2; x.beginPath(); x.arc(bx, f(bx) - ph * 6, 3 + ph * 5, 0, Math.PI * 2); x.fill(); x.stroke(); }
        if (R() < 0.15) { const px = R() * TW; if (gAt(px) > lavaY) parts.push({ x: px, y: lavaY - 4, vx: wind * 8, vy: -25, t: 0, life: 1.8, kind: 'smoke', r: 5 + R() * 5 }); }
      }
      // Tinte
      if (inkY < TH) {
        const f = surf(inkY, 3, 700), gr = x.createLinearGradient(0, inkY, 0, TH); gr.addColorStop(0, 'rgba(70,70,200,.8)'); gr.addColorStop(1, 'rgba(20,20,90,.94)');
        body(f); x.fillStyle = gr; x.fill(); line(f); x.strokeStyle = '#9a9aff'; x.lineWidth = 3; x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1.5; x.beginPath(); for (let i = 20; i < TW; i += 70) { const y = f(i) + 6; x.moveTo(i, y); x.lineTo(i + 18, y); } x.stroke();
      }
    }
    function drawTank(t, tm) {
      // versunkene Panzer gleiten nach unten und verschwinden (Lava) oder bleiben als Schatten (Wasser)
      if (t.dead && t.liq) { t.sinkK = Math.min(1, (t.sinkK || 0) + 0.008); if (t.liq === 'lava' && t.sinkK >= 1) return; }
      const lt = Math.min(poolTop(t.x), waterY, inkY);
      if (!t.dead && lt < t.y - 2 && R() < 0.05) ripples.push({ x: t.x + (R() - 0.5) * 30, y: lt, t: 0, big: 1 });
      if (t.dead && t.liq && t.liq !== 'lava' && R() < 0.08) parts.push({ x: t.x + (R() - 0.5) * 24, y: t.y - 10, vx: 0, vy: -50, t: 0, life: 1.2, kind: 'bubble', r: 2 + R() * 3 });
      if (t.dead && t.liq === 'lava' && R() < 0.2) parts.push({ x: t.x + (R() - 0.5) * 30, y: lavaY - 4, vx: wind * 8, vy: -40, t: 0, life: 1.4, kind: 'smoke', r: 6 + R() * 6 });
      x.save(); if (t.sinkK) { if (t.liq === 'lava') x.translate(0, t.sinkK * 46 * t.scale); x.globalAlpha = 1 - t.sinkK * (t.liq === 'lava' ? 1 : 0.55); }
      x.save(); x.translate(t.x, t.y);
      if (t.hurt > 0) x.translate(Math.sin(t.hurt * 40) * 3 * t.hurt, 0);
      // Fallschirm
      if (t.fallFrom != null && t.chute) { x.strokeStyle = ink; x.lineWidth = 1.5; x.fillStyle = t.p.color; x.globalAlpha = 0.85; x.beginPath(); x.arc(0, -90, 40, Math.PI, 0); x.closePath(); x.fill(); x.globalAlpha = 1; x.stroke(); x.beginPath(); x.moveTo(-40, -90); x.lineTo(-14, -26); x.moveTo(40, -90); x.lineTo(14, -26); x.stroke(); }
      x.scale(t.scale, t.scale);
      // Schatten
      x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(0, 4, 32, 5, 0, 0, Math.PI * 2); x.fill();
      x.rotate(tilt(t));
      paintTank(x, { color: t.dead ? '#6b6b6b' : t.p.color, body: t.body, pat: t.dead ? 'hatch' : t.pat, ang: t.ang - tilt(t) * -180 / Math.PI, roll: t.roll, kick: t.kick || 0, wind, tm, dead: t.dead }, dark, ink);
      if (t.snowCap > 0.6) { const h2 = t.snowCap, tr = t.body === 'dome' ? 15 : t.body === 'heavy' ? 13 : 11, hw = t.body === 'heavy' ? 28 : 25; x.fillStyle = '#ffffff'; x.strokeStyle = 'rgba(120,150,190,.8)'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(0, -13 - tr + 1, tr * 0.8, h2 * 0.55, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.ellipse(-hw + 9, -13, 7, h2 * 0.4, 0, Math.PI, 0); x.ellipse(hw - 9, -13, 7, h2 * 0.4, 0, Math.PI, 0); x.fill(); }
      x.restore(); x.restore();
      if (t.shield > 0 && !t.dead) { x.save(); x.strokeStyle = t.p.color; x.globalAlpha = 0.5 + Math.sin(tm / 200) * 0.15; x.lineWidth = 3; x.setLineDash([7, 6]); x.beginPath(); x.arc(t.x, t.y - 12 * t.scale, 44 * t.scale, Math.PI * 1.02, Math.PI * 1.98); x.stroke(); x.setLineDash([]); x.fillStyle = t.p.color; x.globalAlpha = 0.07; x.fill(); x.restore(); }
      if (t.poison > 0 && !t.dead) { x.fillStyle = '#3d3dbd'; for (let k = 0; k < 3; k++) { x.globalAlpha = 0.5; x.beginPath(); x.arc(t.x - 14 + k * 14, t.y - 34 - ((tm / 15 + k * 20) % 30), 3, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; }
      if (t.dead && !t.liq) { if (t.burn > 0) { t.burn -= 1 / 60; if (R() < 0.5) parts.push({ x: t.x + (R() - 0.5) * 26, y: t.y - 16, vx: wind * 6 + (R() - 0.5) * 30, vy: -60 - R() * 70, t: 0, life: 0.5 + R() * 0.4, kind: 'ember', r: 1.5 + R() * 2 }); } if (R() < (t.burn > 0 ? 0.3 : 0.12)) parts.push({ x: t.x + (R() - 0.5) * 20, y: t.y - 18, vx: wind * 10, vy: -30, t: 0, life: 1.6, kind: 'smoke', r: 6 + R() * 6 }); }
    }
    function drawTag(t, tm) {
      if (t.dead && ((t.liq && t.sinkK > 0.6) || t.burn > 5.6)) return;
      if (wx === 'fog' && t !== cur() && Math.abs(t.x - cur().x) > 420) return;
      const y0 = t.tagY;
      x.font = `700 15px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const name = t.p.name.length > 12 ? t.p.name.slice(0, 11) + '…' : t.p.name, w = Math.max(64, x.measureText(name).width + 18);
      x.fillStyle = dark ? 'rgba(27,31,40,.85)' : 'rgba(255,255,255,.85)'; x.strokeStyle = t.p.color; x.lineWidth = 2;
      x.beginPath(); x.roundRect(t.x - w / 2, y0 - 22, w, 30, 9); x.fill(); x.stroke();
      x.fillStyle = t.dead ? (dark ? '#8a8f98' : '#8a8f98') : ink; x.fillText(name, t.x, y0 - 12);
      x.fillStyle = dark ? '#3a3f4b' : '#e6e3da'; x.fillRect(t.x - w / 2 + 6, y0 - 2, w - 12, 4);
      x.fillStyle = t.hp / t.hpMax > 0.5 ? '#2fbf71' : t.hp / t.hpMax > 0.25 ? '#f2b632' : '#e0483e'; x.fillRect(t.x - w / 2 + 6, y0 - 2, (w - 12) * clamp(t.hp / t.hpMax, 0, 1), 4);
      if (t === cur() && !over && phase === 'aim') { const b = Math.sin(tm / 180) * 4; x.fillStyle = t.p.color; x.beginPath(); x.moveTo(t.x - 9, y0 - 34 + b); x.lineTo(t.x + 9, y0 - 34 + b); x.lineTo(t.x, y0 - 24 + b); x.closePath(); x.fill(); }
    }
    function drawCrate(c, tm) {
      x.save(); x.translate(c.x, c.y); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink; x.lineWidth = 2;
      if (c.fall) {
        const sw = Math.sin(tm / 400 + c.sway) * 0.12; x.rotate(sw);
        const cg2 = x.createLinearGradient(-28, 0, 28, 0); cg2.addColorStop(0, dark ? '#3b4252' : '#ffffff'); cg2.addColorStop(1, dark ? '#4b5468' : '#ffe9c2');
        x.fillStyle = cg2; x.beginPath(); x.arc(0, -54, 28, Math.PI, 0); x.quadraticCurveTo(14, -48, 0, -52); x.quadraticCurveTo(-14, -48, -28, -54); x.closePath(); x.fill(); x.stroke();
        x.lineWidth = 1.2; x.beginPath(); x.moveTo(-9, -80); x.quadraticCurveTo(-12, -64, -14, -51); x.moveTo(9, -80); x.quadraticCurveTo(12, -64, 14, -51); x.stroke();
        x.lineWidth = 1.4; x.beginPath(); x.moveTo(-27, -54); x.lineTo(-12, -26); x.moveTo(27, -54); x.lineTo(12, -26); x.moveTo(-1, -52); x.lineTo(0, -26); x.stroke();
      } else { x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(0, 1, 18, 3.5, 0, 0, Math.PI * 2); x.fill(); }
      // Holzkiste mit Brettern und Eckbeschlägen (episch = lila, golden = Gold)
      const tier = c.tier || 'normal';
      if (tier !== 'normal') { x.scale(1.15, 1.15); if (!c.fall) { x.save(); x.globalAlpha = 0.35 + 0.15 * Math.sin(tm / 250); x.fillStyle = tier === 'gold' ? '#ffd84d' : '#b48cff'; x.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + tm / 2000, r1 = k % 2 ? 22 : 34; x.lineTo(Math.cos(a) * r1, -14 + Math.sin(a) * r1); } x.closePath(); x.fill(); x.restore(); } }
      const TC = { normal: dark ? ['#8a7048', '#5e4a2e'] : ['#f3d9a2', '#d3a75f'], epic: ['#c9a8ff', '#7b4fd6'], gold: ['#fff0a8', '#e0a106'] }[tier];
      const gr = x.createLinearGradient(0, -28, 0, 0); gr.addColorStop(0, TC[0]); gr.addColorStop(1, TC[1]);
      x.fillStyle = gr; prect(x, -15, -28, 30, 28, 7, 0.5); x.fill();
      x.strokeStyle = dark ? 'rgba(255,230,180,.25)' : 'rgba(120,70,20,.35)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-13, -19); x.lineTo(13, -19); x.moveTo(-13, -10); x.lineTo(13, -10); x.stroke();
      x.strokeStyle = tier === 'gold' ? '#b07800' : tier === 'epic' ? '#5a35a8' : dark ? '#c9a46a' : '#8a5a22'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(-12, -25); x.lineTo(12, -3); x.stroke();
      x.fillStyle = dark ? '#aab2c0' : '#7b8494'; [[-15, -28], [11, -28], [-15, -4], [11, -4]].forEach(([qx, qy]) => x.fillRect(qx, qy, 4, 4));
      x.strokeStyle = ink; x.lineWidth = 2; prect(x, -15, -28, 30, 28, 7, 0.5); x.stroke();
      // Etikett: Leben = Kreuz, Waffe = Granate, Extra = Stern
      const kc = tier === 'gold' ? '#e0a106' : tier === 'epic' ? '#7b4fd6' : c.kind === 'hp' ? '#2fbf71' : c.kind.startsWith('w:') ? '#e0483e' : '#4f7cff';
      x.fillStyle = dark ? '#1b1f28' : '#ffffff'; x.beginPath(); x.arc(0, -14, 8.5, 0, Math.PI * 2); x.fill(); x.strokeStyle = kc; x.lineWidth = 2; x.stroke();
      x.fillStyle = kc;
      if (tier === 'gold') { x.beginPath(); x.moveTo(-5.5, -10); x.lineTo(-5.5, -17); x.lineTo(-2.8, -13.5); x.lineTo(0, -18.5); x.lineTo(2.8, -13.5); x.lineTo(5.5, -17); x.lineTo(5.5, -10); x.closePath(); x.fill(); }
      else if (tier === 'epic') { x.beginPath(); x.moveTo(0, -20); x.lineTo(5.5, -14); x.lineTo(0, -8); x.lineTo(-5.5, -14); x.closePath(); x.fill(); }
      else if (c.kind === 'hp') { x.fillRect(-1.8, -19, 3.6, 10); x.fillRect(-5, -15.8, 10, 3.6); }
      else if (c.kind.startsWith('w:')) { x.beginPath(); x.arc(0, -13, 4, 0, Math.PI * 2); x.fill(); x.fillRect(-1.2, -19.5, 2.4, 3.5); }
      else { x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 2.4 : 5.6; x.lineTo(Math.cos(a) * rr, -14 + Math.sin(a) * rr); } x.closePath(); x.fill(); }
      if (!c.fall) { const g = 0.5 + 0.5 * Math.sin(tm / 300 + c.sway); x.globalAlpha = 0.35 * g; x.strokeStyle = kc; x.lineWidth = 3; prect(x, -19, -32, 38, 36, 9, 0.3); x.stroke(); x.globalAlpha = 1; }
      x.restore();
    }
    function drawShell(s, tm) {
      if (s.wait > 0) return;
      if (s.trail.length > 1) { for (let k = 1; k < s.trail.length; k++) { x.strokeStyle = s.w.c; x.globalAlpha = k / s.trail.length * 0.45; x.lineWidth = 1 + k / s.trail.length * 3; x.beginPath(); x.moveTo(...s.trail[k - 1]); x.lineTo(...s.trail[k]); x.stroke(); } x.globalAlpha = 1; }
      if (s.dead) return;
      x.save(); x.translate(s.x, s.y);
      const big = ['big', 'nuke'].includes(s.w.id) ? (s.w.id === 'nuke' ? 11 : 8) : s.sub ? 4 : 6;
      x.fillStyle = s.w.c; x.globalAlpha = 0.25; x.beginPath(); x.arc(0, 0, big + 6, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      if (s.mode === 'saw') { x.rotate(s.spin); x.fillStyle = '#c9ccd6'; x.strokeStyle = ink; x.lineWidth = 1.5; x.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? 9 : 13; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); }
      else if (s.w.k === 'ghost') { x.fillStyle = 'rgba(200,215,240,.85)'; x.beginPath(); x.arc(0, -2, 9, Math.PI, 0); x.lineTo(9, 8); x.lineTo(4, 5); x.lineTo(0, 8); x.lineTo(-4, 5); x.lineTo(-9, 8); x.closePath(); x.fill(); x.strokeStyle = ink; x.lineWidth = 1.2; x.stroke(); x.fillStyle = ink; x.fillRect(-4, -4, 2, 3); x.fillRect(2, -4, 2, 3); }
      else { x.fillStyle = dark ? '#e8ecf4' : '#26262b'; x.beginPath(); x.arc(0, 0, big, 0, Math.PI * 2); x.fill(); x.strokeStyle = s.w.c; x.lineWidth = 2.5; x.stroke(); if (s.w.k === 'timer') { x.fillStyle = '#fff'; x.font = `800 9px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(Math.max(0, Math.ceil(s.w.fuse - s.age))), 0, 0.5); } }
      x.restore();
    }
    function drawBoom(b) {
      const k = b.t / (b.big ? 0.9 : 0.6);
      if (b.heal) { x.strokeStyle = '#2fbf71'; x.globalAlpha = 1 - k; x.lineWidth = 4; x.beginPath(); x.arc(b.x, b.y, b.r * (0.3 + k), 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; return; }
      if (b.erase) { x.fillStyle = dark ? 'rgba(255,160,190,.25)' : 'rgba(255,140,170,.35)'; x.globalAlpha = 1 - k; pcirc(x, b.x, b.y, b.r * (0.6 + k * 0.4), 5, 0.2); x.fill(); x.globalAlpha = 1; return; }
      if (b.muzzle) {   // Mündungsfeuer
        if (k > 0.35) return; const q = 1 - k / 0.35; x.save(); x.translate(b.x, b.y); x.rotate(-b.ang); x.globalCompositeOperation = 'lighter';
        x.fillStyle = `rgba(255,200,90,${0.9 * q})`; x.beginPath(); x.moveTo(0, -7 * q); x.lineTo(26 * q, 0); x.lineTo(0, 7 * q); x.lineTo(8 * q, 0); x.closePath(); x.fill();
        x.fillStyle = `rgba(255,250,220,${q})`; x.beginPath(); x.arc(2, 0, 6 * q, 0, Math.PI * 2); x.fill(); x.restore(); return;
      }
      const r = Math.max(10, b.r);
      if (!b.puffs) b.puffs = Array.from({ length: 7 + Math.min(8, r / 12 | 0) }, () => { const a = R() * Math.PI * 2, d = R() * 0.55; return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8 - 0.15, s: 0.35 + R() * 0.3, up: 0.2 + R() * 0.4 }; });
      x.save();
      // Lichtschein
      if (k < 0.5) { x.globalCompositeOperation = 'lighter'; const lg = x.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 2.2); lg.addColorStop(0, `rgba(255,190,90,${0.5 * (1 - k * 2)})`); lg.addColorStop(1, 'rgba(255,190,90,0)'); x.fillStyle = lg; x.fillRect(b.x - r * 2.2, b.y - r * 2.2, r * 4.4, r * 4.4); x.globalCompositeOperation = 'source-over'; }
      // Druckwelle
      if (k < 0.6) { const q = k / 0.6; x.strokeStyle = b.ring ? `rgba(255,107,90,${1 - q})` : `rgba(255,255,255,${0.85 * (1 - q) ** 2})`; x.lineWidth = (b.ring ? 6 : 4) * (1 - q) + 1; x.beginPath(); x.arc(b.x, b.y, r * (0.4 + q * 1.5), 0, Math.PI * 2); x.stroke(); }
      // Feuerball aus Wolken, wird zu Rauch
      for (const p of b.puffs) {
        const grow = r * (p.s + k * 0.55), px = b.x + p.dx * r * (0.6 + k), py = b.y + p.dy * r * (0.6 + k) - k * r * p.up;
        const hot = Math.max(0, 1 - k * 1.7), a = (1 - k) ** 1.3;
        const g = x.createRadialGradient(px, py, 0, px, py, grow);
        if (hot > 0) { g.addColorStop(0, `rgba(255,${200 + 55 * hot | 0},${120 + 120 * hot | 0},${a})`); g.addColorStop(0.55, `rgba(255,${110 + 60 * hot | 0},30,${a * 0.9})`); g.addColorStop(1, `rgba(140,60,40,0)`); }
        else { const c0 = dark ? 150 : 110; g.addColorStop(0, `rgba(${c0},${c0},${c0 + 6},${a * 0.7})`); g.addColorStop(1, `rgba(${c0},${c0},${c0 + 6},0)`); }
        x.fillStyle = g; x.beginPath(); x.arc(px, py, grow, 0, Math.PI * 2); x.fill();
      }
      // heller Kern
      if (k < 0.22) { x.fillStyle = `rgba(255,255,240,${0.95 * (1 - k / 0.22)})`; x.beginPath(); x.arc(b.x, b.y, r * (0.35 + k), 0, Math.PI * 2); x.fill(); }
      // Papier-Umriss (Stil der App)
      x.strokeStyle = ink; x.globalAlpha = Math.max(0, 0.5 - k) ; x.lineWidth = 1.6; pcirc(x, b.x, b.y, r * (0.55 + k * 0.6), 9, 0.15); x.stroke();
      x.restore();
    }
    function drawParts() {
      for (const q of parts) {
        const a = 1 - q.t / q.life;
        if (q.kind === 'smoke') { x.fillStyle = dark ? `rgba(160,165,180,${0.35 * a})` : `rgba(110,110,115,${0.3 * a})`; x.beginPath(); x.arc(q.x, q.y, q.r * (1 + q.t), 0, Math.PI * 2); x.fill(); }
        else if (q.kind === 'dust') { x.fillStyle = dark ? `rgba(200,190,160,${0.4 * a})` : `rgba(150,120,80,${0.35 * a})`; x.beginPath(); x.arc(q.x, q.y, q.r * (1 + q.t), 0, Math.PI * 2); x.fill(); }
        else if (q.kind === 'spark') { x.strokeStyle = q.c; x.globalAlpha = a; x.lineWidth = q.r; x.beginPath(); x.moveTo(q.x, q.y); x.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); x.stroke(); x.globalAlpha = 1; }
        else if (q.kind === 'ember') { const h2 = 1 - a; x.fillStyle = `rgb(255,${220 - 150 * h2 | 0},${90 - 80 * h2 | 0})`; x.globalAlpha = a; x.beginPath(); x.arc(q.x, q.y, q.r * (0.6 + a * 0.6), 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
        else if (q.kind === 'bubble') { x.strokeStyle = dark ? `rgba(200,230,255,${a})` : `rgba(255,255,255,${a})`; x.lineWidth = 1.4; x.beginPath(); x.arc(q.x, q.y, q.r, 0, Math.PI * 2); x.stroke(); }
        else if (q.kind === 'drop') { x.fillStyle = q.c; x.globalAlpha = a; x.beginPath(); x.arc(q.x, q.y, q.r, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; }
        else { x.save(); x.translate(q.x, q.y); x.rotate(q.rot); x.globalAlpha = Math.min(1, a * 2); x.fillStyle = dark ? shade(q.c.startsWith('#') ? q.c : '#888888', -0.4) : q.c; x.fillRect(-q.r, -q.r, q.r * 2, q.r * 2); x.strokeStyle = ink; x.lineWidth = 0.8; x.strokeRect(-q.r, -q.r, q.r * 2, q.r * 2); x.restore(); }
      }
    }
    function drawWeather(tm, dt) {
      if (wx === 'rain' || wx === 'thunder' || wx === 'snow' || wx === 'storm') {
        const want = wx === 'snow' ? 140 : wx === 'storm' ? 70 : 220;
        while (rainP.length < want) rainP.push({ x: R() * (TW + 400) - 200, y: R() * TH, s: 0.6 + R() * 0.8 });
        if (rainP.length > want) rainP.length = want;
        for (const p of rainP) {
          if (wx === 'snow') { p.y += 50 * p.s * dt; p.x += (wind * 25 + Math.sin(tm / 700 + p.s * 9) * 15) * dt; }
          else if (wx === 'storm') { p.x += (wind * 260 + 200 * Math.sign(wind || 1)) * dt * p.s; p.y += 40 * dt; }
          else { p.y += 620 * p.s * dt; p.x += wind * 70 * dt; }
          const pt = poolTop(p.x), land = Math.min(gAt(p.x) - (wx === 'snow' ? snowAt(p.x) : 0), pt);
          if (p.y > land || p.y > TH) {
            if (wx === 'snow') { const i0 = Math.round(p.x); for (let i = i0 - 3; i <= i0 + 3; i++) if (i >= 0 && i < TW && pt === Infinity) snow[i] = Math.min(SNOW_MAX, snow[i] + 0.25 * (1 - Math.abs(i - i0) / 4)); }
            else if (wx !== 'storm' && pt < Infinity && R() < 0.35) ripples.push({ x: p.x, y: pt, t: 0 });
            else if (wx !== 'storm' && R() < 0.15) parts.push({ x: p.x, y: land, vx: (R() - 0.5) * 40, vy: -40 - R() * 40, t: 0, life: 0.3, kind: 'drop', c: dark ? '#7fb2ff' : '#5b8fd6', r: 1.3 });
            p.y = -10 - R() * 60; p.x = R() * (TW + 400) - 200;
          }
          if (p.x > TW + 220) p.x = -200; if (p.x < -220) p.x = TW + 200;
        }
        if (wx === 'snow') { x.fillStyle = dark ? 'rgba(255,255,255,.85)' : '#ffffff'; x.strokeStyle = 'rgba(120,140,170,.6)'; x.lineWidth = 0.8; for (const p of rainP) { x.beginPath(); x.arc(p.x, p.y, 2 + p.s * 1.5, 0, Math.PI * 2); x.fill(); x.stroke(); } }
        else if (wx === 'storm') { x.strokeStyle = dark ? 'rgba(220,200,150,.35)' : 'rgba(150,120,70,.35)'; x.lineWidth = 1.5; x.beginPath(); for (const p of rainP) { x.moveTo(p.x, p.y); x.lineTo(p.x - Math.sign(wind || 1) * 30 * p.s, p.y - 2); } x.stroke(); }
        else { x.strokeStyle = dark ? 'rgba(150,190,255,.45)' : 'rgba(70,110,180,.4)'; x.lineWidth = 1.3; x.beginPath(); for (const p of rainP) { x.moveTo(p.x, p.y); x.lineTo(p.x - wind * 4, p.y - 14 * p.s); } x.stroke(); }
      }
      if (wx === 'fog') {
        const c = cur(), gr = x.createRadialGradient(c.x, c.y - 40, 140, c.x, c.y - 40, 520);
        gr.addColorStop(0, 'rgba(230,234,240,0)'); gr.addColorStop(1, dark ? 'rgba(40,44,55,.88)' : 'rgba(232,236,242,.88)');
        x.fillStyle = gr; x.fillRect(-40, -40, TW + 80, TH + 80);
      }
    }
    function drawAim(tm) {
      const t = cur(); if (!human() || over || phase !== 'aim') return;
      if (t.fuel > 0 && O.fuel < 99) {
        const span = t.fuel * FUEL_PX / fuelCost(t); x.strokeStyle = t.p.color; x.globalAlpha = 0.45; x.lineWidth = 4; x.setLineDash([2, 9]);
        x.beginPath(); for (let i = Math.max(0, Math.round(t.x - span)); i <= Math.min(TW - 1, Math.round(t.x + span)); i += 4) (i <= t.x - span + 4 ? x.moveTo(i, ground[i] + 14) : x.lineTo(i, ground[i] + 14)); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      }
      const a = t.ang * Math.PI / 180, [mx, my] = muzzle(t), L = 30 + t.pow * 1.1;
      x.strokeStyle = t.p.color; x.lineWidth = 3; x.setLineDash([6, 8]); x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + Math.cos(a) * L, my - Math.sin(a) * L); x.stroke(); x.setLineDash([]);
      let n = t.scope ? 9999 : (wx === 'fog' ? 0 : [0, 22, 55][O.aim] + [0, 18, 40, 110][t.scopeLv]);
      const w = W[t.w];
      if (w.k === 'beam') { x.strokeStyle = w.c; x.globalAlpha = 0.3; x.lineWidth = 2; x.setLineDash([4, 6]); x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + Math.cos(a) * 1600, my - Math.sin(a) * 1600); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; return; }
      if (n > 0) {
        const r = sim(t, t.ang, t.pow, w); const pts = r.path.slice(0, n);
        x.fillStyle = t.p.color; pts.forEach(([px, py], k) => { if (k % 2) return; x.globalAlpha = 0.75 * (1 - k / Math.max(pts.length, 1) * 0.7); x.beginPath(); x.arc(px, py, 2.6, 0, Math.PI * 2); x.fill(); }); x.globalAlpha = 1;
        if (t.scope && r.path.length) { x.strokeStyle = t.p.color; x.lineWidth = 2; x.beginPath(); x.arc(r.x, r.y, 12, 0, Math.PI * 2); x.stroke(); }
      }
    }
    function frame(tm) {
      if (fx.signal.aborted) return;
      const dt = Math.min(0.033, last ? (tm - last) / 1000 : 0); last = tm;
      // Fahren
      if (phase === 'aim' && !over) {
        const t = cur();
        if (human()) {
          let dir = keyR - keyL;
          if (dragX != null && Math.abs(dragX - t.x) > 3) dir = Math.sign(dragX - t.x);
          if (dir) { const f0 = t.fuel; drive(t, dir, dt); if (Math.round(f0) !== Math.round(t.fuel)) syncCtrl(); }
          if (O.timer && timeLeft > 0) { timeLeft -= dt; timerEl.textContent = `${Math.max(0, Math.ceil(timeLeft))} s`; timerEl.classList.toggle('low', timeLeft < 6); if (timeLeft <= 0) { msg = 'Zeit um!'; msgT = 1; shoot(); } }
        } else if (cpuDrive) {
          const dir = Math.sign(cpuDrive.goal - t.x);
          if (Math.abs(cpuDrive.goal - t.x) < 4 || !drive(t, dir, dt) || tm > cpuDrive.until) { cpuDrive = null; syncCtrl(); later(cpuAim, 350); }
        }
      }
      // Schüsse
      if (phase === 'fly') {
        for (const s of shells) { for (let k = 0; k < 4; k++) stepShell(s, dt / 4); if (!s.dead && !(s.wait > 0) && R() < 0.3) parts.push({ x: s.x, y: s.y, vx: (R() - 0.5) * 10, vy: -8, t: 0, life: 0.7, kind: 'smoke', r: s.sub ? 2.5 : 4 }); if (!s.dead && !(s.wait > 0)) { s.trail.push([s.x, s.y]); if (s.trail.length > 36) s.trail.shift(); } }
        shells = shells.filter((s) => !s.dead || s.trail.length > 1);
        shells.forEach((s) => { if (s.dead) s.trail.shift(); });
        const busy = shells.some((s) => !s.dead) || pendingFx > 0 || flames.length || T.some((t) => t.fallFrom != null || Math.abs(t.slide) > 1) || beams.some((b) => b.t < 0.4);
        if (!busy) { settleT += dt; if (settleT > 0.55) { phase = 'settle'; shells = []; later(nextTurn, 350); } } else settleT = 0;
      }
      // Panzer fallen / rutschen
      T.forEach((t) => {
        if (Math.abs(t.slide) > 1) { const nx = clamp(t.x + t.slide * dt, 26, TW - 26), up = gAt(t.x) - gAt(nx); if (up > 14) t.slide = 0; else { t.x = nx; t.roll += t.slide * dt * 0.3; } t.slide *= Math.pow(0.04, dt); if (R() < 0.5) parts.push({ x: t.x, y: t.y, vx: -t.slide * 0.1, vy: -20, t: 0, life: 0.5, kind: 'dust', r: 4 }); }
        const g = gAt(t.x);
        if (t.y < g - 1) { if (t.fallFrom == null) { t.fallFrom = t.y; t.vy = 0; } t.vy += (t.chute ? 260 : 900) * dt; if (t.chute) t.vy = Math.min(t.vy, 90); t.y = Math.min(g, t.y + t.vy * dt); }
        else {
          if (t.fallFrom != null) { const drop = g - t.fallFrom; if (drop > 50 && O.fall && !t.chute && !t.dead) { const dm = Math.round((drop - 50) / 5); pop(t.x, t.y - 80, 'Aua!', '#e0483e'); dealDamage(t, dm, t.lastBy && t.lastBy !== t ? t.lastBy : null, shotHits.has(t) ? { op: true } : null); } t.fallFrom = null; t.vy = 0; }
          t.y = g;
        }
        t.hurt = Math.max(0, t.hurt - dt * 1.5); t.kick = Math.max(0, (t.kick || 0) - dt * 4);
      });
      // Feuer
      for (const f of flames) {
        f.t += dt; f.life -= dt;
        const l = gAt(f.x - 3), r = gAt(f.x + 3); f.x = clamp(f.x + (l > r ? -1 : r > l ? 1 : f.dir * 0.3) * 40 * dt, 2, TW - 2); f.y = gAt(f.x);
        if (R() < 0.2) parts.push({ x: f.x, y: f.y - 6, vx: wind * 10, vy: -40, t: 0, life: 0.7, kind: 'smoke', r: 3 });
        for (const t of T) if (!t.dead && Math.abs(t.x - f.x) < 24 * t.scale && Math.abs(t.y - f.y) < 30) { f.acc = (f.acc || 0) + 10 * dt; if (f.acc >= 1) { dealDamage(t, Math.floor(f.acc), f.o, f.w || null); f.acc -= Math.floor(f.acc); } }
      }
      flames = flames.filter((f) => f.life > 0);
      checkMines();
      if (!over) waterStep(dt);
      ripples.forEach((q) => { q.t += dt; }); ripples = ripples.filter((q) => q.t < (q.big ? 1.1 : 0.6));
      for (const c of crates) { if (c.fall) { c.y += 70 * dt; const g = gAt(c.x); if (c.y >= g) { c.y = g; c.fall = false; } } else c.y = gAt(c.x); }
      if (phase === 'aim' && !over) T.forEach((t) => { if (t.y >= gAt(t.x) - 1) pickCrates(t); });
      booms.forEach((b) => { b.t += dt; }); booms = booms.filter((b) => b.t < (b.big ? 0.9 : 0.6));
      parts.forEach((q) => { q.t += dt; if (q.kind === 'smoke' || q.kind === 'dust' || q.kind === 'bubble') { q.x += q.vx * dt + (q.kind === 'bubble' ? Math.sin(q.t * 9 + q.r) * 0.4 : 0); q.y += q.vy * dt; } else { q.vy += 700 * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.kind === 'chunk') { q.rot += dt * 6; const g = gAt(q.x); if (q.y > g) { q.y = g; q.vy *= -0.3; q.vx *= 0.5; } } } });
      parts = parts.filter((q) => q.t < q.life); if (parts.length > 700) parts.splice(0, parts.length - 700);
      pops.forEach((q) => { q.t += dt; }); pops = pops.filter((q) => q.t < 1.6);
      beams.forEach((b) => { b.t += dt; }); beams = beams.filter((b) => b.t < 0.6);
      bolts.forEach((b) => { b.t += dt; }); bolts = bolts.filter((b) => b.t < 0.5);
      feed.forEach((f) => { f.t += dt; }); feed = feed.filter((f) => f.t < 5);
      if (hill) hill.t += dt;
      if (dirty) { dirty = false; syncCtrl(); }
      msgT = Math.max(0, msgT - dt); shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 2);
      // Zeichnen
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      U = Math.min(C.cw / TW, C.ch / TH); ox = (C.cw - TW * U) / 2; oy = (C.ch - TH * U) / 2;
      x.fillStyle = dark ? '#151821' : '#f1efe8'; x.fillRect(0, 0, C.cw, C.ch);
      const sx = shake ? (R() - 0.5) * shake : 0, sy = shake ? (R() - 0.5) * shake : 0;
      x.setTransform(C.dpr * U, 0, 0, C.dpr * U, C.dpr * (ox + sx), C.dpr * (oy + sy));
      x.save(); x.beginPath(); x.rect(0, 0, TW, TH); x.clip();
      drawSky(tm);
      if (hill) { const hy = gAt(hill.x); x.fillStyle = 'rgba(242,182,50,.16)'; x.fillRect(hill.x - hill.w / 2, 0, hill.w, TH); x.strokeStyle = '#e0a106'; x.lineWidth = 2; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(hill.x - hill.w / 2, 0); x.lineTo(hill.x - hill.w / 2, TH); x.moveTo(hill.x + hill.w / 2, 0); x.lineTo(hill.x + hill.w / 2, TH); x.stroke(); x.setLineDash([]); drawCrown(x, hill.x, hy - 110 + Math.sin(hill.t * 2) * 6, 1.2); }
      drawGround();
      drawProps(tm);
      drawSnow(tm);
      for (const f of flames) { const a = Math.min(1, f.life); x.fillStyle = `rgba(255,${120 + Math.round(Math.sin(f.t * 20) * 40)},30,${0.85 * a})`; x.beginPath(); x.moveTo(f.x - 6, f.y); x.quadraticCurveTo(f.x - 7, f.y - 12, f.x, f.y - 20 - Math.sin(f.t * 15) * 5); x.quadraticCurveTo(f.x + 7, f.y - 12, f.x + 6, f.y); x.closePath(); x.fill(); }
      for (const m of mines) {
        x.save(); x.translate(m.x, m.y); x.lineCap = 'round';
        x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath(); x.ellipse(0, 1, 13, 3, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = ink; x.lineWidth = 2.4; x.beginPath(); for (let k = 0; k < 5; k++) { const a = Math.PI * (1.08 + k * 0.21); x.moveTo(Math.cos(a) * 9, -3 + Math.sin(a) * 9); x.lineTo(Math.cos(a) * 14, -3 + Math.sin(a) * 14); } x.stroke();
        const mg = x.createLinearGradient(0, -12, 0, 0); mg.addColorStop(0, dark ? '#7a808c' : '#6b717c'); mg.addColorStop(1, dark ? '#3a3f4b' : '#2e323a');
        x.fillStyle = mg; x.beginPath(); x.arc(0, -2, 10, Math.PI, 0); x.lineTo(11, 0); x.lineTo(-11, 0); x.closePath(); x.fill(); x.lineWidth = 1.6; x.stroke();
        x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.ellipse(-4, -7, 3, 1.6, -0.5, 0, Math.PI * 2); x.fill();
        const on = m.armed && Math.sin(tm / 200) > 0;
        if (on) { x.fillStyle = 'rgba(255,80,60,.35)'; x.beginPath(); x.arc(0, -13, 7, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = on ? '#ff4d3d' : m.armed ? '#a33' : '#8a8f98'; x.beginPath(); x.arc(0, -13, 2.8, 0, Math.PI * 2); x.fill(); x.lineWidth = 1; x.stroke();
        x.restore();
      }
      for (const tr of trees) {
        tr.grow = Math.min(1, tr.grow + 0.02); const g = gAt(tr.x), k = tr.grow, sw = Math.sin(tm / 900 + tr.x) * 2;
        x.save(); x.translate(tr.x, g); x.scale(k, k); x.lineCap = 'round'; x.strokeStyle = ink;
        x.fillStyle = dark ? '#8a6a45' : '#a87a4a'; x.lineWidth = 2; x.beginPath(); x.moveTo(-6, 0); x.quadraticCurveTo(-3, -30, -4, -58); x.lineTo(4, -58); x.quadraticCurveTo(3, -30, 6, 0); x.closePath(); x.fill(); x.stroke();
        [[0, -78, 26], [-20, -62, 18], [20, -62, 18], [-10, -92, 16], [12, -90, 15]].forEach(([qx, qy, qr], j) => { x.fillStyle = j % 2 ? '#3f9a4b' : '#5cbf63'; x.beginPath(); x.arc(qx + sw, qy, qr, 0, Math.PI * 2); x.fill(); x.lineWidth = 1.6; x.stroke(); });
        x.fillStyle = '#ff6b8a'; for (let j = 0; j < tr.left; j++) { x.beginPath(); x.arc(-12 + j * 12 + sw, -70 - (j % 2) * 12, 4, 0, Math.PI * 2); x.fill(); }
        x.restore();
      }
      if (solo) for (const q of targets) if (!q.hit) drawTarget(q, tm);
      crates.forEach((c) => drawCrate(c, tm));
      drawAim(tm);
      T.forEach((t) => drawTank(t, tm));
      drawPools(tm);
      drawHazard(tm);
      shells.forEach((s) => drawShell(s, tm));
      for (const b of beams) { const a = 1 - b.t / 0.6; x.strokeStyle = b.c; x.globalAlpha = a * 0.35; x.lineWidth = b.wide ? 90 : 12; x.beginPath(); x.moveTo(b.x0, b.y0); x.lineTo(b.x1, b.y1); x.stroke(); x.globalAlpha = a; x.lineWidth = b.wide ? 26 : 3; x.strokeStyle = '#fff'; x.stroke(); x.globalAlpha = 1; }
      for (const b of bolts) { const a = 1 - b.t / 0.5; x.strokeStyle = '#ffe27a'; x.globalAlpha = a * 0.4; x.lineWidth = 12; x.beginPath(); b.pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); x.globalAlpha = a; x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke(); x.globalAlpha = 1; }
      booms.forEach(drawBoom);
      drawParts();
      drawWeather(tm, dt);
      // Namensschilder: liegen zwei Panzer dicht beieinander, wird ein Schild nach oben geschoben
      { const placed = []; T.slice().sort((a, b) => (a === cur() ? -1 : b === cur() ? 1 : a.x - b.x)).forEach((t) => { let y0 = t.y - 58 * t.scale - (t === cur() && !over ? 6 : 0); for (let k = 0; k < 8; k++) { const hit = placed.find((q) => Math.abs(q.x - t.x) < 96 && Math.abs(q.y - y0) < 34); if (!hit) break; y0 = hit.y - 36; } t.tagY = y0; placed.push({ x: t.x, y: y0 }); }); }
      T.forEach((t) => drawTag(t, tm));
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      T.forEach((t) => { if (t.hurt > 0 && t.lost) { x.globalAlpha = t.hurt; x.font = `800 28px ${FONT}`; x.lineWidth = 4; x.strokeStyle = dark ? '#1b1f28' : '#fff'; const dy = (t.tagY ?? t.y - 58 * t.scale) - 30 - (t === cur() && phase === 'aim' ? 16 : 0) - (1 - t.hurt) * 24; x.strokeText(`-${t.lost}`, t.x, dy); x.fillStyle = '#e0483e'; x.fillText(`-${t.lost}`, t.x, dy); x.globalAlpha = 1; } });
      pops.forEach((q) => { x.globalAlpha = Math.min(1, (1.6 - q.t) * 2); x.font = `800 22px ${FONT}`; x.lineWidth = 4; x.strokeStyle = dark ? '#1b1f28' : '#fbfaf5'; x.strokeText(q.text, q.x, q.y - q.t * 30); x.fillStyle = q.color; x.fillText(q.text, q.x, q.y - q.t * 30); x.globalAlpha = 1; });
      x.restore();
      x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(0, 0, TW, TH);
      if (flash > 0) { x.fillStyle = `rgba(255,255,255,${flash * 0.6})`; x.fillRect(0, 0, TW, TH); }
      // Meldungen (Bildschirm-Koordinaten)
      x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
      if (feed.length) {
        x.font = `700 13px ${UIF}`; x.textAlign = 'right'; x.textBaseline = 'middle';
        feed.forEach((f, k) => { const tw = Math.min(C.cw * 0.45, x.measureText(f.txt).width + 20), yy = oy + 14 + k * 28, xx = ox + TW * U - 10; x.globalAlpha = Math.min(1, (5 - f.t) * 2); x.fillStyle = dark ? 'rgba(27,31,40,.85)' : 'rgba(255,255,255,.88)'; x.beginPath(); x.roundRect(xx - tw, yy - 11, tw, 22, 11); x.fill(); x.fillStyle = f.c; x.fillRect(xx - tw + 8, yy - 4, 8, 8); x.fillStyle = ink; x.fillText(f.txt, xx - 8, yy + 1, tw - 28); x.globalAlpha = 1; });
      }
      if (msgT > 0) {
        x.save(); x.globalAlpha = Math.min(1, msgT * 3); const fs = Math.round(Math.min(32, C.cw / 18)); x.font = `800 ${fs}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(C.cw - 20, x.measureText(msg).width + 44), hh = fs + 22, yy = oy + 12 + (feed.length && C.cw < 900 ? feed.length * 28 : 0);
        x.fillStyle = dark ? 'rgba(27,31,40,.94)' : 'rgba(251,250,245,.96)'; x.strokeStyle = ink; x.lineWidth = 2; prect(x, C.cw / 2 - w / 2, yy, w, hh, 8, 1); x.fill(); x.stroke();
        x.fillStyle = ink; x.fillText(msg, C.cw / 2, yy + hh / 2 + 1, w - 24); x.restore();
      }
      raf = requestAnimationFrame(frame);
    }
    function drawTarget(q, tm) {
      x.save(); x.translate(q.x, q.y + (q.air ? Math.sin(tm / 500 + q.bob) * 6 : 0)); x.strokeStyle = ink; x.lineWidth = 2;
      if (q.air) { x.beginPath(); x.moveTo(0, 18); x.quadraticCurveTo(6, 40, -2, 60); x.stroke(); }
      else { x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -34); x.stroke(); x.translate(0, -50); }
      [['#fff', 18], ['#e0483e', 14], ['#fff', 9], ['#e0483e', 4]].forEach(([c, r]) => { x.fillStyle = c; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); });
      x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.stroke(); x.restore();
    }

    // Start
    T.forEach((t) => { t.y = gAt(t.x); });
    if (mode.id === 'lotto' && !S0) { const pool = arsenal.filter((id) => !['tele', 'heal'].includes(id)); const t = cur(); t.lotto = pool[(R() * pool.length) | 0]; t.w = t.lotto; }
    msg = S0 ? `Weiter geht's: ${cur().p.name} ist dran` : solo ? 'Triff alle Zielscheiben!' : `${cur().p.name} fängt an`; msgT = 1.5;
    timeLeft = O.timer;
    syncCtrl();
    saveGame(false);
    if (!human()) later(cpuTurn, 1300);
    if (typeof window !== 'undefined') window.__tk = { fireAt: (id, px) => { shotHits = new Map(); const s = mk(px, gAt(px) - 2, 0, 50, W[id], cur()); shells.push(s); impact(s); phase = 'fly'; settleT = 0; }, get trees() { return trees; }, gAt, T, get crates() { return crates; }, dropCrate, get phase() { return phase; }, ground, shoot, get turn() { return turn; }, set wind(v) { wind = v; }, finish, map, mode, get wx() { return wx; }, pool, snow, cg, CS, poolDepth, explode: (px, py, id) => explode(px, py, W[id], cur()), nextTurn, targets, saveGame, snapshot };
    raf = requestAnimationFrame(frame);
  });
}
const UIF = 'system-ui,-apple-system,sans-serif';

// ---------- Panzer zeichnen (auch für die Garage) ----------
// s: { color, body, pat, ang (Rohrwinkel relativ), roll, kick, wind, tm, dead }
export function paintTank(x, s, dark, ink) {
  const c = s.color, light = dark ? shade(c, -0.25) : shade(c, 0.5), mid = dark ? shade(c, -0.05) : shade(c, 0.15), deep = shade(c, dark ? -0.45 : -0.3);
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = ink;
  const body = s.body || 'classic';
  const hullW = body === 'heavy' ? 56 : body === 'racer' ? 50 : 50, hullH = body === 'heavy' ? 15 : body === 'racer' ? 10 : 13;
  // Rohr (Winkel in Grad, 0 = rechts)
  const a = (s.ang || 45) * Math.PI / 180, kick = (s.kick || 0) * 6;
  const barrel = (oy, len, wd) => { x.save(); x.translate(0, -16 + oy); x.lineWidth = wd + 4; x.strokeStyle = ink; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * (len - kick), -Math.sin(a) * (len - kick)); x.stroke(); x.lineWidth = wd; x.strokeStyle = deep; x.stroke(); x.lineWidth = 2; x.strokeStyle = light; x.globalAlpha = 0.6; x.beginPath(); x.moveTo(Math.cos(a) * 6, -Math.sin(a) * 6 - 1); x.lineTo(Math.cos(a) * (len - kick - 4), -Math.sin(a) * (len - kick - 4) - 1); x.stroke(); x.globalAlpha = 1; x.restore(); };
  if (body === 'twin') { barrel(-3, 32, 4); barrel(3, 32, 4); } else barrel(0, body === 'heavy' ? 34 : body === 'racer' ? 30 : 32, body === 'heavy' ? 7 : 5);
  // Turm
  const tr = body === 'dome' ? 15 : body === 'heavy' ? 13 : 11;
  const tg = x.createLinearGradient(0, -16 - tr, 0, -12); tg.addColorStop(0, light); tg.addColorStop(1, mid);
  x.fillStyle = tg; x.beginPath();
  if (body === 'racer') { x.moveTo(-14, -12); x.lineTo(-8, -22); x.lineTo(10, -22); x.lineTo(16, -12); x.closePath(); }
  else { x.arc(0, -13, tr, Math.PI, 0); x.closePath(); }
  x.fill(); x.lineWidth = 2.2; x.stroke();
  if (body === 'dome') { x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(-5, -20, 4, 0, Math.PI * 2); x.fill(); }
  // Wanne
  const hg = x.createLinearGradient(0, -12, 0, 0); hg.addColorStop(0, light); hg.addColorStop(1, mid);
  x.fillStyle = hg; x.beginPath();
  if (body === 'racer') { x.moveTo(-hullW / 2, -2); x.lineTo(-hullW / 2 + 6, -hullH); x.lineTo(hullW / 2 - 2, -hullH); x.lineTo(hullW / 2 + 4, -2); x.closePath(); }
  else { x.moveTo(-hullW / 2, -1); x.lineTo(-hullW / 2 + 4, -hullH); x.lineTo(hullW / 2 - 4, -hullH); x.lineTo(hullW / 2, -1); x.closePath(); }
  x.fill();
  // Muster
  x.save(); x.clip();
  const pat = s.pat || 'hatch';
  if (pat === 'hatch') { x.strokeStyle = c; x.globalAlpha = 0.55; x.lineWidth = 1.3; x.beginPath(); for (let d = -30; d < 40; d += 5) { x.moveTo(d - 6, 0); x.lineTo(d + 8, -16); } x.stroke(); }
  else if (pat === 'stripes') { x.fillStyle = deep; x.globalAlpha = 0.6; for (let d = -28; d < 30; d += 12) x.fillRect(d, -16, 5, 16); }
  else if (pat === 'dots') { x.fillStyle = deep; x.globalAlpha = 0.6; for (let d = -24; d < 28; d += 9) { x.beginPath(); x.arc(d, -6 - (d / 9 % 2 ? 3 : 0), 2.2, 0, Math.PI * 2); x.fill(); } }
  else if (pat === 'camo') { x.globalAlpha = 0.7; [[-16, -7, '#5b6b3a'], [2, -9, '#3f4a28'], [16, -5, '#7a6a40'], [-4, -3, '#2f3a20']].forEach(([px, py, cc]) => { x.fillStyle = cc; x.beginPath(); x.ellipse(px, py, 8, 4, 0.3, 0, Math.PI * 2); x.fill(); }); }
  else if (pat === 'stars') { x.fillStyle = '#ffd84d'; for (let d = -20; d < 26; d += 14) star(x, d, -7, 3.5); }
  else if (pat === 'gold') { const gg = x.createLinearGradient(-25, -14, 25, 0); gg.addColorStop(0, '#ffe58a'); gg.addColorStop(0.5, '#e0a106'); gg.addColorStop(1, '#ffe58a'); x.fillStyle = gg; x.globalAlpha = 0.8; x.fillRect(-30, -16, 60, 16); }
  x.restore();
  x.lineWidth = 2.2; x.strokeStyle = ink; x.beginPath();
  if (body === 'racer') { x.moveTo(-hullW / 2, -2); x.lineTo(-hullW / 2 + 6, -hullH); x.lineTo(hullW / 2 - 2, -hullH); x.lineTo(hullW / 2 + 4, -2); x.closePath(); }
  else { x.moveTo(-hullW / 2, -1); x.lineTo(-hullW / 2 + 4, -hullH); x.lineTo(hullW / 2 - 4, -hullH); x.lineTo(hullW / 2, -1); x.closePath(); }
  x.stroke();
  // Ketten
  const kw = hullW + 6;
  x.fillStyle = dark ? '#2a2e37' : '#4a4d55'; x.beginPath(); x.roundRect(-kw / 2, -3, kw, 11, 5.5); x.fill(); x.stroke();
  x.fillStyle = dark ? '#8a8f98' : '#c9ccd6'; x.lineWidth = 1.3;
  const rr = (s.roll || 0) / 3;
  for (let k = -kw / 2 + 7; k <= kw / 2 - 6; k += (kw - 13) / 4) { x.beginPath(); x.arc(k, 2.5, 3.6, 0, Math.PI * 2); x.fill(); x.stroke(); x.beginPath(); x.moveTo(k, 2.5); x.lineTo(k + Math.cos(rr) * 3.6, 2.5 + Math.sin(rr) * 3.6); x.stroke(); }
  // Antenne mit Fähnchen
  if (!s.dead) {
    const fl = Math.sin((s.tm || 0) / 160) * 2, wv = clamp(s.wind || 0, -2.6, 2.6);
    x.strokeStyle = ink; x.lineWidth = 1.4; x.beginPath(); x.moveTo(-hullW / 2 + 8, -hullH); x.lineTo(-hullW / 2 + 8, -hullH - 22); x.stroke();
    x.fillStyle = c; x.beginPath(); x.moveTo(-hullW / 2 + 8, -hullH - 22); x.quadraticCurveTo(-hullW / 2 + 8 + 6 + wv * 2, -hullH - 22 + fl, -hullW / 2 + 8 + 12 + wv * 3, -hullH - 18 + fl); x.lineTo(-hullW / 2 + 8, -hullH - 14); x.closePath(); x.fill(); x.lineWidth = 1; x.stroke();
  }
  if (body === 'crown') drawCrown(x, 0, -30, 0.7);
}
function star(x, cx, cy, r) { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }
function drawCrown(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = '#ffd84d'; x.strokeStyle = '#a87400'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(-16, 8); x.lineTo(-18, -8); x.lineTo(-8, 0); x.lineTo(0, -12); x.lineTo(8, 0); x.lineTo(18, -8); x.lineTo(16, 8); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#e0483e'; x.beginPath(); x.arc(0, 3, 2.5, 0, Math.PI * 2); x.fill(); x.restore();
}

// ---------- Kleine Waffen-Bilder ----------
export function glyph(c, w, S = 64, dark = isDark()) {
  const ink = inkOf(dark);
  c.setTransform(S / 32, 0, 0, S / 32, 0, 0); c.clearRect(0, 0, 32, 32);
  if (w.op) { const gg = c.createRadialGradient(16, 16, 4, 16, 16, 16); gg.addColorStop(0, 'rgba(255,216,77,.55)'); gg.addColorStop(1, 'rgba(255,216,77,0)'); c.fillStyle = gg; c.fillRect(0, 0, 32, 32); }
  c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; c.lineWidth = 1.6;
  const col = w.c;
  const ball = (x0, y0, r, f = col) => { c.fillStyle = f; c.beginPath(); c.arc(x0, y0, r, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x0 - r * 0.35, y0 - r * 0.35, r * 0.3, 0, Math.PI * 2); c.fill(); };
  const g = w.g;
  if (g === 'ball') ball(16, 16, 8);
  else if (g === 'multi3') { ball(9, 20, 5); ball(16, 12, 5); ball(23, 20, 5); }
  else if (g === 'multi5') { [[6, 22], [11, 13], [16, 9], [21, 13], [26, 22]].forEach(([a, b]) => ball(a, b, 3.6)); }
  else if (g === 'big') { ball(16, 17, 11); c.beginPath(); c.moveTo(22, 8); c.quadraticCurveTo(26, 3, 29, 5); c.stroke(); c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(29, 5, 2, 0, Math.PI * 2); c.fill(); }
  else if (g === 'nuke') { c.fillStyle = col; c.beginPath(); c.roundRect(8, 9, 16, 18, 3); c.fill(); c.stroke(); c.fillStyle = ink; c.fillRect(11, 5, 10, 5); c.strokeRect(11, 5, 10, 5); c.fillStyle = '#fff'; c.font = '800 10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 16, 19); }
  else if (g === 'roll') { ball(16, 18, 8); c.beginPath(); c.moveTo(3, 27); c.lineTo(29, 27); c.stroke(); c.beginPath(); c.arc(16, 18, 4, 0, 4); c.stroke(); }
  else if (g === 'bounce' || g === 'bounce2') { c.setLineDash([2, 3]); c.beginPath(); c.moveTo(3, 26); c.quadraticCurveTo(8, 6, 13, 26); c.quadraticCurveTo(18, 12, 22, 26); c.stroke(); c.setLineDash([]); ball(26, 21, 4.5); }
  else if (g === 'cluster') { ball(16, 14, 7); [[6, 26], [16, 28], [26, 26]].forEach(([a, b]) => ball(a, b, 2.6)); }
  else if (g === 'star') { c.fillStyle = col; star(c, 16, 10, 6); c.stroke(); [[7, 24], [16, 27], [25, 24]].forEach(([a, b]) => { c.fillStyle = col; star(c, a, b, 3.5); }); }
  else if (g === 'confetti') { ['#ff6b5a', '#4f7cff', '#2fbf71', '#f2b632', '#a46bff', '#ff7ac8'].forEach((cc, k) => { c.fillStyle = cc; c.save(); c.translate(6 + (k % 3) * 10, 9 + Math.floor(k / 3) * 12); c.rotate(k); c.fillRect(-3, -1.5, 6, 3); c.restore(); }); }
  else if (g === 'volley') { [6, 13, 20, 27].forEach((a, k) => ball(a, 24 - k * 5, 3.2)); }
  else if (g === 'mole') { c.fillStyle = col; c.beginPath(); c.ellipse(16, 18, 10, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = ink; c.beginPath(); c.arc(22, 16, 1.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ff9fb0'; c.beginPath(); c.arc(26, 18, 2, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(2, 27); c.lineTo(30, 27); c.stroke(); }
  else if (g === 'erase') { c.save(); c.translate(16, 16); c.rotate(-0.6); c.fillStyle = col; c.fillRect(-10, -5, 12, 10); c.fillStyle = '#4f7cff'; c.fillRect(2, -5, 8, 10); c.strokeRect(-10, -5, 20, 10); c.restore(); }
  else if (g === 'dirt') { c.fillStyle = col; c.beginPath(); c.moveTo(3, 27); c.quadraticCurveTo(16, 2, 29, 27); c.closePath(); c.fill(); c.stroke(); }
  else if (g === 'wall') { c.fillStyle = col; c.fillRect(11, 4, 10, 23); c.strokeRect(11, 4, 10, 23); c.beginPath(); c.moveTo(11, 11); c.lineTo(21, 11); c.moveTo(11, 19); c.lineTo(21, 19); c.moveTo(16, 4); c.lineTo(16, 11); c.moveTo(16, 19); c.lineTo(16, 27); c.stroke(); }
  else if (g === 'fire') { c.fillStyle = col; c.beginPath(); c.moveTo(16, 3); c.quadraticCurveTo(27, 14, 24, 22); c.quadraticCurveTo(21, 29, 16, 29); c.quadraticCurveTo(9, 29, 8, 22); c.quadraticCurveTo(7, 14, 16, 3); c.fill(); c.stroke(); c.fillStyle = '#ffd84d'; c.beginPath(); c.arc(16, 22, 4, 0, Math.PI * 2); c.fill(); }
  else if (g === 'laser') { c.strokeStyle = col; c.lineWidth = 4; c.globalAlpha = 0.35; c.beginPath(); c.moveTo(3, 26); c.lineTo(29, 6); c.stroke(); c.globalAlpha = 1; c.lineWidth = 1.6; c.strokeStyle = ink; c.stroke(); c.fillStyle = '#f2d16b'; c.save(); c.translate(9, 22); c.rotate(-0.65); c.fillRect(-6, -2, 12, 4); c.strokeRect(-6, -2, 12, 4); c.restore(); }
  else if (g === 'seek') { ball(12, 18, 6); c.beginPath(); c.moveTo(19, 18); c.quadraticCurveTo(25, 10, 28, 20); c.stroke(); c.beginPath(); c.arc(27, 24, 3.5, 0, Math.PI * 2); c.stroke(); }
  else if (g === 'air') { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(4, 9); c.lineTo(28, 6); c.lineTo(10, 14); c.closePath(); c.fill(); c.stroke(); [10, 17, 24].forEach((a, k) => ball(a, 20 + k * 2, 2.6)); }
  else if (g === 'quake') { c.beginPath(); c.moveTo(2, 20); for (let k = 0; k < 7; k++) c.lineTo(5 + k * 4, k % 2 ? 14 : 26); c.lineTo(30, 20); c.strokeStyle = col; c.lineWidth = 2.5; c.stroke(); }
  else if (g === 'heal') { c.fillStyle = col; c.beginPath(); c.roundRect(5, 10, 22, 12, 6); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillRect(14.5, 12, 3, 8); c.fillRect(12, 14.5, 8, 3); }
  else if (g === 'mine') { c.fillStyle = ink; c.beginPath(); c.arc(16, 22, 9, Math.PI, 0); c.closePath(); c.fill(); c.fillStyle = '#e0483e'; c.beginPath(); c.arc(16, 11, 2.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(3, 22); c.lineTo(29, 22); c.stroke(); }
  else if (g === 'timer') { ball(16, 17, 10, '#fff'); c.beginPath(); c.moveTo(16, 17); c.lineTo(16, 10); c.moveTo(16, 17); c.lineTo(21, 19); c.stroke(); c.fillStyle = col; c.fillRect(13, 3, 6, 4); }
  else if (g === 'leech') { c.fillStyle = col; c.beginPath(); c.arc(16, 13, 9, Math.PI, 0); c.lineTo(20, 22); c.lineTo(12, 22); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(16, 22); c.lineTo(16, 29); c.stroke(); }
  else if (g === 'tele') { c.strokeStyle = col; c.lineWidth = 2.2; [11, 7, 3].forEach((r) => { c.beginPath(); c.arc(16, 16, r, 0, Math.PI * 1.6); c.stroke(); }); }
  else if (g === 'bolt') { c.fillStyle = col; c.beginPath(); c.moveTo(18, 2); c.lineTo(8, 18); c.lineTo(15, 18); c.lineTo(12, 30); c.lineTo(24, 12); c.lineTo(17, 12); c.closePath(); c.fill(); c.stroke(); }
  else if (g === 'rain') { c.fillStyle = '#c9d3e2'; c.beginPath(); c.arc(11, 10, 6, 0, Math.PI * 2); c.arc(19, 9, 7, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); [8, 14, 20, 26].forEach((a) => { c.moveTo(a, 19); c.lineTo(a - 2, 26); }); c.stroke(); }
  else if (g === 'saw') { c.fillStyle = '#c9ccd6'; c.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, rr = k % 2 ? 8 : 12; c.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(16, 16, 3, 0, Math.PI * 2); c.stroke(); }
  else if (g === 'push') { c.strokeStyle = col; c.lineWidth = 2.2; [5, 9, 13].forEach((r) => { c.beginPath(); c.arc(8, 16, r, -0.9, 0.9); c.stroke(); }); ball(7, 16, 3); }
  else if (g === 'snipe') { c.beginPath(); c.arc(16, 16, 10, 0, Math.PI * 2); c.moveTo(16, 2); c.lineTo(16, 30); c.moveTo(2, 16); c.lineTo(30, 16); c.stroke(); c.fillStyle = '#e0483e'; c.beginPath(); c.arc(16, 16, 2.5, 0, Math.PI * 2); c.fill(); }
  else if (g === 'ghost') { c.fillStyle = 'rgba(200,215,240,.95)'; c.beginPath(); c.arc(16, 13, 9, Math.PI, 0); c.lineTo(25, 26); c.lineTo(21, 23); c.lineTo(16, 26); c.lineTo(11, 23); c.lineTo(7, 26); c.closePath(); c.fill(); c.stroke(); c.fillStyle = ink; c.fillRect(12, 11, 2, 3); c.fillRect(18, 11, 2, 3); }
  else if (g === 'ring') { c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(16, 16, 10, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.4; c.strokeStyle = ink; c.beginPath(); c.arc(16, 16, 12.5, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(16, 16, 7.5, 0, Math.PI * 2); c.stroke(); }
  else if (g === 'ink') { c.fillStyle = col; c.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2, rr = k % 2 ? 7 : 11; c.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); }
  else if (g === 'drill') { c.fillStyle = col; c.beginPath(); c.moveTo(10, 4); c.lineTo(22, 4); c.lineTo(16, 29); c.closePath(); c.fill(); c.stroke(); c.beginPath(); for (let k = 0; k < 4; k++) { c.moveTo(11 + k * 1.3, 9 + k * 5); c.lineTo(21 - k * 1.3, 7 + k * 5); } c.stroke(); }
  else if (g === 'comet') { [[10, 10, 4], [20, 14, 5], [14, 22, 3.5]].forEach(([qx, qy, qr]) => { c.strokeStyle = '#ffb02e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(qx - 7, qy - 7); c.lineTo(qx, qy); c.stroke(); c.strokeStyle = ink; c.lineWidth = 1.6; ball(qx, qy, qr); }); }
  else if (g === 'hole') { const gg = c.createRadialGradient(16, 16, 1, 16, 16, 13); gg.addColorStop(0, '#000'); gg.addColorStop(0.6, '#3a2a6b'); gg.addColorStop(1, '#a46bff'); c.fillStyle = gg; c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = '#d8c4ff'; c.beginPath(); c.arc(16, 16, 8, 0.3, 2.6); c.stroke(); c.beginPath(); c.arc(16, 16, 5, 3.4, 5.6); c.stroke(); }
  else if (g === 'chain') { c.fillStyle = col; c.beginPath(); c.moveTo(9, 4); c.lineTo(5, 14); c.lineTo(9, 14); c.lineTo(6, 22); c.lineTo(13, 11); c.lineTo(9, 11); c.lineTo(12, 4); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(21, 10); c.lineTo(17, 20); c.lineTo(21, 20); c.lineTo(18, 28); c.lineTo(25, 17); c.lineTo(21, 17); c.lineTo(24, 10); c.closePath(); c.fill(); c.stroke(); c.setLineDash([2, 2]); c.beginPath(); c.moveTo(11, 18); c.lineTo(19, 14); c.stroke(); c.setLineDash([]); }
  else if (g === 'dragon') { c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(8, 28); c.quadraticCurveTo(4, 16, 10, 8); c.quadraticCurveTo(11, 16, 14, 14); c.quadraticCurveTo(14, 6, 19, 3); c.quadraticCurveTo(18, 12, 23, 13); c.quadraticCurveTo(28, 20, 24, 28); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(12, 28); c.quadraticCurveTo(11, 20, 16, 17); c.quadraticCurveTo(22, 22, 20, 28); c.closePath(); c.fill(); }
  else if (g === 'rift') { c.fillStyle = '#c9a46a'; c.fillRect(3, 14, 26, 14); c.strokeRect(3, 14, 26, 14); c.fillStyle = '#26262b'; c.beginPath(); c.moveTo(13, 14); c.lineTo(16, 20); c.lineTo(14, 24); c.lineTo(17, 28); c.lineTo(19, 28); c.lineTo(18, 23); c.lineTo(20, 19); c.lineTo(19, 14); c.closePath(); c.fill(); c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); c.moveTo(16, 4); c.lineTo(16, 10); c.moveTo(10, 6); c.lineTo(12, 10); c.moveTo(22, 6); c.lineTo(20, 10); c.stroke(); }
  else if (g === 'swarm') { [[8, 8], [17, 5], [24, 12], [12, 17]].forEach(([qx, qy]) => { c.save(); c.translate(qx, qy); c.rotate(0.6); c.fillStyle = col; c.beginPath(); c.moveTo(0, -5); c.lineTo(2.5, 0); c.lineTo(2.5, 5); c.lineTo(-2.5, 5); c.lineTo(-2.5, 0); c.closePath(); c.fill(); c.lineWidth = 1.1; c.stroke(); c.restore(); }); c.strokeStyle = '#e0483e'; c.beginPath(); c.arc(22, 25, 4, 0, Math.PI * 2); c.stroke(); }
  else if (g === 'orbital') { const gg = c.createLinearGradient(10, 0, 22, 0); gg.addColorStop(0, 'rgba(33,184,201,.2)'); gg.addColorStop(0.5, '#bff4ff'); gg.addColorStop(1, 'rgba(33,184,201,.2)'); c.fillStyle = gg; c.fillRect(10, 2, 12, 24); c.strokeStyle = col; c.strokeRect(10, 2, 12, 24); c.fillStyle = '#ffd166'; c.beginPath(); c.ellipse(16, 27, 11, 3.5, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = ink; c.stroke(); }
  else if (g === 'healrain') { c.fillStyle = '#d6f5e1'; c.beginPath(); c.arc(11, 11, 6, 0, Math.PI * 2); c.arc(20, 10, 7, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = col; [[9, 22], [16, 26], [23, 21]].forEach(([qx, qy]) => { c.fillRect(qx - 1.3, qy - 4, 2.6, 8); c.fillRect(qx - 4, qy - 1.3, 8, 2.6); }); }
  else if (g === 'tree') { c.fillStyle = '#a87a4a'; c.fillRect(14, 18, 4, 11); c.strokeRect(14, 18, 4, 11); c.fillStyle = col; c.beginPath(); c.arc(16, 12, 8, 0, Math.PI * 2); c.arc(10, 16, 5, 0, Math.PI * 2); c.arc(22, 16, 5, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#ff6b8a'; c.beginPath(); c.arc(13, 11, 1.8, 0, Math.PI * 2); c.arc(19, 14, 1.8, 0, Math.PI * 2); c.fill(); }
  else if (g === 'magnet') { c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.arc(16, 14, 8, Math.PI, 0); c.lineTo(24, 24); c.moveTo(8, 14); c.lineTo(8, 24); c.stroke(); c.strokeStyle = '#c9ccd6'; c.beginPath(); c.moveTo(8, 23); c.lineTo(8, 27); c.moveTo(24, 23); c.lineTo(24, 27); c.stroke(); }
  else ball(16, 16, 8);
}
