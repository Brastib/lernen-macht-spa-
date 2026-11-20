// Erinnerungen: Hausaufgaben, Vokabeln lernen und alles, was man frei einträgt.
// Ehrlich zur Technik: Eine Web-App kann ohne eigenen Server keine Mitteilung schicken, wenn sie geschlossen ist.
// Darum zwei Wege:
//   1. In der App: Hinweis beim Öffnen und, solange die App offen ist, eine Mitteilung zur Uhrzeit.
//   2. iPad-Kalender: Jede Erinnerung kann als Termin mit Alarm in den Kalender. Der klingelt dann auch bei geschlossener App.
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, menu } from './ui.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const REPEATS = [['none', 'Einmal'], ['daily', 'Jeden Tag'], ['weekdays', 'Montag bis Freitag'], ['weekly', 'Jede Woche']];
const repeatLabel = (r) => (REPEATS.find(([k]) => k === r) || REPEATS[0])[1];

// ---------- Zeitrechnung ----------
function baseOf(r) {
  const [y, m, d] = (r.date || isoDate(new Date())).split('-').map(Number);
  const [hh, mm] = (r.time || '17:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
function stepFrom(dt, rep) {
  const n = new Date(dt);
  if (rep === 'weekly') n.setDate(n.getDate() + 7);
  else {
    n.setDate(n.getDate() + 1);
    if (rep === 'weekdays') while (n.getDay() === 0 || n.getDay() === 6) n.setDate(n.getDate() + 1);
  }
  return n;
}
function firstOcc(r) {
  const b = baseOf(r);
  if (r.repeat === 'weekdays') while (b.getDay() === 0 || b.getDay() === 6) b.setDate(b.getDate() + 1);
  return b;
}
// Letzter Termin, der schon erreicht ist (oder null) und nächster Termin danach (oder null)
// Mit Enddatum (r.until, YYYY-MM-DD): danach keine Termine mehr
export function occurrences(r, now = Date.now()) {
  const o = occRaw(r, now);
  if (!r.until || !r.repeat || r.repeat === 'none') return o;
  const [y, m, d] = r.until.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59).getTime();
  if (o.next && o.next > end) o.next = null;
  if (o.last && o.last > end) { const o2 = occRaw(r, end); o.last = o2.last; }
  return o;
}
function occRaw(r, now) {
  let cur = firstOcc(r);
  if (!r.repeat || r.repeat === 'none') return cur.getTime() <= now ? { last: cur.getTime(), next: null } : { last: null, next: cur.getTime() };
  if (cur.getTime() > now) return { last: null, next: cur.getTime() };
  // große Lücken schnell überspringen
  const gap = Math.floor((now - cur.getTime()) / DAY) - 8;
  if (gap > 0) {
    const jump = r.repeat === 'weekly' ? Math.floor(gap / 7) * 7 : gap;
    cur.setDate(cur.getDate() + jump);
    if (r.repeat === 'weekdays') while (cur.getDay() === 0 || cur.getDay() === 6) cur.setDate(cur.getDate() - 1);
  }
  let last = cur;
  for (let i = 0; i < 40; i++) { const n = stepFrom(last, r.repeat); if (n.getTime() > now) return { last: last.getTime(), next: n.getTime() }; last = n; }
  return { last: last.getTime(), next: stepFrom(last, r.repeat).getTime() };
}
// Fällig = ein Termin ist erreicht und noch nicht abgehakt (und nicht verschoben)
export function isDue(r, now = Date.now()) {
  if (r.done) return false;
  if (r.snoozeUntil && r.snoozeUntil > now) return false;
  const { last } = occurrences(r, now);
  return last != null && last > (r.ack || 0);
}
function whenText(ts) {
  const d = new Date(ts);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / DAY);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `heute ${time}`;
  if (diff === 1) return `morgen ${time}`;
  if (diff === -1) return `gestern ${time}`;
  if (diff > 1 && diff < 7) return `${WD[d.getDay()]} ${time}`;
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() !== t0.getFullYear() ? d.getFullYear() : ''} ${time}`;
}

// ---------- Abhaken / Verschieben ----------
export async function ackReminder(r) {
  const { last } = occurrences(r);
  if (!r.repeat || r.repeat === 'none') r.done = true;
  r.ack = Math.max(last || 0, Date.now());
  r.snoozeUntil = 0;
  await db.putItems('reminders', r);
}
async function snooze(r, ms) {
  r.snoozeUntil = Date.now() + ms;
  r.notified = 0;
  await db.putItems('reminders', r);
}

// ---------- Kalender (.ics) ----------
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsTime = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
export function buildIcs(r, subjectName) {
  const start = firstOcc(r);
  let rule = { daily: 'RRULE:FREQ=DAILY', weekly: 'RRULE:FREQ=WEEKLY', weekdays: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }[r.repeat];
  if (rule && r.until) rule += ';UNTIL=' + r.until.replace(/-/g, '') + 'T235959';
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lern-App//Erinnerungen//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${r.id}@lern-app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(start)}`,          // ohne Zeitzone = Uhrzeit auf dem iPad
    'DURATION:PT15M',
    `SUMMARY:${icsEsc(r.text)}`,
    subjectName ? `DESCRIPTION:${icsEsc('Fach: ' + subjectName)}` : null,
    rule || null,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(r.text)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}
