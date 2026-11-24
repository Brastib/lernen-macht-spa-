// Lernkarten automatisch: Die App sucht auf Seiten (Scan-Text, Textfelder) wichtige Infos und schlägt Karten vor.
// Offline mit festen Regeln für deutsche Schultexte: Definitionen, Fachbegriffe, Aufzählungen, Jahreszahlen.
// Oder mit lokaler KI (js/localai.js): kleines Sprachmodell direkt auf dem Gerät, einmal herunterladen, dann offline.
// Vor dem Speichern kann man jede Karte prüfen und ändern.
import * as db from './db.js';
import { h, icon, toast, busy, sheet, confirmSheet } from './ui.js';

// ---------- Text vorbereiten ----------
// Silbentrennung am Zeilenende zusammenfügen, Leerzeichen säubern
export function cleanText(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/(\p{Ll})[-¬]\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

// Absätze → Sätze. Eine Zeile ohne Satzzeichen am Ende, auf die eine neue Zeile folgt, gilt als eigene Zeile (Überschrift, Stichpunkt).
const ABBR = /(?:\bz\.\s?B|\bu\.\s?a|\bd\.\s?h|\bbzw|\bca|\bvgl|\bNr|\bS|\bevtl|\busw|\betc|\bgeb|\bgest|\bJh|\bChr|\bv|\bn|\bDr|\bSt)\.$/;
export function sentences(text) {
  const out = [];
  for (const para of cleanText(text).split(/\n{2,}/)) {
    const lines = para.split('\n');
    let buf = '';
    lines.forEach((ln, i) => {
      const next = lines[i + 1];
      const isItem = /^\s*(?:[•·▪●◦○■□–—*-]|\d{1,2}[.)]|[a-h][.)])\s+/.test(ln);
      if (isItem || (/:$/.test(ln.trim()))) { if (buf) out.push(...splitSent(buf)); buf = ''; out.push(ln.trim()); return; }
      // Glossar-Zeile „Begriff – Erklärung“ ohne Punkt am Ende: eigene Zeile
      if (!buf && next != null && !/[.!?,;]$/.test(ln.trim()) && /^.{2,50}?\s(?:[–—=→-]|:)\s/.test(ln.trim()) && /^\p{Lu}/u.test(next.trim())) { out.push(ln.trim()); return; }
      buf += (buf ? ' ' : '') + ln.trim();
      // kurze Zeile ohne Satzende, nach der ein neuer Satz beginnt → Überschrift
      if (next != null && !/[.!?,;:]$/.test(ln.trim()) && ln.trim().split(' ').length <= 6 && /^\p{Lu}/u.test(next.trim()) && buf === ln.trim()) { out.push(buf); buf = ''; }
    });
    if (buf) out.push(...splitSent(buf));
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 2);
}
function splitSent(t) {
  const parts = [];
  let cur = '';
  const toks = t.split(/(?<=[.!?])\s+(?=[\p{Lu}„"\d])/u);
  for (const tk of toks) {
    cur += (cur ? ' ' : '') + tk;
    if (ABBR.test(cur) || /\b\d{1,2}\.$/.test(cur) && /^\p{Lu}\p{Ll}+/u.test(tk) === false) continue;
    parts.push(cur); cur = '';
  }
  if (cur) parts.push(cur);
  return parts;
}

const tidy = (t) => String(t || '').replace(/\s+/g, ' ').replace(/^[„"“»(\[\s]+|[”"“«)\],;:\s]+$/g, '').trim();
const words = (t) => tidy(t).split(' ').filter(Boolean);
const endDot = (t) => { t = tidy(t); return /[.!?]$/.test(t) ? t : t + '.'; };
const capFirst = (t) => t ? t[0].toUpperCase() + t.slice(1) : t;
// „Den Vorgang …“ → „den Vorgang …“ (mitten in der Frage)
const lowArt = (t) => t.replace(/^(Der|Die|Das|Den|Dem|Des|Ein|Eine|Einen|Einem|Einer|Eines)\b/, (a) => a.toLowerCase());

// Satzanfänge, die kein Begriff sind
const NOT_SUBJ = /^(?:es|das|dies|diese[rsmn]?|der|die|den|dem|er|sie|wir|ihr|ich|du|man|hier|dort|da|dann|so|nun|jetzt|auch|aber|und|oder|doch|wenn|weil|als|wie|was|wer|wo|heute|damals|außerdem|deshalb|daher|darum|trotzdem|allerdings|zum|zur|im|in|am|an|auf|bei|mit|nach|von|vor|seit|für|um|aus|ein|eine|einer|eines|jede[rsmn]?|alle|viele|manche|einige|sein|seine|ihre?|unser|kein|keine)$/i;
const ARTIKEL = /^(?:der|die|das|ein|eine)\s+/i;

// Begriff gültig? 1–5 Wörter, fängt groß an (oder Abkürzung/Formelzeichen), keine Ziffern-Wüste
function isTerm(t) {
  const w = words(t);
  if (!w.length || w.length > 5) return false;
  const head = w[0].replace(ARTIKEL, '');
  if (NOT_SUBJ.test(w[0]) && !(ARTIKEL.test(t) && w.length >= 2)) return false;
  if (!/^[\p{Lu}\d]/u.test(ARTIKEL.test(t) ? w[1] || '' : head)) return false;
  if (/[.!?]/.test(t.replace(/\b\p{L}\.(?=\p{L})/gu, ''))) return false;
  const letters = (t.match(/\p{L}/gu) || []).length;
  return letters >= 2 && letters / t.length > 0.55;
}
const termOk = (t) => tidy(t).length >= 2 && tidy(t).length <= 60 && isTerm(tidy(t));
const backOk = (t) => { const w = words(t); return w.length >= 2 && tidy(t).length <= 260; };

// Fragewort passend zum Begriff
function wasIst(term, verb) {
  const plural = /^(sind|werden|haben|bezeichnen|beschreiben|bedeuten)$/i.test(verb);
  return `Was ${plural ? 'sind' : 'ist'} ${term.replace(ARTIKEL, (a) => a.toLowerCase())}?`;
}

// ---------- Regeln ----------
// Jede Regel: Satz → Karte { front, back, kind, score } oder null
const RULES = [
  // „Unter X versteht man Y.“
  (s) => {
    const m = s.match(/^Unter (?:einem |einer |einem |dem |der |den )?(.{2,60}?) (?:versteht|verstehen) (?:man|wir|Fachleute|die Forscher)? ?(.{5,})$/i);
    if (!m || !termOk(m[1])) return null;
    return { front: `Was versteht man unter ${tidy(m[1])}?`, back: capFirst(tidy(m[2].replace(/^(?:man|wir)\s+/i, ''))), kind: 'def', score: 10 };
  },
  // „Y nennt man X.“ / „Y bezeichnet man als X.“ / „Y wird X genannt.“ / „Y heißt X.“
  (s) => {
    let m = s.match(/^(.{8,200}?),? (?:nennt man|bezeichnet man(?: auch)? als|wird (?:auch )?(?:als )?|werden (?:auch )?(?:als )?)(.{2,60}?)(?: (?:bezeichnet|genannt))?\.?$/i);
    if (m && /(?:nennt man|bezeichnet man)/i.test(s) || m && /(?:bezeichnet|genannt)\.?$/i.test(s)) {
      const term = tidy(m[2]);
      if (termOk(term) && backOk(m[1])) return { front: /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\b/i.test(tidy(m[1])) ? `Wie nennt man ${lowArt(tidy(m[1]))}?` : `Wie nennt man das: ${tidy(m[1])}?`, back: term, kind: 'name', score: 9 };
    }
    m = s.match(/^(.{8,200}?) (?:heißt|heißen) (.{2,50}?)\.?$/i);
    if (m && termOk(m[2]) && backOk(m[1]) && !/^(?:das|es)$/i.test(tidy(m[1]))) return { front: `Wie heißt das: ${tidy(m[1])}?`, back: tidy(m[2]), kind: 'name', score: 7 };
    return null;
  },
  // „X bezeichnet/beschreibt/bedeutet/meint Y.“
  (s) => {
    const m = s.match(/^(.{2,60}?) (bezeichnet|bezeichnen|beschreibt|beschreiben|bedeutet|bedeuten|meint|ist definiert als|sind definiert als|steht für) (.{5,})$/i);
    if (!m || !termOk(m[1])) return null;
    const v = m[2].toLowerCase();
    const front = /steht/.test(v) ? `Wofür steht ${tidy(m[1])}?` : /definiert/.test(v) ? wasIst(tidy(m[1]), /sind/.test(v) ? 'sind' : 'ist') : `Was ${v.split(' ')[0]} ${tidy(m[1]).replace(ARTIKEL, (a) => a.toLowerCase())}?`;
    return { front, back: capFirst(endDot(m[3])), kind: 'def', score: 8 };
  },
  // „X ist/sind ein/eine/der/die … Y.“ (Definition)
  (s) => {
    const m = s.match(/^(.{2,60}?) (ist|sind|war|waren) (eine?r?s?|der|die|das|ein|eine|einer|so genannte|sogenannte)\s+(.{4,})$/i);
    if (!m || !termOk(m[1])) return null;
    const back = `${m[3]} ${m[4]}`;
    if (!backOk(back)) return null;
    const verb = /sind|waren/i.test(m[2]) ? 'sind' : 'ist';
    const front = /war/i.test(m[2]) ? `Wer oder was ${m[2]} ${tidy(m[1])}?` : wasIst(tidy(m[1]), verb);
    return { front, back: capFirst(endDot(back)), kind: 'def', score: 6 };
  },
  // Glossar: „X: Y“, „X – Y“, „X = Y“
  (s) => {
    const m = s.match(/^(.{2,50}?)\s*(?:\s[–—-]\s|:\s|\s=\s|\s→\s)\s*(.{3,})$/);
    if (!m || !termOk(m[1]) || /^\d/.test(m[1])) return null;
    if (!backOk(m[2]) && words(m[2]).length < 1) return null;
    return { front: tidy(m[1]), back: tidy(m[2]), kind: 'pair', score: 6 };
  },
  // Jahreszahl → „Wann …?“ als Lückentext
  (s) => {
    const m = s.match(/\b(?:im Jahr(?:e)? |um |seit |ab |bis )?(1[0-9]{3}|20[0-4][0-9]|[1-9]\d{0,2} v\. ?Chr\.)\b/);
    if (!m || words(s).length < 5 || words(s).length > 40) return null;
    if (/\b(?:S\.|Seite|Nr\.|Abb\.|Aufgabe|M\d)\s*$/i.test(s.slice(0, m.index))) return null;
    const front = endDot(s.replace(m[1], '_____'));
    return { front, back: m[1], kind: 'year', score: 5 };
  },
];

// Aufzählungen: „Überschrift:“ + mindestens 2 Stichpunkte → „Nenne …“
function listCards(sents) {
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    const head = sents[i];
    if (!/:$/.test(head) || words(head).length > 12) continue;
    const items = [];
    for (let j = i + 1; j < sents.length && items.length < 10; j++) {
      const m = sents[j].match(/^\s*(?:[•·▪●◦○■□–—*-]|\d{1,2}[.)]|[a-h][.)])\s+(.+)$/);
      if (!m) break;
      items.push(tidy(m[1]));
    }
    if (items.length >= 2) out.push({ front: `Nenne: ${tidy(head)}`, back: items.map((x) => '• ' + x).join('\n'), kind: 'list', score: 8 });
  }
  return out;
}

