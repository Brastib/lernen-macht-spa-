// Papierpanzer: Daten für Waffen, Karten, Wetter, Modi, Optionen, Upgrades und Speicher.
// Alles eigene Namen und eigener Papier-Look.
import { store } from './sketch.js';
import { findProfile, profileData, setProfileData } from './profiles.js';

// ---------- Waffen ----------
// k = Verhalten im Spiel, r = Explosionsradius, dmg = Schaden in der Mitte, n = Munition pro Spiel (Infinity = immer),
// g = kleines Bild (Glyphe), c = Farbe der Glyphe, d = Beschreibung.
export const WEAPONS = [
  { id: 'ball', name: 'Kugel', k: 'std', r: 40, dmg: 40, n: Infinity, g: 'ball', c: '#5b6475', d: 'Die Standard-Kugel. Geht nie aus.' },
  { id: 'three', name: 'Dreier', k: 'std', split: 3, spread: 0.07, r: 26, dmg: 20, n: 3, g: 'multi3', c: '#4f7cff', d: 'Drei Kugeln auf einmal, leicht gefächert.' },
  { id: 'five', name: 'Fünfer', k: 'std', split: 5, spread: 0.06, r: 24, dmg: 16, n: 2, g: 'multi5', c: '#2f6fd6', d: 'Fünf Kugeln im Fächer. Gut gegen Gruppen.' },
  { id: 'big', name: 'Riesenknall', k: 'std', r: 75, dmg: 60, n: 2, g: 'big', c: '#e0483e', d: 'Großer Krater, viel Schaden.' },
  { id: 'nuke', name: 'Tintenfass', k: 'std', r: 145, dmg: 85, n: 1, g: 'nuke', c: '#3d3dbd', d: 'Der größte Knall im Spiel. Nur einmal.' },
  { id: 'roll', name: 'Rollbombe', k: 'roll', r: 44, dmg: 40, n: 2, g: 'roll', c: '#e08a1e', d: 'Rollt am Boden weiter, bis sie an einen Panzer stößt.' },
  { id: 'hop', name: 'Hüpfball', k: 'bounce', hops: 3, r: 42, dmg: 40, n: 2, g: 'bounce', c: '#2fbf71', d: 'Springt dreimal auf, dann knallt es.' },
  { id: 'rubber', name: 'Gummiball', k: 'bounce', hops: 5, every: true, r: 22, dmg: 12, n: 2, g: 'bounce2', c: '#ff7ac8', d: 'Knallt bei jedem Aufprall ein bisschen, fünfmal.' },
  { id: 'cluster', name: 'Streubombe', k: 'cluster', sub: 6, r: 30, dmg: 18, n: 2, g: 'cluster', c: '#a46bff', d: 'Platzt beim Aufprall in sechs kleine Bomben.' },
  { id: 'mirv', name: 'Sternregen', k: 'apex', sub: 5, r: 30, dmg: 22, n: 2, g: 'star', c: '#f2b632', d: 'Teilt sich am höchsten Punkt in fünf Sterne.' },
  { id: 'confetti', name: 'Konfetti', k: 'std', split: 10, spread: 0.16, r: 16, dmg: 8, n: 2, g: 'confetti', c: '#ff6b5a', d: 'Zehn winzige Kugeln, weit gestreut.' },
  { id: 'volley', name: 'Salve', k: 'volley', shots: 5, r: 24, dmg: 15, n: 2, g: 'volley', c: '#21b8c9', d: 'Fünf Schüsse kurz nacheinander.' },
  { id: 'mole', name: 'Wühler', k: 'mole', len: 170, r: 40, dmg: 38, n: 2, g: 'mole', c: '#8a6a3a', d: 'Gräbt sich am Boden entlang und knallt dann.' },
  { id: 'erase', name: 'Radierer', k: 'erase', r: 95, dmg: 0, n: 2, g: 'erase', c: '#ff9fb0', d: 'Radiert ein großes Loch, macht keinen Schaden. Panzer können abstürzen.' },
  { id: 'dirt', name: 'Erdhügel', k: 'dirt', r: 62, dmg: 0, n: 2, g: 'dirt', c: '#9a6b2f', d: 'Schüttet einen Hügel auf. Gut zum Einbuddeln.' },
  { id: 'wall', name: 'Erdmauer', k: 'wall', r: 18, dmg: 0, n: 2, g: 'wall', c: '#7a5a35', d: 'Baut eine hohe Mauer als Deckung.' },
  { id: 'fire', name: 'Tintenfeuer', k: 'fire', drops: 16, r: 24, dmg: 10, n: 2, g: 'fire', c: '#ff7a1a', d: 'Brennende Tinte, die den Hang hinunterläuft.' },
  { id: 'laser', name: 'Lineal-Laser', k: 'beam', r: 18, dmg: 36, n: 2, g: 'laser', c: '#e0483e', d: 'Schnurgerade, ohne Wind und ohne Schwerkraft.' },
  { id: 'seek', name: 'Spürnase', k: 'seek', r: 36, dmg: 34, n: 2, g: 'seek', c: '#2fbf71', d: 'Sucht sich im Sinkflug den nächsten Gegner.' },
  { id: 'air', name: 'Luftpost', k: 'air', sub: 6, r: 32, dmg: 22, n: 1, g: 'air', c: '#4f7cff', d: 'Markiert eine Stelle, dann fallen sechs Bomben vom Himmel.' },
  { id: 'quake', name: 'Beben', k: 'quake', r: 380, dmg: 22, n: 1, g: 'quake', c: '#8a6a3a', d: 'Erschüttert den Boden. Trifft alle in der Nähe ein bisschen.' },
  { id: 'heal', name: 'Heilpflaster', k: 'heal', r: 80, dmg: -35, n: 2, g: 'heal', c: '#2fbf71', d: 'Heilt alle Panzer im Umkreis um 35, auch Gegner.' },
  { id: 'mine', name: 'Mine', k: 'mine', r: 50, dmg: 45, n: 2, g: 'mine', c: '#5b6475', d: 'Bleibt liegen. Wer darüber fährt, fliegt in die Luft.' },
  { id: 'timer', name: 'Zeitzünder', k: 'timer', fuse: 3, r: 62, dmg: 50, n: 2, g: 'timer', c: '#e0a106', d: 'Hüpft herum und knallt nach 3 Sekunden.' },
  { id: 'leech', name: 'Saugnapf', k: 'std', leech: 0.6, r: 38, dmg: 34, n: 2, g: 'leech', c: '#c2185b', d: 'Was du an Schaden machst, bekommst du zum Teil als Leben.' },
  { id: 'tele', name: 'Teleporter', k: 'tele', r: 0, dmg: 0, n: 2, g: 'tele', c: '#a46bff', d: 'Dein Panzer springt dorthin, wo die Kugel landet.' },
  { id: 'bolt', name: 'Blitz', k: 'bolt', r: 44, dmg: 44, n: 2, g: 'bolt', c: '#f2b632', d: 'Ruft einen Blitz an die Stelle, wo die Kugel landet.' },
  { id: 'rain', name: 'Wolkenbruch', k: 'rain', sub: 14, r: 16, dmg: 9, n: 2, g: 'rain', c: '#21b8c9', d: 'Am höchsten Punkt regnet es viele kleine Tropfen.' },
  { id: 'saw', name: 'Kreissäge', k: 'saw', len: 320, r: 30, dmg: 24, n: 2, g: 'saw', c: '#8a8f98', d: 'Sägt am Boden entlang und trifft jeden Panzer auf dem Weg.' },
  { id: 'push', name: 'Druckwelle', k: 'push', r: 120, dmg: 12, n: 2, g: 'push', c: '#4f7cff', d: 'Wenig Schaden, schiebt aber alle weit weg.' },
  { id: 'snipe', name: 'Scharfschuss', k: 'snipe', r: 18, dmg: 30, bonus: 35, n: 2, g: 'snipe', c: '#26262b', d: 'Sehr schnell. Direkter Treffer macht extra Schaden.' },
  { id: 'ghost', name: 'Geisterkugel', k: 'ghost', r: 40, dmg: 36, n: 2, g: 'ghost', c: '#8fa3c7', d: 'Fliegt durch Berge hindurch, trifft nur Panzer.' },
  { id: 'ring', name: 'Ringknall', k: 'ring', r: 125, inner: 55, dmg: 42, n: 2, g: 'ring', c: '#ff6b5a', d: 'Trifft im Ring außen herum. Die Mitte bleibt sicher.' },
  { id: 'ink', name: 'Kleckser', k: 'std', poison: 3, r: 36, dmg: 16, n: 2, g: 'ink', c: '#3d3dbd', d: 'Tintenklecks: danach 3 Züge lang je 8 Schaden.' },
  { id: 'drill', name: 'Bohrer', k: 'drill', len: 120, r: 46, dmg: 44, n: 2, g: 'drill', c: '#5b6475', d: 'Bohrt sich nach unten und sprengt von unten.' },
  { id: 'magnet', name: 'Magnetkugel', k: 'magnet', r: 34, dmg: 30, n: 2, g: 'magnet', c: '#e0483e', d: 'Wird von Panzern in der Nähe angezogen.' },
];
export const W = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const CLASSIC = ['ball', 'three', 'big', 'roll', 'dirt', 'hop', 'cluster', 'erase'];

