// „Meine Schrift“: die App lernt deine Handschrift aus Schreibproben mit dem Pencil.
// Wie: Jede Probe sind deine Striche (Form + Reihenfolge egal). Erkennung mit einem Punktwolken-Vergleich ($P-Verfahren,
// Vatavu/Anthony/Wobbrock 2012) gegen alle deine Proben, plus Größe (z. B. o/O, c/C, Punkt/Komma).
// Alles bleibt auf dem Gerät (IndexedDB, Eintrag „myhand“ im meta-Speicher), kein Download, sofort fertig.
// Grenzen: Druckschrift mit kleinen Lücken klappt gut. Verbundene Schreibschrift lässt sich schlecht in Buchstaben zerlegen.
import * as db from './db.js';
import { h, icon, toast, sheet, confirmSheet } from './ui.js';
import { isPalm, pointsOf, smoothPath } from './pen.js';

export const SETS = {
  klein: { label: 'a–z', chars: 'abcdefghijklmnopqrstuvwxyz' },
  gross: { label: 'A–Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  umlaut: { label: 'ä ö ü ß', chars: 'äöüÄÖÜß' },
  zahl: { label: '0–9 + − · :', chars: '0123456789+-·:=()/,.?!%' },
};
const ALL = Object.values(SETS).map((s) => s.chars).join('');
export const GOAL = 10;           // Proben pro Zeichen
const WORDS = ['Hausaufgabe', 'Mathe', 'Deutsch', 'Englisch', 'lernen', 'Klassenarbeit', 'Schule', 'Aufgabe', 'Lösung', 'Ergebnis', 'Gleichung', 'Bruch', 'Fläche', 'Zeit', 'Wörter', 'Satz', 'groß', 'klein', 'Datum', 'Seite'];
const N = 32;                     // Punkte pro Probe

// ---------- Speicher ----------
let model = null;
export async function loadModel() {
  if (model) return model;
  const m = await db.getMeta('myhand');
  model = m && m.samples ? m : { id: 'myhand', v: 1, samples: {}, stats: {}, words: { hit: 0, all: 0 } };
  return model;
}
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => db.putItems('meta', [model]).catch(() => {}), 400); }
export const sampleCount = (m) => Object.values(m.samples).reduce((a, l) => a + l.length, 0);
export async function ready() { const m = await loadModel(); return Object.values(m.samples).filter((l) => l.length >= 3).length >= 20; }

