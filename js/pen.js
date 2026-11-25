// Gemeinsame Pencil-Hilfen für alle Malflächen (Skins, Strichkampf, Malspiele, Präsi-Skizzen, Meine Schrift).
// - Handballen ignorieren: Sobald einmal der Pencil benutzt wurde, malen Finger auf Malflächen nicht mehr.
// - Alle Zwischenpunkte des Pencils (getCoalescedEvents, auf dem iPad bis 240 pro Sekunde).
// - Weiche Linien durch die Mittelpunkte (ohne Verzögerung: der letzte Punkt wird direkt angefahren).
// - Druck des Pencils als Strichbreite.

let penSeen = false;
try { penSeen = sessionStorage.getItem('penSeen') === '1'; } catch (e) { /* egal */ }
// Überall in der App mithören: Pencil benutzt → ab jetzt sind Finger auf Malflächen nur noch Handballen
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen' && !penSeen) { penSeen = true; try { sessionStorage.setItem('penSeen', '1'); } catch (er) { /* egal */ } }
}, { capture: true, passive: true });

export const usesPencil = () => penSeen;

// true = dieser Kontakt soll NICHT malen (Handballen oder großer Fingerabdruck, während es einen Pencil gibt)
export function isPalm(e) {
  if (e.pointerType !== 'touch') return false;
  if (penSeen) return true;
  return (e.width || 0) > 40 || (e.height || 0) > 40;
}

// Alle Punkte eines pointermove (auch die zwischen zwei Bildschirm-Bildern)
export function pointsOf(e) {
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  return evs && evs.length ? evs : [e];
}

// Druck 0..1 (Maus/Finger: 0.5)
export const pressureOf = (e) => (e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5);

// Malfläche anbinden. handlers: { down(e) → true/false (malt?), move(ev) pro Punkt, up(e) }
// Nur ein Strich gleichzeitig; zweiter Kontakt (Handballen, zweiter Finger) wird ignoriert.
export function attachPen(el, { down, move, up, allowTouch = null }) {
  let id = null;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    if (id != null) return;
    const touchOk = allowTouch ? allowTouch() : false;
    if (isPalm(e) && !touchOk) return;
    if (e.button > 0) return;
    e.preventDefault();
    if (down(e) === false) return;
    id = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    for (const ev of pointsOf(e)) move(ev);
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; if (up) up(e); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // iOS: kein Lupen-/Scroll-Verhalten beim Malen
  el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  return { busy: () => id != null };
}

// Weicher Pfad durch Punkte. pts: Array von [x, y, ...]. Zeichnet nur, stroke() macht der Aufrufer.
export function smoothPath(ctx, pts, fx = (p) => p[0], fy = (p) => p[1]) {
  ctx.beginPath();
  if (!pts.length) return;
  ctx.moveTo(fx(pts[0]), fy(pts[0]));
  if (pts.length === 1) { ctx.lineTo(fx(pts[0]) + 0.01, fy(pts[0])); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    ctx.quadraticCurveTo(fx(a), fy(a), (fx(a) + fx(b)) / 2, (fy(a) + fy(b)) / 2);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(fx(l), fy(l));
}

// Weicher Strich mit wechselnder Breite (Druck). w(p) = Breite am Punkt.
// from: ab welchem Punkt (für schnelles Weiterzeichnen nur neuer Stücke).
export function smoothVar(ctx, pts, w, fx = (p) => p[0], fy = (p) => p[1], from = 1) {
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(fx(pts[0]), fy(pts[0]), w(pts[0]) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  for (let i = Math.max(1, from); i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const lx = i >= 2 ? (fx(pts[i - 2]) + fx(p)) / 2 : fx(p), ly = i >= 2 ? (fy(pts[i - 2]) + fy(p)) / 2 : fy(p);
    const mx = (fx(p) + fx(q)) / 2, my = (fy(p) + fy(q)) / 2;
    ctx.lineWidth = (w(p) + w(q)) / 2;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(fx(p), fy(p), mx, my);
    if (i === pts.length - 1) ctx.lineTo(fx(q), fy(q));
    ctx.stroke();
  }
}

// Leinwand scharf halten: interne Auflösung = angezeigte Größe × Bildschirm-Dichte.
// onSize(k) wird nach jeder Größenänderung aufgerufen (k = Geräte-Pixel pro CSS-Pixel).
export function keepSharp(cv, onSize, maxDpr = 3) {
  const fit = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = Math.min(maxDpr, window.devicePixelRatio || 1);
    const w = Math.round(r.width * d), hh = Math.round(r.height * d);
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    onSize(d);
  };
  const ro = new ResizeObserver(fit); ro.observe(cv);
  return { stop: () => ro.disconnect(), fit };
}
