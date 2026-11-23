// Zwischen-Server (Cloudflare Worker) für den Vertretungsplan aus dem Schulportal Hessen.
//
// Warum? Die Lern-App läuft im Browser und darf wegen CORS nicht selbst beim Schulportal einloggen.
// Dieser Worker loggt sich ein, holt den Vertretungsplan und gibt ihn als JSON an die App.
//
// Geheimnisse (NICHT hier eintragen, sondern in Cloudflare unter „Variablen und Geheimnisse“ als Typ „Secret“):
//   SPH_SCHULE    Schul-ID (Zahl, steht beim Login in der Adresse: ...?i=1234)
//   SPH_NUTZER    Benutzername im Schulportal (z. B. vorname.nachname)
//   SPH_PASSWORT  Passwort im Schulportal
//   APP_SCHLUESSEL  ein langes, zufälliges Wort. Die App schickt es mit, sonst antwortet der Worker nicht.
// Optional (normale Variable):
//   ERLAUBTE_SEITE  Adresse der App, Standard https://brastib.github.io
//
// Wie das Einloggen funktioniert, steht in den Open-Source-Projekten „pylanis“ (udondan/lanis) und
// „lanisapi“: POST auf login.schulportal.hessen.de, dann connect.schulportal.hessen.de, dann Cookie „sid“.
// Der Worker liest nur. Er ändert nichts im Schulportal.

const LOGIN = 'https://login.schulportal.hessen.de/';
const CONNECT = 'https://connect.schulportal.hessen.de/';
const VPLAN = 'https://start.schulportal.hessen.de/vertretungsplan.php';
const UNTERRICHT = 'https://start.schulportal.hessen.de/meinunterricht.php';
const KALENDER = 'https://start.schulportal.hessen.de/kalender.php';
// Kalender-Einträge, die nach einer Arbeit aussehen
const ARBEIT = /klassenarbeit|klausur|lernkontrolle|leistungskontrolle|vergleichsarbeit|\bvera\b|\btest\b|arbeit\b|präsentation|praesentation|referat|vokabeltest|abgabe/i;
const UA = 'Mozilla/5.0 (compatible; LernApp-Vertretungsplan/1.0)';
const CACHE_MS = 5 * 60 * 1000;   // höchstens alle 5 Minuten beim Schulportal fragen
const MIN_MS = 60 * 1000;         // auch mit „frisch“ höchstens 1x pro Minute

// Bleibt zwischen Anfragen erhalten, solange Cloudflare den Worker warm hält
let session = null;   // { sid }
let cache = null;     // { at, data }
let msgCache = null;  // { at, data } für Nachrichten

