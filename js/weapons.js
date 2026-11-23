// Fertige Waffen für den Strichkampf, im Kritzel-Stil gezeichnet. Maße in Arena-Einheiten (Figur = 150 hoch).
// Jede Waffe zeigt nach rechts, der Griff liegt bei (0, 0).

const INK = '#1d1d1f', WOOD = '#c98a4b', METAL = '#7a818c', DARKM = '#4a5059', PAPER = '#f4f1e8', OLIVE = '#7d8a4e', BLADE = '#dfe4ea';

// Werte: Nahkampf { reach, dmg, swing, weight } – Schusswaffe { dmg, rate, mag, reload, speed, size, pellets, spread, life, grav, boom, grenade, weight, near, far }
export const PRESETS = {
  dagger: { name: 'Dolch', kind: 'melee', st: { reach: 58, dmg: 8, swing: 0.2, weight: 0.1 }, box: [-8, -10, 62, 10], muzzle: [60, 0],
    draw: (d) => { d.poly([[0, -4], [14, -4], [14, 4], [0, 4]], WOOD); d.poly([[14, -9], [18, -9], [18, 9], [14, 9]], METAL); d.poly([[18, -5], [52, -3], [60, 0], [52, 3], [18, 5]], BLADE); d.line([[20, 0], [50, 0]]); } },
  short: { name: 'Kurzschwert', kind: 'melee', st: { reach: 82, dmg: 11, swing: 0.3, weight: 0.3 }, box: [-8, -14, 86, 14], muzzle: [84, 0],
    draw: (d) => { d.poly([[-4, -4], [16, -4], [16, 4], [-4, 4]], WOOD); d.poly([[16, -13], [21, -13], [21, 13], [16, 13]], METAL); d.poly([[21, -6], [72, -6], [84, 0], [72, 6], [21, 6]], BLADE); d.line([[24, 0], [70, 0]]); } },
  sword: { name: 'Schwert', kind: 'melee', st: { reach: 106, dmg: 14, swing: 0.38, weight: 0.45 }, box: [-10, -16, 110, 16], muzzle: [108, 0],
    draw: (d) => { d.circle(-6, 0, 5, METAL); d.poly([[-2, -4], [18, -4], [18, 4], [-2, 4]], WOOD); d.poly([[18, -15], [24, -15], [24, 15], [18, 15]], METAL); d.poly([[24, -7], [94, -7], [108, 0], [94, 7], [24, 7]], BLADE); d.line([[27, 0], [92, 0]]); } },
  long: { name: 'Langschwert', kind: 'melee', st: { reach: 140, dmg: 19, swing: 0.56, weight: 0.75 }, box: [-12, -20, 146, 20], muzzle: [144, 0],
    draw: (d) => { d.circle(-7, 0, 6, METAL); d.poly([[-2, -5], [28, -5], [28, 5], [-2, 5]], WOOD); d.poly([[28, -19], [35, -19], [35, 19], [28, 19]], METAL); d.poly([[35, -8], [126, -8], [144, 0], [126, 8], [35, 8]], BLADE); d.line([[38, 0], [124, 0]]); } },

  g17: { name: 'Pistole 17', sub: 'wie Glock 17', kind: 'gun', st: { dmg: 5, rate: 0.45, mag: 12, reload: 1.5, speed: 950, size: 4, spread: 0.03, near: 180, far: 420, weight: 0.15 }, box: [-8, -14, 46, 14], muzzle: [44, -8],
    draw: (d) => { d.poly([[-6, 12], [0, -4], [10, -4], [6, 12]], DARKM); d.poly([[-4, -13], [44, -13], [44, -3], [-4, -3]], METAL); d.line([[14, -3], [18, 4], [24, -3]]); } },
  g18: { name: 'Pistole 18', sub: 'wie Glock 18, Dauerfeuer', kind: 'gun', st: { dmg: 2, rate: 0.09, mag: 20, reload: 2, speed: 950, size: 3.5, spread: 0.1, near: 160, far: 380, weight: 0.12 }, box: [-8, -16, 50, 26], muzzle: [48, -8],
    draw: (d) => { d.poly([[-6, 24], [0, -4], [10, -4], [4, 24]], DARKM); d.poly([[-4, -13], [44, -13], [44, -3], [-4, -3]], METAL); d.poly([[44, -11], [48, -11], [48, -5], [44, -5]], DARKM); d.line([[14, -3], [18, 4], [24, -3]]); d.text('18', 20, -7); } },
  mp5: { name: 'MP', sub: 'wie MP5', kind: 'gun', st: { dmg: 2, rate: 0.12, mag: 30, reload: 2.2, speed: 1000, size: 3.5, spread: 0.06, near: 200, far: 460, weight: 0.25 }, box: [-34, -16, 70, 30], muzzle: [68, -6],
    draw: (d) => { d.line([[-32, -8], [-32, 6], [-6, -2]]); d.poly([[-6, -14], [52, -14], [52, 0], [-6, 0]], DARKM); d.poly([[52, -9], [68, -9], [68, -3], [52, -3]], METAL); d.poly([[0, 0], [8, 0], [6, 14], [-4, 14]], DARKM); d.poly([[18, 0], [26, 0], [30, 28], [22, 28]], METAL); } },
  uzi: { name: 'Mini-MP', sub: 'wie Uzi', kind: 'gun', st: { dmg: 1.8, rate: 0.09, mag: 25, reload: 2, speed: 900, size: 3, spread: 0.13, near: 150, far: 360, weight: 0.15 }, box: [-10, -14, 52, 36], muzzle: [50, -6],
    draw: (d) => { d.poly([[-8, -13], [42, -13], [42, 0], [-8, 0]], DARKM); d.poly([[42, -8], [50, -8], [50, -4], [42, -4]], METAL); d.poly([[2, 0], [12, 0], [12, 34], [2, 34]], METAL); d.line([[18, 0], [22, 6], [28, 0]]); } },
  ak: { name: 'Sturmgewehr', sub: 'wie AK-47', kind: 'gun', st: { dmg: 2.6, rate: 0.15, mag: 30, reload: 2.4, speed: 1100, size: 3.5, spread: 0.05, near: 240, far: 560, weight: 0.4 }, box: [-46, -18, 108, 34], muzzle: [106, -6],
    draw: (d) => { d.poly([[-44, -6], [-8, -12], [-8, 2], [-44, 10]], WOOD); d.poly([[-8, -14], [44, -14], [44, 0], [-8, 0]], METAL); d.poly([[44, -11], [70, -11], [70, -3], [44, -3]], WOOD); d.poly([[70, -8], [106, -8], [106, -4], [70, -4]], DARKM); d.line([[96, -8], [96, -16]]); d.poly([[-6, 0], [2, 0], [0, 14], [-10, 14]], WOOD); d.curve([[14, 0], [24, 0], [34, 30], [24, 32]], METAL); } },
  m14: { name: 'Gewehr', sub: 'wie M14', kind: 'gun', st: { dmg: 9, rate: 0.7, mag: 10, reload: 2.6, speed: 1400, size: 4, spread: 0.01, near: 300, far: 620, weight: 0.5 }, box: [-50, -16, 126, 26], muzzle: [124, -6],
    draw: (d) => { d.poly([[-48, -4], [-4, -10], [86, -10], [86, -2], [-4, -2], [-10, 8], [-48, 10]], WOOD); d.poly([[-4, -15], [40, -15], [40, -8], [-4, -8]], DARKM); d.poly([[86, -8], [124, -8], [124, -4], [86, -4]], DARKM); d.poly([[12, -2], [22, -2], [22, 22], [12, 22]], METAL); d.line([[116, -8], [116, -14]]); } },
  shot: { name: 'Schrotflinte', kind: 'gun', st: { dmg: 2.2, rate: 1, mag: 6, reload: 2.8, speed: 850, size: 3.5, pellets: 6, spread: 0.28, life: 0.45, near: 110, far: 260, weight: 0.55 }, box: [-46, -14, 104, 16], muzzle: [102, -5],
    draw: (d) => { d.poly([[-44, -4], [-6, -10], [-6, 2], [-44, 10]], WOOD); d.poly([[-6, -12], [30, -12], [30, 2], [-6, 2]], DARKM); d.poly([[30, -9], [102, -9], [102, -2], [30, -2]], METAL); d.poly([[44, -2], [80, -2], [80, 6], [44, 6]], WOOD); } },
  dshot: { name: 'Doppelflinte', sub: 'zwei Läufe', kind: 'gun', st: { dmg: 2.4, rate: 0.35, mag: 2, reload: 2.6, speed: 850, size: 3.5, pellets: 7, spread: 0.3, life: 0.45, near: 100, far: 240, weight: 0.65 }, box: [-46, -18, 100, 14], muzzle: [98, -6],
    draw: (d) => { d.poly([[-44, -4], [-6, -10], [-6, 4], [-44, 12]], WOOD); d.poly([[-6, -14], [16, -14], [16, 4], [-6, 4]], DARKM); d.poly([[16, -13], [98, -13], [98, -7], [16, -7]], METAL); d.poly([[16, -6], [98, -6], [98, 0], [16, 0]], METAL); d.poly([[24, 0], [60, 0], [60, 8], [24, 8]], WOOD); } },
  rpg: { name: 'Raketenwerfer', sub: 'wie RPG, macht kaputt', kind: 'gun', st: { dmg: 22, rate: 1, mag: 1, reload: 3.2, speed: 620, size: 7, grav: 140, boom: 95, near: 260, far: 600, weight: 0.9 }, box: [-60, -22, 104, 22], muzzle: [104, -6],
    draw: (d) => { d.poly([[-58, -11], [60, -11], [60, -1], [-58, -1]], OLIVE); d.poly([[-58, -14], [-50, -14], [-50, 2], [-58, 2]], DARKM); d.poly([[60, -16], [84, -16], [104, -6], [84, 4], [60, 4]], OLIVE); d.poly([[-6, -1], [4, -1], [2, 16], [-8, 16]], WOOD); d.poly([[20, -1], [28, -1], [28, 12], [20, 12]], WOOD); } },
  nade: { name: 'Granaten', sub: 'werfen, macht kaputt', kind: 'gun', st: { dmg: 20, rate: 1.2, mag: 3, reload: 2.6, speed: 560, size: 8, grenade: true, grav: 900, boom: 110, near: 220, far: 520, weight: 0.8 }, box: [-12, -24, 14, 14], muzzle: [0, -6],
    draw: (d) => { d.circle(0, 0, 11, OLIVE); d.line([[-8, -3], [8, -3]]); d.line([[-6, 4], [6, 4]]); d.poly([[-4, -16], [4, -16], [4, -10], [-4, -10]], METAL); d.circle(7, -18, 4, null); } },
};
export const PRESET_IDS = Object.keys(PRESETS);

