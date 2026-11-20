// Buch-Leser: Seiten wie in einem Buch durchblättern.
// Quer (breiter Bildschirm): Doppelseite, erste Seite allein rechts wie ein Buchdeckel.
// Hoch: eine Seite.
import * as db from './db.js';
import { renderPage, blobToImage } from './paper.js';
import { $, h, icon, sheet, promptSheet, toast, menu } from './ui.js';

let pages = [], spreads = [], si = 0, selected = 0, title = '', onEdit = null, onMarks = null;
const urls = new Map();       // Seiten-ID -> Bild-URL (fertig zusammengesetzt)

export function invalidate(id) {
  const u = urls.get(id);
  if (u) { URL.revokeObjectURL(u); urls.delete(id); }
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
    const img = h('img', { alt: `Seite ${idx + 1}`, draggable: false });
    const el = h('button.rpage' + (sp.length === 2 && idx === selected ? '.sel' : ''), {
      'aria-label': `Seite ${idx + 1}`,
      on: { click: () => { selected = idx; box.querySelectorAll('.rpage').forEach((x) => x.classList.toggle('sel', x === el && sp.length === 2)); info(); } },
    }, img, h('span.pno', { text: String(idx + 1) }), p.mark ? h('span.ribbon', { title: p.mark }) : null);
    next.append(el);
    pageUrl(p).then((u) => { img.src = u; }).catch(() => {});
  }
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
$('viewEdit').addEventListener('click', () => { if (onEdit) onEdit(pages[selected], selected); });
$('readScrub').addEventListener('input', (e) => { const n = +e.target.value; const d = n - si; si = n; selected = spreads[si].find((x) => x != null); show(Math.sign(d)); });
document.addEventListener('keydown', (e) => {
  if ($('viewer').hidden || !$('editor').hidden) return;
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'Escape') closeReader();
});

// Wischen zum Blättern
let sw = null;
$('readStage').addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
$('readStage').addEventListener('pointerup', (e) => {
  if (!sw || sw.id !== e.pointerId) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
});
$('readStage').addEventListener('pointercancel', () => { sw = null; });

window.addEventListener('resize', () => {
  if ($('viewer').hidden) return;
  const keep = selected;
  buildSpreads();
  si = spreadOf(keep);
  show(0);
});