const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Öffnet den Termin so, dass iPadOS „Zum Kalender hinzufügen“ anbietet.
// Weg 1 (eigene App): der Service Worker liefert die Datei unter einer echten Adresse aus.
// Weg 2 (sonst): Datei teilen / speichern, dann in „Dateien“ antippen.
export async function toCalendar(r, { saveFile, subjectName } = {}) {
  const ics = buildIcs(r, subjectName);
  const name = 'erinnerung-' + (r.text || 'termin').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').slice(0, 30).replace(/^-|-$/g, '') + '.ics';
  const sw = !document.documentElement.dataset.artifact && navigator.serviceWorker && navigator.serviceWorker.controller;
  if (sw) {
    const url = new URL('kalender/' + encodeURIComponent(name) + '?d=' + b64url(ics), document.baseURI).href;
    const a = h('a', { href: url, target: '_blank', rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    return true;
  }
  if (saveFile) return saveFile(name, new Blob([ics], { type: 'text/calendar' }), 'text/calendar');
  return false;
}

// ---------- Mitteilungen, solange die App offen ist ----------
let timer = null, onFire = null;
export function startReminderWatch(cb) {
  onFire = cb;
  clearInterval(timer);
  timer = setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
}
async function check() {
  let list;
  try { list = await db.listReminders(); } catch (e) { return; }
  const now = Date.now();
  const fresh = [];
  for (const r of list) {
    if (!isDue(r, now)) continue;
    const { last } = occurrences(r, now);
    const mark = Math.max(last, r.snoozeUntil || 0);
    if ((r.notified || 0) >= mark) continue;
    r.notified = mark;
    await db.putItems('reminders', r);
    fresh.push(r);
  }
  if (!fresh.length) return;
  for (const r of fresh) notify(r);
  if (onFire) onFire(fresh);
}
async function notify(r) {
  toast('⏰ ' + r.text, 5000);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) await reg.showNotification('Erinnerung', { body: r.text, tag: r.id, icon: 'icons/icon-192.png' });
    else new Notification('Erinnerung', { body: r.text, tag: r.id });
  } catch (e) { /* egal, der Hinweis in der App reicht */ }
}
export const canNotify = () => 'Notification' in window && !document.documentElement.dataset.artifact;
export async function askNotify() {
  if (!canNotify()) { toast('Mitteilungen gehen hier nicht'); return false; }
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Mitteilungen sind an' : 'Mitteilungen sind aus (in den iPad-Einstellungen änderbar)');
  return p === 'granted';
}

