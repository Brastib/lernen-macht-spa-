// Präsentations-Trainer: Stichwortkarten (Text + Pencil), Probelauf mit Zeit pro Karte, Rückblick, Übungsplan bis zum Termin.
// Alles hängt an der Präsentation im Planer (exams-Eintrag, Feld ex.talk). So erscheint sie mit Countdown im Planer,
// wird mitgesichert, und nach dem Termin kann die Note direkt in den Noten-Rechner (Art „Präsentation“).
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, confirmSheet } from './ui.js';
import { editExam, editGrade, daysUntil, countdownText, approxLabel } from './school.js';
import { micButton, readAloud, canSpeak } from './speech.js';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => isoDate(new Date());
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const tid = () => Math.random().toString(36).slice(2, 9);
export const isTalk = (ex) => /Präsentation|Referat/.test(ex.kind || '');
export const fmtT = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtMin = (s) => { const m = s / 60; return m >= 1 ? `${String(Math.round(m * 10) / 10).replace('.', ',')} Min.` : `${Math.round(s)} Sek.`; };
const MODES = { full: 'Mit Stichworten', titles: 'Nur Überschriften', blind: 'Frei sprechen', general: 'Generalprobe' };
const MODE_HINT = {
  full: 'Du siehst Überschrift und alle Stichworte.',
  titles: 'Du siehst nur die Überschrift. Stichworte erst nach „Spicken“.',
  blind: 'Du siehst nur die Kartennummer. Alles andere nach „Spicken“.',
  general: 'Wie im Unterricht: Stichworte da, aber am besten vor Publikum (Familie, Nachhilfe).',
};
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

// ---------- Übungsplan: wird jeden Tag frisch aus Datum + Probeläufen berechnet ----------
export function practicePlan(ex, t, from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = parseDate(ex.date);
  const days = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(new Date(d));
  if (!days.length) return [];
  // bei viel Zeit nicht jeden Tag: erst jeden 2. Tag, die letzten 4 Tage jeden Tag
  let use = days;
  if (days.length > 8) use = days.filter((d, i) => i >= days.length - 4 || (days.length - 4 - i) % 2 === 0);
  const runDays = new Set(t.runs.map((r) => isoDate(new Date(r.at))));
  const N = use.length;
  const out = use.map((d, i) => {
    let kind;
    if (i === 0 && t.cards.length < 3 && N > 1) kind = 'cards';
    else if (i === N - 1) kind = 'general';
    else { const f = N <= 2 ? 0 : i / (N - 1); kind = f < 0.4 ? 'full' : f < 0.75 ? 'titles' : 'blind'; }
    const iso = isoDate(d);
    return { date: iso, kind, done: kind === 'cards' ? t.cards.length >= 3 : runDays.has(iso) };
  });
  return out;
}
const PLAN_LABEL = { cards: 'Karten schreiben', full: 'Probelauf mit Stichworten', titles: 'Probelauf nur mit Überschriften', blind: 'Frei sprechen', general: 'Generalprobe vor Publikum' };

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

