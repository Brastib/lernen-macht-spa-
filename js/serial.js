// Serien-Scan: Kamera bleibt offen. Man blättert nur um, die App merkt selbst, wenn eine neue
// Seite ruhig liegt, und löst aus. Doppelseiten werden an der Buchmitte geteilt und die Wölbung
// zur Mitte hin geglättet. Gespeichert wird nebenbei, ohne Fotos-Galerie.
import * as db from './db.js';
import { h, icon, toast, kb, sheet } from './ui.js';
import { detectPage, warp, processScan, compress, makeThumb, deskew } from './scanner.js';

const AW = 160;                 // Breite der kleinen Analyse-Kopie
const SHARP_W = 480;            // Breite für den Schärfe-Test (Bildmitte)
const TICK = 90;                // ms zwischen zwei Analysen
const STILL = 2.4;              // Bewegung darunter = ruhig (mittlere Helligkeits-Änderung 0–255)
const MOVE = 7;                 // Bewegung darüber = es passiert etwas (Hand, Umblättern)
const NEW_PAGE = 1.6;           // mind. so verschieden muss die neue Seite von der letzten Aufnahme sein (wächst mit dem Bildrauschen)
const MAX_PENDING = 4;          // mehr unverarbeitete Aufnahmen: kurz warten (Speicher)
const TEMPO = { fast: 450, normal: 750, calm: 1200 };

let S = null;                   // laufende Sitzung
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } };

// ---------- Ziel wählen (aus der Bibliothek) ----------
export async function pickBookAndStart(onDone) {
  const books = (await db.listAllBooks()).filter((b) => b.kind !== 'notebook');
  const subjects = await db.listSubjects();
  const sname = (id) => subjects.find((s) => s.id === id)?.name || '';
  const id = await sheet('Serien-Scan · in welches Buch?', (body, close) => {
    body.append(h('p.muted', { text: 'Alle Seiten der Serie landen in diesem Buch.' }));
    const list = h('div.serpick');
    list.append(h('button.serpickrow', { on: { click: () => close(db.INBOX_BOOK) } }, icon('inbox'), h('span', { text: 'Noch nicht einsortiert' })));
    books.sort((a, b) => (sname(a.subjectId) + a.title).localeCompare(sname(b.subjectId) + b.title, 'de'))
      .forEach((b) => list.append(h('button.serpickrow', { on: { click: () => close(b.id) } }, icon('book'),
        h('span', { text: b.title }), h('small', { text: sname(b.subjectId) }))));
    body.append(list);
  });
  if (id) startSerialScan(id, { onDone });
}

// ---------- Start ----------
export async function startSerialScan(bookId, { onDone } = {}) {
  if (S) return;
  if (!navigator.mediaDevices?.getUserMedia) { toast('Kamera hier nicht verfügbar.', 3500); return; }
  const book = bookId === db.INBOX_BOOK ? { title: 'Noch nicht einsortiert' } : await db.getBook(bookId);
  S = {
    bookId, onDone, stream: null, track: null, timer: 0, stopped: false,
    auto: lsGet('serAuto', '1') === '1',
    split: lsGet('serSplit', '1') === '1',
    mode: lsGet('scanMode', 'color') === 'gray' ? 'gray' : 'color',
    tempo: lsGet('serTempo', 'normal'),
    sound: lsGet('serSound', '1') === '1',
    flat: lsGet('serFlat', '1') === '1',
    bright: lsGet('serBright', 'auto'),   // auto | dark | darker | off
    ev: 0, evCaps: null, lastEv: 0, clip: 0, warnedBright: false,
    prev: null, ref: null, armed: true, moved: true,
    stillSince: 0, best: null, bestSharp: 0, sharpHist: [],
    quad: null, quadFound: false, lastDetect: 0,
    items: [], pages: 0, chain: Promise.resolve(), pending: 0,
  };
  buildUI(book?.title || 'Buch');
  await openCamera();
}