// ---------- Bearbeiten ----------
// r: bestehende oder neue Erinnerung (Vorgaben möglich: text, kind, refId, subjectId, repeat, time, date)
export async function editReminder(r, { subjects = [], after, saveFile } = {}) {
  const isNew = !r.id;
  const res = await sheet(isNew ? 'Neue Erinnerung' : 'Erinnerung', (body, close) => {
    const text = h('textarea.field.area', { id: 'remText', rows: 2, placeholder: 'z. B. Vokabeln lernen, Sportsachen einpacken …', autocapitalize: 'sentences' });
    text.value = r.text || '';
    const date = h('input.field', { type: 'date', id: 'remDate', value: r.date || isoDate(new Date()) });
    const time = h('input.field', { type: 'time', id: 'remTime', value: r.time || defaultTime() });
    const rep = h('select.field', { id: 'remRep' }, ...REPEATS.map(([k, l]) => h('option', { value: k, text: l })));
    rep.value = r.repeat || 'none';
    const subj = h('select.field', { id: 'remSubj' }, h('option', { value: '', text: 'Kein Fach' }), ...subjects.map((s) => h('option', { value: s.id, text: s.name })));
    subj.value = r.subjectId || '';
    const quick = h('div.chips.left', null,
      ...[['Heute 17 Uhr', 0, '17:00'], ['Heute 19 Uhr', 0, '19:00'], ['Morgen 7 Uhr', 1, '07:00'], ['Morgen 17 Uhr', 1, '17:00']].map(([l, n, t]) =>
        h('button.pchip.small', { text: l, on: { click: () => { date.value = isoDate(new Date(Date.now() + n * DAY)); time.value = t; } } })));
    const cal = h('input', { type: 'checkbox', id: 'remCal' });
    cal.checked = isNew && !document.documentElement.dataset.artifact;
    body.append(
      h('label.fieldlabel', { for: 'remText', text: 'Woran erinnern?' }), text,
      h('div.fieldgrid', null,
        h('div', null, h('label.fieldlabel', { for: 'remDate', text: 'Tag' }), h('div.datewrap', null, date)),
        h('div', null, h('label.fieldlabel', { for: 'remTime', text: 'Uhrzeit' }), h('div.datewrap', null, time))),
      quick,
      h('div.fieldgrid', null,
        h('div', null, h('label.fieldlabel', { for: 'remRep', text: 'Wiederholen' }), rep),
        subjects.length ? h('div', null, h('label.fieldlabel', { for: 'remSubj', text: 'Fach' }), subj) : null),
      h('label.checkrow', { for: 'remCal' }, cal, h('span', null,
        h('b', { text: 'Auch im iPad-Kalender eintragen' }),
        h('small', { text: 'Dann klingelt es auch, wenn die App geschlossen ist.' }))),
      h('div.dlgactions', null,
        isNew ? null : h('button.btn.danger', { text: 'Löschen', on: { click: () => close('delete') } }),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: isNew ? 'Erinnern' : 'Sichern', on: { click: () => {
          const t = text.value.trim();
          if (!t) { text.focus(); return; }
          if (!date.value || !time.value) { toast('Bitte Tag und Uhrzeit wählen'); return; }
          close({ text: t, date: date.value, time: time.value, repeat: rep.value, subjectId: subj.value || null, cal: cal.checked });
        } } })));
    setTimeout(() => { if (!r.text) text.focus(); }, 60);
  });
  if (!res) return null;
  if (res === 'delete') { await db.deleteItems('reminders', r.id); toast('Gelöscht'); if (after) after(); return null; }
  const { cal, ...vals } = res;
  const changed = vals.date !== r.date || vals.time !== r.time || vals.repeat !== r.repeat;
  const item = { kind: 'frei', ...r, ...vals };
  if (changed || isNew) { item.done = false; item.ack = 0; item.notified = 0; item.snoozeUntil = 0; }
  // Liegt ein einmaliger Termin schon in der Vergangenheit? Dann nicht sofort „fällig“ melden lassen, nur anzeigen.
  await db.putItems('reminders', item);
  toast(isNew ? 'Erinnerung gespeichert' : 'Gesichert');
  if (cal) {
    const s = subjects.find((x) => x.id === item.subjectId);
    try { await toCalendar(item, { saveFile, subjectName: s && s.name }); } catch (e) { toast(e.message || 'Kalender ging nicht'); }
  }
  if (after) after();
  return item;
}
function defaultTime() {
  const d = new Date(Date.now() + 60 * 60000);
  return `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 15) * 15)}`;
}

