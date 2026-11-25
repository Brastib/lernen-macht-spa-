// Schwebender Taschenrechner im Editor: liegt wie ein Werkzeug über dem Blatt.
// Verschieben am oberen Griff, Größe Klein/Groß, Einklappen, Ergebnis per Tipp aufs Blatt setzen.
// Das Blatt darunter bleibt bedienbar (der Rechner fängt nur Tipps auf sich selbst ab).
import { h, icon, toast, menu } from './ui.js';
import { calcWidget, de, toFrac } from './kit.js';
import { edInsertAt } from './editor.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } } };
const M = 10;   // Mindestabstand zum Rand
let box = null, api = null, placing = null, observer = null;
let st = store.get('fcalc', { size: 'big', min: false, rx: null, ry: null });

const ed = () => document.getElementById('editor');
const btn = () => document.getElementById('edCalc');

// Freier Bereich, in dem der Rechner liegen darf: unter der Werkzeugleiste, über der Schreib-Lupe
function area() {
  const e = ed().getBoundingClientRect();
  const bar = ed().querySelector('.edbar')?.getBoundingClientRect();
  const lupe = document.getElementById('edLupe');
  // offsetHeight statt Rechteck: die Lupe fährt beim Öffnen animiert ein (transform)
  const lh = lupe && !lupe.hidden ? lupe.offsetHeight : 0;
  return { l: e.left, t: (bar ? bar.bottom : e.top), r: e.right, b: e.bottom - lh, e };
}
function clamp(x, y) {
  const a = area(), w = box.offsetWidth, hh = box.offsetHeight;
  const maxX = a.r - w - M, maxY = a.b - hh - M;
  x = Math.max(a.l + M, Math.min(maxX, x));
  y = Math.max(a.t + M, Math.min(Math.max(a.t + M, maxY), y));
  return [x, y];
}
function place(x, y) {
  [x, y] = clamp(x, y);
  const e = area().e;
  box.style.left = (x - e.left) + 'px'; box.style.top = (y - e.top) + 'px';
}
function placeFromStore() {
  const a = area(), w = box.offsetWidth;
  // Standard: rechts oben unter der Leiste (da steht auf Arbeitsblättern selten etwas Wichtiges)
  let x = a.r - w - 16, y = a.t + 14;
  if (st.rx != null) { x = a.l + st.rx * (a.r - a.l); y = a.t + st.ry * (a.b - a.t); }
  place(x, y);
}
function remember() {
  const a = area(), r = box.getBoundingClientRect();
  st.rx = (r.left - a.l) / Math.max(1, a.r - a.l); st.ry = (r.top - a.t) / Math.max(1, a.b - a.t);
  store.set('fcalc', st);
}
// Passt der Rechner nicht in den freien Bereich (z. B. Schreib-Lupe offen, iPad quer),
// werden erst die wissenschaftlichen Tasten, dann alle Tasten weggelassen – nichts ragt über den Rand.
function fit() {
  const a = area(), avail = a.b - a.t - 2 * M;
  box.classList.remove('fitsmall', 'fitmin');
  if (box.offsetHeight > avail && !box.classList.contains('small')) box.classList.add('fitsmall');
  if (box.offsetHeight > avail) box.classList.add('fitmin');
}
function keepInside() { if (box && !box.hidden) { fit(); const r = box.getBoundingClientRect(); place(r.left, r.top); } }

function applySize() {
  box.classList.toggle('small', st.size === 'small');
  box.classList.toggle('min', !!st.min);
  const sz = box.querySelector('.fcsize'), mn = box.querySelector('.fcmin');
  sz.replaceChildren(icon(st.size === 'small' ? 'zoom-in' : 'zoom-out'));
  sz.title = st.size === 'small' ? 'Größer (mit sin, √, Klammern …)' : 'Kleiner (nur Grundrechnen)';
  sz.setAttribute('aria-label', sz.title);
  sz.hidden = !!st.min;
  mn.replaceChildren(icon('chev-down'));
  mn.title = st.min ? 'Tasten zeigen' : 'Einklappen (nur Anzeige)';
  mn.setAttribute('aria-label', mn.title);
}

