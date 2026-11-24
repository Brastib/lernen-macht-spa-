// Kleine Bausteine für die Oberfläche: Hinweise, Dialoge, Menüs, Symbole.
export const $ = (id) => document.getElementById(id);

export function busy(on, text = 'Wird bearbeitet …') {
  $('busyText').textContent = text;
  $('busy').hidden = !on;
}

let toastTimer;
export function toast(msg, ms = 2400) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), ms);
}

export const kb = (b) => (b / 1024).toFixed(0) + ' KB';
export function fmtBytes(b) {
  if (b > 1e9) return (b / 1e9).toFixed(1).replace('.', ',') + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1).replace('.', ',') + ' MB';
  return kb(b);
}
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Element bauen: h('div.klasse', {attr}, kinder...)
export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), sv);
      else if (k === 'text') el.textContent = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export function icon(name, cls = 'ic') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls);
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
}

// ---------- Dialog (eigenes Fenster statt Browser-Popup) ----------
// build(body, close) füllt den Inhalt. Ergebnis kommt über close(wert).
export function sheet(title, build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const scrim = h('div.dlgscrim');
    const box = h('div.dlg' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const body = h('div.dlgbody');
    let closed = false;
    const close = (v) => {
      if (closed) return; closed = true;
      scrim.classList.add('out');
      setTimeout(() => scrim.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    box.append(
      h('div.dlghead', null,
        h('h3', { text: title }),
        h('button.icbtn', { 'aria-label': 'Schließen', on: { click: () => close(null) } }, icon('close'))),
      body);
    scrim.append(box);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(scrim);
    build(body, close);
    const first = body.querySelector('input');
    if (first) setTimeout(() => first.focus(), 60);
  });
}

// Ja/Nein-Abfrage im eigenen Dialog
export function confirmSheet(title, text, okLabel = 'Löschen', danger = true) {
  return sheet(title, (body, close) => {
    body.append(
      h('p.dlgtext', { text }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(false) } }),
        h('button.btn' + (danger ? '.dangerfill' : '.primary'), { text: okLabel, on: { click: () => close(true) } })));
  });
}

// Texteingabe
export function promptSheet(title, { label = 'Name', value = '', placeholder = '', ok = 'Sichern' } = {}) {
  return sheet(title, (body, close) => {
    const input = h('input.field', { type: 'text', value, placeholder, autocomplete: 'off', id: 'promptField' });
    const submit = () => { const v = input.value.trim(); if (v) close(v); else input.focus(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    body.append(
      h('label.fieldlabel', { for: 'promptField', text: label }), input,
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }),
        h('button.btn.primary', { text: ok, on: { click: submit } })));
  });
}

// ---------- Aufklapp-Menü ----------
// items: [{ label, icon, danger, onClick }] oder 'sep'
export function menu(anchor, items) {
  closeMenus();
  const m = h('div.menu', { role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { m.append(h('div.menusep')); continue; }
    m.append(h('button.menuitem' + (it.danger ? '.danger' : ''), {
      role: 'menuitem',
      on: { click: (e) => { e.stopPropagation(); closeMenus(); it.onClick(); } },
    }, it.icon ? icon(it.icon) : null, h('span', { text: it.label })));
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hgt = m.offsetHeight;
  let left = Math.min(r.right - w, window.innerWidth - w - 12);
  left = Math.max(12, left);
  let top = r.bottom + 8;
  if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 8);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  function outside(e) { if (!m.contains(e.target)) { closeMenus(); } }
  m._outside = outside;
}
export function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => {
    document.removeEventListener('pointerdown', m._outside, true);
    m.remove();
  });
}

// ---------- Datei speichern / teilen ----------
export async function saveFile(name, blob, type = 'application/json') {
  // Im Claude-Artefakt: Speichern über die Plattform. Als eigene Web-App: Teilen-Menü oder Download.
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); return true; } catch (e) {
      if (e && e.code === 'declined') return false;
      throw new Error('Speichern ist hier nicht möglich (' + (e && e.code || 'Fehler') + ').');
    }
  }
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}


// Datei ist fertig: eigener Knopf zum Teilen (Safari erlaubt Teilen nur direkt nach einem Tipp)
export function shareReady(title, name, blob, { type = 'application/pdf', hint = 'Im Teilen-Menü kannst du die Datei per Mail, AirDrop oder Teams schicken oder „In Dateien sichern“ wählen.', button = 'Teilen' } = {}) {
  return sheet(title, (body, close) => {
    body.append(
      h('div.bkready', null, h('b', { text: name }), h('small', { text: fmtBytes(blob.size) })),
      h('p.calm.small', { text: hint }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(false) } }),
        h('button.btn.primary', { on: { click: async () => { try { if (await saveFile(name, blob, type)) close(true); } catch (e) { toast(e.message, 5000); } } } }, icon('share'), h('span', { text: button }))));
  });
}

