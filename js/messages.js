// Nachrichten aus dem Schulportal Hessen lesen und schreiben (über den eigenen Worker, siehe vplan.js).
// Gesendet wird NUR nach Tippen auf „Senden …“ UND der Bestätigung, an wen es geht.
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

// Anfrage an den Worker (für Suche und Senden)
async function worker(path, { body = null, timeout = 45000 } = {}) {
  const cfg = await vplanCfg();
  if (!cfg || !cfg.url) throw new Error('Schulportal noch nicht verbunden.');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(cfg.url.replace(/\/+$/, '') + path, body ? { method: 'POST', headers: { 'X-App-Key': cfg.key || '', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store' }
      : { headers: { 'X-App-Key': cfg.key || '' }, signal: ctl.signal, cache: 'no-store' });
  } catch (e) { throw new Error(navigator.onLine === false ? 'Kein Internet.' : 'Worker nicht erreichbar.' + (body ? ' Ob die Nachricht angekommen ist, ist unklar. Bitte im Schulportal nachsehen, bevor du es nochmal versuchst.' : '')); }
  finally { clearTimeout(t); }
  let j = null; try { j = await res.json(); } catch (e) { /* unten */ }
  const old = res.status === 404 || (res.status === 405 && j && /^Nur GET/.test(j.message || '')) || (j && j.ok && path.startsWith('/nachrichten/suche') && !Array.isArray(j.items));
  if (old) throw new Error('Der Worker kann das noch nicht. Bitte den Worker-Code bei Cloudflare neu einfügen.');
  if (!j) throw new Error(`Worker hat keine lesbare Antwort geschickt (Status ${res.status}).`);
  if (!j.ok) throw new Error(j.message || 'Fehler im Worker.');
  return j;
}

// „Müller, Hans“ → „Hans Müller“
const niceName = (n) => { const m = /^([^,]+),\s*(.+)$/.exec(n || ''); return m ? `${m[2]} ${m[1]}` : (n || ''); };

function openPortal() {
  const a = h('a', { href: PORTAL, target: '_blank', rel: 'noopener' });
  document.body.append(a); a.click(); a.remove();
}

// Wem geht die Antwort zu? Als Satz für die Bestätigung.
function replyTarget(c) {
  if (c.replyMode === 'absender') return { short: `nur an ${niceName(c.replyName || c.sender)}`, long: `Nur ${niceName(c.replyName || c.sender)} bekommt deine Antwort (das ist eine „Mitteilung“, die anderen sehen sie nicht).` };
  const st = c.stats || {};
  const parts = [st.schueler ? `${st.schueler} Schüler` : '', st.lehrer ? `${st.lehrer} ${st.lehrer === 1 ? 'Lehrkraft' : 'Lehrkräfte'}` : '', st.eltern ? `${st.eltern} Eltern` : ''].filter(Boolean);
  return { short: 'an alle in diesem Gespräch', long: `ALLE in diesem Gespräch sehen deine Antwort${parts.length ? ' (' + parts.join(', ') + ' und der Absender)' : ''}.` };
}

// Letzte Sicherheitsfrage vor dem Senden. Gibt true nur bei „Ja, senden“.
function confirmSend({ to, toLong, subject, text }) {
  return sheet('Wirklich senden?', (body, close) => {
    body.append(
      h('div.msgconfirm', null,
        h('p', null, h('small', { text: 'An' }), h('b', { text: to })),
        toLong ? h('p.calm.small', { text: toLong }) : '',
        subject ? h('p', null, h('small', { text: 'Betreff' }), h('span', { text: subject })) : '',
        h('p', null, h('small', { text: 'Text' })),
        h('div.msgbubble.own', null, h('p', { text })),
        h('p.calm.small', { text: 'Die Nachricht geht über das Schulportal raus und lässt sich danach nicht zurückholen.' })),
      h('div.dlgactions', null,
        h('button.btn', { text: 'Abbrechen', on: { click: () => close(false) } }),
        h('button.btn.primary', { text: 'Ja, senden', on: { click: () => close(true) } })));
  });
}

function showConversation(c, onSent) {
  return sheet(c.subject || 'Nachricht', (body, close) => {
    body.append(h('p.calm.small', { text: [niceName(c.sender) || 'Unbekannt', c.date, c.kind].filter(Boolean).join(' · ') }));
    const chat = h('div.msgchat');
    if (!c.messages) chat.append(h('p.calm', { text: 'Den Inhalt konnte der Worker nicht laden. Öffne die Nachricht im Schulportal.' }));
    const bubble = (m) => h('div.msgbubble' + (m.own ? '.own' : ''), null,
      h('small', { text: [m.own ? 'Du' : niceName(m.from) || niceName(c.sender), m.date].filter(Boolean).join(' · ') }),
      h('p', { text: m.text || '–' }));
    for (const m of c.messages || []) chat.append(bubble(m));
    body.append(chat);
    setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 30);

    const portalBtn = h('button.btn', { text: 'Im Schulportal öffnen', on: { click: openPortal } });
    if (!c.replyMode) {
      body.append(h('p.calm.small', { text: c.messages ? 'Antworten in der App: Bitte den Worker-Code bei Cloudflare neu einfügen, dann „Aktualisieren“.' : '' }),
        h('div.dlgactions', null, portalBtn, h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } })));
      return;
    }
    if (c.canReply === false) {
      body.append(h('p.calm.small', { text: 'Auf diesen Hinweis kann man nicht antworten.' }),
        h('div.dlgactions', null, portalBtn, h('button.btn.primary', { text: 'OK', on: { click: () => close(null) } })));
      return;
    }
    const target = replyTarget(c);
    const ta = h('textarea.field.msginput', { rows: 3, placeholder: 'Antwort schreiben …', 'aria-label': 'Antwort' });
    const sendBtn = h('button.btn.primary', { text: 'Senden …' });
    sendBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) { toast('Schreib zuerst etwas.'); ta.focus(); return; }
      if (!(await confirmSend({ to: c.replyMode === 'absender' ? niceName(c.replyName || c.sender) : `Alle im Gespräch „${c.subject || 'ohne Betreff'}“`, toLong: target.long, text }))) return;
      sendBtn.disabled = true; sendBtn.textContent = 'Sendet …';
      try {
        await worker('/nachrichten/antworten', { body: { id: c.id, text, an: c.replyMode, bestaetigt: true } });
        const m = { own: true, from: '', date: 'gerade eben', text };
        c.messages = [...(c.messages || []), m]; chat.append(bubble(m)); chat.scrollTop = chat.scrollHeight;
        ta.value = ''; toast('Gesendet ✓');
        if (onSent) onSent();
      } catch (e) { toast(e.message, 6000); }
      sendBtn.disabled = false; sendBtn.textContent = 'Senden …';
    });
    body.append(
      h('p.calm.small.msgto', { text: 'Antwort geht ' + target.short + '.' }),
      ta,
      h('div.dlgactions', null, portalBtn, h('button.btn', { text: 'Schließen', on: { click: () => close(null) } }), sendBtn));
  }, { wide: true });
}