function build() {
  box = h('div.fcalc', { role: 'dialog', 'aria-label': 'Taschenrechner' });
  const grip = h('div.fchead', null,
    h('span.fcgrip', { 'aria-hidden': 'true' }),
    h('span.fctitle', { text: 'Rechner' }),
    h('button.fcb.fcsize', { on: { click: () => { st.size = st.size === 'small' ? 'big' : 'small'; store.set('fcalc', st); applySize(); keepInside(); remember(); } } }),
    h('button.fcb.fcmin', { on: { click: () => { st.min = !st.min; store.set('fcalc', st); applySize(); keepInside(); } } }),
    h('button.fcb', { title: 'Rechner schließen', 'aria-label': 'Rechner schließen', on: { click: () => hideFloatCalc() } }, icon('close')));
  const body = h('div.fcbody');
  const put = h('button.fcput', { on: { click: (e) => onPut(e.currentTarget) } }, icon('text'), h('span', { text: 'Ergebnis aufs Blatt' }));
  const hint = h('div.fchint', null, h('span', { text: 'Jetzt aufs Blatt tippen' }), h('button.fcb.fccancel', { on: { click: () => stopPlacing() } }, 'Abbrechen'));
  box.append(grip, body, put, hint);
  api = calcWidget(body, { compact: true, focus: false });

  // Ziehen am Kopf (Finger oder Pencil)
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const r = box.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    grip.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
  });
  grip.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) place(e.clientX - drag.dx, e.clientY - drag.dy); });
  const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; box.classList.remove('dragging'); remember(); } };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  // Nichts vom Rechner ans Blatt durchreichen (kein Strich, kein Zoom)
  box.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  box.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  ed().append(box);
  applySize();
  window.addEventListener('resize', () => requestAnimationFrame(keepInside));
  // Schreib-Lupe auf/zu: Rechner bleibt im freien Bereich
  const lupe = document.getElementById('edLupe');
  if (lupe) { observer = new MutationObserver(() => requestAnimationFrame(keepInside)); observer.observe(lupe, { attributes: true, attributeFilter: ['hidden'] }); }
}

// ---------- Ergebnis aufs Blatt ----------
function texts() {
  const r = api && api.result();
  if (!r) return null;
  const a = de(r.a), fr = toFrac(r.a, 1000);
  const out = [];
  if (r.name) out.push({ label: `${r.name} = ${a}`, text: `${r.name} = ${a}` });
  else {
    out.push({ label: `Nur Ergebnis: ${a}`, text: a });
    if (r.q) out.push({ label: `Mit Rechnung: ${r.q} = ${a}`, text: `${r.q} = ${a}` });
    if (fr) { const f = `${fr.n < 0 ? '−' : ''}${Math.abs(fr.n)}/${fr.d}`; out.push({ label: `Als Bruch: ${f}`, text: f }); }
  }
  return out;
}
function onPut(anchor) {
  const opts = texts();
  if (!opts) { toast('Erst etwas ausrechnen'); return; }
  if (opts.length === 1) { startPlacing(opts[0].text); return; }
  menu(anchor, opts.map((o) => ({ label: o.label.length > 46 ? o.label.slice(0, 45) + '…' : o.label, onClick: () => startPlacing(o.text) })));
}
function startPlacing(text) {
  stopPlacing();
  const panes = document.getElementById('edPanes');
  const onDown = (e) => {
    const pn = e.target.closest && e.target.closest('.edpane');
    if (!pn || !e.target.closest('.edscroll')) return;   // z. B. Seitenkopf: normal weiter
    e.preventDefault(); e.stopPropagation();
    const ok = edInsertAt(text, e.clientX, e.clientY, +pn.dataset.pane || 0);
    stopPlacing();
    toast(ok ? 'Eingefügt. Mit dem Lasso verschiebbar, Rückgängig geht auch.' : 'Bitte direkt aufs Blatt tippen.', 2600);
  };
  panes.addEventListener('pointerdown', onDown, true);
  panes.classList.add('fcplacing');
  box.classList.add('placing');
  placing = () => { panes.removeEventListener('pointerdown', onDown, true); panes.classList.remove('fcplacing'); box.classList.remove('placing'); };
}
function stopPlacing() { if (placing) { const p = placing; placing = null; p(); } }

// ---------- Öffnen / Schließen ----------
export function toggleFloatCalc(forceOpen = false) {
  if (box && !box.hidden && !forceOpen) { hideFloatCalc(); return; }
  if (!box) build();
  box.hidden = false;
  fit();
  placeFromStore();
  btn()?.classList.add('on'); btn()?.setAttribute('aria-pressed', 'true');
  try { if (!localStorage.getItem('tipFcalc')) { localStorage.setItem('tipFcalc', '1'); toast('Der Rechner liegt jetzt auf dem Blatt. Oben am Griff verschieben, daneben weiterschreiben.', 4500); } } catch (e) { /* egal */ }
}
export function hideFloatCalc() {
  stopPlacing();
  if (box) box.hidden = true;
  btn()?.classList.remove('on'); btn()?.setAttribute('aria-pressed', 'false');
}
