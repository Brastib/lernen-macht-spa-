// Vertretungsplan aus dem Schulportal Hessen.
// Die App fragt einen eigenen kleinen Zwischen-Server (Cloudflare Worker, siehe Ordner worker/).
// Der Worker loggt sich ein und gibt die Vertretungen als JSON zurück. Grund: Der Browser darf
// wegen CORS nicht selbst beim Schulportal einloggen.
import * as db from './db.js';
import { h, icon, toast, sheet, confirmSheet } from './ui.js';

const CFG = 'vplancfg';
const DATA = 'vplan';
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export async function vplanCfg() { return db.getMeta(CFG); }
export async function vplanCached() { return db.getMeta(DATA); }

// Holt den Plan vom Worker. Gibt { data, at, error } zurück; bei Fehler bleibt der alte Stand.
let running = null;
export function refreshVplan({ fresh = false } = {}) {
  if (running) return running;
  running = (async () => {
    const cfg = await vplanCfg();
    if (!cfg || !cfg.url) return { error: 'Noch nicht eingerichtet.' };
    const old = await vplanCached();
    try {
      const res = await fetchWorker(cfg, fresh);
      const rec = { id: DATA, at: Date.now(), data: res, error: null };
      await db.putItems('meta', rec);
      return rec;
    } catch (e) {
      const rec = { ...(old || { id: DATA, at: 0, data: null }), error: e.message, errorAt: Date.now() };
      await db.putItems('meta', rec);
      return rec;
    }
  })().finally(() => { running = null; });
  return running;
}

async function fetchWorker(cfg, fresh) {
  let res;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    res = await fetch(cfg.url.replace(/\/+$/, '') + '/' + (fresh ? '?frisch=1' : ''), { headers: { 'X-App-Key': cfg.key || '' }, signal: ctl.signal, cache: 'no-store' });
  } catch (e) {
    throw new Error(navigator.onLine === false ? 'Kein Internet.' : 'Worker nicht erreichbar. Stimmt die Adresse?');
  } finally { clearTimeout(t); }
  let j = null;
  try { j = await res.json(); } catch (e) { /* unten */ }
  if (!j) throw new Error(`Worker hat keine lesbare Antwort geschickt (Status ${res.status}).`);
  if (!j.ok) throw new Error(j.message || 'Unbekannter Fehler im Worker.');
  return j;
}

// Einträge pro Datum. Eigene Einträge zuerst. Nur wenn die leer sind und eine Klasse eingetragen ist,
// werden passende Zeilen aus dem ganzen Plan genommen (den sehen Schüler meist gar nicht).
export function entriesByDate(data, klasse) {
  const out = new Map();
  if (!data || !data.days) return out;
  const k = (klasse || '').trim().toLowerCase();
  const fits = (e) => k && new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test((e.klasse || '').toLowerCase());
  for (const d of data.days) {
    let list = d.mine || [];
    if (!list.length && k && Array.isArray(d.all)) list = d.all.filter(fits);
    out.set(d.date, { list, notice: d.notice, updated: d.updated });
  }
  return out;
}

// „3“ → [3], „5 - 6“ → [5, 6], „1.–2.“ → [1, 2]
export function periodsOf(stunde) {
  const n = String(stunde || '').match(/\d+/g);
  if (!n) return [];
  const a = +n[0], b = n.length > 1 ? +n[n.length - 1] : a;
  const out = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 12; i++) out.push(i);
  return out;
}

export function kindOf(e) {
  const t = `${e.art} ${e.hinweis}`.toLowerCase();
  if (/entfall|fällt aus|faellt aus|ausfall|frei|eva\b|selbstständig|selbststaendig/.test(t)) return 'aus';
  if (/raum/.test(e.art.toLowerCase()) && !e.vertreter) return 'raum';
  return 'vt';
}
export const KIND_LABEL = { aus: 'Entfall', raum: 'Raumänderung', vt: 'Vertretung' };