// ---------- Oberfläche ----------
function buildUI(title) {
  const U = S.ui = {};
  const seg = (items, cur, onPick) => {
    const box = h('div.seg', { role: 'group' });
    items.forEach(([val, label]) => {
      const b = h('button', { text: label, on: { click: () => { box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(val); } } });
      if (val === cur) b.classList.add('on');
      box.append(b);
    });
    return box;
  };
  U.hint = h('span.hint', { text: 'Kamera startet …' });
  U.count = h('span.sercount', { text: '0 Seiten' });
  U.light = h('button.icbtn', { 'aria-label': 'Licht', title: 'Licht', hidden: true, on: { click: toggleTorch } }, icon('bolt'));
  U.more = h('button.icbtn', { 'aria-label': 'Einstellungen', title: 'Einstellungen', on: { click: settingsSheet } }, icon('sliders'));
  U.video = h('video', { playsinline: true, muted: true, autoplay: true });
  U.video.setAttribute('playsinline', ''); U.video.muted = true;
  U.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  U.svg.setAttribute('class', 'serov');
  U.flash = h('div.serflash');
  U.ring = h('div.serring', null, h('div.serringfill'));
  U.status = h('div.serstatus', null, U.ring, h('span', { text: '' }));
  U.thumb = h('button.serthumb', { 'aria-label': 'Letzte Seite', title: 'Letzte Seite' });
  U.undo = h('button.btn.ghost', { disabled: true, on: { click: undoLast } }, icon('undo'), h('span', { text: 'Letzte weg' }));
  U.shutter = h('button.sershutter', { 'aria-label': 'Jetzt aufnehmen', title: 'Jetzt aufnehmen', on: { click: () => capture(true) } }, h('span'));
  U.done = h('button.btn.light.serdone', { text: 'Fertig', on: { click: finish } });

  U.root = h('section.screen.dark', { id: 'serial' },
    h('div.bar', null,
      U.done,
      h('span.sertitle', null, h('b', { text: 'Serien-Scan' }), h('small', { text: 'in: ' + title })),
      U.hint, U.count, U.light, U.more),
    h('div.stage.serstage', null, U.video, U.svg, U.flash, U.status),
    h('div.bar.bottom.serbar', null,
      seg([['1', 'Automatisch'], ['0', 'Von Hand']], S.auto ? '1' : '0', (v) => { S.auto = v === '1'; lsSet('serAuto', v); resetStill(); hint(); }),
      seg([['1', '2 Seiten'], ['0', '1 Seite']], S.split ? '1' : '0', (v) => { S.split = v === '1'; lsSet('serSplit', v); }),
      seg([['color', 'Farbe'], ['gray', 'Text']], S.mode, (v) => { S.mode = v; lsSet('scanMode', v); }),
      h('span.spacer'), U.undo, U.thumb, U.shutter));
  document.body.append(U.root);
  document.body.classList.add('serialon');
  window.addEventListener('resize', drawQuad);
  document.addEventListener('visibilitychange', onVis);
}

function hint(text) {
  if (!S) return;
  if (text == null) text = S.auto ? 'Buch hinlegen und iPad ruhig drüber halten' : 'Auslöser tippen, wenn die Seite liegt';
  S.ui.hint.textContent = text;
}
function setCount() {
  S.ui.count.textContent = S.pages === 1 ? '1 Seite' : `${S.pages} Seiten`;
  S.ui.undo.disabled = !S.items.some((it) => !it.gone);
}

function settingsSheet() {
  sheet('Serien-Scan', (body) => {
    const row = (label, el) => h('div.serset', null, h('span', { text: label }), el);
    const seg = (items, cur, onPick) => {
      const box = h('div.seg');
      items.forEach(([val, label]) => {
        const b = h('button', { text: label, on: { click: () => { box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(val); } } });
        if (val === cur) b.classList.add('on');
        box.append(b);
      });
      return box;
    };
    body.append(
      row('Tempo (wie lange ruhig vor dem Auslösen)', seg([['fast', 'Schnell'], ['normal', 'Normal'], ['calm', 'Sorgfältig']], S.tempo, (v) => { S.tempo = v; lsSet('serTempo', v); })),
      row('Wölbung zur Buchmitte glätten', seg([['1', 'An'], ['0', 'Aus']], S.flat ? '1' : '0', (v) => { S.flat = v === '1'; lsSet('serFlat', v); })),
      row('Helligkeit der Seiten', seg([['auto', 'Automatisch'], ['dark', 'Dunkler'], ['darker', 'Viel dunkler'], ['off', 'Nicht ändern']], S.bright, (v) => { S.bright = v; lsSet('serBright', v); })),
      h('p.muted', { text: S.evCaps ? 'Die Kamera-Belichtung wird automatisch heruntergeregelt, wenn die Seite zu hell ist.' : 'Diese Kamera lässt die Belichtung nicht einstellen. Zu helle Seiten werden danach dunkler gerechnet. Hilft auch: kein direktes Licht von oben, iPad etwas höher halten.' }),
      row('Klick-Ton beim Aufnehmen', seg([['1', 'An'], ['0', 'Aus']], S.sound ? '1' : '0', (v) => { S.sound = v === '1'; lsSet('serSound', v); })),
      h('p.muted', { text: 'Tipp: Buch auf einen dunklen Tisch legen, gutes Licht, iPad flach drüber. Die ganze Doppelseite soll ins Bild passen.' }));
  });
}

