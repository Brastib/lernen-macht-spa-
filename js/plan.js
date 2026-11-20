// Lernplan vor Prüfungen: aus Prüfungstermin, Themen und Lernkarten einen Tag-für-Tag-Plan bauen.
// Der Plan liegt in der Prüfung selbst (ex.plan), wird also mit gesichert und wiederhergestellt.
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, confirmSheet } from './ui.js';
import { startStudy, dueCount } from './cards.js';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const todayIso = () => iso(new Date());
const tid = () => Math.random().toString(36).slice(2, 9);

export const PHASES = { learn: 'Neues lernen', review: 'Wiederholen', final: 'Generalprobe' };

// Themen aus dem Prüfungs-Thema vorschlagen (eine Zeile / Komma = ein Thema, Seitenangaben bleiben dran)
export function guessTopics(text) {
  if (!text) return [];
  const parts = text.split(/\n|;|,(?!\s*\d)/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (/^(buch\s*)?(s\.|seite|seiten|ab\b|nr\.?)\s*\d/i.test(p) && out.length) out[out.length - 1] += ', ' + p;
    else out.push(p);
  }
  return out.slice(0, 20);
}

// Lerntage zwischen heute und dem Tag vor der Prüfung
export function studyDays(examDate, { skipWeekend = false, from = new Date() } = {}) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = parse(examDate);
  const all = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) all.push(new Date(d));
  if (!skipWeekend) return all;
  const wk = all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  // Wochenende nur weglassen, wenn dann noch genug Zeit bleibt; der letzte Tag vor der Prüfung bleibt immer
  if (wk.length < 2) return all;
  const last = all[all.length - 1];
  if (!wk.some((d) => +d === +last)) wk.push(last);
  return wk;
}

// Den Plan bauen. topics: Liste, decks: [{id,title}], minutes: Zeit pro Tag
export function buildPlan({ examDate, topics, decks = [], minutes = 30, skipWeekend = false, from }) {
  const days = studyDays(examDate, { skipWeekend, from });
  const N = days.length;
  if (!N) return null;
  const T = topics.length ? topics : ['Unterlagen durchsehen und Lücken markieren', 'Übungsaufgaben rechnen'];
  const plan = days.map((d) => ({ date: iso(d), phase: 'learn', tasks: [] }));
  const task = (kind, text, extra = {}) => ({ id: tid(), kind, text, done: false, ...extra });
  const cardsTasks = () => decks.map((dk) => task('cards', `Lernkarten: ${dk.title}`, { deckId: dk.id }));

  if (N === 1) {
    plan[0].phase = 'final';
    plan[0].tasks.push(task('review', `Alles kurz durchgehen: ${T.join(', ')}`), task('test', 'Probetest: 3 typische Aufgaben ohne Hilfe lösen'), ...cardsTasks(), task('pack', 'Sachen packen, früh schlafen'));
    return plan;
  }
  const final = plan[N - 1];
  final.phase = 'final';
  const work = N - 1;
  // Neues lernen: gut zwei Drittel der Tage, mindestens 1, höchstens so viele wie nötig
  let learnN = Math.max(1, Math.round(work * 0.65));
  if (work >= 3 && learnN === work) learnN = work - 1;
  const reviewN = work - learnN;
  // Themen gleichmäßig auf die Lerntage verteilen. Gibt es mehr Tage als Themen, bekommt ein Thema einen Übungstag.
  const learnedOn = new Map();
  if (T.length >= learnN) {
    for (let i = 0; i < T.length; i++) {
      const di = Math.floor(i * learnN / T.length);
      plan[di].tasks.push(task('learn', `${T[i]}: verstehen und Beispiele durcharbeiten`));
      learnedOn.set(i, di);
    }
  } else {
    const per = learnN / T.length;
    for (let i = 0; i < T.length; i++) {
      const a = Math.floor(i * per), b = Math.floor((i + 1) * per);
      plan[a].tasks.push(task('learn', `${T[i]}: verstehen und Beispiele durcharbeiten`));
      learnedOn.set(i, a);
      for (let k = a + 1; k < b; k++) plan[k].tasks.push(task('practice', `${T[i]}: Aufgaben üben`));
    }
  }
  // Kurze Wiederholung zwei Tage später (wenn die Zeit reicht)
  if (minutes >= 30) {
    for (const [i, di] of learnedOn) {
      const r = di + 2;
      if (r < learnN) plan[r].tasks.push(task('review', `Kurz wiederholen: ${T[i]}`));
    }
  }
  // Wiederholungstage: alle Themen reihum, dazu gemischte Aufgaben
  for (let k = 0; k < reviewN; k++) {
    const day = plan[learnN + k];
    day.phase = 'review';
    const per = Math.ceil(T.length / reviewN);
    const mine = T.slice(k * per, (k + 1) * per);
    if (mine.length) day.tasks.push(task('review', `Wiederholen: ${mine.join(', ')}`));
    day.tasks.push(task('practice', k === reviewN - 1 && reviewN > 1 ? 'Gemischte Aufgaben, Fehler von vorher nochmal' : 'Gemischte Aufgaben zu allen Themen'));
  }
  final.tasks.push(task('test', 'Probetest: typische Aufgaben ohne Hilfe, mit Uhr'), task('review', 'Was noch unsicher war, ein letztes Mal ansehen'));
  // Lernkarten jeden Tag (sie fragen von selbst nur das Fällige ab)
  for (const d of plan) d.tasks.push(...cardsTasks());
  final.tasks.push(task('pack', 'Sachen packen, früh schlafen'));
  return plan;
}

