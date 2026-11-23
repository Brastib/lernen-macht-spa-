// Lücken auf Arbeitsblättern finden: waagerechte Schreiblinien (____ oder ……) mit freiem Platz darüber.
// Läuft lokal auf dem Seitenbild, ohne Texterkennung. Ergebnis in Seiten-Einheiten (Seite ist pageW breit).

const A = 1000;   // Arbeitsbreite in Pixeln

export function detectGaps(img, pageW) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return [];
  const w = A, h = Math.round(ih * A / iw);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const dark = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < dark.length; i += 4, j++) dark[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) < 170 ? 1 : 0;

  // 1) waagerechte Läufe je Zeile (kleine Lücken erlaubt, damit auch gepunktete Linien zählen)
  const MINLEN = 40, MAXGAP = 7;
  const runs = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1, last = -1, on = 0;
    for (let xx = 0; xx <= w; xx++) {
      const v = xx < w && dark[y * w + xx];
      if (v) {
        if (x0 < 0) { x0 = xx; on = 0; }
        else if (xx - last > MAXGAP) { if (last - x0 >= MINLEN && on / (last - x0 + 1) > 0.3) runs.push({ y, x0, x1: last }); x0 = xx; on = 0; }
        last = xx; on++;
      } else if (x0 >= 0 && (xx === w || xx - last > MAXGAP)) {
        if (last - x0 >= MINLEN && on / (last - x0 + 1) > 0.3) runs.push({ y, x0, x1: last });
        x0 = -1;
      }
    }
  }
  // 2) Läufe untereinander zu Linien zusammenfassen (Linien sind dünn)
  const lines = [];
  for (const r of runs) {
    const l = lines.find((L) => r.y - L.yb <= 1 && r.x0 < L.x1 && r.x1 > L.x0);
    if (l) { l.yb = r.y; l.x0 = Math.min(l.x0, r.x0); l.x1 = Math.max(l.x1, r.x1); l.n++; }
    else lines.push({ yt: r.y, yb: r.y, x0: r.x0, x1: r.x1, n: 1 });
  }
  const ratio = (x0, x1, y0, y1) => {
    let s = 0, n = 0;
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let xx = Math.max(0, x0); xx < Math.min(w, x1); xx++) { s += dark[y * w + xx]; n++; }
    return n ? s / n : 1;
  };
  const gaps = [];
  for (const L of lines) {
    const th = L.yb - L.yt + 1;
    if (th > 6) continue;                                   // dicker Balken, keine Schreiblinie
    const pad = 3;
    // Platz darüber muss frei sein (sonst ist es eine Unterstreichung oder Tabellen-Text)
    if (ratio(L.x0 + pad, L.x1 - pad, L.yt - 20, L.yt - 3) > 0.02) continue;
    // direkt darunter ebenfalls frei (sonst ist es die Oberkante von Buchstaben)
    if (ratio(L.x0 + pad, L.x1 - pad, L.yb + 3, L.yb + 11) > 0.06) continue;
    // freie Höhe nach oben messen
    let up = 3;
    while (up < 70 && L.yt - up - 1 > 0 && ratio(L.x0 + pad, L.x1 - pad, L.yt - up - 2, L.yt - up) < 0.03) up += 2;
    if (up < 16) continue;
    gaps.push({ x0: L.x0, x1: L.x1, y: (L.yt + L.yb) / 2, up });
  }
  // Dopplungen (zwei Kanten derselben Linie) entfernen
  gaps.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const out = [];
  for (const g of gaps) {
    if (out.some((o) => Math.abs(o.y - g.y) < 8 && g.x0 < o.x1 && g.x1 > o.x0)) continue;
    out.push(g);
  }
  const k = pageW / w;
  return out.map((g) => ({ x0: g.x0 * k, x1: g.x1 * k, y: g.y * k, avail: Math.min(g.up, 60) * k }));
}

// Text-Größe und Lage, damit die Schrift auf der Linie sitzt (Textfeld: Grundlinie = Mitte + 0,36 × Größe)
export function textForGap(g, lineHeight) {
  const size = Math.round(Math.max(11, Math.min(22, g.avail * 0.55)));
  const lh = lineHeight(size);
  const top = g.y - 2 - 0.36 * size - lh / 2;
  return { size, lh, x: g.x0 + 3, y: top };
}

// Handschrift auf die Linie setzen: Grundlinie = Median der unteren Strichenden
export function baselineShift(list, g) {
  if (!list.length) return 0;
  const bottoms = list.map((s) => { let m = -Infinity; for (let i = 1; i < s.pts.length; i += 3) if (s.pts[i] > m) m = s.pts[i]; return m; }).sort((a, b) => a - b);
  const base = bottoms[Math.floor((bottoms.length - 1) / 2)];
  const dy = g.y - 2.5 - base;
  return Math.abs(dy) < 1 || Math.abs(dy) > g.avail * 1.2 ? 0 : dy;
}

export function gapAt(gaps, x, y, slack = 8) {
  let best = null, bd = Infinity;
  for (const g of gaps) {
    if (x < g.x0 - slack || x > g.x1 + slack) continue;
    if (y < g.y - g.avail - slack || y > g.y + slack * 1.6) continue;
    const dd = Math.abs(y - (g.y - g.avail / 2));
    if (dd < bd) { bd = dd; best = g; }
  }
  return best;
}
