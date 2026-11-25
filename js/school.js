// Schulalltag: Stundenplan, Prüfungen (mit Countdown und Lernerinnerung), Noten mit Schnitt.
import * as db from './db.js';
import { micButton } from './speech.js';
import { editHomework } from './homework.js';
import { syncTutoringReminder, tutoringReminderOf, toCalendar } from './reminders.js';
import { $, h, icon, toast, plural, sheet, menu, confirmSheet, saveFile } from './ui.js';
import { vplanBox, vplanCfg, vplanCached, vplanSetup, entriesByDate, weekMarks, periodsOf, kindOf, shortText, showEntries, refreshIfOld, isoDate as vpIso } from './vplan.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const mins = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DSHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// ================= Stundenplan =================
const OLD_DEFAULT = [['07:55', '08:40'], ['08:45', '09:30'], ['09:50', '10:35'], ['10:40', '11:25'], ['11:40', '12:25'], ['12:30', '13:15'], ['13:45', '14:30'], ['14:30', '15:15']];
// Eigene Schulzeiten: 3 Blöcke à 2 Schulstunden (45 + 45 Min) ab 07:55, je 20 Min Pause dazwischen
const BLOCK = { start: '07:55', len: 45, blocks: 3, pauses: [20, 20] };
function blockPeriods({ start, len, blocks, pauses }) {
  const f = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const out = []; let t = mins(start);
  for (let b = 0; b < blocks; b++) {
    for (let k = 0; k < 2; k++) { out.push({ s: f(t), e: f(t + len) }); t += len; }
    t += pauses[b] ?? pauses[pauses.length - 1] ?? 0;
  }
  return out;
}
const DEFAULT_PERIODS = blockPeriods(BLOCK).map((p) => [p.s, p.e]);
export async function getTimetable() {
  const t = await db.getMeta('timetable');
  // Alte Standard-Zeiten (nie geändert) auf die neuen Schulzeiten umstellen
  if (t && t.periods && t.periods.length === OLD_DEFAULT.length && t.periods.every((p, i) => p.s === OLD_DEFAULT[i][0] && p.e === OLD_DEFAULT[i][1]) && !t.timesSet) {
    const used = Object.keys(t.cells || {}).some((k) => +k.split('-')[1] >= DEFAULT_PERIODS.length);
    const fresh = DEFAULT_PERIODS.map(([s, e]) => ({ s, e }));
    t.periods = used ? [...fresh, ...t.periods.slice(DEFAULT_PERIODS.length)] : fresh;
    t.timesSet = 1;
    await saveTT(t);
  }
  return t || { id: 'timetable', days: 5, periods: DEFAULT_PERIODS.map(([s, e]) => ({ s, e })), cells: {} };
}
const saveTT = (t) => db.putItems('meta', t);
const dayIdx = (d = new Date()) => (d.getDay() + 6) % 7;   // Mo = 0