export function planStats(plan, today = todayIso()) {
  const all = plan.days.flatMap((d) => d.tasks);
  const done = all.filter((t) => t.done).length;
  const missed = plan.days.filter((d) => d.date < today).flatMap((d) => d.tasks).filter((t) => !t.done && t.kind !== 'cards' && t.kind !== 'pack');
  const td = plan.days.find((d) => d.date === today) || null;
  return { total: all.length, done, pct: all.length ? done / all.length : 0, missed, today: td };
}

// Verpasste Aufgaben auf die übrigen Tage verteilen (vor der Generalprobe)
export function redistribute(plan, today = todayIso()) {
  const st = planStats(plan, today);
  const rest = plan.days.filter((d) => d.date >= today);
  if (!st.missed.length || !rest.length) return 0;
  const slots = rest.length > 1 ? rest.slice(0, -1) : rest;
  for (const d of plan.days) if (d.date < today) d.tasks = d.tasks.filter((t) => !st.missed.includes(t));
  st.missed.forEach((t, i) => {
    const d = slots[i % slots.length];
    // vor den Lernkarten einreihen
    const at = d.tasks.findIndex((x) => x.kind === 'cards' || x.kind === 'pack');
    t.moved = true;
    d.tasks.splice(at < 0 ? d.tasks.length : at, 0, t);
  });
  return st.missed.length;
}

function dayLabel(dateStr) {
  const d = parse(dateStr), t = todayIso();
  const tm = iso(new Date(Date.now() + DAY));
  const name = dateStr === t ? 'Heute' : dateStr === tm ? 'Morgen' : WD[d.getDay()];
  return { name, date: `${d.getDate()}.${d.getMonth() + 1}.` };
}

