// „Mehr Aufgaben wie dieses Blatt“: Blatt lesen (auch Handschrift), neue Aufgaben im gleichen Stil machen,
// als neues Arbeitsblatt zum Beschreiben anlegen (plus Lösungsblatt).
// Rechenaufgaben: sicher per Regeln (mathgen.js, Lösungen exakt gerechnet).
// Text-Aufgaben: Bild-KI auf dem Gerät (visionai.js). Ohne KI nur Rechenaufgaben aus der Texterkennung.
import * as db from './db.js';
import { h, icon, toast, busy, sheet } from './ui.js';
import { mathFromText } from './mathgen.js';

const LEVELS = { leichter: 'etwas leichter als auf dem Blatt', gleich: 'genauso schwer wie auf dem Blatt', schwerer: 'etwas schwerer als auf dem Blatt' };
const LETTERS = 'abcdefghijklmnop';

// ---------- KI-Antwort lesen ----------
export function parseTasks(raw) {
  const t = String(raw || '').replace(/\r/g, '').replace(/\*\*/g, '');
  const theme = (t.match(/^\s*THEMA\s*:\s*(.+)$/im) || [])[1] || '';
  const out = [];
  const re = /AUFGABE\s*\d*\s*:\s*([\s\S]*?)\n\s*L(?:Ö|OE|O)SUNG\s*:\s*([\s\S]*?)(?=\n\s*AUFGABE\s*\d*\s*:|\n\s*THEMA\s*:|$)/gi;
  let m;
  while ((m = re.exec(t))) {
    const q = m[1].trim(), a = m[2].trim();
    if (q.length >= 8 && q.length <= 700) out.push({ text: q, solution: a.slice(0, 600), sure: false });
  }
  return { theme: theme.trim(), tasks: out };
}

function taskPrompt(text, n, level, skipMath) {
  return `Das ist ein Arbeitsblatt aus der Schule. Abgeschrieben steht darauf:
"""
${text.slice(0, 3500)}
"""
Erstelle ${n} NEUE Übungsaufgaben im gleichen Stil: gleiches Thema, gleiche Aufgabenarten und Arbeitsaufträge (z. B. „Erkläre“, „Ergänze“, „Ordne zu“), aber mit neuen Beispielen und Inhalten. Schwierigkeit: ${LEVELS[level]}.
${skipMath ? 'Reine Rechenaufgaben nur mit Zahlen lässt du weg, die mache ich selbst.\n' : ''}Schreibe auf Deutsch, für Schüler verständlich. Gib zu jeder Aufgabe eine kurze, richtige Lösung.
Antworte genau in diesem Format und sonst nichts:
THEMA: <Thema des Blatts>
AUFGABE: <Aufgabentext>
LÖSUNG: <Lösung>

AUFGABE: <Aufgabentext>
LÖSUNG: <Lösung>`;
}

// ---------- Arbeitsblatt zeichnen ----------
const W = 1654, H = 2339, M = 130;            // A4 bei 200 dpi
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#1d2433', MUTED = '#6b7385', ACC = '#2f4fd8', LINE = '#c9d0de', GRID = '#dfe5f0';

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    lines.push(cur);
  }
  return lines;
}
function newSheet(title, sub, pageNo) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.fillStyle = ACC; x.fillRect(M, M - 20, 90, 10);
  x.fillStyle = INK; x.font = `700 58px ${FONT}`; x.textBaseline = 'top';
  const tl = wrap(x, title, W - 2 * M - 520);
  tl.slice(0, 2).forEach((l, i) => x.fillText(l, M, M + 10 + i * 68));
  x.font = `400 30px ${FONT}`; x.fillStyle = MUTED;
  const yS = M + 10 + Math.min(2, tl.length) * 68 + 8;
  if (sub) x.fillText(sub, M, yS);
  // Name / Datum
  x.font = `500 28px ${FONT}`; x.fillStyle = MUTED; x.strokeStyle = LINE; x.lineWidth = 2;
  const rx = W - M - 470;
  [['Name', M + 20], ['Datum', M + 90]].forEach(([lbl, yy]) => { x.fillText(lbl, rx, yy); x.beginPath(); x.moveTo(rx + 100, yy + 34); x.lineTo(W - M, yy + 34); x.stroke(); });
  const top = yS + 70;
  x.strokeStyle = LINE; x.beginPath(); x.moveTo(M, top - 24); x.lineTo(W - M, top - 24); x.stroke();
  x.font = `400 24px ${FONT}`; x.fillStyle = MUTED; x.textBaseline = 'alphabetic';
  x.fillText(`Übungsblatt · Seite ${pageNo}`, M, H - 70);
  x.textBaseline = 'top';
  return { c, x, y: top };
}
function grid(x, x0, y0, w, h, step = 39) {
  x.strokeStyle = GRID; x.lineWidth = 1.5; x.beginPath();
  for (let gx = x0; gx <= x0 + w + 0.5; gx += step) { x.moveTo(gx, y0); x.lineTo(gx, y0 + h); }
  for (let gy = y0; gy <= y0 + h + 0.5; gy += step) { x.moveTo(x0, gy); x.lineTo(x0 + w, gy); }
  x.stroke();
}
function ruled(x, x0, y0, w, n, gap = 74) {
  x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath();
  for (let i = 1; i <= n; i++) { x.moveTo(x0, y0 + i * gap); x.lineTo(x0 + w, y0 + i * gap); }
  x.stroke();
  return n * gap + 20;
}

