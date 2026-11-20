// Schulalltag: Stundenplan, Prüfungen (mit Countdown und Lernerinnerung), Noten mit Schnitt.
import * as db from './db.js';
import { micButton } from './speech.js';
import { $, h, icon, toast, plural, sheet, menu, confirmSheet } from './ui.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const mins = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DSHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// ================= Stundenplan =================
const DEFAULT_PERIODS = [['07:55', '08:40'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:40', '11:25'], ['11:40', '12:25'], ['12:30', '13:15'], ['13:45', '14:30'], ['14:30', '15:15']];
export async function getTimetable() {
  const t = await db.getMeta('timetable');
  return t || { id: 'timetable', days: 5, periods: DEFAULT_PERIODS.map(([s, e]) => ({ s, e })), cells: {} };
}
const saveTT = (t) => db.putItems('meta', t);
const dayIdx = (d = new Date()) => (d.getDay() + 6) % 7;   // Mo = 0

// Was ist jetzt dran, was als Nächstes? Gibt { now, next } mit { day, p, cell, start, end } zurück
export function nowNext(tt, at = new Date()) {
  const has = (d, p) => tt.cells[`${d}-${p}`] && tt.cells[`${d}-${p}`].subjectId;
  const m = at.getHours() * 60 + at.getMinutes();
  const today = dayIdx(at);
  let now = null, next = null;
  if (today < tt.days) {
    tt.periods.forEach((per, p) => {
      if (!has(today, p)) return;
      const s = mins(per.s), e = mins(per.e);
      if (s <= m && m < e) now = { day: today, p, s, e, offset: 0 };
      else if (s > m && !next) next = { day: today, p, s, e, offset: 0 };
    });
  }
  // nichts mehr heute: erster Unterricht an einem der nächsten Tage
  for (let k = 1; !next && k <= 7; k++) {
    const d = (today + k) % 7;
    if (d >= tt.days) continue;
    const p = tt.periods.findIndex((_, i) => has(d, i));
    if (p >= 0) next = { day: d, p, s: mins(tt.periods[p].s), e: mins(tt.periods[p].e), offset: k };
  }
  const fill = (x) => x && { ...x, cell: tt.cells[`${x.day}-${x.p}`] };
  return { now: fill(now), next: fill(next), minute: m };
}

export async function renderTimetable(ctx) {
  const [tt, subjects] = await Promise.all([getTimetable(), db.listSubjects()]);
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const again = () => renderTimetable(ctx);
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Stundenplan',
    meta: `${tt.periods.length} Stunden · ${DSHORT.slice(0, tt.days).join(' ')}`,
    actions: [ctx.iconBtn('more', 'Mehr', (e) => menu(e.currentTarget, [
      { label: 'Zeiten der Stunden ändern', icon: 'clock', onClick: () => editTimes(tt, again) },
      { label: 'Stunde hinzufügen', icon: 'plus', onClick: async () => { const l = tt.periods[tt.periods.length - 1]; const e = mins(l.e); tt.periods.push({ s: hm(e), e: hm(e + 45) }); await saveTT(tt); again(); } },
      { label: 'Letzte Stunde entfernen', icon: 'trash', onClick: async () => { if (tt.periods.length > 1) { tt.periods.pop(); await saveTT(tt); again(); } } },
      { label: tt.days === 6 ? 'Ohne Samstag' : 'Mit Samstag', icon: 'list', onClick: async () => { tt.days = tt.days === 6 ? 5 : 6; await saveTT(tt); again(); } },
    ])) ],
  });
  const view = $('view');
  view.textContent = '';
  if (!subjects.length) { view.append(h('p.calm', { text: 'Leg zuerst deine Fächer in der Bibliothek an.' })); return; }
  const nn = nowNext(tt);
  const today = dayIdx();
  const grid = h('div.tt', { style: { '--days': String(tt.days) } });
  grid.append(h('div.tthead.corner'));
  for (let d = 0; d < tt.days; d++) grid.append(h('div.tthead' + (d === today ? '.ttday' : ''), null, h('b', { text: DSHORT[d] }), h('small', { text: DAYS[d] })));
  tt.periods.forEach((per, p) => {
    grid.append(h('button.ttnum', { on: { click: () => editTimes(tt, again) } }, h('b', { text: String(p + 1) }), h('small', { text: `${per.s}\n${per.e}` })));
    for (let d = 0; d < tt.days; d++) {
      const c = tt.cells[`${d}-${p}`];
      const s = c && sm.get(c.subjectId);
      const isNow = nn.now && nn.now.day === d && nn.now.p === p;
      grid.append(h('button.ttcell' + (s ? '.set' : '') + (isNow ? '.now' : '') + (d === today ? '.ttcur' : ''), { style: s ? { '--c': s.color } : {}, on: { click: () => editCell(tt, d, p, subjects, again) } },
        s ? h('b', { text: s.name }) : h('span.plus', { text: '+' }),
        s && c.room ? h('small', { text: c.room }) : null));
    }
  });
  view.append(h('div.ttwrap', null, grid),
    h('p.calm.small', { text: 'Tipp auf ein Feld, um ein Fach und den Raum einzutragen. Auf eine Stundennummer, um die Zeiten zu ändern.' }));
}
const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

