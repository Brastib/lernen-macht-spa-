// Noten-Rechner: Übersicht aller Fächer, Fach-Details mit Verlauf, Ziel-Rechner und „Was wäre wenn“.
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, menu, confirmSheet } from './ui.js';
import { NOTEN, fmt1, tone, gradeLabel, gradeCfg, avgParts, catOf, writtenFor, editGrade, daysUntil, countdownText, editExam } from './school.js';

const SVG = 'http://www.w3.org/2000/svg';
const s$ = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const pts = (cfg) => cfg.scale === 'punkte';
const fmtAvg = (v, cfg) => (v == null ? '–' : pts(cfg) ? v.toFixed(1).replace('.', ',') : fmt1(v));
const CAT_LABEL = { schriftlich: 'Schriftlich', muendlich: 'Mündlich', praesi: 'Präsentation' };
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y.slice(2)}`; };

// ---------- Zeitraum (Halbjahr / Schuljahr / alles) ----------
function periodRange(p, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();      // Schuljahr ab 1. August, 2. Halbjahr ab 1. Februar
  const syStart = m >= 7 ? y : y - 1;
  if (p === 'all') return null;
  if (p === 'sj') return [`${syStart}-08-01`, `${syStart + 1}-08-01`];
  return m >= 7 || m === 0 ? [`${syStart}-08-01`, `${syStart + 1}-02-01`] : [`${syStart + 1}-02-01`, `${syStart + 1}-08-01`];
}
const PERIODS = [['hj', 'Halbjahr'], ['sj', 'Schuljahr'], ['all', 'Alles']];
function inPeriod(g, cfg) { const r = periodRange(cfg.period || 'hj'); return !r || !g.date || (g.date >= r[0] && g.date < r[1]); }

// ---------- Zeugnisnote (gerundet) ----------
export function reportNote(avg, cfg) {
  if (avg == null) return null;
  if (pts(cfg)) { const f = avg - Math.floor(avg); const lo = Math.max(0, Math.min(15, Math.floor(avg))); return Math.abs(f - 0.5) < 0.05 ? `${lo} oder ${lo + 1}` : String(Math.max(0, Math.min(15, Math.round(avg)))); }
  const lo = Math.floor(avg), f = avg - lo;
  if (Math.abs(f - 0.5) < 0.05 && lo >= 1 && lo < 6) return `${lo} oder ${lo + 1}`;
  return String(Math.max(1, Math.min(6, Math.round(avg))));
}
// steht im Zeugnis auf 5 oder schlechter?
const atRisk = (avg, cfg) => avg != null && (pts(cfg) ? avg < 3.5 : avg >= 4.5);

// ---------- Ziel-Rechner ----------
const OPTIONS = (cfg) => (pts(cfg) ? Array.from({ length: 16 }, (_, i) => [String(15 - i), 15 - i]) : NOTEN);   // beste zuerst
const TARGETS = (cfg) => (pts(cfg) ? [[13, '1 · ab 13 P.'], [10, '2 · ab 10 P.'], [7, '3 · ab 7 P.'], [4, '4 · ab 4 P.']] : [[1, 'Note 1'], [2, 'Note 2'], [3, 'Note 3'], [4, 'Note 4']]);
const reaches = (avg, target, cfg) => avg != null && (pts(cfg) ? avg >= target - 0.5 : avg < target + 0.5);
export function whatIf(grades, cfg, sid, extra) { return avgParts([...grades, extra], cfg, sid).avg; }
export function needed(grades, cfg, sid, { target, cat, weight }) {
  const opts = OPTIONS(cfg);
  const res = opts.map(([l, v]) => ({ l, v, avg: whatIf(grades, cfg, sid, { value: v, cat, weight }) }));
  const ok = res.filter((r) => reaches(r.avg, target, cfg));
  if (!ok.length) return { kind: 'no', best: res[0], res };
  const worst = ok[ok.length - 1];
  if (worst === res[res.length - 1]) return { kind: 'safe', min: worst, res };
  return { kind: 'need', min: worst, res };
}

// ---------- kleine Grafiken ----------
function yOf(v, cfg, top, bottom) { const t = pts(cfg) ? (15 - v) / 15 : (v - 0.7) / 5.3; return top + t * (bottom - top); }
function sparkline(g, cfg) {
  const W = 120, H = 34, list = [...g].filter((x) => x.value != null).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const svg = s$('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ngspark', 'aria-hidden': 'true' });
  if (list.length < 2) return svg;
  const xs = (i) => 4 + i * (W - 8) / (list.length - 1);
  svg.append(s$('polyline', { points: list.map((x, i) => `${xs(i).toFixed(1)},${yOf(x.value, cfg, 4, H - 4).toFixed(1)}`).join(' '), class: 'ngline' }));
  const last = list[list.length - 1];
  svg.append(s$('circle', { cx: xs(list.length - 1), cy: yOf(last.value, cfg, 4, H - 4), r: 3, class: 'ngdot ' + tone(last.value, cfg.scale) }));
  return svg;
}
function trendChart(g, cfg, sid) {
  const list = [...g].filter((x) => x.value != null).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const W = Math.round(Math.max(280, Math.min(1100, ($('view').clientWidth || 640) - 40))), H = W < 500 ? 160 : 200, L = 34, R = 12, T = 14, B = 30;
  const svg = s$('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ngchart', role: 'img', 'aria-label': 'Notenverlauf' });
  const ticks = pts(cfg) ? [15, 12, 9, 6, 3, 0] : [1, 2, 3, 4, 5, 6];
  for (const t of ticks) {
    const y = yOf(t, cfg, T, H - B);
    svg.append(s$('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'nggrid' }));
    const tx = s$('text', { x: L - 10, y: y + 4, class: 'ngtick', 'text-anchor': 'end' }); tx.textContent = String(t); svg.append(tx);
  }
  const xs = (i) => (list.length === 1 ? (L + W - R) / 2 : L + 12 + i * (W - R - L - 24) / (list.length - 1));
  // laufender Schnitt
  const run = list.map((_, i) => avgParts(list.slice(0, i + 1), cfg, sid).avg);
  if (list.length > 1) svg.append(s$('polyline', { points: run.map((v, i) => `${xs(i).toFixed(1)},${yOf(v, cfg, T, H - B).toFixed(1)}`).join(' '), class: 'ngrun' }));
  list.forEach((x, i) => {
    const cx = xs(i), cy = yOf(x.value, cfg, T, H - B), oral = catOf(x, cfg) === 'muendlich';
    svg.append(s$('circle', { cx, cy, r: 6, class: 'ngpt ' + tone(x.value, cfg.scale) + (oral ? ' oral' : '') }));
    if (list.length <= Math.floor(W / 56)) { const tx = s$('text', { x: cx, y: H - 10, class: 'ngtick', 'text-anchor': 'middle' }); tx.textContent = x.date ? fmtDate(x.date).slice(0, -3) : '·'; svg.append(tx); }
  });
  return svg;
}

function segmented(items, cur, onPick, cls = '') {
  const seg = h('div.seg' + cls, { role: 'tablist' });
  for (const [v, l] of items) seg.append(h('button' + (String(v) === String(cur) ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(String(v) === String(cur)), text: l, on: { click: () => onPick(v) } }));
  return seg;
}

async function settingsMenu(e, cfg, grades, again) {
  menu(e.currentTarget, [
    { label: pts(cfg) ? 'Auf Noten 1–6 umstellen' : 'Auf Punkte 0–15 umstellen', icon: 'list', onClick: async () => {
      if (grades.length && !(await confirmSheet('Skala wechseln?', 'Schon eingetragene Noten werden nicht umgerechnet. Am besten nur am Anfang wechseln.', 'Wechseln', false))) return;
      cfg.scale = pts(cfg) ? 'noten' : 'punkte'; await db.putItems('meta', cfg); again(); } },
    { label: `Gewichtung: schriftlich ${cfg.written} % …`, icon: 'sliders', onClick: async () => {
      const v = await weightSheet('Gewichtung für alle Fächer', cfg.written, null);
      if (v != null) { cfg.written = v; await db.putItems('meta', cfg); again(); } } },
    { label: `Präsentationen zählen ${cfg.pres === 'schriftlich' ? 'schriftlich' : 'mündlich'} …`, icon: 'speak', onClick: async () => {
      const v = await sheet('Präsentationen zählen …', (body, close) => {
        body.append(h('p.dlgtext', { text: 'Je nach Schule und Fach ersetzt eine Präsentation eine Arbeit oder zählt zur mündlichen Note. Frag im Zweifel deine Lehrkraft.' }),
          h('div.dlgactions', null, h('button.btn', { text: 'Mündlich', on: { click: () => close('muendlich') } }), h('button.btn.primary', { text: 'Schriftlich', on: { click: () => close('schriftlich') } })));
      });
      if (v) { cfg.pres = v; await db.putItems('meta', cfg); again(); } } },
  ]);
}
function weightSheet(title, cur, std) {
  return sheet(title, (body, close) => {
    let val = cur;
    const out = h('b.ngwval');
    const bar = h('div.ngwbar', null, h('span.ngws'), h('span.ngwm'));
    const range = h('input.ngrange', { type: 'range', min: '0', max: '100', step: '5', value: String(cur), 'aria-label': 'Anteil schriftlich' });
    const show = () => { out.textContent = `Schriftlich ${val} % · mündlich ${100 - val} %`; bar.style.setProperty('--w', val + '%'); };
    range.addEventListener('input', () => { val = +range.value; show(); });
    const quick = h('div.ngquick', null, ...[40, 50, 60, 67, 70].map((n) => h('button.btn.small', { text: `${n} : ${100 - n}`, on: { click: () => { val = n; range.value = String(n); show(); } } })));
    show();
    body.append(h('p.dlgtext', { text: 'Wie stark zählen Arbeiten im Vergleich zur mündlichen Note? Frag im Zweifel deine Lehrkraft, oft ist es 50 zu 50.' }), out, bar, range, quick,
      h('div.dlgactions', null,
        std != null ? h('button.btn', { text: `Standard (${std} %)`, on: { click: () => close('std') } }) : null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => close(val) } })));
  });
}

// ================= Übersicht =================
export async function renderGrades(ctx) {
  const [all, subjects, cfg, exams] = await Promise.all([db.listGrades(), db.listSubjects(), gradeCfg(), db.listExams()]);
  const again = () => renderGrades(ctx);
  const grades = all.filter((g) => inPeriod(g, cfg));
  const per = subjects.map((s) => { const g = grades.filter((x) => x.subjectId === s.id && x.value != null); return { s, g, avg: avgParts(g, cfg, s.id).avg }; });
  const withAvg = per.filter((x) => x.avg != null);
  const total = withAvg.length ? withAvg.reduce((a, x) => a + x.avg, 0) / withAvg.length : null;
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Noten',
    meta: total != null ? `Gesamtschnitt ${fmtAvg(total, cfg)}${pts(cfg) ? ' Punkte' : ''}` : 'Noch keine Noten',
    actions: [ctx.iconBtn('more', 'Einstellungen', (e) => settingsMenu(e, cfg, all, again)),
      ctx.btn('Note', 'plus', () => subjects.length ? editGrade({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  if (!subjects.length) { view.append(h('p.calm', { text: 'Leg zuerst deine Fächer an.' })); return; }

  // Kopf: Gesamtschnitt, Zeitraum, Kennzahlen
  const sorted = [...withAvg].sort((a, b) => (pts(cfg) ? b.avg - a.avg : a.avg - b.avg));
  const risk = withAvg.filter((x) => atRisk(x.avg, cfg));
  const stat = (k, v, cls = '') => h('div.ngstat' + cls, null, h('small', { text: k }), h('b', { text: v }));
  view.append(h('section.nghero', null,
    h('div.ngherotop', null,
      h('div.ngbig', null, h('small', { text: 'Gesamtschnitt' }), h('b' + (total != null ? '.' + tone(total, cfg.scale) : ''), { text: fmtAvg(total, cfg) }),
        h('span', { text: withAvg.length ? `aus ${plural(withAvg.length, 'Fach', 'Fächern')} · ${plural(grades.length, 'Note', 'Noten')}` : 'Trag deine erste Note ein' })),
      segmented(PERIODS, cfg.period || 'hj', async (v) => { cfg.period = v; await db.putItems('meta', cfg); again(); }, '.ngperiod')),
    h('div.ngstats', null,
      stat('Bestes Fach', sorted.length ? `${sorted[0].s.name} · ${fmtAvg(sorted[0].avg, cfg)}` : '–'),
      stat('Wackelt (Zeugnis 5 oder 6)', risk.length ? risk.map((x) => x.s.name).join(', ') : 'Kein Fach', risk.length ? '.bad' : '.good'),
      stat('Gewichtung', `${cfg.written} : ${100 - cfg.written}`))));

  const upcoming = exams.filter((x) => daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const grid = h('div.ngrid');
  for (const p of per) {
    const { s, g, avg } = p;
    const chips = h('div.ngchips');
    for (const x of [...g].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
      chips.append(h('button.ngchip.' + tone(x.value, cfg.scale) + (catOf(x, cfg) === 'muendlich' ? '.oral' : '') + (x.cat === 'praesi' ? '.praesi' : ''),
        { title: [x.label, CAT_LABEL[x.cat] || ''].filter(Boolean).join(' · '), on: { click: () => editGrade(x, { subjects, after: again }) } }, gradeLabel(x.value, cfg.scale)));
    }
    chips.append(h('button.ngchip.add', { 'aria-label': `Note in ${s.name} eintragen`, on: { click: () => editGrade({ subjectId: s.id }, { subjects, after: again }) } }, icon('plus')));
    const next = upcoming.find((x) => x.subjectId === s.id);
    const zeug = reportNote(avg, cfg);
    grid.append(h('article.ngcard', { style: { '--c': s.color } },
      h('button.ngcardhead', { on: { click: () => ctx.go({ view: 'gradesubj', subjectId: s.id }) } },
        h('span.ngname', null, h('b', { text: s.name }), h('small', { text: avg == null ? 'Noch keine Noten' : `Zeugnis ca. ${zeug}${writtenFor(cfg, s.id) !== cfg.written ? ` · ${writtenFor(cfg, s.id)} : ${100 - writtenFor(cfg, s.id)}` : ''}` })),
        sparkline(g, cfg),
        h('span.ngavg' + (avg != null ? '.' + tone(avg, cfg.scale) : ''), { text: fmtAvg(avg, cfg) })),
      chips,
      h('div.ngcardfoot', null,
        next ? h('small.ngnext', { text: `${next.kind} ${countdownText(daysUntil(next.date))}` })
          : h('small', { text: g.length ? `${g.filter((x) => catOf(x, cfg) === 'schriftlich').length} schriftlich · ${g.filter((x) => catOf(x, cfg) === 'muendlich').length} mündlich` : 'Tippe auf +' }),
        h('button.ngmore', { on: { click: () => ctx.go({ view: 'gradesubj', subjectId: s.id }) } }, h('span', { text: 'Ziel-Rechner' }), icon('chev')))));
  }
  view.append(grid, h('p.calm.small', { text: `Standard: schriftlich ${cfg.written} % + mündlich ${100 - cfg.written} %, pro Fach änderbar. Mündliche Noten haben einen gestrichelten Rand. Das ist eine Schätzung, deine Lehrkraft kann anders rechnen.` }));
}

// ================= Fach-Details =================
export async function renderGradeSubject(ctx, subjectId, state = {}) {
  const [all, subjects, cfg, exams] = await Promise.all([db.listGrades(), db.listSubjects(), gradeCfg(), db.listExams()]);
  const s = subjects.find((x) => x.id === subjectId);
  if (!s) return ctx.go({ view: 'grades' });
  const again = (st = state) => renderGradeSubject(ctx, subjectId, st);
  const g = all.filter((x) => x.subjectId === s.id && x.value != null && inPeriod(x, cfg)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const P = avgParts(g, cfg, s.id);
  const upcoming = exams.filter((x) => x.subjectId === s.id && daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const stdW = cfg.written;
  ctx.setHeader({
    back: { label: 'Noten', go: () => ctx.go({ view: 'grades' }) },
    eyebrow: 'Noten', title: s.name,
    meta: P.avg != null ? `Schnitt ${fmtAvg(P.avg, cfg)} · Zeugnis ca. ${reportNote(P.avg, cfg)}` : 'Noch keine Noten',
    actions: [ctx.btn('Gewichtung', 'sliders', async () => {
      const v = await weightSheet(`Gewichtung in ${s.name}`, writtenFor(cfg, s.id), stdW);
      if (v == null) return;
      cfg.subj = cfg.subj || {};
      if (v === 'std') delete cfg.subj[s.id]; else cfg.subj[s.id] = { written: v };
      await db.putItems('meta', cfg); again();
    }), ctx.btn('Note', 'plus', () => editGrade({ subjectId: s.id }, { subjects, after: again }), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  const root = h('div.ngsubj', { style: { '--c': s.color } });
  view.append(root);

  // Kennzahlen
  const tile = (k, v, sub, t) => h('div.ngtile', null, h('small', { text: k }), h('b' + (t ? '.' + t : ''), { text: v }), h('span', { text: sub }));
  root.append(h('section.ngtiles', null,
    tile('Schnitt', fmtAvg(P.avg, cfg), P.avg == null ? 'noch keine Noten' : `Zeugnis ca. ${reportNote(P.avg, cfg)}`, P.avg != null ? tone(P.avg, cfg.scale) : ''),
    tile('Schriftlich', fmtAvg(P.s, cfg), `zählt ${P.w} %`, P.s != null ? tone(P.s, cfg.scale) : ''),
    tile('Mündlich', fmtAvg(P.m, cfg), `zählt ${100 - P.w} %`, P.m != null ? tone(P.m, cfg.scale) : '')));

  // Verlauf
  if (g.length) {
    root.append(h('section.ngpanel', null, h('div.ngpanelhead', null, h('h2.section', { text: 'Verlauf' }),
      h('span.nglegend', null, h('i.ngkey.pt'), 'Note', h('i.ngkey.oral'), 'mündlich', h('i.ngkey.run'), 'Schnitt')), trendChart(g, cfg, s.id)));
  }

  // Ziel-Rechner
  const next = upcoming[0];
  const cat = state.cat || (next ? (/Präsentation|Referat/.test(next.kind) ? 'praesi' : 'schriftlich') : 'schriftlich');
  const weight = state.weight || 1;
  const target = state.target ?? (P.avg != null ? (() => { const t = TARGETS(cfg); const cur = t.find(([v]) => reaches(P.avg, v, cfg)); const i = cur ? t.indexOf(cur) : t.length; return t[Math.min(i, t.length - 1)][0]; })() : TARGETS(cfg)[1][0]);
  const r = needed(g, cfg, s.id, { target, cat, weight });
  const tLabel = TARGETS(cfg).find(([v]) => v === target)[1].split(' ·')[0].replace('Note ', '');
  const kind = CAT_LABEL[cat] === 'Schriftlich' ? 'Arbeit' : CAT_LABEL[cat] === 'Mündlich' ? 'mündlichen Note' : 'Präsentation';
  let headline, sub;
  if (r.kind === 'need') { headline = `Du brauchst mindestens eine ${r.min.l}`; sub = `Dann liegt dein Schnitt bei ${fmtAvg(r.min.avg, cfg)}, also Zeugnis ${tLabel} oder besser.`; }
  else if (r.kind === 'safe') { headline = `Zeugnis ${tLabel} ist sicher`; sub = `Selbst mit einer ${r.min.l} käme dein Schnitt auf ${fmtAvg(r.min.avg, cfg)}.`; }
  else { headline = 'Mit einer Note allein nicht zu schaffen'; sub = `Selbst mit einer ${r.best.l} käme dein Schnitt nur auf ${fmtAvg(r.best.avg, cfg)}. Danach brauchst du weitere gute Noten.`; }
  const table = h('div.ngwhatif' + (pts(cfg) ? '.pts' : ''));
  for (const x of r.res) {
    const ok = reaches(x.avg, target, cfg);
    table.append(h('div.ngwi' + (ok ? '.ok' : '') + (r.min && x === r.min ? '.min' : ''), null, h('b', { text: x.l }), h('small', { text: fmtAvg(x.avg, cfg) })));
  }
  root.append(h('section.ngpanel.ngcalc', null,
    h('div.ngpanelhead', null, h('h2.section', { text: 'Ziel-Rechner' }),
      next ? h('button.ngnextbtn', { on: { click: () => editExam(next, { subjects, after: again }) } }, icon('bookmark'), h('span', { text: `${next.kind} ${countdownText(daysUntil(next.date))}` })) : null),
    h('div.ngcalcrow', null, h('span.ngcl', { text: 'Ziel im Zeugnis' }), segmented(TARGETS(cfg).map(([v, l]) => [v, l.split(' ·')[0].replace('Note ', '')]), target, (v) => again({ ...state, target: +v }), '.ngtarget')),
    h('div.ngcalcrow', null, h('span.ngcl', { text: 'Nächste Note' }), segmented([['schriftlich', 'Arbeit / Test'], ['muendlich', 'Mündlich'], ['praesi', 'Präsentation']], cat, (v) => again({ ...state, cat: v }))),
    h('div.ngcalcrow', null, h('span.ngcl', { text: 'Zählt' }), segmented([[0.5, 'halb'], [1, 'normal'], [2, 'doppelt']], weight, (v) => again({ ...state, weight: +v }))),
    h('div.ngverdict.' + r.kind, null, h('b', { text: headline }), h('span', { text: sub })),
    h('p.ngcl', { text: `Was wäre wenn: neuer Schnitt je nach Note in der nächsten ${kind}` }),
    table));

  // Notenliste
  const list = h('div.nglist');
  for (const x of [...g].reverse()) {
    list.append(h('button.ngrow', { on: { click: () => editGrade(x, { subjects, after: again }) } },
      h('span.ngchip.' + tone(x.value, cfg.scale) + (catOf(x, cfg) === 'muendlich' ? '.oral' : ''), { text: gradeLabel(x.value, cfg.scale) }),
      h('span.ngrowtext', null, h('b', { text: x.label || CAT_LABEL[x.cat] || 'Note' }),
        h('small', { text: [CAT_LABEL[x.cat], x.cat === 'praesi' ? `zählt ${cfg.pres === 'schriftlich' ? 'schriftlich' : 'mündlich'}` : null, x.weight && x.weight !== 1 ? (x.weight > 1 ? 'doppelt' : 'halb') : null, fmtDate(x.date)].filter(Boolean).join(' · ') })),
      icon('chev')));
  }
  root.append(h('section.subsec', null, h('h2.section', { text: g.length ? `Noten (${g.length})` : 'Noten' }),
    g.length ? list : h('p.calm', { text: 'Noch keine Noten in diesem Zeitraum. Tippe oben auf „Note“.' })));
  root.append(h('p.calm.small', { text: 'Die Rechnung ist eine Schätzung. Deine Lehrkraft entscheidet am Ende, auch bei Noten genau zwischen zwei Stufen.' }));
}
