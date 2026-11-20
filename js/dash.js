// Startseite als Übersicht: Begrüßung, Wochenleiste, Tagesansicht, Fokus-Anzeige, Darstellung (hell/dunkel)
import * as db from './db.js';
import { h, icon, sheet, plural } from './ui.js';
import { getTimetable } from './school.js';
import { editHomework } from './homework.js';

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ttDay = (d) => (d.getDay() + 6) % 7;   // Mo = 0

export function greeting(at = new Date()) {
  const hr = at.getHours();
  const title = hr < 5 ? 'Gute Nacht' : hr < 11 ? 'Guten Morgen' : hr < 14 ? 'Hallo' : hr < 18 ? 'Guten Tag' : 'Guten Abend';
  return { title, eyebrow: `${WD[at.getDay()]}, ${at.getDate()}. ${MON[at.getMonth()]}` };
}

// ---------- Darstellung ----------
export function applyTheme() {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch (e) { /* egal */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
export function themeSheet() {
  return sheet('Darstellung', (body, close) => {
    let cur = 'auto';
    try { cur = localStorage.getItem('theme') || 'auto'; } catch (e) { /* egal */ }
    const opts = [['auto', 'Automatisch', 'Wie am iPad eingestellt'], ['light', 'Hell', 'Immer hell'], ['dark', 'Dunkel', 'Immer dunkel, schont abends die Augen']];
    const list = h('div.themelist');
    for (const [k, l, sub] of opts) {
      list.append(h('button.themeopt' + (k === cur ? '.on' : ''), { 'data-theme-opt': k, on: { click: () => {
        try { if (k === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', k); } catch (e) { /* egal */ }
        applyTheme();
        list.querySelectorAll('.themeopt').forEach((x) => x.classList.toggle('on', x.dataset.themeOpt === k));
      } } }, h('span.themeswatch.' + k), h('span', null, h('b', { text: l }), h('small', { text: sub }))));
    }
    body.append(list, h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
  });
}

// ---------- Fokus-Anzeige (wenn der Timer läuft) ----------
export function focusPill(go) {
  const read = () => { try { return JSON.parse(localStorage.getItem('focus') || 'null'); } catch (e) { return null; } };
  const s0 = read();
  if (!s0 || !s0.running) return null;
  const el = h('button.focuspill', { on: { click: () => go({ view: 'kit', tab: 'focus' }) } });
  const draw = () => {
    const s = read();
    if (!el.isConnected && el.dataset.drawn) { clearInterval(el._t); return; }
    el.dataset.drawn = '1';
    if (!s || !s.running) { el.remove(); clearInterval(el._t); return; }
    const left = Math.max(0, s.end - Date.now());
    const m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
    el.textContent = '';
    el.append(h('i.focusdot' + (s.mode === 'break' ? '.brk' : '')), h('span', { text: s.mode === 'break' ? 'Pause' : 'Fokus' }), h('b', { text: `${m}:${String(sec).padStart(2, '0')}` }));
  };
  draw();
  el._t = setInterval(draw, 1000);
  return el;
}

// ---------- Wochenleiste: die nächsten 7 Tage ----------
async function weekData(subjects) {
  const [tt, hw, exams] = await Promise.all([getTimetable(), db.listHomework(), db.listExams()]);
  const sm = new Map(subjects.map((s) => [s.id, s]));
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const days = [];
  for (let k = 0; k < 7; k++) {
    const d = new Date(t0); d.setDate(t0.getDate() + k);
    const key = iso(d), td = ttDay(d);
    const lessons = td < tt.days ? tt.periods.map((per, p) => ({ per, p, cell: tt.cells[`${td}-${p}`] })).filter((x) => x.cell && sm.has(x.cell.subjectId)) : [];
    days.push({
      d, key, k, lessons,
      hw: hw.filter((x) => !x.done && x.due === key && sm.has(x.subjectId)),
      ex: exams.filter((x) => x.date === key),
    });
  }
  // überfällige Hausaufgaben zählen zu heute
  const todayKey = days[0].key;
  days[0].late = hw.filter((x) => !x.done && x.due && x.due < todayKey && sm.has(x.subjectId));
  return { days, sm, tt };
}

export async function weekCard({ go, subjects, after }) {
  const { days, sm, tt } = await weekData(subjects);
  const row = h('div.weekrow');
  for (const day of days) {
    const colors = [...new Set(day.lessons.map((x) => sm.get(x.cell.subjectId).color))].slice(0, 6);
    const nHw = day.hw.length + (day.late ? day.late.length : 0);
    row.append(h('button.wday' + (day.k === 0 ? '.wtoday' : '') + (day.ex.length ? '.wexam' : '') + ([0, 6].includes(day.d.getDay()) ? '.wweekend' : ''),
      { 'data-day': day.key, on: { click: () => daySheet(day, { sm, tt, go, subjects, after }) } },
      h('small', { text: day.k === 0 ? 'Heute' : day.k === 1 ? 'Morgen' : WS[day.d.getDay()] }),
      h('b', { text: String(day.d.getDate()) }),
      h('span.wbars', null, ...colors.map((c) => h('i', { style: { '--c': c } }))),
      h('span.wtags', null,
        day.ex.length ? h('em.wtag.ex', { text: day.ex.length > 1 ? `${day.ex.length} Prüf.` : 'Prüfung' }) : null,
        nHw ? h('em.wtag.hw', { text: `${nHw} HA` }) : null,
        !day.ex.length && !nHw ? h('em.wtag.none', { text: day.lessons.length ? plural(day.lessons.length, 'Std.', 'Std.') : 'frei' }) : null)));
  }
  return h('section.weekcard', null, h('div.colhead', null, h('h2.section', { text: 'Deine Woche' }),
    h('small.weekhint', { text: 'Tag antippen für Details' })), row);
}

function daySheet(day, { sm, tt, go, subjects, after }) {
  const title = day.k === 0 ? 'Heute' : day.k === 1 ? 'Morgen' : WD[day.d.getDay()];
  return sheet(`${title}, ${day.d.getDate()}. ${MON[day.d.getMonth()]}`, (body, close) => {
    const open = (s) => { close(true); go({ view: 'subject', subject: s }); };
    if (day.ex.length) {
      body.append(h('p.fieldlabel', { text: 'Prüfungen' }));
      for (const x of day.ex) {
        const s = sm.get(x.subjectId);
        body.append(h('button.dayrow.ex', { style: s ? { '--c': s.color } : {}, on: { click: () => { close(true); go({ view: 'exams' }); } } },
          icon('bookmark'), h('span', null, h('b', { text: `${x.kind}${s ? ' · ' + s.name : ''}` }), x.topic ? h('small', { text: x.topic.split('\n')[0] }) : null)));
      }
    }
    const hw = [...(day.late || []), ...day.hw];
    body.append(h('div.colhead', null, h('p.fieldlabel', { text: 'Hausaufgaben' }),
      h('button.txt', { text: '+ Eintragen', on: { click: () => { close(true); editHomework({ due: day.key }, { subjects, after }); } } })));
    if (hw.length) {
      for (const x of hw) {
        const s = sm.get(x.subjectId);
        body.append(h('button.dayrow', { style: { '--c': s.color }, on: { click: () => open(s) } },
          icon('homework'), h('span', null, h('b', { text: x.text }), h('small', { text: s.name + (x.due < day.key ? ' · überfällig' : '') }))));
      }
    } else body.append(h('p.calm', { text: 'Keine Hausaufgaben fällig.' }));
    body.append(h('p.fieldlabel', { text: 'Stunden' }));
    if (day.lessons.length) {
      for (const x of day.lessons) {
        const s = sm.get(x.cell.subjectId);
        body.append(h('button.dayrow.lesson', { style: { '--c': s.color }, on: { click: () => open(s) } },
          h('span.daytime', { text: `${x.per.s}\n${x.per.e}` }), h('span', null, h('b', { text: s.name }), x.cell.room ? h('small', { text: 'Raum ' + x.cell.room }) : null)));
      }
    } else body.append(h('p.calm', { text: Object.keys(tt.cells).length ? 'Kein Unterricht.' : 'Noch kein Stundenplan eingetragen.' }));
    body.append(h('div.dlgactions', null,
      h('button.btn', { text: 'Stundenplan', on: { click: () => { close(true); go({ view: 'timetable' }); } } }),
      h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
  }, { wide: true });
}