// Neue Nachricht: Empfänger suchen (im Schulportal), Betreff, Text
function newMessage(onSent) {
  return sheet('Neue Nachricht', (body, close) => {
    const chosen = [];
    const chips = h('div.msgchips');
    const results = h('div.msgresults');
    const q = h('input.field', { type: 'search', placeholder: 'Lehrkraft suchen (mind. 2 Buchstaben)', 'aria-label': 'Empfänger suchen', autocomplete: 'off' });
    const subj = h('input.field', { type: 'text', placeholder: 'Betreff', 'aria-label': 'Betreff', maxlength: 200 });
    const ta = h('textarea.field.msginput', { rows: 5, placeholder: 'Deine Nachricht …', 'aria-label': 'Text' });
    const drawChips = () => {
      chips.textContent = '';
      if (!chosen.length) chips.append(h('span.calm.small', { text: 'Noch kein Empfänger.' }));
      for (const r of chosen) chips.append(h('span.msgchip', null, h('span', { text: niceName(r.name) }),
        h('button.icbtn', { 'aria-label': 'Entfernen', on: { click: () => { chosen.splice(chosen.indexOf(r), 1); drawChips(); } } }, icon('close'))));
    };
    let timer = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      const v = q.value.trim();
      if (v.length < 2) { results.textContent = ''; return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        results.textContent = ''; results.append(h('p.calm.small', { text: 'Sucht …' }));
        try {
          const j = await worker('/nachrichten/suche?q=' + encodeURIComponent(v), { timeout: 20000 });
          if (my !== seq) return;
          results.textContent = '';
          if (!j.items.length) results.append(h('p.calm.small', { text: 'Niemand gefunden.' }));
          for (const it of j.items.slice(0, 12)) {
            const label = it.type === 'lul' ? 'Lehrkraft' : it.type === 'sus' ? 'Schüler' : it.type || '';
            results.append(h('button.msgresult', { on: { click: () => {
              if (!chosen.some((x) => x.id === it.id)) { if (chosen.length >= 10) { toast('Höchstens 10 Empfänger.'); return; } chosen.push(it); }
              drawChips(); q.value = ''; results.textContent = ''; q.focus();
            } } }, h('b', { text: niceName(it.name) }), label ? h('small', { text: label }) : ''));
          }
        } catch (e) { if (my === seq) { results.textContent = ''; results.append(h('p.calm.small', { text: e.message })); } }
      }, 350);
    });
    drawChips();
    const sendBtn = h('button.btn.primary', { text: 'Senden …' });
    sendBtn.addEventListener('click', async () => {
      const subject = subj.value.trim(), text = ta.value.trim();
      if (!chosen.length) { toast('Wähle zuerst, an wen.'); q.focus(); return; }
      if (!subject) { toast('Der Betreff fehlt.'); subj.focus(); return; }
      if (!text) { toast('Der Text fehlt.'); ta.focus(); return; }
      const names = chosen.map((r) => niceName(r.name)).join(', ');
      if (!(await confirmSend({ to: names, toLong: chosen.length > 1 ? `${chosen.length} Empfänger bekommen diese Nachricht.` : '', subject, text }))) return;
      sendBtn.disabled = true; sendBtn.textContent = 'Sendet …';
      try {
        await worker('/nachrichten/neu', { body: { an: chosen.map((r) => ({ id: r.id, name: r.name })), betreff: subject, text, bestaetigt: true } });
        toast('Gesendet ✓'); close(true); if (onSent) onSent();
      } catch (e) { toast(e.message, 6000); sendBtn.disabled = false; sendBtn.textContent = 'Senden …'; }
    });
    body.append(
      h('label.msglabel', { text: 'An' }), chips, q, results,
      h('label.msglabel', { text: 'Betreff' }), subj,
      h('label.msglabel', { text: 'Text' }), ta,
      h('div.dlgactions', null, h('button.btn', { text: 'Abbrechen', on: { click: () => close(null) } }), sendBtn));
  }, { wide: true });
}