// ---------- Kamera ----------
async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
    if (!S || S.stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    S.stream = stream; S.track = stream.getVideoTracks()[0];
    S.ui.video.srcObject = stream;
    await S.ui.video.play().catch(() => {});
    const caps = S.track.getCapabilities?.() || {};
    if (caps.torch) S.ui.light.hidden = false;
    if (caps.exposureCompensation && caps.exposureCompensation.max > caps.exposureCompensation.min) {
      S.evCaps = caps.exposureCompensation;
      S.ev = 0;
      if (caps.exposureMode?.includes?.('continuous')) S.track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] }).catch(() => {});
    }
    if (caps.focusMode?.includes?.('continuous')) S.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    resetStill(); hint();
    loop();
  } catch (err) {
    console.error(err);
    hint('Kamera nicht erlaubt');
    toast('Kamera geht nicht: ' + (err.name === 'NotAllowedError' ? 'bitte Kamera für die App erlauben (Einstellungen › Safari › Kamera).' : err.message), 6000);
  }
}
let torchOn = false;
function toggleTorch() {
  if (!S?.track) return;
  torchOn = !torchOn;
  S.track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {});
  S.ui.light.classList.toggle('on', torchOn);
}
function onVis() {
  if (!S) return;
  if (document.hidden) { clearTimeout(S.timer); return; }
  if (!S.track || S.track.readyState === 'ended') openCamera(); else loop();
}

// ---------- Analyse ----------
const acv = document.createElement('canvas');
const actx = acv.getContext('2d', { willReadFrequently: true });
const scv = document.createElement('canvas');
const sctx = scv.getContext('2d', { willReadFrequently: true });

function grabSmall(v) {
  const vw = v.videoWidth, vh = v.videoHeight;
  const ah = Math.max(1, Math.round(AW * vh / vw));
  if (acv.width !== AW || acv.height !== ah) { acv.width = AW; acv.height = ah; }
  actx.drawImage(v, 0, 0, AW, ah);
  const d = actx.getImageData(0, 0, AW, ah).data;
  const g = new Uint8Array(AW * ah);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  return g;
}
function diff(a, b) {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
// Schärfe: Varianz des Laplace-Filters in der Bildmitte
function sharpness(v) {
  const vw = v.videoWidth, vh = v.videoHeight;
  const cw = vw * 0.6, ch = vh * 0.6, sh = Math.round(SHARP_W * ch / cw);
  if (scv.width !== SHARP_W || scv.height !== sh) { scv.width = SHARP_W; scv.height = sh; }
  sctx.drawImage(v, vw * 0.2, vh * 0.2, cw, ch, 0, 0, SHARP_W, sh);
  const d = sctx.getImageData(0, 0, SHARP_W, sh).data, w = SHARP_W;
  const g = new Float32Array(w * sh);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < sh - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; n++;
  }
  const m = s / n;
  return s2 / n - m * m;
}
function resetStill() { if (!S) return; S.stillSince = 0; S.best = null; S.bestSharp = 0; setRing(0); }

function loop() {
  clearTimeout(S.timer);
  S.timer = setTimeout(() => { try { tick(); } catch (e) { console.error(e); } if (S && !S.stopped && !document.hidden) loop(); }, TICK);
}

