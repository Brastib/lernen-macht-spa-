// Lokale KI: ein kleines Sprachmodell läuft direkt im Browser auf dem Gerät (WebGPU, Bibliothek WebLLM in vendor/web-llm).
// Einmal herunterladen (WLAN), danach offline, keine Kosten, nichts verlässt das Gerät.
// Ehrlich: kleine Modelle irren sich öfter als große Cloud-KIs. Deshalb werden Karten immer vor dem Speichern geprüft.
import { fmtBytes } from './ui.js';

export const MODELS = {
  klein: { id16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', id32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Schnell', size: 'ca. 1 GB', note: 'Schneller, braucht weniger Arbeitsspeicher. Karten etwas einfacher.' },
  gross: { id16: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', id32: 'Qwen2.5-3B-Instruct-q4f32_1-MLC', label: 'Genauer', size: 'ca. 2 GB', note: 'Bessere Karten, aber langsamer. Braucht ein iPad mit viel Arbeitsspeicher.' },
};

let lib = null;
const loadLib = async () => (lib ||= await import('../vendor/web-llm/web-llm.js'));

export function aiChoice() { try { return localStorage.getItem('aiModel') || 'klein'; } catch (e) { return 'klein'; } }
export function setAiChoice(k) { try { localStorage.setItem('aiModel', k); } catch (e) { /* egal */ } }

// WebGPU vorhanden? Und kann die Grafikeinheit 16-Bit-Zahlen (spart Speicher)?
let support = null;
export async function aiSupport() {
  if (support) return support;
  if (!('gpu' in navigator)) return (support = { ok: false, why: 'Dieser Browser hat kein WebGPU. Auf dem iPad braucht die lokale KI iPadOS 26 oder neuer.' });
  try {
    const ad = await navigator.gpu.requestAdapter();
    if (!ad) return (support = { ok: false, why: 'WebGPU ist da, aber keine Grafikeinheit gefunden.' });
    return (support = { ok: true, f16: ad.features.has('shader-f16') });
  } catch (e) { return (support = { ok: false, why: 'WebGPU ließ sich nicht starten: ' + e.message }); }
}

async function modelId(key = aiChoice()) {
  const s = await aiSupport();
  const m = MODELS[key] || MODELS.klein;
  return s.f16 ? m.id16 : m.id32;
}

export async function isDownloaded(key = aiChoice()) {
  try { const { hasModelInCache } = await loadLib(); return await hasModelInCache(await modelId(key)); } catch (e) { return false; }
}

export async function deleteModel(key = aiChoice()) {
  const { deleteModelAllInfoInCache } = await loadLib();
  await deleteModelAllInfoInCache(await modelId(key));
}

// Wie viel Speicher die App insgesamt belegt (inkl. Modell), falls der Browser es verrät
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); return e && e.usage ? fmtBytes(e.usage) : ''; } catch (e) { return ''; }
}

let engine = null, engineId = '';
export async function getEngine(onProgress = () => {}) {
  const id = await modelId();
  if (engine && engineId === id) return engine;
  await unloadAi();
  const { CreateMLCEngine } = await loadLib();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* egal */ }
  engine = await CreateMLCEngine(id, {
    initProgressCallback: (r) => {
      const p = Math.round((r.progress || 0) * 100);
      const txt = /fetch|download|loading model from/i.test(r.text || '') && !/cache/i.test(r.text || '') ? `KI wird heruntergeladen … ${p} %` : `KI wird gestartet … ${p} %`;
      onProgress(txt, r);
    },
  });
  engineId = id;
  return engine;
}
export async function unloadAi() {
  if (!engine) return;
  try { await engine.unload(); } catch (e) { /* egal */ }
  engine = null; engineId = '';
}

// ---------- Karten erzeugen ----------
const SYSTEM = `Du hilfst einem Schüler beim Lernen. Du bekommst Text aus einem Schulbuch, Arbeitsblatt oder Heft (per Texterkennung, kann Tippfehler enthalten).
Suche die wichtigsten Infos heraus: Fachbegriffe mit Erklärung, Definitionen, Regeln, Formeln, Jahreszahlen, Ursachen und Folgen, Aufzählungen.
Mach daraus Lernkarten auf Deutsch:
- "frage": eine klare, kurze Frage (oder ein Begriff).
- "antwort": kurz und richtig, höchstens 2 Sätze. Nur was im Text steht, nichts erfinden.
- Keine Karten zu Seitenzahlen, Aufgabennummern, Abbildungen oder Werbung.
- Höchstens 8 Karten. Lieber weniger, aber wichtige.
Antworte nur mit JSON: {"karten":[{"frage":"...","antwort":"..."}]}`;

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: { karten: { type: 'array', items: { type: 'object', properties: { frage: { type: 'string' }, antwort: { type: 'string' } }, required: ['frage', 'antwort'] } } },
  required: ['karten'],
});

// Text in Stücke teilen, die das Modell auf einmal schafft (Absätze nicht zerschneiden)
export function chunks(text, size = 2200) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > size) { out.push(cur); cur = ''; }
    if (p.length > size) { for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); continue; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) out.push(cur);
  return out.filter((c) => c.replace(/\s/g, '').length > 40);
}

export function parseCards(raw) {
  let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return [];
  let j;
  try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { return []; }
  const list = Array.isArray(j) ? j : j.karten || j.cards || [];
  return list.map((c) => ({ front: String(c.frage || c.front || '').trim(), back: String(c.antwort || c.back || '').trim() }))
    .filter((c) => c.front.length >= 3 && c.back.length >= 1 && c.front.length <= 300 && c.back.length <= 500);
}

// texts: Text je Seite. Gibt Karten { front, back } zurück.
export async function aiCards(text, onProgress = () => {}, shouldStop = () => false) {
  const parts = chunks(text);
  if (!parts.length) return [];
  const eng = await getEngine(onProgress);
  const all = [];
  for (let i = 0; i < parts.length; i++) {
    if (shouldStop()) break;
    onProgress(`KI liest … Teil ${i + 1} von ${parts.length}`);
    let raw = '';
    try {
      const r = await eng.chat.completions.create({
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Text:\n"""\n' + parts[i] + '\n"""' }],
        temperature: 0.2, max_tokens: 900,
        response_format: { type: 'json_object', schema: SCHEMA },
      });
      raw = r.choices[0].message.content || '';
    } catch (e) {
      // Manche Geräte können die JSON-Vorgabe nicht: ohne nochmal versuchen
      const r = await eng.chat.completions.create({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Text:\n"""\n' + parts[i] + '\n"""' }], temperature: 0.2, max_tokens: 900 });
      raw = r.choices[0].message.content || '';
    }
    all.push(...parseCards(raw));
  }
  const seen = new Set();
  return all.filter((c) => { const k = c.front.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (seen.has(k)) return false; seen.add(k); return true; });
}
