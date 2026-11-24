// Übersicht: Bereiche auf der Startseite, Schnellzugriff, Funktions-Suche und Spiele-Kategorien.
import { h, icon, sheet } from './ui.js';
import { TABS as KIT_TABS } from './kit.js';

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Bereiche der Startseite ----------
export const AREAS = [
  ['heute', 'Heute', 'clock'],
  ['faecher', 'Fächer', 'book'],
  ['planer', 'Planer', 'grid'],
  ['werkzeuge', 'Werkzeuge', 'calc'],
  ['spiele', 'Spiele', 'game'],
];
export const homeTab = () => { const t = store.get('homeTab', 'heute'); return AREAS.some((a) => a[0] === t) ? t : 'heute'; };
export function areaBar(cur, onPick, badges = {}) {
  return h('nav.areabar', { 'aria-label': 'Bereiche' }, h('div.areaseg', null,
    ...AREAS.map(([k, l, ic]) => h('button' + (k === cur ? '.on' : ''), {
      'aria-current': k === cur ? 'page' : null,
      on: { click: () => { if (k === cur) return; store.set('homeTab', k); onPick(k); } },
    }, icon(ic), h('span', { text: l }), badges[k] ? h('em.areabadge', { text: String(badges[k]) }) : null))));
}

// ---------- Alle Funktionen (für Suche und Schnellzugriff) ----------
// a: { go, scan, note, worksheet, addSubject, backup, theme, ai, search, sphOn }
export function features(a) {
  const f = [
    { id: 'scan', area: 'Lernen', name: 'Scannen', ic: 'camera', kw: 'kamera foto buch seite einscannen', run: a.scan },
    { id: 'note', area: 'Lernen', name: 'Notiz', ic: 'pen', kw: 'schreiben pencil blatt heft', run: a.note },
    { id: 'worksheet', area: 'Lernen', name: 'Arbeitsblatt ausfüllen', ic: 'page', kw: 'scannen ausfuellen luecken', run: a.worksheet },
    { id: 'subject', area: 'Lernen', name: 'Fach anlegen', ic: 'plus', kw: 'neues fach hinzufuegen', run: a.addSubject },
    { id: 'sort', area: 'Lernen', name: 'Eingang einsortieren', ic: 'inbox', kw: 'sortieren eingang seiten', run: () => a.go({ view: 'sort' }) },
    { id: 'faecher', area: 'Lernen', name: 'Fächer', ic: 'book', kw: 'buecher hefte mappen bibliothek', run: () => a.tab('faecher') },
    { id: 'cards', area: 'Lernen', name: 'Lernkarten', ic: 'cards', kw: 'vokabeln karteikarten lernen', run: () => a.tab('heute') },
    { id: 'quiz', area: 'Lernen', name: 'Quiz allein', ic: 'cards', kw: 'ueben arbeit test fragen', run: () => import('./quiz.js').then((m) => m.quizSolo()) },
    { id: 'timetable', area: 'Planer', name: 'Stundenplan', ic: 'grid', kw: 'stunden raum zeiten vertretung', run: () => a.go({ view: 'timetable' }) },
    { id: 'exams', area: 'Planer', name: 'Arbeiten', ic: 'bookmark', kw: 'klassenarbeit praesentation test termin', run: () => a.go({ view: 'exams' }) },
    { id: 'grades', area: 'Planer', name: 'Noten', ic: 'homework', kw: 'schnitt zeugnis notenrechner', run: () => a.go({ view: 'grades' }) },
    { id: 'reminders', area: 'Planer', name: 'Erinnerungen', ic: 'clock', kw: 'wecker termin nicht vergessen', run: () => a.go({ view: 'reminders' }) },
    a.sphOn ? { id: 'messages', area: 'Planer', name: 'Nachrichten', ic: 'inbox', kw: 'schulportal post', run: () => a.go({ view: 'messages' }) } : null,
    ...KIT_TABS.map(([k, l, ic, sub]) => ({ id: 'kit-' + k, area: 'Werkzeuge', name: l, ic, kw: sub, run: () => a.go({ view: 'kit', tab: k }) })),
    { id: 'code', area: 'Werkzeuge', name: 'Programmieren', ic: 'code', kw: 'code python lua web', run: () => a.go({ view: 'code' }) },
    { id: 'games', area: 'Spiele', name: 'Alle Spiele', ic: 'game', kw: 'games spielen pause turnier', run: () => a.go({ view: 'games' }) },
    { id: 'backup', area: 'Einstellungen', name: 'Sicherung', ic: 'save', kw: 'backup speichern wiederherstellen', run: a.backup },
    { id: 'theme', area: 'Einstellungen', name: 'Darstellung', ic: 'moon', kw: 'hell dunkel dark mode', run: a.theme },
    { id: 'ai', area: 'Einstellungen', name: 'Lokale KI', ic: 'bolt', kw: 'ki lernkarten automatisch', run: a.ai },
  ].filter(Boolean);
  for (const [name, cat] of Object.entries(GAME_CAT)) {
    f.push({ id: 'game-' + name, area: 'Spiele', name, ic: CAT_IC[cat] || 'game', kw: CATS.find((c) => c[0] === cat)?.[1] || '', game: true, run: () => a.go({ view: 'games', launch: name }) });
  }
  return f;
}
export function matchFeatures(list, q) {
  const n = norm(q).trim();
  if (!n) return [];
  const words = n.split(/\s+/);
  return list.map((f) => {
    const nm = norm(f.name), all = nm + ' ' + norm(f.kw) + ' ' + norm(f.area);
    if (!words.every((w) => all.includes(w))) return null;
    return { f, score: nm.startsWith(n) ? 0 : nm.includes(n) ? 1 : 2 };
  }).filter(Boolean).sort((x, y) => x.score - y.score || (x.f.game ? 1 : 0) - (y.f.game ? 1 : 0)).map((x) => x.f);
}

