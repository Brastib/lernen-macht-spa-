// Paket 7 (Teil 1): Galgenmännchen mit eigenen Wörtern oder Lernkarten.
// Allein: so viele Wörter am Stück wie möglich. Zu zweit: abwechselnd raten, wer mehr schafft.
import { h, icon, sheet, toast } from './ui.js';
import { FONT, isDark, inkOf, paper, pline, pcirc, canvasBox, chip, turnCard, store } from './sketch.js';

const ROWS = ['QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNMß'];
const KEYSET = new Set(ROWS.join(''));
const MAXF = 10;
const APPWORDS = ('Abenteuer Ameise Ananas Apfelbaum Astronaut Aquarium Bahnhof Ballon Banane Bauernhof Bibliothek Bleistift Blumenkohl Brille Brücke Buchstabe Burg Computer Delfin Dinosaurier Drache Eichhörnchen Eisbär Elefant Erdbeere Fahrrad Fallschirm Fernglas Feuerwehr Flugzeug Fußball Gespenst Giraffe Gitarre Glühbirne Gurke Hausaufgabe Hubschrauber Igel Insel Jacke Kaktus Känguru Kartoffel Kastanie Klassenarbeit Klavier Kompass Krokodil Kuchen Labyrinth Laterne Leuchtturm Lineal Löwenzahn Marmelade Mathematik Mikroskop Mondrakete Nashorn Nilpferd Notizbuch Orange Papagei Papierflieger Pinguin Pizza Planet Pommes Pyramide Radiergummi Rakete Regenbogen Regenschirm Ritter Roboter Rucksack Schatzkarte Schaukel Schildkröte Schmetterling Schneemann Schokolade Schule Schwimmbad Seepferdchen Sonnenbrille Spaghetti Spinne Stundenplan Taschenlampe Taschenrechner Telefon Tintenfisch Tomate Trampolin Traktor Uhr Universum Vampir Vulkan Wal Wasserfall Wassermelone Weltkugel Wikinger Windmühle Wolke Würfel Zahnbürste Zauberer Zebra Zirkel Zitrone Zoo Zug').split(' ');

const wait = (ms, sig) => new Promise((r) => { const t = setTimeout(r, ms); sig.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Taste für einen Buchstaben (é → E, ß bleibt ß). null = kein Buchstabe (wird gleich gezeigt)
function keyOf(ch) {
  if (ch === 'ß' || ch === 'ẞ') return 'ß';
  const u = ch.toUpperCase(); if (KEYSET.has(u)) return u;
  const b = u.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return b.length === 1 && KEYSET.has(b) ? b : null;
}
const clean = (w) => String(w || '').replace(/\s+/g, ' ').trim();
const usable = (w) => { const s = clean(w); return s.length >= 2 && s.length <= 30 && [...s].filter((c) => keyOf(c)).length >= 2; };

// ---------- eigene Wortliste ----------
const myWords = () => (store.get('gHangWords', []) || []).filter(usable);
function editWords() {
  return sheet('Meine Wortliste', (body, close) => {
    const ta = h('textarea.hgta', { rows: 10, placeholder: 'Ein Wort pro Zeile, zum Beispiel:\nPhotosynthese\nMittelalter\nParallelogramm' });
    ta.value = myWords().join('\n');
    const n = h('small.hgcount');
    const upd = () => { const list = ta.value.split('\n').filter(usable); n.textContent = `${list.length} ${list.length === 1 ? 'Wort' : 'Wörter'}`; };
    ta.addEventListener('input', upd); upd();
    body.append(h('p.dlgtext', { text: 'Schreib ein Wort (oder kurze Wörter mit Leerzeichen) pro Zeile. Gut für Fachbegriffe vor einer Arbeit.' }), ta, n,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: 'Sichern', on: { click: () => { const list = [...new Set(ta.value.split('\n').map(clean).filter(usable))]; store.set('gHangWords', list); close(list); } } })));
  });
}
async function cardWords() {
  const { pickSource } = await import('./quiz.js');
  const src = await pickSource({ title: 'Galgenmännchen: Welche Lernkarten?', okLabel: 'Los', min: 1, key: 'gHangDecks', text: 'Geraten wird die Rückseite der Karte. Die Vorderseite steht als Tipp dabei.' });
  if (!src) return null;
  const db = await import('./db.js'), out = [];
  for (const id of src.deckIds) for (const c of await db.listCards(id)) if (c.front && usable(c.back)) out.push({ word: clean(c.back), hint: clean(c.front).slice(0, 80) });
  if (!out.length) { toast('In diesen Karten gibt es keine passenden Wörter (Rückseite 2 bis 30 Zeichen).', 4500); return null; }
  return out;
}