// ---------- Extras (ein Extra pro Zug) ----------
export const EXTRAS = [
  { id: 'heal', name: 'Reparieren', ic: 'heart', d: '+30 Leben' },
  { id: 'shield', name: 'Schild', ic: 'shield', d: 'Fängt 35 Schaden ab' },
  { id: 'fuel', name: 'Volltanken', ic: 'bolt', d: 'Tank wieder voll' },
  { id: 'chute', name: 'Fallschirm', ic: 'feather', d: 'Kein Sturzschaden bis zum nächsten Zug' },
  { id: 'scope', name: 'Zielhilfe', ic: 'target', d: 'Zeigt diesen Zug die ganze Flugbahn' },
];

// ---------- Karten ----------
// gen(R, TW, TH) → Höhe pro x. sky: Himmel hell/dunkel, top: Oberflächen-Farbe, soil: Erde, grav/wind: Faktoren.
const S = Math.sin;
export const MAPS = [
  { id: 'meadow', name: 'Wiesenhügel', d: 'Sanfte Hügel, der Klassiker', sky: ['#cfe8ff', '#fdf6e3'], skyD: ['#1c2740', '#2a2f3e'], top: '#3f9a4b', soil: ['#e8d3a8', '#c9a46a'], hill: '#a8cf9a', weather: 'clear',
    gen: (R, TW, TH) => { const p = [R() * 6, R() * 6, R() * 6], a = [60 + R() * 50, 26 + R() * 20, 10]; return (i) => TH * 0.62 - a[0] * S(i / TW * Math.PI * 1.4 + p[0]) - a[1] * S(i / 95 + p[1]) - a[2] * S(i / 31 + p[2]); } },
  { id: 'peaks', name: 'Hochgebirge', d: 'Steile Gipfel, schwer zu treffen', sky: ['#b9d4f0', '#eef3f8'], skyD: ['#141c2e', '#283246'], top: '#f4f6fb', soil: ['#b8b2a6', '#8a8478'], hill: '#9aa6b8', weather: 'snow',
    gen: (R, TW, TH) => { const pk = Array.from({ length: 4 }, (_, k) => ({ x: TW * (0.15 + k * 0.23 + (R() - 0.5) * 0.08), h: 180 + R() * 200, w: 90 + R() * 70 })); return (i) => TH * 0.8 - Math.max(...pk.map((q) => q.h * Math.max(0, 1 - Math.abs(i - q.x) / (q.w * 1.6)) ** 1.4)) - 14 * S(i / 23); } },
  { id: 'twin', name: 'Doppelgipfel', d: 'Zwei Berge, tiefes Tal in der Mitte', sky: ['#ffe2c4', '#fff6ea'], skyD: ['#2a1f2e', '#3a2d33'], top: '#6aa84f', soil: ['#e3c9a0', '#b9905e'], hill: '#d9b48f', weather: 'clear',
    gen: (R, TW, TH) => { const hh = 220 + R() * 80; return (i) => { const u = i / TW; return TH * 0.78 - hh * (Math.exp(-((u - 0.33) ** 2) / 0.012) + Math.exp(-((u - 0.67) ** 2) / 0.012)) - 18 * S(i / 60 + 1); }; } },
  { id: 'canyon', name: 'Schlucht', d: 'Hohe Kanten, tiefer Graben', sky: ['#ffd9a8', '#fff1dc'], skyD: ['#2b1d18', '#3d2a22'], top: '#c9772e', soil: ['#e8a86a', '#b8673a'], hill: '#e0a77a', weather: 'clear',
    gen: (R, TW, TH) => { const c = TW * (0.45 + R() * 0.1), w = 120 + R() * 60; return (i) => { const d = Math.abs(i - c); return TH * 0.42 + (d < w ? (TH * 0.42) * (1 - (d / w) ** 3) : 0) - 10 * S(i / 40) + (d >= w ? 6 * S(i / 13) : 0); }; } },
  { id: 'islands', name: 'Inselkette', d: 'Inseln im Wasser. Im Wasser verliert man Leben', sky: ['#bfe6ff', '#effaff'], skyD: ['#13263a', '#1f3346'], top: '#e9d08a', soil: ['#f0dfb0', '#d1b56f'], hill: '#9fd3c7', weather: 'rain', water: 0.74,
    gen: (R, TW, TH) => { const n = 4 + ((R() * 2) | 0), is = Array.from({ length: n }, (_, k) => ({ x: TW * ((k + 0.5) / n) + (R() - 0.5) * 50, h: 190 + R() * 70, w: TW / n * (0.4 + R() * 0.08) })); return (i) => TH * 0.92 - Math.max(0, ...is.map((q) => q.h * Math.max(0, 1 - ((i - q.x) / q.w) ** 4))) - 6 * S(i / 27); } },
  { id: 'moon', name: 'Mondkrater', d: 'Wenig Schwerkraft, kein Wind, viele Krater', sky: ['#20243a', '#3b4064'], skyD: ['#0b0d18', '#1a1d2e'], top: '#c9ccd6', soil: ['#a7abb8', '#7c8090'], hill: '#4a4f6a', weather: 'clear', grav: 0.55, wind: 0, night: true,
    gen: (R, TW, TH) => { const cr = Array.from({ length: 7 }, () => ({ x: R() * TW, r: 40 + R() * 90, d: 20 + R() * 50 })); return (i) => { let y = TH * 0.64 - 40 * S(i / TW * 5 + 1); for (const c of cr) { const u = (i - c.x) / c.r; if (Math.abs(u) < 1) y += c.d * (1 - u * u); else if (Math.abs(u) < 1.35) y -= c.d * 0.35 * (1.35 - Math.abs(u)) / 0.35; } return y; }; } },
  { id: 'steps', name: 'Treppenland', d: 'Stufen und Plateaus', sky: ['#d6e7ff', '#f6f8ff'], skyD: ['#1a2236', '#283048'], top: '#5c9e3f', soil: ['#d8c39a', '#a98a5b'], hill: '#b5c9a0', weather: 'clear',
    gen: (R, TW, TH) => { const k = 7 + ((R() * 3) | 0), lv = Array.from({ length: k }, () => TH * (0.38 + R() * 0.34)); return (i) => { const f = i / TW * k, a = Math.floor(f), t = f - a, b = Math.min(k - 1, a + 1), s = t < 0.82 ? 0 : (t - 0.82) / 0.18; return lv[a] + (lv[b] - lv[a]) * s * s * (3 - 2 * s); }; } },
  { id: 'dunes', name: 'Dünenmeer', d: 'Sand und viel Wind', sky: ['#ffe7b0', '#fff8e1'], skyD: ['#2e2615', '#3d331f'], top: '#e9c46a', soil: ['#f1d79a', '#d4a957'], hill: '#f0cf8a', weather: 'storm', wind: 1.6,
    gen: (R, TW, TH) => { const p = R() * 6; return (i) => TH * 0.66 - 70 * Math.abs(S(i / 170 + p)) - 30 * S(i / 61 + p * 2) - 20 * S(i / TW * 3); } },
  { id: 'volcano', name: 'Vulkan', d: 'Ein Vulkan in der Mitte, unten Lava', sky: ['#ffcfb3', '#ffeede'], skyD: ['#2a1414', '#3a1d1a'], top: '#4a3b36', soil: ['#7a5a50', '#4f3a33'], hill: '#c98a7a', weather: 'clear', lava: 0.9,
    gen: (R, TW, TH) => { const c = TW * (0.45 + R() * 0.1); return (i) => { const u = (i - c) / (TW * 0.2); const cone = 300 * Math.max(0, 1 - Math.abs(u)) ** 1.2 - (Math.abs(u) < 0.18 ? 90 * (1 - Math.abs(u) / 0.18) : 0); return TH * 0.86 - cone - 60 * Math.max(0, S(i / TW * Math.PI * 2 + 0.3)) - 12 * S(i / 37); }; } },
  { id: 'glacier', name: 'Gletscher', d: 'Eis und Schnee, Fahren kostet mehr Sprit', sky: ['#dff1ff', '#ffffff'], skyD: ['#16202e', '#24303f'], top: '#ffffff', soil: ['#cfe6f5', '#9cc3dd'], hill: '#c4dff0', weather: 'snow', fuelCost: 1.5,
    gen: (R, TW, TH) => { const p = R() * 6; return (i) => TH * 0.6 - 120 * S(i / TW * Math.PI + p) * 0.6 - 40 * Math.abs(S(i / 80 + p)) + 18 * S(i / 19); } },
  { id: 'mesa', name: 'Tafelberge', d: 'Flache Berge mit steilen Wänden', sky: ['#ffd6c0', '#fff0e6'], skyD: ['#2a1c1c', '#3b2828'], top: '#b5562e', soil: ['#e3926a', '#b65f3c'], hill: '#e8b49a', weather: 'clear',
    gen: (R, TW, TH) => { const ms = Array.from({ length: 3 }, (_, k) => ({ x: TW * (0.2 + k * 0.3 + (R() - 0.5) * 0.06), w: 70 + R() * 60, h: 160 + R() * 120 })); return (i) => TH * 0.8 - Math.max(0, ...ms.map((q) => { const d = Math.abs(i - q.x); return d < q.w ? q.h : d < q.w + 40 ? q.h * (1 - (d - q.w) / 40) ** 0.6 : 0; })) - 8 * S(i / 29); } },
  { id: 'city', name: 'Stifte-Stadt', d: 'Bücher- und Stiftetürme als Hochhäuser', sky: ['#d9e4f5', '#f7f9fc'], skyD: ['#151a26', '#232a3a'], top: '#8a8f98', soil: ['#d0d4dc', '#a0a6b2'], hill: '#b8c0cf', weather: 'rain',
    gen: (R, TW, TH) => { const bs = []; for (let x = 80; x < TW - 80; x += 70 + R() * 90) bs.push({ x, w: 40 + R() * 40, h: 60 + R() * 200 }); return (i) => TH * 0.78 - Math.max(0, ...bs.map((b) => (i > b.x && i < b.x + b.w ? b.h : 0))); } },
];
export const MAP = Object.fromEntries(MAPS.map((m) => [m.id, m]));