async function editCell(tt, d, p, subjects, after) {
  const key = `${d}-${p}`;
  const cur = tt.cells[key] || {};
  const res = await sheet(`${DAYS[d]}, ${p + 1}. Stunde`, (body, close) => {
    let pick = cur.subjectId || '';
    const chips = h('div.chips.left.subjpick');
    const mk = (id, name, color) => {
      const b = h('button.pchip' + (pick === id ? '.on' : ''), { style: color ? { '--c': color } : {}, on: { click: () => { pick = id; chips.querySelectorAll('.pchip').forEach((x) => x.classList.toggle('on', x === b)); } } },
        color ? h('i') : null, h('span', { text: name }));
      return b;
    };
    chips.append(mk('', 'Frei'), ...subjects.map((s) => mk(s.id, s.name, s.color)));
    const room = h('input.field', { type: 'text', id: 'ttRoom', placeholder: 'z. B. R 204', value: cur.room || '', autocomplete: 'off' });
    const copy = h('input', { type: 'checkbox', id: 'ttCopy' });
    body.append(h('p.fieldlabel', { text: 'Fach' }), chips,
      h('label.fieldlabel', { for: 'ttRoom', text: 'Raum (optional)' }), room,
      h('label.checkrow', { for: 'ttCopy' }, copy, h('span', null, h('b', { text: 'Auch die nächste Stunde (Doppelstunde)' }))),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => close({ subjectId: pick, room: room.value.trim(), copy: copy.checked }) } })));
  });
  if (!res) return;
  const val = res.subjectId ? { subjectId: res.subjectId, room: res.room } : null;
  const put = (k) => { if (val) tt.cells[k] = { ...val }; else delete tt.cells[k]; };
  put(key);
  if (res.copy && p + 1 < tt.periods.length) put(`${d}-${p + 1}`);
  await saveTT(tt);
  after();
}

async function editTimes(tt, after) {
  const res = await sheet('Zeiten der Stunden', (body, close) => {
    const rows = tt.periods.map((per, i) => {
      const s = h('input.field', { type: 'time', value: per.s }), e = h('input.field', { type: 'time', value: per.e });
      body.append(h('div.timerow', null, h('b', { text: `${i + 1}.` }), h('div.datewrap', null, s), h('span', { text: 'bis' }), h('div.datewrap', null, e)));
      return [s, e];
    });
    body.append(h('div.dlgactions', null,
      h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
      h('button.btn.primary', { text: 'Sichern', on: { click: () => close(rows.map(([s, e]) => ({ s: s.value || '08:00', e: e.value || '08:45' }))) } })));
  });
  if (!res) return;
  tt.periods = res;
  await saveTT(tt);
  after();
}

