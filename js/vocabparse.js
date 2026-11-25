// Vokabeln aus Scan – reine Logik (ohne Oberfläche, auch in Node testbar).
// Eingang: erkannte Wörter mit Position (0..1 relativ zum Bild) + markierte Rechtecke.
// Ausgang: Vokabelpaare { word, trans }, ohne Lautschrift, Seitenzahlen, Beispielsätze usw.

export const OPT_DEFAULT = { ipa: true, nums: true, labels: true, paren: false, boxes: true, stop: true };

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const inside = (w, m) => { const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; return cx >= m.x0 && cx <= m.x1 && cy >= m.y0 && cy <= m.y1; };

// Jedes Wort dem kleinsten Rechteck zuordnen, in dem seine Mitte liegt (Weglassen gewinnt immer).
export function assignWords(words, marks) {
  const out = [];
  for (const w of words) {
    if (marks.some((m) => m.t === 'skip' && inside(w, m))) continue;
    let best = -1, area = Infinity;
    marks.forEach((m, i) => {
      if (m.t === 'skip' || !inside(w, m)) return;
      const a = (m.x1 - m.x0) * (m.y1 - m.y0);
      if (a < area) { area = a; best = i; }
    });
    if (best >= 0) out.push({ ...w, mi: best });
  }
  return out;
}

// ---------- Kästen finden (z. B. blaue Info-Kästen im Vokabelteil) ----------
// img: { data, width, height } (RGBA, verkleinert). Gibt Rechtecke 0..1 zurück.
const dedupe = (boxes) => {
  const out = [];
  for (const b of boxes.sort((x, y) => (y.x1 - y.x0) * (y.y1 - y.y0) - (x.x1 - x.x0) * (x.y1 - x.y0))) {
    if (out.some((o) => b.x0 >= o.x0 - 0.01 && b.y0 >= o.y0 - 0.01 && b.x1 <= o.x1 + 0.01 && b.y1 <= o.y1 + 0.01)) continue;
    out.push(b);
  }
  return out;
};
// 1) Farbige Flächen: Hintergrund, der deutlich „kühler“ (blauer) ist als das Papier drumherum.
//    Klappt am besten mit dem Foto VOR dem Aufhellen (wird beim Scannen gemerkt).
export function findTintBoxes(img) {
  const { data, width: w, height: hh } = img;
  const vals = [];
  for (let i = 0; i < data.length; i += 4 * 7) { const br = (data[i] + data[i + 1] + data[i + 2]) / 3; if (br > 110) vals.push(data[i + 2] - data[i]); }
  const ref = median(vals);
  const tint = new Uint8Array(w * hh);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2], br = (r + g + b) / 3;
    tint[j] = br > 110 && br < 248 && b - r - ref > 11 && b >= g - 4 ? 1 : 0;
  }
  const cell = Math.max(4, Math.round(w / 70)), cols = Math.ceil(w / cell), rows = Math.ceil(hh / cell);
  const on = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let n = 0, t = 0;
      for (let y = r * cell; y < Math.min(hh, (r + 1) * cell); y++) for (let x = c * cell; x < Math.min(w, (c + 1) * cell); x++) { t++; n += tint[y * w + x]; }
      row.push(n > t * 0.45);
    }
    on.push(row);
  }
  const seen = on.map((r) => r.map(() => false));
  const boxes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!on[r][c] || seen[r][c]) continue;
    let r0 = r, r1 = r, c0 = c, c1 = c, n = 0; const st = [[r, c]]; seen[r][c] = true;
    while (st.length) {
      const [y, x] = st.pop(); n++;
      r0 = Math.min(r0, y); r1 = Math.max(r1, y); c0 = Math.min(c0, x); c1 = Math.max(c1, x);
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < rows && xx >= 0 && xx < cols && on[yy][xx] && !seen[yy][xx]) { seen[yy][xx] = true; st.push([yy, xx]); } }
    }
    const bw = c1 - c0 + 1, bh = r1 - r0 + 1;
    // groß genug, nicht die ganze Seite, ausreichend gefüllt (Text im Kasten lässt Lücken)
    if (bw >= cols * 0.18 && bh >= 3 && bw * bh < cols * rows * 0.6 && n >= bw * bh * 0.4) boxes.push({ x0: c0 * cell / w, y0: r0 * cell / hh, x1: Math.min(1, (c1 + 1) * cell / w), y1: Math.min(1, (r1 + 1) * cell / hh) });
  }
  return dedupe(boxes);
}
// 2) Gerahmte Kästen: lange waagrechte Linien oben + unten, senkrechte Linien links + rechts (streng, lieber einer zu wenig)
export function findLineBoxes(img) {
  const { data, width: w, height: hh } = img;
  const g = new Uint8Array(w * hh);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) g[j] = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
  const dark = (x, y) => g[y * w + x] < 200;
  const hs = [];
  for (let y = 1; y < hh - 1; y++) {
    let x = 0;
    while (x < w) {
      while (x < w && !dark(x, y)) x++;
      const a = x; let gap = 0, n = 0, e = x;
      while (x < w && gap <= 3) { if (dark(x, y) || (y > 0 && dark(x, y - 1)) || (y < hh - 1 && dark(x, y + 1))) { gap = 0; n++; e = x; } else gap++; x++; }
      if (e - a >= w * 0.25 && e - a < w * 0.97 && n >= (e - a) * 0.9) hs.push({ y, a, b: e });
    }
  }
  const vline = (x, y0, y1) => {
    let n = 0; for (let y = y0; y <= y1; y++) { let d = false; for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w && dark(xx, y)) { d = true; break; } } if (d) n++; }
    return n / Math.max(1, y1 - y0 + 1);
  };
  const boxes = [];
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const t = hs[i], bo = hs[j], dy = bo.y - t.y;
    if (dy < hh * 0.03 || dy > hh * 0.7) continue;
    const a = Math.max(t.a, bo.a), b = Math.min(t.b, bo.b);
    if (b - a < Math.max(t.b - t.a, bo.b - bo.a) * 0.85) continue;
    if (vline(a + 1, t.y, bo.y) > 0.85 && vline(b - 1, t.y, bo.y) > 0.85) boxes.push({ x0: a / w, y0: t.y / hh, x1: b / w, y1: bo.y / hh });
  }
  return dedupe(boxes);
}
// Linien-Erkennung ist zu unsicher (Tabellenlinien, Kopfleiste) → nur farbige Flächen verwenden.
export const findBoxes = (img) => findTintBoxes(img);

