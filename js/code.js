// Code-Bereich: programmieren und kleine Spiele bauen, alles offline auf dem Gerät.
//   Web (HTML/CSS/JavaScript) läuft in einer abgeschotteten Vorschau (iframe ohne Zugriff auf die App-Daten).
//   Python über Pyodide (vendor/pyodide, ca. 13 MB, wird erst beim ersten Start geladen).
//   Lua über Fengari (vendor/fengari-web.js, klein).
import * as db from './db.js';
import { $, h, icon, toast, plural, sheet, confirmSheet, promptSheet, menu } from './ui.js';
import { LANG_INFO, BLANK, EXAMPLES } from './code-examples.js';

let proj = null, tab = 'code', onCloseCb = null, saveTimer = null, fontSize = 15;
try { fontSize = +localStorage.getItem('codeFont') || 15; } catch (e) { /* egal */ }
const isArtifact = () => !!document.documentElement.dataset.artifact;

// ---------- Projekt-Liste (wird von app.js in #view gezeichnet) ----------
export async function renderCodeList(ctx) {
  const list = (await db.listCode()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Programmieren', title: 'Code',
    meta: plural(list.length, 'Projekt', 'Projekte'),
    actions: [ctx.btn('Beispiele', 'read', () => examplesFlow(ctx)), ctx.btn('Neu', 'plus', (e) => newMenu(e.currentTarget, ctx), '.primary')],
  });
  const view = $('view');
  view.textContent = '';
  view.append(h('section.langinfo', null,
    ...Object.entries(LANG_INFO).map(([k, v]) => h('div.langchip', null, h('b', { text: v.label }), h('small', { text: v.hint }))),
    h('p.calm', { text: 'Andere Sprachen wie C++, Java oder Swift gehen in einer Web-App ohne Server nicht.' })));
  if (!list.length) {
    view.append(h('section.empty', null,
      h('h2', { text: 'Noch keine Projekte' }),
      h('p', { text: 'Fang mit einem Beispiel an, zum Beispiel dem Spiel „Sternenfänger“, und bau es um. Oder starte leer.' }),
      h('div.emptyactions', null, ctx.btn('Beispiele ansehen', 'read', () => examplesFlow(ctx)), ctx.btn('Neues Projekt', 'plus', (e) => newMenu(e.currentTarget, ctx), '.primary'))));
    return;
  }
  const grid = h('div.codegrid');
  for (const p of list) {
    grid.append(h('button.codecard', { on: { click: () => openCoder(p, { onClose: () => renderCodeList(ctx) }) } },
      h('span.codelang.' + p.lang, { text: LANG_INFO[p.lang]?.short || p.lang }),
      h('b', { text: p.title }),
      h('small', { text: preview(p) })));
  }
  view.append(h('h2.section', { text: 'Deine Projekte' }), grid);
}
function preview(p) {
  const src = p.lang === 'web' ? (p.js || p.html || '') : (p.code || '');
  return src.split('\n').find((l) => l.trim() && !/^\s*(\/\/|#|--)/.test(l))?.trim().slice(0, 60) || 'leer';
}

function newMenu(anchor, ctx) {
  menu(anchor, Object.entries(LANG_INFO).map(([k, v]) => ({ label: `${v.label} – ${v.hint}`, icon: 'code', onClick: async () => {
    const t = await promptSheet('Neues Projekt', { label: 'Name', placeholder: k === 'web' ? 'z. B. Mein Spiel' : 'z. B. Rechner', ok: 'Anlegen' });
    if (!t) return;
    const [p] = await db.putItems('code', [{ title: t, lang: k, ...BLANK[k], updated: Date.now() }]);
    openCoder(p, { onClose: () => renderCodeList(ctx) });
  } })));
}

async function examplesFlow(ctx) {
  const ex = await sheet('Beispiele', (body, close) => {
    const l = h('div.targets');
    for (const e of EXAMPLES) {
      l.append(h('button.target.extarget', { on: { click: () => close(e) } },
        h('span.codelang.' + e.lang, { text: LANG_INFO[e.lang].short }),
        h('span', null, h('b', { text: e.title }), h('small.exnote', { text: e.note }))));
    }
    body.append(h('p.dlgtext', { text: 'Du bekommst eine Kopie, die du frei verändern kannst.' }), l);
  }, { wide: true });
  if (!ex) return;
  const { note, ...rest } = ex;
  const [p] = await db.putItems('code', [{ ...rest, updated: Date.now() }]);
  openCoder(p, { onClose: () => renderCodeList(ctx) });
}

// ---------- Editor ----------
export function openCoder(p, { onClose } = {}) {
  proj = p; onCloseCb = onClose;
  tab = p.lang === 'web' ? 'js' : 'code';
  $('coder').hidden = false;
  document.body.classList.add('coding');
  $('cdTitle').textContent = p.title;
  $('cdLang').textContent = LANG_INFO[p.lang]?.label || p.lang;
  const tabs = $('cdTabs');
  tabs.textContent = '';
  tabs.hidden = p.lang !== 'web';
  if (p.lang === 'web') {
    for (const [k, l] of [['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']]) {
      tabs.append(h('button' + (k === tab ? '.on' : ''), { text: l, 'data-tab': k, on: { click: () => switchTab(k) } }));
    }
  }
  buildKeys();
  loadTab();
  clearOutput();
  $('cdOutTitle').textContent = p.lang === 'web' ? 'Vorschau' : 'Ausgabe';
  setFont(fontSize);
}

function switchTab(k) {
  storeTab();
  tab = k;
  $('cdTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
  buildKeys();
  loadTab();
}
function loadTab() {
  const ta = $('cdArea');
  ta.value = proj[tab] || '';
  ta.scrollTop = 0;
  ta.setSelectionRange(0, 0);
  updateGutter();
}
function storeTab() {
  if (!proj) return;
  proj[tab] = $('cdArea').value;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}
async function saveNow() {
  clearTimeout(saveTimer);
  if (!proj) return;
  storeTab();
  proj.updated = Date.now();
  await db.putItems('code', proj);
}

async function closeCoder() {
  stopRun();
  await saveNow();
  $('coder').hidden = true;
  document.body.classList.remove('coding');
  proj = null;
  if (onCloseCb) onCloseCb();
}

// Zeilennummern
function updateGutter() {
  const ta = $('cdArea');
  const n = ta.value.split('\n').length;
  const g = $('cdGutter');
  if (g.childElementCount !== n) {
    g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }
  g.scrollTop = ta.scrollTop;
}

function setFont(px) {
  fontSize = Math.max(11, Math.min(26, px));
  try { localStorage.setItem('codeFont', String(fontSize)); } catch (e) { /* egal */ }
  $('coder').style.setProperty('--codefs', fontSize + 'px');
}

// Text an der Cursor-Stelle einfügen (für die Tastenleiste)
function insert(text, back = 0) {
  const ta = $('cdArea');
  ta.focus();
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.setRangeText(text, s, e, 'end');
  if (back) ta.setSelectionRange(ta.selectionEnd - back, ta.selectionEnd - back);
  onInput();
}
const indentUnit = () => (proj && proj.lang === 'python' ? '    ' : '  ');

function buildKeys() {
  const bar = $('cdKeys');
  bar.textContent = '';
  const keys = [['⇥', () => insert(indentUnit())], ['( )', () => insert('()', 1)], ['[ ]', () => insert('[]', 1)], ['{ }', () => insert('{}', 1)],
    ['" "', () => insert('""', 1)], ["' '", () => insert("''", 1)], ['=', () => insert(' = ')], [':', () => insert(':')], [';', () => insert(';')],
    ['<', () => insert('<')], ['>', () => insert('>')], ['+', () => insert('+')], ['-', () => insert('-')], ['*', () => insert('*')], ['/', () => insert('/')],
    ['#', () => insert('#')], ['_', () => insert('_')], ['.', () => insert('.')], [',', () => insert(', ')]];
  if (proj && proj.lang === 'web' && tab === 'html') keys.splice(1, 0, ['< >', () => insert('<>', 1)]);
  for (const [l, fn] of keys) {
    // pointerdown + preventDefault: Tastatur bleibt offen, Fokus bleibt im Code
    bar.append(h('button.key', { text: l, on: { pointerdown: (e) => { e.preventDefault(); fn(); } } }));
  }
  bar.append(h('span.keysep'),
    h('button.key', { 'aria-label': 'Rückgängig', on: { pointerdown: (e) => { e.preventDefault(); $('cdArea').focus(); document.execCommand('undo'); onInput(); } } }, icon('undo')),
    h('button.key', { 'aria-label': 'Tastatur zu', on: { pointerdown: (e) => { e.preventDefault(); $('cdArea').blur(); } } }, icon('chev-down')));
}

function onInput() { updateGutter(); scheduleSave(); }

const ta0 = $('cdArea');
ta0.addEventListener('input', onInput);
ta0.addEventListener('scroll', () => { $('cdGutter').scrollTop = ta0.scrollTop; });
ta0.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); insert(indentUnit()); return; }
  if (e.key === 'Enter') {
    // Einrückung der Zeile übernehmen, nach ":" oder "{" eine Stufe mehr
    const v = ta0.value, s = ta0.selectionStart;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const line = v.slice(lineStart, s);
    let ind = (line.match(/^\s*/) || [''])[0];
    if (/[:{[(]\s*$/.test(line) && !(proj.lang === 'web' && tab === 'html')) ind += indentUnit();
    if (proj.lang === 'lua' && /\b(then|do|function\b.*\))\s*$/.test(line)) ind += indentUnit();
    e.preventDefault();
    insert('\n' + ind);
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
});

$('cdDone').addEventListener('click', closeCoder);
$('cdRun').addEventListener('click', () => run());
$('cdStop').addEventListener('click', stopRun);
$('cdFull').addEventListener('click', () => $('coder').classList.toggle('fullout'));
$('cdTitle').addEventListener('click', async () => {
  const t = await promptSheet('Projekt umbenennen', { value: proj.title });
  if (t) { proj.title = t; $('cdTitle').textContent = t; saveNow(); }
});
$('cdMore').addEventListener('click', (e) => menu(e.currentTarget, [
  { label: 'Schrift größer', icon: 'zoom-in', onClick: () => setFont(fontSize + 2) },
  { label: 'Schrift kleiner', icon: 'zoom-out', onClick: () => setFont(fontSize - 2) },
  { label: 'Umbenennen', icon: 'edit', onClick: () => $('cdTitle').click() },
  { label: 'Kopie anlegen', icon: 'plus', onClick: async () => {
    await saveNow();
    const { id, created, ...rest } = proj;
    const [c] = await db.putItems('code', [{ ...rest, title: proj.title + ' (Kopie)', updated: Date.now() }]);
    toast('Kopie angelegt'); openCoder(c, { onClose: onCloseCb });
  } },
  'sep',
  { label: 'Projekt löschen', icon: 'trash', danger: true, onClick: async () => {
    if (await confirmSheet(`„${proj.title}“ löschen?`, 'Das Projekt wird von diesem Gerät gelöscht.')) {
      await db.deleteItems('code', proj.id); clearTimeout(saveTimer); proj = null; stopRun();
      $('coder').hidden = true; document.body.classList.remove('coding'); toast('Gelöscht'); if (onCloseCb) onCloseCb();
    }
  } },
]));

// ---------- Ausgabe ----------
function clearOutput() {
  stopRun();
  $('cdOut').textContent = '';
  $('cdOut').append(h('p.outhint', { text: 'Tipp auf „Starten“, um dein Programm laufen zu lassen.' }));
}
function outLine(text, cls = '') {
  const o = $('cdOut');
  const hint = o.querySelector('.outhint'); if (hint) hint.remove();
  let pre = o.querySelector('pre.console');
  if (!pre) { pre = h('pre.console'); o.append(pre); }
  const span = h('span' + (cls ? '.' + cls : ''), { text });
  pre.append(span);
  o.scrollTop = o.scrollHeight;
}
let runToken = 0;
function stopRun() {
  runToken++;
  const f = $('cdOut').querySelector('iframe');
  if (f) f.remove();
  $('cdStop').hidden = true;
  $('cdRun').hidden = false;
}

async function run() {
  if (!proj) return;
  await saveNow();
  stopRun();
  const token = runToken;
  $('cdOut').textContent = '';
  if (proj.lang === 'web') return runWeb();
  $('cdRun').hidden = true; $('cdStop').hidden = false;
  try {
    if (proj.lang === 'python') await runPython(token);
    else await runLua(token);
  } finally {
    if (token === runToken) { $('cdStop').hidden = true; $('cdRun').hidden = false; }
  }
}

// Web: abgeschottete Vorschau. Konsole wird über postMessage angezeigt.
const BRIDGE = `<script>(function(){
  function send(level, args){ try { parent.postMessage({ __code: 1, level: level, text: Array.prototype.map.call(args, function(a){ try { return typeof a === 'string' ? a : JSON.stringify(a); } catch(e) { return String(a); } }).join(' ') }, '*'); } catch(e) {} }
  ['log','info','warn','error'].forEach(function(k){ var o = console[k]; console[k] = function(){ send(k, arguments); o && o.apply(console, arguments); }; });
  window.addEventListener('error', function(e){ var z = e.lineno - (window.__off || 0); send('error', [e.message + (z > 0 ? ' (Zeile ' + z + ' im JavaScript)' : '')]); });
})();<\/script>`;
function runWeb() {
  const esc = (s) => String(s || '').replace(/<\/script/gi, '<\\/script');
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${BRIDGE}<style>${proj.css || ''}</style></head><body>${proj.html || ''}<script>`;
  // Zeilennummer im Fehler soll zur Zeile im JavaScript-Reiter passen
  const off = head.split('\n').length - 1;
  const doc = head.replace('<script>(function(){', `<script>window.__off=${off};(function(){`) + `${esc(proj.js)}<\/script></body></html>`;
  const f = h('iframe.preview', { sandbox: 'allow-scripts allow-modals allow-pointer-lock', title: 'Vorschau' });
  f.srcdoc = doc;
  $('cdOut').append(f, h('pre.console.webcon'));
  $('cdStop').hidden = false;   // „Starten“ bleibt sichtbar: nach Änderungen neu starten
}
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || !d.__code || !proj) return;
  const pre = $('cdOut').querySelector('pre.webcon');
  if (!pre) return;
  pre.classList.add('has');
  pre.append(h('span' + (d.level === 'error' ? '.err' : d.level === 'warn' ? '.warn' : ''), { text: d.text + '\n' }));
  pre.scrollTop = pre.scrollHeight;
});

// Eingabe für input() / io.read(): eigenes Feld unter der Ausgabe
function askInput(promptText) {
  return new Promise((resolve) => {
    const o = $('cdOut');
    const field = h('input.field.ioin', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Eingabe, dann Enter' });
    const row = h('div.iorow', null, field, h('button.btn.primary', { text: 'OK', on: { click: () => done() } }));
    function done() { const v = field.value; row.remove(); outLine(v + '\n', 'in'); resolve(v); }
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    o.append(row);
    o.scrollTop = o.scrollHeight;
    setTimeout(() => field.focus(), 30);
  });
}

// ---------- Python (Pyodide) ----------
let pyP = null;
function loadPy() {
  if (!pyP) {
    pyP = (async () => {
      if (!window.loadPyodide) {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/pyodide/pyodide.js'; s.onload = res; s.onerror = () => rej(new Error('Python konnte nicht geladen werden')); document.head.append(s); });
      }
      return window.loadPyodide({ indexURL: new URL('vendor/pyodide/', document.baseURI).href });
    })();
    pyP.catch(() => { pyP = null; });
  }
  return pyP;
}
const PY_HINTS = [
  [/SyntaxError/, 'Schreibfehler im Code: oft fehlt ein Doppelpunkt, eine Klammer oder ein Anführungszeichen.'],
  [/IndentationError/, 'Die Einrückung stimmt nicht: Zeilen in einem Block brauchen gleich viele Leerzeichen.'],
  [/NameError/, 'Ein Name ist unbekannt: Tippfehler? Oder die Variable wurde noch nicht angelegt.'],
  [/TypeError/, 'Falscher Typ: Text und Zahl gemischt? Mit int(…) wird Text zur Zahl, mit str(…) zur Schrift.'],
  [/ValueError/, 'Ungültiger Wert: zum Beispiel int("abc") geht nicht.'],
  [/ZeroDivisionError/, 'Durch 0 teilen geht nicht.'],
  [/IndexError/, 'Die Liste ist kürzer als gedacht.'],
];
async function runPython(token) {
  if (isArtifact()) { outLine('Python geht nur in der eigenen App unter brastib.github.io/lernen-macht-spa-, nicht in dieser Testversion.\n', 'err'); return; }
  if (!pyP) outLine('Python wird geladen (nur beim ersten Mal, ca. 13 MB) …\n', 'sys');
  let py;
  try { py = await loadPy(); } catch (e) { outLine(e.message + '\n', 'err'); return; }
  if (token !== runToken) return;
  const dec = new TextDecoder();
  py.setStdout({ write: (buf) => { if (token === runToken) outLine(dec.decode(buf)); return buf.length; } });
  py.setStderr({ write: (buf) => { if (token === runToken) outLine(dec.decode(buf), 'err'); return buf.length; } });
  // input(): Python wartet, bis du im Feld Enter drückst (läuft über einen asynchronen Umweg)
  window.__codeInput = (p) => askInput(p);
  const src = proj.code || '';
  // input() durch eine wartende Variante ersetzen und alles in eine async-Funktion packen
  // Zeilennummern bleiben erhalten, weil der umgebaute Baum direkt übersetzt wird
  py.runPython(`
import ast
def _umbau(src):
    tree = ast.parse(src, "<exec>")
    asyncs = set()
    for _ in range(6):
        class _T(ast.NodeTransformer):
            def visit_Call(self, node):
                self.generic_visit(node)
                f = node.func
                if isinstance(f, ast.Name) and f.id == 'input':
                    return ast.Await(ast.Call(func=ast.Name('__ainput', ast.Load()), args=node.args, keywords=[]))
                if isinstance(f, ast.Name) and f.id in asyncs:
                    return ast.Await(node)
                return node
            def visit_Await(self, node):
                return node   # schon umgebaut
            def visit_FunctionDef(self, node):
                self.generic_visit(node)
                if any(isinstance(n, ast.Await) for n in ast.walk(node)):
                    asyncs.add(node.name)
                    return ast.copy_location(ast.AsyncFunctionDef(**{f: getattr(node, f) for f in node._fields}), node)
                return node
        n0 = len(asyncs)
        tree = _T().visit(tree)
        if len(asyncs) == n0 and _ > 0:
            break
    ast.fix_missing_locations(tree)
    return tree
async def __lauf(src):
    import inspect, builtins
    tree = _umbau(src)
    code = compile(tree, "<exec>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    g = {"__name__": "__main__", "__builtins__": builtins}
    builtins.__los()
    r = eval(code, g)
    if inspect.iscoroutine(r):
        await r
import builtins
builtins.__lauf = __lauf
`);
  py.runPython(`
import js, builtins, sys, time
__warte = [0.0]
async def __ainput(prompt=""):
    sys.stdout.write(str(prompt)); sys.stdout.flush()
    t = time.time()
    v = await js.__codeInput(str(prompt))
    __warte[0] += time.time() - t
    return str(v)
builtins.__ainput = __ainput
# Schutz gegen Endlosschleifen: nach 20 Sekunden Rechenzeit abbrechen
__start = [time.time()]
__n = [0]
class Zeitlimit(Exception):
    pass
def __wache(frame, event, arg):
    __n[0] += 1
    if __n[0] % 2000 == 0 and time.time() - __start[0] - __warte[0] > 20:
        sys.settrace(None)
        raise Zeitlimit("Programm lief über 20 Sekunden und wurde gestoppt (Endlosschleife?)")
    return __wache
def __los():
    __warte[0] = 0.0; __start[0] = time.time(); __n[0] = 0
    sys.settrace(__wache)
builtins.__los = __los
`);
  const t0 = performance.now();
  try {
    const lauf = py.globals.get('__lauf');
    try { await lauf(src); } finally { lauf.destroy(); }
    try { py.runPython('import sys; sys.settrace(None)'); } catch (er) { /* egal */ }
    if (token === runToken) outLine(`\n✓ Fertig (${((performance.now() - t0) / 1000).toFixed(1).replace('.', ',')} s)\n`, 'sys');
  } catch (e) {
    try { py.runPython('import sys; sys.settrace(None)'); } catch (er) { /* egal */ }
    if (token !== runToken) return;
    const msg = String(e.message || e);
    const lines = msg.trim().split('\n');
    const lastTb = lines.findIndex((l) => l.includes('File "<exec>"') && !/__wache|__ainput|__lauf|_umbau/.test(l));
    const shown = (lastTb >= 0 ? lines.slice(lastTb) : lines.slice(-3)).filter((l) => !/__wache|__ainput|__lauf|_umbau/.test(l));
    outLine(shown.join('\n').replace(/File "<exec>", line/g, 'Zeile').replace(/, in <module>/g, '') + '\n', 'err');
    const hint = PY_HINTS.find(([re]) => re.test(msg));
    if (hint) outLine('Tipp: ' + hint[1] + '\n', 'hint');
  }
}

// ---------- Lua (Fengari) ----------
let luaP = null;
function loadLua() {
  if (!luaP) {
    luaP = new Promise((res, rej) => {
      if (window.fengari) { res(window.fengari); return; }
      const s = document.createElement('script'); s.src = 'vendor/fengari-web.js';
      s.onload = () => res(window.fengari); s.onerror = () => rej(new Error('Lua konnte nicht geladen werden'));
      document.head.append(s);
    });
    luaP.catch(() => { luaP = null; });
  }
  return luaP;
}
async function runLua(token) {
  let F;
  try { F = await loadLua(); } catch (e) { outLine(e.message + '\n', 'err'); return; }
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = F;
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  // print und io.write in unsere Ausgabe
  const tostr = (i) => { const s = lauxlib.luaL_tolstring(L, i); lua.lua_pop(L, 1); return to_jsstring(s); };
  lua.lua_pushjsfunction(L, (Ls) => {
    const n = lua.lua_gettop(Ls); const parts = [];
    for (let i = 1; i <= n; i++) parts.push(tostr(i));
    if (token === runToken) outLine(parts.join('\t') + '\n');
    return 0;
  });
  lua.lua_setglobal(L, to_luastring('print'));
  // Lua kann nicht auf Eingaben warten, darum: Eingaben vorher abfragen, wenn io.read vorkommt
  const src = proj.code || '';
  const reads = (src.match(/io\.read|eingabe\s*\(/g) || []).length;
  const queue = [];
  if (reads) {
    outLine('Dein Programm fragt nach Eingaben. Gib sie hier nacheinander ein:\n', 'sys');
    for (let i = 0; i < Math.min(reads, 10); i++) { if (token !== runToken) return; queue.push(await askInput('')); }
  }
  lua.lua_pushjsfunction(L, (Ls) => { lua.lua_pushstring(Ls, to_luastring(queue.length ? queue.shift() : '')); return 1; });
  lua.lua_setglobal(L, to_luastring('__read'));
  lua.lua_pushjsfunction(L, (Ls) => {
    const n = lua.lua_gettop(Ls); const parts = [];
    for (let i = 1; i <= n; i++) parts.push(tostr(i));
    if (token === runToken) outLine(parts.join(''));
    return 0;
  });
  lua.lua_setglobal(L, to_luastring('__write'));
  const pre = 'io = io or {}; io.read = function() return __read() end; io.write = function(...) __write(...) end; eingabe = function(t) if t then __write(t) end return __read() end\n';
  // Schutz gegen Endlosschleifen: nach 10 Mio. Schritten abbrechen
  let steps = 0;
  lua.lua_sethook(L, () => { steps += 1; if (steps > 10000) { lauxlib.luaL_error(L, to_luastring('Programm lief zu lange und wurde gestoppt (Endlosschleife?)')); } }, lua.LUA_MASKCOUNT, 1000);
  const t0 = performance.now();
  let st = lauxlib.luaL_loadbuffer(L, to_luastring(pre), null, to_luastring('start'));
  if (st === lua.LUA_OK) st = lua.lua_pcall(L, 0, 0, 0);
  st = lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring('programm'));
  if (st === lua.LUA_OK) st = lua.lua_pcall(L, 0, 0, 0);
  if (st !== lua.LUA_OK) {
    outLine(to_jsstring(lua.lua_tostring(L, -1)).replace(/\[string "programm"\]:/g, 'Zeile ') + '\n', 'err');
  } else outLine(`\n✓ Fertig (${((performance.now() - t0) / 1000).toFixed(1).replace('.', ',')} s)\n`, 'sys');
}