class SphError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export default {
  // nur für Tests
  _intern: { planDates: (...a) => planDates(...a), parseTable: (...a) => parseTable(...a), parseNotice: (...a) => parseNotice(...a), reset: () => { session = null; cache = null; msgCache = null; }, clearCache: () => { cache = null; }, parseHomework: (h) => parseHomework(h), md5: (b) => md5(b), cjsEncrypt: (a, b) => cjsEncrypt(a, b), cjsDecrypt: (a, b) => cjsDecrypt(a, b), rsaEncryptPkcs1: (a, b) => rsaEncryptPkcs1(a, b) },
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ERLAUBTE_SEITE || 'https://brastib.github.io').replace(/\/+$/, '');
    const cors = origin === allowed ? {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers': 'X-App-Key',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    } : { 'Vary': 'Origin' };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ ok: false, error: 'methode', message: 'Nur GET.' }, 405);

    const url = new URL(request.url);
    const key = request.headers.get('X-App-Key') || '';
    if (!env.APP_SCHLUESSEL) return json({ ok: false, error: 'einrichtung', message: 'Im Worker fehlt das Geheimnis APP_SCHLUESSEL.' }, 500);
    if (!key) {
      // Ohne Schlüssel nur ein Lebenszeichen, damit man beim Einrichten sieht, dass der Worker läuft
      return json({ ok: false, error: 'schluessel', message: 'Worker läuft. Ohne richtigen App-Schlüssel gibt es keine Daten.' }, 401);
    }
    if (!(await sameText(key, env.APP_SCHLUESSEL))) return json({ ok: false, error: 'schluessel', message: 'Falscher App-Schlüssel.' }, 401);

    const missing = ['SPH_SCHULE', 'SPH_NUTZER', 'SPH_PASSWORT'].filter((n) => !env[n]);
    if (missing.length) return json({ ok: false, error: 'einrichtung', message: 'Im Worker fehlen die Geheimnisse: ' + missing.join(', ') }, 500);

    const fresh = url.searchParams.get('frisch') === '1';

    // Nachrichten aus dem Schulportal (nur lesen)
    if (url.pathname.replace(/\/+$/, '') === '/nachrichten') {
      const mAge = msgCache ? Date.now() - msgCache.at : Infinity;
      if (msgCache && mAge < (fresh ? MIN_MS : CACHE_MS)) return json({ ...msgCache.data, ausZwischenspeicher: true });
      try {
        const data = await loadMessages(env);
        msgCache = { at: Date.now(), data };
        return json(data);
      } catch (e) {
        const err = e instanceof SphError ? e : new SphError('unbekannt', 'Fehler bei Nachrichten: ' + (e && e.message || e));
        if (msgCache && err.code !== 'login') return json({ ...msgCache.data, ausZwischenspeicher: true, warnung: err.message });
        return json({ ok: false, error: err.code, message: err.message }, err.status);
      }
    }

    const age = cache ? Date.now() - cache.at : Infinity;
    if (cache && (age < (fresh ? MIN_MS : CACHE_MS))) return json({ ...cache.data, ausZwischenspeicher: true });

    try {
      const data = await loadPlan(env);
      cache = { at: Date.now(), data };
      return json(data);
    } catch (e) {
      const err = e instanceof SphError ? e : new SphError('unbekannt', 'Fehler im Worker: ' + (e && e.message || e));
      // Alter Stand ist besser als nichts
      if (cache && err.code !== 'login') return json({ ...cache.data, ausZwischenspeicher: true, warnung: err.message });
      return json({ ok: false, error: err.code, message: err.message }, err.status);
    }
  },
};

// Vergleich ohne Zeit-Unterschiede (gegen Raten des Schlüssels)
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

// ---------------- Login ----------------

function cookieFrom(res, name) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  let val = null;
  for (const raw of list) {
    for (const part of raw.split(/;|,(?=\s*[A-Za-z0-9_-]+=)/)) {
      const p = part.trim();
      if (p.toLowerCase().startsWith(name.toLowerCase() + '=')) val = p.slice(name.length + 1);
    }
  }
  return val;
}

