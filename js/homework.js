// Hausaufgaben pro Fach: kurze Liste mit Datum, abhaken wenn erledigt.
import * as db from './db.js';
import { micButton } from './speech.js';
import { h, icon, toast, sheet } from './ui.js';
import { syncHomeworkReminder, homeworkReminderOf } from './reminders.js';

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
export function tomorrow() { return iso(new Date(Date.now() + DAY)); }
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function dueLabel(due) {
  if (!due) return { text: 'ohne Datum', cls: '' };
  const [y, m, d] = due.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - t0) / DAY);
  if (diff < 0) return { text: diff === -1 ? 'seit gestern fällig' : `seit ${-diff} Tagen fällig`, cls: 'late' };
  if (diff === 0) return { text: 'heute', cls: 'soon' };
  if (diff === 1) return { text: 'morgen', cls: 'soon' };
  if (diff < 7) return { text: `${WD[dt.getDay()]} ${d}.${m}.`, cls: '' };
  return { text: `${d}.${m}.${y !== t0.getFullYear() ? y : ''}`, cls: '' };
}
export const sortHw = (a, b) => (a.done - b.done) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.created - b.created;

// Neue oder bestehende Hausaufgabe bearbeiten. subjects nur nötig, wenn kein Fach feststeht.
export async function editHomework(item, { subjects, after }) {
  const isNew = !item.id;
  const oldRem = isNew ? null : await homeworkReminderOf(item.id);
  const res = await sheet(isNew ? 'Neue Hausaufgabe' : 'Hausaufgabe', (body, close) => {
    const text = h('textarea.field.area', { id: 'hwText', rows: 3, placeholder: 'z. B. Buch S. 54 Nr. 3a–c', autocapitalize: 'sentences' });
    text.value = item.text || '';
    const date = h('input.field', { type: 'date', id: 'hwDue', value: item.due || tomorrow() });
    const quick = h('div.chips.left', null,
      ...[['Morgen', 1], ['In 2 Tagen', 2], ['Nächste Woche', 7]].map(([l, n]) =>
        h('button.pchip.small', { text: l, on: { click: () => { date.value = iso(new Date(Date.now() + n * DAY)); } } })));
    let subjectId = item.subjectId || (subjects && subjects[0] && subjects[0].id);
    body.append(h('label.fieldlabel', { for: 'hwText', text: 'Aufgabe' }), h('div.micwrap', null, text, micButton(text)));
    if (subjects && !item.subjectId) {
      const sel = h('select.field', { id: 'hwSubj', on: { change: (e) => { subjectId = e.target.value; } } },
        ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
      body.append(h('label.fieldlabel', { for: 'hwSubj', text: 'Fach' }), sel);
    }
    const rem = h('select.field', { id: 'hwRem' },
      h('option', { value: '', text: 'Nicht erinnern' }),
      h('option', { value: 'eve', text: 'Am Tag vorher um 17 Uhr' }),
      h('option', { value: 'morning', text: 'Am Abgabetag um 7 Uhr' }));
    rem.value = oldRem ? (oldRem.when || 'eve') : (isNew ? 'eve' : '');
    body.append(h('label.fieldlabel', { for: 'hwDue', text: 'Bis wann' }), h('div.datewrap', null, date), quick,
      h('label.fieldlabel', { for: 'hwRem', text: 'Erinnern' }), rem,
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: isNew ? 'Eintragen' : 'Sichern', on: { click: () => {
          const t = text.value.trim();
          if (!t) { text.focus(); return; }
          if (!subjectId) { toast('Leg zuerst ein Fach an'); return; }
          close({ text: t, due: date.value || '', subjectId, remWhen: rem.value });
        } } })));
    setTimeout(() => text.focus(), 60);
  });
  if (!res) return;
  if (res === 'delete') { await db.deleteItems('homework', item.id); await syncHomeworkReminder(item, ''); toast('Gelöscht'); }
  else {
    const { remWhen, ...vals } = res;
    const [saved] = await db.putItems('homework', [{ ...item, ...vals, done: item.done || false }]);
    await syncHomeworkReminder(saved, remWhen);
  }
  after();
}

// Liste zeichnen. subjMap: Fach-ID -> Fach (dann wird das Fach mit angezeigt)
export function hwList(items, { subjMap, after }) {
  const list = h('div.hwlist');
  for (const it of items) {
    const due = dueLabel(it.due);
    const s = subjMap && subjMap.get(it.subjectId);
    const row = h('div.hwrow' + (it.done ? '.done' : ''), null,
      h('button.hwcheck', { 'aria-label': it.done ? 'Wieder offen' : 'Erledigt', 'aria-pressed': String(!!it.done), on: { click: async () => {
        it.done = !it.done;
        it.doneAt = it.done ? Date.now() : null;
        await db.putItems('homework', it);
        const r = await homeworkReminderOf(it.id);
        if (r) await syncHomeworkReminder(it, r.when || 'eve');
        if (it.done) toast('Erledigt');
        after();
      } } }, icon('select')),
      h('button.hwbody', { on: { click: () => editHomework(it, { after }) } },
        h('span.hwtext', { text: it.text }),
        h('span.hwmeta', null,
          s ? h('i.dot', { style: { '--c': s.color } }) : null,
          s ? h('span', { text: s.name }) : null,
          h('span.hwdue' + (due.cls && !it.done ? '.' + due.cls : ''), { text: due.text }))));
    list.append(row);
  }
  return list;
}

export { today };