// ---------- Woher kommen die Wörter? ----------
function pickSrc(fx, duel) {
  return new Promise((resolve) => {
    let busy = false;
    const go = async (kind) => {
      if (busy) return; busy = true;
      let pool = null;
      if (kind === 'app') pool = APPWORDS.map((w) => ({ word: w }));
      else if (kind === 'self') pool = [];
      else if (kind === 'list') { let l = myWords(); if (l.length < 1) l = (await editWords()) || []; if (l.length) pool = l.map((w) => ({ word: w })); else toast('Die Liste ist noch leer.'); }
      else if (kind === 'cards') pool = await cardWords();
      busy = false;
      if (fx.signal.aborted) return resolve(null);
      if (pool) { store.set('gHangSrc', kind); resolve({ kind, pool: shuffle(pool) }); }
      else draw();
    };
    const last = store.get('gHangSrc', 'app');
    const opt = (kind, ic, title, text, extra) => h('div.hgsrc' + (kind === last ? '.on' : ''), null,
      h('button.hgsrcbtn', { on: { click: () => go(kind) } }, h('span.ptileic', null, icon(ic)), h('span.hgsrctx', null, h('b', { text: title }), h('small', { text }))), extra || null);
    const draw = () => {
      const n = myWords().length;
      fx.stage.replaceChildren(h('div.hgpick', null,
        h('h3', { text: 'Woher kommen die Wörter?' }),
        opt('app', 'book', 'Wörter der App', 'Gemischte Wörter zum Raten.'),
        opt('list', 'pen', 'Meine Wortliste', n ? `${n} ${n === 1 ? 'Wort' : 'Wörter'}, zum Beispiel Fachbegriffe.` : 'Noch leer. Schreib eigene Wörter auf.',
          h('button.btn.hgedit', { text: 'Liste bearbeiten', on: { click: async () => { await editWords(); draw(); } } })),
        opt('cards', 'cards', 'Aus Lernkarten', 'Rate die Rückseite, die Vorderseite ist der Tipp.'),
        duel ? opt('self', 'eye', 'Selbst ausdenken', 'Der andere tippt geheim ein Wort ein.') : null));
    };
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
    draw();
  });
}