// ---------- Erinnerung ans Üben (gleiche Art wie die Lernerinnerung im Planer) ----------
async function syncPracticeReminder(ex, on, subjName) {
  const old = (await db.listReminders()).find((r) => r.refId === ex.id && r.kind === 'lernen');
  if (!on) { if (old) await db.deleteItems('reminders', old.id); return; }
  const d = parseDate(ex.date);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
  const until = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (until < t0) { toast('Der Termin ist zu nah für eine Erinnerung'); return; }
  const r = { ...(old || { id: db.newId() }), kind: 'lernen', refId: ex.id, subjectId: ex.subjectId, text: `Präsentation üben${subjName ? ': ' + subjName : ''}${ex.topic ? ' (' + ex.topic.split('\n')[0].slice(0, 40) + ')' : ''}`,
    date: isoDate(startD < t0 ? t0 : startD), time: '17:00', repeat: 'daily', until: isoDate(until), days: 7, done: false, ack: 0, notified: 0, snoozeUntil: 0 };
  await db.putItems('reminders', r);
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
    meta: up.length ? `${plural(up.length, 'Präsentation', 'Präsentationen')} geplant` : 'Nichts geplant',
    actions: [ctx.btn('Neu', 'plus', addNew, '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  if (!talks.length) {
    view.append(h('section.empty', null,
      h('div.tkemptyic', { 'aria-hidden': 'true' }, icon('speak')),
      h('h2', { text: 'Präsentation vorbereiten' }),
      h('p', { text: 'Schreib Stichwortkarten, übe mit Zeit pro Karte und sieh danach, welcher Teil zu lang war. Die App plant dir die Probeläufe bis zum Termin.' }),
      h('div.emptyactions', null, ctx.btn('Präsentation anlegen', 'plus', addNew, '.primary'))));
    return;
  }
  const row = (ex) => {
    const s = sm.get(ex.subjectId), t = talkOf(ex), n = daysUntil(ex.date);
    const last = t.runs[t.runs.length - 1];
    const plan = n > 0 ? practicePlan(ex, t) : [];
    const today = plan.find((p) => p.date === todayIso());
    const sub = n < 0 ? (ex.gradeId ? 'Note eingetragen' : 'Vorbei · Note eintragen?')
      : today && !today.done ? `Heute: ${PLAN_LABEL[today.kind]}`
        : t.cards.length ? `${plural(t.cards.length, 'Karte', 'Karten')} · ${plural(t.runs.length, 'Probelauf', 'Probeläufe')}${last ? ' · zuletzt ' + fmtT(last.total) : ''}` : 'Noch keine Karten';
    return h('button.tkrow' + (n < 0 ? '.past' : n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {}, on: { click: () => ctx.go({ view: 'talk', examId: ex.id }) } },
      h('div.examcount', null, h('b', { text: n < 0 ? '✓' : (ex.approx ? '~' : '') + n }), h('small', { text: n < 0 ? 'vorbei' : n === 1 ? 'Tag' : 'Tage' })),
      h('span.tkrowtext', null,
        h('b', { text: (ex.topic ? ex.topic.split('\n')[0] : ex.kind) }),
        h('small', { text: `${ex.kind}${s ? ' · ' + s.name : ''} · ${approxLabel(ex)} · ${countdownText(n)}` }),
        h('span.tkrowsub' + (today && !today.done ? '.todo' : ''), { text: sub })),
      h('span.tkrowtime', null, h('b', { text: `${t.target}` }), h('small', { text: 'Min.' })),
      icon('right'));
  };
  if (up.length) view.append(h('section.subsec', null, h('h2.section', { text: 'Kommende' }), h('div.tklist', null, ...up.map(row))));
  if (past.length) view.append(h('details.donebox', null, h('summary', { text: `Vorbei (${past.length})` }), h('div.tklist', null, ...past.map(row))));
  view.append(h('p.calm.small', { text: 'Präsentationen und Referate aus „Arbeiten“ erscheinen hier automatisch.' }));
}

// ================= Eine Präsentation =================
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
  const title = ex.topic ? ex.topic.split('\n')[0] : `${ex.kind}${s ? ' ' + s.name : ''}`;
  ctx.setHeader({
    back: { label: 'Präsentationen', go: () => ctx.go({ view: 'talks' }) },
    eyebrow: `${ex.kind}${s ? ' · ' + s.name : ''}`, title,
    meta: `${approxLabel(ex)} · ${countdownText(n)}${ex.order ? ' · ' + ex.order : ''}`,
    actions: [
      ctx.iconBtn('edit', 'Termin bearbeiten', () => editExam(ex, { subjects, after: async () => { const still = (await db.listExams()).find((x) => x.id === ex.id); if (still) again(); else ctx.go({ view: 'talks' }); } })),
      canSpeak() && t.cards.length ? ctx.btn('Anhören', 'speak', () => readAloud(t.cards.map((c) => `${c.title}. ${(c.notes || '').split('\n').filter(Boolean).join('. ')}`).join('\n\n'), { title: 'Präsentation anhören' }), '.wideonly') : null,
      ctx.btn('Probelauf', 'play', () => t.cards.length ? startRun(ex, t, { after: again }) : toast('Leg zuerst Karten an'), '.primary'),
    ].filter(Boolean),
  });
  const view = $('view');
  view.textContent = '';
  const root = h('div.tkpage', { style: s ? { '--c': s.color } : {} });
  view.append(root);

  // Kennzahlen
  const last = t.runs[t.runs.length - 1];
  const best = t.runs.length ? t.runs.reduce((a, r) => (Math.abs(r.total - t.target * 60) < Math.abs(a.total - t.target * 60) ? r : a)) : null;
  const tile = (k, v, sub, cls = '', on) => h(on ? 'button.tktile' + cls : 'div.tktile' + cls, on ? { on: { click: on } } : null, h('small', { text: k }), h('b', { text: v }), h('span', { text: sub }));
  root.append(h('section.tktiles', null,
    tile('Zielzeit', `${t.target} Min.`, 'antippen zum Ändern', '.tap', () => targetSheet(t, store)),
    tile('Karten', String(t.cards.length), t.cards.length ? `ca. ${fmtT(t.target * 60 / Math.max(1, t.cards.length))} pro Karte` : 'noch keine'),
    tile('Probeläufe', String(t.runs.length), last ? `zuletzt ${fmtT(last.total)}` : 'noch keiner'),
    tile('Am nächsten dran', best ? fmtT(best.total) : '–', best ? `${best.total > t.target * 60 ? '+' : '−'}${fmtT(Math.abs(best.total - t.target * 60))} zur Zielzeit` : 'nach dem ersten Lauf', best ? '.' + (Math.abs(best.total - t.target * 60) <= t.target * 6 ? 'good' : 'mid') : '')));

  // Übungsplan
  if (n > 0) {
    const pp = practicePlan(ex, t);
    const doneN = pp.filter((p) => p.done).length;
    const strip = h('div.tkplan');
    for (const p of pp) {
      const d = parseDate(p.date), isToday = p.date === todayIso();
      strip.append(h('div.tkday' + (p.done ? '.done' : '') + (isToday ? '.today' : '') + (p.date < todayIso() && !p.done ? '.missed' : ''), null,
        h('small', { text: isToday ? 'Heute' : `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.` }),
        h('span.tkdayic', null, p.done ? icon('check') : h('i', { text: String(pp.indexOf(p) + 1) })),
        h('b', { text: PLAN_LABEL[p.kind] })));
    }
    const rem = h('input', { type: 'checkbox', id: 'tkRem' });
    rem.checked = !!(await db.listReminders()).find((r) => r.refId === ex.id && r.kind === 'lernen');
    rem.addEventListener('change', async () => { await syncPracticeReminder(ex, rem.checked, s && s.name); toast(rem.checked ? 'Erinnerung an: jeden Tag 17 Uhr, ab 7 Tagen vorher' : 'Erinnerung aus'); });
    root.append(h('section.tkpanel', null,
      h('div.tkpanelhead', null, h('h2.section', { text: 'Übungsplan' }), h('small', { text: pp.length ? `${doneN} von ${pp.length} erledigt` : '' })),
      pp.length ? strip : h('p.calm', { text: 'Morgen ist der Termin. Heute noch eine Generalprobe!' }),
      h('label.checkrow.tkremrow', { for: 'tkRem' }, rem, h('span', null, h('b', { text: 'Ans Üben erinnern' }), h('small', { text: 'Jeden Tag um 17 Uhr in der letzten Woche vor dem Termin.' })))));
  } else if (n <= 0) {
    root.append(h('section.tkpanel.tkgrade', null,
      h('div', null, h('b', { text: n === 0 ? 'Heute ist es so weit. Viel Erfolg!' : 'Die Präsentation ist vorbei.' }),
        h('small', { text: ex.gradeId ? 'Die Note steht im Noten-Rechner.' : 'Trag die Note ein, dann zählt sie im Noten-Rechner als Präsentation.' })),
      n < 0 || ex.gradeId ? h('button.btn' + (ex.gradeId ? '' : '.primary'), { text: ex.gradeId ? 'Note ändern' : 'Note eintragen', on: { click: async () => {
        const existing = ex.gradeId ? (await db.listGrades()).find((g) => g.id === ex.gradeId) : null;
        const g = await editGrade(existing || { subjectId: ex.subjectId, cat: 'praesi', label: ex.kind + (ex.topic ? ': ' + ex.topic.split('\n')[0].slice(0, 40) : ''), date: ex.date }, { subjects });
        if (g && g.id) { ex.gradeId = g.id; await db.putItems('exams', ex); }
        again();
      } } }) : null));
  }

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
  const addBtn = h('button.tkadd', { on: { click: async () => { if (await editCard(t, null, plan)) store(); } } }, icon('plus'), h('span', { text: 'Karte hinzufügen' }));
  root.append(h('section.tkpanel', null,
    h('div.tkpanelhead', null, h('h2.section', { text: t.cards.length ? `Stichwortkarten (${t.cards.length})` : 'Stichwortkarten' }),
      h('small', { text: t.cards.length ? `zusammen ${fmtT(plan.reduce((a, b) => a + b, 0))} von ${t.target}:00` : '' })),
    t.cards.length ? list : h('div.tkstart', null,
      h('p.calm', { text: 'Eine Karte pro Abschnitt: Überschrift plus ein paar Stichworte. Keine ganzen Sätze, sonst liest man ab.' }),
      h('button.btn.primary', { text: 'Vorschlag: Einleitung, Hauptteil, Schluss', on: { click: () => { t.cards = suggestCards(ex); store(); } } })),
    addBtn));

  // Probeläufe
  if (t.runs.length) {
    const runs = h('div.tkruns');
    for (const r of [...t.runs].reverse().slice(0, 20)) {
      const diff = r.total - t.target * 60;
      runs.append(h('button.tkrun', { on: { click: () => reviewSheet(ex, t, r).then(again) } },
        h('span.tkrunbar', { style: { '--p': Math.min(1.5, r.total / (t.target * 60)) / 1.5 } }, h('i')),
        h('span.tkruntext', null, h('b', { text: fmtT(r.total) }),
          h('small', { text: `${MODES[r.mode] || ''} · ${new Date(r.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}${r.peeks ? ` · ${r.peeks}× gespickt` : ''}` })),
        h('span.tkdiff.' + (Math.abs(diff) <= t.target * 6 ? 'good' : 'mid'), { text: (diff >= 0 ? '+' : '−') + fmtT(Math.abs(diff)) })));
    }
    root.append(h('section.tkpanel', null, h('div.tkpanelhead', null, h('h2.section', { text: 'Probeläufe' }), h('small', { text: 'Strich = Zielzeit' })), trendSvg(t), runs));
  }
  root.append(h('p.calm.small', { text: 'Tipp: Sprich laut, auch wenn du allein übst. Nimm dich ab und zu auf und hör es dir an.' }));
}

