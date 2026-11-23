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

class SphError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export default {
  // nur für Tests
  _intern: { planDates: (...a) => planDates(...a), parseTable: (...a) => parseTable(...a), parseNotice: (...a) => parseNotice(...a), reset: () => { session = null; cache = null; }, clearCache: () => { cache = null; }, parseHomework: (h) => parseHomework(h) },
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
