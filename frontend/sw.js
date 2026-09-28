/* XE3AGLE service worker — offline shell cache */
const CACHE = 'xe3agle-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/login.html',
  '/reset.html',
  '/css/app.css',
  '/js/app.js',
  '/js/domain/constants.js',
  '/js/domain/risk.js',
  '/js/domain/state.js',
  '/js/ui/money.js',
  '/js/domain/stats.js',
  '/js/services/api.js',
  '/js/services/sync.js',
  '/js/workflow/trade.js',
  '/js/ui/toast.js',
  '/js/ui/icons.js',
  '/js/ui/pages.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-first for API
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }
  // Cache-first for static
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone));
      return res;
    }).catch(() => cached))
  );
});