// tasks: [{ text, items?: [{q,a}], solution, sure, math }]
export function renderSheets(tasks, { title, sub = '', solutions = true } = {}) {
  const pages = [];
  let pg = newSheet(title, sub, 1);
  pages.push(pg.c);
  const tx = M + 80, tw = W - M - tx;
  const fits = (need) => pg.y + need <= H - 120;
  const next = () => { pg = newSheet(title, sub, pages.length + 1); pages.push(pg.c); };
  tasks.forEach((t, i) => {
    const x = pg.x;
    x.font = `500 36px ${FONT}`;
    const lines = wrap(x, t.text, tw);
    const textH = lines.length * 50;
    let workH;
    if (t.items && t.items.length) workH = Math.ceil(t.items.length / 2) * 96 + 30;
    else workH = 74 * Math.max(3, Math.min(7, Math.ceil(((t.solution || '').length + 40) / 70))) + 20;
    if (!fits(textH + Math.min(workH, 400) + 40) && pg.y > 400) next();
    const X = pg.x;
    // Nummer
    X.fillStyle = ACC; X.beginPath(); X.arc(M + 26, pg.y + 24, 26, 0, Math.PI * 2); X.fill();
    X.fillStyle = '#fff'; X.font = `700 30px ${FONT}`; X.textAlign = 'center'; X.fillText(String(i + 1), M + 26, pg.y + 8); X.textAlign = 'left';
    X.fillStyle = INK; X.font = `500 36px ${FONT}`;
    lines.forEach((l, k) => X.fillText(l, tx, pg.y + 4 + k * 50));
    pg.y += textH + 22;
    if (t.items && t.items.length) {
      const rows = Math.ceil(t.items.length / 2), colW = tw / 2;
      if (!fits(rows * 96 + 30)) next();
      grid(pg.x, tx, pg.y, tw, Math.floor((rows * 96 + 20) / 39) * 39);
      pg.x.font = `500 38px ${FONT}`; pg.x.fillStyle = INK;
      t.items.forEach((it, k) => {
        const cx = tx + 18 + (k % 2) * colW, cy = pg.y + 20 + Math.floor(k / 2) * 96;
        pg.x.fillStyle = ACC; pg.x.fillText(LETTERS[k] + ')', cx, cy);
        pg.x.fillStyle = INK; pg.x.fillText(it.q, cx + 52, cy);
      });
      pg.y += rows * 96 + 50;
    } else {
      const n = Math.max(3, Math.min(7, Math.ceil(((t.solution || '').length + 40) / 70)));
      if (!fits(n * 74 + 20)) next();
      pg.y += ruled(pg.x, tx, pg.y - 20, tw, n) + 20;
    }
  });
  if (solutions) {
    let sp = newSheet('Lösungen: ' + title, sub, pages.length + 1);
    pages.push(sp.c);
    tasks.forEach((t, i) => {
      const x = sp.x;
      const sol = t.items && t.items.length ? t.items.map((it, k) => `${LETTERS[k]}) ${it.a}`).join('  ·  ') : t.solution || '–';
      x.font = `400 32px ${FONT}`;
      const lines = wrap(x, sol, tw);
      const need = lines.length * 44 + 70;
      if (sp.y + need > H - 120) { sp = newSheet('Lösungen: ' + title, sub, pages.length + 1); pages.push(sp.c); }
      const X = sp.x;
      X.fillStyle = ACC; X.font = `700 32px ${FONT}`; X.fillText(`${i + 1}.`, M, sp.y);
      X.fillStyle = t.sure ? '#2f8f5b' : '#b7791f'; X.font = `600 22px ${FONT}`;
      X.fillText(t.sure ? 'GERECHNET' : 'KI – BITTE PRÜFEN', tx, sp.y + 4);
      X.fillStyle = INK; X.font = `400 32px ${FONT}`;
      lines.forEach((l, k) => X.fillText(l, tx, sp.y + 40 + k * 44));
      sp.y += need;
    });
  }
  return pages;
}