// Was ist jetzt dran, was als Nächstes? Gibt { now, next } mit { day, p, cell, start, end } zurück
export function nowNext(tt, at = new Date()) {
  const has = (d, p) => !(tt.periods[p] && tt.periods[p].pause) && tt.cells[`${d}-${p}`] && tt.cells[`${d}-${p}`].subjectId;
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
      { label: 'Mittagspause einfügen', icon: 'clock', onClick: () => insertPause(tt, again) },
      { label: 'Vertretungsplan verbinden', icon: 'list', onClick: () => vplanSetup(again) },
    ])), ctx.btn('Nachhilfe', 'plus', () => editTutoring(tt, null, subjects, again)) ],
  });
  const view = $('view');
  view.textContent = '';
  if (!subjects.length) { view.append(h('p.calm', { text: 'Leg zuerst deine Fächer in der Bibliothek an.' })); return; }
  const nn = nowNext(tt);
  const today = dayIdx();
  // Vertretungsplan: Markierungen für diese Woche (am Wochenende für die nächste)
  const [vpCfg, vpRec] = await Promise.all([vplanCfg(), vplanCached()]);
  const vpMonday = new Date(); vpMonday.setHours(0, 0, 0, 0); vpMonday.setDate(vpMonday.getDate() - today + (today >= tt.days ? 7 : 0));
  const vpMarks = vpCfg && vpCfg.url ? weekMarks(entriesByDate(vpRec && vpRec.data, vpCfg.klasse), vpMonday, tt.days) : new Map();
  const RANK = { aus: 3, vt: 2, raum: 1 };
  const grid = h('div.tt', { style: { '--days': String(tt.days) } });
  grid.append(h('div.tthead.corner'));
  for (let d = 0; d < tt.days; d++) grid.append(h('div.tthead' + (d === today ? '.ttday' : ''), null, h('b', { text: DSHORT[d] }), h('small', { text: DAYS[d] })));
  tt.periods.forEach((per, p) => {
    if (per.pause) {
      // Pause zählt mit (damit „8. Stunde“ im Vertretungsplan in die richtige Zeile kommt), hat aber keinen Unterricht
      grid.append(h('button.ttnum.ttpausenum', { on: { click: () => editTimes(tt, again) } }, h('b', { text: String(p + 1) }), h('small', { text: `${per.s}\n${per.e}` })),
        h('button.ttpause', { style: { gridColumn: `span ${tt.days}` }, on: { click: () => editTimes(tt, again) } }, h('span', { text: per.name || 'Mittagspause' }), h('small', { text: `${per.s}–${per.e}` })));
      return;
    }
    grid.append(h('button.ttnum', { on: { click: () => editTimes(tt, again) } }, h('b', { text: String(p + 1) }), h('small', { text: `${per.s}\n${per.e}` })));
    for (let d = 0; d < tt.days; d++) {
      const c = tt.cells[`${d}-${p}`];
      const s = c && sm.get(c.subjectId);
      const isNow = nn.now && nn.now.day === d && nn.now.p === p;
      const vp = vpMarks.get(`${d}-${p}`);
      const vk = vp && vp.map(kindOf).sort((a, b) => RANK[b] - RANK[a])[0];
      const vpDate = vp && new Date(vpMonday.getFullYear(), vpMonday.getMonth(), vpMonday.getDate() + d);
      const click = vp ? () => showEntries(`${DAYS[d]} ${vpDate.getDate()}.${vpDate.getMonth() + 1}., ${p + 1}. Stunde`, vp, { onEdit: () => editCell(tt, d, p, subjects, again) }) : () => editCell(tt, d, p, subjects, again);
      grid.append(h('button.ttcell' + (s ? '.set' : '') + (isNow ? '.now' : '') + (d === today ? '.ttcur' : '') + (vp ? '.vp.vp-' + vk : ''), { style: s ? { '--c': s.color } : {}, on: { click } },
        s ? h('b', { text: s.name }) : (vp ? null : h('span.plus', { text: '+' })),
        s && vk !== 'raum' && ((vp && (vp.find((x) => x.raum) || {}).raum) || c.room) ? h('small', { text: (vp && (vp.find((x) => x.raum) || {}).raum) || c.room }) : null,
        vp ? h('span.vpbadge', { text: shortText(vp.find((x) => kindOf(x) === vk)) + (vp.length > 1 ? ` +${vp.length - 1}` : '') }) : null));
    }
  });
  // Nachhilfe-Zeile unter dem Unterricht (diese Woche)
  const tuts = tt.tutoring || [];
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - today);
  grid.append(h('div.ttnum.tutnum', null, h('b', { text: 'NH' }), h('small', { text: 'Nach-\nhilfe' })));
  for (let d = 0; d < tt.days; d++) {
    const date = new Date(monday); date.setDate(monday.getDate() + d);
    const list = tutoringOn(tt, date);
    const cell = h('div.ttcell.tutcell' + (d === today ? '.ttcur' : ''));
    for (const t of list) {
      const s = sm.get(t.subjectId);
      cell.append(h('button.tutchip', { style: s ? { '--c': s.color } : {}, on: { click: () => editTutoring(tt, t, subjects, again) } },
        h('b', { text: s ? s.name : 'Nachhilfe' }), h('small', { text: `${t.s}–${t.e}` })));
    }
    if (!list.length) cell.append(h('button.tutadd', { 'aria-label': `Nachhilfe am ${DAYS[d]} eintragen`, on: { click: () => editTutoring(tt, { day: d }, subjects, again) } }, h('span.plus', { text: '+' })));
    grid.append(cell);
  }
  const hw = (await db.listHomework()).filter((x) => x.tut && !x.done);
  const tutBox = h('section.tutbox', null,
    h('div.colhead', null, h('h2.section', { text: 'Nachhilfe' }), h('button.txt.strong', { text: '+ Eintragen', on: { click: () => editTutoring(tt, null, subjects, again) } })));
  if (tuts.length) {
    for (const t of [...tuts].sort((a, b) => (nextTutorDate(a) || '9').localeCompare(nextTutorDate(b) || '9') || a.s.localeCompare(b.s))) {
      const s = sm.get(t.subjectId);
      const nHw = hw.filter((x) => x.subjectId === t.subjectId).length;
      tutBox.append(h('button.dayrow.tutrow', { style: s ? { '--c': s.color } : {}, on: { click: () => editTutoring(tt, t, subjects, again) } },
        h('span.daytime', { text: `${t.s}\n${t.e}` }),
        h('span', null, h('b', { text: `${s ? s.name : 'Fach gelöscht'}${nHw ? ` · ${plural(nHw, 'Hausaufgabe', 'Hausaufgaben')} offen` : ''}` }),
          h('small', { text: [tutWhen(t), t.teacher, t.place].filter(Boolean).join(' · ') }))));
    }
  } else tutBox.append(h('p.calm', { text: 'Noch keine Nachhilfe eingetragen. Sie erscheint dann in der Zeile „NH“ unter deinem Unterricht.' }));
  view.append(h('div.ttwrap', null, grid),
    h('p.calm.small', { text: 'Tipp auf ein Feld, um ein Fach und den Raum einzutragen. Auf eine Stundennummer, um die Zeiten zu ändern. In der Zeile „NH“ trägst du Nachhilfe ein.' + (vpMarks.size && today >= tt.days ? ' Die Vertretungen oben gelten für nächste Woche.' : '') }),
    await vplanBox({ onChange: () => { if (grid.isConnected) again(); } }),
    tutBox);
  // Vertretungsplan im Hintergrund nachladen, wenn er älter als 10 Minuten ist
  refreshIfOld(10, () => { if (grid.isConnected) again(); });
}

