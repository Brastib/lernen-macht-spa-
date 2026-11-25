// Präsentations-Trainer: Stichwort-Karteikarten (Text + Pencil) zum Ablesen beim Vortrag, mit Zeit pro Karte.
// Die Präsentation selbst läuft z. B. am Smartboard, das iPad zeigt nur die Karten. Daten hängen am Planer-Eintrag (ex.talk),
// werden also mitgesichert; nach dem Termin kann die Note direkt in den Noten-Rechner (Art „Präsentation“).
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, confirmSheet } from './ui.js';
import { editExam, editGrade, daysUntil, countdownText, approxLabel } from './school.js';
import { micButton } from './speech.js';

const pad = (n) => String(n).padStart(2, '0');
const tid = () => Math.random().toString(36).slice(2, 9);
export const isTalk = (ex) => /Präsentation|Referat/.test(ex.kind || '');
export const fmtT = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

function talkOf(ex) {
  const t = ex.talk || {};
  return { target: t.target || 5, cards: Array.isArray(t.cards) ? t.cards : [], runs: Array.isArray(t.runs) ? t.runs : [], remind: !!t.remind };
}
async function saveTalk(ex, t) { ex.talk = t; await db.putItems('exams', ex); }

// geplante Sekunden pro Karte: feste Zeiten bleiben, der Rest der Zielzeit wird gleich verteilt
export function planned(t) {
  const total = t.target * 60, fixed = t.cards.filter((c) => c.sec), autos = t.cards.length - fixed.length;
  const rest = Math.max(0, total - fixed.reduce((a, c) => a + c.sec, 0));
  const each = autos ? Math.max(10, rest / autos) : 0;
  return t.cards.map((c) => (c.sec ? c.sec : each));
}
// Bewertung einer Karte im Rückblick
export const judge = (actual, plan) => (actual > plan * 1.3 + 5 ? 'long' : actual < plan * 0.5 - 3 ? 'short' : 'ok');

// ---------- Pencil-Skizze auf der Karte (als Striche gespeichert, passt sich hell/dunkel an) ----------
const IW = 800, IH = 400;
const INK_COLORS = { ink: (d) => (d ? '#e8ecf4' : '#1d1d1f'), blue: () => '#3a6df0', red: () => '#e0533d', green: () => '#2f9e6a' };
export function drawInk(cv, strokes, { dark = isDark() } = {}) {
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  if (!strokes || !strokes.length) return;
  const k = Math.min(cv.width / IW, cv.height / IH), ox = (cv.width - IW * k) / 2, oy = (cv.height - IH * k) / 2;
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const s of strokes) {
    x.strokeStyle = (INK_COLORS[s.c] || INK_COLORS.ink)(dark);
    const p = s.p;
    if (p.length === 1) { x.fillStyle = x.strokeStyle; x.beginPath(); x.arc(ox + p[0][0] * k, oy + p[0][1] * k, s.w * k * 0.6, 0, Math.PI * 2); x.fill(); continue; }
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      x.lineWidth = Math.max(1, s.w * k * (0.55 + 0.45 * ((a[2] + b[2]) / 200)));
      x.beginPath(); x.moveTo(ox + a[0] * k, oy + a[1] * k); x.lineTo(ox + b[0] * k, oy + b[1] * k); x.stroke();
    }
  }
}
function inkPad(strokes) {
  const wrap = h('div.tkpad');
  const cv = h('canvas.tkpadcv', { width: IW, height: IH });
  let col = 'ink', erase = false, cur = null;
  const redraw = () => drawInk(cv, strokes);
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * IW), Math.round((e.clientY - r.top) / r.height * IH), Math.round((e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5) * 100)]; };
  const hitErase = (p) => { const i = strokes.findIndex((s) => s.p.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 14)); if (i >= 0) { strokes.splice(i, 1); redraw(); } };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (erase) { hitErase(p); cur = 'erase'; return; }
    cur = { c: col, w: 5, p: [p] }; strokes.push(cur); redraw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const p = pos(ev);
      if (cur === 'erase') { hitErase(p); continue; }
      const l = cur.p[cur.p.length - 1];
      if (Math.hypot(l[0] - p[0], l[1] - p[1]) >= 2) cur.p.push(p);
    }
    if (cur !== 'erase') redraw();
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const tools = h('div.tkpadtools');
  const drawTools = () => {
    tools.replaceChildren(
      ...Object.keys(INK_COLORS).map((c) => h('button.tkcol' + (!erase && col === c ? '.on' : ''), { type: 'button', 'aria-label': 'Farbe', style: { '--k': INK_COLORS[c](isDark()) }, on: { click: () => { col = c; erase = false; drawTools(); } } }, h('i'))),
      h('button.tkpadbtn' + (erase ? '.on' : ''), { type: 'button', 'aria-label': 'Radierer', title: 'Radierer', on: { click: () => { erase = !erase; drawTools(); } } }, icon('eraser')),
      h('button.tkpadbtn', { type: 'button', 'aria-label': 'Rückgängig', title: 'Rückgängig', on: { click: () => { strokes.pop(); redraw(); } } }, icon('undo')),
      h('button.tkpadbtn', { type: 'button', 'aria-label': 'Alles löschen', title: 'Alles löschen', on: { click: () => { strokes.length = 0; redraw(); } } }, icon('trash')));
  };
  drawTools();
  wrap.append(cv, tools);
  requestAnimationFrame(redraw);
  return wrap;
}

