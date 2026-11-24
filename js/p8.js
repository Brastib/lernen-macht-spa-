// Paket 8: Partyspiele reihum an einem iPad (2 bis 8 Leute).
// Stirnraten („Wer bin ich?“), Wort-Verbot (erklären ohne verbotene Wörter), Kritzel-Würfel (malen, erklären oder vormachen)
// und Kritzel-Stille-Post. Begriffe aus der App, aus einer eigenen Liste oder aus Lernkarten.
import { h, icon, sheet, toast } from './ui.js';
import { FONT, isDark, inkOf, paper, chip, turnCard, store } from './sketch.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (w) => String(w || '').replace(/\s+/g, ' ').trim();
const wait = (ms, sig) => new Promise((r) => { const t = setTimeout(r, ms); sig.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

// ---------- Begriffe ----------
const TERMS = ('Astronaut Pirat Feuerwehrfrau Koch Zauberer Ritter Detektiv Lehrerin Polizist Ärztin Bäcker Gärtner Fußballerin Schiedsrichter Clown Vampir Roboter Dinosaurier Drache Einhorn Gespenst Superheld Prinzessin Weihnachtsmann Osterhase Pinguin Giraffe Elefant Känguru Krokodil Faultier Eichhörnchen Hai Krake Schnecke Biene Eule Igel Papagei Kuh Katze Hund Pferd Frosch Kaktus Regenschirm Zahnbürste Staubsauger Kühlschrank Rakete Fahrrad Skateboard Trampolin Achterbahn Leuchtturm Vulkan Iglu Zelt Schatzkiste Taschenlampe Gitarre Schlagzeug Mikrofon Kamera Smartphone Fernbedienung Bügeleisen Waschmaschine Schneemann Sandburg Pizza Spaghetti Popcorn Eis Zuckerwatte Brezel Banane Ananas Wassermelone Zitrone Schwimmbad Zahnarzt Kino Bibliothek Flughafen Bahnhof Zoo Bauernhof Schule Klassenarbeit Hausaufgaben Pausenhof Stundenplan Tafel Radiergummi Taschenrechner Geodreieck Globus Mikroskop').split(' ');
const ACTS = ('Zähne putzen|Schwimmen|Fahrrad fahren|Kuchen backen|Hund ausführen|Fußball spielen|Gitarre spielen|Schlittschuh laufen|Fotos machen|Einkaufen|Staubsaugen|Angeln|Zelt aufbauen|Seil springen|Bowling|Tanzen|Skifahren|Eis essen|Schlafen|Zug fahren|Geschenk auspacken|Fenster putzen|Hausaufgaben machen|Klavier spielen|Reiten|Klettern|Boxen|Kochen|Zaubern|Telefonieren').split('|');
const TABU = [
  ['Schule', 'Lehrer', 'Unterricht', 'Klasse', 'lernen'], ['Pizza', 'Italien', 'Käse', 'Tomate', 'Ofen'], ['Fußball', 'Tor', 'Ball', 'Mannschaft', 'Schuss'],
  ['Handy', 'telefonieren', 'Smartphone', 'App', 'Nachricht'], ['Sommer', 'heiß', 'Sonne', 'Ferien', 'Jahreszeit'], ['Hausaufgaben', 'Schule', 'Heft', 'zu Hause', 'machen'],
  ['Kino', 'Film', 'Popcorn', 'Leinwand', 'Kasse'], ['Zahnarzt', 'Zähne', 'Bohrer', 'Praxis', 'Loch'], ['Regenbogen', 'Farben', 'Regen', 'Himmel', 'bunt'],
  ['Geburtstag', 'Kuchen', 'Geschenk', 'Party', 'Kerzen'], ['Weihnachten', 'Baum', 'Geschenke', 'Dezember', 'Fest'], ['Hund', 'bellen', 'Haustier', 'Gassi', 'Katze'],
  ['Schnee', 'weiß', 'Winter', 'kalt', 'Flocken'], ['Rakete', 'Weltall', 'fliegen', 'Mond', 'Start'], ['Bibliothek', 'Bücher', 'leihen', 'leise', 'lesen'],
  ['Schwimmbad', 'Wasser', 'schwimmen', 'Becken', 'Rutsche'], ['Pirat', 'Schiff', 'Schatz', 'Augenklappe', 'Meer'], ['Zug', 'Bahn', 'Gleis', 'Bahnhof', 'fahren'],
  ['Computer', 'Bildschirm', 'Tastatur', 'Maus', 'Internet'], ['Brille', 'Augen', 'sehen', 'Gläser', 'Nase'], ['Gitarre', 'Saiten', 'Musik', 'spielen', 'Instrument'],
  ['Eis', 'kalt', 'Sommer', 'Waffel', 'Kugel'], ['Klassenarbeit', 'Test', 'Note', 'Schule', 'schreiben'], ['Ferien', 'Urlaub', 'Schule', 'frei', 'Sommer'],
  ['Zebra', 'Streifen', 'schwarz', 'weiß', 'Pferd'], ['Vulkan', 'Lava', 'Berg', 'Ausbruch', 'heiß'], ['Kühlschrank', 'kalt', 'Küche', 'Essen', 'Tür'],
  ['Feuerwehr', 'Feuer', 'löschen', 'Auto', 'Wasser'], ['Mathe', 'Zahlen', 'rechnen', 'Fach', 'Schule'], ['Zauberer', 'Zauberstab', 'Hut', 'Trick', 'Hase'],
  ['Wecker', 'klingeln', 'Uhr', 'Morgen', 'aufstehen'], ['Schatten', 'Sonne', 'dunkel', 'Licht', 'folgen'], ['Spiegel', 'sehen', 'Glas', 'Bild', 'Bad'],
  ['Schokolade', 'süß', 'braun', 'Kakao', 'Tafel'], ['Insel', 'Wasser', 'Meer', 'Land', 'Strand'], ['Drache', 'Feuer', 'fliegen', 'Märchen', 'Ritter'],
  ['Pinguin', 'Eis', 'Vogel', 'schwarz', 'watscheln'], ['Fahrrad', 'treten', 'Räder', 'Pedale', 'fahren'], ['Taschenrechner', 'rechnen', 'Mathe', 'Zahlen', 'Tasten'],
  ['Geodreieck', 'Mathe', 'Winkel', 'Lineal', 'messen'],
];
async function deckTerms() {
  const { pickSource } = await import('./quiz.js');
  const src = await pickSource({ title: 'Welche Lernkarten?', okLabel: 'Übernehmen', min: 1, key: 'gPartyDecks', text: 'Die Vorderseite jeder Karte wird zum Begriff.' });
  if (!src) return null;
  const db = await import('./db.js'), out = [];
  for (const id of src.deckIds) for (const c of await db.listCards(id)) { const t = clean(c.front); if (t && t.length <= 40) out.push(t); }
  if (!out.length) { toast('In diesen Karten gibt es keine passenden Begriffe.'); return null; }
  return out;
}
const myTerms = () => (store.get('gPartyWords', []) || []).filter((w) => clean(w));
function editTerms() {
  return sheet('Eigene Begriffe', (body, close) => {
    const ta = h('textarea.hgta', { rows: 10, placeholder: 'Ein Begriff pro Zeile.\nFür Wort-Verbot: Begriff, dann die verbotenen Wörter mit Komma:\nBaum, Blätter, Wald, Holz, grün' });
    ta.value = myTerms().join('\n');
    const n = h('small.hgcount');
    const upd = () => { const l = ta.value.split('\n').map(clean).filter(Boolean); n.textContent = `${l.length} ${l.length === 1 ? 'Begriff' : 'Begriffe'}`; };
    ta.addEventListener('input', upd); upd();
    body.append(h('p.dlgtext', { text: 'Diese Liste gilt für alle Partyspiele. Bei Wort-Verbot kannst du hinter einem Komma die verbotenen Wörter schreiben.' }), ta, n,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => { const l = [...new Set(ta.value.split('\n').map(clean).filter(Boolean))]; store.set('gPartyWords', l); close(l); } } })));
  });
}