// Schräglage aus den von der Texterkennung gefundenen Zeilen schätzen (dy pro dx)
function skewOf(ws) {
  const by = new Map();
  for (const w of ws) { if (!by.has(w.line)) by.set(w.line, []); by.get(w.line).push(w); }
  const sl = [];
  for (const l of by.values()) {
    if (l.length < 3) continue;
    const xs = l.map((w) => (w.x0 + w.x1) / 2), ys = l.map((w) => (w.y0 + w.y1) / 2);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let nu = 0, de = 0; xs.forEach((x, i) => { nu += (x - mx) * (ys[i] - my); de += (x - mx) ** 2; });
    if (de > 0 && Math.max(...xs) - Math.min(...xs) > 0.25) sl.push(nu / de);
  }
  const s = median(sl);
  return Math.abs(s) < 0.08 ? s : 0;
}

// Zeilen bilden (nach Höhe), auch über Spalten hinweg
function makeLines(ws, hMed, sk = 0) {
  const yc = (w) => (w.y0 + w.y1) / 2 - sk * (w.x0 + w.x1) / 2;
  // Zuerst die Zeilen der Texterkennung übernehmen (folgen auch gebogenen Seiten), dann nach Höhe zusammenlegen
  const units = new Map();
  for (const w of ws) { const k = w.line ?? Math.random(); if (!units.has(k)) units.set(k, []); units.get(k).push(w); }
  const us = [...units.values()].map((u) => ({ ws: u, cy: u.reduce((t, x) => t + yc(x), 0) / u.length })).sort((a, b) => a.cy - b.cy);
  const lines = [];
  for (const u of us) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(u.cy - cur.cy) < hMed * 0.55) { cur.ws.push(...u.ws); cur.cy = cur.ws.reduce((t, x) => t + yc(x), 0) / cur.ws.length; }
    else lines.push({ cy: u.cy, ws: [...u.ws] });
  }
  for (const l of lines) l.ws.sort((a, b) => a.x0 - b.x0);
  return lines;
}