// ---------- Karte bearbeiten ----------
async function editCard(t, idx, plan) {
  const c = idx == null ? { id: tid(), title: '', notes: '', ink: [], sec: null } : { ...t.cards[idx], ink: [...(t.cards[idx].ink || [])] };
  const res = await sheet(idx == null ? 'Neue Karte' : `Karte ${idx + 1}`, (body, close) => {
    const title = h('input.field', { id: 'tkTitle', type: 'text', placeholder: 'Überschrift, z. B. Einleitung', value: c.title, autocomplete: 'off' });
    const notes = h('textarea.field.area', { id: 'tkNotes', rows: 4, placeholder: 'Stichworte, eins pro Zeile\nz. B. Frage ans Publikum\nWarum ist das Thema wichtig?' });
    notes.value = c.notes || '';
    let sec = c.sec;
    const secOut = h('b.tksecval');
    const secSeg = h('div.tksecrow');
    const auto = idx != null && plan ? plan[idx] : null;
    const drawSec = () => {
      secOut.textContent = sec ? fmtT(sec) + ' Min.' : 'Automatisch' + (auto ? ` (${fmtT(auto)})` : '');
      secSeg.replaceChildren(
        h('button.btn.small' + (!sec ? '.on' : ''), { type: 'button', text: 'Auto', on: { click: () => { sec = null; drawSec(); } } }),
        h('button.btn.small.round', { type: 'button', 'aria-label': '15 Sekunden weniger', on: { click: () => { sec = Math.max(15, (sec || Math.round((auto || 60) / 15) * 15) - 15); drawSec(); } } }, '−'),
        secOut,
        h('button.btn.small.round', { type: 'button', 'aria-label': '15 Sekunden mehr', on: { click: () => { sec = Math.min(900, (sec || Math.round((auto || 60) / 15) * 15) + 15); drawSec(); } } }, '+'));
    };
    drawSec();
    body.append(
      h('label.fieldlabel', { for: 'tkTitle', text: 'Überschrift' }), title,
      h('label.fieldlabel', { for: 'tkNotes', text: 'Stichworte' }), h('div.micwrap', null, notes, micButton(notes)),
      h('p.fieldlabel', { text: 'Skizze mit dem Pencil (freiwillig)' }), inkPad(c.ink),
      h('p.fieldlabel', { text: 'Zeit für diese Karte' }), secSeg,
      h('div.dlgactions', null,
        idx == null ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: idx == null ? 'Hinzufügen' : 'Sichern', on: { click: () => {
          if (!title.value.trim() && !notes.value.trim() && !c.ink.length) { title.focus(); return; }
          close({ ...c, title: title.value.trim() || `Karte ${(idx ?? t.cards.length) + 1}`, notes: notes.value.replace(/\s+$/, ''), sec });
        } } })));
  }, { wide: true });
  if (!res) return false;
  if (res === 'delete') { t.cards.splice(idx, 1); return true; }
  if (idx == null) t.cards.push(res); else t.cards[idx] = res;
  return true;
}