// ---------- Prüf-Ansicht ----------
async function reviewTasks(tasks, theme) {
  return sheet(`Neue Aufgaben (${tasks.length})`, (body, close) => {
    const titleIn = h('input.field', { type: 'text', value: theme ? `Übung: ${theme}` : 'Übungsblatt', autocomplete: 'off', 'aria-label': 'Titel des Blatts' });
    const list = h('div.mclist');
    const count = h('span');
    const go = h('button.btn.primary', null, icon('page'), count);
    let sol = true;
    const upd = () => { const n = tasks.filter((t) => t.on).length; count.textContent = n ? `Blatt mit ${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'} anlegen` : 'Nichts ausgewählt'; go.disabled = !n; };
    tasks.forEach((t) => {
      const q = h('textarea.field.mcf', { rows: Math.min(8, (t.text.match(/\n/g) || []).length + 2), 'aria-label': 'Aufgabe' }); q.value = t.text;
      const a = h('textarea.field.mcb', { rows: Math.min(6, Math.max(2, Math.ceil((t.solution || '').length / 40))), 'aria-label': 'Lösung' }); a.value = t.solution || '';
      if (t.items) { q.readOnly = true; a.readOnly = true; }
      const row = h('div.mcrow' + (t.on ? '' : '.off'), null,
        h('button.hwcheck', { 'aria-label': 'Aufgabe verwenden', 'aria-pressed': String(t.on), on: { click: (e) => { t.on = !t.on; row.classList.toggle('off', !t.on); e.currentTarget.setAttribute('aria-pressed', String(t.on)); upd(); } } }, icon('select')),
        h('div.mcfields', null,
          h('em.mckind' + (t.sure ? '.sure' : ''), { text: t.sure ? 'Rechnen · Lösung gerechnet' : 'KI · Lösung prüfen' }),
          h('label', null, h('small', { text: 'Aufgabe' }), q),
          h('label', null, h('small', { text: 'Lösung' }), a)));
      q.addEventListener('input', () => { t.text = q.value; });
      a.addEventListener('input', () => { t.solution = a.value; });
      list.append(row);
    });
    const solBtn = h('button.hwcheck', { 'aria-pressed': 'true', 'aria-label': 'Lösungsblatt anhängen', on: { click: (e) => { sol = !sol; e.currentTarget.setAttribute('aria-pressed', String(sol)); } } }, icon('select'));
    go.addEventListener('click', () => close({ title: titleIn.value.trim() || 'Übungsblatt', solutions: sol }));
    body.classList.add('mcbody');
    body.append(
      h('p.dlgtext', { text: 'Rechenaufgaben sind sicher gerechnet. Bei KI-Aufgaben kann die Lösung falsch sein, prüf sie kurz. Das Blatt kommt hinten ins Buch, zum Beschreiben mit dem Stift.' }),
      list,
      h('label.fieldlabel', { text: 'Titel des Blatts' }), titleIn,
      h('div.mwsol', null, solBtn, h('span', { text: 'Lösungsblatt als eigene Seite anhängen' })),
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), go));
    upd();
  }, { wide: true });
}