// ---------- Punktwolke ($P) ----------
// strokes: [[x,y, x,y, ...], ...] → Punkte [x, y, strichNr]
function cloudOf(strokes) {
  const pts = [];
  strokes.forEach((s, si) => { for (let i = 0; i + 1 < s.length; i += 2) pts.push([s[i], s[i + 1], si]); });
  return pts;
}
function pathLen(p) { let d = 0; for (let i = 1; i < p.length; i++) if (p[i][2] === p[i - 1][2]) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; }
function resample(p, n = N) {
  if (p.length === 1) return Array.from({ length: n }, () => [...p[0]]);
  const I = pathLen(p) / (n - 1) || 1e-6;
  let D = 0;
  const out = [p[0].slice()];
  const q = p.map((x) => x.slice());
  for (let i = 1; i < q.length; i++) {
    if (q[i][2] !== q[i - 1][2]) continue;
    const d = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
    if (D + d >= I) {
      const t = (I - D) / d;
      const nq = [q[i - 1][0] + t * (q[i][0] - q[i - 1][0]), q[i - 1][1] + t * (q[i][1] - q[i - 1][1]), q[i][2]];
      out.push(nq); q.splice(i, 0, nq); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(q[q.length - 1].slice());
  return out.slice(0, n);
}
function normalize(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.max(x1 - x0, y1 - y0) || 1;
  let cx = 0, cy = 0;
  const q = p.map(([x, y, i]) => [(x - x0) / s, (y - y0) / s, i]);
  for (const [x, y] of q) { cx += x; cy += y; }
  cx /= q.length; cy /= q.length;
  return q.map(([x, y, i]) => [+(x - cx).toFixed(3), +(y - cy).toFixed(3), i]);
}
function cloudDist(a, b, start) {
  const n = a.length, used = new Array(n).fill(false);
  let sum = 0, i = start;
  do {
    let min = Infinity, idx = -1;
    for (let j = 0; j < n; j++) if (!used[j]) { const d = (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2; if (d < min) { min = d; idx = j; } }
    used[idx] = true;
    const w = 1 - ((i - start + n) % n) / n;
    sum += w * Math.sqrt(min);
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}
function match(a, b) {
  const step = Math.floor(Math.sqrt(a.length)) || 1;
  let min = Infinity;
  for (let i = 0; i < a.length; i += step) { min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i)); }
  return min;
}
// Probe aus Strichen: Form + Größe (hr = Höhe im Verhältnis zur Zeilenhöhe) + Lage (dy = Mitte relativ zur Zeile)
export function makeSample(strokes, lineTop, lineH) {
  let y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 1; i < s.length; i += 2) { y0 = Math.min(y0, s[i]); y1 = Math.max(y1, s[i]); }
  return { p: normalize(resample(cloudOf(strokes))), hr: +((y1 - y0) / lineH).toFixed(3), dy: +(((y0 + y1) / 2 - lineTop) / lineH).toFixed(3), ns: strokes.length };
}
// Erkennen: beste Treffer (Zeichen, Abstand)
export function classify(m, smp, only = null) {
  const best = new Map();
  for (const [ch, list] of Object.entries(m.samples)) {
    if (only && !only.includes(ch)) continue;
    for (const t of list) {
      let d = match(smp.p, t.p);
      d += 1.6 * Math.abs(Math.log((smp.hr + 0.05) / (t.hr + 0.05)));   // Größe
      d += 1.2 * Math.abs(smp.dy - t.dy);                               // Lage in der Zeile (Komma unten, Strich mittig)
      if (!best.has(ch) || d < best.get(ch)) best.set(ch, d);
    }
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]);
}

// ---------- Ganze Seite lesen (Stift-Striche) ----------
// strokes: Editor-Striche { tool, pts:[x,y,p,...] }
export async function readStrokes(strokes) {
  const m = await loadModel();
  const pen = (strokes || []).filter((s) => (s.tool === 'pen' || !s.tool) && s.pts && s.pts.length >= 3)
    .map((s) => { const xy = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < s.pts.length; i += 3) { const x = s.pts[i], y = s.pts[i + 1]; xy.push(x, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { xy, x0, x1, y0, y1, cy: (y0 + y1) / 2 }; });
  if (!pen.length) return '';
  const hs = pen.map((s) => s.y1 - s.y0).filter((x) => x > 4).sort((a, b) => a - b);
  const medH = hs.length ? hs[Math.floor(hs.length * 0.6)] : 20;
  // Zeilen: Striche nach Mitte sortieren, neue Zeile bei großem Abstand
  pen.sort((a, b) => a.cy - b.cy);
  const lines = [];
  for (const s of pen) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(s.cy - L.cy) < medH * 0.9) { L.s.push(s); L.cy = (L.cy * (L.s.length - 1) + s.cy) / L.s.length; }
    else lines.push({ cy: s.cy, s: [s] });
  }
  const out = [];
  for (const L of lines) {
    L.s.sort((a, b) => a.x0 - b.x0);
    // Zeichen: Striche, die sich in x überlappen, gehören zusammen (i-Punkt, t-Strich, Umlaut-Punkte)
    const groups = [];
    for (const s of L.s) {
      const g = groups[groups.length - 1];
      const ov = g ? Math.min(g.x1, s.x1) - Math.max(g.x0, s.x0) : -1;
      if (g && ov > -medH * 0.08 && ov > -(Math.min(s.x1 - s.x0, g.x1 - g.x0)) * 0.1) { g.s.push(s); g.x1 = Math.max(g.x1, s.x1); g.x0 = Math.min(g.x0, s.x0); g.y0 = Math.min(g.y0, s.y0); g.y1 = Math.max(g.y1, s.y1); }
      else groups.push({ s: [s], x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 });
    }
    const lineTop = Math.min(...L.s.map((s) => s.y0));
    const lineH = Math.max(medH, Math.max(...L.s.map((s) => s.y1)) - lineTop) || medH;
    const widths = groups.map((g) => g.x1 - g.x0).sort((a, b) => a - b);
    const medW = widths[Math.floor(widths.length / 2)] || medH;
    let text = '', prev = null;
    for (const g of groups) {
      if (prev && g.x0 - prev.x1 > Math.max(medW * 0.6, medH * 0.5)) text += ' ';
      const smp = makeSample(g.s.map((s) => s.xy), lineTop, lineH);
      const r = classify(m, smp);
      text += r.length ? r[0][0] : '?';
      prev = g;
    }
    out.push(text);
  }
  return out.join('\n');
}