// ---------- Zeichnung ----------
// Teile in Einheiten (100 breit, 120 hoch)
function drawGallows(x, X, Y, k, dark, n, fresh, lost, won) {
  const ink = inkOf(dark);
  const P = (a, b) => [X + a * k, Y + b * k];
  const L = (a, b, c, d, seed) => { const [p, q] = P(a, b), [r, s] = P(c, d); pline(x, p, q, r, s, seed, 0.9); };
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  for (let i = 0; i < MAXF; i++) {
    x.globalAlpha = i >= n ? (lost || won ? 0 : dark ? 0.09 : 0.07) : i === n - 1 ? Math.min(1, fresh) : 1;   // noch fehlende Teile ganz blass
    if (!x.globalAlpha) continue;
    x.strokeStyle = ink; x.lineWidth = Math.max(2.5, k * (i < 5 ? 2.6 : 2.2));
    if (i === 0) {   // Hügel mit Gras
      const [a, b] = P(4, 116), [c, d] = P(96, 116), [m1, m2] = P(50, 100);
      x.fillStyle = dark ? 'rgba(90,200,120,.16)' : 'rgba(80,180,100,.18)'; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(m1, m2, c, d); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(m1, m2, c, d); x.stroke();
      x.lineWidth = Math.max(1.4, k * 1); for (let g = 0; g < 7; g++) { const gx = 14 + g * 12, gy = 116 - 13 * Math.sin(Math.PI * (gx - 4) / 92); L(gx, gy, gx - 2, gy - 4, g); L(gx, gy, gx + 2, gy - 5, g + 9); }
    } else if (i === 1) L(26, 110, 26, 10, 11);
    else if (i === 2) L(20, 12, 74, 12, 12);
    else if (i === 3) L(26, 32, 46, 12, 13);
    else if (i === 4) { x.lineWidth = Math.max(1.6, k * 1.3); L(68, 12, 68, 30, 14); }
    else if (i === 5) {
      const [cx, cy] = P(68, 39); pcirc(x, cx, cy, 9 * k, 15, 0.08); x.stroke();
      x.fillStyle = ink;
      if (lost) { x.lineWidth = Math.max(1.4, k); [-3.5, 3.5].forEach((dx) => { L(68 + dx - 1.6, 36.4, 68 + dx + 1.6, 39.6, 30); L(68 + dx + 1.6, 36.4, 68 + dx - 1.6, 39.6, 31); }); }
      else { [-3.5, 3.5].forEach((dx) => { x.beginPath(); x.arc(cx + dx * k, cy - 1.5 * k, Math.max(1.2, k * 1.1), 0, 7); x.fill(); }); }
      x.lineWidth = Math.max(1.3, k * 0.9); x.beginPath();
      if (won) x.arc(cx, cy + 1.5 * k, 3.6 * k, 0.2, Math.PI - 0.2); else x.arc(cx, cy + 6.2 * k, 3.2 * k, Math.PI + 0.35, -0.35);
      x.stroke();
    } else if (i === 6) L(68, 48, 68, 78, 16);
    else if (i === 7) { L(68, 56, 56, 68, 17); L(68, 56, 80, 68, 18); }
    else if (i === 8) L(68, 78, 58, 98, 19);
    else if (i === 9) L(68, 78, 78, 98, 20);
  }
  x.restore();
}