// ---------- Spiele ----------
export const PARTY = {
  stirn: { name: 'Stirnraten', ic: 'party', min: 2, sub: 'Wer bin ich? iPad an die Stirn, die anderen geben Tipps.' },
  verbot: { name: 'Wort-Verbot', ic: 'mute', min: 3, sub: 'Erklären, ohne die verbotenen Wörter zu sagen.' },
  wuerfel: { name: 'Kritzel-Würfel', ic: 'dice', min: 3, sub: 'Würfeln: malen, erklären oder vormachen.' },
  post: { name: 'Kritzel-Stille-Post', ic: 'pen', min: 3, sub: 'Abwechselnd malen und raten, am Ende alles anschauen.' },
};

// Einstellungen: Spieler, Runden, Zeit, Begriffe
function setup(fx, kind, all) {
  return new Promise((resolve) => {
    const g = PARTY[kind];
    const last = store.get('gPartySet', {});
    const sel = new Set((last.names || []).filter((nm) => all.some((p) => p.name === nm)));
    if (sel.size < g.min) all.slice(0, Math.max(g.min, 4)).forEach((p) => sel.add(p.name));
    const guests = [];
    let rounds = last.rounds || 1, secs = last.secs || 60, src = last.src || 'app', cards = null;
    const body = h('div.hgpick.ptsetup');
    const draw = () => {
      const ps = [...all, ...guests];
      const chosen = ps.filter((p) => sel.has(p.name));
      const seg = (vals, cur, set, fmt) => h('div.gseg', null, ...vals.map((v) => h('button' + (v === cur ? '.on' : ''), { text: fmt(v), on: { click: () => { set(v); draw(); } } })));
      const guestIn = h('input.input', { placeholder: 'Name', maxLength: 16 });
      const addGuest = () => { const nm = clean(guestIn.value); if (!nm || ps.some((p) => p.name.toLowerCase() === nm.toLowerCase())) return; guests.push({ name: nm, color: ['#21b8c9', '#a46bff', '#ff7ac8', '#2fbf71', '#f2b632', '#8a8f98'][guests.length % 6] }); sel.add(nm); draw(); };
      guestIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } });
      const okBtn = h('button.btn.primary', { text: 'Los geht’s', disabled: chosen.length < g.min || chosen.length > 8 || (src === 'cards' && !cards) || (src === 'list' && !myTerms().length), on: { click: () => {
        store.set('gPartySet', { names: chosen.map((p) => p.name), rounds, secs, src });
        let pool;
        if (src === 'cards') pool = cards.map((t) => ({ t, no: [] }));
        else if (src === 'list') pool = myTerms().map((l) => { const [t, ...no] = l.split(',').map(clean); return { t, no: no.filter(Boolean).slice(0, 5) }; });
        else pool = kind === 'verbot' ? TABU.map(([t, ...no]) => ({ t, no })) : kind === 'wuerfel' ? [...TERMS, ...ACTS].map((t) => ({ t, no: [] })) : TERMS.map((t) => ({ t, no: [] }));
        resolve({ players: shuffle([...chosen]), rounds, secs, pool: shuffle(pool) });
      } } });
      body.replaceChildren(...[
        h('h3', { text: g.name }), h('p.dlgtext', { text: g.sub }),
        h('p.fieldlabel', { text: `Wer spielt mit? (${chosen.length} von höchstens 8, mindestens ${g.min})` }),
        h('div.chips.left', null, ...ps.map((p) => h('button.pchip' + (sel.has(p.name) ? '.on' : ''), { style: { '--c': p.color }, on: { click: () => { if (sel.has(p.name)) sel.delete(p.name); else sel.add(p.name); draw(); } } }, h('span.gdot', { style: { background: p.color } }), h('span', { text: p.name })))),
        h('div.hgsecrow', null, guestIn, h('button.btn', { text: 'Gast dazu', on: { click: addGuest } })),
        kind === 'post' ? null : h('div.ptrow', null, h('p.fieldlabel', { text: 'Runden (jeder ist so oft dran)' }), seg([1, 2, 3], rounds, (v) => { rounds = v; }, String)),
        kind === 'post' ? h('div.ptrow', null, h('p.fieldlabel', { text: 'Zeit zum Malen' }), seg([45, 60, 90], secs, (v) => { secs = v; }, (v) => `${v} s`)) : h('div.ptrow', null, h('p.fieldlabel', { text: 'Zeit pro Zug' }), seg([45, 60, 90], secs, (v) => { secs = v; }, (v) => `${v} s`)),
        h('div.ptrow', null, h('p.fieldlabel', { text: 'Begriffe' }), seg(['app', 'list', 'cards'], src, (v) => { src = v; }, (v) => ({ app: 'Aus der App', list: 'Eigene Liste', cards: 'Lernkarten' }[v]))),
        src === 'list' ? h('div.hgsecrow', null, h('small.hgcount', { text: myTerms().length ? `${myTerms().length} eigene Begriffe` : 'Die Liste ist noch leer.' }), h('button.btn', { text: 'Liste bearbeiten', on: { click: async () => { await editTerms(); draw(); } } })) : null,
        src === 'cards' ? h('div.hgsecrow', null, h('small.hgcount', { text: cards ? `${cards.length} Begriffe aus Lernkarten` : 'Noch keine Karten gewählt.' }), h('button.btn', { text: 'Karten wählen', on: { click: async () => { const c = await deckTerms(); if (c) cards = c; draw(); } } })) : null,
        h('div.dlgactions', null, okBtn)].filter(Boolean));
    };
    fx.stage.replaceChildren(body);
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
    draw();
  });
}

