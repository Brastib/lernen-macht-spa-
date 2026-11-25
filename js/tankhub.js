// Papierpanzer-Bereich: Spiel einrichten (Modus, Karte, Wetter, Spieler, Optionen), Liga mit Tabelle und Rangverlauf,
// Garage mit Upgrades (Schrauben aus Liga-Siegen oder Lern-Coins), Rangliste und Waffenbuch.
import { h, icon, toast, confirmSheet, menu } from './ui.js';
import { isDark, inkOf, rng } from './sketch.js';
import { battle, paintTank, glyph } from './tanks.js';
import { editMap } from './tankedit.js';
import { recordDuel, recordCpu, recordScore } from './profiles.js';
import { WEAPONS, EXTRAS, MAPS, MAP, MODES, MODE, WEATHER, OPTS, UPGRADES, UPCOST, BODIES, PATTERNS, COIN_PER_BOLT, garage, saveGarage, ladder, recordLadder, clearLadder, LIGA_PTS, liga, saveLiga, BOT_NAMES, COLORS, store, findMap, loadMyMaps, saveMyMaps, myMapObj } from './tankdata.js';

const TEAM_NAMES = ['Blau', 'Rot', 'Grün', 'Gelb'];
const TEAM_COL = ['#4f7cff', '#ff6b5a', '#2fbf71', '#f2b632'];
const LIGA_MODES = ['ffa', 'points', 'hill', 'lotto', 'bounty', 'crates', 'glass', 'ink'];
const defOpts = () => Object.fromEntries(OPTS.map((o) => [o.id, o.def]));

