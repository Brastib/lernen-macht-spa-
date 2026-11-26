// Offline-Speicher für die App selbst (nicht für deine Scans, die liegen in IndexedDB).
// Bei jeder neuen Version VERSION erhöhen.
const VERSION = 'v117';
const CACHE = 'lernapp-' + VERSION;
const CDN_KEEP = ['/npm/@huggingface/transformers@4.3.2/', '/npm/onnxruntime-web@'];
const FILES = [
  './',
  './index.html',
  './style.css',
  './design.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './js/scanner.js',
  './js/editor.js',
  './js/fcalc.js',
  './js/paper.js',
  './js/pen.js',
  './js/ui.js',
  './js/scan.js',
  './js/serial.js',
  './serial.css',
  './js/reader.js',
  './js/tools.js',
  './js/cards.js',
  './js/homework.js',
  './js/pdfio.js',
  './js/mathfn.js',
  './js/ocr.js',
  './js/code.js',
  './js/code-examples.js',
  './js/reminders.js',
  './js/game.js',
  './js/play.js',
  './js/school.js',
  './js/grades.js',
  './js/vplan.js',
  './js/sphsync.js',
  './js/messages.js',
  './js/dash.js',
  './js/plotter.js',
  './js/backup.js',
  './js/chem.js', './js/alkname.js', './js/alkane.js', './js/vocabscan.js', './js/vocabparse.js',
  './js/lab.js', './js/plan.js', './js/speech.js', './js/calc2.js', './js/markcards.js', './js/organize.js', './js/plane.js', './js/planeworld.js', './js/games.js', './js/profiles.js', './js/gpaint.js', './js/arena.js', './js/weapons.js', './js/quiz.js', './js/stack.js', './js/chess.js', './js/wall.js', './js/runner.js', './js/pgames.js', './js/sketch.js', './js/rtgames.js', './js/hsgames.js', './js/p4a.js', './js/tanks.js', './js/tankdata.js', './js/tankhub.js', './js/tankedit.js', './js/p4b.js', './js/p5.js', './js/p6a.js', './js/p6b.js', './js/p6c.js', './js/hub.js', './js/shipart.js', './js/p7a.js', './js/p7b.js', './js/p7c.js', './js/p7d.js', './js/p8.js', './js/p9.js', './js/gaps.js', './js/autocards.js', './js/localai.js', './js/visionai.js', './js/mathgen.js', './js/morework.js', './js/myhand.js', './js/bigboy.js', './js/bbdata.js', './js/bbnlu.js', './js/topics.js',
  './js/kit.js', './js/physik.js', './js/nav.js', './js/talk.js', './talk.css',
  './vendor/fengari-web.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lernapp-') && k !== CACHE && k !== 'lernapp-cdn').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Speicher (schnell + offline), im Hintergrund aktualisieren.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Bild-KI-Bibliothek (feste Versionen vom CDN) einmal speichern, danach offline
  if (req.method === 'GET' && url.hostname === 'cdn.jsdelivr.net' && CDN_KEEP.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(caches.open('lernapp-cdn').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Erinnerung für den iPad-Kalender: die App legt die .ics-Datei in die Adresse, wir liefern sie als echte Kalenderdatei aus
  if (url.pathname.includes('/kalender/') && url.searchParams.get('d')) {
    try {
      const b = url.searchParams.get('d').replace(/-/g, '+').replace(/_/g, '/');
      const text = decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))));
      e.respondWith(new Response(text, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="erinnerung.ics"' } }));
    } catch (er) { e.respondWith(new Response('Kalenderdatei kaputt', { status: 400 })); }
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      const res = await fresh;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('Offline', { status: 503 });
    })
  );
});

// Tippen auf eine Mitteilung: App nach vorne holen
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
