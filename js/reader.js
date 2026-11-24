// Buch-Leser: Seiten wie in einem Buch durchblättern.
// Quer (breiter Bildschirm): Doppelseite, erste Seite allein rechts wie ein Buchdeckel.
// Hoch: eine Seite.
import * as db from './db.js';
import { renderPage, blobToImage } from './paper.js';
import { $, h, icon, sheet, promptSheet, toast, menu, busy, zoomBar } from './ui.js';

let pages = [], spreads = [], si = 0, selected = 0, title = '', onEdit = null, onMarks = null;
const urls = new Map();       // Seiten-ID -> Bild-URL (fertig zusammengesetzt)
const hiUrls = new Map();     // schärfere Fassung für starkes Heranzoomen

export function invalidate(id) {
  const u = urls.get(id);
  if (u) { URL.revokeObjectURL(u); urls.delete(id); }
  const hu = hiUrls.get(id);
  if (hu) { URL.revokeObjectURL(hu); hiUrls.delete(id); }
}

async function pageUrl(p) {
  if (urls.has(p.id)) return urls.get(p.id);
  let blob = p.kind === 'blank' ? null : await db.getImage(p.id);
  if (p.kind === 'blank' || p.strokes) {
    const strokes = await db.getInk(p.id);
    const bg = blob ? await blobToImage(blob) : null;
    blob = await new Promise((r) => renderPage(p, bg, strokes, 1400).toBlob(r, 'image/jpeg', 0.86));
  }
  const u = URL.createObjectURL(blob);
  urls.set(p.id, u);
  return u;
}

const wide = () => window.innerWidth > window.innerHeight && window.innerWidth >= 900;

function buildSpreads() {
  spreads = [];
  if (wide() && pages.length > 1) {
    spreads.push([null, 0]);
    for (let i = 1; i < pages.length; i += 2) spreads.push(i + 1 < pages.length ? [i, i + 1] : [i, null]);
  } else {
    for (let i = 0; i < pages.length; i++) spreads.push([i]);
  }
}
const spreadOf = (idx) => Math.max(0, spreads.findIndex((s) => s.includes(idx)));

export async function openReader(list, start, opts = {}) {
  pages = list; title = opts.title || ''; onEdit = opts.onEdit; onMarks = opts.onMarks || null;
  if (!pages.length) return;
  selected = Math.max(0, Math.min(pages.length - 1, start || 0));
  buildSpreads();
  si = spreadOf(selected);
  $('viewer').hidden = false;
  await show(0);
}

export function closeReader() { $('viewer').hidden = true; }
export const readerOpen = () => !$('viewer').hidden;
export const readerState = () => (readerOpen() ? { pages, current: pages[selected] || null, title } : null);
export function readerPages(list) { pages = list; buildSpreads(); si = Math.min(si, spreads.length - 1); show(0); }

async function show(dir) {
  const sp = spreads[si];
  if (!sp) return;
  if (!sp.includes(selected)) selected = sp.find((x) => x != null);
  const box = $('spread');
  const next = h('div.spreadin' + (sp.length === 2 ? '.two' : ''));
  for (const idx of sp) {
    if (idx == null) { next.append(h('div.rpage.empty')); continue; }
    const p = pages[idx];
    const img = h('img', { alt: `Seite ${idx + 1}`, draggable: false, 'data-idx': String(idx) });
    const el = h('button.rpage' + (sp.length === 2 && idx === selected ? '.sel' : ''), {
      'aria-label': `Seite ${idx + 1}`,
      on: { click: () => { selected = idx; box.querySelectorAll('.rpage').forEach((x) => x.classList.toggle('sel', x === el && sp.length === 2)); info(); } },
    }, img, h('span.pno', { text: String(idx + 1) }), p.mark ? h('span.ribbon', { title: p.mark }) : null);
    next.append(el);
    pageUrl(p).then((u) => { img.src = u; }).catch(() => {});
  }
  resetZoom(false);
  const old = box.firstElementChild;
  if (dir && old && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    next.classList.add(dir > 0 ? 'in-next' : 'in-prev');
    old.classList.add(dir > 0 ? 'out-next' : 'out-prev');
    box.append(next);
    setTimeout(() => old.remove(), 260);
  } else {
    box.textContent = '';
    box.append(next);
  }
  $('readScrub').max = String(Math.max(0, spreads.length - 1));
  $('readScrub').value = String(si);
  $('viewPrev').disabled = si === 0;
  $('viewNext').disabled = si >= spreads.length - 1;
  info();
  // Nachbarn vorladen, damit Blättern sofort geht
  for (const s of [spreads[si + 1], spreads[si - 1]]) if (s) for (const idx of s) if (idx != null) pageUrl(pages[idx]).catch(() => {});
}