// Kurzer Text für das Kästchen im Stundenplan
export function shortText(e) {
  const k = kindOf(e);
  if (k === 'aus') return 'Entfall';
  if (k === 'raum') return e.raum ? `Raum ${e.raum}` : 'Raumänderung';
  return e.vertreter ? `Vertretung: ${e.vertreter}` : (e.art || 'Vertretung');
}

// Ganze Zeile für Listen und Details
export const stundeText = (e) => String(e.stunde || '').replace(/\s*-\s*/g, '–');

export function detailText(e, { noFach = false } = {}) {
  const parts = [];
  const fach = noFach ? '' : e.fach && e.fachAlt && e.fach !== e.fachAlt ? `${e.fach} statt ${e.fachAlt}` : (e.fach || e.fachAlt);
  if (fach) parts.push(fach);
  if (e.vertreter || e.lehrer) parts.push(e.vertreter && e.lehrer && e.vertreter !== e.lehrer ? `${e.vertreter} statt ${e.lehrer}` : (e.vertreter || e.lehrer));
  const raum = e.raum && e.raumAlt && e.raum !== e.raumAlt ? `Raum ${e.raum} statt ${e.raumAlt}` : (e.raum || e.raumAlt ? `Raum ${e.raum || e.raumAlt}` : '');
  if (raum) parts.push(raum);
  if (e.hinweis) parts.push(e.hinweis);
  return parts.join(' · ');
}

