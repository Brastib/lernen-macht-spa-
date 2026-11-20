// Vorlesen und Diktieren (Web Speech).
// Vorlesen läuft mit den Stimmen des iPads, auch offline. Diktieren nutzt die Spracherkennung des Browsers:
// Safari schickt die Sprache dafür an Apple, es braucht also Internet. Ohne Erkennung bleibt das Mikrofon der Tastatur.
import { h, icon, toast, sheet } from './ui.js';

export const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const Rec = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canDictate = () => !!Rec();

const ABBR = /^(z|B|d|h|u|a|S|Nr|bzw|ca|vgl|usw|etc|Dr|Hr|Fr|St|Abb|Kap|Aufg|bspw|evtl|ggf|inkl|Mio|Mrd)\.$/i;
// Text in Sätze teilen (Abkürzungen wie „z. B.“, „S. 12“ und Zahlen wie „3.5“ nicht trennen)
export function sentences(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/-\n(?=[a-zäöü])/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  for (const para of clean.split(/\n{2,}|\n(?=[A-ZÄÖÜ0-9•\-–])/)) {
    const p = para.replace(/\n/g, ' ').trim();
    if (!p) continue;
    let start = 0;
    const re = /[.!?…]+["“”»)]*\s+/g;
    let m;
    while ((m = re.exec(p))) {
      const end = m.index + m[0].length;
      const prev = (p.slice(0, m.index).match(/(\S+)$/) || [''])[0] + '.';
      const next = p.charAt(end);
      if (/^\.+["“”»)]*\s+$/.test(m[0]) && (ABBR.test(prev) || /^[A-Za-zÄÖÜäöü]\.$/.test(prev) || /^\d{1,2}\.$/.test(prev) || (/^\d+\.$/.test(prev) && /[a-zäöü0-9]/.test(next)))) continue;
      out.push(p.slice(start, end).trim()); start = end;
    }
    if (start < p.length) out.push(p.slice(start).trim());
  }
  return out.filter(Boolean);
}

// Beste Stimme für die Sprache: lokale, „erweiterte“ Stimmen bevorzugen
function pickVoice(lang) {
  const vs = speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  const cand = vs.filter((v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(base));
  if (!cand.length) return null;
  const score = (v) => (v.lang.replace('_', '-') === lang ? 4 : 0) + (/premium|enhanced|erweitert|natural|neural/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0) + (/anna|helena|petra|markus|yannick/i.test(v.name) ? 1 : 0);
  return cand.sort((a, b) => score(b) - score(a))[0];
}
const voicesReady = () => new Promise((res) => {
  if (speechSynthesis.getVoices().length) { res(); return; }
  const t = setTimeout(res, 1200);
  speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true });
});

const RATE_KEY = 'speakRate', BIG_KEY = 'speakBig';
const getLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } };

// ---------- Vorlesen ----------
export async function readAloud(text, { title = 'Vorlesen', lang = 'de-DE', emptyHint } = {}) {
  if (!canSpeak()) { toast('Vorlesen geht in diesem Browser nicht'); return; }
  const list = sentences(text);
  await voicesReady();
  const voice = pickVoice(lang);
  let i = 0, playing = false, token = 0, rate = +getLS(RATE_KEY, '1');
  await sheet(title, (body, close) => {
    if (!list.length) {
      body.append(h('p.dlgtext', { text: emptyHint || 'Hier gibt es keinen Text zum Vorlesen.' }),
        h('div.dlgactions', null, h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } })));
      return;
    }
    const box = h('div.rdtext' + (getLS(BIG_KEY, '0') === '1' ? '.big' : ''));
    const spans = list.map((s, k) => h('span.rds', { text: s + ' ', on: { click: () => { i = k; play(); } } }));
    box.append(...spans);
    const playBtn = h('button.rdplay', { 'aria-label': 'Abspielen' }, icon('play'));
    const mark = () => {
      spans.forEach((s, k) => { s.classList.toggle('on', k === i && playing); s.classList.toggle('read', k < i); });
      playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Abspielen');
      pos.textContent = `${Math.min(i + 1, list.length)} / ${list.length}`;
      const s = spans[i];
      if (s && playing) {
        const br = box.getBoundingClientRect(), sr = s.getBoundingClientRect();
        if (sr.top < br.top + 8 || sr.bottom > br.bottom - 8) box.scrollTo({ top: box.scrollTop + sr.top - br.top - br.height / 3, behavior: 'smooth' });
      }
    };
    const speakOne = () => {
      const my = ++token;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(list[i]);
      u.lang = lang; u.rate = rate; if (voice) u.voice = voice;
      u.onend = () => { if (my !== token || !playing) return; if (i < list.length - 1) { i++; mark(); speakOne(); } else { playing = false; i = 0; mark(); } };
      u.onerror = (e) => { if (my !== token) return; if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') { playing = false; mark(); toast('Vorlesen wurde unterbrochen'); } };
      speechSynthesis.speak(u);
    };
    // Pause = anhalten und am Satzanfang weitermachen (pause() ist auf dem iPad unzuverlässig)
    const play = () => { playing = true; mark(); speakOne(); };
    const stop = () => { playing = false; token++; speechSynthesis.cancel(); mark(); };
    playBtn.addEventListener('click', () => (playing ? stop() : play()));
    const step = (d) => { i = Math.max(0, Math.min(list.length - 1, i + d)); if (playing) play(); else mark(); };
    const pos = h('span.rdpos');
    const seg = h('div.seg.rdrate');
    for (const [v, l] of [[0.7, 'Langsam'], [0.85, 'Ruhig'], [1, 'Normal'], [1.2, 'Schnell']]) {
      const b = h('button' + (rate === v ? '.on' : ''), { text: l, on: { click: () => { rate = v; setLS(RATE_KEY, String(v)); seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); if (playing) play(); } } });
      seg.append(b);
    }
    const big = h('button.btn.round.rdbig' + (box.classList.contains('big') ? '.on' : ''), { 'aria-label': 'Große Schrift', title: 'Große Schrift', on: { click: () => { box.classList.toggle('big'); big.classList.toggle('on'); setLS(BIG_KEY, box.classList.contains('big') ? '1' : '0'); } } }, h('span', { text: 'A' }), h('small', { text: 'A' }));
    body.append(box,
      h('div.rdbar', null,
        h('button.btn.round', { 'aria-label': 'Satz zurück', on: { click: () => step(-1) } }, icon('left')),
        playBtn,
        h('button.btn.round', { 'aria-label': 'Nächster Satz', on: { click: () => step(1) } }, icon('right')),
        pos, h('span.rdgap'), seg),
      h('div.rdfoot', null, h('p.calm.small', { text: voice ? `Stimme: ${voice.name}. Tippe auf einen Satz, um dort weiterzulesen.` : 'Tippe auf einen Satz, um dort weiterzulesen.' }), big));
    mark();
    // Beim Schließen sofort still sein
    const obs = new MutationObserver(() => { if (!body.isConnected) { stop(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    play();
  }, { wide: true });
  token++;
  try { speechSynthesis.cancel(); } catch (e) { /* egal */ }
}

// ---------- Diktieren ----------
// Gesprochene Satzzeichen umsetzen
export function spokenPunct(t, prev = '') {
  let s = ' ' + t + ' ';
  s = s
    .replace(/\s+(neue|nächste) Zeile\s+/gi, '\n')
    .replace(/\s+(neuer )?Absatz\s+/gi, '\n\n')
    .replace(/\s+Fragezeichen(?=\s)/gi, '?')
    .replace(/\s+Ausrufezeichen(?=\s)/gi, '!')
    .replace(/\s+Doppelpunkt(?=\s)/gi, ':')
    .replace(/\s+Komma(?=\s)/gi, ',')
    .replace(/\s+Punkt\s*$/i, '.')            // „Punkt“ nur am Ende eines Satzstücks, sonst ist es der Punkt A
    .replace(/\s+Punkt(?=\n)/gi, '.')
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/^[ \t]+|\s+$/g, '');
  s = s.replace(/([.!?]\s+|\n)([a-zäöü])/g, (m, a, b) => a + b.toUpperCase());
  if (!prev.trim() || /[.!?\n]\s*$/.test(prev)) s = s.replace(/^(\n*)([a-zäöü])/, (m, a, b) => a + b.toUpperCase());
  return s;
}
// Neues Stück an bestehenden Text hängen
const join = (a, b) => (!a ? b : !b ? a : /\n$/.test(a) || /^[\n,.!?:]/.test(b) ? a + b : a + ' ' + b);