export function tankHub(openFx, players, me) {
  const fx = openFx('Papierpanzer', 'Modi, Liga, Garage');
  fx.root.classList.add('tkfx');
  const ps = players.length ? players : [me];
  let lob = store.get('tkLobby', null);
  if (!lob || !Array.isArray(lob.roster)) lob = { mode: 'ffa', map: 'random', weather: 'map', opts: defOpts(), roster: [{ id: ps[0].id, name: ps[0].name, color: ps[0].color, cpu: 0, team: 0 }, { name: 'Computer', color: '#8a8f98', cpu: 2, team: 1 }] };
  lob.opts = { ...defOpts(), ...lob.opts };
  if (!MODE[lob.mode]) lob.mode = 'ffa';
  // Namen und Farben aus den Spielerprofilen übernehmen (falls umbenannt), gelöschte Profile rausnehmen
  lob.roster = lob.roster.filter((r) => { if (r.cpu || !r.id) return true; const p = ps.find((q) => q.id === r.id); if (!p) return false; r.name = p.name; r.color = p.color; return true; });
  if (!lob.roster.length) lob.roster = [{ id: ps[0].id, name: ps[0].name, color: ps[0].color, cpu: 0, team: 0 }];
  const saveLob = () => store.set('tkLobby', lob);
  let tab = store.get('tkHubTab', 'play');

  function render() {
    fx.stage.replaceChildren();
    const tabs = h('div.gseg.tktabs');
    const T = [['play', 'Spielen'], ['liga', 'Liga'], ['garage', 'Garage'], ['ladder', 'Rangliste'], ['arms', 'Waffen']];
    tabs.append(...T.map(([k, l]) => h('button' + (k === tab ? '.on' : ''), { text: l, on: { click: () => { tab = k; store.set('tkHubTab', k); render(); } } })));
    const body = h('div.tkhubbody');
    const hub = h('div.tkhub', null, h('div.tkhubin', null, tabs, body));
    fx.stage.append(hub);
    ({ play: playTab, liga: ligaTab, garage: garageTab, ladder: ladderTab, arms: armsTab })[tab](body);
  }

  // ---------- Spielen ----------
  // Spiel einrichten Schritt für Schritt: Spieler → Spielart → Modus → Karte → Wetter → Regeln → Start
  const STEPS = [['players', 'Spieler'], ['kind', 'Spielart'], ['mode', 'Modus'], ['map', 'Karte'], ['weather', 'Wetter'], ['rules', 'Regeln'], ['start', 'Start']];
  let step = store.get('tkStep', 0);
  function go(d, abs) { step = Math.max(0, Math.min(STEPS.length - 1, abs != null ? abs : step + d)); store.set('tkStep', step); render(); fx.stage.scrollTop = 0; }
  const mapName = () => (lob.map === 'random' || !findMap(lob.map) ? 'Zufallskarte' : findMap(lob.map).name);
  const kindName = () => (lob.ranked === false ? 'Freundschaftsspiel' : 'Rangspiel');
  function playTab(body) {
    const mode = MODE[lob.mode] || MODE.ffa;
    const solo = mode.kind === 'solo';
    const problem = rosterProblem(mode);
    body.append(h('div.tksteps', null, ...STEPS.map(([id, name], k) => h('button.tkstep' + (k === step ? '.on' : k < step ? '.done' : ''), { on: { click: () => go(0, k) } }, h('i', { text: String(k + 1) }), h('span', { text: name })))));
    const id = STEPS[step][0];
    const head = (t, d) => body.append(h('div.tkstephead', null, h('h2', { text: t }), d ? h('p', { text: d }) : null));
    if (id === 'players') {
      head('Wer spielt mit?', 'Spieler aus den Profilen und Computer-Gegner. Bis zu 8 Panzer.');
    // Spieler
    body.append(h('h3.tksec', { text: solo ? 'Spieler (Zielscheiben spielt man allein)' : `Spieler (${lob.roster.length} von 8)` }));
    const list = h('div.tkroster');
    lob.roster.forEach((r, k) => {
      const typeBtn = h('button.tkrtype', { on: { click: (e) => menu(e.currentTarget, [
        { label: 'Mensch', icon: 'game', onClick: () => { r.cpu = 0; saveLob(); render(); } },
        ...[1, 2, 3, 4].map((lv) => ({ label: `Computer: ${['', 'Leicht', 'Mittel', 'Schwer', 'Profi'][lv]}`, icon: 'bolt', onClick: () => { r.cpu = lv; saveLob(); render(); } })),
      ]) } }, h('span', { text: r.cpu ? `Computer · ${['', 'Leicht', 'Mittel', 'Schwer', 'Profi'][r.cpu]}` : 'Mensch' }), icon('chev-down'));
      const g = garage(r.name);
      list.append(h('div.tkrrow', null,
        h('span.gdot', { style: { background: r.color } }), h('b.tkrname', { text: r.name }),
        !r.cpu && Object.values(g.up).some(Boolean) ? h('span.tkuptag', { title: 'Hat Upgrades aus der Garage' }, icon('arup'), h('span', { text: String(Object.values(g.up).reduce((a, b) => a + b, 0)) })) : null,
        solo ? null : typeBtn,
        lob.roster.length > (solo ? 1 : 2) || (mode.coop && lob.roster.length > 1) ? h('button.icbtn.tkrdel', { 'aria-label': `${r.name} entfernen`, on: { click: () => { lob.roster.splice(k, 1); saveLob(); render(); } } }, icon('close')) : null));
    });
    if (mode.coop) list.append(h('div.tkrrow.boss', null, h('span.gdot', { style: { background: '#e0a106' } }), h('b.tkrname', { text: 'Riesenpanzer' }), h('span.tkrnote', { text: 'Computer, viel Leben, doppelte Munition' })));
    body.append(list);
    if (!solo && lob.roster.length < (mode.coop ? 7 : 8)) {
      const free = ps.filter((p) => !lob.roster.some((r) => r.name.toLowerCase() === p.name.toLowerCase()));
      body.append(h('div.tkaddrow', null,
        h('button.btn', { disabled: !free.length, on: { click: (e) => menu(e.currentTarget, free.map((p) => ({ label: p.name, icon: 'game', onClick: () => { lob.roster.push({ id: p.id, name: p.name, color: p.color, cpu: 0, team: nextTeam() }); saveLob(); render(); } }))) } }, icon('plus'), h('span', { text: free.length ? 'Spieler dazu' : 'Alle Spieler sind drin' })),
        h('button.btn', { on: { click: () => { const used = lob.roster.map((r) => r.name); const nm = BOT_NAMES.find((n) => !used.includes(n)) || `Bot ${lob.roster.length}`; const col = COLORS.find((c) => !lob.roster.some((r) => r.color === c)) || '#8a8f98'; lob.roster.push({ name: nm, color: col, cpu: lob.opts.cpu || 2, team: nextTeam() }); saveLob(); render(); } } }, icon('plus'), h('span', { text: 'Computer dazu' }))));
    }
    } else if (id === 'kind') {
      head('Was für ein Spiel?', 'Ein Rangspiel zählt für die Rangliste und die Spieler-Statistik.');
      const card = (on, ic, t, d, fn) => h('button.tkmode.tkkind' + (on ? '.on' : ''), { on: { click: fn } }, h('span.tkmodeic', null, icon(ic)), h('span.tkmodetx', null, h('b', { text: t }), h('small', { text: d })));
      body.append(h('div.tkmodes', null,
        card(lob.ranked !== false, 'trophy', 'Rangspiel', 'Zählt für Rangliste und Statistik', () => { lob.ranked = true; saveLob(); go(+1); }),
        card(lob.ranked === false, 'heart', 'Freundschaftsspiel', 'Nur zum Spaß, zählt nicht', () => { lob.ranked = false; saveLob(); go(+1); }),
        card(false, 'list', 'Liga starten', 'Mehrere Spieltage mit Tabelle, Auf- und Abstieg, Schrauben für die Garage', () => { tab = 'liga'; store.set('tkHubTab', 'liga'); render(); })));
    } else if (id === 'mode') {
      head('Welcher Modus?', null);
    // Modi
    body.append(h('div.tkmodes', null, ...MODES.map((m) => h('button.tkmode' + (m.id === lob.mode ? '.on' : ''), { on: { click: () => { lob.mode = m.id; fixRoster(); saveLob(); go(+1); } } },
      h('span.tkmodeic', null, icon(m.ic)), h('span.tkmodetx', null, h('b', { text: m.name }), h('small', { text: m.d })), m.own ? h('em.tknew', { text: 'Neu' }) : null))));
    } else if (id === 'map') {
      head('Welche Karte?', 'Fertige Karten oder eine eigene malen.');
    // Karten
    body.append(h('h3.tksec', { text: 'Fertige Karten' }), h('div.tkmaps', null,
      mapCard({ id: 'random', name: 'Zufall', d: 'Jedes Mal eine andere Karte' }),
      ...MAPS.map(mapCard)));
    // Eigene Karten
    const mine = loadMyMaps();
    body.append(h('h3.tksec', { text: mine.length ? `Eigene Karten (${mine.length})` : 'Eigene Karten' }), h('div.tkmaps', null,
      h('button.tkmap.tknewmap', { on: { click: () => openEditor(null) } }, h('span.tknewmapic', null, icon('pen')), h('b', { text: 'Neue Karte malen' }), h('small', { text: 'Mit Stift oder Finger' })),
      ...mine.map((dm) => mapCard(myMapObj(dm)))));
    const sel = mine.find((dm) => dm.id === lob.map);
    if (sel) body.append(h('div.tkmymapbar', null, h('span', { text: `„${sel.name}“` }),
      h('button.tkoptreset', { on: { click: () => openEditor(sel) } }, icon('pen'), h('span', { text: 'Bearbeiten' })),
      h('button.tkoptreset', { on: { click: async () => { if (await confirmSheet('Karte löschen?', `„${sel.name}“ wird gelöscht.`, 'Löschen')) { saveMyMaps(loadMyMaps().filter((q) => q.id !== sel.id)); lob.map = 'random'; saveLob(); render(); } } } }, icon('trash'), h('span', { text: 'Löschen' }))));
    } else if (id === 'weather') {
      head('Welches Wetter?', 'Bei Regen sammelt sich Wasser in Mulden, Schnee bleibt liegen.');
    // Wetter
    body.append(h('div.tkchips', null, ...WEATHER.map((w) => h('button.tkchip' + (w.id === lob.weather ? '.on' : ''), { title: w.d, on: { click: () => { lob.weather = w.id; saveLob(); go(+1); } } }, h('b', { text: w.name }), h('small', { text: w.d })))));
    } else if (id === 'rules') {
      head('Regeln', 'Alles hat gute Standardwerte. Ändern ist freiwillig.');
      if (mode.teams) {
        body.append(h('h3.tksec', { text: 'Teams' }));
        body.append(h('div.tkroster', null, ...lob.roster.map((r) => h('div.tkrrow', null, h('span.gdot', { style: { background: r.color } }), h('b.tkrname', { text: r.name }),
          h('div.tkteams', null, ...TEAM_NAMES.map((tn, ti) => h('button' + ((r.team ?? 0) === ti ? '.on' : ''), { style: { '--tc': TEAM_COL[ti] }, 'aria-label': `Team ${tn}`, title: `Team ${tn}`, on: { click: () => { r.team = ti; saveLob(); render(); } } }, h('i'), h('span', { text: tn }))))))));
        body.append(h('h3.tksec', { text: 'Optionen' }));
      }
    // Optionen
    const opt = h('div.tkopts');
    OPTS.forEach((o) => {
      if (o.id === 'rounds' && mode.kind !== 'score') return;
      if (o.id === 'ff' && !mode.teams && !mode.coop) return;
      if (o.id === 'cpu') return;
      opt.append(h('div.tkoptrow', null, h('span.tkoptlab', { text: o.name }), h('div.tkoptvals', null, ...o.vals.map(([v, l]) => h('button' + (lob.opts[o.id] === v ? '.on' : ''), { text: l, on: { click: () => { lob.opts[o.id] = v; saveLob(); render(); } } })))));
    });
    body.append(opt, h('button.tkoptreset', { text: 'Optionen zurücksetzen', on: { click: () => { lob.opts = defOpts(); saveLob(); render(); } } }));
    } else {
      head('Alles bereit?', 'Tipp auf eine Zeile, um sie zu ändern.');
      const row = (k, lab, val) => h('button.tksumrow', { on: { click: () => go(0, k) } }, h('small', { text: lab }), h('b', { text: val }), icon('right'));
      body.append(h('div.tksum', null,
        row(0, 'Spieler', lob.roster.map((r) => r.name).join(', ') + (mode.coop ? ' + Riesenpanzer' : '')),
        row(1, 'Spielart', kindName()),
        row(2, 'Modus', mode.name),
        row(3, 'Karte', mapName()),
        row(4, 'Wetter', WEATHER.find((w) => w.id === lob.weather).name),
        row(5, 'Regeln', OPTS.filter((o) => o.id !== 'cpu' && lob.opts[o.id] !== o.def).length ? `${OPTS.filter((o) => o.id !== 'cpu' && lob.opts[o.id] !== o.def).length} geändert` : 'Standard')));
    }
    // Leiste unten
    const last = step === STEPS.length - 1;
    body.append(h('div.tkstartbar', null,
      step > 0 ? h('button.btn.tkback', { on: { click: () => go(-1) } }, icon('left'), h('span', { text: 'Zurück' })) : null,
      problem ? h('small.tkwarn', { text: problem }) : h('small', { text: `${kindName()} · ${mode.name} · ${mapName()} · ${WEATHER.find((w) => w.id === lob.weather).name}` }),
      last ? null : h('button.btn.tknext', { on: { click: () => go(+1) } }, h('span', { text: 'Weiter' }), icon('right')),
      h('button.btn.primary.tkgo', { disabled: !!problem, on: { click: () => startMatch() } }, icon('play'), h('span', { text: last ? 'Los geht’s' : 'Start' }))));
  }
  function nextTeam() { const m = MODE[lob.mode]; if (!m.teams) return 0; const c = [0, 0]; lob.roster.forEach((r) => { if (r.team < 2) c[r.team || 0]++; }); return c[0] <= c[1] ? 0 : 1; }
  function fixRoster() {
    const m = MODE[lob.mode];
    if (m.kind === 'solo') { const hmn = lob.roster.find((r) => !r.cpu) || { name: ps[0].name, color: ps[0].color, cpu: 0 }; lob.roster = [{ ...hmn, cpu: 0 }]; }
    else if (lob.roster.length < 2 && !m.coop) lob.roster.push({ name: 'Computer', color: '#8a8f98', cpu: 2, team: 1 });
    if (m.teams) lob.roster.forEach((r, k) => { if (r.team == null || r.team > 3) r.team = k % 2; });
  }
  function rosterProblem(m) {
    if (m.kind === 'solo') return lob.roster.length === 1 && !lob.roster[0].cpu ? '' : 'Zielscheiben spielt man allein.';
    if (m.coop) return lob.roster.length >= 1 && lob.roster.some((r) => !r.cpu) ? '' : 'Mindestens ein Mensch muss mitspielen.';
    if (lob.roster.length < 2) return 'Mindestens zwei Panzer.';
    if (m.teams && new Set(lob.roster.map((r) => r.team || 0)).size < 2) return 'Verteil die Spieler auf mindestens zwei Teams.';
    if (!lob.roster.some((r) => !r.cpu)) return '';
    return '';
  }
  function mapCard(m) {
    const cv = h('canvas.tkmapcv', { width: 240, height: 120 });
    drawMapPreview(cv, m);
    return h('button.tkmap' + (m.id === lob.map ? '.on' : ''), { on: { click: () => { lob.map = m.id; saveLob(); render(); } } }, cv, h('b', { text: m.name }), h('small', { text: m.d }));
  }
  async function openEditor(dm) {
    const scroll = fx.stage.scrollTop;
    const id = await editMap(fx, dm);
    if (fx.signal.aborted) return;
    if (id) { lob.map = id; saveLob(); }
    render(); if (!id) fx.stage.scrollTop = scroll;
  }
  function buildCfg(mode, mapId, weather, roster, opts) {
    const players = roster.map((r) => ({ name: r.name, color: r.color, cpu: r.cpu || 0, team: r.team ?? 0 }));
    if (mode.coop) players.push({ name: 'Riesenpanzer', color: '#e0a106', cpu: Math.min(4, (opts.cpu || 2) + 1), boss: true, team: 1 });
    return { players, mode: mode.id, map: mapId, weather, opts };
  }
  async function startMatch() {
    const mode = MODE[lob.mode];
    for (;;) {
      fx.stage.replaceChildren();
      const res = await battle(fx, buildCfg(mode, lob.map, lob.weather, lob.roster, lob.opts));
      if (!res || fx.signal.aborted) return;
      if (res.solo) { const old = store.get('tkTargetBest', 0), rec = res.solo.all && (!old || res.solo.shots < old); if (rec) store.set('tkTargetBest', res.solo.shots); res.rec = rec; res.old = old; if (res.solo.all) try { recordScore('tanksTargets', lob.roster[0], res.solo.shots, true); } catch (e) { /* egal */ } }
      else if (lob.ranked !== false) { recordLadder(res.ranking); recordProfiles(res); }
      const next = await resultCard(res, mode);
      if (next !== 'again') { render(); return; }
    }
  }
  // Ergebnis auch in den Spielerprofilen zählen (nur bei genau zwei Panzern, wie bei Duellen)
  function recordProfiles(res) {
    if (lob.roster.length !== 2 || MODE[lob.mode].coop) return;
    const [A, B] = lob.roster, w = res.winner;
    try {
      if (!A.cpu && !B.cpu) recordDuel('tanks', A, B, { w });
      else if (!A.cpu) recordCpu('tanks', A, { w }, false);
      else if (!B.cpu) recordCpu('tanks', B, { w }, true);
    } catch (e) { /* Profile sind optional */ }
  }
  function resultCard(res, mode, extra) {
    return new Promise((resolve) => {
      const tm = mode.teams || mode.coop;
      const w0 = res.ranking[0];
      let title, sub = '';
      if (res.solo) { title = res.solo.all ? `${res.solo.shots} Schüsse` : `${res.solo.hit} von 7 Scheiben`; sub = res.solo.all ? (res.rec ? (res.old ? `Neuer Rekord! Vorher ${res.old}.` : 'Dein erster Rekord.') : `Rekord: ${res.old} Schüsse`) : 'Nicht alle getroffen. Nochmal?'; }
      else if (w0.tie) title = 'Unentschieden';
      else if (mode.coop) title = w0.team === 0 ? 'Das Team gewinnt!' : 'Der Riesenpanzer gewinnt!';
      else if (tm) title = `Team ${TEAM_NAMES[w0.team] || w0.team + 1} gewinnt!`;
      else title = `${w0.name} gewinnt!`;
      const card = h('div.grescard.tkres', null,
        h('span.gresic', { style: { color: res.solo ? '#e0a106' : w0.color } }, icon(res.solo ? 'target' : 'trophy')),
        h('b', { text: title }), sub ? h('small', { text: sub }) : null);
      if (!res.solo) {
        const sc = mode.kind === 'score';
        card.append(h('div.tkrestab', null,
          h('div.tkresrow.head', null, h('span', { text: 'Platz' }), h('span', { text: 'Spieler' }), h('span', { text: sc ? 'Punkte' : 'Leben' }), h('span', { text: 'Abschüsse' }), h('span', { text: 'Schaden' })),
          ...res.ranking.map((r) => h('div.tkresrow', null, h('span.tkplace', { text: `${r.place}.` }), h('span.tkresname', null, h('span.gdot', { style: { background: r.color } }), h('b', { text: r.name }), tm ? h('small', { text: mode.coop ? (r.team ? 'Boss' : 'Team') : TEAM_NAMES[r.team] }) : null), h('span', { text: String(sc ? r.score : r.hp) }), h('span', { text: String(r.kills) }), h('span', { text: String(r.dmg) })))));
      }
      if (extra) card.append(extra);
      card.append(h('div.gresbtns', null,
        h('button.btn', { text: extra ? 'Zur Tabelle' : 'Zum Menü', on: { click: () => resolve('done') } }),
        extra ? null : h('button.btn.primary', { text: 'Nochmal', on: { click: () => resolve('again') } })));
      fx.stage.querySelectorAll('.gres').forEach((el) => el.remove());
      fx.stage.append(h('div.gres.tkresbg', null, card));
    });
  }

  // ---------- Liga ----------
  function ligaTab(body) {
    const L = liga();
    if (!L) return ligaSetup(body);
    const done = L.day >= L.days;
    const rows = ligaTable(L);
    body.append(h('div.tkligahead', null,
      h('div', null, h('b', { text: done ? 'Liga beendet' : `Spieltag ${L.day + 1} von ${L.days}` }), h('small', { text: done ? `Meister: ${rows[0].name}` : nextDayText(L) })),
      done ? h('button.btn.primary', { text: 'Neue Liga', on: { click: () => { saveLiga(null); render(); } } })
        : h('button.btn.primary.tkgo', { on: { click: () => playDay(L) } }, icon('play'), h('span', { text: `Spieltag ${L.day + 1} spielen` }))));
    if (done) body.append(h('div.tkchamp', null, h('span.tkchampic', null, icon('trophy')), h('div', null, h('b', { text: `${rows[0].name} ist Liga-Meister!` }), h('small', { text: L.rewardText || '' }))));
    body.append(h('h3.tksec', { text: 'Tabelle' }), tableEl(rows, L));
    if (L.hist.length) body.append(h('h3.tksec', { text: 'Rangverlauf' }), chartEl(L));
    if (L.log.length) body.append(h('h3.tksec', { text: 'Spieltage' }), h('div.tklog', null, ...L.log.slice().reverse().map((d, k) => h('div.tklogrow', null, h('b', { text: `${L.log.length - k}.` }), h('span', { text: `${MODE[d.mode].name} · ${findMap(d.map) ? findMap(d.map).name : d.map}` }), h('span.tklogwin', null, h('span.gdot', { style: { background: d.winColor } }), h('span', { text: d.winner }))))));
    body.append(h('button.tkoptreset', { text: done ? 'Liga löschen' : 'Liga abbrechen', on: { click: async () => { if (await confirmSheet(done ? 'Liga löschen?' : 'Liga abbrechen?', 'Tabelle und Rangverlauf dieser Liga werden gelöscht. Schrauben gibt es nur am Ende einer Liga.', 'Abbrechen')) { saveLiga(null); render(); } } } }));
  }
  const nextDayText = (L) => { const d = L.plan[L.day]; return `Nächster: ${MODE[d.mode].name} auf ${(findMap(d.map) || { name: 'Zufall' }).name}`; };
  function ligaSetup(body) {
    const st = store.get('tkLigaSetup', { pick: ps.slice(0, 2).map((p) => p.name), bots: ps.length < 2 ? 3 : 2, days: 6, mix: 'mix', cpu: 2 });
    const save = () => store.set('tkLigaSetup', st);
    body.append(h('div.ghero.tkligahero', null, h('span.gheroic', null, icon('trophy')),
      h('div.gherotx', null, h('b', { text: 'Panzer-Liga' }), h('small', { text: `Alle spielen an jedem Spieltag gegeneinander. Punkte nach Platz (${LIGA_PTS.slice(0, 4).join(', ')} …) plus 1 pro Abschuss. Am Ende gibt es Schrauben für die Garage: Platz 1 bekommt 3, Platz 2 bekommt 2, Platz 3 bekommt 1.` }))));
    body.append(h('h3.tksec', { text: 'Wer spielt mit?' }), h('div.tkchips', null, ...ps.map((p) => h('button.tkchip' + (st.pick.includes(p.name) ? '.on' : ''), { on: { click: () => { st.pick = st.pick.includes(p.name) ? st.pick.filter((n) => n !== p.name) : [...st.pick, p.name]; save(); render(); } } }, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name })))));
    const total = st.pick.length + st.bots;
    const row = (lab, vals, cur, set) => h('div.tkoptrow', null, h('span.tkoptlab', { text: lab }), h('div.tkoptvals', null, ...vals.map(([v, l]) => h('button' + (cur === v ? '.on' : ''), { text: l, on: { click: () => { set(v); save(); render(); } } }))));
    body.append(h('div.tkopts', null,
      row('Computer-Gegner', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), st.bots, (v) => { st.bots = v; }),
      row('Computer-Stärke', [[1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer'], [4, 'Profi']], st.cpu, (v) => { st.cpu = v; }),
      row('Spieltage', [[4, '4'], [6, '6'], [8, '8'], [10, '10']], st.days, (v) => { st.days = v; }),
      row('Modi', [['mix', 'Gemischt'], ['ffa', 'Jeder gegen jeden'], ['points', 'Punktejagd']], st.mix, (v) => { st.mix = v; })));
    const bad = total < 2 ? 'Mindestens zwei Teilnehmer.' : total > 8 ? 'Höchstens 8 Teilnehmer.' : '';
    body.append(h('div.tkstartbar', null, h('small' + (bad ? '.tkwarn' : ''), { text: bad || `${total} Teilnehmer, ${st.days} Spieltage` }),
      h('button.btn.primary.tkgo', { disabled: !!bad, on: { click: () => {
        const used = [];
        const parts = [...st.pick.map((n) => { const p = ps.find((q) => q.name === n); return { name: p.name, color: p.color, cpu: 0 }; })];
        for (let k = 0; k < st.bots; k++) { const nm = BOT_NAMES.find((n) => !used.includes(n) && !parts.some((p) => p.name === n)); used.push(nm); parts.push({ name: nm, color: COLORS.find((c) => !parts.some((p) => p.color === c)) || '#8a8f98', cpu: st.cpu }); }
        const plan = Array.from({ length: st.days }, (_, k) => ({ mode: st.mix === 'mix' ? LIGA_MODES[k % LIGA_MODES.length] : st.mix, map: MAPS[(Math.random() * MAPS.length) | 0].id }));
        if (st.mix === 'mix') plan.sort(() => Math.random() - 0.5);
        saveLiga({ parts: parts.map((p) => ({ ...p, pts: 0, wins: 0, kills: 0, dmg: 0, played: 0 })), days: st.days, day: 0, plan, hist: [], log: [] });
        render();
      } } }, icon('play'), h('span', { text: 'Liga starten' }))));
  }
  function ligaTable(L) {
    return L.parts.map((p, i) => ({ ...p, i })).sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.kills - a.kills || b.dmg - a.dmg);
  }
  function tableEl(rows, L) {
    const prev = L.hist.length > 1 ? L.hist[L.hist.length - 2] : null;
    return h('div.tktable', null,
      h('div.tktrow.head', null, h('span', { text: '#' }), h('span'), h('span', { text: 'Spieler' }), h('span', { text: 'Sp' }), h('span', { text: 'Siege' }), h('span', { text: 'Absch.' }), h('span', { text: 'Punkte' })),
      ...rows.map((r, k) => {
        const was = prev ? prev[r.i] : null, mv = was ? was - (k + 1) : 0;
        return h('div.tktrow' + (k === 0 && L.hist.length ? '.lead' : ''), null,
          h('span.tkrank', { text: String(k + 1) }),
          h('span.tkmove' + (mv > 0 ? '.up' : mv < 0 ? '.down' : ''), { title: mv > 0 ? `${mv} Plätze gestiegen` : mv < 0 ? `${-mv} Plätze gefallen` : 'gleich geblieben', text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–' }),
          h('span.tkresname', null, h('span.gdot', { style: { background: r.color } }), h('b', { text: r.name }), r.cpu ? h('small', { text: 'CPU' }) : null),
          h('span', { text: String(r.played) }), h('span', { text: String(r.wins) }), h('span', { text: String(r.kills) }), h('b.tkpts', { text: String(r.pts) }));
      }));
  }
  function chartEl(L) {
    const n = L.parts.length, days = L.hist.length, W2 = 640, H2 = 40 + n * 34, padL = 34, padR = 130, padT = 20;
    const X = (d) => padL + (days <= 1 ? 0 : d / (days - 1) * (W2 - padL - padR)), Y = (r) => padT + (r - 1) * ((H2 - padT - 24) / Math.max(1, n - 1));
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W2} ${H2}`); svg.setAttribute('class', 'tkchart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Rangverlauf der Liga');
    const el = (tag, at, txt) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; svg.append(e); return e; };
    for (let r = 1; r <= n; r++) { el('line', { x1: padL, x2: W2 - padR + 10, y1: Y(r), y2: Y(r), class: 'tkgrid' }); el('text', { x: padL - 10, y: Y(r) + 4, 'text-anchor': 'end', class: 'tkax' }, `${r}.`); }
    for (let d = 0; d < days; d++) el('text', { x: X(d), y: H2 - 4, 'text-anchor': 'middle', class: 'tkax' }, `T${d + 1}`);
    L.parts.forEach((p, i) => {
      const pts = L.hist.map((hh, d) => `${X(d)},${Y(hh[i])}`).join(' ');
      if (days > 1) el('polyline', { points: pts, fill: 'none', stroke: p.color, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      L.hist.forEach((hh, d) => el('circle', { cx: X(d), cy: Y(hh[i]), r: 5, fill: p.color, class: 'tkdot' }));
      const lastR = L.hist[days - 1][i];
      el('text', { x: X(days - 1) + 12, y: Y(lastR) + 4, class: 'tklabel', fill: p.color }, p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name);
    });
    return h('div.tkchartwrap', null, svg);
  }
  async function playDay(L) {
    const d = L.plan[L.day], mode = MODE[d.mode];
    const roster = L.parts.map((p) => ({ name: p.name, color: p.color, cpu: p.cpu, team: 0 }));
    fx.stage.replaceChildren();
    const res = await battle(fx, buildCfg(mode, d.map, 'map', roster, { ...defOpts(), ups: 1, rounds: 6 }));
    if (!res || fx.signal.aborted) { if (!fx.signal.aborted) render(); return; }
    const before = ligaTable(L).map((r) => r.i);
    res.ranking.forEach((r) => {
      const p = L.parts[r.i];
      const add = (LIGA_PTS[r.place - 1] ?? 1) + r.kills;
      p.pts += add; p.kills += r.kills; p.dmg += r.dmg; p.played++; if (r.place === 1) p.wins++;
      r.add = add;
    });
    recordLadder(res.ranking);
    const order = ligaTable(L); const ranks = []; order.forEach((r, k) => { ranks[r.i] = k + 1; });
    L.hist.push(ranks);
    L.log.push({ mode: d.mode, map: d.map, winner: res.ranking[0].name, winColor: res.ranking[0].color });
    L.day++;
    let rewardText = '';
    if (L.day >= L.days) {
      const gifts = [3, 2, 1];
      const txt = [];
      order.slice(0, 3).forEach((r, k) => { if (!r.cpu) { const g = garage(r.name); g.bolts += gifts[k]; if (!k) g.cups = (g.cups || 0) + 1; saveGarage(r.name, g); txt.push(`${r.name} +${gifts[k]}`); } });
      rewardText = txt.length ? `Schrauben für die Garage: ${txt.join(', ')}` : 'Ein Computer hat gewonnen, darum gibt es diesmal keine Schrauben.';
      L.rewardText = rewardText;
    }
    saveLiga(L);
    const moves = h('div.tkmoves', null, ...order.map((r, k) => { const was = before.indexOf(r.i) + 1, mv = was - (k + 1); const rr = res.ranking.find((q) => q.i === r.i); return h('div.tkmoverow', null, h('span.tkrank', { text: `${k + 1}.` }), h('span.tkmove' + (mv > 0 ? '.up' : mv < 0 ? '.down' : ''), { text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–' }), h('span.tkresname', null, h('span.gdot', { style: { background: r.color } }), h('b', { text: r.name })), h('em', { text: `+${rr.add}` }), h('b.tkpts', { text: String(r.pts) })); }));
    const extra = h('div.tkresextra', null, h('small', { text: L.day >= L.days ? rewardText : 'Neue Tabelle' }), moves);
    await resultCard(res, mode, extra);
    tab = 'liga'; render();
  }

  // ---------- Garage ----------
  function garageTab(body) {
    let who = store.get('tkGarageWho', ps[0].name);
    if (!ps.some((p) => p.name === who)) who = ps[0].name;
    const p = ps.find((q) => q.name === who);
    const g = garage(who);
    body.append(h('div.tkchips.tkwho', null, ...ps.map((q) => h('button.tkchip' + (q.name === who ? '.on' : ''), { on: { click: () => { store.set('tkGarageWho', q.name); render(); } } }, h('span.gdot', { style: { background: q.color } }), h('b', { text: q.name })))));
    const cv = h('canvas.tkgaragecv', { width: 560, height: 300 });
    const coinEl = h('b', { text: '…' });
    const buyBtn = h('button.btn', { disabled: true, on: { click: async () => { const { addCoins, getCoins } = await import('./cards.js'); if ((await getCoins()) < COIN_PER_BOLT) { toast('Nicht genug Coins'); return; } await addCoins(-COIN_PER_BOLT); g.bolts++; saveGarage(who, g); toast('1 Schraube gekauft'); render(); } } }, h('span', { text: `1 Schraube für ${COIN_PER_BOLT} Coins` }));
    import('./cards.js').then(async (m) => { const c = await m.getCoins(); coinEl.textContent = String(c); buyBtn.disabled = c < COIN_PER_BOLT; }).catch(() => { coinEl.textContent = '0'; });
    body.append(h('div.tkgaragetop', null,
      h('div.tkgaragepv', null, cv),
      h('div.tkwallet', null,
        h('div.tkbolts', null, boltIcon(), h('div', null, h('b', { text: String(g.bolts) }), h('small', { text: g.bolts === 1 ? 'Schraube' : 'Schrauben' }))),
        h('div.tkbolts.cups', null, h('span.tkcupic', null, icon('trophy')), h('div', null, h('b', { text: String(g.cups || 0) }), h('small', { text: 'Liga-Titel' }))),
        h('p.tkhint', { text: 'Schrauben gibt es für die ersten drei Plätze am Ende einer Liga. Oder du tauschst Lern-Coins ein (die bekommst du beim Lernkarten-Lernen).' }),
        h('div.tkcoinrow', null, h('span', null, h('small', { text: 'Deine Lern-Coins: ' }), coinEl), buyBtn))));
    drawGaragePreview(cv, p, g);
    body.append(h('h3.tksec', { text: 'Upgrades' }), h('div.tkups', null, ...UPGRADES.map((u) => {
      const lv = g.up[u.id] || 0, cost = UPCOST[lv];
      return h('div.tkup', null, h('span.tkupic', null, icon(u.ic)),
        h('div.tkuptx', null, h('b', { text: u.name }), h('small', { text: lv ? `Jetzt: ${u.d[lv - 1]}` : 'Noch nicht ausgebaut' }), lv < 3 ? h('small.tknext', { text: `Nächste Stufe: ${u.d[lv]}` }) : h('small.tknext', { text: 'Voll ausgebaut' })),
        h('span.tklv', null, ...[0, 1, 2].map((k) => h('i' + (k < lv ? '.on' : '')))),
        lv < 3 ? h('button.btn' + (g.bolts >= cost ? '.primary' : ''), { disabled: g.bolts < cost, on: { click: () => { g.bolts -= cost; g.up[u.id] = lv + 1; saveGarage(who, g); toast(`${u.name} Stufe ${lv + 1}`); render(); } } }, boltIcon(), h('span', { text: String(cost) })) : h('span.tkmax', { text: 'Max' }));
    })));
    const look = (list, cur, key) => h('div.tklooks', null, ...list.map((b) => {
      const own = g.own.includes(b.id);
      return h('button.tklook' + (cur === b.id ? '.on' : ''), { on: { click: () => {
        if (!own) { if (g.bolts < b.cost) { toast(`Kostet ${b.cost} Schrauben`); return; } g.bolts -= b.cost; g.own.push(b.id); }
        g[key] = b.id; saveGarage(who, g); render();
      } } }, h('b', { text: b.name }), own ? h('small', { text: cur === b.id ? 'Ausgewählt' : 'Gehört dir' }) : h('small.tkcost', null, boltIcon(), h('span', { text: String(b.cost) })));
    }));
    body.append(h('h3.tksec', { text: 'Panzer-Form' }), look(BODIES, g.body, 'body'), h('h3.tksec', { text: 'Muster' }), look(PATTERNS, g.pat, 'pat'));
    body.append(h('p.tkhint', { text: 'Upgrades wirken in eigenen Spielen und in der Liga, wenn bei Optionen „Garage-Upgrades: An“ gewählt ist. Im normalen Turnier und im Duell zählen sie nicht. Form und Muster sieht man immer.' }));
  }

  // ---------- Rangliste ----------
  function ladderTab(body) {
    const L = Object.values(ladder()).sort((a, b) => b.rating - a.rating);
    body.append(h('div.ghero.tkligahero', null, h('span.gheroic', null, icon('list')), h('div.gherotx', null, h('b', { text: 'Ewige Rangliste' }), h('small', { text: 'Jede Partie mit mindestens zwei Panzern zählt. Wer vor anderen landet, steigt, wer hinten landet, fällt. Alle starten bei 1000.' }))));
    if (!L.length) { body.append(h('p.calm', { text: 'Noch keine Partien gespielt.' })); return; }
    body.append(h('div.tktable.tkladder', null,
      h('div.tktrow.head', null, h('span', { text: '#' }), h('span'), h('span', { text: 'Spieler' }), h('span', { text: 'Wertung' }), h('span', { text: 'Spiele' }), h('span', { text: 'Siege' }), h('span', { text: 'Verlauf' })),
      ...L.map((e, k) => { const mv = e.prev ? e.prev - (k + 1) : 0; return h('div.tktrow', null, h('span.tkrank', { text: String(k + 1) }), h('span.tkmove' + (mv > 0 ? '.up' : mv < 0 ? '.down' : ''), { text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–' }), h('span.tkresname', null, h('span.gdot', { style: { background: e.color } }), h('b', { text: e.name }), e.cpu ? h('small', { text: 'CPU' }) : null), h('b.tkpts', { text: String(e.rating) }), h('span', { text: String(e.games) }), h('span', { text: String(e.wins) }), spark(e.hist || [], e.color, L.length)); })));
    body.append(h('button.tkoptreset', { text: 'Rangliste leeren', on: { click: async () => { if (await confirmSheet('Rangliste leeren?', 'Alle Wertungen und Verläufe werden gelöscht.', 'Leeren')) { clearLadder(); render(); } } } }));
  }
  function spark(hist, color, n) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 80 24'); svg.setAttribute('class', 'tkspark');
    if (hist.length > 1) { const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', hist.map((r, k) => `${k / (hist.length - 1) * 76 + 2},${2 + (r - 1) / Math.max(1, n - 1) * 20}`).join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', color); pl.setAttribute('stroke-width', '2.2'); pl.setAttribute('stroke-linecap', 'round'); pl.setAttribute('stroke-linejoin', 'round'); svg.append(pl); }
    return svg;
  }

  // ---------- Waffenbuch ----------
  function armsTab(body) {
    const best = store.get('tkTargetBest', 0);
    body.append(h('div.ghero.tkligahero', null, h('span.gheroic', null, icon('bomb')), h('div.gherotx', null, h('b', { text: `${WEAPONS.length} Waffen und ${EXTRAS.length} Extras` }), h('small', { text: `Kisten bringen Nachschub. Ein Extra pro Zug.${best ? ` Zielscheiben-Rekord: ${best} Schüsse.` : ''}` }))));
    body.append(h('div.tkarms', null, ...WEAPONS.map((w) => {
      const cv = h('canvas', { width: 96, height: 96 }); glyph(cv.getContext('2d'), w, 96, isDark());
      return h('div.tkarm', null, cv, h('div.tkarmtx', null, h('b', { text: w.name }), h('small', { text: w.d }),
        h('span.tkstats', null, w.dmg > 0 ? h('em', { text: `Schaden ${w.dmg}` }) : null, w.r ? h('em', { text: `Radius ${w.r}` }) : null, h('em', { text: w.n === Infinity ? 'immer' : `${w.n}× pro Spiel` }))));
    })));
    body.append(h('h3.tksec', { text: 'Extras' }), h('div.tkarms', null, ...EXTRAS.map((e) => h('div.tkarm', null, h('span.tkexic', null, icon(e.ic)), h('div.tkarmtx', null, h('b', { text: e.name }), h('small', { text: e.d }))))));
  }

  render();
  return fx;
}

const boltIcon = () => { const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'tkbolt'); s.innerHTML = '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" fill="#c9ccd6" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 12h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'; return s; };

function drawMapPreview(cv, m) {
  const x = cv.getContext('2d'), dark = isDark(), ink = inkOf(dark), Wd = 240, Ht = 120;
  if (m.id === 'random') {
    const gr = x.createLinearGradient(0, 0, Wd, Ht); gr.addColorStop(0, dark ? '#2a2f3e' : '#e8eefc'); gr.addColorStop(1, dark ? '#3a2f3e' : '#fde8f0'); x.fillStyle = gr; x.fillRect(0, 0, Wd, Ht);
    x.fillStyle = ink; x.font = '800 54px "Noteworthy","Marker Felt",system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', Wd / 2, Ht / 2 + 4); return;
  }
  const TW = 1200, TH = 696, R = rng(7 + m.id.length * 13), f = m.gen(R, TW, TH);
  const sk = dark || m.night ? m.skyD : m.sky, gr = x.createLinearGradient(0, 0, 0, Ht); gr.addColorStop(0, sk[0]); gr.addColorStop(1, sk[1]); x.fillStyle = gr; x.fillRect(0, 0, Wd, Ht);
  const s = Wd / TW;
  x.beginPath(); x.moveTo(0, Ht); for (let i = 0; i <= TW; i += 10) x.lineTo(i * s, Math.max(14, Math.min(TH - 24, f(i))) * s); x.lineTo(Wd, Ht); x.closePath();
  const g2 = x.createLinearGradient(0, Ht * 0.3, 0, Ht); g2.addColorStop(0, m.soil[0]); g2.addColorStop(1, m.soil[1]); x.fillStyle = g2; x.fill();
  x.strokeStyle = m.top === '#ffffff' && !dark ? '#c4dff0' : m.top; x.lineWidth = 3; x.stroke(); x.strokeStyle = ink; x.lineWidth = 1.2; x.stroke();
  if (m.water) { x.fillStyle = 'rgba(70,150,235,.55)'; x.fillRect(0, TH * m.water * s, Wd, Ht); }
  if (m.lava) { x.fillStyle = 'rgba(255,90,20,.8)'; x.fillRect(0, TH * m.lava * s, Wd, Ht); }
}

function drawGaragePreview(cv, p, g) {
  const x = cv.getContext('2d'), dark = isDark(), ink = inkOf(dark);
  const Wd = 280, Ht = 150; x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, Wd, Ht);
  const gr = x.createLinearGradient(0, 0, 0, Ht); gr.addColorStop(0, dark ? '#1c2740' : '#d9ecff'); gr.addColorStop(1, dark ? '#2a2f3e' : '#fdf6e3'); x.fillStyle = gr; x.fillRect(0, 0, Wd, Ht);
  x.fillStyle = dark ? '#4a3d2c' : '#e8d3a8'; x.beginPath(); x.moveTo(0, 118); x.quadraticCurveTo(Wd / 2, 106, Wd, 118); x.lineTo(Wd, Ht); x.lineTo(0, Ht); x.closePath(); x.fill();
  x.strokeStyle = dark ? '#6fbf73' : '#3f9a4b'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 120); x.quadraticCurveTo(Wd / 2, 108, Wd, 120); x.stroke(); x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 118); x.quadraticCurveTo(Wd / 2, 106, Wd, 118); x.stroke();
  x.save(); x.translate(Wd / 2, 112); x.scale(2.1, 2.1);
  paintTank(x, { color: p.color, body: g.body, pat: g.pat, ang: 35, roll: 0, kick: 0, wind: 1, tm: 0 }, dark, ink);
  x.restore();
}