// ---------- Einrichten ----------
export async function planSetup(ex, { subject }) {
  const decks = (await db.listDecks(ex.subjectId)).sort((a, b) => a.title.localeCompare(b.title));
  const old = ex.plan;
  return sheet(old ? 'Lernplan anpassen' : 'Lernplan erstellen', (body, close) => {
    let minutes = old ? old.minutes : 30, skip = old ? !!old.skipWeekend : false;
    const picked = new Set(old ? old.deckIds || [] : decks.map((d) => d.id));
    const topics = h('textarea.field.area', { id: 'plTopics', rows: 5, placeholder: 'Ein Thema pro Zeile, z. B.\nLineare Funktionen\nSteigung berechnen\nSchnittpunkte' });
    topics.value = (old ? old.topics : guessTopics(ex.topic)).join('\n');
    const info = h('p.planinfo');
    const upd = () => {
      const n = studyDays(ex.date, { skipWeekend: skip }).length;
      const t = topics.value.split('\n').map((x) => x.trim()).filter(Boolean).length;
      info.textContent = n ? `${plural(n, 'Lerntag', 'Lerntage')} bis zur Prüfung · ${t ? plural(t, 'Thema', 'Themen') : 'noch keine Themen'} · etwa ${minutes} Minuten am Tag` : 'Die Prüfung ist heute, dafür gibt es keinen Plan mehr.';
      go.disabled = !n;
    };
    const seg = (items, cur, set) => {
      const s = h('div.seg');
      for (const [k, l] of items) {
        const b = h('button' + (k === cur ? '.on' : ''), { text: l, on: { click: () => { set(k); s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); upd(); } } });
        s.append(b);
      }
      return s;
    };
    const chips = h('div.chips.plandecks');
    for (const d of decks) {
      const b = h('button.pchip' + (picked.has(d.id) ? '.on' : ''), { on: { click: () => { picked.has(d.id) ? picked.delete(d.id) : picked.add(d.id); b.classList.toggle('on', picked.has(d.id)); } } }, icon('cards'), h('span', { text: d.title }));
      chips.append(b);
    }
    topics.addEventListener('input', upd);
    const go = h('button.btn.primary', { text: old ? 'Neu planen' : 'Plan erstellen', on: { click: () => {
      const list = topics.value.split('\n').map((x) => x.trim()).filter(Boolean);
      close({ topics: list, minutes, skipWeekend: skip, deckIds: [...picked] });
    } } });
    body.append(
      h('label.fieldlabel', { for: 'plTopics', text: 'Themen' }), topics,
      h('p.calm.small', { text: 'Ein Thema pro Zeile. Die App verteilt sie: erst Neues lernen, dann wiederholen, am letzten Tag eine Generalprobe.' }),
      decks.length ? h('p.fieldlabel', { text: 'Lernkarten jeden Tag' }) : null, decks.length ? chips : null,
      h('p.fieldlabel', { text: 'Zeit pro Tag' }), seg([[15, '15 Min'], [30, '30 Min'], [45, '45 Min'], [60, '1 Std']], minutes, (v) => { minutes = v; }),
      h('p.fieldlabel', { text: 'Lernen an' }), seg([[false, 'Jeden Tag'], [true, 'Nur Mo bis Fr']], skip, (v) => { skip = v; }),
      info,
      h('div.dlgactions', null,
        old ? h('button.btn.danger', { text: 'Plan löschen', on: { click: () => close('delete') } }) : null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), go));
    upd();
  }, { wide: true }).then(async (res) => {
    if (!res) return null;
    if (res === 'delete') {
      if (!(await confirmSheet('Lernplan löschen?', 'Der Plan und die Häkchen verschwinden. Die Prüfung bleibt.'))) return null;
      delete ex.plan; await db.putItems('exams', ex); toast('Lernplan gelöscht'); return 'deleted';
    }
    const chosen = decks.filter((d) => res.deckIds.includes(d.id));
    const days = buildPlan({ examDate: ex.date, topics: res.topics, decks: chosen, minutes: res.minutes, skipWeekend: res.skipWeekend });
    if (!days) { toast('Für heute gibt es keinen Plan mehr'); return null; }
    // Erledigtes aus dem alten Plan übernehmen (gleicher Text am gleichen Tag)
    if (old) {
      const doneKeys = new Set(old.days.flatMap((d) => d.tasks.filter((t) => t.done).map((t) => d.date + '|' + t.text)));
      for (const d of days) for (const t of d.tasks) if (doneKeys.has(d.date + '|' + t.text)) t.done = true;
      // Vergangene Tage bleiben, wie sie waren
      const past = old.days.filter((d) => d.date < todayIso());
      days.unshift(...past);
    }
    ex.plan = { created: old ? old.created : Date.now(), topics: res.topics, minutes: res.minutes, skipWeekend: res.skipWeekend, deckIds: res.deckIds, days };
    await db.putItems('exams', ex);
    toast(old ? 'Lernplan angepasst' : 'Lernplan erstellt');
    return ex;
  });
}

