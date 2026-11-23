// Nachrichten aus dem Schulportal Hessen lesen (über den eigenen Worker, siehe vplan.js).
// Ehrlich: Schreiben/Antworten geht hier noch NICHT. Dafür gibt es einen Knopf, der das Schulportal öffnet.
import * as db from './db.js';
import { $, h, icon, toast, sheet } from './ui.js';
import { vplanCfg, vplanSetup, ageText } from './vplan.js';

const KEY = 'sphmsgs';
const PORTAL = 'https://start.schulportal.hessen.de/nachrichten.php';

export async function messagesCached() { return db.getMeta(KEY); }
export async function unreadCount() { const r = await messagesCached(); return r && r.data ? r.data.conversations.filter((c) => c.unread).length : 0; }

let running = null;
export function refreshMessages({ fresh = false } = {}) {
  if (running) return running;
  running = (async () => {
    const cfg = await vplanCfg();
    if (!cfg || !cfg.url) return { error: 'Schulportal noch nicht verbunden.' };
    const old = await messagesCached();
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
      let res;
      try { res = await fetch(cfg.url.replace(/\/+$/, '') + '/nachrichten' + (fresh ? '?frisch=1' : ''), { headers: { 'X-App-Key': cfg.key || '' }, signal: ctl.signal, cache: 'no-store' }); }
      catch (e) { throw new Error(navigator.onLine === false ? 'Kein Internet.' : 'Worker nicht erreichbar.'); }
      finally { clearTimeout(t); }
      let j = null; try { j = await res.json(); } catch (e) { /* unten */ }
      if (!j) throw new Error(`Worker hat keine lesbare Antwort geschickt (Status ${res.status}).`);
      if (!j.ok) throw new Error(j.message || 'Fehler im Worker.');
      if (!Array.isArray(j.conversations)) throw new Error('Der Worker kann noch keine Nachrichten. Bitte den Worker-Code bei Cloudflare neu einfügen (Anleitung).');
      const rec = { id: KEY, at: Date.now(), data: j, error: null };
      await db.putItems('meta', rec);
      return rec;
    } catch (e) {
      const rec = { ...(old || { id: KEY, at: 0, data: null }), error: e.message, errorAt: Date.now() };
      await db.putItems('meta', rec);
      return rec;
    }
  })().finally(() => { running = null; });
  return running;
}

// „Müller, Hans“ → „Hans Müller“
const niceName = (n) => { const m = /^([^,]+),\s*(.+)$/.exec(n || ''); return m ? `${m[2]} ${m[1]}` : (n || ''); };

function openPortal() {
  const a = h('a', { href: PORTAL, target: '_blank', rel: 'noopener' });
  document.body.append(a); a.click(); a.remove();
}

function showConversation(c) {
  return sheet(c.subject || 'Nachricht', (body, close) => {
    body.append(h('p.calm.small', { text: [niceName(c.sender) || 'Unbekannt', c.date].filter(Boolean).join(' · ') }));
    const chat = h('div.msgchat');
    if (!c.messages) chat.append(h('p.calm', { text: 'Den Inhalt konnte der Worker nicht laden. Öffne die Nachricht im Schulportal.' }));
    for (const m of c.messages || []) {
      chat.append(h('div.msgbubble' + (m.own ? '.own' : ''), null,
        h('small', { text: [m.own ? 'Du' : niceName(m.from) || niceName(c.sender), m.date].filter(Boolean).join(' · ') }),
        h('p', { text: m.text || '–' })));
    }
    body.append(chat,
      h('p.calm.small', { text: 'Antworten geht in der App noch nicht. Tipp auf „Im Schulportal antworten“, dann öffnet sich das Schulportal.' }),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Im Schulportal antworten', on: { click: () => { openPortal(); } } }),
        h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } })));
  }, { wide: true });
}

export async function renderMessages(ctx) {
  const again = () => renderMessages(ctx);
  const cfg = await vplanCfg();
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Schulportal', title: 'Nachrichten',
    meta: 'Nur lesen',
    actions: [ctx.btn('Aktualisieren', 'restore', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const r = await refreshMessages({ fresh: true });
      if (r.error) toast(r.error, 4500);
      if ($('view').querySelector('.msglist')) again();
    })],
  });
  const view = $('view');
  view.textContent = '';
  if (!cfg || !cfg.url) {
    view.append(h('p.calm', { text: 'Verbinde zuerst das Schulportal (über deinen Worker).' }),
      h('button.btn.primary', { text: 'Schulportal verbinden', on: { click: () => vplanSetup(again) } }));
    return;
  }
  const rec = await messagesCached();
  const list = h('div.msglist');
  view.append(h('p.calm.small', { text: (rec && rec.at ? `Stand ${ageText(rec.at)}` : 'Noch nicht geladen') + (rec && rec.error ? ` · ${rec.error}` : '') }), list);
  const convs = (rec && rec.data && rec.data.conversations) || [];
  if (!convs.length) list.append(h('p.calm', { text: rec && rec.data ? 'Keine Nachrichten.' : 'Lädt …' }));
  for (const c of convs) {
    const last = c.messages && c.messages[c.messages.length - 1];
    list.append(h('button.msgrow' + (c.unread ? '.unread' : ''), { on: { click: async (e) => {
      const row = e.currentTarget;
      if (c.unread) { c.unread = false; row.classList.remove('unread'); await db.putItems('meta', rec); }   // in der App als gelesen merken
      showConversation(c);
    } } },
      h('span.msgdot'),
      h('span.msgtext', null,
        h('b', { text: c.subject || '(ohne Betreff)' }),
        h('small', { text: [niceName(c.sender), c.date].filter(Boolean).join(' · ') }),
        last ? h('span.msgprev', { text: last.text.slice(0, 140) }) : null)));
  }
  view.append(h('div.dlgactions.left', null, h('button.btn', { text: 'Neue Nachricht im Schulportal schreiben', on: { click: openPortal } })),
    h('p.calm.small', { text: 'Hinweis: Wenn die App eine Nachricht lädt, kann das Schulportal sie als gelesen markieren.' }));
  // Beim Öffnen nachladen, wenn älter als 5 Minuten
  if (!rec || Date.now() - Math.max(rec.at || 0, rec.errorAt || 0) > 5 * 60000) {
    const r = await refreshMessages();
    if (list.isConnected) { if (r.error && !(r.data)) toast(r.error, 4500); again(); }
  }
}