function tick() {
  const v = S.ui.video;
  if (!v.videoWidth || v.readyState < 2) return;
  const now = performance.now();
  const g = grabSmall(v);
  const motion = diff(g, S.prev);
  S.prev = g;
  S.lastMotion = motion;

  // Seitenrand für die Anzeige (ca. 3× pro Sekunde)
  if (now - S.lastDetect > 320) {
    S.lastDetect = now;
    const r = detectPage(acv);
    S.quad = r.corners.map(([x, y]) => [x / acv.width, y / acv.height]);
    S.quadFound = r.found;
    exposureCheck(g, now);
    drawQuad();
  }
  if (!S.auto) return;

  if (motion > MOVE) { S.moved = true; resetStill(); hint(S.armed ? 'Seite hinlegen …' : 'Umblättern …'); return; }
  if (motion > STILL) { resetStill(); return; }
  // Bildrauschen der ruhigen Kamera mitlernen (für die Seitenwechsel-Schwelle)
  S.noise = S.noise == null ? motion : S.noise * 0.95 + motion * 0.05;

  // ruhig
  if (!S.armed) {
    // Erst wieder auslösen, wenn sich etwas bewegt hat UND das Bild jetzt anders ist als die letzte Aufnahme
    S.lastNew = diff(g, S.ref);
    if (S.moved && S.lastNew > Math.max(NEW_PAGE, 3 * (S.noise || 0))) S.armed = true;
    else { if (S.items.length) hint('Aufgenommen ✓ · jetzt umblättern'); return; }
  }
  if (S.pending >= MAX_PENDING) { hint('Moment, speichere …'); resetStill(); return; }
  if (!S.stillSince) S.stillSince = now;

  // bestes (schärfstes) Bild in der Ruhe-Phase merken
  const sh = sharpness(v);
  if (!S.best || sh >= S.bestSharp) { S.bestSharp = sh; S.best = fullFrame(v, S.best); S.bestGray = g; }
  const need = TEMPO[S.tempo] || TEMPO.normal;
  const t = now - S.stillSince;
  setRing(Math.min(1, t / need));
  hint('Ruhig halten …');
  if (t < need) return;

  // Schärfe: gegen die letzten Aufnahmen vergleichen (Kamera stellt evtl. noch scharf)
  const ref = median(S.sharpHist);
  const sharpOk = !ref || S.bestSharp >= ref * 0.55;
  const pageOk = S.quadFound;
  if ((!sharpOk || !pageOk) && t < need + 1600) { hint(!pageOk ? 'Seitenrand suchen …' : 'Stellt scharf …'); return; }
  capture(false);
}
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function fullFrame(v, reuse) {
  // Arbeitsgröße wie beim normalen Scan (lange Seite max. 3200)
  const s = Math.min(1, 3200 / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.round(v.videoWidth * s), hh = Math.round(v.videoHeight * s);
  const c = reuse && reuse.width === w && reuse.height === hh ? reuse : document.createElement('canvas');
  c.width = w; c.height = hh;
  c.getContext('2d').drawImage(v, 0, 0, w, hh);
  return c;
}

function setRing(p) {
  if (!S) return;
  S.ui.ring.style.setProperty('--p', p);
  S.ui.status.classList.toggle('on', p > 0);
}

function drawQuad() {
  if (!S) return;
  const svg = S.ui.svg, v = S.ui.video;
  svg.textContent = '';
  if (!S.quad || !v.videoWidth) return;
  const W = v.clientWidth, H = v.clientHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  // object-fit: contain
  const s = Math.min(W / v.videoWidth, H / v.videoHeight);
  const dw = v.videoWidth * s, dh = v.videoHeight * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  const pts = S.quad.map(([x, y]) => [ox + x * dw, oy + y * dh]);
  const ns = 'http://www.w3.org/2000/svg';
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  poly.setAttribute('class', S.quadFound ? 'ok' : 'no');
  svg.append(poly);
  if (S.quadFound && S.split) {
    const l = document.createElementNS(ns, 'line');
    const m1 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], m2 = [(pts[3][0] + pts[2][0]) / 2, (pts[3][1] + pts[2][1]) / 2];
    l.setAttribute('x1', m1[0]); l.setAttribute('y1', m1[1]); l.setAttribute('x2', m2[0]); l.setAttribute('y2', m2[1]);
    svg.append(l);
  }
}