function info() {
  const sp = spreads[si].filter((x) => x != null).map((x) => x + 1);
  $('viewInfo').textContent = title;
  $('readPage').textContent = `${sp.length === 2 ? `Seiten ${sp[0]}–${sp[1]}` : `Seite ${sp[0]}`} von ${pages.length}`;
  const p = pages[selected];
  $('viewMark').classList.toggle('on', !!(p && p.mark));
  $('viewMark').title = p && p.mark ? `Lesezeichen: ${p.mark}` : 'Lesezeichen setzen';
  $('viewToc').disabled = !pages.some((x) => x.mark);
  if (p && p.mark) $('viewInfo').textContent = `${title} · ${p.mark}`;
}

// Zu einer Seite springen (für das Inhaltsverzeichnis)
export function gotoPage(idx) {
  const n = spreadOf(idx);
  const d = Math.sign(n - si);
  si = n; selected = idx;
  show(d);
}

// Inhaltsverzeichnis: alle Seiten mit Lesezeichen. Gibt den gewählten Index zurück.
export function tocSheet(list, bookTitle) {
  return sheet('Inhaltsverzeichnis', (body, close) => {
    const marks = list.map((p, i) => ({ p, i })).filter((x) => x.p.mark);
    const l = h('div.targets.toc');
    for (const { p, i } of marks) {
      l.append(h('button.target', { on: { click: () => close(i) } }, icon('bookmark'), h('span', { text: p.mark }), h('small', { text: `S. ${i + 1}` })));
    }
    if (!marks.length) l.append(h('p.targetnone', { text: 'Noch keine Lesezeichen. Im Lesemodus setzt du sie oben mit dem Lesezeichen-Knopf.' }));
    body.append(h('p.dlgtext', { text: bookTitle }), l);
  });
}

async function toggleMark() {
  const p = pages[selected];
  if (!p) return;
  const name = await promptSheet(p.mark ? 'Lesezeichen ändern' : 'Lesezeichen setzen', {
    label: `Name für Seite ${selected + 1} (z. B. Kapitel)`, value: p.mark || '', placeholder: 'z. B. Kapitel 3 – Brüche', ok: 'Setzen',
  });
  if (name == null) return;
  p.mark = name;
  await db.updatePage(p.id, { mark: name });
  toast('Lesezeichen gesetzt');
  show(0);
  if (onMarks) onMarks();
}

function go(d) {
  const n = Math.max(0, Math.min(spreads.length - 1, si + d));
  if (n === si) return;
  si = n;
  selected = spreads[si].find((x) => x != null);
  show(d);
}

$('viewPrev').addEventListener('click', () => go(-1));
$('viewNext').addEventListener('click', () => go(1));
$('viewClose').addEventListener('click', closeReader);
$('viewMark').addEventListener('click', (e) => {
  const p = pages[selected];
  if (p && p.mark) {
    menu(e.currentTarget, [
      { label: 'Umbenennen', icon: 'edit', onClick: toggleMark },
      { label: 'Lesezeichen entfernen', icon: 'trash', danger: true, onClick: async () => {
        delete p.mark; await db.updatePage(p.id, { mark: null }); toast('Lesezeichen entfernt'); show(0); if (onMarks) onMarks();
      } },
    ]);
  } else toggleMark();
});
$('viewToc').addEventListener('click', async () => {
  const i = await tocSheet(pages, title);
  if (i != null) gotoPage(i);
});
$('viewSpeak').addEventListener('click', async () => {
  const p = pages[selected]; if (!p) return;
  let ocr = p.ocr;
  if (p.kind !== 'blank' && ocr == null) {
    busy(true, 'Text auf der Seite wird erkannt …');
    try { const { ocrPages } = await import('./ocr.js'); await ocrPages([p], (t) => { const b = $('busyText'); if (b) b.textContent = t; }); ocr = p.ocr; }
    catch (err) { toast('Texterkennung fehlgeschlagen: ' + err.message, 4000); }
    busy(false);
  }
  const { readAloud } = await import('./speech.js');
  readAloud([ocr, p.textBoxes].filter(Boolean).join('\n\n'), { title: `Seite ${selected + 1} vorlesen`, emptyHint: 'Auf dieser Seite wurde kein gedruckter Text gefunden. Handschrift kann die App nicht vorlesen.' });
});
$('viewEdit').addEventListener('click', () => { if (onEdit) onEdit(pages[selected], selected); });
$('readScrub').addEventListener('input', (e) => { const n = +e.target.value; const d = n - si; si = n; selected = spreads[si].find((x) => x != null); show(Math.sign(d)); });
document.addEventListener('keydown', (e) => {
  if ($('viewer').hidden || !$('editor').hidden) return;
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'Escape') { if (z.s > 1.001) resetZoom(true); else closeReader(); }
  else if (e.key === '+' || e.key === '=') { const b = box(); zoomAt(b.l + b.w / 2, b.t + b.h / 2, Math.min(MAXZ, z.s * 1.5), true); }
  else if (e.key === '-') { const b = box(); if (z.s / 1.5 < 1.05) resetZoom(true); else zoomAt(b.l + b.w / 2, b.t + b.h / 2, z.s / 1.5, true); }
  else if (e.key === '0') resetZoom(true);
});