function trendSvg(t) {
  const runs = t.runs.slice(-12), W = 600, H = 120, T = t.target * 60;
  const max = Math.max(T * 1.4, ...runs.map((r) => r.total)) || 1;
  const NS = 'http://www.w3.org/2000/svg', el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tktrend', role: 'img', 'aria-label': 'Dauer der letzten Probeläufe' });
  const bw = Math.min(40, (W - 20) / runs.length - 8);
  runs.forEach((r, i) => {
    const hh = (r.total / max) * (H - 16), x = 10 + i * ((W - 20) / runs.length) + ((W - 20) / runs.length - bw) / 2;
    svg.append(el('rect', { x, y: H - hh, width: bw, height: hh, rx: 5, class: 'tkbar ' + (Math.abs(r.total - T) <= T * 0.1 ? 'good' : 'mid') }));
  });
  const y = H - (T / max) * (H - 16);
  svg.append(el('line', { x1: 0, x2: W, y1: y, y2: y, class: 'tktarget' }));
  return svg;
}

function targetSheet(t, store) {
  return sheet('Zielzeit', (body, close) => {
    let v = t.target;
    const out = h('b.tkbig');
    const show = () => { out.textContent = `${v} Minuten`; };
    show();
    body.append(h('p.dlgtext', { text: 'Wie lang soll die Präsentation dauern? Steht meist in der Aufgabe, sonst frag deine Lehrkraft.' }),
      h('div.tksecrow.center', null,
        h('button.btn.round', { 'aria-label': 'Weniger', on: { click: () => { v = Math.max(1, v - 1); show(); } } }, '−'), out,
        h('button.btn.round', { 'aria-label': 'Mehr', on: { click: () => { v = Math.min(60, v + 1); show(); } } }, '+')),
      h('div.chips', null, ...[3, 5, 7, 10, 15, 20].map((m) => h('button.pchip.small', { text: `${m} Min.`, on: { click: () => { v = m; show(); } } }))),
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close() } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: async () => { t.target = v; close(); await store(); } } })));
  });
}