// ---------- Wetter ----------
export const WEATHER = [
  { id: 'clear', name: 'Klar', d: 'Normaler Wind' },
  { id: 'rain', name: 'Regen', d: 'Feuer brennt kürzer, Wind dreht öfter' },
  { id: 'snow', name: 'Schnee', d: 'Fahren kostet mehr Sprit' },
  { id: 'storm', name: 'Sturm', d: 'Sehr starker Wind' },
  { id: 'fog', name: 'Nebel', d: 'Weit weg sieht man schlecht, keine Zielhilfe' },
  { id: 'thunder', name: 'Gewitter', d: 'Regen und ab und zu ein echter Blitz' },
  { id: 'map', name: 'Wie die Karte', d: 'Jede Karte hat ihr eigenes Wetter' },
  { id: 'mixed', name: 'Wechselhaft', d: 'Alle paar Züge anderes Wetter' },
];

// ---------- Modi ----------
// kind: 'surv' = wer übrig bleibt, 'score' = Punkte nach Runden (mit Wiedereinstieg)
export const MODES = [
  { id: 'ffa', name: 'Jeder gegen jeden', ic: 'tank', kind: 'surv', d: 'Wer als Letzter noch fährt, gewinnt.' },
  { id: 'teams', name: 'Teams', ic: 'pairs', kind: 'surv', teams: true, d: 'Zwei bis vier Teams. Das letzte Team gewinnt.' },
  { id: 'points', name: 'Punktejagd', ic: 'star', kind: 'score', d: 'Jeder Schaden gibt Punkte, Abschuss +50. Wer zerstört wird, steigt wieder ein.' },
  { id: 'teampoints', name: 'Team-Punkte', ic: 'pairs', kind: 'score', teams: true, d: 'Punktejagd im Team. Die Punkte vom Team zählen zusammen.' },
  { id: 'hill', name: 'Hügelkönig', ic: 'castle', kind: 'score', own: true, d: 'Wer seinen Zug im Feld beendet, bekommt 40 Punkte. Das Feld wandert.' },
  { id: 'ink', name: 'Steigende Tinte', ic: 'drop', kind: 'surv', own: true, d: 'Jede Runde steigt die Tinte. Bleib oben!' },
  { id: 'lotto', name: 'Waffen-Lotto', ic: 'dice', kind: 'surv', own: true, d: 'Jeder Zug eine zufällige Waffe. Glück und Können.' },
  { id: 'bounty', name: 'Kopfgeld', ic: 'trophy', kind: 'score', own: true, d: 'Auf den Führenden gibt es doppelte Punkte.' },
  { id: 'crates', name: 'Kisten-Rausch', ic: 'boxes', kind: 'score', own: true, d: 'Viele Kisten. Jede Kiste gibt 30 Punkte und Beute.' },
  { id: 'glass', name: 'Glaskanone', ic: 'bolt', kind: 'surv', own: true, d: 'Alle haben nur 40 Leben, Waffen machen doppelt Schaden.' },
  { id: 'boss', name: 'Riesenpanzer', ic: 'shield', kind: 'surv', own: true, coop: true, d: 'Alle zusammen gegen einen riesigen Computer-Panzer.' },
  { id: 'targets', name: 'Zielscheiben', ic: 'target', kind: 'solo', own: true, d: 'Allein: Triff alle Zielscheiben mit möglichst wenig Schüssen.' },
];
export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));

