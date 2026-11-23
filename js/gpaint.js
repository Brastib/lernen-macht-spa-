// Malfläche für Games: Skins, Kämpfer und Waffen. Prüft eine Mindestgröße.
import { h, icon, sheet } from './ui.js';

const PALETTE = ['#1d1d1f', '#ffffff', '#4f7cff', '#ff6b5a', '#2fbf71', '#f2b632', '#a46bff', '#ff7ac8', '#8a5a2b', '#8a8f98'];
const S = 600;   // interne Auflösung

// opts: { title, text, color, old (dataURL), min (Anteil der Fläche, den die Zeichnung überspannen muss),
//         grip: [x, y] (0..1, Griff-Punkt für Waffen), removeLabel, stats(info) → Elemente }
// Ergebnis: { url, w, h, grip, info } | 'remove' | null
export function paintSheet(opts) {
  let kind = opts.kind || (opts.kinds ? opts.kinds[0][0] : null);
  const minOf = () => (opts.minFor ? opts.minFor(kind) : opts.min || 0.5);
  return sheet(opts.title, (body, close) => {
    const cv = h('canvas.skincv', { width: S, height: S });
    const x = cv.getContext('2d', { willReadFrequently: true });
    const strokes = [];
    let col = opts.color || '#1d1d1f', size = 14, erase = false, cur = null, box = null;
    if (opts.old) { const im = new Image(); im.onload = () => { strokes.push({ img: im, grip: opts.oldGrip }); redraw(); }; im.src = opts.old; }
    const meter = h('div.skinmeter', null, h('span.skinbar', null, h('i')), h('small'));
    const statBox = h('div.paintstats');
    const save = h('button.btn.primary', { text: opts.saveLabel || 'Sichern', disabled: true });
    const G = opts.grip ? [opts.grip[0] * S, opts.grip[1] * S] : null;

    function redraw() {
      x.clearRect(0, 0, S, S);
      for (const st of strokes) {
        if (st.img) {
          const k = Math.min(S * 0.8 / st.img.width, S * 0.8 / st.img.height, 1.6);
          const w = st.img.width * k, hh = st.img.height * k;
          if (G && st.grip) x.drawImage(st.img, G[0] - st.grip[0] * w, G[1] - st.grip[1] * hh, w, hh);
          else x.drawImage(st.img, (S - w) / 2, (S - hh) / 2, w, hh);
          continue;
        }
        x.save(); x.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
        x.strokeStyle = st.col; x.fillStyle = st.col; x.lineCap = 'round'; x.lineJoin = 'round';
        const pts = st.pts;
        if (pts.length === 1) { x.beginPath(); x.arc(pts[0][0], pts[0][1], pts[0][2] / 2, 0, Math.PI * 2); x.fill(); }
        for (let i = 1; i < pts.length; i++) { x.lineWidth = pts[i][2]; x.beginPath(); x.moveTo(pts[i - 1][0], pts[i - 1][1]); x.lineTo(pts[i][0], pts[i][1]); x.stroke(); }
        x.restore();
      }
      check();
    }
    function measure() {
      const d = x.getImageData(0, 0, S, S).data;
      let x0 = S, y0 = S, x1 = -1, y1 = -1, n = 0, far = 0, fx = 0, fy = 0, nearGrip = false; const min = minOf();
      for (let y = 0; y < S; y += 2) for (let xx = 0; xx < S; xx += 2) {
        if (d[(y * S + xx) * 4 + 3] <= 40) continue;
        n++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (G) { const dd = Math.hypot(xx - G[0], y - G[1]); if (dd > far) { far = dd; fx = xx; fy = y; } if (dd < 50) nearGrip = true; }
      }
      if (x1 < 0) return null;
      return { x0, y0, x1: x1 + 2, y1: y1 + 2, n, far, fx, fy, ang: Math.atan2(fy - (G ? G[1] : 0), fx - (G ? G[0] : 0)), nearGrip };
    }
    function check() {
      box = measure();
      const min = minOf();
      const span = !box ? 0 : G ? box.far / S : Math.max(box.x1 - box.x0, box.y1 - box.y0) / S;
      const gripOk = !G || (box && box.nearGrip);
      const ok = !!box && span >= min && box.n > 80 && gripOk;
      meter.querySelector('i').style.width = Math.min(100, span / min * 100) + '%';
      meter.classList.toggle('ok', ok);
      meter.querySelector('small').textContent = !box ? (opts.empty || 'Mal in das Feld.')
        : !gripOk ? 'Fang am Griff an (beim roten Punkt).'
          : ok ? 'Groß genug. Du kannst sichern.' : (opts.small || 'Noch zu klein. Mal größer, mindestens bis zur gestrichelten Linie.');
      save.disabled = !ok;
      if (opts.stats) statBox.replaceChildren(...(ok ? opts.stats(info(), kind) : []));
      const showM = kind === 'gun' && box;
      muz.hidden = !showM; muzL.hidden = !showM;
      if (showM) { for (const el of [muz, muzL]) { el.style.left = `${box.fx / S * 100}%`; el.style.top = `${box.fy / S * 100}%`; } }
      placeGuide();
    }
    const info = () => box && { kind, n: box.n, len: box.far / S, ang: box.ang, w: (box.x1 - box.x0) / S, h: (box.y1 - box.y0) / S };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S / r.width, (e.clientY - r.top) * S / r.height]; };
    const width = (ev) => (erase ? size * 2.4 : size) * (ev.pointerType === 'pen' ? 0.5 + ev.pressure : 1);
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && e.width > 40) return;   // Handballen ignorieren
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const [a, b] = pos(e);
      cur = { col, erase, pts: [[a, b, width(e)]] };
      strokes.push(cur); redraw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return;
      for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) { const [a, b] = pos(ev); cur.pts.push([a, b, width(ev)]); }
      redraw();
    });
    const up = () => { cur = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const tools = h('div.skintools');
    const drawTools = () => tools.replaceChildren(
      h('div.skinrow', null, ...PALETTE.slice(0, 9).map((c) => h('button.swatch' + (!erase && c === col ? '.on' : ''), { 'aria-label': 'Farbe', style: { '--sw': c }, on: { click: () => { col = c; erase = false; drawTools(); } } }))),
      h('div.skinrow', null,
        ...[[7, 'Dünn'], [14, 'Mittel'], [28, 'Dick']].map(([v, l]) => h('button.skinsize' + (size === v ? '.on' : ''), { 'aria-label': l, title: l, on: { click: () => { size = v; drawTools(); } } }, h('i', { style: { width: v / 2 + 4 + 'px', height: v / 2 + 4 + 'px' } }))),
        h('span.skinsep'),
        h('button.icbtn' + (erase ? '.on' : ''), { 'aria-label': 'Radierer', title: 'Radierer', on: { click: () => { erase = !erase; drawTools(); } } }, icon('eraser')),
        h('button.icbtn', { 'aria-label': 'Rückgängig', title: 'Rückgängig', on: { click: () => { strokes.pop(); redraw(); } } }, icon('undo')),
        h('button.icbtn', { 'aria-label': 'Alles löschen', title: 'Alles löschen', on: { click: () => { strokes.length = 0; redraw(); } } }, icon('trash'))));
    drawTools();
    save.addEventListener('click', () => {
      if (!box) return;
      const pad = 8, sx = Math.max(0, box.x0 - pad), sy = Math.max(0, box.y0 - pad);
      const w = Math.min(S, box.x1 + pad) - sx, hh = Math.min(S, box.y1 + pad) - sy, k = Math.min(1, 260 / Math.max(w, hh));
      const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(hh * k));
      out.getContext('2d').drawImage(cv, sx, sy, w, hh, 0, 0, out.width, out.height);
      close({ url: out.toDataURL('image/png'), w: w / S, h: hh / S, grip: G ? [(G[0] - sx) / w, (G[1] - sy) / hh] : null, muzzle: G ? [(box.fx - sx) / w, (box.fy - sy) / hh] : null, kind, info: info() });
    });
    const guide = h('span.skinguide' + (G ? '.round' : ''));
    function placeGuide() {
      const min = minOf();
      Object.assign(guide.style, G ? { left: `${G[0] / S * 100}%`, top: `${G[1] / S * 100}%`, width: `${min * 200}%`, height: `${min * 200}%` } : { left: `${50 - min * 50}%`, top: `${50 - min * 50}%`, width: `${min * 100}%`, height: `${min * 100}%` });
    }
    const muz = h('span.paintmuz', { hidden: true }), muzL = h('span.paintgriplbl.muz', { text: 'Mündung', hidden: true });
    const pad = h('div.skinpad', null, cv, guide, muz, muzL);
    if (G) pad.append(h('span.paintgrip', { style: { left: `${G[0] / S * 100}%`, top: `${G[1] / S * 100}%` } }), h('span.paintgriplbl', { text: 'Griff', style: { left: `${G[0] / S * 100}%`, top: `${G[1] / S * 100}%` } }));
    if (opts.ghost) pad.prepend(h('img.paintghost', { src: opts.ghost, alt: '' }));
    let kindSeg = null;
    if (opts.kinds) {
      kindSeg = h('div.gseg.paintkind');
      const drawKind = () => kindSeg.replaceChildren(...opts.kinds.map(([k, l]) => h('button' + (k === kind ? '.on' : ''), { text: l, on: { click: () => { kind = k; drawKind(); textEl.textContent = opts.textFor ? opts.textFor(kind) : opts.text; check(); } } })));
      drawKind();
    }
    const textEl = h('p.calm', { text: opts.textFor ? opts.textFor(kind) : opts.text });
    body.append(
      kindSeg, textEl,
      pad, meter, statBox, tools,
      h('div.dlgactions', null,
        opts.old && opts.removeLabel ? h('button.btn', { text: opts.removeLabel, on: { click: () => close('remove') } }) : null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), save));
    redraw();
  });
}
