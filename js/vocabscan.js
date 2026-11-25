// Vokabeln aus Scan: Mit dem Pencil markieren, welche Vokabeln gefordert sind → nur diese Paare als Lernkarten.
// Ablauf: Bereich(e) ziehen → Texterkennung nur dort → Spalten (Vokabel | Deutsch | weg) → Kontrollliste → speichern.
// Läuft komplett auf dem Gerät (Tesseract). Logik in vocabparse.js.
import * as db from './db.js';
import { h, icon, toast, busy, sheet, plural } from './ui.js';
import { OPT_DEFAULT, assignWords, parse, applyEdits, findBoxes, deScore } from './vocabparse.js';

const TOOLS = [
  ['area', 'Bereich', 'Spalten werden automatisch erkannt'],
  ['word', 'Vokabel-Spalte', 'nur diese Spalte als Vokabel'],
  ['trans', 'Deutsch-Spalte', 'nur diese Spalte als Übersetzung'],
  ['skip', 'Weglassen', 'das hier nicht nehmen'],
];
const ROLE_LABEL = { word: 'Vokabel', trans: 'Deutsch', skip: 'Weg', both: 'Beides' };
const ROLE_NEXT = { word: 'trans', trans: 'skip', skip: 'both', both: 'word' };
const FILTERS = [
  ['stop', 'Bei Überschrift aufhören'], ['boxes', 'Kästen weglassen'], ['ipa', 'Lautschrift weg'],
  ['nums', 'Seitenzahlen weg'], ['labels', 'Wortart-Kürzel weg'], ['paren', 'Klammern weg'],
];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (v) => (v * 100).toFixed(3) + '%';