// Lückentext als Notlösung: längstes Hauptwort (nicht am Satzanfang) im Satz ausblenden
function gapCard(s) {
  const w = words(s);
  if (w.length < 7 || w.length > 30) return null;
  let best = -1, bl = 0;
  w.forEach((x, i) => {
    const t = x.replace(/[^\p{L}-]/gu, '');
    if (i && /^\p{Lu}\p{Ll}/u.test(t) && t.length > bl && t.length >= 6) { best = i; bl = t.length; }
  });
  if (best < 0) return null;
  const word = w[best].replace(/[^\p{L}\p{N}-]/gu, '');
  return { front: endDot(s.replace(word, '_____')), back: word, kind: 'gap', score: 2 + Math.min(3, bl / 4) };
}

// Hauptfunktion: Text → Kartenvorschläge (beste zuerst)
export function extractCards(text, { max = 30 } = {}) {
  const sents = sentences(text);
  let cards = [...listCards(sents)];
  const covered = new Set();
  for (const s of sents) {
    if (s.length > 320) continue;
    let hit = null;
    for (const r of RULES) { hit = r(s); if (hit) break; }
    if (hit) { cards.push(hit); covered.add(s); }
  }
  // Wenig gefunden? Lückentexte aus wichtigen Sätzen (vorerst abgewählt)
  if (cards.length < 6) {
    const imp = sents.filter((s) => !covered.has(s) && /\b(?:wichtig|immer|stets|wird|werden|entsteht|besteht|bildet|führt|gilt|hat|haben)\b/i.test(s));
    for (const s of imp) { const g = gapCard(s); if (g) cards.push({ ...g, on: false }); if (cards.length >= 12) break; }
  }
  // Doppelte raus (gleiche Vorderseite oder gleicher Begriff)
  const seen = new Set();
  cards = cards.filter((c) => {
    const k = c.front.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
  cards.sort((a, b) => b.score - a.score);
  return cards.slice(0, max).map((c) => ({ front: c.front, back: c.back, kind: c.kind, on: c.on !== false }));
}

// ---------- Einstellungen der lokalen KI ----------
export async function aiSettingsSheet() {
  const ai = await import('./localai.js');
  const sup = await ai.aiSupport();
  return sheet('Lokale KI', async (body, close) => {
    if (!sup.ok) {
      body.append(h('p.dlgtext', { text: sup.why }), h('p.dlgtext', { text: 'Die Lernkarten ohne KI (feste Regeln) gehen trotzdem.' }), h('div.dlgactions', null, h('button.btn.primary', { text: 'OK', on: { click: () => close(false) } })));
      return;
    }
    const list = h('div.aclist');
    const fill = async () => {
      const cur = ai.aiChoice();
      const rows = [];
      for (const [k, m] of Object.entries(ai.MODELS)) {
        const have = await ai.isDownloaded(k);
        const row = h('div.acopt' + (k === cur ? '.on' : ''), null,
          h('button.acpick', { 'aria-pressed': String(k === cur), on: { click: () => { ai.setAiChoice(k); fill(); } } }, icon(k === cur ? 'select' : 'bolt'),
            h('span', null, h('b', { text: `${m.label} (${m.size})` }), h('small', { text: m.note + (have ? ' Heruntergeladen.' : ' Noch nicht heruntergeladen.') }))),
          ...(have ? [h('button.btn.small', { text: 'Löschen', on: { click: async () => {
            if (!(await confirmSheet('KI löschen?', `Das Modell „${m.label}“ wird vom Gerät gelöscht (${m.size} frei). Du kannst es später wieder laden.`))) return;
            await ai.unloadAi(); await ai.deleteModel(k); toast('KI gelöscht.'); fill();
          } } })] : []));
        rows.push(row);
      }
      list.replaceChildren(...rows);
    };
    await fill();
    // Bild-KI (liest Handschrift, macht Aufgaben)
    const V = await import('./visionai.js');
    const vbox = h('div.aclist');
    const vfill = async () => {
      const cur = V.visionChoice(), rows = [];
      for (const [k, m] of Object.entries(V.VCHOICES)) {
        const vh = await V.visionDownloaded(k), off = k === 'beste' && !sup.f16;
        rows.push(h('div.acopt' + (k === cur ? '.on' : ''), null,
          h('button.acpick', { 'aria-pressed': String(k === cur), disabled: off, on: { click: () => { V.setVisionChoice(k); vfill(); } } }, icon(k === cur ? 'select' : 'eye'),
            h('span', null, h('b', { text: `${m.label} (${m.size})` }), h('small', { text: off ? 'Geht auf diesem Gerät nicht (kein shader-f16).' : m.note + (vh ? ' Heruntergeladen.' : ' Lädt beim ersten Benutzen.') }))),
          ...(vh ? [h('button.btn.small', { text: 'Löschen', on: { click: async () => {
            if (!(await confirmSheet('Bild-KI löschen?', 'Alle Stufen der Bild-KI werden vom Gerät gelöscht. Du kannst sie später wieder laden.'))) return;
            await V.deleteVision(); toast('Bild-KI gelöscht.'); vfill();
          } } })] : [])));
      }
      vbox.replaceChildren(...rows);
    };
    await vfill();
    const used = await ai.storageInfo();
    body.append(
      h('p.dlgtext', { text: 'Die KI läuft direkt auf deinem Gerät. Einmal herunterladen (am besten im WLAN), danach geht sie ohne Internet und kostet nichts. Deine Seiten verlassen das Gerät nicht.' }),
      h('label.fieldlabel', { text: 'Text-KI (Lernkarten, Big Boy)' }),
      list,
      h('label.fieldlabel', { text: 'Bild-KI' }),
      vbox,
      h('p.dlgtext', { text: 'Kleine KIs irren sich manchmal. Darum prüfst du die Karten immer vor dem Speichern.' + (used ? ` Die App belegt gerade ${used}.` : '') }),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'Fertig', on: { click: () => close(true) } })));
  });
}