async function req(url, opts = {}) {
  return fetch(url, { redirect: 'manual', ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
}

async function login(env) {
  const school = String(env.SPH_SCHULE).trim();
  const user = String(env.SPH_NUTZER).trim();
  const body = new URLSearchParams({ user2: user, user: `${school}.${user}`, password: env.SPH_PASSWORT });
  const r1 = await req(LOGIN + '?i=' + encodeURIComponent(school), {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const location = r1.headers.get('location');
  const sph = cookieFrom(r1, 'SPH-Session');
  if (!location) throw new SphError('login', 'Login abgelehnt. Stimmen Schul-ID, Benutzername und Passwort? (Nach mehreren Fehlversuchen sperrt das Schulportal kurz.)', 401);
  if (!sph) throw new SphError('login2', 'Das Schulportal hat kein Login-Cookie geschickt. Vielleicht hat sich der Login geändert.');
  const cookie = `SPH-Session=${sph}`;

  // connect.* leitet zur Adresse weiter, die das Cookie „sid“ setzt. Bis zu 6 Weiterleitungen folgen.
  let next = CONNECT, sid = null;
  for (let i = 0; i < 6 && next && !sid; i++) {
    const r = await req(next, { method: 'HEAD', headers: { Cookie: cookie } });
    sid = cookieFrom(r, 'sid');
    const loc = r.headers.get('location');
    next = loc ? new URL(loc, next).href : null;
  }
  if (!sid) throw new SphError('login3', 'Das Schulportal hat keine Sitzung (sid) gegeben. Vielleicht hat sich der Login geändert.');
  session = { sid };
  return session;
}

function isLoginPage(res, text) {
  const loc = res.headers.get('location') || '';
  if (res.status >= 300 && res.status < 400 && /login\.schulportal|index\.php/.test(loc)) return true;
  if (/(^|,)\s*i=0;/.test(res.headers.get('set-cookie') || '')) return true;
  return text != null && /name=["']user2["']/.test(text);
}

// ---------------- Nachrichten (verschlüsselt) ----------------
// Das Schulportal verschlüsselt Nachrichten zusätzlich: Der Client denkt sich ein Passwort aus, schickt es
// RSA-verschlüsselt (PKCS#1 v1.5) und danach ist alles AES-256-CBC im CryptoJS-Format („Salted__“, EVP_BytesToKey mit MD5).
// Ablauf wie in pylanis (udondan/lanis, Datei cryption.py und conversations.py). Der Worker LIEST nur.
const AJAX = 'https://start.schulportal.hessen.de/ajax.php';
const NACHRICHTEN = 'https://start.schulportal.hessen.de/nachrichten.php';
const MSG_MAX = 20;   // so viele Gespräche mit Inhalt laden

function md5(bytes) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const len = bytes.length, n = (((len + 8) >> 6) + 1) * 16, w = new Uint32Array(n);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8);
  w[n - 2] = (len * 8) >>> 0; w[n - 1] = Math.floor(len / 0x20000000);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < n; o += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const t = D; D = C; C = B;
      const x = (A + F + K[i] + w[o + g]) >>> 0, sh = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((x << sh) | (x >>> (32 - sh)))) >>> 0; A = t;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let k = 0; k < 4; k++) out[i * 4 + k] = (v >>> (8 * k)) & 255; });
  return out;
}
const enc = new TextEncoder(), dec = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
function bytesToKey(pass, salt) {
  const data = cat(pass, salt);
  let block = md5(data), out = block;
  while (out.length < 48) { block = md5(cat(block, data)); out = cat(out, block); }
  return out.slice(0, 48);
}
async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-CBC', false, ['encrypt', 'decrypt']); }
async function cjsEncrypt(plain, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(8));
  const ki = bytesToKey(enc.encode(pass), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ki.slice(32) }, await aesKey(ki.slice(0, 32)), enc.encode(plain)));
  return b64(cat(enc.encode('Salted__'), salt, ct));
}
async function cjsDecrypt(text, pass) {
  const raw = unb64(String(text).trim());
  if (dec.decode(raw.slice(0, 8)) !== 'Salted__') throw new Error('kein Salted__');
  const ki = bytesToKey(enc.encode(pass), raw.slice(8, 16));
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ki.slice(32) }, await aesKey(ki.slice(0, 32)), raw.slice(16)));
}
// RSA-Schlüssel (PEM, SubjectPublicKeyInfo) → n, e
function rsaFromPem(pem) {
  const der = unb64(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  let p = 0;
  const read = () => {
    const tag = der[p++]; let len = der[p++];
    if (len & 0x80) { const k = len & 0x7f; len = 0; for (let i = 0; i < k; i++) len = len * 256 + der[p++]; }
    return { tag, len, start: p };
  };
  const big = (u) => u.reduce((a, b) => (a << 8n) + BigInt(b), 0n);
  let t = read();                     // SEQUENCE
  t = read();                         // SEQUENCE (Algorithmus) oder INTEGER (PKCS#1)
  if (t.tag === 0x30) {
    p = t.start + t.len;
    t = read(); p = t.start + 1;      // BIT STRING, ein Byte „unused bits“ überspringen
    read();                           // innere SEQUENCE
    t = read();
  }
  const n = big(der.slice(t.start, t.start + t.len)); p = t.start + t.len;
  const e2 = read();
  const e = big(der.slice(e2.start, e2.start + e2.len));
  return { n, e };
}
function modpow(b, e, m) { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; }
function rsaEncryptPkcs1(pem, msg) {
  const { n, e } = rsaFromPem(pem);
  const k = Math.ceil(n.toString(16).length / 2);
  if (msg.length > k - 11) throw new Error('Nachricht zu lang für RSA');
  const ps = new Uint8Array(k - msg.length - 3);
  for (let i = 0; i < ps.length; i++) { let x = 0; while (!x) x = crypto.getRandomValues(new Uint8Array(1))[0]; ps[i] = x; }
  const em = cat(new Uint8Array([0, 2]), ps, new Uint8Array([0]), msg);
  let c = modpow(em.reduce((a, b) => (a << 8n) + BigInt(b), 0n), e, n).toString(16);
  c = c.padStart(k * 2, '0');
  return Uint8Array.from(c.match(/../g), (h) => parseInt(h, 16));
}

async function handshake(cookie) {
  const hex = () => '0123456789abcdef'[crypto.getRandomValues(new Uint8Array(1))[0] % 16];
  const key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx-xxxxxx3xx'.replace(/[xy]/g, hex);
  const secret = await cjsEncrypt(key, key);
  const r1 = await req(AJAX + '?f=rsaPublicKey', { headers: { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest' } });
  const pub = JSON.parse(await r1.text()).publickey;
  if (!pub) throw new SphError('krypto', 'Das Schulportal hat keinen Schlüssel für Nachrichten geschickt.');
  const encKey = b64(rsaEncryptPkcs1(pub, enc.encode(secret)));
  const r2 = await req(AJAX + '?f=rsaHandshake&s=' + Math.floor(Math.random() * 2001), {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ key: encKey }),
  });
  const ch = JSON.parse(await r2.text()).challenge;
  if (!ch || (await cjsDecrypt(ch, secret)) !== secret) throw new SphError('krypto', 'Die Verschlüsselung mit dem Schulportal hat nicht geklappt.');
  return secret;
}

async function loadMessages(env) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session || attempt > 0) await login(env);
    const cookie = `i=${String(env.SPH_SCHULE).trim()}; sid=${session.sid}`;
    const post = (url, body) => req(url, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: new URLSearchParams(body) });
    let secret;
    try { secret = await handshake(cookie); } catch (e) { if (attempt === 0 && !(e instanceof SphError)) { session = null; continue; } throw e; }
    const r = await post(NACHRICHTEN, { a: 'headers', getType: 'visibleOnly', last: '0' });
    const t = await r.text();
    if (isLoginPage(r, t)) { session = null; continue; }
    let rows;
    try { rows = JSON.parse(await cjsDecrypt(JSON.parse(t).rows, secret)); } catch (e) { throw new SphError('nachrichten', 'Die Nachrichten-Liste konnte nicht gelesen werden.'); }
    const list = [];
    for (const [i, hd] of (Array.isArray(rows) ? rows : []).entries()) {
      const item = {
        id: String(hd.Uniquid || ''),
        subject: text(String(hd.Betreff || '')),
        sender: text(String(hd.SenderName || '')).replace(/^\s*,\s*$/, ''),
        date: String(hd.Datum || ''),
        unread: !!hd.unread,
        receivers: (hd.empf || []).map((x) => text(String(x))).filter(Boolean),
        messages: null,
      };
      if (i < MSG_MAX && item.id) {
        try {
          const rr = await req(NACHRICHTEN + '?a=read&msg=' + encodeURIComponent(item.id), { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: new URLSearchParams({ a: 'read', uniqid: await cjsEncrypt(item.id, secret) }) });
          const d = JSON.parse(await cjsDecrypt(JSON.parse(await rr.text()).message, secret));
          const one = (m) => ({ from: text(String(m.username || m.Sender || m.SenderName || m.Absender || '')).replace(/^[\s,]*$/, ''), date: String(m.Datum || m.date || ''), text: text(String(m.Inhalt || m.content || '')), own: !!(m.own || m.Own) });
          item.messages = [one({ ...d, SenderName: d.SenderName || hd.SenderName }), ...(Array.isArray(d.reply) ? d.reply.map(one) : [])];
        } catch (e) { item.messages = null; }
      }
      list.push(item);
    }
    return { ok: true, fetched: new Date().toISOString(), conversations: list };
  }
  throw new SphError('sitzung', 'Das Schulportal hat die Nachrichten nicht geliefert.');
}