// ================= Nachhilfe =================
// Eintrag: { id, subjectId, weekly, day (Mo = 0 … So = 6), date (bei einmalig), s, e, teacher, place }
const DSHORT7 = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS7 = [...DAYS, 'Sonntag'];
export function tutoringOn(tt, date) {
  const d = dayIdx(date), key = isoDate(date);
  return (tt.tutoring || []).filter((t) => (t.weekly ? t.day === d : t.date === key)).sort((a, b) => a.s.localeCompare(b.s));
}
export function nextTutorDate(t, from = new Date()) {
  const t0 = new Date(from); t0.setHours(0, 0, 0, 0);
  if (!t.weekly) return t.date && parseDate(t.date) >= t0 ? t.date : null;
  const k = (t.day - dayIdx(t0) + 7) % 7;
  const d = new Date(t0); d.setDate(t0.getDate() + k);
  return isoDate(d);
}
function tutWhen(t) {
  if (t.weekly) return `jeden ${DAYS7[t.day]}`;
  if (!t.date) return 'einmalig';
  const d = parseDate(t.date);
  return `einmalig am ${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
export async function editTutoring(tt, t, subjects, after) {
  const isNew = !t || !t.id;
  const cur = { weekly: true, day: Math.min(dayIdx(), 4), s: '15:00', e: '16:00', ...(t || {}) };
  if (!cur.date) cur.date = nextTutorDate({ weekly: true, day: cur.day });
  const oldRem = isNew ? null : await tutoringReminderOf(t.id);
  const res = await sheet(isNew ? 'Nachhilfe eintragen' : 'Nachhilfe', (body, close) => {
    let pick = cur.subjectId || '', weekly = cur.weekly !== false, day = cur.day;
    const chips = h('div.chips.left.subjpick');
    for (const s of subjects) {
      const b = h('button.pchip' + (pick === s.id ? '.on' : ''), { style: { '--c': s.color }, on: { click: () => { pick = s.id; chips.querySelectorAll('.pchip').forEach((x) => x.classList.toggle('on', x === b)); } } }, h('i'), h('span', { text: s.name }));
      chips.append(b);
    }
    const days = h('div.chips.left.tutdays');
    DSHORT7.forEach((l, i) => {
      const b = h('button.pchip.small' + (day === i ? '.on' : ''), { text: l, 'aria-label': DAYS7[i], on: { click: () => { day = i; days.querySelectorAll('.pchip').forEach((x) => x.classList.toggle('on', x === b)); } } });
      days.append(b);
    });
    const date = h('input.field', { type: 'date', id: 'tutDate', value: cur.date || '' });
    const dayBox = h('div', null, h('p.fieldlabel', { text: 'Tag' }), days);
    const dateBox = h('div', null, h('label.fieldlabel', { for: 'tutDate', text: 'Datum' }), h('div.datewrap', null, date));
    const seg = h('div.gseg.tutseg');
    const drawSeg = () => {
      seg.replaceChildren(
        h('button' + (weekly ? '.on' : ''), { text: 'Jede Woche', on: { click: () => { weekly = true; drawSeg(); } } }),
        h('button' + (!weekly ? '.on' : ''), { text: 'Einmal', on: { click: () => { weekly = false; drawSeg(); } } }));
      dayBox.hidden = !weekly; dateBox.hidden = weekly;
    };
    drawSeg();
    const from = h('input.field', { type: 'time', id: 'tutFrom', value: cur.s });
    const to = h('input.field', { type: 'time', id: 'tutTo', value: cur.e });
    const teacher = h('input.field', { type: 'text', id: 'tutTeacher', placeholder: 'z. B. Frau Weber', value: cur.teacher || '', autocomplete: 'off' });
    const place = h('input.field', { type: 'text', id: 'tutPlace', placeholder: 'z. B. Lernstudio, online', value: cur.place || '', autocomplete: 'off' });
    const rem = h('select.field', { id: 'tutRem' },
      ...[['', 'Nicht erinnern'], ['15', '15 Minuten vorher'], ['30', '30 Minuten vorher'], ['60', '1 Stunde vorher'], ['eve', 'Am Tag vorher um 17 Uhr']].map(([v, l]) => h('option', { value: v, text: l })));
    rem.value = oldRem ? (oldRem.before || '30') : (isNew ? '30' : '');
    const cal = h('input', { type: 'checkbox', id: 'tutCal' });
    const read = () => {
      if (!pick) { toast('Tipp an, für welches Fach die Nachhilfe ist.'); return null; }
      if (!from.value || !to.value || to.value <= from.value) { toast('Die Endzeit muss nach der Startzeit liegen.'); return null; }
      if (!weekly && !date.value) { toast('Wähl ein Datum.'); return null; }
      return { subjectId: pick, weekly, day: weekly ? day : dayIdx(parseDate(date.value)), date: weekly ? null : date.value, s: from.value, e: to.value, teacher: teacher.value.trim(), place: place.value.trim(), remBefore: rem.value, cal: cal.checked };
    };
    body.append(h('p.fieldlabel', { text: 'Fach' }), chips,
      h('p.fieldlabel', { text: 'Wie oft' }), seg, dayBox, dateBox,
      h('div.ttpgrid.tuttimes', null,
        h('label', { for: 'tutFrom' }, h('span.fieldlabel', { text: 'Von' }), from),
        h('label', { for: 'tutTo' }, h('span.fieldlabel', { text: 'Bis' }), to)),
      h('div.ttpgrid.tuttimes', null,
        h('label', { for: 'tutTeacher' }, h('span.fieldlabel', { text: 'Lehrer/in (optional)' }), teacher),
        h('label', { for: 'tutPlace' }, h('span.fieldlabel', { text: 'Ort (optional)' }), place)),
      h('label.fieldlabel', { for: 'tutRem', text: 'Erinnern (mit offenen Nachhilfe-Hausaufgaben)' }), rem,
      document.documentElement.dataset.artifact ? null : h('label.checkrow', { for: 'tutCal' }, cal, h('span', null,
        h('b', { text: 'Erinnerung auch im iPad-Kalender eintragen' }),
        h('small', { text: 'Dann klingelt es auch, wenn die App geschlossen ist.' }))),
      h('button.btn.tuthw', { on: { click: () => { const v = read(); if (v) close({ ...v, hw: true }); } } }, icon('homework'), 'Hausaufgabe von der Nachhilfe eintragen'),
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: isNew ? 'Eintragen' : 'Sichern', on: { click: () => { const v = read(); if (v) close(v); } } })));
  });
  if (!res) return;
  tt.tutoring = tt.tutoring || [];
  if (res === 'delete') {
    tt.tutoring = tt.tutoring.filter((x) => x.id !== t.id);
    await syncTutoringReminder(t, '');
    await saveTT(tt); toast('Nachhilfe gelöscht'); after(); return;
  }
  const { hw, remBefore, cal, ...vals } = res;
  const entry = { ...(t || {}), ...vals, id: (t && t.id) || 'tut' + Date.now().toString(36) };
  tt.tutoring = [...tt.tutoring.filter((x) => x.id !== entry.id), entry];
  await saveTT(tt);
  const subj = subjects.find((x) => x.id === entry.subjectId);
  const r = await syncTutoringReminder(entry, remBefore, { subjectName: subj && subj.name, firstDate: nextTutorDate(entry) });
  if (r && cal) { try { await toCalendar(r, { saveFile, subjectName: subj && subj.name }); } catch (e) { toast(e.message || 'Kalender ging nicht'); } }
  if (!hw) toast(isNew ? 'Nachhilfe eingetragen' : 'Gesichert');
  after();
  if (hw) await editHomework({ subjectId: entry.subjectId, tut: true, due: nextTutorDate(entry, new Date(Date.now() + DAY)) || '' }, { after });
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

// Mittagspause als eigene Zeile einfügen. Alles danach rutscht eine Zeile nach unten (Nummern wie in der Schule).
async function insertPause(tt, after) {
  const firstPause = tt.periods.findIndex((p) => p.pause);
  const res = await sheet('Mittagspause einfügen', (body, close) => {
    const sel = h('select.field', { id: 'pzAfter' }, ...tt.periods.map((p, i) => h('option', { value: i + 1, text: `nach der ${i + 1}. Stunde (${p.e})` })));
    sel.value = String(Math.min(6, tt.periods.length));
    const len = h('input.field', { type: 'number', id: 'pzLen', min: 5, max: 120, value: 45, inputmode: 'numeric' });
    body.append(h('p.dlgtext', { text: 'Die Pause bekommt eine eigene Nummer, so wie in der Schule (z. B. 7. Stunde = Mittagspause). Deine Fächer danach rutschen eine Zeile nach unten.' }),
      h('label.fieldlabel', { for: 'pzAfter', text: 'Wo?' }), sel,
      h('label.fieldlabel', { for: 'pzLen', text: 'Wie lange? (Minuten)' }), len,
      firstPause >= 0 ? h('p.calm.small', { text: `Es gibt schon eine Pause (${firstPause + 1}.). Die kannst du unter „Zeiten der Stunden“ ändern.` }) : '',
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Einfügen', on: { click: () => close({ at: +sel.value, len: Math.max(5, +len.value || 45) }) } })));
  });
  if (!res) return;
  const at = res.at;   // neue Zeile hat den Index at
  const s = mins(tt.periods[at - 1].e);
  const e = s + res.len;
  // Zellen ab „at“ eine Zeile nach unten schieben (von hinten, damit nichts überschrieben wird)
  const cells = {};
  for (const [k, v] of Object.entries(tt.cells)) { const [d, p] = k.split('-').map(Number); cells[`${d}-${p >= at ? p + 1 : p}`] = v; }
  tt.cells = cells;
  // Zeiten danach nur verschieben, wenn sie sich mit der Pause überschneiden
  const rest = tt.periods.slice(at);
  const shift = rest.length && mins(rest[0].s) < e ? e - mins(rest[0].s) : 0;
  tt.periods = [...tt.periods.slice(0, at), { s: hm(s), e: hm(e), pause: 1 }, ...rest.map((p) => (shift ? { ...p, s: hm(mins(p.s) + shift), e: hm(mins(p.e) + shift) } : p))];
  tt.timesSet = 1;
  await saveTT(tt);
  toast('Mittagspause eingefügt');
  after();
}

async function editTimes(tt, after) {
  let list = tt.periods.map((p) => ({ ...p }));
  const res = await sheet('Zeiten der Stunden', (body, close) => {
    // Schnell-Vorlage: Doppelstunden mit Pausen
    const st = h('input.field', { type: 'time', value: BLOCK.start });
    const nb = h('select.field', null, ...[2, 3, 4].map((n) => h('option', { value: n, text: `${n} Blöcke` }))); nb.value = '3';
    const p1 = h('input.field', { type: 'number', min: 0, max: 90, value: 20, inputmode: 'numeric' });
    const p2 = h('input.field', { type: 'number', min: 0, max: 90, value: 20, inputmode: 'numeric' });
    const box = h('div.ttpreset', null,
      h('b', { text: 'Doppelstunden (2 × 45 Min)' }),
      h('div.ttpgrid', null,
        h('label', null, h('small', { text: 'Beginn' }), h('div.datewrap', null, st)),
        h('label', null, h('small', { text: 'Anzahl' }), nb),
        h('label', null, h('small', { text: '1. Pause (Min)' }), p1),
        h('label', null, h('small', { text: 'Weitere Pausen' }), p2)),
      h('button.btn.small', { text: 'Zeiten ausrechnen', on: { click: () => {
        list = blockPeriods({ start: st.value || '07:55', len: 45, blocks: +nb.value, pauses: [+p1.value || 0, +p2.value || 0] });
        draw();
      } } }));
    const rowsBox = h('div.ttrows');
    let rows = [];
    const draw = () => {
      rowsBox.textContent = '';
      rows = list.map((per, i) => {
        const s = h('input.field', { type: 'time', value: per.s }), e = h('input.field', { type: 'time', value: per.e });
        const pz = h('input', { type: 'checkbox', id: 'ttPz' + i });
        pz.checked = !!per.pause;
        rowsBox.append(h('div.timerow.withpause', null, h('b', { text: `${i + 1}.` }), h('div.datewrap', null, s), h('span', { text: 'bis' }), h('div.datewrap', null, e),
          h('label.ttpzlabel', { for: 'ttPz' + i }, pz, h('span', { text: 'Pause' }))));
        return [s, e, pz];
      });
    };
    draw();
    body.append(box, rowsBox, h('div.dlgactions', null,
      h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
      h('button.btn.primary', { text: 'Sichern', on: { click: () => close(rows.map(([s, e, pz]) => ({ s: s.value || '08:00', e: e.value || '08:45', ...(pz.checked ? { pause: 1 } : {}) }))) } })));
  });
  if (!res) return;
  tt.periods = res;
  res.forEach((per, p) => { if (per.pause) for (let d = 0; d < 7; d++) delete tt.cells[`${d}-${p}`]; });
  tt.timesSet = 1;
  await saveTT(tt);
  after();
}

// Kasten „Jetzt / Als Nächstes“ für die Startseite (aktualisiert sich jede Minute)
export async function nowCard({ go, subjects }) {
  const tt = await getTimetable();
  if (!Object.keys(tt.cells).length && !(tt.tutoring || []).length) {
    return h('button.dash.nowcard.empty', { on: { click: () => go({ view: 'timetable' }) } },
      h('span.dashic', null, icon('grid')), h('span.dashtext', null, h('b', { text: 'Stundenplan eintragen' }), h('small', { text: 'Dann siehst du hier, was jetzt dran ist.' })));
  }
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const el = h('div.dash.nowcard');
  // Vertretungsplan (gespeicherter Stand; im Hintergrund nachladen, wenn älter als 20 Minuten)
  let vpBy = new Map();
  const vpLoad = async () => { const [c, r] = await Promise.all([vplanCfg(), vplanCached()]); vpBy = c && c.url ? entriesByDate(r && r.data, c.klasse) : new Map(); };
  await vpLoad();
  refreshIfOld(20, async () => { await vpLoad(); if (el.isConnected) draw(); });
  const vpFor = (x) => {
    const d = new Date(); d.setDate(d.getDate() + (x.offset || 0));
    const e = vpBy.get(vpIso(d));
    const hit = e && e.list.filter((v) => periodsOf(v.stunde).includes(x.p + 1));
    if (!hit || !hit.length) return null;
    return hit.find((v) => kindOf(v) === 'aus') || hit[0];
  };
  const draw = () => {
    if (!el.isConnected && el.dataset.drawn) { clearInterval(el._t); return; }
    el.dataset.drawn = '1';
    let { now, next, minute } = nowNext(tt);
    // Nachhilfe heute einbeziehen
    let tNow = null, tNext = null;
    for (const t of tutoringOn(tt, new Date())) {
      if (!sm.has(t.subjectId)) continue;
      const s0 = mins(t.s), e0 = mins(t.e);
      if (s0 <= minute && minute < e0) tNow = { t, s: s0, e: e0 };
      else if (s0 > minute && !tNext) tNext = { t, s: s0, e: e0 };
    }
    if (tNow && !now) now = { tut: tNow.t, s: tNow.s, e: tNow.e };
    if (tNext && (!next || next.offset > 0 || tNext.s < next.s) && !(now && now.tut === tNext.t)) next = { tut: tNext.t, s: tNext.s, e: tNext.e, offset: 0 };
    el.textContent = '';
    const block = (label, x, extra) => {
      if (x && x.tut) {
        const s = sm.get(x.tut.subjectId);
        return h('button.nowblock.tut', { style: { '--c': s.color }, on: { click: () => go({ view: 'timetable' }) } },
          h('small', { text: label + ' · Nachhilfe' }), h('b', { text: s.name }),
          h('span', { text: [x.tut.place, `${x.tut.s}–${x.tut.e}`, extra].filter(Boolean).join(' · ') }));
      }
      const s = x && sm.get(x.cell.subjectId);
      if (!s) return null;
      const vp = vpFor(x);
      const vk = vp && kindOf(vp);
      return h('button.nowblock' + (vp ? '.vp-' + vk : ''), { style: { '--c': s.color }, on: { click: () => (vp ? go({ view: 'timetable' }) : go({ view: 'subject', subject: s })) } },
        h('small', { text: label + (vp ? ' · ' + shortText(vp) : '') }), h('b', { text: s.name }),
        h('span', { text: [vk === 'raum' && vp.raum ? vp.raum : x.cell.room, `${tt.periods[x.p].s}–${tt.periods[x.p].e}`, extra].filter(Boolean).join(' · ') }));
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
export const EXAM_KINDS = ['Klassenarbeit', 'Präsentation', 'Test', 'Vokabeltest', 'Referat', 'Klausur', 'Abgabe'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }
// Datum schätzen: ab Start nur Tage, an denen das Fach im Stundenplan steht (sonst Mo–Fr), je Stunde „per“ Vorträge
export async function estimateDate({ start, pos, per, subjectId }) {
  if (!start || !pos || !per) return null;
  const tt = await getTimetable();
  const perDay = Array.from({ length: 7 }, (_, d) => (d < tt.days ? tt.periods.filter((_, p) => tt.cells[`${d}-${p}`] && tt.cells[`${d}-${p}`].subjectId === subjectId).length : 0));
  const fromTT = perDay.some((n) => n > 0);
  let need = pos, d = parseDate(start), guard = 0, days = 0;
  for (;;) {
    const i = dayIdx(d);
    const slots = fromTT ? perDay[i] * per : (i < 5 ? per : 0);
    if (slots) { days++; if (need <= slots) break; need -= slots; }
    d.setDate(d.getDate() + 1);
    if (++guard > 200) return null;
  }
  return { date: isoDate(d), note: fromTT ? `am ${days}. Tag mit dem Fach laut Stundenplan` : `am ${days}. Schultag (Fach nicht im Stundenplan, darum Mo–Fr gerechnet)` };
}
// Text fürs Datum, auch ungefähr: „ca. KW 50 (7.–11.12.)“ oder „ca. Anfang Dezember“
export function approxLabel(ex) {
  const d = parseDate(ex.date);
  if (ex.approx === 'est') return `geschätzt ${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
  if (ex.approx === 'week') { const m = new Date(d); m.setDate(d.getDate() - dayIdx(d)); const f = new Date(m); f.setDate(m.getDate() + 4); return `ca. KW ${isoWeek(d)} (${m.getDate()}.${m.getMonth() + 1}.–${f.getDate()}.${f.getMonth() + 1}.)`; }
  if (ex.approx === 'month') return `ca. ${d.getDate() <= 10 ? 'Anfang' : d.getDate() <= 20 ? 'Mitte' : 'Ende'} ${MONTHS[d.getMonth()]}`;
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}
export function daysUntil(date) { const t0 = new Date(); t0.setHours(0, 0, 0, 0); return Math.round((parseDate(date) - t0) / DAY); }
export function countdownText(n) { return n < 0 ? (n === -1 ? 'gestern' : `vor ${-n} Tagen`) : n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`; }

export async function editExam(ex, { subjects, after }) {
  const isNew = !ex.id;
  const oldRem = isNew ? null : (await db.listReminders()).find((r) => r.refId === ex.id && r.kind === 'lernen');
  const res = await sheet(isNew ? 'Arbeit oder Präsentation eintragen' : `${ex.kind || 'Termin'}`, (body, close) => {
    const subj = h('select.field', { id: 'exSubj' }, ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
    subj.value = ex.subjectId || (subjects[0] && subjects[0].id) || '';
    const kind = h('select.field', { id: 'exKind' }, ...EXAM_KINDS.map((k) => h('option', { value: k, text: k })));
    kind.value = ex.kind || 'Klassenarbeit';
    const date = h('input.field', { type: 'date', id: 'exDate', value: ex.date || isoDate(new Date(Date.now() + 7 * DAY)) });
    let approx = ex.approx || '';
    const apSeg = h('div.gseg.exapprox');
    const apHint = h('p.calm.small.exaphint');
    const drawAp = () => {
      apSeg.replaceChildren(...[['', 'Genau'], ['week', 'Ca. Woche'], ['month', 'Ca. Monat'], ...(approx === 'est' ? [['est', 'Geschätzt']] : [])].map(([k, l]) =>
        h('button' + (approx === k ? '.on' : ''), { text: l, on: { click: () => { approx = k; drawAp(); } } })));
      apHint.textContent = !approx || !date.value ? '' : approx === 'est' ? `Wird angezeigt als „${approxLabel({ date: date.value, approx })}“. Sobald du den Tag kennst, tipp auf „Genau“.` : `Wird angezeigt als „${approxLabel({ date: date.value, approx })}“. Wähl irgendeinen Tag in der Zeit. Später kannst du das genaue Datum eintragen.`;
    };
    date.addEventListener('change', drawAp);
    drawAp();
    // Reihenfolge (z. B. bei Präsentationen): freier Text + Schätzung
    const order = h('input.field', { type: 'text', id: 'exOrder', placeholder: 'z. B. als Letzter von allen, nach Max, 3. von 20', value: ex.order || '', autocomplete: 'off' });
    const est = ex.est || {};
    const eStart = h('input.field', { type: 'date', id: 'exEStart', value: est.start || '' });
    const ePos = h('input.field', { type: 'number', id: 'exEPos', min: 1, max: 60, inputmode: 'numeric', placeholder: 'z. B. 20', value: est.pos || '' });
    const eTot = h('input.field', { type: 'number', id: 'exETot', min: 1, max: 60, inputmode: 'numeric', placeholder: 'z. B. 20', value: est.tot || '' });
    const ePer = h('input.field', { type: 'number', id: 'exEPer', min: 1, max: 20, inputmode: 'numeric', placeholder: 'z. B. 3', value: est.per || '' });
    const eOut = h('p.calm.small.exestout');
    const last = h('button.pchip.small', { text: 'Ich bin Letzter', on: { click: () => { if (eTot.value) ePos.value = eTot.value; else toast('Trag erst ein, wie viele es insgesamt sind.'); if (!order.value) order.value = 'als Letzter von allen'; } } });
    const calc = h('button.btn.small', { text: 'Datum schätzen', on: { click: async () => {
      const r = await estimateDate({ start: eStart.value, pos: +ePos.value, per: +ePer.value, subjectId: subj.value });
      if (!r) { eOut.textContent = 'Dafür brauche ich: Start der Vorträge, deinen Platz und wie viele pro Stunde drankommen.'; return; }
      date.value = r.date; approx = 'est'; drawAp();
      eOut.textContent = `Geschätzt: ${approxLabel({ date: r.date })}, ${r.note}. Das ist nur eine Schätzung, das Datum wird mit „geschätzt“ markiert.`;
    } } });
    const estBox = h('details.exest' + (ex.order || ex.est ? '[open]' : ''), null,
      h('summary', { text: 'Reihenfolge (z. B. bei Präsentationen)' }),
      h('label.fieldlabel', { for: 'exOrder', text: 'Wann bist du dran?' }), order,
      h('div.chips.left.exquick', null, last,
        ...['nach der Pause', 'in der ersten Stunde', 'wird noch ausgelost'].map((t) => h('button.pchip.small', { text: t, on: { click: () => { order.value = t; } } }))),
      h('p.fieldlabel', { text: 'Datum schätzen lassen (freiwillig)' }),
      h('div.fieldgrid', null,
        h('div', null, h('label.fieldlabel', { for: 'exEStart', text: 'Start der Vorträge' }), h('div.datewrap', null, eStart)),
        h('div', null, h('label.fieldlabel', { for: 'exEPer', text: 'Vorträge pro Stunde' }), ePer)),
      h('div.fieldgrid', null,
        h('div', null, h('label.fieldlabel', { for: 'exEPos', text: 'Dein Platz' }), ePos),
        h('div', null, h('label.fieldlabel', { for: 'exETot', text: 'Von insgesamt' }), eTot)),
      h('div.exestrow', null, calc), eOut);
    if (estBox.hasAttribute('[open]')) estBox.removeAttribute('[open]');
    if (ex.order || ex.est) estBox.open = true;
    const topic = h('textarea.field.area', { id: 'exTopic', rows: 2, placeholder: 'Thema, z. B. Lineare Funktionen, Buch S. 40–58' });
    topic.value = ex.topic || '';
    const learn = h('select.field', { id: 'exLearn' }, h('option', { value: '0', text: 'Keine Lernerinnerung' }),
      ...[3, 5, 7, 10, 14].map((n) => h('option', { value: String(n), text: `Jeden Tag 17 Uhr, ab ${n} Tagen vorher` })));
    learn.value = oldRem ? String(oldRem.days || 5) : isNew ? '5' : '0';
    body.append(
      h('div.fieldgrid', null, h('div', null, h('label.fieldlabel', { for: 'exSubj', text: 'Fach' }), subj), h('div', null, h('label.fieldlabel', { for: 'exKind', text: 'Art' }), kind)),
      h('label.fieldlabel', { for: 'exDate', text: 'Wann' }), apSeg, h('div.datewrap.exdate', null, date), apHint,
      estBox,
      h('label.fieldlabel', { for: 'exTopic', text: 'Thema' }), h('div.micwrap', null, topic, micButton(topic)),
      h('label.fieldlabel', { for: 'exLearn', text: 'Lernerinnerung' }), learn,
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: isNew ? 'Eintragen' : 'Sichern', on: { click: () => {
          if (!subj.value) { toast('Leg zuerst ein Fach an'); return; }
          if (!date.value) { toast('Bitte ein Datum wählen'); return; }
          close({ subjectId: subj.value, kind: kind.value, date: date.value, approx, order: order.value.trim(), est: eStart.value || ePos.value || eTot.value || ePer.value ? { start: eStart.value, pos: +ePos.value || null, tot: +eTot.value || null, per: +ePer.value || null } : null, topic: topic.value.trim(), learnDays: +learn.value });
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
  toast(isNew ? 'Eingetragen' : 'Gesichert');
  after && after();
}

function planPct(ex) { const t = ex.plan ? ex.plan.days.flatMap((d) => d.tasks) : []; return t.length ? Math.round(100 * t.filter((x) => x.done).length / t.length) : 0; }
function examRow(ex, s, { subjects, after, onGrade, onPlan }) {
  const n = daysUntil(ex.date);
  const d = parseDate(ex.date);
  return h('div.examrow' + (n < 0 ? '.past' : n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {} },
    h('div.examcount', null, h('b', { text: n < 0 ? '✓' : (ex.approx ? '~' : '') + n }), h('small', { text: n < 0 ? 'vorbei' : n === 1 ? 'Tag' : 'Tage' })),
    h('button.exambody', { on: { click: () => editExam(ex, { subjects, after }) } },
      h('b', { text: `${ex.kind}${s ? ' · ' + s.name : ''}` }),
      ex.topic ? h('span', { text: ex.topic }) : null,
      ex.order ? h('span.exorder', { text: 'Reihenfolge: ' + ex.order + (ex.est && ex.est.pos ? ` · Platz ${ex.est.pos}${ex.est.tot ? ' von ' + ex.est.tot : ''}` : '') }) : null,
      h('small', { text: `${approxLabel(ex)} · ${ex.approx && ex.approx !== 'est' ? 'ungefähr ' : ''}${countdownText(n)}${ex.approx ? ' · antippen, wenn du das Datum weißt' : ''}` })),
    n >= 0 && onPlan && /Präsentation|Referat/.test(ex.kind || '') ? h('button.btn.small', { on: { click: () => onPlan(ex, 'talk') } }, icon('cards'), h('span', { text: 'Karten' })) : null,
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
    eyebrow: 'Planer', title: 'Arbeiten und Termine',
    meta: upcoming.length ? `${plural(upcoming.length, 'Termin', 'Termine')} geplant` : 'Nichts geplant',
    actions: [ctx.btn('Neu', 'plus', () => subjects.length ? editExam({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  const onGrade = (ex) => gradeForExam(ex, again);
  const onPlan = (ex, to = 'plan') => ctx.go({ view: to, examId: ex.id });
  if (!exams.length) {
    view.append(h('section.empty', null, h('h2', { text: 'Noch nichts eingetragen' }),
      h('p', { text: 'Trag Klassenarbeiten und Präsentationen ein, auch wenn das Datum noch ungenau ist. Du siehst dann den Countdown, und die App erinnert dich jeden Tag ans Lernen.' }),
      h('div.emptyactions', null, ctx.btn('Arbeit eintragen', 'plus', () => subjects.length ? editExam({}, { subjects, after: again }) : toast('Leg zuerst ein Fach an'), '.primary'))));
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
  const g = await editGrade(existing || { subjectId: ex.subjectId, cat: /Präsentation|Referat/.test(ex.kind) ? 'praesi' : 'schriftlich', label: ex.kind + (ex.topic ? ': ' + ex.topic.split('\n')[0].slice(0, 40) : ''), date: ex.date }, { subjects });
  if (g && g.id) { ex.gradeId = g.id; await db.putItems('exams', ex); }
  after();
}

// Kasten „Nächste Prüfung“ für die Startseite
export async function examCard({ go, subjects }) {
  const ex = (await db.listExams()).filter((x) => daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!ex.length) {
    return h('button.dash.examcard.empty', { on: { click: () => go({ view: 'exams' }) } },
      h('span.dashic', null, icon('bookmark')), h('span.dashtext', null, h('b', { text: 'Keine Arbeit geplant' }), h('small', { text: 'Klassenarbeiten und Präsentationen eintragen' })));
  }
  const x = ex[0], s = subjects.find((y) => y.id === x.subjectId), n = daysUntil(x.date);
  return h('button.dash.examcard' + (n <= 3 ? '.soon' : ''), { style: s ? { '--c': s.color } : {}, on: { click: () => go({ view: 'exams' }) } },
    h('div.examcount', null, h('b', { text: (x.approx ? '~' : '') + n }), h('small', { text: n === 1 ? 'Tag' : 'Tage' })),
    h('span.dashtext', null, h('small', { text: (x.kind === 'Präsentation' || x.kind === 'Referat' ? 'Nächste Präsentation' : 'Nächste Arbeit') + (ex.length > 1 ? ` · ${ex.length - 1} weitere` : '') }), h('b', { text: `${x.kind}${s ? ' · ' + s.name : ''}` }),
      h('span', { text: x.approx ? `${approxLabel(x)} · noch ${n} Tage${x.order ? ' · ' + x.order : ''}` : x.order ? x.order : x.topic ? x.topic.split('\n')[0] : countdownText(n) })));
}

// ================= Noten =================
export const NOTEN = [['1+', 0.7], ['1', 1], ['1-', 1.3], ['2+', 1.7], ['2', 2], ['2-', 2.3], ['3+', 2.7], ['3', 3], ['3-', 3.3], ['4+', 3.7], ['4', 4], ['4-', 4.3], ['5+', 4.7], ['5', 5], ['5-', 5.3], ['6', 6]];
export async function gradeCfg() { return (await db.getMeta('gradecfg')) || { id: 'gradecfg', scale: 'noten', written: 50 }; }
export const fmt1 = (v) => v.toFixed(2).replace('.', ',');
export function gradeLabel(v, scale) { if (scale === 'punkte') return String(v); const f = NOTEN.find(([, x]) => Math.abs(x - v) < 0.01); return f ? f[0] : fmt1(v); }
// Note gut/mittel/schlecht (für Farbe)
export const tone = (v, scale) => { const n = scale === 'punkte' ? (17 - v) / 3 : v; return n <= 2.5 ? 'good' : n <= 4 ? 'mid' : 'bad'; };
// Präsentationen zählen je nach Einstellung zu schriftlich oder mündlich
export const catOf = (x, cfg) => (x.cat === 'praesi' ? (cfg.pres || 'muendlich') : x.cat);
// Anteil schriftlich in Prozent, pro Fach überschreibbar
export const writtenFor = (cfg, sid) => (cfg.subj && sid && cfg.subj[sid] && cfg.subj[sid].written != null ? cfg.subj[sid].written : cfg.written);
export function avgParts(grades, cfg, sid) {
  const cat = (c) => { const g = grades.filter((x) => x.value != null && catOf(x, cfg) === c); const w = g.reduce((a, x) => a + (x.weight || 1), 0); return w ? g.reduce((a, x) => a + x.value * (x.weight || 1), 0) / w : null; };
  const s = cat('schriftlich'), m = cat('muendlich'), w = writtenFor(cfg, sid);
  const avg = s == null && m == null ? null : s == null ? m : m == null ? s : s * w / 100 + m * (100 - w) / 100;
  return { s, m, w, avg };
}
export function average(grades, cfg, sid) { return avgParts(grades, cfg, sid).avg; }

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
    const cat = h('select.field', { id: 'grCat' }, h('option', { value: 'schriftlich', text: 'Schriftlich (Arbeit, Test)' }), h('option', { value: 'muendlich', text: 'Mündlich / Mitarbeit' }), h('option', { value: 'praesi', text: 'Präsentation / Referat' }));
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

// Kleine Zusammenfassung für die Fach-Seite
export async function subjectSchoolBox(s, { go, after }) {
  const [grades, exams, cfg, subjects] = await Promise.all([db.listGrades(), db.listExams(), gradeCfg(), db.listSubjects()]);
  const g = grades.filter((x) => x.subjectId === s.id);
  const avg = average(g, cfg, s.id);
  const next = exams.filter((x) => x.subjectId === s.id && daysUntil(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return h('section.subsec.schoolbox', null,
    h('button.sbitem', { on: { click: () => go({ view: 'gradesubj', subjectId: s.id }) } }, h('small', { text: 'Schnitt' }), h('b', { text: avg == null ? '–' : cfg.scale === 'punkte' ? avg.toFixed(1).replace('.', ',') : fmt1(avg) }), h('span', { text: plural(g.length, 'Note', 'Noten') })),
    h('button.sbitem', { on: { click: () => (next ? editExam(next, { subjects, after }) : editExam({ subjectId: s.id }, { subjects, after })) } },
      h('small', { text: 'Nächste Arbeit' }), h('b', { text: next ? (next.approx ? 'ca. ' : '') + countdownText(daysUntil(next.date)) : '–' }), h('span', { text: next ? next.kind : 'eintragen' })),
    h('button.sbitem.add', { on: { click: () => editGrade({ subjectId: s.id }, { subjects, after }) } }, icon('plus'), h('span', { text: 'Note eintragen' })));
}