// ---------- Ablauf ----------
function pageText(p) { return [p.ocr, p.textBoxes, p.aiText || p.ink].filter(Boolean).join('\n\n'); }

// pages: Seiten (Buch, Heft, Mappe). title: für die Anzeige.
export async function autoCardsFlow(pages, { title = '' } = {}) {
  pages = (pages || []).filter(Boolean);
  if (!pages.length) { toast('Keine Seiten ausgewählt.'); return; }
  if (pages.length > 40) { toast('Höchstens 40 Seiten auf einmal. Tipp auf „Auswählen“ und markiere weniger Seiten.', 5000); return; }

  const ai = await import('./localai.js');
  const sup = await ai.aiSupport();
  const have = sup.ok && await ai.isDownloaded();
  const m = ai.MODELS[ai.aiChoice()] || ai.MODELS.klein;
  const hasBlank = pages.some((p) => p.kind === 'blank');

  const choice = await sheet('Lernkarten automatisch', (body, close) => {
    const opt = (key, ic, b, small, dis = false) => h('button.acopt' + (dis ? '.off' : ''), { disabled: dis, on: { click: () => close(key) } }, icon(ic), h('span', null, h('b', { text: b }), h('small', { text: small })));
    body.append(
      h('p.dlgtext', { text: `${pages.length === 1 ? 'Diese Seite' : pages.length + ' Seiten'}${title ? ' aus „' + title + '“' : ''}: Die App sucht die wichtigen Infos und macht Karten daraus. Du prüfst sie, bevor sie gespeichert werden.` + (hasBlank ? ' Handschrift liest am besten die Bild-KI (KI-Einstellungen), sonst nur unsicher.' : '') }),
      h('div.aclist', null,
        sup.ok
          ? opt('ai', 'bolt', have ? `Mit lokaler KI (${m.label})` : `Lokale KI herunterladen (${m.size})`, have ? 'Versteht den Text und findet mehr. Läuft auf dem Gerät, offline, kostenlos. Dauert etwas.' : 'Einmalig, am besten im WLAN. Danach offline und kostenlos.', !have && navigator.onLine === false)
          : opt('nogpu', 'bolt', 'Lokale KI geht hier nicht', sup.why, true),
        opt('rules', 'cards', 'Schnell ohne KI', 'Feste Regeln: Definitionen, Fachbegriffe, Aufzählungen, Jahreszahlen. Sofort fertig.')),
      h('div.dlgactions', null,
        ...(sup.ok ? [h('button.btn', { text: 'KI-Einstellungen', on: { click: () => close('settings') } })] : []),
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } })));
  });
  if (!choice || choice === 'nogpu') return;
  if (choice === 'settings') { await aiSettingsSheet(); return autoCardsFlow(pages, { title }); }

  // Text besorgen (Texterkennung für Scans ohne Text)
  const todo = pages.filter((p) => p.kind !== 'blank' && p.ocr == null);
  if (todo.length) {
    busy(true, 'Text wird erkannt …');
    try { const { ocrPages } = await import('./ocr.js'); await ocrPages(todo, (t) => { const b = document.getElementById('busyText'); if (b) b.textContent = t; }); }
    catch (err) { busy(false); toast('Texterkennung fehlgeschlagen: ' + err.message, 5000); return; }
    busy(false);
  }
  // Handschrift: wenn die Bild-KI da ist, liest sie Seiten mit Stift-Strichen (höchstens 10)
  if (choice === 'ai') {
    const V = await import('./visionai.js');
    const hw = pages.filter((p) => (p.kind === 'blank' || p.strokes) && !p.aiText).slice(0, 10);
    if (hw.length && await V.visionDownloaded()) {
      busy(true, 'Handschrift wird gelesen …');
      try {
        for (let i = 0; i < hw.length; i++) {
          const t = await V.readPage(await V.pageImage(hw[i]), (x) => { const b = document.getElementById('busyText'); if (b) b.textContent = `Seite ${i + 1}/${hw.length}: ${x}`; });
          hw[i].aiText = t;
          if (!hw[i].id.startsWith('tmp')) await db.updatePage(hw[i].id, { aiText: t, aiAt: Date.now() });
        }
      } catch (err) { toast('Handschrift lesen hat nicht geklappt: ' + err.message, 5000); }
      await V.unloadVision();
      busy(false);
    }
  }
  const text = pages.map(pageText).filter((t) => t.trim()).join('\n\n');
  if (!text.trim()) { toast(hasBlank ? 'Auf den Seiten wurde kein Text gefunden. Handschrift erkennt die App nur schlecht. Getippte Textfelder gehen.' : 'Auf den Seiten wurde kein Text gefunden.', 6000); return; }

  let items, used = choice;
  if (choice === 'ai') {
    let stop = false;
    busy(true, have ? 'KI wird gestartet …' : 'KI wird heruntergeladen …');
    const b = document.getElementById('busyText');
    try {
      const res = await ai.aiCards(text, (t) => { if (b) b.textContent = t; }, () => stop);
      items = res.map((c) => ({ ...c, kind: 'ki', on: true }));
    } catch (err) {
      busy(false);
      await ai.unloadAi();
      used = 'rules';
      const net = /fetch|network|load failed/i.test(err.message || '');
      const mem = /memory|OOM|allocation|device lost|lost/i.test(err.message || '');
      toast((mem ? 'Für die KI reicht der Arbeitsspeicher nicht. Nimm in den KI-Einstellungen „Schnell“. ' : net && !have ? 'Die KI ließ sich nicht herunterladen. Bist du im Internet? ' : 'Die KI hat nicht geklappt (' + err.message + '). ') + 'Ich nehme die Regeln ohne KI.', 7000);
      items = extractCards(text);
    }
    busy(false);
    await ai.unloadAi();   // Arbeitsspeicher wieder freigeben
    // Regeln ergänzen, was die KI übersehen hat (abgewählt)
    if (used === 'ai') {
      const seen = new Set(items.map((c) => c.back.toLowerCase()));
      for (const c of extractCards(text, { max: 12 })) if (!seen.has(c.back.toLowerCase())) items.push({ ...c, on: false });
    }
  } else items = extractCards(text);

  if (!items.length) { toast('Keine klaren Infos gefunden. Tipp: Wichtiges mit dem Textmarker markieren und „Lernkarten aus Markiertem“ nehmen.', 6000); return; }
  const { reviewSheet } = await import('./markcards.js');
  await reviewSheet(items, pages[0], {
    title: used === 'ai' ? 'Karten von der KI' : 'Gefundene Karten',
    hint: used === 'ai' ? 'Die KI kann sich irren. Prüf die Karten, bevor du sie speicherst. Abgewählte Karten kommen von den Regeln dazu.' : 'Automatisch gefunden. Prüf die Karten kurz, ändere oder wähle Unpassendes ab.',
    deckName: title,
  });
}