// ---------- Heranzoomen und Wischen ----------
// Zwei Finger: zoomen. Gezoomt: mit einem Finger oder dem Stift verschieben. Doppeltipp: Zoom an/aus.
// Nicht gezoomt: waagerecht wischen blättert.
const stage = $('readStage');
const MAXZ = 5;
let z = { s: 1, x: 0, y: 0 };
const pts = new Map();
let pinch = null, pan = null, sw = null, lastTap = null, hiTimer = 0;
const curEl = () => $('spread').lastElementChild;
const box = () => { const r = $('spread').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height - 26 }; };
// Zoom-Leiste unten rechts: −, Prozent (Feinregler), +, ganze Seite
const centerZoom = (s, anim = true) => {
  const b = box();
  s = Math.max(1, Math.min(MAXZ, s));
  if (s < 1.02) resetZoom(anim); else zoomAt(b.l + b.w / 2, b.t + b.h / 2, s, anim);
};
const zbar = zoomBar({
  min: 1, max: MAXZ,
  get: () => z.s,
  set: (s, live) => centerZoom(s, !live),
  presets: [[1, 'Ganze Seite'], [1.5, '150 %'], [2, '200 %'], [3, '300 %'], [4, '400 %']],
  extras: [{ key: 'page', icon: 'fitpage', label: 'Ganze Seite', title: 'Ganze Seite zeigen', act: () => resetZoom(true) }],
});
zbar.el.classList.add('rdzbar');
stage.append(zbar.el);

function clampZ() {
  const b = box();
  z.s = Math.max(1, Math.min(MAXZ, z.s));
  z.x = Math.min(0, Math.max(b.w - b.w * z.s, z.x));
  z.y = Math.min(0, Math.max(b.h - b.h * z.s, z.y));
}
function applyZ(anim) {
  const el = curEl(); if (!el) return;
  const on = z.s > 1.001;
  el.style.transformOrigin = '0 0';
  el.style.transition = anim ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
  el.style.transform = on ? `translate3d(${z.x}px, ${z.y}px, 0) scale(${z.s})` : '';
  stage.classList.toggle('zoomed', on);
  zbar.update(z.s);
}
function resetZoom(anim) { z = { s: 1, x: 0, y: 0 }; pinch = null; pan = null; applyZ(anim); }
// Punkt (Bildschirm) bleibt beim Zoomen an seiner Stelle
function zoomAt(cx, cy, s, anim) {
  const b = box(), px = cx - b.l, py = cy - b.t;
  const k = s / z.s;
  z.x = px - (px - z.x) * k; z.y = py - (py - z.y) * k; z.s = s;
  clampZ(); applyZ(anim); sharpenSoon();
}