// ---------- Scroll-Sperre ----------
// Solange eine Vollbild-Ansicht (Editor, Leser, Scan …) offen ist, bleibt die Bibliothek dahinter stehen.
// Sonst scrollt sie auf dem iPad mit, und man sieht sie oben durchschimmern.
(function scrollLock() {
  let locked = false, y = 0;
  const update = () => {
    const open = [...document.querySelectorAll('section.screen')].some((s) => !s.hidden);
    if (open === locked) return;
    locked = open;
    const root = document.documentElement, body = document.body;
    if (open) {
      y = window.scrollY || root.scrollTop || 0;
      body.style.top = `-${y}px`;
      root.classList.add('scrlock');
    } else {
      root.classList.remove('scrlock');
      body.style.top = '';
      window.scrollTo(0, y);
    }
  };
  const start = () => {
    const mo = new MutationObserver(update);
    document.querySelectorAll('section.screen').forEach((s) => mo.observe(s, { attributes: true, attributeFilter: ['hidden'] }));
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// ---------- Zoom-Leiste (Editor und Leser) ----------
// Große, gut lesbare Knöpfe: −, Prozent (öffnet Feinregler), +, dazu optionale Extra-Knöpfe.
// opts: { min, max, get(), set(z, live) – live=true während der Regler gezogen wird,
//         presets: [[z, 'Text'], …], extras: [{ icon, label, title, act() }] }
export function zoomBar(opts) {
  const pct = h('button.zpct', { type: 'button', title: 'Zoom genau einstellen', 'aria-label': 'Zoomstufe' });
  const btn = (ic, label, fn, title) => h('button.zbtn', { type: 'button', 'aria-label': label, title: title || label, on: { click: (e) => { e.stopPropagation(); fn(); } } }, icon(ic));
  const bar = h('div.zbar', { on: { pointerdown: (e) => e.stopPropagation() } },
    btn('zoom-out', 'Verkleinern', () => opts.set(opts.get() / 1.25)),
    pct,
    btn('zoom-in', 'Vergrößern', () => opts.set(opts.get() * 1.25)),
  );
  const extra = {};
  if (opts.extras && opts.extras.length) {
    bar.append(h('span.zsep'));
    for (const x of opts.extras) { extra[x.key] = btn(x.icon, x.label, x.act, x.title); bar.append(extra[x.key]); }
  }
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); } };
  const outside = (e) => { if (pop && !pop.contains(e.target) && e.target !== pct && !pct.contains(e.target)) closePop(); };
  pct.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop) { closePop(); return; }
    const lg = (z) => Math.log(z), un = (v) => Math.exp(v);
    const range = h('input.zrange', { type: 'range', min: String(lg(opts.min)), max: String(lg(opts.max)), step: '0.001', value: String(lg(opts.get())), 'aria-label': 'Zoomstufe' });
    const out = h('b.zval');
    const show = () => { out.textContent = Math.round(un(+range.value) * 100) + ' %'; };
    show();
    range.addEventListener('input', () => { show(); opts.set(un(+range.value), true); });
    range.addEventListener('change', () => { opts.set(un(+range.value), false); });
    const chips = h('div.zchips', null, (opts.presets || []).map(([z, t]) => h('button.zchip', { type: 'button', on: { click: () => { opts.set(z); range.value = String(lg(opts.get())); show(); } } }, t)));
    pop = h('div.zpop', { on: { pointerdown: (ev) => ev.stopPropagation() } },
      h('div.zpophead', null, h('span', { text: 'Zoom' }), out),
      h('div.zslide', null, h('small', { text: Math.round(opts.min * 100) + ' %' }), range, h('small', { text: Math.round(opts.max * 100) + ' %' })),
      chips);
    bar.append(pop);
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  });
  return {
    el: bar, extra, closePop,
    update(z) { pct.textContent = Math.round(z * 100) + ' %'; },
  };
}

// ---------- iPad: keine Lupe / Textauswahl beim Gedrückthalten ----------
// Nur Eingabefelder und Bereiche, die ausdrücklich markierbar sind (CSS user-select: text), dürfen markieren.
(function noLoupe() {
  const elOf = (t) => (t && t.nodeType === 1 ? t : t && t.parentElement);
  const selectable = (t) => {
    const e = elOf(t);
    if (!e) return false;
    if (e.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    const us = getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect;
    return us === 'text';
  };
  document.addEventListener('selectstart', (e) => { if (!selectable(e.target)) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (!selectable(e.target)) e.preventDefault(); });
  // Langes Drücken auf Bildern/Zeichenflächen: iOS-Vorschau und Lupe nicht starten
  document.addEventListener('dragstart', (e) => { const el = elOf(e.target); if (el && el.closest('img, canvas, svg')) e.preventDefault(); });
})();