// ---------- Aufnehmen ----------
let audio = null;
function click() {
  if (!S.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.1);
  } catch (e) { /* egal */ }
}

function capture(manual) {
  if (!S || !S.ui.video.videoWidth) return;
  if (manual && S.pending >= MAX_PENDING) { toast('Moment, die letzten Seiten werden noch gespeichert.'); return; }
  const v = S.ui.video;
  const canvas = manual || !S.best ? fullFrame(v) : S.best;
  const gray = manual || !S.bestGray ? grabSmall(v) : S.bestGray;
  if (!manual && S.bestSharp) { S.sharpHist.push(S.bestSharp); if (S.sharpHist.length > 8) S.sharpHist.shift(); }
  S.best = null; S.bestGray = null;
  S.ref = gray; S.armed = false; S.moved = false;
  resetStill();
  // Blitz + Ton
  S.ui.flash.classList.remove('go'); void S.ui.flash.offsetWidth; S.ui.flash.classList.add('go');
  click();
  hint('Aufgenommen ✓ · jetzt umblättern');
  const item = { canvas, split: S.split, mode: S.mode, flat: S.flat, bright: S.bright, pageIds: [], gone: false, done: false };
  S.items.push(item);
  S.pages += item.split ? 2 : 1;
  setCount();
  S.pending++;
  S.chain = S.chain.then(() => processItem(item)).finally(() => { if (S) S.pending--; });
}

async function processItem(item) {
  const bookId = S.bookId;
  try {
    await new Promise((r) => setTimeout(r, 0));
    if (item.gone) return;
    const src = item.canvas;
    const r = detectPage(src);
    const corners = r.found ? r.corners : [[0, 0], [src.width, 0], [src.width, src.height], [0, src.height]];
    const parts = [];
    if (item.split) {
      const spread = warp(src, corners, 3000);
      const halves = splitSpread(spread);
      halves.forEach((c, i) => parts.push(item.flat ? flattenCurl(c, i === 0 ? 'right' : 'left') : c));
    } else {
      const page = warp(src, corners);
      parts.push(item.flat ? flattenCurl(page, null) : page);
    }
    item.canvas = null;     // Speicher frei
    for (const p of parts) {
      if (item.gone) break;
      await new Promise((r2) => setTimeout(r2, 0));
      const straight = deskew(tameHighlights(p, item.bright));
      // farbige Kästen merken, solange die Farben noch da sind (für „Vokabeln herausholen“)
      let vxBoxes = null;
      try { vxBoxes = (await import('./vocabscan.js')).detectBoxes(straight); } catch (e) { /* egal */ }
      const flat = processScan(straight, item.mode, { straighten: false });
      const { blob, width, height } = await compress(flat);
      const thumb = await makeThumb(flat);
      if (item.gone) break;
      const page = await db.addPage({ bookId, image: blob, thumb, width, height });
      if (vxBoxes) await db.updatePage(page.id, { vxBoxes });
      item.pageIds.push(page.id);
      if (S) showThumb(thumb);
      console.log('[serie] Seite', { kb: kb(blob.size), width, height, found: r.found });
    }
    if (item.gone) for (const id of item.pageIds.splice(0)) await db.deletePage(id);
    item.done = true;
  } catch (err) {
    console.error(err);
    toast('Seite konnte nicht gespeichert werden: ' + err.message, 5000);
  }
}

function showThumb(blob) {
  const u = S.ui.thumb;
  if (u._url) URL.revokeObjectURL(u._url);
  u._url = URL.createObjectURL(blob);
  u.style.backgroundImage = `url("${u._url}")`;
  u.classList.add('has');
}

async function undoLast() {
  const it = [...S.items].reverse().find((x) => !x.gone);
  if (!it) return;
  it.gone = true;
  S.pages -= it.split ? 2 : 1;
  setCount();
  if (it.done) for (const id of it.pageIds.splice(0)) await db.deletePage(id);
  S.ui.thumb.classList.remove('has'); S.ui.thumb.style.backgroundImage = '';
  // nicht sofort dieselbe Seite wieder aufnehmen: Auslöser tippen oder umblättern
  S.armed = false; S.moved = false; S.ref = S.prev; resetStill();
  hint('Letzte Aufnahme entfernt · Auslöser = nochmal');
  toast(it.split ? '2 Seiten entfernt' : '1 Seite entfernt');
}

