// Quiz aus den eigenen Lernkarten: allein (für eine Arbeit üben) oder als Duell im Turnier.
// Fragen: Vorderseite → richtige Rückseite aus 4 Antworten (oder umgekehrt). Schnell antworten gibt mehr Punkte.
import * as db from './db.js';
import { h, icon, sheet, toast, plural } from './ui.js';
import { addCoins, getCoins, coinTag, JOKERS } from './cards.js';

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const TIME = 15;   // Sekunden pro Frage
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Welche Stapel? Gibt { deckIds, label } zurück
export async function pickSource({ title = 'Quiz: Welches Thema?', okLabel = 'Weiter' } = {}) {
  const [subjects, decks, cards] = await Promise.all([db.listSubjects(), db.listDecks(), db.listCards()]);
  const count = new Map();
  for (const c of cards) if (c.front && c.back) count.set(c.deckId, (count.get(c.deckId) || 0) + 1);
  const usable = decks.filter((d) => (count.get(d.id) || 0) >= 1);
  if (!usable.length) { toast('Leg zuerst Lernkarten an (im Fach unter „Lernkarten“). Daraus macht die App das Quiz.', 5000); return null; }
  const last = store.get('gQuiz', null);
  const sel = new Set((last && last.deckIds || []).filter((id) => usable.some((d) => d.id === id)));
  return sheet(title, (body, close) => {
    const total = h('p.qtotal');
    const list = h('div.qdecks');
    const draw = () => {
      list.replaceChildren(...subjects.filter((s) => usable.some((d) => d.subjectId === s.id)).map((s) =>
        h('div.qsubj', null, h('p.fieldlabel', null, h('i.dot', { style: { '--c': s.color } }), s.name),
          h('div.chips.left', null, ...usable.filter((d) => d.subjectId === s.id).map((d) =>
            h('button.pchip' + (sel.has(d.id) ? '.on' : ''), { style: { '--c': s.color }, on: { click: () => { if (sel.has(d.id)) sel.delete(d.id); else sel.add(d.id); draw(); } } },
              h('span', { text: d.title }), h('small.qn', { text: String(count.get(d.id)) })))))));
      const n = [...sel].reduce((a, id) => a + (count.get(id) || 0), 0);
      total.textContent = sel.size ? `${plural(n, 'Karte', 'Karten')} ausgewählt` + (n < 4 ? ' · für Auswahl-Antworten braucht es mindestens 4' : '') : 'Tippe einen oder mehrere Stapel an.';
      ok.disabled = n < 4;
    };
    const ok = h('button.btn.primary', { text: okLabel, on: { click: () => {
      const ids = [...sel];
      const label = ids.map((id) => usable.find((d) => d.id === id).title).join(', ');
      store.set('gQuiz', { deckIds: ids, label });
      close({ deckIds: ids, label });
    } } });
    body.append(h('p.dlgtext', { text: 'Das Quiz nimmt die Fragen aus deinen Lernkarten. Für eine Arbeit wählst du die passenden Stapel.' }), list, total,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), ok));
    draw();
  }, { wide: true });
}

async function loadQuestions(deckIds) {
  const decks = await db.listDecks();
  const all = [];
  for (const id of deckIds) all.push(...(await db.listCards(id)).filter((c) => c.front && c.back));
  return { cards: all, lang: (decks.find((d) => d.id === deckIds[0]) || {}).lang };
}
// Eine Frage: { c, q, a, opts }
function makeQ(c, all) {
  const rev = Math.random() < 0.35;
  const q = rev ? c.back : c.front, a = rev ? c.front : c.back;
  const pool = shuffle([...new Set(all.filter((x) => x.id !== c.id).map((x) => (rev ? x.front : x.back)).filter((x) => x && x !== a))]);
  return { c, q, a, opts: shuffle([a, ...pool.slice(0, 3)]) };
}