// ---------- Schreibfeld ----------
function writePad(onDone) {
  const c = h('canvas.mhpad');
  const x = c.getContext('2d');
  let strokes = [], cur = null, timer = 0, dpr = 1;
  const W = () => c.clientWidth, H = () => c.clientHeight;
  // Hilfslinien: Oberlinie, Mittellinie (x-Höhe), Grundlinie, Unterlänge
  const guide = () => ({ top: H() * 0.16, mid: H() * 0.42, base: H() * 0.68 });
  function size() { dpr = window.devicePixelRatio || 1; c.width = W() * dpr; c.height = H() * dpr; draw(); }
  function draw() {
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W(), H());
    const g = guide();
    x.strokeStyle = 'rgba(120,130,160,.35)'; x.lineWidth = 1; x.setLineDash([6, 6]);
    [g.top, g.mid].forEach((y) => { x.beginPath(); x.moveTo(12, y); x.lineTo(W() - 12, y); x.stroke(); });
    x.setLineDash([]); x.strokeStyle = 'rgba(80,90,130,.55)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(12, g.base); x.lineTo(W() - 12, g.base); x.stroke();
    x.strokeStyle = getComputedStyle(c).color || '#1d2433'; x.lineWidth = 3.2; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const s of [...strokes, cur].filter(Boolean)) { const P = []; for (let i = 0; i + 1 < s.length; i += 2) P.push([s[i], s[i + 1]]); smoothPath(x, P); x.stroke(); }
  }
  const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let raf = 0;
  c.addEventListener('pointerdown', (e) => { if (isPalm(e) || cur) return; e.preventDefault(); clearTimeout(timer); c.setPointerCapture(e.pointerId); pid = e.pointerId; cur = pos(e); draw(); });
  c.addEventListener('pointermove', (e) => { if (!cur || e.pointerId !== pid) return; e.preventDefault(); for (const ev of pointsOf(e)) cur.push(...pos(ev)); if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  let pid = null;
  const up = (e) => { if (!cur || (e && e.pointerId !== pid)) return; pid = null; strokes.push(cur); cur = null; draw(); clearTimeout(timer); timer = setTimeout(() => { if (strokes.length) onDone(api.sample()); }, 1100); };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.style.touchAction = 'none';
  const api = {
    el: c,
    clear() { strokes = []; cur = null; clearTimeout(timer); draw(); },
    has: () => strokes.length > 0,
    sample() { const g = guide(); return makeSample(strokes, g.top, g.base - g.top); },
    strokes: () => strokes,
    guide,
    size,
    stop() { clearTimeout(timer); },
  };
  new ResizeObserver(size).observe(c);
  return api;
}

// ---------- Trainings-Fenster ----------
export async function trainSheet() {
  const m = await loadModel();
  await sheet('Meine Schrift', (body, close) => {
    let mode = 'ueben', set = 'klein', target = '', testHits = [];
    const tabs = h('div.seg');
    const head = h('div.mhhead');
    const big = h('div.mhbig');
    const info = h('p.dlgtext.mhinfo');
    const bar = h('div.mhbar', null, h('i'));
    const result = h('div.mhres');
    const setSeg = h('div.seg.wrap');
    const grid = h('div.mhgrid');
    const pad = writePad((smp) => onSample(smp));
    const padWrap = h('div.mhpadwrap', null, pad.el);
    const btns = h('div.dlgactions');
    const need = (ch) => GOAL - (m.samples[ch] || []).length;
    const total = () => ALL.length * GOAL;
    const have = () => [...ALL].reduce((a, ch) => a + Math.min(GOAL, (m.samples[ch] || []).length), 0);
    const rate = (ch) => { const s = m.stats[ch]; return s && s.h + s.m ? s.h / (s.h + s.m) : null; };

    function pickNext() {
      if (mode === 'woerter') { target = WORDS[Math.floor(Math.random() * WORDS.length)]; return; }
      if (mode === 'test') {
        const trained = [...ALL].filter((ch) => (m.samples[ch] || []).length >= 2);
        if (!trained.length) { target = ''; return; }
        // Schwache Zeichen öfter testen
        const w = trained.map((ch) => { const r = rate(ch); return r == null ? 2 : 1 + (1 - r) * 3; });
        let t = Math.random() * w.reduce((a, b) => a + b, 0);
        target = trained.find((ch, i) => (t -= w[i]) < 0) || trained[0];
        return;
      }
      const chars = [...SETS[set].chars].filter((ch) => need(ch) > 0);
      if (!chars.length) { target = ''; return; }
      chars.sort((a, b) => need(b) - need(a));
      const top = chars.filter((ch) => need(ch) === need(chars[0]));
      target = top[Math.floor(Math.random() * top.length)];
    }
    function render() {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      setSeg.hidden = mode !== 'ueben';
      setSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === set));
      grid.hidden = mode !== 'liste'; padWrap.hidden = mode === 'liste'; big.hidden = mode === 'liste'; result.hidden = mode === 'liste';
      const pct = Math.round(have() / total() * 100);
      bar.firstChild.style.width = pct + '%';
      if (mode === 'liste') {
        head.textContent = `${have()} von ${total()} Proben (${pct} %)`;
        info.textContent = 'Zahl = deine Proben (Ziel 10). Farbe = Trefferquote im Test: grün gut, gelb mittel, rot schwach. Tippe ein Zeichen an, um es zu üben.';
        grid.replaceChildren(...[...ALL].map((ch) => {
          const r = rate(ch), n = (m.samples[ch] || []).length;
          return h('button.mhcell' + (r == null ? '' : r >= 0.85 ? '.good' : r >= 0.6 ? '.mid' : '.bad'), { on: { click: () => { mode = 'ueben'; set = Object.keys(SETS).find((k) => SETS[k].chars.includes(ch)); target = ch; render(); } } },
            h('b', { text: ch }), h('small', { text: `${n}/${GOAL}` + (r == null ? '' : ` · ${Math.round(r * 100)} %`) }));
        }));
        btns.replaceChildren(h('button.btn', { text: 'Alle Proben löschen', on: { click: async () => { if (!(await confirmSheet('Alle Schreibproben löschen?', 'Deine trainierte Schrift wird gelöscht. Das kann man nicht rückgängig machen.'))) return; m.samples = {}; m.stats = {}; m.words = { hit: 0, all: 0 }; save(); render(); } } }), h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } }));
        return;
      }
      if (!target) pickNext();
      if (mode === 'ueben') {
        head.textContent = target ? `Schreibe: ` : 'Alles in dieser Gruppe geschafft!';
        big.textContent = target;
        info.textContent = target ? `Probe ${Math.min(GOAL, (m.samples[target] || []).length) + 1} von ${GOAL}. Schreib so, wie du normal schreibst. Nach dem Absetzen wird es automatisch gespeichert.` : 'Wähle oben eine andere Gruppe oder mach den Test.';
      } else if (mode === 'test') {
        const all = Object.values(m.stats).reduce((a, s) => ({ h: a.h + s.h, m: a.m + s.m }), { h: 0, m: 0 });
        head.textContent = target ? 'Test – schreibe:' : 'Erst ein paar Zeichen üben.';
        big.textContent = target;
        info.textContent = all.h + all.m ? `Trefferquote bisher: ${Math.round(all.h / (all.h + all.m) * 100)} % (${all.h + all.m} Versuche). Falsch erkannte Zeichen kommen öfter dran.` : 'Die App rät, was du geschrieben hast. Falsch erkannte Zeichen kommen öfter dran.';
      } else {
        head.textContent = 'Wort-Test – schreibe in Druckschrift:';
        big.textContent = target;
        info.textContent = (m.words.all ? `Wörter ganz richtig: ${Math.round(m.words.hit / m.words.all * 100)} % (${m.words.all} Wörter). ` : '') + 'Lass kleine Lücken zwischen den Buchstaben. Verbundene Schreibschrift kann die App so nicht zerlegen.';
      }
      btns.replaceChildren(
        h('button.btn', { text: 'Löschen', on: { click: () => pad.clear() } }),
        h('button.btn', { text: 'Überspringen', on: { click: () => { pad.clear(); result.textContent = ''; target = ''; pickNext(); render(); } } }),
        h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } }));
    }
    async function onSample(smp) {
      if (!target) { pad.clear(); return; }
      if (mode === 'ueben') {
        (m.samples[target] ||= []).push(smp);
        if (m.samples[target].length > 25) m.samples[target].shift();
        save();
        result.textContent = `„${target}“ gespeichert`;
        result.className = 'mhres ok';
      } else if (mode === 'test') {
        const r = classify(m, smp);
        const guess = r.length ? r[0][0] : '?';
        const ok = guess === target;
        const st = (m.stats[target] ||= { h: 0, m: 0 });
        ok ? st.h++ : st.m++;
        // Richtige Probe gleich mitlernen (macht die Erkennung besser)
        (m.samples[target] ||= []).push(smp);
        if (m.samples[target].length > 25) m.samples[target].shift();
        save();
        result.textContent = ok ? `Richtig erkannt: „${guess}“` : `Erkannt: „${guess}“ statt „${target}“`;
        result.className = 'mhres ' + (ok ? 'ok' : 'bad');
        testHits.push(ok);
      } else {
        const g = pad.guide();
        const strokes = pad.strokes().map((s) => { const p = []; for (let i = 0; i + 1 < s.length; i += 2) p.push(s[i], s[i + 1], 0.5); return { tool: 'pen', pts: p }; });
        let txt = (await readStrokes(strokes)).replace(/\s+/g, '');
        void g;
        const ok = txt === target;
        m.words.all++; if (ok) m.words.hit++;
        save();
        result.textContent = ok ? `Richtig: „${txt}“` : `Gelesen: „${txt}“`;
        result.className = 'mhres ' + (ok ? 'ok' : 'bad');
      }
      pad.clear();
      target = ''; pickNext(); render();
    }
    [['ueben', 'Üben'], ['test', 'Test'], ['woerter', 'Wörter'], ['liste', 'Übersicht']].forEach(([k, l]) => tabs.append(h('button', { text: l, 'data-m': k, on: { click: () => { mode = k; target = ''; result.textContent = ''; pad.clear(); render(); } } })));
    Object.entries(SETS).forEach(([k, s]) => setSeg.append(h('button', { text: s.label, 'data-s': k, on: { click: () => { set = k; target = ''; pad.clear(); render(); } } })));
    body.classList.add('mhbody');
    body.append(tabs, bar, setSeg, h('div.mhprompt', null, head, big), padWrap, result, info, grid, btns);
    render();
    requestAnimationFrame(() => pad.size());
  }, { wide: true });
}