// Bei starkem Zoom eine schärfere Fassung der Seite laden
async function hiUrl(p) {
  if (hiUrls.has(p.id)) return hiUrls.get(p.id);
  const blob0 = p.kind === 'blank' ? null : await db.getImage(p.id);
  if (p.kind !== 'blank' && !p.strokes) return null;   // reiner Scan: das Original ist schon in voller Auflösung da
  const strokes = await db.getInk(p.id);
  const bg = blob0 ? await blobToImage(blob0) : null;
  const w = Math.min(3000, Math.max(1400, bg ? bg.naturalWidth : 2800));
  const blob = await new Promise((r) => renderPage(p, bg, strokes, w).toBlob(r, 'image/jpeg', 0.9));
  const u = URL.createObjectURL(blob);
  hiUrls.set(p.id, u);
  return u;
}
function sharpenSoon() {
  clearTimeout(hiTimer);
  if (z.s < 1.6) return;
  hiTimer = setTimeout(() => {
    const el = curEl(); if (!el) return;
    el.querySelectorAll('img[data-idx]').forEach((img) => {
      if (img.dataset.hi) return;
      const p = pages[+img.dataset.idx]; if (!p) return;
      img.dataset.hi = '1';
      hiUrl(p).then((u) => { if (u) img.src = u; }).catch(() => {});
    });
  }, 250);
}

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.nav, .zbar')) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: z.s, x: z.x, y: z.y };
    sw = null; pan = null; lastTap = null;
  } else if (pts.size === 1) {
    sw = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
    pan = z.s > 1.001 ? { x: e.clientX, y: e.clientY, zx: z.x, zy: z.y, id: e.pointerId } : null;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size >= 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const bx = box();
    const s = Math.max(0.85, Math.min(MAXZ, pinch.s * d / pinch.d));
    // Inhalts-Punkt unter der Anfangs-Mitte folgt der aktuellen Mitte
    const cx = (pinch.mx - bx.l - pinch.x) / pinch.s, cy = (pinch.my - bx.t - pinch.y) / pinch.s;
    z = { s, x: mx - bx.l - cx * s, y: my - bx.t - cy * s };
    if (s >= 1) clampZ();
    applyZ(false);
  } else if (pan && e.pointerId === pan.id) {
    z.x = pan.zx + (e.clientX - pan.x); z.y = pan.zy + (e.clientY - pan.y);
    clampZ(); applyZ(false);
  }
});
function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) {
      pinch = null;
      if (z.s < 1.08) resetZoom(true); else { clampZ(); applyZ(true); sharpenSoon(); }
      // weiterer Finger auf dem Bildschirm verschiebt jetzt
      const rest = [...pts.entries()][0];
      pan = rest && z.s > 1.001 ? { x: rest[1].x, y: rest[1].y, zx: z.x, zy: z.y, id: rest[0] } : null;
    }
    return;
  }
  if (pan && pan.id === e.pointerId) pan = null;
  if (!sw || sw.id !== e.pointerId) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y, tapT = performance.now() - sw.t;
  sw = null;
  // Doppeltipp
  if (Math.hypot(dx, dy) < 10 && tapT < 300 && e.type === 'pointerup') {
    const now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
      lastTap = null;
      if (z.s > 1.001) resetZoom(true); else zoomAt(e.clientX, e.clientY, 2.5, true);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    // Seite antippen wählt sie (iPad: der normale Klick fällt weg, weil das Gedrückthalten abgefangen wird)
    const rp = e.target.closest && e.target.closest('.rpage');
    if (rp && e.pointerType === 'touch') rp.click();
    return;
  }
  if (z.s <= 1.001 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
// Trackpad / Mausrad: Strg + Rad (oder Zwei-Finger-Pinch am Trackpad) zoomt, sonst verschieben, wenn gezoomt
stage.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.max(1, Math.min(MAXZ, z.s * Math.exp(-e.deltaY * 0.01))), false);
    if (z.s < 1.02) resetZoom(false);
  } else if (z.s > 1.001) {
    e.preventDefault();
    z.x -= e.deltaX; z.y -= e.deltaY; clampZ(); applyZ(false);
  }
}, { passive: false });
// iPad: Gedrückthalten auf der Seite soll keine Lupe/Auswahl öffnen (Knöpfe bleiben normal antippbar)
stage.addEventListener('touchstart', (e) => {
  if (e.target.closest('button:not(.rpage), a, input, textarea, select, .zbar, .nav')) return;
  e.preventDefault();
}, { passive: false });
// Safari: eigene Seiten-Zoom-Geste im Leser abfangen
for (const ev of ['gesturestart', 'gesturechange']) stage.addEventListener(ev, (e) => e.preventDefault());

window.addEventListener('resize', () => {
  if ($('viewer').hidden) return;
  const keep = selected;
  buildSpreads();
  si = spreadOf(keep);
  show(0);
});