// ---------- Optionen ----------
export const OPTS = [
  { id: 'hp', name: 'Leben', vals: [[60, '60'], [100, '100'], [150, '150'], [200, '200']], def: 100 },
  { id: 'rounds', name: 'Runden (Punkte-Modi)', vals: [[5, '5'], [8, '8'], [12, '12'], [16, '16']], def: 8 },
  { id: 'wind', name: 'Wind', vals: [[0, 'Aus'], [1, 'Normal'], [2, 'Stark'], [3, 'Wild']], def: 1 },
  { id: 'crates', name: 'Kisten', vals: [[0, 'Aus'], [1, 'Normal'], [2, 'Viele']], def: 1 },
  { id: 'fuel', name: 'Sprit', vals: [[0.5, 'Wenig'], [1, 'Normal'], [2, 'Viel'], [99, 'Unendlich']], def: 1 },
  { id: 'timer', name: 'Zeit pro Zug', vals: [[0, 'Aus'], [30, '30 s'], [45, '45 s'], [60, '60 s']], def: 0 },
  { id: 'arsenal', name: 'Waffen', vals: [['all', 'Alle'], ['deck', '10 zufällige'], ['classic', 'Klassisch'], ['few', 'Nur Kugel']], def: 'all' },
  { id: 'ammo', name: 'Munition', vals: [[1, 'Normal'], [2, 'Doppelt'], [99, 'Unendlich']], def: 1 },
  { id: 'ff', name: 'Team-Schaden', vals: [[0, 'Aus'], [1, 'An']], def: 0 },
  { id: 'aim', name: 'Zielhilfe', vals: [[0, 'Nur Richtung'], [1, 'Kurz'], [2, 'Lang']], def: 1 },
  { id: 'grav', name: 'Schwerkraft', vals: [[0, 'Wie Karte'], [0.6, 'Leicht'], [1, 'Normal'], [1.4, 'Schwer']], def: 0 },
  { id: 'fall', name: 'Sturzschaden', vals: [[0, 'Aus'], [1, 'An']], def: 1 },
  { id: 'cpu', name: 'Computer-Stärke', vals: [[1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer'], [4, 'Profi']], def: 2 },
  { id: 'ups', name: 'Garage-Upgrades', vals: [[1, 'An'], [0, 'Aus (fair)']], def: 1 },
];

// ---------- Garage: Upgrades und Aussehen ----------
// Jede Stufe kostet Schrauben (1, 2, 3).
export const UPGRADES = [
  { id: 'armor', name: 'Panzerung', ic: 'shield', d: ['+10 Leben', '+20 Leben', '+30 Leben'] },
  { id: 'engine', name: 'Motor', ic: 'bolt', d: ['+25 % Sprit', '+50 % Sprit', '+80 % Sprit'] },
  { id: 'barrel', name: 'Rohr', ic: 'target', d: ['+6 % Schaden', '+12 % Schaden', '+18 % Schaden'] },
  { id: 'shield', name: 'Startschild', ic: 'shield', d: ['Start mit 12 Schild', 'Start mit 22 Schild', 'Start mit 32 Schild'] },
  { id: 'scope', name: 'Zielfernrohr', ic: 'eye', d: ['Längere Zielhilfe', 'Noch länger', 'Fast die ganze Bahn'] },
  { id: 'tools', name: 'Werkzeugkiste', ic: 'heart', d: ['+1 Reparieren', 'Reparieren heilt 40', '+1 Reparieren'] },
  { id: 'magnet', name: 'Kisten-Greifer', ic: 'magnet', d: ['Kisten von weiter weg', 'Noch weiter', 'Kisten geben doppelt'] },
  { id: 'ammo', name: 'Munitionslager', ic: 'stack', d: ['+1 Riesenknall', '+1 Streubombe', '+1 Tintenfass'] },
];
export const UPCOST = [1, 2, 3];
export const BODIES = [
  { id: 'classic', name: 'Klassik', cost: 0 },
  { id: 'heavy', name: 'Schwer', cost: 1 },
  { id: 'racer', name: 'Flitzer', cost: 1 },
  { id: 'dome', name: 'Kuppel', cost: 2 },
  { id: 'twin', name: 'Doppelrohr', cost: 2 },
  { id: 'crown', name: 'Königspanzer', cost: 4 },
];
export const PATTERNS = [
  { id: 'hatch', name: 'Schraffur', cost: 0 },
  { id: 'stripes', name: 'Streifen', cost: 1 },
  { id: 'dots', name: 'Punkte', cost: 1 },
  { id: 'camo', name: 'Tarnung', cost: 2 },
  { id: 'stars', name: 'Sterne', cost: 2 },
  { id: 'gold', name: 'Gold', cost: 5 },
];
export const COIN_PER_BOLT = 40;   // Lern-Coins pro Schraube

const gkey = (n) => (n || '').trim().toLowerCase();
// Garage pro Spielerprofil (profiles.js, Bereich 'tanks'); Namen ohne Profil (Gäste) in tkGarage
function rawGarage(name) {
  const pr = findProfile(name);
  if (pr) { const d = profileData(pr.id, 'tanks', null); if (d) return d; }
  return store.get('tkGarage', {})[gkey(name)] || {};
}
export function garage(name) {
  const g = rawGarage(name);
  return { bolts: g.bolts || 0, up: g.up || {}, body: g.body || 'classic', pat: g.pat || 'hatch', own: g.own || ['classic', 'hatch'], cups: g.cups || 0 };
}
export function saveGarage(name, g) {
  const pr = findProfile(name);
  if (pr) { setProfileData(pr.id, 'tanks', g); return; }
  const all = store.get('tkGarage', {}); all[gkey(name)] = g; store.set('tkGarage', all);
}
export function addBolts(name, n) { const g = garage(name); g.bolts += n; saveGarage(name, g); return g.bolts; }

// ---------- Gesamt-Rangliste (Wertung) ----------
// rating startet bei 1000, nach jedem Spiel +/- je nach Platz. hist = letzte Ränge in der Rangliste.
export function ladder() { return store.get('tkLadder', {}); }
export function recordLadder(result) {
  const L = ladder(), n = result.length;
  if (n < 2) return;
  const before = rankOrder(L);
  result.forEach((r) => {
    const k = gkey(r.name); const e = L[k] || { name: r.name, color: r.color, rating: 1000, games: 0, wins: 0, kills: 0, dmg: 0, hist: [] };
    const exp = (n - 1) / 2, got = n - r.place;   // wie viele man hinter sich gelassen hat
    e.rating = Math.max(100, Math.round(e.rating + (got - exp) * (24 / Math.max(1, n - 1)) * 2));
    e.games++; if (r.place === 1) e.wins++; e.kills += r.kills || 0; e.dmg += Math.round(r.dmg || 0); e.name = r.name; e.color = r.color; e.cpu = !!r.cpu;
    L[k] = e;
  });
  const after = rankOrder(L);
  for (const [k, e] of Object.entries(L)) { e.prev = before[k] || null; e.hist = [...(e.hist || []), after[k]].slice(-12); }
  store.set('tkLadder', L);
}
function rankOrder(L) { const o = {}; Object.entries(L).sort((a, b) => b[1].rating - a[1].rating).forEach(([k], i) => { o[k] = i + 1; }); return o; }
export function clearLadder() { store.set('tkLadder', {}); }

// ---------- Liga ----------
export const LIGA_PTS = [12, 9, 7, 5, 4, 3, 2, 1];
export const liga = () => store.get('tkLiga', null);
export const saveLiga = (l) => store.set('tkLiga', l);
export const BOT_NAMES = ['Kiesel', 'Radiergummi', 'Spitzer', 'Tintenklecks', 'Lineal', 'Zirkel', 'Büroklammer', 'Textmarker', 'Heftzwecke', 'Klebestreifen'];
export const COLORS = ['#4f7cff', '#ff6b5a', '#2fbf71', '#f2b632', '#a46bff', '#ff7ac8', '#21b8c9', '#8a8f98'];
export { store };