// ---------- Schnellzugriff ----------
const QUICK_DEFAULT = ['scan', 'note', 'timetable', 'grades', 'kit-calc', 'games'];
export function quickRow(list, onChange) {
  const byId = new Map(list.map((f) => [f.id, f]));
  const ids = store.get('quick', QUICK_DEFAULT).filter((id) => byId.has(id));
  const grid = h('div.qgrid', { style: { '--n': String(Math.max(ids.length, 4)) } });
  for (const id of ids) {
    const f = byId.get(id);
    grid.append(h('button.qtile', { on: { click: () => f.run() } }, h('span.qic', null, icon(f.ic)), h('span.qname', { text: f.name })));
  }
  if (!ids.length) grid.append(h('p.calm', { text: 'Noch nichts angeheftet. Tippe auf „Anpassen“.' }));
  return h('section.quick', null,
    h('div.colhead', null, h('h2.section', { text: 'Schnellzugriff' }),
      h('button.txt', { on: { click: async () => { if (await quickEditor(list)) onChange(); } } }, 'Anpassen')),
    grid);
}
const QUICK_MAX = 8;
function quickEditor(list) {
  let ids = store.get('quick', QUICK_DEFAULT).filter((id) => list.some((f) => f.id === id));
  return sheet('Schnellzugriff anpassen', (body, close) => {
    const info = h('p.dlgtext');
    const wrap = h('div.qedit');
    const draw = () => {
      info.textContent = `Bis zu ${QUICK_MAX} Funktionen anheften. Ausgewählt: ${ids.length}. Die Reihenfolge folgt deinem Antippen.`;
      wrap.textContent = '';
      const groups = [...new Set(list.filter((f) => !f.game).map((f) => f.area)), 'Spiele (einzeln)'];
      for (const g of groups) {
        const items = g === 'Spiele (einzeln)' ? list.filter((f) => f.game) : list.filter((f) => f.area === g && !f.game);
        wrap.append(h('h4.qegroup', { text: g }), h('div.qechips', null, ...items.map((f) => {
          const on = ids.includes(f.id);
          return h('button.qechip' + (on ? '.on' : ''), { 'aria-pressed': on ? 'true' : 'false', on: { click: () => {
            if (on) ids = ids.filter((x) => x !== f.id);
            else if (ids.length < QUICK_MAX) ids.push(f.id);
            draw();
          } } }, icon(on ? 'check' : f.ic), h('span', { text: f.name }));
        })));
      }
    };
    draw();
    body.append(info, wrap, h('div.dlgactions', null,
      h('button.btn', { text: 'Standard', on: { click: () => { ids = [...QUICK_DEFAULT]; draw(); } } }),
      h('button.btn.primary', { text: 'Fertig', on: { click: () => { store.set('quick', ids); close(true); } } })));
  }, { wide: true });
}