// Spalten in einem Bereich finden: senkrechte Lücken, durch die (fast) kein Wort geht.
export function findColumns(ws, m) {
  const span = m.x1 - m.x0;
  if (!ws.length || span <= 0) return [{ x0: m.x0, x1: m.x1 }];
  const hMed = median(ws.map((w) => w.y1 - w.y0));
  const N = 240, bins = new Array(N).fill(0);
  const bi = (x) => Math.max(0, Math.min(N - 1, Math.floor((x - m.x0) / span * N)));
  for (const w of ws) for (let b = bi(w.x0); b <= bi(w.x1); b++) bins[b]++;
  const nLines = makeLines(ws, hMed).length;
  const thr = Math.floor(nLines * 0.08);
  // Lücke muss breiter sein als ein normales Leerzeichen (~0,5 Zeilenhöhen)
  const minGap = Math.max(2, Math.ceil(hMed * 1.15 / span * N));
  let first = 0, last = N - 1;
  while (first < N && bins[first] === 0) first++;
  while (last > 0 && bins[last] === 0) last--;
  const cuts = [];
  for (let b = first; b <= last; b++) {
    if (bins[b] > thr) continue;
    let e = b; while (e + 1 <= last && bins[e + 1] <= thr) e++;
    if (e - b + 1 >= minGap) cuts.push(m.x0 + ((b + e + 1) / 2) / N * span);
    b = e;
  }
  let cols = [];
  let x = m.x0;
  for (const c of cuts) { cols.push({ x0: x, x1: c }); x = c; }
  cols.push({ x0: x, x1: m.x1 });
  // Spalten mit sehr wenigen Wörtern (Ausreißer) mit der Nachbarspalte zusammenlegen
  const count = (c) => ws.filter((w) => { const cx = (w.x0 + w.x1) / 2; return cx >= c.x0 && cx < c.x1; }).length;
  const minWords = Math.max(2, Math.round(nLines * 0.15));
  let changed = true;
  while (changed && cols.length > 1) {
    changed = false;
    for (let i = 0; i < cols.length; i++) {
      if (count(cols[i]) >= minWords) continue;
      const j = i === 0 ? 1 : i === cols.length - 1 ? i - 1 : (count(cols[i - 1]) < count(cols[i + 1]) ? i - 1 : i + 1);
      const a = Math.min(i, j), b = Math.max(i, j);
      cols.splice(a, 2, { x0: cols[a].x0, x1: cols[b].x1 });
      changed = true; break;
    }
  }
  return cols;
}
const colOf = (w, cols) => { const cx = (w.x0 + w.x1) / 2; let k = cols.findIndex((c) => cx >= c.x0 && cx < c.x1); if (k < 0) k = cx < cols[0].x0 ? 0 : cols.length - 1; return k; };

// Wie „deutsch“ wirkt ein Text? (positiv = eher Deutsch)
export function deScore(t) {
  const n = Math.max(1, t.split(/\s+/).filter(Boolean).length);
  let s = 0;
  s += (t.match(/[äöüßÄÖÜ]/g) || []).length * 2;
  s += (t.match(/\b(der|das|den|dem|sich|etw|jdn|jdm|jds|und|ein|eine|einen|einem|nicht|mit|von|zu|auf|ist|sein|haben|werden)\b/gi) || []).length * 2;
  s -= (t.match(/\b(the|to|sth|sb|of|and|a|an|is|you|it|in|on|le|la|les|un|une|et|el|los|las|y|est|que)\b/gi) || []).length * 2;
  s -= (t.match(/[éèêàçùñ]/g) || []).length;
  return s / n;
}