// Zitternde Kritzel-Linien, damit alles wie von Hand gemalt aussieht
function sketcher(x, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const path = (pts, close, j = 0.8) => {
    x.beginPath();
    pts.forEach(([a, b], i) => { const px = a + rnd() * j, py = b + rnd() * j; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    if (close) x.closePath();
  };
  return {
    poly(pts, fill) {
      if (fill) { path(pts, true, 0); x.fillStyle = fill; x.fill(); }
      x.strokeStyle = INK; x.lineWidth = 1.8; path(pts, true); x.stroke();
      x.lineWidth = 0.9; x.globalAlpha = 0.55; path(pts, true, 1.6); x.stroke(); x.globalAlpha = 1;
    },
    line(pts) { x.strokeStyle = INK; x.lineWidth = 1.8; path(pts, false); x.stroke(); },
    curve(pts, fill) {
      x.beginPath(); x.moveTo(...pts[0]); x.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      x.lineTo(pts[3][0] - 10, pts[3][1] - 2); x.bezierCurveTo(pts[2][0] - 10, pts[2][1] - 2, pts[1][0] - 8, pts[1][1], pts[0][0] - 8, pts[0][1]); x.closePath();
      if (fill) { x.fillStyle = fill; x.fill(); }
      x.strokeStyle = INK; x.lineWidth = 1.8; x.stroke();
    },
    circle(cx, cy, r, fill) {
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
      if (fill) { x.fillStyle = fill; x.fill(); }
      x.strokeStyle = INK; x.lineWidth = 1.8; x.beginPath(); x.arc(cx + rnd(), cy + rnd(), r, 0.1, Math.PI * 2.05); x.stroke();
    },
    text(t, cx, cy) { x.fillStyle = PAPER; x.font = '700 7px -apple-system, sans-serif'; x.fillText(t, cx, cy); },
  };
}

const cache = new Map();
// Bild der Waffe: { img, ww, wh, grip: [rel x, rel y], mdx, mdy }
export function presetImage(id) {
  if (cache.has(id)) return cache.get(id);
  const P = PRESETS[id], [x0, y0, x1, y1] = P.box, K = 4, pad = 3;
  const c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0 + pad * 2) * K); c.height = Math.ceil((y1 - y0 + pad * 2) * K);
  const x = c.getContext('2d');
  x.scale(K, K); x.translate(pad - x0, pad - y0);
  x.lineCap = 'round'; x.lineJoin = 'round';
  P.draw(sketcher(x, id.length * 977 + 13));
  const ww = x1 - x0 + pad * 2, wh = y1 - y0 + pad * 2;
  const out = { img: c, ww, wh, grip: [(pad - x0) / ww, (pad - y0) / wh], mdx: P.muzzle[0], mdy: P.muzzle[1] };
  cache.set(id, out);
  return out;
}
