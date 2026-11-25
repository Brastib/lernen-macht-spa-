// Karten-Editor für die Papierpanzer-Arena: Bodenlinie mit Stift oder Finger malen, Hügel/Gräben formen,
// Thema, Wasser/Lava und Wetter wählen, speichern. Höhen im 1200×696-Raum, alle 4 px ein Wert (MYMAP_N = 301).
import { h, icon, toast, confirmSheet } from './ui.js';
import { isDark, inkOf } from './sketch.js';
import { MAP, MAP_THEMES, LIQUIDS, WEATHER, MYMAP_N, flatHeights, loadMyMaps, saveMyMaps } from './tankdata.js';

const MW = 1200, MH = 696, STEP = MW / (MYMAP_N - 1), YMIN = 110, YMAX = 672;
const TOOLS = [
  { id: 'draw', name: 'Malen', ic: 'pen', d: 'Bodenlinie direkt malen' },
  { id: 'raise', name: 'Hügel', ic: 'up', d: 'Boden anheben' },
  { id: 'dig', name: 'Graben', ic: 'down', d: 'Boden absenken' },
  { id: 'smooth', name: 'Glätten', ic: 'wind', d: 'Kanten weicher machen' },
];

// Gibt die id der gespeicherten Karte zurück, oder null bei Abbruch
export function editMap(fx, data) {
  return new Promise((resolve) => {
    const all = loadMyMaps();
    const d = data ? JSON.parse(JSON.stringify(data)) : { id: null, name: `Meine Karte ${all.length + 1}`, theme: 'meadow', liquid: 'none', weather: 'clear', h: flatHeights() };
    let tool = 'draw', size = 60, undo = [], dirty = false, last = null, down = false;
    const dark = isDark(), ink = inkOf(dark);

    const cv = h('canvas.tkedcv', { width: MW, height: MH, 'aria-label': 'Karte malen' });
    const x = cv.getContext('2d');
    const nameIn = h('input.tkedname', { type: 'text', maxlength: 24, value: d.name, 'aria-label': 'Name der Karte', on: { input: () => { d.name = nameIn.value; dirty = true; } } });
    const back = h('button.tkedbtn', { 'aria-label': 'Zurück', title: 'Zurück', on: { click: () => leave() } }, icon('left'));
    const save = h('button.tkedsave', { on: { click: () => doSave() } }, icon('check'), h('span', { text: 'Speichern' }));
    const toolSeg = h('div.gseg.tkedtools');
    const sizeIn = h('input.tkrange', { type: 'range', min: 20, max: 160, step: 5, value: size, 'aria-label': 'Pinselgröße', on: { input: () => { size = +sizeIn.value; } } });
    const sizeBox = h('label.tkedsize', null, h('small', { text: 'Pinsel' }), sizeIn);
    const undoB = h('button.tkedbtn', { 'aria-label': 'Rückgängig', title: 'Rückgängig', on: { click: () => { if (!undo.length) return; d.h = undo.pop(); dirty = true; draw(); syncUndo(); } } }, icon('undo'));
    const clearB = h('button.tkedbtn', { 'aria-label': 'Neu anfangen', title: 'Neu anfangen', on: { click: () => { pushUndo(); d.h = flatHeights(); dirty = true; draw(); } } }, icon('trash'));
    const chipRow = (list, key, label) => h('div.tkedopt', null, h('small', { text: label }), h('div.tkchips', null, ...list.map((o) => {
      const b = h('button.tkchip' + (d[key] === o.id ? '.on' : ''), { on: { click: () => { d[key] = o.id; dirty = true; b.parentNode.querySelectorAll('.tkchip').forEach((q) => q.classList.toggle('on', q === b)); draw(); } } }, h('b', { text: o.name }));
      return b;
    })));
    const opts = h('div.tkedopts', null,
      chipRow(MAP_THEMES, 'theme', 'Aussehen'),
      chipRow(LIQUIDS, 'liquid', 'Unten'),
      chipRow(WEATHER.filter((w) => w.id !== 'map' && w.id !== 'mixed'), 'weather', 'Wetter auf dieser Karte'));
    function syncTools() { toolSeg.replaceChildren(...TOOLS.map((t) => h('button' + (t.id === tool ? '.on' : ''), { title: t.d, on: { click: () => { tool = t.id; syncTools(); } } }, icon(t.ic), h('span', { text: t.name })))); sizeBox.classList.toggle('off', tool === 'draw'); }
    function syncUndo() { undoB.disabled = !undo.length; }
    syncTools(); syncUndo();

    const wrap = h('div.tked', null,
      h('div.tkedbar', null, back, nameIn, save),
      h('div.tkedrow', null, toolSeg, sizeBox, h('div.tkedgap'), undoB, clearB),
      h('div.tkedcvwrap', null, cv),
      h('p.tkedtip', { text: 'Mit Stift oder Finger von links nach rechts die Bodenlinie malen. Hügel und Graben formen den Boden, Glätten macht ihn weicher.' }),
      opts);
    fx.stage.replaceChildren(wrap);

    function pushUndo() { undo.push(d.h.slice()); if (undo.length > 30) undo.shift(); syncUndo(); }
    const toMap = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH]; };
    const clampY = (y) => Math.max(YMIN, Math.min(YMAX, y));
    function apply(px, py) {
      if (tool === 'draw') {
        const [lx, ly] = last || [px, py];
        const a = Math.round(Math.min(lx, px) / STEP), b = Math.round(Math.max(lx, px) / STEP);
        for (let k = Math.max(0, a); k <= Math.min(MYMAP_N - 1, b); k++) { const t = b === a ? 1 : (k * STEP - lx) / (px - lx || 1); d.h[k] = clampY(px === lx ? py : ly + (py - ly) * Math.max(0, Math.min(1, t))); }
      } else {
        const r = size / STEP, c = px / STEP;
        const src = tool === 'smooth' ? d.h.slice() : null;
        for (let k = Math.max(0, Math.floor(c - r)); k <= Math.min(MYMAP_N - 1, Math.ceil(c + r)); k++) {
          const f = Math.max(0, 1 - Math.abs(k - c) / r) ** 2;
          if (tool === 'raise') d.h[k] = clampY(d.h[k] - 7 * f);
          else if (tool === 'dig') d.h[k] = clampY(d.h[k] + 7 * f);
          else { const n = (src[Math.max(0, k - 2)] + src[Math.max(0, k - 1)] + src[k] + src[Math.min(MYMAP_N - 1, k + 1)] + src[Math.min(MYMAP_N - 1, k + 2)]) / 5; d.h[k] = d.h[k] + (n - d.h[k]) * 0.5 * f; }
        }
      }
      last = [px, py]; dirty = true;
    }
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); down = true; pushUndo(); last = null; const p = toMap(e); apply(...p); draw(p); });
    cv.addEventListener('pointermove', (e) => { const p = toMap(e); if (down) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const q of evs.length ? evs : [e]) apply(...toMap(q)); } draw(p); });
    const up = () => { down = false; last = null; draw(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { if (!down) draw(); });

    function draw(cursor) {
      const m = MAP[d.theme] || MAP.meadow, liq = LIQUIDS.find((l) => l.id === d.liquid) || LIQUIDS[0];
      const sk = dark || m.night ? m.skyD : m.sky, gr = x.createLinearGradient(0, 0, 0, MH);
      gr.addColorStop(0, sk[0]); gr.addColorStop(1, sk[1]); x.fillStyle = gr; x.fillRect(0, 0, MW, MH);
      x.strokeStyle = dark || m.night ? 'rgba(255,255,255,.06)' : 'rgba(60,100,170,.1)'; x.lineWidth = 1; x.beginPath();
      for (let gx = 0; gx <= MW; gx += 30) { x.moveTo(gx, 0); x.lineTo(gx, MH); } for (let gy = 0; gy <= MH; gy += 30) { x.moveTo(0, gy); x.lineTo(MW, gy); } x.stroke();
      // Boden
      x.beginPath(); x.moveTo(0, MH); d.h.forEach((y, k) => x.lineTo(k * STEP, y)); x.lineTo(MW, MH); x.closePath();
      const top = Math.min(...d.h), g2 = x.createLinearGradient(0, top, 0, MH); g2.addColorStop(0, m.soil[0]); g2.addColorStop(1, m.soil[1]); x.fillStyle = g2; x.fill();
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.strokeStyle = m.top === '#ffffff' && !dark ? '#c4dff0' : m.top; x.lineWidth = 9; x.beginPath(); d.h.forEach((y, k) => (k ? x.lineTo(k * STEP, y + 4) : x.moveTo(0, y + 4))); x.stroke();
      x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); d.h.forEach((y, k) => (k ? x.lineTo(k * STEP, y) : x.moveTo(0, y))); x.stroke();
      if (liq.water || liq.lava) { const ly = MH * (liq.water || liq.lava); x.fillStyle = liq.lava ? 'rgba(255,90,20,.8)' : 'rgba(70,150,235,.55)'; x.fillRect(0, ly, MW, MH - ly); x.strokeStyle = liq.lava ? '#ffb02e' : '#2f7fd6'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, ly); x.lineTo(MW, ly); x.stroke(); }
      // Größenvergleich: ein Panzer ist so breit
      x.globalAlpha = 0.55; x.fillStyle = ink; x.font = '600 20px system-ui'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText('Panzer-Größe', 18, 16);
      x.beginPath(); x.roundRect(18, 46, 50, 14, 4); x.arc(43, 46, 11, Math.PI, 0); x.fill(); x.lineWidth = 5; x.strokeStyle = ink; x.beginPath(); x.moveTo(43, 38); x.lineTo(66, 24); x.stroke(); x.globalAlpha = 1;
      // Pinsel
      if (cursor && tool !== 'draw') { x.strokeStyle = tool === 'dig' ? '#e0483e' : tool === 'raise' ? '#2f9e5b' : '#4f7cff'; x.lineWidth = 3; x.setLineDash([8, 8]); x.beginPath(); x.arc(cursor[0], cursor[1], size, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    }
    draw();

    function doSave() {
      d.name = (nameIn.value || '').trim() || 'Eigene Karte';
      const list = loadMyMaps();
      if (!d.id) { d.id = 'my_' + Date.now().toString(36); list.push(d); } else { const i = list.findIndex((m) => m.id === d.id); if (i >= 0) list[i] = d; else list.push(d); }
      d.h = d.h.map((v) => Math.round(v * 10) / 10);
      saveMyMaps(list); dirty = false; toast(`„${d.name}“ gespeichert`); resolve(d.id);
    }
    async function leave() {
      if (dirty && !(await confirmSheet('Ohne Speichern zurück?', 'Deine Änderungen an der Karte gehen verloren.', 'Verwerfen'))) return;
      resolve(null);
    }
    fx.signal.addEventListener('abort', () => resolve(null));
  });
}