// ---------------- Vertretungsplan ----------------

async function loadPlan(env) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session || attempt > 0) await login(env);
    const cookie = `i=${String(env.SPH_SCHULE).trim()}; sid=${session.sid}`;
    const page = await req(VPLAN, { headers: { Cookie: cookie } });
    const html = page.status === 200 ? await page.text() : '';
    if (isLoginPage(page, html) || page.status !== 200) { session = null; continue; }

    const days = [];
    for (const d of planDates(html)) {
      const mine = parseTable(html, d);
      let all = null;
      try {
        const r = await req(VPLAN, {
          method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams({ tag: d, ganzerPlan: 'true' }),
        });
        const t = await r.text();
        const j = JSON.parse(t);
        if (Array.isArray(j)) all = j.map(norm);   // -1 = Schüler dürfen den ganzen Plan nicht sehen
      } catch (e) { /* dann nur die eigenen Einträge */ }
      days.push({ date: d.split('.').reverse().join('-'), notice: parseNotice(html, d), updated: parseUpdated(html, d), mine: mine || [], all, tableFound: !!mine });
    }
    // Hausaufgaben („Mein Unterricht“) und Arbeiten (Kalender). Fehler hier stören den Vertretungsplan nicht.
    const extraErrors = [];
    let homework = null, exams = null;
    try {
      const r = await req(UNTERRICHT, { headers: { Cookie: cookie } });
      const t = r.status === 200 ? await r.text() : '';
      if (t && !isLoginPage(r, t)) homework = parseHomework(t);
      else extraErrors.push('Mein Unterricht nicht erreichbar');
    } catch (e) { extraErrors.push('Mein Unterricht: ' + (e && e.message || e)); }
    try {
      const from = new Date(), to = new Date(Date.now() + 120 * 864e5);
      const iso = (d) => d.toISOString().slice(0, 10);
      const r = await req(KALENDER, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ f: 'getEvents', k: '', s: '', start: iso(from), end: iso(to) }),
      });
      const j = JSON.parse(await r.text());
      if (Array.isArray(j)) exams = j.filter((e) => ARBEIT.test(`${e.title || ''} ${e.description || ''} ${e.category || ''} ${e.Kategorie || ''}`)).slice(0, 80).map((e) => ({
        id: e.Id != null ? String(e.Id) : (e.id != null ? String(e.id) : ''),
        title: text(String(e.title || '')),
        description: text(String(e.description || '')),
        place: text(String(e.Ort || '')),
        start: String(e.Anfang || e.start || ''),
        end: String(e.Ende || e.end || ''),
        allDay: !!e.allDay,
      }));
      else extraErrors.push('Kalender gab keine Liste zurück');
    } catch (e) { extraErrors.push('Kalender: ' + (e && e.message || e)); }
    return {
      ok: true,
      fetched: new Date().toISOString(),
      noPlanYet: !days.length && html.includes('module/vertretungsplan'),
      days,
      homework,
      exams,
      extraErrors,
    };
  }
  throw new SphError('sitzung', 'Das Schulportal hat die Seite Vertretungsplan nicht geliefert (Sitzung sofort wieder weg, oder die Schule nutzt den Vertretungsplan nicht).');
}