async function finish() {
  if (!S) return;
  const s = S;
  s.stopped = true;
  clearTimeout(s.timer);
  s.stream?.getTracks().forEach((t) => t.stop());
  window.removeEventListener('resize', drawQuad);
  document.removeEventListener('visibilitychange', onVis);
  s.ui.hint.textContent = 'Speichere die letzten Seiten …';
  s.ui.root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  await s.chain;
  if (s.ui.thumb._url) URL.revokeObjectURL(s.ui.thumb._url);
  s.ui.root.remove();
  document.body.classList.remove('serialon');
  S = null;
  const n = s.pages;
  if (n) toast(n === 1 ? '1 Seite gespeichert' : `${n} Seiten gespeichert`);
  try { await s.onDone?.(s.bookId); } catch (e) { console.error(e); }
}

// ---------- Belichtung ----------
// Anteil fast weißer (ausgefressener) Pixel auf der Seite messen. Ist die Seite zu hell,
// die Kamera-Belichtung herunterregeln (falls die Kamera das erlaubt), sonst einmal Tipp zeigen.
function exposureCheck(g, now) {
  if (!S.quad) return;
  const w = acv.width, hh = acv.height;
  const xs = S.quad.map((p) => p[0] * w), ys = S.quad.map((p) => p[1] * hh);
  const x0 = Math.max(0, Math.min(...xs) | 0), x1 = Math.min(w, Math.max(...xs) | 0);
  const y0 = Math.max(0, Math.min(...ys) | 0), y1 = Math.min(hh, Math.max(...ys) | 0);
  let n = 0, clip = 0, sum = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const v = g[y * w + x]; n++; sum += v; if (v >= 250) clip++; }
  if (!n) return;
  S.clip = clip / n;
  const mean = sum / n;
  if (S.evCaps && S.bright !== 'off') {
    if (now - S.lastEv < 700) return;
    const { min, max } = S.evCaps, step = Math.max(S.evCaps.step || 0, 0.33);
    let ev = S.ev;
    if (S.clip > 0.12) ev = Math.max(min, ev - step);
    else if (S.clip < 0.01 && mean < 150 && ev < 0) ev = Math.min(0, max, ev + step);
    if (ev !== S.ev) {
      S.ev = ev; S.lastEv = now;
      S.track.applyConstraints({ advanced: [{ exposureCompensation: ev }] }).catch(() => {});
    }
  } else if (S.clip > 0.3 && !S.warnedBright && S.bright !== 'off') {
    S.warnedBright = true;
    toast('Die Seite ist sehr hell. Die App rechnet sie dunkler. Noch besser: kein direktes Licht von oben, iPad etwas höher halten.', 5000);
  }
}

// Zu helle (überbelichtete) Seite: Mitteltöne abdunkeln, damit blasse Schrift wieder kräftig wird.
// Papier bleibt weiß, Schrift und Bilder werden dunkler.
export function tameHighlights(c, level = 'auto') {
  if (level === 'off') return c;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let gam = level === 'dark' ? 1.4 : level === 'darker' ? 1.8 : 0;
  if (level === 'auto') {
    // wie viel ist ausgefressen, wie blass ist die Schrift (dunkelste 2 %)?
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++; n++; }
    let acc = 0, p02 = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { p02 = v; break; } }
    let clip = 0; for (let v = 250; v < 256; v++) clip += hist[v];
    clip /= n;
    if (clip > 0.2 && p02 > 80) gam = Math.min(2.2, 1.3 + (p02 - 80) / 90);
    else if (clip > 0.45) gam = 1.3;
  }
  if (!gam) return c;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, gam);
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
  console.log('[serie] abgedunkelt', { gam: +gam.toFixed(2) });
  return c;
}