// Zeichnet eine Frage, löst mit { ok, ms, given } auf
function askQ(host, Q, { who, extra, jokers, signal } = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false, raf = 0;
    const bar = h('i');
    const timer = h('div.qtimer', null, bar);
    const grid = h('div.choices.qchoices');
    const finish = (ok, given, btn) => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      grid.querySelectorAll('.choice').forEach((b) => { b.disabled = true; if (b.textContent === Q.a) b.classList.add('right'); });
      if (btn && !ok) btn.classList.add('wrong');
      const ms = performance.now() - t0;
      setTimeout(() => resolve({ ok, ms, given }), ok ? 700 : 1300);
    };
    for (const o of Q.opts) grid.append(h('button.choice', { text: o, on: { click: (e) => finish(o === Q.a, o, e.currentTarget) } }));
    const jrow = jokers ? h('div.jokers') : null;
    if (jokers) {
      const draw = () => jrow.replaceChildren(h('button.joker', { disabled: done || Q.used || jokers.coins < JOKERS.hint, on: { click: async () => {
        Q.used = true; jokers.coins = await addCoins(-JOKERS.hint); jokers.onChange();
        [...grid.querySelectorAll('.choice')].filter((b) => b.textContent !== Q.a).sort(() => Math.random() - 0.5).slice(0, 2).forEach((b) => { b.disabled = true; b.classList.add('gone'); });
        draw();
      } } }, h('span', { text: '50 : 50' }), coinTag(JOKERS.hint, '.cost')));
      draw();
    }
    host.replaceChildren(h('div.qcard', null,
      who ? h('div.qwho', null, who) : null,
      extra || null,
      timer,
      h('p.qq', { text: Q.q }),
      jrow, grid));
    const tick = () => {
      if (done || (signal && signal.aborted)) return;
      const left = 1 - (performance.now() - t0) / (TIME * 1000);
      bar.style.transform = `scaleX(${Math.max(0, left)})`;
      timer.classList.toggle('low', left < 0.3);
      if (left <= 0) { finish(false, null, null); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
const points = (r) => (r.ok ? 100 + Math.round(Math.max(0, 1 - r.ms / (TIME * 1000)) * 100) : 0);

// ---------- allein: für eine Arbeit üben ----------
export async function quizSolo({ deckIds, label } = {}) {
  if (!deckIds) { const s = await pickSource({ okLabel: 'Quiz starten' }); if (!s) return; ({ deckIds, label } = s); }
  store.set('gQuiz', { deckIds, label });
  const { cards } = await loadQuestions(deckIds);
  if (cards.length < 4) { toast('Für das Quiz braucht es mindestens 4 Karten.'); return; }
  // schwierige Karten (oft falsch, niedrige Stufe) kommen bevorzugt dran
  const weight = (c) => 1 + (c.wrong || 0) * 2 - Math.min(3, c.box || 0) * 0.3 + Math.random() * 2;
  const pick = [...cards].sort((a, b) => weight(b) - weight(a)).slice(0, Math.min(10, cards.length));
  shuffle(pick);
  const jokers = { coins: await getCoins(), onChange: () => { coinEl.replaceWith(coinEl = coinTag(jokers.coins, '.hud')); } };
  let coinEl = coinTag(jokers.coins, '.hud');
  const ac = new AbortController();
  const stage = h('div.qstage');
  const info = h('span.qinfo');
  const root = h('div.gamefx.quizfx', null,
    h('div.gtop', null, h('div.gtitle', null, h('b', { text: 'Quiz' }), h('small', { text: label || '' })),
      h('div.qtopr', null, info, coinEl, h('button.btn.round.gclose', { 'aria-label': 'Schließen', on: { click: () => close() } }, icon('close')))),
    stage);
  const close = () => { ac.abort(); root.classList.remove('in'); setTimeout(() => root.remove(), 220); };
  document.body.append(root); requestAnimationFrame(() => root.classList.add('in'));
  let score = 0, right = 0, earned = 0;
  const wrong = [];
  for (let i = 0; i < pick.length; i++) {
    if (ac.signal.aborted) return;
    info.textContent = `Frage ${i + 1} von ${pick.length} · ${score} Punkte`;
    const Q = makeQ(pick[i], cards);
    const r = await askQ(stage, Q, { jokers, signal: ac.signal });
    if (ac.signal.aborted) return;
    score += points(r);
    if (r.ok) { right++; if (!Q.used) { jokers.coins = await addCoins(1); earned++; jokers.onChange(); } }
    else {
      wrong.push(Q);
      // falsch beantwortet: Karte kommt beim Karteikarten-Lernen gleich wieder dran
      const c = Q.c; c.box = 0; c.due = 0; c.wrong = (c.wrong || 0) + 1;
      await db.putItems('cards', c);
    }
  }
  info.textContent = `${score} Punkte`;
  const best = store.get('gQuizBest', {}), key = deckIds.slice().sort().join(',');
  const rec = score > (best[key] || 0);
  if (rec) { best[key] = score; store.set('gQuizBest', best); }
  const pct = Math.round(right / pick.length * 100);
  const mood = pct >= 90 ? 'Super, das sitzt!' : pct >= 70 ? 'Gut! Noch ein paar Lücken.' : pct >= 50 ? 'Halb geschafft. Übe die falschen nochmal.' : 'Das braucht noch Übung.';
  stage.replaceChildren(h('div.qcard.qresult', null,
    h('span.gresic', { style: { color: pct >= 70 ? '#2fbf71' : 'var(--accent)' } }, icon('trophy')),
    h('b.qbig', { text: `${right} von ${pick.length} richtig` }),
    h('small', { text: `${mood} · ${score} Punkte${rec ? ' · neuer Rekord' : ''}${earned ? ` · +${earned} ${earned === 1 ? 'Coin' : 'Coins'}` : ''}` }),
    wrong.length ? h('div.qwrong', null, h('p.fieldlabel', { text: 'Das solltest du wiederholen' }),
      ...wrong.map((Q) => h('div.qwrow', null, h('b', { text: Q.q }), h('span', { text: Q.a })))) : null,
    wrong.length ? h('p.calm.small', { text: 'Diese Karten kommen beim Lernen mit den Karteikarten gleich wieder dran.' }) : null,
    h('div.gresbtns', null,
      h('button.btn', { text: 'Fertig', on: { click: close } }),
      h('button.btn.primary', { text: 'Nochmal', on: { click: () => { close(); setTimeout(() => quizSolo({ deckIds, label }), 250); } } }))));
}

// ---------- Duell (für Games und Turnier) ----------
// Beide bekommen abwechselnd Fragen, gleich viele. Mehr Punkte gewinnt.
export async function quizDuel(fx, A, B) {
  let src = store.get('gQuiz', null);
  // Thema zeigen, ändern möglich
  for (;;) {
    const choice = await new Promise((resolve) => {
      fx.stage.replaceChildren(h('div.qcard.qstart', null,
        h('span.gresic', null, icon('cards')),
        h('b.qbig', { text: 'Quiz-Duell' }),
        h('small', { text: src ? `Thema: ${src.label}` : 'Noch kein Thema gewählt' }),
        h('p.calm.small', { text: 'Abwechselnd 5 Fragen für jeden. Richtig gibt 100 Punkte, schnell sein bis zu 100 extra.' }),
        h('div.gresbtns', null,
          h('button.btn', { text: src ? 'Thema ändern' : 'Thema wählen', on: { click: () => resolve('pick') } }),
          src ? h('button.btn.primary', { text: 'Start', on: { click: () => resolve('go') } }) : null)));
      fx.signal.addEventListener('abort', () => resolve(null));
    });
    if (!choice) return null;
    if (choice === 'go') break;
    const s = await pickSource({ okLabel: 'Übernehmen' });
    if (s) src = s;
  }
  const { cards } = await loadQuestions(src.deckIds);
  if (cards.length < 4) { toast('Für das Quiz braucht es mindestens 4 Karten.'); return null; }
  const N = 5;
  const pool = shuffle([...cards]);
  const sc = [0, 0], ok = [0, 0];
  const P = [A, B];
  const tags = () => h('div.gturns', null, ...P.map((p, k) => h('span.gturn' + (turn === k ? '.on' : ''), null, h('span.gdot', { style: { background: p.color } }), h('b', { text: p.name }), h('small', { text: `${sc[k]}` }))));
  let turn = 0;
  for (let i = 0; i < N * 2; i++) {
    if (fx.signal.aborted) return null;
    turn = i % 2;
    // kurze Übergabe: „Jetzt Lena“
    await new Promise((resolve) => {
      fx.stage.replaceChildren(h('div.qcard.qhand', null, tags(),
        h('small', { text: `Frage ${Math.floor(i / 2) + 1} von ${N}` }),
        h('b.qbig', { text: `${P[turn].name} ist dran` }),
        h('button.btn.primary', { text: 'Bereit', on: { click: resolve } })));
      fx.signal.addEventListener('abort', resolve);
    });
    if (fx.signal.aborted) return null;
    const Q = makeQ(pool[i % pool.length], cards);
    const r = await askQ(fx.stage, Q, { who: tags(), signal: fx.signal });
    if (r.ok) { sc[turn] += points(r); ok[turn]++; }
  }
  const w = sc[0] === sc[1] ? null : sc[0] > sc[1] ? 0 : 1;
  return { w, detail: `${sc[0]} zu ${sc[1]} Punkte · ${ok[0]} und ${ok[1]} von ${N} richtig` };
}
