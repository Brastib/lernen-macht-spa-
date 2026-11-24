// Bild-KI auf dem Gerät: liest ganze Seiten (gedruckt und Handschrift) und kann dazu passende Aufgaben schreiben.
// Modell: LFM3-VL-2B (Liquid AI, ONNX, LFM Open License) über Transformers.js 4.3.2 (Apache-2.0) mit WebGPU.
// Einmal herunterladen (ca. 2 GB), danach offline. Nichts verlässt das Gerät.
// Ehrlich: ein kleines Modell liest saubere Handschrift meist gut, krakelige oder Schreibschrift nicht immer.

export const VMODEL = 'onnx-community/LFM3-VL-2B-ONNX';
const HF = `https://huggingface.co/${VMODEL}/resolve/main/`;
const DT16 = { vision_encoder: 'fp16', embed_tokens: 'fp16', decoder_model_merged: 'q4f16' };
const DT32 = { vision_encoder: 'q4', embed_tokens: 'q4', decoder_model_merged: 'q4' };
export const VSIZE = 'ca. 2 GB';
const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

let lib = null;
async function loadLib() {
  if (lib) return lib;
  // Feste Version vom CDN; der Service Worker speichert sie, damit es danach offline geht (sw.js, CDN_KEEP)
  lib = await import(TF_URL);
  lib.env.allowLocalModels = false;
  lib.env.useBrowserCache = true;
  try { lib.env.backends.onnx.wasm.numThreads = 1; } catch (e) { /* egal */ }
  return lib;
}

async function dtypes() {
  const { aiSupport } = await import('./localai.js');
  const s = await aiSupport();
  return s.f16 ? DT16 : DT32;
}
const fileOf = (part, dt) => `onnx/${part}${dt === 'fp32' ? '' : '_' + dt}.onnx_data`;

// Liegt das Modell schon im Speicher? (die größte Datei prüfen)
export async function visionDownloaded() {
  try {
    const dt = await dtypes();
    const c = await caches.open('transformers-cache');
    return !!(await c.match(HF + fileOf('decoder_model_merged', dt.decoder_model_merged)));
  } catch (e) { return false; }
}
export async function deleteVision() {
  await unloadVision();
  const c = await caches.open('transformers-cache');
  for (const r of await c.keys()) if (r.url.includes(VMODEL)) await c.delete(r);
}

let model = null, processor = null;
export async function loadVision(onProgress = () => {}) {
  if (model) return;
  const { aiSupport } = await import('./localai.js');
  const s = await aiSupport();
  if (!s.ok) throw new Error(s.why);
  const L = await loadLib();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* egal */ }
  const have = await visionDownloaded();
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.file) {
      files.set(p.file, { l: p.loaded || 0, t: p.total || 0 });
      let l = 0, t = 0; for (const v of files.values()) { l += v.l; t += v.t; }
      const pct = t ? Math.round(l / t * 100) : 0;
      onProgress(have ? `Bild-KI wird gestartet … ${pct} %` : `Bild-KI wird heruntergeladen … ${pct} % (${Math.round(l / 1e6)} MB)`);
    } else if (p.status === 'ready' || p.status === 'done') onProgress('Bild-KI wird gestartet …');
  };
  processor = await L.AutoProcessor.from_pretrained(VMODEL, { progress_callback });
  model = await L.AutoModelForImageTextToText.from_pretrained(VMODEL, { device: 'webgpu', dtype: await dtypes(), progress_callback });
}
export async function unloadVision() {
  if (model) { try { await model.dispose(); } catch (e) { /* egal */ } }
  model = null; processor = null;
}

// Bild (Blob oder Canvas) auf höchstens maxSide Pixel bringen und als RawImage für Transformers.js
async function toRaw(src, maxSide = 1280) {
  const L = await loadLib();
  let bmp = src;
  if (src instanceof Blob) bmp = await createImageBitmap(src);
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return L.RawImage.fromCanvas ? L.RawImage.fromCanvas(c) : L.RawImage.fromBlob(await new Promise((r) => c.toBlob(r, 'image/png')));
}

// Eine Frage zu einem Bild stellen
export async function ask(image, text, { maxTokens = 1024, onProgress = () => {}, temperature = 0.1 } = {}) {
  await loadVision(onProgress);
  const L = await loadLib();
  const raw = await toRaw(image);
  const messages = [{ role: 'user', content: [{ type: 'image' }, { type: 'text', text }] }];
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true, enable_thinking: false });
  const inputs = await processor(raw, prompt, { add_special_tokens: false });
  let n = 0;
  const streamer = L.TextStreamer ? new L.TextStreamer(processor.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: () => { n++; if (n % 8 === 0) onProgress(`KI schreibt … ${n} Wörter`); } }) : undefined;
  const out = await model.generate({ ...inputs, do_sample: temperature > 0, temperature: Math.max(temperature, 0.01), top_k: 50, repetition_penalty: 1.1, max_new_tokens: maxTokens, streamer });
  const len = inputs.input_ids.dims.at(-1);
  const txt = processor.batch_decode(out.slice(null, [len, null]), { skip_special_tokens: true })[0] || '';
  return txt.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Ganze Seite abschreiben (Druck + Handschrift)
export const READ_PROMPT = 'Schreibe den gesamten Text auf diesem Blatt genau ab, auch alles Handgeschriebene. Behalte Überschriften, Aufgabennummern (1., 2., a), b)) und Zeilenumbrüche. Schreibe Rechnungen und Formeln genau mit allen Zahlen und Zeichen ab (Mal als ·, Geteilt als :, Brüche als 3/4). Unleserliche Wörter markierst du mit [?]. Gib nur den abgeschriebenen Text aus, ohne Erklärung.';
export async function readPage(image, onProgress) {
  return ask(image, READ_PROMPT, { maxTokens: 1400, onProgress });
}

// Seite als Bild mit allen Stift-Strichen (für Hefte und ausgefüllte Arbeitsblätter)
export async function pageImage(p, widthPx = 1400) {
  const db = await import('./db.js');
  const { renderPage, blobToImage } = await import('./paper.js');
  const blob = p.kind === 'blank' ? null : await db.getImage(p.id);
  if (p.kind !== 'blank' && !p.strokes && blob) return blob;
  const strokes = await db.getInk(p.id);
  const bg = blob ? await blobToImage(blob) : null;
  return renderPage(p, bg, strokes || [], widthPx);
}