export async function renderMessages(ctx) {
  const again = () => renderMessages(ctx);
  const cfg = await vplanCfg();
  ctx.setHeader({
    back: { label: 'Bibliothek', go: () => ctx.go({ view: 'library' }) },
    eyebrow: 'Schulportal', title: 'Nachrichten',
    meta: 'Lesen und schreiben',
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
      showConversation(c, () => refreshMessages({ fresh: true }));
    } } },
      h('span.msgdot'),
      h('span.msgtext', null,
        h('b', { text: c.subject || '(ohne Betreff)' }),
        h('small', { text: [niceName(c.sender), c.date].filter(Boolean).join(' · ') }),
        last ? h('span.msgprev', { text: last.text.slice(0, 140) }) : null)));
  }
  view.append(h('div.dlgactions.left', null,
      h('button.btn.primary', { text: 'Neue Nachricht', on: { click: () => newMessage(async () => { await refreshMessages({ fresh: true }); if (list.isConnected) again(); }) } }),
      h('button.btn', { text: 'Im Schulportal öffnen', on: { click: openPortal } })),
    h('p.calm.small', { text: 'Hinweis: Wenn die App eine Nachricht lädt, kann das Schulportal sie als gelesen markieren.' }));
  // Beim Öffnen nachladen, wenn älter als 5 Minuten
  if (!rec || Date.now() - Math.max(rec.at || 0, rec.errorAt || 0) > 5 * 60000) {
    const r = await refreshMessages();
    if (list.isConnected) { if (r.error && !(r.data)) toast(r.error, 4500); again(); }
  }
}