// Zeitanzeige als Ring
function timerRing(secs) {
  const el = h('div.pttimer', null, h('b'));
  return { el, set(left) { el.style.setProperty('--p', String(Math.max(0, left / secs))); el.firstChild.textContent = String(Math.max(0, Math.ceil(left))); el.classList.toggle('low', left <= 10); } };
}
function runTimer(secs, sig, onTick, stopper) {
  return new Promise((resolve) => {
    const t0 = performance.now(); let raf = 0, done = false;
    const end = (v) => { if (done) return; done = true; cancelAnimationFrame(raf); resolve(v); };
    const loop = (t) => { const left = secs - (t - t0) / 1000; onTick(left); if (left <= 0) return end('time'); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    sig.addEventListener('abort', () => end(null), { once: true });
    if (stopper) stopper.stop = () => end('stop');
  });
}
function scoreboard(fx, title, players, score, extra) {
  return new Promise((resolve) => {
    const order = [...players].sort((a, b) => (score.get(b.name) || 0) - (score.get(a.name) || 0));
    const top = score.get(order[0].name) || 0;
    fx.stage.replaceChildren(h('div.hgpick.ptboard', null,
      h('h3', { text: title }),
      h('ol.ptrank', null, ...order.map((p, i) => h('li' + ((score.get(p.name) || 0) === top && top > 0 ? '.win' : ''), { style: { '--pc': p.color } }, h('span.ptpos', { text: `${i + 1}.` }), chip(p), h('b', { text: `${score.get(p.name) || 0} ${(score.get(p.name) || 0) === 1 ? 'Punkt' : 'Punkte'}` })))),
      extra || null,
      h('div.dlgactions', null, h('button.btn', { text: 'Fertig', on: { click: () => resolve(false) } }), h('button.btn.primary', { text: 'Nochmal', on: { click: () => resolve(true) } }))));
    fx.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
}
const nextTerm = (S) => { if (S.i >= S.pool.length) { shuffle(S.pool); S.i = 0; } return S.pool[S.i++]; };

// ---------- Stirnraten ----------
async function stirn(fx, S) {
  const score = new Map();
  for (let r = 0; r < S.rounds; r++) for (const p of S.players) {
    const ok = await turnCard(fx, p, `${p.name} rät`, 'Halte das iPad mit dem Bildschirm nach vorne an die Stirn. Die anderen erklären. Tippe rechts für „Richtig“ und links für „Weiter“.', 'Start', 'party');
    if (!ok || fx.signal.aborted) return null;
    const log = [];
    const ring = timerRing(S.secs);
    const term = h('div.ptterm'); const sub = h('small.ptsub');
    const no = h('button.ptside.no', null, icon('close'), h('span', { text: 'Weiter' }));
    const yes = h('button.ptside.yes', null, icon('check'), h('span', { text: 'Richtig!' }));
    let cur = nextTerm(S), busy = false;
    const show = () => { term.textContent = cur.t; sub.textContent = `${p.name}: ${log.filter((q) => q.ok).length} richtig`; };
    const stopper = {};
    const flash = (ok) => { if (busy) return; busy = true; log.push({ t: cur.t, ok }); term.classList.add(ok ? 'ok' : 'skip'); setTimeout(() => { term.classList.remove('ok', 'skip'); cur = nextTerm(S); show(); busy = false; }, 450); };
    no.addEventListener('click', () => flash(false)); yes.addEventListener('click', () => flash(true));
    fx.stage.replaceChildren(h('div.ptstirn', null, no, h('div.ptmid', null, ring.el, term, sub), yes));
    show();
    const res = await runTimer(S.secs, fx.signal, (l) => ring.set(l), stopper);
    if (!res) return null;
    const pts = log.filter((q) => q.ok).length; score.set(p.name, (score.get(p.name) || 0) + pts);
    if (!(await summary(fx, p, `${pts} ${pts === 1 ? 'Begriff' : 'Begriffe'} erraten`, log))) return null;
  }
  return score;
}
function summary(fx, p, title, log) {
  return new Promise((resolve) => {
    fx.stage.replaceChildren(h('div.hgpick', null, h('div.hshud', null, chip(p, h('small', { text: title }))),
      h('ul.ptlog', null, ...log.map((q) => h('li' + (q.ok ? '.ok' : '.no'), null, icon(q.ok ? 'check' : 'close'), h('span', { text: q.t })))),
      log.length ? null : h('p.dlgtext', { text: 'Diesmal nichts.' }),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Weiter', on: { click: () => resolve(true) } }))));
    fx.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
}

// ---------- Wort-Verbot und Kritzel-Würfel ----------
const MODES = [['draw', 'Malen', 'pen'], ['talk', 'Erklären', 'mic'], ['act', 'Vormachen', 'party'], ['draw', 'Malen', 'pen'], ['talk', 'Erklären', 'mic'], ['act', 'Vormachen', 'party']];
function rollDie(fx, p) {
  return new Promise((resolve) => {
    const face = h('div.ptdie', null, h('b', { text: '?' }));
    const lab = h('p.ptsub', { text: 'Tippe auf den Würfel.' });
    let rolled = false;
    face.addEventListener('click', async () => {
      if (rolled) return; rolled = true;
      let k = 0;
      for (let i = 0; i < 14; i++) { k = (Math.random() * 6) | 0; face.firstChild.textContent = String(k + 1); face.style.transform = `rotate(${(Math.random() - 0.5) * 40}deg)`; await wait(60 + i * 12, fx.signal); }
      face.style.transform = '';
      const m = MODES[k]; face.replaceChildren(icon(m[2]), h('b', { text: m[1] }));
      lab.textContent = `${p.name} muss den Begriff ${m[0] === 'draw' ? 'malen' : m[0] === 'talk' ? 'erklären' : 'vormachen (ohne Worte)'}.`;
      await wait(1300, fx.signal); resolve(m);
    });
    fx.stage.replaceChildren(h('div.hgpick.ptdiebox', null, h('div.hshud', null, chip(p, h('small', { text: 'würfelt' }))), face, lab));
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
  });
}
function peekTerm(fx, p, card, mode) {
  return new Promise((resolve) => {
    fx.stage.replaceChildren(h('div.hgpick.ptpeek', null, h('div.hshud', null, chip(p, h('small', { text: 'nur du schaust' }))),
      h('div.ptterm', { text: card.t }),
      card.no.length && mode === 'verbot' ? h('div.ptno', null, h('small', { text: 'Verboten:' }), ...card.no.map((w) => h('span', { text: w }))) : null,
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Verstanden, Zeit läuft', on: { click: () => resolve(true) } }))));
    fx.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
}
// einfache Malfläche
function drawPad(host, color) {
  const cv = h('canvas.ptpad'), x = cv.getContext('2d'); host.append(cv);
  const strokes = []; let cur = null, dpr = 1;
  const size = () => { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr); redraw(); };
  const redraw = () => {
    const dark = isDark(); x.setTransform(dpr, 0, 0, dpr, 0, 0); const r = cv.getBoundingClientRect(); paper(x, r.width, r.height, dark, 24);
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const s of strokes) { x.strokeStyle = s.ink ? inkOf(dark) : s.c; x.lineWidth = s.w; x.beginPath(); s.p.forEach(([a, b], i) => (i ? x.lineTo(a * r.width, b * r.height) : x.moveTo(a * r.width, b * r.height))); if (s.p.length === 1) x.lineTo(s.p[0][0] * r.width + 0.1, s.p[0][1] * r.height); x.stroke(); }
  };
  const ro = new ResizeObserver(size); ro.observe(cv);
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  let useInk = true;
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cur = { p: [pos(e)], c: color, ink: useInk, w: e.pointerType === 'pen' ? 3 + (e.pressure || 0.5) * 4 : 5 }; strokes.push(cur); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } redraw(); });
  cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.p.push(pos(e)); redraw(); });
  const up = () => { cur = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  return { cv, undo: () => { strokes.pop(); redraw(); }, clear: () => { strokes.length = 0; redraw(); }, color: (v) => { useInk = v === 'ink'; }, empty: () => !strokes.length, stop: () => ro.disconnect(), url: () => cv.toDataURL('image/png') };
}
function padTools(pad, p) {
  const b1 = h('button.btn.round', { 'aria-label': 'Rückgängig', title: 'Rückgängig', on: { click: () => pad.undo() } }, icon('undo'));
  const b2 = h('button.btn.round', { 'aria-label': 'Alles löschen', title: 'Alles löschen', on: { click: () => pad.clear() } }, icon('trash'));
  const c1 = h('button.ptcol.on', { 'aria-label': 'Bleistift', style: { '--c': 'var(--ink, #26262b)' } }), c2 = h('button.ptcol', { 'aria-label': 'Farbe', style: { '--c': p.color } });
  c1.addEventListener('click', () => { pad.color('ink'); c1.classList.add('on'); c2.classList.remove('on'); });
  c2.addEventListener('click', () => { pad.color('col'); c2.classList.add('on'); c1.classList.remove('on'); });
  return h('div.pttools', null, c1, c2, b1, b2);
}
async function explainGame(fx, S, kind) {
  const score = new Map(), add = (nm, v) => score.set(nm, (score.get(nm) || 0) + v);
  for (let r = 0; r < S.rounds; r++) for (const p of S.players) {
    const others = S.players.filter((q) => q !== p);
    let mode = 'verbot';
    if (kind === 'wuerfel') {
      const ok0 = await turnCard(fx, p, `${p.name} ist dran`, 'Erst würfeln: malen, erklären oder vormachen.', 'Zum Würfel', 'dice'); if (!ok0 || fx.signal.aborted) return null;
      const m = await rollDie(fx, p); if (!m) return null; mode = m[0];
    }
    const ok = await turnCard(fx, p, kind === 'verbot' ? `${p.name} erklärt` : `${p.name}: ${mode === 'draw' ? 'malen' : mode === 'talk' ? 'erklären' : 'vormachen'}`, `Nur ${p.name} schaut gleich auf den Begriff. Die anderen raten.`, 'Begriff zeigen', 'eye');
    if (!ok || fx.signal.aborted) return null;
    const log = [];
    let card = nextTerm(S);
    if (kind === 'wuerfel' && !(await peekTerm(fx, p, card, mode))) return null;
    // Spielfläche
    const ring = timerRing(S.secs);
    const termEl = h('div.ptterm.small'), noEl = h('div.ptno');
    const showCard = () => { termEl.textContent = card.t; noEl.replaceChildren(...(card.no.length ? [h('small', { text: 'Verboten:' }), ...card.no.map((w) => h('span', { text: w }))] : [])); };
    const stopper = {};
    let busy = false;
    const next = (res, who) => {
      if (busy) return; busy = true;
      log.push({ t: card.t, ok: res === 'ok', who });
      if (res === 'ok') { add(p.name, 1); if (who) add(who.name, 1); }
      if (res === 'foul') add(p.name, -1);
      if (kind === 'wuerfel') { stopper.stop && stopper.stop(); return; }   // beim Würfel: ein Begriff pro Zug
      card = nextTerm(S); showCard(); setTimeout(() => { busy = false; }, 250);
    };
    const whoRow = h('div.ptwho', null, h('small', { text: 'Erraten von:' }), ...others.map((q) => h('button.pchip', { style: { '--c': q.color }, on: { click: () => next('ok', q) } }, h('span.gdot', { style: { background: q.color } }), h('span', { text: q.name }))));
    const acts = h('div.ptacts', null,
      kind === 'verbot' ? h('button.btn.dangerfill', { on: { click: () => next('foul') } }, icon('mute'), h('span', { text: 'Verbotenes Wort!' })) : null,
      h('button.btn', { text: kind === 'verbot' ? 'Überspringen' : 'Aufgeben', on: { click: () => next('skip') } }));
    let pad = null, peek = null;
    const main = h('div.ptmain');
    if (kind === 'verbot') { main.append(termEl, noEl); showCard(); }
    else {
      peek = h('button.btn.ptpeekbtn', { text: 'Begriff zeigen (halten)' });
      const sh = (v) => { termEl.textContent = v ? card.t : '• • •'; };
      peek.addEventListener('pointerdown', (e) => { e.preventDefault(); sh(true); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => peek.addEventListener(ev, () => sh(false)));
      sh(false);
      if (mode === 'draw') { const box = h('div.ptpadbox'); main.append(box); pad = drawPad(box, p.color); main.append(padTools(pad, p)); }
      else main.append(h('div.ptbig', null, icon(mode === 'talk' ? 'mic' : 'party'), h('b', { text: mode === 'talk' ? 'Erklären!' : 'Vormachen, ohne zu reden!' })));
    }
    fx.stage.replaceChildren(h('div.hswrap.ptplay', null,
      h('div.hshud', null, chip(p, h('small', { text: kind === 'verbot' ? 'erklärt' : mode === 'draw' ? 'malt' : mode === 'talk' ? 'erklärt' : 'macht vor' })), h('span.bsspacer'), peek ? h('div.ptpeekwrap', null, termEl, peek) : null, ring.el),
      main, whoRow, acts));
    const res = await runTimer(S.secs, fx.signal, (l) => ring.set(l), stopper);
    if (pad) pad.stop();
    if (!res) return null;
    if (kind === 'wuerfel' && !log.length) log.push({ t: card.t, ok: false });
    const got = log.filter((q) => q.ok).length;
    if (!(await summary(fx, p, kind === 'verbot' ? `${got} ${got === 1 ? 'Begriff' : 'Begriffe'} erklärt` : got ? `Erraten von ${log[0].who.name}` : 'Nicht erraten', log.map((q) => ({ ...q, t: q.who ? `${q.t} (${q.who.name})` : q.t }))))) return null;
  }
  return score;
}

// ---------- Kritzel-Stille-Post ----------
function writeStep(fx, p, prompt, img, secs) {
  return new Promise((resolve) => {
    const inp = h('input.input.ptin', { maxLength: 60, autocomplete: 'off', placeholder: img ? 'Was ist das?' : 'Ein Begriff zum Malen' });
    const go = () => { const v = clean(inp.value); if (v) resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    fx.stage.replaceChildren(h('div.hgpick.ptwrite', null, h('div.hshud', null, chip(p, h('small', { text: img ? 'rät' : 'denkt sich etwas aus' }))),
      h('p.dlgtext', { text: prompt }),
      img ? h('img.ptimg', { src: img, alt: 'Zeichnung' }) : null,
      h('div.hgsecrow', null, inp, img ? null : h('button.btn', { text: 'Zufall', on: { click: () => { inp.value = TERMS[(Math.random() * TERMS.length) | 0]; } } })),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: go } }))));
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
    setTimeout(() => inp.focus(), 80);
  });
}
function drawStep(fx, p, word, secs) {
  return new Promise((resolve) => {
    const ring = timerRing(secs), box = h('div.ptpadbox');
    const done = h('button.btn.primary', { text: 'Fertig' });
    fx.stage.replaceChildren(h('div.hswrap.ptplay', null, h('div.hshud', null, chip(p, h('small', { text: 'malt' })), h('span.bsspacer'), h('div.ptterm.small', { text: word }), ring.el), h('div.ptmain', null, box), done));
    const pad = drawPad(box, p.color);
    box.after(padTools(pad, p));
    const stopper = {};
    done.addEventListener('click', () => stopper.stop && stopper.stop());
    runTimer(secs, fx.signal, (l) => ring.set(l), stopper).then((r) => { const url = r ? pad.url() : null; pad.stop(); resolve(url); });
  });
}
async function post(fx, S) {
  const n = S.players.length, chain = [];
  const first = S.players[0];
  if (!(await turnCard(fx, first, `${first.name} fängt an`, 'Denk dir einen Begriff aus. Die anderen schauen weg.', 'Los', 'pen'))) return null;
  let word = await writeStep(fx, first, 'Schreib einen Begriff, den der Nächste malen soll.', null, S.secs); if (!word) return null;
  chain.push({ p: first, kind: 'word', v: word });
  for (let i = 1; i < n; i++) {
    const p = S.players[i], prev = chain[chain.length - 1];
    if (prev.kind === 'word') {
      if (!(await turnCard(fx, p, `${p.name} malt`, `Nur ${p.name} schaut. Male den Begriff, ohne Buchstaben.`, 'Los', 'pen'))) return null;
      const url = await drawStep(fx, p, prev.v, S.secs); if (!url) return null;
      chain.push({ p, kind: 'img', v: url });
    } else {
      if (!(await turnCard(fx, p, `${p.name} rät`, `Nur ${p.name} schaut. Was ist auf dem Bild?`, 'Bild zeigen', 'eye'))) return null;
      const g = await writeStep(fx, p, 'Was ist das? Schreib deinen Tipp.', prev.v, S.secs); if (!g) return null;
      chain.push({ p, kind: 'word', v: g });
    }
  }
  // Rückschau
  return new Promise((resolve) => {
    const list = h('div.ptchain');
    let k = 0;
    const more = h('button.btn.primary', { text: 'Nächstes zeigen' });
    const showNext = () => {
      const c = chain[k++];
      list.append(h('div.ptlink' + (c.kind === 'img' ? '.img' : ''), { style: { '--pc': c.p.color } }, chip(c.p, h('small', { text: c.kind === 'img' ? 'hat gemalt' : k === 1 ? 'hat sich ausgedacht' : 'hat geraten' })),
        c.kind === 'img' ? h('img.ptimg', { src: c.v, alt: 'Zeichnung' }) : h('div.ptterm.small', { text: c.v })));
      list.lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      if (k >= chain.length) { more.textContent = 'Fertig'; more.onclick = () => resolve(new Map()); }
    };
    more.onclick = showNext;
    fx.stage.replaceChildren(h('div.hgpick.ptreview', null, h('h3', { text: 'Rückschau: Was ist daraus geworden?' }), list, h('div.dlgactions', null, more)));
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
    showNext();
  });
}

// ---------- Start ----------
export async function party(kind, openFx, all) {
  const g = PARTY[kind];
  const fx = openFx(g.name, 'Partyspiel reihum');
  for (;;) {
    const S = await setup(fx, kind, all); if (!S || fx.signal.aborted) return;
    S.i = 0;
    const score = kind === 'stirn' ? await stirn(fx, S) : kind === 'post' ? await post(fx, S) : await explainGame(fx, S, kind);
    if (!score || fx.signal.aborted) return;
    if (kind === 'post') continue;   // nach der Rückschau zurück zu den Einstellungen
    if (!(await scoreboard(fx, `${g.name}: Ergebnis`, S.players, score))) { fx.close(); return; }
  }
}