// ---------- Ablauf ----------
export async function moreTasksFlow(pages, { title = '', after = null } = {}) {
  pages = (pages || []).filter(Boolean);
  if (!pages.length) { toast('Keine Seite ausgewählt.'); return; }
  if (pages.length > 3) { toast('Höchstens 3 Seiten auf einmal. Wähle das Arbeitsblatt aus.', 4500); return; }
  const { aiSupport } = await import('./localai.js');
  const V = await import('./visionai.js');
  const sup = await aiSupport();
  const have = sup.ok && await V.visionDownloaded();

  const opts = await sheet('Neue Aufgaben wie dieses Blatt', (body, close) => {
    let n = 6, level = 'gleich';
    const seg = (vals, cur, set) => {
      const wrap = h('div.seg');
      vals.forEach(([v, l]) => { const b = h('button.segbtn' + (v === cur ? '.on' : ''), { text: l, on: { click: () => { set(v); wrap.querySelectorAll('.segbtn').forEach((x) => x.classList.toggle('on', x === b)); } } }); wrap.append(b); });
      return wrap;
    };
    const opt = (key, ic, b, small, dis) => h('button.acopt' + (dis ? '.off' : ''), { disabled: !!dis, on: { click: () => close({ mode: key, n, level }) } }, icon(ic), h('span', null, h('b', { text: b }), h('small', { text: small })));
    body.append(
      h('p.dlgtext', { text: 'Die App liest das Blatt und macht neue Aufgaben im gleichen Stil. Rechenaufgaben werden sicher gerechnet, für Text-Aufgaben braucht es die Bild-KI.' }),
      h('label.fieldlabel', { text: 'Wie viele Aufgaben?' }), seg([[4, '4'], [6, '6'], [8, '8'], [10, '10']], n, (v) => { n = v; }),
      h('label.fieldlabel', { text: 'Schwierigkeit' }), seg([['leichter', 'Leichter'], ['gleich', 'Gleich'], ['schwerer', 'Schwerer']], level, (v) => { level = v; }),
      h('div.aclist', null,
        sup.ok
          ? opt('ai', 'bolt', have ? 'Mit Bild-KI' : `Bild-KI herunterladen (${V.VSIZE})`, have ? 'Liest auch Handschrift, macht Text- und Rechenaufgaben. Auf dem Gerät, offline, kostenlos. Dauert ein paar Minuten.' : 'Einmalig, am besten im WLAN. Danach offline und kostenlos.', !have && navigator.onLine === false)
          : opt('nogpu', 'bolt', 'Bild-KI geht hier nicht', sup.why, true),
        opt('rules', 'calc', 'Nur Rechenaufgaben (ohne KI)', 'Schnell. Erkennt gedruckte Rechnungen und Gleichungen, neue Zahlen, Lösungen exakt gerechnet.')),
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } })));
  });
  if (!opts || opts.mode === 'nogpu') return;

  const setT = (t) => { const b = document.getElementById('busyText'); if (b) b.textContent = t; };
  let text = '', theme = '', aiTasks = [];
  const useAi = opts.mode === 'ai';
  busy(true, useAi ? (have ? 'Bild-KI wird gestartet …' : 'Bild-KI wird heruntergeladen …') : 'Text wird erkannt …');
  try {
    if (useAi) {
      const imgs = [];
      for (let i = 0; i < pages.length; i++) {
        const img = await V.pageImage(pages[i]);
        imgs.push(img);
        setT(`KI liest Seite ${i + 1} von ${pages.length} …`);
        const t = await V.readPage(img, setT);
        text += (text ? '\n\n' : '') + t;
        // Für Suche merken (Handschrift)
        try { await db.updatePage(pages[i].id, { aiText: t, aiAt: Date.now() }); } catch (e) { /* egal */ }
      }
      const math = mathFromText(text, { level: opts.level });
      const want = Math.max(2, opts.n - math.length);
      setT('KI schreibt neue Aufgaben …');
      const raw = await V.ask(imgs[0], taskPrompt(text, want, opts.level, math.length > 0), { maxTokens: 1500, temperature: 0.5, onProgress: setT });
      const p = parseTasks(raw);
      theme = p.theme; aiTasks = p.tasks.slice(0, want);
    } else {
      const todo = pages.filter((p) => p.kind !== 'blank' && p.ocr == null);
      if (todo.length) { const { ocrPages } = await import('./ocr.js'); await ocrPages(todo, setT); }
      text = pages.map((p) => [p.ocr, p.textBoxes].filter(Boolean).join('\n')).join('\n\n');
    }
  } catch (err) {
    busy(false);
    await V.unloadVision();
    const mem = /memory|OOM|alloc|device.*lost/i.test(err.message || '');
    const net = /fetch|network|load failed/i.test(err.message || '');
    toast(mem ? 'Für die Bild-KI reicht der Arbeitsspeicher nicht. Schließ andere Apps und versuch es nochmal.' : net && !have ? 'Die Bild-KI ließ sich nicht herunterladen. Bist du im Internet?' : 'Hat nicht geklappt: ' + err.message, 7000);
    if (!useAi) return;
    // Rechenaufgaben gehen vielleicht trotzdem
    const todo = pages.filter((p) => p.kind !== 'blank' && p.ocr == null);
    try { if (todo.length) { const { ocrPages } = await import('./ocr.js'); await ocrPages(todo, () => {}); } } catch (e) { /* egal */ }
    text = pages.map((p) => [p.ocr, p.textBoxes].filter(Boolean).join('\n')).join('\n\n');
  }
  busy(false);
  await V.unloadVision();

  const math = mathFromText(text, { level: opts.level });
  const tasks = [
    ...math.map((g) => ({ text: g.title + '\n' + g.items.map((it, k) => `${LETTERS[k]}) ${it.q}`).join('   '), items: g.items, solution: g.items.map((it, k) => `${LETTERS[k]}) ${it.a}`).join('  ·  '), sure: true, on: true })),
    ...aiTasks.map((t) => ({ ...t, on: true })),
  ].slice(0, Math.max(opts.n, math.length));
  // Rechen-Aufgaben: Titel im Blatt ohne Unterpunkte (die zeichnet renderSheets selbst)
  if (!tasks.length) {
    toast(useAi ? 'Die KI hat keine brauchbaren Aufgaben geliefert. Versuch es nochmal oder mit einem anderen Blatt.' : 'Keine Rechenaufgaben erkannt. Für andere Aufgaben und Handschrift nimm die Bild-KI.', 6500);
    return;
  }
  const res = await reviewTasks(tasks, theme);
  if (!res) return;
  const chosen = tasks.filter((t) => t.on).map((t) => (t.items ? { ...t, text: t.text.split('\n')[0] } : t));
  busy(true, 'Arbeitsblatt wird angelegt …');
  try {
    const { compress, makeThumb } = await import('./scanner.js');
    const canv = renderSheets(chosen, { title: res.title, sub: title ? `Zu: ${title}` : '', solutions: res.solutions });
    const bookId = pages[0].bookId;
    let first = null;
    for (const c of canv) {
      const out = await compress(c, 700 * 1024);
      const p = await db.addPage({ bookId, image: out.blob, thumb: await makeThumb(c), width: out.width, height: out.height });
      first ||= p;
    }
    busy(false);
    toast(`Neues Übungsblatt angelegt (${canv.length} ${canv.length === 1 ? 'Seite' : 'Seiten'}, hinten im ${title ? '„' + title + '“' : 'Buch'}).`, 4500);
    if (after) after(first);
  } catch (err) { busy(false); toast('Blatt anlegen hat nicht geklappt: ' + err.message, 6000); }
}

