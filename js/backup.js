// Sicherung: regelmäßig erinnern, mit einem Tipp in die Dateien-App / iCloud Drive sichern.
// Ehrlich: Ein Browser darf nicht von selbst in die Dateien-App schreiben. Die App bereitet die Datei vor,
// du tippst einmal auf „In Dateien sichern“.
import * as db from './db.js';
import { $, h, icon, toast, busy, fmtBytes, sheet } from './ui.js';

const KEY = 'backupCfg';
export function backupCfg() {
  try { return Object.assign({ every: 7, last: 0, size: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { every: 7, last: 0, size: 0 }; }
}
function setCfg(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* egal */ } }
const DAY = 864e5;
export function daysSince(t) { return t ? Math.floor((Date.now() - t) / DAY) : Infinity; }
function sinceText(t) {
  const d = daysSince(t);
  if (d === Infinity) return 'noch nie';
  if (d === 0) return 'heute';
  if (d === 1) return 'gestern';
  return `vor ${d} Tagen`;
}

// Hinweis auf der Startseite, wenn eine Sicherung fällig ist (nur wenn es überhaupt etwas zu sichern gibt)
export async function backupBanner({ saveFile, after }) {
  const c = backupCfg();
  if (!c.every) return null;
  if (daysSince(c.last) < c.every) return null;
  if (c.snooze && Date.now() - c.snooze < DAY) return null;
  const [subjects, pages] = await Promise.all([db.listSubjects(), db.listAllPages()]);
  if (!subjects.length && !pages.length) return null;
  return h('div.bkbanner', null,
    h('span.bkic', null, icon('save')),
    h('span.inboxtext', null,
      h('b', { text: c.last ? 'Zeit für eine Sicherung' : 'Mach deine erste Sicherung' }),
      h('small', { text: c.last ? `Letzte Sicherung ${sinceText(c.last)}. Dauert nur einen Moment.` : 'Damit nichts verloren geht, falls das iPad den Speicher aufräumt.' })),
    h('button.btn.primary', { text: 'Jetzt sichern', on: { click: () => backupNow({ saveFile, after }) } }),
    h('button.btn.round', { 'aria-label': 'Später', title: 'Morgen wieder erinnern', on: { click: (e) => { const x = backupCfg(); x.snooze = Date.now(); setCfg(x); e.currentTarget.closest('.bkbanner').remove(); } } }, icon('close')));
}

// Sicherung erstellen und dann mit einem eigenen Tipp teilen (sonst blockt Safari das Teilen nach langer Vorbereitung)
export async function backupNow({ saveFile, after }) {
  busy(true, 'Sicherung wird erstellt …');
  let blob;
  try {
    const data = await db.exportAll((i, n) => { const t = $('busyText'); if (t) t.textContent = `Sicherung wird erstellt … ${i} von ${n}`; });
    blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  } catch (e) { busy(false); toast('Sicherung fehlgeschlagen: ' + e.message, 5000); return false; }
  busy(false);
  const d = new Date();
  const name = `lernapp-sicherung-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const ok = await sheet('Sicherung ist bereit', (body, close) => {
    const go = h('button.btn.primary', { on: { click: async () => {
      try {
        const r = await saveFile(name, blob);
        if (r) close(true);
      } catch (e) { toast(e.message, 5000); }
    } } }, icon('save'), h('span', { text: 'In Dateien sichern' }));
    body.append(
      h('div.bkready', null, h('b', { text: name }), h('small', { text: fmtBytes(blob.size) })),
      h('ol.bksteps', null,
        h('li', { text: 'Tippe auf „In Dateien sichern“.' }),
        h('li', { text: 'Wähle im Teilen-Menü „In Dateien sichern“.' }),
        h('li', { text: 'Nimm den Ordner „iCloud Drive“, dann ist die Sicherung auch außerhalb des iPads.' })),
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(false) } }), go));
  });
  if (ok) {
    const c = backupCfg(); c.last = Date.now(); c.size = blob.size; setCfg(c);
    toast(`Gesichert · ${fmtBytes(blob.size)}`);
    if (after) after();
  }
  return ok;
}

// Übersicht: Status, Intervall, Speicherschutz
export function backupSheet({ saveFile, onLoad, after }) {
  return sheet('Sicherung', async (body, close) => {
    const c = backupCfg();
    let persisted = false;
    try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (e) { /* egal */ }
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const seg = h('div.seg');
    for (const [v, l] of [[1, 'Täglich'], [7, 'Wöchentlich'], [14, 'Alle 2 Wochen'], [0, 'Aus']]) {
      const b = h('button' + (c.every === v ? '.on' : ''), { text: l, on: { click: () => { const x = backupCfg(); x.every = v; setCfg(x); seg.querySelectorAll('button').forEach((y) => y.classList.toggle('on', y === b)); } } });
      seg.append(b);
    }
    const stat = (ok, title, text) => h('div.bkstat' + (ok ? '.ok' : '.warn'), null, h('i'), h('span', null, h('b', { text: title }), h('small', { text })));
    body.append(
      stat(daysSince(c.last) <= Math.max(1, c.every || 7), `Letzte Sicherung: ${sinceText(c.last)}`, c.last ? `${new Date(c.last).toLocaleDateString('de-DE')} · ${fmtBytes(c.size)}` : 'Am besten jetzt gleich eine machen.'),
      stat(persisted || standalone, persisted ? 'Speicher ist geschützt' : standalone ? 'Als App auf dem Home-Bildschirm' : 'Speicher nicht dauerhaft geschützt',
        persisted ? 'Das iPad löscht die Daten nicht von selbst.'
          : standalone ? 'So räumt Safari die Daten nicht nach ein paar Tagen ohne Nutzung auf. Sichern bleibt trotzdem wichtig.'
            : 'Tipp: In Safari „Teilen“ → „Zum Home-Bildschirm“. Als App ist der Speicher sicherer.'),
      h('p.fieldlabel', { text: 'Erinnern' }), seg,
      h('p.calm.small', { text: 'Ein Browser darf nicht von selbst in die Dateien-App schreiben. Die App erinnert dich, du tippst einmal zum Sichern.' }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Sicherung laden', on: { click: () => { close(null); onLoad(); } } }),
        h('button.btn.primary', { text: 'Jetzt sichern', on: { click: async () => { close(null); await backupNow({ saveFile, after }); } } })));
    if (!persisted) db.askPersistent();
  }, { wide: true });
}