// Kasten „Jetzt / Als Nächstes“ für die Startseite (aktualisiert sich jede Minute)
export async function nowCard({ go, subjects }) {
  const tt = await getTimetable();
  if (!Object.keys(tt.cells).length) {
    return h('button.dash.nowcard.empty', { on: { click: () => go({ view: 'timetable' }) } },
      h('span.dashic', null, icon('grid')), h('span.dashtext', null, h('b', { text: 'Stundenplan eintragen' }), h('small', { text: 'Dann siehst du hier, was jetzt dran ist.' })));
  }
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const el = h('div.dash.nowcard');
  const draw = () => {
    if (!el.isConnected && el.dataset.drawn) { clearInterval(el._t); return; }
    el.dataset.drawn = '1';
    const { now, next, minute } = nowNext(tt);
    el.textContent = '';
    const block = (label, x, extra) => {
      const s = x && sm.get(x.cell.subjectId);
      if (!s) return null;
      return h('button.nowblock', { style: { '--c': s.color }, on: { click: () => go({ view: 'subject', subject: s }) } },
        h('small', { text: label }), h('b', { text: s.name }),
        h('span', { text: [x.cell.room, `${tt.periods[x.p].s}–${tt.periods[x.p].e}`, extra].filter(Boolean).join(' · ') }));
    };
    const whenNext = next && (next.offset === 0 ? `in ${next.s - minute} min` : next.offset === 1 ? 'morgen' : DAYS[next.day]);
    const nowB0 = now && block('Jetzt', now, `noch ${now.e - minute} min`);
    if (nowB0) nowB0.append(h('i.nowprog', { style: { '--p': String(Math.min(1, Math.max(0, (minute - now.s) / Math.max(1, now.e - now.s)))) } }));
    const nowB = now ? nowB0 : h('div.nowblock.free', null, h('small', { text: 'Jetzt' }), h('b', { text: next && next.offset === 0 ? 'Pause' : 'Kein Unterricht' }));
    el.append(nowB, next ? block('Als Nächstes', next, whenNext) : h('div.nowblock.free', null, h('small', { text: 'Als Nächstes' }), h('b', { text: '–' })),
      h('button.icbtn.dashmore', { 'aria-label': 'Stundenplan', on: { click: () => go({ view: 'timetable' }) } }, icon('grid')));
  };
  draw();
  el._t = setInterval(draw, 30000);
  return el;
}