// ---------- Bild für die Texterkennung: nur die markierten Stellen, vergrößert ----------
export function ocrCanvas(img, marks) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const inc = marks.filter((m) => m.t !== 'skip');
  const pad = 0.006;
  const ux0 = clamp(Math.min(...inc.map((m) => m.x0)) - pad, 0, 1), uy0 = clamp(Math.min(...inc.map((m) => m.y0)) - pad, 0, 1);
  const ux1 = clamp(Math.max(...inc.map((m) => m.x1)) + pad, 0, 1), uy1 = clamp(Math.max(...inc.map((m) => m.y1)) + pad, 0, 1);
  const sx = ux0 * W, sy = uy0 * H, sw = (ux1 - ux0) * W, sh = (uy1 - uy0) * H;
  let k = clamp(2200 / sw, 1, 3);
  if (sw * k * sh * k > 14e6) k = Math.sqrt(14e6 / (sw * sh));
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.round(sw * k)); c.height = Math.max(16, Math.round(sh * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  for (const m of inc) {
    const a = m.x0 * W, b = m.y0 * H, w = (m.x1 - m.x0) * W, hh = (m.y1 - m.y0) * H;
    x.drawImage(img, a, b, w, hh, (a - sx) * k, (b - sy) * k, w * k, hh * k);
  }
  for (const m of marks.filter((mm) => mm.t === 'skip')) x.fillRect((m.x0 * W - sx) * k, (m.y0 * H - sy) * k, (m.x1 - m.x0) * W * k, (m.y1 - m.y0) * H * k);
  // Wort-Koordinaten (Pixel dieses Bildes) zurück auf 0..1 der Seite
  const back = (w) => ({ ...w, x0: (sx + w.x0 / k) / W, x1: (sx + w.x1 / k) / W, y0: (sy + w.y0 / k) / H, y1: (sy + w.y1 / k) / H });
  return { canvas: c, back };
}
export function boxImage(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const s = Math.min(1, 700 / W);
  const c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = Math.round(H * s);
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}
export function detectBoxes(img) {
  return findBoxes(boxImage(img));
}
// Erkennen + Auswerten in einem Schritt (auch für Tests)
export async function recognizeMarks(img, marks, onProgress, psm = '3') {
  const { canvas, back } = ocrCanvas(img, marks);
  const { ocrCanvasWords } = await import('./ocr.js');
  const raw = await ocrCanvasWords(canvas, { onProgress, psm });
  return assignWords(raw.map(back), marks);
}

// Einstieg von außen (Stapel, Suche): neue Seite scannen oder vorhandene wählen
export async function startVocab({ deck = null, onDone } = {}) {
  const how = await sheet('Vokabeln aus Scan', (body, close) => {
    body.append(
      h('p.dlgtext', { text: 'Du markierst mit dem Pencil, welche Vokabeln gefordert sind. Die App holt nur diese Paare heraus.' }),
      h('div.vxstart', null,
        h('button.vxpick', { on: { click: () => close('camera') } }, icon('camera'), h('b', { text: 'Seite fotografieren' }), h('small', { text: 'Landet im Eingang, nicht in Fotos' })),
        h('button.vxpick', { on: { click: () => close('page') } }, icon('book'), h('b', { text: 'Seite aus der App' }), h('small', { text: 'Schon gescannte Buchseite' }))));
  });
  if (how === 'camera') {
    const { scanOnce } = await import('./scan.js');
    scanOnce(db.INBOX_BOOK, (page) => vocabFlow(page, { deck, onDone }));
  } else if (how === 'page') {
    const { pickPageSheet } = await import('./editor.js');
    const p = await pickPageSheet({ title: 'Vokabelseite wählen' });
    if (!p) return;
    if (p.kind === 'blank') { toast('Das geht nur mit gescannten Seiten (Foto oder PDF).', 4000); return; }
    vocabFlow(p, { deck, onDone });
  }
}

// ---------- Hauptansicht ----------
export async function vocabFlow(page, { deck = null, onDone } = {}) {
  const blob = await db.getImage(page.id);
  if (!blob) { toast('Zu dieser Seite gibt es kein Bild.', 3500); return; }
  const url = URL.createObjectURL(blob);
  const img = new Image(); img.src = url; img.alt = 'Gescannte Seite';
  try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); toast('Bild konnte nicht geladen werden.'); return; }
  const W = img.naturalWidth, H = img.naturalHeight;

  let marks = (page.vocabMarks || []).map((m) => ({ ...m }));
  let sel = marks.length - 1;
  let tool = 'area';
  let finger = store.get('vxFinger', false);
  const opts = { ...OPT_DEFAULT, ...store.get('vxOpts', {}) };
  let words = null, wordsKey = '', boxes = null;
  let swap = false;
  const ov = new Map();
  let items = [], cols = {};
  let hl = null;
  const keyOf = () => JSON.stringify(marks.map(({ t, x0, y0, x1, y1 }) => [t, x0, y0, x1, y1].map((v) => (typeof v === 'number' ? v.toFixed(4) : v))));

  // --- Gerüst ---
  const root = h('div.vx', { role: 'dialog', 'aria-label': 'Vokabeln aus Scan' });
  const layer = h('div.vxlayer');
  const paper = h('div.vxpaper', null, img, layer);
  const stage = h('div.vxstage', null, paper);
  const side = h('aside.vxside');
  const headMeta = h('small', { text: 'Schritt 1 von 3 · Markieren' });
  root.append(
    h('header.vxhead', null,
      h('button.btn', { on: { click: () => close() } }, icon('left'), 'Zurück'),
      h('div.vxtitle', null, h('b', { text: 'Vokabeln herausholen' }), headMeta)),
    h('div.vxmain', null, stage, side));
  document.body.append(root);

  // --- Zoom ---
  let z = 1;
  const fit = () => { const r = stage.getBoundingClientRect(); return Math.max(0.1, Math.min((r.width - 32) / W, 4)); };
  const setZoom = (nz, cx, cy) => {
    const r = stage.getBoundingClientRect();
    cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
    const px = (stage.scrollLeft + cx - 16) / z, py = (stage.scrollTop + cy - 16) / z;
    z = clamp(nz, fit() * 0.5, 6);
    paper.style.width = W * z + 'px'; paper.style.height = H * z + 'px';
    stage.scrollLeft = px * z - cx + 16; stage.scrollTop = py * z - cy + 16;
    zoomLbl.textContent = Math.round(z / fit() * 100) + ' %';
  };
  const zoomLbl = h('span.vxzl', { text: '100 %' });

  // --- Ebene mit Rechtecken, Spalten, Hervorhebung ---
  function drawLayer() {
    layer.textContent = '';
    if (opts.boxes && boxes) for (const b of boxes) layer.append(h('div.vxbox', { style: { left: pct(b.x0), top: pct(b.y0), width: pct(b.x1 - b.x0), height: pct(b.y1 - b.y0) }, title: 'Kasten – wird weggelassen' }));
    marks.forEach((m, i) => {
      const r = h('div.vxrect.t-' + m.t + (i === sel ? '.sel' : ''), { style: { left: pct(m.x0), top: pct(m.y0), width: pct(m.x1 - m.x0), height: pct(m.y1 - m.y0) } });
      if (cols[i] && words && wordsKey === keyOf()) {
        cols[i].forEach((c, k) => {
          const band = h('div.vxcol.r-' + c.role, { style: { left: pct((c.x0 - m.x0) / (m.x1 - m.x0)), width: pct((c.x1 - c.x0) / (m.x1 - m.x0)) } });
          const chip = h('button.vxchip.r-' + c.role, { text: ROLE_LABEL[c.role], 'aria-label': `Spalte ${k + 1}: ${ROLE_LABEL[c.role]} – antippen zum Ändern`,
            on: { pointerdown: (e) => e.stopPropagation(), click: (e) => { e.stopPropagation(); m.roles[k] = ROLE_NEXT[m.roles[k]]; reparse(); } } });
          band.append(chip);
          r.append(band);
        });
      }
      if (i === sel) {
        for (const c of ['nw', 'ne', 'sw', 'se']) r.append(h('span.vxh.' + c, { 'data-c': c, 'data-i': String(i) }));
        r.append(h('button.vxdel', { 'aria-label': 'Markierung löschen', on: { pointerdown: (e) => e.stopPropagation(), click: (e) => { e.stopPropagation(); marks.splice(i, 1); sel = marks.length - 1; changed(); } } }, icon('close')));
      }
      layer.append(r);
    });
    if (hl) layer.append(h('div.vxhl', { style: { left: pct(hl[0] - 0.004), top: pct(hl[1] - 0.003), width: pct(hl[2] - hl[0] + 0.008), height: pct(hl[3] - hl[1] + 0.006) } }));
    if (draft) layer.append(h('div.vxrect.draft.t-' + tool, { style: { left: pct(draft.x0), top: pct(draft.y0), width: pct(draft.x1 - draft.x0), height: pct(draft.y1 - draft.y0) } }));
  }

  // --- Stift / Finger ---
  let draft = null, drag = null;
  const touches = new Map(); let pinch = null;
  const rel = (e) => { const r = paper.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };
  paper.addEventListener('pointerdown', (e) => {
    const drawIt = e.pointerType === 'pen' || e.pointerType === 'mouse' || finger;
    const hd = e.target.closest('.vxh');
    if (!drawIt && !hd) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; }
      paper.setPointerCapture(e.pointerId); return;
    }
    e.preventDefault();
    paper.setPointerCapture(e.pointerId);
    const p = rel(e);
    if (hd) { drag = { kind: 'handle', i: +hd.dataset.i, c: hd.dataset.c }; return; }
    drag = { kind: 'new', ax: p.x, ay: p.y, sx: e.clientX, sy: e.clientY };
  });
  paper.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      const t = touches.get(e.pointerId);
      if (touches.size === 1) { stage.scrollLeft -= e.clientX - t.x; stage.scrollTop -= e.clientY - t.y; }
      t.x = e.clientX; t.y = e.clientY;
      if (touches.size === 2 && pinch) {
        const [a, b] = [...touches.values()]; const r = stage.getBoundingClientRect();
        setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      return;
    }
    if (!drag) return;
    const p = rel(e);
    if (drag.kind === 'handle') {
      const m = marks[drag.i];
      if (drag.c.includes('w')) m.x0 = Math.min(p.x, m.x1 - 0.01); else m.x1 = Math.max(p.x, m.x0 + 0.01);
      if (drag.c.includes('n')) m.y0 = Math.min(p.y, m.y1 - 0.005); else m.y1 = Math.max(p.y, m.y0 + 0.005);
      drawLayer(); return;
    }
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 && !draft) return;
    draft = { x0: Math.min(drag.ax, p.x), y0: Math.min(drag.ay, p.y), x1: Math.max(drag.ax, p.x), y1: Math.max(drag.ay, p.y) };
    drawLayer();
  });
  const up = (e) => {
    if (touches.has(e.pointerId)) { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'handle') { changed(); return; }
    if (draft && (draft.x1 - draft.x0) * W * z > 14 && (draft.y1 - draft.y0) * H * z > 10) {
      marks.push({ t: tool, ...draft }); sel = marks.length - 1; draft = null; changed(); return;
    }
    draft = null;
    // Antippen: Markierung auswählen
    const p = rel(e);
    let best = -1, area = Infinity;
    marks.forEach((m, i) => { if (p.x >= m.x0 && p.x <= m.x1 && p.y >= m.y0 && p.y <= m.y1) { const a = (m.x1 - m.x0) * (m.y1 - m.y0); if (a < area) { area = a; best = i; } } });
    sel = best; drawLayer();
  };
  paper.addEventListener('pointerup', up);
  paper.addEventListener('pointercancel', up);

  // --- Seitenleiste ---
  const toolBtns = TOOLS.map(([k, l, sub]) => h('button.vxtool.t-' + k, { 'aria-pressed': String(k === tool), on: { click: () => { tool = k; toolBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(TOOLS[j][0] === k))); } } },
    h('i.vxsw'), h('span', null, h('b', { text: l }), h('small', { text: sub }))));
  const fingerBtn = h('button.vxtoggle', { 'aria-pressed': String(finger), on: { click: () => { finger = !finger; store.set('vxFinger', finger); fingerBtn.setAttribute('aria-pressed', String(finger)); } } }, icon('hand'), 'Mit Finger markieren');
  const goBtn = h('button.btn.primary.vxgo', { on: { click: () => recognize() } }, icon('eye'), h('span', { text: 'Vokabeln erkennen' }));
  const wholeBtn = h('button.btn', { on: { click: () => { marks.push({ t: 'area', x0: 0.03, y0: 0.02, x1: 0.97, y1: 0.97 }); sel = marks.length - 1; changed(); } } }, 'Ganze Seite');
  const clearBtn = h('button.btn', { on: { click: () => { marks = []; sel = -1; changed(); } } }, icon('trash'), 'Alles weg');
  const editBtn = h('button.btn.vxeditbtn', { on: { click: () => step1.classList.toggle('open') } }, icon('edit'), 'Markierung ändern');
  const step1 = h('section.vxsec.vxmark', null,
    h('p.vxhint.vxfull', { text: 'Zieh mit dem Pencil ein Rechteck um die geforderten Vokabeln. Mehrere Rechtecke gehen. Mit „Weglassen“ streichst du Teile raus. Ecken ziehen = genauer anpassen.' }),
    h('div.vxtools.vxfull', null, ...toolBtns),
    h('div.vxrow', null, editBtn, fingerBtn, h('div.vxzoom', null,
      h('button.icbtn', { 'aria-label': 'Verkleinern', on: { click: () => setZoom(z / 1.25) } }, icon('zoom-out')), zoomLbl,
      h('button.icbtn', { 'aria-label': 'Vergrößern', on: { click: () => setZoom(z * 1.25) } }, icon('zoom-in')),
      h('button.icbtn', { 'aria-label': 'Ganze Breite', on: { click: () => setZoom(fit()) } }, icon('fitwidth')))),
    h('div.vxrow.vxfull', null, wholeBtn, clearBtn),
    goBtn);
  const filterRow = h('div.vxfilters');
  FILTERS.forEach(([k, l]) => {
    const b = h('button.vxfilter', { 'aria-pressed': String(!!opts[k]), on: { click: () => { opts[k] = !opts[k]; store.set('vxOpts', opts); b.setAttribute('aria-pressed', String(!!opts[k])); reparse(); } } }, icon('check'), l);
    filterRow.append(b);
  });
  const count = h('b');
  const swapBtn = h('button.vxtoggle', { 'aria-pressed': 'false', on: { click: () => { swap = !swap; swapBtn.setAttribute('aria-pressed', String(swap)); renderList(); } } }, icon('swap'), 'Seiten tauschen');
  const listHead = h('div.vxlhead');
  const list = h('div.vxlist');
  const saveBtn = h('button.btn.primary.vxsave', { on: { click: () => save() } }, icon('cards'), h('span'));
  const step2 = h('section.vxsec.vxres', { hidden: true },
    h('div.vxrow.vxcount', null, count, swapBtn),
    h('p.vxhint', { text: 'Tipp im Bild auf die Spalten-Schilder (Vokabel / Deutsch / Weg), um sie zu ändern. Tipp eine Zeile an, dann siehst du sie im Bild.' }),
    filterRow, listHead, list);
  const foot = h('footer.vxfoot', { hidden: true }, saveBtn);
  side.append(step1, step2, foot);

  function changed() {
    drawLayer();
    const stale = words && wordsKey !== keyOf();
    goBtn.querySelector('span').textContent = words ? (stale ? 'Neu erkennen' : 'Erkannt ✓') : 'Vokabeln erkennen';
    goBtn.disabled = !marks.some((m) => m.t !== 'skip') || (words && !stale);
    step2.classList.toggle('stale', !!stale);
    step1.classList.toggle('vxmini', !!words);
    if (stale) step1.classList.add('open');
    page.vocabMarks = marks.map(({ t, x0, y0, x1, y1, roles }) => ({ t, x0, y0, x1, y1, roles }));
    db.updatePage(page.id, { vocabMarks: page.vocabMarks }).catch(() => {});
  }

  async function recognize() {
    if (!marks.some((m) => m.t !== 'skip')) { toast('Markiere zuerst einen Bereich.'); return; }
    busy(true, 'Texterkennung wird geladen …');
    try {
      if (!boxes) boxes = page.vxBoxes || detectBoxes(img);
      words = await recognizeMarks(img, marks, (t) => { const b = document.getElementById('busyText'); if (b) b.textContent = t; });
      wordsKey = keyOf();
      for (const m of marks) delete m.roles;
    } catch (err) { busy(false); toast('Texterkennung fehlgeschlagen: ' + err.message, 5000); return; }
    busy(false);
    ov.clear();
    reparse();
    changed();
    step2.hidden = false; foot.hidden = false;
    step1.classList.remove('open');
    headMeta.textContent = 'Schritt 2 von 3 · Prüfen';
    if (!items.length) toast('Keine Vokabeln gefunden. Ist der Bereich richtig, und ist die Seite scharf?', 5000);
  }

  function reparse() {
    if (!words) return;
    const r = parse(words, marks, opts, boxes || []);
    cols = r.cols;
    items = applyEdits(r.entries, ov);
    drawLayer();
    renderList();
  }

  function renderList() {
    const n = items.filter((e) => e.on && e.word && e.trans).length;
    count.textContent = plural(n, 'Vokabel', 'Vokabeln') + (items.length > n ? ` von ${items.length}` : '');
    saveBtn.querySelector('span').textContent = n ? `${plural(n, 'Karte', 'Karten')} speichern` : 'Nichts ausgewählt';
    saveBtn.disabled = !n;
    listHead.replaceChildren(h('span'), h('small', { text: swap ? 'Vorne: Deutsch' : 'Vorne: Vokabel' }), h('small', { text: swap ? 'Hinten: Vokabel' : 'Hinten: Deutsch' }), h('span'));
    list.replaceChildren(...items.map((e, i) => {
      const o = () => { if (!ov.has(e.key)) ov.set(e.key, {}); return ov.get(e.key); };
      const fW = h('textarea.field.vxin', { rows: 1, 'aria-label': 'Vokabel', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
      const fT = h('textarea.field.vxin', { rows: 1, 'aria-label': 'Deutsch', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
      fW.value = e.word; fT.value = e.trans;
      const grow = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
      requestAnimationFrame(() => { grow(fW); grow(fT); });
      fW.addEventListener('input', () => { o().word = fW.value.replace(/\n/g, ' '); e.word = o().word; grow(fW); renderCount(); });
      fT.addEventListener('input', () => { o().trans = fT.value.replace(/\n/g, ' '); e.trans = o().trans; grow(fT); renderCount(); });
      const focus = () => { hl = e.box; drawLayer(); scrollToBox(e.box); };
      fW.addEventListener('focus', focus); fT.addEventListener('focus', focus);
      const chk = h('button.hwcheck', { 'aria-label': 'Vokabel verwenden', 'aria-pressed': String(e.on), on: { click: () => { e.on = !e.on; o().on = e.on; row.classList.toggle('off', !e.on); chk.setAttribute('aria-pressed', String(e.on)); renderCount(); } } }, icon('select'));
      const warn = !e.word ? 'Vokabel fehlt' : !e.trans ? 'Deutsch fehlt' : e.unsure ? 'unsicher gelesen' : '';
      const upBtn = i ? h('button.icbtn.vxup', { 'aria-label': 'Mit der Zeile darüber verbinden', title: 'Mit oben verbinden', on: { click: () => { o().up = true; reparse(); } } }, icon('up')) : h('span');
      const row = h('div.vxitem' + (e.on ? '' : '.off') + (warn ? '.warn' : ''), null, chk,
        h('div.vxpair', null, ...(swap ? [fT, fW] : [fW, fT]), warn ? h('em.vxwarn', { text: warn }) : null), upBtn);
      return row;
    }));
  }
  function renderCount() {
    const n = items.filter((e) => e.on && e.word.trim() && e.trans.trim()).length;
    count.textContent = plural(n, 'Vokabel', 'Vokabeln') + (items.length > n ? ` von ${items.length}` : '');
    saveBtn.querySelector('span').textContent = n ? `${plural(n, 'Karte', 'Karten')} speichern` : 'Nichts ausgewählt';
    saveBtn.disabled = !n;
  }
  function scrollToBox(b) {
    const r = stage.getBoundingClientRect();
    const y = b[1] * H * z, x = b[0] * W * z;
    if (y < stage.scrollTop || y > stage.scrollTop + r.height - 60) stage.scrollTo({ top: y - r.height / 3, behavior: 'smooth' });
    if (x < stage.scrollLeft || x > stage.scrollLeft + r.width - 60) stage.scrollTo({ left: x - 40, behavior: 'smooth' });
  }

  async function save() {
    const { LANGS } = await import('./cards.js');
    const chosen = items.filter((e) => e.on && e.word.trim() && e.trans.trim()).map((e) => (swap ? { front: e.trans.trim(), back: e.word.trim() } : { front: e.word.trim(), back: e.trans.trim() }));
    if (!chosen.length) return;
    const book = page.bookId ? await db.getBook(page.bookId).catch(() => null) : null;
    const subjects = await db.listSubjects();
    if (!subjects.length) { toast('Leg zuerst ein Fach an.'); return; }
    const guessLang = deScore(chosen.map((c) => c.front).join(' ')) > 0.3 ? 'de-DE' : /[éèêàçù]/.test(chosen.map((c) => c.front).join('')) ? 'fr-FR' : 'en-GB';
    const last = deck ? deck.id : store.get('vxDeck', '');
    const res = await sheet(`${plural(chosen.length, 'Karte', 'Karten')} speichern`, async (body, close) => {
      const subjSel = h('select.field', { id: 'vxSubj' }, ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
      const lastDeck = last ? (await db.listDecks()).find((d) => d.id === last) : null;
      subjSel.value = (deck && deck.subjectId) || (lastDeck && lastDeck.subjectId) || (book && book.subjectId) || subjects.find((s) => /englisch|english/i.test(s.name))?.id || subjects[0].id;
      const deckSel = h('select.field', { id: 'vxDeckSel' });
      const newName = h('input.field', { type: 'text', placeholder: 'Name des neuen Stapels', value: book ? book.title + ' – Vokabeln' : 'Vokabeln', autocomplete: 'off' });
      const langSel = h('select.field', { id: 'vxLang' }, ...Object.entries(LANGS).map(([k, v]) => h('option', { value: k, text: v })));
      langSel.value = guessLang;
      const newBox = h('div.vxnew', null, h('label.fieldlabel', { text: 'Neuer Stapel' }), newName, h('label.fieldlabel', { for: 'vxLang', text: 'Sprache der Vorderseite' }), langSel);
      const fill = async () => {
        const decks = (await db.listDecks(subjSel.value)).sort((a, b) => a.title.localeCompare(b.title));
        deckSel.replaceChildren(...decks.map((d) => h('option', { value: d.id, text: d.title })), h('option', { value: '__new', text: 'Neuer Stapel …' }));
        deckSel.value = decks.some((d) => d.id === last) ? last : decks.length ? decks[0].id : '__new';
        newBox.hidden = deckSel.value !== '__new';
      };
      subjSel.addEventListener('change', fill);
      deckSel.addEventListener('change', () => { newBox.hidden = deckSel.value !== '__new'; });
      await fill();
      let dupes = true;
      const dupBtn = h('button.vxtoggle', { 'aria-pressed': 'true', on: { click: () => { dupes = !dupes; dupBtn.setAttribute('aria-pressed', String(dupes)); } } }, icon('check'), 'Schon vorhandene überspringen');
      body.append(
        h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'vxSubj', text: 'Fach' }), subjSel), h('div', null, h('label.fieldlabel', { for: 'vxDeckSel', text: 'Stapel' }), deckSel)),
        newBox, dupBtn,
        h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
          h('button.btn.primary', { text: 'Speichern', on: { click: () => close({ subjectId: subjSel.value, deck: deckSel.value, name: newName.value.trim(), lang: langSel.value, dupes }) } })));
    });
    if (!res) return;
    let deckId = res.deck;
    if (deckId === '__new') {
      const [d] = await db.putItems('decks', [{ subjectId: res.subjectId, title: res.name || 'Vokabeln', lang: res.lang }]);
      deckId = d.id;
    }
    store.set('vxDeck', deckId);
    const norm = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();
    const have = res.dupes ? new Set((await db.listCards(deckId)).map((c) => norm(c.front))) : new Set();
    const fresh = chosen.filter((c) => !have.has(norm(c.front)));
    if (fresh.length) await db.putItems('cards', fresh.map((c) => ({ deckId, front: c.front, back: c.back, box: 0, due: 0, right: 0, wrong: 0, src: page.id })));
    const skipped = chosen.length - fresh.length;
    headMeta.textContent = 'Schritt 3 von 3 · Gespeichert';
    toast(`${plural(fresh.length, 'Karte', 'Karten')} gespeichert` + (skipped ? `, ${skipped} schon vorhanden` : '') + '.', 4000);
    close(deckId);
  }

  let closed = false;
  function close(deckId) {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    root.classList.add('out');
    setTimeout(() => { root.remove(); URL.revokeObjectURL(url); }, 180);
    if (onDone) onDone(deckId || null);
  }
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.dlgscrim')) close(); };
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => { z = fit(); setZoom(z); changed(); });
  // Kästen schon vorab zeigen (ohne Texterkennung)
  setTimeout(() => { try { boxes = page.vxBoxes || detectBoxes(img); drawLayer(); } catch (e) { boxes = []; } }, 50);
}