// Alle Tage, für die es eine Tabelle gibt (id="vtable24_11_2026"), sonst die Daten in den Überschriften
function planDates(html) {
  const out = [];
  const add = (d) => { if (!out.includes(d)) out.push(d); };
  for (const m of html.matchAll(/id=["']vtable(\d\d)_(\d\d)_(\d{4})["']/g)) add(`${m[1]}.${m[2]}.${m[3]}`);
  if (!out.length) {
    for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)) {
      const d = /(\d\d\.\d\d\.\d{4})/.exec(m[1]);
      if (d) add(d[1]);
    }
  }
  return out;
}

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', rarr: '→' };
function text(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(+x))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m)
    .replace(/[ \t\r]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

// Eigene Einträge eines Tages aus der Tabelle auf der Seite. null = keine Tabelle gefunden.
function parseTable(html, day) {
  const id = 'vtable' + day.replace(/\./g, '_');
  const start = html.search(new RegExp(`<table[^>]*id=["']${id}["']`));
  if (start < 0) return null;
  const end = html.indexOf('</table>', start);
  const t = html.slice(start, end < 0 ? undefined : end);
  const head = /<thead[\s\S]*?<\/thead>/i.exec(t);
  const cols = [];
  for (const m of (head ? head[0] : '').matchAll(/<th(\s[^>]*)?>([\s\S]*?)<\/th>/gi)) {
    const f = /data-field=["']([^"']*)["']/.exec(m[1] || '');
    cols.push(f && f[1] ? f[1] : text(m[2]));
  }
  const bodyStart = head ? head.index + head[0].length : 0;
  const rows = [];
  for (const r of t.slice(bodyStart).matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<td(\s[^>]*)?>([\s\S]*?)<\/td>/gi)];
    if (!cells.length || /colspan/i.test(cells[0][1] || '')) continue;   // „Keine Einträge!“
    const raw = {};
    cells.forEach((c, i) => { raw[cols[i] || 'Spalte' + (i + 1)] = text(c[2]); });
    rows.push(norm(raw));
  }
  return rows;
}

