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