// ---------- Fortschrittsring ----------
function ring(pct, label) {
  const r = 26, c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'planring');
  const bg = document.createElementNS(ns, 'circle'); bg.setAttribute('cx', 32); bg.setAttribute('cy', 32); bg.setAttribute('r', r); bg.setAttribute('class', 'rbg');
  const fg = document.createElementNS(ns, 'circle'); fg.setAttribute('cx', 32); fg.setAttribute('cy', 32); fg.setAttribute('r', r); fg.setAttribute('class', 'rfg');
  fg.setAttribute('stroke-dasharray', `${c * pct} ${c}`);
  if (!pct) fg.classList.add('zero');
  s.append(bg, fg);
  return h('div.ringwrap', null, s, h('b', { text: label }));
}

// ---------- Aufgabe abhaken ----------
async function toggle(ex, t, after) {
  t.done = !t.done;
  await db.putItems('exams', ex);
  if (t.done) toast(planStats(ex.plan).pct >= 1 ? 'Alles erledigt. Viel Erfolg!' : 'Erledigt');
  after();
}
async function runCards(ex, t, after) {
  const deck = (await db.listDecks()).find((d) => d.id === t.deckId);
  if (!deck) { toast('Diesen Kartenstapel gibt es nicht mehr'); return; }
  const cards = await db.listCards(deck.id);
  if (!cards.length) { toast('Im Stapel sind noch keine Karten'); return; }
  startStudy(deck, cards, async () => {
    const left = dueCount(await db.listCards(deck.id));
    if (!left && !t.done) { t.done = true; await db.putItems('exams', ex); toast('Lernkarten erledigt'); }
    after();
  });
}

function taskRow(ex, t, after, { compact = false } = {}) {
  return h('div.ptask' + (t.done ? '.done' : '') + '.k-' + t.kind, null,
    h('button.hwcheck', { 'aria-label': t.done ? 'Wieder offen' : 'Erledigt', 'aria-pressed': String(!!t.done), on: { click: () => toggle(ex, t, after) } }, icon('select')),
    h('span.ptext', null, h('span', { text: t.text }), t.moved && !t.done && !compact ? h('small', { text: 'verschoben' }) : null),
    t.kind === 'cards' && !t.done ? h('button.btn.small', { on: { click: () => runCards(ex, t, after) } }, icon('play'), h('span', { text: 'Starten' })) : null);
}