// ---------- Doppelseite teilen ----------
// Buchmitte = dunkelste Spalte (Schatten im Falz) zwischen 38 % und 62 % der Breite.
export function findGutter(c) {
  const w = 300, hh = Math.max(8, Math.round(c.height * w / c.width));
  const t = document.createElement('canvas'); t.width = w; t.height = hh;
  const x = t.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data;
  const col = new Float32Array(w);
  for (let xx = 0; xx < w; xx++) {
    let s = 0;
    for (let y = Math.round(hh * 0.05); y < hh * 0.95; y++) { const i = (y * w + xx) * 4; s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; }
    col[xx] = s;
  }
  const sm = new Float32Array(w);
  for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < w) { s += col[j]; n++; } } sm[i] = s / n; }
  const a = Math.round(w * 0.38), b = Math.round(w * 0.62);
  let best = Math.round(w / 2), bv = Infinity, sum = 0;
  for (let i = a; i <= b; i++) { sum += sm[i]; if (sm[i] < bv) { bv = sm[i]; best = i; } }
  const avg = sum / (b - a + 1);
  // kein deutlicher Schatten: genau die Mitte nehmen
  if (avg - bv < avg * 0.025) best = Math.round(w / 2);
  return Math.round(best * c.width / w);
}
export function splitSpread(c) {
  const g = findGutter(c);
  const cut = (x0, x1) => {
    const o = document.createElement('canvas'); o.width = Math.max(8, x1 - x0); o.height = c.height;
    o.getContext('2d').drawImage(c, x0, 0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  };
  return [cut(0, g), cut(g, c.width)];
}

// ---------- Wölbung glätten ----------
// Näherung: Ober- und Unterkante des Papiers je Spalte suchen (Papier hell, Tisch dunkler),
// glätten und jede Spalte so strecken, dass beide Kanten gerade werden. Zusätzlich wird die
// Breite nach der Länge der gebogenen Kante verteilt (die Seite ist zur Mitte hin gestaucht).
// gutter: auf welcher Seite der Falz liegt ('left'/'right') oder null (Einzelseite).
export function flattenCurl(c, gutter) {
  try {
    const W = c.width, H = c.height;
    const sw = 240, sh = Math.max(8, Math.round(H * sw / W));
    const t = document.createElement('canvas'); t.width = sw; t.height = sh;
    const tx = t.getContext('2d', { willReadFrequently: true });
    tx.drawImage(c, 0, 0, sw, sh);
    const d = tx.getImageData(0, 0, sw, sh).data;
    const L = new Float32Array(sw * sh);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
    // Papier-Helligkeit: obere Werte aus der Mitte des Blatts
    const mid = [];
    for (let y = Math.round(sh * 0.3); y < sh * 0.7; y += 2) for (let x = Math.round(sw * 0.2); x < sw * 0.8; x += 2) mid.push(L[y * sw + x]);
    mid.sort((a, b) => a - b);
    const paper = mid[Math.floor(mid.length * 0.8)];
    const thr = paper * 0.72;
    const reach = Math.round(sh * 0.12);
    const top = new Float32Array(sw), bot = new Float32Array(sw);
    let foundEdges = 0;
    for (let x = 0; x < sw; x++) {
      // von oben: erste Zeile, ab der 3 Pixel hintereinander Papier sind
      let yt = 0;
      for (let y = 0; y < reach; y++) {
        if (L[y * sw + x] > thr && L[(y + 1) * sw + x] > thr && L[(y + 2) * sw + x] > thr) { yt = y; break; }
        yt = -1;
      }
      let yb = sh - 1;
      for (let y = sh - 1; y > sh - 1 - reach; y--) {
        if (L[y * sw + x] > thr && L[(y - 1) * sw + x] > thr && L[(y - 2) * sw + x] > thr) { yb = y; break; }
        yb = -1;
      }
      top[x] = yt; bot[x] = yb;
      if (yt > 0 || (yb >= 0 && yb < sh - 1)) foundEdges++;
    }
    // Lücken füllen, Ausreißer weg (Median), glätten
    const fix = (a, def) => {
      for (let x = 0; x < sw; x++) if (a[x] < 0) a[x] = NaN;
      const med = new Float32Array(sw);
      for (let x = 0; x < sw; x++) {
        const win = [];
        for (let k = -6; k <= 6; k++) { const v = a[Math.min(sw - 1, Math.max(0, x + k))]; if (!isNaN(v)) win.push(v); }
        win.sort((p, q) => p - q);
        med[x] = win.length ? win[win.length >> 1] : def;
      }
      const out = new Float32Array(sw);
      for (let x = 0; x < sw; x++) { let s = 0, n = 0; for (let k = -5; k <= 5; k++) { const j = x + k; if (j >= 0 && j < sw) { s += med[j]; n++; } } out[x] = s / n; }
      return out;
    };
    if (foundEdges < sw * 0.15) return c;              // keine gebogene Kante sichtbar: nichts tun
    const T = fix(top, 0), B = fix(bot, sh - 1);
    // Nur glätten, wenn die Kanten wirklich gebogen sind (sonst unnötig rechnen)
    const span = (a) => Math.max(...a) - Math.min(...a);
    if (span(T) < sh * 0.006 && span(B) < sh * 0.006) return c;
    // Ziel: gerade Kanten auf der Höhe der Außenkante (dort liegt das Blatt flach)
    const outerX = gutter === 'right' ? Math.round(sw * 0.08) : gutter === 'left' ? Math.round(sw * 0.92) : null;
    const tTop = outerX != null ? T[outerX] : Math.min(...T);
    const tBot = outerX != null ? B[outerX] : Math.max(...B);
    if (tBot - tTop < sh * 0.5) return c;
    // Breite nach Bogenlänge (Mittel aus Ober- und Unterkante), gedämpft
    const arc = new Float32Array(sw + 1);
    for (let x = 1; x <= sw; x++) {
      const i = Math.min(sw - 1, x);
      const dy = ((T[i] - T[i - 1]) + (B[i] - B[i - 1])) / 2;
      arc[x] = arc[x - 1] + Math.sqrt(1 + Math.min(4, dy * dy));
    }
    const total = arc[sw];
    // Umkehr: für jede Ziel-Spalte die Quell-Spalte finden
    const src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ox = out.getContext('2d');
    const od = ox.createImageData(W, H), o = od.data;
    const k = W / sw;
    let j = 0;
    for (let X = 0; X < W; X++) {
      const want = (X + 0.5) / W * total;
      while (j < sw - 1 && arc[j + 1] < want) j++;
      const f = Math.min(1, Math.max(0, (want - arc[j]) / Math.max(1e-6, arc[j + 1] - arc[j])));
      const sx = (j + f) * k;                          // Quell-Spalte in voller Größe
      const ci = Math.min(sw - 1, Math.max(0, Math.round(j + f)));
      const yt = T[ci] * H / sh, yb = B[ci] * H / sh;
      const at = tTop * H / sh, ab = tBot * H / sh;
      const x0 = Math.min(W - 2, Math.max(0, sx | 0)), fx = Math.min(1, Math.max(0, sx - x0));
      for (let Y = 0; Y < H; Y++) {
        // Y liegt zwischen den geraden Ziel-Kanten -> gleiche relative Lage zwischen den echten Kanten
        const r = (Y - at) / (ab - at);
        let sy = yt + r * (yb - yt);
        if (sy < 0) sy = 0; else if (sy > H - 1.001) sy = H - 1.001;
        const y0 = sy | 0, fy = sy - y0;
        const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
        const q = (Y * W + X) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const a = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * fx;
          const b = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * fx;
          o[q + ch] = a + (b - a) * fy;
        }
        o[q + 3] = 255;
      }
    }
    ox.putImageData(od, 0, 0);
    // Rand oberhalb/unterhalb der geraden Kanten abschneiden
    const cy0 = Math.max(0, Math.round(tTop * H / sh)), cy1 = Math.min(H, Math.round(tBot * H / sh));
    if (cy1 - cy0 < H * 0.5) return out;
    const fin = document.createElement('canvas'); fin.width = W; fin.height = cy1 - cy0;
    fin.getContext('2d').drawImage(out, 0, cy0, W, fin.height, 0, 0, W, fin.height);
    return fin;
  } catch (e) {
    console.warn('[serie] glätten', e);
    return c;
  }
}

// für Tests
window.__serial = { state: () => S, findGutter, splitSpread, flattenCurl, tameHighlights };