// ---------- eine Runde raten ----------
function guessWord(fx, p, { word, hint, stats }) {
  return new Promise((resolve) => {
    const dark = isDark(), ink = inkOf(dark);
    const chars = [...word], need = new Set(chars.map(keyOf).filter(Boolean));
    const hit = new Set(), miss = [];
    let fresh = 1, raf = 0, over = false, won = false, t0 = 0;
    const statEls = {};
    const stat = (k, label, v) => { const b = h('b', { text: String(v) }); statEls[k] = b; return h('span.hsstat', null, h('small', { text: label }), b); };
    const hud = h('div.hshud', null, chip(p), h('div.hsstats', null, stat('f', 'Fehler', `0 / ${MAXF}`), ...(stats || []).map(([k, l, v]) => stat(k, l, v))));
    const hintEl = h('p.hshint.hghint', { text: hint ? `Tipp: ${hint}` : 'Tippe Buchstaben an oder nutze die Tastatur.' });
    const host = h('div.hgboard');
    const keyBtns = new Map();
    const keys = h('div.hgkeys', null, ...ROWS.map((row) => h('div.hgrow', null, ...[...row].map((ch) => { const b = h('button.hgkey', { text: ch, on: { click: () => press(ch) } }); keyBtns.set(ch, b); return b; }))));
    const res = h('div.hgres');
    const wrap = h('div.hswrap.hgwrap', null, hud, hintEl, host, keys, res);
    fx.stage.replaceChildren(wrap);
    const C = canvasBox(host);
    function draw() {
      const x = C.begin(), cw = C.cw, ch = C.ch;
      paper(x, cw, ch, dark);
      const wide = cw > ch * 1.25;
      const gw = wide ? cw * 0.42 : cw, gh = wide ? ch : ch * 0.64;
      const k = Math.max(0.3, Math.min((gw - 24) / 100, (gh - 16) / 120)), gx = (gw - 100 * k) / 2, gy = (gh - 120 * k) / 2;
      drawGallows(x, gx, gy, k, dark, miss.length, fresh, over && !won, over && won);
      // Wort
      const ax = wide ? gw : 12, aw = wide ? cw - gw - 16 : cw - 24, ay = wide ? ch * 0.45 : gh + (ch - gh) * 0.42;
      const words = word.split(' ');
      const lines = words.length > 1 && aw / ([...word].length * 0.82) < 30 ? words : [word];
      const maxLen = Math.max(...lines.map((l) => [...l].length));
      const fs = Math.max(16, Math.min(54, aw / (maxLen * 0.82), (wide ? ch * 0.5 : (ch - gh) * 0.5) / lines.length));
      const sw = fs * 0.82;
      x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.font = `700 ${Math.round(fs)}px ${FONT}`;
      lines.forEach((ln, li) => {
        const cs = [...ln], y = ay + (li - (lines.length - 1) / 2) * fs * 1.45, x0 = ax + aw / 2 - (cs.length * sw) / 2;
        cs.forEach((c, i) => {
          const kk = keyOf(c), cx = x0 + (i + 0.5) * sw;
          if (kk) { x.strokeStyle = ink; x.lineWidth = 2; pline(x, cx - sw * 0.36, y + fs * 0.16, cx + sw * 0.36, y + fs * 0.16, i * 7 + li, 0.5); }
          const show = !kk || hit.has(kk) || over;
          if (!show) return;
          x.fillStyle = !kk || hit.has(kk) ? (kk ? p.color : ink) : '#e0483e';
          x.fillText(c, cx, y);
        });
      });
      // falsche Buchstaben
      if (miss.length) {
        const fy = wide ? ch * 0.45 + fs * lines.length * 0.9 + 30 : ch - 16;
        x.font = `700 ${Math.round(Math.max(15, Math.min(24, fs * 0.5)))}px ${FONT}`; x.fillStyle = '#e0483e'; x.textBaseline = 'middle';
        x.fillText(miss.join('  '), ax + aw / 2, Math.min(ch - 16, fy), aw);
      }
    }
    function loop(t) {
      if (!t0) t0 = t; fresh = Math.min(1, (t - t0) / 380); draw();
      if (fresh < 1) raf = requestAnimationFrame(loop); else raf = 0;
    }
    const anim = () => { cancelAnimationFrame(raf); t0 = 0; fresh = 0; raf = requestAnimationFrame(loop); };
    function press(chr) {
      if (over || hit.has(chr) || miss.includes(chr)) return;
      const b = keyBtns.get(chr);
      if (need.has(chr)) { hit.add(chr); b.classList.add('hit'); } else { miss.push(chr); b.classList.add('miss'); anim(); }
      b.disabled = true;
      statEls.f.textContent = `${miss.length} / ${MAXF}`;
      if ([...need].every((c) => hit.has(c))) end(true);
      else if (miss.length >= MAXF) end(false);
      draw();
    }
    function end(ok) {
      over = true; won = ok;
      keyBtns.forEach((b) => { b.disabled = true; });
      keys.classList.add('done');
      res.replaceChildren(h('div.hgresbox' + (ok ? '.ok' : '.bad'), null,
        h('span', null, icon(ok ? 'check' : 'close')),
        h('span.hgrestx', { text: ok ? `Geschafft! ${miss.length} ${miss.length === 1 ? 'Fehler' : 'Fehler'}.` : `Leider nicht. Das Wort war: ${word}` }),
        h('button.btn.primary', { text: 'Weiter', on: { click: () => finish({ ok, miss: miss.length }) } })));
      res.classList.add('on');
      draw();
    }
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (over && e.key === 'Enter') { e.preventDefault(); res.querySelector('button')?.click(); return; }
      const k = e.key && e.key.length === 1 ? keyOf(e.key) : null; if (!k) return;
      e.preventDefault(); press(k);
    };
    document.addEventListener('keydown', onKey);
    const ro = new ResizeObserver(() => requestAnimationFrame(draw)); ro.observe(C.box);
    const finish = (v) => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); ro.disconnect(); C.ro.disconnect(); resolve(v); };
    fx.signal.addEventListener('abort', () => finish(null), { once: true });
    draw();
  });
}