export function dayLabel(iso) {
  const d = parseIso(iso);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t0) / 864e5);
  const rel = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : DAYS[d.getDay()];
  return `${rel}, ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function ageText(at) {
  if (!at) return 'noch nie geladen';
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min`;
  const d = new Date(at);
  const same = isoDate(d) === isoDate(new Date());
  return `${same ? 'heute' : `${d.getDate()}.${d.getMonth() + 1}.`} um ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Einrichten ----------
// Eingaben werden sofort zwischengespeichert. Wenn du zum Kopieren in eine andere App wechselst
// und iPadOS die App dabei neu lädt, geht der Dialog beim Zurückkommen mit deinen Eingaben wieder auf.
const DRAFT = 'vplanDraft';
const readDraft = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); return d && Date.now() - d.t < 2 * 864e5 ? d : null; } catch (e) { return null; } };
const writeDraft = (d) => { try { localStorage.setItem(DRAFT, JSON.stringify({ ...d, t: Date.now() })); } catch (e) { /* egal */ } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch (e) { /* egal */ } };

// Adresse ergänzen: „vertretung.x.workers.dev“ → „https://vertretung.x.workers.dev“
// Kurzform reicht: „deinname“ → https://vertretung.deinname.workers.dev (Worker-Name aus der Anleitung)
export function cleanUrl(v) {
  let u = String(v || '').trim().replace(/[\s<>"']/g, '').replace(/\/+$/, '');
  if (!u) return '';
  if (/^[a-z0-9-]+$/i.test(u)) u = `vertretung.${u}.workers.dev`;
  else if (/^vertretung\.[a-z0-9-]+$/i.test(u)) u = `${u}.workers.dev`;
  if (!/^https?:\/\//i.test(u) && /\./.test(u)) u = 'https://' + u;
  return u.replace(/^http:\/\//i, 'https://').toLowerCase();
}
// Aus einem eingefügten Text Adresse und Schlüssel herausholen
export function splitPaste(text) {
  const t = String(text || '');
  const m = t.match(/(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev[^\s<>"']*/i) || t.match(/https?:\/\/[^\s<>"']+/i);
  const url = m ? cleanUrl(m[0]) : '';
  const rest = m ? t.replace(m[0], ' ') : t;
  const words = rest.split(/[\s,;|]+/).map((w) => w.replace(/^[^A-Za-z0-9_-]+|[^A-Za-z0-9_-]+$/g, '')).filter(Boolean);
  const key = words.find((w) => /^vp-/.test(w)) || words.filter((w) => w.length >= 12 && /^[A-Za-z0-9_-]+$/.test(w)).sort((a, b) => b.length - a.length)[0] || '';
  return { url, key };
}
async function clip() {
  try { if (navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText(); } catch (e) { /* abgelehnt */ }
  return null;
}

// Beim Start der App: war der Dialog offen, als die App weg war? Dann wieder öffnen.
export function resumeVplanSetup(after) {
  const d = readDraft();
  if (d && d.open && !document.querySelector('.dlgscrim')) vplanSetup(after);
}

export async function vplanSetup(after) {
  const saved = (await vplanCfg()) || { id: CFG, url: '', key: '', klasse: '' };
  const draft = readDraft();
  const cur = draft ? { ...saved, url: draft.url ?? saved.url, key: draft.key ?? saved.key, klasse: draft.klasse ?? saved.klasse } : saved;
  let hideRef = null;
  const res = await sheet('Vertretungsplan verbinden', (body, close) => {
    const field = (id, ph, value, type = 'text') => h('input.field', { type, id, placeholder: ph, value: value || '', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const url = field('vpUrl', 'z. B. deinname', cur.url, 'url');
    const key = field('vpKey', 'dein App-Schlüssel', cur.key);
    const kl = field('vpKl', 'z. B. 8b (optional)', cur.klasse);
    const both = h('textarea.field.vpboth', { id: 'vpBoth', rows: '2', placeholder: 'Adresse und Schlüssel zusammen', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const status = h('p.calm.small', { text: draft ? 'Deine Eingaben von eben sind noch da.' : '' });
    const urlHint = h('p.calm.small.vphint', { text: '' });
    const showHint = () => { const c = cleanUrl(url.value); urlHint.textContent = c && c !== url.value.trim() ? 'Wird zu: ' + c : ''; };
    url.addEventListener('input', showHint); showHint();
    const save = () => writeDraft({ open: true, url: url.value, key: key.value, klasse: kl.value });
    hideRef = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', hideRef);
    save();
    for (const el of [url, key, kl]) el.addEventListener('input', save);
    url.addEventListener('blur', () => { url.value = cleanUrl(url.value); showHint(); save(); });
    const fromBoth = (text) => {
      const p = splitPaste(text);
      if (p.url) url.value = p.url;
      if (p.key) key.value = p.key;
      save();
      status.textContent = p.url && p.key ? 'Adresse und Schlüssel erkannt.' : p.url ? 'Adresse erkannt. Den Schlüssel noch einfügen.' : p.key ? 'Schlüssel erkannt. Die Adresse noch einfügen.' : 'Nichts erkannt. Die Adresse fängt mit https:// an oder endet auf .workers.dev.';
    };
    both.addEventListener('input', () => fromBoth(both.value));
    const pasteBtn = (target, label) => h('button.btn.vppaste', { text: 'Einfügen', 'aria-label': label + ' einfügen', on: { click: async () => {
      const t = await clip();
      if (t == null) { target.focus(); status.textContent = 'Lange auf das Feld tippen und dann „Einfügen“ wählen.'; return; }
      if (target === both) { both.value = t; fromBoth(t); return; }
      const p = splitPaste(t);
      target.value = target === url ? (p.url || cleanUrl(t)) : (p.key || t.trim());
      save();
    } } });
    const row = (input, label) => h('div.vpfield', null, input, pasteBtn(input, label));
    const test = async () => {
      url.value = cleanUrl(url.value); save();
      status.textContent = 'Teste Verbindung …';
      try {
        const j = await fetchWorker({ url: url.value.trim(), key: key.value.trim() }, true);
        const n = (j.days || []).reduce((a, d) => a + (d.mine || []).length, 0);
        status.textContent = `Klappt. ${j.days.length} Tag(e) im Plan, ${n} Eintrag/Einträge für dich.`;
        return j;
      } catch (e) { status.textContent = 'Fehler: ' + e.message; return null; }
    };
    body.append(
      h('p.dlgtext', { text: 'Die App holt den Plan über deinen eigenen Cloudflare Worker. Du kannst ruhig zum Kopieren in eine andere App wechseln: Deine Eingaben bleiben, und dieses Fenster geht beim Zurückkommen wieder auf.' }),
      h('label.fieldlabel', { for: 'vpBoth', text: 'Beides auf einmal (optional)' }), row(both, 'Adresse und Schlüssel'),
      h('label.fieldlabel', { for: 'vpUrl', text: 'Adresse des Workers (dein Cloudflare-Name reicht)' }), row(url, 'Adresse'), urlHint,
      h('label.fieldlabel', { for: 'vpKey', text: 'App-Schlüssel (derselbe wie APP_SCHLUESSEL im Worker)' }), row(key, 'Schlüssel'),
      h('label.fieldlabel', { for: 'vpKl', text: 'Deine Klasse (nur nötig, falls deine Schule den ganzen Plan zeigt)' }), kl,
      status,
      h('div.dlgactions', null,
        saved.url ? h('button.btn.danger', { text: 'Trennen', on: { click: () => close({ remove: true }) } }) : null,
        h('button.btn', { text: 'Testen', on: { click: test } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: async () => {
          url.value = cleanUrl(url.value); save();
          if (!/^https:\/\/[^/]+\.[^/]+/.test(url.value.trim())) { status.textContent = 'Bitte die Adresse des Workers eintragen (fängt mit https:// an).'; return; }
          if (!key.value.trim()) { status.textContent = 'Bitte den App-Schlüssel eintragen.'; return; }
          close({ url: url.value.trim(), key: key.value.trim(), klasse: kl.value.trim() });
        } } })));
  });
  // Fenster ist zu (egal wie): Zwischenspeicher weg
  document.removeEventListener('visibilitychange', hideRef);
  dropDraft();
  if (!res) return;
  if (res.remove) {
    if (!(await confirmSheet('Vertretungsplan trennen?', 'Adresse, Schlüssel und der gespeicherte Plan werden aus der App gelöscht. Der Worker bei Cloudflare bleibt bestehen.', 'Trennen'))) return;
    await db.putItems('meta', { id: CFG, url: '', key: '', klasse: '' });
    await db.putItems('meta', { id: DATA, at: 0, data: null, error: null });
    toast('Getrennt');
    after && after();
    return;
  }
  await db.putItems('meta', { id: CFG, ...res });
  const r = await refreshVplan({ fresh: true });
  toast(r.error ? 'Gesichert, aber: ' + r.error : 'Vertretungsplan verbunden');
  after && after();
}

// ---------- Anzeige ----------
// Markierungen für den Stundenplan: Map "day-p" → [Einträge] für die Woche ab monday
export function weekMarks(byDate, monday, days) {
  const marks = new Map();
  for (let d = 0; d < days; d++) {
    const date = new Date(monday); date.setDate(monday.getDate() + d);
    const e = byDate.get(isoDate(date));
    if (!e) continue;
    for (const x of e.list) for (const n of periodsOf(x.stunde)) {
      const k = `${d}-${n - 1}`;
      if (!marks.has(k)) marks.set(k, []);
      marks.get(k).push(x);
    }
  }
  return marks;
}

export function showEntries(title, list, { onEdit } = {}) {
  return sheet(title, (body, close) => {
    for (const e of list) {
      const k = kindOf(e);
      body.append(h('div.vprow.' + k, null,
        h('span.vpkind', { text: KIND_LABEL[k] }),
        h('span.vptext', null, h('b', { text: [e.stunde ? `${stundeText(e)}. Std` : '', e.art && e.art !== KIND_LABEL[k] ? e.art : ''].filter(Boolean).join(' · ') || KIND_LABEL[k] }),
          h('small', { text: detailText(e) || '–' }))));
    }
    body.append(h('p.calm.small', { text: 'Aus dem Schulportal Hessen. Im Zweifel gilt immer der Plan im Schulportal.' }),
      h('div.dlgactions', null,
        onEdit ? h('button.btn', { text: 'Stunde bearbeiten', on: { click: () => { close(null); onEdit(); } } }) : null,
        h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } })));
  });
}

// Kasten über dem Stundenplan
export async function vplanBox({ onChange }) {
  const cfg = await vplanCfg();
  const box = h('section.vpbox');
  if (!cfg || !cfg.url) {
    box.append(h('button.dayrow.vpsetup', { on: { click: () => vplanSetup(onChange) } },
      icon('list'), h('span', null, h('b', { text: 'Vertretungsplan verbinden' }), h('small', { text: 'Ausfälle und Vertretungen aus dem Schulportal Hessen hier im Stundenplan sehen' }))));
    return box;
  }
  const rec = await vplanCached();
  const byDate = entriesByDate(rec && rec.data, cfg.klasse);
  const refresh = h('button.txt.strong', { text: 'Aktualisieren', on: { click: async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Lädt …';
    const r = await refreshVplan({ fresh: true });
    if (r.error) toast(r.error, 4000);
    onChange();
  } } });
  box.append(h('div.colhead', null, h('h2.section', { text: 'Vertretungsplan' }),
    h('span.vphead', null, refresh, h('button.icbtn', { 'aria-label': 'Vertretungsplan einrichten', title: 'Einrichten', on: { click: () => vplanSetup(onChange) } }, icon('more')))));
  const stand = rec && rec.at ? `Stand ${ageText(rec.at)}` : 'Noch nicht geladen';
  box.append(h('p.calm.small', { text: stand + (rec && rec.error ? ` · Letzter Versuch: ${rec.error}` : '') }));
  if (rec && rec.data && rec.data.noPlanYet) box.append(h('p.calm', { text: 'Im Schulportal ist gerade noch kein Plan veröffentlicht.' }));
  const today = isoDate(new Date());
  const dates = [...byDate.keys()].filter((d) => d >= today).sort();
  for (const date of dates) {
    const { list, notice } = byDate.get(date);
    const day = h('div.vpday', null, h('h3.vpdate', { text: dayLabel(date) }));
    if (notice) day.append(h('p.vpnotice', { text: notice }));
    if (!list.length) day.append(h('p.calm.small', { text: 'Keine Änderungen für dich.' }));
    for (const e of list) {
      const k = kindOf(e);
      day.append(h('button.vprow.' + k, { on: { click: () => showEntries(dayLabel(date), [e]) } },
        h('span.vpkind', { text: e.stunde ? `${stundeText(e)}.` : '–' }),
        h('span.vptext', null, h('b', { text: KIND_LABEL[k] + (e.fach || e.fachAlt ? ` · ${e.fach && e.fachAlt && e.fach !== e.fachAlt ? `${e.fach} statt ${e.fachAlt}` : (e.fach || e.fachAlt)}` : '') }), h('small', { text: detailText(e, { noFach: true }) || '–' }))));
    }
    box.append(day);
  }
  if (rec && rec.data && !dates.length && !rec.data.noPlanYet) box.append(h('p.calm', { text: 'Keine Pläne für heute oder später.' }));
  return box;
}

// Für die Startseite und den Stundenplan: alten Stand nachladen, wenn er älter als maxMin Minuten ist
export async function refreshIfOld(maxMin, done) {
  const cfg = await vplanCfg();
  if (!cfg || !cfg.url || navigator.onLine === false) return;
  const rec = await vplanCached();
  const last = Math.max(rec && rec.at || 0, rec && rec.errorAt || 0);
  if (Date.now() - last < maxMin * 60000) return;
  const r = await refreshVplan();
  if (done && !r.error) done();
}
