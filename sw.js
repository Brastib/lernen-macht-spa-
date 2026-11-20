// Offline-Speicher für die App selbst (nicht für deine Scans, die liegen in IndexedDB).
// Bei jeder neuen Version VERSION erhöhen.
const VERSION = 'v10';
const CACHE = 'lernapp-' + VERSION;
const FILES = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './js/scanner.js',
  './js/editor.js',
  './js/paper.js',
  './js/ui.js',
  './js/scan.js',
  './js/reader.js',
  './js/tools.js',
  './js/cards.js',
  './js/homework.js',
  './js/pdfio.js',
  './js/mathfn.js',
  './js/ocr.js',
  './js/code.js',
  './js/code-examples.js',
  './vendor/fengari-web.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lernapp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Speicher (schnell + offline), im Hintergrund aktualisieren.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => {
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