// ---------- Spiele: Kategorien, Suche, zuletzt gespielt ----------
export const CATS = [
  ['alle', 'Alle'],
  ['zuletzt', 'Zuletzt'],
  ['tempo', 'Fliegen & Rennen', 'plane', 'Flieger, Rennen, Parkour'],
  ['denken', 'Denken & Brett', 'chess', 'Schach, Dame, Mühle, Rätsel'],
  ['geschick', 'Geschick', 'target', 'Zielen, stapeln, reagieren'],
  ['kampf', 'Kampf & Sport', 'sword', 'Duelle, Hockey, Fußball'],
  ['malen', 'Malen & Raten', 'pen', 'Malraten und Partyspiele'],
];
const GAME_CAT = {
  'Windflug': 'tempo', 'Papierflieger': 'tempo', 'Kritzelsprint': 'tempo', 'Papierrennen': 'tempo', 'Kritzel-Parkour': 'tempo', 'Kritzel-Kart': 'tempo', 'Schlangenduell': 'tempo', 'Leuchtspur': 'tempo',
  'Tic-Tac-Toe': 'denken', 'Schach': 'denken', 'Mauerlauf': 'denken', 'Vier in einer Reihe': 'denken', 'Kästchen erobern': 'denken', 'Dame': 'denken', 'Mühle': 'denken', 'Schiffe versenken': 'denken', 'Galgenmännchen': 'denken', 'Verdoppler': 'denken',
  'Hochstapler': 'geschick', 'Reaktionstest': 'geschick', 'Klötzchenregen': 'geschick', 'Blockknacker': 'geschick', 'Kritzelflipper': 'geschick', 'Karo-Billard': 'geschick', 'Kritzelgolf': 'geschick', 'Windbogen': 'geschick',
  'Strichkampf': 'kampf', 'Tischtennis': 'kampf', 'Lufthockey': 'kampf', 'Papierpanzer': 'kampf', 'Kritzelkick': 'kampf', 'Bombenlabyrinth': 'kampf', 'Kissenschlacht': 'kampf', 'Sternenduell': 'kampf', 'Burgwache': 'kampf', 'Radierer-Rabatz': 'kampf',
  'Quiz': 'denken', 'Malraten': 'malen', 'Stirnraten': 'malen', 'Wort-Verbot': 'malen', 'Kritzel-Würfel': 'malen', 'Kritzel-Stille-Post': 'malen',
};
const tileName = (t) => (t.querySelector('b')?.textContent || '').trim();
export const recentGames = () => store.get('gRecent', []);