// ---------- Seite abschreiben (Handschrift lesen) ----------
export async function transcribeFlow(page) {
  const { aiSupport } = await import('./localai.js');
  const V = await import('./visionai.js');
  const sup = await aiSupport();
  if (!sup.ok) { toast(sup.why, 6000); return; }
  const have = await V.visionDownloaded();
  if (!have) {
    const ok = await sheet('Bild-KI herunterladen?', (body, close) => body.append(
      h('p.dlgtext', { text: `Zum Lesen von Handschrift braucht die App einmal die Bild-KI (${V.VSIZE}). Am besten im WLAN. Danach geht es offline und kostenlos, und die Seiten bleiben auf dem Gerät.` }),
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(false) } }), h('button.btn.primary', { text: 'Herunterladen', on: { click: () => close(true) } }))));
    if (!ok) return;
  }
  busy(true, have ? 'Bild-KI wird gestartet …' : 'Bild-KI wird heruntergeladen …');
  let text = '';
  try {
    const img = await V.pageImage(page);
    text = await V.readPage(img, (t) => { const b = document.getElementById('busyText'); if (b) b.textContent = t; });
  } catch (err) { busy(false); await V.unloadVision(); toast('Lesen hat nicht geklappt: ' + err.message, 6000); return; }
  busy(false);
  await V.unloadVision();
  await db.updatePage(page.id, { aiText: text, aiAt: Date.now() });
  page.aiText = text;
  await sheet('Seite abgeschrieben', (body, close) => {
    const ta = h('textarea.field.mwtext', { rows: 14 }); ta.value = text;
    body.append(
      h('p.dlgtext', { text: 'Das hat die KI gelesen. Unsichere Stellen sind mit [?] markiert. Der Text ist jetzt auch in der Suche zu finden.' }),
      ta,
      h('div.dlgactions', null,
        h('button.btn', { text: 'Kopieren', on: { click: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Kopiert.'); } catch (e) { ta.select(); toast('Markiert. Jetzt kopieren.'); } } } }),
        h('button.btn.primary', { text: 'Fertig', on: { click: async () => { if (ta.value !== text) await db.updatePage(page.id, { aiText: ta.value }); close(true); } } })));
  }, { wide: true });
}