// ---------- Liste ----------
function row(r, { subjMap, after, onOpen, saveFile }) {
  const now = Date.now();
  const due = isDue(r, now);
  const { next } = occurrences(r, now);
  const s = subjMap && subjMap.get(r.subjectId);
  let when;
  if (r.done) when = 'erledigt';
  else if (due) when = 'jetzt fällig';
  else if (r.snoozeUntil && r.snoozeUntil > now) when = 'später: ' + whenText(r.snoozeUntil);
  else if (next) when = whenText(next);
  else when = 'vorbei';
  return h('div.hwrow.remrow' + (r.done ? '.done' : '') + (due ? '.due' : ''), null,
    h('button.hwcheck', { 'aria-label': 'Erledigt', on: { click: async () => {
      if (r.done) { r.done = false; r.ack = 0; await db.putItems('reminders', r); } else { await ackReminder(r); toast(r.repeat && r.repeat !== 'none' ? 'Erledigt, bis zum nächsten Mal' : 'Erledigt'); }
      after();
    } } }, icon('select')),
    h('button.hwbody', { on: { click: () => onOpen(r) } },
      h('span.hwtext', { text: r.text }),
      h('span.hwmeta', null,
        h('span.remkind', { text: (r.kind === 'hausaufgabe' ? 'Hausaufgabe' : (r.kind === 'vokabeln' || r.kind === 'lernen') ? 'Lernen' : 'Erinnerung') + (s ? ' ·' : '') }),
        s ? h('i.dot', { style: { '--c': s.color } }) : null,
        s ? h('span', { text: s.name }) : null,
        h('span.hwdue' + (due ? '.late' : ''), { text: when }),
        r.repeat && r.repeat !== 'none' ? h('span.remrep', { text: repeatLabel(r.repeat) }) : null)),
    h('button.icbtn.remmore', { 'aria-label': 'Mehr', on: { click: (e) => menu(e.currentTarget, [
      due ? { label: 'In 10 Minuten nochmal', icon: 'undo', onClick: async () => { await snooze(r, 10 * 60000); after(); } } : null,
      due ? { label: 'In 1 Stunde nochmal', icon: 'undo', onClick: async () => { await snooze(r, 60 * 60000); after(); } } : null,
      { label: 'In iPad-Kalender eintragen', icon: 'homework', onClick: () => toCalendar(r, { saveFile, subjectName: s && s.name }).catch((er) => toast(er.message)) },
      { label: 'Bearbeiten', icon: 'edit', onClick: () => onOpen(r) },
    ].filter(Boolean)) } }, icon('more')));
}