// ---------- Ansicht ----------
export async function renderPlan(ctx, examId) {
  const [exams, subjects] = await Promise.all([db.listExams(), db.listSubjects()]);
  const ex = exams.find((x) => x.id === examId);
  const again = () => renderPlan(ctx, examId);
  if (!ex) { ctx.go({ view: 'exams' }); return; }
  const s = subjects.find((x) => x.id === ex.subjectId);
  const left = Math.round((parse(ex.date) - parse(todayIso())) / DAY);
  const view = $('view');
  view.textContent = '';
  if (s) view.style.setProperty('--c', s.color);
  const edit = async () => { const r = await planSetup(ex, { subject: s }); if (r) again(); };
  if (!ex.plan) {
    ctx.setHeader({ back: { label: 'Prüfungen', go: () => ctx.go({ view: 'exams' }) }, eyebrow: 'Lernplan', title: `${ex.kind}${s ? ' · ' + s.name : ''}`, meta: '', actions: [] });
    view.append(h('section.empty', null, h('h2', { text: 'Noch kein Lernplan' }),
      h('p', { text: 'Gib die Themen ein. Die App verteilt sie auf die Tage bis zur Prüfung, mit Wiederholungen und einer Generalprobe am Schluss.' }),
      h('div.emptyactions', null, ctx.btn('Lernplan erstellen', 'list', edit, '.primary'))));
    return;
  }
  const st = planStats(ex.plan);
  const d = parse(ex.date);
  ctx.setHeader({
    back: { label: 'Prüfungen', go: () => ctx.go({ view: 'exams' }) },
    eyebrow: 'Lernplan', title: `${ex.kind}${s ? ' · ' + s.name : ''}`,
    meta: `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. · ${left < 0 ? 'vorbei' : left === 0 ? 'heute' : left === 1 ? 'morgen' : `noch ${left} Tage`}`,
    actions: [ctx.btn('Anpassen', 'edit', edit)],
  });
  const td = st.today;
  const openToday = td ? td.tasks.filter((t) => !t.done).length : 0;
  const head = h('section.planhead', null,
    ring(st.pct, `${Math.round(st.pct * 100)} %`),
    h('div.planheadtext', null,
      h('b', { text: left <= 0 ? 'Die Prüfung ist da. Viel Erfolg!' : td ? (openToday ? `Heute: ${plural(openToday, 'Aufgabe', 'Aufgaben')} · etwa ${ex.plan.minutes} Min` : 'Heute ist alles erledigt') : 'Heute ist ein freier Tag' }),
      h('small', { text: `${st.done} von ${st.total} erledigt${ex.topic ? ' · ' + ex.topic.split('\n')[0] : ''}` })));
  view.append(head);
  if (st.missed.length && left > 0) {
    view.append(h('div.planmiss', null, h('span', null, h('b', { text: `${plural(st.missed.length, 'Aufgabe ist', 'Aufgaben sind')} liegen geblieben` }), h('small', { text: 'Kein Problem. Die App kann sie auf die nächsten Tage verteilen.' })),
      h('button.btn.primary', { text: 'Neu verteilen', on: { click: async () => { const n = redistribute(ex.plan); await db.putItems('exams', ex); toast(`${plural(n, 'Aufgabe', 'Aufgaben')} verteilt`); again(); } } })));
  }
  const tl = h('div.plantl');
  const past = [];
  const t0 = todayIso();
  for (const day of ex.plan.days) {
    const lab = dayLabel(day.date);
    const done = day.tasks.length && day.tasks.every((t) => t.done);
    const card = h('section.planday' + (day.date === t0 ? '.today' : '') + (done ? '.alldone' : '') + '.ph-' + day.phase, null,
      h('div.pdhead', null,
        h('span.pddate', null, h('b', { text: lab.name }), h('small', { text: lab.date })),
        h('em.pdphase', { text: PHASES[day.phase] }),
        h('small.pdmin', { text: done ? 'erledigt' : `≈ ${ex.plan.minutes} Min` })),
      h('div.pdtasks', null, ...day.tasks.map((t) => taskRow(ex, t, again))));
    if (day.date < t0) past.push(card); else tl.append(card);
  }
  if (past.length) view.append(h('details.donebox.planpast', null, h('summary', { text: `Vergangene Tage (${past.length})` }), h('div.plantl', null, ...past)));
  if (tl.childNodes.length) view.append(tl);
  else view.append(h('p.calm', { text: 'Alle Lerntage sind vorbei.' }));
}

// Für die Startseite: heutige Lernplan-Aufgaben aller Prüfungen
export async function todayPlan({ go, subjects, after }) {
  const t0 = todayIso();
  const exams = (await db.listExams()).filter((x) => x.plan && x.date > t0).sort((a, b) => a.date.localeCompare(b.date));
  const items = [];
  for (const ex of exams) {
    const day = ex.plan.days.find((d) => d.date === t0);
    if (day && day.tasks.length) items.push({ ex, day });
  }
  if (!items.length) return null;
  const wrap = h('div.plantoday');
  for (const { ex, day } of items) {
    const s = subjects.find((x) => x.id === ex.subjectId);
    const open = day.tasks.filter((t) => !t.done);
    wrap.append(h('div.ptbox', { style: s ? { '--c': s.color } : {} },
      h('button.pthead', { on: { click: () => go({ view: 'plan', examId: ex.id }) } },
        h('span', null, h('b', { text: `Lernplan · ${ex.kind}${s ? ' ' + s.name : ''}` }), h('small', { text: open.length ? `${PHASES[day.phase]} · ${plural(open.length, 'Aufgabe', 'Aufgaben')} offen` : 'Für heute alles erledigt' })),
        icon('right')),
      ...open.slice(0, 3).map((t) => taskRow(ex, t, after, { compact: true })),
      open.length > 3 ? h('button.txt.ptmore', { text: `+ ${open.length - 3} weitere`, on: { click: () => go({ view: 'plan', examId: ex.id }) } }) : null));
  }
  return wrap;
}