// ================= Probelauf =================
async function startRun(ex, t, { after }) {
  const n = daysUntil(ex.date);
  const today = n > 0 ? practicePlan(ex, t).find((p) => p.date === todayIso()) : null;
  const suggested = today && MODES[today.kind] ? today.kind : n <= 1 ? 'general' : 'full';
  const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const opts = await sheet('Probelauf', (body, close) => {
    let mode = suggested, rec = false;
    const seg = h('div.tkmodes');
    const hint = h('p.calm.small');
    const draw = () => {
      seg.replaceChildren(...Object.entries(MODES).map(([k, l]) => h('button.tkmode' + (mode === k ? '.on' : ''), { type: 'button', on: { click: () => { mode = k; draw(); } } },
        h('b', { text: l }), k === suggested && today ? h('small', { text: 'laut Plan heute' }) : null)));
      hint.textContent = MODE_HINT[mode];
    };
    draw();
    const recBox = h('input', { type: 'checkbox', id: 'tkRec' });
    recBox.addEventListener('change', () => { rec = recBox.checked; });
    body.append(...[h('p.dlgtext', { text: `${plural(t.cards.length, 'Karte', 'Karten')}, Ziel ${t.target} Minuten. Steh auf und sprich laut. Weiter geht es mit Tippen rechts auf die Karte, der Leertaste oder dem Knopf.` }),
      seg, hint,
      canRec ? h('label.checkrow', { for: 'tkRec' }, recBox, h('span', null, h('b', { text: 'Ton aufnehmen' }), h('small', { text: 'Danach anhören. Bleibt nur auf dem iPad, nur die letzte Aufnahme wird gespeichert.' }))) : null,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Los geht’s', on: { click: () => close({ mode, rec }) } }))].filter(Boolean));
  });
  if (!opts) return;
  runScreen(ex, t, opts, after);
}

async function runScreen(ex, t, { mode, rec }, after) {
  const plan = planned(t);
  const N = t.cards.length;
  const spent = new Array(N).fill(0);
  let i = 0, peeks = 0, peeked = false, segStart = performance.now(), startAt = performance.now(), running = true, paused = false, pauseAt = 0;
  let recorder = null, chunks = [], stream = null, wake = null;
  if (rec) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(1000);
    } catch (e) { toast('Mikrofon nicht erlaubt, es läuft ohne Aufnahme'); recorder = null; }
  }
  try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { /* egal */ }

  const scr = h('section.screen.tkrunscr' + (mode === 'general' ? '.general' : ''), { role: 'dialog', 'aria-label': 'Probelauf' });
  const total = h('b.tktotal');
  const info = h('span.hint');
  const pauseBtn = h('button.btn.round', { 'aria-label': 'Pause', title: 'Pause' }, icon('pause'));
  const bar = h('div.bar', null, h('button.txt.strong', { text: 'Abbrechen', on: { click: () => quit(false) } }), info, total, pauseBtn);
  const segs = h('div.tksegs');
  const segEls = plan.map((p) => { const e = h('span.tkseg', { style: { flex: String(p) } }, h('i')); segs.append(e); return e; });
  const card = h('div.tkbigcard');
  const clock = h('div.tkclock', null, h('span.tkclockbar', null, h('i')), h('b'), h('small'));
  const prev = h('button.btn.big', { on: { click: () => go(-1) } }, icon('left'), h('span', { text: 'Zurück' }));
  const peekBtn = h('button.btn.big', { on: { click: () => { if (!peeked) { peeked = true; peeks++; drawCard(); } } } }, icon('eye'), h('span', { text: 'Spicken' }));
  const next = h('button.btn.big.primary', { on: { click: () => go(1) } }, h('span'), icon('right'));
  const actions = h('div.tkrunactions', null, prev, mode === 'titles' || mode === 'blind' ? peekBtn : null, next);
  const stage = h('div.tkstage', null, card, clock, actions);
  scr.append(bar, segs, stage);
  document.body.append(scr);
  document.documentElement.classList.add('tkrunning');

  function drawCard() {
    const c = t.cards[i];
    const showTitle = mode !== 'blind' || peeked, showNotes = mode === 'full' || mode === 'general' || peeked;
    const lines = (c.notes || '').split('\n').filter((l) => l.trim());
    card.replaceChildren(...[
      h('small.tkcardno', { text: `Karte ${i + 1} von ${N}` }),
      showTitle ? h('h2', { text: c.title }) : h('h2.hidden', { text: 'Was kommt jetzt?' }),
      showNotes && lines.length ? h('ul', null, ...lines.map((l) => h('li', { text: l.replace(/^[-•*]\s*/, '') }))) : null,
      showNotes && c.ink && c.ink.length ? (() => { const cv = h('canvas.tkinkbig', { width: 800, height: 400 }); requestAnimationFrame(() => drawInk(cv, c.ink)); return cv; })() : null,
      !showNotes ? h('p.tkpeekhint', { text: mode === 'blind' ? 'Erzähl frei. Wenn du hängst: Spicken.' : 'Die Stichworte sind versteckt.' }) : null].filter(Boolean));
    card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
    prev.disabled = i === 0;
    next.querySelector('span').textContent = i === N - 1 ? 'Fertig' : 'Weiter';
    peekBtn.disabled = peeked;
    segEls.forEach((e, k) => e.classList.toggle('cur', k === i));
  }
  function go(d) {
    if (paused) return;
    const now = performance.now();
    spent[i] += (now - segStart) / 1000; segStart = now;
    if (i + d >= N) { finish(); return; }
    i = Math.max(0, i + d); peeked = false; drawCard();
  }
  function tick() {
    if (!running) return;
    if (!paused) {
      const now = performance.now();
      const cur = spent[i] + (now - segStart) / 1000;
      const all = spent.reduce((a, b) => a + b, 0) + (now - segStart) / 1000;
      total.textContent = fmtT(all);
      total.classList.toggle('over', all > t.target * 60);
      info.textContent = `${MODES[mode]} · Ziel ${t.target}:00`;
      const p = plan[i];
      const k = judge(cur, p) === 'long' ? 'bad' : cur > p ? 'warn' : 'ok';
      clock.className = 'tkclock ' + k;
      clock.querySelector('i').style.width = Math.min(100, (cur / p) * 100) + '%';
      clock.querySelector('b').textContent = fmtT(cur);
      clock.querySelector('small').textContent = cur > p ? `${fmtT(cur - p)} drüber · geplant ${fmtT(p)}` : `noch ${fmtT(p - cur)} für diese Karte`;
      segEls.forEach((e, kk) => { const v = kk === i ? cur : spent[kk]; e.querySelector('i').style.width = Math.min(100, (v / plan[kk]) * 100) + '%'; e.classList.toggle('over', judge(v, plan[kk]) === 'long'); });
    }
    requestAnimationFrame(tick);
  }
  pauseBtn.addEventListener('click', () => {
    const now = performance.now();
    if (!paused) { paused = true; pauseAt = now; spent[i] += (now - segStart) / 1000; pauseBtn.replaceChildren(icon('play')); scr.classList.add('paused'); if (recorder && recorder.state === 'recording') recorder.pause(); }
    else { paused = false; segStart = now; startAt += now - pauseAt; pauseBtn.replaceChildren(icon('pause')); scr.classList.remove('paused'); if (recorder && recorder.state === 'paused') recorder.resume(); }
  });
  card.addEventListener('click', (e) => { const r = card.getBoundingClientRect(); if (e.clientX > r.left + r.width * 0.6) go(1); else if (e.clientX < r.left + r.width * 0.25) go(-1); });
  const onKey = (e) => {
    if (document.querySelector('.dlgscrim')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    else if (e.key === 'Escape') quit(false);
  };
  document.addEventListener('keydown', onKey);

  async function stopRec() {
    if (!recorder) return null;
    const done = new Promise((res) => { recorder.onstop = res; });
    try { recorder.stop(); } catch (e) { /* egal */ }
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
    return chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' }) : null;
  }
  function cleanup() {
    running = false;
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('tkrunning');
    try { if (wake) wake.release(); } catch (e) { /* egal */ }
    scr.remove();
  }
  async function quit(ask) {
    const sofar = spent.reduce((a, b) => a + b, 0) + (paused ? 0 : (performance.now() - segStart) / 1000);
    if (ask !== false || sofar > 10) {
      if (!(await confirmSheet('Probelauf abbrechen?', 'Dieser Lauf wird nicht gespeichert.', 'Abbrechen', true))) return;
    }
    await stopRec();
    cleanup();
  }
  async function finish() {
    const blob = await stopRec();
    const totalS = spent.reduce((a, b) => a + b, 0);
    const r = { id: tid(), at: Date.now(), mode, total: Math.round(totalS), per: spent.map((x) => Math.round(x)), plan: plan.map((x) => Math.round(x)), titles: t.cards.map((c) => c.title), peeks, target: t.target };
    t.runs.push(r);
    if (t.runs.length > 60) t.runs.splice(0, t.runs.length - 60);
    if (blob) { try { await db.putBlob('talkrec-' + ex.id, blob); r.rec = true; } catch (e) { toast('Aufnahme konnte nicht gespeichert werden'); } }
    await saveTalk(ex, t);
    cleanup();
    await reviewSheet(ex, t, r, { fresh: true });
    after && after();
  }
  drawCard();
  requestAnimationFrame(tick);
}

// ================= Rückblick =================
export function reviewTips(r, target) {
  const tips = [];
  const T = target * 60, diff = r.total - T;
  const long = r.per.map((v, k) => ({ k, v, p: r.plan[k] })).filter((x) => judge(x.v, x.p) === 'long');
  const short = r.per.map((v, k) => ({ k, v, p: r.plan[k] })).filter((x) => judge(x.v, x.p) === 'short');
  if (Math.abs(diff) <= T * 0.1) tips.push('Zeit passt. Genau so weiter üben.');
  else if (diff > 0) tips.push(`${fmtT(diff)} zu lang. ${long.length ? `Kürz zuerst ${long.length === 1 ? 'Karte' : 'die Karten'} ${long.map((x) => x.k + 1).join(', ')}: ein Beispiel weniger oder ein Stichwort streichen.` : 'Streich auf jeder Karte ein Stichwort.'}`);
  else tips.push(`${fmtT(-diff)} zu kurz. ${short.length ? `Bei Karte ${short.map((x) => x.k + 1).join(', ')} ging es sehr schnell: ein Beispiel oder Bild dazu erklären.` : 'Erklär an einer Stelle ein Beispiel genauer.'} Und: langsam sprechen, Pausen machen.`);
  if (r.peeks >= 3) tips.push('Du hast oft gespickt. Lies die Karten vor dem nächsten Lauf einmal laut, dann klappt es freier.');
  else if ((r.mode === 'titles' || r.mode === 'blind') && r.peeks === 0) tips.push('Ohne Spicken geschafft. Stark!');
  return tips;
}
async function reviewSheet(ex, t, r, { fresh = false } = {}) {
  const recUrl = r.rec && r === t.runs[t.runs.length - 1] ? await db.getBlob('talkrec-' + ex.id).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null) : null;
  const T = (r.target || t.target) * 60;
  await sheet(fresh ? 'Geschafft!' : 'Probelauf', (body, close) => {
    const diff = r.total - T;
    const ok = Math.abs(diff) <= T * 0.1;
    const maxV = Math.max(...r.per, ...r.plan, 1);
    const rows = h('div.tkrev');
    r.per.forEach((v, k) => {
      const p = r.plan[k], j = judge(v, p);
      rows.append(h('div.tkrevrow.' + j, null,
        h('span.tkrevname', null, h('i', { text: String(k + 1) }), h('b', { text: (r.titles && r.titles[k]) || `Karte ${k + 1}` })),
        h('span.tkrevbar', null, h('i', { style: { width: (v / maxV) * 100 + '%' } }), h('em', { style: { left: (p / maxV) * 100 + '%' } })),
        h('span.tkrevval', null, h('b', { text: fmtT(v) }), h('small', { text: j === 'long' ? 'zu lang' : j === 'short' ? 'kurz' : 'passt' }))));
    });
    body.append(...[
      h('div.tkrevhead.' + (ok ? 'good' : 'mid'), null,
        h('b', { text: fmtT(r.total) }),
        h('span', null, h('strong', { text: ok ? 'Im Zeitrahmen' : diff > 0 ? `${fmtT(diff)} zu lang` : `${fmtT(-diff)} zu kurz` }),
          h('small', { text: `Ziel ${fmtT(T)} · ${MODES[r.mode] || ''}${r.peeks ? ` · ${r.peeks}× gespickt` : ''}` }))),
      rows,
      h('p.calm.small', { text: 'Strich = geplante Zeit der Karte.' }),
      h('ul.tktips', null, ...reviewTips(r, r.target || t.target).map((x) => h('li', { text: x }))),
      recUrl ? h('div.tkaudio', null, h('small', { text: 'Deine Aufnahme' }), h('audio', { controls: true, src: recUrl, preload: 'metadata' })) : null,
      h('div.dlgactions', null,
        !fresh ? h('button.btn.danger', { text: 'Löschen', on: { click: async () => { t.runs = t.runs.filter((x) => x !== r); await saveTalk(ex, t); close(); } } }) : null,
        h('button.btn.primary', { text: 'Fertig', on: { click: () => close() } }))].filter(Boolean));
  }, { wide: true });
  if (recUrl) URL.revokeObjectURL(recUrl);
}