// Baut die fertige Spiele-Seite um: Abschnitte gruppieren, Filterleiste, „Zuletzt gespielt“.
export function enhanceGames(view, launch) {
  // 1. Abschnitte (Überschrift + Inhalt bis zur nächsten Überschrift) in Gruppen packen
  const kids = [...view.children];
  view.textContent = '';
  let sec = null;
  const secs = [];
  for (const el of kids) {
    if (el.matches('h2.section, .gsechead')) { sec = h('div.gsec'); secs.push(sec); view.append(sec); }
    (sec || view).append(el);
  }
  const tiles = [];
  for (const s of secs) {
    const ts = [...s.querySelectorAll('.ptiles.gtiles > .ptile:not(.hubtile)')];
    if (ts.length) s.classList.add('gamesec');
    for (const t of ts) {
      const name = tileName(t);
      t.dataset.gname = name;
      t.dataset.gcat = GAME_CAT[name] || 'sonst';
      tiles.push(t);
    }
  }
  // Merken, was zuletzt gespielt wurde
  view.addEventListener('click', (e) => {
    const t = e.target.closest('.gamesec .ptile[data-gname]');
    if (!t) return;
    const sec = t.closest('.gsec')?.querySelector('h2.section')?.textContent || '';
    const key = t.dataset.gname + '|' + sec;
    store.set('gRecent', [key, ...recentGames().filter((k) => k !== key)].slice(0, 8));
  }, true);

  // 2. Filterleiste
  let cat = store.get('gCat', 'alle');
  if (!CATS.some((c) => c[0] === cat)) cat = 'alle';
  const input = h('input.field.gfind', { type: 'search', placeholder: 'Spiel suchen …', autocomplete: 'off', 'aria-label': 'Spiel suchen' });
  const chips = h('div.gcats');
  const empty = h('p.calm.gempty', { text: 'Kein Spiel passt dazu.', hidden: true });
  const recentWrap = h('div.gsec.grecent');
  const apply = () => {
    const q = norm(input.value.trim());
    const rec = recentGames();
    const filtering = !!q || cat !== 'alle';
    let shown = 0;
    for (const t of tiles) {
      const sec = t.closest('.gsec')?.querySelector('h2.section')?.textContent || '';
      const ok = (!q || norm(t.dataset.gname + ' ' + (t.querySelector('small')?.textContent || '')).includes(q))
        && (cat === 'alle' || (cat === 'zuletzt' ? rec.includes(t.dataset.gname + '|' + sec) : t.dataset.gcat === cat));
      t.hidden = !ok;
      if (ok) shown++;
    }
    for (const s of secs) {
      if (s.classList.contains('gamesec')) s.hidden = ![...s.querySelectorAll('.ptile[data-gname]')].some((t) => !t.hidden);
      else s.hidden = filtering;
    }
    recentWrap.hidden = filtering || !recentWrap.childElementCount;
    empty.hidden = shown > 0;
    for (const b of chips.children) b.classList.toggle('on', b.dataset.cat === cat);
  };
  for (const [k, l] of CATS) chips.append(h('button.gcat', { 'data-cat': k, text: l, on: { click: () => { cat = k; store.set('gCat', k); apply(); } } }));
  input.addEventListener('input', apply);

  // 3. Zuletzt gespielt (Kopien, die das Original antippen)
  const rec = recentGames().map((key) => {
    const [name, sec] = key.split('|');
    return tiles.find((t) => t.dataset.gname === name && (t.closest('.gsec')?.querySelector('h2.section')?.textContent || '') === sec);
  }).filter(Boolean).slice(0, 4);
  if (rec.length) {
    recentWrap.append(h('h2.section', { text: 'Zuletzt gespielt' }), h('div.ptiles.grecenttiles', null, ...rec.map((t) => {
      const c = h('button.ptile', { on: { click: () => t.click() } });
      for (const k of t.childNodes) c.append(k.cloneNode(true));
      const where = (t.closest('.gsec')?.querySelector('h2.section')?.textContent || '').replace(/\s*\(.*\)$/, '');
      const sm = c.querySelector('small'); if (sm) sm.textContent = where;
      return c;
    })));
  }
  view.prepend(h('div.gfilter', null, input, chips), empty, recentWrap);
  apply();

  // 4. Direkt starten (aus Suche oder Schnellzugriff)
  if (launch) {
    const [ln, ls] = launch.split('|');
    const secOf = (x) => x.closest('.gsec')?.querySelector('h2.section')?.textContent;
    const t = tiles.find((x) => x.dataset.gname === ln && secOf(x) === (ls || 'Allein spielen'))
      || tiles.find((x) => x.dataset.gname === ln);
    if (t) setTimeout(() => t.click(), 30);
  }
}

// Für die Startseite: Kategorien und zuletzt gespielte Spiele
export function gameHome(go) {
  const counts = {};
  for (const c of Object.values(GAME_CAT)) counts[c] = (counts[c] || 0) + 1;
  const out = [];
  const rec = recentGames().slice(0, 4);
  if (rec.length) out.push(h('h2.section', { text: 'Zuletzt gespielt' }), h('div.ptiles', null, ...rec.map((key) => {
    const [name, sec] = key.split('|');
    return h('button.ptile', { on: { click: () => go({ view: 'games', launch: key }) } },
      h('span.ptileic', null, icon(CAT_IC[GAME_CAT[name]] || 'game')), h('b', { text: name }), h('small', { text: (sec || '').replace(/\s*\(.*\)$/, '') }));
  })));
  out.push(h('h2.section', { text: 'Kategorien' }), h('div.ptiles', null, ...CATS.filter((c) => c[2]).map(([k, l, ic, sub]) =>
    h('button.ptile', { on: { click: () => { store.set('gCat', k); go({ view: 'games' }); } } },
      h('span.ptileic', null, icon(ic)), h('b', { text: l }), h('small', { text: `${counts[k] || 0} Spiele · ${sub}` })))));
  return out;
}
const CAT_IC = Object.fromEntries(CATS.filter((c) => c[2]).map((c) => [c[0], c[2]]));