// Standard-Rollen für die Spalten eines Bereichs
export function defaultRoles(ws, cols) {
  if (cols.length === 1) return ['both'];
  // Vokabelteile: links die Vokabel, daneben Deutsch, alles weiter rechts (Beispielsätze, Hinweise) weg.
  const roles = cols.map((c, k) => (k === 0 ? 'word' : k === 1 ? 'trans' : 'skip'));
  if (cols.length === 2) {
    const texts = cols.map((c, k) => ws.filter((w) => colOf(w, cols) === k).map((w) => w.text).join(' '));
    if (deScore(texts[0]) - deScore(texts[1]) > 0.3) return ['trans', 'word'];   // Deutsch steht links
  }
  return roles;
}

// ---------- Aufräumen ----------
const JUNK = /^[|¦_—–\-~•·●▪■□►▶▸◆◇★☆*✓→»«'"`´,.;:!?()[\]{}]+$/;
const BULLET = /^[•·●▪■□►▶▸◆◇★☆*→>|¦]+/;
const IPA = /[əɪʊæɒʌɔːˈˌθðʃʒŋɜɑɐɛ]/;
const LABEL = /^\(?(n|v|vt|vi|adj|adv|prep|conj|pron|pl|sg|infml|fml|AE|BE|irr|no\s?pl|n\s?pl|sing|Pl|Sg|ugs)\.?\)?[,;]?$/;
const NUM = /^[([]?\d{1,4}[.)\]:]?$/;

export function cleanTokens(toks, o, role = '') {
  const out = [];
  let inIpa = 0, inPar = 0;
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i].text.replace(BULLET, '');
    if (!t) continue;
    if (o.ipa) {
      if (inIpa) { inIpa--; if (/[\]/]$/.test(t) || !inIpa) inIpa = 0; continue; }
      if (/^\[/.test(t)) { if (!/\]/.test(t)) inIpa = 6; continue; }
      if (/^\/./.test(t) && !/^\/\s*$/.test(t)) { if (!/.\/[,;.]?$/.test(t)) inIpa = 6; continue; }
      if (IPA.test(t)) continue;
      t = t.replace(/\[[^\]]*\]/g, '');
      if (!t) continue;
    }
    if (o.paren) {
      if (inPar) { if (/\)/.test(t)) { inPar = 0; t = t.slice(t.lastIndexOf(')') + 1); if (!t) continue; } else continue; }
      t = t.replace(/\([^)]*\)/g, '');
      if (/\(/.test(t)) { inPar = 1; t = t.slice(0, t.indexOf('(')); }
      if (!t) continue;
    }
    if (o.nums) {
      if (NUM.test(t)) continue;
      if (/^(S|p|pp|Seite|page)\.?$/i.test(t) && toks[i + 1] && NUM.test(toks[i + 1].text)) { i++; continue; }
    }
    if (o.labels && LABEL.test(t)) continue;
    if (JUNK.test(t)) continue;
    // Lautschrift, die die Texterkennung verlesen hat (ı statt ɪ, „p3:monant“)
    if (o.ipa && role === 'word' && (/ı/.test(t) || /\p{L}\d|\d\p{L}|\p{L}:\p{L}/u.test(t))) continue;
    out.push({ text: t, conf: toks[i].conf, open: /^[[(|{]/.test(t) });
  }
  // Lautschrift mit verlesener Anfangsklammer: „human hu mn]“, „lingwa frenka)“
  if (o.ipa && role === 'word') {
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i].text;
      if (!(/\]$/.test(t) || (/\)$/.test(t) && !/\(/.test(t)))) continue;
      let k = i; while (k > 0 && !out[k].open && i - k < 3) k--;
      if (out[k].open || k === 0) { if (k === 0 && !out[0].open && i > 0) k = 1; out.splice(k, i - k + 1); }
      else out.splice(Math.max(1, i - 1), i - Math.max(1, i - 1) + 1);
      i = Math.min(i, out.length);
    }
  }
  return out;
}
export function tidy(s) {
  return s.replace(/ı/g, 'i').replace(/^[„“”"'‚‘’»«]+(?=\p{L})/u, '').replace(/\s+/g, ' ').replace(/\s+([,;.!?)])/g, '$1').replace(/([(])\s+/g, '$1')
    .replace(/^[\s,;:|¦\-–—=/]+|[\s,;:|¦\-–—=/]+$/g, '').trim();
}
const join = (a, b) => (!a ? b : !b ? a : /[a-zäöüß]-$/i.test(a) && /^[a-zäöüß]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b);

// Eine Zeile „house – Haus“ in zwei Teile trennen (für Bereiche mit nur einer Spalte)
function splitLine(ws, hMed) {
  const SEP = /^([-–—=:→]|=>|->)$/;
  const k = ws.findIndex((w, i) => i > 0 && i < ws.length - 1 && SEP.test(w.text));
  if (k > 0) return [ws.slice(0, k), ws.slice(k + 1)];
  let gi = -1, g = 0;
  for (let i = 1; i < ws.length; i++) { const d = ws[i].x0 - ws[i - 1].x1; if (d > g) { g = d; gi = i; } }
  if (gi > 0 && g > hMed * 1.4) return [ws.slice(0, gi), ws.slice(gi)];
  return null;
}

// ---------- Hauptfunktion ----------
// words: Wörter mit mi (Index des Rechtecks). marks: Rechtecke {t:'area'|'word'|'trans'|'skip', x0..y1, roles?}
// Gibt { entries, cols } zurück. cols[mi] = Spalten eines Bereichs (mit Rolle).
export function parse(words, marks, o = OPT_DEFAULT, boxes = []) {
  // Wörter in Kästen weglassen (außer der markierte Bereich liegt selbst im Kasten)
  if (o.boxes && boxes.length) words = words.filter((w) => { const m = marks[w.mi]; return !boxes.some((b) => inside(w, b) && !(m.x0 >= b.x0 - 0.01 && m.x1 <= b.x1 + 0.01 && m.y0 >= b.y0 - 0.01 && m.y1 <= b.y1 + 0.01)); });
  const cols = {};
  const groups = [];
  marks.forEach((m, mi) => {
    if (m.t !== 'area') return;
    const ws = words.filter((w) => w.mi === mi);
    const c = findColumns(ws, m);
    const roles = m.roles && m.roles.length === c.length ? m.roles : defaultRoles(ws, c);
    m.roles = roles;
    cols[mi] = c.map((x, k) => ({ ...x, role: roles[k] }));
    groups.push({ key: 'a' + mi, ws: ws.map((w) => ({ ...w, role: roles[colOf(w, c)] })), order: m.y0 * 10 + m.x0 });
  });
  const colWs = words.filter((w) => marks[w.mi] && (marks[w.mi].t === 'word' || marks[w.mi].t === 'trans')).map((w) => ({ ...w, role: marks[w.mi].t }));
  if (colWs.length) groups.push({ key: 'c', ws: colWs, order: Math.min(...colWs.map((w) => w.y0)) * 10 });
  groups.sort((a, b) => a.order - b.order);

  const entries = [];
  const HEAD = /^(theme|unit|topic|focus on|station|part|lesson|chapter|module|skills?|check-?in|story)\b/i;
  const bbox = (ws) => ws.reduce((b, w) => [Math.min(b[0], w.x0), Math.min(b[1], w.y0), Math.max(b[2], w.x1), Math.max(b[3], w.y1)], [1, 1, 0, 0]);
  for (const g of groups) {
    if (!g.ws.length) continue;
    const hMed = median(g.ws.map((w) => w.y1 - w.y0)) || 0.01;
    // Zeilen je Spalte (in einer Spalte sind Zeilen sicher zu trennen)
    const wl = makeLines(g.ws.filter((w) => w.role === 'word'), hMed);
    const tl = makeLines(g.ws.filter((w) => w.role === 'trans'), hMed);
    for (const l of makeLines(g.ws.filter((w) => w.role === 'both'), hMed)) {
      const sp = splitLine(l.ws, hMed);
      if (sp) { wl.push({ cy: l.cy, ws: sp[0] }); tl.push({ cy: l.cy, ws: sp[1] }); } else tl.push({ cy: l.cy, ws: l.ws, loose: true });
    }
    wl.sort((a, b) => a.cy - b.cy); tl.sort((a, b) => a.cy - b.cy);
    // Anker = Zeilen der Vokabel-Spalte; Überschriften erkennen
    let anchors = [], stopY = Infinity;
    for (const l of wl) {
      const ltxt = l.ws.map((w) => w.text).join(' ').replace(/^[^A-Za-z]+/, '');
      const tall = l.ws.filter((w) => w.y1 - w.y0 > hMed * 1.22 && /\p{L}{2}/u.test(w.text)).length;
      const head = l.ws.length <= 7 && (HEAD.test(ltxt) || (tall >= 2 && tall >= l.ws.length * 0.6));
      if (head) { if (o.stop && anchors.length) { stopY = l.cy - hMed * 0.4; break; } continue; }
      const c = cleanTokens(l.ws, o, 'word');
      const txt = tidy(c.map((x) => x.text).join(' '));
      if (txt) anchors.push({ cy: l.cy, word: txt, conf: Math.min(100, ...c.map((x) => x.conf)), ws: [...l.ws], tr: [] });
    }
    if (!anchors.length) {
      // keine Vokabel-Spalte: nur Übersetzungen (z. B. falsche Rollen) → einzeln zeigen
      for (const l of tl) { const c = cleanTokens(l.ws, o, 'trans'); const t = tidy(c.map((x) => x.text).join(' ')); if (t) entries.push({ group: g.key, key: g.key + ':' + Math.round(l.cy * 2000), word: '', trans: t, conf: Math.min(100, ...c.map((x) => x.conf)), box: bbox(l.ws) }); }
      continue;
    }
    // Übersetzungs-Zeilen den Ankern zuordnen; örtliche Höhen-Verschiebung (gebogene Seite) ausgleichen
    const near = (y) => anchors.reduce((b, a) => (Math.abs(a.cy - y) < Math.abs(b.cy - y) ? a : b), anchors[0]);
    const tls = tl.filter((l) => l.cy < stopY);
    const dys = tls.map((l) => l.cy - near(l.cy).cy);
    tls.forEach((l, j) => {
      const idx = tls.map((x, k) => [Math.abs(x.cy - l.cy), k]).sort((a, b) => a[0] - b[0]).slice(0, 7).map((x) => x[1]);
      const off = median(idx.map((k) => dys[k]).filter((d) => Math.abs(d) < hMed * 1.1)) || 0;
      const y = l.cy - off;
      const a = near(y);
      let target = Math.abs(a.cy - y) <= hMed * 0.6 ? a : null;
      if (!target) { const above = anchors.filter((x) => x.cy <= y); target = above[above.length - 1] || null; }
      if (target) target.tr.push(l);
    });
    for (const a of anchors) {
      if (a.cy >= stopY) break;
      a.tr.sort((x, y) => x.cy - y.cy);
      let trans = '', conf = a.conf;
      for (const l of a.tr) {
        const c = cleanTokens(l.ws, o, 'trans');
        trans = join(trans, tidy(c.map((x) => x.text).join(' ')));
        if (c.length) conf = Math.min(conf, ...c.map((x) => x.conf));
        a.ws.push(...l.ws);
      }
      entries.push({ group: g.key, key: g.key + ':' + Math.round(a.cy * 2000), word: a.word, trans, conf, box: bbox(a.ws) });
    }
  }
  for (const e of entries) { e.word = tidy(e.word); e.trans = tidy(e.trans); }
  return { entries, cols };
}

// Änderungen aus der Kontrollliste anwenden: ov = Map key → { word, trans, on, up }
export function applyEdits(entries, ov) {
  const out = [];
  for (const e0 of entries) {
    const o = ov.get(e0.key) || {};
    const e = { ...e0, word: o.word ?? e0.word, trans: o.trans ?? e0.trans };
    const prev = out[out.length - 1];
    if (o.up && prev) {
      prev.word = join(prev.word, e.word); prev.trans = join(prev.trans, e.trans);
      prev.box = [Math.min(prev.box[0], e.box[0]), Math.min(prev.box[1], e.box[1]), Math.max(prev.box[2], e.box[2]), Math.max(prev.box[3], e.box[3])];
      prev.conf = Math.min(prev.conf, e.conf); prev.merged = (prev.merged || []).concat(e.key);
      continue;
    }
    e.complete = !!(e.word && e.trans);
    e.on = o.on ?? e.complete;
    e.unsure = e.conf < 60;
    out.push(e);
  }
  return out;
}