// Geheimes Wort eintippen (Spieler denkt sich eins aus)
function secretWord(fx, setter, guesser) {
  return new Promise((resolve) => {
    const inp = h('input.input.hgsecret', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, maxLength: 30, placeholder: 'Geheimes Wort' });
    const tip = h('input.input', { type: 'text', autocomplete: 'off', maxLength: 60, placeholder: 'Tipp (freiwillig), zum Beispiel: Tier' });
    const show = h('button.btn', { text: 'Zeigen', on: { click: () => { inp.classList.toggle('shown'); show.textContent = inp.classList.contains('shown') ? 'Verstecken' : 'Zeigen'; } } });
    const msg = h('small.hgcount');
    const ok = () => { const w = clean(inp.value); if (!usable(w)) { msg.textContent = 'Bitte ein Wort mit mindestens 2 Buchstaben (höchstens 30 Zeichen).'; return; } resolve({ word: w, hint: clean(tip.value) }); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tip.focus(); } });
    tip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    fx.stage.replaceChildren(h('div.hgpick', null,
      h('div.hshud', null, chip(setter, h('small', { text: 'denkt sich ein Wort aus' }))),
      h('p.dlgtext', { text: `${guesser.name} schaut weg. Das Wort wird versteckt angezeigt.` }),
      h('div.hgsecrow', null, inp, show), tip, msg,
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: ok } }))));
    fx.signal.addEventListener('abort', () => resolve(null), { once: true });
    setTimeout(() => inp.focus(), 80);
  });
}

export function hangman(fx, A, B, o = {}) {
  return (async () => {
    const src = await pickSrc(fx, !!B);
    if (!src) return null;
    let idx = 0;
    const next = () => { if (idx >= src.pool.length) { shuffle(src.pool); idx = 0; } return src.pool[idx++]; };
    if (!B) {   // allein: Wörter am Stück
      const best = store.get('gHangBest', 0);
      let n = 0;
      for (;;) {
        const w = next();
        const r = await guessWord(fx, A, { ...w, stats: [['n', 'Geschafft', n], ['b', 'Rekord', best || '–']] });
        if (!r || fx.signal.aborted) return null;
        if (!r.ok) return { score: n };
        n++;
      }
    }
    // zu zweit: jeder rät 2 Wörter
    const P = [A, B].map((p) => ({ p, ok: 0, miss: 0 }));
    const ROUNDS = 4;
    for (let r = 0; r < ROUNDS; r++) {
      const gi = r % 2, g = P[gi], s = P[1 - gi];
      let w;
      if (src.kind === 'self') {
        const ok1 = await turnCard(fx, s.p, `${s.p.name} denkt sich ein Wort aus`, `${g.p.name} schaut bitte weg!`, 'Ich bin bereit', 'eye');
        if (!ok1 || fx.signal.aborted) return null;
        w = await secretWord(fx, s.p, g.p); if (!w || fx.signal.aborted) return null;
      } else w = next();
      const ok2 = await turnCard(fx, g.p, `${g.p.name} rät`, `Wort ${Math.floor(r / 2) + 1} von 2. Stand: ${P[0].p.name} ${P[0].ok}, ${P[1].p.name} ${P[1].ok}`, 'Los geht’s', 'pen');
      if (!ok2 || fx.signal.aborted) return null;
      const res = await guessWord(fx, g.p, { ...w, stats: [['n', 'Geschafft', g.ok], ['r', 'Wort', `${Math.floor(r / 2) + 1} / 2`]] });
      if (!res || fx.signal.aborted) return null;
      if (res.ok) g.ok++;
      g.miss += res.miss;
    }
    const [a, b] = P;
    const w = a.ok !== b.ok ? (a.ok > b.ok ? 0 : 1) : a.miss !== b.miss ? (a.miss < b.miss ? 0 : 1) : null;
    const t = (q) => `${q.p.name}: ${q.ok} ${q.ok === 1 ? 'Wort' : 'Wörter'}, ${q.miss} Fehler`;
    return { w, detail: `${t(a)} · ${t(b)}` };
  })();
}