// ================= Prüfungen =================
export const EXAM_KINDS = ['Klassenarbeit', 'Test', 'Klausur', 'Vokabeltest', 'Referat', 'Präsentation', 'Abgabe'];
export function daysUntil(date) { const t0 = new Date(); t0.setHours(0, 0, 0, 0); return Math.round((parseDate(date) - t0) / DAY); }
export function countdownText(n) { return n < 0 ? (n === -1 ? 'gestern' : `vor ${-n} Tagen`) : n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`; }

export async function editExam(ex, { subjects, after }) {
  const isNew = !ex.id;
  const oldRem = isNew ? null : (await db.listReminders()).find((r) => r.refId === ex.id && r.kind === 'lernen');
  const res = await sheet(isNew ? 'Neue Prüfung' : 'Prüfung', (body, close) => {
    const subj = h('select.field', { id: 'exSubj' }, ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
    subj.value = ex.subjectId || (subjects[0] && subjects[0].id) || '';
    const kind = h('select.field', { id: 'exKind' }, ...EXAM_KINDS.map((k) => h('option', { value: k, text: k })));
    kind.value = ex.kind || 'Klassenarbeit';
    const date = h('input.field', { type: 'date', id: 'exDate', value: ex.date || isoDate(new Date(Date.now() + 7 * DAY)) });
    const topic = h('textarea.field.area', { id: 'exTopic', rows: 2, placeholder: 'Thema, z. B. Lineare Funktionen, Buch S. 40–58' });
    topic.value = ex.topic || '';
    const learn = h('select.field', { id: 'exLearn' }, h('option', { value: '0', text: 'Keine Lernerinnerung' }),
      ...[3, 5, 7, 10, 14].map((n) => h('option', { value: String(n), text: `Jeden Tag 17 Uhr, ab ${n} Tagen vorher` })));
    learn.value = oldRem ? String(oldRem.days || 5) : isNew ? '5' : '0';
    body.append(
      h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'exSubj', text: 'Fach' }), subj), h('div', null, h('label.fieldlabel', { for: 'exKind', text: 'Art' }), kind)),
      h('label.fieldlabel', { for: 'exDate', text: 'Wann' }), h('div.datewrap', null, date),
      h('label.fieldlabel', { for: 'exTopic', text: 'Thema' }), h('div.micwrap', null, topic, micButton(topic)),
      h('label.fieldlabel', { for: 'exLearn', text: 'Lernerinnerung' }), learn,
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: isNew ? 'Eintragen' : 'Sichern', on: { click: () => {
          if (!subj.value) { toast('Leg zuerst ein Fach an'); return; }
          if (!date.value) { toast('Bitte ein Datum wählen'); return; }
          close({ subjectId: subj.value, kind: kind.value, date: date.value, topic: topic.value.trim(), learnDays: +learn.value });
        } } })));
  });
  if (!res) return;
  if (res === 'delete') {
    await db.deleteItems('exams', ex.id);
    if (oldRem) await db.deleteItems('reminders', oldRem.id);
    toast('Gelöscht'); after && after(); return;
  }
  const { learnDays, ...vals } = res;
  const [saved] = await db.putItems('exams', [{ ...ex, ...vals }]);
  // Lernerinnerung: täglich 17 Uhr von (Datum − n) bis zum Tag davor
  if (learnDays) {
    const d = parseDate(saved.date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - learnDays);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const until = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    const s = subjects.find((x) => x.id === saved.subjectId);
    const r = { ...(oldRem || {}), kind: 'lernen', refId: saved.id, subjectId: saved.subjectId, text: `Lernen: ${saved.kind} ${s ? s.name : ''}${saved.topic ? ' (' + saved.topic.split('\n')[0].slice(0, 50) + ')' : ''}`,
      date: isoDate(start < t0 ? t0 : start), time: '17:00', repeat: 'daily', until: isoDate(until), days: learnDays };
    if (!oldRem || oldRem.date !== r.date || oldRem.until !== r.until) { r.done = false; r.ack = 0; r.notified = 0; r.snoozeUntil = 0; }
    if (until >= t0) await db.putItems('reminders', r);
  } else if (oldRem) await db.deleteItems('reminders', oldRem.id);
  toast(isNew ? 'Prüfung eingetragen' : 'Gesichert');
  after && after();
}

function planPct(ex) { const t = ex.plan ? ex.plan.days.flatMap((d) => d.tasks) : []; return t.length ? Math.round(100 * t.filter((x) => x.done).length / t.length) : 0; }
function examRow(ex, s, { subjects, after, onGrade, onPlan }) {
  const n = daysUntil(ex.date);
  const d = parseDate(ex.date);
  return h('div.examrow' + (n < 0 ? '.past' : n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {} },
    h('div.examcount', null, h('b', { text: n < 0 ? '✓' : String(n) }), h('small', { text: n < 0 ? 'vorbei' : n === 1 ? 'Tag' : 'Tage' })),
    h('button.exambody', { on: { click: () => editExam(ex, { subjects, after }) } },
      h('b', { text: `${ex.kind}${s ? ' · ' + s.name : ''}` }),
      ex.topic ? h('span', { text: ex.topic }) : null,
      h('small', { text: `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. · ${countdownText(n)}` })),
    n > 0 && onPlan ? h('button.btn.small.planbtn' + (ex.plan ? '.has' : ''), { style: ex.plan ? { '--p': planPct(ex) + '%' } : {}, on: { click: () => onPlan(ex) } },
      icon('list'), h('span', { text: ex.plan ? `Lernplan ${planPct(ex)} %` : 'Lernplan' })) : null,
    n <= 0 && onGrade ? h('button.btn.small', { text: ex.gradeId ? 'Note ändern' : 'Note eintragen', on: { click: () => onGrade(ex) } }) : null);
}

export async function renderExams(ctx) {
  const [exams, subjects] = await Promise.all([db.listExams(), db.listSubjects()]);
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const again = () => renderExams(ctx);
  const upcoming = exams.filter((x) => daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const past = exams.filter((x) => daysUntil(x.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Prüfungen',
    meta: upcoming.length ? `${plural(upcoming.length, 'Prüfung', 'Prüfungen')} geplant` : 'Nichts geplant',
    actions: [ctx.btn('Neu', 'plus', () => subjects.length ? editExam({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  const onGrade = (ex) => gradeForExam(ex, again);
  const onPlan = (ex) => ctx.go({ view: 'plan', examId: ex.id });
  if (!exams.length) {
    view.append(h('section.empty', null, h('h2', { text: 'Keine Prüfungen eingetragen' }),
      h('p', { text: 'Trag Klassenarbeiten, Tests und Referate ein. Du siehst dann den Countdown, und die App erinnert dich jeden Tag ans Lernen.' }),
      h('div.emptyactions', null, ctx.btn('Prüfung eintragen', 'plus', () => subjects.length ? editExam({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary'))));
    return;
  }
  if (upcoming.length) {
    const l = h('div.examlist');
    for (const x of upcoming) l.append(examRow(x, sm.get(x.subjectId), { subjects, after: again, onGrade, onPlan }));
    view.append(h('section.subsec', null, h('h2.section', { text: 'Kommende' }), l));
  }
  if (past.length) {
    const l = h('div.examlist');
    for (const x of past.slice(0, 40)) l.append(examRow(x, sm.get(x.subjectId), { subjects, after: again, onGrade }));
    view.append(h('details.donebox', null, h('summary', { text: `Vorbei (${past.length})` }), l));
  }
}
async function gradeForExam(ex, after) {
  const subjects = await db.listSubjects();
  const existing = ex.gradeId ? (await db.listGrades()).find((g) => g.id === ex.gradeId) : null;
  const g = await editGrade(existing || { subjectId: ex.subjectId, cat: 'schriftlich', label: ex.kind + (ex.topic ? ': ' + ex.topic.split('\n')[0].slice(0, 40) : ''), date: ex.date }, { subjects });
  if (g && g.id) { ex.gradeId = g.id; await db.putItems('exams', ex); }
  after();
}

// Kasten „Nächste Prüfung“ für die Startseite
export async function examCard({ go, subjects }) {
  const ex = (await db.listExams()).filter((x) => daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!ex.length) {
    return h('button.dash.examcard.empty', { on: { click: () => go({ view: 'exams' }) } },
      h('span.dashic', null, icon('bookmark')), h('span.dashtext', null, h('b', { text: 'Keine Prüfung geplant' }), h('small', { text: 'Klassenarbeiten und Tests eintragen' })));
  }
  const x = ex[0], s = subjects.find((y) => y.id === x.subjectId), n = daysUntil(x.date);
  return h('button.dash.examcard' + (n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {}, on: { click: () => go({ view: 'exams' }) } },
    h('div.examcount', null, h('b', { text: String(n) }), h('small', { text: n === 1 ? 'Tag' : 'Tage' })),
    h('span.dashtext', null, h('small', { text: 'Nächste Prüfung' + (ex.length > 1 ? ` · ${ex.length - 1} weitere` : '') }), h('b', { text: `${x.kind}${s ? ' · ' + s.name : ''}` }),
      h('span', { text: x.topic ? x.topic.split('\n')[0] : countdownText(n) })));
}

// ================= Noten =================
const NOTEN = [['1+', 0.7], ['1', 1], ['1-', 1.3], ['2+', 1.7], ['2', 2], ['2-', 2.3], ['3+', 2.7], ['3', 3], ['3-', 3.3], ['4+', 3.7], ['4', 4], ['4-', 4.3], ['5+', 4.7], ['5', 5], ['5-', 5.3], ['6', 6]];
export async function gradeCfg() { return (await db.getMeta('gradecfg')) || { id: 'gradecfg', scale: 'noten', written: 50 }; }
const fmt1 = (v) => v.toFixed(2).replace('.', ',');
export function gradeLabel(v, scale) { if (scale === 'punkte') return String(v); const f = NOTEN.find(([, x]) => Math.abs(x - v) < 0.01); return f ? f[0] : fmt1(v); }
// Note gut/mittel/schlecht (für Farbe)
const tone = (v, scale) => { const n = scale === 'punkte' ? (17 - v) / 3 : v; return n <= 2.5 ? 'good' : n <= 4 ? 'mid' : 'bad'; };
export function average(grades, cfg) {
  const cat = (c) => { const g = grades.filter((x) => x.cat === c); const w = g.reduce((a, x) => a + (x.weight || 1), 0); return w ? g.reduce((a, x) => a + x.value * (x.weight || 1), 0) / w : null; };
  const s = cat('schriftlich'), m = cat('muendlich');
  if (s == null && m == null) return null;
  if (s == null) return m;
  if (m == null) return s;
  return s * cfg.written / 100 + m * (100 - cfg.written) / 100;
}

export async function editGrade(g, { subjects, after } = {}) {
  const cfg = await gradeCfg();
  const isNew = !g.id;
  const res = await sheet(isNew ? 'Neue Note' : 'Note', (body, close) => {
    let val = g.value;
    const pick = h('div.gradepick' + (cfg.scale === 'punkte' ? '.pts' : ''));
    const opts = cfg.scale === 'punkte' ? Array.from({ length: 16 }, (_, i) => [String(15 - i), 15 - i]) : NOTEN;
    for (const [l, v] of opts) {
      const b = h('button.gp.' + tone(v, cfg.scale) + (val === v ? '.on' : ''), { text: l, on: { click: () => { val = v; pick.querySelectorAll('.gp').forEach((x) => x.classList.toggle('on', x === b)); } } });
      pick.append(b);
    }
    const subj = h('select.field', { id: 'grSubj' }, ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
    subj.value = g.subjectId || (subjects[0] && subjects[0].id) || '';
    const cat = h('select.field', { id: 'grCat' }, h('option', { value: 'schriftlich', text: 'Schriftlich (Arbeit, Test)' }), h('option', { value: 'muendlich', text: 'Mündlich / Mitarbeit' }));
    cat.value = g.cat || 'schriftlich';
    const label = h('input.field', { type: 'text', id: 'grLabel', placeholder: 'z. B. 1. Klassenarbeit', value: g.label || '', autocomplete: 'off' });
    const weight = h('select.field', { id: 'grW' }, ...[[0.5, 'halb'], [1, 'normal'], [2, 'doppelt']].map(([v, l]) => h('option', { value: String(v), text: `Gewicht: ${l}` })));
    weight.value = String(g.weight || 1);
    const date = h('input.field', { type: 'date', id: 'grDate', value: g.date || isoDate(new Date()) });
    body.append(h('p.fieldlabel', { text: cfg.scale === 'punkte' ? 'Punkte' : 'Note' }), pick,
      h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'grSubj', text: 'Fach' }), subj), h('div', null, h('label.fieldlabel', { for: 'grCat', text: 'Art' }), cat)),
      h('label.fieldlabel', { for: 'grLabel', text: 'Wofür (optional)' }), label,
      h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'grDate', text: 'Datum' }), h('div.datewrap', null, date)), h('div', null, h('label.fieldlabel', { for: 'grW', text: 'Zählt' }), weight)),
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => {
          if (val == null) { toast('Bitte eine Note antippen'); return; }
          close({ value: val, subjectId: subj.value, cat: cat.value, label: label.value.trim(), weight: +weight.value, date: date.value });
        } } })));
  });
  if (!res) return null;
  if (res === 'delete') { await db.deleteItems('grades', g.id); toast('Gelöscht'); after && after(); return null; }
  const [saved] = await db.putItems('grades', [{ ...g, ...res }]);
  toast('Note gespeichert');
  after && after();
  return saved;
}

export async function renderGrades(ctx) {
  const [grades, subjects, cfg] = await Promise.all([db.listGrades(), db.listSubjects(), gradeCfg()]);
  const again = () => renderGrades(ctx);
  const per = subjects.map((s) => { const g = grades.filter((x) => x.subjectId === s.id && x.value != null); return { s, g, avg: average(g, cfg) }; });
  const withAvg = per.filter((x) => x.avg != null);
  const total = withAvg.length ? withAvg.reduce((a, x) => a + x.avg, 0) / withAvg.length : null;
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Noten',
    meta: total != null ? `Gesamtschnitt ${cfg.scale === 'punkte' ? total.toFixed(1).replace('.', ',') + ' Punkte' : fmt1(total)}` : 'Noch keine Noten',
    actions: [ctx.iconBtn('more', 'Einstellungen', (e) => menu(e.currentTarget, [
      { label: cfg.scale === 'punkte' ? 'Auf Noten 1–6 umstellen' : 'Auf Punkte 0–15 umstellen', icon: 'list', onClick: async () => {
        if (grades.length && !(await confirmSheet('Skala wechseln?', 'Schon eingetragene Noten werden nicht umgerechnet. Am besten nur am Anfang wechseln.', 'Wechseln', false))) return;
        cfg.scale = cfg.scale === 'punkte' ? 'noten' : 'punkte'; await db.putItems('meta', cfg); again(); } },
      { label: `Gewichtung schriftlich ${cfg.written} % …`, icon: 'edit', onClick: async () => {
        const v = await sheet('Gewichtung', (body, close) => {
          const sel = h('select.field', { id: 'wSel' }, ...[30, 40, 50, 60, 67, 70].map((n) => h('option', { value: String(n), text: `Schriftlich ${n} % · mündlich ${100 - n} %` })));
          sel.value = String(cfg.written);
          body.append(h('p.dlgtext', { text: 'Frag im Zweifel deine Lehrkraft. Oft ist es 50 zu 50.' }), sel,
            h('div.dlgactions', null, h('button.btn.primary', { text: 'Sichern', on: { click: () => close(+sel.value) } })));
        });
        if (v) { cfg.written = v; await db.putItems('meta', cfg); again(); }
      } },
    ])), ctx.btn('Note', 'plus', () => subjects.length ? editGrade({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  if (!subjects.length) { view.append(h('p.calm', { text: 'Leg zuerst deine Fächer an.' })); return; }
  const grid = h('div.gradegrid');
  for (const { s, g, avg } of per) {
    const chips = h('div.gchips');
    for (const x of g.sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
      chips.append(h('button.gchip.' + tone(x.value, cfg.scale) + (x.cat === 'muendlich' ? '.oral' : ''), { title: [x.label, x.cat === 'muendlich' ? 'mündlich' : 'schriftlich'].filter(Boolean).join(' · '),
        on: { click: () => editGrade(x, { subjects, after: again }) } }, gradeLabel(x.value, cfg.scale)));
    }
    chips.append(h('button.gchip.add', { 'aria-label': 'Note hinzufügen', on: { click: () => editGrade({ subjectId: s.id }, { subjects, after: again }) } }, '+'));
    grid.append(h('div.gradecard', { style: { '--c': s.color } },
      h('div.gchead', null, h('b', { text: s.name }),
        h('span.gavg' + (avg != null ? '.' + tone(avg, cfg.scale) : ''), { text: avg == null ? '–' : cfg.scale === 'punkte' ? avg.toFixed(1).replace('.', ',') : fmt1(avg) })),
      chips,
      h('small.gcount', { text: g.length ? `${g.filter((x) => x.cat === 'schriftlich').length} schriftlich · ${g.filter((x) => x.cat === 'muendlich').length} mündlich` : 'Noch keine Noten' })));
  }
  view.append(grid, h('p.calm.small', { text: `Schnitt = schriftlich ${cfg.written} % + mündlich ${100 - cfg.written} %. Mündliche Noten haben einen gestrichelten Rand. Das ist eine Schätzung, deine Lehrkraft kann anders rechnen.` }));
}

// Kleine Zusammenfassung für die Fach-Seite
export async function subjectSchoolBox(s, { go, after }) {
  const [grades, exams, cfg, subjects] = await Promise.all([db.listGrades(), db.listExams(), gradeCfg(), db.listSubjects()]);
  const g = grades.filter((x) => x.subjectId === s.id);
  const avg = average(g, cfg);
  const next = exams.filter((x) => x.subjectId === s.id && daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return h('section.subsec.schoolbox', null,
    h('button.sbitem', { on: { click: () => go({ view: 'grades' }) } }, h('small', { text: 'Schnitt' }), h('b', { text: avg == null ? '–' : cfg.scale === 'punkte' ? avg.toFixed(1).replace('.', ',') : fmt1(avg) }), h('span', { text: plural(g.length, 'Note', 'Noten') })),
    h('button.sbitem', { on: { click: () => (next ? editExam(next, { subjects, after }) : editExam({ subjectId: s.id }, { subjects, after })) } },
      h('small', { text: 'Nächste Prüfung' }), h('b', { text: next ? countdownText(daysUntil(next.date)) : '–' }), h('span', { text: next ? next.kind : 'eintragen' })),
    h('button.sbitem.add', { on: { click: () => editGrade({ subjectId: s.id }, { subjects, after }) } }, icon('plus'), h('span', { text: 'Note eintragen' })));
}