export function dictate({ title = 'Diktieren', lang = 'de-DE', start = '' } = {}) {
  const R = Rec();
  if (!R) {
    return sheet(title, (body, close) => body.append(
      h('div.dicthint', null, icon('mic'), h('p', { text: 'Dieser Browser kann hier nicht selbst zuhören. Du kannst aber das Mikrofon der iPad-Tastatur nehmen: in ein Textfeld tippen und auf das Mikrofon unten auf der Tastatur tippen.' })),
      h('div.dlgactions', null, h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } }))));
  }
  let rec = null, finalText = start, listening = false;
  return sheet(title, (body, close) => {
    const ta = h('textarea.field.area.dictarea', { rows: 6, placeholder: 'Sprich los. Der Text erscheint hier, du kannst ihn danach noch ändern.' });
    ta.value = start;
    const mic = h('button.dictmic', { 'aria-label': 'Zuhören' }, icon('mic'));
    const state = h('span.dictstate', { text: 'Tippe aufs Mikrofon' });
    const set = (on, msg) => { listening = on; mic.classList.toggle('on', on); state.textContent = msg || (on ? 'Ich höre zu …' : 'Pause. Tippe zum Weitersprechen.'); };
    const begin = () => {
      try {
        rec = new R(); rec.lang = lang; rec.continuous = true; rec.interimResults = true;
        finalText = ta.value;
        rec.onresult = (e) => {
          let interim = '';
          for (let k = e.resultIndex; k < e.results.length; k++) {
            const r = e.results[k];
            if (r.isFinal) finalText = join(finalText, spokenPunct(r[0].transcript.trim(), finalText));
            else interim += r[0].transcript;
          }
          ta.value = interim ? join(finalText, spokenPunct(interim.trim(), finalText)) : finalText;
          ta.scrollTop = ta.scrollHeight;
        };
        rec.onerror = (e) => {
          const msg = { 'not-allowed': 'Mikrofon ist nicht erlaubt. In den Einstellungen bei Safari erlauben.', 'service-not-allowed': 'Diktieren ist hier gesperrt. Nimm das Mikrofon der Tastatur.', network: 'Diktieren braucht Internet. Ohne Netz geht das Mikrofon der Tastatur.', 'no-speech': 'Nichts gehört. Tippe nochmal und sprich.', 'audio-capture': 'Kein Mikrofon gefunden.' }[e.error];
          set(false, msg || 'Zuhören hat nicht geklappt.');
        };
        rec.onend = () => { finalText = ta.value; if (listening) set(false); };
        rec.start(); set(true);
      } catch (err) { set(false, 'Zuhören hat nicht geklappt.'); }
    };
    const end = () => { try { rec && rec.stop(); } catch (e) { /* egal */ } set(false); };
    mic.addEventListener('click', () => (listening ? end() : begin()));
    ta.addEventListener('input', () => { finalText = ta.value; });
    body.append(
      h('div.dicthead', null, mic, h('div', null, state, h('small', { text: 'Sag „Komma“, „Punkt“, „Fragezeichen“ oder „neue Zeile“.' }))),
      ta,
      h('p.calm.small', { text: 'Diktieren schickt die Sprache an den Spracherkenner von Apple bzw. Google, dafür braucht es Internet.' }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => { end(); close(null); } } }),
        h('button.btn.primary', { text: 'Übernehmen', on: { click: () => { end(); const v = ta.value.trim(); close(v || null); } } })));
    begin();
    const obs = new MutationObserver(() => { if (!body.isConnected) { try { rec && rec.abort(); } catch (e) { /* egal */ } obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  });
}

// Kleiner Mikrofon-Knopf für ein Textfeld
export function micButton(field, { lang = 'de-DE' } = {}) {
  return h('button.btn.round.micbtn', { type: 'button', 'aria-label': 'Diktieren', title: 'Diktieren', on: { click: async () => {
    const v = await dictate({ lang });
    if (v) { field.value = field.value.trim() ? field.value.replace(/\s*$/, ' ') + v : v; field.dispatchEvent(new Event('input')); }
  } } }, icon('mic'));
}