// Hinweis „Allgemein“ eines Tages (Kasten mit class="infos" vor der Tabelle). Kann fehlen.
function parseNotice(html, day) {
  const id = 'vtable' + day.replace(/\./g, '_');
  const pos = html.search(new RegExp(`id=["']${id}["']`));
  if (pos < 0) return null;
  const prevEnd = html.lastIndexOf('id="vtable', pos - 1);
  const seg = html.slice(prevEnd < 0 ? 0 : prevEnd, pos);
  const tables = [...seg.matchAll(/<table[^>]*class=["'][^"']*\binfos\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)];
  if (!tables.length) return null;
  const rows = [...tables[tables.length - 1][1].matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)].map((r) => text(r[1])).filter(Boolean);
  const out = rows.slice(1).join('\n').trim();   // erste Zeile ist die Überschrift „Allgemein“
  return out || null;
}

// „Letzte Aktualisierung: 14.10.2026 um 12:00:00 Uhr“ unter der Tabelle eines Tages
function parseUpdated(html, day) {
  const pos = html.search(new RegExp(`id=["']vtable${day.replace(/\./g, '_')}["']`));
  if (pos < 0) return null;
  const nextT = html.indexOf('id="vtable', pos + 10);
  const m = /Letzte Aktualisierung:\s*([^<]*?)\s*Uhr/.exec(html.slice(pos, nextT < 0 ? undefined : nextT));
  return m ? text(m[1]) : null;
}

// „Mein Unterricht“: Zeilen der Tabelle „aktuell“ mit Fach, Thema, Datum und Hausaufgabe
function parseHomework(html) {
  const start = html.search(/id=["']aktuellTable["']/);
  if (start < 0) return [];
  const endTable = html.indexOf('</table>', start);
  const t = html.slice(start, endTable < 0 ? undefined : endTable);
  const out = [];
  const rows = t.split(/<tr(?=[^>]*\bprintable\b)/i).slice(1);
  for (const row of rows) {
    const g = (re) => { const m = re.exec(row); return m ? text(m[1]) : ''; };
    const course = g(/<h3[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || g(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const hw = g(/class=["'][^"']*\brealHomework\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (!hw) continue;
    out.push({
      course,
      teacher: (/class=["']teacher["'][\s\S]*?title=["']([^"']*)["']/i.exec(row) || [])[1] || '',
      topic: g(/<b[^>]*class=["'][^"']*\bthema\b[^"']*["'][^>]*>([\s\S]*?)<\/b>/i),
      date: ((/(\d\d)\.(\d\d)\.(\d{4})/.exec(g(/class=["'][^"']*\bdatum\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)) || []).slice(1).reverse().join('-')) || '',
      text: hw,
      done: /\b(erledigt|done)\b/i.test((/<[^>]*\bhomework\b[^>]*>/i.exec(row) || [''])[0]),
    });
  }
  return out;
}

// Einheitliche Felder, egal wie die Spalten heißen. „raw“ behält alles.
function norm(raw) {
  const low = {};
  for (const [k, v] of Object.entries(raw)) low[k.toLowerCase()] = v == null ? '' : String(v).trim();
  const g = (...ks) => { for (const k of ks) if (low[k]) return low[k]; return ''; };
  return {
    stunde: g('stunde'),
    klasse: g('klasse'),
    fach: g('fach'),
    fachAlt: g('fach_alt'),
    lehrer: g('lehrer', 'lehrerkuerzel'),
    vertreter: g('vertreter', 'vertreterkuerzel'),
    raum: g('raum'),
    raumAlt: g('raum_alt'),
    art: g('art'),
    hinweis: [g('hinweis'), g('hinweis2')].filter(Boolean).join(' · '),
    raw,
  };
}