// Startkarten aus dem Thema
function suggestCards(ex) {
  const parts = (ex.topic || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(1, 6);
  const main = parts.length ? parts : ['Hauptteil 1', 'Hauptteil 2', 'Hauptteil 3'];
  return [
    { id: tid(), title: 'Einleitung', notes: 'Begrüßung\nThema nennen\nWarum ist es spannend?\nAblauf kurz zeigen', ink: [], sec: null },
    ...main.map((m) => ({ id: tid(), title: m, notes: '', ink: [], sec: null })),
    { id: tid(), title: 'Schluss', notes: 'Kurz zusammenfassen\nEigene Meinung\nDanke fürs Zuhören\nFragen?', ink: [], sec: null },
  ];
}

// ================= Übersicht =================
export async function renderTalks(ctx) {
  const [exams, subjects] = await Promise.all([db.listExams(), db.listSubjects()]);
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const talks = exams.filter(isTalk);
  const up = talks.filter((x) => daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const past = talks.filter((x) => daysUntil(x.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const again = () => renderTalks(ctx);
  const addNew = async () => {
    if (!subjects.length) { toast('Leg zuerst ein Fach an'); return; }
    const before = new Set(exams.map((x) => x.id));
    await editExam({ kind: 'Präsentation' }, { subjects, after: async () => {
      const n = (await db.listExams()).find((x) => !before.has(x.id));
      if (n && isTalk(n)) ctx.go({ view: 'talk', examId: n.id }); else again();
    } });
  };
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Präsentationen',
    meta: up.length ? `${plural(up.length, 'Präsentation', 'Präsentationen')} geplant` : 'Karteikarten zum Ablesen',
    actions: [ctx.btn('Neu', 'plus', addNew, '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  if (!talks.length) {
    view.append(h('section.empty', null,
      h('div.tkemptyic', { 'aria-hidden': 'true' }, icon('cards')),
      h('h2', { text: 'Karteikarten für deine Präsentation' }),
      h('p', { text: 'Schreib Stichworte auf Karten. Beim Vortrag zeigt das iPad groß die aktuelle Karte und die Zeit, die Folien laufen am Smartboard.' }),
      h('div.emptyactions', null, ctx.btn('Präsentation anlegen', 'plus', addNew, '.primary'))));
    return;
  }
  const row = (ex) => {
    const s = sm.get(ex.subjectId), t = talkOf(ex), n = daysUntil(ex.date);
    const last = t.runs[t.runs.length - 1];
    const sub = n < 0 && !ex.gradeId ? 'Vorbei · Note eintragen?'
      : t.cards.length ? `${plural(t.cards.length, 'Karte', 'Karten')} · Ziel ${t.target} Min.${last ? ' · zuletzt ' + fmtT(last.total) : ''}` : 'Noch keine Karten';
    return h('button.tkrow' + (n < 0 ? '.past' : n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {}, on: { click: () => ctx.go({ view: 'talk', examId: ex.id }) } },
      h('div.examcount', null, h('b', { text: n < 0 ? '✓' : (ex.approx ? '~' : '') + n }), h('small', { text: n < 0 ? 'vorbei' : n === 1 ? 'Tag' : 'Tage' })),
      h('span.tkrowtext', null,
        h('b', { text: (ex.topic ? ex.topic.split('\n')[0] : ex.kind) }),
        h('small', { text: `${ex.kind}${s ? ' · ' + s.name : ''} · ${approxLabel(ex)} · ${countdownText(n)}` }),
        h('span.tkrowsub', { text: sub })),
      icon('right'));
  };
  if (up.length) view.append(h('section.subsec', null, h('h2.section', { text: 'Kommende' }), h('div.tklist', null, ...up.map(row))));
  if (past.length) view.append(h('details.donebox', null, h('summary', { text: `Vorbei (${past.length})` }), h('div.tklist', null, ...past.map(row))));
}

// ================= Eine Präsentation: Karten =================
export async function renderTalk(ctx, examId) {
  const [exams, subjects] = await Promise.all([db.listExams(), db.listSubjects()]);
  const ex = exams.find((x) => x.id === examId);
  if (!ex) return ctx.go({ view: 'talks' });
  const s = subjects.find((x) => x.id === ex.subjectId);
  const t = talkOf(ex);
  const again = () => renderTalk(ctx, examId);
  const store = async () => { await saveTalk(ex, t); again(); };
  const n = daysUntil(ex.date);
  const plan = planned(t);
  const last = t.runs[t.runs.length - 1];
  ctx.setHeader({
    back: { label: 'Präsentationen', go: () => ctx.go({ view: 'talks' }) },
    eyebrow: `${ex.kind}${s ? ' · ' + s.name : ''}`, title: ex.topic ? ex.topic.split('\n')[0] : `${ex.kind}${s ? ' ' + s.name : ''}`,
    meta: `${approxLabel(ex)} · ${countdownText(n)}${ex.order ? ' · ' + ex.order : ''}`,
    actions: [
      ctx.iconBtn('edit', 'Termin bearbeiten', () => editExam(ex, { subjects, after: async () => { const still = (await db.listExams()).find((x) => x.id === ex.id); if (still) again(); else ctx.go({ view: 'talks' }); } })),
      ctx.btn('Karten zeigen', 'play', () => t.cards.length ? runScreen(ex, t, again) : toast('Leg zuerst Karten an'), '.primary'),
    ],
  });
  const view = $('view');
  view.textContent = '';
  const root = h('div.tkpage', { style: s ? { '--c': s.color } : {} });
  view.append(root);

  // Zeitleiste: Zielzeit direkt einstellen
  const setTarget = async (v) => { t.target = Math.max(1, Math.min(60, v)); await store(); };
  root.append(h('section.tktime', null,
    h('span.tktimelabel', null, icon('clock'), h('span', { text: 'Zielzeit' })),
    h('button.btn.small.round', { 'aria-label': 'Eine Minute weniger', on: { click: () => setTarget(t.target - 1) } }, '−'),
    h('b.tktimeval', { text: `${t.target} Min.` }),
    h('button.btn.small.round', { 'aria-label': 'Eine Minute mehr', on: { click: () => setTarget(t.target + 1) } }, '+'),
    h('span.tktimeinfo', { text: last ? `Zuletzt ${fmtT(last.total)}` : t.cards.length ? `ca. ${fmtT(t.target * 60 / t.cards.length)} pro Karte` : '' })));

  // Karten
  const list = h('div.tkcards');
  t.cards.forEach((c, i) => {
    const thumb = c.ink && c.ink.length ? h('canvas.tkthumb', { width: 160, height: 80 }) : null;
    if (thumb) requestAnimationFrame(() => drawInk(thumb, c.ink));
    const lines = (c.notes || '').split('\n').filter((l) => l.trim());
    list.append(h('div.tkcard', null,
      h('button.tkcardmain', { on: { click: async () => { if (await editCard(t, i, plan)) store(); } } },
        h('span.tknum', { text: String(i + 1) }),
        h('span.tkcardtext', null, h('b', { text: c.title }),
          h('small', { text: lines.length ? lines.slice(0, 3).join(' · ') + (lines.length > 3 ? ' …' : '') : (thumb ? 'Skizze' : 'Keine Stichworte') })),
        thumb,
        h('span.tkcardsec' + (c.sec ? '.fixed' : ''), { text: fmtT(plan[i]) })),
      h('div.tkmove', null,
        h('button.icbtn.tkup', { 'aria-label': 'Nach oben', disabled: i === 0, on: { click: () => { [t.cards[i - 1], t.cards[i]] = [t.cards[i], t.cards[i - 1]]; store(); } } }, icon('down')),
        h('button.icbtn', { 'aria-label': 'Nach unten', disabled: i === t.cards.length - 1, on: { click: () => { [t.cards[i + 1], t.cards[i]] = [t.cards[i], t.cards[i + 1]]; store(); } } }, icon('down')))));
  });
  root.append(h('section.tkpanel', null,
    h('div.tkpanelhead', null, h('h2.section', { text: t.cards.length ? `Karteikarten (${t.cards.length})` : 'Karteikarten' }),
      t.cards.length ? h('small', { text: `zusammen ${fmtT(plan.reduce((a, b) => a + b, 0))}` }) : null),
    t.cards.length ? list : h('div.tkstart', null,
      h('p.calm', { text: 'Eine Karte pro Folie oder Abschnitt: Überschrift und ein paar Stichworte.' }),
      h('button.btn', { text: 'Vorschlag: Einleitung, Hauptteil, Schluss', on: { click: () => { t.cards = suggestCards(ex); store(); } } })),
    h('button.tkadd', { on: { click: async () => { if (await editCard(t, null, plan)) store(); } } }, icon('plus'), h('span', { text: 'Karte hinzufügen' }))));

  // nach dem Termin: Note
  if (n < 0 || ex.gradeId) {
    root.append(h('section.tkpanel.tkgrade', null,
      h('div', null, h('b', { text: 'Note' }), h('small', { text: ex.gradeId ? 'Steht im Noten-Rechner.' : 'Zählt im Noten-Rechner als Präsentation.' })),
      h('button.btn' + (ex.gradeId ? '' : '.primary'), { text: ex.gradeId ? 'Note ändern' : 'Note eintragen', on: { click: async () => {
        const existing = ex.gradeId ? (await db.listGrades()).find((g) => g.id === ex.gradeId) : null;
        const g = await editGrade(existing || { subjectId: ex.subjectId, cat: 'praesi', label: ex.kind + (ex.topic ? ': ' + ex.topic.split('\n')[0].slice(0, 40) : ''), date: ex.date }, { subjects });
        if (g && g.id) { ex.gradeId = g.id; await db.putItems('exams', ex); }
        again();
      } } })));
  }
}

// ================= Karten zeigen (beim Vortrag oder zum Üben) =================
function runScreen(ex, t, after) {
  const plan = planned(t);
  const N = t.cards.length;
  const spent = new Array(N).fill(0);
  let i = 0, segStart = performance.now(), running = true, paused = false, wake = null;
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { wake = w; }).catch(() => {}); } catch (e) { /* egal */ }

  const scr = h('section.screen.tkrunscr', { role: 'dialog', 'aria-label': 'Karteikarten' });
  const total = h('b.tktotal');
  const pauseBtn = h('button.btn.round', { 'aria-label': 'Pause', title: 'Pause' }, icon('pause'));
  const bar = h('div.bar', null, h('button.txt.strong', { text: 'Beenden', on: { click: () => quit() } }), h('span.hint', { text: `Ziel ${t.target}:00` }), total, pauseBtn);
  const segs = h('div.tksegs');
  const segEls = plan.map((p) => { const e = h('span.tkseg', { style: { flex: String(p) } }, h('i')); segs.append(e); return e; });
  const card = h('div.tkbigcard');
  const clock = h('div.tkclock', null, h('span.tkclockbar', null, h('i')), h('b'), h('small'));
  const nextHint = h('span.tknexthint');
  const prev = h('button.btn.big', { 'aria-label': 'Zurück', on: { click: () => go(-1) } }, icon('left'));
  const next = h('button.btn.big.primary', { on: { click: () => go(1) } }, h('span'), icon('right'));
  const actions = h('div.tkrunactions', null, prev, nextHint, next);
  scr.append(bar, segs, h('div.tkstage', null, card, clock, actions));
  document.body.append(scr);
  document.documentElement.classList.add('tkrunning');

  function drawCard() {
    const c = t.cards[i];
    const lines = (c.notes || '').split('\n').filter((l) => l.trim());
    const kids = [h('small.tkcardno', { text: `Karte ${i + 1} von ${N}` }), h('h2', { text: c.title })];
    if (lines.length) kids.push(h('ul', null, ...lines.map((l) => h('li', { text: l.replace(/^[-•*]\s*/, '') }))));
    if (c.ink && c.ink.length) { const cv = h('canvas.tkinkbig', { width: 800, height: 400 }); requestAnimationFrame(() => drawInk(cv, c.ink)); kids.push(cv); }
    card.replaceChildren(...kids);
    card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
    prev.disabled = i === 0;
    next.querySelector('span').textContent = i === N - 1 ? 'Fertig' : 'Weiter';
    nextHint.textContent = i < N - 1 ? `Als Nächstes: ${t.cards[i + 1].title}` : 'Letzte Karte';
    segEls.forEach((e, k) => e.classList.toggle('cur', k === i));
  }
  function go(d) {
    if (paused) return;
    const now = performance.now();
    spent[i] += (now - segStart) / 1000; segStart = now;
    if (i + d >= N) { finish(); return; }
    i = Math.max(0, i + d); drawCard();
  }
  function tick() {
    if (!running) return;
    if (!paused) {
      const now = performance.now();
      const cur = spent[i] + (now - segStart) / 1000;
      const all = spent.reduce((a, b) => a + b, 0) + (now - segStart) / 1000;
      total.textContent = fmtT(all);
      total.classList.toggle('over', all > t.target * 60);
      const p = plan[i];
      clock.className = 'tkclock ' + (judge(cur, p) === 'long' ? 'bad' : cur > p ? 'warn' : 'ok');
      clock.querySelector('i').style.width = Math.min(100, (cur / p) * 100) + '%';
      clock.querySelector('b').textContent = fmtT(cur);
      clock.querySelector('small').textContent = cur > p ? `${fmtT(cur - p)} drüber` : `noch ${fmtT(p - cur)} für diese Karte`;
      segEls.forEach((e, k) => { const v = k === i ? cur : spent[k]; e.querySelector('i').style.width = Math.min(100, (v / plan[k]) * 100) + '%'; e.classList.toggle('over', judge(v, plan[k]) === 'long'); });
    }
    requestAnimationFrame(tick);
  }
  pauseBtn.addEventListener('click', () => {
    const now = performance.now();
    if (!paused) { paused = true; spent[i] += (now - segStart) / 1000; pauseBtn.replaceChildren(icon('play')); scr.classList.add('paused'); }
    else { paused = false; segStart = now; pauseBtn.replaceChildren(icon('pause')); scr.classList.remove('paused'); }
  });
  // Tippen auf die Karte (Finger oder Pencil): rechts/mitte = weiter, linkes Viertel = zurück. Wischen geht auch.
  let downX = null;
  card.addEventListener('pointerdown', (e) => { downX = e.clientX; });
  card.addEventListener('pointerup', (e) => {
    if (downX == null) return;
    const dx = e.clientX - downX; downX = null;
    if (Math.abs(dx) > 60) { go(dx < 0 ? 1 : -1); return; }
    const r = card.getBoundingClientRect();
    go(e.clientX < r.left + r.width * 0.25 ? -1 : 1);
  });
  const onKey = (e) => {
    if (document.querySelector('.dlgscrim')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    else if (e.key === 'Escape') quit();
  };
  document.addEventListener('keydown', onKey);
  function cleanup() {
    running = false;
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('tkrunning');
    try { if (wake) wake.release(); } catch (e) { /* egal */ }
    scr.remove();
  }
  async function quit() {
    const sofar = spent.reduce((a, b) => a + b, 0) + (paused ? 0 : (performance.now() - segStart) / 1000);
    if (sofar > 10 && !(await confirmSheet('Beenden?', 'Die Zeit dieses Durchgangs wird nicht gespeichert.', 'Beenden', true))) return;
    cleanup();
  }
  async function finish() {
    const r = { id: tid(), at: Date.now(), total: Math.round(spent.reduce((a, b) => a + b, 0)), per: spent.map((x) => Math.round(x)), plan: plan.map((x) => Math.round(x)), titles: t.cards.map((c) => c.title), target: t.target };
    t.runs.push(r);
    if (t.runs.length > 20) t.runs.splice(0, t.runs.length - 20);
    await saveTalk(ex, t);
    cleanup();
    await reviewSheet(r);
    after && after();
  }
  drawCard();
  requestAnimationFrame(tick);
}

// ================= Zeit pro Karte (nach dem Durchgang) =================
async function reviewSheet(r) {
  const T = r.target * 60, diff = r.total - T, ok = Math.abs(diff) <= T * 0.1;
  const long = r.per.map((v, k) => k).filter((k) => judge(r.per[k], r.plan[k]) === 'long');
  await sheet('Deine Zeit', (body, close) => {
    const maxV = Math.max(...r.per, ...r.plan, 1);
    const rows = h('div.tkrev');
    r.per.forEach((v, k) => {
      const p = r.plan[k], j = judge(v, p);
      rows.append(h('div.tkrevrow.' + j, null,
        h('span.tkrevname', null, h('i', { text: String(k + 1) }), h('b', { text: r.titles[k] || `Karte ${k + 1}` })),
        h('span.tkrevbar', null, h('i', { style: { width: (v / maxV) * 100 + '%' } }), h('em', { style: { left: (p / maxV) * 100 + '%' } })),
        h('span.tkrevval', null, h('b', { text: fmtT(v) }), h('small', { text: j === 'long' ? 'zu lang' : j === 'short' ? 'kurz' : 'passt' }))));
    });
    body.append(
      h('div.tkrevhead.' + (ok ? 'good' : 'mid'), null,
        h('b', { text: fmtT(r.total) }),
        h('span', null, h('strong', { text: ok ? 'Im Zeitrahmen' : diff > 0 ? `${fmtT(diff)} zu lang` : `${fmtT(-diff)} zu kurz` }),
          h('small', { text: long.length ? `Zu lang: Karte ${long.map((k) => k + 1).join(', ')}` : `Ziel ${fmtT(T)} · Strich = geplante Zeit` }))),
      rows,
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close() } })));
  }, { wide: true });
}