// Ansicht „Erinnerungen“. ctx: { setHeader, btn, go, saveFile, openRef }
export async function renderReminders(ctx) {
  const [list, subjects] = await Promise.all([db.listReminders(), db.listSubjects()]);
  const subjMap = new Map(subjects.map((s) => [s.id, s]));
  const again = () => renderReminders(ctx);
  const open = (r) => editReminder(r, { subjects, after: again, saveFile: ctx.saveFile });
  const now = Date.now();
  const nextOf = (r) => occurrences(r, now).next || Infinity;
  const due = list.filter((r) => isDue(r, now)).sort((a, b) => (occurrences(a, now).last || 0) - (occurrences(b, now).last || 0));
  const coming = list.filter((r) => !r.done && !isDue(r, now) && (nextOf(r) !== Infinity || (r.snoozeUntil || 0) > now)).sort((a, b) => Math.min(nextOf(a), a.snoozeUntil > now ? a.snoozeUntil : Infinity) - Math.min(nextOf(b), b.snoozeUntil > now ? b.snoozeUntil : Infinity));
  const finished = list.filter((r) => !due.includes(r) && !coming.includes(r)).sort((a, b) => (b.ack || 0) - (a.ack || 0));
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Planer', title: 'Erinnerungen',
    meta: due.length ? `${due.length} fällig · ${coming.length} geplant` : `${coming.length} geplant`,
    actions: [ctx.btn('Neu', 'plus', () => open({}), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  const opts = { subjMap, after: again, onOpen: open, saveFile: ctx.saveFile };
  const info = h('section.reminfo', null,
    h('p', null, h('b', { text: 'So klingelt es zuverlässig: ' }),
      'Eine Web-App darf auf dem iPad keine Mitteilung schicken, wenn sie geschlossen ist. Trag wichtige Erinnerungen darum zusätzlich in den iPad-Kalender ein (Häkchen beim Anlegen oder „…“ → „In iPad-Kalender eintragen“). Solange die App offen ist, meldet sie sich selbst.'));
  if (canNotify() && Notification.permission === 'default') info.append(ctx.btn('Mitteilungen erlauben', 'speak', async () => { await askNotify(); again(); }));
  view.append(info);
  if (!list.length) {
    view.append(h('section.empty', null,
      h('h2', { text: 'Noch keine Erinnerungen' }),
      h('p', { text: 'Zum Beispiel „Vokabeln lernen“ jeden Tag um 17 Uhr. Hausaufgaben kannst du beim Eintragen direkt mit einer Erinnerung versehen.' }),
      h('div.emptyactions', null,
        ctx.btn('Vokabeln jeden Tag', 'cards', () => editReminder({ text: 'Vokabeln lernen', kind: 'vokabeln', repeat: 'daily', time: '17:00' }, { subjects, after: again, saveFile: ctx.saveFile })),
        ctx.btn('Neue Erinnerung', 'plus', () => open({}), '.primary'))));
    return;
  }
  const sec = (title, items, cls = '') => {
    if (!items.length) return;
    const l = h('div.hwlist');
    for (const r of items) l.append(row(r, opts));
    view.append(h('section.subsec.remsec' + cls, null, h('h2.section', { text: title }), h('div.todaycol', null, l)));
  };
  sec('Jetzt fällig', due, '.duesec');
  sec('Geplant', coming);
  if (finished.length) {
    const l = h('div.hwlist');
    for (const r of finished.slice(0, 40)) l.append(row(r, opts));
    view.append(h('details.donebox', null, h('summary', { text: `Erledigt und vorbei (${finished.length})` }), h('div.todaycol', null, l)));
  }
}

// Kleiner Kasten in der Bibliothek, wenn etwas fällig ist
export async function dueBanner({ go }) {
  const list = (await db.listReminders()).filter((r) => isDue(r));
  if (!list.length) return null;
  return h('button.rembanner', { on: { click: () => go({ view: 'reminders' }) } },
    h('span.rembell', null, icon('clock')),
    h('span.inboxtext', null,
      h('b', { text: list.length === 1 ? list[0].text : plural(list.length, 'Erinnerung', 'Erinnerungen') + ' fällig' }),
      h('small', { text: list.length === 1 ? 'Jetzt fällig · antippen zum Abhaken' : list.slice(0, 3).map((r) => r.text).join(' · ') })));
}

// Hausaufgaben: Erinnerung passend zur Abgabe anlegen/ändern/löschen
// when: '' (keine), 'eve' (Vortag 17 Uhr), 'morning' (am Tag 7 Uhr)
export async function syncHomeworkReminder(hw, when) {
  const all = await db.listReminders();
  const ex = all.find((r) => r.refId === hw.id && r.kind === 'hausaufgabe');
  if (!when || !hw.due || hw.done) { if (ex && (!when || !hw.due)) await db.deleteItems('reminders', ex.id); else if (ex && hw.done) { ex.done = true; await db.putItems('reminders', ex); } return null; }
  const [y, m, d] = hw.due.split('-').map(Number);
  const dt = new Date(y, m - 1, d - (when === 'eve' ? 1 : 0));
  const r = { ...(ex || {}), kind: 'hausaufgabe', refId: hw.id, subjectId: hw.subjectId, text: 'Hausaufgabe: ' + hw.text.split('\n')[0].slice(0, 80), date: isoDate(dt), time: when === 'eve' ? '17:00' : '07:00', repeat: 'none', when };
  if (!ex || ex.date !== r.date || ex.time !== r.time || ex.done) { r.done = false; r.ack = 0; r.notified = 0; r.snoozeUntil = 0; }
  await db.putItems('reminders', r);
  return r;
}
export async function homeworkReminderOf(hwId) {
  return (await db.listReminders()).find((r) => r.refId === hwId && r.kind === 'hausaufgabe') || null;
}
